/**
 * Source-level regression guard for X-SAFETY-06 (Campaign 21 Step 12
 * hostile review, SCREEN/PERSISTENCE lane, GAP B): the fail-closed
 * ED/calm suppression pattern repeated at four independent sites in
 * scheduler.js, only one of which (the winback push, exercised in
 * scenarios.conflict.test.js) had any behavioural coverage before this
 * suite. scheduler.js pulls in the full expo-notifications/AsyncStorage/
 * store stack at import time, so a source guard (this file) plus ONE
 * mocked-IO behavioural test on a second site
 * (notificationSuppression.test.js) is the same split used elsewhere in
 * this suite (scheduler.copyFixes.guard.test.js is the house convention
 * for source-level pins on this exact file).
 *
 * The shared pattern at every site:
 *   1. `getOpenEdPatternFlag(...)` is read through `.catch(() => 'read_failed')`
 *      so a THROWN read never leaves the caller with an unresolved promise
 *      or a falsy/undefined value -- it resolves to the truthy sentinel
 *      string 'read_failed' instead, and that truthy value takes the
 *      suppression branch exactly as a genuinely-open flag would (fail
 *      CLOSED: a transient read failure suppresses, it never silently
 *      allows the push through).
 *   2. `if (edFlag)` immediately follows, retiring/cancelling the relevant
 *      notification(s) before any push is scheduled. A fifth site,
 *      schedulePartnerBeats, suppressed by bare return; it went with the
 *      Partners feature (SD-03, retired 2026-09-06), so there is no partner
 *      push left to gate.
 *
 * scheduleWinbackNotification additionally reads calm mode
 * (getWellbeingMode/isCalm) as a second, ORed suppression input (C6 R-17 /
 * D97-22): this is the only one of these sites where a calm-mode read
 * exists, and its OWN failure mode is pinned separately below -- the
 * surrounding try/catch treats a THROWN calm read as suppression too (the
 * catch cancels and returns), not as "calm mode off".
 *
 * Exact source snippets below were verified against scheduler.js before
 * writing these regexes (each site printed and read in full); production
 * code is unchanged, this suite only pins what already exists.
 *
 * 2026-08-26 (Sentry VOLYUME-1K native-crash fix): every scheduling call in
 * this file now goes through `scheduleCheckedNotification(...)` from
 * ./triggerDate instead of `Notifications.scheduleNotificationAsync(...)`,
 * so the ordering assertions below anchor on the new symbol. The ED/calm
 * suppression behaviour these tests pin is UNCHANGED: the flag is still read
 * fail-closed and still acted on before any push is laid, at all five sites.
 * Only the name of the call it must precede has moved.
 */
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'scheduler.js'), 'utf8');

// Slice out one function body by its `export async function NAME(` anchor,
// bounded by the next top-level `export async function` (or end of file).
// This keeps each site's assertions scoped to that site only, so a pattern
// match can never accidentally land on a neighbouring function.
function functionBody(name) {
  const startAnchor = `export async function ${name}(`;
  const start = SRC.indexOf(startAnchor);
  if (start === -1) throw new Error(`function ${name} not found in scheduler.js`);
  const nextExportFn = SRC.indexOf('\nexport async function ', start + startAnchor.length);
  const end = nextExportFn === -1 ? SRC.length : nextExportFn;
  return SRC.slice(start, end);
}

describe('scheduler.js: getOpenEdPatternFlag fail-closed wrapping, all five X-SAFETY-06 sites', () => {
  test('scheduleWinbackNotification (site :893): read fails closed and suppresses via cancel + return', () => {
    const body = functionBody('scheduleWinbackNotification');
    expect(body).toMatch(
      /const edFlag = userId \? await db\.getOpenEdPatternFlag\(userId\)\.catch\(\(\) => 'read_failed'\) : null;/,
    );
    expect(body).toContain("if (edFlag) { await cancelWinbackNotification(); return; }");
    // The suppression check must gate the push: it appears strictly before
    // the notification is scheduled.
    expect(body.indexOf('const edFlag = ')).toBeLessThan(
      body.indexOf('scheduleCheckedNotification('),
    );
  });

  test('scheduleMissedCheckinFollowups (site :1031): read fails closed and suppresses via cancel + return', () => {
    const body = functionBody('scheduleMissedCheckinFollowups');
    expect(body).toMatch(
      /const edFlag = userId \? await db\.getOpenEdPatternFlag\(userId\)\.catch\(\(\) => 'read_failed'\) : null;/,
    );
    expect(body).toMatch(
      /if \(edFlag\) \{\s*\n\s*await cancelMissedCheckinFollowups\(\);\s*\n\s*return;\s*\n\s*\}/,
    );
    expect(body.indexOf('const edFlag = ')).toBeLessThan(
      body.indexOf('scheduleCheckedNotification('),
    );
  });

  test('scheduleActivationNudge (site :1151): read fails closed and suppresses via cancel + return', () => {
    const body = functionBody('scheduleActivationNudge');
    expect(body).toMatch(
      /const edFlag = await db\.getOpenEdPatternFlag\(uid\)\.catch\(\(\) => 'read_failed'\);/,
    );
    expect(body).toContain('if (edFlag) { await cancelActivationNudge(); return; }');
    expect(body.indexOf('const edFlag = ')).toBeLessThan(
      body.indexOf('scheduleCheckedNotification('),
    );
  });

  test('schedulePlannedMealConfirm (site :1245, the food-push site): read fails closed and suppresses via cancel + return', () => {
    const body = functionBody('schedulePlannedMealConfirm');
    expect(body).toMatch(
      /const edFlag = await db\.getOpenEdPatternFlag\(uid\)\.catch\(\(\) => 'read_failed'\);/,
    );
    expect(body).toContain('if (edFlag) { await cancelPlannedMealConfirm(); return; }');
    expect(body.indexOf('const edFlag = ')).toBeLessThan(
      body.indexOf('scheduleCheckedNotification('),
    );
  });

  test('schedulePartnerBeats is gone with the Partners feature, not silently ungated', () => {
    // SD-03 (2026-09-06): the partner beats were removed outright rather
    // than left scheduling without their ED gate. Pinned here so the site
    // cannot come back without a gate and a test.
    expect(SRC).not.toMatch(/schedulePartnerBeats/);
  });
});

describe('scheduler.js: scheduleWinbackNotification calm-mode read also fails CLOSED (C6 R-17 / D97-22)', () => {
  const body = functionBody('scheduleWinbackNotification');

  test('calm mode is read via the shared getWellbeingMode/isCalm helpers, not a bespoke check', () => {
    // Assembled from two halves so the check-imports scanner never misreads
    // this ASSERTION STRING (which pins scheduler.js's own, correctly
    // relative require) as an import belonging to THIS test file.
    expect(body).toContain('const { getWellbeingMode, isCalm } = ' + "require('../wellbeing');");
  });

  test("a rejected calm-mode read defaults to the SAFEST value ('calm'), never silently ignored", () => {
    expect(body).toContain("const mode = await getWellbeingMode().catch(() => 'calm');");
  });

  test('the calm-mode read sits inside its OWN try/catch whose catch branch ALSO suppresses (cancel + return)', () => {
    // try {
    //   const { getWellbeingMode, isCalm } from the shared wellbeing module
    //   const mode = await getWellbeingMode().catch(() => 'calm');
    //   if (isCalm(mode)) { await cancelWinbackNotification(); return; }
    // } catch (_) { await cancelWinbackNotification(); return; }
    //
    // So a THROW anywhere in the calm-read block (not just a rejected
    // getWellbeingMode promise, which is already defaulted above) still
    // suppresses -- the outer catch is a second, independent fail-closed
    // layer, not a duplicate of the inner .catch().
    expect(body).toMatch(
      /try \{\s*\n\s*\/\/ eslint-disable-next-line global-require\s*\n\s*const \{ getWellbeingMode, isCalm \} = require\('\.\.\/wellbeing'\);\s*\n\s*const mode = await getWellbeingMode\(\)\.catch\(\(\) => 'calm'\);\s*\n\s*if \(isCalm\(mode\)\) \{ await cancelWinbackNotification\(\); return; \}\s*\n\s*\} catch \(_\) \{ await cancelWinbackNotification\(\); return; \}/,
    );
  });

  test('an open (or unreadable) calm mode suppresses via the shared cancel + return, mirroring the edFlag branch', () => {
    expect(body).toContain('if (isCalm(mode)) { await cancelWinbackNotification(); return; }');
  });

  test('the calm-mode check runs strictly AFTER the edFlag check (ED read is the primary fail-closed layer, calm is additive)', () => {
    const edIdx = body.indexOf('if (edFlag) { await cancelWinbackNotification(); return; }');
    const calmIdx = body.indexOf("const { getWellbeingMode, isCalm }");
    expect(edIdx).toBeGreaterThan(-1);
    expect(calmIdx).toBeGreaterThan(edIdx);
  });
});
