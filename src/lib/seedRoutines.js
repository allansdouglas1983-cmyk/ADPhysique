import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getAllExercises, createRoutine, addExerciseToRoutine,
  createProgramme, getLibraryPlans, getRoutinesForPlan, getRoutineExercisesWithDetails,
} from './database';
import { logError, logWarn, logInfo } from './errorLog';
// Sentry VOLYUME-28 (2026-09-06): the exercise seed chain is awaited before
// any template name is resolved (see runExerciseSeedChain in seedExercises).
import { exercisesReady } from './seedExercises';
// F-16 (certification 2026-09-05): the two band-only library plans live in
// their own module and join LIBRARY_PLANS below.
import { BAND_LIBRARY_PLANS } from './seedRoutines.bandPlans';

// Bump to v12: adds Mens Physique Width Enhancement plan
// v13 (CC28): the capability-led routine families - nine free plans
// buildable from the existing library's demand metadata (Amendment
// deliverable 2). A bump adds them on existing installs; names dedupe.
// v14 (CC28): adds the five gap-closure families (Phase E).
// v15 (EL-8/EL-9/EL-12, docs/exercise-library-expansion-2026-09-05/
// 09-STYLE-PLANS.md): adds the five kettlebell templates and three circuit
// templates, each carrying a style:<pool> tag (src/lib/exercise/
// stylePools.js) that constrains its own generation and swaps.
// v16 (certification 2026-09-05, F-16): the two band library plans. The
// seed dedupes by plan name, so a bump only adds what is new.
// v17 (Sentry VOLYUME-28, 2026-09-06): no new plans. The bump makes every
// existing install run the repair pass once: on 1.3.5+64 the routine seed
// raced the corpus top-up, 90 template names resolved to nothing for two
// seconds, and the kettlebell and band plans were created with stations
// missing. The seed now waits for the exercise chain, repairs any library
// routine that lacks a template exercise, and keeps repairing on later
// launches while anything is still missing.
const SEED_KEY = '@volyume_routines_seeded_v17';
// Set when a run left a template exercise unresolved; cleared once a repair
// pass finds nothing missing. Read on every launch so the repair reruns
// without waiting for the next SEED_KEY bump.
const INCOMPLETE_KEY = '@volyume_routines_seed_incomplete';

/**
 * Template exercise def -> the addExerciseToRoutine call the seed makes.
 * One place, so the first seed and the repair pass write identical rows.
 */
async function addTemplateExercise(routineId, exercise, def, index) {
  // EL-9 (docs/exercise-library-expansion-2026-09-05/05-DECISIONS.md):
  // a circuit template's exercise def carries supersetGroupId,
  // groupKind: 'circuit' and roundRestSeconds alongside the usual
  // fields (rounds are `sets`, station transition is `rest: 0`,
  // the between-round rest is roundRestSeconds). Every existing
  // plan's exercises carry none of these, so this is a pure
  // addition: they pass null/default exactly as before.
  await addExerciseToRoutine(
    routineId,
    exercise.id,
    index,
    def.repsMin,
    def.repsMax,
    def.notes || null,
    def.sets,
    null,
    def.rest,
    def.supersetGroupId || null,
    true,
    null,
    def.groupKind || null,
    def.roundRestSeconds || null,
  );
}

/**
 * Repair pass: for every library plan that already exists on the device,
 * add any template exercise its routine lacks, at the template's own
 * position (the first seed used the template index as order_in_routine,
 * so a gap is exactly the missing index). Routines are matched to template
 * workouts by position, falling back to name. Never removes or reorders
 * anything a routine already has; never touches user copies.
 *
 * @param {Array<object>} plans     LIBRARY_PLANS-shaped templates
 * @param {Array<object>} existing  library programme rows (getLibraryPlans)
 * @param {Record<string, object>} byName  exercise rows keyed by canonical name
 * @returns {Promise<{ added: number, stillMissing: number }>}
 */
export async function repairLibraryPlans(plans, existing, byName) {
  const byPlanName = new Map((existing ?? []).map((p) => [p.name, p]));
  let added = 0;
  let stillMissing = 0;
  for (const plan of plans ?? []) {
    const row = byPlanName.get(plan?.name);
    if (!row) continue;
    let routines;
    try { routines = await getRoutinesForPlan(row.id); } catch (_) { continue; }
    for (let w = 0; w < plan.workouts.length; w++) {
      const workoutDef = plan.workouts[w];
      const routine = (routines[w] && routines[w].name === workoutDef.name)
        ? routines[w]
        : routines.find((r) => r.name === workoutDef.name);
      if (!routine) continue;
      let present;
      try {
        present = new Set((await getRoutineExercisesWithDetails(routine.id)).map((x) => x.routineExercise.exerciseId));
      } catch (_) { continue; }
      for (let i = 0; i < workoutDef.exercises.length; i++) {
        const def = workoutDef.exercises[i];
        const exercise = byName[def.name];
        if (!exercise) { stillMissing += 1; continue; }
        if (present.has(exercise.id)) continue;
        await addTemplateExercise(routine.id, exercise, def, i);
        present.add(exercise.id);
        added += 1;
      }
    }
  }
  return { added, stillMissing };
}

// REQUIRED_EXERCISES removed (EL-15, exercise-library-expansion-2026-09-05):
// these 18 rows are now ordinary canonical corpus entries
// (src/lib/exerciseCorpus/), seeded by seedExercises.js before this module
// runs, so getAllExercises()'s `byName` lookup below already resolves them
// with a stable canonical id — no separate insertion pass is needed. An
// install that seeded them under the old random uid() gets re-idded by
// seedExercises.js's topUpNewExercisesIfNeeded (same-name merge).

// ─── Library Plans ───────────────────────────────────────────────────────────

export const LIBRARY_PLANS = [

  // ── 1. Aesthetic Upper Rotation ──────────────────────────────────────────
  {
    name: 'Aesthetic Upper Rotation',
    description: 'Two-day upper-body rotation built around physique priorities: lat width, capped side delts, upper-chest fullness, and rear-delt health. Day 1 targets the back and posterior shoulder; Day 2 develops upper chest and lateral delt detail. Add a rep each session; once you hit the top of the rep range, add a little weight and start again. Stop 1 to 2 reps before failure on each set. Pair with any lower-body plan to cover the whole body.',
    tags: 'aesthetic upper bodybuilding gender:men goal:build_muscle days:2 featured',
    difficulty: 1,
    workouts: [
      {
        name: 'Day 1: Width, Rear Delts & Back Detail',
        exercises: [
          { name: 'Face Pull',                         sets: 4, repsMin: 20, repsMax: 25, rest: 60,  notes: 'Rope at chest height, elbows high. Light weight only. Rear delt warm-up.' },
          { name: 'Plate-Loaded Lat Pulldown',      sets: 4, repsMin: 8,  repsMax: 12, rest: 90,  notes: 'Full overhead stretch. Pull elbows to pockets. 3 s eccentric.' },
          { name: 'Underhand Lat Pulldown',            sets: 3, repsMin: 10, repsMax: 12, rest: 90,  notes: 'Lower-lat emphasis. Squeeze hard at bottom. 3 s eccentric.' },
          { name: 'Plate-Loaded Seated Row',           sets: 3, repsMin: 10, repsMax: 12, rest: 90,  notes: 'Full stretch forward. Pull elbows back. Squeeze rhomboids.' },
          { name: 'Cable Straight-Arm Pulldown',       sets: 3, repsMin: 12, repsMax: 15, rest: 60,  notes: 'Lat length and lower-lat control. Slow arc, slight elbow bend.' },
        ],
      },
      {
        name: 'Day 2: Upper Chest, Lateral Delts & Shoulder Refinement',
        exercises: [
          { name: 'Cable Lateral Raise',  sets: 4, repsMin: 15, repsMax: 20, rest: 60,  notes: 'Arm slightly forward. Lead with elbow. Raise to shoulder height.' },
          { name: 'Facing-In Shoulder Press',          sets: 4, repsMin: 12, repsMax: 15, rest: 90,  notes: 'Scapular-plane pressing. Hits upper chest and anterior delt.' },
          { name: 'Cable Fly (Low to Mid, Incline)',  sets: 4, repsMin: 12, repsMax: 15, rest: 90,  notes: 'Cables low, bench 30–45 degrees. 3 s eccentric. Upper-chest focus.' },
          { name: 'Cable Fly (Mid Height, Cuff)',     sets: 3, repsMin: 12, repsMax: 15, rest: 90,  notes: 'Upper-chest isolation. Cuffed for greater range. 3 s eccentric.' },
          { name: 'Face Pull',                         sets: 4, repsMin: 20, repsMax: 25, rest: 60,  notes: 'Rope at chest height. Light weight. Rear-delt health maintenance.' },
        ],
      },
    ],
  },

  // ── 2. Beginner Full Body 3×/week ────────────────────────────────────────
  {
    name: 'Beginner Full Body 3×/Week',
    description: 'Three full-body sessions per week adding weight each session. It is the fastest way to get stronger when you are starting out. The five fundamental movement patterns are trained every session: squat, hinge, horizontal press, horizontal pull, and vertical pull. Add weight each session (2.5 kg on compound barbell lifts) and focus on technique above all else. Expect consistent weekly strength increases for the first 6–12 months. Leave 2 to 3 reps in the tank on each set.',
    tags: 'beginner full_body barbell gender:all goal:build_muscle days:3 audience:beginner featured',
    difficulty: 0,
    workouts: [
      {
        name: 'Full Body A',
        exercises: [
          { name: 'Barbell Back Squat',     sets: 3, repsMin: 5,  repsMax: 8,  rest: 120, notes: 'Feet shoulder-width. Hit full depth. Drive through heels.' },
          { name: 'Barbell Bench Press',    sets: 3, repsMin: 5,  repsMax: 8,  rest: 120, notes: 'Arch naturally. Bar to chest. Push straight up.' },
          { name: 'Barbell Row (Bent Over)', sets: 3, repsMin: 5,  repsMax: 8,  rest: 120, notes: 'Hinge 45 degrees. Pull bar to lower chest. Squeeze back.' },
          { name: 'Barbell Overhead Press', sets: 2, repsMin: 5,  repsMax: 8,  rest: 90,  notes: 'Stand tall. Press straight overhead. Core braced.' },
          { name: 'Dumbbell Lateral Raise', sets: 2, repsMin: 12, repsMax: 20, rest: 60,  notes: 'Light weight. Side delts need direct work that pressing alone cannot provide.' },
          { name: 'Romanian Deadlift (Barbell)', sets: 2, repsMin: 8, repsMax: 12, rest: 90, notes: 'Hip hinge. Feel hamstring stretch. Keep bar close.' },
        ],
      },
      {
        name: 'Full Body B',
        exercises: [
          { name: 'Barbell Back Squat',     sets: 3, repsMin: 5,  repsMax: 8,  rest: 120, notes: 'Same as A. Add weight when all reps feel strong.' },
          { name: 'Incline Barbell Bench Press', sets: 3, repsMin: 6, repsMax: 10, rest: 120, notes: 'Slight incline. Upper-chest emphasis.' },
          { name: 'Lat Pulldown (Wide Grip)', sets: 3, repsMin: 8,  repsMax: 12, rest: 90,  notes: 'Pull elbows down to sides. Full stretch overhead.' },
          { name: 'Barbell Overhead Press', sets: 2, repsMin: 5,  repsMax: 8,  rest: 90,  notes: 'Add small increments each session.' },
          { name: 'Face Pull',              sets: 2, repsMin: 15, repsMax: 20, rest: 60,  notes: 'Rear delts. Light weight, elbows high. Keeps the shoulder joint healthy.' },
          { name: 'Romanian Deadlift (Barbell)', sets: 2, repsMin: 8, repsMax: 12, rest: 90, notes: 'Hip hinge. Controlled descent.' },
        ],
      },
    ],
  },

  // ── 3. Beginner Push / Pull / Legs ────────────────────────────────────────
  {
    name: 'Beginner Push / Pull / Legs',
    description: 'A clean three-day split that keeps sessions focused and manageable. Push day builds chest, shoulders, and triceps; Pull day develops back and biceps; Leg day handles quads, hamstrings, glutes, and calves. Each muscle is trained once per week with enough sets to drive growth. Add 2.5 kg to compound lifts and 1.25 kg to isolation exercises when all reps are completed with good technique. Ideal for the first 3–6 months. Leave 2 to 3 reps in the tank on each set.',
    tags: 'beginner ppl gender:all goal:build_muscle days:3 audience:beginner',
    difficulty: 0,
    workouts: [
      {
        name: 'Push: Chest & Shoulders',
        exercises: [
          { name: 'Barbell Bench Press',      sets: 4, repsMin: 6,  repsMax: 10, rest: 120, notes: 'Primary chest movement. Focus on the stretch at the bottom.' },
          { name: 'Incline Dumbbell Press',   sets: 3, repsMin: 8,  repsMax: 12, rest: 90,  notes: 'Upper chest. Control the descent.' },
          { name: 'Dumbbell Shoulder Press',  sets: 3, repsMin: 8,  repsMax: 12, rest: 90,  notes: 'Seated or standing. Full range.' },
          { name: 'Dumbbell Lateral Raise',   sets: 3, repsMin: 12, repsMax: 20, rest: 60,  notes: 'Shoulder width only. Slight forward lean.' },
          { name: 'Tricep Pushdown (Rope)',            sets: 3, repsMin: 12, repsMax: 15, rest: 60,  notes: 'Elbows pinned to sides. Full extension at bottom.' },
        ],
      },
      {
        name: 'Pull: Back & Biceps',
        exercises: [
          { name: 'Lat Pulldown (Wide Grip)', sets: 4, repsMin: 8,  repsMax: 12, rest: 90,  notes: 'Pull elbows to sides. Arch chest into bar.' },
          { name: 'Seated Cable Row',         sets: 3, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Full stretch, row to belly button.' },
          { name: 'Machine Row (Chest Supported)', sets: 3, repsMin: 10, repsMax: 15, rest: 90, notes: 'Chest against pad removes lower-back stress.' },
          { name: 'EZ Bar Curl',              sets: 3, repsMin: 8,  repsMax: 12, rest: 60,  notes: 'Full range. Squeeze at top.' },
          { name: 'Hammer Curl',              sets: 2, repsMin: 10, repsMax: 15, rest: 60,  notes: 'Brachialis focus. Keep elbow pinned.' },
        ],
      },
      {
        name: 'Legs',
        exercises: [
          { name: 'Barbell Back Squat',       sets: 4, repsMin: 6,  repsMax: 10, rest: 120, notes: 'Full depth. Push knees out.' },
          { name: 'Leg Press',                sets: 3, repsMin: 10, repsMax: 15, rest: 90,  notes: 'High foot placement for glute+ham recruitment.' },
          { name: 'Romanian Deadlift (Barbell)', sets: 3, repsMin: 8, repsMax: 12, rest: 90, notes: 'Hip hinge. Feel the stretch in hamstrings.' },
          { name: 'Leg Extension',            sets: 3, repsMin: 12, repsMax: 20, rest: 60,  notes: 'Quad isolation. Full contraction at top.' },
          { name: 'Lying Leg Curl',           sets: 3, repsMin: 10, repsMax: 15, rest: 60,  notes: 'Curl to glutes. Hold a second at top.' },
        ],
      },
    ],
  },

  // ── 4. Upper / Lower 4×/Week (Intermediate) ──────────────────────────────
  {
    name: 'Upper / Lower 4×/Week',
    description: 'The most evidence-supported split for building muscle: each muscle group trained twice per week, giving each muscle 48 to 72 hours to recover before training it again. Upper A focuses on heavier compound work (5–8 reps); Upper B shifts to higher-rep muscle building ranges (10–15 reps) targeting the same muscles from different angles. Add reps session by session; when you reach the top of the rep range, add a little weight and start again. Suits lifters with 6+ months of consistent training. Stop 1 to 2 reps before failure on each set.',
    tags: 'upper_lower intermediate gender:all goal:build_muscle days:4 featured',
    difficulty: 1,
    workouts: [
      {
        name: 'Upper A: Horizontal Push & Pull',
        exercises: [
          { name: 'Barbell Bench Press',       sets: 4, repsMin: 5,  repsMax: 8,  rest: 120, notes: 'Strength focus. Add weight when top reps feel easy.' },
          { name: 'Barbell Row (Bent Over)',   sets: 4, repsMin: 5,  repsMax: 8,  rest: 120, notes: 'Pause at chest. Controlled descent.' },
          { name: 'Incline Dumbbell Press',    sets: 3, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Higher reps for growth. Slow negative.' },
          { name: 'Seated Cable Row',          sets: 3, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Full stretch to full contraction.' },
          { name: 'EZ Bar Skull Crusher',      sets: 3, repsMin: 10, repsMax: 15, rest: 60,  notes: 'Elbows pointed up. Slow on way down.' },
          { name: 'EZ Bar Curl',               sets: 3, repsMin: 10, repsMax: 15, rest: 60,  notes: 'Full supination at top.' },
        ],
      },
      {
        name: 'Lower A: Quad Focus',
        exercises: [
          { name: 'Barbell Back Squat',         sets: 4, repsMin: 5,  repsMax: 8,  rest: 150, notes: 'Strength focus. Brace hard, break parallel.' },
          { name: 'Romanian Deadlift (Barbell)', sets: 3, repsMin: 10, repsMax: 12, rest: 90,  notes: 'Hamstring stretch. Keep bar touching legs.' },
          { name: 'Leg Press',                  sets: 3, repsMin: 12, repsMax: 20, rest: 90,  notes: 'Full range. Don\'t lock out at top.' },
          { name: 'Leg Extension',              sets: 3, repsMin: 15, repsMax: 25, rest: 60,  notes: 'Squeeze quad at top.' },
          { name: 'Seated Calf Raise',          sets: 4, repsMin: 15, repsMax: 20, rest: 60,  notes: 'Full range, hold stretch at bottom.' },
        ],
      },
      {
        name: 'Upper B: Vertical Push & Pull',
        exercises: [
          { name: 'Barbell Overhead Press',    sets: 4, repsMin: 5,  repsMax: 8,  rest: 120, notes: 'Standing preferred. Full lockout overhead.' },
          { name: 'Lat Pulldown (Wide Grip)',  sets: 4, repsMin: 8,  repsMax: 12, rest: 90,  notes: 'Slight lean back. Drive elbows down.' },
          { name: 'Dumbbell Shoulder Press',  sets: 3, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Higher reps for growth. Touch ears at bottom.' },
          { name: 'Machine Row (Chest Supported)', sets: 3, repsMin: 12, repsMax: 15, rest: 90, notes: 'Strict, no body english.' },
          { name: 'Dumbbell Lateral Raise',   sets: 4, repsMin: 15, repsMax: 25, rest: 60,  notes: 'Slight internal rotation, lead with elbow.' },
          { name: 'Dumbbell Rear Delt Fly',   sets: 3, repsMin: 15, repsMax: 25, rest: 60,  notes: 'Slight elbow bend. Raise to shoulder height.' },
        ],
      },
      {
        name: 'Lower B: Posterior Chain Focus',
        exercises: [
          { name: 'Conventional Deadlift',    sets: 3, repsMin: 4,  repsMax: 6,  rest: 150, notes: 'Heavy pulls. Brace. Drive floor away.' },
          { name: 'Hack Squat Machine',       sets: 3, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Quad isolation. Full depth.' },
          { name: 'Lying Leg Curl',           sets: 4, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Curl fully to glutes. Hold 1 s.' },
          { name: 'Barbell Hip Thrust',       sets: 4, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Full hip extension. Squeeze glutes hard.' },
          { name: 'Standing Calf Raise (Machine)', sets: 4, repsMin: 10, repsMax: 20, rest: 60, notes: 'Full stretch, full contraction, hold 1 s.' },
        ],
      },
    ],
  },

  // ── 5. PPL 3×/Week (Intermediate) ────────────────────────────────────────
  {
    name: 'Push Pull Legs 3×/Week',
    description: 'Each muscle group trained once per week with focused, high-quality sets. Push day attacks chest, shoulders, and triceps; Pull day builds the back and biceps; Leg day develops the full lower body. The lower frequency compared to upper/lower makes this ideal as a first split after outgrowing full-body training, or during phases of lower recovery capacity. Add reps each session, then add weight when you reach the top of the range. Stop 1 to 2 reps before failure on each set.',
    tags: 'ppl intermediate gender:all goal:build_muscle days:3',
    difficulty: 1,
    workouts: [
      {
        name: 'Push: Chest, Shoulders & Triceps',
        exercises: [
          { name: 'Barbell Bench Press',       sets: 4, repsMin: 6,  repsMax: 10, rest: 120, notes: 'Full range. Stretch at bottom. Explode up.' },
          { name: 'Incline Dumbbell Press',    sets: 3, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Upper chest emphasis. Touch shoulders at bottom.' },
          { name: 'Barbell Overhead Press',    sets: 3, repsMin: 8,  repsMax: 12, rest: 90,  notes: 'Standing. Full overhead lockout.' },
          { name: 'Cable Lateral Raise',       sets: 3, repsMin: 15, repsMax: 25, rest: 60,  notes: 'Constant cable tension. Raise to shoulder height.' },
          { name: 'Cable Overhead Tricep Extension', sets: 3, repsMin: 12, repsMax: 20, rest: 60, notes: 'Long-head stretch. Elbows up and back.' },
          { name: 'Cable Pushdown (Straight Bar)', sets: 3, repsMin: 15, repsMax: 20, rest: 60, notes: 'Full extension, squeeze tricep hard.' },
        ],
      },
      {
        name: 'Pull: Back & Biceps',
        exercises: [
          { name: 'Lat Pulldown (Wide Grip)',  sets: 4, repsMin: 8,  repsMax: 12, rest: 90,  notes: 'Arch chest into bar. Drive elbows down and back.' },
          { name: 'Barbell Row (Bent Over)',   sets: 3, repsMin: 8,  repsMax: 12, rest: 90,  notes: 'Hinge 45°. Row to lower chest.' },
          { name: 'Seated Cable Row',          sets: 3, repsMin: 10, repsMax: 15, rest: 90,  notes: 'V-handle. Elbows back, squeeze mid-back.' },
          { name: 'Face Pull',                 sets: 3, repsMin: 15, repsMax: 25, rest: 60,  notes: 'Shoulder health essential. High elbows.' },
          { name: 'EZ Bar Curl',               sets: 3, repsMin: 8,  repsMax: 12, rest: 60,  notes: 'Full supination. No body swing.' },
          { name: 'Hammer Curl',               sets: 3, repsMin: 10, repsMax: 15, rest: 60,  notes: 'Brachialis thickness.' },
        ],
      },
      {
        name: 'Legs',
        exercises: [
          { name: 'Barbell Back Squat',           sets: 4, repsMin: 6,  repsMax: 10, rest: 150, notes: 'Lead compound. Chase depth.' },
          { name: 'Romanian Deadlift (Barbell)',  sets: 3, repsMin: 10, repsMax: 12, rest: 90,  notes: 'Hip hinge. Hamstring loading.' },
          { name: 'Leg Press',                    sets: 3, repsMin: 12, repsMax: 20, rest: 90,  notes: 'High placement for glutes.' },
          { name: 'Leg Extension',                sets: 3, repsMin: 15, repsMax: 25, rest: 60,  notes: 'Pump work. High rep.' },
          { name: 'Seated Leg Curl',              sets: 3, repsMin: 10, repsMax: 15, rest: 60,  notes: 'Seated keeps hams in longer stretch.' },
          { name: 'Standing Calf Raise (Machine)', sets: 4, repsMin: 12, repsMax: 20, rest: 60, notes: 'Full stretch at bottom.' },
        ],
      },
    ],
  },

  // ── 6. PPL 6×/Week (Advanced) ─────────────────────────────────────────────
  {
    name: 'Push Pull Legs 6×/Week',
    description: 'High-frequency PPL for lifters who can handle six sessions per week and recover from them. Each muscle is trained twice per week, which produces faster growth than the 3-day version. The two weekly cycles allow a different emphasis each rotation: heavier compound work first, higher-rep detail work second. Requires consistent sleep, nutrition, and stress management to recover fully. Stop 1 to 2 reps before failure on each set. Recommended for lifters with 18 months or more of consistent training.',
    tags: 'ppl advanced gender:all goal:build_muscle days:6',
    difficulty: 2,
    workouts: [
      {
        name: 'Push Day 1: Strength Focus',
        exercises: [
          { name: 'Barbell Bench Press',       sets: 5, repsMin: 4,  repsMax: 6,  rest: 150, notes: 'Heavy sets. Add weight when the top reps feel easy.' },
          { name: 'Incline Barbell Bench Press', sets: 4, repsMin: 6,  repsMax: 8,  rest: 120, notes: 'Second compound. Heavy.' },
          { name: 'Barbell Overhead Press',    sets: 3, repsMin: 6,  repsMax: 8,  rest: 90,  notes: 'Strict press. No leg drive.' },
          { name: 'Dumbbell Lateral Raise',   sets: 3, repsMin: 15, repsMax: 25, rest: 60,  notes: 'Controlled. Keep at shoulder height.' },
          { name: 'Close-Grip Bench Press',   sets: 3, repsMin: 8,  repsMax: 12, rest: 90,  notes: 'Tricep accessory work.' },
        ],
      },
      {
        name: 'Pull Day 1: Strength Focus',
        exercises: [
          { name: 'Conventional Deadlift',    sets: 4, repsMin: 4,  repsMax: 6,  rest: 150, notes: 'Full-body pull. Brace tight.' },
          { name: 'Barbell Row (Bent Over)',  sets: 4, repsMin: 5,  repsMax: 8,  rest: 120, notes: 'Strict 45°. Pull to lower ribs.' },
          { name: 'Weighted Pull-Up',         sets: 3, repsMin: 5,  repsMax: 8,  rest: 90,  notes: 'Add belt weight for progression.' },
          { name: 'EZ Bar Curl',              sets: 4, repsMin: 8,  repsMax: 12, rest: 60,  notes: 'Strict curls. Full supination.' },
          { name: 'EZ Bar Preacher Curl',   sets: 3, repsMin: 8,  repsMax: 12, rest: 60,  notes: 'Peak contraction, slow negative.' },
        ],
      },
      {
        name: 'Legs Day 1: Quad Focus',
        exercises: [
          { name: 'Barbell Back Squat',         sets: 5, repsMin: 4,  repsMax: 6,  rest: 150, notes: 'Heavy squats. Break parallel.' },
          { name: 'Hack Squat Machine',         sets: 4, repsMin: 8,  repsMax: 12, rest: 90,  notes: 'Quad isolation machine.' },
          { name: 'Leg Extension',              sets: 4, repsMin: 15, repsMax: 25, rest: 60,  notes: 'High rep pump. No lockout.' },
          { name: 'Lying Leg Curl',             sets: 3, repsMin: 10, repsMax: 15, rest: 60,  notes: 'Hamstring curl.' },
          { name: 'Standing Calf Raise (Machine)', sets: 5, repsMin: 10, repsMax: 20, rest: 60, notes: 'Heavy calf work. Full range.' },
        ],
      },
      {
        name: 'Push Day 2: Volume Focus',
        exercises: [
          { name: 'Incline Dumbbell Press',    sets: 4, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Higher reps for growth. Controlled negative.' },
          { name: 'Pec Deck (Machine Fly)',    sets: 4, repsMin: 12, repsMax: 20, rest: 60,  notes: 'Full stretch. Mind-muscle. Pump work.' },
          { name: 'Dumbbell Shoulder Press',  sets: 4, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Seated. Full range of motion.' },
          { name: 'Cable Lateral Raise',      sets: 4, repsMin: 15, repsMax: 25, rest: 60,  notes: 'Constant tension cable version.' },
          { name: 'Cable Overhead Tricep Extension', sets: 4, repsMin: 12, repsMax: 20, rest: 60, notes: 'Long head stretch.' },
        ],
      },
      {
        name: 'Pull Day 2: Volume Focus',
        exercises: [
          { name: 'Lat Pulldown (Wide Grip)',  sets: 4, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Width focus. Drive elbows down.' },
          { name: 'Seated Cable Row',          sets: 4, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Full stretch. Elbows back.' },
          { name: 'Machine Row (Chest Supported)', sets: 4, repsMin: 12, repsMax: 15, rest: 90, notes: 'No lower-back stress.' },
          { name: 'Face Pull',                 sets: 3, repsMin: 20, repsMax: 25, rest: 60,  notes: 'Rear delt health. Light weight.' },
          { name: 'Incline Dumbbell Curl',     sets: 3, repsMin: 10, repsMax: 15, rest: 60,  notes: 'Full stretch at bottom of curl.' },
        ],
      },
      {
        name: 'Legs Day 2: Posterior Chain Focus',
        exercises: [
          { name: 'Romanian Deadlift (Barbell)', sets: 4, repsMin: 8,  repsMax: 12, rest: 90,  notes: 'Hamstring loading. Keep bar close.' },
          { name: 'Leg Press',                   sets: 4, repsMin: 12, repsMax: 20, rest: 90,  notes: 'Higher foot placement.' },
          { name: 'Seated Leg Curl',             sets: 4, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Stretched position. Very effective for hamstring growth.' },
          { name: 'Barbell Hip Thrust',          sets: 4, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Glute-focused. Full hip extension.' },
          { name: 'Seated Calf Raise',           sets: 5, repsMin: 15, repsMax: 25, rest: 60,  notes: 'Soleus focus. Slow and controlled.' },
        ],
      },
    ],
  },

  // ── 7. 4-Day Bodybuilding Bro Split ──────────────────────────────────────
  {
    name: '4-Day Muscle Building Bro Split',
    description: 'The classic bodybuilder split: each major muscle group gets a dedicated session and a high number of sets before moving on. Chest and triceps on Day 1, back and biceps on Day 2, shoulders and traps on Day 3, legs on Day 4. Each muscle is trained once per week. Best suited to lifters with 2 or more years of training who are comfortable pushing through demanding sessions and recover well. Add reps each session, then add weight when you reach the top of the range. Take the last set of each exercise close to failure.',
    tags: 'bodybuilding bro_split gender:men goal:build_muscle days:4',
    difficulty: 1,
    workouts: [
      {
        name: 'Chest & Triceps',
        exercises: [
          { name: 'Barbell Bench Press',       sets: 4, repsMin: 6,  repsMax: 10, rest: 120, notes: 'Flat bench compound starter.' },
          { name: 'Incline Dumbbell Press',    sets: 3, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Upper-chest secondary.' },
          { name: 'Pec Deck (Machine Fly)',    sets: 3, repsMin: 12, repsMax: 20, rest: 60,  notes: 'Pump isolation. Full stretch.' },
          { name: 'EZ Bar Skull Crusher',      sets: 3, repsMin: 10, repsMax: 15, rest: 60,  notes: 'Elbows pointed up. Slow negative.' },
          { name: 'Tricep Pushdown (Rope)',             sets: 3, repsMin: 12, repsMax: 20, rest: 60,  notes: 'Flare rope at bottom. Squeeze.' },
        ],
      },
      {
        name: 'Back & Biceps',
        exercises: [
          { name: 'Lat Pulldown (Wide Grip)',  sets: 4, repsMin: 8,  repsMax: 12, rest: 90,  notes: 'Width focus.' },
          { name: 'Seated Cable Row',          sets: 4, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Thickness focus.' },
          { name: 'Dumbbell Row',              sets: 3, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Single arm. Controlled.' },
          { name: 'EZ Bar Curl',               sets: 3, repsMin: 8,  repsMax: 12, rest: 60,  notes: 'Strict. Full supination.' },
          { name: 'EZ Bar Preacher Curl',    sets: 3, repsMin: 8,  repsMax: 12, rest: 60,  notes: 'Peak contraction.' },
        ],
      },
      {
        name: 'Shoulders',
        exercises: [
          { name: 'Barbell Overhead Press',   sets: 4, repsMin: 6,  repsMax: 10, rest: 120, notes: 'Standing. Strict. Full lockout.' },
          { name: 'Dumbbell Lateral Raise',  sets: 4, repsMin: 15, repsMax: 25, rest: 60,  notes: 'Raise to ear height. Slight lean.' },
          { name: 'Machine Lateral Raise',   sets: 3, repsMin: 15, repsMax: 20, rest: 60,  notes: 'Constant tension version.' },
          { name: 'Face Pull',               sets: 4, repsMin: 20, repsMax: 25, rest: 60,  notes: 'High elbows. Rear delt health.' },
          { name: 'Dumbbell Rear Delt Fly',  sets: 3, repsMin: 15, repsMax: 25, rest: 60,  notes: 'Bent-over. Slight elbow bend.' },
        ],
      },
      {
        name: 'Legs',
        exercises: [
          { name: 'Barbell Back Squat',           sets: 4, repsMin: 6,  repsMax: 10, rest: 150, notes: 'Primary quad driver.' },
          { name: 'Leg Press',                    sets: 4, repsMin: 12, repsMax: 20, rest: 90,  notes: 'Volume after squats.' },
          { name: 'Romanian Deadlift (Barbell)',  sets: 3, repsMin: 10, repsMax: 12, rest: 90,  notes: 'Hamstring loading.' },
          { name: 'Leg Extension',                sets: 3, repsMin: 15, repsMax: 25, rest: 60,  notes: 'Quad pump isolation.' },
          { name: 'Seated Leg Curl',              sets: 3, repsMin: 10, repsMax: 15, rest: 60,  notes: 'Hamstring stretch position.' },
        ],
      },
    ],
  },

  // ── 8. 3-Day Full Body Express (45 min sessions) ─────────────────────────
  {
    name: 'Full Body Express 3×/Week',
    description: '45-minute full-body sessions, three days per week, using only the highest-value compound movements. No isolation work. Every exercise trains multiple muscles simultaneously to maximise efficiency. Ideal for time-pressed lifters who want to maintain or build muscle with minimal gym time. Because each session covers the full body, skipping one session does not leave any muscle group undertrained that week. Add reps each session, then add weight when you reach the top of the range. Leave 2 reps in the tank on each set.',
    tags: 'full_body short gender:all goal:build_muscle days:3',
    difficulty: 1,
    workouts: [
      {
        name: 'Session A',
        exercises: [
          { name: 'Barbell Back Squat',       sets: 3, repsMin: 6,  repsMax: 10, rest: 90,  notes: 'Main leg driver.' },
          { name: 'Barbell Bench Press',      sets: 3, repsMin: 8,  repsMax: 12, rest: 90,  notes: 'Main push.' },
          { name: 'Barbell Row (Bent Over)',  sets: 3, repsMin: 8,  repsMax: 12, rest: 90,  notes: 'Main pull.' },
          { name: 'Barbell Overhead Press',  sets: 2, repsMin: 8,  repsMax: 12, rest: 60,  notes: 'Shoulder builder.' },
        ],
      },
      {
        name: 'Session B',
        exercises: [
          { name: 'Leg Press',               sets: 3, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Quad accessory work.' },
          { name: 'Incline Dumbbell Press',  sets: 3, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Upper chest push.' },
          { name: 'Lat Pulldown (Wide Grip)', sets: 3, repsMin: 8,  repsMax: 12, rest: 90, notes: 'Back width.' },
          { name: 'Romanian Deadlift (Barbell)', sets: 3, repsMin: 8, repsMax: 12, rest: 90, notes: 'Posterior chain.' },
        ],
      },
      {
        name: 'Session C',
        exercises: [
          { name: 'Barbell Back Squat',       sets: 3, repsMin: 6,  repsMax: 10, rest: 90,  notes: 'Full depth. No rush.' },
          { name: 'Dumbbell Bench Press',    sets: 3, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Chest squeeze.' },
          { name: 'Seated Cable Row',        sets: 3, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Full stretch, elbows back.' },
          { name: 'Dumbbell Shoulder Press', sets: 2, repsMin: 10, repsMax: 15, rest: 60,  notes: 'Overhead push accessory.' },
        ],
      },
    ],
  },

  // ── 9. Upper / Lower Express (4 × 40 min) ────────────────────────────────
  {
    name: 'Upper / Lower Express 4×/Week',
    description: 'Four 40-minute sessions per week using a tight exercise selection and short rest periods. Built on the upper/lower structure with each session trimmed to its highest-value exercises. Suitable for lifters with 12 months or more of training who have a busy schedule and want each muscle trained twice a week without long sessions. Add reps, then weight, on all compound movements. Stop 1 to 2 reps before failure on each set.',
    tags: 'upper_lower short gender:all goal:build_muscle days:4',
    difficulty: 1,
    workouts: [
      {
        name: 'Upper A',
        exercises: [
          { name: 'Barbell Bench Press',      sets: 3, repsMin: 6,  repsMax: 10, rest: 90,  notes: 'Primary push.' },
          { name: 'Seated Cable Row',         sets: 3, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Primary pull.' },
          { name: 'Dumbbell Shoulder Press',  sets: 3, repsMin: 10, repsMax: 15, rest: 60,  notes: 'Front delt compound.' },
          { name: 'Dumbbell Lateral Raise',   sets: 2, repsMin: 15, repsMax: 25, rest: 45,  notes: 'Side delts. Shoulder press does not cover these adequately.' },
          { name: 'EZ Bar Curl',              sets: 2, repsMin: 10, repsMax: 15, rest: 60,  notes: 'Bicep finisher.' },
        ],
      },
      {
        name: 'Lower A',
        exercises: [
          { name: 'Barbell Back Squat',           sets: 3, repsMin: 6,  repsMax: 10, rest: 90,  notes: 'Main quad driver.' },
          { name: 'Romanian Deadlift (Barbell)',  sets: 3, repsMin: 8,  repsMax: 12, rest: 90,  notes: 'Hamstring loading.' },
          { name: 'Leg Extension',                sets: 3, repsMin: 15, repsMax: 25, rest: 60,  notes: 'Quad pump.' },
          { name: 'Seated Calf Raise',            sets: 3, repsMin: 15, repsMax: 25, rest: 45,  notes: 'Calf finisher.' },
        ],
      },
      {
        name: 'Upper B',
        exercises: [
          { name: 'Barbell Overhead Press',   sets: 3, repsMin: 6,  repsMax: 10, rest: 90,  notes: 'Overhead strength.' },
          { name: 'Lat Pulldown (Wide Grip)', sets: 3, repsMin: 8,  repsMax: 12, rest: 90,  notes: 'Back width.' },
          { name: 'Incline Dumbbell Press',   sets: 3, repsMin: 10, repsMax: 15, rest: 60,  notes: 'Upper chest.' },
          { name: 'Face Pull',                sets: 2, repsMin: 20, repsMax: 25, rest: 45,  notes: 'Rear delts. The head pressing misses most.' },
          { name: 'Tricep Pushdown (Rope)',            sets: 2, repsMin: 12, repsMax: 20, rest: 60,  notes: 'Tricep finisher.' },
        ],
      },
      {
        name: 'Lower B',
        exercises: [
          { name: 'Leg Press',               sets: 3, repsMin: 12, repsMax: 20, rest: 90,  notes: 'Quad accessory work.' },
          { name: 'Lying Leg Curl',          sets: 3, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Hamstring focus.' },
          { name: 'Barbell Hip Thrust',      sets: 3, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Glute power.' },
          { name: 'Standing Calf Raise (Machine)', sets: 3, repsMin: 12, repsMax: 20, rest: 45, notes: 'Calf finisher.' },
        ],
      },
    ],
  },

  // ── 10. Chest & Shoulder Specialisation ──────────────────────────────────
  {
    name: 'Chest & Shoulder Specialisation',
    description: 'A specialisation phase for lifters who want to prioritise chest and shoulder development. Sets for these muscles are increased well above what a balanced plan provides; all other muscle groups are maintained with enough work to hold what you have. Run for 6–8 weeks, then return to a balanced plan. Add reps, then weight, on all chest and shoulder work. Expect visible improvement in shoulder roundness and upper-chest fullness within 8–10 weeks. Stop 1 to 2 reps before failure on each set.',
    tags: 'weak_point bodybuilding chest shoulders aesthetic gender:all goal:build_muscle days:2',
    difficulty: 1,
    workouts: [
      {
        name: 'Chest Day',
        exercises: [
          { name: 'Barbell Bench Press',       sets: 5, repsMin: 5,  repsMax: 8,  rest: 120, notes: 'Strength-focused. 5 heavy sets.' },
          { name: 'Incline Barbell Bench Press', sets: 4, repsMin: 8,  repsMax: 12, rest: 90, notes: 'Upper chest secondary.' },
          { name: 'Incline Dumbbell Fly',       sets: 3, repsMin: 12, repsMax: 20, rest: 60, notes: 'Stretch focus. Light weight, feel it.' },
          { name: 'Pec Deck (Machine Fly)',     sets: 3, repsMin: 15, repsMax: 20, rest: 60, notes: 'Pump finisher.' },
          { name: 'Weighted Dips (Chest)',      sets: 3, repsMin: 8,  repsMax: 15, rest: 90, notes: 'Stretch at bottom. Lean forward.' },
        ],
      },
      {
        name: 'Shoulder Day',
        exercises: [
          { name: 'Barbell Overhead Press',   sets: 4, repsMin: 5,  repsMax: 8,  rest: 120, notes: 'Standing strength press.' },
          { name: 'Dumbbell Shoulder Press',  sets: 3, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Higher reps for growth.' },
          { name: 'Dumbbell Lateral Raise',  sets: 5, repsMin: 15, repsMax: 25, rest: 60,  notes: 'Side delt focus. 5 sets.' },
          { name: 'Cable Lateral Raise',     sets: 3, repsMin: 15, repsMax: 25, rest: 60,  notes: 'Constant tension version of lateral raise.' },
          { name: 'Face Pull',               sets: 4, repsMin: 20, repsMax: 25, rest: 60,  notes: 'Rear delt health. Mandatory.' },
          { name: 'Dumbbell Rear Delt Fly',  sets: 3, repsMin: 15, repsMax: 25, rest: 60,  notes: 'Bent-over rear delt work.' },
        ],
      },
      {
        name: 'Back & Arms (Maintenance)',
        exercises: [
          { name: 'Lat Pulldown (Wide Grip)',  sets: 3, repsMin: 8,  repsMax: 12, rest: 90,  notes: 'Back maintenance.' },
          { name: 'Seated Cable Row',          sets: 3, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Mid-back maintenance.' },
          { name: 'EZ Bar Curl',               sets: 3, repsMin: 8,  repsMax: 12, rest: 60,  notes: 'Bicep maintenance.' },
          { name: 'Tricep Pushdown (Rope)',             sets: 3, repsMin: 12, repsMax: 20, rest: 60,  notes: 'Tricep maintenance.' },
        ],
      },
      {
        name: 'Legs',
        exercises: [
          { name: 'Barbell Back Squat',          sets: 4, repsMin: 6,  repsMax: 10, rest: 120, notes: 'Leg maintenance.' },
          { name: 'Romanian Deadlift (Barbell)', sets: 3, repsMin: 8,  repsMax: 12, rest: 90,  notes: 'Posterior chain maintenance.' },
          { name: 'Leg Extension',               sets: 3, repsMin: 15, repsMax: 25, rest: 60,  notes: 'Quad isolation finisher.' },
          { name: 'Lying Leg Curl',              sets: 3, repsMin: 10, repsMax: 15, rest: 60,  notes: 'Hamstring finisher.' },
        ],
      },
    ],
  },

  // ── 11. Back Width & Thickness Specialisation ────────────────────────────
  {
    name: 'Back Width & Thickness',
    description: 'A back specialisation block for lifters who want a wider, thicker back. Width comes from vertical pulling (lat pulldown variations, straight-arm pulldowns); thickness from horizontal rowing. Both are trained twice per week with plenty of sets. Other muscle groups are maintained with enough work to hold what you have. Run for 6–8 weeks within a broader training year. Add reps each session, then add weight when you reach the top of the range. Stop 1 to 2 reps before failure on each back set.',
    tags: 'weak_point back bodybuilding aesthetic gender:all goal:build_muscle days:2',
    difficulty: 1,
    workouts: [
      {
        name: 'Width Day: Vertical Pull Focus',
        exercises: [
          { name: 'Weighted Pull-Up',          sets: 4, repsMin: 5,  repsMax: 8,  rest: 90,  notes: 'Add belt weight. Full hang at bottom.' },
          { name: 'Lat Pulldown (Wide Grip)',  sets: 4, repsMin: 8,  repsMax: 12, rest: 90,  notes: 'Drive elbows down. Full stretch.' },
          { name: 'Lat Pulldown (Close Grip)', sets: 3, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Lower-lat emphasis. Pull to chest.' },
          { name: 'Cable Straight-Arm Pulldown', sets: 3, repsMin: 12, repsMax: 20, rest: 60, notes: 'Pure lat isolation. Slow arc.' },
          { name: 'Cable Lat Pullover',        sets: 3, repsMin: 12, repsMax: 20, rest: 60,  notes: 'Lat stretch and contraction.' },
        ],
      },
      {
        name: 'Thickness Day: Horizontal Row Focus',
        exercises: [
          { name: 'Barbell Row (Bent Over)',   sets: 5, repsMin: 5,  repsMax: 8,  rest: 120, notes: 'Heavy rowing. Pull to lower chest.' },
          { name: 'Seated Cable Row',          sets: 4, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Full stretch. Row to belly. Squeeze.' },
          { name: 'Machine Row (Chest Supported)', sets: 4, repsMin: 10, repsMax: 15, rest: 90, notes: 'No lower-back load. Strict reps.' },
          { name: 'Dumbbell Row',              sets: 3, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Single-arm. Rotate torso.' },
          { name: 'Conventional Deadlift',     sets: 3, repsMin: 4,  repsMax: 6,  rest: 150, notes: 'Heavy pulls. Back strength cornerstone.' },
        ],
      },
      {
        name: 'Arms & Shoulders (Maintenance)',
        exercises: [
          { name: 'Barbell Overhead Press',    sets: 3, repsMin: 6,  repsMax: 10, rest: 90,  notes: 'Shoulder maintenance press.' },
          { name: 'Dumbbell Lateral Raise',   sets: 3, repsMin: 15, repsMax: 25, rest: 60,  notes: 'Side delt maintenance.' },
          { name: 'EZ Bar Curl',               sets: 3, repsMin: 8,  repsMax: 12, rest: 60,  notes: 'Bicep maintenance.' },
          { name: 'Tricep Pushdown (Rope)',             sets: 3, repsMin: 12, repsMax: 20, rest: 60,  notes: 'Tricep maintenance.' },
        ],
      },
    ],
  },

  // ── 12. Leg Development Priority ─────────────────────────────────────────
  {
    name: 'Leg Development Priority',
    description: 'For lifters whose legs are noticeably behind their upper body. Quad and hamstring sessions are increased above what a balanced plan provides; upper body is maintained at a lower frequency. Two leg sessions per week (one quad-focused, one glute and hamstring-focused), plus an upper-body maintenance day, produce consistent lower-body growth. Run for 8–12 weeks, then reassess. Add reps each session, then add weight when you reach the top of the range. Push leg compound movements close to failure. Leave 2 reps in the tank on isolation exercises.',
    tags: 'weak_point legs quads hamstrings gender:all goal:build_muscle days:2',
    difficulty: 1,
    workouts: [
      {
        name: 'Quad-Dominant Day',
        exercises: [
          { name: 'Barbell Back Squat',   sets: 5, repsMin: 5,  repsMax: 8,  rest: 150, notes: 'Strength squats. 5×5 approach.' },
          { name: 'Hack Squat Machine',   sets: 4, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Quad machine focus.' },
          { name: 'Leg Press',            sets: 4, repsMin: 15, repsMax: 20, rest: 90,  notes: 'Volume accumulation.' },
          { name: 'Leg Extension',        sets: 4, repsMin: 15, repsMax: 25, rest: 60,  notes: 'Quad isolation pump.' },
          { name: 'Seated Calf Raise',    sets: 4, repsMin: 15, repsMax: 25, rest: 60,  notes: 'Soleus: slow and controlled.' },
        ],
      },
      {
        name: 'Posterior Chain Day',
        exercises: [
          { name: 'Conventional Deadlift',    sets: 4, repsMin: 5,  repsMax: 6,  rest: 150, notes: 'Heavy pulls. Drive hips through.' },
          { name: 'Romanian Deadlift (Barbell)', sets: 4, repsMin: 8,  repsMax: 12, rest: 90, notes: 'Hamstring stretch focus.' },
          { name: 'Lying Leg Curl',           sets: 4, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Full hamstring curl.' },
          { name: 'Seated Leg Curl',          sets: 3, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Seated keeps longer stretch.' },
          { name: 'Barbell Hip Thrust',       sets: 4, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Glute strength. Full hip extension.' },
        ],
      },
      {
        name: 'Upper Body (Maintenance)',
        exercises: [
          { name: 'Barbell Bench Press',      sets: 3, repsMin: 6,  repsMax: 10, rest: 90,  notes: 'Chest maintenance.' },
          { name: 'Lat Pulldown (Wide Grip)',  sets: 3, repsMin: 8,  repsMax: 12, rest: 90,  notes: 'Back maintenance.' },
          { name: 'Barbell Overhead Press',   sets: 3, repsMin: 6,  repsMax: 10, rest: 90,  notes: 'Front delt compound.' },
          { name: 'Dumbbell Lateral Raise',   sets: 2, repsMin: 15, repsMax: 20, rest: 45,  notes: 'Side delt maintenance. Pressing does not maintain these.' },
          { name: 'EZ Bar Curl',              sets: 2, repsMin: 8,  repsMax: 12, rest: 60,  notes: 'Arm maintenance.' },
        ],
      },
    ],
  },

  // ── 13. Glute & Hamstring Focus ───────────────────────────────────────────
  {
    name: 'Glute & Hamstring Focus',
    description: 'Hip-dominant training with an emphasis on the posterior chain: glutes, hamstrings, and spinal erectors. Ideal for athletes wanting stronger hip extension, or physique athletes prioritising glute development. Sessions are built around hip hinges, hip thrusts, and leg curl variations, with upper-body maintenance work included. Run as a 6–8 week specialisation phase. Add reps, then weight, on all major movements. Stop 1 to 2 reps before failure on each set.',
    tags: 'weak_point glutes hamstrings gender:all goal:build_muscle days:2',
    difficulty: 1,
    workouts: [
      {
        name: 'Glute Day',
        exercises: [
          { name: 'Barbell Hip Thrust',         sets: 5, repsMin: 8,  repsMax: 15, rest: 90,  notes: 'Load heavily over time. Squeeze at top.' },
          { name: 'Romanian Deadlift (Barbell)', sets: 4, repsMin: 8,  repsMax: 12, rest: 90, notes: 'Stretch focus. Feel glutes and hams loading.' },
          { name: 'Bulgarian Split Squat',       sets: 3, repsMin: 10, repsMax: 15, rest: 90, notes: 'Rear leg elevated. Front foot drives glutes.' },
          { name: 'Cable Kickback',              sets: 3, repsMin: 15, repsMax: 25, rest: 60, notes: 'Hip extension isolation.' },
          { name: 'Abduction Machine',            sets: 3, repsMin: 20, repsMax: 30, rest: 60, notes: 'Glute med activation.' },
        ],
      },
      {
        name: 'Hamstring Day',
        exercises: [
          { name: 'Conventional Deadlift',        sets: 4, repsMin: 4,  repsMax: 6,  rest: 150, notes: 'Heavy hip hinge. Build posterior chain.' },
          { name: 'Romanian Deadlift (Dumbbell)',  sets: 4, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Dumbbell version for range of motion.' },
          { name: 'Lying Leg Curl',               sets: 4, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Knee flexion hamstring isolation.' },
          { name: 'Seated Leg Curl',              sets: 4, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Seated adds extra hip-flexion stretch.' },
          { name: 'Nordic Curl',        sets: 3, repsMin: 3,  repsMax: 8,  rest: 90,  notes: 'Eccentric strength. Best hamstring exercise.' },
        ],
      },
    ],
  },

  // ── 14. V-Taper Aesthetic (Lats + Side Delts) ────────────────────────────
  {
    name: 'V-Taper Aesthetic',
    description: 'Building a tapered physique: wide upper back and capped side delts over a narrow waist. Back width and side delt work are both elevated above what a balanced plan provides; exercises that build waist width are excluded. Sessions are structured so the muscles that create visual width are trained first, when freshest. Run as a 6–8 week specialisation phase. Add reps each session, then add weight when you reach the top of the range. Stop 1 to 2 reps before failure on each set.',
    tags: 'aesthetic v_taper bodybuilding back shoulders gender:men goal:build_muscle days:2',
    difficulty: 1,
    workouts: [
      {
        name: 'Lats & Side Delts',
        exercises: [
          { name: 'Weighted Pull-Up',         sets: 4, repsMin: 5,  repsMax: 8,  rest: 90,  notes: 'Widest pull. Full hang, pull chest to bar.' },
          { name: 'Lat Pulldown (Wide Grip)', sets: 4, repsMin: 8,  repsMax: 12, rest: 90,  notes: 'Drive elbows straight down.' },
          { name: 'Cable Straight-Arm Pulldown', sets: 3, repsMin: 12, repsMax: 20, rest: 60, notes: 'Pure lat sweep isolation.' },
          { name: 'Dumbbell Lateral Raise',  sets: 5, repsMin: 15, repsMax: 25, rest: 60,  notes: '5 sets. Creates the wide illusion.' },
          { name: 'Cable Lateral Raise',     sets: 4, repsMin: 15, repsMax: 25, rest: 60,  notes: 'Constant tension. No cheating.' },
          { name: 'Machine Lateral Raise',   sets: 3, repsMin: 15, repsMax: 20, rest: 45,  notes: 'Pump finisher.' },
        ],
      },
      {
        name: 'Upper Back & Rear Delts',
        exercises: [
          { name: 'Barbell Row (Bent Over)',  sets: 4, repsMin: 6,  repsMax: 10, rest: 120, notes: 'Thickness and upper-back width.' },
          { name: 'Machine Row (Chest Supported)', sets: 4, repsMin: 10, repsMax: 15, rest: 90, notes: 'Mid-back detail.' },
          { name: 'Face Pull',               sets: 4, repsMin: 20, repsMax: 25, rest: 60,  notes: 'Rear delt + external rotation. Mandatory.' },
          { name: 'Reverse Pec Deck',        sets: 4, repsMin: 15, repsMax: 25, rest: 60,  notes: 'Rear delt isolation machine.' },
          { name: 'Dumbbell Rear Delt Fly',  sets: 3, repsMin: 15, repsMax: 25, rest: 60,  notes: 'Bent-over. Slow controlled.' },
        ],
      },
    ],
  },

  // ── 15. 2-Day Minimalist (Busy Schedule) ─────────────────────────────────
  {
    name: 'Minimalist 2×/Week',
    description: 'Two full-body sessions per week, covering every major muscle group in around 60 minutes each. Suitable for maintenance periods, very busy schedules, or as a bridge between more demanding plans. Sets are kept low: enough to preserve muscle and strength, but not enough for significant growth. Prioritises the highest-value compound movements. Add reps, then weight. Progress will be slower than with higher-frequency plans. Leave 2 reps in the tank on each set.',
    tags: 'minimalist full_body gender:all goal:build_muscle days:2 short',
    difficulty: 1,
    workouts: [
      {
        name: 'Session 1: Push & Hinge',
        exercises: [
          { name: 'Barbell Bench Press',       sets: 3, repsMin: 6,  repsMax: 10, rest: 120, notes: 'Main push. No warmup skip.' },
          { name: 'Barbell Overhead Press',   sets: 3, repsMin: 6,  repsMax: 10, rest: 90,  notes: 'Shoulder compound.' },
          { name: 'Conventional Deadlift',    sets: 3, repsMin: 4,  repsMax: 6,  rest: 150, notes: 'Full posterior chain in one movement.' },
          { name: 'Tricep Pushdown (Rope)',            sets: 2, repsMin: 12, repsMax: 20, rest: 60,  notes: 'Tricep isolation finisher.' },
        ],
      },
      {
        name: 'Session 2: Pull & Squat',
        exercises: [
          { name: 'Barbell Back Squat',       sets: 3, repsMin: 6,  repsMax: 10, rest: 120, notes: 'Quad strength base.' },
          { name: 'Lat Pulldown (Wide Grip)', sets: 3, repsMin: 8,  repsMax: 12, rest: 90,  notes: 'Back width compound.' },
          { name: 'Seated Cable Row',         sets: 3, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Mid-back.' },
          { name: 'EZ Bar Curl',              sets: 2, repsMin: 8,  repsMax: 12, rest: 60,  notes: 'Bicep isolation finisher.' },
        ],
      },
    ],
  },

  // ── 16. 3-Day Power Hypertrophy ────────────────────────────────────────────
  {
    name: '3-Day Power + Muscle',
    description: 'Combines heavy strength work (3–5 reps, close to maximal effort) with muscle-building accessory exercises (8–15 reps) in the same session. The heavy work builds raw strength; the accessory work produces enough sets for sustained muscle growth. This approach develops both qualities at the same time rather than focusing on just one. Best for lifters with 2 or more years of training who want to be both strong and muscular. Push the heavy sets hard but leave a couple of reps in the tank. Take accessory work close to failure.',
    tags: 'bodybuilding strength gender:all goal:get_stronger days:3',
    difficulty: 2,
    workouts: [
      {
        name: 'Day A: Squat + Push',
        exercises: [
          { name: 'Barbell Back Squat',       sets: 5, repsMin: 3,  repsMax: 5,  rest: 180, notes: 'Work to a heavy top set then 4 back-off sets.' },
          { name: 'Barbell Bench Press',      sets: 5, repsMin: 3,  repsMax: 5,  rest: 180, notes: 'Heavy pressing. Strong arch.' },
          { name: 'Leg Press',               sets: 3, repsMin: 12, repsMax: 20, rest: 90,  notes: 'Back-off sets for leg growth.' },
          { name: 'Incline Dumbbell Press',  sets: 3, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Extra chest work after bench.' },
          { name: 'Dumbbell Lateral Raise',  sets: 3, repsMin: 15, repsMax: 25, rest: 60,  notes: 'Side delts. Assistance work.' },
        ],
      },
      {
        name: 'Day B: Deadlift + Pull',
        exercises: [
          { name: 'Conventional Deadlift',    sets: 5, repsMin: 3,  repsMax: 5,  rest: 180, notes: 'Work up to a heavy top set. Brace everything.' },
          { name: 'Weighted Pull-Up',         sets: 4, repsMin: 5,  repsMax: 8,  rest: 120, notes: 'Weighted vertical pull.' },
          { name: 'Romanian Deadlift (Barbell)', sets: 3, repsMin: 8, repsMax: 12, rest: 90, notes: 'Hamstring back-off work.' },
          { name: 'Seated Cable Row',         sets: 3, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Back accessory work.' },
          { name: 'EZ Bar Curl',              sets: 3, repsMin: 8,  repsMax: 12, rest: 60,  notes: 'Bicep assistance.' },
        ],
      },
      {
        name: 'Day C: Shoulders + Arms',
        exercises: [
          { name: 'Barbell Overhead Press',   sets: 5, repsMin: 3,  repsMax: 5,  rest: 150, notes: 'Heavy overhead press. Front delt strength base.' },
          { name: 'Dumbbell Lateral Raise',   sets: 4, repsMin: 15, repsMax: 25, rest: 60,  notes: 'Side delts. These do not grow from pressing. 4 working sets.' },
          { name: 'Face Pull',                sets: 3, repsMin: 20, repsMax: 25, rest: 60,  notes: 'Rear delts and external rotation. Non-negotiable for shoulder health.' },
          { name: 'EZ Bar Skull Crusher',     sets: 3, repsMin: 10, repsMax: 15, rest: 60,  notes: 'Tricep overhead work. Long-head stretch.' },
          { name: 'EZ Bar Preacher Curl',   sets: 3, repsMin: 8,  repsMax: 12, rest: 60,  notes: 'Bicep peak. Slow negative.' },
        ],
      },
    ],
  },

  // ── 17. Arms & Upper Body Aesthetic ──────────────────────────────────────
  {
    name: 'Arms & Upper Body Aesthetic',
    description: 'Built for lifters who want to prioritise arm development alongside overall upper-body aesthetics. Bicep and tricep sets are increased well beyond what a balanced plan provides; chest, shoulders, and back are maintained with enough work to hold what you have. Three upper sessions per week, each with a different focus. Run for 6–8 weeks. Add reps, then weight, on every exercise. Stop 1 to 2 reps before failure on your last set.',
    tags: 'aesthetic bodybuilding arms gender:all goal:build_muscle days:2 weak_point',
    difficulty: 1,
    workouts: [
      {
        name: 'Chest & Triceps',
        exercises: [
          { name: 'Barbell Bench Press',       sets: 4, repsMin: 8,  repsMax: 12, rest: 90,  notes: 'Volume focus.' },
          { name: 'Incline Dumbbell Press',    sets: 4, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Upper chest.' },
          { name: 'Pec Deck (Machine Fly)',    sets: 3, repsMin: 12, repsMax: 20, rest: 60,  notes: 'Pump isolation.' },
          { name: 'Cable Overhead Tricep Extension', sets: 4, repsMin: 12, repsMax: 20, rest: 60, notes: 'Long-head stretch. Key for arm size.' },
          { name: 'EZ Bar Skull Crusher',      sets: 3, repsMin: 10, repsMax: 15, rest: 60,  notes: 'Overhead tricep.' },
          { name: 'Tricep Pushdown (Rope)',             sets: 3, repsMin: 15, repsMax: 20, rest: 60,  notes: 'Tricep pump finisher.' },
        ],
      },
      {
        name: 'Back & Biceps',
        exercises: [
          { name: 'Lat Pulldown (Wide Grip)',  sets: 4, repsMin: 8,  repsMax: 12, rest: 90,  notes: 'Back width.' },
          { name: 'Seated Cable Row',          sets: 3, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Thickness.' },
          { name: 'EZ Bar Curl',               sets: 4, repsMin: 8,  repsMax: 12, rest: 60,  notes: 'Primary bicep compound.' },
          { name: 'Incline Dumbbell Curl',     sets: 4, repsMin: 10, repsMax: 15, rest: 60,  notes: 'Full stretch at bottom. Great for bicep growth.' },
          { name: 'EZ Bar Preacher Curl',    sets: 3, repsMin: 8,  repsMax: 12, rest: 60,  notes: 'Peak contraction.' },
          { name: 'Hammer Curl',               sets: 3, repsMin: 10, repsMax: 15, rest: 60,  notes: 'Brachialis and outer bicep.' },
        ],
      },
      {
        name: 'Shoulders & Core',
        exercises: [
          { name: 'Barbell Overhead Press',   sets: 4, repsMin: 6,  repsMax: 10, rest: 90,  notes: 'Shoulder compound.' },
          { name: 'Dumbbell Lateral Raise',  sets: 5, repsMin: 15, repsMax: 25, rest: 60,  notes: 'Wide side delts.' },
          { name: 'Face Pull',               sets: 3, repsMin: 20, repsMax: 25, rest: 60,  notes: 'Rear delt health.' },
          { name: 'Cable Crunch',            sets: 3, repsMin: 15, repsMax: 25, rest: 60,  notes: 'Abs: keep waist tight.' },
          { name: 'Hanging Leg Raise',       sets: 3, repsMin: 10, repsMax: 20, rest: 60,  notes: 'Lower abs.' },
        ],
      },
    ],
  },

  // ── 18. Female Bodybuilding Foundation ───────────────────────────────────
  {
    name: 'Female Bodybuilding Foundation',
    description: 'A physique-focused plan structured around the muscle groups most impactful for female bodybuilding and fitness: glutes, hamstrings, upper-body detail, and shoulder width. Two lower-body sessions per week give glutes and hamstrings the frequency needed for visible development; an upper-body session balances the physique. Add reps session by session, then add weight when you reach the top of the rep range. Stop 1 to 2 reps before failure on each set. Suitable for female lifters with 6 months or more of consistent resistance training.',
    tags: 'bodybuilding glutes hamstrings gender:women goal:build_muscle days:3 intermediate',
    difficulty: 1,
    workouts: [
      {
        name: 'Lower: Glute Focused',
        exercises: [
          { name: 'Barbell Hip Thrust',         sets: 4, repsMin: 8,  repsMax: 15, rest: 90,  notes: 'Primary glute driver. Go heavy over time.' },
          { name: 'Romanian Deadlift (Barbell)', sets: 3, repsMin: 8,  repsMax: 12, rest: 90, notes: 'Glutes and hamstrings loaded.' },
          { name: 'Bulgarian Split Squat',       sets: 3, repsMin: 10, repsMax: 15, rest: 90, notes: 'Unilateral glute work.' },
          { name: 'Cable Kickback',              sets: 3, repsMin: 15, repsMax: 25, rest: 60, notes: 'Hip extension isolation.' },
          { name: 'Seated Calf Raise',           sets: 3, repsMin: 15, repsMax: 25, rest: 60, notes: 'Calf finisher.' },
        ],
      },
      {
        name: 'Upper: Push & Pull',
        exercises: [
          { name: 'Incline Dumbbell Press',   sets: 3, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Upper chest push.' },
          { name: 'Lat Pulldown (Wide Grip)', sets: 3, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Back width.' },
          { name: 'Dumbbell Shoulder Press',  sets: 3, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Shoulder compound.' },
          { name: 'Seated Cable Row',         sets: 3, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Mid-back.' },
          { name: 'Dumbbell Lateral Raise',  sets: 3, repsMin: 15, repsMax: 25, rest: 60,  notes: 'Shoulder width.' },
        ],
      },
      {
        name: 'Lower: Quad & Hamstring',
        exercises: [
          { name: 'Leg Press',               sets: 4, repsMin: 12, repsMax: 20, rest: 90,  notes: 'Volume quads.' },
          { name: 'Lying Leg Curl',          sets: 4, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Hamstring isolation.' },
          { name: 'Hack Squat Machine',      sets: 3, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Quad definition.' },
          { name: 'Leg Extension',           sets: 3, repsMin: 15, repsMax: 25, rest: 60,  notes: 'Quad pump.' },
          { name: 'Abduction Machine',        sets: 3, repsMin: 20, repsMax: 30, rest: 60,  notes: 'Glute med / hip width.' },
        ],
      },
    ],
  },

  // ── 19. Women's Full Body Foundation ──────────────────────────────────────
  {
    name: 'Women\'s Full Body Foundation',
    description: 'Three full-body sessions per week covering every major muscle group with an emphasis on the lower body and glutes. Designed as a first plan for anyone starting out, or returning after a break. Each session covers a squat, a hinge, a push, and a pull: the four movements you need to build strength from scratch. Add small amounts of weight each week and focus on technique before chasing numbers. Leave 2 to 3 reps in the tank on every set.',
    tags: 'beginner full_body gender:women goal:build_muscle days:3 audience:beginner featured',
    difficulty: 0,
    workouts: [
      {
        name: 'Full Body A',
        exercises: [
          { name: 'Goblet Squat', sets: 3, repsMin: 10, repsMax: 15, rest: 90, notes: 'Hold dumbbell at chest. Sit deep into the squat. Push knees out.' },
          { name: 'Romanian Deadlift (Barbell)', sets: 3, repsMin: 10, repsMax: 12, rest: 90, notes: 'Hip hinge. Feel the hamstring stretch. Keep bar close to legs.' },
          { name: 'Dumbbell Bench Press', sets: 3, repsMin: 10, repsMax: 15, rest: 90, notes: 'Control the descent. Press smoothly. Full range.' },
          { name: 'Dumbbell Row', sets: 3, repsMin: 10, repsMax: 15, rest: 90, notes: 'Brace core. Pull elbow back and up. Squeeze back.' },
          { name: 'Glute Bridge', sets: 3, repsMin: 15, repsMax: 20, rest: 60, notes: 'Drive hips up. Squeeze glutes hard at top. Hold 1 second.' },
        ],
      },
      {
        name: 'Full Body B',
        exercises: [
          { name: 'Leg Press', sets: 3, repsMin: 12, repsMax: 15, rest: 90, notes: 'Higher foot placement for more glute and hamstring. Full range.' },
          { name: 'Lying Leg Curl', sets: 3, repsMin: 12, repsMax: 15, rest: 60, notes: 'Curl towards glutes. Hold a second at top.' },
          { name: 'Incline Dumbbell Press', sets: 3, repsMin: 10, repsMax: 15, rest: 90, notes: 'Slight incline. Upper chest emphasis. Control down.' },
          { name: 'Lat Pulldown (Wide Grip)', sets: 3, repsMin: 10, repsMax: 15, rest: 90, notes: 'Pull elbows down to sides. Arch chest towards bar.' },
          { name: 'Dumbbell Lateral Raise', sets: 3, repsMin: 15, repsMax: 20, rest: 60, notes: 'Light weight. Raise to shoulder height. Slow and controlled.' },
        ],
      },
      {
        name: 'Full Body C',
        exercises: [
          { name: 'Bulgarian Split Squat', sets: 3, repsMin: 10, repsMax: 12, rest: 90, notes: 'Rear foot on bench. Front knee tracks over toes. Drive through front heel.' },
          { name: 'Seated Leg Curl', sets: 3, repsMin: 12, repsMax: 15, rest: 60, notes: 'Full stretch at start. Curl to full contraction. Squeeze.' },
          { name: 'Dumbbell Shoulder Press', sets: 3, repsMin: 10, repsMax: 15, rest: 90, notes: 'Seated. Press overhead. Lower slowly.' },
          { name: 'Seated Cable Row', sets: 3, repsMin: 12, repsMax: 15, rest: 90, notes: 'Full stretch. Row to belly. Elbows back.' },
          { name: 'Face Pull', sets: 3, repsMin: 15, repsMax: 20, rest: 60, notes: 'Rope at eye height. Elbows high. Rear-delt and shoulder health.' },
        ],
      },
    ],
  },

  // ── 20. Women's Glute & Strength ──────────────────────────────────────────
  {
    name: 'Women\'s Glute & Strength',
    description: 'A four-day plan built around glute and hamstring development, with upper-body strength work to balance proportions. Days one and three focus on the lower body with a different emphasis each session: one heavier and compound-led, the other detail-oriented. Days two and four train the upper body with enough sets to build visible strength in the shoulders, back, and arms. Progress by adding weight when all reps are completed with good technique.',
    tags: 'intermediate upper_lower gender:women goal:build_muscle days:4 glutes featured',
    difficulty: 1,
    workouts: [
      {
        name: 'Lower A: Glutes & Hamstrings',
        exercises: [
          { name: 'Barbell Hip Thrust', sets: 4, repsMin: 10, repsMax: 15, rest: 90, notes: 'Shoulders on bench. Drive hips fully up. Squeeze hard at top.' },
          { name: 'Romanian Deadlift (Barbell)', sets: 4, repsMin: 8, repsMax: 12, rest: 90, notes: 'Hip hinge. Long hamstring stretch. Control the descent.' },
          { name: 'Bulgarian Split Squat', sets: 3, repsMin: 10, repsMax: 12, rest: 90, notes: 'Rear foot elevated. Drive through front heel. Knee tracks toes.' },
          { name: 'Lying Leg Curl', sets: 3, repsMin: 12, repsMax: 15, rest: 60, notes: 'Curl hard. Squeeze glutes as you curl. Hold at top.' },
          { name: 'Cable Kickback', sets: 3, repsMin: 15, repsMax: 20, rest: 60, notes: 'Full hip extension. Squeeze glute at top. Slow and controlled.' },
        ],
      },
      {
        name: 'Upper A: Back & Shoulders',
        exercises: [
          { name: 'Lat Pulldown (Wide Grip)', sets: 4, repsMin: 10, repsMax: 12, rest: 90, notes: 'Pull elbows to sides. Stretch fully overhead between reps.' },
          { name: 'Seated Cable Row', sets: 4, repsMin: 10, repsMax: 15, rest: 90, notes: 'Full stretch. Row elbows back. Squeeze shoulder blades.' },
          { name: 'Dumbbell Shoulder Press', sets: 3, repsMin: 10, repsMax: 15, rest: 90, notes: 'Press overhead. Full range. Lower slowly.' },
          { name: 'Dumbbell Lateral Raise', sets: 4, repsMin: 15, repsMax: 20, rest: 60, notes: 'Raise to shoulder height only. Slow eccentric.' },
          { name: 'Face Pull', sets: 3, repsMin: 15, repsMax: 20, rest: 60, notes: 'Rope at eye height. Elbows high. Rear-delt health.' },
        ],
      },
      {
        name: 'Lower B: Quads & Glutes',
        exercises: [
          { name: 'Barbell Back Squat', sets: 4, repsMin: 8, repsMax: 12, rest: 120, notes: 'Full depth. Knees out. Drive through heels.' },
          { name: 'Leg Press', sets: 3, repsMin: 12, repsMax: 15, rest: 90, notes: 'High foot for glutes. Lower foot for quads. Mix it up.' },
          { name: 'Leg Extension', sets: 3, repsMin: 15, repsMax: 20, rest: 60, notes: 'Quad isolation. Squeeze hard at the top. Slow descent.' },
          { name: 'Glute Bridge', sets: 4, repsMin: 15, repsMax: 20, rest: 60, notes: 'Body-weight or load on hips. Drive hips up. Squeeze.' },
          { name: 'Seated Leg Curl', sets: 3, repsMin: 12, repsMax: 15, rest: 60, notes: 'Full stretch. Curl to contraction. Slow and controlled.' },
        ],
      },
      {
        name: 'Upper B: Chest, Arms & Core',
        exercises: [
          { name: 'Incline Dumbbell Press', sets: 4, repsMin: 10, repsMax: 15, rest: 90, notes: 'Slight incline. Upper chest. Control the descent.' },
          { name: 'Machine Row (Chest Supported)', sets: 4, repsMin: 10, repsMax: 15, rest: 90, notes: 'Chest on pad. Row elbows back. Squeeze back.' },
          { name: 'Dumbbell Curl', sets: 3, repsMin: 10, repsMax: 15, rest: 60, notes: 'Full range. Squeeze at top. Lower slowly.' },
          { name: 'Tricep Pushdown (Rope)', sets: 3, repsMin: 12, repsMax: 15, rest: 60, notes: 'Elbows pinned. Full extension. Squeeze triceps.' },
          { name: 'Dumbbell Lateral Raise', sets: 3, repsMin: 15, repsMax: 20, rest: 60, notes: 'Shoulder-width only. Slow, controlled arc.' },
        ],
      },
    ],
  },

  // ── 21. Dumbbell Only, Full Body ─────────────────────────────────────────
  {
    name: 'Dumbbell Only: Full Body',
    description: 'A three-day full-body plan that requires nothing but a set of dumbbells. Every major muscle group is trained each session using dumbbell-friendly movement patterns: squat, hinge, press, and row. Great for home training, travel, or gyms with limited equipment. Progress by adding reps first. Once you hit the top of the rep range, move up to the next dumbbell weight.',
    tags: 'full_body equipment:dumbbell gender:all goal:build_muscle days:3 beginner intermediate featured',
    difficulty: 0,
    workouts: [
      {
        name: 'Full Body A',
        exercises: [
          { name: 'Goblet Squat', sets: 4, repsMin: 10, repsMax: 15, rest: 90, notes: 'Hold dumbbell at chest. Sit deep. Push knees out.' },
          { name: 'Romanian Deadlift (Barbell)', sets: 3, repsMin: 10, repsMax: 12, rest: 90, notes: 'Use dumbbells. Hip hinge. Long hamstring stretch.' },
          { name: 'Dumbbell Bench Press', sets: 4, repsMin: 10, repsMax: 15, rest: 90, notes: 'Flat bench or floor press if no bench. Full range.' },
          { name: 'Dumbbell Row', sets: 4, repsMin: 10, repsMax: 15, rest: 90, notes: 'Brace core. Pull elbow back and up. Squeeze back at top.' },
          { name: 'Dumbbell Lateral Raise', sets: 3, repsMin: 15, repsMax: 20, rest: 60, notes: 'Light. Raise to shoulder height. Slow and controlled.' },
        ],
      },
      {
        name: 'Full Body B',
        exercises: [
          { name: 'Bulgarian Split Squat', sets: 3, repsMin: 10, repsMax: 15, rest: 90, notes: 'Rear foot on chair. Dumbbells at sides. Drive through front heel.' },
          { name: 'Glute Bridge', sets: 3, repsMin: 15, repsMax: 20, rest: 60, notes: 'Dumbbell on hips for load. Drive hips up. Squeeze at top.' },
          { name: 'Incline Dumbbell Press', sets: 4, repsMin: 10, repsMax: 15, rest: 90, notes: 'Incline bench or floor. Upper chest. Control down.' },
          { name: 'Dumbbell Shoulder Press', sets: 3, repsMin: 10, repsMax: 15, rest: 90, notes: 'Seated or standing. Full overhead range.' },
          { name: 'EZ Bar Curl', sets: 3, repsMin: 10, repsMax: 15, rest: 60, notes: 'Use dumbbells. Full range. Squeeze at top.' },
        ],
      },
      {
        name: 'Full Body C',
        exercises: [
          { name: 'Lunge', sets: 3, repsMin: 10, repsMax: 15, rest: 90, notes: 'Walking or stationary. Dumbbells at sides. Front knee tracks toes.' },
          { name: 'Romanian Deadlift (Barbell)', sets: 3, repsMin: 10, repsMax: 12, rest: 90, notes: 'Use dumbbells. Slow eccentric. Feel the stretch.' },
          { name: 'Dumbbell Bench Press', sets: 3, repsMin: 10, repsMax: 15, rest: 90, notes: 'Vary grip: neutral or pronated.' },
          { name: 'Dumbbell Row', sets: 3, repsMin: 10, repsMax: 15, rest: 90, notes: 'Other side. Match reps on both arms.' },
          { name: 'Dumbbell Rear Delt Fly', sets: 3, repsMin: 15, repsMax: 20, rest: 60, notes: 'Rear delts. Bent-over, slight elbow bend, slow arc. A different muscle from side delts.' },
          { name: 'Hammer Curl', sets: 3, repsMin: 10, repsMax: 15, rest: 60, notes: 'Neutral grip. Brachialis and outer bicep. Keep elbows pinned.' },
        ],
      },
    ],
  },

  // ── 22. Home, No Equipment ───────────────────────────────────────────────
  {
    name: 'Home: No Equipment',
    description: 'Three sessions per week using only your bodyweight. Designed to build genuine strength and control across the whole body without needing a gym or any equipment. Progressions are built in. As movements become too easy, there are harder variations to move towards. A good starting point if you are completely new to training, or to maintain fitness when you cannot get to a gym.',
    tags: 'full_body equipment:bodyweight home gender:all goal:build_muscle goal:conditioning days:3 beginner audience:beginner',
    difficulty: 0,
    workouts: [
      {
        name: 'Session A',
        exercises: [
          { name: 'Bodyweight Squat', sets: 4, repsMin: 15, repsMax: 25, rest: 60, notes: 'Sit as deep as possible. Push knees out. Drive through heels. When this feels easy, progress to Bulgarian split squat.' },
          { name: 'Push-Up', sets: 4, repsMin: 8, repsMax: 20, rest: 60, notes: 'Full range. Chest to floor. Lock elbows at top. Elevate hands on a surface to make it easier; feet for harder.' },
          { name: 'Lunge', sets: 3, repsMin: 10, repsMax: 15, rest: 60, notes: 'Per leg. Front knee tracks toes. Upright torso.' },
          { name: 'Inverted Row', sets: 3, repsMin: 8, repsMax: 15, rest: 60, notes: 'Under a table or bar. Body straight. Pull chest to bar. If you have a bar, progress to pull-up.' },
          { name: 'Glute Bridge', sets: 3, repsMin: 15, repsMax: 25, rest: 60, notes: 'Drive hips up. Squeeze glutes at top. Single-leg to progress.' },
        ],
      },
      {
        name: 'Session B',
        exercises: [
          { name: 'Bulgarian Split Squat', sets: 3, repsMin: 8, repsMax: 15, rest: 90, notes: 'Rear foot on a chair or sofa. Front knee tracks toes. Drive through the front heel.' },
          { name: 'Push-Up', sets: 3, repsMin: 10, repsMax: 20, rest: 60, notes: 'Try a closer grip for more tricep emphasis. Keep elbows at 45 degrees.' },
          { name: 'Bodyweight Squat', sets: 3, repsMin: 20, repsMax: 30, rest: 60, notes: 'Higher rep today. Smooth and controlled. Pause at the bottom.' },
          { name: 'Inverted Row', sets: 3, repsMin: 8, repsMax: 15, rest: 60, notes: 'Pull hard. Pause at the top. Slow descent.' },
          { name: 'Glute Bridge', sets: 4, repsMin: 15, repsMax: 20, rest: 60, notes: 'Add a hold of 2 seconds at the top this session.' },
        ],
      },
      {
        name: 'Session C',
        exercises: [
          { name: 'Lunge', sets: 4, repsMin: 12, repsMax: 20, rest: 60, notes: 'Walking lunges if space allows. Maintain an upright torso throughout.' },
          { name: 'Push-Up', sets: 4, repsMin: 10, repsMax: 20, rest: 60, notes: 'Vary width. Wide grip for chest. Close for triceps. Find your challenge point.' },
          { name: 'Bodyweight Squat', sets: 3, repsMin: 15, repsMax: 25, rest: 60, notes: 'Add a pause at the bottom if regular squats feel easy.' },
          { name: 'Inverted Row', sets: 4, repsMin: 8, repsMax: 15, rest: 60, notes: 'Keep hips up. Body straight. Scapulae retract as you pull.' },
          { name: 'Glute Bridge', sets: 3, repsMin: 20, repsMax: 25, rest: 60, notes: 'High rep set. Full squeeze every rep.' },
        ],
      },
    ],
  },

  // ── 23. Men's Physique, Off-Season ──────────────────────────────────────
  {
    name: "Men's Physique",
    description: "Five-day plan built around the Men's Physique division. Judged from the waist up in board shorts, the division rewards a broad back, capped shoulders, full chest, and defined arms over a lean midsection. Legs are trained once per week to maintain health and proportion. The plan runs for 8 to 12 weeks, prioritising shoulder width, upper-chest development, lat width, and rear-delt health. Progress conservatively. This is a muscle-building phase, not a strength-testing phase.",
    tags: 'bodybuilding category:division division:mens_physique gender:men goal:stage_prep days:5 advanced intermediate featured',
    difficulty: 2,
    workouts: [
      {
        name: 'Day 1: Shoulders & Arms',
        exercises: [
          { name: 'Barbell Overhead Press', sets: 4, repsMin: 8, repsMax: 12, rest: 120, notes: 'Primary shoulder builder. Control the descent. Stop 1 to 2 reps short of failure.' },
          { name: 'Dumbbell Lateral Raise', sets: 5, repsMin: 15, repsMax: 20, rest: 60, notes: 'Width is key in this division. Lead with elbow. 4 s eccentric.' },
          { name: 'Cable Lateral Raise', sets: 4, repsMin: 15, repsMax: 20, rest: 60, notes: 'Cables keep constant tension. Alternate arms or use both. Keep strict form.' },
          { name: 'EZ Bar Curl', sets: 4, repsMin: 8, repsMax: 12, rest: 60, notes: 'Full range. Squeeze at top. Slow 3 s descent.' },
          { name: 'Tricep Pushdown (Rope)', sets: 4, repsMin: 12, repsMax: 15, rest: 60, notes: 'Elbows pinned. Full extension. Squeeze at bottom.' },
          { name: 'Dumbbell Overhead Tricep Extension', sets: 3, repsMin: 10, repsMax: 15, rest: 60, notes: 'Long head emphasis. Full overhead stretch.' },
        ],
      },
      {
        name: 'Day 2: Back Width & Thickness',
        exercises: [
          { name: 'Lat Pulldown (Wide Grip)', sets: 4, repsMin: 8, repsMax: 12, rest: 90, notes: 'Lat width is a judging priority. Full stretch. Pull elbows to pockets.' },
          { name: 'Seated Cable Row', sets: 4, repsMin: 10, repsMax: 12, rest: 90, notes: 'Full stretch forward. Row to lower chest. Squeeze mid-back.' },
          { name: 'T-Bar Row', sets: 4, repsMin: 8, repsMax: 12, rest: 90, notes: 'Chest against pad. Controlled. Squeeze at top.' },
          { name: 'Cable Straight-Arm Pulldown', sets: 3, repsMin: 12, repsMax: 15, rest: 60, notes: 'Lat activation. Slight elbow bend. Slow arc down.' },
          { name: 'Face Pull', sets: 4, repsMin: 20, repsMax: 25, rest: 60, notes: 'Rear-delt and rotator cuff health. Rope at chest height. Elbows high.' },
        ],
      },
      {
        name: 'Day 3: Chest & Triceps',
        exercises: [
          { name: 'Incline Barbell Bench Press', sets: 4, repsMin: 8, repsMax: 12, rest: 120, notes: 'Upper chest fills the board-shorts look from the front. Control descent.' },
          { name: 'Incline Dumbbell Press', sets: 4, repsMin: 10, repsMax: 15, rest: 90, notes: 'Greater range of motion than barbell. Slow 3 s descent.' },
          { name: 'Pec Deck (Machine Fly)', sets: 4, repsMin: 12, repsMax: 15, rest: 90, notes: 'Chest isolation. Full stretch. Squeeze hard at the contraction point.' },
          { name: 'Close-Grip Bench Press', sets: 4, repsMin: 8, repsMax: 12, rest: 90, notes: 'Tricep compound. Elbows at 45 degrees. Full extension at top.' },
          { name: 'Tricep Pushdown (Rope)', sets: 3, repsMin: 15, repsMax: 20, rest: 60, notes: 'Tricep finishing sets. Squeeze every rep.' },
        ],
      },
      {
        name: 'Day 4: Legs (Maintenance)',
        exercises: [
          { name: 'Barbell Back Squat', sets: 3, repsMin: 8, repsMax: 12, rest: 120, notes: 'Legs are not displayed in board shorts but must be trained for balance and health. One moderate leg session per week is enough in a muscle-building phase.' },
          { name: 'Leg Press', sets: 3, repsMin: 12, repsMax: 15, rest: 90, notes: 'Secondary sets only. No need to push to the limit on this day.' },
          { name: 'Romanian Deadlift (Barbell)', sets: 3, repsMin: 10, repsMax: 12, rest: 90, notes: 'Hamstring and glute work. Keep it solid, not extreme.' },
          { name: 'Leg Extension', sets: 3, repsMin: 15, repsMax: 20, rest: 60, notes: 'Quad detail. High reps, pump-focused.' },
          { name: 'Lying Leg Curl', sets: 3, repsMin: 12, repsMax: 15, rest: 60, notes: 'Hamstring curl. Full range. Squeeze at top.' },
        ],
      },
      {
        name: 'Day 5: Shoulders & Back Detail',
        exercises: [
          { name: 'Dumbbell Lateral Raise', sets: 5, repsMin: 15, repsMax: 20, rest: 60, notes: 'Second shoulder session of the week. Men\'s Physique is won on shoulder width. Strict form, slow descent.' },
          { name: 'Cable Rear Delt Fly', sets: 4, repsMin: 15, repsMax: 20, rest: 60, notes: 'Rear-delt detail. Essential for shoulder roundness from behind.' },
          { name: 'Lat Pulldown (Wide Grip)', sets: 4, repsMin: 10, repsMax: 15, rest: 90, notes: 'Second lat session. Focus on the stretch and contraction.' },
          { name: 'Machine Row (Chest Supported)', sets: 3, repsMin: 12, repsMax: 15, rest: 90, notes: 'Back detail and thickness without lower-back stress.' },
          { name: 'Hammer Curl', sets: 3, repsMin: 12, repsMax: 15, rest: 60, notes: 'Brachialis and forearm development. Keep elbows pinned.' },
        ],
      },
    ],
  },

  // ── 24. Bikini, Off-Season ───────────────────────────────────────────────
  {
    name: 'Bikini',
    description: "Four-day plan built around the Bikini division. Bikini rewards a lean, athletic physique with developed glutes, balanced shoulders, and a soft overall appearance, not extreme muscle mass. This plan trains glutes and hamstrings twice per week with a mix of heavy compound work and detail isolation, while upper body sessions build proportional shoulder width and a strong back. Progress on the compound movements week to week. The focus is building muscle and strength.",
    tags: 'bodybuilding category:division division:bikini gender:women goal:stage_prep days:4 intermediate featured',
    difficulty: 1,
    workouts: [
      {
        name: 'Day 1: Glutes & Hamstrings (Heavy)',
        exercises: [
          { name: 'Barbell Hip Thrust', sets: 5, repsMin: 8, repsMax: 12, rest: 120, notes: 'Primary glute builder in this division. Shoulders on bench, hips fully extended. Squeeze hard at top.' },
          { name: 'Romanian Deadlift (Barbell)', sets: 4, repsMin: 8, repsMax: 12, rest: 90, notes: 'Long hamstring stretch. Slow 3 s eccentric. Hip hinge only: do not round the back.' },
          { name: 'Bulgarian Split Squat', sets: 3, repsMin: 10, repsMax: 12, rest: 90, notes: 'Rear foot elevated. Drive through front heel. Squeeze glute at the top.' },
          { name: 'Lying Leg Curl', sets: 3, repsMin: 12, repsMax: 15, rest: 60, notes: 'Curl hard. Squeeze at top. Slow descent.' },
          { name: 'Cable Kickback', sets: 3, repsMin: 15, repsMax: 20, rest: 60, notes: 'Full hip extension. Squeeze glute. Control the return.' },
        ],
      },
      {
        name: 'Day 2: Upper Body',
        exercises: [
          { name: 'Lat Pulldown (Wide Grip)', sets: 4, repsMin: 10, repsMax: 12, rest: 90, notes: 'Back width contributes to the V-shape even in Bikini. Full stretch overhead. Pull elbows down.' },
          { name: 'Seated Cable Row', sets: 4, repsMin: 10, repsMax: 15, rest: 90, notes: 'Row elbows back. Squeeze mid-back. Full stretch forward between reps.' },
          { name: 'Dumbbell Shoulder Press', sets: 3, repsMin: 10, repsMax: 15, rest: 90, notes: 'Balanced shoulder development. Press overhead. Control down.' },
          { name: 'Dumbbell Lateral Raise', sets: 4, repsMin: 15, repsMax: 20, rest: 60, notes: 'Capped shoulders give the narrow-waist illusion. Raise to shoulder height. Slow eccentric.' },
          { name: 'Dumbbell Curl', sets: 3, repsMin: 12, repsMax: 15, rest: 60, notes: 'Arms need enough development for stage confidence. Full range.' },
        ],
      },
      {
        name: 'Day 3: Quads & Glutes',
        exercises: [
          { name: 'Barbell Back Squat', sets: 4, repsMin: 8, repsMax: 12, rest: 120, notes: 'Quad and glute compound. Full depth. Bikini rewards a tight quad sweep alongside developed glutes.' },
          { name: 'Leg Press', sets: 4, repsMin: 12, repsMax: 15, rest: 90, notes: 'Higher foot position for glute emphasis. Control the descent.' },
          { name: 'Glute Bridge', sets: 4, repsMin: 15, repsMax: 20, rest: 60, notes: 'Bodyweight or loaded. Squeeze fully at top. High reps for glute activation.' },
          { name: 'Leg Extension', sets: 3, repsMin: 15, repsMax: 20, rest: 60, notes: 'Quad detail and sweep. Squeeze hard at top.' },
          { name: 'Seated Leg Curl', sets: 3, repsMin: 12, repsMax: 15, rest: 60, notes: 'Hamstring tie-in. Full range. Controlled.' },
        ],
      },
      {
        name: 'Day 4: Upper Body & Shoulders',
        exercises: [
          { name: 'Incline Dumbbell Press', sets: 4, repsMin: 10, repsMax: 15, rest: 90, notes: 'Upper chest fullness helps the overall shape on stage. Control the descent.' },
          { name: 'Machine Row (Chest Supported)', sets: 4, repsMin: 10, repsMax: 15, rest: 90, notes: 'Back thickness without lower-back fatigue. Squeeze at the top.' },
          { name: 'Dumbbell Lateral Raise', sets: 4, repsMin: 15, repsMax: 20, rest: 60, notes: 'Second shoulder session. Shoulder width helps frame the waist. Slow and strict.' },
          { name: 'Reverse Pec Deck', sets: 3, repsMin: 15, repsMax: 20, rest: 60, notes: 'Rear-delt isolation. Round shoulders look. Essential for stage presence.' },
          { name: 'Tricep Pushdown (Rope)', sets: 3, repsMin: 15, repsMax: 20, rest: 60, notes: 'Tricep detail. Arms at full extension look clean on stage.' },
        ],
      },
    ],
  },

  // ── 25. Wellness, Off-Season ─────────────────────────────────────────────
  {
    name: 'Wellness',
    description: "Four to five days per week built around the Wellness division, the most lower-body-forward division in women's physique sport. Wellness rewards a heavily developed lower body (glutes, quads, and hamstrings) relative to a smaller, more moderate upper body. This plan trains the lower body four times per week with two different emphasis days, and upper body twice with a lower set count to keep it proportional. Progress on lower-body compounds is the priority.",
    tags: 'bodybuilding category:division division:wellness gender:women goal:stage_prep days:5 advanced intermediate',
    difficulty: 2,
    workouts: [
      {
        name: 'Day 1: Glutes & Hamstrings (Heavy)',
        exercises: [
          { name: 'Barbell Hip Thrust', sets: 5, repsMin: 6, repsMax: 10, rest: 120, notes: 'Heavy. This is your primary indicator of glute development. Load progressively each week.' },
          { name: 'Romanian Deadlift (Barbell)', sets: 5, repsMin: 8, repsMax: 10, rest: 120, notes: 'Hip hinge. Maximum hamstring stretch. Bar close to legs. 3 s eccentric.' },
          { name: 'Sumo Deadlift', sets: 3, repsMin: 5, repsMax: 8, rest: 120, notes: 'Wide stance. Targets inner thighs and glutes. Drive hips through at the top.' },
          { name: 'Lying Leg Curl', sets: 4, repsMin: 10, repsMax: 15, rest: 60, notes: 'Knee flexion for hamstring lower-portion development. Squeeze hard at top.' },
          { name: 'Cable Kickback', sets: 4, repsMin: 15, repsMax: 20, rest: 60, notes: 'Full hip extension. Squeeze glute at lockout. Slow return.' },
        ],
      },
      {
        name: 'Day 2: Quads (Heavy)',
        exercises: [
          { name: 'Barbell Back Squat', sets: 5, repsMin: 6, repsMax: 10, rest: 120, notes: 'Primary quad builder. Full depth. Control the descent. More quad-dominant than hip thrust.' },
          { name: 'Leg Press', sets: 4, repsMin: 10, repsMax: 15, rest: 90, notes: 'Lower foot placement for more quad. Push through heels. Full range.' },
          { name: 'Bulgarian Split Squat', sets: 4, repsMin: 8, repsMax: 12, rest: 90, notes: 'Rear foot elevated. Drive through front heel. Trains quads and glutes hard.' },
          { name: 'Leg Extension', sets: 4, repsMin: 15, repsMax: 20, rest: 60, notes: 'Quad isolation. Full contraction. Slow descent.' },
          { name: 'Seated Leg Curl', sets: 3, repsMin: 12, repsMax: 15, rest: 60, notes: 'Balance the quad work with hamstring sets.' },
        ],
      },
      {
        name: 'Day 3: Upper Body (Maintenance)',
        exercises: [
          { name: 'Lat Pulldown (Wide Grip)', sets: 3, repsMin: 10, repsMax: 15, rest: 90, notes: 'Wellness has a smaller upper body by design. Keeping sets moderate keeps the back healthy and proportional.' },
          { name: 'Seated Cable Row', sets: 3, repsMin: 10, repsMax: 15, rest: 90, notes: 'Mid-back. Maintenance, not maximum.' },
          { name: 'Dumbbell Shoulder Press', sets: 3, repsMin: 12, repsMax: 15, rest: 90, notes: 'Shoulder health and some cap development. Keep it moderate.' },
          { name: 'Dumbbell Lateral Raise', sets: 3, repsMin: 15, repsMax: 20, rest: 60, notes: 'Some shoulder width still helps the overall shape. Light and controlled.' },
          { name: 'Dumbbell Curl', sets: 2, repsMin: 12, repsMax: 15, rest: 60, notes: 'Arm maintenance. Keep arms proportional to the lower body.' },
        ],
      },
      {
        name: 'Day 4: Glutes & Quads (Volume)',
        exercises: [
          { name: 'Glute Bridge', sets: 5, repsMin: 15, repsMax: 20, rest: 60, notes: 'Loaded glute bridge or body weight for high-rep pump session. Squeeze every rep.' },
          { name: 'Leg Press', sets: 4, repsMin: 15, repsMax: 20, rest: 90, notes: 'Higher rep range today. Mix of foot positions. Pump session.' },
          { name: 'Cable Kickback', sets: 4, repsMin: 20, repsMax: 25, rest: 60, notes: 'Detail work. Full range. Slow and controlled every rep.' },
          { name: 'Lunge', sets: 3, repsMin: 12, repsMax: 15, rest: 90, notes: 'Walking or stationary. Trains hips and quads evenly.' },
          { name: 'Lying Leg Curl', sets: 3, repsMin: 15, repsMax: 20, rest: 60, notes: 'High-rep hamstring pump. Full range.' },
        ],
      },
      {
        name: 'Day 5: Upper Body & Glute Detail',
        exercises: [
          { name: 'Machine Row (Chest Supported)', sets: 3, repsMin: 12, repsMax: 15, rest: 90, notes: 'Upper back maintenance. Chest support removes lower-back stress.' },
          { name: 'Incline Dumbbell Press', sets: 3, repsMin: 12, repsMax: 15, rest: 90, notes: 'Upper chest. Fewer sets in this division by design.' },
          { name: 'Reverse Pec Deck', sets: 3, repsMin: 15, repsMax: 20, rest: 60, notes: 'Rear-delt health and rounding.' },
          { name: 'Barbell Hip Thrust', sets: 4, repsMin: 12, repsMax: 15, rest: 90, notes: 'Second hip thrust session. Slightly lighter than Day 1. Focus on squeeze and contraction.' },
          { name: 'Seated Leg Curl', sets: 3, repsMin: 12, repsMax: 15, rest: 60, notes: 'Hamstring detail to finish the week.' },
        ],
      },
    ],
  },

  // ── 26. Classic Physique, Off-Season ─────────────────────────────────────
  {
    name: 'Classic Physique',
    description: "Five-day plan for the Classic Physique division. Classic Physique is judged on balanced, symmetrical development: a wide back, capped shoulders, full chest, narrow waist, well-developed legs, and a V-taper reminiscent of the golden era of bodybuilding. Unlike Men's Physique, legs are displayed and are a significant judging criterion. This plan gives equal attention to both upper and lower body with a slight emphasis on the key visual areas: back width, shoulder caps, and upper-chest fullness.",
    tags: 'bodybuilding category:division division:classic_physique gender:men goal:stage_prep days:5 advanced',
    difficulty: 2,
    workouts: [
      {
        name: 'Day 1: Chest & Shoulders',
        exercises: [
          { name: 'Incline Barbell Bench Press', sets: 4, repsMin: 8, repsMax: 12, rest: 120, notes: 'Upper chest is visually critical. Controlled eccentric. Stop 1 to 2 reps from failure.' },
          { name: 'Barbell Bench Press', sets: 4, repsMin: 8, repsMax: 12, rest: 120, notes: 'Overall chest mass. Bar to chest. Press smoothly.' },
          { name: 'Pec Deck (Machine Fly)', sets: 3, repsMin: 12, repsMax: 15, rest: 90, notes: 'Chest isolation. Full stretch. Squeeze hard at contraction.' },
          { name: 'Barbell Overhead Press', sets: 4, repsMin: 8, repsMax: 12, rest: 120, notes: 'Shoulder mass. Control the descent.' },
          { name: 'Dumbbell Lateral Raise', sets: 4, repsMin: 15, repsMax: 20, rest: 60, notes: 'Shoulder width. Lead with elbow. 4 s eccentric.' },
          { name: 'Face Pull', sets: 3, repsMin: 20, repsMax: 25, rest: 60, notes: 'Rear-delt health. Rope at chest height. Elbows high.' },
        ],
      },
      {
        name: 'Day 2: Back Width & Detail',
        exercises: [
          { name: 'Lat Pulldown (Wide Grip)', sets: 4, repsMin: 8, repsMax: 12, rest: 90, notes: 'Lat width is the core of the V-taper in this division. Full stretch. Pull elbows to pockets.' },
          { name: 'T-Bar Row', sets: 4, repsMin: 8, repsMax: 12, rest: 90, notes: 'Back thickness. Chest against pad. Squeeze rhomboids.' },
          { name: 'Seated Cable Row', sets: 4, repsMin: 10, repsMax: 12, rest: 90, notes: 'Mid-back detail. Full stretch forward. Row elbows back.' },
          { name: 'Cable Straight-Arm Pulldown', sets: 3, repsMin: 12, repsMax: 15, rest: 60, notes: 'Lat length. Slight elbow bend. Slow arc.' },
          { name: 'Cable Rear Delt Fly', sets: 4, repsMin: 15, repsMax: 20, rest: 60, notes: 'Rear-delt. Round shoulders from behind. Keep strict form.' },
        ],
      },
      {
        name: 'Day 3: Legs',
        exercises: [
          { name: 'Barbell Back Squat', sets: 4, repsMin: 8, repsMax: 12, rest: 120, notes: 'Classic Physique legs must be well-developed. Full depth. Drive through heels.' },
          { name: 'Leg Press', sets: 4, repsMin: 10, repsMax: 15, rest: 90, notes: 'Quad and glute. Mix foot positions across sets.' },
          { name: 'Romanian Deadlift (Barbell)', sets: 3, repsMin: 8, repsMax: 12, rest: 90, notes: 'Hamstring and glute compound. Hip hinge. 3 s eccentric.' },
          { name: 'Leg Extension', sets: 3, repsMin: 15, repsMax: 20, rest: 60, notes: 'Quad detail. Squeeze at top. Slow descent.' },
          { name: 'Lying Leg Curl', sets: 3, repsMin: 12, repsMax: 15, rest: 60, notes: 'Hamstring curl. Full range. Squeeze at top.' },
          { name: 'Glute Bridge', sets: 3, repsMin: 15, repsMax: 20, rest: 60, notes: 'Glute activation and development. Squeeze at top.' },
        ],
      },
      {
        name: 'Day 4: Arms & Core',
        exercises: [
          { name: 'EZ Bar Curl', sets: 4, repsMin: 8, repsMax: 12, rest: 60, notes: 'Bicep mass. Full range. Squeeze at top. 3 s eccentric.' },
          { name: 'Hammer Curl', sets: 3, repsMin: 10, repsMax: 15, rest: 60, notes: 'Brachialis development. Elbows pinned.' },
          { name: 'Close-Grip Bench Press', sets: 4, repsMin: 8, repsMax: 12, rest: 90, notes: 'Tricep mass. Elbows at 45 degrees. Full extension.' },
          { name: 'Dumbbell Overhead Tricep Extension', sets: 3, repsMin: 10, repsMax: 15, rest: 60, notes: 'Long head development. Full overhead stretch.' },
          { name: 'Tricep Pushdown (Rope)', sets: 3, repsMin: 15, repsMax: 20, rest: 60, notes: 'Tricep finishing sets. Squeeze every rep.' },
        ],
      },
      {
        name: 'Day 5: Back & Shoulders Detail',
        exercises: [
          { name: 'Lat Pulldown (Wide Grip)', sets: 4, repsMin: 10, repsMax: 15, rest: 90, notes: 'Second lat session. Focus on the stretch and full contraction.' },
          { name: 'Dumbbell Lateral Raise', sets: 5, repsMin: 15, repsMax: 20, rest: 60, notes: 'Second shoulder session this week. Width is always a priority in Classic. Strict form.' },
          { name: 'Machine Row (Chest Supported)', sets: 3, repsMin: 12, repsMax: 15, rest: 90, notes: 'Back detail. Chest on pad for strict form.' },
          { name: 'Reverse Pec Deck', sets: 4, repsMin: 15, repsMax: 20, rest: 60, notes: 'Rear-delt rounding. Essential for shoulder completeness from behind.' },
          { name: 'Cable Rear Delt Fly', sets: 3, repsMin: 15, repsMax: 20, rest: 60, notes: 'Rear-delt isolation. Strict form. Slow controlled movement.' },
        ],
      },
    ],
  },

  // ── 27. Figure, Off-Season ───────────────────────────────────────────────
  {
    name: 'Figure',
    description: "Five-day plan for the Figure division. Figure sits between Bikini and Women's Physique in muscularity: athletic and muscular with visible shoulders, a strong and wide back, and proportional leg development. Shoulders and back are the priority visual features judged in Figure. This plan dedicates significant sets to back width, rear-delt development, and shoulder capping while maintaining balanced lower-body strength.",
    tags: 'bodybuilding category:division division:figure gender:women goal:stage_prep days:5 advanced',
    difficulty: 2,
    workouts: [
      {
        name: 'Day 1: Back Width & Detail',
        exercises: [
          { name: 'Lat Pulldown (Wide Grip)', sets: 5, repsMin: 8, repsMax: 12, rest: 90, notes: 'Back width is the single most judged attribute in Figure. Full stretch overhead. Pull elbows to pockets. 3 s eccentric.' },
          { name: 'Seated Cable Row', sets: 4, repsMin: 10, repsMax: 12, rest: 90, notes: 'Mid-back thickness. Full stretch forward. Row elbows back to hips.' },
          { name: 'T-Bar Row', sets: 4, repsMin: 8, repsMax: 12, rest: 90, notes: 'Back thickness. Chest on pad. Squeeze hard at the contraction point.' },
          { name: 'Cable Straight-Arm Pulldown', sets: 3, repsMin: 12, repsMax: 15, rest: 60, notes: 'Lat length. Slight elbow bend. Slow arc down.' },
          { name: 'Face Pull', sets: 4, repsMin: 20, repsMax: 25, rest: 60, notes: 'Rear-delt health and rounding. Essential in Figure.' },
        ],
      },
      {
        name: 'Day 2: Legs',
        exercises: [
          { name: 'Barbell Back Squat', sets: 4, repsMin: 8, repsMax: 12, rest: 120, notes: 'Quad and glute compound. Full depth. Figure requires balanced leg development.' },
          { name: 'Barbell Hip Thrust', sets: 4, repsMin: 10, repsMax: 15, rest: 90, notes: 'Glute emphasis. Shoulders on bench. Full extension at top.' },
          { name: 'Romanian Deadlift (Barbell)', sets: 4, repsMin: 8, repsMax: 12, rest: 90, notes: 'Hamstring and glute. Hip hinge. 3 s eccentric.' },
          { name: 'Leg Extension', sets: 3, repsMin: 15, repsMax: 20, rest: 60, notes: 'Quad detail. Full contraction at top.' },
          { name: 'Lying Leg Curl', sets: 3, repsMin: 12, repsMax: 15, rest: 60, notes: 'Hamstring curl. Full range. Squeeze at top.' },
        ],
      },
      {
        name: 'Day 3: Shoulders & Arms',
        exercises: [
          { name: 'Dumbbell Shoulder Press', sets: 4, repsMin: 10, repsMax: 15, rest: 90, notes: 'Figure has visible, capped shoulders. Press overhead, control the descent.' },
          { name: 'Dumbbell Lateral Raise', sets: 5, repsMin: 15, repsMax: 20, rest: 60, notes: 'Width is critical. Lead with elbows. Raise to shoulder height. 4 s eccentric.' },
          { name: 'Cable Rear Delt Fly', sets: 4, repsMin: 15, repsMax: 20, rest: 60, notes: 'Round shoulder from behind. Rear-delt detail.' },
          { name: 'EZ Bar Curl', sets: 4, repsMin: 10, repsMax: 12, rest: 60, notes: 'Bicep development. Full range. Squeeze at top.' },
          { name: 'Tricep Pushdown (Rope)', sets: 4, repsMin: 12, repsMax: 15, rest: 60, notes: 'Tricep detail. Elbows pinned. Full extension.' },
        ],
      },
      {
        name: 'Day 4: Chest & Upper Back',
        exercises: [
          { name: 'Incline Dumbbell Press', sets: 4, repsMin: 10, repsMax: 15, rest: 90, notes: 'Upper chest development. Slow 3 s descent. Full range of motion.' },
          { name: 'Machine Row (Chest Supported)', sets: 4, repsMin: 10, repsMax: 15, rest: 90, notes: 'Mid and upper-back thickness. Chest on pad. Strict form.' },
          { name: 'Pec Deck (Machine Fly)', sets: 3, repsMin: 12, repsMax: 15, rest: 90, notes: 'Chest isolation. Full stretch. Squeeze at contraction.' },
          { name: 'Reverse Pec Deck', sets: 3, repsMin: 15, repsMax: 20, rest: 60, notes: 'Rear-delt. Arm out to the sides. Control both directions.' },
          { name: 'Dumbbell Lateral Raise', sets: 3, repsMin: 15, repsMax: 20, rest: 60, notes: 'Extra lateral delt sets this session.' },
        ],
      },
      {
        name: 'Day 5: Glute & Back Detail',
        exercises: [
          { name: 'Barbell Hip Thrust', sets: 4, repsMin: 12, repsMax: 15, rest: 90, notes: 'Second glute session. Slightly lighter than Day 2. Focus on squeeze and contraction quality.' },
          { name: 'Cable Kickback', sets: 4, repsMin: 15, repsMax: 20, rest: 60, notes: 'Glute isolation. Full hip extension. Slow and deliberate.' },
          { name: 'Lat Pulldown (Wide Grip)', sets: 4, repsMin: 10, repsMax: 15, rest: 90, notes: 'Second back session. Focus on lat engagement and full stretch.' },
          { name: 'Seated Cable Row', sets: 3, repsMin: 12, repsMax: 15, rest: 90, notes: 'Back detail. Control through full range.' },
          { name: 'Face Pull', sets: 3, repsMin: 20, repsMax: 25, rest: 60, notes: 'Rear-delt health. End the week with this.' },
        ],
      },
    ],
  },

  // ── 28. Women's Physique, Off-Season ────────────────────────────────────────
  {
    name: "Women's Physique",
    description: "A five-day plan for Women's Physique competitors, built around the division's aesthetic priorities: broad, capped shoulders, a detailed and wide back, proportionate arms, and a lean lower body without extreme size. Day 1 develops shoulder width and rear-delt health; Day 2 builds back thickness and lat spread; Day 3 trains lower body with glute and quad emphasis; Day 4 develops chest and triceps with upper-chest focus; Day 5 adds arm detail and a second rear-delt session to complete the week. Stop 1 to 2 reps before failure on most sets. Progress by adding reps first, then weight once the top of the range is reached on all sets.",
    tags: 'bodybuilding aesthetic gender:women goal:build_muscle days:5 advanced division:womens_physique',
    difficulty: 2,
    workouts: [
      {
        name: 'Day 1: Shoulders: Width & Rear-Delt Health',
        exercises: [
          { name: 'Dumbbell Lateral Raise',    sets: 5, repsMin: 15, repsMax: 20, rest: 60,  notes: 'Lead with elbow, arm slightly forward. Raise to shoulder height. This is your priority movement today.' },
          { name: 'Machine Shoulder Press',    sets: 4, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Machine keeps tension constant. Press overhead without shrugging. Controlled descent.' },
          { name: 'Cable Lateral Raise',       sets: 4, repsMin: 15, repsMax: 20, rest: 60,  notes: 'Cable provides constant tension through full range. Keep elbow slightly bent. Slow arc.' },
          { name: 'Face Pull',                 sets: 4, repsMin: 20, repsMax: 25, rest: 60,  notes: 'Rope at eye height, elbows high. Rear-delt and external rotation health. Light weight only.' },
          { name: 'Reverse Pec Deck',          sets: 3, repsMin: 15, repsMax: 20, rest: 60,  notes: 'Rear-delt isolation. Slight forward lean. Squeeze at full extension.' },
        ],
      },
      {
        name: 'Day 2: Back: Width & Thickness',
        exercises: [
          { name: 'Lat Pulldown (Wide Grip)',       sets: 4, repsMin: 8,  repsMax: 12, rest: 90, notes: 'Full overhead stretch, pull elbows to pockets. 3 s eccentric. Builds lat width.' },
          { name: 'Seated Cable Row',               sets: 4, repsMin: 10, repsMax: 12, rest: 90, notes: 'Full stretch forward, pull elbows back. Squeeze rhomboids at end range. Mid-back thickness.' },
          { name: 'Lat Pulldown (Close Grip)',       sets: 3, repsMin: 10, repsMax: 15, rest: 90, notes: 'Lower-lat emphasis. Full stretch at top, hard squeeze at bottom. Controlled.' },
          { name: 'Machine Row (Chest Supported)',   sets: 3, repsMin: 10, repsMax: 15, rest: 90, notes: 'Chest on pad eliminates lower-back fatigue. Drive elbows back hard. Squeeze at peak.' },
          { name: 'Cable Straight-Arm Pulldown',     sets: 3, repsMin: 12, repsMax: 15, rest: 60, notes: 'Lat finisher. Slight elbow bend. Full arc from overhead to hips. Feel each rep.' },
        ],
      },
      {
        name: 'Day 3: Lower Body: Glutes, Quads & Hamstrings',
        exercises: [
          { name: 'Barbell Back Squat',          sets: 4, repsMin: 8,  repsMax: 12, rest: 120, notes: 'Moderate depth. Drive through heels. Keep torso upright for quad bias.' },
          { name: 'Bulgarian Split Squat',        sets: 3, repsMin: 10, repsMax: 12, rest: 90,  notes: 'Rear foot elevated. Front foot forward enough to feel glutes. Drive through heel.' },
          { name: 'Barbell Hip Thrust',          sets: 4, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Full hip extension. Squeeze glutes hard at top. Hold 1 second. Lower controlled.' },
          { name: 'Romanian Deadlift (Barbell)',   sets: 3, repsMin: 10, repsMax: 12, rest: 90,  notes: 'Hip hinge, feel hamstring stretch. Keep bar close. Full hip extension at top.' },
          { name: 'Leg Extension',                 sets: 3, repsMin: 15, repsMax: 20, rest: 60,  notes: 'Quad isolation finisher. Peak squeeze at full extension. Slow eccentric.' },
          { name: 'Cable Kickback',                sets: 3, repsMin: 15, repsMax: 20, rest: 60,  notes: 'Full hip extension. Squeeze glute at lockout. Deliberate and controlled.' },
        ],
      },
      {
        name: 'Day 4: Chest & Triceps',
        exercises: [
          { name: 'Incline Barbell Bench Press',        sets: 4, repsMin: 8,  repsMax: 12, rest: 90,  notes: 'Upper-chest priority. 30 degree incline. Controlled descent, drive up through chest.' },
          { name: 'Incline Dumbbell Press',              sets: 3, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Greater range of motion than barbell. Upper-chest emphasis. 3 s eccentric.' },
          { name: 'Cable Fly (Low to High)',             sets: 3, repsMin: 12, repsMax: 15, rest: 60,  notes: 'Cables low, arc upward. Full chest stretch at bottom. Squeeze at top.' },
          { name: 'Tricep Pushdown (Rope)',                       sets: 4, repsMin: 12, repsMax: 15, rest: 60,  notes: 'Split rope at bottom, rotate wrists. Full extension each rep. Keep elbows still.' },
          { name: 'Dumbbell Overhead Tricep Extension',         sets: 3, repsMin: 12, repsMax: 15, rest: 60,  notes: 'Both hands on one dumbbell. Full overhead stretch. Long-head tricep emphasis.' },
        ],
      },
      {
        name: 'Day 5: Arms & Rear-Delt Detail',
        exercises: [
          { name: 'EZ Bar Curl',             sets: 4, repsMin: 8,  repsMax: 12, rest: 60,  notes: 'Wrist-friendly barbell curl. Full range. Slow eccentric. No swinging.' },
          { name: 'Incline Dumbbell Curl',   sets: 3, repsMin: 10, repsMax: 15, rest: 60,  notes: 'Incline position puts long-head bicep under full stretch. Slow and deliberate.' },
          { name: 'Hammer Curl',             sets: 3, repsMin: 10, repsMax: 15, rest: 60,  notes: 'Neutral grip hits brachialis and forearm. Alternate arms or both together.' },
          { name: 'Face Pull',               sets: 4, repsMin: 20, repsMax: 25, rest: 60,  notes: 'Second rear-delt session this week. Light and controlled. Rear-delt health and fullness.' },
          { name: 'Dumbbell Rear Delt Fly',  sets: 3, repsMin: 15, repsMax: 20, rest: 60,  notes: 'Bent over or seated. Arms slightly bent. Raise elbows to shoulder height. Squeeze.' },
          { name: 'Abduction Machine',        sets: 3, repsMin: 15, repsMax: 20, rest: 60,  notes: 'Hip abductor finisher. Controlled squeeze outward. Completes the lower-body detail work.' },
        ],
      },
    ],
  },

  // ── 29. Women's Bodybuilding, Off-Season ────────────────────────────────────
  {
    name: "Women's Bodybuilding",
    description: "A five-day plan for Women's Bodybuilding competitors, built around maximum muscular development across every group. This is the most demanding of the women's divisions and requires serious, focused training across every major muscle group. Day 1 prioritises quads and calves; Day 2 builds back width and thickness; Day 3 develops chest, shoulders, and triceps; Day 4 targets hamstrings, glutes, and calves; Day 5 finishes the week with arms and shoulder detail. Eat in a moderate surplus throughout the muscle-building phase. Stop 1 to 2 reps before failure on most sets. Progress by adding reps first, then weight.",
    tags: 'bodybuilding gender:women goal:build_muscle days:5 advanced division:womens_bodybuilding',
    difficulty: 2,
    workouts: [
      {
        name: 'Day 1: Quads, Hamstrings & Calves',
        exercises: [
          { name: 'Barbell Back Squat',        sets: 5, repsMin: 6,  repsMax: 10, rest: 120, notes: 'Heaviest compound of the week. Depth at parallel or below. Drive through heels.' },
          { name: 'Hack Squat Machine',         sets: 4, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Quad isolation on hack squat. Feet low and close. Pause briefly at bottom.' },
          { name: 'Leg Extension',              sets: 4, repsMin: 12, repsMax: 20, rest: 60,  notes: 'Quad pump finisher. Peak squeeze at full extension. Slow eccentric on each rep.' },
          { name: 'Lying Leg Curl',             sets: 4, repsMin: 10, repsMax: 15, rest: 60,  notes: 'Full knee flexion. Slow 3 s eccentric. Do not let hips lift off the pad.' },
          { name: 'Standing Calf Raise (Machine)', sets: 5, repsMin: 12, repsMax: 20, rest: 60, notes: 'Full stretch at bottom. Pause 1 s. Rise to full tip-toe. High reps for calves.' },
          { name: 'Seated Calf Raise',          sets: 4, repsMin: 15, repsMax: 25, rest: 60,  notes: 'Soleus emphasis. Bent knee changes which muscle works. Full range every rep.' },
        ],
      },
      {
        name: 'Day 2: Back: Width & Thickness',
        exercises: [
          { name: 'Lat Pulldown (Wide Grip)',      sets: 5, repsMin: 8,  repsMax: 12, rest: 90,  notes: 'Primary lat-width movement. Full overhead stretch. Pull elbows to lower pockets.' },
          { name: 'Barbell Row (Bent Over)',        sets: 4, repsMin: 6,  repsMax: 10, rest: 90,  notes: 'Hinge 45 degrees. Pull bar to lower chest. Squeeze hard at top. Builds back thickness.' },
          { name: 'Seated Cable Row',               sets: 4, repsMin: 10, repsMax: 12, rest: 90,  notes: 'Full forward stretch. Pull elbows back. Rhomboid and mid-back detail.' },
          { name: 'Machine Row (Chest Supported)',  sets: 3, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Isolates back without spinal loading. Drive elbows back to full contraction.' },
          { name: 'Cable Straight-Arm Pulldown',    sets: 3, repsMin: 12, repsMax: 15, rest: 60,  notes: 'Lat finisher. Arc from overhead to hips. Feel the lats throughout. Slight elbow bend.' },
          { name: 'Face Pull',                      sets: 3, repsMin: 20, repsMax: 25, rest: 60,  notes: 'Rope at eye height, elbows high. Rear-delt health and shoulder balance.' },
        ],
      },
      {
        name: 'Day 3: Chest, Shoulders & Triceps',
        exercises: [
          { name: 'Barbell Bench Press',        sets: 4, repsMin: 6,  repsMax: 10, rest: 90,  notes: 'Primary chest compound. Bar to lower chest. Controlled descent. Arch naturally.' },
          { name: 'Incline Dumbbell Press',      sets: 4, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Upper-chest emphasis. Full range. 3 s eccentric. Chest leads the push.' },
          { name: 'Pec Deck (Machine Fly)',      sets: 3, repsMin: 12, repsMax: 15, rest: 60,  notes: 'Chest isolation. Full stretch. Squeeze at close. No momentum.' },
          { name: 'Dumbbell Lateral Raise',      sets: 4, repsMin: 15, repsMax: 20, rest: 60,  notes: 'Shoulder width. Lead with elbow. Raise to shoulder height. Four sets today.' },
          { name: 'Close-Grip Bench Press',      sets: 3, repsMin: 8,  repsMax: 12, rest: 90,  notes: 'Hands at shoulder width. Elbows tucked. Tricep priority. Lower with control.' },
          { name: 'Tricep Pushdown (Rope)',               sets: 4, repsMin: 12, repsMax: 15, rest: 60,  notes: 'Split rope at bottom. Full extension. Elbows stay pinned to sides throughout.' },
        ],
      },
      {
        name: 'Day 4: Hamstrings, Glutes & Calves',
        exercises: [
          { name: 'Romanian Deadlift (Barbell)',  sets: 5, repsMin: 8,  repsMax: 12, rest: 90,  notes: 'Heavy hip hinge. Full hamstring stretch at bottom. Drive hips forward to lockout.' },
          { name: 'Seated Leg Curl',              sets: 4, repsMin: 10, repsMax: 15, rest: 60,  notes: 'Seated position keeps hamstring under tension through full range. Slow eccentric.' },
          { name: 'Barbell Hip Thrust',          sets: 5, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Primary glute day. Heavy and deliberate. Full hip extension. Squeeze hard at top.' },
          { name: 'Bulgarian Split Squat',         sets: 3, repsMin: 10, repsMax: 12, rest: 90,  notes: 'Rear foot elevated. Drive through front heel. Glute and quad unilateral work.' },
          { name: 'Cable Kickback',                sets: 4, repsMin: 15, repsMax: 20, rest: 60,  notes: 'Glute isolation. Full hip extension. Slow return. Add ankle weight if cable is unavailable.' },
          { name: 'Leg Press Calf Raise',          sets: 4, repsMin: 15, repsMax: 25, rest: 60,  notes: 'Full range every rep. Pause at bottom stretch. Rise to full tip-toe at top.' },
        ],
      },
      {
        name: 'Day 5: Arms & Shoulder Detail',
        exercises: [
          { name: 'EZ Bar Curl',              sets: 4, repsMin: 8,  repsMax: 12, rest: 60,  notes: 'Primary bicep movement. Full range. Slow eccentric. No swinging.' },
          { name: 'Incline Dumbbell Curl',    sets: 3, repsMin: 10, repsMax: 15, rest: 60,  notes: 'Long-head stretch position. Arms back. Slow and controlled every rep.' },
          { name: 'EZ Bar Preacher Curl',   sets: 3, repsMin: 10, repsMax: 12, rest: 60,  notes: 'Arm on pad eliminates cheating. Full squeeze at top. Slow eccentric.' },
          { name: 'Cable Overhead Tricep Extension', sets: 4, repsMin: 12, repsMax: 15, rest: 60, notes: 'Long-head tricep emphasis. Full stretch overhead. Press to full extension.' },
          { name: 'EZ Bar Skull Crusher',     sets: 3, repsMin: 10, repsMax: 15, rest: 60,  notes: 'Lower to forehead. Keep elbows in. Full extension at top. Controlled.' },
          { name: 'Machine Lateral Raise',    sets: 4, repsMin: 15, repsMax: 20, rest: 60,  notes: 'Machine keeps tension consistent. Shoulder-width development. End the week here.' },
          { name: 'Reverse Pec Deck',         sets: 3, repsMin: 15, repsMax: 20, rest: 60,  notes: 'Rear-delt health and detail. Slight forward lean. Squeeze at full extension.' },
        ],
      },
    ],
  },

  // ── 30. Men's Bodybuilding, Off-Season ──────────────────────────────────────
  {
    name: "Men's Bodybuilding",
    description: "A five-day plan for Men's Bodybuilding competitors, built around maximum muscular size and complete development across every group. This is the plan with the most sets per week in the library and suits experienced lifters with at least three years of consistent training. Day 1 builds chest and triceps; Day 2 develops back width and thickness; Day 3 builds legs with quad emphasis; Day 4 targets shoulders and arms; Day 5 finishes the week with hamstrings, glutes, and posterior-chain detail. Eat in a moderate calorie surplus throughout the muscle-building phase. Stop 1 to 2 reps before failure on compound movements. On isolation exercises, push to 1 rep from failure on the final set of each exercise.",
    tags: 'bodybuilding gender:men goal:build_muscle days:5 advanced division:mens_bodybuilding featured',
    difficulty: 2,
    workouts: [
      {
        name: 'Day 1: Chest & Triceps',
        exercises: [
          { name: 'Barbell Bench Press',         sets: 5, repsMin: 6,  repsMax: 10, rest: 120, notes: 'Arch naturally. Bar to lower chest. Full touch. Drive through chest, not shoulders.' },
          { name: 'Incline Barbell Bench Press', sets: 4, repsMin: 8,  repsMax: 12, rest: 90,  notes: '30 degree incline. Upper-chest priority. Controlled descent. Do not bounce off chest.' },
          { name: 'Incline Dumbbell Press',      sets: 3, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Greater range than barbell. Upper-chest stretch at the bottom. 3 s eccentric.' },
          { name: 'Pec Deck (Machine Fly)',      sets: 4, repsMin: 12, repsMax: 15, rest: 60,  notes: 'Chest isolation pump. Full stretch at start. Squeeze hard at close. No momentum.' },
          { name: 'Close-Grip Bench Press',      sets: 4, repsMin: 8,  repsMax: 12, rest: 90,  notes: 'Hands shoulder-width. Elbows tucked to ribs. Tricep compound. Full extension at top.' },
          { name: 'EZ Bar Skull Crusher',        sets: 4, repsMin: 10, repsMax: 15, rest: 60,  notes: 'Lower to forehead slowly. Keep elbows pointing at ceiling. Press to full lockout.' },
          { name: 'Tricep Pushdown (Rope)',               sets: 4, repsMin: 12, repsMax: 20, rest: 60,  notes: 'Split rope at bottom, rotate wrists out. Full extension. Elbows pinned throughout.' },
        ],
      },
      {
        name: 'Day 2: Back: Width & Thickness',
        exercises: [
          { name: 'Lat Pulldown (Wide Grip)',     sets: 5, repsMin: 8,  repsMax: 12, rest: 90,  notes: 'Lat spread priority. Full overhead stretch. Pull elbows to lower pockets. 3 s eccentric.' },
          { name: 'Barbell Row (Bent Over)',      sets: 4, repsMin: 6,  repsMax: 10, rest: 90,  notes: 'Hinge at 45 degrees. Bar to lower chest. Squeeze and hold at top. Builds thickness.' },
          { name: 'T-Bar Row',                   sets: 4, repsMin: 8,  repsMax: 12, rest: 90,  notes: 'Mid-back and lat thickness. Full range. Pull handle to chest. Controlled descent.' },
          { name: 'Seated Cable Row',             sets: 4, repsMin: 10, repsMax: 12, rest: 90,  notes: 'Full forward stretch. Drive elbows behind torso. Hold the contraction.' },
          { name: 'Lat Pulldown (Close Grip)',    sets: 3, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Lower-lat detail. Full stretch overhead. Hard squeeze at bottom. 3 s eccentric.' },
          { name: 'Cable Straight-Arm Pulldown', sets: 3, repsMin: 12, repsMax: 15, rest: 60,  notes: 'Lat finisher with constant cable tension. Arc from overhead to hips. Squeeze lats.' },
        ],
      },
      {
        name: 'Day 3: Legs: Quads, Hamstrings & Calves',
        exercises: [
          { name: 'Barbell Back Squat',          sets: 5, repsMin: 6,  repsMax: 10, rest: 120, notes: 'Heaviest movement of the week. Depth at parallel or below. Controlled descent.' },
          { name: 'Hack Squat Machine',           sets: 4, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Quad focus. Feet low on platform. Pause at bottom. Drive through the movement.' },
          { name: 'Leg Extension',                sets: 5, repsMin: 15, repsMax: 20, rest: 60,  notes: 'Quad isolation pump. Peak squeeze at full extension. Slow eccentric on each rep.' },
          { name: 'Romanian Deadlift (Barbell)', sets: 4, repsMin: 8,  repsMax: 12, rest: 90,  notes: 'Heavy hip hinge. Full hamstring stretch at bottom. Bar stays close to legs.' },
          { name: 'Lying Leg Curl',              sets: 4, repsMin: 10, repsMax: 15, rest: 60,  notes: 'Full range. Hips stay on the pad. 3 s eccentric. Hamstring isolation.' },
          { name: 'Standing Calf Raise (Machine)', sets: 5, repsMin: 12, repsMax: 20, rest: 60, notes: 'Full stretch at bottom. Full contraction at top. Calves respond well to high reps.' },
          { name: 'Seated Calf Raise',           sets: 4, repsMin: 15, repsMax: 25, rest: 60,  notes: 'Soleus emphasis. Bent knee. Full range. High rep pump.' },
        ],
      },
      {
        name: 'Day 4: Shoulders & Arms',
        exercises: [
          { name: 'Barbell Overhead Press',  sets: 4, repsMin: 6,  repsMax: 10, rest: 90,  notes: 'Standing or seated. Brace core. Press straight overhead. The shoulder compound.' },
          { name: 'Dumbbell Lateral Raise',  sets: 5, repsMin: 15, repsMax: 20, rest: 60,  notes: 'Side delt width. Lead with elbow, slightly forward. Five sets for shoulder detail.' },
          { name: 'Machine Lateral Raise',   sets: 4, repsMin: 15, repsMax: 20, rest: 60,  notes: 'Consistent tension through full range. Shoulders are built with consistent sets and detail work.' },
          { name: 'Face Pull',               sets: 4, repsMin: 20, repsMax: 25, rest: 60,  notes: 'Rope at eye height, elbows high. Rear-delt health and posterior shoulder balance.' },
          { name: 'EZ Bar Curl',             sets: 4, repsMin: 8,  repsMax: 12, rest: 60,  notes: 'Primary bicep movement. Full range. No swinging. Squeeze at the top.' },
          { name: 'Incline Dumbbell Curl',   sets: 3, repsMin: 10, repsMax: 15, rest: 60,  notes: 'Long-head stretch. Arms hang back behind body. Slow controlled curl.' },
          { name: 'Hammer Curl',             sets: 3, repsMin: 10, repsMax: 15, rest: 60,  notes: 'Brachialis and forearm development. Neutral grip. Alternate arms.' },
          { name: 'Cable Overhead Tricep Extension', sets: 4, repsMin: 12, repsMax: 15, rest: 60, notes: 'Long-head tricep. Full overhead stretch. Press to full extension. Elbows in.' },
        ],
      },
      {
        name: 'Day 5: Hamstrings, Glutes & Posterior Detail',
        exercises: [
          { name: 'Romanian Deadlift (Barbell)',  sets: 5, repsMin: 8,  repsMax: 12, rest: 90,  notes: 'Second hamstring session. Full hip hinge. Feel the stretch at the bottom. Heavy and slow.' },
          { name: 'Seated Leg Curl',              sets: 5, repsMin: 10, repsMax: 15, rest: 60,  notes: 'Full range of motion. Seated position maintains tension throughout. 3 s eccentric.' },
          { name: 'Barbell Hip Thrust',          sets: 4, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Full hip extension. Squeeze glutes hard at top. Posterior chain development.' },
          { name: 'Cable Pull-Through',            sets: 3, repsMin: 15, repsMax: 20, rest: 60,  notes: 'Hip hinge with cable. Glute and hamstring drive. Feel the pull in the posterior chain.' },
          { name: 'Good Morning',                  sets: 3, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Low bar on back, hinge at hips. Hamstring and lower-back conditioning.' },
          { name: 'Reverse Pec Deck',              sets: 4, repsMin: 15, repsMax: 20, rest: 60,  notes: 'Rear-delt detail and upper-back finishing work. Squeeze at full extension.' },
          { name: 'Cable Crunch',                  sets: 4, repsMin: 15, repsMax: 20, rest: 60,  notes: 'Weighted core work. Rope behind head, crunch down against the cable. Control the negative.' },
        ],
      },
    ],
  },

  // ── 31. Mens Physique Width Enhancement ───────────────────────────────────
  {
    name: 'Mens Physique Width Enhancement',
    description: 'Two-day upper rotation built for masters physique competitors chasing the wide-shouldered, V-tapered look. Day 1 prioritises lat width, upper-back detail, rear delts and serratus. Day 2 attacks upper chest, side delts and shoulder refinement. All work is cable and machine based for joint-friendly, constant-tension stimulus, well suited to lifters in their 40s and beyond. Pair with any lower-body plan. Add reps each session; once you hit the top of the rep range, add a little weight and start again. Stop 1 to 2 reps before failure on each set.',
    tags: 'aesthetic upper bodybuilding gender:men goal:build_muscle days:2 audience:masters width featured',
    difficulty: 1,
    workouts: [
      {
        name: 'Day 1: Width, Rear Delts & Back',
        exercises: [
          { name: 'Face Pull',                       sets: 4, repsMin: 20, repsMax: 25, rest: 60,  notes: 'LIGHT. Rope at chest height. Elbows high and wide. Squeeze rear delt. Stop short of pain. First. Warms shoulder before heavy pulling.' },
          { name: 'Plate-Loaded Lat Pulldown',    sets: 4, repsMin: 8,  repsMax: 12, rest: 120, notes: 'Full overhead stretch. Pull elbows to pockets. Lat width, not biceps. 3s eccentric. Slight back lean, chest up.' },
          { name: 'Underhand Lat Pulldown',          sets: 3, repsMin: 10, repsMax: 12, rest: 90,  notes: 'Full stretch at top. Squeeze lower lat hard at bottom. 3s eccentric. Elongates V-taper.' },
          { name: 'Plate-Loaded Seated Row',         sets: 3, repsMin: 10, repsMax: 12, rest: 90,  notes: 'Full stretch forward. Pull elbows back. Squeeze rhomboids hard at end. Don\'t shrug.' },
          { name: 'HS ISO High Row',                 sets: 3, repsMin: 10, repsMax: 12, rest: 90,  notes: 'Higher elbow targets upper lat and mid back. Control the negative. Shoulder packed throughout.' },
          { name: 'Cable Straight-Arm Pulldown',     sets: 3, repsMin: 12, repsMax: 15, rest: 60,  notes: 'Slight elbow bend throughout. Sweep from overhead to hips. Feel the lat from armpit to hip.' },
          { name: 'Serratus Punch',            sets: 3, repsMin: 15, repsMax: 25, rest: 45,  notes: 'Single arm. Reach forward and fully protract scapula at end range. Feel serration along ribcage. Slow. Feel it or it does nothing.' },
        ],
      },
      {
        name: 'Day 2: Upper Chest, Lateral Delts & Shoulders',
        exercises: [
          { name: 'Facing-In Shoulder Press',          sets: 4, repsMin: 10, repsMax: 12, rest: 120, notes: 'PRIMARY. Do first when freshest. Face INTO pad. Scapular plane press avoids impingement. Hits upper chest AND anterior delt simultaneously.' },
          { name: 'Cable Lateral Raise',               sets: 4, repsMin: 12, repsMax: 15, rest: 75,  notes: 'Low pulley, cable across the body. Arm slightly forward. Lead with elbow. Raise to just above shoulder. Challenging at 12. Not a pump movement.' },
          { name: 'Cable Lateral Raise (Behind the Back)',  sets: 3, repsMin: 15, repsMax: 20, rest: 60,  notes: 'Cable runs behind the body from a low pulley. A different arc to the first raise, height. Arm crosses body at bottom. Pump focused. Together these two cables give full lateral coverage.' },
          { name: 'Cable Fly (Low to Mid, Incline)',   sets: 4, repsMin: 12, repsMax: 15, rest: 90,  notes: 'Bench 30-45°. Cables at lowest position. Fly upward and inward. 3s eccentric. Find pain-free path. Superior upper-chest mind-muscle vs pressing.' },
          { name: 'Cable Fly (Mid Height, Cuff)',      sets: 3, repsMin: 15, repsMax: 20, rest: 60,  notes: 'Cables at chest height. Cuffed. Strong stretch, squeeze hard at contraction. Pump focused. Higher reps.' },
          { name: 'Face Pull',                         sets: 4, repsMin: 20, repsMax: 25, rest: 45,  notes: 'Always last. Shoulder fatigued by now. Light weight. Rope at chest height. Elbows high and wide. Pull to comfortable range only.' },
        ],
      },
    ],
  },
  // ── CC28: capability-led routine families (Amendment deliverable 2) ─────
  // Function-named, never population-named (CC-F3 gate; CAP-3). Every row
  // below is validated against the demand derivation by
  // capabilityFamilyPlans.test.js: each family's exercises pass ITS OWN
  // capability profile, so these plans are compatible BY CONSTRUCTION, not
  // by tag. They appear in normal browse like any other plan (Amendment
  // section 13 - no segregated shelf).

  {
    name: 'Seated Full Body',
    description: 'A three-day full-body plan trained entirely from a seated or lying position, with no standing work anywhere. Built around machines, cables and bench work. Add a rep each session; once you reach the top of the range, add a little weight and start again. Leave 2 reps in the tank on each set.',
    tags: 'seated full_body adapted goal:build_muscle days:3',
    difficulty: 0,
    workouts: [
      {
        name: 'Day 1: Press & Quads',
        exercises: [
          { name: 'Machine Chest Press',        sets: 3, repsMin: 8,  repsMax: 12, rest: 120, notes: 'Set the seat so handles sit at mid-chest.' },
          { name: 'Leg Press',                  sets: 3, repsMin: 10, repsMax: 15, rest: 120, notes: 'Feet mid-platform, full comfortable range.' },
          { name: 'Machine Shoulder Press',     sets: 3, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Stop the descent at ear height if that suits you better.' },
          { name: 'Leg Extension',              sets: 3, repsMin: 12, repsMax: 15, rest: 90,  notes: 'Pause a second at the top.' },
          { name: 'Machine Tricep Extension',   sets: 2, repsMin: 12, repsMax: 15, rest: 60,  notes: 'Elbows stay on the pad.' },
        ],
      },
      {
        name: 'Day 2: Pull & Hamstrings',
        exercises: [
          { name: 'Lat Pulldown (Wide Grip)',   sets: 3, repsMin: 8,  repsMax: 12, rest: 120, notes: 'Pull to the collarbone, control the way up.' },
          { name: 'Seated Leg Curl',            sets: 3, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Slow lowering, full squeeze.' },
          { name: 'Seated Cable Row',           sets: 3, repsMin: 10, repsMax: 12, rest: 90,  notes: 'Long stretch forward, pull to the ribs.' },
          { name: 'Machine Rear Delt Fly',      sets: 3, repsMin: 12, repsMax: 15, rest: 60,  notes: 'Arms just below shoulder height.' },
          { name: 'Machine Curl',               sets: 2, repsMin: 10, repsMax: 15, rest: 60,  notes: 'Full range, no swinging.' },
        ],
      },
      {
        name: 'Day 3: Mixed & Detail',
        exercises: [
          { name: 'Pec Deck (Machine Fly)',     sets: 3, repsMin: 12, repsMax: 15, rest: 90,  notes: 'Elbows slightly bent, squeeze in the middle.' },
          { name: 'Machine Row (Chest Supported)', sets: 3, repsMin: 10, repsMax: 12, rest: 90, notes: 'Chest stays on the pad throughout.' },
          { name: 'Machine Hip Thrust',         sets: 3, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Drive through the hips, pause at the top.' },
          { name: 'Machine Lateral Raise',      sets: 3, repsMin: 12, repsMax: 20, rest: 60,  notes: 'Lead with the elbows.' },
          { name: 'Seated Calf Raise',          sets: 3, repsMin: 12, repsMax: 20, rest: 60,  notes: 'Pause at the stretch and the top.' },
        ],
      },
    ],
  },

  {
    name: 'Seated Upper Strength',
    description: 'Two upper-body strength sessions per week, all seated or lying, no standing work. Heavier sets in the 6 to 10 range with full rests. When you complete every rep at the top of the range, add weight. Leave 2 reps in the tank.',
    tags: 'seated upper strength adapted goal:get_stronger days:2',
    difficulty: 1,
    workouts: [
      {
        name: 'Day 1: Press Strength',
        exercises: [
          { name: 'Machine Chest Press',        sets: 4, repsMin: 6,  repsMax: 10, rest: 150, notes: 'Full rests. Quality over speed.' },
          { name: 'Machine Shoulder Press',     sets: 3, repsMin: 6,  repsMax: 10, rest: 150, notes: 'Set the range that suits your shoulders.' },
          { name: 'Incline Machine Press',      sets: 3, repsMin: 8,  repsMax: 10, rest: 120, notes: 'Smooth press, controlled return.' },
          { name: 'Seated Dip Machine',         sets: 3, repsMin: 8,  repsMax: 12, rest: 90,  notes: 'Elbows track back, not out.' },
        ],
      },
      {
        name: 'Day 2: Pull Strength',
        exercises: [
          { name: 'Lat Pulldown (Neutral Grip)', sets: 4, repsMin: 6, repsMax: 10, rest: 150, notes: 'Drive the elbows down, no lean-back swing.' },
          { name: 'Seated Cable Row',           sets: 4, repsMin: 6,  repsMax: 10, rest: 150, notes: 'Braced torso, pull to the ribs.' },
          { name: 'Machine Rear Delt Fly',      sets: 3, repsMin: 10, repsMax: 12, rest: 90,  notes: 'Strict and slow.' },
          { name: 'Preacher Curl (Dumbbell)',   sets: 3, repsMin: 8,  repsMax: 10, rest: 90,  notes: 'One arm at a time is fine.' },
        ],
      },
    ],
  },

  {
    name: 'No-Floor Full Body',
    description: 'Three full-body days with nothing performed on the floor: every movement starts and finishes standing, seated or at a bench or machine. Add a rep each session; at the top of the range, add weight and start again. Leave 2 reps in the tank.',
    tags: 'no_floor full_body adapted goal:build_muscle days:3',
    difficulty: 0,
    workouts: [
      {
        name: 'Day 1: Push',
        exercises: [
          { name: 'Machine Chest Press',        sets: 3, repsMin: 8,  repsMax: 12, rest: 120, notes: 'Handles at mid-chest.' },
          { name: 'Leg Press',                  sets: 3, repsMin: 10, repsMax: 15, rest: 120, notes: 'Full comfortable range.' },
          { name: 'Seated Dumbbell Press',      sets: 3, repsMin: 8,  repsMax: 12, rest: 90,  notes: 'Back supported on the bench.' },
          { name: 'Leg Extension',              sets: 3, repsMin: 12, repsMax: 15, rest: 90,  notes: 'Pause at the top.' },
          { name: 'Tricep Pushdown (Rope)',     sets: 2, repsMin: 12, repsMax: 15, rest: 60,  notes: 'Elbows pinned to your sides.' },
        ],
      },
      {
        name: 'Day 2: Pull',
        exercises: [
          { name: 'Lat Pulldown (Wide Grip)',   sets: 3, repsMin: 8,  repsMax: 12, rest: 120, notes: 'Control the way up.' },
          { name: 'Seated Leg Curl',            sets: 3, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Slow lowering.' },
          { name: 'Seated Cable Row',           sets: 3, repsMin: 10, repsMax: 12, rest: 90,  notes: 'Pull to the ribs.' },
          { name: 'Face Pull',                  sets: 3, repsMin: 15, repsMax: 20, rest: 60,  notes: 'Rope at face height, elbows high.' },
          { name: 'Dumbbell Curl',              sets: 2, repsMin: 10, repsMax: 15, rest: 60,  notes: 'Standing or seated, no swing.' },
        ],
      },
      {
        name: 'Day 3: Whole Body',
        exercises: [
          { name: 'Goblet Squat',               sets: 3, repsMin: 10, repsMax: 15, rest: 120, notes: 'Hold the dumbbell at your chest.' },
          { name: 'Chest-Supported Row (Dumbbell)', sets: 3, repsMin: 10, repsMax: 12, rest: 90, notes: 'Chest on the incline bench.' },
          { name: 'Incline Dumbbell Press',     sets: 3, repsMin: 10, repsMax: 12, rest: 90,  notes: 'Set the bench to about 30 degrees.' },
          { name: 'Dumbbell Calf Raise (Standing)', sets: 3, repsMin: 12, repsMax: 20, rest: 60,  notes: 'Hold support with the free hand. Pause at the stretch.' },
          { name: 'Cable Lateral Raise',        sets: 3, repsMin: 12, repsMax: 20, rest: 60,  notes: 'Lead with the elbow.' },
        ],
      },
    ],
  },

  {
    name: 'Supported Machine Builder',
    description: 'A three-day plan where every movement is guided or supported: machines, cables and supported benches only, nothing free-standing. A calm way to build training without balance demands. Add a rep each session; at the top of the range, add weight. Leave 2 reps in the tank.',
    tags: 'machine supported adapted goal:build_muscle days:3',
    difficulty: 0,
    workouts: [
      {
        name: 'Day 1: Chest & Back',
        exercises: [
          { name: 'Machine Chest Press',        sets: 3, repsMin: 8,  repsMax: 12, rest: 120, notes: 'Smooth tempo.' },
          { name: 'Machine Row (Chest Supported)', sets: 3, repsMin: 8, repsMax: 12, rest: 120, notes: 'Chest stays on the pad.' },
          { name: 'Pec Deck (Machine Fly)',     sets: 3, repsMin: 12, repsMax: 15, rest: 90,  notes: 'Squeeze in the middle.' },
          { name: 'Lat Pulldown (Close Grip)',  sets: 3, repsMin: 10, repsMax: 12, rest: 90,  notes: 'Elbows to pockets.' },
        ],
      },
      {
        name: 'Day 2: Legs',
        exercises: [
          { name: 'Leg Press',                  sets: 3, repsMin: 10, repsMax: 15, rest: 120, notes: 'Feet mid-platform.' },
          { name: 'Seated Leg Curl',            sets: 3, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Full squeeze.' },
          { name: 'Leg Extension',              sets: 3, repsMin: 12, repsMax: 15, rest: 90,  notes: 'Pause at the top.' },
          { name: 'Seated Machine Calf Raise',  sets: 3, repsMin: 12, repsMax: 20, rest: 60,  notes: 'Slow stretch at the bottom.' },
          { name: 'Hip Adduction Machine',      sets: 2, repsMin: 12, repsMax: 15, rest: 60,  notes: 'Controlled in both directions.' },
        ],
      },
      {
        name: 'Day 3: Shoulders & Arms',
        exercises: [
          { name: 'Machine Shoulder Press',     sets: 3, repsMin: 8,  repsMax: 12, rest: 120, notes: 'Set a comfortable range.' },
          { name: 'Machine Lateral Raise',      sets: 3, repsMin: 12, repsMax: 20, rest: 60,  notes: 'Lead with the elbows.' },
          { name: 'Machine Rear Delt Fly',      sets: 3, repsMin: 12, repsMax: 15, rest: 60,  notes: 'Strict form.' },
          { name: 'Machine Curl',               sets: 3, repsMin: 10, repsMax: 15, rest: 60,  notes: 'No swinging.' },
          { name: 'Machine Tricep Extension',   sets: 3, repsMin: 10, repsMax: 15, rest: 60,  notes: 'Elbows on the pad.' },
        ],
      },
    ],
  },

  {
    name: 'Supported Machine Builder II',
    description: 'The four-day step up from Supported Machine Builder: still fully guided and supported throughout, with more weekly sets per muscle and an upper/lower split. When every rep at the top of the range is completed, add weight. Leave 1 to 2 reps in the tank.',
    tags: 'machine supported adapted goal:build_muscle days:4',
    difficulty: 1,
    workouts: [
      {
        name: 'Day 1: Upper Push',
        exercises: [
          { name: 'Machine Chest Press',        sets: 4, repsMin: 8,  repsMax: 12, rest: 120, notes: 'Two warm-up sets first.' },
          { name: 'Incline Machine Press',      sets: 3, repsMin: 10, repsMax: 12, rest: 120, notes: 'Upper-chest emphasis.' },
          { name: 'Machine Shoulder Press',     sets: 3, repsMin: 8,  repsMax: 12, rest: 120, notes: 'Comfortable range.' },
          { name: 'Machine Lateral Raise',      sets: 3, repsMin: 12, repsMax: 20, rest: 60,  notes: 'Strict.' },
          { name: 'Machine Tricep Extension',   sets: 3, repsMin: 10, repsMax: 15, rest: 60,  notes: 'Full lockout.' },
        ],
      },
      {
        name: 'Day 2: Lower',
        exercises: [
          { name: 'Leg Press',                  sets: 4, repsMin: 10, repsMax: 15, rest: 150, notes: 'Deep, controlled reps.' },
          { name: 'Seated Leg Curl',            sets: 3, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Slow eccentric.' },
          { name: 'Leg Extension',              sets: 3, repsMin: 12, repsMax: 15, rest: 90,  notes: 'Pause at the top.' },
          { name: 'Seated Machine Calf Raise',  sets: 4, repsMin: 12, repsMax: 20, rest: 60,  notes: 'Pause at the stretch.' },
        ],
      },
      {
        name: 'Day 3: Upper Pull',
        exercises: [
          { name: 'Lat Pulldown (Wide Grip)',   sets: 4, repsMin: 8,  repsMax: 12, rest: 120, notes: 'Control the way up.' },
          { name: 'Machine Row (Chest Supported)', sets: 4, repsMin: 8, repsMax: 12, rest: 120, notes: 'Chest on the pad.' },
          { name: 'Machine Rear Delt Fly',      sets: 3, repsMin: 12, repsMax: 15, rest: 60,  notes: 'Slow and strict.' },
          { name: 'Machine Curl',               sets: 3, repsMin: 10, repsMax: 15, rest: 60,  notes: 'Full range.' },
        ],
      },
      {
        name: 'Day 4: Weak-Point Mix',
        exercises: [
          { name: 'Pec Deck (Machine Fly)',     sets: 3, repsMin: 12, repsMax: 15, rest: 90,  notes: 'Squeeze hard.' },
          { name: 'Lat Pulldown (Neutral Grip)', sets: 3, repsMin: 10, repsMax: 12, rest: 90, notes: 'Long stretch at the top.' },
          { name: 'Machine Hip Thrust',         sets: 3, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Pause at the top.' },
          { name: 'Abduction Machine',          sets: 3, repsMin: 12, repsMax: 15, rest: 60,  notes: 'Controlled in both directions.' },
          { name: 'Machine Crunch',             sets: 3, repsMin: 12, repsMax: 15, rest: 60,  notes: 'Curl, do not fold.' },
        ],
      },
    ],
  },

  {
    name: 'One-Arm Upper Builder',
    description: 'A two-day upper-body plan where every movement loads one side at a time, so it works fully when you train with one arm. Work your training side; the plan never assumes both. Add a rep each session; at the top of the range, add weight. Leave 2 reps in the tank.',
    tags: 'unilateral upper adapted goal:build_muscle days:2',
    difficulty: 1,
    workouts: [
      {
        name: 'Day 1: Push Side',
        exercises: [
          { name: 'Single-Arm Dumbbell Press',  sets: 3, repsMin: 8,  repsMax: 12, rest: 120, notes: 'Seated with back support works well.' },
          { name: 'Chest Press Machine (Single-Arm)', sets: 3, repsMin: 8, repsMax: 12, rest: 120, notes: 'One handle at a time.' },
          { name: 'Single-Arm Cable Lateral Raise', sets: 3, repsMin: 12, repsMax: 20, rest: 60, notes: 'Lead with the elbow.' },
          { name: 'Single Arm Cable Extension', sets: 3, repsMin: 10, repsMax: 15, rest: 60,  notes: 'Elbow stays by your side.' },
          { name: 'Dumbbell Side Bend',         sets: 2, repsMin: 10, repsMax: 12, rest: 60,  notes: 'One side at a time, slow and controlled.' },
        ],
      },
      {
        name: 'Day 2: Pull Side',
        exercises: [
          { name: 'Single-Arm Lat Pulldown',    sets: 3, repsMin: 8,  repsMax: 12, rest: 120, notes: 'Long stretch at the top.' },
          { name: 'Single-Arm Cable Row',       sets: 3, repsMin: 8,  repsMax: 12, rest: 120, notes: 'Braced, no torso twist.' },
          { name: 'Dumbbell Row',               sets: 3, repsMin: 8,  repsMax: 12, rest: 90,  notes: 'Support yourself on the bench.' },
          { name: 'Concentration Curl',         sets: 3, repsMin: 10, repsMax: 15, rest: 60,  notes: 'Elbow braced on the thigh.' },
          { name: 'Tricep Kickback',            sets: 2, repsMin: 12, repsMax: 15, rest: 60,  notes: 'Upper arm parallel to the floor.' },
        ],
      },
    ],
  },

  {
    name: 'One-Leg Lower Builder',
    description: 'A two-day lower-body plan built from movements that load one leg at a time. Work your training side at its own pace; nothing in the plan needs both legs at once. Add a rep each session; at the top of the range, add weight. Leave 2 reps in the tank.',
    tags: 'unilateral lower adapted goal:build_muscle days:2',
    difficulty: 1,
    workouts: [
      {
        name: 'Day 1: Knee-Led',
        exercises: [
          { name: 'Single Leg Press',           sets: 3, repsMin: 8,  repsMax: 12, rest: 120, notes: 'Foot mid-platform.' },
          { name: 'Terminal Knee Extension',    sets: 3, repsMin: 12, repsMax: 15, rest: 90,  notes: 'Band behind the knee, straighten fully.' },
          { name: 'Cable Kickback',             sets: 3, repsMin: 12, repsMax: 15, rest: 60,  notes: 'Squeeze at the back.' },
          { name: 'Single-Leg Calf Raise (Dumbbell)', sets: 3, repsMin: 10, repsMax: 15, rest: 60, notes: 'Hold something stable for support.' },
        ],
      },
      {
        name: 'Day 2: Hip-Led',
        exercises: [
          { name: 'Single-Leg Romanian Deadlift (DB)', sets: 3, repsMin: 8, repsMax: 12, rest: 120, notes: 'Hold support with the free hand if useful.' },
          { name: 'Single Leg Hip Thrust',      sets: 3, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Pause at the top.' },
          { name: 'Cable Hip Abduction',        sets: 3, repsMin: 12, repsMax: 15, rest: 60,  notes: 'Stand tall, controlled sweep.' },
          { name: 'Hip Extension (Cable)',      sets: 3, repsMin: 10, repsMax: 15, rest: 60,  notes: 'Drive back through the heel.' },
        ],
      },
    ],
  },

  {
    name: 'Steady-Base Full Body',
    description: 'Three full-body days where every movement has external support or a fixed path: machines, supported benches and braced positions, with no free-standing balance demands anywhere. Add a rep each session; at the top of the range, add weight. Leave 2 reps in the tank.',
    tags: 'supported balance adapted goal:build_muscle days:3',
    difficulty: 0,
    workouts: [
      {
        name: 'Day 1: Push & Quads',
        exercises: [
          { name: 'Machine Chest Press',        sets: 3, repsMin: 8,  repsMax: 12, rest: 120, notes: 'Smooth tempo.' },
          { name: 'Leg Press',                  sets: 3, repsMin: 10, repsMax: 15, rest: 120, notes: 'Comfortable depth.' },
          { name: 'Machine Shoulder Press',     sets: 3, repsMin: 10, repsMax: 12, rest: 90,  notes: 'Back on the pad.' },
          { name: 'Leg Extension',              sets: 2, repsMin: 12, repsMax: 15, rest: 60,  notes: 'Pause at the top.' },
        ],
      },
      {
        name: 'Day 2: Pull & Hamstrings',
        exercises: [
          { name: 'Lat Pulldown (Wide Grip)',   sets: 3, repsMin: 8,  repsMax: 12, rest: 120, notes: 'Seated and braced.' },
          { name: 'Seated Leg Curl',            sets: 3, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Slow lowering.' },
          { name: 'Machine Row (Chest Supported)', sets: 3, repsMin: 10, repsMax: 12, rest: 90, notes: 'Chest stays supported.' },
          { name: 'Preacher Curl (Dumbbell)',   sets: 2, repsMin: 10, repsMax: 12, rest: 60,  notes: 'Arm braced on the pad.' },
        ],
      },
      {
        name: 'Day 3: Machines Mixed',
        exercises: [
          { name: 'Incline Machine Press',      sets: 3, repsMin: 10, repsMax: 12, rest: 90,  notes: 'Upper-chest emphasis.' },
          { name: 'Seated Cable Row',           sets: 3, repsMin: 10, repsMax: 12, rest: 90,  notes: 'Pull to the ribs.' },
          { name: 'Machine Hip Thrust',         sets: 3, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Pause at the top.' },
          { name: 'Seated Machine Calf Raise',  sets: 3, repsMin: 12, repsMax: 20, rest: 60,  notes: 'Full stretch.' },
          { name: 'Machine Rear Delt Fly',      sets: 2, repsMin: 12, repsMax: 15, rest: 60,  notes: 'Strict.' },
        ],
      },
    ],
  },

  {
    name: 'Dumbbell & Band Foundations',
    description: 'Three full-body days using only dumbbells and a resistance band, with seated and supported options built in. A complete week of training from minimal equipment. Add a rep each session; at the top of the range, move up a weight or band. Leave 2 reps in the tank.',
    tags: 'dumbbell band low_equipment adapted goal:build_muscle days:3',
    difficulty: 0,
    workouts: [
      {
        name: 'Day 1: Push',
        exercises: [
          { name: 'Dumbbell Bench Press',       sets: 3, repsMin: 8,  repsMax: 12, rest: 120, notes: 'A floor press works if you have no bench.' },
          { name: 'Goblet Squat',               sets: 3, repsMin: 10, repsMax: 15, rest: 120, notes: 'Dumbbell held at the chest.' },
          { name: 'Seated Dumbbell Press',      sets: 3, repsMin: 8,  repsMax: 12, rest: 90,  notes: 'Back supported if possible.' },
          { name: 'Band Tricep Pushdown',       sets: 2, repsMin: 12, repsMax: 15, rest: 60,  notes: 'Anchor the band high.' },
        ],
      },
      {
        name: 'Day 2: Pull',
        exercises: [
          { name: 'Dumbbell Row',               sets: 3, repsMin: 8,  repsMax: 12, rest: 120, notes: 'Brace on a bench or chair.' },
          { name: 'Band Lat Pulldown',          sets: 3, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Anchor high, pull to the collarbone.' },
          { name: 'Band Pull-Apart',            sets: 3, repsMin: 15, repsMax: 20, rest: 60,  notes: 'Squeeze the shoulder blades.' },
          { name: 'Dumbbell Curl',              sets: 2, repsMin: 10, repsMax: 15, rest: 60,  notes: 'Seated or standing.' },
        ],
      },
      {
        name: 'Day 3: Hips & Detail',
        exercises: [
          { name: 'Romanian Deadlift (Dumbbell)', sets: 3, repsMin: 10, repsMax: 12, rest: 120, notes: 'Soft knees, hinge at the hips.' },
          { name: 'Dumbbell Hip Thrust',        sets: 3, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Shoulders on a bench or sofa edge.' },
          { name: 'Dumbbell Lateral Raise',     sets: 3, repsMin: 12, repsMax: 20, rest: 60,  notes: 'Lead with the elbows.' },
          { name: 'Band Leg Curl',              sets: 3, repsMin: 12, repsMax: 15, rest: 60,  notes: 'Anchor low, curl the heel in.' },
          { name: 'Dumbbell Calf Raise (Standing)', sets: 3, repsMin: 12, repsMax: 20, rest: 60, notes: 'Hold support with the free hand.' },
        ],
      },
    ],
  },

  {
    name: 'No-Overhead Upper Split',
    description: 'A two-day upper-body split with nothing pressed, pulled or held above head height. Chest, back, shoulders and arms all still get full work from presses, rows and raises that stay below shoulder level. Add a rep each session; at the top of the range, add weight. Leave 2 reps in the tank.',
    tags: 'no_overhead upper adapted goal:build_muscle days:2',
    difficulty: 1,
    workouts: [
      {
        name: 'Day 1: Push Without Overhead',
        exercises: [
          { name: 'Barbell Bench Press',        sets: 3, repsMin: 8,  repsMax: 10, rest: 150, notes: 'Bar path stays over the chest.' },
          { name: 'Machine Chest Press',        sets: 3, repsMin: 10, repsMax: 12, rest: 120, notes: 'Handles at mid-chest.' },
          { name: 'Dumbbell Lateral Raise',     sets: 3, repsMin: 12, repsMax: 20, rest: 60,  notes: 'To shoulder height, never above.' },
          { name: 'Pec Deck (Machine Fly)',     sets: 3, repsMin: 12, repsMax: 15, rest: 90,  notes: 'Squeeze in the middle.' },
          { name: 'Tricep Pushdown (Bar)',      sets: 3, repsMin: 10, repsMax: 15, rest: 60,  notes: 'Elbows pinned.' },
        ],
      },
      {
        name: 'Day 2: Pull Without Overhead',
        exercises: [
          { name: 'Seated Cable Row',           sets: 4, repsMin: 8,  repsMax: 12, rest: 120, notes: 'Pull to the ribs.' },
          { name: 'Chest-Supported Row (Dumbbell)', sets: 3, repsMin: 10, repsMax: 12, rest: 90, notes: 'Chest on the incline bench.' },
          { name: 'Face Pull',                  sets: 3, repsMin: 15, repsMax: 20, rest: 60,  notes: 'Rope at chest height.' },
          { name: 'Machine Rear Delt Fly',      sets: 3, repsMin: 12, repsMax: 15, rest: 60,  notes: 'Strict and slow.' },
          { name: 'Dumbbell Curl',              sets: 3, repsMin: 10, repsMax: 15, rest: 60,  notes: 'No swinging.' },
        ],
      },
    ],
  },
  {
    name: 'Grip-Light Machine Circuit',
    description: 'Three machine-based days where nothing needs a firm grip: every movement loads through pads, platforms or light supportive holds. Rowing and pulldown work needs a firm grip, so this plan covers the rest of the body honestly instead of pretending; add any exercise that works for you from the library. Add a rep each session; at the top of the range, add weight. Leave 2 reps in the tank.',
    tags: 'machine grip_light supported adapted goal:build_muscle days:3',
    difficulty: 0,
    workouts: [
      {
        name: 'Day 1: Legs & Chest',
        exercises: [
          { name: 'Leg Press',                  sets: 3, repsMin: 10, repsMax: 15, rest: 120, notes: 'Feet mid-platform. Handles are optional support only.' },
          { name: 'Pec Deck (Machine Fly)',     sets: 3, repsMin: 12, repsMax: 15, rest: 90,  notes: 'Forearms on the pads.' },
          { name: 'Leg Extension',              sets: 3, repsMin: 12, repsMax: 15, rest: 90,  notes: 'Pause at the top.' },
          { name: 'Machine Lateral Raise',      sets: 3, repsMin: 12, repsMax: 20, rest: 60,  notes: 'Pads on the arms, no grip needed.' },
          { name: 'Machine Crunch',             sets: 2, repsMin: 12, repsMax: 15, rest: 60,  notes: 'Curl, do not fold.' },
        ],
      },
      {
        name: 'Day 2: Hips & Rear',
        exercises: [
          { name: 'Seated Leg Curl',            sets: 3, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Slow lowering.' },
          { name: 'Reverse Pec Deck',           sets: 3, repsMin: 12, repsMax: 15, rest: 60,  notes: 'Rest your forearms on the pads if gripping is hard.' },
          { name: 'Abduction Machine',          sets: 3, repsMin: 12, repsMax: 15, rest: 60,  notes: 'Controlled in both directions.' },
          { name: 'Hip Adduction Machine',      sets: 3, repsMin: 12, repsMax: 15, rest: 60,  notes: 'Smooth tempo.' },
          { name: 'Seated Machine Calf Raise',  sets: 3, repsMin: 12, repsMax: 20, rest: 60,  notes: 'Pause at the stretch.' },
        ],
      },
      {
        name: 'Day 3: Whole Body',
        exercises: [
          { name: 'Leg Press (High Foot)',      sets: 3, repsMin: 10, repsMax: 15, rest: 120, notes: 'Feet high on the platform for more hip work.' },
          { name: 'Pec Deck (Machine Fly)',     sets: 3, repsMin: 12, repsMax: 15, rest: 90,  notes: 'Squeeze in the middle.' },
          { name: 'Machine Rear Delt Fly',      sets: 3, repsMin: 12, repsMax: 15, rest: 60,  notes: 'Strict and slow.' },
          { name: 'Leg Extension',              sets: 2, repsMin: 12, repsMax: 15, rest: 60,  notes: 'Pause at the top.' },
          { name: 'Machine Crunch',             sets: 2, repsMin: 12, repsMax: 15, rest: 60,  notes: 'Slow and controlled.' },
        ],
      },
    ],
  },

  {
    name: 'Seated Home Strength',
    description: 'A three-day plan trained entirely from a seated or lying position with dumbbells and bands at home. No gym machines or standing work. Machine-free pressing, pulling, and leg training using adjustable dumbbells and resistance bands. Add a rep each session; at the top of the rep range, add weight and start again. Leave 2 reps in the tank.',
    tags: 'seated home upper_lower beginner goal:build_muscle days:3',
    difficulty: 0,
    workouts: [
      {
        name: 'Day 1: Upper Press & Chest',
        exercises: [
          { name: 'Seated Dumbbell Press',       sets: 3, repsMin: 8,  repsMax: 12, rest: 120, notes: 'Seated on a bench, press the dumbbells straight up.' },
          { name: 'Incline Dumbbell Press',      sets: 3, repsMin: 10, repsMax: 15, rest: 120, notes: 'Incline bench or propped pillows, upper-chest focus.' },
          { name: 'Dumbbell Bench Press',        sets: 3, repsMin: 10, repsMax: 15, rest: 120, notes: 'Flat bench or firm surface, press dumbbells straight up.' },
          { name: 'Dumbbell Fly',                sets: 3, repsMin: 12, repsMax: 15, rest: 90,  notes: 'Lie on your back, dumbbells arc across the chest.' },
          { name: 'Seated Dumbbell Curl',        sets: 3, repsMin: 10, repsMax: 15, rest: 60,  notes: 'Seated, curl the dumbbells, no swinging.' },
        ],
      },
      {
        name: 'Day 2: Pull & Back Strength',
        exercises: [
          { name: 'Seated Band Row',             sets: 4, repsMin: 12, repsMax: 20, rest: 120, notes: 'Seated, band looped around feet, row toward your chest.' },
          { name: 'Seated Band Lat Pulldown',    sets: 4, repsMin: 12, repsMax: 20, rest: 120, notes: 'Seated, band anchored above, pull down to sides.' },
          { name: 'Dumbbell Pullover',           sets: 3, repsMin: 12, repsMax: 15, rest: 90,  notes: 'Lying perpendicular on a bench, dumbbell arc over the chest.' },
          { name: 'Seated Lateral Raise',        sets: 3, repsMin: 12, repsMax: 15, rest: 60,  notes: 'Seated, raise the dumbbells out to the sides.' },
          { name: 'Dumbbell Side-Lying Rear Delt', sets: 2, repsMin: 12, repsMax: 15, rest: 60,  notes: 'Lying on your side, raise the dumbbell in an arc.' },
        ],
      },
      {
        name: 'Day 3: Close Grip & Arms',
        exercises: [
          { name: 'Decline Dumbbell Press',      sets: 3, repsMin: 10, repsMax: 15, rest: 120, notes: 'Decline position, chest-focused pressing.' },
          { name: 'Dumbbell Floor Skull Crusher',sets: 3, repsMin: 10, repsMax: 15, rest: 120, notes: 'Lying on your back, elbows bent, press dumbbells toward the ceiling.' },
          { name: 'Bench Press (Close Grip, Dumbbell)', sets: 3, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Close-grip pressing on bench, dumbbells near the midline.' },
          { name: 'Incline Dumbbell Curl',       sets: 3, repsMin: 10, repsMax: 15, rest: 60,  notes: 'Incline bench, curl dumbbells, no swinging.' },
          { name: 'Decline Dumbbell Fly',        sets: 2, repsMin: 12, repsMax: 15, rest: 60,  notes: 'Decline bench, dumbbells in an arc across the chest.' },
        ],
      },
    ],
  },

  {
    name: 'Grip-Light Lower Builder',
    description: 'A lower-body plan built from guided machines where every exercise uses supportive or no grip. Machine pressing, leg extension, leg curl, calf raises, hip abduction and adduction, and machine hip thrust work. Add a rep each session; at the top of the range, add weight. Leave 2 reps in the tank.',
    tags: 'lower_body machine adapted goal:build_muscle days:3',
    difficulty: 1,
    workouts: [
      {
        name: 'Day 1: Quad & Glute Press',
        exercises: [
          { name: 'Leg Press',                   sets: 4, repsMin: 10, repsMax: 15, rest: 120, notes: 'Feet mid-platform, full comfortable range.' },
          { name: 'Leg Extension',               sets: 3, repsMin: 12, repsMax: 15, rest: 90,  notes: 'Pause one second at the top.' },
          { name: 'Machine Hip Thrust',          sets: 3, repsMin: 10, repsMax: 15, rest: 120, notes: 'Full hip extension, squeeze glutes hard at the top.' },
          { name: 'Seated Machine Calf Raise',   sets: 3, repsMin: 12, repsMax: 20, rest: 60,  notes: 'Full stretch at the bottom, full contraction at the top.' },
          { name: 'Hip Adduction Machine',       sets: 2, repsMin: 12, repsMax: 15, rest: 60,  notes: 'Controlled in both directions.' },
        ],
      },
      {
        name: 'Day 2: Hamstring Focus',
        exercises: [
          { name: 'Seated Leg Curl',             sets: 4, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Curl to glutes, hold a second at the top.' },
          { name: 'Lying Leg Curl',              sets: 3, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Curled position, slow lowering.' },
          { name: 'Glute Kickback Machine',      sets: 3, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Full range of motion, squeeze the glutes.' },
          { name: 'Leg Press (High Foot)',       sets: 3, repsMin: 12, repsMax: 15, rest: 90,  notes: 'Feet high for glute and hamstring emphasis.' },
          { name: 'Leg Press Calf Raise',        sets: 2, repsMin: 12, repsMax: 20, rest: 60,  notes: 'Calves on the leg press sled, full range.' },
        ],
      },
      {
        name: 'Day 3: Detail & Support',
        exercises: [
          { name: 'Abduction Machine',           sets: 3, repsMin: 12, repsMax: 15, rest: 90,  notes: 'Controlled outward motion, slow return.' },
          { name: 'Leg Extension',               sets: 3, repsMin: 12, repsMax: 20, rest: 60,  notes: 'High-rep quad work for endurance.' },
          { name: 'Seated Leg Curl',             sets: 3, repsMin: 12, repsMax: 15, rest: 60,  notes: 'Single-leg or bilateral, full stretch and contraction.' },
          { name: 'Seated Machine Calf Raise',   sets: 3, repsMin: 15, repsMax: 25, rest: 45,  notes: 'Pause at stretch and contraction.' },
          { name: 'Hip Adduction Machine',       sets: 2, repsMin: 12, repsMax: 15, rest: 60,  notes: 'Inner thigh and hip stability.' },
        ],
      },
    ],
  },

  {
    name: 'Hinge & Hip Lower Builder',
    description: 'A lower-body plan built around hip-hinge and hip-extension work that keeps deep knee bends out. Romanian deadlifts, hip thrusts, back extensions, hyperextensions, hip abduction and adduction, calf raises, and shallow-arc quad work using Terminal Knee Extension and Wall Sit. Add a rep each session; at the top of the range, add weight. Leave 2 reps in the tank.',
    tags: 'lower_body full_body adapted goal:build_muscle days:3',
    difficulty: 1,
    workouts: [
      {
        name: 'Day 1: Hip Hinge & Glute',
        exercises: [
          { name: 'Romanian Deadlift',           sets: 4, repsMin: 8,  repsMax: 12, rest: 120, notes: 'Hip hinge, feel the stretch in hamstrings, keep bar close.' },
          { name: 'Band Hip Thrust',             sets: 4, repsMin: 10, repsMax: 15, rest: 120, notes: 'Full hip extension, squeeze glutes at the top.' },
          { name: 'Back Extension (Weighted)',   sets: 3, repsMin: 10, repsMax: 12, rest: 90,  notes: 'Hyperextension machine or bench, hold weight at the chest.' },
          { name: 'Calf Raise on Steps',         sets: 3, repsMin: 12, repsMax: 20, rest: 60,  notes: 'Full range of motion, pause at stretch and contraction.' },
          { name: 'Hip Adduction Machine',       sets: 2, repsMin: 12, repsMax: 15, rest: 60,  notes: 'Stability and balance work.' },
        ],
      },
      {
        name: 'Day 2: Hip Extension & Quads',
        exercises: [
          { name: 'Dumbbell Hip Thrust',         sets: 4, repsMin: 10, repsMax: 15, rest: 120, notes: 'Back on a bench, dumbbell on your hips, drive through heels.' },
          { name: '45-Degree Hip Extension',     sets: 3, repsMin: 10, repsMax: 12, rest: 90,  notes: 'Machine or bench, glute and hamstring focus.' },
          { name: 'Terminal Knee Extension',     sets: 3, repsMin: 12, repsMax: 20, rest: 60,  notes: 'Band around the leg, straighten the knee against resistance.' },
          { name: 'Wall Sit',                    sets: 3, repsMin: 12, repsMax: 20, rest: 90,  notes: 'Back against a wall, quads working; count seconds as reps.' },
          { name: 'Abduction Machine',           sets: 2, repsMin: 12, repsMax: 15, rest: 60,  notes: 'Hip abduction work.' },
        ],
      },
      {
        name: 'Day 3: Posterior Chain & Stability',
        exercises: [
          { name: 'B-Stance Hip Thrust',         sets: 3, repsMin: 10, repsMax: 15, rest: 120, notes: 'Glute-dominant single-side work, back leg light contact.' },
          { name: 'B-Stance Romanian Deadlift',  sets: 3, repsMin: 10, repsMax: 12, rest: 90,  notes: 'Single-leg emphasis on the hinge movement.' },
          { name: 'Terminal Knee Extension',     sets: 3, repsMin: 15, repsMax: 25, rest: 60,  notes: 'High-rep shallow-arc quad activation.' },
          { name: 'Hip Adduction Machine',       sets: 3, repsMin: 12, repsMax: 15, rest: 60,  notes: 'Inner thigh and medial stability.' },
          { name: 'Calf Raise on Steps',         sets: 3, repsMin: 12, repsMax: 20, rest: 60,  notes: 'Calf endurance and ankle mobility.' },
        ],
      },
    ],
  },

  {
    name: 'Seated Upper Strength II',
    description: 'An experienced three-day upper-body strength plan trained entirely from seated or lying positions. Heavier compound work with longer rests: seated pressing, machine chest work, lat pulldown variants, and seated cable rows. When you complete every rep at the top of the range, add weight. Leave 1 to 2 reps in the tank.',
    tags: 'seated upper strength adapted goal:get_stronger days:3',
    difficulty: 2,
    workouts: [
      {
        name: 'Day 1: Press Strength',
        exercises: [
          { name: 'Seated Dumbbell Press',       sets: 4, repsMin: 6,  repsMax: 10, rest: 150, notes: 'Full rests between sets, heavy and controlled.' },
          { name: 'Machine Chest Press',         sets: 4, repsMin: 8,  repsMax: 10, rest: 150, notes: 'Smooth tempo, full range of motion.' },
          { name: 'Machine Shoulder Press',      sets: 3, repsMin: 8,  repsMax: 10, rest: 120, notes: 'Comfortable range that suits your shoulder.' },
          { name: 'Incline Dumbbell Press',      sets: 3, repsMin: 8,  repsMax: 12, rest: 120, notes: 'Upper-chest emphasis, controlled descent.' },
          { name: 'Dumbbell Floor Skull Crusher',sets: 3, repsMin: 8,  repsMax: 12, rest: 90,  notes: 'Tricep and pressing strength support.' },
        ],
      },
      {
        name: 'Day 2: Pull Strength',
        exercises: [
          { name: 'Lat Pulldown (Close Grip)',   sets: 4, repsMin: 6,  repsMax: 10, rest: 150, notes: 'Drive elbows down, full stretch overhead.' },
          { name: 'Seated Cable Row',            sets: 4, repsMin: 6,  repsMax: 10, rest: 150, notes: 'Braced torso, heavy pulls to the ribs.' },
          { name: 'Lat Pulldown (Neutral Grip)', sets: 3, repsMin: 8,  repsMax: 12, rest: 120, notes: 'Different grip angle, lat emphasis.' },
          { name: 'Machine Rear Delt Fly',       sets: 3, repsMin: 10, repsMax: 12, rest: 90,  notes: 'Posterior shoulder health and balance.' },
          { name: 'Machine Curl',                sets: 3, repsMin: 8,  repsMax: 10, rest: 90,  notes: 'Bicep strength work.' },
        ],
      },
      {
        name: 'Day 3: Upper Mixed Strength',
        exercises: [
          { name: 'Lat Pulldown (Wide Grip)',    sets: 4, repsMin: 8,  repsMax: 12, rest: 120, notes: 'Lat width, controlled descent.' },
          { name: 'Machine Chest Press',         sets: 3, repsMin: 8,  repsMax: 10, rest: 120, notes: 'Strength-focused repetition.' },
          { name: 'Machine Shoulder Press',      sets: 3, repsMin: 8,  repsMax: 10, rest: 120, notes: 'Strong finishing pressing pattern.' },
          { name: 'Machine Lateral Raise',       sets: 3, repsMin: 12, repsMax: 15, rest: 60,  notes: 'Side delt detail work.' },
          { name: 'Machine Tricep Extension',    sets: 3, repsMin: 10, repsMax: 12, rest: 60,  notes: 'Tricep finishing.' },
        ],
      },
    ],
  },

  {
    name: 'Steady-Base Strength',
    description: 'An experienced three-day full-body strength plan built entirely on machines and supported exercises where every movement is stable or actively supported. No balance demands, no single-leg work, no unstable surfaces. Machine and Smith Machine work for squats, presses, and rows with heavier strength rep ranges. When you complete every rep at the top of the range, add weight. Leave 1 to 2 reps in the tank.',
    tags: 'full_body machine supported strength adapted goal:get_stronger days:3',
    difficulty: 2,
    workouts: [
      {
        name: 'Day 1: Lower Press Strength',
        exercises: [
          { name: 'Hack Squat Machine',          sets: 4, repsMin: 6,  repsMax: 10, rest: 150, notes: 'Full rests, smooth path along the rails.' },
          { name: 'Leg Press',                   sets: 4, repsMin: 6,  repsMax: 10, rest: 150, notes: 'Heavy strength work, full comfortable range.' },
          { name: 'Leg Extension',               sets: 3, repsMin: 10, repsMax: 15, rest: 90,  notes: 'Quad isolation after the compound work.' },
          { name: 'Smith Machine Calf Raise',    sets: 3, repsMin: 10, repsMax: 15, rest: 60,  notes: 'Full range, supported by the Smith Machine.' },
          { name: 'Hip Adduction Machine',       sets: 2, repsMin: 12, repsMax: 15, rest: 60,  notes: 'Medial stability support.' },
        ],
      },
      {
        name: 'Day 2: Upper Press & Pull',
        exercises: [
          { name: 'Smith Machine Bench Press',   sets: 4, repsMin: 6,  repsMax: 8,  rest: 150, notes: 'Heavy pressing strength, full rests.' },
          { name: 'Smith Machine Row',           sets: 4, repsMin: 6,  repsMax: 8,  rest: 150, notes: 'Strong horizontal pull to balance pressing.' },
          { name: 'Machine Chest Press',         sets: 3, repsMin: 8,  repsMax: 10, rest: 120, notes: 'Secondary press variation.' },
          { name: 'Machine Shoulder Press',      sets: 3, repsMin: 8,  repsMax: 10, rest: 120, notes: 'Vertical pressing strength.' },
          { name: 'Machine Curl',                sets: 2, repsMin: 10, repsMax: 12, rest: 60,  notes: 'Arm accessory work.' },
        ],
      },
      {
        name: 'Day 3: Full-Body Machine Strength',
        exercises: [
          { name: 'Smith Machine Squat',         sets: 4, repsMin: 6,  repsMax: 10, rest: 150, notes: 'Compound lower-body strength, full rests.' },
          { name: 'Lat Pulldown (Wide Grip)',    sets: 3, repsMin: 8,  repsMax: 12, rest: 120, notes: 'Supported vertical pull.' },
          { name: 'Machine Shoulder Press',      sets: 3, repsMin: 8,  repsMax: 10, rest: 120, notes: 'Strength-focused overhead work.' },
          { name: 'Leg Press',                   sets: 3, repsMin: 10, repsMax: 12, rest: 90,  notes: 'Secondary leg work for volume.' },
          { name: 'Machine Rear Delt Fly',       sets: 3, repsMin: 12, repsMax: 15, rest: 60,  notes: 'Posterior shoulder health.' },
        ],
      },
    ],
  },

  // ═══ Style plans (EL-8 to EL-12, 09-STYLE-PLANS.md) ═══════════════════════
  //
  // Every plan below carries a style:<pool> tag matching a key in
  // src/lib/exercise/stylePools.js's STYLE_POOLS. That tag is what
  // restricts this plan's "Adjust plan" regeneration and its swap sheet to
  // the named pool (EL-11) - it is load-bearing, not decorative.
  //
  // Progression (EL-10): grind rows (squats, deadlifts, presses, rows,
  // carries) use the existing rep-then-load double progression - climb to
  // the top of the rep range, then move up a bell size and restart at the
  // bottom. Ballistic rows (swings, cleans, snatches, jerks) progress reps
  // within a fixed set count, then bell size, NEVER by speed. Circuits
  // progress rounds first (3 -> 4 -> 5 across the block), then reps at the
  // same load, then load; round rest is a template constant, never
  // shortened. Every template's description states this in plain words.

  // ── 30. Kettlebell Foundations, 2 Days ───────────────────────────────────
  {
    name: 'Kettlebell Foundations: 2 Days',
    description: 'A two-day, single-kettlebell plan for anyone starting out with kettlebell training. Grind lifts and the two-hand swing only, no one-arm or overhead ballistic work yet: swing and the get-up come first, in that order, matching the standard kettlebell teaching progression. Progress by adding reps first. Once you hit the top of a lift’s rep range for all its sets, move up to the next kettlebell size and start that lift back at the bottom of the range. Around 30 minutes a session.',
    tags: 'style:kettlebell_foundations equipment:kettlebell kettlebell home full_body beginner goal:build_muscle days:2 short',
    difficulty: 0,
    workouts: [
      {
        name: 'Day A',
        exercises: [
          { name: 'Kettlebell Goblet Squat',   sets: 3, repsMin: 8,  repsMax: 12, rest: 90, notes: 'Bell held at chest, elbows tucked. Sit deep between your knees. Push the floor away to stand.' },
          { name: 'Kettlebell Deadlift',       sets: 3, repsMin: 8,  repsMax: 12, rest: 90, notes: 'Hinge at the hips with a flat back. Bell stays close to your shins. Drive hips forward to finish.' },
          { name: 'Kettlebell Press (Single-Arm)', sets: 3, repsMin: 6, repsMax: 10, rest: 90, notes: 'Per side. Bell racked at the shoulder. Press straight overhead, ribs down. Swap arms between sets.' },
          { name: 'Kettlebell Row (Single-Arm)', sets: 3, repsMin: 8, repsMax: 12, rest: 75, notes: 'Per side. Flat back, brace the free hand on a bench or your knee. Pull the elbow past your ribs.' },
          { name: "Kettlebell Farmer's Carry",  sets: 3, repsMin: 20, repsMax: 40, rest: 60, notes: 'Around 40 metres per set. Tall posture, shoulders down, bell hanging dead still at your side.' },
          { name: 'Kettlebell Halo',            sets: 2, repsMin: 8,  repsMax: 8,  rest: 45, notes: '8 circles each direction. Bell close to the head, core braced. Keep the ribs down throughout.' },
        ],
      },
      {
        name: 'Day B',
        exercises: [
          { name: 'Kettlebell Reverse Lunge (Rack Position)', sets: 3, repsMin: 8, repsMax: 10, rest: 90, notes: 'Per side. Bell racked at one shoulder. Step back under control, front shin stays vertical.' },
          { name: 'Kettlebell Romanian Deadlift', sets: 3, repsMin: 8, repsMax: 12, rest: 90, notes: 'Soft knees, push hips back. Long stretch down the hamstrings, then drive hips forward.' },
          { name: 'Kettlebell Floor Press',     sets: 3, repsMin: 8,  repsMax: 12, rest: 90, notes: 'Lying on the floor, elbows lightly touch down between reps. Press straight up over the shoulder.' },
          { name: 'Gorilla Row',                sets: 3, repsMin: 8,  repsMax: 12, rest: 75, notes: 'A bell in each hand on the floor. Row one side at a time, hips back, back flat throughout.' },
          { name: 'Kettlebell Swing',           sets: 5, repsMin: 10, repsMax: 10, rest: 60, notes: 'Two hands on the bell. Hike it back, then snap the hips forward hard. This is a hinge, not a squat.' },
          { name: 'Get-Up to Elbow',            sets: 3, repsMin: 3,  repsMax: 3,  rest: 60, notes: 'Per side. The first half of the Turkish get-up, lying to propped on your elbow. Eyes on the bell.' },
        ],
      },
    ],
  },

  // ── 31. Kettlebell Foundations, 3 Days ───────────────────────────────────
  {
    name: 'Kettlebell Foundations: 3 Days',
    description: 'The same single-kettlebell foundations as the two-day plan, with a third day added for more frequency. Grind lifts and the two-hand swing only. Progress by adding reps first; once you hit the top of a lift’s rep range for all its sets, move up to the next kettlebell size and start that lift back at the bottom of the range. Around 30 minutes a session.',
    tags: 'style:kettlebell_foundations equipment:kettlebell kettlebell home full_body beginner goal:build_muscle days:3',
    difficulty: 0,
    workouts: [
      {
        name: 'Day A',
        exercises: [
          { name: 'Kettlebell Goblet Squat',   sets: 3, repsMin: 8,  repsMax: 12, rest: 90, notes: 'Bell held at chest, elbows tucked. Sit deep between your knees. Push the floor away to stand.' },
          { name: 'Kettlebell Deadlift',       sets: 3, repsMin: 8,  repsMax: 12, rest: 90, notes: 'Hinge at the hips with a flat back. Bell stays close to your shins. Drive hips forward to finish.' },
          { name: 'Kettlebell Press (Single-Arm)', sets: 3, repsMin: 6, repsMax: 10, rest: 90, notes: 'Per side. Bell racked at the shoulder. Press straight overhead, ribs down. Swap arms between sets.' },
          { name: 'Kettlebell Row (Single-Arm)', sets: 3, repsMin: 8, repsMax: 12, rest: 75, notes: 'Per side. Flat back, brace the free hand on a bench or your knee. Pull the elbow past your ribs.' },
          { name: "Kettlebell Farmer's Carry",  sets: 3, repsMin: 20, repsMax: 40, rest: 60, notes: 'Around 40 metres per set. Tall posture, shoulders down, bell hanging dead still at your side.' },
          { name: 'Kettlebell Halo',            sets: 2, repsMin: 8,  repsMax: 8,  rest: 45, notes: '8 circles each direction. Bell close to the head, core braced. Keep the ribs down throughout.' },
        ],
      },
      {
        name: 'Day B',
        exercises: [
          { name: 'Kettlebell Reverse Lunge (Rack Position)', sets: 3, repsMin: 8, repsMax: 10, rest: 90, notes: 'Per side. Bell racked at one shoulder. Step back under control, front shin stays vertical.' },
          { name: 'Kettlebell Romanian Deadlift', sets: 3, repsMin: 8, repsMax: 12, rest: 90, notes: 'Soft knees, push hips back. Long stretch down the hamstrings, then drive hips forward.' },
          { name: 'Kettlebell Floor Press',     sets: 3, repsMin: 8,  repsMax: 12, rest: 90, notes: 'Lying on the floor, elbows lightly touch down between reps. Press straight up over the shoulder.' },
          { name: 'Gorilla Row',                sets: 3, repsMin: 8,  repsMax: 12, rest: 75, notes: 'A bell in each hand on the floor. Row one side at a time, hips back, back flat throughout.' },
          { name: 'Kettlebell Swing',           sets: 5, repsMin: 10, repsMax: 10, rest: 60, notes: 'Two hands on the bell. Hike it back, then snap the hips forward hard. This is a hinge, not a squat.' },
          { name: 'Get-Up to Elbow',            sets: 3, repsMin: 3,  repsMax: 3,  rest: 60, notes: 'Per side. The first half of the Turkish get-up, lying to propped on your elbow. Eyes on the bell.' },
        ],
      },
      {
        name: 'Day C',
        exercises: [
          { name: 'Kettlebell Sumo Deadlift',   sets: 3, repsMin: 8,  repsMax: 12, rest: 90, notes: 'Feet wide, toes out, bell between your feet. Chest tall as you stand, knees track over toes.' },
          { name: 'Seated Kettlebell Press',    sets: 3, repsMin: 8,  repsMax: 12, rest: 90, notes: 'Seated on the floor or a box, legs out in front. Press overhead without leaning back to help it.' },
          { name: 'Kettlebell Single-Leg Deadlift', sets: 3, repsMin: 6, repsMax: 8, rest: 75, notes: 'Per side. Hinge on one leg, back leg reaches behind you for balance. Hips stay square to the floor.' },
          { name: 'Kettlebell Suitcase Carry',  sets: 3, repsMin: 20, repsMax: 30, rest: 60, notes: 'Per side, around 30 metres. One bell at your side. Resist leaning away from the load.' },
          { name: 'Kettlebell Swing',           sets: 5, repsMin: 10, repsMax: 10, rest: 60, notes: 'Two hands on the bell. Hike it back, then snap the hips forward hard.' },
          { name: 'Turkish Get-Up (Half)',      sets: 3, repsMin: 3,  repsMax: 3,  rest: 75, notes: 'Per side. Lying to standing on one knee, then back down. Eyes on the bell the whole way.' },
        ],
      },
    ],
  },

  // ── 32. Kettlebell Strength, 3 Days ──────────────────────────────────────
  {
    name: 'Kettlebell Strength: 3 Days',
    description: 'A three-day plan for kettlebell training with some experience already, using one or two bells. Adds the ballistic lifts (clean, snatch, swing) on top of heavier grind work, in that order of skill because each one builds on the last. Grind lifts progress by reps then bell size, same as any other plan. Ballistic lifts progress by reps within their set count, then bell size, never by going faster. Around 40 minutes a session.',
    tags: 'style:kettlebell_experienced equipment:kettlebell kettlebell home full_body intermediate advanced goal:build_muscle days:3',
    difficulty: 2,
    workouts: [
      {
        name: 'Day A',
        exercises: [
          { name: 'Kettlebell Front Rack Squat (Double)', sets: 4, repsMin: 5, repsMax: 8, rest: 120, notes: 'Two bells racked at the shoulders. Elbows high, sit between your knees, drive up through the heels.' },
          { name: 'Double Kettlebell Press',   sets: 4, repsMin: 5,  repsMax: 8,  rest: 120, notes: 'Both bells pressed together from the rack. Brace hard, ribs down, straight bar path overhead.' },
          { name: 'Kettlebell Swing (Single-Arm)', sets: 5, repsMin: 10, repsMax: 10, rest: 75, notes: 'Per side. Same hip-snap as the two-hand swing, one hand on the bell. Switch hands between sets.' },
          { name: 'Kettlebell Renegade Row',   sets: 3, repsMin: 6,  repsMax: 8,  rest: 90, notes: 'Per side, from a plank over two bells. Row one side while the other braces hard against the floor.' },
          { name: 'Kettlebell Windmill (Low)', sets: 2, repsMin: 5,  repsMax: 5,  rest: 60, notes: 'Per side. Bell locked out overhead, hinge sideways towards the opposite foot. Eyes stay on the bell.' },
        ],
      },
      {
        name: 'Day B',
        exercises: [
          { name: 'Kettlebell Clean',          sets: 5, repsMin: 5,  repsMax: 5,  rest: 90, notes: 'Per side. Bell travels close to the body into the rack. A banged wrist means it swung out too wide.' },
          { name: 'Kettlebell Single-Leg Deadlift', sets: 3, repsMin: 6, repsMax: 8, rest: 90, notes: 'Per side. Hinge on one leg, hips stay square. Slow and controlled, this is a balance lift too.' },
          { name: 'Half-Kneeling Kettlebell Press', sets: 3, repsMin: 6, repsMax: 10, rest: 90, notes: 'Per side. Half-kneeling stance, back knee down. Press overhead without leaning towards the bell.' },
          { name: 'Gorilla Row',                sets: 4, repsMin: 8,  repsMax: 12, rest: 75, notes: 'Two bells on the floor. Row one side at a time, hips back, back flat throughout.' },
          { name: 'Kettlebell Rack Carry',      sets: 3, repsMin: 20, repsMax: 40, rest: 60, notes: 'Around 40 metres. Bell held in the rack position, elbow tucked, tall posture.' },
        ],
      },
      {
        name: 'Day C',
        exercises: [
          { name: 'Kettlebell Snatch',         sets: 5, repsMin: 5,  repsMax: 5,  rest: 120, notes: 'Per side. Hike, snap the hips, then punch the hand through so the bell lands soft on your wrist.' },
          { name: 'Kettlebell Thruster (Double)', sets: 3, repsMin: 6, repsMax: 8, rest: 120, notes: 'Front squat straight into an overhead press in one motion. Use the leg drive to help the bells up.' },
          { name: 'Turkish Get-Up',            sets: 3, repsMin: 2,  repsMax: 2,  rest: 90, notes: 'Per side. The full get-up, floor to standing and back down. Slow, deliberate, eyes on the bell.' },
          { name: 'Double Kettlebell Swing',   sets: 4, repsMin: 8,  repsMax: 12, rest: 75, notes: 'Two bells, same hip-snap as the single swing. Keep both bells travelling together.' },
          { name: 'Kettlebell Overhead Carry', sets: 3, repsMin: 20, repsMax: 30, rest: 60, notes: 'Per side, around 30 metres. Bell locked out overhead, ribs down, arm stacked over the shoulder.' },
        ],
      },
    ],
  },

  // ── 33. Kettlebell Strength, 4 Days ──────────────────────────────────────
  {
    name: 'Kettlebell Strength: 4 Days',
    description: 'A four-day double-kettlebell plan for experienced kettlebell training: an upper day, a lower day, a full-body grind day, and a dedicated ballistic day. Grind lifts progress by reps then bell size. Ballistic lifts (clean, snatch, jerk, swing) progress by reps within their set count, then bell size, never by speed. Around 40 to 45 minutes a session.',
    tags: 'style:kettlebell_experienced equipment:kettlebell kettlebell home upper_lower intermediate advanced goal:build_muscle days:4',
    difficulty: 2,
    workouts: [
      {
        name: 'Day 1: Upper',
        exercises: [
          { name: 'Double Kettlebell Press',   sets: 4, repsMin: 5,  repsMax: 8,  rest: 120, notes: 'Both bells pressed together from the rack. Brace hard, ribs down, straight bar path overhead.' },
          { name: 'Half-Kneeling Kettlebell Press', sets: 3, repsMin: 6, repsMax: 10, rest: 90, notes: 'Per side. Half-kneeling stance. Press overhead without leaning towards the bell.' },
          { name: 'Gorilla Row',                sets: 4, repsMin: 8,  repsMax: 12, rest: 90, notes: 'Two bells on the floor. Row one side at a time, hips back, back flat throughout.' },
          { name: 'Kettlebell Renegade Row',   sets: 3, repsMin: 6,  repsMax: 8,  rest: 90, notes: 'Per side, from a plank over two bells. The still side braces hard against the floor.' },
          { name: 'Kettlebell Floor Press (Alternating)', sets: 3, repsMin: 8, repsMax: 12, rest: 75, notes: 'One bell presses while the other holds locked out. Swap which arm leads each set.' },
        ],
      },
      {
        name: 'Day 2: Lower',
        exercises: [
          { name: 'Kettlebell Front Rack Squat (Double)', sets: 4, repsMin: 5, repsMax: 8, rest: 120, notes: 'Two bells racked at the shoulders. Elbows high, sit between your knees.' },
          { name: 'Kettlebell Single-Leg Deadlift', sets: 3, repsMin: 6, repsMax: 8, rest: 90, notes: 'Per side. Hinge on one leg, hips stay square to the floor.' },
          { name: 'Kettlebell Sumo Deadlift',  sets: 3, repsMin: 8,  repsMax: 12, rest: 90, notes: 'Feet wide, toes out. Chest tall as you stand, knees track over toes.' },
          { name: 'Kettlebell Reverse Lunge (Rack Position)', sets: 3, repsMin: 8, repsMax: 10, rest: 75, notes: 'Per side. Bell racked at one shoulder. Step back under control.' },
          { name: 'Kettlebell Rack Carry',     sets: 3, repsMin: 20, repsMax: 40, rest: 60, notes: 'Around 40 metres. Bell held in the rack, elbow tucked, tall posture.' },
        ],
      },
      {
        name: 'Day 3: Full Body Grind',
        exercises: [
          { name: 'Turkish Get-Up',            sets: 3, repsMin: 2,  repsMax: 2,  rest: 90, notes: 'Per side. The full get-up, floor to standing and back down. Slow and deliberate.' },
          { name: 'Kettlebell Windmill (Low)', sets: 2, repsMin: 5,  repsMax: 5,  rest: 60, notes: 'Per side. Bell locked out overhead, hinge sideways towards the opposite foot.' },
          { name: 'Double Kettlebell Press',   sets: 3, repsMin: 6,  repsMax: 8,  rest: 90, notes: 'Lighter than Day 1’s top set. Both bells pressed together, brace hard.' },
          { name: 'Kettlebell Front Rack Squat (Single-Arm)', sets: 3, repsMin: 6, repsMax: 8, rest: 90, notes: 'Per side. One bell racked, brace hard against the offset load.' },
          { name: 'Kettlebell Overhead Carry', sets: 3, repsMin: 20, repsMax: 30, rest: 60, notes: 'Per side, around 30 metres. Bell locked out overhead, arm stacked over the shoulder.' },
        ],
      },
      {
        name: 'Day 4: Ballistic',
        exercises: [
          { name: 'Kettlebell Clean',          sets: 5, repsMin: 5,  repsMax: 5,  rest: 90,  notes: 'Per side. Bell travels close to the body into the rack.' },
          { name: 'Kettlebell Snatch',         sets: 5, repsMin: 5,  repsMax: 5,  rest: 120, notes: 'Per side. Hike, snap the hips, punch the hand through so the bell lands soft.' },
          { name: 'Kettlebell Jerk',           sets: 4, repsMin: 5,  repsMax: 5,  rest: 120, notes: 'Per side. Dip, drive, and punch under the bell to lock it out overhead.' },
          { name: 'Kettlebell Swing (Single-Arm)', sets: 5, repsMin: 10, repsMax: 10, rest: 75, notes: 'Per side. Same hip-snap as the two-hand swing, one hand on the bell.' },
          { name: "Kettlebell Farmer's Carry", sets: 3, repsMin: 20, repsMax: 40, rest: 60, notes: 'Around 40 metres. A hard grip finisher after the ballistic work.' },
        ],
      },
    ],
  },

  // ── 34. Kettlebell Minimal: 3 Days ───────────────────────────────────────
  {
    name: 'Kettlebell Minimal: 3 Days',
    description: 'A stripped-back, single-kettlebell session for when time is short. Three near-identical sessions a week, around 25 minutes each: a big set of swings, a handful of get-ups, and a set of goblet squats. Start with the two-hand swing; once your technique is solid and consistent, move to the single-arm swing (the pool this plan draws from includes it once you are ready). Progress the swing and squat by reps then bell size; the get-up progresses by moving to the full get-up once the half get-up feels easy.',
    tags: 'style:kettlebell_foundations equipment:kettlebell kettlebell home full_body beginner intermediate advanced goal:build_muscle days:3 short minimalist',
    difficulty: 1,
    workouts: [
      {
        name: 'Day A',
        exercises: [
          { name: 'Kettlebell Swing',          sets: 10, repsMin: 10, repsMax: 10, rest: 30, notes: 'Ten sets of ten with a fixed 30 second rest. Two hands to start; single-arm once technique is solid.' },
          { name: 'Turkish Get-Up (Half)',     sets: 5,  repsMin: 1,  repsMax: 1,  rest: 60, notes: 'Per side. Lying to standing on one knee and back down. Move on to the full get-up once this is easy.' },
          { name: 'Kettlebell Goblet Squat',   sets: 3,  repsMin: 10, repsMax: 10, rest: 60, notes: 'Bell at chest, elbows tucked. Sit deep between your knees.' },
        ],
      },
      {
        name: 'Day B',
        exercises: [
          { name: 'Kettlebell Swing',          sets: 10, repsMin: 10, repsMax: 10, rest: 30, notes: 'Ten sets of ten with a fixed 30 second rest. Two hands to start; single-arm once technique is solid.' },
          { name: 'Turkish Get-Up (Half)',     sets: 5,  repsMin: 1,  repsMax: 1,  rest: 60, notes: 'Per side. Lying to standing on one knee and back down.' },
          { name: 'Kettlebell Goblet Squat',   sets: 3,  repsMin: 10, repsMax: 10, rest: 60, notes: 'Bell at chest, elbows tucked. Sit deep between your knees.' },
        ],
      },
      {
        name: 'Day C',
        exercises: [
          { name: 'Kettlebell Swing',          sets: 10, repsMin: 10, repsMax: 10, rest: 30, notes: 'Ten sets of ten with a fixed 30 second rest. Two hands to start; single-arm once technique is solid.' },
          { name: 'Turkish Get-Up (Half)',     sets: 5,  repsMin: 1,  repsMax: 1,  rest: 60, notes: 'Per side. Lying to standing on one knee and back down.' },
          { name: 'Kettlebell Goblet Squat',   sets: 3,  repsMin: 10, repsMax: 10, rest: 60, notes: 'Bell at chest, elbows tucked. Sit deep between your knees.' },
        ],
      },
    ],
  },

  // ── 35. Full-Body Circuit: Dumbbells ──────────────────────────────────────
  {
    name: 'Full-Body Circuit: Dumbbells',
    description: 'Three sessions a week, each built from two circuits of three exercises. Do one round of each exercise in the circuit back to back, then rest before the next round. Three rounds per circuit, 8 to 12 reps a station. Progress rounds first: move from 3 rounds to 4, then 5, across the block before adding reps or weight. Around 35 minutes a session, dumbbells only.',
    tags: 'style:circuit_dumbbell circuit equipment:dumbbell home full_body goal:build_muscle days:3 short beginner intermediate',
    difficulty: 0,
    workouts: [
      {
        name: 'Session A',
        exercises: [
          { name: 'Goblet Squat', sets: 3, repsMin: 8, repsMax: 12, rest: 0, notes: 'Circuit 1, station 1. Move straight to the next station after your reps.', supersetGroupId: 'circuit1', groupKind: 'circuit', roundRestSeconds: 90 },
          { name: 'Push-Up',               sets: 3, repsMin: 8, repsMax: 12, rest: 0, notes: 'Circuit 1, station 2. Knees down is a fair regression, full range either way.', supersetGroupId: 'circuit1', groupKind: 'circuit', roundRestSeconds: 90 },
          { name: 'Dumbbell Row',          sets: 3, repsMin: 8, repsMax: 12, rest: 0, notes: 'Circuit 1, station 3. Rest 90 seconds after this station, then repeat the circuit.', supersetGroupId: 'circuit1', groupKind: 'circuit', roundRestSeconds: 90 },
          { name: 'Romanian Deadlift (Dumbbell)', sets: 3, repsMin: 8,  repsMax: 12, rest: 0, notes: 'Circuit 2, station 1. Soft knees, push the hips back, long hamstring stretch.', supersetGroupId: 'circuit2', groupKind: 'circuit', roundRestSeconds: 90 },
          { name: 'Dumbbell Shoulder Press',      sets: 3, repsMin: 8,  repsMax: 12, rest: 0, notes: 'Circuit 2, station 2. Seated or standing, full overhead range.', supersetGroupId: 'circuit2', groupKind: 'circuit', roundRestSeconds: 90 },
          { name: 'Dead Bug',                     sets: 3, repsMin: 8,  repsMax: 12, rest: 0, notes: 'Circuit 2, station 3, per side. Lower back stays flat on the floor throughout.', supersetGroupId: 'circuit2', groupKind: 'circuit', roundRestSeconds: 90 },
        ],
      },
      {
        name: 'Session B',
        exercises: [
          { name: 'Dumbbell Lunge',         sets: 3, repsMin: 8, repsMax: 12, rest: 0, notes: 'Circuit 1, station 1, per leg. Front knee tracks over the toes.', supersetGroupId: 'circuit1', groupKind: 'circuit', roundRestSeconds: 90 },
          { name: 'Floor Press (Dumbbell)', sets: 3, repsMin: 8, repsMax: 12, rest: 0, notes: 'Circuit 1, station 2. Lying on the floor, elbows lightly touch down between reps.', supersetGroupId: 'circuit1', groupKind: 'circuit', roundRestSeconds: 90 },
          { name: 'Dumbbell Hip Thrust',    sets: 3, repsMin: 8, repsMax: 12, rest: 0, notes: 'Circuit 1, station 3. Shoulders on a bench, drive hips up, squeeze at the top.', supersetGroupId: 'circuit1', groupKind: 'circuit', roundRestSeconds: 90 },
          { name: 'Dumbbell Lateral Raise', sets: 3, repsMin: 12, repsMax: 15, rest: 0, notes: 'Circuit 2, station 1. Light weight, raise to shoulder height, slow and controlled.', supersetGroupId: 'circuit2', groupKind: 'circuit', roundRestSeconds: 90 },
          { name: 'Dumbbell Curl',          sets: 3, repsMin: 10, repsMax: 12, rest: 0, notes: 'Circuit 2, station 2. Full range, no swinging the weight up.', supersetGroupId: 'circuit2', groupKind: 'circuit', roundRestSeconds: 90 },
          { name: 'Plank',                  sets: 3, repsMin: 20, repsMax: 30, rest: 0, notes: 'Circuit 2, station 3. Hold for the stated seconds. Straight line from shoulders to ankles.', supersetGroupId: 'circuit2', groupKind: 'circuit', roundRestSeconds: 90 },
        ],
      },
      {
        name: 'Session C',
        exercises: [
          { name: 'Bulgarian Split Squat',  sets: 3, repsMin: 8,  repsMax: 12, rest: 0, notes: 'Circuit 1, station 1, per leg. Rear foot on a chair or bench.', supersetGroupId: 'circuit1', groupKind: 'circuit', roundRestSeconds: 90 },
          { name: 'Push-Up',                sets: 3, repsMin: 8,  repsMax: 12, rest: 0, notes: 'Circuit 1, station 2. Full range every rep.', supersetGroupId: 'circuit1', groupKind: 'circuit', roundRestSeconds: 90 },
          { name: 'Dumbbell Row',           sets: 3, repsMin: 8,  repsMax: 12, rest: 0, notes: 'Circuit 1, station 3. Other arm from Session A, if you alternated.', supersetGroupId: 'circuit1', groupKind: 'circuit', roundRestSeconds: 90 },
          { name: 'Romanian Deadlift (Dumbbell)', sets: 3, repsMin: 8, repsMax: 12, rest: 0, notes: 'Circuit 2, station 1. Soft knees, push the hips back.', supersetGroupId: 'circuit2', groupKind: 'circuit', roundRestSeconds: 90 },
          { name: 'Dumbbell Overhead Tricep Extension', sets: 3, repsMin: 10, repsMax: 12, rest: 0, notes: 'Circuit 2, station 2. Elbows stay close to your ears throughout.', supersetGroupId: 'circuit2', groupKind: 'circuit', roundRestSeconds: 90 },
          { name: 'Side Plank',             sets: 3, repsMin: 20, repsMax: 30, rest: 0, notes: 'Circuit 2, station 3, per side. Hold for the stated seconds, hips lifted and still.', supersetGroupId: 'circuit2', groupKind: 'circuit', roundRestSeconds: 90 },
        ],
      },
    ],
  },

  // ── 36. Bodyweight Circuit ────────────────────────────────────────────────
  {
    name: 'Bodyweight Circuit',
    description: 'Three sessions a week, no equipment needed, built from two circuits of three exercises. Do one round of each exercise back to back, then rest before the next round. Three rounds per circuit, 8 to 15 reps a station. Progress rounds first: 3 to 4 to 5 across the block, before adding reps. The inverted row needs a low bar or a sturdy table edge; if you do not have one, use a Band Row instead. Around 30 minutes a session.',
    tags: 'style:circuit_bodyweight circuit equipment:bodyweight home full_body goal:build_muscle days:3 short beginner intermediate',
    difficulty: 0,
    workouts: [
      {
        name: 'Session A',
        exercises: [
          { name: 'Bodyweight Squat', sets: 3, repsMin: 12, repsMax: 20, rest: 0, notes: 'Circuit 1, station 1. Sit as deep as feels comfortable, drive through the heels.', supersetGroupId: 'circuit1', groupKind: 'circuit', roundRestSeconds: 90 },
          { name: 'Push-Up',         sets: 3, repsMin: 8,  repsMax: 15, rest: 0, notes: 'Circuit 1, station 2. Elevate your hands on a surface to make it easier.', supersetGroupId: 'circuit1', groupKind: 'circuit', roundRestSeconds: 90 },
          { name: 'Inverted Row',    sets: 3, repsMin: 8,  repsMax: 15, rest: 0, notes: 'Circuit 1, station 3. Needs a low bar or a table edge. No bar? Use a Band Row instead.', supersetGroupId: 'circuit1', groupKind: 'circuit', roundRestSeconds: 90 },
          { name: 'Glute Bridge',    sets: 3, repsMin: 12, repsMax: 20, rest: 0, notes: 'Circuit 2, station 1. Drive the hips up, squeeze the glutes hard at the top.', supersetGroupId: 'circuit2', groupKind: 'circuit', roundRestSeconds: 90 },
          { name: 'Dead Bug',        sets: 3, repsMin: 8,  repsMax: 12, rest: 0, notes: 'Circuit 2, station 2, per side. Lower back stays flat on the floor throughout.', supersetGroupId: 'circuit2', groupKind: 'circuit', roundRestSeconds: 90 },
          { name: 'Plank',           sets: 3, repsMin: 20, repsMax: 30, rest: 0, notes: 'Circuit 2, station 3. Hold for the stated seconds. Straight line from shoulders to ankles.', supersetGroupId: 'circuit2', groupKind: 'circuit', roundRestSeconds: 90 },
        ],
      },
      {
        name: 'Session B',
        exercises: [
          { name: 'Bodyweight Split Squat', sets: 3, repsMin: 8, repsMax: 15, rest: 0, notes: 'Circuit 1, station 1, per leg. Rear foot on a chair or a low step.', supersetGroupId: 'circuit1', groupKind: 'circuit', roundRestSeconds: 90 },
          { name: 'Push-Up',                sets: 3, repsMin: 8, repsMax: 15, rest: 0, notes: 'Circuit 1, station 2. Vary hand width to change the emphasis.', supersetGroupId: 'circuit1', groupKind: 'circuit', roundRestSeconds: 90 },
          { name: 'Inverted Row',           sets: 3, repsMin: 8, repsMax: 15, rest: 0, notes: 'Circuit 1, station 3. Needs a low bar or a table edge. No bar? Use a Band Row instead.', supersetGroupId: 'circuit1', groupKind: 'circuit', roundRestSeconds: 90 },
          { name: 'Glute Bridge',           sets: 3, repsMin: 12, repsMax: 20, rest: 0, notes: 'Circuit 2, station 1. Add a 2 second hold at the top today.', supersetGroupId: 'circuit2', groupKind: 'circuit', roundRestSeconds: 90 },
          { name: 'Dead Bug',               sets: 3, repsMin: 8, repsMax: 12, rest: 0, notes: 'Circuit 2, station 2, per side. Move slowly, no rushing the reps.', supersetGroupId: 'circuit2', groupKind: 'circuit', roundRestSeconds: 90 },
          { name: 'Side Plank',             sets: 3, repsMin: 20, repsMax: 30, rest: 0, notes: 'Circuit 2, station 3, per side. Hold for the stated seconds, hips lifted and still.', supersetGroupId: 'circuit2', groupKind: 'circuit', roundRestSeconds: 90 },
        ],
      },
      {
        name: 'Session C',
        exercises: [
          { name: 'Bodyweight Squat', sets: 3, repsMin: 12, repsMax: 20, rest: 0, notes: 'Circuit 1, station 1. Add a pause at the bottom if this feels easy.', supersetGroupId: 'circuit1', groupKind: 'circuit', roundRestSeconds: 90 },
          { name: 'Push-Up',         sets: 3, repsMin: 8,  repsMax: 15, rest: 0, notes: 'Circuit 1, station 2. Try a closer hand position for more tricep work.', supersetGroupId: 'circuit1', groupKind: 'circuit', roundRestSeconds: 90 },
          { name: 'Inverted Row',    sets: 3, repsMin: 8,  repsMax: 15, rest: 0, notes: 'Circuit 1, station 3. Needs a low bar or a table edge. No bar? Use a Band Row instead.', supersetGroupId: 'circuit1', groupKind: 'circuit', roundRestSeconds: 90 },
          { name: 'Box Step-Up',     sets: 3, repsMin: 8,  repsMax: 12, rest: 0, notes: 'Circuit 2, station 1, per leg. A box or a sturdy step. Drive through the stepping foot.', supersetGroupId: 'circuit2', groupKind: 'circuit', roundRestSeconds: 90 },
          { name: 'Dead Bug',        sets: 3, repsMin: 8,  repsMax: 12, rest: 0, notes: 'Circuit 2, station 2, per side. Lower back stays flat throughout.', supersetGroupId: 'circuit2', groupKind: 'circuit', roundRestSeconds: 90 },
          { name: 'Plank',           sets: 3, repsMin: 20, repsMax: 30, rest: 0, notes: 'Circuit 2, station 3. Hold for the stated seconds.', supersetGroupId: 'circuit2', groupKind: 'circuit', roundRestSeconds: 90 },
        ],
      },
    ],
  },

  // ── 37. Kettlebell Circuit ────────────────────────────────────────────────
  {
    name: 'Kettlebell Circuit',
    description: 'Three sessions a week for experienced kettlebell training, built from two circuits of three exercises. Each circuit carries at most one ballistic lift (swing, clean or snatch), so grinds do the rest of the work. Three rounds per circuit, 90 seconds rest after each round. Progress rounds first: 3 to 4 to 5 across the block, before adding reps or bell size. Around 35 minutes a session.',
    tags: 'style:kettlebell_experienced circuit equipment:kettlebell kettlebell home full_body intermediate advanced goal:build_muscle days:3',
    difficulty: 2,
    workouts: [
      {
        name: 'Session A',
        exercises: [
          { name: 'Kettlebell Goblet Squat',       sets: 3, repsMin: 8, repsMax: 10, rest: 0, notes: 'Circuit 1, station 1. Bell at chest, sit deep between your knees.', supersetGroupId: 'circuit1', groupKind: 'circuit', roundRestSeconds: 90 },
          { name: 'Kettlebell Row (Single-Arm)',   sets: 3, repsMin: 8, repsMax: 10, rest: 0, notes: 'Circuit 1, station 2, per side. Flat back, pull the elbow past your ribs.', supersetGroupId: 'circuit1', groupKind: 'circuit', roundRestSeconds: 90 },
          { name: 'Kettlebell Swing (Single-Arm)', sets: 3, repsMin: 8, repsMax: 10, rest: 0, notes: 'Circuit 1, station 3, per side, the one ballistic lift here. Hip-snap, not an arm swing.', supersetGroupId: 'circuit1', groupKind: 'circuit', roundRestSeconds: 90 },
          { name: 'Kettlebell Press (Single-Arm)', sets: 3, repsMin: 6, repsMax: 8, rest: 0, notes: 'Circuit 2, station 1, per side. Bell racked, press straight overhead.', supersetGroupId: 'circuit2', groupKind: 'circuit', roundRestSeconds: 90 },
          { name: 'Kettlebell Deadlift',            sets: 3, repsMin: 8, repsMax: 10, rest: 0, notes: 'Circuit 2, station 2. Hinge with a flat back, bell close to your shins.', supersetGroupId: 'circuit2', groupKind: 'circuit', roundRestSeconds: 90 },
          { name: 'Kettlebell Halo',                sets: 3, repsMin: 6, repsMax: 6, rest: 0, notes: 'Circuit 2, station 3, each direction. No ballistic lift in this circuit.', supersetGroupId: 'circuit2', groupKind: 'circuit', roundRestSeconds: 90 },
        ],
      },
      {
        name: 'Session B',
        exercises: [
          { name: 'Kettlebell Front Rack Squat (Double)', sets: 3, repsMin: 6, repsMax: 8, rest: 0, notes: 'Circuit 1, station 1. Two bells racked, elbows high.', supersetGroupId: 'circuit1', groupKind: 'circuit', roundRestSeconds: 90 },
          { name: 'Kettlebell Renegade Row',       sets: 3, repsMin: 6, repsMax: 8, rest: 0, notes: 'Circuit 1, station 2, per side. Plank over two bells, the still side braces hard.', supersetGroupId: 'circuit1', groupKind: 'circuit', roundRestSeconds: 90 },
          { name: 'Kettlebell Clean',              sets: 3, repsMin: 6, repsMax: 8, rest: 0, notes: 'Circuit 1, station 3, per side, the one ballistic lift here. Bell stays close to the body.', supersetGroupId: 'circuit1', groupKind: 'circuit', roundRestSeconds: 90 },
          { name: 'Kettlebell Halo',               sets: 3, repsMin: 6, repsMax: 6, rest: 0, notes: 'Circuit 2, station 1, each direction. No ballistic lift in this circuit.', supersetGroupId: 'circuit2', groupKind: 'circuit', roundRestSeconds: 90 },
          { name: 'Kettlebell Suitcase Carry',     sets: 3, repsMin: 20, repsMax: 30, rest: 0, notes: 'Circuit 2, station 2, per side, around 30 metres. Resist leaning away from the load.', supersetGroupId: 'circuit2', groupKind: 'circuit', roundRestSeconds: 90 },
          { name: 'Turkish Get-Up (Half)',         sets: 3, repsMin: 2, repsMax: 2, rest: 0, notes: 'Circuit 2, station 3, per side. Lying to standing on one knee and back down.', supersetGroupId: 'circuit2', groupKind: 'circuit', roundRestSeconds: 90 },
        ],
      },
      {
        name: 'Session C',
        exercises: [
          { name: 'Kettlebell Sumo Deadlift',      sets: 3, repsMin: 8, repsMax: 10, rest: 0, notes: 'Circuit 1, station 1. Feet wide, toes out, chest tall as you stand.', supersetGroupId: 'circuit1', groupKind: 'circuit', roundRestSeconds: 90 },
          { name: 'Kettlebell Floor Press',        sets: 3, repsMin: 8, repsMax: 10, rest: 0, notes: 'Circuit 1, station 2. Elbows lightly touch down between reps.', supersetGroupId: 'circuit1', groupKind: 'circuit', roundRestSeconds: 90 },
          { name: 'Kettlebell Snatch',             sets: 3, repsMin: 5, repsMax: 5, rest: 0, notes: 'Circuit 1, station 3, per side, the one ballistic lift here. Hike, snap, punch through.', supersetGroupId: 'circuit1', groupKind: 'circuit', roundRestSeconds: 90 },
          { name: 'Kettlebell Windmill (Low)',     sets: 3, repsMin: 5, repsMax: 5, rest: 0, notes: 'Circuit 2, station 1, per side. No ballistic lift in this circuit.', supersetGroupId: 'circuit2', groupKind: 'circuit', roundRestSeconds: 90 },
          { name: 'Kettlebell Rack Carry',         sets: 3, repsMin: 20, repsMax: 40, rest: 0, notes: 'Circuit 2, station 2, around 40 metres. Elbow tucked, tall posture.', supersetGroupId: 'circuit2', groupKind: 'circuit', roundRestSeconds: 90 },
          { name: 'Gorilla Row',                   sets: 3, repsMin: 8, repsMax: 10, rest: 0, notes: 'Circuit 2, station 3. Two bells on the floor, row one side at a time.', supersetGroupId: 'circuit2', groupKind: 'circuit', roundRestSeconds: 90 },
        ],
      },
    ],
  },
];
// F-16: appended after the literal so the source-slicing library-data guard
// (seedRoutinesLibraryData.test.js) keeps evaluating the literal alone.
LIBRARY_PLANS.push(...BAND_LIBRARY_PLANS);

// ─── Seed function ────────────────────────────────────────────────────────────

export async function seedRoutinesIfNeeded(userId) {
  if (!userId) return;

  // One try/catch spans the whole of this function, so until now a throw
  // anywhere in roughly a hundred lines reported as the same context-free
  // Sentry event (VOLYUME-30). That is why two stray commas in LIBRARY_PLANS
  // needed a reproduction rather than a reading. `stage` and `stageDetail`
  // travel with the work so the report names where it stopped and on which
  // row. They are diagnostics only: nothing below reads them to decide
  // anything, so the seeding behaviour is unchanged.
  let stage = 'readMarker';
  let stageDetail = null;

  try {
    const alreadySeeded = await AsyncStorage.getItem(SEED_KEY);

    // Self-healing check: if the marker is set but the database actually has
    // no library plans (e.g. a prior seed crashed mid-way, or the DB was
    // wiped via Clear data), clear the marker and proceed with a fresh seed.
    // If the marker is set AND plans exist, we're done, skip seeding.
    if (alreadySeeded) {
      const existingLibrary = await getLibraryPlans().catch(() => []);
      if (existingLibrary.length > 0) {
        // Healthy, unless an earlier run left template exercises unresolved:
        // then repair once the exercise chain has finished.
        const incomplete = await AsyncStorage.getItem(INCOMPLETE_KEY).catch(() => null);
        if (incomplete === '1') {
          stage = 'repair';
          await exercisesReady();
          const all = await getAllExercises();
          const lookup = {};
          for (const ex of all) lookup[ex.name] = ex;
          const res = await repairLibraryPlans(LIBRARY_PLANS, existingLibrary, lookup);
          if (res.added > 0) logInfo('seedRoutines.repaired', `Added ${res.added} missing exercises to library plans`);
          if (res.stillMissing === 0) await AsyncStorage.removeItem(INCOMPLETE_KEY).catch(() => {});
        }
        return;
      }
      // Marker set but DB empty, clear marker so the seed below actually runs.
      await AsyncStorage.removeItem(SEED_KEY).catch(() => {});
      logWarn('seedRoutines.reseed', 'Marker was set but no library plans found. Re-seeding.');
    }

    stage = 'loadExercises';
    // The corpus top-up must have finished before a single template name is
    // resolved (VOLYUME-28): a name that is not in the table yet is not a
    // missing exercise, it is a race.
    await exercisesReady();
    const existing = await getAllExercises();
    const byName = {};
    for (const ex of existing) {
      byName[ex.name] = ex;
    }

    // Look up which library plans already exist by name so a SEED_KEY bump
    // only adds new plans rather than duplicating the entire library. Names
    // are the natural dedupe key: plan IDs are random UUIDs that change on
    // every seed, and there's no upsert path through createProgramme.
    stage = 'readLibrary';
    stageDetail = null;
    const existingLibrary = await getLibraryPlans().catch(() => []);
    const existingNames = new Set(existingLibrary.map(p => p.name));

    // Create library plans we haven't seeded yet
    stage = 'createPlans';
    let missing = 0;
    for (let planIndex = 0; planIndex < LIBRARY_PLANS.length; planIndex++) {
      const plan = LIBRARY_PLANS[planIndex];
      // Index as well as name: a hole yields undefined here, so the name is
      // exactly what is unavailable in the case this instrumentation exists
      // for. The index still says which row.
      stageDetail = `plan ${planIndex}: ${plan?.name ?? '(missing)'}`;
      if (existingNames.has(plan.name)) continue;
      const programme = await createProgramme(
        userId,
        plan.name,
        plan.description,
        1,                         // is_library = 1
        plan.tags || null,
        plan.splitType || null,
        plan.difficulty ?? null,
      );

      for (const workoutDef of plan.workouts) {
        stageDetail = `plan ${planIndex}: ${plan.name} / ${workoutDef?.name ?? '(missing)'}`;
        const routine = await createRoutine(
          userId,
          workoutDef.name,
          workoutDef.description || null,
          null,
          1,              // isLibrary
          null,
          programme.id,
          true,           // isSample
        );

        for (let i = 0; i < workoutDef.exercises.length; i++) {
          const def = workoutDef.exercises[i];
          const exercise = byName[def.name];
          if (!exercise) {
            missing += 1;
            logWarn('seedRoutines.exerciseNotFound', `exercise not found: ${def.name}`);
            continue;
          }
          await addTemplateExercise(routine.id, exercise, def, i);
        }
      }
    }

    // Plans that already existed may have been created by an earlier run
    // that raced the corpus top-up: fill their gaps now.
    stage = 'repair';
    stageDetail = null;
    const repaired = await repairLibraryPlans(LIBRARY_PLANS, existingLibrary, byName);
    if (repaired.added > 0) logInfo('seedRoutines.repaired', `Added ${repaired.added} missing exercises to library plans`);

    stage = 'setMarker';
    stageDetail = null;
    await AsyncStorage.setItem(SEED_KEY, '1');
    if (missing > 0 || repaired.stillMissing > 0) {
      // Remember the gap so the next launch repairs it once the chain has run.
      await AsyncStorage.setItem(INCOMPLETE_KEY, '1').catch(() => {});
      logWarn('seedRoutines.incomplete', `${missing + repaired.stillMissing} template exercises unresolved; will repair on a later launch`);
    } else {
      await AsyncStorage.removeItem(INCOMPLETE_KEY).catch(() => {});
    }
    logInfo('seedRoutines.created', `Created ${LIBRARY_PLANS.length} library plans`);
  } catch (err) {
    logError('seedRoutines.seedRoutinesIfNeeded', err, { stage, stageDetail });
  }
}
