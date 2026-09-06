/**
 * Today truth repair — founder rulings, pinned as product law.
 *
 * RULING 1. The user-facing weekly RUN/STREAK construct ("N weeks running",
 * "Your run carries on", the kept/paused glyph strip, run milestones and
 * their share cards) is rejected product-wide: noise, not trusted as
 * accurate, and unwanted streak framing. It is removed, not renamed and not
 * redesigned - there is no replacement badge and no "N weeks consistent".
 *
 * RULING 2. First-review ELIGIBILITY counters are not "what your coach is
 * reading". buildCoachLedger's weigh-in row is
 * `Math.min(weighIns7d, MIN_WEIGH_INS)`, so 3, 4, 5, 6 or 7 qualifying
 * mornings all render "3 of 3": a THRESHOLD/GATE counter, not an ongoing
 * description of what the coach understands. Today must not present that
 * plumbing as athlete insight, so both Today surfaces that did (the S3 daily
 * brief and the trial banner's ledger rows) are removed.
 *
 * RULING 3. No content beats low-value filler: nothing was invented to fill
 * either gap.
 *
 * WHAT IS DELIBERATELY KEPT, and why it is not the same feature:
 *   - The coachLedger MATHS and its legitimate first-review consumers: the
 *     CoachOutputScreen insufficient-data hold receipt (buildHoldReceipt) and
 *     the You tab's coach-readiness surface. Those are the places an athlete
 *     genuinely needs to know why their FIRST review is held.
 *   - The PARTNER shared streak ("N weeks running together") was the one
 *     documented exception: a mutual two-person artefact with its own
 *     derivation rather than Volyume counting a solo run at the athlete. It
 *     left the tree with the Partners feature (SD-03, retired 2026-09-06),
 *     so the sweep below now carries no partner-lane exemption at all.
 *   - Ordinary English "N weeks running" in coaching prose (ReadinessCards'
 *     soreness/sleep warnings, weeklyCoach's escalation rationale,
 *     whyThisTemplates' ED lockout copy, coachResponse's on-target verdicts).
 *     These describe consecutive weeks of a measurement; none is a badge, a
 *     count presented as an achievement, or a thing that can be broken.
 *   - Factual weekly counts ("3 sessions completed this week"), which are
 *     training truth, not a run.
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(SRC, p), 'utf8');

const HOME = read('screens/HomeScreen.js');
const YOU = read('screens/YouScreen.js');

// Every production surface a user can actually look at. Excludes __tests__.
function productionFiles() {
  const out = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '__tests__' || entry.name === '__mocks__') continue;
        walk(full);
        continue;
      }
      if (entry.name.endsWith('.js')) out.push(full);
    }
  })(SRC);
  return out;
}

describe('Ruling 1: the weekly run/streak construct is gone from Today', () => {
  test('Home renders no "week(s) running" and no "your run" copy', () => {
    // The removal comments deliberately quote what was killed, so assert on
    // the RENDERED strings (a JSX string literal or template), never on the
    // words appearing anywhere in the file.
    const rendered = HOME.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(rendered).not.toMatch(/weeks? running/i);
    expect(rendered).not.toMatch(/your run/i);
    expect(rendered).not.toMatch(/run carries on/i);
  });

  test('Home no longer imports or renders ConsistencyEcho, and the component is deleted', () => {
    expect(HOME).not.toContain('<ConsistencyEcho');
    expect(HOME).not.toContain("from '../components/ConsistencyEcho'");
    expect(fs.existsSync(path.join(SRC, 'components/ConsistencyEcho.js'))).toBe(false);
  });

  test('the solo streak UI components and their view-model hook are deleted outright', () => {
    for (const p of [
      'components/ConsistencyEcho.js',
      'components/StreakWeeksSection.js',
      'components/WeeklyStreakStrip.js',
      'hooks/useWeeklyStreak.js',
    ]) {
      expect(fs.existsSync(path.join(SRC, p))).toBe(false);
    }
  });

  test('no production file renders the run/streak construct anywhere (bounded sweep)', () => {
    // Anything that would put a run count, a broken/continuing run, or the
    // rejected streak vocabulary on screen. The partner lane used to be the
    // one documented exception; it retired with the feature, so the sweep is
    // now unconditional.
    const offenders = [];
    for (const file of productionFiles()) {
      // Normalize Windows separators before applying the documented prose
      // allowlist. The old forward-slash-only comparison made intentional
      // coaching prose fail only on Windows.
      const rel = path.relative(SRC, file).split(path.sep).join('/');
      const body = fs.readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      // Only flag the CONSTRUCT: a run that carries on / can be broken /
      // is paused, or a rendered "weeks running" badge string. Plain
      // coaching prose using "weeks running" as ordinary English is
      // whitelisted by file below, with the reason in the header note.
      const PROSE_OK = new Set([
        'components/ReadinessCards.js',
        'lib/coachResponse.js',
        'lib/weeklyCoach.js',
        'lib/whyThisTemplates.js',
        'lib/streak.js',
      ]);
      if (/run carries on|breaks your run|pause your run|your run carried on/i.test(body)) {
        offenders.push(`${rel}: run-construct copy`);
      }
      if (!PROSE_OK.has(rel) && /weeks? running/i.test(body)) {
        offenders.push(`${rel}: "weeks running" badge copy`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test('no replacement streak badge was invented (no "weeks consistent" rename)', () => {
    // Rendered copy only: internal modules may still DESCRIBE the retired
    // construct in their own comments (streakState.js's persistence docs),
    // which is history, not a surface the user can read.
    for (const file of productionFiles()) {
      const body = fs.readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      expect(body).not.toMatch(/weeks? consistent\b/i);
      expect(body).not.toMatch(/consistency (run|streak)\b/i);
    }
  });

  test('the home-screen widget keeps its factual session count and drops the run line', () => {
    const widget = read('widgets/widgets.js');
    const snapshot = read('lib/widgets/snapshot.js');
    const writer = read('lib/widgets/writer.js');
    // Factual content survives, in both the JS widget and the published
    // snapshot contract.
    expect(snapshot).toContain('sessions this week');
    expect(widget).toContain('THIS WEEK');
    // The run is gone from the whole widget lane, including the payload.
    for (const body of [widget, snapshot, writer]) {
      expect(body).not.toMatch(/streakWeeks/);
    }
    // The native widget must not render it either, and its decoder must not
    // REQUIRE the dropped field (an older binary paired with newer JSON would
    // otherwise fail to decode the whole consistency block).
    const swift = fs.readFileSync(
      path.join(SRC, '..', 'modules/live-activity/widget/VolyumeHomeWidgets.swift'), 'utf8',
    );
    expect(swift).toContain('let streakWeeks: Int?');
    expect(swift).not.toMatch(/weeks"\) running|weeks\) running/);
    expect(swift.replace(/^\s*\/\/.*$/gm, '')).not.toMatch(/c\.streakWeeks/);
  });
});

describe('Ruling 2: Today shows no first-review threshold counters', () => {
  test('Home no longer imports or renders CoachDailyBrief, and the component is deleted', () => {
    expect(HOME).not.toContain('<CoachDailyBrief');
    expect(HOME).not.toContain("from '../components/CoachDailyBrief'");
    expect(fs.existsSync(path.join(SRC, 'components/CoachDailyBrief.js'))).toBe(false);
  });

  test('Home builds no coach ledger at all, so no threshold row can reach Today', () => {
    expect(HOME).not.toContain('buildCoachLedger');
    expect(HOME).not.toContain("from '../lib/coachLedger'");
    // The dead runway plumbing that existed solely to feed the brief is gone.
    expect(HOME).not.toContain('coachRunway');
    expect(HOME).not.toContain('loadCoachRunway');
  });

  // FOUNDER DECISION (fully free, no tier split, no trial): the everyday
  // trial banner (and AttentionCard, the component that rendered it) is
  // retired entirely, not merely rehomed -- neither Home nor YouScreen
  // carries any trial-banner state any more.
  test('the trial banner is retired entirely: no state on Home or YouScreen, and AttentionCard is deleted', () => {
    expect(HOME).not.toContain('setTrialBanner');
    expect(YOU).not.toMatch(/trialBanner/);
    expect(fs.existsSync(path.join(SRC, 'components/AttentionCard.js'))).toBe(false);
  });

  test('"What your coach is reading" is unreachable from Today', () => {
    // The string still exists in the ledger module (its legitimate consumers
    // render it), but nothing on Today can put it on screen.
    expect(read('lib/coachLedger.js')).toContain('What your coach is reading');
    expect(HOME).not.toContain('What your coach is reading');
  });
});

describe('Ruling 2: the ledger maths and its legitimate consumers are untouched', () => {
  test('buildCoachLedger still produces the exact published threshold rows', () => {
    // eslint-disable-next-line global-require
    const { buildCoachLedger } = require('../lib/coachLedger');
    // eslint-disable-next-line global-require
    const { MIN_WEIGH_INS, FIRST_CHECKIN_MIN_DAYS } = require('../lib/trialActivation');
    const now = Date.UTC(2026, 6, 1);
    const l = buildCoachLedger({
      weighIns7d: 2, completedSessions: 1,
      firstWeightAt: now - 3 * 86400000, checkinDay: 0, now,
    });
    expect(l.variant).toBe('full');
    expect(l.title).toBe('What your coach is reading');
    expect(l.rows.map(r => r.key)).toEqual(['weighIns', 'days', 'sessions']);
    expect(l.rows[0].label).toBe(`2 of ${MIN_WEIGH_INS} mornings with a weigh-in in the last 7 days`);
    expect(l.rows[1].label).toBe(`Day 4 of ${FIRST_CHECKIN_MIN_DAYS} days of data`);
    // The gate-counter clamp that made this wrong AS TODAY PRESENTATION is
    // itself unchanged - it is correct for a readiness gate.
    const over = buildCoachLedger({ weighIns7d: 7, completedSessions: 1, now });
    expect(over.rows[0].label).toBe(`${MIN_WEIGH_INS} of ${MIN_WEIGH_INS} mornings with a weigh-in in the last 7 days`);
  });

  test('the ED-flag neutral variant still drops every weigh-in count', () => {
    // eslint-disable-next-line global-require
    const { buildCoachLedger } = require('../lib/coachLedger');
    const l = buildCoachLedger({ weighIns7d: 5, edFlagOpen: true, now: Date.UTC(2026, 6, 1) });
    expect(l.variant).toBe('neutral');
    expect(l.rows).toEqual([]);
  });

  test('the insufficient-data hold receipt still works and still names the thresholds', () => {
    // eslint-disable-next-line global-require
    const { buildHoldReceipt } = require('../lib/coachLedger');
    // eslint-disable-next-line global-require
    const { MIN_WEIGH_INS, FIRST_CHECKIN_MIN_DAYS } = require('../lib/trialActivation');
    const r = buildHoldReceipt({
      weighIns7d: 1, completedSessions: 0,
      firstWeightAt: Date.UTC(2026, 5, 25), checkinDay: 0, now: Date.UTC(2026, 6, 1),
    });
    expect(r.ledger.rows.length).toBe(3);
    expect(r.rule).toContain(String(MIN_WEIGH_INS));
    expect(r.rule).toContain(String(FIRST_CHECKIN_MIN_DAYS));
    expect(r.unlockLine).toBeTruthy();
  });

  test('the first-review gate constants themselves are unchanged', () => {
    // eslint-disable-next-line global-require
    const { MIN_WEIGH_INS, FIRST_CHECKIN_MIN_DAYS } = require('../lib/trialActivation');
    expect(MIN_WEIGH_INS).toBe(3);
    expect(FIRST_CHECKIN_MIN_DAYS).toBe(5);
  });

  test('the dedicated first-review surfaces still consume the ledger', () => {
    // CoachOutputScreen's insufficient-data hold, and the You tab's
    // coach-readiness block: the two places this genuinely belongs.
    expect(read('screens/CoachOutputScreen.js')).toContain("buildHoldReceipt } from '../lib/coachLedger'");
    expect(read('screens/YouScreen.js')).toContain('buildCoachLedger');
    expect(read('screens/YouScreen.js')).toContain('setCoachReadiness');
  });
});

describe('Ruling 3: nothing was invented to fill the gaps', () => {
  test('no new coach/readiness/score card appeared on Today', () => {
    const rendered = HOME.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(rendered).not.toMatch(/readiness score/i);
    expect(rendered).not.toMatch(/athlete score/i);
    expect(rendered).not.toMatch(/<CoachDailyBrief|<ConsistencyEcho|<WeeklyStreakStrip|<StreakWeeksSection/);
  });
});

describe('Task 3: the morning-weight Log button shares the row alignment', () => {
  const STRIP = read('components/TodayStrip.js');

  test('both Log buttons re-assert centre against the shared Button alignSelf', () => {
    // The shared Button applies `alignSelf: fullWidth ? 'stretch' :
    // 'flex-start'`, and both Log buttons are fullWidth={false} - so the
    // button's own alignSelf beat the row's alignItems: 'center' and pinned
    // it to the top of the row. Centring is re-asserted on the button styles
    // themselves, not compensated with a device-specific offset.
    expect(read('components/Button.js')).toContain("alignSelf: fullWidth ? 'stretch' : 'flex-start'");
    expect(STRIP).toMatch(/metricAction: \{[\s\S]*?alignSelf: 'center',[\s\S]*?\},/);
    expect(STRIP).toMatch(/logBtn: \{[\s\S]*?alignSelf: 'center',[\s\S]*?\},/);
    // No magic numbers: the fix adds no top/bottom offset.
    expect(STRIP).not.toMatch(/marginTop: -\d/);
    expect(STRIP).not.toMatch(/top: -\d/);
  });

  test('the rows still declare one shared centred alignment', () => {
    expect(STRIP).toMatch(/metricRow: \{[\s\S]*?alignItems: 'center',/);
    expect(STRIP).toMatch(/inputRow: \{ flexDirection: 'row', alignItems: 'center'/);
  });

  test('logging behaviour, states and accessibility are unchanged', () => {
    expect(STRIP).toContain('accessibilityLabel="Log morning weight"');
    expect(STRIP).toContain('onPress={submitWeight}');
    expect(STRIP).toContain('disabled={!hasDraft || savingWeight}');
    expect(STRIP).toContain('accessibilityState={{ disabled: !hasDraft || savingWeight }}');
    // Logged-today and not-logged states both survive.
    expect(STRIP).toContain('todayWeight != null ? <WeightLogged /> : <WeightEmpty />');
    expect(STRIP).toContain('Not logged yet');
    expect(STRIP).toContain('minHeight: 30');
    expect(STRIP).toContain('minWidth: 76');
  });
});

describe('no coaching engine behaviour changed', () => {
  test('this repair touched presentation only - the engines are byte-untouched', () => {
    // A tripwire on the modules this run must never have edited: if a future
    // "Today cleanup" reaches into the engines, this fails loudly.
    for (const p of ['lib/weeklyCoach.js', 'lib/nutritionEngine.js', 'lib/planEngine.js', 'lib/coachApply.js']) {
      expect(fs.existsSync(path.join(SRC, p))).toBe(true);
    }
    // The ED-safety and gate levers the rulings explicitly protected.
    expect(read('lib/trialActivation.js')).toContain('MIN_WEIGH_INS');
    expect(read('lib/coachLedger.js')).toContain('edFlagOpen');
  });
});
