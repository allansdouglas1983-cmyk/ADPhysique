/**
 * campaign5.firstUse.test.js — Campaign 5 (D96) first-use regression
 * suite.
 *
 * Pins the first-use laws and the spine fixes so no future change can
 * quietly reintroduce a fixed defect: the Step 1 onboarding trap, the
 * destructive wellbeing write, the ungated legacy pull, fabricated
 * biology in the goal-setup recalc, fabricated session ratings, and
 * the onboarding rollback switch. Source-level pins deliberately match
 * the minimal fingerprint of each fix; behavioural coverage lives in
 * the sibling focused suites.
 */
import fs from 'fs';
import path from 'path';
import { BLOCK_PLANNED_WEEKS, BLOCK_DELOAD_WEEK } from '../lib/mesocycle';
import { reviewRecoveryLine, resolveRecoveryState } from '../lib/recoveryState';
import { buildNextBlockOptions, checkinReadiness } from '../lib/blockAdvisor';
import { buildBlockStartLines, buildSeedReceipt, BLOCK_START_SENTENCE } from '../lib/blockExplain';
import { buildReadinessSummary } from '../lib/readinessSummary';
import { getQuizRecommendation } from '../screens/PlanLibraryScreen';

const SRC = (p) => path.join(__dirname, '..', p);
const read = (p) => fs.readFileSync(SRC(p), 'utf8');
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

describe('ONBOARDING: the Step 1 trap stays fixed (C5-P29-01, D96)', () => {
  test('no hydrated-profile guard blocks an authenticated user from advancing past step 1', () => {
    const src = stripComments(read('screens/ProOnboardingScreen.js'));
    // The exact defective guard: a bare early-return on userProfile inside
    // the step-1 auto-advance. Any authenticated non-local user advances.
    expect(src).not.toMatch(/if \(userProfile\) return;/);
  });
});

describe('WELLBEING: completing the SCOFF check preserves the body profile (C5-P5-03, D96)', () => {
  test('the scoff write merges the existing row (saveUserBodyProfile writes whole rows)', () => {
    const src = read('screens/WellbeingCheckScreen.js');
    expect(src).toMatch(/getUserBodyProfile\(user\.id\)/);
    expect(src).toMatch(/\.\.\.\(existing \|\| \{\}\), scoffScore/);
    // The bare destructive form never returns.
    expect(stripComments(src)).not.toMatch(/saveUserBodyProfile\(user\.id, \{ scoffScore/);
  });
});

describe('ARTICLE 9: the legacy pull honours the same fail-closed gate as the runner (C-2, D96)', () => {
  test('pullFromCloud refuses unless healthConsent === true, and a failed read fails closed', () => {
    const src = read('lib/sync.js');
    const fn = src.slice(src.indexOf('export async function pullFromCloud'));
    const head = fn.slice(0, fn.indexOf('_pullWorkouts') > 0 ? fn.indexOf('_pullWorkouts') : 4000);
    expect(head).toMatch(/healthConsent/);
    expect(head).toMatch(/!== true/);
    expect(head).toMatch(/fails closed|closed\)/i);
  });
});

describe('NO INVENTED BIOLOGY: the goal-setup recalc never fabricates sex/height/age (C5-P5-02, D96)', () => {
  test('the silent male/175cm/28y fallbacks are gone; incomplete biology skips the recalc', () => {
    const src = stripComments(read('screens/ProGoalSetupScreen.js'));
    expect(src).not.toMatch(/wp\.sex === 'female' \? 'female' : 'male'/);
    expect(src).not.toMatch(/: 175;/);
    expect(src).not.toMatch(/: 28;/);
    expect(src).toMatch(/biologyComplete/);
  });
});

describe('SESSION RATINGS: skipped stays null, never a fabricated answer (C5-P17-01/02, D96)', () => {
  test('Close writes only fields carrying a real answer', () => {
    const src = read('screens/WorkoutSummaryScreen.js');
    expect(src).toMatch(/realFieldsRef\.current\.has\(k\)/);
    // The unconditional four-field write never returns on the Close path.
    expect(stripComments(src)).not.toMatch(/sessionDifficulty: feedback\.sessionDifficulty,\s*\n\s*overallPump: feedback\.overallPump/);
  });
  test('rating rows render unselected until a real answer exists', () => {
    const src = read('screens/WorkoutSummaryScreen.js');
    expect(src).toMatch(/realFieldsRef\.current\.has\('sessionDifficulty'\) \? feedback\.sessionDifficulty : null/);
    expect(src).toMatch(/realFieldsRef\.current\.has\('fatigueLevel'\) \? feedback\.fatigueLevel : null/);
  });
});

describe('ROLLBACK SWITCH: the quiz-first flow stays dark with its infrastructure intact (C5-P39-04, D96)', () => {
  test('ONBOARDING_QUIZ_FIRST remains false', () => {
    const flow = read('lib/onboarding/quizFlow.js');
    expect(flow).toMatch(/export const ONBOARDING_QUIZ_FIRST = false;/);
  });
  test('the dark routes and rollback infrastructure remain (never delete, never wire live)', () => {
    // Rollback infrastructure must survive: routes registered, screens
    // present. Reachability-dark is enforced by the flag above plus the
    // deep-link config, which names only MainTabs routes.
    const nav = read('navigation/RootNavigator.js');
    expect(nav).toMatch(/QuizTraining/);
    expect(nav).toMatch(/PlanPreview/);
    expect(fs.existsSync(SRC('screens/QuizScreen.js'))).toBe(true);
    expect(fs.existsSync(SRC('screens/PlanPreviewScreen.js'))).toBe(true);
  });
});

/**
 * ACCOUNT (Wave B, D96). The account is the only identity the app has, so
 * every way in has to be honest and every way in has to be recoverable. These
 * pins hold the entry surface's four laws: no anonymous escape hatch, a
 * failed sign-in strands nobody, a duplicate address is told the truth, and
 * nothing on the way back can step past consent or required-safe data.
 */
describe('ACCOUNT: no anonymous flow (identity invariant, standing)', () => {
  test('the account sheet offers no way in without an account', () => {
    // D145 (third pass): the auth surface is components/auth/AuthSheet.js,
    // a sheet over Welcome; LoginScreen.js is the route that opens it.
    for (const f of ['components/auth/AuthSheet.js', 'screens/LoginScreen.js']) {
      const src = stripComments(read(f));
      expect(src).not.toMatch(/[Cc]ontinue without an account/);
      expect(src).not.toMatch(/anonymous|isLocal|guest|skip sign|local user/i);
    }
  });

  test('the entry screen still routes only to a real sign-in', () => {
    const welcome = stripComments(read('screens/WelcomeScreen.js'));
    expect(welcome).toMatch(/<AuthSheet/);
    expect(welcome).not.toMatch(/anonymous|guest|without an account/i);
  });
});

describe('ACCOUNT: the sign-up CTA opens a sign-up form (E-1, D96)', () => {
  test('the Login route reads the intent param and Welcome opens the sheet in sign-up mode', () => {
    const src = read('screens/LoginScreen.js');
    expect(src).toMatch(/route\?\.params\?\.intent === 'pro_signup' \? 'signup' : 'signin'/);
    // And Welcome's CTA opens create-account, not sign-in.
    expect(stripComments(read('screens/WelcomeScreen.js'))).toMatch(/setSheet\('signup'\)/);
  });

  test('"Already have an account?" still opens sign-in', () => {
    const welcome = read('screens/WelcomeScreen.js');
    expect(welcome).toMatch(/onPress=\{\(\) => setSheet\('signin'\)\}/);
  });
});

describe('ACCOUNT: failed auth is recoverable (E-3 / E-5, D96)', () => {
  test('the forgot-password flow calls the reset helper that nothing used to call', () => {
    const src = read('components/auth/AuthSheet.js');
    expect(src).toMatch(/import \{[^}]*resetPassword[^}]*\} from '\.\.\/\.\.\/lib\/supabase'/s);
    expect(src).toMatch(/async function handleForgotPassword\(\)/);
    expect(stripComments(src)).toMatch(/await resetPassword\(e\)/);
    expect(src).toMatch(/Forgot your password\?/);
  });

  test('the reset promise stays conditional (Supabase answers unknown addresses identically)', () => {
    const src = read('components/auth/AuthSheet.js');
    expect(src).toMatch(/If that email has an account/);
  });

  test('a connection failure names connectivity instead of blaming credentials', () => {
    const src = stripComments(read('components/auth/AuthSheet.js'));
    // Every user-facing failure path routes through the shared mapping.
    expect(src).toMatch(/authErrorMessage\(result\.error\)/);
    expect(src).toMatch(/authErrorMessage\(error\)/);
    expect(src).toMatch(/authErrorMessage\(err\)/);
    // The old hard-coded fallbacks no longer stand in for a dead connection.
    expect(src).not.toMatch(/toast\.show\("That didn't go through\. Try again\."/);
    const copy = read('lib/authErrorCopy.js');
    expect(copy).toMatch(/internet connection to create an account or sign in/);
  });
});

describe('ACCOUNT: a duplicate email is told the truth (E-2 / E-8, D96)', () => {
  test('the enumeration-protection shape is read as a duplicate, not a sent email', () => {
    const src = stripComments(read('components/auth/AuthSheet.js'));
    expect(src).toMatch(/isDuplicateSignup\(data\)/);
    expect(read('lib/authErrorCopy.js')).toMatch(/identities\.length === 0/);
  });

  test('the confirm-email instruction persists on the form, it is not a toast', () => {
    const src = stripComments(read('components/auth/AuthSheet.js'));
    // The state the user has to leave the app to act on lives on screen.
    expect(src).toMatch(/setNotice\(\{ text: AUTH_COPY\.unconfirmed \}\)/);
    expect(src).toMatch(/setNotice\(\{ text: AUTH_COPY\.duplicate \}\)/);
    expect(src).not.toMatch(/toast\.show\('Check your email to confirm/);
  });

  test('the account step has a visible way back (E-9)', () => {
    // D145: the sheet closes by handle, backdrop and hardware back (the
    // BottomSheet contract); inside the email form a visible control
    // returns to the provider choice; and when the Login route was pushed
    // from elsewhere, closing the sheet goes back there.
    const sheet = read('components/auth/AuthSheet.js');
    expect(sheet).toMatch(/accessibilityLabel="Back to sign-up options"/);
    const welcome = read('screens/WelcomeScreen.js');
    expect(welcome).toMatch(/navigation\?\.canGoBack\?\.\(\)\) navigation\.goBack\(\)/);
  });
});

describe('ACCOUNT: Back cannot bypass consent or required-safe data (C5-P30-01/02/05/06, D96)', () => {
  test('the wizard maps hardware Back to its own goBack only past the gated steps', () => {
    const src = read('screens/ProOnboardingScreen.js');
    expect(src).toMatch(/BackHandler\.addEventListener\('hardwareBackPress'/);
    // step > 2 steps back; steps 1-2 (account, then sex/age/height/weight)
    // return false, so the fail-closed exit stands and neither can be
    // reached past backwards.
    expect(stripComments(src)).toMatch(/if \(step > 2\) \{ goBack\(\); return true; \}\s*\n\s*return false;/);
    // goBack itself still refuses the two gated steps.
    expect(stripComments(src)).toMatch(/if \(step === 1\) return;/);
    expect(stripComments(src)).toMatch(/if \(step === 2 && accountCreated\) return;/);
  });

  test('the consent stack gains no back affordance of any kind', () => {
    const nav = stripComments(read('navigation/RootNavigator.js'));
    const start = nav.indexOf('function Article9ConsentStack()');
    const stack = nav.slice(start, nav.indexOf('function ProOnboardingStack()', start));
    expect(start).toBeGreaterThan(-1);
    expect(stack).not.toMatch(/BackHandler|goBack/);
    expect(stripComments(read('screens/Article9ConsentScreen.js'))).not.toMatch(/BackHandler/);
  });

  // 'FreeStarter hardware Back mirrors its chevron instead of discarding the
  // quiz' removed (D137, fully free product): FreeStarterScreen.js (the
  // free-tier quiz) is deleted outright -- there is no separate quiz wizard
  // for a hardware Back press to discard any more. The consent-bypass
  // guarantee this describe block exists for is still covered above by the
  // wizard-Back and consent-stack-Back tests against ProOnboardingScreen.js
  // and Article9ConsentScreen.js, the surfaces every account now goes
  // through.
});

describe('ACCOUNT: the consent latch failsafe fails CLOSED (C5-P29-04, D96)', () => {
  test('it resolves the latch to null (the gate), and can never grant consent', () => {
    const nav = read('navigation/RootNavigator.js');
    const start = nav.indexOf('C5-P29-04 (D96)');
    const block = nav.slice(start, nav.indexOf('const bootGateResolved', start));
    expect(start).toBeGreaterThan(-1);
    expect(block).toMatch(/setHealthConsent\(null, true\)/);
    // Neither true nor false: true would grant consent nobody gave, false
    // would re-prompt a user who already consented.
    expect(block).not.toMatch(/setHealthConsent\(\s*true/);
    expect(block).not.toMatch(/setHealthConsent\(\s*false/);
    expect(block).not.toMatch(/healthConsentGranted/);
    // A landed real check always wins the race.
    expect(block).toMatch(/if \(useAppStore\.getState\(\)\.healthConsentChecked\) return;/);
  });

  test('an unresolved latch still routes a new user INTO the Article 9 gate', () => {
    // The failsafe's only escape is the gate itself, which is the existing
    // consentUnresolvedForNewUser rule (pinned in full by
    // onboardingConsentRouting.guard.test.js).
    const nav = read('navigation/RootNavigator.js');
    expect(nav).toMatch(/const consentUnresolvedForNewUser = healthConsent == null && !firstRunComplete;/);
  });
});

// 'ACCOUNT: first use never duplicates the starter plan (C5-P29-02, D96)'
// removed (D137, fully free product): FreeStarterScreen.js (the free-tier
// quiz) is deleted outright, and with it the COPY-based mechanism this test
// pinned (`copyPlanFromLibrary` stamping `sourceProgrammeId`, `startingRef`
// as a synchronous re-entrancy guard, and the by-provenance existing-plan
// lookup). The "Start with a plan" successor on HomeScreen.js/PlansScreen.js
// GENERATES a fresh plan (`generateAndSavePlan`) rather than copying a named
// library recommendation, so there is no `sourceProgrammeId`/`recommendation`
// pair for an idempotency check to key on -- the behaviour this test pinned
// does not exist in the new mechanism. NOTE for the lead: neither onAction
// handler carries a synchronous re-entrancy guard equivalent to the deleted
// `startingRef.current` check, so a rapid double-tap is not proven safe
// against a duplicate generateAndSavePlan call; flagged as an observation
// only, since this is a test-only reconciliation task and no src/ file may
// be touched to add one.

describe('ACCOUNT: onboarding does not block on a display name (C5-P29-03 / C5-P1-09, D96)', () => {
  // RE-POINTED (D137, fully free product): FirstRunScreen.js (the free
  // path) is deleted outright -- ProOnboardingScreen.js is now the ONLY
  // onboarding surface, reached by every account regardless of tier, and it
  // carries the identical appleFirstName prefill contract this test pins.
  test('Continue is never disabled by the name, and the field prefills', () => {
    const src = stripComments(read('screens/ProOnboardingScreen.js'));
    // The initialiser goes through appleFirstName, which reads
    // storedProfile.firstName FIRST and falls back to what Apple gave at the
    // sign-in button. The claim this pins is unchanged - the saved name still
    // seeds the field - so it is asserted through that call.
    expect(src).toMatch(/useState\(\s*\(\) => appleFirstName\(\{ sessionUser: user, storedProfile: userProfile \}\) \|\| ''/);
    // Step 2's canContinue gate (biological sex, weight, age, height) never
    // consults firstName, so the name can never disable Continue.
    // D146: the gate is validateStep2 (sex, age, height, weight); neither
    // it nor the step-2 branch consults firstName.
    const validator = src.match(/function validateStep2\(\) \{[\s\S]{0,900}?return errs;\s*\}/)?.[0] ?? '';
    expect(validator).toMatch(/errs\.sex/);
    expect(validator).not.toMatch(/firstName/);
    // The branch's logic, up to its render: the name field itself is
    // rendered further down and is not a gate.
    const step2 = src.match(/if \(step === 2\) \{[\s\S]*?return \(/)?.[0] ?? '';
    expect(step2).toMatch(/const errors2 = attempted2 \? validateStep2\(\) : \{\};/);
    expect(step2).not.toMatch(/firstName/);
    // An empty field must not write a blank over a stored name.
    expect(src).toMatch(/if \(firstName\.trim\(\)\) merged\.firstName = firstName\.trim\(\);/);
  });
});

describe('ACCOUNT: the final build survives a retry (C5-P29-07, D96)', () => {
  test('the enrolment metric and the generated plan are written once per build', () => {
    const src = stripComments(read('screens/ProOnboardingScreen.js'));
    expect(src).toMatch(/loadBuildProgress\(user\.id\)/);
    // RB-7 (Review B, D96) re-anchor: still once per build, and ALSO
    // re-logged when the user stepped back and changed the weight, so the
    // enrolment row can never disagree with the profile and morning series.
    expect(src).toMatch(/if \(!priorBuild\?\.weightLoggedAt \|\| \(Number\.isFinite\(priorBuild\?\.weightKg\) && priorBuild\.weightKg !== bwKg\)\)/);
    expect(src).toMatch(/markBuildProgress\(user\.id, \{ weightLoggedAt/);
    expect(src).toMatch(/markBuildProgress\(user\.id, \{ planId: planResult\.programmeId, planSignature \}\)/);
    // Edited answers still rebuild: reuse is keyed on the same inputs.
    expect(src).toMatch(/priorBuild\.planSignature === planSignature/);
  });
});

describe('CARDIO: no onboarding resurrection (standing boundary)', () => {
  test('onboarding and first-run surfaces carry no cardio input or promise', () => {
    // FirstRunScreen.js and FreeStarterScreen.js removed from this
    // enumeration (D137, fully free product): both are deleted outright.
    // ProOnboardingScreen.js is now the only onboarding surface, reached by
    // every account regardless of tier.
    for (const f of ['screens/ProOnboardingScreen.js', 'screens/ProSetupCompleteScreen.js']) {
      expect(stripComments(read(f))).not.toMatch(/[Cc]ardio/);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────
// Wave C (D96): plan / block / Home / workout surfaces.
// ───────────────────────────────────────────────────────────────────────

// The C5-P10-03 pin runs the REAL library quiz scorer, so this file imports
// PlanLibraryScreen, which pulls the shared Button -> haptics -> expo-haptics
// chain in at import time. Same mock the other pure-builder suites use
// (recapCards.test.js); jest.mock is hoisted above the imports above.
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

describe('PLAN: activating a plan says what it does, once, on every path (C5-P10-01/05/08/10, D96)', () => {
  test('the block sentence describes the block the writer actually creates', () => {
    // C5-P11-01: derived from BLOCK_PLANNED_WEEKS, so no surface can
    // describe a block length activatePlanWithBlock does not write.
    expect(BLOCK_PLANNED_WEEKS).toBe(6);
    expect(BLOCK_DELOAD_WEEK).toBe(BLOCK_PLANNED_WEEKS);
    expect(BLOCK_START_SENTENCE).toBe(
      'This starts a six-week training block: five weeks that build, then a lighter recovery week.',
    );
    // No mesocycle jargon, no em dash (house style, lint-enforced).
    expect(BLOCK_START_SENTENCE).not.toMatch(/mesocycle|deload|MEV|MAV|MRV|RIR/i);
    expect(BLOCK_START_SENTENCE).not.toContain('—');
  });

  test('the planEngine narrative no longer derives its own week count from experience', () => {
    const src = stripComments(read('lib/planEngine.js'));
    expect(src).not.toMatch(/const weeks = \(experience === 'advanced'/);
    expect(src).toMatch(/const weeks = BLOCK_PLANNED_WEEKS;/);
  });

  test('the block writer and the narrative read the same constant', () => {
    const db = read('lib/database.js');
    expect(db).toMatch(/BLOCK_PLANNED_WEEKS, BLOCK_PLANNED_WEEKS, BLOCK_DELOAD_WEEK/);
    // The old hardcoded literals never return to the INSERT.
    expect(db).not.toMatch(/VALUES \(\?, \?, \?, \?, \?, 6, 6, 6,/);
  });

  test('every first-plan activation decision point states it', () => {
    for (const f of [
      'screens/PlanLibraryScreen.js',
      'screens/PlanDetailScreen.js',
      'screens/PlansScreen.js',
      'screens/ManualBuilderScreen.js',
    ]) {
      expect(read(f)).toContain('BLOCK_START_SENTENCE');
    }
  });

  test('activation confirms itself everywhere, so a silent one is never retried by mistake', () => {
    // C5-P10-05: the two library paths ended in a bare goBack(), visually
    // identical to "Save for later"; a user who saw no change activated a
    // second plan and silently replaced the block created seconds earlier.
    for (const f of ['screens/PlanLibraryScreen.js', 'screens/PlanDetailScreen.js', 'screens/PlansScreen.js']) {
      expect(read(f)).toMatch(/is now your active plan`, \{ variant: 'success' \}/);
    }
  });

  test('no activation path skips the mid-block confirm, so one plan/block stays one decision', () => {
    // C5-P10-10: ManualBuilder was the one path that called
    // activatePlanWithBlock without confirmPlanSwitchMidBlock.
    for (const f of [
      'screens/PlanLibraryScreen.js',
      'screens/PlanDetailScreen.js',
      'screens/PlansScreen.js',
      'screens/ManualBuilderScreen.js',
      'screens/ProGoalSetupScreen.js',
    ]) {
      expect(read(f)).toContain('confirmPlanSwitchMidBlock');
    }
  });

  test('the manual builder success CTA names the tab it opens', () => {
    // C5-P10-06: "Go to Train" navigated to HomeTab, the tab titled Today.
    const src = read('screens/ManualBuilderScreen.js');
    expect(src).toContain('title="Go to Today"');
    expect(src).not.toContain('title="Go to Train"');
  });
});

describe('PLAN: the library answers what it is asking of you (C5-P10-02/03/04/09, D96)', () => {
  const gymAdvanced = {
    id: 'p-div', name: "Men's Physique", difficulty: 2,
    tags: 'category:division division:mens_physique days:5 advanced featured goal:build_muscle',
  };
  const bodyweightStarter = {
    id: 'p-bw', name: 'Bodyweight Start', difficulty: 0,
    tags: 'full_body equipment:bodyweight home gender:all goal:build_muscle days:3 beginner',
  };

  test('a no-equipment answer never returns a full-gym plan, whatever the goal scores', () => {
    // C5-P10-03: equipment used to be a +4 score bump, which "Get on stage"
    // (+5 for a division plan) outranked, so a "Home / no equipment" user
    // was shown a five-day advanced gym plan as "our suggestion".
    const pick = getQuizRecommendation(
      { goal: 'stage_prep', equipment: 'bodyweight' },
      [gymAdvanced, bodyweightStarter],
    );
    expect(pick).toBe(bodyweightStarter);
  });

  test('an emptied pool returns null, so the screen falls through to its own no-match branch', () => {
    expect(getQuizRecommendation({ goal: 'stage_prep', equipment: 'bodyweight' }, [gymAdvanced])).toBeNull();
    expect(read('screens/PlanLibraryScreen.js')).toContain('No exact match found');
  });

  test('a full-gym answer still sees everything', () => {
    const pick = getQuizRecommendation(
      { goal: 'stage_prep', equipment: 'full_gym' },
      [gymAdvanced, bodyweightStarter],
    );
    expect(pick).toBe(gymAdvanced);
  });

  test('browse and preview render days a week and equipment from the data plans already carry', () => {
    for (const f of ['screens/PlanLibraryScreen.js', 'screens/PlanDetailScreen.js']) {
      const src = read(f);
      expect(src).toContain('getPlanDays');
      expect(src).toContain('planEquipmentLabel');
    }
  });

  test('the Pro no-plan state on Train offers the action it names', () => {
    // C5-P10-09: an inert Card naming "Start with a plan", an action with
    // no Pro affordance, beside a free branch with two working CTAs.
    const block = read('screens/PlansScreen.js');
    const start = block.indexOf('icon="barbell-outline"');
    expect(start).toBeGreaterThan(-1);
    const empty = block.slice(start, block.indexOf('{/* Folders'));
    // D139: the no-plan CTA now previews before generating (prepareStartWithPlan
    // -> PlanPreviewSheet -> commitStartWithPlan, src/lib/startWithPlan.js), so
    // the action wired here is the preview-step handler, not a direct call to
    // generateAndSavePlan; the actual generation call lives in the shared
    // startWithPlan.js module the handler calls through to.
    expect(empty).toContain('onAction={handleStartWithPlanPress}');
    expect(empty).toContain('Browse plans');
    expect(stripComments(block)).not.toContain('No active plan · Start with a plan, browse the library');
    expect(read('lib/startWithPlan.js')).toContain('generateAndSavePlan');
  });
});

describe('HOME: zero history has one clear next action and claims no history (C5-P12-*, D96)', () => {
  // RE-PINNED (Campaign 22 Phase 2 Stage 2, HOME-TODAY-UX-SPEC.md §7/§15
  // item 4/§17 R3: "the hero shows a SINGLE counter"). The original C5-P12-02
  // fix (quoted in readinessSummary.js's own Priority 5 comment) added a
  // SECOND "N of M" counter here ("Block week 1 of 6") specifically to
  // disambiguate it from the eyebrow's "Day 1 of 2" -- which traded one
  // confusion for the two-counters-on-one-hero noise §7 later classified.
  // The underlying guarantee ("two 'N of M' lines cannot be confused") is
  // now trivially true a different way: only ONE counter survives on the
  // hero (the eyebrow's); this chip's default line never restates a block
  // position at all, so there is nothing left to confuse it with. The
  // dropped figure is one tap away in the block-shape sheet this same chip
  // opens.
  test('the block chip carries no counter of its own, so it can never duplicate the eyebrow\'s', () => {
    // RE-PINNED (lead activation ruling, this brief): a zero-history user
    // (lastSession: null - no session ever logged) must not be told "On
    // track for this block", which claims a track record that does not
    // exist. That copy now belongs to a user with at least one session; the
    // zero-history case gets its own honest line, still counter-free.
    const summary = buildReadinessSummary({
      currentMesoWeek: { isDeload: false, weekIndex: 1, plannedWeeks: 6, rirTarget: 3 },
      deloadSuggestion: null,
      fatigueHistory: [],
      lastSession: null,
    });
    expect(summary.line).toBe('First session of your plan. Nothing to read yet.');
    expect(summary.line).not.toMatch(/\d+ of \d+/);

    // The default block-phase read still holds, counter-free, once a
    // session exists (RE-PINNED AGAIN, founder device order 2026-08-17: the
    // default line dropped the "Stop N short of failure" effort wording for
    // the block fact).
    const afterFirstSession = buildReadinessSummary({
      currentMesoWeek: { isDeload: false, weekIndex: 1, plannedWeeks: 6, rirTarget: 3 },
      deloadSuggestion: null,
      fatigueHistory: [],
      lastSession: { soreness24hBefore: 1, sleepQuality: 4, energyScore: 4 },
    });
    expect(afterFirstSession.line).toBe('On track for this block.');
    expect(afterFirstSession.line).not.toMatch(/\d+ of \d+/);
  });

  // RE-PINNED (Campaign 22 Phase 2 Stage 1, FOUNDER-RULINGS-PHASE2 R3): the
  // everyday trial value card (S0-S3, including this S3 zero-history
  // variant) no longer renders on Home at all -- it rehomes to Profile/You
  // (Stage 2 scope, marked with a `// Stage 2:` comment at the retained
  // state in HomeScreen.js). The onTrialPress wiring this test used to pin
  // is retired with the card, so the original concern ("the top card leads
  // to the session it names, or stops claiming to") is now trivially true:
  // there is no top trial card on Home left to mislead anyone.
  // FOUNDER DECISION (fully free, no tier split, no trial): AttentionCard
  // itself is deleted (its trial/free_line/differential variants are all
  // retired), so the inert-fallback contract this test pinned no longer
  // has a component to live on.
  test('the top card on a zero-history Home leads to the session it names, or stops claiming to', () => {
    // C5-P12-01: the S3 variant (completed sessions <= 0) scrolled to y=0,
    // where the user already was, from the first element on the screen.
    const home = read('screens/HomeScreen.js');
    expect(home).not.toMatch(/variant === 'S3'\)\s*\{\s*\n\s*scrollRef\.current\?\.scrollTo/);
    // The everyday trial card's variant JSX is gone from Home entirely.
    expect(home).not.toMatch(/variant="trial"/);
    expect(() => read('components/AttentionCard.js')).toThrow();
  });

  test('no surface presupposes a check-in that has never happened', () => {
    // C5-P12-04 originally fixed the runway's fixed "Since your check-in"
    // title, which asserted a past event on a day-0 account. RE-PINNED
    // (Today truth repair): the runway component is DELETED outright, so the
    // stronger guarantee now holds - no Today surface says it at all.
    expect(fs.existsSync(SRC('components/CoachDailyBrief.js'))).toBe(false);
    expect(stripComments(read('screens/HomeScreen.js'))).not.toContain('Since your check-in');
  });

  test('the first block cannot claim personal history (standing law, re-pinned)', () => {
    const [line, ...rest] = buildBlockStartLines({
      summary: { chest: { week1: 8, peak: 14, peakWeek: 4, deload: 8, source: 'template' } },
    });
    expect(rest).toEqual([]);
    expect(line).toContain('Not enough personal history yet');
    expect(line).not.toMatch(/last block|past blocks|learned/);
  });
});

describe('WORKOUT: the first session completes honestly with no history (C5-P13-02/P15-01/P16-*/P17-03, D96)', () => {
  const AWS = read('screens/ActiveWorkoutScreen.js');

  test('the finish confirm compares against what the app seeded, not the module default', () => {
    // C5-P13-02: DEFAULT_SET.reps is 8, but a zero-history exercise seeds
    // reps from recommendedRepsMax (10/12/25/30 in the seeded plans) and
    // the carry-forward puts a number in weight after any logged set, so
    // "an unlogged set will be lost" was true in almost every real state.
    expect(stripComments(AWS)).not.toMatch(/currentSet\.reps !== DEFAULT_SET\.reps/);
    expect(AWS).toMatch(/const seed = seededEntryRef\.current;/);
    expect(AWS).toMatch(/return !!cluster\s*\n\s*\|\| !!perSide\s*\n\s*\|\| noteText\.trim\(\)\.length > 0\s*\n\s*\|\| !\(sameWeight && sameReps\);/);
    // The carry-forward is a seed, which is the state that made the claim
    // false for the rest of every session.
    expect(AWS).toMatch(/seededEntryRef\.current = \{ weight: setData\.weight, reps: setData\.actualReps \};/);
  });

  test('the honest first-lift guard keys on WORKING sets, so a warm-up never spends it', () => {
    // C5-P15-01: a 20kg warm-up used to consume the quiet "logged as your
    // starting point" acknowledgement, and the first working set ever was
    // then given the full gold record for beating it.
    expect(AWS).toMatch(/const isWorkingSetRow = \(s\) =>/);
    // Founder ruling 2026-08-23: the comparison is everything on record -
    // past sessions PLUS today's earlier working sets for this exercise.
    // FQ-7's prior-exposure gate, which silenced every set after the
    // opening one on a newly met exercise, is gone.
    expect(AWS).toMatch(/const prHistory = \[\s*\n\s*\.\.\.priorSets\.filter\(isWorkingSetRow\),/);
    expect(AWS).toMatch(/const prs = isWeightReps && !isWarmupSet && prHistory\.length > 0/);
    expect(AWS).not.toMatch(/hadPriorExposure/);
    // The recorded Wave A A1 gate itself is untouched: the one set that
    // cannot be a record is the one with nothing on record to beat, and it
    // gets the honest acknowledgement instead of a record claim.
    expect(AWS).toMatch(/!priorUnknown && prHistory\.length === 0/);
    // And the live record line reads the same history the log does (D87
    // contract), so the flag can neither promise a record the log withholds
    // nor stay dark on one the log gives.
    expect(AWS).toMatch(/historySets: \[\.\.\.allTimeSets, \.\.\.loggedSets\]\.filter\(isWorkingSetRow\)/);
  });

  test('the summary states a week in progress instead of a finished-week verdict', () => {
    // C5-P16-01: after session one of a four-session week every muscle read
    // "Below target" and was told to add sets its own plan already covers.
    const src = read('screens/WorkoutSummaryScreen.js');
    expect(src).toContain('Week in progress: {weekProgress.logged} of {weekProgress.planned} sessions logged.');
    // Final pass S4 (certification 2026-09-05): the week gate is composed with
    // the excluded-work gate (advice also waits for a muscle whose week held
    // explosive sets the volume read dropped). The week half is unchanged.
    expect(src).toMatch(/const adviceAllowed = weekJudgeable && !hasExcludedWork;/);
    expect(src).toMatch(/const insight = adviceAllowed \? getVolumeInsight\(/);
    expect(src).toMatch(/const why = adviceAllowed \? getVolumeWhy\(/);
    // getVolumeStatus, the landmarks and the colours are untouched.
    expect(src).toMatch(/const \{ label, status \} = getVolumeStatus\(data\.workingSets, muscle, landmarkResolution\?\.table\);/);
  });

  test('the first summary answers what happens next, and says why feedback is asked before asking', () => {
    const src = read('screens/WorkoutSummaryScreen.js');
    // Re-pinned 2026-08-18 (founder device order): the "It is ready on
    // Today whenever you are" tail read as nonsense on device and was cut.
    // The law - the first summary names what comes next - is unchanged.
    expect(src).toContain('Next up: {nextSessionName}.');
    // C5-P17-03: the purpose sentence renders OUTSIDE the expander.
    const card = src.slice(src.indexOf('Workout feedback'), src.indexOf('{feedbackExpanded &&'));
    expect(card).toContain('Your answers shape how your recovery is read');
  });
});

describe('BLOCK: the first block explains itself and never advances on its own (C5-P11-*, FB-*, D96)', () => {
  test('block start explains build then recovery, and that nothing rolls over', () => {
    const sheet = read('components/HomeBlockShapeSheet.js');
    expect(sheet).toMatch(/When the block finishes, you choose what comes next; nothing starts on its own/);
    // C5-P11-06: the definition is read before the provenance lines.
    expect(sheet.indexOf('GLOSSARY.mesocycle')).toBeLessThan(sheet.indexOf('seedLines.map'));
    // C5-P11-07: the countdown carries its unit noun.
    expect(read('components/BlockShapeCard.js')).toMatch(/Recovery week in \$\{weeksToRecovery\} \$\{weeksToRecovery === 1 \? 'week' : 'weeks'\}/);
  });

  test('nothing describes a block as an optional layer the user configures', () => {
    // C5-P11-03: the Train side's only block definition described controls
    // (start date, duration, recovery week) that do not exist.
    // D139: the copy moved out of this screen into the shared
    // BLOCK_DEFINITION constant (src/lib/blockExplain.js), consumed here as
    // `text={BLOCK_DEFINITION}` - the contract (what the block definition
    // says, and what it must never say) is pinned against that constant now.
    const src = stripComments(read('screens/MesocycleBuilderScreen.js'));
    expect(src).not.toMatch(/optional layer you add on top/);
    expect(src).not.toMatch(/Set a start date,\s*\n?\s*duration and recovery week/);
    expect(src).toContain('text={BLOCK_DEFINITION}');
    const def = read('lib/blockExplain.js');
    expect(def).not.toMatch(/optional layer you add on top/);
    expect(def).not.toMatch(/Set a start date,\s*\n?\s*duration and recovery week/);
    expect(def).toMatch(/Nothing rolls into a new block on its own/);
    // FB-20: and it no longer promises the block moves to Past blocks the
    // moment the last week completes.
    expect(def).not.toMatch(/the block closes and moves to Past blocks below/);
  });

  test('block completion does not auto-transition (FB-34/35 mechanisms stay intact)', () => {
    // The four FB-34 mechanisms, unchanged by this wave: a terminal
    // awaiting-decision state, one block writer, an explicit confirm in
    // front of it, and the re-entry guard FB-35 depends on.
    expect(read('lib/mesocycle.js')).toMatch(/completed_awaiting_decision/);
    const plans = read('screens/PlansScreen.js');
    expect(plans).toMatch(/if \(restartingRef\.current\) return;/);
    // FB-34/35 intent, re-pinned after the C16 completion pass (2026-08-14)
    // replaced the ADJUSTED route's one-line alert with a full next-block
    // review sheet. The guarantee is unchanged and, if anything, stronger:
    // both routes put an explicit user confirmation in front of the block
    // writer, and neither activates anything by being opened.
    expect(plans).toMatch(/appAlert\(\s*\n?\s*'Run this plan again\?'/);
    expect(plans).toMatch(/visible=\{!!blockReview\}/);
    expect(plans).toMatch(/onPress=\{confirmNextBlockReview\}/);
    expect(read('lib/blockAdvisor.js')).not.toMatch(/autoStart|automaticTransition/);
    // The suggestion banner is suppressed inside a scheduled recovery week
    // (FB-02), a display gate only -- shouldDeload is untouched.
    const home = read('screens/HomeScreen.js');
    expect(home).toMatch(/const inScheduledRecovery = !!currentMesoWeek\?\.isDeload \|\| !!currentMesoWeek\?\.awaitingDecision;/);
    expect(home).toMatch(/deloadBannerEligible = !!deloadSuggestion && !deloadDismissed && !inScheduledRecovery/);
  });

  test('"Block finished" fires on the finished state, once, not on every recovery-week session', () => {
    // FB-03: weekIndex >= plannedWeeks && !awaitingDecision IS the recovery
    // week itself, and the effect had no once-only guard.
    const src = read('screens/WorkoutSummaryScreen.js');
    expect(stripComments(src)).not.toMatch(/wk\.weekIndex >= wk\.plannedWeeks && !wk\.awaitingDecision/);
    expect(src).toMatch(/if \(wk\.mesocycleId && wk\.awaitingDecision\)/);
    expect(src).toMatch(/@volyume_block_finished_seen_\$\{wk\.mesocycleId\}/);
  });

  test('the finished block\'s summary is reachable during the decision window', () => {
    // FB-15: a finished block keeps is_active = 1 until the NEXT block is
    // created, so it was in neither Past blocks nor the summary button.
    const src = read('screens/MesocycleBuilderScreen.js');
    expect(src).toMatch(/\{finished && \(\s*\n\s*<Button\s*\n\s*title="View block summary"/);
    // And at the decision itself, where the summary is what informs it.
    const plans = read('screens/PlansScreen.js');
    expect(plans).toMatch(/blockAdvice\.action === 'post_recovery' && activeBlockId/);
    expect(plans).toMatch(/navigateCrossTab\(navigation, 'ProfileTab', 'BlockReflection', \{ mesocycleId: activeBlockId \}\)/);
  });

  test('block bests are labelled as bests, and the progress figure compares like for like', () => {
    // FB-16 / FB-17.
    const reflection = read('screens/BlockReflectionScreen.js');
    expect(reflection).toContain('Your best estimated max per lift');
    expect(reflection).not.toContain('Records set this block');
    const db = read('lib/database.js');
    expect(db).toMatch(/const lastAccumWeek = Number\.isFinite\(deloadWeek\) && deloadWeek > 1/);
    expect(stripComments(db)).not.toMatch(/const lastWeekCutoff = endMs - 7 \* 86400000;/);
  });

  test('the two next-block confirms describe their own actions, and the repeat label says repeat', () => {
    // FB-26 / FB-32. Re-anchored under FQ-2 (D96): the repeat label moved
    // from the advisor's repeat BRANCH to the option constant both branches
    // now render (NEXT_BLOCK_OPTION_LABELS), and the seed mapping gained the
    // entitlement. Same meanings: the repeat button says the plan runs again
    // unchanged, each confirm describes its own action, and only 'adjust'
    // applies the ledger.
    const advisor = read('lib/blockAdvisor.js');
    expect(advisor).toContain("repeat: 'Run this plan again, unchanged'");
    const plans = read('screens/PlansScreen.js');
    // FB-26 intent, re-pinned after the C16 completion pass: each route
    // still describes its OWN action. Repeat says the targets are the same;
    // the adjusted route now says it in the review sheet, where it also
    // shows the actual moves rather than describing them in one line.
    expect(plans).toMatch(/the same set targets as last time/);
    expect(plans).toContain('Your set targets');
    expect(plans).toContain('Only your set targets move.');
    // FOUNDER DECISION (fully free, no tier split): every account reaches
    // 'adjust' now, so the entitlement check is retired from this line.
    expect(plans).toMatch(/const seedIntent = intent === 'adjust' \? 'adjust' : 'repeat';/);
  });

  test('continuing with adjustments leaves a receipt naming what changed and what held', () => {
    // FB-24 / FB-27: composed from the seed ranges and the stored ledger,
    // so it can only describe what the write actually did.
    const receipt = buildSeedReceipt({
      ranges: {
        back: { startSets: 11, peakSets: 16, source: 'ledger' },
        chest: { startSets: 6, peakSets: 14, source: 'ledger' },
        biceps: { startSets: 6, peakSets: 12, source: 'ledger' },
      },
      ledger: {
        entries: [
          { muscle: 'back', observed: { startSets: 10, plannedPeak: 16 }, rationale: 'Back responded well.' },
          { muscle: 'chest', observed: { startSets: 6, plannedPeak: 14 }, rationale: 'Chest responded well at this dose.' },
          { muscle: 'biceps', observed: { startSets: 6, plannedPeak: 14 }, rationale: 'Biceps recovery cost ran high.' },
        ],
      },
    });
    expect(receipt.changed.map((r) => r.muscle).sort()).toEqual(['back', 'biceps']);
    expect(receipt.changed.find((r) => r.muscle === 'back').change).toContain('week 1 up from 10 to 11 sets');
    expect(receipt.changed.find((r) => r.muscle === 'biceps').change).toContain('peak down from 14 to 12 sets');
    expect(receipt.changed[0].rationale).toBeTruthy();
    expect(receipt.held).toBe(1);
    expect(receipt.heldLine).toMatch(/Keeping a dose that worked is a decision too/);
    expect(read('screens/PlansScreen.js')).toContain('buildSeedReceipt');
  });

  test('the block-start lines lead with what moved, say holding was a decision, and name the research remainder', () => {
    // FB-25 / FB-27 / FB-28: sorting by peak buried the only muscle whose
    // peak came down, and twelve research-seeded muscles were silent inside
    // a personalised-looking list.
    const lines = buildBlockStartLines({
      summary: {
        back: { week1: 11, peak: 16, peakWeek: 4, deload: 10, source: 'seed_ledger' },
        chest: { week1: 6, peak: 14, peakWeek: 4, deload: 6, source: 'seed_ledger' },
        biceps: { week1: 6, peak: 12, peakWeek: 4, deload: 6, source: 'seed_ledger' },
        quads: { week1: 8, peak: 14, peakWeek: 4, deload: 8, source: 'seed_profile' },
      },
      limit: 2,
      previous: {
        back: { startSets: 10, peakSets: 16 },
        chest: { startSets: 6, peakSets: 14 },
        biceps: { startSets: 6, peakSets: 14 },
      },
    });
    const joined = lines.join(' | ');
    expect(joined).toContain('Biceps');   // the reduced peak is no longer dropped
    expect(joined).toContain('Back');
    expect(joined).not.toContain('Chest'); // unchanged sorts last
    expect(joined).toContain('up from 10 in week 1');
    expect(joined).toContain('Plus 1 more muscle group, set the same way.');
    expect(joined).toContain('The rest still start from research-based guidance');
    // A retained muscle, when it is shown, states the retention.
    const held = buildBlockStartLines({
      summary: { chest: { week1: 6, peak: 14, peakWeek: 4, deload: 6, source: 'seed_ledger' } },
      previous: { chest: { startSets: 6, peakSets: 14 } },
    });
    expect(held[0]).toContain('kept where it was');
  });

  test('the recovery week is not reported back as a problem, and the coach card knows which week it is in', () => {
    // FB-05 / FB-06.
    const aws = read('screens/ActiveWorkoutScreen.js');
    const pill = aws.slice(aws.indexOf('Dismiss recovery week banner'));
    expect(pill.slice(0, 600)).toContain('>Got it<');
    const coach = read('screens/CoachOutputScreen.js');
    expect(coach).toMatch(/const upwardInRecovery = signal > 0 && currentWeekIsDeload;/);
    // RE-ANCHORED under the C18 recovery-visibility amendment, SAME MEANING.
    // FB-06's point is that inside the recovery week this note must name the
    // week the user is actually in rather than falling through to "This is
    // next week's starting point" beside a row reading "Add 2 sets". That is
    // unchanged; what changed is where the state SENTENCE comes from. It used
    // to be a local string here, which is how this card and Train ended up
    // describing a mid-block recovery adjustment and the block's own recovery
    // week in identical words. Both halves are still asserted: this card's own
    // clause about adding nothing, and the shared sentence from the one
    // authority every recovery surface now reads.
    expect(coach).toMatch(/const recoveryReviewLine = reviewRecoveryLine\(currentRecoveryState\);/);
    expect(coach).toContain('`Nothing is added this week. ${recoveryReviewLine');
    expect(reviewRecoveryLine(resolveRecoveryState({
      weekIndex: BLOCK_DELOAD_WEEK, plannedWeeks: BLOCK_PLANNED_WEEKS,
      deloadWeek: BLOCK_DELOAD_WEEK, isDeload: true,
    }))).toBe('You are in your recovery week. Training is lighter before you move on from this block, and you will choose what comes next when it is done.');
  });

  test('the peak-week warning is reachable in the week it is true', () => {
    // FB-04: the advisor composed it and no screen ever rendered it.
    const plans = read('screens/PlansScreen.js');
    expect(plans).toMatch(/const showPeakWeekNote = blockAdvice\?\.action === 'continue'/);
    expect(plans).toMatch(/blockAdvice\?\.action === 'continue' && showPeakWeekNote/);
    expect(read('lib/blockAdvisor.js')).toContain("One more week before your recovery week");
  });

  test('the block story ends where the decision is, not with an instruction to recover again', () => {
    // FB-23.
    const story = read('screens/YearOfLiftsScreen.js');
    expect(story).toContain('That block is done, recovery week included.');
    expect(story).not.toContain('Recover well, then go again.');
    expect(story).not.toContain('Your full block summary is inside.');
  });

  test('no wave C copy reintroduces block jargon', () => {
    for (const f of [
      'components/HomeBlockShapeSheet.js',
      'components/BlockShapeCard.js',
      'screens/MesocycleBuilderScreen.js',
      'screens/BlockReflectionScreen.js',
    ]) {
      const src = stripComments(read(f));
      // Identifiers, module paths and props may carry the words; the
      // strings the user reads may not. Import specifiers are the one
      // legitimate literal use of the module name.
      const literals = (src.match(/'[^'\n]*'|"[^"\n]*"|`[^`]*`/g) ?? [])
        .filter((l) => !l.includes('/mesocycle'));
      for (const literal of literals) {
        expect(literal).not.toMatch(/\b(mesocycle|periodisation|hypertrophy|deload)\b/i);
      }
    }
  });
});

// ───────────────────────────────────────────────────────────────────────
// FQ-2 (D96, founder ruling 2026-08-10): the next-block decision.
//
// "At block completion PRO always sees BOTH Repeat and
// Continue-with-adjustments as side-by-side legitimate choices; the
// advisor may recommend and explain but never hides, gates or forces;
// Continue-with-adjustments consumes the Block Ledger (a successful block
// never silently discards it). FREE does not receive adaptive next-block
// coaching; if the option renders for Free at all it is truthfully
// Pro-gated through the existing entitlement UX. The accidental
// entitlement logic MUST GO ... tier eligibility comes from the real
// Free/Pro entitlement system."
//
// Fixes FB-19 (the decision was made from check-in readiness and a
// well-run block discarded its own ledger), FB-31 (the two options were
// never presented together), FB-33 ("anyway") and FB-36 (a placeholder
// weekly_checkins row decided tier reachability). Preserves FB-34/35: an
// explicit confirm in front of every transition, and a true repeat.
// ───────────────────────────────────────────────────────────────────────

describe('BLOCK DECISION: both options, advice that cannot gate, entitlement from tier (FQ-2, D96)', () => {
  const advisor = read('lib/blockAdvisor.js');
  const plans = read('screens/PlansScreen.js');

  test('PRO: both options exist under every recommendation, in a fixed order', () => {
    for (const recommendation of ['repeat', 'adjust', 'consider_rebuild', null]) {
      const options = buildNextBlockOptions({ recommendation, isPro: true });
      expect(options.map((o) => o.intent)).toEqual(['repeat', 'adjust']);
      expect(options.map((o) => o.locked)).toEqual([false, false]);
    }
  });

  test('PRO: a repeat recommendation still leaves Continue with adjustments reachable', () => {
    // FB-31 + FB-19's perverse case: a block that went WELL scored
    // avgReadiness >= 60, was recommended 'repeat', and the adaptive path
    // simply did not exist on the card. The recommendation is advice now.
    const [repeat, adjust] = buildNextBlockOptions({ recommendation: 'repeat', isPro: true });
    expect(repeat.label).toBe('Run this plan again, unchanged');
    expect(repeat.recommended).toBe(true);
    expect(adjust.label).toBe('Continue with adjustments');
    expect(adjust.recommended).toBe(false);
    expect(adjust.locked).toBe(false);
  });

  test('PRO: an adjust recommendation still leaves the plain repeat reachable', () => {
    const [repeat, adjust] = buildNextBlockOptions({ recommendation: 'adjust', isPro: true });
    expect(adjust.recommended).toBe(true);
    expect(repeat.recommended).toBe(false);
    expect(repeat.locked).toBe(false);
  });

  test('PRO: the fresh-look branch marks neither option, and removes neither', () => {
    const options = buildNextBlockOptions({ recommendation: 'consider_rebuild', isPro: true });
    expect(options.some((o) => o.recommended)).toBe(false);
    expect(options.every((o) => !o.locked)).toBe(true);
  });

  test('PRO: the ledger rows render with the decision, whichever option is favoured (FB-19)', () => {
    // The rows used to be gated on the recommendation itself, so the one
    // case where the ledger was thrown away was a block that went well.
    // (RA-2 re-anchor, same meaning: the rows are built once as allRows so
    // the unjudged check can see every entry, then sliced for display.)
    expect(plans).toMatch(/const allRows = buildLedgerReflectionRows\(ledger\)/);
    // FOUNDER DECISION (fully free, no tier split): every account sees the
    // rows now, so the tier ternary that gave Free an empty array is
    // retired.
    expect(plans).toMatch(/rows: allRows\.slice\(0, 4\),/);
    expect(stripComments(plans)).not.toMatch(/recommendation === 'adjust'/);
    // And with both options on the card, the forward claims say which
    // option applies them.
    expect(plans).toContain('These apply if you continue with adjustments.');
    expect(plans).toContain('What this block showed');
  });

  test('PRO: the adjust path consumes the ledger; the repeat path stays a true repeat', () => {
    expect(plans).toMatch(/const seedIntent = intent === 'adjust' \? 'adjust' : 'repeat';/);
    expect(plans).toMatch(/buildSeedRangesForNextBlock\(user\.id, \{\s*\n\s*intent: seedIntent,/);
    expect(plans).toMatch(/recordSeedOutcome\(user\.id, seedRanges\.sourceMesocycleId, \{\s*\n\s*intent: seedIntent/);
    expect(plans).toMatch(/const receipt = seedIntent === 'adjust'/);
  });

  test('FREE param: buildNextBlockOptions locks nothing any more (fully free, D139/D137)', () => {
    // "Free's repeat path (run the plan again) keeps working -- that is core
    // training, not coaching." The adjusted path used to render Pro-marked
    // and locked for isPro: false; D139 retired that dead gating (the
    // product has had no tier split since D137) so BOTH options are always
    // reachable and the "Part of Pro" detail line is gone outright.
    const [repeat, adjust] = buildNextBlockOptions({ recommendation: 'adjust', isPro: false });
    expect(repeat.locked).toBe(false);
    expect(repeat.requiresPro).toBe(false);
    expect(adjust.locked).toBe(false);
    expect(adjust.requiresPro).toBe(false);
    expect(adjust.detail).not.toContain('Part of Pro');
    // No advisor recommendation reaches a free user at all.
    expect(repeat.recommended).toBe(false);
    expect(adjust.recommended).toBe(false);
  });

  test('FREE: entitlement is the tier, never the presence of a check-in row (FB-36)', () => {
    // The old accidental entitlement: a weekly_checkins row carrying only
    // sleepQuality scored exactly 50 and flipped the branch to 'adjust',
    // while no rows at all defaulted to 70 and produced 'repeat'.
    expect(checkinReadiness({ sleepQuality: 3 })).toBeNull();
    expect(checkinReadiness({})).toBeNull();
    // A row that answers even one question is scored exactly as before.
    expect(checkinReadiness({ energyScore: 3, sorenessScore: 3, sleepHours: null })).toBe(50);
    expect(checkinReadiness({ energyScore: 5, sorenessScore: 1, sleepHours: 9 })).toBe(100);
    // A placeholder row cannot change what a free user can reach.
    const withPlaceholderAdvice = buildNextBlockOptions({ recommendation: 'adjust', isPro: false });
    const withNoAdvice = buildNextBlockOptions({ recommendation: null, isPro: false });
    expect(withPlaceholderAdvice.map((o) => o.locked)).toEqual(withNoAdvice.map((o) => o.locked));
    // FOUNDER DECISION (fully free, no tier split): every account gets
    // adaptive next-block coaching now, so isPro is always true.
    expect(plans).toMatch(/getBlockAdvice\(user\.id, block, userProfile, \{ isPro: true \}\)/);
    expect(advisor).toMatch(/export async function getBlockAdvice\(userId, activeBlock, userProfile, \{ isPro = false \} = \{\}\)/);
  });

  // FOUNDER DECISION (fully free, no tier split): the Pro-marked/locked UI
  // (ProBadge, the second `tier !== 'pro'` lock, the ProUpgrade route) is
  // retired entirely from PlansScreen -- there is no Free-locked state left.
  // The advisor lib itself is untouched: it still supports isPro:false for
  // any caller that passes it (checked directly on the lib, above).
  test('the Pro-marked/locked UI (ProBadge, the second lock, ProUpgrade) is retired from PlansScreen', () => {
    expect(plans).not.toContain('<ProBadge size="sm" />');
    expect(plans).not.toMatch(/navigation\.navigate\('ProUpgrade'/);
    expect(plans).not.toMatch(/tier !== 'pro'/);
  });

  test('the explicit confirm and the no-auto-transition guards survive the new options (FB-34/35)', () => {
    // FB-34/35 intent, re-pinned after the C16 completion pass (2026-08-14)
    // replaced the ADJUSTED route's one-line alert with a full next-block
    // review sheet. The guarantee is unchanged and, if anything, stronger:
    // both routes put an explicit user confirmation in front of the block
    // writer, and neither activates anything by being opened.
    expect(plans).toMatch(/appAlert\(\s*\n?\s*'Run this plan again\?'/);
    expect(plans).toMatch(/visible=\{!!blockReview\}/);
    expect(plans).toMatch(/onPress=\{confirmNextBlockReview\}/);
    expect(plans).toMatch(/if \(restartingRef\.current\) return;/);
    expect(advisor).not.toMatch(/autoStart|automaticTransition/);
    // FOUNDER DECISION (fully free, no tier split): every option press goes
    // straight to the confirming handler now -- the locked/ProUpgrade branch
    // of the ternary is retired, nothing activates a block directly.
    expect(plans).toMatch(/onPress=\{\(\) => handleRestartPlan\(opt\.intent\)\}/);
  });
});

// ───────────────────────────────────────────────────────────────────────
// Wave E (D96): audiences, copy density, hierarchy, tier truth.
//
// The organising rule for the two tier blocks below: FREE DOES NOT HAVE
// COACHING (founder, 2026-08-10). Every pin here is copy, hierarchy or
// affordance truth. Not one of them moves a gate, and the single
// reachability change in the wave (the Safety checks section) moves a
// guardrail INPUT out of a tier branch, which the tier-blind guardrail
// mandate requires rather than permits.
// ───────────────────────────────────────────────────────────────────────

describe('FREE: the tier is told the truth about itself (C5-P7-*, C5-P8-*, D96)', () => {
  test('no surface advertises the deleted plate calculator (C5-P7-02)', () => {
    // The feature is REJECTED and gone (D14/D57). It was being sold on the
    // very screen the paywall nominates as its honest answer.
    for (const f of [
      'screens/SubscriptionPolicyScreen.js',
      'screens/ProUpgradeScreen.js',
      'screens/WelcomeScreen.js',
      'components/TierComparisonStrip.js',
    ]) {
      expect(stripComments(read(f))).not.toMatch(/[Pp]late calculator/);
    }
  });

  test('the account and cloud backup are never sold as a Pro feature (C5-P7-03 / C5-P8-05)', () => {
    const policy = read('screens/SubscriptionPolicyScreen.js');
    // An account is mandatory for everyone and the sync layer reads no tier.
    expect(policy).not.toContain('An account so your data is backed up and follows you across phones.');
    expect(policy).not.toContain('your training data stays on your phone.');
    expect(policy).toMatch(/backed up to your account whatever tier you are on/);
    // The paywall's unreachable no-account branch carried the same framing.
    expect(read('screens/ProUpgradeScreen.js')).not.toContain('Pro needs a free account');
  });

  test('the downgrade promises name only what the guards actually keep readable (C5-P7-04)', () => {
    const policy = read('screens/SubscriptionPolicyScreen.js');
    const account = read('screens/SettingsAccountScreen.js');
    // WeeklyCheckIn and NutritionTargets are hard withProGuard locks, not
    // read-only ones, so neither may be promised as "stays viewable". This
    // copy-level contract on the DORMANT downgrade-policy screen is
    // unchanged and still checked (SubscriptionPolicyScreen.js stays on
    // disk unregistered, D137, in case a future monetisation decision
    // revives it, and its copy must not have drifted wrong in the meantime).
    expect(policy).not.toContain("Past check-ins stay viewable");
    expect(policy).not.toContain('Nutrition targets last set on Pro stay visible');
    expect(account).not.toMatch(/Past coach decisions, check-ins, training blocks and PRs remain readable/);
    // The three screens the founder's 2026-07-02 read-only decision covers.
    expect(policy).toMatch(/Body measurements, progress photos and your food diary stay viewable/);
    // The RootNavigator cross-check against a live withProGuard lock is
    // dropped (D137): there is no guard of any kind on WeeklyCheckIn or
    // NutritionTargets any more (see proScreenGating.guard.test.js) -- the
    // "what the guards actually keep readable" question this test title
    // asks has no live answer to check while the dormant screen's copy is
    // never shown to a real user.
  });

  test('one canonical "what stays free" list, and the shorter surfaces point at it (C5-P7-09)', () => {
    const policy = read('screens/SubscriptionPolicyScreen.js');
    // Every item on the shorter lists appears on the canonical one.
    for (const claim of ['plans you can pick from', 'Create your own', 'Personal records', 'Training blocks']) {
      expect(policy).toContain(claim);
    }
    // The paywall FAQ no longer drops the plan library and blocks, and it
    // names where the full answer lives.
    const paywall = read('screens/ProUpgradeScreen.js');
    expect(paywall).toMatch(/the plan library[\s\S]{0,80}training blocks/);
    expect(paywall).toContain('What stays if you switch back to Free later');
  });

  // FOUNDER DECISION (fully free, no tier split): the "You're on Free" tier
  // signal is retired entirely -- there is no tier to state any more.
  test('the tier signal is retired: no account is ever told it is "on Free"', () => {
    const coach = read('screens/YouScreen.js');
    expect(coach).not.toContain("You&apos;re on Free");
  });

  // FOUNDER DECISION (fully free, no tier split): the Coach tab's Free pitch
  // (and its ProUpgrade route) is retired -- every account reads the Pro
  // status card content, always.
  test('the Coach tab always carries the real coaching status card, never a Free pitch', () => {
    const coach = stripComments(read('screens/YouScreen.js'));
    expect(coach).not.toContain('Coach is available on Pro');
    expect(coach).not.toMatch(/navigation\.navigate\('ProUpgrade', \{ source: 'coach_pitch_card' \}\)/);
    expect(coach).toContain('What changed, what was held, and the exact signals behind it.');
  });

  test('the free column carries the tier word, never a hardcoded currency (C5-P8-01)', () => {
    const strip = stripComments(read('components/TierComparisonStrip.js'));
    expect(strip).not.toMatch(/£0/);
    expect(strip).not.toMatch(/[£$€]\d/);
    // The Pro column still reads the active store's localised price.
    expect(strip).toContain("priceFor('pro', pricingWindow)");
  });

  test('the differential copy never credits an engine the free reader does not have (FB-13 / C5-P7-06)', () => {
    const src = read('lib/differentialPaywall.js');
    // The trigger is fed from the tier-blind deload signal, not the Pro engine.
    expect(src).not.toContain('Precision Coaching is holding a lighter week');
    expect(src).toContain('Your training is pointing to a lighter week.');
    // The stalled-lift trigger fires for ANY lift and is passed no identity.
    expect(src).not.toContain("Your bench hasn't moved");
    expect(src).toContain("One of your lifts hasn't moved in three weeks.");
  });

  // FOUNDER DECISION (fully free, no tier split): the Pro teaser card is
  // deleted entirely -- there is no upsell left to end.
  test('the Pro teaser is retired entirely (FM-05 superseded)', () => {
    expect(() => read('components/HomeProTeaserCard.js')).toThrow();
    expect(read('screens/HomeScreen.js')).not.toMatch(/HomeProTeaserCard/);
  });

  // FOUNDER DECISION (fully free, no tier split): every destination is
  // genuinely open to every account now, so there is one sentence, not a
  // tier fork -- the old Free-only "consistency, lifts" sentence is retired.
  test('the Progress empty state promises the same, real destinations to every account (C5-P35-01 superseded)', () => {
    const src = read('screens/AnalyticsScreen.js');
    expect(src).toContain('Training charts appear here once sessions are logged. Body metrics, progress photos and scans are still available below.');
    expect(src).not.toContain('Your consistency, lifts and full history are still available below.');
  });

  test('the safety screener is reachable on every tier (W-8 / C5-P7-07)', () => {
    const coach = read('screens/YouScreen.js');
    const section = coach.slice(coach.indexOf('<SectionLabel>Safety checks</SectionLabel>') - 600);
    // YouScreen is the ONLY route to the wellbeing screener in the app, and
    // it sat inside the isPro branch. Guardrails never consult tier.
    expect(section).toContain("navigation.navigate('WellbeingCheck')");
    expect(coach).not.toMatch(/\{isPro \? \([\s\S]{0,200}<SectionLabel>Safety checks<\/SectionLabel>/);
    // Both destinations are registered ungated, so the rows cannot dead-end.
    const nav = read('navigation/RootNavigator.js');
    expect(nav).toMatch(/name="WellbeingCheck" component=\{WellbeingCheckScreen\}/);
    expect(nav).toMatch(/name="GoalLockConsent" component=\{GoalLockConsentScreen\}/);
    expect(nav).not.toMatch(/withProGuard\(WellbeingCheckScreen/);
  });

  test('no dead Pro route: every free-reachable lock still lands on a working gate', () => {
    const gate = read('components/ProGate.js');
    // A "Not now" that always lands somewhere, an upgrade path and a restore.
    expect(gate).toContain('HomeTab');
    expect(gate).toMatch(/ProUpgrade/);
    expect(gate).toMatch(/[Rr]estore/);
  });
});

describe('FREE: zero-history Home claims no history it does not have (C5-P7-05 / C5-P1-08, D96)', () => {
  // FOUNDER DECISION (fully free, no tier split): every account has a
  // coach now, so the isPro fork is retired -- one sentence for everyone.
  test('the welcome card promises a coach to every account (superseded)', () => {
    const card = stripComments(read('components/HomeWelcomeCard.js'));
    expect(card).toContain('Your coach learns as you train');
    expect(card).not.toMatch(/isPro/);
    expect(read('screens/HomeScreen.js')).toContain('<HomeWelcomeCard onDismiss={dismissWelcome} />');
  });

  test('the free welcome copy claims no past training and no personalisation from it', () => {
    const card = stripComments(read('components/HomeWelcomeCard.js'));
    // Nothing may read the app's history back to a user who has none.
    expect(card).not.toMatch(/based on your (last|previous|recent)/i);
    expect(card).not.toMatch(/we(?:'ve| have) (?:seen|learned|noticed)/i);
    expect(card).not.toMatch(/your (?:trend|average|usual)/i);
  });
});

describe('PRO: setup hands over live features only, and no removed one (D96)', () => {
  test('the hand-off states that a training block is already running (C5-P10-01)', () => {
    // The wave C carry-over: setup generates AND activates a plan, so a block
    // is live, and the user first met "Week 1 of 6" days later.
    // RE-POINTED (D137, fully free product): FreeStarterScreen.js (the free
    // path) is deleted outright; HomeScreen.js and PlansScreen.js's merged
    // "Start with a plan" no-plan state (see noPlanJourneyCopy.guard.test.js)
    // is the one surviving hand-off surface and carries the same sentence.
    expect(read('screens/ProSetupCompleteScreen.js')).toContain('BLOCK_START_SENTENCE');
    expect(read('screens/HomeScreen.js')).toContain('BLOCK_START_SENTENCE');
    expect(read('screens/PlansScreen.js')).toContain('BLOCK_START_SENTENCE');
  });

  test('every hand-off destination is a registered, live route', () => {
    const src = read('screens/ProSetupCompleteScreen.js');
    const nav = read('navigation/RootNavigator.js');
    const routes = [...src.matchAll(/navigation\.navigate\('([A-Za-z]+)'/g)].map(m => m[1]);
    expect(routes.length).toBeGreaterThan(0);
    for (const route of new Set(routes)) {
      expect(nav).toContain(`name="${route}"`);
    }
  });

  test('no cardio promise survives on any first-use surface, either tier', () => {
    // FirstRunScreen.js and FreeStarterScreen.js removed from this
    // enumeration (D137, fully free product): both are deleted outright.
    // HomeScreen.js and PlansScreen.js added: they carry the merged
    // "Start with a plan" no-plan hand-off that replaced them.
    for (const f of [
      'screens/ProSetupCompleteScreen.js',
      'screens/ProOnboardingScreen.js',
      'screens/HomeScreen.js',
      'screens/PlansScreen.js',
      'screens/WelcomeScreen.js',
      'screens/SubscriptionPolicyScreen.js',
      'components/TierComparisonStrip.js',
      'components/HomeWelcomeCard.js',
    ]) {
      expect(stripComments(read(f))).not.toMatch(/[Cc]ardio/);
    }
  });
});

describe('DENSITY: the wizard explains each step once (C5-P36-01/02/03, D96)', () => {
  test('the header sub is the single explanation carrier on every step', () => {
    const src = read('screens/ProOnboardingScreen.js');
    // Each step used to render a header title+sub then a group title+sub
    // saying the same thing, before the first field.
    for (const dupe of [
      'Name, sex, age, height and body weight are the minimum safe inputs for your first targets.',
      'These answers choose the starting split, exercise pool and weekly workload.',
      'Start with the broad goal. Competitive category and weak points are optional refinements.',
    ]) {
      expect(src).not.toContain(dupe);
    }
    // RA-7 + RC-7 (Reviews A and C, D96): every wizard step has exactly
    // one QuestionGroup, so a group title grouped nothing and restated
    // the header. All four are gone; the icon keeps the visual grouping
    // and the header sub stays the single purpose carrier (C5-P36-01).
    //
    // Pinned on the QuestionGroup props themselves rather than on the four
    // title strings. "Plan fit" returned in 2026-08 as the HEADER title of
    // the schedule-fit panel, which is the opposite of the defect: its own
    // screen, its own purpose, and no group underneath restating it. A
    // string match could not tell the two apart; this can.
    for (const tag of (stripComments(src).match(/<QuestionGroup[^>]*>/g) ?? [])) {
      for (const title of [
        'title="Required details"', 'title="Starting body composition"',
        'title="Plan fit"', 'title="Goal and targets"',
      ]) {
        expect(tag).not.toContain(title);
      }
    }
    // Every header sub, and therefore every step's purpose, is still stated.
    for (const sub of [
      'These details let the app set a safe starting baseline without guessing.',
      'An honest estimate sharpens your first plan. Skip this if you are not sure.',
      'The plan should fit your real week, not the week you wish you had.',
      'Your goal sets the calorie direction, training bias and nutrition target.',
    ]) {
      expect(src).toContain(sub);
    }
  });

  test('onboarding advertises no feature the user has not reached (C5-P36-03)', () => {
    const src = stripComments(read('screens/ProOnboardingScreen.js'));
    // The body-fat question carried a Volyume Score trailer with none of the
    // careful framing that feature's own surfaces use, weeks before it is
    // relevant. Body-image adjacent, and an explicit non-goal of the order.
    expect(src).not.toMatch(/Progress Photos can refine physique change later/);
    expect(src).not.toMatch(/Volyume Score/);
  });

  test('no field, gate or safety hint was removed with the duplication', () => {
    const src = read('screens/ProOnboardingScreen.js');
    // RA-4 (Review A, D96): the name left the required list - it is
    // presentation only, the same rationale C5-P1-09 recorded for Free.
    // Every SAFETY-bearing required field keeps its hint.
    for (const hint of [
      // D146 (2026-09-04): the generic under-button hints became per-box
      // messages; the gates behind them are unchanged.
      'Choose your biological sex.',
      'Enter your body weight.',
      'Choose your training experience.',
      // Training days joined the gate in 2026-08: the wizard no longer
      // defaults anyone to four sessions, so it has a message too.
      'Choose your training days.',
      'Choose your equipment.',
      'Enter your best current estimate or a measured value.',
      'Be honest here. This sets how much volume your plan includes, so it can protect your recovery.',
    ]) {
      expect(src).toContain(hint);
    }
    // The recovery question, what it drives and the write-before-prompt
    // reminder ordering are all untouched.
    expect(src).toContain("label=\"How's your recovery?\"");
    expect(src).toContain('tip={GLOSSARY.volume}');
  });
});

describe('HIERARCHY: two instructional sheets never stack (C5-P37-02, D96)', () => {
  test('each auto-firing sheet defers while the other is open, and re-fires after', () => {
    const src = read('screens/ActiveWorkoutScreen.js');
    // Generated plans really do pair unilateral accessories into supersets
    // (assignSupersets excludes beginners only), so the exposed case is an
    // intermediate or advanced user's FIRST session.
    expect(src).toContain('if (unilateralSheetOpenRef.current) return;');
    expect(src).toContain('if (supersetSheetOpenRef.current) return;');
    // The refs are set beside each setState, so the guard holds inside the
    // same commit, where the state has not landed yet.
    expect(src).toMatch(/supersetSheetOpenRef\.current = true;\s*\n\s*setSupersetHeadsUp\(\{/);
    expect(src).toMatch(/unilateralSheetOpenRef\.current = true;\s*\n\s*setUnilateralSuggest\(\{/);
    // Each effect re-runs when the other sheet closes, so the deferred one
    // arrives at its next natural moment rather than being lost.
    expect(src).toMatch(/\}, \[currentSGI, pairedExerciseName, exercise\?\.name, unilateralSuggest\]\);/);
    // supersetHeadsUp must stay a dependency (that is what re-fires the
    // deferred walkthrough); the array may carry others beside it, and
    // does since the 2026-08-21 laterality guard joined it.
    expect(src).toMatch(/unilateralPrefsLoaded, unilateralAsked, supersetHeadsUp[^\]]*\]\);/);
    // Both one-time acknowledgement rules survive untouched.
    expect(src).toContain('acknowledgedSupersetsRef.current.add(currentSGI);');
    expect(src).toContain('acknowledgedUnilateralRef.current.add(exercise.id);');
  });
});

describe('VOCABULARY: the words are glossed where they are first met (C5-P34-*, D96)', () => {
  test('the coach gloss on the app\'s first screen actually renders (C5-P34-01)', () => {
    const src = stripComments(read('screens/WelcomeScreen.js'));
    // Founder ruling 2026-09-04: the mocked example week (and its Coach row,
    // which carried the gloss) left the first screen. The rule behind this
    // pin is "gloss the term where it is first met": the first screen now
    // uses no coaching vocabulary at all, so either the gloss renders there
    // or the word never appears there. Both are checked so a future line
    // that reintroduces the term cannot arrive without its gloss.
    // D145: the founder's support line names "coaching" as one of the four
    // things the app connects; that is plain English, not the product term.
    // The gloss obligation attaches to the product term and to the Coach
    // surface's own noun.
    const usesTerm = /\bcoach\b/i.test(src) || /Precision Coaching/.test(src);
    if (usesTerm) {
      expect(src).toContain('<InfoTooltip text={GLOSSARY.precisionCoaching}');
    } else {
      expect(src).not.toContain('GLOSSARY.precisionCoaching');
    }
    // And the two-fragment slogan stays gone from the first screen.
    expect(src).not.toMatch(/Less thinking\. More lifting\./);
  });

  test('the record line is glossed on the surface a novice first meets it (C5-P34-02)', () => {
    const summary = read('screens/WorkoutSummaryScreen.js');
    expect(summary).toContain("import { GLOSSARY } from '../lib/coachGlossary';");
    // Founder ruling 2026-08-23 reworded the line off the abbreviation:
    // the number was always one per LIFT, so "N new PRs" undercounted a
    // session with several new bests on the same lift. The gloss stays
    // attached to whatever that line now says - its own opening words are
    // "a new best for you on an exercise", so it still explains it.
    expect(stripComments(summary)).toMatch(/\{prLine\}<\/Text>[\s\S]{0,120}<InfoTooltip text=\{GLOSSARY\.pr\} size=\{13\} \/>/);
    expect(summary).toMatch(/New bests on \$\{detectedPRs\.length\} lifts/);
    expect(stripComments(summary)).not.toMatch(/new PR\{/);
    // The in-session celebration labels stay plain English, unabbreviated.
    const celebration = read('components/PRCelebration.js');
    expect(celebration).toContain('First lift logged');
    expect(celebration).toContain('New heaviest weight');
  });

  test('the effort instruction names its own door (C5-P34-04)', () => {
    const home = read('screens/HomeScreen.js');
    // The chip publishes "stop N short of failure" and opens the only sheet
    // that defines it; its label named the block and nothing else.
    expect(home).toContain('accessibilityLabel="See the shape of your training block and what the effort target means"');
    expect(read('components/HomeBlockShapeSheet.js')).toContain('GLOSSARY.rir');
  });

  test('Est. max claims only the evidence it has (C5-P14-03, re-pinned for phase 2B)', () => {
    // C5-P14-03 fixed the gloss's false "your recent sets" claim. Phase 2B
    // (founder ruling, physical-device screenshots) then removed the routine
    // est-max caption from SetEntry entirely - the stronger form of the same
    // honesty law: copy that is not shown can claim nothing. The corrected
    // gloss text stays pinned for any surface that may cite it.
    expect(read('lib/coachGlossary.js')).not.toContain('worked out from your recent sets');
    expect(read('lib/coachGlossary.js')).toContain('worked out from the weight and reps of a set');
    const entry = read('components/SetEntry.js')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(entry).not.toContain('Est. max');
  });
});

describe('LOGGER: the first session states its effort target and its own words (C5-P13-*, C5-P14-02, D96)', () => {
  test('the session header carries NO standing effort line (C5-P13-01 reversed by founder device order 2026-08-17)', () => {
    // C5-P13-01 added "This week: stop N short of failure" to the session
    // header; the founder's device verdict removed it with the rest of the
    // standing logger explanations - the prescription is the intelligence.
    // Comments stripped: the retirement notes may cite the old wording.
    const src = read('screens/ActiveWorkoutScreen.js')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(src).not.toContain('short of failure');
    expect(src).not.toContain('weekRirTarget');
    expect(src).not.toContain('<InfoTooltip');
  });

  test('the set/rep cue survives until it has been used once (C5-P13-03)', () => {
    const src = read('screens/ActiveWorkoutScreen.js');
    // Logging a set used to write the once-ever seen flag, destroying the
    // only cue pointing at the only definitions of "set" and "rep".
    const logHandler = src.slice(src.indexOf('addSetToCurrentExercise(setData);'), src.indexOf("audit('workout.set.logged'"));
    expect(logHandler).not.toContain('@volyume_seen_workout_info');
    // The overflow tap still retires it, once ever.
    const overflowTap = src.slice(src.indexOf("audit('workout.overflow.open'") - 500, src.indexOf("audit('workout.overflow.open'"));
    expect(overflowTap).toContain("AsyncStorage.setItem('@volyume_seen_workout_info', 'true')");
    // And while it is live the button says what is behind it.
    expect(src).toContain("accessibilityLabel={showInfoTipPulse ? 'Exercise options, including how logging works' : 'Exercise options'}");
    expect(src).toMatch(/showInfoTipPulse \? \(\s*\n\s*<Text style=\{\[styles\.overflowHintLabel/);
  });

  test('the warm-up sheet helps the user with no working weight (C5-P13-04)', () => {
    const src = read('screens/ActiveWorkoutScreen.js');
    // The branch aimed at the first-timer used to be a dead end.
    expect(src).not.toContain('Enter your working weight first, then come back for warm-up sets.');
    expect(src).toContain('No working weight yet. Start with the empty bar');
    // B8 stands: still pull, never push. Nothing auto-suggests a warm-up.
    expect(src).toContain('<WorkoutBottomSheet\n          visible={showWarmupRamp}');
    expect(src).toContain('setShowWarmupRamp(true)');
  });

  test('a first-ever set is anchored to the bottom of the rep band (C5-P14-02)', () => {
    const src = read('screens/ActiveWorkoutScreen.js');
    // The swap path resets history by construction and seeds from the newly
    // swapped exercise's own rep band, unaffected by Campaign 20 - still the
    // bottom of the band, still feeding seededEntryRef.
    expect(src).toContain('reps: newRepMin || DEFAULT_SET.reps');
    expect(src).not.toContain('reps: newRepMax');
    expect(src).toContain('seededEntryRef.current = { weight: DEFAULT_SET.weight, reps: newRepMin || DEFAULT_SET.reps }');
    // Campaign 20 Phase 2 (live set prescription resolver, commit d9f8d105
    // onward): the zero-history loader branch now seeds through
    // resolveSetPrescription (src/lib/livePrescription.js), which pins the
    // SAME bottom-of-band law for a genuine zero-history exposure as an
    // authoritative rule - FIRST_TIME_BAND's repsTarget is band.min
    // (repsMin), never band.max - instead of the screen's own retired
    // getBestAnchorSet ordinal anchor (design doc section 3 #2).
    // EL-7/EL-10 (docs/exercise-library-expansion-2026-09-05/05-DECISIONS.md)
    // widened the second argument from a bare position number to
    // { index, evidenceClass } so the resolver can type-gate a circuit
    // station/ballistic exercise to history-only; livePrescription.js's own
    // normalizePosition (below) still treats a bare number as {index,
    // setType:'straight', evidenceClass:null}, so an ordinary exercise's
    // first-ever set takes exactly the same FIRST_TIME_BAND path as before.
    expect(src).toContain(
      'const seedPrescription = resolveSetPrescription(localPacket, { index: seedPos, evidenceClass: currentEvidenceClass });',
    );
    expect(src).not.toContain('const lastActual = getBestAnchorSet(prev, currentWorkingCount)');
    // livePrescription.js's own FIRST_TIME_BAND branch is the ground truth
    // for the bottom-of-band pin (checked directly, not just referenced).
    const engine = read('lib/livePrescription.js');
    expect(engine).toMatch(/repsTarget: band\.min,[\s\S]{0,80}provenance: PROVENANCE\.FIRST_TIME_BAND,/);
    // The type gate above the FIRST_TIME_BAND branch only fires when a
    // position carries a non-null evidenceClass (a circuit station or
    // ballistic exercise, EL-10); a plain exercise's currentEvidenceClass is
    // null (checked in ActiveWorkoutScreen above), so it still falls through
    // to FIRST_TIME_BAND untouched.
    expect(engine).toMatch(/pos\.evidenceClass != null/);
    expect(engine).toMatch(
      /if \(typeof position === 'number'\) return \{ index: position, setType: 'straight', evidenceClass: null \};/,
    );
  });
});

describe('WELLBEING + ACCOUNT: the two settings sentences (W-3/W-4, E-7, D96)', () => {
  test('calm mode says what it changes, and that the safety limits do not (W-3/W-4)', () => {
    const src = read('screens/SettingsCoachingScreen.js');
    expect(src).toContain('Celebrations, streaks and progress comparisons go quiet; your plan and your numbers do not change.');
    expect(src).toContain('The safety limits on calories and training load are always on, in both modes.');
    // A true statement about existing behaviour only: no threshold, gate or
    // detector mechanic reaches the user.
    const strings = (stripComments(src).match(/'[^'\n]{20,}'|\"[^\"\n]{20,}\"/g) ?? []);
    for (const literal of strings) {
      expect(literal).not.toMatch(/SCOFF|threshold|detector|flag count/i);
    }
    expect(src).toContain('await setWellbeingMode(mode)');
    // Still tier-blind. AMENDED 2026-09-03 (fully-free product, founder
    // decision): there is no Pro block left on this screen to sit outside
    // of any more (SettingsCoachingScreen.js carries no tier read at all).
    expect(src).not.toMatch(/\btier\s*===\s*'pro'/);
  });

  test('the sign-in screen says why an account is needed (E-7)', () => {
    const login = read('components/auth/AuthSheet.js');
    // The approved sentence existed only on a wizard step the live flow
    // auto-advances past, so nobody ever read it. AMENDED 2026-09-03
    // (fully-free product, founder decision): the wording changed to drop
    // the word "device" ambiguity ("phone") and read cleanly without a
    // trial thread; the why-account law itself (one line, said once, here)
    // is what this test still pins.
    // AMENDED 2026-09-04 (D145): shorter still, one line per mode.
    expect(login).toContain('Keep your training, nutrition and progress synced across devices.');
    // One line, not a privacy lecture: the Article 9 gate that follows is
    // still the place the full data story is told, so no consent copy is
    // duplicated onto this screen.
    const strings = (stripComments(login).match(/'[^'\n]{20,}'|\"[^\"\n]{20,}\"/g) ?? []);
    for (const literal of strings) {
      expect(literal).not.toMatch(/Article 9|special category/i);
    }
  });
});

describe('ANALYTICS: the existing onboarding events fire once (C5-P38-05, D96)', () => {
  test('a Back-then-forward round trip cannot re-emit a completed step', () => {
    const src = read('screens/ProOnboardingScreen.js');
    expect(src).toContain('const emittedStepsRef = useRef(new Set());');
    expect(src).toMatch(/function emitStepDone\(n\) \{\s*\n\s*if \(!user\?\.id\) return;\s*\n\s*if \(emittedStepsRef\.current\.has\(n\)\) return;\s*\n\s*emittedStepsRef\.current\.add\(n\);/);
  });

  test('no new event and no new payload field rides this fix', () => {
    const src = read('screens/ProOnboardingScreen.js');
    const events = [...src.matchAll(/track\(user\.id, '([a-z_]+)'/g)].map(m => m[1]);
    expect(new Set(events)).toEqual(new Set(['onboarding_step_completed']));
    expect(src).toContain("track(user.id, 'onboarding_step_completed', { step: n })");
    // Still an integer-only payload, per the Campaign 1 privacy law.
    expect(read('lib/telemetry/events.js')).toContain('onboarding_step_completed');
  });
});

// ─── Wave D: week / check-in / nutrition / notifications (D96) ───────────────

describe('CHECK-IN: the first check-in works from partial evidence and invents no baseline (C5-P19-01, D96)', () => {
  const { deriveTrainingPerformance, PERF_VERDICT_TEXT } = require('../lib/checkinDerive');

  test('a first week never pre-selects a downgrade verdict', () => {
    // 3 of 4 sessions, no prior week, and no PR is possible in week 1
    // (a first-ever lift is deliberately not a record). The old derivation
    // fell through to "struggled" and spoke it back as "a bit below your
    // usual"; the user has no usual.
    expect(deriveTrainingPerformance({
      completed: 3, planned: 4, prs: 0, volDeltaPct: null, hasPriorWeek: false,
    })).toBeNull();
    // A mid-week start managing one session is not "Performance dropped".
    expect(deriveTrainingPerformance({
      completed: 1, planned: 4, prs: 0, volDeltaPct: null, hasPriorWeek: false,
    })).toBeNull();
    // Not even with a PR in it: the downgrade wording is comparative either way.
    expect(deriveTrainingPerformance({
      completed: 3, planned: 4, prs: 1, volDeltaPct: null, hasPriorWeek: false,
    })).toBeNull();
  });

  test('a first week still records the two non-comparative positives', () => {
    expect(deriveTrainingPerformance({
      completed: 4, planned: 4, prs: 0, volDeltaPct: null, hasPriorWeek: false,
    })).toBe('hit');
    expect(deriveTrainingPerformance({
      completed: 4, planned: 4, prs: 1, volDeltaPct: null, hasPriorWeek: false,
    })).toBe('exceeded');
    // Neither of those speaks about a personal baseline.
    expect(PERF_VERDICT_TEXT.hit).not.toMatch(/usual/);
    expect(PERF_VERDICT_TEXT.exceeded).not.toMatch(/usual/);
  });

  test('with a real prior week every verdict still derives exactly as before', () => {
    expect(deriveTrainingPerformance({ completed: 1, planned: 4, prs: 0, volDeltaPct: 0 })).toBe('dropped');
    expect(deriveTrainingPerformance({ completed: 4, planned: 4, prs: 1, volDeltaPct: 0 })).toBe('exceeded');
    expect(deriveTrainingPerformance({ completed: 4, planned: 4, prs: 0, volDeltaPct: -0.2 })).toBe('struggled');
    expect(deriveTrainingPerformance({ completed: 4, planned: 4, prs: 0, volDeltaPct: 0 })).toBe('hit');
    expect(deriveTrainingPerformance({ completed: 3, planned: 4, prs: 0, volDeltaPct: 0 })).toBe('struggled');
  });

  test('no derived verdict means the wizard, not a silent condensed submit', () => {
    const src = read('screens/WeeklyCheckInScreen.js');
    // Eligibility is decided from what the screen arrived with, so answering
    // step 3 cannot flip the user into the condensed card mid-flow.
    expect(src).toMatch(/const fastEligible =[\s\S]{0,220}fastPrefilled/);
    expect(src).toMatch(/setFastPrefilled\(/);
  });
});

describe('CHECK-IN: an unasked question is never stored as an answer (C5-P20-01, D96)', () => {
  test('the cycle write is tri-state, and the fast path asks rather than assuming', () => {
    const src = read('screens/WeeklyCheckInScreen.js');
    // The old form: showCycle && cycle === 'yes' -> a hard false for a
    // question the fast path never renders. False is the permissive
    // direction in the engine (every calorie branch is gated on
    // !cycleOverride), so an unasked question licensed weight-based changes.
    expect(stripComments(src)).not.toMatch(/cycleOverride: showCycle && cycle === 'yes'/);
    expect(src).toMatch(/cycleOverride: !showCycle \|\| cycle == null \? null : cycle === 'yes'/);
    // renderFastCheckIn asks it when it applies.
    const fast = src.slice(src.indexOf('function renderFastCheckIn'), src.indexOf('// --- Gate screens'));
    expect(fast).toMatch(/showCycle &&/);
  });

  test('the persistence layer keeps the third state instead of coercing it', () => {
    expect(read('lib/database.js'))
      .toMatch(/\['cycleOverride', 'cycle_override', \(v\) => \(v == null \? null : \(v \? 1 : 0\)\)\]/);
    expect(read('lib/sync/tables/weeklyCheckins.js'))
      .toMatch(/cycle_override: c\.cycleOverride == null \? null : !!c\.cycleOverride/);
  });

  test('the engine reads it exactly as before, so no coaching changes', () => {
    // Unchanged line: null and false are identical to !!, which is why this
    // fix needs no engine change at all.
    expect(read('lib/weeklyCoach.js')).toContain('const cycleOverride  = !!(checkin?.cycleOverride);');
  });
});

describe('CHECK-IN: the first check-in states its outcome before the work (C5-P20-02 / PM-07, D96)', () => {
  test('the first-run intro and CTA name the baseline instead of promising a decision', () => {
    const src = read('screens/WeeklyCheckInScreen.js');
    expect(src).toMatch(/hasPriorReview === false/);
    expect(src).toContain('sets the baseline future weeks are measured against');
    expect(src).toContain("hasPriorReview === false ? 'See my first review'");
  });

  test('the baseline statement also appears BEFORE the first check-in, on the gate', () => {
    const src = read('screens/WeeklyCheckInScreen.js');
    const gate = src.slice(src.indexOf("gateState === 'too_soon'"), src.indexOf("gateState === 'need_weights'"));
    expect(gate).toMatch(/first review sets your baseline/);
  });

  test('neither line promises a hold: on most enrolment days the first review is real', () => {
    const src = read('screens/WeeklyCheckInScreen.js');
    expect(src).toMatch(/may hold your targets steady/);
    expect(stripComments(src)).not.toMatch(/your first review will hold/i);
  });
});

describe('CHECK-IN: one weigh-in cannot become a week of evidence (C5-P22-02, D96)', () => {
  test('the gate and its labels count distinct mornings, not raw rows', () => {
    const src = read('screens/WeeklyCheckInScreen.js');
    // Two devices syncing one morning arrive as two rows (the cloud pull
    // inserts by row id), so raw counting let two mornings pass a gate that
    // promises three.
    expect(src).toMatch(/const distinctMornings = new Set\(/);
    expect(src).toMatch(/distinctMornings < MIN_WEIGH_INS/);
    expect(stripComments(src)).not.toMatch(/last7Days\.length < MIN_WEIGH_INS/);
    expect(stripComments(src)).not.toMatch(/\{weekWeights\.length\} \{weekWeights\.length === 1/);
  });

  test('the trend still reads every row: only the count is deduped', () => {
    const src = read('screens/WeeklyCheckInScreen.js');
    expect(src).toContain('setWeekWeights(last7Days);');
    expect(src).toMatch(/computeEWMA\(weekWeights\)/);
  });

  // FOUNDER DECISION (fully free, no tier split): the nudge's gate is no
  // longer Pro-only -- it runs for every account with 3+ completed sessions.
  test("Home's check-in nudge mirrors the same unit", () => {
    const src = read('screens/HomeScreen.js');
    // The nudge's own gate, which mirrors the WeeklyCheckIn gate exactly.
    const nudge = src.slice(src.indexOf('if (completed.length >= 3)'));
    expect(nudge.slice(0, 2000)).toMatch(/const weighIns7d = new Set\(/);
    expect(nudge.slice(0, 2000)).toMatch(/weighIns7d >= MIN_WEIGH_INS/);
  });
});

describe('CHECK-IN: one rated session is never rendered as a trend (C5-P18-01/02/03/04, D96)', () => {
  test('a recovery gauge waits for a second rated session before it shows a verdict', () => {
    const src = read('components/ReadinessCards.js');
    expect(src).toContain('const MIN_RATED_SESSIONS = 2;');
    expect(src).toMatch(/const enoughSamples = samples >= MIN_RATED_SESSIONS;/);
    expect(src).toMatch(/const hasValue = value != null && !isNaN\(value\) && enoughSamples;/);
    // The existing no-value state is reused, with an honest caption.
    expect(src).toContain("'After a couple of sessions'");
  });

  test('the 1-3 soreness answer is not drawn on a 1-5 gauge', () => {
    const src = read('components/ReadinessCards.js');
    // Same mapping WorkoutSummaryScreen already uses; display only.
    expect(src).toMatch(/\[2, 3, 4\]\[w\.soreness24hBefore - 1\]/);
    expect(src).toContain('setRecovery(computeRecoveryEMAs(displayWorkouts));');
  });

  test('the pure EMA helper is untouched by the display fix', () => {
    const { computeRecoveryEMAs } = require('../lib/recoveryEMA');
    expect(computeRecoveryEMAs([])).toEqual({ soreness: null, fatigue: null, joint: null });
  });

  // RE-PINNED (Today truth repair): the 12-week glyph strip and its resolver
  // are DELETED with the weekly run/streak construct, so a strip can no
  // longer claim weeks the account did not exist for - there is no strip.
  test('the 12-week streak strip is gone, so it cannot claim weeks the account did not exist for', () => {
    expect(fs.existsSync(SRC('hooks/useWeeklyStreak.js'))).toBe(false);
    expect(fs.existsSync(SRC('components/StreakWeeksSection.js'))).toBe(false);
  });

  test('"Training is on track" needs two rated sessions, like its sibling voice', () => {
    const { buildCoachBrief } = require('../lib/homeCoachBrief');
    const one = buildCoachBrief({ fatigueHistory: [{ fatigueLevel: 1 }], deloadSuggestion: null, lastWorkoutDaysAgo: 1 });
    expect(one.headline).not.toBe('Looking good');
    const two = buildCoachBrief({ fatigueHistory: [{ fatigueLevel: 1 }, { fatigueLevel: 2 }], deloadSuggestion: null, lastWorkoutDaysAgo: 1 });
    expect(two.headline).toBe('Looking good');
  });
});

describe('CHECK-IN: no false-confidence recommendation from a week with no check-in (PM-01/PM-03/PM-06, D96)', () => {
  const { isCompletedCoachDecision } = require('../lib/coachDecision');

  test('a decision requires the check-in that produced it, for the same week', () => {
    const out = { weekStart: 100, hasEnoughData: true };
    expect(isCompletedCoachDecision(out, { weekStart: 100, energyScore: 3 })).toBe(true);
    // A row manufactured for a week the user never checked in for.
    expect(isCompletedCoachDecision(out, null)).toBe(false);
    // Last week's check-in does not vouch for this week's output.
    expect(isCompletedCoachDecision(out, { weekStart: 99, energyScore: 3 })).toBe(false);
    // A row with only the workout-summary sleep write is not a check-in.
    expect(isCompletedCoachDecision(out, { weekStart: 100, energyScore: null })).toBe(false);
    // The baseline weeks still never advertise a ready review.
    expect(isCompletedCoachDecision({ weekStart: 100, hasEnoughData: false }, { weekStart: 100, energyScore: 3 })).toBe(false);
  });

  test('the Coach screen neither computes nor persists a verdict for an unreviewed week', () => {
    const src = read('screens/CoachOutputScreen.js');
    expect(src).toMatch(/const weekWasCheckedIn = checkin\?\.energyScore != null;/);
    expect(src).toMatch(/if \(weekWasCheckedIn\) \{\s*\n\s*await saveCoachOutput\(user\.id, \{ weekStart, \.\.\.persistedResult \}\);/);
    // With no check-in it opens the latest completed decision instead.
    expect(src).toMatch(/setRedirectWeekStart\(latestWeek\);/);
    expect(src).toMatch(/isCompletedCoachDecision\(latestOutput, latestCheckin\)/);
  });

  test('the Monday push carries the week it was laid for', () => {
    const src = read('screens/WeeklyCheckInScreen.js');
    expect(src).toMatch(/scheduleWeeklyCoachReady\([\s\S]{0,160}weekStart: weekStart\.getTime\(\)/);
  });

  // FOUNDER DECISION (fully free, no tier split, no trial): the trial
  // banner (and this retirement predicate) is retired entirely, not merely
  // rehomed -- YouScreen carries no trial-banner state at all any more.
  // The surviving PM-03/PM-06 point (a completed decision, never the mere
  // existence of a persisted row) is still true of the status card itself.
  test('the week-one ledger point survives: retirement still keys on a completed decision, not a persisted row', () => {
    const src = read('screens/YouScreen.js');
    expect(src).not.toMatch(/trialBanner/);
    expect(src).toMatch(/const latestDecision = isCompletedCoachDecision\(latest, checkin\) \? latest : null;/);
  });

  test('the engine files are untouched by this fix', () => {
    for (const f of ['lib/weeklyCoach.js', 'lib/coachApply.js']) {
      expect(read(f)).not.toMatch(/PM-01|redirectWeekStart|weekWasCheckedIn/);
    }
  });
});

describe('NUTRITION: the first targets are described as profile and research based (C5-P21-01/02/03, D96)', () => {
  test('the target states where it came from, and claims no learned history', () => {
    const src = read('screens/NutritionTargetsScreen.js');
    expect(src).toContain('Worked out from your profile and the research, then adjusted as your own evidence arrives.');
    expect(src).not.toMatch(/based on what we have learned about you/i);
  });

  test('adherence bars stay unfilled until there is a pattern to claim', () => {
    const src = read('screens/FoodInsightsScreen.js');
    expect(src).toContain('const MIN_DAYS_FOR_ADHERENCE_BAR = 3;');
    expect(src).toMatch(/const enoughDays = total >= MIN_DAYS_FOR_ADHERENCE_BAR;/);
    expect(src).toMatch(/\{enoughDays \? \(/);
    // The per-day figures are never hidden.
    expect(src).toMatch(/\{hit\}\/\{total\}/);
  });

  test('the Diary carries NO standing primer door (founder device order 2026-08-17 reversed C5-P21-03)', () => {
    // Re-pinned: the "New to macros? Read the 5-minute guide" row under the
    // rings was removed on the founder's device verdict. The primer itself
    // and its other two doors (NutritionTargetsScreen education card,
    // ProSetupCompleteScreen) stay — pinned by their own suites.
    const src = read('screens/DiaryScreen.js');
    expect(src).not.toMatch(/navigateCrossTab\(navigation, 'ProfileTab', 'NutritionEducation'\)/);
    expect(src).not.toMatch(/New to macros/);
  });
});

describe('WEIGH-IN: day 0 never claims a weigh-in the user did not take (C5-P22-01/03/04, D96)', () => {
  const { isEnrolmentSeedWeight, ENROLMENT_WEIGHT_NOTE, hasLoggedToday } = require('../lib/checkinDerive');

  test('the enrolment seed is marked at the write and recognised at the read', () => {
    expect(ENROLMENT_WEIGHT_NOTE).toBe('enrolment');
    expect(isEnrolmentSeedWeight({ notes: 'enrolment' })).toBe(true);
    expect(isEnrolmentSeedWeight({ notes: null })).toBe(false);
    expect(isEnrolmentSeedWeight(null)).toBe(false);
    expect(read('screens/ProOnboardingScreen.js')).toMatch(/notes: ENROLMENT_WEIGHT_NOTE/);
  });

  // D153 (founder device verdict 2026-09-06): Today SHOWS the typed
  // enrolment weight as the day's morning weight; the check-in's own
  // "weighed today" claim still does not, and the first-use sentence still
  // waits for a real weigh-in. The display half of C5-P22-01 is reversed,
  // the claim half stands.
  test('a typed enrolment figure does not read as "weighed today" to the check-in, but Today shows it', () => {
    const now = Date.now();
    expect(hasLoggedToday([{ loggedAt: now, notes: 'enrolment' }])).toBe(false);
    expect(hasLoggedToday([{ loggedAt: now }])).toBe(true);
    const home = read('screens/HomeScreen.js');
    expect(home).toMatch(/setTodayWeight\(entry\?\.weightKg \?\? null\);/);
    expect(home).not.toMatch(/isEnrolmentSeedWeight\(entry\) \? null :/);
    // The first-use sentence still retires only on a REAL weigh-in.
    expect(home).toMatch(/setHasEverLoggedWeight\(recent14\.some\(\(w\) => !isEnrolmentSeedWeight\(w\)\)\)/);
  });

  test('what counts toward the check-in gate is deliberately unchanged', () => {
    // Tightening MIN_WEIGH_INS would be a worse defect than the disclosure
    // gap, so the seeded row still counts as a reading for the gate.
    const src = read('screens/WeeklyCheckInScreen.js');
    expect(stripComments(src)).not.toMatch(/isEnrolmentSeedWeight/);
  });

  test('the evening backstop teaches the morning rule rather than fighting it', () => {
    const src = read('lib/notifications/scheduler.js');
    const copies = src.slice(src.indexOf('function eveningCopies'), src.indexOf('function pickEveningCopy'));
    expect(copies).toMatch(/mornings are more consistent/i);
    expect(copies).toMatch(/mornings are steadier/i);
    // Still neutral: no accusation anywhere in the rotation.
    expect(copies).not.toMatch(/you haven't logged|you missed|behind/i);
  });

  test('the weigh-in strip says why, on the empty state only, with no count', () => {
    const src = stripComments(read('components/TodayStrip.js'));
    const empty = src.slice(src.indexOf('function WeightEmpty'), src.indexOf('if (editing)'));
    expect(empty).toMatch(/not any one morning/);
    expect(empty).not.toMatch(/streak|days in a row|of 3/i);
    const logged = src.slice(src.indexOf('function WeightLogged'), src.indexOf('function WeightEmpty'));
    expect(logged).not.toMatch(/several mornings/);
  });
});

describe('NOTIFICATIONS: a denied permission produces no fake scheduled state (C5-P27-01/02/03/04, D96)', () => {
  test('opening notification settings reads the status, it does not prompt', () => {
    const src = read('screens/NotificationSettingsScreen.js');
    const mount = src.slice(src.indexOf('async function init()'), src.indexOf('function getPrefs('));
    expect(mount).toMatch(/const status = await getNotificationPermissionStatus\(\);/);
    expect(stripComments(mount)).not.toMatch(/await requestNotificationPermissions\(\)/);
    // The user-action path still prompts.
    expect(src).toMatch(/requestNotificationPermissions\(\)\.then\(\(status\) => \{/);
  });

  test('nothing is scheduled without a granted permission', () => {
    const onboarding = read('screens/ProOnboardingScreen.js');
    expect(onboarding).toMatch(/const status = await requestNotificationPermissions\(\);\s*\n\s*if \(status === 'granted'\) \{/);
    // ... and the preference is written BEFORE the prompt, so a denial never
    // discards the chosen check-in day (OB-2).
    const block = onboarding.slice(onboarding.indexOf('async function applyReminderPreferences'));
    expect(block.indexOf('AsyncStorage.setItem(NOTIF_PREFS_KEY'))
      .toBeLessThan(block.indexOf('await requestNotificationPermissions()'));
    expect(read('lib/notifications/scheduler.js'))
      .toMatch(/const status = await getNotificationPermissionStatus\(\);\s*\n\s*if \(status !== 'granted'\) return;/);
  });

  test('the OS prompt no longer lands under the build animation', () => {
    const src = read('screens/ProOnboardingScreen.js');
    const fn = src.slice(src.indexOf('async function advanceFrom7'));
    expect(fn.indexOf('await applyReminderPreferences()'))
      .toBeLessThan(fn.indexOf('if (useSequence) startSequence();'));
  });

  test('every surface that says "turn it on in Settings" can get there', () => {
    for (const f of ['components/ProgressGhostCapture.js', 'screens/CoachingRemindersScreen.js']) {
      const src = read(f);
      expect(src).toMatch(/Linking\.openSettings\(\)/);
      expect(src).toMatch(/accessibilityLabel="Open Settings"/);
    }
  });
});

describe('NOTIFICATIONS: the displayed reminder state is the real one (C5-P28-01/02/03, FM-02/FM-03, D96)', () => {
  const { shiftHourMinuteOutOfQuietHours, DEFAULT_QUIET_HOURS } = require('../lib/notifications/quietHours');

  test('a 5 AM pick inside quiet hours is displayed as the time it will arrive', () => {
    // The rule itself is locked and unchanged: 05:00 still shifts to 07:00.
    expect(shiftHourMinuteOutOfQuietHours(5, 0, DEFAULT_QUIET_HOURS))
      .toEqual({ hour: 7, minute: 0, shifted: true });
    expect(shiftHourMinuteOutOfQuietHours(8, 0, DEFAULT_QUIET_HOURS))
      .toEqual({ hour: 8, minute: 0, shifted: false });
    for (const f of ['screens/CoachingRemindersScreen.js', 'screens/ProOnboardingScreen.js']) {
      const src = read(f);
      expect(src).toMatch(/morningShift\.shifted/);
      expect(src).toMatch(/Quiet hours currently run to/);
    }
  });

  test('the second daily weight prompt is named on the surface that owns the morning one', () => {
    for (const f of ['screens/CoachingRemindersScreen.js', 'screens/ProOnboardingScreen.js']) {
      expect(read(f)).toMatch(/7\.30 pm/);
    }
  });

  test('onboarding mirrors its choices into the rows that sync', () => {
    const src = read('screens/ProOnboardingScreen.js');
    expect(src).toMatch(/setPrefRow\(user\.id, 'morning_weight', \{ enabled: true, time_pref: morningTime \}\)/);
    expect(src).toMatch(/setPrefRow\(user\.id, 'weekly_checkin_reminder'/);
  });

  test('a training reminder that cannot fire yet says so, and is re-laid after a launch wipe', () => {
    const settings = read('screens/NotificationSettingsScreen.js');
    expect(settings).toMatch(/trainingScheduleReady === false \?/);
    expect(settings).toMatch(/couple of weeks of logged sessions/);
    const sched = read('lib/notifications/scheduler.js');
    const restore = sched.slice(sched.indexOf('export async function restoreNotifications'));
    expect(restore).toMatch(/scheduleTrainingReminders/);
  });
});

describe('TIER: a Pro feature never fails silently on a Free phone (FM-01, FM-04/FM-08, PM-04/PM-05, D96)', () => {
  // AMENDED 2026-09-03 (fully-free product, founder decision): meal
  // reminders are offered to everyone now, so the UI's isPro gate is gone
  // (NotificationSettingsScreen.js). The scheduler-side gate this used to
  // pin is retained-but-inactive infrastructure (proGate.js
  // FULL_ACCESS_FOR_ALL resolves tier to 'pro' for every signed-in user),
  // untouched here per lane boundaries.
  test('meal reminders are offered at the setting, unconditionally', () => {
    const settings = read('screens/NotificationSettingsScreen.js');
    const section = settings.slice(settings.indexOf('Meal-log reminders (opt-in'));
    expect(section).not.toMatch(/\{isPro && \(/);
    expect(settings).not.toMatch(/\bisPro\b/);
  });

  test('training reminders stay tier-blind: they are not a Pro feature', () => {
    const sched = read('lib/notifications/trainingReminders.js');
    expect(sched).not.toMatch(/tier !== 'pro'/);
  });

  test('one canonical check-in day default across every reader', () => {
    // CoachingReminders alone defaulted to Monday, so touching any control
    // silently moved a user whose blob lacks the key to a different day.
    expect(read('screens/CoachingRemindersScreen.js')).toMatch(/useState\(0\); \/\/ Sun/);
    expect(read('screens/WeeklyCheckInScreen.js')).toMatch(/let scheduledDay = 0; \/\/ default Sunday/);
  });

  test('coaching weight prompts stand down when the entitlement goes away', () => {
    const src = read('lib/payments/lapseDetect.js');
    const lapse = src.slice(src.indexOf('if (!isAuthoritativeLapse(result))'));
    expect(lapse).toMatch(/cancelMorningNotification/);
    expect(lapse).toMatch(/cancelEveningWeightReminder/);
    // Only on a confirmed lapse: a stale/unverified read must not cancel.
    expect(src).toMatch(/if \(!isAuthoritativeLapse\(result\)\) return \{ lapsed: false, opened: false \};/);
  });
});

describe('HOME: the recovery suggestion acknowledges the block it is arguing with (PM-08 / FM-07, D96)', () => {
  // RE-PINNED (Campaign 22 Phase 2 Stage 1): the "your block already has a
  // recovery week scheduled at week N" addendum (scheduledRecoveryAhead /
  // scheduledRecoveryWeekIndex) was display-only extra colour on the old
  // two-line banner. The new Today line idiom is ONE sentence (spec §17
  // R2), and the addendum did not survive the compression -- the
  // underlying PM-08/FM-07 suggestion, its suppression inside a scheduled
  // recovery week, and its CoachReview tap-through (where the block's own
  // recovery position is still shown) are all unchanged.
  test('the suggestion still defers to the block via its unchanged eligibility gate', () => {
    const src = read('screens/HomeScreen.js');
    expect(src).not.toMatch(/const scheduledRecoveryAhead =/);
    // FB-02's suppression inside a scheduled recovery week is untouched.
    expect(src).toMatch(/const inScheduledRecovery = !!currentMesoWeek\?\.isDeload \|\| !!currentMesoWeek\?\.awaitingDecision;/);
    expect(src).toMatch(/const deloadBannerEligible = !!deloadSuggestion && !deloadDismissed && !inScheduledRecovery;/);
    expect(src).toMatch(/onDeloadPress: \(\) => \{ haptics\.selection\(\); navigation\.navigate\('CoachReview'\); \},/);
  });

  test('the deload maths itself is untouched', () => {
    expect(read('lib/algorithms.js')).not.toMatch(/scheduledRecoveryAhead|PM-08/);
  });
});

describe('REVIEW A: the brand-new-user findings stay fixed (RA-1..RA-10, D96)', () => {
  test('RA-2: an INSUFFICIENT_DATA hold is never narrated as "a dose that worked"', () => {
    const ranges = {
      chest: { startSets: 10, peakSets: 14 },
      back: { startSets: 12, peakSets: 16 },
    };
    const mk = (classification) => ({
      entries: [
        { muscle: 'chest', classification, observed: { startSets: 10, plannedPeak: 14 }, rationale: 'r' },
        { muscle: 'back', classification, observed: { startSets: 12, plannedPeak: 16 }, rationale: 'r' },
      ],
    });
    const unjudged = buildSeedReceipt({ ranges, ledger: mk('INSUFFICIENT_DATA') });
    expect(unjudged.held).toBe(2);
    expect(unjudged.heldUnjudged).toBe(2);
    // Re-anchored under D97-24 M-8 (cause-agnostic honest wording, same meaning).
    expect(unjudged.heldLine).toMatch(/wasn't enough clear evidence this block/);
    expect(unjudged.heldLine).not.toMatch(/dose that worked/);
    // A judged hold keeps the FB-27 sentence.
    const judged = buildSeedReceipt({ ranges, ledger: mk('RESPONSIVE') });
    expect(judged.heldUnjudged).toBe(0);
    expect(judged.heldLine).toMatch(/Keeping a dose that worked is a decision too/);
    // Mixed states both, judged first.
    const mixed = buildSeedReceipt({
      ranges,
      ledger: {
        entries: [
          { muscle: 'chest', classification: 'RESPONSIVE', observed: { startSets: 10, plannedPeak: 14 }, rationale: 'r' },
          { muscle: 'back', classification: 'INSUFFICIENT_DATA', observed: { startSets: 12, plannedPeak: 16 }, rationale: 'r' },
        ],
      },
    });
    // Re-anchored under D97-24 M-8 (cause-agnostic honest wording, same meaning).
    expect(mixed.heldLine).toMatch(/dose that worked[\s\S]*wasn't enough clear evidence this block/);
  });

  test('RA-2: the receipt sheet and decision card stop claiming change or difference that does not exist', () => {
    const plans = read('screens/PlansScreen.js');
    // Subtitle is conditional on rows actually having changed.
    expect(plans).toMatch(/No targets moved this time/);
    // A fully unjudged ledger stops the framing line describing the two
    // options as producing different targets.
    expect(plans).toMatch(/allUnjudged:\s*allRows\.length > 0/);
    expect(plans).toMatch(/both options start the next block from the same targets/);
  });

  // RA-1 and RA-9 removed (D137, fully free product): both pinned
  // FreeStarterScreen.js's quiz-and-recommendation UI (a `days` mismatch
  // acknowledgement against a picked-from-a-pool library plan, and a
  // glossary tooltip on that recommendation card), and the file is deleted
  // outright. The successor "Start with a plan" flow (HomeScreen.js /
  // PlansScreen.js) GENERATES a plan from the athlete's actual onboarding
  // answers via generateAndSavePlan rather than recommending a pre-built
  // library plan that might not match them, so a "days the library cannot
  // honour" mismatch cannot occur in the new mechanism, and there is no
  // recommendation-preview card left for a glossary tooltip to sit on.
  // Both behaviours no longer exist.

  test('RA-3: the wizard neither paints the finished sign-in step nor counts it', () => {
    const src = read('screens/ProOnboardingScreen.js');
    expect(src).toMatch(/useState\(\(\) => \(user && !user\.isLocal \? 2 : 1\)\)/);
    expect(src).toMatch(/displayStepOf/);
    expect(src).not.toMatch(/Step \{step\} of \{TOTAL_STEPS\}/);
  });

  test('RA-4: the first name gates nothing and never overwrites a stored name with a blank', () => {
    const src = read('screens/ProOnboardingScreen.js');
    expect(stripComments(src)).not.toMatch(/canContinue\s*=\s*!!firstName/);
    expect(src).toMatch(/First name \(optional\)/);
    expect(src).toMatch(/if \(firstName\.trim\(\)\) merged\.firstName = firstName\.trim\(\);/);
    // The sex gate is untouched (founder 2026-07-01); D146 moved it into
    // validateStep2 in its negative form.
    expect(src).toMatch(/if \(sex !== 'male' && sex !== 'female'\) errs\.sex = /);
  });

  test('RA-5: the first session needs stand above Start training; the rest follow it', () => {
    const src = read('screens/ProSetupCompleteScreen.js');
    const a = src.indexOf('>2. Train your split<');
    const b = src.indexOf('title="Start training"');
    const c = src.indexOf('>3. Hit your daily targets<');
    const d = src.indexOf('>4. Check in once a week<');
    expect(a).toBeGreaterThan(-1);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
    expect(d).toBeGreaterThan(c);
  });

  // RA-10 (trial confirmation chip) removed: Volyume is fully free (founder
  // ruling), no trial exists any more, and the chip + trialEndsLabel import
  // are gone from ProSetupCompleteScreen.js.

  test('RA-6: the block decision glosses the term the whole choice rests on', () => {
    const src = read('screens/PlansScreen.js');
    const i = src.indexOf('Both options are open.');
    expect(i).toBeGreaterThan(-1);
    expect(src.slice(i, i + 300)).toMatch(/InfoTooltip text=\{GLOSSARY\.volume\}/);
  });

  // RA-8 (trial thread on the pro_signup sign-in screen) removed: Volyume
  // is fully free (founder ruling), so LoginScreen.js carries no trial
  // copy any more. The pro_signup param still opens create-account mode
  // (LoginScreen.test.js E-1 pins that behaviour).
});

describe('REVIEW B: the interruption and state findings stay fixed (RB-1..RB-12, D96)', () => {
  test('RB-1: the build record outlives the wizard and dies with first run', () => {
    const draft = read('lib/proOnboardingDraft.js');
    // clearDraft removes ONLY the draft; the build record has its own clear.
    const clearFn = draft.slice(draft.indexOf('export async function clearDraft'), draft.indexOf('export async function clearBuildProgress'));
    expect(clearFn).not.toMatch(/buildKey\(userId\)/);
    expect(draft).toMatch(/export async function clearBuildProgress/);
    const store = read('store/useAppStore.js');
    // Both ends of first run own the record's removal.
    const complete = store.slice(store.indexOf('completeFirstRun: async'));
    expect(complete.slice(0, 1200)).toMatch(/clearBuildProgress\(uid\)/);
    const reset = store.slice(store.indexOf('resetFirstRun: async'));
    expect(reset.slice(0, 1600)).toMatch(/clearBuildProgress\(uid\)/);
    // And the hand-off screen no longer exits the app on hardware Back.
    expect(read('screens/ProSetupCompleteScreen.js')).toMatch(/BackHandler\.addEventListener\('hardwareBackPress', \(\) => true\)/);
  });

  test('RB-2: the weekly coach-ready push survives a notification restore', () => {
    const sched = read('lib/notifications/scheduler.js');
    const restore = sched.slice(sched.indexOf('export async function restoreNotifications'));
    expect(restore).toMatch(/scheduleWeeklyCoachReady\(crHour, crMinute, \{ weekStart: ws \}\)/);
    // Re-laid only when a check-in stamped it and its Monday is still ahead.
    expect(restore).toMatch(/Number\.isFinite\(ws\)/);
    expect(read('screens/WeeklyCheckInScreen.js')).toMatch(/coachReady: \{ \.\.\.\(prefs\?\.coachReady \|\| \{\}\), weekStart: weekStart\.getTime\(\) \}/);
  });

  test('RB-3: every plan-activation path holds a synchronous entry guard', () => {
    const plans = read('screens/PlansScreen.js');
    // The block-restart guard sits BEFORE the alert, not inside its onPress.
    const restart = plans.slice(plans.indexOf('async function handleRestartPlan'));
    const alertAt = restart.indexOf('appAlert(');
    expect(restart.slice(0, alertAt)).toMatch(/if \(restartingRef\.current\) return;/);
    const setActive = plans.slice(plans.indexOf('async function handleSetActive'));
    const setActiveTry = setActive.indexOf('try {');
    expect(setActive.slice(0, setActiveTry)).toMatch(/if \(restartingRef\.current\) return;/);
    expect(read('screens/ManualBuilderScreen.js')).toMatch(/if \(activatingRef\.current\) return;/);
    expect(read('screens/PlanLibraryScreen.js')).toMatch(/if \(addingRef\.current\) return;/);
    // And the data layer closes the two-active-blocks interleave for all.
    const db = read('lib/database.js');
    const act = db.slice(db.indexOf('export async function activatePlanWithBlock'));
    // Window widened for the C8 Work 2 activation seed and its review-D5
    // gate, and again for D139's plan_replaced prior-active-block read
    // (both sit above the transaction). The pin is unchanged: the two
    // writes stay in ONE transaction.
    expect(act.slice(0, 5000)).toMatch(/runInTransaction\(d, async \(\) => \{/);
  });

  test('RB-4: only the newest PlansScreen load may paint any of its state', () => {
    const plans = read('screens/PlansScreen.js');
    const load = plans.slice(plans.indexOf('async function loadData'));
    const firstGuard = load.indexOf('if (req !== ledgerLoadRef.current) return;');
    const firstSetter = load.indexOf('setActivePlanData(');
    expect(firstGuard).toBeGreaterThan(-1);
    expect(firstGuard).toBeLessThan(firstSetter);
  });

  test('RB-5: the library activation path cannot fail silently', () => {
    const lib = read('screens/PlanLibraryScreen.js');
    const start = lib.slice(lib.indexOf("text: 'Add and start this plan'"));
    const tryAt = start.indexOf('try {');
    const activateAt = start.indexOf('await activatePlanWithBlock(');
    const catchAt = start.indexOf('} catch');
    expect(tryAt).toBeGreaterThan(-1);
    expect(tryAt).toBeLessThan(activateAt);
    expect(activateAt).toBeLessThan(catchAt);
  });

  test('RB-10/RB-11/RB-12: the synchronous-guard and dismiss seams', () => {
    const coach = read('screens/CoachOutputScreen.js');
    expect(coach).toMatch(/if \(applyingRef\.current \|\| applyingKey \|\| !user\?\.id \|\| !output\) return;/);
    expect(read('components/AppAlert.js')).toMatch(/options\.onDismiss\?\.\(\)/);
    const wiz = read('screens/ProOnboardingScreen.js');
    const from6 = wiz.slice(wiz.indexOf('async function advanceFrom7'));
    const armAt = from6.indexOf('submittingRef.current = true;');
    expect(from6.slice(armAt, armAt + 700)).toMatch(/setBusy\(true\);/);
    expect(from6.slice(armAt, armAt + 1200)).toMatch(/clearTimeout\(draftTimerRef\.current\)/);
  });
});

describe('REVIEW C: the experienced-user findings stay fixed (RC-1..RC-9, D96)', () => {
  // FOUNDER DECISION (fully free, no tier split): every account opens the
  // editor on its own plan, and Duplicate (the Free-only action) is retired
  // entirely -- every account now runs one always-active plan, the same
  // rationale that used to keep it Free-only.
  test('RC-1: every account can open the editor on its own plan; Duplicate is retired', () => {
    const src = read('screens/PlanDetailScreen.js');
    expect(stripComments(src)).not.toMatch(/!isLibrary && tier !== 'pro' &&/);
    const manage = src.slice(src.indexOf('<SectionLabel>Manage</SectionLabel>'));
    const editAt = manage.indexOf('Edit plan');
    expect(editAt).toBeGreaterThan(-1);
    expect(manage).not.toContain('Duplicate plan');
    expect(manage).not.toContain('handleDuplicate');
  });

  test('RC-2: the coach register reads the experience key the profile actually has', () => {
    const src = read('screens/CoachOutputScreen.js');
    const matches = src.match(/experienceLevel: userProfile\?\.experienceLevel \?\? userProfile\?\.experience \?\? null,/g) || [];
    expect(matches.length).toBe(2);
  });

  test('RC-3: the superset walkthrough is once ever, on the sibling persisted-key pattern', () => {
    const src = read('screens/ActiveWorkoutScreen.js');
    expect(src).toMatch(/SUPERSET_WALKTHROUGH_SEEN_KEY = '@volyume_seen_superset_walkthrough'/);
    expect(src).toMatch(/if \(supersetWalkthroughSeenRef\.current\) return;/);
    expect(src).toMatch(/AsyncStorage\.setItem\(SUPERSET_WALKTHROUGH_SEEN_KEY, 'true'\)/);
  });

  test('RC-4: both readiness opt-out surfaces name the block-ledger consequence', () => {
    expect(read('screens/HomeScreen.js')).toMatch(/next block's set targets stay where they are rather than moving on what this block showed/);
    expect(read('screens/SettingsCoachingScreen.js')).toMatch(/set targets stay where they are rather than moving on what the block showed/);
  });

  test('RC-5: "Show the science" describes exactly what it does', () => {
    const src = read('screens/SettingsCoachingScreen.js');
    expect(src).toMatch(/where the coach reports your weight trend/);
    expect(src).not.toContain('Technical terms appear in brackets after the plain ones on coaching explanations.');
  });

  // RC-6 and RC-8 removed (D137, fully free product): both pinned copy on
  // FreeStarterScreen.js's recommendation result card and FirstRunScreen.js's
  // skip line, and both files are deleted outright. Neither the "free
  // result" recommendation card nor a first-run skip-to-library affordance
  // survives in the merged "Start with a plan" flow (HomeScreen.js /
  // PlansScreen.js already offer "Browse plans" as a real, always-visible
  // secondary action rather than a skip link, per
  // noPlanJourneyCopy.guard.test.js) -- the specific copy these pinned no
  // longer exists.

  test('RC-9: opening exercise details retires the novice Help pulse too', () => {
    // Re-anchored 2026-08-17: the name-tap's label is "Exercise details"
    // now (founder order: the tap gained a visible chevron affordance);
    // the RC-9 behaviour pinned here is unchanged.
    const src = read('screens/ActiveWorkoutScreen.js');
    const tap = src.slice(src.indexOf('accessibilityLabel="Exercise details"') - 1200, src.indexOf('accessibilityLabel="Exercise details"'));
    expect(tap).toMatch(/@volyume_seen_workout_info/);
    expect(tap).toMatch(/setShowExecution\(true\)/);
  });
});
