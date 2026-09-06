/**
 * Focused tests for src/lib/sync/tables/profiles.js, the merge
 * conflict path landing alongside migration 045
 * (users_profile.column_updates_at jsonb).
 *
 * Covers:
 *   - push payload includes column_updates_at populated from the
 *     useAppStore field-timestamp map;
 *   - push omits tier (server-owned) and stamps updated_at;
 *   - pull feeds cloud + local rows into conflict.resolve(merge),
 *     applies the merged result back to the store column-by-column;
 *   - pull short-circuits when the cloud row is absent.
 */

jest.mock('../../supabase', () => ({
  getSupabaseClient: jest.fn(),
  // The PGRST303 clock-skew retry (2026-09-06 triage) wraps the users_profile
  // read in tables/profiles.js. It only ever retries that one transient code,
  // so a straight pass-through is the correct stand-in here; the retry itself
  // is pinned in src/lib/__tests__/supabase.clockSkew.test.js.
  withClockSkewRetry: (fn) => fn(),
}));

jest.mock('../telemetry', () => ({
  trackSyncRun: jest.fn().mockResolvedValue(undefined),
  trackSyncConflictResolved: jest.fn().mockResolvedValue(undefined),
  logSyncError: jest.fn(),
}));

// jest.mock factories are hoisted before module-level state is
// initialised, so the mock must reference state through a function
// that resolves lazily. The "mock" prefix is on the global
// allowlist for jest.mock factories.
const mockStoreRef = { state: null };
jest.mock('../../../store/useAppStore', () => ({
  __esModule: true,
  default: {
    getState: () => mockStoreRef.state,
  },
}));

const { pushProfiles, pullProfiles } = require('../tables/profiles');
const { getSupabaseClient } = require('../../supabase');

function setStoreState(s) { mockStoreRef.state = s; }

beforeEach(() => {
  jest.clearAllMocks();
  mockStoreRef.state = null;
});

function makeUpsertSb({ upsertError = null } = {}) {
  const calls = { upserts: [] };
  return {
    _calls: calls,
    from: jest.fn(() => ({
      upsert: jest.fn(async (row, opts) => {
        calls.upserts.push({ row, opts });
        return { error: upsertError };
      }),
    })),
  };
}

function makeMaybeSingleSb({ data = null, error = null } = {}) {
  return {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          maybeSingle: jest.fn(async () => ({ data, error })),
        })),
      })),
    })),
  };
}

describe('profiles push', () => {
  test('payload carries column_updates_at + omits tier + upserts on id', async () => {
    setStoreState({
      userProfile: {
        firstName: 'Allan',
        units: 'kg',
        trainingFocus: 'bodybuilding',
        trainingAgeYears: 8,
        primaryEquipment: 'commercial',
        barWeight: 20,
      },
      userProfileFieldUpdatedAt: {
        firstName: Date.UTC(2026, 4, 27, 9, 11, 42),
        units:     Date.UTC(2026, 4, 26),
        barWeight: Date.UTC(2026, 4, 20),
      },
    });
    const sb = makeUpsertSb();
    getSupabaseClient.mockReturnValue(sb);

    const result = await pushProfiles(sb, { userId: 'u1' });

    expect(result).toEqual({ count: 1, errors: 0 });
    const { row, opts } = sb._calls.upserts[0];
    expect(opts).toEqual({ onConflict: 'id' });

    expect(row.id).toBe('u1');
    expect(row.first_name).toBe('Allan');
    expect(row.units).toBe('kg');
    expect(row.bar_weight).toBe(20);
    expect(row.training_age).toBe(8);
    expect('tier' in row).toBe(false);

    expect(row.column_updates_at).toEqual({
      first_name: '2026-05-27T09:11:42.000Z',
      units:      '2026-05-26T00:00:00.000Z',
      bar_weight: '2026-05-20T00:00:00.000Z',
    });
    expect(row.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test('empty column_updates_at when no field has been touched locally', async () => {
    setStoreState({
      userProfile: { firstName: 'Allan' },
      userProfileFieldUpdatedAt: {},
    });
    const sb = makeUpsertSb();
    getSupabaseClient.mockReturnValue(sb);

    await pushProfiles(sb, { userId: 'u1' });

    const { row } = sb._calls.upserts[0];
    expect(row.column_updates_at).toEqual({});
  });

  test('payload carries diet_preference + its column timestamp', async () => {
    setStoreState({
      userProfile: { firstName: 'Allan', dietPreference: 'vegan' },
      userProfileFieldUpdatedAt: { dietPreference: Date.UTC(2026, 4, 28) },
    });
    const sb = makeUpsertSb();
    getSupabaseClient.mockReturnValue(sb);

    await pushProfiles(sb, { userId: 'u1' });

    const { row } = sb._calls.upserts[0];
    expect(row.diet_preference).toBe('vegan');
    expect(row.column_updates_at.diet_preference).toBe('2026-05-28T00:00:00.000Z');
  });

  test('diet_preference defaults to omnivore when unset', async () => {
    setStoreState({ userProfile: { firstName: 'Allan' }, userProfileFieldUpdatedAt: {} });
    const sb = makeUpsertSb();
    getSupabaseClient.mockReturnValue(sb);

    await pushProfiles(sb, { userId: 'u1' });

    expect(sb._calls.upserts[0].row.diet_preference).toBe('omnivore');
  });

  // Allergen excludes (dietary-needs build 2026-07-09, migrate_112): mirrors
  // the sex/diet_preference column tests above for the new jsonb column.
  test('payload carries allergen_excludes + its column timestamp when stamped', async () => {
    setStoreState({
      userProfile: { firstName: 'Allan', mealPlanExcludeTags: ['peanuts', 'milk'] },
      userProfileFieldUpdatedAt: { mealPlanExcludeTags: Date.UTC(2026, 6, 9) },
    });
    const sb = makeUpsertSb();
    getSupabaseClient.mockReturnValue(sb);

    await pushProfiles(sb, { userId: 'u1' });

    const { row } = sb._calls.upserts[0];
    expect(row.allergen_excludes).toEqual(['peanuts', 'milk']);
    expect(row.column_updates_at.allergen_excludes).toBe('2026-07-09T00:00:00.000Z');
  });

  test('allergen_excludes defaults to an empty array when unset', async () => {
    setStoreState({ userProfile: { firstName: 'Allan' }, userProfileFieldUpdatedAt: {} });
    const sb = makeUpsertSb();
    getSupabaseClient.mockReturnValue(sb);

    await pushProfiles(sb, { userId: 'u1' });

    expect(sb._calls.upserts[0].row.allergen_excludes).toEqual([]);
  });

  // U2 sex mirror, moved here from the retired legacy syncProfile (E12
  // step 1): only the two onboarding-enforced values ever cross the wire.
  test('payload carries a valid sex; invalid or missing sex is null', async () => {
    const sb = makeUpsertSb();
    getSupabaseClient.mockReturnValue(sb);

    setStoreState({ userProfile: { firstName: 'A', sex: 'male' }, userProfileFieldUpdatedAt: {} });
    await pushProfiles(sb, { userId: 'u1' });
    expect(sb._calls.upserts[0].row.sex).toBe('male');

    setStoreState({ userProfile: { firstName: 'A', sex: 'other' }, userProfileFieldUpdatedAt: {} });
    await pushProfiles(sb, { userId: 'u1' });
    expect(sb._calls.upserts[1].row.sex).toBeNull();

    setStoreState({ userProfile: { firstName: 'A' }, userProfileFieldUpdatedAt: {} });
    await pushProfiles(sb, { userId: 'u1' });
    expect(sb._calls.upserts[2].row.sex).toBeNull();
  });

  // Column tolerance (migrate_094 sex, migrate_112 allergen_excludes): a
  // cloud project missing either column rejects the WHOLE upsert; the
  // handler walks its retry ladder until an attempt carries only columns
  // the cloud knows, so the core fields keep syncing. Updated 2026-07-09
  // (dietary-needs build): the ladder now also strips allergen_excludes,
  // so the mock simulates the unmigrated cloud faithfully (errors on any
  // payload containing a missing column) instead of failing call #1 only.
  test('retries the upsert without unmigrated columns when the cloud rejects them', async () => {
    setStoreState({
      userProfile: { firstName: 'A', sex: 'female', mealPlanExcludeTags: ['peanuts'] },
      userProfileFieldUpdatedAt: {},
    });
    const calls = { upserts: [] };
    const missing = ['sex', 'allergen_excludes']; // neither 094 nor 112 applied
    const sb = {
      _calls: calls,
      from: jest.fn(() => ({
        upsert: jest.fn(async (row, opts) => {
          calls.upserts.push({ row, opts });
          const rejected = missing.some((c) => c in row);
          return { error: rejected ? { code: 'PGRST204' } : null };
        }),
      })),
    };
    getSupabaseClient.mockReturnValue(sb);

    const result = await pushProfiles(sb, { userId: 'u1' });

    expect(result).toEqual({ count: 1, errors: 0 });
    // Ladder: full -> minus allergen_excludes -> minus sex -> minus both.
    const last = calls.upserts[calls.upserts.length - 1].row;
    expect('sex' in last).toBe(false);
    expect('allergen_excludes' in last).toBe(false);
    // The first attempt still tried the full payload (both columns sent).
    expect(calls.upserts[0].row.sex).toBe('female');
    expect(calls.upserts[0].row.allergen_excludes).toEqual(['peanuts']);
    // Core fields survive to the successful attempt.
    expect(last.first_name).toBe('A');
  });

  test('returns count:0 when there is no profile in the store', async () => {
    setStoreState({ userProfile: null });
    const sb = makeUpsertSb();
    getSupabaseClient.mockReturnValue(sb);

    const result = await pushProfiles(sb, { userId: 'u1' });

    expect(result).toEqual({ count: 0, errors: 0 });
    expect(sb._calls.upserts).toHaveLength(0);
  });

  test('errors:1 when upsert fails', async () => {
    setStoreState({
      userProfile: { firstName: 'Allan' },
      userProfileFieldUpdatedAt: {},
    });
    const sb = makeUpsertSb({ upsertError: new Error('rls') });
    getSupabaseClient.mockReturnValue(sb);

    const result = await pushProfiles(sb, { userId: 'u1' });

    expect(result).toEqual({ count: 0, errors: 1 });
  });
});

describe('profiles pull (merge)', () => {
  test('per-column merge applies cloud values for fields server wrote more recently', async () => {
    const setUserProfile = jest.fn();
    setStoreState({
      userProfile: {
        firstName: 'OldName',
        units: 'kg',
        trainingFocus: 'bodybuilding',
        barWeight: 20,
      },
      userProfileFieldUpdatedAt: {
        firstName: Date.UTC(2026, 0, 1),
        units:     Date.UTC(2026, 5, 1),
      },
      setUserProfile,
    });

    const sb = makeMaybeSingleSb({
      data: {
        first_name: 'CloudName',
        units: 'lbs',
        training_focus: 'powerlifting',
        training_age: 5,
        primary_equipment: 'home',
        bar_weight: 25,
        updated_at: new Date(Date.UTC(2026, 5, 1)).toISOString(),
        column_updates_at: {
          first_name:     '2026-05-15T00:00:00.000Z',
          units:          '2026-05-15T00:00:00.000Z',
          training_focus: '2026-04-01T00:00:00.000Z',
          bar_weight:     '2026-04-01T00:00:00.000Z',
        },
      },
    });
    getSupabaseClient.mockReturnValue(sb);

    const result = await pullProfiles(sb, { userId: 'u1' });

    expect(result.count).toBe(1);
    expect(result.errors).toBe(0);

    const applied = setUserProfile.mock.calls[0][0];
    expect(applied.firstName).toBe('CloudName');
    expect(applied.units).toBe('kg');
  });

  test('local-only fields (meal-plan prefs) survive a pull that changes a synced field', async () => {
    // Regression: pullProfiles must NOT rebuild userProfile from only the
    // synced columns, or it silently wipes local-only fields (the meal-plan
    // prefs have no cloud column) on the next sync.
    const setUserProfile = jest.fn();
    setStoreState({
      userProfile: {
        firstName: 'OldName', units: 'kg', trainingFocus: 'bodybuilding', barWeight: 20,
        mealPlanExcludeFoods: ['white_rice', 'eggs'],
        mealPlanMealsPerDay: 5,
        mealPlanVariety: 0,
        mealPlanFatConvention: 'higher_rest_day',
      },
      userProfileFieldUpdatedAt: { firstName: Date.UTC(2026, 0, 1) },
      setUserProfile,
    });
    const sb = makeMaybeSingleSb({
      data: {
        first_name: 'CloudName', units: 'kg', training_focus: 'bodybuilding',
        training_age: null, primary_equipment: null, bar_weight: 20,
        diet_preference: 'omnivore',
        updated_at: new Date(Date.UTC(2026, 5, 1)).toISOString(),
        column_updates_at: { first_name: '2026-05-15T00:00:00.000Z' },
      },
    });
    getSupabaseClient.mockReturnValue(sb);

    await pullProfiles(sb, { userId: 'u1' });

    const applied = setUserProfile.mock.calls[0][0];
    expect(applied.firstName).toBe('CloudName'); // synced field updated
    // local-only meal-plan prefs preserved through the pull
    expect(applied.mealPlanExcludeFoods).toEqual(['white_rice', 'eggs']);
    expect(applied.mealPlanMealsPerDay).toBe(5);
    expect(applied.mealPlanVariety).toBe(0);
    expect(applied.mealPlanFatConvention).toBe('higher_rest_day');
  });

  test('per-column merge pulls a newer cloud diet_preference', async () => {
    const setUserProfile = jest.fn();
    setStoreState({
      userProfile: {
        firstName: 'Allan', units: 'kg', trainingFocus: 'bodybuilding',
        trainingAgeYears: 8, primaryEquipment: 'commercial', barWeight: 20,
        dietPreference: 'omnivore',
      },
      userProfileFieldUpdatedAt: { dietPreference: Date.UTC(2026, 0, 1) },
      setUserProfile,
    });
    const sb = makeMaybeSingleSb({
      data: {
        first_name: 'Allan', units: 'kg', training_focus: 'bodybuilding',
        training_age: 8, primary_equipment: 'commercial', bar_weight: 20,
        diet_preference: 'vegan',
        updated_at: new Date(Date.UTC(2026, 5, 1)).toISOString(),
        column_updates_at: { diet_preference: '2026-05-15T00:00:00.000Z' },
      },
    });
    getSupabaseClient.mockReturnValue(sb);

    const result = await pullProfiles(sb, { userId: 'u1' });

    expect(setUserProfile).toHaveBeenCalledWith(expect.objectContaining({ dietPreference: 'vegan' }));
    expect(result.count).toBe(1);
  });

  // U2 sex mirror on pull (E12 step 1): a valid cloud sex restores onto the
  // profile (the fresh-install case migrate_094 exists for)...
  test('a valid cloud sex is applied to the local profile', async () => {
    const setUserProfile = jest.fn();
    setStoreState({
      userProfile: { firstName: 'Allan', units: 'kg' },
      userProfileFieldUpdatedAt: {},
      setUserProfile,
    });
    const sb = makeMaybeSingleSb({
      data: {
        first_name: 'Allan', units: 'kg', training_focus: 'bodybuilding',
        sex: 'female',
        updated_at: new Date(Date.UTC(2026, 5, 1)).toISOString(),
        column_updates_at: {},
      },
    });
    getSupabaseClient.mockReturnValue(sb);

    await pullProfiles(sb, { userId: 'u1' });

    expect(setUserProfile).toHaveBeenCalledWith(expect.objectContaining({ sex: 'female' }));
  });

  // ...but sex NEVER unsets: it is onboarding-enforced and drives the ED
  // calorie floor + BMR, so a cloud row without one (pre-094 project via the
  // sex-less fallback select, or a legacy account) must keep the local value.
  test('a cloud row without sex keeps the local sex (fallback select path)', async () => {
    const setUserProfile = jest.fn();
    setStoreState({
      userProfile: { firstName: 'OldName', units: 'kg', sex: 'male' },
      userProfileFieldUpdatedAt: {},
      setUserProfile,
    });
    let reads = 0;
    const sb = {
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            maybeSingle: jest.fn(async () => {
              reads += 1;
              // First read (WITH sex) fails as an unmigrated project would;
              // the fallback sex-less read returns the row without sex.
              if (reads === 1) return { data: null, error: { code: '42703' } };
              return {
                data: {
                  first_name: 'CloudName', units: 'kg',
                  training_focus: 'bodybuilding',
                  updated_at: new Date(Date.UTC(2026, 5, 1)).toISOString(),
                  column_updates_at: { first_name: '2026-05-15T00:00:00.000Z' },
                },
                error: null,
              };
            }),
          })),
        })),
      })),
    };
    getSupabaseClient.mockReturnValue(sb);

    const result = await pullProfiles(sb, { userId: 'u1' });

    expect(result.errors).toBe(0);
    expect(reads).toBe(2);
    const applied = setUserProfile.mock.calls[0][0];
    expect(applied.firstName).toBe('CloudName');
    expect(applied.sex).toBe('male'); // local sex survives
  });

  test('pull short-circuits when the cloud row does not exist', async () => {
    const setUserProfile = jest.fn();
    setStoreState({
      userProfile: { firstName: 'Allan' },
      userProfileFieldUpdatedAt: {},
      setUserProfile,
    });
    const sb = makeMaybeSingleSb({ data: null });
    getSupabaseClient.mockReturnValue(sb);

    const result = await pullProfiles(sb, { userId: 'u1' });

    expect(result).toEqual({ count: 0, errors: 0 });
    expect(setUserProfile).not.toHaveBeenCalled();
  });

  test('errors:1 when select fails', async () => {
    const setUserProfile = jest.fn();
    setStoreState({
      userProfile: { firstName: 'Allan' },
      userProfileFieldUpdatedAt: {},
      setUserProfile,
    });
    const sb = makeMaybeSingleSb({ data: null, error: new Error('rls') });
    getSupabaseClient.mockReturnValue(sb);

    const result = await pullProfiles(sb, { userId: 'u1' });

    expect(result).toEqual({ count: 0, errors: 1 });
    expect(setUserProfile).not.toHaveBeenCalled();
  });

  // Anti-churn (2026-05-29): the cloud row carries the SAME values the
  // store already holds, so the merge resolves to the current profile.
  // Writing it back would re-stamp userProfileFieldUpdatedAt and make the
  // next push look newer, re-triggering the merge every sync cycle. The
  // handler must skip the store write when merged == local.
  test('no-op when the merged profile equals local: skips setUserProfile', async () => {
    const setUserProfile = jest.fn();
    setStoreState({
      userProfile: {
        firstName: 'Allan',
        units: 'kg',
        trainingFocus: 'bodybuilding',
        trainingAgeYears: 8,
        primaryEquipment: 'commercial',
        barWeight: 20,
      },
      userProfileFieldUpdatedAt: {},
      setUserProfile,
    });
    const sb = makeMaybeSingleSb({
      data: {
        first_name: 'Allan',
        units: 'kg',
        training_focus: 'bodybuilding',
        training_age: 8,
        primary_equipment: 'commercial',
        bar_weight: 20,
        updated_at: new Date(Date.UTC(2026, 5, 1)).toISOString(),
        column_updates_at: {},
      },
    });
    getSupabaseClient.mockReturnValue(sb);

    const result = await pullProfiles(sb, { userId: 'u1' });

    expect(setUserProfile).not.toHaveBeenCalled();
    expect(result.count).toBe(0);
    expect(result.errors).toBe(0);
  });

  // Counterpart: a genuine cloud change still writes. The cloud wrote
  // bar_weight most recently (per column_updates_at), so the merge pulls
  // it in and the profile differs from local, so the write happens.
  test('writes when the merge changes a field', async () => {
    const setUserProfile = jest.fn();
    setStoreState({
      userProfile: {
        firstName: 'Allan',
        units: 'kg',
        trainingFocus: 'bodybuilding',
        trainingAgeYears: 8,
        primaryEquipment: 'commercial',
        barWeight: 20,
      },
      userProfileFieldUpdatedAt: { barWeight: Date.UTC(2026, 0, 1) },
      setUserProfile,
    });
    const sb = makeMaybeSingleSb({
      data: {
        first_name: 'Allan',
        units: 'kg',
        training_focus: 'bodybuilding',
        training_age: 8,
        primary_equipment: 'commercial',
        bar_weight: 25,
        updated_at: new Date(Date.UTC(2026, 5, 1)).toISOString(),
        column_updates_at: { bar_weight: '2026-05-15T00:00:00.000Z' },
      },
    });
    getSupabaseClient.mockReturnValue(sb);

    const result = await pullProfiles(sb, { userId: 'u1' });

    expect(setUserProfile).toHaveBeenCalledWith(expect.objectContaining({ barWeight: 25 }));
    expect(result.count).toBe(1);
  });
});
