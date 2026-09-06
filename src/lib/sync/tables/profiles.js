/**
 * profiles per-table push + pull.
 *
 * The cloud table is users_profile (legacy name; the registry
 * uses 'profiles'). The user profile lives in useAppStore in
 * memory (Zustand) backed by AsyncStorage, not in SQLite, so
 * this handler reads/writes app state directly.
 *
 * Migration 045 adds users_profile.column_updates_at jsonb plus
 * a safe-merge trigger; per-field write timestamps live in the
 * client store at userProfileFieldUpdatedAt (camelCase keyed,
 * matching how the profile itself is shaped in the store). The
 * handler maps both to snake_case on push and feeds the cloud's
 * column_updates_at into conflict.resolve(merge) on pull.
 *
 * tier is excluded from the push payload, the server owns tier
 * exclusively via the upgrade_tier RPC + play-billing-rtdn
 * webhook, and migrate_005's trigger rolls back any client UPDATE
 * to it.
 */

import { logSyncError } from '../telemetry';
import { withClockSkewRetry } from '../../supabase';
import { resolve as resolveConflict } from '../conflict';

// camelCase store keys → snake_case users_profile columns. Order
// matters only for stable column_updates_at serialisation in tests.
// sex (U2, migrate_094) moved here from the retired legacy syncProfile
// (E12 step 1): it mirrors onto the main profile row so it survives a
// fresh-install cloud pull even if the user_body_profile row is missing.
const FIELD_MAP = Object.freeze([
  ['firstName',        'first_name'],
  ['units',            'units'],
  ['trainingFocus',    'training_focus'],
  ['trainingAgeYears', 'training_age'],
  ['primaryEquipment', 'primary_equipment'],
  ['barWeight',        'bar_weight'],
  ['dietPreference',   'diet_preference'],
  ['sex',              'sex'],
  // Allergen excludes (dietary-needs build 2026-07-09, migrate_112): the
  // FSA-tag exclusion list rides the profile merge so an allergy survives a
  // device change. Kept as mealPlanExcludeTags locally so every engine
  // reader stays unchanged. jsonb array column.
  ['mealPlanExcludeTags', 'allergen_excludes'],
]);

// Columns that may not exist in the cloud yet (founder applies migrations
// manually): sex (migrate_094), allergen_excludes (migrate_112). PostgREST
// rejects a whole upsert for one unknown column, so the push retries with
// progressively fewer optional columns rather than failing the sync.
const OPTIONAL_COLUMNS = Object.freeze(['allergen_excludes', 'sex']);

function _withoutColumns(payload, cols) {
  const out = { ...payload, column_updates_at: { ...payload.column_updates_at } };
  for (const c of cols) {
    delete out[c];
    delete out.column_updates_at[c];
  }
  return out;
}

// Only the two onboarding-enforced values ever cross the wire; anything
// else (including a legacy profile without one) travels as null.
function _validSex(v) {
  return v === 'male' || v === 'female' ? v : null;
}

function _toIso(ms) {
  if (!ms) return null;
  if (typeof ms === 'string') return ms;
  return new Date(Number(ms)).toISOString();
}

function _readStore() {
  try {
    // eslint-disable-next-line global-require
    const useAppStore = require('../../../store/useAppStore').default;
    return useAppStore.getState() ?? {};
  } catch (_) {
    return {};
  }
}

function _writeStore(profile) {
  try {
    // eslint-disable-next-line global-require
    const useAppStore = require('../../../store/useAppStore').default;
    const setUserProfile = useAppStore.getState()?.setUserProfile;
    if (typeof setUserProfile !== 'function') return false;
    setUserProfile(profile);
    return true;
  } catch (_) {
    return false;
  }
}

// Compare the six user-editable fields the merge can touch. Defaults
// are applied on both sides (matching mergedProfile + how the store
// holds them) so a null-vs-default mismatch doesn't read as a change
// and re-trigger the churn the gate exists to stop.
function _profilesEqual(a, b) {
  const norm = (p) => ({
    firstName:        p?.firstName ?? null,
    units:            p?.units ?? 'kg',
    trainingFocus:    p?.trainingFocus ?? 'bodybuilding',
    trainingAgeYears: p?.trainingAgeYears ?? null,
    primaryEquipment: p?.primaryEquipment ?? null,
    barWeight:        p?.barWeight ?? 20,
    dietPreference:   p?.dietPreference ?? 'omnivore',
    sex:              _validSex(p?.sex),
    allergenExcludes: JSON.stringify(Array.isArray(p?.mealPlanExcludeTags) ? p.mealPlanExcludeTags : []),
  });
  const x = norm(a);
  const y = norm(b);
  return x.firstName === y.firstName
    && x.units === y.units
    && x.trainingFocus === y.trainingFocus
    && x.trainingAgeYears === y.trainingAgeYears
    && x.primaryEquipment === y.primaryEquipment
    && x.barWeight === y.barWeight
    && x.dietPreference === y.dietPreference
    && x.sex === y.sex
    && x.allergenExcludes === y.allergenExcludes;
}

function _profileToCloudPayload(userId, profile, fieldUpdatedAt) {
  const payload = {
    id: userId,
    updated_at: new Date().toISOString(),
  };
  const columnUpdatesAt = {};
  for (const [camel, snake] of FIELD_MAP) {
    if (camel === 'firstName')        payload[snake] = profile.firstName ?? null;
    else if (camel === 'units')       payload[snake] = profile.units ?? 'kg';
    else if (camel === 'trainingFocus') payload[snake] = profile.trainingFocus ?? 'bodybuilding';
    else if (camel === 'trainingAgeYears') payload[snake] = profile.trainingAgeYears ?? null;
    else if (camel === 'primaryEquipment') payload[snake] = profile.primaryEquipment ?? null;
    else if (camel === 'barWeight')   payload[snake] = profile.barWeight ?? 20;
    else if (camel === 'dietPreference') payload[snake] = profile.dietPreference ?? 'omnivore';
    else if (camel === 'sex')         payload[snake] = _validSex(profile.sex);
    else if (camel === 'mealPlanExcludeTags') {
      payload[snake] = Array.isArray(profile.mealPlanExcludeTags)
        ? profile.mealPlanExcludeTags : [];
    }

    const ts = fieldUpdatedAt?.[camel];
    if (ts) columnUpdatesAt[snake] = _toIso(ts);
  }
  payload.column_updates_at = columnUpdatesAt;
  return payload;
}

export async function pushProfiles(sb, { userId } = {}) {
  if (!sb || !userId) return { count: 0, errors: 0 };
  try {
    const state = _readStore();
    const profile = state.userProfile;
    if (!profile) return { count: 0, errors: 0 };

    const fieldUpdatedAt = state.userProfileFieldUpdatedAt || {};
    const payload = _profileToCloudPayload(userId, profile, fieldUpdatedAt);

    // Column tolerance (migrate_094 sex, migrate_112 allergen_excludes):
    // try the full payload, then drop each optional column, then both, so
    // the core fields keep syncing until the founder applies the
    // migrations. Only a failure with NO optional columns is a real error.
    const attempts = [
      payload,
      _withoutColumns(payload, [OPTIONAL_COLUMNS[0]]),
      _withoutColumns(payload, [OPTIONAL_COLUMNS[1]]),
      _withoutColumns(payload, OPTIONAL_COLUMNS),
    ];
    let error = null;
    for (const attempt of attempts) {
      ({ error } = await sb
        .from('users_profile')
        .upsert(attempt, { onConflict: 'id' }));
      if (!error) return { count: 1, errors: 0 };
    }
    logSyncError('sync.tables.profiles.pushUpsert', error);
    return { count: 0, errors: 1 };
  } catch (e) {
    logSyncError('sync.tables.profiles.push', e);
    return { count: 0, errors: 1 };
  }
}

export async function pullProfiles(sb, { userId } = {}) {
  if (!sb || !userId) return { count: 0, errors: 0 };
  try {
    const BASE_COLS = 'first_name, units, training_focus, training_age, primary_equipment, bar_weight, diet_preference, updated_at, column_updates_at';
    // PGRST303 clock skew (2026-09-06, Sentry VOLYUME-2Q): this read runs on
    // the session-restore pull, right after sign-in, which is exactly when a
    // device clock a second or two ahead of Dublin makes PostgREST reject the
    // JWT as "issued at future". It succeeds on a retry moments later, so wait
    // it out once instead of reporting the profile pull as errored. Wrapping
    // runRead itself covers the column-tolerance fallbacks too, and only a skew
    // rejection ever retries -- a missing column still falls through to the
    // next select on its first attempt, unchanged.
    const runRead = (cols) => withClockSkewRetry(() => sb
      .from('users_profile')
      .select(cols)
      .eq('id', userId)
      .maybeSingle());
    // Column tolerance (migrate_094 sex, migrate_112 allergen_excludes):
    // try the fullest select first, then fall back column by column so the
    // profile pull is never coupled to either migration being applied.
    let { data, error } = await runRead(`${BASE_COLS}, sex, allergen_excludes`);
    if (error) ({ data, error } = await runRead(`${BASE_COLS}, sex`));
    if (error) ({ data, error } = await runRead(BASE_COLS));
    if (error) {
      logSyncError('sync.tables.profiles.pull', error);
      return { count: 0, errors: 1 };
    }
    if (!data) return { count: 0, errors: 0 };

    // Build the local row in the same snake_case shape the cloud
    // ships so conflict.resolve(merge) can compare like-for-like.
    const state = _readStore();
    const localProfile = state.userProfile ?? {};
    const localFieldUpdatedAt = state.userProfileFieldUpdatedAt ?? {};
    const localCloudShape = _profileToCloudPayload(userId, localProfile, localFieldUpdatedAt);

    // resolveConflict honours profiles.conflictStrategy=merge in
    // the registry; per-column timestamps win column-by-column.
    const { row: merged, winner } = await resolveConflict({
      table: 'profiles',
      recordId: userId,
      local: localCloudShape,
      server: data,
      userId,
    });

    // Apply the merged row back to the store. winner=='client'
    // means nothing in the cloud changed our state; we still
    // re-set to keep the column_updates_at map consistent (the
    // server's merged jsonb is the source of truth from now on).
    // Spread the existing local profile FIRST so local-only fields that have
    // no synced column (e.g. the meal-plan prefs: mealPlanExcludeFoods,
    // mealPlanMealsPerDay, mealPlanVariety, mealPlanFatConvention,
    // mealPlanPeriWorkout, ...) survive the pull. Rebuilding from only the
    // mapped columns would silently wipe them on the next sync — a real
    // data-loss bug. The synced columns then overwrite their own keys.
    const mergedProfile = {
      ...localProfile,
      firstName:        merged.first_name ?? null,
      units:            merged.units ?? 'kg',
      trainingFocus:    merged.training_focus ?? 'bodybuilding',
      trainingAgeYears: merged.training_age ?? null,
      primaryEquipment: merged.primary_equipment ?? null,
      barWeight:        merged.bar_weight ?? 20,
      dietPreference:   merged.diet_preference ?? 'omnivore',
      // sex NEVER unsets: it is onboarding-enforced and drives the ED calorie
      // floor + BMR, so a cloud row without one (pre-094, or a legacy account)
      // must not wipe the local value. Only a valid cloud value can change it.
      sex:              _validSex(merged.sex) ?? _validSex(localProfile.sex),
      // Allergens never unset on a missing column either (pre-112 cloud):
      // only a real cloud array can change the local list. An allergy
      // silently wiped by a pull would be the worst failure this field has.
      mealPlanExcludeTags: Array.isArray(merged.allergen_excludes)
        ? merged.allergen_excludes
        : (Array.isArray(localProfile.mealPlanExcludeTags) ? localProfile.mealPlanExcludeTags : []),
    };

    // Only write back when the merge actually changed something. Writing
    // unconditionally caused a merge-churn loop: setUserProfile re-stamps
    // every tracked field's userProfileFieldUpdatedAt to now(), which
    // inflated the local column_updates_at so the NEXT push looked newer,
    // re-triggering the merge, the write, the re-stamp, every sync cycle
    // (observed in prod: sync_conflict_resolved + setUserProfile on every
    // run). Comparing the six mapped fields against the current local
    // profile and skipping a no-op write breaks the loop.
    if (_profilesEqual(mergedProfile, localProfile)) {
      return { count: 0, errors: 0, ...(winner ? { winner } : {}) };
    }
    const ok = _writeStore(mergedProfile);
    return {
      count: ok ? 1 : 0,
      errors: 0,
      ...(winner ? { winner } : {}),
    };
  } catch (e) {
    logSyncError('sync.tables.profiles.pull', e);
    return { count: 0, errors: 1 };
  }
}
