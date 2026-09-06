import * as SQLite from 'expo-sqlite';
import { generateInsights } from './insightsEngine';
import { calculate1RM, allocateExerciseVolume, isE1rmEligibleRow } from './algorithms';
import { pickBestLift } from './bestLift';
import { logError, logWarn } from './errorLog';
import { localDayKey, localWeekStartMs, localWeekEndMs } from './dayKey';
import { openEncryptedDb } from './dbCrypto';
import { guardSqliteConnection } from './sqliteBoundary';
import { recoverInterruptedSnapshotRestore } from './dbSnapshot';
import { weekWindowsEndingAt as buildWeekWindowsEndingAt } from './weekWindows';
import { createActivityRepository } from './database/activity';
import { createBodyMetricsRepository } from './database/bodyMetrics';
import { createPlanFoldersRepository } from './database/planFolders';
import { MICRO_COLUMNS, microColumnsCreateFragment } from './food/micronutrients';
import { getCurrentBlockWeekIndex, getBlockStatus, BLOCK_PLANNED_WEEKS, BLOCK_DELOAD_WEEK } from './mesocycle';
import { resolveRecoveryState } from './recoveryState';
import { compareSessionResolutionVersions } from './blockProgression';
import { compareEffectiveMaintenanceVersions, isValidEffectiveMaintenanceMemo } from './effectiveMaintenance';

export function weekWindowsEndingAt(anchorMs, weeksBack = 4) {
  return buildWeekWindowsEndingAt(anchorMs, weeksBack);
}

let _db = null;
let _initPromise = null;
// Whether the local DB is actually SQLCipher-encrypted. null = not yet opened,
// false = opened on the safe plaintext fallback (audit F-002: surface this so it
// isn't invisible while the consent screen claims encrypted local storage).
let _dbEncrypted = null;

/** Current local DB encryption state: true (encrypted), false (plaintext
 *  fallback), or null (DB not opened yet). Read by privacy/consent surfaces. */
export function isLocalDbEncrypted() {
  return _dbEncrypted;
}

export async function closeDatabaseHandle(handle) {
  if (!handle) return;
  const rows = await handle.getAllAsync('PRAGMA wal_checkpoint(TRUNCATE);');
  const checkpoint = rows?.[0];
  if (checkpoint && Number(checkpoint.busy ?? 0) !== 0) {
    throw new Error('database WAL checkpoint remained busy');
  }
  await handle.closeAsync();
}

/**
 * Flush the WAL into the main DB file so a byte-for-byte file copy (a snapshot)
 * is complete. In WAL mode recent commits can sit in volyume.db-wal until
 * checkpointed (audit F-003). Best-effort and never throws; a no-op if the DB
 * isn't open yet.
 */
export async function checkpointWal() {
  if (!_db) return;
  try { await _db.execAsync('PRAGMA wal_checkpoint(FULL);'); } catch (_) { /* best-effort */ }
}

// Fire a debounced full cloud sync after a local write. Lazy-required
// to avoid the circular import (sync.js → database.js → sync.js).
// Every mutating write function below calls this AFTER its local
// SQLite mutation succeeds so rapid edits coalesce into one push
// within ~2 seconds.
function _scheduleSync() {
  try {
    // eslint-disable-next-line global-require
    require('./sync').scheduleSync();
  } catch (_) { /* sync module unavailable, tolerate */ }
}

export function uid() {
  // UUID v4, required so rows sync cleanly to Supabase, whose primary-key
  // columns are typed UUID. The previous compact format (timestamp + random
  // suffix) silently FK-failed on every Supabase upsert.
  // Math.random is fine here; ids are not security-sensitive.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// C6 T-8 (D97-24): the callback-regex conversion ran per column per row
// on ten surfaces (Home readiness, workout summary, the notification
// handler...) and measured 106ms over a year of set rows, 530ms over
// five. Column names are a tiny closed set, so the conversion is
// memoised once per distinct key - measured 4.8x on the same rows,
// byte-identical output.
const _camelKeyCache = new Map();
function _camelKey(key) {
  let camel = _camelKeyCache.get(key);
  if (camel === undefined) {
    camel = key.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
    _camelKeyCache.set(key, camel);
  }
  return camel;
}

function rowToCamel(row) {
  if (!row) return null;
  const result = {};
  for (const [key, value] of Object.entries(row)) {
    const camelKey = _camelKey(key);
    if ((key === 'secondary_muscles' || key === 'aliases') && typeof value === 'string') {
      try { result[camelKey] = JSON.parse(value); } catch { result[camelKey] = []; }
    } else {
      result[camelKey] = value;
    }
  }
  return result;
}

const bodyMetricsRepository = createBodyMetricsRepository({
  db,
  uid,
  rowToCamel,
  scheduleSync: _scheduleSync,
  // X3 write-through (founder GO 2026-08-06): function declarations hoist,
  // so passing the reference here is safe even though logMorningWeight is
  // defined further down this file.
  logMorningWeight: (userId, args) => logMorningWeight(userId, args),
});

const activityRepository = createActivityRepository({
  db,
  uid,
  rowToCamel,
  scheduleSync: _scheduleSync,
  dayKey: localDayKey,
});

const planFoldersRepository = createPlanFoldersRepository({
  db,
  uid,
  rowToCamel,
  runInTransaction,
  scheduleSync: _scheduleSync,
});

// COMP-009: close the SQLite handle and reset init state so the file can be
// safely overwritten (snapshot restore) and reopened on the next db() call /
// app relaunch. Restoring a snapshot over a live, open handle risks corruption,
// so the restore flow closes first. Best-effort: a close error still clears the
// in-memory handle.
export async function closeDatabase() {
  const handle = _db;
  if (!handle) return;

  // Snapshot restore is the only caller and it will mutate the database file.
  // A failed/busy checkpoint or close means the live file is not a complete,
  // quiescent rollback source, so propagate and leave the handle published.
  await closeDatabaseHandle(handle);
  _db = null;
  _initPromise = null;
}

export function initDatabase() {
  // Gate on the in-flight init FIRST (audit 2026-07-01 race): _db is now only
  // set once _doInit has finished all schema + migrations, so while init is
  // running _db is still null and _initPromise is the only handle — returning it
  // makes concurrent callers await a fully-ready DB instead of a half-open one.
  if (_initPromise) return _initPromise;
  if (_db) return Promise.resolve(_db);
  _initPromise = _doInit().catch(e => {
    // Clear state so a retry attempt re-runs init instead of returning
    // a half-open handle. SQLite.openDatabaseAsync sets _db before
    // schema work completes; without this reset the next caller would
    // get a database where some tables were never created.
    _db = null;
    _initPromise = null;
    throw e;
  });
  return _initPromise;
}

async function _doInit() {
  // A process may have died between the two atomic renames of snapshot
  // promotion. Repair from the durable restore journal before any SQLite open
  // can fabricate a new empty volyume.db at the missing live path.
  await recoverInterruptedSnapshotRestore();

  // F-004: open the DB SQLCipher-encrypted, migrating an existing plaintext DB
  // in place on first run. openEncryptedDb sets `PRAGMA key` as the first
  // statement and falls back to a working plaintext handle if encryption fails,
  // so the app never bricks or loses data. `PRAGMA key` MUST precede any other
  // statement, so this runs before `PRAGMA journal_mode`.
  const { db: rawOpened, encrypted } = await openEncryptedDb(SQLite);
  const opened = guardSqliteConnection(rawOpened);
  // Do NOT publish `_db` yet (audit 2026-07-01 race): all schema + migration
  // work below runs on the local `opened` handle, and `_db` is assigned only
  // AFTER everything completes (bottom of this function). Publishing early let a
  // concurrent db() caller receive a handle whose tables did not exist yet.
  // db()/initDatabase() gate on `_initPromise` so concurrent callers await this
  // whole function rather than reading a half-initialised `_db`.
  _dbEncrypted = !!encrypted;
  // F-002: a plaintext fallback is a real availability decision, but it must not
  // be silent — the consent screen tells users their data is in encrypted local
  // storage. Log it (non-sensitive) so the field state is visible; a surface can
  // read isLocalDbEncrypted() to keep privacy copy honest.
  if (!encrypted) {
    // eslint-disable-next-line global-require
    try { require('./errorLog').logWarn('database.plaintextFallback', 'local DB opened UNENCRYPTED (SQLCipher unavailable / migration fallback)', {}); } catch (_) {}
  }
  await opened.execAsync('PRAGMA journal_mode = WAL;');
  // R2-11 (production P0, build 2692, founder repro: "database is locked" at
  // plan build / sign-out wipe / set logging). expo-sqlite runs statements on
  // a parallel IO pool with no per-connection mutex, and only transaction
  // BLOCKS are queued app-side (_txTail) - a raw single-statement write that
  // collides with an open BEGIN got SQLITE_BUSY back INSTANTLY and surfaced
  // as a hard "database is locked" rejection. With one shared connection a
  // wait cannot deadlock, so a busy handler that retries through the
  // sub-second contention window is the correct behaviour. The deeper fix
  // (queueing ALL writes + the runInTransaction reentrancy flag) is queued
  // on the board; this line is what stops the user-facing failures.
  // 30s, up from 5s (Sentry VOLYUME-23/-25, founder repro 2026-07-13:
  // "database is locked" during Pro onboarding). The food seed and the
  // first plan build are legitimate long queued transactions that can hold
  // the write lock well past 5s on a first sign-in while the session-restore
  // sync pull writes concurrently; with one shared connection a longer wait
  // cannot deadlock, it just outlasts the window instead of erroring.
  await opened.execAsync('PRAGMA busy_timeout = 30000;');
  await opened.execAsync(`
    CREATE TABLE IF NOT EXISTS exercises (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      primary_muscle TEXT,
      secondary_muscles TEXT,
      equipment TEXT,
      movement_pattern TEXT,
      compound_isolation TEXT,
      default_rep_min INTEGER,
      default_rep_max INTEGER,
      fatigue_cost INTEGER,
      stimulus_to_fatigue_ratio INTEGER,
      subregion TEXT,
      is_custom INTEGER DEFAULT 0,
      notes TEXT,
      exercise_type TEXT DEFAULT 'weight_reps',
      created_at INTEGER,
      updated_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS workouts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      routine_id TEXT,
      mesocycle_id TEXT,
      started_at INTEGER,
      ended_at INTEGER,
      duration_minutes INTEGER,
      notes TEXT,
      session_difficulty INTEGER,
      overall_pump INTEGER,
      soreness_24h_before INTEGER,
      fatigue_level INTEGER,
      is_completed INTEGER DEFAULT 0,
      created_at INTEGER,
      updated_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS workout_sets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      workout_id TEXT NOT NULL,
      exercise_id TEXT NOT NULL,
      set_number INTEGER,
      set_type TEXT DEFAULT 'straight',
      target_reps_min INTEGER,
      target_reps_max INTEGER,
      actual_reps INTEGER,
      weight REAL,
      rir INTEGER,
      rpe REAL,
      failed INTEGER DEFAULT 0,
      notes TEXT,
      post_set_pump INTEGER,
      post_set_muscle_connection INTEGER,
      joint_discomfort INTEGER,
      is_amrap INTEGER DEFAULT 0,
      amrap_reps INTEGER,
      created_at INTEGER,
      updated_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS routines (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      split_type TEXT,
      is_active INTEGER DEFAULT 1,
      is_library INTEGER DEFAULT 0,
      is_sample INTEGER NOT NULL DEFAULT 0,
      source_routine_id TEXT,
      programme_id TEXT,
      created_at INTEGER,
      updated_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS programmes (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      name TEXT NOT NULL,
      description TEXT,
      is_library INTEGER DEFAULT 0,
      created_at INTEGER,
      updated_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS routine_exercises (
      id TEXT PRIMARY KEY,
      routine_id TEXT NOT NULL,
      exercise_id TEXT NOT NULL,
      order_in_routine INTEGER DEFAULT 0,
      recommended_sets INTEGER DEFAULT 3,
      recommended_reps_min INTEGER DEFAULT 6,
      recommended_reps_max INTEGER DEFAULT 12,
      notes TEXT,
      created_at INTEGER,
      updated_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS mesocycles (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      start_date TEXT,
      end_date TEXT,
      duration_weeks INTEGER,
      focus TEXT,
      goals TEXT,
      is_active INTEGER DEFAULT 1,
      deload_week INTEGER,
      auto_regulation_enabled INTEGER DEFAULT 1,
      created_at INTEGER,
      updated_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_workouts_user ON workouts(user_id);
    CREATE INDEX IF NOT EXISTS idx_workout_sets_workout ON workout_sets(workout_id);
    CREATE INDEX IF NOT EXISTS idx_workout_sets_exercise ON workout_sets(exercise_id, user_id);
    CREATE INDEX IF NOT EXISTS idx_routines_user ON routines(user_id);
    CREATE INDEX IF NOT EXISTS idx_routine_exercises_routine ON routine_exercises(routine_id);
    CREATE INDEX IF NOT EXISTS idx_mesocycles_user ON mesocycles(user_id);
  `);

  // Nutrition & body data tables (idempotent)
  await opened.execAsync(`
    CREATE TABLE IF NOT EXISTS nutrition_targets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      bmr REAL,
      tdee REAL,
      target_kcal REAL,
      protein_g REAL,
      carbs_g REAL,
      fat_g REAL,
      phase TEXT,
      bmr_method TEXT,
      activity_level TEXT,
      confidence TEXT,
      warnings TEXT,
      gdpr_consented INTEGER DEFAULT 0,
      created_at INTEGER,
      updated_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS effective_maintenance_memos (
      user_id TEXT PRIMARY KEY,
      cumulative_residual_kcal INTEGER NOT NULL,
      formula_prior_kcal_at_derivation INTEGER NOT NULL,
      effective_maintenance_kcal_at_derivation INTEGER NOT NULL,
      source TEXT NOT NULL,
      status TEXT NOT NULL,
      reason TEXT NOT NULL,
      algorithm_version INTEGER NOT NULL,
      as_of INTEGER NOT NULL,
      evidence_signature TEXT NOT NULL,
      food_days_logged INTEGER NOT NULL,
      weight_points INTEGER NOT NULL,
      bodyweight_kg REAL,
      goal_phase TEXT,
      activity_level TEXT,
      formula_method TEXT,
      formula_context_signature TEXT NOT NULL,
      large_divergence INTEGER NOT NULL DEFAULT 0,
      revalidation_started_at INTEGER,
      revalidation_context_signature TEXT,
      version_key TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS peak_week_plans (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      show_date TEXT,
      federation TEXT,
      current_bodyweight REAL,
      lean_estimate REAL,
      prep_carbs_per_kg REAL,
      prep_sodium_mg REAL,
      prep_water_l REAL,
      status TEXT DEFAULT 'active',
      created_at INTEGER,
      updated_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS body_metric_log (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      logged_at INTEGER,
      weight_kg REAL,
      body_fat_percent REAL,
      body_fat_source TEXT,
      waist_cm REAL,
      chest_cm REAL,
      hips_cm REAL,
      thigh_cm REAL,
      arm_cm REAL,
      shoulders_cm REAL,
      forearm_cm REAL,
      ham_cm REAL,
      calf_cm REAL,
      notes TEXT,
      created_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS user_insights (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      insight_key TEXT NOT NULL,
      type TEXT,
      severity INTEGER,
      copy TEXT,
      action_payload TEXT,
      generated_at INTEGER,
      dismissed_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS user_body_profile (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      sex TEXT,
      date_of_birth TEXT,
      height_cm REAL,
      experience_level TEXT,
      training_age_years REAL,
      primary_goal TEXT,
      gdpr_consented INTEGER DEFAULT 0,
      created_at INTEGER,
      updated_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_nutrition_user ON nutrition_targets(user_id);
    CREATE INDEX IF NOT EXISTS idx_effective_maintenance_updated ON effective_maintenance_memos(updated_at);
    CREATE INDEX IF NOT EXISTS idx_body_log_user ON body_metric_log(user_id, logged_at);
    CREATE INDEX IF NOT EXISTS idx_insights_user ON user_insights(user_id, dismissed_at, type);
  `);

  await runMigrations(opened);
  // Schema + migrations are complete: NOW publish the handle. A concurrent
  // db()/initDatabase() awaiting _initPromise resolves to a fully-ready DB.
  _db = opened;
  return _db;
}

// ─── Structured migration system ────────────────────────────────────────────
//
// Each entry in SCHEMA_MIGRATIONS is one schema version: an ordered list of
// SQL statements. The applied version is tracked in SQLite's own
// `PRAGMA user_version`, so every migration runs exactly once and future
// schema changes only need a new array entry appended here, existing user
// data is never wiped or re-migrated.
//
// IMPORTANT: never edit or reorder an existing migration once shipped. Only
// append new ones. To change the schema, add a new sub-array.
const SCHEMA_MIGRATIONS = [
  // v1, additive columns + the programmes table. These predate version
  // tracking, so on installs upgrading from the old swallow-all loop the
  // columns may already exist; "duplicate column" is tolerated below.
  [
    'ALTER TABLE routine_exercises ADD COLUMN starting_weight REAL',
    'ALTER TABLE routine_exercises ADD COLUMN rest_seconds INTEGER',
    'ALTER TABLE routine_exercises ADD COLUMN superset_group_id TEXT',
    'ALTER TABLE workouts ADD COLUMN last_activity_at INTEGER',
    'ALTER TABLE workouts ADD COLUMN active_elapsed_seconds INTEGER',
    'ALTER TABLE routines ADD COLUMN is_library INTEGER DEFAULT 0',
    'ALTER TABLE routines ADD COLUMN source_routine_id TEXT',
    'ALTER TABLE routines ADD COLUMN programme_id TEXT',
    `CREATE TABLE IF NOT EXISTS programmes (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      name TEXT NOT NULL,
      description TEXT,
      is_library INTEGER DEFAULT 0,
      created_at INTEGER,
      updated_at INTEGER
    )`,
    'ALTER TABLE programmes ADD COLUMN is_active INTEGER DEFAULT 0',
    'ALTER TABLE programmes ADD COLUMN next_workout_index INTEGER DEFAULT 0',
    'ALTER TABLE programmes ADD COLUMN tags TEXT',
    'ALTER TABLE programmes ADD COLUMN split_type TEXT',
    'ALTER TABLE programmes ADD COLUMN is_archived INTEGER DEFAULT 0',
    'ALTER TABLE routines ADD COLUMN is_template INTEGER DEFAULT 0',
    'ALTER TABLE workouts ADD COLUMN name TEXT',
    'ALTER TABLE workouts ADD COLUMN set_count INTEGER',
    'ALTER TABLE workouts ADD COLUMN total_volume REAL',
    'ALTER TABLE exercises ADD COLUMN subregion TEXT',
    'ALTER TABLE body_metric_log ADD COLUMN shoulders_cm REAL',
    'ALTER TABLE body_metric_log ADD COLUMN forearm_cm REAL',
    'ALTER TABLE body_metric_log ADD COLUMN ham_cm REAL',
    'ALTER TABLE body_metric_log ADD COLUMN calf_cm REAL',
    'ALTER TABLE workout_sets ADD COLUMN missed_reps INTEGER',
  ],
  // v2, remap exercises.primary_muscle from generic 'shoulders' to the
  // correct delt head. Idempotent: no-ops once rows are updated.
  [
    `UPDATE exercises SET primary_muscle = 'front_delts'
     WHERE primary_muscle = 'shoulders'
     AND (name LIKE '%Overhead Press%' OR name LIKE '%Military Press%'
       OR name LIKE '%Front Raise%' OR name LIKE '%Arnold%'
       OR name LIKE '%Seated Dumbbell Press%')`,
    `UPDATE exercises SET primary_muscle = 'side_delts'
     WHERE primary_muscle = 'shoulders'
     AND (name LIKE '%Lateral%' OR name LIKE '%Upright Row%'
       OR name LIKE '%Machine Shoulder Press%' OR name LIKE '%Shoulder Press%')`,
    `UPDATE exercises SET primary_muscle = 'rear_delts'
     WHERE primary_muscle = 'shoulders'
     AND (name LIKE '%Rear Delt%' OR name LIKE '%Face Pull%'
       OR name LIKE '%Y-Raise%' OR name LIKE '%Pec Deck%'
       OR name LIKE '%Rear%')`,
    `UPDATE exercises SET primary_muscle = 'side_delts'
     WHERE primary_muscle = 'shoulders'`,
  ],
  // v3, mesocycle week scaffold: week table, planned volume, adaptation events,
  // plus additive columns on mesocycles / workouts / exercises / workout_sets.
  [
    `ALTER TABLE mesocycles ADD COLUMN block_type TEXT DEFAULT 'offseason_hypertrophy'`,
    `ALTER TABLE mesocycles ADD COLUMN planned_weeks INTEGER DEFAULT 5`,
    `ALTER TABLE mesocycles ADD COLUMN deload_protocol TEXT DEFAULT 'rp_classic'`,
    `ALTER TABLE mesocycles ADD COLUMN rir_ladder TEXT DEFAULT '[3,2,1,0,4]'`,
    `ALTER TABLE mesocycles ADD COLUMN status TEXT DEFAULT 'active'`,
    `CREATE TABLE IF NOT EXISTS mesocycle_weeks (
      id TEXT PRIMARY KEY,
      mesocycle_id TEXT NOT NULL,
      week_index INTEGER NOT NULL,
      is_deload INTEGER NOT NULL DEFAULT 0,
      rir_target INTEGER NOT NULL,
      started_at INTEGER,
      completed_at INTEGER,
      notes TEXT,
      created_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS planned_muscle_volume (
      id TEXT PRIMARY KEY,
      mesocycle_week_id TEXT NOT NULL,
      muscle TEXT NOT NULL,
      planned_sets INTEGER NOT NULL,
      mev INTEGER NOT NULL,
      mav INTEGER NOT NULL,
      mrv INTEGER NOT NULL,
      source TEXT NOT NULL DEFAULT 'template',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS adaptation_events (
      id TEXT PRIMARY KEY,
      mesocycle_week_id TEXT NOT NULL,
      muscle TEXT,
      exercise_id TEXT,
      decision TEXT NOT NULL,
      delta INTEGER,
      reason_code TEXT NOT NULL,
      reason_text TEXT,
      signals_json TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`,
    `ALTER TABLE workouts ADD COLUMN mesocycle_week_id TEXT`,
    `ALTER TABLE exercises ADD COLUMN increment_kg REAL DEFAULT 2.5`,
    `ALTER TABLE exercises ADD COLUMN exercise_category TEXT DEFAULT 'compound'`,
    `ALTER TABLE workout_sets ADD COLUMN rir INTEGER`,
    `ALTER TABLE workout_sets ADD COLUMN rpe REAL`,
  ],
  // v4, add joint_discomfort to workouts so feedback is fully persisted
  [
    `ALTER TABLE workouts ADD COLUMN joint_discomfort INTEGER`,
  ],
  // v5, add difficulty to programmes so library filter chips work
  [
    'ALTER TABLE programmes ADD COLUMN difficulty INTEGER',
  ],
  // v6, Pro coaching tables: morning weights, weekly check-ins, coach outputs
  [
    `CREATE TABLE IF NOT EXISTS morning_weights (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      logged_at INTEGER NOT NULL,
      weight_kg REAL NOT NULL,
      notes TEXT,
      created_at INTEGER NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_morning_weights_user ON morning_weights(user_id, logged_at)`,
    `CREATE TABLE IF NOT EXISTS weekly_checkins (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      week_start INTEGER NOT NULL,
      energy_score INTEGER,
      soreness_score INTEGER,
      stress_score INTEGER,
      sleep_hours REAL,
      cals_adherence TEXT,
      steps_adherence TEXT,
      cycle_override INTEGER DEFAULT 0,
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_weekly_checkins_user ON weekly_checkins(user_id, week_start)`,
    `CREATE TABLE IF NOT EXISTS coach_outputs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      week_start INTEGER NOT NULL,
      goal_phase TEXT,
      volume_signal INTEGER,
      load_signal TEXT,
      recovery_flag TEXT,
      calorie_change INTEGER,
      steps_target INTEGER,
      cardio_prescription TEXT,
      why_this TEXT,
      output_json TEXT,
      applied INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_coach_outputs_user ON coach_outputs(user_id, week_start)`,
  ],
  // v7, add training performance and joint pain to weekly check-ins
  [
    'ALTER TABLE weekly_checkins ADD COLUMN training_performance TEXT',
    'ALTER TABLE weekly_checkins ADD COLUMN joint_pain INTEGER DEFAULT 0',
  ],
  // v8, wellbeing screening score on user body profile
  [
    'ALTER TABLE user_body_profile ADD COLUMN scoff_score INTEGER',
  ],
  // v9, pre-workout intent captured before each session
  [
    'ALTER TABLE workouts ADD COLUMN pre_workout_intent TEXT',
  ],
  // v10, muscle-specific soreness on weekly check-ins
  [
    'ALTER TABLE weekly_checkins ADD COLUMN sore_muscles TEXT',
  ],
  // v11, exercise user notes: persistent per-user per-exercise notes for machine settings, cues, etc.
  [
    `CREATE TABLE IF NOT EXISTS exercise_user_notes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    exercise_id TEXT NOT NULL,
    note TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(user_id, exercise_id)
  )`,
    `CREATE INDEX IF NOT EXISTS idx_exercise_notes_user ON exercise_user_notes(user_id, exercise_id)`,
  ],
  // v12, sleep quality field in weekly_checkins for post-session recovery tracking
  [
    'ALTER TABLE weekly_checkins ADD COLUMN sleep_quality INTEGER',
  ],
  // v13, proper boolean flag to identify sample/library routines, replacing the fragile [SAMPLE] name prefix
  [
    'ALTER TABLE routines ADD COLUMN is_sample INTEGER NOT NULL DEFAULT 0',
  ],
  // v14, between-session "next time" coaching notes
  [
    `CREATE TABLE IF NOT EXISTS workout_notes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      routine_id TEXT,
      exercise_id TEXT,
      note TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_after_uses INTEGER NOT NULL DEFAULT 1,
      shown_count INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE INDEX IF NOT EXISTS idx_workout_notes_user ON workout_notes(user_id, routine_id)`,
  ],
  // v15, exercise milestone goals: target weight + optional target date per exercise
  [
    `CREATE TABLE IF NOT EXISTS exercise_goals (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      exercise_id TEXT NOT NULL,
      target_weight REAL NOT NULL,
      target_date INTEGER,
      created_at INTEGER NOT NULL,
      achieved_at INTEGER,
      UNIQUE(user_id, exercise_id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_exercise_goals_user ON exercise_goals(user_id, exercise_id)`,
  ],

  // v16, pending sync ops queue. Mutations that fail to ship to the
  // cloud (offline, flaky connection, server hiccup) are enqueued here
  // and retried on app foreground / next sign-in. Without this, a
  // dropped sync was silent data loss until the user's next sign-in
  // cycle triggered a full bulkUploadLocalData catch-up.
  [
    `CREATE TABLE IF NOT EXISTS pending_sync_ops (
      id          TEXT PRIMARY KEY,
      op_type     TEXT NOT NULL,        -- 'workout' | 'body_metric' | 'morning_weight' | 'check_in'
      entity_id   TEXT NOT NULL,        -- the row id we're trying to sync
      user_id     TEXT NOT NULL,        -- supabase user.id
      payload     TEXT,                 -- JSON-serialised payload, optional (sync code can re-read from local SQLite by entity_id)
      created_at  INTEGER NOT NULL,
      retries     INTEGER NOT NULL DEFAULT 0,
      next_attempt_at INTEGER NOT NULL, -- ms epoch; queue drainer skips rows where now() < next_attempt_at
      last_error  TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_pending_sync_user_ready
      ON pending_sync_ops(user_id, next_attempt_at)`,
  ],
  // v17, columns that insertRoutineFromCloud + insertProgrammeFromCloud
  // had been INSERTing into for ages without ever being added to the
  // local schema. Every cross-device restore was failing every
  // routine and programme insert with "table routines has no column
  // named day_of_week" / "table programmes has no column named
  // source_programme_id". A user signing into a populated cloud
  // account came back to zero plans and zero routines because each
  // INSERT was rejected.
  [
    'ALTER TABLE routines ADD COLUMN day_of_week INTEGER',
    'ALTER TABLE programmes ADD COLUMN source_programme_id TEXT',
  ],
  // v18, backfill deterministic canonical exercise IDs.
  //
  // Canonical exercises had random uid() IDs minted at seed time, so
  // every install produced a different ID for the same exercise. That
  // meant a routine_exercises row pushed from device A with
  // exercise_id = X resolved on device B's INNER JOIN only if device
  // B's seed had produced the same random X, which it never did.
  //
  // From this version forward the seed uses canonicalExerciseId(name)
  // (a name hash) instead of uid(). This migration brings existing
  // installs up to the new scheme by recomputing the ID for every
  // is_custom=0 row and cascading the UPDATE through every reference.
  //
  // Run order matters: update the referencing tables first so the FK
  // never points at a stale id, then update exercises itself.
  [
    async (d) => {
      // eslint-disable-next-line global-require
      const { canonicalExerciseId } = require('./seedExercises');
      const rows = await d.getAllAsync(
        'SELECT id, name FROM exercises WHERE is_custom = 0',
      );
      for (const row of rows) {
        if (!row?.name) continue;
        const newId = canonicalExerciseId(row.name);
        if (newId === row.id) continue;
        await d.runAsync(
          'UPDATE routine_exercises SET exercise_id = ? WHERE exercise_id = ?',
          [newId, row.id],
        );
        await d.runAsync(
          'UPDATE workout_sets SET exercise_id = ? WHERE exercise_id = ?',
          [newId, row.id],
        );
        await d.runAsync(
          'UPDATE exercise_user_notes SET exercise_id = ? WHERE exercise_id = ?',
          [newId, row.id],
        );
        await d.runAsync(
          'UPDATE exercise_goals SET exercise_id = ? WHERE exercise_id = ?',
          [newId, row.id],
        ).catch(() => { /* table may not exist yet on older installs */ });
        // Update the exercise row last so the FK references stay
        // valid throughout the transaction.
        await d.runAsync(
          'UPDATE exercises SET id = ? WHERE id = ?',
          [newId, row.id],
        );
      }
    },
  ],
  // v19, universal sync columns + denormalised exercise_name.
  //
  // updated_at gives the sync layer a stable cursor for delta
  // queries ("give me everything modified since last sync"). Without
  // it, the previous bulk-upload / full-pull dance had to ship every
  // row on every sign-in, which got increasingly slow for power users
  // and silently dropped writes that happened between pull start and
  // local insert.
  //
  // deleted_at carries a soft-delete tombstone so a delete made on
  // device A propagates to device B as a deleted_at IS NOT NULL row
  // rather than getting resurrected by an in-flight push.
  //
  // exercise_name on routine_exercises and workout_sets denormalises
  // the exercise display name onto the row so a pull can recover
  // even when the cloud exercise_id no longer matches any local
  // exercise (the architectural bug that caused the 114-routines-
  // with-zero-exercises issue on the prior build).
  [
    'ALTER TABLE workouts ADD COLUMN updated_at_iso TEXT',
    'ALTER TABLE workouts ADD COLUMN deleted_at INTEGER',
    'ALTER TABLE workout_sets ADD COLUMN deleted_at INTEGER',
    'ALTER TABLE workout_sets ADD COLUMN exercise_name TEXT',
    'ALTER TABLE routines ADD COLUMN deleted_at INTEGER',
    'ALTER TABLE programmes ADD COLUMN deleted_at INTEGER',
    'ALTER TABLE routine_exercises ADD COLUMN updated_at INTEGER',
    'ALTER TABLE routine_exercises ADD COLUMN deleted_at INTEGER',
    'ALTER TABLE routine_exercises ADD COLUMN exercise_name TEXT',
    'ALTER TABLE mesocycles ADD COLUMN deleted_at INTEGER',
    'ALTER TABLE mesocycle_weeks ADD COLUMN deleted_at INTEGER',
    'ALTER TABLE mesocycle_weeks ADD COLUMN updated_at INTEGER',
    'ALTER TABLE nutrition_targets ADD COLUMN deleted_at INTEGER',
    'ALTER TABLE body_metric_log ADD COLUMN updated_at INTEGER',
    'ALTER TABLE body_metric_log ADD COLUMN deleted_at INTEGER',
    'ALTER TABLE morning_weights ADD COLUMN updated_at INTEGER',
    'ALTER TABLE morning_weights ADD COLUMN deleted_at INTEGER',
    'ALTER TABLE weekly_checkins ADD COLUMN updated_at INTEGER',
    'ALTER TABLE weekly_checkins ADD COLUMN deleted_at INTEGER',
    'ALTER TABLE coach_outputs ADD COLUMN updated_at INTEGER',
    'ALTER TABLE coach_outputs ADD COLUMN deleted_at INTEGER',
    'ALTER TABLE exercises ADD COLUMN updated_at_v2 INTEGER',
    'ALTER TABLE exercises ADD COLUMN deleted_at INTEGER',
    'ALTER TABLE user_body_profile ADD COLUMN deleted_at INTEGER',
    'ALTER TABLE user_insights ADD COLUMN updated_at INTEGER',
    'ALTER TABLE user_insights ADD COLUMN deleted_at INTEGER',
    'ALTER TABLE exercise_user_notes ADD COLUMN deleted_at INTEGER',
    'ALTER TABLE peak_week_plans ADD COLUMN deleted_at INTEGER',
    `CREATE TABLE IF NOT EXISTS workout_notes_v2 (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      workout_id TEXT NOT NULL,
      note TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER
    )`,
    `CREATE TABLE IF NOT EXISTS planned_muscle_volume_sync (
      id TEXT PRIMARY KEY,
      mesocycle_week_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      muscle TEXT NOT NULL,
      planned_sets INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER
    )`,
    `CREATE TABLE IF NOT EXISTS adaptation_events_sync (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      mesocycle_week_id TEXT,
      event_type TEXT NOT NULL,
      payload TEXT,
      recorded_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER
    )`,
    `CREATE TABLE IF NOT EXISTS sync_meta (
      table_name TEXT PRIMARY KEY,
      last_pull_at INTEGER,
      last_push_at INTEGER
    )`,
    // Backfill: populate exercise_name on every existing routine_exercise
    // and workout_set by joining against the local exercises table. This
    // is best-effort, rows whose exercise_id no longer resolves locally
    // (the broken-from-cloud rows) get NULL and will surface in the
    // self-healing UI on the next pull.
    `UPDATE routine_exercises SET exercise_name = (
      SELECT name FROM exercises WHERE exercises.id = routine_exercises.exercise_id
    ) WHERE exercise_name IS NULL`,
    `UPDATE workout_sets SET exercise_name = (
      SELECT name FROM exercises WHERE exercises.id = workout_sets.exercise_id
    ) WHERE exercise_name IS NULL`,
    // Index every per-table updated_at so delta pull can use an index
    // scan rather than a full-table scan on increasingly large
    // workout_sets / morning_weights tables.
    'CREATE INDEX IF NOT EXISTS idx_workout_sets_updated ON workout_sets(updated_at)',
    'CREATE INDEX IF NOT EXISTS idx_workouts_updated ON workouts(updated_at)',
    'CREATE INDEX IF NOT EXISTS idx_morning_weights_updated ON morning_weights(updated_at)',
    'CREATE INDEX IF NOT EXISTS idx_body_metric_log_updated ON body_metric_log(updated_at)',
    'CREATE INDEX IF NOT EXISTS idx_routine_exercises_updated ON routine_exercises(updated_at)',
  ],
  // v20, indexes on the sync-mirror tables introduced in v19. The
  // bulk getters (getAllWorkoutNotesForUser etc.) all scan by
  // user_id; without the index those scans degrade to full-table
  // sweeps as the row count grows. Cheap to add now while the
  // tables are still small for most users.
  [
    'CREATE INDEX IF NOT EXISTS idx_workout_notes_v2_user ON workout_notes_v2(user_id) WHERE deleted_at IS NULL',
    'CREATE INDEX IF NOT EXISTS idx_planned_muscle_volume_sync_user ON planned_muscle_volume_sync(user_id) WHERE deleted_at IS NULL',
    'CREATE INDEX IF NOT EXISTS idx_adaptation_events_sync_user ON adaptation_events_sync(user_id) WHERE deleted_at IS NULL',
    'CREATE INDEX IF NOT EXISTS idx_workout_notes_v2_user_updated ON workout_notes_v2(user_id, updated_at)',
    'CREATE INDEX IF NOT EXISTS idx_planned_muscle_volume_sync_user_updated ON planned_muscle_volume_sync(user_id, updated_at)',
    'CREATE INDEX IF NOT EXISTS idx_adaptation_events_sync_user_updated ON adaptation_events_sync(user_id, updated_at)',
  ],

  // v21, backfill mesocycles.end_date for rows that pre-date the fix
  // in activatePlanWithBlock. The cloud schema declares end_date NOT
  // NULL, so any pre-existing local block with a null end_date was
  // silently dropped by the push and never reached the user's other
  // devices.
  [
    async (d) => {
      const rows = await d.getAllAsync(
        'SELECT id, start_date, duration_weeks FROM mesocycles WHERE end_date IS NULL AND start_date IS NOT NULL',
      );
      for (const r of rows) {
        const weeks = r.duration_weeks || 6;
        const startMs = new Date(r.start_date).getTime();
        if (!Number.isFinite(startMs)) continue;
        const endDate = new Date(startMs + weeks * 7 * 24 * 60 * 60 * 1000)
          .toISOString().slice(0, 10);
        await d.runAsync(
          'UPDATE mesocycles SET end_date = ?, updated_at = ? WHERE id = ?',
          [endDate, Date.now(), r.id],
        );
      }
    },
  ],

  // v22, re-issue mesocycle_weeks IDs that pre-date the UUID fix.
  // Old rows used a composite key `mw_<mesocycleId>_<weekIndex>` which
  // the cloud's UUID column rejected on every push, leaving every
  // user's weekly progression unable to sync. This migration rewrites
  // each bad ID to a fresh UUID and updates the three tables that
  // reference it.
  [
    async (d) => {
      const bad = await d.getAllAsync(
        "SELECT id FROM mesocycle_weeks WHERE id LIKE 'mw\\_%' ESCAPE '\\'",
      );
      for (const row of bad) {
        const oldId = row.id;
        const newId = uid();
        await runInTransaction(d, async () => {
          await d.runAsync('UPDATE planned_muscle_volume      SET mesocycle_week_id = ? WHERE mesocycle_week_id = ?', [newId, oldId]);
          await d.runAsync('UPDATE planned_muscle_volume_sync SET mesocycle_week_id = ? WHERE mesocycle_week_id = ?', [newId, oldId]);
          await d.runAsync('UPDATE adaptation_events          SET mesocycle_week_id = ? WHERE mesocycle_week_id = ?', [newId, oldId]);
          await d.runAsync('UPDATE adaptation_events_sync     SET mesocycle_week_id = ? WHERE mesocycle_week_id = ?', [newId, oldId]);
          await d.runAsync('UPDATE workouts                   SET mesocycle_week_id = ? WHERE mesocycle_week_id = ?', [newId, oldId]);
          await d.runAsync('UPDATE mesocycle_weeks            SET id = ?, updated_at = ? WHERE id = ?', [newId, Date.now(), oldId]);
        });
      }
    },
  ],

  // v23, indexes that matter at scale. Every aggregate query
  // (analytics, history, weekly volume) filters by created_at; without
  // a btree index those queries scan the full workout_sets table.
  // Same for mesocycle_weeks.mesocycle_id which is the most common
  // join column in the plan + progress screens. SQLite ignores
  // CREATE INDEX IF NOT EXISTS gracefully so re-runs are cheap.
  [
    'CREATE INDEX IF NOT EXISTS idx_workout_sets_created_at ON workout_sets(created_at)',
    'CREATE INDEX IF NOT EXISTS idx_workout_sets_user_created ON workout_sets(user_id, created_at)',
    'CREATE INDEX IF NOT EXISTS idx_mesocycle_weeks_mesocycle ON mesocycle_weeks(mesocycle_id)',
    'CREATE INDEX IF NOT EXISTS idx_mesocycle_weeks_meso_index ON mesocycle_weeks(mesocycle_id, week_index)',
    'CREATE INDEX IF NOT EXISTS idx_planned_muscle_volume_week ON planned_muscle_volume(mesocycle_week_id)',
  ],
  // Food logging schema (Move #1, mirrors Supabase migrate_015_food_logging.sql).
  // SQLite types map: jsonb -> TEXT (JSON encoded), timestamptz -> INTEGER (ms since epoch),
  // numeric -> REAL, uuid -> TEXT. All user-owned data; sync registry handles push/pull.
  [
    `CREATE TABLE IF NOT EXISTS foods (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      source_id TEXT,
      barcode_ean TEXT,
      name TEXT NOT NULL,
      brand TEXT,
      serving_g REAL NOT NULL,
      serving_label TEXT,
      kcal_100g REAL NOT NULL,
      protein_100g REAL NOT NULL,
      carbs_100g REAL NOT NULL,
      fat_100g REAL NOT NULL,
      fibre_100g REAL,
      sodium_100g REAL,
      sugar_100g REAL,
      ${microColumnsCreateFragment()},
      verified INTEGER DEFAULT 0,
      fetched_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    'CREATE INDEX IF NOT EXISTS idx_foods_barcode ON foods(barcode_ean) WHERE barcode_ean IS NOT NULL',
    'CREATE INDEX IF NOT EXISTS idx_foods_name_lower ON foods(lower(name))',
    'CREATE UNIQUE INDEX IF NOT EXISTS uq_foods_source_source_id ON foods(source, source_id)',

    `CREATE TABLE IF NOT EXISTS custom_foods (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      brand TEXT,
      serving_g REAL NOT NULL,
      serving_label TEXT,
      kcal_100g REAL NOT NULL,
      protein_100g REAL NOT NULL,
      carbs_100g REAL NOT NULL,
      fat_100g REAL NOT NULL,
      fibre_100g REAL,
      sodium_100g REAL,
      sugar_100g REAL,
      ${microColumnsCreateFragment()},
      photo_url TEXT,
      notes TEXT,
      deleted_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    'CREATE INDEX IF NOT EXISTS idx_custom_foods_user_active ON custom_foods(user_id) WHERE deleted_at IS NULL',
    'CREATE INDEX IF NOT EXISTS idx_custom_foods_user_name ON custom_foods(user_id, lower(name))',

    `CREATE TABLE IF NOT EXISTS food_entries (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      entry_date TEXT NOT NULL,
      meal_slot TEXT NOT NULL,
      food_ref TEXT NOT NULL,
      quantity_g REAL NOT NULL,
      kcal REAL NOT NULL,
      protein_g REAL NOT NULL,
      carbs_g REAL NOT NULL,
      fat_g REAL NOT NULL,
      fibre_g REAL,
      logged_at INTEGER NOT NULL,
      deleted_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    'CREATE INDEX IF NOT EXISTS idx_food_entries_user_date_slot ON food_entries(user_id, entry_date, meal_slot) WHERE deleted_at IS NULL',
    'CREATE INDEX IF NOT EXISTS idx_food_entries_user_recent ON food_entries(user_id, logged_at) WHERE deleted_at IS NULL',

    `CREATE TABLE IF NOT EXISTS daily_intake_rollups (
      user_id TEXT NOT NULL,
      entry_date TEXT NOT NULL,
      kcal_total REAL NOT NULL DEFAULT 0,
      protein_g REAL NOT NULL DEFAULT 0,
      carbs_g REAL NOT NULL DEFAULT 0,
      fat_g REAL NOT NULL DEFAULT 0,
      fibre_g REAL,
      entries_count INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, entry_date)
    )`,

    `CREATE TABLE IF NOT EXISTS saved_meals (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      items_json TEXT NOT NULL,
      deleted_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    'CREATE INDEX IF NOT EXISTS idx_saved_meals_user_active ON saved_meals(user_id) WHERE deleted_at IS NULL',

    `CREATE TABLE IF NOT EXISTS recipes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      total_servings REAL NOT NULL,
      notes TEXT,
      deleted_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    'CREATE INDEX IF NOT EXISTS idx_recipes_user_active ON recipes(user_id) WHERE deleted_at IS NULL',

    `CREATE TABLE IF NOT EXISTS recipe_ingredients (
      id TEXT PRIMARY KEY,
      recipe_id TEXT NOT NULL,
      food_ref TEXT NOT NULL,
      quantity_g REAL NOT NULL,
      order_index INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    )`,
    'CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe ON recipe_ingredients(recipe_id)',

    `CREATE TABLE IF NOT EXISTS food_favourites (
      user_id TEXT NOT NULL,
      food_ref TEXT NOT NULL,
      last_used_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, food_ref)
    )`,

    `CREATE TABLE IF NOT EXISTS daily_water (
      user_id TEXT NOT NULL,
      entry_date TEXT NOT NULL,
      ml INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, entry_date)
    )`,
  ],
  // Coach output "applied" flag: insertCoachOutputFromCloud (the puller)
  // writes the column, but the v6 CREATE TABLE for coach_outputs never
  // included it. On installs that pre-date the CREATE TABLE update, every
  // pull cycle logs "table coach_outputs has no column named applied".
  // Additive ALTER is no-op for installs that already have the column.
  [
    'ALTER TABLE coach_outputs ADD COLUMN applied INTEGER DEFAULT 0',
  ],
  // Move #2: ED-pattern detection + goal lock + engine telemetry.
  // - ed_pattern_flags is the state machine: one open row per user
  //   while the flag is raised, cleared_at populated on clearance.
  // - goal_lock_advanced lives on user_body_profile and raises the
  //   detector threshold from 2 signals to 3 for users who picked
  //   physique_competition or advanced_recomp at onboarding AND
  //   declared prior experience managing aggressive cuts.
  // - engine_telemetry is the local mirror for Move #3 (cascade
  //   telemetry) -- written here so the SQLite layer owns both
  //   safety and instrumentation in the same migration block.
  [
    `CREATE TABLE IF NOT EXISTS ed_pattern_flags (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      flag_state TEXT NOT NULL,
      reason TEXT,
      signals_json TEXT,
      raised_at INTEGER NOT NULL,
      cleared_at INTEGER,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER
    )`,
    'CREATE INDEX IF NOT EXISTS idx_ed_pattern_flags_user ON ed_pattern_flags(user_id, raised_at)',
    'CREATE INDEX IF NOT EXISTS idx_ed_pattern_flags_open ON ed_pattern_flags(user_id, cleared_at)',
    // tier_history local mirror so the per-table pull in
    // src/lib/sync/tables/tierHistory.js has somewhere to land.
    // Server-authoritative + pull_only per SYNC_REGISTRY; rows
    // arrive via the upsert helper in this file.
    `CREATE TABLE IF NOT EXISTS tier_history (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      from_tier TEXT,
      to_tier TEXT,
      event_type TEXT,
      occurred_at INTEGER NOT NULL,
      payload_json TEXT,
      created_at INTEGER NOT NULL
    )`,
    'CREATE INDEX IF NOT EXISTS idx_tier_history_user ON tier_history(user_id, occurred_at)',
    'ALTER TABLE user_body_profile ADD COLUMN goal_lock_advanced INTEGER DEFAULT 0',
    'ALTER TABLE user_body_profile ADD COLUMN goal_lock_set_at INTEGER',
    `CREATE TABLE IF NOT EXISTS engine_telemetry (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      event TEXT NOT NULL,
      payload_json TEXT,
      occurred_at INTEGER NOT NULL,
      pushed_at INTEGER
    )`,
    'CREATE INDEX IF NOT EXISTS idx_engine_telemetry_user ON engine_telemetry(user_id, occurred_at)',
    'CREATE INDEX IF NOT EXISTS idx_engine_telemetry_pushed ON engine_telemetry(pushed_at)',
  ],
  // Identity + ownership locked design (docs/IDENTITY_AND_OWNERSHIP_LOCKED.md).
  // Mirror the cloud migration 018: child tables that join through a
  // parent's user_id need the column locally so the new composite-key
  // upserts work correctly. SQLite is more forgiving than Postgres so
  // we don't have to restructure PKs here: the local schema is wiped
  // on every sign-out under the locked design, so collisions across
  // accounts cannot happen locally by construction.
  //
  // For now we only ADD user_id columns + backfill from parents. The
  // sign-out wipe + sync code changes ship in parallel commits.
  [
    'ALTER TABLE routine_exercises ADD COLUMN user_id TEXT',
    // LOCKED-OK: one-shot backfill of the column just added above.
    // Not a runtime ownership mutation; rows get their user_id from
    // the parent routine. Runs once per install.
    `UPDATE routine_exercises SET user_id = (
      SELECT r.user_id FROM routines r WHERE r.id = routine_exercises.routine_id
    ) WHERE user_id IS NULL`,
    'CREATE INDEX IF NOT EXISTS idx_routine_exercises_user ON routine_exercises(user_id, routine_id)',

    'ALTER TABLE mesocycle_weeks ADD COLUMN user_id TEXT',
    // LOCKED-OK: same pattern as routine_exercises above.
    `UPDATE mesocycle_weeks SET user_id = (
      SELECT m.user_id FROM mesocycles m WHERE m.id = mesocycle_weeks.mesocycle_id
    ) WHERE user_id IS NULL`,
    'CREATE INDEX IF NOT EXISTS idx_mesocycle_weeks_user ON mesocycle_weeks(user_id, mesocycle_id)',
  ],
  // Custom exercises split (locked in IDENTITY_AND_OWNERSHIP_LOCKED.md).
  // Per-user exercise rows live in custom_exercises with composite PK
  // (user_id, id). The legacy exercises table stays library-only.
  [
    `CREATE TABLE IF NOT EXISTS custom_exercises (
      id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      primary_muscle TEXT,
      secondary_muscles TEXT,
      equipment TEXT,
      movement_pattern TEXT,
      compound_isolation TEXT,
      default_rep_min INTEGER,
      default_rep_max INTEGER,
      fatigue_cost INTEGER,
      stimulus_to_fatigue_ratio INTEGER,
      subregion TEXT,
      exercise_category TEXT,
      increment_kg REAL,
      notes TEXT,
      exercise_type TEXT DEFAULT 'weight_reps',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER,
      PRIMARY KEY (user_id, id)
    )`,
    'CREATE INDEX IF NOT EXISTS idx_custom_exercises_id ON custom_exercises(id)',
    'CREATE INDEX IF NOT EXISTS idx_custom_exercises_user_updated ON custom_exercises(user_id, updated_at)',
  ],
  // Food layer: mirror cloud migration 021. Add user_id to
  // recipe_ingredients (the one food child table that lacked it),
  // backfill from parent recipes. Composite PK at this layer would
  // require dropping + recreating the existing recipe_ingredients
  // table -- SQLite doesn't support ALTER ... DROP CONSTRAINT --
  // and we'd need to copy data through a temp table. Skipping that
  // for now since local SQLite doesn't enforce PK at the same
  // strictness as Postgres; the user_id column + index is enough
  // for the sync layer to operate correctly. Future migration
  // rebuilds the table properly when we have a clean window.
  [
    'ALTER TABLE recipe_ingredients ADD COLUMN user_id TEXT',
    // LOCKED-OK: one-shot backfill, same pattern as routine_exercises.
    `UPDATE recipe_ingredients SET user_id = (
      SELECT r.user_id FROM recipes r WHERE r.id = recipe_ingredients.recipe_id
    ) WHERE user_id IS NULL`,
    'CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_user ON recipe_ingredients(user_id, recipe_id)',
  ],
  // Move #1.5 phase 3: barcode persistence on custom_foods.
  // Closes the scan-miss -> save -> rescan loop: a barcode the
  // user entered manually now lives on the custom food, so the
  // next scan resolves locally instead of hitting OFF/USDA again.
  [
    'ALTER TABLE custom_foods ADD COLUMN barcode_ean TEXT',
    'CREATE INDEX IF NOT EXISTS idx_custom_foods_barcode ON custom_foods(barcode_ean) WHERE barcode_ean IS NOT NULL',
  ],
  // recipe_ingredients soft-delete + LWW columns. Closes the
  // gap flagged in 12808b3: the table was the only food child
  // without a deleted_at + updated_at, so cross-device deletes
  // and conflict resolution had no signals to operate on. With
  // these columns the registry's softDelete:true + LWW contract
  // is honourable. Cloud schema for these columns landed
  // founder-side. Idempotent on re-apply via the additive
  // migration error allow-list.
  [
    'ALTER TABLE recipe_ingredients ADD COLUMN deleted_at INTEGER',
    'ALTER TABLE recipe_ingredients ADD COLUMN updated_at INTEGER',
    // Backfill updated_at from created_at for existing rows so
    // the LWW comparison has something to chew on rather than
    // treating every legacy row as forever-stale.
    'UPDATE recipe_ingredients SET updated_at = created_at WHERE updated_at IS NULL',
    'CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_live ON recipe_ingredients(user_id, recipe_id) WHERE deleted_at IS NULL',
  ],
  // v?: food preferences = favourites + dislikes (same table, kind column).
  // Mirrors cloud migration 048. Default 'fav' keeps every legacy row
  // behaving exactly as before.
  [
    "ALTER TABLE food_favourites ADD COLUMN kind TEXT NOT NULL DEFAULT 'fav'",
  ],
  // Cardio adherence on weekly check-ins. Mirrors cloud migration 050.
  // HISTORICAL, RETAINED (note added 2026-08-10, Campaign 4 review; the
  // migration itself is unchanged and still runs). It was added as the
  // destination for the coach's confirm-then-apply cardio prescription
  // (GAP row 4): a prescription set userProfile.cardioPrescription, which
  // gated a "did you do the cardio?" question on the weekly check-in.
  // NONE of that loop exists any more - cardio logging and the cardio
  // prescription were removed under the founder boundary D92-1/D95. The
  // check-in asks no cardio question and WeeklyCheckInScreen deliberately
  // OMITS the key on save so stored answers are preserved, not cleared
  // (D95 H5). The column is kept for that retained history. Additive
  // + nullable so the frozen closed-test build is unaffected.
  [
    'ALTER TABLE weekly_checkins ADD COLUMN cardio_adherence TEXT',
  ],
  // food_frequents: local cache of the most-logged foods (GAP row 28,
  // Frequents tab). Server computes the top-20-over-30-days nightly
  // (cloud migration 051); the client pulls a snapshot via the
  // food_frequents_pull RPC when the tab is opened and renders from
  // this table. Derived/disposable data, so it sits outside the
  // food_sync_pull/push cycle. Additive: the frozen build never reads it.
  [
    `CREATE TABLE IF NOT EXISTS food_frequents (
      user_id TEXT NOT NULL,
      food_ref TEXT NOT NULL,
      log_count INTEGER NOT NULL DEFAULT 0,
      last_logged_at INTEGER,
      computed_at INTEGER,
      PRIMARY KEY (user_id, food_ref)
    )`,
  ],
  // Per-side reps for unilateral exercises (GAP row 20). When a set is
  // logged left/right, both counts are stored here and actual_reps holds
  // the lower side, so volume + PR + progression (all of which read
  // actual_reps) stay conservative with no engine change. Mirrors cloud
  // migration 054. Additive + nullable: the frozen build never writes
  // them and reads actual_reps as before.
  [
    'ALTER TABLE workout_sets ADD COLUMN left_reps INTEGER',
    'ALTER TABLE workout_sets ADD COLUMN right_reps INTEGER',
  ],
  // daily_steps: the activity store for the cardio/steps audit
  // (docs/audit/volyume-cardio-steps-audit-2026-05-30.md). One row per
  // local day, same per-day shape as daily_water. Holds the day's step
  // total so the manual step-logging path has somewhere to write with no
  // wearable, and so the coach's step target has real data to check
  // against. source records whether the figure was typed ('manual') or
  // filled from a health platform ('health') so an auto-fill and a manual
  // entry can be told apart. Last-write-wins on updated_at; mirrored to
  // cloud via the daily_steps registry entry (additive, cloud migration
  // 056). entry_date is the diary day key (toISOString slice), so a day's
  // steps and that day's food share a boundary on the Diary view.
  [
    `CREATE TABLE IF NOT EXISTS daily_steps (
      user_id TEXT NOT NULL,
      entry_date TEXT NOT NULL,
      steps INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'manual',
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, entry_date)
    )`,
  ],
  // cardio_log: one row per logged cardio session (audit
  // docs/audit/volyume-cardio-integration-2026-06-03). Unlike daily_steps
  // (one row per day) a day can hold several cardio sessions, so the PK is
  // (user_id, id) per the identity rule, with entry_date a regular indexed
  // column. activity_id references the in-code cardio library; activity_name
  // + met are snapshotted so the row is self-describing if the library later
  // changes. est_kcal is session FEEDBACK only and is never added to the
  // calorie target. updated_at drives last-write-wins; deleted_at gives a
  // soft delete so a delete syncs. Fully additive; the frozen build has no
  // writer or reader.
  [
    `CREATE TABLE IF NOT EXISTS cardio_log (
      user_id TEXT NOT NULL,
      id TEXT NOT NULL,
      entry_date TEXT NOT NULL,
      activity_id TEXT,
      activity_name TEXT NOT NULL,
      category TEXT,
      duration_min INTEGER NOT NULL DEFAULT 0,
      intensity TEXT NOT NULL DEFAULT 'moderate',
      met REAL,
      est_kcal INTEGER,
      recovery_impact TEXT,
      impact_type TEXT,
      distance REAL,
      avg_hr INTEGER,
      source TEXT NOT NULL DEFAULT 'manual',
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER,
      PRIMARY KEY (user_id, id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_cardio_log_user_date ON cardio_log(user_id, entry_date)`,
    `CREATE INDEX IF NOT EXISTS idx_cardio_log_user_updated ON cardio_log(user_id, updated_at)`,
  ],
  // Exercise-library schema expansion (docs/audit/volyume-exercise-audit-
  // 2026-05-30). The richer metadata that lets plan construction reason
  // about anatomical subregion, granular equipment, machine type, goal
  // alignment and difficulty. All additive; canonical exercises are seeded
  // locally so no server migration is needed. equipment_profiles is stored
  // as a JSON array string. See seedExercises.js for the populated values.
  [
    `ALTER TABLE exercises ADD COLUMN equipment_category TEXT`,
    `ALTER TABLE exercises ADD COLUMN machine_type TEXT`,
    `ALTER TABLE exercises ADD COLUMN force TEXT`,
    `ALTER TABLE exercises ADD COLUMN laterality TEXT`,
    `ALTER TABLE exercises ADD COLUMN difficulty INTEGER`,
    `ALTER TABLE exercises ADD COLUMN machine_ok INTEGER DEFAULT 0`,
    `ALTER TABLE exercises ADD COLUMN home_ok INTEGER DEFAULT 0`,
    `ALTER TABLE exercises ADD COLUMN cue TEXT`,
    `ALTER TABLE exercises ADD COLUMN equipment_profiles TEXT`,
  ],
  // Weekly steps average on the check-in. Mirrors cloud migration 058.
  // The persistent home for the week's steps figure the coach reads as a
  // secondary signal: when at least four days of daily_steps are registered
  // the check-in saves the auto average here; otherwise the user types a
  // single average on the check-in and that lands here. Additive + nullable,
  // so the frozen closed-test build is unaffected.
  // SUPERSEDED (Campaign 4, coherence-cleanup-2026-08-10): the auto-average
  // COLLECTION path described above is retired -- the shipped check-in
  // hard-writes stepsAvg: null, see weeklyCheckInCopy.guard.test.js. The
  // column itself stays live: weeklyCoach.js still reads checkin.stepsAvg
  // as a coach signal (currently always null from new check-ins under the
  // retired UI), the sync push/restore handlers and column map are
  // unchanged, and schema/wipe coverage is unaffected either way.
  [
    'ALTER TABLE weekly_checkins ADD COLUMN steps_avg INTEGER',
  ],
  // Corrective re-create of cardio_log. The original cardio_log block (above,
  // search "CREATE TABLE IF NOT EXISTS cardio_log") was added in the MIDDLE of
  // this array instead of appended. Installs that already sat at the array's
  // top version when the cardio build landed never reached the inserted index,
  // so runMigrations skipped it and the table was never created on those
  // devices: every cardio insert then failed with "no such table: cardio_log"
  // and sign-out's push-first sync errored on the same missing table, which
  // blocked sign-out. Reordering the original block is not allowed (shipped
  // migrations are append-only), so this fresh trailing migration creates the
  // table for any install already past the inserted index. Idempotent
  // (IF NOT EXISTS), so installs that did run the original block re-run this as
  // a no-op. See the cardio bug fix, 2026-06-03.
  [
    `CREATE TABLE IF NOT EXISTS cardio_log (
      user_id TEXT NOT NULL,
      id TEXT NOT NULL,
      entry_date TEXT NOT NULL,
      activity_id TEXT,
      activity_name TEXT NOT NULL,
      category TEXT,
      duration_min INTEGER NOT NULL DEFAULT 0,
      intensity TEXT NOT NULL DEFAULT 'moderate',
      met REAL,
      est_kcal INTEGER,
      recovery_impact TEXT,
      impact_type TEXT,
      distance REAL,
      avg_hr INTEGER,
      source TEXT NOT NULL DEFAULT 'manual',
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER,
      PRIMARY KEY (user_id, id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_cardio_log_user_date ON cardio_log(user_id, entry_date)`,
    `CREATE INDEX IF NOT EXISTS idx_cardio_log_user_updated ON cardio_log(user_id, updated_at)`,
  ],
  // Corrective re-apply of the exercise-library expansion. The SAME mid-array
  // insertion that skipped cardio_log (the original cardio_log block above) also
  // shifted the exercise-library expansion block (the 9 ALTER TABLE exercises
  // ADD COLUMN ... above) down by one index. An install that already sat at the
  // array's top version when the cardio build landed ran only the new final
  // index (steps_avg, a benign duplicate) and never reached the shifted
  // exercise-expansion block, so those 9 columns were never added. cardio_log
  // got a trailing corrective; this one did not, so upsertExercise / the
  // exercise backfill on those installs throws "table exercises has no column
  // named equipment_category". Reordering shipped migrations is not allowed, so
  // this fresh trailing migration re-applies the columns. Each ADD COLUMN is
  // duplicate-column-tolerant via isBenignMigrationError, so installs that did
  // run the original block re-run this as a no-op. See the migration-ordering
  // audit, 2026-06-03. Local-only: exercises are seeded locally, no cloud
  // counterpart.
  [
    `ALTER TABLE exercises ADD COLUMN equipment_category TEXT`,
    `ALTER TABLE exercises ADD COLUMN machine_type TEXT`,
    `ALTER TABLE exercises ADD COLUMN force TEXT`,
    `ALTER TABLE exercises ADD COLUMN laterality TEXT`,
    `ALTER TABLE exercises ADD COLUMN difficulty INTEGER`,
    `ALTER TABLE exercises ADD COLUMN machine_ok INTEGER DEFAULT 0`,
    `ALTER TABLE exercises ADD COLUMN home_ok INTEGER DEFAULT 0`,
    `ALTER TABLE exercises ADD COLUMN cue TEXT`,
    `ALTER TABLE exercises ADD COLUMN equipment_profiles TEXT`,
  ],
  // food_slot_recents: client-only memory of what's been logged to each meal
  // slot (COMP-002 "Add again" tab). One row per (user, slot, food) holding
  // how often and how much, so the picker's first tab shows this slot's
  // staples with the last-used portion pre-filled. Written on every food log,
  // never synced: derived/disposable data that rebuilds as the user logs, so
  // it sits outside the food_sync_pull/push cycle like food_frequents.
  [
    `CREATE TABLE IF NOT EXISTS food_slot_recents (
      user_id         TEXT NOT NULL,
      meal_slot       TEXT NOT NULL,
      food_ref        TEXT NOT NULL,
      log_count       INTEGER NOT NULL DEFAULT 1,
      last_logged_at  INTEGER NOT NULL,
      last_quantity_g REAL NOT NULL,
      PRIMARY KEY (user_id, meal_slot, food_ref)
    )`,
  ],
  // COMP-008 survey diet: pre-workout readiness capture. sleep_quality and
  // energy_score are captured on the pre-workout intent prompt and written to
  // the workout row at createWorkout time (soreness_24h_before already exists,
  // line 95, and is reused — no re-add). Both nullable: a Skip-started or
  // pre-COMP-008 session simply leaves them NULL, which every reader already
  // tolerates. Mirrors supabase/migrate_072_workouts_readiness_columns.sql;
  // additive + nullable, so the frozen old AAB that never writes them is
  // unaffected. Duplicate-column is tolerated by isBenignMigrationError.
  [
    'ALTER TABLE workouts ADD COLUMN sleep_quality INTEGER',
    'ALTER TABLE workouts ADD COLUMN energy_score INTEGER',
  ],
  // NEW-002 training partners. Retained for wipe completeness; feature
  // retired 2026-09-06 (SD-03). The tables stay because migrations are
  // additive and never dropped, and because the wipe paths must keep
  // clearing rows already on people's devices; nothing writes to them now
  // (the pair-scoped sync handler was deleted with the feature).
  // partner_blocks was a server-only write surface, never mirrored locally.
  [
    `CREATE TABLE IF NOT EXISTS partnerships (
      id             TEXT PRIMARY KEY NOT NULL,
      member_a       TEXT,
      member_b       TEXT,
      status         TEXT NOT NULL DEFAULT 'invited',
      streak_enabled INTEGER NOT NULL DEFAULT 1,
      created_at     INTEGER,
      accepted_at    INTEGER,
      ended_at       INTEGER,
      updated_at     INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS partner_week_signals (
      pair_id       TEXT NOT NULL,
      user_id       TEXT NOT NULL,
      week_start    TEXT NOT NULL,
      planned_count INTEGER NOT NULL DEFAULT 0,
      done_count    INTEGER NOT NULL DEFAULT 0,
      week_met      INTEGER NOT NULL DEFAULT 0,
      state         TEXT NOT NULL DEFAULT 'training',
      updated_at    INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (pair_id, user_id, week_start)
    )`,
    `CREATE TABLE IF NOT EXISTS partner_cheers (
      id         TEXT PRIMARY KEY NOT NULL,
      pair_id    TEXT NOT NULL,
      sender_id  TEXT NOT NULL,
      sent_on    TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT 0
    )`,
  ],
  // Generated meal plan (deep-audit Theme G). One active plan per user,
  // stored as JSON like saved_meals: the assembled day/week, the prefs and
  // engine-target snapshot it was built from (so coach edits + swaps can
  // re-solve), and the seed. Soft-deleted for sync parity.
  [
    `CREATE TABLE IF NOT EXISTS meal_plans (
      id          TEXT PRIMARY KEY NOT NULL,
      user_id     TEXT NOT NULL,
      plan_json   TEXT NOT NULL,
      is_active   INTEGER NOT NULL DEFAULT 1,
      deleted_at  INTEGER,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    )`,
    'CREATE INDEX IF NOT EXISTS idx_meal_plans_user_active ON meal_plans(user_id) WHERE deleted_at IS NULL AND is_active = 1',
  ],
  // Passive cardio import (ULTIMATE-CUX-PCI). ext_id holds the platform sample
  // id (HealthKit UUID / Health Connect record id) so re-running the import
  // never duplicates a session. Manual rows leave it NULL; the partial unique
  // index de-dups imported rows without constraining manual ones. Cloud parity:
  // supabase/migrate_087_cardio_log_ext_id.sql (apply separately, never from here).
  [
    'ALTER TABLE cardio_log ADD COLUMN ext_id TEXT',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_cardio_log_user_extid ON cardio_log(user_id, ext_id) WHERE ext_id IS NOT NULL',
  ],
  // Plan-vs-eaten separation (adherence model 2026-06-15): meal-plan entries are
  // written as scaffolding (is_planned=1) and EXCLUDED from the rollup,
  // adherence, the FFM floor and sync until the user confirms they ate them
  // (is_planned -> 0, which then syncs as a normal actual). Default 0 keeps every
  // existing and manually logged entry an actual. Local-only: planned rows never
  // leave the device, so no cloud migration is needed. Duplicate-column is
  // tolerated by isBenignMigrationError.
  [
    'ALTER TABLE food_entries ADD COLUMN is_planned INTEGER NOT NULL DEFAULT 0',
    'CREATE INDEX IF NOT EXISTS idx_food_entries_user_date_planned ON food_entries(user_id, entry_date, is_planned) WHERE deleted_at IS NULL',
  ],
  // Plan folders (Hevy teardown 02-routines-programs.md, R1 "Routine/plan
  // folders", P1). Organise the My Plans list (= programmes) into collapsible
  // folders. FREE feature, no Pro gate. Cloud parity:
  // supabase/migrate_089_plan_folders.sql. Timestamps are epoch ms (INTEGER) to
  // match the LWW sync contract; deleted_at carries a soft-delete tombstone for
  // sync parity. programmes.folder_id is nullable: deleting a folder UNFILES its
  // plans (folder_id -> NULL) and NEVER deletes a plan.
  [
    `CREATE TABLE IF NOT EXISTS plan_folders (
      id          TEXT PRIMARY KEY NOT NULL,
      user_id     TEXT NOT NULL,
      name        TEXT NOT NULL,
      sort_order  INTEGER NOT NULL DEFAULT 0,
      deleted_at  INTEGER,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    )`,
    'CREATE INDEX IF NOT EXISTS idx_plan_folders_user ON plan_folders(user_id, sort_order) WHERE deleted_at IS NULL',
    'ALTER TABLE programmes ADD COLUMN folder_id TEXT',
  ],
  // Food delete tombstones (Hevy teardown D1 #8). food_favourites and
  // daily_water had no deleted_at, so their deletes were device-local: removing
  // a favourite/water row never reached the cloud and re-pulled back from
  // another device. Add a soft-delete tombstone to both, matching the cloud
  // counterpart in supabase/migrate_090_food_delete_tombstones.sql. Deletes now
  // set deleted_at (see setFoodPreference / setWater) and normal reads exclude
  // tombstoned rows; the food sync slices carry a real `deleted` slice and apply
  // remote tombstones on pull. Additive + nullable: the frozen old AAB never
  // writes the column and reads as before. Duplicate-column is tolerated by
  // isBenignMigrationError.
  [
    'ALTER TABLE food_favourites ADD COLUMN deleted_at INTEGER',
    'ALTER TABLE daily_water ADD COLUMN deleted_at INTEGER',
  ],
  // Exercise TYPE axis (Hevy teardown 03-exercise-library.md, R3 "exerciseType",
  // P2). One logger handles reps-only / duration / distance / weighted-bodyweight
  // exercises, not only weight x reps. exercise_type drives which set-input
  // fields render; it does NOT change how a weight_reps row is stored or scored.
  // Default 'weight_reps' for every existing and new row keeps the weight x reps
  // path byte-identical. No new workout_sets columns: duration seconds reuse the
  // reps field and distance metres reuse the weight field (see SetEntry /
  // ActiveWorkoutScreen). Cloud parity: supabase/migrate_091_exercise_type.sql.
  // Additive + idempotent; duplicate-column is tolerated by isBenignMigrationError.
  [
    `ALTER TABLE exercises ADD COLUMN exercise_type TEXT DEFAULT 'weight_reps'`,
    `ALTER TABLE custom_exercises ADD COLUMN exercise_type TEXT DEFAULT 'weight_reps'`,
    `UPDATE exercises SET exercise_type = 'weight_reps' WHERE exercise_type IS NULL`,
    `UPDATE custom_exercises SET exercise_type = 'weight_reps' WHERE exercise_type IS NULL`,
  ],
  // E3 search (approved 2026-07-02): FTS5 name/brand index over foods +
  // custom_foods, replacing SQL LIKE as the local search's first attempt
  // (localCache.searchLocalByName; it falls back to LIKE if these tables are
  // absent). External-content tables: the index stores no food data of its
  // own and is FULLY reconstructible from the base tables at any time via
  // rebuildFoodSearchIndex(). Triggers keep it in step with every insert /
  // update / delete, including the bundled-snapshot seeding and library-delta
  // upserts. Additive and idempotent (IF NOT EXISTS throughout); wrapped in a
  // function op so a SQLite build without FTS5 skips the index entirely
  // instead of failing the migration chain — search then simply stays on
  // LIKE. FTS5 is compiled into the shipped SQLCipher build on both
  // platforms (verified 2026-07-02).
  [ensureFoodSearchIndex],
  // Wave 5 C5 A1: the pair-scoped shared training block (one row per pair;
  // block reference + display name + proposed|active — never plan content).
  // Local mirror of cloud migrate_100; the sync handler populates it and the
  // §5 purge paths (unpair, ended pair on pull, sign-out) clear it alongside
  // signals + cheers. Additive + idempotent.
  [
    `CREATE TABLE IF NOT EXISTS partner_shared_blocks (
      pair_id     TEXT PRIMARY KEY NOT NULL,
      block_ref   TEXT,
      block_name  TEXT NOT NULL,
      proposed_by TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'proposed',
      created_at  INTEGER,
      updated_at  INTEGER NOT NULL DEFAULT 0
    )`,
  ],
  // Partner STEP A milestone-moment booleans (brief Direction 1). Two derived
  // flags carried on the EXISTING weekly signal row: finished a block this week,
  // set a PB this week. Booleans only, never a number or content. Local mirror
  // of cloud migrate_102's additive columns; the sender's weekSignalWriter
  // derives them (forced false under the ED freeze), the pull applies them.
  // Plus the partner's real FIRST name (founder addition): the OTHER member's
  // server-snapshotted first name, mapped from the cloud row's
  // member_a/b_first_name at pull time, so every consumer's existing
  // pair.partnerFirstName read works with zero changes (legacy rows stay NULL
  // and the 'Your partner' fallback holds). First names only, never full names.
  // Additive + idempotent (duplicate-column is a benign migration error).
  [
    'ALTER TABLE partner_week_signals ADD COLUMN completed_block INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE partner_week_signals ADD COLUMN hit_pb INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE partnerships ADD COLUMN partner_first_name TEXT',
  ],
  // v54, progress-photo metadata (progress-photos upgrade B0). Purpose: give
  // each on-device progress photo an optional, editable metadata row keyed by
  // its existing `<epochMs>.jpg` filename — an editable "date taken", a
  // front/side/back pose, a bodyweight snapshot (nearest weigh-in to taken_at),
  // and a short note. A photo with no row still behaves exactly as today
  // (taken_at derived from the filename, pose/weight null), so this is fully
  // back-compatible with every existing photo.
  // Applied: LOCALLY only, once, via this user_version bump. There is NO cloud
  // counterpart — photos AND their metadata are device-local by constraint and
  // are deliberately NOT in SYNC_REGISTRY (they never leave the device).
  // Safe to re-run: yes (CREATE TABLE IF NOT EXISTS; a re-run is a benign no-op).
  // Rollback: DROP TABLE progress_photo_meta (data loss confined to this
  // on-device metadata; the photo files themselves are untouched).
  [
    `CREATE TABLE IF NOT EXISTS progress_photo_meta (
      name       TEXT PRIMARY KEY,
      taken_at   INTEGER NOT NULL,
      pose       TEXT,
      weight_kg  REAL,
      note       TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
  ],
  // Partners D5 (A + B1): the mutual weekly intention + the cheer acknowledgement
  // enum. Local mirrors of cloud migrate_105 / migrate_106.
  //   partner_weekly_intentions  one row per (pair, member, week_start): the
  //     member's integer weekly session aim against their OWN plan. Derived-safe
  //     (a small integer, never raw training data). Both members write only their
  //     OWN row; the pull mirrors both sides so the PairCard can show each own aim
  //     without comparison. Purged alongside signals/cheers on every §5 path
  //     (unpair, ended pair on pull, sign-out, wipe).
  //   partner_cheers.kind  the sender's chosen acknowledgement key (closed enum,
  //     never free text). Nullable + DEFAULT 'here' (the quiet line) so old rows
  //     and the pre-106 edge function read as the neutral acknowledgement.
  // Additive + idempotent (duplicate-column / already-exists are benign).
  [
    `CREATE TABLE IF NOT EXISTS partner_weekly_intentions (
      pair_id    TEXT NOT NULL,
      user_id    TEXT NOT NULL,
      week_start TEXT NOT NULL,
      weekly_aim INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER,
      updated_at INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (pair_id, user_id, week_start)
    )`,
    `ALTER TABLE partner_cheers ADD COLUMN kind TEXT DEFAULT 'here'`,
  ],
  // Partner win cards: explicit, user-approved, pair-scoped celebration cards.
  // Sanitized text only: no raw workout sets/reps/load, food, coach notes, body
  // metrics, raw photos, image files or scan internals. Revocation is a
  // timestamp so both devices can hide the card without losing audit context.
  [
    `CREATE TABLE IF NOT EXISTS partner_win_cards (
      id                 TEXT PRIMARY KEY NOT NULL,
      pair_id            TEXT NOT NULL,
      sender_id          TEXT NOT NULL,
      card_type          TEXT NOT NULL,
      title              TEXT NOT NULL,
      summary            TEXT NOT NULL,
      detail             TEXT NOT NULL,
      visible_to_partner TEXT NOT NULL,
      remains_private    TEXT NOT NULL,
      created_at         INTEGER NOT NULL,
      revoked_at         INTEGER,
      updated_at         INTEGER NOT NULL
    )`,
    'CREATE INDEX IF NOT EXISTS idx_partner_win_cards_pair ON partner_win_cards(pair_id, created_at)',
  ],
  // v56, Progress Scan foundation. Local-only, no cloud counterpart:
  //   1) rebuild progress_photo_meta as user-scoped so one account cannot read
  //      another account's photo metadata on a shared device;
  //   2) create scan-session tables for the flagship Progress Scan flow.
  // Raw photos, assets and analysis stay on-device and are deliberately NOT in
  // SYNC_REGISTRY.
  [
    migrateProgressPhotoMetaUserScope,
    `CREATE TABLE IF NOT EXISTS progress_scan_sessions (
      id                         TEXT PRIMARY KEY NOT NULL,
      user_id                    TEXT NOT NULL,
      captured_at                INTEGER NOT NULL,
      status                     TEXT NOT NULL DEFAULT 'draft',
      analysis_status            TEXT NOT NULL DEFAULT 'none',
      consent_version            TEXT,
      camera_facing              TEXT,
      timer_seconds              INTEGER NOT NULL DEFAULT 0,
      required_poses_complete    INTEGER NOT NULL DEFAULT 0,
      estimate_body_fat_percent  REAL,
      estimate_range_low         REAL,
      estimate_range_high        REAL,
      estimate_confidence        TEXT,
      estimate_source            TEXT,
      trend_direction            TEXT,
      trend_magnitude_pct_points REAL,
      quality_score              REAL,
      quality_label              TEXT,
      model_version              TEXT,
      estimator_version          TEXT,
      signals_json               TEXT,
      abstention_reasons_json    TEXT,
      bias_flags_json            TEXT,
      copy_summary               TEXT,
      created_at                 INTEGER NOT NULL,
      updated_at                 INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS progress_scan_assets (
      id                      TEXT PRIMARY KEY NOT NULL,
      scan_id                 TEXT NOT NULL,
      user_id                 TEXT NOT NULL,
      pose                    TEXT NOT NULL,
      photo_name              TEXT NOT NULL,
      uri                     TEXT NOT NULL,
      taken_at                INTEGER NOT NULL,
      quality_score           REAL,
      landmark_confidence     REAL,
      segmentation_confidence REAL,
      blur_score              REAL,
      lighting_score          REAL,
      framing_score           REAL,
      camera_tilt_degrees     REAL,
      created_at              INTEGER NOT NULL
    )`,
    'CREATE INDEX IF NOT EXISTS idx_progress_photo_meta_user_taken ON progress_photo_meta(user_id, taken_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_progress_scan_sessions_user_time ON progress_scan_sessions(user_id, captured_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_progress_scan_assets_scan ON progress_scan_assets(scan_id, pose)',
  ],
  // v57, Progress Scan v1 on-device model signals. Each asset may carry the
  // local TFLite mask-derived measurements used to finish the scan session.
  // Still local-only and deliberately absent from SYNC_REGISTRY.
  [
    'ALTER TABLE progress_scan_assets ADD COLUMN signals_json TEXT',
  ],
  // v58, MN-1 micronutrients (audit §15 item 2, founder-approved 2026-07-08).
  // Additive, nullable REAL per-100g columns on foods + custom_foods for the 27
  // UK-NRV vitamins/minerals in src/lib/food/micronutrients.js. Existing rows
  // keep NULL (rendered "unknown", never 0). Cloud counterpart: migrate_109
  // (founder-run). Duplicate-column errors are tolerated by the runner.
  MICRO_COLUMNS.flatMap((c) => [
    `ALTER TABLE foods ADD COLUMN ${c} REAL`,
    `ALTER TABLE custom_foods ADD COLUMN ${c} REAL`,
  ]),
  // v59, progress-photos quick-add fence (progress-photos audit, scoring
  // blueprint §4 "uniform pipeline rule", founder gate F2 = tag route).
  // Purpose: a persistent, permanent origin marker on progress_photo_meta so
  // quick-add photos (camera/library routes in ProgressPhotosScreen.pickFrom)
  // can never be treated as scored-comparison material. Existing rows default
  // to 0 (not quick-add), which is correct back-compat: every photo saved
  // before this migration went through a route that is not the quick-add
  // fence's concern, and the fence only ever needs to SET this flag going
  // forward from pickFrom. Applied: LOCALLY only, once, via this
  // user_version bump. No cloud counterpart: progress_photo_meta is
  // device-local and deliberately NOT in SYNC_REGISTRY (see v54/v56 notes).
  // Safe to re-run: yes (duplicate-column errors are tolerated by the runner).
  // Rollback: ALTER TABLE progress_photo_meta DROP COLUMN unscored (SQLite
  // 3.35+; data loss confined to this on-device flag, photo files and the
  // rest of the metadata row are untouched).
  [
    'ALTER TABLE progress_photo_meta ADD COLUMN unscored INTEGER NOT NULL DEFAULT 0',
  ],
  // v60, L05-NT1 (design-usability audit 2026-07-09, founder "keep going on
  // all" + D5): persist the nutrition goal key and protein-approach choice on
  // the nutrition_targets row itself. Previously these two fields lived only
  // in an AsyncStorage copy written alongside the same save, so the rich "Why
  // these targets" explanation (phase description, protein-approach label)
  // silently degraded to blanks/defaults on a new device once the DB row
  // synced without the local AsyncStorage copy. Additive, nullable TEXT
  // columns; existing rows keep NULL (screen already falls back to inverting
  // the phase label / hardcoded default when null, so this is pure
  // data-portability, not a behaviour change). Cloud counterpart: migrate_111
  // (founder-run). Duplicate-column errors are tolerated by the runner.
  [
    'ALTER TABLE nutrition_targets ADD COLUMN goal TEXT',
    'ALTER TABLE nutrition_targets ADD COLUMN protein_approach TEXT',
  ],
  // v61, day-level plan reorder (Ultimate-Audit decision-gated item, verified
  // unbuilt: routines had no position column, so a plan's days/workouts could
  // never be reordered independently of routine_exercises.order_in_routine,
  // which only orders exercises WITHIN a day). Additive, nullable INTEGER
  // column. Backfill assigns each existing routine its current display rank
  // (0-based, restarting at 0 per programme_id) so an upgrading install's
  // day order is preserved exactly as shown today, matching the
  // `ORDER BY created_at ASC` fallback every plan-routines query already
  // uses. Cloud counterpart: migrate_113 (founder-run). Duplicate-column
  // errors are tolerated by the runner.
  // Safe to re-run: yes.
  // Rollback: ALTER TABLE routines DROP COLUMN position (SQLite 3.35+); every
  // read falls back to the created_at ordering that was in place before this
  // migration, so no behaviour is lost beyond the reorder feature itself.
  [
    'ALTER TABLE routines ADD COLUMN position INTEGER',
    async (d) => {
      const rows = await d.getAllAsync(
        `SELECT id, programme_id FROM routines
         WHERE position IS NULL
         ORDER BY programme_id IS NULL, programme_id, created_at ASC`,
      );
      const counters = new Map();
      for (const row of rows) {
        const key = row.programme_id ?? '';
        const next = counters.get(key) ?? 0;
        await d.runAsync('UPDATE routines SET position = ? WHERE id = ?', [next, row.id]);
        counters.set(key, next + 1);
      }
    },
  ],
  // v62, fix a muscle-taxonomy mistag on "Machine Shoulder Press" and generic
  // "Shoulder Press": migration v2 above (:419-422) bundled these two
  // front-delt-dominant overhead pushes into the side_delts UPDATE clause
  // alongside genuinely side-delt moves (Lateral Raise / Upright Row). Correct
  // is front_delts, matching Overhead Press / Military Press / Arnold Press /
  // Seated Dumbbell Press in the v2 front_delts clause. This corrupted both
  // superset pairing (planEngine's tier-2 compound->isolation rule treated a
  // front-delt press and a side-delt raise as "same muscle") and front/
  // side-delt weekly volume tracking system-wide. See
  // docs/exercise-planning-2026-07-09/plan-D-intelligent-supersets.md
  // section 1b (Option A/C, founder-confirmed).
  // v2 has already run on every device and is not safe to edit in place, so
  // this is a NEW, additive migration that re-corrects any row still holding
  // the wrong tag. Exactly scoped by exact name match so no other Shoulder
  // Press variant is touched (Dumbbell/Plate-Loaded/Half-Kneeling/Band
  // Shoulder Press and the "(Front Delt Focus)" variant are already
  // front_delts in seedExercises and are left untouched).
  // No cloud counterpart: the canonical exercise catalogue (user_id NULL
  // rows) is seeded locally per device and is never pushed to or pulled from
  // Supabase (src/lib/sync.js only pulls `exercises` rows scoped to
  // `user_id = <this user>`, i.e. legacy custom exercises); there is nothing
  // to correct in EU-Dublin for this fix.
  // Safe to re-run: yes (setting an already-correct row to the same value is
  // a no-op).
  // Rollback: UPDATE exercises SET primary_muscle = 'side_delts' WHERE name
  // IN ('Machine Shoulder Press', 'Shoulder Press') (restores the pre-fix
  // mistag; not recommended, kept only for the mandated rollback note).
  [
    `UPDATE exercises SET primary_muscle = 'front_delts'
     WHERE name IN ('Machine Shoulder Press', 'Shoulder Press')`,
  ],
  // v63, extend the v62 front-delt muscle-taxonomy correction to two more
  // exact-name matches that v62 deliberately left out of scope: "Viking
  // Press" and "Plate-Loaded Shoulder Press" (both overhead PUSHES,
  // front-delt dominant, matching Machine Shoulder Press / Overhead Press /
  // Military Press / Arnold Press / Seated Dumbbell Press). Same v2
  // taxonomy bug as v62 (the original side_delts UPDATE clause above,
  // :419-422), just a wider founder-approved retag landing after v62
  // shipped. Founder ruling: docs/ux-world-class-audit-2026-07-09/
  // DECISIONS-2026-07-09.md D14 Group A ("Viking Press + Plate-Loaded
  // Shoulder Press retag"). v62 is already shipped and not safe to edit in
  // place, so this is a NEW, additive, idempotent migration, exactly scoped
  // by name so no other Shoulder Press / delt variant is touched (every
  // other side_delts row -- the Lateral Raise family, Upright Row, Cable
  // Upright Row, Dumbbell Y-Raise -- is genuinely side-delt and stays put;
  // Dumbbell/Half-Kneeling/Band Shoulder Press and the "(Front Delt Focus)"
  // variant are already front_delts in seedExercises and are left alone).
  // Applied: LOCALLY only (no rows have run this yet), via this
  // user_version bump.
  // No cloud counterpart: the canonical exercise catalogue (user_id NULL
  // rows) is seeded locally per device and is never pushed to or pulled
  // from Supabase (src/lib/sync.js only pulls `exercises` rows scoped to
  // `user_id = <this user>`, i.e. legacy custom exercises); there is
  // nothing to correct in EU-Dublin for this fix.
  // Safe to re-run: yes (setting an already-correct row to the same value
  // is a no-op).
  // Rollback: UPDATE exercises SET primary_muscle = 'side_delts' WHERE name
  // IN ('Viking Press', 'Plate-Loaded Shoulder Press') (restores the
  // pre-fix mistag; not recommended, kept only for the mandated rollback
  // note).
  [
    `UPDATE exercises SET primary_muscle = 'front_delts'
     WHERE name IN ('Viking Press', 'Plate-Loaded Shoulder Press')`,
  ],
  // v64, biceps subregion tags (D8 residue fix, docs/ux-world-class-audit-
  // 2026-06-13.../_HANDOVER-AND-RESUME.md "SUBREGION_TRANSLATION.biceps
  // pass-through once library subregion tags exist"). D8 (2026-07-09) added
  // SUBREGION_REQUIREMENTS.biceps to planEngine.js (required: ['long_head',
  // 'short_head'], minSets 8) on the understanding that seedExercises.js
  // would tag biceps exercises with the same long_head/short_head/brachialis
  // vocab planEngine's hand-written POOL already used for biceps -- but the
  // seeded library carried NO biceps subregion tags at all, so the
  // requirement could never bind against the generated pool (every biceps
  // exercise fell through poolGenerator's DEFAULT_SUBREGION to 'short_head'
  // regardless of its real angle). seedExercises.js's SUBREGION_MAP now
  // tags all 36 canonical biceps exercises and poolGenerator.js's
  // SUBREGION_TRANSLATION.biceps passes those tags straight through; this
  // migration applies the same 36 tags to exercises already seeded on
  // existing installs (the seed early-returns once any rows exist, so a
  // SUBREGION_MAP change alone never reaches a device that seeded before
  // this landed).
  // Applied: LOCALLY only, via this user_version bump. There is no cloud
  // counterpart: the canonical exercise catalogue (user_id NULL rows) is
  // seeded locally per device and is never pushed to or pulled from Supabase
  // (src/lib/sync.js only pulls `exercises` rows scoped to `user_id = <this
  // user>`, i.e. legacy custom exercises); there is nothing to correct in
  // EU-Dublin for this fix. LIBRARY_VERSION_KEY's AsyncStorage top-up
  // (seedExercises.js topUpNewExercisesIfNeeded) does not apply here either:
  // it only inserts rows whose canonical ID is missing, and all 36 of these
  // rows already exist on every install, so a version bump there would be a
  // no-op -- this schema migration is the correct and only mechanism for a
  // metadata-only change to already-seeded rows (the same reasoning behind
  // backfillExerciseMetadataIfNeeded/rederiveExerciseMetadataIfNeeded above).
  // Safe to re-run: yes (setting an already-correct row to the same value is
  // a no-op; scoped by exact name AND primary_muscle = 'biceps' so it can
  // never touch a differently-tagged row of the same name in another
  // muscle).
  // Rollback: UPDATE exercises SET subregion = NULL WHERE primary_muscle =
  // 'biceps' (restores the pre-fix untagged state; not recommended, kept
  // only for the mandated rollback note).
  [
    `UPDATE exercises SET subregion = 'long_head'
     WHERE primary_muscle = 'biceps' AND name IN (
       'Incline Dumbbell Curl', 'Spider Curl', 'Prone Incline Curl',
       'Bayesian Curl', 'Lying Cable Curl', 'Barbell Drag Curl',
       'EZ Bar Drag Curl', 'Incline Hammer Curl', 'Chin-Up (Supinated)'
     )`,
    `UPDATE exercises SET subregion = 'short_head'
     WHERE primary_muscle = 'biceps' AND name IN (
       'Barbell Curl', 'EZ Bar Curl', 'Dumbbell Curl', 'Cable Curl',
       'Machine Curl', 'Concentration Curl', 'Preacher Curl (Barbell)',
       'Preacher Curl (Dumbbell)', 'Preacher Curl (EZ Bar)',
       'EZ Bar Preacher Curl', 'Plate-Loaded Preacher Curl',
       'Preacher Curl Machine', 'Cable Concentration Curl',
       'Zottman Preacher Curl', 'Waiter Curl', 'High Cable Curl',
       'Cable Overhead Bicep Curl', 'Seated Dumbbell Curl',
       'Band Bicep Curl', 'TRX Curl'
     )`,
    `UPDATE exercises SET subregion = 'brachialis'
     WHERE primary_muscle = 'biceps' AND name IN (
       'Hammer Curl', 'Cable Hammer Curl (Rope)', 'Cable Rope Hammer Curl',
       'Zottman Curl', 'Cross-Body Hammer Curl', 'Reverse Curl',
       'Cable Reverse Curl'
     )`,
  ],
  // v65, progress-scan classification history (D18, founder decision
  // 2026-07-09; plan-F §4.3, docs/exercise-planning-2026-07-09/
  // plan-F-photo-corroboration.md). Persists ONLY the deterministic v2
  // classification of a progress scan alongside a check-in — the `assessment`
  // enum (supports | conflicts | visual_change_weight_stable | inconclusive |
  // not_used | insufficient_data) and its `status` enum, with a timestamp — so
  // a future receipt can say calm historical context like "supports has held
  // for 3 of your last 4 check-ins". It stores NO photo, NO raw score, NO
  // free text, NO body-fat value: only the enum labels and the moment.
  // Written AFTER the coaching engine has run and NEVER read by any engine
  // module (weeklyCoach/coachApply/nutritionEngine/planEngine) — pinned by the
  // source guard in progressScanClassificationHistory.test.js.
  // Applied: LOCALLY only, via this user_version bump. There is NO cloud
  // counterpart and this table is deliberately absent from the sync layer
  // (src/lib/sync/registry.js and src/lib/sync.js): progress-photo scans and
  // every value derived from them are device-local by constraint and never
  // leave the phone (safety-privacy-blueprint.md §6.1; matches progress_scan_
  // sessions/assets, v56/v57). Wiped per-user by wipeAllUserData (added to
  // directTables) so deleting an account or its photos also clears this.
  // Safe to re-run: yes (CREATE TABLE IF NOT EXISTS; a re-run is a benign
  // no-op).
  // Rollback: DROP TABLE progress_scan_classification_history (data loss
  // confined to this on-device classification log; photos, scans and the
  // check-in rows are untouched).
  [
    `CREATE TABLE IF NOT EXISTS progress_scan_classification_history (
      id          TEXT PRIMARY KEY NOT NULL,
      user_id     TEXT NOT NULL,
      assessment  TEXT NOT NULL,
      status      TEXT NOT NULL,
      created_at  INTEGER NOT NULL
    )`,
    'CREATE INDEX IF NOT EXISTS idx_progress_scan_classification_history_user_time ON progress_scan_classification_history(user_id, created_at DESC)',
  ],
  // v66, Ultimate-Audit item 12: raw/cooked weight-state label on food_entries
  // (founder ruling NA-nutrition-1, pass3-v2-founder-decisions.md:195-196,
  // 2026-06-14: "store the basis, no conversion... use the matching entry.
  // Deterministic; no conversion table needed"). Additive, NOT NULL column
  // with a DEFAULT so every existing row keeps its exact current meaning
  // ('as_weighed' = the number is whatever basis it always implicitly was,
  // unlabelled). No macro/gram recompute anywhere: this is a stored label
  // only, never a conversion factor (foodRoles.js defaultWeightStateFor /
  // hasWeightChoice). Written by src/lib/food/db.js (logFoodEntry /
  // updateFoodEntry / applyFoodEntryFromCloud), surfaced on
  // FoodDetailSheet.js and MealPlanScreen.js item rows. Cloud counterpart:
  // migrate_114_food_entry_weight_state.sql (founder-run).
  // ED-safety note: none. No calorie floor, macro total, or adherence value
  // reads this column; MacroRings and the rollup are unaffected.
  // Safe to re-run: yes (duplicate-column errors are tolerated by the runner).
  // Rollback: ALTER TABLE food_entries DROP COLUMN weight_state (SQLite
  // 3.35+); every read already tolerates the column via SELECT * / `?? null`
  // fallbacks, so dropping it just removes the label, no other data loss.
  [
    "ALTER TABLE food_entries ADD COLUMN weight_state TEXT NOT NULL DEFAULT 'as_weighed'",
  ],
  // v67, Ultimate-Audit item 15 (timeline food logging, D22 15b, lead ruling
  // ux-world-class-audit-2026-07-09/DECISIONS-2026-07-09.md): an optional
  // "time eaten" on food_entries, distinct from logged_at ("the moment the
  // client wrote the row" -- item-15-timeline-scoping.md Stage 0 finding).
  // An individually logged or individually confirmed entry gets eaten_at =
  // now at the moment of that action (editable afterwards); a bulk
  // day-confirm ("mark all meals as eaten") leaves eaten_at NULL rather than
  // stamping every meal with one false clumped instant -- the exact
  // honesty-test failure the scoping doc's Section 5 point 3 flags. NULL is
  // a real, permanent state here ("no known eaten time"), not "unset
  // pending a default", so the column is nullable with NO default.
  // Backfilled ONCE from the existing logged_at for every pre-existing row:
  // every row already displayed logged_at as its quiet "when you ate" time
  // (EntryRow.js, gap #3, shipped 2026-06-xx), and the backfill cannot
  // retroactively tell a historical bulk confirm from an individual log
  // (both wrote logged_at = now identically before this build), so keeping
  // that existing display for old rows is the honest, no-regression choice;
  // only NEW writes follow the split going forward (src/lib/food/db.js:
  // logFoodEntry, updateFoodEntry, confirmPlannedDay, confirmPlannedEntry).
  // Cloud counterpart: migrate_115_food_entry_eaten_at.sql (founder-run,
  // EU-Dublin; per CLAUDE.md the app never runs cloud migrations).
  // ED-safety note: this column IS the item-15 honesty-test fix itself
  // (no meal-timing judgement is ever rendered from it -- pinned on the
  // live meal-card row, src/components/food/EntryRow.js, since the flat
  // timeline diary that used to carry this law was reverted, D37). No
  // calorie floor, macro total, or adherence value reads this column;
  // MacroRings and the rollup read kcal/protein/carbs/fat/fibre only,
  // unaffected by presentation order.
  // Safe to re-run: yes (duplicate-column errors are tolerated by the
  // runner; the backfill UPDATE only touches rows still NULL, a no-op once
  // it has run).
  // Rollback: ALTER TABLE food_entries DROP COLUMN eaten_at (SQLite 3.35+);
  // every read already tolerates the column's absence (SELECT * / `?? null`
  // fallbacks), and the timeline falls back to grouping every entry under
  // its meal tag with no time shown, so dropping it only removes the true-
  // time distinction, no other data loss.
  [
    'ALTER TABLE food_entries ADD COLUMN eaten_at INTEGER',
    'UPDATE food_entries SET eaten_at = logged_at WHERE eaten_at IS NULL',
  ],
  // v68, Wave 2 repair (cross-surface-consistency-audit-2026-07-30,
  // "the training-block week renders FIVE different ways"). Two data
  // repairs for mesocycles rows corrupted before this build's fix:
  //
  // 1. planned_weeks vs duration_weeks. _pushMesocycles (sync.js) never
  //    sent planned_weeks, so the cloud column sat at its schema DEFAULT 5
  //    and the next session-restore pull (INSERT OR REPLACE, always a
  //    full-row overwrite) silently knocked a genuine local 6+ back down
  //    to 5, while duration_weeks (which WAS pushed) round-tripped
  //    correctly -- confirmed by the audit as the "Week 2 of 5" vs
  //    "of 6" split on the founder's own device. planned_weeks is now the
  //    authoritative schedule-length field everywhere in the app, so this
  //    reconciles it FROM duration_weeks wherever planned_weeks is exactly
  //    the corrupted default (or NULL) and duration_weeks is an explicit,
  //    different value. Never invents a number: a genuine 5-week block
  //    (duration_weeks also 5) is untouched. The reverse gap (a legacy row
  //    missing duration_weeks entirely while planned_weeks is explicit) is
  //    filled the same way, so the two fields can never independently
  //    diverge again once the sync fix (this same change,
  //    sync.js _pushMesocycles) keeps them both moving together.
  // 2. deload_week. activatePlanWithBlock never wrote this column (X19),
  //    so it was NULL for every real block and MesocycleBuilderScreen's
  //    deload highlighting was dead. generateMesocycleWeeks' own rule is
  //    unconditional (the LAST week, index === planned_weeks, is always
  //    the deload week), so backfilling deload_week = planned_weeks for
  //    any row where it is still NULL is a certain derivation, not a
  //    guess, for every block whose weeks were generated by this app.
  //
  // Applied: LOCALLY only, via this user_version bump. There is no cloud
  // counterpart -- the cloud's planned_weeks corrects itself the next time
  // the now-fixed _pushMesocycles runs for this row. deload_week has no
  // cloud column at all (confirmed absent from every supabase/migrate_*.sql;
  // schema.sql/setup_complete.sql are stale snapshots, not authoritative)
  // so it is NOT pushed by this change -- a cloud migration to add that
  // column is a founder decision, flagged separately, not applied here.
  // Safe to re-run: yes -- once planned_weeks/duration_weeks agree and
  // deload_week is set, the WHERE clauses no longer match; a re-run is a
  // no-op.
  // Rollback: no destructive change to undo (the repaired values are
  // derived, not guessed, from data the row already held). If ever needed,
  // the pre-migration corrupted planned_weeks value is not recoverable
  // from this migration alone -- it would require a device backup from
  // before this build.
  [
    async (d) => {
      const now = Date.now();
      await d.runAsync(
        `UPDATE mesocycles SET planned_weeks = duration_weeks, updated_at = ?
         WHERE duration_weeks IS NOT NULL
           AND (planned_weeks IS NULL OR (planned_weeks = 5 AND duration_weeks != 5))`,
        [now],
      );
      await d.runAsync(
        `UPDATE mesocycles SET duration_weeks = planned_weeks, updated_at = ?
         WHERE duration_weeks IS NULL AND planned_weeks IS NOT NULL`,
        [now],
      );
      await d.runAsync(
        `UPDATE mesocycles SET deload_week = planned_weeks, updated_at = ?
         WHERE deload_week IS NULL AND planned_weeks IS NOT NULL AND planned_weeks > 0`,
        [now],
      );
    },
  ],

  // ── Stage 6, adaptive mesocycle build (2026-08-09) ──────────────────────
  // Purpose: persist the Block Ledger (interBlock.buildBlockLedger's JSON,
  // LEDGER_VERSION-stamped) on the finished mesocycle row, so the next
  // block's seeding (blockSeed.resolveSeedRange) and the learned working
  // range (learnedRange.computeLearnedRange, a replay over these rows)
  // have one store and one store only.
  // Applied: LOCALLY via this user_version bump. Cloud counterpart is
  // supabase/migrate_131_mesocycles_block_ledger.sql — founder-gated,
  // and it must run against production BEFORE a build carrying the
  // sync push of this column ships (migrate_129 precedent).
  // Additive: yes (single nullable column). Safe to re-run: yes
  // (isBenignMigrationError swallows duplicate-column). Rollback: drop
  // nothing — a null column is inert to every reader.
  [
    'ALTER TABLE mesocycles ADD COLUMN block_ledger TEXT',
  ],
  [
    // v71 (Campaign 1 review finding 10): one coach output per week.
    // saveCoachOutput minted a fresh uid() per device, so two devices
    // that each generated the week's output before syncing held two
    // rows for the same week and getLatestCoachOutput picked between
    // them arbitrarily - reviving the Apply button after the change had
    // already been applied on the other device. Dedup keeps the row
    // with the newest honest timestamp (applied wins a tie), then the
    // unique index makes the identity structural; new rows also derive
    // a deterministic id from (weekStart, userId) so both devices mint
    // the SAME row and cloud upserts converge.
    `DELETE FROM coach_outputs WHERE rowid NOT IN (
       SELECT rowid FROM (
         SELECT rowid, ROW_NUMBER() OVER (
           PARTITION BY user_id, week_start
           ORDER BY COALESCE(updated_at, created_at, 0) DESC, applied DESC, rowid DESC
         ) AS rn FROM coach_outputs
       ) WHERE rn = 1
     )`,
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_coach_outputs_user_week ON coach_outputs(user_id, week_start)',
  ],
  [
    // v72 (C6 S-15, D97-23): re-id legacy coach_outputs rows to the
    // deterministic co_<week_start>_<user_id> form saveCoachOutput mints,
    // so every device's cloud upsert converges on ONE (user_id, id) per
    // week. Without this, a device holding a legacy uid() id for a week
    // whose surviving cloud row has a different id would - after the
    // corrected cloud migration 135's unique index - poison its entire
    // 200-row batch upsert with 23505 for ever. Safe by construction:
    // v71's unique index guarantees one row per (user_id, week_start), so
    // the target id can never collide; updated_at is NOT bumped (honest
    // timestamps, F5) - the full-history push carries the new id anyway,
    // and a stale cloud copy under the old id arriving later hits the
    // applier's INSERT OR IGNORE against the v71 index and is dropped.
    // Idempotent: rows already deterministic do not match the WHERE.
    `UPDATE coach_outputs
        SET id = 'co_' || week_start || '_' || user_id
      WHERE id <> 'co_' || week_start || '_' || user_id`,
  ],
  // ── v73: Campaign 9, exercise intent + swap memory ─────────────────────
  // Purpose: durable, user-owned state about EXERCISES, which the app had
  // none of. Three tables, each keyed by (user_id, exercise_id) or the
  // swap pair, so every selecting surface can ask one layer the same
  // questions instead of re-deriving preference per screen:
  //   exercise_intent        - "don't suggest this" (indefinite) and
  //                            "avoid for this block" (scoped to one
  //                            mesocycle id, so it expires at the block
  //                            boundary rather than on a calendar timer).
  //                            `reason` is OPTIONAL free context; it is
  //                            never read as a diagnosis.
  //   exercise_swaps         - the A->B event log with its context, so
  //                            repeated deliberate choices can outrank
  //                            alphabetical ordering. `explicit` records
  //                            that a human chose it.
  //   exercise_slot_defaults - a user-APPROVED default replacement for a
  //                            source exercise in a plan. Stronger than
  //                            any inferred preference.
  // Applied: LOCALLY via this user_version bump. Cloud counterpart is
  // supabase/migrate_136_exercise_intent.sql - APPLIED to EU-Dublin on
  // 2026-08-12 and verified (this comment read "written, NOT applied"
  // until 2026-08-14; supabase/README.md CURRENT STATUS is the authority
  // and the migration's own footer recorded the apply on the day).
  // Additive: yes (three new tables + indexes, nothing altered). Safe to
  // re-run: yes (IF NOT EXISTS throughout). Rollback: drop the three
  // tables; every reader treats their absence as "no intent recorded",
  // which is the pre-Campaign-9 behaviour exactly.
  [
    `CREATE TABLE IF NOT EXISTS exercise_intent (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      exercise_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      scope_mesocycle_id TEXT,
      reason TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER,
      UNIQUE(user_id, exercise_id)
    )`,
    'CREATE INDEX IF NOT EXISTS idx_exercise_intent_user ON exercise_intent(user_id, exercise_id)',
    `CREATE TABLE IF NOT EXISTS exercise_swaps (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      from_exercise_id TEXT NOT NULL,
      to_exercise_id TEXT NOT NULL,
      routine_id TEXT,
      mesocycle_id TEXT,
      explicit INTEGER NOT NULL DEFAULT 1,
      scope TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER
    )`,
    'CREATE INDEX IF NOT EXISTS idx_exercise_swaps_user_from ON exercise_swaps(user_id, from_exercise_id)',
    `CREATE TABLE IF NOT EXISTS exercise_slot_defaults (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      from_exercise_id TEXT NOT NULL,
      routine_id TEXT,
      exercise_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER,
      UNIQUE(user_id, from_exercise_id, routine_id)
    )`,
    'CREATE INDEX IF NOT EXISTS idx_exercise_slot_defaults_user ON exercise_slot_defaults(user_id, from_exercise_id)',
  ],
  // v75, swap SCOPE (Campaign 16 additional quality law 1). A swap made
  // during a workout because the machine was busy is NOT the same fact as
  // deliberately editing the exercise out of the programme, and it is not
  // remotely the same fact as "don't suggest this again". Before this they
  // were one undifferentiated event: ActiveWorkoutScreen recorded a session
  // substitution - on a sheet that explicitly says it does not change the
  // plan - in exactly the shape RoutineDetailScreen used for a permanent
  // plan edit. Two busy-machine days therefore reached the >= 2
  // swapped-away threshold and the exercise was proposed for removal from
  // the user's programme.
  //
  // `scope` is 'session' or 'programme'. Rows written before this migration
  // are left NULL, because which kind they were is genuinely unknown, and
  // the NEGATIVE reading (intent.swappedAwayCount) counts only 'programme'.
  // That asymmetry is deliberate: under-counting costs a user one more
  // deliberate swap before Volyume acts, over-counting silently removes an
  // exercise they like. POSITIVE evidence (this was chosen as a
  // replacement) still counts every row, because choosing something is a
  // positive signal whatever the scope.
  //
  // Applied: LOCALLY via this user_version bump. Cloud counterpart is
  // supabase/migrate_137_exercise_swap_scope.sql - written, NOT applied,
  // founder-gated. The push tolerates the column's absence in the cloud
  // (the row still carries every other field), so a build can ship before
  // that migration runs without losing swap history.
  // Additive: yes (one nullable column). Safe to re-run: yes (the runner
  // treats a duplicate-column error as benign). Rollback: the column can be
  // left in place and ignored; readers treat NULL as unknown.
  [
    'ALTER TABLE exercise_swaps ADD COLUMN scope TEXT',
  ],
  // v74, movement-family taxonomy correction (Campaign 16 job 3,
  // src/lib/exercise/movementFamily.js). The seeded library's back and quad
  // subregion tags were carrying three separate defects, each of which
  // changed what a generated plan believed it had covered:
  //
  //   1. `lower_lat` actually held the deadlift family and back extensions.
  //      That is hip hinge and spinal erector work, not lat selection, and
  //      it could satisfy a lat slot. It also produced user-facing copy
  //      telling people a deadlift "emphasises the lower portion of the
  //      back that creates the V-shape taper" (whyThisTemplates.js).
  //   2. The shoulder-extension family (straight-arm pulldown, cable
  //      pullover) was tagged `vertical_pull`, so a plan could believe it
  //      had a vertical pull while containing no pulldown or chin-up.
  //   3. `horizontal_row` held every row there is, so a lat-biased row and
  //      an upper-back row were indistinguishable and the anti-redundancy
  //      rule had nothing to read. Quads had the same shape of fault:
  //      `sweep` contained BOTH knee-forward squats and the leg extension,
  //      so required coverage of both quad families was satisfiable by two
  //      squats with no knee-extension work in the week.
  //
  // seedExercises.js's SUBREGION_MAP now carries the corrected families, but
  // the seed early-returns once any rows exist, so a SUBREGION_MAP change
  // alone never reaches a device that seeded before this landed. Same
  // reasoning and same mechanism as v64 (biceps tags).
  //
  // The GENERATOR does not depend on this migration: planEngine resolves
  // families by name through movementFamily.js, so plan quality is correct
  // on every device the moment the build lands. This migration exists for
  // the surfaces that read the stored row instead - the exercise detail
  // screen's subregion chip, swapEngine's same-subregion preference, and
  // the why-this copy on a saved routine.
  //
  // Applied: LOCALLY only, via this user_version bump. There is NO cloud
  // counterpart: the canonical exercise catalogue (user_id NULL rows) is
  // seeded locally per device and is never pushed to or pulled from
  // Supabase (sync.js only pulls `exercises` rows scoped to this user, i.e.
  // legacy custom exercises), so there is nothing to correct in EU-Dublin.
  // Additive: yes - metadata only, no schema change, no row added or
  // removed. Safe to re-run: yes (setting an already-correct row to the
  // same value is a no-op; every statement is scoped by primary_muscle so
  // it can never touch a same-named exercise in another muscle, and the
  // quads sweep-up names every seeded squat/press row explicitly rather
  // than using NOT IN, so a user's own custom quad exercise is never
  // retagged by a rule written for the seeded catalogue).
  // Rollback: UPDATE exercises SET subregion = NULL WHERE primary_muscle IN
  // ('back', 'quads') - restores the untagged state, after which
  // movementFamily.js still classifies correctly by name. Not recommended;
  // kept for the mandated rollback note.
  [
    `UPDATE exercises SET subregion = 'vertical_pull'
     WHERE primary_muscle = 'back' AND name IN (
       'Lat Pulldown (Wide Grip)', 'Lat Pulldown (Close Grip)',
       'Lat Pulldown (Neutral Grip)', 'Pull-Up', 'Weighted Pull-Up',
       'Chin-Up', 'Neutral Grip Pull-Up', 'Assisted Pull-Up',
       'Single-Arm Lat Pulldown', 'Plate-Loaded Lat Pulldown',
       'Iso-Lateral Front Pulldown', 'Band Lat Pulldown',
       'Band Assisted Pull-Up', 'Wide-Grip Pull-Up',
       'Cable Reverse-Grip Pulldown', 'V-Bar Pulldown'
     )`,
    `UPDATE exercises SET subregion = 'horizontal_lat'
     WHERE primary_muscle = 'back' AND name IN (
       'Barbell Row (Supinated)', 'Dumbbell Row',
       'Single-Arm Dumbbell Row (Supported)', 'T-Bar Row',
       'Chest-Supported T-Bar Row', 'Seated Cable Row', 'Landmine Row',
       'Single-Arm Landmine Row', 'Single-Arm Cable Row', 'Meadows Row',
       'Kroc Row', 'Machine Row (Hammer Strength)',
       'Machine Row (Chest Supported)', 'Helms Row',
       'Plate-Loaded Low Row', 'Half-Kneeling Cable Row',
       'Smith Machine Row'
     )`,
    `UPDATE exercises SET subregion = 'upper_mid_row'
     WHERE primary_muscle = 'back' AND name IN (
       'Barbell Row (Bent Over)', 'Pendlay Row', 'Seal Row',
       'Inverted Row', 'TRX Row', 'Cable High Row',
       'Cable Row (Wide Grip)', 'Wide-Grip Cable Row',
       'Seated Machine Row (Wide)', 'Chest-Supported Row (Dumbbell)',
       'Chest-Supported Row (Barbell)', 'Plate-Loaded Row',
       'Plate-Loaded High Row', 'Band Row', 'Batwing Row',
       'Renegade Row', 'Barbell Upright Row (Wide)',
       'Cable Face Pull (Upper Back)'
     )`,
    `UPDATE exercises SET subregion = 'shoulder_extension'
     WHERE primary_muscle = 'back' AND name IN (
       'Cable Straight-Arm Pulldown', 'Cable Lat Pullover',
       'Cable Rope Straight-Arm Pulldown (Single-Arm)'
     )`,
    `UPDATE exercises SET subregion = 'spinal_erector'
     WHERE primary_muscle = 'back' AND name IN (
       'Conventional Deadlift', 'Sumo Deadlift', 'Rack Pull',
       'Trap Bar Deadlift', 'Snatch Grip Deadlift', 'Deficit Deadlift',
       'Hyperextension (Back Extension)', 'Reverse Hyperextension',
       'Back Extension (Weighted)'
     )`,
    `UPDATE exercises SET subregion = 'knee_extension'
     WHERE primary_muscle = 'quads' AND name IN (
       'Leg Extension', 'Terminal Knee Extension', 'Sissy Squat',
       'Sissy Squat Machine', 'Spanish Squat', 'Reverse Nordic Curl',
       'Wall Sit'
     )`,
    `UPDATE exercises SET subregion = 'squat_press'
     WHERE primary_muscle = 'quads' AND name IN (
       'Anderson Squat', 'Assault Bike', 'Band Squat',
       'Barbell Back Squat', 'Barbell Front Squat', 'Barbell Lunge',
       'Belt Squat', 'Bodyweight Bulgarian Split Squat', 'Box Squat',
       'Broad Jump', 'Bulgarian Split Squat', 'Cable Squat (Standing)',
       'Cambered Bar Squat', 'Curtsy Lunge', 'Cycling (Stationary)',
       'Cyclist Squat', 'Depth Jump', 'Dumbbell Lunge',
       'Front Squat (Dumbbell)', 'Goblet Squat', 'Hack Squat Machine',
       'Hatfield Squat', 'Heel-Elevated Squat', 'Jefferson Squat',
       'Jump Squat', 'Kneeling Squat', 'Landmine Squat', 'Leg Press',
       'Leg Press (High Foot)', 'Leg Press (Narrow Stance)',
       'Pause Squat', 'Pendulum Squat', 'Pin Squat', 'Reverse Lunge',
       'SSB Squat', 'Safety Bar Squat', 'Single Leg Press',
       'Skater Squat', 'Sled Push', 'Smith Machine Front Squat',
       'Smith Machine Squat', 'Split Squat', 'Stair Running',
       'Step-Up (Barbell)', 'Step-Up (Dumbbell)', 'Step-Up (Weighted)',
       'Sumo Squat', 'Walking Lunge', 'Wall Ball Squat', 'Zercher Squat'
     )`,
    `UPDATE exercises SET subregion = 'hip_extension'
     WHERE primary_muscle = 'hamstrings' AND subregion = 'lower_lat'`,
  ],
  // v76, structured plan provenance (Campaign 16 job 10, completion pass
  // 2026-08-14).
  //
  // WHAT WAS WRONG. The engine stamped a machine-readable reason on every
  // exercise it chose (`selectionReason`, planEngine SELECTION_REASON) and
  // planRationale.js translated those codes into plain English, but the
  // write path never carried the code to the database. The reason existed
  // for exactly as long as the in-memory plan object did, so a user who
  // saved their plan and came back could never be told why an exercise was
  // there. The campaign recorded job 10 as landed on the strength of the
  // engine and the copy table; the product behaviour was absent.
  //
  // A CODE, NOT PROSE. The column stores the reason CODE. Copy is rendered
  // at read time from planRationale, so wording can be improved (or
  // translated) without a migration and without a saved plan carrying a
  // sentence written by an older build.
  //
  // Applied: LOCALLY via this user_version bump. Cloud counterpart:
  // supabase/migrate_139_routine_exercises_selection_reason.sql. The sync
  // writer retries without the optional column until that migration is
  // applied, so shipping order cannot break the rest of routine sync.
  // Additive: yes (one nullable column). Safe to re-run: yes (the runner
  // treats a duplicate-column error as benign). Rollback: leave the column
  // in place and ignore it; every reader treats NULL as "no recorded
  // reason" and renders nothing.
  [
    'ALTER TABLE routine_exercises ADD COLUMN selection_reason TEXT',
  ],
  // v77, FOOD/MEAL INTENT MEMORY (Campaign 17A job 3, 2026-08-14).
  //
  // WHAT WAS MISSING. The food domain had no way to tell three completely
  // different user actions apart. Swapping the chicken out of tonight's
  // dinner because there is none in the house, saying "use turkey instead of
  // chicken from now on", and saying "never show me chicken again" were, in
  // the data, either nothing at all (the first two left no trace beyond the
  // edited plan) or the same blunt exclusion (the third). The exercise domain
  // solved exactly this in Campaign 16 (exercise_swaps.scope,
  // src/lib/exercise/swapScope.js); this is its food counterpart.
  //
  // `scope` is 'just_this_time' or 'persistent' (src/lib/food/foodSwapScope.js).
  // A one-off swap affects the current plan occurrence and NOTHING else - it
  // must never teach that the user dislikes the food they swapped away from.
  // A persistent replacement is a deliberate statement and legitimately
  // steers future generation. "Never suggest this" is stronger still and
  // stays where it already lives, on the profile's mealPlanExcludeFoods.
  //
  // Food keys are curated-food keys (src/lib/food/curatedFoods.js), the same
  // vocabulary mealSwap and the exclusion list already speak.
  //
  // Applied: LOCALLY via this user_version bump. Cloud counterpart is
  // supabase/migrate_138_food_swaps.sql - written, NOT applied, founder-gated
  // (the founder applies cloud migrations by hand; the app never runs them).
  // Until it is applied the table is device-local, which degrades to exactly
  // the pre-17A behaviour on a second device: no remembered replacements, no
  // wrong ones either.
  // Additive: yes (a new table plus its index; nothing existing is touched).
  // Safe to re-run: yes (IF NOT EXISTS throughout). Rollback: drop the table;
  // every reader treats an absent row as "no intent recorded", which is the
  // behaviour before this migration.
  [
    `CREATE TABLE IF NOT EXISTS food_swaps (
      id            TEXT PRIMARY KEY,
      user_id       TEXT NOT NULL,
      from_food_key TEXT NOT NULL,
      to_food_key   TEXT NOT NULL,
      scope         TEXT NOT NULL,
      created_at    INTEGER NOT NULL,
      updated_at    INTEGER NOT NULL,
      deleted_at    INTEGER
    )`,
    'CREATE INDEX IF NOT EXISTS idx_food_swaps_user_from ON food_swaps(user_id, from_food_key)',
  ],

  // ── Campaign 18 block-progression amendment ────────────────────────────
  // Purpose: persist the EXPLICIT non-completion resolutions for a required
  // session instance. Programme position used to be `programmes.
  // next_workout_index`, a single integer advanced blindly on any completion,
  // so training an out-of-order workout moved the pointer PAST an unperformed
  // required session and consumed it. There was no representation anywhere of
  // "this required session is still outstanding".
  //
  // COMPLETED is deliberately NOT stored here: it is derived from the existing
  // workout execution rows, so there is exactly one authority for what was
  // performed and the COMPLETED-plus-OUTSTANDING contradiction cannot arise.
  // This table holds only what execution cannot prove - that the athlete
  // deliberately skipped an instance, or deliberately finished one early.
  //
  // Identity is (mesocycle_week_id, routine_id), proven sufficient in
  // requiredSessionIdentity.test.js: a repeated session within one programme
  // week is written as its own routine row, so names may repeat but ids do
  // not. The UNIQUE index makes "one current resolution per required
  // instance" structural rather than conventional.
  //
  // Applied: LOCALLY via this user_version bump. Cloud counterpart is
  // supabase/migrate_140_session_resolutions.sql - founder-gated, and it must
  // run against production BEFORE a build carrying the sync push ships
  // (migrate_129/131 precedent). Until then the push is column-tolerant and
  // simply fails soft, leaving progression correct on-device.
  // Additive: yes (new table only). Safe to re-run: yes (IF NOT EXISTS
  // throughout). Rollback: drop the table; every reader treats an absent
  // resolution as OUTSTANDING, which is the pre-amendment behaviour.
  // C18 block progression, legacy compatibility. Marks the week from which
  // per-instance progression authority applies to a block.
  //
  // Blocks created BEFORE this amendment ran under the broken pointer, so the
  // absence of a workout row for an earlier week is genuinely AMBIGUOUS: it may
  // mean the session was never done, or that the pointer consumed it. Neither
  // SKIPPED_BY_USER nor COMPLETED may be manufactured for that, and resurrecting
  // every historical gap would send an established user back several weeks.
  //
  // NULL therefore means "legacy": the resolver floors candidate weeks at the
  // furthest week the athlete has actually trained, so earlier ambiguity is left
  // alone rather than reinterpreted. New blocks are stamped with 1 at creation
  // and get the full model with no floor, so the compatibility rule dies with
  // the blocks that need it and never reaches a new one.
  //
  // Applied: LOCALLY via this user_version bump. No cloud counterpart needed -
  // an absent column reads NULL, which is the conservative branch.
  // Additive: yes. Safe to re-run: yes. Rollback: inert.
  [
    'ALTER TABLE mesocycles ADD COLUMN progression_anchor_week INTEGER',
  ],

  [
    `CREATE TABLE IF NOT EXISTS session_resolutions (
      id                TEXT PRIMARY KEY,
      user_id           TEXT NOT NULL,
      mesocycle_week_id TEXT NOT NULL,
      routine_id        TEXT NOT NULL,
      mesocycle_id      TEXT,
      resolution        TEXT NOT NULL,
      workout_id        TEXT,
      resolved_at       INTEGER NOT NULL,
      created_at        INTEGER NOT NULL,
      updated_at        INTEGER NOT NULL,
      updated_at_iso    TEXT,
      deleted_at        INTEGER
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_session_resolutions_instance
       ON session_resolutions(mesocycle_week_id, routine_id)`,
    `CREATE INDEX IF NOT EXISTS idx_session_resolutions_user
       ON session_resolutions(user_id)`,
  ],
  // v80, Campaign 19 effective-maintenance memo. One deterministic row per
  // user stores the validated residual against the current formula prior.
  // No product target or manual choice is stored here. The cloud counterpart
  // is migrate_141_effective_maintenance_memos.sql and remains founder-gated.
  [
    `CREATE TABLE IF NOT EXISTS effective_maintenance_memos (
      user_id TEXT PRIMARY KEY,
      cumulative_residual_kcal INTEGER NOT NULL,
      formula_prior_kcal_at_derivation INTEGER NOT NULL,
      effective_maintenance_kcal_at_derivation INTEGER NOT NULL,
      source TEXT NOT NULL,
      status TEXT NOT NULL,
      reason TEXT NOT NULL,
      algorithm_version INTEGER NOT NULL,
      as_of INTEGER NOT NULL,
      evidence_signature TEXT NOT NULL,
      food_days_logged INTEGER NOT NULL,
      weight_points INTEGER NOT NULL,
      bodyweight_kg REAL,
      goal_phase TEXT,
      activity_level TEXT,
      formula_method TEXT,
      formula_context_signature TEXT NOT NULL,
      large_divergence INTEGER NOT NULL DEFAULT 0,
      version_key TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    'CREATE INDEX IF NOT EXISTS idx_effective_maintenance_updated ON effective_maintenance_memos(updated_at)',
  ],
  // v81, Campaign 19 hostile-audit remediation. A durable start line makes
  // formula-driving context revalidation depend only on post-change evidence.
  // Appended rather than editing v80 so a device that already ran the audited
  // Campaign 19 SHA upgrades without losing or recreating its memo.
  [
    'ALTER TABLE effective_maintenance_memos ADD COLUMN revalidation_started_at INTEGER',
    'ALTER TABLE effective_maintenance_memos ADD COLUMN revalidation_context_signature TEXT',
  ],
  // D107-2 injury/constraint layer: day-bound expiry for exercise_intent.
  //
  // Builds ON the Campaign 9 intent layer rather than a parallel one. The
  // new PATTERN_AVOID kind (src/lib/database.js EXERCISE_INTENT, targets a
  // movementFamily key rather than one exercise, via the existing
  // `exercise_id` column carrying a `family:<key>` target string - see
  // src/lib/exercise/intent.js familyTargetKey) needs a day-bound duration
  // (7/14/30 days) that the two existing kinds never needed: EXCLUDED is
  // indefinite by definition and AVOIDED_BLOCK already expires at the block
  // boundary via scope_mesocycle_id. `expires_at_ms` is nullable and read
  // ONLY for rows that set it; every existing row (and every future
  // EXCLUDED/AVOIDED_BLOCK row) leaves it NULL and is completely unaffected.
  //
  // Expiry is evaluated at READ time (database.js getExerciseIntents), not
  // here: this migration only adds the column. A row past its expiry is
  // excluded from the live result and then lazily tombstoned so it does not
  // keep being re-evaluated forever.
  //
  // Applied: LOCALLY via this user_version bump. Cloud counterpart:
  // supabase/migrate_142_exercise_intent_expiry.sql, additive, NOT applied
  // (founder-gated per CLAUDE.md - cloud migrations are manual-run only).
  // The push (src/lib/sync.js _pushExerciseIntent) sends expires_at_ms in
  // every payload; until the cloud column exists Postgres rejects the
  // unknown column for the WHOLE upsert batch, exactly the same tolerated
  // failure mode migrate_137's header describes for exercise_swaps.scope -
  // logged, swallowed, retried on the next sync tick, device data is safe.
  // Additive: yes (one nullable column). Safe to re-run: yes (the runner
  // proves the exact duplicate column exists before treating the error as
  // benign).
  // Rollback: leave the column in place and ignore it; every reader treats
  // NULL as "no expiry", which is the pre-migration behaviour for every kind
  // except PATTERN_AVOID, and no PATTERN_AVOID row can exist on a device
  // that has not run this migration (the UI action that creates one ships
  // in the same build as this migration).
  [
    'ALTER TABLE exercise_intent ADD COLUMN expires_at_ms INTEGER',
  ],
  // D107-2 load semantics (LOAD-SEMANTICS-SPEC): what the ENTERED weight
  // number means per exercise - 'total' (default), 'per_hand' (two-implement
  // dumbbell/kettlebell work, one hand's weight), 'assisted' (assistance
  // stack, less is stronger) or 'added_bodyweight' (external addition to a
  // bodyweight movement). Nullable + read-defaulted to 'total', so every
  // existing row and every custom exercise keeps today's de facto meaning -
  // nothing silently changes. The backfill classifies CANONICAL rows only
  // (is_custom = 0) via the same deriveLoadSemantics the seed uses, so a
  // fresh install and an upgraded one agree exercise-for-exercise.
  // Historical workout data is NEVER rewritten: semantics apply at read
  // time from the exercise definition (calculateTonnage / detectPR in
  // algorithms.js). Cloud counterpart: supabase/migrate_143_load_semantics.sql
  // (NOT applied; founder-gated).
  [
    'ALTER TABLE exercises ADD COLUMN load_semantics TEXT',
    migrateLoadSemanticsBackfill,
  ],
  // CC26 capability foundations (docs/capability-campaign-25-2026-08-20/
  // ARCHITECTURE.md sections 5.1, 5.3). Two NEW tables, nothing altered:
  // inert against every migration-window fixture (the v65 convention).
  // capability_constraints is the Article 9 capability lane - structurally
  // separate from exercise_intent (CAP-4); rows are append-only in meaning
  // (a rule is never edited into a different rule; only its ending fields
  // and the erasure tombstone ever mutate - CAP-14). NO rows are created
  // for existing users: an upgraded device gets empty tables and identical
  // behaviour (rollback = tables stay empty). session_constraint_effects
  // is schema-only foundation here; its writers arrive in CC29.
  // Cloud counterparts: supabase/migrate_145 + migrate_146 (written, NOT
  // applied; founder-gated).
  [
    `CREATE TABLE IF NOT EXISTS capability_constraints (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('baseline','episode')),
      source TEXT NOT NULL CHECK (source IN ('self','clinician_reported')),
      rule_kind TEXT NOT NULL CHECK (rule_kind IN ('demand','family','exercise','exercise_allow')),
      rule_value TEXT NOT NULL,
      laterality TEXT CHECK (laterality IN ('left','right')),
      starts_at INTEGER NOT NULL,
      ends_at INTEGER,
      state TEXT NOT NULL CHECK (state IN ('active','ended')),
      ended_at INTEGER,
      ended_reason TEXT CHECK (ended_reason IN ('expired','user_ended','superseded','promoted')),
      episode_group_id TEXT,
      acknowledged_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER
    )`,
    'CREATE INDEX IF NOT EXISTS idx_capability_constraints_user_state ON capability_constraints(user_id, state)',
    'CREATE INDEX IF NOT EXISTS idx_capability_constraints_user_group ON capability_constraints(user_id, episode_group_id)',
    `CREATE TABLE IF NOT EXISTS session_constraint_effects (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      workout_id TEXT NOT NULL UNIQUE,
      effects_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER
    )`,
    'CREATE INDEX IF NOT EXISTS idx_session_constraint_effects_user ON session_constraint_effects(user_id)',
  ],
  // CC27 demand ontology (ARCHITECTURE sections 5.4, 8): ten nullable
  // demand columns on `exercises` - the ONE closed vocabulary constraint
  // rules and exercise metadata share, so eligibility is set intersection.
  // NULL = UNKNOWN and unknown is meaningful (CAP-8): automatic surfaces
  // treat NULL-on-a-constrained-axis as ineligible with its own reason;
  // manual paths never read these. Additive and idempotent (ALTER + a
  // backfill that only fills canonical rows); rollback = columns ignored,
  // since no reader existed before CC27. The backfill derives every value
  // via capability/demands.js (materialised at migration time, so
  // behaviour never depends on a runtime regex - section 8.3) and leaves
  // custom rows NULL by design. updated_at is NOT touched: derivation is
  // not a user edit (F5 honest timestamps). Cloud counterpart:
  // supabase/migrate_148_exercise_demands.sql (written, NOT applied;
  // founder-gated).
  [
    "ALTER TABLE exercises ADD COLUMN position TEXT CHECK (position IN ('standing','seated','lying','kneeling','mixed'))",
    'ALTER TABLE exercises ADD COLUMN floor_access INTEGER',
    'ALTER TABLE exercises ADD COLUMN overhead_position INTEGER',
    "ALTER TABLE exercises ADD COLUMN grip_demand TEXT CHECK (grip_demand IN ('none','supportive','bar'))",
    'ALTER TABLE exercises ADD COLUMN unilateral_loadable INTEGER',
    'ALTER TABLE exercises ADD COLUMN bilateral_upper INTEGER',
    'ALTER TABLE exercises ADD COLUMN bilateral_lower INTEGER',
    'ALTER TABLE exercises ADD COLUMN axial_load INTEGER',
    'ALTER TABLE exercises ADD COLUMN impact INTEGER',
    "ALTER TABLE exercises ADD COLUMN balance_demand TEXT CHECK (balance_demand IN ('supported','stable','high'))",
    migrateDemandMetadataBackfill,
  ],
  // CC29 (ARCHITECTURE sections 5.5, 14): two additive nullable columns.
  // exercise_swaps.cause - 'constraint' is ELIGIBILITY-DERIVED at write
  // time (any swap whose FROM-exercise is capability-ineligible at swap
  // time), never UI-path-keyed and never free text (CAP-13). NULL on
  // every pre-CC29 row and every unconstrained swap: byte-identical
  // meaning to today.
  // capability_constraints.effective_choice - the section 14 per-line
  // Apply/Decline on an EPISODE rule's session effect ('applied' |
  // 'declined'; NULL = not yet proposed/decided). Lives on the rule row
  // itself so sync, erasure and export all inherit (R1 #19); the
  // effective view stays a RESOLUTION LAYER (section 2.3) - this column
  // stores the user's standing choice, never a computed plan.
  // Cloud counterpart: supabase/migrate_149_swap_cause_effective_choice.sql
  // (APPLIED 2026-08-21 in the founder-confirmed "run against production"
  // batch; verified live per supabase/README.md's 2026-08-21 entry).
  [
    migrateSwapCauseAndEffectiveChoice,
  ],
  // Gap-closure Phase C (MOVEMENT-PATH-AUDIT.md): the eleventh demand
  // column. Weight borne through the palms with extended wrists (the
  // push-up/quadruped class) reads as grip-free on the grip axis, so
  // wrist and hand restrictions could not be expressed without it.
  // Additive + idempotent; NULL = UNKNOWN (CAP-8). Cloud counterpart:
  // supabase/migrate_151_weight_bearing_hands.sql (APPLIED 2026-08-21 in
  // the founder-confirmed "run against production" batch; verified live
  // per supabase/README.md's 2026-08-21 entry).
  [
    'ALTER TABLE exercises ADD COLUMN weight_bearing_hands INTEGER',
    migrateWeightBearingHandsBackfill,
  ],
  // CC33 D112 R8 (ARCHITECTURE section 25; closes audit T2-26): the
  // per-episode "just hold my plan" choice. 'hold' stops the app's own
  // adaptation for that episode - no serve-time substitution, no diff
  // proposals, no coach volume holds, no adherence excusal - while
  // user-initiated suggestion surfaces (pickers, generation) keep
  // honouring the rules, because offering excluded work would be the
  // fail-open harm. NULL means 'propose', the standing default, so every
  // pre-migration row behaves byte-identically. Additive + idempotent.
  // Cloud counterpart: supabase/migrate_152_capability_adaptation_mode.sql
  // (APPLIED 2026-08-28 on the founder's named confirmation; pushes
  // carry the field only when some pushed row sets it).
  [
    migrateCapabilityAdaptationMode,
  ],
  // Exercise library expansion 2026-09-05 (docs/exercise-library-expansion-
  // 2026-09-05/05-DECISIONS.md EL-7, EL-9; 07-CORPUS-FORMAT.md section 5).
  // Two additive nullable columns on routine_exercises:
  //   group_kind          NULL = superset (today's behaviour, unchanged) |
  //                       'circuit' (the existing group-advance cycle runs
  //                       circuit semantics instead: no rest between
  //                       stations, round rest only after the last one).
  //   round_rest_seconds  the circuit's between-round rest, stored on every
  //                       member so the group header and the rest timer can
  //                       read it off whichever station just finished.
  // One additive nullable column on workout_sets:
  //   evidence_class      NULL = conventional | 'circuit' | 'ballistic' |
  //                       'circuit_ballistic'. Stamped at WRITE time by the
  //                       live screen from structure (group_kind) and
  //                       exercise metadata (load_character), never chosen
  //                       by the user (EL-7). Every pre-migration row reads
  //                       NULL = conventional, byte-identical to today.
  // All three are read defensively (`?? null`) everywhere, so a device that
  // has not yet run this migration, or a cloud row missing the column,
  // degrades to the pre-campaign behaviour rather than crashing.
  // Cloud counterparts: supabase/migrate_158_routine_exercise_groups.sql and
  // supabase/migrate_159_workout_set_evidence_class.sql (both written, NOT
  // applied - founder-gated per CLAUDE.md; supabase/README status block
  // records them WRITTEN, NOT APPLIED). Until applied, the push omits all
  // three columns while CIRCUIT_SYNC_COLUMNS_ENABLED
  // (src/lib/sync/featureFlags.js) is false; every pull applier already
  // reads these fields via `?? null`, so an absent cloud column degrades to
  // null with no crash.
  // Additive: yes (ALTER TABLE ADD COLUMN only). Safe to re-run: yes (the
  // benign-duplicate-column skip above covers a second run).
  // Rollback: leave the columns in place and ignore them; every reader
  // treats NULL as the pre-migration behaviour (ordinary superset / no
  // group; conventional evidence), and no circuit or evidence-classed row
  // can exist on a device that has not run this migration (the UI/live
  // paths that create one ship in the same build).
  [
    'ALTER TABLE routine_exercises ADD COLUMN group_kind TEXT',
    'ALTER TABLE routine_exercises ADD COLUMN round_rest_seconds INTEGER',
    'ALTER TABLE workout_sets ADD COLUMN evidence_class TEXT',
  ],
  // Exercise library expansion 2026-09-05 (docs/exercise-library-expansion-
  // 2026-09-05/05-DECISIONS.md EL-14, EL-19; 07-CORPUS-FORMAT.md section 5).
  //   Purpose:  two additive columns on `exercises` the structured corpus
  //             mapping (corpusEntryToSeedRow, src/lib/exerciseCorpus/
  //             index.js) now populates for every canonical row:
  //               aliases         JSON array of alternative search names
  //                               (e.g. "RDL" for "Romanian Deadlift"),
  //                               read back parsed by rowToCamel.
  //               load_character  'grind' | 'ballistic' | NULL, the
  //                               exercise-side half of EL-7's evidence
  //                               classification (workout_sets.evidence_class
  //                               is stamped from this at write time by the
  //                               live workout screen, not here).
  //   Applied locally: yes, on every device that reaches this migration
  //             index; ALTER TABLE ADD COLUMN only, so existing rows read
  //             NULL until the seed/re-derive pass (rederiveExerciseMetadataIfNeeded,
  //             METADATA_REDERIVE_KEY v3) fills them.
  //   Safe to re-run: yes — the benign-duplicate-column skip
  //             (isProvenBenignMigrationError) covers a second run.
  //   Synced: NO (EL-19). These are local-only, device-derived columns for
  //             the canonical library; canonical rows are never pushed, and
  //             a custom exercise's aliases stay out of scope for this
  //             campaign. Verified: sync.js's syncExercises() push (custom
  //             exercises only) does not read either column.
  //   Rollback: leave the columns in place and ignore them; every reader
  //             treats a NULL/absent value as "no aliases" / "grind"
  //             (ActiveWorkoutScreen and ExerciseDetailScreen are unaffected
  //             — neither reads these columns from this migration alone).
  [
    'ALTER TABLE exercises ADD COLUMN aliases TEXT',
    'ALTER TABLE exercises ADD COLUMN load_character TEXT',
  ],
];

// Tests and diagnostics may compare a database's durable marker with the
// actual migration head without executing the pipeline against a schema-less
// fake (which can mask missing-table defects in function migrations).
export const CURRENT_SCHEMA_VERSION = SCHEMA_MIGRATIONS.length;

async function addColumnIfMissing(d, table, column, ddl) {
  const columns = await d.getAllAsync(`PRAGMA table_info(${table})`);
  if (!Array.isArray(columns) || columns.length === 0) {
    throw new Error(`required migration table ${table} is missing`);
  }
  if (columns.some((entry) => entry?.name === column)) return false;
  await d.execAsync(ddl);
  const readback = await d.getAllAsync(`PRAGMA table_info(${table})`);
  if (!readback.some((entry) => entry?.name === column)) {
    throw new Error(`migration column ${table}.${column} did not persist`);
  }
  return true;
}

async function migrateCapabilityAdaptationMode(d) {
  await addColumnIfMissing(
    d,
    'capability_constraints',
    'adaptation_mode',
    "ALTER TABLE capability_constraints ADD COLUMN adaptation_mode TEXT CHECK (adaptation_mode IN ('propose','hold'))",
  );
}

// Backfill the new axis on canonical rows from the pure derivation, in
// the migrateDemandMetadataBackfill mould: canonical only (customs stay
// NULL - asked, never guessed), best-effort per row, failed rows stay
// NULL which reads as UNKNOWN.
async function migrateWeightBearingHandsBackfill(d) {
  // eslint-disable-next-line global-require
  const { deriveDemandMetadata: derive } = require('./capability/demands');
  const rows = await d.getAllAsync(
    `SELECT id, name, equipment, movement_pattern AS movementPattern,
            primary_muscle AS primaryMuscle, compound_isolation AS compoundIsolation
       FROM exercises WHERE is_custom = 0`,
  );
  for (const r of rows ?? []) {
    const m = derive(r);
    const v = m.weightBearingHands === true ? 1 : m.weightBearingHands === false ? 0 : null;
    // eslint-disable-next-line no-await-in-loop
    await d.runAsync('UPDATE exercises SET weight_bearing_hands = ? WHERE id = ?', [v, r.id]);
  }
}

// CC29 columns, guarded per the migrateLoadSemanticsBackfill convention:
// Both tables are guaranteed by earlier shipped migrations. A missing table is
// therefore corruption/incomplete migration state, not a benign fixture case.
async function migrateSwapCauseAndEffectiveChoice(d) {
  await addColumnIfMissing(d, 'exercise_swaps', 'cause', 'ALTER TABLE exercise_swaps ADD COLUMN cause TEXT');
  await addColumnIfMissing(
    d,
    'capability_constraints',
    'effective_choice',
    "ALTER TABLE capability_constraints ADD COLUMN effective_choice TEXT CHECK (effective_choice IN ('applied','declined'))",
  );
}

// CC27: backfill canonical exercises' demand columns from the pure
// derivation in capability/demands.js (lazy require; no import cycle - the
// module is dependency-free). Canonical rows only: custom rows stay NULL
// (CAP-8 - unknown is honest; the owner supplies axes progressively).
// Any read or write failure aborts this version. Advancing user_version after a
// partial backfill would make the omitted rows permanent and unrecoverable.
async function migrateDemandMetadataBackfill(d) {
  // eslint-disable-next-line global-require
  const { deriveDemandMetadata: derive } = require('./capability/demands');
  const rows = await d.getAllAsync(
    `SELECT id, name, equipment, movement_pattern AS movementPattern,
            primary_muscle AS primaryMuscle, compound_isolation AS compoundIsolation
       FROM exercises WHERE is_custom = 0`,
  );
  const asInt = (v) => (v === true ? 1 : v === false ? 0 : null);
  for (const r of rows ?? []) {
    const m = derive(r);
    // eslint-disable-next-line no-await-in-loop
    await d.runAsync(
        `UPDATE exercises SET
           position = ?, floor_access = ?, overhead_position = ?, grip_demand = ?,
           unilateral_loadable = ?, bilateral_upper = ?, bilateral_lower = ?,
           axial_load = ?, impact = ?, balance_demand = ?
         WHERE id = ?`,
        [
          m.position ?? null, asInt(m.floorAccess), asInt(m.overheadPosition),
          m.gripDemand ?? null, asInt(m.unilateralLoadable), asInt(m.bilateralUpper),
          asInt(m.bilateralLower), asInt(m.axialLoad), asInt(m.impact),
          m.balanceDemand ?? null, r.id,
        ],
    );
  }
  // Section 34.1 (CC-D26): custom rows never received EQUIPMENT metadata,
  // which is what the pool-entry requirements read - so custom parity was
  // structurally impossible however complete the owner's data. Derive the
  // equipment-driven fields (Audit B graded these derivations reliable)
  // for customs that carry an equipment string but no category yet. DEMAND
  // axes stay NULL on customs by design (section 8.4: they are ASKED, one
  // axis at a time, never guessed from a user-invented name).
  // eslint-disable-next-line global-require
  const { deriveExerciseMetadata } = require('./exerciseMetadata');
  const customs = await d.getAllAsync(
      `SELECT id, name, equipment, movement_pattern AS movementPattern,
              compound_isolation AS compoundIsolation
         FROM exercises
        WHERE is_custom = 1 AND equipment IS NOT NULL AND equipment_category IS NULL`,
  );
  for (const r of customs ?? []) {
    const m = deriveExerciseMetadata(r);
    // eslint-disable-next-line no-await-in-loop
    await d.runAsync(
          `UPDATE exercises SET
             equipment_category = ?, machine_type = ?, force = ?, laterality = ?,
             difficulty = ?, machine_ok = ?, home_ok = ?, equipment_profiles = ?
           WHERE id = ? AND equipment_category IS NULL`,
          [
            m.equipmentCategory ?? null, m.machineType ?? null, m.force ?? null,
            m.laterality ?? null, m.difficulty ?? null,
            m.machineOk ? 1 : 0, m.homeOk ? 1 : 0,
            m.equipmentProfiles ? JSON.stringify(m.equipmentProfiles) : null,
            r.id,
          ],
    );
  }
}

// Backfill canonical exercises' load_semantics from the seed's own
// derivation (single source of truth in seedExercises.js - lazy require to
// avoid the import cycle; both modules are fully loaded by migration time).
// The local custom_exercises mirror table gains the column here too, guarded
// separately. Both tables are guaranteed by earlier shipped migrations; a
// missing table or failed backfill aborts the version so it can be retried from
// the transaction boundary rather than permanently recording partial work.
async function migrateLoadSemanticsBackfill(d) {
  await addColumnIfMissing(
    d, 'custom_exercises', 'load_semantics',
    'ALTER TABLE custom_exercises ADD COLUMN load_semantics TEXT',
  );
  // eslint-disable-next-line global-require
  const { deriveLoadSemantics } = require('./seedExercises');
  const rows = await d.getAllAsync(
    'SELECT id, name, equipment, exercise_type AS exerciseType FROM exercises WHERE is_custom = 0',
  );
  for (const r of rows ?? []) {
    const sem = deriveLoadSemantics(r);
    if (sem !== 'total') {
      // eslint-disable-next-line no-await-in-loop
      await d.runAsync('UPDATE exercises SET load_semantics = ? WHERE id = ?', [sem, r.id]);
    }
  }
  await d.runAsync("UPDATE exercises SET load_semantics = 'total' WHERE load_semantics IS NULL");
}

async function migrateProgressPhotoMetaUserScope(d) {
  const cols = await d.getAllAsync('PRAGMA table_info(progress_photo_meta)');
  if (!Array.isArray(cols) || cols.length === 0) {
    await d.execAsync(`CREATE TABLE IF NOT EXISTS progress_photo_meta (
      user_id    TEXT,
      name       TEXT NOT NULL,
      taken_at   INTEGER NOT NULL,
      pose       TEXT,
      weight_kg  REAL,
      note       TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, name)
    )`);
    return;
  }
  if (cols.some((c) => c?.name === 'user_id')) return;

  await d.execAsync('ALTER TABLE progress_photo_meta RENAME TO progress_photo_meta_legacy_v55');
  await d.execAsync(`CREATE TABLE IF NOT EXISTS progress_photo_meta (
    user_id    TEXT,
    name       TEXT NOT NULL,
    taken_at   INTEGER NOT NULL,
    pose       TEXT,
    weight_kg  REAL,
    note       TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, name)
  )`);
  await d.execAsync(`INSERT OR REPLACE INTO progress_photo_meta
      (user_id, name, taken_at, pose, weight_kg, note, created_at, updated_at)
    SELECT NULL, name, taken_at, pose, weight_kg, note, created_at, updated_at
      FROM progress_photo_meta_legacy_v55`);
  await d.execAsync('DROP TABLE progress_photo_meta_legacy_v55');
}

// E3 search: the FTS5 index DDL, exported as a named function so the
// migration test can drive the REAL statements against a real SQLite build
// (node:sqlite) instead of pinning a copy that could drift. Called exactly
// once by the migration entry above; safe to re-run (IF NOT EXISTS
// throughout).
export async function ensureFoodSearchIndex(d) {
      try {
        await d.execAsync(
          `CREATE VIRTUAL TABLE IF NOT EXISTS foods_fts USING fts5(
             name, brand,
             content='foods', content_rowid='rowid',
             tokenize='porter unicode61', prefix='2 3 4')`
        );
      } catch (e) {
        // Swallow ONLY a genuinely missing FTS5 module (search then stays on
        // LIKE forever, by design). Any OTHER failure here — disk full, I/O
        // error, locked DB — must rethrow so the migration does NOT mark this
        // version done and retries on the next launch (E3 review: the old
        // blanket catch made one transient error permanently silent).
        const msg = String(e?.message || e).toLowerCase();
        if (msg.includes('no such module') || msg.includes('fts5')) {
          logWarn('database.migration.fts', `FTS5 unavailable, search stays on LIKE: ${e?.message || e}`);
          return; // no index, no triggers; query-time fallback covers it
        }
        throw e;
      }
      await d.execAsync(
        `CREATE VIRTUAL TABLE IF NOT EXISTS custom_foods_fts USING fts5(
           name, brand,
           content='custom_foods', content_rowid='rowid',
           tokenize='porter unicode61', prefix='2 3 4')`
      );
      // External-content sync triggers (the canonical FTS5 pattern): 'delete'
      // commands remove the OLD row's tokens; plain inserts add the new ones.
      await d.execAsync(
        `CREATE TRIGGER IF NOT EXISTS trg_foods_fts_ai AFTER INSERT ON foods BEGIN
           INSERT INTO foods_fts(rowid, name, brand) VALUES (new.rowid, new.name, new.brand);
         END`
      );
      await d.execAsync(
        `CREATE TRIGGER IF NOT EXISTS trg_foods_fts_ad AFTER DELETE ON foods BEGIN
           INSERT INTO foods_fts(foods_fts, rowid, name, brand) VALUES ('delete', old.rowid, old.name, old.brand);
         END`
      );
      await d.execAsync(
        `CREATE TRIGGER IF NOT EXISTS trg_foods_fts_au AFTER UPDATE ON foods BEGIN
           INSERT INTO foods_fts(foods_fts, rowid, name, brand) VALUES ('delete', old.rowid, old.name, old.brand);
           INSERT INTO foods_fts(rowid, name, brand) VALUES (new.rowid, new.name, new.brand);
         END`
      );
      await d.execAsync(
        `CREATE TRIGGER IF NOT EXISTS trg_custom_foods_fts_ai AFTER INSERT ON custom_foods BEGIN
           INSERT INTO custom_foods_fts(rowid, name, brand) VALUES (new.rowid, new.name, new.brand);
         END`
      );
      await d.execAsync(
        `CREATE TRIGGER IF NOT EXISTS trg_custom_foods_fts_ad AFTER DELETE ON custom_foods BEGIN
           INSERT INTO custom_foods_fts(custom_foods_fts, rowid, name, brand) VALUES ('delete', old.rowid, old.name, old.brand);
         END`
      );
      await d.execAsync(
        `CREATE TRIGGER IF NOT EXISTS trg_custom_foods_fts_au AFTER UPDATE ON custom_foods BEGIN
           INSERT INTO custom_foods_fts(custom_foods_fts, rowid, name, brand) VALUES ('delete', old.rowid, old.name, old.brand);
           INSERT INTO custom_foods_fts(rowid, name, brand) VALUES (new.rowid, new.name, new.brand);
         END`
      );
      // One-time build over whatever the tables already hold (existing
      // installs carry the ~29k-row bundled corpus at this point; fresh
      // installs rebuild an empty index and the triggers index the seed).
      await d.execAsync(`INSERT INTO foods_fts(foods_fts) VALUES('rebuild')`);
      await d.execAsync(`INSERT INTO custom_foods_fts(custom_foods_fts) VALUES('rebuild')`);
}

// Suppress only a duplicate-column error whose exact column can be proved to
// exist in the live schema. Message matching alone previously converted disk,
// fixture and arbitrary helper failures into a successful version bump.
async function isProvenBenignMigrationError(d, op, err) {
  if (typeof op !== 'string' || !/duplicate column/i.test(String(err?.message || err))) return false;
  const match = /^\s*ALTER TABLE\s+([A-Za-z0-9_]+)\s+ADD COLUMN\s+([A-Za-z0-9_]+)/i.exec(op);
  if (!match) return false;
  try {
    const columns = await d.getAllAsync(`PRAGMA table_info(${match[1]})`);
    return Array.isArray(columns) && columns.some((column) => column?.name === match[2]);
  } catch (_) {
    return false;
  }
}

// Exported for the migration ordering regression test (cardio_log incident,
// 2026-06-03). Takes a database handle so the test can drive it with a fake.
export async function runMigrations(d) {
  const row = await d.getFirstAsync('PRAGMA user_version');
  const current = row?.user_version;
  if (!Number.isInteger(current) || current < 0) {
    throw new Error('Could not establish a valid local schema version.');
  }

  // COMP-009: take a byte-for-byte snapshot once, only when migrations are
  // actually pending, BEFORE the first op runs — so a failed migration is
  // recoverable from Settings. Pending-only because _doInit runs on every cold
  // start and snapshotting an unchanged DB each launch would copy a multi-MB
  // file for nothing. Fully best-effort: a snapshot (or checkpoint) failure
  // must NEVER block the migration, or a full disk could brick an update.
  if (current < SCHEMA_MIGRATIONS.length) {
    try {
      // Flush WAL so the copied file is a complete, consistent database.
      await d.execAsync('PRAGMA wal_checkpoint(FULL);');
    } catch (_) { /* checkpoint best-effort */ }
    try {
      // Lazy require keeps expo-file-system out of database.js's module graph
      // (and out of every test that imports the database module).
      // eslint-disable-next-line global-require
      const { snapshotBeforeMigration } = require('./dbSnapshot');
      await snapshotBeforeMigration(current, SCHEMA_MIGRATIONS.length);
    } catch (_) { /* snapshot best-effort */ }
  }

  for (let v = current; v < SCHEMA_MIGRATIONS.length; v++) {
    // MIGRATION DURABILITY (adversarial audit 2026-08-26, finding 3).
    //
    // A version's ops and its user_version bump used to be separate,
    // unprotected statements. So a process death part-way through a version —
    // an OOM kill, a battery cut-off, the user force-quitting an update that
    // felt stuck — left the schema half-changed with the OLD version still
    // recorded, and the next launch re-ran that version from the top against a
    // database it had already partly modified.
    //
    // For a version of plain additive DDL that was survivable, because the
    // benign-error skip below absorbs "duplicate column name" and "already
    // exists". Nothing else was. v55 renames progress_photo_meta aside, builds
    // the replacement, copies the rows and drops the original: die between the
    // rename and the create and the re-run throws "no such table", which is
    // NOT benign, so every subsequent launch fails the same way and the only
    // route back is the COMP-009 snapshot. The v18 exercise-id canonicalisation
    // rewrites foreign keys across routine_exercises, workout_sets,
    // exercise_user_notes and exercise_goals before updating exercises itself;
    // its own comment says the references "stay valid throughout the
    // transaction", and there was no transaction. Half of that rewrite is
    // logged training history pointing at ids that no longer exist.
    //
    // One transaction per version fixes both: the version either applies whole
    // or not at all, and a retry always starts from a clean boundary. Four
    // things this relies on were measured against SQLite rather than assumed:
    // DDL is transactional; PRAGMA user_version is transactional and rolls
    // back with the ops it describes; and neither "duplicate column name" nor
    // "table already exists" aborts the surrounding transaction, so the skip
    // below still behaves exactly as it did.
    //
    // THROUGH THE HANDLE'S OWN TRANSACTION, and deliberately NOT through
    // runInTransaction. The queue's reentrancy check inline-joins a
    // transaction it does not own (`inTx() && !_txQueueActive`), which is
    // exactly what the v22 mesocycle-week re-id migration needs when it calls
    // runInTransaction from inside this one. Wrapping the version in
    // runInTransaction instead would set _txQueueActive, sending that inner
    // call down the queued path to wait on _txTail — the promise for the very
    // transaction it is running inside. That deadlocks on first launch after
    // an update, which is the worst possible place for one.
    //
    // Nothing else can be touching this connection: migrations run inside
    // _doInit against the unpublished handle, and every other caller reaches
    // SQLite through db(), which awaits _initPromise. That is also why a
    // deferred BEGIN is sufficient here and no raw BEGIN IMMEDIATE is needed
    // (D74 bans those outside the queue, correctly).
    await d.withTransactionAsync(async () => {
      for (const op of SCHEMA_MIGRATIONS[v]) {
        try {
          // Function migrations let us run JS (e.g. compute deterministic
          // IDs and UPDATE rows) inside the same versioned migration
          // pipeline as plain SQL strings. The function is passed the
          // database handle and may use any of its async methods.
          if (typeof op === 'function') {
            await op(d);
          } else {
            await d.execAsync(op);
          }
        } catch (e) {
          if (await isProvenBenignMigrationError(d, op, e)) continue;
          // Logged HERE rather than at the throw site outside the transaction.
          // withTransactionAsync rolls back before rethrowing and does not
          // guard that ROLLBACK, so on the pathological path the caller can
          // receive the rollback's error instead of this one. Recording the
          // real cause first means a bricked upgrade is still diagnosable.
          logWarn('database.migration', `migration v${v + 1} failed: ${e?.message || e}`);
          throw e;
        }
      }
      // Inside the transaction, deliberately: the recorded version and the
      // schema it describes must never disagree.
      // PRAGMA does not accept bound params; v is an integer we control.
      await d.execAsync(`PRAGMA user_version = ${v + 1}`);
    });
    // A throw propagates from here having already rolled back. initDatabase
    // clears _initPromise on failure, so the next db() call retries from the
    // version boundary rather than from a half-applied schema.
  }
}

// E3 search: rebuild the FTS index from the base tables. The index is
// external-content (stores nothing of its own), so this is always safe and
// makes it fully reconstructible on demand — the required recovery path if
// the index ever drifts from foods/custom_foods (e.g. rows written while a
// pre-FTS app version ran alongside, or an interrupted restore). Returns
// false (never throws) when FTS5/the tables are unavailable.
export async function rebuildFoodSearchIndex() {
  try {
    const d = await db();
    await d.execAsync(`INSERT INTO foods_fts(foods_fts) VALUES('rebuild')`);
    await d.execAsync(`INSERT INTO custom_foods_fts(custom_foods_fts) VALUES('rebuild')`);
    return true;
  } catch (e) {
    logWarn('database.rebuildFoodSearchIndex', e?.message || String(e));
    return false;
  }
}

// Exported so peer modules (syncQueue.js) can grab the SQLite handle
// directly. Without this export, `import { db } from './database'` in
// syncQueue resolved to undefined and every `await db()` call there
// threw "undefined is not a function" on entry, the bug that made
// every drainSyncQueue invocation fail before processing any row.
export async function db() {
  // Gate on the in-flight init first (audit 2026-07-01 race): while _doInit runs,
  // _db is null and _initPromise resolves only once schema + migrations finish,
  // so awaiting it hands back a fully-ready handle rather than a half-open one.
  if (_initPromise) return _initPromise;
  return _db || initDatabase();
}

// Serialise every SQLite transaction through one queue.
//
// expo-sqlite's withTransactionAsync is explicitly NOT exclusive on the
// shared connection (its own docs: "not exclusive and can be interrupted by
// other async queries"). When two transaction blocks overlap on the single
// connection — e.g. plan generation (generateMesocycleWeeks) running while
// the offline-sync retry queue drains (syncQueue.js), which both fire during
// onboarding — SQLite rejects the second BEGIN with "cannot start a
// transaction within a transaction". That surfaced as plan setup failing
// with "NativeDatabase.execAsync has been rejected".
//
// runInTransaction chains transactions so only one BEGIN/COMMIT is ever in
// flight across the whole app (database, food, sync all route through here).
//
// Reentrancy contract (tightened 2026-07-11, R2-11 structural follow-up):
// nested runInTransaction calls are FORBIDDEN - a nested call would queue
// behind its own enclosing transaction and deadlock. In-transaction callers
// use the *InTx variants (deleteProgrammeCascadeInTx) instead; the call-graph
// audit of every task body found exactly one nest (planAutoGen's zero-match
// rollback) and it was un-nested. The old blanket inline guard
// (`if (inTx()) return task()`) is now scoped to transactions the queue does
// NOT own (a manual BEGIN, e.g. seed/import paths): a runInTransaction call
// arriving while a QUEUED transaction is open used to inline-join that
// foreign transaction - its writes committed or rolled back with someone
// else's work and never serialised. Such callers now queue like everyone
// else.
let _txTail = Promise.resolve();
let _txQueueActive = false;
export async function runInTransaction(d, task) {
  const inTx = () => typeof d.isInTransactionSync === 'function' && d.isInTransactionSync();
  // Inline-join ONLY a transaction the queue does not own (a manual BEGIN
  // elsewhere): queueing behind a transaction the queue cannot see would
  // start a second BEGIN inside it.
  if (inTx() && !_txQueueActive) return task();
  // R2-13 (production, build 2694, founder repro "Cannot read property
  // 'zeroMatch' of undefined" at plan generation): expo-sqlite's
  // withTransactionAsync AWAITS the task but DISCARDS its return value, so
  // this used to resolve to undefined on the normal path and any caller
  // consuming the result (planAutoGen's writeResult since 4900099) blew up
  // AFTER the commit. Capture the task's result in a closure so callers get
  // it back on every path; commit/rollback semantics are unchanged.
  const run = _txTail.then(async () => {
    if (inTx()) return task();
    _txQueueActive = true;
    try {
      let result;
      await d.withTransactionAsync(async () => { result = await task(); });
      return result;
    } finally {
      _txQueueActive = false;
    }
  });
  // Keep the queue alive whatever this transaction's outcome.
  _txTail = run.then(() => {}, () => {});
  return run;
}

// R2-11 structural follow-up: single-statement writes that can fire while a
// queued transaction holds the connection (set logging, engine telemetry)
// ride the same queue, so they never contend with an open BEGIN - the
// busy_timeout pragma then only covers the residual native-thread window.
// NEVER call this from inside a runInTransaction task: it would queue behind
// its own transaction and deadlock (call-graph audited 2026-07-11 - neither
// createWorkoutSet nor recordEngineTelemetry is reachable from a task).
function queuedWrite(fn) {
  const run = _txTail.then(() => fn());
  _txTail = run.then(() => {}, () => {});
  return run;
}

// ─── Exercises ───────────────────────────────────────────────────────────────────────────────────

// HP-9: the exercise library (~400 rows) is read on nearly every analysis
// screen, and it barely ever changes within a session. Cache the camelCased
// list in memory and serve it until an exercise write invalidates it. Every
// function that writes the exercises table calls _invalidateExercisesCache,
// so a created / edited / deleted / synced exercise shows up immediately;
// the cache is never stale. Callers treat the result as read-only (every
// current one only maps/filters it), so the shared reference is safe.
let _allExercisesCache = null;

export function _invalidateExercisesCache() {
  _allExercisesCache = null;
}

export async function getAllExercises() {
  if (_allExercisesCache) return _allExercisesCache;
  const d = await db();
  // EL-18: excludes a soft-deleted custom exercise (deleteExercise sets
  // deleted_at) from every browse/search/generation surface this feeds.
  // A canonical row's deleted_at is never set, so this changes nothing
  // for the built-in library. getExerciseById and the routine-exercise
  // join deliberately stay unfiltered - a routine that still references a
  // deleted exercise keeps resolving its name/metadata for display.
  const rows = await d.getAllAsync(
    'SELECT * FROM exercises WHERE deleted_at IS NULL ORDER BY name ASC',
  );
  _allExercisesCache = rows.map(rowToCamel);
  return _allExercisesCache;
}

export async function getExerciseById(id) {
  const d = await db();
  const row = await d.getFirstAsync('SELECT * FROM exercises WHERE id = ?', [id]);
  return rowToCamel(row);
}

export async function getExercisesByMuscle(muscle) {
  const d = await db();
  const rows = await d.getAllAsync(
    'SELECT * FROM exercises WHERE lower(primary_muscle) = lower(?)',
    [muscle],
  );
  return rows.map(rowToCamel);
}

export async function insertExercise(data) {
  return insertExerciseWithId(uid(), data);
}

// Variant that accepts a caller-supplied id. seedExercisesIfNeeded uses
// it to plant canonical exercises with deterministic (name-hashed)
// UUIDs so every install produces the same ID for the same canonical
// name, see canonicalExerciseId() in seedExercises.js for the
// rationale.
export async function insertExerciseWithId(id, data) {
  const d = await db();
  const now = Date.now();
  await d.runAsync(
    `INSERT OR IGNORE INTO exercises
      (id, name, primary_muscle, secondary_muscles, equipment, movement_pattern,
       compound_isolation, default_rep_min, default_rep_max, fatigue_cost,
       stimulus_to_fatigue_ratio, subregion, is_custom, notes, created_at, updated_at,
       exercise_category, increment_kg,
       equipment_category, machine_type, force, laterality, difficulty,
       machine_ok, home_ok, cue, equipment_profiles, exercise_type, load_semantics,
       position, floor_access, overhead_position, grip_demand, unilateral_loadable,
       bilateral_upper, bilateral_lower, axial_load, impact, balance_demand,
       weight_bearing_hands, aliases, load_character)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
             ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
             ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.name,
      data.primaryMuscle || null,
      data.secondaryMuscles ? JSON.stringify(data.secondaryMuscles) : null,
      data.equipment || null,
      data.movementPattern || null,
      data.compoundIsolation || null,
      data.defaultRepMin ?? null,
      data.defaultRepMax ?? null,
      data.fatigueCost ?? null,
      data.stimulusToFatigueRatio ?? null,
      data.subregion ?? null,
      data.isCustom ? 1 : 0,
      data.notes || null,
      now,
      now,
      data.exerciseCategory ?? 'compound',
      data.incrementKg ?? 2.5,
      data.equipmentCategory ?? null,
      data.machineType ?? null,
      data.force ?? null,
      data.laterality ?? null,
      data.difficulty ?? null,
      data.machineOk ? 1 : 0,
      data.homeOk ? 1 : 0,
      data.cue ?? null,
      data.equipmentProfiles ? JSON.stringify(data.equipmentProfiles) : null,
      data.exerciseType ?? 'weight_reps',
      // D107-2: what the entered weight means. 'total' is today's de facto
      // meaning, so an omitted value changes nothing.
      data.loadSemantics ?? 'total',
      // CC27 demand ontology (sections 5.4, 8): NULL = UNKNOWN (CAP-8).
      // The seed derives these; custom creation leaves them NULL unless
      // the owner answers the single-axis ask.
      data.position ?? null,
      data.floorAccess === true ? 1 : data.floorAccess === false ? 0 : null,
      data.overheadPosition === true ? 1 : data.overheadPosition === false ? 0 : null,
      data.gripDemand ?? null,
      data.unilateralLoadable === true ? 1 : data.unilateralLoadable === false ? 0 : null,
      data.bilateralUpper === true ? 1 : data.bilateralUpper === false ? 0 : null,
      data.bilateralLower === true ? 1 : data.bilateralLower === false ? 0 : null,
      data.axialLoad === true ? 1 : data.axialLoad === false ? 0 : null,
      data.impact === true ? 1 : data.impact === false ? 0 : null,
      data.balanceDemand ?? null,
      data.weightBearingHands === true ? 1 : data.weightBearingHands === false ? 0 : null,
      // Exercise-library-expansion-2026-09-05 (EL-14/EL-19): local-only,
      // never synced for canonical rows. aliases is a JSON string array;
      // an absent/empty value stores as NULL, read back as [] by
      // rowToCamel's JSON-parse special case.
      Array.isArray(data.aliases) && data.aliases.length ? JSON.stringify(data.aliases) : null,
      data.loadCharacter ?? null,
    ],
  );
  _invalidateExercisesCache();
  return { id, ...data, createdAt: now, updatedAt: now };
}

// Exercise-library-expansion-2026-09-05 (EL-18): soft delete, not a hard
// DELETE. Two reasons. First, `getRoutineExercisesWithDetails` LEFT JOINs
// `exercises` and falls back to the denormalised `exercise_name` snapshot
// when the join misses (:4622 area) - a routine that still references a
// deleted exercise keeps displaying it either way, but tombstoning (row
// stays, `deleted_at` set) keeps its full metadata (equipment, muscle) for
// that join, rather than degrading to name-only. Second: no deletion sync
// path exists for exercises today (`sync.syncExercises` only ever
// upserts whatever the local `exercises` table currently holds; there is
// no push-a-tombstone step, unlike `deleteWorkoutFromCloud`'s pattern) -
// this is LOCAL-ONLY. A hard delete would just silently stop being
// re-pushed and never actually remove the cloud `custom_exercises` row
// (which itself carries a `deleted_at` per migrate_020, but nothing
// writes it), so a soft delete is not a downgrade from the old hard
// delete's cloud behaviour - neither ever removed the cloud copy. Scoped
// to is_custom = 1 exactly as the old hard delete was: a canonical row is
// never reachable here.
export async function deleteExercise(id) {
  const d = await db();
  const now = Date.now();
  await d.runAsync(
    'UPDATE exercises SET deleted_at = ?, updated_at = ? WHERE id = ? AND is_custom = 1',
    [now, now, id],
  );
  _invalidateExercisesCache();
  _scheduleSync();
}

// EL-18: which of this user's routines still reference an exercise (used
// by the custom-exercise delete confirm, so it can name the routines
// rather than silently orphaning them). Undeleted routine_exercises rows,
// on undeleted routines owned by this user only.
export async function getRoutinesReferencingExercise(userId, exerciseId) {
  if (!userId || !exerciseId) return [];
  const d = await db();
  const rows = await d.getAllAsync(
    `SELECT DISTINCT r.id, r.name
       FROM routine_exercises re
       JOIN routines r ON r.id = re.routine_id
      WHERE re.exercise_id = ? AND re.deleted_at IS NULL
        AND r.user_id = ? AND r.deleted_at IS NULL
      ORDER BY r.name ASC`,
    [exerciseId, userId],
  );
  return rows.map(rowToCamel);
}

// Update only the derived metadata columns on an exercise. Used by the
// one-time backfill that populates equipment_category and friends on
// installs whose canonical rows were seeded before those columns existed
// (docs/audit/volyume-exercise-audit-2026-05-30). Additive and idempotent:
// it overwrites the metadata columns and nothing else. equipment_profiles
// is stored as a JSON array string, matching insertExerciseWithId. Does not
// schedule a sync; canonical exercises are local and the columns don't sync.
// CC27 (sections 8.4, 34.1): write ONE or more demand axes on an exercise -
// the owner answering the single-axis ask on a custom exercise, or a
// curation correction. Only the axes present in `meta` change; everything
// else is untouched. updated_at moves because this IS a user edit.
export async function updateExerciseDemands(id, meta = {}) {
  if (!id) return;
  const cols = {
    position: (v) => v ?? null,
    floorAccess: (v) => (v === true ? 1 : v === false ? 0 : null),
    overheadPosition: (v) => (v === true ? 1 : v === false ? 0 : null),
    gripDemand: (v) => v ?? null,
    unilateralLoadable: (v) => (v === true ? 1 : v === false ? 0 : null),
    bilateralUpper: (v) => (v === true ? 1 : v === false ? 0 : null),
    bilateralLower: (v) => (v === true ? 1 : v === false ? 0 : null),
    axialLoad: (v) => (v === true ? 1 : v === false ? 0 : null),
    impact: (v) => (v === true ? 1 : v === false ? 0 : null),
    balanceDemand: (v) => v ?? null,
    weightBearingHands: (v) => (v === true ? 1 : v === false ? 0 : null),
  };
  const toSnake = {
    position: 'position', floorAccess: 'floor_access', overheadPosition: 'overhead_position',
    gripDemand: 'grip_demand', unilateralLoadable: 'unilateral_loadable',
    bilateralUpper: 'bilateral_upper', bilateralLower: 'bilateral_lower',
    axialLoad: 'axial_load', impact: 'impact', balanceDemand: 'balance_demand',
    weightBearingHands: 'weight_bearing_hands',
  };
  const sets = [];
  const args = [];
  for (const [key, convert] of Object.entries(cols)) {
    if (key in meta) {
      sets.push(`${toSnake[key]} = ?`);
      args.push(convert(meta[key]));
    }
  }
  if (!sets.length) return;
  const d = await db();
  await d.runAsync(
    `UPDATE exercises SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`,
    [...args, Date.now(), id],
  );
  _invalidateExercisesCache();
  _scheduleSync();
}

// Exercise-library-expansion-2026-09-05 (EL-14/EL-16/EL-21): extended
// beyond the original six equipment-derived columns to also carry the
// corpus mapping's aliases/load_character/cue/exercise_category/
// increment_kg and the coarse `equipment` column itself (a band/landmine/
// suspension row's coarse equipment can change under the corpus
// reclassification). Every new field is OPTIONAL on `meta`: the plain
// backfill call (deriveExerciseMetadata output only) omits them, and an
// omitted field leaves the column untouched rather than nulling it, so
// backfillExerciseMetadataIfNeeded's existing behaviour is unchanged.
export async function updateExerciseMetadata(id, meta) {
  const d = await db();
  const sets = [
    'equipment_category = ?', 'machine_type = ?', 'force = ?', 'laterality = ?',
    'difficulty = ?', 'machine_ok = ?', 'home_ok = ?', 'equipment_profiles = ?',
  ];
  const args = [
    meta.equipmentCategory ?? null,
    meta.machineType ?? null,
    meta.force ?? null,
    meta.laterality ?? null,
    meta.difficulty ?? null,
    meta.machineOk ? 1 : 0,
    meta.homeOk ? 1 : 0,
    meta.equipmentProfiles ? JSON.stringify(meta.equipmentProfiles) : null,
  ];
  if (meta.equipment !== undefined) { sets.push('equipment = ?'); args.push(meta.equipment ?? null); }
  if (meta.aliases !== undefined) {
    sets.push('aliases = ?');
    args.push(Array.isArray(meta.aliases) && meta.aliases.length ? JSON.stringify(meta.aliases) : null);
  }
  if (meta.loadCharacter !== undefined) { sets.push('load_character = ?'); args.push(meta.loadCharacter ?? null); }
  if (meta.cue !== undefined) { sets.push('cue = ?'); args.push(meta.cue || null); }
  if (meta.exerciseCategory !== undefined) { sets.push('exercise_category = ?'); args.push(meta.exerciseCategory ?? 'compound'); }
  if (meta.incrementKg !== undefined) { sets.push('increment_kg = ?'); args.push(meta.incrementKg ?? 2.5); }
  sets.push('updated_at = ?');
  args.push(Date.now(), id);
  await d.runAsync(`UPDATE exercises SET ${sets.join(', ')} WHERE id = ?`, args);
  _invalidateExercisesCache();
}

// ─── Workouts ─────────────────────────────────────────────────────────────────────────────────────

export async function getAllWorkouts(userId) {
  const d = await db();
  const rows = await d.getAllAsync(
    `SELECT w.*, r.name AS routine_name
     FROM workouts w
     LEFT JOIN routines r ON r.id = w.routine_id
     WHERE w.user_id = ?
     ORDER BY w.started_at DESC`,
    [userId],
  );
  return rows.map(rowToCamel);
}

// D17: raw completed-workout start timestamps, unfiltered by date, for the
// habit-derived training-reminder schedule (trainingHabitSchedule.js). That
// module needs the full history (to find how far back it goes, then bucket
// the trailing window itself), not a bounded/paged read, so this is
// deliberately separate from getRecentCompletedWorkouts above.
export async function getCompletedWorkoutStartTimestamps(userId) {
  if (!userId) return [];
  const d = await db();
  const rows = await d.getAllAsync(
    `SELECT started_at FROM workouts
     WHERE user_id = ? AND is_completed = 1 AND started_at IS NOT NULL
     ORDER BY started_at ASC`,
    [userId],
  );
  return rows.map((r) => r.started_at);
}

// Workout History renders a bounded recent page. Keep this separate from
// getAllWorkouts because analytics, sync and coach flows still need full
// history reads.
export async function getRecentCompletedWorkouts(userId, limit = 50) {
  const parsedLimit = Number(limit);
  const safeLimit = Number.isFinite(parsedLimit) ? Math.max(0, Math.floor(parsedLimit)) : 50;
  if (!userId || safeLimit <= 0) return [];
  const d = await db();
  const rows = await d.getAllAsync(
    `SELECT w.*, r.name AS routine_name
     FROM workouts w
     LEFT JOIN routines r ON r.id = w.routine_id
     WHERE w.user_id = ? AND w.is_completed = 1
     ORDER BY COALESCE(w.ended_at, w.started_at, w.created_at) DESC
     LIMIT ?`,
    [userId, safeLimit],
  );
  return rows.map(rowToCamel);
}

export async function getWorkoutById(id) {
  const d = await db();
  const row = await d.getFirstAsync('SELECT * FROM workouts WHERE id = ?', [id]);
  return rowToCamel(row);
}

// LB-8: fire-and-forget engagement telemetry. Lazy-requires the transport
// (like food/db.js) so test environments that mock the DB don't pull in the
// supabase client, and so the opt-out gate in transport applies uniformly.
function _trackEvent(userId, event, payload) {
  if (!userId) return;
  try {
    // eslint-disable-next-line global-require
    const { track } = require('./engineTelemetry');
    track(userId, event, payload ?? null).catch(() => {});
  } catch (_) { /* tolerate test env without telemetry */ }
}

export async function createWorkout(
  userId,
  routineId = null,
  // COMP-008: the pre-workout intent prompt now also captures the three
  // walked-in-with readiness facts. soreness24hBefore is on the existing 1-3
  // scale (Fresh/Mild/Sore) the adaptive engine + computeRecoveryEMAs read;
  // sleepQuality/energyScore are on the 1-5 domain (the prompt offers 2/3/4).
  // All three are optional: a Skip start passes none and they stay NULL.
  {
    intent = null, soreness24hBefore = null, sleepQuality = null, energyScore = null,
    // When Home/Plans starts the authoritative outstanding session it passes
    // that exact programme-week identity. Calendar attribution remains the
    // fallback for free-form/manual sessions whose caller has no position.
    mesocycleWeekId: authoritativeWeekId = undefined,
  } = {},
) {
  const d = await db();
  // Auto-link to the active mesocycle so tonnage + recovery data flows into the block dashboard
  // Campaign 1 P0-8 D4: ORDER BY created_at DESC. Two rows CAN carry
  // is_active = 1 (two devices each starting a block while offline), and
  // an unordered LIMIT 1 then attributed the session to an arbitrary
  // block. This matches getActiveBlock's tiebreak, so every reader of
  // "the active block" agrees on the same row.
  const activeMeso = await d.getFirstAsync(
    'SELECT id FROM mesocycles WHERE user_id = ? AND is_active = 1 ORDER BY created_at DESC LIMIT 1',
    [userId],
  );
  const mesocycleId = activeMeso?.id ?? null;
  // Link to the TRUE current week of the block (Wave 2, cross-surface-
  // consistency-audit-2026-07-30): this used to be
  // `ORDER BY week_index ASC LIMIT 1`, which pinned EVERY workout to week 1
  // forever, so every consumer of mesocycle_week_id (RIR ladder, deload
  // prescription, adaptation-event attribution, the block-complete recap)
  // was stuck reading week 1's data for the life of the block.
  // getCurrentMesocycleWeek is the single date-based resolver every other
  // block/week surface reads; only accept its week when it belongs to THIS
  // same active mesocycle (defensive -- it resolves its own active block,
  // which should always be this row).
  let mesocycleWeekId = null;
  if (mesocycleId) {
    if (authoritativeWeekId !== undefined) {
      const ownedWeek = authoritativeWeekId
        ? await d.getFirstAsync(
          'SELECT id FROM mesocycle_weeks WHERE id = ? AND mesocycle_id = ?',
          [authoritativeWeekId, mesocycleId],
        ) : null;
      if (!ownedWeek) throw new Error('Authoritative programme week is not in the active block');
      mesocycleWeekId = ownedWeek.id;
    } else {
      const currentWeek = await getCurrentMesocycleWeek(userId).catch(() => null);
      mesocycleWeekId = (currentWeek?.mesocycleId === mesocycleId) ? currentWeek.weekRowId : null;
    }
  }
  const id = uid();
  const now = Date.now();
  await d.runAsync(
    `INSERT INTO workouts (id, user_id, routine_id, mesocycle_id, mesocycle_week_id, started_at, is_completed, pre_workout_intent, soreness_24h_before, sleep_quality, energy_score, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`,
    [id, userId, routineId, mesocycleId, mesocycleWeekId, now, intent, soreness24hBefore, sleepQuality, energyScore, now, now],
  );
  // LB-8: a session was started. from_routine distinguishes plan-driven
  // starts from free/empty sessions; no training content in the payload.
  _trackEvent(userId, 'workout_started', { from_routine: !!routineId });
  // Activation funnel (lead activation ruling, 2026-09-03): the first-ever
  // session start, once per user, durably. Fire-and-forget alongside the
  // event above, never in place of it.
  if (userId) {
    try {
      // eslint-disable-next-line global-require
      const { trackFirst } = require('./telemetry/firsts');
      trackFirst(userId, 'first_workout_started').catch(() => {});
    } catch (_) { /* tolerate test env without telemetry */ }
  }
  return { id, userId, routineId, mesocycleId, mesocycleWeekId, startedAt: now, isCompleted: 0, preWorkoutIntent: intent, soreness24hBefore, sleepQuality, energyScore, createdAt: now, updatedAt: now };
}

async function _updateWorkoutOnDb(d, id, data, now = Date.now(), identity = null) {
  const fieldMap = {
    endedAt: 'ended_at',
    durationMinutes: 'duration_minutes',
    isCompleted: 'is_completed',
    notes: 'notes',
    sessionDifficulty: 'session_difficulty',
    overallPump: 'overall_pump',
    soreness24hBefore: 'soreness_24h_before',
    jointDiscomfort: 'joint_discomfort',
    fatigueLevel: 'fatigue_level',
    lastActivityAt: 'last_activity_at',
    activeElapsedSeconds: 'active_elapsed_seconds',
    name: 'name',
    setCount: 'set_count',
    totalVolume: 'total_volume',
  };
  const fields = [];
  const values = [];
  for (const [key, col] of Object.entries(fieldMap)) {
    if (key in data) {
      fields.push(`${col} = ?`);
      values.push(typeof data[key] === 'boolean' ? (data[key] ? 1 : 0) : data[key]);
    }
  }
  if (fields.length === 0) return;
  fields.push('updated_at = ?');
  values.push(now, id);
  let where = 'id = ?';
  if (identity) {
    where += ' AND user_id = ? AND routine_id = ? AND mesocycle_week_id = ?';
    values.push(identity.userId, identity.routineId, identity.mesocycleWeekId);
  }
  return d.runAsync(`UPDATE workouts SET ${fields.join(', ')} WHERE ${where}`, values);
}

export async function updateWorkout(id, data) {
  const d = await db();
  await _updateWorkoutOnDb(d, id, data);
}

// Hard-delete an incomplete workout and its sets. Used when the user
// discards a session mid-way. Incomplete workouts never sync to the
// cloud (bulkUploadLocalData + pullFromCloud both filter on
// is_completed=true), so a hard delete here is safe and avoids the
// SQLite bloat that comes from leaving orphaned in_progress rows
// around with all their sets attached.
export async function deleteIncompleteWorkout(workoutId) {
  if (!workoutId) return false;
  const d = await db();
  const deleted = await runInTransaction(d, async () => {
    const workout = await d.getFirstAsync(
      'SELECT id, is_completed FROM workouts WHERE id = ?',
      [workoutId],
    );
    if (!workout || Number(workout.is_completed) === 1) return false;

    await d.runAsync('DELETE FROM workout_sets WHERE workout_id = ?', [workoutId]);
    await d.runAsync('DELETE FROM workouts WHERE id = ? AND is_completed = 0', [workoutId]);
    // Round 11 (hygiene): the session's constraint-effects record would
    // otherwise outlive the discarded workout - invisible to the weekly
    // counters (they join workouts) but persisted, synced, and present
    // in the Article 20 export. Tombstoned, not hard-deleted: the table
    // syncs, so deleted_at is its delete.
    const now = Date.now();
    await d.runAsync(
      'UPDATE session_constraint_effects SET deleted_at = ?, updated_at = ? WHERE workout_id = ? AND deleted_at IS NULL',
      [now, now, workoutId],
    );
    return true;
  });
  // Round 17 (Q2): the tombstone schedules its own push, like every
  // other effects write - it used to wait for whatever unrelated write
  // came next before travelling.
  if (deleted) _scheduleSync();
  return deleted;
}

// Hard-delete ANY workout and its sets (founder request 2026-06-12: remove a
// half-logged session, or start fresh, from Workout History). Local rows go
// immediately; every derived surface (streaks, weekly volume, PRs, lift
// progress) recomputes from local rows, so they self-heal on next view. The
// streak high-water deliberately never shrinks (retro-shrink guard) and
// already-seen milestones stay seen, both by design.
//
// The CLOUD copy is removed by sync.deleteWorkoutFromCloud (the caller pairs
// the two; on failure it enqueues a 'workout_delete' op) so a restore pull
// cannot resurrect the session. Scoped to the owning user as a guard against
// a stale id crossing accounts on a shared device.
export async function deleteWorkoutAndSets(userId, workoutId) {
  if (!userId || !workoutId) return false;
  const d = await db();
  const row = await d.getFirstAsync(
    'SELECT id FROM workouts WHERE id = ? AND user_id = ?', [workoutId, userId],
  );
  if (!row) return false;
  await d.runAsync('DELETE FROM workout_sets WHERE workout_id = ?', [workoutId]);
  await d.runAsync('DELETE FROM workouts WHERE id = ?', [workoutId]);
  // Round 12 (R12-4): the session's constraint-effects record dies with
  // the workout on THIS delete path too - round 11 tombstoned only the
  // incomplete-discard path, so deleting a completed session from
  // history left its record live, synced, and in the Article 20 export.
  // Tombstoned, not hard-deleted: the table syncs, so deleted_at is its
  // delete (and createSessionConstraintEffect preserves it, so a racing
  // best-effort write cannot resurrect the record).
  const now = Date.now();
  await d.runAsync(
    'UPDATE session_constraint_effects SET deleted_at = ?, updated_at = ? WHERE workout_id = ? AND deleted_at IS NULL',
    [now, now, workoutId],
  );
  // Round 17 (Q2): schedule the tombstone's push here too - the caller
  // pairs the WORKOUT's cloud delete directly, but this table travels
  // by the sync queue.
  _scheduleSync();
  return true;
}

// ─── Workout Sets ──────────────────────────────────────────────────────────────────────────────────────

export async function getAllWorkoutSets(userId) {
  const d = await db();
  const rows = await d.getAllAsync(
    'SELECT * FROM workout_sets WHERE user_id = ? ORDER BY created_at DESC',
    [userId],
  );
  return rows.map(rowToCamel);
}

// Returns only sets from completed workouts, use for volume analytics.
export async function getCompletedWorkoutSets(userId) {
  const d = await db();
  const rows = await d.getAllAsync(
    `SELECT ws.* FROM workout_sets ws
     JOIN workouts w ON ws.workout_id = w.id
     WHERE ws.user_id = ? AND w.is_completed = 1
     ORDER BY ws.created_at DESC`,
    [userId],
  );
  return rows.map(rowToCamel);
}

// LB-7: a bounded recent window of sets, so the recent-window callers
// (Home block progress, the 28-day insights engine) pull a slice instead
// of the whole history. completedOnly mirrors the two prior call sites
// exactly: Home used getCompletedWorkoutSets (completed-workout sets),
// the insights engine used getAllWorkoutSets (every set, incl. an
// in-progress session) then filtered by created_at.
export async function getWorkoutSetsSince(userId, sinceMs, { completedOnly = true } = {}) {
  const d = await db();
  if (completedOnly) {
    const rows = await d.getAllAsync(
      `SELECT ws.* FROM workout_sets ws
       JOIN workouts w ON ws.workout_id = w.id
       WHERE ws.user_id = ? AND w.is_completed = 1 AND ws.created_at >= ?
       ORDER BY ws.created_at DESC`,
      [userId, sinceMs],
    );
    return rows.map(rowToCamel);
  }
  const rows = await d.getAllAsync(
    `SELECT * FROM workout_sets WHERE user_id = ? AND created_at >= ? ORDER BY created_at DESC`,
    [userId, sinceMs],
  );
  return rows.map(rowToCamel);
}

// LB-7: sets for a specific set of workout ids. The history list needs
// per-workout counts for only the page it shows (most recent 50), so it
// fetches those workouts' sets rather than every set ever logged.
export async function getWorkoutSetsForWorkoutIds(workoutIds) {
  if (!Array.isArray(workoutIds) || workoutIds.length === 0) return [];
  const d = await db();
  const placeholders = workoutIds.map(() => '?').join(',');
  const rows = await d.getAllAsync(
    `SELECT * FROM workout_sets WHERE workout_id IN (${placeholders}) ORDER BY created_at DESC`,
    workoutIds,
  );
  return rows.map(rowToCamel);
}

// Returns an array of `weeksBack` entries, ordered oldest → newest.
// Each entry: { weekLabel: 'W1'|...'W4', weekStart: ms, weekEnd: ms, volumeByMuscle: { chest: 8, ... } }
// Only working sets (set_type != 'warmup') are counted. Volume is allocated via
// allocateExerciseVolume across the exercise's PRIMARY and SECONDARY muscles
// (primary 1.0, each secondary 0.5), not primary_muscle alone.
export async function getWeeklyVolumeByMuscle(userId, weeksBack = 4, anchorMs = Date.now()) {
  const d = await db();
  // ALGO-001: the trailing windows anchor here. The default Date.now() keeps
  // the heatmap callers unchanged; the weekly check-in passes the END of its
  // Monday-anchored week (weekStartMs + 7d) so the week-over-week comparison
  // matches the week the user is actually submitting, not a rolling 7-day
  // window read off the wall clock. Index 0 = oldest week, last = most recent.
  const now = Number.isFinite(anchorMs) ? anchorMs : Date.now();
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const weekBoundaries = weekWindowsEndingAt(now, weeksBack);

  // Fetch all completed working sets in the full window in one query.
  const windowStart = now - weeksBack * WEEK_MS;
  const rows = await d.getAllAsync(
    `SELECT ws.created_at, ws.exercise_id
     FROM workout_sets ws
     JOIN workouts w ON ws.workout_id = w.id
     WHERE ws.user_id = ? AND w.is_completed = 1
       AND ws.created_at >= ?
       AND (ws.set_type IS NULL OR ws.set_type != 'warmup')
     ORDER BY ws.created_at ASC`,
    [userId, windowStart],
  );

  // Build exercise_id → exercise row map. Carry secondary_muscles too so this
  // trend path uses the SAME allocation as the heatmap tiles
  // (allocateExerciseVolume): primary 1.0 + each secondary 0.5. Previously
  // this counted the primary only, so the trend and the tile disagreed for
  // the same week (the headline volume-audit defect, P1.1).
  const exerciseRows = await d.getAllAsync(
    'SELECT id, primary_muscle, secondary_muscles FROM exercises',
  );
  const exerciseById = {};
  for (const ex of exerciseRows) exerciseById[ex.id] = ex;

  // Bucket each set into the correct week and credit each trained muscle.
  const result = weekBoundaries.map(({ weekStart, weekEnd }, idx) => ({
    weekLabel: `W${idx + 1}`,
    weekStart,
    weekEnd,
    volumeByMuscle: {},
  }));

  for (const row of rows) {
    const ts = row.created_at;
    const weekIdx = result.findIndex(w => ts >= w.weekStart && ts < w.weekEnd);
    if (weekIdx === -1) continue;
    const ex = exerciseById[row.exercise_id];
    if (!ex) continue;
    const vbm = result[weekIdx].volumeByMuscle;
    for (const { muscle, sets } of allocateExerciseVolume(ex)) {
      if (!muscle) continue;
      vbm[muscle] = (vbm[muscle] || 0) + sets;
    }
  }

  return result;
}

/**
 * Returns the most recent session date for each muscle group trained by the user.
 * Used to show recovery status (days since last trained) on the volume heatmap.
 * Returns an object: { [muscle]: { daysAgo: number, lastDate: timestamp } }
 */
export async function getLastTrainedByMuscle(userId) {
  const d = await db();
  const rows = await d.getAllAsync(`
    SELECT e.primary_muscle AS muscle,
           MAX(w.started_at) AS last_session_ms
    FROM workout_sets s
    JOIN workouts w ON w.id = s.workout_id
    JOIN exercises e ON e.id = s.exercise_id
    WHERE w.user_id = ?
      AND w.is_completed = 1
      AND s.set_type != 'warmup'
      AND e.primary_muscle IS NOT NULL
    GROUP BY e.primary_muscle
  `, [userId]);

  const now = Date.now();
  const MS_PER_DAY = 86400000;
  const result = {};
  for (const row of rows) {
    const daysAgo = Math.floor((now - row.last_session_ms) / MS_PER_DAY);
    result[row.muscle] = { daysAgo, lastDate: row.last_session_ms };
  }
  return result;
}

/**
 * L07-F7 (design-usability-audit-2026-07-09): the exercise picker's "recents"
 * row. Returns exercise ids ordered by the most recent COMPLETED workout that
 * logged a working set on that exercise, most recent first, deduped, capped
 * at `limit`. Warm-up sets are excluded so the row reflects what the user
 * actually trained, matching getLastTrainedByMuscle's own filter.
 */
export async function getRecentlyUsedExerciseIds(userId, limit = 8) {
  const d = await db();
  const rows = await d.getAllAsync(`
    SELECT s.exercise_id AS exerciseId, MAX(w.started_at) AS last_session_ms
    FROM workout_sets s
    JOIN workouts w ON w.id = s.workout_id
    WHERE w.user_id = ?
      AND w.is_completed = 1
      AND s.set_type != 'warmup'
    GROUP BY s.exercise_id
    ORDER BY last_session_ms DESC
    LIMIT ?
  `, [userId, limit]);
  return rows.map(r => r.exerciseId);
}

/**
 * Returns acute (this week) and chronic (4-week average) training tonnage
 * for calculating the Acute:Chronic Workload Ratio.
 * Only counts hard sets from completed workouts (setType != 'warmup').
 */
export async function getAcuteChronicWorkload(userId) {
  const d = await db();
  const now = Date.now();
  const MS_DAY = 86400000;

  // Fetch hard sets from last 5 weeks.
  // distance/duration exercises reuse the weight column (metres) / reps column
  // (seconds); they must never enter a load (weight*reps) sum or they pollute
  // the ACWR. LEFT JOINs keep unknown/unmatched exercises as weight_reps so
  // ordinary lifting tonnage is unchanged.
  const fiveWeeksAgo = now - 35 * MS_DAY;
  const rows = await d.getAllAsync(`
    SELECT s.weight, s.actual_reps AS reps, w.started_at
    FROM workout_sets s
    JOIN workouts w ON w.id = s.workout_id
    LEFT JOIN exercises e ON e.id = s.exercise_id
    LEFT JOIN custom_exercises ce ON ce.id = s.exercise_id AND ce.user_id = s.user_id
    WHERE w.user_id = ?
      AND w.is_completed = 1
      AND s.set_type != 'warmup'
      AND s.weight > 0
      AND s.actual_reps > 0
      AND w.started_at >= ?
      AND COALESCE(ce.exercise_type, e.exercise_type, 'weight_reps') NOT IN ('distance', 'duration')
    ORDER BY w.started_at ASC
  `, [userId, fiveWeeksAgo]);

  // Bucket into weekly tonnage (week 0 = this week, week 1 = last week, etc.)
  const weeklyTonnage = [0, 0, 0, 0, 0]; // index 0 = most recent
  for (const row of rows) {
    const daysAgo = Math.floor((now - row.started_at) / MS_DAY);
    const weekIdx = Math.floor(daysAgo / 7);
    if (weekIdx < 5) {
      weeklyTonnage[weekIdx] += row.weight * row.reps;
    }
  }

  const acute = weeklyTonnage[0];
  // Chronic = average of weeks 1-4 (exclude current week)
  const pastWeeks = weeklyTonnage.slice(1, 5).filter(t => t > 0);
  if (pastWeeks.length < 2) return null; // not enough data

  const chronic = pastWeeks.reduce((s, t) => s + t, 0) / pastWeeks.length;
  const ratio = chronic > 0 ? acute / chronic : null;

  return {
    acute: Math.round(acute),
    chronic: Math.round(chronic),
    ratio: ratio ? Math.round(ratio * 100) / 100 : null,
    weeksOfData: pastWeeks.length,
  };
}

export async function getWorkoutSetsForWorkout(workoutId) {
  const d = await db();
  const rows = await d.getAllAsync(
    'SELECT * FROM workout_sets WHERE workout_id = ? ORDER BY set_number ASC',
    [workoutId],
  );
  return rows.map(rowToCamel);
}

/**
 * Return per-workout tonnage totals for the last N days, filtered by routine.
 * Used by the Workout Summary screen to compare the current session to the
 * recent moving average (and rank it within the window).
 *
 * Aggregates in SQL so we don't pay an N+1 trip per workout. Excludes
 * warm-up sets, they don't count towards "working tonnage" and including
 * them would inflate the average vs the headline tonnage shown on the
 * summary screen.
 */
export async function getRoutineWorkoutTonnages(userId, routineId, sinceMs, excludeWorkoutId = null) {
  if (!userId || !routineId) return [];
  const d = await db();
  const params = [userId, routineId, sinceMs];
  let sql = `
    SELECT
      w.id AS workout_id,
      w.started_at AS started_at,
      COALESCE(SUM(
        CASE
          WHEN ws.set_type = 'warmup' THEN 0
          ELSE COALESCE(ws.weight, 0) * COALESCE(ws.actual_reps, 0)
        END
      ), 0) AS tonnage
    FROM workouts w
    LEFT JOIN workout_sets ws ON ws.workout_id = w.id
    WHERE w.user_id = ?
      AND w.routine_id = ?
      AND w.started_at >= ?
      AND w.is_completed = 1
  `;
  if (excludeWorkoutId) {
    sql += ' AND w.id != ?';
    params.push(excludeWorkoutId);
  }
  sql += ' GROUP BY w.id ORDER BY w.started_at DESC';
  const rows = await d.getAllAsync(sql, params);
  return rows.map(rowToCamel);
}

// C6 P10-1 (D97-18): the records surface's fetch. A "Personal records"
// wall may never truncate: the old 200-row window meant the wall showed
// the best of a rolling ~50 sessions under an all-time heading, included
// rows from incomplete workouts, and the marker replay treated the
// oldest in-window session as a first exposure (falsely marking its
// second set a PR). Completed workouts only, no cap - the LiftProgress
// pattern.
export async function getCompletedSetHistoryForExercise(exerciseId, userId) {
  const d = await db();
  const rows = await d.getAllAsync(
    `SELECT ws.* FROM workout_sets ws
      JOIN workouts w ON w.id = ws.workout_id
     WHERE ws.exercise_id = ? AND ws.user_id = ? AND w.is_completed = 1
     ORDER BY ws.created_at DESC`,
    [exerciseId, userId],
  );
  return rows.map(rowToCamel);
}

export async function getWorkoutSetsForExercise(exerciseId, userId, limit = 100) {
  const d = await db();
  const rows = await d.getAllAsync(
    `SELECT * FROM workout_sets
     WHERE exercise_id = ? AND user_id = ?
     ORDER BY created_at DESC LIMIT ?`,
    [exerciseId, userId, limit],
  );
  return rows.map(rowToCamel);
}

export async function getPreviousWorkoutSets(exerciseId, currentWorkoutId) {
  const d = await db();
  const rows = await d.getAllAsync(
    `SELECT ws.* FROM workout_sets ws
     JOIN workouts w ON w.id = ws.workout_id
     WHERE ws.exercise_id = ? AND ws.workout_id != ? AND w.is_completed = 1
     ORDER BY ws.created_at DESC`,
    [exerciseId, currentWorkoutId],
  );
  if (rows.length === 0) return [];
  const mapped = rows.map(rowToCamel);
  const mostRecentWorkoutId = mapped[0].workoutId;
  return mapped.filter(s => s.workoutId === mostRecentWorkoutId);
}

// Returns sets from the last n completed workouts for an exercise,
// grouped as an array of arrays: [mostRecentSets, previousSets, ...].
export async function getLastNWorkoutSets(exerciseId, currentWorkoutId, n = 2) {
  const d = await db();
  const rows = await d.getAllAsync(
    `SELECT ws.* FROM workout_sets ws
     JOIN workouts w ON w.id = ws.workout_id
     WHERE ws.exercise_id = ? AND ws.workout_id != ? AND w.is_completed = 1
     ORDER BY w.started_at DESC, ws.set_number ASC`,
    [exerciseId, currentWorkoutId],
  );
  if (rows.length === 0) return [];
  const mapped = rows.map(rowToCamel);
  const order = [];
  const byWorkout = {};
  for (const s of mapped) {
    if (!byWorkout[s.workoutId]) { byWorkout[s.workoutId] = []; order.push(s.workoutId); }
    byWorkout[s.workoutId].push(s);
  }
  return order.slice(0, n).map(wId => byWorkout[wId]);
}

export async function getAllCompletedSetsForExercise(exerciseId, currentWorkoutId) {
  const d = await db();
  const rows = await d.getAllAsync(
    `SELECT ws.* FROM workout_sets ws
     JOIN workouts w ON w.id = ws.workout_id
     WHERE ws.exercise_id = ? AND ws.workout_id != ? AND w.is_completed = 1
     ORDER BY ws.created_at DESC`,
    [exerciseId, currentWorkoutId],
  );
  return rows.map(rowToCamel);
}

// ─── Logged-set domain bounds ───────────────────────────────────────────────
//
// A logged set's weight and reps are the seed of nearly every derived number in
// the app: session tonnage, weekly volume, e1RM, PRs, the coach's evidence, and
// the chart geometry that eventually reaches Skia. A poisoned value here does
// not stay here.
//
// `data.weight || 0` accepted Infinity, because Infinity is truthy, and turned
// NaN into a silent 0. Infinity is reachable from the ordinary decimal keypad:
// a long enough run of digits is exactly what parseFloat returns Infinity for
// ('1' followed by 400 zeros does it). One Infinity weight makes every
// downstream aggregate Infinity and syncs it to cloud.
//
// These bounds are deliberately generous rather than "sensible". The rule is
// not to police unusual lifts: a loaded leg press in pounds, a heavy machine
// stack, or a chain-and-band total should all pass untouched. They exist only
// to keep an impossible number out of the database.
const MAX_SET_WEIGHT = 5000;   // any unit; far above any real machine or bar load
const MAX_SET_REPS = 1000;     // an AMRAP is long, not unbounded

/**
 * Coerce a logged-set number to something the database can safely hold.
 * Non-finite becomes 0 and is logged; an out-of-range value is clamped and
 * logged. Never throws: a user mid-session must still be able to log the set.
 */
function boundSetNumber(value, { max, field, setId = null }) {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) {
    if (value !== null && value !== undefined && value !== '') {
      logWarn('database.boundSetNumber', `non-finite ${field} refused`, { field, setId });
    }
    return 0;
  }
  if (n < 0) {
    logWarn('database.boundSetNumber', `negative ${field} clamped`, { field, setId });
    return 0;
  }
  if (n > max) {
    logWarn('database.boundSetNumber', `${field} above domain maximum, clamped`, { field, setId });
    return max;
  }
  return n;
}

export async function createWorkoutSet(data) {
  const d = await db();
  const id = uid();
  const now = Date.now();
  // Look up the exercise name once and denormalise it onto the set row.
  // The sync layer ships this alongside exercise_id so a new device can
  // recover the row's identity even if the exercise_id doesn't resolve
  // locally (e.g. canonical exercises that pre-date deterministic IDs).
  let exerciseName = data.exerciseName ?? null;
  if (!exerciseName && data.exerciseId) {
    try {
      const exRow = await d.getFirstAsync(
        'SELECT name FROM exercises WHERE id = ?',
        [data.exerciseId],
      );
      exerciseName = exRow?.name ?? null;
    } catch (_) { /* tolerate */ }
  }
  // Queued (R2-11): set logging fires while plan/coach transactions can hold
  // the connection; riding the write queue removes that contention entirely.
  await queuedWrite(() => d.runAsync(
    `INSERT INTO workout_sets
      (id, user_id, workout_id, exercise_id, exercise_name, set_number, set_type,
       target_reps_min, target_reps_max, actual_reps, weight, rir, rpe,
       failed, notes, is_amrap, amrap_reps, left_reps, right_reps, evidence_class,
       created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.userId,
      data.workoutId,
      data.exerciseId,
      exerciseName,
      data.setNumber || 1,
      data.setType || 'straight',
      data.targetRepsMin ?? null,
      data.targetRepsMax ?? null,
      boundSetNumber(data.actualReps, { max: MAX_SET_REPS, field: 'actualReps' }),
      boundSetNumber(data.weight, { max: MAX_SET_WEIGHT, field: 'weight' }),
      data.rir ?? null,
      data.rpe ?? null,
      data.failed ? 1 : 0,
      data.notes || null,
      data.isAmrap ? 1 : 0,
      data.amrapReps ?? null,
      data.leftReps ?? null,
      data.rightReps ?? null,
      // EL-7 (05-DECISIONS.md): null = conventional | 'circuit' |
      // 'ballistic' | 'circuit_ballistic'. Stamped by the caller
      // (ActiveWorkoutScreen) from structure + exercise metadata, never
      // chosen by the user.
      data.evidenceClass ?? null,
      now,
      now,
    ],
  ));
  return { id, ...data, createdAt: now, updatedAt: now };
}

// Update the post-set stimulus rating on the most recently logged set for an exercise.
// pump: 1–5, muscleConnection: 1–5
export async function updateWorkoutSetPostRating(setId, pump, muscleConnection) {
  const d = await db();
  await d.runAsync(
    'UPDATE workout_sets SET post_set_pump = ?, post_set_muscle_connection = ? WHERE id = ?',
    [pump, muscleConnection, setId]
  );
}

// Edit an already-logged set in place (Hevy-parity: fix a mistyped set without
// leaving the session). Only the fields actually passed are written, each is
// mapped to its column; updated_at is bumped so the per-set upsert ships the
// correction on the next push. No-op when nothing editable was supplied.
const _SET_EDIT_COLUMNS = {
  weight: 'weight',
  actualReps: 'actual_reps',
  rir: 'rir',
  rpe: 'rpe',
  setType: 'set_type',
  notes: 'notes',
  failed: 'failed',
  leftReps: 'left_reps',
  rightReps: 'right_reps',
};
export async function updateWorkoutSet(setId, fields = {}) {
  if (!setId) return;
  const sets = [];
  const vals = [];
  for (const [key, col] of Object.entries(_SET_EDIT_COLUMNS)) {
    if (fields[key] === undefined) continue;
    let v = fields[key];
    if (key === 'failed') v = v ? 1 : 0;
    else if (key === 'weight') v = boundSetNumber(v, { max: MAX_SET_WEIGHT, field: 'weight', setId });
    else if (key === 'actualReps') v = boundSetNumber(v, { max: MAX_SET_REPS, field: 'actualReps', setId });
    else v = v ?? null;
    sets.push(`${col} = ?`);
    vals.push(v);
  }
  if (!sets.length) return;
  sets.push('updated_at = ?');
  vals.push(Date.now());
  vals.push(setId);
  const d = await db();
  await d.runAsync(`UPDATE workout_sets SET ${sets.join(', ')} WHERE id = ?`, vals);
}

// Hard-delete a single logged set (Hevy-parity: remove a fat-fingered set
// mid-session). Mirrors deleteWorkoutAndSets: local row goes immediately and
// every derived surface (tonnage, PRs, lift progress) recomputes from local
// rows. Scoped to the owning user as a stale-id / shared-device guard. The
// CLOUD copy is removed by sync.deleteWorkoutSetFromCloud — the caller pairs the
// two and enqueues a 'workout_set_delete' op on failure so a restore pull cannot
// resurrect the set. workout_sets is hard-deleted (not tombstoned) exactly like
// whole-workout deletes, so the deleted_at column stays unused for these rows.
export async function deleteWorkoutSet(userId, setId) {
  if (!userId || !setId) return false;
  const d = await db();
  const row = await d.getFirstAsync(
    'SELECT id FROM workout_sets WHERE id = ? AND user_id = ?', [setId, userId],
  );
  if (!row) return false;
  await d.runAsync('DELETE FROM workout_sets WHERE id = ? AND user_id = ?', [setId, userId]);
  return true;
}

// Returns the most recent post-set pump and connection scores grouped by primary muscle,
// using only the last logged set per exercise in a given workout.
export async function getExerciseStimulusRatings(workoutId) {
  const d = await db();
  const rows = await d.getAllAsync(`
    SELECT s.exercise_id, e.name AS exercise_name, e.primary_muscle,
           s.post_set_pump, s.post_set_muscle_connection
    FROM workout_sets s
    LEFT JOIN exercises e ON e.id = s.exercise_id
    WHERE s.workout_id = ?
      AND s.post_set_pump IS NOT NULL
    ORDER BY s.created_at DESC
  `, [workoutId]);

  // Dedupe: keep first occurrence per exercise (most recent set with a rating)
  const seen = new Set();
  const result = [];
  for (const row of rows) {
    if (!seen.has(row.exercise_id)) {
      seen.add(row.exercise_id);
      result.push(rowToCamel(row));
    }
  }
  return result;
}

// ─── Routines ───────────────────────────────────────────────────────────────────────────────────

export async function getAllRoutines(userId) {
  const d = await db();
  // Filter out soft-deleted rows (is_active = 0). Other consumers
  // (getRoutinesForPlan, getWorkoutTemplates) already do this; getAllRoutines
  // used to return them, so deleted routines kept appearing in the list.
  const rows = await d.getAllAsync(
    'SELECT * FROM routines WHERE user_id = ? AND COALESCE(is_active, 1) = 1 ORDER BY updated_at DESC',
    [userId],
  );
  return rows.map(rowToCamel);
}

export async function getRoutineById(id) {
  const d = await db();
  const row = await d.getFirstAsync('SELECT * FROM routines WHERE id = ?', [id]);
  return rowToCamel(row);
}

export async function createRoutine(userId, name, description = null, splitType = null, isLibrary = 0, sourceRoutineId = null, programmeId = null, isSample = false, scheduleSync = true) {
  const d = await db();
  const id = uid();
  const now = Date.now();
  const isSampleInt = isSample ? 1 : 0;
  // Day-level plan reorder: append after this plan's current last day (or
  // the templates pool when programmeId is null) so a freshly added routine
  // never collides with an existing position.
  const maxRow = programmeId
    ? await d.getFirstAsync('SELECT MAX(position) as maxPos FROM routines WHERE programme_id = ?', [programmeId])
    : await d.getFirstAsync('SELECT MAX(position) as maxPos FROM routines WHERE programme_id IS NULL');
  const position = (maxRow?.maxPos ?? -1) + 1;
  await d.runAsync(
    `INSERT INTO routines (id, user_id, name, description, split_type, is_active, is_library, is_sample, source_routine_id, programme_id, position, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)`,
    [id, userId, name, description, splitType, isLibrary, isSampleInt, sourceRoutineId, programmeId, position, now, now],
  );
  if (scheduleSync) _scheduleSync();
  return { id, userId, name, description, splitType, isActive: 1, isLibrary, isSample: isSampleInt, sourceRoutineId, programmeId, position, createdAt: now, updatedAt: now };
}

export async function softDeleteRoutine(id) {
  const d = await db();
  await d.runAsync(
    'UPDATE routines SET is_active = 0, updated_at = ? WHERE id = ?',
    [Date.now(), id],
  );
  _scheduleSync();
}

/**
 * Find routines where every routine_exercise row has an exercise_id
 * that doesn't resolve against the local exercises table. These are
 * the "orphaned" routines left over from a cloud restore that
 * pre-dates the denormalised exercise_name + deterministic canonical
 * IDs. They can't be opened in ActiveWorkout meaningfully, the
 * INNER JOIN returns zero rows. The user's only path forward is to
 * either re-link each exercise manually OR delete the routine.
 *
 * Returns an array of { id, name, exerciseCount, programmeId } so the
 * cleanup UI can show the user what's about to be removed before they
 * confirm. exerciseCount is the TOTAL count in routine_exercises; all
 * of those are unresolved (otherwise the routine isn't fully
 * orphaned and shouldn't appear in the cleanup list).
 *
 * A routine with zero routine_exercises is NOT orphaned, that's just
 * an empty draft the user can still add exercises to.
 */
export async function getOrphanedRoutines(userId) {
  const d = await db();
  // Pull every routine with its exercise count + count of unresolved
  // routine_exercises (those whose FK target doesn't exist in
  // exercises). A routine is orphaned when total > 0 AND all of
  // them are unresolved.
  const rows = await d.getAllAsync(
    `SELECT r.id, r.name, r.programme_id,
            COUNT(re.id) AS total_count,
            SUM(CASE WHEN ex.id IS NULL THEN 1 ELSE 0 END) AS unresolved_count
     FROM routines r
     LEFT JOIN routine_exercises re ON re.routine_id = r.id
     LEFT JOIN exercises ex ON ex.id = re.exercise_id
     WHERE r.user_id = ? AND (r.is_active = 1 OR r.is_active IS NULL)
     GROUP BY r.id, r.name, r.programme_id
     HAVING total_count > 0 AND unresolved_count = total_count`,
    [userId],
  );
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    programmeId: r.programme_id,
    exerciseCount: r.total_count,
  }));
}

/**
 * Hard-delete routine_exercises whose routine_id no longer exists in
 * the routines table. These rows can accumulate when older code paths
 * removed routines without cascading children, and they break the
 * cloud push because Supabase's RLS check on routine_exercises
 * requires a matching routine row owned by the same user, every
 * sync without this cleanup logs "orphan routine_exercises skipped".
 * Idempotent, runs once at boot.
 */
export async function cleanupOrphanRoutineExercises() {
  try {
    const d = await db();
    const result = await d.runAsync(
      `DELETE FROM routine_exercises
       WHERE routine_id NOT IN (SELECT id FROM routines)`,
    );
    return result?.changes ?? 0;
  } catch (_) {
    return 0;
  }
}

/**
 * Soft-delete every orphaned routine in a single transaction. Returns
 * the number deleted so the UI can confirm "Removed N routines".
 *
 * The deletion is soft (is_active = 0) so the sync layer ships the
 * deletion to the cloud rather than just dropping the row locally.
 * The cloud row's updated_at advances; other devices pick up the
 * deletion on next pull.
 */
export async function deleteOrphanedRoutines(userId) {
  const orphans = await getOrphanedRoutines(userId);
  if (!orphans.length) return 0;
  const d = await db();
  // 2026-07-13: the LAST raw BEGIN outside the queue (missed by the
  // 2026-07-12 sweep, D77.8). Rides runInTransaction like everything else
  // so it can't interleave with a queued transaction and die with
  // 'cannot commit - no transaction is active'. A repo-wide guard test
  // (noRawTransactions.guard.test.js) now bans the pattern mechanically;
  // rollback-on-error is runInTransaction's own contract, the error still
  // propagates to the caller exactly as before.
  await runInTransaction(d, async () => {
    const now = Date.now();
    for (const r of orphans) {
      await d.runAsync(
        'UPDATE routines SET is_active = 0, deleted_at = ?, updated_at = ? WHERE id = ?',
        [now, now, r.id],
      );
    }
  });
  _scheduleSync();
  return orphans.length;
}

// ─── Programmes ───────────────────────────────────────────────────────────────────────────────────────

export async function createProgramme(userId, name, description = null, isLibrary = 0, tags = null, splitType = null, difficulty = null, scheduleSync = true) {
  const d = await db();
  const id = uid();
  const now = Date.now();
  await d.runAsync(
    `INSERT INTO programmes (id, user_id, name, description, is_library, tags, split_type, difficulty, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, userId || null, name, description, isLibrary, tags, splitType, difficulty, now, now],
  );
  if (scheduleSync) _scheduleSync();
  return { id, userId, name, description, isLibrary, tags, splitType, difficulty, createdAt: now, updatedAt: now };
}

// Raw cascade for callers ALREADY inside a runInTransaction task
// (planAutoGen's zero-match rollback). Nested runInTransaction calls are
// forbidden - a nested call queues behind its own enclosing transaction and
// deadlocks - so in-transaction callers use this variant on their own handle.
export async function deleteProgrammeCascadeInTx(d, programmeId) {
  await d.runAsync(
    `DELETE FROM routine_exercises
     WHERE routine_id IN (SELECT id FROM routines WHERE programme_id = ?)`,
    [programmeId],
  );
  await d.runAsync('DELETE FROM routines WHERE programme_id = ?', [programmeId]);
  await d.runAsync('DELETE FROM programmes WHERE id = ?', [programmeId]);
}

export async function deleteProgrammeCascade(programmeId, { scheduleSync = true } = {}) {
  if (!programmeId) return;
  const d = await db();
  await runInTransaction(d, () => deleteProgrammeCascadeInTx(d, programmeId));
  if (scheduleSync) _scheduleSync();
}

export async function getAllProgrammes(userId) {
  const d = await db();
  const rows = await d.getAllAsync(
    'SELECT * FROM programmes WHERE user_id = ? OR is_library = 1 ORDER BY created_at ASC',
    [userId],
  );
  return rows.map(rowToCamel);
}

export async function getProgrammeById(id) {
  const d = await db();
  const row = await d.getFirstAsync('SELECT * FROM programmes WHERE id = ?', [id]);
  return rowToCamel(row);
}

export async function copyRoutineFromLibrary(routineId, userId) {
  const original = await getRoutineById(routineId);
  if (!original) throw new Error('Routine not found');
  const newRoutine = await duplicateRoutine(routineId, userId, original.name);
  await (await db()).runAsync(
    'UPDATE routines SET source_routine_id = ?, is_library = 0 WHERE id = ?',
    [routineId, newRoutine.id],
  );
  return { ...newRoutine, sourceRoutineId: routineId, isLibrary: 0 };
}

// ─── Plan Folders ─────────────────────────────────────────────────────────────────────────────────────────
// Organise the My Plans list (= programmes) into collapsible folders. FREE
// feature (organisation of a free feature), NO Pro gate. Cloud parity:
// supabase/migrate_089_plan_folders.sql. A folder NEVER owns a plan's
// lifecycle: deleting a folder UNFILES its plans (folder_id -> null) and never
// deletes a plan.

export async function getPlanFolders(userId) {
  return planFoldersRepository.getPlanFolders(userId);
}

export async function createPlanFolder(userId, name) {
  return planFoldersRepository.createPlanFolder(userId, name);
}

export async function renamePlanFolder(folderId, name) {
  return planFoldersRepository.renamePlanFolder(folderId, name);
}

// Deleting a folder UNFILES its plans (programmes.folder_id -> NULL) and tombstones
// the folder. The plans themselves are NEVER touched beyond clearing folder_id.
export async function deletePlanFolder(folderId) {
  return planFoldersRepository.deletePlanFolder(folderId);
}

// Move a plan into a folder, or out of any folder when folderId is null.
export async function setPlanFolder(planId, folderId) {
  return planFoldersRepository.setPlanFolder(planId, folderId);
}

// Sync helpers (mirror the cardio_log contract). Push window keeps the batch
// small; soft-deleted rows are included so a folder deletion propagates.
export async function getPlanFoldersForPush(userId) {
  return planFoldersRepository.getPlanFoldersForPush(userId);
}

export async function getPlanFolderUpdatedAt(userId, id) {
  return planFoldersRepository.getPlanFolderUpdatedAt(userId, id);
}

export async function insertPlanFolderFromCloud(userId, f) {
  return planFoldersRepository.insertPlanFolderFromCloud(userId, f);
}

// ─── Routine Exercises ────────────────────────────────────────────────────────────────────────────────────

export async function getRoutineExercisesWithDetails(routineId) {
  const d = await db();
  // LEFT JOIN, a routine_exercise whose exercise_id doesn't resolve to
  // a local exercise (e.g. cloud-restored rows from before deterministic
  // canonical IDs) still surfaces. The fallback uses the denormalised
  // exercise_name stored on the routine_exercises row so the user sees
  // the name they originally logged rather than a blank slot.
  const rows = await d.getAllAsync(
    `SELECT re.*,
            COALESCE(e.name, re.exercise_name) AS resolved_name,
            e.primary_muscle,
            e.subregion,
            e.secondary_muscles,
            e.equipment,
            e.movement_pattern,
            e.compound_isolation,
            e.default_rep_min,
            e.default_rep_max,
            e.fatigue_cost,
            e.stimulus_to_fatigue_ratio,
            e.equipment_category,
            e.laterality,
            e.load_character
     FROM routine_exercises re
     LEFT JOIN exercises e ON e.id = re.exercise_id
     WHERE re.routine_id = ? AND re.deleted_at IS NULL
     ORDER BY re.order_in_routine ASC`,
    [routineId],
  );
  return rows.map(row => {
    const re = rowToCamel(row);
    const exercise = {
      id: row.exercise_id,
      name: row.resolved_name,
      // When the FK didn't resolve these are all null, coach insights
      // and volume calculations downstream guard on missing muscle.
      primaryMuscle: row.primary_muscle,
      // Continuity matches incumbents and generated exercises on the same
      // muscle/family key. Without the stored family tag, pass-through
      // muscles (for example chest) fell back to a different family and a
      // retained lift was incorrectly reported as newly selected.
      subregion: row.subregion,
      secondaryMuscles: (() => { try { return JSON.parse(row.secondary_muscles || '[]'); } catch { return []; } })(),
      equipment: row.equipment,
      movementPattern: row.movement_pattern,
      compoundIsolation: row.compound_isolation,
      defaultRepMin: row.default_rep_min,
      defaultRepMax: row.default_rep_max,
      fatigueCost: row.fatigue_cost,
      stimulusToFatigueRatio: row.stimulus_to_fatigue_ratio,
      // plan-D builder nudge (docs/exercise-planning-2026-07-09/
      // plan-D-intelligent-supersets.md): ManualBuilderScreen needs this to
      // classify a superset pair the same way the auto-gen engine does.
      equipmentCategory: row.equipment_category,
      // D9 (docs/ux-world-class-audit-2026-07-09/DECISIONS-2026-07-09.md):
      // 'bilateral' | 'unilateral', derived by exerciseMetadata.js's
      // deriveLaterality and stored on the exercise at insert/update time.
      // Previously computed and never read anywhere; ActiveWorkoutScreen
      // reads it to suggest per-side logging.
      laterality: row.laterality,
      // EL-7 (docs/exercise-library-expansion-2026-09-05/05-DECISIONS.md):
      // 'grind' | 'ballistic' | null. ActiveWorkoutScreen reads this to
      // stamp a logged set's evidence_class; read defensively there
      // (loadCharacter ?? load_character ?? null) since the column can be
      // null on a device that has not yet re-derived exercise metadata.
      loadCharacter: row.load_character,
      cue: row.cue ?? null,
      // Flag for the UI: this row needs to be repaired by the user
      // because the exercise lookup failed. Active screens can render
      // an inline "Re-link exercise" affordance here.
      unresolved: !row.primary_muscle && !!row.resolved_name,
    };
    return { routineExercise: re, exercise };
  });
}

export async function addExerciseToRoutine(routineId, exerciseId, order, repsMin = 6, repsMax = 12, notes = null, sets = 3, startingWeight = null, restSeconds = null, supersetGroupId = null, scheduleSync = true, selectionReason = null, groupKind = null, roundRestSeconds = null) {
  const d = await db();
  const id = uid();
  const now = Date.now();
  // Denormalise the exercise name onto the routine_exercise row so the
  // sync layer can ship it alongside exercise_id. A new device pulling
  // this row recovers the lift even when the FK can't resolve.
  let exerciseName = null;
  try {
    const exRow = await d.getFirstAsync('SELECT name FROM exercises WHERE id = ?', [exerciseId]);
    exerciseName = exRow?.name ?? null;
  } catch (_) { /* tolerate */ }
  await d.runAsync(
    `INSERT INTO routine_exercises
      (id, routine_id, exercise_id, exercise_name, order_in_routine, recommended_sets,
       recommended_reps_min, recommended_reps_max, notes, starting_weight, rest_seconds,
       superset_group_id, selection_reason, group_kind, round_rest_seconds, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, routineId, exerciseId, exerciseName, order, sets, repsMin, repsMax, notes,
      startingWeight, restSeconds, supersetGroupId, selectionReason, groupKind, roundRestSeconds, now, now],
  );
  if (scheduleSync) _scheduleSync();
  return { id, routineId, exerciseId, orderInRoutine: order, supersetGroupId, groupKind, roundRestSeconds };
}

export async function updateRoutineExercise(id, data) {
  const d = await db();
  const now = Date.now();
  const fieldMap = {
    recommendedSets: 'recommended_sets',
    recommendedRepsMin: 'recommended_reps_min',
    recommendedRepsMax: 'recommended_reps_max',
    notes: 'notes',
    startingWeight: 'starting_weight',
    restSeconds: 'rest_seconds',
    // EL-9 circuit model (docs/exercise-library-expansion-2026-09-05/
    // 05-DECISIONS.md): group_kind ('circuit' | null = superset) and the
    // circuit's between-round rest, both additive columns.
    groupKind: 'group_kind',
    roundRestSeconds: 'round_rest_seconds',
  };
  const fields = [];
  const values = [];
  for (const [key, col] of Object.entries(fieldMap)) {
    if (key in data) {
      fields.push(`${col} = ?`);
      values.push(data[key]);
    }
  }
  if (fields.length === 0) return;
  fields.push('updated_at = ?');
  values.push(now, id);
  await d.runAsync(`UPDATE routine_exercises SET ${fields.join(', ')} WHERE id = ?`, values);
  _scheduleSync();
}

/**
 * Plan-level exercise swap: replaces the exercise referenced by a
 * routine_exercises row. Set count and slot position are preserved.
 *
 * C16 job 7. This used to leave set/rep/rest AND STARTING WEIGHT unchanged,
 * which meant a replacement inherited the previous exercise's load. Swapping
 * a 100 kg barbell bench for a dumbbell press left 100 kg on the row: a
 * prescription for a movement nobody had ever performed, on a plan the user
 * is meant to be able to follow.
 *
 * Two rules now apply, and they are deliberately different:
 *
 *   LOAD is always cleared. It belongs to the exercise, not the slot. There
 *   is no honest way to carry a barbell number onto a machine, and an empty
 *   field asks the user rather than inventing a number.
 *
 *   REPS AND REST are recalibrated only when the row still carries the
 *   DEFAULT prescription for the outgoing exercise's tier and the incoming
 *   exercise sits in a different tier. A user who tuned their own rep range
 *   keeps it; an untouched slot that has gone from a heavy compound to an
 *   isolation stops asking for three minutes' rest at 6-10 reps.
 *
 * Best-effort throughout: if the tier cannot be resolved the swap still
 * happens and only the load is cleared, because refusing to swap would be a
 * worse outcome than an unrecalibrated rep range.
 */
export async function updateRoutineExerciseExercise(routineExerciseId, newExerciseId) {
  const d = await db();
  const now = Date.now();
  // Look up the canonical name for the new exercise and store it on
  // the row alongside the FK update. Keeps the denormalised
  // exercise_name in sync with the FK so future syncs ship the
  // correct name and other devices' LEFT JOIN fallback resolves
  // correctly.
  let newRow = null;
  try {
    newRow = await d.getFirstAsync(
      'SELECT name, equipment_category, compound_isolation FROM exercises WHERE id = ?',
      [newExerciseId],
    );
  } catch (_) { /* tolerate */ }
  const newName = newRow?.name ?? null;

  let repMin = null;
  let repMax = null;
  let restSec = null;
  let recalibrate = false;
  try {
    // eslint-disable-next-line global-require
    const { deriveParamKey } = require('./poolGenerator');
    // eslint-disable-next-line global-require
    const { repRangeFor, restFor, isDefaultPrescription } = require('./exercise/prescription');
    const row = await d.getFirstAsync(
      `SELECT re.recommended_reps_min AS repMin, re.recommended_reps_max AS repMax,
              re.rest_seconds AS restSec, e.equipment_category AS eq,
              e.compound_isolation AS ci
         FROM routine_exercises re
         LEFT JOIN exercises e ON e.id = re.exercise_id
        WHERE re.id = ?`,
      [routineExerciseId],
    );
    if (row && newRow && row.eq) {
      const oldParam = deriveParamKey(row.eq, row.ci);
      const newParam = deriveParamKey(newRow.equipment_category, newRow.compound_isolation);
      if (oldParam !== newParam && isDefaultPrescription(oldParam, row)) {
        const rr = repRangeFor(newName, newParam, false);
        repMin = rr.repMin;
        repMax = rr.repMax;
        restSec = restFor(newParam, false);
        recalibrate = true;
      }
    }
  } catch (_) { /* leave the prescription alone; the load is still cleared */ }

  if (recalibrate) {
    await d.runAsync(
      `UPDATE routine_exercises
          SET exercise_id = ?, exercise_name = ?, starting_weight = NULL,
              recommended_reps_min = ?, recommended_reps_max = ?, rest_seconds = ?,
              updated_at = ?
        WHERE id = ?`,
      [newExerciseId, newName, repMin, repMax, restSec, now, routineExerciseId],
    );
  } else {
    await d.runAsync(
      `UPDATE routine_exercises
          SET exercise_id = ?, exercise_name = ?, starting_weight = NULL, updated_at = ?
        WHERE id = ?`,
      [newExerciseId, newName, now, routineExerciseId],
    );
  }
  _scheduleSync();
}

export async function getAllRoutineExerciseCounts() {
  const d = await db();
  const rows = await d.getAllAsync('SELECT routine_id, COUNT(*) as cnt FROM routine_exercises GROUP BY routine_id');
  return Object.fromEntries(rows.map(r => [r.routine_id, r.cnt]));
}

// Sum of the actual prescribed working sets per routine (recommended_sets,
// which defaults to 3 where unset). Used for an honest "sets/week" estimate
// rather than assuming a flat 3 sets per exercise.
export async function getAllRoutineSetCounts() {
  const d = await db();
  const rows = await d.getAllAsync('SELECT routine_id, SUM(COALESCE(recommended_sets, 3)) as total FROM routine_exercises GROUP BY routine_id');
  return Object.fromEntries(rows.map(r => [r.routine_id, r.total]));
}

export async function updateRoutineName(id, name) {
  const d = await db();
  await d.runAsync('UPDATE routines SET name = ?, updated_at = ? WHERE id = ?', [name, Date.now(), id]);
  _scheduleSync();
}

export async function duplicateRoutine(routineId, userId, newName) {
  const d = await db();
  const original = await getRoutineById(routineId);
  if (!original) throw new Error('Routine not found');
  const newRoutine = await createRoutine(userId, newName, original.description, original.splitType);
  const exercises = await getRoutineExercisesWithDetails(routineId);
  // Atomic, was N+1 individual inserts; an interruption used to leave a
  // routine row pointing at no exercises (or partial), which the UI
  // couldn't recover and the user couldn't see.
  await runInTransaction(d, async () => {
    for (let i = 0; i < exercises.length; i++) {
      const { routineExercise: re } = exercises[i];
      // Every structural column travels with the copy. The call used to stop
      // at supersetGroupId, so a library circuit reached the user's own plan
      // with group_kind and round_rest_seconds NULL: no round counter, no
      // round rest, and (the data-truth failure) no evidence_class stamp, so
      // circuit sets fed every hypertrophy learner EL-7 excludes them from.
      // Certification 2026-09-05, finding A0.
      await addExerciseToRoutine(
        newRoutine.id,
        re.exerciseId,
        i,
        re.recommendedRepsMin,
        re.recommendedRepsMax,
        re.notes,
        re.recommendedSets,
        re.startingWeight,
        re.restSeconds,
        re.supersetGroupId,
        true,
        re.selectionReason ?? null,
        re.groupKind ?? null,
        re.roundRestSeconds ?? null,
      );
    }
  });
  return newRoutine;
}

export async function removeExerciseFromRoutine(id) {
  const d = await db();
  // Soft delete (tombstone), NOT a hard DELETE. A hard delete removed the row
  // locally but left the cloud copy alive, so the next pullFromCloud
  // re-inserted it and the exercise "came back" (founder-reported on the first
  // iOS build, 2026-07-19). Setting deleted_at + scheduling a sync pushes the
  // tombstone to cloud (sync.js push map sends deleted_at), so the removal
  // sticks across pulls and devices. Reads already exclude tombstoned rows
  // (getRoutineExercisesWithDetails filters deleted_at IS NULL), and the pull
  // (insertRoutineExerciseFromCloud) already honours a cloud deleted_at.
  const now = Date.now();
  await d.runAsync(
    'UPDATE routine_exercises SET deleted_at = ?, updated_at = ? WHERE id = ?',
    [now, now, id],
  );
  _scheduleSync();
}

export async function updateRoutineExerciseOrder(id, newOrderIndex) {
  const d = await db();
  await d.runAsync(
    'UPDATE routine_exercises SET order_in_routine = ?, updated_at = ? WHERE id = ?',
    [newOrderIndex, Date.now(), id],
  );
  _scheduleSync();
}

// Day-level plan reorder: persists a routine's position among its plan's
// other days (or the templates pool when it has no programme_id). Mirrors
// updateRoutineExerciseOrder above, one level up the hierarchy.
export async function updateRoutinePosition(id, newPosition) {
  const d = await db();
  await d.runAsync(
    'UPDATE routines SET position = ?, updated_at = ? WHERE id = ?',
    [newPosition, Date.now(), id],
  );
  _scheduleSync();
}

// ─── Plans (active plan logic, workout templates) ────────────────────

export async function getActivePlan(userId) {
  const d = await db();
  // C6 P9-08 (D97): deterministic tiebreak, matching getActiveBlock's
  // Campaign 1 hardening - should a sync ever leave two actives, the
  // newest wins rather than SQL row order.
  const row = await d.getFirstAsync(
    'SELECT * FROM programmes WHERE user_id = ? AND is_active = 1 AND (is_library = 0 OR is_library IS NULL) ORDER BY updated_at DESC LIMIT 1',
    [userId],
  );
  return rowToCamel(row);
}

export async function setActivePlan(userId, planId) {
  const d = await db();
  const now = Date.now();
  // C6 P44-02 + P9-08 (D97): one transaction (two interleaved activations
  // could leave two is_active programmes - the same interleave RB-3 closed
  // for mesocycles), and activation UNARCHIVES - "Set active" was reachable
  // on an archived plan and left it active and archived simultaneously,
  // breaking the active/archived partition every list read assumes.
  await runInTransaction(d, async () => {
    await d.runAsync(
      'UPDATE programmes SET is_active = 0, updated_at = ? WHERE user_id = ?',
      [now, userId],
    );
    if (planId) {
      // OWNERSHIP (adversarial audit 2026-08-26). The deactivate-all above is
      // scoped `WHERE user_id = ?` and this activate was scoped `WHERE id = ?`
      // only, inside the same transaction. That asymmetry is the defect: a
      // planId belonging to someone else would be activated AND unarchived for
      // them, and because the sibling statement only cleared is_active for the
      // CALLER, the result is two active programmes across two users.
      // Local SQLite normally holds one user's rows, so the practical route in
      // is residue from an incomplete wipe or a stale id held across an account
      // switch. Both are cheaper to make impossible here than to reason about
      // at every call site.
      await d.runAsync(
        'UPDATE programmes SET is_active = 1, is_archived = 0, updated_at = ? WHERE id = ? AND user_id = ?',
        [now, planId, userId],
      );
    }
  });
  if (planId) {
    // LB-8: a plan was activated (onboarding success / re-engagement). Only
    // on a real activation, not the planId=null deactivate-all path.
    _trackEvent(userId, 'plan_activated', null);
  }
  _scheduleSync();
}

// Sets a plan active AND creates a matching training block so the Analytics
// card is populated immediately. Deactivates any existing active mesocycle first.
// Stage 1 seam (2026-08-09): `ledger` is the Block Ledger result the Stage 6
// build threads into seeding. Accepted now so the "Continue with
// adjustments" path has a real parameter to carry it; unused until Stage 6.
export async function activatePlanWithBlock(userId, planId, planName, { ledger = null, allowLearnedCarry = true } = {}) {
  // Activation-funnel elevation (lead programme ruling, D139): plan_replaced
  // must fire only on a genuine replacement, never a user's first-ever
  // activation, so read whether an active block already exists BEFORE
  // setActivePlan below deactivates it (setActivePlan's own is_active=0
  // UPDATE would otherwise make every activation look like a fresh start).
  const _dPlanReplacedCheck = await db();
  const _priorActiveBlock = await _dPlanReplacedCheck.getFirstAsync(
    'SELECT id FROM mesocycles WHERE user_id = ? AND is_active = 1 LIMIT 1',
    [userId],
  );
  await setActivePlan(userId, planId);
  if (_priorActiveBlock) {
    // Next to plan_activated (fired inside setActivePlan just above): the
    // business-visible signal is whether this activation replaced a
    // running block, not merely that a plan became active.
    _trackEvent(userId, 'plan_replaced', null);
  }

  // C8 Work 2 (D97-9): muscle-level learned evidence survives a
  // legitimate activation. Only "Continue with adjustments" ever passed
  // `ledger`, so a plan switch, copied routine, phase rebuild or
  // post-upgrade wizard build gave the ramp writer nothing and a mature
  // user re-ramped from research values. When no explicit seed was
  // handed in, derive one from the user's own judged block history.
  //
  // Conservative by construction: the helper has no current-block proposal
  // to apply, and returns null unless something was genuinely carried - so
  // manual overrides, suppression, research floors and evidence sufficiency
  // all keep winning, and an activation with nothing to carry keeps the
  // honest template ramp. Best-effort: activation must never fail on this.
  //
  // Review D5: a caller that MEANT a repeat passes allowLearnedCarry
  // false. Its seed build can return null on a transient read failure,
  // and "the same set targets as last time" must then fall back to the
  // template ramp as it always did - never to the learned band, which
  // would break P-6 behind an alert promising the opposite.
  //
  // Volyume is fully free (founder decision 2026-09-03): the old Pro-only
  // gate here is gone -- every user's own judged block history is theirs
  // to carry forward.
  let effectiveLedger = ledger;
  if (!effectiveLedger && allowLearnedCarry) {
    try {
      // eslint-disable-next-line global-require
      const store = require('../store/useAppStore').default.getState();
      // eslint-disable-next-line global-require
      const { buildLearnedSeedRangesForActivation } = require('./blockLedgerRunner');
      effectiveLedger = await buildLearnedSeedRangesForActivation(userId, {
        userProfile: store?.userProfile ?? null,
      });
    } catch (_) { effectiveLedger = null; /* honest template ramp */ }
  }

  const d = await db();
  const now = Date.now();
  const id = uid();
  // C6 T-2 (D97-24): store the LOCAL activation day, not the UTC one - an
  // evening activation in the Americas used to store tomorrow's date.
  const _sd = new Date();
  const startDate = `${_sd.getFullYear()}-${String(_sd.getMonth() + 1).padStart(2, '0')}-${String(_sd.getDate()).padStart(2, '0')}`;
  // end_date is required by the cloud schema (NOT NULL). Without it the
  // push silently drops the row and a fresh-install sign-in lands with
  // an active plan but no training block.
  const endDate = new Date(Date.now() + BLOCK_PLANNED_WEEKS * 7 * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10);
  // 6 weeks: 5 accumulation (RIR 3→2→1→0→0) + 1 deload (RIR 4). deload_week
  // is written (X19, Wave 2 audit 2026-07-30) so MesocycleBuilderScreen's
  // deload highlighting -- previously always NULL/dead for every real
  // block -- has a real value; week 6 is always the deload week here,
  // matching generateMesocycleWeeks' own rule (last week = deload).
  // C5-P11-01 (D96): the three week counts now come from mesocycle.js's
  // BLOCK_PLANNED_WEEKS/BLOCK_DELOAD_WEEK, which the planEngine narrative
  // reads too, so no surface can describe a block length this writer does
  // not create. The written values are byte-identical to the constants
  // that stood here.
  // RB-3 (D96, Review B): deactivate-all and insert-new used to be two
  // awaited statements, so two overlapping activations could interleave as
  // A.UPDATE, B.UPDATE, A.INSERT, B.INSERT and leave TWO is_active rows.
  // One transaction closes that for every caller. No nested
  // runInTransaction runs inside (both statements are plain runAsync).
  await runInTransaction(d, async () => {
    // C6 P44-05 (D97): an abandoned block's end_date was written once at
    // creation and never truncated, so "Past blocks" showed overlapping
    // ranges and a block left in week 2 read as a full six weeks. A block
    // whose planned end is still ahead ends TODAY when the user switches
    // away; finished blocks keep their real dates.
    await d.runAsync(
      `UPDATE mesocycles SET end_date = date('now'), updated_at = ?
        WHERE user_id = ? AND is_active = 1 AND end_date > date('now')`,
      [now, userId],
    );
    await d.runAsync(
      'UPDATE mesocycles SET is_active = 0, updated_at = ? WHERE user_id = ?',
      [now, userId],
    );
    await d.runAsync(
      `INSERT INTO mesocycles
        (id, user_id, name, start_date, end_date, duration_weeks, planned_weeks, deload_week, focus,
         block_type, rir_ladder, is_active, auto_regulation_enabled, created_at, updated_at,
         progression_anchor_week)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?, 1)`,
      [id, userId, planName, startDate, endDate,
        BLOCK_PLANNED_WEEKS, BLOCK_PLANNED_WEEKS, BLOCK_DELOAD_WEEK,
        'hypertrophy', 'offseason_hypertrophy', '[3,2,1,0,0,4]', now, now],
    );
  });

  await generateMesocycleWeeks(id);
  // Lazy require, not a dynamic import: every other deferred dependency in
  // this file uses require, and `await import()` cannot be driven under the
  // test runner without --experimental-vm-modules, which meant plan
  // activation - and therefore the block's planned volume - could not be
  // covered by a test at all (C16 job 6).
  // eslint-disable-next-line global-require
  const { VOLUME_LANDMARKS } = require('./algorithms');
  // CC33 D112 R1 (section 15; closes audit T1-01): muscles with no pool
  // under the user's BASELINE rules seed honest zero rows instead of
  // template fiction. Best-effort, failing to NOTHING BLOCKED: wrongly
  // zeroing a healthy user's block is the harmful direction, and the
  // template is the status quo. Episode-only restrictions never zero
  // (their rows are the protected baseline reintroduction returns to).
  let capabilityBlockedMuscles = null;
  try {
    // eslint-disable-next-line global-require
    const { loadCapabilityResolveState, baselineBlockedMuscles, capabilityKnown } = require('./capability/resolve');
    const capState = await loadCapabilityResolveState(userId, {});
    // CC33 census (D132): stale-known is knowledge - the old guard
    // silently dropped the blocked-muscle facts under a state the rest
    // of the lane honours.
    if (!capState.empty && capabilityKnown(capState)) {
      const library = await getAllExercises();
      capabilityBlockedMuscles = baselineBlockedMuscles(
        capState, library, Object.keys(VOLUME_LANDMARKS),
      );
    }
  } catch (e) {
    capabilityBlockedMuscles = null;
    logError('database.activatePlanWithBlock.capabilityRead', e, {
      reason: 'baseline pool check failed; seeding template rows',
    });
  }
  await generateInitialPlannedVolume(id, VOLUME_LANDMARKS, effectiveLedger, {
    blockedMuscles: capabilityBlockedMuscles,
  });

  // C12: refresh the weekly training reminders so their copy names the plan
  // that just became active. Read the name back from the persisted active plan
  // (not the raw planName arg, which above labels the mesocycle) so the push can
  // never name anything other than the plan the Train tab shows. Best-effort and
  // self-gating (the scheduler no-ops when reminders are off or permission is
  // absent); a lazy require keeps the data layer free of a static notifications
  // dependency, and every path here leaves plan activation itself unaffected.
  try {
    const activeForReminder = await getActivePlan(userId).catch(() => null);
    // eslint-disable-next-line global-require
    require('./notifications/trainingReminders')
      .scheduleTrainingReminders(activeForReminder?.name)
      .catch(() => {});
  } catch (_) { /* notifications layer unavailable -- reminders refresh on next schedule */ }
  // D141 item 5: lay the block-finished push for the morning this new block
  // ends, so the decision moment reaches a user who is not opening the app.
  // Best-effort; activation never fails on it.
  try {
    // eslint-disable-next-line global-require
    require('./notifications/scheduler')
      .scheduleBlockReadyForActiveBlock(userId)
      .catch(() => {});
  } catch (_) { /* notifications layer unavailable */ }

  return id;
}

/**
 * D140 (founder decision 2026-09-03): activate a rebuilt programme WITHOUT
 * touching the running training block. The block (mesocycles,
 * mesocycle_weeks, planned_muscle_volume) is keyed to the user and to
 * muscles, never to a programme, so a rebuild that keeps every exercise can
 * swap the programme underneath it and the block carries on at the week it
 * is in. Nothing here writes to any mesocycle table.
 *
 * Returns the kept block's id, or null when there is no active block to
 * keep - the caller then activates through activatePlanWithBlock as usual,
 * so a user with no block still gets one. That fallback is the caller's,
 * not this function's, so this function can be pinned as never inserting a
 * mesocycle.
 */
export async function activatePlanKeepingBlock(userId, planId) {
  if (!userId || !planId) return null;
  const d = await db();
  const active = await d.getFirstAsync(
    'SELECT id FROM mesocycles WHERE user_id = ? AND is_active = 1 ORDER BY created_at DESC LIMIT 1',
    [userId],
  );
  if (!active?.id) return null;
  await setActivePlan(userId, planId);
  // Same reminder refresh activatePlanWithBlock performs, for the same
  // reason: the push copy names the plan the Train tab shows. Best-effort.
  try {
    const activeForReminder = await getActivePlan(userId).catch(() => null);
    // eslint-disable-next-line global-require
    require('./notifications/trainingReminders')
      .scheduleTrainingReminders(activeForReminder?.name)
      .catch(() => {});
  } catch (_) { /* notifications layer unavailable -- reminders refresh on next schedule */ }
  return active.id;
}

export async function getAllPlansForUser(userId) {
  const d = await db();
  const rows = await d.getAllAsync(
    `SELECT * FROM programmes
     WHERE user_id = ? AND (is_library = 0 OR is_library IS NULL) AND (is_archived = 0 OR is_archived IS NULL)
     ORDER BY is_active DESC, updated_at DESC`,
    [userId],
  );
  return rows.map(rowToCamel);
}

export async function getLibraryPlans() {
  const d = await db();
  const rows = await d.getAllAsync(
    'SELECT * FROM programmes WHERE is_library = 1 ORDER BY created_at ASC',
  );
  return rows.map(rowToCamel);
}

// CC28 (section 9.2.5): every library plan's exercise rows in ONE read, so
// capability-computed compatibility can cover the whole browse surface
// without a per-plan query fan-out. Read-only; returns the exercise
// columns the resolver questions need plus the owning programme id.
export async function getLibraryPlanExerciseRows() {
  const d = await db();
  const rows = await d.getAllAsync(
    `SELECT r.programme_id, r.id AS routine_id, re.exercise_id,
            re.recommended_sets, re.rest_seconds,
            e.id, e.name, e.primary_muscle, e.subregion, e.is_custom, e.equipment,
            e.position, e.floor_access, e.overhead_position, e.grip_demand,
            e.unilateral_loadable, e.bilateral_upper, e.bilateral_lower,
            e.axial_load, e.impact, e.balance_demand, e.weight_bearing_hands
       FROM routines r
       JOIN routine_exercises re ON re.routine_id = r.id
       JOIN exercises e ON e.id = re.exercise_id
       JOIN programmes p ON p.id = r.programme_id
      WHERE p.is_library = 1`,
  );
  return rows.map(rowToCamel);
}

export async function getRoutinesForPlan(planId) {
  const d = await db();
  // Day-level plan reorder: order by the user-set position when present;
  // rows that predate the migration (or arrived via an older cloud payload
  // without the column) sort last, keeping their prior created_at order.
  const rows = await d.getAllAsync(
    `SELECT * FROM routines WHERE programme_id = ? AND (is_active = 1 OR is_active IS NULL)
     ORDER BY (position IS NULL), position ASC, created_at ASC`,
    [planId],
  );
  return rows.map(rowToCamel);
}

/**
 * RETIRED (C18 block-progression amendment). Kept as an explicit tombstone
 * rather than deleted, because its NAME is the defect and a future maintainer
 * grepping for it deserves to find the reason.
 *
 * This advanced `next_workout_index` by one whatever routine had just been
 * finished. It never looked at what was performed, so an athlete whose next
 * required session was Legs, who trained Push & Arms instead, had the pointer
 * moved PAST Legs: never performed, never marked anything, consumed by a
 * counter. Programme position is now resolved per required session instance
 * by `programmePosition.resolveProgrammePosition`, and completing a workout
 * resolves the instance that was actually performed.
 *
 * `next_workout_index` survives as an inert legacy column. Nothing reads it
 * for progression and nothing may: required-instance truth outranks it
 * absolutely. This function is a no-op so any unported caller fails loudly in
 * review rather than silently corrupting position again.
 */
export async function advancePlanNextWorkout() {
  // Intentionally does nothing. See the note above.
}

export async function copyPlanFromLibrary(libraryPlanId, userId) {
  const d = await db();
  const libPlan = await getProgrammeById(libraryPlanId);
  if (!libPlan) throw new Error('Plan not found');

  // Tags, split type and difficulty travel with the copy. Without tags the
  // user's plan has no style key, so a kettlebell or circuit plan's swap
  // pool, "Adjust plan" constraint and style swap-cause all died on
  // activation (certification 2026-09-05, finding A0b).
  const newPlan = await createProgramme(
    userId, libPlan.name, libPlan.description, 0,
    libPlan.tags ?? null, libPlan.splitType ?? null, libPlan.difficulty ?? null,
  );
  // RB-6 (D96, Review B): stamp which library plan this copy came from, so
  // consumers can identify the copy by provenance instead of by name (a
  // rename used to defeat the FreeStarter dedup, and an unrelated user plan
  // sharing the name was silently adopted as "the recommendation"). The
  // column already exists and syncs; it was simply never written here.
  await d.runAsync(
    'UPDATE programmes SET source_programme_id = ?, updated_at = ? WHERE id = ?',
    [libraryPlanId, Date.now(), newPlan.id],
  );

  const libRoutineRows = await d.getAllAsync(
    `SELECT * FROM routines WHERE programme_id = ? AND (is_active = 1 OR is_active IS NULL)
     ORDER BY (position IS NULL), position ASC, created_at ASC`,
    [libraryPlanId],
  );

  for (let i = 0; i < libRoutineRows.length; i++) {
    const libRoutine = rowToCamel(libRoutineRows[i]);
    const newRoutine = await duplicateRoutine(libRoutine.id, userId, libRoutine.name);
    // Day order carries over from the library plan (loop index, not the
    // position createRoutine assigned while the copy briefly had no
    // programme_id).
    await d.runAsync(
      'UPDATE routines SET programme_id = ?, is_library = 0, source_routine_id = ?, is_template = 0, position = ? WHERE id = ?',
      [newPlan.id, libRoutine.id, i, newRoutine.id],
    );
  }

  return { ...newPlan, sourceProgrammeId: libraryPlanId };
}

export async function archivePlan(planId) {
  const d = await db();
  await d.runAsync(
    'UPDATE programmes SET is_active = 0, is_archived = 1, updated_at = ? WHERE id = ?',
    [Date.now(), planId],
  );
  _scheduleSync(); // C6 P44-03 (D97): archived state travels now
}

export async function unarchivePlan(planId) {
  const d = await db();
  await d.runAsync(
    'UPDATE programmes SET is_archived = 0, updated_at = ? WHERE id = ?',
    [Date.now(), planId],
  );
  _scheduleSync(); // C6 P44-03 (D97)
}

export async function getArchivedPlansForUser(userId) {
  const d = await db();
  const rows = await d.getAllAsync(
    `SELECT * FROM programmes
     WHERE user_id = ? AND (is_library = 0 OR is_library IS NULL) AND is_archived = 1
     ORDER BY updated_at DESC`,
    [userId],
  );
  return rows.map(rowToCamel);
}

// Pro auto-gen contract: a single managed plan. When a fresh plan is
// auto-generated and activated, every other non-archived non-library plan
// for this user gets archived so the "My plans" list shows just the
// current plan. Users can restore from the Archived section if needed.
export async function archiveOtherUserPlans(userId, keepPlanId) {
  const d = await db();
  await d.runAsync(
    `UPDATE programmes
     SET is_active = 0, is_archived = 1, updated_at = ?
     WHERE user_id = ?
       AND id != ?
       AND (is_library = 0 OR is_library IS NULL)
       AND (is_archived = 0 OR is_archived IS NULL)`,
    [Date.now(), userId, keepPlanId],
  );
  _scheduleSync(); // C6 P44-03 (D97)
}

export async function duplicatePlan(planId, userId) {
  const plan = await getProgrammeById(planId);
  if (!plan) throw new Error('Plan not found');

  const newPlan = await createProgramme(userId, `Copy of ${plan.name}`, plan.description, 0);

  const d = await db();
  // C6 P44-11 (D97): a duplicate carries provenance like a library copy
  // does (RB-6), so a renamed duplicate still identifies its source and
  // can never be mistaken for an unrelated hand-built plan.
  await d.runAsync(
    'UPDATE programmes SET source_programme_id = ?, updated_at = ? WHERE id = ?',
    [planId, Date.now(), newPlan.id],
  );
  const routineRows = await d.getAllAsync(
    `SELECT * FROM routines WHERE programme_id = ? AND (is_active = 1 OR is_active IS NULL)
     ORDER BY (position IS NULL), position ASC, created_at ASC`,
    [planId],
  );

  for (let i = 0; i < routineRows.length; i++) {
    const routine = rowToCamel(routineRows[i]);
    const newRoutine = await duplicateRoutine(routine.id, userId, routine.name);
    // Day order carries over from the source plan (loop index), not the
    // position createRoutine assigned while the copy briefly had no
    // programme_id.
    await d.runAsync(
      'UPDATE routines SET programme_id = ?, is_library = 0, position = ? WHERE id = ?',
      [newPlan.id, i, newRoutine.id],
    );
  }

  return newPlan;
}

export async function getWorkoutTemplates(userId) {
  const d = await db();
  const rows = await d.getAllAsync(
    `SELECT * FROM routines
     WHERE user_id = ? AND (programme_id IS NULL OR programme_id = '') AND (is_library = 0 OR is_library IS NULL) AND (is_active = 1 OR is_active IS NULL)
     ORDER BY updated_at DESC`,
    [userId],
  );
  return rows.map(rowToCamel);
}

export async function createWorkoutTemplateFromWorkout(userId, name, exerciseData) {
  const d = await db();
  const id = uid();
  const now = Date.now();
  await d.runAsync(
    `INSERT INTO routines (id, user_id, name, is_active, is_library, is_template, created_at, updated_at)
     VALUES (?, ?, ?, 1, 0, 1, ?, ?)`,
    [id, userId, name, now, now],
  );
  for (let i = 0; i < exerciseData.length; i++) {
    const ex = exerciseData[i];
    if (!ex.exerciseId) continue;
    // addExerciseToRoutine already calls _scheduleSync internally;
    // the 2-second debounce in sync.scheduleSync coalesces every
    // call from this loop into a single bulk push.
    await addExerciseToRoutine(id, ex.exerciseId, i, ex.repsMin || 8, ex.repsMax || 12, null, ex.recommendedSets || 3);
  }
  _scheduleSync();
  return { id, userId, name, isActive: 1, isLibrary: 0, isTemplate: 1, createdAt: now, updatedAt: now };
}

export async function getPlanWorkoutCounts() {
  const d = await db();
  const rows = await d.getAllAsync(
    `SELECT programme_id, COUNT(*) as cnt FROM routines
     WHERE programme_id IS NOT NULL AND programme_id != '' AND (is_active = 1 OR is_active IS NULL)
     GROUP BY programme_id`,
  );
  return Object.fromEntries(rows.map(r => [r.programme_id, r.cnt]));
}

export async function updateProgrammeName(id, name) {
  const d = await db();
  await d.runAsync('UPDATE programmes SET name = ?, updated_at = ? WHERE id = ?', [name, Date.now(), id]);
  _scheduleSync();
}

// ─── Mesocycles ───────────────────────────────────────────────────────────────────────────────────

export async function getActiveBlock(userId) {
  const d = await db();
  const row = await d.getFirstAsync(
    'SELECT * FROM mesocycles WHERE user_id = ? AND is_active = 1 ORDER BY created_at DESC LIMIT 1',
    [userId],
  );
  return row ? rowToCamel(row) : null;
}

export async function getAllMesocycles(userId) {
  const d = await db();
  const rows = await d.getAllAsync(
    'SELECT * FROM mesocycles WHERE user_id = ? ORDER BY created_at DESC',
    [userId],
  );
  return rows.map(rowToCamel);
}

// Generate mesocycle_week rows for a mesocycle based on its RIR ladder
export async function generateMesocycleWeeks(mesocycleId) {
  const d = await db();
  const meso = await d.getFirstAsync('SELECT * FROM mesocycles WHERE id = ?', [mesocycleId]);
  if (!meso) return [];

  const plannedWeeks = meso.planned_weeks || 5;
  let rirLadder;
  try {
    rirLadder = JSON.parse(meso.rir_ladder || '[3,2,1,0,4]');
  } catch (_) {
    rirLadder = [3, 2, 1, 0, 4];
  }

  const now = Date.now();
  const weeks = [];

  // Wrap in a single transaction so a crash mid-loop doesn't leave a meso
  // with a partial week list (and so the writes commit atomically, much
  // faster than N round trips even on success).
  await runInTransaction(d, async () => {
    for (let i = 0; i < plannedWeeks; i++) {
      const weekIndex = i + 1;
      const isDeload = weekIndex === plannedWeeks ? 1 : 0;
      const rirTarget = rirLadder[i] ?? (isDeload ? 4 : Math.max(0, 3 - i));
      // Use a proper UUID v4. The previous composite id format
      // `mw_${mesocycleId}_${weekIndex}` looked sensible locally but the
      // cloud's mesocycle_weeks.id column is TYPE UUID and rejected
      // every push with "invalid input syntax for type uuid", which
      // meant mesocycle weeks never synced. Now uses uid() like every
      // other table; the (mesocycle_id, week_index) pair is the logical
      // key inside the row.
      const id = uid();

      await d.runAsync(
        `INSERT OR IGNORE INTO mesocycle_weeks (id, mesocycle_id, week_index, is_deload, rir_target, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, mesocycleId, weekIndex, isDeload, rirTarget, now],
      );

      weeks.push({ id, mesocycleId, weekIndex, isDeload, rirTarget });
    }
  });

  return weeks;
}

// Get the current active mesocycle week for a user.
//
// THE single date-based resolver for "which week of which block" (Wave 2,
// cross-surface-consistency-audit-2026-07-30): every consumer that needs
// weekIndex, plannedWeeks, isDeload or rirTarget for the active block reads
// it from here, never its own date maths or a DB-row heuristic.
//
// Previously resolved the week from the most recently linked workout's
// mesocycle_week_id -- and createWorkout linked EVERY workout to
// `ORDER BY week_index ASC LIMIT 1` (always week 1), so this permanently
// reported week 1's isDeload/rirTarget for the life of any block. Now
// mirrors getCurrentMesoWeek/getBlockStatus's DST-safe day maths
// (mesocycle.js, F10) against the block's own start_date and its
// authoritative planned_weeks (getCurrentBlockWeekIndex), then reads
// isDeload/rirTarget/id off the mesocycle_weeks row for that TRUE current
// week -- never week 1's row.
export async function getCurrentMesocycleWeek(userId) {
  try {
    const meso = await getActiveBlock(userId);
    if (!meso?.startDate) return null;

    const plannedWeeks = meso.plannedWeeks || meso.durationWeeks || 5;
    const weekIndex = getCurrentBlockWeekIndex(meso.startDate, plannedWeeks);
    // Stage 1 (2026-08-09): a finished block clamps to its final row (the
    // deload week) by construction; awaitingDecision tells every consumer
    // the honest state so none renders "Week N of N" as if still live.
    const { awaitingDecision } = getBlockStatus(meso.startDate, plannedWeeks);

    const d = await db();
    const row = await d.getFirstAsync(
      'SELECT * FROM mesocycle_weeks WHERE mesocycle_id = ? AND week_index = ?',
      [meso.id, weekIndex],
    );
    // Never fabricate a week row: if the schedule hasn't been generated (or
    // this index somehow has no row), report nothing rather than a guess.
    if (!row) return null;

    // C18 recovery-visibility amendment: `is_deload` alone cannot say WHY
    // training is lighter - `generateMesocycleWeeks` sets it on the block's
    // final week because that week IS the planned recovery week, and
    // `setMesocycleWeekDeload` sets it on an accumulation week because
    // recovery evidence justified easing off now. The block's own
    // `deload_week` is the fact that tells them apart, and it was simply never
    // returned beside the flag. Both now come out of this ONE resolver, so no
    // surface has to re-derive the state and none of them can disagree.
    const deloadWeek = meso.deloadWeek ?? null;
    return {
      id: row.id,
      weekRowId: row.id,
      mesocycleId: meso.id,
      blockId: meso.id,
      weekIndex: row.week_index,
      awaitingDecision,
      isDeload: row.is_deload === 1,
      deloadWeek,
      // NOTE (C18): this composition is the CALENDAR-side reading. The
      // planned-recovery branch is additionally gated on programme position by
      // `programmePosition.resolveProgrammePosition`, which re-resolves the
      // state with `recoveryPhaseAllowed` once it knows whether any required
      // pre-recovery session is still outstanding. Surfaces read the gated one.
      recoveryState: resolveRecoveryState({
        weekIndex: row.week_index,
        plannedWeeks,
        deloadWeek,
        isDeload: row.is_deload === 1,
        awaitingDecision,
      }),
      rirTarget: row.rir_target,
      mesoName: meso.name,
      blockType: meso.blockType,
      plannedWeeks,
      deloadProtocol: meso.deloadProtocol,
    };
  } catch (_e) {
    return null;
  }
}

// Flip a mesocycle week to a deload (recovery) week. Used by the weekly
// coach's confirm-then-apply early-deload (CoachOutputScreen): when the
// user applies it, next week becomes a recovery week. is_deload drives
// the deload prescription in ActiveWorkoutScreen; rir_target moves to the
// deload value (4) to match how generateMesocycleWeeks seeds the
// scheduled recovery week. is_deload is in the cloud push payload, so the
// flag syncs; the planned-volume cut to the floor is written separately
// by the caller via upsertPlannedMuscleVolume.
async function setMesocycleWeekDeloadInTx(d, weekId, { isDeload = true, rirTarget = 4 } = {}) {
  if (!weekId) throw new Error('A mesocycle week is required.');
  await d.runAsync(
    'UPDATE mesocycle_weeks SET is_deload = ?, rir_target = ?, updated_at = ? WHERE id = ?',
    [isDeload ? 1 : 0, rirTarget, Date.now(), weekId],
  );
}

export async function setMesocycleWeekDeload(weekId, options = {}) {
  const d = await db();
  await setMesocycleWeekDeloadInTx(d, weekId, options);
  _scheduleSync();
}

/** One mesocycle week row by id (FQ-4: the session allocation resolves its
 * block through the workout's mesocycle_week_id). */
export async function getMesocycleWeekById(weekId) {
  if (!weekId) return null;
  try {
    const d = await db();
    return await d.getFirstAsync('SELECT * FROM mesocycle_weeks WHERE id = ?', [weekId]);
  } catch (_e) {
    return null;
  }
}

export async function getNextMesocycleWeek(currentWeekId) {
  try {
    const d = await db();
    const current = await d.getFirstAsync(
      'SELECT * FROM mesocycle_weeks WHERE id = ?',
      [currentWeekId],
    );
    if (!current) return null;
    return await d.getFirstAsync(
      'SELECT * FROM mesocycle_weeks WHERE mesocycle_id = ? AND week_index = ?',
      [current.mesocycle_id, current.week_index + 1],
    );
  } catch (_e) {
    return null;
  }
}

// Seed planned_muscle_volume for all weeks of a mesocycle with a MEV→MAV ramp.
// Called once when a mesocycle is created (or can be called again to re-seed).
// Wrapped in a transaction so the ~70 INSERTs commit atomically (was a
// multi-second blocking write on slow Android devices; an interrupted call
// used to leave a half-seeded mesocycle that the UI couldn't recover).
// Stage 1 seam (2026-08-09): `_ledger` reserved for Stage 6 (per-muscle
// ranges from the Block Ledger replace the static ramp when evidence
// exists; the underscore drops when it is consumed). Default behaviour is
// byte-identical until then.
export async function generateInitialPlannedVolume(mesocycleId, volumeLandmarks, ledger = null, { blockedMuscles = null } = {}) {
  try {
    const d = await db();
    const weeks = await d.getAllAsync(
      'SELECT * FROM mesocycle_weeks WHERE mesocycle_id = ? ORDER BY week_index ASC',
      [mesocycleId],
    );
    if (weeks.length === 0) return;

    const accWeeks = weeks.filter(w => !w.is_deload);
    const deloadWeek = weeks.find(w => w.is_deload);
    const totalAcc = accWeeks.length;
    const now = Date.now();

    // Stage 6 (2026-08-09): `ledger` is blockLedgerRunner's resolved seed
    // map ({ ranges: { [muscle]: { startSets, peakSets, source } } }, one
    // entry per muscle the fallback chain resolved). A seeded muscle ramps
    // its own start -> peak (blockLedgerGather.buildSeededWeeklyTargets);
    // anything unresolved keeps the static MEV -> MAV template ramp, and
    // the row's `source` records which path wrote it so the Stage 8
    // explanation can never claim a personalisation that is not there.
    // Lazy require: keeps the pure gather module out of database.js's
    // import graph for consumers that never seed.
    const seedRanges = ledger?.ranges && typeof ledger.ranges === 'object' ? ledger.ranges : null;
    // eslint-disable-next-line global-require
    const { buildSeededWeeklyTargets } = seedRanges ? require('./blockLedgerGather') : {};

    // CC33 D112 R1 (section 15; closes audit T1-01): a muscle whose pool
    // is empty under the user's BASELINE rules gets honest zero rows -
    // planned 0 every week, [mev, mrv] band [0, 0] so computeVolumeApply
    // can never clamp an increase onto work that does not exist. The mav
    // column keeps the research value as landmark metadata. EPISODE-only
    // blocks never reach this set (see baselineBlockedMuscles): their
    // rows stay at the template as the protected baseline reintroduction
    // ramps back toward. The section 15 min itself goes through
    // resolveEffectiveTargets, the canonical former.
    // eslint-disable-next-line global-require
    const { resolveEffectiveTargets } = require('./capability/resolve');
    const blocked = blockedMuscles instanceof Set ? blockedMuscles : new Set(blockedMuscles ?? []);

    await runInTransaction(d, async () => {
      for (const [muscle, landmarks] of Object.entries(volumeLandmarks)) {
        const { mev, mav, mrv } = landmarks;
        const isBlocked = blocked.has(muscle);
        const seed = seedRanges?.[muscle];
        const seeded = !isBlocked
          && seed && Number.isFinite(seed.startSets) && Number.isFinite(seed.peakSets);
        const targets = seeded
          ? buildSeededWeeklyTargets({
            startSets: seed.startSets,
            peakSets: seed.peakSets,
            accumWeeks: Math.max(1, totalAcc),
            deloadSets: seed.deloadSets ?? mev,
          })
          : null;
        // C11 job 3: a seed carrying a capacity PROBE gets its own source, so
        // the explanation layer can keep the learned claim for the start and
        // the demonstrated ceiling while marking the one extra set at the top
        // as a test rather than as proven history.
        const source = seeded
          ? (seed.probed ? 'seed_learned_probe' : `seed_${seed.source}`)
          : 'template';
        // Stage 6 review #7: the row's [mev, mrv] is computeVolumeApply's
        // clamp band. A seed can legitimately sit above the research MRV
        // (its ceiling is the learned/adapted band, capped at 30), so the
        // row's mrv must accommodate the seeded peak or the coach's next
        // "add sets" apply would CLAMP the muscle back down. mev stays
        // the research floor anchor, untouched.
        const rowMrv = isBlocked ? 0 : (seeded ? Math.max(mrv, seed.peakSets) : mrv);
        const rowMev = isBlocked ? 0 : mev;
        for (let i = 0; i < accWeeks.length; i++) {
          const week = accWeeks[i];
          const progress = totalAcc <= 1 ? 1 : i / (totalAcc - 1);
          const templatePlanned = seeded ? targets[i] : Math.round(mev + (mav - mev) * progress);
          const planned = resolveEffectiveTargets(
            { [muscle]: templatePlanned },
            isBlocked ? { [muscle]: 0 } : {},
          )[muscle].effectiveTarget;
          const id = `pmv_${week.id}_${muscle}`;
          await d.runAsync(
            `INSERT OR IGNORE INTO planned_muscle_volume
               (id, mesocycle_week_id, muscle, planned_sets, mev, mav, mrv, source, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, week.id, muscle, planned, rowMev, mav, rowMrv, source, now, now],
          );
        }
        if (deloadWeek) {
          // Stage 7 (§3.4): a ledger-sourced seed sizes its own deload
          // week (strain-scaled share of the achieved peak, floored at
          // deloadFloor); every other source keeps the flat MEV recovery
          // week. The value is the ramp's own tail so the two can never
          // diverge (review #13).
          const deloadPlanned = isBlocked ? 0 : (seeded ? targets[targets.length - 1] : mev);
          const id = `pmv_${deloadWeek.id}_${muscle}`;
          await d.runAsync(
            `INSERT OR IGNORE INTO planned_muscle_volume
               (id, mesocycle_week_id, muscle, planned_sets, mev, mav, mrv, source, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, deloadWeek.id, muscle, deloadPlanned, rowMev, mav, rowMrv, source, now, now],
          );
        }
      }
    });
  } catch (e) {
    logError('database.generateInitialPlannedVolume', e, { mesocycleId });
  }
}

// Get all weeks for a mesocycle
export async function getMesocycleWeeks(mesocycleId) {
  try {
    const d = await db();
    const rows = await d.getAllAsync(
      'SELECT * FROM mesocycle_weeks WHERE mesocycle_id = ? ORDER BY week_index ASC',
      [mesocycleId],
    );
    return rows;
  } catch (_e) {
    return [];
  }
}

// ── Stage 6, Block Ledger readers (adaptive mesocycle build, 2026-08-09) ──
// Thin row fetchers for blockLedgerRunner; ALL judgement lives in the pure
// blockLedgerGather/blockMetrics/interBlock modules. Raw snake_case rows on
// purpose: allocateExerciseVolume parses secondary_muscles (the snake JSON
// column), and blockMetrics tolerates both shapes.

/** The block's completed training: workout feedback rows + their sets. */
/**
 * C13 job 4: which of these blocks still have ANY completed training rows?
 *
 * A stored Block Ledger is an immutable historical coaching decision and is
 * never rebuilt or rewritten when the user edits or deletes history. But
 * deleted evidence must not keep compounding into NEW personalisation for
 * ever: a block whose raw training data the user has entirely removed should
 * stop TEACHING the learned replay, while remaining perfectly readable as
 * the historical record of what was concluded at the time.
 *
 * "Raw evidence exists vs raw evidence deleted" is the only distinction that
 * is provable today, so it is the only one implemented — no material-edit
 * threshold is invented. Returns a Set of mesocycle ids that still hold at
 * least one completed set. Fails OPEN (every id returned) on a read error,
 * so a transient failure can never silently strip a user's learned history.
 */
export async function getBlocksWithTrainingEvidence(userId, mesocycleIds = []) {
  const ids = (Array.isArray(mesocycleIds) ? mesocycleIds : []).filter(Boolean);
  if (!userId || ids.length === 0) return new Set(ids);
  try {
    const d = await db();
    const holes = ids.map(() => '?').join(',');
    const rows = await d.getAllAsync(
      `SELECT DISTINCT w.mesocycle_id AS mesocycleId
         FROM workout_sets ws
         JOIN workouts w ON w.id = ws.workout_id
        WHERE w.user_id = ? AND w.is_completed = 1 AND w.mesocycle_id IN (${holes})`,
      [userId, ...ids],
    );
    return new Set((rows ?? []).map((r) => r.mesocycleId).filter(Boolean));
  } catch (_e) {
    return new Set(ids); // fail open: never strip history on a read failure
  }
}

export async function getBlockTrainingData(userId, mesocycleId) {
  try {
    const d = await db();
    const workouts = await d.getAllAsync(
      'SELECT * FROM workouts WHERE user_id = ? AND mesocycle_id = ? AND is_completed = 1',
      [userId, mesocycleId],
    );
    const sets = await d.getAllAsync(
      `SELECT ws.* FROM workout_sets ws
       JOIN workouts w ON w.id = ws.workout_id
       WHERE w.user_id = ? AND w.mesocycle_id = ? AND w.is_completed = 1`,
      [userId, mesocycleId],
    );
    const endedEarlyRows = await d.getAllAsync(
      `SELECT workout_id FROM session_resolutions
        WHERE user_id = ? AND mesocycle_id = ? AND resolution = 'ended_early'
          AND deleted_at IS NULL AND workout_id IS NOT NULL`,
      [userId, mesocycleId],
    );
    const endedEarlyIds = new Set(endedEarlyRows.map((r) => r.workout_id));
    // Keep every closed workout + set as execution evidence, but give
    // adherence/productivity consumers the honest full-completion subset.
    // ENDED_EARLY closes its workout for durability; closure alone must not
    // turn a partial session into "completed" coaching truth.
    const fullyCompletedWorkouts = workouts.filter((w) => !endedEarlyIds.has(w.id));
    return { workouts, sets, fullyCompletedWorkouts };
  } catch (_e) {
    return { workouts: [], sets: [], fullyCompletedWorkouts: [] };
  }
}

/** Completed sets before the block (prior bests + the newness check). */
export async function getPriorCompletedSets(userId, beforeMs, sinceMs) {
  try {
    const d = await db();
    return await d.getAllAsync(
      `SELECT ws.* FROM workout_sets ws
       JOIN workouts w ON w.id = ws.workout_id
       WHERE w.user_id = ? AND w.is_completed = 1
         AND ws.created_at < ? AND ws.created_at >= ?`,
      [userId, beforeMs, sinceMs],
    );
  } catch (_e) {
    return [];
  }
}

/** Every planned_muscle_volume row across the block's weeks (+week_index). */
export async function getPlannedMuscleVolumeForBlock(mesocycleId) {
  try {
    const d = await db();
    return await d.getAllAsync(
      `SELECT pmv.*, mw.week_index FROM planned_muscle_volume pmv
       JOIN mesocycle_weeks mw ON mw.id = pmv.mesocycle_week_id
       WHERE mw.mesocycle_id = ?
       ORDER BY mw.week_index ASC, pmv.muscle ASC`,
      [mesocycleId],
    );
  } catch (_e) {
    return [];
  }
}

/** Week starts of coach outputs whose recovery read suggested a deload. */
export async function getDeloadSuggestedWeekStarts(userId, fromMs, toMs) {
  try {
    const d = await db();
    const rows = await d.getAllAsync(
      `SELECT week_start FROM coach_outputs
       WHERE user_id = ? AND recovery_flag = 'deload_suggested'
         AND week_start >= ? AND week_start < ?`,
      [userId, fromMs, toMs],
    );
    return rows.map((r) => r.week_start).filter((v) => v != null);
  } catch (_e) {
    return [];
  }
}

/**
 * Distinct week starts of saved coach outputs on/after sinceMs. C6 P-2
 * (D97-20): evidence for how many phase weeks were actually coached, so
 * claim copy never counts months away as coached months. Fail-quiet []
 * (the engine then treats evidence as absent, never inflated).
 */
export async function getCoachOutputWeekStartsSince(userId, sinceMs) {
  try {
    const d = await db();
    const rows = await d.getAllAsync(
      `SELECT DISTINCT week_start FROM coach_outputs
       WHERE user_id = ? AND week_start >= ? AND deleted_at IS NULL`,
      [userId, sinceMs],
    );
    return rows.map((r) => r.week_start).filter((v) => v != null);
  } catch (_e) {
    return [];
  }
}

/** Exercise rows (seeded + this user's custom), raw, keyed by id. */
export async function getExerciseRowsById(userId) {
  try {
    const d = await db();
    const seeded = await d.getAllAsync('SELECT * FROM exercises');
    const custom = await d.getAllAsync(
      'SELECT * FROM custom_exercises WHERE user_id = ?', [userId],
    ).catch(() => []);
    const map = new Map();
    for (const row of seeded) map.set(row.id, row);
    for (const row of custom ?? []) map.set(row.id, row);
    return map;
  } catch (_e) {
    return new Map();
  }
}

/** Weekly check-ins inside a window, oldest first (readiness/sleep reads). */
export async function getCheckinsInRange(userId, fromMs, toMs) {
  try {
    const d = await db();
    const rows = await d.getAllAsync(
      `SELECT * FROM weekly_checkins
       WHERE user_id = ? AND week_start >= ? AND week_start < ?
       ORDER BY week_start ASC`,
      [userId, fromMs, toMs],
    );
    return rows.map(rowToCamel);
  } catch (_e) {
    return [];
  }
}

// ─── SESSION RESOLUTIONS (C18 block progression) ─────────────────────────────
//
// The explicit half of session resolution. COMPLETED is derived from workout
// rows and never written here; this stores only what execution cannot prove.
//
// The id is DERIVED from the instance identity rather than minted per device,
// so two devices resolving the same required session converge on one row
// instead of racing two - the same technique the coach_outputs unique-week fix
// uses. Cross-device conflict then falls to updated_at, and only a genuine
// timestamp tie reaches the id tie-break.

const sessionResolutionId = (mesocycleWeekId, routineId) =>
  `sr_${mesocycleWeekId}_${routineId}`;

async function _upsertSessionResolutionOnDb(d, userId, {
  mesocycleWeekId, routineId, mesocycleId = null, resolution, workoutId = null,
}, now) {
  const id = sessionResolutionId(mesocycleWeekId, routineId);
  await d.runAsync(
    `INSERT INTO session_resolutions
       (id, user_id, mesocycle_week_id, routine_id, mesocycle_id, resolution,
        workout_id, resolved_at, created_at, updated_at, updated_at_iso, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
     ON CONFLICT(mesocycle_week_id, routine_id) DO UPDATE SET
       resolution = excluded.resolution,
       workout_id = excluded.workout_id,
       resolved_at = excluded.resolved_at,
       updated_at = excluded.updated_at,
       updated_at_iso = excluded.updated_at_iso,
       deleted_at = NULL`,
    [id, userId, mesocycleWeekId, routineId, mesocycleId, resolution,
      workoutId, now, now, now, new Date(now).toISOString()],
  );
  return id;
}

/**
 * Record an explicit resolution for ONE required session instance.
 *
 * @param {string} resolution  'skipped_by_user' | 'ended_early'
 * @param {string|null} workoutId  for ended_early, the partially performed
 *   session, so the actual sets stay unambiguously attached to it.
 */
export async function recordSessionResolution(userId, {
  mesocycleWeekId, routineId, mesocycleId = null, resolution, workoutId = null,
} = {}) {
  if (!userId || !mesocycleWeekId || !routineId) return null;
  if (resolution !== 'skipped_by_user' && resolution !== 'ended_early') return null;
  const d = await db();
  const now = Date.now();
  const id = await _upsertSessionResolutionOnDb(d, userId, {
    mesocycleWeekId, routineId, mesocycleId, resolution, workoutId,
  }, now);
  _scheduleSync();
  return id;
}

/**
 * Close an ended-early workout and persist its explicit programme resolution
 * in one SQLite transaction. A process death can therefore observe either
 * the still-resumable workout with no resolution, or the closed workout with
 * ENDED_EARLY; it cannot observe the impossible half-state between them.
 */
export async function finishWorkoutWithSessionResolution(
  workoutId, workoutData, userId, resolutionData,
) {
  if (!workoutId || !userId || !resolutionData?.mesocycleWeekId || !resolutionData?.routineId) {
    throw new Error('Ended-early finalisation requires a required-session identity');
  }
  if (resolutionData.resolution !== 'ended_early') {
    throw new Error('Atomic workout finalisation only accepts ended_early');
  }
  const d = await db();
  const now = Date.now();
  const id = await runInTransaction(d, async () => {
    const updateResult = await _updateWorkoutOnDb(d, workoutId, workoutData, now, {
      userId,
      routineId: resolutionData.routineId,
      mesocycleWeekId: resolutionData.mesocycleWeekId,
    });
    if (updateResult?.changes !== 1) {
      throw new Error('Ended-early workout identity did not match one local workout');
    }
    return _upsertSessionResolutionOnDb(d, userId, {
      ...resolutionData, workoutId,
    }, now);
  });
  _scheduleSync();
  return id;
}

/** Every live resolution for one programme week. */
export async function getSessionResolutionsForWeek(userId, mesocycleWeekId) {
  if (!userId || !mesocycleWeekId) return [];
  try {
    const d = await db();
    const rows = await d.getAllAsync(
      `SELECT * FROM session_resolutions
        WHERE user_id = ? AND mesocycle_week_id = ? AND deleted_at IS NULL`,
      [userId, mesocycleWeekId],
    );
    return rows.map(rowToCamel);
  } catch (_e) { return []; }
}

/** Every live resolution for the user, for multi-week progression reads. */
export async function getAllSessionResolutionsForUser(userId) {
  if (!userId) return [];
  try {
    const d = await db();
    // Deliberately INCLUDES soft-deleted rows: this is the sync push reader,
    // and a deletion must propagate as a tombstone. Product readers filter.
    const rows = await d.getAllAsync(
      'SELECT * FROM session_resolutions WHERE user_id = ?', [userId],
    );
    return rows.map(rowToCamel);
  } catch (_e) { return []; }
}

/** Live resolutions only, for the progression resolver. */
export async function getLiveSessionResolutions(userId) {
  return (await getAllSessionResolutionsForUser(userId))
    .filter((r) => r.deletedAt == null);
}

/** Cloud restore. Newer updated_at wins; a tie keeps what is already local. */
export async function insertOrUpdateSessionResolutionFromCloud(userId, row) {
  if (!userId || !row?.mesocycle_week_id || !row?.routine_id) return;
  const d = await db();
  const incoming = row.updated_at ? Date.parse(row.updated_at) : 0;
  const existing = await d.getFirstAsync(
    `SELECT id, resolution, workout_id, resolved_at, updated_at
       FROM session_resolutions WHERE mesocycle_week_id = ? AND routine_id = ?`,
    [row.mesocycle_week_id, row.routine_id],
  );
  const resolvedAt = row.resolved_at ? Date.parse(row.resolved_at) : incoming;
  const incomingVersion = {
    id: row.id ?? sessionResolutionId(row.mesocycle_week_id, row.routine_id),
    resolution: row.resolution,
    workoutId: row.workout_id ?? null,
    resolvedAt,
    updatedAt: incoming,
  };
  if (existing && compareSessionResolutionVersions(incomingVersion, existing) <= 0) return;
  await d.runAsync(
    `INSERT INTO session_resolutions
       (id, user_id, mesocycle_week_id, routine_id, mesocycle_id, resolution,
        workout_id, resolved_at, created_at, updated_at, updated_at_iso, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(mesocycle_week_id, routine_id) DO UPDATE SET
       resolution = excluded.resolution,
       workout_id = excluded.workout_id,
       resolved_at = excluded.resolved_at,
       updated_at = excluded.updated_at,
       updated_at_iso = excluded.updated_at_iso,
       deleted_at = excluded.deleted_at`,
    [
      row.id ?? sessionResolutionId(row.mesocycle_week_id, row.routine_id),
      userId, row.mesocycle_week_id, row.routine_id, row.mesocycle_id ?? null,
      row.resolution, row.workout_id ?? null,
      Number.isFinite(resolvedAt) ? resolvedAt : Date.now(),
      row.created_at ? Date.parse(row.created_at) : Date.now(),
      Number.isFinite(incoming) ? incoming : Date.now(),
      row.updated_at ?? null,
      row.deleted_at ? Date.parse(row.deleted_at) : null,
    ],
  );
}

/** Persist a computed Block Ledger on its finished block's row. */
export async function storeBlockLedger(mesocycleId, ledgerJson) {
  const d = await db();
  await d.runAsync(
    'UPDATE mesocycles SET block_ledger = ?, updated_at = ? WHERE id = ?',
    [ledgerJson, Date.now(), mesocycleId],
  );
  _scheduleSync();
}

// Write an adaptation event (engine decision log)
export async function createAdaptationEvent({ mesocycleWeekId, muscle, exerciseId, decision, delta, reasonCode, reasonText, signals }) {
  try {
    const d = await db();
    const id = `ae_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = Date.now();
    await d.runAsync(
      `INSERT INTO adaptation_events (id, mesocycle_week_id, muscle, exercise_id, decision, delta, reason_code, reason_text, signals_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, mesocycleWeekId, muscle || null, exerciseId || null, decision, delta ?? null, reasonCode, reasonText || null, JSON.stringify(signals || {}), now],
    );
    _scheduleSync();
    return { id };
  } catch (_e) {
    return null;
  }
}

// Get planned muscle volume for a week
export async function getPlannedMuscleVolume(mesocycleWeekId) {
  try {
    const d = await db();
    const rows = await d.getAllAsync(
      'SELECT * FROM planned_muscle_volume WHERE mesocycle_week_id = ? ORDER BY muscle ASC',
      [mesocycleWeekId],
    );
    return rows;
  } catch (_e) {
    return [];
  }
}

// Fetch recent adaptation_events for the current mesocycle week (to evaluate deload triggers)
export async function getRecentAdaptationEvents(userId, limitWeeks = 1) {
  try {
    const d = await db();
    const cutoff = Date.now() - limitWeeks * 7 * 24 * 60 * 60 * 1000;
    const rows = await d.getAllAsync(
      `SELECT ae.*
       FROM adaptation_events ae
       JOIN mesocycle_weeks mw ON mw.id = ae.mesocycle_week_id
       JOIN mesocycles m ON m.id = mw.mesocycle_id
       WHERE m.user_id = ? AND ae.created_at >= ?
       ORDER BY ae.created_at DESC`,
      [userId, cutoff],
    );
    return rows;
  } catch (_e) {
    return [];
  }
}

// Get the week-1 sets for an exercise within a mesocycle (for deload anchoring)
export async function getWeek1SetsForExercise(mesocycleId, exerciseId) {
  try {
    const d = await db();
    const week1 = await d.getFirstAsync(
      'SELECT id FROM mesocycle_weeks WHERE mesocycle_id = ? AND week_index = 1',
      [mesocycleId],
    );
    if (!week1) return [];
    const sets = await d.getAllAsync(
      `SELECT ws.* FROM workout_sets ws
       JOIN workouts w ON w.id = ws.workout_id
       WHERE w.mesocycle_week_id = ? AND ws.exercise_id = ? AND ws.set_type != 'warmup'
       ORDER BY ws.set_number ASC`,
      [week1.id, exerciseId],
    );
    return sets.map(s => ({
      weight: s.weight,
      actualReps: s.actual_reps ?? s.actualReps,
      setType: s.set_type ?? s.setType ?? 'straight',
      rir: s.rir,
    }));
  } catch (_e) {
    return [];
  }
}

// Write or update planned muscle volume for a week (engine writes here)
async function upsertPlannedMuscleVolumeInTx(d, {
  mesocycleWeekId, muscle, plannedSets, mev, mav, mrv, source = 'engine',
}) {
  const id = `pmv_${mesocycleWeekId}_${muscle}`;
  const now = Date.now();
  await d.runAsync(
    `INSERT INTO planned_muscle_volume (id, mesocycle_week_id, muscle, planned_sets, mev, mav, mrv, source, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET planned_sets = excluded.planned_sets, source = excluded.source, updated_at = excluded.updated_at`,
    [id, mesocycleWeekId, muscle, plannedSets, mev, mav, mrv, source, now, now],
  );
}

export async function upsertPlannedMuscleVolume(args) {
  const d = await db();
  await upsertPlannedMuscleVolumeInTx(d, args);
  _scheduleSync();
}

// Stage 6 (2026-08-09): the dead createMesocycle function is DELETED. It
// had zero callers (proven by the Stage 1 caller-walk pin) and duplicated
// activatePlanWithBlock's inline INSERT — the ONLY live block-creation
// path, reached solely from explicit user plan activation. Any future
// creation path goes through activatePlanWithBlock so the Block Ledger
// seeding and the no-silent-creation invariant hold.

// ─── Nutrition Targets ────────────────────────────────────

export async function saveNutritionTargets(userId, targets) {
  const d = await db();
  const now = Date.now();
  // Push to cloud after the local write completes so a fresh device
  // sign-in restores the same target row. Fire-and-forget; if the
  // user isn't signed in this is a no-op.
  const pushToCloud = () => {
    try {
      // eslint-disable-next-line global-require
      const { syncNutritionTargets } = require('./sync');
      // eslint-disable-next-line global-require
      const useAppStore = require('../store/useAppStore').default;
      const sessionUserId = useAppStore.getState().session?.user?.id;
      if (sessionUserId) {
        syncNutritionTargets(sessionUserId, userId).catch(() => {});
      }
    } catch (_) { /* offline / module load fail: best-effort only */ }
  };
  const existing = await d.getFirstAsync(
    'SELECT id FROM nutrition_targets WHERE user_id = ? LIMIT 1',
    [userId],
  );
  if (existing) {
    await d.runAsync(
      `UPDATE nutrition_targets SET
        bmr=?, tdee=?, target_kcal=?, protein_g=?, carbs_g=?, fat_g=?,
        phase=?, bmr_method=?, activity_level=?, confidence=?, warnings=?,
        gdpr_consented=?, goal=?, protein_approach=?, updated_at=?
       WHERE user_id=?`,
      [
        targets.bmr ?? null, targets.tdee ?? null, targets.targetKcal ?? null,
        targets.proteinG ?? null, targets.carbsG ?? null, targets.fatG ?? null,
        targets.phase ?? null, targets.bmrMethod ?? null, targets.activityLevel ?? null,
        targets.confidence ?? null,
        targets.warnings ? JSON.stringify(targets.warnings) : null,
        targets.gdprConsented ? 1 : 0,
        targets.goal ?? null, targets.proteinApproach ?? null,
        now, userId,
      ],
    );
    pushToCloud();
    return existing.id;
  }
  const id = uid();
  await d.runAsync(
    `INSERT INTO nutrition_targets
      (id, user_id, bmr, tdee, target_kcal, protein_g, carbs_g, fat_g,
       phase, bmr_method, activity_level, confidence, warnings, gdpr_consented,
       goal, protein_approach, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, userId,
      targets.bmr ?? null, targets.tdee ?? null, targets.targetKcal ?? null,
      targets.proteinG ?? null, targets.carbsG ?? null, targets.fatG ?? null,
      targets.phase ?? null, targets.bmrMethod ?? null, targets.activityLevel ?? null,
      targets.confidence ?? null,
      targets.warnings ? JSON.stringify(targets.warnings) : null,
      targets.gdprConsented ? 1 : 0,
      targets.goal ?? null, targets.proteinApproach ?? null, now, now,
    ],
  );
  pushToCloud();
  return id;
}

export async function getNutritionTargets(userId) {
  const d = await db();
  const row = await d.getFirstAsync(
    'SELECT * FROM nutrition_targets WHERE user_id = ? LIMIT 1',
    [userId],
  );
  if (!row) return null;
  const result = rowToCamel(row);
  if (result.warnings && typeof result.warnings === 'string') {
    try { result.warnings = JSON.parse(result.warnings); } catch { result.warnings = []; }
  }
  return result;
}

// ─── Effective-maintenance memo (Campaign 19) ─────────────────────────────

export async function getEffectiveMaintenanceMemo(userId) {
  if (!userId) return null;
  const d = await db();
  const row = await d.getFirstAsync(
    'SELECT * FROM effective_maintenance_memos WHERE user_id = ? LIMIT 1',
    [userId],
  );
  return row ? rowToCamel(row) : null;
}

function effectiveMemoFields(memo) {
  return [
    Math.round(Number(memo.cumulativeResidualKcal)),
    Math.round(Number(memo.formulaPriorKcalAtDerivation)),
    Math.round(Number(memo.effectiveMaintenanceKcalAtDerivation)),
    memo.source,
    memo.status,
    memo.reason,
    Number(memo.algorithmVersion),
    Number(memo.asOf),
    memo.evidenceSignature,
    Math.round(Number(memo.foodDaysLogged)),
    Math.round(Number(memo.weightPoints)),
    memo.bodyweightKg != null && memo.bodyweightKg !== '' && Number.isFinite(Number(memo.bodyweightKg))
      ? Number(memo.bodyweightKg) : null,
    memo.goalPhase ?? null,
    memo.activityLevel ?? null,
    memo.formulaMethod ?? null,
    memo.formulaContextSignature,
    memo.largeDivergence ? 1 : 0,
    memo.revalidationStartedAt != null && memo.revalidationStartedAt !== ''
      && Number.isFinite(Number(memo.revalidationStartedAt))
      ? Number(memo.revalidationStartedAt) : null,
    memo.revalidationContextSignature ?? null,
    memo.versionKey,
  ];
}

function validateEffectiveMemo(memo) {
  if (!isValidEffectiveMaintenanceMemo(memo)) throw new Error('Invalid effective-maintenance memo');
}

export async function saveEffectiveMaintenanceMemo(userId, memo) {
  if (!userId) throw new Error('userId is required');
  validateEffectiveMemo(memo);
  const d = await db();
  const now = Date.now();
  const values = effectiveMemoFields(memo);
  await d.runAsync(
    `INSERT INTO effective_maintenance_memos (
       user_id, cumulative_residual_kcal, formula_prior_kcal_at_derivation,
       effective_maintenance_kcal_at_derivation, source, status, reason,
       algorithm_version, as_of, evidence_signature, food_days_logged,
       weight_points, bodyweight_kg, goal_phase, activity_level, formula_method,
       formula_context_signature, large_divergence, revalidation_started_at,
       revalidation_context_signature, version_key, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       cumulative_residual_kcal=excluded.cumulative_residual_kcal,
       formula_prior_kcal_at_derivation=excluded.formula_prior_kcal_at_derivation,
       effective_maintenance_kcal_at_derivation=excluded.effective_maintenance_kcal_at_derivation,
       source=excluded.source, status=excluded.status, reason=excluded.reason,
       algorithm_version=excluded.algorithm_version, as_of=excluded.as_of,
       evidence_signature=excluded.evidence_signature,
       food_days_logged=excluded.food_days_logged, weight_points=excluded.weight_points,
       bodyweight_kg=excluded.bodyweight_kg, goal_phase=excluded.goal_phase,
       activity_level=excluded.activity_level, formula_method=excluded.formula_method,
       formula_context_signature=excluded.formula_context_signature,
       large_divergence=excluded.large_divergence,
       revalidation_started_at=excluded.revalidation_started_at,
       revalidation_context_signature=excluded.revalidation_context_signature,
       version_key=excluded.version_key,
       updated_at=excluded.updated_at`,
    [userId, ...values, now, now],
  );
  _scheduleSync();
  return getEffectiveMaintenanceMemo(userId);
}

// Deterministic LWW: an older arrival never overwrites a newer row. Equal
// timestamps converge on the lexicographically greater content-derived key,
// so arrival order cannot affect the final value and exact retries are inert.
export async function insertEffectiveMaintenanceMemoFromCloud(localUserId, row, { cloudUserId = localUserId } = {}) {
  if (!localUserId || !cloudUserId || row?.user_id !== cloudUserId) return false;
  const incomingUpdated = Date.parse(row.updated_at);
  if (!Number.isFinite(incomingUpdated)) return false;
  const d = await db();
  const local = await d.getFirstAsync(
    'SELECT updated_at, version_key FROM effective_maintenance_memos WHERE user_id = ? LIMIT 1',
    [localUserId],
  );
  if (local && compareEffectiveMaintenanceVersions(
    { updatedAt: incomingUpdated, versionKey: row.version_key },
    { updatedAt: local.updated_at, versionKey: local.version_key },
  ) <= 0) return false;

  const memo = {
    cumulativeResidualKcal: row.cumulative_residual_kcal,
    formulaPriorKcalAtDerivation: row.formula_prior_kcal_at_derivation,
    effectiveMaintenanceKcalAtDerivation: row.effective_maintenance_kcal_at_derivation,
    source: row.source, status: row.status, reason: row.reason,
    algorithmVersion: row.algorithm_version,
    asOf: Date.parse(row.as_of),
    evidenceSignature: row.evidence_signature,
    foodDaysLogged: row.food_days_logged,
    weightPoints: row.weight_points,
    bodyweightKg: row.bodyweight_kg,
    goalPhase: row.goal_phase,
    activityLevel: row.activity_level,
    formulaMethod: row.formula_method,
    formulaContextSignature: row.formula_context_signature,
    largeDivergence: !!row.large_divergence,
    revalidationStartedAt: row.revalidation_started_at == null ? null : Date.parse(row.revalidation_started_at),
    revalidationContextSignature: row.revalidation_context_signature,
    versionKey: row.version_key,
  };
  validateEffectiveMemo(memo);
  const values = effectiveMemoFields(memo);
  await d.runAsync(
    `INSERT INTO effective_maintenance_memos (
       user_id, cumulative_residual_kcal, formula_prior_kcal_at_derivation,
       effective_maintenance_kcal_at_derivation, source, status, reason,
       algorithm_version, as_of, evidence_signature, food_days_logged,
       weight_points, bodyweight_kg, goal_phase, activity_level, formula_method,
       formula_context_signature, large_divergence, revalidation_started_at,
       revalidation_context_signature, version_key, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       cumulative_residual_kcal=excluded.cumulative_residual_kcal,
       formula_prior_kcal_at_derivation=excluded.formula_prior_kcal_at_derivation,
       effective_maintenance_kcal_at_derivation=excluded.effective_maintenance_kcal_at_derivation,
       source=excluded.source, status=excluded.status, reason=excluded.reason,
       algorithm_version=excluded.algorithm_version, as_of=excluded.as_of,
       evidence_signature=excluded.evidence_signature,
       food_days_logged=excluded.food_days_logged, weight_points=excluded.weight_points,
       bodyweight_kg=excluded.bodyweight_kg, goal_phase=excluded.goal_phase,
       activity_level=excluded.activity_level, formula_method=excluded.formula_method,
       formula_context_signature=excluded.formula_context_signature,
       large_divergence=excluded.large_divergence,
       revalidation_started_at=excluded.revalidation_started_at,
       revalidation_context_signature=excluded.revalidation_context_signature,
       version_key=excluded.version_key,
       updated_at=excluded.updated_at`,
    [localUserId, ...values, incomingUpdated, incomingUpdated],
  );
  return true;
}

// ─── Body Metrics ─────────────────────────────────────────────

export async function logBodyMetric(userId, data) {
  return bodyMetricsRepository.logBodyMetric(userId, data);
}

// D16 (NAV-2): options.includeDeleted lets the per-table sync push (which
// must still see tombstoned rows so a delete propagates to the cloud) opt
// back in; every UI read stays on the default (live, non-deleted) series.
export async function getBodyMetricLog(userId, limitRows = 90, options = {}) {
  return bodyMetricsRepository.getBodyMetricLog(userId, limitRows, options);
}

// D16 (NAV-2): correct any field (including the logged date) on an existing
// body-metric entry. Returns true if a live row was found and updated.
export async function updateBodyMetric(userId, id, data) {
  return bodyMetricsRepository.updateBodyMetric(userId, id, data);
}

// D16 (NAV-2): soft-delete an entry (tombstone, same convention as recipes /
// food_entries). Returns true if a live row was found and deleted.
export async function deleteBodyMetric(userId, id) {
  return bodyMetricsRepository.deleteBodyMetric(userId, id);
}

export async function getLatestBodyWeight(userId) {
  // No onboarding fallback: onboarding bodyweight lives in AsyncStorage
  // userProfile.weightKg, not a body-weight table.
  return bodyMetricsRepository.getLatestBodyWeight(userId);
}

// Nearest logged bodyweight to an arbitrary instant `t` (epoch ms), across BOTH
// body_metric_log and morning_weights. Used to snapshot a bodyweight beside a
// progress photo at its taken_at (progress-photos upgrade). Unlike
// getLatestBodyWeight (latest overall), this finds the weigh-in closest to `t`:
// the most recent one on-or-before `t` is preferred (the weight the user was at
// when the photo was taken); only if the photo predates every weigh-in do we
// fall back to the nearest one overall (the earliest recorded). Returns
// { weightKg, loggedAt } or null when the user has no logged weigh-in.
export async function getBodyWeightNearestTo(userId, t) {
  return bodyMetricsRepository.getBodyWeightNearestTo(userId, t);
}

// Most recent logged body composition that actually carries a body fat figure.
// Used by the plan-update and nutrition-target flows to recover BF% + method for
// users who onboarded before the profile started persisting them, so the BMR
// formula (Katch-McArdle when a credible BF% exists) stays consistent across
// onboarding, Update Your Plan and the manual recalc. Read-only, returns null
// when the user has never logged a body fat reading.
export async function getLatestBodyComposition(userId) {
  return bodyMetricsRepository.getLatestBodyComposition(userId);
}

// ─── CSV / JSON export ────────────────────────────────────────────

function csvEscape(value) {
  if (value == null) return '';
  let s = String(value);
  // Neutralise spreadsheet formula injection: a cell that begins with =, +, -,
  // @, tab or carriage return can be run as a formula by Excel / Google Sheets.
  // A workout note is free text, so it is the most likely carrier. Prefix it
  // with a single quote so it is treated as plain text. (A2-060.)
  if (/^[=+\-@\t\r]/.test(s)) {
    s = `'${s}`;
  }
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function buildWorkoutCSV(userId) {
  const d = await db();
  const rows = await d.getAllAsync(
    `SELECT
       ws.created_at        AS set_created_at,
       w.name               AS workout_name,
       r.name               AS routine_name,
       p.name               AS programme_name,
       e.name               AS exercise_name,
       ws.set_number, ws.set_type, ws.weight, ws.actual_reps,
       ws.rir, ws.rpe, ws.failed, ws.missed_reps, ws.notes
     FROM workout_sets ws
     LEFT JOIN workouts   w ON ws.workout_id = w.id
     LEFT JOIN routines   r ON w.routine_id  = r.id
     LEFT JOIN programmes p ON r.programme_id = p.id
     LEFT JOIN exercises  e ON ws.exercise_id = e.id
     WHERE ws.user_id = ?
     ORDER BY ws.created_at ASC`,
    [userId],
  );

  const header = [
    'date', 'time', 'routine', 'programme', 'exercise',
    'set_n', 'set_type', 'weight_kg', 'weight_lb', 'reps',
    'rir', 'rpe', 'failed', 'missed_reps', 'notes',
  ];
  const lines = [header.join(',')];

  for (const r of rows) {
    const dt = r.set_created_at ? new Date(r.set_created_at) : null;
    // Local date + time, not UTC. A set logged at 00:30 BST belongs to the
    // user's "today", not yesterday 23:30 (locked rule: every date the user
    // sees is their local calendar day).
    const date = dt ? localDayKey(r.set_created_at) : '';
    const time = dt
      ? `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}:${String(dt.getSeconds()).padStart(2, '0')}`
      : '';
    const wkg = r.weight ?? '';
    const wlb = r.weight != null ? Math.round(r.weight * 2.20462 * 10) / 10 : '';
    lines.push([
      date, time,
      csvEscape(r.routine_name), csvEscape(r.programme_name), csvEscape(r.exercise_name),
      r.set_number ?? '', csvEscape(r.set_type), wkg, wlb, r.actual_reps ?? '',
      r.rir ?? '', r.rpe ?? '', r.failed ? 1 : 0, r.missed_reps ?? '',
      csvEscape(r.notes),
    ].join(','));
  }

  return { csv: lines.join('\n'), rowCount: rows.length };
}

// ─── User Insights ────────────────────────────────────────────────

/**
 * Upserts freshly-generated insights. An insight is keyed by `insight_key`.
 * If a non-dismissed row with the same key exists, it is refreshed in place
 * (so the same condition doesn't stack). Dismissed insights are NOT
 * resurrected unless their key disappears and reappears after dismissal age.
 */
export async function persistInsights(userId, insights) {
  const d = await db();
  const now = Date.now();

  // Prune active (non-dismissed) insights that are no longer generated, so a
  // condition that has resolved, or a rule that no longer applies after a
  // logic fix, stops showing instead of lingering forever. Dismissed rows
  // are kept so the 14-day "don't resurrect" window still works.
  const liveKeys = insights.map(i => i.key);
  if (liveKeys.length > 0) {
    const placeholders = liveKeys.map(() => '?').join(', ');
    await d.runAsync(
      `DELETE FROM user_insights
       WHERE user_id = ? AND dismissed_at IS NULL
       AND insight_key NOT IN (${placeholders})`,
      [userId, ...liveKeys],
    );
  } else {
    await d.runAsync(
      'DELETE FROM user_insights WHERE user_id = ? AND dismissed_at IS NULL',
      [userId],
    );
  }

  for (const ins of insights) {
    const existing = await d.getFirstAsync(
      `SELECT id, dismissed_at FROM user_insights
       WHERE user_id = ? AND insight_key = ?
       ORDER BY generated_at DESC LIMIT 1`,
      [userId, ins.key],
    );
    if (existing) {
      // Don't resurrect something the user dismissed in the last 14 days.
      if (existing.dismissed_at && now - existing.dismissed_at < 14 * 24 * 60 * 60 * 1000) {
        continue;
      }
      if (!existing.dismissed_at) {
        await d.runAsync(
          `UPDATE user_insights
           SET type=?, severity=?, copy=?, action_payload=?, generated_at=?
           WHERE id=?`,
          [ins.type, ins.severity, ins.copy,
           ins.actionPayload ? JSON.stringify(ins.actionPayload) : null,
           now, existing.id],
        );
        continue;
      }
    }
    await d.runAsync(
      `INSERT INTO user_insights
        (id, user_id, insight_key, type, severity, copy, action_payload, generated_at, dismissed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      [uid(), userId, ins.key, ins.type, ins.severity, ins.copy,
       ins.actionPayload ? JSON.stringify(ins.actionPayload) : null, now],
    );
  }
}

export async function getActiveInsights(userId, limitRows = 3) {
  const d = await db();
  const rows = await d.getAllAsync(
    `SELECT * FROM user_insights
     WHERE user_id = ? AND dismissed_at IS NULL
     ORDER BY severity DESC, generated_at DESC
     LIMIT ?`,
    [userId, limitRows],
  );
  return rows.map(r => {
    const c = rowToCamel(r);
    if (c.actionPayload) {
      try { c.actionPayload = JSON.parse(c.actionPayload); } catch { c.actionPayload = null; }
    }
    return c;
  });
}

export async function dismissInsight(insightId) {
  const d = await db();
  // C6 F5 (D97): the local table carries no updated_at column, so the
  // honest-timestamp half of the fix would need a schema change; the
  // pull-side ratchet in insertOrUpdateUserInsightFromCloud alone closes
  // the user-visible defect (a dismissal can never be un-dismissed by a
  // stale device). The cloud row may briefly flap; devices converge on
  // dismissed.
  await d.runAsync(
    'UPDATE user_insights SET dismissed_at = ? WHERE id = ?',
    [Date.now(), insightId],
  );
}

/**
 * Loads the last 28 days of training, runs the deterministic insight engine,
 * and persists results. Safe to call on screen mount + post-session.
 */
export async function runInsightsEngine(userId) {
  if (!userId) return [];
  try {
    // LB-7: pull only the 28-day window the engine uses, in SQL, instead
    // of loading every set ever logged and filtering in JS. completedOnly
    // false keeps the prior getAllWorkoutSets semantics (all sets, incl.
    // an in-progress session) so the output is unchanged.
    const cutoff = Date.now() - 28 * 24 * 60 * 60 * 1000;
    const [workouts, recentSets, exercises] = await Promise.all([
      getAllWorkouts(userId),
      getWorkoutSetsSince(userId, cutoff, { completedOnly: false }),
      getAllExercises(),
    ]);
    const exerciseMap = Object.fromEntries(exercises.map(e => [e.id, e]));
    const insights = generateInsights({
      workouts, sets: recentSets, exerciseMap, now: Date.now(),
    });
    await persistInsights(userId, insights);
    return getActiveInsights(userId, 3);
  } catch (e) {
    logWarn('database.runInsightsEngine', e?.message);
    return [];
  }
}

// ─── User Body Profile ────────────────────────────────────────────

export async function saveUserBodyProfile(userId, profile) {
  const d = await db();
  const now = Date.now();
  const existing = await d.getFirstAsync(
    'SELECT id FROM user_body_profile WHERE user_id = ? LIMIT 1',
    [userId],
  );
  if (existing) {
    await d.runAsync(
      `UPDATE user_body_profile SET
        sex=?, date_of_birth=?, height_cm=?, experience_level=?,
        training_age_years=?, primary_goal=?, gdpr_consented=?,
        scoff_score=?, updated_at=?
       WHERE user_id=?`,
      [
        profile.sex ?? null, profile.dateOfBirth ?? null, profile.heightCm ?? null,
        profile.experienceLevel ?? null, profile.trainingAgeYears ?? null,
        profile.primaryGoal ?? null, profile.gdprConsented ? 1 : 0,
        profile.scoffScore ?? null, now, userId,
      ],
    );
    _scheduleSync();
    return existing.id;
  }
  const id = uid();
  await d.runAsync(
    `INSERT INTO user_body_profile
      (id, user_id, sex, date_of_birth, height_cm, experience_level,
       training_age_years, primary_goal, gdpr_consented, scoff_score,
       created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, userId, profile.sex ?? null, profile.dateOfBirth ?? null, profile.heightCm ?? null,
      profile.experienceLevel ?? null, profile.trainingAgeYears ?? null,
      profile.primaryGoal ?? null, profile.gdprConsented ? 1 : 0,
      profile.scoffScore ?? null, now, now,
    ],
  );
  _scheduleSync();
  return id;
}

export async function getUserBodyProfile(userId) {
  const d = await db();
  const row = await d.getFirstAsync(
    'SELECT * FROM user_body_profile WHERE user_id = ? LIMIT 1',
    [userId],
  );
  return rowToCamel(row);
}

export async function clearWorkoutHistory(userId) {
  const d = await db();
  // Atomic, was two separate runAsync calls; an interruption between
  // them would orphan workout rows whose sets had already been deleted.
  await runInTransaction(d, async () => {
    await d.runAsync('DELETE FROM workout_sets WHERE user_id = ?', [userId]);
    await d.runAsync('DELETE FROM workouts WHERE user_id = ?', [userId]);
    // Round 13 (R13-3): the THIRD workout-delete path - the settings
    // screen's own words are "permanently deletes all your logged
    // sessions", and the per-session capability effects records are
    // part of exactly that. Rounds 11-12 tombstoned the discard and
    // history-delete paths; this one left the records live, synced,
    // and in the Article 20 export after every session was gone.
    // Same tombstone discipline (the table syncs; deleted_at is its
    // delete, and the replace preserves it).
    const now = Date.now();
    await d.runAsync(
      'UPDATE session_constraint_effects SET deleted_at = ?, updated_at = ? WHERE user_id = ? AND deleted_at IS NULL',
      [now, now, userId],
    );
  });
  // Round 16 (H2/I2), completed round 17 (Q2): the tombstones' push is
  // SCHEDULED - and since round 17 all THREE delete paths schedule it
  // (this clear, deleteWorkoutAndSets, deleteIncompleteWorkout), so no
  // effects tombstone waits for an unrelated write before travelling.
  _scheduleSync();
}

// ─── Full local wipe (sign out + sign in as different user, or delete account) ─
//
// Removes every row owned by `userId` across every table that has a user_id
// column. Used when:
//   - A user deletes their account (combined with the cloud delete_user_data RPC)
//   - A different user signs in on the same device (to prevent cross-user data
//     visibility on a shared phone)
//
// Custom exercises owned by the user are also removed. Canonical seed
// exercises (user_id IS NULL) are preserved because they're shared data.
// Wrapped in a single transaction so a kill mid-wipe doesn't leave a
// half-wiped DB the user can't recover from.
//
// The direct-user_id table set lives here (exported) so the regression test
// can assert it. The food tables were added 2026-05-29 (audit Phase 2,
// finding A4): they were previously omitted, so on a shared device the next
// user could read the prior user's cached food log, recipes, and water until
// a pull overwrote them.
export const WIPE_DIRECT_TABLES = [
  'workout_sets', 'workouts',
  'routines', 'programmes', 'mesocycles',
  'morning_weights', 'weekly_checkins', 'coach_outputs',
  'nutrition_targets', 'effective_maintenance_memos', 'peak_week_plans',
  'body_metric_log', 'user_insights', 'user_body_profile',
  'exercise_user_notes', 'exercise_goals', 'workout_notes',
  'custom_exercises',
  // queue table from v16: wipe so a deleted user has no orphan ops shipping.
  'pending_sync_ops',
  // Sync-mirror tables (migration v19): wipe so the next account on this
  // device does not inherit orphan rows tagged with the deleted user's id.
  'workout_notes_v2', 'planned_muscle_volume_sync', 'adaptation_events_sync',
  // SQLite mirror of cloud migration 044 (Codex re-audit 2026-05-26 #3):
  // without this a sign-out left notification prefs visible to the next user.
  'notification_preferences',
  // Food domain (audit Phase 2, finding A4). All carry user_id locally.
  'food_entries', 'custom_foods', 'saved_meals',
  'recipes', 'recipe_ingredients',
  'daily_water', 'food_favourites', 'daily_intake_rollups',
  'food_frequents',
  // Campaign 17A job 3: what the user has said about FOODS (standing
  // replacements and one-off swaps). Same ownership rule as every other
  // user-scoped table - it must never survive sign-out onto the next account.
  'food_swaps',
  // Generated meal plan (deep-audit Theme G): carries user_id + a calorie-
  // target snapshot (health data) — must never survive sign-out/delete.
  'meal_plans',
  // Activity store (cardio/steps audit). Carries user_id locally; wipe so
  // the next account on a shared device never inherits a step history.
  'daily_steps',
  // Locked decision 2 (IDENTITY_AND_OWNERSHIP_LOCKED.md): sign-out wipes
  // EVERY user-scoped table. These four each carry a user_id column and were
  // missing from the set, so they survived sign-out, the cross-user safety
  // net, and account-delete. ed_pattern_flags is eating-disorder pattern
  // state and engine_telemetry leftover rows could ship under the next
  // account, so the omission was a real ownership leak, not cosmetic.
  'cardio_log', 'ed_pattern_flags', 'tier_history', 'engine_telemetry',
  // audit 2026-07-01: both carry a user_id column locally and were missing, so
  // they survived sign-out / account-delete / the cross-user switch — the next
  // account on a shared device inherited the prior user's plan folders and
  // per-slot food-logging memory. plan_folders (migration 089) and
  // food_slot_recents (client-only) both DELETE cleanly by user_id.
  'plan_folders', 'food_slot_recents',
  'progress_photo_meta', 'progress_scan_sessions', 'progress_scan_assets',
  // D18 (plan-F §4.3): local-only progress-scan classification log. Wiped on
  // every user boundary so a deleted account or wiped photo set also clears
  // its derived classification history.
  'progress_scan_classification_history',
  // Campaign 9 closeout: the exercise-intelligence tables. All three carry
  // a user_id column and DELETE cleanly by it. Without them a deleted
  // account left its exclusions, swap history and approved defaults on the
  // device, and the next account on a shared phone would inherit somebody
  // else's preferences - the same ownership leak the entries above were
  // added to close.
  'exercise_intent', 'exercise_swaps', 'exercise_slot_defaults',
  // CC26: the capability lane wipes on every user boundary for the same
  // ownership reason, and because it is Article 9 data (CAP-20).
  'capability_constraints', 'session_constraint_effects',
];

export const FATAL_LOCAL_WIPE_TABLES = new Set([
  'progress_photo_meta',
  'progress_scan_sessions',
  'progress_scan_assets',
  // Retained for wipe completeness; feature retired 2026-09-06.
  'partner_cheers',
  'partner_week_signals',
  'partner_shared_blocks',
  'partner_weekly_intentions',
  'partner_win_cards',
  'partnerships',
]);

// Retained for wipe completeness; feature retired 2026-09-06. The Partners
// feature is gone (SD-03) but its six local tables stay in the schema, so
// every wipe path must keep clearing them for anyone whose device still
// holds rows.
const PARTNER_LOCAL_WIPE_TABLES = [
  'partner_cheers',
  'partner_week_signals',
  'partner_shared_blocks',
  'partner_weekly_intentions',
  'partner_win_cards',
  'partnerships',
];

/**
 * Prove that a missing AsyncStorage owner marker really represents a first
 * account, rather than marker loss over another account's SQLite residue.
 * Unknown/query failure is unsafe. This is deliberately stricter than the
 * diagnostic conflict report: it is an admission decision.
 */
export async function verifyNoForeignLocalData(incomingUserId) {
  if (!incomingUserId) return { ok: false, step: 'missing_incoming_user' };
  const d = await db();

  for (const table of WIPE_DIRECT_TABLES) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const row = await d.getFirstAsync(
        `SELECT 1 AS found FROM ${table}
         WHERE user_id IS NULL OR user_id <> ? LIMIT 1`,
        [incomingUserId],
      );
      if (row) return { ok: false, step: table };
    } catch (e) {
      if (!isMissingTableError(e)) return { ok: false, step: table };
    }
  }

  const childChecks = [
    ['routine_exercises', `SELECT 1 AS found FROM routine_exercises re
      LEFT JOIN routines r ON r.id = re.routine_id
      WHERE r.user_id IS NULL OR r.user_id <> ? LIMIT 1`],
    ['mesocycle_weeks', `SELECT 1 AS found FROM mesocycle_weeks mw
      LEFT JOIN mesocycles m ON m.id = mw.mesocycle_id
      WHERE m.user_id IS NULL OR m.user_id <> ? LIMIT 1`],
    ['planned_muscle_volume', `SELECT 1 AS found FROM planned_muscle_volume pmv
      LEFT JOIN mesocycle_weeks mw ON mw.id = pmv.mesocycle_week_id
      LEFT JOIN mesocycles m ON m.id = mw.mesocycle_id
      WHERE m.user_id IS NULL OR m.user_id <> ? LIMIT 1`],
    ['adaptation_events', `SELECT 1 AS found FROM adaptation_events ae
      LEFT JOIN mesocycle_weeks mw ON mw.id = ae.mesocycle_week_id
      LEFT JOIN mesocycles m ON m.id = mw.mesocycle_id
      WHERE m.user_id IS NULL OR m.user_id <> ? LIMIT 1`],
  ];
  for (const [table, sql] of childChecks) {
    try {
      // eslint-disable-next-line no-await-in-loop
      if (await d.getFirstAsync(sql, [incomingUserId])) return { ok: false, step: table };
    } catch (e) {
      if (!isMissingTableError(e)) return { ok: false, step: table };
    }
  }

  // Pair mirrors are not user-keyed. Without the owner marker, any row is
  // unassignable and therefore cannot be admitted to an incoming account.
  for (const table of PARTNER_LOCAL_WIPE_TABLES) {
    try {
      // eslint-disable-next-line no-await-in-loop
      if (await d.getFirstAsync(`SELECT 1 AS found FROM ${table} LIMIT 1`)) {
        return { ok: false, step: table };
      }
    } catch (e) {
      if (!isMissingTableError(e)) return { ok: false, step: table };
    }
  }

  try {
    if (await d.getFirstAsync('SELECT 1 AS found FROM exercises WHERE is_custom = 1 LIMIT 1')) {
      return { ok: false, step: 'custom_exercises' };
    }
  } catch (e) {
    if (!isMissingTableError(e)) return { ok: false, step: 'custom_exercises' };
  }

  // Files do not carry a SQLite row reliably (a crash can orphan one), so a
  // missing owner marker must also prove that every private file namespace is
  // either empty or belongs to the incoming account.
  try {
    // eslint-disable-next-line global-require
    const FileSystem = require('expo-file-system/legacy');
    // eslint-disable-next-line global-require
    const { photoDir } = require('./progressPhotos');
    const incomingDir = photoDir(incomingUserId);
    const usersRoot = `${FileSystem.documentDirectory}progress_photos/users/`;
    const usersInfo = await FileSystem.getInfoAsync(usersRoot);
    if (usersInfo?.exists) {
      const entries = await FileSystem.readDirectoryAsync(usersRoot);
      const incomingName = incomingDir.slice(usersRoot.length).replace(/\/$/, '');
      if (entries.some((name) => name !== incomingName)) {
        return { ok: false, step: 'foreign_photo_files' };
      }
    }

    const legacyRoot = `${FileSystem.documentDirectory}progress_photos/`;
    const legacyInfo = await FileSystem.getInfoAsync(legacyRoot);
    if (legacyInfo?.exists) {
      const entries = await FileSystem.readDirectoryAsync(legacyRoot);
      if (entries.some((name) => /^\d+\.jpg$/.test(name))) {
        return { ok: false, step: 'legacy_photo_files' };
      }
    }

    // eslint-disable-next-line global-require
    const { SNAP_DIR, parseSnapshotName } = require('./dbSnapshot');
    const snapshotInfo = await FileSystem.getInfoAsync(SNAP_DIR);
    if (snapshotInfo?.exists) {
      // Incident 2026-09-04: a FRESH install takes a pre-migration snapshot of
      // its own, empty database (_doInit, snapshotBeforeMigration) before the
      // user has ever signed in, so "any file in SNAP_DIR" refused every
      // first sign-in on every new device (Sentry VOLYUME-2G, step
      // 'snapshots'). A migration snapshot is a copy of the same database
      // the table checks above have just proved clean; it cannot carry a
      // foreign account that the live database does not. What CAN is a
      // pre-account-switch or pre-restore copy, and any name this app did
      // not write (unknown is unsafe). Those still refuse.
      const names = await FileSystem.readDirectoryAsync(SNAP_DIR);
      const foreign = names.some((name) => parseSnapshotName(name)?.kind !== 'migration');
      if (foreign) return { ok: false, step: 'snapshots' };
    }

    // eslint-disable-next-line global-require
    const { profileAvatarDir, isProfileAvatarUriForUser } = require('./profileAvatar');
    const avatarDir = profileAvatarDir();
    const avatarInfo = await FileSystem.getInfoAsync(avatarDir);
    if (avatarInfo?.exists) {
      const names = await FileSystem.readDirectoryAsync(avatarDir);
      if (names.some((name) => !isProfileAvatarUriForUser(incomingUserId, `${avatarDir}${name}`))) {
        return { ok: false, step: 'foreign_profile_avatars' };
      }
    }
  } catch (_) {
    return { ok: false, step: 'private_files_unreadable' };
  }

  return { ok: true };
}

// "no such table" from an older schema means the table holds no data, so a
// fatal wipe step has nothing to remove there. Fail-closed protects data that
// exists, not tables that don't - without this a single missing fatal table
// dead-ends sign-out permanently (sign-out escape ruling, 2026-07-11).
function isMissingTableError(e) {
  return /no such table/i.test(e?.message ?? '');
}

export async function wipeAllUserData(userId) {
  if (!userId) return;
  const d = await db();

  // Direct-user_id tables (the exported set above), each wiped by
  // DELETE ... WHERE user_id = ?. A missing table on an older schema is
  // tolerated by the per-table try/catch in the loop below.
  const directTables = WIPE_DIRECT_TABLES;

  // Tables that DON'T have user_id and must be wiped through a parent FK.
  // routine_exercises   → keys off routine_id     → routines.user_id
  // mesocycle_weeks     → keys off mesocycle_id   → mesocycles.user_id
  // planned_muscle_volume → keys off mesocycle_week_id → mesocycle_weeks → mesocycles.user_id
  // adaptation_events   → keys off mesocycle_week_id → same chain
  //
  // Order matters: deepest child first so each step's FK target still
  // exists when we delete it.
  await runInTransaction(d, async () => {
    // 1. adaptation_events (deepest child)
    try {
      await d.runAsync(
        `DELETE FROM adaptation_events WHERE mesocycle_week_id IN (
          SELECT mw.id FROM mesocycle_weeks mw
          JOIN mesocycles m ON m.id = mw.mesocycle_id
          WHERE m.user_id = ?
        )`,
        [userId],
      );
    } catch (e) {
      logError('database.wipeAllUserData.adaptation_events', e, { userId });
    }

    // 2. planned_muscle_volume (via mesocycle_week → mesocycle.user_id)
    try {
      await d.runAsync(
        `DELETE FROM planned_muscle_volume WHERE mesocycle_week_id IN (
          SELECT mw.id FROM mesocycle_weeks mw
          JOIN mesocycles m ON m.id = mw.mesocycle_id
          WHERE m.user_id = ?
        )`,
        [userId],
      );
    } catch (e) {
      logError('database.wipeAllUserData.planned_muscle_volume', e, { userId });
    }

    // 3. mesocycle_weeks (via mesocycle.user_id)
    try {
      await d.runAsync(
        `DELETE FROM mesocycle_weeks WHERE mesocycle_id IN (
          SELECT id FROM mesocycles WHERE user_id = ?
        )`,
        [userId],
      );
    } catch (e) {
      logError('database.wipeAllUserData.mesocycle_weeks', e, { userId });
    }

    // 4. routine_exercises (via routine.user_id)
    try {
      await d.runAsync(
        `DELETE FROM routine_exercises WHERE routine_id IN (
          SELECT id FROM routines WHERE user_id = ?
        )`,
        [userId],
      );
    } catch (e) {
      logError('database.wipeAllUserData.routine_exercises', e, { userId });
    }

    // 5. Everything else (direct user_id column)
    for (const table of directTables) {
      try {
        await d.runAsync(`DELETE FROM ${table} WHERE user_id = ?`, [userId]);
      } catch (e) {
        // Continue with other tables. A missing table on an older schema
        // shouldn't abort the whole wipe.
        if (isMissingTableError(e)) continue;
        logError(`database.wipeAllUserData.${table}`, e, { userId });
        // R2-12: name the failing step on the error so the sign-out alert
        // (and the Sentry event) says WHAT failed instead of a generic
        // photo-and-scan line for every failure class.
        if (FATAL_LOCAL_WIPE_TABLES.has(table)) { e.wipeStep = table; throw e; }
      }
    }

    try {
      await d.runAsync('DELETE FROM progress_photo_meta WHERE user_id IS NULL');
    } catch (e) {
      if (!isMissingTableError(e)) {
        logError('database.wipeAllUserData.progress_photo_meta_legacy', e, { userId });
        e.wipeStep = 'photo_meta_legacy';
        throw e;
      }
    }

    try {
      // Lazy require keeps expo-file-system out of database.js's module graph.
      // Per-user scope (founder decision 2026-07-09): wipe ONLY this account's
      // photo subfolder, never the whole progress_photos/ tree, so a second
      // account on a shared device keeps its photos after this account is
      // wiped (evidence-gaps §7 Q5; safety-privacy-blueprint.md §6.4).
      // eslint-disable-next-line global-require
      await require('./progressPhotos').wipeProgressPhotoDirectoryForUser(userId);
    } catch (e) {
      logError('database.wipeAllUserData.progress_photo_files', e, { userId });
      e.wipeStep = 'photo_files';
      throw e;
    }

    try {
      // eslint-disable-next-line global-require
      await require('./profileAvatar').wipeProfileAvatarsForUser(userId);
    } catch (e) {
      logError('database.wipeAllUserData.profile_avatar_files', e, { userId });
      e.wipeStep = 'profile_avatar_files';
      throw e;
    }

    try {
      // SQLite snapshots are byte-for-byte DB copies. Purge them on user
      // boundary changes so local-only scan/photo rows cannot survive in a
      // retained pre-wipe snapshot.
      // eslint-disable-next-line global-require
      await require('./dbSnapshot').purgeSnapshots();
    } catch (e) {
      logError('database.wipeAllUserData.snapshots', e, { userId });
      e.wipeStep = 'snapshots';
      throw e;
    }

    // 6. Custom exercises. Canonical seed exercises are shared library data
    // and aren't keyed per user, so leave them. is_custom = 1 means
    // user-added, wipe those.
    try {
      await d.runAsync('DELETE FROM exercises WHERE is_custom = 1');
    } catch (e) {
      logError('database.wipeAllUserData.exercises', e, { userId });
    }
    _invalidateExercisesCache();

    // 7. NEW-002 partner mirror. Local SQLite is single-user, so a flat wipe of
    //    all partner rows is correct on sign-out (partnerships/cheers aren't
    //    user_id-keyed). The cloud copy is intact; it re-pulls on next sign-in.
    //    Every partner table is fatal: shared data must not survive a user
    //    boundary because one delete failed partway through this transaction.
    for (const table of PARTNER_LOCAL_WIPE_TABLES) {
      try {
        await d.runAsync(`DELETE FROM ${table}`);
      } catch (e) {
        if (isMissingTableError(e)) continue;
        logError(`database.wipeAllUserData.${table}`, e, { userId });
        if (FATAL_LOCAL_WIPE_TABLES.has(table)) { e.wipeStep = table; throw e; }
      }
    }

    // 8. Rebuild the custom-foods search index from the (now wiped) base
    // table (E3 review). SQLite reuses freed rowids, so any tokens left in
    // custom_foods_fts after the DELETEs above could otherwise attach to the
    // NEXT account's rows and surface the previous user's custom food names
    // in their search results. Best-effort: absent on a pre-FTS install.
    try {
      await d.execAsync(`INSERT INTO custom_foods_fts(custom_foods_fts) VALUES('rebuild')`);
    } catch (_) { /* no FTS index on this install */ }
  });
}

// ─── Sign-out wipe escape (ruling 2026-07-11, D33) ──────────────────────────
//
// The wipe_failed path used to be a dead end: any throw from a fatal wipe
// step blocked sign-out forever (force:true re-runs the same wipe), and the
// only way off the founder's own device was clearing app storage. The privacy
// rule is UNCHANGED - sign-out completes only when zero user data remains on
// this device - but "an exception was thrown" is not the same fact as "data
// remains". verifyUserWipeClean inspects the actual fatal surfaces (row
// counts, this account's photo directory, DB snapshots) so the caller can
// retry the wipe and, if every retry still throws, allow sign-out only when
// the device is verifiably clean. Any verification error that is not a
// missing table counts as residue: fail closed.

export async function verifyUserWipeClean(userId) {
  if (!userId) return { clean: false, residue: ['no_user'] };
  const d = await db();
  const residue = [];

  const userKeyedFatalTables = [...FATAL_LOCAL_WIPE_TABLES]
    .filter((t) => !PARTNER_LOCAL_WIPE_TABLES.includes(t));
  for (const table of userKeyedFatalTables) {
    try {
      const row = await d.getFirstAsync(
        `SELECT COUNT(*) AS n FROM ${table} WHERE user_id = ?`, [userId],
      );
      if (Number(row?.n ?? 0) > 0) residue.push(table);
    } catch (e) {
      if (!isMissingTableError(e)) residue.push(table);
    }
  }

  // Legacy pre-ownership photo rows carry no user_id but are fatal too.
  try {
    const row = await d.getFirstAsync(
      'SELECT COUNT(*) AS n FROM progress_photo_meta WHERE user_id IS NULL',
    );
    if (Number(row?.n ?? 0) > 0) residue.push('photo_meta_legacy');
  } catch (e) {
    if (!isMissingTableError(e)) residue.push('photo_meta_legacy');
  }

  // Partner tables are wiped flat (local SQLite is single-user).
  for (const table of PARTNER_LOCAL_WIPE_TABLES) {
    try {
      const row = await d.getFirstAsync(`SELECT COUNT(*) AS n FROM ${table}`);
      if (Number(row?.n ?? 0) > 0) residue.push(table);
    } catch (e) {
      if (!isMissingTableError(e)) residue.push(table);
    }
  }

  // This account's photo files on disk. Read the directory raw (never via
  // listProgressPhotos, whose ensurePhotoDir would recreate the directory).
  try {
    // eslint-disable-next-line global-require
    const { photoDir } = require('./progressPhotos');
    // eslint-disable-next-line global-require
    const FileSystem = require('expo-file-system/legacy');
    const dir = photoDir(userId);
    const info = await FileSystem.getInfoAsync(dir);
    if (info?.exists) {
      const names = await FileSystem.readDirectoryAsync(dir).catch(() => null);
      if (names === null || names.length > 0) residue.push('photo_files');
    }
  } catch (_) {
    residue.push('photo_files');
  }

  // DB snapshots are byte-for-byte pre-wipe copies; any survivor is residue.
  try {
    // eslint-disable-next-line global-require
    const { SNAP_DIR } = require('./dbSnapshot');
    // eslint-disable-next-line global-require
    const FileSystem = require('expo-file-system/legacy');
    const info = await FileSystem.getInfoAsync(SNAP_DIR);
    if (info?.exists) {
      const names = await FileSystem.readDirectoryAsync(SNAP_DIR).catch(() => null);
      if (names === null || names.length > 0) residue.push('snapshots');
    }
  } catch (_) {
    residue.push('snapshots');
  }


  try {
    // eslint-disable-next-line global-require
    const { profileAvatarDir, isProfileAvatarUriForUser } = require('./profileAvatar');
    // eslint-disable-next-line global-require
    const FileSystem = require('expo-file-system/legacy');
    const dir = profileAvatarDir();
    const info = await FileSystem.getInfoAsync(dir);
    if (info?.exists) {
      const names = await FileSystem.readDirectoryAsync(dir).catch(() => null);
      if (names === null
        || names.some((name) => isProfileAvatarUriForUser(userId, `${dir}${name}`))) {
        residue.push('profile_avatar_files');
      }
    }
  } catch (_) {
    residue.push('profile_avatar_files');
  }

  return { clean: residue.length === 0, residue };
}

// Bounded-retry wipe for the account-boundary flows (sign-out, delete
// account). Returns { ok: true } on success, { ok: true, verifiedClean: true }
// when every attempt threw but the device is verifiably clean (the wipe's
// goal is met), or { ok: false, step } to fail closed with the step named for
// the alert (R2-12).
export async function wipeAllUserDataWithRetry(userId, { attempts = 3, delaysMs = [500, 1500] } = {}) {
  if (!userId) return { ok: true };
  let lastErr = null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      await wipeAllUserData(userId);
      return { ok: true };
    } catch (e) {
      lastErr = e;
      logError('database.wipeAllUserDataWithRetry', e, { userId, attempt: i + 1, attempts });
      if (i < attempts - 1) {
        const wait = delaysMs[Math.min(i, delaysMs.length - 1)] ?? 0;
        if (wait > 0) await new Promise((resolve) => { setTimeout(resolve, wait); });
      }
    }
  }
  try {
    const check = await verifyUserWipeClean(userId);
    if (check.clean) {
      logWarn(
        'database.wipeAllUserDataWithRetry.verifiedClean',
        `wipe threw ${attempts} times but the device is verifiably clean; sign-out may proceed`,
        { userId },
      );
      return { ok: true, verifiedClean: true };
    }
    return { ok: false, step: lastErr?.wipeStep ?? check.residue[0] ?? null };
  } catch (e) {
    logError('database.wipeAllUserDataWithRetry.verify', e, { userId });
    return { ok: false, step: lastErr?.wipeStep ?? null };
  }
}

// ─── Full local backup / restore ────────────────────────────────────────────
//
// Every durable user-owned table needed for a self-contained local restore.
// Shared seed/reference tables, cloud-authoritative security/control state and
// transient projections are classified explicitly below rather than silently
// omitted.  Ordering is parent-before-child for insertion; deletion reverses
// it so referential structure survives both halves of the transaction.
export const BACKUP_TABLES = [
  'workouts',
  'workout_sets',
  'routines',
  'routine_exercises',
  'programmes',
  'mesocycles',
  // Mesocycle child tables, restoring without these leaves orphan week-rows
  // pointing at deleted mesocycle ids and planned-volume drift.
  'mesocycle_weeks',
  'planned_muscle_volume',
  'adaptation_events',
  'nutrition_targets',
  'peak_week_plans',
  'body_metric_log',
  'user_insights',
  'user_body_profile',
  // Coaching tables, added so Pro users don't lose their check-in / coach
  // output / morning-weight history on restore.
  'morning_weights',
  'weekly_checkins',
  'coach_outputs',
  'exercise_user_notes',
  'workout_notes',
  'workout_notes_v2',
  'exercise_goals',
  'custom_exercises',
  // E10-F1(a): the food domain. These are the user's own Article 9 health
  // records; leaving them out of the free backup meant a lapsed trial user
  // had NO self-service portability path for 14 days of logged food (GDPR
  // Article 20 exposure). The shared `foods` library cache is deliberately
  // NOT here: it is 25k+ reseedable reference rows, not user data.
  'food_entries',
  'custom_foods',
  'saved_meals',
  'recipes',
  'recipe_ingredients',
  'daily_water',
  'food_favourites',
  'meal_plans',
  // Rollups are derived but only recomputed on new writes for a day, so
  // restore them too or historic diary days would render empty totals.
  'daily_intake_rollups',
  'daily_steps',
  // Retired cardio has no writer, but existing local rows remain the user's
  // history and must survive an offline/local-only restore.
  'cardio_log',
  'food_swaps',
  'plan_folders',
  // Device-local physique-photo records. The backup carries the SQLite
  // metadata and scan rows so a restore does not drop the user's own history;
  // image files themselves remain private app documents, not JSON rows.
  'progress_photo_meta',
  'progress_scan_sessions',
  'progress_scan_assets',
  'progress_scan_classification_history',
  'exercise_intent',
  'exercise_swaps',
  'exercise_slot_defaults',
  'session_resolutions',
  // CC26 capability lane (CAP-20: exportable): the user's own Article 9
  // capability records travel in the full local export like the food domain
  // above, and restore with it. Restored rows re-imply consent by the
  // store's derivation rule, which is the intended reading of restoring
  // your own data; withdrawal afterwards still tombstones everywhere.
  'capability_constraints',
  'session_constraint_effects',
  'effective_maintenance_memos',
];

export const BACKUP_TABLE_DISPOSITION = Object.freeze({
  included: BACKUP_TABLES,
  sharedReseedable: Object.freeze({
    exercises: 'canonical exercise library is bundled/reseeded; per-user definitions are in custom_exercises',
    foods: 'shared CoFID/OFF reference cache is bundled or pulled again',
  }),
  cloudReconstructed: Object.freeze({
    ed_pattern_flags: 'server-authoritative safety flags are pull-only and must not be client-restored',
    tier_history: 'server-authoritative entitlement history is pull-only',
    notification_preferences: 'SQLite sync projection is rebuilt from restored namespaced preferences or cloud',
    partnerships: 'pair-scoped server authority, not an owner-scoped backup row',
    partner_week_signals: 'pair-scoped derived/server data',
    partner_cheers: 'server-validated pair-scoped data',
    partner_shared_blocks: 'pair-scoped server data',
    partner_weekly_intentions: 'pair-scoped server data',
    partner_win_cards: 'pair-scoped server data',
  }),
  transient: Object.freeze({
    pending_sync_ops: 'retry queue reconstructed from durable rows',
    planned_muscle_volume_sync: 'cloud transport mirror; canonical planned_muscle_volume is included',
    adaptation_events_sync: 'cloud transport mirror; canonical adaptation_events is included',
    sync_meta: 'transport watermark',
    engine_telemetry: 'diagnostic delivery buffer',
    food_frequents: 'derived top-food cache',
    food_slot_recents: 'derived recency cache',
  }),
  preferenceBacked: Object.freeze({
    perday_target_offsets: 'retired values and their clock are restored from namespaced AsyncStorage',
  }),
});

const INDIRECT_BACKUP_TABLES = new Set(['planned_muscle_volume', 'adaptation_events']);

const BACKUP_EXPORT_QUERIES = Object.freeze({
  planned_muscle_volume: `SELECT pmv.*, m.user_id AS user_id
    FROM planned_muscle_volume pmv
    JOIN mesocycle_weeks mw ON mw.id = pmv.mesocycle_week_id
    JOIN mesocycles m ON m.id = mw.mesocycle_id
    WHERE m.user_id = ?`,
  adaptation_events: `SELECT ae.*, m.user_id AS user_id
    FROM adaptation_events ae
    JOIN mesocycle_weeks mw ON mw.id = ae.mesocycle_week_id
    JOIN mesocycles m ON m.id = mw.mesocycle_id
    WHERE m.user_id = ?`,
});

function backupFailure(table, error) {
  const wrapped = new Error(`Backup export failed for ${table}: ${error?.message ?? 'read failed'}`);
  wrapped.cause = error;
  wrapped.backupTable = table;
  return wrapped;
}

// Returns { schemaVersion, tables: { tableName: [rawRows...] } }.
// Raw rows (snake_case) are dumped as-is so a restore is a faithful round-trip.
export async function dumpAllTablesFromDb(d, userId) {
  if (!userId) throw new Error('A signed-in user is required to export a backup.');
  let schemaVersion;
  try {
    const v = await d.getFirstAsync('PRAGMA user_version');
    if (!Number.isInteger(v?.user_version) || v.user_version < 0) {
      throw new Error('invalid PRAGMA user_version result');
    }
    schemaVersion = v.user_version;
  } catch (error) {
    throw backupFailure('PRAGMA user_version', error);
  }
  const tables = {};
  for (const t of BACKUP_TABLES) {
    try {
      const info = await d.getAllAsync(`PRAGMA table_info(${t})`);
      if (!Array.isArray(info) || info.length === 0) throw new Error('required table is missing');
      const hasOwner = (info || []).some((column) => column.name === 'user_id');
      if (!hasOwner && !INDIRECT_BACKUP_TABLES.has(t)) {
        throw new Error('required ownership column is missing');
      }
      const rows = BACKUP_EXPORT_QUERIES[t]
        ? await d.getAllAsync(BACKUP_EXPORT_QUERIES[t], [userId])
        : await d.getAllAsync(`SELECT * FROM ${t} WHERE user_id = ?`, [userId]);
      if (!Array.isArray(rows) || rows.some((row) => row?.user_id !== userId)) {
        throw new Error('owner-scoped read returned an invalid row set');
      }
      tables[t] = rows;
    } catch (error) {
      throw backupFailure(t, error);
    }
  }
  return { schemaVersion, tables };
}

export async function dumpAllTables(userId) {
  const d = await db();
  return dumpAllTablesFromDb(d, userId);
}

function requireReference(tables, childTable, column, parentTable, { optional = false } = {}) {
  const parentIds = new Set((tables[parentTable] || []).map((row) => row.id));
  for (const row of tables[childTable] || []) {
    const value = row[column];
    if (optional && value == null) continue;
    if (typeof value !== 'string' || !value || !parentIds.has(value)) {
      throw new Error(`Backup reference ${childTable}.${column} does not resolve to ${parentTable}.`);
    }
  }
}

function validateBackupReferences(tables) {
  requireReference(tables, 'workout_sets', 'workout_id', 'workouts');
  requireReference(tables, 'routine_exercises', 'routine_id', 'routines');
  requireReference(tables, 'mesocycle_weeks', 'mesocycle_id', 'mesocycles');
  requireReference(tables, 'planned_muscle_volume', 'mesocycle_week_id', 'mesocycle_weeks');
  requireReference(tables, 'adaptation_events', 'mesocycle_week_id', 'mesocycle_weeks');
  requireReference(tables, 'recipe_ingredients', 'recipe_id', 'recipes');
  requireReference(tables, 'progress_scan_assets', 'scan_id', 'progress_scan_sessions');
  requireReference(tables, 'workout_notes_v2', 'workout_id', 'workouts');
  requireReference(tables, 'session_constraint_effects', 'workout_id', 'workouts');
  requireReference(tables, 'session_resolutions', 'mesocycle_week_id', 'mesocycle_weeks');
  requireReference(tables, 'session_resolutions', 'routine_id', 'routines');
  requireReference(tables, 'session_resolutions', 'workout_id', 'workouts', { optional: true });
}

// Wipes BACKUP_TABLES and reinserts the supplied rows inside one
// transaction. All-or-nothing: a failure rolls back and leaves the
// existing data untouched.
export async function restoreAllTablesIntoDb(d, dump, userId) {
  if (!userId) throw new Error('A signed-in user is required to restore a backup.');
  const tables = dump?.tables || {};

  // Validate the complete caller-supplied snapshot before opening the
  // destructive transaction. The public primitive must be safe even when a
  // future caller bypasses dataBackup's friendlier outer validation.
  const allowedTables = new Set(BACKUP_TABLES);
  const suppliedTables = Object.keys(tables);
  const missingTables = BACKUP_TABLES.filter((table) => !suppliedTables.includes(table));
  if (missingTables.length > 0) {
    throw new Error(`Backup is incomplete; missing ${missingTables.join(', ')}.`);
  }
  for (const [table, rows] of Object.entries(tables)) {
    if (!allowedTables.has(table) || !Array.isArray(rows)) {
      throw new Error(`Backup table ${table} is not supported.`);
    }
    const ids = new Set();
    for (const row of rows) {
      if (!row || typeof row !== 'object' || Array.isArray(row) || row.user_id !== userId) {
        throw new Error(`Backup table ${table} contains rows for another account.`);
      }
      for (const value of Object.values(row)) {
        if (value !== null && (!['string', 'number'].includes(typeof value)
          || (typeof value === 'number'
            && (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER)))) {
          throw new Error(`Backup table ${table} contains a nested record value.`);
        }
      }
      if (Object.prototype.hasOwnProperty.call(row, 'id')) {
        if (typeof row.id !== 'string' || !row.id || ids.has(row.id)) {
          throw new Error(`Backup table ${table} contains duplicate or invalid record identifiers.`);
        }
        ids.add(row.id);
      }
    }
  }
  validateBackupReferences(tables);

  const schemas = {};
  for (const table of BACKUP_TABLES) {
    const info = await d.getAllAsync(`PRAGMA table_info(${table})`);
    if (!Array.isArray(info) || info.length === 0) throw new Error(`Required restore table ${table} is missing.`);
    const allowed = new Set(info.map((column) => column.name));
    if (!allowed.has('user_id') && !INDIRECT_BACKUP_TABLES.has(table)) {
      throw new Error(`Required restore ownership column is missing from ${table}.`);
    }
    schemas[table] = allowed;
  }

  await runInTransaction(d, async () => {
    // Delete deepest children first while their owner-bearing parents still
    // exist. The two canonical mesocycle child tables have no user_id column.
    for (const table of ['adaptation_events', 'planned_muscle_volume']) {
      await d.runAsync(
        `DELETE FROM ${table} WHERE mesocycle_week_id IN (
          SELECT mw.id FROM mesocycle_weeks mw
          JOIN mesocycles m ON m.id = mw.mesocycle_id
          WHERE m.user_id = ?
        )`,
        [userId],
      );
    }
    for (const table of [...BACKUP_TABLES].reverse()) {
      if (INDIRECT_BACKUP_TABLES.has(table)) continue;
      await d.runAsync(`DELETE FROM ${table} WHERE user_id = ?`, [userId]);
    }

    for (const t of BACKUP_TABLES) {
      const rows = tables[t];
      const allowed = schemas[t];
      for (const row of rows) {
        const cols = Object.keys(row).filter((column) => allowed.has(column));
        if (cols.length === 0) throw new Error(`Backup table ${t} has no restorable columns.`);
        const placeholders = cols.map(() => '?').join(', ');
        const values = cols.map(c => row[c]);
        await d.runAsync(
          `INSERT OR REPLACE INTO ${t} (${cols.join(', ')}) VALUES (${placeholders})`,
          values,
        );
      }
    }

    const foreignKeyFailures = await d.getAllAsync('PRAGMA foreign_key_check');
    if (Array.isArray(foreignKeyFailures) && foreignKeyFailures.length > 0) {
      throw new Error('Backup restore failed referential-integrity verification.');
    }
  });
}

export async function restoreAllTables(dump, userId) {
  const d = await db();
  return restoreAllTablesIntoDb(d, dump, userId);
}

// ─── Adaptive Volume Landmarks ──────────────────────────────────────────────
// Builds the history array consumed by computeAdaptiveLandmarks() in algorithms.js.
// Uses the workouts table (not the old workout_feedback table which never existed).
// Derives performanceTrend from rep history and missedReps from target vs actual.
export async function getAdaptiveLandmarkHistory(userId) {
  try {
    const d = await db();
    const rows = await d.getAllAsync(
      `SELECT
         w.id AS workout_id,
         w.started_at,
         w.overall_pump,
         w.soreness_24h_before,
         w.joint_discomfort,
         e.primary_muscle AS muscle,
         COUNT(*) AS set_count,
         AVG(ws.actual_reps) AS avg_reps,
         AVG(
           CASE
             WHEN ws.target_reps_min IS NOT NULL
              AND ws.actual_reps < ws.target_reps_min
             THEN ws.target_reps_min - ws.actual_reps
             ELSE 0
           END
         ) AS avg_missed
       FROM workouts w
       JOIN workout_sets ws ON ws.workout_id = w.id AND ws.set_type != 'warmup'
         -- EL-7 (docs/exercise-library-expansion-2026-09-05/05-DECISIONS.md):
         -- adapted landmarks are a learning consumer; a circuit or ballistic
         -- set is confounded evidence for this muscle's ordinary training
         -- response and must not shape the adapted band. NULL = conventional.
         AND ws.evidence_class IS NULL
       JOIN exercises e ON e.id = ws.exercise_id
       WHERE w.user_id = ? AND w.is_completed = 1 AND w.overall_pump IS NOT NULL
       GROUP BY w.id, e.primary_muscle
       ORDER BY w.started_at DESC
       LIMIT 200`,
      [userId],
    );

    if (rows.length === 0) return [];

    // CC30 (section 7 matrix, adapted landmarks row): affected
    // (muscle, session) rows leave the window at compute time - a session
    // trained under a definite EPISODE conflict for that muscle teaches
    // no adapted band, and the window self-heals once the episode ends
    // (PB column). Baseline rules never exclude anything (CAP-1), and
    // the common no-episode case skips all of this. Best-effort: if the
    // capability read fails, the unfiltered history stands (the adapted
    // layer is Pro polish; a transient failure must not blank it).
    let eligibleRows = rows;
    try {
      // Lazy: the capability lane lazy-requires this module (same
      // convention as the section 18 stats reader).
      // eslint-disable-next-line global-require
      const elig = require('./capability/eligibility');
      const capRows = await getCapabilityConstraints(userId);
      if (capRows.some((r) => r.role === 'episode')) {
        const library = await getAllExercises();
        const cache = new Map();
        const constrainedAt = (atMs) => {
          const key = String(atMs);
          if (!cache.has(key)) cache.set(key, elig.constrainedMusclesAt(capRows, library, atMs));
          return cache.get(key);
        };
        eligibleRows = rows.filter((row) => !constrainedAt(row.started_at).has(row.muscle));
        if (eligibleRows.length === 0) return [];
      }
    } catch (_e) { eligibleRows = rows; }

    // Derive performanceTrend per muscle: compare avg reps from last 3 sessions vs 3 before.
    // -1 = declining, 0 = flat, 1 = improving.
    // CC30: over ELIGIBLE sessions only - a constrained session's reps
    // are confounded evidence for the trend too.
    const byMuscle = {};
    for (const row of eligibleRows) {
      if (!row.muscle) continue;
      if (!byMuscle[row.muscle]) byMuscle[row.muscle] = [];
      byMuscle[row.muscle].push(row); // already DESC by started_at
    }
    const trendKey = {};
    for (const [muscle, sessions] of Object.entries(byMuscle)) {
      const recent  = sessions.slice(0, 3);
      const earlier = sessions.slice(3, 6);
      if (recent.length >= 2 && earlier.length >= 1) {
        const rAvg = recent.reduce((s, r)  => s + (r.avg_reps || 0), 0) / recent.length;
        const eAvg = earlier.reduce((s, r) => s + (r.avg_reps || 0), 0) / earlier.length;
        const trend = rAvg > eAvg + 1 ? 1 : rAvg < eAvg - 1 ? -1 : 0;
        for (const s of sessions) trendKey[`${s.workout_id}_${muscle}`] = trend;
      }
    }

    // Scale mapping: workouts store 1–3 sliders; computeAdaptiveLandmarks expects
    // pumpScore on a 1–5 scale (centred at 3) and sorenessScore on 1–5 (centred at 2).
    // These match the RP-scale conversions used in WorkoutSummaryScreen.
    const PUMP_MAP    = [1, 2, 4]; // overall_pump 1→1, 2→2, 3→4
    const SORENESS_MAP = [2, 3, 4]; // soreness_24h_before 1→2, 2→3, 3→4

    // PD-1 (bundle 2 prelude): computeAdaptiveLandmarks treats
    // `weeklyVolume` as WEEKLY sets for the muscle - bestVolume becomes
    // the adapted MAV, a weekly landmark clamped between weekly mev/mrv.
    // This function used to pass the per-SESSION set count, so a user
    // training a muscle twice a week at 6 sets each taught a 6-set
    // "weekly" ceiling. Each session entry now carries its calendar
    // week's TOTAL for that muscle (UK-local weeks, Monday start), while
    // the entry grain itself stays per-session - pump/soreness/trend are
    // session facts and dataPoints/trend behaviour is unchanged. Known
    // honest limits: the current in-progress week and the oldest week
    // clipped by the 200-row window carry their so-far totals.
    const weekTotals = {};
    for (const row of rows) {
      if (!row.muscle) continue;
      const wk = `${row.muscle}|${localWeekStartMs(row.started_at)}`;
      weekTotals[wk] = (weekTotals[wk] || 0) + (row.set_count || 0);
    }

    // C6-P2 (D97, Campaign 6 maturity audit): computeAdaptiveLandmarks
    // treats its input as CHRONOLOGICAL and takes entries.slice(-8) as
    // "the last 8 data points". This query is ORDER BY started_at DESC,
    // so without the reverse the adapted bands were computed from the
    // OLDEST eight sessions inside the 200-row window - for a mature
    // user, months-old evidence presented as current, barely moving as
    // new sessions arrived. Returned oldest-first so the slice reads the
    // genuinely most recent sessions. The trend derivation above is
    // per-muscle-constant and unaffected by return order.
    // CC30: entries over ELIGIBLE sessions only. weekTotals above stays
    // over ALL rows deliberately - the week's physical volume includes
    // constrained sessions even when they are not evidence.
    return eligibleRows.map(row => ({
      muscle: row.muscle,
      pumpScore:       PUMP_MAP[(row.overall_pump || 2) - 1]     ?? 3,
      sorenessScore:   SORENESS_MAP[(row.soreness_24h_before || 1) - 1] ?? 2,
      jointDiscomfort: row.joint_discomfort || 0,
      weeklyVolume:    weekTotals[`${row.muscle}|${localWeekStartMs(row.started_at)}`] ?? row.set_count,
      performanceTrend: trendKey[`${row.workout_id}_${row.muscle}`] ?? 0,
      prFrequency:     0,
      missedReps:      Math.round((row.avg_missed || 0) * 10) / 10,
    })).reverse();
  } catch (_e) {
    return [];
  }
}

// ─── Pro: Morning Weights ─────────────────────────────────────────────────────

export async function logMorningWeight(userId, { weightKg, loggedAt = Date.now(), notes = null } = {}) {
  // Defence in depth. The weight column is NOT NULL and a single precise
  // measurement, so a non-finite or non-positive value has no sensible
  // default: coercing it would poison the weight trend. Reject it loudly
  // here rather than letting it bind as NULL and surface as an opaque
  // SQLite constraint error. Callers (HomeScreen) already guard the input
  // and handle a throw by reverting the optimistic update.
  if (!Number.isFinite(weightKg) || weightKg <= 0) {
    throw new Error(`logMorningWeight: weightKg must be a positive finite number, got ${weightKg}`);
  }
  const d = await db();
  const id = uid();
  const now = Date.now();
  // Local-time midnight, not UTC midnight. The previous `loggedAt %
  // 86400000` form bucketed by UTC days, which meant a user in the UK
  // logging at 00:30 BST got the same bucket as one logging at 22:30
  // the previous day, and a user in PT logging at 23:30 got bucketed
  // with the next UTC day's entry.
  const startLocalDay = (ms) => {
    const d2 = new Date(ms);
    return new Date(d2.getFullYear(), d2.getMonth(), d2.getDate()).getTime();
  };
  // TZ-2: end the window at the NEXT local midnight, not dayStart + 86400000.
  // On a DST day the local day is 23 or 25h long, so a fixed 24h window either
  // overlaps the adjacent day or misses the last hour (duplicate day rows).
  const nextLocalDay = (ms) => {
    const d2 = new Date(ms);
    return new Date(d2.getFullYear(), d2.getMonth(), d2.getDate() + 1).getTime();
  };
  const dayStart = startLocalDay(loggedAt);
  const dayEnd = nextLocalDay(loggedAt);
  const existing = await d.getFirstAsync(
    'SELECT id FROM morning_weights WHERE user_id = ? AND logged_at >= ? AND logged_at < ? AND deleted_at IS NULL',
    [userId, dayStart, dayEnd],
  );
  let savedId = id;
  if (existing?.id) {
    await d.runAsync(
      'UPDATE morning_weights SET weight_kg = ?, notes = ?, updated_at = ? WHERE id = ?',
      [weightKg, notes, now, existing.id],
    );
    savedId = existing.id;
  } else {
    await d.runAsync(
      'INSERT INTO morning_weights (id, user_id, logged_at, weight_kg, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, userId, loggedAt, weightKg, notes, now, now],
    );
  }
  // Fire-and-forget cloud push so a sign-out between writes doesn't
  // strand the entry locally. Synthesises the row payload from the
  // arguments since the SELECT round-trip isn't worth it for a
  // single weight value.
  try {
    // eslint-disable-next-line global-require
    const { syncMorningWeight } = require('./sync');
    syncMorningWeight(userId, { id: savedId, weightKg, loggedAt, notes }).catch(() => {});
  } catch (_) { /* sync module unavailable, bulk upload will catch up later */ }
  return savedId;
}

/**
 * C6 R-8 (D97-22): a Home weigh-in had no owner anywhere - Body Metrics
 * withheld its actions (a no-op button is worse than none) and no
 * update/delete existed, so a mistyped weigh-in from any previous day was
 * permanent and kept feeding the trend, the ED-safety rapid-loss signal
 * and the FFM-floor last-weigh-in step for ever. Correcting or removing a
 * row can only make the evidence MORE truthful; deletion is a soft
 * tombstone so it propagates to the cloud and other devices, and every
 * product reader filters it out. No gate, threshold or floor changes.
 */
export async function updateMorningWeightById(userId, id, { weightKg, notes = undefined } = {}) {
  if (!userId || !id) return false;
  if (!Number.isFinite(weightKg) || weightKg <= 0) {
    throw new Error(`updateMorningWeightById: weightKg must be a positive finite number, got ${weightKg}`);
  }
  const d = await db();
  const now = Date.now();
  const res = notes === undefined
    ? await d.runAsync(
      'UPDATE morning_weights SET weight_kg = ?, updated_at = ? WHERE id = ? AND user_id = ? AND deleted_at IS NULL',
      [weightKg, now, id, userId],
    )
    : await d.runAsync(
      'UPDATE morning_weights SET weight_kg = ?, notes = ?, updated_at = ? WHERE id = ? AND user_id = ? AND deleted_at IS NULL',
      [weightKg, notes, now, id, userId],
    );
  _scheduleSync();
  return (res?.changes ?? 0) > 0;
}

export async function deleteMorningWeightById(userId, id) {
  if (!userId || !id) return false;
  const d = await db();
  const now = Date.now();
  const res = await d.runAsync(
    'UPDATE morning_weights SET deleted_at = ?, updated_at = ? WHERE id = ? AND user_id = ? AND deleted_at IS NULL',
    [now, now, id, userId],
  );
  _scheduleSync();
  return (res?.changes ?? 0) > 0;
}

export async function getMorningWeightsLast14Days(userId) {
  const d = await db();
  const since = Date.now() - 14 * 86400000;
  const rows = await d.getAllAsync(
    'SELECT * FROM morning_weights WHERE user_id = ? AND logged_at >= ? AND deleted_at IS NULL ORDER BY logged_at ASC',
    [userId, since],
  );
  return rows.map(rowToCamel);
}

export async function getMorningWeights(userId, limit = 90) {
  const d = await db();
  const rows = await d.getAllAsync(
    'SELECT * FROM morning_weights WHERE user_id = ? AND deleted_at IS NULL ORDER BY logged_at DESC LIMIT ?',
    [userId, limit],
  );
  return rows.map(rowToCamel).reverse();
}

export async function getMorningWeightToday(userId) {
  const d = await db();
  // Local-time midnight. See note in logMorningWeight above.
  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  // TZ-2: next local midnight, not +86400000 (DST-safe; see logMorningWeight).
  const dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
  const row = await d.getFirstAsync(
    'SELECT * FROM morning_weights WHERE user_id = ? AND logged_at >= ? AND logged_at < ? AND deleted_at IS NULL',
    [userId, dayStart, dayEnd],
  );
  return rowToCamel(row);
}

// ─── Daily steps (activity store) ─────────────────────────────────────────────
//
// The cardio/steps audit
// (docs/audit/volyume-cardio-steps-audit-2026-05-30.md) found no store for
// what the user actually did, only the coach's target and a weekly
// hit/mostly/missed memory. daily_steps is that store: one row per day, a
// step total, and the source of the figure. It backs the manual step log
// (no wearable needed) and the baseline-and-compliance reads the coach uses.

// The day key for an activity row. Matches the Diary's day key so a day's
// steps and that day's food line up on the same calendar day. TZ-1: this is
// now the LOCAL calendar day (localDayKey), the same bucket weight + workouts
// use, so everything agrees about "today" for users not at UTC+0.
export function activityDayKey(ms = Date.now()) {
  return activityRepository.activityDayKey(ms);
}

// Write (or overwrite) the step total for a day. steps is clamped to a
// sane non-negative integer. updated_at drives last-write-wins on sync.
export async function setDailySteps(userId, { entryDate, steps, source = 'manual' } = {}) {
  return activityRepository.setDailySteps(userId, { entryDate, steps, source });
}

export async function getDailySteps(userId, entryDate) {
  return activityRepository.getDailySteps(userId, entryDate);
}

export async function getDailyStepsToday(userId) {
  return activityRepository.getDailyStepsToday(userId);
}

// Inclusive range read, oldest first. Backs the baseline average (a week
// of normal days) and the compliance view (target hit rate over time).
export async function getDailyStepsRange(userId, fromDate, toDate) {
  return activityRepository.getDailyStepsRange(userId, fromDate, toDate);
}

// ─── Cardio log (audit volyume-cardio-integration-2026-06-03) ──────────────
// Cardio logging is retired (D92-1/D95 founder boundary, Campaign 4): no
// local writer remains, so only the erasure affordance and the retained
// pull path (D95 H1) still touch this table. est_kcal, where present in
// legacy/pulled rows, is session feedback only; it is never added to the
// calorie target. Soft delete via deleted_at so a delete syncs; LWW on
// updated_at.

// Soft delete: mark deleted_at + bump updated_at so the deletion syncs.
// Kept as an erasure affordance (D95 H3) though no UI currently calls it;
// account deletion and any future data-retirement design may still use it.
export async function deleteCardioLog(userId, id) {
  return activityRepository.deleteCardioLog(userId, id);
}

// Local updated_at (ms) for one row id, or null. The pull handler's LWW gate.
export async function getCardioLogUpdatedAt(userId, id) {
  return activityRepository.getCardioLogUpdatedAt(userId, id);
}

// Apply a cloud row (snake_case) into the local mirror, including soft-delete
// state. Upsert on (user_id, id); the caller has already won the LWW check.
export async function insertCardioLogFromCloud(userId, row) {
  return activityRepository.insertCardioLogFromCloud(userId, row);
}

// Rows for the sync push window (most recent N days). Step history is one
// small row per day, so a generous window is cheap. Used by the
// daily_steps per-table push handler.
export async function getDailyStepsForPush(userId, days = 400) {
  return activityRepository.getDailyStepsForPush(userId, days);
}

// Local updated_at (ms) for one day, or null if no local row. The pull
// handler uses this as the last-write-wins gate so a stale cloud row never
// clobbers a fresher local edit.
export async function getDailyStepsUpdatedAt(userId, entryDate) {
  return activityRepository.getDailyStepsUpdatedAt(userId, entryDate);
}

// Restore one cloud daily_steps row into local SQLite. INSERT OR REPLACE so
// the pull handler's LWW gate gets the overwrite it expects when the cloud
// row wins. Cloud updated_at is an ISO string; store it as ms to match the
// local convention.
export async function insertDailyStepsFromCloud(userId, row) {
  return activityRepository.insertDailyStepsFromCloud(userId, row);
}

// ─── NEW-002: training partners (local mirror) ───────────────────────────────
// Offline-first reads for the partner row. The pair-scoped sync handler keeps
// these current; the UI reads here, never Supabase directly. Derived signals
// only (planned/done/met/state) — never raw workouts.

const _toMsLocal = (v) => (v == null ? null : (typeof v === 'string' ? new Date(v).getTime() : v));

/** The user's partnerships (invited/active/ended), newest first. */
export async function getPartnershipsLocal(userId) {
  if (!userId) return [];
  const d = await db();
  const rows = await d.getAllAsync(
    `SELECT * FROM partnerships
     WHERE member_a = ? OR member_b = ?
     ORDER BY created_at DESC`,
    [userId, userId],
  );
  return rows.map(rowToCamel);
}

/** Count the user's ACTIVE partnerships (drives the free/Pro cap). */
export async function getActivePartnerCount(userId) {
  if (!userId) return 0;
  const d = await db();
  const row = await d.getFirstAsync(
    `SELECT COUNT(*) AS n FROM partnerships
     WHERE status = 'active' AND (member_a = ? OR member_b = ?)`,
    [userId, userId],
  );
  return row?.n ?? 0;
}

/** The most recent week signal for a given (pair, user). */
export async function getPartnerWeekSignal(pairId, userId, weekStart) {
  if (!pairId || !userId) return null;
  const d = await db();
  const row = weekStart
    ? await d.getFirstAsync(
        `SELECT * FROM partner_week_signals WHERE pair_id = ? AND user_id = ? AND week_start = ?`,
        [pairId, userId, String(weekStart)])
    : await d.getFirstAsync(
        `SELECT * FROM partner_week_signals WHERE pair_id = ? AND user_id = ? ORDER BY week_start DESC LIMIT 1`,
        [pairId, userId]);
  return row ? rowToCamel(row) : null;
}

/** All week signals for a pair (both members), oldest-first — feeds the shared streak. */
export async function getPairWeekSignals(pairId) {
  if (!pairId) return [];
  const d = await db();
  const rows = await d.getAllAsync(
    `SELECT * FROM partner_week_signals WHERE pair_id = ? ORDER BY week_start ASC`,
    [pairId],
  );
  return rows.map(rowToCamel);
}

/** The local day the user last cheered into a pair, or null. */
export async function getLastCheerSentOn(pairId, senderId) {
  if (!pairId || !senderId) return null;
  const d = await db();
  const row = await d.getFirstAsync(
    `SELECT sent_on FROM partner_cheers WHERE pair_id = ? AND sender_id = ? ORDER BY sent_on DESC LIMIT 1`,
    [pairId, senderId],
  );
  return row?.sent_on ?? null;
}

/** The most recent cheer RECEIVED in a pair (sender != me), or null. */
export async function getLastCheerReceived(pairId, myId) {
  if (!pairId || !myId) return null;
  const d = await db();
  const row = await d.getFirstAsync(
    `SELECT * FROM partner_cheers WHERE pair_id = ? AND sender_id != ? ORDER BY sent_on DESC LIMIT 1`,
    [pairId, myId],
  );
  return row ? rowToCamel(row) : null;
}

// ── Cloud-restore writers used by the sync handler ──
export async function upsertPartnershipFromCloud(row) {
  if (!row?.id) return;
  const d = await db();
  const values = [
    row.id, row.member_a ?? null, row.member_b ?? null, row.status ?? 'invited',
    row.streak_enabled ? 1 : 0,
    _toMsLocal(row.created_at), _toMsLocal(row.accepted_at), _toMsLocal(row.ended_at),
    _toMsLocal(row.updated_at ?? row.accepted_at ?? row.created_at) ?? Date.now(),
  ];
  try {
    await d.runAsync(
      `INSERT OR REPLACE INTO partnerships
         (id, member_a, member_b, status, streak_enabled, partner_first_name, created_at, accepted_at, ended_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        values[0], values[1], values[2], values[3], values[4],
        // The OTHER member's server-snapshotted FIRST name, resolved by the sync
        // pull relative to this device's user. Null for legacy pairs ('Your
        // partner' fallback holds at every consumer).
        row.partner_first_name ?? null,
        values[5], values[6], values[7], values[8],
      ],
    );
  } catch (e) {
    const message = String(e?.message || e || '').toLowerCase();
    if (!message.includes('partner_first_name')) throw e;
    await d.runAsync(
      `INSERT OR REPLACE INTO partnerships
         (id, member_a, member_b, status, streak_enabled, created_at, accepted_at, ended_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      values,
    );
  }
}

export async function upsertPartnerWeekSignalFromCloud(row) {
  if (!row?.pair_id || !row?.user_id || !row?.week_start) return;
  const d = await db();
  await d.runAsync(
    `INSERT OR REPLACE INTO partner_week_signals
       (pair_id, user_id, week_start, planned_count, done_count, week_met, state, completed_block, hit_pb, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.pair_id, row.user_id, String(row.week_start),
      Math.max(0, Math.round(Number(row.planned_count) || 0)),
      Math.max(0, Math.round(Number(row.done_count) || 0)),
      row.week_met ? 1 : 0, row.state === 'resting' ? 'resting' : 'training',
      row.completed_block ? 1 : 0, row.hit_pb ? 1 : 0,
      _toMsLocal(row.updated_at) ?? Date.now(),
    ],
  );
}

export async function upsertPartnerCheerFromCloud(row) {
  if (!row?.id || !row?.pair_id) return;
  const d = await db();
  await d.runAsync(
    `INSERT OR REPLACE INTO partner_cheers (id, pair_id, sender_id, sent_on, kind, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      row.id, row.pair_id, row.sender_id, row.sent_on,
      // The chosen acknowledgement key (D5-B1); legacy/pre-106 rows read as the
      // quiet default 'here'. Never free text — the closed enum is the contract.
      row.kind ?? 'here',
      _toMsLocal(row.created_at) ?? Date.now(),
    ],
  );
}

// ── Weekly intention (Partners D5-A) ──
// One row per (pair, member, week_start): the member's integer weekly session
// aim against their OWN plan. Derived-safe. Both members read both rows so the
// PairCard can show each own aim; nobody's number is ever compared.

/** Local mirror write after the edge function accepts today's cheer. */
export async function setLocalPartnerCheerSent({ pairId, senderId, sentOn, kind } = {}) {
  if (!pairId || !senderId || !sentOn) return;
  const d = await db();
  const now = Date.now();
  await d.runAsync(
    `INSERT OR REPLACE INTO partner_cheers (id, pair_id, sender_id, sent_on, kind, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      `local:${pairId}:${senderId}:${sentOn}`,
      pairId,
      senderId,
      sentOn,
      kind || 'here',
      now,
    ],
  );
}

/** A single member's aim for a (pair, week), or null. */
export async function getPartnerWeeklyIntention(pairId, userId, weekStart) {
  if (!pairId || !userId || !weekStart) return null;
  const d = await db();
  const row = await d.getFirstAsync(
    'SELECT * FROM partner_weekly_intentions WHERE pair_id = ? AND user_id = ? AND week_start = ?',
    [pairId, userId, String(weekStart)],
  );
  return row ? rowToCamel(row) : null;
}

/** Write the local user's OWN aim immediately (before the cloud push lands). */
export async function setLocalPartnerWeeklyIntention({ pairId, userId, weekStart, weeklyAim } = {}) {
  if (!pairId || !userId || !weekStart) return;
  const d = await db();
  const now = Date.now();
  await d.runAsync(
    `INSERT OR REPLACE INTO partner_weekly_intentions
       (pair_id, user_id, week_start, weekly_aim, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [pairId, userId, String(weekStart), Math.max(0, Math.round(Number(weeklyAim) || 0)), now, now],
  );
}

/** Cloud-restore writer used by the sync pull (both members' aims). */
export async function upsertPartnerWeeklyIntentionFromCloud(row) {
  if (!row?.pair_id || !row?.user_id || !row?.week_start) return;
  const d = await db();
  await d.runAsync(
    `INSERT OR REPLACE INTO partner_weekly_intentions
       (pair_id, user_id, week_start, weekly_aim, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      row.pair_id, row.user_id, String(row.week_start),
      Math.max(0, Math.round(Number(row.weekly_aim) || 0)),
      _toMsLocal(row.created_at), _toMsLocal(row.updated_at) ?? Date.now(),
    ],
  );
}

// ── Shared training block (Wave 5 C5 A1) ──
// One row per pair: block reference + the display name the proposer chose to
// share + proposed|active. Never plan content — the §5 contract holds.

/** The pair's shared block row, or null. */
export async function getPartnerSharedBlock(pairId) {
  if (!pairId) return null;
  const d = await db();
  const row = await d.getFirstAsync(
    'SELECT * FROM partner_shared_blocks WHERE pair_id = ?', [pairId]);
  return row ? rowToCamel(row) : null;
}

export async function upsertPartnerSharedBlockFromCloud(row) {
  if (!row?.pair_id || !row?.block_name) return;
  const d = await db();
  await d.runAsync(
    `INSERT OR REPLACE INTO partner_shared_blocks
       (pair_id, block_ref, block_name, proposed_by, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      row.pair_id, row.block_ref ?? null, String(row.block_name).slice(0, 80),
      row.proposed_by ?? '', row.status === 'active' ? 'active' : 'proposed',
      _toMsLocal(row.created_at), _toMsLocal(row.updated_at) ?? Date.now(),
    ],
  );
}

/** Remove the pair's shared block locally (leave, or cloud says it is gone). */
export async function deleteLocalPartnerSharedBlock(pairId) {
  if (!pairId) return;
  const d = await db();
  await d.runAsync('DELETE FROM partner_shared_blocks WHERE pair_id = ?', [pairId]);
}

/** Local "what cloud rows exist for my pairs" — used to prune unpaired rows on pull. */
export async function getPartnerWinCards(pairId, { limit = 5, includeRevoked = false } = {}) {
  if (!pairId) return [];
  const d = await db();
  const rows = await d.getAllAsync(
    `SELECT * FROM partner_win_cards
     WHERE pair_id = ? ${includeRevoked ? '' : 'AND revoked_at IS NULL'}
     ORDER BY created_at DESC
     LIMIT ?`,
    [pairId, Math.max(1, Math.min(20, Math.round(Number(limit) || 5)))],
  );
  return rows.map(rowToCamel);
}

export async function upsertPartnerWinCardFromCloud(row) {
  if (!row?.id || !row?.pair_id || !row?.sender_id || !row?.card_type) return;
  const d = await db();
  await d.runAsync(
    `INSERT OR REPLACE INTO partner_win_cards
       (id, pair_id, sender_id, card_type, title, summary, detail, visible_to_partner, remains_private, created_at, revoked_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id,
      row.pair_id,
      row.sender_id,
      String(row.card_type).slice(0, 40),
      String(row.title || 'Shared win').slice(0, 80),
      String(row.summary || '').slice(0, 160),
      String(row.detail || '').slice(0, 240),
      String(row.visible_to_partner || '').slice(0, 180),
      String(row.remains_private || '').slice(0, 220),
      _toMsLocal(row.created_at) ?? Date.now(),
      _toMsLocal(row.revoked_at),
      _toMsLocal(row.updated_at ?? row.created_at) ?? Date.now(),
    ],
  );
}

export async function markLocalPartnerWinCardRevoked(cardId, revokedAt = Date.now()) {
  if (!cardId) return;
  const d = await db();
  const ts = _toMsLocal(revokedAt) ?? Date.now();
  await d.runAsync(
    'UPDATE partner_win_cards SET revoked_at = ?, updated_at = ? WHERE id = ?',
    [ts, ts, cardId],
  );
}

export async function getLocalPartnershipIds(userId) {
  if (!userId) return [];
  const d = await db();
  const rows = await d.getAllAsync(
    `SELECT id FROM partnerships WHERE member_a = ? OR member_b = ?`, [userId, userId]);
  return rows.map((r) => r.id);
}

/**
 * Purge the local mirror of one pair's SHARED data (its week signals + cheers),
 * leaving the partnership tombstone in place. Honours the unpair deletion promise
 * (blueprint §5) on-device: called both on the unpairing user's own device (for
 * immediate effect) and during the pull for any pair the cloud now reports as
 * ended, so the OTHER member's device clears the shared rows too.
 */
export async function deleteLocalPairSharedData(pairId) {
  if (!pairId) return;
  const d = await db();
  await runInTransaction(d, async () => {
    await d.runAsync('DELETE FROM partner_cheers WHERE pair_id = ?', [pairId]);
    await d.runAsync('DELETE FROM partner_week_signals WHERE pair_id = ?', [pairId]);
    await d.runAsync('DELETE FROM partner_shared_blocks WHERE pair_id = ?', [pairId]);
    await d.runAsync('DELETE FROM partner_weekly_intentions WHERE pair_id = ?', [pairId]);
    await d.runAsync('DELETE FROM partner_win_cards WHERE pair_id = ?', [pairId]);
  });
}

/**
 * Mark a local partnership as ended, mirroring what end_partnership does
 * server-side. Cancelling a pending invite (or ending an active pairing) has
 * to move the local row out of both the active and the pending derivations at
 * once: usePartners.load reads only SQLite and the next pull may be minutes
 * away, so without this the cancelled invite's card keeps showing (its row is
 * still status='invited') even though the cancel succeeded. Keeps the row as an
 * 'ended' tombstone rather than deleting it, matching deleteLocalPairSharedData.
 */
export async function markLocalPartnershipEnded(pairId) {
  if (!pairId) return;
  const d = await db();
  const now = Date.now();
  await d.runAsync(
    "UPDATE partnerships SET status = 'ended', ended_at = ?, updated_at = ? WHERE id = ?",
    [now, now, pairId],
  );
}

// ─── Pro: Weekly Check-Ins ────────────────────────────────────────────────────

export async function saveWeeklyCheckin(userId, data) {
  const d = await db();
  const now = Date.now();
  // Find this week's check-in by when it was made, not its stored
  // week_start: created_at is an absolute instant, so a row written under
  // the older UTC-Monday week_start convention is still matched and updated
  // rather than duplicated. data.weekStart is the local Monday 00:00.
  const weekEnd = localWeekEndMs(data.weekStart); // LS-06: DST-correct week end, not fixed 168h
  const existing = await d.getFirstAsync(
    'SELECT id FROM weekly_checkins WHERE user_id = ? AND created_at >= ? AND created_at < ? ORDER BY created_at DESC LIMIT 1',
    [userId, data.weekStart, weekEnd],
  );

  // Column map: data key -> [column, coerce]. The write is PRESERVING: a field
  // is only touched when the caller actually provides it (value !== undefined).
  // weekly_checkins has two writers (the weekly check-in and, for sleep
  // quality, WorkoutSummaryScreen). The old write set every column to
  // `value ?? null`, so whichever writer ran last NULLED the other's answers,
  // wiping the user's calorie / steps / cardio / training data within a week.
  // Now a writer that owns only some fields leaves the rest untouched. Passing
  // an explicit null still clears a field; only `undefined` means "leave the
  // stored value alone".
  const COLS = [
    ['energyScore', 'energy_score', (v) => v],
    ['sorenessScore', 'soreness_score', (v) => v],
    ['stressScore', 'stress_score', (v) => v],
    ['sleepHours', 'sleep_hours', (v) => v],
    ['calsAdherence', 'cals_adherence', (v) => v],
    ['stepsAdherence', 'steps_adherence', (v) => v],
    ['cardioAdherence', 'cardio_adherence', (v) => v],
    ['stepsAvg', 'steps_avg', (v) => v],
    // C5-P20-01 (D96): tri-state, exactly like joint_pain below. null =
    // never asked (the Fast Check-In does not render the question, and the
    // wizard's row is skippable), 0 = the user's explicit "not this week",
    // 1 = flagged. The old (v ? 1 : 0) stored an unasked question as a
    // genuine "no", which is the PERMISSIVE direction in the engine (every
    // calorie branch is gated on !cycleOverride). The engine's own read is
    // !!checkin.cycleOverride, so null behaves exactly as the old 0 did for
    // coaching; what changes is that "unasked" is no longer recorded as an
    // answer the user did not give.
    ['cycleOverride', 'cycle_override', (v) => (v == null ? null : (v ? 1 : 0))],
    ['notes', 'notes', (v) => v],
    ['trainingPerformance', 'training_performance', (v) => v],
    // Campaign 1 P0-4: tri-state. null = unanswered (no evidence), 0 = the
    // user's explicit "no", 1 = flagged. The old (v ? 1 : 0) stored an
    // unanswered question as a genuine negative answer for ever.
    ['jointPain', 'joint_pain', (v) => (v == null ? null : (v ? 1 : 0))],
    ['soreMuscles', 'sore_muscles', (v) => v],
    ['sleepQuality', 'sleep_quality', (v) => v],
  ];

  let savedId;
  if (existing?.id) {
    const setParts = [];
    const args = [];
    for (const [key, col, coerce] of COLS) {
      if (data[key] === undefined) continue; // preserve the stored value
      setParts.push(`${col} = ?`);
      args.push(coerce(data[key]));
    }
    setParts.push('updated_at = ?');
    args.push(now, existing.id);
    await d.runAsync(
      `UPDATE weekly_checkins SET ${setParts.join(', ')} WHERE id = ?`,
      args,
    );
    savedId = existing.id;
  } else {
    savedId = uid();
    const cols = ['id', 'user_id', 'week_start'];
    const vals = [savedId, userId, data.weekStart];
    for (const [key, col, coerce] of COLS) {
      cols.push(col);
      vals.push(data[key] === undefined ? null : coerce(data[key]));
    }
    cols.push('created_at', 'updated_at');
    vals.push(now, now);
    await d.runAsync(
      `INSERT INTO weekly_checkins (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
      vals,
    );
  }
  // Fire-and-forget cloud push through the registry runner (E12 step 1: the
  // legacy per-save syncWeeklyCheckin dual writer is retired; the registry
  // weekly_checkins handler reads the merged SQLite row saved above, so a
  // partial writer can't null the cloud copy either).
  try {
    // eslint-disable-next-line global-require
    const { syncAll } = require('./sync');
    syncAll({ userId, localUserId: userId, triggeredBy: 'write' }).catch(() => {});
  } catch (_) { /* sync module unavailable, the next lifecycle sync catches up */ }
  return savedId;
}

export async function getLatestCheckin(userId, weekStart = null) {
  const d = await db();
  if (weekStart != null) {
    // Prefer a real check-in row (energy_score set) over a workout's
    // sleep-only contribution if both ever share a week_start, and be
    // deterministic when more than one row exists.
    const row = await d.getFirstAsync(
      `SELECT * FROM weekly_checkins WHERE user_id = ? AND week_start = ?
       ORDER BY (energy_score IS NOT NULL) DESC, created_at DESC LIMIT 1`,
      [userId, weekStart],
    );
    return rowToCamel(row);
  }
  const row = await d.getFirstAsync(
    'SELECT * FROM weekly_checkins WHERE user_id = ? ORDER BY week_start DESC LIMIT 1',
    [userId],
  );
  return rowToCamel(row);
}

export async function getRecentCheckins(userId, count = 4) {
  const d = await db();
  const rows = await d.getAllAsync(
    'SELECT * FROM weekly_checkins WHERE user_id = ? ORDER BY week_start DESC LIMIT ?',
    [userId, count],
  );
  return rows.map(rowToCamel);
}

// ─── Pro: Weekly session stats ────────────────────────────────────────────────

// TZ/data-window guard for the weekly-stat readers. A Date here (the 2026-06
// check-in bug) would string-concatenate in `weekStart + 7 * 86400000` and
// silently break the query window. Coerce a Date to epoch-ms and reject
// anything that isn't a finite number, so a bad arg surfaces loudly instead
// of returning wrong session/PR counts. Exported so the coercion is unit
// tested directly (the CRUD itself runs on device, not under jest).
export function coerceWeekStartMs(weekStart, fnName = 'weekStart') {
  // Only a Date, a finite number, or a non-empty numeric string is a valid
  // window start. Guard against the JS coercion traps: Number(null),
  // Number('') and Number(false) are all 0 (a silent 1970 window), and an
  // Invalid Date is NaN. Anything else throws rather than running a wrong
  // query.
  if (weekStart instanceof Date) {
    const ms = weekStart.getTime();
    if (Number.isFinite(ms)) return ms;
  } else if (typeof weekStart === 'number' && Number.isFinite(weekStart)) {
    return weekStart;
  } else if (typeof weekStart === 'string' && weekStart.trim() !== '') {
    const n = Number(weekStart);
    if (Number.isFinite(n)) return n;
  }
  throw new Error(`${fnName}: weekStart must be epoch-ms, got ${weekStart}`);
}

// Which past calendar weeks were engine-prescribed deload (recovery) weeks.
// COMP-018's run-length must treat a deload week as "resting", never a miss,
// so a user who correctly backs off during a planned recovery week is not
// punished. There is no calendar-dated deload record (mesocycle_weeks are
// keyed by week-index, not date), so we infer it the only reliable way: a
// calendar week is a deload week if a completed workout in it was linked to a
// mesocycle_week flagged is_deload = 1. Returns an array of week-start epochs
// (local Monday 00:00). Known gap: a deload week with zero logged sessions
// has no workout to link, so it cannot be detected here; a single such week
// is covered by the streak's one-week repair, which is why this is correct
// for realistic 1-week deloads.
export async function getDeloadWeeksInRange(userId, fromMs, toMs) {
  const d = await db();
  const rows = await d.getAllAsync(
    `SELECT w.started_at AS startedAt
     FROM workouts w
     JOIN mesocycle_weeks mw ON mw.id = w.mesocycle_week_id
     WHERE w.user_id = ? AND w.is_completed = 1
       AND w.started_at >= ? AND w.started_at < ?
       AND mw.is_deload = 1`,
    [userId, fromMs, toMs],
  );
  const set = new Set();
  for (const r of rows) {
    if (Number.isFinite(r.startedAt)) set.add(localWeekStartMs(r.startedAt));
  }
  return Array.from(set);
}

export async function getWeeklySessionStats(userId, weekStart) {
  const weekStartMs = coerceWeekStartMs(weekStart, 'getWeeklySessionStats');
  const d = await db();
  const weekEnd = localWeekEndMs(weekStartMs); // LS-06: DST-correct week end, not fixed 168h
  // C6 RD6-9 (D97-25): a "session" here must contain at least one set -
  // the same evidence test ReadinessCards already applies to the same
  // rows. Counting bare is_completed rows let a started-and-abandoned
  // shell inflate "You hit all N sessions" and the streak/widget/partner
  // counts built on this reader.
  const FULL_SESSION_EVIDENCE = `AND EXISTS (
         SELECT 1 FROM workout_sets ws WHERE ws.workout_id = workouts.id)
       AND NOT EXISTS (
         SELECT 1 FROM session_resolutions sr
          WHERE sr.user_id = workouts.user_id
            AND sr.workout_id = workouts.id
            AND sr.resolution = 'ended_early'
            AND sr.deleted_at IS NULL)`;
  const row = await d.getFirstAsync(
    `SELECT COUNT(*) AS completed FROM workouts
     WHERE user_id = ? AND is_completed = 1 AND started_at >= ? AND started_at < ?
       ${FULL_SESSION_EVIDENCE}`,
    [userId, weekStartMs, weekEnd],
  );
  const prev4 = await d.getAllAsync(
    `SELECT COUNT(*) AS wk_count FROM workouts
     WHERE user_id = ? AND is_completed = 1
       AND started_at >= ? AND started_at < ?
       ${FULL_SESSION_EVIDENCE}
     GROUP BY CAST((started_at - ?) / (7 * 86400000) AS INTEGER)`,
    [userId, weekStartMs - 28 * 86400000, weekStartMs, weekStartMs - 28 * 86400000],
  );
  const avgPrev = prev4.length
    ? prev4.reduce((s, r) => s + (r.wk_count ?? 0), 0) / prev4.length
    : 3;

  // ALGO-002: planned sessions come from the active plan's training days (the
  // number of routines in the active programme), which is what the plan
  // actually prescribes this week. The trailing-average estimate is only a
  // fallback for users with no active plan to read.
  let plannedFromPlan = null;
  try {
    const plan = await getActivePlan(userId);
    if (plan?.id) {
      const routines = await getRoutinesForPlan(plan.id);
      if (Array.isArray(routines) && routines.length > 0) plannedFromPlan = routines.length;
    }
  } catch (_) { /* fall back to the historical estimate below */ }

  let completed = row?.completed ?? 0;
  // CC31 (section 20): how many of this week's sessions carry at least
  // one constraint-excused omission (full or partial) - the CONSTRAINED
  // limiter's evidence that the restriction shaped the week. Additive
  // field; a read failure honestly reports zero.
  let constraintExcusedSessions = 0;
  try {
    // Round 11 (B9): completed sessions only - an opened-and-abandoned
    // workout carries no training evidence, so it must not count as a
    // week the restriction excused or reshaped (it counts for nothing
    // in `completed` either). Same gate on both counters below.
    const excusedRow = await d.getFirstAsync(
      `SELECT COUNT(DISTINCT sce.workout_id) AS n
         FROM session_constraint_effects sce
         JOIN workouts w ON w.id = sce.workout_id
        WHERE sce.user_id = ? AND sce.deleted_at IS NULL
          AND w.user_id = ? AND w.is_completed = 1
          AND w.started_at >= ? AND w.started_at < ?
          AND sce.effects_json LIKE '%"omitted"%'`,
      [userId, userId, weekStartMs, weekEnd],
    ).catch(() => null);
    constraintExcusedSessions = Number(excusedRow?.n ?? 0) || 0;
  } catch (_e) { constraintExcusedSessions = 0; }

  // CC33 D112 R7 (section 20; closes audit T2-13): how many of this
  // week's sessions the restriction RESHAPED at all - substitutions
  // included. A week where a substitute was always found registered
  // zero excused sessions and could never read CONSTRAINED, so the
  // coach blamed the programme for a week the restriction shaped.
  // Additive field; a read failure honestly reports zero.
  // Round 10 (R10-3): a LIVE entry is required, not merely a non-empty
  // record - a record whose every entry was revoked (the user re-added
  // and trained the omitted movement) describes a session the
  // restriction did not reshape in the end. The quoted LIKE matches
  // 'omitted'/'substituted' exactly and never their _revoked forms,
  // the same match discipline as the excusal counter above.
  let constraintReshapedSessions = 0;
  try {
    const reshapedRow = await d.getFirstAsync(
      `SELECT COUNT(DISTINCT sce.workout_id) AS n
         FROM session_constraint_effects sce
         JOIN workouts w ON w.id = sce.workout_id
        WHERE sce.user_id = ? AND sce.deleted_at IS NULL
          AND w.user_id = ? AND w.is_completed = 1
          AND w.started_at >= ? AND w.started_at < ?
          AND (sce.effects_json LIKE '%"omitted"%' OR sce.effects_json LIKE '%"substituted"%')`,
      [userId, userId, weekStartMs, weekEnd],
    ).catch(() => null);
    constraintReshapedSessions = Number(reshapedRow?.n ?? 0) || 0;
  } catch (_e) { constraintReshapedSessions = 0; }

  // CC29 (section 18; Audit G C1/C4): denominators read the EFFECTIVE
  // prescription. An ended_early session whose every unperformed planned
  // exercise is excused by its own effects record (episode-constraint
  // omissions written at finish) counts COMPLETED - the athlete did
  // everything effectively prescribed. Stopping BEYOND effective scope
  // stays ended_early, exactly as before. Best-effort: any read failure
  // leaves the pre-CC29 numbers.
  try {
    const endedEarly = await d.getAllAsync(
      `SELECT w.id, w.routine_id AS routineId FROM workouts w
        WHERE w.user_id = ? AND w.is_completed = 1
          AND w.started_at >= ? AND w.started_at < ?
          AND EXISTS (SELECT 1 FROM workout_sets ws WHERE ws.workout_id = w.id)
          AND EXISTS (
            SELECT 1 FROM session_resolutions sr
             WHERE sr.user_id = w.user_id AND sr.workout_id = w.id
               AND sr.resolution = 'ended_early' AND sr.deleted_at IS NULL)`,
      [userId, weekStartMs, weekEnd],
    ).catch(() => []);
    for (const w of endedEarly ?? []) {
      if (!w.routineId) continue;
      // eslint-disable-next-line no-await-in-loop
      const eff = await getSessionConstraintEffect(userId, w.id);
      const excused = new Set((eff?.effects ?? [])
        .filter((e) => e?.effect === 'omitted' && e?.exerciseFrom)
        .map((e) => e.exerciseFrom));
      if (!excused.size) continue;
      // eslint-disable-next-line no-await-in-loop
      const plannedRows = await d.getAllAsync(
        'SELECT exercise_id AS exerciseId FROM routine_exercises WHERE routine_id = ?', [w.routineId],
      ).catch(() => []);
      // eslint-disable-next-line no-await-in-loop
      const performedRows = await d.getAllAsync(
        'SELECT DISTINCT exercise_id AS exerciseId FROM workout_sets WHERE workout_id = ?', [w.id],
      ).catch(() => []);
      const performedIds = new Set((performedRows ?? []).map((r) => r.exerciseId));
      const unperformed = (plannedRows ?? [])
        .map((r) => r.exerciseId)
        .filter((exId) => exId && !performedIds.has(exId));
      if (unperformed.length > 0 && unperformed.every((exId) => excused.has(exId))) {
        completed += 1;
      }
    }
  } catch (_e) { /* pre-CC29 numbers stand */ }

  const planned = plannedFromPlan != null
    ? plannedFromPlan
    : Math.max(completed, Math.round(avgPrev) || 3);

  // CC29 §18's predictive whole-session reduction of `planned` was
  // DELETED here (CC33 round 5, R5-5; D117 ruling, correcting D116
  // ruling 2's premise). It predicted a fully-omitted session with a
  // capability-only substitute test, which is strictly weaker than
  // serve's composed senior question - so every session it excused was
  // one serve's never-served-empty fail-safe (D116) was about to serve
  // IN FULL, and the reduction could only flatter completed/planned,
  // never describe it. What a constraint actually did to a week is read
  // from the session effects RECORDS by the two counters above and the
  // ended-early excusal - facts, not predictions.

  // RD6-9: display surfaces must not present the trailing-average
  // estimate as though a plan prescribed it; plannedIsEstimate lets
  // them choose honest phrasing. Existing numeric consumers unchanged.
  return {
    completed, planned, plannedIsEstimate: plannedFromPlan == null,
    constraintExcusedSessions, constraintReshapedSessions,
  };
}

// True when a workout exists for the given calendar day (any state,
// completed or in progress). Drives the Diary's training-day / rest-day
// carb-cycle target (GAP row 6): the day flips to the training-day
// target as soon as a session is started, so the higher carb allowance
// is available while training rather than only after the workout is
// finished. dateIso is a 'YYYY-MM-DD' string. TZ-1/TZ-2: parse it as a LOCAL
// day (the diary now keys by local day) and bound at the next local midnight,
// so a late-evening workout is matched to the right calendar day and DST days
// don't drift the window.
export async function hasWorkoutOnDate(userId, dateIso) {
  if (!userId || !dateIso) return false;
  const [y, m, dd] = String(dateIso).split('-').map(Number);
  if (!y || !m || !dd) return false;
  const start = new Date(y, m - 1, dd).getTime();
  const end = new Date(y, m - 1, dd + 1).getTime();
  const d = await db();
  const row = await d.getFirstAsync(
    'SELECT 1 AS hit FROM workouts WHERE user_id = ? AND started_at >= ? AND started_at < ? LIMIT 1',
    [userId, start, end],
  );
  return !!row;
}

// The UTC date ('YYYY-MM-DD') of the earliest workout on or after the
// calendar day that contains sinceMs, or null. Resolves which day an
// applied refeed lands on (GAP row 7): the refeed is the first training
// day on or after the day it was confirmed. The threshold is snapped to
// UTC midnight so a session trained earlier on the confirm day counts.
export async function getFirstWorkoutDateOnOrAfter(userId, sinceMs) {
  if (!userId || sinceMs == null) return null;
  const dayStart = Date.parse(`${new Date(sinceMs).toISOString().slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(dayStart)) return null;
  const d = await db();
  const row = await d.getFirstAsync(
    'SELECT started_at FROM workouts WHERE user_id = ? AND started_at >= ? ORDER BY started_at ASC LIMIT 1',
    [userId, dayStart],
  );
  if (!row?.started_at) return null;
  return new Date(row.started_at).toISOString().slice(0, 10);
}

// X4 (cross-surface consistency audit 2026-07-30): this used to compare a
// plain-Epley e1RM (weight * (1 + reps/30)) in SQL, with no rep clamp, no
// reps=1 special case and a zero margin -- a different verdict from the live
// in-session PR detector (detectPR/calculate1RM, algorithms.js), which blends
// Epley/Brzycki up to 10 reps and uses Epley alone above that (C10L),
// clamps the rep count the formula sees at 20, special-cases
// reps=1 (returns the raw weight) and requires the new estimate to beat the
// prior best by more than 0.1%. Worked divergence the audit found: a prior
// best of 94kg x 2 vs 60kg x 20 this week fires a PR under the blended
// formula but not under plain Epley.
//
// RULED: calculate1RM is the better model and is what the user already sees
// live, so the weekly tally conforms to it, not the reverse. calculate1RM's
// conditional/clamped shape doesn't translate into a single SQL expression,
// so the rows are fetched raw and reduced with calculate1RM in JS instead --
// correctness over keeping it in one query, per the audit's own ruling.
// calculate1RM and detectPR themselves are UNCHANGED (do not alter them).
export async function getWeeklyPRCount(userId, weekStart) {
  // Same data-window guard as getWeeklySessionStats: coerce a Date to
  // epoch-ms and reject a non-finite window rather than silently miscount PRs.
  const weekStartMs = coerceWeekStartMs(weekStart, 'getWeeklyPRCount');
  const d = await db();
  const weekEnd = localWeekEndMs(weekStartMs); // LS-06: DST-correct week end, not fixed 168h

  // distance/duration reuse the weight column, so they must never enter an
  // e1RM (weight-based) comparison or they manufacture phantom PRs. LEFT JOIN
  // keeps unknown/unmatched exercises as weight_reps (counted) on both sides.
  // Warm-up sets excluded, matching the prior implementation's scope.
  const weekRows = await d.getAllAsync(
    `SELECT ws.exercise_id AS exerciseId, ws.weight AS weight, ws.actual_reps AS reps
     FROM workout_sets ws
     JOIN workouts w ON ws.workout_id = w.id
     LEFT JOIN exercises e ON e.id = ws.exercise_id
     LEFT JOIN custom_exercises ce ON ce.id = ws.exercise_id AND ce.user_id = ws.user_id
     WHERE ws.user_id = ? AND w.is_completed = 1
       AND w.started_at >= ? AND w.started_at < ?
       AND ws.weight IS NOT NULL AND ws.weight > 0
       AND (ws.set_type IS NULL OR ws.set_type != 'warmup')
       AND COALESCE(ce.exercise_type, e.exercise_type, 'weight_reps') NOT IN ('distance', 'duration')`,
    [userId, weekStartMs, weekEnd],
  );
  if (!weekRows.length) return 0;

  const priorRows = await d.getAllAsync(
    `SELECT ws.exercise_id AS exerciseId, ws.weight AS weight, ws.actual_reps AS reps
     FROM workout_sets ws
     JOIN workouts w ON ws.workout_id = w.id
     LEFT JOIN exercises e ON e.id = ws.exercise_id
     LEFT JOIN custom_exercises ce ON ce.id = ws.exercise_id AND ce.user_id = ws.user_id
     WHERE ws.user_id = ? AND w.is_completed = 1
       AND w.started_at < ?
       AND ws.weight IS NOT NULL AND ws.weight > 0
       AND (ws.set_type IS NULL OR ws.set_type != 'warmup')
       AND COALESCE(ce.exercise_type, e.exercise_type, 'weight_reps') NOT IN ('distance', 'duration')`,
    [userId, weekStartMs],
  );

  const bestThisWeek = new Map();
  for (const r of weekRows) {
    const e1rm = calculate1RM(r.weight, r.reps);
    if (e1rm > (bestThisWeek.get(r.exerciseId) ?? 0)) bestThisWeek.set(r.exerciseId, e1rm);
  }
  const bestPrior = new Map();
  for (const r of priorRows) {
    const e1rm = calculate1RM(r.weight, r.reps);
    if (e1rm > (bestPrior.get(r.exerciseId) ?? 0)) bestPrior.set(r.exerciseId, e1rm);
  }

  let prCount = 0;
  for (const [exerciseId, wkE1rm] of bestThisWeek) {
    const priorE1rm = bestPrior.get(exerciseId) ?? 0;
    // Same 0.1% margin as detectPR (algorithms.js): a PR must clear the
    // prior best, not just tie or nudge it by rounding noise. A PR also
    // requires a genuine prior best (priorE1rm > 0), matching detectPR's
    // own `best1RM > 0` guard -- a first-ever lift is a starting point, not
    // a PR against nothing.
    if (priorE1rm > 0 && wkE1rm > priorE1rm * 1.001) prCount += 1;
  }
  return prCount;
}

// The standout lift of a given week, for the "Great Week" recap share card.
// Pulls this week's working sets + each exercise's prior best e1RM and defers
// the choice to the pure pickBestLift() (biggest e1RM gain, else heaviest set;
// see src/lib/bestLift.js). X4: e1RM here is calculate1RM (algorithms.js),
// the SAME blended/clamped formula getWeeklyPRCount now uses (was plain
// Epley in both), so the featured lift stays consistent with the PR count on
// the same card AND with the live in-session PR detector.
export async function getBestLiftThisWeek(userId, weekStart) {
  const weekStartMs = coerceWeekStartMs(weekStart, 'getBestLiftThisWeek');
  const d = await db();
  const weekEnd = localWeekEndMs(weekStartMs); // LS-06: DST-correct week end, not fixed 168h

  const weekSets = await d.getAllAsync(
    `SELECT ws.exercise_id AS exerciseId, ex.name AS exerciseName,
            ws.weight AS weight, ws.actual_reps AS reps
     FROM workout_sets ws
     JOIN workouts w ON ws.workout_id = w.id
     LEFT JOIN exercises ex ON ex.id = ws.exercise_id
     LEFT JOIN custom_exercises ce ON ce.id = ws.exercise_id AND ce.user_id = ws.user_id
     WHERE ws.user_id = ? AND w.is_completed = 1
       AND w.started_at >= ? AND w.started_at < ?
       AND ws.weight IS NOT NULL AND ws.weight > 0
       AND (ws.set_type IS NULL OR ws.set_type != 'warmup')
       AND COALESCE(ce.exercise_type, ex.exercise_type, 'weight_reps') NOT IN ('distance', 'duration')`,
    [userId, weekStartMs, weekEnd],
  );
  if (!weekSets.length) return null;

  // X4: prior-best e1RM must use the SAME canonical/clamped formula as the
  // live PR detector, so raw sets are fetched and reduced to a per-exercise
  // max with calculate1RM in JS, rather than aggregated with a plain-Epley
  // MAX() in SQL (that formula's conditional/clamped shape doesn't translate
  // into one SQL expression -- see getWeeklyPRCount above).
  // distance/duration excluded so a cardio set can't pose as a prior best.
  const priorRows = await d.getAllAsync(
    `SELECT ws.exercise_id AS exerciseId, ws.weight AS weight, ws.actual_reps AS reps
     FROM workout_sets ws
     JOIN workouts w ON ws.workout_id = w.id
     LEFT JOIN exercises e ON e.id = ws.exercise_id
     LEFT JOIN custom_exercises ce ON ce.id = ws.exercise_id AND ce.user_id = ws.user_id
     WHERE ws.user_id = ? AND w.is_completed = 1
       AND w.started_at < ?
       AND ws.weight IS NOT NULL AND ws.weight > 0
       AND COALESCE(ce.exercise_type, e.exercise_type, 'weight_reps') NOT IN ('distance', 'duration')
       AND (ws.set_type IS NULL OR ws.set_type != 'warmup')`,
    [userId, weekStartMs],
  );
  const priorByEx = new Map();
  for (const r of priorRows) {
    // calculate1RM floors reps<1 (incl. 0/null) to the raw weight itself
    // (its own reps=1 special case), the same effective floor the old
    // NULLIF(...,0)-to-1 SQL gave the plain-Epley formula, so a 0-rep row
    // still can't score higher as "this week" than as a prior best.
    const e1rm = calculate1RM(r.weight, r.reps);
    if (e1rm > (priorByEx.get(r.exerciseId) ?? 0)) priorByEx.set(r.exerciseId, e1rm);
  }
  // pickBestLift's own per-set loop floors reps<1 to 1 before calling the
  // e1rmFn, so calculate1RM(weight, 1) (raw weight) is what actually runs
  // for those sets on the week side too -- both sides now share one formula.
  return pickBestLift(weekSets, priorByEx, calculate1RM);
}

/**
 * Total weight lifted across the user's whole history (Phase 2 lifetime-tonnage
 * landmark): SUM(weight × reps) over every completed, non-warmup working set, in
 * the user's gym unit. No date window — this is the all-time figure. Returns a
 * rounded number (0 when there is nothing logged).
 */
export async function getLifetimeTonnage(userId) {
  const d = await db();
  // Exclude 'distance'/'duration' exercises: those repurpose the weight column
  // to store metres (and reps for seconds), so weight × reps is not load and
  // would inflate tonnage with garbage. The exercise_type lives on `exercises`
  // (library) or `custom_exercises` (per-user, composite PK user_id+id); we LEFT
  // JOIN both so an unknown / unmatched exercise defaults to load-bearing
  // (weight_reps) and the figure is byte-identical for normal lifting sets.
  const row = await d.getFirstAsync(
    `SELECT COALESCE(SUM(ws.weight * ws.actual_reps), 0) AS tonnage
     FROM workout_sets ws
     JOIN workouts w ON ws.workout_id = w.id
     LEFT JOIN exercises e ON e.id = ws.exercise_id
     LEFT JOIN custom_exercises ce ON ce.id = ws.exercise_id AND ce.user_id = ws.user_id
     WHERE ws.user_id = ? AND w.is_completed = 1
       AND (ws.set_type IS NULL OR ws.set_type != 'warmup') AND ws.actual_reps > 0 AND ws.weight > 0
       AND COALESCE(ce.exercise_type, e.exercise_type, 'weight_reps') NOT IN ('distance', 'duration')`,
    [userId],
  );
  return Math.round(row?.tonnage ?? 0);
}

/**
 * Campaign 23 (§27 "Lifetime totals panel | REHOME to Recaps/YearOfLifts
 * family"): the two lifetime figures the old Progress-landing panel showed
 * alongside getLifetimeTonnage's own total weight lifted -- completed
 * session count and total reps, same all-time window, same working-set
 * exclusion rule as getLifetimeTonnage (non-warmup, positive weight/reps,
 * distance/duration excluded) so the three figures always describe the
 * same body of work.
 */
export async function getLifetimeWorkoutStats(userId) {
  const d = await db();
  const sessionsRow = await d.getFirstAsync(
    `SELECT COUNT(*) AS sessions
     FROM workouts w
     WHERE w.user_id = ? AND w.is_completed = 1 AND w.started_at IS NOT NULL`,
    [userId],
  );
  const repsRow = await d.getFirstAsync(
    `SELECT COALESCE(SUM(ws.actual_reps), 0) AS reps
     FROM workout_sets ws
     JOIN workouts w ON ws.workout_id = w.id
     LEFT JOIN exercises e ON e.id = ws.exercise_id
     LEFT JOIN custom_exercises ce ON ce.id = ws.exercise_id AND ce.user_id = ws.user_id
     WHERE ws.user_id = ? AND w.is_completed = 1
       AND (ws.set_type IS NULL OR ws.set_type != 'warmup') AND ws.actual_reps > 0 AND ws.weight > 0
       AND COALESCE(ce.exercise_type, e.exercise_type, 'weight_reps') NOT IN ('distance', 'duration')`,
    [userId],
  );
  return {
    sessions: Math.round(sessionsRow?.sessions ?? 0),
    reps: Math.round(repsRow?.reps ?? 0),
  };
}

export async function getYearOfLiftsData(userId, yearMs = null) {
  const d = await db();
  const now = Date.now();
  const yearStart = yearMs ?? (now - 365 * 86400000);

  const workouts = await d.getAllAsync(
    `SELECT w.id, w.started_at, w.duration_minutes, w.set_count
     FROM workouts w
     WHERE w.user_id = ? AND w.is_completed = 1 AND w.started_at >= ?
     ORDER BY w.started_at ASC`,
    [userId, yearStart],
  );

  const sets = await d.getAllAsync(
    // distance/duration reuse the weight column; exclude them so the Year of
    // Lifts tonnage and e1RM PRs aren't polluted by metres/seconds. LEFT JOINs
    // keep unknown/unmatched exercises as weight_reps (counted).
    `SELECT ws.weight, ws.actual_reps, ws.exercise_id, ex.name AS exercise_name,
            ex.primary_muscle AS muscle
     FROM workout_sets ws
     JOIN workouts w ON ws.workout_id = w.id
     LEFT JOIN exercises ex ON ex.id = ws.exercise_id
     LEFT JOIN custom_exercises ce ON ce.id = ws.exercise_id AND ce.user_id = ws.user_id
     WHERE ws.user_id = ? AND w.is_completed = 1 AND w.started_at >= ?
       AND ws.set_type != 'warmup' AND ws.actual_reps > 0 AND ws.weight > 0
       AND COALESCE(ce.exercise_type, ex.exercise_type, 'weight_reps') NOT IN ('distance', 'duration')`,
    [userId, yearStart],
  );

  const totalSessions = workouts.length;
  const totalSets = sets.length;
  const tonnage = Math.round(sets.reduce((t, s) => t + s.weight * s.actual_reps, 0));
  const avgSessionsPerWeek = totalSessions > 0 ? Math.round((totalSessions / 52) * 10) / 10 : 0;

  // Top 3 exercises by set count
  const exerciseCounts = {};
  for (const s of sets) {
    const key = s.exercise_name ?? 'Unknown';
    exerciseCounts[key] = (exerciseCounts[key] ?? 0) + 1;
  }
  const topExercises = Object.entries(exerciseCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, count]) => ({ name, sets: count }));

  // Most active month
  const monthCounts = {};
  for (const w of workouts) {
    const m = new Date(w.started_at).getMonth();
    monthCounts[m] = (monthCounts[m] ?? 0) + 1;
  }
  const topMonthEntry = Object.entries(monthCounts).sort((a, b) => b[1] - a[1])[0];
  const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const topMonth = topMonthEntry ? MONTH_NAMES[parseInt(topMonthEntry[0])] : null;

  // 12-month session breakdown (index 0 = Jan)
  const monthlyBreakdown = Array.from({ length: 12 }, (_, i) => ({
    month: i,
    sessions: monthCounts[i] ?? 0,
  }));

  // Unique exercise count
  const uniqueExercises = Object.keys(exerciseCounts).length;

  // Top PRs during the year, compute best estimated 1RM per exercise
  // from logged sets (the historical personal_records table was never
  // created locally; previous SQL silently caught and returned []).
  const bestByExercise = new Map();
  for (const s of sets) {
    if (!s.exercise_name) continue;
    // C6 R-15 (D97-22): the shared e1RM eligibility rule (D97-18) applies
    // here too - a myo-reps/rest-pause row's actual_reps is a SUM of
    // efforts, so it could headline the recap with an inflated estimated
    // max the live detector would refuse. Tonnage/set counts above keep
    // every working set; only the record read is gated.
    if (!isE1rmEligibleRow(s)) continue;
    const e1rm = calculate1RM(s.weight || 0, s.actual_reps || 0);
    if (!e1rm) continue;
    const prev = bestByExercise.get(s.exercise_name);
    if (!prev || e1rm > prev.value) {
      bestByExercise.set(s.exercise_name, {
        record_type: '1rm_estimate',
        value: parseFloat(e1rm.toFixed(1)),
        reps: s.actual_reps,
        exercise_name: s.exercise_name,
      });
    }
  }
  const yearPRs = Array.from(bestByExercise.values())
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  return {
    totalSessions,
    totalSets,
    tonnage,
    avgSessionsPerWeek,
    uniqueExercises,
    topExercises,
    topMonth,
    monthlyBreakdown,
    topPRs: yearPRs.map(rowToCamel),
    yearStart,
    yearEnd: now,
  };
}

// COMP-005: window-bounded recap aggregates for the monthly recap story (and
// reusable for any [startMs, endMs) window). getYearOfLiftsData is deliberately
// left untouched so Year of Lifts stays byte-identical; this is a sibling, not a
// refactor of it. Unlike the year function it (a) takes an explicit end bound,
// (b) divides sessions by the window's actual weeks rather than a flat 52,
// (c) surfaces the best single session by tonnage, and (d) optionally runs the
// same aggregates over the immediately preceding window for delta captions.
export async function getRecapData(userId, { startMs, endMs = Date.now(), compare = false } = {}) {
  const d = await db();
  const WEEK = 7 * 86400000;

  const aggregate = async (s, e) => {
    const workouts = await d.getAllAsync(
      `SELECT w.id, w.started_at
       FROM workouts w
       WHERE w.user_id = ? AND w.is_completed = 1 AND w.started_at >= ? AND w.started_at < ?
       ORDER BY w.started_at ASC`,
      [userId, s, e],
    );
    const sets = await d.getAllAsync(
      // distance/duration reuse the weight column; exclude them so recap
      // tonnage, best-session and e1RM PRs aren't polluted. LEFT JOINs keep
      // unknown/unmatched exercises as weight_reps (counted).
      `SELECT ws.workout_id, ws.weight, ws.actual_reps, ws.exercise_id, ex.name AS exercise_name
       FROM workout_sets ws
       JOIN workouts w ON ws.workout_id = w.id
       LEFT JOIN exercises ex ON ex.id = ws.exercise_id
       LEFT JOIN custom_exercises ce ON ce.id = ws.exercise_id AND ce.user_id = ws.user_id
       WHERE ws.user_id = ? AND w.is_completed = 1 AND w.started_at >= ? AND w.started_at < ?
         AND ws.set_type != 'warmup' AND ws.actual_reps > 0 AND ws.weight > 0
         AND COALESCE(ce.exercise_type, ex.exercise_type, 'weight_reps') NOT IN ('distance', 'duration')`,
      [userId, s, e],
    );
    return { workouts, sets };
  };

  const { workouts, sets } = await aggregate(startMs, endMs);
  const totalSessions = workouts.length;
  const totalSets = sets.length;
  const tonnage = Math.round(sets.reduce((t, x) => t + x.weight * x.actual_reps, 0));
  const weeks = Math.max(1, (endMs - startMs) / WEEK);
  const avgSessionsPerWeek = totalSessions > 0 ? Math.round((totalSessions / weeks) * 10) / 10 : 0;

  const exerciseCounts = {};
  for (const x of sets) {
    const k = x.exercise_name ?? 'Unknown';
    exerciseCounts[k] = (exerciseCounts[k] ?? 0) + 1;
  }
  const topExercises = Object.entries(exerciseCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, sets: count }));
  const uniqueExercises = Object.keys(exerciseCounts).length;

  // Best single session by tonnage in the window.
  const tonnageByWorkout = {};
  for (const x of sets) {
    tonnageByWorkout[x.workout_id] = (tonnageByWorkout[x.workout_id] ?? 0) + x.weight * x.actual_reps;
  }
  let bestSession = null;
  for (const w of workouts) {
    const t = Math.round(tonnageByWorkout[w.id] ?? 0);
    if (t > 0 && (!bestSession || t > bestSession.tonnage)) {
      bestSession = { startedAt: w.started_at, tonnage: t };
    }
  }

  // Best estimated 1RM per exercise this window (the personal_records table was
  // never created locally; derive from logged sets, mirroring getYearOfLiftsData).
  const bestByExercise = new Map();
  for (const x of sets) {
    if (!x.exercise_name) continue;
    const e1rm = calculate1RM(x.weight || 0, x.actual_reps || 0);
    if (!e1rm) continue;
    const prev = bestByExercise.get(x.exercise_name);
    if (!prev || e1rm > prev.value) {
      bestByExercise.set(x.exercise_name, { value: parseFloat(e1rm.toFixed(1)), reps: x.actual_reps, exerciseName: x.exercise_name });
    }
  }
  const topPRs = Array.from(bestByExercise.values()).sort((a, b) => b.value - a.value).slice(0, 5);

  let previous = null;
  if (compare) {
    const len = endMs - startMs;
    const { workouts: pw, sets: ps } = await aggregate(startMs - len, startMs);
    previous = {
      totalSessions: pw.length,
      tonnage: Math.round(ps.reduce((t, x) => t + x.weight * x.actual_reps, 0)),
    };
  }

  return {
    startMs, endMs, totalSessions, totalSets, tonnage,
    avgSessionsPerWeek, uniqueExercises, topExercises, bestSession, topPRs, previous,
  };
}

export async function getBlockReflectionData(userId, mesocycleId) {
  const d = await db();
  const meso = await d.getFirstAsync('SELECT * FROM mesocycles WHERE id = ?', [mesocycleId]);
  if (!meso) return null;
  const workouts = await d.getAllAsync(
    `SELECT w.id, w.started_at, w.duration_minutes, w.set_count, w.total_volume
     FROM workouts w
     WHERE w.user_id = ? AND w.mesocycle_id = ? AND w.is_completed = 1
     ORDER BY w.started_at ASC`,
    [userId, mesocycleId],
  );
  const sets = await d.getAllAsync(
    // COMP-005: ws.workout_id is projected so the first/last-week tonnage
    // filters below can match sets to their workout. Without it s.workout_id
    // was undefined, both week buckets were always empty, and tonnageDelta
    // (the block story's "climb" slide + BlockReflectionScreen's progress
    // figure) always computed as null.
    // distance/duration reuse the weight column; exclude them so the block's
    // first/last-week tonnage and tonnageDelta aren't polluted. LEFT JOINs keep
    // unknown/unmatched exercises as weight_reps (counted).
    `SELECT ws.workout_id, ws.weight, ws.actual_reps, ws.set_type, ws.exercise_id, ex.name AS exercise_name
     FROM workout_sets ws
     JOIN workouts w ON ws.workout_id = w.id
     LEFT JOIN exercises ex ON ex.id = ws.exercise_id
     LEFT JOIN custom_exercises ce ON ce.id = ws.exercise_id AND ce.user_id = ws.user_id
     WHERE ws.user_id = ? AND w.mesocycle_id = ? AND w.is_completed = 1
       AND ws.set_type != 'warmup' AND ws.actual_reps > 0 AND ws.weight > 0
       AND COALESCE(ce.exercise_type, ex.exercise_type, 'weight_reps') NOT IN ('distance', 'duration')`,
    [userId, mesocycleId],
  );
  const totalSessions = workouts.length;
  const totalSets = sets.length;
  const tonnage = sets.reduce((t, s) => t + (s.weight ?? 0) * (s.actual_reps ?? 0), 0);

  // First vs last week tonnage delta.
  // start_date / end_date are TEXT YYYY-MM-DD; convert to ms before arithmetic
  // (previously this was string-concat producing a non-numeric cutoff and
  // mis-bucketing every set lexicographically).
  const startMs = meso.start_date ? new Date(meso.start_date).getTime() : 0;
  const endMs = meso.end_date ? new Date(meso.end_date).getTime() : Date.now();
  const firstWeekCutoff = startMs + 7 * 86400000;
  const firstWeekSets = sets.filter(s => {
    const w = workouts.find(w2 => w2.id === s.workout_id);
    return w && w.started_at < firstWeekCutoff;
  });
  // FB-17 (D96): compare like for like. `end_date` is start + plannedWeeks,
  // so the old `endMs - 7 days` window WAS the recovery week: the block's
  // headline progress figure always measured a full build week against the
  // deliberately halved deload, so the honest climb line was unreachable
  // and a user who added weight every week was told they lifted less at the
  // end than the start. The deload week is stored on the row
  // (deload_week, written by activatePlanWithBlock), so the comparison uses
  // the last ACCUMULATION week instead. Falls back to the old window only
  // when the block carries no deload week (legacy rows).
  const deloadWeek = Number(meso.deload_week);
  const plannedWeeks = Number(meso.planned_weeks ?? meso.duration_weeks);
  const lastAccumWeek = Number.isFinite(deloadWeek) && deloadWeek > 1
    ? deloadWeek - 1
    : (Number.isFinite(plannedWeeks) && plannedWeeks > 1 ? plannedWeeks - 1 : null);
  const lastWeekStart = lastAccumWeek != null
    ? startMs + (lastAccumWeek - 1) * 7 * 86400000
    : endMs - 7 * 86400000;
  const lastWeekEnd = lastAccumWeek != null
    ? lastWeekStart + 7 * 86400000
    : Number.POSITIVE_INFINITY;
  const lastWeekSets = sets.filter(s => {
    const w = workouts.find(w2 => w2.id === s.workout_id);
    return w && w.started_at >= lastWeekStart && w.started_at < lastWeekEnd;
  });
  const firstTonnage = firstWeekSets.reduce((t, s) => t + s.weight * s.actual_reps, 0);
  const lastTonnage = lastWeekSets.reduce((t, s) => t + s.weight * s.actual_reps, 0);
  const tonnageDelta = firstTonnage > 0 ? Math.round(((lastTonnage - firstTonnage) / firstTonnage) * 100) : null;

  // Most-trained muscle (by set count)
  const muscleCounts = {};
  for (const s of sets) {
    const key = s.exercise_name ?? 'Unknown';
    muscleCounts[key] = (muscleCounts[key] ?? 0) + 1;
  }
  const topExercise = Object.entries(muscleCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  // Average session duration
  const avgDuration = workouts.length > 0
    ? Math.round(workouts.reduce((s, w) => s + (w.duration_minutes ?? 0), 0) / workouts.length)
    : 0;

  // Best session by total volume
  const bestSession = workouts.reduce((best, w) => {
    const v = w.total_volume ?? 0;
    return v > (best?.volume ?? 0) ? { startedAt: w.started_at, volume: v, duration: w.duration_minutes } : best;
  }, null);

  // PRs during this block, compute best estimated 1RM per exercise from the
  // block's logged sets (no local personal_records table, see comment above).
  const blockBestByExercise = new Map();
  for (const s of sets) {
    if (!s.exercise_name) continue;
    const e1rm = calculate1RM(s.weight || 0, s.actual_reps || 0);
    if (!e1rm) continue;
    const prev = blockBestByExercise.get(s.exercise_name);
    if (!prev || e1rm > prev.value) {
      blockBestByExercise.set(s.exercise_name, {
        record_type: '1rm_estimate',
        value: parseFloat(e1rm.toFixed(1)),
        reps: s.actual_reps,
        exercise_name: s.exercise_name,
      });
    }
  }
  const prs = Array.from(blockBestByExercise.values())
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  return {
    meso: rowToCamel(meso),
    totalSessions,
    totalSets,
    tonnage: Math.round(tonnage),
    tonnageDelta,
    topExercise,
    avgDuration,
    bestSession,
    prs: prs.map(rowToCamel),
    startDate: meso.start_date,
    endDate: meso.end_date,
  };
}

// ─── Pro: Coach Outputs ───────────────────────────────────────────────────────

/**
 * Preserve confirm-then-apply state across CoachOutputScreen.load()'s remount
 * re-save. load() writes a fresh runWeeklyCoach() result on every mount, and
 * that result never carries appliedAdjustments (only markApplied writes them,
 * at the moment of an Apply tap). saveCoachOutput keys on (user_id, week_start),
 * so its UPDATE only ever hits the SAME week's row; carrying that row's
 * already-applied map forward keeps the "Applied" history and everything that
 * reads it (isApplied, the diary coach-receipt chip) intact. A genuine apply
 * still lands, because markApplied's own save DOES carry the map, and an
 * incoming map wins outright over the stored one.
 *
 * Pure and exported so the merge is regression-testable without a SQL engine
 * (repo convention: raw CRUD is exercised on device).
 * @param {string} existingOutputJson the stored row's output_json (may be null)
 * @param {object} data the incoming coach output about to be written
 * @returns {object} the object to persist
 */
export function preserveAppliedAdjustments(existingOutputJson, data) {
  let previous = null;
  try { previous = JSON.parse(existingOutputJson) ?? null; }
  catch { previous = null; } // unreadable stored JSON: keep data as-is
  if (!previous) return data;

  // Both maps are deliberate user actions. A routine same-week recompute has
  // neither, so replacing output_json wholesale must not erase either one.
  // Preserve them independently: applying one domain must not clear a decline
  // already recorded for another, and a genuine incoming action still wins.
  let merged = data;
  for (const key of ['appliedAdjustments', 'declinedAdjustments']) {
    if (!data?.[key] && previous?.[key]) merged = { ...merged, [key]: previous[key] };
  }
  return merged;
}

async function saveCoachOutputInTx(d, userId, data) {
  const now = Date.now();
  const existing = await d.getFirstAsync(
    'SELECT id, output_json FROM coach_outputs WHERE user_id = ? AND week_start = ?',
    [userId, data.weekStart],
  );
  if (existing?.id) {
    const toStore = preserveAppliedAdjustments(existing.output_json, data);
    await d.runAsync(
      `UPDATE coach_outputs SET
        goal_phase = ?, volume_signal = ?, load_signal = ?, recovery_flag = ?,
        calorie_change = ?, steps_target = ?, why_this = ?, output_json = ?,
        applied = ?, updated_at = ?
       WHERE id = ?`,
      [
        data.goalPhase ?? null, data.volumeSignal ?? null, data.loadSignal ?? null,
        data.recoveryFlag ?? null,
        data.adjustments?.calories?.change ?? null,
        data.adjustments?.steps?.target ?? null,
        // Campaign 1 P0-8 D7: write updated_at on every save. It was never
        // set, so the push stamped now() each cycle (laundering age) and
        // an applied receipt could not win a cross-device comparison.
        // C6 RC6-2 (D97-25): the applied COLUMN is derived from the JSON
        // receipt on every save - it previously had NO local writer at
        // all, so every production cloud row carried applied = false and
        // v71's tiebreak, migrate_135's corrected S-14 predicate and the
        // reinstall E2E's receipt assertion were all inert. Deriving it
        // here (never set independently) means the column and the JSON
        // can never disagree.
        data.whyThisWeek ?? null, JSON.stringify(toStore),
        toStore?.appliedAdjustments && Object.keys(toStore.appliedAdjustments).length ? 1 : 0,
        now, existing.id,
      ],
    );
    return existing.id;
  }
  const json = JSON.stringify(data);
  // Campaign 1 review finding 10: deterministic identity. Every device
  // mints the SAME id for the same user-week, so cloud upserts on
  // (user_id, id) converge on one row and the LWW applier's receipt
  // propagation actually meets the other device's row. Legacy uid() rows
  // are found by the (user_id, week_start) lookup above and deduped by
  // local migration v71's unique index.
  const id = `co_${data.weekStart}_${userId}`;
  await d.runAsync(
    `INSERT INTO coach_outputs
      (id, user_id, week_start, goal_phase, volume_signal, load_signal, recovery_flag,
       calorie_change, steps_target, why_this, output_json, applied, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, userId, data.weekStart,
      data.goalPhase ?? null, data.volumeSignal ?? null, data.loadSignal ?? null,
      data.recoveryFlag ?? null,
      data.adjustments?.calories?.change ?? null,
      data.adjustments?.steps?.target ?? null,
      data.whyThisWeek ?? null, json,
      // C6 RC6-2 (D97-25): applied derived from the JSON at birth too.
      data?.appliedAdjustments && Object.keys(data.appliedAdjustments).length ? 1 : 0,
      now,
    ],
  );
  // Campaign 1 P0-8 D7: stamp updated_at at birth too (same honest-age
  // rule as the UPDATE branch above).
  await d.runAsync('UPDATE coach_outputs SET updated_at = ? WHERE id = ?', [now, id]);
  return id;
}

export async function saveCoachOutput(userId, data) {
  const d = await db();
  const id = await saveCoachOutputInTx(d, userId, data);
  _scheduleSync();
  return id;
}

function validateCoachVolumeChanges(changes) {
  if (!Array.isArray(changes)) throw new Error('Coach volume changes must be an array.');
  const muscles = new Set();
  for (const change of changes) {
    if (!change || typeof change.muscle !== 'string' || !change.muscle.trim()
      || muscles.has(change.muscle)
      || !Number.isInteger(change.plannedSets) || change.plannedSets < 0 || change.plannedSets > 100) {
      throw new Error('Coach volume changes are malformed.');
    }
    for (const key of ['mev', 'mav', 'mrv']) {
      if (change[key] != null && (!Number.isFinite(change[key]) || change[key] < 0 || change[key] > 100)) {
        throw new Error('Coach volume landmarks are malformed.');
      }
    }
    muscles.add(change.muscle);
  }
}

/**
 * F-07: consequential coach mutation and its applied receipt are one commit.
 * Absolute per-muscle targets plus a deterministic user/week receipt make a
 * retry idempotent; any injected failure rolls back every preceding write.
 */
export async function applyCoachTrainingAdjustmentWithDb(d, {
  userId,
  weekStart,
  mesocycleWeekId,
  changes,
  coachOutput,
  setDeload = false,
}) {
  if (!userId || !mesocycleWeekId || !Number.isFinite(weekStart)
    || coachOutput?.weekStart !== weekStart) {
    throw new Error('Coach adjustment identity is invalid.');
  }
  validateCoachVolumeChanges(changes);
  return runInTransaction(d, async () => {
    const ownedWeek = await d.getFirstAsync(
      `SELECT mw.id FROM mesocycle_weeks mw
       JOIN mesocycles m ON m.id = mw.mesocycle_id
       WHERE mw.id = ? AND m.user_id = ?`,
      [mesocycleWeekId, userId],
    );
    if (!ownedWeek) throw new Error('Coach adjustment target week is not owned by the current account.');

    if (setDeload) await setMesocycleWeekDeloadInTx(d, mesocycleWeekId);
    for (const change of changes) {
      // eslint-disable-next-line no-await-in-loop
      await upsertPlannedMuscleVolumeInTx(d, {
        mesocycleWeekId,
        ...change,
        source: 'coach',
      });
    }
    return saveCoachOutputInTx(d, userId, coachOutput);
  });
}

export async function applyCoachTrainingAdjustmentAtomically(args) {
  const d = await db();
  const receiptId = await applyCoachTrainingAdjustmentWithDb(d, args);
  _scheduleSync();
  return receiptId;
}

export async function getLatestCoachOutput(userId) {
  const d = await db();
  const row = await d.getFirstAsync(
    'SELECT * FROM coach_outputs WHERE user_id = ? ORDER BY week_start DESC LIMIT 1',
    [userId],
  );
  if (!row) return null;
  try { return JSON.parse(row.output_json); } catch { return rowToCamel(row); }
}

// ─── Bulk-sync read helpers ───────────────────────────────────────────────
// Return every row owned by `userId` for a given table, used by sync.js to
// upload the user's complete state to the cloud (idempotent upserts so
// re-running is safe). Kept separate from the paginated/recency-filtered
// reads the UI uses.

export async function getAllRoutineExercisesForUser(userId) {
  const d = await db();
  // Join via routines so we only pull this user's routine exercises.
  const rows = await d.getAllAsync(
    `SELECT re.* FROM routine_exercises re
     JOIN routines r ON r.id = re.routine_id
     WHERE r.user_id = ?`,
    [userId],
  );
  return rows.map(rowToCamel);
}

export async function getAllRoutinesForUser(userId) {
  const d = await db();
  const rows = await d.getAllAsync('SELECT * FROM routines WHERE user_id = ?', [userId]);
  return rows.map(rowToCamel);
}

export async function getAllMesocyclesForUser(userId) {
  const d = await db();
  const rows = await d.getAllAsync('SELECT * FROM mesocycles WHERE user_id = ?', [userId]);
  return rows.map(rowToCamel);
}

export async function getAllMesocycleWeeksForUser(userId) {
  const d = await db();
  const rows = await d.getAllAsync(
    `SELECT mw.* FROM mesocycle_weeks mw
     JOIN mesocycles m ON m.id = mw.mesocycle_id
     WHERE m.user_id = ?`,
    [userId],
  );
  return rows.map(rowToCamel);
}

export async function getAllMorningWeightsForUser(userId) {
  const d = await db();
  // C6 R-8: deliberately INCLUDES soft-deleted rows - this is the sync
  // push's reader, and a deletion must propagate to the cloud tombstone.
  // Every product reader filters deleted_at IS NULL.
  const rows = await d.getAllAsync('SELECT * FROM morning_weights WHERE user_id = ?', [userId]);
  return rows.map(rowToCamel);
}

export async function getAllWeeklyCheckinsForUser(userId) {
  const d = await db();
  const rows = await d.getAllAsync('SELECT * FROM weekly_checkins WHERE user_id = ?', [userId]);
  return rows.map(rowToCamel);
}

export async function getAllCoachOutputsForUser(userId) {
  const d = await db();
  const rows = await d.getAllAsync('SELECT * FROM coach_outputs WHERE user_id = ?', [userId]);
  return rows.map(rowToCamel);
}

export async function getAllBodyMetricsForUser(userId) {
  return bodyMetricsRepository.getAllBodyMetricsForUser(userId);
}

export async function getAllExerciseUserNotesForUser(userId) {
  const d = await db();
  const rows = await d.getAllAsync('SELECT * FROM exercise_user_notes WHERE user_id = ?', [userId]);
  return rows.map(rowToCamel);
}

// ─── Bulk getters for tables that previously didn't sync ──────────────────
// Each returns rows in camelCase ready for the sync push payload.
// They mirror the existing getAllX patterns above.

export async function getAllUserInsightsForUser(userId) {
  const d = await db();
  const rows = await d.getAllAsync('SELECT * FROM user_insights WHERE user_id = ?', [userId]);
  return rows.map(rowToCamel);
}

export async function getAllWorkoutNotesForUser(userId) {
  const d = await db();
  // workout_notes_v2 is the sync-aware table introduced in migration v19.
  //
  // C10B (F3 trace): this table has NO local writer. The lazy migration
  // from the v1 table that an earlier version of this comment described
  // does not exist - WorkoutSummaryScreen never touches it - so this read
  // returns an empty set on every device and the push below is a no-op.
  // It is left in place because the pull applier must keep accepting rows
  // from any older client that did write them.
  //
  // The two note features that DO exist, and why neither is broken:
  //   - the session note a user types on the workout summary is
  //     `workouts.notes`, a column on the workouts row. It syncs with the
  //     workout (pushed in sync.js _pushWorkouts, pulled with a
  //     do-not-clobber-newer-local guard), so it survives reinstall and
  //     reaches a second device.
  //   - "next time" notes are the v1 `workout_notes` table: routine
  //     prompts that expire by shown_count/expires_after_uses. They are
  //     deliberately device-local and ephemeral, not durable user data.
  try {
    const rows = await d.getAllAsync(
      'SELECT * FROM workout_notes_v2 WHERE user_id = ?', [userId],
    );
    return rows.map(rowToCamel);
  } catch (_) { return []; }
}

export async function getAllExerciseGoalsForUser(userId) {
  const d = await db();
  try {
    const rows = await d.getAllAsync('SELECT * FROM exercise_goals WHERE user_id = ?', [userId]);
    return rows.map(rowToCamel);
  } catch (_) { return []; }
}

export async function getAllPeakWeekPlansForUser(userId) {
  const d = await db();
  try {
    const rows = await d.getAllAsync('SELECT * FROM peak_week_plans WHERE user_id = ?', [userId]);
    return rows.map(rowToCamel);
  } catch (_) { return []; }
}

// B4 contest countdown: the show date lives on the user's active
// peak_week_plans row (the column has existed since the table was created;
// these are its first readers/writer). Only show_date is ever written here.
// The countdown does no prep maths (docs/b4-contest-countdown-ed-review).
export async function getActivePeakWeekPlan(userId) {
  const d = await db();
  try {
    const row = await d.getFirstAsync(
      `SELECT * FROM peak_week_plans
       WHERE user_id = ? AND status = 'active' AND deleted_at IS NULL
       ORDER BY updated_at DESC LIMIT 1`,
      [userId],
    );
    return row ? rowToCamel(row) : null;
  } catch (_) { return null; }
}

export async function setPeakWeekShowDate(userId, showDate) {
  const d = await db();
  const existing = await getActivePeakWeekPlan(userId);
  const now = Date.now();
  if (existing) {
    await d.runAsync(
      'UPDATE peak_week_plans SET show_date = ?, updated_at = ? WHERE id = ?',
      [showDate ?? null, now, existing.id],
    );
    return existing.id;
  }
  if (!showDate) return null; // nothing to clear
  const id = uid();
  await d.runAsync(
    `INSERT INTO peak_week_plans (id, user_id, show_date, status, created_at, updated_at)
     VALUES (?, ?, ?, 'active', ?, ?)`,
    [id, userId, showDate, now, now],
  );
  return id;
}

export async function getAllPlannedMuscleVolumeForUser(userId) {
  const d = await db();
  try {
    // The primary planned_muscle_volume table has no user_id column, so
    // we JOIN through mesocycle_weeks → mesocycles to filter. Previously
    // this read from the _sync mirror, which was only populated by
    // cloud pulls, so locally-computed planned volumes never reached
    // the cloud and were lost on cross-device restore.
    const rows = await d.getAllAsync(
      `SELECT pmv.*, m.user_id AS user_id
       FROM planned_muscle_volume pmv
       JOIN mesocycle_weeks mw ON mw.id = pmv.mesocycle_week_id
       JOIN mesocycles m ON m.id = mw.mesocycle_id
       WHERE m.user_id = ?`,
      [userId],
    );
    return rows.map(rowToCamel);
  } catch (_) { return []; }
}

export async function getAllAdaptationEventsForUser(userId) {
  const d = await db();
  try {
    // Same shape as getAllPlannedMuscleVolumeForUser: the primary
    // adaptation_events table has no user_id column, so we JOIN through
    // mesocycle_weeks → mesocycles. Reading from the _sync mirror only
    // ever returned cloud-pulled rows, never the locally-written ones,
    // which meant adaptation decisions never reached the cloud.
    const rows = await d.getAllAsync(
      `SELECT ae.*, m.user_id AS user_id
       FROM adaptation_events ae
       JOIN mesocycle_weeks mw ON mw.id = ae.mesocycle_week_id
       JOIN mesocycles m ON m.id = mw.mesocycle_id
       WHERE m.user_id = ?`,
      [userId],
    );
    return rows.map(rowToCamel);
  } catch (_) { return []; }
}

// ─── Bulk-sync write helpers (used by pullFromCloud) ──────────────────────
// Insert OR IGNORE so a cloud restore doesn't overwrite a row that's already
// locally updated. Each function takes a row in camelCase as it comes back
// from Supabase via Volyume's existing snake_case→camel mapper.

export async function insertRoutineFromCloud(userId, r) {
  const d = await db();
  const tsMs = (v) => {
    if (v == null) return null;
    const n = typeof v === 'number' ? v : new Date(v).getTime();
    return Number.isFinite(n) ? n : null;
  };
  // Campaign 1 P0-8 D3: last-write-wins instead of INSERT OR IGNORE.
  // The old IGNORE meant a routine renamed or re-ordered on one device
  // never reconciled on a device that already held the row, so the two
  // devices disagreed about the routine for good. A newer cloud row now
  // updates the synced columns in place; local-only columns
  // (is_template, deleted_at) are left untouched because the UPDATE
  // never names them. Timestamps are preserved rather than re-stamped,
  // so a pulled row cannot be re-pushed as if it had just been edited.
  const cloudUpdated = tsMs(r.updated_at ?? r.updatedAt);
  const existing = await d.getFirstAsync(
    'SELECT updated_at FROM routines WHERE id = ?', [r.id],
  ).catch(() => null);
  const createdAt = tsMs(r.created_at ?? r.createdAt) ?? Date.now();
  if (existing) {
    // Without a cloud timestamp the row cannot prove it is fresher than
    // the local copy, so it must not replace one.
    if (cloudUpdated == null) return;
    if (Number(existing.updated_at ?? 0) >= cloudUpdated) return;
    await d.runAsync(
      `UPDATE routines SET
        user_id = ?, name = ?, description = ?, split_type = ?, day_of_week = ?,
        is_active = ?, is_library = ?, is_sample = ?, source_routine_id = ?,
        programme_id = ?, position = ?, updated_at = ?
       WHERE id = ?`,
      [
        userId, r.name, r.description ?? null,
        r.split_type ?? r.splitType ?? null,
        r.day_of_week ?? r.dayOfWeek ?? null,
        r.is_active ?? r.isActive ?? 1,
        r.is_library ?? r.isLibrary ?? 0,
        r.is_sample ?? r.isSample ?? 0,
        r.source_routine_id ?? r.sourceRoutineId ?? null,
        r.programme_id ?? r.programmeId ?? null,
        r.position ?? null,
        cloudUpdated, r.id,
      ],
    );
    return;
  }
  await d.runAsync(
    `INSERT OR IGNORE INTO routines
      (id, user_id, name, description, split_type, day_of_week, is_active,
       is_library, is_sample, source_routine_id, programme_id, position, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      r.id, userId, r.name, r.description ?? null, r.split_type ?? r.splitType ?? null,
      r.day_of_week ?? r.dayOfWeek ?? null,
      r.is_active ?? r.isActive ?? 1,
      r.is_library ?? r.isLibrary ?? 0,
      r.is_sample ?? r.isSample ?? 0,
      r.source_routine_id ?? r.sourceRoutineId ?? null,
      r.programme_id ?? r.programmeId ?? null,
      // position may be absent on a cloud row pulled before migrate_113 lands;
      // null falls back to created_at ordering (getRoutinesForPlan).
      r.position ?? null,
      createdAt,
      cloudUpdated ?? createdAt,
    ],
  );
}

export async function insertProgrammeFromCloud(userId, p) {
  const d = await db();
  const tsMs = (v) => {
    if (v == null) return null;
    const n = typeof v === 'number' ? v : new Date(v).getTime();
    return Number.isFinite(n) ? n : null;
  };
  // Campaign 1 P0-8 D2: last-write-wins instead of INSERT OR IGNORE.
  // The old IGNORE meant a plan activation made on one device
  // (setActivePlan flips is_active) could NEVER reach a device that
  // already held the row - so the two devices disagreed about which
  // plan is active, permanently. A newer cloud row now updates the
  // synced columns in place; local-only columns (tags, split_type,
  // next_workout_index, difficulty, deleted_at) survive untouched
  // because the UPDATE never names them. C6 P44-03 (D97): is_archived
  // now SYNCS (push + both pull branches) - the old local-only list
  // here wrongly named folder_id too, which has synced since 089.
  const cloudUpdated = tsMs(p.updated_at);
  const existing = await d.getFirstAsync(
    'SELECT updated_at FROM programmes WHERE id = ?', [p.id],
  ).catch(() => null);
  const createdAt = tsMs(p.created_at) ?? Date.now();
  if (existing) {
    // Without a cloud timestamp the row cannot prove it is fresher than
    // the local copy, so it must not replace one.
    if (cloudUpdated == null) return;
    if (Number(existing.updated_at ?? 0) >= cloudUpdated) return;
    await d.runAsync(
      `UPDATE programmes SET
        user_id = ?, name = ?, description = ?, is_library = ?, is_active = ?,
        is_archived = ?, source_programme_id = ?, updated_at = ?
       WHERE id = ?`,
      [
        userId, p.name, p.description ?? null,
        p.is_library ? 1 : 0,
        p.is_active ? 1 : 0,
        p.is_archived ? 1 : 0,
        p.source_programme_id ?? null,
        cloudUpdated, p.id,
      ],
    );
    return;
  }
  await d.runAsync(
    `INSERT OR IGNORE INTO programmes
      (id, user_id, name, description, is_library, is_active, is_archived, source_programme_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      p.id, userId, p.name, p.description ?? null,
      p.is_library ? 1 : 0,
      p.is_active ? 1 : 0,
      p.is_archived ? 1 : 0,
      p.source_programme_id ?? null,
      createdAt,
      cloudUpdated ?? createdAt,
    ],
  );
}

export async function insertRoutineExerciseFromCloud(re) {
  const d = await db();
  const tsMs = (v) => {
    if (v == null) return null;
    const n = typeof v === 'number' ? v : new Date(v).getTime();
    return Number.isFinite(n) ? n : null;
  };
  // Campaign 1 P0-8 D3: last-write-wins instead of an ungated INSERT OR
  // REPLACE. The old REPLACE applied the cloud row in EITHER direction,
  // so a pull could revert an exercise the user had just re-ordered or
  // re-repped locally back to the stale cloud copy. The gate runs before
  // the FK heal so a row that will be skipped costs no extra lookups.
  const cloudUpdated = tsMs(re.updated_at);
  const existingRow = await d.getFirstAsync(
    'SELECT updated_at FROM routine_exercises WHERE id = ?', [re.id],
  ).catch(() => null);
  if (existingRow) {
    // Without a cloud timestamp the row cannot prove it is fresher than
    // the local copy, so it must not replace one.
    if (cloudUpdated == null) return;
    if (Number(existingRow.updated_at ?? 0) >= cloudUpdated) return;
  }
  // Heal mismatched canonical IDs at insert time.
  // If the cloud row references an exercise_id that doesn't resolve
  // locally but carries a denormalised exercise_name, look up the
  // local exercise of that name and rewrite the FK. This turns a
  // would-be-broken row into a fully-resolved one without any user
  // action, the cure for the 114-routines-with-zero-exercises bug.
  let exerciseId = re.exercise_id;
  const exerciseName = re.exercise_name ?? null;
  if (exerciseId) {
    const local = await d.getFirstAsync(
      'SELECT 1 FROM exercises WHERE id = ?', [exerciseId],
    );
    if (!local && exerciseName) {
      const byName = await d.getFirstAsync(
        'SELECT id FROM exercises WHERE LOWER(name) = LOWER(?) LIMIT 1',
        [exerciseName],
      );
      if (byName?.id) exerciseId = byName.id;
    }
  }
  const createdAt = tsMs(re.created_at) ?? Date.now();
  if (existingRow) {
    // UPDATE rather than REPLACE so the local-only user_id column
    // survives the reconcile.
    await d.runAsync(
      `UPDATE routine_exercises SET
        routine_id = ?, exercise_id = ?, exercise_name = ?, order_in_routine = ?,
        recommended_sets = ?, recommended_reps_min = ?, recommended_reps_max = ?,
        notes = ?, starting_weight = ?, rest_seconds = ?, superset_group_id = ?,
        selection_reason = ?, group_kind = ?, round_rest_seconds = ?,
        updated_at = ?, deleted_at = ?
       WHERE id = ?`,
      [
        re.routine_id, exerciseId, exerciseName,
        re.order_in_routine ?? 0,
        re.recommended_sets ?? 3,
        re.recommended_reps_min ?? 6,
        re.recommended_reps_max ?? 12,
        re.notes ?? null,
        re.starting_weight ?? null,
        re.rest_seconds ?? null,
        re.superset_group_id ?? null,
        re.selection_reason ?? null,
        // EL-9: absent on a cloud row (column not yet applied, or the push
        // omitted it under CIRCUIT_SYNC_COLUMNS_ENABLED=false) degrades to
        // null - ordinary superset/no-group, same as pre-campaign.
        re.group_kind ?? null,
        re.round_rest_seconds ?? null,
        cloudUpdated,
        tsMs(re.deleted_at),
        re.id,
      ],
    );
    return;
  }
  await d.runAsync(
    `INSERT OR REPLACE INTO routine_exercises
      (id, routine_id, exercise_id, exercise_name, order_in_routine, recommended_sets,
       recommended_reps_min, recommended_reps_max, notes, starting_weight,
       rest_seconds, superset_group_id, selection_reason, group_kind,
       round_rest_seconds, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      re.id, re.routine_id, exerciseId, exerciseName,
      re.order_in_routine ?? 0,
      re.recommended_sets ?? 3,
      re.recommended_reps_min ?? 6,
      re.recommended_reps_max ?? 12,
      re.notes ?? null,
      re.starting_weight ?? null,
      re.rest_seconds ?? null,
      re.superset_group_id ?? null,
      re.selection_reason ?? null,
      re.group_kind ?? null,
      re.round_rest_seconds ?? null,
      createdAt,
      cloudUpdated ?? createdAt,
      // Spelled out rather than routed through tsMs because
      // routineExerciseSoftDelete.guard.test.js pins this exact
      // expression as the "the pull honours a cloud deleted_at" guard.
      re.deleted_at ? new Date(re.deleted_at).getTime() : null,
    ],
  );
}

export async function insertMorningWeightFromCloud(userId, w) {
  if (!userId || !w?.id) return;
  const d = await db();
  const toMs = (t) => (typeof t === 'string' ? new Date(t).getTime() : (t ?? null));
  // Last-write-wins (SYNC-6). The legacy INSERT OR IGNORE never updated an
  // existing local row, so a morning weight edited on another device never
  // reconciled here. Now: insert when there's no local row, otherwise only
  // overwrite when the cloud copy is provably newer.
  const cloudMs = toMs(w.updated_at);
  const existing = await d.getFirstAsync('SELECT updated_at FROM morning_weights WHERE id = ?', [w.id]);
  const localMs = existing?.updated_at ?? null;
  // When a local row exists, skip unless the cloud copy is provably newer.
  // If the cloud row carries no updated_at (e.g. before migration 060 lands,
  // when the cloud table has no such column), we cannot prove it's newer, so we
  // keep the local row rather than clobber a possibly-newer un-pushed local edit
  // (preserves the old non-destructive behaviour until 060 enables real LWW).
  if (existing && (cloudMs == null || (localMs != null && localMs >= cloudMs))) return;
  const createdAt = toMs(w.created_at) ?? Date.now();
  // C6 RC6-3 (D97-25): carry deleted_at through the applier like the
  // sibling appliers do (peak_week_plans under D95, workout_notes) -
  // INSERT OR REPLACE without it returned the column to NULL, so any
  // newer cloud copy resurrected a locally tombstoned weigh-in and the
  // deletion depended entirely on the caller's .is('deleted_at', null)
  // filter holding cloud-side. Morning weights feed the rapid-loss and
  // max-safe-loss gates, so a resurrected row re-enters that series.
  await d.runAsync(
    `INSERT OR REPLACE INTO morning_weights (id, user_id, weight_kg, logged_at, notes, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      w.id, userId, w.weight_kg,
      toMs(w.logged_at) ?? Date.now(),
      w.notes ?? null,
      createdAt,
      cloudMs ?? createdAt,
      toMs(w.deleted_at) ?? null,
    ],
  );
}

// Restores a single body_metrics row from cloud into local SQLite.
// The cloud column names diverge from the local _cm-suffixed naming:
// cloud uses body_weight / waist / chest / hips / quads / arms /
// shoulders / forearms / hamstrings / calves with a DATE-typed
// metric_date instead of an ms epoch logged_at. The previous version
// of this function was reading m.weight_kg / m.thigh_cm / m.arm_cm
// / etc., none of which exist on the cloud row, so every measured
// value came back as null on cross-device restore. The Athlete Hub
// then showed "Body metrics: No entries yet" even though the user had
// dutifully logged dozens of weigh-ins.
//
// INSERT OR REPLACE so the per-table sync handler's LWW gate
// (src/lib/sync/tables/bodyComposition.js) gets the overwrite it
// expects when the cloud row beats local. Without the REPLACE the
// pull would never actually update an existing row.
export async function insertBodyMetricFromCloud(userId, m) {
  return bodyMetricsRepository.insertBodyMetricFromCloud(userId, m);
}

// INSERT OR REPLACE, the per-table sync handler at
// src/lib/sync/tables/weeklyCheckins.js applies the LWW gate
// before calling this. Without the REPLACE a cloud edit to an
// already-synced row would never land locally.
export async function insertWeeklyCheckinFromCloud(userId, c) {
  const d = await db();
  const tsToMs = (v) => v == null ? null : (typeof v === 'string' ? new Date(v).getTime() : v);
  await d.runAsync(
    `INSERT OR REPLACE INTO weekly_checkins
      (id, user_id, week_start, energy_score, soreness_score, stress_score, sleep_hours,
       cals_adherence, steps_adherence, cardio_adherence, steps_avg, cycle_override, notes,
       training_performance, joint_pain, sore_muscles, sleep_quality, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      c.id, userId, c.week_start,
      c.energy_score ?? null, c.soreness_score ?? null, c.stress_score ?? null,
      c.sleep_hours ?? null, c.cals_adherence ?? null, c.steps_adherence ?? null,
      c.cardio_adherence ?? null, c.steps_avg ?? null,
      // C5-P20-01 tri-state: a cloud null stays null (never asked).
      c.cycle_override == null ? null : (c.cycle_override ? 1 : 0), c.notes ?? null,
      c.training_performance ?? null,
      // Campaign 1 P0-4 tri-state: a cloud null stays null (unanswered).
      c.joint_pain == null ? null : (c.joint_pain ? 1 : 0),
      c.sore_muscles ?? null,
      c.sleep_quality ?? null,
      Date.now(),
      tsToMs(c.updated_at) ?? Date.now(),
    ],
  );
}

export async function insertCoachOutputFromCloud(userId, co) {
  const d = await db();
  // Campaign 1 P0-8 D7/D8: last-write-wins instead of INSERT OR IGNORE.
  // The old IGNORE meant an applied receipt (appliedAdjustments inside
  // output_json, plus the applied flag) could NEVER update an existing
  // local row - so device B's Apply button stayed live after device A had
  // already applied, and with the planned-volume restore fixed (P0-1)
  // that became a real double-apply path. A newer cloud row now updates
  // the synced fields in place; derived columns (recovery_flag etc.) are
  // re-populated from the JSON so restored history keeps feeding readers
  // like getDeloadSuggestedWeekStarts instead of landing NULL.
  const tsMs = (v) => {
    if (v == null) return null;
    const n = typeof v === 'number' ? v : new Date(v).getTime();
    return Number.isFinite(n) ? n : null;
  };
  const cloudUpdated = tsMs(co.updated_at) ?? tsMs(co.created_at) ?? Date.now();
  const existing = await d.getFirstAsync(
    'SELECT updated_at, output_json FROM coach_outputs WHERE id = ?', [co.id],
  ).catch(() => null);
  if (existing && Number(existing.updated_at ?? 0) >= cloudUpdated) return;
  let parsed = null;
  try { parsed = co.output_json ? JSON.parse(co.output_json) : null; } catch (_) { parsed = null; }
  if (existing) {
    // C6 RC6-1 (D97-25): the applied-receipt RATCHET. A newer cloud row
    // that carries no appliedAdjustments (the other device merely VIEWED
    // the week - the on-view save re-stamps updated_at) must never clear
    // a local receipt: without this, the device that applied re-armed
    // its own Apply buttons on the next pull and the change could be
    // applied twice. Same one-way posture as the calm ratchet and the
    // insight-dismissal ratchet (D97-19 F5), reusing the already-pinned
    // preserveAppliedAdjustments merge. The applied column is derived
    // from the merged JSON (RC6-2) so the two can never disagree.
    const merged = parsed
      ? preserveAppliedAdjustments(existing.output_json, parsed)
      : parsed;
    const mergedJson = merged ? JSON.stringify(merged) : co.output_json;
    const appliedFlag = merged?.appliedAdjustments && Object.keys(merged.appliedAdjustments).length
      ? 1 : (co.applied ? 1 : 0);
    await d.runAsync(
      `UPDATE coach_outputs SET
        output_json = ?, applied = ?, updated_at = ?,
        goal_phase = COALESCE(?, goal_phase),
        volume_signal = COALESCE(?, volume_signal),
        load_signal = COALESCE(?, load_signal),
        recovery_flag = COALESCE(?, recovery_flag),
        calorie_change = COALESCE(?, calorie_change),
        steps_target = COALESCE(?, steps_target),
        why_this = COALESCE(?, why_this)
       WHERE id = ?`,
      [
        mergedJson, appliedFlag, cloudUpdated,
        parsed?.goalPhase ?? null,
        parsed?.volumeSignal ?? null,
        parsed?.loadSignal ?? null,
        parsed?.recoveryFlag ?? null,
        parsed?.adjustments?.calories?.change ?? null,
        parsed?.adjustments?.steps?.target ?? null,
        parsed?.whyThisWeek ?? null,
        co.id,
      ],
    );
    return;
  }
  const inserted = await d.runAsync(
    `INSERT OR IGNORE INTO coach_outputs
      (id, user_id, week_start, output_json, applied,
       goal_phase, volume_signal, load_signal, recovery_flag,
       calorie_change, steps_target, why_this, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      co.id, userId, co.week_start, co.output_json,
      co.applied ? 1 : 0,
      parsed?.goalPhase ?? null,
      parsed?.volumeSignal ?? null,
      parsed?.loadSignal ?? null,
      parsed?.recoveryFlag ?? null,
      parsed?.adjustments?.calories?.change ?? null,
      parsed?.adjustments?.steps?.target ?? null,
      parsed?.whyThisWeek ?? null,
      tsMs(co.created_at) ?? Date.now(),
      cloudUpdated,
    ],
  );
  // C6 RC6-10 (D97-25): a v71 unique-index collision here (a legacy
  // uid() row already holds this user-week) silently discarded the
  // cloud row AND its receipt with no trace. v72 re-ids the known
  // population; this line makes any escapee diagnosable from Debug
  // logs instead of invisible. Observability only, no behaviour change.
  if ((inserted?.changes ?? 1) === 0) {
    logWarn('database.insertCoachOutputFromCloud', 'cloud coach output discarded by unique index', {
      id: co.id, weekStart: co.week_start,
    });
  }
}

// Upserts nutrition_targets from a cloud row. Local table has one row
// per user (enforced by saveNutritionTargets), so an UPDATE wins if the
// user already has a local row and the cloud copy is newer.
export async function insertNutritionTargetsFromCloud(userId, t) {
  const d = await db();
  // C6 RC6-9 (D97-25): a cloud row with NO updated_at used to be
  // stamped Date.now() and therefore always won, so an unprovable row
  // could overwrite live calorie targets. Three sibling appliers
  // (morning weights, mesocycles, coach outputs) explicitly refuse in
  // that case; this is a calorie surface, so it gets the same rule:
  // when a local row exists and the cloud copy cannot prove it is
  // newer, keep the local row. A first restore with no local row still
  // lands the cloud copy.
  const cloudStampMs = typeof t.updated_at === 'string'
    ? new Date(t.updated_at).getTime()
    : (t.updated_at ?? null);
  const updatedAt = Number.isFinite(cloudStampMs) ? cloudStampMs : Date.now();
  const createdAt = typeof t.created_at === 'string'
    ? new Date(t.created_at).getTime()
    : (t.created_at ?? updatedAt);
  const warningsStr = t.warnings == null
    ? null
    : (typeof t.warnings === 'string' ? t.warnings : JSON.stringify(t.warnings));

  const existing = await d.getFirstAsync(
    'SELECT id, updated_at FROM nutrition_targets WHERE user_id = ? LIMIT 1',
    [userId],
  );
  if (existing) {
    if (!Number.isFinite(cloudStampMs)) return; // unprovable: keep local (RC6-9)
    if ((existing.updated_at ?? 0) >= updatedAt) return;
    await d.runAsync(
      `UPDATE nutrition_targets SET
        bmr=?, tdee=?, target_kcal=?, protein_g=?, carbs_g=?, fat_g=?,
        phase=?, bmr_method=?, activity_level=?, confidence=?, warnings=?,
        gdpr_consented=?, goal=?, protein_approach=?, updated_at=?
       WHERE user_id=?`,
      [
        t.bmr ?? null, t.tdee ?? null, t.target_kcal ?? null,
        t.protein_g ?? null, t.carbs_g ?? null, t.fat_g ?? null,
        t.phase ?? null, t.bmr_method ?? null, t.activity_level ?? null,
        t.confidence ?? null, warningsStr,
        t.gdpr_consented ? 1 : 0,
        t.goal ?? null, t.protein_approach ?? null,
        updatedAt, userId,
      ],
    );
    return;
  }
  const id = t.id || uid();
  await d.runAsync(
    `INSERT OR IGNORE INTO nutrition_targets
      (id, user_id, bmr, tdee, target_kcal, protein_g, carbs_g, fat_g,
       phase, bmr_method, activity_level, confidence, warnings,
       gdpr_consented, goal, protein_approach, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, userId,
      t.bmr ?? null, t.tdee ?? null, t.target_kcal ?? null,
      t.protein_g ?? null, t.carbs_g ?? null, t.fat_g ?? null,
      t.phase ?? null, t.bmr_method ?? null, t.activity_level ?? null,
      t.confidence ?? null, warningsStr,
      t.gdpr_consented ? 1 : 0,
      t.goal ?? null, t.protein_approach ?? null,
      createdAt, updatedAt,
    ],
  );
}

export async function getCoachOutputHistory(userId, limit = 52) {
  const d = await db();
  const rows = await d.getAllAsync(
    `SELECT week_start, output_json FROM coach_outputs
     WHERE user_id = ? AND deleted_at IS NULL
     ORDER BY week_start DESC LIMIT ?`,
    [userId, limit],
  );
  return rows.map(r => {
    let parsed = {};
    try { parsed = JSON.parse(r.output_json) ?? {}; } catch { /* ignore */ }
    return { weekStart: r.week_start, ...parsed };
  });
}

// ─── Cloud restore helpers (used by sync.js pullFromCloud) ────────────────────

export async function insertWorkoutFromCloud(userId, w) {
  const d = await db();
  const toMs = iso => iso ? new Date(iso).getTime() : null;
  // Last-write-wins: don't let a stale cloud copy clobber a newer local
  // edit. The legacy REPLACE had no guard, so a pull after a failed push
  // (SYNC-1) reverted local workout edits. Only skip when both sides have a
  // timestamp and local is at least as new (matches the migrated-table gate).
  const cloudMs = toMs(w.updated_at);
  const existing = await d.getFirstAsync('SELECT updated_at FROM workouts WHERE id = ?', [w.id]);
  const localMs = existing?.updated_at ?? null;
  if (localMs && cloudMs && localMs >= cloudMs) return;
  // Must stay column-symmetric with _upsertWorkout in sync.js.
  // Missing columns here silently drop user-entered fields on
  // cross-device restore.
  await d.runAsync(
    `INSERT OR REPLACE INTO workouts
      (id, user_id, routine_id, mesocycle_id, mesocycle_week_id,
       started_at, ended_at, duration_minutes,
       notes, name, pre_workout_intent,
       session_difficulty, overall_pump, soreness_24h_before, fatigue_level, joint_discomfort,
       sleep_quality, energy_score,
       set_count, total_volume,
       is_completed, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)`,
    [
      w.id, userId, w.routine_id ?? null, w.mesocycle_id ?? null, w.mesocycle_week_id ?? null,
      // started_at falls back to now when the cloud row carries none, so a
      // restored workout never lands with a NULL/epoch start that renders as a
      // 1970 date in history and lift-progress. ended_at can legitimately be
      // null (an unfinished session), so it keeps no fallback.
      toMs(w.started_at) ?? Date.now(), toMs(w.ended_at), w.duration_minutes ?? null,
      w.notes ?? null, w.name ?? null, w.pre_workout_intent ?? null,
      w.session_difficulty ?? null, w.overall_pump ?? null,
      w.soreness_24h_before ?? null, w.fatigue_level ?? null, w.joint_discomfort ?? null,
      // COMP-008 pre-workout readiness, column-symmetric with _upsertWorkout.
      w.sleep_quality ?? null, w.energy_score ?? null,
      w.set_count ?? null, w.total_volume ?? null,
      toMs(w.started_at) ?? Date.now(), cloudMs ?? Date.now(),
    ],
  );
}

export async function insertMesocycleFromCloud(userId, m) {
  const d = await db();
  const tsMs = (v) => {
    if (v == null) return null;
    const n = typeof v === 'number' ? v : new Date(v).getTime();
    return Number.isFinite(n) ? n : null;
  };
  // Stage 6 (2026-08-09): INSERT OR REPLACE would WIPE a locally-computed
  // Block Ledger whenever the cloud row predates migrate_131 (or was
  // pushed by an older build). The ledger is NOT derivable, so preserve
  // the local value when the cloud carries none.
  const existing = await d.getFirstAsync(
    'SELECT block_ledger, updated_at, created_at FROM mesocycles WHERE id = ?', [m.id],
  ).catch(() => null);
  // Campaign 1 P0-8 D1: last-write-wins. A stale device's echo of an old
  // mesocycle row (old is_active, no ledger) must never overwrite a newer
  // local one - that path could re-activate a COMPLETED block and undo
  // the user's decision. Without a cloud timestamp the row cannot prove
  // freshness over an existing local row, so it does not replace one.
  const cloudUpdated = tsMs(m.updated_at);
  if (existing) {
    if (cloudUpdated == null) return;
    if (Number(existing.updated_at ?? 0) >= cloudUpdated) return;
  }
  // Campaign 1 P0-8 D5: preserve the row's REAL timestamps. Stamping
  // Date.now() into created_at destroyed block ordering (created_at is
  // the tiebreak for getActiveBlock and getAchievedWeeklyPeaks) and
  // stamping updated_at laundered old content as fresh on the next push.
  const createdAt = tsMs(m.created_at) ?? (Number(existing?.created_at) || Date.now());
  const updatedAt = cloudUpdated ?? Date.now();
  // C6 RC6-4 (D97-25): a newer cloud row must not replace a local Block
  // Ledger of the SAME LEDGER_VERSION - the runner's idempotency is
  // per-device, so the device that pulled less of the block's evidence
  // could classify INSUFFICIENT_DATA where this one judged RESPONSIVE,
  // and whichever wrote last would seed the next block from the poorer
  // judgement. Same-version means same rules over this block; the
  // deterministic engine makes same-evidence ledgers identical, so
  // keeping the local one costs nothing when the devices agree and
  // protects this device's fuller judgement when they do not. A cloud
  // ledger of a DIFFERENT version (newer rules) still replaces.
  const incomingLedger = m.block_ledger != null
    ? (typeof m.block_ledger === 'string' ? m.block_ledger : JSON.stringify(m.block_ledger))
    : null;
  let ledgerToStore = incomingLedger ?? (existing?.block_ledger ?? null);
  if (incomingLedger && existing?.block_ledger) {
    try {
      const localVersion = JSON.parse(existing.block_ledger)?.version;
      const cloudVersion = JSON.parse(incomingLedger)?.version;
      if (localVersion != null && localVersion === cloudVersion) {
        ledgerToStore = existing.block_ledger;
      }
    } catch (_) { /* unreadable JSON: fall through to the incoming copy */ }
  }
  await d.runAsync(
    `INSERT OR REPLACE INTO mesocycles
      (id, user_id, name, start_date, end_date, duration_weeks, planned_weeks,
       focus, block_type, rir_ladder, is_active, auto_regulation_enabled,
       deload_week, block_ledger, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      m.id, userId, m.name ?? null,
      m.start_date ?? null, m.end_date ?? null,
      m.duration_weeks ?? null, m.planned_weeks ?? m.duration_weeks ?? null,
      m.focus ?? null, m.block_type ?? null,
      m.rir_ladder ?? null,
      m.is_active ? 1 : 0,
      m.auto_regulation_enabled ? 1 : 0,
      // The cloud has NO deload_week column (confirmed absent from every
      // supabase/migrate_*.sql), so m.deload_week is always undefined here and
      // a bare `?? null` would WIPE the locally-derived value on every session
      // restore -- undoing both activatePlanWithBlock's write and the v68
      // backfill, and re-killing the deload highlighting after one sync.
      //
      // No cloud migration is needed to fix that, because this value is
      // DERIVABLE: generateMesocycleWeeks makes the LAST week the deload
      // unconditionally, which is the same certain derivation v68 uses. Fall
      // back to the schedule length rather than to null.
      m.deload_week ?? m.planned_weeks ?? m.duration_weeks ?? null,
      // jsonb arrives as an OBJECT from supabase-js; the local column is
      // TEXT, so stringify on the way in (and keep a plain string as-is).
      // Resolution above (RC6-4): cloud-null preserves local; same
      // LEDGER_VERSION keeps local; a different version replaces.
      ledgerToStore,
      createdAt, updatedAt,
    ],
  );
}

export async function insertMesocycleWeekFromCloud(w) {
  const d = await db();
  // Campaign 1 review finding 9: weeks DO carry a user edit - the
  // confirm-then-apply early deload writes is_deload/rir_target through
  // setMesocycleWeekDeload - so this applier gets the same LWW gate and
  // timestamp preservation as its siblings. A stale cloud week can no
  // longer revert an applied early deload, and a pulled row keeps the
  // cloud's timestamps instead of masquerading as freshly edited on the
  // next push.
  const tsMsW = (v) => {
    if (v == null) return null;
    const n = typeof v === 'number' ? v : new Date(v).getTime();
    return Number.isFinite(n) ? n : null;
  };
  const cloudUpdatedW = tsMsW(w.updated_at);
  const existingWeek = await d.getFirstAsync(
    'SELECT updated_at, created_at FROM mesocycle_weeks WHERE id = ?', [w.id],
  ).catch(() => null);
  if (existingWeek) {
    if (cloudUpdatedW == null) return;
    if (Number(existingWeek.updated_at ?? 0) >= cloudUpdatedW) return;
  }
  const createdAtW = tsMsW(w.created_at) ?? (Number(existingWeek?.created_at) || Date.now());
  const updatedAtW = cloudUpdatedW ?? Date.now();
  // Cloud uses week_number, local uses week_index. rir_target is
  // NOT NULL locally but isn't on the cloud schema.
  const weekIdx = w.week_number ?? w.week_index ?? 1;
  // Campaign 1 P0-8 D6: derive rir_target from the parent mesocycle's
  // rir_ladder (which DOES round-trip through the cloud), indexed by
  // week. The old flat `is_deload ? 4 : 2` default flattened a
  // generated ladder like [3,2,1,0,0,4] into [2,2,2,2,2,4] after one
  // sync - silently changing what the deterministic engine prescribes.
  // The flat default remains only as the last resort when no ladder
  // exists (legacy rows), which restores the pre-fix behaviour exactly.
  let rirTarget = w.is_deload ? 4 : 2;
  if (!w.is_deload) {
    try {
      const parent = await d.getFirstAsync(
        'SELECT rir_ladder FROM mesocycles WHERE id = ?', [w.mesocycle_id],
      );
      const ladder = parent?.rir_ladder != null
        ? (typeof parent.rir_ladder === 'string' ? JSON.parse(parent.rir_ladder) : parent.rir_ladder)
        : null;
      const fromLadder = Array.isArray(ladder) ? ladder[weekIdx - 1] : null;
      // The null/undefined check must come FIRST: Number(null) is 0 and
      // Number.isFinite(0) is true, so a bare finiteness test set
      // rir_target to 0 ("take every set to failure") on any week whose
      // parent block carries no ladder - harder than the flat default it
      // was meant to fall back to. A real ladder entry of 0 is still
      // honoured, because only null/undefined is rejected here.
      if (fromLadder != null && Number.isFinite(Number(fromLadder))) {
        rirTarget = Number(fromLadder);
      }
    } catch (_) { /* ladder unreadable: keep the flat default */ }
  }
  await d.runAsync(
    `INSERT OR REPLACE INTO mesocycle_weeks
      (id, mesocycle_id, week_index, is_deload, rir_target, notes, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?)`,
    [
      w.id, w.mesocycle_id, weekIdx,
      w.is_deload ? 1 : 0,
      rirTarget,
      w.notes ?? null,
      createdAtW, updatedAtW,
    ],
  );
}

// migrateLocalUserId deleted per IDENTITY_AND_OWNERSHIP_LOCKED.md
// rule 5 ("Sign-in path does not call migrateLocalUserId. That
// function is deleted from database.js in this refactor.") and
// anti-patterns section ("migrateLocalUserId or any function that
// updates user_id on existing rows"). Anonymous mode has been
// removed (rule 1), so by spec local SQLite is empty at signup
// time and there is no row that requires re-keying. Cross-user
// contamination on the same device is prevented by the wipe in
// useAppStore.clearAuthStateForSignOut + RootNavigator.

export async function getProgressionTeaser(userId, lastWorkoutId, prevWorkoutId) {
  if (!lastWorkoutId || !prevWorkoutId) return null;
  const d = await db();
  const w1Rows = await d.getAllAsync(
    `SELECT ws.exercise_id, e.name, MAX(ws.weight) as max_weight
     FROM workout_sets ws
     JOIN exercises e ON e.id = ws.exercise_id
     WHERE ws.workout_id = ? AND ws.set_type != 'warmup' AND ws.weight > 0
     GROUP BY ws.exercise_id`,
    [lastWorkoutId],
  );
  if (w1Rows.length === 0) return null;
  const w2Rows = await d.getAllAsync(
    `SELECT ws.exercise_id, MAX(ws.weight) as max_weight
     FROM workout_sets ws
     WHERE ws.workout_id = ? AND ws.set_type != 'warmup' AND ws.weight > 0
     GROUP BY ws.exercise_id`,
    [prevWorkoutId],
  );
  const w2Map = Object.fromEntries(w2Rows.map(r => [r.exercise_id, r.max_weight]));
  let progressed = null;
  let stalled = null;
  for (const row of w1Rows) {
    const prev = w2Map[row.exercise_id];
    if (prev == null) continue;
    if (row.max_weight > prev && !progressed) progressed = row.name;
    else if (row.max_weight <= prev && !stalled) stalled = row.name;
    if (progressed && stalled) break;
  }
  return { progressed, stalled };
}

export async function insertWorkoutSetFromCloud(userId, s) {
  const d = await db();
  // Same self-heal as insertRoutineExerciseFromCloud: rewrite the FK
  // via name lookup when the original exercise_id doesn't resolve
  // locally. Crucial for restoring historical workouts cleanly across
  // devices.
  let exerciseId = s.exercise_id;
  const exerciseName = s.exercise_name ?? null;
  if (exerciseId) {
    const local = await d.getFirstAsync(
      'SELECT 1 FROM exercises WHERE id = ?', [exerciseId],
    );
    if (!local && exerciseName) {
      const byName = await d.getFirstAsync(
        'SELECT id FROM exercises WHERE LOWER(name) = LOWER(?) LIMIT 1',
        [exerciseName],
      );
      if (byName?.id) exerciseId = byName.id;
    }
  }
  // Last-write-wins, same as insertWorkoutFromCloud: a stale cloud set must
  // not clobber a newer local edit (RIR, notes, post-set ratings).
  const cloudMs = _tsToMs(s.updated_at);
  const existing = await d.getFirstAsync('SELECT updated_at, created_at FROM workout_sets WHERE id = ?', [s.id]);
  const localMs = existing?.updated_at ?? null;
  if (localMs && cloudMs && localMs >= cloudMs) return;
  // PD-6 (bundle 2 prelude): restore used to stamp Date.now() as
  // created_at, so every restored set's chronology collapsed to restore
  // time and created_at-ordered consumers (the PR path) saw history in
  // the wrong order. Preserve the cloud's stamp; when the cloud carries
  // none, keep the existing local one; only a set with no timestamp
  // anywhere falls back to now. Already-damaged rows whose original
  // stamp never survived are not reconstructable and are left honest.
  const createdAt = _tsToMs(s.created_at) ?? existing?.created_at ?? Date.now();
  await d.runAsync(
    `INSERT OR REPLACE INTO workout_sets
      (id, user_id, workout_id, exercise_id, exercise_name, set_number, set_type,
       target_reps_min, target_reps_max, actual_reps, weight, rir, rpe,
       failed, notes, post_set_pump, post_set_muscle_connection, joint_discomfort,
       is_amrap, amrap_reps, missed_reps, left_reps, right_reps, evidence_class,
       created_at, updated_at, deleted_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      s.id, userId, s.workout_id, exerciseId, exerciseName,
      s.set_number ?? 1, s.set_type ?? 'straight',
      s.target_reps_min ?? null, s.target_reps_max ?? null,
      s.actual_reps ?? 0, s.weight ?? null, s.rir ?? null, s.rpe ?? null,
      s.failed ? 1 : 0, s.notes ?? null,
      s.post_set_pump ?? null, s.post_set_muscle_connection ?? null,
      s.joint_discomfort ?? null,
      s.is_amrap ? 1 : 0, s.amrap_reps ?? null,
      s.missed_reps ?? null,
      s.left_reps ?? null, s.right_reps ?? null,
      // EL-7: absent on a cloud row (column not yet applied, or the push
      // omitted it under CIRCUIT_SYNC_COLUMNS_ENABLED=false) degrades to
      // null - conventional, same as pre-campaign.
      s.evidence_class ?? null,
      createdAt, cloudMs ?? Date.now(),
      s.deleted_at ? new Date(s.deleted_at).getTime() : null,
    ],
  );
}

// ─── Sync helpers for previously local-only tables ────────────────────────
//
// Each helper accepts a raw cloud row (snake_case keys) and writes it
// into the matching local table. INSERT OR REPLACE keeps repeated
// syncs idempotent, re-pulling the same row updates instead of
// double-inserting. Cloud timestamps (ISO strings) are converted to
// the local ms epoch convention.

const _tsToMs = (v) => {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  const ms = Date.parse(String(v));
  return Number.isFinite(ms) ? ms : null;
};

// F5/exercise-restore audit (2026-07-09): the INSERT below intentionally
// carries exercise_type but NOT equipment_category, machine_type, force,
// laterality, difficulty, machine_ok, home_ok, cue or equipment_profiles.
// Those eight are canonical-exercise-library metadata, derived locally by
// deriveExerciseMetadata()/updateExerciseMetadata() in seedExercises.js --
// they are never set on a user-created custom exercise (see
// ExercisePickerModal.handleCreate) and never sent to the cloud by
// syncExercises() (sync.js), and neither the cloud `exercises` nor
// `custom_exercises` table has these columns (migrate_020_custom_exercises.sql
// defines custom_exercises' full column list; no later migration adds them).
// Reading them off `e` here would only ever produce null, so they are left
// out on purpose rather than papering over with dead null-coalesces.
// exercise_type IS a real cloud column on both tables (migrate_091) and IS
// user-settable on a custom exercise (createExerciseType), so it round-trips
// here; syncExercises() (sync.js) now pushes it too, so the value survives
// a full sign-out/sign-in cycle end to end.
// Exercise-library-expansion-2026-09-05 (EL-14/EL-15/07-CORPUS-FORMAT.md
// section 4): the shared same-name id-remap, extracted from
// insertOrUpdateExerciseFromCloud's own inline block so seedExercises.js's
// top-up (the 18 former REQUIRED_EXERCISES rows, id-mismatched under their
// old random uid) and the EL-21 duplicate-retirement pass can reuse the
// exact same rewrite instead of a second hand-copy. Rewrites every table
// that references an exercise by id from `fromId` to `toId`, then deletes
// the now-orphaned `fromId` row. Idempotent: once `fromId`'s row is gone
// (or never existed), the UPDATEs touch zero rows and the DELETE is a
// no-op — safe to call speculatively.
export async function mergeExerciseIdInto(fromId, toId) {
  if (!fromId || !toId || fromId === toId) return;
  const d = await db();
  await d.runAsync('UPDATE routine_exercises SET exercise_id = ? WHERE exercise_id = ?', [toId, fromId]);
  await d.runAsync('UPDATE workout_sets SET exercise_id = ? WHERE exercise_id = ?', [toId, fromId]);
  await d.runAsync(
    'UPDATE exercise_user_notes SET exercise_id = ? WHERE exercise_id = ?',
    [toId, fromId],
  ).catch(() => {});
  await d.runAsync(
    'UPDATE exercise_goals SET exercise_id = ? WHERE exercise_id = ?',
    [toId, fromId],
  ).catch(() => {});
  // Campaign 9: the intent layer's three tables reference exercises too
  // (five id columns between them). Remapped in one helper at the end of
  // this file so an exclusion, a remembered swap or an approved default
  // is not orphaned when two devices' canonical ids merge.
  await remapExerciseIdInIntentTables(d, fromId, toId);
  // Remove the duplicate/retired row now that every reference points at
  // `toId`.
  await d.runAsync('DELETE FROM exercises WHERE id = ?', [fromId]);
  _invalidateExercisesCache();
}

export async function insertOrUpdateExerciseFromCloud(e) {
  if (!e?.id || !e?.name) return;
  const d = await db();
  const now = Date.now();
  // First: check if a local exercise of the same name exists with a
  // DIFFERENT id. If so, rewrite local refs from the local id to the
  // cloud id, then update the exercise row in place. This is how two
  // devices' canonical IDs merge cleanly into one source of truth.
  const sameName = await d.getFirstAsync(
    'SELECT id FROM exercises WHERE LOWER(name) = LOWER(?) AND id != ? LIMIT 1',
    [e.name, e.id],
  );
  if (sameName?.id) {
    await mergeExerciseIdInto(sameName.id, e.id);
  }
  const secondary = (() => {
    if (e.secondary_muscles == null) return null;
    try { return JSON.stringify(e.secondary_muscles); } catch { return null; }
  })();
  // CC27 (bundle defect BD-1): this was INSERT OR REPLACE with a partial
  // column list, and REPLACE resets every UNLISTED column to NULL - so any
  // cloud pull of an existing row silently wiped its derived metadata
  // (equipment_category, machine_type, laterality, difficulty, machine_ok,
  // home_ok, equipment_profiles, selection_reason - and, from CC27, the ten
  // demand columns), with nothing left to restore them (the one-time
  // rederive keys had already burned). Now an UPSERT: unlisted columns
  // survive untouched. Nullable metadata the cloud may not know yet
  // (demand columns, sfr/fatigue - PD-8) updates via COALESCE, so a known
  // local value is never clobbered by a payload that lacks the column,
  // while a real cloud value still wins.
  //
  // PD-8 fix (pull side): fatigue_cost/stimulus_to_fatigue_ratio no longer
  // default to 1/3 - a custom exercise's deliberate NULL stays NULL, and
  // the pool generator treats null as "unknown and never penalised".
  await d.runAsync(
    `INSERT INTO exercises
      (id, name, primary_muscle, secondary_muscles, equipment, movement_pattern,
       compound_isolation, default_rep_min, default_rep_max, fatigue_cost,
       stimulus_to_fatigue_ratio, subregion, is_custom, notes, created_at, updated_at,
       exercise_category, increment_kg, exercise_type, load_semantics,
       position, floor_access, overhead_position, grip_demand, unilateral_loadable,
       bilateral_upper, bilateral_lower, axial_load, impact, balance_demand,
       weight_bearing_hands)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
             ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       primary_muscle = excluded.primary_muscle,
       secondary_muscles = excluded.secondary_muscles,
       equipment = excluded.equipment,
       movement_pattern = excluded.movement_pattern,
       compound_isolation = excluded.compound_isolation,
       default_rep_min = excluded.default_rep_min,
       default_rep_max = excluded.default_rep_max,
       fatigue_cost = COALESCE(excluded.fatigue_cost, fatigue_cost),
       stimulus_to_fatigue_ratio = COALESCE(excluded.stimulus_to_fatigue_ratio, stimulus_to_fatigue_ratio),
       subregion = excluded.subregion,
       is_custom = excluded.is_custom,
       notes = excluded.notes,
       created_at = excluded.created_at,
       updated_at = excluded.updated_at,
       exercise_category = excluded.exercise_category,
       increment_kg = excluded.increment_kg,
       exercise_type = excluded.exercise_type,
       load_semantics = excluded.load_semantics,
       position = COALESCE(excluded.position, position),
       floor_access = COALESCE(excluded.floor_access, floor_access),
       overhead_position = COALESCE(excluded.overhead_position, overhead_position),
       grip_demand = COALESCE(excluded.grip_demand, grip_demand),
       unilateral_loadable = COALESCE(excluded.unilateral_loadable, unilateral_loadable),
       bilateral_upper = COALESCE(excluded.bilateral_upper, bilateral_upper),
       bilateral_lower = COALESCE(excluded.bilateral_lower, bilateral_lower),
       axial_load = COALESCE(excluded.axial_load, axial_load),
       impact = COALESCE(excluded.impact, impact),
       balance_demand = COALESCE(excluded.balance_demand, balance_demand),
       weight_bearing_hands = COALESCE(excluded.weight_bearing_hands, weight_bearing_hands)`,
    [
      e.id, e.name,
      e.primary_muscle ?? null, secondary,
      e.equipment ?? null, e.movement_pattern ?? null,
      e.compound_isolation ?? null,
      e.default_rep_min ?? null, e.default_rep_max ?? null,
      e.fatigue_cost ?? null, e.stimulus_to_fatigue_ratio ?? null,
      e.subregion ?? null,
      e.is_custom ? 1 : 0, e.notes ?? null,
      _tsToMs(e.created_at) ?? now, now,
      e.exercise_category ?? 'compound', e.increment_kg ?? 2.5,
      e.exercise_type ?? 'weight_reps',
      // D107-2: absent from pre-migrate_143 cloud payloads; 'total' is the
      // pre-semantics meaning, matching the exercise_type default pattern.
      e.load_semantics ?? 'total',
      // CC27 demand columns: absent until cloud migrate_148 runs; COALESCE
      // above keeps local derivation authoritative until then.
      e.position ?? null,
      _boolToInt(e.floor_access), _boolToInt(e.overhead_position),
      e.grip_demand ?? null,
      _boolToInt(e.unilateral_loadable), _boolToInt(e.bilateral_upper),
      _boolToInt(e.bilateral_lower), _boolToInt(e.axial_load),
      _boolToInt(e.impact), e.balance_demand ?? null,
      _boolToInt(e.weight_bearing_hands),
    ],
  );
  _invalidateExercisesCache();
}

// Cloud booleans arrive as true/false; SQLite stores 0/1; NULL stays NULL
// (CAP-8: unknown is meaningful).
function _boolToInt(v) {
  if (v === true || v === 1) return 1;
  if (v === false || v === 0) return 0;
  return null;
}

export async function insertOrUpdateUserBodyProfileFromCloud(userId, p) {
  if (!userId) return;
  const d = await db();
  const now = Date.now();
  // Campaign 1 P0-8 D14: last-write-wins. This applier used to overwrite
  // sex, DOB, height, experience, primary goal AND scoff_score from the
  // cloud unconditionally, so a device that had not synced since before
  // the user updated them pushed its stale copy up and then had it
  // applied everywhere. scoff_score is ED-screening data: a stale device
  // must never win. Without a cloud timestamp the row cannot prove it is
  // fresher than the local copy, so it does not replace one.
  const cloudUpdated = _tsToMs(p.updated_at);
  const existing = await d.getFirstAsync(
    'SELECT id, updated_at FROM user_body_profile WHERE user_id = ? LIMIT 1', [userId],
  );
  // Campaign 1 P0-8 D13: goal_lock_advanced + goal_lock_set_at now
  // round-trip (the cloud columns have existed since migrate_017; only
  // the client never carried them). COALESCE so a cloud row pulled from
  // a project where 017 has not landed - i.e. the keys are absent - can
  // never clear a lock the user set on this device.
  const goalLock = p.goal_lock_advanced == null
    ? null : (p.goal_lock_advanced ? 1 : 0);
  const goalLockSetAt = p.goal_lock_set_at == null ? null : _tsToMs(p.goal_lock_set_at);
  if (existing?.id) {
    if (cloudUpdated == null) return;
    if (Number(existing.updated_at ?? 0) >= cloudUpdated) return;
    await d.runAsync(
      `UPDATE user_body_profile SET
        sex = ?, date_of_birth = ?, height_cm = ?, experience_level = ?,
        training_age_years = ?, primary_goal = ?, scoff_score = ?,
        gdpr_consented = ?,
        goal_lock_advanced = COALESCE(?, goal_lock_advanced),
        goal_lock_set_at = COALESCE(?, goal_lock_set_at),
        updated_at = ?
       WHERE user_id = ?`,
      [
        p.sex ?? null, p.date_of_birth ?? null, p.height_cm ?? null,
        p.experience_level ?? null, p.training_age_years ?? null,
        p.primary_goal ?? null, p.scoff_score ?? null,
        p.gdpr_consented ? 1 : 0,
        goalLock, goalLockSetAt,
        cloudUpdated, userId,
      ],
    );
    return;
  }
  await d.runAsync(
    `INSERT INTO user_body_profile
      (id, user_id, sex, date_of_birth, height_cm, experience_level,
       training_age_years, primary_goal, scoff_score, gdpr_consented,
       goal_lock_advanced, goal_lock_set_at,
       created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uid(), userId,
      p.sex ?? null, p.date_of_birth ?? null, p.height_cm ?? null,
      p.experience_level ?? null, p.training_age_years ?? null,
      p.primary_goal ?? null, p.scoff_score ?? null,
      p.gdpr_consented ? 1 : 0,
      goalLock ?? 0, goalLockSetAt,
      _tsToMs(p.created_at) ?? now,
      cloudUpdated ?? now,
    ],
  );
}

export async function insertOrUpdateUserInsightFromCloud(userId, row) {
  if (!row?.id) return;
  const d = await db();
  // C6 F5 (D97): the dismissal RATCHET, mirroring the calm-mode ratchet -
  // a pulled row whose dismissed_at is null may never clear a local
  // non-null dismissal. A user's "no" stands whatever a stale device
  // pushes; they never re-reject the same card (Promise 4).
  const local = await d.getFirstAsync(
    'SELECT dismissed_at FROM user_insights WHERE id = ?', [row.id],
  ).catch(() => null);
  const localDismissed = local?.dismissed_at ?? null;
  const cloudDismissed = row.dismissed_at ? _tsToMs(row.dismissed_at) : null;
  const dismissedAt = cloudDismissed ?? localDismissed;
  await d.runAsync(
    `INSERT OR REPLACE INTO user_insights
      (id, user_id, insight_key, type, severity, copy, action_payload,
       generated_at, dismissed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id, userId, row.insight_key, row.type ?? null, row.severity ?? null,
      row.copy ?? null, row.action_payload ?? null,
      _tsToMs(row.generated_at) ?? Date.now(),
      dismissedAt,
    ],
  );
}

export async function insertOrUpdateExerciseUserNoteFromCloud(userId, row) {
  if (!row?.id) return;
  const d = await db();
  // C6 RC6-3 (D97-25): carry deleted_at, same rationale as the sibling
  // appliers (the local table has the column; INSERT OR REPLACE without
  // it resurrected a soft-deleted note on every pull).
  await d.runAsync(
    `INSERT OR REPLACE INTO exercise_user_notes
      (id, user_id, exercise_id, note, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id, userId, row.exercise_id, row.note,
      _tsToMs(row.created_at) ?? Date.now(),
      _tsToMs(row.updated_at) ?? Date.now(),
      _tsToMs(row.deleted_at) ?? null,
    ],
  );
}

export async function insertOrUpdateWorkoutNoteFromCloud(userId, row) {
  if (!row?.id) return;
  const d = await db();
  // Local table is workout_notes_v2, the v1 schema had a different
  // shape and we don't migrate user-typed notes between them.
  await d.runAsync(
    `INSERT OR REPLACE INTO workout_notes_v2
      (id, user_id, workout_id, note, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id, userId, row.workout_id, row.note ?? '',
      _tsToMs(row.created_at) ?? Date.now(),
      _tsToMs(row.updated_at) ?? Date.now(),
      row.deleted_at ? _tsToMs(row.deleted_at) : null,
    ],
  );
}

export async function insertOrUpdateExerciseGoalFromCloud(userId, row) {
  if (!row?.id) return;
  const d = await db();
  await d.runAsync(
    `INSERT OR REPLACE INTO exercise_goals
      (id, user_id, exercise_id, target_weight, target_reps, target_date, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id, userId, row.exercise_id,
      row.target_weight ?? null, row.target_reps ?? null,
      row.target_date ?? null, row.notes ?? null,
      _tsToMs(row.created_at) ?? Date.now(),
      _tsToMs(row.updated_at) ?? Date.now(),
    ],
  );
}

export async function insertOrUpdatePeakWeekPlanFromCloud(userId, row) {
  if (!row?.id) return;
  const d = await db();
  await d.runAsync(
    // D95 (Campaign 4, AUDIT-PEAKWEEK-SYNC): carry deleted_at through the
    // applier like the sibling appliers do - INSERT OR REPLACE without it
    // resurrected a locally soft-deleted row on every pull. Latent today
    // (no writer sets cloud deleted_at) but the column exists both sides.
    `INSERT OR REPLACE INTO peak_week_plans
      (id, user_id, show_date, federation, current_bodyweight, lean_estimate,
       prep_carbs_per_kg, prep_sodium_mg, prep_water_l, status, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id, userId,
      row.show_date ?? null, row.federation ?? null,
      row.current_bodyweight ?? null, row.lean_estimate ?? null,
      row.prep_carbs_per_kg ?? null, row.prep_sodium_mg ?? null,
      row.prep_water_l ?? null,
      row.status ?? 'active',
      _tsToMs(row.created_at) ?? Date.now(),
      _tsToMs(row.updated_at) ?? Date.now(),
      row.deleted_at ? _tsToMs(row.deleted_at) : null,
    ],
  );
}

export async function insertOrUpdatePlannedMuscleVolumeFromCloud(userId, row) {
  if (!row?.id) return;
  const d = await db();
  // Campaign 1 P0-1: the pull now restores into the PRIMARY table - the
  // one every live reader consumes (weekly targets, rowMrv clamps, the
  // block-start explanation lines). It used to write a *_sync mirror with
  // no product reader, so a new device restored the adaptive plan into a
  // table nothing looked at and the prescriptions read as absent.
  //
  // Rules:
  // - Tombstoned cloud rows never land (the pull filters deleted_at, this
  //   is belt and braces).
  // - Last-write-wins by updated_at: a cloud row only replaces a local one
  //   it is strictly newer than, so a stale device's push (which the next
  //   pull would echo back) can never overwrite richer local provenance.
  // - Legacy cloud rows without mev/mav/mrv (pre-migrate_132) degrade
  //   HONESTLY: research landmarks + source 'template' - the one label
  //   the explanation layer never builds a personalisation claim from.
  //   An unknown muscle key cannot be represented truthfully and is
  //   skipped rather than invented.
  if (row.deleted_at) return;
  const muscle = row.muscle;
  let mev = Number.isFinite(Number(row.mev)) ? Number(row.mev) : null;
  let mav = Number.isFinite(Number(row.mav)) ? Number(row.mav) : null;
  let mrv = Number.isFinite(Number(row.mrv)) ? Number(row.mrv) : null;
  let source = typeof row.source === 'string' && row.source ? row.source : null;
  const incomingUpdated = _tsToMs(row.updated_at) ?? Date.now();
  const existing = await d.getFirstAsync(
    'SELECT updated_at, mev, mav, mrv, source FROM planned_muscle_volume WHERE id = ?', [row.id],
  );
  if (existing && Number(existing.updated_at ?? 0) >= incomingUpdated) return;
  if (mev == null || mav == null || mrv == null) {
    // C6 RC6-5 (D97-25): the comment above promised a stale push "can
    // never overwrite richer local provenance", but the degrade branch
    // replaced wholesale - so an ESTABLISHED device holding
    // source='ledger' bands was downgraded to research + 'template' by
    // any newer provenance-less echo (Review C proved it: mrv 26 ->
    // 22). When the LOCAL row already carries a full band, MERGE
    // instead: keep the local band and label, take the incoming
    // planned_sets and timestamp. A fresh device with no local
    // provenance still degrades honestly, which is what the reinstall
    // E2E pins (S-11's recorded behaviour is unchanged there).
    const localMev = Number.isFinite(Number(existing?.mev)) ? Number(existing.mev) : null;
    const localMav = Number.isFinite(Number(existing?.mav)) ? Number(existing.mav) : null;
    const localMrv = Number.isFinite(Number(existing?.mrv)) ? Number(existing.mrv) : null;
    if (localMev != null && localMav != null && localMrv != null) {
      mev = mev ?? localMev;
      mav = mav ?? localMav;
      mrv = mrv ?? localMrv;
      source = source ?? (typeof existing.source === 'string' && existing.source ? existing.source : null);
    }
  }
  if (mev == null || mav == null || mrv == null) {
    // eslint-disable-next-line global-require
    const { VOLUME_LANDMARKS } = require('./algorithms');
    const research = VOLUME_LANDMARKS[muscle];
    if (!research) return; // unrepresentable: skip, never invent
    mev = mev ?? research.mev;
    mav = mav ?? research.mav;
    mrv = mrv ?? research.mrv;
    source = source ?? 'template';
  }
  await d.runAsync(
    `INSERT OR REPLACE INTO planned_muscle_volume
      (id, mesocycle_week_id, muscle, planned_sets, mev, mav, mrv, source, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id, row.mesocycle_week_id,
      muscle, row.planned_sets ?? 0,
      mev, mav, mrv, source ?? 'template',
      _tsToMs(row.created_at) ?? Date.now(),
      incomingUpdated,
    ],
  );
}

/**
 * ed_pattern_flags from cloud. Server is authoritative per
 * SYNC_REGISTRY (conflictStrategy=server_wins), so INSERT OR
 * REPLACE: any local edits to the row are stomped by the cloud
 * copy on the next pull. Local writes still go through
 * raise/clear; they reach the cloud via the existing supabase
 * upsert path inside the engine, not through this helper.
 */
/**
 * recipe_ingredients all-rows reader for SYNC. Includes
 * tombstones (deleted_at IS NOT NULL) so the per-table push in
 * src/lib/sync/tables/recipeIngredients.js can ship the delete
 * to the cloud. UI consumers should call
 * getLiveRecipeIngredientsForRecipe instead.
 */
export async function getAllRecipeIngredientsForUser(userId) {
  const d = await db();
  const rows = await d.getAllAsync(
    'SELECT * FROM recipe_ingredients WHERE user_id = ? ORDER BY recipe_id, order_index',
    [userId],
  );
  return rows.map(rowToCamel);
}

/**
 * Live (non-deleted) ingredients for one recipe. The recipe-
 * builder UI reads through this so tombstoned rows never appear
 * even though they still live in SQLite for sync.
 */
export async function getLiveRecipeIngredientsForRecipe(userId, recipeId) {
  const d = await db();
  const rows = await d.getAllAsync(
    `SELECT * FROM recipe_ingredients
     WHERE user_id = ? AND recipe_id = ? AND deleted_at IS NULL
     ORDER BY order_index`,
    [userId, recipeId],
  );
  return rows.map(rowToCamel);
}

/**
 * Soft-delete an ingredient. Sets deleted_at + updated_at; the
 * row survives in SQLite so the next sync round ships the
 * tombstone to the cloud. Cloud-side then either tombstones
 * (if newer) or revives it (if cloud is newer per LWW).
 */
export async function softDeleteRecipeIngredient(userId, id) {
  if (!id) return;
  const d = await db();
  const now = Date.now();
  await d.runAsync(
    `UPDATE recipe_ingredients
     SET deleted_at = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`,
    [now, now, id, userId],
  );
}

/**
 * recipe_ingredients from cloud. Last-write-wins on updated_at;
 * tombstones (deleted_at IS NOT NULL on the cloud row) flow
 * through unchanged. SQLite's INSERT OR REPLACE keeps the local
 * write minimal; the LWW gate is applied by the caller in
 * src/lib/sync/tables/recipeIngredients.js.
 */
export async function upsertRecipeIngredientFromCloud(userId, row) {
  if (!row?.id) return;
  const d = await db();
  await d.runAsync(
    `INSERT OR REPLACE INTO recipe_ingredients
       (id, recipe_id, food_ref, quantity_g, order_index, created_at,
        updated_at, deleted_at, user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id,
      row.recipe_id ?? null,
      row.food_ref ?? null,
      Number(row.quantity_g) || 0,
      Number(row.order_index) || 0,
      _tsToMs(row.created_at) ?? Date.now(),
      _tsToMs(row.updated_at) ?? Date.now(),
      row.deleted_at ? _tsToMs(row.deleted_at) : null,
      userId,
    ],
  );
}

/**
 * Existing local updated_at for one ingredient. Used by the
 * per-table pull handler to decide whether a cloud row beats
 * what we have locally per the LWW contract. Returns null when
 * the local row doesn't exist (cloud row wins by default).
 */
export async function getRecipeIngredientUpdatedAt(userId, id) {
  if (!id) return null;
  const d = await db();
  const row = await d.getFirstAsync(
    'SELECT updated_at FROM recipe_ingredients WHERE id = ? AND user_id = ?',
    [id, userId],
  );
  return row?.updated_at ?? null;
}

/**
 * Existing local updated_at for one body metric row. Used by
 * src/lib/sync/tables/bodyComposition.js pull handler as the LWW
 * gate: cloud rows older than the local copy are skipped on pull
 * (matches the registry contract conflictStrategy='last_write_wins').
 * Returns null when the local row doesn't exist (cloud wins by
 * default).
 */
export async function getBodyMetricUpdatedAt(userId, id) {
  return bodyMetricsRepository.getBodyMetricUpdatedAt(userId, id);
}

/**
 * Existing local updated_at for one weekly check-in row. Used by
 * src/lib/sync/tables/weeklyCheckins.js pull handler for the same
 * LWW gate as body metrics. Null when the local row doesn't exist.
 */
export async function getWeeklyCheckinUpdatedAt(userId, id) {
  if (!id) return null;
  const d = await db();
  const row = await d.getFirstAsync(
    'SELECT updated_at FROM weekly_checkins WHERE id = ? AND user_id = ?',
    [id, userId],
  );
  return row?.updated_at ?? null;
}

/**
 * tier_history cloud rows mirrored to local SQLite. Server-
 * authoritative per the registry (conflictStrategy=server_wins).
 * The local table is an append-only audit log; the cloud is the
 * source of truth.
 */
export async function upsertTierHistoryFromCloud(userId, row) {
  if (!row?.id) return;
  const d = await db();
  await d.runAsync(
    `INSERT OR REPLACE INTO tier_history
       (id, user_id, from_tier, to_tier, event_type, occurred_at, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id, userId,
      row.from_tier ?? null,
      row.to_tier ?? null,
      row.event_type ?? null,
      _tsToMs(row.occurred_at) ?? Date.now(),
      typeof row.payload_json === 'string'
        ? row.payload_json
        : (row.payload_json ? JSON.stringify(row.payload_json) : null),
      _tsToMs(row.created_at) ?? Date.now(),
    ],
  );
}

export async function upsertEdPatternFlagFromCloud(userId, row) {
  if (!row?.id) return;
  const d = await db();
  await d.runAsync(
    `INSERT OR REPLACE INTO ed_pattern_flags
       (id, user_id, flag_state, reason, signals_json,
        raised_at, cleared_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id, userId,
      row.flag_state ?? 'raised',
      row.reason ?? null,
      typeof row.signals_json === 'string'
        ? row.signals_json
        : (row.signals_json ? JSON.stringify(row.signals_json) : null),
      _tsToMs(row.raised_at) ?? Date.now(),
      row.cleared_at ? _tsToMs(row.cleared_at) : null,
      _tsToMs(row.updated_at) ?? Date.now(),
      row.deleted_at ? _tsToMs(row.deleted_at) : null,
    ],
  );
}

export async function insertOrUpdateAdaptationEventFromCloud(userId, row) {
  if (!row?.id) return;
  const d = await db();
  await d.runAsync(
    `INSERT OR REPLACE INTO adaptation_events_sync
      (id, user_id, mesocycle_week_id, event_type, payload, recorded_at,
       created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id, userId,
      row.mesocycle_week_id ?? null, row.event_type,
      row.payload ?? null,
      _tsToMs(row.recorded_at) ?? Date.now(),
      _tsToMs(row.created_at) ?? Date.now(),
      _tsToMs(row.updated_at) ?? Date.now(),
      row.deleted_at ? _tsToMs(row.deleted_at) : null,
    ],
  );

  // C8 Work 4 (FR-C4-3 / S-4): the restore above lands in the SYNC
  // MIRROR, which no product code reads - so a reinstall silently lost
  // the Engine Log's continuity, the twice-declined/revert memory that
  // puts a muscle on hold, and the same-week add-frequency caps. The
  // cloud row already carries every field the authoritative table
  // needs (sync.js's push mapper writes decision/delta/muscle/
  // exercise_id/reason_code/reason_text/signals into `payload`), so
  // this is purely a wrong-destination defect: no new cloud data, no
  // new consent, no migration.
  //
  // Safety posture: INSERT OR IGNORE, so a restored historical event can
  // never overwrite a newer local one, and adaptation_events is a
  // read-only LOG (deload triggers, revert memory, frequency caps) that
  // nothing replays as an action - restoring it cannot re-apply
  // anything. Tombstoned rows are skipped, and rows missing any NOT NULL
  // column are skipped rather than invented.
  if (row.deleted_at) return;
  try {
    const payload = typeof row.payload === 'string'
      ? JSON.parse(row.payload)
      : (row.payload && typeof row.payload === 'object' ? row.payload : null);
    const weekId = row.mesocycle_week_id ?? null;
    const decision = payload?.decision ?? null;
    const reasonCode = payload?.reason_code ?? null;
    if (!weekId || !decision || !reasonCode) return;
    const signalsJson = payload?.signals == null
      ? '{}'
      : (typeof payload.signals === 'string' ? payload.signals : JSON.stringify(payload.signals));
    await d.runAsync(
      `INSERT OR IGNORE INTO adaptation_events
        (id, mesocycle_week_id, muscle, exercise_id, decision, delta,
         reason_code, reason_text, signals_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id, weekId,
        payload?.muscle ?? null, payload?.exercise_id ?? null,
        decision, payload?.delta ?? null,
        reasonCode, payload?.reason_text ?? null,
        signalsJson,
        _tsToMs(row.recorded_at) ?? _tsToMs(row.created_at) ?? Date.now(),
      ],
    );
  } catch (_) { /* mirror already written; the log is best-effort */ }
}

/**
 * C8 Work 4 review D9: run a whole adaptation-event restore inside one
 * transaction. The pull is unwatermarked and full-table, and Work 4
 * added a second write per row (the authoritative log beside the sync
 * mirror), so a user with years of session decisions was paying for
 * thousands of unbatched writes on the launch path.
 *
 * The caller keeps its own per-row error handling, so a single bad row
 * still cannot abort the restore.
 */
export async function runAdaptationEventBatch(task) {
  const d = await db();
  return runInTransaction(d, task);
}

// ─── Exercise intent, swap memory and approved defaults (Campaign 9) ─────────
// The durable half of the canonical exercise-intent layer (src/lib/exercise/
// intent.js holds every DECISION; this file only reads and writes rows).
//
// Nothing here deletes training history. Excluding an exercise records a
// preference about FUTURE suggestions; workouts, sets, PRs and progression
// are untouched and stay visible.

export const EXERCISE_INTENT = Object.freeze({
  EXCLUDED: 'excluded',        // "Don't suggest this exercise" - indefinite
  AVOIDED_BLOCK: 'avoided_block', // "Avoid for this block" - one mesocycle
  // D107-2: "Avoid this movement PATTERN for N days" - day-bound only,
  // targets a movementFamily key via the `family:<key>` exercise_id
  // convention (src/lib/exercise/intent.js familyTargetKey). "This block"
  // and "indefinite" pattern avoidance reuse AVOIDED_BLOCK/EXCLUDED above
  // with the same family target rather than inventing a third duration
  // model for two kinds that already express exactly that.
  PATTERN_AVOID: 'pattern_avoid',
});

/**
 * Record (or replace) the user's intent for one exercise. Upsert on
 * (user_id, exercise_id): a muscle can only be in one state at a time, and
 * re-excluding something already avoided simply promotes it.
 *
 * @param {string} userId
 * @param {string} exerciseId
 * @param {'excluded'|'avoided_block'|'pattern_avoid'} kind
 * @param {{scopeMesocycleId?: string|null, reason?: string|null, expiresAtMs?: number|null}} [opts]
 *   reason is OPTIONAL lightweight context the user may skip entirely. It is
 *   never interpreted: "discomfort" records that the user said so, never that
 *   the exercise injures them. expiresAtMs is D107-2's day-bound duration,
 *   set only for PATTERN_AVOID rows; every other kind passes null, which is
 *   also what a caller upgrading a PATTERN_AVOID row to EXCLUDED/AVOIDED_BLOCK
 *   should pass, so the stale expiry cannot linger under the new kind.
 */
export async function setExerciseIntent(userId, exerciseId, kind, { scopeMesocycleId = null, reason = null, expiresAtMs = null } = {}) {
  if (!userId || !exerciseId) return null;
  const d = await db();
  const now = Date.now();
  const existing = await d.getFirstAsync(
    'SELECT id FROM exercise_intent WHERE user_id = ? AND exercise_id = ?',
    [userId, exerciseId],
  );
  if (existing?.id) {
    await d.runAsync(
      `UPDATE exercise_intent
          SET kind = ?, scope_mesocycle_id = ?, reason = ?, expires_at_ms = ?, updated_at = ?, deleted_at = NULL
        WHERE id = ?`,
      [kind, scopeMesocycleId, reason, expiresAtMs, now, existing.id],
    );
    _scheduleSync();
    return existing.id;
  }
  const id = uid();
  await d.runAsync(
    `INSERT INTO exercise_intent
       (id, user_id, exercise_id, kind, scope_mesocycle_id, reason, expires_at_ms, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, userId, exerciseId, kind, scopeMesocycleId, reason, expiresAtMs, now, now],
  );
  _scheduleSync();
  return id;
}

/**
 * "Allow again". Tombstoned rather than hard-deleted so the restore itself
 * propagates to the user's other devices - a hard delete would let a stale
 * cloud copy of the exclusion arrive later and silently re-suppress the
 * exercise the user just restored.
 */
export async function clearExerciseIntent(userId, exerciseId) {
  if (!userId || !exerciseId) return;
  const d = await db();
  await d.runAsync(
    'UPDATE exercise_intent SET deleted_at = ?, updated_at = ? WHERE user_id = ? AND exercise_id = ?',
    [Date.now(), Date.now(), userId, exerciseId],
  );
  _scheduleSync();
}

/**
 * Every live intent row for the user. Tombstones excluded.
 *
 * D107-2: expiry is evaluated HERE, at read time, against `nowMs` (real
 * clock by default, overridable for tests so expiry is provable to the
 * millisecond). A row whose expires_at_ms has passed is left OUT of the
 * result - "ignored" - and then tombstoned as a lazy best-effort cleanup so
 * it stops being re-evaluated on every future read. The cleanup is
 * fire-and-forget and its failure can never affect the read it rode in on.
 */
export async function getExerciseIntents(userId, { nowMs = Date.now() } = {}) {
  if (!userId) return [];
  const d = await db();
  const rows = await d.getAllAsync(
    `SELECT id, exercise_id AS exerciseId, kind, scope_mesocycle_id AS scopeMesocycleId,
            reason, expires_at_ms AS expiresAtMs, created_at AS createdAt, updated_at AS updatedAt
       FROM exercise_intent
      WHERE user_id = ? AND deleted_at IS NULL`,
    [userId],
  ).catch(() => []);
  const live = [];
  const expiredIds = [];
  for (const r of rows) {
    if (r.expiresAtMs != null && r.expiresAtMs <= nowMs) expiredIds.push(r.id);
    else live.push(r);
  }
  if (expiredIds.length) {
    const placeholders = expiredIds.map(() => '?').join(',');
    d.runAsync(
      `UPDATE exercise_intent SET deleted_at = ?, updated_at = ? WHERE id IN (${placeholders})`,
      [nowMs, nowMs, ...expiredIds],
    ).then(() => { try { _scheduleSync(); } catch (_) { /* best effort */ } })
      .catch(() => { /* lazy cleanup is best-effort; the next read tries again */ });
  }
  return live;
}

/**
 * Record an A->B replacement. Append-only: the log IS the evidence, and a
 * later swap away from B does not erase that B was once chosen.
 */
export async function recordExerciseSwap(userId, fromExerciseId, toExerciseId, { routineId = null, mesocycleId = null, explicit = true, scope = null, causeOverride = null } = {}) {
  if (!userId || !fromExerciseId || !toExerciseId) return null;
  if (fromExerciseId === toExerciseId) return null;
  const d = await db();
  const now = Date.now();
  const id = uid();
  // CC29 (section 5.5, CAP-13): 'constraint' provenance is ELIGIBILITY-
  // DERIVED at write time, here, once, for every surface: any swap whose
  // FROM-exercise is capability-ineligible right now records
  // cause='constraint', whichever sheet or shortcut it came through.
  // Never free text, never UI-path-keyed. Best-effort: a read failure
  // leaves cause NULL (unknown), which no reader ever counts.
  //
  // CC33 D112 R6 (audit T2-28a): ONE narrow exception to the never-UI-
  // path-keyed law, ruled at lead review. A swap taken from the in-session
  // "Work around this" sheet BEFORE any rule exists is a capability-
  // motivated action by the user's own declaration - central derivation
  // legitimately finds no rule and returns NULL, and the swap then
  // teaches the preference lane that the user dislikes the movement.
  // causeOverride accepts 'constraint' or 'style' (nothing else), only ADDS
  // provenance (it never suppresses a derived cause), and stays honest:
  // the user tapped a sheet whose whole meaning is "this movement is a
  // capability problem today", or made a swap inside a style-constrained
  // plan (EL-11, docs/exercise-library-expansion-2026-09-05/
  // 05-DECISIONS.md): a swap taken to stay within the plan's kettlebell/
  // circuit pool is not a statement of preference either, so it is
  // excluded from durable preference evidence the same way (intent.js).
  // The capability derivation below still wins if it also applies -
  // 'constraint' is the more specific, mechanically-forced reason.
  let cause = causeOverride === 'constraint' ? 'constraint'
    : causeOverride === 'style' ? 'style'
    : null;
  try {
    // eslint-disable-next-line global-require
    const { loadCapabilityResolveState, capabilityBlockReason, capabilityKnown } = require('./capability/resolve');
    const state = await loadCapabilityResolveState(userId, {});
    // Round 19 (F5): stale-known is knowledge (D130 ruling 1) - under
    // the old `!unavailable` guard a capability-forced swap during a
    // stale-known read recorded cause NULL and taught the preference
    // lane a dislike the learning shield exists to prevent. A read
    // that genuinely knows nothing still derives nothing (stated on
    // the F5 row); the explicit causeOverride stands either way.
    if (!state.empty && capabilityKnown(state)) {
      const from = await getExerciseById(fromExerciseId);
      if (from && capabilityBlockReason(state, from) !== null) cause = 'constraint';
    }
  } catch (_e) { /* derivation best-effort; an explicit override stands */ }
  await d.runAsync(
    `INSERT INTO exercise_swaps
       (id, user_id, from_exercise_id, to_exercise_id, routine_id, mesocycle_id, explicit, scope, cause, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, userId, fromExerciseId, toExerciseId, routineId, mesocycleId, explicit ? 1 : 0, scope, cause, now, now],
  );
  _scheduleSync();
  return id;
}

/** The user's swap history, newest first. `limit` bounds the read, not the truth. */
export async function getExerciseSwaps(userId, { fromExerciseId = null, limit = 200 } = {}) {
  if (!userId) return [];
  const d = await db();
  const args = [userId];
  let sql = `SELECT from_exercise_id AS fromExerciseId, to_exercise_id AS toExerciseId,
                    routine_id AS routineId, mesocycle_id AS mesocycleId,
                    explicit, scope, cause, created_at AS createdAt
               FROM exercise_swaps
              WHERE user_id = ? AND deleted_at IS NULL`;
  if (fromExerciseId) { sql += ' AND from_exercise_id = ?'; args.push(fromExerciseId); }
  sql += ' ORDER BY created_at DESC LIMIT ?';
  args.push(limit);
  return d.getAllAsync(sql, args).catch(() => []);
}

/**
 * The user's APPROVED default replacement for a source exercise. Explicit
 * intent, so it outranks anything inferred from the swap log.
 */
export async function setExerciseSlotDefault(userId, fromExerciseId, exerciseId, { routineId = null } = {}) {
  if (!userId || !fromExerciseId || !exerciseId) return null;
  const d = await db();
  const now = Date.now();
  const existing = await d.getFirstAsync(
    `SELECT id FROM exercise_slot_defaults
      WHERE user_id = ? AND from_exercise_id = ? AND routine_id IS ?`,
    [userId, fromExerciseId, routineId],
  );
  if (existing?.id) {
    await d.runAsync(
      'UPDATE exercise_slot_defaults SET exercise_id = ?, updated_at = ?, deleted_at = NULL WHERE id = ?',
      [exerciseId, now, existing.id],
    );
    _scheduleSync();
    return existing.id;
  }
  const id = uid();
  await d.runAsync(
    `INSERT INTO exercise_slot_defaults
       (id, user_id, from_exercise_id, routine_id, exercise_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, userId, fromExerciseId, routineId, exerciseId, now, now],
  );
  _scheduleSync();
  return id;
}

/** Undo an approved default. Tombstoned, for the same reason as intent. */
export async function clearExerciseSlotDefault(userId, fromExerciseId, { routineId = null } = {}) {
  if (!userId || !fromExerciseId) return;
  const d = await db();
  const now = Date.now();
  await d.runAsync(
    `UPDATE exercise_slot_defaults SET deleted_at = ?, updated_at = ?
      WHERE user_id = ? AND from_exercise_id = ? AND routine_id IS ?`,
    [now, now, userId, fromExerciseId, routineId],
  );
  _scheduleSync();
}

/** Every live approved default for the user. */
export async function getExerciseSlotDefaults(userId) {
  if (!userId) return [];
  const d = await db();
  return d.getAllAsync(
    `SELECT from_exercise_id AS fromExerciseId, routine_id AS routineId,
            exercise_id AS exerciseId, updated_at AS updatedAt
       FROM exercise_slot_defaults
      WHERE user_id = ? AND deleted_at IS NULL`,
    [userId],
  ).catch(() => []);
}

/**
 * Per-exercise training evidence, in ONE query: how many completed sessions
 * featured the exercise and when it was last trained. Warm-ups excluded, the
 * same rule getRecentlyUsedExerciseIds already applies.
 *
 * This is deliberately a COUNT and a DATE, not a score. Nothing here ranks
 * exercises by how well they build muscle - ordinary training logs cannot
 * support that claim.
 */
export async function getExerciseUsageStats(userId) {
  if (!userId) return [];
  const d = await db();
  return d.getAllAsync(
    `SELECT s.exercise_id AS exerciseId,
            COUNT(DISTINCT s.workout_id) AS sessions,
            MAX(w.started_at) AS lastTrainedMs
       FROM workout_sets s
       JOIN workouts w ON w.id = s.workout_id
      WHERE w.user_id = ? AND w.is_completed = 1 AND s.set_type != 'warmup'
      GROUP BY s.exercise_id`,
    [userId],
  ).catch(() => []);
}

/**
 * Campaign 9 closeout: recent sessions per exercise, for progression
 * evidence. Bounded by construction - the caller passes the handful of
 * exercise ids actually on screen, and only completed workouts count.
 *
 * Sets come back grouped per session, newest session first, which is the
 * exact shape detectPlateau and detectProgressionConsistency consume. Set
 * type is carried through so the shared e1RM eligibility rule can reject
 * warm-ups, myo-reps and rest-pause rows in the pure layer rather than
 * here.
 */
/**
 * CC30 (section 7 matrix, plateau/progression rows): drop set rows whose
 * exercise sat under a DEFINITE episode conflict at the row's own moment.
 * A "plateau" under restriction is not a plateau. No-episode users pass
 * straight through; a capability read failure returns the rows unfiltered
 * (display truth stands; learning consumers have their own gates).
 */
export async function filterCapabilityEligibleSetRows(userId, rows, { atField = 'createdAt' } = {}) {
  if (!userId || !Array.isArray(rows) || rows.length === 0) return rows;
  try {
    // eslint-disable-next-line global-require
    const elig = require('./capability/eligibility');
    const capRows = await getCapabilityConstraints(userId);
    if (!capRows.some((r) => r.role === 'episode')) return rows;
    const library = await getAllExercises();
    const byId = new Map(library.map((e) => [e.id, e]));
    return rows.filter((r) => {
      const ex = byId.get(r?.exerciseId ?? r?.exercise_id);
      const at = r?.[atField] ?? r?.created_at ?? null;
      if (!ex || !Number.isFinite(at)) return true;
      return !elig.isExerciseConstrainedAt(capRows, ex, at);
    });
  } catch (_e) {
    return rows;
  }
}

/**
 * CC30 (section 7 matrix, rows 1/4): stamp `capabilityConstrained` on
 * live-prescription history sessions whose moment fell under a definite
 * episode conflict for the exercise. The pure resolver treats the stamp
 * as comparable:false - visible history, never learning evidence - so
 * livePrescription itself stays capability-blind. No-episode users pass
 * straight through; a read failure stamps nothing (display truth stands).
 */
export async function stampCapabilityConstrainedSessions(userId, exerciseId, sessions) {
  if (!userId || !exerciseId || !Array.isArray(sessions) || sessions.length === 0) return sessions;
  try {
    // eslint-disable-next-line global-require
    const elig = require('./capability/eligibility');
    const capRows = await getCapabilityConstraints(userId);
    if (!capRows.some((r) => r.role === 'episode')) return sessions;
    const library = await getAllExercises();
    const ex = library.find((e) => e.id === exerciseId);
    if (!ex) return sessions;
    return sessions.map((s) => {
      const at = s?.at ?? null;
      if (!Number.isFinite(at)) return s;
      return elig.isExerciseConstrainedAt(capRows, ex, at)
        ? { ...s, capabilityConstrained: true }
        : s;
    });
  } catch (_e) {
    return sessions;
  }
}

export async function getExerciseProgressionSessions(userId, exerciseIds = [], { sessionsPerExercise = 4 } = {}) {
  if (!userId || !Array.isArray(exerciseIds) || exerciseIds.length === 0) return new Map();
  const d = await db();
  const ids = exerciseIds.filter(Boolean).slice(0, 40);
  if (ids.length === 0) return new Map();
  const holes = ids.map(() => '?').join(',');
  const rows = await d.getAllAsync(
    `SELECT s.exercise_id AS exerciseId, s.workout_id AS workoutId,
            s.weight AS weight, s.actual_reps AS actualReps, s.set_type AS setType,
            w.started_at AS startedAt
       FROM workout_sets s
       JOIN workouts w ON w.id = s.workout_id
      WHERE w.user_id = ? AND w.is_completed = 1 AND s.exercise_id IN (${holes})
      ORDER BY s.exercise_id ASC, w.started_at DESC`,
    [userId, ...ids],
  ).catch(() => []);

  // CC30: progression/plateau windows read ELIGIBLE sessions only.
  const eligible = await filterCapabilityEligibleSetRows(userId, rows ?? [], { atField: 'startedAt' });

  const byExercise = new Map();
  for (const r of eligible ?? []) {
    if (!byExercise.has(r.exerciseId)) byExercise.set(r.exerciseId, new Map());
    const sessions = byExercise.get(r.exerciseId);
    if (!sessions.has(r.workoutId)) {
      // Newest-first is guaranteed by the ORDER BY, so once this exercise
      // has its window we stop adding older sessions.
      if (sessions.size >= sessionsPerExercise) continue;
      sessions.set(r.workoutId, []);
    }
    sessions.get(r.workoutId).push({
      weight: r.weight, actualReps: r.actualReps, setType: r.setType,
      // Plateau qualification is a time claim. The shared detector needs
      // the real session date to distinguish three sessions in one week
      // from a continuous stall across three weeks. `startedAt` is selected
      // above but used to be discarded here, which made a production
      // plateau impossible even though the same helper worked in isolated
      // tests that supplied timestamps themselves.
      createdAt: r.startedAt,
    });
  }
  const out = new Map();
  for (const [exerciseId, sessions] of byExercise) out.set(exerciseId, [...sessions.values()]);
  return out;
}

// ─── Exercise User Notes ──────────────────────────────────────────────────────

export async function saveExerciseUserNote(userId, exerciseId, note) {
  const d = await db();
  const now = Date.now();
  const existing = await d.getFirstAsync(
    'SELECT id FROM exercise_user_notes WHERE user_id = ? AND exercise_id = ?',
    [userId, exerciseId],
  );
  if (existing?.id) {
    await d.runAsync(
      'UPDATE exercise_user_notes SET note = ?, updated_at = ? WHERE id = ?',
      [note, now, existing.id],
    );
    _scheduleSync();
    return existing.id;
  }
  const id = uid();
  await d.runAsync(
    'INSERT INTO exercise_user_notes (id, user_id, exercise_id, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    [id, userId, exerciseId, note, now, now],
  );
  _scheduleSync();
  return id;
}

export async function getExerciseUserNote(userId, exerciseId) {
  const d = await db();
  const row = await d.getFirstAsync(
    'SELECT note FROM exercise_user_notes WHERE user_id = ? AND exercise_id = ?',
    [userId, exerciseId],
  );
  return row?.note ?? null;
}

export async function deleteExerciseUserNote(userId, exerciseId) {
  const d = await db();
  await d.runAsync(
    'DELETE FROM exercise_user_notes WHERE user_id = ? AND exercise_id = ?',
    [userId, exerciseId],
  );
  _scheduleSync();
}

// ─── Workout Feedback / Fatigue Trend ────────────────────────────────────────

/**
 * Returns the last `limit` completed workouts that have a fatigue_level value,
 * ordered newest-first so the caller can reverse for chart display.
 */
// COMP-015: the read side of session autoregulation. Per-muscle "last
// completed session" signals + the latest weekly check-in's sore-muscle flags,
// local only. Returns RAW scales (no mapping); buildSessionAdjustmentInput in
// algorithms.js maps them to the engine's input shape and applies the shared
// muscle-name map. Thin and defensive like getAdaptiveLandmarkHistory; the
// tested logic lives in the pure engine, not here.
export async function getSessionAdjustmentSignals(userId) {
  const d = await db();
  let perMuscle = {};
  try {
    // MAX(w.started_at) with bare columns: SQLite returns the other columns
    // from the row holding that max within each group, i.e. the most recent
    // completed session that trained each primary muscle. Warmups excluded so a
    // warmup-only touch never counts as training the muscle.
    const rows = await d.getAllAsync(
      `SELECT e.primary_muscle AS muscle,
              MAX(w.started_at) AS last_trained_at,
              w.session_difficulty,
              w.overall_pump,
              w.joint_discomfort
       FROM workouts w
       JOIN workout_sets ws ON ws.workout_id = w.id AND ws.set_type != 'warmup'
       JOIN exercises e ON e.id = ws.exercise_id
       WHERE w.user_id = ? AND w.is_completed = 1 AND e.primary_muscle IS NOT NULL
       GROUP BY e.primary_muscle`,
      [userId],
    );
    for (const r of rows) {
      perMuscle[r.muscle] = {
        lastTrainedAt: r.last_trained_at ?? null,
        sessionDifficulty: r.session_difficulty ?? null,
        pump: r.overall_pump ?? null,
        joint: r.joint_discomfort ?? 0,
      };
    }
  } catch (_e) {
    perMuscle = {};
  }

  let checkin = null;
  try {
    const c = await getLatestCheckin(userId);
    if (c) checkin = { soreMuscles: c.soreMuscles ?? null, checkinAt: c.createdAt ?? c.weekStart ?? null };
  } catch (_e) { /* no check-in yet */ }

  return { perMuscle, checkin };
}

export async function getRecentWorkoutFeedback(userId, limit = 6) {
  try {
    const d = await db();
    const rows = await d.getAllAsync(
      `SELECT fatigue_level, session_difficulty, overall_pump, started_at
       FROM workouts
       WHERE user_id = ? AND is_completed = 1 AND fatigue_level IS NOT NULL
       ORDER BY started_at DESC
       LIMIT ?`,
      [userId, limit],
    );
    return rows.map(rowToCamel);
  } catch (_e) {
    return [];
  }
}

// ─── Next-time coaching notes ─────────────────────────────────────────────────

export async function saveNextTimeNote(userId, { routineId = null, exerciseId = null, note, expiresAfterUses = 1 }) {
  const d = await db();
  const id = uid();
  const now = Date.now();
  await d.runAsync(
    `INSERT INTO workout_notes (id, user_id, routine_id, exercise_id, note, created_at, expires_after_uses, shown_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
    [id, userId, routineId ?? null, exerciseId ?? null, note, now, expiresAfterUses],
  );
  _scheduleSync();
  return { id, userId, routineId, exerciseId, note, createdAt: now, expiresAfterUses, shownCount: 0 };
}

export async function getNextTimeNotes(userId, routineId) {
  const d = await db();
  const rows = await d.getAllAsync(
    `SELECT * FROM workout_notes
     WHERE user_id = ?
       AND (routine_id = ? OR routine_id IS NULL)
       AND shown_count < expires_after_uses
     ORDER BY created_at ASC`,
    [userId, routineId ?? null],
  );
  return rows.map(rowToCamel);
}

export async function markNoteShown(noteId) {
  const d = await db();
  // Increment shown_count; then delete if it has reached expires_after_uses.
  await d.runAsync(
    'UPDATE workout_notes SET shown_count = shown_count + 1 WHERE id = ?',
    [noteId],
  );
  await d.runAsync(
    'DELETE FROM workout_notes WHERE id = ? AND shown_count >= expires_after_uses',
    [noteId],
  );
}

// ─── Exercise Goals ───────────────────────────────────────────────────────────

export async function saveExerciseGoal(userId, exerciseId, { targetWeight, targetDate = null }) {
  const d = await db();
  const now = Date.now();
  const existing = await d.getFirstAsync(
    'SELECT id FROM exercise_goals WHERE user_id = ? AND exercise_id = ?',
    [userId, exerciseId],
  );
  if (existing?.id) {
    await d.runAsync(
      'UPDATE exercise_goals SET target_weight = ?, target_date = ?, achieved_at = NULL WHERE id = ?',
      [targetWeight, targetDate ?? null, existing.id],
    );
    _scheduleSync();
    return existing.id;
  }
  const id = uid();
  await d.runAsync(
    `INSERT INTO exercise_goals (id, user_id, exercise_id, target_weight, target_date, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, userId, exerciseId, targetWeight, targetDate ?? null, now],
  );
  _scheduleSync();
  return id;
}

export async function getExerciseGoal(userId, exerciseId) {
  const d = await db();
  const row = await d.getFirstAsync(
    'SELECT * FROM exercise_goals WHERE user_id = ? AND exercise_id = ?',
    [userId, exerciseId],
  );
  return rowToCamel(row);
}

export async function markGoalAchieved(goalId) {
  const d = await db();
  await d.runAsync(
    'UPDATE exercise_goals SET achieved_at = ? WHERE id = ?',
    [Date.now(), goalId],
  );
  _scheduleSync();
}

export async function deleteExerciseGoal(userId, exerciseId) {
  const d = await db();
  await d.runAsync(
    'DELETE FROM exercise_goals WHERE user_id = ? AND exercise_id = ?',
    [userId, exerciseId],
  );
  _scheduleSync();
}

// Returns the most recent completed workout timestamp per primary muscle,
// limited to the last 90 days to avoid stale data.
export async function getLastTrainedPerMuscle(userId) {
  const d = await db();
  const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
  const rows = await d.getAllAsync(
    `SELECT e.primary_muscle, MAX(w.started_at) AS last_trained_at
     FROM workout_sets ws
     JOIN workouts w ON ws.workout_id = w.id
     JOIN exercises e ON ws.exercise_id = e.id
     WHERE ws.user_id = ?
       AND w.is_completed = 1
       AND ws.set_type != 'warmup'
       AND e.primary_muscle IS NOT NULL
       AND w.started_at >= ?
     GROUP BY e.primary_muscle`,
    [userId, cutoff],
  );
  const result = {};
  for (const row of rows) {
    if (row.primary_muscle) result[row.primary_muscle] = row.last_trained_at;
  }
  return result;
}

// ─── ED-pattern flag state machine (Move #2) ─────────────────────────────────

export async function getOpenEdPatternFlag(userId) {
  const d = await db();
  return d.getFirstAsync(
    `SELECT * FROM ed_pattern_flags
     WHERE user_id = ? AND cleared_at IS NULL AND deleted_at IS NULL
     ORDER BY raised_at DESC LIMIT 1`,
    [userId],
  );
}

export async function getRecentEdPatternFlags(userId, limit = 5) {
  const d = await db();
  const rows = await d.getAllAsync(
    `SELECT * FROM ed_pattern_flags
     WHERE user_id = ? AND deleted_at IS NULL
     ORDER BY raised_at DESC LIMIT ?`,
    [userId, limit],
  );
  return rows;
}

export async function raiseEdPatternFlag(userId, { reason, signals }) {
  const d = await db();
  const now = Date.now();
  const existing = await getOpenEdPatternFlag(userId);
  if (existing) {
    await d.runAsync(
      `UPDATE ed_pattern_flags SET reason = ?, signals_json = ?, updated_at = ? WHERE id = ?`,
      [reason, JSON.stringify(signals ?? {}), now, existing.id],
    );
    return existing.id;
  }
  const id = uid();
  await d.runAsync(
    `INSERT INTO ed_pattern_flags
       (id, user_id, flag_state, reason, signals_json, raised_at, updated_at)
     VALUES (?, ?, 'raised', ?, ?, ?, ?)`,
    [id, userId, reason, JSON.stringify(signals ?? {}), now, now],
  );
  return id;
}

export async function clearEdPatternFlag(userId) {
  const d = await db();
  const now = Date.now();
  await d.runAsync(
    `UPDATE ed_pattern_flags
     SET flag_state = 'cleared', cleared_at = ?, updated_at = ?
     WHERE user_id = ? AND cleared_at IS NULL AND deleted_at IS NULL`,
    [now, now, userId],
  );
}

// ─── Goal lock (Move #2) ─────────────────────────────────────────────────────

export async function setGoalLockAdvanced(userId, advanced) {
  const d = await db();
  const now = Date.now();
  await d.runAsync(
    `UPDATE user_body_profile
     SET goal_lock_advanced = ?, goal_lock_set_at = ?, updated_at = ?
     WHERE user_id = ?`,
    [advanced ? 1 : 0, now, now, userId],
  );
}

export async function getGoalLockAdvanced(userId) {
  const d = await db();
  const row = await d.getFirstAsync(
    `SELECT goal_lock_advanced FROM user_body_profile WHERE user_id = ?`,
    [userId],
  );
  return !!(row?.goal_lock_advanced);
}

// ─── Engine telemetry (Move #3) ──────────────────────────────────────────────

export async function recordEngineTelemetry(userId, event, payload = null) {
  if (!userId || !event) return null;
  const d = await db();
  const id = uid();
  const now = Date.now();
  // Queued (R2-11): telemetry fires throughout onboarding, exactly when the
  // plan-generation transaction holds the connection.
  await queuedWrite(() => d.runAsync(
    `INSERT INTO engine_telemetry (id, user_id, event, payload_json, occurred_at)
     VALUES (?, ?, ?, ?, ?)`,
    [id, userId, event, payload ? JSON.stringify(payload) : null, now],
  ));
  return id;
}

// Scoped to a single user_id. Telemetry rows are stamped server-side with
// the caller's auth.uid() on push, so a flush must only ever read rows that
// belong to the currently signed-in user. Reading every unpushed row (the old
// behaviour) let one account's leftover rows ship under the next account that
// signs in on the same device. A falsy userId returns nothing rather than
// every row, so a missing session can't reopen that hole.
export async function getUnpushedEngineTelemetry(userId, limit = 200) {
  if (!userId) return [];
  const d = await db();
  const rows = await d.getAllAsync(
    `SELECT * FROM engine_telemetry WHERE user_id = ? AND pushed_at IS NULL ORDER BY occurred_at ASC LIMIT ?`,
    [userId, limit],
  );
  return rows;
}

export async function markEngineTelemetryPushed(ids) {
  if (!ids?.length) return;
  const d = await db();
  const now = Date.now();
  const placeholders = ids.map(() => '?').join(',');
  await d.runAsync(
    `UPDATE engine_telemetry SET pushed_at = ? WHERE id IN (${placeholders})`,
    [now, ...ids],
  );
}

// ─── Sync diagnostics (one-shot, read-only) ──────────────────────────────────

/**
 * Counts rows per user_id across every user-scoped local table. Used
 * to diagnose RLS-rejection cascades on push -- a healthy local DB
 * has every user_id column matching the current auth.uid; anything
 * else is bad data that will either fail to sync (different uid in
 * cloud) or syncs but accumulates noise.
 *
 * Read-only. Returns a structured report the caller can render or log.
 */
export async function diagnoseSyncConflicts(currentSessionUid) {
  const d = await db();
  const tables = [
    'workouts', 'workout_sets', 'routines', 'routine_exercises', 'programmes',
    'mesocycles', 'mesocycle_weeks', 'planned_muscle_volume', 'adaptation_events',
    'nutrition_targets', 'body_metric_log', 'morning_weights',
    'weekly_checkins', 'coach_outputs', 'user_body_profile',
    'user_insights', 'peak_week_plans', 'exercise_user_notes',
    'exercise_goals', 'workout_notes_v2',
    'custom_exercises', 'meal_plans',
    'custom_foods', 'food_entries', 'daily_intake_rollups',
    'saved_meals', 'recipes', 'food_favourites', 'daily_water',
    'daily_steps',
    'pending_sync_ops',
  ];
  const report = {
    currentSessionUid: currentSessionUid ?? null,
    tables: {},
    summary: { totalRowsUnderForeignUids: 0, distinctForeignUids: new Set() },
  };
  for (const table of tables) {
    try {
      // routine_exercises has no user_id column -- join through routines.
      const isJoinTable = table === 'routine_exercises';
      const sql = isJoinTable
        ? `SELECT r.user_id AS user_id, COUNT(*) AS n
           FROM routine_exercises re
           LEFT JOIN routines r ON r.id = re.routine_id
           GROUP BY r.user_id
           ORDER BY n DESC`
        : `SELECT user_id, COUNT(*) AS n FROM ${table} GROUP BY user_id ORDER BY n DESC`;
      const rows = await d.getAllAsync(sql);
      const buckets = rows.map(r => ({
        userId: r.user_id ?? null,
        rowCount: r.n ?? 0,
        isCurrent: r.user_id === currentSessionUid,
      }));
      report.tables[table] = buckets;
      for (const b of buckets) {
        if (b.userId && !b.isCurrent) {
          report.summary.totalRowsUnderForeignUids += b.rowCount;
          report.summary.distinctForeignUids.add(b.userId);
        }
      }
    } catch (e) {
      report.tables[table] = [{ error: e?.message ?? 'query failed' }];
    }
  }
  report.summary.distinctForeignUids = Array.from(report.summary.distinctForeignUids);
  return report;
}

// ─── Campaign 9: cross-device persistence for the exercise-intent layer ──────
// Sync-side readers and cloud appliers for exercise_intent, exercise_swaps
// and exercise_slot_defaults (local schema: SCHEMA_MIGRATIONS v73). Kept at
// the end of the file, away from the concurrently-edited sections above.
//
// Nothing here is training history. These rows record what the user asked
// the app to STOP suggesting; workouts, sets and PRs are untouched by any
// of it, on this device or any other.

/**
 * Every exercise_intent row for the user, INCLUDING tombstones.
 *
 * Deliberately unfiltered on deleted_at, the same rule
 * getAllRoutineExercisesForUser and getAllMorningWeightsForUser follow:
 * this is the sync PUSH's reader, and "allow this exercise again" is
 * recorded as a tombstone (clearExerciseIntent). If the push skipped
 * tombstones the restore would never leave the device, and the user's
 * other phone would keep suppressing an exercise they un-excluded.
 * Every product reader filters deleted_at IS NULL.
 */
export async function getAllExerciseIntentsForUser(userId) {
  if (!userId) return [];
  const d = await db();
  const rows = await d.getAllAsync(
    'SELECT * FROM exercise_intent WHERE user_id = ?', [userId],
  ).catch(() => []);
  return rows.map(rowToCamel);
}

/** Every exercise_swaps row for the user, including tombstones (see above). */
export async function getAllExerciseSwapsForUser(userId) {
  if (!userId) return [];
  const d = await db();
  const rows = await d.getAllAsync(
    'SELECT * FROM exercise_swaps WHERE user_id = ?', [userId],
  ).catch(() => []);
  return rows.map(rowToCamel);
}

/** Every exercise_slot_defaults row for the user, including tombstones. */
export async function getAllExerciseSlotDefaultsForUser(userId) {
  if (!userId) return [];
  const d = await db();
  const rows = await d.getAllAsync(
    'SELECT * FROM exercise_slot_defaults WHERE user_id = ?', [userId],
  ).catch(() => []);
  return rows.map(rowToCamel);
}

/**
 * Apply one cloud exercise_intent row.
 *
 * CONFLICT RULE: newer updated_at wins, and a tie is kept by the LOCAL row
 * (SQLite is device truth; the cloud is the backup). A cloud row can
 * therefore never overwrite a strictly newer local intent, which is the
 * property that matters: the newest thing the user explicitly said about
 * an exercise is the thing that stands, whether that was "don't suggest
 * this" or "allow it again". Because both states live in the same row
 * (the restore is a tombstone, not a delete), one comparison covers both
 * directions.
 *
 * The local table carries UNIQUE(user_id, exercise_id), so the incoming row
 * is matched by id OR by that natural key: two devices that each minted
 * their own id for the same exercise must collapse to one row rather than
 * fail the insert.
 */
export async function insertOrUpdateExerciseIntentFromCloud(userId, row) {
  if (!userId || !row?.id || !row?.exercise_id) return;
  const d = await db();
  const cloudUpdated = _tsToMs(row.updated_at) ?? Date.now();
  const existing = await d.getFirstAsync(
    `SELECT id, updated_at FROM exercise_intent
      WHERE (id = ? OR (user_id = ? AND exercise_id = ?))
      ORDER BY updated_at DESC LIMIT 1`,
    [row.id, userId, row.exercise_id],
  ).catch(() => null);
  if (existing && Number(existing.updated_at ?? 0) >= cloudUpdated) return;
  // Clear any duplicate-by-natural-key row first: it has already lost the
  // comparison above, and leaving it would break UNIQUE(user_id, exercise_id).
  await d.runAsync(
    'DELETE FROM exercise_intent WHERE user_id = ? AND exercise_id = ? AND id != ?',
    [userId, row.exercise_id, row.id],
  );
  await d.runAsync(
    `INSERT OR REPLACE INTO exercise_intent
      (id, user_id, exercise_id, kind, scope_mesocycle_id, reason, expires_at_ms,
       created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id, userId, row.exercise_id, row.kind ?? EXERCISE_INTENT.EXCLUDED,
      row.scope_mesocycle_id ?? null, row.reason ?? null,
      // D107-2: the cloud column is `expires_at` (timestamptz, same
      // convention as created_at/updated_at/deleted_at), converted back to
      // the local epoch-ms column. It may not exist yet on a project that
      // has not run migrate_142 (founder-gated) - row.expires_at is simply
      // absent from the payload in that case, which reads as undefined and
      // collapses to null here, exactly the pre-migration "no expiry"
      // meaning rather than a thrown reference error.
      _tsToMs(row.expires_at) ?? null,
      _tsToMs(row.created_at) ?? cloudUpdated,
      cloudUpdated,
      _tsToMs(row.deleted_at) ?? null,
    ],
  );
}

/**
 * Apply one cloud exercise_swaps row.
 *
 * CONFLICT RULE: none, by design. The swap log is an APPEND-ONLY record of
 * events that happened; an event cannot be edited, only added. INSERT OR
 * IGNORE on the primary key means a re-pull (or an overlapping watermark
 * window, which the delta pull deliberately allows) can never duplicate an
 * event and inflate how often the user "chose" a replacement.
 */
export async function insertOrUpdateExerciseSwapFromCloud(userId, row) {
  if (!userId || !row?.id || !row?.from_exercise_id || !row?.to_exercise_id) return;
  const d = await db();
  const created = _tsToMs(row.created_at) ?? Date.now();
  await d.runAsync(
    `INSERT OR IGNORE INTO exercise_swaps
      (id, user_id, from_exercise_id, to_exercise_id, routine_id, mesocycle_id,
       explicit, scope, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id, userId, row.from_exercise_id, row.to_exercise_id,
      row.routine_id ?? null, row.mesocycle_id ?? null,
      row.explicit === false || row.explicit === 0 ? 0 : 1,
      row.scope ?? null,
      created,
      _tsToMs(row.updated_at) ?? created,
      _tsToMs(row.deleted_at) ?? null,
    ],
  );
}

/**
 * Apply one cloud exercise_slot_defaults row.
 *
 * CONFLICT RULE: identical to exercise_intent, newer updated_at wins and a
 * tie stays local. The natural key is (user_id, from_exercise_id,
 * routine_id) and routine_id is nullable, so the lookup uses `IS` rather
 * than `=` (SQLite treats NULL = NULL as unknown, which would miss the
 * plan-wide default row every time).
 */
export async function insertOrUpdateExerciseSlotDefaultFromCloud(userId, row) {
  if (!userId || !row?.id || !row?.from_exercise_id || !row?.exercise_id) return;
  const d = await db();
  const routineId = row.routine_id ?? null;
  const cloudUpdated = _tsToMs(row.updated_at) ?? Date.now();
  const existing = await d.getFirstAsync(
    `SELECT id, updated_at FROM exercise_slot_defaults
      WHERE (id = ? OR (user_id = ? AND from_exercise_id = ? AND routine_id IS ?))
      ORDER BY updated_at DESC LIMIT 1`,
    [row.id, userId, row.from_exercise_id, routineId],
  ).catch(() => null);
  if (existing && Number(existing.updated_at ?? 0) >= cloudUpdated) return;
  await d.runAsync(
    `DELETE FROM exercise_slot_defaults
      WHERE user_id = ? AND from_exercise_id = ? AND routine_id IS ? AND id != ?`,
    [userId, row.from_exercise_id, routineId, row.id],
  );
  await d.runAsync(
    `INSERT OR REPLACE INTO exercise_slot_defaults
      (id, user_id, from_exercise_id, routine_id, exercise_id,
       created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id, userId, row.from_exercise_id, routineId, row.exercise_id,
      _tsToMs(row.created_at) ?? cloudUpdated,
      cloudUpdated,
      _tsToMs(row.deleted_at) ?? null,
    ],
  );
}

/**
 * Rewrite every Campaign 9 reference to `fromId` so it points at `toId`.
 *
 * Called from insertOrUpdateExerciseFromCloud's dedupe-by-name path, which
 * already remaps routine_exercises, workout_sets, exercise_user_notes and
 * exercise_goals. Without this the three intent tables would be left
 * pointing at an exercise id that no longer exists, so every exclusion,
 * every remembered swap and every approved default the user set would be
 * silently orphaned the first time two devices' canonical ids met.
 *
 * All FIVE id columns move, not just exercise_id: a swap references both
 * ends of the pair, and a slot default references both the slot it
 * replaces and the exercise that replaces it.
 *
 * exercise_intent and exercise_slot_defaults carry UNIQUE natural keys, so
 * the user may legitimately hold a row under BOTH ids. The loser (the
 * older updated_at) is dropped first; UPDATE OR REPLACE then covers the
 * tie. Everything is best-effort: on an install whose local schema predates
 * v73 the tables are absent and the remap is a no-op.
 */
export async function remapExerciseIdInIntentTables(d, fromId, toId) {
  if (!d || !fromId || !toId || fromId === toId) return;
  // exercise_intent, keyed UNIQUE(user_id, exercise_id).
  await d.runAsync(
    `DELETE FROM exercise_intent
      WHERE exercise_id = ?
        AND EXISTS (SELECT 1 FROM exercise_intent b
                     WHERE b.user_id = exercise_intent.user_id
                       AND b.exercise_id = ?
                       AND b.updated_at >= exercise_intent.updated_at)`,
    [fromId, toId],
  ).catch(() => {});
  await d.runAsync(
    'UPDATE OR REPLACE exercise_intent SET exercise_id = ? WHERE exercise_id = ?',
    [toId, fromId],
  ).catch(() => {});
  // exercise_swaps, append-only and unconstrained beyond its primary key.
  await d.runAsync(
    'UPDATE exercise_swaps SET from_exercise_id = ? WHERE from_exercise_id = ?',
    [toId, fromId],
  ).catch(() => {});
  await d.runAsync(
    'UPDATE exercise_swaps SET to_exercise_id = ? WHERE to_exercise_id = ?',
    [toId, fromId],
  ).catch(() => {});
  // exercise_slot_defaults: exercise_id is the replacement and sits outside
  // the natural key, so it moves plainly. from_exercise_id is part of
  // UNIQUE(user_id, from_exercise_id, routine_id) and needs the same
  // loser-first treatment as intent (routine_id compared with IS, it is
  // nullable).
  await d.runAsync(
    'UPDATE exercise_slot_defaults SET exercise_id = ? WHERE exercise_id = ?',
    [toId, fromId],
  ).catch(() => {});
  await d.runAsync(
    `DELETE FROM exercise_slot_defaults
      WHERE from_exercise_id = ?
        AND EXISTS (SELECT 1 FROM exercise_slot_defaults b
                     WHERE b.user_id = exercise_slot_defaults.user_id
                       AND b.from_exercise_id = ?
                       AND b.routine_id IS exercise_slot_defaults.routine_id
                       AND b.updated_at >= exercise_slot_defaults.updated_at)`,
    [fromId, toId],
  ).catch(() => {});
  await d.runAsync(
    'UPDATE OR REPLACE exercise_slot_defaults SET from_exercise_id = ? WHERE from_exercise_id = ?',
    [toId, fromId],
  ).catch(() => {});
}

// ─── Capability constraints (CC26 foundations) ───────────────────────────────
// The Article 9 capability lane (ARCHITECTURE.md sections 5-6; CAP laws).
// This file owns only rows; every decision lives in src/lib/capability/.
// Rows are append-only in meaning: a rule is never edited into a different
// rule - supersession ends the old row and inserts a new one, so the
// interval history that later campaigns join provenance against is never
// destroyed (CAP-14). Readers NEVER write (no expiry sweeps: the C31
// sweep-clobber class is designed out, ARCHITECTURE section 5.1).

function _mapCapabilityRow(r) {
  if (!r) return null;
  return {
    id: r.id, userId: r.user_id, role: r.role, source: r.source,
    ruleKind: r.rule_kind, ruleValue: r.rule_value, laterality: r.laterality,
    startsAt: r.starts_at, endsAt: r.ends_at, state: r.state,
    endedAt: r.ended_at, endedReason: r.ended_reason,
    episodeGroupId: r.episode_group_id, acknowledgedAt: r.acknowledged_at,
    // CC29 (section 14): the standing Apply/Decline; undefined on rows
    // read before the column migration ran maps to null (undecided).
    effectiveChoice: r.effective_choice ?? null,
    // CC33 D112 R8 (section 25): 'hold' | 'propose' | null, null = propose.
    adaptationMode: r.adaptation_mode ?? null,
    createdAt: r.created_at, updatedAt: r.updated_at, deletedAt: r.deleted_at,
  };
}

/**
 * Create one capability constraint row. Validation mirrors the CHECKs via
 * the pure model so an invalid combination can never reach the table.
 * Consent gating lives ABOVE this in src/lib/capability/store.js; this
 * function is the raw row writer.
 */
export async function createCapabilityConstraint(userId, input = {}, { nowMs = Date.now() } = {}) {
  if (!userId) return null;
  // eslint-disable-next-line global-require
  const { validateConstraintInput } = require('./capability/model');
  const verdict = validateConstraintInput(input);
  if (!verdict.ok) throw new Error(`capability_constraint_invalid:${verdict.reason}`);
  const d = await db();
  const id = uid();
  await d.runAsync(
    `INSERT INTO capability_constraints
       (id, user_id, role, source, rule_kind, rule_value, laterality,
        starts_at, ends_at, state, episode_group_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
    [id, userId, input.role, input.source, input.ruleKind, input.ruleValue,
      input.laterality ?? null, input.startsAt, input.endsAt ?? null,
      input.episodeGroupId ?? null, nowMs, nowMs],
  );
  _scheduleSync();
  return id;
}

/**
 * Create a set of constraints in ONE transaction (the multi-axis add
 * flow): all rows land or none do, so a mid-set failure can honestly
 * report "nothing was changed" (red-team finding 3). Inputs are all
 * validated BEFORE any write.
 */
export async function createCapabilityConstraints(userId, inputs = [], { nowMs = Date.now() } = {}) {
  if (!userId || !inputs.length) return [];
  // eslint-disable-next-line global-require
  const { validateConstraintInput } = require('./capability/model');
  for (const input of inputs) {
    const verdict = validateConstraintInput(input);
    if (!verdict.ok) throw new Error(`capability_constraint_invalid:${verdict.reason}`);
  }
  const d = await db();
  const ids = [];
  await runInTransaction(d, async () => {
    for (const input of inputs) {
      const id = uid();
      await d.runAsync(
        `INSERT INTO capability_constraints
           (id, user_id, role, source, rule_kind, rule_value, laterality,
            starts_at, ends_at, state, episode_group_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
        [id, userId, input.role, input.source, input.ruleKind, input.ruleValue,
          input.laterality ?? null, input.startsAt, input.endsAt ?? null,
          input.episodeGroupId ?? null, nowMs, nowMs],
      );
      ids.push(id);
    }
  });
  _scheduleSync();
  return ids;
}

/** All non-deleted rows for the user, newest first. */
export async function getCapabilityConstraints(userId, { includeEnded = true } = {}) {
  if (!userId) return [];
  const d = await db();
  const rows = await d.getAllAsync(
    `SELECT * FROM capability_constraints
      WHERE user_id = ? AND deleted_at IS NULL ${includeEnded ? '' : "AND state = 'active'"}
      ORDER BY created_at DESC`,
    [userId],
  );
  return (rows ?? []).map(_mapCapabilityRow);
}

/** Sync push reader: every row INCLUDING tombstones, so deletes propagate. */
export async function getAllCapabilityConstraintsForUser(userId) {
  if (!userId) return [];
  const d = await db();
  const rows = await d.getAllAsync(
    'SELECT * FROM capability_constraints WHERE user_id = ?', [userId],
  );
  return (rows ?? []).map(_mapCapabilityRow);
}

/** End one constraint. Only the ending fields ever mutate (CAP-14). */
export async function endCapabilityConstraint(userId, id, reason, { nowMs = Date.now() } = {}) {
  if (!userId || !id) return false;
  const d = await db();
  const res = await d.runAsync(
    `UPDATE capability_constraints
        SET state = 'ended', ended_at = ?, ended_reason = ?, updated_at = ?
      WHERE id = ? AND user_id = ? AND state = 'active' AND deleted_at IS NULL`,
    [nowMs, reason, nowMs, id, userId],
  );
  if (res?.changes) _scheduleSync();
  return !!res?.changes;
}

/** End every active row of one episode group in one transaction. */
export async function endCapabilityEpisode(userId, episodeGroupId, reason, { nowMs = Date.now() } = {}) {
  if (!userId || !episodeGroupId) return 0;
  const d = await db();
  const res = await d.runAsync(
    `UPDATE capability_constraints
        SET state = 'ended', ended_at = ?, ended_reason = ?, updated_at = ?
      WHERE user_id = ? AND episode_group_id = ? AND state = 'active' AND deleted_at IS NULL`,
    [nowMs, reason, nowMs, userId, episodeGroupId],
  );
  if (res?.changes) _scheduleSync();
  return res?.changes ?? 0;
}

/**
 * Extend (or shorten) an episode's planned end. ends_at is a lifecycle
 * field, not rule meaning, so an in-place update is inside the
 * append-only-in-meaning law (ARCHITECTURE section 5.1).
 */
export async function extendCapabilityEpisode(userId, episodeGroupId, newEndsAtMs, { nowMs = Date.now() } = {}) {
  if (!userId || !episodeGroupId) return 0;
  const d = await db();
  const res = await d.runAsync(
    `UPDATE capability_constraints
        SET ends_at = ?, updated_at = ?
      WHERE user_id = ? AND episode_group_id = ? AND state = 'active' AND deleted_at IS NULL`,
    [newEndsAtMs ?? null, nowMs, userId, episodeGroupId],
  );
  if (res?.changes) _scheduleSync();
  return res?.changes ?? 0;
}

/**
 * "Keep it active for now" - the third AWAITING option (ARCHITECTURE
 * section 33.7): an explicit continue that stamps the cadence anchor
 * WITHOUT changing the planned end. The prompt cadence that reads
 * acknowledged_at arrives with the coach/notification campaign; the
 * anchor is durable state, so it lands with the schema (CC26) and syncs
 * like every other capability field. Constraints keep applying
 * throughout (fail-safe unchanged); never auto-ends.
 */
export async function acknowledgeCapabilityEpisode(userId, episodeGroupId, { nowMs = Date.now() } = {}) {
  if (!userId || !episodeGroupId) return 0;
  const d = await db();
  const res = await d.runAsync(
    `UPDATE capability_constraints
        SET acknowledged_at = ?, updated_at = ?
      WHERE user_id = ? AND episode_group_id = ? AND state = 'active' AND deleted_at IS NULL`,
    [nowMs, nowMs, userId, episodeGroupId],
  );
  if (res?.changes) _scheduleSync();
  return res?.changes ?? 0;
}

/**
 * "This is how I train now" (CAP-16, ARCHITECTURE section 24). Ends every
 * active row of the episode with reason 'promoted' and inserts a BASELINE
 * copy of each (new id, no group, no planned end, starts now). One
 * transaction; idempotent - a group with no active rows promotes nothing,
 * so a double-tap or a cross-device race cannot duplicate baselines
 * (section 33.9: the union of duplicates is safe, the promote itself is
 * exactly-once per live row).
 */
export async function promoteCapabilityEpisode(userId, episodeGroupId, { nowMs = Date.now() } = {}) {
  if (!userId || !episodeGroupId) return [];
  const d = await db();
  const createdIds = [];
  await runInTransaction(d, async () => {
    const live = await d.getAllAsync(
      `SELECT * FROM capability_constraints
        WHERE user_id = ? AND episode_group_id = ? AND state = 'active' AND deleted_at IS NULL`,
      [userId, episodeGroupId],
    );
    for (const r of live ?? []) {
      await d.runAsync(
        `UPDATE capability_constraints
            SET state = 'ended', ended_at = ?, ended_reason = 'promoted', updated_at = ?
          WHERE id = ?`,
        [nowMs, nowMs, r.id],
      );
      // exercise_allow rows are per-exercise carve-outs; they promote too,
      // keeping the user's recorded allowances part of their normal.
      const id = uid();
      await d.runAsync(
        `INSERT INTO capability_constraints
           (id, user_id, role, source, rule_kind, rule_value, laterality,
            starts_at, ends_at, state, episode_group_id, created_at, updated_at)
         VALUES (?, ?, 'baseline', ?, ?, ?, ?, ?, NULL, 'active', NULL, ?, ?)`,
        [id, userId, r.source, r.rule_kind, r.rule_value, r.laterality, nowMs, nowMs, nowMs],
      );
      createdIds.push(id);
    }
  });
  if (createdIds.length) _scheduleSync();
  return createdIds;
}

/** Supersede: end the old row and insert the corrected one, atomically. */
export async function supersedeCapabilityConstraint(userId, id, newInput, { nowMs = Date.now() } = {}) {
  if (!userId || !id) return null;
  // eslint-disable-next-line global-require
  const { validateConstraintInput } = require('./capability/model');
  const verdict = validateConstraintInput(newInput);
  if (!verdict.ok) throw new Error(`capability_constraint_invalid:${verdict.reason}`);
  const d = await db();
  let newId = null;
  await runInTransaction(d, async () => {
    const res = await d.runAsync(
      `UPDATE capability_constraints
          SET state = 'ended', ended_at = ?, ended_reason = 'superseded', updated_at = ?
        WHERE id = ? AND user_id = ? AND state = 'active' AND deleted_at IS NULL`,
      [nowMs, nowMs, id, userId],
    );
    if (!res?.changes) return; // nothing live to supersede; insert nothing
    newId = uid();
    await d.runAsync(
      `INSERT INTO capability_constraints
         (id, user_id, role, source, rule_kind, rule_value, laterality,
          starts_at, ends_at, state, episode_group_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
      [newId, userId, newInput.role, newInput.source, newInput.ruleKind,
        newInput.ruleValue, newInput.laterality ?? null, newInput.startsAt,
        newInput.endsAt ?? null, newInput.episodeGroupId ?? null, nowMs, nowMs],
    );
  });
  if (newId) _scheduleSync();
  return newId;
}

/**
 * Consent withdrawal / erasure (CAP-20): tombstone every row so the
 * removal PROPAGATES to the user's other devices through sync; the cloud
 * side hard-purges tombstones on its standing schedule, and account
 * deletion hard-deletes via delete_user_data (migrate_145). Local hard
 * delete happens on the user-boundary wipe as for every other table.
 */
export async function tombstoneAllCapabilityConstraints(userId, { nowMs = Date.now() } = {}) {
  if (!userId) return 0;
  const d = await db();
  const res = await d.runAsync(
    `UPDATE capability_constraints SET deleted_at = ?, updated_at = ?
      WHERE user_id = ? AND deleted_at IS NULL`,
    [nowMs, nowMs, userId],
  );
  if (res?.changes) _scheduleSync();
  return res?.changes ?? 0;
}

/**
 * Pull-side applier: strictly-newer last-write-wins on updated_at, the
 * registry contract (sync/tables/weeklyCheckins.js precedent). A local
 * write that has not pushed yet is never clobbered by an older cloud row,
 * and a NEWER tombstone always beats an older active copy - retirement can
 * never resurrect (CC26 sync law).
 */
export async function insertCapabilityConstraintFromCloud(localUserId, row) {
  if (!localUserId || !row?.id) return false;
  const d = await db();
  const cloudUpdated = _tsToMs(row.updated_at) ?? 0;
  const existing = await d.getFirstAsync(
    'SELECT updated_at FROM capability_constraints WHERE id = ?', [row.id],
  );
  if (existing && (existing.updated_at ?? 0) >= cloudUpdated) return false;
  await d.runAsync(
    `INSERT OR REPLACE INTO capability_constraints
       (id, user_id, role, source, rule_kind, rule_value, laterality,
        starts_at, ends_at, state, ended_at, ended_reason, episode_group_id,
        acknowledged_at, effective_choice, adaptation_mode, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [row.id, localUserId, row.role, row.source, row.rule_kind, row.rule_value,
      row.laterality ?? null, _tsToMs(row.starts_at), _tsToMs(row.ends_at),
      row.state, _tsToMs(row.ended_at), row.ended_reason ?? null,
      row.episode_group_id ?? null, _tsToMs(row.acknowledged_at),
      row.effective_choice ?? null,
      // CC33 D112 R8: tolerant of a cloud without migrate_152 - absent
      // reads null, which means 'propose', the standing default.
      row.adaptation_mode ?? null,
      _tsToMs(row.created_at) ?? cloudUpdated,
      cloudUpdated, _tsToMs(row.deleted_at)],
  );
  return true;
}

// CC29 (section 14): the standing Apply/Decline on an EPISODE rule's
// session effect. Only the choice column moves; the rule itself is never
// edited (CAP-14), and updated_at moves because this IS a user decision.
export async function setConstraintEffectiveChoice(userId, constraintId, choice) {
  if (!userId || !constraintId) return;
  if (choice !== 'applied' && choice !== 'declined' && choice !== null) return;
  const d = await db();
  await d.runAsync(
    'UPDATE capability_constraints SET effective_choice = ?, updated_at = ? WHERE id = ? AND user_id = ?',
    [choice, Date.now(), constraintId, userId],
  );
  _scheduleSync();
}

// CC33 D112 R8 (section 25; closes audit T2-26): the per-episode "just
// hold my plan" choice, written to every ACTIVE row of the group so the
// whole episode holds or proposes as one. Only the mode column moves;
// the rules themselves are never edited (CAP-14), and updated_at moves
// because this IS a user decision. 'propose' is stored as NULL (the
// default), keeping pre-migration rows and reset rows identical.
export async function setCapabilityAdaptationMode(userId, episodeGroupId, mode) {
  if (!userId || !episodeGroupId) return;
  if (mode !== 'hold' && mode !== 'propose') return;
  const d = await db();
  await d.runAsync(
    `UPDATE capability_constraints
        SET adaptation_mode = ?, updated_at = ?
      WHERE user_id = ? AND episode_group_id = ? AND state = 'active' AND deleted_at IS NULL`,
    [mode === 'hold' ? 'hold' : null, Date.now(), userId, episodeGroupId],
  );
  _scheduleSync();
}

// ── session_constraint_effects (schema foundation; writers arrive in CC29) ──

// CC29: one effects record per workout, merged so the serve pass, the
// mid-session removal hook (section 17) and the completion writer never
// duplicate or clobber each other's entries.
//
// Round 9 (R9-1) reverted round 8's replaceSource: replacing serve's
// prior entries was a real deletion (a later pass runs over the reduced
// list and cannot re-derive an omission made for a row it can no longer
// see). Serve still tags its entries source:'serve' - forensics only,
// replaced never. Round 10 corrected the round-9 wording: a second
// serve pass IS reachable (removing or swapping away the last
// substituted row clears the _capabilityTemp markers the relaunch
// guard checks), which changes nothing about the revert's conclusion.
//
// Round 10 (R10-1): the record's identity is the PLANNED SLOT, not the
// exercise. One exercise legitimately fills two slots of one workout
// (a doubled quads movement is ordinary programming), and the old
// (effect, exerciseFrom) key silently collapsed the second slot's true
// entry - the receipt said one swap where two happened. Writers stamp
// rowId (the slot's own stable id) and the key is
// (effect, exerciseFrom, rowId). Rounds 11-14 closed the keyless
// sources, then the class: the store's withSetsArrays chokepoint
// mints a slot id for any keyless entry, and since round 14 every
// path that CREATES session entries runs through it (startWorkout,
// restore, setWorkoutExercises, addExerciseToWorkout - the round-14
// review proved the round-13 "cannot ship keyless" claim had two
// holes, both closed: a null entry and the picker append). A null
// rowId therefore means a legacy RECORD written before the upgrades;
// the tolerance for those is counted - one keyless entry absorbs
// exactly one keyed re-derivation, never a whole slot set. The `slot` field is
// informational only: each writer stamps its own list's index (serve
// the pass's input, removal the current list, completion the
// snapshot), so those spaces are not one space and slot is never part
// of the key.
//
// Round 10 (R10-3) + round 11 (R11-1): the record corrects itself
// FORWARD on the session's own logged facts. A movement the user
// overrode by re-adding and TRAINING is no longer something the
// restriction kept out of this session - the completion writer passes
// performedIds and any omitted OR substituted entry whose exerciseFrom
// was performed is renamed with a _revoked suffix (kept, never
// deleted: the serve-time fact still happened). Every reader matches
// effects strictly ('omitted' / 'substituted', or the quoted-LIKE
// counters), so a revoked entry drops out of every count without a
// reader change.
export async function appendSessionConstraintEffects(userId, workoutId, newEntries, { nowMs = Date.now(), performedIds = null } = {}) {
  const adds = Array.isArray(newEntries) ? newEntries : [];
  const performed = Array.isArray(performedIds) ? performedIds.filter(Boolean) : [];
  if (!userId || !workoutId || (!adds.length && !performed.length)) return null;
  const d = await db();
  const id = `sce_${workoutId}`;
  const existing = await d.getFirstAsync(
    'SELECT effects_json FROM session_constraint_effects WHERE id = ? AND deleted_at IS NULL', [id],
  ).catch(() => null);
  let entries = [];
  try { entries = existing?.effects_json ? JSON.parse(existing.effects_json) : []; } catch (_e) { entries = []; }
  // A reconcile-only call (no new entries) with no record to correct.
  if (!entries.length && !adds.length) return null;
  const keyOf = (e) => `${e.effect}:${e.exerciseFrom}:${e.rowId ?? ''}`;
  const seen = new Set(entries.map(keyOf));
  // Per-exercise view of what already stands, for the two legacy shapes.
  // Round 11 (R11-2): the legacy tolerance is COUNTED, not blanket - a
  // keyless entry is one recorded fact, so it may absorb exactly ONE
  // keyed re-derivation of that fact; the round-10 set let a single
  // stale keyless entry suppress every keyed slot of the exercise, which
  // deleted a true second slot the moment a legacy record met new code.
  const byExercise = new Set(entries.map((e) => `${e.effect}:${e.exerciseFrom}`));
  const legacyCredit = new Map();
  for (const e of entries) {
    if (e.rowId != null) continue;
    const k = `${e.effect}:${e.exerciseFrom}`;
    legacyCredit.set(k, (legacyCredit.get(k) ?? 0) + 1);
  }
  let changed = false;
  for (const entry of adds) {
    const exKey = `${entry.effect}:${entry.exerciseFrom}`;
    // A keyed entry never doubles a legacy record of the same fact (one
    // credit per legacy entry), and a keyless entry never doubles ANY
    // record of it.
    if (entry.rowId != null && (legacyCredit.get(exKey) ?? 0) > 0) {
      legacyCredit.set(exKey, legacyCredit.get(exKey) - 1);
      continue;
    }
    if (entry.rowId == null && byExercise.has(exKey)) continue;
    const key = keyOf(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    byExercise.add(exKey);
    if (entry.rowId == null) legacyCredit.set(exKey, (legacyCredit.get(exKey) ?? 0) + 1);
    entries.push(entry);
    changed = true;
  }
  if (performed.length) {
    const performedSet = new Set(performed);
    entries = entries.map((e) => {
      // Round 11 (R11-1): the SUBSTITUTED lane corrects forward too.
      // The excluded movement being performed falsifies both lanes'
      // claims the same way - the restriction did not, in the end, keep
      // it out - so a substitution whose original was trained revokes
      // exactly as an omission does (the swap-back amend path already
      // rules the in-session version of the same fact).
      if ((e?.effect === 'omitted' || e?.effect === 'substituted') && performedSet.has(e.exerciseFrom)) {
        changed = true;
        return { ...e, effect: `${e.effect}_revoked` };
      }
      return e;
    });
  }
  if (!changed) return null;
  return createSessionConstraintEffect(userId, workoutId, entries, { nowMs });
}

// Round 10 (R10-2): when the user manually swaps away a row serve
// substituted in, the slot's substitution entry is amended to name what
// actually stood in the slot - the user's own pick, stamped
// toChosenByUser so no surface attributes their choice to the app. A
// swap back to the ORIGINAL excluded exercise revokes the entry
// instead (the change did not keep the movement out), the same
// forward-only correction shape as R10-3's omitted_revoked.
export async function amendSessionConstraintSubstitution(userId, workoutId, { exerciseFrom, rowId = null, exerciseTo } = {}) {
  if (!userId || !workoutId || !exerciseFrom || !exerciseTo) return null;
  const d = await db();
  const id = `sce_${workoutId}`;
  const existing = await d.getFirstAsync(
    'SELECT effects_json FROM session_constraint_effects WHERE id = ? AND deleted_at IS NULL', [id],
  ).catch(() => null);
  let entries = [];
  try { entries = existing?.effects_json ? JSON.parse(existing.effects_json) : []; } catch (_e) { entries = []; }
  if (!entries.length) return null;
  let changed = false;
  entries = entries.map((e) => {
    // Round 11 (R11-2): AT MOST ONE entry is ever amended. When either
    // side lacks a rowId the match is ambiguous across duplicate slots,
    // and the round-10 map rewrote every slot of the exercise off one
    // swap; a single correction for a single swap is the honest bound.
    if (changed) return e;
    if (e?.effect !== 'substituted' || e.exerciseFrom !== exerciseFrom) return e;
    // With both sides keyed, a different slot's entry stays untouched.
    if (rowId != null && e.rowId != null && e.rowId !== rowId) return e;
    changed = true;
    if (exerciseTo === exerciseFrom) return { ...e, effect: 'substituted_revoked' };
    return { ...e, exerciseTo, toChosenByUser: true };
  });
  if (!changed) return null;
  return createSessionConstraintEffect(userId, workoutId, entries, { nowMs: Date.now() });
}

// Round 11 (R11-1, the removal half): removing a serve substitute ends
// the substitution without anything standing in the slot - the excluded
// original never happened and nothing did in its place, which is an
// OMISSION in the record's own vocabulary, so the entry converts (same
// rowId and drivers; the substitute's identity drops with the claim it
// stood). Without this the record kept claiming a substitution the user
// deleted, and the receipt named a movement that was never trained.
// Same single-entry discipline as the amend above.
//
// Round 12 (R12-1): the SLOT'S RECORD is the identity, never only the
// in-memory marker - a swap clears _capabilityTemp, so a swap-then-
// remove chain left the entry standing stale (amended to the user's
// pick, then deleted, still rendered on the receipt). The caller may
// now pass rowId ALONE; a rowId-only match is exact (both keyed and
// equal), so it can never convert a different slot's entry, and a slot
// with no substitution entry is a clean no-op.
export async function convertSessionConstraintSubstitutionToOmission(userId, workoutId, { exerciseFrom = null, rowId = null } = {}) {
  if (!userId || !workoutId || (!exerciseFrom && rowId == null)) return null;
  const d = await db();
  const id = `sce_${workoutId}`;
  const existing = await d.getFirstAsync(
    'SELECT effects_json FROM session_constraint_effects WHERE id = ? AND deleted_at IS NULL', [id],
  ).catch(() => null);
  let entries = [];
  try { entries = existing?.effects_json ? JSON.parse(existing.effects_json) : []; } catch (_e) { entries = []; }
  if (!entries.length) return null;
  let changed = false;
  entries = entries.map((e) => {
    if (changed) return e;
    if (e?.effect !== 'substituted') return e;
    if (exerciseFrom) {
      if (e.exerciseFrom !== exerciseFrom) return e;
      if (rowId != null && e.rowId != null && e.rowId !== rowId) return e;
    } else {
      // rowId-only: exact match, never ambiguous.
      if (e.rowId == null || e.rowId !== rowId) return e;
    }
    changed = true;
    const converted = { ...e, effect: 'omitted' };
    delete converted.exerciseTo;
    delete converted.toChosenByUser;
    return converted;
  });
  if (!changed) return null;
  return createSessionConstraintEffect(userId, workoutId, entries, { nowMs: Date.now() });
}

export async function getSessionConstraintEffect(userId, workoutId) {
  if (!userId || !workoutId) return null;
  const d = await db();
  const row = await d.getFirstAsync(
    'SELECT * FROM session_constraint_effects WHERE workout_id = ? AND user_id = ? AND deleted_at IS NULL',
    [workoutId, userId],
  ).catch(() => null);
  if (!row) return null;
  const out = rowToCamel(row);
  try { out.effects = JSON.parse(out.effectsJson ?? '[]'); } catch (_e) { out.effects = []; }
  return out;
}

/**
 * CC30 (BD-D7): every constraint-effects record for a set of workouts in
 * one read - the block ledger's per-muscle EFFECTIVE-planned input.
 * Returns [{ workoutId, effects: [...] }]; workouts with no record are
 * simply absent.
 */
export async function getSessionConstraintEffectsForWorkouts(userId, workoutIds = []) {
  if (!userId || !Array.isArray(workoutIds) || workoutIds.length === 0) return [];
  const d = await db();
  const out = [];
  for (let i = 0; i < workoutIds.length; i += 200) {
    const slice = workoutIds.slice(i, i + 200);
    const marks = slice.map(() => '?').join(',');
    // eslint-disable-next-line no-await-in-loop
    const rows = await d.getAllAsync(
      `SELECT workout_id, effects_json FROM session_constraint_effects
        WHERE user_id = ? AND deleted_at IS NULL AND workout_id IN (${marks})`,
      [userId, ...slice],
    ).catch(() => []);
    for (const r of rows ?? []) {
      let effects = [];
      try { effects = JSON.parse(r.effects_json ?? '[]'); } catch (_e) { effects = []; }
      out.push({ workoutId: r.workout_id, effects });
    }
  }
  return out;
}

/**
 * CC30 (BD-D7): planned (recommended) sets per routine exercise, keyed
 * `${routineId}|${exerciseId}`, so an omitted slot's planned dose can be
 * removed from the ledger's per-muscle denominator.
 */
export async function getRoutineExerciseSetsMap(routineIds = []) {
  const map = new Map();
  if (!Array.isArray(routineIds) || routineIds.length === 0) return map;
  const d = await db();
  for (let i = 0; i < routineIds.length; i += 200) {
    const slice = routineIds.slice(i, i + 200);
    const marks = slice.map(() => '?').join(',');
    // eslint-disable-next-line no-await-in-loop
    const rows = await d.getAllAsync(
      `SELECT routine_id, exercise_id, recommended_sets FROM routine_exercises
        WHERE routine_id IN (${marks})`,
      slice,
    ).catch(() => []);
    for (const r of rows ?? []) {
      map.set(`${r.routine_id}|${r.exercise_id}`, r.recommended_sets ?? 3);
    }
  }
  return map;
}

export async function createSessionConstraintEffect(userId, workoutId, effects, { nowMs = Date.now() } = {}) {
  if (!userId || !workoutId) return null;
  const d = await db();
  const id = `sce_${workoutId}`;
  // Round 12 (I2): deleted_at is PRESERVED across the replace, exactly
  // as created_at is - the old column list silently reverted a
  // tombstone to NULL, so one racing best-effort effects write after a
  // discard resurrected the dead record into sync and the export.
  await d.runAsync(
    `INSERT OR REPLACE INTO session_constraint_effects
       (id, user_id, workout_id, effects_json, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, COALESCE((SELECT created_at FROM session_constraint_effects WHERE id = ?), ?), ?,
             (SELECT deleted_at FROM session_constraint_effects WHERE id = ?))`,
    [id, userId, workoutId, JSON.stringify(effects ?? []), id, nowMs, nowMs, id],
  );
  _scheduleSync();
  return id;
}

export async function getAllSessionConstraintEffectsForUser(userId) {
  if (!userId) return [];
  const d = await db();
  const rows = await d.getAllAsync(
    'SELECT * FROM session_constraint_effects WHERE user_id = ?', [userId],
  );
  return (rows ?? []).map(r => ({
    id: r.id, userId: r.user_id, workoutId: r.workout_id,
    effectsJson: r.effects_json, createdAt: r.created_at,
    updatedAt: r.updated_at, deletedAt: r.deleted_at,
  }));
}

export async function insertSessionConstraintEffectFromCloud(localUserId, row) {
  if (!localUserId || !row?.id) return false;
  const d = await db();
  const cloudUpdated = _tsToMs(row.updated_at) ?? 0;
  const existing = await d.getFirstAsync(
    'SELECT updated_at FROM session_constraint_effects WHERE id = ?', [row.id],
  );
  if (existing && (existing.updated_at ?? 0) >= cloudUpdated) return false;
  await d.runAsync(
    `INSERT OR REPLACE INTO session_constraint_effects
       (id, user_id, workout_id, effects_json, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [row.id, localUserId, row.workout_id, row.effects_json ?? '[]',
      _tsToMs(row.created_at) ?? cloudUpdated, cloudUpdated, _tsToMs(row.deleted_at)],
  );
  return true;
}
