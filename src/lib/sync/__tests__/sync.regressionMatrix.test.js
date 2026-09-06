/**
 * Sync regression matrix.
 *
 * Spec: TESTING_STRATEGY_LOCKED.md lines 144-160. Each registry
 * table gets a paired regression test set covering 8 spec'd
 * scenarios. 6 of the 8 run pure-Jest against a mocked supabase
 * client; the remaining 2 (two-device propagation; offline
 * collision) require a live Supabase test project, which v1 does
 * not have (BUDGET_POSTURE_LOCKED.md). They are documented as
 * deferred at the bottom of this file and re-listed in
 * CURRENT_STATUS § 8 LATER under "Phase A exit prep".
 *
 *   T1  Local insert    → handler.push      → upsert called with row
 *   T2  Local update    → handler.push      → upsert reflects newer row
 *   T3  Soft-delete     → handler.push      → upsert ships deleted_at  (softDelete tables only)
 *   T4  Remote insert   → handler.pull      → local insert helper invoked
 *   T5  Conflict        → handler.pull/push → resolution strategy applies
 *   T6  Push error      → handler.push      → returns errors:>0; does not throw
 *   T7  Two-device      → applier-level      → campaign1.syncConflict.test.js (P0-8 D15)
 *   T8  Offline coll.   → applier-level      → campaign1.syncConflict.test.js (P0-8 D15)
 *
 * Spec also says "Files: tests/sync/<table_name>.test.js". We
 * collapse into one matrix file (driven by SYNC_REGISTRY) rather
 * than 16 near-identical files, on the grounds that 16 nearly-
 * identical sibling files in the same directory rot in lockstep
 * when the contract changes; one matrix file with a per-table
 * fixture object surfaces missing coverage on registry growth.
 * The locked spec governs intent (every table covered) more than
 * file layout (each in its own file).
 *
 * Food domain (food_entries, custom_foods, saved_meals, recipes,
 * food_favourites, daily_water, daily_intake_rollups) flows
 * through one bulk RPC pair (food_sync_push / food_sync_pull) via
 * the coordinator in src/lib/sync/tables/foodDomain.js. Tests for
 * those tables assert against the coordinator's payload shape
 * rather than per-table handler calls, because there is no per-
 * table handler to assert against.
 *
 * weight_log is aliased to body_composition_log; its handlers
 * return `skipped:'aliased_to_body_composition_log'` and have no
 * cloud presence. The matrix verifies the alias contract and
 * skips T1-T6 with that documented reason.
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
  getAllPreferences: jest.fn(),
  applyPreferenceFromPull: jest.fn(),
}));

jest.mock('../../database', () => ({
  getAllWeeklyCheckinsForUser: jest.fn(),
  insertWeeklyCheckinFromCloud: jest.fn(),
  getWeeklyCheckinUpdatedAt: jest.fn(),
  getBodyMetricLog: jest.fn(),
  insertBodyMetricFromCloud: jest.fn(),
  getBodyMetricUpdatedAt: jest.fn(),
  getNutritionTargets: jest.fn(),
  insertNutritionTargetsFromCloud: jest.fn(),
  upsertEdPatternFlagFromCloud: jest.fn(),
  upsertTierHistoryFromCloud: jest.fn(),
  getAllRecipeIngredientsForUser: jest.fn(),
  upsertRecipeIngredientFromCloud: jest.fn(),
  getRecipeIngredientUpdatedAt: jest.fn(),
  getPlanFoldersForPush: jest.fn(),
  insertPlanFolderFromCloud: jest.fn(),
  getPlanFolderUpdatedAt: jest.fn(),
}));

jest.mock('../../food/db', () => ({
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

jest.mock('../../food/perDayTargets', () => ({
  loadPerDayOffsetsForSync: jest.fn(),
  applyPerDayOffsetsFromCloud: jest.fn(),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
}));

const mockStoreRef = { state: null };
// healthConsent defaults true so transport's per-call Article 9 gate (F5
// Phase A) doesn't block every matrix row — the consent real devices
// guarantee before sync ever runs. Primed per-suite, NOT globally: a
// jest.setup.js prime was tried and reverted because forcing the store
// module to load early broke unrelated store/auth suites. A test can
// still override it via setStore().
jest.mock('../../../store/useAppStore', () => ({
  __esModule: true,
  default: { getState: () => ({ healthConsent: true, ...(mockStoreRef.state ?? {}) }) },
}));

jest.mock('../telemetry', () => ({
  trackSyncRun: jest.fn().mockResolvedValue(undefined),
  trackSyncConflictResolved: jest.fn().mockResolvedValue(undefined),
  logSyncError: jest.fn(),
}));

const { getSupabaseClient } = require('../../supabase');
const prefs = require('../../notifications/preferences');
const db = require('../../database');
const foodDb = require('../../food/db');
const perDayTargets = require('../../food/perDayTargets');
const { SYNC_REGISTRY } = require('../registry');
const { MIGRATED_TABLES, pushTable, pullTable, beginFoodRun } = require('../transport');

// ---------------------------------------------------------------------------
// Fixtures + per-table helpers
// ---------------------------------------------------------------------------

function setStore(s) { mockStoreRef.state = s; }

beforeEach(() => {
  jest.clearAllMocks();
  mockStoreRef.state = null;
  beginFoodRun();
});

// Generic supabase mock factories.
function makeUpsertSb({ upsertError = null } = {}) {
  const calls = { upserts: [], rpcs: [], from: [] };
  return {
    _calls: calls,
    from: jest.fn((table) => {
      calls.from.push(table);
      return {
        upsert: jest.fn(async (rows, opts) => {
          calls.upserts.push({ table, rows, opts });
          return { error: upsertError };
        }),
        select: jest.fn(() => ({
          eq: jest.fn(() => {
            // Some push handlers (notification_preferences) read the
            // server-side updated_at before upserting; return an
            // empty server set so the local row is always "newer".
            const chain = Promise.resolve({ data: [], error: null });
            chain.in = jest.fn(async () => ({ data: [], error: null }));
            chain.maybeSingle = jest.fn(async () => ({ data: null, error: null }));
            return chain;
          }),
        })),
      };
    }),
    rpc: jest.fn(async (name, args) => {
      calls.rpcs.push({ name, args });
      return { data: { timestamp: new Date().toISOString(), changes: {} }, error: null };
    }),
  };
}

function makePullSb({ data = [], error = null } = {}) {
  return {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => {
          const chain = Promise.resolve({ data, error });
          chain.maybeSingle = jest.fn(async () => ({
            data: Array.isArray(data) ? data[0] ?? null : data,
            error,
          }));
          // LS-03b: the paginated pulls (body_metrics/daily_steps/cardio_log)
          // now call .eq(...).range(from, to); model one page of `data`.
          chain.range = jest.fn(async (from, to) => (
            error ? { data: null, error }
                  : { data: (Array.isArray(data) ? data : []).slice(from, to + 1), error: null }
          ));
          return chain;
        }),
      })),
    })),
    rpc: jest.fn(async () => ({
      data: { timestamp: new Date().toISOString(), changes: {} },
      error: null,
    })),
  };
}

// ---------------------------------------------------------------------------
// T0, Matrix coverage meta
// ---------------------------------------------------------------------------

describe('Matrix coverage', () => {
  test('every registry table is in MIGRATED_TABLES', () => {
    const registryTables = SYNC_REGISTRY.map((e) => e.table);
    const migrated = [...MIGRATED_TABLES];
    for (const t of registryTables) {
      expect(migrated).toContain(t);
    }
  });

  test('matrix covers every entry in SYNC_REGISTRY', () => {
    // This file's describe blocks (below) enumerate every table.
    // The simplest enforcement is: assert the count matches the
    // registry. If a table is added without a matrix entry, this
    // test fails until the matrix is extended.
    const registryTables = new Set(SYNC_REGISTRY.map((e) => e.table));
    const covered = new Set([
      // Non-food bidirectional handlers:
      'notification_preferences', 'weekly_checkins_v2', 'body_composition_log',
      'nutrition_targets', 'effective_maintenance_memos', 'recipe_ingredients', 'profiles',
      // daily_steps (activity store): push/pull covered in the dedicated
      // sync.dailySteps.test.js.
      'daily_steps',
      // cardio_log (cardio session store, retired D95 H1): pull_only,
      // covered in the dedicated sync.cardioLog.test.js.
      'cardio_log',
      // meal_plans (Theme G active-plan mirror): push latest row incl.
      // tombstone, LWW pull via applyMealPlanRowFromCloud - covered in the
      // dedicated sync.mealPlans.test.js.
      'meal_plans',
      // plan_folders (Hevy teardown R1 plan-folder organisation): push all
      // rows incl. tombstones on id, LWW pull via insertPlanFolderFromCloud —
      // covered by the plan_folders describe block below.
      'plan_folders',
      // Pull-only handlers:
      'ed_pattern_flags', 'tier_history', 'daily_intake_rollups',
      // Aliased no-op handler:
      'weight_log',
      // Food-domain coordinator (6 tables):
      'food_entries', 'custom_foods', 'saved_meals', 'recipes',
      'food_favourites', 'daily_water',
      // perday_target_offsets (per-day calorie planning offsets, L05-PDT1):
      // push/pull covered in the describe block below.
      'perday_target_offsets',
      // capability_constraints + session_constraint_effects (CC26 capability
      // lane): field maps, tombstone travel and the §28 A/B interval replay
      // are covered in the dedicated capabilityConstraintsSync.test.js
      // (src/lib/__tests__), against the real appliers.
      'capability_constraints', 'session_constraint_effects',
    ]);
    for (const t of registryTables) expect(covered.has(t)).toBe(true);
    for (const t of covered) expect(registryTables.has(t)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// notification_preferences (bidirectional, LWW, no soft-delete, composite PK)
// ---------------------------------------------------------------------------

describe('notification_preferences', () => {
  function setLocalRows(rows) {
    prefs.getAllPreferences.mockImplementation(async () => rows);
  }

  test('T1 insert push: local row → upsert called with row + onConflict composite PK', async () => {
    setLocalRows([
      { category: 'morning_weight', enabled: true, time_pref: '08:00', updated_at: 1000 },
    ]);
    const sb = makeUpsertSb();
    getSupabaseClient.mockReturnValue(sb);

    const result = await pushTable('notification_preferences', { userId: 'u1', localUserId: 'u1' });

    expect(result.count).toBe(1);
    expect(result.errors).toBe(0);
    expect(sb._calls.upserts[0].opts).toEqual({ onConflict: 'user_id,category' });
    expect(sb._calls.upserts[0].rows[0]).toMatchObject({
      user_id: 'u1', category: 'morning_weight', enabled: true,
    });
  });

  test('T2 update push: newer updated_at wins the latest-by-category fold', async () => {
    setLocalRows([
      { category: 'morning_weight', enabled: true, time_pref: '08:00', updated_at: 100 },
      { category: 'morning_weight', enabled: false, time_pref: '09:00', updated_at: 500 },
    ]);
    const sb = makeUpsertSb();
    getSupabaseClient.mockReturnValue(sb);
    await pushTable('notification_preferences', { userId: 'u1', localUserId: 'u1' });
    const row = sb._calls.upserts[0].rows[0];
    expect(row.time_pref).toBe('09:00');
    expect(row.enabled).toBe(false);
  });

  // T3 N/A, softDelete:false. Documented in the table entry.

  test('T4 remote insert pull: cloud row → applyPreferenceFromPull called', async () => {
    const sb = makePullSb({
      data: [
        { category: 'morning_weight', enabled: true, time_pref: '08:00', updated_at: new Date(1).toISOString() },
      ],
    });
    getSupabaseClient.mockReturnValue(sb);
    prefs.applyPreferenceFromPull.mockResolvedValue(true);

    const result = await pullTable('notification_preferences', { userId: 'u1' });

    expect(result.count).toBe(1);
    expect(prefs.applyPreferenceFromPull).toHaveBeenCalledWith('u1', 'morning_weight', expect.any(Object));
  });

  test('T5 conflict (LWW): pull preserves server updated_at via applyPreferenceFromPull', async () => {
    // The handler delegates to applyPreferenceFromPull which is the
    // module that owns the strict-LWW gate; assertion is that the
    // server timestamp reaches it intact rather than being clobbered.
    const serverUpdatedAt = new Date(99999).toISOString();
    const sb = makePullSb({
      data: [
        { category: 'morning_weight', enabled: false, time_pref: null, updated_at: serverUpdatedAt },
      ],
    });
    getSupabaseClient.mockReturnValue(sb);
    prefs.applyPreferenceFromPull.mockResolvedValue(true);

    await pullTable('notification_preferences', { userId: 'u1' });

    const call = prefs.applyPreferenceFromPull.mock.calls[0];
    expect(call[2].updated_at).toBe(Date.parse(serverUpdatedAt));
  });

  test('T6 push error: upsert fails → errors:>=1 + no throw', async () => {
    setLocalRows([
      { category: 'morning_weight', enabled: true, time_pref: '08:00', updated_at: 1 },
    ]);
    const sb = makeUpsertSb({ upsertError: new Error('rls') });
    getSupabaseClient.mockReturnValue(sb);

    const result = await pushTable('notification_preferences', { userId: 'u1', localUserId: 'u1' });

    expect(result.errors).toBe(1);
    expect(result.count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// weekly_checkins_v2 (bidirectional, LWW, no soft-delete, single PK)
// ---------------------------------------------------------------------------

describe('weekly_checkins_v2', () => {
  test('T1 insert push: batches with onConflict user_id,id', async () => {
    db.getAllWeeklyCheckinsForUser.mockResolvedValue([
      { id: 'wc-1', weekStart: 1, energyScore: 7 },
    ]);
    const sb = makeUpsertSb();
    getSupabaseClient.mockReturnValue(sb);

    const result = await pushTable('weekly_checkins_v2', { userId: 'u1', localUserId: 'u1' });

    expect(result.count).toBe(1);
    expect(sb._calls.upserts[0].opts).toEqual({ onConflict: 'user_id,id' });
    expect(sb._calls.upserts[0].rows[0]).toMatchObject({ id: 'wc-1', user_id: 'u1' });
  });

  test('T2 update push: ships current local field values', async () => {
    db.getAllWeeklyCheckinsForUser.mockResolvedValue([
      { id: 'wc-1', weekStart: 1, energyScore: 9, sorenessScore: 3 },
    ]);
    const sb = makeUpsertSb();
    getSupabaseClient.mockReturnValue(sb);

    await pushTable('weekly_checkins_v2', { userId: 'u1', localUserId: 'u1' });

    expect(sb._calls.upserts[0].rows[0]).toMatchObject({ energy_score: 9, soreness_score: 3 });
  });

  // T3 N/A, softDelete:false.

  test('T4 remote insert pull: cloud row → insertWeeklyCheckinFromCloud called', async () => {
    const sb = makePullSb({ data: [{ id: 'wc-cloud', week_start: 1, energy_score: 8 }] });
    getSupabaseClient.mockReturnValue(sb);
    db.insertWeeklyCheckinFromCloud.mockResolvedValue(undefined);

    const result = await pullTable('weekly_checkins_v2', { userId: 'u1' });

    expect(result.count).toBe(1);
    expect(db.insertWeeklyCheckinFromCloud).toHaveBeenCalledWith('u1', expect.objectContaining({ id: 'wc-cloud' }));
  });

  test('T5 conflict (LWW): pull skips cloud row older than local updated_at', async () => {
    const sb = makePullSb({
      data: [
        { id: 'wc-stale', week_start: 1, updated_at: new Date(100).toISOString() },
        { id: 'wc-fresh', week_start: 2, updated_at: new Date(99999).toISOString() },
      ],
    });
    getSupabaseClient.mockReturnValue(sb);
    db.getWeeklyCheckinUpdatedAt.mockImplementation(async (_u, id) =>
      id === 'wc-stale' ? 999999 : null
    );
    db.insertWeeklyCheckinFromCloud.mockResolvedValue(undefined);

    const result = await pullTable('weekly_checkins_v2', { userId: 'u1' });

    expect(result.count).toBe(1);
    expect(result.skipped).toBe(1);
    expect(db.insertWeeklyCheckinFromCloud).toHaveBeenCalledTimes(1);
  });

  test('T6 push error: batch upsert fails → errors:1, count:0', async () => {
    db.getAllWeeklyCheckinsForUser.mockResolvedValue([{ id: 'a', weekStart: 1 }]);
    const sb = makeUpsertSb({ upsertError: new Error('rls') });
    getSupabaseClient.mockReturnValue(sb);
    const result = await pushTable('weekly_checkins_v2', { userId: 'u1', localUserId: 'u1' });
    expect(result.errors).toBe(1);
    expect(result.count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// body_composition_log (bidirectional, LWW, softDelete:true, cloud=body_metrics)
// ---------------------------------------------------------------------------

describe('body_composition_log', () => {
  test('T1 insert push: pushes against cloud table body_metrics (registry/table-name divergence preserved)', async () => {
    db.getBodyMetricLog.mockResolvedValue([
      { id: 'bm-1', loggedAt: Date.UTC(2026, 0, 1), weightKg: 80 },
    ]);
    const sb = makeUpsertSb();
    getSupabaseClient.mockReturnValue(sb);

    await pushTable('body_composition_log', { userId: 'u1', localUserId: 'u1' });

    expect(sb._calls.from).toContain('body_metrics');
    expect(sb._calls.upserts[0].rows[0].body_weight).toBe(80);
  });

  test('T2 update push: maps camelCase → snake_case incl. thigh→quads / ham→hamstrings', async () => {
    db.getBodyMetricLog.mockResolvedValue([
      { id: 'bm-1', loggedAt: Date.UTC(2026, 0, 1), thighCm: 60, hamCm: 58 },
    ]);
    const sb = makeUpsertSb();
    getSupabaseClient.mockReturnValue(sb);

    await pushTable('body_composition_log', { userId: 'u1', localUserId: 'u1' });

    expect(sb._calls.upserts[0].rows[0]).toMatchObject({ quads: 60, hamstrings: 58 });
  });

  test('T3 soft-delete push: tombstone row carries deleted_at ISO string', async () => {
    db.getBodyMetricLog.mockResolvedValue([
      { id: 'bm-1', loggedAt: Date.UTC(2026, 0, 1), deletedAt: Date.UTC(2026, 5, 1) },
    ]);
    const sb = makeUpsertSb();
    getSupabaseClient.mockReturnValue(sb);

    await pushTable('body_composition_log', { userId: 'u1', localUserId: 'u1' });

    expect(sb._calls.upserts[0].rows[0].deleted_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test('T4 remote insert pull: cloud row → insertBodyMetricFromCloud called', async () => {
    const sb = makePullSb({ data: [{ id: 'bm-cloud', metric_date: '2026-05-01' }] });
    getSupabaseClient.mockReturnValue(sb);
    db.insertBodyMetricFromCloud.mockResolvedValue(undefined);

    const result = await pullTable('body_composition_log', { userId: 'u1' });

    expect(result.count).toBe(1);
    expect(db.insertBodyMetricFromCloud).toHaveBeenCalledWith('u1', expect.objectContaining({ id: 'bm-cloud' }));
  });

  test('T5 conflict (LWW): pull skips cloud row older than local updated_at', async () => {
    const sb = makePullSb({
      data: [
        { id: 'bm-stale', metric_date: '2026-05-01', updated_at: new Date(100).toISOString() },
        { id: 'bm-fresh', metric_date: '2026-05-02', updated_at: new Date(99999).toISOString() },
      ],
    });
    getSupabaseClient.mockReturnValue(sb);
    db.getBodyMetricUpdatedAt.mockImplementation(async (_u, id) =>
      id === 'bm-stale' ? 999999 : null
    );
    db.insertBodyMetricFromCloud.mockResolvedValue(undefined);

    const result = await pullTable('body_composition_log', { userId: 'u1' });

    expect(result.count).toBe(1);
    expect(result.skipped).toBe(1);
    expect(db.insertBodyMetricFromCloud).toHaveBeenCalledTimes(1);
  });

  test('T6 push error: errors:>=1, no throw', async () => {
    db.getBodyMetricLog.mockResolvedValue([{ id: 'bm-1', loggedAt: Date.UTC(2026, 0, 1) }]);
    const sb = makeUpsertSb({ upsertError: new Error('rls') });
    getSupabaseClient.mockReturnValue(sb);
    const result = await pushTable('body_composition_log', { userId: 'u1', localUserId: 'u1' });
    expect(result.errors).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// nutrition_targets (bidirectional, LWW, no soft-delete, PK=user_id)
// ---------------------------------------------------------------------------

describe('nutrition_targets', () => {
  test('T1 insert push: single per-user row, onConflict:user_id', async () => {
    db.getNutritionTargets.mockResolvedValue({ targetKcal: 2000, proteinG: 180 });
    const sb = makeUpsertSb();
    getSupabaseClient.mockReturnValue(sb);

    await pushTable('nutrition_targets', { userId: 'u1', localUserId: 'u1' });

    expect(sb._calls.upserts[0].opts).toEqual({ onConflict: 'user_id' });
    expect(sb._calls.upserts[0].rows).toMatchObject({ user_id: 'u1', target_kcal: 2000 });
  });

  test('T2 update push: new field values land in the upsert row', async () => {
    db.getNutritionTargets.mockResolvedValue({ targetKcal: 2500, phase: 'bulk' });
    const sb = makeUpsertSb();
    getSupabaseClient.mockReturnValue(sb);
    await pushTable('nutrition_targets', { userId: 'u1', localUserId: 'u1' });
    expect(sb._calls.upserts[0].rows).toMatchObject({ target_kcal: 2500, phase: 'bulk' });
  });

  // T3 N/A, softDelete:false.

  test('T4 remote insert pull: cloud row → insertNutritionTargetsFromCloud called', async () => {
    const sb = makePullSb({ data: { user_id: 'u1', target_kcal: 2200 } });
    getSupabaseClient.mockReturnValue(sb);
    db.insertNutritionTargetsFromCloud.mockResolvedValue(undefined);

    const result = await pullTable('nutrition_targets', { userId: 'u1' });

    expect(result.count).toBe(1);
    expect(db.insertNutritionTargetsFromCloud).toHaveBeenCalledWith('u1', expect.objectContaining({ target_kcal: 2200 }));
  });

  // Campaign 1 P0-8 D9 RE-ANCHOR (2026-08-10). This test used to assert
  // only that SOME ISO timestamp was stamped at push time, and the handler
  // duly stamped `new Date().toISOString()` - which INVERTS last-write-wins:
  // `nutrition_targets` has no server-side stale-write trigger, so a device
  // that had not synced since before the targets changed uploaded its STALE
  // calorie/macro row carrying the newest timestamp in the account, and
  // insertNutritionTargetsFromCloud's gate then applied it over the
  // up-to-date device. The old expectation pinned the defect as if it were
  // the contract. It is re-anchored here to the honest-timestamp behaviour:
  // the push must ship the ROW's own updated_at. Deliberate correction of a
  // wrong pin, not a relaxation - the assertion is strictly stronger.
  test('T5 conflict: push ships the row\'s HONEST updated_at, not now() (P0-8 D9)', async () => {
    const rowUpdatedAt = Date.UTC(2026, 0, 2, 3, 4, 5);
    db.getNutritionTargets.mockResolvedValue({ targetKcal: 2000, updatedAt: rowUpdatedAt });
    const sb = makeUpsertSb();
    getSupabaseClient.mockReturnValue(sb);
    await pushTable('nutrition_targets', { userId: 'u1', localUserId: 'u1' });
    expect(sb._calls.upserts[0].rows.updated_at).toBe(new Date(rowUpdatedAt).toISOString());
  });

  test('T5b conflict: a row with no updated_at still ships a comparable ISO stamp', async () => {
    // Legacy rows written before saveNutritionTargets maintained the column
    // carry no timestamp; falling back to now() is the only honest option
    // there and keeps the server LWW comparison well-formed.
    db.getNutritionTargets.mockResolvedValue({ targetKcal: 2000 });
    const sb = makeUpsertSb();
    getSupabaseClient.mockReturnValue(sb);
    await pushTable('nutrition_targets', { userId: 'u1', localUserId: 'u1' });
    expect(sb._calls.upserts[0].rows.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test('T6 push error: upsert fails → errors:1', async () => {
    db.getNutritionTargets.mockResolvedValue({ targetKcal: 2000 });
    const sb = makeUpsertSb({ upsertError: new Error('rls') });
    getSupabaseClient.mockReturnValue(sb);
    const result = await pushTable('nutrition_targets', { userId: 'u1', localUserId: 'u1' });
    expect(result.errors).toBe(1);
  });

  // L05-NT1: goal + proteinApproach must round-trip through push and pull so
  // the "Why these targets" explanation survives a new device/reinstall
  // instead of relying solely on the device-local AsyncStorage copy.
  test('T7 L05-NT1: goal + proteinApproach land in the push row', async () => {
    db.getNutritionTargets.mockResolvedValue({
      targetKcal: 2000, goal: 'mild_cut', proteinApproach: 'optimised',
    });
    const sb = makeUpsertSb();
    getSupabaseClient.mockReturnValue(sb);
    await pushTable('nutrition_targets', { userId: 'u1', localUserId: 'u1' });
    expect(sb._calls.upserts[0].rows).toMatchObject({
      goal: 'mild_cut', protein_approach: 'optimised',
    });
  });

  test('T8 L05-NT1: pull forwards goal/protein_approach to insertNutritionTargetsFromCloud', async () => {
    const sb = makePullSb({
      data: { user_id: 'u1', target_kcal: 2200, goal: 'build', protein_approach: 'advanced' },
    });
    getSupabaseClient.mockReturnValue(sb);
    db.insertNutritionTargetsFromCloud.mockResolvedValue(undefined);

    await pullTable('nutrition_targets', { userId: 'u1' });

    expect(db.insertNutritionTargetsFromCloud).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ goal: 'build', protein_approach: 'advanced' }),
    );
  });
});

// ---------------------------------------------------------------------------
// recipe_ingredients (bidirectional, LWW, softDelete:true)
// ---------------------------------------------------------------------------

describe('recipe_ingredients', () => {
  test('T1 insert push: row goes through with id + recipe_id + composite conflict key', async () => {
    db.getAllRecipeIngredientsForUser.mockResolvedValue([
      { id: 'ri-1', recipeId: 'r-1', foodRef: 'off:1', quantityG: 100, orderIndex: 0, createdAt: 1, updatedAt: 1, deletedAt: null },
    ]);
    const sb = makeUpsertSb();
    getSupabaseClient.mockReturnValue(sb);

    await pushTable('recipe_ingredients', { userId: 'u1', localUserId: 'u1' });

    expect(sb._calls.upserts[0].opts).toEqual({ onConflict: 'user_id,id' });
    expect(sb._calls.upserts[0].rows[0]).toMatchObject({ id: 'ri-1', recipe_id: 'r-1' });
  });

  test('T2 update push: updated_at falls back to created_at on legacy rows missing the column', async () => {
    db.getAllRecipeIngredientsForUser.mockResolvedValue([
      { id: 'ri-legacy', recipeId: 'r-1', foodRef: 'off:1', quantityG: 100, orderIndex: 0, createdAt: 100, updatedAt: null, deletedAt: null },
    ]);
    const sb = makeUpsertSb();
    getSupabaseClient.mockReturnValue(sb);
    await pushTable('recipe_ingredients', { userId: 'u1', localUserId: 'u1' });
    const row = sb._calls.upserts[0].rows[0];
    expect(row.created_at).toBe(row.updated_at);
  });

  test('T3 soft-delete push: tombstone row carries deleted_at ISO string', async () => {
    db.getAllRecipeIngredientsForUser.mockResolvedValue([
      { id: 'ri-tomb', recipeId: 'r-1', foodRef: 'off:1', quantityG: 100, orderIndex: 0, createdAt: 1, updatedAt: 9, deletedAt: 9 },
    ]);
    const sb = makeUpsertSb();
    getSupabaseClient.mockReturnValue(sb);
    await pushTable('recipe_ingredients', { userId: 'u1', localUserId: 'u1' });
    expect(sb._calls.upserts[0].rows[0].deleted_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test('T4 remote insert pull: cloud row routes through upsertRecipeIngredientFromCloud', async () => {
    const sb = makePullSb({
      data: [{ id: 'ri-cloud', recipe_id: 'r-1', updated_at: new Date(1).toISOString() }],
    });
    getSupabaseClient.mockReturnValue(sb);
    db.getRecipeIngredientUpdatedAt.mockResolvedValue(null);
    db.upsertRecipeIngredientFromCloud.mockResolvedValue(undefined);

    const result = await pullTable('recipe_ingredients', { userId: 'u1' });

    expect(result.count).toBe(1);
    expect(db.upsertRecipeIngredientFromCloud).toHaveBeenCalledWith('u1', expect.objectContaining({ id: 'ri-cloud' }));
  });

  test('T5 conflict (LWW): pull skips cloud row older than local updated_at', async () => {
    const sb = makePullSb({
      data: [
        { id: 'ri-stale', updated_at: new Date(100).toISOString() },
        { id: 'ri-fresh', updated_at: new Date(99999).toISOString() },
      ],
    });
    getSupabaseClient.mockReturnValue(sb);
    // Local has ri-stale at a NEWER timestamp than cloud; ri-fresh has no local.
    db.getRecipeIngredientUpdatedAt.mockImplementation(async (_u, id) =>
      id === 'ri-stale' ? 999999 : null
    );
    db.upsertRecipeIngredientFromCloud.mockResolvedValue(undefined);

    const result = await pullTable('recipe_ingredients', { userId: 'u1' });

    expect(result.count).toBe(1);
    expect(result.skipped).toBe(1);
  });

  test('T6 push error: batch upsert fails → errors:1', async () => {
    db.getAllRecipeIngredientsForUser.mockResolvedValue([
      { id: 'ri-1', recipeId: 'r-1', foodRef: 'off:1', quantityG: 100, orderIndex: 0, createdAt: 1 },
    ]);
    const sb = makeUpsertSb({ upsertError: new Error('rls') });
    getSupabaseClient.mockReturnValue(sb);
    const result = await pushTable('recipe_ingredients', { userId: 'u1', localUserId: 'u1' });
    expect(result.errors).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// plan_folders (bidirectional, LWW, softDelete:true, PK=id)
// ---------------------------------------------------------------------------

describe('plan_folders', () => {
  test('T1 insert push: row upserts on id with name + sort_order', async () => {
    db.getPlanFoldersForPush.mockResolvedValue([
      { id: 'pf-1', name: 'Pushes', sortOrder: 0, createdAt: 1, updatedAt: 1, deletedAt: null },
    ]);
    const sb = makeUpsertSb();
    getSupabaseClient.mockReturnValue(sb);

    const result = await pushTable('plan_folders', { userId: 'u1', localUserId: 'u1' });

    expect(result.count).toBe(1);
    expect(sb._calls.from).toContain('plan_folders');
    expect(sb._calls.upserts[0].opts).toEqual({ onConflict: 'id' });
    expect(sb._calls.upserts[0].rows[0]).toMatchObject({ id: 'pf-1', user_id: 'u1', name: 'Pushes' });
  });

  test('T2 update push: new field values land in the upsert row', async () => {
    db.getPlanFoldersForPush.mockResolvedValue([
      { id: 'pf-1', name: 'Renamed', sortOrder: 3, createdAt: 1, updatedAt: 9, deletedAt: null },
    ]);
    const sb = makeUpsertSb();
    getSupabaseClient.mockReturnValue(sb);
    await pushTable('plan_folders', { userId: 'u1', localUserId: 'u1' });
    expect(sb._calls.upserts[0].rows[0]).toMatchObject({ name: 'Renamed', sort_order: 3 });
  });

  test('T3 soft-delete push: tombstone row carries deleted_at ISO string', async () => {
    db.getPlanFoldersForPush.mockResolvedValue([
      { id: 'pf-tomb', name: 'Gone', sortOrder: 0, createdAt: 1, updatedAt: 9, deletedAt: 9 },
    ]);
    const sb = makeUpsertSb();
    getSupabaseClient.mockReturnValue(sb);
    await pushTable('plan_folders', { userId: 'u1', localUserId: 'u1' });
    expect(sb._calls.upserts[0].rows[0].deleted_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test('T4 remote insert pull: cloud row → insertPlanFolderFromCloud called', async () => {
    const sb = makePullSb({
      data: [{ id: 'pf-cloud', name: 'Cloud', sort_order: 0, updated_at: new Date(1).toISOString() }],
    });
    getSupabaseClient.mockReturnValue(sb);
    db.getPlanFolderUpdatedAt.mockResolvedValue(0);
    db.insertPlanFolderFromCloud.mockResolvedValue(undefined);

    const result = await pullTable('plan_folders', { userId: 'u1' });

    expect(result.count).toBe(1);
    expect(db.insertPlanFolderFromCloud).toHaveBeenCalledWith('u1', expect.objectContaining({ id: 'pf-cloud' }));
  });

  test('T5 conflict (LWW): pull skips cloud row older than local updated_at', async () => {
    const sb = makePullSb({
      data: [
        { id: 'pf-stale', name: 'Stale', updated_at: new Date(100).toISOString() },
        { id: 'pf-fresh', name: 'Fresh', updated_at: new Date(99999).toISOString() },
      ],
    });
    getSupabaseClient.mockReturnValue(sb);
    db.getPlanFolderUpdatedAt.mockImplementation(async (_u, id) =>
      id === 'pf-stale' ? 999999 : 0
    );
    db.insertPlanFolderFromCloud.mockResolvedValue(undefined);

    const result = await pullTable('plan_folders', { userId: 'u1' });

    expect(result.count).toBe(1);
    expect(result.skipped).toBe(1);
    expect(db.insertPlanFolderFromCloud).toHaveBeenCalledTimes(1);
  });

  test('T6 push error: batch upsert fails → errors:1, count:0', async () => {
    db.getPlanFoldersForPush.mockResolvedValue([
      { id: 'pf-1', name: 'Pushes', sortOrder: 0, createdAt: 1, updatedAt: 1, deletedAt: null },
    ]);
    const sb = makeUpsertSb({ upsertError: new Error('rls') });
    getSupabaseClient.mockReturnValue(sb);
    const result = await pushTable('plan_folders', { userId: 'u1', localUserId: 'u1' });
    expect(result.errors).toBe(1);
    expect(result.count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// perday_target_offsets (bidirectional, LWW, no soft-delete, PK=user_id)
// ---------------------------------------------------------------------------

describe('perday_target_offsets', () => {
  const OFFSETS = { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 200, sun: 200 };

  test('T1 insert push: single per-user row, onConflict:user_id', async () => {
    perDayTargets.loadPerDayOffsetsForSync.mockResolvedValue({ offsets: OFFSETS, updatedAtMs: 1000 });
    const sb = makeUpsertSb();
    getSupabaseClient.mockReturnValue(sb);

    const result = await pushTable('perday_target_offsets', { userId: 'u1', localUserId: 'u1' });

    expect(result).toEqual({ count: 1, errors: 0 });
    expect(sb._calls.upserts[0].opts).toEqual({ onConflict: 'user_id' });
    expect(sb._calls.upserts[0].rows).toMatchObject({
      user_id: 'u1', sat_offset_kcal: 200, sun_offset_kcal: 200, mon_offset_kcal: 0,
    });
  });

  test('T2 update push: new offset values land in the upsert row', async () => {
    perDayTargets.loadPerDayOffsetsForSync.mockResolvedValue({
      offsets: { ...OFFSETS, wed: -300 }, updatedAtMs: 2000,
    });
    const sb = makeUpsertSb();
    getSupabaseClient.mockReturnValue(sb);
    await pushTable('perday_target_offsets', { userId: 'u1', localUserId: 'u1' });
    expect(sb._calls.upserts[0].rows).toMatchObject({ wed_offset_kcal: -300 });
  });

  test('push: nothing to send when the offsets have never been saved locally', async () => {
    perDayTargets.loadPerDayOffsetsForSync.mockResolvedValue({ offsets: OFFSETS, updatedAtMs: 0 });
    const sb = makeUpsertSb();
    getSupabaseClient.mockReturnValue(sb);
    const result = await pushTable('perday_target_offsets', { userId: 'u1', localUserId: 'u1' });
    expect(result).toEqual({ count: 0, errors: 0 });
    expect(sb._calls.upserts).toHaveLength(0);
  });

  // T3 N/A, softDelete:false. "Reset all to base target" writes zeros, never a tombstone.

  test('T4 remote insert pull: cloud row → applyPerDayOffsetsFromCloud called with the mapped offsets', async () => {
    const sb = makePullSb({
      data: { user_id: 'u1', sat_offset_kcal: 300, sun_offset_kcal: 300, updated_at: new Date(5000).toISOString() },
    });
    getSupabaseClient.mockReturnValue(sb);
    perDayTargets.applyPerDayOffsetsFromCloud.mockResolvedValue(true);

    const result = await pullTable('perday_target_offsets', { userId: 'u1' });

    expect(result).toEqual({ count: 1, errors: 0 });
    expect(perDayTargets.applyPerDayOffsetsFromCloud).toHaveBeenCalledWith(
      expect.objectContaining({ sat: 300, sun: 300 }),
      5000,
    );
  });

  test('T5 conflict (LWW): pull reports skipped when the LWW gate keeps the local copy', async () => {
    const sb = makePullSb({
      data: { user_id: 'u1', updated_at: new Date(100).toISOString() },
    });
    getSupabaseClient.mockReturnValue(sb);
    perDayTargets.applyPerDayOffsetsFromCloud.mockResolvedValue(false);

    const result = await pullTable('perday_target_offsets', { userId: 'u1' });

    expect(result).toEqual({ count: 0, errors: 0, skipped: 1 });
  });

  test('T6 push error: upsert fails → errors:1, count:0', async () => {
    perDayTargets.loadPerDayOffsetsForSync.mockResolvedValue({ offsets: OFFSETS, updatedAtMs: 1000 });
    const sb = makeUpsertSb({ upsertError: new Error('rls') });
    getSupabaseClient.mockReturnValue(sb);
    const result = await pushTable('perday_target_offsets', { userId: 'u1', localUserId: 'u1' });
    expect(result.errors).toBe(1);
    expect(result.count).toBe(0);
  });

  test('benign-skips (errors:0) when the cloud table is not migrated yet', async () => {
    perDayTargets.loadPerDayOffsetsForSync.mockResolvedValue({ offsets: OFFSETS, updatedAtMs: 1000 });
    const sb = makeUpsertSb({
      upsertError: { code: 'PGRST205', message: "Could not find the table 'public.perday_target_offsets' in the schema cache" },
    });
    getSupabaseClient.mockReturnValue(sb);
    const result = await pushTable('perday_target_offsets', { userId: 'u1', localUserId: 'u1' });
    expect(result).toMatchObject({ count: 0, errors: 0, skipped: 'cloud_table_missing' });
  });
});

// ---------------------------------------------------------------------------
// profiles (bidirectional, merge, no soft-delete)
// ---------------------------------------------------------------------------

describe('profiles', () => {
  test('T1 insert push: payload upserts users_profile on id', async () => {
    setStore({
      userProfile: { firstName: 'A', units: 'kg' },
      userProfileFieldUpdatedAt: { firstName: 1, units: 1 },
    });
    const sb = makeUpsertSb();
    getSupabaseClient.mockReturnValue(sb);

    await pushTable('profiles', { userId: 'u1' });

    expect(sb._calls.from).toContain('users_profile');
    expect(sb._calls.upserts[0].opts).toEqual({ onConflict: 'id' });
    expect(sb._calls.upserts[0].rows).toMatchObject({ id: 'u1', first_name: 'A' });
  });

  test('T2 update push: column_updates_at carries per-field timestamps', async () => {
    setStore({
      userProfile: { firstName: 'A', units: 'kg' },
      userProfileFieldUpdatedAt: {
        firstName: Date.UTC(2026, 4, 27),
        units: Date.UTC(2026, 4, 26),
      },
    });
    const sb = makeUpsertSb();
    getSupabaseClient.mockReturnValue(sb);
    await pushTable('profiles', { userId: 'u1' });
    expect(sb._calls.upserts[0].rows.column_updates_at.first_name).toMatch(/2026-05-27/);
  });

  // T3 N/A, softDelete:false. Profile rows are never deleted via sync.

  test('T4 remote pull: cloud row → setUserProfile called via store', async () => {
    const setUserProfile = jest.fn();
    setStore({
      userProfile: { firstName: 'OldName' },
      userProfileFieldUpdatedAt: {},
      setUserProfile,
    });
    const sb = makePullSb({
      data: { first_name: 'CloudName', units: 'lbs', column_updates_at: {} },
    });
    getSupabaseClient.mockReturnValue(sb);

    const result = await pullTable('profiles', { userId: 'u1' });

    expect(result.count).toBe(1);
    expect(setUserProfile).toHaveBeenCalledWith(expect.objectContaining({ firstName: 'CloudName' }));
  });

  test('T5 conflict (merge): per-column timestamps decide each field independently', async () => {
    const setUserProfile = jest.fn();
    setStore({
      userProfile: { firstName: 'LocalName', units: 'kg' },
      // Local wrote units NEWER than cloud; local wrote firstName OLDER.
      userProfileFieldUpdatedAt: {
        firstName: Date.UTC(2026, 0, 1),
        units: Date.UTC(2026, 5, 1),
      },
      setUserProfile,
    });
    const sb = makePullSb({
      data: {
        first_name: 'CloudName',
        units: 'lbs',
        column_updates_at: {
          first_name: '2026-05-15T00:00:00.000Z', // cloud > local for first_name
          units: '2026-05-15T00:00:00.000Z',       // cloud < local for units
        },
      },
    });
    getSupabaseClient.mockReturnValue(sb);
    await pullTable('profiles', { userId: 'u1' });
    const applied = setUserProfile.mock.calls[0][0];
    expect(applied.firstName).toBe('CloudName'); // cloud wins
    expect(applied.units).toBe('kg');             // local wins
  });

  test('T6 push error: upsert fails → errors:1', async () => {
    setStore({ userProfile: { firstName: 'A' }, userProfileFieldUpdatedAt: {} });
    const sb = makeUpsertSb({ upsertError: new Error('rls') });
    getSupabaseClient.mockReturnValue(sb);
    const result = await pushTable('profiles', { userId: 'u1' });
    expect(result.errors).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Pull-only: ed_pattern_flags, tier_history (server_wins via INSERT OR REPLACE)
// daily_intake_rollups handled via the food coordinator.
// ---------------------------------------------------------------------------

describe('ed_pattern_flags (pull-only, server_wins)', () => {
  test('T4 remote pull: cloud row → upsertEdPatternFlagFromCloud (INSERT OR REPLACE)', async () => {
    const sb = makePullSb({
      data: [{ id: 'flag-1', flag_state: 'raised', raised_at: 1, updated_at: 1 }],
    });
    getSupabaseClient.mockReturnValue(sb);
    db.upsertEdPatternFlagFromCloud.mockResolvedValue(undefined);

    const result = await pullTable('ed_pattern_flags', { userId: 'u1' });

    expect(result.count).toBe(1);
    expect(db.upsertEdPatternFlagFromCloud).toHaveBeenCalledWith('u1', expect.objectContaining({ id: 'flag-1' }));
  });

  test('T5 conflict (server_wins): INSERT OR REPLACE, local edits are stomped on next pull', async () => {
    // Asserted at the helper-call level: server_wins = unconditional
    // upsert, no client-side gate.
    const sb = makePullSb({
      data: [{ id: 'flag-1', flag_state: 'cleared', updated_at: 1 }],
    });
    getSupabaseClient.mockReturnValue(sb);
    db.upsertEdPatternFlagFromCloud.mockResolvedValue(undefined);
    await pullTable('ed_pattern_flags', { userId: 'u1' });
    expect(db.upsertEdPatternFlagFromCloud).toHaveBeenCalledTimes(1);
  });

  test('pushTable returns skipped:pull_only', async () => {
    const result = await pushTable('ed_pattern_flags', { userId: 'u1' });
    expect(result).toMatchObject({ count: 0, errors: 0, skipped: 'pull_only' });
  });
});

describe('tier_history (pull-only, server_wins)', () => {
  test('T4 remote pull: cloud row → upsertTierHistoryFromCloud', async () => {
    const sb = makePullSb({
      data: [{ id: 'th-1', user_id: 'u1', from_tier: 'free', to_tier: 'pro', occurred_at: '2026-05-01' }],
    });
    getSupabaseClient.mockReturnValue(sb);
    db.upsertTierHistoryFromCloud.mockResolvedValue(undefined);

    const result = await pullTable('tier_history', { userId: 'u1' });

    expect(result.count).toBe(1);
    expect(db.upsertTierHistoryFromCloud).toHaveBeenCalledWith('u1', expect.objectContaining({ id: 'th-1' }));
  });

  test('pushTable returns skipped:pull_only', async () => {
    const result = await pushTable('tier_history', { userId: 'u1' });
    expect(result).toMatchObject({ count: 0, errors: 0, skipped: 'pull_only' });
  });
});

// ---------------------------------------------------------------------------
// weight_log (aliased to body_composition_log)
// ---------------------------------------------------------------------------

describe('weight_log (aliased)', () => {
  test('pushTable returns skipped:aliased_to_body_composition_log + count:0', async () => {
    getSupabaseClient.mockReturnValue(makeUpsertSb());
    const result = await pushTable('weight_log', { userId: 'u1', localUserId: 'u1' });
    expect(result).toMatchObject({ count: 0, errors: 0, skipped: 'aliased_to_body_composition_log' });
  });

  test('pullTable returns skipped:aliased_to_body_composition_log + count:0', async () => {
    getSupabaseClient.mockReturnValue(makePullSb());
    const result = await pullTable('weight_log', { userId: 'u1' });
    expect(result).toMatchObject({ count: 0, errors: 0, skipped: 'aliased_to_body_composition_log' });
  });
});

// ---------------------------------------------------------------------------
// Food domain (6 bidirectional tables + 1 pull-only via coordinator)
// All push payloads go through food_sync_push RPC; pulls through
// food_sync_pull. Per-table assertions inspect the coordinator's
// RPC payload shape.
// ---------------------------------------------------------------------------

describe('food domain coordinator (food_entries / custom_foods / saved_meals / recipes / food_favourites / daily_water / daily_intake_rollups)', () => {
  function makeFoodSb({ rpcError = null, rpcData } = {}) {
    const calls = { rpcs: [] };
    return {
      _calls: calls,
      rpc: jest.fn(async (name, args) => {
        calls.rpcs.push({ name, args });
        return {
          data: rpcData ?? { timestamp: new Date().toISOString(), changes: {} },
          error: rpcError,
        };
      }),
    };
  }

  // Food fixtures use snake_case to match production: src/lib/food/db.js
  // returns raw expo-sqlite rows without a camelCase transform.
  test('T1 insert push: a new food_entries row appears in the changes payload', async () => {
    foodDb.getAllFoodEntriesSince.mockResolvedValueOnce([
      { id: 'fe-1', entry_date: '2026-05-26', meal_slot: 'breakfast', food_ref: 'off:1', quantity_g: 100, kcal: 100, protein_g: 10, carbs_g: 10, fat_g: 5, created_at: 1, updated_at: 1 },
    ]);
    const sb = makeFoodSb();
    getSupabaseClient.mockReturnValue(sb);

    await pushTable('food_entries', { userId: 'u1', localUserId: 'u1' });

    const pushCall = sb._calls.rpcs.find((r) => r.name === 'food_sync_push');
    expect(pushCall).toBeTruthy();
    expect(pushCall.args.changes.food_entries.created).toHaveLength(1);
    expect(pushCall.args.changes.food_entries.created[0]).toMatchObject({
      id: 'fe-1', entry_date: '2026-05-26', meal_slot: 'breakfast', food_ref: 'off:1',
    });
  });

  test('T2 update push: an updated food_entries row appears in the updated bucket', async () => {
    foodDb.getAllFoodEntriesSince.mockResolvedValueOnce([
      { id: 'fe-1', entry_date: '2026-05-26', meal_slot: 'breakfast', food_ref: 'off:1', quantity_g: 200, kcal: 200, protein_g: 20, carbs_g: 20, fat_g: 10, created_at: 1, updated_at: 999 },
    ]);
    const sb = makeFoodSb();
    getSupabaseClient.mockReturnValue(sb);
    await pushTable('food_entries', { userId: 'u1', localUserId: 'u1' });
    const pushCall = sb._calls.rpcs.find((r) => r.name === 'food_sync_push');
    expect(pushCall.args.changes.food_entries.updated).toHaveLength(1);
    expect(pushCall.args.changes.food_entries.updated[0].quantity_g).toBe(200);
  });

  test('T3 soft-delete push: tombstoned row lands in the deleted bucket', async () => {
    foodDb.getAllFoodEntriesSince.mockResolvedValueOnce([
      { id: 'fe-del', entry_date: '2026-05-26', meal_slot: 'breakfast', food_ref: 'off:1', quantity_g: 100, kcal: 100, protein_g: 10, carbs_g: 10, fat_g: 5, created_at: 1, updated_at: 9, deleted_at: 9 },
    ]);
    const sb = makeFoodSb();
    getSupabaseClient.mockReturnValue(sb);
    await pushTable('food_entries', { userId: 'u1', localUserId: 'u1' });
    const pushCall = sb._calls.rpcs.find((r) => r.name === 'food_sync_push');
    expect(pushCall.args.changes.food_entries.deleted).toHaveLength(1);
    expect(pushCall.args.changes.food_entries.deleted[0].deleted_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test('T4 remote pull: cloud food_entries → applyFoodEntryFromCloud called', async () => {
    const sb = makeFoodSb({
      rpcData: {
        timestamp: new Date().toISOString(),
        changes: {
          food_entries: { created: [{ id: 'fe-cloud', entry_date: '2026-05-01' }], updated: [], deleted: [] },
        },
      },
    });
    getSupabaseClient.mockReturnValue(sb);
    foodDb.applyFoodEntryFromCloud.mockResolvedValue(null);

    await pullTable('food_entries', { userId: 'u1' });

    expect(foodDb.applyFoodEntryFromCloud).toHaveBeenCalledWith('u1', expect.objectContaining({ id: 'fe-cloud' }));
  });

  test('T5 conflict: per-row updated_at survives the round trip to the RPC payload', async () => {
    foodDb.getAllFoodEntriesSince.mockResolvedValueOnce([
      { id: 'fe-1', entry_date: '2026-05-26', meal_slot: 'breakfast', food_ref: 'off:1', quantity_g: 100, kcal: 100, protein_g: 10, carbs_g: 10, fat_g: 5, created_at: 1, updated_at: 9999 },
    ]);
    const sb = makeFoodSb();
    getSupabaseClient.mockReturnValue(sb);
    await pushTable('food_entries', { userId: 'u1', localUserId: 'u1' });
    const pushCall = sb._calls.rpcs.find((r) => r.name === 'food_sync_push');
    expect(pushCall.args.changes.food_entries.updated[0].updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test('T6 push error: a failing table reports errors:1', async () => {
    foodDb.getAllFoodEntriesSince.mockResolvedValueOnce([
      { id: 'fe-1', entry_date: '2026-05-26', meal_slot: 'breakfast', food_ref: 'off:1', quantity_g: 100, kcal: 100, protein_g: 10, carbs_g: 10, fat_g: 5, created_at: 1, updated_at: 1 },
    ]);
    const sb = makeFoodSb({ rpcError: new Error('rls') });
    getSupabaseClient.mockReturnValue(sb);

    const result = await pushTable('food_entries', { userId: 'u1', localUserId: 'u1' });

    expect(result.errors).toBe(1);
  });

  test('per-table isolation: one table failing does not error the others', async () => {
    // food_entries has a row (its push succeeds); daily_water has a row
    // whose push the cloud rejects (the live daily_water.entry_date
    // drift). Each table goes in its own food_sync_push call.
    foodDb.getAllFoodEntriesSince.mockResolvedValueOnce([
      { id: 'fe-1', entry_date: '2026-05-26', meal_slot: 'breakfast', food_ref: 'off:1', quantity_g: 100, kcal: 100, protein_g: 10, carbs_g: 10, fat_g: 5, created_at: 1, updated_at: 1 },
    ]);
    foodDb.getAllWaterSince.mockResolvedValueOnce([
      { user_id: 'u1', entry_date: '2026-05-26', ml: 500, updated_at: 1 },
    ]);
    const sb = {
      rpc: jest.fn(async (name, args) => {
        if (name === 'food_sync_push' && args?.changes?.daily_water) {
          return { data: null, error: new Error('column "entry_date" of relation "daily_water" does not exist') };
        }
        return { data: { applied_at: new Date().toISOString() }, error: null };
      }),
    };
    getSupabaseClient.mockReturnValue(sb);

    const feResult = await pushTable('food_entries', { userId: 'u1', localUserId: 'u1' });
    const waterResult = await pushTable('daily_water', { userId: 'u1', localUserId: 'u1' });

    // food_entries committed cleanly; only daily_water is flagged.
    expect(feResult).toMatchObject({ count: 1, errors: 0 });
    expect(waterResult).toMatchObject({ count: 0, errors: 1 });
    // One food_sync_push per non-empty table (two here), proving the
    // failure was isolated rather than batched into a single all-or-
    // nothing call.
    const pushCalls = sb.rpc.mock.calls.filter(([n]) => n === 'food_sync_push');
    expect(pushCalls).toHaveLength(2);
  });

  test('coordinator: one _doPushAll per syncAll cycle, cached across food-table pushes', async () => {
    foodDb.getAllFoodEntriesSince.mockResolvedValueOnce([
      { id: 'fe-1', entry_date: '2026-05-26', meal_slot: 'breakfast', food_ref: 'off:1', quantity_g: 100, kcal: 100, protein_g: 10, carbs_g: 10, fat_g: 5, created_at: 1, updated_at: 1 },
    ]);
    const sb = makeFoodSb();
    getSupabaseClient.mockReturnValue(sb);

    // Two food-table pushes in the same cycle share one _doPushAll run.
    // Only food_entries has rows, so that run makes a single
    // food_sync_push call (custom_foods is empty and skipped).
    await pushTable('food_entries', { userId: 'u1', localUserId: 'u1' });
    await pushTable('custom_foods', { userId: 'u1', localUserId: 'u1' });

    const pushCalls = sb._calls.rpcs.filter((r) => r.name === 'food_sync_push');
    expect(pushCalls).toHaveLength(1);
  });

  test('pull-only daily_intake_rollups: count reflects locally-recomputed dates', async () => {
    foodDb.applyFoodEntryFromCloud.mockResolvedValue('2026-05-01');
    const sb = makeFoodSb({
      rpcData: {
        timestamp: new Date().toISOString(),
        changes: {
          food_entries: { created: [{ id: 'fe-cloud' }], updated: [], deleted: [] },
        },
      },
    });
    getSupabaseClient.mockReturnValue(sb);
    // First call to a food pull triggers the bulk RPC; subsequent
    // food-table pulls read from the cache.
    await pullTable('food_entries', { userId: 'u1' });
    const rollupResult = await pullTable('daily_intake_rollups', { userId: 'u1' });
    expect(rollupResult.count).toBeGreaterThan(0);
  });

  // ── saved_meals serialiser contract ──────────────────────────────
  // Regression guard for the 2026-05-29 latent bug: the serialiser used
  // foods_json + slot, columns that exist in neither the cloud DDL
  // (migrate_015) nor the food_sync_push RPC (migrate_016, reads
  // items_json). The effect was empty items pushed to the cloud, i.e.
  // every saved meal silently losing its contents on sync. Dormant
  // until the saved-meals UI shipped, which it now has.
  test('saved_meals push: emits items_json as a parsed array, never foods_json/slot', async () => {
    const items = [
      { foodRef: 'off:1', name: 'Oats', quantityG: 80, kcal: 300, proteinG: 11, carbsG: 50, fatG: 6 },
      { foodRef: 'off:2', name: 'Milk', quantityG: 200, kcal: 100, proteinG: 7, carbsG: 10, fatG: 4 },
    ];
    foodDb.getAllSavedMealsSince.mockResolvedValueOnce([
      { id: 'sm-1', name: 'Breakfast', items_json: JSON.stringify(items), created_at: 1, updated_at: 1 },
    ]);
    const sb = makeFoodSb();
    getSupabaseClient.mockReturnValue(sb);

    await pushTable('saved_meals', { userId: 'u1', localUserId: 'u1' });

    const pushCall = sb._calls.rpcs.find((r) => r.name === 'food_sync_push');
    expect(pushCall).toBeTruthy();
    const row = pushCall.args.changes.saved_meals.created[0];
    // The RPC does COALESCE(v_row->'items_json', '[]'), so items_json
    // must be an actual array to land as a jsonb array (not a string).
    expect(Array.isArray(row.items_json)).toBe(true);
    expect(row.items_json).toHaveLength(2);
    expect(row.items_json[0]).toMatchObject({ foodRef: 'off:1', quantityG: 80 });
    // The phantom columns must never reappear.
    expect(row).not.toHaveProperty('foods_json');
    expect(row).not.toHaveProperty('slot');
  });

  test('saved_meals push: malformed items_json degrades to an empty array, not a throw', async () => {
    foodDb.getAllSavedMealsSince.mockResolvedValueOnce([
      { id: 'sm-bad', name: 'Corrupt', items_json: 'not json', created_at: 1, updated_at: 1 },
    ]);
    const sb = makeFoodSb();
    getSupabaseClient.mockReturnValue(sb);
    await pushTable('saved_meals', { userId: 'u1', localUserId: 'u1' });
    const pushCall = sb._calls.rpcs.find((r) => r.name === 'food_sync_push');
    expect(pushCall.args.changes.saved_meals.created[0].items_json).toEqual([]);
  });
});

// T7 + T8 (two-device propagation, offline collision) were marked
// out of scope here on the grounds that "Volyume is Android-only,
// phone-only". That justification stopped being true when the app
// shipped on iOS via TestFlight, and the P0-8 conflict audit found
// the scenarios it excluded were the ones carrying real defects
// (Campaign 1 P0-8 D15). They are now covered, at the applier level
// and with no live Supabase project needed, in
// src/lib/__tests__/campaign1.syncConflict.test.js: a stale cloud
// row is driven over a newer local row for each conflict-prone
// table and the local row is asserted to survive.
