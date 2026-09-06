/**
 * What this suite pins (blueprint section 5.2; SD-07):
 *
 *  - a snapshot carries STRUCTURE and nothing else. The source rows in
 *    the fixture deliberately carry `starting_weight`, `selection_reason`
 *    and a `user_id`, and none of them may appear anywhere in the output,
 *    at any depth. `starting_weight` is the only load on a plan and
 *    `duplicateRoutine` copies it, so the export path is where that has
 *    to stop;
 *  - the three circuit columns survive: `superset_group_id`,
 *    `group_kind` and `round_rest_seconds`, plus `sets` which IS the
 *    round count (`circuitRound.js`: rounds are read from the group's
 *    first station);
 *  - the style key travels, because style lives ONLY in `programmes.tags`
 *    and a shared kettlebell programme that arrived without it would
 *    quietly stop being one;
 *  - the caps refuse rather than truncate.
 */

const {
  buildProgrammeSnapshot, validateSnapshot, snapshotStats, snapshotTags, SNAPSHOT_VERSION,
} = require('../snapshot');
const { SENSITIVE_COMMUNITY_KEYS } = require('../validation');
const { SNAPSHOT_MAX_DAYS, SNAPSHOT_MAX_EXERCISES_PER_DAY } = require('../limits');

const TAGS = 'circuit style:circuit_dumbbell full_body days:3 goal:build_muscle';

function station(i, name, extra = {}) {
  return {
    routineExercise: {
      id: `re_${i}`,
      userId: 'creator-1',
      exerciseId: `ex-${i}`,
      exerciseName: name,
      orderInRoutine: i,
      recommendedSets: 3,
      recommendedRepsMin: 8,
      recommendedRepsMax: 12,
      restSeconds: 0,
      notes: `Circuit 1, station ${i + 1}.`,
      supersetGroupId: 'circuit1',
      groupKind: 'circuit',
      roundRestSeconds: 90,
      // Deliberately present on the SOURCE. None of it may travel.
      startingWeight: 24,
      selectionReason: 'template',
      deletedAt: null,
      ...extra,
    },
    exercise: { id: `ex-${i}`, name },
  };
}

function fixture() {
  return {
    programme: {
      id: 'plan-1', userId: 'creator-1', name: 'Full-Body Circuit: Dumbbells',
      description: 'Three rounds.', tags: TAGS, splitType: 'full_body',
      difficulty: 'beginner', isActive: 1, folderId: 'f1',
    },
    routines: [{ id: 'rt-1', name: 'Circuit A', position: 0 }],
    exercisesByRoutine: {
      'rt-1': [
        station(0, 'Goblet Squat'),
        station(1, 'Push-Up'),
        station(2, 'Dumbbell Row'),
        {
          routineExercise: {
            id: 're_3', exerciseId: 'ex-3', exerciseName: 'Barbell Back Squat',
            orderInRoutine: 3, recommendedSets: 3, recommendedRepsMin: 5,
            recommendedRepsMax: 8, restSeconds: 120, notes: null,
            supersetGroupId: null, groupKind: null, roundRestSeconds: null,
            startingWeight: 100, selectionReason: 'engine',
          },
          exercise: { id: 'ex-3', name: 'Barbell Back Squat' },
        },
      ],
    },
  };
}

describe('buildProgrammeSnapshot', () => {
  test('no personal key appears anywhere in the snapshot', () => {
    const s = buildProgrammeSnapshot(fixture());
    const json = JSON.stringify(s);
    for (const key of SENSITIVE_COMMUNITY_KEYS) {
      expect(json).not.toContain(`"${key}"`);
    }
    // Named individually because these two are the ones the source rows
    // really carry, and a regression here is a privacy failure, not a
    // shape failure.
    expect(json).not.toContain('starting_weight');
    expect(json).not.toContain('startingWeight');
    expect(json).not.toContain('selection_reason');
    expect(json).not.toContain('selectionReason');
    expect(json).not.toContain('24');
    expect(validateSnapshot(s).ok).toBe(true);
  });

  test('the circuit group survives with its rounds and its round rest', () => {
    const s = buildProgrammeSnapshot(fixture());
    const stations = s.days[0].exercises.slice(0, 3);
    expect(stations).toHaveLength(3);
    for (const row of stations) {
      expect(row.superset_group_id).toBe('circuit1');
      expect(row.group_kind).toBe('circuit');
      expect(row.round_rest_seconds).toBe(90);
      // Rounds ARE recommended_sets, read from the first station.
      expect(row.sets).toBe(3);
    }
  });

  test('a straight-sets row keeps all three group fields null', () => {
    const s = buildProgrammeSnapshot(fixture());
    const row = s.days[0].exercises[3];
    expect(row.superset_group_id).toBeNull();
    expect(row.group_kind).toBeNull();
    expect(row.round_rest_seconds).toBeNull();
    expect(row.rest_seconds).toBe(120);
    expect(row.reps_min).toBe(5);
    expect(row.reps_max).toBe(8);
  });

  test('the style key travels', () => {
    const s = buildProgrammeSnapshot(fixture());
    expect(s.style_key).toBe('circuit_dumbbell');
    expect(s.split_type).toBe('full_body');
    expect(s.difficulty).toBe('beginner');
    expect(s.v).toBe(SNAPSHOT_VERSION);
    expect(s.days_per_week).toBe(1);
  });

  test('an exercise note is capped at 200 characters', () => {
    const f = fixture();
    f.exercisesByRoutine['rt-1'][0].routineExercise.notes = 'n'.repeat(400);
    const s = buildProgrammeSnapshot(f);
    expect(s.days[0].exercises[0].notes).toHaveLength(200);
  });
});

describe('snapshotTags', () => {
  test('writes the style token and the community token', () => {
    expect(snapshotTags({ style_key: 'circuit_dumbbell' })).toBe('style:circuit_dumbbell community');
  });

  test('a styleless programme still carries the community token', () => {
    expect(snapshotTags({ style_key: null })).toBe('community');
  });
});

describe('snapshotStats', () => {
  test('counts days, exercises and circuit groups', () => {
    const s = buildProgrammeSnapshot(fixture());
    expect(snapshotStats(s)).toEqual({
      days: 1, exercises: 4, hasCircuits: true, circuitGroups: 1,
    });
  });

  test('a plan with no groups reports no circuits', () => {
    expect(snapshotStats({ days: [{ exercises: [{ group_kind: null }] }] }))
      .toEqual({ days: 1, exercises: 1, hasCircuits: false, circuitGroups: 0 });
  });
});

describe('validateSnapshot', () => {
  test('refuses a payload carrying a forbidden key', () => {
    const s = buildProgrammeSnapshot(fixture());
    s.days[0].exercises[0].startingWeight = 60;
    expect(validateSnapshot(s).errors).toContain('forbidden_field');
  });

  test('refuses more than the day cap', () => {
    const days = Array.from({ length: SNAPSHOT_MAX_DAYS + 1 }, (_x, i) => ({
      name: `Day ${i}`, position: i, exercises: [{ exercise_name: 'Squat' }],
    }));
    const out = validateSnapshot({ v: 1, title: 'Too many', days, days_per_week: days.length });
    expect(out.ok).toBe(false);
    expect(out.errors).toContain('too_many_days');
  });

  test('refuses more than the per-day exercise cap', () => {
    const exercises = Array.from(
      { length: SNAPSHOT_MAX_EXERCISES_PER_DAY + 1 },
      (_x, i) => ({ exercise_name: `Lift ${i}` }),
    );
    const out = validateSnapshot({
      v: 1, title: 'Long day', days_per_week: 1, days: [{ name: 'A', position: 0, exercises }],
    });
    expect(out.errors).toContain('day_0_too_many_exercises');
  });

  test('refuses an unsupported version and a mismatched day count', () => {
    const out = validateSnapshot({ v: 2, title: 'x', days_per_week: 3, days: [{ exercises: [] }] });
    expect(out.errors).toEqual(expect.arrayContaining(['unsupported_version', 'days_per_week_mismatch']));
  });

  test('refuses a snapshot over the byte ceiling', () => {
    const s = buildProgrammeSnapshot(fixture());
    s.description = 'x'.repeat(70000);
    expect(validateSnapshot(s).errors).toContain('too_large');
  });
});
