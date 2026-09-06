/**
 * networkNoiseGate.test.js
 *
 * Pins the 2026-09-06 Sentry triage. One iOS TestFlight session on a flaky
 * connection during a workout produced the six noisiest unresolved issues in
 * the project -- 736 "Network request timed out", 886 db.upsert.failed whose
 * errorMessage WAS that timeout, 401 sync.push.legacy.errors, a "partial push
 * 400 of 600", 201 capabilityConstraints pushUpsert errors and a syncCrumb
 * aggregate. Every one describes the same expected offline-first condition, so
 * every one belongs on the breadcrumb trail rather than in the issue stream.
 *
 * Written to FAIL if the gate is either too narrow (the noise returns) or too
 * wide (a real defect is silently swallowed), because the second failure mode
 * is far worse than the first:
 *
 *   1. the shared signature matches every shape the live project actually
 *      produced, and does NOT match ordinary text that merely mentions loading;
 *   2. captureError is gated on BOTH halves -- a sync/supabase scope AND a
 *      network cause. A sync-scope error with a real cause (RLS, schema drift)
 *      still ships, and a network error outside sync still ships;
 *   3. an aggregate that states its own cause (extra.allNetwork === true) is
 *      demoted, and one that does not is untouched;
 *   4. observability.recordOutcome's extra.errorMessage carries the network
 *      cause, so db.*.failed is covered without any special case.
 */

const mockInit = jest.fn();
const mockWithScope = jest.fn((cb) => cb({
  setLevel: jest.fn(), setTag: jest.fn(), setExtra: jest.fn(),
}));
const mockCaptureException = jest.fn();
const mockCaptureMessage = jest.fn();
const mockAddBreadcrumb = jest.fn();

jest.mock('@sentry/react-native', () => ({
  init: (...a) => mockInit(...a),
  setUser: jest.fn(),
  withScope: (...a) => mockWithScope(...a),
  captureException: (...a) => mockCaptureException(...a),
  captureMessage: (...a) => mockCaptureMessage(...a),
  addBreadcrumb: (...a) => mockAddBreadcrumb(...a),
}));

const { NETWORK_NOISE, isNetworkNoise } = require('../observability/networkNoise');

describe('the shared network-unreachable signature', () => {
  // Every string here is a real message shape from the live Sentry project.
  test.each([
    ['Network request failed'],
    ['TypeError: Network request failed'],
    ['TypeError: Network request timed out'],
    ['AuthRetryableFetchError'],
    ['AuthRetryableFetchError: Failed to fetch'],
    ['Load failed'],
    ['TypeError: Load failed'],
    ['The Internet connection appears to be offline.'],
    ['Could not connect to the server.'],
    ['read ECONNRESET'],
    ['connect ETIMEDOUT 10.0.0.1:443'],
    ['getaddrinfo ENOTFOUND db.supabase.co'],
    ['Software caused connection abort'],
  ])('matches %j', (sample) => {
    expect(NETWORK_NOISE.test(sample)).toBe(true);
    expect(isNetworkNoise(sample)).toBe(true);
  });

  test.each([
    ['new row violates row-level security policy for table "routines"'],
    ['permission denied for table workout_sets'],
    ['Could not find the \'position\' column of \'routines\' in the schema cache'],
    ['duplicate key value violates unique constraint'],
    ['Image load failed for the progress photo'],
    ['Plan load failed while reading SQLite'],
    ['JWT issued at future'],
  ])('does NOT match %j', (sample) => {
    expect(NETWORK_NOISE.test(sample)).toBe(false);
    expect(isNetworkNoise(sample)).toBe(false);
  });

  test('finds a network cause buried inside an extra bag (recordOutcome shape)', () => {
    // This is exactly what observability.recordOutcome builds for
    // db.upsert.failed supabase.routine_exercises (VOLYUME-2D, 886 events).
    expect(isNetworkNoise({
      durationMs: 30021, op: 'upsert', table: 'routine_exercises', threw: true,
      errorCode: 'thrown', errorMessage: 'TypeError: Network request timed out',
    })).toBe(true);
  });

  test('a stringified "Load failed" extra still matches, a prose one does not', () => {
    expect(isNetworkNoise({ errorMessage: 'Load failed' })).toBe(true);
    expect(isNetworkNoise({ note: 'the image load failed twice' })).toBe(false);
  });

  test('never throws: a circular structure fails open to visibility', () => {
    const circular = {}; circular.self = circular;
    expect(isNetworkNoise(circular)).toBe(false);
  });
});

describe('captureError gate (VOLYUME-2H): scope AND cause, never one alone', () => {
  let sentry;

  beforeEach(() => {
    jest.resetModules();
    mockInit.mockClear();
    mockCaptureException.mockClear();
    mockCaptureMessage.mockClear();
    mockAddBreadcrumb.mockClear();
    process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://publicKey@o0.ingest.sentry.io/123';
    sentry = require('../sentry');
    sentry.initSentry({ environment: 'test' });
  });

  test('a sync-scope network error becomes a breadcrumb, not an event', () => {
    sentry.captureError(new Error('TypeError: Network request failed'), {
      scope: 'sync.tables.capabilityConstraints.pushUpsert',
    });
    expect(mockCaptureException).not.toHaveBeenCalled();
    expect(mockAddBreadcrumb).toHaveBeenCalledTimes(1);
    expect(mockAddBreadcrumb.mock.calls[0][0].category)
      .toBe('sync.tables.capabilityConstraints.pushUpsert');
  });

  test('a supabase-scope timeout is gated too', () => {
    sentry.captureError(new Error('Network request timed out'), { scope: 'supabase.routine_exercises' });
    expect(mockCaptureException).not.toHaveBeenCalled();
    expect(mockAddBreadcrumb).toHaveBeenCalledTimes(1);
  });

  test('a sync-scope NON-network error still ships as an event', () => {
    sentry.captureError(new Error('new row violates row-level security policy'), {
      scope: 'sync.tables.profiles.pushUpsert',
    });
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(mockAddBreadcrumb).not.toHaveBeenCalled();
  });

  test('a network error OUTSIDE sync/supabase still ships as an event', () => {
    sentry.captureError(new Error('Network request failed'), { scope: 'progressScan.upload' });
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(mockAddBreadcrumb).not.toHaveBeenCalled();
  });

  test('an unscoped network error still ships (no scope is not a sync scope)', () => {
    sentry.captureError(new Error('Network request failed'));
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });

  test('a coerced PostgREST reject is judged on originalError, not just the message', () => {
    // supabase-js rejects with a plain object; captureError wraps it and keeps
    // the original in extra.originalError.
    sentry.captureError(
      { code: null, message: 'Load failed', details: null, hint: null },
      { scope: 'sync.push.legacy' },
    );
    expect(mockCaptureException).not.toHaveBeenCalled();
    expect(mockAddBreadcrumb).toHaveBeenCalledTimes(1);
  });

  test('a PostgREST reject with a REAL code still ships', () => {
    sentry.captureError(
      { code: '42501', message: 'permission denied for table routines' },
      { scope: 'sync.push.legacy' },
    );
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });
});

describe('captureWarning gate: aggregates that state their own cause', () => {
  let sentry;

  beforeEach(() => {
    jest.resetModules();
    mockInit.mockClear();
    mockCaptureMessage.mockClear();
    mockAddBreadcrumb.mockClear();
    process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://publicKey@o0.ingest.sentry.io/123';
    sentry = require('../sentry');
    sentry.initSentry({ environment: 'test' });
  });

  test('allNetwork === true demotes an aggregate whose own text says nothing (VOLYUME-2C/28)', () => {
    sentry.captureWarning('sync.push.legacy.errors', {
      scope: 'sync.push.legacy',
      extra: { errors: 12, lastError: 'Network request timed out', allNetwork: true },
    });
    expect(mockCaptureMessage).not.toHaveBeenCalled();
    expect(mockAddBreadcrumb).toHaveBeenCalledTimes(1);
  });

  test('allNetwork === false keeps the aggregate visible: one real failure is signal', () => {
    sentry.captureWarning('partial push', {
      scope: 'sync._pushRoutines',
      extra: { pushed: 400, total: 600, lastError: 'permission denied', allNetwork: false },
    });
    expect(mockCaptureMessage).toHaveBeenCalledTimes(1);
    expect(mockAddBreadcrumb).not.toHaveBeenCalled();
  });

  test('an aggregate with no cause summary at all is untouched by this rule', () => {
    sentry.captureWarning('partial push', {
      scope: 'sync._pushRoutines',
      extra: { pushed: 400, total: 600 },
    });
    expect(mockCaptureMessage).toHaveBeenCalledTimes(1);
  });

  test('db.upsert.failed is covered by the widened signature via extra.errorMessage', () => {
    sentry.captureWarning('db.upsert.failed supabase.routine_exercises', {
      scope: 'supabase.routine_exercises',
      extra: {
        durationMs: 30021, op: 'upsert', table: 'routine_exercises', threw: true,
        errorCode: 'thrown', errorMessage: 'TypeError: Network request timed out',
      },
    });
    expect(mockCaptureMessage).not.toHaveBeenCalled();
    expect(mockAddBreadcrumb).toHaveBeenCalledTimes(1);
  });

  test('db.upsert.failed with a REAL PostgREST code still ships', () => {
    sentry.captureWarning('db.upsert.failed supabase.routines 42501', {
      scope: 'supabase.routines',
      extra: { op: 'upsert', table: 'routines', errorCode: '42501', errorMessage: 'permission denied' },
    });
    expect(mockCaptureMessage).toHaveBeenCalledTimes(1);
  });
});
