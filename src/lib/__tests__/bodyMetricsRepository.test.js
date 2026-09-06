import fs from 'fs';
import path from 'path';
import { createBodyMetricsRepository } from '../database/bodyMetrics';

// LS-07 source guard: locks out the old UTC-midnight parse of metric_date.
describe('LS-07 source guard', () => {
  test('metricDateToMs no longer parses metric_date as UTC midnight', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../database/bodyMetrics.js'),
      'utf8',
    );
    expect(source).not.toMatch(/new Date\(`\$\{value\}T00:00:00Z`\)/);
    expect(source).toMatch(/parseLocalDay\(/);
  });
});

const rowToCamel = (row) => Object.fromEntries(
  Object.entries(row).map(([key, value]) => [
    key.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase()),
    value,
  ]),
);

function createHarness(overrides = {}) {
  const conn = {
    getAllAsync: jest.fn(async () => []),
    getFirstAsync: jest.fn(async () => null),
    runAsync: jest.fn(async () => undefined),
    ...overrides.conn,
  };
  const scheduleSync = jest.fn();
  const repo = createBodyMetricsRepository({
    db: jest.fn(async () => conn),
    uid: jest.fn(() => 'metric-1'),
    rowToCamel,
    scheduleSync,
    now: jest.fn(() => 123456),
    ...overrides.deps,
  });
  return { conn, repo, scheduleSync };
}

describe('bodyMetricsRepository', () => {
  // X3 write-through (founder GO 2026-08-06): a weigh-in through the Body
  // Metrics form must also reach morning_weights (the coach trend and the
  // rapid-loss safety gate read ONLY that table - pinned by
  // CoachOutputScreen.morningWeightsSource.guard.test.js, unchanged).
  describe('X3 write-through to morning_weights', () => {
    test('logBodyMetric with a weight also calls logMorningWeight for that day', async () => {
      const logMorningWeight = jest.fn(async () => 'mw-1');
      const { repo } = createHarness({ deps: { logMorningWeight } });
      await repo.logBodyMetric('u1', { weightKg: 82.4, loggedAt: 111 });
      // D153 follow-up: the write-through preserves any marker already on the day's row.
      expect(logMorningWeight).toHaveBeenCalledWith('u1', { weightKg: 82.4, loggedAt: 111, preserveNotes: true });
    });

    test('a measurements-only entry (no weight) never touches morning_weights', async () => {
      const logMorningWeight = jest.fn(async () => 'mw-1');
      const { repo } = createHarness({ deps: { logMorningWeight } });
      await repo.logBodyMetric('u1', { waistCm: 81, loggedAt: 111 });
      expect(logMorningWeight).not.toHaveBeenCalled();
    });

    test('an edit refreshes the day, and a write-through failure never loses the entry', async () => {
      const logMorningWeight = jest.fn(async () => { throw new Error('down'); });
      const { conn, repo } = createHarness({
        deps: { logMorningWeight },
        conn: { runAsync: jest.fn(async () => ({ changes: 1 })) },
      });
      await expect(repo.logBodyMetric('u1', { weightKg: 80, loggedAt: 5 })).resolves.toBeTruthy();
      await expect(repo.updateBodyMetric('u1', 'metric-1', { weightKg: 79.5, loggedAt: 5 })).resolves.toBe(true);
      expect(logMorningWeight).toHaveBeenCalledTimes(2);
      expect(conn.runAsync).toHaveBeenCalled();
    });
  });

  test('logBodyMetric writes local body metrics and schedules sync', async () => {
    const { conn, repo, scheduleSync } = createHarness();

    await expect(repo.logBodyMetric('u1', {
      loggedAt: 1000,
      weightKg: 82.5,
      bodyFatPercent: 14.2,
      bodyFatSource: 'scan',
      waistCm: 80,
      notes: 'check-in',
    })).resolves.toMatchObject({
      id: 'metric-1',
      userId: 'u1',
      createdAt: 123456,
      weightKg: 82.5,
    });

    expect(conn.runAsync).toHaveBeenCalledTimes(1);
    expect(conn.runAsync.mock.calls[0][1]).toEqual([
      'metric-1', 'u1', 1000,
      82.5, 14.2, 'scan',
      80, null, null,
      null, null,
      null, null, null,
      null, 'check-in', 123456,
    ]);
    expect(scheduleSync).toHaveBeenCalledTimes(1);
  });

  test('getBodyMetricLog and getAllBodyMetricsForUser return camelCase rows', async () => {
    const row = { id: 'bm1', user_id: 'u1', logged_at: 1000, weight_kg: 82 };
    const { conn, repo } = createHarness({
      conn: { getAllAsync: jest.fn(async () => [row]) },
    });

    await expect(repo.getBodyMetricLog('u1', 10)).resolves.toEqual([
      { id: 'bm1', userId: 'u1', loggedAt: 1000, weightKg: 82 },
    ]);
    expect(conn.getAllAsync.mock.calls[0][1]).toEqual(['u1', 10]);

    await expect(repo.getAllBodyMetricsForUser('u1')).resolves.toEqual([
      { id: 'bm1', userId: 'u1', loggedAt: 1000, weightKg: 82 },
    ]);
    expect(conn.getAllAsync.mock.calls[1][1]).toEqual(['u1']);
  });

  // D16 (NAV-2): the default read excludes soft-deleted rows so an edited-away
  // entry never reappears in the history list or in anything that treats this
  // function's output as "the weigh-ins"; the sync push opts back in via
  // includeDeleted so a delete still tombstones to the cloud.
  test('getBodyMetricLog excludes soft-deleted rows by default, includes them for sync push', async () => {
    const { conn, repo } = createHarness();

    await repo.getBodyMetricLog('u1', 50);
    expect(conn.getAllAsync.mock.calls[0][0]).toMatch(/deleted_at IS NULL/);
    expect(conn.getAllAsync.mock.calls[0][1]).toEqual(['u1', 50]);

    await repo.getBodyMetricLog('u1', 365, { includeDeleted: true });
    expect(conn.getAllAsync.mock.calls[1][0]).not.toMatch(/deleted_at IS NULL/);
    expect(conn.getAllAsync.mock.calls[1][1]).toEqual(['u1', 365]);
  });

  test('updateBodyMetric corrects an existing entry and bumps updated_at', async () => {
    const { conn, repo, scheduleSync } = createHarness({
      conn: { runAsync: jest.fn(async () => ({ changes: 1 })) },
    });

    await expect(repo.updateBodyMetric('u1', 'bm1', {
      loggedAt: 2000,
      weightKg: 80.1,
      notes: 'corrected',
    })).resolves.toBe(true);

    expect(conn.runAsync.mock.calls[0][0]).toMatch(/UPDATE body_metric_log SET/);
    expect(conn.runAsync.mock.calls[0][0]).toMatch(/WHERE id = \? AND user_id = \? AND deleted_at IS NULL/);
    expect(conn.runAsync.mock.calls[0][1]).toEqual([
      2000,
      80.1, null, null,
      null, null, null,
      null, null,
      null, null, null,
      null, 'corrected',
      123456,
      'bm1', 'u1',
    ]);
    expect(scheduleSync).toHaveBeenCalledTimes(1);
  });

  test('updateBodyMetric returns false when no live row matched (missing/deleted/wrong user)', async () => {
    const { repo } = createHarness({
      conn: { runAsync: jest.fn(async () => ({ changes: 0 })) },
    });
    await expect(repo.updateBodyMetric('u1', 'missing', { weightKg: 80 })).resolves.toBe(false);
    await expect(repo.updateBodyMetric('', 'bm1', {})).resolves.toBe(false);
  });

  test('deleteBodyMetric soft-deletes (tombstones), never a hard DELETE', async () => {
    const { conn, repo, scheduleSync } = createHarness({
      conn: { runAsync: jest.fn(async () => ({ changes: 1 })) },
    });

    await expect(repo.deleteBodyMetric('u1', 'bm1')).resolves.toBe(true);
    expect(conn.runAsync.mock.calls[0][0]).toMatch(/UPDATE body_metric_log SET deleted_at = \?, updated_at = \?/);
    expect(conn.runAsync.mock.calls[0][0]).not.toMatch(/DELETE FROM/);
    expect(conn.runAsync.mock.calls[0][1]).toEqual([123456, 123456, 'bm1', 'u1']);
    expect(scheduleSync).toHaveBeenCalledTimes(1);
  });

  test('deleteBodyMetric returns false when no live row matched', async () => {
    const { repo } = createHarness({
      conn: { runAsync: jest.fn(async () => ({ changes: 0 })) },
    });
    await expect(repo.deleteBodyMetric('u1', 'missing')).resolves.toBe(false);
    await expect(repo.deleteBodyMetric('u1', '')).resolves.toBe(false);
  });

  test('getLatestBodyWeight chooses the newest body-metric or morning-weight row', async () => {
    const { conn, repo } = createHarness();
    conn.getFirstAsync.mockImplementation(async (sql) => (
      sql.includes('FROM body_metric_log')
        ? { weight_kg: 81, logged_at: 1000 }
        : { weight_kg: 80.5, logged_at: 2000 }
    ));

    await expect(repo.getLatestBodyWeight('u1')).resolves.toEqual({
      weightKg: 80.5,
      loggedAt: 2000,
    });

    conn.getFirstAsync.mockImplementation(async (sql) => (
      sql.includes('FROM body_metric_log')
        ? { weight_kg: 82, logged_at: 3000 }
        : { weight_kg: 80.5, logged_at: 2000 }
    ));
    await expect(repo.getLatestBodyWeight('u1')).resolves.toEqual({
      weightKg: 82,
      loggedAt: 3000,
    });
  });

  test('getBodyWeightNearestTo guards invalid input and falls back to nearest weight', async () => {
    const db = jest.fn();
    const repo = createBodyMetricsRepository({
      db,
      uid: jest.fn(),
      rowToCamel,
      now: jest.fn(() => 1),
    });
    await expect(repo.getBodyWeightNearestTo('', 1000)).resolves.toBeNull();
    await expect(repo.getBodyWeightNearestTo('u1', Number.NaN)).resolves.toBeNull();
    expect(db).not.toHaveBeenCalled();

    const { conn, repo: validRepo } = createHarness();
    conn.getFirstAsync
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ weight_kg: 79, logged_at: 500 });

    await expect(validRepo.getBodyWeightNearestTo('u1', 1000)).resolves.toEqual({
      weightKg: 79,
      loggedAt: 500,
    });
    expect(conn.getFirstAsync).toHaveBeenCalledTimes(2);
  });

  test('getLatestBodyComposition returns the latest body fat row and tolerates read errors', async () => {
    const { conn, repo } = createHarness();
    conn.getFirstAsync.mockResolvedValueOnce({
      body_fat_percent: 13.5,
      body_fat_source: 'manual',
      logged_at: 111,
    });

    await expect(repo.getLatestBodyComposition('u1')).resolves.toEqual({
      bodyFatPercent: 13.5,
      bodyFatSource: 'manual',
      loggedAt: 111,
    });

    conn.getFirstAsync.mockRejectedValueOnce(new Error('missing column'));
    await expect(repo.getLatestBodyComposition('u1')).resolves.toBeNull();
  });

  test('insertBodyMetricFromCloud maps cloud body_metrics columns into local body_metric_log', async () => {
    const { conn, repo } = createHarness();

    await repo.insertBodyMetricFromCloud('u1', {
      id: 'cloud-1',
      metric_date: '2026-07-05',
      body_weight: 78.2,
      body_fat_percent: 12.9,
      body_fat_source: 'scan',
      waist: 76,
      chest: 104,
      hips: 92,
      quads: 58,
      arms: 39,
      shoulders: 122,
      forearms: 31,
      hamstrings: 54,
      calves: 37,
      notes: 'restore',
      created_at: '2026-07-04T10:00:00.000Z',
      updated_at: '2026-07-04T11:00:00.000Z',
      deleted_at: '2026-07-04T12:00:00.000Z',
    });

    expect(conn.runAsync).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line global-require
    const { parseLocalDay } = require('../dayKey');
    expect(conn.runAsync.mock.calls[0][1]).toEqual([
      'cloud-1',
      'u1',
      // LS-07: metric_date is a local-calendar-day key, so cloud-restore parses
      // it back as LOCAL midnight (parseLocalDay), not UTC midnight. Under a
      // non-UTC CI timezone (Europe/London) the two differ; the local-day value
      // is the correct one and matches the sibling LS-07 test below.
      parseLocalDay('2026-07-05').getTime(),
      78.2,
      12.9,
      'scan',
      76,
      104,
      92,
      58,
      39,
      122,
      31,
      54,
      37,
      'restore',
      new Date('2026-07-04T10:00:00.000Z').getTime(),
      new Date('2026-07-04T11:00:00.000Z').getTime(),
      new Date('2026-07-04T12:00:00.000Z').getTime(),
    ]);
  });

  // LS-07 (codex-adversarial-audit-triage-2026-07-12.md): metric_date is a
  // local-calendar-day key (stamped by sync/tables/bodyComposition.js's
  // msToDate via localDayKey), so the cloud-restore side must parse it back
  // as a LOCAL calendar date, not UTC midnight -- otherwise the two sides
  // of the sync round trip disagree about what "the day" means. This pins
  // insertBodyMetricFromCloud to route metric_date through parseLocalDay
  // (dayKey.js), the same local-midnight parser used elsewhere (food/db.js,
  // workoutDate.js) whenever a stored day-key becomes a timestamp again.
  test('insertBodyMetricFromCloud parses metric_date as a LOCAL calendar day (LS-07)', async () => {
    const { conn, repo } = createHarness();

    await repo.insertBodyMetricFromCloud('u1', {
      id: 'cloud-2',
      metric_date: '2026-07-15',
      body_weight: 80,
    });

    // eslint-disable-next-line global-require
    const { parseLocalDay } = require('../dayKey');
    expect(conn.runAsync.mock.calls[0][1][2]).toBe(parseLocalDay('2026-07-15').getTime());
  });

  test('getBodyMetricUpdatedAt returns null without id and reads local LWW timestamp', async () => {
    const db = jest.fn();
    const repoWithoutId = createBodyMetricsRepository({
      db,
      uid: jest.fn(),
      rowToCamel,
    });
    await expect(repoWithoutId.getBodyMetricUpdatedAt('u1')).resolves.toBeNull();
    expect(db).not.toHaveBeenCalled();

    const { conn, repo } = createHarness();
    conn.getFirstAsync.mockResolvedValueOnce({ updated_at: 123 });
    await expect(repo.getBodyMetricUpdatedAt('u1', 'bm1')).resolves.toBe(123);
    expect(conn.getFirstAsync).toHaveBeenCalledWith(
      'SELECT updated_at FROM body_metric_log WHERE id = ? AND user_id = ?',
      ['bm1', 'u1'],
    );
  });
});
