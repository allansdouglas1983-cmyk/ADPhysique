import 'react-native-gesture-handler';
import 'react-native-url-polyfill/auto';
import React, { useState, useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as Font from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
// D24 item 2 (design/UX leveling slate, 2026-07-10): @gorhom/bottom-sheet
// adoption behind src/components/BottomSheet.js. BottomSheetModalProvider
// hosts the portal every BottomSheet.js instance presents into — it must be
// an ancestor of any screen that renders one, so it sits at the app root,
// inside GestureHandlerRootView (the library's own requirement) and above
// everything else. No screen needs to know it exists.
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
// Campaign item 14 (D25): react-native-keyboard-controller. KeyboardProvider
// must be an ancestor of every screen that uses the library's components
// (KeyboardAwareScrollView, KeyboardAvoidingView, KeyboardGestureArea) —
// sits at the app root next to BottomSheetModalProvider, inside
// GestureHandlerRootView. Sheet TextFields keep using BottomSheetTextInput
// (unaffected by this provider); this complements that fix outside sheets.
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Linking, Alert, AppState, Platform, AccessibilityInfo } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import { ensureNotifChannels } from './src/lib/notifications/channels';
import { installGlobalHandlers, logError } from './src/lib/errorLog';
import { loadMealLabelOverrides } from './src/lib/food/mealSlots';
import { captureFirstTouch, warmFirstTouch } from './src/lib/attribution';

// Campaign item 15 (D25): keep the native splash on screen past its default
// autohide-on-first-render point so it can fade smoothly into the app instead
// of cutting hard into the pre-theme placeholder below. Both calls are
// best-effort and run as early as possible (module scope, before anything
// else) — if the native module isn't linked in a given build the OS just
// falls back to its normal instant-hide behaviour, so this can never leave
// the splash stuck or blank the app.
SplashScreen.preventAutoHideAsync().catch(() => {});
try {
  SplashScreen.setOptions({ fade: true, duration: 400 });
} catch (_) { /* older/newer native module mismatch — falls back to an instant hide */ }

// Install verbose error logging — ring buffer in AsyncStorage, viewable from
// Settings → Debug logs. Catches uncaught exceptions and unhandled promise
// rejections. Coexists with the legacy single-slot crash log used by the
// LoginScreen banner.
installGlobalHandlers();

// Initialise Sentry as early as possible so any startup error is
// captured. No-op if @sentry/react-native isn't installed yet or the
// EXPO_PUBLIC_SENTRY_DSN env var isn't set — safe to ship before
// you've added the SDK.
{
  // eslint-disable-next-line global-require
  const { initSentry } = require('./src/lib/sentry');
  // release + dist are auto-detected by the SDK to match the source maps the
  // Expo Sentry plugin uploads at build. A manual release with no dist left
  // prod stack traces minified; see the note in src/lib/sentry.js.
  initSentry({});
}

// Store billing wiring (Free / Pro model). Lazy-loads
// react-native-iap; no-ops cleanly if the native module isn't linked
// in this build. Safe to call at module scope — listeners are
// registered inside initialise() once an authenticated user is known
// (RootNavigator triggers initialise after sign-in).
{
  // eslint-disable-next-line global-require
  const { tryWireRealProvider } = require('./src/lib/payments/playBilling');
  tryWireRealProvider();
}

// ---------------------------------------------------------------------------
// Background task — keeps the JS thread alive during rest periods on iOS so
// the timer does not freeze when the screen is locked.
// Must be defined at module scope (before any React components render).
// ---------------------------------------------------------------------------
const VOLYUME_REST_TIMER_KEEPALIVE = 'VOLYUME_REST_TIMER_KEEPALIVE';

TaskManager.defineTask(VOLYUME_REST_TIMER_KEEPALIVE, () => {
  // No-op: the act of waking the JS thread is what matters.
  // Return NEW_DATA so iOS schedules the next fetch promptly.
  return TaskManager.TaskManagerTaskBody
    ? TaskManager.TaskManagerTaskBody.NEW_DATA
    : 'newData';
});

// ---------------------------------------------------------------------------
// Daily background cloud sync — runs whenever the OS gives us a quiet
// moment (Android typically batches background fetches to coincide with
// existing wake-ups; iOS schedules opportunistically). Target frequency
// is ~12h so we get roughly one nightly catch-up plus a midday backup.
// If the user is offline at fetch time the task returns NoData and the
// next foreground sync (App.js useEffect below) picks things up.
// ---------------------------------------------------------------------------
const VOLYUME_DAILY_SYNC = 'VOLYUME_DAILY_SYNC';

TaskManager.defineTask(VOLYUME_DAILY_SYNC, async () => {
  try {
    // eslint-disable-next-line global-require
    const { getSupabaseClient: getSb } = require('./src/lib/supabase');
    // AC-02 (Codex audit, 2026-07-12): route the periodic background trigger
    // through syncAll, not bulkUploadLocalData directly. SYNC_ARCHITECTURE_
    // LOCKED.md requires all four triggers to go through the runner so the
    // Article 9 health-consent + sign-out-wipe gate applies; a direct
    // bulkUploadLocalData call in this headless task uploaded health data with
    // no consent check. syncAll fails closed when consent can't be proven.
    // eslint-disable-next-line global-require
    const { syncAll } = require('./src/lib/sync');
    const sb = getSb();
    if (!sb) return 'noData';
    const { data: { session } } = await sb.auth.getSession();
    const supabaseUserId = session?.user?.id;
    if (!supabaseUserId) return 'noData';
    // Local user id is whatever Supabase gave us once they signed in.
    await syncAll({ userId: supabaseUserId, localUserId: supabaseUserId, triggeredBy: 'periodic' });
    return 'newData';
  } catch (e) {
    try { logError('VOLYUME_DAILY_SYNC', e); } catch (_) {}
    return 'failed';
  }
});

// Suppress foreground notification banners — the rest timer handles in-app alerts with haptics.
// The rest-done channel fires when the app is backgrounded, so sound is handled by the channel.
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    // Allow the rest-done alert to sound if it arrives while the app is foregrounded
    // (e.g. user returned to app just as rest ended and the scheduled notif still fired).
    const channelId = notification?.request?.content?.data?.channelId;
    const isRestDone = channelId === 'rest-done';
    return {
      shouldShowAlert: isRestDone,
      shouldPlaySound: isRestDone,
      shouldSetBadge: false,
    };
  },
});

// RootNavigator and PRCelebration are deliberately lazy-required from inside
// the gated render below. They (transitively) trigger every screen's
// StyleSheet.create, and we need accessibility prefs applied to the theme
// tokens BEFORE that happens — otherwise Larger Text / Higher Contrast /
// Colour-Blind Safe never take effect because the styles are frozen with
// the default palette at module-evaluation time.
import useAppStore from './src/store/useAppStore';
import { getWellbeingMode, isCalm } from './src/lib/wellbeing';
import { getSupabaseClient } from './src/lib/supabase';
import { applyAccessibility, resolvedTheme } from './src/styles/theme';
import { appFonts, installTextDefaults } from './src/styles/fonts';
import { loadA11yPrefs } from './src/lib/accessibilityPrefs';
import * as Updates from 'expo-updates';
// CP-10 stage 2 (docs/ux-world-class-audit-2026-07-09/
// CP-10-restart-free-theming-plan.md, "Stage 2 — Root chrome"): App()'s own
// StatusBar reads the LIVE hook instead of the static `resolvedTheme` import
// above, so the status bar re-renders when the user flips a theme pref with
// no restart. The static `resolvedTheme` import stays — `bootstrapAccessibility`
// below is a plain boot-time function, not a component, and still needs the
// legacy mutated singleton for the pre-hydration native-surface alignment call.
import useTheme from './src/hooks/useTheme';

// Read accessibility prefs at app boot and mutate the exported theme
// tokens before any screen module is loaded. Idempotent — safe to call
// more than once, but only the first call matters for already-built
// StyleSheets.
async function bootstrapAccessibility() {
  const prefs = await loadA11yPrefs();
  // Always apply so the theme (incl. 'system') resolves and resolvedTheme is
  // set for the chrome below; null prefs resolve to dark (no user changes).
  applyAccessibility(prefs || {});
  // COMP-029: align native surfaces (keyboards, pickers, OS alerts) with the
  // in-app choice. Requires app.json userInterfaceStyle "automatic" + a native
  // rebuild to take effect; harmless before then.
  try {
    // eslint-disable-next-line global-require
    const { Appearance } = require('react-native');
    Appearance.setColorScheme?.(resolvedTheme === 'light' ? 'light' : 'dark');
  } catch (_) { /* native surfaces fall back to app.json */ }
}

async function bootstrapVisualSystem() {
  await bootstrapAccessibility();
  await Font.loadAsync(appFonts);
  installTextDefaults();
}

// Shown when an auth email link fails to establish a session (expired or
// already-used code, network drop mid-exchange). Without it the user taps
// the link, the app opens, and nothing happens with no reason given
// (A2-004). Kept terse per the voice rules.
function notifyAuthLinkFailed() {
  try {
    Alert.alert(
      "Couldn't sign you in",
      'That link may have expired. Request a new one from the sign-in screen.',
    );
  } catch (_) { /* Alert unavailable (e.g. headless) — nothing else to do */ }
}

// Handles volyume:// and https://volyume.app deep links from Supabase auth emails.
// Supports both PKCE (code=xxx) and implicit (access_token in fragment) flows.
//
// The legacy partner invite links (volyume://partner/<CODE> and
// https://volyume.app/partner/<CODE>) used to be intercepted here and pushed
// straight at the Partner screen. Partners was retired on 2026-09-06 (SD-03,
// docs/social-discovery-2026-09-06/30-BLUEPRINT.md section 9), so there is no
// screen to push at and no invite to remember. Those URLs are still out in
// people's share messages, so they are deliberately NOT dropped: with the
// intercept gone they fall through to React Navigation's own linking config,
// which rewrites the path to Community and shows the "Partner invites have
// moved" card (RootNavigator.js, rewriteLegacyCommunityPath). Nothing below
// consumes them either -- handleAuthDeepLink returns 'ignored' for a URL with
// no auth parameters, so no failure alert is raised.

// Launcher app-shortcut routing (long-press the home-screen icon → "Start
// workout" / "Log food"). Maps a quick-action id to the tab + screen it should
// open. The same targets the existing `linking` config resolves for the
// volyume://workout/start and volyume://diary deep links — kept in lock-step
// here so a shortcut lands exactly where the equivalent deep link would.
// 'diary' is Pro-gated by withProGuard on the Diary screen; we just navigate
// and let that guard render the upgrade prompt for free users (no special case).
const QUICK_ACTION_ROUTES = {
  workout: { tab: 'HomeTab', screen: 'BuildWorkout' },
  diary: { tab: 'DiaryTab', screen: 'Diary' },
};

// Navigate for a launched quick action. navigationRef is lazy-required to
// preserve App.js's deliberate lazy load of RootNavigator (an eager import
// would freeze styles before accessibility prefs apply). On a cold start the
// navigator may not be mounted yet when the initial action resolves, so poll
// until navigationRef.isReady() before navigating — same pattern as the
// notification-tap routing in RootNavigator.
function handleQuickAction(action) {
  const target = QUICK_ACTION_ROUTES[action?.id];
  if (!target) return;
  let navigationRef;
  try { navigationRef = require('./src/navigation/RootNavigator').navigationRef; } catch (_) { return; }
  let attempts = 0;
  const go = () => {
    try {
      if (navigationRef.isReady()) {
        navigationRef.navigate(target.tab, { screen: target.screen });
        return;
      }
    } catch (_) { return; /* route not in current (e.g. signed-out) stack */ }
    if (++attempts < 20) setTimeout(go, 150); // ~3s of cold-start grace
  };
  go();
}

// Single entry point for incoming links. Attribution capture first, then auth
// links; anything else (including the legacy partner paths) falls through to
// React Navigation's linking config.
function handleIncomingDeepLink(url) {
  if (!url) return;
  // C8 phase 1: passive first-touch attribution capture (?src= / ?utm_source=,
  // first-write-wins, sanitised slug only). Never consumes or reroutes the link.
  captureFirstTouch(url).catch(() => {});
  const supabase = getSupabaseClient();
  if (!supabase) return;
  // Keep the security-critical callback parser in a small testable module.
  // It verifies token identity before installing any implicit-flow session.
  // eslint-disable-next-line global-require
  const { handleAuthDeepLink } = require('./src/lib/authDeepLink');
  handleAuthDeepLink(url, { supabase, notifyAuthLinkFailed }).catch(() => notifyAuthLinkFailed());
}

const CRASH_LOG_KEY = '@volyume_crash_log';

// Uncaught exceptions and unhandled rejections are now captured by
// installGlobalHandlers() above. ErrorBoundary still writes the legacy
// single-slot crash log so LoginScreen's banner keeps working.

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    // Short opaque incident code shown to the user so support can correlate
    // it with the privately logged crash, without ever exposing the raw
    // exception or stack to the customer (EP-08).
    const incidentId = `V-${Date.now().toString(36).slice(-6).toUpperCase()}`;
    return { error, incidentId };
  }

  componentDidCatch(error, errorInfo) {
    logError('ErrorBoundary', error, {
      incidentId: this.state?.incidentId,
      componentStack: errorInfo?.componentStack?.slice(0, 1200),
    });
    AsyncStorage.setItem(CRASH_LOG_KEY, JSON.stringify({
      incidentId: this.state?.incidentId ?? null,
      message: error?.message || String(error),
      stack: error?.stack?.slice(0, 1200) || '',
      ts: Date.now(),
    })).catch(() => {});
  }

  render() {
    if (this.state.error) {
      const incidentId = this.state.incidentId ?? '';
      // Developer builds keep the raw message + full stack for debugging.
      if (__DEV__) {
        return (
          <View style={eb.container}>
            <Text style={eb.title}>Volyume: Crash Report (dev)</Text>
            <Text style={eb.subtitle}>{incidentId}</Text>
            <View style={eb.msgBox}>
              <Text selectable style={eb.msg}>{this.state.error?.message || String(this.state.error)}</Text>
            </View>
            <ScrollView style={eb.scroll}>
              <Text selectable style={eb.stack}>{this.state.error?.stack}</Text>
            </ScrollView>
            <TouchableOpacity accessibilityRole="button" style={eb.btn} onPress={() => this.setState({ error: null })}>
              <Text style={eb.btnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        );
      }
      // Production: a calm, branded recovery screen. No exception text or stack
      // frames ever reach the customer; the incident code maps to the crash we
      // logged privately (EP-08).
      const supportUrl = `mailto:support@volyume.app?subject=${encodeURIComponent(`Volyume problem ${incidentId}`)}`;
      return (
        <View style={eb.container}>
          <Text style={eb.calmTitle}>Something went wrong</Text>
          <Text style={eb.body}>
            Volyume ran into an unexpected problem. Restarting usually sorts it. If it keeps happening, contact support and quote the code below.
          </Text>
          <View style={eb.idBox}>
            <Text style={eb.idLabel}>Reference code</Text>
            <Text selectable style={eb.idValue}>{incidentId}</Text>
          </View>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Restart Volyume"
            style={eb.btn}
            onPress={() => { Updates.reloadAsync().catch(() => this.setState({ error: null })); }}
          >
            <Text style={eb.btnText}>Restart Volyume</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Contact support"
            style={eb.btnSecondary}
            onPress={() => { Linking.openURL(supportUrl).catch(() => {}); }}
          >
            <Text style={eb.btnSecondaryText}>Contact support</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

// The ErrorBoundary deliberately uses literal hex rather than theme tokens:
// if the thing that crashed is the theme/style layer itself, importing
// colors.* here could re-crash the recovery screen. The values mirror the
// theme (background #0D0D0D, error red, amber action) so the crash screen
// still reads as Volyume. The button is amber #E08C0B (= primaryFill), not
// the retired electric blue it used to be.
const eb = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0D0D', padding: 20, paddingTop: 60 },
  title: { color: '#F44336', fontSize: 18, fontWeight: 'bold', marginBottom: 8 },
  subtitle: { color: '#9E9E9E', fontSize: 14, marginBottom: 12 },
  scroll: { flex: 1, backgroundColor: '#191917', borderRadius: 10, padding: 12 },
  msgBox: { backgroundColor: '#2a1212', borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#F44336' },
  msg: { color: '#FF6B60', fontSize: 14, fontWeight: 'bold' },
  stack: { color: '#ccc', fontSize: 11, fontFamily: 'monospace' },
  btn: { marginTop: 16, backgroundColor: '#E08C0B', borderRadius: 14, padding: 14, alignItems: 'center' },
  btnText: { color: '#0D0D0D', fontWeight: 'bold', fontSize: 16 },
  // Calm production recovery screen (EP-08). Same literal-hex approach as the
  // rest of eb: if the style/theme layer is what crashed, importing tokens
  // here could re-crash the recovery screen, so these mirror the theme values.
  calmTitle: { color: '#F5F5F5', fontSize: 20, fontWeight: 'bold', marginBottom: 10 },
  body: { color: '#9E9E9E', fontSize: 15, lineHeight: 22, marginBottom: 20 },
  idBox: { backgroundColor: '#191917', borderRadius: 10, padding: 12, marginBottom: 4 },
  idLabel: { color: '#7A7A7A', fontSize: 12, marginBottom: 4 },
  idValue: { color: '#E0E0E0', fontSize: 16, fontWeight: 'bold', letterSpacing: 1 },
  btnSecondary: { marginTop: 10, borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#3A3A38' },
  btnSecondaryText: { color: '#E0E0E0', fontWeight: '600', fontSize: 15 },
});

// Small inner component that fires the "crash recovered" toast +
// (optionally) opens the feedback sheet primed with the crash
// trigger so the user can tell us what they were doing right before
// the previous session died. Mounted inside ToastProvider +
// FeedbackProvider so it can use both hooks. Fires once per launch.
function CrashRecoveryToast({ priorCrash }) {
  // eslint-disable-next-line global-require
  const { useToast } = require('./src/components/Toast');
  // eslint-disable-next-line global-require
  const { useFeedback } = require('./src/components/FeedbackSheet');
  const toast = useToast();
  const feedback = useFeedback();
  const firedRef = useRef(false);

  useEffect(() => {
    if (!priorCrash || firedRef.current) return;
    firedRef.current = true;
    // Wait a beat after launch so the toast doesn't compete with the
    // splash → home transition. 1.6s lands it clearly inside Home.
    const t = setTimeout(() => {
      try {
        toast?.show?.(
          'Volyume crashed last session. Report sent.',
          {
            variant: 'info',
            duration: 7000,
            // Action button on the toast — taps open the feedback
            // sheet pre-filled with the crash_recovery trigger so the
            // user can add what they were doing in one sentence. The
            // sheet auto-attaches the crash metadata from the
            // observability layer.
            action: {
              label: 'Add details',
              onPress: () => feedback?.open?.({ trigger: 'crash_recovery' }),
            },
          },
        );
      } catch (_) { /* tolerate */ }
    }, 1600);
    return () => clearTimeout(t);
  }, [priorCrash, toast, feedback]);

  return null;
}

export default function App() {
  const prCelebration = useAppStore(s => s.prCelebration);
  const hidePRCelebration = useAppStore(s => s.hidePRCelebration);
  const reduceMotion = useAppStore(s => s.accessibility?.reduceMotion);
  const accessibilityLoaded = useAppStore(s => s.accessibilityLoaded);
  const loadAccessibility = useAppStore(s => s.loadAccessibility);
  const setSystemReduceMotion = useAppStore(s => s.setSystemReduceMotion);
  const privacyLoaded = useAppStore(s => s.privacyLoaded);
  const loadPrivacyPrefs = useAppStore(s => s.loadPrivacyPrefs);
  const [calm, setCalm] = useState(false);
  const [themeReady, setThemeReady] = useState(false);
  // CP-10 stage 2: drives the StatusBar below live. Reads the existing
  // accessibility slice (see src/hooks/useTheme.js) — cheap even before
  // themeReady flips, since resolveTheme() is a pure function of four
  // primitive prefs, not the app's boot state.
  const t = useTheme();

  // (The daily-steps launch prompt was removed with the Health Connect / Apple
  // Health integration, founder 2026-06-30.)

  const [priorCrash, setPriorCrash] = useState(false);

  // Mutate the theme exports from saved a11y prefs BEFORE the navigator (and
  // therefore every screen's StyleSheet.create) is required. Without this
  // gate, the user toggles Higher Contrast in Settings, restarts, and sees
  // no change because the StyleSheets were baked with the default palette.
  // themeReady is the single gate for the entire UI: if it never flips, the
  // user gets a permanent black screen. So it is set exactly once, in
  // finally, regardless of whether the bootstrap resolved or rejected —
  // a failed pref read just means the default palette renders.
  useEffect(() => {
    bootstrapVisualSystem()
      .catch(() => {})
      .finally(() => setThemeReady(true));
  }, []);

  // Founder defect (2026-07-13, Android walk): TWO splash screens showed
  // back to back. This effect used to hide the NATIVE splash the moment
  // themeReady flipped, which was before RootNavigator's boot gate (splash
  // flags + the initialAuthResolved session latch) had resolved — so the
  // user saw native splash → the animated JS SplashScreen → the app: two
  // distinct loading screens. The native hide now lives in RootNavigator,
  // fired exactly when the boot gate lifts, so the native splash covers
  // the whole boot and the app appears directly behind it: one splash.
  // This effect keeps only a hard failsafe so a wedged boot can never
  // strand the user on the native splash forever (same philosophy as the
  // gate's own 8s auth latch failsafe; 12s sits safely beyond it).
  useEffect(() => {
    if (!themeReady) return;
    const failsafe = setTimeout(() => { SplashScreen.hideAsync().catch(() => {}); }, 12000);
    return () => clearTimeout(failsafe);
  }, [themeReady]);

  // Boot the observability layer — session id, build identity, crash
  // detection, shutdown handler. Returns the prior-crash flag so we
  // can surface a calm "we crashed last session, report's already
  // away" indicator without the user having to do anything.
  useEffect(() => {
    // eslint-disable-next-line global-require
    const { bootObservability } = require('./src/lib/observability');
    bootObservability()
      .then(({ wasCrashed }) => setPriorCrash(!!wasCrashed))
      .catch(() => {});
  }, []);

  // Hydrate accessibility prefs into the store too so SettingsScreen's
  // switches reflect saved state. Independent of the theme bake above —
  // the store drives Reduce Motion (reactive) and the Settings UI.
  useEffect(() => {
    if (!accessibilityLoaded) loadAccessibility();
  }, [accessibilityLoaded, loadAccessibility]);

  // AX-09 (launch accessibility audit): hydrate the OS-level "Reduce Motion"
  // / "Remove animations" preference before the first animated screen, and
  // keep it live if the user flips it in OS Settings while Volyume is
  // running. This is a live device query, not a stored value (unlike
  // loadAccessibility above) - the store's setSystemReduceMotion recomputes
  // the effective accessibility.reduceMotion field that every existing
  // consumer already reads (haptics.js, RestTimer, PRCelebration, etc), so no
  // consumer needed editing. Cleans up the subscription on unmount.
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(enabled => { if (mounted) setSystemReduceMotion(enabled); })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', enabled => {
      setSystemReduceMotion(enabled);
    });
    return () => {
      mounted = false;
      sub.remove();
    };
  }, [setSystemReduceMotion]);

  // Hydrate the analytics opt-out before telemetry starts flowing, so an
  // opted-out user's first foreground doesn't ship events (LB-9).
  useEffect(() => {
    if (!privacyLoaded) loadPrivacyPrefs();
  }, [privacyLoaded, loadPrivacyPrefs]);

  // Hydrate any custom meal-slot names (gap #1) into the module cache that
  // mealSlotLabel reads, before the diary renders its meal headers. Device-local
  // + cosmetic; empty by default so existing users see the standard labels.
  useEffect(() => { loadMealLabelOverrides(); }, []);

  useEffect(() => {
    if (prCelebration) getWellbeingMode().then(m => setCalm(isCalm(m)));
  }, [prCelebration]);

  // End any iOS Live Activity left over from a previous launch. If the
  // app was force-closed mid-rest or crashed during a workout, the
  // system retained the Activity — calling endAllActivities here on
  // cold boot dismisses it so the user doesn't see a stale countdown
  // on their lock screen for a workout that's no longer happening.
  // No-op on Android.
  useEffect(() => {
    try {
      // eslint-disable-next-line global-require, import/no-unresolved
      const liveActivity = require('live-activity');
      liveActivity.endAllActivities?.().catch(() => {});
    } catch (_) { /* module not bundled on this platform */ }
  }, []);

  // Deep link handler — processes volyume:// auth callbacks from confirmation
  // emails. Every other path (including the legacy volyume://partner/<CODE>
  // links) is left to React Navigation's linking config.
  // RootNavigator's onAuthStateChange listener picks up any resulting session
  // automatically and re-routes the user without any extra navigation calls.
  useEffect(() => {
    warmFirstTouch().catch(() => {});
    Linking.getInitialURL().then(url => { if (url) handleIncomingDeepLink(url); }).catch(() => {});
    const sub = Linking.addEventListener('url', ({ url }) => handleIncomingDeepLink(url));
    return () => sub.remove();
  }, []);

  // Launcher app-shortcuts (long-press the home-screen icon). Wrapped in
  // try/catch so a build without the native expo-quick-actions module simply
  // no-ops — same guard pattern as the optional billing / live-activity
  // modules above. The config-plugin registers the iOS static actions at build
  // time; Android static actions are NOT supported by the plugin, so we set
  // both shortcuts at runtime via setItems() (which also harmlessly re-asserts
  // them on iOS). Cold launch is covered by QuickActions.initial (the action
  // that opened the app); the warm case by addListener.
  useEffect(() => {
    let subscription;
    try {
      // eslint-disable-next-line global-require
      const QuickActions = require('expo-quick-actions');
      QuickActions.setItems?.([
        {
          id: 'workout',
          title: 'Start workout',
          subtitle: "Build today's session",
          icon: 'symbol:dumbbell.fill',
          params: { href: 'volyume://workout/start' },
        },
        {
          id: 'diary',
          title: 'Log food',
          subtitle: 'Open your food diary',
          icon: 'symbol:fork.knife',
          params: { href: 'volyume://diary' },
        },
      ])?.catch?.(() => {});
      // Cold-launch: the app was opened by tapping a shortcut.
      if (QuickActions.initial) handleQuickAction(QuickActions.initial);
      // Warm case: a shortcut tapped while the app is already running.
      subscription = QuickActions.addListener?.(handleQuickAction);
    } catch (_) { /* native module not in this build — feature absent, no crash */ }
    return () => { try { subscription?.remove?.(); } catch (_) {} };
  }, []);

  // OTA update check — runs once on mount, production builds only.
  // Silently downloads the update and prompts the user to restart.
  useEffect(() => {
    async function checkForUpdate() {
      if (__DEV__) return; // only in production builds
      try {
        const update = await Updates.checkForUpdateAsync();
        if (update.isAvailable) {
          await Updates.fetchUpdateAsync();
          Alert.alert(
            'Update available',
            'A new version of Volyume has been downloaded. Restart to apply it.',
            [
              { text: 'Later' },
              { text: 'Restart now', onPress: () => Updates.reloadAsync() },
            ],
            { cancelable: true }
          );
        }
      } catch (_) {
        // Silently ignore — update check is non-critical
      }
    }
    checkForUpdate();
  }, []);

  // Set up Android notification channels and wire notification-tap deep links.
  // When the user taps the lock-screen rest timer notification, open the app
  // directly to the active workout via the volyume:// scheme.
  useEffect(() => {
    ensureNotifChannels();

    const responseSub = Notifications.addNotificationResponseReceivedListener(response => {
      const url = response?.notification?.request?.content?.data?.url;
      if (url && url.startsWith('volyume://')) {
        Linking.openURL(url).catch(() => {});
      }
    });

    return () => responseSub.remove();
  }, []);

  // Register the daily background sync task once on mount. The OS decides
  // when it actually fires (Android batches fetches with other apps; iOS
  // schedules opportunistically) — we just ask for "at most once every
  // ~12 hours". If registration fails (older Android skipping background
  // tasks, simulator, etc.) the foreground sync is still there as a
  // fallback every time the app comes to active.
  useEffect(() => {
    (async () => {
      try {
        const status = await BackgroundFetch.getStatusAsync();
        if (status !== BackgroundFetch.BackgroundFetchStatus.Available) return;
        await BackgroundFetch.registerTaskAsync(VOLYUME_DAILY_SYNC, {
          minimumInterval: 12 * 60 * 60, // seconds — target ~twice a day
          stopOnTerminate: false,
          startOnBoot: true,
        });
      } catch (_) { /* unsupported on this device — fine, foreground sync covers it */ }
    })();
  }, []);

  // Foreground sync — drains the local→cloud sync whenever the app returns
  // to active state. Offline writes (workouts logged with no connection, a
  // body metric entered while underground, etc.) catch up the next time the
  // user opens the app on a connected network. Throttled so a quick
  // foreground/background toggle doesn't hammer the API.
  useEffect(() => {
    let lastSyncAt = 0;
    let coldStartFired = false;
    const MIN_SYNC_INTERVAL_MS = 60_000; // at most once a minute
    async function maybeSync() {
      const now = Date.now();
      if (now - lastSyncAt < MIN_SYNC_INTERVAL_MS) return;
      try {
        const sb = getSupabaseClient();
        if (!sb) return;
        const { data: { session: s } } = await sb.auth.getSession();
        const supabaseUserId = s?.user?.id;
        const localUserId = useAppStore.getState().user?.id;
        // Lifecycle telemetry: app_cold_start fires once per process,
        // the first time maybeSync resolves a signed-in user. After
        // that the AppState listener covers foreground / background
        // transitions. sync_run fires at the end of each successful
        // maybeSync round so the dashboard can monitor sync cadence
        // and surface accounts that haven't synced in days.
        if (supabaseUserId && !coldStartFired) {
          coldStartFired = true;
          try {
            // eslint-disable-next-line global-require
            const { track } = require('./src/lib/engineTelemetry');
            track(supabaseUserId, 'app_cold_start', {
              platform: Platform.OS,
            }).catch(() => {});
          } catch (_) {}
        }
        lastSyncAt = now;
        if (supabaseUserId) {
          // Route the catch-up push through syncAll() instead of calling
          // bulkUploadLocalData directly. SYNC_ARCHITECTURE_LOCKED.md
          // requires every trigger to go through syncAll so the runner's
          // single in-memory lock can dedupe. Previously this path called
          // bulkUploadLocalData directly, bypassing that lock, so on each
          // foreground it raced the dedicated callSyncAll('foreground')
          // effect below and pushed everything twice (A2-001 / A2-012,
          // idempotent but wasteful). Now the lock serialises them: on
          // foreground whichever fires first runs and the other skips;
          // on background / inactive / cold-start (where callSyncAll does
          // not fire) this is the sole sync. The push runs before the pull
          // inside syncAll, so the background-flush guarantee still holds.
          // eslint-disable-next-line global-require
          const { syncAll } = require('./src/lib/sync');
          syncAll({ userId: supabaseUserId, localUserId, triggeredBy: 'background' }).catch(() => {});
        }
        // Drain the sync queue — retries any cloud writes that failed
        // since the last foreground (offline at the gym, flaky 5G, 5xx
        // on Supabase, etc.). Backoff schedule means we don't hammer
        // the API; each op has its own next_attempt_at gate. Safe to
        // run alongside syncAll — the queue is per-op retry for rows that
        // previously failed, syncAll is the bulk catch-up.
        if (supabaseUserId) {
          // eslint-disable-next-line global-require
          const { drainSyncQueue } = require('./src/lib/syncQueue');
          drainSyncQueue(sb, supabaseUserId).catch(() => {});
        }
        // Error log shipping is now Sentry's job (initialised below).
        // The SDK has its own offline buffer + transport, so we don't
        // need to push from here.

        // Health connections: pull any new weight readings the user
        // logged on a smart scale or wearable since the last foreground.
        // Local user id is enough; importNewWeights silently no-ops if
        // permissions aren't granted yet.
        if (localUserId) {
          // eslint-disable-next-line global-require
          const { importNewWeights } = require('./src/lib/health');
          importNewWeights(localUserId).catch(() => {});

          // Steps: record today's total from the platform health aggregator
          // (Apple Health / Health Connect) so the daily_steps store and the
          // weekly coach average stay current with no visible step card.
          // Silent: no-op if the user has not granted the steps permission.
          // eslint-disable-next-line global-require
          const { recordTodaySteps, backfillDailySteps } = require('./src/lib/activitySteps');
          recordTodaySteps(localUserId).catch(() => {});
          // Backfill complete daily totals (last ~14 days) once per launch so the
          // weekly coach average reflects real end-of-day steps, not the partial
          // foreground snapshots recordTodaySteps leaves on past days.
          backfillDailySteps(localUserId).catch(() => {});
        }

        // Flush any feedback rows that were captured offline (the user
        // tapped a sentiment chip while signed-out, etc.). Idempotent;
        // returns 0 quickly when nothing's queued.
        if (supabaseUserId) {
          try {
            // eslint-disable-next-line global-require
            const { flushPendingFeedback } = require('./src/lib/feedback');
            flushPendingFeedback(supabaseUserId).catch(() => {});
          } catch (_) {}
        }

        // Year of Lifts unlock — fire the one-shot "your wrap-up is
        // ready" local notification the first time the user crosses
        // the 365-day training mark. Cheap query (single SELECT for
        // the earliest completed workout); the helper itself is
        // idempotent via an AsyncStorage flag so it never fires
        // twice.
        if (localUserId) {
          try {
            // eslint-disable-next-line global-require
            const { db } = require('./src/lib/database');
            // eslint-disable-next-line global-require
            const { checkYearOfLiftsUnlock, checkMonthlyRecapReady } = require('./src/lib/notifications');
            db().then(async (d) => {
              const row = await d.getFirstAsync(
                'SELECT MIN(started_at) AS first_at, COUNT(*) AS completed FROM workouts WHERE user_id = ? AND is_completed = 1',
                [localUserId],
              ).catch(() => null);
              await checkYearOfLiftsUnlock(row?.first_at ?? null);
              // COMP-005: monthly recap nudge for the last completed calendar
              // month. Same idempotent on-app-open pattern as the year unlock.
              try {
                const now = new Date();
                const curMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
                const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
                const prev = new Date(prevMonthStart);
                const monthRow = await d.getFirstAsync(
                  'SELECT COUNT(*) AS n FROM workouts WHERE user_id = ? AND is_completed = 1 AND started_at >= ? AND started_at < ?',
                  [localUserId, prevMonthStart, curMonthStart],
                ).catch(() => null);
                const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
                let neutral = false;
                try {
                  // eslint-disable-next-line global-require
                  const { getWellbeingMode, isCalm } = require('./src/lib/wellbeing');
                  neutral = isCalm(await getWellbeingMode());
                } catch (_) { /* default not-neutral */ }
                await checkMonthlyRecapReady({
                  completedCount: row?.completed ?? 0,
                  monthSessions: monthRow?.n ?? 0,
                  monthKey: `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`,
                  monthLabel: MONTHS[prev.getMonth()],
                  neutral,
                });
              } catch (_) { /* tolerate */ }
            }).catch(() => {});
          } catch (_) { /* tolerate — feature is a "nice to have" */ }
        }
        // sync_run telemetry. Fires at the end of a round that
        // successfully resolved a signed-in user. The 60s throttle
        // upstream means the dashboard sees at most one event per
        // minute of active app time, plenty to catch staleness
        // without flooding the table.
        if (supabaseUserId) {
          try {
            // eslint-disable-next-line global-require
            const { track } = require('./src/lib/engineTelemetry');
            track(supabaseUserId, 'sync_run', {
              had_local_uid: !!localUserId,
            }).catch(() => {});
          } catch (_) {}
        }
      } catch (_) { /* offline / no session — try again next foreground */ }
    }
    const sub = AppState.addEventListener('change', state => {
      // Lifecycle telemetry: app_foregrounded fires only AFTER the
      // cold-start event has fired (otherwise the first 'active'
      // transition on mount would double-count with app_cold_start).
      // app_backgrounded fires on 'background' but not 'inactive'
      // (the iOS "phone call" / control-center pull-down state),
      // which would otherwise overstate sessions.
      if (coldStartFired && (state === 'active' || state === 'background')) {
        try {
          const sb = getSupabaseClient();
          sb?.auth.getSession().then(({ data: { session: s } = {} } = {}) => {
            const uid = s?.user?.id;
            if (!uid) return;
            // eslint-disable-next-line global-require
            const { track } = require('./src/lib/engineTelemetry');
            const event = state === 'active' ? 'app_foregrounded' : 'app_backgrounded';
            track(uid, event, { platform: Platform.OS }).catch(() => {});
          }).catch(() => {});
        } catch (_) {}
      }
      // Fire on BOTH foreground (active) and backgrounding
      // (inactive/background). Foreground sync catches up cloud
      // changes from other devices; background sync flushes
      // pending local writes before the OS kills the app. Without
      // the background path, a user who logs a workout + backgrounds
      // the app without ever re-foregrounding loses changes if
      // Android reaps the process.
      if (state === 'active' || state === 'background' || state === 'inactive') {
        maybeSync();
      }
      // COMP-019: refresh the home-screen widget snapshot when backgrounding
      // (the blueprint's foreground->background trigger). Fire-and-forget.
      if (state === 'background') {
        try {
          const sb = getSupabaseClient();
          sb?.auth.getSession().then(({ data: { session: s } = {} } = {}) => {
            const uid = s?.user?.id;
            if (!uid) return;
            // eslint-disable-next-line global-require
            require('./src/lib/widgets/writer').writeWidgetSnapshot(uid).catch(() => {});
          }).catch(() => {});
        } catch (_) {}
      }
    });
    // Also run once on mount so an app launched after a long offline period
    // catches up immediately.
    maybeSync();
    return () => sub.remove();
  }, []);

  // SYNC_ARCHITECTURE_LOCKED.md lines 161-169: four sync triggers
  // routed through the same syncAll() entry point. The runner has
  // its own in-memory lock so concurrent calls dedupe.
  //   - foreground:        AppState 'active'
  //   - network reconnect: NetInfo isConnected: true after offline
  //   - write (debounced): src/lib/sync.scheduleSync (existing)
  //   - periodic:          15-minute interval while app is open
  useEffect(() => {
    let cancelled = false;
    let prevConnected = null;
    let intervalHandle = null;
    let appStateSub = null;
    let netInfoUnsub = null;
    // PERF-001: caller-side in-flight guard so the periodic interval (and any
    // other trigger) does not stack a second sync on top of one already
    // running. syncAll has its own runner lock, but this also avoids spinning
    // up the session and network reads when a sync is already in progress.
    let syncInFlight = false;

    async function callSyncAll(triggeredBy) {
      if (cancelled) return;
      // PERF-001 guard 1: a sync is already in progress.
      if (syncInFlight) return;
      try {
        const sb = getSupabaseClient();
        if (!sb) return;
        const { data: { session: s } = {} } = await sb.auth.getSession();
        const supabaseUserId = s?.user?.id ?? null;
        const localUserId = useAppStore.getState().user?.id ?? null;
        // PERF-001 guard 2: no user is signed in, nothing to sync.
        if (!supabaseUserId) return;
        // PERF-001 guard 3: skip when the device is known to be offline. If
        // NetInfo is unavailable (tests / Expo Go without the native module)
        // or reports an unknown state, fall through and let the network call
        // fail gracefully rather than blocking sync on a missing signal.
        try {
          // eslint-disable-next-line global-require
          const NetInfo = require('@react-native-community/netinfo').default;
          const net = await NetInfo.fetch();
          if (net && net.isConnected === false) return;
        } catch (_) { /* NetInfo missing; proceed */ }
        if (cancelled) return;
        syncInFlight = true;
        // eslint-disable-next-line global-require
        const { syncAll } = require('./src/lib/sync');
        await syncAll({ userId: supabaseUserId, localUserId, triggeredBy });
        // Bodyweight auto-import is deliberately NOT done here. It runs
        // once per lifecycle event in the maybeSync effect above (next to
        // the steps read), which also covers cold-start and background.
        // Calling it here as well meant the health read fired twice on
        // every foreground (A2-005). The sync runner stays a pure sync
        // runner; lifecycle health reads live in maybeSync.
      } catch (_) { /* tolerate */ } finally {
        syncInFlight = false;
      }
    }

    // 1. Foreground trigger.
    appStateSub = AppState.addEventListener('change', state => {
      if (state === 'active') {
        callSyncAll('foreground');
        // NOTIF-1: re-lay reminders if the device timezone changed (travel) so
        // their quiet-hours-shifted hour is recomputed. No-op when unchanged.
        try {
          // eslint-disable-next-line global-require
          const { rescheduleForTimezoneIfChanged, refreshWeighInHorizonIfStale, scheduleReturnNudge } = require('./src/lib/notifications');
          const uid = useAppStore.getState().user?.id ?? null;
          rescheduleForTimezoneIfChanged(uid).catch(() => {});
          // D142: the return nudge is laid 21 days ahead and moved on every
          // open, so it fires only after genuine absence. Self-throttled to
          // once per six hours; every gate lives inside.
          scheduleReturnNudge(uid).catch(() => {});
          // C8 Work 5 review D6: the weigh-in prompts now run on a bounded
          // 14-day horizon, so an app that stays resident for weeks would
          // run out mid-use. Top it up at most once a week on foreground.
          // Self-guarding and best-effort; every tier/permission/ED gate
          // still applies (it goes through restoreNotifications).
          refreshWeighInHorizonIfStale(uid).catch(() => {});
          // D17: refresh the habit-derived training-reminder schedule on
          // every foreground, alongside the timezone re-lay above (both are
          // "catch this up now the app is active again" refreshes). Self-
          // guarding and best-effort; a workout completed on another device
          // (or while this device was backgrounded) still updates the
          // pattern promptly rather than waiting for this device's next
          // workout finish.
          // eslint-disable-next-line global-require
          require('./src/lib/notifications/trainingHabitSchedule')
            .refreshHabitDerivedTrainingSchedule(uid)
            .catch(() => {});
        } catch (_) { /* tolerate */ }
      }
    });

    // 2. Network reconnect trigger.
    try {
      // eslint-disable-next-line global-require
      const NetInfo = require('@react-native-community/netinfo').default;
      netInfoUnsub = NetInfo.addEventListener(state => {
        const connected = !!state?.isConnected;
        if (prevConnected === false && connected === true) {
          callSyncAll('network');
        }
        prevConnected = connected;
      });
    } catch (_) {
      // NetInfo missing (e.g. tests, Expo Go without the native
      // module). The other three triggers still cover the surface.
    }

    // 3. Periodic 15-minute trigger.
    intervalHandle = setInterval(() => callSyncAll('periodic'), 15 * 60 * 1000);

    return () => {
      cancelled = true;
      if (appStateSub?.remove) appStateSub.remove();
      if (netInfoUnsub) netInfoUnsub();
      if (intervalHandle) clearInterval(intervalHandle);
    };
  }, []);

  if (!themeReady) {
    // Minimal pre-theme placeholder. No theme tokens here on purpose — uses
    // hard-coded background that matches the splash so the transition is
    // invisible to the user.
    return <View style={{ flex: 1, backgroundColor: '#0D0D0D' }} />;
  }

  // Lazy-require after applyAccessibility has mutated the theme. These
  // requires synchronously evaluate the whole screen graph; doing them
  // here guarantees every StyleSheet.create sees the post-a11y tokens.
  // eslint-disable-next-line global-require
  const RootNavigator = require('./src/navigation/RootNavigator').default;
  // eslint-disable-next-line global-require
  const PRCelebration = require('./src/components/PRCelebration').default;

  // eslint-disable-next-line global-require
  const { ToastProvider } = require('./src/components/Toast');
  // eslint-disable-next-line global-require
  const { FeedbackProvider } = require('./src/components/FeedbackSheet');
  // eslint-disable-next-line global-require
  const { AppAlertHost } = require('./src/components/AppAlert');
  // eslint-disable-next-line global-require
  const { PostLapseSheetHost } = require('./src/components/PostLapseSheet');

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardProvider>
        <BottomSheetModalProvider>
          {/* R2 (remediation 2026-07-11): the provider prop is `initialMetrics`.
              The old `initialWindowMetrics={...}` passed an UNRECOGNISED prop,
              so the provider mounted with no metrics and every consumer read
              insets of 0 until the async native measurement landed - on the
              founder's device the ActiveWorkout bottom bar (the one surface
              that relies on raw insets.bottom, because it hides the tab bar)
              rendered under the Android navigation buttons. */}
          <SafeAreaProvider initialMetrics={initialWindowMetrics}>
            {/* CP-10 stage 2: live theme read (useTheme, not the static
                resolvedTheme import) so the status bar flips with the rest of
                the app's chrome on a theme change, no restart. `style` is the
                only prop with any effect here: Android edge-to-edge is
                enforced (no opt-out set, targetSdk 35 — see
                node_modules/expo-status-bar/src/StatusBar.android.tsx), and
                under edge-to-edge `backgroundColor` is a no-op (it warns and
                is ignored) because the bar is always transparent — the
                colour behind it comes from the app's own root-level
                background rendering, not this prop. */}
            <StatusBar
              style={t.resolvedTheme === 'light' ? 'dark' : 'light'}
            />
            <ToastProvider>
              <FeedbackProvider>
                <RootNavigator />
                {prCelebration && (
                  <PRCelebration
                    // Keyed per celebration: the auto-dismiss timer runs on
                    // mount only, so a queued PR popping into an unkeyed
                    // component would sit on screen forever (founder device
                    // report 2026-07-13).
                    key={prCelebration._seq ?? 'pr'}
                    pr={prCelebration}
                    onDismiss={hidePRCelebration}
                    // Honour either calm-mode (wellbeing preference) OR the
                    // accessibility "reduce motion" pref. Both should suppress
                    // particles + heavy spring animations.
                    subdued={calm || reduceMotion}
                  />
                )}
                <CrashRecoveryToast priorCrash={priorCrash} />
                <AppAlertHost />
                <PostLapseSheetHost />
              </FeedbackProvider>
            </ToastProvider>
          </SafeAreaProvider>
        </BottomSheetModalProvider>
        </KeyboardProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
