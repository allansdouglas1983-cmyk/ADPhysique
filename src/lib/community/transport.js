/**
 * The single Community ingress and egress (blueprint section 5.1;
 * SD-13, SD-14).
 *
 * Every Community read and write in the app goes through this module. It
 * is the ONLY file under `src/lib/community/` that may import
 * `getSupabaseClient` (pinned by
 * `src/__tests__/community.transport.guard.test.js`), for the same
 * reason the sync layer keeps one transport: the three gates below have
 * to be asked in one place or they are eventually not asked at all.
 *
 * The gates, in order, matching the sync runner's own posture:
 *  1. `isSignOutWiping()` - local data is being erased; a request that
 *     lands mid-wipe writes into a database about to disappear, or pulls
 *     the outgoing account's rows back onto the incoming one.
 *  2. Article 9 consent - `healthConsent !== true` fails CLOSED. An
 *     unresolved read is NOT consent (CLAUDE.md section 2: "Consent
 *     flows fail CLOSED for new users").
 *  3. `hasLiveSession() === false` - only an ANSWERED "no token" blocks.
 *     `hasLiveSession` is deliberately tri-state and null means "could
 *     not determine", which must not switch Community off for someone
 *     whose Keychain was briefly unreadable.
 *
 * Every failure arrives at the caller as a `CommunityError` with a
 * `.code` from `COMMUNITY_ERROR_CODES`, so screens map codes to calm
 * copy and never parse a message string.
 */

import { getSupabaseClient, hasLiveSession } from '../supabase';
import { isSignOutWiping } from '../sync/signOutGuard';
import { logError } from '../errorLog';

/**
 * The codes the server raises, plus the four this transport raises
 * itself. A PostgREST error whose message is one of these is a
 * DELIBERATE refusal and is rethrown as-is, never logged as a defect.
 */
export const COMMUNITY_ERROR_CODES = Object.freeze([
  // Raised here, before the network.
  'sign_out_wiping',
  'health_consent_unresolved',
  'offline',
  'unavailable',
  // Raised by the RPCs (blueprint section 3).
  'not_signed_in',
  'no_profile',
  'profile_restricted',
  'profile_suspended',
  'handle_taken',
  'handle_invalid',
  'invalid_input',
  'content_not_allowed',
  'forbidden_field',
  'rate_limited',
  'blocked',
  'not_found',
  'not_allowed',
  'already_reported',
  'not_moderator',
]);

const KNOWN_CODES = new Set(COMMUNITY_ERROR_CODES);

/** Refusals the caller is expected to handle in copy: never logged as an
 * unexpected error, because they are the system working. */
const EXPECTED_CODES = new Set([
  'sign_out_wiping', 'health_consent_unresolved', 'offline', 'not_signed_in',
  'no_profile', 'handle_taken', 'handle_invalid', 'invalid_input',
  'content_not_allowed', 'forbidden_field', 'rate_limited', 'blocked',
  'not_found', 'not_allowed', 'already_reported', 'not_moderator',
  'profile_restricted', 'profile_suspended',
]);

/** Every Community failure is one of these. `.code` is the contract. */
export class CommunityError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = 'CommunityError';
    this.code = KNOWN_CODES.has(code) ? code : 'unavailable';
  }
}

export function isCommunityErrorCode(code) {
  return KNOWN_CODES.has(code);
}

const OFFLINE_HINTS = [
  'failed to fetch', 'network request failed', 'networkerror', 'network error',
  'timeout', 'timed out', 'econnreset', 'enotfound', 'socket hang up',
  'unable to resolve host', 'load failed',
];

function looksOffline(error) {
  const text = [error?.message, error?.details, error?.hint, error?.name, error?.code]
    .filter(Boolean).join(' ').toLowerCase();
  return OFFLINE_HINTS.some((hint) => text.includes(hint));
}

/**
 * Map one PostgREST / functions error onto a Community code. An RPC
 * raises with the bare code as its message, so an exact match on the
 * trimmed message is the primary route; a substring match covers
 * PostgREST wrapping it in its own prose.
 */
function codeFor(error) {
  const message = String(error?.message ?? '').trim();
  if (KNOWN_CODES.has(message)) return message;
  const haystack = [error?.message, error?.details, error?.hint].filter(Boolean).join(' ').toLowerCase();
  for (const code of KNOWN_CODES) {
    if (code === 'unavailable' || code === 'offline') continue;
    if (haystack.includes(code)) return code;
  }
  if (looksOffline(error)) return 'offline';
  const status = error?.status ?? error?.context?.status;
  if (status === 401 || status === 403) return 'not_signed_in';
  return null;
}

/**
 * The three gates. Exported so tests can drive them directly and so the
 * two entry points below cannot drift apart.
 *
 * @returns {Promise<void>} resolves when the call may proceed; throws a
 *   CommunityError otherwise.
 */
export async function assertCommunityGates() {
  if (isSignOutWiping()) throw new CommunityError('sign_out_wiping');

  let consent = null;
  try {
    // Lazy require: lib modules reach the store this way to avoid an
    // import cycle (CLAUDE.md section 3).
    // eslint-disable-next-line global-require
    consent = require('../../store/useAppStore').default.getState().healthConsent;
  } catch (_e) {
    consent = null; // unreadable store: fail closed below
  }
  // Fail CLOSED. null ("not resolved yet") is not consent.
  if (consent !== true) throw new CommunityError('health_consent_unresolved');

  let live = null;
  try {
    live = await hasLiveSession();
  } catch (_e) {
    live = null; // could not determine: do not switch Community off
  }
  if (live === false) throw new CommunityError('not_signed_in');
}

function client() {
  const c = getSupabaseClient();
  if (!c) throw new CommunityError('unavailable');
  return c;
}

function rethrow(scope, error) {
  if (error instanceof CommunityError) throw error;
  const code = codeFor(error);
  if (code) {
    if (!EXPECTED_CODES.has(code)) logError(scope, error, { code });
    throw new CommunityError(code, error?.message);
  }
  // Unexpected only: a shape we did not anticipate is a defect worth
  // seeing. Deliberate refusals above never reach here.
  logError(scope, error, { });
  throw new CommunityError('unavailable', error?.message);
}

/**
 * Call one Community RPC.
 *
 * @param {string} name the RPC name, e.g. 'community_get_me'
 * @param {object} [params]
 * @returns {Promise<*>} the RPC's data
 * @throws {CommunityError}
 */
export async function callCommunity(name, params = {}) {
  const scope = `Community.${name}`;
  await assertCommunityGates();
  try {
    const { data, error } = await client().rpc(name, params);
    if (error) rethrow(scope, error);
    return data;
  } catch (e) {
    rethrow(scope, e);
    return null; // unreachable: rethrow always throws
  }
}

/**
 * Invoke one Community edge function under the same three gates.
 *
 * @param {string} name
 * @param {object} [body]
 * @returns {Promise<*>}
 * @throws {CommunityError}
 */
export async function invokeCommunityFunction(name, body = {}) {
  const scope = `Community.${name}`;
  await assertCommunityGates();
  try {
    const { data, error } = await client().functions.invoke(name, { body });
    if (error) rethrow(scope, error);
    return data;
  } catch (e) {
    rethrow(scope, e);
    return null; // unreachable
  }
}
