/**
 * sentryNoisePaths.guard.test.js
 *
 * Pins the 2026-08-01 re-triage (docs/audit/sentry-triage-2026-07-27.md,
 * "RE-TRIAGE 2026-08-01"). The first session-guard fix failed in the field
 * because it verified ONE path and assumed the rest; build 48 kept producing
 * the same 42501s through the paths nobody enumerated. This file pins the
 * COMPLETE enumeration, so removing any single guard fails a test naming the
 * exact Sentry issue it would reopen.
 *
 * Source-level guards, matching the repo convention for module-private wiring.
 */

import fs from 'fs';
import path from 'path';

const read = (rel) => fs.readFileSync(path.resolve(__dirname, '..', '..', rel), 'utf8');
const SYNC = read('lib/sync.js');
const QUEUE = read('lib/syncQueue.js');
const SUPABASE = read('lib/supabase.js');
const DBCRYPTO = read('lib/dbCrypto.js');
// D145: the auth handlers live in the account sheet; the log keys keep
// their LoginScreen.* names for Sentry continuity.
const LOGIN = read('components/auth/AuthSheet.js');

describe('every push-on-save path is dead-session guarded (VOLYUME-2D/2F/2C/2J/28)', () => {
  test.each([
    ['sync.syncWorkout'],
    ['sync.syncMorningWeight'],
    ['sync.syncUserPref'],
    ['sync.syncExercises'],
    ['sync.syncNutritionTargets'],
    ['sync.deleteWorkoutFromCloud'],
    ['sync.bulkUploadLocalData'],
    ['sync.pullFromCloud'],
  ])('%s checks _blockedByDeadSession', (scope) => {
    expect(SYNC).toContain(`_blockedByDeadSession('${scope}')`);
  });

  test('the deferred workout/weigh-in still reaches the queue, never dropped', () => {
    // A guard that skips the push AND skips the enqueue is silent data loss.
    const workoutGuard = SYNC.split("_blockedByDeadSession('sync.syncWorkout')")[1].slice(0, 600);
    expect(workoutGuard).toContain("enqueueSyncOp('workout'");
    const weightGuard = SYNC.split("_blockedByDeadSession('sync.syncMorningWeight')")[1].slice(0, 600);
    expect(weightGuard).toContain("enqueueSyncOp('morning_weight'");
  });

  test('queue-drain mode still throws so the queue owns retry accounting (F-003)', () => {
    expect(SYNC).toMatch(/if \(rethrow\) throw new Error\('deferred: no usable session'\)/);
  });
});

describe('the retry driver itself is guarded (silent data loss by attrition)', () => {
  test('drainSyncQueue defers on a dead session instead of burning retry budgets', () => {
    // Each drain against a dead session consumes a retry per op toward
    // MAX_RETRIES on a guaranteed 42501; ops that hit the cap never retry
    // again. The drain must defer, leaving retry counts untouched.
    expect(QUEUE).toMatch(/hasLiveSession\(\)/);
    expect(QUEUE).toMatch(/deferred: true/);
  });

  test('and it fails OPEN: only an explicit false blocks the drain', () => {
    expect(QUEUE).toMatch(/if \(live === false\)/);
  });
});

describe('locked-keychain is one classification everywhere (VOLYUME-2E residue)', () => {
  test('supabase adapter: get, set AND remove all classify locked as expected-state', () => {
    // The residual build-48 events came from set/remove keeping error level
    // after getItem was fixed.
    const hits = SUPABASE.match(/_isKeychainLocked\(e\)/g) || [];
    expect(hits.length).toBeGreaterThanOrEqual(3);
    // Each error-level log must be the ELSE branch of the locked check, never
    // unconditional -- an unconditional one is exactly the build-48 residue.
    expect(SUPABASE).toMatch(/else log\.logError\('supabase\.secureStore\.setItem', e\)/);
    expect(SUPABASE).toMatch(/else log\.logError\('supabase\.secureStore\.removeItem', e\)/);
    expect(SUPABASE).toMatch(/else log\.logError\('supabase\.secureStore\.getItem', e\)/);
  });

  test('dbCrypto classifies locked reads as info without touching the F-001 contract', () => {
    expect(DBCRYPTO).toMatch(/_isKeychainLocked\(/);
    expect(DBCRYPTO).toMatch(/dbCrypto\.getKey\.locked/);
    // The contract that must never soften: a read failure is still a FAILURE
    // (never "no key"), and the unavailable status still returns null key.
    expect(DBCRYPTO).toMatch(/failed: true, locked: allLocked/);
    expect(DBCRYPTO).toMatch(/key: null, status: 'unavailable', locked/);
  });

  test('dbCrypto keyUnavailable: locked defers at info, genuine loss stays an error, throw identical', () => {
    expect(DBCRYPTO).toMatch(/dbCrypto\.keyUnavailable\.locked/);
    expect(DBCRYPTO).toMatch(/else logError\('dbCrypto\.keyUnavailable', err, \{\}\);/);
    // The throw itself must survive both branches -- callers rely on it to
    // refuse opening an encrypted DB without its key.
    expect(DBCRYPTO).toMatch(/if \(locked\) logInfo\([\s\S]{0,220}?\n\s*else logError\('dbCrypto\.keyUnavailable'[\s\S]{0,80}?throw err;/);
  });

  test('a mixed failure is never softened: one non-locked error keeps the error level', () => {
    expect(DBCRYPTO).toMatch(/allLocked = false; logError\('dbCrypto\.getKey', e/);
  });
});

describe('Apple device-state sign-in is a handled condition, not an error (VOLYUME-2B)', () => {
  test('apple_device_state logs at info; other provider failures stay errors', () => {
    expect(LOGIN).toMatch(/logInfo\('LoginScreen\.oauth\.deviceState'/);
    expect(LOGIN).toMatch(/logError\('LoginScreen\.oauth\.providerError'/);
    // The remedy toast the info-classification depends on must still exist.
    expect(LOGIN).toContain('Check you are signed in to iCloud');
  });
});

describe('a mistyped password is ordinary use, not an error (VOLYUME-2Z)', () => {
  test('invalid login credentials logs at info; every other provider error stays an error', () => {
    // The classifier itself: Supabase answers a wrong email/password pair with
    // a 400 whose message is exactly this string.
    expect(LOGIN).toMatch(/status === 400/);
    expect(LOGIN).toMatch(/invalid login credentials/i);
    // The info branch and the untouched error branch must BOTH still exist:
    // an "improvement" that demoted every provider error would hide real
    // sign-in breakage (a bad key, a project outage) behind the same change.
    expect(LOGIN).toMatch(/logInfo\('LoginScreen\.email\.providerError'/);
    expect(LOGIN).toMatch(/logError\('LoginScreen\.email\.providerError'/);
  });

  test('what the user sees is unchanged: the copy mapping still runs for both', () => {
    // The classification is a logging decision only. authErrorMessage must be
    // reached after the branch, not inside one arm of it.
    const body = LOGIN.split('LoginScreen.email.providerError')[2] ?? '';
    expect(body).toContain('authErrorMessage(error)');
  });
});
