/**
 * Every upsert conflict target resolves against a real unique index
 * (adversarial audit 2026-08-26, finding 4).
 *
 * WHY THIS EXISTS. `onConflict` is a promise about the CLOUD schema made in
 * CLIENT code, and nothing has ever checked the two agree. When they do not,
 * Postgres answers 42P10 ("there is no unique or exclusion constraint matching
 * the ON CONFLICT specification") and the push fails — quietly, because the
 * bulk pushers log the error and carry on to the next chunk.
 *
 * WHAT THAT COST. workout_notes has been sending onConflict 'user_id,id' since
 * the composite-key migration, against a table whose only unique index is
 * `id`. Every workout-note push has failed for as long as the table has
 * existed. Nothing surfaced: no user-facing error, no blocked sign-out, no
 * failed sync badge. Notes live on the device and have never reached the
 * cloud, so they do not survive a reinstall and never appear on a second
 * device. public.workout_notes holds 0 rows.
 *
 * The cause was a typo, three migrations upstream: migrate_018's composite-PK
 * loop lists 'workout_notes_v2', a relation that does not exist, and the loop
 * silently skips tables it cannot find. One character of drift, invisible for
 * as long as nobody compared the two sides.
 *
 * WHAT THIS TEST IS AND IS NOT. It cannot reach Supabase, so it cannot prove
 * the cloud still matches. What it does is make the client's half of the
 * contract explicit and reviewable: every conflict target the code sends is
 * listed below with the index it relies on, verified against production on
 * 2026-08-27, after migrate_154 landed and all 38 resolved. A new upsert, or a
 * changed target, fails here until someone writes down which index it expects
 * — which is the moment to go and check.
 */

const fs = require('fs');
const path = require('path');

const LIB = path.join(__dirname, '..', '..');

/**
 * Every conflict target the app sends, with the production index it resolves
 * against. Verified by querying pg_index on 2026-08-27; 37 of 38 matched, and
 * the one that did not is workout_notes, fixed by migrate_154.
 */
const EXPECTED = {
  users_profile: 'id',
  body_metrics: 'user_id,id',
  // partner_week_signals left this sweep with the Partners feature (SD-03,
  // retired 2026-09-06): the client no longer upserts it. The cloud table
  // and its index stay, so the row is kept here as the recorded index if a
  // successor ever writes to it again.
  partner_week_signals: 'pair_id,user_id,week_start',
  weekly_checkins_v2: 'user_id,id',
  recipe_ingredients: 'user_id,id',
  daily_steps: 'user_id,entry_date',
  session_constraint_effects: 'user_id,id',
  meal_plans: 'id',
  effective_maintenance_memos: 'user_id',
  nutrition_targets: 'user_id',
  capability_constraints: 'user_id,id',
  notification_preferences: 'user_id,category',
  plan_folders: 'id',
  perday_target_offsets: 'user_id',
  custom_exercises: 'user_id,id',
  workouts: 'user_id,id',
  workout_sets: 'user_id,id',
  morning_weights: 'user_id,id',
  programmes: 'user_id,id',
  routines: 'user_id,id',
  routine_exercises: 'user_id,id',
  mesocycles: 'user_id,id',
  mesocycle_weeks: 'user_id,id',
  session_resolutions: 'user_id,id',
  coach_outputs: 'user_id,id',
  exercise_user_notes: 'user_id,id',
  exercise_intent: 'user_id,id',
  exercise_swaps: 'user_id,id',
  food_swaps: 'user_id,id',
  exercise_slot_defaults: 'user_id,id',
  user_body_profile: 'user_id',
  user_insights: 'user_id,id',
  exercise_goals: 'user_id,id',
  peak_week_plans: 'user_id,id',
  planned_muscle_volume: 'user_id,id',
  adaptation_events: 'user_id,id',
  user_prefs: 'user_id,key',
  // Was the defect: this returned 42P10 until migrate_154 added
  // UNIQUE (user_id, id), applied to production 2026-08-27.
  workout_notes: 'user_id,id',
};

/**
 * Reads every `.from('x') … .upsert(…, { onConflict: 'y' })` pair.
 *
 * Segment-based rather than one regex over the whole chain: the payload
 * between `.from` and `.upsert` ranges from a single identifier to a
 * twenty-line object literal, and a windowed regex silently missed fifteen of
 * the thirty-eight. Splitting on `.from('` bounds each segment at the next
 * query, so an upsert can never be attributed to the wrong table, and there is
 * no length cap to age out as a payload grows.
 */
function readTargets() {
  const files = [
    path.join(LIB, 'sync.js'),
    ...fs.readdirSync(path.join(LIB, 'sync', 'tables'))
      .filter((f) => f.endsWith('.js'))
      .map((f) => path.join(LIB, 'sync', 'tables', f)),
  ];
  const found = [];
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8')
      .split('\n')
      .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
      .join('\n');
    const segments = text.split(/\.from\('/).slice(1);
    for (const segment of segments) {
      const name = /^([a-z_]+)'\)/.exec(segment);
      if (!name) continue;
      if (!/\.upsert\(/.test(segment)) continue;   // a read, not a write
      const oc = /onConflict:\s*'([^']+)'/.exec(segment);
      found.push({
        file: path.relative(LIB, file),
        table: name[1],
        onConflict: oc ? oc[1] : null,
      });
    }
  }
  return found;
}

describe('the client never sends an unresolvable conflict target', () => {
  const targets = readTargets();

  test('the sweep actually found the upserts, so a silent zero cannot pass', () => {
    expect(targets.length).toBeGreaterThanOrEqual(38);
  });

  test('no upsert omits onConflict, which would insert and duplicate on retry', () => {
    // Without a target the statement is a plain INSERT: the offline retry
    // queue would create a second row every time it drained.
    const naked = targets.filter((t) => t.onConflict === null);
    expect(naked).toEqual([]);
  });

  test('every target is one this file has recorded a production index for', () => {
    const unrecorded = targets
      .filter((t) => !(t.table in EXPECTED))
      .map((t) => `${t.file}: ${t.table}`);
    // A new table here is not a bug, it is an unchecked promise. Add it to
    // EXPECTED once you have confirmed the cloud index exists.
    expect(unrecorded).toEqual([]);
  });

  test('no target has drifted from the recorded index', () => {
    const drifted = targets
      .filter((t) => t.onConflict !== EXPECTED[t.table])
      .map((t) => `${t.table}: sends '${t.onConflict}', recorded '${EXPECTED[t.table]}'`);
    expect(drifted).toEqual([]);
  });
});

describe('the migration that fixes workout_notes is present and honest', () => {
  const MIG = path.join(__dirname, '..', '..', '..', '..', 'supabase',
    'migrate_154_workout_notes_conflict_target_and_deletion_completeness.sql');

  test('it exists', () => {
    expect(fs.existsSync(MIG)).toBe(true);
  });

  const sql = fs.existsSync(MIG) ? fs.readFileSync(MIG, 'utf8') : '';

  test('it adds the index the client target needs', () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS workout_notes_user_id_id_key\s*\n?\s*ON public\.workout_notes \(user_id, id\)/);
  });

  test('it is additive and re-runnable, per the schema rule', () => {
    expect(sql).toMatch(/IF NOT EXISTS/);
    expect(sql).toMatch(/Safe to re-run:\s+yes/);
    expect(sql).not.toMatch(/DROP TABLE|TRUNCATE|ALTER TABLE .* DROP COLUMN/);
  });

  test('it records where the typo came from, so the next reader does not re-derive it', () => {
    expect(sql).toMatch(/workout_notes_v2/);
    expect(sql).toMatch(/migrate_018/);
  });

  test('it preserves the deletion RPC security attributes rather than dropping them', () => {
    // Silently losing SECURITY DEFINER or the pinned search_path would be a
    // security regression hidden inside a data fix.
    const fn = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.delete_user_data()'));
    expect(fn).toMatch(/SECURITY DEFINER/);
    expect(fn).toMatch(/SET search_path = public/);
    expect(fn).toMatch(/LANGUAGE plpgsql/);
  });

  test('the deletion RPC keeps the two deliberate retentions', () => {
    const fn = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.delete_user_data()'));
    // Deleting either of these would be the wrong fix: one is the proof the
    // erasure happened, the other is what keeps the person un-emailable.
    expect(fn).not.toMatch(/DELETE FROM account_deletions_log/);
    expect(fn).not.toMatch(/DELETE FROM marketing_email_optout/);
    expect(sql).toMatch(/DELIBERATELY RETAINED/);
  });

  test('its applied status is honest, and carries the ledger version', () => {
    // This assertion was the other way round until the migration was applied
    // on 2026-08-27: it pinned "NOT YET" so the file could not quietly claim
    // to be live. The invariant is the same either way -- the header states
    // what is actually true of production -- so it flipped when the truth did,
    // and the ledger version is what makes the claim checkable.
    expect(sql).toMatch(/Applied remotely: YES\. 2026-08-27/);
    expect(sql).toMatch(/Ledger version 20260827114840/);
    expect(sql).not.toMatch(/Applied remotely: NOT YET/);
  });

  test('the applied header records the re-verification, not just the fact', () => {
    // "Applied" on its own is a claim. These are the observations behind it.
    expect(sql).toMatch(/RE-VERIFIED ON THE LIVE DATABASE/);
    expect(sql).toMatch(/ON CONFLICT \(user_id, id\) ACCEPTED/);
    expect(sql).toMatch(/authenticated=X/);
  });
});
