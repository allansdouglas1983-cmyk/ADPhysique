/**
 * Programme snapshots: the structural export a shared programme travels
 * as (blueprint section 5.2; SD-07).
 *
 * PURE. No database, no store, no clock.
 *
 * What travels is CREATOR INTENT: days in order, exercises in order,
 * sets (which is also the round count for a circuit), rep range, rest,
 * the creator's own exercise notes, and the three group columns that
 * make a circuit a circuit (`superset_group_id`, `group_kind`,
 * `round_rest_seconds`). Recon 05 section 5 is the dividing line and
 * this module holds it: `starting_weight` and `selection_reason` are
 * PERSONAL and are never read here, so they cannot be exported by
 * accident. Every other personal column is not read either.
 *
 * The reason `starting_weight` matters more than it looks: it is the
 * only load on a plan, and `duplicateRoutine` copies it. A user-to-user
 * share that reused that path would put one person's working weight in
 * front of another, which is both a privacy failure and, on a
 * body-adjacent product, an ED-safety one. Snapshots exist so that
 * cannot happen: there is no field for it.
 */

import { styleKeyFromTags } from '../exercise/stylePools';
import {
  EXERCISE_NOTE_MAX, PROGRAMME_TITLE_MAX, PROGRAMME_DESCRIPTION_MAX,
  hasForbiddenKeys,
} from './validation';
import {
  SNAPSHOT_MAX_BYTES, SNAPSHOT_MAX_DAYS, SNAPSHOT_MAX_EXERCISES_PER_DAY,
} from './limits';

export const SNAPSHOT_VERSION = 1;

/** The tag written on an imported plan alongside the style key, so a
 * plan that arrived from Community is identifiable in its own tags. */
export const COMMUNITY_TAG = 'community';

function cap(value, max) {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  if (!t) return null;
  return t.length > max ? t.slice(0, max).trim() : t;
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function intOrNull(value) {
  const n = num(value);
  return n == null ? null : Math.trunc(n);
}

/**
 * Build the snapshot for one plan.
 *
 * @param {{
 *   programme: object,
 *   routines: Array<object>,
 *   exercisesByRoutine: (Map<string, Array>|object)
 * }} input `routines` in day order; `exercisesByRoutine` maps a routine
 *   id to the rows `getRoutineExercisesWithDetails` returns
 *   (`{routineExercise, exercise}`), in `order_in_routine` order.
 * @returns {object} the snapshot
 */
export function buildProgrammeSnapshot({ programme, routines, exercisesByRoutine } = {}) {
  const p = programme ?? {};
  const list = Array.isArray(routines) ? routines : [];
  const readRows = (routineId) => {
    if (!exercisesByRoutine) return [];
    if (exercisesByRoutine instanceof Map) return exercisesByRoutine.get(routineId) ?? [];
    return exercisesByRoutine[routineId] ?? [];
  };

  const days = list.map((routine, index) => ({
    name: cap(routine?.name, PROGRAMME_TITLE_MAX) ?? `Day ${index + 1}`,
    position: routine?.position == null ? index : Number(routine.position),
    exercises: (readRows(routine?.id) ?? []).map((row, order) => {
      // Tolerate both the joined shape and a flat row: the joined shape
      // is what the reader returns, the flat one is what a test fixture
      // or a future caller most naturally builds.
      const re = row?.routineExercise ?? row ?? {};
      const ex = row?.exercise ?? null;
      return {
        exercise_id: re.exerciseId ?? re.exercise_id ?? ex?.id ?? null,
        exercise_name: ex?.name ?? re.exerciseName ?? re.exercise_name ?? null,
        order: re.orderInRoutine ?? re.order_in_routine ?? order,
        sets: intOrNull(re.recommendedSets ?? re.recommended_sets),
        reps_min: intOrNull(re.recommendedRepsMin ?? re.recommended_reps_min),
        reps_max: intOrNull(re.recommendedRepsMax ?? re.recommended_reps_max),
        rest_seconds: intOrNull(re.restSeconds ?? re.rest_seconds),
        notes: cap(re.notes, EXERCISE_NOTE_MAX),
        superset_group_id: re.supersetGroupId ?? re.superset_group_id ?? null,
        group_kind: re.groupKind ?? re.group_kind ?? null,
        round_rest_seconds: intOrNull(re.roundRestSeconds ?? re.round_rest_seconds),
      };
    }),
  }));

  return {
    v: SNAPSHOT_VERSION,
    title: cap(p.name ?? p.title, PROGRAMME_TITLE_MAX) ?? 'Programme',
    description: cap(p.description, PROGRAMME_DESCRIPTION_MAX),
    style_key: styleKeyFromTags(p.tags ?? null),
    split_type: cap(p.splitType ?? p.split_type, 40),
    difficulty: cap(p.difficulty, 40),
    days_per_week: days.length,
    days,
  };
}

/**
 * Check one snapshot before it is published or imported.
 *
 * @param {object} s
 * @returns {{ok: boolean, errors: string[]}}
 */
export function validateSnapshot(s) {
  const errors = [];
  if (!s || typeof s !== 'object' || Array.isArray(s)) return { ok: false, errors: ['not_an_object'] };
  if (s.v !== SNAPSHOT_VERSION) errors.push('unsupported_version');
  if (typeof s.title !== 'string' || !s.title.trim()) errors.push('missing_title');
  else if (s.title.length > PROGRAMME_TITLE_MAX) errors.push('title_too_long');
  if (s.description != null && String(s.description).length > PROGRAMME_DESCRIPTION_MAX) {
    errors.push('description_too_long');
  }
  if (!Array.isArray(s.days)) errors.push('missing_days');
  else {
    if (s.days.length === 0) errors.push('no_days');
    if (s.days.length > SNAPSHOT_MAX_DAYS) errors.push('too_many_days');
    if (s.days_per_week !== s.days.length) errors.push('days_per_week_mismatch');
    s.days.forEach((day, i) => {
      if (!day || typeof day !== 'object') { errors.push(`day_${i}_invalid`); return; }
      if (!Array.isArray(day.exercises)) { errors.push(`day_${i}_missing_exercises`); return; }
      if (day.exercises.length > SNAPSHOT_MAX_EXERCISES_PER_DAY) errors.push(`day_${i}_too_many_exercises`);
      day.exercises.forEach((ex, j) => {
        if (!ex || typeof ex !== 'object') { errors.push(`day_${i}_ex_${j}_invalid`); return; }
        if (!ex.exercise_id && !ex.exercise_name) errors.push(`day_${i}_ex_${j}_unidentified`);
        if (ex.notes != null && String(ex.notes).length > EXERCISE_NOTE_MAX) {
          errors.push(`day_${i}_ex_${j}_notes_too_long`);
        }
      });
    });
  }
  // The refusal list, recursively. A snapshot is structure; a personal
  // key anywhere in it is a defect, not a field to drop quietly.
  if (hasForbiddenKeys(s)) errors.push('forbidden_field');
  let bytes = 0;
  try {
    bytes = JSON.stringify(s).length;
  } catch (_e) {
    errors.push('not_serialisable');
  }
  if (bytes > SNAPSHOT_MAX_BYTES) errors.push('too_large');
  return { ok: errors.length === 0, errors };
}

/**
 * Counts for the programme tile and the publish preview.
 *
 * @param {object} s
 * @returns {{days: number, exercises: number, hasCircuits: boolean, circuitGroups: number}}
 */
export function snapshotStats(s) {
  const days = Array.isArray(s?.days) ? s.days : [];
  let exercises = 0;
  const circuitIds = new Set();
  for (const day of days) {
    const rows = Array.isArray(day?.exercises) ? day.exercises : [];
    exercises += rows.length;
    for (const row of rows) {
      if (row?.group_kind === 'circuit' && row?.superset_group_id) {
        circuitIds.add(`${day?.position ?? ''}:${row.superset_group_id}`);
      }
    }
  }
  return {
    days: days.length,
    exercises,
    hasCircuits: circuitIds.size > 0,
    circuitGroups: circuitIds.size,
  };
}

/**
 * The `programmes.tags` string to write when this snapshot is imported.
 *
 * The style token is load-bearing, not decoration: recon 05 section 1.3
 * records that training style lives ONLY in `programmes.tags`, and
 * `copyPlanFromLibrary`'s own P0 comment records what happens without
 * it ("a kettlebell or circuit plan's swap pool, 'Adjust plan'
 * constraint and style swap-cause all died on activation"). A shared
 * kettlebell programme that landed without `style:` would quietly stop
 * being a kettlebell programme.
 *
 * @param {object} s
 * @returns {string}
 */
export function snapshotTags(s) {
  const tokens = [];
  const key = typeof s?.style_key === 'string' ? s.style_key.trim() : '';
  if (key) tokens.push(`style:${key}`);
  tokens.push(COMMUNITY_TAG);
  return tokens.join(' ');
}
