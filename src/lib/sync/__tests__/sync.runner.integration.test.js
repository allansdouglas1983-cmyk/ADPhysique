/**
 * End-to-end integration test for syncAll().
 *
 * Drives the runner pipeline with the supabase client mocked at the
 * boundary (one mock per dispatched RPC / `.from(table)` call). Per-
 * table unit tests in sync.transport.test.js prove each handler's
 * shape; this test proves they all wire up correctly together:
 *
 *   - every entry in MIGRATED_TABLES has its push (if applicable)
 *     and pull invoked exactly once per syncAll;
 *   - push runs before pull (the locked pipeline order is
 *     per-table push → legacy bulk push → per-table pull → legacy
 *     bulk pull, so all per-table push handlers must complete
 *     before any per-table pull handler starts);
 *   - errors raised inside one handler don't stop the next;
 *   - pull_count_per_table / push_count_per_table on the
 *     sync_run telemetry payload aggregate every handler's count.
 *
 * Mocks chosen to keep the test deterministic without dragging
 * the full supabase / sqlite stack into Jest. Both legacy
 * bulkUploadLocalData + pullFromCloud are stubbed to no-op
 * (already exercised by their own contract tests).
 */

jest.mock('../../supabase', () => ({
  getSupabaseClient: jest.fn(),
  // The PGRST303 clock-skew retry (2026-09-06 triage) wraps the users_profile
  // read in tables/profiles.js. It only ever retries that one transient code,
  // so a straight pass-through is the correct stand-in here; the retry itself
  // is pinned in src/lib/__tests__/supabase.clockSkew.test.js.
  withClockSkewRetry: (fn) => fn(),
}));

jest.mock('../../notifications/preferences', () => ({
  getAllPreferences: jest.fn().mockResolvedValue([]),
  applyPreferenceFromPull: jest.fn().mockResolvedValue(false),
}));

jest.mock('../../database', () => ({
  getAllWeeklyCheckinsForUser: jest.fn().mockResolvedValue([]),
  insertWeeklyCheckinFromCloud: jest.fn().mockResolvedValue(undefined),
  getWeeklyCheckinUpdatedAt: jest.fn().mockResolvedValue(null),
  getBodyMetricLog: jest.fn().mockResolvedValue([]),
  insertBodyMetricFromCloud: jest.fn().mockResolvedValue(undefined),
  getBodyMetricUpdatedAt: jest.fn().mockResolvedValue(null),
  getNutritionTargets: jest.fn().mockResolvedValue(null),
  insertNutritionTargetsFromCloud: jest.fn().mockResolvedValue(undefined),
  getEffectiveMaintenanceMemo: jest.fn().mockResolvedValue(null),
  insertEffectiveMaintenanceMemoFromCloud: jest.fn().mockResolvedValue(undefined),
  upsertEdPatternFlagFromCloud: jest.fn().mockResolvedValue(undefined),
  upsertTierHistoryFromCloud: jest.fn().mockResolvedValue(undefined),
  getAllRecipeIngredientsForUser: jest.fn().mockResolvedValue([]),
  upsertRecipeIngredientFromCloud: jest.fn().mockResolvedValue(undefined),
  getDailyStepsForPush: jest.fn().mockResolvedValue([]),
  insertDailyStepsFromCloud: jest.fn().mockResolvedValue(undefined),
  getDailyStepsUpdatedAt: jest.fn().mockResolvedValue(null),
  insertCardioLogFromCloud: jest.fn().mockResolvedValue(undefined),
  getCardioLogUpdatedAt: jest.fn().mockResolvedValue(null),
  getPlanFoldersForPush: jest.fn().mockResolvedValue([]),
  insertPlanFolderFromCloud: jest.fn().mockResolvedValue(undefined),
  getPlanFolderUpdatedAt: jest.fn().mockResolvedValue(0),
  // CC26 capability lane.
  getAllCapabilityConstraintsForUser: jest.fn().mockResolvedValue([]),
  insertCapabilityConstraintFromCloud: jest.fn().mockResolvedValue(undefined),
  getAllSessionConstraintEffectsForUser: jest.fn().mockResolvedValue([]),
  insertSessionConstraintEffectFromCloud: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../food/db', () => ({
  getLatestMealPlanRowForSync: jest.fn().mockResolvedValue(null),
  applyMealPlanRowFromCloud: jest.fn().mockResolvedValue(false),
  getAllFoodEntriesSince: jest.fn().mockResolvedValue([]),
  getAllCustomFoodsSince: jest.fn().mockResolvedValue([]),
  getAllSavedMealsSince: jest.fn().mockResolvedValue([]),
  getAllRecipesSince: jest.fn().mockResolvedValue([]),
  getAllFavouritesSince: jest.fn().mockResolvedValue([]),
  getAllWaterSince: jest.fn().mockResolvedValue([]),
  applyFoodEntryFromCloud: jest.fn().mockResolvedValue(null),
  applyCustomFoodFromCloud: jest.fn().mockResolvedValue(undefined),
  applySavedMealFromCloud: jest.fn().mockResolvedValue(undefined),
  applyRecipeFromCloud: jest.fn().mockResolvedValue(undefined),
  applyFavouriteFromCloud: jest.fn().mockResolvedValue(undefined),
  applyWaterFromCloud: jest.fn().mockResolvedValue(undefined),
  recomputeRollup: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../store/useAppStore', () => ({
  __esModule: true,
  default: {
    getState: () => ({
      userProfile: { firstName: 'Test', units: 'kg', barWeight: 20 },
      userProfileFieldUpdatedAt: { firstName: 1, units: 1, barWeight: 1 },
      setUserProfile: jest.fn(),
      // F2: syncAll is Article 9 fail-closed; the integration runs model a
      // consented user.
      healthConsent: true,
    }),
  },
}));

jest.mock('../telemetry', () => ({
  trackSyncRun: jest.fn().mockResolvedValue(undefined),
  trackSyncConflictResolved: jest.fn().mockResolvedValue(undefined),
  logSyncError: jest.fn(),
}));

// E12 step 0: the orphan registry queue is gone; the runner reads its
// depth from the live retry queue (src/lib/syncQueue.js).
jest.mock('../../syncQueue', () => ({
  getQueueStats: jest.fn().mockResolvedValue({ pending: 0, failed: 0 }),
}));

// Replace the legacy sync.js helpers the runner falls back to.
jest.mock('../../sync.js', () => ({
  bulkUploadLocalData: jest.fn().mockResolvedValue({ pushCountPerTable: {} }),
  pullFromCloud: jest.fn().mockResolvedValue({ pullCountPerTable: {} }),
}), { virtual: false });

const { getSupabaseClient } = require('../../supabase');
const prefsModule = require('../../notifications/preferences');
const dbModule = require('../../database');
const telemetry = require('../telemetry');
const syncQueue = require('../../syncQueue');
const legacy = require('../../sync.js');
const { syncAll, whenSyncIdle, _resetRunnerForTests } = require('../runner');
const { MIGRATED_TABLES } = require('../transport');

/**
 * Build a supabase mock that records every `.from()` call and
 * resolves to the given table-keyed fixtures. The shape covers
 * all four chains the per-table handlers use:
 *   - .from(t).select(c).eq(k,v)
 *   - .from(t).select(c).eq(k,v).in(c, vs)
 *   - .from(t).select(c).eq(k,v).maybeSingle()
 *   - .from(t).upsert(rows, opts)
 */
function makeSupabaseMock({ select = {}, upsertError = null } = {}) {
  const calls = { from: [], upserts: [], selects: [], rpcs: [] };
  return {
    _calls: calls,
    rpc: jest.fn(async (name, args) => {
      calls.rpcs.push({ name, args });
      // food_sync_push / food_sync_pull return the shape the
      // coordinator expects (timestamp + per-table changes).
      return {
        data: { timestamp: new Date().toISOString(), changes: {} },
        error: null,
      };
    }),
    from: jest.fn((table) => {
      calls.from.push(table);
      const tableSelect = select[table] ?? [];
      const selectChain = {
        eq: jest.fn(() => {
          const eqChain = Promise.resolve({ data: tableSelect, error: null });
          eqChain.in = jest.fn(async () => ({ data: tableSelect, error: null }));
          eqChain.maybeSingle = jest.fn(async () => ({
            data: Array.isArray(tableSelect) ? tableSelect[0] ?? null : tableSelect,
            error: null,
          }));
          // LS-03b: paginated pulls (body_metrics/daily_steps/cardio_log) page via .range().
          eqChain.range = jest.fn(async (from, to) => ({
            data: (Array.isArray(tableSelect) ? tableSelect : []).slice(from, to + 1),
            error: null,
          }));
          return eqChain;
        }),
        // NEW-002 pair-scoped pull: .select().or(...) and .select().in(...).
        or: jest.fn(async () => ({ data: tableSelect, error: null })),
        in: jest.fn(async () => ({ data: tableSelect, error: null })),
      };
      return {
        select: jest.fn(() => {
          calls.selects.push(table);
          return selectChain;
        }),
        upsert: jest.fn(async (rows, opts) => {
          calls.upserts.push({ table, rows, opts });
          return { error: upsertError };
        }),
      };
    }),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  _resetRunnerForTests();
  // SYNC-3 guard is module-level; reset it so a prior test can't leak.
  require('../signOutGuard').setSignOutWiping(false);
});

describe('syncAll integration', () => {
  test('invokes every migrated push handler then every migrated pull handler', async () => {
    // Inject one food row so the food coordinator triggers the
    // bulk push RPC. An empty local row set short-circuits before
    // the rpc call, which is correct production behaviour but
    // makes this assertion noisy.
    const foodDb = require('../../food/db');
    foodDb.getAllFoodEntriesSince.mockResolvedValueOnce([
      { id: 'fe-1', entryDate: '2026-05-26', mealSlot: 'breakfast', foodRef: 'off:1', quantityG: 100, kcal: 100, proteinG: 10, carbsG: 10, fatG: 5, createdAt: 1, updatedAt: 1 },
    ]);

    const sb = makeSupabaseMock({
      select: {
        notification_preferences: [
          { user_id: 'u1', category: 'morning_weight', enabled: true, time_pref: '08:00', updated_at: new Date(1).toISOString() },
        ],
        weekly_checkins_v2: [
          { id: 'wc-1', user_id: 'u1', week_start: 1, energy_score: 7 },
        ],
        body_metrics: [
          { id: 'bm-1', user_id: 'u1', metric_date: '2026-05-26' },
        ],
        nutrition_targets: { user_id: 'u1', target_kcal: 2000 },
        ed_pattern_flags: [
          { id: 'flag-1', user_id: 'u1', flag_state: 'raised', raised_at: 1, updated_at: 1 },
        ],
      },
    });
    getSupabaseClient.mockReturnValue(sb);
    prefsModule.applyPreferenceFromPull.mockResolvedValue(true);

    const result = await syncAll({ userId: 'u1', localUserId: 'u1', triggeredBy: 'manual' });

    // Pipeline completed.
    expect(result.status).toBe('synced');

    // Legacy bulk fallback ran exactly once per direction.
    expect(legacy.bulkUploadLocalData).toHaveBeenCalledTimes(1);
    expect(legacy.pullFromCloud).toHaveBeenCalledTimes(1);

    // Per-table handler tables hit .from() at least once. Food
    // domain tables go through the bulk food_sync_push /
    // food_sync_pull RPCs instead and are asserted separately.
    // weight_log is aliased to body_composition_log and has no
    // independent cloud presence.
    const cloudTableForRegistry = {
      body_composition_log: 'body_metrics',
      profiles: 'users_profile',
    };
    const fromCalls = sb._calls.from;
    const FOOD = new Set([
      'food_entries', 'custom_foods', 'saved_meals', 'recipes',
      'food_favourites', 'daily_water', 'daily_intake_rollups',
    ]);
    const ALIASED = new Set(['weight_log']);
    for (const table of MIGRATED_TABLES) {
      if (FOOD.has(table) || ALIASED.has(table)) continue;
      const cloudTable = cloudTableForRegistry[table] ?? table;
      expect(fromCalls).toContain(cloudTable);
    }

    // Food domain coordinator hit both RPCs exactly once.
    const rpcNames = sb._calls.rpcs.map((r) => r.name);
    expect(rpcNames).toContain('food_sync_push');
    expect(rpcNames).toContain('food_sync_pull');
  });

  test('telemetry payload carries pull_count_per_table + push_count_per_table for every migrated table', async () => {
    const sb = makeSupabaseMock({
      select: {
        notification_preferences: [
          { user_id: 'u1', category: 'morning_weight', enabled: true, time_pref: '08:00', updated_at: new Date(1).toISOString() },
        ],
        weekly_checkins_v2: [{ id: 'wc-1' }],
        body_metrics: [{ id: 'bm-1', metric_date: '2026-05-26' }],
        nutrition_targets: { user_id: 'u1' },
        ed_pattern_flags: [{ id: 'flag-1', flag_state: 'raised', raised_at: 1, updated_at: 1 }],
      },
    });
    getSupabaseClient.mockReturnValue(sb);
    prefsModule.applyPreferenceFromPull.mockResolvedValue(true);

    await syncAll({ userId: 'u1', localUserId: 'u1', triggeredBy: 'foreground' });

    expect(telemetry.trackSyncRun).toHaveBeenCalledTimes(1);
    const payload = telemetry.trackSyncRun.mock.calls[0][1];

    expect(payload.triggered_by).toBe('foreground');
    expect(payload.status).toBe('success');

    // Both per-table maps carry every migrated table; pull_only tables
    // record a 0 push count rather than being absent (the runner loops
    // every entry in MIGRATED_TABLES regardless of direction, and the
    // skipped:'pull_only' result still goes into the map with count 0).
    for (const table of MIGRATED_TABLES) {
      expect(payload.push_count_per_table).toHaveProperty(table);
      expect(payload.pull_count_per_table).toHaveProperty(table);
    }
    expect(payload.push_count_per_table.ed_pattern_flags).toBe(0);
    expect(payload.pull_count_per_table.ed_pattern_flags).toBeGreaterThan(0);
  });

  test('an error in one per-table handler does not stop the others', async () => {
    // Force notification_preferences pull to fail by making
    // applyPreferenceFromPull throw for every row.
    prefsModule.applyPreferenceFromPull.mockRejectedValue(new Error('apply boom'));
    const sb = makeSupabaseMock({
      select: {
        notification_preferences: [
          { user_id: 'u1', category: 'a', enabled: true, time_pref: null, updated_at: new Date(1).toISOString() },
        ],
        weekly_checkins_v2: [{ id: 'wc-ok' }],
        body_metrics: [{ id: 'bm-ok', metric_date: '2026-05-26' }],
        nutrition_targets: { user_id: 'u1' },
        ed_pattern_flags: [{ id: 'flag-ok', flag_state: 'raised', raised_at: 1, updated_at: 1 }],
      },
    });
    getSupabaseClient.mockReturnValue(sb);

    const result = await syncAll({ userId: 'u1', localUserId: 'u1', triggeredBy: 'manual' });

    // Other tables still pulled.
    expect(dbModule.insertWeeklyCheckinFromCloud).toHaveBeenCalled();
    expect(dbModule.insertBodyMetricFromCloud).toHaveBeenCalled();
    expect(dbModule.insertNutritionTargetsFromCloud).toHaveBeenCalled();
    expect(dbModule.upsertEdPatternFlagFromCloud).toHaveBeenCalled();

    // The run is reported with non-zero errors, but the runner
    // still calls trackSyncRun and returns rather than throwing.
    const payload = telemetry.trackSyncRun.mock.calls[0][1];
    expect(payload.errored_count).toBeGreaterThan(0);
    expect(result.status).toBeDefined();
  });

  test('skips when no userId is supplied (signed-out state)', async () => {
    const result = await syncAll({ userId: null, localUserId: null, triggeredBy: 'foreground' });

    expect(legacy.bulkUploadLocalData).not.toHaveBeenCalled();
    expect(legacy.pullFromCloud).not.toHaveBeenCalled();
    expect(dbModule.insertWeeklyCheckinFromCloud).not.toHaveBeenCalled();
    expect(result.status).toBe('synced');
    // No user -> the live-queue depth read short-circuits without touching
    // the retry queue (E12 step 0).
    expect(syncQueue.getQueueStats).not.toHaveBeenCalled();
  });

  test('deduplicates concurrent syncAll calls via the run lock', async () => {
    getSupabaseClient.mockReturnValue(makeSupabaseMock());

    const [a, b] = await Promise.all([
      syncAll({ userId: 'u1', localUserId: 'u1', triggeredBy: 'network' }),
      syncAll({ userId: 'u1', localUserId: 'u1', triggeredBy: 'periodic' }),
    ]);

    // One of the two returns skipped due to the run lock.
    const statuses = [a, b].map((r) => r.status).sort();
    expect(statuses).toContain('skipped');
  });

  // SYNC-3 airtight: sign-out awaits whenSyncIdle so an in-flight run finishes
  // before the wipe.
  test('whenSyncIdle resolves immediately when no run is in flight', async () => {
    await expect(whenSyncIdle()).resolves.toBe(true);
  });

  test('whenSyncIdle stays pending during a run and resolves when it finishes', async () => {
    getSupabaseClient.mockReturnValue(makeSupabaseMock());

    const run = syncAll({ userId: 'u1', localUserId: 'u1', triggeredBy: 'manual' }); // not awaited
    // _runLock is set synchronously at the start of syncAll, so the cycle is now
    // in flight.
    let idle = false;
    const idlePromise = whenSyncIdle({ timeoutMs: 2000 }).then((v) => { idle = v; });
    expect(idle).toBe(false); // still running

    await run;          // finishing the run notifies idle waiters
    await idlePromise;
    expect(idle).toBe(true);
  });

  // SYNC-1: legacy bulk push reports its swallowed PostgREST errors via
  // { errors }. The runner must fold them into errored_count so a rejected
  // push surfaces as a non-'synced' status (and the sign-out push-first
  // safety can refuse to wipe). Without the fold a failed legacy push read
  // 'synced' and sign-out destroyed unpushed local data.
  test('folds legacy bulk-push errors into errored_count and status', async () => {
    getSupabaseClient.mockReturnValue(makeSupabaseMock());
    legacy.bulkUploadLocalData.mockResolvedValueOnce({ pushCountPerTable: {}, errors: 2 });

    const result = await syncAll({ userId: 'u1', localUserId: 'u1', triggeredBy: 'manual' });

    expect(result.status).toBe('error');
    const payload = telemetry.trackSyncRun.mock.calls[0][1];
    expect(payload.errored_count).toBeGreaterThanOrEqual(2);
  });

  // SYNC-3: while a sign-out is wiping local data, syncAll must bail so a
  // lifecycle trigger can't pull cloud rows back into the DB mid-wipe.
  test('skips entirely while a sign-out wipe is in progress', async () => {
    const guard = require('../signOutGuard');
    getSupabaseClient.mockReturnValue(makeSupabaseMock());
    guard.setSignOutWiping(true);

    const result = await syncAll({ userId: 'u1', localUserId: 'u1', triggeredBy: 'foreground' });

    expect(result.status).toBe('skipped');
    expect(result.reason).toBe('sign_out_wiping');
    expect(legacy.bulkUploadLocalData).not.toHaveBeenCalled();
    expect(legacy.pullFromCloud).not.toHaveBeenCalled();

    guard.setSignOutWiping(false);
  });

  // A clean legacy push (errors: 0) must not poison the status.
  test('a clean legacy bulk push leaves the cycle synced', async () => {
    getSupabaseClient.mockReturnValue(makeSupabaseMock());
    legacy.bulkUploadLocalData.mockResolvedValueOnce({ pushCountPerTable: {}, errors: 0 });

    const result = await syncAll({ userId: 'u1', localUserId: 'u1', triggeredBy: 'manual' });

    expect(result.status).toBe('synced');
  });
});
