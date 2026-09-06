import { parseLocalDay } from '../dayKey';

function timestampToMs(value) {
  if (value == null) return null;
  if (typeof value === 'string') {
    const ms = new Date(value).getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  return value;
}

// LS-07: `metric_date` is a plain 'YYYY-MM-DD' local calendar day (stamped
// by sync/tables/bodyComposition.js's msToDate via localDayKey, not UTC).
// The old parse built a Date from the day-key plus a fixed UTC midnight
// suffix, reading it back as UTC midnight instead of the user's local
// midnight for that day -- the two only coincide by luck at UK-adjacent
// offsets. parseLocalDay (dayKey.js) is the shared local-midnight parser
// used everywhere else a stored day-key is turned back into a timestamp
// (food/db.js, workoutDate.js), so the round trip stays on the same
// calendar day regardless of offset.
function metricDateToMs(value) {
  if (value == null) return null;
  if (typeof value === 'number') return value;
  const ms = parseLocalDay(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function createBodyMetricsRepository({
  db,
  uid,
  rowToCamel,
  scheduleSync = () => {},
  now = () => Date.now(),
  // X3 write-through (founder GO 2026-08-06, multi-choice ruling): the
  // morning-weight writer, injected by database.js. A weigh-in logged or
  // edited through the Body Metrics form also lands in morning_weights, so
  // the coach's weight trend and the rapid-loss safety gate see every
  // weigh-in the user makes. logMorningWeight upserts per LOCAL DAY and
  // fires its own cloud push, so same-day entries merge instead of
  // duplicating. Deleting a body-metric entry deliberately does NOT
  // retract the day's morning weight: the safety gate keeps its data
  // (fail-safe direction), and the user may have logged that day on Today
  // independently.
  logMorningWeight = null,
}) {
  async function writeThroughMorningWeight(userId, data, fallbackMs) {
    if (typeof logMorningWeight !== 'function') return;
    const kg = data?.weightKg;
    if (!Number.isFinite(kg) || kg <= 0) return;
    try {
      // D153 follow-up: never clear a marker another writer set on the same
      // day (the enrolment seed, a Health import's source line).
      await logMorningWeight(userId, { weightKg: kg, loggedAt: data.loggedAt ?? fallbackMs, preserveNotes: true });
    } catch (_) { /* best-effort: the body-metric entry itself is saved */ }
  }
  async function logBodyMetric(userId, data) {
    const d = await db();
    const id = uid();
    const createdAt = now();
    await d.runAsync(
      `INSERT INTO body_metric_log
        (id, user_id, logged_at, weight_kg, body_fat_percent, body_fat_source,
         waist_cm, chest_cm, hips_cm, thigh_cm, arm_cm,
         shoulders_cm, forearm_cm, ham_cm, calf_cm, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, userId, data.loggedAt ?? createdAt,
        data.weightKg ?? null, data.bodyFatPercent ?? null, data.bodyFatSource ?? null,
        data.waistCm ?? null, data.chestCm ?? null, data.hipsCm ?? null,
        data.thighCm ?? null, data.armCm ?? null,
        data.shouldersCm ?? null, data.forearmCm ?? null, data.hamCm ?? null,
        data.calfCm ?? null, data.notes ?? null, createdAt,
      ],
    );
    // X3 write-through: see the factory-level note.
    await writeThroughMorningWeight(userId, data, createdAt);
    scheduleSync();
    return { id, userId, createdAt, ...data };
  }

  // D16 (NAV-2, weigh-in edit/delete/history): reads default to the live,
  // non-deleted series so an edited value or a deleted row never lingers in
  // the trend, the history list, or anything downstream that treats "the
  // weigh-ins" as this function's output. The per-table sync push (which must
  // still see soft-deleted rows so a delete propagates as a tombstone to the
  // cloud, mirroring the recipes/food pattern) passes includeDeleted: true.
  async function getBodyMetricLog(userId, limitRows = 90, { includeDeleted = false } = {}) {
    const d = await db();
    const rows = await d.getAllAsync(
      `SELECT * FROM body_metric_log
        WHERE user_id = ?${includeDeleted ? '' : ' AND deleted_at IS NULL'}
        ORDER BY logged_at DESC LIMIT ?`,
      [userId, limitRows],
    );
    return rows.map(rowToCamel);
  }

  async function getLatestBodyWeight(userId) {
    const d = await db();
    const [bodyRow, morningRow] = await Promise.all([
      d.getFirstAsync(
        `SELECT weight_kg, logged_at FROM body_metric_log
         WHERE user_id = ? AND weight_kg IS NOT NULL AND deleted_at IS NULL
         ORDER BY logged_at DESC LIMIT 1`,
        [userId],
      ),
      d.getFirstAsync(
        `SELECT weight_kg, logged_at FROM morning_weights
         WHERE user_id = ? AND weight_kg IS NOT NULL AND deleted_at IS NULL
         ORDER BY logged_at DESC LIMIT 1`,
        [userId],
      ),
    ]);
    const bodyTs = bodyRow?.logged_at ?? 0;
    const morningTs = morningRow?.logged_at ?? 0;
    const winner = bodyTs >= morningTs ? bodyRow : morningRow;
    if (winner && winner.weight_kg != null) {
      return { weightKg: winner.weight_kg, loggedAt: winner.logged_at };
    }
    return null;
  }

  async function getBodyWeightNearestTo(userId, t) {
    if (!userId || !Number.isFinite(t)) return null;
    const d = await db();
    const union = `
      SELECT weight_kg, logged_at FROM body_metric_log
        WHERE user_id = ? AND weight_kg IS NOT NULL AND deleted_at IS NULL
      UNION ALL
      SELECT weight_kg, logged_at FROM morning_weights
        WHERE user_id = ? AND weight_kg IS NOT NULL AND deleted_at IS NULL`;
    const onOrBefore = await d.getFirstAsync(
      `SELECT weight_kg, logged_at FROM (${union})
         WHERE logged_at <= ?
         ORDER BY logged_at DESC LIMIT 1`,
      [userId, userId, t],
    );
    const pick = onOrBefore ?? await d.getFirstAsync(
      `SELECT weight_kg, logged_at FROM (${union})
         ORDER BY ABS(logged_at - ?) ASC LIMIT 1`,
      [userId, userId, t],
    );
    if (pick && pick.weight_kg != null) {
      return { weightKg: pick.weight_kg, loggedAt: pick.logged_at };
    }
    return null;
  }

  async function getLatestBodyComposition(userId) {
    const d = await db();
    const row = await d.getFirstAsync(
      `SELECT body_fat_percent, body_fat_source, logged_at
         FROM body_metric_log
        WHERE user_id = ? AND body_fat_percent IS NOT NULL AND deleted_at IS NULL
        ORDER BY logged_at DESC LIMIT 1`,
      [userId],
    ).catch(() => null);
    if (!row || row.body_fat_percent == null) return null;
    return {
      bodyFatPercent: row.body_fat_percent,
      bodyFatSource: row.body_fat_source ?? null,
      loggedAt: row.logged_at ?? 0,
    };
  }

  async function getAllBodyMetricsForUser(userId) {
    const d = await db();
    const rows = await d.getAllAsync('SELECT * FROM body_metric_log WHERE user_id = ?', [userId]);
    return rows.map(rowToCamel);
  }

  async function insertBodyMetricFromCloud(userId, metric) {
    const d = await db();
    await d.runAsync(
      `INSERT OR REPLACE INTO body_metric_log
        (id, user_id, logged_at, weight_kg, body_fat_percent, body_fat_source,
         waist_cm, chest_cm, hips_cm, thigh_cm, arm_cm, shoulders_cm,
         forearm_cm, ham_cm, calf_cm, notes, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        metric.id, userId,
        metricDateToMs(metric.metric_date) ?? timestampToMs(metric.logged_at),
        metric.body_weight ?? null,
        metric.body_fat_percent ?? null,
        metric.body_fat_source ?? null,
        metric.waist ?? null,
        metric.chest ?? null,
        metric.hips ?? null,
        metric.quads ?? null,
        metric.arms ?? null,
        metric.shoulders ?? null,
        metric.forearms ?? null,
        metric.hamstrings ?? null,
        metric.calves ?? null,
        metric.notes ?? null,
        timestampToMs(metric.created_at) ?? now(),
        timestampToMs(metric.updated_at) ?? now(),
        metric.deleted_at ? timestampToMs(metric.deleted_at) : null,
      ],
    );
  }

  async function getBodyMetricUpdatedAt(userId, id) {
    if (!id) return null;
    const d = await db();
    const row = await d.getFirstAsync(
      'SELECT updated_at FROM body_metric_log WHERE id = ? AND user_id = ?',
      [id, userId],
    );
    return row?.updated_at ?? null;
  }

  // D16 (NAV-2): correct any field, including the logged date, on an
  // existing entry. Same column set + ?? null semantics as logBodyMetric
  // (the edit form always resubmits every field, not a partial patch), plus
  // updated_at so the LWW sync gate and any live trend re-read see the
  // correction immediately. Scoped to (id, user_id, deleted_at IS NULL) so a
  // stale screen can't resurrect a tombstoned row or edit another user's data.
  async function updateBodyMetric(userId, id, data) {
    if (!id || !userId) return false;
    const d = await db();
    const updatedAt = now();
    const result = await d.runAsync(
      `UPDATE body_metric_log SET
         logged_at = ?, weight_kg = ?, body_fat_percent = ?, body_fat_source = ?,
         waist_cm = ?, chest_cm = ?, hips_cm = ?, thigh_cm = ?, arm_cm = ?,
         shoulders_cm = ?, forearm_cm = ?, ham_cm = ?, calf_cm = ?, notes = ?,
         updated_at = ?
       WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
      [
        data.loggedAt ?? updatedAt,
        data.weightKg ?? null, data.bodyFatPercent ?? null, data.bodyFatSource ?? null,
        data.waistCm ?? null, data.chestCm ?? null, data.hipsCm ?? null,
        data.thighCm ?? null, data.armCm ?? null,
        data.shouldersCm ?? null, data.forearmCm ?? null, data.hamCm ?? null,
        data.calfCm ?? null, data.notes ?? null,
        updatedAt,
        id, userId,
      ],
    );
    // X3 write-through: an EDITED weight also refreshes that day's morning
    // weight (day-upsert), so a correction reaches the trend and the gate.
    if ((result?.changes ?? 0) > 0) await writeThroughMorningWeight(userId, data, updatedAt);
    scheduleSync();
    return (result?.changes ?? 0) > 0;
  }

  // D16 (NAV-2): soft-delete only, same tombstone convention as recipes /
  // food_entries / saved_meals (set deleted_at + bump updated_at, never a hard
  // DELETE), so the deletion is a normal LWW-synced row change: the push side
  // (sync/tables/bodyComposition.js) already stamps deleted_at onto the cloud
  // row from this column, and insertBodyMetricFromCloud already honours an
  // incoming deleted_at, so a delete on one device tombstones cleanly on
  // every other device that pulls it, instead of a resurrecting hard delete.
  async function deleteBodyMetric(userId, id) {
    if (!id || !userId) return false;
    const d = await db();
    const ts = now();
    const result = await d.runAsync(
      `UPDATE body_metric_log SET deleted_at = ?, updated_at = ?
       WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
      [ts, ts, id, userId],
    );
    scheduleSync();
    return (result?.changes ?? 0) > 0;
  }

  return {
    deleteBodyMetric,
    getAllBodyMetricsForUser,
    getBodyMetricLog,
    getBodyMetricUpdatedAt,
    getBodyWeightNearestTo,
    updateBodyMetric,
    getLatestBodyComposition,
    getLatestBodyWeight,
    insertBodyMetricFromCloud,
    logBodyMetric,
  };
}
