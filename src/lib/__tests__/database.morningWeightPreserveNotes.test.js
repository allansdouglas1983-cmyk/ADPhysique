/**
 * D153 follow-up (2026-09-06): the enrolment marker must survive a second
 * same-day write. Setup writes today's morning weight twice (the marked
 * row, then the body-metric write-through); each write fires its own cloud
 * push and the pushes land in either order, so the row must carry ONE
 * meaning whichever write ran last. Written to FAIL if the write-through
 * (preserveNotes) ever clears an existing note, if a plain write stops
 * overwriting it (a real weigh-in must still clear the marker), or if the
 * cloud push carries anything other than the notes actually stored.
 */
jest.mock('expo-sqlite');

const mockSync = jest.fn(() => Promise.resolve());
jest.mock('../sync', () => ({ syncMorningWeight: (...args) => mockSync(...args) }));

const { db, logMorningWeight } = require('../database');

let conn;
beforeEach(async () => {
  conn = await db();
  conn.runAsync.mockReset();
  conn.getFirstAsync.mockReset();
  mockSync.mockClear();
  conn.runAsync.mockResolvedValue({ changes: 1, lastInsertRowId: 0 });
});

describe('logMorningWeight and the same-day marker', () => {
  test('preserveNotes keeps an existing marker when the caller has no note of its own', async () => {
    conn.getFirstAsync.mockResolvedValue({ id: 'mw-today', notes: 'enrolment' });
    await logMorningWeight('u1', { weightKg: 89, preserveNotes: true });
    const [sql, params] = conn.runAsync.mock.calls[0];
    expect(sql).toMatch(/^UPDATE morning_weights SET weight_kg = \?, notes = \?/);
    expect(params[0]).toBe(89);
    expect(params[1]).toBe('enrolment');
    expect(mockSync).toHaveBeenCalledWith('u1', expect.objectContaining({ id: 'mw-today', notes: 'enrolment' }));
  });

  test('a plain write still clears the marker: a real weigh-in overwrites the seed', async () => {
    conn.getFirstAsync.mockResolvedValue({ id: 'mw-today', notes: 'enrolment' });
    await logMorningWeight('u1', { weightKg: 88.5 });
    const [, params] = conn.runAsync.mock.calls[0];
    expect(params[1]).toBeNull();
    expect(mockSync).toHaveBeenCalledWith('u1', expect.objectContaining({ id: 'mw-today', notes: null }));
  });

  test('preserveNotes with an explicit note writes that note', async () => {
    conn.getFirstAsync.mockResolvedValue({ id: 'mw-today', notes: 'enrolment' });
    await logMorningWeight('u1', { weightKg: 89, notes: 'Imported from Health', preserveNotes: true });
    const [, params] = conn.runAsync.mock.calls[0];
    expect(params[1]).toBe('Imported from Health');
  });

  test('no same-day row: preserveNotes inserts with the note given (null when none)', async () => {
    conn.getFirstAsync.mockResolvedValue(null);
    await logMorningWeight('u1', { weightKg: 89, preserveNotes: true });
    const [sql, params] = conn.runAsync.mock.calls[0];
    expect(sql).toMatch(/^INSERT INTO morning_weights/);
    expect(params[4]).toBeNull();
  });
});
