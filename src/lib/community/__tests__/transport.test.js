/**
 * What this suite pins (blueprint section 5.1; SD-13, SD-14):
 *
 *  - the three gates are asked IN ORDER, before any network call. A
 *    sign-out wipe wins over everything; Article 9 consent wins over the
 *    session check;
 *  - consent FAILS CLOSED. `healthConsent` of null ("not resolved yet")
 *    is not consent, and an unreadable store is not consent either. This
 *    is the CLAUDE.md rule that a transient read failure must never
 *    bypass the gate;
 *  - `hasLiveSession()` is tri-state and only an ANSWERED false blocks:
 *    null means "could not determine", which must not switch Community
 *    off for someone whose Keychain was briefly unreadable;
 *  - a refusal the server raises arrives as a CommunityError with the
 *    server's own code, and a network failure arrives as 'offline';
 *  - a deliberate refusal is NOT logged as a defect.
 */

const supabase = require('../../supabase');
const signOutGuard = require('../../sync/signOutGuard');
const errorLog = require('../../errorLog');
const store = require('../../../store/useAppStore');

jest.mock('../../supabase', () => ({
  getSupabaseClient: jest.fn(),
  hasLiveSession: jest.fn(),
}));
jest.mock('../../sync/signOutGuard', () => ({ isSignOutWiping: jest.fn(() => false) }));
jest.mock('../../errorLog', () => ({
  logError: jest.fn(), logWarn: jest.fn(), logInfo: jest.fn(),
}));
jest.mock('../../../store/useAppStore', () => ({
  __esModule: true,
  default: { getState: jest.fn(() => ({ healthConsent: true })) },
}));

const { callCommunity, invokeCommunityFunction, CommunityError } = require('../transport');

const rpc = jest.fn();
const invoke = jest.fn();

function grantAll() {
  signOutGuard.isSignOutWiping.mockReturnValue(false);
  store.default.getState.mockReturnValue({ healthConsent: true });
  supabase.hasLiveSession.mockResolvedValue(true);
  supabase.getSupabaseClient.mockReturnValue({ rpc, functions: { invoke } });
}

async function codeOf(promise) {
  try {
    await promise;
    return null;
  } catch (e) {
    expect(e).toBeInstanceOf(CommunityError);
    return e.code;
  }
}

beforeEach(() => {
  jest.clearAllMocks();
  rpc.mockReset();
  invoke.mockReset();
  grantAll();
});

describe('the three gates', () => {
  test('a sign-out wipe refuses before anything else is even asked', async () => {
    signOutGuard.isSignOutWiping.mockReturnValue(true);
    store.default.getState.mockReturnValue({ healthConsent: false });
    expect(await codeOf(callCommunity('community_get_me'))).toBe('sign_out_wiping');
    expect(supabase.getSupabaseClient).not.toHaveBeenCalled();
    expect(supabase.hasLiveSession).not.toHaveBeenCalled();
  });

  test('unresolved Article 9 consent fails CLOSED', async () => {
    store.default.getState.mockReturnValue({ healthConsent: null });
    expect(await codeOf(callCommunity('community_get_me'))).toBe('health_consent_unresolved');
    expect(supabase.getSupabaseClient).not.toHaveBeenCalled();
  });

  test('withdrawn consent refuses', async () => {
    store.default.getState.mockReturnValue({ healthConsent: false });
    expect(await codeOf(callCommunity('community_get_me'))).toBe('health_consent_unresolved');
  });

  test('an unreadable store is not consent', async () => {
    store.default.getState.mockImplementation(() => { throw new Error('store gone'); });
    expect(await codeOf(callCommunity('community_get_me'))).toBe('health_consent_unresolved');
    expect(supabase.getSupabaseClient).not.toHaveBeenCalled();
  });

  test('consent is asked before the session, so an unconsented signed-out user hears the consent answer', async () => {
    store.default.getState.mockReturnValue({ healthConsent: null });
    supabase.hasLiveSession.mockResolvedValue(false);
    expect(await codeOf(callCommunity('community_get_me'))).toBe('health_consent_unresolved');
  });

  test('an ANSWERED "no session" refuses', async () => {
    supabase.hasLiveSession.mockResolvedValue(false);
    expect(await codeOf(callCommunity('community_get_me'))).toBe('not_signed_in');
    expect(rpc).not.toHaveBeenCalled();
  });

  test('an UNDETERMINED session does not switch Community off', async () => {
    supabase.hasLiveSession.mockResolvedValue(null);
    rpc.mockResolvedValue({ data: { profile: null }, error: null });
    await expect(callCommunity('community_get_me')).resolves.toEqual({ profile: null });
  });

  test('a throwing session check does not switch Community off either', async () => {
    supabase.hasLiveSession.mockRejectedValue(new Error('keychain locked'));
    rpc.mockResolvedValue({ data: { ok: true }, error: null });
    await expect(callCommunity('community_get_me')).resolves.toEqual({ ok: true });
  });
});

describe('calling', () => {
  test('passes the name and params straight through', async () => {
    rpc.mockResolvedValue({ data: [1, 2], error: null });
    // PostgREST names arguments; the RPCs declare them underscore-prefixed
    // (house convention, migrate_102 / 147 / 160), so the transport must
    // pass the caller's object through untouched.
    await expect(callCommunity('community_feed', { _cursor: null, _limit: 20 })).resolves.toEqual([1, 2]);
    expect(rpc).toHaveBeenCalledWith('community_feed', { _cursor: null, _limit: 20 });
  });

  test('an edge function goes through the same gates', async () => {
    store.default.getState.mockReturnValue({ healthConsent: null });
    expect(await codeOf(invokeCommunityFunction('community-notify', {}))).toBe('health_consent_unresolved');
  });

  test('an edge function invoke passes its body', async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    await expect(invokeCommunityFunction('community-notify', { kind: 'follow' }))
      .resolves.toEqual({ ok: true });
    expect(invoke).toHaveBeenCalledWith('community-notify', { body: { kind: 'follow' } });
  });
});

describe('errors', () => {
  test.each([
    'rate_limited', 'forbidden_field', 'content_not_allowed', 'handle_taken',
    'no_profile', 'blocked', 'not_found', 'not_allowed', 'already_reported', 'not_moderator',
  ])('the server code %s arrives as itself', async (code) => {
    rpc.mockResolvedValue({ data: null, error: { message: code } });
    expect(await codeOf(callCommunity('community_create_post'))).toBe(code);
  });

  test('a deliberate refusal is not logged as a defect', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'rate_limited' } });
    await codeOf(callCommunity('community_create_post'));
    expect(errorLog.logError).not.toHaveBeenCalled();
  });

  test('a network failure arrives as offline', async () => {
    rpc.mockRejectedValue(new Error('Network request failed'));
    expect(await codeOf(callCommunity('community_feed'))).toBe('offline');
  });

  test('an unrecognised failure arrives as unavailable AND is logged', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'something nobody planned for' } });
    expect(await codeOf(callCommunity('community_feed'))).toBe('unavailable');
    expect(errorLog.logError).toHaveBeenCalledWith('Community.community_feed', expect.anything(), expect.anything());
  });

  test('no client at all is unavailable, not a crash', async () => {
    supabase.getSupabaseClient.mockReturnValue(null);
    expect(await codeOf(callCommunity('community_feed'))).toBe('unavailable');
  });

  test('an unknown code cannot be forged into a CommunityError', () => {
    expect(new CommunityError('made_up').code).toBe('unavailable');
  });
});
