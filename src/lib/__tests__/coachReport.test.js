/**
 * coachReport.test.js — pins the coach handover report (B5).
 *
 * What this suite pins and why:
 *  - The FULL variant carries the feature's whole point: the persisted
 *    written reasons ("every decision + why"), the weight trend, and the
 *    phase — regressing any of these guts the artefact.
 *  - The NEUTRAL variant is an ED-safety constraint from the audit ("no
 *    rate/weight emphasis") and must NEVER contain: the weight-trend
 *    section, any bodyweight number, any calorie-change row, the phase
 *    line, or ANY persisted prose note.
 *  - The DISCLOSURE RULE applies to BOTH variants (Wave 4 review blocker):
 *    the PDF is handed to another person, and the engine's persisted prose
 *    includes sentences that reveal SCOFF screening, ED lockouts (including
 *    ones that cleared long ago), cycle flags and safety-floor holds. The
 *    full variant must drop the safety-hold decision types and filter every
 *    prose string; a cross-check against weeklyCoach's ACTUAL reason
 *    strings keeps the filter honest — if the engine rewords, this suite
 *    fails and forces re-verification.
 *  - The fail-closed neutral wiring in the gatherer is pinned at source
 *    level: a failed ED-flag or body-profile read must produce the neutral
 *    variant, never the fuller one, and a positive SCOFF screen joins the
 *    suppression trio exactly as the streak/countdown surfaces do.
 *  - No em dash anywhere in the artefact (voice rule; the lint gate cannot
 *    see src/lib template strings, so it is pinned here).
 * Distinctive fixture values (82.4 kg, -137 kcal, sentinel prose) make the
 * absence assertions precise instead of pattern-guessy.
 */
import fs from 'fs';
import path from 'path';
import { buildCoachReportHtml, DISCLOSURE_PROSE } from '../coachReport';

const WEEK = 7 * 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 3, 6); // Mon 6 Apr 2026

function fixture(overrides = {}) {
  return {
    startMs: T0,
    endMs: T0 + 12 * WEEK,
    generatedAt: T0 + 12 * WEEK,
    neutral: false,
    recap: {
      totalSessions: 30,
      avgSessionsPerWeek: 2.5,
      totalSets: 360,
      tonnage: 240000,
      uniqueExercises: 18,
      topExercises: [{ name: 'Back Squat', sets: 48 }, { name: 'Weighted Pull-up', sets: 36 }],
      topPRs: [{ exerciseName: 'Bench Press', value: 105, reps: 3 }],
    },
    trend: [
      { loggedAt: T0, rawKg: 82.6, ewmaKg: 82.4 },
      { loggedAt: T0 + 11 * WEEK, rawKg: 80.1, ewmaKg: 80.2 },
    ],
    targets: { targetKcal: 2350, proteinG: 180, carbsG: 240, fatG: 70, phase: 'cut' },
    weeks: [
      {
        weekStart: T0 + 10 * WEEK,
        goalPhase: 'cut',
        whyThisWeek: 'SENTINEL-WHY the trend ran ahead of plan this week.',
        adjustments: {
          training: { signal: 'push', note: 'SENTINEL-TRAINING recovery looked strong.' },
          calories: { change: -137, note: 'SENTINEL-CAL losing faster than the planned rate.' },
        },
        deloadSuggested: true,
        deloadNote: 'SENTINEL-DELOAD four hard weeks in a row.',
        dietBreakSuggested: true,
        dietBreakNote: 'SENTINEL-BREAK a planned week at maintenance.',
        heldDecisions: [{ type: 'calorie_change', reason: 'SENTINEL-HELD weight moved fast, so calories were left alone.' }],
        sessionsCompleted: 3,
        sessionsPlanned: 3,
      },
    ],
    ...overrides,
  };
}

// The engine's REAL persisted reason strings (verbatim from weeklyCoach.js;
// the cross-check test below asserts they are still there).
const ENGINE_DISCLOSURE_REASONS = [
  'Calorie cut held. Multiple safety signals are active. See the held-decision card for details.',
  'Hold lifted. The signals that triggered the hold have settled for two weeks. Standard coaching resumes next week.',
  'Calories held. Wellbeing screen flagged restriction concerns.',
  "Calories held. Cycle was flagged this week so the weight reading isn't a reliable signal.",
];

describe('full variant: every decision and its written why', () => {
  const html = buildCoachReportHtml(fixture());

  test('training summary, trend, targets and decisions sections all render', () => {
    expect(html).toContain('<h2>Training</h2>');
    expect(html).toContain('<h2>Weight trend</h2>');
    expect(html).toContain('<h2>Current nutrition targets</h2>');
    expect(html).toContain('<h2>Coaching decisions, week by week</h2>');
  });

  test('the persisted written reasons appear verbatim', () => {
    for (const s of ['SENTINEL-WHY', 'SENTINEL-TRAINING', 'SENTINEL-CAL', 'SENTINEL-DELOAD', 'SENTINEL-BREAK', 'SENTINEL-HELD']) {
      expect(html).toContain(s);
    }
    expect(html).not.toContain('SENTINEL-STEPS');
  });

  test('trend numbers, weekly rate, calorie change, phase and PRs render', () => {
    expect(html).toContain('82.4');
    expect(html).toContain('80.2');
    expect(html).toContain('kg/week');
    expect(html).toContain('137');
    expect(html).toContain('cut');
    expect(html).toContain('Bench Press');
  });

  test('held decisions are labelled as held with the reason', () => {
    expect(html).toContain('Held back this week');
  });

  test('the weekly-rate row needs a fortnight of data behind it', () => {
    const short = buildCoachReportHtml(fixture({
      trend: [
        { loggedAt: T0, rawKg: 82.6, ewmaKg: 82.4 },
        { loggedAt: T0 + 3 * 24 * 60 * 60 * 1000, rawKg: 82.1, ewmaKg: 82.3 },
      ],
    }));
    expect(short).toContain('<h2>Weight trend</h2>');
    expect(short).not.toContain('kg/week');
  });
});

describe('training signal vocabulary matches the engine', () => {
  test("'reduce' renders as a pulled-back week with its note", () => {
    const html = buildCoachReportHtml(fixture({
      weeks: [{
        weekStart: T0,
        adjustments: { training: { signal: 'reduce', note: 'SENTINEL-REDUCE fatigue was climbing.' } },
      }],
    }));
    expect(html).toContain('Volume pulled back');
    expect(html).toContain('SENTINEL-REDUCE');
  });

  test("'hold' renders as held steady; unknown signals drop the row, not the week", () => {
    const html = buildCoachReportHtml(fixture({
      weeks: [{
        weekStart: T0,
        adjustments: {
          training: { signal: 'hold', note: null },
        },
      }],
    }));
    expect(html).toContain('Held steady');
    expect(html).not.toContain('Daily steps');
  });
});

describe('disclosure rule: the FULL variant never reveals screening or safety state', () => {
  const html = buildCoachReportHtml(fixture({
    weeks: [
      {
        weekStart: T0 + 9 * WEEK,
        goalPhase: 'cut',
        whyThisWeek: 'SENTINEL-WHY steady progress.',
        adjustments: { training: { signal: 'push', note: 'SENTINEL-TRAINING fine week.' } },
        heldDecisions: [
          { type: 'ed_pattern_lockout', reason: ENGINE_DISCLOSURE_REASONS[0] },
          { type: 'ffm_floor', reason: 'Calorie target held. Your seven-day average intake of 1400 kcal is at or below your safety floor of 1500 kcal. Eating below this level for long stretches can compromise recovery and lean mass.' },
          { type: 'calories', reason: ENGINE_DISCLOSURE_REASONS[2] },
          { type: 'calories', reason: 'Calories held. Trend is on target.' },
        ],
      },
      {
        weekStart: T0 + 10 * WEEK,
        adjustments: {},
        heldDecisions: [{ type: 'ed_pattern_cleared', reason: ENGINE_DISCLOSURE_REASONS[1] }],
        whyThisWeek: ENGINE_DISCLOSURE_REASONS[3],
      },
    ],
  }));

  test('safety-hold types and screening prose are absent', () => {
    for (const reason of ENGINE_DISCLOSURE_REASONS) {
      expect(html).not.toContain(htmlFragment(reason));
    }
    expect(html).not.toMatch(/wellbeing|restriction|lockout|scoff|safety floor|safety signal|hold lifted/i);
    expect(html).not.toMatch(/\bcycle\b/i);
  });

  test('benign held reasons still render beside the redactions', () => {
    expect(html).toContain('Calories held. Trend is on target.');
    expect(html).toContain('SENTINEL-WHY');
    expect(html).toContain('SENTINEL-TRAINING');
  });

  test("'cycling' in persisted prose is not collateral of the cycle redaction", () => {
    // D95 (Campaign 4): re-anchored off the retired cardio row onto the
    // deload note, another redaction-filtered prose field, so the law
    // survives the feature it used to be demonstrated through (E6a).
    const html = buildCoachReportHtml(fixture({
      weeks: [{
        weekStart: T0,
        adjustments: { training: { signal: 'hold', note: null } },
        deloadSuggested: true,
        deloadNote: 'SENTINEL-SPIN a lighter week after two easy cycling sessions.',
      }],
    }));
    expect(html).toContain('SENTINEL-SPIN');
  });

  // The filter is only as good as its match against the ENGINE's actual
  // vocabulary. Every known disclosure string must trip it; the benign
  // ones must not. If weeklyCoach rewords, the source check below fails
  // and forces this classification to be redone.
  test('DISCLOSURE_PROSE classifies the real engine strings correctly', () => {
    for (const reason of ENGINE_DISCLOSURE_REASONS) {
      expect(DISCLOSURE_PROSE.test(reason)).toBe(true);
    }
    for (const benign of [
      'Calories held. Trend is on target.',
      'Calories held. Last adjustment needs more weeks to show in the trend.',
      "Calories held. Adherence wasn't tracked, so adjusting now would be a guess.",
      "Recovery's flagging across several signals, so next week is lighter to set up the next run.",
    ]) {
      expect(DISCLOSURE_PROSE.test(benign)).toBe(false);
    }
  });

  test('the engine still contains the classified disclosure strings', () => {
    const engine = fs.readFileSync(path.resolve(__dirname, '..', 'weeklyCoach.js'), 'utf8');
    for (const reason of ENGINE_DISCLOSURE_REASONS) {
      expect(engine).toContain(reason.slice(0, 40));
    }
  });
});

// The builder escapes before insertion, so a raw reason never appears
// verbatim — compare against its escaped form.
function htmlFragment(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

describe('neutral variant: no rate or weight emphasis, no prose, no disclosure', () => {
  const html = buildCoachReportHtml(fixture({ neutral: true }));

  test('the weight-trend section and every bodyweight number are absent', () => {
    expect(html).not.toContain('Weight trend');
    expect(html).not.toContain('82.4');
    expect(html).not.toContain('80.2');
    expect(html).not.toContain('kg/week');
  });

  test('calorie-change rows and the phase line are absent', () => {
    expect(html).not.toContain('137');
    expect(html).not.toContain('Calories');
    expect(html).not.toContain('cut');
  });

  test('ALL persisted prose notes are absent (prose can embed rate language)', () => {
    for (const s of ['SENTINEL-WHY', 'SENTINEL-TRAINING', 'SENTINEL-CAL', 'SENTINEL-STEPS', 'SENTINEL-DELOAD', 'SENTINEL-BREAK', 'SENTINEL-HELD']) {
      expect(html).not.toContain(s);
    }
    expect(html).not.toContain('Held back');
    expect(html).not.toContain('Diet break');
  });

  test('PR weights are absent but training facts remain', () => {
    expect(html).not.toContain('Bench Press');
    expect(html).toContain('Sessions completed');
    expect(html).toContain('More work added');
    expect(html).toContain('2,350');
    expect(html).not.toContain('Daily steps');
  });

  test('the artefact never discloses why it is neutral', () => {
    expect(html).not.toMatch(/eating|disorder|wellbeing|calm|flag|scoff/i);
  });
});

describe('robustness', () => {
  test('no em dash in either variant (voice rule; lint cannot see src/lib templates)', () => {
    expect(buildCoachReportHtml(fixture())).not.toContain('—');
    expect(buildCoachReportHtml(fixture({ neutral: true }))).not.toContain('—');
  });

  test('user-adjacent strings are HTML-escaped', () => {
    const html = buildCoachReportHtml(fixture({
      recap: {
        totalSessions: 1,
        avgSessionsPerWeek: 1,
        totalSets: 1,
        tonnage: 100,
        uniqueExercises: 1,
        topExercises: [{ name: '<script>alert(1)</script>', sets: 1 }],
        topPRs: [],
      },
      weeks: [],
    }));
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  test('empty period renders the calm no-sessions line, not a crash', () => {
    const html = buildCoachReportHtml(fixture({
      recap: { totalSessions: 0 },
      trend: [],
      targets: null,
      weeks: [],
    }));
    expect(html).toContain('No completed sessions in this period.');
    expect(html).not.toContain('Current nutrition targets');
    expect(html).not.toContain('Coaching decisions');
  });

  test('a week with nothing to show is skipped entirely', () => {
    const html = buildCoachReportHtml(fixture({ weeks: [{ weekStart: T0, adjustments: {} }] }));
    expect(html).not.toContain('Week commencing');
  });

  test('identical input produces identical output (deterministic)', () => {
    expect(buildCoachReportHtml(fixture())).toBe(buildCoachReportHtml(fixture()));
  });
});

describe('fail-closed neutral wiring in the gatherer (source-pinned)', () => {
  const SRC = fs.readFileSync(path.resolve(__dirname, '..', 'coachReport.js'), 'utf8');

  test("the database reads catch to 'read_failed', never to null", () => {
    // The three SAFETY reads fail closed; the data reads (recap, targets)
    // may degrade to null, so the negative pin is scoped to the safety
    // identifiers only.
    expect(SRC).toMatch(/getOpenEdPatternFlag\(userId\)\.catch\(\(\) => 'read_failed'\)/);
    expect(SRC).toMatch(/getUserBodyProfile\(userId\)\.catch\(\(\) => 'read_failed'\)/);
    // Wellbeing is read RAW from AsyncStorage because getWellbeingMode swallows
    // genuine failures to 'unspecified' (fail open); the raw read yields the
    // 'read_failed' sentinel the neutral check treats as suppress.
    expect(SRC).toMatch(/AsyncStorage\.getItem\(WELLBEING_KEY\)[\s\S]*?\.catch\(\(\) => 'read_failed'\)/);
    expect(SRC).not.toMatch(/getOpenEdPatternFlag\([^)]*\)\.catch\(\(\) => null\)/);
    expect(SRC).not.toMatch(/getUserBodyProfile\([^)]*\)\.catch\(\(\) => null\)/);
    expect(SRC).not.toMatch(/getWellbeingMode\(/);
  });

  test('a failed read or positive SCOFF forces the neutral variant', () => {
    expect(SRC).toMatch(/bodyProfile === 'read_failed'/);
    expect(SRC).toMatch(/bodyProfile\?\.scoffScore\) && bodyProfile\.scoffScore >= 2/);
    expect(SRC).toMatch(/!!edFlag \|\| wellbeing === 'read_failed' \|\| isCalm\(wellbeing\) \|\| scoffPositive/);
  });

  test('the neutral path never reads bodyweight rows', () => {
    expect(SRC).toMatch(/neutral \? Promise\.resolve\(\[\]\) : getMorningWeights/);
  });
});
