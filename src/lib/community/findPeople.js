/**
 * Find people: six doors and the scored lists behind them (discovery
 * blueprint sections 4, 5, 7, 8, 9; SD-23, SD-24, SD-27, SD-28).
 *
 * Two rules run through the whole module.
 *
 * REASONS, NEVER PERCENTAGES (SD-24). The server scores candidates to
 * ORDER them and nothing else. Every row carries its `reasons` in fixed
 * wording ("Trains at PureGym Leeds", "Both usually train evenings"), and
 * no surface anywhere turns a score into a match percentage: a percentage
 * claims a precision coarse bands cannot carry, and it invites ranking
 * people against each other. The score is transport; the reasons are the
 * explanation.
 *
 * HONEST DOORS (SD-28). A door with no count says so, and a door that
 * cannot work yet says exactly what would make it work ("Add your gym to
 * see who trains there") rather than hiding. Nothing here is gated behind
 * a density threshold, because a door that vanishes when the network is
 * small is a door nobody can be the first through.
 */

import { callCommunity, CommunityError } from './transport';

export const DEFAULT_PAGE_SIZE = 20;

/**
 * The six doors, in the order the screen lists them (blueprint section 4).
 *
 * `requires` names the field on the caller's own profile that a door
 * needs; `requirement` is what the row says instead when it is missing,
 * and tapping it opens Edit profile. `available: false` never means
 * "hidden": the row is still there, still tappable, and honest about why
 * it is empty.
 */
export const FIND_MODES = Object.freeze({
  gym: Object.freeze({
    mode: 'gym',
    label: 'At my gym',
    subtitle: 'Lifters at your gym',
    requires: 'gym_label',
    requirement: 'Add your gym to see who trains there',
  }),
  area: Object.freeze({
    mode: 'area',
    label: 'Near me',
    subtitle: 'Lifters in your area',
    requires: 'area_label',
    requirement: 'Add your area to see who trains near you',
  }),
  like_me: Object.freeze({
    mode: 'like_me',
    label: 'Train like me',
    subtitle: 'Lifters like you',
    requires: null,
    requirement: null,
  }),
  programme: Object.freeze({
    mode: 'programme',
    label: 'On my programme',
    subtitle: 'Lifters on the same programme',
    requires: 'tp_programme_key',
    requirement: 'Set an active plan to see who else is on it',
  }),
  partners: Object.freeze({
    mode: 'partners',
    label: 'Open to training together',
    subtitle: 'Lifters open to a training partner',
    requires: null,
    requirement: null,
  }),
  might_know: Object.freeze({
    mode: 'might_know',
    label: 'People you might know',
    subtitle: 'From your connections and follows',
    requires: null,
    requirement: null,
  }),
});

export const FIND_MODE_ORDER = Object.freeze([
  'gym', 'area', 'like_me', 'programme', 'partners', 'might_know',
]);

const FIND_MODE_SET = new Set(FIND_MODE_ORDER);

/**
 * Where each door's requirement lives on the `me` payload. The gym and
 * area labels sit on the profile card; the programme key is a training
 * profile band, which is on `me` itself (blueprint section 11).
 */
function requirementValue(me, field) {
  if (!field) return true;
  if (field === 'tp_programme_key') return me?.tp_programme_key ?? me?.profile?.tp_programme_key ?? null;
  return me?.profile?.[field] ?? me?.[field] ?? null;
}

/**
 * The six door descriptors for this person.
 *
 * @param {object|null} me the `community_get_me` payload
 * @returns {Array<{mode: string, label: string, subtitle: string,
 *   available: boolean, requirement: (string|null), key: (string|null)}>}
 */
export function doorsFor(me) {
  return FIND_MODE_ORDER.map((mode) => {
    const door = FIND_MODES[mode];
    const value = requirementValue(me, door.requires);
    const available = door.requires ? !!value : true;
    return {
      mode,
      label: door.label,
      subtitle: door.subtitle,
      available,
      requirement: available ? null : door.requirement,
      key: door.requires && available ? value : null,
    };
  });
}

/**
 * The line under a door's label once its count is known.
 *
 * A count of null means "not read yet" and answers the plain subtitle
 * rather than a zero, because "· 0" and "not counted yet" are different
 * facts and only one of them is true at that moment.
 *
 * @param {object} door one descriptor from `doorsFor`
 * @param {number|null} [count]
 * @returns {string}
 */
export function doorLine(door, count = null) {
  if (!door?.available) return door?.requirement ?? '';
  const n = Number.isFinite(Number(count)) && count !== null ? Number(count) : null;
  if (n === null) return door.subtitle;
  switch (door.mode) {
    case 'gym':
      return `Trains at ${door.key} · ${n} ${n === 1 ? 'other' : 'others'}`;
    case 'area':
      return `Lifters in ${door.key} · ${n}`;
    case 'programme':
      return `On your programme · ${n}`;
    case 'partners':
      return `${n} in your area`;
    default:
      return door.subtitle;
  }
}

/**
 * The zero state for a door. Never pretends (SD-28): it says what is true
 * and offers the one thing that changes it.
 *
 * @param {object} door
 * @returns {string}
 */
export function doorZeroState(door) {
  if (!door?.available) return door?.requirement ?? '';
  if (door.mode === 'gym' && door.key) {
    return `No one else lists ${door.key} yet. You are the first here; anyone who adds it will see you.`;
  }
  if (door.mode === 'area' && door.key) {
    return `No one else lists ${door.key} yet. You are the first here; anyone who adds it will see you.`;
  }
  if (door.mode === 'partners') {
    return 'No one else is open to training together yet. Anyone who switches it on will see you.';
  }
  return 'No one to show yet. Share your profile link and anyone who joins will find you here.';
}

/**
 * One page of a scored list.
 *
 * There is deliberately NO key parameter. `community_find_people` takes
 * the mode, a cursor and a limit only (blueprint section 11) and reads the
 * gym, area and programme keys from the CALLER's own profile, server-side.
 * A client-supplied key would let anyone list the members of any gym they
 * can name. The people-list screen keeps the label it was opened with for
 * its own title; it is never sent, and passing one here does nothing.
 *
 * @param {string} mode one of FIND_MODE_ORDER
 * @param {{cursor?: string|null, limit?: number}} [opts]
 * @returns {Promise<{people: Array<{card: object, reasons: string[],
 *   score: number}>, cursor: (string|null), count: (number|null)}>}
 * @throws {CommunityError} 'invalid_input' for an unknown mode.
 */
export async function findPeople(mode, { cursor = null, limit = DEFAULT_PAGE_SIZE } = {}) {
  if (!FIND_MODE_SET.has(mode)) throw new CommunityError('invalid_input');
  const data = await callCommunity('community_find_people', {
    _mode: mode, _cursor: cursor, _limit: limit,
  });
  const rows = Array.isArray(data?.people) ? data.people : [];
  return {
    people: rows.map((row) => ({
      card: row?.card ?? null,
      reasons: Array.isArray(row?.reasons) ? row.reasons : [],
      score: Number(row?.score ?? 0),
    })),
    cursor: typeof data?.cursor === 'string' ? data.cursor : null,
    count: Number.isFinite(Number(data?.count)) ? Number(data.count) : null,
  };
}

/**
 * The people on one Community programme (SD-26). Public, active,
 * non-minor profiles who use or published it AND have "Show which
 * programmes I use" on; the toggle is the whole consent story here.
 *
 * @returns {Promise<{people: Array, cursor: (string|null), count: (number|null)}>}
 */
export async function programmePeople(id, { cursor = null, limit = DEFAULT_PAGE_SIZE } = {}) {
  if (!id) throw new CommunityError('invalid_input');
  const data = await callCommunity('community_programme_people', {
    _id: id, _cursor: cursor, _limit: limit,
  });
  return {
    people: Array.isArray(data?.people) ? data.people : [],
    cursor: typeof data?.cursor === 'string' ? data.cursor : null,
    count: Number.isFinite(Number(data?.count)) ? Number(data.count) : null,
  };
}

/**
 * The summary at the top of a gym page (SD-27). Counts by style, by
 * shared time band and by the partner flag, plus "N you follow".
 *
 * Nothing live and nothing precise: a gym page is a noticeboard, not a
 * room, and it never says who is there now (SD-31).
 *
 * @param {string} key the gym dimension key
 * @returns {Promise<object>}
 */
export async function gymSummary(key) {
  if (!key) throw new CommunityError('invalid_input');
  const data = await callCommunity('community_gym_summary', { _key: key });
  return {
    label: data?.label ?? null,
    count: Number(data?.count ?? 0),
    following_count: Number(data?.following_count ?? 0),
    open_to_partner_count: Number(data?.open_to_partner_count ?? 0),
    by_style: Array.isArray(data?.by_style) ? data.by_style : [],
    by_time_band: Array.isArray(data?.by_time_band) ? data.by_time_band : [],
  };
}

/**
 * The gym typeahead on the profile editor (SD-27). Suggests labels
 * ALREADY used in the same area, so "PureGym Leeds" is chosen once and
 * then chosen again, rather than retyped into four near-misses that never
 * join up into one page.
 *
 * @param {string} areaKey
 * @param {string} prefix
 * @returns {Promise<Array<{label: string, count: number}>>}
 */
export async function gymSuggest(areaKey, prefix) {
  const text = String(prefix ?? '').trim();
  if (!areaKey || !text) return [];
  const data = await callCommunity('community_gym_suggest', {
    _area_key: areaKey, _prefix: text,
  });
  const rows = Array.isArray(data?.gyms) ? data.gyms : (Array.isArray(data) ? data : []);
  return rows
    .map((row) => (typeof row === 'string'
      ? { label: row, count: 0 }
      : { label: row?.label ?? null, count: Number(row?.count ?? 0) }))
    .filter((row) => !!row.label);
}
