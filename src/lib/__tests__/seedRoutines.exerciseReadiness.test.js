/**
 * seedRoutines.exerciseReadiness.test.js - Sentry VOLYUME-28 (2026-09-06).
 *
 * What this pins: the routine seed must not resolve a single template name
 * until the exercise seed chain has finished. On 1.3.5+64 it read the
 * exercise table while the corpus top-up was still inserting the kettlebell
 * and band rows, 90 names came back "not found", and the kettlebell and
 * band library plans were created with stations missing.
 */
jest.mock('@react-native-async-storage/async-storage', () => {
  const store = {};
  return {
    getItem: jest.fn(async (k) => (k in store ? store[k] : null)),
    setItem: jest.fn(async (k, v) => { store[k] = v; }),
    removeItem: jest.fn(async (k) => { delete store[k]; }),
    __store: store,
  };
});

const mockState = { order: [], release: null };
const mockChain = new Promise((resolve) => { mockState.release = resolve; });
jest.mock('../seedExercises', () => ({
  exercisesReady: jest.fn(() => mockChain),
}));

jest.mock('../database', () => ({
  getAllExercises: jest.fn(async () => { mockState.order.push('getAllExercises'); return []; }),
  getLibraryPlans: jest.fn(async () => []),
  getRoutinesForPlan: jest.fn(async () => []),
  getRoutineExercisesWithDetails: jest.fn(async () => []),
  createProgramme: jest.fn(async () => ({ id: 'p' })),
  createRoutine: jest.fn(async () => ({ id: 'r' })),
  addExerciseToRoutine: jest.fn(async () => ({})),
}));
jest.mock('../errorLog', () => ({ logError: jest.fn(), logWarn: jest.fn(), logInfo: jest.fn() }));

const { seedRoutinesIfNeeded } = require('../seedRoutines');
const { exercisesReady } = require('../seedExercises');
const db = require('../database');

test('the exercise table is not read until the exercise seed chain resolves', async () => {
  const run = seedRoutinesIfNeeded('user-1');
  // Let any synchronous work and microtasks settle: the seed must be parked.
  await new Promise((r) => setTimeout(r, 20));
  expect(exercisesReady).toHaveBeenCalled();
  expect(db.getAllExercises).not.toHaveBeenCalled();
  mockState.release();
  await run;
  expect(db.getAllExercises).toHaveBeenCalledTimes(1);
  expect(mockState.order[0]).toBe('getAllExercises');
});
