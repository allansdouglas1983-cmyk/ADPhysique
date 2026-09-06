/**
 * Source guard for the Partners placement spine (DESIGN-SPEC B8, C1).
 *
 * Pins the placement invariants so the calm entries cannot drift or regress.
 *
 * AMENDED 2026-09-06 (social-discovery blueprint section 1, entry points 2
 * and 4): the two surviving Partners entries became Community.
 *   1. Coach home (historical file: YouScreen) carries the "Community" row
 *      with the people glyph, jumping cross-tab to the Community route in
 *      the Home stack. It is the row that used to say "Partners".
 *   2. ConsistencyScreen carries NO Partners row (founder device-walk
 *      2026-07-03: three entry points read as duplication; the Consistency
 *      row was the most out-of-place and was removed).
 *   3. AnalyticsScreen carries NO Partners tile: it was removed with no
 *      replacement, because Community is not a stat (blueprint section 1,
 *      entry point 4). The Campaign 23 §27 demotion this used to pin is
 *      superseded.
 *   4. HomeScreen stays free of any partner entry, the one-banner invariant.
 */
import fs from 'fs';
import path from 'path';

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

const COACH = read('YouScreen.js');
const CONSISTENCY = read('ConsistencyScreen.js');
const ANALYTICS = read('AnalyticsScreen.js');
const HOME = read('HomeScreen.js');

describe('Coach home Community row (was Partners)', () => {
  test('has a Community NavRow with the people icon', () => {
    expect(COACH).toMatch(/icon="people-outline"/);
    expect(COACH).toMatch(/label="Community"/);
    expect(COACH).not.toMatch(/label="Partners"/);
  });

  // The pro lock affordance ('pro={!isPro}') is REMOVED (D137, fully free
  // product), not inverted: there is no tier to lock behind any more.
  test('carries no pro-lock affordance any more (D137, fully free)', () => {
    expect(COACH).not.toMatch(/pro=\{!isPro\}/);
  });

  test('jumps cross-tab to Community in the Home stack', () => {
    expect(COACH).toMatch(/navigateCrossTab\(navigation, 'HomeTab', 'Community'\)/);
  });
});

describe('ConsistencyScreen carries no Partners row (deduped)', () => {
  // Founder device-walk 2026-07-03: Partners was seeded in three places; the
  // Consistency row was the most out-of-place, so it was removed. Partners
  // keeps the promoted Progress-tab tile and the Coach-tab row.
  test('does not import or render the PartnerRow component', () => {
    expect(CONSISTENCY).not.toMatch(/import PartnerRow from/);
    expect(CONSISTENCY).not.toMatch(/<PartnerRow/);
  });

  test('carries no consistency_row partner attribution', () => {
    expect(CONSISTENCY).not.toMatch(/trackPartnerSurfaceView\('consistency_row'\)/);
  });
});

describe('AnalyticsScreen carries no Partners tile', () => {
  // Blueprint section 1, entry point 4: "the Partners tile is removed (no
  // replacement; Community is not a stat)". The utilities grid keeps its
  // own tiles; nothing takes the vacated slot.
  test('no Partners tile and no partner attribution survive', () => {
    expect(ANALYTICS).not.toMatch(/label="Partners"/);
    expect(ANALYTICS).not.toMatch(/trackPartnerSurfaceView/);
    expect(ANALYTICS).not.toMatch(/navigation\.navigate\('Partner'/);
  });

  test('the grid it sat in is still there (the removal was surgical)', () => {
    expect(ANALYTICS).toMatch(/label="Full history"/);
    expect(ANALYTICS).toMatch(/label="Consistency"/);
  });

  test('no Community tile replaced it', () => {
    expect(ANALYTICS).not.toMatch(/label="Community"/);
  });
});

describe('HomeScreen one-banner invariant', () => {
  test('carries no partner entry of any kind', () => {
    expect(HOME).not.toMatch(/[Pp]artner/);
    expect(HOME).not.toMatch(/trackPartnerSurfaceView/);
  });
});
