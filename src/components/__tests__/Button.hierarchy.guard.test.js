/**
 * D148 (founder, 2026-09-04): colour is hierarchy. The shared Button carries
 * five semantic treatments and the solid amber fill is reserved for the
 * `emphatic` variant, used for the one committing action in a region. The
 * default is the standard primary: a raised, bordered charcoal surface with
 * a white label and amber icons, so routine actions read as primary through
 * position, size, contrast and the glyph rather than fill. This pins the
 * variant table, the icon tint, the haptic gate and the curated emphatic
 * set, so a future "make it orange" cannot arrive silently.
 */
const fs = require('fs');
const path = require('path');

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');
const BUTTON = read('components/Button.js');

describe('the button variant table', () => {
  test('emphatic is the only amber fill; primary is a raised bordered surface with amber icons', () => {
    expect(BUTTON).toMatch(/emphatic: \{ bg: c\.primaryFill, fg: c\.onPrimary, border: 'transparent', iconFg: c\.onPrimary \}/);
    expect(BUTTON).toMatch(/primary: \{ bg: c\.surface2, fg: c\.textPrimary, border: c\.border, iconFg: c\.primary \}/);
    expect(BUTTON).toMatch(/secondary: \{ bg: c\.surface, fg: c\.textSecondary, border: c\.border, iconFg: c\.textSecondary \}/);
    expect(BUTTON).toMatch(/outline: \{ bg: c\.surface, fg: c\.textSecondary, border: c\.border, iconFg: c\.textSecondary \}/);
    expect((BUTTON.match(/bg: c\.primaryFill/g) || []).length).toBe(1);
  });
  test('the default variant is the standard primary, and icons take the variant ink', () => {
    expect(BUTTON).toMatch(/variant = 'primary',/);
    expect(BUTTON).toMatch(/const iconFg = v\.iconFg \?\? v\.fg;/);
    expect(BUTTON).toMatch(/<Ionicons name=\{icon\} size=\{s\.icon\} color=\{iconFg\} \/>/);
  });
  test('the haptic tick fires for primary and emphatic only', () => {
    expect(BUTTON).toMatch(/onPress && \(v === VARIANTS\.primary \|\| v === VARIANTS\.emphatic\)/);
  });
});

describe('the emphatic set is curated: committing actions only', () => {
  const emphatic = [];
  const walk = (dir) => {
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f);
      if (fs.statSync(p).isDirectory()) { if (f !== '__tests__') walk(p); continue; }
      if (!f.endsWith('.js')) continue;
      const src = fs.readFileSync(p, 'utf8');
      const n = (src.match(/variant="emphatic"/g) || []).length;
      if (n) emphatic.push([path.relative(path.join(__dirname, '..', '..'), p), n]);
    }
  };
  walk(path.join(__dirname, '..', '..', 'screens'));
  walk(path.join(__dirname, '..', '..', 'components'));

  test('every emphatic usage is on the reviewed list', () => {
    const allowed = new Set([
      'screens/WelcomeScreen.js', 'components/auth/AuthSheet.js', 'screens/ProOnboardingScreen.js',
      'screens/ProSetupCompleteScreen.js', 'screens/PlanPreviewScreen.js', 'screens/PartnerScreen.js',
      'screens/HowYouTrainAddScreen.js', 'screens/ManualBuilderScreen.js', 'screens/PlansScreen.js',
      'screens/ImportScreen.js', 'screens/GoalLockConsentScreen.js', 'screens/PlanDetailScreen.js',
      'components/PlanPreviewSheet.js', 'screens/BuildWorkoutScreen.js',
      // Community (social-discovery blueprint sections 6 and 13, 2026-09-06).
      // Each of these five is a committing step and the only emphatic action
      // on its screen: create the profile, publish the programme, post the
      // story, write the adapted plan. The programme screen deliberately has
      // none (ruling 2: "Adapt for me" leads as the primary instead).
      'screens/CommunityJoinScreen.js', 'screens/CommunityHubScreen.js',
      'screens/CommunityPublishProgrammeScreen.js', 'screens/CommunityComposeScreen.js',
      'screens/CommunityAdaptScreen.js',
    ]);
    for (const [file] of emphatic) expect(allowed.has(file)).toBe(true);
    expect(emphatic.length).toBeGreaterThan(10);
  });

  test('the routine daily actions are NOT emphatic', () => {
    expect(read('screens/HomeScreen.js')).not.toMatch(/variant="emphatic"[\s\S]{0,200}Start workout/);
    expect(read('screens/PlansScreen.js')).not.toMatch(/variant="emphatic"[\s\S]{0,120}title="Start next workout"/);
    expect(read('components/food/EmptyDiary.js')).not.toMatch(/variant="emphatic"/);
    expect(read('components/workout/WorkoutBottomBar.js')).not.toMatch(/variant="emphatic"/);
  });
});

describe('the hand-rolled fills on the reviewed screens follow the same rule', () => {
  test('the Nutrition scanner is a raised disc with an amber glyph', () => {
    const diary = read('screens/DiaryScreen.js');
    expect(diary).toMatch(/scanFab: \{[\s\S]{0,300}backgroundColor: colors\.surface2, borderWidth: 1, borderColor: colors\.border,/);
    expect(diary).toMatch(/<Ionicons name="barcode-outline" size=\{26\} color=\{t\.colors\.primary\} \/>/);
  });
  test('the workout logger primaries are raised surfaces with white labels', () => {
    const aw = read('screens/ActiveWorkoutScreen.js');
    for (const k of ['completeBtn', 'supPrimaryBtn', 'staleResume', 'keepTrainingBtn']) {
      expect(aw).toMatch(new RegExp(`  ${k}: \\{[^\\n]*backgroundColor: colors\\.surface2, borderWidth: 1, borderColor: colors\\.border`));
    }
    expect(aw).not.toMatch(/completeBtnText: \{[^}]*onPrimary/);
  });
  test('the in-app splash is gone: the boot hold is a bare background', () => {
    expect(read('navigation/RootNavigator.js')).toMatch(/function SplashScreen\(\) \{\s*return <View style=\{splashStyles\.container\} \/>;\s*\}/);
  });
});
