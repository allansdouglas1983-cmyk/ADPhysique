import { useCallback, useEffect, useRef, useState } from 'react';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { StackActions } from '@react-navigation/native';
import { safeGetStateFromPath } from './safeGetStateFromPath';
export const navigationRef = createNavigationContainerRef();
import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Button from '../components/Button';

import AsyncStorage from '@react-native-async-storage/async-storage';

import { colors, spacing, motion, fontSize, fontWeight, fontFamily } from '../styles/theme';
// CP-10 stage 2 (docs/ux-world-class-audit-2026-07-09/
// CP-10-restart-free-theming-plan.md, "Stage 2 — Root chrome"): the
// NavigationContainer theme prop and the stackOptions header/card colours
// below now read the LIVE hook instead of the static colors/resolvedTheme
// imports, via ./navTheme (a standalone module for testability -- see its
// header comment). `colors` stays imported for the rest of this file (the
// SplashScreen StyleSheet.create at the bottom, out of Stage 2's scope, still
// frozen until Stage 3) -- `resolvedTheme` had no remaining static reader in
// this file once both its call sites moved to the hook, so it is dropped from
// this import (not from theme.js itself -- App.js's boot-time
// bootstrapAccessibility still uses it there).
import { useNavTheme, useStackOptions } from './navTheme';
// D36c (TalkBack sheet isolation, 2026-07-10): SheetIsolationBoundary wraps
// the screen container below and hides it from TalkBack/VoiceOver while any
// shared BottomSheet is open, restoring it on close. See that module's
// header for the full design -- in short, the sheet portal (@gorhom/bottom-
// sheet's hosting container) renders as a SIBLING of the wrapped tree, not a
// descendant of it, so hiding this boundary while a sheet is open never
// hides the open sheet itself.
import { SheetIsolationBoundary } from '../lib/sheetA11yIsolation';
import useAppStore from '../store/useAppStore';
import { getSupabaseClient, hasStoredAuthSession } from '../lib/supabase';
// Campaign 24 Wave E: the pure boot-time auth presentation decision (the
// startup auth-hydration flash fix — see the give-up branch in the render).
import { classifyAuthBoot, classifyFreshInstall } from '../lib/authBootGate';
import { initDatabase, cleanupOrphanRoutineExercises } from '../lib/database';
import { seedExercisesIfNeeded, topUpNewExercisesIfNeeded, backfillExerciseMetadataIfNeeded, rederiveExerciseMetadataIfNeeded } from '../lib/seedExercises';
import * as haptics from '../lib/haptics';
import {
  configureNotificationHandler,
  installNotificationListeners,
  installRestActionBridge,
  restoreNotifications,
  routeForNotificationType,
} from '../lib/notifications';

// Screens, deferred per-screen requires (F6b, audit PR-3). Statically
// importing all eighty screens here evaluated the entire screen module
// graph (react-native-vision-camera at module scope in ScanBarcode
// included) synchronously in one turn at boot, on the black pre-theme
// placeholder. lazyScreen defers each screen module's evaluation to that
// screen's FIRST render and caches the loaded component, so boot evaluates
// only the screens actually rendered. The a11y-theme-first ordering App.js
// relies on (applyAccessibility mutates the theme tokens BEFORE
// RootNavigator is required) still holds by construction: a screen's first
// render is strictly later than that, so every screen-level
// StyleSheet.create sees the post-a11y tokens exactly as before, and a11y
// pref changes prompt a restart, so tokens never move under an
// already-evaluated module. Every loader's require() keeps a static string
// literal so Metro still bundles every screen. Each wrapper is a stable
// module-scope constant, so React Navigation never remounts a screen
// because of this indirection. Screens have no module-scope side effects
// (verified across all 82 files, 2026-07-02), deferral changes when a
// module evaluates, never what it does.
function lazyScreen(load) {
  let Screen = null;
  function LazyScreen(props) {
    if (!Screen) {
      Screen = load();
      LazyScreen.displayName = `Lazy(${Screen.displayName || Screen.name || 'Screen'})`;
    }
    return <Screen {...props} />;
  }
  return LazyScreen;
}

// Auth screens
const LoginScreen = lazyScreen(() => require('../screens/LoginScreen').default);
const WelcomeScreen = lazyScreen(() => require('../screens/WelcomeScreen').default);
const QuizScreen = lazyScreen(() => require('../screens/QuizScreen').default);
const PlanPreviewScreen = lazyScreen(() => require('../screens/PlanPreviewScreen').default);

// Main screens (Pro-gated screens are defined with their guard in the
// "Pro-only screens" block further down, so each appears exactly once).
const HomeScreen = lazyScreen(() => require('../screens/HomeScreen').default);
const ActiveWorkoutScreen = lazyScreen(() => require('../screens/ActiveWorkoutScreen').default);
const BuildWorkoutScreen = lazyScreen(() => require('../screens/BuildWorkoutScreen').default);
const WorkoutHistoryScreen = lazyScreen(() => require('../screens/WorkoutHistoryScreen').default);
const WorkoutSummaryScreen = lazyScreen(() => require('../screens/WorkoutSummaryScreen').default);
const ExerciseDetailScreen = lazyScreen(() => require('../screens/ExerciseDetailScreen').default);
const AnalyticsScreen = lazyScreen(() => require('../screens/AnalyticsScreen').default);
const VolumeHeatmapScreen = lazyScreen(() => require('../screens/VolumeHeatmapScreen').default);
const SettingsScreen = lazyScreen(() => require('../screens/SettingsScreen').default);
const SettingsWorkoutScreen = lazyScreen(() => require('../screens/SettingsWorkoutScreen').default);
const SettingsAccountScreen = lazyScreen(() => require('../screens/SettingsAccountScreen').default);
const SettingsProfileScreen = lazyScreen(() => require('../screens/SettingsProfileScreen').default);
const SettingsCoachingScreen = lazyScreen(() => require('../screens/SettingsCoachingScreen').default);
const SettingsDisplayScreen = lazyScreen(() => require('../screens/SettingsDisplayScreen').default);
const SettingsHealthScreen = lazyScreen(() => require('../screens/SettingsHealthScreen').default);
// CC26: the capability lane's settings home. UNGUARDED by law (CAP-19,
// pinned by capabilityGuards.test.js) - core capability accommodation is
// never Pro-gated.
const HowYouTrainScreen = lazyScreen(() => require('../screens/HowYouTrainScreen').default);
const HowYouTrainAddScreen = lazyScreen(() => require('../screens/HowYouTrainAddScreen').default);
const TrainingConsiderationsScreen = lazyScreen(() => require('../screens/TrainingConsiderationsScreen').default);
const SettingsDataScreen = lazyScreen(() => require('../screens/SettingsDataScreen').default);
const SettingsDietaryScreen = lazyScreen(() => require('../screens/SettingsDietaryScreen').default);
const SnapshotsScreen = lazyScreen(() => require('../screens/SnapshotsScreen').default);
const SettingsPrivacyScreen = lazyScreen(() => require('../screens/SettingsPrivacyScreen').default);
const SettingsAboutScreen = lazyScreen(() => require('../screens/SettingsAboutScreen').default);
const SettingsFaqScreen = lazyScreen(() => require('../screens/SettingsFaqScreen').default);
const LiftProgressScreen = lazyScreen(() => require('../screens/LiftProgressScreen').default);
const ConsistencyScreen = lazyScreen(() => require('../screens/ConsistencyScreen').default);
const YouScreen = lazyScreen(() => require('../screens/YouScreen').default);
const AthleteProfileScreen = lazyScreen(() => require('../screens/AthleteProfileScreen').default);
const PlansScreen = lazyScreen(() => require('../screens/PlansScreen').default);
const PlanDetailScreen = lazyScreen(() => require('../screens/PlanDetailScreen').default);
const RoutineDetailScreen = lazyScreen(() => require('../screens/RoutineDetailScreen').default);
const MesocycleBuilderScreen = lazyScreen(() => require('../screens/MesocycleBuilderScreen').default);
// D107-2/D109-3: the "Avoided movements" list home, reached from PlansScreen
// Plan tools.
const AvoidedMovementsScreen = lazyScreen(() => require('../screens/AvoidedMovementsScreen').default);
const ShareCardScreen = lazyScreen(() => require('../screens/ShareCardScreen').default);
const ManualBuilderScreen = lazyScreen(() => require('../screens/ManualBuilderScreen').default);
const PlanLibraryScreen = lazyScreen(() => require('../screens/PlanLibraryScreen').default);
const Article9ConsentScreen = lazyScreen(() => require('../screens/Article9ConsentScreen').default);
const MethodologyScreen = lazyScreen(() => require('../screens/MethodologyScreen').default);
const GoalChangeSummaryScreen = lazyScreen(() => require('../screens/GoalChangeSummaryScreen').default);
const GoalLockConsentScreen = lazyScreen(() => require('../screens/GoalLockConsentScreen').default);
const NotificationSettingsScreen = lazyScreen(() => require('../screens/NotificationSettingsScreen').default);
const CreditsScreen = lazyScreen(() => require('../screens/CreditsScreen').default);
const ImportScreen = lazyScreen(() => require('../screens/ImportScreen').default);
const ProOnboardingScreen = lazyScreen(() => require('../screens/ProOnboardingScreen').default);
const ProSetupCompleteScreen = lazyScreen(() => require('../screens/ProSetupCompleteScreen').default);
const CoachHeldHistoryScreen = lazyScreen(() => require('../screens/CoachHeldHistoryScreen').default);
const CoachReviewScreen = lazyScreen(() => require('../screens/CoachReviewScreen').default);
const BlockReflectionScreen = lazyScreen(() => require('../screens/BlockReflectionScreen').default);
const YearOfLiftsScreen = lazyScreen(() => require('../screens/YearOfLiftsScreen').default);
const WellbeingCheckScreen = lazyScreen(() => require('../screens/WellbeingCheckScreen').default);
const PrivacyPolicyScreen = lazyScreen(() => require('../screens/PrivacyPolicyScreen').default);
const DebugLogScreen = lazyScreen(() => require('../screens/DebugLogScreen').default);
const NutritionEducationScreen = lazyScreen(() => require('../screens/NutritionEducationScreen').default);
// Community (blueprint 30-BLUEPRINT.md section 1). Every Community screen
// is registered in HomeStack, pushed (slide), headerShown false, each
// rendering its own BackHeader. Lazy like every other screen: none of this
// module graph is evaluated until someone opens Community.
const CommunityHubScreen = lazyScreen(() => require('../screens/CommunityHubScreen').default);
const CommunityJoinScreen = lazyScreen(() => require('../screens/CommunityJoinScreen').default);
const CommunityEditProfileScreen = lazyScreen(() => require('../screens/CommunityEditProfileScreen').default);
const CommunityProfileScreen = lazyScreen(() => require('../screens/CommunityProfileScreen').default);
const CommunitySearchScreen = lazyScreen(() => require('../screens/CommunitySearchScreen').default);
const CommunityActivityScreen = lazyScreen(() => require('../screens/CommunityActivityScreen').default);
const CommunityDimensionScreen = lazyScreen(() => require('../screens/CommunityDimensionScreen').default);
const CommunityRulesScreen = lazyScreen(() => require('../screens/CommunityRulesScreen').default);
const CommunityPrivacyScreen = lazyScreen(() => require('../screens/CommunityPrivacyScreen').default);
const CommunityModerationScreen = lazyScreen(() => require('../screens/CommunityModerationScreen').default);
const CommunityProgrammeScreen = lazyScreen(() => require('../screens/CommunityProgrammeScreen').default);
const CommunityAdaptScreen = lazyScreen(() => require('../screens/CommunityAdaptScreen').default);
const CommunityPublishProgrammeScreen = lazyScreen(() => require('../screens/CommunityPublishProgrammeScreen').default);
const CommunityComposeScreen = lazyScreen(() => require('../screens/CommunityComposeScreen').default);
const CommunityPostScreen = lazyScreen(() => require('../screens/CommunityPostScreen').default);
// Dormant billing surfaces (founder decision: Volyume is fully free, no
// Free/Pro split, no trial, no paywall). SubscriptionScreen, CascadeGateScreen,
// ProUpgradeScreen and SubscriptionPolicyScreen remain on disk at
// src/screens/{Subscription,CascadeGate,ProUpgrade,SubscriptionPolicy}Screen.js
// but are no longer required/registered anywhere in this navigator, so they
// are not lazyScreen-wrapped here either -- an unused lazyScreen const would
// only be dead weight. Re-wire them (lazyScreen const + Stack.Screen
// registration in the relevant stack(s)) only on a deliberate future
// monetisation decision, never incidentally.
import { withScreenBoundaries } from '../components/ScreenBoundary';
import VolyumeTabBar from '../components/VolyumeTabBar';
// CP-7 (design-usability audit 2026-07-09, coverage-06-competitive-hps.md):
// opt-in biometric app lock. See src/lib/biometricLock.js's file header for
// the full placement rationale -- this hook/screen are wired ONLY inside
// LockedMainTabs below, which wraps the navigator's existing final
// `MainTabs` branch. It never touches the auth/Article-9/onboarding
// branches above it in renderNavigator().
import { useAppLockGate } from '../lib/biometricLock';
import BiometricLockScreen from '../components/BiometricLockScreen';

// F8 (audit PR-7): per-screen error boundaries. The installed React
// Navigation v6 (@react-navigation/native 6.1.18) has no `screenLayout`
// prop (that arrived in v7), so the seam is the navigator factory:
// withScreenBoundaries wraps the factory result so every registered
// screen's `component` renders inside its own ScreenBoundary, scoped by
// route name (see ScreenBoundary.js for the mechanism). One wrap point
// covers every screen in every stack plus each tab's stack itself, so a
// render throw in one screen degrades to that screen's calm fallback
// instead of felling the whole app into the root App.js crash screen,
// whose Retry re-renders the identical tree.
//
// This wraps screen RENDERING only. The renderNavigator() routing below
// (auth, Article 9 consent gate, first-run, tier) is untouched and
// re-evaluates on every render: a crash inside the consent screen shows
// the fallback INSIDE the still-mounted consent stack, so the gate
// cannot be skipped (it fails closed, as required).
const Tab = withScreenBoundaries(createBottomTabNavigator());
const Stack = withScreenBoundaries(createStackNavigator());

// AUTH-4 (I2): supabase fires SIGNED_IN and INITIAL_SESSION for the same
// session on one launch (and rapid sign-out/sign-in produces repeats). The
// run-lock already dedupes the syncAll, but the rest of the enter pipeline
// (cloud restore, tier refresh, cross-user wipe) needn't run twice. Track the
// last enter so a repeat for the same uid within a short window is skipped.
let _lastAuthEnter = { uid: null, at: 0 };

// C-2 safety net (trial-subscription audit): after the cloud tier read, check
// Play directly for a paid_pro user and downgrade if the subscription has
// lapsed (the RTDN Pub/Sub push that would normally report this is a separate
// console step). No-op on the stub provider, on a failed Play read, and for any
// user who is not paid_pro, see cascade.reconcilePaidEntitlement for the guards.
function _reconcilePaidEntitlement(userId = null) {
  try {
    // eslint-disable-next-line global-require
    // Through the payments barrel, which is the billing-disabled boundary
    // (fully free product, D137): while FULL_ACCESS_FOR_ALL is on this
    // resolves to { ok: false, checked: false } without touching the network.
    const { cascade: { reconcilePaidEntitlement } } = require('../lib/payments');
    return Promise.resolve(reconcilePaidEntitlement(useAppStore.getState().userProfile))
      .then((result) => {
        // COMP-025-A: an authoritative paid_pro→free lapse arms the post-churn
        // win-back loop; a confirmed-active result clears it. Fire-and-forget,
        // it must never block or alter the tier refresh. lapseDetect makes no
        // entitlement decision; it only reads this result.
        try {
          // eslint-disable-next-line global-require
          const { handlePotentialLapse } = require('../lib/payments');
          handlePotentialLapse(result, userId ?? useAppStore.getState().user?.id ?? null).catch(() => {});
        } catch (_) { /* best-effort */ }
        return result;
      });
  } catch (_) {
    return Promise.resolve();
  }
}

// Formerly Pro-only screens. Founder decision (fully-free product, no
// Free/Pro split, no trial, no paywall): every screen below was previously
// wrapped in withProGuard / withReadOnlyProGuard from ../components/ProGate.
// ProGate.js stays on disk as a DORMANT module (its exports are unused by
// this file now) in case a future deliberate monetisation decision brings
// tiered access back; until then these are plain, ungated registrations
// like every other screen in this file.
const WeeklyCheckInScreen = lazyScreen(() => require('../screens/WeeklyCheckInScreen').default);
const NutritionTargetsScreen = lazyScreen(() => require('../screens/NutritionTargetsScreen').default);
const MealNamesScreen = lazyScreen(() => require('../screens/MealNamesScreen').default);
const BodyMetricsScreen      = lazyScreen(() => require('../screens/BodyMetricsScreen').default);
const ProgressPhotosScreen   = lazyScreen(() => require('../screens/ProgressPhotosScreen').default);
const PartnerScreen          = lazyScreen(() => require('../screens/PartnerScreen').default);
const CoachOutputScreen      = lazyScreen(() => require('../screens/CoachOutputScreen').default);
const WeeklyStoryScreen      = lazyScreen(() => require('../screens/WeeklyStoryScreen').default);
const ProGoalSetupScreen     = lazyScreen(() => require('../screens/ProGoalSetupScreen').default);
const PlanUpdateScreen       = lazyScreen(() => require('../screens/PlanUpdateScreen').default);
const CoachingRemindersScreen = lazyScreen(() => require('../screens/CoachingRemindersScreen').default);
const DiaryScreen            = lazyScreen(() => require('../screens/DiaryScreen').default);
const MealPlanScreen         = lazyScreen(() => require('../screens/MealPlanScreen').default);
const FoodSearchScreen       = lazyScreen(() => require('../screens/FoodSearchScreen').default);
const AddCustomFoodScreen    = lazyScreen(() => require('../screens/AddCustomFoodScreen').default);
const ScanBarcodeScreen      = lazyScreen(() => require('../screens/ScanBarcodeScreen').default);
const ScanLabelScreen        = lazyScreen(() => require('../screens/ScanLabelScreen').default);
const FoodInsightsScreen     = lazyScreen(() => require('../screens/FoodInsightsScreen').default);
const MyRecipesScreen        = lazyScreen(() => require('../screens/MyRecipesScreen').default);
const MyMealsScreen          = lazyScreen(() => require('../screens/MyMealsScreen').default);
const RecipeBuilderScreen    = lazyScreen(() => require('../screens/RecipeBuilderScreen').default);

// CP-10 stage 2: `useStackOptions` (was a module-scope `stackOptions` const
// baked from the static `colors` singleton at import time, class 2, CP-10
// plan section 1.4/2.2 -- listed there by name) now lives in ./navTheme, a
// standalone module with no @react-navigation import so it stays unit-
// testable (see that file's header comment). Every Stack.Navigator
// screenOptions call site below calls it inline (same pattern as the
// pre-existing useStackMotionOverride()), so header/card colours follow a
// live theme change with no restart.

// Hero-zoom transition for screens that "expand" out of a card on the
// previous screen (ActiveWorkout opening from the Continue / Next
// Session hero on Home, WorkoutSummary appearing after a finished
// session, and the PlanDetail / RoutineDetail / ExerciseDetail screens
// opening from their list cards, design audit D2, applied to every
// registration of those screens across the stacks below).
// The destination fades in while scaling from 0.92 to 1.0
// so it reads as the source card growing into a full screen rather
// than a flat slide. Matches the Whoop / Apple Health pattern of
// "tap a card → it expands".
// Shared timing for every hero-zoom registration (calm enter, quicker exit).
const heroZoomTransitionSpec = {
  open: { animation: 'timing', config: { duration: motion.enter } },
  close: { animation: 'timing', config: { duration: motion.exit } },
};

// Builds the card interpolator for a hero-zoom push. When `origin` is a
// measured rect ({ x, y, width, height } in window coords, supplied by the
// tapping card via PressableCard's measure API in the destination route's
// __heroOrigin param, D31), the incoming screen grows FROM that rect: it
// starts scaled down and offset so it reads as the tapped card expanding
// into the full screen, then settles to identity. When `origin` is absent
// (cross-tab pushes, programmatic navigation) this is byte-identical to the
// original centre zoom (opacity 0->1, scale 0.92->1).
function makeHeroZoomCardStyle(origin) {
  return ({ current, layouts }) => {
    // Defensive: react-navigation can call this with current.progress
    // missing during certain pop/back gestures, which throws an
    // "interpolate of undefined" the user reads as an app crash on
    // first session-start. Fall back to the default opacity behaviour
    // so the transition still completes cleanly.
    if (!current?.progress) {
      return { cardStyle: { opacity: 1 } };
    }
    const opacity = current.progress.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 1],
    });
    const screen = layouts?.screen;
    if (origin && Number.isFinite(origin.width) && origin.width > 0 && screen?.width && screen?.height) {
      const originCx = origin.x + origin.width / 2;
      const originCy = origin.y + origin.height / 2;
      // Uniform scale kept in a calm band so the screen always grows a little
      // (never a distant, tiny-far zoom, never an overshoot past 1); the
      // translate carries that growth out of the card's real position on the
      // previous screen.
      const startScale = Math.min(0.95, Math.max(0.85, origin.width / screen.width));
      const translateX = current.progress.interpolate({
        inputRange: [0, 1],
        outputRange: [originCx - screen.width / 2, 0],
      });
      const translateY = current.progress.interpolate({
        inputRange: [0, 1],
        outputRange: [originCy - screen.height / 2, 0],
      });
      const scale = current.progress.interpolate({
        inputRange: [0, 1],
        outputRange: [startScale, 1],
      });
      return { cardStyle: { opacity, transform: [{ translateX }, { translateY }, { scale }] } };
    }
    const scale = current.progress.interpolate({
      inputRange: [0, 1],
      outputRange: [0.92, 1],
    });
    return { cardStyle: { opacity, transform: [{ scale }] } };
  };
}

// Static centre-zoom transition: every registration that never supplies an
// origin (ActiveWorkout / WorkoutSummary / PlanDetail / RoutineDetail) keeps
// exactly this behaviour.
const heroZoomTransition = {
  cardStyleInterpolator: makeHeroZoomCardStyle(null),
  transitionSpec: heroZoomTransitionSpec,
};

// Origin-aware screen options for hero-zoom destinations that CAN receive a
// tapped-card origin (currently ExerciseDetail). Reads the destination
// route's __heroOrigin and builds the growing interpolator; with no origin
// present it produces the identical centre zoom, so this is a safe drop-in
// for any hero-zoom registration.
function heroZoomOptions(extra) {
  return ({ route }) => ({
    ...(extra || {}),
    transitionSpec: heroZoomTransitionSpec,
    cardStyleInterpolator: makeHeroZoomCardStyle(route?.params?.__heroOrigin || null),
  });
}

// Pulled from the store at render time so toggling Reduce Motion takes
// effect on the next navigation push without an app restart. Returns an
// override merged into the per-stack screenOptions in each navigator.
function useStackMotionOverride() {
  const reduceMotion = useAppStore(s => s.accessibility?.reduceMotion);
  return reduceMotion ? { animationEnabled: false } : null;
}

function DiaryStack({ navigation }) {
  useEffect(() => {
    // NAV-5: pop to the tab's root only when re-pressing the tab that is
    // already focused (the standard re-tap-to-root pattern). Switching tabs
    // must NOT pop, so the user's place in a stack survives a tab round-trip.
    return navigation.addListener('tabPress', () => {
      if (!navigation.isFocused()) return;
      navigation.dispatch(StackActions.popToTop());
    });
  }, [navigation]);
  return (
    <Stack.Navigator screenOptions={{ ...useStackOptions(), ...(useStackMotionOverride() || {}) }}>
      <Stack.Screen name="Diary" component={DiaryScreen} options={{ headerShown: false }} />
      <Stack.Screen
        name="MealPlan"
        component={MealPlanScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="FoodSearch"
        component={FoodSearchScreen}
        options={{ headerShown: false, presentation: 'modal' }}
      />
      <Stack.Screen
        name="AddCustomFood"
        component={AddCustomFoodScreen}
        options={{ headerShown: false, presentation: 'modal' }}
      />
      <Stack.Screen
        name="ScanBarcode"
        component={ScanBarcodeScreen}
        options={{ headerShown: false, presentation: 'modal' }}
      />
      <Stack.Screen
        name="ScanLabel"
        component={ScanLabelScreen}
        options={{ headerShown: false, presentation: 'modal' }}
      />
      <Stack.Screen
        name="FoodInsights"
        component={FoodInsightsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="MyRecipes"
        component={MyRecipesScreen}
        options={{ headerShown: false, presentation: 'modal' }}
      />
      <Stack.Screen
        name="MyMeals"
        component={MyMealsScreen}
        options={{ headerShown: false, presentation: 'modal' }}
      />
      <Stack.Screen
        name="RecipeBuilder"
        component={RecipeBuilderScreen}
        options={{ headerShown: false, presentation: 'modal' }}
      />
      {/* ProUpgrade is a dormant billing surface (fully-free product) and is
          no longer registered here -- see the dormant-screens comment near
          the lazyScreen declarations above. */}
    </Stack.Navigator>
  );
}

function HomeStack({ navigation }) {
  useEffect(() => {
    // NAV-5: pop to the tab's root only when re-pressing the tab that is
    // already focused (the standard re-tap-to-root pattern). Switching tabs
    // must NOT pop, so the user's place in a stack survives a tab round-trip.
    return navigation.addListener('tabPress', () => {
      if (!navigation.isFocused()) return;
      navigation.dispatch(StackActions.popToTop());
    });
  }, [navigation]);
  return (
    <Stack.Navigator screenOptions={{ ...useStackOptions(), ...(useStackMotionOverride() || {}) }}>
      <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
      <Stack.Screen name="BuildWorkout" component={BuildWorkoutScreen} options={{ headerShown: false }} />
      <Stack.Screen name="ActiveWorkout" component={ActiveWorkoutScreen} options={{ headerShown: false, ...heroZoomTransition }} />
      <Stack.Screen name="WorkoutSummary" component={WorkoutSummaryScreen} options={{ headerShown: false, ...heroZoomTransition }} />
      <Stack.Screen name="WorkoutHistory" component={WorkoutHistoryScreen} options={{ headerShown: false }} />
      <Stack.Screen name="ShareCard" component={ShareCardScreen} options={{ headerShown: false }} />
      <Stack.Screen name="CoachReview" component={CoachReviewScreen} options={{ headerShown: false }} />
      {/* ProUpgrade and FreeStarter are removed: ProUpgrade is a dormant
          billing surface (fully-free product, no Free/Pro split); FreeStarter
          and the free-tier no-plan card that linked to it were deleted with
          the free onboarding path (src/screens/FreeStarterScreen.js,
          src/lib/onboarding/freeStarter.js's screen consumer removed --
          see RootNavigator's dormant-screens comment above). */}
      {/* ActiveWorkout's "Swap and note a temporary change" navigates here.
          It wraps its call in try/catch, which never caught anything: an
          unregistered route is dropped silently rather than thrown, so the
          tap simply did nothing. All three are free by law (CAP-19) and
          unguarded in the main stack.
          Swept by navigation/__tests__/capabilityRoutesReachable.test.js. */}
      <Stack.Screen name="HowYouTrain" component={HowYouTrainScreen} options={{ headerShown: false }} />
      <Stack.Screen name="HowYouTrainAdd" component={HowYouTrainAddScreen} options={{ headerShown: false }} />
      <Stack.Screen name="TrainingConsiderations" component={TrainingConsiderationsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="SettingsWorkout" component={SettingsWorkoutScreen} options={{ headerShown: false }} />
      {/* CC33 T1-20: HowYouTrain's preference cross-reference row links to
          AvoidedMovements (transitive closure; its only outbound link is
          HowYouTrain, already above). */}
      <Stack.Screen name="AvoidedMovements" component={AvoidedMovementsScreen} options={{ headerShown: false }} />
      {/* Community (blueprint section 1). One destination, reached from the
          Today header, the Coach Support row, the Train programmes row and
          the deep links below; every screen is pushed and draws its own
          BackHeader. */}
      <Stack.Screen name="Community" component={CommunityHubScreen} options={{ headerShown: false }} />
      <Stack.Screen name="CommunityJoin" component={CommunityJoinScreen} options={{ headerShown: false }} />
      <Stack.Screen name="CommunityEditProfile" component={CommunityEditProfileScreen} options={{ headerShown: false }} />
      <Stack.Screen name="CommunityProfile" component={CommunityProfileScreen} options={{ headerShown: false }} />
      <Stack.Screen name="CommunitySearch" component={CommunitySearchScreen} options={{ headerShown: false }} />
      <Stack.Screen name="CommunityActivity" component={CommunityActivityScreen} options={{ headerShown: false }} />
      <Stack.Screen name="CommunityDimension" component={CommunityDimensionScreen} options={{ headerShown: false }} />
      <Stack.Screen name="CommunityRules" component={CommunityRulesScreen} options={{ headerShown: false }} />
      <Stack.Screen name="CommunityPrivacy" component={CommunityPrivacyScreen} options={{ headerShown: false }} />
      <Stack.Screen name="CommunityModeration" component={CommunityModerationScreen} options={{ headerShown: false }} />
      <Stack.Screen name="CommunityProgramme" component={CommunityProgrammeScreen} options={{ headerShown: false }} />
      <Stack.Screen name="CommunityAdapt" component={CommunityAdaptScreen} options={{ headerShown: false }} />
      <Stack.Screen name="CommunityPublishProgramme" component={CommunityPublishProgrammeScreen} options={{ headerShown: false }} />
      <Stack.Screen name="CommunityCompose" component={CommunityComposeScreen} options={{ headerShown: false }} />
      <Stack.Screen name="CommunityPost" component={CommunityPostScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}

function PlansStack({ navigation }) {
  useEffect(() => {
    // NAV-5: pop to the tab's root only when re-pressing the tab that is
    // already focused (the standard re-tap-to-root pattern). Switching tabs
    // must NOT pop, so the user's place in a stack survives a tab round-trip.
    return navigation.addListener('tabPress', () => {
      if (!navigation.isFocused()) return;
      navigation.dispatch(StackActions.popToTop());
    });
  }, [navigation]);
  return (
    <Stack.Navigator screenOptions={{ ...useStackOptions(), ...(useStackMotionOverride() || {}) }}>
      <Stack.Screen name="Plans" component={PlansScreen} options={{ headerShown: false }} />
      <Stack.Screen name="PlanUpdate" component={PlanUpdateScreen} options={{ headerShown: false }} />
      <Stack.Screen name="PlanDetail" component={PlanDetailScreen} options={{ headerShown: false, ...heroZoomTransition }} />
      <Stack.Screen name="RoutineDetail" component={RoutineDetailScreen} options={{ headerShown: false, ...heroZoomTransition }} />
      <Stack.Screen name="ExerciseDetail" component={ExerciseDetailScreen} options={heroZoomOptions({ headerShown: false })} />
      <Stack.Screen name="ManualBuilder" component={ManualBuilderScreen} options={{ headerShown: false }} />
      <Stack.Screen name="PlanLibrary" component={PlanLibraryScreen} options={{ headerShown: false }} />
      <Stack.Screen name="MesocycleBuilder" component={MesocycleBuilderScreen} options={{ headerShown: false }} />
      {/* D107-2/D109-3: the movement-pattern constraints list, reached from
          the Plan tools "Avoided movements" row. Set/clear stays on the
          exercise long-press (RoutineDetailScreen); this is the list home
          with per-row removal. */}
      <Stack.Screen name="AvoidedMovements" component={AvoidedMovementsScreen} options={{ headerShown: false }} />
      {/* CC26: capability settings home ("Injuries & limitations"). Free tier, CAP-19. */}
      <Stack.Screen name="HowYouTrain" component={HowYouTrainScreen} options={{ headerShown: false }} />
      <Stack.Screen name="HowYouTrainAdd" component={HowYouTrainAddScreen} options={{ headerShown: false }} />
      {/* Gap-closure Phase D: free-tier discovery surface (CAP-19), unguarded like HowYouTrain. */}
      <Stack.Screen name="TrainingConsiderations" component={TrainingConsiderationsScreen} options={{ headerShown: false }} />
      {/* HowYouTrain (above) links here, so registering it without this one
          only moves the dead tap one screen along. See the sweep in
          navigation/__tests__/capabilityRoutesReachable.test.js. */}
      <Stack.Screen name="SettingsWorkout" component={SettingsWorkoutScreen} options={{ headerShown: false }} />
      {/* ProUpgrade and FreeStarter removed -- see the dormant-screens
          comment near the lazyScreen declarations above. */}
    </Stack.Navigator>
  );
}

function ProgressStack({ navigation }) {
  useEffect(() => {
    // NAV-5: pop to the tab's root only when re-pressing the tab that is
    // already focused (the standard re-tap-to-root pattern). Switching tabs
    // must NOT pop, so the user's place in a stack survives a tab round-trip.
    return navigation.addListener('tabPress', () => {
      if (!navigation.isFocused()) return;
      navigation.dispatch(StackActions.popToTop());
    });
  }, [navigation]);
  return (
    <Stack.Navigator screenOptions={{ ...useStackOptions(), ...(useStackMotionOverride() || {}) }}>
      <Stack.Screen name="Analytics" component={AnalyticsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="WorkoutHistory" component={WorkoutHistoryScreen} options={{ headerShown: false }} />
      <Stack.Screen name="WorkoutSummary" component={WorkoutSummaryScreen} options={{ headerShown: false, ...heroZoomTransition }} />
      <Stack.Screen name="VolumeHeatmap" component={VolumeHeatmapScreen} options={{ headerShown: false }} />
      <Stack.Screen name="BodyMetrics" component={BodyMetricsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="ProgressPhotos" component={ProgressPhotosScreen} options={{ headerShown: false }} />
      <Stack.Screen name="LiftProgress" component={LiftProgressScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Consistency" component={ConsistencyScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Partner" component={PartnerScreen} options={{ headerShown: false }} />
      <Stack.Screen name="ExerciseDetail" component={ExerciseDetailScreen} options={heroZoomOptions({ headerShown: false })} />
      <Stack.Screen name="YearOfLifts" component={YearOfLiftsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="RecapStory" component={YearOfLiftsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="ShareCard" component={ShareCardScreen} options={{ headerShown: false }} />
      {/* CC33 W3 (audit T2-07): WorkoutSummary's post-workout "How you
          train" link must work on HISTORY reopens too, and this stack
          mounts WorkoutSummary for exactly those. TrainingConsiderations
          rides along as HowYouTrain's own outbound target (transitive
          closure). Swept by navigation/__tests__/
          capabilityRoutesReachable.test.js, which caught this gap. */}
      <Stack.Screen name="HowYouTrain" component={HowYouTrainScreen} options={{ headerShown: false }} />
      <Stack.Screen name="HowYouTrainAdd" component={HowYouTrainAddScreen} options={{ headerShown: false }} />
      <Stack.Screen name="TrainingConsiderations" component={TrainingConsiderationsScreen} options={{ headerShown: false }} />
      {/* CC33 T1-20: HowYouTrain's preference cross-reference row links to
          AvoidedMovements, so it rides along here too (its own only
          outbound link is HowYouTrain, already above - closure ends). */}
      <Stack.Screen name="AvoidedMovements" component={AvoidedMovementsScreen} options={{ headerShown: false }} />
      {/* SettingsWorkout is HowYouTrain's other outbound target (the
          session-length row) - one more hop of the same transitive
          closure the sweep enforces. */}
      <Stack.Screen name="SettingsWorkout" component={SettingsWorkoutScreen} options={{ headerShown: false }} />
      {/* ProUpgrade removed -- dormant billing surface, see the comment near
          the lazyScreen declarations above. */}
    </Stack.Navigator>
  );
}

function ProfileStack({ navigation }) {
  useEffect(() => {
    // NAV-5: pop to the tab's root only when re-pressing the tab that is
    // already focused (the standard re-tap-to-root pattern). Switching tabs
    // must NOT pop, so the user's place in a stack survives a tab round-trip.
    return navigation.addListener('tabPress', () => {
      if (!navigation.isFocused()) return;
      navigation.dispatch(StackActions.popToTop());
    });
  }, [navigation]);
  return (
    <Stack.Navigator screenOptions={{ ...useStackOptions(), ...(useStackMotionOverride() || {}) }}>
      <Stack.Screen name="You" component={YouScreen} options={{ headerShown: false }} />
      <Stack.Screen name="AthleteProfile" component={AthleteProfileScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="SettingsWorkout" component={SettingsWorkoutScreen} options={{ headerShown: false }} />
      {/* SettingsScreen's "Injuries & limitations" row links here, and the 1.3.0
          release note sends users to it by name, so this stack has to carry the
          route rather than rely on PlansStack having it. TrainingConsiderations
          rides along as HowYouTrain's own outbound target (transitive closure).
          Swept by navigation/__tests__/capabilityRoutesReachable.test.js. */}
      <Stack.Screen name="HowYouTrain" component={HowYouTrainScreen} options={{ headerShown: false }} />
      <Stack.Screen name="HowYouTrainAdd" component={HowYouTrainAddScreen} options={{ headerShown: false }} />
      <Stack.Screen name="TrainingConsiderations" component={TrainingConsiderationsScreen} options={{ headerShown: false }} />
      {/* CC33 T1-20: HowYouTrain's preference cross-reference row links to
          AvoidedMovements (transitive closure; its only outbound link is
          HowYouTrain, already above). */}
      <Stack.Screen name="AvoidedMovements" component={AvoidedMovementsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="SettingsAccount" component={SettingsAccountScreen} options={{ headerShown: false }} />
      <Stack.Screen name="SettingsProfile" component={SettingsProfileScreen} options={{ headerShown: false }} />
      <Stack.Screen name="SettingsCoaching" component={SettingsCoachingScreen} options={{ headerShown: false }} />
      <Stack.Screen name="SettingsDisplay" component={SettingsDisplayScreen} options={{ headerShown: false }} />
      <Stack.Screen name="SettingsHealth" component={SettingsHealthScreen} options={{ headerShown: false }} />
      <Stack.Screen name="SettingsData" component={SettingsDataScreen} options={{ headerShown: false }} />
      <Stack.Screen name="SettingsDietary" component={SettingsDietaryScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Snapshots" component={SnapshotsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="SettingsPrivacy" component={SettingsPrivacyScreen} options={{ headerShown: false }} />
      <Stack.Screen name="SettingsAbout" component={SettingsAboutScreen} options={{ headerShown: false }} />
      <Stack.Screen name="SettingsFaq" component={SettingsFaqScreen} options={{ headerShown: false }} />
      <Stack.Screen name="NutritionTargets" component={NutritionTargetsScreen} options={{ headerShown: false }} />
      {/* Retained by founder order 2026-07-13 and deliberately unreachable:
          the "Meal names" settings row was removed (SettingsScreen.js:67-70),
          the screen and route stay registered in case meal renaming returns.
          Not a stale registration - do not "clean it up" (D95). */}
      <Stack.Screen name="MealNames" component={MealNamesScreen} options={{ headerShown: false }} />
      <Stack.Screen name="NutritionEducation" component={NutritionEducationScreen} options={{ headerShown: false }} />
      <Stack.Screen name="BodyMetrics" component={BodyMetricsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="ProgressPhotos" component={ProgressPhotosScreen} options={{ headerShown: false }} />
      <Stack.Screen name="WeeklyCheckIn" component={WeeklyCheckInScreen} options={{ headerShown: false }} />
      <Stack.Screen name="CoachOutput" component={CoachOutputScreen} options={{ headerShown: false }} />
      <Stack.Screen name="WeeklyStory" component={WeeklyStoryScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Methodology" component={MethodologyScreen} options={{ headerShown: false }} />
      <Stack.Screen name="ShareCard" component={ShareCardScreen} options={{ headerShown: false }} />
      <Stack.Screen name="CoachHeldHistory" component={CoachHeldHistoryScreen} options={{ headerShown: false }} />
      <Stack.Screen name="BlockReflection" component={BlockReflectionScreen} options={{ headerShown: false }} />
      <Stack.Screen name="ProGoalSetup" component={ProGoalSetupScreen} options={{ headerShown: false }} />
      <Stack.Screen name="GoalChangeSummary" component={GoalChangeSummaryScreen} options={{ headerShown: false }} />
      <Stack.Screen name="GoalLockConsent" component={GoalLockConsentScreen} options={{ headerShown: false }} />
      <Stack.Screen name="NotificationSettings" component={NotificationSettingsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Import" component={ImportScreen} options={{ headerShown: false }} />
      <Stack.Screen name="CoachingReminders" component={CoachingRemindersScreen} options={{ headerShown: false }} />
      <Stack.Screen name="WellbeingCheck" component={WellbeingCheckScreen} options={{ headerShown: false }} />
      <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} options={{ headerShown: false }} />
      <Stack.Screen name="DebugLog" component={DebugLogScreen} options={{ headerShown: false }} />
      {/* SubscriptionPolicy, Subscription, CascadeGate and ProUpgrade are
          dormant billing surfaces (founder decision: fully-free product, no
          Free/Pro split, no trial, no paywall) and are no longer registered
          here -- see the dormant-screens comment near the lazyScreen
          declarations above. Re-register only on a deliberate future
          monetisation decision. */}
      <Stack.Screen name="Credits" component={CreditsScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}

function MainTabs() {
  // D147: the setup wizard's payoff asks to land on the plan (Train) rather
  // than Today. Read once at mount, then cleared so a later remount of the
  // tabs (sign out and in) opens on the default again.
  const postSetupLanding = useAppStore((st) => st.postSetupLanding);
  const initialTab = postSetupLanding || 'HomeTab';
  useEffect(() => {
    if (postSetupLanding) useAppStore.getState().setPostSetupLanding(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Edge-to-edge inset padding moved into VolyumeTabBar (it reads the safe
  // area itself, exactly as the stock tabBarStyle here used to).
  return (
    <Tab.Navigator
      initialRouteName={initialTab}
      // F6b (audit PR-2/UI-7): tabs are default-LAZY, each non-initial tab
      // stack mounts on its first focus instead of all five mounting (and
      // running their data effects) in one commit at boot. The old eager
      // setting was a deprecated navigator prop with no recorded rationale
      // (lazyScreens.guard pins it out); the tab roots' mount effects were
      // verified self-contained (own-data loads and view-scoped telemetry
      // only, 2026-07-02), and notification-tap / deep-link navigation into
      // an unmounted tab mounts it on demand. HomeTab is the initial tab,
      // so Today still mounts immediately.
      // M1 (audit 03b §3.3f, §4 step 1): a selection tick on tab CHANGE.
      // tabPress reaches only the pressed tab's listener and fires before
      // focus moves, so isFocused() here means a re-press of the already
      // focused tab. That path pops to root (the NAV-5 listeners in each
      // stack) and stays silent. The vocabulary no-ops under reduce motion.
      screenListeners={({ navigation }) => ({
        tabPress: () => {
          if (navigation.isFocused()) return;
          haptics.selection();
        },
      })}
      // E15 (greenlit 2026-07-02): the custom bottom band, sliding-pill tab
      // bar + the active-session mini-bar docked above it. VolyumeTabBar
      // emits tabPress exactly like the stock bar, so the M1 haptic above
      // and each stack's NAV-5 re-tap-to-root listener keep working. The
      // stock tabBarStyle/tint/label options are gone with the stock bar;
      // tabBarIcon stays the single source for icons (the custom bar calls
      // it via descriptors).
      tabBar={(props) => <VolyumeTabBar {...props} />}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused, color }) => {
          const icons = {
            HomeTab: focused ? 'today' : 'today-outline',
            PlansTab: focused ? 'barbell' : 'barbell-outline',
            DiaryTab: focused ? 'nutrition' : 'nutrition-outline',
            ProgressTab: focused ? 'stats-chart' : 'stats-chart-outline',
            ProfileTab: focused ? 'pulse' : 'pulse-outline',
          };
          return <Ionicons name={icons[route.name] || 'ellipse'} size={22} color={color} />;
        },
      })}
    >
      {/* Internal tab route ids are kept stable for deep links, push routing and
          cross-tab helper calls. The visible IA is Today / Train / Nutrition /
          Progress / Coach. */}
      <Tab.Screen name="HomeTab" component={HomeStack} options={{ title: 'Today' }} />
      <Tab.Screen name="PlansTab" component={PlansStack} options={{ title: 'Train' }} />
      <Tab.Screen name="DiaryTab" component={DiaryStack} options={{ title: 'Nutrition' }} />
      <Tab.Screen name="ProgressTab" component={ProgressStack} options={{ title: 'Progress' }} />
      <Tab.Screen name="ProfileTab" component={ProfileStack} options={{ title: 'Coach' }} />
    </Tab.Navigator>
  );
}

// CP-7: the biometric app-lock gate, scoped to MainTabs only (see
// biometricLock.js's file header). Holds a brief resolver (identical in
// spirit to the firstRunChecked/tierChecked splash gate above) until the
// pref is known, so a lock-enabled user never sees a flash of MainTabs
// before the lock overlay appears; a lock-disabled user (the default)
// passes straight through once that one read resolves. MainTabs itself
// stays mounted underneath the lock overlay at all times once shown, so an
// in-progress session (active workout, rest timer) is never unmounted by a
// background/foreground cycle.
function LockedMainTabs() {
  const { checked, locked, authenticating, lastFailed, retryAuth } = useAppLockGate();
  if (!checked) return <SplashScreen />;
  return (
    <View style={{ flex: 1 }}>
      <MainTabs />
      {locked ? (
        <BiometricLockScreen
          authenticating={authenticating}
          lastFailed={lastFailed}
          onRetry={retryAuth}
        />
      ) : null}
    </View>
  );
}

function WelcomeStack() {
  return (
    <Stack.Navigator screenOptions={{ ...useStackOptions(), headerShown: false, ...(useStackMotionOverride() || {}) }}>
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      {/* COMP-030: quiz-first pre-account screens. Registered always (harmless);
          only reached when ONBOARDING_QUIZ_FIRST is on and the user picks Pro. */}
      <Stack.Screen name="QuizTraining" component={QuizScreen} />
      <Stack.Screen name="PlanPreview" component={PlanPreviewScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      {/* D145: the account step links to the policy in-app, so the pre-
          account stack carries the same screen the consent gate does. */}
      <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
    </Stack.Navigator>
  );
}

// FirstRunStack (the free "name only" quick setup, with its FreeStarter
// micro-quiz) was DELETED (founder decision: Volyume is fully free, no
// Free/Pro split -- ProOnboardingScreen's six-step wizard is now the ONE
// setup path for every user, so there is no second, lighter onboarding
// branch to choose between). Its screen files (FirstRunScreen.js,
// FreeStarterScreen.js) are deleted; src/lib/onboarding/freeStarter.js stays
// on disk because PlanDetailScreen.js and PlanLibraryScreen.js still import
// pure helpers from it (getPlanDays / planEquipmentAllows /
// scorePlanRecommendation) unrelated to the onboarding screen itself.

// Article 9 consent gate. Single-screen stack; the consent screen
// itself doesn't navigate anywhere -- on submission the store flips
// healthConsent to true and the navigator re-renders into the
// normal flow (ProOnboardingStack / MainTabs).
function Article9ConsentStack() {
  return (
    <Stack.Navigator screenOptions={{ ...useStackOptions(), headerShown: false, ...(useStackMotionOverride() || {}) }}>
      <Stack.Screen name="Article9Consent" component={Article9ConsentScreen} />
      {/* Registered here so the consent gate can show the policy in-app
          (native PrivacyPolicyScreen, with its own BackHeader) rather than
          bouncing the user out to the system browser mid-consent. */}
      <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
    </Stack.Navigator>
  );
}

function ProOnboardingStack() {
  return (
    <Stack.Navigator screenOptions={{ ...useStackOptions(), headerShown: false, ...(useStackMotionOverride() || {}) }}>
      <Stack.Screen name="ProOnboarding" component={ProOnboardingScreen} />
      {/* Same pre-B2 residue as FirstRunStack (D95, AUDIT-ROUTES 5.7):
          ProOnboarding only ever replaces into ProSetupComplete, so the
          library / plan / workout registrations were unreachable here. */}
      <Stack.Screen name="ProSetupComplete" component={ProSetupCompleteScreen} />
      {/* Registered here too so the onboarding hand-off screen can link
          straight into the nutrition guide without leaving the flow. */}
      <Stack.Screen name="NutritionEducation" component={NutritionEducationScreen} />
      {/* Same precedent (Review A F3 / AUDIT-ROUTES §6 row 11): the
          hand-off screen's "Reminders off" tile links here, and without an
          in-stack registration the tap was silently dropped.
          CoachingReminders rides along because NotificationSettings links
          to it and has no further outbound targets (transitive closure). */}
      <Stack.Screen name="NotificationSettings" component={NotificationSettingsScreen} />
      <Stack.Screen name="CoachingReminders" component={CoachingRemindersScreen} />
      {/* Wave A B3: the hand-off screen links "How Precision Coaching works"
          so the trial is never a black box before the first check-in. */}
      <Stack.Screen name="Methodology" component={MethodologyScreen} options={{ headerShown: false }} />
      {/* Same fault, same fix: ProOnboarding step 5 offers "Yes, let's set that
          up" and links to HowYouTrain, and without an in-stack registration the
          tap was dropped in silence. TrainingConsiderations and SettingsWorkout
          ride along because HowYouTrain links to both and neither leads anywhere
          further (transitive closure), so without them the NEXT tap dies
          instead. All three are free by law (CAP-19), copied unguarded from the
          main stack. Swept by
          navigation/__tests__/capabilityRoutesReachable.test.js. */}
      <Stack.Screen name="HowYouTrain" component={HowYouTrainScreen} options={{ headerShown: false }} />
      <Stack.Screen name="HowYouTrainAdd" component={HowYouTrainAddScreen} options={{ headerShown: false }} />
      <Stack.Screen name="TrainingConsiderations" component={TrainingConsiderationsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="SettingsWorkout" component={SettingsWorkoutScreen} options={{ headerShown: false }} />
      {/* CC33 T1-20: HowYouTrain's preference cross-reference row links to
          AvoidedMovements (transitive closure; its only outbound link is
          HowYouTrain, already above). */}
      <Stack.Screen name="AvoidedMovements" component={AvoidedMovementsScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}

// Deep-linking (U3 R5 / 09-navigation-ia.md; expanded per
// docs/volyume-launch-audit-2026-07-08/00-full-audit.md §15 item 8). React
// Navigation's BUILT-IN `linking` config, no new dependency. Maps
// `volyume://` paths to existing routes inside the signed-in MainTabs tree.
// The scheme `volyume` is already registered in app.json (android.intentFilters
// + ios scheme).
//
// Auth gating is implicit and safe: this config only names screens that live
// inside MainTabs. When the user is signed out (WelcomeStack mounted) or
// mid-onboarding (ProOnboarding/Article9 stacks mounted), none of these
// routes exist in the active navigator, so React Navigation can't resolve
// the URL and simply leaves the user on whatever stack is mounted (Welcome)
// instead of crashing. Once signed in and on MainTabs, the same link
// resolves to the right tab + screen -- every destination below is a plain,
// ungated screen (fully-free product, no Free/Pro split).
//
// Notification-tap routing (navigationRef.navigate in the onTap effect above)
// is a SEPARATE mechanism and is untouched by this config.
// The legacy partner invite path (volyume://partner/<CODE> and
// https://volyume.app/partner/<CODE>, minted by src/lib/partners/link.js and
// already sitting in people's share messages) now lands on Community, which
// shows the "Partner invites have moved" card (blueprint section 1).
//
// It is a rewrite rather than a second config entry because React Navigation
// 6 allows a screen exactly one path pattern, and `Community` already owns
// `community`. The rewrite hands the code over as a query param, so the
// route arrives with { legacyPartnerCode }, and still goes through
// safeGetStateFromPath -- the bounds and validation that module exists for
// are not bypassed.
const LEGACY_PARTNER_PATH = /^\/?partner(?:\/([^/?#]*))?\/?$/;

export function rewriteLegacyCommunityPath(path) {
  if (typeof path !== 'string') return path;
  const [base] = path.split('?');
  const match = LEGACY_PARTNER_PATH.exec(base);
  if (!match) return path;
  const code = match[1] ? decodeURIComponent(match[1]) : '';
  return code ? `community?legacyPartnerCode=${encodeURIComponent(code)}` : 'community';
}

export function getStateFromPathWithLegacy(path, options) {
  return safeGetStateFromPath(rewriteLegacyCommunityPath(path), options);
}

const linking = {
  prefixes: ['volyume://', 'https://volyume.app'],
  getStateFromPath: getStateFromPathWithLegacy,
  config: {
    screens: {
      // Bottom-tab → stack-screen tree. Keys are the tab route names in
      // MainTabs; nested `screens` are the screens registered in each tab's
      // stack navigator (verified against the *Stack functions above).
      HomeTab: {
        screens: {
          // volyume://workout/start → Today tab → blank/build workout screen.
          BuildWorkout: 'workout/start',
          // volyume://active-workout → Today tab root (A3, certification
          // 2026-09-05). The Android foreground-service and rest-chronometer
          // notifications hand this URL to the OS
          // (lib/notifications/activeWorkout.js:152,
          // restForeground.js:72,107) and nothing matched it, so the tap
          // opened the app and navigated nowhere.
          //
          // It maps to Today, NOT to ActiveWorkout, because no route resumes
          // a session on its own: the in-progress workout lives in memory
          // only and is rehydrated by HomeScreen's mount effect
          // (HomeScreen.js:246-248, restoreActiveWorkout). getStateFromPath
          // builds the target route WITHOUT the stack's initial route, so
          // `HomeTab: { ActiveWorkout: 'active-workout' }` would mount
          // ActiveWorkout with a null activeWorkout and no rehydration —
          // an empty live session, which is worse than landing one tap away.
          // Today mounts the restore effect and shows the "Continue active
          // workout" card (HomeScreen.js:2253-2258). Per the ruling: no new
          // resume mechanism is built here.
          Home: 'active-workout',
          // Community (blueprint section 8). The three share pages use a
          // QUERY rather than a path segment (`/u/?h=`), because the site is
          // static GitHub Pages with no path rewriting -- the same shape the
          // partner page already used. React Navigation 6 puts unmatched
          // query params straight into route.params, so `h` and `id` arrive
          // as typed; CommunityProfileScreen reads `handle ?? h` for exactly
          // that reason.
          Community: 'community',
          CommunityProfile: 'u',
          CommunityProgramme: 'p',
          CommunityPost: 's',
        },
      },
      DiaryTab: {
        screens: {
          // volyume://diary(/:date) → Nutrition tab root.
          // The trailing `:date?` is OPTIONAL (react-navigation path syntax):
          // volyume://diary still opens today, volyume://diary/2026-07-08
          // opens that specific day. DiaryScreen reads route.params.date as a
          // local day-key (YYYY-MM-DD, src/lib/dayKey.js) and ignores an
          // absent/invalid value rather than crashing (§15 item 8).
          Diary: 'diary/:date?',
        },
      },
      PlansTab: {
        screens: {
          // volyume://routine/:planId → Train tab → PlanDetail for that plan.
          // The path param MUST be named planId: PlanDetailScreen reads
          // route.params.planId, so the old ':id' arrived as `id` and left
          // planId undefined, dead-ending on a permanently blank screen
          // (audit 2026-07-01).
          PlanDetail: 'routine/:planId',
        },
      },
      ProgressTab: {
        screens: {
          // volyume://progress → Progress tab root (Analytics screen).
          Analytics: 'progress',
          // The partner invite path is no longer registered here: partner
          // links now land on Community (blueprint section 1). See
          // rewriteLegacyCommunityPath above for how the old URLs, which are
          // already out in the world in share messages, get there.
        },
      },
      // §15 item 8: coach output + weekly check-in, the two most-requested
      // notification re-engagement targets (Scout 1's "only 4 deep-link
      // paths" gap).
      ProfileTab: {
        screens: {
          // volyume://coach → Coach tab → latest coaching decision.
          // CoachOutputScreen defaults route.params.weekStart to the
          // current week when absent, so this always opens the LATEST
          // output, matching the weekly_coach_ready notification target.
          CoachOutput: 'coach',
          // volyume://checkin → Coach tab → weekly check-in.
          WeeklyCheckIn: 'checkin',
        },
      },
    },
  },
};

// C5-P29-04: how long the consent-resolver splash may wait before the
// fail-closed failsafe releases it to the Article 9 gate. Deliberately
// generous (the check can involve a cloud read on a poor connection) and far
// beyond any healthy resolution, because the escape it grants is the gate
// itself, never the app.
const CONSENT_LATCH_FAILSAFE_MS = 15000;

// CODE-001: route bootstrap fire-and-forget rejections through the error log,
// not raw console.*, so every fault is captured with a scope and shipped like
// the rest. Lazy-require keeps this file's no-top-level-errorLog idiom and can
// never throw out of a boot path.
function _bootLog(level, scope, err) {
  try {
    // eslint-disable-next-line global-require
    const log = require('../lib/errorLog');
    if (level === 'error') log.logError(scope, err);
    else log.logWarn(scope, err?.message ?? String(err ?? ''));
  } catch (_) { /* never let logging break boot */ }
}

export default function RootNavigator() {
  // Subscribe only to the fields whose change should reroute. Without a
  // selector this re-rendered the entire navigator on every store
  // mutation (rest timer ticks, PR celebrations, set saves, profile
  // tweaks, etc.), a slow leak that compounded throughout a workout.
  const user = useAppStore(s => s.user);
  const isAuthLoading = useAppStore(s => s.isAuthLoading);
  const firstRunComplete = useAppStore(s => s.firstRunComplete);
  const firstRunChecked = useAppStore(s => s.firstRunChecked);
  const healthConsent = useAppStore(s => s.healthConsent);
  const healthConsentChecked = useAppStore(s => s.healthConsentChecked);
  // `tier` itself is no longer read here (founder decision: fully-free
  // product, no Free/Pro onboarding branch) -- tierChecked stays, it still
  // gates the boot splash below.
  const tierChecked = useAppStore(s => s.tierChecked);
  // restoringSession removed, restoreSessionFromCloud is now
  // optimistic (routes on local cues, syncs cloud in background).
  // Actions are stable references in zustand so destructuring them once
  // outside the render is safe and doesn't cause re-renders.
  const setUser = useAppStore(s => s.setUser);
  const setSession = useAppStore(s => s.setSession);
  const setAuthLoading = useAppStore(s => s.setAuthLoading);
  const checkFirstRun = useAppStore(s => s.checkFirstRun);
  const checkTier = useAppStore(s => s.checkTier);
  const refreshTierFromCloud = useAppStore(s => s.refreshTierFromCloud);
  const [splashReady, setSplashReady] = useState(false);
  // Founder defect (2026-07-12, TestFlight): every cold launch flashed the
  // Welcome (free/Pro) page for a beat even when signed in. The splash gate
  // waited on the two fast AsyncStorage flags but NOT on the initial
  // session restore, which sits behind awaited SQLCipher init + migrations
  // in bootstrap() -- so renderNavigator ran its `!user -> WelcomeStack`
  // branch until getSession() landed. This flag latches true ONCE, at the
  // first auth resolution (session found, no session, or bootstrap
  // failure), and never resets, so the OAuth loop that gating on the live
  // isAuthLoading flag caused (it flips on every SIGNED_IN, see the splash
  // gate comment) cannot come back. A hard timeout in the bootstrap effect
  // stops it ever hanging the splash.
  const [initialAuthResolved, setInitialAuthResolved] = useState(false);
  // Campaign 24 Wave E (WAVE-E-FINDINGS.md item 0, the startup
  // auth-hydration flash): distinguish a GENUINE first auth answer from
  // the 8s failsafe giving up. The ref flips true at every real
  // resolution site (session found, definitively no session); the
  // timeout/failure paths check it and, when they fire first, mark the
  // release as a give-up so the render below can hold a
  // previously-signed-in device on a bounded retry state instead of
  // flashing WelcomeStack at a still-resolving user (classifyAuthBoot,
  // src/lib/authBootGate.js).
  const authGenuinelyResolvedRef = useRef(false);
  const [authGaveUp, setAuthGaveUp] = useState(false);
  const [authRetrying, setAuthRetrying] = useState(false);
  // Read fail-quiet to false: a fresh install (no marker, or a failed
  // read) behaves exactly as before this fix — straight to Welcome.
  const [hadPriorSession, setHadPriorSession] = useState(false);
  // D149 (founder, 2026-09-05): a VERIFIED fresh install (no owner marker
  // and no stored auth session, classifyFreshInstall) may open on Welcome
  // at the first frame instead of behind the database open. Flips true
  // once, only when both probes have answered 'absent'; never resets.
  const [freshInstall, setFreshInstall] = useState(false);
  // Release-gate fix: initDatabase() (SQLCipher open + migrations) used to
  // fail INSIDE bootstrap()'s try/catch with only a log call - the app then
  // rendered normally with the local DB permanently unopened (`_db` reset to
  // null by initDatabase's own catch), so every screen silently read empty
  // state forever with no way for the athlete to know why, and no retry
  // path short of reinstalling (which restarts the same broken migration
  // from user_version 0). This state makes that failure a first-class,
  // recoverable boot outcome instead of a silent one. Never reset except by
  // a successful retry - a transient failure must stay visible until it is
  // actually fixed, not disappear on the next unrelated re-render.
  const [dbInitFailed, setDbInitFailed] = useState(false);
  const [dbRetrying, setDbRetrying] = useState(false);
  // CP-10 stage 2: drives the NavigationContainer theme prop below live (was
  // the static resolvedTheme/colors imports, class 3 per the CP-10 plan --
  // already inline JSX, so it only needed RootNavigator itself to re-render
  // on a theme change, which this hook subscription now causes). Derivation
  // + memoization live in ./navTheme (a standalone module for testability --
  // see its header comment).
  const navTheme = useNavTheme();

  // E8 (founder decision 2026-07-02): a returning, already-onboarded user is
  // released the moment the bootstrap checks resolve. The old 350ms
  // anti-flash floor was an artificial delay; the render below is already
  // gated on the same readiness flags, so removal cannot expose a
  // half-ready frame.
  // D149 (founder, 2026-09-05): first-run users are released on the same
  // terms. They used to be held on the native splash for a fixed
  // SPLASH_MIN_MS (1.6 s) "brand hold" that masked exercise seeding; the
  // seeding is fire-and-forget (see attemptDbInit) and nothing the Welcome
  // screen renders depends on it, so the hold was pure delay in front of
  // the first screen. There is no minimum splash time any more: the native
  // frame lifts the moment the boot gate resolves.
  useEffect(() => {
    if (firstRunChecked && tierChecked) {
      setSplashReady(true);
    }
  }, [firstRunChecked, tierChecked]);

  useEffect(() => {
    configureNotificationHandler();
  }, []);

  useEffect(() => {
    // Routing for a tapped notification. The listeners module owns the expo
    // wiring and the telemetry firings; the navigator owns only "given a
    // target, navigate". The data_type -> target mapping is the pure
    // routeForNotificationType helper (tested separately) so every scheduled
    // notification type has a route and none dead-ends.
    function onTap(response) {
      const data = response?.notification?.request?.content?.data;
      const type = data?.type;
      const target = routeForNotificationType(type, data);
      if (!target) return;
      const tryNavigate = (attempts = 0) => {
        if (navigationRef.isReady()) {
          navigationRef.navigate(target.tab, {
            screen: target.screen,
            // F6b: tabs are lazy. Without initial: false, a notification
            // tapped before its tab was ever focused would mount the stack
            // with the target as its ONLY route, stranding the tab root
            // (Coach/Nutrition/Progress) for the whole session. initial: false
            // restores the eager-era push-over-root behaviour.
            initial: false,
            ...(target.params ? { params: target.params } : {}),
          });
        } else if (attempts < 20) {
          setTimeout(() => tryNavigate(attempts + 1), 150);
        }
      };
      tryNavigate();
    }

    const disposeListeners = installNotificationListeners({ onTap });
    // D34: the Android FGS chronometer notification (short rests) carries its
    // own "+15s" / "Skip rest" buttons, delivered via a native
    // Service→module→JS event rather than expo-notifications. Route those taps
    // through the same handleRestTimerAction seam (store guards + clampRestDelta
    // floor + stale-tap no-op). No-op on iOS / Expo Go / older native builds.
    const disposeRestBridge = installRestActionBridge();
    return () => {
      try { disposeListeners(); } catch (_) { /* tolerate */ }
      try { disposeRestBridge(); } catch (_) { /* tolerate */ }
    };
  }, []);

  // Release-gate fix: extracted from bootstrap() so the "Try again" button
  // on the DB-init-failed fallback screen below can re-run EXACTLY the same
  // sequence a cold launch would, rather than duplicating it. Resolves to
  // true/false rather than throwing - both bootstrap() and the retry button
  // need to keep going afterward regardless of outcome.
  // D141 item 2 (2026-09-04): a database open that HANGS (as opposed to
  // throwing) used to slip past this whole mechanism. The 8s auth latch
  // below releases the splash on its own clock, so a stuck SecureStore key
  // read or a locked SQLite file dropped the user into a normal navigator
  // in which every screen's queries waited forever, with no error screen
  // and no way out but killing the app. The open is now bounded: past
  // DB_INIT_TIMEOUT_MS it is treated exactly like a thrown open (logged,
  // dbInitFailed, "Try again"). initDatabase keeps its in-flight promise, so
  // if the slow open does finish later the flag clears itself and the rest
  // of this sequence runs; "Try again" on a still-hung open bounds again.
  const DB_INIT_TIMEOUT_MS = 12000;
  const lateDbInitRef = useRef(false);
  const attemptDbInit = useCallback(async () => {
    try {
      const initPromise = initDatabase();
      let timer = null;
      const timedOut = new Promise((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`initDatabase exceeded ${DB_INIT_TIMEOUT_MS}ms`)), DB_INIT_TIMEOUT_MS);
      });
      try {
        await Promise.race([initPromise, timedOut]);
      } catch (raceErr) {
        if (timer) clearTimeout(timer);
        // Only the timeout re-arms a late completion; a thrown open is a
        // thrown open and is handled by the catch below as before.
        if (/exceeded/.test(String(raceErr?.message)) && !lateDbInitRef.current) {
          lateDbInitRef.current = true;
          initPromise.then(() => { lateDbInitRef.current = false; return attemptDbInitRef.current?.(); })
            .catch(() => { lateDbInitRef.current = false; });
        }
        throw raceErr;
      }
      if (timer) clearTimeout(timer);
      seedExercisesIfNeeded()
        .then(() => topUpNewExercisesIfNeeded())
        .then(() => backfillExerciseMetadataIfNeeded())
        .then(() => rederiveExerciseMetadataIfNeeded())
        .catch((e) => _bootLog('warn', 'RootNavigator.bootstrap.seedExercises', e));
      cleanupOrphanRoutineExercises().catch((e) => _bootLog('warn', 'RootNavigator.bootstrap.cleanupOrphanRoutines', e));
      // OpenFoodFacts UK snapshot import. Idempotent + safe;
      // logs to errorLog at every fault boundary. Fire-and-
      // forget -- doesn't block app boot. On failure, the food
      // layer falls back to live OFF / USDA / manual.
      // eslint-disable-next-line global-require
      require('../lib/food/seed').importOffSnapshotIfNeeded()
        // Surface a RESOLVED failure (asset missing, load_failed, etc.): it
        // was previously ignored, so a non-importing snapshot was invisible
        // (food audit D-4).
        .then((res) => { if (res && res.ok === false) _bootLog('warn', 'RootNavigator.bootstrap.offSnapshot.failed', res.reason); })
        .catch((err) => _bootLog('warn', 'RootNavigator.bootstrap.offSnapshot', err));
      // CoFID UK generic foods (~3k rows). Static dataset, runs
      // once per snapshot version. Fills the gap OFF leaves on
      // raw/unbranded items (chicken breast raw, plain oats, etc.).
      // eslint-disable-next-line global-require
      require('../lib/food/seed').importCofidSnapshotIfNeeded()
        .then((res) => { if (res && res.ok === false) _bootLog('warn', 'RootNavigator.bootstrap.cofidSnapshot.failed', res.reason); })
        .catch((err) => _bootLog('warn', 'RootNavigator.bootstrap.cofidSnapshot', err));
      // Food library delta pull (step 3): refresh local foods
      // cache against cloud foods that were updated since the
      // last pull. Throttled to once per 6 hours by default;
      // skipped silently if no session. Same fire-and-forget
      // pattern as the snapshot import.
      // eslint-disable-next-line global-require
      require('../lib/food/libraryDelta').pullFoodLibraryDelta()
        .then((res) => { if (res && res.ok === false) _bootLog('warn', 'RootNavigator.bootstrap.libraryDelta.failed', res.reason); })
        .catch((err) => _bootLog('warn', 'RootNavigator.bootstrap.libraryDelta', err));
      setDbInitFailed(false);
      return true;
    } catch (e) {
      // eslint-disable-next-line global-require
      try { require('../lib/errorLog').logError('RootNavigator.bootstrap.initDb', e); } catch (_) {}
      // Release-gate fix: this used to be the end of it - the failure was
      // logged and bootstrap silently carried on as if the database had
      // opened. _db stays null (initDatabase's own catch resets it), so
      // every subsequent db() call anywhere in the app re-attempts this
      // SAME failing init and every read function's own try/catch quietly
      // returns []/null - the athlete would see a permanently empty app
      // (no plan, no history, can't start a workout) with no error and no
      // way to recover short of the OS-level "reset app data", on every
      // launch, forever. Surfacing it as recoverable state instead.
      setDbInitFailed(true);
      return false;
    }
  }, []);
  // The late-completion hook above needs the latest attemptDbInit without
  // a self-reference inside useCallback.
  const attemptDbInitRef = useRef(null);
  attemptDbInitRef.current = attemptDbInit;

  const handleDbRetry = useCallback(async () => {
    setDbRetrying(true);
    try {
      await attemptDbInit();
    } finally {
      setDbRetrying(false);
    }
  }, [attemptDbInit]);

  // Campaign 24 Wave E: explicit retry from the auth give-up state. A
  // successful getSession answer (either way) is a GENUINE resolution:
  // session -> onAuthStateChange SIGNED_IN runs the normal enter pipeline;
  // no session -> authGaveUp clears and the navigator's !user branch
  // renders Welcome as a now-honest, definitively signed-out state. A
  // throw/timeout keeps the retry state visible (transient failures stay
  // visible until fixed, the dbInitFailed philosophy).
  const handleAuthRetry = useCallback(async () => {
    setAuthRetrying(true);
    try {
      const client = getSupabaseClient();
      const { data } = await client.auth.getSession();
      authGenuinelyResolvedRef.current = true;
      if (data?.session?.user) {
        // The auth listener (SIGNED_IN fires on getSession restoring a
        // valid session) runs the full enter pipeline; clearing the
        // give-up releases this branch either way.
        setAuthGaveUp(false);
      } else {
        setAuthGaveUp(false); // definitive no-session: Welcome is honest now
      }
    } catch (e) {
      _bootLog('warn', 'RootNavigator.handleAuthRetry', e);
      // Still unreachable: stay on the retry state.
    } finally {
      setAuthRetrying(false);
    }
  }, []);

  // Wave E: the explicit escape hatch — a user CHOICE to go to sign-in is
  // not speculative rendering (founder law bans speculation, not choice).
  const handleAuthGiveUpToWelcome = useCallback(() => {
    authGenuinelyResolvedRef.current = true;
    setAuthGaveUp(false);
  }, []);

  useEffect(() => {
    const queueIncomingSessionRefusal = (client) => {
      setTimeout(() => { client.auth.signOut().catch(() => {}); }, 0);
    };

    // One admission boundary for EVERY session-bearing source: cold-start
    // getSession, INITIAL_SESSION, SIGNED_IN, TOKEN_REFRESHED and USER_UPDATED.
    // Identity publication must never happen in a sibling path that skips the
    // same owner/residue/wipe checks.
    async function preflightIncomingSession(client, session) {
      const incomingUid = session?.user?.id ?? null;
      if (!incomingUid) return { ok: false, reason: 'missing_incoming_user' };

      // verifyOtp installs a session before its promise resolves. Enforce the
      // callback's expected email here, at the actual identity-publication
      // boundary, so a synchronous auth event cannot briefly publish a
      // substituted account before authDeepLink validates the return value.
      try {
        // eslint-disable-next-line global-require
        const callbackAdmission = await require('../lib/authCallbackState')
          .validatePendingAuthCallbackAdmission(session.user);
        if (!callbackAdmission.ok) {
          queueIncomingSessionRefusal(client);
          return { ok: false, reason: callbackAdmission.reason };
        }
      } catch (e) {
        _bootLog('error', 'RootNavigator.accountAdmission.callbackIdentity', e);
        queueIncomingSessionRefusal(client);
        return { ok: false, reason: 'callback_admission_failed' };
      }

      try {
        // eslint-disable-next-line global-require
        const { retryPendingAuthDeletion } = require('../lib/deletionRetry');
        const retry = await retryPendingAuthDeletion(incomingUid);
        if (retry.attempted || retry.pending) {
          try {
            // eslint-disable-next-line global-require
            require('../components/AppAlert').appAlert(
              retry.ok === true ? 'Account deletion complete' : 'Account deletion still pending',
              retry.ok === true
                ? 'Your earlier account deletion has now finished and your sign-in details have been removed. You can create a fresh account any time.'
                : 'You asked us to delete this account and one step is still pending. Connect to the internet and sign in once more to finish removing your sign-in details.',
              [{ text: 'OK' }],
            );
          } catch (_) { /* alert module is optional; refusal still signs out */ }
          queueIncomingSessionRefusal(client);
          return { ok: false, reason: 'account_deletion_pending' };
        }
      } catch (e) {
        _bootLog('error', 'RootNavigator.accountAdmission.deletionCheck', e);
        queueIncomingSessionRefusal(client);
        return { ok: false, reason: 'deletion_check_failed' };
      }

      // eslint-disable-next-line global-require
      const { prepareIncomingAccount } = require('../lib/accountTransitionGuard');
      const transition = await prepareIncomingAccount({
        incomingUid,
        readDeviceOwner: () => AsyncStorage.getItem('@volyume_last_supabase_user_id'),
        verifyFirstAccountClean: async (uid) => {
          const publishedUid = useAppStore.getState().user?.id ?? null;
          if (publishedUid && publishedUid !== uid) {
            return { ok: false, step: 'published_user_without_owner_marker' };
          }
          // eslint-disable-next-line global-require
          const databaseClean = await require('../lib/database').verifyNoForeignLocalData(uid);
          if (!databaseClean.ok) return databaseClean;
          // eslint-disable-next-line global-require
          return require('../lib/deviceWipe').verifyNoForeignAccountStorage(uid);
        },
        chooseAccountSwitch: async () => {
          // eslint-disable-next-line global-require
          const { appAlert } = require('../components/AppAlert');
          return new Promise((resolve) => {
            let settled = false;
            const pick = (value) => { if (!settled) { settled = true; resolve(value); } };
            appAlert(
              'You\'re signing in to a different account',
              'This device currently holds data for another account. Switching removes that local copy before this account opens. Data already synced to the previous account remains in its cloud account.',
              [
                { text: 'Keep this device\'s data', style: 'cancel', onPress: () => pick('keep') },
                { text: 'Switch accounts', style: 'destructive', onPress: () => pick('switch') },
              ],
              { cancelable: false },
            );
          });
        },
        // eslint-disable-next-line global-require
        beginAccountEpoch: () => require('../lib/accountEpoch').beginNewAccountEpoch(),
        quiesceAccountWork: async () => {
          try {
            // eslint-disable-next-line global-require
            require('../lib/sync').cancelScheduledSync();
            // eslint-disable-next-line global-require
            require('../lib/sync/signOutGuard').setSignOutWiping(true);
            // eslint-disable-next-line global-require
            const idle = await require('../lib/sync/runner').whenSyncIdle({ timeoutMs: 5000 });
            return idle ? { ok: true } : { ok: false, step: 'sync_still_running' };
          } catch (_) {
            return { ok: false, step: 'sync_quiesce_error' };
          }
        },
        // eslint-disable-next-line global-require
        wipeNotifications: () => require('../lib/deviceWipe').wipeScheduledNotificationsWithRetry(),
        // eslint-disable-next-line global-require
        wipeDatabase: (uid) => require('../lib/database').wipeAllUserDataWithRetry(uid),
        // eslint-disable-next-line global-require
        wipeStorage: () => require('../lib/deviceWipe').wipeAsyncStorageWithRetry(),
        resetMemory: () => useAppStore.getState().resetAccountMemoryForTransition(),
        writeDeviceOwner: (uid) => AsyncStorage.setItem('@volyume_last_supabase_user_id', uid),
      });
      if (!transition.ok) {
        try {
          // eslint-disable-next-line global-require
          require('../lib/errorLog').logError(
            'SignIn.accountBoundary.refused',
            new Error(`incoming account refused (${transition.reason})`),
            { incoming: incomingUid, previous: transition.previousUid ?? null, step: transition.step ?? null },
          );
        } catch (_) { /* logging must not weaken the fail-closed refusal */ }
        if (transition.reason !== 'kept_device_data') {
          try {
            // eslint-disable-next-line global-require
            require('../components/AppAlert').appAlert(
              "Couldn't switch accounts safely",
              'The previous account could not be fully removed from this device, so the new account was not opened. Try again in a moment.',
              [{ text: 'OK' }],
            );
          } catch (_) { /* alert module is optional; refusal still signs out */ }
        }
        queueIncomingSessionRefusal(client);
      }
      return transition;
    }

    async function bootstrap() {
      try {
        // checkFirstRun / checkTier are AsyncStorage-only (see
        // useAppStore), they never touch SQLite, so start them BEFORE
        // the database init rather than serially after it. Previously
        // the splash waited on DB open + migrations for two flags that
        // need none of it (audit PR-4). The catch handlers are attached
        // immediately so a rejection during initDatabase can't surface
        // as unhandled.
        checkFirstRun().catch((e) => _bootLog('warn', 'RootNavigator.bootstrap.checkFirstRun', e));
        const tierPromise = checkTier().catch((e) => _bootLog('warn', 'RootNavigator.bootstrap.checkTier', e));

        // Await the SQLite init so subsequent reads (the getSession-
        // driven hydrators below) can't race against a half-open
        // database.
        await attemptDbInit();

        // AWAIT checkTier so the local 'pro' value is in the store before
        // refreshTierFromCloud (below) reads it for the beta-demotion
        // guard. Without this they raced: the cloud refresh would see
        // tier=null, fail the "currentTier === 'pro'" check, and accept
        // the cloud's spurious 'free' value. Result was Pro users being
        // silently demoted to Free on every app launch. (checkFirstRun
        // stays fire-and-forget, exactly as before, only its start
        // moved earlier.)
        await tierPromise;

        try {
          const client = getSupabaseClient();
          if (client) {
            const { data: { session } } = await client.auth.getSession();
            if (session?.user) {
              const admission = await preflightIncomingSession(client, session);
              if (!admission.ok) return;
              setSession(session);
              setUser(session.user);

              // Hydrate userProfile + units + barWeight from local
              // AsyncStorage so name, units, plate weight all survive an
              // app restart for cloud-signed-in users. Previously the
              // bootstrap path skipped this entirely if a cloud session
              // existed, the result was firstName disappearing and the
              // user seeing their email everywhere instead. The
              // restoreSessionFromCloud handler only fires on the
              // SIGNED_IN event (fresh sign-in), not on session-restore.
              try {
                const PROFILE_KEY_PFX = '@volyume_user_profile_';
                const raw = await AsyncStorage.getItem(PROFILE_KEY_PFX + session.user.id);
                if (raw) {
                  // eslint-disable-next-line global-require
                  const { migrateProfileGoals } = require('../lib/coachingGoals');
                  const profile = migrateProfileGoals(JSON.parse(raw));
                  useAppStore.setState({
                    userProfile: profile,
                    units: profile?.units || useAppStore.getState().units,
                    barWeight: profile?.barWeight || useAppStore.getState().barWeight,
                    bodyWeightUnits: profile?.bodyWeightUnits || useAppStore.getState().bodyWeightUnits,
                  });
                }
              } catch (_) {
                // Corrupt or missing, fall through; user can re-onboard
                // or the cloud restore will fill it in on next SIGNED_IN.
              }

              // Server-authoritative tier, enforcement point after beta.
              // During beta this guards against spurious pro → free
              // demotion (see useAppStore.refreshTierFromCloud).
              refreshTierFromCloud(client, session.user.id)
                .then(() => _reconcilePaidEntitlement(session.user.id))
                .catch(() => {});

              // Initialise the active store billing provider with the user's
              // auth uid. Android uses it as the obfuscated account ID; iOS
              // binds it into StoreKit as the app account token. No-op if the
              // native module isn't linked in this build; the stub provider
              // stays in place and purchase taps surface a clean error rather
              // than crashing.
              try {
                // eslint-disable-next-line global-require
                // Through the payments barrel, the billing-disabled boundary
                // (fully free product, D137): initialise is a no-op there.
                const { playBilling } = require('../lib/payments');
                playBilling.initialise({ appUserID: session.user.id }).catch(() => {});
              } catch (_) { /* lib not loadable in this env */ }

              setAuthLoading(false);
              authGenuinelyResolvedRef.current = true; // Wave E: real answer (session found)
              setInitialAuthResolved(true);
              // C6 Phase 1 seam 3 (D97): the only launch-time
              // restoreNotifications call sat BELOW the return on this
              // signed-in path, so for every signed-in user it never ran -
              // every "re-laid on every launch" guarantee (training
              // reminders, cascade/win-back windows, meal reminders, the
              // RB-2 coach-ready re-lay) was real only after a quiet-hours
              // edit or a timezone change. Restore here with the REAL user
              // id. Fire-and-forget; every scheduler inside self-gates on
              // permission, tier, toggles, push budget and ED flags.
              // FULLY-FREE PRODUCT (founder decision 2026-09-03, see
              // src/lib/proGate.js). One-shot per signed-in user: drain the
              // trial/win-back residue an existing device is still carrying
              // (queued cascade-gate + day-3 + win-back pushes, the churn
              // episode, the queued start_cascade retry, the cached trial
              // keys and the Home trial-end gate flag). AWAITED, and placed
              // BEFORE restoreNotifications, so the restore below never
              // re-lays anything the conversion is about to cancel. Best
              // effort and never throws; a failure is logged inside.
              try {
                // eslint-disable-next-line global-require
                await require('../lib/payments/freeConversion')
                  .runFreeConversionOnce(session.user.id);
              } catch (_e) { /* best effort: must never block the launch path */ }
              try {
                const raw = await AsyncStorage.getItem('@volyume_notification_prefs');
                if (raw) {
                  restoreNotifications(JSON.parse(raw), session.user.id).catch(() => {});
                }
              } catch (_e) { /* best effort */ }
              // D141 item 7 (2026-09-04): the habit-derived training schedule
              // was refreshed ONLY when a workout finished, so anyone who
              // stopped finishing workouts kept the days baked in at their
              // last session for ever (the reminder is an OS-level weekly
              // repeat and outlives the app). Re-derive it at every launch
              // too. Self-guarding: with too little history it writes
              // nothing, and scheduleTrainingReminders no-ops when the
              // reminder is off or permission is absent.
              try {
                // eslint-disable-next-line global-require
                require('../lib/notifications/trainingHabitSchedule')
                  .refreshHabitDerivedTrainingSchedule(session.user.id)
                  .catch(() => {});
              } catch (_e) { /* best effort */ }
              return;
            }
          }
        } catch (_e) {}

        // No cloud session. Validate local state before deciding what to
        // render: if a tier was previously saved but the user never
        // completed first-run setup, treat the local state as an
        // abandoned setup. Clear the stale tier so the navigator falls
        // back to WelcomeStack for a clean restart. Without this guard,
        // closing the app on WelcomeScreen and reopening would silently
        // re-route past Welcome based on stale AsyncStorage values.
        try {
          const savedTier = await AsyncStorage.getItem('@volyume_tier');
          const firstRunDone = await AsyncStorage.getItem('@volyume_first_run_complete');
          if (savedTier && firstRunDone !== 'true') {
            await AsyncStorage.removeItem('@volyume_tier').catch(() => {});
            useAppStore.setState({ tier: null });
          }
        } catch (_e) {}

        // No anonymous mode per IDENTITY_AND_OWNERSHIP_LOCKED.md
        // rule 1 + anti-patterns: no LOCAL_USER_KEY restore, no
        // initLocalUser bootstrap. Any legacy `@volyume_local_user_id`
        // value sitting in AsyncStorage from an older build is
        // ignored; the user lands on Welcome and must sign in or
        // sign up against a real account. This is what the locked
        // spec's scenario A ('Fresh install, signs up') and scenario
        // F ('Uninstall, reinstall') both depend on.
        setAuthLoading(false);
        authGenuinelyResolvedRef.current = true; // Wave E: real answer (no session)
        setInitialAuthResolved(true);
        try {
          const raw = await AsyncStorage.getItem('@volyume_notification_prefs');
          if (raw) {
            const restoredUserId = useAppStore.getState().user?.id ?? null;
            restoreNotifications(JSON.parse(raw), restoredUserId).catch(() => {});
          }
        } catch (_e) {}
      } catch (err) {
        _bootLog('error', 'RootNavigator.bootstrap.failed', err);
        // Failsafe: release auth loading so the splash doesn't hang.
        // No anonymous-mode fallback (spec rule 1), the user lands
        // on Welcome and signs in/up against a real account.
        setAuthLoading(false);
        // Wave E: a FAILED bootstrap is not an answer — mark the give-up
        // so a previously-signed-in device holds on the retry state
        // instead of flashing Welcome (classifyAuthBoot).
        if (!authGenuinelyResolvedRef.current) setAuthGaveUp(true);
        setInitialAuthResolved(true);
      }
    }

    // Wave E: fast, network-free marker read — was a real athlete ever
    // signed in on this install? Governs the give-up branch only; a
    // missing marker or failed read keeps pre-fix behaviour exactly.
    // D149: the same read, paired with the stored-session probe, also
    // decides whether this is a verified FRESH INSTALL that may open on
    // Welcome before the database is open (classifyFreshInstall). Both
    // probes fail to 'unknown', and unknown never opens early.
    const ownerMarkerRead = AsyncStorage.getItem('@volyume_last_supabase_user_id')
      .then((v) => { if (v) setHadPriorSession(true); return v ? 'present' : 'absent'; })
      .catch(() => 'unknown');
    Promise.all([ownerMarkerRead, hasStoredAuthSession()])
      .then(([ownerMarker, storedSession]) => {
        if (classifyFreshInstall({ ownerMarker, storedSession }) === 'fresh') setFreshInstall(true);
      })
      .catch(() => {});

    bootstrap().catch((e) => {
      _bootLog('error', 'RootNavigator.bootstrap.unhandled', e);
      if (!authGenuinelyResolvedRef.current) setAuthGaveUp(true);
      setInitialAuthResolved(true);
    });
    // Hard failsafe: the splash must never hang on the auth latch even if
    // bootstrap stalls inside a hung await (same philosophy as the
    // setAuthLoading failsafe above). 8s is far beyond a healthy boot.
    // Wave E: releasing here without a genuine getSession answer is a
    // GIVE-UP, not a resolution — recorded so the render can hold a
    // previously-signed-in device on the bounded retry state.
    const authLatchTimer = setTimeout(() => {
      if (!authGenuinelyResolvedRef.current) setAuthGaveUp(true);
      setInitialAuthResolved(true);
    }, 8000);

    let subscription;
    try {
      const client = getSupabaseClient();
      if (client) {
        const { data } = client.auth.onAuthStateChange(async (event, session) => {
          // CRITICAL: capture the local user id BEFORE setUser
          // replaces it with the cloud session user. Without this, the
          // migrateLocalUserId check below ("are these different?") is
          // always false on OAuth signin, the local rows never get
          // re-keyed to the supabase user id, and bulkUploadLocalData
          // ends up querying SQLite with the supabase id (which
          // matches nothing) so the user's history never reaches the
          // cloud. This was the cross-device data loss bug the user
          // flagged five times.
          const localUserIdBeforeSignIn = useAppStore.getState().user?.id ?? null;
          // AUTH-4: clear the enter-dedup on sign-out so a genuine re-sign-in
          // (even of the SAME account within the 3s window) still runs the enter
          // pipeline. Without this, a sign-out -> sign-in-same-account without a
          // bundle reload (dev / Expo Go) would skip the restore + tier + sync.
          if (event === 'SIGNED_OUT') {
            _lastAuthEnter = { uid: null, at: 0 };
            // Every sign-out is an account boundary, including sign-outs
            // initiated outside the normal UI wrapper (sync recovery, token
            // revocation, rejected account switch). Invalidate both the
            // unconsumed callback nonce and the exchange admission latch so a
            // callback begun by the old account cannot publish afterwards.
            try {
              // eslint-disable-next-line global-require
              await require('../lib/authCallbackState').clearAuthFlow();
            } catch (_) { /* callback state remains fail-closed on read */ }
            // The verified sign-out wipe clears the owner marker. Do not clear
            // it merely because an auth event fired: the account-switch "keep"
            // path deliberately signs the incoming account back out while the
            // previous account's data and ownership marker must remain intact.
            setHadPriorSession(false);
            // Release-gate fix: playBilling.logOut() exists and correctly
            // removes the purchase/error listeners and ends the store
            // connection, but nothing in the app has ever called it - so the
            // signed-out account's listener stayed bound for the life of the
            // process. ensureBillingForUser tears down on a uid change too,
            // but doing it here means the window between sign-out and the
            // next sign-in carries no stale listener at all. Best-effort:
            // never block or fail a sign-out.
            try {
              // eslint-disable-next-line global-require
              require('../lib/payments').playBilling.logOut?.().catch(() => {});
            } catch (_) { /* lib not loadable in this env */ }
          }

          const isAuthEnter =
            (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') &&
            session?.user?.id;

          // Guard every event carrying a session. A stale TOKEN_REFRESHED or
          // USER_UPDATED event for another uid is just as capable of replacing
          // identity as SIGNED_IN if it bypasses account admission.
          if (session?.user?.id) {
            const admission = await preflightIncomingSession(client, session);
            if (!admission.ok) return;
          }
          // eslint-disable-next-line global-require
          try { require('../lib/errorLog').logInfo('auth.event', event, { uid: session?.user?.id ?? null, prevLocal: localUserIdBeforeSignIn }); } catch (_) {}
          // Bind / unbind the Sentry user so errors are searchable by
          // who hit them. Safe no-op if Sentry isn't installed yet.
          try {
            // eslint-disable-next-line global-require
            const { setSentryUser } = require('../lib/sentry');
            setSentryUser(session?.user
              ? { id: session.user.id, email: session.user.email }
              : null);
          } catch (_) {}
          // Tell observability about the user id too so every
          // breadcrumb + event from here on carries it as context.
          try {
            // eslint-disable-next-line global-require
            const { setCurrentUserId } = require('../lib/observability');
            setCurrentUserId(session?.user?.id ?? null);
          } catch (_) {}
          setSession(session);
          setUser(session?.user ?? null);
          // On a fresh sign-in (email OR OAuth), pull the cloud profile
          // before the navigator routes. Otherwise a returning user whose
          // local AsyncStorage was wiped on sign-out gets routed back
          // through onboarding because firstRunComplete is still false.
          // Run the full restore + pull pipeline on BOTH events that
          // bring a user into the app:
          //   - 'SIGNED_IN' fires on explicit sign-in
          //   - 'INITIAL_SESSION' fires on cold launch when a session
          //     was restored from SecureStore (no user action needed)
          //
          // Previously only SIGNED_IN triggered pullFromCloud, so a
          // returning user on the same device saw stale local data
          // until they pull-to-refresh'd or navigated to a screen
          // that refetched. Including INITIAL_SESSION means every
          // launch with a valid session auto-syncs.
          if (event === 'SIGNED_IN' && session?.user?.id) {
            // Funnel telemetry: sign_in fires only on a real sign-in,
            // not on INITIAL_SESSION (which is a session restore on
            // cold launch). account_created piggybacks on the same
            // event when session.user.created_at is within the last
            // 5 minutes (universal across email-auto-confirm + OAuth
            // signup; misses email-confirm-later sign-ins where the
            // user takes more than 5 min to follow the confirm link,
            // which is acceptable noise for funnel ratios). Fire-and-
            // forget; the local rows are in the queue and the flush
            // below pushes them.
            try {
              // eslint-disable-next-line global-require
              const { track } = require('../lib/engineTelemetry');
              const provider = session.user.app_metadata?.provider ?? 'unknown';
              track(session.user.id, 'sign_in', { provider }).catch(() => {});
              const createdAtMs = session.user.created_at
                ? new Date(session.user.created_at).getTime()
                : NaN;
              if (Number.isFinite(createdAtMs) && (Date.now() - createdAtMs) < 5 * 60 * 1000) {
                track(session.user.id, 'account_created', { provider }).catch(() => {});
              }
            } catch (_) {}
          }
          if (isAuthEnter) {
            // AUTH-4: skip a duplicate enter for the same uid fired moments ago
            // (SIGNED_IN + INITIAL_SESSION on one launch). 3s window.
            const _enterUid = session.user.id;
            const _enterNow = Date.now();
            if (_lastAuthEnter.uid === _enterUid && (_enterNow - _lastAuthEnter.at) < 3000) {
              return;
            }
            _lastAuthEnter = { uid: _enterUid, at: _enterNow };

            // COMP-009: a cross-account sign-in is gated behind an explicit
            // choice BEFORE any restore / sync / wipe side-effect runs, so the
            // whole sign-in body below is wrapped in this async IIFE. "Keep this
            // device's data" aborts cleanly (sign back out, touch nothing);
            // "Switch accounts" snapshots first, then the existing flow runs.
            // Same-account and first-ever sign-ins fall straight through with no
            // modal. The existing cross-user wipe + last-account key write
            // further down are unchanged, the gate is purely additive.
            (async () => {
              try {
              } catch (_) { /* gate best-effort; fall through to the normal flow */ }

            // Optimistic sign-in: kick off the cloud restore but DON'T
            // await it. restoreSessionFromCloud makes its routing
            // decision synchronously at the top (per-uid cache OR
            // created_at heuristic) so firstRunComplete + tier are
            // already set by the time the navigator next renders.
            // The cloud read itself runs to completion on its own.
            useAppStore.getState().restoreSessionFromCloud(session.user.id, session.user)
              .catch(e => {
                // eslint-disable-next-line global-require
                try { require('../lib/errorLog').logError('RootNavigator.restoreSessionFromCloud', e, { userId: session.user.id }); } catch (_) {}
              });
            refreshTierFromCloud(client, session.user.id)
              .then(() => _reconcilePaidEntitlement(session.user.id))
              .catch(e => {
                // eslint-disable-next-line global-require
                try { require('../lib/errorLog').logError('RootNavigator.refreshTierFromCloud', e, { userId: session.user.id }); } catch (_) {}
              });

            // Release-gate fix: initialise the store billing provider HERE
            // too, not only in the cold-launch bootstrap below. initialise()
            // is what registers the purchase-completion listener, and
            // purchasePackage() settles its parked promise ONLY from that
            // listener - so a user who signed up or signed in during THIS
            // session (no app restart) reached the paywall with no listener
            // registered: Play still took the payment, but the promise hung
            // to its 90s timeout, the entitlement grant downstream never
            // ran, and they were told the purchase failed while already
            // being charged.
            //
            // Safe to call on every auth enter: initialise() early-returns
            // when already initialised for the SAME appUserID, and
            // ensureBillingForUser re-initialises (logOut first) when the
            // uid differs, so a user switch can never leave the previous
            // account's listener bound. Fire-and-forget with the same shape
            // as the tier refresh above; the purchase path awaits its own
            // readiness check rather than depending on this having landed.
            try {
              // eslint-disable-next-line global-require
              // Through the payments barrel (D137): a no-op while billing
              // is dormant, so no store SDK runs on sign-in.
              const { playBilling } = require('../lib/payments');
              playBilling.ensureBillingForUser(session.user.id).catch(() => {});
            } catch (_) { /* lib not loadable in this env */ }

            // Bring local-only state up to the cloud and re-key any
            // rows that were owned by the pre-sign-in local UUID. Two
            // legs:
            //   1) migrateLocalUserId rewrites every "WHERE user_id ="
            //      table from the local UUID to the supabase user.id
            //      so future pushes match RLS on the right key.
            //   2) bulkUploadLocalData pushes the now-correctly-keyed
            //      rows up. Without this, an OAuth sign-up never
            //      uploaded the user's local history, so a sign-in on
            //      a new device pulled an empty cloud and the screens
            //      showed the "No active plan" empty state.
            // Both run fire-and-forget; failures fall through to the
            // sync queue's retry pass on next foreground. F2: the prep
            // promise is captured so the cloud restore below can chain
            // BEHIND the cross-user wipe and the Article 9 consent
            // resolution instead of racing them.
            const signInPrep = (async () => {
              try {
                // eslint-disable-next-line global-require
                const log = require('../lib/errorLog');
                // IDENTITY_AND_OWNERSHIP_LOCKED.md: the cross-user
                // migrateLocalUserId call that used to live here was
                // the source of the 42501 cascade. A real account A's
                // local rows were being re-stamped to a real account
                // B's user_id on sign-in, then push failed because
                // cloud still owned them under A. There is no
                // legitimate migration to move it to: the app has no
                // anonymous mode and no local-user migration path at
                // all (IDENTITY_AND_OWNERSHIP_LOCKED.md, enforced by
                // scripts/check-identity-invariant.sh). Sign-out wipes
                // local SQLite (clearAuthStateForSignOut), so
                // cross-user sign-in finds local already empty and has
                // nothing to migrate.
                //
                // Cross-user safety net: if a different supabase
                // account previously signed in on this device AND
                // their data is still in local SQLite (e.g. a build
                // crashed mid sign-out before the wipe), wipe it
                // here before the new account pulls.
                // The account-boundary preflight above has already verified the
                // owner marker before this pipeline is allowed to run.

                // Article 9 health-data consent check. Local cache
                // first (set after a successful grant in the consent
                // screen), then cloud fallback for cross-device
                // restore. Result drives the renderNavigator gate.
                try {
                  const cacheKey = `@volyume_health_consent_${session.user.id}`;
                  const cached = await AsyncStorage.getItem(cacheKey).catch(() => null);
                  if (cached === 'true') {
                    useAppStore.getState().setHealthConsent(true, true);
                  } else {
                    // No local cache; ask cloud. RLS keeps this
                    // scoped to the signed-in user.
                    const { data, error } = await client
                      .from('users_profile')
                      .select('health_data_consent')
                      .eq('id', session.user.id)
                      .maybeSingle();
                    if (error) {
                      // A transient cloud-read failure must NOT re-fire
                      // the (un-skippable) Article 9 gate. New users
                      // still hit the dedicated consent step during
                      // onboarding; this branch only runs for a returning
                      // / cross-device sign-in whose local cache is
                      // absent. Leave consent unresolved (null, not
                      // false) so the gate stays closed and we re-check
                      // next session, rather than re-prompting a user who
                      // already consented just because the network blipped.
                      useAppStore.getState().setHealthConsent(null, true);
                    } else {
                      const granted = data?.health_data_consent === true;
                      useAppStore.getState().setHealthConsent(granted, true);
                      if (granted) {
                        try { await AsyncStorage.setItem(cacheKey, 'true'); } catch (_) {}
                      }
                    }
                  }
                } catch (e) {
                  log.logWarn('SignIn.healthConsentCheck.failed', e?.message);
                  // Resolve to null (unresolved), NOT false, on a transient
                  // failure. renderNavigator only routes to the Article 9 gate
                  // when healthConsent === false, so false here would bounce a
                  // user who already consented back into the (un-skippable)
                  // consent screen just because a read threw. null leaves the
                  // gate closed and re-checks next session. This matches the
                  // sibling `error` branch above; A2-014 reconciles the two.
                  useAppStore.getState().setHealthConsent(null, true);
                }

                // Local-only edits made while signed out are pushed by
                // the syncAll() restore kicked off below. syncAll runs
                // the push track (food + legacy) before the pull, so a
                // separate bulkUploadLocalData here would double the push
                // (the race App.js's run-lock was added to avoid). Left
                // to syncAll so food rides the same cycle as everything
                // else and the push happens before the pull.
                // Drain any unpushed engine telemetry from the local
                // queue (Move #3). Events written while offline or
                // pre-sign-in land in SQLite via the track() helper;
                // this is the first opportunity to ship them.
                try {
                  // eslint-disable-next-line global-require
                  const { flushPendingTelemetry } = require('../lib/engineTelemetry');
                  await flushPendingTelemetry();
                } catch (_) {}
              } catch (_) {}
            })();

            // Restore from cloud into local SQLite. Routed through
            // syncAll (push track then pull track), not the legacy
            // pullFromCloud, because the food domain and the other
            // migrated tables only move on the registry/transport path:
            // a plain pullFromCloud never restores the user's meals,
            // water or nutrition targets on sign-in (the food round-trip
            // bug). syncAll pushes any local-only edits first, then pulls
            // everything. Returning users on a new device see their data
            // populate empty states as inserts complete; status drives
            // the "Restoring your data" banner.
            // F2 (audit SC-1): this restore previously fired IN PARALLEL with
            // the consent read inside signInPrep, so health-domain tables
            // could push/pull before Article 9 consent resolved (or when it
            // resolved false/null). Chain it behind the prep (which also
            // covers the cross-user wipe) and gate it on an affirmative
            // consent; the runner enforces the same gate fail-closed as
            // defence-in-depth. When consent is not yet true the restore is
            // skipped and logged: granting consent on the Article 9 screen
            // kicks a sync immediately, and the foreground/periodic triggers
            // cover every later session once consent is cached true.
            // eslint-disable-next-line global-require
            const { syncAll } = require('../lib/sync');
            signInPrep.then(() => {
              if (useAppStore.getState().healthConsent !== true) {
                try {
                  // eslint-disable-next-line global-require
                  require('../lib/errorLog').logInfo(
                    'SignIn.restoreDeferred',
                    'cloud restore held: Article 9 consent not yet affirmative',
                  );
                } catch (_) {}
                return;
              }
              const store = useAppStore.getState();
              store.markCloudSyncing();
              return syncAll({ userId: session.user.id, localUserId: session.user.id, triggeredBy: 'sign_in' })
                .then(() => useAppStore.getState().markCloudSyncComplete())
                .catch((err) => useAppStore.getState().markCloudSyncError(err?.message));
            }).catch(() => {});

            // Register this device for remote push (subscription
            // payment-failure pushes, fired by the Play Billing RTDN
            // webhook). No-ops cleanly when permission isn't granted or
            // app.json has no extra.eas.projectId; local notifications
            // are unaffected either way. Fire-and-forget.
            // eslint-disable-next-line global-require
            require('../lib/notifications')
              .registerPushToken(session.user.id)
              .catch(() => {});
            })();
          }
        });
        subscription = data.subscription;
      }
    } catch (_e) {}

    return () => {
      clearTimeout(authLatchTimer);
      subscription?.unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Splash self-heal: if we ever land in a state where the user is gone
  // but a "checked" flag has been flipped back to false, re-run the
  // checks so we don't sit on the splash forever. Belt-and-braces guard
  // against any future refactor that might reset checked-flags mid-session.
  // Also: if isAuthLoading got stuck true with no user, release it.
  useEffect(() => {
    if (!user && !tierChecked) checkTier().catch(() => {});
    if (!user && !firstRunChecked) checkFirstRun().catch(() => {});
    if (!user && isAuthLoading) setAuthLoading(false);
  }, [user, tierChecked, firstRunChecked, isAuthLoading, checkTier, checkFirstRun, setAuthLoading]);

  // C5-P29-04 (D96): the consent-resolver splash below waits on
  // healthConsentChecked, and that flag is only ever set inside the
  // auth-enter block. Every branch in there does set it, but the block
  // itself can be missed: onAuthStateChange may never deliver
  // INITIAL_SESSION for a session getSession() already restored at
  // bootstrap, and the AUTH-4 3s dedup can swallow a lone delivery. Unlike
  // initialAuthResolved (8s) and setAuthLoading, this latch had no
  // failsafe, so a signed-in user who had not finished onboarding could sit
  // on the boot splash with no route out but a reinstall.
  //
  // FAIL CLOSED, and only closed. The failsafe resolves the latch to null,
  // never true: null means "unresolved", which for a user who has not
  // finished onboarding routes straight INTO the Article 9 gate
  // (consentUnresolvedForNewUser in renderNavigator), and the sync layer
  // keeps refusing to move health data until consent is genuinely granted.
  // It can escape the splash to the gate; it can never grant consent, skip
  // the gate, or overwrite a real answer (a landed check wins the race
  // check below, and a resolved latch never re-arms this timer).
  useEffect(() => {
    if (!user || user.isLocal || firstRunComplete || healthConsentChecked) return undefined;
    const timer = setTimeout(() => {
      if (useAppStore.getState().healthConsentChecked) return;
      _bootLog('warn', 'RootNavigator.healthConsentLatch.failsafe',
        'consent check never resolved; routing to the Article 9 gate (consent NOT granted)');
      useAppStore.getState().setHealthConsent(null, true);
    }, CONSENT_LATCH_FAILSAFE_MS);
    return () => clearTimeout(timer);
  }, [user, firstRunComplete, healthConsentChecked]);

  // Founder defect (2026-07-13, Android walk): ONE splash, not two. The
  // native expo-splash-screen used to hide on App.js's themeReady (before
  // this gate resolved), exposing the animated JS SplashScreen as a second
  // loading screen. The native splash now hides HERE, exactly when the
  // boot gate lifts, so it covers the whole boot and the app appears
  // directly. App.js keeps only a 12s failsafe hide. The JS SplashScreen
  // below still serves post-boot gates (the consent resolver, sign-out
  // re-gates), where the native splash is long gone.
  const bootGateResolved = splashReady && firstRunChecked && tierChecked && initialAuthResolved;
  // D149 (founder, 2026-09-05): a verified FRESH INSTALL opens on Welcome
  // at the first frame instead of waiting behind the database open and
  // the first-run migrations. "Fresh" is not a guess: the device holds no
  // owner marker AND no stored auth session (classifyFreshInstall; either
  // probe 'unknown' keeps the frame), so there is no session to restore
  // and Welcome is the device's honest state. The Campaign 24 law against
  // speculative logged-out UI protects devices that MIGHT be signed in;
  // this one cannot be. The fast AsyncStorage flags are still required,
  // only the auth latch is bypassed, and the tree rendered is the same
  // one the resolved gate renders, so nothing remounts when the latch
  // lands; a sign-up from the sheet routes on live store state exactly
  // as it does after boot.
  const freshInstallOpen = freshInstall && splashReady && firstRunChecked && tierChecked;
  const nativeFrameLifts = bootGateResolved || freshInstallOpen;
  useEffect(() => {
    if (!nativeFrameLifts) return;
    try {
      // eslint-disable-next-line global-require
      require('expo-splash-screen').hideAsync().catch(() => {});
    } catch (_) { /* tolerate */ }
  }, [nativeFrameLifts]);

  // Splash gate fires ONLY during initial bootstrap, before splashReady,
  // firstRunChecked, tierChecked and the ONE-SHOT initialAuthResolved
  // latch have completed their first pass. initialAuthResolved (2026-07-12
  // founder defect) holds the splash until the initial getSession()
  // restore has actually resolved, so a signed-in cold launch can no
  // longer flash WelcomeStack (the free/Pro page) through the `!user`
  // branch below while the session is still loading behind SQLCipher init.
  // Deliberately not gated on isAuthLoading: that flag flips true during
  // every SIGNED_IN event, and showing the splash mid-flow unmounts the
  // currently-rendered stack (ProOnboardingStack in particular), wiping
  // the screen's step state. The result was an OAuth loop on Step 1.
  // The latch never resets after its first flip, so it cannot recreate
  // that loop. The store updates (tier, firstRunComplete, user)
  // re-trigger this render naturally, so seamless transitions happen
  // without a splash.
  // D149: freshInstallOpen (above) lets a verified fresh install through
  // this gate on the fast flags alone.
  if (!freshInstallOpen && (!splashReady || !firstRunChecked || !tierChecked || !initialAuthResolved)) {
    return <SplashScreen />;
  }

  // Campaign 24 Wave E (WAVE-E-FINDINGS.md item 0, the startup
  // auth-hydration flash; decision table in src/lib/authBootGate.js):
  // auth GAVE UP without a genuine getSession answer on a device with a
  // recorded prior sign-in — hold on a bounded, retryable neutral state
  // (the dbInitFailed pattern) instead of speculatively flashing
  // WelcomeStack at a still-resolving user. The explicit "Go to sign in"
  // action means a genuinely signed-out user is never stranded. This
  // branch renders strictly less than the navigator and sits BEFORE any
  // routing, so the Article 9 consent gate's ordering is untouched.
  if (classifyAuthBoot({
    initialAuthResolved, authGaveUp, hasUser: !!user, hadPriorSession,
  }) === 'auth_retry') {
    return (
      <View style={dbErrorStyles.container}>
        <Ionicons name="cloud-offline-outline" size={40} color={colors.textMuted} />
        <Text style={dbErrorStyles.title}>Couldn't check your sign-in</Text>
        <Text style={dbErrorStyles.body}>
          Nothing has been lost. Volyume couldn't reach your account this
          time - your data is safe on this device. Try again, or sign in
          fresh.
        </Text>
        <Button
          title={authRetrying ? 'Trying again...' : 'Try again'}
          onPress={handleAuthRetry}
          disabled={authRetrying}
          fullWidth={false}
          style={dbErrorStyles.retry}
        />
        <Button
          title="Go to sign in"
          variant="tertiary"
          onPress={handleAuthGiveUpToWelcome}
          disabled={authRetrying}
          fullWidth={false}
        />
      </View>
    );
  }

  // Release-gate fix: the local database (source of truth for every screen
  // per CLAUDE.md) failed to open/migrate. Rendering the normal navigator
  // here used to be silent and permanent - every screen would read empty
  // state forever with no explanation and no recovery path. This blocks
  // the rest of the tree until the athlete retries and it actually opens.
  if (dbInitFailed) {
    return (
      <View style={dbErrorStyles.container}>
        <Ionicons name="cloud-offline-outline" size={40} color={colors.textMuted} />
        <Text style={dbErrorStyles.title}>Couldn't open your data</Text>
        <Text style={dbErrorStyles.body}>
          Nothing has been lost. Volyume couldn't open your local data this
          time - try again, and if it keeps happening, it has already been
          reported.
        </Text>
        <Button
          title={dbRetrying ? 'Trying again...' : 'Try again'}
          onPress={handleDbRetry}
          disabled={dbRetrying}
          fullWidth={false}
          style={dbErrorStyles.retry}
        />
      </View>
    );
  }

  // While a cloud restore is in flight (right after SIGNED_IN, before
  // we know whether the user has a profile in the cloud), park on
  // the splash. Without this, the navigator routes on stale local
  // state, tier='pro' is set instantly by the beta override but
  // firstRunComplete is still false from clearAuthStateForSignOut,
  // which mounts ProOnboardingStack briefly until the cloud read
  // confirms firstRunComplete=true. That gap was the "I started the
  // wizard and got booted out" bug.
  // No blocking splash for sign-in any more, optimistic routing
  // means the navigator already has firstRunComplete + tier set
  // correctly by the time control reaches here. Cloud sync runs in
  // the background, populating empty states on each screen as data
  // arrives.

  // Navigation priority:
  // 1. Not signed in → WelcomeScreen (tier selection) + Login
  // 2. Signed-in + Article 9 consent missing → Article9ConsentStack
  //    (compliance gate per IDENTITY_AND_OWNERSHIP_LOCKED.md +
  //    PRIVACY_CONSENT_LOCKED.md). Blocks the rest of the app until
  //    the user explicitly agrees to health-data processing.
  // 3. First-run not done → ProOnboardingStack (the six-step guided setup),
  //    the ONE setup path for every user (founder decision: fully free, no
  //    Free/Pro split -- the old tier-branch to a lighter FirstRunStack is
  //    gone).
  // 4. Done → MainTabs
  function renderNavigator() {
    // Gate on whether the user is SIGNED IN, not on tier. Post-beta a
    // freshly authenticated account has no tier yet (no cloud profile row,
    // and the PRO_BETA_ACTIVE override that used to force tier='pro' is
    // gone). Keying this on `!tier` parked a signed-in user back on the
    // login screen forever: signed in at Supabase, stuck at Login in the
    // app. Identity is cloud-only (no anonymous mode per
    // IDENTITY_AND_OWNERSHIP_LOCKED.md), so a non-null `user` means signed
    // in. A null/free tier from here resolves through the Article 9 trial
    // grant (→ pro) or falls to the free setup.
    if (!user) return <WelcomeStack />;
    // ONB-001 / ONB-002: hold a real (cloud) signed-in account on a blocking
    // resolver until the Article 9 consent check has resolved, instead of
    // letting it fall through to an onboarding branch. While the check is in
    // flight (healthConsentChecked === false) a brand-new Pro-path account
    // has tier=null and firstRunComplete=false, so the branch below would
    // route it into FirstRunStack (the free "name only" flow) and flash it
    // before the consent gate and the trial grant land. Routing only once
    // consent is resolved also stops the Article 9 screen reading as a late
    // reroute. This wait always ends: the consent check runs on SIGNED_IN and
    // INITIAL_SESSION and sets healthConsentChecked=true in every branch
    // (granted, ungranted, or transient read failure), and the flag only
    // resets on sign-out (clearAuthStateForSignOut). Returning users who have
    // already finished setup (firstRunComplete) skip the wait and route on.
    if (user && !user.isLocal && !firstRunComplete && !healthConsentChecked) {
      return <SplashScreen />;
    }
    // Article 9 gate. Show it when consent was explicitly not granted
    // (healthConsent === false), AND, audit 2026-07-01 #7/#12, when a NEW user
    // (onboarding not finished) has UNRESOLVED consent (null) after a transient
    // consent-read failure. Previously the gate only fired on === false, so a
    // null (the value both consent-read error paths set) fell straight through
    // to onboarding: the user processed health data with no recorded consent AND
    // a Pro-intent signup landed in the free FirstRunStack because the cascade
    // (which sets tier='pro') only fires once consent is granted here. Routing an
    // unresolved-consent new user to the gate is safe and recoverable: the
    // consent RPC writes independently of the failed read, and start_cascade is
    // server-idempotent. A RETURNING user (firstRunComplete) with a null
    // consent read is NOT re-prompted, they fall through as before.
    const consentUnresolvedForNewUser = healthConsent == null && !firstRunComplete;
    if (user && !user.isLocal && healthConsentChecked && (healthConsent === false || consentUnresolvedForNewUser)) {
      return <Article9ConsentStack />;
    }
    if (!firstRunComplete) {
      // Founder decision (fully-free product, no Free/Pro split): the
      // ProOnboardingScreen six-step wizard is now THE setup path for
      // every user, regardless of tier. The old tier === 'pro' branch to
      // the lighter FirstRunStack is gone (FirstRunStack deleted).
      return <ProOnboardingStack />;
    }
    // CP-7: LockedMainTabs wraps MainTabs with the opt-in biometric app-lock
    // overlay. This is the ONLY change to this function; every branch above
    // (Welcome, Article 9 consent, onboarding) is untouched.
    return <LockedMainTabs />;
  }

  return (
    // D36c: hides this screen container from TalkBack/VoiceOver while any
    // shared BottomSheet is open, restored on close -- see
    // SheetIsolationBoundary and src/lib/sheetA11yIsolation.js's header.
    <SheetIsolationBoundary style={{ flex: 1 }}>
      <NavigationContainer
        ref={navigationRef}
        linking={linking}
        onReady={() => {
          // Wire the observability layer's screen-tracking. Emits a
          // breadcrumb on every navigation so any error fired later
          // in the session carries the user's path. Idempotent
          // re-mounting the navigator (e.g. signing out and back in)
          // re-subscribes cleanly.
          try {
            // eslint-disable-next-line global-require
            const { instrumentNavigation } = require('../lib/observability');
            instrumentNavigation(navigationRef);
          } catch (_) { /* tolerate */ }
        }}
        theme={navTheme}
      >
        {renderNavigator()}
      </NavigationContainer>
    </SheetIsolationBoundary>
  );
}

// D148 (founder, 2026-09-04): no brand splash inside the app. Every gate
// holds on a bare background so the next screen, Welcome or Today, simply
// appears. The animated wordmark that used to play here read as a second
// loading screen before Welcome.
// D149 (founder, 2026-09-05): no splash screen at all. The native launch
// frame the OS insists on (app.json, expo-splash-screen) is now a plain
// charcoal frame with a fully transparent image, so nothing reads as a
// splash: the app opens on charcoal and the first screen fades in the
// moment the boot gate lifts (bootGateResolved above), with no minimum
// hold.
function SplashScreen() {
  return <View style={splashStyles.container} />;
}

// SigningInSplash removed, restoreSessionFromCloud is now optimistic
// (routes immediately based on local cues, syncs cloud in background)
// so no sign-in splash is needed. The brand splash (SplashScreen) is
// still used for cold-launch bootstrap before tierChecked /
// firstRunChecked are set.

// Release-gate fix: styled like ScreenBoundary's fallback (components/
// ScreenBoundary.js) - calm, static tokens only, no live theme hook. This
// screen renders when the database itself failed to open, so it must be the
// most robust screen in the tree: no dependency that could itself fail.
const dbErrorStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  title: {
    fontSize: fontSize.lg,
    fontFamily: fontFamily.bold, fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  body: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 20,
  },
  retry: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
});

const splashStyles = StyleSheet.create({
  container: {
    flex: 1,
    // Brand background, matches the rest of the app so there is no seam at
    // the hand-off (was hardcoded #000000).
    backgroundColor: colors.background,
  },
});
