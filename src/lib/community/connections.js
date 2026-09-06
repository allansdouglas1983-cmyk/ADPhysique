/**
 * Connections: the mutual, accepted tie between two people (discovery
 * blueprint section 1; SD-20, SD-25, SD-32).
 *
 * Three tiers, and this module owns the middle one. Follow is one-way and
 * lives in `profile.js`. Connect is mutual and accepted: a request that
 * may carry up to two reasons from a fixed set and a short note, which the
 * recipient accepts or declines. Message (in `messages.js`) is available
 * only once that tie exists, which is the whole point of the tier: the
 * connection IS the consent gate messaging needs (SD-21).
 *
 * The refusals belong to the server and are simply carried here as codes:
 * `connect_not_allowed` (the recipient's `connect_from` setting says no),
 * `minor_restricted` (under-18 accounts never connect, SD-32),
 * `not_allowed` (a declined or withdrawn request inside its 30 day cool
 * off), `blocked`, `rate_limited`. A client check would only ever be a
 * convenience; nothing here decides who may connect to whom.
 *
 * Declining is SILENT by design. The requester keeps seeing "Requested"
 * and is never told they were refused, so a decline costs the person
 * declining nothing socially.
 */

import { callCommunity, CommunityError } from './transport';
import { cleanOptionalText } from './validation';
import { TP_DAYS, TP_TIME_BANDS } from './trainingProfile';

export const DEFAULT_PAGE_SIZE = 30;

/**
 * The four reasons a request may carry, in the wording the sheet shows.
 * A closed set on purpose: free text is the note, and a fixed reason is
 * something the recipient can read at a glance and trust.
 */
export const CONNECT_REASONS = Object.freeze({
  same_gym: 'Same gym',
  same_programme: 'Same programme',
  train_like_me: 'You train like me',
  train_together: 'Want to train together?',
});

export const CONNECT_REASON_KEYS = Object.freeze(Object.keys(CONNECT_REASONS));

/** At most two, so the request stays a sentence rather than a form. */
export const MAX_CONNECT_REASONS = 2;

/** 120 characters: enough for "we train at the same time on Tuesdays",
 * short enough that it can never become a message channel that skips the
 * connection gate. */
export const CONNECT_NOTE_MAX = 120;

/** Who may send me a connection request. One control, three answers. */
export const CONNECT_FROM_VALUES = Object.freeze({
  anyone: 'Anyone',
  followers: 'People who follow me',
  nobody: 'Nobody',
});

/** The four states a profile card can be in with respect to the viewer. */
export const CONNECTION_STATES = Object.freeze([
  'none', 'requested_by_me', 'requested_by_them', 'connected',
]);

const CONNECTION_STATE_SET = new Set(CONNECTION_STATES);

/**
 * The state to render a Connect button in.
 *
 * `_community_profile_card` carries `connection`; anything else (an old
 * cached card, a card from a surface that does not include it) is read as
 * `none`, which offers Connect rather than claiming a tie that may not
 * exist.
 *
 * @param {object|null} card a profile card
 * @returns {'none'|'requested_by_me'|'requested_by_them'|'connected'}
 */
export function connectionState(card) {
  const value = card?.connection ?? card?.card?.connection ?? null;
  return CONNECTION_STATE_SET.has(value) ? value : 'none';
}

/** The button word for each state (blueprint section 10). */
export const CONNECT_BUTTON_LABELS = Object.freeze({
  none: 'Connect',
  requested_by_me: 'Requested',
  requested_by_them: 'Respond',
  connected: 'Connected',
});

/** Known keys only, order preserved, duplicates dropped, capped at two. */
export function cleanReasons(reasons) {
  if (!Array.isArray(reasons)) return [];
  const seen = new Set();
  const out = [];
  for (const key of reasons) {
    if (typeof key !== 'string' || !CONNECT_REASONS[key] || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
    if (out.length >= MAX_CONNECT_REASONS) break;
  }
  return out;
}

/**
 * Training partner preferences (SD-25). Closed sets only: the days and
 * time bands are the same closed sets the training profile uses, so a
 * preference can never carry free text or a precise time.
 *
 * @param {object|null} prefs
 * @returns {object|null}
 */
export function cleanPartnerPrefs(prefs) {
  if (!prefs || typeof prefs !== 'object' || Array.isArray(prefs)) return null;
  const days = (Array.isArray(prefs.days) ? prefs.days : []).filter((k) => !!TP_DAYS[k]);
  const timeBands = (Array.isArray(prefs.time_bands) ? prefs.time_bands : [])
    .filter((k) => !!TP_TIME_BANDS[k]);
  return {
    days: [...new Set(days)],
    time_bands: [...new Set(timeBands)],
    same_gym_only: !!prefs.same_gym_only,
  };
}

/**
 * Send a connection request.
 *
 * @param {string} targetUserId
 * @param {{reasons?: string[], note?: string|null}} [context]
 * @returns {Promise<object>} the updated profile card
 * @throws {CommunityError} 'invalid_input' for a missing target or a note
 *   that will not clean, 'content_not_allowed' for a filtered note, plus
 *   every refusal the server raises.
 */
export async function connect(targetUserId, { reasons = [], note = null } = {}) {
  if (!targetUserId) throw new CommunityError('invalid_input');
  const cleaned = cleanOptionalText(note, CONNECT_NOTE_MAX);
  if (!cleaned.ok) {
    throw new CommunityError(
      cleaned.reason === 'content_not_allowed' ? 'content_not_allowed' : 'invalid_input',
    );
  }
  return callCommunity('community_connect', {
    _target: targetUserId,
    _reasons: cleanReasons(reasons),
    _note: cleaned.value,
  });
}

/**
 * Accept or decline a request. Accepting makes both people follow each
 * other, even across followers-only profiles; declining is silent.
 */
export async function respondToConnect(requesterId, accept) {
  if (!requesterId) throw new CommunityError('invalid_input');
  return callCommunity('community_respond_connect', {
    _requester: requesterId, _accept: !!accept,
  });
}

/** Take back a request that has not been answered. */
export async function withdrawConnect(targetUserId) {
  if (!targetUserId) throw new CommunityError('invalid_input');
  return callCommunity('community_withdraw_connect', { _target: targetUserId });
}

/**
 * End a connection. The conversation closes for both people and the two
 * follow edges stay: removing a connection is not a block, and the screen
 * says so before it happens.
 */
export async function removeConnection(targetUserId) {
  if (!targetUserId) throw new CommunityError('invalid_input');
  return callCommunity('community_remove_connection', { _target: targetUserId });
}

/**
 * One page of a person's connections.
 *
 * @param {string|null} userId whose connections; null means the caller's
 * @returns {Promise<{people: Array, cursor: (string|null)}>}
 */
export async function listConnections(userId = null, { cursor = null, limit = DEFAULT_PAGE_SIZE } = {}) {
  const data = await callCommunity('community_list_connections', {
    _uid: userId, _cursor: cursor, _limit: limit,
  });
  const rows = data?.people;
  return {
    people: Array.isArray(rows) ? rows : [],
    cursor: typeof data?.cursor === 'string' ? data.cursor : null,
  };
}

/** Who may send me a connection request. */
export async function setConnectFrom(value) {
  if (!CONNECT_FROM_VALUES[value]) throw new CommunityError('invalid_input');
  return callCommunity('community_set_connect_from', { _value: value });
}

/** "Show which programmes I use" (SD-26). Default on for a public
 * profile; off removes the person from every "People on this programme"
 * list without changing anything else. */
export async function setShowProgrammes(value) {
  return callCommunity('community_set_show_programmes', { _value: !!value });
}

/**
 * "Open to training together" and its preferences (SD-25). Off means
 * nothing anywhere says the person was ever looking.
 */
export async function setPartner(open, prefs = null) {
  return callCommunity('community_set_partner', {
    _open: !!open,
    _prefs: open ? cleanPartnerPrefs(prefs) : null,
  });
}
