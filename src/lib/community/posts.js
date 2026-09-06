/**
 * Training-story payload builders (blueprint section 5.5; SD-06).
 *
 * A post is generated from data the user really logged, never
 * auto-posted, and carries ONLY the keys `POST_PAYLOAD_KEYS` names for
 * its kind. Every builder here returns exactly that shape, and
 * `validatePostPayload` refuses anything else before the write leaves
 * the device.
 *
 * The shaping is pure; the reads are the app's own local reads. Nothing
 * derives a new number: the session figures come from
 * `summariseWorkoutSets` and the `sessionShareData` helpers, which are
 * the same functions the share card uses, so a story and a share card of
 * the same session can never disagree.
 *
 * Weights appear on a PR post because a lift is training performance the
 * user chose to share (SD-04). Bodyweight, body composition, food and
 * every coaching output do not appear anywhere, in any kind.
 */

import {
  getWorkoutById, getWorkoutSetsForWorkout, getWorkoutSetsForExercise,
  getRoutineById, getProgrammeById, getAllExercises,
  getAllMesocyclesForUser, getBlockTrainingData, getPriorCompletedSets,
} from '../database';
import { summariseWorkoutSets, detectPR, calculate1RM } from '../algorithms';
import { topSetFromExerciseData, intensityTier, shareSessionName } from '../sessionShareData';
import { pickBestLift } from '../bestLift';
import { logError } from '../errorLog';
import { POST_PAYLOAD_KEYS } from './validation';

const MAX_SESSION_EXERCISES = 8;
const MAX_BLOCK_LIFTS = 3;
const MAX_MILESTONE_STATS = 3;
const PRIOR_WINDOW_MS = 365 * 24 * 60 * 60 * 1000;

function unitsFromStore() {
  try {
    // eslint-disable-next-line global-require
    const u = require('../../store/useAppStore').default.getState().units;
    return u === 'lbs' ? 'lbs' : 'kg';
  } catch (_e) {
    return 'kg';
  }
}

/** Keep only the allow-listed keys, dropping anything undefined. The
 * belt to `validatePostPayload`'s braces: a builder cannot leak a key by
 * accident because the payload is rebuilt from the list. */
function pick(kind, source) {
  const out = {};
  for (const key of POST_PAYLOAD_KEYS[kind] ?? []) {
    if (source[key] !== undefined) out[key] = source[key];
  }
  return out;
}

function round(value, dp = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/**
 * A personal record. PURE.
 *
 * @param {{exerciseName: string, weight: number, reps: number,
 *   units?: string, previousBest?: number|null, date?: number|null}} input
 * @returns {object} a `pr` payload
 */
export function buildPrPayload({
  exerciseName, weight, reps, units, previousBest = null, date = null,
} = {}) {
  return pick('pr', {
    exerciseName: exerciseName ? String(exerciseName) : null,
    weight: round(weight, 2),
    reps: round(reps),
    units: units === 'lbs' ? 'lbs' : 'kg',
    previousBest: previousBest == null ? null : round(previousBest, 2),
    date: date == null ? null : Number(date),
  });
}

/**
 * A finished session, read from the device.
 *
 * @param {string} workoutId
 * @param {{userId?: string, units?: string, prCount?: number}} [opts]
 *   `prCount` is passed by the surfaces that already detected the
 *   session's PRs (the summary screen holds them); when it is absent the
 *   count is derived here with the same `detectPR` those surfaces use,
 *   so the two can never differ.
 * @returns {Promise<object|null>} a `session` payload, or null when the
 *   workout is gone
 */
export async function buildSessionPayload(workoutId, { userId = null, units = null, prCount = null } = {}) {
  const workout = await getWorkoutById(workoutId);
  if (!workout?.id) return null;
  const sets = await getWorkoutSetsForWorkout(workoutId);
  const library = await getAllExercises().catch(() => []);
  const byId = new Map((library ?? []).map((e) => [e.id, e]));

  const exerciseTypeById = {};
  const loadSemanticsById = {};
  for (const ex of library ?? []) {
    exerciseTypeById[ex.id] = ex.exerciseType ?? ex.exercise_type ?? 'weight_reps';
    loadSemanticsById[ex.id] = ex.loadSemantics ?? ex.load_semantics ?? 'total';
  }

  const { workingSetCount, tonnage } = summariseWorkoutSets(sets, { exerciseTypeById, loadSemanticsById });

  // Group the session's sets by exercise, in the order they were logged,
  // for the share helpers.
  const order = [];
  const byExercise = new Map();
  for (const s of sets ?? []) {
    const id = s.exerciseId ?? s.exercise_id ?? null;
    const name = byId.get(id)?.name ?? s.exerciseName ?? s.exercise_name ?? 'Exercise';
    if (!byExercise.has(name)) { byExercise.set(name, { name, loggedSets: [] }); order.push(name); }
    byExercise.get(name).loggedSets.push({
      weight: s.weight, reps: s.actualReps ?? s.actual_reps,
      setType: s.setType ?? s.set_type, evidenceClass: s.evidenceClass ?? s.evidence_class,
    });
  }
  const exerciseData = order.map((n) => byExercise.get(n));
  const exerciseNames = order.slice(0, MAX_SESSION_EXERCISES);

  let routineName = workout.name ?? null;
  let planName = null;
  try {
    if (workout.routineId) {
      const routine = await getRoutineById(workout.routineId);
      routineName = routineName || routine?.name || null;
      if (routine?.programmeId) planName = (await getProgrammeById(routine.programmeId))?.name ?? null;
    }
  } catch (e) { logError('Community.buildSessionPayload', e, { step: 'plan_name' }); }

  let prs = Number.isFinite(Number(prCount)) ? Number(prCount) : null;
  if (prs == null) prs = await countSessionPRs(workout, sets, byId, userId ?? workout.userId, units).catch(() => 0);

  const unitsOut = units === 'lbs' ? 'lbs' : (units === 'kg' ? 'kg' : unitsFromStore());
  return pick('session', {
    sessionName: shareSessionName(routineName, order),
    workingSets: workingSetCount ?? 0,
    duration: workout.durationMinutes ?? 0,
    tonnage: round(tonnage) ?? 0,
    exerciseCount: order.length,
    exercises: exerciseNames,
    prCount: prs ?? 0,
    topSet: topSetFromExerciseData(exerciseData),
    intensityTier: intensityTier(prs ?? 0, tonnage ?? 0, workingSetCount ?? 0),
    units: unitsOut,
    planName,
    date: workout.startedAt ?? workout.createdAt ?? null,
  });
}

/**
 * Count this session's PRs with the canonical detector, against the
 * exercise's history BEFORE this workout. Best effort: a read failure
 * means no badge, never a failed post.
 */
async function countSessionPRs(workout, sets, byId, userId, units) {
  if (!userId) return 0;
  const historyByExercise = new Map();
  let count = 0;
  for (const s of sets ?? []) {
    const id = s.exerciseId ?? s.exercise_id ?? null;
    if (!id) continue;
    if (!historyByExercise.has(id)) {
      // eslint-disable-next-line no-await-in-loop
      const rows = await getWorkoutSetsForExercise(id, userId).catch(() => []);
      historyByExercise.set(id, (rows ?? []).filter((r) => (r.workoutId ?? r.workout_id) !== workout.id));
    }
    const prs = detectPR(s, historyByExercise.get(id) ?? [], byId.get(id) ?? null, units === 'lbs' ? 'lbs' : 'kg');
    if (prs?.length) count += 1;
  }
  return count;
}

/**
 * A completed block.
 *
 * `lifts` is composed by calling `pickBestLift` up to three times, each
 * time over the sets of the exercises not already picked. Ranking is
 * therefore the app's existing ranking (biggest genuine e1RM gain), not
 * a second one written here. A block with no gain over a prior best
 * yields an empty list rather than a fabricated one.
 *
 * @param {string} mesocycleId
 * @param {{userId?: string, units?: string}} [opts]
 * @returns {Promise<object|null>} a `block` payload
 */
export async function buildBlockPayload(mesocycleId, { userId = null, units = null } = {}) {
  if (!userId) return null;
  const mesos = await getAllMesocyclesForUser(userId);
  const meso = (mesos ?? []).find((m) => m.id === mesocycleId) ?? null;
  if (!meso) return null;

  const weeks = Number(meso.plannedWeeks ?? meso.durationWeeks ?? 0) || 0;
  const training = await getBlockTrainingData(userId, mesocycleId);
  const completed = training?.fullyCompletedWorkouts ?? training?.workouts ?? [];
  const sessions = completed.length;

  const startMs = meso.startDate ? new Date(meso.startDate).getTime() : null;
  const endMs = meso.endDate ? new Date(meso.endDate).getTime() : null;
  const lastSession = completed.reduce((max, w) => Math.max(max, Number(w.started_at ?? w.startedAt ?? 0)), 0);
  const completedAt = Number.isFinite(endMs) && endMs ? endMs : (lastSession || null);

  let lifts = [];
  try {
    lifts = await bestLiftsForBlock(userId, training, startMs);
  } catch (e) {
    logError('Community.buildBlockPayload', e, { step: 'lifts' });
    lifts = [];
  }
  const unitsOut = units === 'lbs' ? 'lbs' : (units === 'kg' ? 'kg' : unitsFromStore());

  return pick('block', {
    planName: meso.name ?? null,
    weeks,
    sessions,
    sessionsPerWeek: weeks > 0 ? round(sessions / weeks, 1) : null,
    completedAt,
    lifts: lifts.map((l) => ({ exerciseName: l.exerciseName, deltaKg: l.deltaKg, units: unitsOut })),
  });
}

async function bestLiftsForBlock(userId, training, startMs) {
  const rows = (training?.sets ?? []).map((s) => ({
    exerciseId: s.exercise_id ?? s.exerciseId,
    exerciseName: s.exercise_name ?? s.exerciseName ?? 'Lift',
    weight: s.weight,
    reps: s.actual_reps ?? s.actualReps,
    evidenceClass: s.evidence_class ?? s.evidenceClass ?? null,
    setType: s.set_type ?? s.setType ?? 'straight',
  })).filter((s) => s.exerciseId && (s.setType !== 'warmup') && Number(s.weight) > 0);
  if (!rows.length || !Number.isFinite(startMs)) return [];

  const priorRows = await getPriorCompletedSets(userId, startMs, startMs - PRIOR_WINDOW_MS).catch(() => []);
  const priorByEx = new Map();
  for (const r of priorRows ?? []) {
    const id = r.exercise_id ?? r.exerciseId;
    if (!id || !(Number(r.weight) > 0)) continue;
    if ((r.set_type ?? r.setType) === 'warmup') continue;
    const e = calculate1RM(r.weight, r.actual_reps ?? r.actualReps);
    if (!(e > (priorByEx.get(id) ?? 0))) continue;
    priorByEx.set(id, e);
  }

  const out = [];
  const used = new Set();
  for (let i = 0; i < MAX_BLOCK_LIFTS; i += 1) {
    const pool = rows.filter((s) => !used.has(s.exerciseId));
    if (!pool.length) break;
    const pick1 = pickBestLift(pool, priorByEx);
    // Only a genuine gain over a prior best is worth telling someone
    // about. The heaviest-set fallback is a card hero, not a delta.
    if (!pick1 || !(Number(pick1.gainKg) > 0)) break;
    const id = pool.find((s) => s.exerciseName === pick1.exerciseName)?.exerciseId ?? null;
    if (id) used.add(id);
    out.push({ exerciseName: pick1.exerciseName, deltaKg: round(pick1.gainKg, 1) });
    if (!id) break;
  }
  return out;
}

/**
 * A consistency milestone, shaped from an existing recap object
 * (`buildRecapMilestoneData` and friends). PURE. Stats are capped at
 * three and reduced to label/value pairs so nothing else rides along.
 *
 * @param {object} recap
 * @returns {object} a `milestone` payload
 */
export function buildMilestonePayload(recap = {}) {
  const stats = (Array.isArray(recap.stats) ? recap.stats : [])
    .slice(0, MAX_MILESTONE_STATS)
    .map((s) => ({
      label: s?.label == null ? null : String(s.label),
      value: s?.value == null ? null : String(s.value),
    }));
  return pick('milestone', {
    eyebrow: recap.eyebrow == null ? null : String(recap.eyebrow),
    title: recap.title == null ? null : String(recap.title),
    heroValue: recap.heroValue == null ? null : String(recap.heroValue),
    heroUnit: recap.heroUnit == null ? null : String(recap.heroUnit),
    caption: recap.caption == null ? null : String(recap.caption),
    stats,
  });
}

/**
 * A published programme, for the "programme" story kind. PURE.
 *
 * @param {object} programmeRow a `community_programmes` row
 * @returns {object} a `programme` payload
 */
export function buildProgrammePayload(programmeRow = {}) {
  return pick('programme', {
    id: programmeRow.id ?? null,
    title: programmeRow.title == null ? null : String(programmeRow.title),
    style_key: programmeRow.style_key ?? programmeRow.styleKey ?? null,
    days_per_week: round(programmeRow.days_per_week ?? programmeRow.daysPerWeek),
    exercise_count: round(programmeRow.exercise_count ?? programmeRow.exerciseCount),
  });
}
