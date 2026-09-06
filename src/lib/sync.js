/**
 * sync.js, cloud backup layer
 *
 * SQLite is the source of truth. Supabase is the cloud backup.
 * All functions are fire-and-forget safe: they never throw, never block UI.
 *
 * Flow:
 *   1. User signs up/in → bulkUploadLocalData() (+ registry runner)
 *   2. Workout completed → syncWorkout()
 *   (E12 step 1: the per-save syncProfile / syncWeeklyCheckin /
 *   syncBodyMetric dual writers are retired; users_profile,
 *   weekly_checkins_v2 and body_metrics are owned by the registry
 *   handlers in src/lib/sync/tables/, pushed via syncAll.)
 */

import { getSupabaseClient } from './supabase';
import { isNetworkNoise } from './observability/networkNoise';
import { CIRCUIT_SYNC_COLUMNS_ENABLED } from './sync/featureFlags';
import {
  getAllWorkouts,
  getWorkoutById,
  getWorkoutSetsForWorkout,
  getAllExercises,
  insertWorkoutFromCloud,
  insertWorkoutSetFromCloud,
  // Bulk read helpers
  getAllProgrammes,
  getAllRoutinesForUser,
  getAllRoutineExercisesForUser,
  getAllMesocyclesForUser,
  getAllMesocycleWeeksForUser,
  getAllMorningWeightsForUser,
  getAllCoachOutputsForUser,
  getAllExerciseUserNotesForUser,
  // Campaign 9 exercise-intent layer (local schema v73, cloud
  // migrate_136). Full-history readers: they include tombstones so an
  // "allow this again" reaches the user's other devices.
  getAllExerciseIntentsForUser,
  getAllExerciseSwapsForUser,
  getAllExerciseSlotDefaultsForUser,
  // Newly-syncing tables (migration 012)
  getUserBodyProfile,
  getAllUserInsightsForUser,
  getAllWorkoutNotesForUser,
  getAllExerciseGoalsForUser,
  getAllPeakWeekPlansForUser,
  getAllPlannedMuscleVolumeForUser,
  getAllAdaptationEventsForUser,
  // Cloud restore helpers
  insertRoutineFromCloud,
  insertProgrammeFromCloud,
  setPlanFolder,
  insertRoutineExerciseFromCloud,
  insertMorningWeightFromCloud,
  insertCoachOutputFromCloud,
  insertMesocycleFromCloud,
  insertMesocycleWeekFromCloud,
  cleanupOrphanRoutineExercises,
  // getAllWeeklyCheckinsForUser, getBodyMetricLog, getAllBodyMetricsForUser,
  // getNutritionTargets, insertWeeklyCheckinFromCloud,
  // insertBodyMetricFromCloud, insertNutritionTargetsFromCloud: moved to
  // src/lib/sync/tables/<table>.js per MIGRATED_TABLES.
} from './database';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getPullWatermark, setPullWatermark, nextWatermark, isoFromMs, getPushWatermark, setPushWatermark } from './sync/watermark';
import { logError, logWarn, logInfo } from './errorLog';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function msToISO(ms) {
  if (!ms) return null;
  try { return new Date(ms).toISOString(); } catch { return null; }
}

function timeToMs(value) {
  if (!value) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getClient() {
  return getSupabaseClient();
}

// PostgREST errors carry a code + hint + details that the user (and we)
// need to see. The default `e?.message` we'd been logging often comes
// back empty or as a useless one-liner, which made every silently-
// failed upsert look the same. Surface the full shape so the next
// debug log dump tells us exactly which column / constraint blew up.
// Bulk-push error tracking. bulkUploadLocalData pushes the legacy tables
// through ~13 helpers that each swallow their own PostgREST {error} via
// logPgErr so one table's failure can't abort the rest. That resilience
// also hid failures from the sign-out push-first safety: a rejected push
// (e.g. RLS 42501, column drift) left the sync status 'synced', so sign-out
// wiped local data that never reached cloud. We count PostgREST errors
// raised during the bulk-push window so bulkUploadLocalData can report them
// to the runner, which folds them into the cycle's errored_count. The flag
// scopes counting to the legacy push only: pull and single-entity on-save
// pushes call logPgErr outside this window and are not counted.
let _bulkPushTracking = false;
let _bulkPushErrorCount = 0;
// Cause of the bulk-push failures, carried out to the aggregate warnings
// (2026-09-06, Sentry VOLYUME-28 / 2C / 2J). "partial push 400 of 600" and
// "sync.push.legacy.errors" carry no network wording of their own, so the
// Sentry noise gate had to GUESS from NetInfo whether an unreachable network
// caused them -- and NetInfo reports "connected" all through a flaky cell
// handover, which is exactly the session that produced those issues. Record
// what actually failed instead: the last error message seen during the window
// (message only, never a row or an id -- PII stays out of Sentry per
// sentryScrub.js) and whether EVERY counted error matched the
// network-unreachable signature. _bulkPushAllNetwork starts true and is ANDed
// down by the first non-network failure, so it can only claim "all network"
// when that is literally true; with zero errors it is never read.
let _bulkPushLastError = null;
let _bulkPushAllNetwork = true;

// Fold one failure into the bulk-window cause summary. Message only.
function _noteBulkError(message) {
  if (!_bulkPushTracking) return;
  const text = typeof message === 'string' ? message.slice(0, 200) : String(message ?? '');
  _bulkPushLastError = text || null;
  if (!isNetworkNoise(text)) _bulkPushAllNetwork = false;
}

/**
 * The cause summary for the bulk-push window, for an aggregate warning's extra.
 *
 * Read it INSIDE the window, or immediately after it in bulkUploadLocalData's
 * own return (both current callers). Reading it later would report the previous
 * run's cause, since the fields are reset only when the next window opens.
 */
function _bulkPushCause() {
  return { lastError: _bulkPushLastError, allNetwork: _bulkPushAllNetwork };
}

function logPgErr(scope, err) {
  if (!err) return;
  if (_bulkPushTracking) _bulkPushErrorCount += 1;
  _noteBulkError(err.message || String(err));
  logWarn(scope, err.message || String(err), {
    code: err.code ?? null,
    details: err.details ?? null,
    hint: err.hint ?? null,
  });
}

function missingSchemaColumn(err, table, columns = []) {
  if (!err || err.code !== 'PGRST204') return false;
  const text = `${err.message || ''} ${err.details || ''} ${err.hint || ''}`.toLowerCase();
  if (table && !text.includes(String(table).toLowerCase())) return false;
  return columns.some((column) => text.includes(String(column).toLowerCase()));
}

// Catch-path logger for the legacy bulk-push helpers. Same signature as
// logWarn, but also counts the failure during the bulk-push window. PostgREST
// {error} results go through logPgErr (counted); a helper that THROWS while
// reading local data (e.g. a getAllX SQLite error) is swallowed by its own
// catch with logWarn and would otherwise be invisible to the sign-out
// push-first safety. Routing those catches through here surfaces them too
// (SYNC-1 re-audit). Gated on _bulkPushTracking so it's a plain warn when a
// helper runs outside bulkUploadLocalData.
function logBulkWarn(scope, message, meta) {
  if (_bulkPushTracking) _bulkPushErrorCount += 1;
  _noteBulkError(message);
  logWarn(scope, message, meta);
}

// PostgREST caps each response at 1000 rows by default. Loop with
// .range() until a short page comes back so users with large libraries
// (long-running accounts, imported templates) get every row back.
async function fetchAllRows(scope, queryBuilder) {
  const PAGE = 1000;
  let from = 0;
  const out = [];
  for (;;) {
    const { data, error } = await queryBuilder().range(from, from + PAGE - 1);
    // LS-03/H-12 (Codex audit, 2026-07-12): a transport error mid-pagination
    // means this is an INCOMPLETE view. Returning the partial rows let the
    // caller treat the pull as clean and advance its cursor past the rows that
    // never arrived - permanently skipped until a manual cursor reset or
    // sign-out. Throw so the caller holds its cursor and retries next pull.
    if (error) {
      logWarn(scope, error.message);
      throw new Error(`${scope}: paginated fetch failed at offset ${from}: ${error.message}`);
    }
    if (!data?.length) return out;
    out.push(...data);
    if (data.length < PAGE) return out;
    from += PAGE;
  }
}

// IN-list queries can hit URL length limits with thousands of IDs.
// Chunk to keep the query string well under any practical cap.
export async function fetchByIdsChunked(scope, table, column, ids, queryFactory) {
  const CHUNK = 200;
  const PAGE = 1000;
  const out = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    // Paginate WITHIN each chunk. A 200-id chunk can match far more than
    // 1000 child rows (e.g. 200 workouts each with many sets, or 200
    // routines each with several exercises), and PostgREST caps every
    // response at 1000. Without the .range() loop the surplus was
    // silently dropped, so a fresh pull could leave workouts missing
    // sets and routines missing exercises (observed in prod logs: a
    // 200-routine chunk returning exactly 1000 routine_exercises). The
    // builder is single-use once awaited, so rebuild it per page.
    let from = 0;
    for (;;) {
      const base = queryFactory
        ? queryFactory(slice)
        // F5 Phase A (C1 mitigation, forward-compat): exclude tombstoned rows
        // so Phase B's soft deletes can never resurrect through this build's
        // pulls. No tombstone exists yet, so this is a no-op today.
        : getClient().from(table).select('*').in(column, slice).is('deleted_at', null);
      const { data, error } = await base.range(from, from + PAGE - 1);
      // LS-03/H-12: a chunk/page error is an incomplete result. Breaking here
      // returned the partial aggregate as if complete, so the caller advanced
      // its cursor past child rows (e.g. workout_sets) that never arrived.
      // Throw instead so no caller advances a cursor over unseen rows.
      if (error) {
        logWarn(scope, error.message);
        throw new Error(`${scope}: chunked fetch failed: ${error.message}`);
      }
      if (!data?.length) break;
      out.push(...data);
      if (data.length < PAGE) break;
      from += PAGE;
    }
  }
  return out;
}

// ─── Profile ──────────────────────────────────────────────────────────────────
// E12 step 1: the legacy per-save syncProfile was retired; users_profile is
// pushed/pulled by the registry profiles handler (src/lib/sync/tables/
// profiles.js), which also carries the sex mirror (U2, migrate_094).

// ─── Exercises ────────────────────────────────────────────────────────────────

/**
 * Upload custom exercises (user-created ones) to Supabase.
 * Canonical exercises are seeded separately via scripts/seed-exercises.js.
 */
/**
 * Push EVERY exercise, canonical + custom, to the cloud.
 *
 * Renamed from syncCustomExercises (which only pushed is_custom=1
 * rows). Without canonical exercises in cloud, every routine_exercise
 * and workout_set ref to a canonical exercise was rejected by the FK
 * (now relaxed in migration 010) and silently fell into the cloud as
 * an orphan id with no name lookup possible. Now canonical exercises
 * round-trip with deterministic IDs (canonicalExerciseId in
 * seedExercises.js) so every device produces the same UUID for
 * "Bench Press", the natural primary key dedupes upserts across
 * sign-ins from multiple devices.
 *
 * Idempotent, onConflict: 'id' means re-running the push touches
 * existing rows' updated_at but creates no duplicates.
 */
// SQLite stores demand booleans as 0/1/NULL; cloud columns are boolean.
// NULL stays NULL (CAP-8: unknown is a real state, never coerced).
function _intToBool(v) {
  if (v === 1 || v === true) return true;
  if (v === 0 || v === false) return false;
  return null;
}

export async function syncExercises(supabaseUserId, _opts = {}) {
  const sb = getClient();
  if (!sb || !supabaseUserId) return;
  // Re-triage 2026-08-01: covered wholesale by the next good syncAll's bulk
  // push, so a dead session defers with no queue entry and no data loss.
  if (await _blockedByDeadSession('sync.syncExercises')) return;
  try {
    // Migration 020 split per-user exercise rows out of the
    // mixed-ownership `exercises` table into `custom_exercises`.
    // Library rows live in cloud `exercises` server-side with
    // user_id = NULL and must not be re-pushed -- the RLS UPDATE
    // policy USING (auth.uid() = user_id) rejects any attempt to
    // claim them (existing user_id NULL never matches the caller),
    // raising 42501 per chunk. Only customs go up now, and they
    // target custom_exercises with composite-PK conflict.
    const all = await getAllExercises();
    const customs = all.filter(e => e.isCustom);
    if (!customs.length) return;
    const rows = customs.map(e => ({
      id: e.id,
      user_id: supabaseUserId,
      name: e.name,
      primary_muscle: e.primaryMuscle,
      secondary_muscles: e.secondaryMuscles ?? [],
      equipment: e.equipment ?? null,
      movement_pattern: e.movementPattern ?? null,
      // PD-8 fix (CC27): these columns are nullable in cloud (migrate_020)
      // and NULL is a DELIBERATE value on a custom exercise - "no claimed
      // SFR/fatigue judgement". The old `?? 1` / `?? 3` fabricated a
      // middling judgement the owner never made, and it round-tripped back
      // onto the device as if real. Null pushes as null.
      fatigue_cost: e.fatigueCost ?? null,
      stimulus_to_fatigue_ratio: e.stimulusToFatigueRatio ?? null,
      compound_isolation: e.compoundIsolation ?? null,
      default_rep_min: e.defaultRepMin ?? null,
      default_rep_max: e.defaultRepMax ?? null,
      exercise_category: e.exerciseCategory ?? 'compound',
      increment_kg: e.incrementKg ?? 2.5,
      subregion: e.subregion ?? null,
      notes: e.notes ?? null,
      exercise_type: e.exerciseType ?? 'weight_reps', // migrate_091; mirrors
      // insertOrUpdateExerciseFromCloud's read-side default so a custom
      // exercise's type round-trips through sign-out/sign-in.
      // D107-2: column added by migrate_143, founder-gated. Until it runs
      // the upsert batch fails soft with a logged PostgREST error (the
      // migrate_142/migrate_137 tolerated mode) - device data is safe and
      // the next sync after the migration lands it.
      load_semantics: e.loadSemantics ?? 'total',
      // CC27 demand ontology: columns added by migrate_148, founder-gated,
      // same tolerated mode as load_semantics above. A custom exercise's
      // owner-answered axes round-trip; unanswered axes stay NULL (CAP-8).
      position: e.position ?? null,
      floor_access: _intToBool(e.floorAccess),
      overhead_position: _intToBool(e.overheadPosition),
      grip_demand: e.gripDemand ?? null,
      unilateral_loadable: _intToBool(e.unilateralLoadable),
      bilateral_upper: _intToBool(e.bilateralUpper),
      bilateral_lower: _intToBool(e.bilateralLower),
      axial_load: _intToBool(e.axialLoad),
      impact: _intToBool(e.impact),
      balance_demand: e.balanceDemand ?? null,
      weight_bearing_hands: _intToBool(e.weightBearingHands),
      updated_at: new Date(e.updatedAt ?? e.createdAt ?? Date.now()).toISOString(), // F5 Phase A: honest edit time
    }));
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await sb.from('custom_exercises').upsert(
        rows.slice(i, i + 200), { onConflict: 'user_id,id', ignoreDuplicates: false },
      );
      if (error) logPgErr('sync.syncExercises', error);
    }
  } catch (e) {
    logWarn('sync.syncExercises', e?.message);
  }
}

// Back-compat alias for any code still calling the old name. New
// code should call syncExercises() directly.
export const syncCustomExercises = syncExercises;

// ─── Single workout ───────────────────────────────────────────────────────────

/**
 * Push one completed workout + its sets to Supabase.
 * Call this immediately after updateWorkout({ isCompleted: true }).
 */
export async function syncWorkout(supabaseUserId, workoutId, { rethrow = false } = {}) {
  const sb = getClient();
  if (!sb || !supabaseUserId || !workoutId) return;
  // Re-triage 2026-08-01: push-on-save can fire from a background notification
  // action with an expired token. Firing anyway is a guaranteed 42501 plus a
  // wasted queue retry later. Defer straight to the queue instead - identical
  // data outcome to the failure path, zero doomed network calls, zero noise.
  if (await _blockedByDeadSession('sync.syncWorkout')) {
    if (rethrow) throw new Error('deferred: no usable session'); // queue owns retry accounting (F-003)
    try {
      // eslint-disable-next-line global-require
      const { enqueueSyncOp } = require('./syncQueue');
      await enqueueSyncOp('workout', workoutId, supabaseUserId);
    } catch (_) { /* enqueue itself failed, nothing more we can do */ }
    return;
  }
  try {
    const w = await getWorkoutById(workoutId);
    if (!w) return;
    await _upsertWorkout(sb, supabaseUserId, w);
    const sets = await getWorkoutSetsForWorkout(workoutId);
    await _upsertSets(sb, supabaseUserId, sets);
  } catch (e) {
    logWarn('sync.syncWorkout', e?.message, { workoutId });
    // When the queue drains this op (rethrow), THROW so the queue owns retry /
    // backoff / last_error. Re-enqueuing from inside a drain made a failed write
    // look drained and reset the retry counter (audit F-003).
    if (rethrow) throw e;
    // Direct caller: enqueue for retry on next foreground / connection return.
    // Without this, a dropped sync was silent data loss until the
    // user's next sign-in cycle triggered bulkUploadLocalData.
    try {
      // eslint-disable-next-line global-require
      const { enqueueSyncOp } = require('./syncQueue');
      await enqueueSyncOp('workout', workoutId, supabaseUserId);
    } catch (_) { /* enqueue itself failed, nothing more we can do */ }
  }
}

/**
 * Remove a deleted workout (and its sets) from the cloud so a later restore
 * pull cannot resurrect it. Local rows are already gone
 * (database.deleteWorkoutAndSets); this is the cloud half. Returns true on
 * success; on failure the caller enqueues a 'workout_delete' op so the
 * drainer retries with backoff. Sets go first so a mid-way failure leaves a
 * set-less workout shell, never orphaned cloud sets.
 *
 * Multi-device note: this used to HARD delete both rows, which made the
 * deletion invisible to every other device - a pull only ever selects live
 * rows, so device B never learned the session was gone, kept its stale local
 * copy, and re-uploaded it on its next bulkUploadLocalData cycle,
 * RESURRECTING a session the athlete had deliberately deleted (release-gate
 * blocker). The workout row is now TOMBSTONED instead (deleted_at set, the
 * column migrate_012 added to both cloud tables for exactly this purpose),
 * so the delete is durable cross-device truth that a delta pull can carry.
 *
 * Sets are still hard-deleted: the workout tombstone alone is sufficient to
 * suppress them (pullFromCloud only fetches sets for workouts it pulled, and
 * applying a workout tombstone removes the local workout AND its sets), so
 * tombstoning every child row would be redundant write amplification with no
 * extra convergence. Sets go first so a mid-way failure leaves a set-less
 * workout shell, never orphaned cloud sets.
 */
export async function deleteWorkoutFromCloud(supabaseUserId, workoutId) {
  const sb = getClient();
  if (!sb || !supabaseUserId || !workoutId) return false;
  // Re-triage 2026-08-01: false is this function's existing "failed, please
  // enqueue" signal - returning it early on a dead session reuses the caller's
  // 'workout_delete' retry path without firing the doomed request first.
  if (await _blockedByDeadSession('sync.deleteWorkoutFromCloud')) return false;
  try {
    const { error: setsErr } = await sb.from('workout_sets')
      .delete().eq('user_id', supabaseUserId).eq('workout_id', workoutId);
    if (setsErr) { logPgErr('sync.deleteWorkoutFromCloud.sets', setsErr); return false; }
    // Tombstone, not delete. updated_at is bumped alongside deleted_at so the
    // watermark delta pull (which filters on updated_at) actually re-includes
    // the row on every other device rather than skipping it as unchanged.
    const nowIso = new Date().toISOString();
    const { error: wErr } = await sb.from('workouts')
      .update({ deleted_at: nowIso, updated_at: nowIso })
      .eq('user_id', supabaseUserId).eq('id', workoutId);
    if (wErr) { logPgErr('sync.deleteWorkoutFromCloud.workout', wErr); return false; }
    return true;
  } catch (e) {
    // C6 S-5 (D97-23): rethrow so the caller sees the REAL failure shape.
    // The queue's retry scheduler needs the message to tell offline (never
    // spends the budget) from a definitive refusal (does); both screen
    // callers .catch(() => enqueue) so their behaviour is unchanged.
    logWarn('sync.deleteWorkoutFromCloud', e?.message, { workoutId });
    throw e;
  }
}

/**
 * Remove a single hard-deleted set from the cloud so a later restore pull
 * cannot resurrect it. The local row is already gone (database.deleteWorkoutSet);
 * this is the cloud half. Returns true on success; on failure the caller
 * enqueues a 'workout_set_delete' op so the drainer retries with backoff.
 * Scoped to the owning user. Mirrors deleteWorkoutFromCloud for one set.
 */
export async function deleteWorkoutSetFromCloud(supabaseUserId, setId) {
  const sb = getClient();
  if (!sb || !supabaseUserId || !setId) return false;
  try {
    const { error } = await sb.from('workout_sets')
      .delete().eq('user_id', supabaseUserId).eq('id', setId);
    if (error) { logPgErr('sync.deleteWorkoutSetFromCloud', error); return false; }
    return true;
  } catch (e) {
    // C6 S-5 (D97-23): rethrow - see deleteWorkoutFromCloud's note.
    logWarn('sync.deleteWorkoutSetFromCloud', e?.message, { setId });
    throw e;
  }
}

async function _upsertWorkout(sb, supabaseUserId, w) {
  // Columns: every user-entered + computed field on a workout row.
  // The previous payload omitted name / pre_workout_intent /
  // joint_discomfort / set_count / total_volume / mesocycle_week_id
  //, the cloud columns existed (migrate_012) but the push never
  // wrote them, so on cross-device restore the session card showed
  // a generic "Workout" without the user's chosen name and the
  // analytics paths missed the cached tonnage.
  const payload = {
    id: w.id,
    user_id: supabaseUserId,
    routine_id: w.routineId ?? null,
    mesocycle_id: w.mesocycleId ?? null,
    mesocycle_week_id: w.mesocycleWeekId ?? null,
    started_at: msToISO(w.startedAt),
    ended_at: msToISO(w.endedAt),
    duration_minutes: w.durationMinutes ?? null,
    notes: w.notes ?? null,
    name: w.name ?? null,
    pre_workout_intent: w.preWorkoutIntent ?? null,
    session_difficulty: w.sessionDifficulty ?? null,
    overall_pump: w.overallPump ?? null,
    soreness_24h_before: w.soreness24hBefore ?? null,
    fatigue_level: w.fatigueLevel ?? null,
    joint_discomfort: w.jointDiscomfort ?? null,
    // COMP-008 pre-workout readiness, kept column-symmetric with
    // insertWorkoutFromCloud in database.js.
    sleep_quality: w.sleepQuality ?? null,
    energy_score: w.energyScore ?? null,
    set_count: w.setCount ?? null,
    total_volume: w.totalVolume ?? null,
    is_completed: true,
    synced_at: new Date().toISOString(),
    // F5 Phase A (SD-3): carry the REAL local edit time. Re-stamping to now
    // on every bulk cycle re-widened every other device's delta pull and let
    // a stale full-push overwrite newer edits under last-write-wins.
    updated_at: new Date(w.updatedAt ?? Date.now()).toISOString(),
  };
  let { error } = await sb.from('workouts').upsert(payload, { onConflict: 'user_id,id' });
  if (missingSchemaColumn(error, 'workouts', ['energy_score', 'sleep_quality'])) {
    const retryPayload = { ...payload };
    delete retryPayload.energy_score;
    delete retryPayload.sleep_quality;
    const retry = await sb.from('workouts').upsert(retryPayload, { onConflict: 'user_id,id' });
    if (!retry.error) {
      logInfo('sync._upsertWorkout', 'workouts readiness columns missing in cloud schema; pushed workout without optional readiness fields', {
        workoutId: w.id,
        code: error.code,
      });
      return;
    }
    error = retry.error;
  }
  if (error) {
    logPgErr('sync._upsertWorkout', error);
    throw error;
  }
}

async function _upsertSets(sb, supabaseUserId, sets) {
  if (!sets?.length) return;
  const rows = sets.map(s => ({
    id: s.id,
    user_id: supabaseUserId,
    workout_id: s.workoutId,
    exercise_id: s.exerciseId,
    // Denormalised exercise name, restores correctly on a new
    // device even when the cloud exercise_id doesn't resolve locally
    // (e.g. data pushed before deterministic canonical IDs landed).
    exercise_name: s.exerciseName ?? null,
    set_number: s.setNumber ?? 1,
    set_type: s.setType ?? 'straight',
    target_reps_min: s.targetRepsMin ?? null,
    target_reps_max: s.targetRepsMax ?? null,
    actual_reps: s.actualReps ?? 0,
    weight: s.weight ?? null,
    rir: s.rir ?? null,
    rpe: s.rpe ?? null,
    failed: s.failed === 1,
    notes: s.notes ?? null,
    post_set_pump: s.postSetPump ?? null,
    post_set_muscle_connection: s.postSetMuscleConnection ?? null,
    joint_discomfort: s.jointDiscomfort ?? null,
    is_amrap: s.isAmrap === 1,
    amrap_reps: s.amrapReps ?? null,
    missed_reps: s.missedReps ?? null,
    // Per-side reps for unilateral sets (migration 054). null on every
    // bilateral set. actual_reps already holds the lower side.
    left_reps: s.leftReps ?? null,
    right_reps: s.rightReps ?? null,
    // EL-7 evidence class (docs/exercise-library-expansion-2026-09-05/
    // 05-DECISIONS.md). Cloud counterpart migrate_159 is written but NOT
    // applied, so this is OMITTED from the payload entirely while
    // CIRCUIT_SYNC_COLUMNS_ENABLED is false - an unknown column fails the
    // whole upsert chunk.
    ...(CIRCUIT_SYNC_COLUMNS_ENABLED ? { evidence_class: s.evidenceClass ?? null } : {}),
    // PD-6 (bundle 2 prelude): carry the set's TRUE creation time to the
    // cloud. Without this the cloud column held its first-push NOW()
    // default, so a restore could only ever guess. Forward-only: rows
    // whose original stamp never reached the cloud stay as they are.
    created_at: new Date(s.createdAt ?? s.updatedAt ?? Date.now()).toISOString(),
    updated_at: new Date(s.updatedAt ?? Date.now()).toISOString(), // F5 Phase A: honest edit time
  }));
  // Chunk to avoid hitting Supabase row limits
  let chunkFailures = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { error } = await sb.from('workout_sets').upsert(chunk, { onConflict: 'user_id,id' });
    if (error) {
      logPgErr('sync._upsertSets', error);
      chunkFailures++;
      // Continue attempting the remaining chunks rather than aborting all
      // remaining work, but record the failure so it is not swallowed.
    }
  }
  // LS-02/H-11 (Codex audit, 2026-07-12): throw AFTER attempting every chunk so
  // the caller's per-workout catch counts this workout as failed. The previous
  // silent return let `failures` stay 0, so the caller advanced the workout
  // push watermark past a workout whose sets never landed - the next
  // watermark-filtered sync then skipped that older workout forever and the
  // missing sets were lost. A throw here holds the watermark so it retries.
  if (chunkFailures > 0) {
    throw new Error(`sync._upsertSets: ${chunkFailures} workout_sets chunk(s) failed to upsert`);
  }
}

// ─── Body metrics ─────────────────────────────────────────────────────────────

/**
 * Sync a single body metric entry after it's logged locally.
 */
/**
 * Push a single morning weight entry to cloud immediately after it's
 * logged locally. Without this, weights live local-only until the
 * next sign-in catch-up, a sign-out between writes loses them.
 * Failures enqueue to the retry queue.
 */
// ─── Debounced full sync trigger ─────────────────────────────────────────
//
// Most write functions in database.js (createRoutine, addExerciseToRoutine,
// saveExerciseGoal, saveNutritionTargets, etc.) don't have a per-entity
// sync helper, and adding one per table would multiply maintenance.
// Instead, every mutating database write calls scheduleSync(), a
// debounced (2s) full bulkUploadLocalData. Bursty edits coalesce into
// one push.
//
// Reads the supabase user id from the store at fire time so the caller
// doesn't have to thread it through. No-op when there's no cloud
// session.

let _syncDebounceTimer = null;
const _SYNC_DEBOUNCE_MS = 2_000;

export function scheduleSync() {
  // No-op under Jest. Most database write paths call scheduleSync(),
  // so every test that touches the DB would otherwise leave a 2s
  // timer pending and trigger Jest's "open handles / worker did not
  // exit gracefully" warning, plus a late require of useAppStore
  // after the module registry has been torn down. Production code
  // paths are unaffected: JEST_WORKER_ID is only set inside Jest
  // workers. Tests that need to assert sync behaviour should call
  // bulkUploadLocalData / pullFromCloud directly.
  if (typeof process !== 'undefined' && process.env && process.env.JEST_WORKER_ID) {
    return;
  }
  if (_syncDebounceTimer) clearTimeout(_syncDebounceTimer);
  _syncDebounceTimer = setTimeout(() => {
    _syncDebounceTimer = null;
    try {
      // eslint-disable-next-line global-require
      const useAppStore = require('../store/useAppStore').default;
      const state = useAppStore.getState();
      const supabaseUserId = state.session?.user?.id;
      const localUserId = state.user?.id;
      if (!supabaseUserId || !localUserId) return;
      // AC-02 (Codex audit, 2026-07-12): route the debounced-on-write trigger
      // through syncAll, not bulkUploadLocalData directly, so it passes the
      // runner's Article 9 health-consent + sign-out-wipe gate. Per
      // SYNC_ARCHITECTURE_LOCKED.md all four triggers go through syncAll; a
      // direct bulk push here uploaded health data with no consent check.
      // eslint-disable-next-line global-require
      const { syncAll } = require('./sync/runner');
      syncAll({ userId: supabaseUserId, localUserId, triggeredBy: 'write' }).catch(() => {});
    } catch (_) { /* store not available, tolerate */ }
  }, _SYNC_DEBOUNCE_MS);
}

/**
 * Cancel any pending debounced sync. Used by sign-out flows so a
 * scheduled push doesn't fire after the user has cleared their
 * session and re-keyed local rows.
 */
export function cancelScheduledSync() {
  if (_syncDebounceTimer) {
    clearTimeout(_syncDebounceTimer);
    _syncDebounceTimer = null;
  }
}

export async function syncMorningWeight(supabaseUserId, entry, { rethrow = false } = {}) {
  const sb = getClient();
  if (!sb || !supabaseUserId || !entry) return;
  // Re-triage 2026-08-01: same defer-to-queue contract as syncWorkout above.
  if (await _blockedByDeadSession('sync.syncMorningWeight')) {
    if (rethrow) throw new Error('deferred: no usable session'); // F-003
    try {
      // eslint-disable-next-line global-require
      const { enqueueSyncOp } = require('./syncQueue');
      await enqueueSyncOp('morning_weight', entry?.id ?? `mw-${Date.now()}`, supabaseUserId, entry);
    } catch (_) {}
    return;
  }
  try {
    const { error } = await sb.from('morning_weights').upsert({
      id: entry.id,
      user_id: supabaseUserId,
      weight_kg: entry.weightKg,
      logged_at: msToISO(entry.loggedAt),
      notes: entry.notes ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,id' });
    if (error) { logPgErr('sync.syncMorningWeight', error); throw error; }
  } catch (e) {
    logWarn('sync.syncMorningWeight', e?.message, { id: entry?.id });
    if (rethrow) throw e; // queue-driven: let the queue own retry accounting (F-003)
    try {
      // eslint-disable-next-line global-require
      const { enqueueSyncOp } = require('./syncQueue');
      await enqueueSyncOp('morning_weight', entry?.id ?? `mw-${Date.now()}`, supabaseUserId, entry);
    } catch (_) {}
  }
}

// E12 step 1: the legacy per-save syncWeeklyCheckin and syncBodyMetric were
// retired; weekly_checkins_v2 and body_metrics are owned by the registry
// handlers (weeklyCheckins.js, bodyComposition.js) and pushed via syncAll.
// Residual queued 'check_in' / 'body_metric' ops drain through the
// syncQueue bulk fallback.

// ─── Bulk upload ──────────────────────────────────────────────────────────────

/**
 * First-time upload: push all local completed workouts to Supabase.
 * Called once after the user creates a cloud account or signs in for the first time.
 * Runs in the background, never blocks UI.
 */

// The one place a doomed cloud round trip is stopped.
//
// The first version of this guard lived in syncAll (sync/runner.js) only, and
// FOUR screens call bulkUploadLocalData / pullFromCloud directly -- ImportScreen,
// HomeScreen's session restore, and ProUpgradeScreen twice -- so they bypassed
// it completely. `sync.push.legacy` was the top error on build 48 for exactly
// that reason. Guarding one caller instead of the choke point is the same
// mistake as five different answers to "which week am I in": put it where it
// cannot be routed around.
//
// Fails OPEN by design, matching the runner: only an explicit `false` (the
// session was checked and there is no usable token) blocks. Unavailable, threw,
// or undetermined all proceed exactly as before, so a check that cannot answer
// can never switch sync off for everyone.
async function _blockedByDeadSession(scope) {
  try {
    // eslint-disable-next-line global-require
    const live = await require('./supabase').hasLiveSession();
    if (live === false) {
      // Deliberately logInfo, not logError: this is the guard doing its job and
      // leaving the work queued, not a failure. Logging it loudly would rebuild
      // the noise the whole triage existed to remove.
      try { require('./errorLog').logInfo(scope, 'no usable session, deferring sync'); } catch (_) {}
      return true;
    }
  } catch (_) { /* undetermined: fail open */ }
  return false;
}

export async function bulkUploadLocalData(supabaseUserId, localUserId) {
  const sb = getClient();
  if (!sb || !supabaseUserId || !localUserId) return { errors: 0 };
  if (await _blockedByDeadSession('sync.bulkUploadLocalData')) return { errors: 0, skipped: 'no_live_session' };

  _bulkPushTracking = true;
  _bulkPushErrorCount = 0;
  _bulkPushLastError = null;
  _bulkPushAllNetwork = true;
  let threw = false;
  try {
    // Every exercise, canonical + custom, pushed first so all the
    // downstream FK references (routine_exercises, workout_sets) land
    // on cloud rows that exist. Previously only is_custom=1 rows were
    // pushed, which is what left routine_exercises pointing at
    // unresolvable canonical UUIDs and broke cross-device restore.
    await syncExercises(supabaseUserId);

    const allWorkouts = await getAllWorkouts(localUserId);
    const completedAll = allWorkouts.filter(w => w.isCompleted);

    // LB-5: skip re-pushing completed workouts we've already uploaded.
    // A completed workout is immutable (no edit path re-opens it; its
    // updated_at is stamped at completion and is >= every set's
    // updated_at), so once a workout+sets has pushed cleanly it never
    // needs pushing again. The watermark is the highest completion time
    // already on cloud; we re-include the boundary (>=) so an upsert at
    // the exact cursor is idempotently repeated rather than dropped.
    // First sign-in (or post-sign-out, cleared AsyncStorage) has no
    // watermark and pushes everything.
    const workoutsWm = await getPushWatermark(supabaseUserId, 'workouts');
    const completed = workoutsWm > 0
      ? completedAll.filter(w => timeToMs(w.updatedAt) >= workoutsWm)
      : completedAll;
    let maxPushedMs = workoutsWm;

    // Upload in batches of 10 to avoid hammering the API
    let failures = 0;
    for (let i = 0; i < completed.length; i += 10) {
      const batch = completed.slice(i, i + 10);
      await Promise.all(
        batch.map(async w => {
          try {
            await _upsertWorkout(sb, supabaseUserId, w);
            const sets = await getWorkoutSetsForWorkout(w.id);
            await _upsertSets(sb, supabaseUserId, sets);
            const wMs = timeToMs(w.updatedAt);
            if (wMs > maxPushedMs) maxPushedMs = wMs;
          } catch (e) {
            failures++;
            // Per-workout failure doesn't abort the batch but it is logged
            // so the user can spot patterns in the Debug logs surface
            // (e.g. "every workout from 2024-12 fails, schema mismatch").
            // logBulkWarn (not logWarn) so a THROWN failure here — a local
            // sets-read error, or an upsert that threw rather than returning
            // {error} — is counted for the sign-out push-first safety, same as
            // the _pushX helpers. An {error} was already counted via logPgErr
            // inside _upsertWorkout/_upsertSets; the resulting double-count is
            // harmless (errors > 0 is the only thing that matters). (SYNC-1)
            logBulkWarn('sync.bulkUploadLocalData', 'workout upload failed', {
              workoutId: w?.id,
              supabaseUserId,
              error: e?.message,
              // Cause summary read AFTER logBulkWarn has folded this failure in
              // is what we want, but the meta is built first, so state this
              // one's own network verdict directly and let lastError carry the
              // window's running message.
              lastError: typeof e?.message === 'string' ? e.message.slice(0, 200) : null,
              allNetwork: isNetworkNoise(e?.message) && _bulkPushAllNetwork,
            });
          }
        })
      );
      // Brief yield to avoid blocking the JS thread
      await new Promise(r => setTimeout(r, 50));
    }
    if (failures > 0) {
      logWarn('sync.bulkUploadLocalData', `${failures} of ${completed.length} workouts failed to upload`, { supabaseUserId });
    } else if (maxPushedMs > workoutsWm) {
      // Advance only on a clean workout push: a failure leaves the
      // watermark where it was so the failed rows retry next cycle and
      // the sign-out push-first safety still sees them as un-pushed.
      await setPushWatermark(supabaseUserId, 'workouts', maxPushedMs);
    }

    // body_composition_log (cloud table body_metrics) moved to
    // src/lib/sync/transport.js (registry-driven per-table push).
    // See MIGRATED_TABLES.

    // ─── New Pro-state tables ─────────────────────────────────────────────
    // Each block is independently fault-tolerant: failures on one table
    // log + carry on. None of these are needed for free-tier UX so they
    // can degrade gracefully on a partial cloud schema.

    await _pushProgrammes(sb, supabaseUserId, localUserId);
    await _pushRoutinesAndExercises(sb, supabaseUserId, localUserId);
    await _pushMesocycles(sb, supabaseUserId, localUserId);
    await _pushSessionResolutions(sb, supabaseUserId, localUserId);
    await _pushMorningWeights(sb, supabaseUserId, localUserId);
    // weekly_checkins_v2 moved to src/lib/sync/transport.js
    // (registry-driven per-table push). See MIGRATED_TABLES.
    await _pushCoachOutputs(sb, supabaseUserId, localUserId);
    // nutrition_targets moved to src/lib/sync/transport.js
    // (registry-driven per-table push). See MIGRATED_TABLES.
    // The public syncNutritionTargets on-save shim above now also
    // routes through transport so both call sites share the code.
    // Tables that previously stayed local-only. Each is safe to call
    // for free-tier users, they return zero rows and the helper
    // exits cleanly. No new dependencies between them.
    await _pushUserBodyProfile(sb, supabaseUserId, localUserId);
    await _pushUserInsights(sb, supabaseUserId, localUserId);
    await _pushExerciseUserNotes(sb, supabaseUserId, localUserId);
    // Campaign 9 exercise-intent layer. Free-tier safe: a user who has
    // never excluded or swapped anything has zero rows and each helper
    // returns immediately.
    await _pushExerciseIntent(sb, supabaseUserId, localUserId);
    await _pushExerciseSwaps(sb, supabaseUserId, localUserId);
    await _pushExerciseSlotDefaults(sb, supabaseUserId, localUserId);
    // Campaign 17A food-intent layer, the same posture as the exercise one.
    await _pushFoodSwaps(sb, supabaseUserId, localUserId);
    await _pushWorkoutNotes(sb, supabaseUserId, localUserId);
    await _pushExerciseGoals(sb, supabaseUserId, localUserId);
    await _pushPeakWeekPlans(sb, supabaseUserId, localUserId);
    await _pushPlannedMuscleVolume(sb, supabaseUserId, localUserId);
    await _pushAdaptationEvents(sb, supabaseUserId, localUserId);
    // Food-domain push (food_entries, custom_foods, saved_meals,
    // recipes, food_favourites, daily_water) moved to
    // src/lib/sync/tables/foodDomain.js, a coordinator that
    // drives the food_sync_push RPC once per syncAll and reports
    // per-table counts back via transport.pushTable.
    // AsyncStorage prefs (units, accessibility, wellbeing, etc.).
    // Pushed AFTER the structured tables so a sign-in catch-up
    // doesn't block on the larger writes.
    await _pushAllUserPrefs(sb, supabaseUserId);
    // notification_preferences moved to src/lib/sync/transport.js
    // (registry-driven per-table push). MIGRATED_TABLES in
    // transport.js is the source of truth for what no longer flows
    // through here.

    logInfo('sync.bulkUpload', 'bulk upload complete');
  } catch (e) {
    threw = true;
    logError('sync.bulkUploadLocalData', e, { supabaseUserId, localUserId });
  } finally {
    _bulkPushTracking = false;
  }
  // Report failures so the runner can fold them into errored_count and the
  // sign-out push-first safety can refuse to wipe local data on a bad push.
  // lastError/allNetwork are the CAUSE summary and are read only by the
  // runner's aggregate breadcrumb (sync.push.legacy.errors); nothing branches
  // on them, so the push contract itself is unchanged.
  const errors = _bulkPushErrorCount + (threw ? 1 : 0);
  return { errors, ..._bulkPushCause() };
}

// ─── Per-table push helpers ───────────────────────────────────────────────

async function _pushProgrammes(sb, supabaseUserId, localUserId) {
  try {
    const programmes = await getAllProgrammes(localUserId);
    if (!programmes?.length) return;
    const rows = programmes.map(p => ({
      id: p.id, user_id: supabaseUserId,
      name: p.name, description: p.description ?? null,
      is_library: !!p.isLibrary, is_active: !!p.isActive,
      // C6 P44-03 (D97): the archived flag finally travels. The cloud
      // column has existed since migrate_012; it was simply never pushed
      // or pulled, so a reinstall resurrected every plan the user ever
      // archived (eight wizard re-runs = eight "My plans" rows).
      is_archived: !!p.isArchived,
      source_programme_id: p.sourceProgrammeId ?? null,
      // folder_id (plan_folders, migration 089): carry the plan's folder so the
      // My Plans organisation survives a device change. Nullable; an unfiled
      // plan ships NULL.
      folder_id: p.folderId ?? null,
      // F5 Phase A (SD-3): the 2s-debounced full re-push used to re-stamp
      // every programme to now each cycle - the audit's exemplar of the bug.
      updated_at: new Date(p.updatedAt ?? p.createdAt ?? Date.now()).toISOString(),
    }));
    const { error } = await sb.from('programmes').upsert(rows, { onConflict: 'user_id,id' });
    if (error) logPgErr('sync._pushProgrammes', error);
  } catch (e) { logBulkWarn('sync._pushProgrammes', e?.message, { error: e?.message }); }
}

async function _pushRoutinesAndExercises(sb, supabaseUserId, localUserId) {
  try {
    // Clear orphan routine_exercises (parent routine row missing) just
    // before computing the push set. Boot-time cleanup only catches
    // orphans that exist at app start; any created mid-session (e.g.
    // routine hard-deleted during a cloud restore) leak through and
    // log "orphan routine_exercises skipped" on every push cycle until
    // the next boot. Running the cleanup here makes the warning fire
    // at most once per genuine state-drift event, not every 5 minutes.
    await cleanupOrphanRoutineExercises().catch(() => {});
    // Track which routine ids actually landed in cloud this cycle: a
    // routine whose own upsert fails must not let its child
    // routine_exercises through the orphan filter below, or their FK
    // check (routines.id = routine_exercises.routine_id) fails RLS
    // against a parent that isn't there (Sentry VOLYUME-1A).
    const succeededRoutineIds = new Set();
    const routines = await getAllRoutinesForUser(localUserId);
    if (routines?.length) {
      // programme_id, day_of_week, is_sample, is_library, source_routine_id
      // are added to the cloud routines table in migrate_010. They were
      // local-only before, which is why a fresh-device sign-in restored
      // 114 routines but lost the link back to the active plan, every
      // routine came back with programme_id = null and the plan-detail
      // screen showed "0 workouts".
      const rows = routines.map(r => ({
        id: r.id, user_id: supabaseUserId,
        name: r.name, description: r.description ?? null,
        split_type: r.splitType ?? null,
        is_active: r.isActive == null ? true : !!r.isActive,
        programme_id: r.programmeId ?? null,
        day_of_week: r.dayOfWeek ?? null,
        is_sample: !!r.isSample,
        is_library: !!r.isLibrary,
        source_routine_id: r.sourceRoutineId ?? null,
        // Day-level plan reorder (migrate_113, founder-run). Column
        // tolerance below (drop position and retry) keeps every other
        // field syncing on installs that haven't had the migration applied
        // yet, matching migrate_094/migrate_112's OPTIONAL_COLUMNS pattern.
        position: r.position ?? null,
        updated_at: new Date(r.updatedAt ?? r.createdAt ?? Date.now()).toISOString(), // F5 Phase A: honest edit time
      }));
      // Chunk so a single row's RLS rejection doesn't take the whole
      // library down, and so the payload stays small.
      let rPushed = 0;
      for (let i = 0; i < rows.length; i += 200) {
        const slice = rows.slice(i, i + 200);
        let { error: rErr } = await sb.from('routines').upsert(slice, { onConflict: 'user_id,id' });
        if (rErr && /position/i.test(String(rErr?.message))) {
          // migrate_113 not applied on this environment yet: drop the new
          // column and retry so the rest of the row keeps syncing.
          const withoutPosition = slice.map(({ position: _pos, ...rest }) => rest);
          ({ error: rErr } = await sb.from('routines').upsert(withoutPosition, { onConflict: 'user_id,id' }));
        }
        if (rErr) {
          logPgErr('sync._pushRoutines', rErr);
        } else {
          rPushed += slice.length;
          for (const row of slice) succeededRoutineIds.add(row.id);
        }
      }
      if (rPushed < rows.length) {
        logWarn('sync._pushRoutines', 'partial push', {
          pushed: rPushed, total: rows.length, ..._bulkPushCause(),
        });
      }
    }
    const routineExs = await getAllRoutineExercisesForUser(localUserId);
    if (routineExs?.length) {
      // starting_weight, rest_seconds, superset_group_id are also added
      // by migrate_010, they govern the pre-filled weight, the rest
      // timer default, and superset pairing. Without them, every restore
      // dropped users back to the global default rest timer.
      //
      // exercise_name is the denormalised display name added by
      // migrate_012, it's what makes a routine recoverable on a new
      // device even if the exercise_id can't resolve locally.
      //
      // Filter: drop routine_exercises whose routine_id doesn't appear
      // among the routines that ACTUALLY succeeded this cycle (not just
      // every local routine). Cloud RLS on routine_exercises checks
      // EXISTS (SELECT 1 FROM routines WHERE id = routine_id AND
      // user_id = auth.uid()); an orphan routine_id (left over from a
      // soft-deleted routine, a partial local sync state, or -- the bug
      // this used to miss -- a routine whose own upsert failed this very
      // cycle) fails that check and rejects the entire 200-row chunk.
      // Excluding orphans keeps the rest of the batch alive.
      const pushableRoutineIds = succeededRoutineIds;
      const rows = routineExs
        .filter(re => pushableRoutineIds.has(re.routineId))
        .map(re => ({
          // Send user_id explicitly (composite PK is (user_id, id)) rather
          // than relying on the migrate_018 inheritance trigger, matching the
          // sibling routines/mesocycles pushes (audit A2).
          id: re.id, user_id: supabaseUserId,
          routine_id: re.routineId, exercise_id: re.exerciseId,
          exercise_name: re.exerciseName ?? null,
          order_in_routine: re.orderInRoutine ?? 0,
          recommended_sets: re.recommendedSets ?? 3,
          recommended_reps_min: re.recommendedRepsMin ?? 6,
          recommended_reps_max: re.recommendedRepsMax ?? 12,
          notes: re.notes ?? null,
          starting_weight: re.startingWeight ?? null,
          rest_seconds: re.restSeconds ?? null,
          superset_group_id: re.supersetGroupId ?? null,
          // Campaign 16 job 10 provenance. Optional until migrate_139 is
          // applied; the retry below removes only this field so the rest of
          // the routine still syncs on an older cloud schema.
          selection_reason: re.selectionReason ?? null,
          // EL-9 circuit columns (docs/exercise-library-expansion-2026-09-05/
          // 05-DECISIONS.md). Cloud counterpart migrate_158 is written but
          // NOT applied, so these are OMITTED from the payload entirely
          // while CIRCUIT_SYNC_COLUMNS_ENABLED is false - an unknown column
          // fails the whole upsert chunk, not just this field, so a retry-
          // on-error strip (like selection_reason below) is not safe here.
          ...(CIRCUIT_SYNC_COLUMNS_ENABLED ? {
            group_kind: re.groupKind ?? null,
            round_rest_seconds: re.roundRestSeconds ?? null,
          } : {}),
          // F5 Phase A: previously pushed with NO updated_at, so the cloud
          // value never moved on upsert and delta pulls could not see edits.
          updated_at: new Date(re.updatedAt ?? re.createdAt ?? Date.now()).toISOString(),
          // Tombstone: soft-deleted routine_exercises MUST carry deleted_at to
          // cloud, otherwise the cloud row stays alive and the next pull
          // resurrects a locally-removed exercise. getAllRoutineExercisesForUser
          // intentionally includes deleted rows so this push propagates them.
          deleted_at: re.deletedAt ? new Date(re.deletedAt).toISOString() : null,
        }));
      const orphanCount = routineExs.length - rows.length;
      if (orphanCount > 0) {
        // cleanupOrphanRoutineExercises() above already deletes children whose
        // parent routine is gone, so any orphan reaching here has a parent that
        // exists locally but was filtered out of the pushable set (inactive /
        // library). That is expected, not a fault, and the count is diagnostic
        // only — a warning-level Sentry event per push cycle was quota noise
        // (audit S-009, Sentry VOLYUME-8). logInfo keeps it in the breadcrumb
        // trail so it still enriches any later sync error, without a standalone
        // event. If orphanCount is ever seen to be non-trivial, revisit the
        // parent/child selection rather than re-promoting the log.
        logInfo('sync._pushRoutinesAndExercises', 'orphan routine_exercises skipped', { orphanCount });
      }
      for (let i = 0; i < rows.length; i += 200) {
        const slice = rows.slice(i, i + 200);
        let { error: reErr } = await sb.from('routine_exercises').upsert(
          slice, { onConflict: 'user_id,id' },
        );
        if (reErr && /selection_reason/i.test(String(reErr?.message))) {
          const withoutSelectionReason = slice.map(({ selection_reason: _reason, ...rest }) => rest);
          ({ error: reErr } = await sb.from('routine_exercises').upsert(
            withoutSelectionReason, { onConflict: 'user_id,id' },
          ));
        }
        if (reErr) logPgErr('sync._pushRoutineExercises', reErr);
      }
    }
  } catch (e) { logBulkWarn('sync._pushRoutinesAndExercises', e?.message, { error: e?.message }); }
}

async function _pushMesocycles(sb, supabaseUserId, localUserId) {
  try {
    const mesos = await getAllMesocyclesForUser(localUserId);
    if (mesos?.length) {
      // The cloud mesocycles schema declares start_date and end_date as
      // NOT NULL. Local rows can legitimately have nulls (a planned
      // block before its first week is laid out), so filter those out
      // rather than letting the whole batch reject.
      const rows = mesos.map(m => ({
        id: m.id, user_id: supabaseUserId,
        name: m.name,
        start_date: m.startDate ?? null,
        end_date: m.endDate ?? null,
        duration_weeks: m.durationWeeks ?? null,
        // Wave 2 (cross-surface-consistency-audit-2026-07-30): planned_weeks
        // is the authoritative schedule-length field and was never pushed,
        // so the cloud column sat at its DEFAULT 5 and the next pull
        // overwrote a genuine local 6+ back down to 5 -- the root cause of
        // "Week 2 of 5" vs "of 6" on the same block. block_type and
        // rir_ladder round-trip through the pull path too
        // (insertMesocycleFromCloud) but were never pushed either, so they
        // carried the same silent-overwrite risk; pushed here for the same
        // reason. `status` is NOT pushed: it is set once at creation and
        // never mutated anywhere in the app today (verified), so there is
        // no local value at risk of being overwritten yet, and pulling it
        // back would need insertMesocycleFromCloud's column list extended
        // too -- left as a follow-up if/when something starts writing it.
        planned_weeks: m.plannedWeeks ?? m.durationWeeks ?? null,
        block_type: m.blockType ?? null,
        rir_ladder: m.rirLadder ?? null,
        // Founder GO 2026-08-06: cloud column added by migrate_129. ORDER
        // MATTERS: that migration must run against production before a
        // build carrying this line ships, or the whole mesocycles upsert
        // batch rejects on the unknown column. The pull side
        // (insertMesocycleFromCloud) already prefers deload_week when
        // present, so this closes the round trip.
        deload_week: m.deloadWeek ?? null,
        // Stage 6 (2026-08-09): the Block Ledger JSON. Cloud column added by
        // migrate_131 — ORDER MATTERS exactly like deload_week above: that
        // migration must run against production before a build carrying
        // this line ships, or the whole mesocycles upsert batch rejects.
        // The pull side (insertMesocycleFromCloud) preserves a local ledger
        // when the cloud row carries none, so the round trip cannot wipe.
        // Parsed to an OBJECT for the jsonb column — a raw string would
        // store double-encoded.
        // Campaign 1 P0-8 D1: when this device has NO ledger (stale device,
        // pre-campaign row, unparseable text) the key is OMITTED entirely -
        // an upsert without the column leaves the cloud value untouched,
        // whereas the old explicit null ERASED a stored ledger from the
        // cloud and a later fresh-install restore lost it for good.
        ...((() => {
          if (!m.blockLedger) return {};
          try {
            const v = JSON.parse(m.blockLedger);
            return v == null ? {} : { block_ledger: v };
          } catch (_) { return {}; }
        })()),
        focus: m.focus ?? null,
        is_active: !!m.isActive,
        // Campaign 1 review finding 12: ship the block's REAL creation
        // time. Without it the cloud column defaulted to first-push time,
        // and created_at is the tiebreak both getActiveBlock and
        // getAchievedWeeklyPeaks order by after a restore.
        created_at: new Date(m.createdAt ?? Date.now()).toISOString(),
        updated_at: new Date(m.updatedAt ?? m.createdAt ?? Date.now()).toISOString(), // F5 Phase A: honest edit time
      })).filter(r => r.start_date && r.end_date);
      if (rows.length) {
        const { error } = await sb.from('mesocycles').upsert(rows, { onConflict: 'user_id,id' });
        if (error) logPgErr('sync._pushMesocycles', error);
      }
    }
    const weeks = await getAllMesocycleWeeksForUser(localUserId);
    if (weeks?.length) {
      const rows = weeks.map(w => ({
        // Explicit user_id for the (user_id, id) composite PK, not relying on
        // the inheritance trigger alone (audit A2).
        id: w.id, user_id: supabaseUserId,
        mesocycle_id: w.mesocycleId,
        week_number: w.weekIndex ?? w.weekNumber ?? 1,
        is_deload: !!w.isDeload,
        notes: w.notes ?? null,
        updated_at: new Date(w.updatedAt ?? w.createdAt ?? Date.now()).toISOString(), // F5 Phase A
      }));
      for (let i = 0; i < rows.length; i += 200) {
        const { error } = await sb.from('mesocycle_weeks').upsert(
          rows.slice(i, i + 200), { onConflict: 'user_id,id' },
        );
        if (error) logPgErr('sync._pushMesocycleWeeks', error);
      }
    }
  } catch (e) { logBulkWarn('sync._pushMesocycles', e?.message, { error: e?.message }); }
}

async function _pushSessionResolutions(sb, supabaseUserId, localUserId) {
  try {
    // eslint-disable-next-line global-require
    const { getAllSessionResolutionsForUser } = require('./database');
    const rows = await getAllSessionResolutionsForUser(localUserId);
    if (!rows?.length) return;
    // C18 block progression: the EXPLICIT half of session resolution. Skipping
    // a workout and finishing one early are deliberate user intent, so they
    // must survive a device change exactly as programme position does - a
    // restored device that resurrected a skipped session as OUTSTANDING would
    // be overriding a choice the athlete already made.
    //
    // The id is derived from (mesocycle_week_id, routine_id), so two devices
    // resolving the same instance converge on ONE row rather than racing two,
    // and conflict then falls to updated_at rather than an arbitrary id.
    const payload = rows.map(r => ({
      id: r.id, user_id: supabaseUserId,
      mesocycle_week_id: r.mesocycleWeekId,
      routine_id: r.routineId,
      mesocycle_id: r.mesocycleId ?? null,
      resolution: r.resolution,
      workout_id: r.workoutId ?? null,
      resolved_at: new Date(r.resolvedAt ?? r.createdAt ?? Date.now()).toISOString(),
      created_at: new Date(r.createdAt ?? Date.now()).toISOString(),
      updated_at: new Date(r.updatedAt ?? r.createdAt ?? Date.now()).toISOString(),
      deleted_at: r.deletedAt ? new Date(r.deletedAt).toISOString() : null,
    }));
    for (let i = 0; i < payload.length; i += 200) {
      const { error } = await sb.from('session_resolutions').upsert(
        payload.slice(i, i + 200), { onConflict: 'user_id,id' },
      );
      // Fails SOFT until migrate_140 is applied: progression is already
      // correct on-device, so an absent cloud table costs portability only.
      if (error) logPgErr('sync._pushSessionResolutions', error);
    }
  } catch (e) { logBulkWarn('sync._pushSessionResolutions', e?.message); }
}

async function _pushMorningWeights(sb, supabaseUserId, localUserId) {
  try {
    const weights = await getAllMorningWeightsForUser(localUserId);
    if (!weights?.length) return;
    const rows = weights.map(w => ({
      id: w.id, user_id: supabaseUserId,
      weight_kg: w.weightKg,
      logged_at: msToISO(w.loggedAt),
      notes: w.notes ?? null,
      // Campaign 1 review findings 9/12: real creation time rides too, so
      // the pull-side preservation has something honest to preserve.
      created_at: new Date(w.createdAt ?? Date.now()).toISOString(),
      updated_at: new Date(w.updatedAt ?? w.loggedAt ?? Date.now()).toISOString(), // F5 Phase A
      // C6 R-8: the soft-delete tombstone rides too, so a deletion made
      // here reaches the cloud (whose pulls filter deleted_at IS NULL)
      // and therefore every other device.
      deleted_at: w.deletedAt != null ? new Date(w.deletedAt).toISOString() : null,
    })).filter(r => r.logged_at && r.weight_kg != null);
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await sb.from('morning_weights').upsert(
        rows.slice(i, i + 200), { onConflict: 'user_id,id' },
      );
      if (error) logPgErr('sync._pushMorningWeights', error);
    }
  } catch (e) { logBulkWarn('sync._pushMorningWeights', e?.message, { error: e?.message }); }
}

async function _pushCoachOutputs(sb, supabaseUserId, localUserId) {
  try {
    const outputs = await getAllCoachOutputsForUser(localUserId);
    if (!outputs?.length) return;
    const rows = outputs.map(o => ({
      id: o.id, user_id: supabaseUserId,
      week_start: o.weekStart,
      output_json: o.outputJson,
      applied: !!o.applied,
      // F5 Phase A: previously pushed with NO updated_at, so flipping
      // 'applied' never bumped the cloud row and delta pulls missed it.
      updated_at: new Date(o.updatedAt ?? Date.now()).toISOString(),
    }));
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await sb.from('coach_outputs').upsert(
        rows.slice(i, i + 200), { onConflict: 'user_id,id' },
      );
      if (error) logPgErr('sync._pushCoachOutputs', error);
    }
  } catch (e) { logBulkWarn('sync._pushCoachOutputs', e?.message, { error: e?.message }); }
}

// ─── Push helpers for previously local-only tables ───────────────────────
// Each helper batches its table's rows into 200-row chunks and logs the
// full Postgres error metadata via logPgErr when an upsert is rejected.
// Failures don't propagate, a single bad table doesn't stop the rest
// of the bulk upload.

async function _pushExerciseUserNotes(sb, supabaseUserId, localUserId) {
  try {
    const notes = await getAllExerciseUserNotesForUser(localUserId);
    if (!notes?.length) return;
    const rows = notes.map(n => ({
      id: n.id, user_id: supabaseUserId,
      exercise_id: n.exerciseId, note: n.note ?? '',
      created_at: new Date(n.createdAt ?? Date.now()).toISOString(),
      updated_at: new Date(n.updatedAt ?? n.createdAt ?? Date.now()).toISOString(),
    }));
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await sb.from('exercise_user_notes').upsert(
        rows.slice(i, i + 200), { onConflict: 'user_id,id' },
      );
      if (error) logPgErr('sync._pushExerciseUserNotes', error);
    }
  } catch (e) { logBulkWarn('sync._pushExerciseUserNotes', e?.message); }
}

// ─── Campaign 9: the exercise-intent layer ────────────────────────────────
// exercise_intent / exercise_swaps / exercise_slot_defaults. Same shape as
// the sibling helpers above: 200-row chunks, onConflict 'user_id,id',
// failures logged and swallowed so one table cannot stop the rest.
//
// All three push tombstones as well as live rows. "Allow this exercise
// again" is recorded as deleted_at rather than a delete precisely so the
// restore travels; dropping tombstones from the payload would leave the
// user's other device suppressing an exercise they had un-excluded.
//
// Every timestamp is the ROW's own edit time (never now()), the honest-
// updated_at contract migrate_134 depends on: a device that has been
// offline must not stamp the freshest timestamp in the account onto its
// stale copy and win the last-write-wins comparison with it.

async function _pushExerciseIntent(sb, supabaseUserId, localUserId) {
  try {
    const rows = await getAllExerciseIntentsForUser(localUserId);
    if (!rows?.length) return;
    const payload = rows.map(r => ({
      id: r.id, user_id: supabaseUserId,
      exercise_id: r.exerciseId,
      kind: r.kind,
      scope_mesocycle_id: r.scopeMesocycleId ?? null,
      reason: r.reason ?? null,
      // D107-2: PATTERN_AVOID's day-bound duration. timestamptz, same
      // convention as the three fields below; local stores the epoch-ms
      // equivalent as expires_at_ms. Every pre-existing row (and every
      // EXCLUDED/AVOIDED_BLOCK row) sends null here, unchanged from before
      // this field existed. Column added by migrate_142, founder-gated: the
      // upsert batch fails soft with a logged PostgREST error until that
      // migration runs, exactly like migrate_137's scope column.
      expires_at: r.expiresAtMs != null ? new Date(r.expiresAtMs).toISOString() : null,
      created_at: new Date(r.createdAt ?? Date.now()).toISOString(),
      updated_at: new Date(r.updatedAt ?? r.createdAt ?? Date.now()).toISOString(),
      deleted_at: r.deletedAt != null ? new Date(r.deletedAt).toISOString() : null,
    })).filter(r => r.exercise_id && r.kind);
    for (let i = 0; i < payload.length; i += 200) {
      const { error } = await sb.from('exercise_intent').upsert(
        payload.slice(i, i + 200), { onConflict: 'user_id,id' },
      );
      if (error) logPgErr('sync._pushExerciseIntent', error);
    }
  } catch (e) { logBulkWarn('sync._pushExerciseIntent', e?.message); }
}

async function _pushExerciseSwaps(sb, supabaseUserId, localUserId) {
  try {
    const rows = await getAllExerciseSwapsForUser(localUserId);
    if (!rows?.length) return;
    const payload = rows.map(r => ({
      id: r.id, user_id: supabaseUserId,
      from_exercise_id: r.fromExerciseId,
      to_exercise_id: r.toExerciseId,
      routine_id: r.routineId ?? null,
      mesocycle_id: r.mesocycleId ?? null,
      explicit: !!r.explicit,
      // C16 quality law 1: 'session' vs 'programme'. Null on rows recorded
      // before the column existed, and the receiving device treats null as
      // unknown, which the negative-preference reading never counts.
      scope: r.scope ?? null,
      // CC29 (section 5.5): eligibility-derived provenance; null on every
      // pre-CC29 row. Until migrate_149 runs the batch fails soft per the
      // documented tolerated mode.
      cause: r.cause ?? null,
      created_at: new Date(r.createdAt ?? Date.now()).toISOString(),
      updated_at: new Date(r.updatedAt ?? r.createdAt ?? Date.now()).toISOString(),
      deleted_at: r.deletedAt != null ? new Date(r.deletedAt).toISOString() : null,
    })).filter(r => r.from_exercise_id && r.to_exercise_id);
    for (let i = 0; i < payload.length; i += 200) {
      const { error } = await sb.from('exercise_swaps').upsert(
        payload.slice(i, i + 200), { onConflict: 'user_id,id' },
      );
      if (error) logPgErr('sync._pushExerciseSwaps', error);
    }
  } catch (e) { logBulkWarn('sync._pushExerciseSwaps', e?.message); }
}

/**
 * Campaign 17A job 3: the food-intent layer's event log.
 *
 * Free-tier safe (a user who has never swapped a food has zero rows). The
 * cloud table is migrate_138_food_swaps.sql, founder-gated: until it is
 * applied the upsert errors, which is logged and tolerated exactly like every
 * other push, and the rows stay device-local. Nothing a user did is lost -
 * the local table is the truth and the push retries every sync.
 */
async function _pushFoodSwaps(sb, supabaseUserId, localUserId) {
  // The local read is deliberately OUTSIDE the push's error accounting: having
  // nothing to send (or being unable to read the table on an older device) is
  // not a push failure, and counting it as one would make a clean sync report
  // an error it did not have.
  let rows = [];
  try {
    // eslint-disable-next-line global-require
    const { getAllFoodSwapsSince } = require('./food/db');
    rows = await getAllFoodSwapsSince(localUserId, 0);
  } catch (_) { return; }
  if (!rows?.length) return;
  try {
    const payload = rows.map(r => ({
      id: r.id, user_id: supabaseUserId,
      from_food_key: r.fromFoodKey,
      to_food_key: r.toFoodKey,
      // NOT NULL in the schema: every row is written by a client that already
      // knows what the user meant, so "unknown" is not a state that occurs.
      scope: r.scope,
      created_at: new Date(r.createdAt ?? Date.now()).toISOString(),
      updated_at: new Date(r.updatedAt ?? r.createdAt ?? Date.now()).toISOString(),
      deleted_at: r.deletedAt != null ? new Date(r.deletedAt).toISOString() : null,
    })).filter(r => r.from_food_key && r.to_food_key && r.scope);
    for (let i = 0; i < payload.length; i += 200) {
      const { error } = await sb.from('food_swaps').upsert(
        payload.slice(i, i + 200), { onConflict: 'user_id,id' },
      );
      if (error) logPgErr('sync._pushFoodSwaps', error);
    }
  } catch (e) { logBulkWarn('sync._pushFoodSwaps', e?.message); }
}

async function _pushExerciseSlotDefaults(sb, supabaseUserId, localUserId) {
  try {
    const rows = await getAllExerciseSlotDefaultsForUser(localUserId);
    if (!rows?.length) return;
    const payload = rows.map(r => ({
      id: r.id, user_id: supabaseUserId,
      from_exercise_id: r.fromExerciseId,
      routine_id: r.routineId ?? null,
      exercise_id: r.exerciseId,
      created_at: new Date(r.createdAt ?? Date.now()).toISOString(),
      updated_at: new Date(r.updatedAt ?? r.createdAt ?? Date.now()).toISOString(),
      deleted_at: r.deletedAt != null ? new Date(r.deletedAt).toISOString() : null,
    })).filter(r => r.from_exercise_id && r.exercise_id);
    for (let i = 0; i < payload.length; i += 200) {
      const { error } = await sb.from('exercise_slot_defaults').upsert(
        payload.slice(i, i + 200), { onConflict: 'user_id,id' },
      );
      if (error) logPgErr('sync._pushExerciseSlotDefaults', error);
    }
  } catch (e) { logBulkWarn('sync._pushExerciseSlotDefaults', e?.message); }
}

async function _pushUserBodyProfile(sb, supabaseUserId, localUserId) {
  try {
    const p = await getUserBodyProfile(localUserId);
    if (!p) return;
    const { error } = await sb.from('user_body_profile').upsert({
      user_id: supabaseUserId,
      sex: p.sex ?? null,
      date_of_birth: p.dateOfBirth ?? null,
      height_cm: p.heightCm ?? null,
      experience_level: p.experienceLevel ?? null,
      training_age_years: p.trainingAgeYears ?? null,
      primary_goal: p.primaryGoal ?? null,
      scoff_score: p.scoffScore ?? null,
      gdpr_consented: !!p.gdprConsented,
      // Campaign 1 P0-8 D13: the goal lock has always had cloud columns
      // (migrate_017) but was never pushed, so it stayed device-local.
      goal_lock_advanced: !!p.goalLockAdvanced,
      goal_lock_set_at: p.goalLockSetAt ? new Date(p.goalLockSetAt).toISOString() : null,
      // Campaign 1 P0-8 D14: the row's HONEST edit time, not now().
      // Stamping now() on every push meant a device that had not synced
      // since before the user changed these values uploaded its stale
      // copy carrying the freshest timestamp in the account, which then
      // beat every LWW gate. scoff_score is ED-screening data.
      updated_at: new Date(p.updatedAt ?? p.createdAt ?? Date.now()).toISOString(),
    }, { onConflict: 'user_id' });
    if (error) logPgErr('sync._pushUserBodyProfile', error);
  } catch (e) { logBulkWarn('sync._pushUserBodyProfile', e?.message); }
}

async function _pushUserInsights(sb, supabaseUserId, localUserId) {
  try {
    const rows = await getAllUserInsightsForUser(localUserId);
    if (!rows?.length) return;
    const payload = rows.map(r => ({
      id: r.id, user_id: supabaseUserId,
      insight_key: r.insightKey, type: r.type ?? null,
      severity: r.severity ?? null, copy: r.copy ?? null,
      action_payload: r.actionPayload ?? null,
      generated_at: r.generatedAt ? new Date(r.generatedAt).toISOString() : new Date().toISOString(),
      dismissed_at: r.dismissedAt ? new Date(r.dismissedAt).toISOString() : null,
      updated_at: new Date(r.updatedAt ?? r.generatedAt ?? Date.now()).toISOString(), // F5 Phase A: honest edit time
    }));
    for (let i = 0; i < payload.length; i += 200) {
      const { error } = await sb.from('user_insights').upsert(
        payload.slice(i, i + 200), { onConflict: 'user_id,id' },
      );
      if (error) logPgErr('sync._pushUserInsights', error);
    }
  } catch (e) { logBulkWarn('sync._pushUserInsights', e?.message); }
}

async function _pushWorkoutNotes(sb, supabaseUserId, localUserId) {
  try {
    const rows = await getAllWorkoutNotesForUser(localUserId);
    if (!rows?.length) return;
    const payload = rows.map(r => ({
      id: r.id, user_id: supabaseUserId,
      workout_id: r.workoutId, note: r.note,
      created_at: new Date(r.createdAt ?? Date.now()).toISOString(),
      updated_at: new Date(r.updatedAt ?? r.createdAt ?? Date.now()).toISOString(),
      deleted_at: r.deletedAt ? new Date(r.deletedAt).toISOString() : null,
    }));
    for (let i = 0; i < payload.length; i += 200) {
      const { error } = await sb.from('workout_notes').upsert(
        payload.slice(i, i + 200), { onConflict: 'user_id,id' },
      );
      if (error) logPgErr('sync._pushWorkoutNotes', error);
    }
  } catch (e) { logBulkWarn('sync._pushWorkoutNotes', e?.message); }
}

async function _pushExerciseGoals(sb, supabaseUserId, localUserId) {
  try {
    const rows = await getAllExerciseGoalsForUser(localUserId);
    if (!rows?.length) return;
    const payload = rows.map(r => ({
      id: r.id, user_id: supabaseUserId,
      exercise_id: r.exerciseId,
      target_weight: r.targetWeight ?? null,
      target_reps: r.targetReps ?? null,
      target_date: r.targetDate ?? null,
      notes: r.notes ?? null,
      created_at: new Date(r.createdAt ?? Date.now()).toISOString(),
      updated_at: new Date(r.updatedAt ?? r.createdAt ?? Date.now()).toISOString(),
    }));
    for (let i = 0; i < payload.length; i += 200) {
      const { error } = await sb.from('exercise_goals').upsert(
        payload.slice(i, i + 200), { onConflict: 'user_id,id' },
      );
      if (error) logPgErr('sync._pushExerciseGoals', error);
    }
  } catch (e) { logBulkWarn('sync._pushExerciseGoals', e?.message); }
}

async function _pushPeakWeekPlans(sb, supabaseUserId, localUserId) {
  try {
    const rows = await getAllPeakWeekPlansForUser(localUserId);
    if (!rows?.length) return;
    const payload = rows.map(r => ({
      id: r.id, user_id: supabaseUserId,
      show_date: r.showDate ?? null,
      federation: r.federation ?? null,
      current_bodyweight: r.currentBodyweight ?? null,
      lean_estimate: r.leanEstimate ?? null,
      prep_carbs_per_kg: r.prepCarbsPerKg ?? null,
      prep_sodium_mg: r.prepSodiumMg ?? null,
      prep_water_l: r.prepWaterL ?? null,
      status: r.status ?? 'active',
      created_at: new Date(r.createdAt ?? Date.now()).toISOString(),
      updated_at: new Date(r.updatedAt ?? r.createdAt ?? Date.now()).toISOString(),
    }));
    for (let i = 0; i < payload.length; i += 200) {
      const { error } = await sb.from('peak_week_plans').upsert(
        payload.slice(i, i + 200), { onConflict: 'user_id,id' },
      );
      if (error) logPgErr('sync._pushPeakWeekPlans', error);
    }
  } catch (e) { logBulkWarn('sync._pushPeakWeekPlans', e?.message); }
}

async function _pushPlannedMuscleVolume(sb, supabaseUserId, localUserId) {
  try {
    const rows = await getAllPlannedMuscleVolumeForUser(localUserId);
    if (!rows?.length) return;
    // Campaign 1 P0-1: mev/mav/mrv/source now ride to the cloud
    // (migrate_132) so the adaptive seed provenance survives a device
    // change - the explanation surfaces derive from the written rows and
    // their source labels, and those used to be device-local only.
    const payload = rows.map(r => ({
      id: r.id, user_id: supabaseUserId,
      mesocycle_week_id: r.mesocycleWeekId,
      muscle: r.muscle,
      planned_sets: r.plannedSets ?? null,
      mev: r.mev ?? null,
      mav: r.mav ?? null,
      mrv: r.mrv ?? null,
      source: r.source ?? null,
      created_at: new Date(r.createdAt ?? Date.now()).toISOString(),
      updated_at: new Date(r.updatedAt ?? r.createdAt ?? Date.now()).toISOString(),
      deleted_at: r.deletedAt ? new Date(r.deletedAt).toISOString() : null,
    }));
    // Column tolerance until migrate_132 is applied (profiles.js pattern):
    // PostgREST rejects a whole upsert for one unknown column, so on error
    // retry the batch without the provenance columns - set counts keep
    // syncing exactly as before the fix, nothing regresses pre-migration.
    const stripProvenance = (batch) => batch.map(({ mev, mav, mrv, source, ...rest }) => rest);
    for (let i = 0; i < payload.length; i += 200) {
      const batch = payload.slice(i, i + 200);
      let { error } = await sb.from('planned_muscle_volume').upsert(
        batch, { onConflict: 'user_id,id' },
      );
      if (error) {
        ({ error } = await sb.from('planned_muscle_volume').upsert(
          stripProvenance(batch), { onConflict: 'user_id,id' },
        ));
      }
      if (error) logPgErr('sync._pushPlannedMuscleVolume', error);
    }
  } catch (e) { logBulkWarn('sync._pushPlannedMuscleVolume', e?.message); }
}

async function _pushAdaptationEvents(sb, supabaseUserId, localUserId) {
  try {
    const rows = await getAllAdaptationEventsForUser(localUserId);
    if (!rows?.length) return;
    // Local schema uses decision/reason_code/signals_json; cloud schema
    // uses event_type (NOT NULL) + payload (JSON). Map decision → event_type
    // since decision is locally NOT NULL, and roll the rest of the richer
    // local fields into the payload column so nothing is lost.
    const payload = rows.map(r => ({
      id: r.id, user_id: supabaseUserId,
      mesocycle_week_id: r.mesocycleWeekId ?? null,
      event_type: r.eventType ?? r.decision ?? 'unknown',
      payload: r.payload ?? {
        decision: r.decision ?? null,
        delta: r.delta ?? null,
        muscle: r.muscle ?? null,
        exercise_id: r.exerciseId ?? null,
        reason_code: r.reasonCode ?? null,
        reason_text: r.reasonText ?? null,
        signals: (() => { try { return r.signalsJson ? JSON.parse(r.signalsJson) : null; } catch (_) { return null; } })(),
      },
      recorded_at: new Date(r.recordedAt ?? r.createdAt ?? Date.now()).toISOString(),
      created_at: new Date(r.createdAt ?? Date.now()).toISOString(),
      updated_at: new Date(r.updatedAt ?? r.createdAt ?? Date.now()).toISOString(),
      deleted_at: r.deletedAt ? new Date(r.deletedAt).toISOString() : null,
    }));
    for (let i = 0; i < payload.length; i += 200) {
      const { error } = await sb.from('adaptation_events').upsert(
        payload.slice(i, i + 200), { onConflict: 'user_id,id' },
      );
      if (error) logPgErr('sync._pushAdaptationEvents', error);
    }
  } catch (e) { logBulkWarn('sync._pushAdaptationEvents', e?.message); }
}


// ─── AsyncStorage prefs sync ─────────────────────────────────────────────
// Every @volyume_ prefix key in AsyncStorage that isn't an excluded
// internal key gets shipped to the user_prefs (user_id, key, value)
// table. On a new device pull, _pullUserPrefs writes them back into
// AsyncStorage so the user's units, accessibility, wellbeing mode,
// and one-time seen-flags all restore exactly.

const PREF_PREFIX = '@volyume_';
// Keys that hold transient or device-specific state, never sync.
// crash_log: ephemeral diagnostic ring buffer.
// local_user_id: per-device anonymous id, regenerated on a fresh install.
// palette_recents: local-only ordering of recently-opened items.
const PREF_EXCLUDE_PATTERNS = [
  /^@volyume_crash_log$/,
  /^@volyume_local_user_id$/,
  /^@volyume_palette_recents/,
  // Notification subscriptions are tied to a device-bound expo push
  // token; syncing them across devices would resubscribe the wrong
  // token. The user's stated reminder preferences ARE synced (see
  // training_reminders_config below), only the token/subscription
  // mapping is device-bound.
  /^@volyume_expo_push_token/,
  // F1 (audit SD-1, CRITICAL): sync cursors and watermarks are DEVICE state.
  // They rode this prefs sync keyed by the Supabase uid, so two devices on
  // one account overwrote each other's cursors ("cloud value wins"); an
  // imported fresher push watermark defeats the advance-only-on-clean-push
  // hold-back, silently skipping rows that failed to push — which the
  // sign-out wipe then destroys. Imported pull watermarks likewise create
  // silent pull gaps. Never sync any cursor/watermark key.
  /^@volyume_pull_wm_/,
  /^@volyume_push_wm_/,
  /^@volyume_food_last_pushed_/,
  /^@volyume_food_last_pulled_/,
  // The in-progress workout crash snapshot is a per-device recovery
  // artefact (multi-KB, mutates on every set edit); syncing it ping-pongs
  // another device's live session onto this one.
  /^@volyume_active_workout/,
  // Baseline timezone offset for the notification re-lay check: strictly
  // this device's timezone, meaningless on any other.
  /^@volyume_notif_tz_offset/,
  // ─── Sensitive / special-category keys (Codex audit AC-01/H-03, 2026-07-12) ───
  // This prefs sync is allow-by-prefix: everything @volyume_ ships unless it
  // is excluded here. That is fail-open, so special-category health data must
  // be named explicitly until the allow-by-prefix model is inverted to a
  // fail-closed allowlist (follow-up on the same audit). Each key below is
  // either special-category health data the wellbeing screen PROMISES stays
  // device-only, or a transient diagnostic/draft that has no business in the
  // cloud. Their real, non-sensitive counterparts (wellbeing MODE, reminder
  // config, units) sync through their own keys/tables and are unaffected.
  /^@volyume_scoff_answers$/,       // raw ED-screening answers (Article 9 + "device-only" promise)
  // Campaign 1 P0-2 (2026-08-10): the analytics opt-out. privacyPrefs.js's
  // contract has always read "a privacy opt-out should not itself be
  // transmitted, so this never goes through pref sync" - but the key was
  // missed from this list, so the bulk push shipped it and the pull could
  // write a remote copy back over a stricter local choice. Excluding it
  // here closes BOTH directions (the pull applies the same filter), and
  // rows already uploaded by older builds go frozen-stale and are never
  // imported (same posture as the cursor keys above). Cloud row cleanup:
  // supabase/migrate_133_delete_privacy_pref_rows.sql (founder-gated).
  /^@volyume_privacy_prefs$/,
  /^@volyume_cycle_tracking/,       // menstrual-cycle data (Article 9)
  /^@volyume_error_log/,            // diagnostic ring buffer (may hold raw messages/paths)
  /^@volyume_last_crash_meta/,      // last-crash metadata
  /^@volyume_feedback_/,            // pending feedback + prompt history (free text)
  /^@volyume_pro_onboarding_draft/, // in-progress onboarding answers (sex/goals), transient
  // Campaign 1 P0-8 D10/D11: the per-key local write stamps written by
  // notePrefWrite. They record when THIS device last wrote a guarded
  // pref, so they are device state by definition - syncing them would
  // import another device's clock and defeat the guard they exist for
  // (exactly the failure the cursor/watermark exclusions above fix).
  /^@volyume_pref_written_at_/,
  // C15 job 4: the per-day offsets write clock, excluded by name as the
  // second gate. Same class as the stamps above: it records when THIS
  // device last wrote the offsets, so importing another device's value
  // defeats the push gate it feeds. The offsets PAYLOAD still syncs.
  /^@volyume_perday_target_offsets_updated_at$/,
];

// ─── C14 job 1: FAIL-CLOSED preference sync ──────────────────────────────
//
// The model used to be "@volyume_* syncs unless somebody remembers to
// exclude it". That is backwards for privacy and user control: a new
// device-local, sensitive, ephemeral or implementation-only key became
// cross-device state simply by using the normal namespace, and the only
// defence was a human remembering to extend a blocklist. Campaign 10H
// closed one such leak by name and recorded the architecture as still
// fail-open.
//
// Now an UNKNOWN key does not sync. A preference reaches the cloud only by
// being classified here, deliberately, as cross-device user state.
//
// The classification behind the list (kept as code, not a prose document):
//   A SYNCED USER CHOICE      - listed below; follows the signed-in user
//   B DEVICE-LOCAL CHOICE     - camera facing, palette order, tz offset
//   C PRIVACY / SAFETY LOCAL  - privacy prefs, SCOFF answers, cycle tracking
//   D EPHEMERAL / CACHE       - crash logs, widget snapshot, seen-flags,
//                               dismissals, migration receipts, drafts,
//                               sync cursors, in-progress workout snapshot
//   E OWN SYNC MECHANISM      - anything with its own table/registry entry
//   F LEGACY / DEAD           - no live writer or reader
//
// Only A is listed. Everything else is refused by omission, which is the
// point: forgetting to classify a new key now fails SAFE.
const SYNCED_PREF_PATTERNS = [
  // Core account-level choices.
  /^@volyume_units$/,
  /^@volyume_a11y_prefs$/,
  /^@volyume_workout_prefs$/,
  /^@volyume_schedule_v1$/,
  /^@volyume_intent_prompt_off$/,
  /^@volyume_physique_tracking_enabled$/,
  // The profile blob and its per-field write stamps travel together: the
  // blob carries coachTone, coachAutonomy, showScience, bodyWeightUnits and
  // the meal-plan prefs, none of which exist as cloud columns.
  /^@volyume_user_profile_/,
  // Notification choices (the guarded family: every writer stamps).
  /^@volyume_notification_prefs$/,
  /^@volyume_quiet_hours_v1$/,
  /^@volyume_meal_reminders$/,
  /^@volyume_reminder_enabled_v1$/,
  /^@volyume_reminder_time_v1$/,
  // Nutrition/diary choices the user sets explicitly.
  /^@volyume_meal_labels$/,
  /^@volyume_meals_per_day$/,
  /^@volyume_water_target_ml$/,
  // ── C15 job 4: generic-vs-dedicated ownership, ruled 2026-08-13 ──────────
  // Both keys below ALSO have a dedicated cloud table, so C14 left them here
  // conservatively without proving the dedicated round-trip. Both were then
  // re-traced end to end against the rule "one user state must not have two
  // independent cross-device authorities". They land DIFFERENTLY, and both
  // stay, for reasons that are specific rather than cautious. The proof is
  // kept as code here and pinned in campaign15.syncOwnership.test.js.
  //
  // @volyume_nutrition_targets - SPLIT OWNERSHIP, not a duplicate authority.
  //   The dedicated `nutrition_targets` table (registry entry + handler
  //   sync/tables/nutritionTargets.js) owns the ENGINE row in SQLite and
  //   restores it via insertNutritionTargetsFromCloud, which writes SQLite
  //   and ONLY SQLite. It never writes this AsyncStorage key.
  //   This key is a separate DISPLAY mirror with its own readers (the Home
  //   phase-mismatch banner, the setup-complete kcal and macro summary, the
  //   Body Metrics nutrition card), and richer writers can attach immutable
  //   presentation context the cloud engine row has no column for, such as
  //   Campaign 19's maintenanceAuthority receipt. Body Metrics resolves that
  //   authority afresh; it never treats a target field as maintenance.
  //   Generic pref sync is therefore the ONLY thing that restores the mirror
  //   on a fresh install; dropping this entry would leave those surfaces
  //   blank after a reinstall for no gain.
  //   The two mechanisms cannot race, because they write different stores:
  //   _pullUserPrefs only ever writes AsyncStorage, and the dedicated pull
  //   only ever writes SQLite. Neither can overwrite the other's copy, and
  //   neither can move an engine value or a safety floor.
  /^@volyume_nutrition_targets$/,
  // @volyume_perday_target_offsets - the dedicated `perday_target_offsets`
  //   table IS the designed authority (bidirectional, with a real
  //   last-write-wins gate in applyPerDayOffsetsFromCloud), and it does
  //   restore on a fresh install. It is NOT yet a COMPLETE carrier, which is
  //   the only reason this entry survives: pushPerDayTargetOffsets skips the
  //   upload entirely when the local write clock is 0, and offsets last saved
  //   by any build older than that sync handler have the payload key but no
  //   clock. For those users generic pref sync is the only thing carrying
  //   their offsets, so removing this would silently lose a live Pro setting.
  //   A live data path is not removed for architecture neatness.
  //   The pattern is ANCHORED (lead ruling, C15). Unanchored it also matched
  //   the sibling @volyume_perday_target_offsets_updated_at, which is THIS
  //   device's write provenance - the same class as the
  //   @volyume_pref_written_at_ stamps excluded above - and it is not a
  //   guarded pref, so the pull's unconditional multiSet imported another
  //   device's clock straight over the gate that clock exists to feed.
  //   Anchoring costs nothing: there are exactly two keys and neither is
  //   per-user, so the payload still rides generic sync. A fresh install that
  //   restores offsets without a clock behaves exactly as a pre-sync user
  //   already does (the dedicated push skips until this device writes), which
  //   is why no backfill is needed to make this correct.
  /^@volyume_perday_target_offsets$/,
  // Training-volume intent: manual landmarks are guarded, never clobbered.
  /^@volyume_landmarks_/,
  // Progress-scan display choices (what the user wants shown, not scans).
  /^@volyume_scan_skip_name$/,
  /^@volyume_progress_scan_hide_exact_numbers$/,
  /^@volyume_progress_scan_timer_seconds$/,
  // Exercise-level user choices.
  /^@volyume_unilateral_exercises$/,
  /^@volyume_unilateral_asked_exercises$/,
  // Chart lens choices: which metric/window the user prefers to see.
  /^@volyume_chart_window_/,
  /^@volyume_chart_metric_detail$/,
  // Streak state carries explicit choices (manual goal, pauses) plus the
  // retro-shrink guard; guarded, and already synced.
  /^@volyume_streak_v1_/,
  // Win-back episode state: single-shot, guarded, already synced.
  /^@volyume_winback_/,
  // PRE-EXISTING and deliberately unchanged: calm mode already syncs as a
  // guarded pref, because calm is the STRICTER state and a device that
  // knows less must not be able to turn it off. C14 preserves that exactly
  // and does NOT broaden anything else wellbeing-adjacent. D92-11
  // (cross-device ED/wellbeing propagation) remains a separate founder
  // decision and is untouched here.
  /^@volyume_wellbeing_mode$/,
];

/**
 * The ONE classification governing both directions of generic pref sync.
 * Push filters with it, pull filters with it, so a key can never be
 * uploadable but not downloadable (or the reverse).
 *
 * Unknown key -> false. Known local/sensitive key -> false (the exclusion
 * list is retained as a deliberate second gate, so the privacy families
 * Campaign 10H named stay refused even if someone later widens the
 * allowlist by mistake).
 */
export function shouldSyncPref(key) {
  if (typeof key !== 'string' || !key.startsWith(PREF_PREFIX)) return false;
  if (PREF_EXCLUDE_PATTERNS.some(re => re.test(key))) return false;
  return SYNCED_PREF_PATTERNS.some(re => re.test(key));
}

// ─── Guarded prefs (Campaign 1 P0-8 D10/D11) ─────────────────────────────
// Two pref families carry state a stale device must never overwrite:
//
//   @volyume_landmarks_<uid>  manual MEV/MAV/MRV overrides. One whole-blob
//                             value for every muscle at once, so a losing
//                             collision silently discards the user's hand-set
//                             targets with no merge and no notice. Manual
//                             overrides must never be silently lost.
//   @volyume_wellbeing_mode   calm mode. Calm is the STRICTER, ED-safer
//                             state: it gates ED-adjacent copy, the
//                             progress-photo card and the ledger's
//                             suppressed flag. A device that knows less
//                             must never be able to turn it off.
//
// The generic prefs pull is "cloud value wins unconditionally", which is
// fine for units and seen-flags and wrong for both of these.
export const PREF_WRITE_STAMP_PREFIX = '@volyume_pref_written_at_';
const WELLBEING_PREF_KEY = '@volyume_wellbeing_mode';
const GUARDED_PREF_PATTERNS = [
  /^@volyume_landmarks_/,
  /^@volyume_wellbeing_mode$/,
  // C6 F4 (D97): the per-uid profile blob carries coachTone, coachAutonomy,
  // showScience, bodyWeightUnits and the mealPlan prefs - none of which
  // exist as cloud columns. A stale device's routine bulk push must not
  // make an old blob look freshest; saveLocalProfile stamps every real
  // user write (the reinstall rebuild write deliberately does NOT, and is
  // additionally suppressed from the push below).
  /^@volyume_user_profile_/,
  // C6 R-11 (D97-22): the per-user streak blob carries explicit user
  // choices (manual goal, pauses) plus the retro-shrink guard's
  // high-water record and seen-milestones - a stale device's unguarded
  // "cloud wins" push discarded pauses (re-breaking runs retroactively)
  // and re-fired milestones. saveStreakState stamps every write.
  /^@volyume_streak_v1_/,
  // C6 S-2 (D97-23): the notification-pref blob and quiet hours are
  // explicit user choices; unguarded they were LAST-SYNCER-wins (push
  // stamps push time), so a stale device's routine sync reverted a
  // reminder or quiet-hours change on BOTH devices. Every writer stamps.
  // The deletion/tombstone half of the family (S-3) stays with the
  // founder's FR-C4-2 architecture question - no wholesale consolidation.
  /^@volyume_notification_prefs$/,
  /^@volyume_quiet_hours_v1$/,
  // C6 RB6-6 (D97-25): the churn episode, its 180-day floor and the
  // stated return became per-user under R-7 but still rode the
  // unguarded cloud-wins path, so a stale device could reset the
  // single-shot state. Every winbackState write stamps.
  /^@volyume_winback_/,
  // C14 job 2: these two store "off" by DELETING the key, so their
  // deletion has to survive a stale device. An unguarded key is
  // cloud-wins on pull and blind-upsert on push, which cannot express
  // "the delete is newer" in either direction - the stale device simply
  // re-uploads the old value and the setting turns itself back on. Every
  // write on both paths stamps (setUserPref / deleteUserPref), so the
  // freshest real user action wins. Any future key with a delete path
  // belongs here for the same reason.
  /^@volyume_intent_prompt_off$/,
  /^@volyume_scan_skip_name$/,
];

export function isGuardedPref(key) {
  return typeof key === 'string' && GUARDED_PREF_PATTERNS.some(re => re.test(key));
}

/**
 * Record that THIS device just wrote a guarded pref locally.
 *
 * Called from the write sites (the landmark editor's save/reset paths and
 * setWellbeingMode), immediately after the AsyncStorage write. The stamp
 * is what _pullUserPrefs compares the cloud row's updated_at against, so
 * a cloud copy that is older than this device's own edit is dropped
 * instead of applied. Best-effort and never throws: a missing stamp only
 * costs the extra protection, it cannot break the write it follows.
 */
export async function notePrefWrite(key) {
  if (!isGuardedPref(key)) return;
  try {
    await AsyncStorage.setItem(PREF_WRITE_STAMP_PREFIX + key, String(Date.now()));
  } catch (_) { /* best-effort: the pull falls back to the monotonic rules */ }
}

/**
 * Campaign 1 review finding 5: the cloud updated_at for a guarded pref
 * must be the VALUE's edit time, not the push time. Both push paths used
 * to stamp now(), so a stale device's routine sync made its old blob
 * look freshest and the pull-side stamp rule was reading laundered
 * timestamps. The stamp (notePrefWrite on local edits; the cloud row's
 * updated_at recorded at pull time for values learned from another
 * device) is the value's provenance and travels with it. A guarded key
 * with no stamp at all (legacy value, never edited post-fix) seeds with
 * now() once - after which the stamp cycle keeps it honest.
 */
async function _guardedPrefUpdatedAt(key) {
  if (!isGuardedPref(key)) return new Date().toISOString();
  try {
    const raw = await AsyncStorage.getItem(PREF_WRITE_STAMP_PREFIX + key);
    const ms = Number(raw);
    if (Number.isFinite(ms) && ms > 0) return new Date(ms).toISOString();
  } catch (_) { /* fall through */ }
  return new Date().toISOString();
}

/**
 * The "this preference has no value" sentinel, in both directions.
 */
export const PREF_TOMBSTONE = '';

/**
 * C14 job 2: turn a synced preference OFF everywhere, not just here.
 *
 * The bulk push ships the keys AsyncStorage currently holds. A key the
 * user deleted is simply absent from that push, so the cloud row survives
 * untouched and the next pull — another device, or this one after a
 * reinstall — writes the old value straight back. The user turns a setting
 * off, and it comes back on. Several controls store "off" by removing the
 * key rather than writing a falsy value, so this was the normal path
 * through them, not an edge case.
 *
 * There is no pref-delete RPC and adding one would be a schema change for
 * a problem an existing convention already solves: the landmark reset has
 * pushed an empty value as the "no value" sentinel since Campaign 1. This
 * generalises that. Local removal, a guarded-pref stamp so the delete has
 * an honest edit time and cannot be undone by an older cloud copy, then
 * the tombstone push. The pull side removes the key on a tombstone rather
 * than writing an empty string, so both devices land in the same state.
 *
 * Best-effort and never throws: a failed push defers to the next bulk
 * sync, which re-ships the tombstone because it is a real stored row.
 */
export async function deleteUserPref(supabaseUserId, key) {
  if (!key) return;
  try { await AsyncStorage.removeItem(key); } catch (_) { /* tolerate */ }
  await notePrefWrite(key).catch(() => {});
  try { await syncUserPref(supabaseUserId, key, PREF_TOMBSTONE); } catch (_) { /* tolerate */ }
}

/**
 * C14 job 2: the other half of the pair. Write a synced preference
 * locally, stamp it as a real user edit, and push it.
 *
 * Symmetry is the point: a key whose "off" is a delete needs an honest
 * edit time on BOTH transitions, or the guard protects the delete and not
 * the re-enable. Callers that set and clear a preference should use this
 * pair rather than reaching for AsyncStorage plus a bare syncUserPref, so
 * the stamp cannot be forgotten on one branch of a toggle.
 */
export async function setUserPref(supabaseUserId, key, value) {
  if (!key) return;
  const stored = value == null ? '' : String(value);
  try { await AsyncStorage.setItem(key, stored); } catch (_) { /* tolerate */ }
  await notePrefWrite(key).catch(() => {});
  try { await syncUserPref(supabaseUserId, key, stored); } catch (_) { /* tolerate */ }
}

/**
 * C14 job 2: drop the guarded rows a stale device must not upload.
 *
 * The pull side has honoured edit times since Campaign 1, but the push
 * side was a blind upsert: whatever this device holds overwrites the
 * cloud row regardless of which edit is actually newer. That is invisible
 * for ordinary keys (they push at now(), so the cloud is never ahead) and
 * wrong for the guarded families, which carry the VALUE's edit time. It
 * is what let a stale device re-upload a preference the user had just
 * deleted or changed elsewhere: the delete survived on the device that
 * made it, but the cloud went backwards and every other device kept the
 * dead value.
 *
 * So: read the cloud's updated_at for the guarded keys about to be
 * pushed, and drop any row whose own edit time is older. Now the newest
 * real user action wins in BOTH directions, which is what a deletion
 * needs to be durable.
 *
 * Fails OPEN. If the read fails we push as before rather than silently
 * dropping the user's data; the pull-side guard still protects the value
 * that matters.
 */
async function _dropStaleGuardedPushes(sb, supabaseUserId, rows) {
  const guarded = rows.filter(r => isGuardedPref(r.key));
  if (!guarded.length) return rows;
  let cloud;
  try {
    const { data, error } = await sb.from('user_prefs')
      .select('key,updated_at')
      .eq('user_id', supabaseUserId)
      .in('key', guarded.map(r => r.key));
    if (error) return rows;
    cloud = data;
  } catch (_) { return rows; }
  if (!cloud?.length) return rows;
  const cloudAt = new Map();
  for (const r of cloud) {
    const ms = timeToMs(r?.updated_at);
    if (Number.isFinite(ms)) cloudAt.set(r.key, ms);
  }
  return rows.filter((r) => {
    if (!isGuardedPref(r.key)) return true;
    const theirs = cloudAt.get(r.key);
    if (!Number.isFinite(theirs)) return true;
    const mine = timeToMs(r.updated_at);
    if (!Number.isFinite(mine)) return true;
    // Equal timestamps push: re-writing the identical row is harmless and
    // repairs a row whose value was lost while the timestamp survived.
    return mine >= theirs;
  });
}

/**
 * Push one preference key to the cloud. Idempotent, upsert on
 * (user_id, key). Called from the store whenever a synced
 * preference changes so the cloud copy stays current.
 */
export async function syncUserPref(supabaseUserId, key, value) {
  const sb = getClient();
  if (!sb || !supabaseUserId || !key || !shouldSyncPref(key)) return;
  // Re-triage 2026-08-01: covered wholesale by the next good syncAll's bulk
  // push, so a dead session defers with no queue entry and no data loss.
  if (await _blockedByDeadSession('sync.syncUserPref')) return;
  try {
    const row = {
      user_id: supabaseUserId, key,
      value: value == null ? '' : String(value),
      // Finding 5: honest edit time for guarded keys, push time otherwise.
      updated_at: await _guardedPrefUpdatedAt(key),
    };
    // C14 job 2: never push a guarded value over a newer cloud edit.
    const keep = await _dropStaleGuardedPushes(sb, supabaseUserId, [row]);
    if (!keep.length) return;
    const { error } = await sb.from('user_prefs').upsert(row, { onConflict: 'user_id,key' });
    if (error) logPgErr('sync.syncUserPref', error);
  } catch (e) { logWarn('sync.syncUserPref', e?.message, { key }); }
}


async function _pushAllUserPrefs(sb, supabaseUserId) {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    let keys = allKeys.filter(shouldSyncPref);
    // C6 F4 (D97): a machine-rebuilt profile blob (reinstall restore, no
    // user write yet this session) must never be pushed - in the
    // push-before-pull order it would overwrite the cloud's only good
    // copy with defaults, permanently on a single-device reinstall. The
    // flag clears on the first real saveLocalProfile.
    try {
      // eslint-disable-next-line global-require
      const store = require('../store/useAppStore').default;
      if (store.getState()._profileBlobRebuilt) {
        keys = keys.filter((k) => !/^@volyume_user_profile_/.test(k));
      }
    } catch (_) { /* store unavailable: push as before */ }
    if (!keys.length) return;
    const pairs = await AsyncStorage.multiGet(keys);
    // Finding 5: guarded keys carry the value's honest edit time so a
    // stale device's routine bulk push can no longer make its old blob
    // look freshest and defeat the pull-side stamp rule.
    const all = await Promise.all(pairs.map(async ([k, v]) => ({
      user_id: supabaseUserId, key: k,
      value: v == null ? '' : String(v),
      updated_at: await _guardedPrefUpdatedAt(k),
    })));
    // C14 job 2: a stale device's routine bulk push must not walk the
    // cloud backwards over a newer edit (or a deletion) made elsewhere.
    const rows = await _dropStaleGuardedPushes(sb, supabaseUserId, all);
    if (!rows.length) return;
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await sb.from('user_prefs').upsert(
        rows.slice(i, i + 200), { onConflict: 'user_id,key' },
      );
      if (error) logPgErr('sync._pushAllUserPrefs', error);
    }
  } catch (e) { logBulkWarn('sync._pushAllUserPrefs', e?.message); }
}

// ─── Pull (new device) ────────────────────────────────────────────────────────

/**
 * Download cloud workouts that don't exist locally.
 * Used when signing into an existing account on a new device.
 * Returns the count of workouts downloaded.
 */
export async function pullFromCloud(supabaseUserId) {
  const sb = getClient();
  if (!sb || !supabaseUserId) return 0;
  if (await _blockedByDeadSession('sync.pullFromCloud')) return 0;
  // Article 9 gate (C-2, D96): this legacy pull moves special-category
  // health rows (morning weights, user_body_profile incl. scoff_score) and
  // must honour the SAME fail-closed consent predicate the registry runner
  // enforces (runner.js F2/SC-1). Home's pull-to-refresh calls this path
  // directly, so without this check an unresolved consent read could pull
  // health data. ANY read failure counts as unresolved (closed), never as
  // consent. Strictly strengthening; consented users are unaffected.
  try {
    // eslint-disable-next-line global-require
    const healthConsent = require('../store/useAppStore').default.getState()?.healthConsent;
    if (healthConsent !== true) {
      logWarn('sync.pullFromCloud', 'skipped: health consent unresolved or refused', { supabaseUserId });
      return 0;
    }
  } catch (_) {
    logWarn('sync.pullFromCloud', 'skipped: consent state unreadable (fails closed)', { supabaseUserId });
    return 0;
  }
  // F1 (audit SD-2): the sign-out wipe waits for sync idle with a 5s TIMEOUT.
  // If this pull is still mid-flight when that timeout expires, its inserts
  // would repopulate the DB being wiped and its watermark writes would land
  // after AsyncStorage.clear() — zombie rows for the old uid plus stale
  // cursors that make the same user's next sign-in skip their history. The
  // runner already re-checks the guard between migrated-table pulls; this
  // threads the same check through the legacy pull: bail between stages,
  // and never advance a cursor while a wipe is in progress.
  // eslint-disable-next-line global-require
  const { isSignOutWiping } = require('./sync/signOutGuard');
  const bailForWipe = (stage) => {
    if (!isSignOutWiping()) return false;
    logWarn('sync.pullFromCloud', `aborted at ${stage}: sign-out wipe in progress`, { supabaseUserId });
    return true;
  };
  if (bailForWipe('start')) return 0;
  // Pull every Pro-state table independently so a user with plans
  // but no workouts (or vice versa) still gets everything that IS
  // in the cloud restored locally. Earlier versions early-returned
  // on empty workouts, which meant a user whose previous install had
  // synced plans + nutrition but no completed sessions came back to
  // empty everything. Each per-table helper logs counts so we can
  // verify in Debug logs exactly what landed.
  let workoutCount = 0;
  let setCount = 0;
  let setFailures = 0;

  try {
    // ─── 1. Exercises FIRST ──────────────────────────────────────────────
    // routine_exercises and workout_sets carry exercise_id references
    // that need to resolve against local exercises. Pulling exercises
    // first means the FK targets exist before the dependent rows
    // arrive. Dedupe-by-name inside _pullExercises rewrites any
    // mismatched canonical IDs to the local deterministic one so old
    // cloud rows that pre-date deterministic IDs heal automatically.
    const exerciseCount = await _pullExercises(sb, supabaseUserId);
    if (bailForWipe('workouts')) return 0;

    // Incremental delta pull (GAP row 12b). On a warm cursor we ask the
    // cloud only for workouts changed since the last pull, instead of
    // re-downloading the entire session history every foreground. The
    // cursor lives in AsyncStorage and is cleared on sign-out, so a
    // fresh sign-in (cursor == 0) still does a full pull. The
    // (user_id, updated_at) index from migrate_012 backs this query.
    // Sets stay fetched by the pulled workouts' IDs below, so semantics
    // are unchanged except for the rows we skip re-pulling.
    const wmWorkouts = await getPullWatermark(supabaseUserId, 'workouts');
    const cloudWorkouts = await fetchAllRows(
      'sync.pullFromCloud.workouts',
      () => {
        let q = sb.from('workouts')
          // deleted_at is SELECTED and no longer FILTERED OUT: a tombstone is
          // the only way this device can learn that another device deleted a
          // session. Filtering them out (the old F5 Phase A defensive guard)
          // is what let a stale local copy survive and be re-uploaded,
          // resurrecting a deleted workout (release-gate blocker).
          // PD-5 (bundle 2 prelude): sleep_quality/energy_score were pushed
          // but missing from this explicit select, so every cross-device
          // pull handed insertWorkoutFromCloud undefined and REPLACEd the
          // entered readiness with NULL. Cloud columns live since
          // migrate_118 (applied 2026-07-11).
          .select('id, started_at, ended_at, duration_minutes, notes, is_completed, session_difficulty, overall_pump, soreness_24h_before, fatigue_level, routine_id, mesocycle_id, name, pre_workout_intent, set_count, total_volume, mesocycle_week_id, joint_discomfort, sleep_quality, energy_score, updated_at, deleted_at')
          .eq('user_id', supabaseUserId)
          .eq('is_completed', true);
        if (wmWorkouts > 0) q = q.gte('updated_at', isoFromMs(wmWorkouts));
        return q.order('started_at', { ascending: false });
      },
    );
    let workoutFailures = 0;
    if (cloudWorkouts?.length) {
      // A tombstoned workout is applied as a LOCAL HARD DELETE rather than a
      // local tombstone. Keeping local rows either live-or-absent means every
      // existing workout reader (history, programme position, volume, PRs,
      // coach evidence, re-entry recency - ~50 query sites) stays correct
      // with no filter changes, and there is no half-state for them to
      // mis-read. The durable propagation evidence for THIS device's own
      // deletes lives in pending_sync_ops ('workout_delete'), not in the row,
      // so removing the row destroys nothing the sync layer still needs.
      const tombstoned = cloudWorkouts.filter(w => w?.deleted_at);
      const liveWorkouts = cloudWorkouts.filter(w => !w?.deleted_at);
      for (const w of tombstoned) {
        try {
          // eslint-disable-next-line global-require
          const { deleteWorkoutAndSets } = require('./database');
          await deleteWorkoutAndSets(supabaseUserId, w.id);
        } catch (e) {
          workoutFailures++;
          logWarn('sync.pullFromCloud', 'workout tombstone apply failed', { workoutId: w?.id, error: e?.message });
        }
      }
      // First pass: insert every LIVE workout shell. Don't fetch sets per
      // workout (that was N+1 round-trips); batch them after.
      for (const w of liveWorkouts) {
        try { await insertWorkoutFromCloud(supabaseUserId, w); workoutCount++; }
        catch (e) { workoutFailures++; logWarn('sync.pullFromCloud', 'workout insert failed', { workoutId: w?.id, error: e?.message }); }
      }
      // Second pass: one chunked query per ~200 workouts for their sets.
      // Only live workouts: a tombstoned one has just been removed locally.
      if (bailForWipe('workout_sets')) return 0;
      const workoutIds = liveWorkouts.map(w => w.id);
      const allSets = await fetchByIdsChunked(
        'sync.pullFromCloud.sets', 'workout_sets', 'workout_id', workoutIds,
      );
      for (const s of allSets) {
        try { await insertWorkoutSetFromCloud(supabaseUserId, s); setCount++; }
        catch (setErr) {
          setFailures++;
          logWarn('sync.pullFromCloud', 'set insert failed', {
            workoutId: s?.workout_id, setId: s?.id, error: setErr?.message,
          });
        }
      }
    }
    if (setFailures > 0) {
      logWarn('sync.pullFromCloud', `${setFailures} sets failed to insert`, { supabaseUserId });
    }
    // Advance the workouts cursor only on a clean pass. On any failure
    // the cursor stays put, so the next pull re-pulls the same (small,
    // idempotent) delta and retries rather than skipping the row for
    // good. nextWatermark never moves backwards, so an empty delta is a
    // no-op. Sign-out clears the cursor, so sign-in always full-pulls.
    if (workoutFailures === 0 && setFailures === 0 && !isSignOutWiping()) {
      await setPullWatermark(supabaseUserId, 'workouts', nextWatermark(wmWorkouts, cloudWorkouts));
    }

    // Pro-state tables. Each runs independently regardless of whether
    // workouts came back; one missing table doesn't break the others.
    // The wipe guard is re-checked between helpers (each is bounded, so
    // per-helper granularity closes the realistic race window).
    if (bailForWipe('pro_state')) return workoutCount;
    const programmeCount = await _pullProgrammes(sb, supabaseUserId);
    const routineCount = await _pullRoutinesAndExercises(sb, supabaseUserId);
    if (bailForWipe('mesocycles')) return workoutCount;
    const mesoCount = await _pullMesocycles(sb, supabaseUserId);
    // C18 block progression: pulled straight after the mesocycles they belong
    // to, so a restored device knows which required sessions the athlete
    // explicitly skipped or finished early before any surface asks what is
    // next. Best-effort like its siblings: a failure leaves those instances
    // reading OUTSTANDING, which is the honest pre-restore answer rather than
    // a fabricated one.
    await _pullSessionResolutions(sb, supabaseUserId);
    const weightCount = await _pullMorningWeights(sb, supabaseUserId);
    // weekly_checkins_v2 moved to src/lib/sync/transport.js
    // (registry-driven per-table pull). See MIGRATED_TABLES.
    if (bailForWipe('coach_outputs')) return workoutCount;
    const coachCount = await _pullCoachOutputs(sb, supabaseUserId);
    // nutrition_targets moved to src/lib/sync/transport.js
    // (registry-driven per-table pull). See MIGRATED_TABLES.
    // body_composition_log moved to src/lib/sync/transport.js
    // (registry-driven per-table pull). See MIGRATED_TABLES.
    // New tables that previously stayed local-only on every cross-
    // device sign-in. Each is fault-tolerant, a missing cloud table
    // logs and returns 0 rather than crashing the whole pull.
    const bodyProfileFound = await _pullUserBodyProfile(sb, supabaseUserId);
    const insightCount = await _pullUserInsights(sb, supabaseUserId);
    if (bailForWipe('notes_goals')) return workoutCount;
    const exerciseNoteCount = await _pullExerciseUserNotes(sb, supabaseUserId);
    // Campaign 9 exercise-intent layer. Runs AFTER _pullExercises (well
    // above), so the dedupe-by-name remap has already reconciled the two
    // devices' exercise ids and these rows land on ids that resolve.
    const intentCount = await _pullExerciseIntent(sb, supabaseUserId);
    const swapCount = await _pullExerciseSwaps(sb, supabaseUserId);
    const slotDefaultCount = await _pullExerciseSlotDefaults(sb, supabaseUserId);
    // Campaign 17A food-intent layer.
    await _pullFoodSwaps(sb, supabaseUserId);
    const workoutNoteCount = await _pullWorkoutNotes(sb, supabaseUserId);
    const goalCount = await _pullExerciseGoals(sb, supabaseUserId);
    const peakWeekCount = await _pullPeakWeekPlans(sb, supabaseUserId);
    const plannedVolCount = await _pullPlannedMuscleVolume(sb, supabaseUserId);
    const adaptCount = await _pullAdaptationEvents(sb, supabaseUserId);
    const customExerciseCount = await _pullCustomExercises(sb, supabaseUserId);
    // Prefs write straight into AsyncStorage — the exact store the wipe is
    // about to clear — so this is the most important late check.
    if (bailForWipe('user_prefs')) return workoutCount;
    const prefCount = await _pullUserPrefs(sb, supabaseUserId);
    // C6 RC6-8 (D97-25): on a reinstall the launch-time
    // restoreNotifications call runs BEFORE this pull delivers the
    // notification-prefs blob, so the first session ran with no
    // reminders at all until the next cold launch (D97-6 fixed the
    // call never running; this is the ordering residual it did not
    // cover). When this pull actually delivered prefs, re-lay once:
    // every scheduler inside self-gates on permission, tier, toggles,
    // push budget and the ED flag, so this changes no policy - the
    // same argument D97-6 recorded. Best effort, never blocks the pull.
    if (prefCount > 0) {
      try {
        // eslint-disable-next-line global-require
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        const raw = await AsyncStorage.getItem('@volyume_notification_prefs');
        if (raw) {
          // eslint-disable-next-line global-require
          const { restoreNotifications } = require('./notifications/scheduler');
          restoreNotifications(JSON.parse(raw), supabaseUserId).catch(() => {});
        }
      } catch (_) { /* best effort */ }
    }
    // notification_preferences moved to src/lib/sync/transport.js
    // (registry-driven per-table pull). The runner now calls
    // transport.pullTable('notification_preferences', ...) directly
    // before this legacy bulk pull. Codex re-audit 2026-05-26 F6
    // is preserved in the new path (applyPreferenceFromPull).
    // Food-domain pull (food_entries, custom_foods, saved_meals,
    // recipes, food_favourites, daily_water, daily_intake_rollups)
    // moved to src/lib/sync/tables/foodDomain.js. Coordinator
    // drives food_sync_pull once per syncAll and reports per-table
    // counts via transport.pullTable.
    const foodCounts = {
      foodEntries: 0, customFoods: 0, savedMeals: 0,
      recipes: 0, favourites: 0, water: 0,
    };

    // Verbose success log so the user (and we) can see EXACTLY what
    // came back. The previous "silent return 0" path made it
    // impossible to tell whether the pull found the user's data or
    // not.
    logInfo('sync.pullFromCloud.done', `uid=${supabaseUserId}`, {
      exercises: exerciseCount,
      workouts: workoutCount,
      sets: setCount,
      programmes: programmeCount,
      routines: routineCount,
      mesocycles: mesoCount,
      morningWeights: weightCount,
      coachOutputs: coachCount,
      // checkins / nutritionTargets / bodyMetrics now counted in
      // src/lib/sync/runner.js under pullCountPerTable from the
      // per-table transport. This map is the legacy bulk pull
      // report and only tracks tables still owned by pullFromCloud.
      bodyProfile: bodyProfileFound ? 1 : 0,
      insights: insightCount,
      exerciseNotes: exerciseNoteCount,
      exerciseIntent: intentCount,
      exerciseSwaps: swapCount,
      exerciseSlotDefaults: slotDefaultCount,
      workoutNotes: workoutNoteCount,
      exerciseGoals: goalCount,
      customExercises: customExerciseCount,
      peakWeekPlans: peakWeekCount,
      plannedVolume: plannedVolCount,
      adaptationEvents: adaptCount,
      prefs: prefCount,
      // notificationPrefs intentionally not reported here: the table
      // moved to the registry-driven transport pull (see comment above
      // + src/lib/sync/tables/notificationPreferences.js). The runner
      // counts it under pullCountPerTable. Leaving the old
      // `notifPrefCount` reference here threw a Hermes ReferenceError
      // that aborted the whole pull into the catch (returned 0).
      foodEntries: foodCounts.foodEntries,
      customFoods: foodCounts.customFoods,
      savedMeals: foodCounts.savedMeals,
      recipes: foodCounts.recipes,
      favourites: foodCounts.favourites,
      water: foodCounts.water,
    });

    return workoutCount;
  } catch (e) {
    logError('sync.pullFromCloud', e, { supabaseUserId });
    return 0;
  }
}

/**
 * Pull every cloud exercise into local SQLite.
 *
 * Runs BEFORE routines / routine_exercises / workout_sets pulls so
 * those rows' exercise_id references resolve against the local
 * exercises table immediately.
 *
 * Dedupe-by-name logic:
 *   - Cloud row's id matches a local id → skip (already present)
 *   - Cloud row's name matches a local exercise of a different id
 *     → rewrite all local refs (routine_exercises / workout_sets /
 *       exercise_user_notes / exercise_goals, plus the Campaign 9
 *       intent layer: exercise_intent.exercise_id,
 *       exercise_swaps.from_exercise_id + .to_exercise_id, and
 *       exercise_slot_defaults.from_exercise_id + .exercise_id)
 *       from the local id to the cloud id, then leave the local row
 *       at the cloud id.
 *       This is how an install whose deterministic canonical IDs
 *       differ from a sibling install (e.g. different app versions)
 *       gets the two devices' worlds joined up cleanly. Anything
 *       keyed by exercise id that is NOT in that list is orphaned by
 *       the merge, which is why the intent layer had to join it: an
 *       exclusion pointing at a dead id silently stops working.
 *   - No match by id or name → INSERT as a new local exercise
 *     (custom or new canonical from a build the local app hasn't
 *     seeded yet).
 *
 * The function uses INSERT OR REPLACE under the hood via
 * insertOrUpdateExerciseFromCloud in database.js. Returns the number
 * of rows touched.
 */
async function _pullExercises(sb, supabaseUserId) {
  try {
    const data = await fetchAllRows(
      'sync._pullExercises',
      () => sb.from('exercises').select('*').eq('user_id', supabaseUserId).is('deleted_at', null),
    );
    if (!data?.length) return 0;
    // eslint-disable-next-line global-require
    const { insertOrUpdateExerciseFromCloud } = require('./database');
    let n = 0;
    for (const e of data) {
      try { await insertOrUpdateExerciseFromCloud(e); n++; }
      catch (err) { logWarn('sync._pullExercises', 'insert failed', { id: e?.id, error: err?.message }); }
    }
    return n;
  } catch (e) { logWarn('sync._pullExercises', e?.message); return 0; }
}

async function _pullUserBodyProfile(sb, supabaseUserId) {
  try {
    const { data, error } = await sb.from('user_body_profile')
      .select('*').eq('user_id', supabaseUserId).maybeSingle();
    if (error) { logPgErr('sync._pullUserBodyProfile', error); return false; }
    if (!data) return false;
    // eslint-disable-next-line global-require
    const { insertOrUpdateUserBodyProfileFromCloud } = require('./database');
    try { await insertOrUpdateUserBodyProfileFromCloud(supabaseUserId, data); return true; }
    catch (e) { logWarn('sync._pullUserBodyProfile', 'insert failed', { error: e?.message }); return false; }
  } catch (e) { logWarn('sync._pullUserBodyProfile', e?.message); return false; }
}

async function _pullUserInsights(sb, supabaseUserId) {
  try {
    const { data, error } = await sb.from('user_insights')
      .select('*').eq('user_id', supabaseUserId).is('deleted_at', null);
    if (error) { logPgErr('sync._pullUserInsights', error); return 0; }
    if (!data?.length) return 0;
    // eslint-disable-next-line global-require
    const { insertOrUpdateUserInsightFromCloud } = require('./database');
    let n = 0;
    for (const row of data) {
      try { await insertOrUpdateUserInsightFromCloud(supabaseUserId, row); n++; }
      catch (e) { logWarn('sync._pullUserInsights', 'insert failed', { id: row?.id, error: e?.message }); }
    }
    return n;
  } catch (e) { logWarn('sync._pullUserInsights', e?.message); return 0; }
}

async function _pullExerciseUserNotes(sb, supabaseUserId) {
  try {
    const wm = await getPullWatermark(supabaseUserId, 'exercise_user_notes');
    // C6 T-13 (D97-24) + RC6-7 (D97-25): the pull now pages with
    // fetchAllRows (offset pagination within ONE cycle), the audit's
    // original direction. The interim order+cap route left two holes
    // Review C proved: rows sharing one updated_at at the cap boundary
    // were skipped for ever (the watermark could not advance past
    // them), and a large restore stayed partial across cycles. Offset
    // pagination has neither; a mid-pagination error throws so the
    // outer catch holds the watermark and the next pull retries.
    const data = await fetchAllRows(
      'sync._pullExerciseUserNotes',
      () => {
        let q = sb.from('exercise_user_notes').select('*').eq('user_id', supabaseUserId).is('deleted_at', null)
          .order('updated_at', { ascending: true });
        if (wm > 0) q = q.gte('updated_at', isoFromMs(wm));
        return q;
      },
    );
    if (!data?.length) return 0;
    // eslint-disable-next-line global-require
    const { insertOrUpdateExerciseUserNoteFromCloud } = require('./database');
    let n = 0;
    let failures = 0;
    for (const row of data) {
      try { await insertOrUpdateExerciseUserNoteFromCloud(supabaseUserId, row); n++; }
      catch (e) { failures++; logWarn('sync._pullExerciseUserNotes', 'insert failed', { id: row?.id, error: e?.message }); }
    }
    if (failures === 0) await setPullWatermark(supabaseUserId, 'exercise_user_notes', nextWatermark(wm, data));
    return n;
  } catch (e) { logWarn('sync._pullExerciseUserNotes', e?.message); return 0; }
}

// ─── Campaign 9: the exercise-intent layer (pull side) ────────────────────
// Watermarked delta pulls with fetchAllRows pagination, the pattern
// _pullExerciseUserNotes settled on (C6 T-13 / RC6-7): offset pagination
// within one cycle, and the watermark only advances when every row in the
// page applied cleanly, so a transport failure retries rather than skipping
// rows for ever.
//
// These pulls deliberately DO NOT filter `deleted_at IS NULL`, unlike their
// older siblings. A tombstone here is the user's "allow this exercise
// again", and it is the only carrier of that instruction: filter it out and
// the second device keeps suppressing an exercise the user restored on the
// first. The appliers are the safety net, not the query -- each refuses any
// cloud row that is not strictly newer than what it already holds.

async function _pullExerciseIntent(sb, supabaseUserId) {
  try {
    const wm = await getPullWatermark(supabaseUserId, 'exercise_intent');
    const data = await fetchAllRows(
      'sync._pullExerciseIntent',
      () => {
        let q = sb.from('exercise_intent').select('*').eq('user_id', supabaseUserId)
          .order('updated_at', { ascending: true });
        if (wm > 0) q = q.gte('updated_at', isoFromMs(wm));
        return q;
      },
    );
    if (!data?.length) return 0;
    // eslint-disable-next-line global-require
    const { insertOrUpdateExerciseIntentFromCloud } = require('./database');
    let n = 0;
    let failures = 0;
    for (const row of data) {
      try { await insertOrUpdateExerciseIntentFromCloud(supabaseUserId, row); n++; }
      catch (e) { failures++; logWarn('sync._pullExerciseIntent', 'insert failed', { id: row?.id, error: e?.message }); }
    }
    if (failures === 0) await setPullWatermark(supabaseUserId, 'exercise_intent', nextWatermark(wm, data));
    return n;
  } catch (e) { logWarn('sync._pullExerciseIntent', e?.message); return 0; }
}

async function _pullExerciseSwaps(sb, supabaseUserId) {
  try {
    const wm = await getPullWatermark(supabaseUserId, 'exercise_swaps');
    const data = await fetchAllRows(
      'sync._pullExerciseSwaps',
      () => {
        let q = sb.from('exercise_swaps').select('*').eq('user_id', supabaseUserId)
          .order('updated_at', { ascending: true });
        if (wm > 0) q = q.gte('updated_at', isoFromMs(wm));
        return q;
      },
    );
    if (!data?.length) return 0;
    // eslint-disable-next-line global-require
    const { insertOrUpdateExerciseSwapFromCloud } = require('./database');
    let n = 0;
    let failures = 0;
    for (const row of data) {
      try { await insertOrUpdateExerciseSwapFromCloud(supabaseUserId, row); n++; }
      catch (e) { failures++; logWarn('sync._pullExerciseSwaps', 'insert failed', { id: row?.id, error: e?.message }); }
    }
    if (failures === 0) await setPullWatermark(supabaseUserId, 'exercise_swaps', nextWatermark(wm, data));
    return n;
  } catch (e) { logWarn('sync._pullExerciseSwaps', e?.message); return 0; }
}

/**
 * Campaign 17A job 3. Applied with INSERT OR IGNORE on the far side (an
 * append-only event log must not duplicate on a re-pull), with the tombstone
 * applied separately so a withdrawn standing replacement propagates.
 */
async function _pullFoodSwaps(sb, supabaseUserId) {
  try {
    const wm = await getPullWatermark(supabaseUserId, 'food_swaps');
    const data = await fetchAllRows(
      'sync._pullFoodSwaps',
      () => {
        let q = sb.from('food_swaps').select('*').eq('user_id', supabaseUserId)
          .order('updated_at', { ascending: true });
        if (wm > 0) q = q.gte('updated_at', isoFromMs(wm));
        return q;
      },
    );
    if (!data?.length) return 0;
    // eslint-disable-next-line global-require
    const { insertOrUpdateFoodSwapFromCloud } = require('./food/db');
    let n = 0;
    let failures = 0;
    for (const row of data) {
      try { await insertOrUpdateFoodSwapFromCloud(supabaseUserId, row); n++; }
      catch (e) { failures++; logWarn('sync._pullFoodSwaps', 'insert failed', { id: row?.id, error: e?.message }); }
    }
    if (failures === 0) await setPullWatermark(supabaseUserId, 'food_swaps', nextWatermark(wm, data));
    return n;
  } catch (e) { logWarn('sync._pullFoodSwaps', e?.message); return 0; }
}

async function _pullExerciseSlotDefaults(sb, supabaseUserId) {
  try {
    const wm = await getPullWatermark(supabaseUserId, 'exercise_slot_defaults');
    const data = await fetchAllRows(
      'sync._pullExerciseSlotDefaults',
      () => {
        let q = sb.from('exercise_slot_defaults').select('*').eq('user_id', supabaseUserId)
          .order('updated_at', { ascending: true });
        if (wm > 0) q = q.gte('updated_at', isoFromMs(wm));
        return q;
      },
    );
    if (!data?.length) return 0;
    // eslint-disable-next-line global-require
    const { insertOrUpdateExerciseSlotDefaultFromCloud } = require('./database');
    let n = 0;
    let failures = 0;
    for (const row of data) {
      try { await insertOrUpdateExerciseSlotDefaultFromCloud(supabaseUserId, row); n++; }
      catch (e) { failures++; logWarn('sync._pullExerciseSlotDefaults', 'insert failed', { id: row?.id, error: e?.message }); }
    }
    if (failures === 0) await setPullWatermark(supabaseUserId, 'exercise_slot_defaults', nextWatermark(wm, data));
    return n;
  } catch (e) { logWarn('sync._pullExerciseSlotDefaults', e?.message); return 0; }
}

async function _pullWorkoutNotes(sb, supabaseUserId) {
  try {
    const { data, error } = await sb.from('workout_notes')
      .select('*').eq('user_id', supabaseUserId).is('deleted_at', null);
    if (error) { logPgErr('sync._pullWorkoutNotes', error); return 0; }
    if (!data?.length) return 0;
    // eslint-disable-next-line global-require
    const { insertOrUpdateWorkoutNoteFromCloud } = require('./database');
    let n = 0;
    for (const row of data) {
      try { await insertOrUpdateWorkoutNoteFromCloud(supabaseUserId, row); n++; }
      catch (e) { logWarn('sync._pullWorkoutNotes', 'insert failed', { id: row?.id, error: e?.message }); }
    }
    return n;
  } catch (e) { logWarn('sync._pullWorkoutNotes', e?.message); return 0; }
}

async function _pullExerciseGoals(sb, supabaseUserId) {
  try {
    const { data, error } = await sb.from('exercise_goals')
      .select('*').eq('user_id', supabaseUserId).is('deleted_at', null);
    if (error) { logPgErr('sync._pullExerciseGoals', error); return 0; }
    if (!data?.length) return 0;
    // eslint-disable-next-line global-require
    const { insertOrUpdateExerciseGoalFromCloud } = require('./database');
    let n = 0;
    for (const row of data) {
      try { await insertOrUpdateExerciseGoalFromCloud(supabaseUserId, row); n++; }
      catch (e) { logWarn('sync._pullExerciseGoals', 'insert failed', { id: row?.id, error: e?.message }); }
    }
    return n;
  } catch (e) { logWarn('sync._pullExerciseGoals', e?.message); return 0; }
}

async function _pullCustomExercises(sb, supabaseUserId) {
  try {
    const { data, error } = await sb.from('custom_exercises')
      .select('*').eq('user_id', supabaseUserId).is('deleted_at', null);
    if (error) { logPgErr('sync._pullCustomExercises', error); return 0; }
    if (!data?.length) return 0;
    // Restore custom exercises into the LOCAL `exercises` table (is_custom=1),
    // NOT the local `custom_exercises` mirror. The whole app resolves an
    // exercise by id against `exercises` only (getAllExercises, routine/workout
    // joins, getExerciseById), and creation writes there too. Cloud keeps its
    // composite-PK `custom_exercises` table (migration 020/021); this only
    // fixes where the local restore lands. Before this, pulled customs went to
    // the orphaned local `custom_exercises` table and were invisible/unresolvable
    // after a reinstall or device swap. Soft-deleted customs are skipped so a
    // deleted exercise doesn't reappear.
    // eslint-disable-next-line global-require
    const { insertOrUpdateExerciseFromCloud } = require('./database');
    let n = 0;
    for (const row of data) {
      if (row?.deleted_at) continue;
      try { await insertOrUpdateExerciseFromCloud({ ...row, is_custom: 1 }); n++; }
      catch (e) { logWarn('sync._pullCustomExercises', 'insert failed', { id: row?.id, error: e?.message }); }
    }
    return n;
  } catch (e) { logWarn('sync._pullCustomExercises', e?.message); return 0; }
}

async function _pullPeakWeekPlans(sb, supabaseUserId) {
  try {
    const { data, error } = await sb.from('peak_week_plans')
      .select('*').eq('user_id', supabaseUserId);
    if (error) { logPgErr('sync._pullPeakWeekPlans', error); return 0; }
    if (!data?.length) return 0;
    // eslint-disable-next-line global-require
    const { insertOrUpdatePeakWeekPlanFromCloud } = require('./database');
    let n = 0;
    for (const row of data) {
      try { await insertOrUpdatePeakWeekPlanFromCloud(supabaseUserId, row); n++; }
      catch (e) { logWarn('sync._pullPeakWeekPlans', 'insert failed', { id: row?.id, error: e?.message }); }
    }
    return n;
  } catch (e) { logWarn('sync._pullPeakWeekPlans', e?.message); return 0; }
}

async function _pullPlannedMuscleVolume(sb, supabaseUserId) {
  try {
    // Campaign 1 review finding 3: paginate. A bare select caps at
    // PostgREST's 1000 rows (~9 blocks of planned volume), and since
    // P0-1 made this pull the restore path for the PRIMARY table, a
    // long-tenured user's most recent blocks - including the active one -
    // silently failed to restore.
    const data = await fetchAllRows(
      'sync._pullPlannedMuscleVolume',
      () => sb.from('planned_muscle_volume').select('*').eq('user_id', supabaseUserId).is('deleted_at', null),
    );
    if (!data?.length) return 0;
    // eslint-disable-next-line global-require
    const { insertOrUpdatePlannedMuscleVolumeFromCloud } = require('./database');
    let n = 0;
    for (const row of data) {
      try { await insertOrUpdatePlannedMuscleVolumeFromCloud(supabaseUserId, row); n++; }
      catch (e) { logWarn('sync._pullPlannedMuscleVolume', 'insert failed', { id: row?.id, error: e?.message }); }
    }
    return n;
  } catch (e) { logWarn('sync._pullPlannedMuscleVolume', e?.message); return 0; }
}

async function _pullAdaptationEvents(sb, supabaseUserId) {
  try {
    const data = await fetchAllRows(
      'sync._pullAdaptationEvents',
      () => sb.from('adaptation_events').select('*').eq('user_id', supabaseUserId).is('deleted_at', null),
    );
    if (!data?.length) return 0;
    // eslint-disable-next-line global-require
    const { insertOrUpdateAdaptationEventFromCloud, runAdaptationEventBatch } = require('./database');
    let n = 0;
    // C8 Work 4 review D9: this pull is unwatermarked and full-table, and
    // Work 4 doubled the writes per row (sync mirror + authoritative log).
    // One transaction around the loop keeps a multi-year user's restore
    // at roughly its previous cost instead of paying for every row twice.
    // Falls back to the plain loop if the batch helper cannot run, so a
    // failure here can never lose the restore.
    const applyAll = async () => {
      for (const row of data) {
        try { await insertOrUpdateAdaptationEventFromCloud(supabaseUserId, row); n++; }
        catch (e) { logWarn('sync._pullAdaptationEvents', 'insert failed', { id: row?.id, error: e?.message }); }
      }
    };
    try { await runAdaptationEventBatch(applyAll); }
    catch (e) { logWarn('sync._pullAdaptationEvents', 'batch failed, applying row-by-row', e?.message); n = 0; await applyAll(); }
    return n;
  } catch (e) { logWarn('sync._pullAdaptationEvents', e?.message); return 0; }
}

/**
 * user_prefs pull.
 *
 * Reads every key/value row the user owns from the cloud `user_prefs` table and
 * mirrors them into local AsyncStorage via multiSet. The cloud value wins
 * unconditionally for ordinary keys (units, seen-flags): there is no per-key
 * updated_at comparison for those. The two GUARDED families (isGuardedPref)
 * are the exception, see filterGuardedPulledPrefs. Returns the number of keys
 * written. (Audit 2026-06-21: this docstring previously described a
 * notification_preferences / applyPreferenceFromPull / last-write-wins path
 * that this function does not implement.)
 */

/**
 * Campaign 1 P0-8 D10/D11. Drops the pulled entries that a stale device
 * must not be allowed to apply. Two rules, both narrow and both fail-safe:
 *
 *  1. STAMP RULE (both guarded families). If this device's own local
 *     write of the key (notePrefWrite) is at least as new as the cloud
 *     row's updated_at, keep the local value. That is what stops a stale
 *     device's landmark blob replacing manual overrides this device set
 *     more recently, in either direction.
 *
 *  2. CALM RATCHET (wellbeing key only). Even with no stamp at all, a
 *     pulled 'normal'/'unspecified' never replaces a local 'calm'. Calm
 *     is the stricter, ED-safer state and no remote device may weaken it.
 *     Consequence, stated plainly because it is a deliberate asymmetry:
 *     turning calm OFF applies on the device where the user turned it
 *     off (that device's own AsyncStorage write is the change) but does
 *     NOT propagate to another device that is already calm - that device
 *     keeps calm until the user turns it off there too. Rule 1 alone
 *     would not give this, because the cloud row can legitimately carry a
 *     newer updated_at than the calm device's stamp. Erring toward the
 *     safer state is the intended behaviour; the user can always turn
 *     calm off locally, and nothing remote can do it for them.
 *
 * Exported (rather than kept private) so both rules can be pinned
 * directly in src/lib/__tests__/campaign1.syncConflict.test.js without
 * standing up the whole pullFromCloud chain.
 */
export async function filterGuardedPulledPrefs(Storage, rows) {
  const guarded = rows.filter(r => isGuardedPref(r.key));
  if (!guarded.length) return rows;
  // Campaign 1 review findings 4 + 13: the guard itself FAILS CLOSED. A
  // failed stamp lookup, a failed local wellbeing read, or a cloud row
  // whose updated_at cannot be parsed all DROP the guarded rows rather
  // than applying them - a missed pull costs nothing (the next pull
  // retries); a mis-applied one silently reverts calm mode or hand-set
  // landmarks. This matches the campaign's posture everywhere else.
  let stamps = {};
  let stampsReadFailed = false;
  try {
    const pairs = await Storage.multiGet(guarded.map(r => PREF_WRITE_STAMP_PREFIX + r.key));
    stamps = Object.fromEntries(pairs);
  } catch (_) { stamps = {}; stampsReadFailed = true; }
  let localWellbeing = null;
  let wellbeingReadFailed = false;
  if (guarded.some(r => r.key === WELLBEING_PREF_KEY)) {
    try { localWellbeing = await Storage.getItem(WELLBEING_PREF_KEY); } catch (_) { wellbeingReadFailed = true; }
  }
  return rows.filter((r) => {
    if (!isGuardedPref(r.key)) return true;
    if (stampsReadFailed) return false;
    const cloudMs = timeToMs(r.updated_at);
    if (!Number.isFinite(cloudMs) || cloudMs <= 0) return false;
    const localStamp = Number(stamps[PREF_WRITE_STAMP_PREFIX + r.key] ?? NaN);
    if (Number.isFinite(localStamp) && localStamp >= cloudMs) return false;
    if (r.key === WELLBEING_PREF_KEY) {
      if (wellbeingReadFailed) return false;
      if (localWellbeing === 'calm' && r.value !== 'calm') return false;
    }
    return true;
  });
}
async function _pullUserPrefs(sb, supabaseUserId) {
  try {
    const { data, error } = await sb.from('user_prefs')
      .select('*').eq('user_id', supabaseUserId);
    if (error) { logPgErr('sync._pullUserPrefs', error); return 0; }
    if (!data?.length) return 0;
    // eslint-disable-next-line global-require
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    // F1 (audit SD-1): the pull applies the SAME exclusion filter as the push.
    // Device-bound keys (sync cursors/watermarks, the active-workout crash
    // snapshot, the timezone baseline) were pushed by older builds and still
    // exist as rows in the cloud for live users; with the push side no longer
    // refreshing them they are frozen-stale, and _pullUserPrefs runs LAST in
    // pullFromCloud — an unfiltered multiSet would overwrite the watermarks
    // the pull just set (silently skipping unpushed rows) and could resurrect
    // another device's dead workout snapshot.
    const rows = data.filter(r => shouldSyncPref(r?.key ?? ''));
    // Campaign 1 P0-8 D10/D11: the guarded families (manual landmarks,
    // calm mode) are filtered here, BEFORE the multiSet, so a stale
    // device can never silently discard a manual override or turn calm
    // mode back off.
    const kept = await filterGuardedPulledPrefs(AsyncStorage, rows);
    // C14 job 2: a tombstone row DELETES the key locally, it does not write
    // an empty string. There is no pref-delete RPC, so an empty value has
    // always been the "no value" sentinel (the landmark reset has written it
    // since Campaign 1). Writing '' back only worked for readers that treat
    // a falsy stored value as absent; removing the key is what the deleting
    // device actually did, so every reader now sees the same state either
    // way and the delete cannot be half-applied.
    const entries = [];
    const tombstoned = [];
    for (const r of kept) {
      const value = r.value == null ? '' : String(r.value);
      if (value === '') tombstoned.push(r.key);
      else entries.push([r.key, value]);
    }
    if (!entries.length && !tombstoned.length) return 0;
    if (entries.length) { try { await AsyncStorage.multiSet(entries); } catch (_) {} }
    if (tombstoned.length) { try { await AsyncStorage.multiRemove(tombstoned); } catch (_) {} }
    // Finding 5: an applied guarded value carries its cloud edit time into
    // THIS device's stamp, so when this device later bulk-pushes the value
    // it ships the honest provenance rather than re-laundering it as new.
    try {
      const stampEntries = kept
        .filter(r => isGuardedPref(r.key))
        .map(r => {
          const ms = timeToMs(r.updated_at);
          return Number.isFinite(ms) && ms > 0
            ? [PREF_WRITE_STAMP_PREFIX + r.key, String(ms)] : null;
        })
        .filter(Boolean);
      if (stampEntries.length) await AsyncStorage.multiSet(stampEntries);
    } catch (_) { /* best-effort: the pull guard fails closed without it */ }
    return entries.length + tombstoned.length;
  } catch (e) { logWarn('sync._pullUserPrefs', e?.message); return 0; }
}

// ─── Per-table pull helpers ───────────────────────────────────────────────
// Each helper returns the number of rows it inserted so the orchestrator
// can emit a single verbose log line showing exactly what came back from
// the cloud. Errors are logged but never thrown, one missing table
// shouldn't take down the rest of the restore.

async function _pullProgrammes(sb, supabaseUserId) {
  try {
    const wm = await getPullWatermark(supabaseUserId, 'programmes');
    // C6 T-13 (D97-24) + RC6-7 (D97-25): the pull now pages with
    // fetchAllRows (offset pagination within ONE cycle), the audit's
    // original direction. The interim order+cap route left two holes
    // Review C proved: rows sharing one updated_at at the cap boundary
    // were skipped for ever (the watermark could not advance past
    // them), and a large restore stayed partial across cycles. Offset
    // pagination has neither; a mid-pagination error throws so the
    // outer catch holds the watermark and the next pull retries.
    const data = await fetchAllRows(
      'sync._pullProgrammes',
      () => {
        let q = sb.from('programmes').select('*').eq('user_id', supabaseUserId).is('deleted_at', null)
          .order('updated_at', { ascending: true });
        if (wm > 0) q = q.gte('updated_at', isoFromMs(wm));
        return q;
      },
    );
    let n = 0;
    let failures = 0;
    let firstErr = null;
    for (const p of data ?? []) {
      try {
        await insertProgrammeFromCloud(supabaseUserId, p);
        // folder_id (plan_folders, migration 089): insertProgrammeFromCloud is
        // INSERT OR IGNORE and does not carry folder_id, so file the plan into
        // its folder explicitly. setPlanFolder reuses the same UPDATE the My
        // Plans UI uses; null/undefined leaves the plan unfiled.
        if (Object.prototype.hasOwnProperty.call(p, 'folder_id')) {
          await setPlanFolder(p.id, p.folder_id ?? null);
        }
        n++;
      }
      catch (e) { failures++; if (!firstErr) firstErr = e?.message; }
    }
    if (failures > 0) {
      logWarn('sync._pullProgrammes', `${failures} programme insert(s) failed`, { firstError: firstErr });
    }
    if (failures === 0) await setPullWatermark(supabaseUserId, 'programmes', nextWatermark(wm, data ?? []));
    return n;
  } catch (e) { logWarn('sync._pullProgrammes', e?.message); return 0; }
}

async function _pullRoutinesAndExercises(sb, supabaseUserId) {
  try {
    const wm = await getPullWatermark(supabaseUserId, 'routines');
    const routines = await fetchAllRows(
      'sync._pullRoutines',
      () => {
        let q = sb.from('routines').select('*').eq('user_id', supabaseUserId).is('deleted_at', null);
        if (wm > 0) q = q.gte('updated_at', isoFromMs(wm));
        return q;
      },
    );
    let n = 0;
    let routineFailures = 0;
    let firstRoutineErr = null;
    for (const r of routines ?? []) {
      try { await insertRoutineFromCloud(supabaseUserId, r); n++; }
      catch (e) { routineFailures++; if (!firstRoutineErr) firstRoutineErr = e?.message; }
    }
    if (routineFailures > 0) {
      logWarn('sync._pullRoutines', `${routineFailures} routine insert(s) failed`, { firstError: firstRoutineErr });
    }
    const routineIds = (routines ?? []).map(r => r.id);
    let reFailures = 0;
    if (routineIds.length > 0) {
      const reRows = await fetchByIdsChunked(
        'sync._pullRoutineExercises', 'routine_exercises', 'routine_id', routineIds,
      );
      let firstReErr = null;
      for (const re of reRows ?? []) {
        try { await insertRoutineExerciseFromCloud(re); }
        catch (e) { reFailures++; if (!firstReErr) firstReErr = e?.message; }
      }
      if (reFailures > 0) {
        logWarn('sync._pullRoutineExercises', `${reFailures} routine_exercise insert(s) failed`, { firstError: firstReErr });
      }
    }
    // Advance only on a clean pass. Children are fetched for the routines
    // we pulled, so a changed routine re-pulls its exercises with it.
    if (routineFailures === 0 && reFailures === 0) {
      await setPullWatermark(supabaseUserId, 'routines', nextWatermark(wm, routines ?? []));
    }
    return n;
  } catch (e) { logWarn('sync._pullRoutinesAndExercises', e?.message); return 0; }
}

async function _pullMesocycles(sb, supabaseUserId) {
  try {
    const wm = await getPullWatermark(supabaseUserId, 'mesocycles');
    // C6 T-13 (D97-24) + RC6-7 (D97-25): the pull now pages with
    // fetchAllRows (offset pagination within ONE cycle), the audit's
    // original direction. The interim order+cap route left two holes
    // Review C proved: rows sharing one updated_at at the cap boundary
    // were skipped for ever (the watermark could not advance past
    // them), and a large restore stayed partial across cycles. Offset
    // pagination has neither; a mid-pagination error throws so the
    // outer catch holds the watermark and the next pull retries.
    const mesos = await fetchAllRows(
      'sync._pullMesocycles',
      () => {
        let mq = sb.from('mesocycles').select('*').eq('user_id', supabaseUserId).is('deleted_at', null)
          .order('updated_at', { ascending: true });
        if (wm > 0) mq = mq.gte('updated_at', isoFromMs(wm));
        return mq;
      },
    );
    let n = 0;
    let mesoFailures = 0;
    for (const m of mesos ?? []) {
      try { await insertMesocycleFromCloud(supabaseUserId, m); n++; }
      catch (e) { mesoFailures++; logWarn('sync._pullMesocycles', 'insert failed', { id: m?.id, error: e?.message }); }
    }
    const mesoIds = (mesos ?? []).map(m => m.id);
    let weekFailures = 0;
    if (mesoIds.length > 0) {
      const weeks = await fetchByIdsChunked(
        'sync._pullMesocycleWeeks', 'mesocycle_weeks', 'mesocycle_id', mesoIds,
      );
      for (const w of weeks) {
        try { await insertMesocycleWeekFromCloud(w); }
        catch (e) { weekFailures++; logWarn('sync._pullMesocycleWeeks', 'insert failed', { id: w?.id, error: e?.message }); }
      }
    }
    if (mesoFailures === 0 && weekFailures === 0) {
      await setPullWatermark(supabaseUserId, 'mesocycles', nextWatermark(wm, mesos ?? []));
    }
    return n;
  } catch (e) { logWarn('sync._pullMesocycles', e?.message); return 0; }
}

async function _pullSessionResolutions(sb, supabaseUserId) {
  try {
    const data = await fetchAllRows(
      'sync._pullSessionResolutions',
      () => sb.from('session_resolutions').select('*').eq('user_id', supabaseUserId).is('deleted_at', null),
    );
    if (!data?.length) return 0;
    // eslint-disable-next-line global-require
    const { insertOrUpdateSessionResolutionFromCloud } = require('./database');
    let n = 0;
    for (const row of data) {
      try { await insertOrUpdateSessionResolutionFromCloud(supabaseUserId, row); n++; }
      catch (e) { logWarn('sync._pullSessionResolutions', 'insert failed', { id: row?.id, error: e?.message }); }
    }
    return n;
  } catch (e) { logWarn('sync._pullSessionResolutions', e?.message); return 0; }
}

async function _pullMorningWeights(sb, supabaseUserId) {
  try {
    const wm = await getPullWatermark(supabaseUserId, 'morning_weights');
    const data = await fetchAllRows(
      'sync._pullMorningWeights',
      () => {
        let q = sb.from('morning_weights').select('*').eq('user_id', supabaseUserId).is('deleted_at', null);
        if (wm > 0) q = q.gte('updated_at', isoFromMs(wm));
        return q;
      },
    );
    let n = 0;
    let failures = 0;
    for (const w of data ?? []) {
      try { await insertMorningWeightFromCloud(supabaseUserId, w); n++; }
      catch (e) { failures++; logWarn('sync._pullMorningWeights', 'insert failed', { id: w.id, error: e?.message }); }
    }
    if (failures === 0) await setPullWatermark(supabaseUserId, 'morning_weights', nextWatermark(wm, data ?? []));
    return n;
  } catch (e) { logWarn('sync._pullMorningWeights', e?.message); return 0; }
}

async function _pullCoachOutputs(sb, supabaseUserId) {
  try {
    const wm = await getPullWatermark(supabaseUserId, 'coach_outputs');
    // C6 T-13 (D97-24) + RC6-7 (D97-25): the pull now pages with
    // fetchAllRows (offset pagination within ONE cycle), the audit's
    // original direction. The interim order+cap route left two holes
    // Review C proved: rows sharing one updated_at at the cap boundary
    // were skipped for ever (the watermark could not advance past
    // them), and a large restore stayed partial across cycles. Offset
    // pagination has neither; a mid-pagination error throws so the
    // outer catch holds the watermark and the next pull retries.
    const data = await fetchAllRows(
      'sync._pullCoachOutputs',
      () => {
        let q = sb.from('coach_outputs').select('*').eq('user_id', supabaseUserId).is('deleted_at', null)
          .order('updated_at', { ascending: true });
        if (wm > 0) q = q.gte('updated_at', isoFromMs(wm));
        return q;
      },
    );
    let n = 0;
    let failures = 0;
    for (const co of data ?? []) {
      try { await insertCoachOutputFromCloud(supabaseUserId, co); n++; }
      catch (e) { failures++; logWarn('sync._pullCoachOutputs', 'insert failed', { id: co.id, error: e?.message }); }
    }
    if (failures === 0) await setPullWatermark(supabaseUserId, 'coach_outputs', nextWatermark(wm, data ?? []));
    return n;
  } catch (e) { logWarn('sync._pullCoachOutputs', e?.message); return 0; }
}


// Public-facing push for nutrition targets. Call this any time
// saveNutritionTargets is invoked so the cloud copy stays in step
// with the local one. Safe no-op when there's no cloud session.
// Delegates to the registry-driven transport so the on-save path
// and the periodic sync path use the same code; tests cover the
// transport handler in src/lib/sync/__tests__/sync.transport.test.js.
export async function syncNutritionTargets(supabaseUserId, localUserId) {
  if (!supabaseUserId) return;
  // Re-triage 2026-08-01: covered wholesale by the next good syncAll (the
  // registry pushes nutrition_targets), so a dead session defers quietly.
  if (await _blockedByDeadSession('sync.syncNutritionTargets')) return;
  // eslint-disable-next-line global-require
  const { pushTable } = require('./sync/transport');
  await pushTable('nutrition_targets', {
    userId: supabaseUserId,
    localUserId: localUserId ?? supabaseUserId,
  });
}

// ─── Public sync surface (re-exports from src/lib/sync/) ─────────────────
//
// Callers like App.js + SyncStatusBadge import from '../lib/sync', which
// under Node's CommonJS resolver picks this file (sync.js) over the
// sibling sync/ directory. The spec'd public API (syncAll / syncTable /
// getStatus) lives in src/lib/sync/index.js. Without these re-exports
// the App.js trigger wiring + SyncStatusBadge import silently get
// `undefined` and the calls become no-ops.
//
// Codex re-audit 2026-05-26 F5: this bug was silently introduced by
// commit 5235bb1 (sync triggers) because the test that "verified" it
// imports from '../runner' directly and the App.js source-grep guard
// only asserts the source text contains callSyncAll, not that the
// import resolves to a real function. The new test at
// src/lib/sync/__tests__/sync.publicApi.test.js requires through the
// same path App.js uses and asserts every re-exported member is a
// function.
export {
  syncAll,
  syncTable,
  getStatus,
  SYNC_REGISTRY,
  getRegistryEntry,
  listSyncableTables,
  listBidirectionalTables,
  listPullOnlyTables,
  resolveConflict,
  trackSyncRun,
  trackSyncConflictResolved,
} from './sync/index';
