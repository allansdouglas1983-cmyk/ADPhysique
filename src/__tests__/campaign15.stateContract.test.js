/**
 * campaign15.stateContract.test.js — Campaign 15 job 8: the shipped
 * cross-device contract, as a table the build checks rather than a
 * document someone has to remember to update.
 *
 * What this suite pins and why:
 *
 * Every previous campaign answered "does THIS state come back?" one
 * family at a time. Nothing answered "for every family the app ships,
 * what is the authority, how does it travel, where does it land, who
 * wins a conflict, and what does a reinstall actually leave the user
 * with?" - and nothing stopped a new family shipping with no answer at
 * all, which is exactly how the adaptation-event restore came to write
 * into a table no reader used.
 *
 * So the matrix below is the contract, and the tests check the code
 * against it. Two kinds of failure are both useful: a row that stops
 * being true, and a family that appears in the app without appearing
 * here. The completeness guard at the end is the second one.
 *
 * Three reinstall outcomes are legitimate, and the difference matters:
 *
 *   RESTORED            comes back from the cloud
 *   DERIVED             not stored; recomputed from restored inputs
 *   EXPECTED_LOCAL_LOSS deliberately never leaves the device
 *
 * The last one is a product decision, not a defect. Progress-photo image
 * files and the ED/wellbeing family are local by design, and this
 * campaign pins that rather than "fixing" it to make a matrix green.
 */

const fs = require('fs');
const path = require('path');

const src = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const DATABASE = src('lib/database.js');
const SYNC = src('lib/sync.js');
const REGISTRY = src('lib/sync/registry.js');

const { SYNC_REGISTRY } = require('../lib/sync/registry');
const { BACKUP_TABLES } = require('../lib/database');

const RESTORED = 'RESTORED';
const DERIVED = 'DERIVED';
const EXPECTED_LOCAL_LOSS = 'EXPECTED_LOCAL_LOSS';

/**
 * The contract. `authority` is the store that DECIDES the value;
 * `mechanism` is how it crosses devices; `destination` is where a restore
 * puts it; `conflict` is the rule that settles two copies.
 */
const CONTRACT = [
  {
    state: 'capability constraints (CC26 capability lane)',
    authority: 'local SQLite (capability_constraints)',
    mechanism: 'registry engine (sync/tables/capabilityConstraints.js)',
    applier: 'insertCapabilityConstraintFromCloud',
    destination: 'capability_constraints',
    conflict: 'strictly-newer last-write-wins on updated_at; a newer tombstone beats an older active row, so retirement never resurrects; server refuse-stale trigger (migrate_145)',
    reinstall: RESTORED,
  },
  {
    state: 'session constraint effects (CC26 schema; CC29 writers)',
    authority: 'local SQLite (session_constraint_effects)',
    mechanism: 'registry engine (sync/tables/sessionConstraintEffects.js)',
    applier: 'insertSessionConstraintEffectFromCloud',
    destination: 'session_constraint_effects',
    conflict: 'strictly-newer last-write-wins on updated_at (migrate_146 trigger)',
    reinstall: RESTORED,
  },
  {
    state: 'plans and routines',
    authority: 'local SQLite (programmes, routines)',
    mechanism: 'legacy bulk pull',
    applier: 'insertProgrammeFromCloud',
    destination: 'programmes',
    conflict: 'last-write-wins on updated_at',
    reinstall: RESTORED,
  },
  {
    state: 'mesocycles (blocks)',
    authority: 'local SQLite (mesocycles)',
    mechanism: 'legacy bulk pull',
    applier: 'insertMesocycleFromCloud',
    destination: 'mesocycles',
    conflict: 'last-write-wins, with a ledger ratchet: a cloud row carrying no ledger never nulls a local one',
    reinstall: RESTORED,
  },
  {
    state: 'Block Ledger',
    authority: 'the mesocycles.block_ledger column',
    mechanism: 'travels inside the mesocycle row',
    applier: 'insertMesocycleFromCloud',
    destination: 'mesocycles.block_ledger',
    conflict: 'ratcheted: present beats absent, so a pre-ledger device cannot erase judged history',
    reinstall: RESTORED,
  },
  {
    state: 'planned muscle volume and its provenance',
    authority: 'local SQLite (planned_muscle_volume)',
    mechanism: 'legacy bulk pull',
    applier: 'insertOrUpdatePlannedMuscleVolumeFromCloud',
    destination: 'planned_muscle_volume',
    conflict: 'last-write-wins; a pre-132 row with no source degrades to the honest research label',
    reinstall: RESTORED,
  },
  {
    state: 'manual volume intent (pin and release)',
    authority: "the '@volyume_landmarks_<uid>' guarded preference",
    mechanism: 'generic pref sync',
    applier: null,
    destination: 'AsyncStorage',
    conflict: 'guarded: the freshest real user edit wins, in both directions',
    reinstall: RESTORED,
  },
  {
    state: 'learned ranges, establishedStart, probe eligibility',
    authority: 'none: computed from Block Ledger history at read time',
    mechanism: 'none of its own',
    applier: null,
    destination: 'nothing is stored',
    conflict: 'not applicable; it inherits the ledgers it is built from',
    reinstall: DERIVED,
  },
  {
    state: 'coaching apply receipt',
    authority: 'local SQLite (coach_outputs.output_json)',
    mechanism: 'legacy bulk pull',
    applier: 'insertCoachOutputFromCloud',
    destination: 'coach_outputs',
    conflict: 'last-write-wins with an applied-receipt ratchet, so a view-only newer row cannot re-arm Apply',
    reinstall: RESTORED,
  },
  {
    state: 'adaptation events (Engine Log, revert memory, weekly caps)',
    authority: 'local SQLite (adaptation_events)',
    mechanism: 'legacy bulk pull',
    applier: 'insertOrUpdateAdaptationEventFromCloud',
    destination: 'adaptation_events, plus the adaptation_events_sync mirror',
    conflict: 'INSERT OR IGNORE on id: a restored event never overwrites a newer local one, and cannot duplicate',
    reinstall: RESTORED,
  },
  {
    state: 'generic synced preferences',
    authority: 'AsyncStorage, allowlisted by shouldSyncPref',
    mechanism: 'generic pref sync (user_prefs)',
    applier: null,
    destination: 'AsyncStorage',
    conflict: 'cloud wins for ordinary keys; guarded families resolve by edit stamp; an empty value is a tombstone',
    reinstall: RESTORED,
  },
  {
    state: 'notification preferences',
    authority: "the '@volyume_notification_prefs' guarded preference",
    mechanism: 'generic pref sync, with notification_preferences rows as an outbound projection for the server',
    applier: null,
    destination: 'AsyncStorage (the projection lands in SQLite but is never read back on device)',
    conflict: 'guarded by edit stamp; the projection never decides',
    reinstall: RESTORED,
  },
  {
    state: 'exercise exclusions and preferences',
    authority: 'local SQLite (exercise_intent, exercise_swaps)',
    mechanism: 'legacy bulk pull',
    applier: 'insertOrUpdateExerciseIntentFromCloud',
    destination: 'exercise_intent',
    conflict: 'last-write-wins including tombstones, so "allow this again" reaches other devices',
    reinstall: RESTORED,
  },
  {
    state: 'morning weights',
    authority: 'local SQLite (morning_weights)',
    mechanism: 'legacy bulk pull',
    applier: 'insertMorningWeightFromCloud',
    destination: 'morning_weights',
    conflict: 'last-write-wins; a local tombstone is never resurrected by an older cloud copy',
    reinstall: RESTORED,
  },
  {
    state: 'progress scan measurements and estimates',
    authority: 'local SQLite (progress_scan_sessions)',
    mechanism: 'JSON backup only: no cloud applier exists',
    applier: null,
    destination: 'progress_scan_sessions, via a user-driven backup restore',
    conflict: 'not applicable: one device at a time, by design',
    reinstall: EXPECTED_LOCAL_LOSS,
  },
  {
    state: 'progress photo and avatar image FILES',
    authority: 'the device filesystem',
    mechanism: 'none: files never leave the device',
    applier: null,
    destination: 'nowhere',
    conflict: 'not applicable',
    reinstall: EXPECTED_LOCAL_LOSS,
  },
  {
    state: 'ED and wellbeing screening state',
    authority: 'the device (raw answers), the server (the ED flag)',
    mechanism: 'raw answers never sync; the cloud flag is pull-only and server-authoritative',
    applier: null,
    destination: 'local only for answers; the flag is read, never written, by the device',
    conflict: 'not applicable: the device is not a writer (D92-11 holds)',
    reinstall: EXPECTED_LOCAL_LOSS,
  },
];

describe('C15-8 every contracted state family matches the code', () => {
  test.each(CONTRACT.filter(r => r.applier))(
    '$state: the named restore applier exists and writes the named destination',
    ({ applier, destination }) => {
      expect(DATABASE).toContain(`export async function ${applier}`);
      const start = DATABASE.indexOf(`export async function ${applier}`);
      const body = DATABASE.slice(start, start + 4000);
      const table = destination.split(',')[0].split('.')[0].trim();
      expect(body).toContain(table);
    },
  );

  test.each(CONTRACT.filter(r => r.reinstall === EXPECTED_LOCAL_LOSS))(
    '$state: has no cloud applier and no registry entry, as its contract says',
    ({ state }) => {
      if (/photo|scan/i.test(state)) {
        expect(DATABASE).not.toMatch(/insertProgressScanSessionFromCloud/);
        expect(DATABASE).not.toMatch(/insertProgressPhoto\w*FromCloud/);
        expect(REGISTRY).not.toMatch(/progress_photo|progress_scan/);
      }
      if (/ED and wellbeing/.test(state)) {
        // The one asymmetry worth stating precisely: a cloud ED-flag table
        // exists, but the device only READS it. D92-11 is about the device
        // publishing local state, and that writer still does not exist.
        const entry = REGISTRY.slice(REGISTRY.indexOf("table: 'ed_pattern_flags'"));
        expect(entry.slice(0, 300)).toMatch(/direction: 'pull_only'/);
        expect(REGISTRY).not.toMatch(/scoff/i);
      }
    },
  );

  test('the derived family really is derived: nothing stores it', () => {
    const derived = CONTRACT.filter(r => r.reinstall === DERIVED);
    expect(derived).toHaveLength(1);
    // Learned ranges have no table, no applier and no registry entry.
    // They come back because the ledgers they are built from come back.
    expect(REGISTRY).not.toMatch(/learned_range|established_start/);
    expect(DATABASE).not.toMatch(/CREATE TABLE IF NOT EXISTS learned_ranges/);
  });

  test('the preference-backed families are allowlisted and guarded', () => {
    const { shouldSyncPref, isGuardedPref } = jest.requireActual('../lib/sync');
    expect(shouldSyncPref('@volyume_landmarks_abc')).toBe(true);
    expect(isGuardedPref('@volyume_landmarks_abc')).toBe(true);
    expect(shouldSyncPref('@volyume_notification_prefs')).toBe(true);
    expect(isGuardedPref('@volyume_notification_prefs')).toBe(true);
  });

  test('the conflict rules named in the contract exist in the code', () => {
    // Each of these is the exact mechanism a row claims, so a silent
    // removal shows up here rather than in a user's data.
    expect(SYNC).toMatch(/filterGuardedPulledPrefs/);          // guarded pref stamps
    expect(SYNC).toMatch(/_dropStaleGuardedPushes/);           // the push half
    expect(DATABASE).toMatch(/INSERT OR IGNORE INTO adaptation_events/);
    expect(DATABASE).toMatch(/appliedAdjustments/);            // the receipt ratchet
  });
});

describe('C15-8 nothing ships without an entry in the contract', () => {
  // The guard that makes this a contract rather than a snapshot. A new
  // synced table or a new backed-up table has to be classified here, which
  // is the step that was missing when adaptation events were restored into
  // a table nothing read.
  const CONTRACTED_TABLES = new Set([
    'programmes', 'routines', 'routine_exercises', 'mesocycles', 'mesocycle_weeks',
    'planned_muscle_volume', 'coach_outputs', 'adaptation_events', 'adaptation_events_sync',
    'exercise_intent', 'exercise_swaps', 'exercise_slot_defaults', 'morning_weights',
    'progress_scan_sessions', 'progress_scan_assets', 'progress_photo_meta',
    'workouts', 'workout_sets', 'exercises', 'custom_exercises',
  ]);

  // Families this contract deliberately scopes OUT, each with the campaign
  // that owns them. Listing them is the point: they are decided, not
  // forgotten.
  const OUT_OF_SCOPE = new Set([
    'food_entries', 'custom_foods', 'saved_meals', 'recipes', 'recipe_ingredients',
    'food_favourites', 'daily_water', 'daily_intake_rollups', 'meal_plans',
    'nutrition_targets', 'perday_target_offsets',      // nutrition, C15 job 4 ruled ownership
    'effective_maintenance_memos',                     // nutrition authority, Campaign 19
    'capability_constraints', 'session_constraint_effects',
    'weekly_checkins_v2', 'weight_log', 'body_composition_log',
    'daily_steps', 'cardio_log',                        // retired surfaces
    'ed_pattern_flags',                                 // D92-11 holds
    'tier_history', 'profiles',                         // billing / identity
    'notification_preferences',                         // the projection, contracted above
    'plan_folders',
    'exercise_user_notes', 'exercise_goals',
    'workout_notes', 'workout_notes_v2',
    'food_swaps', 'progress_scan_classification_history', 'session_resolutions',
    // Surfaced by the completeness guard below rather than remembered:
    'peak_week_plans',      // Peak Week: migration 049 is HELD, do not touch
    'weekly_checkins',      // legacy table, superseded by weekly_checkins_v2
    'body_metric_log',      // body composition, owned by the nutrition area
    'user_body_profile',    // identity and profile, its own locked area
    'user_insights',        // insight dismissals, ratcheted under D97-19 F5
  ]);

  test('every registry table is either contracted or explicitly out of scope', () => {
    const unclassified = SYNC_REGISTRY
      .map(e => e.table)
      .filter(t => !CONTRACTED_TABLES.has(t) && !OUT_OF_SCOPE.has(t));
    expect(unclassified).toEqual([]);
  });

  test('every backed-up table is either contracted or explicitly out of scope', () => {
    const unclassified = BACKUP_TABLES
      .filter(t => !CONTRACTED_TABLES.has(t) && !OUT_OF_SCOPE.has(t));
    expect(unclassified).toEqual([]);
  });

  test('the contract states an outcome for every row, and only legal ones', () => {
    for (const row of CONTRACT) {
      expect([RESTORED, DERIVED, EXPECTED_LOCAL_LOSS]).toContain(row.reinstall);
      expect(row.authority).toBeTruthy();
      expect(row.mechanism).toBeTruthy();
      expect(row.conflict).toBeTruthy();
    }
  });

  test('expected local loss is never quietly used for something that DOES sync', () => {
    // The failure this prevents is the comfortable one: relabelling a
    // broken restore as a deliberate local-only decision.
    for (const row of CONTRACT.filter(r => r.reinstall === EXPECTED_LOCAL_LOSS)) {
      expect(row.applier).toBeNull();
      expect(row.mechanism).toMatch(/never|no cloud applier|pull-only|JSON backup only/);
    }
  });
});
