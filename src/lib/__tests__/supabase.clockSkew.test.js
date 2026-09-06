/**
 * supabase.clockSkew.test.js
 *
 * Pins the PGRST303 handling from the 2026-09-06 Sentry triage
 * (VOLYUME-2Q, 61 events across 5 users on the users_profile read at login;
 * VOLYUME-32 on the food library delta RPC).
 *
 * PGRST303 "JWT issued at future" is PostgREST refusing a token whose `iat`
 * sits ahead of the server clock. It is a second or two of skew, not a bad
 * token and not a signed-out user: the SAME token is accepted moments later.
 * The app failed the operation outright, and on the profile read that is the
 * worst possible response -- an empty profile row is how the app recognises a
 * user who has never onboarded.
 *
 * Written to FAIL if the retry is either removed or widened into a general
 * retry wrapper, because retrying an RLS rejection or a schema error would
 * silently double every failing write:
 *   - one skew then success returns the success;
 *   - two skews return the error exactly as an unwrapped call would;
 *   - a non-skew error is returned on the FIRST attempt, never retried;
 *   - a throw is handled the same way in both directions.
 *
 * Both call sites are pinned at source level, since the wrapper is only
 * useful where Sentry actually saw the skew.
 */
const fs = require('fs');
const path = require('path');

jest.mock('../authCallbackState', () => ({
  beginAuthFlow: jest.fn(async () => 'nonce-1'),
  clearAuthFlow: jest.fn(async () => {}),
}));

const { isClockSkewError, withClockSkewRetry } = require('../supabase');

const SKEW = { code: 'PGRST303', message: 'JWT issued at future', details: null, hint: null };
const NO_DELAY = { delayMs: 0, attempts: 2 };

describe('isClockSkewError', () => {
  test('recognises the PostgREST code', () => {
    expect(isClockSkewError({ code: 'PGRST303' })).toBe(true);
  });

  test('recognises the message even when the code is absent', () => {
    expect(isClockSkewError({ message: 'JWT issued at future check' })).toBe(true);
    expect(isClockSkewError(new Error('JWT issued at future'))).toBe(true);
  });

  test('is not fooled by other auth or permission failures', () => {
    expect(isClockSkewError({ code: '42501', message: 'permission denied' })).toBe(false);
    expect(isClockSkewError({ code: 'PGRST301', message: 'JWT expired' })).toBe(false);
    expect(isClockSkewError({ message: 'Network request failed' })).toBe(false);
    expect(isClockSkewError(null)).toBe(false);
    expect(isClockSkewError('PGRST303')).toBe(false);
  });
});

describe('withClockSkewRetry', () => {
  test('a first-call PGRST303 then success returns the success', async () => {
    const fn = jest.fn()
      .mockResolvedValueOnce({ data: null, error: SKEW })
      .mockResolvedValueOnce({ data: { id: 'u1' }, error: null });

    const res = await withClockSkewRetry(fn, NO_DELAY);

    expect(fn).toHaveBeenCalledTimes(2);
    expect(res).toEqual({ data: { id: 'u1' }, error: null });
  });

  test('two PGRST303s return the error, unchanged from an unwrapped call', async () => {
    const fn = jest.fn().mockResolvedValue({ data: null, error: SKEW });

    const res = await withClockSkewRetry(fn, NO_DELAY);

    expect(fn).toHaveBeenCalledTimes(2);
    expect(res.error).toBe(SKEW);
  });

  test('a non-skew error is NOT retried: one attempt, returned as-is', async () => {
    const rls = { code: '42501', message: 'permission denied for table users_profile' };
    const fn = jest.fn().mockResolvedValue({ data: null, error: rls });

    const res = await withClockSkewRetry(fn, NO_DELAY);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(res.error).toBe(rls);
  });

  test('a clean first call is not retried', async () => {
    const fn = jest.fn().mockResolvedValue({ data: [], error: null });
    await withClockSkewRetry(fn, NO_DELAY);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('a THROWN skew retries; a thrown non-skew propagates on the first attempt', async () => {
    const thrower = jest.fn()
      .mockRejectedValueOnce(Object.assign(new Error('JWT issued at future'), { code: 'PGRST303' }))
      .mockResolvedValueOnce({ data: 'ok', error: null });
    await expect(withClockSkewRetry(thrower, NO_DELAY)).resolves.toEqual({ data: 'ok', error: null });
    expect(thrower).toHaveBeenCalledTimes(2);

    const boom = jest.fn().mockRejectedValue(new Error('sqlite read failed'));
    await expect(withClockSkewRetry(boom, NO_DELAY)).rejects.toThrow('sqlite read failed');
    expect(boom).toHaveBeenCalledTimes(1);
  });

  test('an exhausted retry rethrows the last throw, it never swallows it', async () => {
    const boom = jest.fn().mockRejectedValue(Object.assign(new Error('skew'), { code: 'PGRST303' }));
    await expect(withClockSkewRetry(boom, NO_DELAY)).rejects.toThrow('skew');
    expect(boom).toHaveBeenCalledTimes(2);
  });

  test('the shipped default is a bounded single retry, not an unbounded loop', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'supabase.js'), 'utf8');
    expect(src).toMatch(/delayMs = 1500, attempts = 2/);
  });
});

describe('the two sites Sentry saw the skew on are wrapped', () => {
  const read = (rel) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8');

  test('the users_profile read on the session-restore pull (VOLYUME-2Q)', () => {
    const profiles = read('sync/tables/profiles.js');
    expect(profiles).toContain("import { withClockSkewRetry } from '../../supabase'");
    expect(profiles).toMatch(/const runRead = \(cols\) => withClockSkewRetry\(/);
  });

  test('the food library delta RPC (VOLYUME-32)', () => {
    const delta = read('food/libraryDelta.js');
    expect(delta).toMatch(/withClockSkewRetry\(\(\) => sb\.rpc\('food_library_pull'/);
  });
});
