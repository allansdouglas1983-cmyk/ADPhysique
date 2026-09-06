/**
 * campaign3.discoverability.test.js — Campaign 3 (discoverability,
 * settings, existing-feature UX; D94) pins.
 *
 * Pins the campaign's landed truths per the founder's Phase 23 list:
 * canonical editors stay reachable, contextual shortcuts navigate to
 * the one owner rather than forking state, gesture-only actions keep
 * their visible routes, tier routing stays honest, and the boundary
 * laws hold. Source-level guards by repo convention; each asserts a
 * MEANING (route, owner, gate), not layout trivia.
 */
import fs from 'fs';
import path from 'path';

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

describe('SETTINGS ownership', () => {
  test('both diet surfaces render from the one shared DIETS list', () => {
    expect(read('screens/SettingsProfileScreen.js')).toMatch(/DIETS/);
    expect(read('components/food/DietaryPreferencesEditor.js')).toMatch(/DIETS/);
  });

  test('goal-setup seeds protein from the saved targets row, so it cannot revert an untouched choice', () => {
    const src = read('screens/ProGoalSetupScreen.js');
    expect(src).toMatch(/getNutritionTargets/);
    expect(src).toMatch(/proteinApproach \?\? t\?\.protein_approach/);
  });

  // AMENDED 2026-09-03 (fully-free product, founder decision): the weekly
  // check-in this row feeds is now available to everyone, so the tier half
  // of the gate is gone; only the sex gate (Article 9 surface) remains.
  test('cycle tracking is gated on sex only, its tier gate retired with the free product', () => {
    const src = stripComments(read('screens/SettingsCoachingScreen.js'));
    expect(src).toMatch(/\{bioSex === 'female' && \(/);
    expect(src).not.toMatch(/tier === 'pro'/);
  });

  // The "partner cheers has a reachable toggle" pin retired with the
  // Partners feature (SD-03, 2026-09-06): the section and its handler were
  // removed from CoachingRemindersScreen, and nothing on device schedules a
  // partner beat any more. The stored `partnerCheerEnabled` pref stays in
  // categoryPrefs.js so an old server-sent push still respects it.

  test('onboarding writes a check-in hour the picker can display', () => {
    const src = stripComments(read('screens/ProOnboardingScreen.js'));
    expect(src).not.toMatch(/checkinHour:\s*12\b/);
    expect(src).toMatch(/checkinHour:\s*18\b/);
  });
});

describe('CONTEXTUAL shortcuts navigate to the canonical owner', () => {
  // ONE DAILY TRUTH (Campaign 17A, founder law): the per-weekday calorie
  // offset is retired and its screen deleted, so the Diary disclosure row that
  // linked to it is gone too. The founder's instruction was explicit: "remove/
  // hide live controls that promise behaviour we no longer support" and "do
  // not leave a hidden setting that still modifies targets". Pinned as an
  // absence so no shortcut can point at a route that no longer exists.
  test('the Diary carries no per-day offset row and no PerDayTargets route', () => {
    const src = read('screens/DiaryScreen.js');
    expect(src).not.toMatch(/appliedOffsetKcal/);
    expect(src).not.toMatch(/PerDayTargets/);
    expect(read('navigation/RootNavigator.js')).not.toMatch(/PerDayTargets/);
    expect(read('screens/SettingsScreen.js')).not.toMatch(/PerDayTargets/);
  });

  test('the Coach tab routes to the volume-target editor', () => {
    expect(read('screens/YouScreen.js')).toMatch(/navigateCrossTab\(navigation, 'ProgressTab', 'VolumeHeatmap'\)/);
  });

  test('Body metrics links its displayed unit to the Workout and units editor', () => {
    expect(read('screens/BodyMetricsScreen.js')).toMatch(/navigateCrossTab\(navigation, 'ProfileTab', 'SettingsWorkout'\)/);
  });
});

describe('GESTURES: no important action is gesture-only', () => {
  test('plan-day exercise removal has a visible control sharing the long-press handler', () => {
    const src = read('screens/ManualBuilderScreen.js');
    const visible = src.match(/onPress=\{\(\) => handleLongPressExercise\(/g) ?? [];
    expect(visible.length).toBeGreaterThanOrEqual(1);
  });

  test('diary multi-select has a visible route from the tap-opened sheet', () => {
    expect(read('components/food/FoodDetailSheet.js')).toMatch(/onSelectEntries/);
    expect(read('screens/DiaryScreen.js')).toMatch(/onSelectEntries=\{/);
  });

  test('the saved-meals empty state names its gesture', () => {
    expect(read('screens/MyMealsScreen.js')).toMatch(/choose Select entries, or press and hold/);
  });
});

describe('TIER routing honesty', () => {
  test('every account building a new plan reaches PlanUpdate directly (D137, fully free)', () => {
    // RE-ANCHORED (D137, fully free product): the tier fork this test
    // pinned (recommendation 'consider_rebuild' -> ProUpgrade, else ->
    // PlanLibrary) is retired outright, not inverted -- PlansScreen.js's own
    // comment at the call site says so: "the Free route to
    // PlanLibrary/ProUpgrade (D94, Campaign 3, F1) is retired." Every
    // account now opens PlanUpdate directly, with no ProUpgrade branch left
    // anywhere in the file (see proUpgradeTelemetry.guard.test.js).
    const src = stripComments(read('screens/PlansScreen.js'));
    // D139 item 9 wrapped the call in a handler that fires block_decision
    // funnel telemetry first, so the onPress body is a block, not a bare
    // arrow expression - the pin now matches the handler shape, not just
    // the one-line call.
    expect(src).toMatch(/onPress=\{\(\) => \{[\s\S]{0,300}navigation\.navigate\('PlanUpdate'\);/);
    expect(src).not.toMatch(/recommendation === 'consider_rebuild'/);
    expect(src).not.toContain("navigate('ProUpgrade'");
  });
});

describe('NOTIFICATIONS promise-keeping', () => {
  test('win-back pushes state saved-data truth and never sell Pro', () => {
    const src = stripComments(read('lib/notifications/winbackContent.js'));
    expect(src).not.toMatch(/Pro picks up/);
    expect(src).toMatch(/ready whenever you are/);
  });
});

describe('BOUNDARIES', () => {
  // Title corrected 2026-08-10 (Campaign 4 review): it used to end "the
  // pre-existing toggle is recorded for Campaign 4", which now reads as if a
  // cardio-logging toggle still exists somewhere. It does not - Campaign 4
  // removed cardio logging entirely (D92-1/D95). The absence pins below are
  // unchanged; the permanent boundary lives in campaign4.boundaries.test.js.
  test('no cardio entry point or setting was added by this campaign (and Campaign 4 later removed cardio logging outright)', () => {
    for (const p of ['screens/YouScreen.js', 'screens/DiaryScreen.js', 'screens/BodyMetricsScreen.js', 'screens/PlansScreen.js']) {
      expect(stripComments(read(p))).not.toMatch(/[Cc]ardio logging/);
    }
  });

  test('the calculator weight fields disclose kilogram entry without converting (FR-1 territory untouched)', () => {
    const src = read('screens/NutritionTargetsScreen.js');
    expect(src).toMatch(/Entered in kilograms, whatever unit you display elsewhere\./);
  });
});
