/**
 * seedRoutines.repair.test.js - Sentry VOLYUME-28 (2026-09-06).
 *
 * What this pins: a library plan created while template exercises were
 * missing from the exercise table is repaired in place once they exist:
 * the missing station is added at the template's own position with the
 * template's fields, nothing already present is touched, a second pass adds
 * nothing, and a name that still resolves to nothing is counted rather than
 * invented. Runs against the REAL database module on in-memory SQLite.
 */
jest.mock('../dbCrypto', () => {
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
jest.mock('../sync', () => ({ scheduleSync: () => {} }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null), setItem: jest.fn(async () => {}), removeItem: jest.fn(async () => {}),
}));

const {
  db, createProgramme, createRoutine, addExerciseToRoutine, getRoutineExercisesWithDetails, insertExerciseWithId,
} = require('../database');
const { repairLibraryPlans } = require('../seedRoutines');

const LIB = 'library';
const PLAN = {
  name: 'Test: Bands',
  description: 'x',
  tags: 'equipment:band style:band days:1',
  difficulty: 0,
  workouts: [{
    name: 'Day A',
    exercises: [
      { name: 'Band Goblet Squat', sets: 3, repsMin: 10, repsMax: 15, rest: 90, notes: 'a' },
      { name: 'Band Monster Walk', sets: 3, repsMin: 15, repsMax: 20, rest: 60, notes: 'b' },
      { name: 'Band Pallof Press', sets: 3, repsMin: 10, repsMax: 15, rest: 60, notes: 'c' },
    ],
  }],
};


let programme;
let routine;
const byName = {};

beforeAll(async () => {
  await db();
  // Only the first exercise exists when the plan is first seeded.
  await insertExerciseWithId('ex-goblet', { name: 'Band Goblet Squat', primaryMuscle: 'quads', equipment: 'band' });
  byName['Band Goblet Squat'] = { id: 'ex-goblet', name: 'Band Goblet Squat' };
  programme = await createProgramme(LIB, PLAN.name, PLAN.description, 1, PLAN.tags, null, 0);
  routine = await createRoutine(LIB, 'Day A', null, null, 1, null, programme.id, true);
  await addExerciseToRoutine(routine.id, 'ex-goblet', 0, 10, 15, 'a', 3, null, 90, null, true, null, null, null);
});

test('a missing template exercise is added at its template position once it exists', async () => {
  // The top-up lands the second row; the third name still resolves to nothing.
  await insertExerciseWithId('ex-monster', { name: 'Band Monster Walk', primaryMuscle: 'glutes', equipment: 'band' });
  byName['Band Monster Walk'] = { id: 'ex-monster', name: 'Band Monster Walk' };

  const first = await repairLibraryPlans([PLAN], [{ id: programme.id, name: PLAN.name }], byName);
  expect(first).toEqual({ added: 1, stillMissing: 1 });

  const rows = await getRoutineExercisesWithDetails(routine.id);
  const byOrder = rows.map((r) => r.routineExercise).sort((a, b) => a.orderInRoutine - b.orderInRoutine);
  expect(byOrder.map((r) => [r.exerciseId, r.orderInRoutine])).toEqual([['ex-goblet', 0], ['ex-monster', 1]]);
  const added = byOrder[1];
  expect(added.recommendedSets).toBe(3);
  expect(added.recommendedRepsMin).toBe(15);
  expect(added.recommendedRepsMax).toBe(20);
  expect(added.restSeconds).toBe(60);
  expect(added.notes).toBe('b');
});

test('a second pass adds nothing and still counts the unresolved name', async () => {
  const again = await repairLibraryPlans([PLAN], [{ id: programme.id, name: PLAN.name }], byName);
  expect(again).toEqual({ added: 0, stillMissing: 1 });
  const rows = await getRoutineExercisesWithDetails(routine.id);
  expect(rows).toHaveLength(2);
});

test('once the last name resolves the plan is complete and nothing is missing', async () => {
  await insertExerciseWithId('ex-pallof', { name: 'Band Pallof Press', primaryMuscle: 'abs', equipment: 'band' });
  byName['Band Pallof Press'] = { id: 'ex-pallof', name: 'Band Pallof Press' };
  const res = await repairLibraryPlans([PLAN], [{ id: programme.id, name: PLAN.name }], byName);
  expect(res).toEqual({ added: 1, stillMissing: 0 });
  const rows = await getRoutineExercisesWithDetails(routine.id);
  const ids = rows.map((r) => r.routineExercise).sort((a, b) => a.orderInRoutine - b.orderInRoutine).map((r) => r.exerciseId);
  expect(ids).toEqual(['ex-goblet', 'ex-monster', 'ex-pallof']);
});

test('a plan that does not exist on the device is left alone', async () => {
  const res = await repairLibraryPlans([{ ...PLAN, name: 'Not seeded' }], [{ id: programme.id, name: PLAN.name }], byName);
  expect(res).toEqual({ added: 0, stillMissing: 0 });
});
