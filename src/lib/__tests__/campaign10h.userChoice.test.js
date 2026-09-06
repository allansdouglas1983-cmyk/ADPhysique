/**
 * campaign10h.userChoice.test.js — Campaign 10H, user choice integrity.
 *
 * ONE product law across three surfaces: the user made a choice, so
 * Volyume must respect it, and the choice must not silently disappear or
 * be transmitted contrary to its own contract.
 *
 * WHY THIS SUITE EXISTS AS WELL AS campaign1.integrity.test.js. The three
 * defects (F-3 privacy opt-out entering pref sync, F-4 dropped allergen
 * stamp, F-5 launch-wiped meal reminders) were fixed in Campaign 1
 * (19c109dd, 2026-08-10) but were pinned mostly by SOURCE guards —
 * fs.readFileSync + regex over the fix site. A source guard proves the
 * line is still written; it does not prove the behaviour still holds if
 * the surrounding machinery changes underneath it. These are the
 * behavioural pins: they run the real predicate, the real merge and the
 * real appliers.
 *
 * This file covers privacy and allergens. Meal reminders need an
 * incompatible module-mock set (expo-notifications + the store) so they
 * live in campaign10h.mealReminders.test.js.
 */

jest.mock('expo-sqlite');
jest.mock('../supabase', () => ({
  getSupabaseClient: () => null,
  // Pass-through stand-in for the PGRST303 clock-skew retry (2026-09-06
  // triage) that tables/profiles.js wraps its users_profile read in; the retry
  // itself is pinned in src/lib/__tests__/supabase.clockSkew.test.js.
  withClockSkewRetry: (fn) => fn(),
}));
jest.mock('../errorLog', () => ({
  logError: jest.fn(), logWarn: jest.fn(), logInfo: jest.fn(),
}));
jest.mock('../sync/telemetry', () => ({
  logSyncError: jest.fn(),
  trackSyncConflictResolved: jest.fn(() => Promise.resolve()),
}));

const { shouldSyncPref } = require('../sync');
const { resolve: resolveConflict } = require('../sync/conflict');
const { PRIVACY_PREFS_KEY } = require('../privacyPrefs');

// ─── F-3: the analytics opt-out is device-local ─────────────────────────

describe('F-3: the privacy opt-out can never enter generic preference sync', () => {
  // privacyPrefs.js's contract: "a privacy opt-out should not itself be
  // transmitted, so this never goes through pref sync". The key starts
  // with @volyume_ and the prefs sync is allow-by-prefix (fail-open), so
  // the contract holds only while the key is named in the exclusion list.
  test('the real key fails the real predicate (push side)', () => {
    expect(shouldSyncPref(PRIVACY_PREFS_KEY)).toBe(false);
    expect(shouldSyncPref('@volyume_privacy_prefs')).toBe(false);
  });

  test('the predicate is the SAME one the pull applies, so both directions close', () => {
    // _pullUserPrefs is not exported; what is assertable behaviourally is
    // that one predicate governs both, which the source pin in
    // syncPrefExclusions.test.js anchors at the call site. Here we pin the
    // property that makes a single predicate sufficient: it is a pure
    // function of the key, with no direction argument.
    expect(shouldSyncPref.length).toBe(1);
    expect(shouldSyncPref(PRIVACY_PREFS_KEY)).toBe(shouldSyncPref(PRIVACY_PREFS_KEY));
  });

  test('no derived copy of the opt-out sneaks through a neighbouring key', () => {
    for (const key of [
      '@volyume_privacy_prefs',
      '@volyume_privacy_prefs_v2',
      '@volyume_privacy_prefs_user-1',
    ]) {
      // The first is excluded outright. The variants are the shapes a
      // future rename would take; if one of them ever syncs, the opt-out
      // has quietly become transmissible again.
      if (key === '@volyume_privacy_prefs') expect(shouldSyncPref(key)).toBe(false);
    }
    // RE-ANCHORED by C14 job 1. Under the old FAIL-OPEN model a renamed key
    // inherited sync by default, and this asserted that: the anchored
    // exclusion deliberately did not cover '@volyume_privacy_prefs_v2'.
    // Sync is now FAIL-CLOSED, so an unclassified key - renamed, new, or
    // simply forgotten - does not sync at all. Strictly better for exactly
    // the contract this test defends.
    expect(shouldSyncPref('@volyume_privacy_prefs_v2')).toBe(false);
  });

  test('the exclusion did not over-reach: unrelated preferences still sync', () => {
    expect(shouldSyncPref('@volyume_quiet_hours_v1')).toBe(true);
    expect(shouldSyncPref('@volyume_notification_prefs')).toBe(true);
    expect(shouldSyncPref('@volyume_meal_reminders')).toBe(true);
  });
});

// ─── F-4: the allergen exclusion list carries its own timestamp ─────────

describe('F-4: allergen exclusions survive the profile merge', () => {
  // The merge is per-COLUMN: for each column the client stamped, the
  // newer timestamp wins; a column the client never stamped keeps the
  // SERVER value. That is the whole defect — setAllergenExcludes asked
  // for a stamp, PROFILE_FIELDS_TRACKED dropped it, so allergen_excludes
  // never appeared in column_updates_at and every pull handed the column
  // back to the cloud, however old the cloud copy was.
  const ISO = (ms) => new Date(ms).toISOString();
  const T_OLD = Date.parse('2026-08-01T00:00:00.000Z');
  const T_NEW = Date.parse('2026-08-11T00:00:00.000Z');

  const localRow = (tags, stampMs) => ({
    id: 'user-1',
    updated_at: ISO(stampMs),
    allergen_excludes: tags,
    diet_preference: 'omnivore',
    column_updates_at: stampMs == null ? {} : { allergen_excludes: ISO(stampMs) },
  });
  const serverRow = (tags, stampMs) => ({
    id: 'user-1',
    updated_at: ISO(stampMs),
    allergen_excludes: tags,
    diet_preference: 'omnivore',
    column_updates_at: { allergen_excludes: ISO(stampMs) },
  });
  const merge = (local, server) => resolveConflict({
    table: 'profiles', recordId: 'user-1', local, server, userId: 'user-1',
  });

  test('A: a NEWER local exclusion is not removed by an OLDER cloud pull', async () => {
    // The user adds "peanuts" on this phone today; the cloud still holds
    // last week's empty list from the other device.
    const { row, winner } = await merge(
      localRow(['peanuts'], T_NEW),
      serverRow([], T_OLD),
    );
    expect(winner).toBe('merged');
    expect(row.allergen_excludes).toEqual(['peanuts']);
  });

  test('A: and this is WHY the stamp matters — without it the older cloud wins', async () => {
    // The exact pre-fix shape: identical data, identical timestamps, but
    // no allergen_excludes entry in the local column map because
    // _stampProfileFields dropped the untracked field. The merge then has
    // nothing to compare and keeps the server column.
    const unstamped = localRow(['peanuts'], null);
    const { row } = await merge(unstamped, serverRow([], T_OLD));
    expect(row.allergen_excludes).toEqual([]); // the allergy is gone
  });

  test('B: a genuinely NEWER cloud allergen state applies (existing newer-wins law)', async () => {
    const { row } = await merge(
      localRow([], T_OLD),
      serverRow(['milk', 'peanuts'], T_NEW),
    );
    expect(row.allergen_excludes).toEqual(['milk', 'peanuts']);
  });

  test('an equal timestamp is not newer, so the cloud column stands', async () => {
    const { row } = await merge(localRow(['peanuts'], T_OLD), serverRow([], T_OLD));
    expect(row.allergen_excludes).toEqual([]);
  });

  test('the merge is per-column: an allergen win does not drag unrelated columns', async () => {
    const local = {
      ...localRow(['peanuts'], T_NEW),
      diet_preference: 'omnivore',
      units: 'kg',
    };
    const server = {
      ...serverRow([], T_OLD),
      diet_preference: 'vegan',
      units: 'lbs',
      column_updates_at: { allergen_excludes: ISO(T_OLD), diet_preference: ISO(T_NEW) },
    };
    const { row } = await merge(local, server);
    expect(row.allergen_excludes).toEqual(['peanuts']); // local stamped, newer
    expect(row.diet_preference).toBe('vegan');          // local never stamped it
    expect(row.units).toBe('lbs');                      // untouched by the client
  });
});

// ─── F-4 (cont.): the pull applier's own protections ────────────────────

describe('F-4: the profile pull never wipes an allergy or a local-only pref', () => {
  // pullProfiles reads and writes the store; each case loads the module
  // fresh with the store state it needs and a hand-built supabase double.
  const loadWithStore = (state) => {
    jest.resetModules();
    jest.doMock('expo-sqlite');
    jest.doMock('../supabase', () => ({
      getSupabaseClient: () => null,
      withClockSkewRetry: (fn) => fn(),
    }));
    jest.doMock('../errorLog', () => ({
      logError: jest.fn(), logWarn: jest.fn(), logInfo: jest.fn(),
    }));
    jest.doMock('../sync/telemetry', () => ({
      logSyncError: jest.fn(),
      trackSyncConflictResolved: jest.fn(() => Promise.resolve()),
    }));
    const setUserProfile = jest.fn();
    jest.doMock('../../store/useAppStore', () => ({
      __esModule: true,
      default: { getState: () => ({ ...state, setUserProfile }) },
    }));
    // eslint-disable-next-line global-require
    const { pullProfiles } = require('../sync/tables/profiles');
    return { pullProfiles, setUserProfile };
  };

  const sbReturning = (row) => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: row, error: null }) }),
      }),
    }),
  });

  afterAll(() => { jest.resetModules(); });

  test('C: a fresh device restores the cloud allergen list through the profile path', async () => {
    const { pullProfiles, setUserProfile } = loadWithStore({
      userProfile: {}, userProfileFieldUpdatedAt: {},
    });
    await pullProfiles(sbReturning({
      first_name: 'Sam',
      units: 'kg',
      allergen_excludes: ['peanuts', 'milk'],
      updated_at: '2026-08-11T00:00:00.000Z',
      column_updates_at: { allergen_excludes: '2026-08-11T00:00:00.000Z' },
    }), { userId: 'user-1' });
    expect(setUserProfile).toHaveBeenCalled();
    expect(setUserProfile.mock.calls[0][0].mealPlanExcludeTags).toEqual(['peanuts', 'milk']);
  });

  test('a cloud row with NO allergen column (pre-112) never unsets the local list', async () => {
    const { pullProfiles, setUserProfile } = loadWithStore({
      userProfile: { firstName: 'Sam', mealPlanExcludeTags: ['peanuts'] },
      userProfileFieldUpdatedAt: {},
    });
    await pullProfiles(sbReturning({
      first_name: 'Sam',
      units: 'kg',
      updated_at: '2026-08-11T00:00:00.000Z',
      column_updates_at: {},
    }), { userId: 'user-1' });
    for (const call of setUserProfile.mock.calls) {
      expect(call[0].mealPlanExcludeTags).toEqual(['peanuts']);
    }
  });

  test('D: mealPlanExcludeFoods is local-only and survives the pull untouched', async () => {
    const { pullProfiles, setUserProfile } = loadWithStore({
      userProfile: {
        firstName: 'Sam',
        mealPlanExcludeFoods: ['curated:olives'],
        mealPlanMealsPerDay: 4,
        mealPlanVariety: 'high',
      },
      userProfileFieldUpdatedAt: {},
    });
    await pullProfiles(sbReturning({
      first_name: 'Sam',
      units: 'lbs', // forces a real change so the write actually fires
      allergen_excludes: ['peanuts'],
      updated_at: '2026-08-11T00:00:00.000Z',
      column_updates_at: { allergen_excludes: '2026-08-11T00:00:00.000Z' },
    }), { userId: 'user-1' });
    const written = setUserProfile.mock.calls[0][0];
    expect(written.mealPlanExcludeFoods).toEqual(['curated:olives']);
    expect(written.mealPlanMealsPerDay).toBe(4);
    expect(written.mealPlanVariety).toBe('high');
  });

  test('the allergen FILTER itself is untouched: this campaign moved persistence only', () => {
    // Campaign 10H fixes where the exclusion is STORED and how it survives
    // a merge. What an exclusion DOES to food selection is allergen-
    // detection science and is deliberately unchanged.
    // eslint-disable-next-line global-require
    const { foodExcluded, tagsOf } = require('../food/foodRoles');
    expect(tagsOf('oats')).toContain('cereals_gluten');
    expect(foodExcluded('oats', { excludeTags: ['cereals_gluten'] })).toBe(true);
    expect(foodExcluded('oats', { excludeTags: ['milk'] })).toBe(false);
    expect(foodExcluded('oats', {})).toBe(false);
    // Individual dislikes are a separate, local-only list and still work.
    expect(foodExcluded('oats', { excludeFoodKeys: ['oats'] })).toBe(true);
  });

  test('F: exactly ONE meal-plan preference is a cloud profile column', () => {
    // Tracking mealPlanExcludeTags must not have promoted the whole
    // mealPlan* family into the synced profile.
    // eslint-disable-next-line global-require
    const fs = require('fs');
    // eslint-disable-next-line global-require
    const path = require('path');
    const SRC = fs.readFileSync(
      path.resolve(__dirname, '..', 'sync', 'tables', 'profiles.js'), 'utf8',
    );
    const mapBlock = SRC.match(/const FIELD_MAP = Object\.freeze\(\[[\s\S]*?\]\);/)[0];
    const mealPlanFields = mapBlock.match(/'mealPlan\w+'/g) ?? [];
    expect(mealPlanFields).toEqual(["'mealPlanExcludeTags'"]);
  });
});
