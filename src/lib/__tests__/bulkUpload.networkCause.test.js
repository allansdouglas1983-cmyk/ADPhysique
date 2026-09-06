/**
 * bulkUpload.networkCause.test.js
 *
 * Pins ruling 3 of the 2026-09-06 Sentry triage: the legacy bulk push must
 * STATE the cause of its aggregate failures instead of leaving the Sentry
 * noise gate to guess.
 *
 * "partial push 400 of 600" (VOLYUME-28) and "sync.push.legacy.errors"
 * (VOLYUME-2C, 401 events) carry no network wording of their own, so the gate
 * fell back to NetInfo -- which reports "connected" all through the flaky cell
 * handover that produced both issues. The window now records the last error
 * message it saw and whether EVERY counted error matched the network
 * signature, and the gate reads that.
 *
 * Written to FAIL if allNetwork is ever allowed to claim more than it knows:
 * ONE non-network failure in the window must flip it false, because that is
 * the case where the aggregate is real signal about a broken push.
 */

jest.mock('../supabase', () => ({ getSupabaseClient: jest.fn() }));
jest.mock('../errorLog', () => ({
  logError: jest.fn(),
  logWarn: jest.fn(),
  logInfo: jest.fn(),
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
  removeItem: jest.fn().mockResolvedValue(undefined),
  getAllKeys: jest.fn().mockResolvedValue([]),
  multiGet: jest.fn().mockResolvedValue([]),
}));
jest.mock('../database');

const { getSupabaseClient } = require('../supabase');
const db = require('../database');
const { logWarn } = require('../errorLog');
const { bulkUploadLocalData } = require('../sync');

function makeChain(result) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: async () => result,
    then: (resolve) => resolve(result),
  };
  return chain;
}
// `errorFor(table)` decides what each table's write resolves to, so a run can
// mix a network failure and a real one in the same window.
function clientWith(errorFor) {
  return {
    from: jest.fn((table) => {
      const writeResult = { error: errorFor(table), data: [] };
      return {
        upsert: jest.fn(() => makeChain(writeResult)),
        insert: jest.fn(() => makeChain(writeResult)),
        update: jest.fn(() => makeChain(writeResult)),
        delete: jest.fn(() => makeChain(writeResult)),
        select: jest.fn(() => makeChain({ data: [], error: null })),
      };
    }),
    rpc: jest.fn(async () => ({ data: null, error: null })),
  };
}

const TIMEOUT = { message: 'TypeError: Network request timed out', code: null };
const RLS = { message: 'permission denied for table routines', code: '42501' };

beforeEach(() => {
  jest.clearAllMocks();
  for (const k of Object.keys(db)) {
    if (typeof db[k] === 'function' && typeof db[k].mockResolvedValue === 'function') {
      db[k].mockResolvedValue([]);
    }
  }
  db.getAllProgrammes.mockResolvedValue([{ id: 'p1', name: 'Push/Pull', isLibrary: false, isActive: true }]);
  db.getAllRoutinesForUser.mockResolvedValue([{ id: 'r1', name: 'Upper', programmeId: 'p1' }]);
});

test('an all-network window reports allNetwork true and the message that caused it', async () => {
  getSupabaseClient.mockReturnValue(clientWith(() => TIMEOUT));

  const res = await bulkUploadLocalData('cloud-uid', 'local-uid');

  expect(res.errors).toBeGreaterThan(0);
  expect(res.allNetwork).toBe(true);
  expect(res.lastError).toBe('TypeError: Network request timed out');
});

test('ONE non-network failure in the window flips allNetwork false', async () => {
  // Every table times out except routines, which is a real RLS rejection.
  getSupabaseClient.mockReturnValue(clientWith(t => (t === 'routines' ? RLS : TIMEOUT)));

  const res = await bulkUploadLocalData('cloud-uid', 'local-uid');

  expect(res.errors).toBeGreaterThan(0);
  expect(res.allNetwork).toBe(false);
});

test('a clean push reports no cause to read', async () => {
  getSupabaseClient.mockReturnValue(clientWith(() => null));

  const res = await bulkUploadLocalData('cloud-uid', 'local-uid');

  expect(res.errors).toBe(0);
  expect(res.lastError).toBeNull();
});

test('the window resets between runs: a clean run never inherits the last one\'s cause', async () => {
  getSupabaseClient.mockReturnValue(clientWith(t => (t === 'routines' ? RLS : TIMEOUT)));
  await bulkUploadLocalData('cloud-uid', 'local-uid');

  getSupabaseClient.mockReturnValue(clientWith(() => TIMEOUT));
  const res = await bulkUploadLocalData('cloud-uid', 'local-uid');

  expect(res.allNetwork).toBe(true);
});

test("the 'partial push' warning carries the cause the gate reads (VOLYUME-28)", async () => {
  getSupabaseClient.mockReturnValue(clientWith(() => TIMEOUT));

  await bulkUploadLocalData('cloud-uid', 'local-uid');

  const partial = logWarn.mock.calls.find(c => c[1] === 'partial push');
  expect(partial).toBeDefined();
  expect(partial[2]).toMatchObject({ pushed: 0, total: 1, allNetwork: true });
  expect(partial[2].lastError).toBe('TypeError: Network request timed out');
});

test("'partial push' stays visible when the cause was not the network", async () => {
  getSupabaseClient.mockReturnValue(clientWith(t => (t === 'routines' ? RLS : null)));

  await bulkUploadLocalData('cloud-uid', 'local-uid');

  const partial = logWarn.mock.calls.find(c => c[1] === 'partial push');
  expect(partial).toBeDefined();
  expect(partial[2].allNetwork).toBe(false);
});

describe('the runner forwards the cause onto the legacy aggregate (VOLYUME-2C)', () => {
  const fs = require('fs');
  const path = require('path');
  const RUNNER = fs.readFileSync(path.resolve(__dirname, '..', 'sync', 'runner.js'), 'utf8');

  test('sync.push.legacy.errors includes lastError and allNetwork', () => {
    const crumb = RUNNER.split("'sync.push.legacy.errors'")[1].slice(0, 300);
    expect(crumb).toContain('lastError: upload.lastError');
    expect(crumb).toContain('allNetwork: upload.allNetwork === true');
  });
});
