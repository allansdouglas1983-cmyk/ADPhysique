/**
 * Community constants: the rules version, the hub threshold and every
 * rate limit (blueprint sections 3, 5.6; SD-10, SD-11).
 *
 * PURE. These numbers are the CLIENT's copy of limits the server
 * enforces. The client uses them for honest copy ("you can post three
 * times a day while your account is new") and to disable a control
 * before a doomed round trip; the server decides. Never treat a client
 * check as the limit.
 */

/**
 * The version of the Community rules a profile accepted. Written to the
 * consent_log rail as `notice_version` when a profile is created. Bump
 * it only when the rules TEXT changes, and only alongside a re-consent
 * path: the number is a consent record, not a build number.
 */
export const COMMUNITY_RULES_VERSION = 1;

/**
 * SD-10: a dimension (style, programme, gym, area) is surfaced on the
 * Discover hub only once at least this many OTHER people share it. An
 * internal choice with no external evidence behind it, recorded as such
 * so nobody later reads it as research. Below the threshold the
 * dimension page still exists and is still reachable from a profile; it
 * is simply not advertised as a place to go.
 */
export const COMMUNITY_DIMENSION_MIN_FOR_HUB = 3;

/**
 * An account is "new" for its first seven days. Every limit below has a
 * tighter new-account figure: the cheapest abuse pattern is a fresh
 * account that follows a thousand people in an hour, and seven days
 * costs a genuine user nothing.
 */
export const NEW_ACCOUNT_DAYS = 7;

export const FOLLOWS_PER_DAY_NEW = 30;
export const FOLLOWS_PER_DAY_ESTABLISHED = 100;
export const FOLLOWING_CAP = 2000;

export const POSTS_PER_DAY_NEW = 3;
export const POSTS_PER_DAY_ESTABLISHED = 10;

export const COMMENTS_PER_HOUR_NEW = 10;
export const COMMENTS_PER_HOUR_ESTABLISHED = 30;

export const REPORTS_PER_DAY = 20;
export const PROGRAMMES_PER_DAY = 10;
export const PROFILE_UPSERTS_PER_DAY = 5;

/** A handle may change once every 30 days. Handles are how people find
 * and recognise each other; a handle that moves weekly is a hiding
 * place, and the person who followed you deserves the name to hold. */
export const HANDLE_CHANGE_DAYS = 30;

/** A post, comment or programme reaching this many distinct open reports
 * hides itself pending review. Automatic first line, never the last
 * word: a moderator can unhide. */
export const AUTO_HIDE_REPORTS = 3;

/** Programme snapshot ceilings (blueprint section 5.2). A snapshot is
 * structure only, so these are generous for any real training week and
 * tight enough that a snapshot can never become a data channel. */
export const SNAPSHOT_MAX_BYTES = 65536;
export const SNAPSHOT_MAX_DAYS = 8;
export const SNAPSHOT_MAX_EXERCISES_PER_DAY = 20;

/**
 * Is this profile still inside its new-account window?
 *
 * @param {number|string|null} createdAt epoch ms or an ISO string
 * @param {number} [nowMs] injected for tests; this module stays pure
 * @returns {boolean} true when the age cannot be established, so the
 *   tighter limits apply. Fail closed: an unknown account age is treated
 *   as new.
 */
export function isNewAccount(createdAt, nowMs = Date.now()) {
  if (createdAt == null) return true;
  const ms = typeof createdAt === 'number' ? createdAt : Date.parse(String(createdAt));
  if (!Number.isFinite(ms)) return true;
  return nowMs - ms < NEW_ACCOUNT_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * The limits that apply to this account right now, for copy and for
 * disabling a control before a doomed round trip.
 *
 * @param {number|string|null} createdAt
 * @param {number} [nowMs]
 */
export function limitsForAccount(createdAt, nowMs = Date.now()) {
  const isNew = isNewAccount(createdAt, nowMs);
  return {
    isNew,
    followsPerDay: isNew ? FOLLOWS_PER_DAY_NEW : FOLLOWS_PER_DAY_ESTABLISHED,
    postsPerDay: isNew ? POSTS_PER_DAY_NEW : POSTS_PER_DAY_ESTABLISHED,
    commentsPerHour: isNew ? COMMENTS_PER_HOUR_NEW : COMMENTS_PER_HOUR_ESTABLISHED,
    followingCap: FOLLOWING_CAP,
    reportsPerDay: REPORTS_PER_DAY,
    programmesPerDay: PROGRAMMES_PER_DAY,
    profileUpsertsPerDay: PROFILE_UPSERTS_PER_DAY,
  };
}
