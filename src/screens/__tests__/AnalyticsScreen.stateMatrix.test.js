/**
 * AnalyticsScreen (Progress landing) — Campaign 23 Phase 2, Stage 3: the
 * state-matrix suite (PROGRESS-UX-SPEC.md §23, states A-P; §22 region
 * contract; §29 preservation contract; §31 test plan "state-matrix mounted
 * suite (A-P states, screen-mount conventions, as C22's stateMatrix suite)").
 *
 * MOCK SCAFFOLD: copied from src/screens/__tests__/
 * HomeScreen.stateMatrix.test.js, itself copied from src/__tests__/
 * screen-mount.test.js (the proven-working set for mounting a screen via
 * react-test-renderer; AnalyticsScreen is in that file's SCREENS_TO_SWEEP
 * and mounts there today). The one deliberate deviation from screen-mount.
 * test.js's OWN top-level mock is `useFocusEffect` actually running its
 * effect (HomeScreen's own convention) instead of screen-mount.test.js's
 * no-op `jest.fn()` — a state-matrix suite needs useProgressData/
 * useWeightTrend/useVisualPillar's loaders to genuinely run so per-state DB
 * fixtures reach the render.
 *
 * SECOND, NARROWER DEVIATION FROM HomeScreen's OWN COPY (reasoned, not
 * cosmetic): HomeScreen's mock runs the focus effect with
 * `useEffect(() => cb(), [])` — empty deps, so it fires exactly once, using
 * whichever `cb` closure existed at first render. That is safe for
 * HomeScreen because every one of its loaders' useFocusEffect callbacks
 * only ever depends on `user?.id`, which is fixed before mount. It is NOT
 * safe here: useVisualPillar's `load` depends on `suppressed`
 * (usePhotoSuppression's own fail-CLOSED contract starts `true` and only
 * resolves to `false` asynchronously, after mount), so a `[]`-deps mount
 * would call `load()` exactly once while still suppressed and never again
 * — under-testing the Visual pillar's real data path for every state. The
 * actual `@react-navigation/core` useFocusEffect
 * (node_modules/@react-navigation/core/src/useFocusEffect.tsx) depends on
 * `[effect, navigation]` and DOES re-invoke the callback whenever its
 * identity changes while focused — this file's mock is corrected to
 * `useEffect(() => cb(), [cb])` to match that real dependency array. Every
 * loader in this screen's tree memoises its focus-effect callback with
 * `useCallback` keyed on stable identifiers (`user?.id`, or `[userId, tier,
 * suppressed]` for useVisualPillar), so this fix only adds the extra
 * re-fire useVisualPillar genuinely needs; it changes no other hook's
 * observed call count.
 *
 * FIXTURE STRATEGY. `lib/database`'s real functions run against the
 * project's in-memory SQLite stub (__mocks__/expo-sqlite.js: every
 * getAllAsync/getFirstAsync call returns []/null regardless of the SQL
 * text), so a state that wants NO data needs no override at all — the real
 * production loaders naturally settle into their honest empty-state
 * outputs, wrapped in each loader's own try/catch exactly as it behaves on
 * a real device with no history. States that need populated evidence
 * monkey-patch the specific `database.<fn>` export the relevant hook calls
 * (the same live-binding pattern HomeScreen.stateMatrix.test.js documents:
 * Babel's CJS interop reads the module object at call time, so replacing
 * the exported reference reaches every caller, hook included). The Visual
 * pillar's scan data is injected the same way, one level up its producer
 * chain: `progressScanStore.getProgressScanCoachSummary` is monkey-patched
 * directly (not the raw DB rows underneath it), so `resolveProgressScanCoachNote
 * -> buildProgressScanCoachEvidence -> buildScanEvidencePacket` and finally
 * `pillars.buildVisualPillarCopy` all run for REAL on the injected scan
 * summary — only the raw-row producer at the very bottom of the chain is
 * substituted, matching useVisualPillar.js's own module header ("no new
 * scan derivation").
 *
 * WHAT EACH STATE ASSERTS (per §22/§23): the Answer Block renders with the
 * correct pillar rows and REAL copy (computed from the same fixture through
 * the actual pillars.js/deriveWeightTrend/buildVisualPillarCopy code paths,
 * never hand-invented strings unconnected to what the code would produce);
 * regions present/absent per §22's stated conditions; no retired idiom
 * renders (no "For you", no insight row, no SparkCard-shaped Sessions/New
 * PRs spark, no landing Training-load hero, no lifetime totals panel, no
 * second share CTA); the single-Moment rule (recap-only since the founder
 * device order of 2026-08-17 retired the tonnage-milestone Moment).
 * The third pillar's user-facing label is "Progress photos" (same order —
 * "Visual" was internal vocabulary); internal hook/module names keep the
 * visual-pillar terminology.
 *
 * STATES COVERED AT THE PURE-MODULE LEVEL, WITH REASONS (never silently
 * skipped, per the build brief):
 *  - J (recent programme adjustment): AnalyticsScreen has NO code path that
 *    reads a coach decision/adjustment for landing display at all (the only
 *    coach-output read left anywhere in this screen's tree is
 *    useWeightTrend's OWN stepTrendLine, which bodyPillarCopy never
 *    surfaces) — there is no "recent adjustment" branch to mount two
 *    different ways. Covered by the source guard in this file's own
 *    "state J" describe block (grep-proof of the absence) rather than a
 *    second full mount, since mounting a screen with and without a coach
 *    decision fixture would produce byte-identical renders by construction.
 *  - L (new user): shares F's exact render path (the zero-data EmptyState +
 *    immature pillar lines) — the one dimension the brief calls out
 *    (§23: "F's shape with welcome-free copy") is the EmptyState's
 *    TIER-SPECIFIC body copy, which already varies (pro vs free) inside
 *    the SAME conditional F exercises. L is therefore mounted as F's own
 *    free-tier variant (see "state F/L" describe block) rather than a
 *    separate state, and its material claim — no marketing/welcome voice
 *    on this evidence page — is pinned by asserting the exact same
 *    factual copy free-tier F already renders, with no extra "Welcome"
 *    string anywhere in the tree.
 */

// ─── Mock scaffold (verbatim from HomeScreen.stateMatrix.test.js) ─────────
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
    DAILY: 'daily', WEEKLY: 'weekly', YEARLY: 'yearly', DATE: 'date', TIME_INTERVAL: 'timeInterval', CALENDAR: 'calendar',
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
    __esModule: true,
    Svg: mk('Svg'), Path: mk('Path'), G: mk('G'), Circle: mk('Circle'),
    Rect: mk('Rect'), Line: mk('Line'), Text: mk('Text'), Defs: mk('Defs'),
    LinearGradient: mk('LinearGradient'), Stop: mk('Stop'), ClipPath: mk('ClipPath'),
    default: mk('Svg'),
  };
});

jest.mock('react-native-webview', () => {
  const React = require('react');
  return { WebView: props => React.createElement('WebView', props), default: props => React.createElement('WebView', props) };
});

jest.mock('react-native-gesture-handler', () => {
  const React = require('react');
  const passthrough = name => props => React.createElement(name, props, props.children);
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
  useFocusEffect: (cb) => { require('react').useEffect(() => cb(), [cb]); },
  useIsFocused: () => true,
  useScrollToTop: jest.fn(),
  NavigationContainer: ({ children }) => children,
  StackActions: { popToTop: jest.fn(), replace: jest.fn(), push: jest.fn() },
  CommonActions: { navigate: jest.fn(), reset: jest.fn() },
}));

jest.mock('../../components/Toast', () => {
  const React = require('react');
  return {
    useToast: () => ({ show: jest.fn(), hide: jest.fn() }),
    ToastProvider: ({ children }) => children,
    default: props => React.createElement('Toast', props),
  };
});

jest.mock('../../components/FeedbackSheet', () => {
  const React = require('react');
  return {
    useFeedback: () => ({ open: jest.fn(), close: jest.fn() }),
    FeedbackProvider: ({ children }) => children,
    default: props => React.createElement('FeedbackSheet', props),
  };
});

jest.mock('../../components/BodyDiagramHeatmap', () => {
  const React = require('react');
  return { __esModule: true, default: props => React.createElement('BodyDiagramHeatmap', props) };
});

jest.mock('../../components/GradientCard', () => {
  const React = require('react');
  return { __esModule: true, default: props => React.createElement('GradientCard', props, props.children) };
});

jest.mock('rest-timer-live', () => ({ start: jest.fn(), stop: jest.fn(), update: jest.fn() }));
jest.mock('live-activity', () => ({ start: jest.fn(), stop: jest.fn(), update: jest.fn() }));

global.__DEV__ = false;
if (typeof global.requestAnimationFrame === 'undefined') {
  global.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
  global.cancelAnimationFrame = (id) => clearTimeout(id);
}

jest.setTimeout(20_000);

const React = require('react');
const TestRenderer = require('react-test-renderer');
const useAppStore = require('../../store/useAppStore').default;
const AsyncStorage = require('@react-native-async-storage/async-storage').default;

const origConsoleError = console.error;
beforeAll(() => {
  console.error = (msg, ...rest) => {
    const text = typeof msg === 'string' ? msg : String(msg);
    if (/wrap.*act|environment has been torn down|Cannot log after tests|Each child in a list|react-test-renderer is deprecated/i.test(text)) return;
    origConsoleError(msg, ...rest);
  };
});
afterAll(() => { console.error = origConsoleError; });

function makeNav() {
  const nav = {
    navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn(), push: jest.fn(), pop: jest.fn(),
    popToTop: jest.fn(), reset: jest.fn(), setOptions: jest.fn(), setParams: jest.fn(), dispatch: jest.fn(),
    addListener: jest.fn(() => () => {}), removeListener: jest.fn(), canGoBack: jest.fn(() => true),
    isFocused: jest.fn(() => true), getId: jest.fn(() => 'test-route'), getState: jest.fn(() => ({ routes: [], index: 0 })),
  };
  nav.getParent = jest.fn(() => nav);
  return nav;
}

let currentTree = null;

async function mountAnalytics(props = {}) {
  const errors = [];
  const origErr = console.error;
  console.error = (msg) => {
    const text = typeof msg === 'string' ? msg : String(msg);
    if (/wrap.*act|environment has been torn down|Cannot log after tests|Each child in a list|Function components cannot be given refs|forwardRef|inside StrictMode|react-test-renderer is deprecated/i.test(text)) return;
    errors.push(text);
  };
  const AnalyticsScreen = require('../AnalyticsScreen').default;
  let tree = null;
  try {
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        React.createElement(AnalyticsScreen, { navigation: makeNav(), route: { params: {}, name: 'Test' }, ...props }),
      );
    });
    await TestRenderer.act(async () => {
      for (let i = 0; i < 25; i++) await Promise.resolve();
      await new Promise(r => setImmediate(r));
      for (let i = 0; i < 20; i++) await Promise.resolve();
    });
  } finally {
    console.error = origErr;
  }
  currentTree = tree;
  return { tree, errors };
}

afterEach(() => {
  if (currentTree) {
    try { TestRenderer.act(() => { currentTree.unmount(); }); } catch (_) {}
    currentTree = null;
  }
});

// ─── Tree helpers ───────────────────────────────────────────────────────────

function flattenText(tree) {
  const out = [];
  (function visit(node) {
    if (node == null) return;
    if (typeof node === 'string' || typeof node === 'number') { out.push(String(node)); return; }
    const c = node.children;
    if (Array.isArray(c)) c.forEach(visit); else if (c) visit(c);
  })(tree.toJSON());
  return out.join(' ');
}

function findByLabel(tree, matcher) {
  const test = matcher instanceof RegExp ? (l) => matcher.test(l)
    : typeof matcher === 'function' ? matcher
    : (l) => l === matcher;
  return tree.root.findAll((n) => typeof n.type === 'string' && typeof n.props?.accessibilityLabel === 'string' && test(n.props.accessibilityLabel));
}

function pillarRow(tree, label) {
  return findByLabel(tree, new RegExp(`^${label}\\.`));
}

// ─── Fixture builders ───────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.now();

function daysAgo(n, hourOffset = 0) { return NOW - n * DAY_MS + hourOffset * 3600000; }

function workout(id, { daysAgoN = 1, durationMinutes = 45, sessionDifficulty = null, isCompleted = true } = {}) {
  const at = daysAgo(daysAgoN);
  return {
    id, userId: 'u1', name: `Session ${id}`, startedAt: at, endedAt: at + durationMinutes * 60000,
    isCompleted, durationMinutes, sessionDifficulty,
  };
}

function completedSet({ id, workoutId, exerciseId, weight = 100, reps = 5, setType = 'straight', daysAgoN = 1, hourOffset = 0 }) {
  return {
    id, workoutId, exerciseId, weight, actualReps: reps, setType,
    createdAt: daysAgo(daysAgoN, hourOffset),
  };
}

function exercise(id, { name, primaryMuscle = 'chest', type = 'weight_reps', equipment = 'Barbell' } = {}) {
  return { id, name, primaryMuscle, type, exerciseType: type, equipment };
}

// A 20-entry morning-weight history (daily, last 20 days), so
// deriveWeightTrend lands in state 3 (n>=14, <42): "full interpretation"
// (showRate: true). `startKg`/`endKg` control the direction the fixture
// tests distinguish (B: flat -> weeklyChange ~0; C: clearly moving).
function morningWeights(startKg, endKg) {
  const out = [];
  for (let i = 19; i >= 0; i--) {
    const frac = (19 - i) / 19;
    out.push({ weightKg: startKg + (endKg - startKg) * frac, loggedAt: daysAgo(i) });
  }
  return out;
}

function scanSummary({
  confidence = 'moderate', comparisonStatus = 'comparable', trendDirection = 'down',
  comparableCount = 4, capturedAt = NOW - 2 * DAY_MS, trendMagnitudePctPoints = null,
} = {}) {
  return {
    source: 'photo_scan',
    capturedAt,
    confidence,
    leannessBand: 'lean',
    leannessBandLabel: 'Lean',
    progressSignal: null,
    trendDirection,
    trendMagnitudePctPoints,
    comparisonStatus,
    comparableCount,
    limitations: [],
  };
}

// ─── DB / lib fixture harness (HomeScreen.stateMatrix.test.js convention:
// monkey-patch the real module's exported functions, restore in afterEach)
// ─────────────────────────────────────────────────────────────────────────

const database = require('../../lib/database');
const progressScanStore = require('../../lib/progressScanStore');

let dbOriginals = null;
let scanOriginal = null;

function applyFixture({ db = {}, scan = undefined } = {}) {
  dbOriginals = {};
  for (const key of Object.keys(db)) {
    dbOriginals[key] = database[key];
    database[key] = db[key];
  }
  if (scan !== undefined) {
    scanOriginal = progressScanStore.getProgressScanCoachSummary;
    progressScanStore.getProgressScanCoachSummary = jest.fn(() => Promise.resolve(scan));
  }
}

function restoreFixture() {
  if (dbOriginals) { for (const k of Object.keys(dbOriginals)) database[k] = dbOriginals[k]; dbOriginals = null; }
  if (scanOriginal) { progressScanStore.getProgressScanCoachSummary = scanOriginal; scanOriginal = null; }
}

afterEach(async () => {
  restoreFixture();
  await AsyncStorage.clear();
});

const PRO_USER = {
  user: { id: 'u1', email: 't@e.com', isLocal: false },
  session: { user: { id: 'u1' } },
  tier: 'pro',
  firstRunComplete: true,
  userProfile: { firstName: 'Alex' },
  units: 'metric',
  bodyWeightUnits: 'kg',
};
const FREE_USER = { ...PRO_USER, tier: 'free' };

// A shared "rich" exercise map (three weight_reps lifts) reused by every
// state that needs Training pillar evidence.
const EXERCISES = () => Promise.resolve([
  exercise('e1', { name: 'Bench press', primaryMuscle: 'chest' }),
  exercise('e2', { name: 'Back squat', primaryMuscle: 'quads' }),
  exercise('e3', { name: 'Deadlift', primaryMuscle: 'hamstrings' }),
  exercise('e4', { name: 'Overhead press', primaryMuscle: 'front_delts' }),
]);

// Training pillar improving across three lifts within the trailing month,
// with the most recent best dated TODAY (daysAgoN: 0) so it is guaranteed to
// fall inside the CURRENT Monday-anchored week regardless of which weekday
// the suite runs on (localWeekStartMs(now) <= today by definition) -- R4's
// volume strip and R3's "this week" line are simultaneously exercised
// without depending on the day of the week the CI runs.
function improvingTrainingSets() {
  return Promise.resolve([
    // e1: baseline 25 days ago, improved today (most recent named best)
    completedSet({ id: 's1', workoutId: 'w1', exerciseId: 'e1', weight: 80, reps: 5, daysAgoN: 25 }),
    completedSet({ id: 's2', workoutId: 'w3', exerciseId: 'e1', weight: 85, reps: 5, daysAgoN: 0 }),
    // e2: baseline 20 days ago, improved 10 days ago
    completedSet({ id: 's3', workoutId: 'w2', exerciseId: 'e2', weight: 100, reps: 5, daysAgoN: 20 }),
    completedSet({ id: 's4', workoutId: 'w2', exerciseId: 'e2', weight: 110, reps: 5, daysAgoN: 10 }),
    // e3: trained, no improvement this window (holds the baseline)
    completedSet({ id: 's5', workoutId: 'w1', exerciseId: 'e3', weight: 140, reps: 3, daysAgoN: 25 }),
    completedSet({ id: 's6', workoutId: 'w3', exerciseId: 'e3', weight: 130, reps: 3, daysAgoN: 0 }),
  ]);
}

function threeWorkouts() {
  return Promise.resolve([
    workout('w1', { daysAgoN: 25 }),
    workout('w2', { daysAgoN: 10 }),
    workout('w3', { daysAgoN: 0, sessionDifficulty: 6 }),
  ]);
}

// ─── State A — established Pro, all progressing, photos current ──────────
describe('State matrix — A: established Pro, all progressing, photos current', () => {
  test('all three pillars render positive real evidence; R3/R4/R6 all present; no retired idiom', async () => {
    useAppStore.setState(PRO_USER);
    applyFixture({
      db: {
        getAllWorkouts: threeWorkouts,
        getCompletedWorkoutSets: improvingTrainingSets,
        getAllExercises: EXERCISES,
        getMorningWeights: () => Promise.resolve(morningWeights(85, 80)), // clearly moving
      },
      scan: scanSummary({ trendDirection: 'down', confidence: 'moderate', comparableCount: 4 }),
    });
    const { tree, errors } = await mountAnalytics({});
    expect(errors).toEqual([]);

    // Training pillar: real computeTrainingPillarSummary output — 2 of 3
    // lifts improved this month, most recent named best is e1 @ 85kg x 5.
    const training = pillarRow(tree, 'Training');
    expect(training.length).toBe(1);
    expect(training[0].props.accessibilityLabel).toBe('Training. Strength up on 2 of 3 lifts this month. Bench press 85 kg x 5, new best');

    // Body pillar: state 3 (20 entries), the real !hasComparison branch.
    const body = pillarRow(tree, 'Body');
    expect(body.length).toBe(1);
    expect(body[0].props.accessibilityLabel).toMatch(/^Body\. Your smoothed weight trend is updated\./);
    expect(body[0].props.accessibilityLabel).toMatch(/kg/);

    // Visual pillar: eligible, real buildVisualPillarCopy string.
    const visual = pillarRow(tree, 'Progress photos');
    expect(visual.length).toBe(1);
    expect(visual[0].props.accessibilityLabel).toBe('Progress photos. Visible change. Leaner across your last 4 comparable scans, moderate confidence.');

    // R3 evidence trail
    expect(flattenText(tree)).toContain('Recent sessions');
    expect(flattenText(tree)).toMatch(/\d\s+sessions?\s+this week/);
    // R4 plan evidence (a set landed inside the current Monday-anchored week)
    expect(flattenText(tree)).toContain("This week's volume");
    // R6 utilities. Body Metrics and Lifts were removed from this grid as
    // duplicates of the Answer Block's pillar rows above (Body ->
    // BodyMetrics, Training -> LiftProgress), so Consistency now stands in
    // for "the utilities grid renders".
    expect(flattenText(tree)).toContain('Consistency');
    // The Partners tile was REMOVED from this grid with no replacement
    // (social-discovery blueprint section 1, entry point 4: "Community is
    // not a stat"), so "Full history" is the second grid tile this state
    // pins now.
    expect(flattenText(tree)).toContain('Full history');
    expect(flattenText(tree)).not.toContain('Partners');

    // Retired idioms never render on the landing.
    expect(flattenText(tree)).not.toMatch(/For you/i);
    expect(flattenText(tree)).not.toContain('New PRs');
    expect(flattenText(tree)).not.toContain('Training load');
    expect(flattenText(tree)).not.toContain('Lifetime total');
    // Founder device order 2026-08-17: the tonnage-milestone Moment (and
    // with it the landing's only share CTA) is retired — zero share CTAs.
    expect(findByLabel(tree, 'Create share image').length).toBe(0);
  });
});

// ─── State B — training up, weight stalled ────────────────────────────────
describe('State matrix — B: training up, weight stalled', () => {
  test('Training pillar positive; Body pillar states a near-zero rate, no instruction', async () => {
    useAppStore.setState(PRO_USER);
    applyFixture({
      db: {
        getAllWorkouts: threeWorkouts,
        getCompletedWorkoutSets: improvingTrainingSets,
        getAllExercises: EXERCISES,
        getMorningWeights: () => Promise.resolve(morningWeights(82, 82)), // flat
      },
      scan: null,
    });
    const { tree, errors } = await mountAnalytics({});
    expect(errors).toEqual([]);
    const training = pillarRow(tree, 'Training');
    expect(training[0].props.accessibilityLabel).toMatch(/^Training\. Strength up on \d of \d lifts this month/);
    const body = pillarRow(tree, 'Body');
    expect(body[0].props.accessibilityLabel).toMatch(/^Body\. Your smoothed weight trend is updated\./);
    // No instruction/imperative anywhere in the Body pillar's copy.
    expect(body[0].props.accessibilityLabel).not.toMatch(/add|reduce|increase|decrease|deload/i);
  });
});

// ─── State C — weight moving, training stalled ────────────────────────────
describe('State matrix — C: weight moving, training stalled', () => {
  test('Training pillar states "holding steady"; Body pillar shows a real moving rate', async () => {
    useAppStore.setState(PRO_USER);
    applyFixture({
      db: {
        getAllWorkouts: () => Promise.resolve([workout('w1', { daysAgoN: 3 })]),
        // Only ever-baseline exposures inside the window: trained, never improved.
        getCompletedWorkoutSets: () => Promise.resolve([
          completedSet({ id: 's1', workoutId: 'w1', exerciseId: 'e1', weight: 80, reps: 5, daysAgoN: 3 }),
        ]),
        getAllExercises: EXERCISES,
        getMorningWeights: () => Promise.resolve(morningWeights(85, 78)),
      },
      scan: null,
    });
    const { tree, errors } = await mountAnalytics({});
    expect(errors).toEqual([]);
    const training = pillarRow(tree, 'Training');
    expect(training[0].props.accessibilityLabel).toBe('Training. No new bests this month, holding steady. Keep training to build your evidence trail.');
    const body = pillarRow(tree, 'Body');
    expect(body[0].props.accessibilityLabel).toMatch(/kg\/week/);
  });
});

// ─── State D — both progressing (as A, without photo recency) ────────────
describe('State matrix — D: both training and weight progressing; Visual pillar not yet eligible (no fresh comparison)', () => {
  test('Training + Body pillars both positive; Visual pillar shows the honest immature state, not a "new" claim', async () => {
    useAppStore.setState(PRO_USER);
    applyFixture({
      db: {
        getAllWorkouts: threeWorkouts,
        getCompletedWorkoutSets: improvingTrainingSets,
        getAllExercises: EXERCISES,
        getMorningWeights: () => Promise.resolve(morningWeights(85, 80)),
      },
      // A real scan exists (distinguishing D from G's "no photo history"),
      // but with fewer than 3 comparable points -- baseline/thin-window,
      // never eligible for a comparison claim (mirrors pillars.test.js's own
      // "not yet eligible" case, exercised here through the full producer
      // chain instead of calling buildVisualPillarCopy directly).
      scan: scanSummary({ comparisonStatus: 'comparable', comparableCount: 1, confidence: 'moderate' }),
    });
    const { tree, errors } = await mountAnalytics({});
    expect(errors).toEqual([]);
    const training = pillarRow(tree, 'Training');
    expect(training[0].props.accessibilityLabel).toMatch(/^Training\. Strength up on \d of \d lifts this month/);
    const body = pillarRow(tree, 'Body');
    expect(body[0].props.accessibilityLabel).toMatch(/^Body\. Your smoothed weight trend is updated\./);
    const visual = pillarRow(tree, 'Progress photos');
    expect(visual[0].props.accessibilityLabel).toBe('Progress photos. Building your visual trend. 2 more comparable scans until your first assessment.');
    expect(visual[0].props.accessibilityLabel).not.toMatch(/visible change/i);
  });
});

// ─── State E — neither clearly progressing ────────────────────────────────
describe('State matrix — E: neither training nor weight moving clearly', () => {
  test('both pillars state neutral evidence honestly; no manufactured positivity, no advice', async () => {
    useAppStore.setState(PRO_USER);
    applyFixture({
      db: {
        getAllWorkouts: () => Promise.resolve([workout('w1', { daysAgoN: 2 })]),
        getCompletedWorkoutSets: () => Promise.resolve([
          completedSet({ id: 's1', workoutId: 'w1', exerciseId: 'e1', weight: 80, reps: 5, daysAgoN: 2 }),
        ]),
        getAllExercises: EXERCISES,
        // Fewer than 7 entries, all within the trailing 14 days (the most
        // RECENT 4 of the 20-entry helper, not the oldest) -> deriveWeightTrend
        // state 1, the honest "too little data to interpret" line (neutral,
        // not negative).
        getMorningWeights: () => Promise.resolve(morningWeights(80, 80).slice(-4)),
      },
      scan: null,
    });
    const { tree, errors } = await mountAnalytics({});
    expect(errors).toEqual([]);
    const training = pillarRow(tree, 'Training');
    expect(training[0].props.accessibilityLabel).toBe('Training. No new bests this month, holding steady. Keep training to build your evidence trail.');
    const body = pillarRow(tree, 'Body');
    expect(body[0].props.accessibilityLabel).toContain('Log your weight for 7 days and your trend appears here.');
    expect(flattenText(tree)).not.toMatch(/add (a |two )?(sets?|weight)/i);
  });
});

// ─── State F/L — insufficient data (Pro) / new user (Free) ───────────────
describe('State matrix — F/L: zero-data (lead ruling: immature pillar lines AND the page EmptyState coexist)', () => {
  test('F (Pro, zero data): Answer Block immature lines render TOGETHER WITH the page EmptyState', async () => {
    useAppStore.setState(PRO_USER);
    // No overrides at all: the real, unmodified production loaders run
    // against the empty in-memory SQLite stub and settle honestly.
    const { tree, errors } = await mountAnalytics({});
    expect(errors).toEqual([]);
    const training = pillarRow(tree, 'Training');
    expect(training[0].props.accessibilityLabel).toBe('Training. No sessions logged yet. Log your first session to start your training evidence.');
    const body = pillarRow(tree, 'Body');
    expect(body[0].props.accessibilityLabel).toContain('No weigh-ins logged yet');
    const visual = pillarRow(tree, 'Progress photos');
    expect(visual[0].props.accessibilityLabel).toBe('Progress photos. No photos yet. Take your first progress photos to start tracking visible change.');
    // Deliberately BOTH render (lead ruling, §23 state F):
    expect(flattenText(tree)).toContain('No training trends yet');
    expect(flattenText(tree)).toContain('Training charts appear here once sessions are logged. Body metrics, progress photos and scans are still available below.');
  });

  // FOUNDER DECISION (fully free, no tier split): the Free-tier EmptyState
  // copy fork is retired -- every account reads the same sentence (state F's
  // copy) now, whatever the store's `tier` field says.
  test('L (zero data / new user): same factual shape and copy as state F, no marketing/welcome voice', async () => {
    useAppStore.setState(FREE_USER);
    const { tree, errors } = await mountAnalytics({});
    expect(errors).toEqual([]);
    const training = pillarRow(tree, 'Training');
    expect(training[0].props.accessibilityLabel).toBe('Training. No sessions logged yet. Log your first session to start your training evidence.');
    expect(flattenText(tree)).toContain('Training charts appear here once sessions are logged. Body metrics, progress photos and scans are still available below.');
    expect(flattenText(tree)).not.toMatch(/welcome/i);
    expect(flattenText(tree)).not.toMatch(/get started/i);
  });
});

// ─── State G — no photo history ───────────────────────────────────────────
describe('State matrix — G: Pro, training/body evidence present, no photo history', () => {
  test('Visual pillar shows the honest empty state + one action, not "Part of Pro"', async () => {
    useAppStore.setState(PRO_USER);
    applyFixture({
      db: {
        getAllWorkouts: threeWorkouts,
        getCompletedWorkoutSets: improvingTrainingSets,
        getAllExercises: EXERCISES,
        getMorningWeights: () => Promise.resolve(morningWeights(85, 80)),
      },
      scan: null, // getProgressScanCoachSummary resolves null -> hasScan false
    });
    const { tree, errors } = await mountAnalytics({});
    expect(errors).toEqual([]);
    const visual = pillarRow(tree, 'Progress photos');
    expect(visual.length).toBe(1);
    expect(visual[0].props.accessibilityLabel).toBe('Progress photos. No photos yet. Take your first progress photos to start tracking visible change.');
    expect(visual[0].props.accessibilityLabel).not.toMatch(/Part of Pro/);
  });
});

// ─── State H — new scan / visible change available ────────────────────────
describe('State matrix — H: Visual pillar leads with a new comparison status', () => {
  test('eligible scan renders the real "Visible change" copy from the shared producer chain', async () => {
    useAppStore.setState(PRO_USER);
    applyFixture({
      db: {
        getAllWorkouts: () => Promise.resolve([]),
        getCompletedWorkoutSets: () => Promise.resolve([]),
        getAllExercises: EXERCISES,
      },
      scan: scanSummary({ trendDirection: 'up', confidence: 'high', comparableCount: 5 }),
    });
    const { tree, errors } = await mountAnalytics({});
    expect(errors).toEqual([]);
    const visual = pillarRow(tree, 'Progress photos');
    expect(visual[0].props.accessibilityLabel).toBe('Progress photos. Visible change. Fuller across your last 5 comparable scans, high confidence.');
  });
});

// ─── State I — recovery week (structural): NO deload/recovery advisory ────
describe('State matrix — I: recovery week active (isDeload true)', () => {
  test('landing never renders a deload/recovery advisory; volume strip renders against the underlying data as-is', async () => {
    useAppStore.setState(PRO_USER);
    applyFixture({
      db: {
        getAllWorkouts: threeWorkouts,
        getCompletedWorkoutSets: improvingTrainingSets,
        getAllExercises: EXERCISES,
        getCurrentMesocycleWeek: () => Promise.resolve({ id: 'mw1', weekIndex: 6, plannedWeeks: 6, isDeload: true }),
      },
      scan: null,
    });
    const { tree, errors } = await mountAnalytics({});
    expect(errors).toEqual([]);
    const txt = flattenText(tree);
    expect(txt).not.toMatch(/recovery week/i);
    expect(txt).not.toMatch(/deload/i);
    expect(txt).not.toMatch(/lighter week/i);
    // The volume strip still renders (this week's sets exist in the fixture).
    expect(txt).toContain("This week's volume");
  });
});

// ─── State J — recent programme adjustment (pure/source-level; see header) ─
describe('State matrix — J: recent programme adjustment (source guard — see file header rationale)', () => {
  test('AnalyticsScreen reads no coach-decision/adjustment data for landing display', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.resolve(__dirname, '../AnalyticsScreen.js'), 'utf8');
    expect(src).not.toMatch(/getLatestCoachOutput/);
    expect(src).not.toMatch(/coachDecision/i);
    expect(src).not.toMatch(/adjustments\./);
    expect(src).not.toMatch(/awaitingDecision/);
  });
});

// ─── State K — retired: FOUNDER DECISION (fully free, no tier split) ─────
// The Body/Visual "Part of Pro" locked pillar affordance is retired --
// PillarRow no longer has a proGated variant at all, so there is no
// Free-locked state left to test. Every account now reads real Body/Visual
// evidence exactly like the Pro states (A-J) already cover.
describe('State matrix — K: no pillar is ever shown locked, whatever the store\'s tier field says', () => {
  test('Body and Progress photos never render "Part of Pro"', async () => {
    useAppStore.setState(FREE_USER);
    applyFixture({
      db: {
        getAllWorkouts: threeWorkouts,
        getCompletedWorkoutSets: improvingTrainingSets,
        getAllExercises: EXERCISES,
      },
      scan: scanSummary({}),
    });
    const { tree, errors } = await mountAnalytics({});
    expect(errors).toEqual([]);
    const training = pillarRow(tree, 'Training');
    expect(training[0].props.accessibilityLabel).toMatch(/^Training\. Strength up on \d of \d lifts this month/);
    expect(flattenText(tree)).not.toMatch(/Part of Pro/);
    expect(flattenText(tree)).toContain('Recent sessions');
    expect(flattenText(tree)).toContain('Consistency');
  });
});

// ─── State M — legacy accumulated insight rows in the DB ─────────────────
describe('State matrix — M: legacy user_insights backlog exists in the DB, landing renders none', () => {
  test('a populated user_insights read still produces zero insight rendering on the landing', async () => {
    // __mocks__/expo-sqlite.js is a shape-only stub (getAllAsync/getFirstAsync
    // always resolve []/null regardless of prior runAsync calls) -- it does
    // not implement real SQL persistence, so a genuine round-trip write via
    // database.persistInsights() cannot be observed back through
    // database.getActiveInsights() in this test environment (verified: it
    // resolves empty even immediately after a real persistInsights() call).
    // The state under test -- "the table may hold rows; the landing must
    // still render none" -- is instead proven by overriding
    // getActiveInsights() itself to return a populated legacy backlog (the
    // same shape database.js's own runInsightsEngine would have persisted),
    // and confirming AnalyticsScreen/useProgressData never call it at all:
    // no override on this screen's own data path can make retired content
    // appear, because nothing on the landing ever reads this function.
    useAppStore.setState(PRO_USER);
    const legacyBacklog = [
      { id: 'i1', type: 'stalled_lift', title: 'Bench press', body: 'Your bench press has stalled.', severity: 2 },
      { id: 'i2', type: 'peaked_lift', title: 'Squat', body: 'Time to add a little weight next session.', severity: 1 },
    ];
    applyFixture({
      db: {
        getAllWorkouts: threeWorkouts,
        getCompletedWorkoutSets: improvingTrainingSets,
        getAllExercises: EXERCISES,
        getActiveInsights: jest.fn(() => Promise.resolve(legacyBacklog)),
      },
    });
    // The backlog is real and readable through the DB API...
    const rows = await database.getActiveInsights('u1', 3);
    expect(rows).toEqual(legacyBacklog);
    database.getActiveInsights.mockClear(); // isolate the mount's own calls
    // ...but the mounted landing never renders it, and never even asks.
    const { tree, errors } = await mountAnalytics({});
    expect(errors).toEqual([]);
    const txt = flattenText(tree);
    expect(txt).not.toContain('stalled');
    expect(txt).not.toContain('Time to add a little weight next session.');
    expect(txt).not.toMatch(/for you/i);
    expect(database.getActiveInsights).not.toHaveBeenCalled();
  });
});

// ─── State N — multiple PR/progression events in one window ──────────────
describe('State matrix — N: multiple PR events; only the best 2-3 are named, the rest live in LiftProgress', () => {
  test('improvedCount exceeds the named-best cap; the pillar row still shows exactly ONE evidence line', async () => {
    useAppStore.setState(PRO_USER);
    applyFixture({
      db: {
        getAllWorkouts: () => Promise.resolve([workout('w1', { daysAgoN: 1 })]),
        getCompletedWorkoutSets: () => Promise.resolve([
          completedSet({ id: 's1', workoutId: 'w0', exerciseId: 'e1', weight: 70, reps: 5, daysAgoN: 25 }),
          completedSet({ id: 's2', workoutId: 'w1', exerciseId: 'e1', weight: 80, reps: 5, daysAgoN: 8 }),
          completedSet({ id: 's3', workoutId: 'w0', exerciseId: 'e2', weight: 90, reps: 5, daysAgoN: 24 }),
          completedSet({ id: 's4', workoutId: 'w1', exerciseId: 'e2', weight: 100, reps: 5, daysAgoN: 6 }),
          completedSet({ id: 's5', workoutId: 'w0', exerciseId: 'e3', weight: 120, reps: 3, daysAgoN: 23 }),
          completedSet({ id: 's6', workoutId: 'w1', exerciseId: 'e3', weight: 130, reps: 3, daysAgoN: 4 }),
          completedSet({ id: 's7', workoutId: 'w0', exerciseId: 'e4', weight: 40, reps: 6, daysAgoN: 22 }),
          completedSet({ id: 's8', workoutId: 'w1', exerciseId: 'e4', weight: 45, reps: 6, daysAgoN: 1 }),
        ]),
        getAllExercises: EXERCISES,
      },
    });
    const { tree, errors } = await mountAnalytics({});
    expect(errors).toEqual([]);
    const training = pillarRow(tree, 'Training');
    expect(training[0].props.accessibilityLabel).toMatch(/^Training\. Strength up on 4 of 4 lifts this month\./);
    // Exactly one named-best evidence line, the most recent (e4).
    expect(training[0].props.accessibilityLabel).toBe('Training. Strength up on 4 of 4 lifts this month. Overhead press 45 kg x 6, new best');
  });
});

// ─── State O — lb-unit user ────────────────────────────────────────────────
describe('State matrix — O: lb-unit user, unit strings correct throughout', () => {
  test('Training pillar shows lbs; Body pillar weight AND rate show lbs (single-system, §15)', async () => {
    useAppStore.setState({ ...PRO_USER, units: 'lbs', bodyWeightUnits: 'lbs' });
    applyFixture({
      db: {
        getAllWorkouts: threeWorkouts,
        getCompletedWorkoutSets: improvingTrainingSets,
        getAllExercises: EXERCISES,
        getMorningWeights: () => Promise.resolve(morningWeights(85, 80)),
      },
    });
    const { tree, errors } = await mountAnalytics({});
    expect(errors).toEqual([]);
    const training = pillarRow(tree, 'Training');
    expect(training[0].props.accessibilityLabel).toMatch(/85 lbs x 5/);
    expect(training[0].props.accessibilityLabel).not.toMatch(/\bkg\b/);
    const body = pillarRow(tree, 'Body');
    // The EWMA weight figure correctly follows bodyWeightUnits (formatBodyWeight).
    expect(body[0].props.accessibilityLabel).toMatch(/lbs/);
    // RE-PINNED at the Stage 3 lead review: the agent's matrix surfaced the
    // hard-coded 'kg/week' rate suffix as a §15 violation (an lbs-unit
    // user's Body row read "178 lbs, -1.8 kg/week" -- two unit systems on
    // one evidence row) and pinned the observed defect. FIXED hands-on the
    // same session: bodyPillarCopy now formats the rate through
    // formatBodyWeightRate (units.js) -- lbs for lbs AND stone users (the
    // stone system's own sub-unit for small changes), kg for kg users.
    // WeightTrendCard.js's sibling hard-coded literal (BodyMetrics detail
    // surface, off this landing) is on record in the campaign notes, not
    // fixed here (touch only what the task requires).
    expect(body[0].props.accessibilityLabel).toMatch(/lbs\/week/);
    expect(body[0].props.accessibilityLabel).not.toMatch(/kg\/week/);
  });
});

// ─── State P — no recent sessions ─────────────────────────────────────────
describe('State matrix — P: no recent sessions, factual gap statement, no shame, no instruction', () => {
  test('Training pillar states the gap; R3 evidence trail collapses (no sessions to list)', async () => {
    useAppStore.setState(PRO_USER);
    applyFixture({
      db: {
        // A workout exists (so completedWorkoutCount > 0) but every set is
        // old enough that the trailing-30-day window contains nothing.
        getAllWorkouts: () => Promise.resolve([workout('w1', { daysAgoN: 60 })]),
        getCompletedWorkoutSets: () => Promise.resolve([
          completedSet({ id: 's1', workoutId: 'w1', exerciseId: 'e1', weight: 80, reps: 5, daysAgoN: 60 }),
        ]),
        getAllExercises: EXERCISES,
      },
    });
    const { tree, errors } = await mountAnalytics({});
    expect(errors).toEqual([]);
    const training = pillarRow(tree, 'Training');
    expect(training[0].props.accessibilityLabel).toBe('Training. No sessions in the last 60 days');
    expect(training[0].props.accessibilityLabel).not.toMatch(/shame|lazy|missed|should/i);
    // Recent sessions ARE present in useProgressData (last 3 completed
    // workouts regardless of window) -- R3 is conditioned on
    // recentSessions.length, not the 30-day training window, so the old
    // session still lists; the pillar's OWN 30-day gap statement is the
    // state under test here, not R3's visibility rule.
    expect(flattenText(tree)).toContain('Recent sessions');
  });
});
