import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useScrollToTop } from '@react-navigation/native';
import { format } from 'date-fns/format';

import { colors, fontSize, fontWeight, spacing, radius, withAlpha, alpha, type, circle, iconSize, fontFamily } from '../styles/theme';
import useTheme from '../hooks/useTheme';
import ScreenHeader from '../components/ScreenHeader';
import CommunityHeaderAction from '../components/community/CommunityHeaderAction';
import Button from '../components/Button';
import Card from '../components/Card';
import EmptyState from '../components/EmptyState';
import PressableCard from '../components/PressableCard';
import SectionLabel from '../components/SectionLabel';
import WhatsNewSheet from '../components/WhatsNewSheet';
import { SkeletonCard } from '../components/Skeleton';
import TodayStrip from '../components/TodayStrip';
import RecoveryStateCard from '../components/RecoveryStateCard';
import { appAlert } from '../components/AppAlert';
import { resolveProgrammePosition, isWeekComplete } from '../lib/programmePosition';
import {
  reEntryCheckDue, reEntryPrompt, reEntryOutcome, RE_ENTRY_ANSWER,
} from '../lib/reEntryCheck';
import {
  setPendingReEntryEase, clearPendingReEntryEaseIfMatches,
} from '../lib/reEntryEaseState';
import { sessionDisplayName, skipConfirmation } from '../lib/blockProgression';
import { nextWorkoutRecoveryLabel, isLighterTrainingState } from '../lib/recoveryState';
import { useToast } from '../components/Toast';
// Campaign 22 Phase 2 Stage 2 (HOME-TODAY-UX-SPEC.md §17 R3, hero merge):
// CoachBriefCard's card-in-card render is retired -- the hero now renders
// its content as one quiet line inline. buildBriefIconColor is still the
// shared tone-colour source for the readiness chip below and stays imported.
import { buildBriefIconColor } from '../components/CoachBriefCard';
import HomeWelcomeCard from '../components/HomeWelcomeCard';
import HomeHowYouTrainOfferCard from '../components/HomeHowYouTrainOfferCard';
import HomeLastSessionCard from '../components/HomeLastSessionCard';
import HomeBlockShapeSheet from '../components/HomeBlockShapeSheet';
import HomeChangeWorkoutSheet from '../components/HomeChangeWorkoutSheet';
import BottomSheet from '../components/BottomSheet';
import Chip from '../components/Chip';
import * as haptics from '../lib/haptics';
import { buildCoachBrief, constraintLineText } from '../lib/homeCoachBrief';
import { isCompletedCoachDecision } from '../lib/coachDecision';
import { resolveHasUnseenCoachChange, COACH_OUTPUT_VIEWED_KEY_FOR } from '../lib/home/unseenCoachChange';
import { isEnrolmentSeedWeight } from '../lib/checkinDerive';
import {
  getAllWorkouts, getWorkoutSetsSince, getActivePlan, getRoutinesForPlan,
  recordSessionResolution,
  getAllRoutineExerciseCounts, createWorkout, getRoutineExercisesWithDetails,
  getWorkoutSetsForWorkout, getExerciseById, uid,
  getCurrentMesocycleWeek, getPlannedMuscleVolume, getAllExercises,
  getMorningWeightToday, getMorningWeights, logMorningWeight,
  getRecentWorkoutFeedback, getLatestCoachOutput,
  getMorningWeightsLast14Days, getOpenEdPatternFlag,
  getLatestCheckin,
  getAllWeeklyCheckinsForUser,
} from '../lib/database';
import {
  FIRST_CHECKIN_MIN_DAYS,
  MIN_WEIGH_INS,
} from '../lib/trialActivation';
import { computeAndLogSessionAdjustments } from '../lib/sessionAdjustments';
import { activePlanLine, planHeadingName, weekCompleteLine } from '../lib/planDisplay';
import { resolveActivationNudge, activationBannerLine, NUDGE_STAGE, NUDGE_WINDOW_GRACE_MS } from '../lib/activationNudge';
import { navigateCrossTab } from '../navigation/navigateCrossTab';
import { localWeekStartMs, localWeekEndMs, localDayKey } from '../lib/dayKey';
import { isCalm, WELLBEING_KEY } from '../lib/wellbeing';
// Campaign 22 Phase 2 Stage 1 (HOME-TODAY-UX-SPEC.md §13/§17 region R2):
// the single unified P1 "Today line" and its pure priority arbiter.
import TodayLine from '../components/home/TodayLine';
import { resolveTodayLine } from '../lib/home/todayLineArbiter';
// Final pass D-P2-2 (certification 2026-09-05): a circuit day names itself
// on Today instead of reading as a generic "N exercises".
import { summariseCircuitGroups, formatCircuitPreviewLine } from '../lib/circuitRound';
// Campaign 26 (founder device order 2026-08-17): the C22 FirstReviewLine
// link is replaced by the restored since-check-in evidence pane - one
// quiet region carrying the check-in countdown, the weigh-in and session
// evidence, and the logged morning weight as a quiet folded-in line. Same
// component/pure-resolver split as TodayLine.
import EvidencePanel from '../components/home/EvidencePanel';
import { resolveEvidencePanel } from '../lib/home/evidencePanel';
import { formatBodyWeight } from '../lib/units';
import { getRecentIntakeSummary } from '../lib/food/db';
// D139: the no-plan "Start with a plan" action previews before it commits.
// prepareStartWithPlan owns the capability pre-flight (CC27 section 9.6 red-team
// finding 1: every generation surface runs it first, never a silent fail-open)
// and the READ-ONLY dry run; commitStartWithPlan is the real generation, run
// only after the athlete confirms in PlanPreviewSheet.
import { prepareStartWithPlan, commitStartWithPlan } from '../lib/startWithPlan';
import PlanPreviewSheet from '../components/PlanPreviewSheet';
import { logError, logWarn } from '../lib/errorLog';
import { calculateTonnage, buildLoadSemanticsById, calculateWeeklyVolume, MUSCLE_DISPLAY_NAMES, shouldDeload, buildLast4WeekDeloadBuckets } from '../lib/algorithms';
import { selectPlateauForBanner, plateauBannerLine } from '../lib/plateauSurfacing';
import { buildReadinessSummary } from '../lib/readinessSummary';
import { BLOCK_START_SENTENCE } from '../lib/blockExplain';
import { seedRoutinesIfNeeded } from '../lib/seedRoutines';
import useAppStore from '../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';
// Campaign 22 Phase 2 Stage 1 copy contract item 5: the check-in nudge's
// optional scan subline is retired from Home (it moves to the check-in
// screen it belongs to), so the photo-suppression hook this line fed is no
// longer read here. usePhotoSuppression itself is untouched.

// Soft targets used only to size the weekly progress bars, not enforced

// The time-of-day greeting subtitle ("Afternoon, Alex.") was removed on the
// founder device order of 2026-08-17: it pushed the content down and added
// nothing the header's title does not already say. Do not re-add a greeting
// line without a founder order.

// COMP-008: the three pre-workout readiness rows shown beneath the intent
// options. Each is an optional low/middle/high chip. Stored values match the
// scales the workout row + its readers expect: soreness on the existing 1-3
// (Fresh/Mild/Sore) scale the adaptive engine + computeRecoveryEMAs read;
// sleep + energy on the 1-5 domain (chips offer 2/3/4) so the weekly
// sleep_quality write and CoachReview's <2.5 thresholds stay valid.
// R2-10 (founder decision "Reorder", 2026-07-11): the rows render ABOVE the
// intent options now, compacted to one line each (`short` is the inline
// label; `label` stays the full accessible phrasing). The old layout put
// them BELOW the three buttons that start the session, so they were
// unreachable the moment the user answered - the founder rightly called
// them pointless as laid out.
const READINESS_ROWS = [
  {
    key: 'soreness24hBefore',
    label: 'Soreness coming in',
    short: 'Soreness',
    chips: [{ label: 'Fresh', value: 1 }, { label: 'Mild', value: 2 }, { label: 'Sore', value: 3 }],
  },
  {
    key: 'sleepQuality',
    label: 'Sleep last night',
    short: 'Sleep',
    chips: [{ label: 'Poor', value: 2 }, { label: 'OK', value: 3 }, { label: 'Good', value: 4 }],
  },
  {
    key: 'energyScore',
    label: 'Energy today',
    short: 'Energy',
    chips: [{ label: 'Low', value: 2 }, { label: 'OK', value: 3 }, { label: 'High', value: 4 }],
  },
];

// D112 R5 (closes audit T1-12): after a successful generation, the count of
// slots the capability lane blocked (PlanUpdateScreen's dry-run preview is
// the model this mirrors - see its capabilityBlockedCount usage). Pure,
// calm, one line; never conflated with the equipment/preference shortfall
// copy (planShortfallNote), a different reason class entirely.
function capabilityBlockedNote(n) {
  return n === 1
    ? "1 movement clashed with an injury or limitation you've set, so your plan works without it."
    : `${n} movements clashed with your injuries or limitations, so your plan works without them.`;
}

export default function HomeScreen({ navigation, route }) {
  const toast = useToast();
  // R9 (D70): insets and reduceMotion left with the raw intent Modal -
  // the shared BottomSheet owns both now.
  // FOUNDER DECISION (fully free, no tier split): `tier` is no longer read
  // here -- every branch that used to fork on it now runs the single
  // full-access behaviour for everyone (see proGate.js FULL_ACCESS_FOR_ALL).
  const { user, userProfile, startWorkout, activeWorkout, bodyWeightUnits, restoreActiveWorkout, migrateFoodDayKeysOnce, setSessionAdjustments } = useAppStore(
    useShallow(s => ({ user: s.user, userProfile: s.userProfile, startWorkout: s.startWorkout, activeWorkout: s.activeWorkout, bodyWeightUnits: s.bodyWeightUnits, restoreActiveWorkout: s.restoreActiveWorkout, migrateFoodDayKeysOnce: s.migrateFoodDayKeysOnce, setSessionAdjustments: s.setSessionAdjustments }))
  );

  // CP-10 stage 3 (theming batch 2): live theme (src/hooks/useTheme.js).
  // `styles` below stays frozen (byte-identical StyleSheet.create, matching
  // batch 1's pattern); `live` carries every colour/fontSize/type-bearing
  // key from that frozen block, appended AFTER the frozen base in each style
  // array so a theme change re-renders this screen with no restart, at
  // identical rest values. Keys with no colour/fontSize token (pure layout:
  // flex/gap/padding/width/etc.) are omitted -- there is nothing to unfreeze.
  const t = useTheme();
  const live = {
    safe: { backgroundColor: t.colors.background },
    continueCard: { backgroundColor: t.colors.success },
    continueIcon: { backgroundColor: withAlpha(t.colors.background, alpha.soft) },
    continueTitle: { ...t.type.bodyStrong, color: t.colors.onPrimary },
    continueSub: { ...t.type.caption, color: withAlpha(t.colors.onPrimary, alpha.half) },
    workoutName: { fontSize: t.fontSize.xxl, color: t.colors.textPrimary },
    workoutMeta: { fontSize: t.fontSize.sm, color: t.colors.textSecondary },
    heroBody: { ...t.type.bodySm, color: t.colors.textSecondary },
    mesoBriefChip: { backgroundColor: t.colors.surface2, borderColor: t.colors.border },
    mesoBriefText: { fontSize: t.fontSize.xs, color: t.colors.textSecondary },
    workoutOptionsText: { color: t.colors.textSecondary },
    // Campaign 22 Phase 2 Stage 2 (§7/§17 R5): the "Progress at a glance"
    // card is removed (3-way duplication fix); its live styles go with it.
    coachBriefLineText: { ...t.type.bodySm, color: t.colors.textSecondary },
    // D112 R5 (closes audit T1-14/T2-31, T1-15/T2-24): standalone
    // constraint / AWAITING rows, same live-theme shape as the brief line.
    constraintGroup: { backgroundColor: t.colors.surface, borderColor: t.colors.borderSubtle },
    constraintLineRow: { borderBottomColor: t.colors.borderSubtle },
    constraintLineText: { ...t.type.bodySm, color: t.colors.textSecondary },
    coachingNudge: { backgroundColor: t.colors.surface, borderColor: withAlpha(t.colors.primary, alpha.edge) },
    coachingNudgeLeft: { backgroundColor: t.colors.primaryBg },
    coachingNudgeTitle: { ...t.type.label, color: t.colors.textPrimary },
    coachingNudgeBody: { ...t.type.captionTight, color: t.colors.textSecondary },
    coachingNudgeScanSubline: { ...t.type.captionTight, color: t.colors.textMuted },
    intentTitle: { ...t.type.h3, color: t.colors.textPrimary },
    intentSub: { fontSize: t.fontSize.sm, color: t.colors.textMuted },
    intentOption: { backgroundColor: t.colors.surface2 ?? t.colors.background, borderColor: t.colors.border },
    intentOptionIcon: { backgroundColor: t.colors.primaryBg },
    readinessGroupLabel: { ...t.type.overline, color: t.colors.textMuted },
    intentOptionLabel: { ...t.type.bodyStrong, color: t.colors.textPrimary },
    intentOptionSub: { ...t.type.caption, color: t.colors.textSecondary },
    readinessLabel: { ...t.type.caption, color: t.colors.textSecondary },
    readinessChip: { borderColor: t.colors.border, backgroundColor: t.colors.surface2 ?? t.colors.background },
    readinessChipActive: { borderColor: t.colors.primary, backgroundColor: t.colors.primaryBg },
    readinessChipText: { fontSize: t.fontSize.sm, color: t.colors.textSecondary },
    readinessChipTextActive: { color: t.colors.primary },
    intentSkipText: { fontSize: t.fontSize.sm, color: t.colors.textMuted },
    skipSessionText: { ...t.type.caption, color: t.colors.textMuted },
    intentOptOutText: { fontSize: t.fontSize.sm, color: t.colors.textSecondary },
    intentOptOutSub: { fontSize: t.fontSize.xs, color: t.colors.textMuted },
    coachBanner: { backgroundColor: t.colors.primaryBg, borderColor: withAlpha(t.colors.primary, alpha.mid) },
    coachBannerTitle: { fontSize: t.fontSize.sm, color: t.colors.primary },
    coachBannerBody: { ...t.type.bodySm, color: t.colors.textSecondary },
    deloadBanner: { backgroundColor: withAlpha(t.colors.primary, alpha.tint), borderColor: withAlpha(t.colors.primary, alpha.mid) },
    deloadBannerTitle: { fontSize: t.fontSize.sm, color: t.colors.primary },
    deloadBannerBody: { ...t.type.bodySm, color: t.colors.textSecondary },
    plateauBanner: { backgroundColor: t.colors.primaryBg, borderColor: withAlpha(t.colors.primary, alpha.edge) },
    plateauBannerText: { ...t.type.bodySm, color: t.colors.textPrimary },
    activationBanner: { backgroundColor: t.colors.primaryBg, borderColor: withAlpha(t.colors.primary, alpha.edge) },
    activationBannerTitle: { ...t.type.bodySm, color: t.colors.textPrimary },
    activationBannerBody: { ...t.type.bodySm, color: t.colors.textMuted },
    phaseBanner: { backgroundColor: t.colors.primaryBg, borderColor: withAlpha(t.colors.primary, alpha.edge) },
    phaseBannerText: { ...t.type.captionTight, color: t.colors.textSecondary },
    quickStartCard: { backgroundColor: t.colors.primaryBg, borderColor: withAlpha(t.colors.primary, alpha.edge) },
    quickStartIcon: { backgroundColor: t.colors.surface2 },
    quickStartTitle: { ...t.type.bodyStrong, color: t.colors.textPrimary },
    quickStartSub: { ...t.type.bodySm, color: t.colors.textSecondary },
  };
  // S15#7 readiness chip's tone colours, built live so it stays in the same
  // theme generation as CoachBriefCard (buildBriefIconColor, imported above).
  const BRIEF_ICON_COLOR = buildBriefIconColor(t.colors);

  // WK-1: recover an in-progress workout after an app kill/crash. The store
  // holds the session in memory only, so a kill stranded the logged sets
  // under an is_completed=0 row. Rehydrating here makes the "Session in
  // Progress" card reappear so the user can resume and finish it. No-ops when
  // a session is already live or no snapshot matches this user.
  // TZ-1 phase 2: also runs the one-shot food-entry day-key re-key (guarded
  // per user) so historical food lands on the local calendar day.
  useEffect(() => {
    if (user?.id && !activeWorkout) {
      restoreActiveWorkout(user.id);
    }
    if (user?.id) {
      migrateFoodDayKeysOnce(user.id);
    }
    // Only on user change: re-running on every activeWorkout change is
    // unnecessary (the guard already prevents clobbering a live session).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Cloud-sync version bumps when pullFromCloud finishes; HomeScreen
  // re-runs loadData so the empty state swaps for real data without
  // the user navigating away and back.
  const cloudSyncVersion = useAppStore(s => s.cloudSyncVersion);
  const bwu = bodyWeightUnits || 'st';

  const [weekStats, setWeekStats] = useState({ sessions: 0, sets: 0, volume: 0 });
  const [activePlan, setActivePlanData] = useState(null);
  const [nextWorkout, setNextWorkout] = useState(null);
  // B-2 (F-18): an ACTIVE plan that holds no sessions. Kept as its own
  // fact rather than inferred from `planAllWorkouts.length === 0`, so a
  // failed read (which also leaves that array empty) can never render the
  // "no sessions yet" state for a plan that has them.
  const [planHasNoSessions, setPlanHasNoSessions] = useState(false);
  const [exerciseCounts, setExerciseCounts] = useState({});
  // D112 R2 (closes audit T1-17): the effective (served) row count for the
  // DISPLAYED session only - null until resolved, so the raw exerciseCounts
  // figure (already loaded) shows first rather than nothing flashing.
  const [effectiveSessionCount, setEffectiveSessionCount] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [seeded, setSeeded] = useState(false);
  const [planAllWorkouts, setPlanAllWorkouts] = useState([]);
  const [selectedWorkoutOverride, setSelectedWorkoutOverride] = useState(null);
  const [showChangeWorkout, setShowChangeWorkout] = useState(false);
  const [isStartingWorkout, setIsStartingWorkout] = useState(false);
  const [lastSession, setLastSession] = useState(null);
  const [lastSessionTonnage, setLastSessionTonnage] = useState(null);
  const [blockProgress, setBlockProgress] = useState([]);
  // CC33 D112 R5 (closes audit T2-25's copy half): the durable
  // reintroduction line for the plan view - non-null while this week's
  // planned volume carries rows stamped source 'reintroduction' (the §23
  // ramp wrote them), so the build-back is visible every week it is
  // happening, not only in the one toast at episode end.
  const [rampLine, setRampLine] = useState(null);
  const [currentMesoWeek, setCurrentMesoWeek] = useState(null);
  // Stage 8: block-start seed lines for the block sheet (written-plan truth).
  const [blockSeedLines, setBlockSeedLines] = useState([]);
  const [showBlockShape, setShowBlockShape] = useState(false); // COMP-010 meso chip tap-through
  const [latestCoachOutput, setLatestCoachOutput] = useState(null);
  // PM-06: is that output a real, check-in-backed decision (see coachDecision).
  const [latestCoachDecisionComplete, setLatestCoachDecisionComplete] = useState(false);
  // Campaign 22 Phase 2 Stage 2 (FOUNDER-RULINGS-PHASE2 R3, complete): the
  // everyday trial value card (S0-S3), its loader, its notification side
  // effect and its dismissal key have REHOMED to YouScreen.js in full. Home
  // carries no trial-banner state at all any more.
  // Campaign 22 Phase 2 Stage 2 (§9/§17 R4; FOUNDER-RULINGS-PHASE2 R2): the
  // raw facts the self-retiring first-review readiness line needs, gathered
  // by loadFirstReviewFacts. Null until loaded, so the line never flashes
  // before real data is read.
  const [firstReviewFacts, setFirstReviewFacts] = useState(null);
  // First-load flag, flipped false in loadData. While true, the
  // home screen renders skeleton cards in place of the main cards so
  // the user sees structure instantly on cold launch rather than a
  // blank screen until SQLite reads complete.
  const [initialLoading, setInitialLoading] = useState(true);
  const [coachBannerDismissed, setCoachBannerDismissed] = useState(false);
  const [todayWeight, setTodayWeight] = useState(null);       // logged weight for today
  const [recentWeights, setRecentWeights] = useState([]);     // last 14 entries for sparkline
  const [savingWeight, setSavingWeight] = useState(false);
  // Campaign 22 Phase 2 Stage 2 (§11/R1): has the user EVER logged a real
  // (non-enrolment-seed) morning weight. Gates TodayStrip's first-use
  // tutorial sentence -- defaults true so the line never flashes for an
  // established user while this loads.
  const [hasEverLoggedWeight, setHasEverLoggedWeight] = useState(true);
  // First-launch welcome guide. Defaults to hidden so it never flashes before the
  // saved flag is read; the loader reveals it for a brand-new user (no sessions
  // logged) who hasn't dismissed it. Auto-clears once totalSessions > 0.
  const [welcomeDismissed, setWelcomeDismissed] = useState(true);
  // D134 (founder 2026-09-03): the one-time Injuries & limitations offer. Defaults
  // dismissed so it never flashes before the stored flag is read; shown only
  // for a person with NOTHING set up (no rows at all, history included).
  const [hytOfferDismissed, setHytOfferDismissed] = useState(true);
  const [hytNothingSetUp, setHytNothingSetUp] = useState(false);
  const [showCoachingNudge, setShowCoachingNudge] = useState(false);
  const [totalSessions, setTotalSessions] = useState(0);
  const [showIntentPrompt, setShowIntentPrompt] = useState(false);
  // R2-1: single-flight guard across every start surface (start button,
  // repeat-last-session). Synchronous ref, so a double-tap or a second
  // surface can never queue a second intent-sheet open that would resolve
  // after the workout has already begun.
  // The merged "Start with a plan" action (D137) generates the whole plan
  // from the empty state; a second tap while the first run is still awaiting
  // preflight or the generator would start a second generation.
  const startWithPlanRef = useRef(false);
  // D139: the staged first-plan preview, { preview, otherPlansCount }. Set by
  // the empty state's prepare step, cleared on confirm or "Not yet". Nothing
  // is written while it is open.
  const [planPreview, setPlanPreview] = useState(null);
  const [startingPlan, setStartingPlan] = useState(false);
  // Item 3 (D141): true from the EmptyState tap until prepareStartWithPlan
  // resolves (sheet set) or the attempt fails, so the button can show it is
  // doing real work (a DB-backed capability preflight plus a full engine dry
  // run) instead of sitting inert. Reset in `finally` alongside the ref
  // guard, which stays for the same-render double-entry protection this
  // state cannot provide by itself.
  const [preparingPlan, setPreparingPlan] = useState(false);
  const startFlowRef = useRef(false);
  // COMP-008: the three "walked-in-with" readiness facts, captured on the
  // pre-workout prompt where they are accurate rather than recalled after the
  // session. All optional, reset each time the prompt opens. Stored on the
  // scales the workout row + its readers expect (soreness 1-3; sleep/energy on
  // the 1-5 domain, the chips offering 2/3/4).
  const [readiness, setReadiness] = useState({
    soreness24hBefore: null,
    sleepQuality: null,
    energyScore: null,
  });
  const [deloadSuggestion, setDeloadSuggestion] = useState(null);
  const [deloadDismissed, setDeloadDismissed] = useState(false);
  // C18 recovery visibility. NOT a dismissal: the card only collapses once the
  // athlete has opened the explanation, and it never disappears while the
  // state is true. Keyed by block AND state, so a later adaptive reduction, or
  // the recovery week of the next block, opens expanded again rather than
  // hiding behind a tap from a fortnight ago.
  const [recoveryRead, setRecoveryRead] = useState(false);
  // C18: the authoritative programme position, so Home never re-derives it.
  const [programmePosition, setProgrammePosition] = useState(null);
  // C18 long-gap re-entry: asked once per return, never on every screen.
  const [reEntryAsked, setReEntryAsked] = useState(false);
  // Campaign 22 Phase 2 Stage 1 (spec §13 rank 6): the re-entry question's
  // ENTRY is now the Today line, not an auto-firing alert. reEntryDue gates
  // whether the arbiter's re-entry occupant is eligible; the bound facts the
  // tap needs (which session the answer binds to) live on a ref, not state,
  // because they are read exactly once, at tap time, never rendered.
  const [reEntryDue, setReEntryDue] = useState(false);
  const reEntryPendingRef = useRef(null);
  // Campaign 22 Phase 2 Stage 1 (spec §17 R2 "opens the existing expanded
  // detail"): RecoveryStateCard no longer free-stacks above the hero. It
  // stays the exact same component with the exact same props; the Today
  // line's recovery occupant opens it in a sheet instead of rendering it
  // inline every time the state is live.
  const [showRecoveryDetail, setShowRecoveryDetail] = useState(false);

  // B3: lift plateau banner. { exerciseId, line } | null. Defaults dismissed
  // so it never flashes before the stored dismissal has been read (the
  // free-coach-line pattern); loadPlateauBanner reveals it.
  const [plateauBanner, setPlateauBanner] = useState(null);
  const [plateauBannerDismissed, setPlateauBannerDismissed] = useState(true);

  // S6: the in-app half of the activation lever, for a still-present but stalled
  // brand-new user (the push reaches the gone-quiet one). Tier-blind.
  const [activationNudge, setActivationNudge] = useState(null);
  const [activationNudgeDismissed, setActivationNudgeDismissed] = useState(true);

  // Pre-workout coaching brief
  const [briefDismissed, setBriefDismissed] = useState(false);

  // Phase sync banner
  const [phaseMismatch, setPhaseMismatch] = useState(null); // { currentPhase, targetPhase } | null
  const [phaseBannerDismissed, setPhaseBannerDismissed] = useState(false);

  // Fatigue trend mini-graph
  const [fatigueSessions, setFatigueSessions] = useState([]); // array newest-first

  const pendingStartRef = React.useRef(null); // ({ routineId, initialExercises })

  const scrollRef = useRef(null);
  useScrollToTop(scrollRef);

  useEffect(() => {
    return navigation.getParent()?.addListener('tabPress', () => {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    });
  }, [navigation]);

  function dismissCoachingNudge() {
    setShowCoachingNudge(false);
    AsyncStorage.setItem('@volyume_seen_coaching_nudge', 'true').catch(() => {});
  }

  useFocusEffect(
    useCallback(() => {
      // Reset starting flag when screen regains focus (prevents "Session in Progress"
      // flashing during the navigation transition away to ActiveWorkout)
      setIsStartingWorkout(false);
      if (user?.id) {
        if (!seeded) {
          seedRoutinesIfNeeded(user.id).catch((e) => logWarn('HomeScreen.seedRoutines', e?.message));
          setSeeded(true);
        }
        loadData();
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id]),
  );

  // Re-fetch when a cloud pull lands so the empty state replaces itself
  // with the restored plan / history without the user needing to
  // navigate away and back.
  useEffect(() => {
    if (cloudSyncVersion > 0 && user?.id) {
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudSyncVersion]);

  // Safety-net delayed refreshes after sign-in. The cloudSyncVersion
  // effect above usually fires fast enough, but pull payloads can be
  // large (450+ exercises, 100+ routines, hundreds of sets) and the
  // version flips only after the WHOLE pull completes. Re-loading at
  // +3s + +10s catches the case where some inserts land after the
  // first effect ran. Cheap; only runs once per session per user.
  useEffect(() => {
    if (!user?.id) return;
    const t1 = setTimeout(() => loadData().catch(() => {}), 3000);
    const t2 = setTimeout(() => loadData().catch(() => {}), 10000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function loadData() {
    // HP-7: clear the loading spinner in a finally so a single rejected
    // loader can't leave Home spinning forever. The loaders each guard
    // their own errors, but Promise.all rejects on the first unhandled
    // throw and would otherwise skip setInitialLoading(false).
    try {
      await Promise.all([
        loadWeekStats(),
        loadNextWorkout(),
        loadExerciseCounts(),
        loadBlockProgress(),
        loadPhaseBanner(),
        loadPlateauBanner(),
        loadFatigueTrend(),
        loadBriefDismissal(),
        loadWelcome(),
        loadHytOffer(),
        loadActivationNudge(), // S6: tier-blind, computes from workouts + account age + ED flag
        loadTodayWeight(),
        loadLatestCoachOutput(),
        loadFirstReviewFacts(),
      ]);
      // FOUNDER DECISION (fully free, no tier split): activation-funnel
      // marker for a signed-in user's first successful Home render.
      // Fire-and-forget, no payload; trackFirst is durably once-per-user.
      if (user?.id) {
        try {
          // eslint-disable-next-line global-require
          const { trackFirst } = require('../lib/telemetry/firsts');
          trackFirst(user.id, 'first_home_landed').catch(() => {});
        } catch (_) { /* best-effort telemetry */ }
      }
    } finally {
      setInitialLoading(false);
    }
  }

  async function loadLatestCoachOutput() {
    try {
      const out = await getLatestCoachOutput(user.id);
      setLatestCoachOutput(out);
      // PM-06 (D96): Home advertised "this week's decision" on hasEnoughData
      // plus a freshness window alone, while the Coach tab applied the
      // stricter completed-decision predicate. The two surfaces could
      // disagree, and the one saying yes was the one that could be wrong.
      try {
        const outCheckin = out?.weekStart
          ? await getLatestCheckin(user.id, out.weekStart)
          : null;
        setLatestCoachDecisionComplete(isCompletedCoachDecision(out, outCheckin));
      } catch (_) { setLatestCoachDecisionComplete(false); }
      const dismissedKey = out ? `@volyume_coach_banner_dismissed_${out.weekStart}` : null;
      if (dismissedKey) {
        const v = await AsyncStorage.getItem(dismissedKey);
        setCoachBannerDismissed(v === 'true');
      } else {
        setCoachBannerDismissed(false);
      }
    } catch (_) {}
  }

  // Campaign 22 Phase 2 Stage 2 (HOME-TODAY-UX-SPEC.md §9/§17 region R4;
  // FOUNDER-RULINGS-PHASE2 R2): raw facts for the self-retiring first-review
  // readiness line. Gathers the SAME Monday-anchored weigh-in window and
  // coach-ledger inputs the You tab's own coachReadiness effect computes
  // (screens/YouScreen.js); the actual gate/threshold judgement happens once,
  // in the coach-ledger builder (src/lib/coachLedger.js) via
  // src/lib/home/firstReviewLine.js, never re-derived here. This loader
  // only reads the inputs.
  async function loadFirstReviewFacts() {
    try {
      if (!user?.id) { setFirstReviewFacts(null); return; }
      const [workouts, weights, edFlag, prefsRaw, wellbeing, checkinRows, intakeSummary] = await Promise.all([
        getAllWorkouts(user.id).catch(() => []),
        getMorningWeightsLast14Days(user.id).catch(() => []),
        // ED-safety, fail CLOSED: a transient flag read maps to the truthy
        // 'read_failed' sentinel, matching every sibling loader on this
        // screen -- evidencePanel.js treats any truthy edFlagOpen as
        // drop-to-neutral.
        getOpenEdPatternFlag(user.id).catch(() => 'read_failed'),
        AsyncStorage.getItem('@volyume_notification_prefs').catch(() => null),
        AsyncStorage.getItem(WELLBEING_KEY).then((v) => v || 'unspecified').catch(() => 'read_failed'),
        getAllWeeklyCheckinsForUser(user.id).catch(() => []),
        // Founder order 2026-08-17: the evidence pane's food-adherence row -
        // day count only, from the same trailing-7-day summary the engine
        // reads. Best-effort; zero simply omits the row.
        getRecentIntakeSummary(user.id).catch(() => null),
      ]);
      let checkinDay = 0;
      try {
        if (prefsRaw) {
          const d = Number(JSON.parse(prefsRaw)?.checkinDay);
          if (Number.isInteger(d) && d >= 0 && d <= 6) checkinDay = d;
        }
      } catch (_) {}
      const completedWorkouts = workouts.filter((w) => w.isCompleted);
      const completedSessions = completedWorkouts.length;
      // Campaign 26 correction (founder device report 2026-08-17): "ever
      // checked in" is derived from REAL check-in HISTORY - any
      // weekly_checkins row carrying an energy score, the same realness
      // signal isCompletedCoachDecision uses. It is deliberately NOT
      // latestCoachDecisionComplete: that predicate is about the CURRENT
      // week's decision and goes false mid-cycle whenever the engine saves
      // a held output before the week's check-in, which regressed a
      // four-week veteran's device to first-review framing.
      const realCheckins = (checkinRows || []).filter((c) => c?.energyScore != null);
      const everCheckedIn = realCheckins.length > 0;
      // Sessions since the last real check-in HAPPENED (its createdAt; the
      // week_start is the fallback for legacy rows without one).
      const lastCheckinAt = everCheckedIn
        ? Math.max(...realCheckins.map((c) => Number(c.createdAt ?? c.weekStart) || 0))
        : null;
      const sessionsSinceCheckin = lastCheckinAt != null
        ? completedWorkouts.filter((w) => Number(w.startedAt) >= lastCheckinAt).length
        : null;
      // X5/X11 (cross-surface consistency audit 2026-07-30): Monday-anchored,
      // never a rolling window, matching every other "this week" count on
      // this screen and the You tab's own coachReadiness read.
      const weekStartMs = localWeekStartMs();
      const weighIns7d = new Set(
        weights
          .filter((w) => Number.isFinite(Number(w.loggedAt)) && Number(w.loggedAt) >= weekStartMs)
          .map((w) => localDayKey(Number(w.loggedAt))),
      ).size;
      const firstWeightAt = weights.length
        ? Math.min(...weights.map((w) => w.loggedAt ?? Infinity))
        : null;
      // ED-safety parity with the You tab's identical ledger read
      // (YouScreen.js `edSuppressed`): this line prompts for weigh-ins, so
      // it must stay silent in every state where the You tab's readiness
      // ledger goes neutral -- open ED flag, elevated SCOFF, a failed
      // wellbeing read (fail closed), or calm mode. Same formula, so the
      // two surfaces can never disagree about when counting is allowed.
      const edSuppressed = !!edFlag
        || (Number.isFinite(userProfile?.scoffScore) && userProfile.scoffScore >= 2)
        || wellbeing === 'read_failed'
        || isCalm(wellbeing);
      setFirstReviewFacts({
        weighIns7d,
        firstWeightAt: Number.isFinite(firstWeightAt) ? firstWeightAt : null,
        checkinDay,
        edFlagOpen: edSuppressed,
        completedSessions,
        everCheckedIn,
        sessionsSinceCheckin,
        foodDays7: Number(intakeSummary?.daysLogged) || 0,
      });
    } catch (_) {
      setFirstReviewFacts(null);
    }
  }

  async function loadBriefDismissal() {
    try {
      const stored = await AsyncStorage.getItem('@volyume_brief_dismissed_date');
      if (!stored) { setBriefDismissed(false); return; }
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
      setBriefDismissed(stored === todayStr);
    } catch (_) {
      setBriefDismissed(false);
    }
  }

  async function dismissBrief() {
    setBriefDismissed(true);
    try {
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
      await AsyncStorage.setItem('@volyume_brief_dismissed_date', todayStr);
    } catch (_) {}
  }

  const welcomeKey = user?.id ? `@volyume_home_welcome_${user.id}` : null;
  const hytOfferKey = user?.id ? `@volyume_hyt_offer_${user.id}` : null;

  async function loadHytOffer() {
    if (!hytOfferKey) return;
    try {
      const v = await AsyncStorage.getItem(hytOfferKey);
      setHytOfferDismissed(v === 'true');
    } catch (_) {
      setHytOfferDismissed(true);
    }
  }

  const dismissHytOffer = useCallback(() => {
    setHytOfferDismissed(true);
    if (hytOfferKey) AsyncStorage.setItem(hytOfferKey, 'true').catch(() => {});
  }, [hytOfferKey]);

  async function loadWelcome() {
    if (!welcomeKey) return;
    try {
      const v = await AsyncStorage.getItem(welcomeKey);
      // Absent flag (a brand-new user) -> show; 'true' -> already dismissed.
      setWelcomeDismissed(v === 'true');
    } catch (_) {
      setWelcomeDismissed(true);
    }
  }

  // useCallback: HomeWelcomeCard is memoised (React.memo), so a stable
  // handler identity actually stops it re-rendering on every Home tick.
  const dismissWelcome = useCallback(() => {
    setWelcomeDismissed(true);
    if (welcomeKey) AsyncStorage.setItem(welcomeKey, 'true').catch(() => {});
  }, [welcomeKey]);

  async function loadPhaseBanner() {
    try {
      if (!user?.id || !userProfile?.trainingPhase) return;
      const currentPhase = userProfile.trainingPhase; // e.g. 'bulk', 'cut', 'maintain'

      // Check whether the user has already dismissed the banner for this phase pair
      const dismissedRaw = await AsyncStorage.getItem('@volyume_phase_banner_dismissed_v1');
      const dismissedPhase = dismissedRaw ?? null;
      if (dismissedPhase === currentPhase) {
        setPhaseBannerDismissed(true);
        setPhaseMismatch(null);
        return;
      }
      // If the phase has changed, clear any stale dismissal
      if (dismissedPhase && dismissedPhase !== currentPhase) {
        await AsyncStorage.removeItem('@volyume_phase_banner_dismissed_v1');
      }
      setPhaseBannerDismissed(false);

      // Load saved nutrition targets (global key used by ProGoalSetupScreen)
      const raw = await AsyncStorage.getItem('@volyume_nutrition_targets');
      if (!raw) { setPhaseMismatch(null); return; }
      const targets = JSON.parse(raw);
      // targets.goal is the nutrition key (e.g. 'build', 'mild_cut', 'maintain', 'recomp')
      // We compare against the nutrition key for the current training phase
      const { TRAINING_PHASES } = await import('../lib/coachingGoals');
      const currentNutritionKey = TRAINING_PHASES.find(p => p.value === currentPhase)?.nutritionKey ?? null;
      const savedNutritionKey = targets.goal ?? null;

      if (currentNutritionKey && savedNutritionKey && currentNutritionKey !== savedNutritionKey) {
        // Find the human-readable label for the saved phase
        const savedPhaseEntry = TRAINING_PHASES.find(p => p.nutritionKey === savedNutritionKey);
        const savedPhaseLabel = savedPhaseEntry?.label ?? savedNutritionKey;
        setPhaseMismatch({ currentPhase, savedPhaseLabel });
      } else {
        setPhaseMismatch(null);
      }
    } catch (_) {
      setPhaseMismatch(null);
    }
  }

  async function dismissPhaseBanner() {
    setPhaseBannerDismissed(true);
    try {
      await AsyncStorage.setItem('@volyume_phase_banner_dismissed_v1', userProfile?.trainingPhase ?? '');
    } catch (_) {}
  }

  // B3: proactive plateau-break surfacing. Detection input is training data
  // only (workout sets: load lifted and reps performed via
  // getWorkoutSetsSince); nothing weight- or food-derived feeds it, so no
  // ED-flag/calm suppression is required (COMP-004 scope is weight/food
  // content). Errors swallow to null like the other banner loaders.
  async function loadPlateauBanner() {
    try {
      if (!user?.id) { setPlateauBanner(null); return null; }
      // Eight weeks covers detectPlateau's four-session window for a weekly
      // lift without loading every set ever logged (LB-7 pattern).
      const eightWeeksAgo = Date.now() - 8 * 7 * 24 * 60 * 60 * 1000;
      const recentSets = await getWorkoutSetsSince(user.id, eightWeeksAgo);
      // CC30 (section 7 matrix): sessions trained under an episode
      // conflict leave the plateau window - a stall under restriction is
      // not a stall. No-episode users pass straight through.
      // eslint-disable-next-line global-require
      const { filterCapabilityEligibleSetRows } = require('../lib/database');
      const eligibleSets = await filterCapabilityEligibleSetRows(user.id, recentSets);
      const picked = selectPlateauForBanner(eligibleSets);
      if (!picked) { setPlateauBanner(null); return null; }
      const ex = await getExerciseById(picked.exerciseId);
      if (!ex?.name) { setPlateauBanner(null); return picked; }
      // Dismissible per detected plateau: keyed by exercise + local week.
      // Read the dismissal BEFORE revealing the banner so a banner the user
      // already dismissed can't flash for a frame (trial-banner pattern).
      const dKey = `@volyume_plateau_banner_dismissed_${user.id}_${picked.exerciseId}_${localWeekStartMs()}`;
      const dv = await AsyncStorage.getItem(dKey).catch(() => null);
      setPlateauBannerDismissed(dv === 'true');
      setPlateauBanner({
        exerciseId: picked.exerciseId,
        // RD6-4 (D97-25): the line carries the run's session count so
        // the claim states its own density.
        // C12: session count and span both come from the canonical verdict;
        // selectedFrom adds the "longest current stall" clause only when Home
        // actually chose between several qualifying plateaus.
        line: plateauBannerLine(ex.name, picked.weeks, picked.sessions, picked.selectedFrom),
      });
      return picked;
    } catch (_) {
      setPlateauBanner(null);
      return null;
    }
  }

  function dismissPlateauBanner() {
    setPlateauBannerDismissed(true);
    if (user?.id && plateauBanner) {
      AsyncStorage.setItem(
        `@volyume_plateau_banner_dismissed_${user.id}_${plateauBanner.exerciseId}_${localWeekStartMs()}`,
        'true',
      ).catch(() => {});
    }
  }

  // S6: resolve the activation-nudge stage for the in-app banner. Same pure
  // resolver as the push scheduler, so the two never disagree. Tier-blind.
  async function loadActivationNudge() {
    try {
      if (!user?.id) { setActivationNudge(null); return; }
      // ED-safety, fail CLOSED: a training-encouragement surface must never show
      // over an open ED flag, calm mode, or a FAILED flag/wellbeing read.
      const [edFlag, wellbeing] = await Promise.all([
        getOpenEdPatternFlag(user.id).catch(() => 'read_failed'),
        AsyncStorage.getItem(WELLBEING_KEY).then((v) => v || 'unspecified').catch(() => 'read_failed'),
      ]);
      if (edFlag || wellbeing === 'read_failed' || isCalm(wellbeing)) { setActivationNudge(null); return; }
      // Account-creation date (install proxy) from the live session.
      const createdIso = useAppStore.getState().session?.user?.created_at ?? null;
      const accountCreatedAtMs = createdIso ? new Date(createdIso).getTime() : null;
      if (!Number.isFinite(accountCreatedAtMs)) { setActivationNudge(null); return; }
      // Cheap early-out for established users (past window + grace): skip the
      // full workout read entirely, matching the scheduler. This loader runs on
      // every Home load, so the early-out matters for the whole established base.
      if (Date.now() - accountCreatedAtMs > NUDGE_WINDOW_GRACE_MS) { setActivationNudge(null); return; }
      // Fail safe on a read error (never surface a wrong-stage banner).
      let workouts;
      try {
        workouts = await getAllWorkouts(user.id);
      } catch (_) {
        setActivationNudge(null);
        return;
      }
      const completedStartedAtMs = workouts.filter((w) => w.isCompleted).map((w) => w.startedAt ?? 0);
      const nudge = resolveActivationNudge({ accountCreatedAtMs, completedStartedAtMs, nowMs: Date.now() });
      if (!nudge) { setActivationNudge(null); return; }
      // Per-stage dismissal, read BEFORE reveal so a dismissed banner can't flash.
      const dKey = `@volyume_home_activation_nudge_dismissed_${user.id}_${nudge.stage}`;
      const dv = await AsyncStorage.getItem(dKey).catch(() => null);
      setActivationNudgeDismissed(dv === 'true');
      setActivationNudge(nudge);
    } catch (_) {
      setActivationNudge(null);
    }
  }

  function dismissActivationNudge() {
    setActivationNudgeDismissed(true);
    if (user?.id && activationNudge?.stage) {
      AsyncStorage.setItem(
        `@volyume_home_activation_nudge_dismissed_${user.id}_${activationNudge.stage}`,
        'true',
      ).catch(() => {});
    }
  }

  async function loadFatigueTrend() {
    try {
      if (!user?.id) return;
      const rows = await getRecentWorkoutFeedback(user.id, 6);
      setFatigueSessions(rows);
    } catch (_) {
      setFatigueSessions([]);
    }
  }

  async function loadTodayWeight() {
    try {
      const entry = await getMorningWeightToday(user.id);
      // D153 (founder device verdict 2026-09-06, reversing the display half
      // of C5-P22-01): the body weight typed during setup IS today's morning
      // weight on Today. Hiding it left day 0 with an empty weigh-in strip
      // under a dead-looking Log button, and the founder read that as the
      // weight "not populating". The enrolment marker stays on the row, so
      // the weekly check-in's own "weighed today" claim and the strip's
      // first-use sentence still treat it as a typed figure, and the
      // check-in gate is unchanged. A real weigh-in or a Health import
      // overwrites the row as before.
      setTodayWeight(entry?.weightKg ?? null);
      // Recent weights feed the "last known weight" prefill when today's
      // weight is not logged yet.
      try {
        const recent14 = await getMorningWeights(user.id, 14);
        setRecentWeights(recent14.map(w => w.weightKg).filter(Number.isFinite));
        // Campaign 22 Phase 2 Stage 2 (§11/R1): TodayStrip's first-use
        // tutorial sentence retires once a REAL weigh-in has ever been
        // logged -- the Pro-enrolment seed row (a typed starting point, not
        // a morning the user weighed) never counts, mirroring the same
        // isEnrolmentSeedWeight filter used for todayWeight above.
        setHasEverLoggedWeight(recent14.some((w) => !isEnrolmentSeedWeight(w)));
      } catch (_) {}
    } catch (_) {}
  }

  // COMP-027 Part B: TodayStrip owns the draft input + parsing and hands a kg
  // value here. HomeScreen stays the weight-data owner (it reloads on focus and
  // feeds the coach) and does the optimistic write.
  async function handleLogWeight(weightKg) {
    if (!weightKg || isNaN(weightKg) || weightKg <= 0 || weightKg > 300) return;
    // Optimistic: show the logged weight immediately. SQLite write happens in
    // the background. On failure, revert.
    const previousTodayWeight = todayWeight;
    setTodayWeight(weightKg);
    setSavingWeight(true);
    try {
      await logMorningWeight(user.id, { weightKg, loggedAt: Date.now() });
      // Activation funnel: a deliberate weigh-in from Today, once per user,
      // count only, never the value (same event BodyMetricsScreen emits on
      // its own form; the onboarding auto-seed is deliberately excluded).
      try {
        // eslint-disable-next-line global-require
        const { trackFirst } = require('../lib/telemetry/firsts');
        trackFirst(user.id, 'first_weigh_in').catch(() => {});
      } catch (_) { /* best-effort telemetry */ }
    } catch (e) {
      // Revert the optimistic update and surface the failure.
      setTodayWeight(previousTodayWeight);
      logError('HomeScreen.handleLogWeight', e, { userId: user?.id, weightKg });
      toast.show("Couldn't save weight, try again", { variant: 'error' });
    }
    setSavingWeight(false);
  }

  async function loadWeekStats() {
    try {
      // X5 (cross-surface consistency audit 2026-07-30): this used to use a
      // rolling trailing-7-day window, which could show a different "sessions
      // this week" figure than other Monday-anchored counts on this screen.
      // Every "this week" boundary now comes from the shared dayKey.js
      // helpers so they can never disagree.
      const weekStartMs = localWeekStartMs();
      const weekEndMs = localWeekEndMs(weekStartMs);
      const fourWeeksAgo = Date.now() - 28 * 24 * 60 * 60 * 1000;
      // LB-7: this card needs at most the last four weeks of sets (week
      // stats + the deload window below), not every set ever logged. Load
      // that bounded slice once; the workout list is rows, not sets.
      const [allWorkouts, recentSets] = await Promise.all([
        getAllWorkouts(user.id),
        getWorkoutSetsSince(user.id, fourWeeksAgo),
      ]);
      const thisWeek = allWorkouts.filter(
        w => w.startedAt >= weekStartMs && w.startedAt < weekEndMs && w.isCompleted,
      );
      const workoutIds = new Set(thisWeek.map(w => w.id));
      const weekSets = recentSets.filter(s => workoutIds.has(s.workoutId) && s.setType !== 'warmup');
      const totalVol = weekSets.reduce((t, s) => t + (s.weight || 0) * (s.actualReps || 0), 0);
      setWeekStats({ sessions: thisWeek.length, sets: weekSets.length, volume: totalVol });


      const completed = allWorkouts.filter(w => w.isCompleted).sort((a, b) => b.startedAt - a.startedAt);
      setLastSession(completed[0] || null);
      setTotalSessions(completed.length);

      // Only show the check-in nudge when the check-in screen would actually
      // let the user in. Day-of-week alone is not enough (founder repro,
      // 2026-07-12): a user inside the 5-day baseline window saw "Your weekly
      // check-in is ready", tapped through, and hit the too_soon gate telling
      // them to wait 5 more days. Mirror the WeeklyCheckIn gate exactly:
      // scheduled day AND >= FIRST_CHECKIN_MIN_DAYS since the earliest
      // morning weight AND >= MIN_WEIGH_INS weigh-ins in the trailing week
      // (the same last-14-days query the gate reads).
      if (completed.length >= 3) {
        try {
          const seen = await AsyncStorage.getItem('@volyume_seen_coaching_nudge');
          if (seen !== 'true') {
            const raw = await AsyncStorage.getItem('@volyume_notification_prefs');
            let checkinDay = 0;
            if (raw) {
              const d = Number(JSON.parse(raw)?.checkinDay);
              if (Number.isInteger(d) && d >= 0 && d <= 6) checkinDay = d;
            }
            if (new Date().getDay() === checkinDay) {
              const weights = await getMorningWeightsLast14Days(user.id).catch(() => []);
              const firstAt = weights.length
                ? Math.min(...weights.map(w => w.loggedAt ?? Infinity).filter(Number.isFinite))
                : null;
              const daysOfData = firstAt != null
                ? Math.floor((Date.now() - firstAt) / 86400000)
                : 0;
              const weekAgo = Date.now() - 7 * 86400000;
              // C5-P22-02 (D96): DISTINCT mornings, matching the gate this
              // nudge mirrors and the D93 ledger 500 lines above. Raw rows
              // let two devices' copies of one morning read as two.
              const weighIns7d = new Set(
                weights
                  .filter(w => Number.isFinite(Number(w.loggedAt)) && Number(w.loggedAt) >= weekAgo)
                  .map(w => localDayKey(Number(w.loggedAt)))
              ).size;
              if (daysOfData >= FIRST_CHECKIN_MIN_DAYS && weighIns7d >= MIN_WEIGH_INS) {
                setShowCoachingNudge(true);
              }
            }
          }
        } catch (_) {}
      }



      // Compute tonnage for last session. Usually inside the four-week
      // window already loaded; if the last session is older than that
      // (a returning user), fetch just that one workout's sets.
      if (completed[0]) {
        const lastId = completed[0].id;
        let lastSets = recentSets.filter(s => s.workoutId === lastId);
        if (lastSets.length === 0) {
          lastSets = await getWorkoutSetsForWorkout(lastId);
        }
        // D107-2: per-hand sets count x2, assistance is excluded. Cached
        // library read; a failure falls back to unmapped totals.
        const semantics = await getAllExercises().then(buildLoadSemanticsById).catch(() => null);
        const tonnage = calculateTonnage(lastSets, null, semantics);
        setLastSessionTonnage(tonnage > 0 ? tonnage : null);
      } else {
        setLastSessionTonnage(null);
      }

      // Deload suggestion, build last-4-weeks summary and run shouldDeload
      // Reset dismissed state each time data reloads so a new week's signal shows again
      setDeloadDismissed(false);
      try {
        // Campaign 24 §2 (LOCKED baseline: import + call change only, no
        // behaviour change): bucket-building extracted to the shared
        // buildLast4WeekDeloadBuckets (src/lib/algorithms.js). exerciseMap:
        // null reproduces the hard-coded hasOverMRV: false (D92 residual,
        // unchanged); weeksSinceLastDeloadOverride: 99 reproduces the flat
        // 99; excludeWarmups + repsViaWorkoutRoster together reproduce this
        // screen's exact avgReps sourcing (recentSets filtered by the
        // completed-workout roster for the week, then warm-ups excluded).
        // shouldDeload itself is untouched.
        const last4Weeks = buildLast4WeekDeloadBuckets(recentSets, allWorkouts, null, {
          now: Date.now(),
          excludeWarmups: true,
          repsViaWorkoutRoster: true,
          weeksSinceLastDeloadOverride: 99,
        });
        const result = shouldDeload(last4Weeks);
        setDeloadSuggestion(result.deload ? result : null);
        // NAV-4: the differential loader reads this signal after the parallel
        // pass (state set above is not yet readable in the same pass).
        return { deloadSuggested: !!result.deload };
      } catch (_) {
        setDeloadSuggestion(null);
      }
    } catch (_e) {}
    return { deloadSuggested: false };
  }

  async function loadExerciseCounts() {
    try {
      const counts = await getAllRoutineExerciseCounts();
      setExerciseCounts(counts);
    } catch (_e) {}
  }

  // Keyed by block AND state so each new coaching state gets its own reading.
  const recoveryReadKey = (userId, mesocycleId, state) =>
    `@volyume_recovery_read_${userId}_${mesocycleId}_${state}`;

  async function toggleRecoveryRead() {
    const state = currentMesoWeek?.recoveryState?.state;
    if (!state || !user?.id || !currentMesoWeek?.mesocycleId) return;
    const next = !recoveryRead;
    setRecoveryRead(next);
    const key = recoveryReadKey(user.id, currentMesoWeek.mesocycleId, state);
    try {
      if (next) await AsyncStorage.setItem(key, '1');
      else await AsyncStorage.removeItem(key);
    } catch (_) { /* the card still renders correctly this session */ }
  }

  async function loadBlockProgress() {
    if (!user?.id) return;
    try {
      const week = await getCurrentMesocycleWeek(user.id);
      setCurrentMesoWeek(week);
      if (!week) return;

      // C18 recovery visibility: has this athlete already read THIS state on
      // THIS block? Best-effort - a read failure shows the card expanded,
      // which is the direction that keeps a consequential coaching state
      // visible rather than hiding it.
      const gated = (await resolveProgrammePosition(user.id).catch(() => null))?.recoveryState
        ?? week.recoveryState;
      if (isLighterTrainingState(gated)) {
        const key = recoveryReadKey(user.id, week.mesocycleId, gated.state);
        const seen = await AsyncStorage.getItem(key).catch(() => null);
        setRecoveryRead(!!seen);
      } else {
        setRecoveryRead(false);
      }
      // C18: the recovery-week push was REMOVED (founder ruling). It could
      // only ever run from here, which means it could not tell the athlete
      // anything before they opened Home - and once Home is open the recovery
      // card already says it. A local push scheduled while the user is looking
      // at the card is redundant, and a background scheduler for one
      // notification is not worth building. Home, the next-workout label,
      // Train and the review carry the state.

      // Stage 8 (§3.6): the block-start explanation, derived from the
      // WRITTEN plan rows so it can never claim a personalisation the
      // plan does not contain. Personalised sources only; [] renders
      // nothing. Best-effort: the sheet must open even if this fails.
      // Review #12: a FINISHED block awaiting the user's decision is not
      // a live plan; narrating it in the present tense ("starts at 11
      // sets, building to 17") contradicts the sheet's own finished
      // state. The sheet already renders the finished copy instead.
      if (week.awaitingDecision) {
        setBlockSeedLines([]);
      } else {
        try {
          // eslint-disable-next-line global-require
          const { getPlannedMuscleVolumeForBlock } = require('../lib/database');
          // eslint-disable-next-line global-require
          const { summariseSeededPlan, buildBlockStartLines } = require('../lib/blockExplain');
          const blockRows = await getPlannedMuscleVolumeForBlock(week.mesocycleId);
          const summary = summariseSeededPlan(blockRows, week.plannedWeeks);
          // FB-27/FB-28 (D96): what the PREVIOUS block actually ran, so the
          // lines can be ordered by what moved (sorting by peak buried the
          // one muscle whose peak came down, because a reduction sorts last
          // by construction), retention reads as a decision rather than an
          // absence, and the muscles the three-line cap drops are counted.
          // Only fetched when this block carries a personalised seed, so a
          // first block (the first-use case) pays nothing for it, and only
          // best-effort: without it the lines render exactly as before.
          let previous = null;
          const personalisedSeed = Object.values(summary)
            .some((v) => typeof v?.source === 'string' && v.source.startsWith('seed_')
              && v.source !== 'seed_profile' && v.source !== 'seed_research');
          if (personalisedSeed) {
            try {
              // eslint-disable-next-line global-require
              const { getAllMesocyclesForUser } = require('../lib/database');
              const all = await getAllMesocyclesForUser(user.id);
              const prior = all
                .filter((m) => m.id !== week.mesocycleId && m.blockLedger)
                .sort((a, b) => String(b.startDate ?? '').localeCompare(String(a.startDate ?? '')))[0];
              const record = prior?.blockLedger ? JSON.parse(prior.blockLedger) : null;
              const entries = Array.isArray(record?.entries) ? record.entries : [];
              if (entries.length > 0) {
                previous = {};
                for (const e of entries) {
                  if (!e?.muscle || !e.observed) continue;
                  previous[e.muscle] = {
                    startSets: e.observed.startSets ?? null,
                    peakSets: e.observed.plannedPeak ?? null,
                  };
                }
              }
            } catch (_e) { previous = null; }
          }
          // C6 P9-06 (D97): does this user have ANY prior block history?
          // A template-seeded block after a plan switch must not tell a
          // block-eight user "not enough personal history yet".
          // C6 P-5 (D97-20): "history" means blocks TRAINED, not blocks
          // judged - ledgers only exist where a decision surface computed
          // one, so a mature Free upgrader (or anyone who switched plans
          // past the decision card) had real ended blocks and zero
          // ledgers, and was handed beginner copy. An ended prior block
          // now counts alongside a stored ledger.
          let hadPriorBlocks = false;
          try {
            // eslint-disable-next-line global-require
            const { getAllMesocyclesForUser } = require('../lib/database');
            const all = await getAllMesocyclesForUser(user.id);
            const endedMs = (m) => {
              const t = m.endDate == null ? NaN
                : (typeof m.endDate === 'number' ? m.endDate : new Date(m.endDate).getTime());
              return Number.isFinite(t) ? t : null;
            };
            hadPriorBlocks = all.some((m) => m.id !== week.mesocycleId
              && (m.blockLedger || (endedMs(m) != null && endedMs(m) <= Date.now())));
          } catch (_e) { hadPriorBlocks = false; }
          setBlockSeedLines(buildBlockStartLines({ summary, previous, hadPriorBlocks }));
        } catch (_e) { setBlockSeedLines([]); }
      }

      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      // LB-7: fetch only the last week of sets rather than the whole
      // history then discarding all but seven days of it in JS.
      const [planned, recentSets, allExercises] = await Promise.all([
        getPlannedMuscleVolume(week.id),
        getWorkoutSetsSince(user.id, weekAgo),
        getAllExercises(),
      ]);

      const exerciseMap = Object.fromEntries(allExercises.map(e => [e.id, e]));
      const actual = calculateWeeklyVolume(recentSets, exerciseMap);

      const progress = planned
        .filter(p => p.planned_sets > 0)
        .map(p => ({
          muscle: p.muscle,
          planned: p.planned_sets,
          actual: Math.round(actual[p.muscle]?.workingSets || 0),
          label: MUSCLE_DISPLAY_NAMES[p.muscle] || p.muscle,
        }))
        .sort((a, b) => b.planned - a.planned)
        .slice(0, 8); // top 8 muscles by volume

      setBlockProgress(progress);
      // T2-25: this week's rows already in hand - read the ramp stamp
      // off them rather than fetching anything new.
      try {
        // eslint-disable-next-line global-require
        const { rampMusclesFromPlannedRows, reintroductionRampLine } = require('../lib/capability/reintroduction');
        const rampMuscles = rampMusclesFromPlannedRows(planned);
        setRampLine(rampMuscles.length
          ? reintroductionRampLine(rampMuscles.map((m) => MUSCLE_DISPLAY_NAMES[m] || m))
          : null);
      } catch (_e) { setRampLine(null); }
    } catch (_e) {}
  }

  async function loadNextWorkout() {
    try {
      const plan = await getActivePlan(user.id);
      setActivePlanData(plan || null);
      if (!plan) {
        setNextWorkout(null);
        setPlanAllWorkouts([]);
        setSelectedWorkoutOverride(null);
        setPlanHasNoSessions(false);
        setProgrammePosition(null);
        return;
      }
      const routines = await getRoutinesForPlan(plan.id);
      setPlanAllWorkouts(routines);
      setSelectedWorkoutOverride(null);
      // B-2 (F-18): a plan with no sessions is its own hero state. It used to
      // fall through to "No active plan yet", which was false for someone who
      // owned a plan, and whose offered fix would have replaced it.
      setPlanHasNoSessions(routines.length === 0);
      if (routines.length === 0) { setNextWorkout(null); setProgrammePosition(null); return; }
      // C18 BLOCK PROGRESSION. This used to read
      // `(plan.nextWorkoutIndex || 0) % routines.length` - a single integer
      // advanced blindly on any completion, so training out of order moved it
      // past an unperformed required session and Home then offered the wrong
      // workout every session until the athlete corrected it by hand.
      //
      // The next workout is now the first OUTSTANDING required session in
      // programme order, from the same resolver Plans and Train read, so the
      // three cannot disagree. A read failure falls back to the plan's first
      // routine rather than the retired pointer.
      const position = await resolveProgrammePosition(user.id).catch(() => null);
      setProgrammePosition(position);
      // C18 re-entry race fix: reEntryCheckDue needs the authoritative
      // last-completed-workout timestamp from THIS load, not the
      // `lastSession` React state - that state is written by the parallel
      // loadWeekStats loader in the same loadData() Promise.all batch, and
      // Promise.all gives no ordering guarantee between concurrently
      // dispatched loaders, so reading lastSession here raced: it could see
      // the previous render's value (or null on first load) instead of what
      // this run actually found. A self-contained read removes the race
      // outright with no delay - it is one more bounded query already
      // running inside the same parallel batch, not a new blocking step.
      const allWorkoutsForReEntry = await getAllWorkouts(user.id).catch(() => []);
      const lastCompletedAtMs = allWorkoutsForReEntry.reduce(
        (max, w) => (w.isCompleted && Number(w.startedAt) > max ? Number(w.startedAt) : max),
        0,
      ) || null;
      maybeAskReEntry(position, lastCompletedAtMs);
      const next = position?.nextSession ?? null;
      // B-1 (F-18). THE WEEK-COMPLETE FACT, not a fallback. With every
      // required session at this position resolved there is no next workout,
      // and `idx = 0` below used to hand back the plan's FIRST routine - so
      // Today re-offered session 1 under the eyebrow "Day 1 of N" with
      // nothing saying the week's work was done. The hero renders the
      // week-complete state instead; an extra session stays available as a
      // deliberate choice through the workout-options sheet.
      if (!next && isWeekComplete(position)) { setNextWorkout(null); return; }
      const idx = next
        ? Math.max(0, routines.findIndex((r) => r.id === next.routineId))
        : 0;
      setNextWorkout({ routine: routines[idx], total: routines.length, idx });
    } catch (_e) {
      setNextWorkout(null);
      setPlanAllWorkouts([]);
      setSelectedWorkoutOverride(null);
      setPlanHasNoSessions(false);
    }
  }

  // ── C18 ONE-TIME SKIP ────────────────────────────────────────────────────
  //
  // Instance-scoped intent, and nothing more. It resolves THIS occurrence of
  // THIS required session so the programme stops bringing it back. It does not
  // remove the workout, change the split, exclude any exercise, reduce future
  // frequency, infer dislike or injury, or count as training. No reason is
  // asked for, and none is inferred: an unstated reason is UNKNOWN.
  async function handleSkipThisWorkout() {
    const position = programmePosition;
    const session = position?.nextSession;
    if (!user?.id || !session || !position?.activeWeekId) return;
    // Only warn about the recovery week when resolving THIS session genuinely
    // finishes the pre-recovery work, so the sentence is never a guess.
    const recoveryNext = position.sessions
      .filter((x) => x.routineId !== session.routineId)
      .every((x) => x.state !== 'outstanding');
    const copy = skipConfirmation(session, position.sessions, { recoveryNext });
    if (!copy) return;
    appAlert(copy.title, copy.body, [
      { text: copy.cancel, style: 'cancel' },
      {
        text: copy.confirm,
        onPress: async () => {
          try {
            await recordSessionResolution(user.id, {
              mesocycleWeekId: position.activeWeekId,
              routineId: session.routineId,
              mesocycleId: position.blockId,
              resolution: 'skipped_by_user',
            });
            // C18 re-entry amendment: skipping the bound session resolves
            // it without ever starting a workout, so nothing in
            // ActiveWorkoutScreen would retire a pending ease decision for
            // it - do that here instead. A decision bound to some other
            // session is untouched.
            await clearPendingReEntryEaseIfMatches(user.id, {
              mesocycleWeekId: position.activeWeekId,
              routineId: session.routineId,
            });
            await loadNextWorkout();
            await loadBlockProgress();
          } catch (e) {
            logError('HomeScreen.handleSkipThisWorkout', e, { userId: user?.id });
            toast.show("Couldn't skip that workout, try again", { variant: 'error' });
          }
        },
      },
    ]);
  }

  // ── C18 LONG-GAP RE-ENTRY ────────────────────────────────────────────────
  //
  // TIME MAY QUESTION THE PRESCRIPTION. TIME MAY NOT CHANGE THE NEXT WORKOUT.
  // The outstanding session is untouched by this: Legs is still Legs after
  // twenty days. All this does is ask, once, before the same peak targets are
  // handed back, and record what the athlete said.
  // Campaign 22 Phase 2 Stage 1 (HOME-TODAY-UX-SPEC.md §13 rank 6): this used
  // to open the prompt itself, the moment the due state was detected. It now
  // only DETECTS the due state and remembers the exact bound session facts
  // for the tap handler below -- the Today line's re-entry occupant is the
  // entry point now, and the prompt/record flow it opens on tap is
  // byte-identical to what used to fire automatically.
  async function maybeAskReEntry(position, lastWorkoutAtMs) {
    if (!user?.id || reEntryAsked) return;
    try {
      const key = `@volyume_reentry_answered_${user.id}`;
      const answeredFor = await AsyncStorage.getItem(key).catch(() => null);
      const check = reEntryCheckDue({
        lastWorkoutAtMs: lastWorkoutAtMs ?? null,
        nowMs: Date.now(),
        sessionsPerWeek: position?.sessions?.length ?? null,
        answeredFor,
      });
      if (!check) return;
      setReEntryAsked(true);
      // The exact outstanding required session at the moment the question
      // became due - the one and only session an easeReturn answer may bind
      // to. Captured now (not at tap time) so a later loadData() refresh
      // (e.g. the athlete switching workouts before answering) cannot change
      // what the eventual answer binds to.
      reEntryPendingRef.current = {
        check,
        boundWeekId: position?.activeWeekId ?? null,
        boundRoutineId: position?.nextSession?.routineId ?? null,
      };
      setReEntryDue(true);
    } catch (e) {
      logError('HomeScreen.maybeAskReEntry', e, { userId: user?.id });
    }
  }

  // The tap handler: opens the exact same prompt/record flow that used to
  // fire automatically. Outcomes, the AsyncStorage answered-key and the
  // pending-ease bind are unchanged.
  function handleReEntryPress() {
    const pending = reEntryPendingRef.current;
    if (!user?.id || !pending) return;
    setReEntryDue(false);
    const { check, boundWeekId, boundRoutineId } = pending;
    const key = `@volyume_reentry_answered_${user.id}`;
    const prompt = reEntryPrompt(check);
    const record = async (answer) => {
      const outcome = reEntryOutcome(answer);
      try { await AsyncStorage.setItem(key, check.key); } catch (_) { /* asked again next open */ }
      // C18 re-entry amendment: persist the actionable ease decision, not
      // just the "asked" marker. Only when there IS an outstanding
      // required session to bind it to - with nothing outstanding there
      // is no next session for "a little easier" to mean anything about.
      if (outcome.easeReturn && boundWeekId && boundRoutineId) {
        await setPendingReEntryEase(user.id, { mesocycleWeekId: boundWeekId, routineId: boundRoutineId });
      }
      if (outcome.note) toast.show(outcome.note, { variant: 'info' });
    };
    appAlert(prompt.title, prompt.body, [
      { text: prompt.options[0].label, onPress: () => record(RE_ENTRY_ANSWER.TRAINED_ELSEWHERE) },
      { text: prompt.options[1].label, onPress: () => record(RE_ENTRY_ANSWER.DID_NOT_TRAIN) },
      { text: prompt.options[2].label, style: 'cancel', onPress: () => record(RE_ENTRY_ANSWER.CONTINUE) },
    ]);
  }

  // ── D139: "Start with a plan", in two steps. ────────────────────────────
  // Step 1 previews: the capability pre-flight and the READ-ONLY dry run,
  // then the sheet. Nothing is generated, saved or activated here.
  async function handleStartWithPlanPress() {
    if (startWithPlanRef.current) return;
    startWithPlanRef.current = true;
    setPreparingPlan(true);
    try {
      const prep = await prepareStartWithPlan(user.id, userProfile, { mode: 'first' });
      if (!prep.ok) {
        // A hold at the pre-flight leaves the empty state in place to try
        // again, and says nothing extra: the choice was the athlete's.
        if (prep.reason === 'dry_run_failed') {
          logError('HomeScreen.startWithPlanPreview', new Error(prep.error ?? 'plan_generation_failed'), { userId: user?.id });
          toast.show("Couldn't start your plan, try again", { variant: 'error', duration: 5000 });
        }
        return;
      }
      setPlanPreview({ preview: prep.preview, otherPlansCount: prep.otherPlansCount });
    } finally {
      startWithPlanRef.current = false;
      setPreparingPlan(false);
    }
  }

  // Step 2 commits, only from the sheet's confirm button.
  async function handleConfirmStartWithPlan() {
    if (startingPlan) return;
    setStartingPlan(true);
    let result = { ok: false, error: 'not attempted' };
    try {
      result = await commitStartWithPlan(user.id, userProfile);
    } catch (e) {
      result = { ok: false, error: e?.message ?? 'unknown' };
    }
    setStartingPlan(false);
    if (result.ok) {
      setPlanPreview(null);
      await loadData();
      // D112 R5 (closes audit T1-12): every generation entry
      // reveals capability effects, not just PlanUpdateScreen.
      if (result.capabilityBlockedCount > 0) {
        toast.show(capabilityBlockedNote(result.capabilityBlockedCount), { variant: 'info', duration: 5000 });
      }
    } else {
      logError('HomeScreen.startWithPlan', new Error(result.error ?? 'plan_generation_failed'), { userId: user?.id });
      toast.show("Couldn't start your plan, try again", { variant: 'error', duration: 5000 });
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    // If there's an active cloud session, fire pullFromCloud first so a
    // returning user on a fresh device can manually retry the restore
    // by pulling down. Status surfaces via the banner; local re-load
    // happens regardless so any new data already in SQLite shows.
    try {
      const sessionUser = useAppStore.getState().session?.user;
      if (sessionUser?.id) {
        const store = useAppStore.getState();
        store.markCloudSyncing();
        // eslint-disable-next-line global-require
        const { pullFromCloud } = require('../lib/sync');
        pullFromCloud(sessionUser.id)
          .then(() => useAppStore.getState().markCloudSyncComplete())
          .catch((err) => useAppStore.getState().markCloudSyncError(err?.message));
      }
    } catch (_) {}
    await loadData();
    setRefreshing(false);
  }

  async function handleStartNextWorkout(starter = false) {
    const target = selectedWorkoutOverride || nextWorkout;
    if (!target?.routine) return;
    // R2-1 (founder defect, build 2684): a second trigger while the routine
    // was still loading (or the sheet already up / a start committing) queued
    // a second prompt-open that resolved AFTER the workout began - and the
    // shared BottomSheet floats above the navigator, so the ask re-appeared
    // over the live session. One start flow at a time; the ref is synchronous
    // so a rapid double-tap can't race the state reads.
    if (startFlowRef.current || showIntentPrompt || isStartingWorkout) return;
    startFlowRef.current = true;
    try {
      const routine = target.routine;
      const withExercises = await getRoutineExercisesWithDetails(routine.id);
      const initialExercises = withExercises.map(({ exercise, routineExercise }) => ({
        exercise, routineExercise, sets: [],
        // Hydrate plan-time superset pairings onto the workout entry so
        // ActiveWorkoutScreen renders them as paired from the start.
        supersetGroupId: routineExercise?.supersetGroupId ?? null,
        // EL-9 (docs/exercise-library-expansion-2026-09-05/05-DECISIONS.md):
        // hydrate the circuit stamp + round rest alongside the superset id.
        groupKind: routineExercise?.groupKind ?? null,
        roundRestSeconds: routineExercise?.roundRestSeconds ?? null,
      }));
      pendingStartRef.current = {
        routineId: routine.id,
        initialExercises,
        starter,
        routineName: routine.name,
        // Position, not the wall clock, owns the required-session instance.
        // This remains the same for a temporary out-of-order selection: that
        // choice may resolve another routine in this week but cannot move the
        // workout into the calendar's later week.
        mesocycleWeekId: programmePosition?.activeWeekId,
      };
      // D2 (founder decision 2026-07-03, Option A): a user who opted out of
      // the readiness ask starts immediately with NO readiness signal, the
      // exact Skip path, all-null inputs. Coaching input is never fabricated;
      // with nothing stated, session adjustments simply do not fire
      // (READINESS_RULES has no null key). Re-read each start so flipping the
      // Settings toggle takes effect on the very next session.
      const promptOff = await AsyncStorage.getItem('@volyume_intent_prompt_off').catch(() => null);
      if (promptOff === 'true') {
        confirmStart(null, { soreness24hBefore: null, sleepQuality: null, energyScore: null });
        return;
      }
      // Clear any readiness from a previously-cancelled prompt so each session
      // starts from blank chips and no remembered intent.
      setReadiness({ soreness24hBefore: null, sleepQuality: null, energyScore: null });
      setShowIntentPrompt(true);
    } catch (e) {
      setIsStartingWorkout(false);
      logError('HomeScreen.handleStartNextWorkout', e, { userId: user?.id, routineId: target?.routine?.id });
      toast.show("Couldn't load workout, try again", { variant: 'error' });
    } finally {
      startFlowRef.current = false;
    }
  }

  // COMP-008: an intent tap carries whatever readiness chips were set; Skip
  // passes intent null and no readiness (see the intent sheet). The values flow
  // straight into createWorkout, which writes them to the workout row.
  async function confirmStart(intent, readinessOverride = readiness) {
    setShowIntentPrompt(false);
    const pending = pendingStartRef.current;
    if (!pending) return;
    setIsStartingWorkout(true);
    try {
      const workout = await createWorkout(user.id, pending.routineId, {
        intent,
        ...readinessOverride,
        mesocycleWeekId: pending.mesocycleWeekId,
      });
      startWorkout(workout, pending.initialExercises);
      // Always pass starterSession explicitly so a normal start can never inherit
      // a stale starterSession:true param on a reused ActiveWorkout instance.
      navigation.navigate('ActiveWorkout', {
        starterSession: !!pending.starter,
        starterRoutineName: pending.routineName,
      });
      // COMP-015 (FOUNDER DECISION: fully free, applies to everyone now):
      // compute + log this session's adjustments in the background so it
      // never delays the session opening. The line appears a moment later
      // once the local reads resolve. Runs once per start; a crash-recovery
      // restore rehydrates the result instead of recomputing.
      computeAndLogSessionAdjustments({ userId: user.id, workout, exercises: pending.initialExercises })
        .then(setSessionAdjustments)
        .catch(() => {});
    } catch (e) {
      setIsStartingWorkout(false);
      logError('HomeScreen.confirmStart', e, { userId: user?.id, routineId: pending?.routineId, intent });
      toast.show("Couldn't start workout, try again", { variant: 'error' });
    }
    pendingStartRef.current = null;
  }

  // Blank session: no plan, no routine, no preloaded exercises. The
  // previous flow just did navigation.navigate('ActiveWorkout', {
  // blank: true }), but ActiveWorkoutScreen never read that param, so
  // the screen rendered with workoutStartTime=null and the timer was
  // frozen at 0:00 with non-responsive buttons. This helper does the
  // same prep the planned-session flow does: create the workout row,
  // mark it active in the store, then navigate. Used by both quick-
  // start surfaces below.
  async function startBlankSession() {
    if (!user?.id) return;
    try {
      const workout = await createWorkout(user.id, null, { intent: null });
      startWorkout(workout, []);
      navigation.navigate('ActiveWorkout');
    } catch (e) {
      logError('HomeScreen.startBlankSession', e, { userId: user?.id });
      toast.show("Couldn't start workout, try again", { variant: 'error' });
    }
  }

  // useCallback: HomeLastSessionCard is memoised (React.memo), so a stable
  // handler identity actually stops it re-rendering on every Home tick.
  const handleRepeatLastSession = useCallback(async () => {
    if (!lastSession) return;
    // R2-1: same single-flight guard as handleStartNextWorkout - this is the
    // other surface that opens the intent sheet, and the two must never race.
    if (startFlowRef.current || showIntentPrompt || isStartingWorkout) return;
    startFlowRef.current = true;
    const routineId = lastSession.routineId || lastSession.routine_id || null;

    try {
      let initialExercises;
      if (routineId) {
        // Load the FULL routine, not just what was done last time
        const withExercises = await getRoutineExercisesWithDetails(routineId);
        initialExercises = withExercises.map(({ exercise, routineExercise }) => ({
          exercise, routineExercise, sets: [],
          supersetGroupId: routineExercise?.supersetGroupId ?? null,
          // EL-9 (docs/exercise-library-expansion-2026-09-05/05-DECISIONS.md):
          // hydrate the circuit stamp + round rest alongside the superset id.
          groupKind: routineExercise?.groupKind ?? null,
          roundRestSeconds: routineExercise?.roundRestSeconds ?? null,
        }));
      } else {
        // No routine linked, fall back to exercises from the session's sets
        const prevSets = await getWorkoutSetsForWorkout(lastSession.id);
        const seenIds = [];
        const orderedExerciseIds = [];
        const setCounts = {};
        for (const s of prevSets) {
          if (!s.exerciseId) continue;
          if (!seenIds.includes(s.exerciseId)) {
            seenIds.push(s.exerciseId);
            orderedExerciseIds.push(s.exerciseId);
          }
          if ((s.setType ?? s.set_type ?? 'straight') !== 'warmup') {
            setCounts[s.exerciseId] = (setCounts[s.exerciseId] || 0) + 1;
          }
        }
        // Round 13 (R13-1): this was the FOURTH keyless slot construction
        // - the session effects record keys per slot (rowId =
        // routineExercise.id), and rounds 11-12 minted ids at the other
        // three ad-hoc entry points while Home's own repeat card built
        // routineExercise: null, so the whole per-slot machinery
        // (conversion on removal included) silently degraded on exactly
        // these sessions. Adapted from WorkoutHistoryScreen's
        // repeat-as-is shape (minted id + the previous session's
        // working-set count, so the target line stays honest) - the one
        // deliberate difference: an all-warm-up previous session falls
        // to 3 here rather than the warm-up count.
        initialExercises = (
          await Promise.all(orderedExerciseIds.map(id => getExerciseById(id).catch(() => null)))
        )
          .filter(Boolean)
          .map(exercise => ({
            exercise,
            routineExercise: { id: uid(), recommendedSets: setCounts[exercise.id] || 3 },
            sets: [],
          }));
      }

      pendingStartRef.current = { routineId, initialExercises };
      setReadiness({ soreness24hBefore: null, sleepQuality: null, energyScore: null });
      setShowIntentPrompt(true);
    } catch (e) {
      logError('HomeScreen.handleRepeatLastSession', e, { userId: user?.id, lastSessionId: lastSession?.id, routineId });
      toast.show("Couldn't load last session, try again", { variant: 'error' });
    } finally {
      startFlowRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastSession, user?.id, toast]);

  const hasActiveWorkout = !!activeWorkout && !isStartingWorkout;
  const displayWorkout = selectedWorkoutOverride || nextWorkout;
  // D-P2-2: the displayed session's circuit line ("Circuit · 3 stations · 3
  // rounds · 90s between rounds"), or '' when the session has no circuit.
  // Read once per displayed routine; a failed read leaves the count line.
  const [circuitLine, setCircuitLine] = useState('');
  const displayRoutineIdForCircuit = displayWorkout?.routine?.id ?? null;
  useEffect(() => {
    let alive = true;
    setCircuitLine('');
    if (!displayRoutineIdForCircuit) return undefined;
    getRoutineExercisesWithDetails(displayRoutineIdForCircuit)
      .then((rows) => {
        if (!alive) return;
        const groups = summariseCircuitGroups((rows ?? []).map((r) => r.routineExercise));
        setCircuitLine(groups.length ? groups.map(formatCircuitPreviewLine).filter(Boolean).join(' · ') : '');
      })
      .catch(() => { /* best effort: the count line stands */ });
    return () => { alive = false; };
  }, [displayRoutineIdForCircuit]);
  // ── HERO PRECEDENCE (F-18; evidence B-1, B-2, B-3). Stated once, here,
  // because three regions of this screen used to answer "what is today?"
  // independently and could contradict one another (the Today line said
  // "Block complete" while the hero below it offered "Start workout" on
  // session 1). Exactly one branch of the hero renders, in this order:
  //
  //   1. active workout           - resume it; nothing outranks a live session
  //   2. block awaiting decision  - the hero IS the decision (B-3)
  //   3. week complete            - every required session resolved (B-1)
  //   4. next session             - the normal training-day hero
  //   5. empty states             - active plan with no sessions (B-2), then
  //                                 no plan at all
  //
  // Picking a workout from the options sheet (selectedWorkoutOverride) is a
  // deliberate choice to train anyway, so it drops states 2 and 3 to state 4
  // and the athlete gets the ordinary Start action for what they chose.
  const blockAwaitingDecision = !!currentMesoWeek?.awaitingDecision && !selectedWorkoutOverride;
  const weekComplete = !blockAwaitingDecision
    && isWeekComplete(programmePosition) && !selectedWorkoutOverride;
  // Canonical plan reference (issue 4): plan name + day descriptor from the
  // shared formatter, so this card can never drift from the Train tab again.
  // Must-fix 3 (2026-07-11): the hero eyebrow is a heading, so it drops the
  // "N×/Week" frequency baked into plan.name via planHeadingName() - the
  // raw name (with frequency) is kept everywhere else that reads
  // activePlan.name.
  const planProgress = displayWorkout
    ? activePlanLine(planHeadingName(activePlan?.name), displayWorkout?.idx ?? 0, nextWorkout?.total ?? 1)
    : null;
  // C18 recovery visibility: the NEXT-WORKOUT surface names the state too, so
  // the session the athlete is about to start says what it is before they open
  // it. Straight from the block's resolved state - never re-derived here, and
  // never the word "week" on an adaptive reduction, which would claim the hard
  // part of the block had finished when it has not.
  // C18: the GATED state. programmePosition re-resolves recovery knowing
  // whether any required accumulation session is still outstanding, so the
  // planned recovery week cannot appear while the athlete still owes work.
  // The calendar-side reading is the fallback only when position is unreadable.
  const gatedRecoveryState = programmePosition?.recoveryState
    ?? currentMesoWeek?.recoveryState ?? null;
  const recoveryLabel = nextWorkoutRecoveryLabel(gatedRecoveryState);

  // Derive how many days since last completed workout (null = no history)
  const lastWorkoutDaysAgo = lastSession
    ? Math.floor((Date.now() - lastSession.startedAt) / (24 * 60 * 60 * 1000))
    : null;

  // Compute pre-workout coaching brief (shown only when plan active + not trained today + not dismissed)
  const showCoachBrief = !!activePlan && !hasActiveWorkout && lastWorkoutDaysAgo !== 0 && !briefDismissed;

  // CC31 (section BD-D8): detect active episode-role capability constraint.
  // Best-effort: error → false. Try to use composed intentState if available,
  // otherwise lazy-load the resolve state.
  // D112 R5 (closes audit T1-14/T2-31): "applied" narrowed to match the
  // gate serve-time substitution itself uses (sessionEffective.js) -- an
  // episode rule that is only declared, not yet Applied, is not actually
  // changing what the logger serves, so the line must not claim it is.
  const [activeConstraint, setActiveConstraint] = useState(false);
  // Natural coach-language order (2026-08-21): the short honest name for
  // what the temporary change covers, or null for the generic brief line.
  const [constraintSubject, setConstraintSubject] = useState(null);
  // D112 R5 (closes audit T1-15/T2-24): the one episode group (if any)
  // sitting in AWAITING_CONFIRMATION -- past its planned end, still
  // applying (fail-safe), not yet answered. null when none is awaiting.
  const [awaitingConstraint, setAwaitingConstraint] = useState(null);
  // CC33 adversarial review (E1): a rule that ARRIVED undecided - synced
  // from another device, or left unanswered across a relaunch - was
  // invisible here (the works-around line needs 'applied'), so the only
  // surface that could offer the decision was HowYouTrain itself. One
  // quiet ask-class row closes that; tapping through lands on the screen
  // whose own focus detector (T1-06) proposes immediately.
  const [undecidedConstraint, setUndecidedConstraint] = useState(false);
  // CC33 round 9 (B4/E1): when the capability read fails with NO known
  // state this session, the resolver synthesises an EMPTY state
  // (unavailable: true, stale: false - resolve.js section 9.6), every row
  // above simply vanishes, and "could not check" was indistinguishable
  // from "nothing going on". One quiet non-tappable line says so honestly.
  // Stale-but-KNOWN state (unavailable && stale) keeps serving normally
  // per CAP-17, exactly as the tappable rows already do.
  const [capabilityCheckFailed, setCapabilityCheckFailed] = useState(false);
  // T2-30 (D112 R6, verified at W4 build 2026-08-28): this read only ever
  // re-ran on [user?.id], so a rule that arrived by sync while Home sat in
  // the background (or a rule ended/changed on another screen) never
  // updated this line until the app relaunched. useFocusEffect is this
  // screen's own established pattern for "re-read when the user comes
  // back" (loadData() above uses the same shape) - nothing about the read
  // itself changes, it just runs on focus too now.
  useFocusEffect(
    useCallback(() => {
      if (!user?.id) return undefined;
      // Round 10 (B4): the cancellation guard the effect's setters never
      // had - two overlapping focus cycles resolving out of order (a
      // slow failing read landing after a fast good one) could leave any
      // of the five flags describing the older read. Blur cancels the
      // in-flight application; only the current focus's read writes.
      let cancelled = false;
      (async () => {
        try {
          // eslint-disable-next-line global-require
          const { loadCapabilityResolveState } = require('../lib/capability/resolve');
          const state = await loadCapabilityResolveState(user.id, {});
          if (cancelled) return;
          // D134: the offer card retires by itself the moment anything is
          // set up; "nothing" means no rows at all, history included, so a
          // person who set something up and ended it is never re-offered.
          try {
            // eslint-disable-next-line global-require
            const { loadCapabilityState } = require('../lib/capability/store');
            const full = await loadCapabilityState(user.id);
            if (!cancelled) setHytNothingSetUp(!full.unavailable && !full.baseline.length && !full.episodes.length && !full.history.length);
          } catch (_) { if (!cancelled) setHytNothingSetUp(false); }
          const episodeRows = Array.isArray(state?.restrictions)
            // Lead tighten (W3 review, D112 R8): a HELD episode must not
            // drive the "works around" line - the serve layer holds it, so
            // the claim would be false. Applied-and-not-held only, matching
            // the serve gate plus the hold filter it gained.
            ? state.restrictions.filter(r => r.role === 'episode' && r.effectiveChoice === 'applied' && r.adaptationMode !== 'hold') : [];
          setActiveConstraint(episodeRows.length > 0);
          try {
            // eslint-disable-next-line global-require
            const { subjectPhrase } = require('../lib/capability/phrase');
            setConstraintSubject(subjectPhrase(episodeRows, {}));
          } catch (_) { setConstraintSubject(null); }
          // T1-15/T2-24: grouped the same way the settings store groups
          // episodes (capability/store.js's loadCapabilityState), from the
          // rows this effect already has in hand -- no second DB read.
          try {
            // eslint-disable-next-line global-require
            const { episodeStatus } = require('../lib/capability/model');
            // eslint-disable-next-line global-require
            const { subjectPhrase } = require('../lib/capability/phrase');
            const groups = new Map();
            for (const r of (state?.restrictions ?? [])) {
              if (r.role !== 'episode' || !r.episodeGroupId) continue;
              if (!groups.has(r.episodeGroupId)) groups.set(r.episodeGroupId, []);
              groups.get(r.episodeGroupId).push(r);
            }
            let awaiting = null;
            for (const rows of groups.values()) {
              if (episodeStatus(rows, Date.now()) === 'awaiting_confirmation') {
                awaiting = { subject: subjectPhrase(rows, {}) };
                break;
              }
            }
            setAwaitingConstraint(awaiting);
          } catch (_) { setAwaitingConstraint(null); }
          // E1: undecided-and-not-held episode rules, from the same rows
          // (allow rows never appear - the resolver's restrictions
          // exclude them). Fails to false: the row simply stays hidden.
          setUndecidedConstraint((state?.restrictions ?? []).some(
            (r) => r.role === 'episode' && r.effectiveChoice == null && r.adaptationMode !== 'hold',
          ));
          // B4/E1: unavailable && !stale is exactly the resolver's
          // no-known-state failure branch (the synthesised empty state).
          setCapabilityCheckFailed(!!state?.unavailable && !state?.stale);
        } catch (_) {
          if (cancelled) return;
          setActiveConstraint(false);
          setConstraintSubject(null);
          setAwaitingConstraint(null);
          setUndecidedConstraint(false);
          // B4/E1: this catch is also a failed check (the require or the
          // read path itself threw) - say so rather than showing nothing.
          setCapabilityCheckFailed(true);
        }
      })();
      return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id]),
  );

  // D112 R2 (closes audit T1-17): the DISPLAYED session's effective (served)
  // row count. One call per focus (re-fires whenever the displayed routine
  // changes, which includes each loadData() reload on focus). Fail-safe:
  // countEffectiveSessionRows returns the base count on any error after
  // the routine read, and null when it could not read the routine at all
  // (round 6, B9) - null falls through the ?? below to the raw
  // exerciseCounts figure, exactly as while the read is in flight.
  useEffect(() => {
    const routineId = displayWorkout?.routine?.id;
    if (!user?.id || !routineId) { setEffectiveSessionCount(null); return undefined; }
    let cancelled = false;
    setEffectiveSessionCount(null);
    (async () => {
      try {
        // eslint-disable-next-line global-require
        const { countEffectiveSessionRows } = require('../lib/sessionEffective');
        const n = await countEffectiveSessionRows(user.id, routineId);
        if (!cancelled) setEffectiveSessionCount(n);
      } catch (_) {
        if (!cancelled) setEffectiveSessionCount(null);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, displayWorkout?.routine?.id]);

  const rawCoachBrief = showCoachBrief
    ? buildCoachBrief({
        fatigueHistory: fatigueSessions,
        weeklyVolume: weekStats,
        deloadSuggestion,
        lastWorkoutDaysAgo,
        blockProgress,
        // D112 R5 (closes audit T1-14/T2-31): the constraint line is no
        // longer fed into the brief -- it renders as its own standalone
        // row (below) independent of which headline fires or whether the
        // brief is dismissed, so it must never also ride the brief's own
        // text. activeConstraint/constraintSubject keep their default
        // (false/null) here on purpose; buildCoachBrief's own CC31 branch
        // is untouched for any other caller.
      })
    : null;
  // Suppress the default "Ready when you are" filler (founder 2026-06-30: it
  // rendered the same line as headline AND body, a content-free card under the
  // hero). Only show the brief when it carries a real coaching signal.
  const coachBrief = rawCoachBrief && rawCoachBrief.headline !== 'Ready when you are'
    ? rawCoachBrief
    : null;

  // D112 R5 (closes audit T1-15/T2-24): the AWAITING prompt's line text.
  // Matches HowYouTrainScreen.js's own episodeSub wording for the same
  // state exactly (never invented new phrasing for the same state).
  const awaitingConstraintLine = awaitingConstraint
    ? (awaitingConstraint.subject
      ? `You thought you'd be back to ${awaitingConstraint.subject} by about now. Still need it?`
      : 'You thought this would be done by about now. Still need it?')
    : null;

  // Premium UI pass: does the capability lane have anything to say on Home?
  // Mirrors the render conditions of the five rows in the grouped list below
  // exactly, so the heading and its container never render around nothing.
  const hasConstraintRows = Boolean(
    (activeConstraint && activePlan)
    || awaitingConstraintLine
    || (undecidedConstraint && !awaitingConstraintLine)
    || rampLine
    || capabilityCheckFailed,
  );

  // S15#7: readiness aggregate. One calm line for the mesocycle chip,
  // composed from signals HomeScreen already loads (block phase, the
  // shouldDeload signal, last session's soreness/sleep/energy facts, recent
  // fatigue trend) rather than the phase-only text it showed before.
  // Stage 1 (2026-08-09, blueprint-adaptive-mesocycle §3.5): a block past
  // its recovery week is finished and awaiting the user's next-block
  // decision. That state outranks every readiness read, because the week
  // resolver clamps to the final (deload) row and the composer would
  // otherwise claim a live "Deload week" that has already passed. Honest
  // maintenance language instead: targets hold at recovery-week volume
  // until the user chooses.
  // B-1 (F-18): on a resolved week the default read below ("On track for
  // this block.") spoke as though a session were still pending. The
  // week-complete state gets its own honest line; the block-finished line
  // above is unchanged.
  const readinessSummary = currentMesoWeek?.awaitingDecision
    ? { tone: 'go', line: 'Block finished. Targets hold at recovery-week volume until you choose what comes next.' }
    : weekComplete
    ? { tone: 'go', line: 'Nothing outstanding this week.' }
    : buildReadinessSummary({
      currentMesoWeek,
      // Campaign 22 Phase 2 Stage 1 (spec §8, the measured copy
      // contradiction fix): the SAME resolved state RecoveryStateCard and
      // the hero eyebrow read, so this chip can never disagree with them.
      gatedRecoveryState,
      deloadSuggestion,
      fatigueHistory: fatigueSessions,
      lastSession,
    });

  // Banner priority (D14, DECISIONS-2026-07-09.md, Home banner cap ruling
  // delegated to the lead): keep the primary "Start" action prominent by
  // showing AT MOST ONE attention banner at a time, chosen by this fixed
  // priority order; every other eligible banner simply waits its turn, and
  // the next-highest-priority one appears on the next render once the shown
  // banner is dismissed or resolves. This supersedes the earlier D7 "top two
  // + collapsed overflow" model (AC-6/CP-1, design-usability-audit-2026-07-09)
  // as the strongest match to the one-hero Materials Policy. A fresh weekly
  // coach review outranks a trial/paywall countdown, which outranks a
  // suggested recovery week, which outranks the nutrition-phase nudge, then
  // a lift plateau, then the activation nudge, then the free-tier/
  // differential upsell line (see the ranked list below for the full order
  // and rationale). Nothing here is an ED-safety, wellbeing or calm-mode
  // banner (each already fails closed under an open ED flag/calm mode inside
  // its own loader, unchanged by this), so none needs always-show/exempt
  // treatment; this is a pure attention-priority call. Dismissal semantics
  // are untouched per banner: the cap only decides who gets the one visible
  // slot, it never marks an unshown banner as seen/dismissed.
  // Only surface the "this week's review" banner when the coach actually has a
  // review, i.e. it had enough data to assess the week. During the baseline
  // weeks the output is hasEnoughData:false ("Building your baseline,
  // adjustments start after week 2"), and advertising it as a ready review with
  // "what changed and why" was telling users coaching was live when it wasn't
  // (founder 2026-06-21).
  // PM-06 (D96): the completed-decision predicate, shared with the Coach tab,
  // replaces the bare hasEnoughData test. hasEnoughData is still required (it
  // is inside the predicate), so the founder's 2026-06-21 rule that the
  // baseline weeks never advertise a ready review is unchanged.
  const showCoachBanner = !!latestCoachOutput && latestCoachDecisionComplete
    && !coachBannerDismissed
    && (Date.now() - (latestCoachOutput.weekStart ?? 0) < 7 * 86400000);
  // ITEM 6 (D141, superseding T2 world-class-audit-2026-07-03/05-cohesion.md
  // #4): the badge used to mirror showCoachBanner exactly, so it expired on
  // the same 7-day window AND cleared on the banner's own dismiss button --
  // neither of those means the review was actually READ. The badge is now
  // driven by a durable, per-user "last viewed" marker instead: no time
  // expiry, and dismissing the Home banner's close X (which only retires its
  // time-relevant TEXT) leaves the badge exactly as it was. The banner itself
  // is UNCHANGED above -- still 7-day windowed, still dismissible.
  //
  // The marker is written by CoachOutputScreen (COACH_OUTPUT_VIEWED_KEY_FOR,
  // src/lib/home/unseenCoachChange.js) the moment a real review is shown, and
  // read here once per user id. coachViewedMarkerLoaded stays false until
  // that read settles, so the effect below intentionally does nothing while
  // loading rather than defaulting to "unread" and flashing the badge before
  // the real answer (possibly "already read") is known.
  const [coachViewedMarkerLoaded, setCoachViewedMarkerLoaded] = useState(false);
  const [coachViewedWeekStart, setCoachViewedWeekStart] = useState(null);
  // Lead review (D141 item 6): loadData() re-runs on EVERY focus and sets a
  // fresh latestCoachOutput object, which re-fires the store write below.
  // Read once per mount, the marker would be stale the moment the user came
  // back from the review, and the badge they had just cleared would
  // reappear. So the marker is re-read on every focus, ahead of that write.
  const readCoachViewedMarker = useCallback(async () => {
    let weekStart = null;
    try {
      const raw = await AsyncStorage.getItem(COACH_OUTPUT_VIEWED_KEY_FOR(user?.id));
      weekStart = raw ? JSON.parse(raw)?.weekStart ?? null : null;
    } catch (_) {
      weekStart = null; // corrupt/missing marker reads as "never viewed"
    }
    return weekStart;
  }, [user?.id]);
  useEffect(() => {
    let cancelled = false;
    setCoachViewedMarkerLoaded(false);
    readCoachViewedMarker().then((weekStart) => {
      if (cancelled) return;
      setCoachViewedWeekStart(weekStart);
      setCoachViewedMarkerLoaded(true);
    });
    return () => { cancelled = true; };
  }, [readCoachViewedMarker]);
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      readCoachViewedMarker().then((weekStart) => {
        if (!cancelled) setCoachViewedWeekStart(weekStart);
      });
      return () => { cancelled = true; };
    }, [readCoachViewedMarker]),
  );

  useEffect(() => {
    if (!coachViewedMarkerLoaded) return; // guard: keep the store's previous value while loading
    useAppStore.getState().setHasUnseenCoachChange(resolveHasUnseenCoachChange({
      latestOutput: latestCoachOutput,
      latestDecisionComplete: latestCoachDecisionComplete,
      viewedWeekStart: coachViewedWeekStart,
      markerLoaded: coachViewedMarkerLoaded,
    }));
  }, [latestCoachOutput, latestCoachDecisionComplete, coachViewedWeekStart, coachViewedMarkerLoaded]);
  // Stage 2: the everyday trial value card's own eligibility calc
  // (trialBannerEligible, "suppressed by the day-of coaching nudge so two
  // voices never say the same thing") is retired with the card -- it no
  // longer renders on Home at all (FOUNDER-RULINGS-PHASE2 R3). Only the
  // trial-ENDING fact below (rank 8) may occupy the Today line now.
  // FB-02 (D96): display gate only, no change to shouldDeload's maths or
  // thresholds. Inside a SCHEDULED recovery week the user is following the
  // app's own prescription of roughly half the reps, which drops the
  // rolling four-week rep average enough to score the banner -- so Home
  // reported the app's own reduction back as a performance problem, right
  // above a chip already saying "Recovery week, pull effort back", and
  // taps through to advice to reduce sets by a third during the week that
  // IS the reduction. A finished block awaiting its decision holds at
  // recovery-week volume for the same reason.
  const inScheduledRecovery = !!currentMesoWeek?.isDeload || !!currentMesoWeek?.awaitingDecision;
  const deloadBannerEligible = !!deloadSuggestion && !deloadDismissed && !inScheduledRecovery;
  // PM-08 / FM-07 (D96): OUTSIDE a scheduled recovery week the signal is
  // legitimate, but the banner said "Recovery week suggested" with no
  // reference to the block the user is in, and the four-week summary passes
  // weeksSinceLastDeload: 99 ("unknown: conservative") so the block's own
  // recovery week never suppresses it. The suggestion stands; it now
  // acknowledges the scheduled week when the block has one still to come, so
  // the app is not silently arguing with its own plan. Tier-blind, like the
  // banner: a Free user has no Apply mechanism, so naming the week already in
  // their plan is the honest thing either way. Display only, no change to
  // shouldDeload's maths or thresholds.
  // Campaign 22 Phase 2 Stage 1: the "your block already has a recovery week
  // scheduled at week N" addendum (scheduledRecoveryWeekIndex/
  // scheduledRecoveryAhead) is dropped -- the new Today line is ONE sentence
  // (spec §17 R2), and this addendum was display-only extra colour, never
  // load-bearing for shouldDeload's own maths/thresholds. The suggestion
  // itself, its eligibility (deloadBannerEligible, unchanged above) and its
  // tap-through to CoachReview (where the block's own recovery position is
  // still visible) are all untouched.
  const phaseBannerEligible = !!phaseMismatch && !phaseBannerDismissed;
  // B3 lift plateau banner: below deload and phase, recovery and targets
  // outrank a single lift's stall, dismissible per exercise + week.
  const plateauBannerEligible = !!plateauBanner && !plateauBannerDismissed;
  // S6 activation nudge: below the coaching/recovery banners but ABOVE the
  // free-tier upsell lines (founder call: retention over monetisation for a
  // barely-active new user). Tier-blind. The cold-start stage is deliberately
  // NOT shown here, welcomeCard already owns the 0-session in-app moment; only
  // the two stall stages render a banner. Per-stage dismissible.
  const activationBannerEligible = !!activationNudge && activationNudge.stage !== NUDGE_STAGE.COLD_START
    && !activationNudgeDismissed;

  // Campaign 22 Phase 2 Stage 1: coach/trial/deload/phase moved OUT of this
  // array onto the Today line (arbiter ranks 2-3, 5, 7-8 below) -- leaving
  // them in here would wrongly let them keep suppressing plateau/activation
  // whenever eligible, even though nothing renders their old JSX any more.
  // FOUNDER DECISION (fully free, no tier split): the free-tier weekly line
  // and the differential paywall badge are retired, so the lowest-priority
  // "attention" slot they shared is gone; plateau and activation are the
  // only two banners left to arbitrate.
  const BANNER_PRIORITY = [
    { key: 'plateau', eligible: plateauBannerEligible },
    { key: 'activation', eligible: activationBannerEligible },
  ].filter(b => b.eligible);
  // The single decision point for the cap: whichever eligible banner ranks
  // highest takes the one visible slot; everything else waits its turn.
  const shownBannerKey = BANNER_PRIORITY[0]?.key ?? null;

  const showPlateauBanner = shownBannerKey === 'plateau';
  const showActivationBanner = shownBannerKey === 'activation';

  // ── Campaign 22 Phase 2 Stage 1: the single P1 occupant (spec §13) ──────
  // Facts only: every occupant's action/dismissal below reuses the exact
  // existing handler for that fact (same navigation targets, same
  // AsyncStorage dismissal keys, same trial/recovery logic read, never
  // re-derived). The arbiter is a pure function; it only decides which one,
  // if any, wins the one slot.
  // FOUNDER DECISION (fully free, no trial, no expiry): the trial-ENDING
  // occupant (spec §14 rank 8) is retired along with the trial itself.
  // ── Campaign 26 (founder device order 2026-08-17): the evidence pane
  // view-model - the RECURRING weekly evidence read, every week, never
  // framed as a first review (founder correction, same day). The C22
  // conflict-day rank-4.5 arbiter feed is retired with the old line - the
  // two rows can no longer compete because there is only one region. Null
  // until loadFirstReviewFacts resolves so it never flashes on cold load.
  // everCheckedIn/sessionsSinceCheckin come from real check-in HISTORY in
  // the loader, never from the current week's decision predicate.
  const evidencePanelItem = firstReviewFacts
    ? resolveEvidencePanel({
        hasCheckedInEver: firstReviewFacts.everCheckedIn,
        weighIns7d: firstReviewFacts.weighIns7d,
        firstWeightAt: firstReviewFacts.firstWeightAt,
        checkinDay: firstReviewFacts.checkinDay,
        edFlagOpen: firstReviewFacts.edFlagOpen,
        completedSessions: firstReviewFacts.completedSessions,
        sessionsSinceCheckin: firstReviewFacts.sessionsSinceCheckin,
        foodDays7: firstReviewFacts.foodDays7,
        // The folded-in weight line: only on a day it is actually logged,
        // and never under the fail-closed suppression chain (the resolver
        // drops it with every other count under the neutral variant).
        todayWeightLabel: todayWeight != null ? formatBodyWeight(todayWeight, bwu) : null,
      })
    : null;
  const openFirstReviewSurface = useCallback(() => {
    haptics.selection();
    navigateCrossTab(navigation, 'ProfileTab', 'You');
  }, [navigation]);
  const todayLineItem = resolveTodayLine({
    // Rank 1 is reserved: no positive Home safety banner exists to feed it
    // yet (today ED/calm suppression only SUPPRESSES other content, inside
    // each fact's own loader below) -- see todayLineArbiter.js's header.
    safety: null,
    blockComplete: {
      eligible: !!currentMesoWeek?.awaitingDecision,
      onPress: () => { haptics.selection(); navigateCrossTab(navigation, 'PlansTab', 'Plans'); },
    },
    coachDecision: {
      eligible: showCoachBanner,
      caloriesKcal: latestCoachOutput?.adjustments?.calories?.applied
        ? latestCoachOutput.adjustments.calories.newKcal
        : null,
      onPress: () => {
        haptics.selection();
        navigateCrossTab(navigation, 'ProfileTab', 'CoachOutput', { weekStart: latestCoachOutput.weekStart });
      },
      onDismiss: () => {
        AsyncStorage.setItem(`@volyume_coach_banner_dismissed_${latestCoachOutput.weekStart}`, 'true').catch(() => {});
        setCoachBannerDismissed(true);
      },
    },
    checkIn: {
      eligible: showCoachingNudge,
      onPress: () => {
        dismissCoachingNudge();
        navigation.navigate('ProfileTab', { screen: 'WeeklyCheckIn', initial: false });
      },
      onDismiss: dismissCoachingNudge,
    },
    // The C22 rank-4.5 conflict-day firstReview fact is retired (Campaign
    // 26): the evidence pane below the hero is the readiness home on every
    // day now, logged or not, so there is no conflict day left to resolve.
    // resolveFirstReview in the arbiter handles the absent fact as null.
    recovery: {
      state: gatedRecoveryState,
      onOpenDetail: () => { haptics.selection(); setShowRecoveryDetail(true); },
      deloadEligible: deloadBannerEligible,
      onDeloadPress: () => { haptics.selection(); navigation.navigate('CoachReview'); },
      onDeloadDismiss: () => setDeloadDismissed(true),
    },
    reEntry: {
      eligible: reEntryDue,
      onPress: () => { haptics.selection(); handleReEntryPress(); },
    },
    phaseMismatch: {
      eligible: phaseBannerEligible,
      savedPhaseLabel: phaseMismatch?.savedPhaseLabel,
      onPress: () => { haptics.selection(); navigateCrossTab(navigation, 'ProfileTab', 'NutritionTargets'); },
      onDismiss: dismissPhaseBanner,
    },
    hasActiveWorkout,
  });

  // Pre-formatted for HomeLastSessionCard (memoised): keeps the component a
  // pure renderer of already-derived data rather than importing the helper.
  const lastSessionRelativeDay = lastSession ? getRelativeDay(lastSession.startedAt) : null;

  // Stable handler identities for the memoised (React.memo) extracted
  // components below, so passing them as props doesn't defeat the memo.
  // (openFirstReviewSurface lives above the arbiter call with the line it
  // serves.)
  // The readiness chip, composed once: the hero renders it on the training
  // day, on a complete week and on a finished block (F-18 hero precedence),
  // and all three must read the same one calm line and open the same
  // block-shape sheet.
  const readinessChipEl = readinessSummary ? (
    <TouchableOpacity
      style={[styles.mesoBriefChip, live.mesoBriefChip]}
      onPress={() => { haptics.selection(); setShowBlockShape(true); }}
      accessibilityRole="button"
      /* C5-P34-04 (D96): the chip is where "stop 2 short of
         failure" is defined, but its label named only the block,
         so a screen-reader user heard an offer to explain
         something else entirely and had no reason to open the one
         sheet that answers the phrase they just heard. The
         definition stays exactly one tap away. */
      accessibilityLabel="See the shape of your training block and what the effort target means"
    >
      <Ionicons
        name={READINESS_ICON[readinessSummary.tone] ?? READINESS_ICON.go}
        size={12}
        color={BRIEF_ICON_COLOR[readinessSummary.tone] ?? BRIEF_ICON_COLOR.go}
      />
      <Text style={[styles.mesoBriefText, live.mesoBriefText]}>{readinessSummary.line}</Text>
      <Ionicons name="chevron-forward" size={iconSize.sm} color={t.colors.textMuted} />
    </TouchableOpacity>
  ) : null;

  const goToWorkoutHistory = useCallback(() => navigation.navigate('WorkoutHistory'), [navigation]);
  const closeBlockShape = useCallback(() => setShowBlockShape(false), []);
  const closeChangeWorkout = useCallback(() => setShowChangeWorkout(false), []);

  return (
    <SafeAreaView style={[styles.safe, live.safe]} edges={['top']}>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        // 'interactive' on iOS: iOS fires 'on-drag' for the PROGRAMMATIC
        // auto-scroll that keeps the focused input visible, so the keyboard
        // dropped after one keystroke (founder device report 2026-07-13).
        // 'none' on Android (input-focus fix, pre-gym build defect pass):
        // the same class of bug reaches Android too - see the identical fix
        // and full root-cause note on ActiveWorkoutScreen.js's own
        // ScrollView, the screen where it was device-reproduced. Android has
        // no 'interactive' equivalent, so 'none' is the deterministic
        // policy; the daily weigh-in field on this screen is the reachable
        // numeric-entry surface this protects.
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'none'}
        // A2 (pre-release sweep 2026-07-27, LANE A): without this, a tap on
        // a button while the daily weigh-in field is focused only dismisses
        // the keyboard -- the user has to tap twice.
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={t.colors.primary} />}
      >
        {/* ── Branded header ── */}
        {/* Community (blueprint section 1, entry point 1; lead visual review
            ruling in section 13): the header's right slot carries ONLY the
            Community action. It replaces the brand mark on this screen, and
            the brand mark is not shown beside it. */}
        <ScreenHeader title="Today" right={<CommunityHeaderAction />} />

        {/* ── Campaign 22 Phase 2 Stage 1: the unified Today line (P1 slot,
            HOME-TODAY-UX-SPEC.md §17 region R2). One quiet row, one occupant,
            chosen by todayLineArbiter from the facts above. Absorbs: the
            coach decision banner, the deload/recovery-state announcement,
            the nutrition-phase banner, the bottom check-in nudge, the
            block-complete decision entry, the re-entry question entry and
            trial-ENDING (never the everyday trial card). ── */}
        <TodayLine item={todayLineItem} testID="today-line" />

        {/* The training-schedule context line was REMOVED on founder ruling
            2026-08-03: the product has no scheduled training days. The
            schedule key is a habit inference (D17), sanctioned only for the
            soft reminder copy in trainingReminders.js, never for schedule
            assertions on screen. See
            docs/audit/cross-surface-consistency-audit-2026-07-30.md. */}

        {/* ── Compact top start CTA (above-the-fold) ── */}
        {/* The single start surface is the hero card below. The old top
            "Start workout + Start empty workout" row duplicated it one-for-one,
            so it's gone (founder 2026-06-30). */}

        {/* Cloud restore banner removed, the typical pull completes
            in under a second on a healthy connection so the banner
            flashed and vanished. Pull-to-refresh on Home still shows
            the standard RefreshControl spinner if the user wants to
            force a sync. */}

        {/* Stage 2: the coach decision banner, the trial value card (S0-S3)
            and the deload/nutrition-phase banners are RETIRED from this
            render location -- their content, tap-through and dismissal now
            live in the arbiter facts above and render through the single
            <TodayLine> row (coach = rank 3, deload/recovery = rank 5, phase
            = rank 7, trial-ending = rank 8). The everyday trial card itself
            has rehomed to YouScreen.js in full (Stage 2, FOUNDER-RULINGS-
            PHASE2 R3). */}

        {/* Campaign 22 Phase 2 Stage 2 (HOME-TODAY-UX-SPEC.md §17 region R5,
            context footer): the plateau banner, activation nudge and the
            free/differential attention slot RE-SITE to the footer, below
            last-session and the Pro teaser -- P3 content, never above the
            hero. The one-slot cap mechanics (BANNER_PRIORITY, shownBannerKey)
            are UNCHANGED; only the render location moved. See the footer
            block near the end of this ScrollView. */}

        {/* Skeleton placeholders shown during initial cold-load. As
            soon as loadData completes, this block disappears and the
            real content (which is largely below) renders. Without it,
            the user sees a blank screen for the ~100-300ms it takes
            SQLite reads to complete on a fresh app start. */}
        {initialLoading && (
          <View style={{ gap: spacing.md, marginBottom: spacing.md }}>
            {/* COMP-027 Part B: the skeleton teaches the new hierarchy,
                hero-shaped first, the Today strip second. */}
            <SkeletonCard height={160} />
            <SkeletonCard height={64} />
          </View>
        )}


        {/* COMP-013: the standalone first-run cue row retired here, its job
            folds into the hero first-run variant below (a net minus-one-card on
            Home, the direction COMP-027 demands: hero first, fewer stacked
            utilities). The dismissal key and gating are reused there. */}

        {/* Campaign 22 Phase 2 Stage 2 (HOME-TODAY-UX-SPEC.md §11 region R4,
            FOUNDER-RULINGS-PHASE2 R1): TodayStrip moves BELOW the hero -- the
            session is the reason the athlete opened the app; the weigh-in is
            a ten-second favour they do the coach afterwards. One-tap logging,
            the OB-8 deep-link and the alignment fix are all untouched, just
            re-slotted; see the Evidence Row block after the hero/no-plan
            section below. */}

        {/* First-launch orientation (founder 2026-06-30): a calm welcome for a
            brand-new user, shown only until the first session is logged
            (totalSessions === 0) and dismissible. The two steps are INSTRUCTION
            that points at the start action below, never duplicate buttons, so it
            orients without competing with the hero / starter cards. Research:
            docs competitive-mastery (Cronometer drip-one-pointer) + NN/G empty
            states. No weight/calorie line here (ED-safety).
            FOUNDER DECISION (fully free, no tier split): the card's second
            step promises a coach to every user now, so the isPro prop it
            used to fork on is gone.
            Lead activation ruling (this brief): dropped the `activePlan &&
            nextWorkout` gate. A zero-session user with no plan at all got NO
            orientation whatsoever (this card was the only one), left staring
            at the no-plan EmptyState below with no welcome above it. The
            card's own copy already covers this ("Begin from your plan... or
            just log freely"), so no new copy variant is needed. */}
        {!initialLoading && totalSessions === 0 && !welcomeDismissed && (
          <HomeWelcomeCard onDismiss={dismissWelcome} />
        )}

        {/* D134 (founder 2026-09-03): one calm, one-time offer for a person
            with nothing set up, once the welcome card has retired, and only
            when no ranked banner holds the attention slot (D14's cap). An
            offer in the person's words, never a question about the person.
            Either button dismisses it forever; it also retires by itself
            the moment anything is set up. */}
        {!initialLoading && hytNothingSetUp && !hytOfferDismissed && (totalSessions > 0 || welcomeDismissed) && shownBannerKey == null && (
          <HomeHowYouTrainOfferCard
            onSetUp={() => { haptics.selection(); dismissHytOffer(); navigation.navigate('HowYouTrainAdd'); }}
            onDismiss={() => { haptics.selection(); dismissHytOffer(); }}
          />
        )}

        {/* ── Primary workout area ── */}
        {hasActiveWorkout ? (
          <PressableCard
            style={[styles.continueCard, live.continueCard]}
            onPress={() => navigation.navigate('ActiveWorkout')}
            accessibilityLabel="Continue active workout"
          >
            <View style={styles.continueInner}>
              <View style={[styles.continueIcon, live.continueIcon]}>
                <Ionicons name="play" size={20} color={t.colors.onPrimary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.continueTitle, live.continueTitle]}>Workout in progress</Text>
                <Text style={[styles.continueSub, live.continueSub]}>Tap to return to your workout</Text>
              </View>
              <Ionicons name="chevron-forward" size={iconSize.md} color={withAlpha(t.colors.onPrimary, alpha.half)} />
            </View>
          </PressableCard>
        ) : blockAwaitingDecision ? (
          /* B-3 (F-18): the block is finished and waiting on the athlete's
             next-block decision. The hero IS that decision. It used to offer
             "Start workout" on session 1 under a "Day 1 of N" eyebrow while
             the Today line and the readiness chip both said the block was
             complete - three regions, two truths. Training during the wait is
             still allowed, so it stays available as the quiet secondary, never
             the primary. */
          <Card surface="surfaceElevated" style={styles.heroCard}>
            <SectionLabel tone="muted" style={styles.heroEyebrow} numberOfLines={1}>
              Block complete
            </SectionLabel>
            <Text style={[styles.workoutName, live.workoutName]} numberOfLines={3}>
              Every week of this block is done
            </Text>
            {readinessChipEl}
            <View style={styles.startWorkoutRow}>
              <View style={styles.startBtnSplit}>
                <Button
                  title="Choose what's next"
                  onPress={() => { haptics.selection(); navigateCrossTab(navigation, 'PlansTab', 'Plans'); }}
                  accessibilityLabel="Choose what comes after this block"
                  style={[styles.primaryBtn, { marginTop: 0 }]}
                />
              </View>
            </View>
            <TouchableOpacity
              onPress={() => { haptics.selection(); setShowChangeWorkout(true); }}
              style={styles.skipSessionRow}
              accessibilityRole="button"
              accessibilityLabel="Do another session from your plan"
            >
              <Text style={[styles.skipSessionText, live.skipSessionText]}>
                Do another session
              </Text>
            </TouchableOpacity>
            {/* Community entry point 8 (social-discovery blueprint section
                1): a finished block is the one thing worth telling people
                about that is not a single session. Tertiary, so it never
                competes with the block decision above it. */}
            {currentMesoWeek?.mesocycleId ? (
              <Button
                title="Share this block"
                variant="tertiary"
                size="sm"
                icon="people-outline"
                onPress={() => {
                  haptics.selection();
                  navigation.navigate('CommunityCompose', {
                    kind: 'block', mesocycleId: currentMesoWeek.mesocycleId,
                  });
                }}
                accessibilityLabel="Post this finished block to Community"
              />
            ) : null}
          </Card>
        ) : weekComplete ? (
          /* B-1 (F-18): every required session at this position is resolved.
             There is no primary action, because nothing is owed: the week's
             work is done and the next one starts on Monday. An extra session
             is a deliberate choice, so it opens the same workout-options
             sheet the training hero uses rather than starting session 1. */
          <Card surface="surfaceElevated" style={styles.heroCard}>
            <SectionLabel tone="muted" style={styles.heroEyebrow} numberOfLines={1}>
              Week complete
            </SectionLabel>
            <Text style={[styles.workoutName, live.workoutName]} numberOfLines={3}>
              Every session done this week
            </Text>
            <Text style={[styles.heroBody, live.heroBody]}>
              {weekCompleteLine(planAllWorkouts[0]?.name)}
            </Text>
            {readinessChipEl}
            <TouchableOpacity
              onPress={() => { haptics.selection(); setShowChangeWorkout(true); }}
              style={styles.skipSessionRow}
              accessibilityRole="button"
              accessibilityLabel="Do another session from your plan"
            >
              <Text style={[styles.skipSessionText, live.skipSessionText]}>
                Do another session
              </Text>
            </TouchableOpacity>
          </Card>
        ) : activePlan && nextWorkout ? (
          <Card surface="surfaceElevated" style={styles.heroCard}>
            <SectionLabel tone="muted" style={styles.heroEyebrow} numberOfLines={1}>
              {recoveryLabel ? `${recoveryLabel} · ${planProgress}` : planProgress}
            </SectionLabel>
            {/* Campaign 27 Pillar A (D104): workoutName is a session NAME, an
                identifier, so a clamp stays honest - but two lines truncated
                real names at large text scale, so it's raised to three. */}
            <Text style={[styles.workoutName, live.workoutName]} numberOfLines={3}>
              {/* C18: where a display name repeats inside one programme week
                  (the bikini Glute Focus split lists "Glutes" twice) the
                  session is qualified by its programme position, so the
                  athlete can tell which occurrence this is. A unique name is
                  left alone. */}
              {sessionDisplayName(
                programmePosition?.nextSession && programmePosition.nextSession.routineId === displayWorkout?.routine?.id
                  ? programmePosition.nextSession
                  : { name: displayWorkout?.routine?.name ?? '', order: 0 },
                programmePosition?.sessions ?? [],
              ) || displayWorkout?.routine?.name}
            </Text>
            {/* D112 R2 (closes audit T1-17): the served count, not the base
                routine's raw row count. effectiveSessionCount is null until
                resolved (or on a read failure), so the raw exerciseCounts
                figure (already loaded) shows first rather than nothing. */}
            {circuitLine ? (
              <Text style={[styles.workoutMeta, live.workoutMeta]}>{circuitLine}</Text>
            ) : (effectiveSessionCount ?? exerciseCounts[displayWorkout?.routine?.id]) ? (
              <Text style={[styles.workoutMeta, live.workoutMeta]}>
                {effectiveSessionCount ?? exerciseCounts[displayWorkout.routine.id]} exercises
              </Text>
            ) : null}
            {/* S15#7 readiness aggregate: tells the user where they are in
                the training block PLUS whatever recovery/soreness/sleep/
                energy/fatigue signal outranks a plain phase read this week,
                composed by buildReadinessSummary so it is one calm line
                instead of the phase-only chip plus scattered other reads.
                Keeps Volyume's coaching identity visible at the start of
                every session, the way an RP-style plan would. Tooltip-free
                because the row is glanceable on its own. */}
            {readinessChipEl}
            {/* Campaign 22 Phase 2 Stage 2 (HOME-TODAY-UX-SPEC.md §8/§16/§17
                R3, hero merge): CoachBriefCard's card-in-card render is
                retired -- this is the SAME coachBrief content (A-job,
                session-relevant coaching context, per §8), now one quiet
                line inline in the hero instead of a nested bordered card.
                Dismissal key, gating and content are byte-identical
                (dismissBrief / @volyume_brief_dismissed_date, once per day). */}
            {coachBrief && (
              <View style={styles.coachBriefLineRow}>
                {/* Campaign 27 Pillar A (D104): sentence-length coach copy never
                    carries a line clamp - it wraps in full, row grows. */}
                <Text style={[styles.coachBriefLineText, live.coachBriefLineText]}>
                  {coachBrief.headline}. {coachBrief.body}
                  {/* CC31 (BD-D8): the pre-workout quiet line rides the
                      same sentence flow - one mention per surface
                      (section 33.16). */}
                  {coachBrief.lines?.length ? ` ${coachBrief.lines.join(' ')}` : ''}
                </Text>
                <TouchableOpacity
                  onPress={dismissBrief}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel="Dismiss coaching brief"
                >
                  <Ionicons name="close" size={14} color={t.colors.textMuted} />
                </TouchableOpacity>
              </View>
            )}
            {/* The full planned session is the primary action for everyone
                (founder 2026-06-30: the old first-run variant highlighted a
                cut-down "short session" with the full one demoted below, which
                read as the wrong default, start the actual session). */}
            <View style={styles.startWorkoutRow}>
              <View style={styles.startBtnSplit}>
                <Button
                  title={isStartingWorkout ? 'Starting...' : 'Start workout'}
                  icon="play"
                  onPress={() => handleStartNextWorkout(false)}
                  disabled={isStartingWorkout}
                  accessibilityLabel={isStartingWorkout ? 'Starting workout' : `Start ${displayWorkout?.routine?.name || 'workout'}`}
                  style={[styles.primaryBtn, { marginTop: 0 }]}
                />
              </View>
              <Button
                variant="secondary"
                title="Options"
                icon="ellipsis-horizontal"
                onPress={() => setShowChangeWorkout(true)}
                accessibilityLabel="Workout options"
                fullWidth={false}
                style={styles.workoutOptionsBtn}
                textStyle={[styles.workoutOptionsText, live.workoutOptionsText]}
              />
            </View>
            {/* ── C18 ONE-TIME SKIP. A quiet SECONDARY action, deliberately not
                a primary CTA: skipping is a legitimate choice, not the
                expected one. Shown only when there is genuinely an
                outstanding required session to skip, so it never appears on a
                resolved week or when the user is browsing another workout. ── */}
            {programmePosition?.nextSession
              && programmePosition.nextSession.routineId === displayWorkout?.routine?.id ? (
                <TouchableOpacity
                  onPress={() => { haptics.selection(); handleSkipThisWorkout(); }}
                  style={styles.skipSessionRow}
                  accessibilityRole="button"
                  accessibilityLabel={`Skip ${sessionDisplayName(programmePosition.nextSession, programmePosition.sessions)} this time`}
                >
                  <Text style={[styles.skipSessionText, live.skipSessionText]}>
                    Skip this workout this time
                  </Text>
                </TouchableOpacity>
              ) : null}
            {/* Founder ruling (Today truth repair): the S2 consistency echo
                ("N weeks running" / "Your run carries on") is REMOVED. The
                weekly run/streak construct is rejected product-wide - it was
                noise, not trusted as accurate, and unwanted streak framing.
                Nothing replaces it here; no content beats low-value filler. */}
          </Card>
        ) : activePlan && planHasNoSessions ? (
          /* B-2 (F-18): the plan is real, it simply holds no sessions. This
             used to fall through to "No active plan yet", which was false for
             someone who owned a plan - and whose offered fix ("Start with a
             plan") would have replaced the plan they already had. */
          <EmptyState
            icon="barbell-outline"
            title="Your plan has no sessions yet"
            text="Open your plan to add a workout, or pick a different plan to follow."
            actionLabel="Open your plan"
            onAction={() => {
              haptics.selection();
              navigateCrossTab(navigation, 'PlansTab', 'PlanDetail', { planId: activePlan.id, isLibrary: false });
            }}
            actionAccessibilityLabel="Open your plan to add a workout"
            secondaryLabel="Choose a different plan"
            onSecondary={() => { haptics.selection(); navigateCrossTab(navigation, 'PlansTab', 'PlanLibrary'); }}
            secondaryAccessibilityLabel="Choose a different plan from the library"
          />
        ) : (
          <View style={styles.noPlanSection}>
            {/* FOUNDER DECISION (fully free, no tier split): the free
                no-plan branch (FreeStarter quiz) is retired -- the full-tier
                EmptyState below is the only no-plan state now, via the
                shared EmptyState primitive (D1 sweep, DD40). */}
            <EmptyState
              icon="barbell-outline"
              title="No active plan yet"
              /* C5-P10-01 (D96): the "Start with a plan" action creates a
                 training block too, so it says so first. */
              /* D141 item 10a: unified with PlansScreen's own no-plan copy.
                 Voice rule applied: COACHING_VOICE_SYNTHESIS_LOCKED.md
                 addendum "actor-naming rule (two registers)" (line ~836) --
                 "Volyume" names the app only (saving, syncing, reminders),
                 never the coaching decider; building the plan is Precision
                 Coaching's call, so the actor here is "your coach", the
                 locked informal actor for running prose (line ~829-830),
                 not "Volyume" and not collaborative "we". Noun unified to
                 "setup" (was "setup" here already, "profile" on Plans).
                 Home's own extra clause (the cloud-arrival note) is kept. */
              text={`Start with a plan and your coach builds one from your setup. If you just signed in on this phone, your existing plan may still be arriving. ${BLOCK_START_SENTENCE}`}
              actionLabel="Start with a plan"
              onAction={handleStartWithPlanPress}
              busy={preparingPlan}
              secondaryLabel="Browse plans"
              onSecondary={() => { haptics.selection(); navigateCrossTab(navigation, 'PlansTab', 'PlanLibrary'); }}
            />

            {/* Campaign 22 Phase 2 Stage 2 (HOME-TODAY-UX-SPEC.md §7/§17 R5,
                the 3-way duplication fix): "Progress at a glance" is
                REMOVED. It restated last-session facts the slim
                HomeLastSessionCard row already shows below (both rendered
                whenever lastSession existed, even in this exact no-plan
                branch) -- the last-session row absorbs its job; nothing
                here replaces the dropped "sessions this week" figure, which
                the Progress tab still carries. */}

            {/* FOUNDER DECISION (fully free, no tier split): everyone keeps
                the quick-start escape hatch while cloud restore lands; the
                Free-only text-link variant is retired. */}
            <PressableCard
              style={[styles.quickStartCard, live.quickStartCard]}
              onPress={() => startBlankSession()}
              accessibilityLabel="Start your first workout"
            >
              <View style={[styles.quickStartIcon, live.quickStartIcon]}>
                <Ionicons name="barbell-outline" size={28} color={t.colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.quickStartTitle, live.quickStartTitle]}>Start your first workout</Text>
                <Text style={[styles.quickStartSub, live.quickStartSub]}>Log your sets as you go. You don't need a plan to start, and next time Volyume will start you at the weights you log today.</Text>
              </View>
              <Ionicons name="chevron-forward" size={iconSize.sm} color={t.colors.textMuted} />
            </PressableCard>
          </View>
        )}

        {/* ── Campaign 26 (founder device order 2026-08-17): the post-hero
            evidence region. The weigh-in strip renders ONLY while today's
            weight is an ACTION (not yet logged) - once logged, the big
            bordered card and its green "Logged" pill are gone and the
            weight becomes one quiet line inside the evidence pane below.
            The pane itself restores the since-check-in runway the C22
            FirstReviewLine link had flattened: title, days to the next
            check-in, weigh-in and session evidence - honouring the Today
            truth-repair ruling with real counts (progress "N of 3" only
            while short, the ACTUAL count once met, never a clamp). ── */}
        {user?.id && todayWeight == null && (
          <TodayStrip
            bwu={bwu}
            todayWeight={todayWeight}
            lastWeightKg={recentWeights.length ? recentWeights[recentWeights.length - 1] : (userProfile?.weightKg ?? null)}
            savingWeight={savingWeight}
            onLogWeight={handleLogWeight}
            // OB-8: the weekly check-in's "Log my weight first" CTA deep-links
            // here with a fresh timestamp; the strip opens its weight input.
            openWeightSignal={route?.params?.openWeightLog ?? null}
            onOpenTrend={() => navigateCrossTab(navigation, 'ProgressTab', 'Analytics', { focusWeightTrend: true })}
            everLogged={hasEverLoggedWeight}
          />
        )}
        {user?.id && evidencePanelItem && (
          <EvidencePanel
            panel={evidencePanelItem}
            onPress={openFirstReviewSurface}
            testID="evidence-panel"
          />
        )}

        {/* ── Campaign 22 Phase 2 Stage 2: the context footer (region R5,
            §17). Last-session slim row first (absorbs the glance card),
            then the P3 attention stack -- plateau and activation, re-sited
            here from above the hero. FOUNDER DECISION (fully free, no tier
            split): the Pro teaser and the free/differential attention slot
            are retired. Same one-slot cap (BANNER_PRIORITY, shownBannerKey),
            same per-banner handlers, only the location moved. ── */}
        {lastSession && (
          <HomeLastSessionCard
            lastSession={lastSession}
            lastSessionTonnage={lastSessionTonnage}
            relativeDay={lastSessionRelativeDay}
            onOpenHistory={goToWorkoutHistory}
            onRepeat={handleRepeatLastSession}
          />
        )}

        {/* ── B3 lift plateau banner. Training-only content; taps through to
            the existing plateau protocol on ExerciseDetail. ExerciseDetail is
            registered in the Progress stack, not this one, so route via the
            parent tab navigator (F4 / NAV-1 bug class). ── */}
        {showPlateauBanner && (
          <TouchableOpacity
            style={[styles.plateauBanner, live.plateauBanner]}
            onPress={() => { haptics.selection(); navigateCrossTab(navigation, 'ProgressTab', 'ExerciseDetail', { exerciseId: plateauBanner.exerciseId }); }}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={plateauBanner.line}
          >
            <View style={styles.plateauBannerLeft}>
              <Ionicons name="analytics-outline" size={18} color={t.colors.primary} />
              {/* Campaign 27 Pillar A (D104): sentence-length copy never carries
                  a line clamp - it wraps, and the row grows. */}
              <Text style={[styles.plateauBannerText, live.plateauBannerText]}>{plateauBanner.line}</Text>
              <Ionicons name="chevron-forward" size={iconSize.sm} color={t.colors.primary} />
            </View>
            <TouchableOpacity
              onPress={dismissPlateauBanner}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Dismiss plateau banner"
            >
              <Ionicons name="close" size={16} color={t.colors.textMuted} />
            </TouchableOpacity>
          </TouchableOpacity>
        )}

        {/* ── S6 activation nudge banner (stall stages only; cold-start is
            welcomeCard's). Taps through to start the next session. ── */}
        {showActivationBanner && (
          <TouchableOpacity
            style={[styles.activationBanner, live.activationBanner]}
            onPress={() => { haptics.selection(); handleStartNextWorkout(false); }}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={activationBannerLine(activationNudge.stage)?.title}
          >
            <View style={styles.activationBannerLeft}>
              <Ionicons name="barbell-outline" size={18} color={t.colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.activationBannerTitle, live.activationBannerTitle]} numberOfLines={1}>
                  {activationBannerLine(activationNudge.stage)?.title}
                </Text>
                {/* Campaign 27 Pillar A (D104): body is sentence-length copy,
                    so it wraps in full rather than carrying a line clamp. */}
                <Text style={[styles.activationBannerBody, live.activationBannerBody]}>
                  {activationBannerLine(activationNudge.stage)?.body}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={dismissActivationNudge}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Dismiss"
            >
              <Ionicons name="close" size={16} color={t.colors.textMuted} />
            </TouchableOpacity>
          </TouchableOpacity>
        )}

        {/* FOUNDER DECISION (fully free, no tier split): the "worth your
            attention" card (free-tier weekly line / differential paywall
            badge, AttentionCard) is retired entirely -- there is no upsell
            left to show. */}

        {/* D14 (Home banner cap): no "reveal the rest" affordance. Exactly
            one attention banner shows at a time (whichever above won the
            slot); the others wait their turn and appear on a later render
            once the shown one is dismissed or resolves. ── */}

        {/* "This week's plan" (block progress) moved to Progress tab. */}

        {/* Campaign 22 Phase 2 Stage 1: the bottom check-in nudge card is
            RETIRED from this render location -- rank 4 of the Today line
            above absorbs it (arbiter's `checkIn` fact: eligible on
            showCoachingNudge, same dismissCoachingNudge handler, same
            WeeklyCheckIn navigation target), one sentence, no scan subline
            (copy contract item 5 -- that invitation now lives on the
            check-in screen it belongs to). This closes the exact rank error
            spec §2 named: the day's most consequential Pro action no longer
            renders at the very bottom, below the last-session row. */}

        {/* History / Lifts / Volume quick links removed from Train (founder
            2026-06-03): they are Progress items and live on the Progress tab. */}

        {/* Founder order 2026-09-05: the "Injuries & limitations" group is the LAST
            item on Today. It reports how training is being worked around;
            it is not the day's action, so it sits below every action and
            evidence card rather than above them. */}
        {/* CC33 D112 R5 (closes audit T1-14/T2-31): the pre-workout quiet
            constraint line, standalone now -- it renders whenever the
            capability state has an active APPLIED episode rule and an
            active plan exists, independent of which brief headline fired
            (or none) and of whether the brief itself was dismissed. Same
            quiet styling as the former in-brief line; now tappable
            through to Injuries & limitations. */}
        {/* Premium UI pass. These rows are the capability lane's presence on
            Home, and they were five loose sentences floating on the
            background between two cards: no container, no heading, nothing
            grouping them, so the squint test resolved no group here at all
            and the one surface a user with an injury looks for read as
            stray text. They are now one grouped list under its own heading,
            the same shape Settings and the Coach tab use. The rows keep
            their quiet 13px voice, their targets and their behaviour; only
            the grouping is new. */}
        {hasConstraintRows ? (
        <View style={styles.constraintSection}>
          <SectionLabel tone="muted">Injuries & limitations</SectionLabel>
          <View style={[styles.constraintGroup, live.constraintGroup]}>
        {activeConstraint && activePlan ? (
          <TouchableOpacity
            style={[styles.constraintLineRow, live.constraintLineRow]}
            onPress={() => { haptics.selection(); navigation.navigate('HowYouTrain'); }}
            accessibilityRole="button"
            accessibilityLabel={`${constraintLineText(constraintSubject)} Open Injuries & limitations`}
          >
            <Text style={[styles.constraintLineText, live.constraintLineText]}>
              {constraintLineText(constraintSubject)}
            </Text>
            <Ionicons name="chevron-forward" size={iconSize.sm} color={t.colors.textMuted} />
          </TouchableOpacity>
        ) : null}

        {/* CC33 D112 R5 (closes audit T1-15/T2-24): the §22 AWAITING
            prompt, previously reachable only from HowYouTrain and the
            weekly check-in. Quiet row, tappable through to Injuries & limitations
            to answer it there. */}
        {awaitingConstraintLine ? (
          <TouchableOpacity
            style={[styles.constraintLineRow, live.constraintLineRow]}
            onPress={() => { haptics.selection(); navigation.navigate('HowYouTrain'); }}
            accessibilityRole="button"
            accessibilityLabel={`${awaitingConstraintLine} Open Injuries & limitations`}
          >
            <Text style={[styles.constraintLineText, live.constraintLineText]}>
              {awaitingConstraintLine}
            </Text>
            <Ionicons name="chevron-forward" size={iconSize.sm} color={t.colors.textMuted} />
          </TouchableOpacity>
        ) : null}

        {/* CC33 adversarial review E1: the undecided-rule ask. Shares the
            AWAITING slot (one ask-class row at a time, J4); the works-
            around statement line above may still coexist, exactly as it
            does with AWAITING. */}
        {undecidedConstraint && !awaitingConstraintLine ? (
          <TouchableOpacity
            style={[styles.constraintLineRow, live.constraintLineRow]}
            onPress={() => { haptics.selection(); navigation.navigate('HowYouTrain'); }}
            accessibilityRole="button"
            accessibilityLabel="A change to your limitations is waiting for your decision. Open Injuries & limitations"
          >
            <Text style={[styles.constraintLineText, live.constraintLineText]}>
              A change to your limitations is waiting for your decision.
            </Text>
            <Ionicons name="chevron-forward" size={iconSize.sm} color={t.colors.textMuted} />
          </TouchableOpacity>
        ) : null}

        {/* CC33 D112 R5 (closes audit T2-25's copy half): the durable
            reintroduction line. Same quiet styling as the rows above but
            NOT tappable - it asks nothing and reports the plan's own
            trajectory while any of this week's planned rows carry the
            §23 ramp's source stamp. Meaning is in the text alone (J3). */}
        {rampLine ? (
          <View style={[styles.constraintLineRow, live.constraintLineRow]}>
            <Text style={[styles.constraintLineText, live.constraintLineText]}>
              {rampLine}
            </Text>
          </View>
        ) : null}

        {/* CC33 round 9 (B4/E1): the honest could-not-check line. When the
            capability read fails with no last-known state, every row above
            vanishes silently and Home reads as "nothing going on" - this
            quiet line (rampLine's non-tappable pattern) says the truth
            instead, in the lane's established honesty vocabulary
            (RoutineDetail and ActiveWorkout say the same at their swap
            surfaces). Not tappable: it asks nothing, and Injuries & limitations
            would face the same failed read. */}
        {capabilityCheckFailed ? (
          <View style={[styles.constraintLineRow, live.constraintLineRow]}>
            <Text style={[styles.constraintLineText, live.constraintLineText]}>
              Volyume could not check Injuries & limitations just now.
            </Text>
          </View>
        ) : null}
          </View>
        </View>
        ) : null}

      </ScrollView>

      {/* Change Workout Sheet */}
      {/* COMP-010: the shape of the current training block, opened from the
          meso chip. Makes periodisation visible and the recovery week a
          destination rather than a dip. */}
      {/* D36a (item 17 modal tails, 2026-07-10): both sheets now migrated
          onto the shared BottomSheet chrome, which owns insets and
          reduce-motion itself -- insetsBottom/reduceMotion no longer
          threaded in as props. */}
      <HomeBlockShapeSheet
        visible={showBlockShape}
        onClose={closeBlockShape}
        currentMesoWeek={currentMesoWeek}
        seedLines={blockSeedLines}
        onChooseNext={() => navigateCrossTab(navigation, 'PlansTab', 'Plans')}
      />

      <HomeChangeWorkoutSheet
        visible={showChangeWorkout}
        onClose={closeChangeWorkout}
        activePlan={activePlan}
        displayWorkout={displayWorkout}
        planAllWorkouts={planAllWorkouts}
        nextWorkout={nextWorkout}
        exerciseCounts={exerciseCounts}
        selectedWorkoutOverride={selectedWorkoutOverride}
        onSelectOverride={setSelectedWorkoutOverride}
        navigation={navigation}
      />

      {/* ── C18 RECOVERY STATE detail (recovery-visibility amendment),
          Campaign 22 Phase 2 Stage 1 re-slot: the card no longer free-stacks
          above the hero -- its announcement duty is the Today line's rank-5
          recovery occupant (spec §17 R2), and tapping it opens exactly this
          same component, unchanged, as the "why" detail. Renders nothing
          during normal accumulation and nothing once the block finishes,
          because the resolver returns nothing - the state ends with the
          lifecycle, never with a tap. ── */}
      <BottomSheet
        visible={showRecoveryDetail}
        onClose={() => setShowRecoveryDetail(false)}
        accessibilityLabel="Recovery detail"
      >
        <RecoveryStateCard
          recoveryState={gatedRecoveryState}
          expanded={!recoveryRead}
          onToggle={toggleRecoveryRead}
        />
      </BottomSheet>

      {/* ── Pre-workout intent prompt ── */}
      {/* R9 (D70): the pre-workout intent prompt moves off its hand-rolled
          raw Modal onto the shared BottomSheet (scrim, drag handle,
          swipe/backdrop/back dismiss, reduce-motion handling all owned
          there), the readiness pickers onto the shared Chip, and every tap
          gains the house selection() beat. Skip and the standing opt-out
          stay deliberately quiet text controls: they are de-emphasised
          escape hatches under the fold, not competing CTAs. */}
      {/* EP-06/UI-01 (end-user-polish audit, 2026-07-12): the readiness rows
          + three intent options + Skip + opt-out no longer fit a 320x640/
          360x640 viewport. `scroll` puts the body in BottomSheetScrollView
          bounded by BottomSheet's own maxDynamicContentSize (~92% of window
          height), so the heading and every choice stay reachable by
          scrolling instead of being pushed off-screen with no way back.
          Selection semantics/behaviour are unchanged. */}
      <BottomSheet
        visible={showIntentPrompt}
        onClose={() => { setShowIntentPrompt(false); pendingStartRef.current = null; }}
        accessibilityLabel="How are you feeling today"
        scroll
      >
        <Text style={[styles.intentTitle, live.intentTitle]}>How are you feeling today?</Text>
        {/* C10C: the old line said the answers "shape how your sessions are
            read" without ever saying WHICH WAY. The direction is the part
            that matters to a user deciding whether to answer honestly: a
            rough night can ease the session, and a good one never adds to
            it. "Can" and "when coaching is active" keep it truthful - not
            every answer changes something, and the easing only happens
            where coaching is actually available.
            FOUNDER DECISION (fully free, no tier split): that easing is the
            coaching adjustment every user now gets, so this is the one
            sentence for everyone; the free alternative sentence is retired. */}
        <Text style={[styles.intentSub, live.intentSub]}>
          Takes a second. When coaching is active, poor sleep or heavy soreness can ease today's session. Answering well never makes it harder than planned.
        </Text>
        {/* R2-10 (founder decision "Reorder", 2026-07-11): the optional
            readiness rows sit ABOVE the intent options, compacted to one
            aligned line each, because the intent tap below starts the
            session instantly - anything beneath that trigger is unreachable
            (the original flaw). Zero added taps: ignoring the rows costs
            nothing, setting one is a single tap on the way down, and the
            intent tap carries whatever is set. */}
        <Text style={[styles.readinessGroupLabel, live.readinessGroupLabel]}>
          Readiness (optional)
        </Text>
        {READINESS_ROWS.map(row => (
          <View key={row.key} style={styles.readinessRow}>
            <Text style={[styles.readinessLabel, live.readinessLabel]}>{row.short}</Text>
            <View style={styles.readinessChips} accessibilityRole="radiogroup" accessibilityLabel={row.label}>
              {row.chips.map(chip => {
                const selected = readiness[row.key] === chip.value;
                return (
                  <Chip
                    key={chip.value}
                    label={chip.label}
                    selected={selected}
                    style={styles.readinessChipThird}
                    accessibilityRole="radio"
                    accessibilityLabel={`${row.label}: ${chip.label}`}
                    onPress={() => {
                      haptics.selection();
                      setReadiness(r => ({
                        // Tapping the selected chip again clears it, so the
                        // row stays genuinely optional.
                        ...r,
                        [row.key]: selected ? null : chip.value,
                      }));
                    }}
                  />
                );
              })}
            </View>
          </View>
        ))}

        {/* The three answers: one tap starts the session instantly, carrying
            whatever readiness is set above. */}
        {[
          { key: 'sharp', label: 'Sharp', sub: 'Energised and ready', icon: 'flash-outline' },
          { key: 'average', label: 'Average', sub: 'Normal day, feeling fine', icon: 'remove-outline' },
          { key: 'below_par', label: 'Below par', sub: 'Tired, stressed, or off', icon: 'arrow-down-outline' },
        ].map((opt, i) => (
          <PressableCard
            key={opt.key}
            style={[styles.intentOption, live.intentOption, i === 0 && styles.intentOptionFirst]}
            onPress={() => { haptics.selection(); confirmStart(opt.key); }}
            accessibilityLabel={`${opt.label}. ${opt.sub}. Starts the workout.`}
          >
            <View style={[styles.intentOptionIcon, live.intentOptionIcon]}>
              <Ionicons name={opt.icon} size={20} color={t.colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.intentOptionLabel, live.intentOptionLabel]}>{opt.label}</Text>
              <Text style={[styles.intentOptionSub, live.intentOptionSub]}>{opt.sub}</Text>
            </View>
            <Ionicons name="chevron-forward" size={iconSize.sm} color={t.colors.textMuted} />
          </PressableCard>
        ))}

        <TouchableOpacity
          style={styles.intentSkip}
          accessibilityRole="button"
          accessibilityLabel="Skip and start without answering"
          onPress={() => { haptics.selection(); confirmStart(null, { soreness24hBefore: null, sleepQuality: null, energyScore: null }); }}
        >
          <Text style={[styles.intentSkipText, live.intentSkipText]}>Skip</Text>
        </TouchableOpacity>

        {/* D2 (Option A): the standing opt-out. Persists, then starts this
            session exactly as Skip would, null intent, no readiness, no
            fabricated input. Reversible in Settings, Coaching. */}
        <TouchableOpacity
          style={styles.intentOptOut}
          onPress={() => {
            haptics.selection();
            // C14 job 2: the same one write path Settings uses, so this
            // opt-out is stamped and pushed rather than sitting locally
            // until something else happens to sync. The key is guarded now
            // (its "off" state is a delete), and an unstamped write there
            // is what lets a stale device's copy win a conflict.
            // eslint-disable-next-line global-require
            require('../lib/sync').setUserPref(user?.id, '@volyume_intent_prompt_off', 'true').catch(() => {});
            confirmStart(null, { soreness24hBefore: null, sleepQuality: null, energyScore: null });
          }}
          accessibilityRole="button"
          accessibilityLabel="Don't ask before each session"
        >
          <Text style={[styles.intentOptOutText, live.intentOptOutText]}>Don't ask before each session</Text>
          <Text style={[styles.intentOptOutSub, live.intentOptOutSub]}>
            Without it, sessions are not adjusted to how you're feeling, and your next block's set targets stay where they are rather than moving on what this block showed. Turn it back on any time in Settings, Coaching.
          </Text>
        </TouchableOpacity>
      </BottomSheet>
      {/* Sharpener: one dismissible what's-new sheet per update. */}
      {/* D139: the first plan is previewed before it is built. The sheet
          shows the prospective week, what a block is, and what happens to
          the plans already on the device; the generator runs on confirm. */}
      <PlanPreviewSheet
        userId={user?.id ?? null}
        source="home"
        visible={!!planPreview}
        preview={planPreview?.preview ?? null}
        currentPlanName={planPreview?.preview?.currentPlanName ?? null}
        otherPlansCount={planPreview?.otherPlansCount ?? 0}
        confirmLabel="Start this plan"
        onConfirm={handleConfirmStartWithPlan}
        onClose={() => { if (!startingPlan) setPlanPreview(null); }}
        busy={startingPlan}
      />

      <WhatsNewSheet />
    </SafeAreaView>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
// buildCoachBrief moved to src/lib/homeCoachBrief.js (behaviour-preserving
// decomposition); imported at the top of this file, unchanged.

function getRelativeDay(ts) {
  // Compare LOCAL calendar dates rather than epoch-ms deltas so a
  // session logged at 23:50 doesn't read as "Yesterday" when the user
  // opens the app at 00:10 (or vice versa across DST). The previous
  // floor-based math also broke across DST jumps and for users
  // outside UTC.
  const now = new Date();
  const then = new Date(ts);
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(now) - startOfDay(then)) / (24 * 60 * 60 * 1000));
  if (dayDiff <= 0) return 'Today';
  if (dayDiff === 1) return 'Yesterday';
  if (dayDiff < 7) return `${dayDiff} days ago`;
  return format(then, 'd MMM');
}

// ── Sub-components ────────────────────────────────────────────────────────────
// CoachBriefCard moved to src/components/CoachBriefCard.js (behaviour-
// preserving decomposition), imported at the top of this file. BRIEF_ICON_COLOR
// is re-exported from there since the readiness-summary chip below reuses its
// tone colours.

// S15#7 readiness aggregate chip: its own icon set (kept distinct from
// CoachBriefCard's BRIEF_ICON card-sized icons) but the SAME tone colours
// (BRIEF_ICON_COLOR, imported above) so the chip and the coaching brief card
// read as one family.
const READINESS_ICON = { go: 'trending-up-outline', caution: 'alert-circle-outline', recover: 'bed-outline' };

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // C18 one-time skip: quiet by design. A secondary text action, never a
  // button competing with Start workout.
  skipSessionRow: { alignSelf: 'center', paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  skipSessionText: { ...type.caption, color: colors.textMuted },
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },

  // (Morning-weight card styles retired with COMP-027 Part B, the weight cell
  //  now lives in TodayStrip.)

  // Continue card
  continueCard: {
    backgroundColor: colors.success,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  continueInner: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  continueIcon: {
    width: 40, height: 40, borderRadius: radius.xl,
    backgroundColor: withAlpha(colors.background, alpha.soft),
    alignItems: 'center', justifyContent: 'center',
  },
  continueTitle: { ...type.bodyStrong, color: colors.onPrimary },
  continueSub: { ...type.caption, color: withAlpha(colors.onPrimary, alpha.half), marginTop: spacing.xxs },

  // Hero plan card. Restrained: one primary CTA, two discreet text links
  // underneath. Stat goes in the eyebrow line so we don't waste a row on a
  // coloured pill that fights the workout name for attention.
  // D3 (design audit 03): the hero is the screen's ONLY elevated object,
  // surfaceElevated ranks it above every flat surface card in the stack.
  heroCard: {
    gap: spacing.sm,
  },
  // B-5: typography now comes from SectionLabel (tone="muted"); only
  // structural overrides remain local.
  heroEyebrow: {},
  workoutName: {
    fontSize: fontSize.xxl,
    fontFamily: fontFamily.heavy, fontWeight: fontWeight.black,
    color: colors.textPrimary,
    lineHeight: 30,
  },
  workoutMeta: { fontSize: fontSize.sm, color: colors.textSecondary },
  // F-18: the hero's one body sentence (week-complete state). A
  // sentence, so no line clamp - it wraps and the card grows.
  heroBody: { ...type.bodySm, color: colors.textSecondary },
  mesoBriefChip: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs2,
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.border,
  },
  mesoBriefText: { fontSize: fontSize.xs, color: colors.textSecondary, fontFamily: fontFamily.medium, fontWeight: fontWeight.medium },
  // B-5/Button adoption: box, fill, radius, padding and label typography now
  // come from the shared <Button> primitive; only the local margin survives.
  primaryBtn: {
    marginTop: spacing.xs,
  },
  // One primary action plus one secondary options door. View, change workout
  // and blank session live in the sheet so the hero keeps a single dominant CTA.
  startWorkoutRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  startBtnSplit: { flex: 1, marginTop: 0 },
  // Button adoption: box/fill/radius/padding now come from <Button
  // variant="secondary">; only the label colour override survives (the
  // shared secondary variant's default fg is textPrimary, this stays the
  // slightly quieter textSecondary it always was).
  workoutOptionsBtn: {},
  workoutOptionsText: { color: colors.textSecondary },

  // No plan, plan-first section
  noPlanSection: { gap: spacing.md },

  // Campaign 22 Phase 2 Stage 2 (§7/§17 R5): "Progress at a glance" removed,
  // absorbed into the last-session row (3-way duplication fix).

  // Campaign 22 Phase 2 Stage 2 (§16/§17 R3, hero merge): CoachBriefCard's
  // card-in-card render becomes one quiet line inline in the hero, no
  // border, no nested surface -- the "card-in-card is eliminated" container
  // target.
  coachBriefLineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  coachBriefLineText: {
    ...type.bodySm,
    flex: 1,
    color: colors.textSecondary,
  },

  // D112 R5 (closes audit T1-14/T2-31, T1-15/T2-24): the standalone
  // constraint / AWAITING quiet rows, direct children of the scroll
  // content container (styles.content already supplies the horizontal
  // inset and the inter-row gap - no padding duplicated here). Same
  // weight as coachBriefLineRow/Text above; a trailing chevron and
  // full-row tap target since these navigate (the coach brief line
  // never did).
  // The capability lane's grouped list on Home. Same shape as Settings'
  // section and the Coach tab's NavGroup: one container, hairline-divided
  // rows, heading outside the box.
  constraintSection: { gap: spacing.md },
  constraintGroup: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    overflow: 'hidden',
  },
  constraintLineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    paddingVertical: spacing.xs,
    // Round 4 (F-4, J2): these quiet rows measured ~28px - below the
    // WCAG 44pt minimum - on exactly the surface built so a disabled
    // user can reach their capability state from Home. The text stays
    // quiet; the target does not. xxxl is the scale's 48 (the same
    // token Choice's minimum uses).
    minHeight: spacing.xxxl,
  },
  constraintLineText: {
    ...type.bodySm,
    flex: 1,
    color: colors.textSecondary,
  },

  // Block progress card
  // Pro coaching discovery nudge
  coachingNudge: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: withAlpha(colors.primary, alpha.edge),
  },
  coachingNudgeLeft: {
    width: 36, height: 36, borderRadius: radius.sm,
    backgroundColor: colors.primaryBg,
    alignItems: 'center', justifyContent: 'center',
  },
  coachingNudgeTitle: {
    ...type.label, color: colors.textPrimary,
  },
  coachingNudgeBody: {
    ...type.captionTight, color: colors.textSecondary,
  },
  coachingNudgeScanSubline: {
    ...type.captionTight, color: colors.textMuted,
  },
  // R9/D70: box/label now come from the shared <Button variant="tertiary">;
  // only the layout margin survives.
  coachingNudgeBtn: {
    marginTop: spacing.xs,
  },

  // R9 (D70): intentOverlay/intentSheet deleted - the shared BottomSheet
  // owns the scrim, panel chrome, insets and child gap now.
  intentTitle: {
    ...type.h3,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  intentSub: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  intentOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface2 ?? colors.background,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  intentOptionIcon: {
    width: 40, height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.primaryBg,
    alignItems: 'center', justifyContent: 'center',
  },
  intentOptionLabel: {
    ...type.bodyStrong,
    color: colors.textPrimary,
  },
  intentOptionSub: {
    ...type.caption,
    color: colors.textSecondary,
    marginTop: spacing.xxs,
  },
  // R2-10 ("Reorder"): the readiness block above the intent options. A quiet
  // overline heads it; each row is ONE line - fixed label column so the three
  // rows align, then three equal-width chips filling the rest.
  readinessGroupLabel: {
    ...type.overline,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  readinessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  readinessLabel: {
    ...type.caption,
    color: colors.textSecondary,
    width: 76,
  },
  readinessChips: {
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
  },
  // Equal thirds: overrides Chip's own alignSelf so the three chips share
  // the row evenly and every row's columns line up.
  readinessChipThird: {
    flex: 1,
    justifyContent: 'center',
  },
  // Breathing room between the optional block and the primary answers.
  intentOptionFirst: {
    marginTop: spacing.md,
  },
  readinessChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2 ?? colors.background,
  },
  readinessChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryBg,
  },
  readinessChipText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  readinessChipTextActive: {
    color: colors.primary,
    fontFamily: fontFamily.semibold, fontWeight: fontWeight.semibold,
  },
  intentSkip: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
  intentSkipText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  intentOptOut: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  intentOptOutText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  intentOptOutSub: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xxs,
    lineHeight: 16,
  },

  // Fresh coach review banner. D3 (design audit 03): banners are one slim
  // line above the hero, not card-sized siblings, tighter padding, no
  // extra bottom margin (the content gap carries the rhythm).
  coachBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.primaryBg, borderRadius: radius.md,
    borderWidth: 1, borderColor: withAlpha(colors.primary, alpha.mid),
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.md,
  },
  // COMP-023 trial value banner, grown into the A3 coach ledger card,
  // headline row plus the live threshold rows; matches the banner system.
  // D3: the trial-banner and free-coach-line styles moved to AttentionCard
  // with their JSX (one card class, internal priority recorded there).
  coachBannerLeft: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, flex: 1 },
  coachBannerTitle: { fontSize: fontSize.sm, fontFamily: fontFamily.bold, fontWeight: fontWeight.bold, color: colors.primary, marginBottom: spacing.xxs },
  coachBannerBody: { ...type.bodySm, color: colors.textSecondary },
  deloadBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: withAlpha(colors.primary, alpha.tint), borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderWidth: 1, borderColor: withAlpha(colors.primary, alpha.mid),
  },
  deloadBannerLeft: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, flex: 1 },
  deloadBannerTitle: { fontSize: fontSize.sm, fontFamily: fontFamily.bold, fontWeight: fontWeight.bold, color: colors.primary, marginBottom: spacing.xxs },
  deloadBannerBody: { ...type.bodySm, color: colors.textSecondary },

  // B3 lift plateau banner; one line plus tap-through, matches the banner
  // system's tokens (trial-banner top row shape).
  plateauBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.primaryBg, borderRadius: radius.md,
    borderWidth: 1, borderColor: withAlpha(colors.primary, alpha.edge),
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  plateauBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  plateauBannerText: {
    ...type.bodySm,
    flex: 1, fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },

  // S6 activation nudge banner (shares the plateau banner's card shape)
  activationBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.primaryBg, borderRadius: radius.md,
    borderWidth: 1, borderColor: withAlpha(colors.primary, alpha.edge),
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  activationBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  activationBannerTitle: {
    ...type.bodySm, fontWeight: fontWeight.semibold, color: colors.textPrimary,
  },
  activationBannerBody: {
    ...type.bodySm, color: colors.textMuted, marginTop: 2,
  },

  // Nutrition phase sync banner
  phaseBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.primaryBg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: withAlpha(colors.primary, alpha.edge),
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  phaseBannerText: {
    ...type.captionTight,
    flex: 1,
    color: colors.textSecondary,
  },
  phaseBannerArrow: {
    paddingLeft: spacing.xs,
  },

  // Quick-start card (empty state fast path)
  quickStartCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.primaryBg,
    borderRadius: radius.lg,
    borderWidth: 1,
    // D3: tinted edge, not a solid amber border (amber-inflation rule),
    // "Start with a plan" above is the no-plan state's one amber fill.
    borderColor: withAlpha(colors.primary, alpha.edge),
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  quickStartIcon: {
    width: 48,
    height: 48,
    borderRadius: circle(48),
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickStartTitle: {
    ...type.bodyStrong,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  quickStartSub: {
    ...type.bodySm,
    color: colors.textSecondary,
  },
});
