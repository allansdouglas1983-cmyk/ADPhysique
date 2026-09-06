/**
 * What this suite pins (discovery blueprint
 * `docs/social-discovery-2026-09-06/70-DISCOVERY-BLUEPRINT.md` sections 3
 * and 12; SD-22, SD-30, SD-31):
 *
 *  - the derivation is a BAND derivation. Days need a quarter share AND
 *    six sessions in the window, time bands need a 35% share and stop at
 *    two, the sessions band rounds to the nearest whole session, and a
 *    custom exercise is never a staple lift. Each of those is a promise
 *    made to the person on the Training profile screen, so each is pinned
 *    to a fixture rather than left to read correctly;
 *  - the preview line is the exact sentence the blueprint specifies, and
 *    shows ONLY the parts being shared. The preview is what makes SD-22's
 *    "the person sees the bands before they are shared" true, so a
 *    preview that showed more than the payload carries would be a lie;
 *  - ONLY opted-in bands are sent. `share_age_band` always travels as a
 *    boolean and the age band itself never does: it is server-derived;
 *  - the send is throttled to once a day per user, and `force` overrides
 *    it. The hub calls this on every open;
 *  - the derivation reads nothing but timestamps and exercise ids
 *    (SD-30). Pinned here behaviourally and again, at source level, by
 *    `src/__tests__/community.privacy.guard.test.js`.
 */

const mockStore = new Map();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k) => (mockStore.has(k) ? mockStore.get(k) : null)),
    setItem: jest.fn(async (k, v) => { mockStore.set(k, v); }),
    removeItem: jest.fn(async (k) => { mockStore.delete(k); }),
    multiRemove: jest.fn(async (keys) => { keys.forEach((k) => mockStore.delete(k)); }),
  },
}));

jest.mock('../transport', () => ({ callCommunity: jest.fn(async () => ({})) }));
jest.mock('../profile', () => ({ currentUserId: () => 'u1' }));
jest.mock('../feed', () => ({ myProgrammes: jest.fn(async () => ({ programmes: [] })) }));
jest.mock('../../database', () => ({
  getCompletedWorkoutStartTimestamps: jest.fn(async () => []),
  getWorkoutSetsSince: jest.fn(async () => []),
  getAllExercises: jest.fn(async () => []),
  getActivePlan: jest.fn(async () => null),
}));

const { callCommunity } = require('../transport');
const { myProgrammes } = require('../feed');
const db = require('../../database');
const {
  deriveTrainingProfile, previewLine, shareablePayload, sessionsBandFor,
  timeBandForHour, experienceBand, readShareSettings, writeShareSettings,
  loadTrainingProfile, syncTrainingProfile, tpSyncedKey,
  TP_DEFAULT_SHARE, TP_TIME_BANDS, TP_SESSIONS_BANDS, TP_SYNC_INTERVAL_MS,
} = require('../trainingProfile');

/** A fixed Monday 18:00 local, so every fixture's weekday and start hour
 * are the ones the test names regardless of the machine's clock. */
const MONDAY = new Date(2026, 5, 1, 18, 0, 0).getTime();
const DAY = 24 * 60 * 60 * 1000;
const WEEK = 7 * DAY;
const NOW = MONDAY + (11 * WEEK) + DAY; // a Tuesday, 11 weeks on

/** A session `weeksBack` weeks before the Monday anchor, on `dayOffset`
 * days after Monday, starting at local `hour`. */
function session(weeksBack, dayOffset, hour) {
  const d = new Date(MONDAY + (weeksBack * WEEK) + (dayOffset * DAY));
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
}

beforeEach(() => {
  jest.clearAllMocks();
  mockStore.clear();
  db.getCompletedWorkoutStartTimestamps.mockResolvedValue([]);
  db.getWorkoutSetsSince.mockResolvedValue([]);
  db.getAllExercises.mockResolvedValue([]);
  db.getActivePlan.mockResolvedValue(null);
  myProgrammes.mockResolvedValue({ programmes: [] });
  callCommunity.mockResolvedValue({});
});

describe('days: a quarter share, and only once there are six sessions', () => {
  test('Mon, Wed and Fri across four weeks are the training days', () => {
    const starts = [];
    for (let w = 0; w < 4; w += 1) {
      starts.push(session(w, 0, 18), session(w, 2, 18), session(w, 4, 18));
    }
    const out = deriveTrainingProfile({ startTimestamps: starts, nowMs: NOW });
    expect(out.tp_days).toEqual(['mon', 'wed', 'fri']);
    expect(out.sessions).toBe(12);
  });

  test('five sessions is not enough for a day pattern to mean anything', () => {
    const starts = [0, 1, 2, 3, 4].map((w) => session(w, 0, 18));
    expect(deriveTrainingProfile({ startTimestamps: starts, nowMs: NOW }).tp_days).toBeNull();
  });

  test('the sixth session is the one that makes the pattern shareable', () => {
    const starts = [0, 1, 2, 3, 4, 5].map((w) => session(w, 0, 18));
    expect(deriveTrainingProfile({ startTimestamps: starts, nowMs: NOW }).tp_days).toEqual(['mon']);
  });

  test('a day under a quarter of the sessions is not a training day', () => {
    // Seven sessions: six on Monday, one on Sunday (1/7 = 14%).
    const starts = [
      ...[0, 1, 2, 3, 4, 5].map((w) => session(w, 0, 18)),
      session(0, 6, 18),
    ];
    expect(deriveTrainingProfile({ startTimestamps: starts, nowMs: NOW }).tp_days).toEqual(['mon']);
  });

  test('the days come back in week order, never in the order they were found', () => {
    const starts = [
      session(0, 4, 18), session(1, 4, 18), session(2, 4, 18),
      session(0, 0, 18), session(1, 0, 18), session(2, 0, 18),
    ];
    expect(deriveTrainingProfile({ startTimestamps: starts, nowMs: NOW }).tp_days).toEqual(['mon', 'fri']);
  });
});

describe('time bands: a 35% share, at most two, in the order they rank', () => {
  test('the bounds are the blueprint bounds', () => {
    expect(timeBandForHour(5)).toBe('morning');
    expect(timeBandForHour(8)).toBe('morning');
    expect(timeBandForHour(9)).toBe('midday');
    expect(timeBandForHour(13)).toBe('midday');
    expect(timeBandForHour(14)).toBe('afternoon');
    expect(timeBandForHour(16)).toBe('afternoon');
    expect(timeBandForHour(17)).toBe('evening');
    expect(timeBandForHour(21)).toBe('evening');
    expect(timeBandForHour(22)).toBe('late');
    expect(timeBandForHour(4)).toBe('late');
  });

  test('a three-way split gives nothing: no band carries a third of the week', () => {
    const starts = [
      session(0, 0, 7), session(1, 0, 7), session(2, 0, 7),
      session(0, 2, 12), session(1, 2, 12), session(2, 2, 12),
      session(0, 4, 19), session(1, 4, 19), session(2, 4, 19),
    ];
    expect(deriveTrainingProfile({ startTimestamps: starts, nowMs: NOW }).tp_time_bands).toEqual([]);
  });

  test('the busier band leads, whatever order the sets are declared in', () => {
    // Six evening, four morning: evening 60%, morning 40%.
    const starts = [
      ...[0, 1, 2, 3, 4, 5].map((w) => session(w, 0, 19)),
      ...[0, 1, 2, 3].map((w) => session(w, 2, 7)),
    ];
    expect(deriveTrainingProfile({ startTimestamps: starts, nowMs: NOW }).tp_time_bands)
      .toEqual(['evening', 'morning']);
  });

  test('a tie falls back to the declared band order, so the answer is stable', () => {
    const starts = [
      ...[0, 1, 2, 3, 4].map((w) => session(w, 0, 7)),
      ...[0, 1, 2, 3, 4].map((w) => session(w, 2, 19)),
    ];
    expect(deriveTrainingProfile({ startTimestamps: starts, nowMs: NOW }).tp_time_bands)
      .toEqual(['morning', 'evening']);
  });

  test('never more than two bands leave the device', () => {
    const starts = [];
    for (let w = 0; w < 3; w += 1) {
      starts.push(session(w, 0, 7), session(w, 1, 12), session(w, 2, 15), session(w, 3, 19), session(w, 4, 23));
    }
    const out = deriveTrainingProfile({ startTimestamps: starts, nowMs: NOW });
    expect(out.tp_time_bands.length).toBeLessThanOrEqual(2);
  });
});

describe('the sessions band rounds to the nearest whole session', () => {
  /** `count` sessions spread over the full 12 week window. */
  function overFullWindow(count, now = NOW) {
    const starts = [now - (12 * WEEK)];
    for (let i = 1; i < count; i += 1) starts.push(now - (12 * WEEK) + (i * 1000));
    return starts;
  }

  test.each([
    [29, '1_2'],
    [30, '3'],
    [41, '3'],
    [42, '4_5'],
    [65, '4_5'],
    [66, '6_plus'],
  ])('%i sessions over twelve weeks is the %s band', (count, band) => {
    const out = deriveTrainingProfile({ startTimestamps: overFullWindow(count), nowMs: NOW });
    expect(out.tp_sessions_band).toBe(band);
  });

  test('the boundaries are the same ones stated on their own', () => {
    expect(sessionsBandFor(2.49)).toBe('1_2');
    expect(sessionsBandFor(2.5)).toBe('3');
    expect(sessionsBandFor(3.49)).toBe('3');
    expect(sessionsBandFor(3.5)).toBe('4_5');
    expect(sessionsBandFor(5.49)).toBe('4_5');
    expect(sessionsBandFor(5.5)).toBe('6_plus');
    expect(sessionsBandFor(0)).toBeNull();
  });

  test('a week with nothing in it counts, so a fortnight off lowers the band', () => {
    // Twelve sessions in the first two weeks, then ten weeks of nothing.
    const starts = [];
    for (let i = 0; i < 12; i += 1) starts.push(NOW - (12 * WEEK) + (i * DAY));
    expect(deriveTrainingProfile({ startTimestamps: starts, nowMs: NOW }).tp_sessions_band).toBe('1_2');
  });

  test('a brand new account cannot read as six a week from two sessions', () => {
    const starts = [NOW - (2 * DAY), NOW - DAY];
    expect(deriveTrainingProfile({ startTimestamps: starts, nowMs: NOW }).tp_sessions_band).toBe('1_2');
  });

  test('nothing in the window answers nothing at all', () => {
    const out = deriveTrainingProfile({ startTimestamps: [NOW - (30 * WEEK)], nowMs: NOW });
    expect(out).toEqual({
      tp_days: null,
      tp_time_bands: [],
      tp_sessions_band: null,
      tp_staple_lifts: [],
      tp_experience_band: null,
      sessions: 0,
    });
  });
});

describe('staple lifts: canonical ids, counted by distinct sessions', () => {
  const canonicalIds = new Set(['squat', 'bench', 'row', 'ohp', 'curl', 'deadlift']);

  function set(exerciseId, workoutId) {
    return { exerciseId, workoutId, createdAt: NOW - DAY };
  }

  test('a custom exercise is never a staple lift', () => {
    const setsRows = [
      set('squat', 'w1'), set('squat', 'w2'),
      set('custom-abc', 'w1'), set('custom-abc', 'w2'), set('custom-abc', 'w3'),
    ];
    const out = deriveTrainingProfile({
      startTimestamps: [NOW - DAY], setsRows, canonicalIds, nowMs: NOW,
    });
    expect(out.tp_staple_lifts).toEqual(['squat']);
  });

  test('twenty sets in one session is one session, not twenty', () => {
    const setsRows = [
      ...Array.from({ length: 20 }, () => set('curl', 'w1')),
      set('squat', 'w1'), set('squat', 'w2'), set('squat', 'w3'),
    ];
    const out = deriveTrainingProfile({
      startTimestamps: [NOW - DAY], setsRows, canonicalIds, nowMs: NOW,
    });
    expect(out.tp_staple_lifts).toEqual(['squat', 'curl']);
  });

  test('at most five, the five with the most sessions behind them', () => {
    const setsRows = [];
    const order = ['squat', 'bench', 'row', 'ohp', 'curl', 'deadlift'];
    order.forEach((id, index) => {
      for (let w = 0; w <= (order.length - index); w += 1) setsRows.push(set(id, `w${index}-${w}`));
    });
    const out = deriveTrainingProfile({
      startTimestamps: [NOW - DAY], setsRows, canonicalIds, nowMs: NOW,
    });
    expect(out.tp_staple_lifts).toEqual(['squat', 'bench', 'row', 'ohp', 'curl']);
  });

  test('a set row from outside the window is not counted', () => {
    const setsRows = [
      { exerciseId: 'squat', workoutId: 'w1', createdAt: NOW - (30 * WEEK) },
      { exerciseId: 'bench', workoutId: 'w2', createdAt: NOW - DAY },
    ];
    const out = deriveTrainingProfile({
      startTimestamps: [NOW - DAY], setsRows, canonicalIds, nowMs: NOW,
    });
    expect(out.tp_staple_lifts).toEqual(['bench']);
  });

  test('snake_case rows read the same as camelCase ones', () => {
    const setsRows = [
      { exercise_id: 'row', workout_id: 'w1', created_at: NOW - DAY },
      { exercise_id: 'row', workout_id: 'w2', created_at: NOW - DAY },
    ];
    const out = deriveTrainingProfile({
      startTimestamps: [NOW - DAY], setsRows, canonicalIds, nowMs: NOW,
    });
    expect(out.tp_staple_lifts).toEqual(['row']);
  });
});

describe('the experience band', () => {
  test.each([
    ['beginner', 'new'],
    ['new', 'new'],
    ['intermediate', 'intermediate'],
    ['advanced', 'experienced'],
    ['experienced', 'experienced'],
  ])('%s reads as %s', (input, band) => {
    expect(experienceBand(input)).toBe(band);
  });

  test('an unrecognised level shares nothing rather than guessing', () => {
    expect(experienceBand('competitive')).toBe('experienced');
    expect(experienceBand('elite')).toBeNull();
    expect(experienceBand(null)).toBeNull();
    expect(experienceBand('')).toBeNull();
  });
});

describe('the preview line is the sentence the blueprint specifies', () => {
  test('all three parts', () => {
    expect(previewLine({
      tp_days: ['mon', 'wed', 'fri'],
      tp_time_bands: ['evening'],
      tp_sessions_band: '4_5',
      tp_experience_band: 'intermediate',
    })).toBe('Usually trains Mon, Wed and Fri evenings · 4 to 5 sessions a week · Intermediate');
  });

  test('only the parts being shared appear', () => {
    expect(previewLine({
      tp_days: null,
      tp_time_bands: [],
      tp_sessions_band: '3',
      tp_experience_band: 'new',
    })).toBe('3 sessions a week · New');
  });

  test('a time band on its own still reads as a sentence', () => {
    expect(previewLine({ tp_time_bands: ['morning', 'evening'] }))
      .toBe('Usually trains mornings and evenings');
  });

  test('days without a time band do not trail an empty word', () => {
    expect(previewLine({ tp_days: ['sat', 'sun'] })).toBe('Usually trains Sat and Sun');
  });

  test('sharing nothing shows nothing', () => {
    expect(previewLine({})).toBe('');
  });

  test('every band label the preview can use is a real label', () => {
    expect(TP_TIME_BANDS.midday).toBe('at midday');
    expect(TP_SESSIONS_BANDS['6_plus']).toBe('6 or more');
  });
});

describe('only the opted-in bands are sent', () => {
  const BANDS = {
    tp_days: ['mon', 'wed'],
    tp_time_bands: ['evening'],
    tp_sessions_band: '4_5',
    tp_staple_lifts: ['squat'],
    tp_experience_band: 'intermediate',
    tp_programme_key: 'style:kettlebell_foundations',
    sessions: 20,
  };

  test('the defaults leave days, time bands and the age band behind', () => {
    const payload = shareablePayload(BANDS, TP_DEFAULT_SHARE);
    expect(Object.keys(payload).sort()).toEqual([
      'share_age_band', 'tp_experience_band', 'tp_programme_key',
      'tp_sessions_band', 'tp_staple_lifts',
    ]);
    expect(payload.share_age_band).toBe(false);
  });

  test('a band whose toggle is off is ABSENT, not sent as null', () => {
    const payload = shareablePayload(BANDS, { ...TP_DEFAULT_SHARE, days: false });
    expect('tp_days' in payload).toBe(false);
  });

  test('switching a toggle on sends that band and only that band more', () => {
    const payload = shareablePayload(BANDS, { ...TP_DEFAULT_SHARE, days: true });
    expect(payload.tp_days).toEqual(['mon', 'wed']);
    expect('tp_time_bands' in payload).toBe(false);
  });

  test('nothing but the named bands can ever travel', () => {
    const payload = shareablePayload({ ...BANDS, sessions: 20, secret: 'x' }, {
      days: true, time_bands: true, sessions: true, staple_lifts: true,
      experience: true, programme: true, age_band: true,
    });
    expect(Object.keys(payload).sort()).toEqual([
      'share_age_band', 'tp_days', 'tp_experience_band', 'tp_programme_key',
      'tp_sessions_band', 'tp_staple_lifts', 'tp_time_bands',
    ]);
  });

  test('the age band itself never travels: only the permission does', () => {
    const payload = shareablePayload({ ...BANDS, tp_age_band: '35_44' }, {
      ...TP_DEFAULT_SHARE, age_band: true,
    });
    expect('tp_age_band' in payload).toBe(false);
    expect(payload.share_age_band).toBe(true);
  });

  test('an unreadable settings value falls back to the defaults, never to more', async () => {
    mockStore.set('@volyume_community_tp_share_u1', '{not json');
    expect(await readShareSettings('u1')).toEqual(TP_DEFAULT_SHARE);
  });

  test('settings round-trip, and an unknown key is dropped', async () => {
    await writeShareSettings('u1', { days: true, nonsense: true });
    const read = await readShareSettings('u1');
    expect(read.days).toBe(true);
    expect('nonsense' in read).toBe(false);
  });
});

describe('the loader reads training structure and nothing else', () => {
  test('four reads, and the programme key comes from the imported id', async () => {
    db.getCompletedWorkoutStartTimestamps.mockResolvedValue([NOW - DAY]);
    db.getAllExercises.mockResolvedValue([
      { id: 'squat', isCustom: 0 }, { id: 'mine', isCustom: 1 },
    ]);
    db.getWorkoutSetsSince.mockResolvedValue([
      { exerciseId: 'squat', workoutId: 'w1', createdAt: NOW - DAY },
      { exerciseId: 'mine', workoutId: 'w1', createdAt: NOW - DAY },
    ]);
    db.getActivePlan.mockResolvedValue({ id: 'plan-1', sourceProgrammeId: 'community:prog-9' });

    const out = await loadTrainingProfile('u1', { nowMs: NOW });

    expect(out.tp_programme_key).toBe('prog-9');
    expect(out.tp_staple_lifts).toEqual(['squat']);
    expect(db.getCompletedWorkoutStartTimestamps).toHaveBeenCalledWith('u1');
    expect(db.getWorkoutSetsSince).toHaveBeenCalledWith('u1', NOW - (12 * WEEK));
  });

  test('a plan the person published themselves resolves to their own id', async () => {
    db.getActivePlan.mockResolvedValue({ id: 'plan-2', tags: 'style:kettlebell_foundations' });
    myProgrammes.mockResolvedValue({ programmes: [{ id: 'pub-3', source_plan_id: 'plan-2' }] });
    const out = await loadTrainingProfile('u1', { nowMs: NOW });
    expect(out.tp_programme_key).toBe('pub-3');
  });

  test('an unpublished plan falls back to its training style', async () => {
    db.getActivePlan.mockResolvedValue({ id: 'plan-3', tags: 'style:kettlebell_foundations' });
    const out = await loadTrainingProfile('u1', { nowMs: NOW });
    expect(out.tp_programme_key).toBe('style:kettlebell_foundations');
  });

  test('no plan at all is no key, never a guess', async () => {
    const out = await loadTrainingProfile('u1', { nowMs: NOW });
    expect(out.tp_programme_key).toBeNull();
  });

  test('a Community read that fails never stops the bands being derived', async () => {
    db.getActivePlan.mockResolvedValue({ id: 'plan-4', tags: null });
    myProgrammes.mockRejectedValue(Object.assign(new Error('offline'), { code: 'offline' }));
    db.getCompletedWorkoutStartTimestamps.mockResolvedValue([NOW - DAY, NOW - (2 * DAY)]);
    const out = await loadTrainingProfile('u1', { nowMs: NOW });
    expect(out.tp_programme_key).toBeNull();
    expect(out.sessions).toBe(2);
  });
});

describe('the send is throttled to once a day', () => {
  beforeEach(() => {
    db.getCompletedWorkoutStartTimestamps.mockResolvedValue([NOW - DAY]);
  });

  test('the first call sends and records when it did', async () => {
    const out = await syncTrainingProfile('u1', { nowMs: NOW });
    expect(out.sent).toBe(true);
    expect(callCommunity).toHaveBeenCalledWith('community_update_training_profile', { _p: out.payload });
    expect(mockStore.get(tpSyncedKey('u1'))).toBe(String(NOW));
  });

  test('a second call an hour later sends nothing', async () => {
    await syncTrainingProfile('u1', { nowMs: NOW });
    callCommunity.mockClear();
    const out = await syncTrainingProfile('u1', { nowMs: NOW + (60 * 60 * 1000) });
    expect(out).toEqual({ sent: false, reason: 'throttled', payload: null });
    expect(callCommunity).not.toHaveBeenCalled();
  });

  test('a day later it sends again', async () => {
    await syncTrainingProfile('u1', { nowMs: NOW });
    callCommunity.mockClear();
    const out = await syncTrainingProfile('u1', { nowMs: NOW + TP_SYNC_INTERVAL_MS + 1 });
    expect(out.sent).toBe(true);
  });

  test('force overrides the throttle: a toggle just changed has to take', async () => {
    await syncTrainingProfile('u1', { nowMs: NOW });
    callCommunity.mockClear();
    const out = await syncTrainingProfile('u1', { force: true, nowMs: NOW + 1000 });
    expect(out.sent).toBe(true);
  });

  test('a refused send never records a sync, so the next open retries', async () => {
    callCommunity.mockRejectedValue(Object.assign(new Error('offline'), { code: 'offline' }));
    const out = await syncTrainingProfile('u1', { nowMs: NOW });
    expect(out).toEqual({ sent: false, reason: 'offline', payload: null });
    expect(mockStore.has(tpSyncedKey('u1'))).toBe(false);
  });

  test('it sends the opted-in bands, not everything derived', async () => {
    await syncTrainingProfile('u1', { nowMs: NOW });
    const [, params] = callCommunity.mock.calls[0];
    expect('tp_days' in params._p).toBe(false);
    expect('sessions' in params._p).toBe(false);
    expect(params._p.share_age_band).toBe(false);
  });
});
