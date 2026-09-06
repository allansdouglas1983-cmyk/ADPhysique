/**
 * Import a Community programme snapshot as one of the recipient's own
 * plans (blueprint section 5.3; SD-07).
 *
 * This is the "Use as-is" path. It writes through the SAME functions the
 * library-copy path uses (`createProgramme`, `createRoutine`,
 * `addExerciseToRoutine`), so every structural fact travels exactly as
 * `copyPlanFromLibrary` makes it travel and the circuit columns cannot
 * be forgotten here while they are remembered there.
 *
 * Two deliberate differences from `copyPlanFromLibrary`:
 *  1. `startingWeight` is passed as null, always. `duplicateRoutine`
 *     carries `re.startingWeight` (recon 05 section 3), which is
 *     harmless for library plans (always NULL) and a live hazard for a
 *     user-to-user share. There is no code path here that could read a
 *     load, because the snapshot has no field for one.
 *  2. `selectionReason` is null. It records why the engine picked a
 *     movement for a DIFFERENT athlete and means nothing here.
 *
 * The plan is created inactive and nothing is activated: a copy must
 * never disturb the running block.
 */

import {
  db, createProgramme, createRoutine, addExerciseToRoutine, getAllExercises,
  getProgrammeById, getRoutinesForPlan, getRoutineExercisesWithDetails,
} from '../database';
import { canonicalExerciseId } from '../exercise/canonicalId';
import { logError } from '../errorLog';
import { buildProgrammeSnapshot, snapshotTags } from './snapshot';

/** The provenance stamp written to `programmes.source_programme_id`. */
export function communitySourceId(communityId) {
  return `community:${communityId ?? ''}`;
}

/**
 * Read one of the user's own plans and build its snapshot.
 *
 * Lives here rather than in `snapshot.js` because that module is pure by
 * contract and this one is the programme domain's I/O half.
 *
 * @param {string} planId
 * @returns {Promise<object|null>} the snapshot, or null when the plan is gone
 */
export async function buildSnapshotForPlan(planId) {
  const programme = await getProgrammeById(planId);
  if (!programme?.id) return null;
  const routines = await getRoutinesForPlan(programme.id);
  const exercisesByRoutine = new Map();
  for (const routine of routines ?? []) {
    // eslint-disable-next-line no-await-in-loop
    const rows = await getRoutineExercisesWithDetails(routine.id).catch(() => []);
    exercisesByRoutine.set(routine.id, rows ?? []);
  }
  return buildProgrammeSnapshot({ programme, routines, exercisesByRoutine });
}

/**
 * Resolve one snapshot exercise against the recipient's local library.
 *
 * Order, and why: the snapshot's own id first (canonical ids are a hash
 * of the NAME, so the creator's id IS the recipient's id for any
 * exercise both devices know); then the canonical id of the name, which
 * recovers a row whose id was a custom or legacy one; then the honest
 * fallback, which writes the row with its name so it renders and marks
 * it unresolved so the user can re-link it. Aliases cannot help here:
 * they are local-only and never sync (EL-19).
 *
 * @returns {{id: string, resolved: boolean, name: (string|null)}}
 */
function resolveExercise(row, byId) {
  const name = typeof row?.exercise_name === 'string' ? row.exercise_name.trim() : '';
  const snapshotId = row?.exercise_id ?? null;
  if (snapshotId && byId.has(snapshotId)) return { id: snapshotId, resolved: true, name: name || null };
  if (name) {
    const canonical = canonicalExerciseId(name);
    if (byId.has(canonical)) return { id: canonical, resolved: true, name };
  }
  return { id: snapshotId ?? (name ? canonicalExerciseId(name) : null), resolved: false, name: name || null };
}

/**
 * Import a snapshot as a new plan for `userId`.
 *
 * @param {string} userId
 * @param {object} snapshot
 * @param {{communityId?: string, mode?: 'use'|'adapt'}} [opts]
 * @returns {Promise<{plan: object, unresolved: string[], rowsByDay: Array<Array<object>>}>}
 *   `rowsByDay[dayIndex][order]` is the written routine_exercise row, so
 *   `applyAdaptation` can address a row by day position and order without
 *   a second read. `unresolved` names the exercises the recipient's
 *   library did not have.
 */
export async function importSnapshotAsPlan(userId, snapshot, { communityId = null, mode = 'use' } = {}) {
  const days = Array.isArray(snapshot?.days) ? snapshot.days : [];
  const library = await getAllExercises();
  const byId = new Map((library ?? []).map((e) => [e.id, e]));
  const d = await db();

  const plan = await createProgramme(
    userId,
    snapshot?.title ?? 'Programme',
    snapshot?.description ?? null,
    0,
    snapshotTags(snapshot),
    snapshot?.split_type ?? null,
    snapshot?.difficulty ?? null,
  );
  await d.runAsync(
    'UPDATE programmes SET source_programme_id = ?, updated_at = ? WHERE id = ?',
    [communitySourceId(communityId), Date.now(), plan.id],
  );

  const unresolved = [];
  const rowsByDay = [];

  for (let i = 0; i < days.length; i += 1) {
    const day = days[i] ?? {};
    // eslint-disable-next-line no-await-in-loop
    const routine = await createRoutine(
      userId, day.name || `Day ${i + 1}`, null, snapshot?.split_type ?? null, 0, null, plan.id,
    );
    // Day ORDER is creator intent (SD-08) and position is what carries
    // it, so it is written explicitly rather than left to the append
    // default.
    // eslint-disable-next-line no-await-in-loop
    await d.runAsync(
      'UPDATE routines SET programme_id = ?, is_library = 0, is_template = 0, position = ?, updated_at = ? WHERE id = ?',
      [plan.id, i, Date.now(), routine.id],
    );

    const exercises = Array.isArray(day.exercises) ? day.exercises : [];
    const written = [];
    for (let j = 0; j < exercises.length; j += 1) {
      const row = exercises[j];
      const target = resolveExercise(row, byId);
      if (!target.id) continue;
      if (!target.resolved && target.name) unresolved.push(target.name);
      // eslint-disable-next-line no-await-in-loop
      const created = await addExerciseToRoutine(
        routine.id,
        target.id,
        row?.order ?? j,
        row?.reps_min ?? 6,
        row?.reps_max ?? 12,
        row?.notes ?? null,
        row?.sets ?? 3,
        null, // startingWeight: never crosses users (recon 05 section 5)
        row?.rest_seconds ?? null,
        row?.superset_group_id ?? null,
        true,
        null, // selectionReason: the creator's engine reason, not the recipient's
        row?.group_kind ?? null,
        row?.round_rest_seconds ?? null,
      );
      if (!target.resolved && target.name) {
        // addExerciseToRoutine denormalises the name from the local
        // exercises table, which is empty for a row the recipient does
        // not have. Write it explicitly so the LEFT JOIN fallback in
        // getRoutineExercisesWithDetails renders the lift by name and
        // flags it for re-linking, instead of a blank slot.
        // eslint-disable-next-line no-await-in-loop
        await d.runAsync(
          'UPDATE routine_exercises SET exercise_name = ?, updated_at = ? WHERE id = ?',
          [target.name, Date.now(), created.id],
        ).catch((e) => logError('Community.importSnapshotAsPlan', e, { step: 'exercise_name' }));
      }
      written.push({ ...created, order: row?.order ?? j, resolved: target.resolved });
    }
    rowsByDay.push(written);
  }

  return {
    plan: { ...plan, sourceProgrammeId: communitySourceId(communityId), mode },
    unresolved,
    rowsByDay,
  };
}
