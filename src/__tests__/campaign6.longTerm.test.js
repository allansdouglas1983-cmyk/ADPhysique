/**
 * campaign6.longTerm.test.js — the Campaign 6 long-term product-law
 * matrix (order Phase 61). Grown phase by phase alongside the campaign;
 * the six-block athlete and the longitudinal engine characterisations
 * live in their own suites (campaign6.sixBlock.test.js,
 * campaign6.longitudinal.test.js).
 *
 * Laws pinned here: memory must help never trap; no personalisation
 * without provenance; lapse is not failure.
 */
import fs from 'fs';
import path from 'path';

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

describe('PHASE 7: stale history is never called recent (D97)', () => {
  test('the readiness baseline label does not claim recency the row-limited query cannot promise', () => {
    const src = stripComments(read('lib/blockAdvisor.js'));
    expect(src).toContain('Readiness a bit below your personal baseline');
    expect(src).not.toContain('below your recent average');
  });

  test('the goal-setup weight note states the last logged weight, not a recent trend', () => {
    const src = stripComments(read('screens/ProGoalSetupScreen.js'));
    expect(src).toContain('Targets use your last logged weight');
    expect(src).not.toContain('your recent weight trend');
  });

  test('the surfaces that DO say "recent" are genuinely date-windowed', () => {
    // The habit-derived reminder claim ("your recent workouts") rests on a
    // 6-week trailing calendar window; the check-in comparative verdicts
    // ("your usual") rest on the CALENDAR prior week, so a lapse return
    // refuses them (hasPriorWeek false). Pinned so a refactor that swaps
    // either to a row-limited read fails here.
    expect(read('lib/notifications/trainingHabitSchedule.js'))
      .toMatch(/HABIT_WINDOW_WEEKS = 6/);
    const checkin = read('screens/WeeklyCheckInScreen.js');
    expect(checkin).toMatch(/const hasPriorWeek = Number\.isFinite\(volLastWeek\) && volLastWeek > 0;/);
    // The workload card hides rather than comparing against nothing.
    expect(read('components/ProgressSections.js'))
      .toMatch(/if \(!data \|\| data\.ratio === null\) return null;/);
  });

  test('"your last block" and "set by how your last block went" remain temporal identity, not recency claims', () => {
    // These stay legal at any age: the last block IS the last block.
    expect(read('lib/blockExplain.js')).toContain("seed_ledger: 'set by how your last block went'");
  });
});

describe('PHASE 2 finding: the adaptive bands read the genuinely most recent sessions (D97)', () => {
  test('the landmark history feeder returns oldest-first so slice(-8) is the last 8, not the oldest 8', () => {
    // The query is ORDER BY started_at DESC; without the reverse, a
    // mature user\'s adapted MAV was computed from the OLDEST eight
    // sessions inside the 200-row window and barely moved as new
    // evidence arrived - the opposite of the function\'s own "last 8
    // data points" contract.
    const src = read('lib/database.js');
    const fn = src.slice(src.indexOf('export async function getAdaptiveLandmarkHistory'));
    const ret = fn.slice(0, fn.indexOf('export async function', 10));
    expect(ret).toMatch(/\}\)\)\.reverse\(\);/);
    expect(ret).toMatch(/ORDER BY w\.started_at DESC/);
  });
});

describe('D91-24 / D91-25 remain deferred, not implemented (D97)', () => {
  test('no freshness/decay algorithm exists in the learned range', () => {
    const src = stripComments(read('lib/learnedRange.js'));
    expect(src).not.toMatch(/decay|freshness|ageFactor|halfLife|staleAfter/i);
  });

  test('the accumulation-week list still excludes only the planned deload week (D91-24 unchanged)', () => {
    const src = read('lib/blockLedgerGather.js');
    expect(src).toMatch(/if \(w !== deloadWeekIndex\) weeks\.push\(w\);/);
  });
});

describe('PHASES 12 + 26: absence is never converted into evidence (D97)', () => {
  test('the session +1 branch requires feedback within the 14-day detraining boundary', () => {
    const src = read('lib/algorithms.js');
    const block = src.slice(src.indexOf('const stimulusReady =') - 800, src.indexOf('const stimulusReady =') + 300);
    expect(block).toMatch(/const feedbackRecent = lastTrainedAt != null/);
    expect(block).toMatch(/stimulusReady =\s*\n\s*feedbackRecent &&/);
  });

  test('the consecutive-week counters chain only across ADJACENT calendar weeks', () => {
    const src = read('screens/CoachOutputScreen.js');
    expect(src).toMatch(/const isAdjacent = \(expected, ws\) =>/);
    // Off-target chains only from the immediately previous week's output.
    expect(src).toMatch(/lastOutputAdjacent && lastOutput\?\.trend\?\.onTarget === false/);
    // Poor-recovery and exceeded both break on a calendar gap.
    const poor = src.slice(src.indexOf('const consecutivePoorRecoveryWeeks'));
    expect(poor.slice(0, 1200)).toMatch(/if \(!isAdjacent\(expected, ws\)\) break;/);
    const exceeded = src.slice(src.indexOf('const consecutiveExceededWeeks'));
    expect(exceeded.slice(0, 900)).toMatch(/if \(!isAdjacent\(expected, ws\)\) break;/);
    // The grade-3 counter is deliberately NOT adjacency-gated: it
    // certifies the ABSENCE of persistent fatigue, and an unknown gap
    // must keep withholding that upward-leaning certification.
    const grade3 = src.slice(src.indexOf('const consecutiveGrade3RecoveryWeeks'));
    expect(grade3.slice(0, 1400)).not.toMatch(/isAdjacent/);
  });
});

describe('PHASE 16/26: old proposals are never resurrected by Coached mode (D97)', () => {
  test('the coached auto-walk is bounded to the current cycle', () => {
    const src = read('screens/CoachOutputScreen.js');
    const walk = src.slice(src.indexOf("if (coachAutonomy !== 'coached') return;"));
    expect(walk.slice(0, 1600)).toMatch(/liveWeek - outWeek > 7 \* 86400000\) return;/);
    // The safety-hold confirm-first gate stays ahead of it.
    const holdAt = walk.indexOf('autoApplyHoldActive');
    const ageAt = walk.indexOf('liveWeek - outWeek');
    expect(holdAt).toBeGreaterThan(-1);
    expect(holdAt).toBeLessThan(ageAt);
  });
});

describe('ADDENDUM: anti-anthropomorphism and anti-manipulative retention (D97)', () => {
  const fs2 = require('fs');
  const path2 = require('path');
  const walk = (dir) => fs2.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path2.join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' ? [] : walk(p);
    return e.name.endsWith('.js') ? [p] : [];
  });

  test('no app-voice surface claims feelings, human understanding, or manipulative retention', () => {
    // The app's own voice must never imply emotions, consciousness or
    // human observation, threaten loss, or invent personalisation
    // percentages. The one legitimate exemption used to be the partner
    // cheer set (a HUMAN's words to a human); it left the tree with the
    // Partners feature (SD-03, retired 2026-09-06), so nothing is exempt
    // now: the engine may never claim feelings.
    const BANNED = [
      /we're proud of you/i, /i'm proud of you/i, /i know you\b/i,
      /i missed you/i, /we know your body/i, /your body loves/i,
      /your body told/i, /figured you out/i, /optimal for you/i,
      /perfect for you/i, /we understand you\b/i,
      /don't lose what we've learned/i, /journey needs you/i,
      /crushing it/i, /been through a lot together/i,
      /\d+% personalised/i,
    ];
    const roots = ['screens', 'components', 'lib'].map((d) => path2.join(__dirname, '..', d));
    for (const root of roots) {
      for (const file of walk(root)) {
        const src = fs2.readFileSync(file, 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
        for (const re of BANNED) {
          if (re.test(src)) {
            throw new Error(`${file} matches banned relationship copy: ${re}`);
          }
        }
      }
    }
  });

  test('the boast words stay banned in app copy (campaign 5 law carried forward)', () => {
    for (const f of ['lib/blockExplain.js', 'lib/coachRegister.js', 'lib/coachResponse.js', 'lib/whyThisTemplates.js']) {
      const src = stripComments(read(f));
      expect(src).not.toMatch(/optimal|perfected|we've figured/i);
    }
  });
});

describe('PHASES 9 + 44: plan lifecycle laws (D97-11..17)', () => {
  test('P44-02: activation unarchives, inside one transaction with a deterministic tiebreak', () => {
    const src = read('lib/database.js');
    const fn = src.slice(src.indexOf('export async function setActivePlan'));
    // Window widened 2026-08-27: the activate statement gained an ownership
    // predicate and a note explaining the transaction-internal asymmetry it
    // closes, which pushed the SQL past the old 1400-char slice. The properties
    // pinned here are unchanged; 2600 matches the slice size already used for
    // insertProgrammeFromCloud below.
    expect(fn.slice(0, 2600)).toMatch(/runInTransaction\(d, async \(\) => \{/);
    expect(fn.slice(0, 2600)).toMatch(/is_active = 1, is_archived = 0/);
    const get = src.slice(src.indexOf('export async function getActivePlan'));
    expect(get.slice(0, 700)).toMatch(/ORDER BY updated_at DESC LIMIT 1/);
  });

  test('P44-03: the archived flag syncs in both directions and archive writes schedule a push', () => {
    expect(read('lib/sync.js')).toMatch(/is_archived: !!p\.isArchived,/);
    const db = read('lib/database.js');
    const ins = db.slice(db.indexOf('export async function insertProgrammeFromCloud'));
    expect(ins.slice(0, 2600)).toMatch(/is_archived = \?/);
    expect(ins.slice(0, 3600)).toMatch(/is_library, is_active, is_archived, source_programme_id/);
    for (const fn of ['archivePlan', 'unarchivePlan', 'archiveOtherUserPlans']) {
      const f = db.slice(db.indexOf(`export async function ${fn}`));
      expect(f.slice(0, 800)).toMatch(/_scheduleSync\(\)/);
    }
  });

  test('P9-01: switched-away finished blocks are judged at consumption time', () => {
    const runner = read('lib/blockLedgerRunner.js');
    expect(runner).toMatch(/export async function backfillMissingBlockLedgers/);
    const seed = runner.slice(runner.indexOf('export async function buildSeedRangesForNextBlock'));
    expect(seed.slice(0, 700)).toMatch(/await backfillMissingBlockLedgers\(userId/);
    expect(read('screens/BlockReflectionScreen.js')).toMatch(/computeAndStoreBlockLedger\(user\.id, mesocycleId/);
  });

  test('P9-07: recovery-week and open-decision switches get their own honest dialogue', () => {
    const src = read('lib/planSwitch.js');
    expect(src).toMatch(/Switch during your recovery week\?/);
    expect(src).toMatch(/Skip the open block decision\?/);
    expect(stripComments(src)).not.toMatch(/about to roll over anyway/);
  });

  test('P9-04: PlanDetail holds the RB-3 synchronous guard on both activation paths', () => {
    const src = read('screens/PlanDetailScreen.js');
    expect((src.match(/if \(activatingRef\.current\) return;/g) || []).length).toBe(2);
  });

  test('P44-05: an abandoned block ends the day the user switches away', () => {
    const src = read('lib/database.js');
    const act = src.slice(src.indexOf('export async function activatePlanWithBlock'));
    expect(act.slice(0, 5300)).toMatch(/SET end_date = date\('now'\)/); // window widened for the T-2 comment, then again for C8 Work 2's activation seed, then again as that seed's own header comment grew, then again for D139's plan_replaced prior-active-block read
  });

  test('P9-06: a mature user is never told they lack personal history', () => {
    const src = read('lib/blockExplain.js');
    expect(src).toMatch(/RESEARCH_START_LINE_MATURE/);
    expect(src).toMatch(/hadPriorBlocks \? RESEARCH_START_LINE_MATURE : RESEARCH_START_LINE/);
    // Re-anchored under C6 P-5 (D97-20): "history" means blocks TRAINED,
    // not blocks judged - an ended prior block counts even when no
    // decision surface ever computed its ledger (the mature Free
    // upgrader / plan-switcher case).
    expect(read('screens/HomeScreen.js')).toMatch(/hadPriorBlocks = all\.some\(\(m\) => m\.id !== week\.mesocycleId\s*&& \(m\.blockLedger \|\| \(endedMs\(m\) != null && endedMs\(m\) <= Date\.now\(\)\)\)\)/);
  });

  test('P44-11/12: duplicates carry provenance and archived copies are reused, not re-copied', () => {
    const db = read('lib/database.js');
    const dup = db.slice(db.indexOf('export async function duplicatePlan'));
    expect(dup.slice(0, 1200)).toMatch(/SET source_programme_id = \?/);
    // The archived.find(...) half REMOVED (D137, fully free product):
    // FreeStarterScreen.js (the quiz that duplicated a picked library plan
    // and reused an archived copy by provenance) is deleted outright, and
    // no live screen calls duplicatePlan any more (grep confirms zero
    // consumers in src/screens/) -- the merged "Start with a plan" flow
    // generates a plan from the athlete's own profile (generateAndSavePlan)
    // instead of copying one. duplicatePlan() itself is untouched and still
    // stamps provenance for any future caller, which the assertion above
    // still pins.
  });
});

describe('PHASES 10 + 11: the mature record system (D97-18)', () => {
  test('P11-1: cluster rows can neither set nor seed an estimated-max record', () => {
    const src = read('lib/algorithms.js');
    expect(src).toMatch(/export function isE1rmEligibleRow/);
    const fn = src.slice(src.indexOf('export function detectPR'));
    expect(fn.slice(0, 900)).toMatch(/if \(!isE1rmEligibleRow\(newSet\)\) return prs;/);
    // Budget widened 1400 -> 3800 for D107-2: the assisted-semantics branch
    // (its own early-returning block, no 1RM estimates involved) now sits
    // between the eligibility gate and the best1RM reduce. The law itself
    // is unchanged and still pinned: history rows feed the estimated-max
    // bar only through the eligibility filter.
    expect(fn.slice(0, 3800)).toMatch(/if \(!isE1rmEligibleRow\(s\)\) return best;/);
  });

  test('P11-2: the progress PR tile mirrors the live detector (baseline, warm-ups, exercise type)', () => {
    const src = read('hooks/useProgressData.js');
    expect(src).toMatch(/const isBaseline = runningMax === 0;/);
    expect(src).toMatch(/if \(!isBaseline && at >= windowStart\)/);
    expect(src).toMatch(/if \(exType !== 'weight_reps'\) continue;/);
  });

  test('P10-1: the records wall derives from all completed history, never a rolling window', () => {
    const db = read('lib/database.js');
    expect(db).toMatch(/export async function getCompletedSetHistoryForExercise/);
    const screen = read('screens/ExerciseDetailScreen.js');
    expect(screen).toMatch(/getCompletedSetHistoryForExercise\(exerciseId, user\.id\)/);
    expect(screen).not.toMatch(/getWorkoutSetsForExercise\(exerciseId, user\.id, 200\)/);
  });
});

describe('PHASES 18-21: tier and trial transitions (D97-20)', () => {
  test('P-3: the ledger readiness slope treats a sleep-only row as no reading, not a neutral 50', () => {
    // FB-36 alignment: WorkoutSummaryScreen writes a tier-blind
    // weekly_checkins row answering only sleep. blockAdvisor's reader got
    // the guard in D96; the ledger's sleep-free slope input now holds the
    // same rule, so evidence-free rows cannot flatten or manufacture a
    // strain trend across a block.
    const src = read('lib/blockLedgerRunner.js');
    const fn = src.slice(src.indexOf('const sleepFreeReadiness'));
    expect(fn.slice(0, 600)).toMatch(/if \(c\.energyScore == null && c\.sorenessScore == null\) return null;/);
    // The guard sits BEFORE the ?? 3 defaults, so it wins.
    const guardAt = fn.indexOf('c.energyScore == null');
    const defaultAt = fn.indexOf('c.energyScore ?? 3');
    expect(guardAt).toBeGreaterThan(-1);
    expect(defaultAt).toBeGreaterThan(guardAt);
    // And the slope helper it feeds discards nulls rather than zeroing them.
    const gather = read('lib/blockLedgerGather.js');
    const slope = gather.slice(gather.indexOf('export function computeReadinessSlope'));
    expect(slope.slice(0, 300)).toMatch(/\.filter\(\(v\) => v != null\)/);
  });
});

describe('PHASES 25-31: return and history laws (D97-22)', () => {
  test('R-5: the overdue block line never claims readiness or applies urgency', () => {
    const src = stripComments(read('lib/blockAdvisor.js'));
    expect(src).not.toMatch(/body's ready|body is ready/i);
    expect(src).not.toMatch(/sooner you start/i);
    expect(src).toContain("Whenever you're ready, the next step is choosing your next block.");
  });
});

describe('R-2 (D97-22): the displayed trend shares the decision trend\'s clock', () => {
  test('the trend hook date-windows its rows before deriving state or rate', () => {
    const src = read('hooks/useWeightTrend.js');
    expect(src).toMatch(/const windowStart = Date\.now\(\) - 90 \* 86400000;/);
    expect(src).toMatch(/Number\(w\.loggedAt\) >= windowStart/);
    expect(src).toMatch(/const ewmaData = computeEWMA\(windowed\);/);
  });
});

describe('R-15 (D97-22): the year recap cannot headline an inflated cluster-row max', () => {
  test('the Year of Lifts PR loop applies the shared e1RM eligibility rule', () => {
    const src = read('lib/database.js');
    const fn = src.slice(src.indexOf('const bestByExercise = new Map();'));
    expect(fn.slice(0, 700)).toMatch(/if \(!isE1rmEligibleRow\(s\)\) continue;/);
    expect(src).toMatch(/import \{ calculate1RM, allocateExerciseVolume, isE1rmEligibleRow \} from '\.\/algorithms';/);
  });
});

describe('R-17 (D97-22): the win-back claims storage only, and calm mode gates the lay', () => {
  test('no claim that analysis continued during the absence', () => {
    const src = stripComments(read('lib/notifications/winbackContent.js'));
    expect(src).not.toMatch(/never stopped/);
    expect(src).toContain('Your training history is all saved');
  });

  test('the lay gate checks calm mode alongside the ED flag', () => {
    const src = read('lib/notifications/scheduler.js');
    const fn = src.slice(src.indexOf('export async function scheduleWinbackNotification'));
    const gate = fn.slice(0, fn.indexOf('const statedReturn'));
    expect(gate).toMatch(/getOpenEdPatternFlag/);
    expect(gate).toMatch(/if \(isCalm\(mode\)\) \{ await cancelWinbackNotification\(\); return; \}/);
  });
});

describe('R-12 (D97-22): a gap week is an accumulation boundary, never fatigue evidence', () => {
  test('the lighter-week scan ends at an untrained week and cannot invert polarity', () => {
    // RE-PINNED (Campaign 24 cohesion pass / hostile-review F1): the scan
    // moved from useProgressData's inline weeksSinceLighter IIFE into the
    // ONE shared derivation, buildLast4WeekDeloadBuckets (algorithms.js).
    // The R-12 invariant (an untrained week ends the scan and never reads
    // as fatigue evidence) is unchanged at its new home.
    const src = read('lib/algorithms.js');
    const fn = src.slice(src.indexOf('export function buildLast4WeekDeloadBuckets'));
    const scan = fn.slice(0, fn.indexOf('\n}'));
    // The empty-week branch returns the span measured so far (wk), and it
    // sits BEFORE the volume threshold so a gap can never read as heavy
    // training (returning 12 here would fabricate fatigue from absence).
    expect(scan).toMatch(/if \(wkSets\.length === 0\) return wk;/);
    const emptyAt = scan.indexOf('wkSets.length === 0');
    const thresholdAt = scan.indexOf('totalSets < 15');
    expect(emptyAt).toBeGreaterThan(-1);
    expect(emptyAt).toBeLessThan(thresholdAt);
    expect(scan).not.toMatch(/wkSets\.length === 0\) return 12/);
  });
});

describe('R-14 (D97-22): the coach weight chip honours the body-weight unit', () => {
  test('the chip formats from the raw kg delta per bodyWeightUnits; maths stays kg', () => {
    const src = read('screens/CoachOutputScreen.js');
    const fn = src.slice(src.indexOf('const weightChipValue = (() => {'));
    const chip = fn.slice(0, fn.indexOf('})();'));
    expect(chip).toMatch(/const bwu = bodyWeightUnits \|\| 'st';/);
    expect(chip).toMatch(/2\.2046226218/);
    expect(chip).toMatch(/if \(bwu === 'kg'\) return trend\.deltaLabel/);
  });
});

describe('R-8 (D97-22): a Home weigh-in can be corrected and removed', () => {
  test('morning_weights has an update/soft-delete pair; every product reader filters the tombstone', () => {
    const db = read('lib/database.js');
    expect(db).toMatch(/export async function updateMorningWeightById/);
    expect(db).toMatch(/export async function deleteMorningWeightById/);
    // Soft delete, never a hard DELETE (the tombstone must sync).
    const del = db.slice(db.indexOf('export async function deleteMorningWeightById'));
    expect(del.slice(0, 600)).toMatch(/SET deleted_at = \?, updated_at = \?/);
    expect(del.slice(0, 600)).not.toMatch(/DELETE FROM/);
    // The four product readers exclude tombstoned rows; the sync push
    // reader deliberately keeps them so deletions propagate.
    expect((db.match(/FROM morning_weights WHERE user_id = \?[^']*deleted_at IS NULL/g) || []).length).toBeGreaterThanOrEqual(4);
    expect(read('lib/sync.js')).toMatch(/deleted_at: w\.deletedAt != null \? new Date\(w\.deletedAt\)\.toISOString\(\) : null,/);
  });
});

describe('R-11 (D97-22): the streak blob is a guarded pref', () => {
  test('the pattern is registered and every write stamps', () => {
    const sync = read('lib/sync.js');
    expect(sync).toMatch(/\/\^@volyume_streak_v1_\//);
    const st = read('lib/streakState.js');
    const save = st.slice(st.indexOf('async function saveStreakState'));
    expect(save.slice(0, 600)).toMatch(/notePrefWrite\(KEY\(userId\)\)/);
  });
});

describe('S-2 (D97-23): reminder and quiet-hours prefs are guarded, stamped at every writer', () => {
  test('both keys are registered and every writer stamps before the write', () => {
    const sync = read('lib/sync.js');
    expect(sync).toMatch(/\/\^@volyume_notification_prefs\$\//);
    expect(sync).toMatch(/\/\^@volyume_quiet_hours_v1\$\//);
    expect(read('lib/notifications/quietHours.js')).toMatch(/notePrefWrite\(QUIET_HOURS_KEY\)/);
    for (const f of ['screens/CoachingRemindersScreen.js', 'screens/NotificationSettingsScreen.js', 'screens/ProOnboardingScreen.js', 'screens/WeeklyCheckInScreen.js']) {
      const src = read(f);
      const writes = (src.match(/AsyncStorage\.setItem\(NOTIF_PREFS_KEY/g) || []).length;
      const stamps = (src.match(/notePrefWrite\(NOTIF_PREFS_KEY\)/g) || []).length;
      expect({ f, stamps }).toEqual({ f, stamps: writes });
    }
  });
});

describe('S-14/S-15 (D97-23): the corrected 135 contract and its client half', () => {
  test('the cloud tie-break puts APPLIED first, and survivors converge on the deterministic id', () => {
    const fs2 = require('fs');
    const sql = fs2.readFileSync(require('path').join(__dirname, '..', '..', 'supabase', 'migrate_135_coach_outputs_week_unique.sql'), 'utf8');
    const del = sql.slice(sql.indexOf('DELETE FROM public.coach_outputs'));
    const tuple = del.slice(0, del.indexOf(');'));
    // applied::int leads the comparison tuple - an applied row can never
    // lose to a merely-viewed newer duplicate.
    expect(tuple.indexOf('applied::int')).toBeGreaterThan(-1);
    expect(tuple.indexOf('applied::int')).toBeLessThan(tuple.indexOf('COALESCE(w.updated_at'));
    expect(sql).toMatch(/SET id = 'co_' \|\| week_start::text \|\| '_' \|\| user_id::text/);
    expect(sql).toMatch(/ONLY AFTER the v72 client build is live/);
  });

  test('local v72 re-ids legacy rows to the same deterministic form saveCoachOutput mints', () => {
    const db = read('lib/database.js');
    expect(db).toMatch(/UPDATE coach_outputs\s*\n\s*SET id = 'co_' \|\| week_start \|\| '_' \|\| user_id\s*\n\s*WHERE id <> 'co_' \|\| week_start \|\| '_' \|\| user_id/);
    expect(db).toMatch(/const id = `co_\$\{data\.weekStart\}_\$\{userId\}`;/);
  });
});

describe('M-13 (D97-24): the reflection ledger rows reach every account (D137, fully free)', () => {
  // RE-ANCHORED (D137, fully free product): the tier check this test pinned
  // is no longer a live gate on either sibling. proGate.js's own header
  // (FULL_ACCESS_FOR_ALL) resolves every signed-in user's tier to 'pro'
  // unconditionally, so `tierNow === 'pro'` in BlockReflectionScreen.js is
  // dead-but-harmless (always true for a real user, never withholds rows)
  // -- it was simply not cleaned up when PlansScreen.js's identical literal
  // check WAS removed outright (PlansScreen.js:411, now
  // `rows: allRows.slice(0, 4)` unconditionally). Both are checked below,
  // matching what is actually on disk, since neither produces different
  // behaviour for a real user; PlansScreen's line is the accurate remaining
  // pin, BlockReflectionScreen's vestigial conditional is noted rather than
  // silently inverted.
  test('Free receives the same adaptive rationale rows as everyone else on BlockReflection', () => {
    const src = read('screens/BlockReflectionScreen.js');
    // D137 lead cleanup: the vestigial tier ternary is gone; the rows are
    // set for everyone unconditionally.
    expect(src).toMatch(/setLedgerRows\(buildLedgerReflectionRows\(ledger\)\)/);
    expect(src).not.toMatch(/tierNow === 'pro'/);
    // The sibling literal tier check was removed outright (D137).
    expect(read('screens/PlansScreen.js')).toMatch(/rows: allRows\.slice\(0, 4\),/);
  });
});

describe('T-lane fixes (D97-24): clock, caps, photo honesty', () => {
  // RE-PINNED (Today truth repair): T-1 pinned a DST-safe week-key grid
  // inside the streak resolver, which is DELETED with the rejected weekly
  // run/streak construct. The DST concern it guarded lives on in the shared
  // localWeekStartMs helper, which every surviving "this week" count uses;
  // that helper is pinned by its own suite (dayKey tests).
  test('T-1: the streak week grid is gone with the construct it served', () => {
    expect(fs.existsSync(path.join(__dirname, '..', 'hooks/useWeeklyStreak.js'))).toBe(false);
  });

  test('T-2: date-only block starts anchor at LOCAL midnight on read and store the LOCAL day on write', () => {
    const src = read('lib/mesocycle.js');
    expect(src).toMatch(/function parseBlockStartMs\(v\)/);
    expect((src.match(/parseBlockStartMs\(/g) || []).length).toBeGreaterThanOrEqual(4);
    expect(read('lib/database.js')).toMatch(/store the LOCAL activation day/);
  });

  test('T-8: the row converter memoises keys (measured hot path)', () => {
    const src = read('lib/database.js');
    expect(src).toMatch(/const _camelKeyCache = new Map\(\);/);
    expect(src).toMatch(/const camelKey = _camelKey\(key\);/);
  });

  // Re-anchored under RC6-7 (D97-25): Review C proved the interim
  // order+cap route skipped rows sharing one updated_at at the cap
  // boundary for ever, and the audit's original fetchAllRows direction
  // was quietly downgraded. The four pulls now page with fetchAllRows
  // within one cycle; this pin holds them there.
  test('T-13/RC6-7: the four watermarked pulls page with fetchAllRows (no cap, no equal-timestamp skip)', () => {
    const src = read('lib/sync.js');
    for (const fn of ['_pullProgrammes', '_pullMesocycles', '_pullCoachOutputs', '_pullExerciseUserNotes']) {
      expect(src).toMatch(new RegExp(`fetchAllRows\\(\\s*'sync\\.${fn}'`));
    }
    // The old capped shape must not return on these tables.
    const hits = (src.match(/\.order\('updated_at', \{ ascending: true \}\)\.limit\(1000\)/g) || []).length;
    expect(hits).toBe(0);
  });

  // T-12 (partner cheer pull cap) and T-18 (both partner week signals
  // scoped to this week) pinned files that were deleted with the Partners
  // feature (SD-03, retired 2026-09-06). Nothing reads or writes those
  // tables from the client any more, so there is no behaviour left to pin.

  test('T-16: the photo FAQ states impermanence alongside privacy', () => {
    const src = read('screens/SettingsFaqScreen.js');
    expect(src).toMatch(/do not come back after a reinstall or on a new phone/);
    expect(src).toMatch(/The one exception is progress photo and scan image files/);
  });
});

describe('RB6 fixes (D97-25): the return experience holds under adversarial review', () => {
  test('RB6-1: the trend card needs a reading inside 14 days, not just inside 90', () => {
    const src = read('hooks/useWeightTrend.js');
    expect(src).toMatch(/if \(!\(newestMs >= Date\.now\(\) - 14 \* 86400000\)\) windowed = \[\];/);
  });

  test('RB6-2 claim half: gap-spanning deltas are never worded as weekly', () => {
    const src = read('lib/weeklyCoach.js');
    expect(src).toMatch(/since you last logged regularly/);
    expect(src).toMatch(/across the gap/);
    // C10A: the safety half was FOUNDER-GATED here and has since been
    // ruled on and implemented - the rate is normalised by the elapsed
    // span rather than the comparator being dropped. The original
    // requirement this test protects is UNCHANGED and now strengthened:
    // a gap-spanning delta must never be spoken, or counted, as weekly.
    const fn = src.slice(src.indexOf('export function computeWeeklyTrendPct'));
    // Window widened 1200 -> 1800 (Campaign 21 finding 5): the future-row
    // guard inserted at the top of the function pushed the normalisation
    // call past the old slice. The pinned law is unchanged and still
    // asserted: PER-WEEK normalisation present, and NO freshness cut-off
    // that would discard old evidence (the finding-5 guard excludes only
    // FUTURE-dated rows, which is not a staleness cut).
    expect(fn.slice(0, 1800)).toMatch(/PER-WEEK rate/);
    expect(fn.slice(0, 1800)).not.toMatch(/weeklyComparatorFresh\(morningWeights, nowMs\)\) return null/);
    expect(fn.slice(0, 1800)).toMatch(/elapsedWeeksSinceComparator/);
  });

  test('RB6-3: the Home chip states the calendar fact for an unearned recovery week', () => {
    const src = read('lib/readinessSummary.js');
    expect(src).toMatch(/Recovery week on the calendar\. Ease back in whenever suits you\./);
  });

  test('RB6-4: both fatigue composers bound their claims to recent sessions', () => {
    expect(read('lib/readinessSummary.js')).toMatch(/_recentRated\(fatigueHistory, nowMs\)/);
    expect(read('lib/homeCoachBrief.js')).toMatch(/\(Date\.now\(\) - t\) <= 14 \* 86400000/);
  });

  test('RB6-6: the win-back keys are guarded and every write stamps', () => {
    expect(read('lib/sync.js')).toMatch(/\/\^@volyume_winback_\//);
    const st = read('lib/payments/winbackState.js');
    expect((st.match(/_stamp\(_keyFor\(/g) || []).length).toBeGreaterThanOrEqual(5);
  });

  test('RB6-8: the overdue headline rolls to months at scale', () => {
    expect(read('lib/blockAdvisor.js')).toMatch(/months ago/);
  });
});

describe('C6 closeout B1/B4 (founder-approved visibility pass)', () => {
  test('B1: the volume screen names each muscle band\'s provenance, in the three-state vocabulary', () => {
    const src = read('screens/VolumeHeatmapScreen.js');
    expect(src).toMatch(/Your own targets/);
    expect(src).toMatch(/Adjusted from your logged training/);
    expect(src).toMatch(/Research starting point/);
    // The research caption stays free-safe: no learning promise on it.
    expect(src).not.toMatch(/Research starting point until/);
  });

  test('B4: the calorie hero provenance forks on a REAL applied change; day-0 wording unchanged', () => {
    const src = read('screens/NutritionTargetsScreen.js');
    expect(src).toMatch(/calorieEverApplied/);
    expect(src).toMatch(/Worked out from your profile and the research, then adjusted as your own evidence arrives\./);
    expect(src).toMatch(/this target has since been adjusted from your own weigh-ins and logging\./);
    // The calibrated claim is about the TARGET, never the maintenance
    // estimate (the stored TDEE does not learn - RELATIONSHIP-MOMENTS B4).
    expect(src).not.toMatch(/maintenance estimate has (learned|adjusted)/);
  });
});
