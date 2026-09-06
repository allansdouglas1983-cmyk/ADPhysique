/**
 * What this suite pins (blueprint sections 5.3, 10; SD-07):
 *
 *  - every structural fact reaches the recipient's plan: tags (so the
 *    style key survives and the swap pool, "Adjust plan" constraint and
 *    style swap-cause keep working), split type, difficulty, day order,
 *    rep ranges, rest, notes, and the three circuit columns;
 *  - `starting_weight` is NULL on EVERY imported row. It is the only
 *    load on a plan, and `duplicateRoutine` copies it, so a user-to-user
 *    share that reused that path would put one person's working weight
 *    in front of another;
 *  - an exercise the recipient's library does not have still lands, by
 *    name, and is reported in `unresolved` so the user can re-link it.
 *
 * Runs against the REAL database module on a real in-memory SQLite, the
 * same harness as `copyPlanFromLibrary.structure.test.js`.
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
const { importSnapshotAsPlan, communitySourceId } = require('../importProgramme');

const U = 'recipient-1';

const KNOWN = ['Goblet Squat', 'Push-Up', 'Dumbbell Row', 'Barbell Back Squat'];

function snapshot() {
  return {
    v: 1,
    title: 'Full-Body Circuit: Dumbbells',
    description: 'Three rounds.',
    style_key: 'circuit_dumbbell',
    split_type: 'full_body',
    difficulty: 'beginner',
    days_per_week: 2,
    days: [
      {
        name: 'Circuit A',
        position: 0,
        exercises: [
          ...['Goblet Squat', 'Push-Up', 'Dumbbell Row'].map((name, i) => ({
            exercise_id: canonicalExerciseId(name),
            exercise_name: name,
            order: i,
            sets: 3,
            reps_min: 8,
            reps_max: 12,
            rest_seconds: 0,
            notes: `Circuit 1, station ${i + 1}.`,
            superset_group_id: 'circuit1',
            group_kind: 'circuit',
            round_rest_seconds: 90,
          })),
          {
            exercise_id: canonicalExerciseId('Barbell Back Squat'),
            exercise_name: 'Barbell Back Squat',
            order: 3,
            sets: 3,
            reps_min: 5,
            reps_max: 8,
            rest_seconds: 120,
            notes: null,
            superset_group_id: null,
            group_kind: null,
            round_rest_seconds: null,
          },
        ],
      },
      {
        name: 'Day Two',
        position: 1,
        exercises: [{
          // A movement this device has never heard of: the creator's own
          // custom exercise. It must still land, by name.
          exercise_id: 'not-a-local-id',
          exercise_name: 'Sandbag Shouldering',
          order: 0,
          sets: 4,
          reps_min: 5,
          reps_max: 5,
          rest_seconds: 150,
          notes: 'Alternate shoulders.',
          superset_group_id: null,
          group_kind: null,
          round_rest_seconds: null,
        }],
      },
    ],
  };
}

let conn;
let result;

beforeAll(async () => {
  conn = await db();
  const now = Date.now();
  for (const name of KNOWN) {
    // eslint-disable-next-line no-await-in-loop
    await conn.runAsync(
      `INSERT INTO exercises (id, name, primary_muscle, equipment, equipment_category,
        compound_isolation, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [canonicalExerciseId(name), name, 'quads', 'dumbbell', 'dumbbell', 'compound', now, now],
    );
  }
  _invalidateExercisesCache();
  result = await importSnapshotAsPlan(U, snapshot(), { communityId: 'prog-9', mode: 'use' });
});

test('the plan lands with the creator tags, split and difficulty, and community provenance', async () => {
  const plan = await conn.getFirstAsync('SELECT * FROM programmes WHERE id = ?', [result.plan.id]);
  expect(plan.user_id).toBe(U);
  expect(plan.name).toBe('Full-Body Circuit: Dumbbells');
  expect(plan.tags).toBe('style:circuit_dumbbell community');
  expect(plan.split_type).toBe('full_body');
  expect(plan.difficulty).toBe('beginner');
  expect(plan.source_programme_id).toBe(communitySourceId('prog-9'));
  expect(plan.is_library).toBe(0);
});

test('days land in the creator order, with their names', async () => {
  const routines = await conn.getAllAsync(
    'SELECT name, position FROM routines WHERE programme_id = ? ORDER BY position ASC',
    [result.plan.id],
  );
  expect(routines).toEqual([
    { name: 'Circuit A', position: 0 },
    { name: 'Day Two', position: 1 },
  ]);
});

test('the circuit group keeps its rounds and its round rest on every station', async () => {
  const rows = await conn.getAllAsync(
    `SELECT re.exercise_name, re.recommended_sets, re.superset_group_id, re.group_kind,
            re.round_rest_seconds, re.rest_seconds, re.recommended_reps_min, re.recommended_reps_max
       FROM routine_exercises re JOIN routines r ON r.id = re.routine_id
      WHERE r.programme_id = ? AND r.position = 0 ORDER BY re.order_in_routine ASC`,
    [result.plan.id],
  );
  expect(rows).toHaveLength(4);
  for (const row of rows.slice(0, 3)) {
    expect(row.superset_group_id).toBe('circuit1');
    expect(row.group_kind).toBe('circuit');
    expect(row.round_rest_seconds).toBe(90);
    expect(row.recommended_sets).toBe(3);
    expect(row.rest_seconds).toBe(0);
  }
  expect(rows[3].group_kind).toBeNull();
  expect(rows[3].round_rest_seconds).toBeNull();
  expect(rows[3].rest_seconds).toBe(120);
  expect(rows[3].recommended_reps_min).toBe(5);
  expect(rows[3].recommended_reps_max).toBe(8);
});

test('starting_weight is NULL on every imported row, and no selection reason travels', async () => {
  const rows = await conn.getAllAsync(
    `SELECT re.starting_weight, re.selection_reason
       FROM routine_exercises re JOIN routines r ON r.id = re.routine_id
      WHERE r.programme_id = ?`,
    [result.plan.id],
  );
  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows) {
    expect(row.starting_weight).toBeNull();
    expect(row.selection_reason).toBeNull();
  }
});

test('the creator notes travel', async () => {
  const row = await conn.getFirstAsync(
    `SELECT re.notes FROM routine_exercises re JOIN routines r ON r.id = re.routine_id
      WHERE r.programme_id = ? AND r.position = 0 AND re.order_in_routine = 0`,
    [result.plan.id],
  );
  expect(row.notes).toBe('Circuit 1, station 1.');
});

test('an exercise the device does not have still lands by name and is reported', async () => {
  expect(result.unresolved).toEqual(['Sandbag Shouldering']);
  const row = await conn.getFirstAsync(
    `SELECT re.exercise_name, re.recommended_sets FROM routine_exercises re
       JOIN routines r ON r.id = re.routine_id
      WHERE r.programme_id = ? AND r.position = 1`,
    [result.plan.id],
  );
  expect(row.exercise_name).toBe('Sandbag Shouldering');
  expect(row.recommended_sets).toBe(4);
});

test('a known exercise resolves to the local canonical row', async () => {
  const row = await conn.getFirstAsync(
    `SELECT re.exercise_id FROM routine_exercises re JOIN routines r ON r.id = re.routine_id
      WHERE r.programme_id = ? AND r.position = 0 AND re.order_in_routine = 0`,
    [result.plan.id],
  );
  expect(row.exercise_id).toBe(canonicalExerciseId('Goblet Squat'));
});

test('a snapshot id the device does not know still resolves by canonical name', async () => {
  const s = snapshot();
  s.days = [{
    name: 'Name only',
    position: 0,
    exercises: [{
      exercise_id: 'legacy-random-id',
      exercise_name: 'Push-Up',
      order: 0,
      sets: 3,
      reps_min: 8,
      reps_max: 12,
      rest_seconds: 60,
    }],
  }];
  s.days_per_week = 1;
  const out = await importSnapshotAsPlan(U, s, { communityId: 'prog-10' });
  expect(out.unresolved).toEqual([]);
  const row = await conn.getFirstAsync(
    `SELECT re.exercise_id FROM routine_exercises re JOIN routines r ON r.id = re.routine_id
      WHERE r.programme_id = ?`,
    [out.plan.id],
  );
  expect(row.exercise_id).toBe(canonicalExerciseId('Push-Up'));
});

test('nothing is activated by an import', async () => {
  const plan = await conn.getFirstAsync('SELECT is_active FROM programmes WHERE id = ?', [result.plan.id]);
  expect(plan.is_active).toBeFalsy();
  const blocks = await conn.getAllAsync('SELECT id FROM mesocycles WHERE user_id = ?', [U]);
  expect(blocks).toHaveLength(0);
});
