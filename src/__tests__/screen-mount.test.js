/**
 * Screen mount harness, for every Pro screen the user can reach from
 * the Hub, this test mounts the component via react-test-renderer with
 * realistic prop and store state, then flushes microtasks so useEffects
 * (data loads, prefills) run. Any synchronous render throw or unhandled
 * effect rejection that React surfaces shows up as a failed assertion
 * with the screen name in the message.
 *
 * What this catches:
 * - Import-time errors (typos in named exports, missing files)
 * - Synchronous render throws (undefined property access in JSX)
 * - State-update race that leaves a screen in an unreachable render shape
 *
 * What it does NOT catch:
 * - Native layout crashes (NaN dimensions, ViewManager bugs)
 * - Crashes during user interaction (button taps), separate harness
 * - Real DB / network paths (everything is stubbed)
 */

// Bump the per-test timeout for this suite. screen-mount runs ~400
// mount/interaction cases that share a single worker under
// --runInBand; the very last tests in the file accumulate enough
// JS heap + scheduled timers from earlier renders that the
// NutritionTargetsScreen mount can take >5s on a CI runner even
// though it takes ~4s in isolation. Codex audit 2026-05-26 follow-
// up: NutritionTargetsScreen timed out on Main CI run #N.
// 15s gives 3x headroom over the default 5s without masking a
// genuine hang (test still fails if a real infinite-loop / never-
// resolving promise lands).
jest.setTimeout(15_000);

// NO { virtual: true } on any mock of an installed module in this file.
// A virtual mock on a RESOLVABLE module poisons Jest's worker-level
// resolver cache: every suite that runs AFTER this one in the same
// process then fails to intercept that module with its own jest.mock —
// the module resolves through the stale virtual marker and comes back
// undefined. Under the release gate's --runInBand the whole suite is one
// process, so this file (which mounts every screen and mocks the widest
// module surface in the repo) deterministically broke the ShareCard
// press tests on CI while parallel local runs mostly dodged it (Wave 4,
// 2026-07-02). virtual is only for modules that do NOT resolve, and this
// file mocks none of those.
jest.mock('react-native-url-polyfill/auto', () => ({}));
jest.mock('expo/virtual/env', () => ({ env: process.env }));
jest.mock('expo-application');
jest.mock('expo-constants');
jest.mock('expo-crypto');
jest.mock('expo-secure-store');
jest.mock('expo-sqlite');

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: {
      getSession: jest.fn(() => Promise.resolve({ data: { session: null }, error: null })),
      getUser: jest.fn(() => Promise.resolve({ data: { user: null }, error: null })),
      onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: () => {} } } })),
      signInWithPassword: jest.fn(() => Promise.resolve({ data: null, error: null })),
      signUp: jest.fn(() => Promise.resolve({ data: null, error: null })),
      signOut: jest.fn(() => Promise.resolve({ error: null })),
      signInWithOAuth: jest.fn(() => Promise.resolve({ data: null, error: null })),
      exchangeCodeForSession: jest.fn(() => Promise.resolve({ data: null, error: null })),
      setSession: jest.fn(() => Promise.resolve({ data: null, error: null })),
    },
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      upsert: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      gt: jest.fn().mockReturnThis(),
      lt: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      single: jest.fn(() => Promise.resolve({ data: null, error: null })),
      maybeSingle: jest.fn(() => Promise.resolve({ data: null, error: null })),
      then: (res) => Promise.resolve({ data: [], error: null }).then(res),
    })),
    channel: jest.fn(() => ({ on: jest.fn().mockReturnThis(), subscribe: jest.fn() })),
    rpc: jest.fn(() => Promise.resolve({ data: null, error: null })),
  })),
}));

jest.mock('expo-updates', () => ({
  reloadAsync: jest.fn(() => Promise.resolve()),
  checkForUpdateAsync: jest.fn(() => Promise.resolve({ isAvailable: false })),
  fetchUpdateAsync: jest.fn(() => Promise.resolve({ isNew: false })),
  updateId: null,
  runtimeVersion: '1.0.0',
  channel: null,
  releaseChannel: 'default',
  isEnabled: false,
  isEmbeddedLaunch: true,
  manifest: null,
}));


jest.mock('expo-file-system', () => ({
  documentDirectory: '/tmp/',
  cacheDirectory: '/tmp/',
  bundleDirectory: '/tmp/',
  writeAsStringAsync: jest.fn(() => Promise.resolve()),
  readAsStringAsync: jest.fn(() => Promise.resolve('')),
  deleteAsync: jest.fn(() => Promise.resolve()),
  getInfoAsync: jest.fn(() => Promise.resolve({ exists: false })),
  makeDirectoryAsync: jest.fn(() => Promise.resolve()),
  copyAsync: jest.fn(() => Promise.resolve()),
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(() => Promise.resolve(true)),
  shareAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(() => Promise.resolve({ type: 'cancel' })),
}));

jest.mock('expo-image-picker', () => ({
  launchCameraAsync: jest.fn(() => Promise.resolve({ canceled: true })),
  requestCameraPermissionsAsync: jest.fn(() => Promise.resolve({ granted: true })),
  MediaTypeOptions: { Images: 'Images' },
}));

jest.mock('expo-print', () => ({
  printToFileAsync: jest.fn(() => Promise.resolve({ uri: '' })),
}));

jest.mock('expo-av', () => ({
  Audio: { Sound: { createAsync: jest.fn(() => Promise.resolve({ sound: { unloadAsync: jest.fn() } })) } },
}));

jest.mock('expo-store-review', () => ({
  isAvailableAsync: jest.fn(() => Promise.resolve(true)),
  requestReview: jest.fn(() => Promise.resolve()),
}));

jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn(),
  isTaskRegisteredAsync: jest.fn(() => Promise.resolve(false)),
  unregisterTaskAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('expo-background-fetch', () => ({
  registerTaskAsync: jest.fn(() => Promise.resolve()),
  unregisterTaskAsync: jest.fn(() => Promise.resolve()),
  setMinimumIntervalAsync: jest.fn(() => Promise.resolve()),
  BackgroundFetchResult: { NewData: 1, NoData: 2, Failed: 3 },
  BackgroundFetchStatus: { Available: 3 },
  getStatusAsync: jest.fn(() => Promise.resolve(3)),
}));

jest.mock('expo-sensors', () => ({
  Pedometer: { isAvailableAsync: jest.fn(() => Promise.resolve(false)), watchStepCount: jest.fn(() => ({ remove: () => {} })) },
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

jest.mock('expo-image', () => {
  const React = require('react');
  return { Image: props => React.createElement('Image', props) };
});

jest.mock('expo-linear-gradient', () => {
  const React = require('react');
  return { LinearGradient: props => React.createElement('LinearGradient', props, props.children) };
});

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  scheduleNotificationAsync: jest.fn(() => Promise.resolve('id')),
  cancelScheduledNotificationAsync: jest.fn(() => Promise.resolve()),
  cancelAllScheduledNotificationsAsync: jest.fn(() => Promise.resolve()),
  getAllScheduledNotificationsAsync: jest.fn(() => Promise.resolve([])),
  getPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  setNotificationChannelAsync: jest.fn(() => Promise.resolve()),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: () => {} })),
  addNotificationReceivedListener: jest.fn(() => ({ remove: () => {} })),
  SchedulableTriggerInputTypes: {
    DAILY: 'daily',
    WEEKLY: 'weekly',
    YEARLY: 'yearly',
    DATE: 'date',
    TIME_INTERVAL: 'timeInterval',
    CALENDAR: 'calendar',
  },
  AndroidImportance: { MAX: 5, HIGH: 4, DEFAULT: 3, LOW: 2, MIN: 1, NONE: 0 },
  AndroidNotificationPriority: { MAX: 'max', HIGH: 'high', DEFAULT: 'default' },
}));

jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  addBreadcrumb: jest.fn(),
  setUser: jest.fn(),
  setTag: jest.fn(),
  withScope: jest.fn(cb => cb({ setTag: () => {}, setContext: () => {}, setUser: () => {} })),
}));

jest.mock('@shopify/react-native-skia', () => ({
  Canvas: 'Canvas', Path: 'Path', Skia: { Path: { Make: () => ({ moveTo: () => {}, lineTo: () => {}, close: () => {} }) } },
  useFont: () => null, useImage: () => null,
}));

jest.mock('react-native-svg', () => {
  const React = require('react');
  const mk = name => props => React.createElement(name, props, props.children);
  return {
    // __esModule matters: without it Babel's interop hands `import Svg
    // from 'react-native-svg'` the whole mock object (an invalid element
    // type), not the default component below.
    __esModule: true,
    Svg: mk('Svg'), Path: mk('Path'), G: mk('G'), Circle: mk('Circle'),
    Rect: mk('Rect'), Line: mk('Line'), Text: mk('Text'), Defs: mk('Defs'),
    LinearGradient: mk('LinearGradient'), Stop: mk('Stop'), ClipPath: mk('ClipPath'),
    default: mk('Svg'),
  };
});

// react-native-reanimated is mocked globally via __mocks__/react-native-
// reanimated.js (auto-applied by Jest), so no per-file mock is needed here.

jest.mock('react-native-webview', () => {
  const React = require('react');
  return { WebView: props => React.createElement('WebView', props), default: props => React.createElement('WebView', props) };
});

jest.mock('react-native-gesture-handler', () => {
  const React = require('react');
  const passthrough = name => props => React.createElement(name, props, props.children);
  // Gesture builder: every method is chainable and returns the same stub, so
  // VolyumeChart's Gesture.Pan().activateAfterLongPress(300).onBegin(...)... chain
  // resolves to a harmless object under test.
  const gestureStub = new Proxy({}, { get: () => () => gestureStub });
  return {
    GestureHandlerRootView: passthrough('GHRoot'),
    GestureDetector: passthrough('GestureDetector'),
    Gesture: { Pan: () => gestureStub, Tap: () => gestureStub, LongPress: () => gestureStub },
    PanGestureHandler: passthrough('PanGH'),
    TapGestureHandler: passthrough('TapGH'),
    State: {},
    Directions: {},
    gestureHandlerRootHOC: c => c,
  };
});

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn(), addListener: () => () => {}, setOptions: jest.fn(), dispatch: jest.fn(), getParent: () => ({ addListener: () => () => {} }) }),
  useRoute: () => ({ params: {} }),
  useFocusEffect: jest.fn(),
  useIsFocused: () => true,
  useScrollToTop: jest.fn(),
  NavigationContainer: ({ children }) => children,
  StackActions: { popToTop: jest.fn(), replace: jest.fn(), push: jest.fn() },
  CommonActions: { navigate: jest.fn(), reset: jest.fn() },
}));

// Toast hook used by some screens. Returns a no-op show fn.
jest.mock('../components/Toast', () => {
  const React = require('react');
  return {
    useToast: () => ({ show: jest.fn(), hide: jest.fn() }),
    ToastProvider: ({ children }) => children,
    default: props => React.createElement('Toast', props),
  };
});

// Feedback hook surfaces a feedback sheet. Stubbed so screens that
// open it on render don't crash.
jest.mock('../components/FeedbackSheet', () => {
  const React = require('react');
  return {
    useFeedback: () => ({ open: jest.fn(), close: jest.fn() }),
    FeedbackProvider: ({ children }) => children,
    default: props => React.createElement('FeedbackSheet', props),
  };
});

// Components that wrap react-native-svg or Skia: stubbed so we don't
// need every drawing primitive to be mocked deeply. __esModule:true is
// required so babel's default-export interop returns the function, not
// the whole module wrapper.
jest.mock('../components/BodyDiagramHeatmap', () => {
  const React = require('react');
  return { __esModule: true, default: props => React.createElement('BodyDiagramHeatmap', props) };
});

jest.mock('../components/GradientCard', () => {
  const React = require('react');
  return { __esModule: true, default: props => React.createElement('GradientCard', props, props.children) };
});

// Local native modules, referenced by package.json file: deps.
jest.mock('rest-timer-live', () => ({ start: jest.fn(), stop: jest.fn(), update: jest.fn() }));
jest.mock('live-activity', () => ({ start: jest.fn(), stop: jest.fn(), update: jest.fn() }));

// __DEV__ is a Metro-injected global in real RN bundles; jest's node
// env doesn't have it. Set it before screens load so any code that
// reads __DEV__ in module scope doesn't blow up.
global.__DEV__ = false;

// rAF is browser-native but Node doesn't have it. RN provides it via
// the runtime polyfill. Match RN's behavior: fire on next macrotask.
if (typeof global.requestAnimationFrame === 'undefined') {
  global.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
  global.cancelAnimationFrame = (id) => clearTimeout(id);
}

const React = require('react');
const TestRenderer = require('react-test-renderer');

// Hydrate the store with a realistic logged-in Pro user shape so screens
// that read user/tier/userProfile don't bail early. Using getState/setState
// because hooks aren't available outside React's render cycle.
const useAppStore = require('../store/useAppStore').default;

// Silence console.error globally so act warnings don't dominate the
// jest output. We still capture errors per-mount via mountScreen.
const origConsoleError = console.error;
beforeAll(() => {
  console.error = (msg, ...rest) => {
    const text = typeof msg === 'string' ? msg : String(msg);
    if (/wrap.*act|environment has been torn down|Cannot log after tests|Each child in a list|react-test-renderer is deprecated/i.test(text)) return;
    origConsoleError(msg, ...rest);
  };
});
afterAll(() => { console.error = origConsoleError; });

beforeEach(() => {
  // We call setState outside React; the act warning gets emitted by
  // any subscribers. We suppress those warnings via the global
  // console.error filter above.
  useAppStore.setState({
    user: { id: '901aeb17-b8f5-43b7-b0e7-b5375aaa68c4', email: 'test@example.com', isLocal: false },
    session: { user: { id: '901aeb17-b8f5-43b7-b0e7-b5375aaa68c4' } },
    tier: 'pro',
    firstRunComplete: true,
    userProfile: { firstName: 'Test', goal: 'lean_gain', trainingFocus: 'hypertrophy', units: 'metric' },
    activeWorkout: null,
    workoutExercises: [],
    accessibility: { reduceMotion: false, higherContrast: false, largerText: false },
    accessibilityLoaded: true,
  });
});

// Build a complete navigation prop. Some screens call methods we'd
// otherwise miss (getParent, addListener returning a cleanup, etc.)
// so we provide the whole surface.
function makeNav() {
  const nav = {
    navigate: jest.fn(),
    goBack: jest.fn(),
    replace: jest.fn(),
    push: jest.fn(),
    pop: jest.fn(),
    popToTop: jest.fn(),
    reset: jest.fn(),
    setOptions: jest.fn(),
    setParams: jest.fn(),
    dispatch: jest.fn(),
    addListener: jest.fn(() => () => {}),
    removeListener: jest.fn(),
    canGoBack: jest.fn(() => true),
    isFocused: jest.fn(() => true),
    getId: jest.fn(() => 'test-route'),
    getState: jest.fn(() => ({ routes: [], index: 0 })),
  };
  nav.getParent = jest.fn(() => nav);
  return nav;
}

// Every tree that mountScreen creates is registered here. The top-
// level afterEach unmounts the whole batch so dangling setTimeout /
// setInterval / subscription cleanup runs even when the per-test
// caller forgets to call unmountTree explicitly. Closes the open-
// handle leak that forced --forceExit on the Jest CLI (HomeScreen
// queues two setTimeout()s in a useEffect with a clearTimeout
// cleanup; the cleanup only runs on unmount).
const _trackedTrees = new Set();

async function mountScreen(Screen, props = {}) {
  const errors = [];
  const origErr = console.error;
  console.error = (msg, ..._rest) => {
    const text = typeof msg === 'string' ? msg : String(msg);
    // Filter out React's act() advisory, it's noise during mount
    // tests, not a real failure signal. Likewise filter out the
    // "test environment torn down" warnings that fire when an
    // unawaited useEffect lands after a test completes.
    if (/wrap.*act|environment has been torn down|Cannot log after tests|Each child in a list|Function components cannot be given refs|forwardRef|inside StrictMode|react-test-renderer is deprecated/i.test(text)) return;
    errors.push(text);
  };
  let tree = null;
  try {
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        React.createElement(Screen, {
          navigation: makeNav(),
          route: { params: {}, name: 'Test' },
          ...props,
        }),
      );
    });
    if (tree) _trackedTrees.add(tree);
    // Flush microtasks + one macrotask so async useEffects run.
    // Chained loadFoo() patterns mostly settle in 10-15 microtasks
    // plus the macrotask boundary that AsyncStorage/DB mocks
    // resolve on.
    await TestRenderer.act(async () => {
      for (let i = 0; i < 15; i++) await Promise.resolve();
      await new Promise(r => setImmediate(r));
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });
  } finally {
    console.error = origErr;
  }
  return { tree, errors };
}

// Tear down the rendered tree so dangling effects don't bleed into the
// next test's assertions. Call this in afterEach when you've stashed
// the tree at the test scope. Safe to call twice; the second call is
// a no-op once the tree leaves _trackedTrees.
function unmountTree(tree) {
  if (!tree) return;
  try { TestRenderer.act(() => { tree.unmount(); }); } catch (_) {}
  _trackedTrees.delete(tree);
}

afterEach(() => {
  for (const tree of _trackedTrees) {
    try { TestRenderer.act(() => { tree.unmount(); }); } catch (_) {}
  }
  _trackedTrees.clear();
});

// ─── Button-bashing helpers ──────────────────────────────────────────────

// Walk the test-renderer tree and collect every node that looks
// tappable. We rely on the type names from the RN mock (TouchableOpacity,
// Pressable, etc.), not on instanceof, so this works against the mocked
// renderer output.
function collectTappables(tree) {
  const out = [];
  function visit(node) {
    if (!node) return;
    if (typeof node === 'string' || typeof node === 'number') return;
    const t = node.type;
    if (typeof t === 'string' && /Touchable|Pressable|Switch/i.test(t) && node.props?.onPress) {
      out.push(node);
    }
    const children = node.children;
    if (Array.isArray(children)) children.forEach(visit);
    else if (children && typeof children === 'object') visit(children);
  }
  const root = tree.toJSON();
  if (Array.isArray(root)) root.forEach(visit); else visit(root);
  return out;
}

// Bash every tappable on the screen and report any callback that throws.
// We swallow per-tap errors so one bad button doesn't stop the sweep.
async function bashTappables(tree) {
  const failures = [];
  const tappables = collectTappables(tree);
  for (let i = 0; i < tappables.length; i++) {
    const node = tappables[i];
    try {
      await TestRenderer.act(async () => {
        node.props.onPress?.();
        await Promise.resolve();
      });
    } catch (e) {
      failures.push({
        index: i,
        label: node.props.accessibilityLabel ?? node.props.testID ?? node.props.children?.toString?.()?.slice(0, 40) ?? '(no label)',
        error: e.message,
        stack: (e.stack || '').split('\n').slice(1, 4).join(' | '),
      });
    }
  }
  return { count: tappables.length, failures };
}

// Collect every TextInput node so we can pump text into it.
function collectTextInputs(tree) {
  const out = [];
  function visit(node) {
    if (!node || typeof node === 'string' || typeof node === 'number') return;
    if (typeof node.type === 'string' && /TextInput/i.test(node.type) && node.props?.onChangeText) {
      out.push(node);
    }
    const c = node.children;
    if (Array.isArray(c)) c.forEach(visit); else if (c && typeof c === 'object') visit(c);
  }
  const root = tree.toJSON();
  if (Array.isArray(root)) root.forEach(visit); else visit(root);
  return out;
}

// Pump a sequence of values through each TextInput. The values are
// designed to hit common input edge cases: empty, zero, very large,
// negative, decimal, non-numeric.
async function bashTextInputs(tree) {
  const failures = [];
  const inputs = collectTextInputs(tree);
  const stress = ['', '0', '999999', '-5', '1.5', 'abc', '   ', '0.000001'];
  for (const node of inputs) {
    for (const v of stress) {
      try {
        await TestRenderer.act(async () => {
          node.props.onChangeText?.(v);
          await Promise.resolve();
        });
      } catch (e) {
        failures.push({
          input: node.props.placeholder ?? node.props.accessibilityLabel ?? '(no label)',
          value: v,
          error: e.message,
        });
      }
    }
  }
  return { count: inputs.length, failures };
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('Pro screens mount without error', () => {
  test('NutritionTargetsScreen mounts on a fresh account', async () => {
    const Screen = require('../screens/NutritionTargetsScreen').default;
    const { tree, errors } = await mountScreen(Screen);
    try {
      expect(tree).not.toBeNull();
      expect(errors).toEqual([]);
    } finally {
      unmountTree(tree);
    }
  });

  test('NutritionTargetsScreen, every tappable fires without throwing', async () => {
    const Screen = require('../screens/NutritionTargetsScreen').default;
    const { tree } = await mountScreen(Screen);
    try {
      const { count, failures } = await bashTappables(tree);
      expect(count).toBeGreaterThan(0);
      expect(failures).toEqual([]);
    } finally {
      unmountTree(tree);
    }
  });

  test('NutritionTargetsScreen mounts with previously-saved targets in the DB', async () => {
    // Simulate getNutritionTargets returning a partial row (the typical
    // shape after cloud restore: many derived fields are absent). We
    // monkey-patch the loaded module rather than jest.doMock+resetModules
    // because resetModules invalidates the React instance held by
    // react-test-renderer and breaks hooks.
    const database = require('../lib/database');
    const origGet = database.getNutritionTargets;
    const origGetBody = database.getUserBodyProfile;
    database.getNutritionTargets = () => Promise.resolve({
      id: 'nt1',
      userId: '901aeb17-b8f5-43b7-b0e7-b5375aaa68c4',
      bmr: 1700, tdee: 2600, targetKcal: 2900,
      proteinG: 200, carbsG: 350, fatG: 80,
      phase: 'lean gain', bmrMethod: 'mifflin', activityLevel: 'moderate',
      confidence: 'medium', warnings: [], gdprConsented: true,
      // Notably absent: proteinGPerKg, proteinGPerKgLbm, proteinBasis,
      // proteinApproach, goal, kcalMin, kcalMax, maintenanceKcal,
      // targetRateKgPerWeek. This is what really lands in the DB.
      createdAt: Date.now(), updatedAt: Date.now(),
    });
    database.getUserBodyProfile = () => Promise.resolve({
      sex: 'male', heightCm: 178, dateOfBirth: '1990-01-01',
    });
    let tree;
    try {
      const Screen = require('../screens/NutritionTargetsScreen').default;
      const result = await mountScreen(Screen);
      tree = result.tree;
      expect(tree).not.toBeNull();
      expect(result.errors).toEqual([]);
    } finally {
      unmountTree(tree);
      database.getNutritionTargets = origGet;
      database.getUserBodyProfile = origGetBody;
    }
  });
});

// ─── Mass screen sweep ─────────────────────────────────────────────────────
//
// Mount every Pro-reachable screen and click every touchable. Catches
// crashes that would only surface when a user actually drives the app.
// Skipped screens are ones that need props we can't easily mock (e.g.
// WorkoutSummaryScreen reads route.params populated by the finish flow).

const SCREENS_TO_SWEEP = [
  'AnalyticsScreen',
  'AthleteProfileScreen',
  'BlockReflectionScreen',
  'BodyMetricsScreen',
  'BuildWorkoutScreen',
  'CoachHeldHistoryScreen',
  'CoachOutputScreen',
  'CoachReviewScreen',
  'CoachingRemindersScreen',
  'ConsistencyScreen',
  'PartnerScreen',
  'DebugLogScreen',
  // FirstRunScreen and FreeStarterScreen were deleted (founder decision:
  // Volyume is fully free, no Free/Pro split; ProOnboardingScreen's
  // six-step wizard is now the ONE setup path for every user).
  'GoalChangeSummaryScreen',
  'HomeScreen',
  'ImportScreen',
  'LiftProgressScreen',
  'MealPlanScreen',
  'LoginScreen',
  'ManualBuilderScreen',
  'MesocycleBuilderScreen',
  'MethodologyScreen',
  'NotificationSettingsScreen',
  'NutritionEducationScreen',
  'NutritionTargetsScreen',
  'PlanLibraryScreen',
  'PlansScreen',
  'PlanUpdateScreen',
  'PrivacyPolicyScreen',
  'ProGoalSetupScreen',
  'ProOnboardingScreen',
  'ProSetupCompleteScreen',
  'ProUpgradeScreen',
  'SettingsScreen',
  'SettingsAccountScreen',
  'SettingsProfileScreen',
  'SettingsCoachingScreen',
  'SettingsDisplayScreen',
  'SettingsHealthScreen',
  'SettingsDataScreen',
  'SettingsPrivacyScreen',
  'SettingsAboutScreen',
  'SnapshotsScreen',
  'SubscriptionPolicyScreen',
  'VolumeHeatmapScreen',
  'WeeklyCheckInScreen',
  'WelcomeScreen',
  'WellbeingCheckScreen',
  'YouScreen',
  'WorkoutHistoryScreen',
  'YearOfLiftsScreen',
];

// Four state shapes worth running each screen against. Real users
// arrive in one of these and the screen has to render something sane
// in each one rather than crash.
const STATE_VARIANTS = [
  {
    name: 'pro+loaded',
    state: {
      user: { id: 'u-pro', email: 't@e.com', isLocal: false },
      session: { user: { id: 'u-pro' } },
      tier: 'pro',
      firstRunComplete: true,
      userProfile: { firstName: 'Test', goal: 'lean_gain', trainingFocus: 'hypertrophy', units: 'metric' },
    },
  },
  {
    name: 'pro+empty-profile',
    state: {
      user: { id: 'u-pro', email: 't@e.com', isLocal: false },
      session: { user: { id: 'u-pro' } },
      tier: 'pro',
      firstRunComplete: true,
      userProfile: {},
    },
  },
  {
    name: 'free+no-profile',
    state: {
      user: { id: 'u-free', email: 't@e.com', isLocal: false },
      session: { user: { id: 'u-free' } },
      tier: 'free',
      firstRunComplete: true,
      userProfile: null,
    },
  },
  {
    name: 'local-only',
    state: {
      user: { id: 'u-local', isLocal: true },
      session: null,
      tier: 'free',
      firstRunComplete: true,
      userProfile: { firstName: 'Local' },
    },
  },
];

// ─── Fuzz: random tap chains ─────────────────────────────────────────────
//
// Pick N random touchables on a screen and fire them in sequence. Repeats
// across multiple seeds to surface ordering-sensitive bugs (e.g. tapping
// A then B leaves state where B's onPress crashes).

function seedRand(seed) {
  // Mulberry32, deterministic, good enough for jest.
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function fuzzTapChain(tree, depth, rand) {
  const failures = [];
  for (let i = 0; i < depth; i++) {
    const tappables = collectTappables(tree);
    if (!tappables.length) return failures;
    const node = tappables[Math.floor(rand() * tappables.length)];
    try {
      await TestRenderer.act(async () => {
        node.props.onPress?.();
        await Promise.resolve();
      });
    } catch (e) {
      failures.push({
        step: i,
        label: node.props.accessibilityLabel ?? '(no label)',
        error: e.message,
      });
    }
  }
  return failures;
}

describe('All reachable screens, mount + bash every touchable + every text input', () => {
  for (const screenName of SCREENS_TO_SWEEP) {
    for (const variant of STATE_VARIANTS) {
      test(`${screenName} [${variant.name}]`, async () => {
        useAppStore.setState(variant.state);
        let Screen;
        try {
          Screen = require(`../screens/${screenName}`).default;
        } catch (e) {
          throw new Error(`Import failed for ${screenName}: ${e.message}`);
        }
        if (!Screen) throw new Error(`No default export from ${screenName}`);
        let tree = null;
        try {
          const result = await mountScreen(Screen);
          tree = result.tree;
          if (!tree) return;
          const tapResult = await bashTappables(tree);
          const inputResult = await bashTextInputs(tree);
          // Filter out failures that are clearly the test harness's
          // mock boundary (navigator prop, missing context value).
          const realTapFailures = tapResult.failures.filter(f =>
            !/getState\b|dispatch\b|navigation\.navigate\b|getParent\b/i.test(f.error),
          );
          const realInputFailures = inputResult.failures.filter(f =>
            !/getState\b|dispatch\b|navigation\.navigate\b|getParent\b/i.test(f.error),
          );
          if (realTapFailures.length || realInputFailures.length) {
            console.log(
              `[${screenName} / ${variant.name}] taps=${tapResult.count} inputs=${inputResult.count}\n` +
              `  tap failures: ${JSON.stringify(realTapFailures, null, 2)}\n` +
              `  input failures: ${JSON.stringify(realInputFailures, null, 2)}`,
            );
          }
          expect(realTapFailures).toEqual([]);
          expect(realInputFailures).toEqual([]);
        } finally {
          unmountTree(tree);
        }
      });
    }
  }
});

// ─── Fuzz pass: 10 random tap chains per screen, each 20 taps deep ──────
//
// This is the "thousands of clicks" requested. 38 screens × 10 seeds × 20
// taps = ~7,600 simulated taps. Filters the same mock-boundary errors as
// the deterministic sweep above.

// ─── Param-driven screens ────────────────────────────────────────────────
//
// These don't appear in the sweep because they need route.params to
// render anything useful. Test each with a realistic param shape.

describe('Screens with route.params', () => {
  test('WorkoutSummaryScreen renders with finish-flow params', async () => {
    useAppStore.setState(STATE_VARIANTS[0].state);
    const Screen = require('../screens/WorkoutSummaryScreen').default;
    let tree = null;
    try {
      const { tree: t, errors } = await mountScreen(Screen, {
        route: {
          params: {
            workoutId: 'w1',
            routineId: 'r1',
            durationMinutes: 45,
            exerciseCount: 5,
            setCount: 15,
            workingSetCount: 12,
            tonnage: 5400,
            exerciseNames: ['Bench Press', 'Row', 'Squat'],
            detectedPRs: [],
            exerciseData: [],
          },
          name: 'WorkoutSummary',
        },
      });
      tree = t;
      expect(tree).not.toBeNull();
      expect(errors).toEqual([]);
      const { failures } = await bashTappables(tree);
      const real = failures.filter(f => !/getState|dispatch|navigation\.navigate|getParent/i.test(f.error));
      expect(real).toEqual([]);
    } finally { unmountTree(tree); }
  });

  test('RoutineDetailScreen renders with routineId param', async () => {
    useAppStore.setState(STATE_VARIANTS[0].state);
    const Screen = require('../screens/RoutineDetailScreen').default;
    let tree = null;
    try {
      const { tree: t, errors } = await mountScreen(Screen, {
        route: { params: { routineId: 'r1' }, name: 'RoutineDetail' },
      });
      tree = t;
      expect(tree).not.toBeNull();
      expect(errors).toEqual([]);
    } finally { unmountTree(tree); }
  });

  test('PlanDetailScreen renders with planId param', async () => {
    useAppStore.setState(STATE_VARIANTS[0].state);
    const Screen = require('../screens/PlanDetailScreen').default;
    let tree = null;
    try {
      const { tree: t, errors } = await mountScreen(Screen, {
        route: { params: { planId: 'p1', isLibrary: false }, name: 'PlanDetail' },
      });
      tree = t;
      expect(tree).not.toBeNull();
      expect(errors).toEqual([]);
    } finally { unmountTree(tree); }
  });

  test('PlanDetailScreen with isLibrary=true (library mode)', async () => {
    useAppStore.setState(STATE_VARIANTS[0].state);
    const Screen = require('../screens/PlanDetailScreen').default;
    let tree = null;
    try {
      const { tree: t, errors } = await mountScreen(Screen, {
        route: { params: { planId: 'lib1', isLibrary: true }, name: 'PlanDetail' },
      });
      tree = t;
      expect(tree).not.toBeNull();
      expect(errors).toEqual([]);
    } finally { unmountTree(tree); }
  });

  test('BlockReflectionScreen with valid mesocycleId param', async () => {
    useAppStore.setState(STATE_VARIANTS[0].state);
    const Screen = require('../screens/BlockReflectionScreen').default;
    let tree = null;
    try {
      const { tree: t, errors } = await mountScreen(Screen, {
        route: { params: { mesocycleId: 'm1' }, name: 'BlockReflection' },
      });
      tree = t;
      expect(tree).not.toBeNull();
      expect(errors).toEqual([]);
    } finally { unmountTree(tree); }
  });

  test('CoachOutputScreen with weekStart param', async () => {
    useAppStore.setState(STATE_VARIANTS[0].state);
    const Screen = require('../screens/CoachOutputScreen').default;
    let tree = null;
    try {
      const { tree: t, errors } = await mountScreen(Screen, {
        route: { params: { weekStart: '2026-05-19' }, name: 'CoachOutput' },
      });
      tree = t;
      expect(tree).not.toBeNull();
      expect(errors).toEqual([]);
    } finally { unmountTree(tree); }
  });

  test('GoalChangeSummaryScreen with previous and next params', async () => {
    useAppStore.setState(STATE_VARIANTS[0].state);
    const Screen = require('../screens/GoalChangeSummaryScreen').default;
    let tree = null;
    try {
      const { tree: t, errors } = await mountScreen(Screen, {
        route: {
          params: {
            previous: { goal: 'lean_gain', phase: 'maintenance', kcal: 2500 },
            next: { goal: 'mild_cut', phase: 'cut', kcal: 2200 },
          },
          name: 'GoalChangeSummary',
        },
      });
      tree = t;
      expect(tree).not.toBeNull();
      expect(errors).toEqual([]);
      const { failures } = await bashTappables(tree);
      const real = failures.filter(f => !/getState|dispatch|navigation\.navigate|getParent/i.test(f.error));
      expect(real).toEqual([]);
    } finally { unmountTree(tree); }
  });

  test('YearOfLiftsScreen with yearMs param', async () => {
    useAppStore.setState(STATE_VARIANTS[0].state);
    const Screen = require('../screens/YearOfLiftsScreen').default;
    let tree = null;
    try {
      const { tree: t, errors } = await mountScreen(Screen, {
        route: { params: { yearMs: new Date('2026-01-01').getTime() }, name: 'YearOfLifts' },
      });
      tree = t;
      expect(tree).not.toBeNull();
      expect(errors).toEqual([]);
    } finally { unmountTree(tree); }
  });

  test('ExerciseDetailScreen renders with exerciseId param', async () => {
    useAppStore.setState(STATE_VARIANTS[0].state);
    const Screen = require('../screens/ExerciseDetailScreen').default;
    let tree = null;
    try {
      const { tree: t, errors } = await mountScreen(Screen, {
        route: { params: { exerciseId: 'e1' }, name: 'ExerciseDetail' },
      });
      tree = t;
      expect(tree).not.toBeNull();
      expect(errors).toEqual([]);
    } finally { unmountTree(tree); }
  });

  test('ShareCardScreen renders with session data params', async () => {
    useAppStore.setState(STATE_VARIANTS[0].state);
    const Screen = require('../screens/ShareCardScreen').default;
    let tree = null;
    try {
      const { tree: t, errors } = await mountScreen(Screen, {
        route: {
          params: {
            sessionData: {
              sessionName: 'Push Day',
              duration: 60,
              workingSets: 12,
              exerciseCount: 5,
              tonnage: 5400,
              exercises: ['Bench', 'Row'],
              prCount: 2,
              topSet: { exercise: 'Bench', weight: 100, reps: 5 },
            },
          },
          name: 'ShareCard',
        },
      });
      tree = t;
      expect(tree).not.toBeNull();
      expect(errors).toEqual([]);
    } finally { unmountTree(tree); }
  });
});

// ─── NutritionTargets: realistic userProfile.goal values ────────────────
//
// Every goal the app can produce, including legacy / weird values. The
// screen has a `VALID_GOALS` list, anything outside should not crash.

describe('NutritionTargets: every userProfile.goal value', () => {
  const goalValues = [
    'lean_gain', 'build', 'maintain', 'recomp', 'mild_cut', 'aggressive_cut',
    null, undefined, '', 'unknown_value', 'cut', 'bulk',
    123, true, { wrong: 'shape' }, ['array'],
  ];
  for (const goal of goalValues) {
    test(`renders with goal=${JSON.stringify(goal)}`, async () => {
      useAppStore.setState({
        ...STATE_VARIANTS[0].state,
        userProfile: { firstName: 'T', goal, units: 'metric' },
      });
      const Screen = require('../screens/NutritionTargetsScreen').default;
      let tree = null;
      try {
        const { tree: t, errors } = await mountScreen(Screen);
        tree = t;
        expect(tree).not.toBeNull();
        expect(errors).toEqual([]);
      } finally { unmountTree(tree); }
    });
  }
});

// ─── Form workflow: fill inputs, tap calculate ──────────────────────────

describe('NutritionTargets: fill form then tap Calculate', () => {
  test('happy path fill + calculate does not crash', async () => {
    useAppStore.setState(STATE_VARIANTS[0].state);
    const Screen = require('../screens/NutritionTargetsScreen').default;
    let tree = null;
    try {
      const { tree: t } = await mountScreen(Screen);
      tree = t;
      const inputs = collectTextInputs(tree);
      // Fill any input that asks for a number with realistic values.
      // The screen has age, height ft, height in, weight, body fat.
      const fillValues = ['28', '5', '10', '82', '15'];
      for (let i = 0; i < inputs.length && i < fillValues.length; i++) {
        await TestRenderer.act(async () => {
          inputs[i].props.onChangeText?.(fillValues[i]);
          await Promise.resolve();
        });
      }
      // Now tap every button, the Calculate button is among them.
      const { failures } = await bashTappables(tree);
      const real = failures.filter(f => !/getState|dispatch|navigation\.navigate|getParent/i.test(f.error));
      expect(real).toEqual([]);
    } finally { unmountTree(tree); }
  });

  test('bogus form input + tap Calculate does not crash', async () => {
    useAppStore.setState(STATE_VARIANTS[0].state);
    const Screen = require('../screens/NutritionTargetsScreen').default;
    let tree = null;
    try {
      const { tree: t } = await mountScreen(Screen);
      tree = t;
      const inputs = collectTextInputs(tree);
      // Pump nonsense into every input.
      for (const inp of inputs) {
        for (const v of ['', '0', '-1', '99999', 'NaN', 'undefined', '.5']) {
          await TestRenderer.act(async () => {
            inp.props.onChangeText?.(v);
            await Promise.resolve();
          });
        }
      }
      const { failures } = await bashTappables(tree);
      const real = failures.filter(f => !/getState|dispatch|navigation\.navigate|getParent/i.test(f.error));
      expect(real).toEqual([]);
    } finally { unmountTree(tree); }
  });
});

// ─── Form-driven screens: interleaved text input + tap ─────────────────
//
// Many bugs only surface when a user fills inputs then taps a button.
// This is more aggressive than the original input-stress: for each
// screen that has inputs, pump values into every input then tap every
// button, then re-pump, re-tap, repeat 3 cycles.

async function interleavedFormBash(tree, cycles = 3) {
  const failures = [];
  const inputValues = ['10', '50', '25', '100', ''];
  for (let cycle = 0; cycle < cycles; cycle++) {
    const inputs = collectTextInputs(tree);
    for (let i = 0; i < inputs.length; i++) {
      try {
        await TestRenderer.act(async () => {
          inputs[i].props.onChangeText?.(inputValues[(i + cycle) % inputValues.length]);
          await Promise.resolve();
        });
      } catch (e) {
        failures.push({ cycle, kind: 'input', index: i, error: e.message });
      }
    }
    const taps = collectTappables(tree);
    for (let i = 0; i < taps.length; i++) {
      try {
        await TestRenderer.act(async () => {
          taps[i].props.onPress?.();
          await Promise.resolve();
        });
      } catch (e) {
        failures.push({ cycle, kind: 'tap', index: i, label: taps[i].props.accessibilityLabel ?? '(no label)', error: e.message });
      }
    }
  }
  return failures;
}

describe('Form-driven screens: interleaved input + tap × 3 cycles', () => {
  const FORM_SCREENS = [
    'NutritionTargetsScreen',
    'WeeklyCheckInScreen',
    'BodyMetricsScreen',
    'ImportScreen',
    'NotificationSettingsScreen',
    'CoachingRemindersScreen',
    'ManualBuilderScreen',
  ];
  for (const screenName of FORM_SCREENS) {
    test(`${screenName}: 3 cycles of fill-and-tap`, async () => {
      useAppStore.setState(STATE_VARIANTS[0].state);
      let Screen;
      try { Screen = require(`../screens/${screenName}`).default; } catch (_) { return; }
      if (!Screen) return;
      let tree = null;
      try {
        const result = await mountScreen(Screen);
        tree = result.tree;
        if (!tree) return;
        const failures = await interleavedFormBash(tree, 3);
        const real = failures.filter(f => !/getState|dispatch|navigation\.navigate|getParent/i.test(f.error));
        if (real.length) console.log(`[${screenName} form] failures:`, JSON.stringify(real.slice(0, 5), null, 2));
        expect(real).toEqual([]);
      } finally { unmountTree(tree); }
    });
  }
});

// ─── Edge: empty arrays where rendering might assume non-empty ─────────

describe('Edge: empty arrays in expected-populated state', () => {
  test('LiftProgressScreen (Lifts) with exercises but no completed sets', async () => {
    const database = require('../lib/database');
    const orig = {
      getCompletedWorkoutSets: database.getCompletedWorkoutSets,
      getAllExercises: database.getAllExercises,
      getLatestBodyWeight: database.getLatestBodyWeight,
    };
    database.getAllExercises = () => Promise.resolve([
      { id: 'e1', name: 'Bench Press', primaryMuscle: 'chest', equipment: 'Barbell' },
    ]);
    database.getCompletedWorkoutSets = () => Promise.resolve([]);
    database.getLatestBodyWeight = () => Promise.resolve(null);
    try {
      useAppStore.setState(STATE_VARIANTS[0].state);
      const Screen = require('../screens/LiftProgressScreen').default;
      let tree = null;
      try {
        const { tree: t, errors } = await mountScreen(Screen);
        tree = t;
        expect(tree).not.toBeNull();
        expect(errors).toEqual([]);
        const { failures } = await bashTappables(tree);
        const real = failures.filter(f => !/getState|dispatch|navigation\.navigate|getParent/i.test(f.error));
        expect(real).toEqual([]);
      } finally { unmountTree(tree); }
    } finally {
      Object.assign(database, orig);
    }
  });

  test('AnalyticsScreen with workouts but empty sets', async () => {
    const database = require('../lib/database');
    const orig = {
      getAllWorkouts: database.getAllWorkouts,
      getCompletedWorkoutSets: database.getCompletedWorkoutSets,
    };
    database.getAllWorkouts = () => Promise.resolve([{
      id: 'w1', userId: 'u1', startedAt: Date.now() - 86400000,
      isCompleted: 1, setCount: 0, totalVolume: 0,
    }]);
    database.getCompletedWorkoutSets = () => Promise.resolve([]);
    try {
      useAppStore.setState(STATE_VARIANTS[0].state);
      const Screen = require('../screens/AnalyticsScreen').default;
      let tree = null;
      try {
        const { tree: t, errors } = await mountScreen(Screen);
        tree = t;
        expect(tree).not.toBeNull();
        expect(errors).toEqual([]);
        const { failures } = await bashTappables(tree);
        const real = failures.filter(f => !/getState|dispatch|navigation\.navigate|getParent/i.test(f.error));
        expect(real).toEqual([]);
      } finally { unmountTree(tree); }
    } finally {
      Object.assign(database, orig);
    }
  });

  test('AnalyticsScreen zero-data empty state stays on Progress without a Train CTA (A4)', async () => {
    // True day-0: no workouts, no sets — the empty state must render with a
    // way forward, and tapping it must not throw (cross-tab getParent nav).
    //
    // The suite-wide useFocusEffect mock is a no-op, which leaves
    // useProgressData's `loading` true forever — the empty state gates on
    // `!loading`. Scope a real effect implementation to this test only so
    // load() actually runs, and stub every loader it reaches so it settles
    // without touching the DB layer.
    const database = require('../lib/database');
    const { useFocusEffect } = require('@react-navigation/native');
    const orig = { ...database };
    database.getAllWorkouts = () => Promise.resolve([]);
    database.getCompletedWorkoutSets = () => Promise.resolve([]);
    database.getAllExercises = () => Promise.resolve([]);
    database.getAllMesocycles = () => Promise.resolve([]);
    database.getActivePlan = () => Promise.resolve(null);
    database.runInsightsEngine = () => Promise.resolve([]);
    database.getAcuteChronicWorkload = () => Promise.resolve(null);
    database.getRecentWorkoutFeedback = () => Promise.resolve([]);
    database.getCurrentMesocycleWeek = () => Promise.resolve(null);
    database.getPlannedMuscleVolume = () => Promise.resolve([]);
    useFocusEffect.mockImplementation(cb => { React.useEffect(cb, [cb]); });
    try {
      useAppStore.setState(STATE_VARIANTS[0].state);
      const Screen = require('../screens/AnalyticsScreen').default;
      let tree = null;
      try {
        const { tree: t, errors } = await mountScreen(Screen);
        tree = t;
        expect(tree).not.toBeNull();
        expect(errors).toEqual([]);
        // Collected from Text nodes: toJSON() chokes on the circular
        // refreshControl element AnalyticsScreen passes to its ScrollView.
        const text = tree.root.findAll(n => n.type === 'Text')
          .map(n => (Array.isArray(n.props.children) ? n.props.children.join('') : n.props.children))
          .filter(c => typeof c === 'string')
          .join(' ');
        expect(text).toContain('No training trends yet');
        expect(text).toContain('Training charts appear here once sessions are logged.');
        expect(text).not.toContain('Start a workout');
        const { failures } = await bashTappables(tree);
        const real = failures.filter(f => !/getState|dispatch|navigation\.navigate|getParent/i.test(f.error));
        expect(real).toEqual([]);
      } finally { unmountTree(tree); }
    } finally {
      Object.assign(database, orig);
      useFocusEffect.mockReset();
    }
  });
});

// ─── Complete workout lifecycle simulation ──────────────────────────────
//
// Walks through start → log sets → finish, mounting each intermediate
// state and bashing every interaction. Mirrors what a user does in one
// session.

describe('Workout lifecycle: start → log → finish', () => {
  test('1. Start: HomeScreen with an active plan mounts and tap-bash clean', async () => {
    const database = require('../lib/database');
    const orig = {
      getActivePlan: database.getActivePlan,
      getRoutinesForPlan: database.getRoutinesForPlan,
    };
    database.getActivePlan = () => Promise.resolve({
      id: 'p1', userId: 'u1', name: 'Push Pull Legs',
      isActive: 1, nextWorkoutIndex: 0,
    });
    database.getRoutinesForPlan = () => Promise.resolve([
      { id: 'r1', planId: 'p1', name: 'Push', orderIndex: 0 },
      { id: 'r2', planId: 'p1', name: 'Pull', orderIndex: 1 },
      { id: 'r3', planId: 'p1', name: 'Legs', orderIndex: 2 },
    ]);
    try {
      useAppStore.setState(STATE_VARIANTS[0].state);
      const Screen = require('../screens/HomeScreen').default;
      let tree = null;
      try {
        const { tree: t, errors } = await mountScreen(Screen);
        tree = t;
        expect(tree).not.toBeNull();
        expect(errors).toEqual([]);
        const { failures } = await bashTappables(tree);
        const real = failures.filter(f => !/getState|dispatch|navigation\.navigate|getParent/i.test(f.error));
        expect(real).toEqual([]);
      } finally { unmountTree(tree); }
    } finally {
      Object.assign(database, orig);
    }
  });

  test('2. Mid-workout: ActiveWorkoutScreen with 3 exercises, sets logged in some', async () => {
    useAppStore.setState({
      user: { id: 'u-lifecycle', isLocal: false },
      session: { user: { id: 'u-lifecycle' } },
      tier: 'pro',
      firstRunComplete: true,
      userProfile: { firstName: 'L', goal: 'lean_gain', units: 'metric' },
      activeWorkout: { id: 'wlc', userId: 'u-lifecycle', routineId: 'r1', startedAt: Date.now() - 600000, isCompleted: false },
      workoutStartTime: Date.now() - 600000,
      workoutExercises: [
        {
          exercise: { id: 'ex1', name: 'Bench Press', equipment: 'Barbell', primaryMuscle: 'chest' },
          routineExercise: { id: 're1', recommendedSets: 3, recommendedRepsMin: 8, recommendedRepsMax: 12 },
          sets: [
            { id: 's1', exerciseId: 'ex1', workoutId: 'wlc', setNumber: 1, setType: 'straight', actualReps: 10, weight: 80 },
            { id: 's2', exerciseId: 'ex1', workoutId: 'wlc', setNumber: 2, setType: 'straight', actualReps: 9, weight: 80 },
          ],
        },
        {
          exercise: { id: 'ex2', name: 'Pull Up', equipment: 'Bodyweight', primaryMuscle: 'back' },
          routineExercise: { id: 're2', recommendedSets: 3, recommendedRepsMin: 5, recommendedRepsMax: 10 },
          sets: [
            { id: 's3', exerciseId: 'ex2', workoutId: 'wlc', setNumber: 1, setType: 'warmup', actualReps: 5, weight: 0 },
          ],
        },
        {
          exercise: { id: 'ex3', name: 'Squat', equipment: 'Barbell', primaryMuscle: 'quads' },
          routineExercise: { id: 're3', recommendedSets: 3, recommendedRepsMin: 5, recommendedRepsMax: 8 },
          sets: [],
        },
      ],
      currentExerciseIndex: 0,
      restTimerActive: false,
      accessibility: { reduceMotion: false },
    });
    const Screen = require('../screens/ActiveWorkoutScreen').default;
    let tree = null;
    try {
      const { tree: t, errors } = await mountScreen(Screen);
      tree = t;
      expect(tree).not.toBeNull();
      expect(errors).toEqual([]);
      // Bash every touchable across this mid-workout state.
      const { failures } = await bashTappables(tree);
      const real = failures.filter(f => !/getState|dispatch|navigation\.navigate|getParent/i.test(f.error));
      if (real.length) console.log('[lifecycle/mid] failures:', JSON.stringify(real.slice(0, 5), null, 2));
      expect(real).toEqual([]);
    } finally { unmountTree(tree); }
  });

  test('3. Finish: WorkoutSummaryScreen with realistic finished-workout params', async () => {
    useAppStore.setState(STATE_VARIANTS[0].state);
    const Screen = require('../screens/WorkoutSummaryScreen').default;
    let tree = null;
    try {
      const { tree: t, errors } = await mountScreen(Screen, {
        route: {
          params: {
            workoutId: 'wlc',
            routineId: 'r1',
            durationMinutes: 52,
            exerciseCount: 3,
            setCount: 8,
            workingSetCount: 6,
            tonnage: 4320,
            exerciseNames: ['Bench Press', 'Pull Up', 'Squat'],
            detectedPRs: [
              { exerciseName: 'Bench Press', kind: 'volume', value: 800 },
            ],
            exerciseData: [
              {
                exerciseId: 'ex1', name: 'Bench Press',
                recommendedSets: 3, repsMin: 8, repsMax: 12,
                loggedSets: [
                  { weight: 80, reps: 10, setType: 'straight' },
                  { weight: 80, reps: 9, setType: 'straight' },
                  { weight: 80, reps: 8, setType: 'straight' },
                ],
              },
            ],
          },
          name: 'WorkoutSummary',
        },
      });
      tree = t;
      expect(tree).not.toBeNull();
      expect(errors).toEqual([]);
      const { failures } = await bashTappables(tree);
      const real = failures.filter(f => !/getState|dispatch|navigation\.navigate|getParent/i.test(f.error));
      expect(real).toEqual([]);
    } finally { unmountTree(tree); }
  });
});

// ─── Scale stress: large data shapes ─────────────────────────────────────

describe('Scale stress: large data does not break render or interaction', () => {
  test('Analytics with 200 workouts, 1500 sets', async () => {
    const database = require('../lib/database');
    const orig = {
      getAllWorkouts: database.getAllWorkouts,
      getCompletedWorkoutSets: database.getCompletedWorkoutSets,
    };
    database.getAllWorkouts = () => Promise.resolve(
      Array.from({ length: 200 }, (_, i) => ({
        id: `w${i}`, userId: 'u1',
        startedAt: Date.now() - i * 86400000,
        endedAt: Date.now() - i * 86400000 + 3600000,
        durationMinutes: 45 + (i % 30),
        isCompleted: 1,
        setCount: 7 + (i % 5),
        totalVolume: 3000 + (i * 50),
      })),
    );
    database.getCompletedWorkoutSets = () => Promise.resolve(
      Array.from({ length: 1500 }, (_, i) => ({
        id: `s${i}`, userId: 'u1',
        workoutId: `w${i % 200}`,
        exerciseId: `e${i % 30}`,
        setNumber: (i % 5) + 1,
        setType: i % 4 === 0 ? 'warmup' : 'straight',
        actualReps: 8 + (i % 8),
        weight: 30 + (i % 80),
      })),
    );
    try {
      useAppStore.setState(STATE_VARIANTS[0].state);
      const Screen = require('../screens/AnalyticsScreen').default;
      let tree = null;
      try {
        const { tree: t, errors } = await mountScreen(Screen);
        tree = t;
        expect(tree).not.toBeNull();
        expect(errors).toEqual([]);
        const { failures } = await bashTappables(tree);
        const real = failures.filter(f => !/getState|dispatch|navigation\.navigate|getParent/i.test(f.error));
        expect(real).toEqual([]);
      } finally { unmountTree(tree); }
    } finally {
      Object.assign(database, orig);
    }
  });

  test('WorkoutHistory with 500 workouts renders without crashing', async () => {
    const database = require('../lib/database');
    const orig = database.getRecentCompletedWorkouts;
    database.getRecentCompletedWorkouts = () => Promise.resolve(
      Array.from({ length: 500 }, (_, i) => ({
        id: `w${i}`, userId: 'u1',
        startedAt: Date.now() - i * 86400000,
        endedAt: Date.now() - i * 86400000 + 3600000,
        durationMinutes: 60,
        isCompleted: 1,
        setCount: 8,
        totalVolume: 4000,
        name: `Session ${i}`,
      })),
    );
    try {
      useAppStore.setState(STATE_VARIANTS[0].state);
      const Screen = require('../screens/WorkoutHistoryScreen').default;
      let tree = null;
      try {
        const { tree: t, errors } = await mountScreen(Screen);
        tree = t;
        expect(tree).not.toBeNull();
        expect(errors).toEqual([]);
      } finally { unmountTree(tree); }
    } finally {
      database.getRecentCompletedWorkouts = orig;
    }
  });

});

// ─── Tap-then-re-render: catches crashes that surface on re-mount ────────
//
// Many bugs only fire on the SECOND render after a tap mutated state.
// This pass: tap every touchable, then re-collect the tree's tappables
// (catches new buttons that appeared after the tap) and bash those too.

async function bashTwoLevels(tree) {
  const failures = [];
  const firstPass = collectTappables(tree);
  for (let i = 0; i < firstPass.length; i++) {
    const node = firstPass[i];
    try {
      await TestRenderer.act(async () => {
        node.props.onPress?.();
        await Promise.resolve();
        await Promise.resolve();
      });
    } catch (e) {
      failures.push({
        depth: 1, index: i,
        label: node.props.accessibilityLabel ?? '(no label)',
        error: e.message,
      });
    }
    // After the tap, re-collect and bash any newly-visible touchables.
    const secondPass = collectTappables(tree);
    for (let j = 0; j < secondPass.length; j++) {
      try {
        await TestRenderer.act(async () => {
          secondPass[j].props.onPress?.();
          await Promise.resolve();
        });
      } catch (e) {
        failures.push({
          depth: 2, primary: i, follow: j,
          label: secondPass[j].props.accessibilityLabel ?? '(no label)',
          error: e.message,
        });
      }
    }
  }
  return { firstCount: firstPass.length, failures };
}

describe('Two-level tap: bash, then bash again after each tap re-renders', () => {
  const PRO_LOADED = STATE_VARIANTS[0].state;
  // 38 screens × 2 levels would be slow. Sample the 12 highest-stakes
  // screens, anything the user touches multiple times in one session.
  // ProGoalSetupScreen is excluded because its Save button kicks off a
  // full plan-engine generation in the test env; the two-level depth
  // ends up regenerating the plan dozens of times and blows the jest
  // default timeout. That path is covered by the deterministic sweep.
  const HOT_SCREENS = [
    'BodyMetricsScreen',
    'CoachOutputScreen',
    'CoachingRemindersScreen',
    'HomeScreen',
    'NotificationSettingsScreen',
    'NutritionTargetsScreen',
    'PlansScreen',
    'SettingsScreen',
    'WeeklyCheckInScreen',
    'WorkoutHistoryScreen',
  ];
  for (const screenName of HOT_SCREENS) {
    test(`${screenName}: two-level tap stress`, async () => {
      useAppStore.setState(PRO_LOADED);
      let Screen;
      try { Screen = require(`../screens/${screenName}`).default; } catch (_) { return; }
      if (!Screen) return;
      let tree = null;
      try {
        const result = await mountScreen(Screen);
        tree = result.tree;
        if (!tree) return;
        const { failures } = await bashTwoLevels(tree);
        const real = failures.filter(f => !/getState|dispatch|navigation\.navigate|getParent/i.test(f.error));
        if (real.length) console.log(`[${screenName} two-level] failures:`, JSON.stringify(real.slice(0, 5), null, 2));
        expect(real).toEqual([]);
      } finally { unmountTree(tree); }
    });
  }
});

// ─── Accessibility mode variants ────────────────────────────────────────
//
// Reduce Motion + Higher Contrast + Larger Text are all user-toggleable.
// Each rebakes StyleSheets and changes some component branches. Mount
// every screen against each combination to catch crashes that only fire
// under accessibility overrides.

const A11Y_VARIANTS = [
  { name: 'rm-on', accessibility: { reduceMotion: true, higherContrast: false, largerText: false } },
  { name: 'hc-on', accessibility: { reduceMotion: false, higherContrast: true, largerText: false } },
  { name: 'lt-on', accessibility: { reduceMotion: false, higherContrast: false, largerText: true } },
  { name: 'all-on', accessibility: { reduceMotion: true, higherContrast: true, largerText: true } },
];

describe('A11y: mount every screen under each accessibility override', () => {
  for (const screenName of SCREENS_TO_SWEEP) {
    for (const a11y of A11Y_VARIANTS) {
      test(`${screenName} [a11y: ${a11y.name}]`, async () => {
        useAppStore.setState({
          ...STATE_VARIANTS[0].state,
          accessibility: a11y.accessibility,
          accessibilityLoaded: true,
        });
        let Screen;
        try { Screen = require(`../screens/${screenName}`).default; } catch (_) { return; }
        if (!Screen) return;
        let tree = null;
        try {
          const result = await mountScreen(Screen);
          tree = result.tree;
          if (!tree) return;
          const { failures } = await bashTappables(tree);
          const real = failures.filter(f => !/getState|dispatch|navigation\.navigate|getParent/i.test(f.error));
          if (real.length) console.log(`[${screenName} a11y ${a11y.name}] failures:`, JSON.stringify(real.slice(0, 3), null, 2));
          expect(real).toEqual([]);
        } finally { unmountTree(tree); }
      });
    }
  }
});

// ─── Stress: corrupted / unusual data shapes from the DB ────────────────
//
// What happens when getWorkouts() returns one workout with missing
// fields, when an exercise has no name, when set_count is NaN, when
// the cloud restore inserted a row with target_kcal=null but
// gdpr_consented=true? These are realistic post-restore shapes.

describe('Stress: screens render against corrupted DB shapes', () => {
  test('NutritionTargets: row with null targetKcal does not crash render', async () => {
    const database = require('../lib/database');
    const orig = database.getNutritionTargets;
    database.getNutritionTargets = () => Promise.resolve({
      id: 'nt1', userId: 'u1',
      bmr: null, tdee: null, targetKcal: null,
      proteinG: null, carbsG: null, fatG: null,
      phase: null, bmrMethod: null, activityLevel: null,
      confidence: null, warnings: null, gdprConsented: true,
      createdAt: 0, updatedAt: 0,
    });
    try {
      const Screen = require('../screens/NutritionTargetsScreen').default;
      const { tree, errors } = await mountScreen(Screen);
      expect(tree).not.toBeNull();
      expect(errors).toEqual([]);
    } finally {
      database.getNutritionTargets = orig;
    }
  });

  test('HomeScreen: getAllExercises returns rows with null names', async () => {
    const database = require('../lib/database');
    const orig = database.getAllExercises;
    database.getAllExercises = () => Promise.resolve([
      { id: 'e1', name: null, primaryMuscle: 'chest' },
      { id: 'e2', name: 'Squat', primaryMuscle: null },
      { id: 'e3', name: '', primaryMuscle: 'quads' },
    ]);
    try {
      const Screen = require('../screens/HomeScreen').default;
      const { tree, errors } = await mountScreen(Screen);
      expect(tree).not.toBeNull();
      expect(errors).toEqual([]);
    } finally {
      database.getAllExercises = orig;
    }
  });

  test('AnalyticsScreen: empty data set renders without crashing', async () => {
    const database = require('../lib/database');
    const orig = {
      getAllWorkouts: database.getAllWorkouts,
      getCompletedWorkoutSets: database.getCompletedWorkoutSets,
    };
    database.getAllWorkouts = () => Promise.resolve([]);
    database.getCompletedWorkoutSets = () => Promise.resolve([]);
    try {
      const Screen = require('../screens/AnalyticsScreen').default;
      const { tree, errors } = await mountScreen(Screen);
      expect(tree).not.toBeNull();
      expect(errors).toEqual([]);
    } finally {
      Object.assign(database, orig);
    }
  });

  test('AnalyticsScreen: dataset with one workout and one set', async () => {
    const database = require('../lib/database');
    const orig = {
      getAllWorkouts: database.getAllWorkouts,
      getCompletedWorkoutSets: database.getCompletedWorkoutSets,
    };
    database.getAllWorkouts = () => Promise.resolve([{
      id: 'w1', userId: 'u1', startedAt: Date.now() - 86400000,
      endedAt: Date.now() - 86400000 + 3600000, durationMinutes: 60,
      isCompleted: 1, setCount: 1, totalVolume: 600,
    }]);
    database.getCompletedWorkoutSets = () => Promise.resolve([{
      id: 's1', userId: 'u1', workoutId: 'w1', exerciseId: 'e1',
      setNumber: 1, setType: 'straight', actualReps: 10, weight: 60,
    }]);
    try {
      const Screen = require('../screens/AnalyticsScreen').default;
      const { tree, errors } = await mountScreen(Screen);
      expect(tree).not.toBeNull();
      expect(errors).toEqual([]);
    } finally {
      Object.assign(database, orig);
    }
  });
});

// ─── Rapid double-tap stress on critical buttons ─────────────────────────
//
// Beta testers WILL mash buttons. We simulate that by tapping every
// touchable five times in rapid succession with no state flush. Should
// catch any onPress handler that doesn't guard against re-entrance.

async function bashTappablesRapid(tree, repeats = 5) {
  const failures = [];
  const tappables = collectTappables(tree);
  for (let i = 0; i < tappables.length; i++) {
    const node = tappables[i];
    try {
      await TestRenderer.act(async () => {
        for (let r = 0; r < repeats; r++) node.props.onPress?.();
        await Promise.resolve();
      });
    } catch (e) {
      failures.push({
        index: i,
        label: node.props.accessibilityLabel ?? '(no label)',
        error: e.message,
      });
    }
  }
  return { count: tappables.length, failures };
}

describe('Rapid double-tap stress on every screen', () => {
  const PRO_LOADED = STATE_VARIANTS[0].state;
  for (const screenName of SCREENS_TO_SWEEP) {
    test(`${screenName}: 5x rapid tap on every button`, async () => {
      useAppStore.setState(PRO_LOADED);
      let Screen;
      try { Screen = require(`../screens/${screenName}`).default; } catch (_) { return; }
      if (!Screen) return;
      let tree = null;
      try {
        const result = await mountScreen(Screen);
        tree = result.tree;
        if (!tree) return;
        const { failures } = await bashTappablesRapid(tree, 5);
        const real = failures.filter(f =>
          !/getState\b|dispatch\b|navigation\.navigate\b|getParent\b/i.test(f.error),
        );
        if (real.length) console.log(`[${screenName} rapid] failures:`, JSON.stringify(real.slice(0, 3), null, 2));
        expect(real).toEqual([]);
      } finally {
        unmountTree(tree);
      }
    });
  }
});

// ─── ActiveWorkoutScreen: with a workout in progress ─────────────────────

describe('ActiveWorkoutScreen, many exercises, varied set shapes', () => {
  test('5 exercises with varied set arrays mounts and renders', async () => {
    const mkExercise = (i, sets) => ({
      exercise: { id: `ex${i}`, name: `Exercise ${i}`, equipment: i % 2 ? 'Barbell' : 'Dumbbell', primaryMuscle: 'chest' },
      routineExercise: { id: `re${i}`, recommendedSets: 3, recommendedRepsMin: 8, recommendedRepsMax: 12 },
      sets,
    });
    useAppStore.setState({
      user: { id: 'u-many', isLocal: false },
      session: { user: { id: 'u-many' } },
      tier: 'pro',
      firstRunComplete: true,
      userProfile: { firstName: 'M', goal: 'lean_gain', units: 'metric' },
      activeWorkout: { id: 'w-many', userId: 'u-many', routineId: 'r-many', startedAt: Date.now(), isCompleted: false },
      workoutStartTime: Date.now(),
      workoutExercises: [
        mkExercise(1, [
          { id: 's1', exerciseId: 'ex1', workoutId: 'w-many', setNumber: 1, setType: 'warmup', actualReps: 10, weight: 40 },
          { id: 's2', exerciseId: 'ex1', workoutId: 'w-many', setNumber: 2, setType: 'straight', actualReps: 8, weight: 80 },
        ]),
        mkExercise(2, []),                          // empty array
        mkExercise(3, [{ id: 's3', exerciseId: 'ex3', workoutId: 'w-many', setNumber: 1, setType: 'straight', actualReps: 6, weight: 100 }]),
        // intentionally omit sets to confirm the entry.sets?.length guard fires
        { exercise: { id: 'ex4', name: 'Exercise 4', equipment: 'Cable' }, routineExercise: { id: 're4' } },
        mkExercise(5, [{ id: 's5', exerciseId: 'ex5', workoutId: 'w-many', setNumber: 1, setType: 'amrap', actualReps: 15, weight: 50 }]),
      ],
      currentExerciseIndex: 0,
      restTimerActive: false,
      accessibility: { reduceMotion: false },
    });
    const Screen = require('../screens/ActiveWorkoutScreen').default;
    let tree = null;
    try {
      const { tree: t, errors } = await mountScreen(Screen);
      tree = t;
      expect(tree).not.toBeNull();
      expect(errors).toEqual([]);
      const { failures } = await bashTappables(tree);
      const real = failures.filter(f => !/getState|dispatch|navigation\.navigate|getParent/i.test(f.error));
      if (real.length) console.log('[5 exercises] failures:', JSON.stringify(real.slice(0, 5), null, 2));
      expect(real).toEqual([]);
    } finally { unmountTree(tree); }
  });

  test('1 exercise with a set missing weight / reps fields', async () => {
    useAppStore.setState({
      user: { id: 'u1', isLocal: false },
      session: { user: { id: 'u1' } },
      tier: 'pro',
      firstRunComplete: true,
      userProfile: { firstName: 'A', goal: 'lean_gain', units: 'metric' },
      activeWorkout: { id: 'w1', userId: 'u1', routineId: 'r1', startedAt: Date.now(), isCompleted: false },
      workoutStartTime: Date.now(),
      workoutExercises: [{
        exercise: { id: 'ex1', name: 'Bench Press', equipment: 'Barbell', primaryMuscle: 'chest' },
        routineExercise: { id: 're1', recommendedSets: 3, recommendedRepsMin: 8, recommendedRepsMax: 12 },
        sets: [
          { id: 's1', exerciseId: 'ex1', workoutId: 'w1', setNumber: 1, setType: 'straight' }, // no weight or reps
          { id: 's2', exerciseId: 'ex1', workoutId: 'w1', setNumber: 2, setType: 'straight', actualReps: null, weight: null },
        ],
      }],
      currentExerciseIndex: 0,
      restTimerActive: false,
      accessibility: { reduceMotion: false },
    });
    const Screen = require('../screens/ActiveWorkoutScreen').default;
    let tree = null;
    try {
      const { tree: t, errors } = await mountScreen(Screen);
      tree = t;
      expect(tree).not.toBeNull();
      expect(errors).toEqual([]);
      const { failures } = await bashTappables(tree);
      const real = failures.filter(f => !/getState|dispatch|navigation\.navigate|getParent/i.test(f.error));
      if (real.length) console.log('[missing fields] failures:', JSON.stringify(real.slice(0, 5), null, 2));
      expect(real).toEqual([]);
    } finally { unmountTree(tree); }
  });
});

describe('ActiveWorkoutScreen with active workout state', () => {
  test('mounts mid-workout with logged sets without crashing', async () => {
    useAppStore.setState({
      user: { id: 'u-active', isLocal: false },
      session: { user: { id: 'u-active' } },
      tier: 'pro',
      firstRunComplete: true,
      userProfile: { firstName: 'A', goal: 'lean_gain', units: 'metric' },
      activeWorkout: {
        id: 'w1',
        userId: 'u-active',
        routineId: 'r1',
        startedAt: Date.now() - 10 * 60 * 1000,
        isCompleted: false,
      },
      workoutStartTime: Date.now() - 10 * 60 * 1000,
      workoutExercises: [
        {
          exercise: { id: 'ex1', name: 'Barbell Bench Press', equipment: 'Barbell', primaryMuscle: 'chest' },
          routineExercise: { id: 're1', recommendedSets: 3, recommendedRepsMin: 8, recommendedRepsMax: 12 },
          sets: [
            { id: 's1', exerciseId: 'ex1', workoutId: 'w1', setNumber: 1, setType: 'straight', actualReps: 10, weight: 60, rir: 2, rpe: null },
            { id: 's2', exerciseId: 'ex1', workoutId: 'w1', setNumber: 2, setType: 'straight', actualReps: 9, weight: 60, rir: 1, rpe: null },
          ],
        },
      ],
      currentExerciseIndex: 0,
      restTimerActive: false,
      restTimerDuration: 0,
      restTimerRemaining: 0,
      accessibility: { reduceMotion: false },
    });
    const Screen = require('../screens/ActiveWorkoutScreen').default;
    let tree = null;
    try {
      const result = await mountScreen(Screen);
      tree = result.tree;
      expect(tree).not.toBeNull();
      // Tap every touchable on the screen, covers Log Set, Skip Rest,
      // Add Set, Finish, Discard, exercise switcher, etc.
      const { failures } = await bashTappables(tree);
      const real = failures.filter(f =>
        !/getState\b|dispatch\b|navigation\.navigate\b|getParent\b/i.test(f.error),
      );
      if (real.length) console.log('[ActiveWorkout] failures:', JSON.stringify(real, null, 2));
      expect(real).toEqual([]);
    } finally {
      unmountTree(tree);
    }
  });

  // U-A-1 invariant, re-anchored for D43 S2: the pre-card banner stack now
  // collapses into content-labelled StatusStrip chips (Deload / Superset /
  // Coach note / Starter session / Target met) instead of one ambiguous
  // "N notes" count chip — each banner's content stays hidden until its chip
  // is tapped, so the beat line + inputs stay above the fold — and the target
  // prescription (reps range) moved into the set-entry card header (folded
  // beside the orientation line, the old "Target: N sets" row retired). Drives
  // a real "Target reached" banner (recommendedSets met by the logged working
  // sets) so the fold is exercised via the "Target met" chip.
  test('D43 S2: banners collapse into content-labelled status chips; target prescription sits in the card header', async () => {
    const collectText = (node, out = []) => {
      if (node == null) return out;
      if (typeof node === 'string' || typeof node === 'number') { out.push(String(node)); return out; }
      if (Array.isArray(node)) { node.forEach(n => collectText(n, out)); return out; }
      if (node.children) collectText(node.children, out);
      return out;
    };
    useAppStore.setState({
      user: { id: 'u-fold', isLocal: false },
      session: { user: { id: 'u-fold' } },
      tier: 'pro',
      firstRunComplete: true,
      userProfile: { firstName: 'A', goal: 'lean_gain', units: 'metric' },
      activeWorkout: { id: 'wfold', userId: 'u-fold', routineId: 'rfold', startedAt: Date.now() - 6e5, isCompleted: false },
      workoutStartTime: Date.now() - 6e5,
      workoutExercises: [
        {
          exercise: { id: 'exf', name: 'Barbell Bench Press', equipment: 'Barbell', primaryMuscle: 'chest' },
          // recommendedSets:2 met by the two straight working sets below =>
          // targetComplete true => the "Target reached" banner is active.
          routineExercise: { id: 'ref', recommendedSets: 2, recommendedRepsMin: 8, recommendedRepsMax: 12 },
          sets: [
            { id: 'sf1', exerciseId: 'exf', workoutId: 'wfold', setNumber: 1, setType: 'straight', actualReps: 10, weight: 60, rir: 2, rpe: null },
            { id: 'sf2', exerciseId: 'exf', workoutId: 'wfold', setNumber: 2, setType: 'straight', actualReps: 9, weight: 60, rir: 1, rpe: null },
          ],
        },
      ],
      currentExerciseIndex: 0,
      restTimerActive: false,
      restTimerDuration: 0,
      restTimerRemaining: 0,
      accessibility: { reduceMotion: false },
    });
    const Screen = require('../screens/ActiveWorkoutScreen').default;
    let tree = null;
    try {
      const result = await mountScreen(Screen);
      tree = result.tree;
      expect(tree).not.toBeNull();

      // Collapsed (default): the content-labelled "Target met" chip shows, but
      // its banner content ("Target reached") is NOT in the tree yet — it is
      // behind the tap.
      const collapsed = collectText(tree.toJSON()).join('  ');
      expect(collapsed).toMatch(/Target met/);          // the content chip is present
      expect(collapsed).not.toMatch(/Target reached/);  // the banner stays folded
      // The target prescription (reps range) moved INTO the card header, folded
      // beside the orientation line, and still renders.
      expect(collapsed).toMatch(/8\s*-\s*12\s*reps/);

      // Expand: tap the chip; the folded banner content then appears.
      const chips = tree.root.findAll(
        n => n.props
          && typeof n.props.onPress === 'function'
          && typeof n.props.accessibilityLabel === 'string'
          && /tap to (expand|collapse)/.test(n.props.accessibilityLabel),
      );
      expect(chips.length).toBeGreaterThan(0);
      await TestRenderer.act(async () => { chips[0].props.onPress(); });
      const expanded = collectText(tree.toJSON()).join('  ');
      expect(expanded).toMatch(/Target reached/);       // banner visible once expanded
    } finally {
      unmountTree(tree);
    }
  });

  async function runHundredTapFuzzSeeds(seedStart, seedEnd) {
    const mkExercise = (i, sets) => ({
      exercise: { id: `ex${i}`, name: `Exercise ${i}`, equipment: i % 2 ? 'Barbell' : 'Dumbbell', primaryMuscle: 'chest' },
      routineExercise: { id: `re${i}`, recommendedSets: 3, recommendedRepsMin: 8, recommendedRepsMax: 12 },
      sets,
    });
    useAppStore.setState({
      user: { id: 'u-fuzz', isLocal: false },
      session: { user: { id: 'u-fuzz' } },
      tier: 'pro',
      firstRunComplete: true,
      userProfile: { firstName: 'F', goal: 'lean_gain', units: 'metric' },
      activeWorkout: { id: 'wf', userId: 'u-fuzz', routineId: 'rf', startedAt: Date.now(), isCompleted: false },
      workoutStartTime: Date.now(),
      workoutExercises: [
        mkExercise(1, [{ id: 's1', exerciseId: 'ex1', workoutId: 'wf', setNumber: 1, setType: 'straight', actualReps: 10, weight: 60 }]),
        mkExercise(2, []),
        mkExercise(3, [{ id: 's3', exerciseId: 'ex3', workoutId: 'wf', setNumber: 1, setType: 'warmup', actualReps: 8, weight: 30 }]),
        { exercise: { id: 'ex4', name: 'Ex4', equipment: 'Cable' }, routineExercise: { id: 're4' } },
        mkExercise(5, [{ id: 's5', exerciseId: 'ex5', workoutId: 'wf', setNumber: 1, setType: 'amrap', actualReps: 12, weight: 40 }]),
      ],
      currentExerciseIndex: 0,
      restTimerActive: false,
      accessibility: { reduceMotion: false },
    });
    const Screen = require('../screens/ActiveWorkoutScreen').default;
    let tree = null;
    try {
      const result = await mountScreen(Screen);
      tree = result.tree;
      const allFailures = [];
      for (let seed = seedStart; seed <= seedEnd; seed++) {
        const rand = seedRand(seed * 7919);
        const failures = await fuzzTapChain(tree, 100, rand);
        for (const f of failures) {
          if (!/getState|dispatch|navigation\.navigate|getParent/i.test(f.error)) {
            allFailures.push({ seed, ...f });
          }
        }
      }
      if (allFailures.length) console.log(`[100-tap fuzz ${seedStart}-${seedEnd}] failures:`, JSON.stringify(allFailures.slice(0, 10), null, 2));
      expect(allFailures).toEqual([]);
    } finally { unmountTree(tree); }
  }

  for (const [seedStart, seedEnd] of [[1, 5], [6, 10], [11, 15], [16, 20]]) {
    test(`handles 100-tap chains, seeds ${seedStart}-${seedEnd}, in a 5-exercise workout`, async () => {
      await runHundredTapFuzzSeeds(seedStart, seedEnd);
    });
  }

  test('handles a 50-tap random chain mid-workout', async () => {
    useAppStore.setState({
      user: { id: 'u-active', isLocal: false },
      session: { user: { id: 'u-active' } },
      tier: 'pro',
      firstRunComplete: true,
      userProfile: { firstName: 'A', goal: 'lean_gain', units: 'metric' },
      activeWorkout: { id: 'w1', userId: 'u-active', routineId: 'r1', startedAt: Date.now(), isCompleted: false },
      workoutStartTime: Date.now(),
      workoutExercises: [
        {
          exercise: { id: 'ex1', name: 'Squat', equipment: 'Barbell', primaryMuscle: 'quads' },
          routineExercise: { id: 're1', recommendedSets: 3, recommendedRepsMin: 5, recommendedRepsMax: 8 },
          sets: [],
        },
      ],
      currentExerciseIndex: 0,
      restTimerActive: false,
      accessibility: { reduceMotion: false },
    });
    const Screen = require('../screens/ActiveWorkoutScreen').default;
    let tree = null;
    try {
      const result = await mountScreen(Screen);
      tree = result.tree;
      const rand = seedRand(424242);
      const failures = await fuzzTapChain(tree, 50, rand);
      const real = failures.filter(f =>
        !/getState\b|dispatch\b|navigation\.navigate\b|getParent\b/i.test(f.error),
      );
      if (real.length) console.log('[ActiveWorkout fuzz] failures:', JSON.stringify(real.slice(0, 5), null, 2));
      expect(real).toEqual([]);
    } finally {
      unmountTree(tree);
    }
  });
});

// ─── Campaign 20 Phase 2: the live set prescription resolver wired into the
// real logger (docs/live-prescription-campaign-20-2026-08-16/
// CAMPAIGN-20-PHASE-1-DESIGN.md, FOUNDER-RULINGS-2026-08-16.md). Mounted,
// behavioural tests against ActiveWorkoutScreen.js itself - not the pure
// resolver (src/lib/livePrescription.js has its own full suites) - so these
// pin the WIRING: the screen assembling the packet, seeding the real
// editable weight/reps boxes, and re-resolving after each logged set.
// database.js is monkeypatched on the shared module object (the established
// pattern used above by the AnalyticsScreen empty-state test), restored in
// `finally` so no test leaks its history into the next.
describe('Campaign 20 Phase 2: live set prescription resolver wired into ActiveWorkoutScreen', () => {
  async function actFlush(fn) {
    await TestRenderer.act(async () => {
      if (fn) await fn();
      for (let i = 0; i < 15; i++) await Promise.resolve();
      await new Promise(r => setImmediate(r));
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });
  }

  function weightInput(tree) { return tree.root.findByProps({ testID: 'volyume-weight-input' }); }
  function repsInput(tree) { return tree.root.findByProps({ testID: 'volyume-reps-input' }); }
  function logButton(tree) { return tree.root.findByProps({ testID: 'volyume-btn-complete-set' }); }

  async function typeAndLog(tree, weight, reps) {
    await actFlush(() => {
      weightInput(tree).props.onChangeText(String(weight));
    });
    await actFlush(() => {
      repsInput(tree).props.onChangeText(String(reps));
    });
    await actFlush(() => logButton(tree).props.onPress());
  }

  function mkEntry({ exerciseId, repsMin, repsMax, sets = 3 }) {
    return {
      exercise: { id: exerciseId, name: 'Bench Press', equipment: 'Barbell', primaryMuscle: 'chest', exerciseType: 'weight_reps', exerciseCategory: 'compound' },
      routineExercise: { id: `re-${exerciseId}`, recommendedSets: sets, recommendedRepsMin: repsMin, recommendedRepsMax: repsMax },
      sets: [],
    };
  }

  // One comparable history session: 80x12 / 80x10 / 75x10 (positions 1-3),
  // difficulty 2 (effort supports an advance where the band allows one).
  // Band 8-15 keeps position 1's top reps (12) IN band rather than topped,
  // so nextSessionOpeningLoad's ordinary MATCH_LOAD_ADD_REP path is the one
  // under test here (the ADVANCE/DROP paths are the pure resolver suite's
  // job, not this wiring suite's).
  function mockSingleSessionHistory(database, exerciseId) {
    const histSets = [
      { id: 'h1', exerciseId, workoutId: 'histW1', setNumber: 1, setType: 'straight', actualReps: 12, weight: 80, createdAt: Date.now() - 3 * 86400000, targetRepsMin: 8, targetRepsMax: 15 },
      { id: 'h2', exerciseId, workoutId: 'histW1', setNumber: 2, setType: 'straight', actualReps: 10, weight: 80, createdAt: Date.now() - 3 * 86400000, targetRepsMin: 8, targetRepsMax: 15 },
      { id: 'h3', exerciseId, workoutId: 'histW1', setNumber: 3, setType: 'straight', actualReps: 10, weight: 75, createdAt: Date.now() - 3 * 86400000, targetRepsMin: 8, targetRepsMax: 15 },
    ];
    database.getLastNWorkoutSets = async () => [histSets];
    database.getWorkoutById = async (id) => ({ id, startedAt: Date.now() - 3 * 86400000, sessionDifficulty: 2 });
    database.getAllCompletedSetsForExercise = async () => [];
  }

  function mockNoHistory(database) {
    database.getLastNWorkoutSets = async () => [];
    database.getWorkoutById = async () => null;
    database.getAllCompletedSetsForExercise = async () => [];
  }

  function baseState(entry) {
    return {
      user: { id: 'u-c20', isLocal: false },
      session: { user: { id: 'u-c20' } },
      tier: 'pro',
      firstRunComplete: true,
      userProfile: { firstName: 'C', goal: 'lean_gain', units: 'metric' },
      activeWorkout: { id: 'w-c20', userId: 'u-c20', routineId: 'r-c20', startedAt: Date.now(), isCompleted: false },
      workoutStartTime: Date.now(),
      workoutExercises: [entry],
      currentExerciseIndex: 0,
      restTimerActive: false,
      accessibility: { reduceMotion: false },
    };
  }

  test('(a) first-set seed comes from the resolver, not raw history echo', async () => {
    const database = require('../lib/database');
    const orig = { ...database };
    mockSingleSessionHistory(database, 'exA');
    database.getCurrentMesocycleWeek = async () => null;
    let tree = null;
    try {
      useAppStore.setState(baseState(mkEntry({ exerciseId: 'exA', repsMin: 8, repsMax: 15 })));
      const Screen = require('../screens/ActiveWorkoutScreen').default;
      const result = await mountScreen(Screen);
      tree = result.tree;
      expect(tree).not.toBeNull();
      // 80 is the session's top working load, in band (12 < repsMax 15) -
      // MATCH_LOAD_ADD_REP, not a fabricated number and not the raw
      // ordinal echo of whichever set the old getBestAnchorSet preferred.
      expect(weightInput(tree).props.value).toBe('80');
    } finally {
      unmountTree(tree);
      Object.assign(database, orig);
    }
  });

  test('(b) live re-resolution: log 80x12 then 80x11 -> Set 3 stays 80, never reverts to the old ordinal 75', async () => {
    const database = require('../lib/database');
    const orig = { ...database };
    mockSingleSessionHistory(database, 'exB');
    database.getCurrentMesocycleWeek = async () => null;
    let tree = null;
    try {
      useAppStore.setState(baseState(mkEntry({ exerciseId: 'exB', repsMin: 8, repsMax: 15, sets: 4 })));
      const Screen = require('../screens/ActiveWorkoutScreen').default;
      const result = await mountScreen(Screen);
      tree = result.tree;

      await typeAndLog(tree, 80, 12);
      await typeAndLog(tree, 80, 11);

      // Set 3's box: the resolver's own current-session HOLD rule (today's
      // demonstrated 80 outranks the single historical ordinal-3 value of
      // 75 - Law B / the brief's core scenario), not carry-forward echo.
      expect(weightInput(tree).props.value).toBe('80');
    } finally {
      unmountTree(tree);
      Object.assign(database, orig);
    }
  });

  test('(c) weaker today: a below-band set drops the load by exactly one increment, honest reps', async () => {
    const database = require('../lib/database');
    const orig = { ...database };
    // repsMin 8 (so "6" genuinely misses it) but repsMax 13, one rep above
    // the history's best (12), so position 1's own seed is the ordinary
    // MATCH_LOAD_ADD_REP 80 - not an ADVANCE to 82.5, which would otherwise
    // read the test's own typed "80" as a Law G override and mask the
    // weaker-today drop this test exists to pin.
    const histSets = [
      { id: 'h1', exerciseId: 'exC', workoutId: 'histW2', setNumber: 1, setType: 'straight', actualReps: 12, weight: 80, createdAt: Date.now() - 3 * 86400000, targetRepsMin: 8, targetRepsMax: 13 },
      { id: 'h2', exerciseId: 'exC', workoutId: 'histW2', setNumber: 2, setType: 'straight', actualReps: 11, weight: 80, createdAt: Date.now() - 3 * 86400000, targetRepsMin: 8, targetRepsMax: 13 },
      { id: 'h3', exerciseId: 'exC', workoutId: 'histW2', setNumber: 3, setType: 'straight', actualReps: 9, weight: 80, createdAt: Date.now() - 3 * 86400000, targetRepsMin: 8, targetRepsMax: 13 },
    ];
    database.getLastNWorkoutSets = async () => [histSets];
    database.getWorkoutById = async (id) => ({ id, startedAt: Date.now() - 3 * 86400000, sessionDifficulty: 2 });
    database.getAllCompletedSetsForExercise = async () => [];
    database.getCurrentMesocycleWeek = async () => null;
    let tree = null;
    try {
      useAppStore.setState(baseState(mkEntry({ exerciseId: 'exC', repsMin: 8, repsMax: 13, sets: 3 })));
      // Sanity: position 1's own seed is 80 (not an ADVANCE to 82.5), so the
      // deliberate 80 typed below reads as ordinary logging, not an override.
      const Screen = require('../screens/ActiveWorkoutScreen').default;
      const result = await mountScreen(Screen);
      tree = result.tree;
      expect(weightInput(tree).props.value).toBe('80');

      await typeAndLog(tree, 80, 6); // below repsMin(8) - a genuine miss, not noise

      expect(weightInput(tree).props.value).toBe('77.5'); // one increment down, grid-rounded
      expect(repsInput(tree).props.value).toBe('8');       // honest target: the band minimum
    } finally {
      unmountTree(tree);
      Object.assign(database, orig);
    }
  });

  test('(d) user override: presented 80, logs 75 instead -> the resolver stops re-suggesting 80', async () => {
    const database = require('../lib/database');
    const orig = { ...database };
    mockSingleSessionHistory(database, 'exD');
    database.getCurrentMesocycleWeek = async () => null;
    let tree = null;
    try {
      useAppStore.setState(baseState(mkEntry({ exerciseId: 'exD', repsMin: 8, repsMax: 15, sets: 4 })));
      const Screen = require('../screens/ActiveWorkoutScreen').default;
      const result = await mountScreen(Screen);
      tree = result.tree;

      // The presented prescription is 80 (test (a) pins this exact value);
      // deliberately log 75 instead - more than half an increment away.
      expect(weightInput(tree).props.value).toBe('80');
      await typeAndLog(tree, 75, 10);

      // Law G: the resolver stops re-suggesting 80 for the rest of this
      // exercise today and prescribes AT the chosen load instead.
      expect(weightInput(tree).props.value).toBe('75');
    } finally {
      unmountTree(tree);
      Object.assign(database, orig);
    }
  });

  test('(e) overshoot under an active re-entry easing never adds load (Founder Ruling 2)', async () => {
    const database = require('../lib/database');
    const orig = { ...database };
    mockNoHistory(database);
    database.getCurrentMesocycleWeek = async () => null;
    let tree = null;
    try {
      const state = baseState(mkEntry({ exerciseId: 'exE', repsMin: 8, repsMax: 12, sets: 3 }));
      // The athlete's explicit re-entry-ease choice - NOT tier-gated, one
      // downward-only step (sessionAdjustments.getReEntryEaseTweak).
      state.activeWorkout = { ...state.activeWorkout, reEntryEaseApplied: true };
      useAppStore.setState(state);
      const Screen = require('../screens/ActiveWorkoutScreen').default;
      const result = await mountScreen(Screen);
      tree = result.tree;

      // repsMax(12) + 2 = 14: a genuine overshoot, outside noise.
      await typeAndLog(tree, 80, 14);

      const nextWeight = parseFloat(weightInput(tree).props.value);
      // The ADD path is disabled outright under an active re-entry easing
      // (Founder Ruling 2, ABSOLUTE) - the box must never show 82.5 (one
      // increment up). It may only hold or reduce.
      expect(nextWeight).not.toBe(82.5);
      expect(nextWeight).toBeLessThanOrEqual(80);
    } finally {
      unmountTree(tree);
      Object.assign(database, orig);
    }
  });

  test('(f) common case: no adjustment fires, so the next box equals what was just lifted (carry-forward feel preserved)', async () => {
    const database = require('../lib/database');
    const orig = { ...database };
    mockNoHistory(database);
    database.getCurrentMesocycleWeek = async () => null;
    let tree = null;
    try {
      useAppStore.setState(baseState(mkEntry({ exerciseId: 'exF', repsMin: 8, repsMax: 12, sets: 3 })));
      const Screen = require('../screens/ActiveWorkoutScreen').default;
      const result = await mountScreen(Screen);
      tree = result.tree;

      await typeAndLog(tree, 60, 10); // ordinary, in-band, no overshoot or miss

      expect(weightInput(tree).props.value).toBe('60');
      expect(repsInput(tree).props.value).toBe('10');
    } finally {
      unmountTree(tree);
      Object.assign(database, orig);
    }
  });
});

// ─── Campaign 20 Phase 2 Stage 15: restore/replay verification ────────────
//
// docs/live-prescription-campaign-20-2026-08-16/CAMPAIGN-20-PHASE-1-DESIGN.md
// §20's "Replay / determinism tests" list, exercised at the screen level
// (there is no persisted prescription state to replay - the resolver is
// pure and re-derives everything from packetBase/loggedSets each render, so
// "replay" here means: does every state-changing path that SHOULD feed the
// packet actually do so). Self-contained helpers (small deliberate
// duplication of the Campaign 20 Phase 2 describe block above, which scopes
// its own helpers to its own closure).
describe('Campaign 20 Phase 2 Stage 15: restore/replay verification', () => {
  async function actFlush(fn) {
    await TestRenderer.act(async () => {
      if (fn) await fn();
      for (let i = 0; i < 15; i++) await Promise.resolve();
      await new Promise(r => setImmediate(r));
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });
  }

  function weightInput(tree) { return tree.root.findByProps({ testID: 'volyume-weight-input' }); }
  function repsInput(tree) { return tree.root.findByProps({ testID: 'volyume-reps-input' }); }
  function logButton(tree) { return tree.root.findByProps({ testID: 'volyume-btn-complete-set' }); }

  async function typeAndLog(tree, weight, reps) {
    await actFlush(() => { weightInput(tree).props.onChangeText(String(weight)); });
    await actFlush(() => { repsInput(tree).props.onChangeText(String(reps)); });
    await actFlush(() => logButton(tree).props.onPress());
  }

  function mkEntry({ exerciseId, repsMin, repsMax, sets = 3, loggedSets = [] }) {
    return {
      exercise: { id: exerciseId, name: 'Bench Press', equipment: 'Barbell', primaryMuscle: 'chest', exerciseType: 'weight_reps', exerciseCategory: 'compound' },
      routineExercise: { id: `re-${exerciseId}`, recommendedSets: sets, recommendedRepsMin: repsMin, recommendedRepsMax: repsMax },
      sets: loggedSets,
    };
  }

  function histSets(exerciseId, weight, reps, { at = Date.now() - 3 * 86400000, repsMin = 8, repsMax = 15 } = {}) {
    return [{ id: `h-${exerciseId}`, exerciseId, workoutId: `histW-${exerciseId}`, setNumber: 1, setType: 'straight', actualReps: reps, weight, createdAt: at, targetRepsMin: repsMin, targetRepsMax: repsMax }];
  }

  function baseState(entries, currentExerciseIndex = 0) {
    return {
      user: { id: 'u-c20s15', isLocal: false },
      session: { user: { id: 'u-c20s15' } },
      tier: 'pro',
      firstRunComplete: true,
      userProfile: { firstName: 'C', goal: 'lean_gain', units: 'metric' },
      activeWorkout: { id: 'w-c20s15', userId: 'u-c20s15', routineId: 'r-c20s15', startedAt: Date.now(), isCompleted: false },
      workoutStartTime: Date.now(),
      workoutExercises: entries,
      currentExerciseIndex,
      restTimerActive: false,
      accessibility: { reduceMotion: false },
    };
  }

  test('(i) exercise jump away and back: the seed re-derives fresh, not stale, from loadHistory\'s evidence pass', async () => {
    const database = require('../lib/database');
    const orig = { ...database };
    // exA's history tops out at 80kg (in-band); exB's at 50kg. Distinct
    // enough that a stale carry-over between the two is unmistakable.
    database.getLastNWorkoutSets = async (exerciseId) => [histSets(exerciseId, exerciseId === 'exA' ? 80 : 50, 10)];
    database.getWorkoutById = async (id) => ({ id, startedAt: Date.now() - 3 * 86400000, sessionDifficulty: 2 });
    database.getAllCompletedSetsForExercise = async () => [];
    database.getCurrentMesocycleWeek = async () => null;
    let tree = null;
    try {
      useAppStore.setState(baseState([
        mkEntry({ exerciseId: 'exA', repsMin: 8, repsMax: 15 }),
        mkEntry({ exerciseId: 'exB', repsMin: 8, repsMax: 15 }),
      ]));
      const Screen = require('../screens/ActiveWorkoutScreen').default;
      const result = await mountScreen(Screen);
      tree = result.tree;
      expect(weightInput(tree).props.value).toBe('80'); // exA's fresh seed

      await actFlush(() => useAppStore.setState({ currentExerciseIndex: 1 }));
      expect(weightInput(tree).props.value).toBe('50'); // exB's fresh seed, not exA's 80

      await actFlush(() => useAppStore.setState({ currentExerciseIndex: 0 }));
      expect(weightInput(tree).props.value).toBe('80'); // back to exA's fresh seed, not exB's 50
    } finally {
      unmountTree(tree);
      Object.assign(database, orig);
    }
  });

  // LoggedSetRow is React.memo-wrapped; react-test-renderer's findAllByType
  // matches the memo's INNER function instance, not the outer memo object
  // this file imports, so type-based lookup silently finds nothing. Every
  // logged-set row (and its editor, once open) carries a distinctive prop
  // shape (`onEdit`+`set` when closed, `isEditing`+`onSaveEdit` when open),
  // so match on that shape instead - robust regardless of memo wrapping.
  function findLoggedRow(tree, predicate) {
    return tree.root.findAll(n => n.props && typeof n.props.onEdit === 'function' && n.props.set && predicate(n.props.set))[0];
  }
  function findEditingRow(tree) {
    return tree.root.findAll(n => n.props && n.props.isEditing && typeof n.props.onSaveEdit === 'function')[0];
  }

  test('(ii) editing a logged set: the live box re-seeds from the edited value, not the pre-edit one', async () => {
    const database = require('../lib/database');
    const orig = { ...database };
    database.getLastNWorkoutSets = async () => [];
    database.getWorkoutById = async () => null;
    database.getAllCompletedSetsForExercise = async () => [];
    database.getCurrentMesocycleWeek = async () => null;
    database.updateWorkoutSet = jest.fn(async () => true);
    let tree = null;
    try {
      useAppStore.setState(baseState([mkEntry({ exerciseId: 'exH', repsMin: 8, repsMax: 12, sets: 3 })]));
      const Screen = require('../screens/ActiveWorkoutScreen').default;
      const result = await mountScreen(Screen);
      tree = result.tree;

      // Log an ordinary, in-band set: no adjustment fires, Set 2's box shows
      // the plain carry-forward (80).
      await typeAndLog(tree, 80, 12);
      expect(weightInput(tree).props.value).toBe('80');

      // Edit that set DOWN to a genuine below-band miss (6 < repsMin 8).
      let row = findLoggedRow(tree, (s) => s.weight === 80 && s.actualReps === 12);
      expect(row).toBeTruthy();
      await actFlush(() => row.props.onEdit(row.props.set));

      row = findEditingRow(tree);
      expect(row).toBeTruthy();
      await actFlush(() => row.props.onChangeEditValue({ ...row.props.editValue, reps: 6 }));

      row = findEditingRow(tree);
      await actFlush(() => row.props.onSaveEdit());

      // Set 2's box (still untouched/ghost) now reflects the EDITED
      // evidence: a genuine miss drops the load by exactly one increment,
      // honest reps target at the band minimum - the same law pinned for a
      // freshly-logged weaker set in test (c) above, now proven for an edit.
      expect(weightInput(tree).props.value).toBe('77.5');
      expect(repsInput(tree).props.value).toBe('8');
    } finally {
      unmountTree(tree);
      Object.assign(database, orig);
    }
  });

  test('(iii) deleting a logged set: the live box re-seeds as if that set never happened', async () => {
    const database = require('../lib/database');
    const orig = { ...database };
    database.getLastNWorkoutSets = async () => [];
    database.getWorkoutById = async () => null;
    database.getAllCompletedSetsForExercise = async () => [];
    database.getCurrentMesocycleWeek = async () => null;
    database.deleteWorkoutSet = jest.fn(async () => true);
    // handleDeleteEditedSet routes through appAlert's real confirm-then-
    // remove flow (Cancel/Delete). appAlert is a module-level singleton
    // queue (src/components/AppAlert.js) shared for this ENTIRE test file -
    // mounting a real AppAlertHost here would drain (and show, one at a
    // time) every unrelated alert every earlier test in this file ever
    // queued without an alert host mounted to consume it, burying this
    // test's own confirm behind a backlog with no bearing on it. Swap the
    // exported `appAlert` binding directly instead (same convention this
    // whole file already uses for `database.*`), auto-pressing the
    // destructive button exactly as a user tapping "Delete" would.
    const AppAlertModule = require('../components/AppAlert');
    const origAppAlert = AppAlertModule.appAlert;
    AppAlertModule.appAlert = (title, message, buttons) => {
      const destructive = Array.isArray(buttons) && buttons.find((b) => b.style === 'destructive');
      destructive?.onPress?.();
    };
    let tree = null;
    try {
      useAppStore.setState(baseState([mkEntry({ exerciseId: 'exI', repsMin: 8, repsMax: 12, sets: 4 })]));
      const Screen = require('../screens/ActiveWorkoutScreen').default;
      const result = await mountScreen(Screen);
      tree = result.tree;

      // Set 1: first exposure, nothing presented yet to override. Set 2:
      // logged AT the presented weight (60 - no Law G override) but with a
      // genuine overshoot (reps >= band.max + 2 = 14) so §12.1's ADD fires
      // legitimately - Set 3's box becomes 62.5 (60 + one increment), not a
      // typed literal, so reverting to 60 after the delete below can only
      // come from the resolver re-deriving off the remaining evidence.
      await typeAndLog(tree, 60, 10);
      await typeAndLog(tree, 60, 14);
      expect(weightInput(tree).props.value).toBe('62.5');

      // Delete the second (60x14, the overshoot) set: open its editor, then
      // trigger the real confirm-then-remove flow (handleDeleteEditedSet).
      let row = findLoggedRow(tree, (s) => s.weight === 60 && s.actualReps === 14);
      expect(row).toBeTruthy();
      await actFlush(() => row.props.onEdit(row.props.set));

      row = findEditingRow(tree);
      expect(row).toBeTruthy();
      await actFlush(() => row.props.onDeleteEdit(row.props.set));

      // Only the 60x10 set remains logged; the next box's carry-forward
      // must read 60, never the overshoot-driven 62.5.
      expect(weightInput(tree).props.value).toBe('60');
    } finally {
      AppAlertModule.appAlert = origAppAlert;
      unmountTree(tree);
      Object.assign(database, orig);
    }
  });

  test('(iv) app-restore path: prescription derives from authoritative DB + restored store state, nothing persisted of its own', async () => {
    const database = require('../lib/database');
    const orig = { ...database };
    // A comparable history session the resolver has never seen before this
    // mount, deliberately LIGHTER than the restored today-evidence below -
    // proves the seed is DERIVED fresh on mount from BOTH sources (not
    // carried over from whatever a hypothetical persisted snapshot might
    // have contained), with today's genuinely heavier restored evidence
    // correctly outranking the older, lighter DB history (Law B).
    database.getLastNWorkoutSets = async () => [histSets('exJ', 80, 12, { repsMin: 8, repsMax: 15 })];
    database.getWorkoutById = async (id) => ({ id, startedAt: Date.now() - 3 * 86400000, sessionDifficulty: 2 });
    database.getAllCompletedSetsForExercise = async () => [];
    database.getCurrentMesocycleWeek = async () => null;
    let tree = null;
    try {
      // Simulates the shape restoreActiveWorkout leaves in the store after
      // a crash-recovery snapshot rehydrate (src/store/useAppStore.js
      // _persistActiveWorkout/restoreActiveWorkout): activeWorkout,
      // workoutExercises (with a set ALREADY logged this session, as if
      // restored mid-workout) and currentExerciseIndex, nothing more - no
      // prescription-shaped field anywhere in that snapshot.
      useAppStore.setState(baseState([
        mkEntry({
          exerciseId: 'exJ', repsMin: 8, repsMax: 15, sets: 4,
          loggedSets: [{ id: 'restored-1', exerciseId: 'exJ', setType: 'straight', weight: 100, actualReps: 12, setNumber: 1, createdAt: Date.now() - 60000 }],
        }),
      ]));
      const Screen = require('../screens/ActiveWorkoutScreen').default;
      const result = await mountScreen(Screen);
      tree = result.tree;

      // Today's restored evidence (100x12, in band) outranks the single
      // historical top load - Law B's current-session HOLD rule, exactly
      // as it would for a live-logged set, proving loadHistory + the
      // resolver ran fresh on this mount rather than trusting stale state.
      expect(weightInput(tree).props.value).toBe('100');
    } finally {
      unmountTree(tree);
      Object.assign(database, orig);
    }
  });
});

// ─── C3 (ultimate-audit 2026-07-03): the auto-advance countdown is visible
// and cancellable ──────────────────────────────────────────────────────────
//
// Hitting the working-set target used to arm a silent
// setTimeout(handleNextExercise, 1800) with nothing on screen to say it was
// running; the only way to stay on the exercise was to log another set.
// This pins that the countdown now renders a "Next exercise in a moment ·
// Stay here" row the moment it arms, and that tapping "Stay here" clears the
// pending advance (fake timers past the old 1800ms window afterwards leave
// the exercise unchanged). A second test pins the un-cancelled behaviour is
// unchanged: leaving it alone still advances.
describe('C3: auto-advance countdown is visible and cancellable', () => {
  function findByTestID(tree, testID) {
    const out = [];
    function visit(node) {
      if (!node || typeof node === 'string' || typeof node === 'number') return;
      if (node.props?.testID === testID && node.props?.onPress) out.push(node);
      const c = node.children;
      if (Array.isArray(c)) c.forEach(visit); else if (c && typeof c === 'object') visit(c);
    }
    const root = tree.toJSON();
    if (Array.isArray(root)) root.forEach(visit); else visit(root);
    return out;
  }
  function collectText(node, out = []) {
    if (node == null) return out;
    if (typeof node === 'string' || typeof node === 'number') { out.push(String(node)); return out; }
    if (Array.isArray(node)) { node.forEach(n => collectText(n, out)); return out; }
    if (node.children) collectText(node.children, out);
    return out;
  }

  // One exercise with ONE straight set already logged this session against a
  // 2-set target (workingLogged 1 of 2), so the next logged set crosses the
  // target and arms the countdown. A second exercise gives the advance
  // somewhere to go (isLastExercise must be false to arm at all). No prior
  // session exists in the test DB, so handleCompleteSet's history query
  // returns empty and the pre-fill falls through to routineExercise's
  // startingWeight / recommendedRepsMax, giving the tap a valid weight and
  // reps without typing anything.
  function baseState() {
    return {
      user: { id: 'u-advance', isLocal: false },
      session: { user: { id: 'u-advance' } },
      tier: 'pro',
      firstRunComplete: true,
      userProfile: { firstName: 'A', goal: 'lean_gain', units: 'metric' },
      activeWorkout: { id: 'w-advance', userId: 'u-advance', routineId: 'r-advance', startedAt: Date.now(), isCompleted: false },
      workoutStartTime: Date.now(),
      workoutExercises: [
        {
          exercise: { id: 'exA', name: 'Barbell Bench Press', equipment: 'Barbell', primaryMuscle: 'chest', exerciseType: 'weight_reps' },
          routineExercise: { id: 'reA', recommendedSets: 2, recommendedRepsMin: 8, recommendedRepsMax: 10, startingWeight: 60 },
          sets: [
            { id: 'sA1', exerciseId: 'exA', workoutId: 'w-advance', setNumber: 1, setType: 'straight', actualReps: 10, weight: 60, rir: 2, rpe: null },
          ],
        },
        {
          exercise: { id: 'exB', name: 'Barbell Row', equipment: 'Barbell', primaryMuscle: 'back', exerciseType: 'weight_reps' },
          routineExercise: { id: 'reB', recommendedSets: 2, recommendedRepsMin: 8, recommendedRepsMax: 10 },
          sets: [],
        },
      ],
      currentExerciseIndex: 0,
      restTimerActive: false,
      restTimerDuration: 0,
      restTimerRemaining: 0,
      accessibility: { reduceMotion: false },
    };
  }

  // RE-PINNED (logger redesign phase 2, founder ruling Option B): the
  // countdown is now a state of the SINGLE primary CTA. Crossing the target
  // swaps the same slot to "Next exercise" (its own progress track carries
  // the 1.8s wait) with "Log another set" as the explicit secondary; the
  // old floating "Next exercise in a moment / Stay here" row no longer
  // exists. Choosing the extra set cancels the pending advance - the same
  // cancellation guarantee "Stay here" used to provide, one honest action.
  test('logging the target-hitting set swaps the single CTA to Next exercise; Log another set cancels the pending advance', async () => {
    useAppStore.setState(baseState());
    const Screen = require('../screens/ActiveWorkoutScreen').default;
    let tree = null;
    try {
      const { tree: t, errors } = await mountScreen(Screen);
      tree = t;
      expect(tree).not.toBeNull();
      expect(errors).toEqual([]);

      const logButtons = findByTestID(tree, 'volyume-btn-complete-set');
      expect(logButtons.length).toBe(1);

      jest.useFakeTimers();
      try {
        // Log the second working set: target (2) reached.
        await TestRenderer.act(async () => {
          logButtons[0].props.onPress();
          for (let i = 0; i < 20; i++) await Promise.resolve();
        });

        // The SAME primary slot is now the advance; the logging primary and
        // the retired floating row are both absent.
        const afterLog = collectText(tree.toJSON()).join('  ');
        expect(afterLog).not.toMatch(/Next exercise in a moment/);
        expect(afterLog).not.toMatch(/Stay here/);
        expect(findByTestID(tree, 'volyume-btn-next-exercise').length).toBe(1);
        expect(findByTestID(tree, 'volyume-btn-complete-set').length).toBe(0);

        // The explicit secondary extra-set action is present; choosing it
        // cancels the pending advance and returns the bar to Log set.
        const extraButtons = findByTestID(tree, 'volyume-btn-extra-set');
        expect(extraButtons.length).toBe(1);
        await TestRenderer.act(async () => { extraButtons[0].props.onPress(); });
        expect(findByTestID(tree, 'volyume-btn-complete-set').length).toBe(1);
        expect(findByTestID(tree, 'volyume-btn-next-exercise').length).toBe(0);

        // Advancing well past the 1800ms window must NOT move the screen
        // on: the cancelled countdown stays cancelled, and the entry is
        // armed for set 3 on exercise A.
        await TestRenderer.act(async () => {
          jest.advanceTimersByTime(2500);
          await Promise.resolve();
        });
        expect(useAppStore.getState().currentExerciseIndex).toBe(0);
        const afterWait = collectText(tree.toJSON()).join('  ');
        expect(afterWait).toMatch(/Set 3 of 2/);
      } finally {
        jest.useRealTimers();
      }
    } finally {
      unmountTree(tree);
    }
  });

  // Option B's "the timer is a ceiling": tapping the advance CTA during the
  // countdown moves on immediately, and no second (duplicate) advance fires
  // when the old timer window later expires.
  test('tapping Next exercise during the countdown advances immediately with no duplicate fire', async () => {
    useAppStore.setState(baseState());
    const Screen = require('../screens/ActiveWorkoutScreen').default;
    let tree = null;
    try {
      const { tree: t } = await mountScreen(Screen);
      tree = t;
      const logButtons = findByTestID(tree, 'volyume-btn-complete-set');

      jest.useFakeTimers();
      try {
        await TestRenderer.act(async () => {
          logButtons[0].props.onPress();
          for (let i = 0; i < 20; i++) await Promise.resolve();
        });

        const nextButtons = findByTestID(tree, 'volyume-btn-next-exercise');
        expect(nextButtons.length).toBe(1);
        await TestRenderer.act(async () => {
          nextButtons[0].props.onPress();
          for (let i = 0; i < 10; i++) await Promise.resolve();
        });
        expect(useAppStore.getState().currentExerciseIndex).toBe(1);

        // The old timer must have been cancelled by the tap: running the
        // clock past 1800ms cannot advance again (there is no exercise 3,
        // and a stray fire would be a no-op advance attempt - the index
        // must simply hold).
        await TestRenderer.act(async () => {
          jest.advanceTimersByTime(2500);
          await Promise.resolve();
        });
        expect(useAppStore.getState().currentExerciseIndex).toBe(1);
      } finally {
        jest.useRealTimers();
      }
    } finally {
      unmountTree(tree);
    }
  });

  test('leaving the countdown alone still auto-advances (the underlying A2 behaviour is unchanged)', async () => {
    useAppStore.setState(baseState());
    const Screen = require('../screens/ActiveWorkoutScreen').default;
    let tree = null;
    try {
      const { tree: t } = await mountScreen(Screen);
      tree = t;
      const logButtons = findByTestID(tree, 'volyume-btn-complete-set');

      jest.useFakeTimers();
      try {
        await TestRenderer.act(async () => {
          logButtons[0].props.onPress();
          for (let i = 0; i < 20; i++) await Promise.resolve();
        });
        expect(useAppStore.getState().currentExerciseIndex).toBe(0);

        await TestRenderer.act(async () => {
          jest.advanceTimersByTime(2500);
          await Promise.resolve();
        });
        expect(useAppStore.getState().currentExerciseIndex).toBe(1);
      } finally {
        jest.useRealTimers();
      }
    } finally {
      unmountTree(tree);
    }
  });
});

describe('Fuzz: 20-tap chains across 10 seeds on every Pro screen', () => {
  const PRO_LOADED = STATE_VARIANTS[0].state;
  for (const screenName of SCREENS_TO_SWEEP) {
    test(`${screenName}: random 20-tap chains × 10 seeds`, async () => {
      useAppStore.setState(PRO_LOADED);
      let Screen;
      try { Screen = require(`../screens/${screenName}`).default; } catch (_) { return; }
      if (!Screen) return;
      let tree = null;
      try {
        const result = await mountScreen(Screen);
        tree = result.tree;
        if (!tree) return;
        const allFailures = [];
        for (let seed = 1; seed <= 10; seed++) {
          const rand = seedRand(seed * 1000 + screenName.length);
          const failures = await fuzzTapChain(tree, 20, rand);
          for (const f of failures) {
            if (!/getState\b|dispatch\b|navigation\.navigate\b|getParent\b/i.test(f.error)) {
              allFailures.push({ seed, ...f });
            }
          }
        }
        if (allFailures.length) {
          console.log(`[${screenName}] fuzz failures:`, JSON.stringify(allFailures.slice(0, 5), null, 2));
        }
        expect(allFailures).toEqual([]);
      } finally {
        unmountTree(tree);
      }
    });
  }
});

// ─── ProOnboarding resume after the Article 9 consent gate ───────────────────
//
// Regression: creating an account manually looped. The Article 9 consent
// gate unmounts the onboarding stack right after sign-up, wiping the
// screen's local `step` state. On remount the recovery effect used to be
// blocked by `if (userProfile) return`, but the sign-up sync hydrates a
// profile, so it stranded the user on Step 1 (Create your account). The
// persisted store flag proOnboardingAccountCreated drives the resume now.

// ─── MealPlanScreen: ONE DAILY TRUTH (Campaign 17A, founder law) ─────────
//
// This block used to pin the "Training today?" per-day control: it rendered
// on a cycling plan and re-varianted the day through the service. The founder
// retired day-type cycling outright ("VOLYUME HAS THE SAME BASE CALORIE AND
// MACRO TARGET EVERY DAY"), so the control, the service call behind it and
// the day-type chip are all gone. These tests pin their absence against a
// REAL mount, including on a legacy stored plan that still carries the old
// schedule/variants/cycleDeltaKcal fields - a state on real devices today.

describe('MealPlanScreen carries no day-type control', () => {
  function findByLabel(tree, label) {
    const out = [];
    function visit(node) {
      if (!node || typeof node === 'string' || typeof node === 'number') return;
      if (node.props?.accessibilityLabel === label && node.props?.onPress) out.push(node);
      const c = node.children;
      if (Array.isArray(c)) c.forEach(visit); else if (c && typeof c === 'object') visit(c);
    }
    const root = tree.toJSON();
    if (Array.isArray(root)) root.forEach(visit); else visit(root);
    return out;
  }

  function collectStrings(node, out = []) {
    if (node == null) return out;
    if (typeof node === 'string' || typeof node === 'number') { out.push(String(node)); return out; }
    if (Array.isArray(node)) { node.forEach((n) => collectStrings(n, out)); return out; }
    if (node.children) collectStrings(node.children, out);
    return out;
  }

  // A LEGACY stored plan: it still carries the retired schedule, variants and
  // cycleDeltaKcal fields, exactly as a plan generated before 17A does.
  function makeLegacyPlanRecord() {
    const mkDay = (variant) => ({
      variant,
      slots: [{ slot: 'meal_1', name: 'Meal 1', totals: { kcal: 600, protein: 50, carbs: 60, fat: 15 } }],
      totals: { kcal: 600, protein: 50, carbs: 60, fat: 15 },
      withinTolerance: true,
    });
    return {
      id: 'plan-1',
      plan: {
        kind: 'week',
        schedule: ['training', 'rest'],
        days: [mkDay('training'), mkDay('rest')],
        variants: { training: { kcal: 2600 }, rest: { kcal: 2400 } },
        cycleDeltaKcal: 200,
        prefs: { diet: 'omnivore', mealsPerDay: 4 },
        targetSnapshot: { targetKcal: 2600, kcalMin: 2340, kcalMax: 2860, proteinG: 180 },
      },
    };
  }

  test('a legacy cycling plan renders no "Training today?" control and no day-type chip', async () => {
    useAppStore.setState(STATE_VARIANTS[0].state);
    const service = require('../lib/food/mealPlanService');
    const orig = service.loadActiveMealPlan;
    service.loadActiveMealPlan = () => Promise.resolve(makeLegacyPlanRecord());
    let tree = null;
    try {
      const Screen = require('../screens/MealPlanScreen').default;
      const { tree: t, errors } = await mountScreen(Screen);
      tree = t;
      expect(tree).not.toBeNull();
      expect(errors).toEqual([]);
      expect(findByLabel(tree, 'Training today?: Training')).toEqual([]);
      expect(findByLabel(tree, 'Training today?: Rest')).toEqual([]);
      const text = collectStrings(tree.toJSON()).join(' | ');
      expect(text).not.toMatch(/Training day|Rest day|Training today/i);
      expect(text).not.toMatch(/Training days carry more carbs/i);
    } finally {
      unmountTree(tree);
      service.loadActiveMealPlan = orig;
    }
  });

  test('the service exposes no per-day training answer for the screen to call', () => {
    const service = require('../lib/food/mealPlanService');
    expect(service.answerTrainingTodayOnActivePlan).toBeUndefined();
  });
});

describe('ProOnboarding resumes past Step 1 after the consent detour', () => {
  function collectText(node, out = []) {
    if (node == null) return out;
    if (typeof node === 'string' || typeof node === 'number') { out.push(String(node)); return out; }
    if (Array.isArray(node)) { node.forEach(n => collectText(n, out)); return out; }
    if (node.children) collectText(node.children, out);
    return out;
  }

  test('a created account with a hydrated profile still advances to Step 2', async () => {
    useAppStore.setState({
      user: { id: 'u-cloud', email: 't@e.com', isLocal: false },
      session: { user: { id: 'u-cloud' } },
      tier: 'pro',
      firstRunComplete: false,
      healthConsent: true,
      healthConsentChecked: true,
      proOnboardingAccountCreated: true,
      // A hydrated profile is exactly what used to (wrongly) block the resume.
      userProfile: { tier: 'pro' },
    });
    const Screen = require('../screens/ProOnboardingScreen').default;
    let tree = null;
    try {
      const { tree: t } = await mountScreen(Screen);
      tree = t;
      const text = collectText(tree.toJSON()).join('');
      expect(text).not.toMatch(/Create account and continue/i);
      // RA-3 (Review A, D96): the internal step is still 2, but the visible
      // counter no longer counts the finished sign-in leg, so the first
      // rendered wizard screen reads "Step 1 of 6 - Baseline" (CC28 added the optional Injuries & limitations step). Same meaning
      // as the old "Step 2 of" pin: the user is past the account step.
      expect(text).toMatch(/Step\s*1\s*of\s*6\s*-\s*Baseline/i);
    } finally {
      unmountTree(tree);
    }
  });

  test('a local user with no created account still sees Step 1', async () => {
    useAppStore.setState({
      user: { id: 'u-local', isLocal: true },
      session: null,
      tier: 'pro',
      firstRunComplete: false,
      healthConsent: null,
      healthConsentChecked: false,
      proOnboardingAccountCreated: false,
      userProfile: null,
    });
    const Screen = require('../screens/ProOnboardingScreen').default;
    let tree = null;
    try {
      const { tree: t } = await mountScreen(Screen);
      tree = t;
      const text = collectText(tree.toJSON()).join('');
      expect(text).toMatch(/Step\s*1\s*of/i);
    } finally {
      unmountTree(tree);
    }
  });
});

// ─── Community (social-discovery lane, screens 5-8 + programme surfaces) ──
// `docs/social-discovery-2026-09-06/30-BLUEPRINT.md` section 10: screen-mount
// covers every new Community screen. These five take route params and are
// pushed into HomeStack, so they are mounted here rather than added to
// SCREENS_TO_SWEEP (which mounts param-less tab roots). Every Community read
// goes through the mocked Supabase client and therefore FAILS, which is the
// point: each screen must render its calm not-available state rather than
// throw.
describe('Community screens mount with their route params', () => {
  const CASES = [
    ['CommunityProgrammeScreen', { id: 'prog-1' }],
    ['CommunityAdaptScreen', { id: 'prog-1' }],
    ['CommunityPublishProgrammeScreen', { planId: 'p1' }],
    ['CommunityComposeScreen', { kind: 'session', workoutId: 'w1' }],
    ['CommunityPostScreen', { id: 'post-1' }],
  ];

  for (const [screenName, params] of CASES) {
    test(`${screenName} mounts and renders without throwing`, async () => {
      useAppStore.setState(STATE_VARIANTS[0].state);
      const Screen = require(`../screens/${screenName}`).default;
      let tree = null;
      try {
        const { tree: t, errors } = await mountScreen(Screen, {
          route: { params, name: screenName.replace('Screen', '') },
        });
        tree = t;
        expect(tree).not.toBeNull();
        expect(errors).toEqual([]);
      } finally {
        unmountTree(tree);
      }
    });
  }

  test('every Community screen survives a tap on everything it renders', async () => {
    for (const [screenName, params] of CASES) {
      useAppStore.setState(STATE_VARIANTS[0].state);
      const Screen = require(`../screens/${screenName}`).default;
      let tree = null;
      try {
        const { tree: t } = await mountScreen(Screen, {
          route: { params, name: screenName.replace('Screen', '') },
        });
        tree = t;
        // eslint-disable-next-line no-await-in-loop
        const { failures } = await bashTappables(tree);
        const real = failures.filter(f => !/getState|dispatch|navigation\.navigate|getParent/i.test(f.error));
        expect({ screenName, real }).toEqual({ screenName, real: [] });
      } finally {
        unmountTree(tree);
      }
    }
  });
});

// ─── Community (social-discovery lane, navigation + profile surfaces) ─────
// `docs/social-discovery-2026-09-06/30-BLUEPRINT.md` section 10: screen-mount
// covers every new Community screen. This block is the ten screens of the
// navigation/profile lane; the block above is the programme/compose lane.
// Each is pushed into HomeStack with its own params, so they are mounted
// here rather than added to SCREENS_TO_SWEEP (which mounts param-less tab
// roots). Every Community read goes through the mocked Supabase client and
// therefore FAILS, which is the point: each screen must render its calm
// not-available state rather than throw.
describe('Community navigation and profile screens mount', () => {
  const NAV_CASES = [
    ['CommunityHubScreen', {}],
    ['CommunityHubScreen', { legacyPartnerCode: 'ABCD12' }],
    ['CommunityJoinScreen', {}],
    ['CommunityEditProfileScreen', {}],
    ['CommunityProfileScreen', { handle: 'rowan_lifts' }],
    ['CommunityProfileScreen', { h: 'rowan_lifts' }],
    ['CommunitySearchScreen', {}],
    ['CommunitySearchScreen', { q: 'rowan', tab: 'programmes' }],
    ['CommunityActivityScreen', {}],
    ['CommunityDimensionScreen', { kind: 'style', key: 'kettlebell', label: 'Kettlebell lifters' }],
    ['CommunityRulesScreen', {}],
    ['CommunityPrivacyScreen', {}],
    ['CommunityModerationScreen', {}],
  ];

  for (const [screenName, params] of NAV_CASES) {
    test(`${screenName} mounts with ${JSON.stringify(params)} without throwing`, async () => {
      useAppStore.setState(STATE_VARIANTS[0].state);
      const Screen = require(`../screens/${screenName}`).default;
      let tree = null;
      try {
        const { tree: t, errors } = await mountScreen(Screen, {
          route: { params, name: screenName.replace('Screen', '') },
        });
        tree = t;
        expect(tree).not.toBeNull();
        expect(errors).toEqual([]);
      } finally {
        unmountTree(tree);
      }
    });
  }

  test('every Community navigation screen survives a tap on everything it renders', async () => {
    for (const [screenName, params] of NAV_CASES) {
      useAppStore.setState(STATE_VARIANTS[0].state);
      const Screen = require(`../screens/${screenName}`).default;
      let tree = null;
      try {
        const { tree: t } = await mountScreen(Screen, {
          route: { params, name: screenName.replace('Screen', '') },
        });
        tree = t;
        // eslint-disable-next-line no-await-in-loop
        const { failures } = await bashTappables(tree);
        const real = failures.filter(f => !/getState|dispatch|navigation\.navigate|getParent/i.test(f.error));
        expect({ screenName, real }).toEqual({ screenName, real: [] });
      } finally {
        unmountTree(tree);
      }
    }
  });
});
