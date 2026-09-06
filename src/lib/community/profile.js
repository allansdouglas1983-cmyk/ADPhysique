/**
 * The signed-in user's own Community state (blueprint section 5.7;
 * SD-13).
 *
 * Community is online-first with a small per-user cache: the last `me`
 * payload lives in AsyncStorage under `@volyume_community_me_<uid>` so
 * the header dot, the entry points and an offline "last seen" state can
 * render without a round trip. No SQLite table is added, so there is no
 * wipe-list to extend and no foreign row can survive an account switch;
 * the key is per user id, and reading it for a different id returns
 * nothing.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { logError } from '../errorLog';
import { callCommunity } from './transport';
import { COMMUNITY_RULES_VERSION } from './limits';

export const ME_CACHE_PREFIX = '@volyume_community_me_';

export function meCacheKey(uid) {
  return `${ME_CACHE_PREFIX}${uid ?? 'unknown'}`;
}

/** The current local user id, read lazily so this module has no import
 * cycle with the store. */
export function currentUserId() {
  try {
    // eslint-disable-next-line global-require
    const state = require('../../store/useAppStore').default.getState();
    return state.user?.id ?? state.session?.user?.id ?? null;
  } catch (_e) {
    return null;
  }
}

/** An empty `me`: no profile, nothing pending. The shape every caller
 * can render against, so a first run and an offline run look the same. */
export function emptyMe() {
  return {
    profile: null,
    pending_requests: 0,
    unseen_activity: 0,
    is_moderator: false,
    is_minor: false,
    rules_version: COMMUNITY_RULES_VERSION,
    // Discovery campaign (blueprint section 11). The counts and the
    // training profile bands start EMPTY: an unreadable `me` must never
    // render as "3 people want to connect" or claim a band the person
    // has not shared. `connect_from` and `show_programmes` mirror the
    // column defaults in migrate_161 instead, so a cold render matches
    // what the server would say about a profile that has just been made.
    pending_connect_requests: 0,
    unseen_messages: 0,
    connect_from: 'anyone',
    open_to_partner: false,
    partner_prefs: null,
    show_programmes: true,
    tp_days: null,
    tp_time_bands: null,
    tp_sessions_band: null,
    tp_staple_lifts: null,
    tp_experience_band: null,
    tp_programme_key: null,
    tp_age_band: null,
  };
}

/**
 * Read the cached `me` payload for one user.
 *
 * @param {string} uid
 * @returns {Promise<object|null>}
 */
export async function readCachedMe(uid) {
  if (!uid) return null;
  try {
    const raw = await AsyncStorage.getItem(meCacheKey(uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_e) {
    return null; // a cache miss is never an error the user hears about
  }
}

async function writeCachedMe(uid, me) {
  if (!uid) return;
  try {
    await AsyncStorage.setItem(meCacheKey(uid), JSON.stringify(me));
  } catch (_e) { /* best effort: the cache is a convenience, never truth */ }
}

/** Drop the cached payload, on leaving Community or signing out. */
export async function clearCachedMe(uid) {
  if (!uid) return;
  try {
    await AsyncStorage.removeItem(meCacheKey(uid));
  } catch (_e) { /* best effort */ }
}

/**
 * Load `me`, cache first then the RPC.
 *
 * @param {{force?: boolean, userId?: string}} [opts] `force` skips the
 *   cached answer and waits for the server.
 * @returns {Promise<{me: object, fromCache: boolean, error: (string|null)}>}
 *   never throws: Community is a place the user visits, and a failure
 *   there must not break the screen it was reached from.
 */
export async function loadMe({ force = false, userId = null } = {}) {
  const uid = userId ?? currentUserId();
  if (!force) {
    const cached = await readCachedMe(uid);
    if (cached) {
      // Refresh in the background so the next open is current.
      refreshMe(uid).catch(() => { /* best effort */ });
      return { me: cached, fromCache: true, error: null };
    }
  }
  try {
    const me = await refreshMe(uid);
    return { me, fromCache: false, error: null };
  } catch (e) {
    const cached = await readCachedMe(uid);
    return { me: cached ?? emptyMe(), fromCache: !!cached, error: e?.code ?? 'unavailable' };
  }
}

/** Fetch and cache. Throws a CommunityError on failure. */
export async function refreshMe(userId = null) {
  const uid = userId ?? currentUserId();
  const data = await callCommunity('community_get_me', {});
  const me = data && typeof data === 'object' ? data : emptyMe();
  await writeCachedMe(uid, me);
  return me;
}

/** Does this user have a Community profile? Nothing is visible and
 * nothing can be posted until they do (SD-04). */
export function hasProfile(me) {
  return !!me?.profile?.handle;
}

/**
 * The unseen dot on the Today header: activity, a follow request, a
 * connection request or an unread message. One dot for all four, because
 * the header action is one destination and the dot only means "there is
 * something in there".
 */
export function hasUnseen(me) {
  return Number(me?.unseen_activity ?? 0) > 0
    || Number(me?.pending_requests ?? 0) > 0
    || Number(me?.pending_connect_requests ?? 0) > 0
    || Number(me?.unseen_messages ?? 0) > 0;
}

/** The messages glyph in the Community header carries its own dot: the
 * hub sends people to two different places, so one dot cannot serve both
 * (blueprint section 10). */
export function hasUnreadMessages(me) {
  return Number(me?.unseen_messages ?? 0) > 0;
}

/**
 * Create or update the profile. The server applies the handle policy,
 * the minor rule and the consent write; this only carries the fields.
 *
 * @param {object} fields
 * @returns {Promise<object>} the profile card
 */
export async function upsertProfile(fields = {}) {
  const card = await callCommunity('community_upsert_profile', {
    _p: { ...fields, accept_rules_version: COMMUNITY_RULES_VERSION },
  });
  const uid = currentUserId();
  const cached = (await readCachedMe(uid)) ?? emptyMe();
  await writeCachedMe(uid, { ...cached, profile: card ?? null });
  return card;
}

/**
 * Re-accept the Community rules at the CURRENT version, and nothing else.
 *
 * The rules text moved to version 2 with this campaign (messages, meeting
 * a training partner in person, and what the training profile does and
 * does not share). The server raises `rules_outdated` on the first
 * connect, message send or training profile update from a profile that
 * accepted version 1, and the screen answers by showing the rules again
 * and calling this.
 *
 * It sends `accept_rules_version` ALONE. `community_upsert_profile` is a
 * partial update, so a payload carrying only the version cannot
 * accidentally rewrite a handle, a display name or a visibility setting
 * on the way past: re-consent is a consent act, not a profile edit.
 *
 * @returns {Promise<object>} the profile card
 */
export async function acceptRules() {
  const card = await callCommunity('community_upsert_profile', {
    _p: { accept_rules_version: COMMUNITY_RULES_VERSION },
  });
  const uid = currentUserId();
  const cached = (await readCachedMe(uid)) ?? emptyMe();
  await writeCachedMe(uid, { ...cached, profile: card ?? cached.profile ?? null });
  return card;
}

/** Is this handle free? Used for the live "Available" / "Taken" line. */
export async function checkHandle(handle) {
  return callCommunity('community_check_handle', { _h: String(handle ?? '').trim().toLowerCase() });
}

/** Leave Community: withdraws consent and deletes everything the user
 * authored. The cache goes with it. */
export async function leaveCommunity() {
  try {
    const out = await callCommunity('community_leave', {});
    await clearCachedMe(currentUserId());
    return out;
  } catch (e) {
    logError('Community.leaveCommunity', e, { code: e?.code ?? null });
    throw e;
  }
}

/** One person's profile, by handle or by user id. */
export async function getProfile({ handle = null, userId = null } = {}) {
  return callCommunity('community_get_profile', { _handle: handle, _uid: userId });
}

export async function follow(targetUserId) {
  return callCommunity('community_follow', { _target: targetUserId });
}

export async function unfollow(targetUserId) {
  return callCommunity('community_unfollow', { _target: targetUserId });
}

export async function respondToFollow(requesterId, accept) {
  return callCommunity('community_respond_follow', { _requester: requesterId, _accept: !!accept });
}

export async function removeFollower(followerId) {
  return callCommunity('community_remove_follower', { _follower: followerId });
}

/**
 * One page of followers or following. `community_list_follows` answers
 * `{people, cursor}` (migrate_160:1921); the cursor is the server's own
 * opaque string and is never rebuilt here.
 *
 * @returns {Promise<{people: Array, cursor: (string|null)}>}
 */
export async function listFollows(userId, kind, { cursor = null, limit = 30 } = {}) {
  const data = await callCommunity('community_list_follows', {
    _uid: userId, _kind: kind, _cursor: cursor, _limit: limit,
  });
  const rows = data?.people;
  return {
    people: Array.isArray(rows) ? rows : [],
    cursor: typeof data?.cursor === 'string' ? data.cursor : null,
  };
}

export async function blockUser(targetUserId) {
  return callCommunity('community_block', { _target: targetUserId });
}

export async function unblockUser(targetUserId) {
  return callCommunity('community_unblock', { _target: targetUserId });
}

export async function muteUser(targetUserId) {
  return callCommunity('community_mute', { _target: targetUserId });
}

export async function unmuteUser(targetUserId) {
  return callCommunity('community_unmute', { _target: targetUserId });
}

/** The Blocked and Muted lists for the Community privacy screen. */
export async function relationships() {
  return callCommunity('community_relationships', {});
}
