/**
 * "Adapt for me": re-fit a shared programme to the recipient without
 * changing what the creator built (blueprint section 5.4; SD-08).
 *
 * NO new engine code and NO randomness. `planAdaptation` composes the
 * same four answers the capability plan-rewrite lane already composes
 * (`sessionEffective.js:704`), in the same order, through the same
 * exported functions:
 *
 *   1. `blockingConflicts`, filtered to definite conflicts, so the
 *      document is never rewritten on an UNKNOWN conflict;
 *   2. `equipmentReachable`, THE shared equipment predicate;
 *   3. `substituteSeniorQuestion` (preference eligibility AND capability),
 *      injected as `isEligibleRow`;
 *   4. `bestEligibleSubstitute` over the creator's style pool and the
 *      recipient's kit (`substituteCandidateFilter`, injected as
 *      `isCandidate`).
 *
 * What it never touches, per SD-08: `superset_group_id`, `group_kind`,
 * `round_rest_seconds`, day order and day count. A circuit stays a
 * circuit with its rounds and its round rest. A day-count mismatch is
 * DISCLOSED, never fixed: no day-count re-mapping exists in the engine
 * (recon 05 section 4.2), and inventing one here would rewrite creator
 * intent under the word "adapt".
 *
 * Every change carries a reason. A change with no reason is not
 * produced: `planAdaptation` only pushes an entry when at least one of
 * the three questions answered against the exercise.
 *
 * CC33 census CLASS 1 (`capabilityCensus.guard.test.js`): this lane
 * ACTS. It writes a plan. So an UNREADABLE capability state must never
 * be treated as "this person has no restrictions" - that is precisely
 * the failure that guard exists to stop. `loadAdaptationContext` asks
 * `capabilityKnown`, and when the answer is no, `planAdaptation`
 * proposes NOTHING and says `capabilityChecked: false`. Adapting on a
 * state the app could not read could serve a movement the user's own
 * rules block, which is worse than asking them to try again in a
 * moment. The original programme is untouched either way.
 */

import { canonicalExerciseId } from '../exercise/canonicalId';
import { equipmentReachable } from '../planAutoGen';
import { bestEligibleSubstitute } from '../capability/effective';
import { blockingConflicts, capabilityKnown, loadCapabilityResolveState } from '../capability/resolve';
import {
  substituteSeniorQuestion, loadScopedIntentState, loadSubstituteScope,
} from '../sessionEffective';
import { getAllExercises, updateRoutineExerciseExercise, recordExerciseSwap } from '../database';
import { SWAP_SCOPE } from '../exercise/swapScope';
import { logError } from '../errorLog';
import { snapshotTags } from './snapshot';
import { importSnapshotAsPlan } from './importProgramme';

/** The reasons a row can change, most serious first. The order IS the
 * precedence: a limitation outranks a kit gap, which outranks a
 * preference exclusion. */
export const ADAPT_REASON = Object.freeze({
  LIMITATION: 'limitation',
  EQUIPMENT: 'equipment',
  EXCLUDED: 'excluded',
  UNKNOWN_EXERCISE: 'unknown_exercise',
});

/**
 * Plan the adaptation. PURE: every answer is injected.
 *
 * @param {object} snapshot
 * @param {{
 *   library: Array<object>,
 *   byId: Map<string, object>,
 *   isEligibleRow: (ex: object) => boolean,
 *   isCandidate: ((ex: object) => boolean)|null,
 *   blockingConflictsFor: (ex: object) => Array<{unknown?: boolean}>,
 *   equipment: string|null,
 *   daysPerWeek?: number|null,
 *   capabilityChecked?: boolean
 * }} ctx
 * @returns {{
 *   changes: Array<{day: number, order: number, from: object|null,
 *     fromName: string|null, to: object|null, reason: string, kept: boolean}>,
 *   substitutions: number, kept: number,
 *   daysMismatch: ({snapshot: number, yours: number}|null),
 *   capabilityChecked: boolean
 * }}
 */
export function planAdaptation(snapshot, ctx = {}) {
  const {
    library = [], byId = new Map(), isEligibleRow = () => true,
    isCandidate = null, blockingConflictsFor = () => [], equipment = null,
    daysPerWeek = null, capabilityChecked = true,
  } = ctx;

  const days = Array.isArray(snapshot?.days) ? snapshot.days : [];
  if (capabilityChecked === false) {
    // CLASS 1: an unreadable capability state is NOT "no restrictions".
    // Nothing is proposed and the screen says so; the day-count fact is
    // still honest because it comes from the snapshot, not the reader.
    const theirDays = Number(snapshot?.days_per_week ?? days.length);
    const myDays = Number(ctx.daysPerWeek);
    return {
      changes: [],
      substitutions: 0,
      kept: 0,
      daysMismatch: Number.isFinite(myDays) && myDays > 0
        && Number.isFinite(theirDays) && theirDays !== myDays
        ? { snapshot: theirDays, yours: myDays }
        : null,
      capabilityChecked: false,
    };
  }
  const changes = [];
  let substitutions = 0;
  let kept = 0;

  days.forEach((day, dayIndex) => {
    const rows = Array.isArray(day?.exercises) ? day.exercises : [];
    // Taken ids are tracked PER DAY, seeded with the day's own rows, so
    // two conflicted rows of one muscle can never both be rewritten to
    // the same movement (the defect R5-8 records in the rewrite lane).
    const taken = new Set();
    for (const row of rows) {
      const resolved = row?.exercise_id ? byId.get(row.exercise_id) : null;
      const byName = resolved || (row?.exercise_name ? byId.get(canonicalExerciseId(row.exercise_name)) : null);
      if (byName?.id) taken.add(byName.id);
    }

    rows.forEach((row, index) => {
      const order = row?.order ?? index;
      const name = typeof row?.exercise_name === 'string' ? row.exercise_name : null;
      const exercise = (row?.exercise_id ? byId.get(row.exercise_id) : null)
        ?? (name ? byId.get(canonicalExerciseId(name)) : null)
        ?? null;

      if (!exercise) {
        // The recipient's library does not have this movement, so there
        // is nothing to judge it against and nothing honest to say
        // beyond that. It is kept, by name, exactly as the creator wrote
        // it.
        changes.push({
          day: dayIndex, order, from: null, fromName: name, to: null,
          reason: ADAPT_REASON.UNKNOWN_EXERCISE, kept: true,
        });
        kept += 1;
        return;
      }

      const conflicts = (blockingConflictsFor(exercise) ?? []).filter((c) => !c?.unknown);
      const reachable = equipmentReachable(exercise, equipment);
      const eligible = isEligibleRow(exercise);
      if (!conflicts.length && reachable && eligible) return; // nothing to say

      let reason = ADAPT_REASON.EXCLUDED;
      if (conflicts.length) reason = ADAPT_REASON.LIMITATION;
      else if (!reachable) reason = ADAPT_REASON.EQUIPMENT;

      const sub = bestEligibleSubstitute(exercise, library, isEligibleRow, taken, isCandidate);
      if (sub?.id) {
        taken.add(sub.id);
        substitutions += 1;
      } else {
        kept += 1;
      }
      changes.push({
        day: dayIndex, order, from: exercise, fromName: name ?? exercise.name ?? null,
        to: sub ?? null, reason, kept: !sub,
      });
    });
  });

  const yours = Number(daysPerWeek);
  const theirs = Number(snapshot?.days_per_week ?? days.length);
  const daysMismatch = Number.isFinite(yours) && yours > 0 && Number.isFinite(theirs) && theirs !== yours
    ? { snapshot: theirs, yours }
    : null;

  return { changes, substitutions, kept, daysMismatch, capabilityChecked };
}

/**
 * Build the context `planAdaptation` needs from the recipient's own
 * device. I/O; every read fails open the way the lane it mirrors fails
 * open, so a failure leaves the recipient with an unadapted copy rather
 * than a plan with nothing in it.
 *
 * `planTags` is the SNAPSHOT's tags, not the recipient's: the candidate
 * scope is the CREATOR'S STYLE and the RECIPIENT'S KIT (recon 05
 * section 4.1 step 2), which is the whole shape of "preserve intent,
 * re-fit the person".
 *
 * @param {string} userId
 * @param {object} snapshot
 * @returns {Promise<object>} the ctx object
 */
export async function loadAdaptationContext(userId, snapshot) {
  let equipment = null;
  let daysPerWeek = null;
  try {
    // eslint-disable-next-line global-require
    const profile = require('../../store/useAppStore').default.getState().userProfile ?? null;
    equipment = profile?.equipment ?? null;
    daysPerWeek = profile?.daysPerWeek ?? null;
  } catch (_e) { /* best effort: no equipment or day-count claim */ }

  const [capState, intentState, library, isCandidate] = await Promise.all([
    loadCapabilityResolveState(userId, {}),
    loadScopedIntentState(userId),
    getAllExercises(),
    loadSubstituteScope(userId, { planTags: snapshotTags(snapshot), equipment }),
  ]);

  return {
    library: library ?? [],
    byId: new Map((library ?? []).map((e) => [e.id, e])),
    isEligibleRow: substituteSeniorQuestion(capState, intentState),
    isCandidate,
    blockingConflictsFor: (ex) => blockingConflicts(capState, ex),
    equipment,
    daysPerWeek,
    // CC33 census CLASS 1. A successful read, the no-user empty state and
    // a stale-but-known snapshot are all knowledge; only unknown-empty
    // (the read failed with nothing known) is not.
    capabilityChecked: capabilityKnown(capState),
  };
}

/**
 * Save an adaptation: import the snapshot as-is, then move each
 * substituted row onto its replacement.
 *
 * The move goes through `updateRoutineExerciseExercise`, which is the
 * same call every swap in the app makes: it re-derives the rep range and
 * rest for the new movement's tier and clears `starting_weight`. The
 * swap is recorded with PROGRAMME scope so provenance reads the same as
 * any other deliberate swap.
 *
 * Best effort per row: one failed write never abandons the rest, and the
 * unswapped row is still the creator's own choice, not a hole.
 *
 * @param {string} userId
 * @param {object} snapshot
 * @param {Array<object>} changes from `planAdaptation`
 * @param {{communityId?: string}} [opts]
 * @returns {Promise<{plan: object, applied: number, kept: number,
 *   failed: number, unresolved: string[]}>}
 */
export async function applyAdaptation(
  userId, snapshot, changes = [], { communityId = null, capabilityChecked = true } = {},
) {
  // CLASS 1 again, at the write. A caller that somehow holds changes from
  // an unchecked state imports the programme as the creator built it and
  // substitutes nothing.
  const accepted = capabilityChecked === false ? [] : changes;
  const imported = await importSnapshotAsPlan(userId, snapshot, { communityId, mode: 'adapt' });
  let applied = 0;
  let failed = 0;
  let kept = 0;

  for (const change of Array.isArray(accepted) ? accepted : []) {
    if (!change?.to?.id) { kept += 1; continue; }
    const dayRows = imported.rowsByDay?.[change.day] ?? [];
    const target = dayRows.find((r) => r?.order === change.order) ?? null;
    if (!target?.id) { failed += 1; continue; }
    try {
      // eslint-disable-next-line no-await-in-loop
      await updateRoutineExerciseExercise(target.id, change.to.id);
      // eslint-disable-next-line no-await-in-loop
      await recordExerciseSwap(userId, change.from?.id ?? null, change.to.id, {
        routineId: target.routineId ?? null,
        explicit: true,
        scope: SWAP_SCOPE.PROGRAMME,
      }).catch(() => { /* provenance is additive; a failure never blocks the swap */ });
      applied += 1;
    } catch (e) {
      failed += 1;
      logError('Community.applyAdaptation', e, { day: change.day, order: change.order });
    }
  }

  return {
    plan: imported.plan, applied, kept, failed, unresolved: imported.unresolved,
  };
}
