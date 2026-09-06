/**
 * Source guard: the formerly-Pro screen block is now fully free (D137).
 *
 * WHY THIS EXISTS: founder decision D137 made Volyume fully free -- binary
 * free/pro gating (CLAUDE.md pre-D137 rule) no longer applies. Every screen
 * that used to ship wrapped in `withProGuard` / `withReadOnlyProGuard`
 * (food diary, barcode, meal suggestions, targets, macros, check-ins,
 * Precision Coaching, division plans, progress-photos/
 * body-metrics history) is now a plain, ungated registration like any other
 * screen in RootNavigator.js -- see that file's own "Formerly Pro-only
 * screens" comment. `ProGate.js` (the guard HOCs) stays on disk DORMANT and
 * unimported, in case a future deliberate monetisation decision brings
 * tiered access back.
 *
 * This guard pins the NEW invariant: no route in that block is guarded, and
 * no live registration wires a `Gated*` / guard-wrapped component. If a
 * future change re-introduces a guard wrapper on any of these routes without
 * an explicit founder decision, this test fails.
 *
 * Pure fs.readFileSync + regex against the real source; no rendering, no
 * React Navigation instantiation.
 */
import fs from 'fs';
import path from 'path';

const NAV = fs.readFileSync(
  path.join(__dirname, '..', 'navigation', 'RootNavigator.js'),
  'utf8'
);

// Isolate the fenced "Formerly Pro-only screens" block: from its header
// comment to the `heroZoomTransition` declaration that immediately follows
// it (same anchor the pre-D137 guard used).
const blockStart = NAV.indexOf('// Formerly Pro-only screens.');
const blockEnd = NAV.indexOf('\nconst heroZoomTransition', blockStart);
if (blockStart === -1 || blockEnd === -1) {
  throw new Error(
    'proScreenGating.guard.test.js: could not locate the fenced "Formerly ' +
    'Pro-only screens" block in RootNavigator.js (expected between the ' +
    '"// Formerly Pro-only screens." comment and the `heroZoomTransition` ' +
    'declaration). Has it been renamed or restructured? Update this guard ' +
    'to match before trusting it.'
  );
}
const FORMER_PRO_BLOCK = NAV.slice(blockStart, blockEnd);

// Every `const <Name>Screen = ...` declaration line inside the block.
const screenDeclLines = FORMER_PRO_BLOCK
  .split('\n')
  .filter((line) => /^const \w+Screen\s*=/.test(line.trim()));

describe('Formerly Pro-only screens block (RootNavigator.js): fully-free sweep', () => {
  test('the fenced block actually declares the formerly-Pro screens (this guard has something to check)', () => {
    expect(screenDeclLines.length).toBeGreaterThan(0);
  });

  test('no declaration in the block wraps its screen in withProGuard or withReadOnlyProGuard', () => {
    const guarded = screenDeclLines.filter(
      (line) => /with(ReadOnly)?ProGuard\(/.test(line)
    );
    expect(guarded).toEqual([]);
  });

  test('no Gated<Name> constant survives anywhere in the block', () => {
    expect(FORMER_PRO_BLOCK).not.toMatch(/const Gated\w+\s*=/);
  });

  test('every declaration names a real screen file under src/screens/', () => {
    const screenRefs = [...FORMER_PRO_BLOCK.matchAll(/require\('\.\.\/screens\/(\w+)'\)/g)].map(
      (m) => m[1]
    );
    expect(screenRefs.length).toBe(screenDeclLines.length);
    for (const name of screenRefs) {
      const exists = fs.existsSync(path.join(__dirname, '..', 'screens', `${name}.js`));
      expect(exists).toBe(true);
    }
  });
});

// The routes that were Pro-gated pre-D137 (lifted from the old guard's
// CRITICAL_PRO_SCREENS list), now expected to be plain ungated
// registrations pointing straight at the unguarded screen component.
const FORMERLY_CRITICAL_ROUTES = [
  { component: 'DiaryScreen', routes: ['Diary'] },
  { component: 'MealPlanScreen', routes: ['MealPlan'] },
  { component: 'FoodSearchScreen', routes: ['FoodSearch'] },
  { component: 'AddCustomFoodScreen', routes: ['AddCustomFood'] },
  { component: 'ScanBarcodeScreen', routes: ['ScanBarcode'] },
  { component: 'ScanLabelScreen', routes: ['ScanLabel'] },
  { component: 'FoodInsightsScreen', routes: ['FoodInsights'] },
  { component: 'MyRecipesScreen', routes: ['MyRecipes'] },
  { component: 'MyMealsScreen', routes: ['MyMeals'] },
  { component: 'RecipeBuilderScreen', routes: ['RecipeBuilder'] },
  { component: 'NutritionTargetsScreen', routes: ['NutritionTargets'] },
  { component: 'MealNamesScreen', routes: ['MealNames'] },
  // BodyMetrics and ProgressPhotos are each registered in more than one tab
  // stack (Home and Progress); the regex below matches every occurrence of
  // the route name across the whole file, so one list entry still checks
  // ALL of a route's registrations.
  { component: 'WeeklyCheckInScreen', routes: ['WeeklyCheckIn'] },
  { component: 'CoachOutputScreen', routes: ['CoachOutput'] },
  { component: 'ProGoalSetupScreen', routes: ['ProGoalSetup'] },
  { component: 'PlanUpdateScreen', routes: ['PlanUpdate'] },
  { component: 'CoachingRemindersScreen', routes: ['CoachingReminders'] },
  { component: 'BodyMetricsScreen', routes: ['BodyMetrics'] },
  { component: 'ProgressPhotosScreen', routes: ['ProgressPhotos'] },
];

describe('Formerly-critical Pro routes: no guard, registered via the plain screen component', () => {
  test.each(FORMERLY_CRITICAL_ROUTES)(
    '$component is declared in the fenced block with NO guard HOC',
    ({ component }) => {
      const declRegex = new RegExp(`const ${component}\\s*=\\s*lazyScreen\\(\\(\\) =>`);
      expect(FORMER_PRO_BLOCK).toMatch(declRegex);
      const guardedDeclRegex = new RegExp(
        `const ${component}\\s*=\\s*lazyScreen\\(\\(\\) => with(ReadOnly)?ProGuard\\(`
      );
      expect(FORMER_PRO_BLOCK).not.toMatch(guardedDeclRegex);
    }
  );

  test.each(FORMERLY_CRITICAL_ROUTES)(
    'every Stack.Screen registration for $component\'s route(s) wires the plain component, never a Gated wrapper',
    ({ component, routes }) => {
      for (const route of routes) {
        // name="Route" and component={X} sit on the same JSX tag, at most a
        // few short attributes apart (possibly across lines) -- bound the
        // gap so this cannot accidentally read into a neighbouring tag.
        const screenTagRegex = new RegExp(
          `<Stack\\.Screen\\s+name="${route}"[\\s\\S]{0,120}?component=\\{(\\w+)\\}`,
          'g'
        );
        const matches = [...NAV.matchAll(screenTagRegex)];
        // At least one registration must exist for every route this list
        // claims is registered; a route that has quietly been removed from
        // the navigator entirely is also a drift this guard should surface.
        expect(matches.length).toBeGreaterThan(0);
        for (const m of matches) {
          expect(m[1]).toBe(component);
          expect(m[1]).not.toMatch(/^Gated/);
        }
      }
    }
  );
});
