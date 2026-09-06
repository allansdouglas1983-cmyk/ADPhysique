/**
 * What this suite pins (blueprint section 5.4; SD-08):
 *
 *  - "Adapt for me" NEVER changes what the creator built. Circuit
 *    groups, rounds, round rest, day order and day count survive both
 *    the import and the adaptation. Day-count re-mapping does not exist
 *    in the engine and must not be invented here: a mismatch is
 *    DISCLOSED, not fixed;
 *  - every change carries a reason, and no change is produced without
 *    one. A row that is reachable, eligible and unconflicted produces
 *    nothing at all;
 *  - the three reasons resolve in the right order: a limitation outranks
 *    a kit gap, which outranks a preference exclusion;
 *  - when there is no alternative, the creator's own choice is KEPT and
 *    said so, never dropped;
 *  - the substitution is written through `updateRoutineExerciseExercise`,
 *    the same call every swap makes, so the load is cleared and the
 *    prescription is re-derived rather than inherited.
 *
 * The pure half drives `planAdaptation` with an injected context. The
 * write half runs against the REAL database module on in-memory SQLite.
 */

jest.mock('../../dbCrypto', () => {
  const { DatabaseSync } = require('node:sqlite');
  const raw = new DatabaseSync(':memory:');
  const adapt = {
    execAsync: async (sql) => raw.exec(sql),
    getAllAsync: async (sql, params = []) => raw.prepare(sql).all(...params),
    getFirstAsync: async (sql, params = []) => raw.prepare(sql).get(...params) ?? null,
    runAsync: async (sql, params = []) => {
      const r = raw.prepare(sql).run(...params);
      return { changes: Number(r.changes ?? 0), lastInsertRowId: Number(r.lastInsertRowid ?? 0) };
    },
    withTransactionAsync: async (fn) => fn(),
    isInTransactionSync: () => false,
    closeAsync: async () => {},
  };
  return { openEncryptedDb: async () => ({ db: adapt, encrypted: true }), __raw: raw };
});
jest.mock('expo-sqlite');
jest.mock('../../sync', () => ({ scheduleSync: () => {} }));

const { db, _invalidateExercisesCache } = require('../../database');
const { canonicalExerciseId } = require('../../exercise/canonicalId');
const { planAdaptation, applyAdaptation, ADAPT_REASON } = require('../adapt');

const U = 'recipient-adapt-1';

// A small library: two kettlebell movements the recipient can reach, one
// barbell movement they cannot, and one alternative for the same muscle.
const LIB = [
  {
    id: canonicalExerciseId('Kettlebell Goblet Squat'),
    name: 'Kettlebell Goblet Squat',
    primaryMuscle: 'quads',
    equipmentCategory: 'kettlebell',
    compoundIsolation: 'compound',
    equipmentProfiles: ['home_gym', 'minimal_kit'],
  },
  {
    id: canonicalExerciseId('Kettlebell Front Squat'),
    name: 'Kettlebell Front Squat',
    primaryMuscle: 'quads',
    equipmentCategory: 'kettlebell',
    compoundIsolation: 'compound',
    equipmentProfiles: ['home_gym', 'minimal_kit'],
  },
  {
    id: canonicalExerciseId('Barbell Back Squat'),
    name: 'Barbell Back Squat',
    primaryMuscle: 'quads',
    equipmentCategory: 'barbell',
    compoundIsolation: 'compound',
    equipmentProfiles: ['full_gym'],
  },
  {
    id: canonicalExerciseId('Kettlebell Swing'),
    name: 'Kettlebell Swing',
    primaryMuscle: 'hamstrings',
    equipmentCategory: 'kettlebell',
    compoundIsolation: 'compound',
    equipmentProfiles: ['home_gym', 'minimal_kit'],
  },
];

const BY_ID = new Map(LIB.map((e) => [e.id, e]));

function ctx(overrides = {}) {
  return {
    library: LIB,
    byId: BY_ID,
    isEligibleRow: () => true,
    isCandidate: null,
    blockingConflictsFor: () => [],
    equipment: null,
    daysPerWeek: null,
    ...overrides,
  };
}

function row(name, extra = {}) {
  return {
    exercise_id: canonicalExerciseId(name),
    exercise_name: name,
    order: 0,
    sets: 3,
    reps_min: 8,
    reps_max: 12,
    rest_seconds: 0,
    notes: null,
    superset_group_id: null,
    group_kind: null,
    round_rest_seconds: null,
    ...extra,
  };
}

function snapshot(exercises, daysPerWeek = 1) {
  return {
    v: 1,
    title: 'Kettlebell Circuit',
    description: null,
    style_key: 'kettlebell_foundations',
    split_type: 'full_body',
    difficulty: 'beginner',
    days_per_week: daysPerWeek,
    days: [{ name: 'Circuit A', position: 0, exercises }],
  };
}

describe('planAdaptation (pure)', () => {
  test('a reachable, eligible, unconflicted plan produces NO changes', () => {
    const out = planAdaptation(snapshot([row('Kettlebell Goblet Squat')]), ctx());
    expect(out.changes).toEqual([]);
    expect(out.substitutions).toBe(0);
    expect(out.kept).toBe(0);
  });

  test('an exercise the recipient excluded is swapped, with reason "excluded"', () => {
    const excludedId = canonicalExerciseId('Kettlebell Goblet Squat');
    const out = planAdaptation(snapshot([row('Kettlebell Goblet Squat')]), ctx({
      isEligibleRow: (ex) => ex.id !== excludedId,
      // The real context scopes candidates to the creator's style pool
      // and the recipient's kit (substituteCandidateFilter); a kettlebell
      // programme must not be re-fitted with a barbell.
      isCandidate: (ex) => ex.equipmentCategory === 'kettlebell',
    }));
    expect(out.changes).toHaveLength(1);
    expect(out.changes[0].reason).toBe(ADAPT_REASON.EXCLUDED);
    expect(out.changes[0].to?.name).toBe('Kettlebell Front Squat');
    expect(out.changes[0].kept).toBe(false);
    expect(out.substitutions).toBe(1);
  });

  test('an exercise the recipient cannot reach is swapped, with reason "equipment"', () => {
    const out = planAdaptation(snapshot([row('Barbell Back Squat')]), ctx({
      equipment: 'minimal_kit',
    }));
    expect(out.changes).toHaveLength(1);
    expect(out.changes[0].reason).toBe(ADAPT_REASON.EQUIPMENT);
    expect(out.changes[0].from.name).toBe('Barbell Back Squat');
    expect(out.changes[0].to.name).toBe('Kettlebell Goblet Squat');
  });

  test('a definite limitation outranks a kit gap in the reason', () => {
    const out = planAdaptation(snapshot([row('Barbell Back Squat')]), ctx({
      equipment: 'minimal_kit',
      blockingConflictsFor: () => [{ constraintId: 'c1', unknown: false }],
    }));
    expect(out.changes[0].reason).toBe(ADAPT_REASON.LIMITATION);
  });

  test('an UNKNOWN conflict is not a conflict: the row is left alone', () => {
    const out = planAdaptation(snapshot([row('Kettlebell Goblet Squat')]), ctx({
      blockingConflictsFor: () => [{ constraintId: 'c1', unknown: true }],
    }));
    expect(out.changes).toEqual([]);
  });

  test('with no alternative the creator choice is KEPT and says why', () => {
    const out = planAdaptation(snapshot([row('Kettlebell Swing')]), ctx({
      isEligibleRow: () => false,
    }));
    expect(out.changes).toHaveLength(1);
    expect(out.changes[0].kept).toBe(true);
    expect(out.changes[0].to).toBeNull();
    expect(out.changes[0].reason).toBe(ADAPT_REASON.EXCLUDED);
    expect(out.kept).toBe(1);
  });

  test('an exercise this device has never heard of is kept, with its own reason', () => {
    const out = planAdaptation(
      snapshot([{ ...row('Sandbag Shouldering'), exercise_id: 'unknown-id' }]),
      ctx(),
    );
    expect(out.changes[0]).toMatchObject({
      reason: ADAPT_REASON.UNKNOWN_EXERCISE, kept: true, to: null, fromName: 'Sandbag Shouldering',
    });
  });

  test('no change is ever produced without a reason', () => {
    const out = planAdaptation(
      snapshot([
        row('Kettlebell Goblet Squat'),
        { ...row('Barbell Back Squat'), order: 1 },
        { ...row('Kettlebell Swing'), order: 2 },
      ]),
      ctx({ equipment: 'minimal_kit' }),
    );
    expect(out.changes.length).toBeGreaterThan(0);
    for (const change of out.changes) {
      expect(Object.values(ADAPT_REASON)).toContain(change.reason);
    }
  });

  test('two conflicted rows of one muscle never both become the same movement', () => {
    const out = planAdaptation(
      snapshot([
        { ...row('Barbell Back Squat'), order: 0 },
        { ...row('Barbell Back Squat'), order: 1 },
      ]),
      ctx({ equipment: 'minimal_kit' }),
    );
    const targets = out.changes.map((c) => c.to?.id ?? null);
    expect(new Set(targets.filter(Boolean)).size).toBe(targets.filter(Boolean).length);
  });

  test('a day-count mismatch is reported, never fixed', () => {
    const s = snapshot([row('Kettlebell Goblet Squat')], 4);
    const out = planAdaptation(s, ctx({ daysPerWeek: 3 }));
    expect(out.daysMismatch).toEqual({ snapshot: 4, yours: 3 });
    // The snapshot itself is untouched: the day count is still the
    // creator's, because nothing here re-maps days.
    expect(s.days_per_week).toBe(4);
    expect(s.days).toHaveLength(1);
  });

  test('an unreadable capability state proposes NOTHING and says so', () => {
    // CC33 census CLASS 1: an ACTION must never treat a failed read as
    // "this person has no restrictions". Adapt writes a plan, so it
    // holds rather than guessing.
    const out = planAdaptation(snapshot([row('Barbell Back Squat')]), ctx({
      equipment: 'minimal_kit', capabilityChecked: false, daysPerWeek: 3,
    }));
    expect(out.capabilityChecked).toBe(false);
    expect(out.changes).toEqual([]);
    expect(out.substitutions).toBe(0);
    // The day-count fact comes from the snapshot, not the failed read,
    // so it is still reported honestly.
    expect(out.daysMismatch).toEqual({ snapshot: 1, yours: 3 });
  });

  test('a readable state reports capabilityChecked true', () => {
    expect(planAdaptation(snapshot([row('Kettlebell Goblet Squat')]), ctx()).capabilityChecked)
      .toBe(true);
  });

  test('a matching day count reports no mismatch', () => {
    expect(planAdaptation(snapshot([row('Kettlebell Goblet Squat')], 3), ctx({ daysPerWeek: 3 })).daysMismatch)
      .toBeNull();
  });
});

describe('applyAdaptation (writes)', () => {
  let conn;

  beforeAll(async () => {
    conn = await db();
    const now = Date.now();
    for (const ex of LIB) {
      // eslint-disable-next-line no-await-in-loop
      await conn.runAsync(
        `INSERT INTO exercises (id, name, primary_muscle, equipment, equipment_category,
          compound_isolation, equipment_profiles, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [ex.id, ex.name, ex.primaryMuscle, ex.equipmentCategory, ex.equipmentCategory,
          ex.compoundIsolation, JSON.stringify(ex.equipmentProfiles), now, now],
      );
    }
    _invalidateExercisesCache();
  });

  test('a circuit survives import AND adaptation with rounds and round rest intact', async () => {
    const circuit = ['Kettlebell Goblet Squat', 'Barbell Back Squat', 'Kettlebell Swing']
      .map((name, i) => row(name, {
        order: i,
        superset_group_id: 'circuit1',
        group_kind: 'circuit',
        round_rest_seconds: 90,
        sets: 3,
      }));
    const s = snapshot(circuit);
    const plan = planAdaptation(s, ctx({ equipment: 'minimal_kit' }));
    // The barbell row is the only one the recipient cannot reach.
    expect(plan.changes).toHaveLength(1);
    expect(plan.changes[0].reason).toBe(ADAPT_REASON.EQUIPMENT);

    const out = await applyAdaptation(U, s, plan.changes, { communityId: 'prog-adapt' });
    expect(out.applied).toBe(1);
    expect(out.failed).toBe(0);

    const rows = await conn.getAllAsync(
      `SELECT re.exercise_name, re.superset_group_id, re.group_kind, re.round_rest_seconds,
              re.recommended_sets, re.starting_weight
         FROM routine_exercises re JOIN routines r ON r.id = re.routine_id
        WHERE r.programme_id = ? ORDER BY re.order_in_routine ASC`,
      [out.plan.id],
    );
    expect(rows).toHaveLength(3);
    for (const r of rows) {
      expect(r.superset_group_id).toBe('circuit1');
      expect(r.group_kind).toBe('circuit');
      expect(r.round_rest_seconds).toBe(90);
      expect(r.recommended_sets).toBe(3);
      // No load ever crosses users, and a swap clears it again.
      expect(r.starting_weight).toBeNull();
    }
    // The unreachable row really moved, and only that row.
    expect(rows.map((r) => r.exercise_name)).toEqual([
      'Kettlebell Goblet Squat', 'Kettlebell Front Squat', 'Kettlebell Swing',
    ]);
  });

  test('a kept change writes nothing and is counted as kept', async () => {
    const s = snapshot([row('Kettlebell Swing')]);
    const changes = [{
      day: 0, order: 0, from: BY_ID.get(canonicalExerciseId('Kettlebell Swing')),
      fromName: 'Kettlebell Swing', to: null, reason: ADAPT_REASON.EXCLUDED, kept: true,
    }];
    const out = await applyAdaptation(U, s, changes, { communityId: 'prog-kept' });
    expect(out.applied).toBe(0);
    expect(out.kept).toBe(1);
    const rows = await conn.getAllAsync(
      `SELECT re.exercise_name FROM routine_exercises re JOIN routines r ON r.id = re.routine_id
        WHERE r.programme_id = ?`,
      [out.plan.id],
    );
    expect(rows.map((r) => r.exercise_name)).toEqual(['Kettlebell Swing']);
  });

  test('an unchecked capability state imports the creator programme and substitutes nothing', async () => {
    const s2 = snapshot([row('Barbell Back Squat')]);
    const changes = [{
      day: 0,
      order: 0,
      from: BY_ID.get(canonicalExerciseId('Barbell Back Squat')),
      fromName: 'Barbell Back Squat',
      to: BY_ID.get(canonicalExerciseId('Kettlebell Goblet Squat')),
      reason: ADAPT_REASON.EQUIPMENT,
      kept: false,
    }];
    const out = await applyAdaptation(U, s2, changes, {
      communityId: 'prog-unchecked', capabilityChecked: false,
    });
    expect(out.applied).toBe(0);
    const rows = await conn.getAllAsync(
      `SELECT re.exercise_name FROM routine_exercises re JOIN routines r ON r.id = re.routine_id
        WHERE r.programme_id = ?`,
      [out.plan.id],
    );
    expect(rows.map((r) => r.exercise_name)).toEqual(['Barbell Back Squat']);
  });

  test('the adapted plan carries the creator style tag and community provenance', async () => {
    const s = snapshot([row('Kettlebell Goblet Squat')]);
    const out = await applyAdaptation(U, s, [], { communityId: 'prog-tags' });
    const plan = await conn.getFirstAsync(
      'SELECT tags, source_programme_id, is_active FROM programmes WHERE id = ?', [out.plan.id],
    );
    expect(plan.tags).toBe('style:kettlebell_foundations community');
    expect(plan.source_programme_id).toBe('community:prog-tags');
    expect(plan.is_active).toBeFalsy();
  });
});
