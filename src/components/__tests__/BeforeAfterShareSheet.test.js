/**
 * BeforeAfterShareSheet — pure-helper contract.
 *
 * The sheet's Skia/native paths are exercised by the drawShareCard renderer
 * test; here we pin the pure logic the card composition depends on: the neutral
 * elapsed-time label, older→newer ordering, the default earliest-vs-latest pair,
 * and the params builder — including the two founder-rule invariants that matter
 * for ED-safety:
 *   1. the weight toggle drops the weight when off and is opt-in in the UI, and
 *   2. the card NEVER carries name/measurements — only date + weight per photo.
 *
 * The component module is import-guarded (Skia/expo modules are lazy try/catch),
 * so we stub the store + suppression hook to keep the import off the DB chain,
 * exactly as the sibling component tests do.
 */
jest.mock('../../store/useAppStore', () => ({ __esModule: true, default: () => undefined }));
jest.mock('../../hooks/usePhotoSuppression', () => ({ __esModule: true, default: () => true }));
jest.mock('../../lib/progressPhotoMeta', () => ({ __esModule: true, getPhotoMetaMap: async () => ({}) }));
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'Light', Medium: 'Medium', Heavy: 'Heavy' },
  NotificationFeedbackType: { Success: 'Success', Warning: 'Warning', Error: 'Error' },
}));

import {
  elapsedLabel,
  orderPair,
  defaultPair,
  buildBeforeAfterParams,
  formatCardDate,
  formatShareScanRange,
} from '../BeforeAfterShareSheet';

const DAY = 86400000;
const WEEK = 7 * DAY;

describe('formatCardDate', () => {
  test('renders a British date string for a valid timestamp', () => {
    const s = formatCardDate(Date.UTC(2026, 2, 3, 12, 0, 0)); // 3 Mar 2026
    expect(typeof s).toBe('string');
    expect(s).toMatch(/2026/);
    expect(s.length).toBeGreaterThan(0);
  });
  test('empty string for a bad timestamp', () => {
    expect(formatCardDate(undefined)).toBe('');
    expect(formatCardDate(NaN)).toBe('');
    expect(formatCardDate('nope')).toBe('');
  });
});

describe('elapsedLabel (neutral, time-only)', () => {
  const base = Date.UTC(2026, 0, 1);
  test('same day', () => {
    expect(elapsedLabel(base, base)).toBe('Same day');
  });
  test('single day', () => {
    expect(elapsedLabel(base, base + DAY)).toBe('1 day');
  });
  test('days below a fortnight', () => {
    expect(elapsedLabel(base, base + 13 * DAY)).toBe('13 days');
  });
  test('weeks read as weeks (spec: "14 weeks")', () => {
    expect(elapsedLabel(base, base + 14 * WEEK)).toBe('14 weeks');
    expect(elapsedLabel(base, base + 2 * WEEK)).toBe('2 weeks');
  });
  test('order does not matter (absolute elapsed)', () => {
    expect(elapsedLabel(base + 14 * WEEK, base)).toBe('14 weeks');
  });
  test('months beyond ~6 months', () => {
    expect(elapsedLabel(base, base + 210 * DAY)).toBe('7 months');
  });
  test('years for a year or more', () => {
    expect(elapsedLabel(base, base + 400 * DAY)).toMatch(/^1 year/);
  });
  test('empty for bad input', () => {
    expect(elapsedLabel(undefined, base)).toBe('');
    expect(elapsedLabel(base, 'x')).toBe('');
  });
});

describe('orderPair (older-left / newer-right)', () => {
  const a = { name: 'a', ts: 100 };
  const b = { name: 'b', ts: 200 };
  test('sorts by timestamp regardless of argument order', () => {
    expect(orderPair(a, b)).toEqual([a, b]);
    expect(orderPair(b, a)).toEqual([a, b]);
  });
  test('tolerates a missing side', () => {
    expect(orderPair(a, null)).toEqual([a, null]);
    expect(orderPair(null, b)).toEqual([b, null]);
  });
});

describe('defaultPair (earliest vs latest)', () => {
  test('picks the oldest and newest names', () => {
    const photos = [
      { name: 'mid.jpg', ts: 200 },
      { name: 'new.jpg', ts: 300 },
      { name: 'old.jpg', ts: 100 },
    ];
    expect(defaultPair(photos)).toEqual(['old.jpg', 'new.jpg']);
  });
  test('single photo yields one name', () => {
    expect(defaultPair([{ name: 'only.jpg', ts: 1 }])).toEqual(['only.jpg']);
  });
  test('empty / invalid input yields nothing', () => {
    expect(defaultPair([])).toEqual([]);
    expect(defaultPair(null)).toEqual([]);
    expect(defaultPair([{ name: 'x', ts: NaN }])).toEqual([]);
  });
});

describe('buildBeforeAfterParams', () => {
  const older = Date.UTC(2026, 0, 1);
  const newer = older + 14 * WEEK;

  test('square is the default aspect and is square', () => {
    const p = buildBeforeAfterParams({ olderTakenAt: older, newerTakenAt: newer, showWeight: false });
    expect(p.cardType).toBe('beforeAfter');
    expect(p.aspect).toBe('square');
    expect(p.isSquare).toBe(true);
    expect(p.elapsedLabel).toBe('14 weeks');
  });

  test('story aspect is not square', () => {
    const p = buildBeforeAfterParams({ olderTakenAt: older, newerTakenAt: newer, aspect: 'story', showWeight: false });
    expect(p.aspect).toBe('story');
    expect(p.isSquare).toBe(false);
  });

  test('portrait aspect is kept and is square-height class', () => {
    const p = buildBeforeAfterParams({ olderTakenAt: older, newerTakenAt: newer, aspect: 'portrait', showWeight: false });
    expect(p.aspect).toBe('portrait');
    expect(p.isSquare).toBe(true);
  });

  test('an unknown aspect falls back to square', () => {
    const p = buildBeforeAfterParams({ olderTakenAt: older, newerTakenAt: newer, aspect: 'weird', showWeight: false });
    expect(p.aspect).toBe('square');
  });

  test('weight shown when toggle on and a weight exists (in the user unit)', () => {
    const p = buildBeforeAfterParams({
      olderTakenAt: older, newerTakenAt: newer,
      olderWeightKg: 82.4, newerWeightKg: 78.1,
      showWeight: true, bodyWeightUnits: 'kg',
    });
    expect(p.before.weight).toMatch(/kg/);
    expect(p.after.weight).toMatch(/kg/);
  });

  test('weight dropped when the toggle is off', () => {
    const p = buildBeforeAfterParams({
      olderTakenAt: older, newerTakenAt: newer,
      olderWeightKg: 82.4, newerWeightKg: 78.1,
      showWeight: false,
    });
    expect(p.before.weight).toBe('');
    expect(p.after.weight).toBe('');
  });

  test('weight dropped when no weight snapshot exists even with the toggle on', () => {
    const p = buildBeforeAfterParams({
      olderTakenAt: older, newerTakenAt: newer,
      olderWeightKg: null, newerWeightKg: undefined,
      showWeight: true,
    });
    expect(p.before.weight).toBe('');
    expect(p.after.weight).toBe('');
  });

  test('respects the body-weight unit', () => {
    const p = buildBeforeAfterParams({
      olderTakenAt: older, newerTakenAt: newer,
      olderWeightKg: 82.4, newerWeightKg: 78.1,
      showWeight: true, bodyWeightUnits: 'lbs',
    });
    expect(p.before.weight).toMatch(/lbs/);
  });

  const scoredScan = (score, band = 'Lean') => ({
    signals: {
      physiqueAssessment: {
        visualLeannessScore: score,
        leannessBandLabel: band,
      },
    },
  });

  test('scan score is included only when a scan has a physique assessment', () => {
    expect(formatShareScanRange({ estimateRangeLow: 10, estimateRangeHigh: 23.6 })).toBe('');
    expect(formatShareScanRange(scoredScan(66))).toBe('Lean 66/100');
    expect(formatShareScanRange({ analysisStatus: 'measured' })).toBe('');
    const p = buildBeforeAfterParams({
      olderTakenAt: older,
      newerTakenAt: newer,
      olderScan: scoredScan(54, 'Defined'),
      newerScan: scoredScan(66, 'Lean'),
      showWeight: false,
    });
    expect(p.before.scanRange).toBe('Defined 54/100');
    expect(p.after.scanRange).toBe('Lean 66/100');
    expect(p.before.weight).toBe('');
    expect(p.after.weight).toBe('');
  });

  test('scan scores are removed when the hide-exact preference is active', () => {
    const p = buildBeforeAfterParams({
      olderTakenAt: older,
      newerTakenAt: newer,
      olderWeightKg: 82.4,
      newerWeightKg: 78.1,
      olderScan: scoredScan(54, 'Defined'),
      newerScan: scoredScan(66, 'Lean'),
      showWeight: true,
      showScanRange: false,
      showScanWeight: false,
    });
    expect(p.before.scanRange).toBeUndefined();
    expect(p.after.scanRange).toBeUndefined();
    expect(p.before.weight).toBe('');
    expect(p.after.weight).toBe('');
  });

  // FOUNDER-RULE INVARIANT: the card carries only date, optional scan score and
  // weight per photo. Name, measurements and private notes must never appear on
  // it (weight and scan score are both withheld upstream under calm/ED).
  test('per-photo payload is date + weight only, never name/measurements', () => {
    const p = buildBeforeAfterParams({
      olderTakenAt: older, newerTakenAt: newer,
      olderWeightKg: 82.4, newerWeightKg: 78.1, showWeight: true,
    });
    expect(Object.keys(p.before).sort()).toEqual(['date', 'weight']);
    expect(Object.keys(p.after).sort()).toEqual(['date', 'weight']);
    for (const banned of ['name', 'measurements', 'note', 'height', 'chest', 'waist']) {
      expect(p.before).not.toHaveProperty(banned);
      expect(p.after).not.toHaveProperty(banned);
    }
  });
});
