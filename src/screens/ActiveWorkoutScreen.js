import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { appAlert } from '../components/AppAlert';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, TextInput, KeyboardAvoidingView, Keyboard, Platform, BackHandler, AppState, Animated, AccessibilityInfo } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as hapticsVocab from '../lib/haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { colors, fontSize, fontWeight, spacing, radius, withAlpha, alpha, type, circle, motion, iconSize, fontFamily } from '../styles/theme';
import useTheme from '../hooks/useTheme';
import { workoutLoggerSize } from '../styles/layout';
import RestTimer from '../components/RestTimer';
import AnimatedRow from '../components/AnimatedRow';
import ExercisePickerModal from '../components/ExercisePickerModal';
import BottomSheet from '../components/BottomSheet';
import DragReorderList from '../components/DragReorderList';
import { useDragAutoScrollBridge } from '../components/DragReorderList';
import Button from '../components/Button';
import Card from '../components/Card';
// D43 S1 (docs/ux-world-class-audit-2026-07-09/D43-LOGGER-REDESIGN-BLUEPRINT.md
// section 5): LoggedSetRow and EmptyExerciseView extracted verbatim into
// src/components/workout/. `export { LoggedSetRow }` below keeps existing
// imports of it from this screen working.
import { LoggedSetRow } from '../components/workout/LoggedSetRow';
import EmptyExerciseView from '../components/workout/EmptyExerciseView';
import StatusStrip from '../components/workout/StatusStrip';
// R3 (founder order 2026-07-12, full logger rebuild): the page composes from
// dedicated workout components; the old inline chrome is deleted. Contract:
// docs/logger-rebuild-2026-07-12/BEHAVIOURAL-CONTRACT.md.
import WorkoutHeader from '../components/workout/WorkoutHeader';
// Logger phase 2B (physical-device corrective redesign): the whole session
// renders as ONE compact outline navigator under the header (WorkoutOutline)
// with the active exercise workspace below it - replacing the phase-2
// card-per-exercise vertical list that buried forward navigation beneath the
// active logger on a real device.
import WorkoutOutline from '../components/workout/WorkoutOutline';
import NowCard from '../components/workout/NowCard';
import WorkoutBottomBar from '../components/workout/WorkoutBottomBar';
import useAppStore from '../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import { SWAP_SCOPE } from '../lib/exercise/swapScope';
import { getAllCompletedSetsForExercise, getWorkoutById, getRoutineById, getProgrammeById, createWorkoutSet, updateWorkout, deleteIncompleteWorkout, getAllExercises, getCurrentMesocycleWeek, getWeek1SetsForExercise, getLastNWorkoutSets, getNextTimeNotes, markNoteShown, getWorkoutSetsForWorkout, updateWorkoutSet, deleteWorkoutSet, recordExerciseSwap, getActiveBlock, EXERCISE_INTENT } from '../lib/database';
import { styleKeyFromTags, stylePoolFor, styleLabelFor } from '../lib/exercise/stylePools';
import {
  loadExerciseIntentState, rankPersonalised, movementFamilyOf, isFamilyBlocked,
  intentFor, familyTargetKey,
} from '../lib/exercise/intent';
import { familyLabel } from '../lib/exercise/movementFamily';
import { useToast } from '../components/Toast';
import { enqueueSyncOp } from '../lib/syncQueue';
import { logError } from '../lib/errorLog';
import { audit } from '../lib/observability';
import { swapAdjacentBlocks } from '../lib/reorder';
import {
  detectPR,
  bestPRPerExercise,
  summariseWorkoutSets,
  buildLoadSemanticsById,
  MUSCLE_DISPLAY_NAMES,
  generateDeloadPrescription,
  defaultIncrement,
} from '../lib/algorithms';
// Campaign 20 Phase 2 (docs/live-prescription-campaign-20-2026-08-16/
// CAMPAIGN-20-PHASE-1-DESIGN.md, FOUNDER-RULINGS-2026-08-16.md): the single
// authoritative live set prescription resolver, replacing the fragmented
// authorities traced in the design doc's section 2 (best-anchor seed, ghost
// decision, the retired computeSetTargets per-set loop, stalledAdvice).
import {
  PROVENANCE,
  resolveSetPrescription,
  assembleEvidencePacket,
  detectLoadOverride,
  detectRepsOverride,
} from '../lib/livePrescription';
import { buildRecordLine } from '../lib/workoutRecordLine';
import {
  nextWorkoutRecoveryLabel, trainRecoveryDetail, describePrescriptionDifferences,
} from '../lib/recoveryState';
import { rankSwaps } from '../lib/swapEngine';
import { isClusterType, clusterLabel, summariseCluster, mergeClusterNote } from '../lib/clusterSet';
import {
  countProgressSets,
  setNumberForKind,
  validateSetEntryValue,
  shouldConfirmBeforeFinish,
} from '../lib/workoutHelpers';
import {
  circuitRoundState,
  formatRoundRestWords,
  CIRCUIT_MISSED_ROUND_LINE,
} from '../lib/circuitRound';
import {
  loadUnilateralExercises, setUnilateralExercise,
  loadUnilateralAsked, markUnilateralAsked,
  perSideRestPlan, halfRestSeconds,
} from '../lib/unilateral';
import { instructionsFor } from '../lib/exerciseInstructions';
import { equipmentDisplayLabel } from '../lib/exerciseDisplay';
import { GLOSSARY } from '../lib/coachGlossary';
import { applyTimeCrunch } from '../lib/mesocycle';
import { getTimeCrunchMessage, getStarterSessionMessage } from '../lib/whyThisTemplates';
import {
  applyReadinessToSets, getSessionWeeklyAllocation,
  resolveSessionEasingTweak,
} from '../lib/sessionAdjustments';
import { clearPendingReEntryEase } from '../lib/reEntryEaseState';
import { DEFAULT_BAR_KG } from '../lib/warmupRamp';
import { warmupRamp } from '../lib/warmupRamp';
import { shareSessionName } from '../lib/sessionShareData';
import { parseDecimalInput } from '../lib/parseDecimalInput';
import HintCaption from '../components/HintCaption';
// Activation ruling (first-run coherence pass): the rest strip's first
// appearance is also the first moment a lock-screen rest countdown could
// be delivered. Both helpers are non-prompting reads plus the single ask;
// nothing here touches quiet hours, categories or suppression.
import { getNotificationPermissionStatus, requestNotificationPermissions } from '../lib/notifications/permissions';

// FQ-3 (D96): rir defaults to NULL. The per-set RIR picker is permanently
// removed (D14/D19), so no set carries a genuine per-set effort rating, and
// the old `rir: 2` default stamped a fabricated one onto every logged set -
// which defeated the engine's own novice-overload guard. Per-set effort is
// unknown unless genuinely known; the progression engine now reads the
// SESSION-level difficulty rating instead (livePrescription.js's
// prevSessionDifficulty evidence input, ex-computeSetTargets').
const DEFAULT_SET = { weight: '', reps: 8, setType: 'straight', notes: '', rir: null };

// C5-P15-01 (D96): a warm-up is not a record attempt, and must not be one
// either side of a comparison. Tolerates both the camelCase session shape
// and the snake_case rows getAllCompletedSetsForExercise returns.
const isWorkingSetRow = (s) => (s?.setType ?? s?.set_type ?? 'straight') !== 'warmup';

// Founder device order 2026-08-17: the in-card coach line is RETIRED. The
// Campaign 20 Stage 11 provenance copy bank (PROVENANCE_COPY /
// provenanceLineFor) and the whole coach-line chain that fed the NowCard
// context slot (session-adjustment reason > readiness why > provenance >
// targetReason) rendered a permanent explanation inside the logging
// workspace ("Down a little today. Steady here."). The founder's ruling:
// the weight and reps prescription IS the intelligence; explanation is
// on-demand only. The on-demand surfaces remain: the session-adjustment
// sheet and the readiness sheet both still show their written why, and
// deload/block-finished state stays on the Recovery banner. Only the
// group-focus flash and the warm-up label (functional, not explanatory)
// still use the NowCard context line. Never re-add a standing coach
// explanation to the set card without a founder order.

// Founder fix (2026-07-10): "the next exercise button ... doesn't always
// happen, it goes on and adds more and more sets". Root cause: targetSets
// below used to be adjustedSetCount ALONE, which resolves to undefined
// whenever the current slot's routineExercise carries no set targets - a
// blank/freeform workout (HomeScreen "Just want to log? Start a blank
// workout", startWorkout(workout, [])) and ANY exercise added mid-session
// via the "+ Add exercise" picker both land here. (Since R12-3/R13-1 such
// slots DO carry a minted routineExercise {id} for the effects record's
// per-slot identity, but it has no recommendedSets, so this fallback
// fires exactly as it did when the field was null.)
// `undefined && workingLogged >= undefined` is always falsy, so
// targetComplete never becomes true and the target-reached bottom-bar swap
// (Next exercise / Finish workout) never fires for these slots - the entry
// card just keeps offering "Log set" forever, matching the founder's report.
// Fallback, in order: the session-adjusted target -> the routine row's own
// recommendedSets (defensive; already folded into the first) -> this
// constant, only when the slot truly has no plan data at all. 3 is not a new
// number: it is the exact fallback this file already uses when displaying a
// target with a missing recommendedSets (see the "Target: N sets" line and
// the info-sheet target line further down), so a freeform/ad-hoc exercise
// now gets the same target-reached behaviour, not a silently different one.
const DEFAULT_FREEFORM_TARGET_SETS = 3;

// D9 (docs/ux-world-class-audit-2026-07-09/DECISIONS-2026-07-09.md): the
// full unilateral (per-side) walkthrough - modelled on the superset
// heads-up below - shows only the very first time it is ever suggested,
// same '@volyume_seen_*' once-ever convention as '@volyume_seen_workout_info'
// just below and DiaryScreen's hints.
const UNILATERAL_WALKTHROUGH_SEEN_KEY = '@volyume_seen_unilateral_walkthrough';

// RC-3 (D96, Review C): the superset walkthrough joins the same once-ever
// convention. It was gated on a per-mount ref only, so the four-step lesson
// fired up to twice per session, for ever - and assignSupersets excludes
// beginners, so its only audience was experienced lifters. First exposure
// keeps the full sheet; afterwards the StatusStrip's superset chip carries
// the announcement.
const SUPERSET_WALKTHROUGH_SEEN_KEY = '@volyume_seen_superset_walkthrough';

// Activation ruling (first-run coherence pass): the rest timer starts itself
// the moment a set is logged, which on a first workout arrives unannounced -
// a counting strip appears at the thumb with no explanation of where it came
// from. One caption, the first time the strip is ever seen on this install,
// same once-ever '@volyume_seen_*' convention as the two keys above.
const REST_HINT_SEEN_KEY = '@volyume_seen_rest_hint';

// The same first appearance is the honest moment to ask for notification
// access: the lock-screen rest countdown this app already builds
// (lib/notifications/activeWorkout.js, restForeground.js) cannot show
// without it. Asked at most ONCE per install, in context, and only when the
// user has not already answered the OS prompt either way.
const REST_NOTIF_ASKED_KEY = '@volyume_rest_notif_asked';

// B8: keep-awake tag so this screen's activate/deactivate can never release
// a keep-awake hold some other surface owns. Per-INSTANCE suffix because the
// screen is registered in three stacks (Home, FirstRun, ProOnboarding) and
// expo-keep-awake tags are a set, not ref-counted, with a shared tag, two
// mounted instances would trade one hold and blur ordering would decide who
// wins.
const KEEP_AWAKE_TAG = 'volyume-active-workout';
let keepAwakeSeq = 0;
const IS_JEST = typeof process !== 'undefined'
  && process.env
  && !!process.env.JEST_WORKER_ID;

// Barbell test for the warm-up ramp's empty-bar row, same custom-spelling
// caveat as above ('barbell' seeded, 'Barbell' custom).
const BARBELL_EQUIPMENT = /barbell/i;



const SET_TYPE_OPTIONS = [
  { value: 'straight', label: 'Working', description: 'Counts towards your weekly volume and progress tracking.' },
  { value: 'warmup', label: 'Warm-up', description: 'Lighter sets before your main work. Not counted in your weekly volume.' },
  { value: 'dropset', label: 'Drop set', description: 'Reduce the weight at failure and keep going. Counts towards weekly volume, not the set-target counter.' },
  { value: 'myo_reps', label: 'Myo-reps', description: 'A heavy activation set, then short mini-sets with a few breaths between. Counts towards volume and progress.' },
  { value: 'rest_pause', label: 'Rest-pause', description: 'Hit failure, rest 10 to 20 seconds, then squeeze out more reps. Counts towards volume and progress.' },
  { value: 'amrap', label: 'AMRAP', description: 'As many reps as possible, usually the last set. Counts towards volume and progress.' },
];


// D35: scrollRef/onScroll/onContentSizeChange are optional and undefined
// for every sheet except the reorder sheet below -- they come straight
// from that sheet's useDragAutoScrollBridge() call and are otherwise a
// no-op (RN ignores undefined ref/onScroll/onContentSizeChange props), so
// every other WorkoutBottomSheet caller keeps today's plain-ScrollView
// behaviour byte for byte.
function WorkoutSheetScroll({ children, scrollRef, onScroll, onContentSizeChange }) {
  return (
    <ScrollView
      ref={scrollRef}
      onScroll={onScroll}
      onContentSizeChange={onContentSizeChange}
      scrollEventThrottle={onScroll ? 16 : undefined}
      style={styles.sheetScroll}
      contentContainerStyle={styles.sheetScrollBody}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

function WorkoutBottomSheet({
  visible, onClose, accessibilityLabel, keyboardAvoiding = false, children,
  scrollRef, onScroll, onContentSizeChange,
}) {
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      keyboardAvoiding={keyboardAvoiding}
      accessibilityLabel={accessibilityLabel}
    >
      <WorkoutSheetScroll scrollRef={scrollRef} onScroll={onScroll} onContentSizeChange={onContentSizeChange}>
        {children}
      </WorkoutSheetScroll>
    </BottomSheet>
  );
}

// The rep-progression anchor and never-below-session-best seeding rules now
// live inside the resolver (src/lib/livePrescription.js, Campaign 20 Phase 2
// Stage 12 - getBestAnchorSet/prefillRepsForTarget retired, ideas merged per
// design §3). countProgressSets still lives in src/lib/workoutHelpers.js
// (COMP-001) so the screen, Live Activity and watch companion share the same
// counting rule, unit-tested off the screen.

// D43 S1: LoggedSetRow moved to src/components/workout/LoggedSetRow.js
// (imported above). Re-exported here so existing `import { LoggedSetRow }
// from '.../ActiveWorkoutScreen'` call sites keep working unchanged.
export { LoggedSetRow };

// The logger's bottom chrome (rest strip + action bar, safe area included)
// never legitimately exceeds this. Used to reject nonsense layout passes
// before they can move the PR toast (founder device report 2026-08-18).
const MAX_BOTTOM_CHROME = 320;

/**
 * Rebuild a slot's routineExercise for a swapped-in exercise. The slot's
 * routineExercise carries the OLD exercise's planned load and rep band;
 * left attached, a swapped-in move with no history of its own prefills
 * the previous exercise's startingWeight and rep range. The rep band
 * comes from the new exercise's own defaults and the carried-over weight
 * is cleared; the planned set count is the user's choice for the slot,
 * so it stays. Shared by the manual swap path and the capability
 * effective view (D112 R2, audit T2-03) so both substitution routes
 * carry identical load semantics.
 */
function rebuildRoutineExerciseFor(newExercise, prevRoutineEx) {
  if (!prevRoutineEx) return null;
  const newRepMin = newExercise.defaultRepMin ?? newExercise.default_rep_min
    ?? prevRoutineEx?.recommendedRepsMin ?? 6;
  const newRepMax = newExercise.defaultRepMax ?? newExercise.default_rep_max
    ?? prevRoutineEx?.recommendedRepsMax ?? 12;
  return {
    ...prevRoutineEx,
    exerciseId: newExercise.id,
    exerciseName: newExercise.name,
    recommendedRepsMin: newRepMin,
    recommendedRepsMax: newRepMax,
    startingWeight: null,
  };
}

export default function ActiveWorkoutScreen({ navigation, route }) {
  // Use a shallow selector so every store mutation (rest timer ticks,
  // PR celebration flag flips, accessibility toggles) doesn't re-render
  // the 2000-line tree. Without this the rest timer alone fires
  // 300-600 re-renders per workout because tickRestTimer() ran every
  // second and store-touch was wholesale.
  //
  // Actions are stable function references inside Zustand so they don't
  // need to participate in the shallow compare, we still pull them
  // off the store via the selector.
  const store = useAppStore(useShallow(s => ({
    user: s.user, units: s.units,
    activeWorkout: s.activeWorkout,
    workoutExercises: s.workoutExercises,
    currentExerciseIndex: s.currentExerciseIndex,
    setCurrentExerciseIndex: s.setCurrentExerciseIndex,
    setWorkoutExercises: s.setWorkoutExercises,
    addExerciseToWorkout: s.addExerciseToWorkout,
    addSetToCurrentExercise: s.addSetToCurrentExercise,
    updateSetInCurrentExercise: s.updateSetInCurrentExercise,
    removeSetFromCurrentExercise: s.removeSetFromCurrentExercise,
    session: s.session,
    startRestTimer: s.startRestTimer,
    defaultRestSeconds: s.defaultRestSeconds,
    autoStartRestTimer: s.autoStartRestTimer,
    workoutPrefsLoaded: s.workoutPrefsLoaded,
    loadWorkoutPrefs: s.loadWorkoutPrefs,
    showPRCelebration: s.showPRCelebration,
    endWorkout: s.endWorkout,
    workoutStartTime: s.workoutStartTime,
    lastActivityAt: s.lastActivityAt,
    updateLastActivity: s.updateLastActivity,
    sessionAdjustments: s.sessionAdjustments,
    revertSessionAdjustment: s.revertSessionAdjustment,
    dismissReadinessTweak: s.dismissReadinessTweak,
    barWeight: s.barWeight,
  })));
  const {
    user, units, activeWorkout, workoutExercises, currentExerciseIndex,
    setCurrentExerciseIndex, addExerciseToWorkout, addSetToCurrentExercise,
    updateSetInCurrentExercise, removeSetFromCurrentExercise, session,
    startRestTimer, defaultRestSeconds, autoStartRestTimer, workoutPrefsLoaded, loadWorkoutPrefs,
    showPRCelebration, endWorkout, workoutStartTime,
    lastActivityAt, updateLastActivity, sessionAdjustments, revertSessionAdjustment, dismissReadinessTweak,
    barWeight,
  } = store;
  const reduceMotion = useAppStore(s => s.accessibility?.reduceMotion);
  // Single boolean selector (not the per-second remaining count): this flips
  // twice per rest, so it cannot re-introduce the per-tick re-render the
  // shallow selector above exists to prevent.
  const restTimerActive = useAppStore(s => s.restTimerActive);
  // Founder device order 2026-08-18: publish the measured bottom-chrome
  // height (rest strip + bottom bar) so the PR toast docks just above the
  // rest bar's amber line. Read via getState in the handler (no re-render
  // dependency) and cleared on unmount so a PR fired outside the logger
  // falls back to the toast's own safe-area offset.
  const handleBottomChromeLayout = useCallback((e) => {
    // Founder device report 2026-08-18 (second walk): the rest strip HIDES
    // itself when no rest is running, so a PR fired in that moment measured
    // the chrome short and the toast docked over the Log set button. The
    // published height now only RATCHETS UP while the logger is mounted -
    // its tallest state (bottom bar + rest strip) is the "above the amber
    // line" position, and the rest strip is appearing at log time anyway.
    // Reset happens on unmount only.
    const h = Math.round(e?.nativeEvent?.layout?.height ?? 0);
    // Founder device report 2026-08-18 (third walk): the toast stopped
    // appearing AT ALL on a second PR. A ratchet with no ceiling can latch
    // any spurious layout pass forever, and one big value pushes an
    // absolutely-positioned toast clean off the top of the screen. The
    // bottom chrome is a rest strip plus an action bar - it is never taller
    // than MAX_BOTTOM_CHROME - so anything outside that range is a bad
    // measurement and is ignored rather than trusted.
    if (h <= 0 || h > MAX_BOTTOM_CHROME) return;
    const s = useAppStore.getState();
    if (h > (s.loggerBottomInset || 0)) s.setLoggerBottomInset(h);
  }, []);
  useEffect(() => () => { useAppStore.getState().setLoggerBottomInset(0); }, []);
  // Drop assisted machine regressions from swap suggestions for anyone past
  // their first block. A true beginner keeps them. Unknown experience is treated
  // as non-beginner so an athlete is never offered a crutch.
  const isBeginner = useAppStore(s => s.userProfile?.experience) === 'beginner';

  // CP-10 stage 3 (theming FINAL batch): live theme (src/hooks/useTheme.js).
  // See buildLiveStyles' header comment (defined further down this
  // file, after the frozen `styles` block -- see the comment there for why).
  const t = useTheme();
  const live = buildLiveStyles(t);
  // D107-2/D109-2: the one visible surface this screen needs for a
  // constraints-read failure (the quiet avoided-pattern notice itself
  // degrades silently by simply not showing, which is correct - only the
  // read failure specifically needs a notice).
  const toast = useToast();

  const [currentSet, setCurrentSet] = useState({ ...DEFAULT_SET });
  // C5-P13-02 (D96): the weight/reps the entry was last SEEDED with, so
  // "is there unsaved work in here" can compare against the values the app
  // itself put there rather than against the module default. Written at
  // every programmatic seed below; never written when the user types, taps
  // a suggestion chip, or a saved draft is restored.
  const seededEntryRef = useRef({ weight: DEFAULT_SET.weight, reps: DEFAULT_SET.reps });
  const [prevSets, setPrevSets] = useState([]);
  const [allTimeSets, setAllTimeSets] = useState([]);
  // Founder device report 2026-08-22 (PRs "don't always show"): allTimeSets
  // is cleared to [] the instant the exercise changes and refilled two
  // awaited DB reads later. A set logged inside that window saw an EMPTY
  // history, so the record was silently skipped - and worse, the empty
  // prHistory took the first-lift branch, so a veteran's working set was
  // announced as "your starting point". An empty list and an unread list
  // are not the same thing, and this ref is what tells them apart.
  const historyLoadedRef = useRef(false);
  // CC33 D112 R6 (audit T2-28a): true only while a swap opened from the
  // "Work around this" sheet is in flight - the ONE surface whose meaning
  // is "this movement is a capability problem today", so its swap carries
  // cause 'constraint' even before any rule exists (the narrow override
  // ruled in recordExerciseSwap). Cleared on confirm and on every close.
  const workAroundSwapRef = useRef(false);
  const [loggedSets, setLoggedSets] = useState([]);
  // Edit/delete an already-logged set mid-session (Hevy parity). `editingSet`
  // is the logged-set object being edited (null when the sheet is closed);
  // `editValue` is the SetEntry value object the sheet binds to.
  const [editingSet, setEditingSet] = useState(null);
  const [editValue, setEditValue] = useState(null);
  // Flashes the SetEntry card border amber for ~700ms after a successful
  // Log set, so the tap is acknowledged visibly. Resets via a tracked
  // timeout so cycling exercises mid-flash doesn't leave it stuck on.
  const [logFlash, setLogFlash] = useState(false);
  const logFlashTimeoutRef = useRef(null);
  // D44: superset/giant-set group-driven focus changes (the alternation jump
  // AND the round-return) previously moved the screen with zero cue - no
  // haptic distinct from the ordinary set-logged tick, no announcement, no
  // visible sign (founder report: "seems to swap exercise when there's still
  // a set to do at times without saying anything"). This transient message
  // drives a brief banner naming the destination exercise, cleared via a
  // tracked timeout the same way logFlash above is.
  const [groupFocusMessage, setGroupFocusMessage] = useState(null);
  const groupFocusTimeoutRef = useRef(null);
  // Founder device report 2026-08-23 ("it's oddly saying I only had 1 PR
  // when I had about 10"): the session's records live in the store with the
  // rest of the session, not in this screen's state. The logger is built to
  // be left and returned to (ActiveSessionMiniBar navigates back into it)
  // and is rebuilt from scratch after a process kill, so screen state meant
  // the whole list was emptied the first time the user stepped out of it
  // and the summary counted only what came after.
  const detectedPRs = useAppStore(s => s.sessionPRs);
  const setDetectedPRs = useAppStore(s => s.setSessionPRs);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [showExercisePicker, setShowExercisePicker] = useState(false);
  // CL-6.1 (founder decision: prepare-not-commit). Past the target, "Log
  // another set" ARMS one more set (the entry card is already prefilled
  // with the last values) and the bottom bar returns to Log set; the
  // commit happens on that confirm, never on the arm tap. Disarms after
  // the set logs or when the exercise changes.
  const [extraSetArmed, setExtraSetArmed] = useState(false);
  useEffect(() => {
    setExtraSetArmed(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentExerciseIndex, loggedSets.length]);
  // Phase 2B ACTIVE-SET STABILITY (screenshot failure 1): once three or more
  // sets are logged, the earlier ones collapse behind one constant-height
  // line and only the MOST RECENT completed set stays expanded above the
  // active row - so logging more work never pushes the inputs farther down
  // the page. Tap the line to expand (edit/delete lives on the expanded
  // rows); collapses again on every exercise change.
  const [historyExpanded, setHistoryExpanded] = useState(false);
  useEffect(() => { setHistoryExpanded(false); }, [currentExerciseIndex]);
  // 'add' opens the picker to append an exercise; 'swap' opens it to replace the
  // current one. Lets the Swap sheet fall through to the full library and the
  // custom-exercise form when the ranked suggestions aren't what the user wants.
  const [pickerMode, setPickerMode] = useState('add');
  const [noteText, setNoteText] = useState('');
  // R3 rebuild: the coach context line is closable plain info (founder
  // ruling 2026-07-12). Dismissal is per exercise for this session; the
  // adjustment CONTROLS (restore plan / dismiss tweak) stay in the exercise
  // info sheet, so closing the line hides words, never a decision. The old
  // showNoteInput latch is gone with the corner pencil - NowCard owns the
  // note row's own expand/collapse.
  // Superset notification, tracks which group IDs the user has already
  // seen the "heads up, paired exercises" modal for in this workout. We
  // show it once per pair so the user can grab both stations before
  // starting. Set, not array, for O(1) membership checks.
  const acknowledgedSupersetsRef = useRef(new Set());
  const supersetWalkthroughSeenRef = useRef(false);
  const [supersetHeadsUp, setSupersetHeadsUp] = useState(null);
  // shape: { groupId, memberNames: string[] } | null (2+ members: pair or giant set)
  const [saving, setSaving] = useState(false);
  // Myo-rep / rest-pause cluster in progress. null when not clustering.
  // shape: { setType, weight, reps: [activation, mini1, ...] }
  const [cluster, setCluster] = useState(null);
  const [clusterReps, setClusterReps] = useState('');
  // Exercise IDs the user logs per-side (unilateral). Device-local pref.
  const [unilateralExercises, setUnilateralExercises] = useState(() => new Set());
  // D9: exercise IDs the user has already been asked about (accepted or
  // declined per-side logging), so the one-time suggestion never repeats.
  const [unilateralAsked, setUnilateralAsked] = useState(() => new Set());
  const [unilateralPrefsLoaded, setUnilateralPrefsLoaded] = useState(false);
  // D9: has the full one-time walkthrough (below) ever been shown? A ref,
  // not state - it only decides which suggestion UI to show and doesn't
  // itself need to trigger a re-render.
  const unilateralWalkthroughSeenRef = useRef(false);
  // D9: the current suggestion/walkthrough prompt, or null when hidden.
  // Only set for the FULL walkthrough case (first time ever); the
  // lighter repeat-suggestion for later exercises fires via appAlert
  // directly and never touches this state.
  const [unilateralSuggest, setUnilateralSuggest] = useState(null);
  // D-founder unilateral reversal (2026-07-11, founder device verdict): the
  // original D9 build asked the user to type an INDEPENDENT rep count for
  // the second side, which the founder ruled ED-adverse - it normalises
  // training one side harder than the other. A unilateral set now
  // prescribes the SAME reps for both sides; this state only GUIDES the
  // user through completing them - side one, a rest-class-governed pause
  // (lib/unilateral.js perSideRestPlan, unchanged), side two - and the
  // pair still commits as ONE workout_sets row (finishPerSide below), same
  // one-row storage invariant as before. null when no guided per-side set
  // is in progress.
  // shape: { setType, weight, reps, phase: 'side1' | 'side2' }
  const [perSide, setPerSide] = useState(null);
  // Campaign 20 Phase 2: setTargets/computeSetTargets are retired as the
  // screen's prescription authority (src/lib/livePrescription.js owns it
  // now, see packetBase/packet/prescriptions below). targetReason itself
  // retired with the in-card coach line (founder device order 2026-08-17);
  // deload/block-finished state stays on the Recovery banner.
  // packetBase: the bounded evidence pass's raw inputs (exercise,
  // prescription band, up to 3 comparable history sessions, senior
  // recovery facts), assembled ONCE per exercise load in loadHistory.
  // Re-resolution after each logged set and on every readiness change is
  // then purely in-memory (assembleEvidencePacket is pure) - see the
  // `packet`/`prescriptions` derivations below and handleCompleteSet.
  const [packetBase, setPacketBase] = useState(null);
  // Law G (design section 9.4): a logged working set whose weight/reps
  // differ from what was PRESENTED counts as a deliberate choice for the
  // rest of this exercise today. Reset on exercise change (loadHistory) and
  // implicitly on session end (the screen unmounts when the workout ends).
  const [overrideLoad, setOverrideLoad] = useState(null);
  const [overrideReps, setOverrideReps] = useState(null);
  // The prescription actually shown for the NEXT entry, tracked so
  // handleCompleteSet can detect a user override against what was
  // genuinely presented (not re-derived after the fact).
  const presentedPrescriptionRef = useRef(null);
  const [showSetTypePicker, setShowSetTypePicker] = useState(false);
  const [showOverflow, setShowOverflow] = useState(false);
  const [showExecution, setShowExecution] = useState(false);
  // D32 (2026-07-10, campaign item 20): the purpose-built reorder sheet
  // (whole-workout drag), opened from the existing overflow menu. NO in-view
  // drag on this screen -- the single-exercise focus view stays untouched;
  // see the sheet's own render block further down for the rationale.
  const [showReorderSheet, setShowReorderSheet] = useState(false);
  // D35: edge auto-scroll for the reorder sheet's own scroll area
  // (WorkoutSheetScroll's ScrollView, threaded through WorkoutBottomSheet
  // below). Declared unconditionally here alongside showReorderSheet.
  const reorderSheetScroll = useDragAutoScrollBridge();
  // B8 gym basics: the warm-up helper opens ONLY from the exercise overflow menu,
  // pull, never push (the recorded no-auto-suggest decision below stands).
  const [showWarmupRamp, setShowWarmupRamp] = useState(false);
  // The working weight the ramp is built from. Tapping a ramp row
  // overwrites the entry with the warm-up weight, so without this anchor a
  // reopened ramp would recompute from the WARM-UP weight and collapse
  // ("no ramp needed"), losing the typed working weight entirely on a
  // first-time exercise (Wave 4 review finding). Anchored on first open
  // while the entry holds a working (non-warm-up) weight; cleared on
  // exercise change and whenever the entry shows a working weight again.
  const rampAnchorRef = useRef(null);
  const [showStaleModal, setShowStaleModal] = useState(false);
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [swapCandidates, setSwapCandidates] = useState([]);
  // T2-08 (D112 R5, closes audit T2-08): how many structurally-valid
  // candidates the capability lane alone narrowed out of the ranked list
  // just built, so the sheet can say so instead of silently narrowing.
  const [swapNarrowedCount, setSwapNarrowedCount] = useState(0);
  // EL-11 (docs/exercise-library-expansion-2026-09-05/05-DECISIONS.md): when
  // this routine's plan carries a style:<pool> tag, swapStylePoolKey names
  // it and the sheet restricts candidates to the pool by default.
  // swapStyleShowAll is the explicit per-open relaxation ("Show all
  // exercises"); it resets to false every time the sheet is (re)opened.
  const [swapStylePoolKey, setSwapStylePoolKey] = useState(null);
  const [swapStyleShowAll, setSwapStyleShowAll] = useState(false);
  // D107-2: exercise-intent state kept at screen scope (not just inside
  // handleOpenSwap's local read) so the logger can show a quiet notice when
  // the CURRENT exercise's movement pattern is being avoided - "never
  // silently rewritten": nothing here changes the plan, it only surfaces
  // the fact with a Swap shortcut.
  const [intentState, setIntentState] = useState(null);
  const [showDiscardModal, setShowDiscardModal] = useState(false);
  const [timeCrunchActive, setTimeCrunchActive] = useState(false);
  const [timeCrunchMsg, setTimeCrunchMsg] = useState('');
  const [preCrunchSnapshot, setPreCrunchSnapshot] = useState(null);
  // COMP-013: a starter session is a one-tap 15-minute subset of Day 1, applied
  // once at session start. It reuses the time-crunch machinery (snapshot +
  // revert) but caps sets and exercise count via the starter options.
  const [starterActive, setStarterActive] = useState(false);
  const starterAppliedRef = useRef(false);
  const [isDeloadWeek, setIsDeloadWeek] = useState(false);
  // Stage 1 (2026-08-09): a finished block clamps to its deload row, so
  // isDeloadWeek alone would claim a live "Recovery week" for ever. The
  // targets legitimately hold at that row's volume; only the copy changes.
  const [blockFinished, setBlockFinished] = useState(false);
  // The C5-P13-01 session-header effort line ("This week: stop N short of
  // failure") was removed on the founder device order of 2026-08-17 - the
  // prescription carries the intelligence; the RIR gloss stays available
  // from Home's readiness chip surface.
  const [deloadDismissed, setDeloadDismissed] = useState(false);
  // C18 recovery visibility: the resolved state and the prescription changes
  // that are genuinely true of THIS session.
  const [recoveryState, setRecoveryState] = useState(null);
  const [recoveryDifferences, setRecoveryDifferences] = useState([]);
  // C18 progression: the required sessions for the athlete's active programme
  // week, so an ended-early resolution names the right instance.
  const [progressionSessions, setProgressionSessions] = useState(null);
  const [progressionWeekId, setProgressionWeekId] = useState(null);
  const [progressionBlockId, setProgressionBlockId] = useState(null);
  // B2 (Wave-3 review): the session-wide dismissal of the readiness tweak
  // lives ON the active workout (store action dismissReadinessTweak) so it
  // survives screen remounts and the WK-1 crash restore, the a11y copy
  // promises "Applies to the whole session" and now means it.
  const readinessDismissed = !!activeWorkout?.readinessDismissed;
  // FQ-4 (D96): exerciseId -> this week's allocated working-set base, from
  // the persisted planned_muscle_volume rows. Null until resolved (or when
  // the session has no mesocycle week / no rows), in which case every
  // consumer falls back to the routine's static counts.
  const [weeklyAllocation, setWeeklyAllocation] = useState(null);
  useEffect(() => {
    let cancelled = false;
    getSessionWeeklyAllocation({ workout: activeWorkout, exercises: workoutExercises })
      .then(({ allocation }) => { if (!cancelled) setWeeklyAllocation(allocation); })
      .catch(() => {});
    return () => { cancelled = true; };
  // The allocation depends only on the workout's week and the exercise list
  // identity, both fixed for the life of a session.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkout?.id]);
  // Ghost pre-fill bookkeeping. The value itself is no longer rendered (the
  // ghost chip went in COMP-001; the muted input colour carries the state),
  // but the setter still arms/clears the pre-fill in loadHistory/onChange.
  const [_ghostSet, setGhostSet] = useState(null);
  const [nextTimeNotes, setNextTimeNotes] = useState([]);  // "next time" coaching notes for this routine
  // EP-15/UI-06 (Codex end-user-polish audit): a long "next time" note was
  // silently clamped to 4 lines with no way to read the rest. Tracks which
  // notes (by id) the user has expanded to their full text on this screen.
  const [expandedNoteIds, setExpandedNoteIds] = useState(() => new Set());
  // Cluster counter for myo-reps / rest-pause: 0 = activation set, 1+ = mini-set N+1
  const autoAdvanceRef = useRef(null);
  // C3 (audit 2026-07-03): mirrors autoAdvanceRef so the screen can show the
  // countdown, not just silently run it. Kept in lockstep by cancelAutoAdvance
  // below, the single place that clears the ref.
  const [autoAdvanceArmed, setAutoAdvanceArmed] = useState(false);
  const sessionSetsRef = useRef([]);   // tracks sets in this session, used for PR detection
  const warmupHintSeenRef = useRef(false); // show one-liner warmup note only on first warmup of this session
  const finishingRef = useRef(false); // gates handleFinishWorkout so a rapid double-tap can't double-finish
  const shownNoteIdsRef = useRef(new Set()); // note IDs already shown in this session
  // D32 (2026-07-10, campaign item 20): workoutExercises entries carry no
  // stable id of their own AS ENTRIES (since rounds 11-13 every slot's
  // routineExercise carries a minted id, but this key predates that and
  // keys the entry object, not the slot), so
  // the reorder sheet's DragReorderList needs SOME per-entry key. Object
  // identity is stable across a reorder (the array is only ever reshuffled,
  // never cloned per-entry, except where an entry is genuinely replaced --
  // e.g. a swap -- which correctly earns a fresh key). A WeakMap lazily
  // assigns one string id per entry object the first time it's seen.
  const workoutExerciseKeysRef = useRef(new WeakMap());
  const workoutExerciseKeySeqRef = useRef(0);
  function keyForWorkoutExercise(entry) {
    const map = workoutExerciseKeysRef.current;
    if (!map.has(entry)) {
      workoutExerciseKeySeqRef.current += 1;
      map.set(entry, `wx-${workoutExerciseKeySeqRef.current}`);
    }
    return map.get(entry);
  }

  const scrollRef = useRef(null);
  const insets = useSafeAreaInsets();
  // R2 (remediation 2026-07-11): this is the ONE screen that relies on raw
  // insets.bottom for its bottom bar (the tab bar hides here, so nothing
  // else absorbs the system inset). Expo SDK 54 Android is always
  // edge-to-edge, so a reported bottom inset of 0 on Android is always a
  // misreport (first-frame provider gap, OEM quirk) - never a real "no
  // system bar". Floor it at 48 (3-button nav height) so the Log set bar
  // can never render under the navigation buttons; devices that report
  // real insets are untouched.
  const safeBottom = insets.bottom > 0 ? insets.bottom : (Platform.OS === 'android' ? 48 : 0);
  const timerRef = useRef(null);

  // B8 (audit 05 §B8): keep the screen awake while the logger is FOCUSED,
  // the phone sits propped on the bench between sets and must not sleep
  // mid-session. Focus-scoped, not mount-scoped: this screen stays mounted
  // in the Train stack while the user browses another tab mid-session, and
  // the display shouldn't be pinned on for that. Android drops the
  // underlying window flag automatically when the app backgrounds, so no
  // AppState wiring is needed. Both calls are best-effort: a device that
  // refuses the flag must never crash the logger.
  const keepAwakeTagRef = useRef(null);
  if (keepAwakeTagRef.current === null) {
    keepAwakeSeq += 1;
    keepAwakeTagRef.current = `${KEEP_AWAKE_TAG}-${keepAwakeSeq}`;
  }
  useFocusEffect(
    useCallback(() => {
      const tag = keepAwakeTagRef.current;
      activateKeepAwakeAsync(tag).catch(() => {});
      return () => {
        try {
          Promise.resolve(deactivateKeepAwake(tag)).catch(() => {});
        } catch (_) { /* best-effort */ }
      };
    }, [])
  );

  // A ramp anchored to one exercise means nothing for the next.
  useEffect(() => {
    rampAnchorRef.current = null;
  }, [currentExerciseIndex]);

  // C3: a countdown armed on one exercise must never fire against another,
  // and must never outlive the screen. handleNextExercise and
  // handleRemoveExercise already cancel it explicitly for their own
  // navigation; this is the backstop for every other way currentExerciseIndex
  // can change (nav-strip tap, swipe), and for unmount.
  useEffect(() => {
    return () => cancelAutoAdvance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentExerciseIndex]);

  // First-use info tip highlight
  const [showInfoTipPulse, setShowInfoTipPulse] = useState(false);
  const infoPulseAnim = useRef(new Animated.Value(1)).current;
  const infoPulseLoop = useRef(null);

  const currentEntry = workoutExercises[currentExerciseIndex];
  const exercise = currentEntry?.exercise;
  const routineExercise = currentEntry?.routineExercise;
  // EL-7/EL-9 (docs/exercise-library-expansion-2026-09-05/05-DECISIONS.md):
  // circuit membership is a property of the ROUTINE's stored prescription
  // (built in the manual builder), never created or mutated live - unlike
  // an ordinary superset pairing, which handleTogglePair can create
  // mid-session. loadCharacter is read defensively: the column is owned by
  // a separate campaign lane and may be null/absent.
  const isCircuitGroup = routineExercise?.groupKind === 'circuit';
  const exerciseLoadCharacter = exercise?.loadCharacter ?? exercise?.load_character ?? null;
  const isBallisticExercise = exerciseLoadCharacter === 'ballistic';
  // The evidence class a set logged RIGHT NOW on this exercise would carry.
  const currentEvidenceClass = isCircuitGroup && isBallisticExercise ? 'circuit_ballistic'
    : isCircuitGroup ? 'circuit'
    : isBallisticExercise ? 'ballistic'
    : null;
  // "Last" means no exercise AFTER this one still counts: handleNextExercise
  // skips _timeCrunchSkipped slots, so a trailing time-crunched exercise must
  // not make the second-to-last slot offer a Next button that would no-op --
  // it gets the Finish offer instead (product ruling 2026-07-10, closing the
  // gap the next-exercise landing surfaced).
  const isLastExercise = !workoutExercises.some(
    (entry, i) => i > currentExerciseIndex && !entry?._timeCrunchSkipped,
  );

  // CC29 (section 14 step 3): the APPLIED effective view, computed once
  // per fresh session at serve time. Substituted rows carry the quiet
  // temporary marker; omitted rows drop with a durable effects entry. The
  // BASE plan rows are untouched (this rewrites only the in-session list),
  // a resumed session with logged sets is never rewritten, and any
  // failure serves the base session unchanged.
  const effectiveAppliedRef = useRef(null);
  // T2-06 (D112 R5, closes audit T2-06): the session-level "unusually
  // reduced" signal - how many rows this serve-time pass dropped outright
  // (omitted, never substituted). Reset only when a genuinely NEW session
  // starts, never on the re-run this same effect causes by writing
  // workoutExercises itself (that would erase the count the instant after
  // setting it).
  const [omittedSessionCount, setOmittedSessionCount] = useState(0);
  useEffect(() => {
    setOmittedSessionCount(0);
  }, [activeWorkout?.id]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!user?.id || !activeWorkout?.id) return;
        if (effectiveAppliedRef.current === activeWorkout.id) return;
        // D112 R4 (closes audit T2-04): an empty session is APPLIED
        // (vacuously) - without marking it, the effect re-fired when the
        // first manually added exercise landed and substituted over the
        // user's own pick. The effective view shapes what the app serves
        // at session start, never what the user adds afterwards.
        if (!workoutExercises.length) { effectiveAppliedRef.current = activeWorkout.id; return; }
        const anyLogged = workoutExercises.some((e) => (e.sets?.length ?? 0) > 0);
        if (anyLogged) { effectiveAppliedRef.current = activeWorkout.id; return; }
        if (workoutExercises.some((e) => e?._capabilityTemp)) { effectiveAppliedRef.current = activeWorkout.id; return; }
        // eslint-disable-next-line global-require
        const { applyEffectiveViewToSession } = require('../lib/sessionEffective');
        // _userAdded rides into the row so the effective view can serve the
        // user's own additions untouched (D112 R4; survives relaunch too).
        const baseRows = workoutExercises.map((e) => (e?.exercise
          ? (e._userAdded ? { ...e.exercise, _userAdded: true } : e.exercise)
          : e));
        // R10-1: each slot's stable planned-row id rides beside the rows,
        // so the effects record can tell two slots of one exercise apart.
        const rowIds = workoutExercises.map((e) => e?.routineExercise?.id ?? null);
        const res = await applyEffectiveViewToSession(user.id, activeWorkout.id, baseRows, { rowIds });
        if (cancelled) return;
        effectiveAppliedRef.current = activeWorkout.id;
        if (res.untouched) return; // nothing applied
        // T2-06: applyEffectiveViewToSession drops an OMITTED row from the
        // returned list entirely (a SUBSTITUTED row is still pushed, 1 for
        // 1) - so the shortfall against baseRows.length is exactly the
        // omitted count. The one case this misses (every row blocked) is
        // the module's own fail-safe: it answers untouched (already
        // bailed above), which is the correct call there too - a session
        // can never be served empty.
        const omitted = baseRows.length - res.served.length;
        if (omitted > 0) setOmittedSessionCount(omitted);
        // Round 3 (R3-4, superseding R2-7's claimed-index scan): the
        // module now RETURNS each served row's base index, so no id
        // reconstruction happens here at all - the one place duplicate
        // exercise ids and omission holes could cross wires (a relaunch
        // once replaced a _userAdded entry with the plan row the app had
        // just omitted) no longer exists.
        const servedEntries = res.served.map((row, k) => {
          const idx = res.baseIndexes[k];
          const original = (idx >= 0 && idx < workoutExercises.length) ? workoutExercises[idx] : null;
          if (row._capabilityTemp) {
            return {
              ...(original ?? {}),
              exercise: { ...row, _capabilityTemp: undefined },
              // D112 R2 (closes audit T2-03): the slot's routineExercise
              // carries the EXCLUDED exercise's startingWeight and rep
              // band; rebuilt here from the substitute's own defaults,
              // exactly as the manual swap path rebuilds it.
              routineExercise: rebuildRoutineExerciseFor(row, original?.routineExercise),
              _capabilityTemp: row._capabilityTemp,
              sets: [],
            };
          }
          return original ?? { exercise: row, sets: [] };
        });
        useAppStore.getState().setWorkoutExercises(servedEntries);
      } catch (_e) { /* the base session stands */ }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, activeWorkout?.id, workoutExercises.length]);

  // D107-2: reload the intent state whenever the exercise on screen changes,
  // so the "avoiding this movement pattern" notice below is checked against
  // the exercise actually being logged, not a stale one from a previous
  // slot. Best-effort and additive: a failure simply means no notice shows,
  // never that logging is affected.
  //
  // Round 14 (R14-2): reload on FOCUS too. The round-13 B5 ruling exists
  // for a rule captured mid-session through "Work around this" - which
  // navigates to Injuries & limitations and back - yet this state only ever
  // reloaded on exercise change or swap-sheet open, so the freshly
  // captured rule stayed invisible on the very row it was captured from
  // (the class R6-2 closed on RoutineDetailScreen). Same burst-window
  // discipline as B3: a focus within 800ms of the dep-triggered load is
  // its own echo. A sequence guard replaces the cancelled flag so an
  // older read landing late never overwrites a newer one.
  const intentLoadSeqRef = useRef(0);
  const intentLoadAtRef = useRef(0);
  const reloadIntentState = useCallback(() => {
    if (!user?.id) { setIntentState(null); return; }
    const seq = ++intentLoadSeqRef.current;
    getActiveBlock(user.id)
      .then(block => loadExerciseIntentState(user.id, { activeMesocycleId: block?.id ?? null }))
      .then(state => { if (seq === intentLoadSeqRef.current) setIntentState(state); })
      // Round 16 (R16-4, deleting round 15's false rationale): this
      // state is USER-scoped, not slot-scoped - loadExerciseIntentState
      // takes no exercise, and the per-slot clearing lives in
      // resolvedExercise, a different state with its own rule. So a
      // failed refresh keeps the last real state on EVERY trigger
      // (mount, exercise change, focus): a stale-but-true state beats
      // an erased one, which silently removed the constraint notice,
      // side-carve note and avoided-pattern chip. Only a missing user
      // clears (above). The one rejection source here is
      // getActiveBlock; loadExerciseIntentState cannot reject.
      .catch(() => {});
  }, [user?.id]);
  useEffect(() => {
    intentLoadAtRef.current = Date.now();
    reloadIntentState();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadIntentState, exercise?.id]);
  useEffect(() => {
    const unsub = navigation.addListener('focus', () => {
      if (Date.now() - intentLoadAtRef.current < 800) return;
      reloadIntentState();
    });
    return unsub;
  }, [navigation, reloadIntentState]);

  // CC33 adversarial review F1: the entry's own exercise object comes
  // from getRoutineExercisesWithDetails and carries NO demand columns,
  // so judging it read every axis as null - every capability question
  // below answered UNKNOWN for every planned row. Resolve the full
  // library row for JUDGEMENT only (display keeps the entry's object).
  //
  // Round 2 (R2-6): the first fix held the PREVIOUS slot's row across an
  // exercise change, so for a render pass the notices spoke about the
  // wrong movement, and the mount pass judged the demandless entry row
  // then flipped its own answer. The resolve is now stamped with the id
  // it was read for and adopted only while it matches, and until it
  // matches judgedExercise is null - the derivations below then say
  // NOTHING for that pass rather than something wrong. A resolve that
  // finds no row (an unresolved FK) adopts the partial entry, which
  // lands in the unknown lane and drives nothing automatic.
  const [resolvedExercise, setResolvedExercise] = useState(null); // { id, row|null }
  useEffect(() => {
    let cancelled = false;
    setResolvedExercise(null);
    if (!exercise?.id) return undefined;
    // eslint-disable-next-line global-require
    const { getExerciseById } = require('../lib/database');
    getExerciseById(exercise.id)
      .then((row) => { if (!cancelled) setResolvedExercise({ id: exercise.id, row: row ?? null }); })
      .catch(() => { if (!cancelled) setResolvedExercise({ id: exercise.id, row: null }); });
    return () => { cancelled = true; };
  }, [exercise?.id]);
  const judgedExercise = (exercise?.id && resolvedExercise?.id === exercise.id)
    ? (resolvedExercise.row ?? exercise)
    : null;

  // D107-2: is the exercise on screen right now under a movement-pattern
  // avoidance? Computed here (not inline in the StatusStrip builder below)
  // so both the notice chip and its accessibility label read the same facts.
  const patternAvoidFamily = exercise ? movementFamilyOf(exercise) : null;
  const patternAvoidTarget = patternAvoidFamily ? familyTargetKey(patternAvoidFamily) : null;
  const patternAvoidRow = (intentState && patternAvoidTarget) ? intentFor(intentState, patternAvoidTarget) : null;
  const patternAvoidActive = !!(patternAvoidFamily && intentState && isFamilyBlocked(intentState, patternAvoidFamily));
  const patternAvoidLabel = patternAvoidFamily ? (familyLabel(patternAvoidFamily) ?? patternAvoidFamily) : null;
  const patternAvoidCopy = (() => {
    if (!patternAvoidActive || !patternAvoidRow) return null;
    if (patternAvoidRow.kind === EXERCISE_INTENT.PATTERN_AVOID && patternAvoidRow.expiresAtMs) {
      const until = new Date(patternAvoidRow.expiresAtMs).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      return `Avoiding ${patternAvoidLabel} until ${until}`;
    }
    if (patternAvoidRow.kind === EXERCISE_INTENT.AVOIDED_BLOCK) return `Avoiding ${patternAvoidLabel} for this block`;
    return `Avoiding ${patternAvoidLabel}`;
  })();

  // CC29 (section 17, RT2-1): the constraint notice, EPISODE-role only -
  // a baseline-shaped session is simply the user's session and carries no
  // furniture. One quiet line on the sanctioned status strip, with the
  // existing Swap shortcut; section 33.16's budget (one mention per
  // surface) holds because this is the strip's single constraint item.
  const constraintConflicts = (() => {
    if (!judgedExercise || !intentState?.capability || intentState.capability.empty) return [];
    try {
      // eslint-disable-next-line global-require
      const { episodeConflicts } = require('../lib/capability/effective');
      return episodeConflicts(intentState.capability, judgedExercise);
    } catch (_e) { return []; }
  })();
  // True when this movement is available only because a sided rule was
  // carved (the model answers, not this screen). Read-only. Judged on the
  // resolved row (F1): on the partial row every demand read null and this
  // could never answer true, so the side-carve note never fired.
  const carvedForOneSide = (() => {
    if (!judgedExercise || !intentState?.capability || intentState.capability.empty) return false;
    try {
      // eslint-disable-next-line global-require
      const { isSideCarvedAvailable } = require('../lib/capability/resolve');
      return isSideCarvedAvailable(intentState.capability, judgedExercise);
    } catch (_e) { return false; }
  })();
  // Round 8 (R8-1): the BOTH-SIDES prompt suppression consumes its own
  // answer, never carvedForOneSide. The round-7 union correctly turned
  // the carve OFF when both sides are restricted - which made
  // carvedForOneSide false for exactly that state, and the "do the same
  // reps on each side" proposal fired where it is MOST wrong: both
  // sides ruled out, not one. This asks the weaker question - does any
  // sided rule bear on this movement at all - so the prompt stays
  // suppressed whichever way the carve resolves. This gate answers
  // false on a failed or empty read - fine for a READER of it, and
  // the note's gate does the same - but that is exactly why the ask
  // effect holds on capabilityKnown BEFORE consulting it (round 18,
  // R18-1): under D129 ruling 1 a rendered notice may stay silent on
  // an unreadable input while an ACTION must wait, so the round-8
  // analogy between this gate and the note's held only for readers.
  const sidedRuleBearsOnThis = (() => {
    if (!judgedExercise || !intentState?.capability || intentState.capability.empty) return false;
    try {
      // eslint-disable-next-line global-require
      const { sidedRuleTouches } = require('../lib/capability/resolve');
      return sidedRuleTouches(intentState.capability, judgedExercise);
    } catch (_e) { return false; }
  })();

  // D112 R1 amendment to RT2-1 (closes audit T1-03's visible half): a
  // baseline-shaped plan is simply the user's plan and carries no marker,
  // but a plan row that CONTRADICTS the user's permanent rules is never
  // silently served as fine. The quiet note below marks it until the user
  // resolves it - the plan rewrite, a swap here, or an allowance.
  const baselineConflictsList = (() => {
    if (!judgedExercise || !intentState?.capability || intentState.capability.empty) return [];
    try {
      // eslint-disable-next-line global-require
      const { baselineConflicts } = require('../lib/capability/effective');
      return baselineConflicts(intentState.capability, judgedExercise);
    } catch (_e) { return []; }
  })();

  const constraintNotice = (() => {
    // CC33 adversarial review F4 (+ round 3 R3-3): an UNKNOWN conflict
    // must never be spoken as a fact - the held claim included, since
    // "you're holding your plan as-is FOR THIS" asserts the hold covers
    // this row. Rounds 13-15 then corrected the BRANCH ORDER three
    // times, one branch per round (marker vs new conflicts; held vs
    // marker; held vs baseline), so round 15 extracted the selection
    // into constraintNoticeKind (capability/effective.js) - one pure,
    // DRIVEN ranking instead of an inline chain whose truth table only
    // a fresh review could see. This block now only words each kind.
    // eslint-disable-next-line global-require
    const { constraintNoticeKind } = require('../lib/capability/effective');
    const { kind, drivingEpisode, definiteBaseline, unknowns } = constraintNoticeKind({
      hasMarker: !!currentEntry?._capabilityTemp?.fromName,
      episodeConflicts: constraintConflicts,
      baselineConflicts: baselineConflictsList,
    });
    if (kind === 'marker') {
      return { kind: 'episode', copy: `Temporarily in for ${currentEntry._capabilityTemp.fromName} while your change lasts` };
    }
    // D112 R8 (section 25): a PURE held state says so instead of
    // claiming Volyume is working around anything - the user asked it
    // to wait, and the quiet line reflects their own instruction back.
    // Purity is the helper's ruling (round 15): no marker (the line
    // would deny a change Volyume made) and no definite baseline
    // conflict (the actionable truth outranks a rule driving nothing).
    if (kind === 'held') {
      return { kind: 'held', copy: "You're holding your plan as-is for this. Volyume changes nothing until you say so." };
    }
    if (kind === 'episode') {
      // Natural coach-language order (2026-08-21): name what the conflict
      // is about when the rules give it a short honest name. Named from
      // the DRIVING rules alone (round 15): naming a held co-driver
      // claimed the hold covered this row. Round 16 (R16-3): a sided
      // rule whose axis is union-blocked phrases UNSIDED - naming one
      // side stated a fact the movement may contradict and attributed
      // the whole union to that side's lane (the R8-4 class, closed at
      // the picker in round 8 and found again here; one shared answer
      // now, sidedUnionShape).
      try {
        // eslint-disable-next-line global-require
        const { subjectPhrase, sidedUnionShape } = require('../lib/capability/phrase');
        const capForPhrase = intentState?.capability ?? null;
        const named = subjectPhrase(drivingEpisode
          .filter(c => c.ruleKind !== 'exercise')
          .map(c => (sidedUnionShape(c, capForPhrase) ? { ...c, laterality: null } : c)), {});
        // Round 6 (R6-4): state the conflict, offer the action - a
        // workaround-in-progress claim was false on the dominant path.
        if (named) return { kind: 'episode', copy: `This one involves ${named}, which sits outside your temporary change. Swap it when you're ready.` };
      } catch (_e) { /* fall through to the generic line */ }
      // Round 5 (Q-1): the generic line asserts no adaptation - the app
      // is adapting nothing further on a row showing this notice.
      return { kind: 'episode', copy: "This one sits outside your temporary change. Swap it when you're ready." };
    }
    if (kind === 'baseline') {
      try {
        // eslint-disable-next-line global-require
        const { subjectPhrase, sidedUnionShape } = require('../lib/capability/phrase');
        // R16-3 applies here too: a sided baseline rule in a closed
        // union phrases unsided.
        const capForPhrase = intentState?.capability ?? null;
        const named = subjectPhrase(definiteBaseline
          .filter(c => c.ruleKind !== 'exercise')
          .map(c => (sidedUnionShape(c, capForPhrase) ? { ...c, laterality: null } : c)), {});
        if (named) return { kind: 'baseline', copy: `This one involves ${named}, which clashes with an injury or limitation you've set. Swap it when you're ready.` };
      } catch (_e) { /* fall through to the generic line */ }
      return { kind: 'baseline', copy: "This one clashes with an injury or limitation you've set. Swap it when you're ready." };
    }
    if (kind === 'unknown') {
      try {
        // eslint-disable-next-line global-require
        const { subjectPhrase } = require('../lib/capability/phrase');
        // Round 17 (Q4, C7): the third named branch joins the other two -
        // a sided rule in a closed union phrases unsided here as well,
        // so no branch of this notice can name one side of a union.
        // eslint-disable-next-line global-require
        const { sidedUnionShape: unionShape } = require('../lib/capability/phrase');
        const capUnk = intentState?.capability ?? null;
        const named = subjectPhrase(unknowns
          .filter(c => c.ruleKind !== 'exercise')
          .map(c => (unionShape(c, capUnk) ? { ...c, laterality: null } : c)), {});
        if (named) return { kind: 'unknown', copy: `Volyume doesn't know yet whether this involves ${named}, so it stays as planned.` };
      } catch (_e) { /* fall through to the generic line */ }
      return { kind: 'unknown', copy: "Volyume couldn't check this against your limitations yet, so it stays as planned." };
    }
    return null;
  })();
  const constraintNoticeCopy = constraintNotice?.copy ?? null;

  // CC33 D112 R4 (closes audit T2-11): the preselect handed to How you
  // train when "Work around this" notes a temporary change - built from
  // whatever is actually driving THIS exercise's conflict right now
  // (episode outranks baseline, same precedence constraintNotice uses
  // above), or this exercise itself when nothing is driving one yet - the
  // ordinary case, since the sheet is offered before any rule exists.
  // Exercise names, never ids: HowYouTrainScreen resolves an exercise-kind
  // preselect against the library by name (TrainingConsiderationsScreen.js
  // is the contract this mirrors).
  const workAroundPreselect = (() => {
    if (!exercise) return null;
    // Round 15 naming note: this list deliberately includes held and
    // unknown rows (the preselect describes what BEARS on the row; the
    // user confirms), unlike constraintNoticeKind's drivingEpisode -
    // renamed so the two "driving" ideas cannot be read as one.
    const prefillConflicts = constraintConflicts.length ? constraintConflicts : baselineConflictsList;
    // Round 2 (R2-8): DEFINITE conflicts only pre-fill an axis. An
    // unknown one would pre-answer the add flow with a movement fact the
    // app has not established - the user still confirms, but the app
    // must not put the answer in their mouth. Unknown-driven rows fall
    // to the exercise-kind preselect, naming only the movement itself.
    const demandRule = prefillConflicts.find((c) => c.ruleKind === 'demand' && !c.unknown);
    if (demandRule) return { kind: 'demand', axes: [demandRule.ruleValue] };
    return exercise.name ? { kind: 'exercise', exerciseNames: [exercise.name] } : null;
  })();

  // COMP-015: this session's adjustment for the current exercise, if any. A
  // reverted one is ignored. A nonzero setDelta changes the working-set
  // target everywhere recommendedSets drives the session (orientation row,
  // target line, persistent notification); a hold (delta 0) carries only a
  // coaching line.
  const sessionAdjustment = exercise?.id
    ? (sessionAdjustments || []).find(a => a.exerciseId === exercise.id && !a.reverted) ?? null
    : null;
  // FQ-4 (D96): the session's working-set BASE is the week's persisted
  // volume allocation (the routine's static count scaled to this week's
  // planned_muscle_volume for the muscle) - the wire that makes an applied
  // coach change, the weekly ramp and the recovery week's per-muscle
  // reductions actually reach the next session. Null allocation (no
  // mesocycle, no rows, read failure) falls back to the routine's static
  // count, byte-identical to the pre-wiring behaviour. A session adjustment
  // (±1) already composes with the allocated base upstream
  // (sessionAdjustments feeds the allocator's output in as plannedSets).
  const comp015SetCount = (sessionAdjustment && sessionAdjustment.setDelta !== 0)
    ? sessionAdjustment.adjustedSets
    : (weeklyAllocation?.[exercise?.id] ?? routineExercise?.recommendedSets);

  // B2: readiness-informed, downward-only tweak from the intent-sheet answer
  // OR an active C18 re-entry ease decision (lib/reEntryEaseState.js via the
  // store's applyReEntryEaseIfPending, stamped as activeWorkout.reEntryEaseApplied).
  // Pure rule table (lib/sessionAdjustments.js); a presented suggestion applied
  // to this session's TARGET display only. The stored plan and logged sets are
  // never touched, and the user can dismiss it for the whole session (the
  // SAME dismissal, whichever source drove it). Silent on deload weeks,
  // matching COMP-015's R0 (deload owns the session) - the re-entry
  // amendment leaves every existing structural authority senior.
  //
  // resolveSessionEasingTweak never stacks the two: at most one downward step
  // is ever produced.
  const reEntryEaseActive = !isDeloadWeek && !!activeWorkout?.reEntryEaseApplied;
  const readinessTweak = !isDeloadWeek
    ? resolveSessionEasingTweak({
      intent: activeWorkout?.preWorkoutIntent ?? null,
      chips: { sleepQuality: activeWorkout?.sleepQuality, energyScore: activeWorkout?.energyScore },
      reEntryEaseActive,
    })
    : null;
  const readinessReduces = !!readinessTweak?.reduces && !readinessDismissed;

  // COMP-015 and the readiness tweak never stack: the LOWER set target wins,
  // so the combined surface can only ever move DOWN from the plan (a COMP-015
  // add is superseded on a below-par day; two drops never double-count).
  const readinessSetCount = readinessReduces
    // FQ-4: the readiness trim starts from the same allocated base as every
    // other session surface, so the two layers compose on one number.
    ? applyReadinessToSets(weeklyAllocation?.[exercise?.id] ?? routineExercise?.recommendedSets, readinessTweak)
    : null;
  const adjustedSetCount = (Number.isFinite(readinessSetCount) && Number.isFinite(comp015SetCount))
    ? Math.min(comp015SetCount, readinessSetCount)
    : (Number.isFinite(readinessSetCount) ? readinessSetCount : comp015SetCount);

  // Campaign 20 Phase 2, Stage 3/4 (design section 9.1, 9.3): the live
  // evidence packet, rebuilt PURELY IN MEMORY every render from the bounded
  // evidence pass (packetBase, fetched once per exercise load in
  // loadHistory) plus whatever has changed since - today's logged sets
  // (loggedSets, live), a user override (Law G) and the current senior
  // readiness/re-entry context. No I/O here: assembleEvidencePacket is a
  // pure function. CRITICAL DOUBLE-TRIM GUARD: the resolver applies the
  // readiness load trim INTERNALLY (senior.readinessTweak, step 7 of its
  // precedence pipeline) - applyReadinessToTargets must never run again
  // over resolver-derived values, so displaySetTargets is retired outright,
  // not merely renamed.
  const packet = useMemo(() => {
    if (!packetBase) return null;
    return assembleEvidencePacket({
      exercise: packetBase.exercise,
      prescription: packetBase.prescription,
      senior: {
        isDeload: packetBase.senior.isDeload,
        deloadTargets: packetBase.senior.deloadTargets,
        blockFinished: packetBase.senior.blockFinished,
        layoffDays: packetBase.senior.layoffDays,
        readinessTweak,
        reEntryEaseActive,
        readinessReductionActive: readinessReduces && !readinessDismissed,
      },
      rawHistory: packetBase.rawHistory,
      rawToday: loggedSets,
      overrideLoad,
      overrideReps,
      now: Date.now(),
    });
  }, [packetBase, loggedSets, overrideLoad, overrideReps, readinessTweak, reEntryEaseActive, readinessReduces, readinessDismissed]);

  // The Wave-3 readinessDrivesTarget seniority flag retired with the
  // in-card coach line it ordered (founder device order 2026-08-17).
  // Honest restore copy: dismissing the easing returns to the coach's
  // session target, which may include a COMP-015 change to the plan.
  const readinessRestoreLabel = (Number.isFinite(comp015SetCount)
    && Number.isFinite(routineExercise?.recommendedSets)
    && comp015SetCount !== routineExercise.recommendedSets)
    ? "Use your coach's targets instead"
    : 'Use planned targets instead';

  // COMP-015: coverage telemetry, fire once per exercise when its adjustment
  // line first becomes visible. muscle + direction + reasonCode only, no PII.
  const shownAdjRef = useRef(new Set());
  // Hydrate the device-local workout prefs (default rest, auto-start) once so a
  // session uses the user's saved default even if App.js bootstrap didn't run
  // them. Defaults (90s, auto-start on) preserve prior behaviour until loaded.
  useEffect(() => {
    if (!workoutPrefsLoaded) loadWorkoutPrefs();
  }, [workoutPrefsLoaded, loadWorkoutPrefs]);

  useEffect(() => {
    if (!sessionAdjustment?.show || !exercise?.id) return;
    if (shownAdjRef.current.has(exercise.id)) return;
    shownAdjRef.current.add(exercise.id);
    try {
      // eslint-disable-next-line global-require
      const { track } = require('../lib/engineTelemetry');
      track(user?.id, 'session_adjustment_shown', {
        muscle: sessionAdjustment.muscle,
        direction: sessionAdjustment.setDelta < 0 ? 'drop' : sessionAdjustment.setDelta > 0 ? 'add' : 'hold',
        reasonCode: sessionAdjustment.reasonCode,
      })?.catch?.(() => {});
    } catch (_) { /* telemetry best-effort */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionAdjustment?.show, exercise?.id]);

  // Superset / giant-set grouping: entries sharing a supersetGroupId are one
  // unit. A pair is the two-member case; a giant set (campaign item 21) has 3+.
  const currentSGI = workoutExercises[currentExerciseIndex]?.supersetGroupId ?? null;
  const nextSGI = workoutExercises[currentExerciseIndex + 1]?.supersetGroupId ?? null;
  const isPairedWithNext = currentSGI != null && currentSGI === nextSGI;
  // Every member of the current group, in session order (for the heads-up).
  const groupMemberNames = currentSGI != null
    ? workoutExercises.filter(e => e.supersetGroupId === currentSGI).map(e => e.exercise?.name ?? '')
    : [];
  // The OTHER members (all of them, for a giant set), in session order.
  const partnerNames = currentSGI != null
    ? workoutExercises
        .filter((e, i) => i !== currentExerciseIndex && e.supersetGroupId === currentSGI)
        .map(e => e.exercise?.name ?? '')
        .filter(Boolean)
    : [];
  // First partner: kept for the truthiness gates that guard the chip/modal.
  const pairedExerciseName = partnerNames[0] ?? '';
  // British-English list join ("A", "A and B", "A, B and C"), no Oxford comma.
  const partnerNamesText = partnerNames.length <= 1
    ? (partnerNames[0] ?? '')
    : `${partnerNames.slice(0, -1).join(', ')} and ${partnerNames[partnerNames.length - 1]}`;

  // C3: the one place that clears the auto-advance ref, so its "armed" state
  // (drives the "Stay here" row) never drifts from the timer it describes.
  function cancelAutoAdvance() {
    if (autoAdvanceRef.current) {
      clearTimeout(autoAdvanceRef.current);
      autoAdvanceRef.current = null;
    }
    setAutoAdvanceArmed(false);
  }

  // Logger redesign phase 2 (single-CTA state machine): the explicit
  // SECONDARY extra-set action. Arms extraSetArmed (CL-6.1 prepare-not-
  // commit: the commit still happens on the Log set tap that follows) and
  // cancels any running auto-advance countdown, returning the bar's single
  // primary to "Log set". This replaces the old "tap the ever-present
  // primary past target" path - past target the primary IS the advance now.
  function armExtraSet() {
    cancelAutoAdvance();
    hapticsVocab.selection();
    setExtraSetArmed(true);
  }

  // Logger redesign phase 2: tap on a workout-list row = JUMP ONLY.
  // Permanent law (founder, phase 1 contract): JUMPING != REORDERING !=
  // SKIPPING. Nothing is marked skipped, no order changes, no programme
  // state moves; the backstop effect above cancels any armed auto-advance
  // on the index change.
  function handleJumpToExercise(i) {
    if (i === currentExerciseIndex) return;
    audit('workout.exercise.jump', { fromIndex: currentExerciseIndex, toIndex: i });
    setCurrentExerciseIndex(i);
    setTimeout(() => scrollRef.current?.scrollTo({ y: 0, animated: false }), 50);
  }

  // D44: the cue for a group-driven focus change (the forward alternation
  // jump in handleCompleteSet AND the round-return it now performs). Mirrors
  // the "Set N logged" announcement pattern (~1540) plus a haptic distinct
  // from the ordinary set-logged tick (selection(), not the impact used for
  // setLogged), plus a brief visible banner naming the destination so a
  // sighted user isn't just silently relocated. Copy is lead-reviewed voice
  // (calm, plain, no exclamation, British English): "Superset: now X" /
  // "Giant set: now X", matching the existing "Superset coming up" /
  // "Giant set coming up" 2-vs-3+ split used by the pre-set heads-up modal.
  function announceGroupFocusChange(destIdx, sgi) {
    const destName = workoutExercises[destIdx]?.exercise?.name ?? '';
    const groupSize = workoutExercises.filter(e => e.supersetGroupId === sgi).length;
    // EL-9: a circuit's station change is announced the same way a
    // superset's is (this function already covers both the forward
    // station-to-station jump and the round-return), just under its own
    // name - the group header on screen carries the round count.
    const destIsCircuit = workoutExercises[destIdx]?.routineExercise?.groupKind === 'circuit';
    const groupLabel = destIsCircuit ? 'Circuit' : (groupSize > 2 ? 'Giant set' : 'Superset');
    const message = `${groupLabel}: now ${destName}`;
    hapticsVocab.selection();
    try {
      AccessibilityInfo.announceForAccessibility(message);
    } catch (_) { /* announcement is best-effort */ }
    if (groupFocusTimeoutRef.current) clearTimeout(groupFocusTimeoutRef.current);
    setGroupFocusMessage(message);
    groupFocusTimeoutRef.current = setTimeout(() => setGroupFocusMessage(null), 2500);
  }

  function handleNextExercise() {
    cancelAutoAdvance();
    // WK-5: skip over exercises Time Crunch dropped (_timeCrunchSkipped). They
    // stay in the list so the action can be reverted, but advancing onto one
    // would let the user log against a slot they were told was dropped. Stop at
    // the first non-skipped exercise; if none remain, don't advance past the end
    // (setting an out-of-bounds index would render an empty exercise slot).
    let next = currentExerciseIndex + 1;
    while (next < workoutExercises.length && workoutExercises[next]?._timeCrunchSkipped) {
      next += 1;
    }
    if (next >= workoutExercises.length) return; // no non-skipped exercise ahead
    audit('workout.exercise.next', { fromIndex: currentExerciseIndex, toIndex: next });
    setCurrentExerciseIndex(next);
    setTimeout(() => scrollRef.current?.scrollTo({ y: 0, animated: true }), 50);
  }

  function handleTogglePair() {
    const updated = [...workoutExercises];
    if (isPairedWithNext) {
      // Unlink the whole group: clear the group id from EVERY member (a pair is
      // just the two-member case). Coherent for a giant set of 3+ - it never
      // leaves an orphaned lone member still carrying the group id.
      //
      // F-13 (docs/final-certification-2026-09-05/07-FINDINGS.md, evidence
      // A4): the group KIND goes with the group id. Leaving groupKind =
      // 'circuit' on an unlinked member left the athlete doing straight sets
      // that were still stamped evidence_class 'circuit' (isCircuitGroup
      // reads groupKind alone) and so still excluded from every learning
      // consumer, with nothing on screen saying so. roundRestSeconds goes
      // too: with no group there is no round to rest between, and fullRest
      // must fall back to the ordinary per-exercise rest.
      const gid = currentSGI;
      for (let i = 0; i < updated.length; i++) {
        if (updated[i].supersetGroupId === gid) {
          const re = updated[i].routineExercise;
          updated[i] = {
            ...updated[i],
            supersetGroupId: null,
            routineExercise: re
              ? { ...re, groupKind: null, roundRestSeconds: null }
              : re,
          };
        }
      }
    } else {
      // Link the current exercise with the next. If either is already in a
      // group, the other JOINS that group (growing a pair into a giant set);
      // otherwise a fresh group id links the two. A string id matches the
      // builder/engine scheme, so a mixed session never produces a NaN id.
      const nextIdx = currentExerciseIndex + 1;
      const curGid = updated[currentExerciseIndex].supersetGroupId;
      const nextGid = updated[nextIdx]?.supersetGroupId;
      const gid = curGid || nextGid || `ss-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      updated[currentExerciseIndex] = { ...updated[currentExerciseIndex], supersetGroupId: gid };
      updated[nextIdx] = { ...updated[nextIdx], supersetGroupId: gid };
    }
    useAppStore.getState().setWorkoutExercises(updated);
    hapticsVocab.selection();
  }

  // D43 S3 (blueprint 3.8): handleMoveExercise (the overflow's one-step
  // chevron move) is DELETED -- the reorder sheet below (D32) is now the
  // ONE reorder path, superseding D32's original "additive, both stay"
  // framing. Re-pinned in ActiveWorkoutScreen.reorder.guard.test.js (D43 S3).

  // D32 (2026-07-10, campaign item 20): the purpose-built reorder SHEET's
  // own accessible move path (chevrons inside the sheet, same shape the
  // sheet's drag rows use) -- distinct from handleMoveExercise above, which
  // stays untouched and still only moves the CURRENT exercise one step from
  // the main view's overflow menu. This one is block-aware (a superset/
  // giant-set group in the sheet's whole-workout list moves as a unit,
  // src/lib/reorder.js) and can move ANY row in the sheet, not just the one
  // currently focused. Persists through the SAME setWorkoutExercises path
  // (see handleReorderWorkoutExercises below) and keeps currentExerciseIndex
  // pointing at the same exercise.
  function handleSheetMoveExercise(index, direction) {
    const updated = swapAdjacentBlocks(workoutExercises, index, direction, (e) => e.supersetGroupId ?? null);
    if (updated === workoutExercises) return;
    const movedEntry = workoutExercises[currentExerciseIndex];
    useAppStore.getState().setWorkoutExercises(updated);
    const newIndex = updated.indexOf(movedEntry);
    if (newIndex !== -1 && newIndex !== currentExerciseIndex) setCurrentExerciseIndex(newIndex);
    hapticsVocab.selection();
  }

  // D32: the reorder sheet's drag path. DragReorderList already fires the
  // pickup/drop haptics itself. Persists through the SAME
  // setWorkoutExercises -> _persistActiveWorkout flow every other order-
  // affecting action here uses (add/remove/move/pair exercise); sets on
  // every entry are untouched (order metadata only), and
  // currentExerciseIndex is re-pointed at whichever array slot the exercise
  // the user was actually on ends up in, so the main view never jumps to a
  // different exercise underneath them after closing the sheet.
  function handleReorderWorkoutExercises(nextExercises) {
    const movedEntry = workoutExercises[currentExerciseIndex];
    useAppStore.getState().setWorkoutExercises(nextExercises);
    const newIndex = nextExercises.indexOf(movedEntry);
    if (newIndex !== -1 && newIndex !== currentExerciseIndex) setCurrentExerciseIndex(newIndex);
  }

  function handleRemoveExercise() {
    if (workoutExercises.length <= 1) {
      appAlert('Cannot remove', 'This is the only exercise in your session.');
      return;
    }
    appAlert(
      'Remove exercise?',
      `Remove ${exercise.name} from this session. Your plan is not changed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            audit('workout.exercise.removed', { exerciseId: exercise?.id });
            // Round 11 (R11-1) + round 12 (R12-1): removing a row whose
            // slot serve substituted INTO ends that substitution with
            // nothing standing - the slot's entry converts to an
            // omission. The conversion keys on the SLOT'S RECORD, never
            // only the in-memory marker: a manual swap clears
            // _capabilityTemp, so the round-11 marker-gated call left a
            // swap-then-remove chain claiming a substitution the user
            // had deleted. With the marker gone the slot's stable id
            // finds the entry (rowId-only matching is exact in the
            // helper, so a slot with no substitution entry is a clean
            // no-op). Best-effort, like every effects write here.
            const removedEntry = workoutExercises[currentExerciseIndex];
            const removedTemp = removedEntry?._capabilityTemp;
            const removedRowId = removedTemp?.rowId ?? removedEntry?.routineExercise?.id ?? null;
            if ((removedTemp?.fromId || removedRowId != null) && user?.id && activeWorkout?.id) {
              // eslint-disable-next-line global-require
              const { convertSessionConstraintSubstitutionToOmission } = require('../lib/database');
              convertSessionConstraintSubstitutionToOmission(user.id, activeWorkout.id, {
                exerciseFrom: removedTemp?.fromId ?? null,
                rowId: removedRowId,
              }).catch(() => { /* best effort */ });
            }
            // CC29 (section 17; closes Audit G C3 for the constraint
            // cause): removing an EPISODE-affected exercise writes a
            // durable omission on this session's effects record. Removal
            // for any other reason writes nothing. Round 12 (R12-2): the
            // gate takes the shared removalExcusalConflicts answer - an
            // UNKNOWN-only conflict excuses nothing (the same row's own
            // notice says "Volyume doesn't know yet"; this writer must
            // not contradict it into the record), matching the certainty
            // and choice gates the completion writer has always applied.
            // A substituted slot's story is the conversion above, and a
            // row the user chose themselves (_userAdded - a picker add
            // or a manual swap) is the user's own to remove: neither
            // records an excusal here.
            // Round 18 (A15): judged on a FRESH capability read at
            // write time, like the completion writer - the screen's
            // own constraintConflicts is pending-gated, so a removal
            // during the mount window (or under a transient read
            // failure the focus reload later recovers from) answered
            // [] and a legitimate excusal was silently missed. The
            // resolver cannot reject (it returns stale-known or
            // unknown-empty on failure), and both failure shapes
            // yield no conflicts here - the same conservative
            // direction as before, now only for reads that genuinely
            // know nothing. The judged row is re-fetched the same way
            // the render-scope judgement resolves it; async on
            // purpose - the write is best-effort and the UI removal
            // below must not wait on it.
            // Round 19 (R19-4): a PERFORMED row's absence is never
            // excused - the same first-line refusal the completion
            // writer has always had (computeCompletionEffects returns
            // on row.performed), which this writer lacked entirely:
            // logging sets, then capturing a rule via "Work around
            // this", then removing the exercise wrote a durable
            // 'omitted' for a movement the user demonstrably trained
            // in that session - unrevocable, because the removed row
            // vanishes from the completion snapshot (the fabricated-
            // CONSTRAINED class D123 ruling 5 rejected). The entry's
            // sets array is the same fact completion consumes as
            // `performed`, read at tap time.
            if (!removedTemp && !removedEntry?._userAdded
              && !(removedEntry?.sets?.length)
              && user?.id && activeWorkout?.id && exercise?.id) {
              // removedRowId from the conversion above: with removedTemp
              // null it is exactly this row's planned-slot id.
              const removedSlot = currentExerciseIndex;
              const removedExerciseId = exercise.id;
              const judgedNow = judgedExercise;
              (async () => {
                try {
                  // eslint-disable-next-line global-require
                  const { loadCapabilityResolveState } = require('../lib/capability/resolve');
                  // eslint-disable-next-line global-require
                  const { episodeConflicts, removalExcusalConflicts } = require('../lib/capability/effective');
                  // eslint-disable-next-line global-require
                  const { getExerciseById, appendSessionConstraintEffects } = require('../lib/database');
                  const fresh = await loadCapabilityResolveState(user.id, {});
                  const row = judgedNow
                    ?? (await getExerciseById(removedExerciseId).catch(() => null))
                    ?? { id: removedExerciseId };
                  const removalDefinite = removalExcusalConflicts(episodeConflicts(fresh, row));
                  if (!removalDefinite.length) return;
                  await appendSessionConstraintEffects(user.id, activeWorkout.id, [{
                    slot: removedSlot,
                    // R10-1: the record keys per planned slot.
                    rowId: removedRowId,
                    exerciseFrom: removedExerciseId,
                    effect: 'omitted',
                    constraintIds: removalDefinite.map(c => c.constraintId),
                  }]);
                } catch (_) {
                  // Best effort, and honestly scoped (round 19, I8): a
                  // write lost here is LOST - the removed row is gone
                  // from the completion snapshot and performedIds only
                  // revoke, never create, so completion cannot
                  // re-derive this entry. Conservative direction: an
                  // excusal missed, never fabricated.
                }
              })();
            }
            cancelAutoAdvance();
            const store = useAppStore.getState();
            const updated = workoutExercises.filter((_, i) => i !== currentExerciseIndex);
            store.setWorkoutExercises(updated);
            setCurrentExerciseIndex(Math.min(currentExerciseIndex, updated.length - 1));
            setLoggedSets([]);
            setPrevSets([]);
            setAllTimeSets([]);
            sessionSetsRef.current = [];
          },
        },
      ],
    );
  }

  async function handleOpenSwap({ relaxStyle = false } = {}) {
    // Round 16 (R16-4, replacing round 15's one-directional bump): the
    // sheet's read PARTICIPATES in the sequence guard from the moment
    // of the tap - so a reload in flight at tap time cannot overwrite
    // this read, and a load the user triggers AFTER the tap (an
    // exercise change) wins over it, both directions. Round 15's
    // post-await bump could orphan that later, newer load.
    const swapSeq = ++intentLoadSeqRef.current;
    const allExercises = await getAllExercises();
    const alreadyInWorkout = workoutExercises.map(e => e.exercise?.id).filter(Boolean);
    // C9 Work 3: ask for a wider structural slate than we show, then let the
    // personal layer re-order inside it and drop anything the user has
    // excluded. Structural suitability still decides who is a candidate.
    // equipment (founder report 2026-08-19): mid-session swaps offered kit the
    // athlete does not have, because no swap surface passed their profile and
    // rankSwaps defaults to no filter. Read lazily off the store rather than
    // adding a subscription: this runs on a tap, not on render.
    const swapEquipment = useAppStore.getState().userProfile?.equipment ?? null;
    // EL-11: does this routine's plan carry a style:<pool> tag? Best-effort
    // and additive - a read failure just means no style restriction, same
    // as an ordinary plan.
    let styleKey = null;
    try {
      const routineId = activeWorkout?.routineId ?? null;
      const routineRow = routineId ? await getRoutineById(routineId) : null;
      const programmeRow = routineRow?.programmeId ? await getProgrammeById(routineRow.programmeId) : null;
      styleKey = styleKeyFromTags(programmeRow?.tags);
    } catch (_) { styleKey = null; }
    setSwapStylePoolKey(styleKey);
    setSwapStyleShowAll(relaxStyle);
    const stylePool = (styleKey && !relaxStyle) ? stylePoolFor(styleKey) : null;
    const ranked = rankSwaps(exercise, allExercises, {
      excludeIds: alreadyInWorkout, numResults: 20, excludeAssisted: !isBeginner, equipment: swapEquipment,
      stylePool,
    });
    let ordered = ranked.slice(0, 8);
    // T2-08 (D112 R5, closes audit T2-08): declared outside the try, exactly
    // like `ordered` above, so a personalisation failure still leaves a
    // safe default (0 = say nothing) rather than a stale count from a
    // previous open.
    let narrowedCount = 0;
    try {
      const block = user?.id ? await getActiveBlock(user.id) : null;
      const state = await loadExerciseIntentState(user?.id, {
        activeMesocycleId: block?.id ?? null,
        // Progression evidence is loaded only for the candidates on screen.
        progressionForIds: ranked.map((c) => c.exercise?.id).filter(Boolean),
      });
      ordered = rankPersonalised(state, ranked, {
        fromExerciseId: exercise?.id,
        routineId: activeWorkout?.routineId ?? null,
      }).slice(0, 8);
      // T2-08: counted over the STRUCTURAL list (ranked), before
      // rankPersonalised's senior question (isEligibleExercise ->
      // isCapabilityEligible) narrows it into `ordered` - this is exactly
      // the set that would otherwise vanish from the sheet unremarked.
      if (state?.capability && !state.capability.empty) {
        // eslint-disable-next-line global-require
        const { capabilityBlockReason } = require('../lib/capability/resolve');
        narrowedCount = ranked.filter((c) => capabilityBlockReason(state.capability, c.exercise) !== null).length;
      }
      // Round 16 (R16-4): the write lands only while the tap-time
      // sequence still stands - a load the user triggered after the tap
      // has a higher number and wins, exactly as this read wins over
      // anything in flight when it was made. (Round 15's post-await
      // bump claimed "newest by construction", which was false: the
      // read is issued asynchronously and a later-started load can be
      // newer.)
      if (swapSeq === intentLoadSeqRef.current) setIntentState(state);
      // D109-2: the read failed open (structural list stands, nothing is
      // filtered by avoidance) - say so, rather than let the swap list look
      // like a clean slate when it may not be. D112 R3 (audit T2-09): the
      // capability lane gets its own honest line, in its own vocabulary -
      // only when nothing at all is known (an unavailable read WITH a
      // last-known state still filters with the user's own rules).
      const capUnknown = !!(state?.capability?.unavailable && state?.capability?.empty);
      if (state?.unavailable && capUnknown) {
        toast.show('Avoided movements and Injuries & limitations could not be checked, so nothing is filtered here.', { variant: 'warning' });
      } else if (state?.unavailable) {
        toast.show('Avoided movements could not be checked, so nothing is filtered for them here.', { variant: 'warning' });
      } else if (capUnknown) {
        toast.show('Volyume could not check Injuries & limitations just now, so nothing is filtered for it here.', { variant: 'warning' });
      }
    } catch (_) { /* personalisation is additive: the structural list stands */ }
    // EL-11 (docs/exercise-library-expansion-2026-09-05/05-DECISIONS.md):
    // a circuit swap keeps the group (nothing here changes membership) and
    // must keep the group's compatibility - the existing pairing rule is
    // "no two stations sharing a primary muscle back to back"
    // (classifySupersetPair's tier/proximity answers a richer practicality
    // question, not this exact exclusion, so this is the smallest filter
    // that expresses it directly). Adjacent = the immediate neighbours in
    // the group's cyclic rotation, wrapping round both ends.
    if (isCircuitGroup && currentSGI != null) {
      const members = workoutExercises.filter(e => e.supersetGroupId === currentSGI);
      const selfIdx = members.findIndex(e => e === currentEntry);
      if (selfIdx >= 0 && members.length > 1) {
        const adjacentMuscles = new Set(
          [members[(selfIdx - 1 + members.length) % members.length], members[(selfIdx + 1) % members.length]]
            .map(m => (m?.exercise?.primaryMuscle || '').toLowerCase())
            .filter(Boolean),
        );
        if (adjacentMuscles.size) {
          ordered = ordered.filter(c => !adjacentMuscles.has((c.exercise?.primaryMuscle || '').toLowerCase()));
        }
      }
    }
    setSwapCandidates(ordered);
    setSwapNarrowedCount(narrowedCount);
    setShowSwapModal(true);
  }

  function handleConfirmSwap(newExercise) {
    const store = useAppStore.getState();
    const updatedExercises = [...workoutExercises];
    // Load semantics rebuilt from the new exercise's own defaults - the
    // module-level helper shared with the capability effective view, so a
    // manual swap and an automatic substitution carry identical
    // prescription behaviour (D112 R2).
    const prevRoutineEx = updatedExercises[currentExerciseIndex]?.routineExercise;
    const rebuiltRoutineEx = rebuildRoutineExerciseFor(newExercise, prevRoutineEx);
    // The zero-history seed below wants the same band floor the rebuild
    // chose; with no routineExercise to rebuild, fall to the new
    // exercise's own defaults exactly as before.
    const newRepMin = rebuiltRoutineEx?.recommendedRepsMin
      ?? newExercise.defaultRepMin ?? newExercise.default_rep_min ?? 6;
    // Round 10 (R10-2): swapping away a serve-substituted row is the
    // user overriding the app's workaround. The spread used to carry
    // _capabilityTemp forward, so the quiet line claimed "Temporarily in
    // for X" over the user's OWN pick, and the durable record kept
    // naming a substitute the user never trained. The marker is cleared
    // and the slot's substitution entry is amended to name what actually
    // stood in it. Round 11 (R11-4): EVERY manual swap marks the row the
    // user's own, not only a swap over a substitute - the round-10
    // conditional left an unmarked swapped row for the relaunch re-serve
    // pass (reachable once the last marker clears) to substitute over,
    // against the user's word (D112 R4). _userAdded means "the user
    // chose this row", and a swap is exactly that choice.
    const prevTemp = updatedExercises[currentExerciseIndex]?._capabilityTemp;
    updatedExercises[currentExerciseIndex] = {
      ...updatedExercises[currentExerciseIndex],
      exercise: newExercise,
      routineExercise: rebuiltRoutineEx,
      sets: [],
      _userAdded: true,
      ...(prevTemp ? { _capabilityTemp: undefined } : {}),
    };
    store.setWorkoutExercises(updatedExercises);
    if (prevTemp?.fromId && user?.id && activeWorkout?.id && newExercise?.id) {
      // eslint-disable-next-line global-require
      const { amendSessionConstraintSubstitution } = require('../lib/database');
      amendSessionConstraintSubstitution(user.id, activeWorkout.id, {
        exerciseFrom: prevTemp.fromId,
        rowId: prevTemp.rowId ?? null,
        exerciseTo: newExercise.id,
      }).catch(() => { /* best effort; the swap itself must never fail */ });
    }
    // C9 Work 3: a session swap is a deliberate choice, so it is evidence
    // too - even though it deliberately does NOT change the plan (the sheet
    // says so). Recorded with the routine it happened in, so the preference
    // stays contextual. Best-effort: this must never fail the swap.
    //
    // C16 quality law 1: recorded as SESSION scope. Substituting here
    // because the machine was busy must never teach Volyume that the user
    // dislikes the exercise - before this it was indistinguishable from
    // editing the exercise out of the programme, and two busy-machine days
    // were enough to have it proposed for removal.
    if (user?.id && exercise?.id && newExercise?.id) {
      recordExerciseSwap(user.id, exercise.id, newExercise.id, {
        routineId: activeWorkout?.routineId ?? null, explicit: true,
        scope: SWAP_SCOPE.SESSION,
        // T2-28a: a Work-around-sheet swap is capability-motivated by the
        // user's own declaration, rule or no rule yet. EL-11: absent that,
        // a swap made while the sheet was still restricted to the plan's
        // style pool (not relaxed via "Show all exercises") is recorded
        // cause 'style' - staying inside the pool is not preference.
        causeOverride: workAroundSwapRef.current ? 'constraint'
          : (swapStylePoolKey && !swapStyleShowAll) ? 'style'
          : null,
      }).catch(() => {});
    }
    workAroundSwapRef.current = false;
    cancelAutoAdvance();
    setSwapCandidates([]);
    setSwapStylePoolKey(null);
    setSwapStyleShowAll(false);
    setShowSwapModal(false);
    setPrevSets([]);
    setAllTimeSets([]);
    setLoggedSets([]);
    // C5-P14-02 (D96): a swapped-in exercise is a zero-history first-ever
    // set (handleConfirmSwap deliberately clears prevSets/allTimeSets and
    // nulls startingWeight), so it seeds from the same end of the band as the
    // zero-history branch in the exercise loader. seededEntryRef follows.
    setCurrentSet({
      ...DEFAULT_SET,
      reps: newRepMin || DEFAULT_SET.reps,
    });
    seededEntryRef.current = { weight: DEFAULT_SET.weight, reps: newRepMin || DEFAULT_SET.reps };
    setGhostSet(null);
    setCluster(null);
    setClusterReps('');
    setPerSide(null);
    setExtraSetArmed(false);
    setNoteText('');
    sessionSetsRef.current = [];
  }

  // Single entry point for the exercise picker, whether it was opened to add or
  // to swap. Swap replaces the current exercise (incl. a freshly created custom
  // one); add appends and jumps to it.
  function handlePickerSelect(ex) {
    if (pickerMode === 'swap') {
      handleConfirmSwap(ex);
    } else {
      const newIndex = workoutExercises.length;
      addExerciseToWorkout(ex);
      setCurrentExerciseIndex(newIndex);
    }
    setShowExercisePicker(false);
    setPickerMode('add');
  }

  function closeExercisePicker() {
    setShowExercisePicker(false);
    setPickerMode('add');
  }

  function openAddExercisePicker() {
    setPickerMode('add');
    setShowExercisePicker(true);
  }

  // L07-F10: whether the CURRENT exercise has real unsaved work sitting in
  // the entry that a Cancel/Finish tap would silently drop -- a typed-but-
  // not-yet-logged set, a cluster mid-way through its mini-sets, or an
  // unsaved note. Shared by handleCancelWorkout (widens its confirm gate)
  // and handleFinishWorkout (names the set in its existing confirm copy).
  //
  // C5-P13-02 (D96): this compared against the MODULE CONSTANT, so it was
  // true in almost every ordinary state with no user input at all. A
  // zero-history exercise seeds reps from recommendedRepsMax (the seeded
  // plans use 10, 12, 25, 30), so `reps !== DEFAULT_SET.reps` was true
  // before anything was typed; and the carry-forward after any logged set
  // puts a number in `weight`, so `weight !== ''` was true for the rest of
  // the session. Consequences: a first-time user who opened a session and
  // touched nothing got the "Discard workout?" modal, and a user who
  // finished a complete session was told "You also have an unlogged set
  // for X that will be lost" about the carried-forward copy of the set
  // they had just saved. The comparison is now against the entry's own
  // resolved baseline (seededEntryRef, written at every programmatic seed:
  // plan/history prefill, ghost, carry-forward, deload prescription), so
  // "unchanged since seeding" is not in progress. A restored draft is
  // deliberately NOT a seed -- that IS unsaved user work. The cluster,
  // perSide and noteText clauses are unchanged.
  function hasInProgressSetEntry() {
    const seed = seededEntryRef.current;
    const sameWeight = String(currentSet.weight ?? '') === String(seed?.weight ?? '');
    const sameReps = currentSet.reps === seed?.reps;
    return !!cluster
      || !!perSide
      || noteText.trim().length > 0
      || !(sameWeight && sameReps);
  }

  // Item 4a (D141): "Discard workout" must never lose data silently and must
  // never leave a native rest-timer surface running behind a screen that's
  // gone. The delete now runs FIRST, bounded against a stuck DB (~8s), and
  // endWorkout()/navigation only fire once the delete has actually
  // succeeded; a failure keeps the user on the screen so they can retry
  // instead of quietly discarding half of the work.
  //
  // Ordering finding: endWorkout() (useAppStore.js) clears restTimerActive/
  // restTimerEndsAt directly in the store, but it is NOT one of the five
  // live-activity lifecycle call sites pinned by
  // src/lib/__tests__/liveActivity.wiring.test.js - only stopRestTimer(),
  // tickRestTimer() (natural expiry) and restoreActiveWorkout() (launch
  // sweep) call require('live-activity').endRestActivity(). So a discard
  // while a rest is running would leave the iOS Live Activity (and, on
  // Android, the rest-timer-live foreground chronometer RestTimer.js only
  // tears down via its own restTimerActive effect) counting down a session
  // that no longer exists, until it expires on its own or the next launch's
  // stale-Activity sweep. stopRestTimer() is called explicitly below
  // whenever a rest is still active at the moment of discard, closing that
  // gap without touching the store file.
  async function discardWorkout(errorSource) {
    const discardId = activeWorkout?.id;
    if (!discardId) {
      endWorkout();
      navigation.goBack();
      return;
    }
    let timer;
    const bounded = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('discard: timed out waiting for delete')), 8000);
    });
    try {
      // deleteIncompleteWorkout resolves false when no live row matched
      // (already deleted, or already completed elsewhere). That is not a
      // failure to discard: the session is gone, and treating it as one
      // would trap the user on a screen for a workout that no longer
      // exists (a delete that finished after the bound below, then a second
      // tap). Only a thrown delete or the bound keeps them here.
      await Promise.race([deleteIncompleteWorkout(discardId), bounded]);
      // Fresh read: the rest timer may have started, stopped or expired
      // while the delete was in flight.
      if (useAppStore.getState().restTimerActive) {
        useAppStore.getState().stopRestTimer();
      }
      endWorkout();
      navigation.goBack();
    } catch (e) {
      logError(errorSource, e, { workoutId: discardId });
      toast.show("Couldn't discard this workout, try again", { variant: 'error' });
    } finally {
      clearTimeout(timer);
    }
  }

  function handleCancelWorkout() {
    const store = useAppStore.getState();
    const totalSets = store.workoutExercises.reduce((sum, e) => sum + (e.sets?.length ?? 0), 0);
    // A genuinely empty session (no logged sets AND nothing typed/in-
    // progress) can discard silently, one tap, no dialog. But a typed-not-
    // yet-logged set, an in-progress cluster, or an unsaved note is real
    // unsaved work the old totalSets===0 check discarded with zero
    // confirmation, so widen the gate to cover it with the same calm
    // discard-confirm the app already uses once any set is logged.
    if (totalSets === 0 && !hasInProgressSetEntry()) {
      store.endWorkout();
      // eslint-disable-next-line global-require
      try { require('../lib/notifications/activeWorkout').dismissActiveWorkoutNotification(); } catch (_) {}
      navigation.goBack();
    } else {
      setShowDiscardModal(true);
    }
  }

  // Hardware back → cancel flow
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleCancelWorkout();
      return true;
    });
    return () => sub.remove();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // D9: load the per-exercise "log per side" preferences once - which
  // exercises are ON, which have already been asked about (so the
  // suggestion never repeats), and whether the one-time walkthrough has
  // ever been shown. All three gate the suggestion effect below, so it
  // waits for this load rather than firing optimistically and asking twice.
  useEffect(() => {
    let active = true;
    Promise.all([
      loadUnilateralExercises(),
      loadUnilateralAsked(),
      AsyncStorage.getItem(UNILATERAL_WALKTHROUGH_SEEN_KEY).catch(() => null),
      AsyncStorage.getItem(SUPERSET_WALKTHROUGH_SEEN_KEY).catch(() => null),
    ]).then(([on, asked, seen, supersetSeen]) => {
      if (!active) return;
      setUnilateralExercises(on);
      setUnilateralAsked(asked);
      unilateralWalkthroughSeenRef.current = seen === 'true';
      supersetWalkthroughSeenRef.current = supersetSeen === 'true';
      setUnilateralPrefsLoaded(true);
    }).catch(() => { if (active) setUnilateralPrefsLoaded(true); });
    return () => { active = false; };
  }, []);

  // Stale workout check (>4h since last activity)
  useEffect(() => {
    if (lastActivityAt && Date.now() - lastActivityAt > 4 * 60 * 60 * 1000) {
      setShowStaleModal(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load "next time" coaching notes when the workout begins
  useEffect(() => {
    if (!activeWorkout || !user?.id) return;
    const routineId = activeWorkout.routineId ?? null;
    getNextTimeNotes(user.id, routineId).then(notes => {
      // Only surface notes not already shown in this session
      const unseen = notes.filter(n => !shownNoteIdsRef.current.has(n.id));
      if (unseen.length > 0) {
        unseen.forEach(n => shownNoteIdsRef.current.add(n.id));
        setNextTimeNotes(unseen);
      }
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkout?.id]);

  // Superset heads-up: when the user lands on an exercise that's part of a
  // group we haven't already shown the modal for in this workout, surface a
  // clear instructional sheet so a first-timer isn't lost. Shown once per
  // group id per workout, dismissing acknowledges; unlinking removes the
  // whole group; swap opens the swap UI for the current exercise. Works for a
  // pair (two members) or a giant set (3+).
  // C5-P37-02 (D96): the two auto-firing instructional sheets on this screen
  // (this one and the unilateral walkthrough below) keyed off the same
  // exercise with no mutual guard, so an exercise that satisfied both
  // conditions opened both at once and the later-declared one covered the
  // other. Generated plans really do pair unilateral accessories into
  // supersets (planEngine assignSupersets excludes beginners only), so the
  // first session of an intermediate or advanced user was the exposed case.
  // The refs below are set synchronously beside each setState so the guard
  // holds within the SAME commit, where the state has not landed yet;
  // whichever sheet is relevant first wins and the other defers to its next
  // natural moment (the effects re-run when the open sheet closes, because
  // the other's state is in their dependency lists). Both sheets, both copy
  // blocks and both one-time persistence rules are untouched.
  const supersetSheetOpenRef = useRef(false);
  const unilateralSheetOpenRef = useRef(false);
  useEffect(() => {
    if (!supersetHeadsUp) supersetSheetOpenRef.current = false;
    if (!unilateralSuggest) unilateralSheetOpenRef.current = false;
  }, [supersetHeadsUp, unilateralSuggest]);

  useEffect(() => {
    if (currentSGI == null) return;
    // RC-3: once the walkthrough has ever been seen, the chip is enough.
    if (supersetWalkthroughSeenRef.current) return;
    if (acknowledgedSupersetsRef.current.has(currentSGI)) return;
    if (!pairedExerciseName) return; // safety
    if (unilateralSheetOpenRef.current) return; // C5-P37-02: defer, do not stack
    // Tag as acknowledged immediately so navigating away+back doesn't re-fire
    // before the user dismisses.
    acknowledgedSupersetsRef.current.add(currentSGI);
    // RC-3: persist at fire time (the modal owns the screen from here), so
    // the lesson shows exactly once across the account's whole life.
    supersetWalkthroughSeenRef.current = true;
    AsyncStorage.setItem(SUPERSET_WALKTHROUGH_SEEN_KEY, 'true').catch(() => {});
    supersetSheetOpenRef.current = true;
    setSupersetHeadsUp({
      groupId: currentSGI,
      // Every member in session order (a pair is just two; a giant set 3+).
      memberNames: groupMemberNames.length ? groupMemberNames : [exercise?.name ?? 'this exercise'],
      // F-13 (evidence A4): a circuit is not a giant set. It is announced
      // as a circuit, with its rounds and round rest, and it is NOT
      // unlinkable here - a circuit is edited in the plan, not broken
      // apart mid-session. The kind is read from the STORED prescription,
      // never from the group's size.
      isCircuit: isCircuitGroup,
      rounds: routineExercise?.recommendedSets ?? null,
      roundRestSeconds: routineExercise?.roundRestSeconds ?? null,
    });
    hapticsVocab.selection();
    // groupMemberNames is derived from currentSGI + workoutExercises and only
    // read once, behind the acknowledged-ref gate, so it needn't re-trigger.
    // unilateralSuggest is in the list so a deferred heads-up re-fires the
    // moment the unilateral sheet closes (C5-P37-02).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSGI, pairedExerciseName, exercise?.name, unilateralSuggest]);

  // D9: metadata-flagged unilateral exercises (exercise.laterality, finally
  // read here - exerciseMetadata.js's deriveLaterality was computed and
  // stored but never consulted before this build, see plan-C-unilateral-
  // logging.md) get a one-time, per-exercise suggestion to log per side.
  // Never forced - bilateral exercises never see this, and a unilateral
  // exercise only ever gets asked ONCE (loadUnilateralAsked); the answer
  // sticks per exercise via setUnilateralExercise. The very first time this
  // fires for the user, the suggestion carries the full walkthrough
  // (modelled on the superset heads-up above); every later exercise gets a
  // quick confirm only, since the pattern has already been taught.
  // acknowledgedUnilateralRef tags the exercise id immediately, same guard
  // shape as acknowledgedSupersetsRef above, so navigating away and back
  // doesn't re-fire before the user answers.
  const acknowledgedUnilateralRef = useRef(new Set());
  useEffect(() => {
    if (!unilateralPrefsLoaded || !exercise?.id) return;
    if (exercise.laterality !== 'unilateral') return;
    // Round 17 (R17-1): the ask WAITS for its inputs. This prompt is an
    // ACTION, not a rendered notice - R2-6's "stay silent until the
    // resolve matches" posture is right for captions, but proceeding
    // here was a fail-open: on an exercise change this effect ran in
    // the same commit that cleared resolvedExercise, so judgedExercise
    // was null, sidedRuleBearsOnThis answered false, and the both-sides
    // ask fired for exactly the movement class it is most forbidden on
    // (D120 ruling 1) - then self-tagged below, so the corrected gate
    // could never re-open it. Both readiness terms are deps, so the
    // effect re-runs and asks (or stays suppressed) once they settle.
    if (!resolvedExercise || resolvedExercise.id !== exercise.id) return;
    if (!intentState) return;
    // Round 18 (R18-1): presence is not knowledge. The round-17 terms
    // above pass on a state the app could NOT read - a cold-start read
    // failure hands the effect an unknown-empty capability state
    // (unavailable, nothing known), the suppression gate answers false
    // off it, and the ask fired for exactly the user it must never
    // fire for, then self-tagged durably. Same for a judgement row the
    // resolve could not fetch: no demand columns, no answer. An ACTION
    // holds until the app actually KNOWS (D129 ruling 1, D130); both
    // terms sit before the gate and before the self-tag, and both
    // inputs are deps, so a later successful read re-runs this and
    // asks (or suppresses) on real knowledge. Cost stated on the
    // A11/A15 rows: under a persistent read failure the per-side
    // suggestion stays silent for the session - the conservative
    // direction the ruling demands.
    // eslint-disable-next-line global-require
    const { capabilityKnown } = require('../lib/capability/resolve');
    if (!capabilityKnown(intentState.capability)) return;
    if (!resolvedExercise.row) return;
    // Laterality verification (founder order 2026-08-21): never PROPOSE
    // a both-sides flow for a movement a sided rule bears on - "do the
    // same reps on each side" would be asking for work the user has
    // ruled out. Round 8 (R8-1): gated on sidedRuleBearsOnThis, NOT on
    // carvedForOneSide - the union carve is off when BOTH sides are
    // restricted, and that is the strongest case for suppression, not
    // an exemption from it. The manual toggle in the overflow sheet
    // stays, because an explicit choice is theirs to make; only the
    // app's own suggestion is held. Nothing about prescription changes
    // either way.
    if (sidedRuleBearsOnThis) return;
    if (unilateralAsked.has(exercise.id)) return;
    if (acknowledgedUnilateralRef.current.has(exercise.id)) return;
    if (supersetSheetOpenRef.current) return; // C5-P37-02: defer, do not stack
    acknowledgedUnilateralRef.current.add(exercise.id);
    hapticsVocab.selection();
    if (unilateralWalkthroughSeenRef.current) {
      appAlert(
        'Log this one side at a time?',
        `${exercise.name} is usually trained one side at a time. Do the same reps on each side, one after the other; it still counts as one working set.`,
        [
          { text: 'No, log as normal', style: 'cancel', onPress: () => handleUnilateralAnswer(exercise.id, false) },
          { text: 'Yes, log per side', onPress: () => handleUnilateralAnswer(exercise.id, true) },
        ],
      );
    } else {
      unilateralSheetOpenRef.current = true;
      setUnilateralSuggest({ exerciseId: exercise.id, exerciseName: exercise.name });
    }
  // supersetHeadsUp is in the list so a deferred walkthrough fires the moment
  // the superset sheet closes (C5-P37-02).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercise?.id, exercise?.laterality, exercise?.name, unilateralPrefsLoaded, unilateralAsked, supersetHeadsUp, sidedRuleBearsOnThis, resolvedExercise, intentState]);

  // First-use info tip: pulse the Info button until tapped. The pulse itself
  // is suppressed under Reduce Motion (the static badge still shows so the
  // user can find the button), only the looping animation is killed.
  useEffect(() => {
    AsyncStorage.getItem('@volyume_seen_workout_info').then(val => {
      if (val === 'true') return;
      setShowInfoTipPulse(true);
      if (reduceMotion) return;
      infoPulseLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(infoPulseAnim, { toValue: 1.35, duration: motion.pulse, useNativeDriver: true }),
          Animated.timing(infoPulseAnim, { toValue: 1.0,  duration: motion.pulse, useNativeDriver: true }),
        ])
      );
      infoPulseLoop.current.start();
    });
    return () => { infoPulseLoop.current?.stop(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduceMotion]);

  // Activation ruling (first-run coherence pass), rest strip introduction.
  //
  // Two things happen at the FIRST rest of this install, in this order:
  //   1. the caption below the strip explains where the countdown came from
  //      (it auto-starts on a logged set, so a first-time user meets it
  //      without asking for it), and
  //   2. if - and only if - the OS prompt has never been answered, the
  //      notification ask runs once, so the lock-screen countdown the rest
  //      code already builds is allowed to appear.
  // A user who has already granted or denied is never asked again, and the
  // ask never fires on mount - only when a rest is actually running.
  // RestTimer's own exact-alarm ask is untouched and keeps its own key.
  const [showRestHint, setShowRestHint] = useState(false);
  const restHintCheckedRef = useRef(false);
  useEffect(() => {
    if (!restTimerActive) {
      // "Dismiss automatically when the timer ends" - the caption belongs to
      // the running rest, not to the screen.
      setShowRestHint(false);
      return;
    }
    if (restHintCheckedRef.current) return;
    restHintCheckedRef.current = true;
    (async () => {
      try {
        if (await AsyncStorage.getItem(REST_HINT_SEEN_KEY) === 'true') return;
        await AsyncStorage.setItem(REST_HINT_SEEN_KEY, 'true');
        setShowRestHint(true);
        if (await AsyncStorage.getItem(REST_NOTIF_ASKED_KEY) === 'true') return;
        // Non-prompting read first: 'granted' or 'denied' means the user has
        // already decided and we say nothing.
        const status = await getNotificationPermissionStatus();
        if (status !== 'undetermined') return;
        await AsyncStorage.setItem(REST_NOTIF_ASKED_KEY, 'true');
        await requestNotificationPermissions();
      } catch (e) {
        // Never interrupt a rest over a hint or a permission read.
        logError('ActiveWorkoutScreen.restHint', e, {});
      }
    })();
  }, [restTimerActive]);

  const dismissRestHint = useCallback(() => { setShowRestHint(false); }, []);

  // Workout timer, always derived from workoutStartTime so backgrounding never
  // causes drift. Re-syncs on every tick and on app-foreground events.
  useEffect(() => {
    if (!workoutStartTime) return;

    function syncElapsed() {
      setElapsedSeconds(Math.floor((Date.now() - workoutStartTime) / 1000));
    }

    syncElapsed();
    if (IS_JEST) {
      return () => {
        if (logFlashTimeoutRef.current) clearTimeout(logFlashTimeoutRef.current);
      };
    }
    timerRef.current = setInterval(syncElapsed, 1000);

    const appStateSub = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') syncElapsed();
    });

    return () => {
      clearInterval(timerRef.current);
      // Subscription remove() can throw on corrupt subscription objects (rare
      // but possible after RN reload). Swallow so the rest of the cleanup
      // continues; the worst case is one orphan listener until next reload.
      try { appStateSub?.remove(); } catch (_) {}
      // Drop any pending log-flash reset so it doesn't run on an unmounted
      // component (cancel + finish workout mid-flash would otherwise throw a
      // React warning).
      if (logFlashTimeoutRef.current) clearTimeout(logFlashTimeoutRef.current);
      // D44: same guard for the group-focus banner reset (finish/cancel
      // within 2.5s of a superset jump would otherwise set state after
      // unmount).
      if (groupFocusTimeoutRef.current) clearTimeout(groupFocusTimeoutRef.current);
    };
  }, [workoutStartTime]);

  // Persistent lock-screen / shade notification. Mirrors current
  // exercise + set + elapsed time so the user sees their workout
  // state without unlocking. Two update paths:
  //
  //   1. Real-time updates (immediate, no throttle), fire whenever
  //      the user-visible state changes: current exercise, set count,
  //      target set count. The notification re-presents on the next
  //      render tick so the lock screen always shows the same set the
  //      user just logged, not the one before. Previously the 15s
  //      throttle dropped these updates and the user saw stale state
  //      until the next tick passed the throttle window.
  //
  //   2. Elapsed-time refresh (throttled to 15s), keeps the "12:34"
  //      counter in the notification body roughly fresh without
  //      hammering the notification manager every second.
  //
  // Splitting the two paths into separate effects means the
  // dependency arrays don't fight each other and we get instant
  // feedback on user actions + cheap upkeep on the timer.
  const lastNotifUpdateRef = useRef(0);
  // F-13: the circuit round derived further down (circuitRound), mirrored
  // into a ref so the two notification effects above it can read the
  // latest value without depending on a binding declared after them.
  // Plain mirror of a rendered value, no side effect.
  const circuitRoundRef = useRef(null);

  // Path 1: immediate update on state change.
  useEffect(() => {
    if (!workoutStartTime || !activeWorkout) return;
    lastNotifUpdateRef.current = Date.now();
    // eslint-disable-next-line global-require
    const { showActiveWorkoutNotification } = require('../lib/notifications/activeWorkout');
    showActiveWorkoutNotification({
      workoutName: activeWorkout?.name,
      elapsedSeconds,
      // Count only WORKING sets towards the index. Including warm-ups
      // produced "Set 3 of 2" on the lock-screen / persistent
      // notification when the user logged a warm-up before the first
      // working set. totalSetsForExercise is the *working* target.
      // F-13 (evidence A5): a circuit station counts ROUNDS, and the round
      // is the circuit's own (circuitRoundRef), not this station's set
      // count - the lock screen must not contradict the chip on screen.
      currentSetIndex: circuitRoundRef.current?.round ?? (countProgressSets(loggedSets) + 1),
      totalSetsForExercise: adjustedSetCount, // COMP-015: reflect any session adjustment
      isCircuit: !!circuitRoundRef.current,
      exerciseName: exercise?.name,
    }).catch(() => {});
    // Intentionally exclude elapsedSeconds, that's handled by
    // the throttled effect below. This effect responds only to
    // user-driven state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkout?.id, loggedSets?.length, exercise?.name, adjustedSetCount, workoutStartTime]);

  // Path 2: throttled elapsed-time refresh.
  useEffect(() => {
    if (!workoutStartTime || !activeWorkout) return;
    const now = Date.now();
    if (now - lastNotifUpdateRef.current < 15_000) return;
    lastNotifUpdateRef.current = now;
    // eslint-disable-next-line global-require
    const { showActiveWorkoutNotification } = require('../lib/notifications/activeWorkout');
    showActiveWorkoutNotification({
      workoutName: activeWorkout?.name,
      elapsedSeconds,
      // Count only WORKING sets towards the index. Including warm-ups
      // produced "Set 3 of 2" on the lock-screen / persistent
      // notification when the user logged a warm-up before the first
      // working set. totalSetsForExercise is the *working* target.
      currentSetIndex: circuitRoundRef.current?.round ?? (countProgressSets(loggedSets) + 1),
      totalSetsForExercise: adjustedSetCount, // COMP-015
      isCircuit: !!circuitRoundRef.current, // F-13: "Round n of m" on a circuit
      exerciseName: exercise?.name,
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsedSeconds, activeWorkout, loggedSets?.length, exercise?.name, adjustedSetCount, workoutStartTime]);

  // Dismiss the persistent notification on screen unmount. Belt-and-
  // braces because endWorkout() / handleFinishWorkout also clear it,
  // but the unmount cleanup catches navigation-away cases.
  useEffect(() => () => {
    // eslint-disable-next-line global-require
    const { dismissActiveWorkoutNotification } = require('../lib/notifications/activeWorkout');
    dismissActiveWorkoutNotification().catch(() => {});
  }, []);

  // Lock-screen rest-timer "Log set" action. The ±15s / Skip-rest
  // buttons are handled in the notifications listener (they only touch the
  // store), but completing a set runs through the shared in-app path
  // (cluster vs normal handling), so it must fire here on the screen. The
  // action opens the app to the foreground; this listener picks it up and
  // runs handleCompleteSetPress, but ONLY when a rest is actually running,
  // so a stale tap is ignored. handleCompleteSetPressRef keeps the latest
  // closure without re-installing the listener every render.
  const handleCompleteSetPressRef = useRef(null);
  // Tracks whether the current set is still an unconfirmed ghost prefill, so the
  // lock-screen "Log set" action below can refuse to log values the user
  // hasn't actually entered.
  const currentSetGhostRef = useRef(false);
  useEffect(() => {
    // eslint-disable-next-line global-require
    const Notifications = require('expo-notifications');
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response?.notification?.request?.content?.data;
      if (data?.type !== 'rest_timer') return;
      const actionId = response?.actionIdentifier;
      if (actionId === 'add_exercise') {
        // L07-F4: opening the picker is a plain UI action, not a set-logging
        // or rest-math call, so unlike complete_set it doesn't need the
        // active-rest guard below -- adding an exercise still makes sense
        // even if the rest happened to end just before the tap landed. It
        // still requires a live workout so a stale tap on a notification
        // left over from a finished/discarded session is a no-op.
        const stAdd = useAppStore.getState();
        if (!stAdd.activeWorkout?.id) return;
        try { openAddExercisePicker(); } catch (_) { /* never crash on a tap */ }
        return;
      }
      if (actionId !== 'complete_set') return;
      // Active-rest guard: only act on a live, running rest.
      const st = useAppStore.getState();
      if (!st.activeWorkout?.id || !st.restTimerActive) return;
      // Don't blind-log from the lock screen. If the current set is still a
      // ghost (the suggested next-set prefill the user hasn't confirmed),
      // tapping "Log set" would log a set they may not have performed,
      // so just let opensAppToForeground bring them in to confirm. When they've
      // entered real values (not a ghost), complete it one-tap as before.
      if (currentSetGhostRef.current) return;
      try { handleCompleteSetPressRef.current?.(); } catch (_) { /* never crash on a tap */ }
    });
    return () => { try { sub?.remove(); } catch (_) {} };
  }, []);

  // Load previous performance and set defaults when exercise changes
  useEffect(() => {
    if (!exercise || !activeWorkout) return;
    sessionSetsRef.current = [];
    // Clear immediately so the UI never shows a previous exercise's data
    setLoggedSets([]);
    setPrevSets([]);
    setAllTimeSets([]);
    historyLoadedRef.current = false;
    setCurrentSet({ ...DEFAULT_SET });
    seededEntryRef.current = { weight: DEFAULT_SET.weight, reps: DEFAULT_SET.reps };
    setGhostSet(null);
    // Campaign 20 Phase 2: the evidence packet and any user override are
    // exercise-scoped (design section 9.4/14) - clear immediately so a fast
    // exercise switch never carries the old exercise's packet or override
    // into the new one before loadHistory's fresh packet lands.
    setPacketBase(null);
    setOverrideLoad(null);
    setOverrideReps(null);
    presentedPrescriptionRef.current = null;
    setNoteText('');
    // An unfinished cluster belongs to the exercise it was started on;
    // abandon it on any exercise change (incl. superset auto-jump) so
    // its banner can't carry stale reps onto the next exercise. A
    // part-way-through per-side set is the same shape of risk.
    setCluster(null);
    setClusterReps('');
    setPerSide(null);

    // Guard so that async state updates don't land after the exercise
    // changes (rapid swap) or the screen unmounts mid-load. Without this,
    // a fast tap on the next-exercise button + slow DB read could
    // overwrite the new exercise's fresh state with stale data from the
    // previous exercise.
    let cancelled = false;

    async function loadHistory() {
      // Campaign 20 Phase 2, Stage 3 (design section 9.1/19, 2 - one bounded
      // evidence pass): getLastNWorkoutSets moves from N=2 to N=3, the one
      // data change the design requires, and getAllCompletedSetsForExercise
      // stays exactly as it was (PR detection, allTimeSets state).
      const lastN = await getLastNWorkoutSets(exercise.id, activeWorkout.id, 3);
      if (cancelled) return;
      const allTime = await getAllCompletedSetsForExercise(exercise.id, activeWorkout.id);
      if (cancelled) return;
      const prev = lastN[0] || [];
      setPrevSets(prev);
      setAllTimeSets(allTime);
      historyLoadedRef.current = true;

      // The packet's raw history: up to 3 comparable sessions, each with its
      // own workout row fetched once for its difficulty rating - mirrors
      // livePrescription.js's own buildEvidencePacket loop byte-for-byte
      // (same two-call IO shape per session), but reuses the lastN already
      // fetched above instead of a second getLastNWorkoutSets round trip.
      const rawHistory = [];
      for (const sessionSets of lastN) {
        const workoutId = sessionSets?.[0]?.workoutId ?? sessionSets?.[0]?.workout_id ?? null;
        let workout = null;
        if (workoutId != null) {
          workout = await getWorkoutById(workoutId).catch(() => null);
          if (cancelled) return;
        }
        rawHistory.push({
          at: workout?.startedAt ?? workout?.started_at ?? null,
          difficulty: workout?.sessionDifficulty ?? workout?.session_difficulty ?? null,
          isDeload: false,
          sets: sessionSets,
        });
      }
      // CC30 (section 7 matrix): sessions trained under a capability
      // episode stay visible history but never comparable evidence - the
      // storage layer stamps them, the pure resolver reads the stamp.
      let stampedHistory = rawHistory;
      try {
        // eslint-disable-next-line global-require
        const { stampCapabilityConstrainedSessions } = require('../lib/database');
        stampedHistory = await stampCapabilityConstrainedSessions(user?.id, exercise.id, rawHistory);
        if (cancelled) return;
      } catch (_e) { stampedHistory = rawHistory; }

      // Layoff: days since this exercise was last trained (design section
      // 10.5) - the resolver applies the >7-day 0.9 reduction itself.
      const lastTs = (rawHistory[0]?.sets || []).reduce((m, s) => Math.max(m, s.createdAt ?? s.created_at ?? 0), 0);
      const layoffDays = lastTs > 0 ? Math.floor((Date.now() - lastTs) / (24 * 60 * 60 * 1000)) : null;

      const allLoggedForExercise = workoutExercises[currentExerciseIndex]?.sets || [];
      setLoggedSets(allLoggedForExercise);

      // Warm-up sets are no longer forced on the first set of every
      // exercise. Forcing every exercise to start with a warm-up that
      // the user has to click through (or change the set type to
      // skip) is the friction the user kept hitting, they don't want
      // it. The default is now a clean working set. Users who want a
      // warm-up first tap the "Add warm-up set" button which flips
      // the current entry to warmup with sensible defaults.

      // Read the current mesocycle week for the deload state + prescription,
      // BEFORE assembling the packet: senior.isDeload/deloadTargets/
      // blockFinished are packet INPUTS (design section 14, Law F), so this
      // fetch has to land before the resolver can seed the entry.
      let localIsDeloadWeek = false;
      let localBlockFinished = false;
      let localDeloadTargets = null; // {weight, reps} pairs, the packet's shape
      let deloadRirSeed = null; // generateDeloadPrescription's own fixed RIR
      try {
        const currentWeek = await getCurrentMesocycleWeek(user?.id);
        if (currentWeek) {
          localIsDeloadWeek = !!currentWeek.isDeload;
          localBlockFinished = !!currentWeek.awaitingDecision;
          setIsDeloadWeek(localIsDeloadWeek);
          setBlockFinished(localBlockFinished);
          // C18 recovery visibility: the SAME resolved state Home renders, so
          // Train is a detail surface rather than a second opinion. It used to
          // say "Recovery week" whether the block had reached its recovery
          // week or the coach had eased off mid-block, which told a week-three
          // athlete the hard part of their block had finished.
          setRecoveryState(currentWeek.recoveryState ?? null);
          // C18: the SAME authoritative position Home and Plans read.
          try {
            // eslint-disable-next-line global-require
            const { resolveProgrammePosition } = require('../lib/programmePosition');
            const pos = await resolveProgrammePosition(user?.id).catch(() => null);
            setProgressionSessions(pos?.sessions ?? null);
            // C18: Train shows the GATED recovery state, so it cannot announce
            // a recovery week Home is correctly withholding.
            if (pos?.recoveryState) setRecoveryState(pos.recoveryState);
            setProgressionWeekId(pos?.activeWeekId ?? null);
            setProgressionBlockId(pos?.blockId ?? null);
          } catch (_) { /* progression is best-effort here */ }

          // If this is a deload week, generate deload prescription from
          // week-1 sets - now a SENIOR INPUT to the resolver
          // (packet.senior.deloadTargets, design section 14 Law F) rather
          // than a separate setTargets/currentSet write: the resolver's own
          // SENIOR_RECOVERY_HOLD branch below is what actually seeds the box.
          if (currentWeek.isDeload && currentWeek.mesocycleId && exercise?.id) {
            const week1Sets = await getWeek1SetsForExercise(currentWeek.mesocycleId, exercise.id);
            if (cancelled) return;
            if (week1Sets.length > 0) {
              // Use first-half prescription (week-1 weight, 50% reps) as default
              const deloadTargets = generateDeloadPrescription(week1Sets, true);
              if (deloadTargets.length > 0) {
                localDeloadTargets = deloadTargets.map(t => ({ weight: t.weight, reps: t.reps }));
                deloadRirSeed = deloadTargets[0]?.rir ?? null;
                // C18: describe what THIS prescription actually changed,
                // measured against the block's week-1 baseline, rather than
                // asserting a generic reduction. Today's first-half recovery
                // prescription keeps the load and halves the reps at RIR 4, so
                // claiming lighter loads would be untrue on it.
                setRecoveryDifferences(
                  describePrescriptionDifferences(week1Sets, deloadTargets),
                );
              }
            }
          }
        }
      } catch (_e) {}
      if (cancelled) return;

      // Readiness/re-entry senior context, derived FRESH from the
      // just-fetched mesocycle week (not the render-scope isDeloadWeek
      // state, which has not caught up with localIsDeloadWeek yet on the
      // very first exercise load of a session) - keeps this seed's senior
      // gate exact rather than one render stale.
      const localReEntryEaseActive = !localIsDeloadWeek && !!activeWorkout?.reEntryEaseApplied;
      const localReadinessTweak = !localIsDeloadWeek
        ? resolveSessionEasingTweak({
          intent: activeWorkout?.preWorkoutIntent ?? null,
          chips: { sleepQuality: activeWorkout?.sleepQuality, energyScore: activeWorkout?.energyScore },
          reEntryEaseActive: localReEntryEaseActive,
        })
        : null;
      const localReadinessReduces = !!localReadinessTweak?.reduces && !readinessDismissed;

      // The packet's fixed inputs for this exercise load - stored so every
      // later re-resolution (each logged set in handleCompleteSet, every
      // readiness change in the `packet` useMemo above) rebuilds from these
      // SAME raw rows purely in memory. No further DB reads until the next
      // exercise change.
      const base = {
        exercise: {
          id: exercise.id,
          exerciseType: exercise?.exerciseType || 'weight_reps',
          category: exercise?.exerciseCategory || exercise?.exercise_category || 'compound',
          incrementKg: exercise?.incrementKg ?? exercise?.increment_kg ?? null,
          // Final pass S1 (certification 2026-09-05): the bell ladder in
          // livePrescription reads this; without it a 16 kg kettlebell
          // prefilled 16.75 kg. Category first, raw string as the fallback.
          equipmentCategory: exercise?.equipmentCategory ?? exercise?.equipment_category ?? exercise?.equipment ?? null,
          units,
        },
        prescription: {
          repsMin: routineExercise?.recommendedRepsMin,
          repsMax: routineExercise?.recommendedRepsMax,
          targetSets: routineExercise?.recommendedSets ?? null,
          startingWeight: routineExercise?.startingWeight ?? null,
          goal: null,
        },
        rawHistory: stampedHistory,
        senior: {
          isDeload: localIsDeloadWeek,
          deloadTargets: localDeloadTargets,
          blockFinished: localBlockFinished,
          layoffDays,
        },
      };
      setPacketBase(base);
      setOverrideLoad(null);
      setOverrideReps(null);

      // Seed the CURRENT entry from the resolver's prescription for the next
      // position (workingLogged + 1) - replacing the best-anchor seed, the
      // zero-history seed and the ghost overlay in one call (design section
      // 2's production trace of what this replaces, at the campaign
      // baseline commit d9f8d105). today.working carries any sets already
      // logged for this exercise earlier in the session (a superset
      // jump-back), so the resolver's own current-session evidence rule
      // (Law B) already applies here, not just after the next log.
      const localPacket = assembleEvidencePacket({
        exercise: base.exercise,
        prescription: base.prescription,
        senior: {
          ...base.senior,
          readinessTweak: localReadinessTweak,
          reEntryEaseActive: localReEntryEaseActive,
          readinessReductionActive: localReadinessReduces,
        },
        rawHistory: base.rawHistory,
        rawToday: allLoggedForExercise,
        overrideLoad: null,
        overrideReps: null,
        now: Date.now(),
      });
      const seedPos = countProgressSets(allLoggedForExercise) + 1;
      // EL-10: a circuit station or ballistic exercise never receives an
      // automatic load-step suggestion (livePrescription's own TYPE GATE
      // reads this and falls back to history-only).
      const seedPrescription = resolveSetPrescription(localPacket, { index: seedPos, evidenceClass: currentEvidenceClass });
      presentedPrescriptionRef.current = { pos: seedPos, prescription: seedPrescription };
      // Founder Ruling 1 (B-plus): HIGH/MEDIUM confidence puts the
      // prescription in the REAL boxes as committed, ghost-styled values;
      // LOW confidence already falls back to the factual reference/starting
      // weight/blank inside resolveSetPrescription itself (its own `weight`
      // and `prefill` fields already encode that fallback), so no separate
      // confidence branch is needed here. C5-P14-02: the resolver's
      // FIRST_TIME_BAND reps target is band.min, so a genuinely blank-weight
      // first exposure still seeds reps at the bottom of the band.
      const seededWeight = seedPrescription.prefill ? (seedPrescription.weight ?? '') : '';
      const seededReps = seedPrescription.repsTarget != null ? seedPrescription.repsTarget : DEFAULT_SET.reps;
      const seeded = {
        weight: seededWeight,
        reps: seededReps,
        isGhost: seedPrescription.prefill && seedPrescription.weight != null,
      };
      if (localIsDeloadWeek && deloadRirSeed != null && seedPrescription.provenance === PROVENANCE.SENIOR_RECOVERY_HOLD) {
        seeded.rir = deloadRirSeed;
      }
      setCurrentSet({ ...DEFAULT_SET, ...seeded });
      seededEntryRef.current = { weight: seeded.weight, reps: seeded.reps };
      audit('workout.prescription.presented', {
        exerciseId: exercise.id,
        provenance: seedPrescription.provenance,
        confidence: seedPrescription.confidence,
        position: seedPos,
      });

      // Restore an in-progress draft (typed but not yet logged) so backgrounding
      // or a cold relaunch mid-set doesn't wipe what the user just entered. Only
      // restores when it belongs to THIS set position, so it never lands a stale
      // value on the wrong set.
      try {
        const raw = await AsyncStorage.getItem(`@volyume_setdraft_${activeWorkout.id}_${exercise.id}`);
        if (!cancelled && raw) {
          const draft = JSON.parse(raw);
          const nextCount = (workoutExercises[currentExerciseIndex]?.sets || []).filter(s => s.setType !== 'warmup').length;
          if (draft && draft.workingCount === nextCount && draft.weight !== '' && draft.weight != null) {
            setCurrentSet(cs => ({
              ...cs,
              weight: draft.weight,
              reps: draft.reps ?? cs.reps,
              rir: draft.rir ?? cs.rir,
              setType: draft.setType || cs.setType,
              // Lead fix (Stage 15 review): a draft is USER-TYPED work from a
              // previous app run, never the app's own suggestion. Clearing
              // the ghost flag here keeps the untouched-ghost re-seed effect
              // (below, near `prescriptions`) from ever overwriting a
              // restored draft with a recomputed prescription.
              isGhost: false,
            }));
          }
        }
      } catch (_) { /* draft restore is best-effort */ }
    }

    loadHistory();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercise?.id, currentExerciseIndex]);

  // Persist the in-progress set draft so leaving the app mid-set doesn't wipe
  // what was typed. iOS routinely terminates a memory-heavy app's JS process
  // while you're in another app, then remounts this screen on return (looks
  // like "I just switched apps"), the in-memory entry would otherwise be lost.
  // Keyed per workout + exercise, tagged with the working-set index so it only
  // restores onto the same set (see loadHistory). An empty weight clears it.
  const draftSaveTimer = useRef(null);
  const draftRef = useRef(null);
  useEffect(() => {
    if (!activeWorkout?.id || !exercise?.id) { draftRef.current = null; return undefined; }
    const key = `@volyume_setdraft_${activeWorkout.id}_${exercise.id}`;
    const workingCount = countProgressSets(loggedSets);
    const w = currentSet?.weight;
    const payload = (w === '' || w == null) ? null
      : { workingCount, weight: currentSet.weight, reps: currentSet.reps, rir: currentSet.rir, setType: currentSet.setType };
    draftRef.current = { key, payload }; // mirror for the immediate background flush
    if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current);
    draftSaveTimer.current = setTimeout(() => {
      if (payload) AsyncStorage.setItem(key, JSON.stringify(payload)).catch(() => {});
      else AsyncStorage.removeItem(key).catch(() => {});
    }, 250);
    return () => { if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current); };
  }, [currentSet, loggedSets, activeWorkout?.id, exercise?.id]);

  // Flush the draft the INSTANT the app backgrounds, so a quick type-then-switch
  // (faster than the debounce above) still persists before iOS may kill the JS.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if ((s === 'background' || s === 'inactive') && draftRef.current?.payload) {
        AsyncStorage.setItem(draftRef.current.key, JSON.stringify(draftRef.current.payload)).catch(() => {});
      }
    });
    return () => { try { sub?.remove(); } catch (_) {} };
  }, []);

  // COMP-001 measurement: the logged list renders above the action row now;
  // emit the count as it grows so the fold maths can be validated in
  // production (no set data, just how many rows are on screen).
  useEffect(() => {
    if (loggedSets.length > 0) {
      audit('workout.loggedsets.visible', { count: loggedSets.length });
    }
  }, [loggedSets.length]);


  async function handleCompleteSet(overrides = {}) {
    if (!exercise || !activeWorkout) return;
    // A2 (audit CL-3): logging ANOTHER set cancels any pending auto-advance.
    // Previously "Log another set" within the 1.8s window still yanked the
    // screen to the next exercise, stranding the extra set's context.
    cancelAutoAdvance();
    const validation = validateSetEntryValue({
      value: currentSet,
      exercise,
      units,
      actualRepsOverride: overrides.actualReps,
      weightAction: 'completing this set',
    });
    if (!validation.ok) {
      appAlert(validation.title, validation.message);
      return;
    }
    // Cluster sets (myo-reps / rest-pause) commit the whole cluster as one
    // row: actualReps is the summed total and notes carry the breakdown.
    // Both arrive via `overrides` from finishCluster.
    const effectiveReps = validation.actualReps;
    const effectiveWeight = validation.weight;
    const effectiveNotes = overrides.notes ?? (noteText || null);
    const isWeightReps = validation.isWeightReps;

    // Founder request (2026-07-13 Android walk): the keyboard stayed up
    // after logging until manually dismissed. Logging the set IS the end
    // of typing, so dismiss on the action rather than on a timer (a timed
    // dismissal would yank the keyboard mid-entry between weight and
    // reps). Sits AFTER validation so a rejected set keeps the keyboard
    // up for correction.
    Keyboard.dismiss();
    setSaving(true);
    // D2: warm-ups get the softer tick, working sets the standard beat.
    if ((currentSet.setType ?? 'straight') === 'warmup') hapticsVocab.warmupLogged();
    else hapticsVocab.setLogged();

    try {
      // WK-3: number sets within their own kind so working sets read 1,2,3
      // regardless of any warm-ups logged first (the old loggedSets.length+1
      // counted warm-ups, so the first working set after a warm-up was "2").
      // Warm-ups get their own 1,2 sequence; set_type distinguishes them.
      const isWarmupSet = (currentSet.setType ?? 'straight') === 'warmup';
      const setNumber = setNumberForKind(loggedSets, isWarmupSet);

      const savedSet = await createWorkoutSet({
        userId: user.id,
        workoutId: activeWorkout.id,
        exerciseId: exercise.id,
        setNumber,
        setType: currentSet.setType || 'straight',
        targetRepsMin: routineExercise?.recommendedRepsMin ?? null,
        targetRepsMax: routineExercise?.recommendedRepsMax ?? null,
        actualReps: effectiveReps,
        weight: effectiveWeight,
        rir: currentSet.rir != null ? parseInt(currentSet.rir, 10) : null,
        rpe: null,
        failed: false,
        notes: effectiveNotes,
        isAmrap: currentSet.setType === 'amrap',
        leftReps: null,
        rightReps: null,
        // EL-7 (05-DECISIONS.md): stamped from structure + exercise
        // metadata, never chosen by the user. A warm-up never participates
        // in a circuit's round-cycling, so it stays conventional even on a
        // circuit-grouped or ballistic exercise (it is excluded from
        // evidence everywhere by set_type anyway).
        evidenceClass: currentSet.setType === 'warmup' ? null : currentEvidenceClass,
      });

      const setData = {
        id: savedSet.id,
        exerciseId: exercise.id,
        workoutId: activeWorkout.id,
        setNumber,
        setType: currentSet.setType,
        actualReps: effectiveReps,
        weight: effectiveWeight,
        rir: currentSet.rir ?? null,
        rpe: null,
        leftReps: null,
        rightReps: null,
      };

      const newLoggedSets = [...loggedSets, setData];
      setLoggedSets(newLoggedSets);
      addSetToCurrentExercise(setData);
      // C5-P13-03 (D96): logging a set used to extinguish the info pulse and
      // write the once-ever seen flag, whether or not the user had ever
      // opened the menu behind it. So the ONE cue pointing at the only place
      // "set", "rep", "working set" and "warm-up" are defined was destroyed
      // by the very action it exists to explain, and never returned on any
      // exercise in any later session. The cue is now retired only by an
      // actual overflow open (the tap handler already does exactly that), so
      // it survives until it has been used once. Nothing is added to the set
      // card, and the flag stays once-ever after that first open.
      audit('workout.set.logged', {
        exerciseId: exercise.id,
        setType: setData.setType,
        isWorking: setData.setType !== 'warmup',
        setIndex: newLoggedSets.length,
      });

      // Visual ack, flash the SetEntry card border amber for ~700 ms so the
      // user sees their tap landed. Tracked timeout so back-to-back logs
      // don't truncate the previous flash mid-frame.
      if (logFlashTimeoutRef.current) clearTimeout(logFlashTimeoutRef.current);
      setLogFlash(true);
      logFlashTimeoutRef.current = setTimeout(() => setLogFlash(false), 700);

      // P9 TalkBack: the haptic and the amber flash are silent to a screen
      // reader; speak the save so a TalkBack user knows the tap landed.
      // announceForAccessibility is a no-op when no screen reader runs.
      try {
        const spokenWeight = setData.weight > 0 ? `, ${setData.weight} ${units}` : '';
        AccessibilityInfo.announceForAccessibility(
          isWarmupSet
            ? 'Warm-up set logged'
            : `Set ${setNumber} logged${spokenWeight}, ${effectiveReps} reps`,
        );
      } catch (_) { /* announcement is best-effort */ }

      // PR Detection, check BEFORE adding current set to the session ref so it
      // can never match itself.  sessionSetsRef is a plain ref so it's never stale
      // the way React state can be between renders.
      //
      // C5-P15-01 (D96): WORKING sets only, both sides of the comparison.
      // The honest-first-lift guard below keys on prHistory being empty, and
      // warm-ups used to enter that history from both sources (the session
      // ref appended unconditionally, and getAllCompletedSetsForExercise has
      // no set_type filter). So a user who logged a 20kg warm-up spent the
      // quiet "logged as your starting point" acknowledgement on it, and
      // their first working set ever was then celebrated with the full gold
      // "New estimated max lift" for beating their own warm-up, and reached
      // the summary as "1 new PR". A warm-up is by definition not a record
      // attempt (buildRecordLine already returns null for one). detectPR's
      // maths and Campaign 2's PR definition are untouched: this changes
      // only which sets are eligible to be, or to be beaten by, a record.
      // If the exercise's history has not landed yet, read it now rather
      // than judging the set against an empty list. priorUnknown stays true
      // only when that read also fails, and then the set is left alone: no
      // record claimed, and no first-lift claim either, because both would
      // be assertions we cannot support.
      let priorSets = allTimeSets;
      let priorUnknown = false;
      if (!historyLoadedRef.current) {
        try {
          priorSets = await getAllCompletedSetsForExercise(exercise.id, activeWorkout.id);
        } catch (_e) {
          priorSets = [];
          priorUnknown = true;
        }
      }
      // Founder ruling 2026-08-23, correcting BOTH the 2026-08-22 ruling and
      // FQ-7 before it: "Today's sets should be in comparison", and "if I PR
      // again a second time beating the first PR, it does not pop up".
      //
      // The bar is the best set Volyume has on record for this exercise,
      // today's earlier sets included, and it moves during the session. Beat
      // it and it is a record; beat the new one later and that is a record
      // too. Two rules had been standing between the user and that:
      //
      //  - FQ-7 required a set from a PREVIOUS session before anything could
      //    be a record, so on an exercise met for the first time set one got
      //    the honest starting-point line and every later set was silent,
      //    however far it climbed. That is the reported session: 80x15,
      //    80x15, then 100x15, and nothing for the 100.
      //  - The 2026-08-22 ruling then took today's sets OUT of the
      //    comparison, which was a misreading of the same report.
      //
      // Both are gone. The comparison is simply everything on record: past
      // sessions plus today's earlier working sets for this exercise. The
      // only set that cannot be a record is the one with nothing to compare
      // to, which still gets the honest acknowledgement below rather than a
      // record claim. detectPR's maths and the three record types are
      // untouched.
      // Today's earlier sets come from loggedSets, which loadHistory
      // rehydrates from the store (workoutExercises[i].sets) on every mount.
      // sessionSetsRef is a plain ref and starts empty again after the user
      // steps out of the logger and back in, which would silently drop
      // today's sets out of the comparison - the exact thing the ruling
      // above says must never happen.
      const prHistory = [
        ...priorSets.filter(isWorkingSetRow),
        ...loggedSets.filter(isWorkingSetRow),
      ];
      sessionSetsRef.current = [...sessionSetsRef.current, setData];
      // PR detection runs ONLY for weight-based schemas. duration/distance
      // reuse the weight field for time/distance, so running the weight x reps
      // 1RM/heaviest detector over them would report meaningless "PRs".
      // A warm-up never runs it at all (C5-P15-01).
      const prs = isWeightReps && !isWarmupSet && prHistory.length > 0 && !priorUnknown
        ? detectPR(setData, prHistory, exercise, units) : [];
      if (isWeightReps && !isWarmupSet && !priorUnknown && prHistory.length === 0) {
        // Wave A A1: the first working set on record beats nothing, so
        // "PERSONAL RECORD" would be a false claim in the very session that
        // builds trust. Acknowledge it honestly and quietly instead
        // (PRCelebration renders its calm first-lift toast), and it never
        // joins the session's PR list. From set two onwards there is a bar,
        // so from set two onwards a record is possible.
        showPRCelebration({
          type: 'first_lift',
          weight: setData.weight,
          reps: setData.actualReps,
          value: setData.weight,
          previousValue: null,
          label: `${setData.weight}${units} x ${setData.actualReps} logged as your starting point`,
          exerciseName: exercise.name,
        });
      } else if (prs.length > 0) {
        showPRCelebration({ ...prs[0], exerciseName: exercise.name });
        // Keep one PR per exercise (the most significant), so a multi-set,
        // multi-exercise session reports a handful of PRs, not dozens. The
        // per-set celebration above still fires each time a new best lands.
        // L07-F2: setId tags which logged set earned this PR, so an edit or
        // delete of that exact set (below, handleSaveEditedSet /
        // handleDeleteEditedSet) can correct a now-stale badge without
        // touching detectPR itself.
        setDetectedPRs(prev => bestPRPerExercise([
          ...prev,
          ...prs.map(p => ({ ...p, exerciseId: exercise.id, exerciseName: exercise.name, units, setId: setData.id })),
        ]));
      }

      // Campaign 20 Phase 2, Stage 4/5 (design section 9.3/9.4/12): live
      // re-resolution replaces the unconditional carry-forward. Pure, in
      // memory - the SAME raw history from packetBase, with the just-logged
      // set appended to today's evidence. In the common case (no adjustment
      // fires) the resolver's own output equals what was just lifted, so the
      // felt behaviour IS carry-forward; it only differs where the resolver
      // has a genuine reason (back-off position, fatigue adjust, overshoot
      // add, senior recovery), and the provenance line then explains why.
      if (currentSet.setType !== 'warmup') {
        // The ordinal position the just-logged set occupies among eligible
        // working rows (design section 15's NEVER_ELIGIBLE_TYPES) - matches
        // `presented.pos` exactly whenever the just-logged set is the
        // position the resolver actually prescribed for.
        const seedPosForCompletedSet = countProgressSets(newLoggedSets);
        // Law G: a logged weight/reps that differs from what was PRESENTED
        // for this exact set counts as a deliberate choice for the rest of
        // this exercise today - including a tap on the history reference
        // row's "Use" (it silently overwrote the box before this log, so
        // the comparison below is naturally against the ORIGINAL
        // prescription, not the row the user chose).
        const presented = presentedPrescriptionRef.current;
        let nextOverrideLoad = overrideLoad;
        let nextOverrideReps = overrideReps;
        if (presented && presented.pos === seedPosForCompletedSet && presented.prescription) {
          const overrideOpts = {
            incrementKg: exercise?.incrementKg ?? exercise?.increment_kg ?? null,
            units,
            category: exercise?.exerciseCategory || exercise?.exercise_category || 'compound',
          };
          const loadOv = detectLoadOverride(setData.weight, presented.prescription.weight, overrideOpts);
          const repsOv = detectRepsOverride(setData.actualReps, presented.prescription.repsTarget);
          if (loadOv != null) {
            nextOverrideLoad = loadOv;
            setOverrideLoad(loadOv);
            audit('workout.prescription.overridden', {
              exerciseId: exercise.id,
              direction: (presented.prescription.weight != null && loadOv < presented.prescription.weight) ? 'down' : 'up',
            });
          }
          if (repsOv != null) {
            nextOverrideReps = repsOv;
            setOverrideReps(repsOv);
          }
        }

        if (packetBase) {
          const nextPacket = assembleEvidencePacket({
            exercise: packetBase.exercise,
            prescription: packetBase.prescription,
            senior: {
              isDeload: packetBase.senior.isDeload,
              deloadTargets: packetBase.senior.deloadTargets,
              blockFinished: packetBase.senior.blockFinished,
              layoffDays: packetBase.senior.layoffDays,
              readinessTweak,
              reEntryEaseActive,
              readinessReductionActive: readinessReduces && !readinessDismissed,
            },
            rawHistory: packetBase.rawHistory,
            rawToday: newLoggedSets,
            overrideLoad: nextOverrideLoad,
            overrideReps: nextOverrideReps,
            now: Date.now(),
          });
          const nextPos = countProgressSets(newLoggedSets) + 1;
          // EL-10: see the seedPrescription comment above - no automatic
          // load step for a circuit station or ballistic exercise.
          const nextPrescription = resolveSetPrescription(nextPacket, { index: nextPos, evidenceClass: currentEvidenceClass });
          presentedPrescriptionRef.current = { pos: nextPos, prescription: nextPrescription };
          audit('workout.prescription.presented', {
            exerciseId: exercise.id,
            provenance: nextPrescription.provenance,
            confidence: nextPrescription.confidence,
            position: nextPos,
          });
          if (nextPrescription.prefill) {
            const w = nextPrescription.weight != null ? nextPrescription.weight : setData.weight;
            const r = nextPrescription.repsTarget != null ? nextPrescription.repsTarget : setData.actualReps;
            setCurrentSet(cs => ({ ...cs, weight: w, reps: r, isGhost: nextPrescription.weight != null }));
            seededEntryRef.current = { weight: w, reps: r };
          } else {
            // Same fallback the old unconditional carry-forward always used.
            setCurrentSet(cs => ({ ...cs, weight: setData.weight, reps: setData.actualReps }));
            seededEntryRef.current = { weight: setData.weight, reps: setData.actualReps };
          }
        } else {
          // Defensive: packetBase should always be set by the time a set is
          // logged (loadHistory sets it before the CTA is even enabled), but
          // never leave the entry unseeded if it somehow isn't.
          setCurrentSet(cs => ({ ...cs, weight: setData.weight, reps: setData.actualReps }));
          // C5-P13-02: the carry-forward is the app seeding the next set, not
          // unsaved work. This is the state that made the finish confirm
          // claim an unlogged set for the whole rest of every session.
          seededEntryRef.current = { weight: setData.weight, reps: setData.actualReps };
        }
      }

      // Update last activity timestamp
      updateLastActivity();

      // Superset auto-jump: if this exercise is paired with another, jump to the
      // pair WITHOUT starting the rest timer. The rest happens after BOTH halves
      // of the pair are logged. Warmups are per-exercise so they don't trigger
      // the jump. `finally` below clears `saving`.
      //
      // K-1 fix (content-quality audit SF-1): jump only to a LATER partner (the
      // first half of a round). When we have just logged the LATER half, no
      // later partner exists, so we fall through to startRestTimer below and the
      // ~60-120s post-pair rest finally fires before the next round begins on the
      // first exercise. The old `i !== currentExerciseIndex` matched in BOTH
      // directions, so B jumped straight back to A and the rest timer never ran.
      let sgi = null;
      let pairIdx = -1;
      if (currentSet.setType !== 'warmup') {
        sgi = workoutExercises[currentExerciseIndex]?.supersetGroupId;
        pairIdx = sgi != null
          ? workoutExercises.findIndex((e, i) => i > currentExerciseIndex && e.supersetGroupId === sgi)
          : -1;
        if (pairIdx >= 0) {
          setCurrentExerciseIndex(pairIdx);
          setTimeout(() => scrollRef.current?.scrollTo({ y: 0, animated: true }), 50);
          setNoteText('');
          setGhostSet(null);
          // D44: cue the jump - previously silent (no haptic distinct from
          // setLogged, no announcement, no visible sign).
          announceGroupFocusChange(pairIdx, sgi);
          return;
        }
      }

      // Start rest timer with per-exercise duration, falling back to the user's
      // global default rest (Hevy teardown R1). Honour the auto-start pref: when
      // off, logging a set no longer kicks off the countdown automatically.
      // D9 amendment 2: a per-side (unilateral) COMPOUND set halves this
      // rest too (finishPerSide already halved the between-sides pause);
      // isolation gets the ordinary full rest here, its rest-class
      // difference is only the between-sides "switch sides" prompt.
      if (autoStartRestTimer) {
        // EL-9 (05-DECISIONS.md): a circuit's own rest_seconds is always 0
        // (the builder sets it - transition between stations). Reaching
        // here at all means this WAS the last station in the round (an
        // earlier station returns before this point), so the rest that
        // fires is the group's round_rest_seconds, not the per-exercise
        // rest_seconds or the global default.
        const fullRest = isCircuitGroup
          ? (routineExercise?.roundRestSeconds || defaultRestSeconds || 90)
          : (routineExercise?.restSeconds || defaultRestSeconds || 90);
        startRestTimer(overrides.perSideCompound ? halfRestSeconds(fullRest) : fullRest);
      }

      // Auto-advance to next exercise when target sets just completed
      const newWorkingCount = countProgressSets(newLoggedSets);
      const justHitTarget = targetSets && newWorkingCount >= targetSets && workingLogged < targetSets;
      // L1 (D43 S3 review): arm extraSetArmed HERE, in the success path, when a
      // working set is logged with the target ALREADY met -- the "extra set"
      // case. This used to fire on the tap in handleCompleteSetPress, before
      // validation, so an invalid/aborted past-target tap flipped the mode and
      // hid the advance CTA (Next exercise / Finish) until the next successful
      // log. Arming only after a real log fixes that. This sits after the
      // superset forward-jump return above, so it arms only when we stay on the
      // exercise (a jump changes currentExerciseIndex, which resets this flag
      // anyway) -- exactly when the advance CTA is showing.
      if (currentSet.setType !== 'warmup' && targetSets && workingLogged >= targetSets && !extraSetArmed) {
        setExtraSetArmed(true);
      }
      if (justHitTarget && !isLastExercise) {
        if (autoAdvanceRef.current) clearTimeout(autoAdvanceRef.current);
        autoAdvanceRef.current = setTimeout(() => {
          handleNextExercise();
        }, 1800);
        // C3 (re-anchored, logger redesign phase 2): the countdown's visual
        // is now the primary CTA's own progress track (WorkoutBottomBar),
        // never a separate floating row. autoAdvanceArmed drives that track
        // for exactly as long as the countdown runs; announce the arm ONCE
        // for screen readers (the track itself is decorative).
        setAutoAdvanceArmed(true);
        try {
          AccessibilityInfo.announceForAccessibility('Next exercise in a moment');
        } catch (_) { /* announcement is best-effort */ }
      } else if (sgi != null && pairIdx < 0) {
        // D44 round-return: this set was the LAST member of its group (no
        // member with a later index shares supersetGroupId, so the forward
        // jump above found nothing and fell through here - the K-1 rest
        // timer just started, unchanged). Nothing used to move focus back to
        // the group's first member for the next round, despite
        // ActiveWorkoutScreen.giantSet.guard.test.js's own comment asserting
        // "next round from A"; the user was silently stranded on the last
        // member. The justHitTarget branch above still wins when this
        // exercise's own set target completed on this same set - the
        // ordinary next-exercise auto-advance is correct once the whole
        // group's prescribed work here is done, so round-return only fires
        // when the round continues.
        const firstIdx = workoutExercises.findIndex(e => e.supersetGroupId === sgi);
        if (firstIdx >= 0 && firstIdx !== currentExerciseIndex) {
          setCurrentExerciseIndex(firstIdx);
          setTimeout(() => scrollRef.current?.scrollTo({ y: 0, animated: true }), 50);
          announceGroupFocusChange(firstIdx, sgi);
        }
      }

      // Clear ghost, will be re-computed for the next set index on the next render cycle
      setGhostSet(null);

      // Prepare next set
      setNoteText('');
      // If warmup was just completed, mark hint seen and auto-switch to
      // working set. Campaign 20 Phase 2: seeds from the resolver's first
      // working-position prescription instead of getBestAnchorSet/
      // prefillRepsForTarget (design section 19) - `packet` already carries
      // today's readiness/senior context reactively (see the useMemo above).
      if (currentSet.setType === 'warmup') {
        warmupHintSeenRef.current = true;
        // EL-10: see the seedPrescription comment above.
        const firstPrescription = packet ? resolveSetPrescription(packet, { index: 1, setType: 'straight', evidenceClass: currentEvidenceClass }) : null;
        if (firstPrescription) {
          presentedPrescriptionRef.current = { pos: 1, prescription: firstPrescription };
        }
        if (firstPrescription && firstPrescription.prefill) {
          const w = firstPrescription.weight != null ? firstPrescription.weight : '';
          const r = firstPrescription.repsTarget != null ? firstPrescription.repsTarget : (routineExercise?.recommendedRepsMin || 8);
          setCurrentSet(cs => ({
            ...cs,
            setType: 'straight',
            weight: w,
            reps: r,
            isGhost: firstPrescription.weight != null,
          }));
          // C5-P13-02: the auto-switch to the first working set is a seed.
          seededEntryRef.current = { weight: w, reps: r };
        } else {
          setCurrentSet(cs => {
            const next = {
              ...cs,
              setType: 'straight',
              reps: firstPrescription?.repsTarget ?? (routineExercise?.recommendedRepsMin || 8),
            };
            // Idempotent: the entry is being seeded for the first working
            // set, carrying whatever weight the warm-up left in it.
            seededEntryRef.current = { weight: next.weight, reps: next.reps };
            return next;
          });
        }
      }
    } catch (e) {
      logError('ActiveWorkoutScreen.handleCompleteSet', e, {
        userId: user?.id,
        workoutId: activeWorkout?.id,
        exerciseId: exercise?.id,
        setType: currentSet.setType,
      });
      const retryAction = currentSet.setType === 'warmup'
        ? 'Log warm-up'
        : isClusterType(currentSet.setType)
          ? 'Start cluster'
          : 'Log set';
      appAlert(
        'Couldn\'t save set',
        `Your set wasn't saved. Tap ${retryAction} to try again. If it keeps happening, please contact support.`,
      );
    } finally {
      setSaving(false);
    }
  }

  // ─── Edit / delete an already-logged set (Hevy parity) ──────────────
  // Tapping a row in the "This workout" receipt opens a sheet pre-filled with
  // the set's values via the same SetEntry component used to log it, so every
  // exercise type gets the correct inputs for free. Save writes the local row,
  // the store's current-exercise sets array, and the on-screen receipt; the
  // cloud copy ships on the next per-set push (updated_at is bumped by
  // updateWorkoutSet). PR detection IS re-run on an edit/delete (L07-F2, in
  // handleSaveEditedSet / handleDeleteEditedSet below) so an edited-up set can
  // still earn its celebration and an edited-down one clears a now-stale badge;
  // derived analytics recompute from the DB on next view.

  // F7 (audit UI): stable identity so the memoised LoggedSetRow actually
  // skips on the per-second timer tick, the previous inline `() =>
  // openEditSet(s)` closure was a fresh prop every render, defeating the memo.
  const openEditSet = React.useCallback((set) => {
    // D43 S4: only one row edits at a time -- this state is a single
    // editingSet/editValue pair (not a map keyed by set id), so opening a
    // second row's editor always replaces (collapses) whichever one was
    // open, by construction. No extra "close the other one" branch needed.
    setEditingSet(set);
    setEditValue({
      weight: set.weight,
      reps: set.actualReps ?? set.reps,
      setType: set.setType,
      isGhost: false,
    });
  }, []);

  // D43 S4: Cancel on the inline editor closes the same way the modal's
  // Cancel/backdrop-dismiss did.
  const closeEditSet = React.useCallback(() => {
    setEditingSet(null);
    setEditValue(null);
  }, []);

  // Campaign item 14 (D25): the zeego long-press menu's "Delete set" item
  // reuses this SAME confirm-then-remove flow, not a new one. handleDeleteEditedSet
  // is pinned zero-arg (ActiveWorkoutScreen.prReEval.guard.test.js), and it
  // reads `editingSet` by closure, so it cannot take a target set directly.
  // openDeleteFromMenu opens the edit sheet's state exactly like a row tap
  // (openEditSet) and records which set id it was for; the effect below
  // fires the real, unmodified handleDeleteEditedSet() once editingSet
  // reflects that id, so the user sees the existing "Delete set?" confirm —
  // no new deletion path, no bypassed confirmation.
  const menuDeleteTargetIdRef = useRef(null);
  const openDeleteFromMenu = React.useCallback((set) => {
    menuDeleteTargetIdRef.current = set.id;
    openEditSet(set);
  }, [openEditSet]);
  useEffect(() => {
    if (menuDeleteTargetIdRef.current != null && editingSet && editingSet.id === menuDeleteTargetIdRef.current) {
      menuDeleteTargetIdRef.current = null;
      handleDeleteEditedSet();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingSet]);

  async function handleSaveEditedSet() {
    if (saving || !editingSet || !editValue) return;
    const validation = validateSetEntryValue({
      value: editValue,
      exercise,
      units,
      weightAction: 'saving this set',
    });
    if (!validation.ok) {
      appAlert(validation.title, validation.message);
      return;
    }
    // For timed/distance the value columns are weight=distance/0 and
    // actualReps=seconds; SetEntry already stores those numbers, so parse
    // exactly as the log path does (parseFloat(weight) || 0, parseInt(reps)).
    const { actualReps, weight } = validation;

    setSaving(true);
    try {
      await updateWorkoutSet(editingSet.id, { weight, actualReps });
      updateSetInCurrentExercise(editingSet.id, { weight, actualReps });
      setLoggedSets(prev => prev.map(s => (s.id === editingSet.id ? { ...s, weight, actualReps } : s)));

      // L07-F2: re-run PR detection so an edited-up set can still trigger the
      // celebration, and an edited-DOWN set clears its own now-stale badge.
      // Mirrors the log-time detection above (handleCompleteSet) exactly:
      // history excludes this set's own (pre-edit) sessionSetsRef entry so it
      // can never match itself, detectPR itself is untouched.
      sessionSetsRef.current = sessionSetsRef.current.map(s => (
        s.id === editingSet.id ? { ...s, weight, actualReps } : s
      ));
      if (validation.isWeightReps) {
        // C5-P15-01 (D96): the same working-sets-only history as the
        // log-time detection, so an edited set can never be celebrated for
        // beating a warm-up either.
        // Founder ruling 2026-08-23: the same bar as the log path - past
        // sessions PLUS today's earlier sets for this exercise - so an
        // edited-up set is judged exactly as it would have been had it been
        // logged that way first time. Its own pre-edit entry is excluded by
        // id so it can never beat itself.
        const editPrHistory = [
          ...allTimeSets.filter(isWorkingSetRow),
          ...loggedSets.filter(s => s.id !== editingSet.id && isWorkingSetRow(s)),
        ];
        const editedPrs = editPrHistory.length > 0
          ? detectPR({ weight, actualReps }, editPrHistory, exercise, units) : [];
        if (editedPrs.length > 0 && editPrHistory.length > 0) {
          showPRCelebration({ ...editedPrs[0], exerciseName: exercise.name });
        }
        setDetectedPRs(prev => {
          const withoutThisSet = prev.filter(p => p.setId !== editingSet.id);
          if (editedPrs.length === 0 || editPrHistory.length === 0) return withoutThisSet;
          return bestPRPerExercise([
            ...withoutThisSet,
            ...editedPrs.map(p => ({ ...p, exerciseId: exercise.id, exerciseName: exercise.name, units, setId: editingSet.id })),
          ]);
        });
      }

      setEditingSet(null);
      setEditValue(null);
      updateLastActivity();
      // Visual + tactile ack consistent with the log-set flash.
      hapticsVocab.setLogged();
      if (logFlashTimeoutRef.current) clearTimeout(logFlashTimeoutRef.current);
      setLogFlash(true);
      logFlashTimeoutRef.current = setTimeout(() => setLogFlash(false), 700);
      // P9 TalkBack: spoken counterpart of the ack above.
      try { AccessibilityInfo.announceForAccessibility('Set updated'); } catch (_) {}
    } catch (e) {
      logError('ActiveWorkoutScreen.handleSaveEditedSet', e, {
        userId: user?.id,
        workoutId: activeWorkout?.id,
        setId: editingSet?.id,
      });
      appAlert(
        'Couldn\'t save changes',
        'Your edit was not saved. Tap Save to retry. If this keeps happening, tell us from Settings > Help.',
      );
    } finally {
      setSaving(false);
    }
  }

  function handleDeleteEditedSet() {
    if (!editingSet) return;
    appAlert(
      'Delete set?',
      'This set is removed and your session totals update. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const target = editingSet;
            try {
              const ok = await deleteWorkoutSet(user.id, target.id);
              if (!ok) {
                appAlert('Couldn\'t delete set', 'That set couldn\'t be removed. Please try again.');
                return;
              }
              // Pair the cloud delete exactly like WorkoutHistoryScreen: remove
              // the cloud row, queueing a retry op on failure so a restore
              // cannot resurrect it.
              const supabaseUserId = session?.user?.id;
              if (supabaseUserId) {
                // eslint-disable-next-line global-require
                const { deleteWorkoutSetFromCloud } = require('../lib/sync');
                deleteWorkoutSetFromCloud(supabaseUserId, target.id)
                  .then((cloudOk) => { if (!cloudOk) return enqueueSyncOp('workout_set_delete', target.id, supabaseUserId); })
                  .catch(() => enqueueSyncOp('workout_set_delete', target.id, supabaseUserId));
              }
              removeSetFromCurrentExercise(target.id);
              setLoggedSets(prev => prev.filter(s => s.id !== target.id));
              // L07-F2: drop this set from the session PR-detection ref so a
              // later set in the same exercise never compares against a
              // deleted set, and clear any PR badge this exact set earned so
              // it doesn't linger stale for the rest of the session (derived
              // analytics elsewhere recompute correctly from the DB anyway).
              sessionSetsRef.current = sessionSetsRef.current.filter(s => s.id !== target.id);
              setDetectedPRs(prev => prev.filter(p => p.setId !== target.id));
              setEditingSet(null);
              setEditValue(null);
              updateLastActivity();
            } catch (e) {
              logError('ActiveWorkoutScreen.handleDeleteEditedSet', e, {
                userId: user?.id,
                workoutId: activeWorkout?.id,
                setId: target?.id,
              });
              appAlert('Couldn\'t delete set', 'That set couldn\'t be removed. Please try again.');
            }
          },
        },
      ],
    );
  }

  // ─── Cluster sets (myo-reps / rest-pause) ───────────────────────────
  // The activation effort + each mini-set accumulate locally; the whole
  // cluster commits as one workout_sets row on finish (summed reps +
  // breakdown note). See lib/clusterSet.js.

  function startCluster() {
    const activationReps = parseInt(currentSet.reps, 10);
    if (!Number.isFinite(activationReps) || activationReps < 1) {
      appAlert('Enter reps', 'Enter your activation set reps first.');
      return;
    }
    const isBodyweight = /body\s*weight/i.test(exercise?.equipment || '');
    const weightNum = parseDecimalInput(currentSet.weight);
    if (!isBodyweight && (currentSet.weight === '' || currentSet.weight == null || isNaN(weightNum) || weightNum <= 0)) {
      appAlert('Enter weight', `Enter the weight used (in ${units}) before starting the cluster.`);
      return;
    }
    setCluster({
      setType: currentSet.setType,
      weight: currentSet.weight,
      reps: [activationReps],
    });
    setClusterReps('');
    hapticsVocab.setLogged();
    // Short intra-cluster rest hint (rest-pause is 10 to 20s).
    startRestTimer(20);
  }

  // Keyboard-completes-the-set (ULTIMATE-WR-1): the reps field's Done key and
  // the Complete-set button share ONE guarded completion, so cluster set-types
  // still start a cluster, a per-side (D9) exercise starts the two-phase
  // per-side flow, and everything else calls handleCompleteSet() directly.
  // Respects the same `saving` guard the button's disabled state enforces, so a
  // double Done cannot double-log. Per-side takes the same precedence over
  // cluster the old minimal design already gave it (an exercise is one or the
  // other, never both); its own second-phase input (below) drives
  // finishPerSide directly, never this shared button, so a truthy `perSide`
  // here is a no-op rather than mis-committing the in-progress pair.
  function handleCompleteSetPress() {
    if (saving) return;
    // R4 (D64): mid-pair, the permanent primary IS the side-two commit -
    // "Log other side" relabels the same button in the same position, so a
    // per-side set is exactly two taps on one stable control, no separate
    // confirm step and no sheet.
    if (perSide) return finishPerSide();
    // D43 S3: the bottom bar's logging primary is now permanent (blueprint
    // 3.7), so there is no separate "Log another set" tap to arm the extra
    // set first -- tapping the ever-present primary past target logs another
    // set. extraSetArmed is armed inside handleCompleteSet's SUCCESS path
    // (L1 review fix), NOT here on the tap, so an invalid or aborted tap past
    // target no longer flips the mode and hides the advance CTA.
    const uni = exercise ? unilateralExercises.has(exercise.id) : false;
    if (uni) return startPerSide();
    if (isClusterType(currentSet.setType)) return startCluster();
    return handleCompleteSet();
  }
  // Keep the ref pointed at the latest closure so the rest-notification
  // "Log set" action listener (installed once) always calls current state.
  handleCompleteSetPressRef.current = handleCompleteSetPress;
  // Mirror the current set's ghost flag for that same listener's guard.
  currentSetGhostRef.current = !!currentSet?.isGhost;

  function addMiniSet() {
    const n = parseInt(clusterReps, 10);
    if (!Number.isFinite(n) || n <= 0) {
      appAlert('Enter reps', 'Enter the mini-set reps.');
      return;
    }
    setCluster((c) => (c ? { ...c, reps: [...c.reps, n] } : c));
    setClusterReps('');
    hapticsVocab.setLogged();
    startRestTimer(20);
  }

  async function finishCluster() {
    if (!cluster) return;
    const summary = summariseCluster(cluster.setType, cluster.reps);
    if (!summary) { setCluster(null); setClusterReps(''); return; }
    const notes = mergeClusterNote(noteText, summary.notes);
    await handleCompleteSet({ actualReps: summary.totalReps, notes });
    setCluster(null);
    setClusterReps('');
  }

  function cancelCluster() {
    setCluster(null);
    setClusterReps('');
  }

  // ─── Per-side (unilateral) sets, D-founder reversal ──────────────────
  // Sequential unilateral logging (all reps on one side, then the other -
  // not "alternating", which would mean swapping sides every rep): both
  // sides share the SAME prescribed reps, taken once from the set entry's
  // own reps field before starting. This flow only GUIDES the user through
  // completing them - side one, a rest-class-governed pause (lib/
  // unilateral.js perSideRestPlan, unchanged D9 amendment 2 behaviour),
  // side two - there is no second number to type. The pair still commits
  // as ONE workout_sets row via the normal handleCompleteSet path
  // (finishPerSide below), same one-row storage invariant as before. No
  // schema change: left_reps/right_reps (migration 054, legacy) stay
  // untouched and unwritten for every newly logged set; formatPerSide
  // (lib/unilateral.js) remains the READ path for older sets logged under
  // the original divergent-count design, so historic rows still display.

  async function handleUnilateralAnswer(exerciseId, turnOn) {
    try {
      const [onSet, askedSet] = await Promise.all([
        setUnilateralExercise(exerciseId, turnOn),
        markUnilateralAsked(exerciseId),
      ]);
      setUnilateralExercises(onSet);
      setUnilateralAsked(askedSet);
    } catch (e) {
      logError('ActiveWorkoutScreen.handleUnilateralAnswer', e, { exerciseId });
    }
  }

  // Opens the guided sheet at "side one". reps is the ONE prescribed count
  // used for both sides - never re-asked once side one starts.
  function startPerSide() {
    const reps = parseInt(currentSet.reps, 10);
    if (!Number.isFinite(reps) || reps < 1) {
      appAlert('Enter reps', 'Enter the reps to do on each side.');
      return;
    }
    const isBodyweight = /body\s*weight/i.test(exercise?.equipment || '');
    const weightNum = parseDecimalInput(currentSet.weight);
    if (!isBodyweight && (currentSet.weight === '' || currentSet.weight == null || isNaN(weightNum) || weightNum <= 0)) {
      appAlert('Enter weight', `Enter the weight used (in ${units}) before starting your first side.`);
      return;
    }
    // R4 (D64): pressing "Log set" IS side one's confirmation - the user
    // taps it when the first side is done, exactly like any other set.
    // Capture the pair immediately in the side-two phase and start the
    // rest-class-governed between-sides pause (D9 amendment 2, unchanged:
    // compound gets a real half-rest timer; isolation gets no timer, the
    // inline banner shows a plain "switch sides" prompt instead).
    setPerSide({
      setType: currentSet.setType,
      weight: currentSet.weight,
      reps,
      phase: 'side2',
    });
    hapticsVocab.setLogged();
    const restPlan = perSideRestPlan(exercise?.compoundIsolation, routineExercise?.restSeconds || defaultRestSeconds || 90);
    if (restPlan.betweenSeconds != null) startRestTimer(restPlan.betweenSeconds);
  }

  // "Side two done": commits the pair as ONE workout_sets row, using the
  // SAME reps prescribed at the start for both sides - never a lower/higher
  // comparison, there is only ever one number.
  async function finishPerSide() {
    if (!perSide) return;
    // perSideCompound tells handleCompleteSet's post-set rest (below) to
    // halve the normal rest too (D9 amendment 2: compound halves EVERY
    // pause, between sides AND after the second side); isolation gets the
    // ordinary full rest there, its rest-class difference is only the
    // between-sides "switch sides" prompt handled in advancePerSideToSideTwo
    // above.
    await handleCompleteSet({
      actualReps: perSide.reps,
      perSideCompound: exercise?.compoundIsolation === 'compound',
    });
    setPerSide(null);
  }

  function cancelPerSide() {
    setPerSide(null);
  }

  function handleRevertTimeCrunch() {
    if (!preCrunchSnapshot) return;
    store.setWorkoutExercises(preCrunchSnapshot);
    setTimeCrunchActive(false);
    setStarterActive(false);
    setTimeCrunchMsg('');
    setPreCrunchSnapshot(null);
    hapticsVocab.commit();
  }

  // COMP-013: build the 15-minute starter, a true subset of Day 1. Reuses the
  // shared applyTimeCrunch with starter options (first 4 exercises, 2 sets
  // each), then maps the result back onto the session: trimmed exercises are
  // marked _timeCrunchSkipped, kept exercises keep their lifts/targets but have
  // their working-set target capped and rest cut. Revert restores Day 1 in full.
  function applyStarterSession() {
    const all = workoutExercises;
    if (!all.length) return;
    setPreCrunchSnapshot([...all]);

    const MAX_EX = 4;
    const MAX_SETS = 2;
    const asExercises = all.map(e => ({
      exerciseName:      e.exercise?.name ?? '',
      sets:              e.routineExercise?.recommendedSets ?? e.exercise?.recommendedSets ?? 3,
      restSec:           e.exercise?.restSec ?? 90,
      compoundIsolation: e.exercise?.compoundIsolation ?? 'isolation',
    }));
    const estimate = (exs) => exs.reduce((t, ex) => t + (ex.sets * ((ex.restSec ?? 60) / 60 + 0.75)), 0);
    const { exercises: trimmed } = applyTimeCrunch(
      asExercises, 15, estimate, { maxExercises: MAX_EX, maxSetsPerExercise: MAX_SETS },
    );

    // applyTimeCrunch's starter trim returns the first N entries in plan order,
    // so the first `keepCount` store entries are kept and the rest skipped. Map
    // by INDEX, not exercise name, duplicate or unnamed exercises can't collide.
    const keepCount = trimmed.length;
    store.setWorkoutExercises(prev => prev.map((entry, i) => {
      if (i >= keepCount) return { ...entry, _timeCrunchSkipped: true };
      return {
        ...entry,
        routineExercise: {
          ...entry.routineExercise,
          recommendedSets: Math.min(
            entry.routineExercise?.recommendedSets ?? entry.exercise?.recommendedSets ?? MAX_SETS,
            MAX_SETS,
          ),
        },
        exercise: entry.exercise ? {
          ...entry.exercise,
          restSec: Math.round((entry.exercise.restSec ?? 90) * 0.70),
        } : entry.exercise,
      };
    }));

    setTimeCrunchMsg(getStarterSessionMessage(route?.params?.starterRoutineName, keepCount, MAX_SETS));
    setTimeCrunchActive(true);
    setStarterActive(true);
  }

  // Apply the starter trim exactly once, when the session opens with the param.
  // Consume the param afterwards so a reused screen instance can never re-apply
  // it to a later (full) session via React Navigation's param merging.
  useEffect(() => {
    if (starterAppliedRef.current) return;
    if (!route?.params?.starterSession) return;
    if (!workoutExercises.length) return;
    starterAppliedRef.current = true;
    applyStarterSession();
    navigation.setParams({ starterSession: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route?.params?.starterSession, workoutExercises.length]);

  function handleTimeCrunch() {
    if (timeCrunchActive) return;
    setPreCrunchSnapshot([...workoutExercises]);
    const remainingExercises = workoutExercises.slice(currentExerciseIndex);
    if (!remainingExercises.length) return;

    // Build exercise list in planEngine format for estimator
    const asExercises = remainingExercises.map(e => ({
      exerciseName:       e.exercise?.name ?? '',
      sets:               Math.max(1, (e.exercise?.recommendedSets ?? 3) - (e.sets?.length ?? 0)),
      restSec:            e.exercise?.restSec ?? 90,
      compoundIsolation:  e.exercise?.compoundIsolation ?? 'isolation',
    }));

    // Target: fit remaining in half of a standard session (~25 min max)
    const targetMins = 25;
    const { exercises: trimmed, restReduction, dropped } = applyTimeCrunch(
      asExercises,
      targetMins,
      (exs) => exs.reduce((t, ex) => t + (ex.sets * (ex.restSec / 60 + 0.75)), 0)
    );

    const newEstimate = Math.round(trimmed.reduce((t, ex) => t + (ex.sets * ((ex.restSec ?? 60) / 60 + 0.75)), 0));
    const msg = getTimeCrunchMessage(dropped, restReduction, newEstimate);

    // Apply reduced rest to current session's pending exercises
    const droppedNames = new Set(dropped);

    if (store.setWorkoutExercises) {
      store.setWorkoutExercises(prev => {
        const updated = [...prev];
        for (let i = currentExerciseIndex; i < updated.length; i++) {
          const name = updated[i].exercise?.name ?? '';
          if (droppedNames.has(name) && (updated[i].sets?.length ?? 0) === 0) {
            updated[i] = { ...updated[i], _timeCrunchSkipped: true };
          } else if (updated[i].exercise) {
            updated[i] = {
              ...updated[i],
              exercise: {
                ...updated[i].exercise,
                restSec: Math.round((updated[i].exercise.restSec ?? 90) * 0.70),
              },
            };
          }
        }
        return updated;
      });
    }

    setTimeCrunchActive(true);
    setTimeCrunchMsg(msg);
    hapticsVocab.error();
  }

  async function handleFinishWorkout() {
    if (!activeWorkout) { navigation.goBack(); return; }
    if (finishingRef.current) return; // double-tap guard
    finishingRef.current = true;
    audit('workout.finish.tap', {
      workoutId: activeWorkout?.id ?? null,
      loggedSetCount: loggedSets.length,
    });

    // Capture everything needed for the finish before the rating sheet might
    // cause a re-render that loses closure values.
    const snapshotExercises = workoutExercises;
    const snapshotElapsed = elapsedSeconds;

    let pendingSessionResolution = null;

    async function doFinish() {
      // WK-2: count from the DB, not the in-memory exercise list, so
      // sets logged on an exercise later swapped out or removed still
      // count towards the workout total. Those rows stay in the DB and
      // in history/volume aggregates; snapshotExercises drops them,
      // which under-reported the finished workout. Fall back to memory
      // if the read fails.
      let allSets;
      try {
        const dbRows = await getWorkoutSetsForWorkout(activeWorkout.id);
        allSets = (dbRows && dbRows.length) ? dbRows : snapshotExercises.flatMap(e => e.sets || []);
      } catch (_) {
        allSets = snapshotExercises.flatMap(e => e.sets || []);
      }
      // D107-2 load semantics: the session's stored totalVolume counts a
      // per-hand dumbbell set as weight x 2 and leaves assistance out
      // entirely. Built from the full (cached) library so sets on an
      // exercise later swapped out of the plan still classify correctly;
      // a read failure falls back to no map, which reads every set as
      // 'total' - the pre-semantics behaviour.
      let loadSemanticsById = null;
      try {
        loadSemanticsById = buildLoadSemanticsById(await getAllExercises());
      } catch (_) { /* fall back to unmapped totals */ }
      const { totalSets, workingSetCount, tonnage } = summariseWorkoutSets(allSets, { loadSemanticsById });
      const exerciseNames = snapshotExercises.map(e => e.exercise?.name).filter(Boolean);
      // Founder device report 2026-08-24: a session done from a named
      // routine was being stored as a join of its first two exercise
      // names, so swapping an exercise in renamed the whole workout - the
      // share card titled a Back + Hams day "Ab Crunch Machine & Seated
      // Leg Curl +more". The routine name was never even offered:
      // shareSessionName's first argument was hard-coded null here, so the
      // fallback ran every time. The workout keeps the name of the day it
      // came from, and the exercise join stays what it was written to be,
      // the fallback for a free-form session that has no routine.
      let finishedRoutineName = null;
      if (activeWorkout.routineId) {
        try {
          finishedRoutineName = (await getRoutineById(activeWorkout.routineId))?.name ?? null;
        } catch (_) { /* fall back to the exercise-name title */ }
      }
      const sessionName = shareSessionName(finishedRoutineName, exerciseNames);
      const workoutUpdate = {
        endedAt: Date.now(),
        durationMinutes: Math.round(snapshotElapsed / 60),
        isCompleted: true,
        name: sessionName,
        setCount: workingSetCount,
        totalVolume: tonnage,
      };
      if (pendingSessionResolution) {
        // eslint-disable-next-line global-require
        const { finishWorkoutWithSessionResolution } = require('../lib/database');
        await finishWorkoutWithSessionResolution(
          activeWorkout.id, workoutUpdate, user.id, pendingSessionResolution,
        );
      } else {
        await updateWorkout(activeWorkout.id, workoutUpdate);
      }
      // C18 re-entry amendment: this finish (full completion OR ended-early,
      // both land here) resolves the required session activeWorkout was
      // started for. If it consumed a pending re-entry ease decision,
      // retire it now - one-session-only, and this is the one session it
      // was for. Best-effort: a failed clear leaves a decision that simply
      // won't match anything else (wrong session identity), never a wrongly
      // reapplied ease.
      if (activeWorkout?.reEntryEaseApplied && user?.id) {
        clearPendingReEntryEase(user.id).catch(() => {});
      }
      // LB-8: the core value event. Counts + duration only, no
      // exercise names or loads.
      try {
        const uid = useAppStore.getState().user?.id;
        if (uid) {
          // eslint-disable-next-line global-require
          const { track } = require('../lib/engineTelemetry');
          track(uid, 'workout_completed', {
            set_count: workingSetCount,
            duration_min: Math.round(snapshotElapsed / 60),
            exercise_count: snapshotExercises.length,
          }).catch(() => {});
          // E7.2 activation funnel: first-ever completed workout. C8 phase 1
          // attaches the coarse first-touch source (sanitised slug or null,
          // never a URL) so acquisition channels can be judged on activation.
          // eslint-disable-next-line global-require
          const { trackFirst } = require('../lib/telemetry/firsts');
          // eslint-disable-next-line global-require
          const { getFirstTouchSource } = require('../lib/attribution');
          trackFirst(uid, 'first_workout_logged', {
            first_touch_source: getFirstTouchSource(),
          }).catch(() => {});
        }
      } catch (_) { /* tolerate */ }
      // COMP-019: refresh the home-screen widget snapshot (consistency
      // tick). Fire-and-forget; it never blocks the finish flow.
      try {
        const uid2 = useAppStore.getState().user?.id;
        if (uid2) {
          // eslint-disable-next-line global-require
          require('../lib/widgets/writer').writeWidgetSnapshot(uid2).catch(() => {});
          // S6: a session just landed, so lay the next activation-nudge
          // stage (or clear it once activated). Self-guarding and
          // best-effort; never blocks the finish flow.
          // eslint-disable-next-line global-require
          require('../lib/notifications/scheduler').scheduleActivationNudge(uid2).catch(() => {});
          // D17: a completed session can shift the habit-derived training-
          // reminder schedule, so refresh it here too. Self-guarding
          // (no-ops until there is enough history) and best-effort; never
          // blocks the finish flow.
          // eslint-disable-next-line global-require
          require('../lib/notifications/trainingHabitSchedule').refreshHabitDerivedTrainingSchedule(uid2).catch(() => {});
          // C14 J6 (R-16): a genuine completed-training return re-lays the
          // weigh-in reminders that the three-week inactivity stand-down held
          // back. Silent: nothing is sent about the return, and the user's
          // stored preference was never changed by the stand-down. Self-
          // guarding (permission, Pro, their own toggle, quiet hours and the
          // ED gates all still apply) and best-effort; never blocks the
          // finish flow. A no-op for the everyday user whose reminders are
          // already laid, beyond re-laying the same schedule.
          // eslint-disable-next-line global-require
          require('../lib/notifications/scheduler').relayWeighInAfterTrainingReturn().catch(() => {});
        }
      } catch (_) { /* tolerate */ }
      // Push to cloud IMMEDIATELY on finish. Previously the
      // syncWorkout call only fired when the user tapped Close
      // on the Workout Summary screen, if they swiped away to
      // another tab or backgrounded the app between Finish and
      // Close, the completed workout never reached the cloud.
      // Cross-device sign-in then restored everything except
      // workouts and sets. Fire-and-forget; failures fall into
      // pending_sync_ops via syncWorkout's own retry path.
      try {
        const supabaseUserId = useAppStore.getState().session?.user?.id;
        if (supabaseUserId) {
          // eslint-disable-next-line global-require
          const { syncWorkout } = require('../lib/sync');
          syncWorkout(supabaseUserId, activeWorkout.id).catch(() => {});
        }
      } catch (_) { /* tolerate */ }
      // COMP-015: capture the session's real (nonzero, non-reverted)
      // adjustments BEFORE endWorkout clears the slice, so the summary
      // can show its confirmation row.
      const finishedAdjustments = (useAppStore.getState().sessionAdjustments || [])
        .filter(a => a.setDelta !== 0 && !a.reverted)
        .map(a => ({ muscle: a.muscle, setDelta: a.setDelta }));
      // The session's records, captured BEFORE endWorkout clears the slice -
      // the same shape of guard finishedAdjustments above already needs.
      const finishedPRs = detectedPRs;
      endWorkout();
      // D2: the whole-workout completion beat (the vocabulary event
      // existed but was never called anywhere).
      hapticsVocab.workoutComplete();
      // eslint-disable-next-line global-require
      try { require('../lib/notifications/activeWorkout').dismissActiveWorkoutNotification(); } catch (_) {}
      navigation.replace('WorkoutSummary', {
        workoutId: activeWorkout.id,
        sessionAdjustments: finishedAdjustments,
        routineId: activeWorkout.routineId || null,
        startedAt: activeWorkout.startedAt,
        endedAt: Date.now(),
        durationMinutes: Math.round(snapshotElapsed / 60),
        exerciseCount: snapshotExercises.length,
        setCount: totalSets,
        workingSetCount,
        tonnage,
        exerciseNames,
        detectedPRs: finishedPRs,
        exerciseData: snapshotExercises.map(e => ({
          exerciseId: e.exercise?.id,
          name: e.exercise?.name,
          recommendedSets: (e.sets || []).filter(s => s.setType !== 'warmup').length || 3,
          repsMin: e.routineExercise?.recommendedRepsMin || 8,
          repsMax: e.routineExercise?.recommendedRepsMax || 12,
          loggedSets: (e.sets || []).map(s => ({
            weight: s.weight,
            reps: s.actualReps ?? s.reps,
            setType: s.setType,
          })),
        })).filter(e => e.exerciseId),
      });
    }

    async function runFinish(sessionResolution = null) {
      pendingSessionResolution = sessionResolution;
      // CC29 (sections 5.3, 18): the completion effects record - which
      // planned-but-unperformed rows this session's ACTIVE EPISODE
      // constraints excuse. Written before close so the adherence reader
      // (getWeeklySessionStats) can tell effective completion from a real
      // early stop; merge-by-exercise keeps the mid-session removal
      // entries. Episode-role only (RT2-1); a session with no episode
      // effects writes nothing. Best-effort: a failure here never blocks
      // the finish.
      try {
        // Round 3 (QUALIFIED item 9), reason updated round 17, comment
        // corrected round 18: a FRESH capability read, not the screen's
        // intentState - the finish must judge on the newest facts
        // regardless of what the screen last rendered, and it costs one
        // read at session end. The resolver cannot reject (its whole
        // body is one try/catch): a failed read returns the stale-known
        // snapshot (usable) or the unknown-empty shape, which the
        // `!capState.empty` gate below skips - so nothing is excused on
        // a read that knows nothing. The round-17 claim of a
        // fallback-to-screen-state .catch described a path that could
        // never run; it is gone.
        // eslint-disable-next-line global-require
        const { loadCapabilityResolveState } = require('../lib/capability/resolve');
        const capState = user?.id
          ? await loadCapabilityResolveState(user.id, {})
          : null;
        if (user?.id && activeWorkout?.id) {
          let entries = [];
          if (capState && !capState.empty) {
            // eslint-disable-next-line global-require
            const { computeCompletionEffects } = require('../lib/capability/effective');
            // Round 2 (R2-4): resolve each row from the library for
            // judgement - the snapshot's own exercise objects are the
            // demandless routine literals for any row the serve pass did
            // not replace (a resumed session, a rule applied after
            // logging began), and with unknown excusing nothing a
            // demand-axis excusal could never fire off them. Same by-id
            // resolution serve itself performs; the memo-cached library
            // read costs nothing after first call. An unresolved id keeps
            // the partial row: unknown lane, excuses nothing, honestly.
            // eslint-disable-next-line global-require
            const { getAllExercises } = require('../lib/database');
            const libById = new Map(((await getAllExercises().catch(() => [])) ?? []).map((x) => [x.id, x]));
            ({ entries } = computeCompletionEffects(
              snapshotExercises.map((e) => {
                const raw = e?.exercise ?? e;
                return {
                  exercise: libById.get(raw?.id) ?? raw,
                  performed: (e.sets?.length ?? 0) > 0,
                  // R10-1: the record keys per planned slot.
                  rowId: e?.routineExercise?.id ?? null,
                  // R13-2: the marker rides into the projection, so the
                  // completion writer refuses the user's own rows
                  // exactly as the removal writer does.
                  userChosen: !!e?._userAdded,
                };
              }),
              capState,
            ));
          }
          // Round 10 (R10-3): the record corrects FORWARD on the
          // session's own logged facts. A movement the user re-added and
          // TRAINED was still carrying its serve-time omission, so the
          // receipt said "left out" beside the user's own logged sets,
          // the week counted a session constraint-excused that nothing
          // excused, and the block ledger's denominator dropped a slot
          // the user performed. performedIds is not an intent judgement
          // (the class the round-8 attribution probe ruled out) - it is
          // workout_sets fact, and the writer renames a performed
          // omission OR substitution with a _revoked suffix (round 11,
          // R11-1: both lanes' claims fall the same way once the
          // excluded movement happened) so every strict-matching reader
          // drops it. Runs OUTSIDE the capState gate: reconciliation
          // needs only the record and the logged sets, and must still
          // fire when the rules themselves ended mid-session.
          // Round 19 (R19-4): performed facts come from the DB, not
          // the in-memory list - WK-2's own reasoning (:3406) applied
          // to the record: sets logged on an exercise later REMOVED
          // from the session stay in workout_sets, but the removed row
          // is gone from snapshotExercises, so a snapshot-derived list
          // could never revoke an entry for a movement the user
          // demonstrably trained. Falls back to the snapshot only if
          // the read itself fails.
          let performedIds;
          try {
            const dbSetRows = await getWorkoutSetsForWorkout(activeWorkout.id);
            performedIds = [...new Set((dbSetRows ?? []).map((s) => s?.exerciseId).filter(Boolean))];
          } catch (_) {
            performedIds = snapshotExercises
              .filter((e) => (e.sets?.length ?? 0) > 0)
              .map((e) => (e?.exercise ?? e)?.id)
              .filter(Boolean);
          }
          if (entries.length || performedIds.length) {
            // eslint-disable-next-line global-require
            const { appendSessionConstraintEffects } = require('../lib/database');
            await appendSessionConstraintEffects(user.id, activeWorkout.id, entries, { performedIds }).catch(() => {});
          }
        }
      } catch (_e) { /* effects are additive; the finish must never block */ }
      try {
        await doFinish();
      } catch (e) {
        logError('ActiveWorkoutScreen.handleFinishWorkout', e, {
          userId: user?.id,
          workoutId: activeWorkout?.id,
          setCount: snapshotExercises.flatMap(ex => ex.sets || []).length,
        });
        // Reset the double-tap guard so the user can retry. On the
        // happy path the guard stays set forever because we've
        // already navigated away from this screen.
        finishingRef.current = false;
        appAlert(
          'Couldn\'t finish workout',
          'Your sets are still saved, but the workout did not close on your device, so tap Finish workout again.',
        );
      } finally {
        pendingSessionResolution = null;
      }
    }

    // L07-F10: an unconditional confirm on every finish warned even when
    // nothing was at risk. shouldConfirmBeforeFinish (lib/workoutHelpers.js)
    // is the shared, unit-tested rule: it says "warn" only when the session
    // has zero logged sets, or a planned exercise (excluding one Time Crunch
    // consciously dropped via _timeCrunchSkipped) is about to be finished
    // with no sets at all. When every planned exercise already has a set,
    // there is nothing to silently discard, so finish immediately. A typed
    // but unlogged entry still counts as something at risk, so it keeps the
    // confirm even when every exercise is covered.
    if (!shouldConfirmBeforeFinish(snapshotExercises) && !hasInProgressSetEntry()) {
      await runFinish();
      return;
    }

    // Name the unlogged set explicitly so the confirm covers the "unsaved/
    // in-progress" case too, not just the logged-set count.
    const inProgressNote = hasInProgressSetEntry()
      ? ` You also have an unlogged set for ${exercise?.name || 'this exercise'} that will be lost.`
      : '';

    // ── C18 ENDED EARLY ──────────────────────────────────────────────────
    //
    // The athlete performed SOME of the planned work and is deliberately
    // stopping. Both of the obvious outcomes are forbidden: marking the whole
    // session COMPLETED claims work that never happened, and marking it
    // SKIPPED erases work that did. So this resolves the required instance as
    // ENDED_EARLY - progression moves on, the logged sets remain exactly what
    // they are, and the untouched exercises produce NO evidence rather than
    // zeros.
    //
    // Detected from the real session, not assumed: some exercise has logged
    // sets and some planned exercise has none. With nothing logged at all
    // this is not an ended-early session and the existing copy stands.
    const performed = snapshotExercises.filter((e) => (e.sets?.length ?? 0) > 0);
    const unperformed = snapshotExercises.filter((e) => (e.sets?.length ?? 0) === 0);
    const isEndedEarly = performed.length > 0 && unperformed.length > 0;

    const endedEarlyWeekId = activeWorkout?.mesocycleWeekId ?? progressionWeekId;
    const endedEarlyRoutineId = activeWorkout?.routineId ?? null;
    const canResolveEndedEarly = !!user?.id && !!endedEarlyWeekId && !!endedEarlyRoutineId;

    if (isEndedEarly && canResolveEndedEarly) {
      // eslint-disable-next-line global-require
      const { endEarlyConfirmation } = require('../lib/blockProgression');
      const sessions = progressionSessions ?? [];
      const instance = sessions.find((x) => x.routineId === activeWorkout?.routineId) ?? null;
      const recoveryNext = !!instance && sessions
        .filter((x) => x.routineId !== instance.routineId)
        .every((x) => x.state !== 'outstanding');
      const copy = endEarlyConfirmation(
        instance ?? { name: activeWorkout?.name ?? '', order: 0 }, sessions, { recoveryNext },
      );
      appAlert(
        copy.title,
        `${copy.body}${inProgressNote}`,
        [
          { text: copy.cancel, style: 'cancel', onPress: () => { finishingRef.current = false; } },
          {
            text: copy.confirm,
            onPress: async () => {
              // Workout closure and ENDED_EARLY are one SQLite transaction.
              // A crash can leave neither or both, never a progressed session
              // whose workout is still resumable.
              await runFinish({
                mesocycleWeekId: endedEarlyWeekId,
                routineId: endedEarlyRoutineId,
                mesocycleId: activeWorkout?.mesocycleId ?? progressionBlockId,
                resolution: 'ended_early',
                workoutId: activeWorkout.id,
              });
            },
          },
        ],
      );
      return;
    }

    appAlert(
      'Finish workout?',
      `You've logged ${snapshotExercises.reduce((sum, e) => sum + (e.sets?.length ?? 0), 0)} sets across ${snapshotExercises.length} exercises.${inProgressNote}`,
      [
        { text: 'Keep going', style: 'cancel', onPress: () => { finishingRef.current = false; } },
        { text: 'Finish workout', onPress: () => runFinish() },
      ],
    );
  }

  const elapsed = {
    mins: Math.floor(elapsedSeconds / 60),
    secs: elapsedSeconds % 60,
  };
  const elapsedStr = `${elapsed.mins}:${elapsed.secs.toString().padStart(2, '0')}`;

  // COMP-015: session-adjusted working-set target, falling back to the
  // routine row's own recommendedSets (defensive - adjustedSetCount already
  // folds this in when there is no active adjustment), and finally to
  // DEFAULT_FREEFORM_TARGET_SETS so a slot with no routineExercise at all
  // (blank workout, or an exercise added mid-session) still resolves to a
  // real number instead of undefined. See DEFAULT_FREEFORM_TARGET_SETS above
  // for the full root-cause note.
  const targetSets = adjustedSetCount || routineExercise?.recommendedSets || DEFAULT_FREEFORM_TARGET_SETS;
  const workingLogged = countProgressSets(loggedSets);
  const targetComplete = targetSets && workingLogged >= targetSets;

  // F-13 (docs/final-certification-2026-09-05/07-FINDINGS.md, evidence A8):
  // on a circuit the round belongs to the CIRCUIT, not to one station.
  // Reading each station's own logged-set count let A show "Round 3 of 3"
  // while B showed "Round 2 of 3" inside the same circuit at the same
  // moment. This is the one derivation every circuit surface reads: the
  // chip, the orientation row and the lock-screen text. The live loggedSets
  // list is authoritative for THIS station; the other stations come from
  // their own snapshotted sets. Auto-advance is untouched - it still fires
  // per station on that station's own target.
  const circuitRound = useMemo(() => {
    if (!isCircuitGroup || currentSGI == null) return null;
    const groupLogged = workoutExercises
      .map((entry, i) => (
        (entry?.supersetGroupId ?? null) === currentSGI
          ? (i === currentExerciseIndex ? workingLogged : countProgressSets(entry?.sets ?? []))
          : null
      ))
      .filter(n => n !== null);
    return circuitRoundState({ stationLogged: workingLogged, groupLogged, targetRounds: targetSets });
  }, [isCircuitGroup, currentSGI, workoutExercises, currentExerciseIndex, workingLogged, targetSets]);
  circuitRoundRef.current = circuitRound;

  // F-13 (evidence A4): the pre-set heads-up copy, forked on the group's
  // stored KIND rather than on its size. A circuit is announced as a
  // circuit, in plain words, with its rounds and its round rest; a superset
  // or giant set keeps exactly the copy it had.
  const headsUpIsCircuit = !!supersetHeadsUp?.isCircuit;
  const headsUpStations = supersetHeadsUp?.memberNames?.length ?? 0;
  const headsUpRounds = supersetHeadsUp?.rounds ?? null;
  const headsUpRestWords = formatRoundRestWords(supersetHeadsUp?.roundRestSeconds);
  const headsUpCircuitBody = [
    `${headsUpStations} stations done one after the other with no rest between them`,
    headsUpRestWords ? `, then rest ${headsUpRestWords} between rounds` : '',
    '.',
    headsUpRounds ? ` ${headsUpRounds} rounds in all.` : '',
  ].join('');

  // Campaign 20 Phase 2, Stage 3/4 (design section 9.3): prescriptions[i] is
  // the resolver's prescription for working position i+1 (1-based
  // elsewhere, 0-indexed here). Reactive to `packet` (readiness changes,
  // overrides, today's logged sets all flow through it), so the NowCard
  // range/provenance line and the upcoming-set previews below always read
  // the CURRENT resolved state, not a stale computeSetTargets snapshot.
  // Capped to cover at least the current entry even past targetSets (an
  // "extra set" logged beyond the plan).
  const prescriptions = useMemo(() => {
    if (!packet) return [];
    const count = Math.max(targetSets || 0, workingLogged + 1);
    const list = [];
    for (let pos = 1; pos <= count; pos++) {
      // EL-10: no automatic load-step suggestion for a circuit station or
      // ballistic exercise - every upcoming-set preview stays history-only.
      list.push(resolveSetPrescription(packet, { index: pos, evidenceClass: currentEvidenceClass }));
    }
    return list;
  }, [packet, targetSets, workingLogged, currentEvidenceClass]);

  // Campaign 20 Phase 2 Stage 15 (restore/replay verification): keep the
  // LIVE (not-yet-logged) box in step with a mid-session edit or delete of
  // an EARLIER logged set. handleSaveEditedSet/handleDeleteEditedSet already
  // update loggedSets/workoutExercises, which the packet/prescriptions memo
  // above already reacts to (the upcoming-preview rows and the provenance
  // line pick this up for free) - but the box's actual weight/reps VALUE
  // lives in the separate `currentSet` state, seeded once by loadHistory or
  // handleCompleteSet and otherwise left alone so a user's own typed entry
  // is never silently overwritten. An untouched GHOST seed (isGhost: true -
  // the app's own suggestion, never something the user typed) is not user
  // input, so re-seeding it whenever the resolver's prescription for this
  // exact position changes underneath it is safe and correct. Without this,
  // editing or deleting the set the seed was computed from left the box
  // showing the pre-edit prescription until the athlete backed out of the
  // exercise and back in - a directly-connected defect surfaced by the
  // Stage 15 restore/replay test plan (docs/live-prescription-campaign-20-
  // 2026-08-16/CAMPAIGN-20-PHASE-1-DESIGN.md §20's replay tests).
  useEffect(() => {
    if (!currentSet.isGhost) return;
    const live = prescriptions[workingLogged];
    if (!live) return;
    const w = live.prefill ? (live.weight ?? '') : '';
    const r = live.repsTarget != null ? live.repsTarget : DEFAULT_SET.reps;
    if (String(w) === String(currentSet.weight) && r === currentSet.reps) return;
    setCurrentSet(cs => ({ ...cs, weight: w, reps: r, isGhost: live.prefill && live.weight != null }));
    seededEntryRef.current = { weight: w, reps: r };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prescriptions, workingLogged]);

  // Card-header line 1 (COMP-001): where am I, what kind of set. The whole
  // line opens the set-type picker (it replaced SetEntry's card-foot row).
  const orientationLabel = (() => {
    if (currentSet.setType === 'warmup') {
      return `Warm-up - Set W${loggedSets.filter(s => s.setType === 'warmup').length + 1}`;
    }
    if (isDeloadWeek) return `Light set ${workingLogged + 1} - Easy`;
    // F-13 (evidence A5): on a circuit station this line said "Set 3 of 3 -
    // Superset" while the chip directly above it said "Circuit · Round 3 of
    // 3". A circuit counts rounds, and the round is the circuit's own (see
    // circuitRound above), so both now read from the same derivation.
    if (circuitRound) {
      const pos = circuitRound.targetRounds
        ? `Round ${circuitRound.round} of ${circuitRound.targetRounds}`
        : `Round ${circuitRound.round}`;
      return `${pos} - Circuit`;
    }
    const pos = targetSets ? `Set ${workingLogged + 1} of ${targetSets}` : `Set ${workingLogged + 1}`;
    const mode = (currentSGI != null && pairedExerciseName)
      ? 'Superset'
      : (SET_TYPE_OPTIONS.find(o => o.value === currentSet.setType)?.label ?? 'Working');
    return `${pos} - ${mode}`;
  })();

  // stalledAdvice (the 3-session same-weight nudge with its hard-coded,
  // unit-blind +2.5 literal) is RETIRED as of Campaign 20 Phase 2 (design
  // section 3, authority 7). Its provenance-line successor retired in turn
  // with the in-card coach line (founder device order 2026-08-17).

  // The B2 readiness line for the coach slot retired with the in-card coach
  // line (founder device order 2026-08-17); the readiness sheet still
  // carries the written why on demand.
  const activeExerciseType = exercise?.exerciseType || 'weight_reps';

  // D87: the live record line under the steppers. Pure derivation from data
  // already in memory -- allTimeSets (every past set for this exercise,
  // excluding this workout) plus loggedSets (this session's sets for it),
  // which is the same history shape handleCompleteSet assembles as prHistory
  // before calling detectPR. buildRecordLine calls that same detectPR, so the
  // flag and the celebration can only ever agree. No query, no engine change.
  const recordLine = useMemo(() => buildRecordLine({
    weight: currentSet.weight,
    reps: currentSet.reps,
    // C5-P15-01 (D96): the D87 agreement contract requires this history to
    // be the SAME shape handleCompleteSet assembles as prHistory, so the
    // line can never promise a record the log then withholds, nor stay dark
    // on a set the log celebrates. Both exclude warm-ups, and both include
    // today's earlier sets (founder ruling 2026-08-23).
    historySets: [...allTimeSets, ...loggedSets].filter(isWorkingSetRow),
    units,
    isWarmup: currentSet.setType === 'warmup',
    exerciseType: activeExerciseType,
    // D107-2: the assisted inversion must run on BOTH sides of the D87
    // agreement contract (this line and the on-log detectPR call).
    loadSemantics: exercise?.loadSemantics ?? 'total',
    // EL-7: same agreement contract - detectPR (algorithms.js) already
    // excludes a ballistic set via isE1rmEligibleRow, so this live line
    // must too, or it could promise a record the log then withholds.
    evidenceClass: currentEvidenceClass,
  }), [currentSet.weight, currentSet.reps, currentSet.setType, allTimeSets, loggedSets, units, activeExerciseType, exercise?.loadSemantics, currentEvidenceClass]);

  const handleCurrentSetChange = useCallback((next) => {
    if (!next.isGhost && currentSet.isGhost) setGhostSet(null);
    setCurrentSet(next);
  }, [currentSet.isGhost]);

  // Logger phase 2B: the outline navigator's rows - the same done/total/
  // skipped derivation the phase-2 list (and ExerciseNav before it) used;
  // the current exercise's total honours any session adjustment. Tap = jump
  // only (handleJumpToExercise); long-press = the ONE reorder path, the
  // existing block-aware reorder sheet.
  const outlineItems = workoutExercises.map((entry, i) => {
    const gid = entry.supersetGroupId ?? null;
    const groupSize = gid != null
      ? workoutExercises.filter((e) => (e.supersetGroupId ?? null) === gid).length
      : 0;
    return {
      key: keyForWorkoutExercise(entry),
      name: entry.exercise?.name ?? '',
      done: countProgressSets(entry.sets ?? []),
      total: (i === currentExerciseIndex
        ? adjustedSetCount
        : entry.routineExercise?.recommendedSets) || DEFAULT_FREEFORM_TARGET_SETS,
      skipped: !!entry._timeCrunchSkipped,
      // F-13 (evidence A5): a circuit station is named by its own group
      // kind, never by the 2-vs-3+ superset/giant-set split.
      groupLabel: gid != null
        ? (entry.routineExercise?.groupKind === 'circuit'
          ? 'Circuit'
          : (groupSize > 2 ? 'Giant set' : 'Superset'))
        : null,
    };
  });

  if (!exercise) {
    return (
      <SafeAreaView style={[styles.safe, live.safe]}>
        <EmptyExerciseView
          onAdd={openAddExercisePicker}
          onFinish={handleFinishWorkout}
          onCancel={handleCancelWorkout}
          elapsed={elapsedStr}
          workoutExercises={workoutExercises}
          setCurrentExerciseIndex={setCurrentExerciseIndex}
          currentExerciseIndex={currentExerciseIndex}
        />
        <ExercisePickerModal
          visible={showExercisePicker}
          onClose={closeExercisePicker}
          onSelect={handlePickerSelect}
          actionLabel={pickerMode === 'swap' ? 'Swap in' : 'Add to workout'}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, live.safe]} edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        {/* R3 rebuild: header is the dedicated component; Finish hands off
            to the bottom bar when the bar itself offers Finish (last
            exercise, target met) so two finish affordances never co-exist. */}
        <WorkoutHeader
          elapsedStr={elapsedStr}
          onCancel={handleCancelWorkout}
          onFinish={handleFinishWorkout}
          timeCrunchActive={timeCrunchActive}
          showFinish={!(targetComplete && !extraSetArmed && isLastExercise)}
        />

        {/* T2-06 (D112 R5, closes audit T2-06): the session-level reduced
            signal - quiet text, not a banner, rendered once per session at
            the top of the outline area (never per-exercise, unlike the
            capability strip notice below). */}
        {omittedSessionCount > 0 ? (
          <Text style={[styles.omittedSessionNote, live.omittedSessionNote]}>
            {omittedSessionCount === 1
              ? 'One exercise is left out of this session while your change lasts.'
              : `${omittedSessionCount} exercises are left out of this session while your change lasts.`}
          </Text>
        ) : null}

        {/* COMP-013 starter-session banner moved into the collapsed "N notes"
            rail above the set-entry card (U-A-1). */}

        {/* Phase 2B: the compact workout outline - the whole session as a
            quiet navigator FIXED under the header, never buried beneath the
            active logger. Every exercise is one tap away at all times
            (failure 5); tap = jump only, long-press = the reorder sheet. */}
        <WorkoutOutline
          items={outlineItems}
          currentIndex={currentExerciseIndex}
          onSelect={handleJumpToExercise}
          onReorder={workoutExercises.length > 1 ? () => setShowReorderSheet(true) : undefined}
        />

        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          // 'interactive' on iOS: iOS fires 'on-drag' for the PROGRAMMATIC
          // auto-scroll that keeps the focused input visible, so the
          // keyboard dropped after one keystroke (founder device report
          // 2026-07-13).
          //
          // 'none' on Android (founder device report, pre-gym build defect
          // pass): the SAME class of bug, previously assumed not to apply to
          // Android because 'interactive' doesn't exist there - it applies
          // regardless. Every keystroke on Weight can change this card's
          // layout height (the Est. max caption line and the record-flag row
          // both mount/unmount as weight and reps cross zero or a record
          // threshold), and RN's built-in scroll-into-view for the focused
          // input fires a native scroll event to compensate. Android's
          // ScrollView cannot distinguish that PROGRAMMATIC scroll from a
          // user drag, so 'on-drag' dismissed the keyboard after every single
          // character - proven by removing this one prop value: source of
          // truth is Android's RN implementation of keyboardDismissMode
          // (com.facebook.react.views.scroll), which has no equivalent to
          // iOS's gesture-phase-aware 'interactive' mode. 'none' is the
          // deterministic fix: Android loses drag-to-dismiss on this screen
          // (Log set, the header X and the overflow sheet's own drag handle
          // remain the ways to dismiss/leave), but typing becomes reliable,
          // which is the defect that made the screen unusable.
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'none'}
        >
          {/* Exercise Title */}
          <View style={styles.exerciseHeader}>
            <View style={styles.exerciseNameRow}>
              {/* D43 S3 (blueprint 3.8): "Exercise info" relocates off the
                  overflow sheet onto the title itself -- tapping the name
                  fires the same setShowExecution(true) handler the removed
                  overflow row used. */}
              <TouchableOpacity
                onPress={() => {
                  // RC-9 (D96, Review C): anyone opening exercise info is
                  // not looking for "what is a set", so this tap retires
                  // the novice Help pulse too - it otherwise animated on
                  // every exercise of every session until the overflow
                  // itself was opened. Novice path untouched.
                  if (showInfoTipPulse) {
                    infoPulseLoop.current?.stop();
                    infoPulseAnim.setValue(1);
                    setShowInfoTipPulse(false);
                    AsyncStorage.setItem('@volyume_seen_workout_info', 'true').catch(() => {});
                  }
                  setShowExecution(true);
                }}
                accessibilityRole="button"
                accessibilityLabel="Exercise details"
                style={styles.exerciseNameTap}
                hitSlop={{ top: 8, bottom: 8, left: 0, right: 8 }}
              >
                <Text style={[styles.exerciseName, live.exerciseName]} numberOfLines={2}>{exercise.name}</Text>
                {/* Founder order 2026-08-17: the name-tap looked like plain
                    text, so nothing said it opens the exercise's details.
                    A quiet chevron in the house muted ink hugs the name's
                    end - the standard "this expands" signal, no new chrome. */}
                <Ionicons name="chevron-down" size={iconSize.sm} color={t.colors.textMuted} style={styles.exerciseNameChevron} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.overflowBtn, showInfoTipPulse && styles.overflowBtnHinted]}
                onPress={() => {
                  if (showInfoTipPulse) {
                    infoPulseLoop.current?.stop();
                    infoPulseAnim.setValue(1);
                    setShowInfoTipPulse(false);
                    AsyncStorage.setItem('@volyume_seen_workout_info', 'true').catch(() => {});
                  }
                  audit('workout.overflow.open', { exerciseId: exercise?.id });
                  setShowOverflow(true);
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                // C5-P13-03 (D96): while the first-use cue is live the button
                // also says what is behind it. A bare pulsing "..." labelled
                // "Exercise options" gave a novice no reason to think it held
                // the only definitions of "set" and "rep" in the product. One
                // short word, one time; it goes with the pulse the first time
                // the sheet is opened.
                accessibilityLabel={showInfoTipPulse ? 'Exercise options, including how logging works' : 'Exercise options'}
              >
                <Animated.View style={[styles.overflowGlyphRow, showInfoTipPulse ? { transform: [{ scale: infoPulseAnim }] } : null]}>
                  {showInfoTipPulse ? (
                    <Text style={[styles.overflowHintLabel, live.overflowHintLabel]}>Help</Text>
                  ) : null}
                  <Ionicons name="ellipsis-horizontal" size={20} color={t.colors.textMuted} />
                </Animated.View>
              </TouchableOpacity>
            </View>
            {/* Muscle line deleted (COMP-001): primary muscle and equipment
                already show in the exercise info sheet. Superset chip moved
                into the collapsed "N notes" rail (U-A-1). The C5-P13-01
                effort line ("This week: stop N short of failure") removed on
                the founder device order of 2026-08-17. */}
          </View>

          {/* D43 S2: the "N notes" accordion is retired. Content-labelled
              chips (StatusStrip) replace it -- Deload, Superset, Coach note,
              Starter session, Target met -- named by WHAT they are, never
              hidden behind a count. Same underlying content/handlers as
              before, only the collapsed shell changed. Re-pinned in
              ActiveWorkoutScreen.usability.guard.test.js (D43 S2). */}
          {(() => {
            const items = [];
            if (starterActive) {
              items.push({
                key: 'starter',
                label: 'Starter session',
                icon: 'flash-outline',
                iconColor: t.colors.primary,
                content: (
                  <View key="starter" style={[styles.starterBanner, live.starterBanner]}>
                    <Ionicons name="flash-outline" size={16} color={t.colors.primary} />
                    <Text style={[styles.starterBannerText, live.starterBannerText]}>{timeCrunchMsg}</Text>
                    <TouchableOpacity
                      style={[styles.inlineActionPill, live.inlineActionPill]}
                      onPress={handleRevertTimeCrunch}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityRole="button"
                      accessibilityLabel="Do the full session instead"
                    >
                      <Text style={[styles.inlineActionPillText, live.inlineActionPillText]}>Full session</Text>
                    </TouchableOpacity>
                  </View>
                ),
              });
            }
            if (currentSGI != null && !!pairedExerciseName && isCircuitGroup) {
              // EL-9: "Circuit A · Round 2 of 3" - the group header this
              // chip doubles as. F-13 (evidence A8, A13): the round is the
              // CIRCUIT's, not this station's own working-set position, and
              // a circuit rotates rather than alternating, so the verb is
              // "with". A station more than one round behind the circuit
              // says so in one line rather than leaving the athlete to work
              // out why the number jumped.
              const roundNum = circuitRound?.round ?? 1;
              items.push({
                key: 'circuit',
                label: 'Circuit',
                icon: 'repeat',
                iconColor: t.colors.primary,
                content: (
                  <React.Fragment key="circuit">
                    <View style={[styles.supersetChip, live.supersetChip]}>
                      <Ionicons name="repeat" size={11} color={t.colors.primary} />
                      <Text style={[styles.supersetChipText, live.supersetChipText]}>
                        Circuit · Round {roundNum} of {targetSets} · with {partnerNamesText}
                      </Text>
                    </View>
                    {circuitRound?.missedRound ? (
                      <Text style={[styles.circuitMissedLine, live.circuitMissedLine]}>
                        {CIRCUIT_MISSED_ROUND_LINE}
                      </Text>
                    ) : null}
                  </React.Fragment>
                ),
              });
            } else if (currentSGI != null && !!pairedExerciseName) {
              items.push({
                key: 'superset',
                label: 'Superset',
                icon: 'link',
                iconColor: t.colors.primary,
                content: (
                  <View key="superset" style={[styles.supersetChip, live.supersetChip]}>
                    <Ionicons name="link" size={11} color={t.colors.primary} />
                    <Text style={[styles.supersetChipText, live.supersetChipText]}>
                      Superset - alternates with {partnerNamesText}
                    </Text>
                  </View>
                ),
              });
            }
            // D107-2: "an exercise already IN the active plan is never
            // silently rewritten" - this is the quiet notice that law
            // requires. Nothing here changes the plan; it only surfaces the
            // fact, with a Swap shortcut reusing the existing swap sheet.
            if (patternAvoidActive && patternAvoidCopy) {
              items.push({
                key: 'pattern-avoid',
                label: 'Avoided pattern',
                icon: 'shield-outline',
                iconColor: t.colors.warning,
                content: (
                  <View key="pattern-avoid" style={[styles.nextTimeBanner, live.nextTimeBanner]}>
                    <Ionicons name="shield-outline" size={16} color={t.colors.warning} style={{ marginTop: spacing.hair }} />
                    <View style={styles.nextTimeBannerBody}>
                      <Text style={[styles.nextTimeBannerText, live.nextTimeBannerText]}>
                        {patternAvoidCopy}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.inlineActionPill, live.inlineActionPill]}
                      onPress={handleOpenSwap}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityRole="button"
                      accessibilityLabel={`Swap ${exercise?.name ?? 'this exercise'}`}
                    >
                      <Text style={[styles.inlineActionPillText, live.inlineActionPillText]}>Swap</Text>
                    </TouchableOpacity>
                  </View>
                ),
              });
            }
            if (constraintNoticeCopy) {
              items.push({
                key: 'capability-constraint',
                // The label follows the lane: a permanent rule is not a
                // "temporary change" (D112 R6 vocabulary law). An UNKNOWN
                // notice (F4) labels by the lane's settings home too - it
                // is a fact about what the app knows, not a change.
                label: (constraintNotice?.kind === 'baseline' || constraintNotice?.kind === 'unknown')
                  ? 'Limitation' : 'Temporary change',
                icon: 'body-outline',
                iconColor: t.colors.warning,
                content: (
                  <View key="capability-constraint" style={[styles.nextTimeBanner, live.nextTimeBanner]}>
                    <Ionicons name="body-outline" size={16} color={t.colors.warning} style={{ marginTop: spacing.hair }} />
                    <View style={styles.nextTimeBannerBody}>
                      <Text style={[styles.nextTimeBannerText, live.nextTimeBannerText]}>
                        {constraintNoticeCopy}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.inlineActionPill, live.inlineActionPill]}
                      onPress={handleOpenSwap}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityRole="button"
                      accessibilityLabel={`Swap ${exercise?.name ?? 'this exercise'}`}
                    >
                      <Text style={[styles.inlineActionPillText, live.inlineActionPillText]}>Swap</Text>
                    </TouchableOpacity>
                  </View>
                ),
              });
            }
            nextTimeNotes.forEach(note => {
              // EP-15/UI-06: the note text itself may run past 4 lines. Clamp
              // by default (numberOfLines) but offer a More/Less toggle so the
              // full note stays reachable rather than being silently cut.
              const isNoteExpanded = expandedNoteIds.has(note.id);
              items.push({
                key: `note-${note.id}`,
                label: 'Coach note',
                icon: 'bulb-outline',
                iconColor: t.colors.primary,
                content: (
                  <View key={`note-${note.id}`} style={[styles.nextTimeBanner, live.nextTimeBanner]}>
                    <Ionicons name="bulb-outline" size={16} color={t.colors.primary} style={{ marginTop: spacing.hair }} />
                    <View style={styles.nextTimeBannerBody}>
                      <Text
                        style={[styles.nextTimeBannerText, live.nextTimeBannerText]}
                        numberOfLines={isNoteExpanded ? undefined : 4}
                      >
                        {note.note}
                      </Text>
                      <TouchableOpacity
                        onPress={() => setExpandedNoteIds(prev => {
                          const next = new Set(prev);
                          if (isNoteExpanded) next.delete(note.id); else next.add(note.id);
                          return next;
                        })}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        accessibilityRole="button"
                        accessibilityState={{ expanded: isNoteExpanded }}
                        accessibilityLabel={isNoteExpanded ? 'Show less of this note' : 'Show more of this note'}
                      >
                        <Text style={[styles.nextTimeMoreToggleText, live.nextTimeMoreToggleText]}>
                          {isNoteExpanded ? 'Less' : 'More'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                    <TouchableOpacity
                      style={[styles.inlineActionPill, live.inlineActionPill]}
                      onPress={async () => {
                        try { await markNoteShown(note.id); } catch (_e) {}
                        setNextTimeNotes(prev => prev.filter(n => n.id !== note.id));
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityRole="button"
                      accessibilityLabel="Dismiss note"
                    >
                      <Text style={[styles.inlineActionPillText, live.inlineActionPillText]}>Got it</Text>
                    </TouchableOpacity>
                  </View>
                ),
              });
            });
            if (isDeloadWeek && !deloadDismissed) {
              items.push({
                key: 'deload',
                label: 'Recovery',
                icon: 'battery-charging-outline',
                iconColor: t.colors.warning,
                content: (
                  <View key="deload" style={[styles.deloadBanner, live.deloadBanner]}>
                    <View style={styles.deloadBannerLeft}>
                      <Ionicons name="battery-charging-outline" size={18} color={t.colors.warning} />
                      <View style={{ flex: 1 }}>
                        {/* C18: the title comes from the RESOLVED state, so a
                            mid-block recovery adjustment is never announced as
                            the block's recovery week, and the sub-line
                            describes what this session genuinely changed. */}
                        <Text style={[styles.deloadBannerTitle, live.deloadBannerTitle]}>
                          {blockFinished
                            ? 'Block finished'
                            : (nextWorkoutRecoveryLabel(recoveryState) === 'Recovery-adjusted'
                              ? 'Recovery-adjusted session'
                              : 'Recovery week')}
                        </Text>
                        <Text style={[styles.deloadBannerSub, live.deloadBannerSub]}>
                          {blockFinished
                            ? 'Holding at recovery-week volume until you choose your next block'
                            : (trainRecoveryDetail(recoveryState, recoveryDifferences)
                              ?? 'Lighter on purpose. Full recovery, no PRs.')}
                        </Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      style={[styles.inlineActionPill, live.inlineActionPill]}
                      onPress={() => setDeloadDismissed(true)}
                      accessibilityRole="button"
                      accessibilityLabel="Dismiss recovery week banner"
                    >
                      {/* FB-05 (D96): "Skip" on the one banner telling the
                          user this week is deliberately lighter reads as
                          "skip the recovery week". Every sibling in this
                          strip already says "Got it"; behaviour unchanged
                          (it still just dismisses the banner). */}
                      <Text style={[styles.inlineActionPillText, live.inlineActionPillText]}>Got it</Text>
                    </TouchableOpacity>
                  </View>
                ),
              });
            }
            if (targetComplete) {
              items.push({
                key: 'target-reached',
                label: 'Target met',
                icon: 'checkmark-circle',
                iconColor: t.colors.success,
                content: (
                  <View key="target-reached" style={[styles.targetBanner, live.targetBanner]}>
                    <Ionicons name="checkmark-circle" size={16} color={t.colors.success} />
                    <Text style={[styles.targetBannerText, live.targetBannerText]}>
                      Target reached: {targetSets} working set{targetSets !== 1 ? 's' : ''} done
                    </Text>
                  </View>
                ),
              });
            }
            return <StatusStrip items={items} />;
          })()}

          {/* T2-20/T1-24 (D112 R5; roles split in round 8, R8-1): this
              note renders when the movement is actually side-carved for
              this user (carvedForOneSide, the union carve). The per-side
              logging PROMPT is gated separately, on sidedRuleBearsOnThis
              (sidedRuleTouches): any sided rule bearing on the movement
              suppresses the prompt whichever way the carve resolves, so
              the two flags deliberately differ. The side itself is never
              threaded back from the resolver (isSideCarvedAvailable is a
              plain boolean over the matching rows), so only the generic
              line is honestly available here - naming a side would mean
              re-deriving it independently in this screen, a second source
              of truth this file's lane cannot introduce. Always visible
              (quiet text, not a tap-to-expand chip): no action to take. */}
          {carvedForOneSide ? (
            <Text style={[styles.sideCarveNote, live.sideCarveNote]}>
              Volyume counts this one side at a time, matching the side you set.
            </Text>
          ) : null}

          {/* ONE continuous set sequence (phase 2B): completed rows above the
              active entry, upcoming previews below it - and, for ACTIVE-SET
              STABILITY (screenshot failure 1), once 3+ sets are logged the
              earlier ones fold behind a single constant-height line with
              only the most recent set left expanded, so the inputs stop
              drifting down the page as work accumulates. Rows keep their
              stable-id keys, in-place editing, long-press delete and PR
              re-evaluation exactly as before (D43 S4 / L07-F2). */}
          {loggedSets.length > 0 && (() => {
            const collapsed = loggedSets.length >= 3 && !historyExpanded;
            const visible = collapsed ? loggedSets.slice(-1) : loggedSets;
            const hiddenCount = loggedSets.length - visible.length;
            return (
              <View style={styles.loggedSection}>
                {loggedSets.length >= 3 && (
                  <TouchableOpacity
                    style={styles.historyToggle}
                    onPress={() => { hapticsVocab.selection(); setHistoryExpanded(v => !v); }}
                    hitSlop={{ top: 4, bottom: 4, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: !collapsed }}
                    accessibilityLabel={collapsed
                      ? `Show ${hiddenCount} earlier logged set${hiddenCount === 1 ? '' : 's'}`
                      : 'Hide earlier logged sets'}
                  >
                    <Ionicons
                      name={collapsed ? 'chevron-down' : 'chevron-up'}
                      size={13}
                      color={t.colors.textMuted}
                    />
                    <Text style={[styles.historyToggleText, live.historyToggleText]}>
                      {collapsed
                        ? `${hiddenCount} earlier set${hiddenCount === 1 ? '' : 's'} logged`
                        : 'Hide earlier sets'}
                    </Text>
                  </TouchableOpacity>
                )}
                {visible.map((s) => {
                  const i = loggedSets.indexOf(s);
                  return (
                    <AnimatedRow key={s.id ?? `row-${i}`}>
                      <LoggedSetRow
                        set={s}
                        units={units}
                        progressNum={countProgressSets(loggedSets.slice(0, i + 1))}
                        exerciseType={activeExerciseType}
                        loadSemantics={exercise?.loadSemantics || 'total'}
                        onEdit={openEditSet}
                        onDelete={openDeleteFromMenu}
                        isEditing={editingSet != null && editingSet.id === s.id}
                        editValue={editingSet != null && editingSet.id === s.id ? editValue : null}
                        onChangeEditValue={setEditValue}
                        onSaveEdit={handleSaveEditedSet}
                        onCancelEdit={closeEditSet}
                        onDeleteEdit={handleDeleteEditedSet}
                        saving={editingSet != null && editingSet.id === s.id ? saving : false}
                        weightStepKg={exercise?.incrementKg || exercise?.increment_kg
                          || defaultIncrement(s.weight || 0, units, exercise?.exerciseCategory || exercise?.exercise_category || 'compound')}
                      />
                    </AnimatedRow>
                  );
                })}
              </View>
            );
          })()}

          {/* R3 rebuild (docs/logger-rebuild-2026-07-12/BEHAVIOURAL-CONTRACT.md
              section 3): the Now card. ONE context line, priority-ordered:
              group-focus flash > warm-up > coach note - and the coach note is
              closable plain info (founder ruling 2026-07-12: the old chevron
              navigated to the exercise form guide). The old corner pencil (a
              one-way latch: open only, dead after its first tap) is replaced
              by the card's own honest note row. Beginner education left this
              card for the overflow's "How logging works".
              Warm-ups are no longer auto-suggested (recorded decision, B8):
              the chip auto-appeared on every exercise's first set and
              supersets don't make sense having warm-ups between paired
              exercises. Users who want a warm-up mark the set as Warm-up via
              the set-type line, or pull the ramp from exercise options. */}
          {(() => {
            const isWarmupSet = currentSet.setType === 'warmup';
            const currentPrescription = prescriptions[workingLogged] ?? null;
            // Founder device order 2026-08-17: the coach-note branch of the
            // context line is retired (see the retirement note by the old
            // PROVENANCE_COPY site near the top of this file). Only the
            // group-focus flash and the warm-up label remain - both
            // functional state, not explanation.
            const context = groupFocusMessage
              ? { kind: 'group', text: groupFocusMessage }
              : isWarmupSet
                ? {
                  kind: 'warmup',
                  text: warmupHintSeenRef.current
                    ? 'Warm-up - not counted in your totals.'
                    : "Warm-up - not counted in your totals. Light weight, easy reps; tap Log warm-up when you're ready to work.",
                }
                : null;

            // Warm-ups and working sets number independently, so filter
            // warm-ups out BEFORE indexing by workingLogged (D1 #2).
            const prevWorking = prevSets.filter(
              s => (s.setType ?? s.set_type ?? 'straight') !== 'warmup',
            );
            const prev = prevWorking[workingLogged];
            // Stage 11: the range label shows the CURRENT prescription's
            // repsBand - unchanged visual (still the honest range, not the
            // single repsTarget number), now resolver-derived.
            const range = currentPrescription
              ? (currentPrescription.repsBand.min === currentPrescription.repsBand.max
                ? `${currentPrescription.repsBand.min}`
                : `${currentPrescription.repsBand.min}-${currentPrescription.repsBand.max}`)
              : (routineExercise?.recommendedRepsMin != null
                ? `${routineExercise.recommendedRepsMin}-${routineExercise.recommendedRepsMax}`
                : null);
            let prefill = null;
            if (!isWarmupSet) {
              if (isDeloadWeek && currentPrescription?.provenance === PROVENANCE.SENIOR_RECOVERY_HOLD) {
                prefill = {
                  label: 'Recovery week -',
                  valueLabel: `${currentPrescription.weight}${units} x ${currentPrescription.repsTarget}`,
                  onUse: () => {
                    hapticsVocab.setLogged();
                    audit('workout.beatline.apply', { exerciseId: exercise?.id, setIndex: workingLogged });
                    setCurrentSet(s => ({ ...s, weight: String(currentPrescription.weight ?? 0), reps: currentPrescription.repsTarget ?? s.reps, isGhost: false }));
                  },
                };
              } else if (prev) {
                prefill = {
                  // "Last" alone read ambiguously mid-workout: it could mean
                  // the previous SET. This is the matching set from the most
                  // recent completed workout (getLastNWorkoutSets), so say so.
                  // Law A (design section 16): always the factual history,
                  // never the target - unmistakably labelled as history.
                  label: 'Last session:',
                  valueLabel: `${prev.weight}${units} x ${prev.actualReps}`,
                  onUse: () => {
                    hapticsVocab.setLogged();
                    audit('workout.beatline.apply', { exerciseId: exercise?.id, setIndex: workingLogged });
                    setCurrentSet(s => ({ ...s, weight: String(prev.weight ?? 0), reps: prev.actualReps ?? s.reps, isGhost: false }));
                  },
                };
              } else if (workingLogged === 0) {
                // Activation ruling (first-run coherence pass): the quiet
                // first-time line returns, rewritten. Phase 2B retired the
                // old one because it REPEATED the range the position line
                // already carries ("Set 1 of 6 - Working · 8-12 reps" then
                // "First time - Target 8-12 reps" on the founder's S22
                // shots). The repetition was the objection, not the row: a
                // user standing at a machine with an empty weight box and no
                // history has nothing to act on. This line never restates the
                // range string; it says, in words, how to choose the first
                // load and that the number is kept. Quiet (non-tappable)
                // variant - there is no history to apply, so there is nothing
                // to tap. Shown on the FIRST working set of the exercise only
                // (workingLogged === 0), never on a warm-up, and never
                // instead of the recovery-week or Last session rows above.
                const bandMax = currentPrescription
                  ? currentPrescription.repsBand.max
                  : (routineExercise?.recommendedRepsMax ?? null);
                prefill = {
                  label: 'First time on this lift.',
                  valueLabel: bandMax != null
                    ? `Pick a weight you could lift about ${bandMax} times, with a couple in reserve. It is saved for next time.`
                    : 'Pick a weight you could lift for the full rep range, with a couple in reserve. It is saved for next time.',
                };
              }
            }

            return (
              <NowCard
                positionLabel={orientationLabel}
                targetRangeLabel={!isWarmupSet && range ? `${range} reps` : null}
                onPressSetType={() => setShowSetTypePicker(true)}
                context={context}
                prefill={prefill}
                setValue={currentSet}
                onSetChange={handleCurrentSetChange}
                units={units}
                isWarmup={isWarmupSet}
                onSubmitComplete={handleCompleteSetPress}
                exerciseType={activeExerciseType}
                loadSemantics={exercise?.loadSemantics || 'total'}
                weightStepKg={exercise?.incrementKg || exercise?.increment_kg
                  || defaultIncrement(parseDecimalInput(currentSet.weight) || 0, units, exercise?.exerciseCategory || exercise?.exercise_category || 'compound')}
                recordLine={recordLine}
                noteText={noteText}
                onNoteChange={setNoteText}
                noteResetKey={`${currentExerciseIndex}-${loggedSets.length}`}
                flash={logFlash}
              />
            );
          })()}

          {/* R4 (D64): the between-sides banner. Appears only mid-pair
              (side one logged via the primary, side two pending on the same
              relabelled primary below). Cluster-banner visual class: bordered
              primaryBg card, proper gap rhythm - nothing touches. The rest
              timer above runs the between-sides pause for compounds;
              isolation gets the plain switch-sides prompt here instead. */}
          {perSide ? (
            <View style={[styles.clusterBanner, live.clusterBanner]}>
              <Text style={[styles.clusterTitle, live.clusterTitle]}>
                Side one logged
              </Text>
              <Text style={[styles.clusterReps, live.clusterReps]}>
                {`${perSide.reps} reps${perSide.weight ? ` @ ${perSide.weight}${units}` : ''} - same on your other side`}
              </Text>
              <Text style={[styles.sheetOptionDesc, live.sheetOptionDesc]}>
                {exercise?.compoundIsolation === 'compound'
                  ? 'Rest, switch sides, then tap Log other side.'
                  : "Switch sides when you're ready, then tap Log other side."}
              </Text>
              <TouchableOpacity
                onPress={cancelPerSide}
                style={[styles.clusterCancel, live.clusterCancel]}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Cancel this per-side set, nothing is logged"
              >
                <Text style={[styles.clusterCancelText, live.clusterCancelText]}>Cancel set</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Cluster banner: drives myo-rep / rest-pause mini-sets. */}
          {cluster ? (
            <View style={[styles.clusterBanner, live.clusterBanner]}>
              <Text style={[styles.clusterTitle, live.clusterTitle]}>
                {clusterLabel(cluster.setType)} cluster
              </Text>
              <Text style={[styles.clusterReps, live.clusterReps]}>
                {cluster.reps.join(' + ')} = {cluster.reps.reduce((a, n) => a + n, 0)} reps
                {cluster.weight ? ` @ ${cluster.weight}${units}` : ''}
              </Text>
              <View style={styles.clusterInputRow}>
                <TextInput
                  style={[styles.clusterInput, live.clusterInput]}
                  value={clusterReps}
                  onChangeText={setClusterReps}
                  placeholder="Mini-set reps"
                  placeholderTextColor={t.colors.textMuted}
                  accessibilityLabel="Mini-set reps"
                  keyboardType="number-pad"
                  returnKeyType="done"
                  onSubmitEditing={addMiniSet}
                />
                <Button
                  variant="tertiary"
                  fullWidth={false}
                  style={[styles.clusterAddBtn, live.clusterAddBtn]}
                  onPress={addMiniSet}
                  accessibilityLabel="Add mini-set"
                >
                  <Ionicons name="add" size={20} color={t.colors.primary} />
                  <Text style={[styles.clusterAddBtnText, live.clusterAddBtnText]}>Mini-set</Text>
                </Button>
              </View>
              <Button
                variant="primary"
                style={[styles.completeBtn, live.completeBtn]}
                onPress={finishCluster}
                disabled={saving}
                accessibilityLabel="Finish cluster and log the set"
              >
                <Ionicons name="checkmark-circle" size={20} color={t.colors.primary} />
                <Text style={[styles.completeBtnText, live.completeBtnText]}>Finish cluster</Text>
              </Button>
              <TouchableOpacity onPress={cancelCluster} style={[styles.clusterCancel, live.clusterCancel]} accessibilityLabel="Cancel cluster">
                <Text style={[styles.clusterCancelText, live.clusterCancelText]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Per-side (unilateral) guided set: moved off this inline banner
              and onto a proper WorkoutBottomSheet (see below, alongside the
              screen's other sheets), matching the rest of the logger's
              sheet/card idiom instead of the old plain-View banner. */}

          {/* D43 S3 (blueprint 3.7): the PRIMARY action moved to the
              bottom-pinned bar (thumb zone, stable position) and NOW STAYS
              there permanently -- it never leaves that slot, so the scroll
              no longer needs a promoted stand-in. The old "Log another set"
              outline button retires: extraSetArmed still exists (see
              handleCompleteSetPress) but arms itself the moment the
              ever-present primary is tapped past target, in the same
              gesture that logs the set, instead of a separate arm-then-log
              round trip. extraSetBtnPromoted/extraSetBtnPromotedText are
              reused below for the bar's new secondary advance action
              (Next exercise / Finish workout), not deleted. */}

          {/* C3 (re-anchored, logger redesign phase 2): the separate
              "Next exercise in a moment / Stay here" row is DELETED
              (founder ruling, Option B). The countdown is now a state of
              the single primary CTA in WorkoutBottomBar (countdownActive
              below); every existing cancellation trigger still routes
              through cancelAutoAdvance, and logging another set via the
              secondary "Log another set" action cancels it too. */}

          {/* Upcoming prescribed sets close the continuous sequence:
              read-only previews of the working sets still to come, so the
              active row visibly belongs to one list with a known end. */}
          {(() => {
            if (currentSet.setType === 'warmup') return null;
            const rows = [];
            for (let n = workingLogged + 2; n <= targetSets; n += 1) {
              // Campaign 20 Phase 2: upcoming previews read the SAME
              // resolver-derived prescriptions array as the NowCard range
              // (same visual, new source) - position n renders
              // prescriptions[n - 1].repsBand.
              const tgt = prescriptions[n - 1];
              const range = tgt
                ? (tgt.repsBand.min === tgt.repsBand.max ? `${tgt.repsBand.min}` : `${tgt.repsBand.min}-${tgt.repsBand.max}`)
                : (routineExercise?.recommendedRepsMin != null
                  ? `${routineExercise.recommendedRepsMin}-${routineExercise.recommendedRepsMax}`
                  : null);
              rows.push(
                <View key={`upcoming-${n}`} style={styles.upcomingSetRow}>
                  <Text style={[styles.upcomingSetNum, live.upcomingSetNum]}>{n}</Text>
                  <Text style={[styles.upcomingSetText, live.upcomingSetText]}>
                    {range ? `${range} reps` : `Set ${n}`}
                  </Text>
                </View>,
              );
            }
            return rows.length ? <View style={styles.upcomingSection}>{rows}</View> : null;
          })()}

          {/* Phase 2B: the rest strip + CTA live OUTSIDE this scroll and the
              bar already absorbs safeBottom - counting it here too created
              the dead gap on the founder's S22 shots. A step of breathing
              room is all the scroll needs. */}
          <View style={{ height: spacing.xl }} />
        </ScrollView>

        {/* A2 (audit CL-4): the primary action lives in a bottom-pinned bar,
            the one-handed thumb zone, at a stable position, instead of
            floating mid-scroll and swapping identity in the same pixels.
            Cluster flows (and the per-side flow, D9) keep their own
            in-card controls, so no bar then.
            insets.bottom IS required here: E15's VolyumeTabBar returns null
            while ActiveWorkout is focused (VolyumeTabBar.js), so nothing else
            absorbs the system inset and a flat spacing.md left Log set half
            behind the Android gesture pill (founder screenshot 2026-07-03).
            The earlier "no insets here" note (2026-07-02) described the stock
            always-visible tab bar and no longer holds. Math.max keeps the
            old padding on devices that report no bottom inset. */}
        {/* R3 rebuild: the stable-identity bar is its own component. Same
            pinned contract as before (nextExerciseButton.guard): the primary
            testID/onPress render first and unconditionally; the advance
            action is the additive sibling gated by the unchanged
            `targetComplete && !extraSetArmed` condition; the whole bar hides
            only mid-cluster (the cluster banner carries its own controls). */}
        {/* D87 gave the primary a trophy while a record was dialled in;
            D150 retires it. The record callout directly above the bar is
            the one place that says a PR is on, and Log set is an action,
            not an achievement. The label and its spoken twin are unchanged
            (R4/D64 same-string rule). */}
        {/* Phase 2B: the compact rest strip docks HERE, above the bottom
            bar and outside the workspace scroll - rest state is glanceable
            by the thumb without ever pushing the active set down the page
            (screenshot failure 2). RestTimer self-hides when idle.
            Founder device order 2026-08-18: the wrapper measures this whole
            bottom chrome and publishes the height so the PR toast can dock
            just ABOVE the rest bar's amber top line instead of covering the
            header. Measurement only - layout is unchanged (a plain
            full-width View in the same column). */}
        <View onLayout={handleBottomChromeLayout}>
        {/* Activation ruling (first-run coherence pass): the once-ever rest
            introduction sits directly above the strip it explains, inside the
            measured bottom chrome so the PR toast still docks clear of both.
            Gone on "Got it" or the moment the rest ends. */}
        {showRestHint && restTimerActive ? (
          <HintCaption
            text="Rest started because you logged a set. Adjust with the buttons, or skip it."
            onDismiss={dismissRestHint}
          />
        ) : null}
        <RestTimer />

        {cluster ? null : (
          <WorkoutBottomBar
            primaryLabel={
              perSide ? 'Log other side'
                : currentSet.setType === 'warmup' ? 'Log warm-up'
                : (isClusterType(currentSet.setType) && !(exercise && unilateralExercises.has(exercise.id))) ? 'Start cluster' : 'Log set'
            }
            onPrimary={handleCompleteSetPress}
            saving={saving}
            safeBottom={safeBottom}
            advance={(targetComplete && !extraSetArmed && !perSide)
              ? (isLastExercise
                ? { label: 'Finish workout', onPress: handleFinishWorkout, testID: 'volyume-btn-finish-primary' }
                : { label: 'Next exercise', onPress: handleNextExercise, testID: 'volyume-btn-next-exercise' })
              : null}
            countdownActive={autoAdvanceArmed && targetComplete && !extraSetArmed}
            onExtraSet={armExtraSet}
            reduceMotion={!!reduceMotion}
            safeBottom={safeBottom}
          />
        )}
        </View>

        {/* Exercise Picker Modal, shared by Add and Swap (see pickerMode) */}
        <ExercisePickerModal
          visible={showExercisePicker}
          onClose={closeExercisePicker}
          onSelect={handlePickerSelect}
          actionLabel={pickerMode === 'swap' ? 'Swap in' : 'Add to workout'}
        />

        {/* Superset / giant-set heads-up modal, appears once per group when the
            user lands on a grouped exercise. Educational for first-timers,
            and gives a clear out (unlink or swap) if they're not set up
            for it today. Renders one numbered row per member, so a pair shows
            two and a giant set 3+. F-13 (docs/final-certification-2026-09-05/
            07-FINDINGS.md, evidence A4): a CIRCUIT forks on the group's
            stored kind, never its size - own title, own body, no Unlink. */}
        <Modal
          visible={!!supersetHeadsUp}
          transparent
          animationType={reduceMotion ? 'none' : 'fade'}
          onRequestClose={() => setSupersetHeadsUp(null)}
        >
          {supersetHeadsUp ? (
          <View style={[styles.supOverlay, live.supOverlay]}>
            <View style={[styles.supSheet, live.supSheet]}>
              <ScrollView
                style={styles.supSheetScroll}
                contentContainerStyle={[styles.supSheetContent, { paddingBottom: Math.max(spacing.xxl, insets.bottom + spacing.lg) }]}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.supIconRow}>
                  <Ionicons name={headsUpIsCircuit ? 'repeat' : 'link'} size={24} color={t.colors.primary} />
                  <Text style={[styles.supTitle, live.supTitle]}>
                    {headsUpIsCircuit
                      ? 'Circuit coming up'
                      : (headsUpStations > 2 ? 'Giant set coming up' : 'Superset coming up')}
                  </Text>
                </View>
                <Text style={[styles.supSubtitle, live.supSubtitle]}>
                  {headsUpIsCircuit
                    ? headsUpCircuitBody
                    : (headsUpStations > 2
                      ? `${supersetHeadsUp.memberNames.length} exercises done back-to-back with no rest between them.`
                      : 'Two exercises done back-to-back with no rest between them.')}
                </Text>

                <Card surface="surface2" radius="md" padding="md" style={[styles.supPairCard, live.supPairCard]}>
                  {(supersetHeadsUp?.memberNames ?? []).map((memberName, memberIdx) => (
                    <React.Fragment key={`${memberIdx}-${memberName}`}>
                      {memberIdx > 0 && <View style={[styles.supPairConnector, live.supPairConnector]} />}
                      <View style={styles.supPairRow}>
                        <View style={[styles.supPairChip, live.supPairChip]}><Text style={[styles.supPairChipText, live.supPairChipText]}>{memberIdx + 1}</Text></View>
                        <Text style={[styles.supPairName, live.supPairName]} numberOfLines={2}>
                          {memberName}
                        </Text>
                      </View>
                    </React.Fragment>
                  ))}
                </Card>

                <View style={styles.supSteps}>
                  <View style={styles.supStep}>
                    <Text style={[styles.supStepNum, live.supStepNum]}>1</Text>
                    <Text style={[styles.supStepText, live.supStepText]}>Set up every station now if you can.</Text>
                  </View>
                  <View style={styles.supStep}>
                    <Text style={[styles.supStepNum, live.supStepNum]}>2</Text>
                    <Text style={[styles.supStepText, live.supStepText]}>
                      {headsUpIsCircuit ? 'Do all reps at the first station.' : 'Do all reps of the first exercise.'}
                    </Text>
                  </View>
                  <View style={styles.supStep}>
                    <Text style={[styles.supStepNum, live.supStepNum]}>3</Text>
                    <Text style={[styles.supStepText, live.supStepText]}>
                      {headsUpIsCircuit ? 'Move straight to the next station. No rest between stations.' : 'Move straight to the next. No rest between.'}
                    </Text>
                  </View>
                  <View style={styles.supStep}>
                    <Text style={[styles.supStepNum, live.supStepNum]}>4</Text>
                    <Text style={[styles.supStepText, live.supStepText]}>
                      {headsUpIsCircuit
                        ? `After the last station, rest${headsUpRestWords ? ` ${headsUpRestWords}` : ''}, then start the next round.`
                        : 'After the last one, rest the full rest period, then repeat.'}
                    </Text>
                  </View>
                </View>

                <Text style={[styles.supTip, live.supTip]}>
                  {headsUpIsCircuit
                    ? 'Tip: if a station is taken, carry on with the next one and come back to it. The circuit itself is changed in your plan.'
                    : "Tip: if you can't grab every station right now, unlink and do them as normal sets."}
                </Text>

                <Button
                  variant="primary"
                  style={[styles.supPrimaryBtn, live.supPrimaryBtn]}
                  onPress={() => setSupersetHeadsUp(null)}
                  title="Got it, start"
                  textStyle={[styles.supPrimaryBtnText, live.supPrimaryBtnText]}
                />

                <View style={styles.supSecondaryRow}>
                  {/* F-13 (evidence A4): NO Unlink on a circuit. Unlinking a
                      circuit mid-session would leave the athlete doing
                      straight sets against a plan that still says circuit;
                      a circuit is changed in the plan, not broken apart
                      here. A superset or giant set keeps the action. */}
                  {headsUpIsCircuit ? null : (
                  <Button
                    variant="outline"
                    style={[styles.supSecondaryBtn, live.supSecondaryBtn]}
                    onPress={() => {
                      handleTogglePair(); // unpair
                      setSupersetHeadsUp(null);
                    }}
                    accessibilityLabel="Unlink the superset"
                  >
                    <Ionicons name="unlink" size={14} color={t.colors.textSecondary} />
                    <Text style={[styles.supSecondaryBtnText, live.supSecondaryBtnText]}>Unlink</Text>
                  </Button>
                  )}
                  <Button
                    variant="outline"
                    style={[styles.supSecondaryBtn, live.supSecondaryBtn]}
                    onPress={() => {
                      setSupersetHeadsUp(null);
                      handleOpenSwap();
                    }}
                    accessibilityLabel="Swap exercise"
                  >
                    <Ionicons name="swap-horizontal" size={14} color={t.colors.textSecondary} />
                    <Text style={[styles.supSecondaryBtnText, live.supSecondaryBtnText]}>Swap exercise</Text>
                  </Button>
                </View>
              </ScrollView>
            </View>
          </View>
          ) : null}
        </Modal>

        {/* D9 unilateral (per-side) FULL walkthrough - shown only the very
            first time the suggestion ever fires for this user
            (unilateralWalkthroughSeenRef / UNILATERAL_WALKTHROUGH_SEEN_KEY);
            every later unilateral exercise gets a quick appAlert confirm
            only (see the suggestion effect above). Copies the superset
            heads-up's shape and styles exactly (icon, title, numbered
            steps, tip, primary CTA) - same tone, same reused pattern, not a
            new one. "No, log as normal" still counts as answered: the
            choice sticks per exercise either way, so the suggestion never
            repeats for THIS exercise regardless of which button is tapped. */}
        <Modal
          visible={!!unilateralSuggest}
          transparent
          animationType={reduceMotion ? 'none' : 'fade'}
          onRequestClose={() => setUnilateralSuggest(null)}
        >
          {unilateralSuggest ? (() => {
            const isCompound = exercise?.compoundIsolation === 'compound';
            const answerAndClose = (turnOn) => {
              const id = unilateralSuggest.exerciseId;
              setUnilateralSuggest(null);
              unilateralWalkthroughSeenRef.current = true;
              AsyncStorage.setItem(UNILATERAL_WALKTHROUGH_SEEN_KEY, 'true').catch(() => {});
              handleUnilateralAnswer(id, turnOn);
            };
            return (
          <View style={[styles.supOverlay, live.supOverlay]}>
            <View style={[styles.supSheet, live.supSheet]}>
              <ScrollView
                style={styles.supSheetScroll}
                contentContainerStyle={[styles.supSheetContent, { paddingBottom: Math.max(spacing.xxl, insets.bottom + spacing.lg) }]}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.supIconRow}>
                  <Ionicons name="repeat" size={24} color={t.colors.primary} />
                  <Text style={[styles.supTitle, live.supTitle]}>Log this one side at a time?</Text>
                </View>
                <Text style={[styles.supSubtitle, live.supSubtitle]}>
                  {unilateralSuggest.exerciseName} is usually trained one side at a time.
                </Text>

                <Card surface="surface2" radius="md" padding="md" style={[styles.supPairCard, live.supPairCard]}>
                  <View style={styles.supPairRow}>
                    <View style={[styles.supPairChip, live.supPairChip]}><Text style={[styles.supPairChipText, live.supPairChipText]}>1</Text></View>
                    <Text style={[styles.supPairName, live.supPairName]} numberOfLines={2}>First side</Text>
                  </View>
                  <View style={[styles.supPairConnector, live.supPairConnector]} />
                  <View style={styles.supPairRow}>
                    <View style={[styles.supPairChip, live.supPairChip]}><Text style={[styles.supPairChipText, live.supPairChipText]}>2</Text></View>
                    <Text style={[styles.supPairName, live.supPairName]} numberOfLines={2}>Other side</Text>
                  </View>
                </Card>

                <View style={styles.supSteps}>
                  <View style={styles.supStep}>
                    <Text style={[styles.supStepNum, live.supStepNum]}>1</Text>
                    <Text style={[styles.supStepText, live.supStepText]}>Do your first side, then tap Log set.</Text>
                  </View>
                  <View style={styles.supStep}>
                    <Text style={[styles.supStepNum, live.supStepNum]}>2</Text>
                    <Text style={[styles.supStepText, live.supStepText]}>
                      {isCompound
                        ? 'Half your normal rest, then do the same reps on your other side.'
                        : 'Switch sides when you\'re ready, no forced timer, then do the same reps.'}
                    </Text>
                  </View>
                  <View style={styles.supStep}>
                    <Text style={[styles.supStepNum, live.supStepNum]}>3</Text>
                    <Text style={[styles.supStepText, live.supStepText]}>
                      Tap Log other side - the same button, one more tap.</Text>
                  </View>
                  <View style={styles.supStep}>
                    <Text style={[styles.supStepNum, live.supStepNum]}>4</Text>
                    <Text style={[styles.supStepText, live.supStepText]}>
                      {isCompound
                        ? 'It logs as one set. Rest as normal, then your next set.'
                        : 'It logs as one set. Rest as normal once both sides are done.'}
                    </Text>
                  </View>
                </View>

                <Text style={[styles.supTip, live.supTip]}>
                  Tip: change your mind any time from this exercise's options menu.
                </Text>

                <Button
                  variant="primary"
                  style={[styles.supPrimaryBtn, live.supPrimaryBtn]}
                  onPress={() => answerAndClose(true)}
                  title="Yes, log per side"
                  textStyle={[styles.supPrimaryBtnText, live.supPrimaryBtnText]}
                />

                <View style={styles.supSecondaryRow}>
                  <Button
                    variant="outline"
                    style={[styles.supSecondaryBtn, live.supSecondaryBtn]}
                    onPress={() => answerAndClose(false)}
                    accessibilityLabel="No, log as normal"
                  >
                    <Text style={[styles.supSecondaryBtnText, live.supSecondaryBtnText]}>No, log as normal</Text>
                  </Button>
                </View>
              </ScrollView>
            </View>
          </View>
            );
          })() : null}
        </Modal>

        {/* Stale workout recovery modal */}
        <Modal visible={showStaleModal} transparent animationType={reduceMotion ? 'none' : 'fade'} onRequestClose={() => setShowStaleModal(false)}>
          {showStaleModal ? (
          <View style={[styles.staleOverlay, live.staleOverlay]}>
            <View style={[styles.staleSheet, live.staleSheet]}>
              <Ionicons name="time-outline" size={32} color={t.colors.warning} style={{ marginBottom: spacing.md }} />
              <Text style={[styles.staleTitle, live.staleTitle]}>Resume workout?</Text>
              <Text style={[styles.staleBody, live.staleBody]}>
                This workout has been inactive for a while. What would you like to do?
              </Text>
              <Button
                variant="primary"
                style={[styles.staleResume, live.staleResume]}
                onPress={() => { updateLastActivity(); setShowStaleModal(false); }}
                title="Resume"
                textStyle={[styles.staleResumeText, live.staleResumeText]}
                accessibilityLabel="Resume workout"
              />
              <Button
                variant="secondary"
                style={[styles.staleFinish, live.staleFinish]}
                onPress={() => { setShowStaleModal(false); handleFinishWorkout(); }}
                title="Finish workout"
                textStyle={[styles.staleFinishText, live.staleFinishText]}
              />
              <TouchableOpacity style={styles.staleDiscard} accessibilityRole="button" accessibilityLabel="Discard workout" onPress={() => {
                appAlert('Discard workout?', 'All logged sets will be lost.', [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Discard',
                    style: 'destructive',
                    onPress: () => discardWorkout('ActiveWorkoutScreen.discardStale'),
                  },
                ]);
              }}>
                <Text style={[styles.staleDiscardText, live.staleDiscardText]}>Discard</Text>
              </TouchableOpacity>
            </View>
          </View>
          ) : null}
        </Modal>




        {/* R4 (D64): the per-side confirm sheet is RETIRED. Side one is
            captured by the "Log set" tap itself (startPerSide), and side two
            commits from the same permanent bar primary, relabelled "Log
            other side". What renders here is only the compact BETWEEN-SIDES
            banner - same visual class as the cluster banner (proper gap
            rhythm, no touching controls), never a sheet over the inputs.
            Both sides use the SAME prescribed reps (perSide.reps, D54 -
            there is only ever one number). Cancel discards the pending
            pair; nothing has been written yet. */}

        {/* Set Type Picker Bottom Sheet */}
        <WorkoutBottomSheet
          visible={showSetTypePicker}
          onClose={() => setShowSetTypePicker(false)}
          accessibilityLabel="Set type"
        >
          {showSetTypePicker ? (
            <>
              <Text style={[styles.sheetTitle, live.sheetTitle]}>Set type</Text>
              <Text style={[styles.sheetExplainer, live.sheetExplainer]}>
                Pick how this set was done. Working sets and intensity techniques count towards your training; warm-ups do not. This helps Volyume read the session correctly.
              </Text>
              {/* P9: the radios group so TalkBack announces position context
                  ("2 of 5") while each row keeps its own label and state. */}
              <View accessibilityRole="radiogroup">
              {SET_TYPE_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.sheetOption, live.sheetOption]}
                  onPress={() => {
                    hapticsVocab.selection();
                    setCurrentSet(s => ({ ...s, setType: opt.value }));
                    setShowSetTypePicker(false);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: currentSet.setType === opt.value }}
                  accessibilityLabel={`${opt.label}. ${opt.description}`}
                >
                  <View style={styles.sheetOptionText}>
                    <Text style={[styles.sheetOptionLabel, live.sheetOptionLabel, currentSet.setType === opt.value && [styles.sheetOptionLabelActive, live.sheetOptionLabelActive]]}>
                      {opt.label}
                    </Text>
                    <Text style={[styles.sheetOptionDesc, live.sheetOptionDesc]}>{opt.description}</Text>
                  </View>
                  {currentSet.setType === opt.value && (
                    <Ionicons name="checkmark" size={18} color={t.colors.primary} />
                  )}
                </TouchableOpacity>
              ))}
              </View>
            </>
          ) : null}
        </WorkoutBottomSheet>

        {/* B8: warm-up set helper. Opens ONLY from the overflow menu (the
            recorded no-auto-suggest decision stands, pull, never push).
            Choosing one suggested set
            loads it into the set entry as a Warm-up via the same setType
            machinery as the manual picker. Nothing is logged for the user. */}
        <WorkoutBottomSheet
          visible={showWarmupRamp}
          onClose={() => setShowWarmupRamp(false)}
          accessibilityLabel="Warm-up sets"
        >
          {showWarmupRamp ? (
            <>
              <Text style={[styles.sheetTitle, live.sheetTitle]}>Warm-up sets</Text>
              {(() => {
                // Working weight: the entry while it holds a working set;
                // the anchor while the entry holds a ramp row (so reopening
                // mid-ramp shows the SAME ramp, not one computed from the
                // warm-up weight).
                const entryWeight = parseDecimalInput(currentSet.weight);
                const entryIsWorking = (currentSet.setType ?? 'straight') !== 'warmup';
                const working = (entryIsWorking && Number.isFinite(entryWeight) && entryWeight > 0)
                  ? entryWeight
                  : rampAnchorRef.current;
                const isBarbellLift = BARBELL_EQUIPMENT.test(exercise?.equipment || '');
                const barKg = barWeight || DEFAULT_BAR_KG;
                if (!Number.isFinite(working) || working <= 0) {
                  // C5-P13-04 (D96): this branch used to be a dead end -
                  // "Enter your working weight first, then come back" - aimed
                  // squarely at the one user who most needs a warm-up: the
                  // first-timer, whose weight IS blank, on the zero-history
                  // path. B8 stands (warm-ups are still never suggested
                  // automatically, and nothing auto-appears); this is the
                  // pulled sheet answering honestly instead of refusing. For
                  // a barbell lift the empty bar is a warm-up that needs no
                  // working weight, and it is the same first row warmupRamp
                  // itself produces, so nothing new is invented.
                  return (
                    <>
                      <Text style={[styles.sheetExplainer, live.sheetExplainer]}>
                        {isBarbellLift
                          ? `No working weight yet. Start with the empty bar, then set your working weight and come back for the rest of the ramp. Warm-ups are saved but not counted in your working-set target.`
                          : `Set your working weight on the set card and your warm-up sets appear here. Warm-ups are saved but not counted in your working-set target.`}
                      </Text>
                      {isBarbellLift ? (
                        <TouchableOpacity
                          style={[styles.sheetOption, live.sheetOption]}
                          onPress={() => {
                            hapticsVocab.selection();
                            setGhostSet(null);
                            setCurrentSet(s => ({ ...s, weight: barKg, reps: 10, setType: 'warmup', isGhost: false }));
                            setShowWarmupRamp(false);
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={`Empty bar, ${barKg} ${units}, 10 reps. Load as a warm-up set.`}
                        >
                          <View style={styles.overflowOptionRow}>
                            <Ionicons name="flame-outline" size={16} color={t.colors.warning} />
                            <Text style={[styles.sheetOptionLabel, live.sheetOptionLabel]}>{`${barKg} ${units} x 10`}</Text>
                          </View>
                          <Text style={[styles.rampBarTag, live.rampBarTag]}>Empty bar</Text>
                        </TouchableOpacity>
                      ) : null}
                    </>
                  );
                }
                const rows = warmupRamp(working, {
                  isBarbell: isBarbellLift,
                  barKg,
                });
                if (rows.length === 0) {
                  return (
                    <Text style={[styles.sheetExplainer, live.sheetExplainer]}>
                      {`This is light enough to start at ${working} ${units}. You can begin with your working set today.`}
                    </Text>
                  );
                }
                return (
                  <>
                    <Text style={[styles.sheetExplainer, live.sheetExplainer]}>
                      {`Working up to ${working} ${units}. Choose a warm-up set to load it, then tap Log warm-up. Warm-ups are saved but not counted in your working-set target.`}
                    </Text>
                    {rows.map((row) => (
                      <TouchableOpacity
                        key={`${row.weight}-${row.reps}`}
                        style={[styles.sheetOption, live.sheetOption]}
                        onPress={() => {
                          hapticsVocab.selection();
                          setGhostSet(null);
                          setCurrentSet(s => ({ ...s, weight: row.weight, reps: row.reps, setType: 'warmup', isGhost: false }));
                          setShowWarmupRamp(false);
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={`${row.isBar ? 'Empty bar' : `${row.weight} ${units}`}, ${row.reps} reps. Load as a warm-up set.`}
                      >
                        <View style={styles.overflowOptionRow}>
                          <Ionicons name="flame-outline" size={16} color={t.colors.warning} />
                          <Text style={[styles.sheetOptionLabel, live.sheetOptionLabel]}>{`${row.weight} ${units} x ${row.reps}`}</Text>
                        </View>
                        {row.isBar ? <Text style={[styles.rampBarTag, live.rampBarTag]}>Empty bar</Text> : null}
                      </TouchableOpacity>
                    ))}
                  </>
                );
              })()}
            </>
          ) : null}
        </WorkoutBottomSheet>

        {/* Exercise overflow sheet (COMP-001): secondary and destructive
            exercise actions, off the permanent surface. Remove keeps its
            own confirm alert inside handleRemoveExercise. */}
        <WorkoutBottomSheet
          visible={showOverflow}
          onClose={() => setShowOverflow(false)}
          accessibilityLabel="Exercise options"
        >
          {showOverflow ? (
            <>
              <Text style={[styles.sheetTitle, live.sheetTitle]}>{exercise?.name}</Text>
              <TouchableOpacity
                style={[styles.sheetOption, live.sheetOption]}
                onPress={() => { setShowOverflow(false); handleOpenSwap(); }}
                accessibilityRole="button"
                accessibilityLabel="Swap exercise"
              >
                <View style={styles.overflowOptionRow}>
                  <Ionicons name="swap-horizontal" size={18} color={t.colors.textSecondary} />
                  <Text style={[styles.sheetOptionLabel, live.sheetOptionLabel]}>Swap exercise</Text>
                </View>
              </TouchableOpacity>
              {/* CC29 (section 17): "this movement is a problem today" -
                  substitute now via the ordinary swap sheet, and the option
                  to note a temporary change through the standard How you
                  train flow. No pain scales, no per-set questions. */}
              <TouchableOpacity
                style={[styles.sheetOption, live.sheetOption]}
                onPress={() => {
                  setShowOverflow(false);
                  // CC33 close-out: the words a person actually uses.
                  // Banked research: "I can't do this" is a first-class
                  // answer (digest pattern 5), the sharpest complaint in
                  // the whole competitive teardown was a GOWOD review
                  // asking for exactly that option ("doesn't allow for
                  // the option of 'can't get into the pose'"), and
                  // Peloton's stated principle is never to make the user
                  // translate a modification themselves. "Work around
                  // this" was our internal vocabulary on a user's button.
                  appAlert(
                    exercise?.name ? `Can't do ${exercise.name}?` : "Can't do this exercise?",
                    'Volyume will swap it for another exercise that works the same muscle group. Choose whether that is just for today, or from now on.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Just for today', onPress: () => { workAroundSwapRef.current = true; handleOpenSwap(); } },
                      {
                        text: 'From now on',
                        onPress: () => {
                          // T2-11: this used to ALSO open the swap sheet
                          // while navigating with no params, so the sheet
                          // opened orphaned underneath and Injuries & limitations
                          // landed cold. It navigates only now, pre-filled
                          // from this exercise's own driving conflict
                          // (workAroundPreselect above); "Just swap it"
                          // above opens the sheet with workAroundSwapRef
                          // set, so the swap records cause 'constraint'.
                          try {
                            navigation.navigate('HowYouTrain', workAroundPreselect ? { preselect: workAroundPreselect } : undefined);
                          } catch (_e) { /* best effort */ }
                        },
                      },
                    ],
                  );
                }}
                accessibilityRole="button"
                accessibilityLabel={exercise?.name ? `I can't do ${exercise.name} today` : "I can't do this exercise today"}
              >
                <View style={styles.overflowOptionRow}>
                  <Ionicons name="body-outline" size={18} color={t.colors.textSecondary} />
                  <Text style={[styles.sheetOptionLabel, live.sheetOptionLabel]}>{"I can't do this"}</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sheetOption, live.sheetOption]}
                onPress={() => {
                  setShowOverflow(false);
                  openAddExercisePicker();
                }}
                accessibilityRole="button"
                accessibilityLabel="Add exercise to workout"
              >
                <View style={styles.overflowOptionRow}>
                  <Ionicons name="add-circle-outline" size={18} color={t.colors.textSecondary} />
                  <Text style={[styles.sheetOptionLabel, live.sheetOptionLabel]}>Add exercise</Text>
                </View>
              </TouchableOpacity>
              {/* R3 rebuild (founder ruling 2026-07-12): beginner education
                  left the set card for this named row - the card carries the
                  set, never a lesson. Same glossary copy, on demand. */}
              <TouchableOpacity
                style={[styles.sheetOption, live.sheetOption]}
                onPress={() => {
                  setShowOverflow(false);
                  appAlert(
                    'How logging works',
                    `${GLOSSARY.rep} ${GLOSSARY.set} Enter weight and reps, then tap Log set when done. Use exercise options for form tips, warm-ups, swaps and session settings.`,
                  );
                }}
                accessibilityRole="button"
                accessibilityLabel="How logging works"
              >
                <View style={styles.overflowOptionRow}>
                  <Ionicons name="help-circle-outline" size={18} color={t.colors.textSecondary} />
                  <Text style={[styles.sheetOptionLabel, live.sheetOptionLabel]}>How logging works</Text>
                </View>
              </TouchableOpacity>
              {/* D43 S3 (blueprint 3.8, overflow diet): Move exercise
                  up/down DELETED -- the reorder sheet below is now the ONE
                  reorder path (superseding D32's "additive" framing, which
                  kept both). handleMoveExercise/canMoveUp/canMoveDown are
                  removed as genuinely dead code (grepped: no other caller).
                  Re-pinned in ActiveWorkoutScreen.reorder.guard.test.js
                  (D43 S3). */}
              {workoutExercises.length > 1 && (
              <TouchableOpacity
                style={[styles.sheetOption, live.sheetOption]}
                onPress={() => { setShowOverflow(false); setShowReorderSheet(true); }}
                accessibilityRole="button"
                accessibilityLabel="Reorder exercises"
              >
                <View style={styles.overflowOptionRow}>
                  <Ionicons name="reorder-three-outline" size={18} color={t.colors.textSecondary} />
                  <Text style={[styles.sheetOptionLabel, live.sheetOptionLabel]}>Reorder exercises</Text>
                </View>
              </TouchableOpacity>
              )}
              {/* R3 rebuild: notes live on the Now card's own note row
                  (the corner pencil is deleted). "Exercise info" row DELETED --
                  tapping the exercise title (exerciseNameTap above, same
                  setShowExecution(true) handler) is the one entry point now. */}
              {/* D9: per-exercise "log per side" preference. Shown only for
                  metadata-flagged unilateral exercises (exercise.laterality,
                  exerciseMetadata.js deriveLaterality) - this is the manual
                  override/escape hatch alongside the one-time suggestion
                  prompt above; flipping it here never re-shows that prompt
                  (it also marks the exercise "asked", same as answering the
                  prompt directly). */}
              {exercise?.laterality === 'unilateral' && (
              <TouchableOpacity
                style={[styles.sheetOption, live.sheetOption]}
                onPress={() => {
                  setShowOverflow(false);
                  const exerciseId = exercise.id;
                  const nextOn = !unilateralExercises.has(exerciseId);
                  handleUnilateralAnswer(exerciseId, nextOn);
                }}
                accessibilityRole="button"
                accessibilityLabel={unilateralExercises.has(exercise.id) ? 'Stop logging this exercise per side' : 'Log this exercise per side'}
              >
                <View style={styles.overflowOptionRow}>
                  <Ionicons
                    name={unilateralExercises.has(exercise.id) ? 'repeat' : 'repeat-outline'}
                    size={18}
                    color={unilateralExercises.has(exercise.id) ? t.colors.primary : t.colors.textSecondary}
                  />
                  <View style={styles.sheetOptionText}>
                    <Text style={[styles.sheetOptionLabel, live.sheetOptionLabel]}>{unilateralExercises.has(exercise.id) ? 'Logging per side' : 'Log per side'}</Text>
                    <Text style={[styles.sheetOptionDesc, live.sheetOptionDesc]}>One side, then the other. Still counts as one set.</Text>
                  </View>
                </View>
              </TouchableOpacity>
              )}
              {/* B8 gym basics. The warm-up helper lives here in the overflow,
                  off the permanent surface (COMP-001), and strictly
                  pull: the warm-up helper NEVER auto-appears (recorded decision
                  at the set-entry card). */}
              {/* Hidden mid-cluster: a ramp-row tap rewrites the entry's
                  weight AND set type, and finishCluster commits from the
                  live entry, the one-tap path would mislog the whole
                  cluster as a light warm-up. */}
              {!cluster && (!exercise?.exerciseType || exercise.exerciseType === 'weight_reps' || exercise.exerciseType === 'weighted_bodyweight') && (
              <TouchableOpacity
                style={[styles.sheetOption, live.sheetOption]}
                onPress={() => {
                  setShowOverflow(false);
                  const w = parseDecimalInput(currentSet.weight);
                  if ((currentSet.setType ?? 'straight') !== 'warmup' && Number.isFinite(w) && w > 0) {
                    rampAnchorRef.current = w;
                  }
                  setShowWarmupRamp(true);
                }}
                accessibilityRole="button"
                accessibilityLabel="Warm-up sets"
              >
                <View style={styles.overflowOptionRow}>
                  <Ionicons name="flame-outline" size={18} color={t.colors.textSecondary} />
                  <View style={styles.sheetOptionText}>
                    <Text style={[styles.sheetOptionLabel, live.sheetOptionLabel]}>Warm-up sets</Text>
                    <Text style={[styles.sheetOptionDesc, live.sheetOptionDesc]}>Suggested light sets up to today's working weight.</Text>
                  </View>
                </View>
              </TouchableOpacity>
              )}
              {!isLastExercise && (
              <TouchableOpacity
                style={[styles.sheetOption, live.sheetOption]}
                onPress={() => { setShowOverflow(false); handleTogglePair(); }}
                accessibilityRole="button"
                accessibilityLabel={isPairedWithNext ? 'Unpair from next exercise' : 'Pair as superset with next exercise'}
              >
                <View style={styles.overflowOptionRow}>
                  <Ionicons name={isPairedWithNext ? 'link' : 'link-outline'} size={18} color={isPairedWithNext ? t.colors.primary : t.colors.textSecondary} />
                  <Text style={[styles.sheetOptionLabel, live.sheetOptionLabel]}>{isPairedWithNext ? 'Unpair superset' : 'Pair as superset'}</Text>
                </View>
              </TouchableOpacity>
              )}
              {!timeCrunchActive && workoutExercises.length > currentExerciseIndex + 1 && (
              <TouchableOpacity
                style={[styles.sheetOption, live.sheetOption]}
                onPress={() => { setShowOverflow(false); handleTimeCrunch(); }}
                accessibilityRole="button"
                accessibilityLabel="Shorten session"
              >
                <View style={styles.overflowOptionRow}>
                  <Ionicons name="timer-outline" size={18} color={t.colors.textSecondary} />
                  <View style={styles.sheetOptionText}>
                    <Text style={[styles.sheetOptionLabel, live.sheetOptionLabel]}>Shorten session</Text>
                    <Text style={[styles.sheetOptionDesc, live.sheetOptionDesc]}>Shortens the rest of today's session to fit the time you have left. Undo any time.</Text>
                  </View>
                </View>
              </TouchableOpacity>
              )}
              {timeCrunchActive && (
              <TouchableOpacity
                style={[styles.sheetOption, live.sheetOption]}
                onPress={() => { setShowOverflow(false); handleRevertTimeCrunch(); }}
                accessibilityRole="button"
                accessibilityLabel="Undo shortening"
              >
                <View style={styles.overflowOptionRow}>
                  <Ionicons name="refresh-outline" size={18} color={t.colors.textSecondary} />
                  <View style={styles.sheetOptionText}>
                    <Text style={[styles.sheetOptionLabel, live.sheetOptionLabel]}>Undo shortening</Text>
                    {!!timeCrunchMsg && <Text style={[styles.sheetOptionDesc, live.sheetOptionDesc]}>{timeCrunchMsg}</Text>}
                  </View>
                </View>
              </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.sheetOption, live.sheetOption]}
                onPress={() => { setShowOverflow(false); handleRemoveExercise(); }}
                accessibilityRole="button"
                accessibilityLabel="Remove exercise from workout"
              >
                <View style={styles.overflowOptionRow}>
                  <Ionicons name="trash-outline" size={18} color={t.colors.error} />
                  <Text style={[styles.sheetOptionLabel, live.sheetOptionLabel, { color: t.colors.error }]}>Remove exercise</Text>
                </View>
              </TouchableOpacity>
            </>
          ) : null}
        </WorkoutBottomSheet>

        {/* Reorder sheet (D32, 2026-07-10, campaign item 20): the whole
            workout as a draggable list, opened from the overflow menu
            above. NO in-view drag on the main single-exercise view (that
            view is a deliberate focus design, and in-view drag mid-training
            is ergonomically risky); this sheet is the purpose-built surface
            instead. Block-aware: a superset/giant-set group moves and lands
            whole (src/lib/reorder.js). Every row also carries its own
            up/down chevrons as the accessible move path (drag's handle is
            hidden from screen readers, see DragReorderList's own header
            comment) -- this sheet's chevrons are ADDITIONAL to, and
            distinct from, the Move exercise up/down overflow entries above
            (those still move only the current exercise one step; these move
            any row in the sheet). Both persist through the same
            setWorkoutExercises -> _persistActiveWorkout flow every other
            order-affecting action uses; completed/in-progress sets are
            untouched (order metadata only), and currentExerciseIndex is
            re-pointed at the same exercise after either path. */}
        <WorkoutBottomSheet
          visible={showReorderSheet}
          onClose={() => setShowReorderSheet(false)}
          accessibilityLabel="Reorder exercises"
          scrollRef={reorderSheetScroll.scrollRef}
          onScroll={reorderSheetScroll.onScroll}
          onContentSizeChange={reorderSheetScroll.onContentSizeChange}
        >
          {showReorderSheet ? (
            <>
              <Text style={[styles.sheetTitle, live.sheetTitle]}>Reorder exercises</Text>
              <Text style={[styles.sheetExplainer, live.sheetExplainer]}>
                Hold and drag the handle, or use the arrows. Exercises in a superset or giant set move together.
              </Text>
              <DragReorderList
                items={workoutExercises}
                keyExtractor={keyForWorkoutExercise}
                getGroupId={(e) => e.supersetGroupId ?? null}
                onReorder={handleReorderWorkoutExercises}
                handleAccessibilityLabel={(e) => `Drag to reorder ${e.exercise?.name ?? 'exercise'}`}
                gap={spacing.sm}
                scrollRef={reorderSheetScroll.scrollRef}
                scrollOffset={reorderSheetScroll.scrollOffset}
                renderRow={({ item, index }) => {
                  const gid = item.supersetGroupId ?? null;
                  // Same 2-vs-3+ naming the heads-up modal uses (item 21):
                  // "Superset" for a pair, "Giant set" for three or more.
                  const groupSize = gid != null
                    ? workoutExercises.filter((e) => (e.supersetGroupId ?? null) === gid).length
                    : 0;
                  const rowIsCircuit = item.routineExercise?.groupKind === 'circuit';
                  const canUp = swapAdjacentBlocks(workoutExercises, index, 'up', (e) => e.supersetGroupId ?? null) !== workoutExercises;
                  const canDown = swapAdjacentBlocks(workoutExercises, index, 'down', (e) => e.supersetGroupId ?? null) !== workoutExercises;
                  const setsLogged = item.sets?.length ?? 0;
                  return (
                    <View style={[styles.reorderSheetRow, live.reorderSheetRow]}>
                      <View style={styles.reorderSheetRowInfo}>
                        <Text style={[styles.reorderSheetRowName, live.reorderSheetRowName]} numberOfLines={1}>
                          {item.exercise?.name ?? 'Exercise'}
                        </Text>
                        <Text style={[styles.reorderSheetRowMeta, live.reorderSheetRowMeta]}>
                          {setsLogged} set{setsLogged !== 1 ? 's' : ''} logged
                        </Text>
                        {gid != null && (
                          // F-13 (evidence A5): a circuit station is named by
                          // its group kind here too, with the same repeat icon
                          // the live chip and the builder use.
                          <View style={[styles.reorderSheetSupersetChip, live.reorderSheetSupersetChip]}>
                            <Ionicons name={rowIsCircuit ? 'repeat' : 'link'} size={11} color={t.colors.primary} />
                            <Text style={[styles.reorderSheetSupersetChipText, live.reorderSheetSupersetChipText]}>{rowIsCircuit ? 'Circuit' : (groupSize > 2 ? 'Giant set' : 'Superset')}</Text>
                          </View>
                        )}
                      </View>
                      <View style={styles.reorderSheetChevrons}>
                        <TouchableOpacity
                          onPress={() => handleSheetMoveExercise(index, 'up')}
                          disabled={!canUp}
                          style={[styles.reorderSheetChevronBtn, live.reorderSheetChevronBtn, !canUp && styles.reorderSheetChevronBtnDisabled]}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          accessibilityRole="button"
                          accessibilityState={{ disabled: !canUp }}
                          accessibilityLabel={`Move ${item.exercise?.name ?? 'exercise'} up`}
                        >
                          <Ionicons name="chevron-up" size={16} color={canUp ? t.colors.textSecondary : t.colors.border} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleSheetMoveExercise(index, 'down')}
                          disabled={!canDown}
                          style={[styles.reorderSheetChevronBtn, live.reorderSheetChevronBtn, !canDown && styles.reorderSheetChevronBtnDisabled]}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          accessibilityRole="button"
                          accessibilityState={{ disabled: !canDown }}
                          accessibilityLabel={`Move ${item.exercise?.name ?? 'exercise'} down`}
                        >
                          <Ionicons name="chevron-down" size={16} color={canDown ? t.colors.textSecondary : t.colors.border} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                }}
              />
            </>
          ) : null}
        </WorkoutBottomSheet>

        {/* Info / Form Bottom Sheet */}
        <WorkoutBottomSheet
          visible={showExecution}
          onClose={() => setShowExecution(false)}
          accessibilityLabel="Exercise info"
        >
          {showExecution ? (
            <>
              <Text style={[styles.sheetTitle, live.sheetTitle]}>{exercise?.name}</Text>
              {/* D151: metadata as "Back · Cable" (display names, middle
                  dot), never the raw enum with a hyphen. */}
              {exercise?.primaryMuscle ? (
                <Text style={[styles.infoMuscle, live.infoMuscle]}>
                  {[
                    MUSCLE_DISPLAY_NAMES[exercise.primaryMuscle] ?? ((exercise.primaryMuscle || '').charAt(0).toUpperCase() + (exercise.primaryMuscle || '').slice(1).replace('_', ' ')),
                    equipmentDisplayLabel(exercise),
                  ].filter(Boolean).join(' · ')}
                </Text>
              ) : null}
              {routineExercise?.recommendedSets ? (
                <View style={styles.infoTargetRow}>
                  <Ionicons name="checkmark-circle-outline" size={14} color={t.colors.primary} />
                  <Text style={[styles.infoTarget, live.infoTarget]}>
                    {adjustedSetCount || routineExercise.recommendedSets} sets of {routineExercise.recommendedRepsMin}-{routineExercise.recommendedRepsMax} reps
                  </Text>
                </View>
              ) : null}

              {/* COMP-015: Adjusted today, the reason, the plain-words signals,
                  and the one-tap revert. Shown for any visible adjustment; the
                  revert button only when there's a real set change to undo. */}
              {sessionAdjustment?.show ? (
                <View style={[styles.adjustedSection, live.adjustedSection]}>
                  <View style={styles.adjustedHeader}>
                    <Ionicons name="pulse-outline" size={14} color={t.colors.primary} />
                    <Text style={[styles.adjustedTitle, live.adjustedTitle]}>Adjusted today</Text>
                  </View>
                  <Text style={[styles.adjustedReason, live.adjustedReason]}>{sessionAdjustment.reasonText}</Text>
                  {sessionAdjustment.signals?.lastTrainedAt ? (
                    <Text style={[styles.adjustedSignal, live.adjustedSignal]}>
                      Last trained {new Date(sessionAdjustment.signals.lastTrainedAt).toLocaleDateString(undefined, { weekday: 'long' })}.
                    </Text>
                  ) : null}
                  {sessionAdjustment.setDelta !== 0 ? (
                    <TouchableOpacity
                      style={styles.adjustedRevertBtn}
                      onPress={() => { revertSessionAdjustment(exercise.id); setShowExecution(false); }}
                      accessibilityRole="button"
                      accessibilityLabel={`Use planned sets instead. ${routineExercise?.recommendedSets ?? ''} sets as written.`}
                    >
                      <Ionicons name="arrow-undo-outline" size={15} color={t.colors.primary} />
                      <Text style={[styles.adjustedRevertText, live.adjustedRevertText]}>Use planned sets instead</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : null}

              {/* B2: Eased for today, the intent-sheet answer's downward-only
                  tweak, both written whys, and a one-tap session-wide dismiss.
                  Suggestions on the targets display only; the plan and logged
                  sets are never changed. */}
              {readinessReduces ? (
                <View style={[styles.adjustedSection, live.adjustedSection]}>
                  <View style={styles.adjustedHeader}>
                    <Ionicons name="pulse-outline" size={14} color={t.colors.primary} />
                    <Text style={[styles.adjustedTitle, live.adjustedTitle]}>Eased for today</Text>
                  </View>
                  <Text style={[styles.adjustedReason, live.adjustedReason]}>{readinessTweak.whySets}</Text>
                  {readinessTweak.whyLoad ? (
                    <Text style={[styles.adjustedSignal, live.adjustedSignal]}>{readinessTweak.whyLoad}</Text>
                  ) : null}
                  <TouchableOpacity
                    style={styles.adjustedRevertBtn}
                    onPress={() => { dismissReadinessTweak(); setShowExecution(false); }}
                    accessibilityRole="button"
                    accessibilityLabel={`${readinessRestoreLabel}. Applies to the whole session.`}
                  >
                    <Ionicons name="arrow-undo-outline" size={15} color={t.colors.primary} />
                    <Text style={[styles.adjustedRevertText, live.adjustedRevertText]}>{readinessRestoreLabel}</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {/* D151: structured instructions from the corpus (Setup /
                  Execution / Watch), the first layer readable in seconds.
                  A routine's own notes for this exercise render above them
                  when present; a custom exercise falls back to its notes or
                  one calm line. */}
              {(() => {
                const instructions = instructionsFor(exercise);
                const routineNotes = routineExercise?.notes || null;
                return (
                  <View style={styles.infoInstructions}>
                    {routineNotes ? (
                      <View style={styles.infoInstruction}>
                        <Text style={[styles.infoNotesLabel, live.infoNotesLabel]}>Plan note</Text>
                        <Text style={[styles.infoNotes, live.infoNotes]}>{routineNotes}</Text>
                      </View>
                    ) : null}
                    {instructions ? (
                      <>
                        <View style={styles.infoInstruction}>
                          <Text style={[styles.infoNotesLabel, live.infoNotesLabel]}>Setup</Text>
                          <Text style={[styles.infoNotes, live.infoNotes]}>{instructions.setup}</Text>
                        </View>
                        <View style={styles.infoInstruction}>
                          <Text style={[styles.infoNotesLabel, live.infoNotesLabel]}>Execution</Text>
                          <Text style={[styles.infoNotes, live.infoNotes]}>{instructions.execution}</Text>
                        </View>
                        {instructions.watch ? (
                          <View style={styles.infoInstruction}>
                            <Text style={[styles.infoNotesLabel, live.infoNotesLabel]}>Watch</Text>
                            <Text style={[styles.infoNotes, live.infoNotes]}>{instructions.watch}</Text>
                          </View>
                        ) : null}
                      </>
                    ) : (
                      <View style={styles.infoInstruction}>
                        <Text style={[styles.infoNotesLabel, live.infoNotesLabel]}>How to do it</Text>
                        <Text style={[styles.infoNotes, live.infoNotes]}>
                          {exercise?.notes || 'No instructions for this exercise yet. Start light, move with control and stop a couple of reps before you truly cannot do any more.'}
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })()}
            </>
          ) : null}
        </WorkoutBottomSheet>

        {/* Exercise Swap Modal */}
        <Modal visible={showSwapModal} animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={() => { workAroundSwapRef.current = false; setSwapStylePoolKey(null); setSwapStyleShowAll(false); setShowSwapModal(false); }}>
          {showSwapModal ? (
            <>
          {/* Nested provider: a core RN <Modal> presents in its own window on
              iOS and would otherwise read top:0, jamming the swap list against
              the status bar / Dynamic Island. */}
          <SafeAreaProvider>
          <SafeAreaView style={[styles.swapSafe, live.swapSafe]} edges={['top', 'bottom']}>
            <View style={[styles.swapHeader, live.swapHeader]}>
              <View style={styles.swapHeaderCopy}>
                <Text style={[styles.swapTitle, live.swapTitle]}>Swap exercise</Text>
                <Text style={[styles.swapSubtitle, live.swapSubtitle]} numberOfLines={1}>
                  {exercise?.name}
                </Text>
              </View>
              <TouchableOpacity style={[styles.swapCloseBtn, live.swapCloseBtn]} onPress={() => { workAroundSwapRef.current = false; setSwapStylePoolKey(null); setSwapStyleShowAll(false); setShowSwapModal(false); }} accessibilityRole="button" accessibilityLabel="Close swap">
                <Ionicons name="close" size={20} color={t.colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.swapNote, live.swapNote]}>Choose a close match for today. Your plan is not changed, and sets you log count towards the new exercise's own muscle in your weekly volume.</Text>
            {/* T2-08 (D112 R5, closes audit T2-08): the ranked list narrows
                silently against the user's capability rules (rankPersonalised
                -> isEligibleExercise); this says so instead, visibility only -
                ranking and filtering are unchanged. */}
            {swapNarrowedCount > 0 ? (
              <Text style={[styles.swapNote, live.swapNote]}>
                {swapNarrowedCount} movement{swapNarrowedCount === 1 ? '' : 's'} left out for your limitations.
              </Text>
            ) : null}
            {/* EL-11: user intent outranks inference - the pool is a default,
                never a hidden restriction, so "Show all exercises" is always
                one tap away while it applies. */}
            {swapStylePoolKey && !swapStyleShowAll ? (
              <View style={[styles.swapNote, live.swapNote, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
                <Text style={[styles.swapNote, live.swapNote, { marginBottom: 0 }]}>
                  Showing {styleLabelFor(swapStylePoolKey)} exercises
                </Text>
                <TouchableOpacity onPress={() => handleOpenSwap({ relaxStyle: true })} accessibilityRole="button" accessibilityLabel="Show all exercises">
                  <Text style={[styles.swapNote, live.swapNote, { marginBottom: 0, color: t.colors.primary, fontFamily: fontFamily.bold }]}>Show all exercises</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            <FlashList
              data={swapCandidates}
              keyExtractor={item => item.exercise.id}
              contentContainerStyle={styles.swapListContent}
              ItemSeparatorComponent={() => <View style={styles.swapItemGap} />}
              renderItem={({ item }) => (
                <TouchableOpacity style={[styles.swapItem, live.swapItem]} onPress={() => handleConfirmSwap(item.exercise)} accessibilityRole="button" accessibilityLabel={`Swap in ${item.exercise.name}`}>
                  <View style={[styles.swapItemIcon, live.swapItemIcon]}>
                    <Ionicons name="swap-horizontal" size={16} color={t.colors.textSecondary} />
                  </View>
                  <View style={styles.swapItemCopy}>
                    <Text style={[styles.swapItemName, live.swapItemName]}>{item.exercise.name}</Text>
                    {/* C9 Work 5: why this one sits here, in one short line,
                        and only when it is genuinely true of this user. */}
                    {item.personal?.tag ? (
                      <Text style={[styles.swapItemTag, live.swapItemTag]}>{item.personal.tag}</Text>
                    ) : null}
                    <Text style={[styles.swapItemReason, live.swapItemReason]}>{item.reason}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={iconSize.sm} color={t.colors.textMuted} />
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={styles.swapEmpty}>
                  <Text style={[styles.swapEmptyTitle, live.swapEmptyTitle]}>
                    {swapNarrowedCount > 0 ? 'No close matches within your limitations.' : 'No close matches yet'}
                  </Text>
                  <Text style={[styles.swapEmptyText, live.swapEmptyText]}>Search the full library instead.</Text>
                </View>
              }
              ListFooterComponent={
                // Escape hatch from the ranked suggestions: search the whole
                // library or add your own. Always present, so it works whether
                // or not there were candidates.
                <TouchableOpacity
                  style={[styles.swapBrowseBtn, live.swapBrowseBtn]}
                  onPress={() => {
                    // F-13 / A15: leaving the ranked slate for the FULL
                    // library is a deliberate choice from outside the style
                    // pool, so the pool no longer applies to what comes
                    // back. Without this the swap was still filed
                    // causeOverride 'style' ("staying inside the pool is
                    // not preference") and dropped from preference
                    // learning, which is the opposite of what the user did.
                    setSwapStyleShowAll(true);
                    setShowSwapModal(false);
                    setPickerMode('swap');
                    setShowExercisePicker(true);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Search exercise library"
                >
                  <Ionicons name="search" size={16} color={t.colors.textSecondary} />
                  <Text style={[styles.swapBrowseText, live.swapBrowseText]}>Search exercise library</Text>
                </TouchableOpacity>
              }
            />
          </SafeAreaView>
          </SafeAreaProvider>
            </>
          ) : null}
        </Modal>
        {/* Discard Workout Modal */}
        <Modal visible={showDiscardModal} transparent animationType={reduceMotion ? 'none' : 'fade'} onRequestClose={() => setShowDiscardModal(false)}>
          {showDiscardModal ? (
          <View style={[styles.discardOverlay, live.discardOverlay]}>
            <View style={[styles.discardSheet, live.discardSheet]}>
              <Text style={[styles.discardTitle, live.discardTitle]}>Discard workout?</Text>
              <Text style={[styles.discardBody, live.discardBody]}>
                This will delete the current workout session. Your plan will not advance.
              </Text>
              <Button
                variant="primary"
                style={[styles.keepTrainingBtn, live.keepTrainingBtn]}
                onPress={() => setShowDiscardModal(false)}
                accessibilityLabel="Keep training"
              >
                <Text style={[styles.keepTrainingBtnText, live.keepTrainingBtnText]}>Keep training</Text>
              </Button>
              <TouchableOpacity
                style={styles.discardConfirmBtn}
                accessibilityRole="button"
                accessibilityLabel="Discard workout"
                onPress={() => discardWorkout('ActiveWorkoutScreen.discardModal')}
              >
                <Text style={[styles.discardConfirmBtnText, live.discardConfirmBtnText]}>Discard workout</Text>
              </TouchableOpacity>
            </View>
          </View>
          ) : null}
        </Modal>

        {/* D43 S4: the edit/delete logged-set MODAL is removed. Editing is
            now in-place inside LoggedSetRow (see the "This workout" list
            above) -- tapping a row expands it into an inline editor using
            the same SetEntry component, Save/Cancel inline, no modal
            round-trip. handleSaveEditedSet / handleDeleteEditedSet /
            editingSet / editValue are unchanged (still the single source of
            truth the row reads/writes), so the persistence + PR-reeval path
            is byte-identical to before -- only the presentation moved. */}

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// D43 S1: EmptyExerciseView moved to src/components/workout/
// EmptyExerciseView.js (imported above as a default export); it was never
// exported from this screen (a private in-file component), so there is no
// re-export to keep here -- the import above is the only call site.

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  headerSide: { width: workoutLoggerSize.headerSide, alignItems: 'flex-start', justifyContent: 'center' },
  // CL-6.2: a real 44pt frame under the top-corner controls (plus hitSlop);
  // purely transparent, no visual change.
  headerTapTarget: { minWidth: workoutLoggerSize.headerButtonMin, minHeight: workoutLoggerSize.headerButtonMin, alignItems: 'center', justifyContent: 'center' },
  headerSideRight: { width: workoutLoggerSize.headerSide, alignItems: 'flex-end', justifyContent: 'center' },
  // R2-2 (2026-07-11): the contained quiet icon-button chrome shared by the
  // header X and (by convergence) the "..." options button - 44dp square,
  // surface fill, subtle border, the logger's one small-surface radius.md.
  // The X, elapsed block and Finish now bookend the bar as one family.
  headerIconBtn: {
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  // R5 (D66): Button variant="secondary" owns the fill/ink. R2-2: the
  // radius and height now match the X chrome (headerIconBtn) so left and
  // right bookend the bar as one family; only the width floor stays local.
  headerFinishButton: {
    minWidth: workoutLoggerSize.finishButtonMinWidth,
    minHeight: workoutLoggerSize.headerButtonMin,
    borderRadius: radius.md,
  },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  // R2-2: the elapsed timer is a designed stat block - overline micro-label
  // (RestTimer's REST label grammar) above the type.num tabular numerals.
  headerTimerBlock: { alignItems: 'center' },
  headerTimerLabel: { ...type.overline, color: colors.textMuted },
  headerTimerValueRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  // R5 (D66): the elapsed timer is DATA, not brand decoration - Food's
  // rule is textPrimary for the value that is the content, tabular via
  // type.num; brand amber in the header competed with the single filled
  // Log set CTA for attention.
  timerText: { ...type.num('title'), color: colors.textPrimary },
  // T2-06/T2-20 (D112 R5): quiet standalone lines (swapNote's exact register
  // - caption + textMuted), never a banner. Own horizontal padding since,
  // unlike starterBanner/nextTimeBanner, these have no bordered container
  // of their own to inset them.
  omittedSessionNote: { ...type.caption, color: colors.textMuted, paddingHorizontal: spacing.lg, paddingTop: spacing.xs, paddingBottom: spacing.xxs },
  sideCarveNote: { ...type.caption, color: colors.textMuted, paddingHorizontal: spacing.lg, paddingTop: spacing.xs, paddingBottom: spacing.xxs },
  starterBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    backgroundColor: withAlpha(colors.primary, alpha.ghost),
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  starterBannerText: { ...type.bodySm, flex: 1, color: colors.textSecondary },
  inlineActionPill: {
    // D43 S5: was a hand-rolled 44; workoutLoggerSize.primaryActionMinHeight
    // is the same value from the token table (touchTarget.minimum), no
    // visual change.
    minHeight: workoutLoggerSize.primaryActionMinHeight,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: withAlpha(colors.primary, alpha.edge),
  },
  inlineActionPillText: { ...type.caption, color: colors.textPrimary },
  exerciseNav: { borderBottomWidth: 1, borderBottomColor: colors.border, maxHeight: workoutLoggerSize.exerciseNavMaxHeight },
  exerciseNavContent: { paddingHorizontal: spacing.lg, paddingVertical: spacing.xs, gap: spacing.sm, alignItems: 'center' },
  navTab: { minHeight: workoutLoggerSize.exerciseTabMinHeight, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.full, backgroundColor: colors.surface2 },
  navTabActive: { backgroundColor: colors.primaryBg },
  navTabText: { ...type.label, color: colors.textSecondary },
  navTabTextActive: { color: colors.primary },
  navTabBadge: { width: workoutLoggerSize.exerciseTabBadge, height: workoutLoggerSize.exerciseTabBadge, borderRadius: circle(workoutLoggerSize.exerciseTabBadge), backgroundColor: colors.primaryFill, alignItems: 'center', justifyContent: 'center' },
  navTabBadgeText: { ...type.caption, color: colors.onPrimary, fontSize: fontSize.micro },
  scroll: { flex: 1 },
  // R5 (D66): paddingHorizontal md -> lg so the working content shares the
  // same 16px edge as the header, exercise nav and the Food standard
  // (FOOD-DESIGN-STANDARD.md section 1); the tighter vertical rhythm
  // (sm gaps) is a deliberate density property of the logger and stays.
  scrollContent: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, paddingTop: spacing.sm, gap: spacing.sm },
  // D43 S2: the "N notes" accordion rail (notesRail/notesChip/notesChipText/
  // notesExpanded) is retired -- StatusStrip (src/components/workout/
  // StatusStrip.js) owns the equivalent chip-row styling now.
  exerciseHeader: { gap: spacing.xs },
  // C5-P13-01: the session effort line, quiet caption weight so it orients
  // without competing with the exercise title above it.
  // R2-4 (2026-07-11): a consistent row height (the options button's own
  // 44dp) with centre alignment so the exercise title and the "..." options
  // button share one row and align on their centres at any title length.
  exerciseNameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, minHeight: workoutLoggerSize.overflowButton },
  // D43 S3: wraps the exercise name so the whole title is the "Exercise
  // info" tap target (relocated off the overflow sheet); flex: 1 lives here
  // now, exerciseName keeps its own flex: 1 so numberOfLines={2} still wraps
  // correctly inside it.
  // Founder order 2026-08-17 (two device notes): (1) the tap target is a ROW
  // now so the details chevron hugs the name's end; (2) the name and the
  // options dots sit perfectly on one centre line - the tap row centres its
  // children on the same 44dp axis the dots box uses, and the name drops
  // Android's extra font padding, which floated its ink a couple of dp high
  // beside the icon.
  exerciseNameTap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    minHeight: workoutLoggerSize.overflowButton,
  },
  // Founder order 2026-08-17 (Campaign 27): the exercise name steps down one
  // notch, title (17) -> bodyStrong (16, same medium weight) - "ever so
  // slightly smaller", calmer against the plain header dots. flexShrink (not
  // flex: 1) so the details chevron hugs the name's end instead of parking
  // at the row's far edge; minWidth: 0 keeps two-line wrap working.
  // Founder device order 2026-08-18: the active exercise name steps down
  // once more (bodyStrong 16 -> label 13, semibold) - it was overpowering
  // the outline strip; layout position and weight keep its title role.
  exerciseName: { flexShrink: 1, minWidth: 0, ...type.label, fontWeight: fontWeight.semibold, color: colors.textPrimary, includeFontPadding: false },
  exerciseNameChevron: { marginTop: 1 },
  swapSafe: { flex: 1, backgroundColor: colors.background },
  swapHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  swapHeaderCopy: { flex: 1, minWidth: 0, gap: spacing.xxs },
  swapTitle: { ...type.title, color: colors.textPrimary },
  swapSubtitle: { ...type.caption, color: colors.textMuted },
  swapCloseBtn: {
    width: workoutLoggerSize.headerButtonMin,
    height: workoutLoggerSize.headerButtonMin,
    alignItems: 'center',
    justifyContent: 'center',
    // R2 compliance: icon button -> radius.md.
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  swapNote: { ...type.caption, color: colors.textMuted, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xs },
  swapListContent: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xl },
  swapItemGap: { height: spacing.sm },
  swapItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: workoutLoggerSize.primaryActionMinHeight,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  swapItemIcon: {
    width: 32,
    height: 32,
    // R2 compliance: small icon container -> radius.md.
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface2,
    flexShrink: 0,
  },
  swapItemCopy: { flex: 1, minWidth: 0 },
  swapItemName: { ...type.label, color: colors.textPrimary, marginBottom: spacing.xxs },
  swapItemReason: { ...type.caption, color: colors.textMuted, lineHeight: 16 },
  // C9: the personal reason, in the app's accent, above the structural one.
  swapItemTag: { ...type.caption, color: colors.primary, lineHeight: 16 },
  swapBrowseBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, marginTop: spacing.md, minHeight: workoutLoggerSize.primaryActionMinHeight, paddingVertical: spacing.sm, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderSubtle, backgroundColor: colors.surface },
  swapBrowseText: { ...type.label, color: colors.textPrimary },
  swapEmpty: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.xs },
  swapEmptyTitle: { ...type.label, color: colors.textPrimary },
  swapEmptyText: { ...type.caption, color: colors.textMuted },
  // D43 S2: setEntryCard now sits on the house Card (radius lg, padding lg,
  // set via the Card props at the call site) instead of the old bespoke
  // radius.md/6px-padding card. This style only carries the gap between the
  // card's internal rows plus the warm-up/flash colour states below.
  setEntryCard: { gap: spacing.xs },
  setEntryCardWarmup: { borderColor: colors.warning, backgroundColor: colors.warningBg || colors.surface },
  // Short amber flash on the card border to ack a successful Log set tap.
  // Border width stays at 1 so the card doesn't shift its 2px layout for the
  // 700 ms flash, just the colour swaps.
  setEntryCardFlash: { borderColor: colors.primary },
  // D43 S2: the note-pencil corner affordance (blueprint 3.4).
  // R2-3 (2026-07-11): now sits in the shared contained icon-button family
  // (surface fill, subtle border, small-surface radius.md) with a proper
  // >=44dp hit target via hitSlop, so the card's right rail reads
  // intentionally instead of a bare glyph clashing with the rest bar above.
  // orientationRow gains paddingRight below to clear this corner button.
  noteCornerBtn: {
    position: 'absolute', top: spacing.sm, right: spacing.sm, zIndex: 1,
    alignItems: 'center', justifyContent: 'center',
    padding: spacing.xs,
    backgroundColor: colors.surface2,
    // radius.md, not lg: this is the note pencil, an icon-only corner button
    // sized by its 4px padding. It belongs to the logger's icon-button family
    // (pinned in loggerHeaderCohesion.guard), and at ~26dp the card radius
    // would read as a circle.
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  warmupBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  warmupBannerText: { ...type.caption, color: colors.warning },
  // COMP-001 card header: three lines replace the old chip stack.
  // D43 S5: paddingVertical was a hand-rolled 2px; spacing.xxs is the exact
  // same value from the token table (no visual change).
  // R2-3: paddingRight reserves the top-right corner for noteCornerBtn so the
  // set-type chevron never sits under the contained note button.
  orientationRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.xxs, paddingRight: spacing.xl },
  orientationText: { ...type.label, color: colors.textSecondary },
  // D43 S2: the target reps range folded into orientationText's own Text
  // node (was a separate targetRow/targetText line, retired).
  orientationTarget: { ...type.label, color: colors.textMuted },
  beatLine: { alignSelf: 'stretch', minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.xs, paddingVertical: 0 },
  // R5 (D66): raw fontSize+lineHeight pair moved onto the house bodySm role
  // (the token that absorbs exactly this hand-rolled combination, theme.js).
  beatLineLabel: { flex: 1, minWidth: 0, ...type.bodySm, color: colors.textSecondary },
  beatLineValue: { ...type.bodyStrong, color: colors.textPrimary, fontVariant: ['tabular-nums'] },
  beatLineGlyph: { ...type.bodyStrong, color: colors.primary },
  beatLineCue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    paddingHorizontal: spacing.xs,
    minHeight: 26,
    // R5 (D66): radius.sm -> radius.md, the logger's one small-surface
    // radius (RestTimer container, noteInput, completeBtn, inlineActionPill
    // all sit on md; pills stay radius.full, cards radius.lg).
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  beatLineCueText: { ...type.caption, color: colors.textSecondary },
  coachLine: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs2 },
  coachLineText: { ...type.bodySm, flex: 1, color: colors.primary },
  noteInput: { backgroundColor: colors.surface2, borderRadius: radius.md, padding: spacing.md, fontSize: fontSize.sm, color: colors.textPrimary, borderWidth: 1, borderColor: colors.border, minHeight: 60 },
  // Log set is the primary action on this screen, so it reads as a filled
  // amber button with a clear label rather than a tinted outline. Dark label
  // for contrast on amber (white on amber fails WCAG). Warm-ups stay visually
  // secondary via the tinted-outline override below.
  completeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderRadius: radius.lg, minHeight: workoutLoggerSize.primaryActionMinHeight, paddingVertical: spacing.xs, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  btnDisabled: { opacity: 0.5 },
  completeBtnText: { ...type.bodyStrong, color: colors.textPrimary },
  completeBtnWarmup: { backgroundColor: colors.warningBg || colors.surface, borderWidth: 1, borderColor: colors.warning },
  completeBtnTextWarmup: { color: colors.warning },
  // Text button below the primary CTA (COMP-001): quiet, 44pt target.
  extraSetBtn: { alignItems: 'center', justifyContent: 'center', minHeight: workoutLoggerSize.primaryActionMinHeight },
  extraSetBtnText: { ...type.label, color: colors.textSecondary },
  // A2: originally "Log another set" promoted into the old primary slot as
  // an OUTLINE button, not filled, keeping the CTA the single filled-amber
  // object on screen. D43 S3: that scroll button retired; this outline
  // treatment (name kept -- still exactly the style it was) is now reused
  // for the bottom bar's secondary advance action (Next exercise / Finish
  // workout), which sits BESIDE the still-filled primary for the same
  // "one filled object" contrast.
  extraSetBtnPromoted: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.xs, borderRadius: radius.md, minHeight: workoutLoggerSize.primaryActionMinHeight, paddingVertical: spacing.xs,
    borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface2,
  },
  extraSetBtnPromotedText: { ...type.label, color: colors.textPrimary },
  // C3: quiet inline row for the auto-advance countdown, sits under the
  // "Log another set" button so it reads as one calm sentence with a
  // tappable ending, not another banner competing for attention.
  autoAdvanceRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: spacing.xs,
  },
  autoAdvanceRowText: { ...type.caption, color: colors.textMuted },
  autoAdvanceRowDot: { ...type.caption, color: colors.textMuted },
  autoAdvanceRowActionBtn: {
    minHeight: workoutLoggerSize.primaryActionMinHeight,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: withAlpha(colors.primary, alpha.edge),
  },
  autoAdvanceRowAction: { ...type.captionStrong, color: colors.textPrimary },
  // A2: the pinned action bar. Sits above the home indicator; the scroll's
  // bottom spacer keeps content clear of it.
  bottomBar: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  // D43 S3: the row that lets the logging primary and the (conditional)
  // advance action sit side by side, each taking half the bar via flex: 1
  // set at the call site (so a lone primary, the common case, still fills
  // the whole width exactly as it did before this row wrapper existed).
  bottomBarRow: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.sm },
  clusterBanner: {
    borderWidth: 1, borderColor: withAlpha(colors.primary, 0.502), borderRadius: radius.lg,
    backgroundColor: colors.primaryBg, padding: spacing.md, gap: spacing.sm, marginBottom: spacing.sm,
  },
  clusterTitle: { ...type.label, color: colors.primary },
  // R2 numerals sweep: the cluster rep tally is data -> tabular figures.
  clusterReps: { ...type.num('bodyStrong'), color: colors.textPrimary },
  clusterInputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  clusterInput: {
    flex: 1, backgroundColor: colors.background, color: colors.textPrimary,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, ...type.body,
  },
  clusterAddBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    borderWidth: 1, borderColor: withAlpha(colors.primary, 0.502), borderRadius: radius.lg,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    // Explicit transparent: the Button `tertiary` variant this now renders
    // as (components/Button.js) fills with colors.primaryBg by default;
    // this outlined-only look (border, no fill) is a deliberate quieter
    // treatment for the mini-set add action, so it must override that.
    backgroundColor: 'transparent',
  },
  clusterAddBtnText: { ...type.label, color: colors.primary },
  // R2 compliance (2026-07-11): control -> the logger's one small-surface radius.md.
  clusterCancel: { alignSelf: 'center', alignItems: 'center', justifyContent: 'center', minHeight: workoutLoggerSize.primaryActionMinHeight, paddingHorizontal: spacing.lg, borderRadius: radius.md, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  clusterCancelText: { ...type.label, color: colors.textPrimary },
  // Founder device order 2026-08-17: the rounded-square container around
  // the exercise-header "..." is retired - it made the overflow look almost
  // as important as the exercise name. The button keeps its full 44dp
  // TARGET (workoutLoggerSize.overflowButton = touchTarget.minimum) but
  // draws nothing at rest: just the muted dots, dimmed while pressed via
  // the TouchableOpacity's own feedback.
  overflowBtn: {
    width: workoutLoggerSize.overflowButton,
    height: workoutLoggerSize.overflowButton,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // C5-P13-03: the one-time hinted state. The button widens to fit the
  // label rather than cropping it inside the fixed square, and returns to
  // the plain square the moment the cue retires.
  overflowBtnHinted: { width: 'auto', paddingHorizontal: spacing.sm },
  overflowGlyphRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  overflowHintLabel: { ...type.captionStrong, color: colors.textSecondary },
  overflowOptionRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  supersetChip: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs,
    // R2 compliance: chip container -> radius.md (standard section 4).
    backgroundColor: colors.primaryBg, borderRadius: radius.md,
    marginTop: spacing.xs,
  },
  supersetChipText: { ...type.captionStrong, color: colors.primary },
  // F-13 (evidence A8): the one short line under the circuit chip when
  // this station is more than a round behind the circuit.
  circuitMissedLine: { ...type.caption, color: colors.textSecondary, marginTop: spacing.xxs },
  loggedSection: { gap: spacing.xs2 },
  loggedTitle: { ...type.captionStrong, color: colors.textMuted },
  // Upcoming prescribed sets: quiet read-only LINES closing the continuous
  // sequence - phase 2B retired the dashed bordered cards (an unperformed
  // future set must never carry the visual mass of the active one).
  upcomingSection: { gap: 0, marginTop: spacing.xxs },
  upcomingSetRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs2,
    minHeight: 26,
    paddingHorizontal: spacing.sm,
  },
  upcomingSetNum: { ...type.num('caption'), color: colors.textMuted, minWidth: 22, textAlign: 'center' },
  upcomingSetText: { ...type.caption, color: colors.textMuted },
  // Phase 2B: the fold line for earlier completed sets (active-set
  // stability). One quiet row, constant height whatever it hides.
  historyToggle: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    minHeight: 28,
    paddingHorizontal: spacing.sm,
  },
  historyToggleText: { ...type.caption, color: colors.textMuted },
  // D43 S1: loggedSetRow/loggedSetRowWarmup/loggedSetTextWarmup/setNumBadge/
  // setNumText/loggedSetText/loggedEst1RM (LoggedSetRow-exclusive) and
  // emptyView/emptyContent/emptyTitle/emptySubtitle/addFirstBtn/
  // addFirstBtnText (EmptyExerciseView-exclusive) moved verbatim to
  // src/components/workout/LoggedSetRow.js and .../EmptyExerciseView.js --
  // no other render in this screen used them, so nothing stays behind.
  sheetTitle: { ...type.title, color: colors.textPrimary, marginBottom: spacing.sm },
  sheetExplainer: { ...type.bodySm, color: colors.textSecondary, marginBottom: spacing.lg },
  sheetScroll: { flexShrink: 1, minHeight: 0 },
  sheetScrollBody: { paddingBottom: spacing.xs },
  sheetOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: workoutLoggerSize.compactSheetOptionMinHeight, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  // B8 gym-basics sheet
  rampBarTag: { ...type.caption, color: colors.textMuted },
  sheetOptionText: { flex: 1, gap: spacing.xxs },
  sheetOptionLabel: { ...type.bodyStrong, color: colors.textPrimary },
  sheetOptionLabelActive: { color: colors.primary },
  sheetOptionDesc: { ...type.caption, color: colors.textMuted },
  // D32 (2026-07-10, campaign item 20): the whole-workout reorder sheet.
  reorderSheetRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
  },
  reorderSheetRowInfo: { flex: 1, gap: spacing.xxs },
  reorderSheetRowName: { ...type.bodyStrong, color: colors.textPrimary },
  reorderSheetRowMeta: { ...type.caption, color: colors.textMuted },
  reorderSheetSupersetChip: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xxs,
    // R2 compliance: chip container -> radius.md.
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs, borderRadius: radius.md,
    backgroundColor: colors.primaryBg, alignSelf: 'flex-start', marginTop: spacing.xxs,
  },
  reorderSheetSupersetChipText: { ...type.captionStrong, color: colors.primary },
  reorderSheetChevrons: { flexDirection: 'column', alignItems: 'center', gap: spacing.xxs },
  reorderSheetChevronBtn: {
    // R2 compliance: icon button -> radius.md.
    width: 28, height: 28, alignItems: 'center', justifyContent: 'center',
    borderRadius: radius.md, backgroundColor: colors.surface2,
  },
  reorderSheetChevronBtnDisabled: { opacity: 0.3 },
  infoTargetRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.md },
  infoTarget: { ...type.label, color: colors.primary },
  // D151 sheet polish: metadata one step up from muted so "Back · Cable"
  // reads as information under the title; the instruction sections are a
  // labelled stack (Setup / Execution / Watch), label in the quiet
  // captionStrong, body at bodySm in the primary ink because it IS the
  // content of the sheet; spacing.md between sections, spacing.xxs inside.
  infoMuscle: { ...type.caption, color: colors.textSecondary, marginBottom: spacing.sm },
  infoInstructions: { gap: spacing.md, marginTop: spacing.sm },
  infoInstruction: { gap: spacing.xxs },
  infoNotesLabel: { ...type.captionStrong, color: colors.textMuted },
  infoNotes: { ...type.bodySm, color: colors.textPrimary },
  // COMP-015 "Adjusted today" section in the info sheet
  // D151 accent restraint: the adjusted/eased box is a tonal surface with
  // a hairline (the sheet's one amber stays on the prescription line and
  // the section titles), not an amber-tinted card.
  adjustedSection: {
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing.md,
    gap: spacing.xs,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  adjustedHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  adjustedTitle: { ...type.captionStrong, color: colors.primary },
  adjustedReason: { ...type.bodySm, color: colors.textPrimary },
  adjustedSignal: { ...type.caption, color: colors.textMuted },
  adjustedRevertBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs, paddingVertical: spacing.xs },
  adjustedRevertText: { fontSize: fontSize.sm, color: colors.primary, fontFamily: fontFamily.semibold, fontWeight: fontWeight.semibold },
  targetBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.successBg, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderWidth: 1, borderColor: colors.success },
  // AY-2/D7: onSuccessBg is the text-on-tint ink (the flat `success` mark
  // fails 4.5:1 composited on successBg in light theme at every elevation).
  targetBannerText: { fontSize: fontSize.sm, color: colors.onSuccessBg, fontFamily: fontFamily.semibold, fontWeight: fontWeight.semibold, flex: 1 },
  // D44: transient banner naming the destination exercise after a
  // superset/giant-set group-driven focus change (forward jump or
  // round-return). Same shape as targetBanner above, primary tint instead of
  // success (this isn't a completion, just a navigation notice), and the
  // primary-on-primaryBg combination already used by navTabActive/
  // navTabTextActive elsewhere in this file.
  groupFocusBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.primaryBg, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderWidth: 1, borderColor: colors.primary, marginBottom: spacing.sm },
  groupFocusBannerText: { fontSize: fontSize.sm, color: colors.primary, fontFamily: fontFamily.semibold, fontWeight: fontWeight.semibold, flex: 1 },
  // Superset heads-up modal (shared with the unilateral-suggest modal below
  // -- both use supOverlay/supSheet/supSheetContent). D36a (item 17 modal
  // tails, 2026-07-10): this stays a raw Modal (education moment with its
  // own scroll behaviour, not a candidate for BottomSheet), but the bottom
  // padding was a fixed token with no safe-area inset -- the call sites now
  // widen contentContainerStyle to
  // `Math.max(spacing.xxl, insets.bottom + spacing.lg)`, same
  // Math.max(token, insets.bottom + token) contract as bottomBar/plateBar.
  // The static paddingBottom below stays as the pre-inset floor.
  supOverlay: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' },
  supSheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, maxHeight: '88%', borderTopWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  supSheetScroll: { flexShrink: 1, minHeight: 0 },
  supSheetContent: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  supIconRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  supTitle: { ...type.h3, color: colors.textPrimary },
  supSubtitle: { ...type.bodySm, color: colors.textSecondary },
  supPairCard: { borderLeftWidth: 3, borderLeftColor: colors.primary, gap: spacing.xs },
  supPairRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  supPairChip: { width: 22, height: 22, borderRadius: circle(22), backgroundColor: colors.primaryFill, alignItems: 'center', justifyContent: 'center' },
  supPairChipText: { ...type.num('captionStrong'), color: colors.onPrimary },
  supPairName: { ...type.bodyStrong, color: colors.textPrimary, flex: 1 },
  supPairConnector: { width: 2, height: 14, backgroundColor: colors.border, marginLeft: 10 },
  supSteps: { gap: spacing.sm, marginTop: spacing.xs },
  supStep: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  supStepNum: { color: colors.primary, fontSize: fontSize.sm, fontFamily: fontFamily.bold, fontWeight: fontWeight.bold, minWidth: 14 },
  supStepText: { ...type.bodySm, color: colors.textPrimary, flex: 1 },
  supTip: { ...type.caption, color: colors.textMuted, fontStyle: 'italic', marginTop: spacing.xs },
  supPrimaryBtn: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, minHeight: workoutLoggerSize.primaryActionMinHeight, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm },
  supPrimaryBtnText: { ...type.bodyStrong, color: colors.textPrimary },
  supSecondaryRow: { flexDirection: 'row', gap: spacing.sm },
  supSecondaryBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingVertical: spacing.sm, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: 'transparent' },
  supSecondaryBtnText: { ...type.label, color: colors.textSecondary },

  staleOverlay: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'center', alignItems: 'center', padding: spacing.lg },
  staleSheet: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, width: '100%', maxHeight: '88%', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  staleTitle: { ...type.h3, color: colors.textPrimary, textAlign: 'center' },
  staleBody: { ...type.bodySm, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.md },
  staleResume: { width: '100%', backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, minHeight: workoutLoggerSize.primaryActionMinHeight, alignItems: 'center', justifyContent: 'center' },
  staleResumeText: { ...type.bodyStrong, color: colors.textPrimary },
  staleFinish: { width: '100%', backgroundColor: colors.surface2, borderRadius: radius.md, minHeight: workoutLoggerSize.primaryActionMinHeight, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.borderSubtle },
  staleFinishText: { ...type.label, color: colors.textPrimary },
  staleDiscard: { width: '100%', paddingVertical: spacing.md, alignItems: 'center' },
  staleDiscardText: { ...type.label, color: colors.error },
  discardOverlay: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'center', alignItems: 'center', padding: spacing.lg },
  discardSheet: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, width: '100%', maxHeight: '88%', gap: spacing.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  discardTitle: { ...type.h3, color: colors.textPrimary, textAlign: 'center' },
  discardBody: { ...type.bodySm, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.xs },
  keepTrainingBtn: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, minHeight: workoutLoggerSize.primaryActionMinHeight, alignItems: 'center', justifyContent: 'center' },
  keepTrainingBtnText: { ...type.bodyStrong, color: colors.textPrimary },
  discardConfirmBtn: { alignItems: 'center', paddingVertical: spacing.md },
  discardConfirmBtnText: { ...type.label, color: colors.error },
  // D43 S4: the "edit set" modal's own style block (keyboard wrapper,
  // overlay, sheet, save/cancel/delete rows) is removed -- that modal is
  // gone, replaced by LoggedSetRow's inline editor (src/components/workout/
  // LoggedSetRow.js, editingWrap/editingTitle/editingActions/etc.), which
  // carries its own equivalent house-idiom styles local to the row.
  nextTimeBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
    backgroundColor: colors.primaryBg,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: withAlpha(colors.primary, 0.251),
  },
  nextTimeBannerText: {
    ...type.bodySm,
    flex: 1,
    color: colors.textPrimary,
  },
  // EP-15/UI-06: wraps the note text + its More/Less toggle so the toggle
  // sits directly under the (possibly clamped) note, not full-width against
  // the icon/dismiss-pill row.
  nextTimeBannerBody: {
    flex: 1,
    gap: spacing.xs,
  },
  nextTimeMoreToggleText: {
    ...type.label,
    color: colors.primary,
  },
  deloadBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.warningBg,
    borderRadius: radius.md, marginHorizontal: spacing.lg, marginBottom: spacing.sm,
    padding: spacing.md, borderWidth: 1, borderColor: colors.warning,
  },
  deloadBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  deloadBannerTitle: { fontSize: fontSize.sm, fontFamily: fontFamily.bold, fontWeight: fontWeight.bold, color: colors.warning },
  deloadBannerSub: { ...type.caption, color: colors.textMuted },
});

// CP-10 stage 3 (theming FINAL batch, 2026-07-10): buildLiveStyles is the
// shared "frozen base + live override" map for this screen's three
// function-component scopes (LoggedSetRow, ActiveWorkoutScreen,
// EmptyExerciseView) -- each calls `const t = useTheme(); const live =
// buildLiveStyles(t);` and appends `live.KEY` after `styles.KEY` in every
// style array, same pattern as batch 1/2 (Card.js/CoachBriefCard.js's
// buildBriefIconColor). Extracted to one function (rather than inlined
// three times) so the three scopes can never drift out of step with each
// other or with the frozen `styles` block above -- every key here mirrors
// only the colour/fontSize/type-bearing sub-properties of the matching
// frozen style, at identical rest values; pure layout keys (flex/gap/
// padding/width, no token) are correctly omitted, there is nothing to
// unfreeze for them.
function buildLiveStyles(t) {
  return {
    safe: { backgroundColor: t.colors.background },
    header: { borderBottomColor: t.colors.border },
    // R2-2: contained icon-button chrome for the header X, live-mirrored.
    headerIconBtn: { backgroundColor: t.colors.surface2, borderColor: t.colors.border },
    headerTimerLabel: { ...t.type.overline, color: t.colors.textMuted },
    // R5 (D66): headerFinishButton no longer carries colour keys (Button's
    // secondary variant owns them live), so it needs no live override.
    timerText: { ...t.type.num('title'), color: t.colors.textPrimary },
    omittedSessionNote: { ...t.type.caption, color: t.colors.textMuted },
    sideCarveNote: { ...t.type.caption, color: t.colors.textMuted },
    starterBanner: { backgroundColor: withAlpha(t.colors.primary, alpha.ghost), borderBottomColor: t.colors.border },
    starterBannerText: { ...t.type.bodySm, color: t.colors.textSecondary },
    inlineActionPill: { backgroundColor: t.colors.surface, borderColor: withAlpha(t.colors.primary, alpha.edge) },
    inlineActionPillText: { ...t.type.caption, color: t.colors.textPrimary },
    exerciseNav: { borderBottomColor: t.colors.border },
    navTab: { backgroundColor: t.colors.surface2 },
    navTabActive: { backgroundColor: t.colors.primaryBg },
    navTabText: { ...t.type.label, color: t.colors.textSecondary },
    navTabTextActive: { color: t.colors.primary },
    navTabBadge: { backgroundColor: t.colors.primaryFill },
    navTabBadgeText: { ...t.type.caption, color: t.colors.onPrimary, fontSize: t.fontSize.micro },
    // fontWeight is a static token table (not theme-resolved), so the live
    // mirror reads the same import the frozen block does.
    exerciseName: { ...t.type.label, fontWeight: fontWeight.semibold, color: t.colors.textPrimary },
    swapSafe: { backgroundColor: t.colors.background },
    swapHeader: { borderBottomColor: t.colors.borderSubtle },
    swapTitle: { ...t.type.title, color: t.colors.textPrimary },
    swapSubtitle: { ...t.type.caption, color: t.colors.textMuted },
    swapCloseBtn: { backgroundColor: t.colors.surface, borderColor: t.colors.borderSubtle },
    swapNote: { ...t.type.caption, color: t.colors.textMuted },
    swapItem: { backgroundColor: t.colors.surface, borderColor: t.colors.borderSubtle },
    swapItemIcon: { backgroundColor: t.colors.surface2 },
    swapItemName: { ...t.type.label, color: t.colors.textPrimary },
    swapItemReason: { ...t.type.caption, color: t.colors.textMuted },
    swapItemTag: { ...t.type.caption, color: t.colors.primary },
    swapBrowseBtn: { borderColor: t.colors.borderSubtle, backgroundColor: t.colors.surface },
    swapBrowseText: { ...t.type.label, color: t.colors.textPrimary },
    swapEmptyTitle: { ...t.type.label, color: t.colors.textPrimary },
    swapEmptyText: { ...t.type.caption, color: t.colors.textMuted },
    setEntryCardWarmup: { borderColor: t.colors.warning, backgroundColor: t.colors.warningBg || t.colors.surface },
    setEntryCardFlash: { borderColor: t.colors.primary },
    warmupBannerText: { ...t.type.caption, color: t.colors.warning },
    orientationText: { ...t.type.label, color: t.colors.textSecondary },
    orientationTarget: { ...t.type.label, color: t.colors.textMuted },
    beatLineLabel: { fontSize: t.fontSize.sm, color: t.colors.textSecondary },
    beatLineValue: { ...t.type.bodyStrong, color: t.colors.textPrimary },
    beatLineGlyph: { ...t.type.bodyStrong, color: t.colors.primary },
    beatLineCue: { backgroundColor: t.colors.surface2, borderColor: t.colors.border },
    beatLineCueText: { ...t.type.caption, color: t.colors.textSecondary },
    coachLineText: { ...t.type.bodySm, color: t.colors.primary },
    noteInput: { backgroundColor: t.colors.surface2, fontSize: t.fontSize.sm, color: t.colors.textPrimary, borderColor: t.colors.border },
    completeBtn: { backgroundColor: t.colors.surface2, borderColor: t.colors.border },
    completeBtnText: { ...t.type.bodyStrong, color: t.colors.textPrimary },
    completeBtnWarmup: { backgroundColor: t.colors.warningBg || t.colors.surface, borderColor: t.colors.warning },
    completeBtnTextWarmup: { color: t.colors.warning },
    extraSetBtnText: { ...t.type.label, color: t.colors.textSecondary },
    extraSetBtnPromoted: { borderColor: t.colors.border, backgroundColor: t.colors.surface2 },
    extraSetBtnPromotedText: { ...t.type.label, color: t.colors.textPrimary },
    autoAdvanceRowText: { ...t.type.caption, color: t.colors.textMuted },
    autoAdvanceRowDot: { ...t.type.caption, color: t.colors.textMuted },
    autoAdvanceRowActionBtn: { backgroundColor: t.colors.surface, borderColor: withAlpha(t.colors.primary, alpha.edge) },
    autoAdvanceRowAction: { ...t.type.captionStrong, color: t.colors.textPrimary },
    bottomBar: { backgroundColor: t.colors.background, borderTopColor: t.colors.borderSubtle },
    clusterBanner: { borderColor: withAlpha(t.colors.primary, 0.502), backgroundColor: t.colors.primaryBg },
    clusterTitle: { ...t.type.label, color: t.colors.primary },
    clusterReps: { ...t.type.num('bodyStrong'), color: t.colors.textPrimary },
    clusterInput: { backgroundColor: t.colors.background, color: t.colors.textPrimary, borderColor: t.colors.border, ...t.type.body },
    clusterAddBtn: { borderColor: withAlpha(t.colors.primary, 0.502) },
    clusterAddBtnText: { ...t.type.label, color: t.colors.primary },
    clusterCancel: { backgroundColor: t.colors.surface2, borderColor: t.colors.border },
    clusterCancelText: { ...t.type.label, color: t.colors.textPrimary },
    overflowHintLabel: { ...t.type.captionStrong, color: t.colors.textSecondary },
    // R2-3: contained note-corner button chrome, live-mirrored.
    noteCornerBtn: { backgroundColor: t.colors.surface2, borderColor: t.colors.border },
    supersetChip: { backgroundColor: t.colors.primaryBg },
    supersetChipText: { ...t.type.captionStrong, color: t.colors.primary },
    circuitMissedLine: { ...t.type.caption, color: t.colors.textSecondary },
    loggedTitle: { ...t.type.captionStrong, color: t.colors.textMuted },
    // Phase 2B live-theme mirrors for the sequence additions.
    upcomingSetNum: { ...t.type.num('caption'), color: t.colors.textMuted },
    upcomingSetText: { ...t.type.caption, color: t.colors.textMuted },
    historyToggleText: { ...t.type.caption, color: t.colors.textMuted },
    // D43 S1: LoggedSetRow-exclusive (loggedSetRow/loggedSetRowWarmup/
    // loggedSetTextWarmup/setNumBadge/setNumText/loggedSetText/loggedEst1RM)
    // and EmptyExerciseView-exclusive (emptyView/emptyTitle/emptySubtitle/
    // addFirstBtn/addFirstBtnText) live overrides moved verbatim into each
    // component's own buildLiveStyles.
    sheetTitle: { ...t.type.title, color: t.colors.textPrimary },
    sheetExplainer: { ...t.type.bodySm, color: t.colors.textSecondary },
    sheetOption: { borderBottomColor: t.colors.border },
    rampBarTag: { ...t.type.caption, color: t.colors.textMuted },
    sheetOptionLabel: { ...t.type.bodyStrong, color: t.colors.textPrimary },
    sheetOptionLabelActive: { color: t.colors.primary },
    sheetOptionDesc: { ...t.type.caption, color: t.colors.textMuted },
    reorderSheetRow: { backgroundColor: t.colors.surface, borderColor: t.colors.border },
    reorderSheetRowName: { ...t.type.bodyStrong, color: t.colors.textPrimary },
    reorderSheetRowMeta: { ...t.type.caption, color: t.colors.textMuted },
    reorderSheetSupersetChip: { backgroundColor: t.colors.primaryBg },
    reorderSheetSupersetChipText: { ...t.type.captionStrong, color: t.colors.primary },
    reorderSheetChevronBtn: { backgroundColor: t.colors.surface2 },
    infoTarget: { ...t.type.label, color: t.colors.primary },
    infoMuscle: { ...t.type.caption, color: t.colors.textSecondary },
    infoNotesLabel: { ...t.type.captionStrong, color: t.colors.textMuted },
    infoNotes: { ...t.type.bodySm, color: t.colors.textPrimary },
    adjustedSection: { backgroundColor: t.colors.surface2, borderColor: t.colors.borderSubtle },
    adjustedTitle: { ...t.type.captionStrong, color: t.colors.primary },
    adjustedReason: { ...t.type.bodySm, color: t.colors.textPrimary },
    adjustedSignal: { ...t.type.caption, color: t.colors.textMuted },
    adjustedRevertText: { fontSize: t.fontSize.sm, color: t.colors.primary },
    targetBanner: { backgroundColor: t.colors.successBg, borderColor: t.colors.success },
    targetBannerText: { fontSize: t.fontSize.sm, color: t.colors.onSuccessBg },
    groupFocusBanner: { backgroundColor: t.colors.primaryBg, borderColor: t.colors.primary },
    groupFocusBannerText: { fontSize: t.fontSize.sm, color: t.colors.primary },
    supOverlay: { backgroundColor: t.colors.scrim },
    supSheet: { backgroundColor: t.colors.surface, borderColor: t.colors.border },
    supTitle: { ...t.type.h3, color: t.colors.textPrimary },
    supSubtitle: { ...t.type.bodySm, color: t.colors.textSecondary },
    supPairCard: { borderLeftColor: t.colors.primary },
    supPairChip: { backgroundColor: t.colors.primaryFill },
    supPairChipText: { ...t.type.num('captionStrong'), color: t.colors.onPrimary },
    supPairName: { ...t.type.bodyStrong, color: t.colors.textPrimary },
    supPairConnector: { backgroundColor: t.colors.border },
    supStepNum: { color: t.colors.primary, fontSize: t.fontSize.sm },
    supStepText: { ...t.type.bodySm, color: t.colors.textPrimary },
    supTip: { ...t.type.caption, color: t.colors.textMuted },
    supPrimaryBtn: { backgroundColor: t.colors.surface2, borderColor: t.colors.border },
    supPrimaryBtnText: { ...t.type.bodyStrong, color: t.colors.textPrimary },
    supSecondaryBtn: { borderColor: t.colors.border },
    supSecondaryBtnText: { ...t.type.label, color: t.colors.textSecondary },
    staleOverlay: { backgroundColor: t.colors.scrim },
    staleSheet: { backgroundColor: t.colors.surface, borderColor: t.colors.border },
    staleTitle: { ...t.type.h3, color: t.colors.textPrimary },
    staleBody: { ...t.type.bodySm, color: t.colors.textSecondary },
    staleResume: { backgroundColor: t.colors.surface2, borderColor: t.colors.border },
    staleResumeText: { ...t.type.bodyStrong, color: t.colors.textPrimary },
    staleFinish: { backgroundColor: t.colors.surface2, borderColor: t.colors.borderSubtle },
    staleFinishText: { ...t.type.label, color: t.colors.textPrimary },
    staleDiscardText: { ...t.type.label, color: t.colors.error },
    discardOverlay: { backgroundColor: t.colors.scrim },
    discardSheet: { backgroundColor: t.colors.surface, borderColor: t.colors.border },
    discardTitle: { ...t.type.h3, color: t.colors.textPrimary },
    discardBody: { ...t.type.bodySm, color: t.colors.textSecondary },
    keepTrainingBtn: { backgroundColor: t.colors.surface2, borderColor: t.colors.border },
    keepTrainingBtnText: { ...t.type.bodyStrong, color: t.colors.textPrimary },
    discardConfirmBtnText: { ...t.type.label, color: t.colors.error },
    nextTimeBanner: { backgroundColor: t.colors.primaryBg, borderColor: withAlpha(t.colors.primary, 0.251) },
    nextTimeBannerText: { ...t.type.bodySm, color: t.colors.textPrimary },
    nextTimeMoreToggleText: { ...t.type.label, color: t.colors.primary },
    deloadBanner: { backgroundColor: t.colors.warningBg, borderColor: t.colors.warning },
    deloadBannerTitle: { fontSize: t.fontSize.sm, color: t.colors.warning },
    deloadBannerSub: { ...t.type.caption, color: t.colors.textMuted },
  };
}
