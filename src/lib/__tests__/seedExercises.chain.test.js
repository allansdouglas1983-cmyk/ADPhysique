/**
 * seedExercises.chain.test.js - Sentry VOLYUME-28 (2026-09-06).
 *
 * What this pins: exercisesReady() resolves after the corpus rows are in
 * (seed + top-up) and before the metadata passes finish, resolves at once
 * when no chain was started, and the chain runs exactly once per process.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null), setItem: jest.fn(async () => {}), removeItem: jest.fn(async () => {}),
}));
jest.mock('../errorLog', () => ({ logError: jest.fn(), logInfo: jest.fn() }));
jest.mock('../database', () => ({
  getAllExercises: jest.fn(async () => [{ id: 'x', name: 'X' }]),
  insertExerciseWithId: jest.fn(async () => {}),
  updateExerciseMetadata: jest.fn(async () => {}),
  mergeExerciseIdInto: jest.fn(async () => {}),
}));
jest.mock('../exerciseCorpus', () => ({
  CORPUS: [], CORPUS_BY_NAME: new Map(), RETIRED_ENTRIES: [], corpusEntryToSeedRow: (e) => e,
}));

const seed = require('../seedExercises');
const AsyncStorage = require('@react-native-async-storage/async-storage');

beforeEach(() => { seed._resetExerciseSeedChainForTests(); });

test('resolves immediately when no chain was started', async () => {
  await expect(seed.exercisesReady()).resolves.toBeUndefined();
});

test('rows are ready once the top-up completes, before the metadata passes', async () => {
  // Gate the storage read the backfill pass starts with, so readiness can
  // be observed resolving ahead of the chain's end.
  let releaseBackfill;
  const backfillGate = new Promise((r) => { releaseBackfill = r; });
  AsyncStorage.getItem.mockImplementation(async (key) => {
    if (/backfilled/.test(key)) { await backfillGate; return 'true'; }
    return 'true';
  });
  const chain = seed.runExerciseSeedChain();
  let chainSettled = false;
  chain.then(() => { chainSettled = true; });
  await seed.exercisesReady({ timeoutMs: 5000 });
  expect(chainSettled).toBe(false);
  releaseBackfill();
  await chain;
  expect(chainSettled).toBe(true);
});

test('the chain runs once per process', async () => {
  AsyncStorage.getItem.mockImplementation(async () => 'true');
  const a = seed.runExerciseSeedChain();
  const b = seed.runExerciseSeedChain();
  expect(a).toBe(b);
  await a;
});
