import { useState, useRef, useEffect, useMemo } from 'react';
import { appAlert } from '../components/AppAlert';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Platform, KeyboardAvoidingView, Animated, AccessibilityInfo, BackHandler, Keyboard } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, fontSize, fontWeight, spacing, radius, type, withAlpha, motion, shadow, fontFamily, circle } from '../styles/theme';
import useTheme from '../hooks/useTheme';
import { VolyumeIcon } from '../components/BrandMark';
import SegmentedControl from '../components/SegmentedControl';
import Chip from '../components/Chip';
import Button from '../components/Button';
import TextField from '../components/TextField';
import FieldError from '../components/FieldError';
import * as haptics from '../lib/haptics';
import InfoTooltip from '../components/InfoTooltip';
import { GLOSSARY } from '../lib/coachGlossary';
import Dropdown from '../components/Dropdown';
import OAuthButtons from '../components/auth/OAuthButtons';
import useAppStore from '../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import {
  logBodyMetric, logMorningWeight, saveNutritionTargets, saveUserBodyProfile,
  getProgrammeById,
} from '../lib/database';
import { stoneLbsToKg, ftInToCm, parseBodyWeightToKg } from '../lib/units';
import { signInWithGoogle, signInWithApple } from '../lib/supabase';
import { isAppleUser, appleFirstName } from '../lib/appleIdentity';
import { generateAndSavePlan, planShortfallNote, assessScheduleFit } from '../lib/planAutoGen';
// F-16 REVISED: the library route for the kettlebell-only / band-only kit
// answers, and the equipment-profile mapping that keeps every other engine
// (generation, swaps) reading a value it understands.
import {
  installLibraryPlanForKit, libraryKitForEquipment, generationEquipmentFor,
  libraryKitInstalledLine,
} from '../lib/startWithPlan';
import { capabilityPreflight, offerCapabilityPreflightChoice } from '../lib/capability/preflight';
import {
  PLAN_FIT, fitCopy, alternativeCopy, keepChoiceCopy, coverageCopy,
} from '../lib/planFit';
import {
  requestNotificationPermissions,
  scheduleMorningWeightNotification,
  scheduleEveningWeightReminder,
  scheduleCheckinReminder,
} from '../lib/notifications';
import { setPreference as setPrefRow } from '../lib/notifications/preferences';
import { getQuietHours, shiftHourMinuteOutOfQuietHours } from '../lib/notifications/quietHours';
import { ENROLMENT_WEIGHT_NOTE } from '../lib/checkinDerive';
import {
  PHYSIQUE_GOALS,
  TRAINING_PHASES,
  GOALS_WITH_WEAK_POINTS,
  GOAL_LABELS,
  PHASE_LABELS,
  weakPointSetForGoal,
  phaseToNutritionKey,
  phaseToCoachingKey,
  buildNutritionEngineInputs,
} from '../lib/coachingGoals';
import { calculateNutritionTargets, PROTEIN_APPROACHES, ADVANCED_PROTEIN_GOALS } from '../lib/nutritionEngine';
import { SPLIT_LABELS } from '../lib/planEngine';
import { BLOCK_PLANNED_WEEKS } from '../lib/mesocycle';
import { resolveEffectiveMaintenanceForUser } from '../lib/effectiveMaintenanceService';
import {
  saveDraft, loadDraft, clearDraft, loadBuildProgress, markBuildProgress, DRAFT_DEBOUNCE_MS,
} from '../lib/proOnboardingDraft';
import { dateOfBirthFromAgeYears } from '../lib/profileAge';
import { FIRST_CHECKIN_MIN_DAYS } from '../lib/trialActivation';
import { parseDecimalInput } from '../lib/parseDecimalInput';

const NOTIF_PREFS_KEY = '@volyume_notification_prefs';

// Plain-language one-liners for the protein tiers, kept short for the
// onboarding collapsible. The engine's own descriptions read more technical;
// these mirror the wording the plan builder uses so the two surfaces match.
const PROTEIN_SHORT = {
  standard:  'Enough for consistent training. Easy to sustain day to day.',
  optimised: 'The proven target for serious training. Best for most people.',
  advanced:  'Upper end for competitive athletes and harder cuts.',
};

// L04-6: Step 2 used to bundle two QuestionGroups (required details, then
// starting body composition) on one scroll, up to 7 fields at the highest-
// abandon-risk moment in onboarding, breaking the wizard's own "few fields
// per step" rule that Steps 3-4 (now 4-5) already followed. Body composition
// is now its own step (3), matching the one-QuestionGroup-per-step pattern
// used everywhere else. TOTAL_STEPS moved from 5 to 6; every step after the
// old Step 2 shifted up by one.
// CC28 (ARCHITECTURE section 11.1): one OPTIONAL capability step between
// Training week and Targets - the pinned-contract change done under the
// sexGate suite's guards (its step-2 pins are untouched). TOTAL_STEPS
// moved from 6 to 7; every step after Training week shifted up by one.
const TOTAL_STEPS = 7;
const STEP_LABELS = ['Account', 'Baseline', 'Body composition', 'Training week', 'Injuries & limitations', 'Targets', 'Check-in rhythm'];
const STEP_OUTCOMES = {
  1: [
    { icon: 'shield-checkmark-outline', label: 'Secure sign-in' },
    { icon: 'cloud-done-outline', label: 'Account recovery' },
  ],
  2: [
    { icon: 'calculator-outline', label: 'Calorie baseline' },
    { icon: 'trending-up-outline', label: 'Weight trend' },
  ],
  3: [
    { icon: 'analytics-outline', label: 'Body composition' },
    { icon: 'body-outline', label: 'Body-fat baseline' },
  ],
  4: [
    { icon: 'calendar-outline', label: 'Training split' },
    { icon: 'time-outline', label: 'Session length' },
    { icon: 'fitness-outline', label: 'Exercise pool' },
  ],
  5: [
    { icon: 'body-outline', label: 'Built around you' },
    { icon: 'checkmark-circle-outline', label: 'Optional, skip freely' },
  ],
  6: [
    { icon: 'flag-outline', label: 'Goal phase' },
    { icon: 'body-outline', label: 'Muscle priorities' },
    { icon: 'restaurant-outline', label: 'Nutrition target' },
  ],
  7: [
    { icon: 'pulse-outline', label: 'Recovery guardrails' },
    { icon: 'notifications-outline', label: 'Check-in rhythm' },
  ],
};

// COMP-013 plan setup sequence. Four honest stage lines, each mapped
// to a real _generatePlanInner phase, displayed for a minimum 800ms dwell while
// the real plan generation + DB writes run underneath. 3.2s total sits inside
// the evidence band (>2s informative, ~3-5s the working range of plan-build
// screens) without escalating into theatre. The sequence never completes before
// the real work does; failure aborts it instantly (no completion tick).
const STAGE_DWELL_MS = 800;
const SEQUENCE_TOTAL_MS = STAGE_DWELL_MS * 4;
// D147: how long every tick is shown before the card turns into the payoff.
const PAYOFF_HOLD_MS = 500;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// FOUNDER LAW (2026-08-13): there is NO default number of training days.
// This screen used to start everyone on four, which then fed the plan, the
// split, the volume landmarks and the calorie target - a load-bearing answer
// nobody had given. The athlete chooses, from two upwards, and the step will
// not advance until they have.
function daysToFreqBucket(daysPerWeek) {
  if (daysPerWeek <= 3) return '2-3';
  if (daysPerWeek <= 5) return '4-5';
  return '6+';
}

// The wizard's only accepted biological-sex values. The step-2 picker and the
// draft-restore step clamp read this SAME set, so the sex gate and its UI can
// never drift apart (F11: sex drives the sacred ED calorie floor + BMR).
const SEX_OPTIONS = [{ label: 'Male', value: 'male' }, { label: 'Female', value: 'female' }];
const ACCEPTED_SEX_VALUES = SEX_OPTIONS.map((o) => o.value);
const BODY_FAT_SOURCE_OPTIONS = [
  { label: 'Best estimate', value: 'visual' },
  { label: 'BIA', value: 'bia' },
  { label: 'Caliper', value: 'caliper' },
  { label: 'DEXA', value: 'dexa' },
];
const BODY_FAT_SOURCE_VALUES = BODY_FAT_SOURCE_OPTIONS.map((o) => o.value);

function normaliseBodyFatSource(source) {
  return BODY_FAT_SOURCE_VALUES.includes(source) ? source : 'visual';
}

// ONBOARD-001: height bounds (cm) for the required-details gate. Height feeds
// BMR and the calorie / FFM targets, so the step-2 gate refuses to advance until
// the entered height parses to a realistic figure. The band is deliberately
// wide, it spans the 13-100 age range the wizard allows, while still rejecting
// typos (a single digit, or a body weight typed into the height field). The
// nutrition engine keeps its OWN [100, 250] clamp; this gate is the user-facing
// refusal so a default is never silently treated as a confirmed height.
const MIN_HEIGHT_CM = 120;
const MAX_HEIGHT_CM = 250;

// Resolve the step-2 height inputs to a single cm value, in whichever unit the
// user is using. Returns NaN when the required field is blank, so the button's
// canContinue predicate and advanceFrom2 read the SAME result and can never
// drift apart (F11 spirit, mirroring the sex gate). Imperial requires feet;
// inches default to 0 for an exact "N ft" height.
function resolveHeightCm(units, cm, ft, inches) {
  if (units === 'imperial') {
    return ft.trim() !== '' ? ftInToCm(ft, inches) : NaN;
  }
  return parseDecimalInput(cm);
}

function isValidHeightCm(hcm) {
  return Number.isFinite(hcm) && hcm >= MIN_HEIGHT_CM && hcm <= MAX_HEIGHT_CM;
}

const EXPERIENCE_OPTIONS = [
  { value: 'beginner',     label: 'Beginner',     sub: 'Less than 18 months of consistent training' },
  { value: 'intermediate', label: 'Intermediate', sub: '18 months to 3 years of consistent training' },
  { value: 'advanced',     label: 'Advanced',     sub: '3 to 5 years, consistently adding weight over time' },
  { value: 'competitive',  label: 'Competitive',  sub: '5+ years, training for physique or performance' },
];

const SESSION_LENGTH_OPTIONS = [
  { label: '45 min', value: 45 },
  { label: '60 min', value: 60 },
  { label: '75 min', value: 75 },
  { label: '90 min', value: 90 },
];

// Two is a real answer, not a rounding error: the engine builds a genuine
// full-body week at two sessions and no longer quietly promotes it to three.
const DAYS_PER_WEEK_OPTIONS = [2, 3, 4, 5, 6];

const EQUIPMENT_OPTIONS = [
  { value: 'full_gym',        label: 'Full gym',          sub: 'Barbells, cables, machines, dumbbells' },
  { value: 'machines_cables', label: 'Machines and cables', sub: 'No free barbells' },
  { value: 'dumbbells_only',  label: 'Dumbbells only',    sub: 'Adjustable or fixed dumbbells' },
  { value: 'barbell_plates',  label: 'Barbell and plates',  sub: 'Power rack or squat stand setup' },
  { value: 'home_gym',        label: 'Home gym',          sub: 'Mixed equipment at home' },
  { value: 'bodyweight',      label: 'Bodyweight',        sub: 'No equipment needed' },
  // F-16 REVISED (docs/final-certification-2026-09-05/07-FINDINGS.md,
  // evidence A12): a kettlebell or band owner had to answer "Dumbbells Only"
  // or "Home Gym" and was then given a plan full of kit they do not own.
  // These two answers do NOT generate. The F-16 investigation
  // (04-TRAINING-STYLES.md) measured the real generator against the real
  // corpus and found it cannot build either kit honestly, so each answer
  // installs the LIBRARY plan that fits the week instead
  // (installLibraryPlanForKit, src/lib/startWithPlan.js).
  { value: 'kettlebells',     label: 'Kettlebells',       sub: 'One or two kettlebells, no other weights' },
  { value: 'bands',           label: 'Bands',             sub: 'Resistance bands, no weights' },
];

const RECOVERY_OPTIONS = [
  { value: 'poor',    label: 'Poor',    sub: 'Often sore, disrupted sleep, high life stress' },
  { value: 'average', label: 'Average', sub: 'Typical recovery between sessions' },
  { value: 'good',    label: 'Good',    sub: 'Sleeping well, low stress, nutrition on point' },
];

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
// Review B finding 6: the canonical editor (CoachingRemindersScreen
// HOURS_MORNING) offers 5am to 12pm; onboarding offering later hours
// left the editor showing no selected chip - same defect class as the
// fixed check-in hour.
const HOURS = Array.from({ length: 8 }, (_, i) => i + 5); // 5am to 12pm

function fmt12(h) {
  if (h === 0) return '12 am';
  if (h < 12) return `${h} am`;
  if (h === 12) return '12 pm';
  return `${h - 12} pm`;
}

// CP-10 batch G lane 1 (2026-07-11): each of these three helpers is a
// sibling function-component scope (not prop-drilled `live`/`t` from
// ProOnboardingScreen), so its own useTheme() call is cleaner than
// threading two extra props through every call site. Same shared
// buildLiveStyles(t) as the wizard screen itself.
// RA-3 (D96, Review A): the wizard's first visible screen was labelled
// "Step 2 of 6". Step 1 is the account leg, which every real user completes
// before this stack renders (and no producer of user.isLocal exists), so the
// visible steps are renumbered 1..5. The internal `step` state is untouched:
// gates, draft clamps and the sex gate all keep their numbering.
const displayStepOf = (step) => (step > 1
  ? { n: step - 1, total: TOTAL_STEPS - 1 }
  : { n: step, total: TOTAL_STEPS });

function ProOnboardingProgressBar({ step }) {
  const t = useTheme();
  const live = useMemo(() => buildLiveStyles(t), [t]);
  // Endowed Progress Effect: the bar opens with a small amount already filled
  // rather than empty, so step 1 doesn't read as "0% done, long way to go".
  const BASE = 0.12;
  const d = displayStepOf(step);
  const advanced = d.total > 1 ? (d.n - 1) / (d.total - 1) : 1;
  const filled = Math.round((BASE + (1 - BASE) * advanced) * 100);
  return (
    <View style={[styles.progressTrack, live.progressTrack]}>
      <View style={[styles.progressFill, live.progressFill, { width: `${filled}%` }]} />
    </View>
  );
}

function ProOnboardingHeader({ step, title, sub, onBack }) {
  const t = useTheme();
  const live = useMemo(() => buildLiveStyles(t), [t]);
  const stepLabel = STEP_LABELS[step - 1] || 'Setup';
  const outcomes = STEP_OUTCOMES[step] || [];
  return (
    <View style={styles.headerBlock}>
      <View style={styles.brandRow}>
        {onBack ? (
          <TouchableOpacity
            onPress={onBack}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={styles.brandBack}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Ionicons name="chevron-back" size={24} color={t.colors.textPrimary} />
          </TouchableOpacity>
        ) : null}
        <VolyumeIcon size={22} />
      </View>
      <ProOnboardingProgressBar step={step} />
      <Text style={[styles.stepCount, live.stepCount]}>Step {displayStepOf(step).n} of {displayStepOf(step).total} - {stepLabel}</Text>
      <Text style={[styles.stepTitle, live.stepTitle]}>{title}</Text>
      {sub ? <Text style={[styles.stepSub, live.stepSub]}>{sub}</Text> : null}
      {outcomes.length ? (
        <View style={styles.outcomeCard}>
          <Text style={[styles.outcomeEyebrow, live.outcomeEyebrow]}>This step sets</Text>
          <View style={styles.outcomeGrid}>
            {outcomes.map((item) => (
              <View key={item.label} style={[styles.outcomeChip, live.outcomeChip]}>
                <Ionicons name={item.icon} size={14} color={t.colors.primary} />
                {/* Campaign 27 Pillar A (D104): chip has no fixed height and
                    sizes to content, so the label wraps instead of clamping. */}
                <Text style={[styles.outcomeChipText, live.outcomeChipText]}>{item.label}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

// D147: one stage row. The row's box never changes; only its status
// treatment does: the tick fades in, the text steps between muted and full.
function StageRow({ label, state, reduceMotion, t, live }) {
  const textOpacity = useRef(new Animated.Value(state === 'upcoming' ? 0.55 : 1)).current;
  const tickOpacity = useRef(new Animated.Value(state === 'done' ? 1 : 0)).current;
  useEffect(() => {
    const textTo = state === 'upcoming' ? 0.55 : 1;
    const tickTo = state === 'done' ? 1 : 0;
    if (reduceMotion) {
      textOpacity.setValue(textTo);
      tickOpacity.setValue(tickTo);
      return;
    }
    Animated.parallel([
      Animated.timing(textOpacity, { toValue: textTo, duration: motion.fast, useNativeDriver: true }),
      Animated.timing(tickOpacity, { toValue: tickTo, duration: motion.fast, useNativeDriver: true }),
    ]).start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, reduceMotion]);
  return (
    <View style={styles.seqRow} accessibilityLabel={`${label}, ${state === 'done' ? 'done' : state === 'current' ? 'in progress' : 'next'}`}>
      <View style={styles.seqIcon}>
        {state === 'current' ? <ActivityIndicator size="small" color={t.colors.primary} /> : null}
        {state === 'upcoming' ? <View style={[styles.seqDot, live.seqDot]} /> : null}
        <Animated.View style={[StyleSheet.absoluteFill, styles.seqIconCentre, { opacity: tickOpacity }]} pointerEvents="none">
          <Ionicons name="checkmark-circle" size={18} color={t.colors.primary} importantForAccessibility="no" />
        </Animated.View>
      </View>
      <Animated.Text style={[styles.seqLine, live.seqLine, state === 'current' && styles.seqLineCurrent, { opacity: textOpacity }]}>
        {label}
      </Animated.Text>
    </View>
  );
}

function QuestionGroup({ icon, title, sub, children }) {
  const t = useTheme();
  const live = useMemo(() => buildLiveStyles(t), [t]);
  return (
    <View style={[styles.questionGroup, live.questionGroup]}>
      <View style={styles.questionGroupHead}>
        <View style={[styles.questionGroupIcon, live.questionGroupIcon]}>
          <Ionicons name={icon} size={18} color={t.colors.primary} />
        </View>
        <View style={styles.questionGroupCopy}>
          {/* RA-7 (D96, Review A): title optional. On a step with exactly
              one group it grouped nothing and restated the header. */}
          {title ? <Text style={[styles.questionGroupTitle, live.questionGroupTitle]}>{title}</Text> : null}
          {sub ? <Text style={[styles.questionGroupSub, live.questionGroupSub]}>{sub}</Text> : null}
        </View>
      </View>
      {children}
    </View>
  );
}

// D112 R5 (closes audit T1-12): after a successful generation, the count of
// slots the capability lane blocked. Mirrors PlanUpdateScreen's dry-run
// preview (the model), which is the source of the exact copy this pins.
function capabilityBlockedNote(n) {
  return n === 1
    ? "1 movement clashed with an injury or limitation you've set, so your plan works without it."
    : `${n} movements clashed with your injuries or limitations, so your plan works without them.`;
}

export default function ProOnboardingScreen({ navigation }) {
  const {
    user, setUnits, bodyWeightUnits, setBodyWeightUnits, userProfile, saveLocalProfile,
    proOnboardingAccountCreated, setProOnboardingAccountCreated,
    completeFirstRun, setPostSetupLanding,
  } = useAppStore(useShallow(s => ({
    completeFirstRun: s.completeFirstRun,
    setPostSetupLanding: s.setPostSetupLanding,
    user: s.user,
    setUnits: s.setUnits,
    bodyWeightUnits: s.bodyWeightUnits,
    setBodyWeightUnits: s.setBodyWeightUnits,
    userProfile: s.userProfile,
    saveLocalProfile: s.saveLocalProfile,
    proOnboardingAccountCreated: s.proOnboardingAccountCreated,
    setProOnboardingAccountCreated: s.setProOnboardingAccountCreated,
  })));

  // CP-10 batch G lane 1 (2026-07-11): live theme (src/hooks/useTheme.js).
  // Memoised: this wizard renders several mapped option/chip lists per
  // step. Every wizard step gate (advanceFromN, canContinue, the sex/
  // height/weight/age validation), the plan-generation sequence and every
  // saved value are untouched -- colours only.
  const t = useTheme();
  const live = useMemo(() => buildLiveStyles(t), [t]);

  // RA-3 (D96, Review A): lazy initialiser. The advance-past-step-1 effect
  // below runs AFTER the first paint, so an already-signed-in user (every
  // real user: nothing in src/ produces isLocal) saw the sign-in step they
  // had just completed flash for a frame before landing on step 2.
  const [step, setStep] = useState(() => (user && !user.isLocal ? 2 : 1));

  // Activation funnel: setup_started fires once, on the first visible step's
  // mount (whichever step that is for this user), for a signed-in user only.
  // trackFirst is durably deduped per (user, event) in AsyncStorage, so a
  // remount never double-counts; fire-and-forget, never blocks the paint.
  useEffect(() => {
    if (user?.id && !user.isLocal) {
      try {
        // eslint-disable-next-line global-require
        const { trackFirst } = require('../lib/telemetry/firsts');
        trackFirst(user.id, 'setup_started').catch(() => {});
      } catch (_) { /* tolerate */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A4 (pre-release sweep 2026-07-27): feet/inches and stone/lbs are both
  // numeric-pad pairs (no Return key on iOS, so returnKeyType/
  // onSubmitEditing would be inert -- A3 removed exactly that dead-prop
  // pattern). Chain focus instead via TextField's numeric Done-bar "Next"
  // affordance.
  const heightInchesRef = useRef(null);
  const bodyWeightLbsRef = useRef(null);
  // D146 (founder, 2026-09-04): the wizard points at what is missing rather
  // than greying the button out. Continue stays enabled; a tap with a gap
  // marks the step "attempted", the missing boxes take the error state with
  // a one-line message, the first of them is scrolled into view and focused
  // where it is a text field, and the line under Continue names what is
  // still needed. Errors clear live as each box is filled. Before the first
  // attempt nothing is red: the labels mark the optional boxes, everything
  // else is required.
  const ageRef = useRef(null);
  const heightFtRef = useRef(null);
  const heightCmRef = useRef(null);
  const bodyWeightStRef = useRef(null);
  const bodyWeightRef = useRef(null);
  const scrollRef = useRef(null);
  // Field y positions inside the step, captured by onLayout: the group's own
  // offset in the scroll content plus each section's offset in the group.
  const fieldY = useRef({});
  const [attempted2, setAttempted2] = useState(false);
  const [attempted4, setAttempted4] = useState(false);
  const [attempted6, setAttempted6] = useState(false);
  const [attempted7, setAttempted7] = useState(false);

  function markY(key) {
    return (e) => { fieldY.current[key] = e.nativeEvent.layout.y; };
  }
  function scrollToField(groupKey, key) {
    const y = (fieldY.current[groupKey] || 0) + (fieldY.current[key] || 0);
    scrollRef.current?.scrollTo?.({ y: Math.max(0, y - spacing.md), animated: true });
  }
  // Shared by every gated step: mark attempted, tell the hand, bring the
  // first gap into view, and put the cursor in it when it is a text field.
  function surfaceGaps(errs, order, groupKey, focusRefs, setAttempted) {
    setAttempted(true);
    haptics.error();
    const first = order.find((k) => errs[k]);
    if (!first) return;
    scrollToField(groupKey, first);
    const ref = focusRefs?.[first];
    if (ref?.current?.focus) setTimeout(() => ref.current?.focus?.(), 260);
  }
  const STEP2_LABELS = { sex: 'biological sex', age: 'age', height: 'height', weight: 'body weight' };
  const STEP4_LABELS = { experience: 'training experience', sessionLength: 'session length', days: 'training days', equipment: 'equipment' };
  function stillNeeded(errs, order, labels) {
    const names = order.filter((k) => errs[k]).map((k) => labels[k]);
    if (!names.length) return null;
    return `Still needed: ${names.join(', ')}.`;
  }
  function validateStep2() {
    const errs = {};
    if (sex !== 'male' && sex !== 'female') errs.sex = 'Choose your biological sex.';
    if (!age || isNaN(parseInt(age, 10)) || parseInt(age, 10) < 13 || parseInt(age, 10) > 100) errs.age = 'Enter your age, 13 to 100.';
    const enteredHeightCm = resolveHeightCm(localHeightUnits, heightCm, heightFt, heightIn);
    if (!isValidHeightCm(enteredHeightCm)) errs.height = 'Enter your height.';
    const bwKg = localBWUnits === 'st'
      ? stoneLbsToKg(bodyWeightSt, bodyWeightStLbs || '0')
      : parseBodyWeightToKg(bodyWeight, localBWUnits);
    if (!bwKg || isNaN(bwKg) || bwKg < 30 || bwKg > 300) errs.weight = 'Enter your body weight.';
    return errs;
  }
  function validateStep4() {
    const errs = {};
    if (!experience) errs.experience = 'Choose your training experience.';
    if (!sessionLengthMinutes) errs.sessionLength = 'Choose your usual session length.';
    if (!daysPerWeek) errs.days = 'Choose your training days.';
    if (!equipment) errs.equipment = 'Choose your equipment.';
    return errs;
  }
  function validateStep6() {
    const errs = {};
    if (!trainingPhase) errs.phase = 'Choose what you are focused on.';
    return errs;
  }
  function validateStep7() {
    const errs = {};
    if (!recoveryRating) errs.recovery = 'Choose your recovery level.';
    return errs;
  }

  // COMP-013: Reduce Motion skips the staged build sequence entirely (the button
  // spinner stays, exactly the old behaviour). Same flag ProSetupComplete reads.
  const reduceMotion = useAppStore(s => s.accessibility?.reduceMotion);
  const [sequenceActive, setSequenceActive] = useState(false);
  // The stage that is current (1..4); 5 = every stage done. 0 = not started.
  // D147 (founder, 2026-09-04): every stage row is rendered from the first
  // frame, so the card never grows; only each row's status treatment
  // animates. When the fourth completes, the card's content crossfades to
  // the plan-ready payoff in place. The outer composition never moves.
  const [sequenceStage, setSequenceStage] = useState(0);
  const stageTimersRef = useRef([]);
  const sequenceFade = useRef(new Animated.Value(0)).current;
  const stageContentOpacity = useRef(new Animated.Value(1)).current;
  const payoffOpacity = useRef(new Animated.Value(0)).current;
  // The generated plan, read back once it exists: what the payoff shows.
  const [payoff, setPayoff] = useState(null);
  const [payoffShown, setPayoffShown] = useState(false);
  // The payoff is laid out invisibly from the start and measured, so the
  // card reserves the taller of the two contents before anything moves.
  const [payoffH, setPayoffH] = useState(0);
  // Guards a synchronous double-tap on Continue: in sequence mode the button is
  // covered by the overlay rather than disabled by `busy`, so a fast second tap
  // before the overlay commits could fire two plan generations.
  const submittingRef = useRef(false);

  // True when this ACCOUNT authenticates through Apple, read from the Supabase
  // auth user rather than from anything this wizard run observed.
  //
  // The first attempt at this gated the field on a `nameFromApple` state that
  // handleOAuthOnboarding set. That was dead code and changed nothing for
  // anybody: this stack only mounts once a
  // session exists (RootNavigator returns WelcomeStack while `user` is null),
  // `step` therefore initialises to 2, step 1 never renders, and the handler
  // that set the flag never ran for a single real user. Deriving it from the
  // session instead means it is true on every route, on the first sign-in and
  // on every one after, with no ordering to get wrong.
  const appleUser = isAppleUser(user);

  // Step 1, profile. For an Apple account, seed from what Authentication
  // Services already supplied (the credential on first authorisation, the auth
  // user's metadata thereafter) so the greeting has a name without the athlete
  // ever being asked. Non-Apple routes keep the exact prior behaviour.
  const [firstName, setFirstName] = useState(
    () => appleFirstName({ sessionUser: user, storedProfile: userProfile }) || '',
  );
  // Founder ruling 2026-08-19, SECOND report, from a TestFlight build that
  // already carried the first attempt: an Apple-authenticated athlete is never
  // shown this box. Not conditionally. Never.
  //
  // The first attempt gated on "did a name actually arrive", to avoid leaving
  // a nameless athlete with nowhere to answer. It reads well and it fails the
  // one case that matters most. Apple hands the name over on the FIRST
  // authorisation for an Apple ID and returns null on every sign-in after
  // that, so everybody who re-installs - every TestFlight tester, every App
  // Review re-test, every athlete on a new phone - arrives with no name, and
  // the box came straight back on the screen directly after the Apple button.
  // That IS the complaint the fix was for.
  //
  // Nobody is stranded by hiding it: the name is presentation only, no engine
  // reads it, every surface that greets by name has a neutral fallback, and
  // Settings -> Profile sets or changes it at any time.
  const hideNameField = appleUser;


  const localUnits = 'kg';
  const [localBWUnits, setLocalBWUnits] = useState(bodyWeightUnits || 'st');
  // OB-5 (audit 02): body weight and age start EMPTY and join sex as
  // explicit-entry fields. The old prefills (80 kg, age 30) were real editable
  // values that validated untouched, so plausible-looking calorie targets
  // could be computed on someone else's body. The example values now live in
  // the placeholders, and the step-2 Continue stays disabled (canContinue)
  // until both are genuinely entered.
  const [bodyWeightSt, setBodyWeightSt] = useState('');
  const [bodyWeightStLbs, setBodyWeightStLbs] = useState('');
  const [bodyWeight, setBodyWeight] = useState('');
  // Optional body fat, mirrors NutritionTargetsScreen. When a measured value is
  // given (not visual) the engine uses the lean-mass BMR formula, the same as
  // Nutrition Targets, so onboarding and the targets screen compute the SAME
  // maintenance. Without it, onboarding under-estimated maintenance (Mifflin
  // only) and the bulk target came out ~300 kcal too low, landing on the lean
  // bulk number.
  const [bodyFat, setBodyFat] = useState('');
  const [bfSource, setBfSource] = useState('visual');
  const [localHeightUnits, setLocalHeightUnits] = useState('imperial');
  // Biological sex has NO default (founder 2026-07-01): it drives the ED
  // calorie floor (1500 male / 1200 female) and BMR, so a silent 'male' default
  // could mis-floor a female. advanceFrom2 requires an explicit choice before
  // the profile step can complete, so sex is never unknown by the time targets
  // are computed.
  const [sex, setSex] = useState(null);
  // OB-5: age starts empty too (see the body-weight note above).
  const [age, setAge] = useState('');
  // ONBOARD-001 (audit): height starts BLANK and joins sex / body weight / age
  // as an explicit-entry field. The old '175' cm / 5 ft 9 in seed was a real,
  // plausible height that validated untouched, so calorie / FFM / BMR targets
  // could be computed on a height the user never confirmed. The example values
  // now live in the placeholders; the step-2 Continue stays disabled
  // (canContinue) and advanceFrom2 refuses until a realistic height is entered.
  const [heightCm, setHeightCm] = useState('');
  const [heightFt, setHeightFt] = useState('');
  const [heightIn, setHeightIn] = useState('');

  // Step 2, training setup (all dropdowns / segments)
  const [experience, setExperience] = useState(null);
  const [sessionLengthMinutes, setSessionLengthMinutes] = useState(60);
  // No default: an unanswered schedule stays unanswered until the athlete
  // answers it. See DAYS_PER_WEEK_OPTIONS above.
  const [daysPerWeek, setDaysPerWeek] = useState(null);
  const [equipment, setEquipment] = useState(null);
  // Defaults to 'general' (not competing). Users tap into the optional
  // "Competing in a category?" dropdown to pick a physique category.
  const [trainingGoal, setTrainingGoal] = useState('general');
  // Default to lean gain (lean bulk) rather than an empty greyed picker, so
  // the screen lands on the most common phase and the user changes it only if
  // they want something else.
  // Founder device report 2026-08-18 ("I selected bulk... my training says
  // lean gain"): the phase used to start PRE-SELECTED as 'lean_gain', so a
  // user could sail through step 5 without their real choice ever
  // registering - the exact silent default the onboarding-enforcement law
  // (CLAUDE.md Section 2) forbids for required fields. No default: the
  // advanceFrom6 gate now genuinely blocks until a phase is chosen. Quiz
  // answers and saved drafts still prefill - both are explicit choices.
  const [trainingPhase, setTrainingPhase] = useState(null);
  // Weak points the user wants to bring up (UI labels, max 3). Division-scoped:
  // the options shown depend on trainingGoal. Passed into plan generation, which
  // biases volume towards these muscles within the recovery envelope.
  const [planWeakPoints, setPlanWeakPoints] = useState([]);

  // Protein target. Left null, the engine picks the right approach for the
  // goal (advanced for physique competitors, optimised for everyone else),
  // which is exactly what we want by default. The user only overrides it by
  // opening the collapsible and choosing, so the default path never shifts
  // anyone's targets away from the engine's recommendation.
  const [proteinOverride, setProteinOverride] = useState(null);
  const [proteinOpen, setProteinOpen] = useState(false);
  const suggestedApproach = ADVANCED_PROTEIN_GOALS.includes(trainingGoal) ? 'advanced' : 'optimised';
  const proteinApproach = proteinOverride ?? suggestedApproach;
  const [provisionalKcal, setProvisionalKcal] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function resolveProvisionalTarget() {
      if (step !== 5 || !trainingPhase || !sex) {
        setProvisionalKcal(null);
        return;
      }
      setProvisionalKcal(null);
      try {
        const bwKg = localBWUnits === 'st'
          ? stoneLbsToKg(bodyWeightSt, bodyWeightStLbs)
          : parseBodyWeightToKg(bodyWeight, localBWUnits);
        const hcm = localHeightUnits === 'imperial'
          ? (!isNaN(parseInt(heightFt, 10)) ? ftInToCm(heightFt, heightIn) : null)
          : (parseDecimalInput(heightCm) || null);
        const ageNum = parseInt(age, 10) || null;
        if (!Number.isFinite(bwKg) || bwKg <= 0 || !hcm || !ageNum) {
          if (!cancelled) setProvisionalKcal(null);
          return;
        }
        const bfParsed = parseDecimalInput(bodyFat);
        const bfNum = bodyFat.trim() && Number.isFinite(bfParsed) && bfParsed > 0 && bfParsed < 60
          ? bfParsed : null;
        const inputs = buildNutritionEngineInputs({
          sex,
          age: ageNum,
          heightCm: hcm,
          weightKg: bwKg,
          bodyFatPct: bfNum,
          bodyFatSource: bfNum != null ? normaliseBodyFatSource(bfSource) : null,
          daysPerWeek,
          trainingPhase,
          trainingGoal,
          proteinApproach,
          experience,
        });
        const authority = user?.id
          ? await resolveEffectiveMaintenanceForUser(user.id, {
            ...inputs,
            dateOfBirth: dateOfBirthFromAgeYears(ageNum),
          }, { persistRevalidationMarker: false })
          : null;
        const targets = calculateNutritionTargets({
          ...inputs,
          effectiveMaintenanceResidualKcal: authority?.resolved?.appliedResidualKcal ?? 0,
        });
        if (!cancelled) setProvisionalKcal(targets?.targetKcal ?? null);
      } catch (_) {
        if (!cancelled) setProvisionalKcal(null);
      }
    }
    resolveProvisionalTarget();
    return () => { cancelled = true; };
  }, [
    step, trainingPhase, trainingGoal, sex, age, localBWUnits, bodyWeightSt,
    bodyWeightStLbs, bodyWeight, localHeightUnits, heightFt, heightIn, heightCm,
    bodyFat, bfSource, daysPerWeek, proteinApproach, experience, user?.id,
  ]);

  // COMP-030: prefill the training + goal steps from the pre-account quiz slice
  // (Variant B), so a quiz-first user confirms rather than re-answers. One-shot
  // on mount; no-op when the quiz wasn't run (flag off / Free path).
  const onboardingQuiz = useAppStore(s => s.onboardingQuiz);
  useEffect(() => {
    const q = onboardingQuiz;
    if (!q) return;
    if (q.experience) setExperience(q.experience);
    if (Number.isFinite(q.sessionLengthMinutes)) setSessionLengthMinutes(q.sessionLengthMinutes);
    if (Number.isFinite(q.daysPerWeek)) setDaysPerWeek(q.daysPerWeek);
    if (q.equipment) setEquipment(q.equipment);
    if (q.trainingGoal) setTrainingGoal(q.trainingGoal);
    if (q.trainingPhase) setTrainingPhase(q.trainingPhase);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Changing division re-scopes the weak-point options, so drop any selected
  // muscle that the new division does not offer.
  function changeGoal(nextGoal) {
    setTrainingGoal(nextGoal);
    const allowed = weakPointSetForGoal(nextGoal);
    setPlanWeakPoints(prev => prev.filter(m => allowed.includes(m)));
  }

  function toggleWeakPoint(muscle) {
    setPlanWeakPoints(prev => {
      if (prev.includes(muscle)) return prev.filter(m => m !== muscle);
      if (prev.length >= 3) return prev; // cap at 3; chips show the current pick
      return [...prev, muscle];
    });
  }

  // Step 4, recovery + reminders
  const [recoveryRating, setRecoveryRating] = useState(null);
  const [morningHour, setMorningHour] = useState(7);
  // C5-P28-01 (D96): quiet hours default to 22:00 -> 07:00, so a 5 AM or 6 AM
  // pick is shifted to 07:00 at schedule time while every display kept showing
  // the picked hour. The rule itself is locked and unchanged; the picker now
  // states the time the reminder will actually arrive.
  const [quietHours, setQuietHoursState] = useState(null);
  useEffect(() => {
    let cancelled = false;
    getQuietHours()
      .then((q) => { if (!cancelled) setQuietHoursState(q); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  const morningShift = quietHours
    ? shiftHourMinuteOutOfQuietHours(morningHour, 0, quietHours)
    : { shifted: false };
  const [checkinDay, setCheckinDay] = useState(0);

  // Step 1, account. OAuth only (Apple/Google), the email + password path was
  // removed (founder 2026-07-01) because email confirmation was flaky. OAuth
  // completes the account inside handleOAuthOnboarding, which sets
  // accountCreated and advances to step 2; there is no signup/signin mode.
  // RA-3: initialised alongside `step` above, for the same reason - a
  // signed-in user starts at step 2 with the account leg already done.
  const [accountCreated, setAccountCreated] = useState(() => !!(user && !user.isLocal));

  const [busy, setBusy] = useState(false);
  const oauthInFlightRef = useRef(false);

  // ── Schedule fit ──────────────────────────────────────────────────────────
  // The fit answer is computed from the athlete's REAL prescription, which is
  // not fully known until the last question is answered: the division sets
  // which muscles are prioritised, the weak points add volume on top, and the
  // recovery rating scales the whole week. So the assessment runs at the END
  // of the wizard, after step 6, rather than beside the schedule controls in
  // step 4 where three of its four inputs would still be missing. Assessing
  // early and calling the result a recommendation would be fake precision.
  const [fitReview, setFitReview] = useState(null);
  const [fitBusy, setFitBusy] = useState(false);
  // Set once the athlete has seen the fit panel and made their call. Their
  // decision is then honoured without being asked again - Volyume recommends,
  // it does not nag.
  const [fitAccepted, setFitAccepted] = useState(false);
  const fitResumeRef = useRef(false);
  // Synchronous twin of fitBusy: two fast taps both read the state flag as
  // false before either render lands, and would each start an assessment.
  const fitInFlightRef = useRef(false);

  const nameRef = useRef(null);
  useEffect(() => {
    // Not for an Apple-authenticated user: the first-name field is not
    // rendered for them at all (App Review Guideline 4), so there is nothing
    // to focus and no keyboard should be raised. The optional chain below
    // already made this harmless; the condition makes it deliberate.
    if (step === 2 && !hideNameField) {
      const t = setTimeout(() => nameRef.current?.focus(), 350);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [step, hideNameField]);

  // Auto-advance past Step 1 if the user is already authenticated when the
  // screen mounts. Happens after OAuth: SIGNED_IN flips isAuthLoading true,
  // RootNavigator's splash gate unmounts ProOnboardingStack, the cloud
  // restore finishes, the stack remounts, and `step` resets to 1, dropping
  // the user back on "Create your account" even though they're signed in.
  // Without this, the OAuth flow loops: Step 1 → auth → splash → Step 1.
  // Local-only users (isLocal: true) still see Step 1 because they haven't
  // created a cloud account yet.
  useEffect(() => {
    if (step === 1 && user && !user.isLocal) {
      // If this session already created (or signed into) the account,
      // resume past Step 1 no matter what. The Article 9 consent gate
      // unmounts this stack right after sign-up, wiping the local step
      // state; the persisted flag is how we get back to where the wizard
      // continues instead of stranding the user on Create your account.
      // The old userProfile guard failed here because the sign-up sync
      // hydrates a profile, so it wrongly blocked the resume (the loop).
      if (proOnboardingAccountCreated) {
        setAccountCreated(true);
        setStep(2);
        return;
      }
      // Any OTHER authenticated non-local user advances too. Step 1 exists
      // only to create an account, and this stack only mounts when the
      // navigator has already decided the user belongs in the wizard
      // (firstRunComplete false). The old `if (userProfile) return;` guard
      // here assumed a hydrated profile meant "restored account about to be
      // sent to MainTabs" - false in two deterministic live states (the
      // Free-to-Pro upgrade via resetFirstRun, and a relaunch after a kill
      // on the hand-off screen), where it trapped a signed-in user on an
      // OAuth-only screen with no forward or back (C5-P29-01, D96).
      setAccountCreated(true);
      setStep(2);
    }
  }, [step, user, userProfile, proOnboardingAccountCreated]);

  // ── OB-3: draft persistence across process death ─────────────────────────────
  // The wizard's answers live in screen-local state, so a process kill used to
  // lose steps 2-5. A per-uid AsyncStorage draft (lib/proOnboardingDraft)
  // restores { step, answers } on mount and is cleared when the wizard
  // completes. Restoring NEVER weakens the sex gate: a draft saved with sex
  // null restores sex null, so step 2's canContinue still blocks Continue.
  const draftRestoredRef = useRef(false);
  // Saving stays off until the restore read has settled, so a mount-time save
  // of default answers can never overwrite a further-along draft mid-load.
  const draftLoadedRef = useRef(false);
  useEffect(() => {
    if (draftRestoredRef.current) return;
    if (!user?.id || user.isLocal) return;
    draftRestoredRef.current = true;
    loadDraft(user.id).then((draft) => {
      draftLoadedRef.current = true;
      if (!draft) return;
      const a = draft.answers || {};
      const str = (v, set) => { if (typeof v === 'string') set(v); };
      const num = (v, set) => { if (Number.isFinite(v)) set(v); };
      str(a.firstName, setFirstName);
      if (a.localBWUnits === 'st' || a.localBWUnits === 'kg' || a.localBWUnits === 'lbs') setLocalBWUnits(a.localBWUnits);
      str(a.bodyWeightSt, setBodyWeightSt);
      str(a.bodyWeightStLbs, setBodyWeightStLbs);
      str(a.bodyWeight, setBodyWeight);
      str(a.bodyFat, setBodyFat);
      if (typeof a.bfSource === 'string') setBfSource(normaliseBodyFatSource(a.bfSource));
      if (a.localHeightUnits === 'imperial' || a.localHeightUnits === 'metric') setLocalHeightUnits(a.localHeightUnits);
      // Sex only ever restores an explicit prior choice; anything else stays null.
      const sexValid = ACCEPTED_SEX_VALUES.includes(a.sex);
      if (sexValid) setSex(a.sex);
      str(a.age, setAge);
      str(a.heightCm, setHeightCm);
      str(a.heightFt, setHeightFt);
      str(a.heightIn, setHeightIn);
      str(a.experience, setExperience);
      num(a.sessionLengthMinutes, setSessionLengthMinutes);
      num(a.daysPerWeek, setDaysPerWeek);
      str(a.equipment, setEquipment);
      str(a.trainingGoal, setTrainingGoal);
      str(a.trainingPhase, setTrainingPhase);
      if (Array.isArray(a.planWeakPoints)) setPlanWeakPoints(a.planWeakPoints.filter((m) => typeof m === 'string').slice(0, 3));
      str(a.proteinOverride, setProteinOverride);
      str(a.recoveryRating, setRecoveryRating);
      num(a.morningHour, setMorningHour);
      num(a.checkinDay, setCheckinDay);
      // The account step is behind a restored draft by definition.
      setAccountCreated(true);
      // F11 seam: a draft persisted past step 2 whose sex is not an accepted
      // value (corrupt/hand-edited storage) must NOT restore past the sex
      // gate, sex drives the sacred ED floor, and step 2's canContinue is
      // the only thing enforcing it. Clamp the restored step to 2 until the
      // draft carries a valid explicit choice.
      setStep((s) => Math.max(s, sexValid ? draft.step : Math.min(draft.step, 2)));
    }).catch(() => { draftLoadedRef.current = true; /* fresh start, same as no draft */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Debounced draft save on any answer/step change while the wizard is live.
  // Skips step 1 (auth-owned) and the final submission (advanceFrom7 clears
  // the draft; a queued save after that would resurrect it).
  const draftTimerRef = useRef(null);
  useEffect(() => {
    if (!user?.id || user.isLocal || step < 2) return undefined;
    if (!draftLoadedRef.current || submittingRef.current) return undefined;
    const answers = {
      firstName, localBWUnits, bodyWeightSt, bodyWeightStLbs, bodyWeight,
      bodyFat, bfSource, localHeightUnits, sex, age, heightCm, heightFt,
      heightIn, experience, sessionLengthMinutes, daysPerWeek, equipment,
      trainingGoal, trainingPhase, planWeakPoints, proteinOverride,
      recoveryRating, morningHour, checkinDay,
    };
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      saveDraft(user.id, step, answers);
    }, DRAFT_DEBOUNCE_MS);
    return () => { if (draftTimerRef.current) clearTimeout(draftTimerRef.current); };
  }, [
    user, step, firstName, localBWUnits, bodyWeightSt, bodyWeightStLbs,
    bodyWeight, bodyFat, bfSource, localHeightUnits, sex, age, heightCm,
    heightFt, heightIn, experience, sessionLengthMinutes, daysPerWeek,
    equipment, trainingGoal, trainingPhase, planWeakPoints, proteinOverride,
    recoveryRating, morningHour, checkinDay,
  ]);

  // ── Step transition helpers ──────────────────────────────────────────────────

  function goBack() {
    if (step === 1) return;
    Keyboard.dismiss();
    if (step === 2 && accountCreated) return; // can't go back past completed registration
    // Going back means an answer may change, and every answer behind this
    // screen feeds the fit assessment. A stale acceptance would let a
    // re-edited schedule skip the check it was never run against.
    setFitAccepted(false);
    setFitReview(null);
    setStep(s => s - 1);
  }

  // C5-P1-04 / C5-P30-01 (D96): the whole six-step wizard is ONE registered
  // screen, so React Navigation had nothing to pop and Android's Back button
  // closed the app from any step. The on-screen chevron (steps 3-6) and the
  // hardware button did different things on the same screen, and the exit read
  // as a crash. Hardware Back now mirrors the chevron exactly: it steps the
  // wizard back where a legal previous step exists, and returns false at steps
  // 1-2 so the fail-closed exit stands. Step 2 is the required-safe baseline
  // (sex, age, height, weight) and step 1 the account, so neither can be
  // reached past backwards, and the consent gate lives in a different stack
  // entirely (pins C5-P30-05/06 unchanged). Mid-build, the sequence overlay
  // owns the screen and Back must not unwind a running plan generation.
  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (submittingRef.current) return true;
      if (step > 2) { goBack(); return true; }
      return false;
    });
    return () => sub.remove();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, accountCreated]);

  async function handleOAuthOnboarding(provider) {
    // OAuth happens inside the in-app browser sheet, the Supabase session
    // callback is handled by App.js's deep-link handler. We just need to
    // wait for the result, then advance onboarding if successful.
    // VOLYUME-2B: under Fabric the native Apple button can fire onPress twice
    // per tap; the duplicate authorization request always died with Apple
    // error 1000 and logged a sign-in error against every successful sign-in.
    // A ref is synchronous where `busy` state is not, so the duplicate
    // invocation exits before it touches anything.
    if (oauthInFlightRef.current) return;
    oauthInFlightRef.current = true;
    const { logInfo, logError } = require('../lib/errorLog');
    logInfo('ProOnboarding.oauth.begin', `provider=${provider}`);
    setBusy(true);
    try {
      const fn = provider === 'google' ? signInWithGoogle : signInWithApple;
      const result = await fn();
      if (result?.error) {
        logError('ProOnboarding.oauth.providerError', result.error, { provider });
        // FR-2: never show raw provider/SDK error text at the user's very
        // first touchpoint. The real error is already captured above by
        // logError; the user only ever sees one calm fallback sentence
        // (same fix pattern as L01-B35).
        appAlert('Sign-in failed', "That didn't go through. Try again.");
        return;
      }
      if (result?.cancelled) {
        logInfo('ProOnboarding.oauth.cancelled', `provider=${provider}`);
        return;
      }
      // Guideline 4 (App Review, 2026-07-21): Sign in with Apple already
      // provides the user's name via Authentication Services on first sign-in,
      // so pre-fill the first-name field from it rather than requiring the user
      // to re-type information Apple gave us. Only pre-fill an empty field, and
      // only when Apple actually returned a name (null on later sign-ins).
      if (result?.appleGivenName && !firstName.trim()) {
        setFirstName(result.appleGivenName);
      }
      // Founder report (2026-08-19): pre-filling was not enough, because the
      // box was still there. Apple returns fullName ONLY on the very first
      // authorisation for an Apple ID, so signing in again gets
      // appleGivenName === null and lands on a blank "First name" box on the
      // screen straight after the Apple button. The problem is that the app
      // asks at all for something Authentication Services already supplies.
      //
      // So an Apple-authenticated user is never shown the field. Whatever
      // Apple gave is kept and used for the greeting; where Apple gave
      // nothing, the greeting simply carries no name. Nothing is required,
      // nothing is re-asked, and the name stays editable later in Settings ->
      // Profile for anyone who wants to set or change it.
      // (No flag is set for Apple here. The suppression is derived from the
      // session by `appleUser` above, which is already true by the time this
      // runs and stays true on every later mount - see its comment.)
      // The onboarding wizard collects the training fields in the next steps.
      // Mark the auth step complete and advance.
      logInfo('ProOnboarding.oauth.success', `provider=${provider}, advancing to step 2`);
      setProOnboardingAccountCreated(true);
      setAccountCreated(true);
      emitStepDone(1);
      setStep(2);
    } catch (e) {
      logError('ProOnboarding.oauth.threw', e, { provider });
      // EP-18/UI-07: a thrown exception (native-bridge failure, browser-
      // launch failure, malformed config) used to leave the wizard silently
      // returning to idle with no explanation. Show the same calm fallback
      // sentence as the resolved-error branch above (same fix pattern as
      // LoginScreen and ProUpgradeScreen's oauth.threw catches).
      appAlert('Sign-in failed', "That didn't go through. Try again.");
    } finally {
      oauthInFlightRef.current = false;
      setBusy(false);
    }
  }


  // E7.2 activation funnel: a forward advance through the wizard. `n` is the
  // step just completed (1..4). Counts only, no answers. Lazy-required so the
  // test env that mocks the store/telemetry does not pull the supabase client.
  //
  // C5-P38-05 (D96): the emit was unconditional inside each advanceFromN and
  // the wizard allows stepping back from 3 onwards, so any back-and-forward
  // round trip re-fired the step's event and a raw count of
  // "onboarding_step_completed {step: 4}" over-stated how many users had
  // completed step 4. The order's contract for this event is "fires exactly
  // once", so a seen-set makes it once per wizard run. No new event, no new
  // payload field, no catalogue or allow-list change.
  const emittedStepsRef = useRef(new Set());
  function emitStepDone(n) {
    if (!user?.id) return;
    if (emittedStepsRef.current.has(n)) return;
    emittedStepsRef.current.add(n);
    try {
      // eslint-disable-next-line global-require
      const { track } = require('../lib/engineTelemetry');
      track(user.id, 'onboarding_step_completed', { step: n }).catch(() => {});
    } catch (_) { /* tolerate */ }
  }

  // Keyboard (founder defect 2026-09-04, Android walk): the number pad has
  // no Done bar on Android (the iOS-only bar is TextField's A1), the steps'
  // ScrollViews keep taps on controls from blurring the field, and Android
  // does not reliably hide the IME when the focused input unmounts with the
  // step. So the keyboard stayed up across Continue, Back and the
  // selectors until the user closed it by hand. Every transition and every
  // non-text selector on an input step now puts it away first, the way
  // SetEntry does on submit and the Done bar does on iOS.
  function advanceFrom2() {
    Keyboard.dismiss();
    // Biological sex (and every required baseline field) blocks progression
    // until explicitly chosen: no default, no tap-through. The gap is shown
    // on the box itself, not in an alert.
    const errs = validateStep2();
    if (Object.keys(errs).length) {
      surfaceGaps(errs, ['sex', 'age', 'height', 'weight'], 'group2', {
        age: ageRef,
        height: localHeightUnits === 'imperial' ? heightFtRef : heightCmRef,
        weight: localBWUnits === 'st' ? bodyWeightStRef : bodyWeightRef,
      }, setAttempted2);
      return;
    }
    emitStepDone(2);
    setStep(3);
  }

  // L04-6: body composition (body fat % + source) is entirely optional, so
  // this step carries no required-field gate, unlike advanceFrom2. It is its
  // own step purely so the required-details step (2) doesn't also have to
  // carry it, matching the "few fields per step" rule the rest of the wizard
  // follows.
  function advanceFrom3() {
    Keyboard.dismiss();
    emitStepDone(3);
    setStep(4);
  }

  function advanceFrom4() {
    Keyboard.dismiss();
    // Step 4 is logistics only (experience, session length, days, kit). The
    // goal/phase questions live in step 5 so neither step carries more than a
    // handful of fields (the 3-5-per-step rule).
    // daysPerWeek is gated HERE, not defaulted above it. It drives the split,
    // the weekly volume, the calorie target and the whole schedule-fit
    // assessment, so a tap-through would be a guess dressed as an answer.
    const errs = validateStep4();
    if (Object.keys(errs).length) {
      surfaceGaps(errs, ['experience', 'sessionLength', 'days', 'equipment'], 'group4', null, setAttempted4);
      return;
    }
    emitStepDone(4);
    setStep(5);
  }

  // CC28 (section 11.2): the capability step is OPTIONAL and one-tap
  // skippable - no gate, no required field. The full add flow (consent,
  // cards, durability, readback) is the shared Injuries & limitations surface;
  // this step only offers the entry choice, so the two paths cannot
  // drift (section 12: "Add flows = the onboarding cards").
  function advanceFrom5() {
    Keyboard.dismiss();
    emitStepDone(5);
    setStep(6);
  }

  function advanceFrom6() {
    Keyboard.dismiss();
    const errs = validateStep6();
    if (Object.keys(errs).length) {
      surfaceGaps(errs, ['phase'], 'group6', null, setAttempted6);
      return;
    }
    // The "aggressive cuts" goal-lock interstitial was removed from
    // onboarding (founder, 2026-05-29): it fired for anyone picking a
    // competition division even when they were lean-gaining, so the copy
    // was wrong, and the framing doesn't fit a science-led app. Everyone
    // now keeps the standard ED-pattern threshold (the more protective
    // 2-signal setting); the advanced opt-in still lives on the Goal lock
    // screen under Coach for anyone who wants it.
    emitStepDone(6);
    setStep(7);
  }

  // The four honest stage lines, mapped to real _generatePlanInner phases.
  // Stage 2 gains a division-priorities suffix for the physique divisions
  // (it maps to applyGoalOverlay); stage 4 names the user's actual session
  // length, the single highest-leverage word, proving the labels are real.
  function sequenceStages() {
    const divisionLabel = trainingGoal && trainingGoal !== 'general' ? GOAL_LABELS[trainingGoal] : null;
    // NV-3 (ux-world-class-audit-2026-07-09/cohesion-02-novice-psychology.md):
    // "volume" is resistance-training jargon a brand-new user has had zero
    // prior exposure to at this, the single highest-attention beat in
    // onboarding. This is a transient ~800ms animated caption, not a static
    // screen, so it can't carry an InfoTooltip; reworded to the plain
    // mechanism GLOSSARY.volume already uses ("the total work for a muscle").
    // No meaning lost, animation/staging untouched.
    return [
      'Balancing your week',
      // D147: one line each, so the rows keep one height from the start.
      divisionLabel ? `Setting each muscle's work for ${divisionLabel}` : "Setting each muscle's weekly work",
      'Choosing your exercises',
      `Fitting sessions to your ${sessionLengthMinutes} minutes`,
    ];
  }

  function cancelSequenceTimers() {
    stageTimersRef.current.forEach(clearTimeout);
    stageTimersRef.current = [];
  }

  function startSequence() {
    const lines = sequenceStages();
    setSequenceActive(true);
    setSequenceStage(1);
    setPayoff(null);
    setPayoffShown(false);
    stageContentOpacity.setValue(1);
    payoffOpacity.setValue(0);
    sequenceFade.setValue(reduceMotion ? 1 : 0);
    if (!reduceMotion) {
      Animated.timing(sequenceFade, {
        toValue: 1, duration: motion.enter, useNativeDriver: true,
      }).start();
    }
    AccessibilityInfo.announceForAccessibility(lines[0]);
    cancelSequenceTimers();
    const ids = [];
    for (let i = 2; i <= lines.length; i++) {
      ids.push(setTimeout(() => {
        setSequenceStage(i);
        AccessibilityInfo.announceForAccessibility(lines[i - 1]);
      }, STAGE_DWELL_MS * (i - 1)));
    }
    stageTimersRef.current = ids;
  }

  function endSequence() {
    cancelSequenceTimers();
    setSequenceActive(false);
    setSequenceStage(0);
    setPayoff(null);
    setPayoffShown(false);
  }

  // D147: the payoff. Every stage shows its tick, a short pause so the
  // completion registers, then the card's content crossfades in place.
  // Nothing outside the card changes; the card itself keeps its size.
  async function revealPayoff(nextPayoff) {
    cancelSequenceTimers();
    setPayoff(nextPayoff);
    setSequenceStage(sequenceStages().length + 1);
    AccessibilityInfo.announceForAccessibility('Your plan is ready');
    await wait(reduceMotion ? 0 : PAYOFF_HOLD_MS);
    haptics.planReady();
    if (reduceMotion) {
      stageContentOpacity.setValue(0);
      payoffOpacity.setValue(1);
    } else {
      await new Promise((resolve) => {
        Animated.parallel([
          Animated.timing(stageContentOpacity, { toValue: 0, duration: motion.fast, useNativeDriver: true }),
          Animated.timing(payoffOpacity, { toValue: 1, duration: motion.fast, delay: 80, useNativeDriver: true }),
        ]).start(() => resolve());
      });
    }
    setPayoffShown(true);
  }

  async function seePlan() {
    // Land on the plan itself (the Train tab), not Today: the user's one
    // thought at this moment is "show me what you made".
    setPostSetupLanding('PlansTab');
    await completeFirstRun();
  }

  // Tidy the stage timers if the screen unmounts mid-sequence.
  useEffect(() => cancelSequenceTimers, []);

  // The reminder half of finishing setup: the preference blob, the SQLite
  // mirror, the OS permission prompt and the day-0 schedules. Extracted from
  // advanceFrom7 under C5-P27-02 (D96) so it can run BEFORE the build
  // animation; the body and its order are otherwise unchanged.
  async function applyReminderPreferences() {
    // Flat schema: CoachingReminders, WeeklyCheckIn and the Coach tab
    // all read these top-level keys. The coaching loop needs both
    // reminders, so onboarding matches Settings > Coaching reminders:
    // users pick times, not on/off switches.
    //
    // #13: checkinHour is fixed at 18 (not user-picked here, only the
    // day is), matching CoachingRemindersScreen's own picker default
    // (CoachingRemindersScreen.js:177/202). It used to be 12, which
    // sits outside that screen's HOURS_EVENING range [14..21], so a
    // normally-onboarded user opened Coaching reminders and saw no
    // hour chip selected even though the reminder really was scheduled
    // for 12:00 (finding 13).
    //
    // #14: read-merge-write, matching every other writer of this blob
    // (NotificationSettingsScreen, CoachingRemindersScreen). This was
    // previously a wholesale replace; blast radius was low (onboarding
    // is normally the first write to this key) but it was the one
    // non-merging writer of a key several screens share (finding 14).
    let existingPrefs = {};
    try {
      const raw = await AsyncStorage.getItem(NOTIF_PREFS_KEY);
      if (raw) existingPrefs = JSON.parse(raw) ?? {};
    } catch (_) {}
    const prefs = {
      ...existingPrefs,
      morningEnabled: true,
      checkinEnabled: true,
      morningHour,
      morningMinute: 0,
      checkinDay,
      checkinHour: 18,
      checkinMinute: 0,
    };
    // OB-2: the chosen check-in day is a preference, not a notification,
    // so it persists whatever the permission dialog returns. Denying the
    // permission used to silently discard the day picked here, then the
    // check-in gate told the user to come back on the default Sunday.
    // eslint-disable-next-line global-require
    try { require('../lib/sync').notePrefWrite(NOTIF_PREFS_KEY); } catch (_) {} // C6 S-2 (D97-23)
    await AsyncStorage.setItem(NOTIF_PREFS_KEY, JSON.stringify(prefs)).catch(() => {});
    // C5-P28-02 (D96): onboarding wrote ONLY the device-local AsyncStorage
    // blob, never the per-category SQLite rows, and those rows are the only
    // thing the registry push ships to the cloud notification_preferences
    // table. A user who onboarded on their phone and signed in on a tablet
    // saw the Sunday defaults instead of the day they picked. This is the
    // same dual-write CoachingRemindersScreen.applyScheduled already
    // performs, with the same categories and the same time_pref encoding.
    // No schema change, no migration; the dual-family architecture question
    // (FR-C4-2) is untouched and still open.
    try {
      if (user?.id) {
        const morningTime = `${String(morningHour).padStart(2, '0')}:00`;
        const dow = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][checkinDay] ?? 'sun';
        await setPrefRow(user.id, 'morning_weight', { enabled: true, time_pref: morningTime });
        await setPrefRow(user.id, 'weekly_checkin_reminder', {
          enabled: true,
          time_pref: `${dow}_18:00`,
        });
      }
    } catch (_) { /* tolerate; the blob write already succeeded */ }
    const status = await requestNotificationPermissions();
    if (status === 'granted') {
      await scheduleMorningWeightNotification(morningHour, 0);
      await scheduleEveningWeightReminder();
      // Audit finding 2 (2026-07-13): the first check-in unlocks only
      // after FIRST_CHECKIN_MIN_DAYS of data, so the first reminder must
      // never fire before then -- a day-0 schedule could invite a brand
      // new user into a locked "wait a few days" screen.
      await scheduleCheckinReminder(checkinDay, 18, 0, {
        earliestMs: Date.now() + FIRST_CHECKIN_MIN_DAYS * 86400000,
      });
      // OPP-C03: pre-lay the missed check-in follow-up pair for the
      // first check-in cycle (reads the prefs blob just saved; the
      // helper self-guards on tier, toggle and ED flag).
      try {
        // eslint-disable-next-line global-require
        const { scheduleMissedCheckinFollowups } = require('../lib/notifications');
        // eslint-disable-next-line global-require
        const { default: store } = require('../store/useAppStore');
        await scheduleMissedCheckinFollowups(store.getState().user?.id ?? null);
      } catch (_) {}
    }
  }

  /**
   * The exact profile the build will use.
   *
   * Extracted so the schedule-fit assessment and the plan it describes can
   * never be computed from different answers - a fit answer derived from a
   * second, slightly different profile is worse than no fit answer at all.
   */
  function planProfileNow(overrides = {}) {
    return {
      experience,
      daysPerWeek,
      sessionLengthMinutes,
      // F-16 REVISED: 'kettlebells' / 'bands' are ANSWERS, not equipment
      // profiles. Every engine (planEngine.filterPool, swapEngine.rankSwaps)
      // does a bare membership test against the closed six-value profile
      // vocabulary, so an unknown string would empty the pool rather than
      // filter it. Mapped to the profile that keeps the kit's own style pool
      // whole (home_gym for kettlebells, bodyweight for bands).
      equipment: generationEquipmentFor(equipment),
      trainingGoal,
      trainingPhase,
      planWeakPoints,
      recoveryRating,
      ...overrides,
    };
  }

  /**
   * Ask the engine what it would actually build at a given schedule.
   *
   * Read-only: assessScheduleFit runs the pure generator and persists
   * nothing, so this can be called as often as the athlete taps.
   */
  async function runFitAssessment(overrides = {}) {
    if (fitInFlightRef.current) return null;
    fitInFlightRef.current = true;
    setFitBusy(true);
    try {
      const fit = await assessScheduleFit(planProfileNow(overrides), {
        userId: user?.id ?? null,
        durationOptions: SESSION_LENGTH_OPTIONS.map(o => o.value),
        dayOptions: DAYS_PER_WEEK_OPTIONS,
      });
      return fit?.ok ? fit : null;
    } catch (e) {
      // A fit answer is guidance. If it cannot be computed, setup continues
      // exactly as it did before this existed rather than blocking the build.
      // eslint-disable-next-line global-require
      try { require('../lib/errorLog').logError('ProOnboarding.assessScheduleFit', e, { userId: user?.id }); } catch (_) {}
      return null;
    } finally {
      fitInFlightRef.current = false;
      setFitBusy(false);
    }
  }

  /**
   * Resume the build after the athlete has answered the fit panel.
   *
   * Via an effect rather than a direct call, because choosing an alternative
   * sets the day count and the session length first; calling straight back
   * into the build would read the previous render's values and build the plan
   * they just chose to move away from.
   */
  useEffect(() => {
    if (!fitResumeRef.current || !fitAccepted || fitReview) return;
    fitResumeRef.current = false;
    advanceFrom7();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitAccepted, fitReview, daysPerWeek, sessionLengthMinutes]);

  /**
   * Try a different session length from the fit panel and show what the
   * engine says about it. The athlete's pick is honoured whatever the label
   * says - "Too tight" is information, not a refusal.
   */
  async function chooseDuration(minutes) {
    if (!minutes || minutes === fitReview?.sessionLengthMinutes) return;
    setSessionLengthMinutes(minutes);
    const fit = await runFitAssessment({ sessionLengthMinutes: minutes });
    if (fit) setFitReview(fit);
  }

  /** Take the athlete's answer to the fit panel and carry on. */
  function acceptFit(alternative) {
    if (alternative) {
      setDaysPerWeek(alternative.daysPerWeek);
      setSessionLengthMinutes(alternative.sessionLengthMinutes);
    }
    setFitReview(null);
    setFitAccepted(true);
    fitResumeRef.current = true;
  }

  async function advanceFrom7() {
    Keyboard.dismiss();
    const errs7 = validateStep7();
    if (Object.keys(errs7).length) {
      surfaceGaps(errs7, ['recovery'], 'group7', null, setAttempted7);
      return;
    }
    // Schedule fit, checked ONCE, with every answer in hand. A schedule that
    // carries the plan is never interrupted; one that does not gets the
    // athlete a real choice instead of a silently shortened plan or a
    // 45-minute session that runs to 70.
    // F-16 REVISED: a kettlebell or band answer installs a hand-authored
    // library plan, so there is no generated plan for the fit resolver to
    // describe. Running it here would interrupt the athlete with a verdict
    // about a plan they are never going to receive.
    if (!fitAccepted && !libraryKitForEquipment(equipment)) {
      if (fitInFlightRef.current) return;
      const fit = await runFitAssessment();
      if (fit && (fit.state === PLAN_FIT.INSUFFICIENT_FOR_VALID_PLAN
        || fit.state === PLAN_FIT.VALID_TIME_CONSTRAINED)) {
        setFitReview(fit);
        return;
      }
      setFitAccepted(true);
    }
    if (submittingRef.current) return;
    submittingRef.current = true;
    // RB-12 (D96, Review B): from this line hardware Back is swallowed, but
    // no busy state rendered until startSequence, so a slow permission
    // dialog left an idle-looking, Back-dead step 6. The spinner now shows
    // for the whole guarded window (the sequence overlay covers it later).
    setBusy(true);
    // RB-9 (D96, Review B): a draft save debounced within the last 600ms
    // would otherwise fire mid-build and re-save a step-6 draft, racing the
    // clearDraft below. The guard in the save effect reads this ref at
    // effect-run time only, so kill the pending timer at the source.
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);

    // C5-P27-02 (D96): the reminder preferences and the OS permission dialog
    // are settled BEFORE the build animation starts. They used to run after
    // startSequence(), so the system dialog appeared over a running
    // "Building your first plan" overlay whose stage timers kept advancing
    // behind it. Nothing about what is written or scheduled changes, and the
    // OB-2 order inside the block (preference first, prompt second) is
    // preserved. Wrapped in its own try so a permission throw cannot skip
    // the build below, exactly as the surrounding try did before.
    try {
      await applyReminderPreferences();
    } catch (_) { /* reminders are best-effort; setup continues */ }

    // D147: the staged card runs for everyone; under Reduce Motion every
    // transition inside it is instant. The real work below is identical.
    const useSequence = true;
    const startedAt = Date.now();
    if (useSequence) startSequence();

    let planFailed = false;
    // D147: the id of the plan this run wrote (or reused), for the payoff.
    let builtPlanId = null;
    // C5-P29-07 (D96): what an interrupted earlier run of this same build
    // already wrote. Null on a first run and on any storage failure, in which
    // case every write below runs exactly as it always did.
    const priorBuild = user?.id ? await loadBuildProgress(user.id) : null;
    try {
      if (setUnits) setUnits(localUnits);
      if (setBodyWeightUnits) setBodyWeightUnits(localBWUnits);

      const bwKg = localBWUnits === 'st'
        ? stoneLbsToKg(bodyWeightSt, bodyWeightStLbs)
        : parseBodyWeightToKg(bodyWeight, localBWUnits);
      const hcm = localHeightUnits === 'imperial'
        ? (!isNaN(parseInt(heightFt, 10)) ? ftInToCm(heightFt, heightIn) : null)
        : (parseDecimalInput(heightCm) || null);
      const ageNum = parseInt(age, 10) || null;

      if (!ACCEPTED_SEX_VALUES.includes(sex) || !Number.isFinite(bwKg) || bwKg <= 0 || !isValidHeightCm(hcm) || !ageNum || ageNum < 13 || ageNum > 100) {
        endSequence();
        setBusy(false);
        submittingRef.current = false;
        setAttempted2(true);
        setStep(2);
        appAlert(
          'Baseline needs checking',
          'Please confirm your sex, body weight, height and age again. Volyume will not build targets from fallback body data.',
        );
        return;
      }

      const safeWeightKg = bwKg;
      // ONBOARD-001: height is gated in step 2 (advanceFrom2 + canContinue both
      // require a realistic height), so hcm is the user's confirmed entry here.
      // No 175cm fallback, a silent default would feed BMR / calorie / FFM as if
      // the user had provided it. The nutrition engine keeps its own finite-guard
      // (safeHeight clamp) for the unreachable corrupt-draft edge; the screen
      // never fabricates a plausible height that reads as user data.
      const safeHeightCm = hcm;
      const safeAge = ageNum;
      // Parse body fat as a low-confidence baseline unless it came from a
      // measured source. It can shape the first plan, but measured-only safety
      // floors still live inside nutritionEngine.
      const bfParsed = parseDecimalInput(bodyFat);
      const bfNum = bodyFat.trim() && Number.isFinite(bfParsed) && bfParsed > 0 && bfParsed < 60 ? bfParsed : null;
      const baselineBfSource = bfNum != null ? normaliseBodyFatSource(bfSource) : null;
      // Build inputs through the shared builder so onboarding and Update Your
      // Plan can never feed the engine different shapes (the bug that made the
      // two flows disagree). Same values as before, so onboarding output is
      // unchanged.
      const nutritionInputs = buildNutritionEngineInputs({
        sex,
        age: safeAge,
        heightCm: safeHeightCm,
        weightKg: safeWeightKg,
        bodyFatPct: bfNum,
        bodyFatSource: baselineBfSource,
        daysPerWeek,
        trainingPhase,
        trainingGoal,
        proteinApproach,
        experience,
      });
      let nutritionTargets = calculateNutritionTargets(nutritionInputs);

      const goalPhase = phaseToCoachingKey(trainingPhase);
      const trainingFreqBucket = daysToFreqBucket(daysPerWeek);

      // weeklyCoach.js reads `goalStartDate` to time diet-break suggestions
      // when the user is in a cut. Set it here if onboarding lands them in
      // a deficit; otherwise leave it null so the bulk/maintain path isn't
      // misinterpreted as a long-running cut.
      const isDeficit = trainingPhase === 'cut';
      const merged = {
        ...(userProfile || {}),
        units: localUnits,
        bodyWeightUnits: localBWUnits,
        sex,
        age: safeAge,
        heightCm: safeHeightCm,
        weightKg: safeWeightKg,
        trainingGoal,
        trainingPhase,
        goalPhase,
        phaseStartedAt: Date.now(),
        goalStartDate: isDeficit ? new Date().toISOString() : null,
        trainingFreq: trainingFreqBucket,
        trainingFreqBucket,
        daysPerWeek,
        experience,
        sessionLengthMinutes,
        // F-16 REVISED: stored as an equipment PROFILE, never as the raw
        // 'kettlebells'/'bands' answer - see planProfileNow above for why.
        equipment: generationEquipmentFor(equipment),
        recoveryRating,
        planWeakPoints,
        proteinApproach,
        // Persist body composition so later recalcs (Update Your Plan, manual
        // Nutrition Targets) read the same BF% + method onboarding used.
        bodyFatPct: bfNum,
        bodyFatSource: baselineBfSource,
        // Store the nutrition goal key alongside the phase so surfaces that read
        // userProfile.goal (Nutrition Targets summary) show the right phase
        // instead of defaulting to lean_gain.
        goal: phaseToNutritionKey(trainingPhase),
      };
      // RA-4 (D96, Review A): the name is optional now (presentation only,
      // no engine reads it - the same rationale C5-P1-09 recorded for the
      // free path). An empty field leaves any stored name intact rather
      // than writing a blank over it.
      if (firstName.trim()) merged.firstName = firstName.trim();

      if (user?.id) await saveLocalProfile(user.id, merged);

      // (Health Connect / Apple Health connect-on-enrolment was removed with the
      // step-target feature, founder 2026-06-30.)

      // C5-P29-07: the enrolment body-metric row is INSERT-only (unlike the
      // profile and targets upserts beside it), so a retry after a mid-build
      // kill used to leave two rows for one enrolment. It is written once per
      // build; the weight itself still reaches the profile and the morning
      // series (which dedups by local day) on every run.
      if (user?.id && !isNaN(bwKg) && bwKg > 0) {
        // RB-7 (D96, Review B): a mid-build kill, a step back to change the
        // weight, and a resubmit used to keep the FIRST weight in the
        // enrolment row forever while the profile and morning series carried
        // the new one. The record stores the weight it logged, so an edited
        // weight re-logs and the enrolment row agrees with its siblings.
        // D153 follow-up (2026-09-06): the MARKED morning-weight write goes
        // FIRST. logBodyMetric below writes through to the same day's row
        // (preserving notes), and each write fires its own cloud push; with
        // the marker set before the write-through, both pushes carry it and
        // the order they land in cannot change what the row means.
        // Also seed the morning weights series so the weekly check-in
        // gate (needs 3 readings in the last 7 days) counts enrolment
        // day. Without this, a user who enrols on their chosen check-in
        // day and tries to check in is told "0 readings this week" even
        // though they just typed a weight two screens ago.
        //
        // C5-P22-01 (D96): the row is MARKED as the enrolment starting
        // point rather than passing as a morning the user weighed. It is a
        // figure typed from memory, possibly in the evening, possibly
        // clothed, so surfaces that speak about the user's own weigh-in
        // behaviour (Home's "Logged" tick, the check-in's "not yet today")
        // read the marker and treat today as un-weighed. What counts toward
        // the check-in gate is deliberately unchanged: tightening that gate
        // would be a worse defect than the disclosure gap. A real weigh-in
        // on the same day overwrites this row (logMorningWeight upserts per
        // local day) and clears the marker with it.
        await logMorningWeight(user.id, {
          weightKg: bwKg,
          loggedAt: Date.now(),
          notes: ENROLMENT_WEIGHT_NOTE,
        }).catch((e) => {
          // eslint-disable-next-line global-require
          try { require('../lib/errorLog').logError('ProOnboarding.logMorningWeight', e, { uid: user?.id }); } catch (_) {}
        });
        if (!priorBuild?.weightLoggedAt || (Number.isFinite(priorBuild?.weightKg) && priorBuild.weightKg !== bwKg)) {
          await logBodyMetric(user.id, {
            weightKg: bwKg,
            bodyFatPercent: bfNum,
            bodyFatSource: baselineBfSource,
            loggedAt: Date.now(),
          });
          await markBuildProgress(user.id, { weightLoggedAt: Date.now(), weightKg: bwKg });
        }
      }

      if (user?.id && (sex || hcm || ageNum)) {
        await saveUserBodyProfile(user.id, {
          sex,
          heightCm: hcm,
          dateOfBirth: dateOfBirthFromAgeYears(ageNum),
          primaryGoal: trainingGoal,
        }).catch((e) => {
          // eslint-disable-next-line global-require
          try { require('../lib/errorLog').logError('ProOnboarding.saveUserBodyProfile', e, { uid: user?.id }); } catch (_) {}
        });
      }

      let maintenanceAuthority = null;
      if (user?.id) {
        // First enrolment is a cold formula start. Re-onboarding, interrupted
        // restore and resumed setup may already have a valid learned memo, so
        // they must enter the same resolver as every later target regeneration.
        maintenanceAuthority = await resolveEffectiveMaintenanceForUser(user.id, {
          ...nutritionInputs,
          dateOfBirth: dateOfBirthFromAgeYears(ageNum),
        });
        nutritionTargets = calculateNutritionTargets({
          ...nutritionInputs,
          effectiveMaintenanceResidualKcal: maintenanceAuthority.resolved.appliedResidualKcal,
        });
      }

      const nutritionData = {
        ...nutritionTargets,
        maintenanceAuthority: maintenanceAuthority?.resolved ?? null,
      };
      // FF-005: the AsyncStorage copy is what other screens read; the DB save is
      // now awaited (not fire-and-forget) so a failure is logged rather than
      // silently dropped. Targets stay usable from AsyncStorage and sync retries
      // the cloud write, so onboarding still completes (founder decision
      // 2026-06-08: complete + retry from Home).
      await AsyncStorage.setItem('@volyume_nutrition_targets', JSON.stringify(nutritionData)).catch((e) => {
        // eslint-disable-next-line global-require
        try { require('../lib/errorLog').logError('ProOnboarding.nutritionTargetsAsyncStorage', e, { uid: user?.id }); } catch (_) {}
      });
      if (user?.id) {
        try {
          await saveNutritionTargets(user.id, nutritionData);
        } catch (e) {
          // eslint-disable-next-line global-require
          try { require('../lib/errorLog').logError('ProOnboardingScreen.saveNutritionTargets', e, { userId: user.id }); } catch (_) {}
        }
      }

      // Auto-generate the training plan so the user lands on a ready-to-train
      // home screen rather than a "build me a plan" empty state.
      if (user?.id) {
        const planProfile = planProfileNow();
        // F-16 REVISED point 1: 'Kettlebells' and 'Bands' never reach the
        // generator. Non-null here means this build installs a LIBRARY plan
        // instead, through the Plan Library's own copy + activate path.
        const libraryKit = libraryKitForEquipment(equipment);
        let planResult = { ok: false, error: 'not attempted' };
        // C5-P29-07: a retry after a kill used to build a SECOND plan, which
        // archived the first and took the "Your plan 2" name. If the earlier
        // run already built a plan from these exact answers, that plan IS the
        // result of this build, so it is adopted rather than rebuilt. Edited
        // answers produce a different signature and generate as before.
        const planSignature = JSON.stringify([
          experience, daysPerWeek, sessionLengthMinutes, equipment,
          trainingGoal, trainingPhase, planWeakPoints, recoveryRating,
        ]);
        const reusablePlanId = priorBuild?.planId && priorBuild.planSignature === planSignature
          ? priorBuild.planId
          : null;
        const priorPlan = reusablePlanId
          ? await getProgrammeById(reusablePlanId).catch(() => null)
          : null;
        // Reused only while it is still the one active, unarchived plan the
        // earlier run left behind. Anything else regenerates, so first-run
        // always ends on exactly one valid active plan and block.
        if (priorPlan && priorPlan.isActive && !priorPlan.isArchived) {
          planResult = { ok: true, programmeId: priorPlan.id, planName: priorPlan.name ?? null };
        } else if (libraryKit) {
          // F-16 REVISED: the honest route for a kit the generator cannot
          // build. copyPlanFromLibrary + activatePlanWithBlock, so the
          // athlete lands on an active plan AND a running block exactly as
          // a generated plan would leave them.
          planResult = await installLibraryPlanForKit(user.id, {
            kit: libraryKit,
            daysPerWeek,
            experience,
          });
          if (planResult.ok && planResult.programmeId) {
            await markBuildProgress(user.id, { planId: planResult.programmeId, planSignature });
          }
        } else {
          // CC27 (section 9.6): capability pre-flight before the first
          // generation. A hold falls into the existing plan-recovery path
          // (HomeScreen CTA) rather than blocking onboarding completion.
          const preflight = await capabilityPreflight(user.id);
          const goAhead = preflight.proceed || await new Promise((resolve) => {
            offerCapabilityPreflightChoice({
              onHold: () => resolve(false),
              onContinue: () => resolve(true),
            });
          });
          if (goAhead) {
            try { planResult = await generateAndSavePlan(user.id, planProfile); }
            catch (e) { planResult = { ok: false, error: e?.message ?? 'unknown' }; }
          } else {
            planResult = { ok: false, error: 'capability_preflight_hold' };
          }
          if (planResult.ok && planResult.programmeId) {
            await markBuildProgress(user.id, { planId: planResult.programmeId, planSignature });
          }
        }
        if (planResult.ok && planResult.programmeId) builtPlanId = planResult.programmeId;
        if (!planResult.ok) {
          // eslint-disable-next-line global-require
          try { require('../lib/errorLog').logError('ProOnboardingScreen.generateAndSavePlan', planResult.error, { userId: user.id }); } catch (_) {}
          // COMP-013: a failed generation must abort the sequence, three
          // seconds of "building" followed by "didn't generate" is worse than
          // a bare spinner. Flag it; the post-try block falls back to the form
          // with this alert and never plays a completion tick.
          planFailed = true;
          // D112 R5 (closes audit T1-13): a TOTAL capability block is a
          // state, not an engine failure, so it gets its own honest graded
          // alert instead of the generic retry-loop copy below. Gated on
          // blockedByCapability specifically - a total block caused purely
          // by the user's own set-aside exercises (preference lane, not
          // capability) still reads as the plain generic failure, unchanged.
          if (libraryKit) {
            // The generic copy below points at "Start with a plan", which
            // GENERATES. That is the wrong instruction for this kit, so the
            // retry route named here is the library the plan came from.
            appAlert(
              "Plan setup didn't finish",
              `Your profile is saved, but your plan was not added. Open Plans from the Train tab, browse the plan library and choose a ${libraryKit === 'kettlebell' ? 'kettlebell' : 'band'} plan.`,
            );
          } else if (planResult.error === 'plan_blocked_by_exclusions' && planResult.blockedByCapability) {
            appAlert(
              'Volyume could not build a full plan within your limitations.',
              "Your profile and targets are saved. Every session needed at least one movement that clashes with an injury or limitation you've set right now.",
              [
                { text: 'Open Injuries & limitations', onPress: () => navigation.navigate('HowYouTrain') },
                // First run has no plan library route from this screen
                // (AUDIT-A precedent, FreeStarterScreen's own fromFirstRun
                // branch): a plain hold instead of a browse action that
                // would silently do nothing. Round 11 (C1): 'Not now' is
                // the capability lane's decline word and this dismiss
                // writes nothing - 'Got it' is the codebase's own word
                // for acknowledging an informational alert.
                { text: 'Got it', style: 'cancel' },
                {
                  text: 'Try again',
                  onPress: async () => {
                    try {
                      const retryPreflight = await capabilityPreflight(user.id);
                      const retryGoAhead = retryPreflight.proceed || await new Promise((resolve) => {
                        offerCapabilityPreflightChoice({
                          onHold: () => resolve(false),
                          onContinue: () => resolve(true),
                        });
                      });
                      if (!retryGoAhead) return;
                      const retryResult = await generateAndSavePlan(user.id, planProfile);
                      if (retryResult.ok) {
                        if (retryResult.programmeId) {
                          await markBuildProgress(user.id, { planId: retryResult.programmeId, planSignature });
                        }
                        appAlert('Plan ready', 'Your training plan is ready. Open Today to see it.');
                      } else {
                        // eslint-disable-next-line global-require
                        try { require('../lib/errorLog').logError('ProOnboardingScreen.generateAndSavePlan.retry', retryResult.error, { userId: user.id }); } catch (_) {} // logging must never break the retry
                        appAlert(
                          'Plan setup didn\'t finish',
                          'Your profile is saved, but your training plan did not generate. Open Today and choose "Start with a plan" to retry.',
                        );
                      }
                    } catch (e) {
                      // eslint-disable-next-line global-require
                      try { require('../lib/errorLog').logError('ProOnboardingScreen.generateAndSavePlan.retry', e, { userId: user.id }); } catch (_) {} // logging must never break the retry
                    }
                  },
                },
              ],
            );
          } else {
            // D88: the caught error is logged just above, never shown. It was
            // being interpolated raw into this alert, so the last thing a new
            // user saw at the end of setup could be a JS or database error.
            appAlert(
              'Plan setup didn\'t finish',
              'Your profile is saved, but your training plan did not generate. Open Today and choose "Start with a plan" to retry.',
            );
          }
        } else if (libraryKit) {
          // F-16 REVISED: ONE line, and it never claims the plan was
          // generated for them. `partial` / capability shortfall notes below
          // describe generation and cannot apply to a hand-authored plan.
          appAlert('Plan ready', libraryKitInstalledLine(libraryKit, planResult.planName));
        } else {
          if (planResult.partial) {
            // FF-003: the plan generated but couldn't fulfil every requested
            // move (typically constrained equipment). Tell the user plainly.
            appAlert('Plan ready', planShortfallNote(planResult.missedCount));
          }
          // D112 R5 (closes audit T1-12): every generation entry reveals
          // capability effects. Independent of the `partial` (equipment)
          // alert above - the two reason classes never conflate, matching
          // PlanUpdateScreen's dry-run preview, which shows both separately
          // when both apply.
          if (planResult.capabilityBlockedCount > 0) {
            appAlert('Plan ready', capabilityBlockedNote(planResult.capabilityBlockedCount));
          }
        }
      }
    } catch (e) {
      // D88: never surface a raw exception message (the FR-2/EP-18 pattern
      // this catch-all had missed). It is logged instead, so the diagnostic
      // is not lost now that it no longer reaches the user.
      // eslint-disable-next-line global-require
      try { require('../lib/errorLog').logError('ProOnboardingScreen.finish', e, { userId: user?.id }); } catch (_) {}
      appAlert('Something went wrong', 'We could not finish setting up your account. Check your connection and try again.');
      endSequence();
      setBusy(false);
      submittingRef.current = false;
      return;
    }

    // Plan generation failed, but the profile + targets are saved. Abort the
    // sequence's celebratory hold instantly (no min-display pad, no completion
    // tick) and still go to the completion screen, which handles the no-plan
    // state and whose alert ("Open Today and choose Start with a plan") then reads
    // correctly. Stranding the user on the step-5 form would not.
    // OB-3: the wizard is complete either way from here, so drop the resume
    // draft (and any queued save) before leaving the screen.
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    if (user?.id) clearDraft(user.id).catch(() => {});

    if (planFailed) {
      cancelSequenceTimers();
      setBusy(false);
      submittingRef.current = false;
      navigation.replace('ProSetupComplete');
      return;
    }

    // Success: hold the sequence on its final stage until the minimum display
    // time has elapsed, so the real work (which may finish faster) never makes
    // the sequence complete before the named labour reads as real.
    if (useSequence) {
      const elapsed = Date.now() - startedAt;
      if (elapsed < SEQUENCE_TOTAL_MS) await wait(SEQUENCE_TOTAL_MS - elapsed);
    }
    // D147: the payoff is drawn from the plan that was actually written,
    // never from the wizard's guess at it. Anything unreadable is left out
    // rather than invented.
    let programme = null;
    try {
      if (builtPlanId) programme = await getProgrammeById(builtPlanId);
    } catch (_) { programme = null; }
    const splitName = programme?.splitType ? (SPLIT_LABELS[programme.splitType] ?? null) : null;
    setBusy(false);
    await revealPayoff({
      goalLabel: GOAL_LABELS[trainingGoal] ?? null,
      phaseLabel: PHASE_LABELS[trainingPhase] ?? null,
      splitName,
      days: Number.isFinite(daysPerWeek) ? daysPerWeek : null,
      buildWeeks: BLOCK_PLANNED_WEEKS - 1,
    });
  }

  // ── Step 1, Create account ──────────────────────────────────────────────────

  if (step === 1) {
    return (
      <SafeAreaView key="step-1" style={[styles.safe, live.safe]}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'none'}>
            <ProOnboardingHeader
              step={step}
              title="Set up your account safely"
              sub="Sign in once so your plan, weight history and coaching updates can be restored if you change device."
            />

            <QuestionGroup
              icon="person-circle-outline"
              title="Your account"
              sub="This keeps your plan and coaching history tied to you. The training setup comes next."
            >
              {/* OAuth only (Apple on iOS, Google on Android). The email +
                  password path was removed (founder 2026-07-01); OAuth needs no
                  verification round-trip and either creates the account or signs
                  into the existing one. handleOAuthOnboarding advances to step 2
                  on success. */}
              <OAuthButtons
                onApple={() => handleOAuthOnboarding('apple')}
                onGoogle={() => handleOAuthOnboarding('google')}
                disabled={busy}
              />

              {busy ? (
                <View style={styles.oauthBusy}>
                  <ActivityIndicator color={t.colors.primary} />
                </View>
              ) : null}
            </QuestionGroup>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── Step 2, Profile ─────────────────────────────────────────────────────────

  if (step === 2) {
    // D146: the step never greys Continue out. Every required field is
    // validated by validateStep2 (biological sex first: an explicit
    // male/female choice, a null never progresses and is never defaulted
    // downstream), and after the first attempt the gaps are shown on the
    // boxes themselves.
    const errors2 = attempted2 ? validateStep2() : {};
    const needed2 = stillNeeded(errors2, ['sex', 'age', 'height', 'weight'], STEP2_LABELS);
    return (
      <SafeAreaView key="step-2" style={[styles.safe, live.safe]}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'none'}>
            <ProOnboardingHeader
              step={step}
              title="Set your starting baseline"
              sub="These details let the app set a safe starting baseline without guessing."
            />

            {/* C5-P36-01 (D96): every wizard step stated its purpose twice
                before the first field - a header title and sub, then a group
                title and sub saying the same thing five lines later. The
                header sub is kept as the single carrier. RA-7 (Review A)
                then dropped this group's TITLE too: step 2 has exactly one
                group, so "Required details" grouped nothing, restated the
                header a third time, and (after RA-4) sat above a field that
                is not required. The icon keeps the visual grouping; steps
                with real multi-group structure keep their titles. No field,
                gate, validation or safety hint is removed anywhere. */}
            <View onLayout={markY('group2')}>
            <QuestionGroup icon="person-outline">
              {/* An Apple-authenticated athlete is not asked for a name.
                  Authentication Services supplied it at the button, half a
                  second before this screen, and this is the screen directly
                  after - which is what App Review rejected the app for. No
                  condition: see hideNameField's declaration for why gating on
                  "did a name arrive" put the box straight back. Every other
                  sign-in route is untouched, and anyone can set or change a
                  name later in Settings -> Profile. */}
              {hideNameField ? null : (
              <View style={styles.section}>
                {/* RA-4 (D96, Review A): the one field in the block with no
                    stated reason, because there is none an engine could
                    give - so it is optional and says what it is for. */}
                <Text style={[styles.fieldLabel, live.fieldLabel]}>First name (optional)</Text>
                <Text style={[styles.fieldHint, live.fieldHint]}>Only used to greet you.</Text>
                <TextField accessibilityLabel="First name, optional"
                  ref={nameRef}
                  value={firstName}
                  onChangeText={setFirstName}
                  placeholder="Your name"
                  autoCapitalize="words"
                  autoCorrect={false}
                  autoComplete="off"
                  textContentType="none"
                  returnKeyType="next"
                  onSubmitEditing={() => ageRef.current?.focus()}
                  blurOnSubmit={false}
                />
              </View>
              )}

              <View style={styles.section} onLayout={markY('sex')}>
                <Text style={[styles.fieldLabel, live.fieldLabel]}>Biological sex</Text>
                <Text style={[styles.fieldHint, live.fieldHint]}>Used by the calorie formula and safety floors. This stays private.</Text>
                <SegmentedControl
                  options={SEX_OPTIONS}
                  value={sex}
                  onChange={(v) => { Keyboard.dismiss(); setSex(v); }}
                  accessibilityLabel="Biological sex"
                  error={!!errors2.sex}
                />
                <FieldError message={errors2.sex} />
              </View>

              <View style={styles.section} onLayout={markY('age')}>
                <Text style={[styles.fieldLabel, live.fieldLabel]}>Age</Text>
                <Text style={[styles.fieldHint, live.fieldHint]}>Used with your height and weight to set your calorie targets.</Text>
                <TextField accessibilityLabel="Age"
                  ref={ageRef}
                  value={age}
                  onChangeText={setAge}
                  placeholder="e.g. 28"
                  keyboardType="number-pad"
                  maxLength={3}
                  autoComplete="off"
                  textContentType="none"
                  error={errors2.age}
                />
              </View>

              <View style={styles.section} onLayout={markY('height')}>
                <Text style={[styles.fieldLabel, live.fieldLabel]}>Height</Text>
                <Text style={[styles.fieldHint, live.fieldHint]}>Used with your weight and age to set your calorie targets.</Text>
                {/* The unit picker is the same control as the weight one
                    below, so the two read as one family (D146). */}
                <SegmentedControl
                  options={[{ label: 'ft + in', value: 'imperial' }, { label: 'cm', value: 'metric' }]}
                  value={localHeightUnits}
                  onChange={(v) => { Keyboard.dismiss(); setLocalHeightUnits(v); }}
                  accessibilityLabel="Height units"
                />
                {localHeightUnits === 'imperial' ? (
                  <View style={styles.pairRow}>
                    <View style={styles.pairHalf}>
                      <TextField accessibilityLabel="Height feet"
                        ref={heightFtRef}
                        value={heightFt}
                        onChangeText={setHeightFt}
                        placeholder="5 ft"
                        keyboardType="number-pad"
                        maxLength={1}
                        autoComplete="off"
                        textContentType="none"
                        onAccessoryNext={() => heightInchesRef.current?.focus()}
                        error={errors2.height ? ' ' : undefined}
                      />
                    </View>
                    <View style={styles.pairHalf}>
                      <TextField accessibilityLabel="Height inches"
                        ref={heightInchesRef}
                        value={heightIn}
                        onChangeText={setHeightIn}
                        placeholder="9 in"
                        keyboardType="number-pad"
                        maxLength={2}
                        autoComplete="off"
                        textContentType="none"
                        error={errors2.height ? ' ' : undefined}
                      />
                    </View>
                  </View>
                ) : (
                  <View style={styles.pairRow}>
                    <TextField accessibilityLabel="Height in centimetres"
                      ref={heightCmRef}
                      containerStyle={styles.pairFull}
                      value={heightCm}
                      onChangeText={setHeightCm}
                      placeholder="e.g. 178 cm"
                      keyboardType="decimal-pad"
                      autoComplete="off"
                      textContentType="none"
                      error={errors2.height ? ' ' : undefined}
                    />
                  </View>
                )}
                <FieldError message={errors2.height} />
              </View>

              <View style={styles.sectionLast} onLayout={markY('weight')}>
                <Text style={[styles.fieldLabel, live.fieldLabel]}>Current body weight</Text>
                <Text style={[styles.fieldHint, live.fieldHint]}>
                  This sets your starting trend and first calorie target. Update it from Today once setup is complete.
                </Text>
                <SegmentedControl
                  options={[
                    { label: 'Stone+lbs', value: 'st' },
                    { label: 'kg', value: 'kg' },
                    { label: 'lbs', value: 'lbs' },
                  ]}
                  value={localBWUnits}
                  onChange={(v) => { Keyboard.dismiss(); setLocalBWUnits(v); }}
                  accessibilityLabel="Body weight units"
                />
                {localBWUnits === 'st' ? (
                  <View style={styles.pairRow}>
                    <View style={styles.pairHalf}>
                      <TextField accessibilityLabel="Current body weight in stones"
                        ref={bodyWeightStRef}
                        value={bodyWeightSt}
                        onChangeText={setBodyWeightSt}
                        placeholder="e.g. 12 st"
                        keyboardType="number-pad"
                        maxLength={3}
                        autoComplete="off"
                        textContentType="none"
                        onAccessoryNext={() => bodyWeightLbsRef.current?.focus()}
                        error={errors2.weight ? ' ' : undefined}
                      />
                    </View>
                    <View style={styles.pairHalf}>
                      <TextField accessibilityLabel="Current body weight remaining pounds"
                        ref={bodyWeightLbsRef}
                        value={bodyWeightStLbs}
                        onChangeText={setBodyWeightStLbs}
                        placeholder="e.g. 0 lbs"
                        keyboardType="decimal-pad"
                        maxLength={4}
                        autoComplete="off"
                        textContentType="none"
                        error={errors2.weight ? ' ' : undefined}
                      />
                    </View>
                  </View>
                ) : (
                  <View style={styles.pairRow}>
                    <TextField accessibilityLabel={`Current body weight in ${localBWUnits}`}
                      ref={bodyWeightRef}
                      containerStyle={styles.pairFull}
                      value={bodyWeight}
                      onChangeText={setBodyWeight}
                      placeholder={localBWUnits === 'kg' ? 'e.g. 80 kg' : 'e.g. 176 lbs'}
                      keyboardType="decimal-pad"
                      autoComplete="off"
                      textContentType="none"
                      error={errors2.weight ? ' ' : undefined}
                    />
                  </View>
                )}
                <FieldError message={errors2.weight} />
              </View>
            </QuestionGroup>
            </View>

            {needed2 ? (
              <Text style={[styles.continueHint, live.continueHint]}>{needed2}</Text>
            ) : null}

            <Button
              title="Continue"
              trailingIcon="arrow-forward"
              style={styles.primaryBtn}
              onPress={advanceFrom2}
              textStyle={[styles.primaryBtnText, live.primaryBtnText]}
              accessibilityLabel="Continue"
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── Step 3, Starting body composition ───────────────────────────────────────
  // L04-6: split out of the old Step 2, which bundled this alongside the five
  // required-details fields (up to 7 fields on one scroll). Body fat is
  // optional, so this step carries no required-field gate (matches the old
  // behaviour, where these fields never featured in canContinue).

  if (step === 3) {
    return (
      <SafeAreaView key="step-3" style={[styles.safe, live.safe]}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'none'}>
            <ProOnboardingHeader
              step={step}
              title="Add your starting body composition"
              sub="An honest estimate sharpens your first plan. Skip this if you are not sure."
              onBack={goBack}
            />

            <QuestionGroup
              icon="analytics-outline"
              // C5-P36-01 + C5-P36-03 (D96): this sub said the same thing as
              // the header sub five lines above it ("An honest estimate
              // sharpens your first plan"), and then advertised two features
              // the user has not reached, cannot open from here and does not
              // need in order to answer an optional body-fat field - exactly
              // the onboarding-as-advertising the order names as a non-goal,
              // taught weeks before it is relevant, and carrying none of the
              // careful framing the Volyume Score's own surfaces use. Both
              // sentences are deleted; the header sub and the field hint
              // below already answer the screen's question honestly.
              // RC-7 (D96, Review C): the title too - the step has exactly
              // one group, so it grouped nothing and restated the header.
            >
              <View style={styles.sectionLast}>
                <Text style={[styles.fieldLabel, live.fieldLabel]}>Body fat estimate % (optional)</Text>
                <Text style={[styles.fieldHint, live.fieldHint]}>
                  Enter your best current estimate or a measured value. Leave it blank only if you genuinely do not know.
                </Text>
                <TextField
                  value={bodyFat}
                  onChangeText={setBodyFat}
                  placeholder="e.g. 15"
                  placeholderTextColor={t.colors.textDisabled}
                  keyboardType="decimal-pad"
                  maxLength={4}
                  autoComplete="off"
                  textContentType="none"
                  accessibilityLabel="Starting body fat estimate percentage, optional"
                />
                {bodyFat.trim() ? (
                  <View style={{ marginTop: spacing.sm }}>
                    {/* U-E-1: gloss the body fat method abbreviations (BIA/Caliper/DEXA). */}
                    <View style={[styles.measuredRow, live.measuredRow]}>
                      <Text style={[styles.fieldHint, live.fieldHint]}>Estimate source</Text>
                      <InfoTooltip text={GLOSSARY.bodyFatMethod} size={13} />
                    </View>
                    <SegmentedControl
                      options={BODY_FAT_SOURCE_OPTIONS}
                      value={bfSource}
                      onChange={(v) => { Keyboard.dismiss(); setBfSource(v); }}
                      accessibilityLabel="Body fat estimate source"
                      equalWidth={false}
                    />
                  </View>
                ) : null}
              </View>
            </QuestionGroup>

            <Button
              title="Continue"
              trailingIcon="arrow-forward"
              style={styles.primaryBtn}
              onPress={advanceFrom3}
              textStyle={[styles.primaryBtnText, live.primaryBtnText]}
              accessibilityLabel="Continue"
            />
            {/* The sub above says this is skippable, but Continue was the only
                affordance offered. Skips exactly as Continue does; the field
                is left as typed (or blank), never coerced, so nothing is
                saved that was not actually entered. */}
            <Button
              variant="tertiary"
              title="Skip for now"
              onPress={() => { setBodyFat(''); advanceFrom3(); }}
              accessibilityLabel="Skip for now"
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── Step 4, Training setup (logistics) ──────────────────────────────────────

  if (step === 4) {
    const errors4 = attempted4 ? validateStep4() : {};
    const needed4 = stillNeeded(errors4, ['experience', 'sessionLength', 'days', 'equipment'], STEP4_LABELS);

    return (
      <SafeAreaView key="step-4" style={[styles.safe, live.safe]}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'none'}>
            <ProOnboardingHeader
              step={step}
              title="Shape your training week"
              sub="The plan should fit your real week, not the week you wish you had."
              onBack={goBack}
            />

            <View onLayout={markY('group4')}>
            <QuestionGroup
              icon="barbell-outline"
              // C5-P36-01 (D96): the header sub above is the single carrier.
              // RC-7 (D96, Review C): single-group step, so no group title.
            >
              <View style={styles.section} onLayout={markY('experience')}>
                <Dropdown
                  label="Training experience"
                  hint="This sets your starting volume and how complex the exercises are."
                  tip={GLOSSARY.volume}
                  value={experience}
                  options={EXPERIENCE_OPTIONS}
                  onChange={setExperience}
                  placeholder="Select your experience"
                  error={errors4.experience}
                />
              </View>

              <View style={styles.section} onLayout={markY('sessionLength')}>
                <Text style={[styles.fieldLabel, live.fieldLabel]}>Session length</Text>
                <Text style={[styles.fieldHint, live.fieldHint]}>Pick the time you can usually finish, including warm-ups.</Text>
                <SegmentedControl
                  options={SESSION_LENGTH_OPTIONS}
                  value={sessionLengthMinutes}
                  onChange={setSessionLengthMinutes}
                  accessibilityLabel="Session length"
                  error={!!errors4.sessionLength}
                />
                <FieldError message={errors4.sessionLength} />
              </View>

              <View style={styles.section} onLayout={markY('days')}>
                <Text style={[styles.fieldLabel, live.fieldLabel]}>Training days per week</Text>
                <Text style={[styles.fieldHint, live.fieldHint]}>Choose the number of days you can repeat most weeks. Two is enough to train everything, so pick the honest number rather than the ambitious one.</Text>
                <SegmentedControl
                  options={DAYS_PER_WEEK_OPTIONS.map(d => ({ label: String(d), value: d }))}
                  value={daysPerWeek}
                  onChange={setDaysPerWeek}
                  accessibilityLabel="Training days per week"
                  error={!!errors4.days}
                />
                <FieldError message={errors4.days} />
              </View>

              <View style={styles.sectionLast} onLayout={markY('equipment')}>
                <Dropdown
                  label="Equipment"
                  hint="Choose what you normally have access to, so swaps and exercise choices make sense."
                  value={equipment}
                  options={EQUIPMENT_OPTIONS}
                  onChange={setEquipment}
                  placeholder="Select your equipment"
                  error={errors4.equipment}
                />
              </View>
            </QuestionGroup>
            </View>

            {needed4 ? (
              <Text style={[styles.continueHint, live.continueHint]}>{needed4}</Text>
            ) : null}

            <Button
              title="Continue"
              trailingIcon="arrow-forward"
              style={styles.primaryBtn}
              onPress={advanceFrom4}
              textStyle={[styles.primaryBtnText, live.primaryBtnText]}
              accessibilityLabel="Continue"
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── Step 5, Injuries & limitations (CC28, section 11.2) ───────────────────
  // OPTIONAL, one-tap skippable, skip is first-class. The full add flow
  // (consent moment, functional cards, durability, readback) is the shared
  // Injuries & limitations surface, so the two entry points can never drift.

  if (step === 5) {
    return (
      <SafeAreaView key="step-5" style={[styles.safe, live.safe]}>
        <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'none'}>
          <ProOnboardingHeader
            step={step}
            title="Anything Volyume should build around?"
            sub="If you have an injury, pain, a long-term health condition or a disability, set it up now and every plan starts compatible. Plenty of people train seated, one-sided or without overhead work. If not, skip straight past."
            onBack={goBack}
          />

          {/* D152 / certification finding A-1: there used to be TWO skip
              buttons here, "Nothing in particular" and "Later, from
              Settings", running the identical handler. Nothing recorded a
              "later" and nothing ever followed up, so the second button
              promised a reminder that did not exist. One honest skip now,
              with the caption saying where the door actually is. */}
          <QuestionGroup icon="body-outline">
            <View style={styles.section}>
              <Button
                title="Yes, let's set that up"
                onPress={() => navigation.navigate('HowYouTrain')}
              />
            </View>
            <View style={styles.sectionLast}>
              {/* NOT "Not now": that phrase is reserved by the R8-3/R9
                  guard for the button that actually DECLINES a capability
                  change (HowYouTrainScreen.capabilityFlows.guard.test.js).
                  This one writes nothing, so it says what it does. */}
              <Button
                title="Skip for now"
                variant="secondary"
                onPress={advanceFrom5}
              />
            </View>
          </QuestionGroup>

          <Text style={[styles.fieldHint, live.fieldHint]}>
            You can add this any time under Injuries & limitations, in the Coach tab or Settings.
          </Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Step 6, Goal ────────────────────────────────────────────────────────────

  if (step === 6) {
    const goalOptions = PHYSIQUE_GOALS.map(g => ({ value: g.value, label: g.label, sub: g.subtitle }));
    const errors6 = attempted6 ? validateStep6() : {};

    // A3 (audit 04 §4): preview and final save share the canonical resolver.
    // The preview is read-only and never creates a revalidation marker.

    return (
      <SafeAreaView key="step-5-goal" style={[styles.safe, live.safe]}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'none'}>
            <ProOnboardingHeader
              step={step}
              title="Set your training focus"
              sub="Your goal sets the calorie direction, training bias and nutrition target."
              onBack={goBack}
            />

            {/* Primary question, single source of truth for what the
                current block is doing. Drives calories, plan structure,
                weak-point spec, and strength-size emphasis. */}
            <QuestionGroup
              icon="flag-outline"
              // C5-P36-01 (D96): the header sub above is the single carrier.
              // The optional-refinements point is already made by the fields
              // themselves, each of which is labelled optional.
              // RC-7 (D96, Review C): single-group step, so no group title.
            >
              <View style={styles.section} onLayout={markY('phase')}>
                <Dropdown
                  label="What are you focused on right now?"
                  hint="This drives your calorie target and how your plan is built."
                  tip={GLOSSARY.phase}
                  value={trainingPhase}
                  options={TRAINING_PHASES.map(p => ({ value: p.value, label: p.label, sub: p.detail }))}
                  onChange={setTrainingPhase}
                  placeholder="Choose your focus"
                  error={errors6.phase}
                />
                {provisionalKcal ? (
                  <Text style={[styles.provisionalKcal, live.provisionalKcal]}>
                    Provisionally about {provisionalKcal.toLocaleString('en-GB')} kcal a day for this focus. Your exact targets are set when your plan is built.
                  </Text>
                ) : null}
              </View>

              {/* Secondary, optional, only matters for competitive lifters
                  chasing a specific physique category. Defaults to 'general'
                  (balanced volume) for everyone else. */}
              <View style={styles.section}>
                <Dropdown
                  label="Competing in a category? (optional)"
                  hint="Only if you are chasing a competitive physique. It biases the plan towards the muscles that category is judged on."
                  tip={GLOSSARY.division}
                  value={trainingGoal}
                  options={goalOptions}
                  onChange={changeGoal}
                  placeholder="Not competing, General"
                />
              </View>

              {/* Weak points, division-scoped. The options shown are the ones
                  this division is judged on (or commonly brings up). Picking none
                  is fine, it just means a balanced plan. */}
              {GOALS_WITH_WEAK_POINTS.includes(trainingGoal) && (
                <View style={[styles.wpSection, live.wpSection]}>
                  <Text style={[styles.wpLabel, live.wpLabel]}>
                    Anything to bring up? <Text style={[styles.wpOptional, live.wpOptional]}>(optional, up to 3)</Text>
                  </Text>
                  <Text style={[styles.wpHint, live.wpHint]}>
                    Pick one to three muscles you want to bring up. Not sure? Leave it blank for a balanced plan.
                  </Text>
                  <View style={styles.wpGrid}>
                    {weakPointSetForGoal(trainingGoal).map(muscle => (
                      <Chip
                        key={muscle}
                        label={muscle}
                        selected={planWeakPoints.includes(muscle)}
                        onPress={() => toggleWeakPoint(muscle)}
                      />
                    ))}
                  </View>
                </View>
              )}

              <View style={styles.sectionLast}>
              <TouchableOpacity
                style={[styles.proteinHead, live.proteinHead]}
                onPress={() => setProteinOpen(v => !v)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityState={{ expanded: proteinOpen }}
                accessibilityLabel={`Protein target, ${PROTEIN_APPROACHES[proteinApproach]?.label}. Tap to change.`}
              >
                <View style={[styles.proteinCopy, live.proteinCopy]}>
                  <View style={[styles.measuredRow, live.measuredRow]}>
                    <Text style={[styles.fieldLabel, live.fieldLabel]}>Protein target</Text>
                    {/* U-E-1: gloss the Standard/Optimised/Advanced protein tiers. */}
                    <InfoTooltip text={GLOSSARY.proteinTier} size={13} />
                  </View>
                  <Text style={[styles.fieldHint, live.fieldHint]}>
                    {PROTEIN_APPROACHES[proteinApproach]?.label} - {PROTEIN_APPROACHES[proteinApproach]?.range}. Set for you, tap to change.
                  </Text>
                </View>
                <Ionicons name={proteinOpen ? 'chevron-up' : 'chevron-down'} size={18} color={t.colors.textMuted} />
              </TouchableOpacity>

              {proteinOpen && (
                <View style={styles.proteinOptions} accessibilityRole="radiogroup" accessibilityLabel="Protein target">
                  {['standard', 'optimised', 'advanced'].map(key => {
                    const opt = PROTEIN_APPROACHES[key];
                    const active = proteinApproach === key;
                    const recommended = key === suggestedApproach;
                    return (
                      <TouchableOpacity
                        key={key}
                        style={[styles.proteinOpt, live.proteinOpt, active && [styles.proteinOptActive, live.proteinOptActive]]}
                        onPress={() => setProteinOverride(key)}
                        activeOpacity={0.85}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={`${opt.label}, ${opt.range}${recommended ? ', recommended' : ''}`}
                      >
                        <View style={[styles.proteinOptionCopy, live.proteinOptionCopy]}>
                          <View style={styles.proteinOptTop}>
                            <Text style={[styles.proteinOptLabel, live.proteinOptLabel]}>{opt.label}</Text>
                            <Text style={[styles.proteinOptRange, live.proteinOptRange]}>{opt.range}</Text>
                            {recommended ? (
                              <View style={[styles.recBadge, live.recBadge]}>
                                <Text style={[styles.recBadgeText, live.recBadgeText]}>Recommended</Text>
                              </View>
                            ) : null}
                          </View>
                          <Text style={[styles.proteinOptDesc, live.proteinOptDesc]}>{PROTEIN_SHORT[key]}</Text>
                        </View>
                        {active ? <Ionicons name="checkmark-circle" size={20} color={t.colors.primary} /> : null}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
              </View>
            </QuestionGroup>

            {errors6.phase ? (
              <Text style={[styles.continueHint, live.continueHint]}>Still needed: your focus.</Text>
            ) : null}

            <Button
              title="Continue"
              trailingIcon="arrow-forward"
              style={styles.primaryBtn}
              onPress={advanceFrom6}
              textStyle={[styles.primaryBtnText, live.primaryBtnText]}
              accessibilityLabel="Continue"
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── Step 7, Recovery & reminders ───────────────────────────────────────────

  if (step === 7) {
    const errors7 = attempted7 ? validateStep7() : {};

    // ── Plan fit ────────────────────────────────────────────────────────────
    // Shown only when the athlete's schedule cannot carry the plan we would
    // build for them, and only once. Everything on it is calculated from
    // their own answers by the real generator; nothing here is a rule of
    // thumb, and no length is called optimal, because no length is.
    if (fitReview) {
      const copy = fitCopy(fitReview.state, fitReview);
      const keep = keepChoiceCopy(fitReview);
      const moreSessions = (fitReview.alternatives ?? [])
        .find(a => a.kind === 'more_sessions');
      const moreCopy = moreSessions ? alternativeCopy(moreSessions) : null;

      return (
        <SafeAreaView key="step-6-fit" style={[styles.safe, live.safe]}>
          <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'none'}>
            <ProOnboardingHeader
              step={step}
              title="Plan fit"
              sub="Here is how your week looks against the plan we would build for you."
              onBack={() => setFitReview(null)}
            />

            <View style={[styles.coachCard, live.coachCard]}>
              <View style={styles.coachCardHead}>
                <View style={[styles.notifIconWrap, live.notifIconWrap]}>
                  <Ionicons name="time-outline" size={18} color={t.colors.primary} />
                </View>
                <Text style={[styles.coachCardTitle, live.coachCardTitle]}>{copy.title}</Text>
              </View>
              <Text style={[styles.coachCardBody, live.coachCardBody]}>{copy.body}</Text>
            </View>

            {/* C16 DIVISION (completion pass): if this schedule cannot carry
                the shaping work the athlete's category is judged on, that is
                part of the fit answer and is said here rather than left for
                them to discover in the plan. */}
            {coverageCopy(fitReview) ? (
              <Text style={[styles.continueHint, live.continueHint]}>{coverageCopy(fitReview)}</Text>
            ) : null}

            <View style={styles.section}>
              <Text style={[styles.fieldLabel, live.fieldLabel]}>Session length</Text>
              <Text style={[styles.fieldHint, live.fieldHint]}>
                These are worked out from your own plan, so they will not match someone else's.
              </Text>
              <View style={styles.proteinOptions}>
                {(fitReview.durations ?? []).map((d) => {
                  const active = d.minutes === fitReview.sessionLengthMinutes;
                  return (
                    <TouchableOpacity
                      key={d.minutes}
                      style={[styles.proteinOpt, live.proteinOpt, active && [styles.proteinOptActive, live.proteinOptActive]]}
                      onPress={() => chooseDuration(d.minutes)}
                      disabled={fitBusy}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: active, disabled: fitBusy }}
                      accessibilityLabel={`${d.minutes} minute sessions, ${d.label}`}
                    >
                      <View style={styles.proteinOptionCopy}>
                        <View style={styles.proteinOptTop}>
                          <Text style={[styles.proteinOptLabel, live.proteinOptLabel]}>{d.minutes} min</Text>
                          {d.label ? (
                            <View style={[styles.recBadge, live.recBadge]}>
                              <Text style={[styles.recBadgeText, live.recBadgeText]}>{d.label}</Text>
                            </View>
                          ) : null}
                        </View>
                      </View>
                      {active ? (
                        <Ionicons name="checkmark-circle" size={20} color={t.colors.primary} />
                      ) : null}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* An extra training day is offered as an OPTION and never taken
                on the athlete's behalf. Only shown when it would genuinely
                help, because it was calculated, not assumed. */}
            {moreCopy ? (
              <View style={styles.section}>
                <Text style={[styles.fieldLabel, live.fieldLabel]}>Another option</Text>
                <TouchableOpacity
                  style={[styles.proteinOpt, live.proteinOpt]}
                  onPress={() => acceptFit(moreSessions)}
                  disabled={fitBusy}
                  accessibilityRole="button"
                  accessibilityLabel={`${moreCopy.label}. ${moreCopy.detail}`}
                >
                  <View style={styles.proteinOptionCopy}>
                    <Text style={[styles.proteinOptLabel, live.proteinOptLabel]}>{moreCopy.label}</Text>
                    <Text style={[styles.proteinOptDesc, live.proteinOptDesc]}>{moreCopy.detail}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={t.colors.textMuted} />
                </TouchableOpacity>
              </View>
            ) : null}

            <Text style={[styles.continueHint, live.continueHint]}>{keep.detail}</Text>
            <Button variant="emphatic"
              title={`Build my plan: ${keep.label}`}
              trailingIcon="arrow-forward"
              style={[styles.primaryBtn, fitBusy && styles.primaryBtnDisabled]}
              onPress={fitBusy ? undefined : () => acceptFit(null)}
              disabled={fitBusy}
              loading={fitBusy}
              textStyle={[styles.primaryBtnText, live.primaryBtnText]}
              accessibilityLabel={`Build my plan, ${keep.label}`}
            />
          </ScrollView>
        </SafeAreaView>
      );
    }

    // COMP-013: the staged setup sequence replaces the dead
    // button spinner. Same header furniture (brand row + a now-full progress
    // bar), no new route, so a failure can fall back to the form below.
    if (sequenceActive) {
      const lines = sequenceStages();
      const stateFor = (i) => (i < sequenceStage - 1 ? 'done' : i === sequenceStage - 1 ? 'current' : 'upcoming');
      const planLine1 = [payoff?.goalLabel, payoff?.phaseLabel].filter(Boolean).join(' · ');
      const planLine2 = [payoff?.splitName, payoff?.days ? `${payoff.days} days` : null].filter(Boolean).join(' · ');
      const planLine3 = payoff ? `${payoff.buildWeeks} build weeks + 1 recovery week` : '';
      return (
        <SafeAreaView key="step-6-building" style={[styles.safe, live.safe]}>
          <View style={styles.seqScroll}>
            <Animated.View style={[styles.seqWrap, { opacity: sequenceFade }]}>
              <View style={styles.brandRow}>
                <VolyumeIcon size={22} />
              </View>
              <View style={[styles.progressTrack, live.progressTrack]}>
                <View style={[styles.progressFill, live.progressFill, { width: '100%' }]} />
              </View>
              {/* D147: one card, one size. The stage content is in flow and
                  complete from the first frame; the payoff is laid out
                  underneath at zero opacity and measured, so the card
                  reserves the taller of the two before anything is seen. */}
              <View style={[styles.seqPanel, live.seqPanel, payoffH ? { minHeight: payoffH + spacing.lg * 2 } : null]}>
                <Animated.View
                  style={{ opacity: stageContentOpacity }}
                  pointerEvents={payoffShown ? 'none' : 'auto'}
                  importantForAccessibility={payoffShown ? 'no-hide-descendants' : 'auto'}
                >
                  <Text style={[styles.seqHeading, live.seqHeading]}>Building your first plan</Text>
                  <Text style={[styles.seqSub, live.seqSub]}>
                    Using your goal, schedule and training setup to build your starting plan.
                  </Text>
                  <View style={styles.seqList} accessibilityLiveRegion="polite">
                    {lines.map((line, i) => (
                      <StageRow key={i} label={line} state={stateFor(i)} reduceMotion={reduceMotion} t={t} live={live} />
                    ))}
                  </View>
                </Animated.View>

                <Animated.View
                  style={[styles.seqPayoff, { opacity: payoffOpacity }]}
                  pointerEvents={payoffShown ? 'auto' : 'none'}
                  importantForAccessibility={payoffShown ? 'auto' : 'no-hide-descendants'}
                  onLayout={(e) => setPayoffH(Math.round(e.nativeEvent.layout.height))}
                >
                  <View style={styles.seqEyebrowRow}>
                    <Ionicons name="checkmark-circle" size={16} color={t.colors.primary} importantForAccessibility="no" />
                    <Text style={[styles.seqEyebrow, live.seqEyebrow]}>Plan ready</Text>
                  </View>
                  <Text style={[styles.seqHeading, live.seqHeading]} accessibilityRole="header">Your plan is ready</Text>
                  <View style={styles.seqPlanLines}>
                    {planLine1 ? <Text style={[styles.seqPlanLine, live.seqPlanLine]} numberOfLines={1}>{planLine1}</Text> : null}
                    {planLine2 ? <Text style={[styles.seqPlanLine, live.seqPlanLine]} numberOfLines={1}>{planLine2}</Text> : null}
                    {planLine3 ? <Text style={[styles.seqPlanLine, live.seqPlanLine]} numberOfLines={1}>{planLine3}</Text> : null}
                  </View>
                  <Text style={[styles.seqSub, live.seqSub]}>Your targets and weekly check-in are ready too.</Text>
                  <Button variant="emphatic"
                    title="See my plan"
                    trailingIcon="arrow-forward"
                    onPress={seePlan}
                    style={styles.seqPayoffBtn}
                    accessibilityLabel="See my plan"
                  />
                </Animated.View>
              </View>
            </Animated.View>
          </View>
        </SafeAreaView>
      );
    }

    return (
      <SafeAreaView key="step-6" style={[styles.safe, live.safe]}>
        <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'none'}>
          <ProOnboardingHeader
            step={step}
            title="Recovery and reminders"
            // C5-P36-02 (D96): this screen stated one idea four times in a
            // single scroll - this sub, the coach card, the field hint and a
            // tooltip the source comment below says is deliberately SHARED by
            // the hint and this sub, because the header has no field label to
            // anchor one to. That shared anchor was the symptom: two
            // explanation layers competing for one idea. The volume clause is
            // deleted here, where it had no anchor, and kept on the field
            // hint an inch below, which states it more usefully and owns the
            // tooltip outright. The coach card, the reminder copy and the
            // tooltip all stay; nothing about the recovery question, what it
            // drives, or the write-before-prompt reminder ordering changes.
            sub="Reminders keep coaching consistent."
            onBack={goBack}
          />

          <View style={[styles.coachCard, live.coachCard]}>
            <View style={styles.coachCardHead}>
              <View style={[styles.notifIconWrap, live.notifIconWrap]}>
                <Ionicons name="git-branch-outline" size={18} color={t.colors.primary} />
              </View>
              <Text style={[styles.coachCardTitle, live.coachCardTitle]}>How your coaching works</Text>
            </View>
            <Text style={[styles.coachCardBody, live.coachCardBody]}>
              Volyume uses your morning weigh-ins and weekly check-in to shape coaching. Food logging helps refine it, and the app stays cautious when data is missing.
            </Text>
          </View>

          <View style={styles.section}>
            {/* U-E-1/A6: glosses "volume" on this field's hint, per the
                existing bodyFatMethod/phase/division/proteinTier pattern.
                C5-P36-02 (D96): the tooltip used to stand in for the Header
                sub above as well, because that sub also said "volume" with
                no field label to anchor a tooltip to. That sub's volume
                clause is now deleted, so this is the only "volume" site on
                the step and the tooltip anchors to its own field, as
                everywhere else. */}
            <View onLayout={markY('recovery')}>
            <Dropdown
              label="How's your recovery?"
              hint="Be honest here. This sets how much volume your plan includes, so it can protect your recovery."
              tip={GLOSSARY.volume}
              value={recoveryRating}
              options={RECOVERY_OPTIONS}
              onChange={setRecoveryRating}
              placeholder="Select your recovery"
              error={errors7.recovery}
            />
            </View>
          </View>

          <View style={styles.section}>
            <Text style={[styles.fieldLabel, live.fieldLabel]}>Coaching reminders</Text>
            {/* C5-P27-02 (D96): the tap that leaves this step reads as
                "finish setup", and nothing said the phone was about to ask
                for notification permission. One clause, so the OS dialog
                arrives as the expected consequence of a choice already
                explained above it. */}
            <Text style={[styles.fieldHint, live.fieldHint]}>Pick a morning time and weekly check-in day. Your phone will ask to allow notifications when you continue. Change them any time in your coaching reminder settings.</Text>

            <View style={[styles.notifSection, live.notifSection]}>
              <View style={styles.notifHeader}>
                <View style={[styles.notifIconWrap, live.notifIconWrap]}>
                  <Ionicons name="scale-outline" size={18} color={t.colors.primary} />
                </View>
                <View style={styles.notifCopy}>
                  <Text style={[styles.notifTitle, live.notifTitle]}>Morning weight reminder</Text>
                  {/* C5-P28-03 (D96): a second daily weight prompt (19:30) is
                      laid alongside this one and was named on no screen the
                      user could reach. It is named here, where the morning
                      prompt is chosen. Nothing about what is scheduled
                      changes. */}
                  <Text style={[styles.notifSub, live.notifSub]}>
                    A quick morning weigh-in gives a cleaner trend than occasional scale checks. If the morning gets away from you, a quiet backstop at 7.30 pm offers one more chance that day.
                  </Text>
                </View>
                {/* FR-4/D7: "Required" softened to "Part of your coaching" -
                    tone only, this reminder is still non-optional; see
                    coverage-05-first-run.md FR-4. */}
                <View style={[styles.requiredPill, live.requiredPill]} accessibilityLabel="Part of your coaching">
                  <Text style={[styles.requiredPillText, live.requiredPillText]}>Part of your coaching</Text>
                </View>
              </View>

              <View style={styles.timeRow}>
                <Text style={[styles.timeLabel, live.timeLabel]}>Remind me at</Text>
                <View accessibilityRole="radiogroup" accessibilityLabel="Morning weight reminder time">
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.hourScroll}
                  contentContainerStyle={styles.hourScrollContent}
                >
                  {HOURS.map(h => (
                    <TouchableOpacity
                      key={h}
                      style={[styles.hourChip, live.hourChip, morningHour === h && [styles.hourChipActive, live.hourChipActive]]}
                      onPress={() => setMorningHour(h)}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: morningHour === h }}
                      accessibilityLabel={`Remind me at ${fmt12(h)}`}
                    >
                      <Text style={[styles.hourChipText, live.hourChipText, morningHour === h && [styles.hourChipTextActive, live.hourChipTextActive]]}>
                        {fmt12(h)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                </View>
              </View>
              {/* C5-P28-01 (D96): the effective time, not just the picked one. */}
              {morningShift.shifted ? (
                <Text style={[styles.notifSub, live.notifSub]}>
                  Quiet hours currently run to {fmt12(morningShift.hour)}, so this reminder will arrive then. You can change quiet hours in Settings, Notifications.
                </Text>
              ) : null}
            </View>

            <View style={[styles.notifSection, live.notifSection]}>
              <View style={styles.notifHeader}>
                <View style={[styles.notifIconWrap, live.notifIconWrap]}>
                  <Ionicons name="calendar-outline" size={18} color={t.colors.primary} />
                </View>
                <View style={styles.notifCopy}>
                  <Text style={[styles.notifTitle, live.notifTitle]}>Weekly check-in reminder</Text>
                  <Text style={[styles.notifSub, live.notifSub]}>
                    Pick the day you are most likely to review training, food and recovery honestly.
                  </Text>
                </View>
                {/* FR-4/D7: "Required" softened to "Part of your coaching" -
                    tone only, this reminder is still non-optional; see
                    coverage-05-first-run.md FR-4. */}
                <View style={[styles.requiredPill, live.requiredPill]} accessibilityLabel="Part of your coaching">
                  <Text style={[styles.requiredPillText, live.requiredPillText]}>Part of your coaching</Text>
                </View>
              </View>

              <View style={styles.timeRow}>
                <Text style={[styles.timeLabel, live.timeLabel]}>Check in on</Text>
                <View accessibilityRole="radiogroup" accessibilityLabel="Weekly check-in day">
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.hourScroll}
                  contentContainerStyle={styles.hourScrollContent}
                >
                  {DAYS.map((d, i) => (
                    <TouchableOpacity
                      key={d}
                      style={[styles.hourChip, live.hourChip, checkinDay === i && [styles.hourChipActive, live.hourChipActive]]}
                      onPress={() => setCheckinDay(i)}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: checkinDay === i }}
                      accessibilityLabel={`Check in on ${d}`}
                    >
                      <Text style={[styles.hourChipText, live.hourChipText, checkinDay === i && [styles.hourChipTextActive, live.hourChipTextActive]]}>
                        {d.slice(0, 3)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                </View>
              </View>
            </View>
          </View>

          {errors7.recovery ? (
            <Text style={[styles.continueHint, live.continueHint]}>Still needed: your recovery level.</Text>
          ) : null}

          <Button
            title="Continue"
            trailingIcon="arrow-forward"
            style={[styles.primaryBtn, (busy || fitBusy) && styles.primaryBtnDisabled]}
            onPress={!busy && !fitBusy ? advanceFrom7 : undefined}
            disabled={busy || fitBusy}
            loading={busy || fitBusy}
            textStyle={[styles.primaryBtnText, live.primaryBtnText]}
            accessibilityLabel="Continue"
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { flexGrow: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.xxxl },

  // Header
  headerBlock: { marginBottom: spacing.lg },
  brandRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginBottom: spacing.md,
  },
  progressTrack: {
    height: 3, borderRadius: radius.hair, backgroundColor: colors.border,
    overflow: 'hidden', marginBottom: spacing.sm,
  },
  progressFill: { height: '100%', borderRadius: radius.hair, backgroundColor: colors.primary },

  stepCount: { ...type.num('caption'), color: colors.textMuted, marginBottom: spacing.xs },
  stepTitle: {
    ...type.h2,
    color: colors.textPrimary, marginBottom: spacing.sm,
  },
  stepSub: { ...type.bodySm, color: colors.textSecondary, lineHeight: 20 },
  outcomeCard: {
    marginTop: spacing.md,
    gap: spacing.xs,
  },
  outcomeEyebrow: {
    ...type.caption,
    color: colors.textMuted,
    fontWeight: fontWeight.semibold,
  },
  outcomeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  outcomeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    backgroundColor: colors.primaryBg,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    maxWidth: '100%',
  },
  outcomeChipText: { ...type.caption, color: colors.textPrimary, flexShrink: 1 },

  // COMP-013 plan setup sequence (replaces the step-5 button spinner).
  seqScroll: {
    flexGrow: 1,
    padding: spacing.xl,
    justifyContent: 'center',
  },
  seqWrap: { width: '100%', gap: spacing.lg },
  // D147: a charcoal surface with a hairline, not an outlined box; its
  // size is fixed from the first frame (see the render note).
  seqPanel: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing.lg,
  },
  seqHeading: {
    ...type.h3,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  seqSub: {
    ...type.bodySm,
    color: colors.textSecondary,
  },
  seqList: { gap: spacing.xs, marginTop: spacing.lg },
  seqRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 34,
  },
  seqIcon: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  seqIconCentre: { alignItems: 'center', justifyContent: 'center' },
  seqDot: { width: 8, height: 8, borderRadius: circle(8), borderWidth: 1.5, borderColor: colors.textMuted },
  seqLine: { ...type.bodySm, flex: 1, color: colors.textPrimary },
  seqLineCurrent: { fontFamily: fontFamily.medium, fontWeight: fontWeight.medium },
  // The payoff sits under the stage content at zero opacity until it is
  // revealed, inside the same padding, so it can never change the card.
  seqPayoff: {
    position: 'absolute', left: spacing.lg, right: spacing.lg, top: spacing.lg,
  },
  seqEyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm },
  seqEyebrow: { ...type.overline, color: colors.primary },
  seqPlanLines: { gap: spacing.xxs, marginTop: spacing.sm, marginBottom: spacing.md },
  seqPlanLine: { ...type.body, color: colors.textPrimary },
  seqPayoffBtn: { marginTop: spacing.lg },

  // Back affordance, inline at the left of the brand row so it reads as part of
  // the header chrome instead of floating above the logo. Negative left margin
  // pulls the chevron to the content edge so it lines up with the page padding.
  brandBack: { marginLeft: -spacing.xs, marginRight: spacing.xxs },

  // Sections / inputs
  section: { marginBottom: spacing.xl },
  sectionLast: { marginBottom: 0 },
  questionGroup: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.borderSubtle,
    padding: spacing.md,
    marginBottom: spacing.xl,
  },
  questionGroupHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  questionGroupIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  questionGroupCopy: { flex: 1, minWidth: 0 },
  questionGroupTitle: { ...type.bodyStrong, color: colors.textPrimary, marginBottom: spacing.xxs },
  questionGroupSub: { ...type.captionTight, color: colors.textSecondary },
  continueHint: {
    ...type.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: -spacing.sm,
    marginBottom: spacing.md,
  },
  fieldLabel: {
    ...type.captionStrong,
    color: colors.textMuted, marginBottom: spacing.sm,
  },
  fieldHint: { ...type.captionTight, color: colors.textMuted, marginBottom: spacing.sm },
  // A3: provisional energy line under the focus dropdown (step 5).
  provisionalKcal: {
    ...type.captionTight, color: colors.textSecondary, marginTop: spacing.xs,
  },
  measuredRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
  // Protein target collapsible (step 3). Collapsed by default, the header
  // shows the chosen tier; expanding reveals the three tiers to pick from.
  proteinHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 48 },
  proteinCopy: { flex: 1, minWidth: 0 },
  proteinOptions: { marginTop: spacing.sm, gap: spacing.sm },
  proteinOpt: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 1.5, borderColor: colors.border, padding: spacing.md,
    minHeight: 64,
  },
  proteinOptionCopy: { flex: 1, minWidth: 0 },
  proteinOptActive: { borderColor: colors.primary },
  proteinOptTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xxs, flexWrap: 'wrap' },
  proteinOptLabel: { ...type.bodyStrong, color: colors.textPrimary },
  proteinOptRange: { fontSize: fontSize.xs, color: colors.textMuted },
  proteinOptDesc: { ...type.captionTight, color: colors.textSecondary },
  recBadge: {
    backgroundColor: colors.primaryBg, borderRadius: radius.full,
    paddingHorizontal: spacing.sm, paddingVertical: 1,
    borderWidth: 1, borderColor: withAlpha(colors.primary, 0.188),
  },
  recBadgeText: { fontSize: fontSize.micro, color: colors.primary, fontFamily: fontFamily.semibold, fontWeight: fontWeight.semibold },

  // Weak-point selector (step 3). Chip grid, division-scoped options.
  wpSection: { marginTop: spacing.lg, marginBottom: spacing.sm },
  wpLabel: {
    ...type.captionStrong,
    color: colors.textMuted, marginBottom: spacing.xs,
  },
  wpOptional: { color: colors.textMuted, fontFamily: fontFamily.regular, fontWeight: fontWeight.regular },
  wpHint: { ...type.captionTight, color: colors.textMuted, marginBottom: spacing.md },
  wpGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  fieldWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 1.5, borderColor: colors.border,
  },
  fieldWrapFocused: { borderColor: withAlpha(colors.primary, 0.502) },
  fieldInput: {
    flex: 1, paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: fontSize.md, color: colors.textPrimary,
  },
  eyeBtn: {
    position: 'absolute', right: spacing.md,
    top: 0, bottom: 0, justifyContent: 'center', paddingHorizontal: spacing.xs,
  },

  // D146: a unit picker sits above its inputs; paired inputs share the row
  // equally, whichever pair it is, so every box on the step is the same box.
  pairRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  pairHalf: { flex: 1 },
  pairFull: { flex: 1 },

  // Notifications
  notifSection: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 1.5, borderColor: colors.borderSubtle,
    padding: spacing.md, marginBottom: spacing.md,
  },
  notifHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  notifCopy: { flex: 1, minWidth: 0 },
  notifIconWrap: {
    width: 36, height: 36, borderRadius: radius.md,
    backgroundColor: colors.primaryBg,
    alignItems: 'center', justifyContent: 'center',
  },
  notifTitle: { ...type.bodyStrong, color: colors.textPrimary, marginBottom: spacing.xxs },
  notifSub: { ...type.captionTight, color: colors.textMuted },
  requiredPill: {
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: withAlpha(colors.primary, 0.188),
    backgroundColor: colors.primaryBg,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    alignSelf: 'flex-start',
  },
  requiredPillText: { ...type.caption, color: colors.primary, fontWeight: fontWeight.semibold },

  coachCard: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 1.5, borderColor: colors.borderSubtle,
    padding: spacing.md, marginBottom: spacing.xl,
  },
  coachCardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  coachCardTitle: { ...type.bodyStrong, color: colors.textPrimary },
  coachCardBody: { ...type.bodySm, color: colors.textSecondary },

  timeRow: { marginTop: spacing.md },
  timeLabel: { ...type.caption, color: colors.textMuted, marginBottom: spacing.sm },
  hourScroll: { flexGrow: 0 },
  hourScrollContent: { gap: spacing.xs, paddingRight: spacing.sm },
  hourChip: {
    minHeight: 48,
    paddingHorizontal: spacing.md + 1, paddingVertical: 8,
    borderRadius: radius.full, backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.border,
    justifyContent: 'center',
  },
  hourChipActive: { backgroundColor: colors.primaryFill, borderColor: colors.primary },
  hourChipText: { fontSize: fontSize.xs, color: colors.textSecondary, fontFamily: fontFamily.medium, fontWeight: fontWeight.medium },
  hourChipTextActive: { color: colors.onPrimary, fontFamily: fontFamily.bold, fontWeight: fontWeight.bold },

  // Beta offer card
  offerCard: {
    backgroundColor: colors.surface, borderRadius: radius.xl,
    borderWidth: 2, borderColor: colors.primary,
    padding: spacing.lg, marginBottom: spacing.xl,
    ...shadow.glow,
  },
  offerBadgeRow: { marginBottom: spacing.sm },
  offerBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    alignSelf: 'flex-start', backgroundColor: colors.primaryFill,
    borderRadius: 4, paddingHorizontal: spacing.sm, paddingVertical: 3,
  },
  offerBadgeText: { fontSize: fontSize.micro, fontFamily: fontFamily.heavy, fontWeight: fontWeight.black, color: colors.onPrimary },
  offerHeadline: { fontSize: fontSize.xl, fontFamily: fontFamily.bold, fontWeight: fontWeight.bold, color: colors.textPrimary, marginBottom: spacing.sm, lineHeight: 26 },
  offerBody: { ...type.bodySm, color: colors.textSecondary, marginBottom: spacing.md },
  offerPerks: { gap: spacing.xs },
  offerPerk: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  offerPerkText: { fontSize: fontSize.sm, color: colors.textSecondary },

  // Buttons
  primaryBtn: {
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    marginBottom: spacing.md,
  },
  // D148: the shared Button owns its label; nothing here overrides it.
  primaryBtnText: {},
  primaryBtnDisabled: { opacity: 0.4 },
  oauthBusy: { alignItems: 'center', paddingVertical: spacing.lg },
  skipBtn: { alignItems: 'center', paddingVertical: spacing.md },
  skipBtnText: { fontSize: fontSize.sm, color: colors.textMuted },
  skipNote: {
    textAlign: 'center', fontSize: fontSize.xs,
    color: colors.textDisabled, lineHeight: 18, marginTop: spacing.xs,
  },
});

// CP-10 batch G lane 1 (2026-07-11): the frozen `styles` block above stays
// byte-identical. This mirrors ONLY the colour/fontSize/type-bearing sub-
// properties of the matching frozen style, at identical rest values, so the
// screen carries no static island under a live theme toggle. Pure layout
// keys (flex/padding/gap/margin/borderRadius/borderWidth/width/height, no
// token) and fontWeight (not part of useTheme()'s shape) are correctly
// omitted. The dead offerCard/offerBadge*/offerHeadline/offerBody/
// offerPerk*/skipBtn*/fieldWrap*/fieldInput/eyeBtn styles (unreferenced in
// this screen's JSX) are left out of scope, matching "touch only what the
// task requires". Every wizard step gate, the sex/height/weight/age
// validation and the plan-generation sequence are untouched -- colours
// only.
function buildLiveStyles(t) {
  return {
    safe: { backgroundColor: t.colors.background },
    progressTrack: { backgroundColor: t.colors.border },
    progressFill: { backgroundColor: t.colors.primary },
    stepCount: { ...t.type.num('caption'), color: t.colors.textMuted },
    stepTitle: { ...t.type.h2, color: t.colors.textPrimary },
    stepSub: { ...t.type.bodySm, color: t.colors.textSecondary },
    outcomeEyebrow: { ...t.type.caption, color: t.colors.textMuted },
    outcomeChip: { backgroundColor: t.colors.primaryBg },
    outcomeChipText: { ...t.type.caption, color: t.colors.textPrimary },
    seqPanel: { backgroundColor: t.colors.surface, borderColor: t.colors.borderSubtle },
    seqHeading: { ...t.type.h3, color: t.colors.textPrimary },
    seqSub: { ...t.type.bodySm, color: t.colors.textSecondary },
    seqLine: { ...t.type.bodySm, color: t.colors.textPrimary },
    seqDot: { borderColor: t.colors.textMuted },
    seqEyebrow: { ...t.type.overline, color: t.colors.primary },
    seqPlanLine: { ...t.type.body, color: t.colors.textPrimary },
    questionGroup: { backgroundColor: t.colors.surface, borderColor: t.colors.border },
    questionGroupIcon: { backgroundColor: t.colors.primaryBg },
    questionGroupTitle: { ...t.type.bodyStrong, color: t.colors.textPrimary },
    questionGroupSub: { ...t.type.captionTight, color: t.colors.textSecondary },
    continueHint: { ...t.type.caption, color: t.colors.textSecondary },
    fieldLabel: { ...t.type.captionStrong, color: t.colors.textMuted },
    fieldHint: { ...t.type.captionTight, color: t.colors.textMuted },
    provisionalKcal: { ...t.type.captionTight, color: t.colors.textSecondary },
    proteinOpt: { backgroundColor: t.colors.surface, borderColor: t.colors.border },
    proteinOptActive: { borderColor: t.colors.primary },
    proteinOptLabel: { ...t.type.bodyStrong, color: t.colors.textPrimary },
    proteinOptRange: { fontSize: t.fontSize.xs, color: t.colors.textMuted },
    proteinOptDesc: { ...t.type.captionTight, color: t.colors.textSecondary },
    recBadge: { backgroundColor: t.colors.primaryBg, borderColor: withAlpha(t.colors.primary, 0.188) },
    recBadgeText: { fontSize: t.fontSize.micro, color: t.colors.primary },
    wpLabel: { ...t.type.captionStrong, color: t.colors.textMuted },
    wpOptional: { color: t.colors.textMuted },
    wpHint: { ...t.type.captionTight, color: t.colors.textMuted },
    notifSection: { backgroundColor: t.colors.surface, borderColor: t.colors.border },
    notifIconWrap: { backgroundColor: t.colors.primaryBg },
    notifTitle: { ...t.type.bodyStrong, color: t.colors.textPrimary },
    notifSub: { ...t.type.captionTight, color: t.colors.textMuted },
    requiredPill: { borderColor: withAlpha(t.colors.primary, 0.188), backgroundColor: t.colors.primaryBg },
    requiredPillText: { ...t.type.caption, color: t.colors.primary },
    coachCard: { backgroundColor: t.colors.surface, borderColor: t.colors.border },
    coachCardTitle: { ...t.type.bodyStrong, color: t.colors.textPrimary },
    coachCardBody: { ...t.type.bodySm, color: t.colors.textSecondary },
    timeLabel: { ...t.type.caption, color: t.colors.textMuted },
    hourChip: { backgroundColor: t.colors.surface2, borderColor: t.colors.border },
    hourChipActive: { backgroundColor: t.colors.primaryFill, borderColor: t.colors.primary },
    hourChipText: { fontSize: t.fontSize.xs, color: t.colors.textSecondary },
    hourChipTextActive: { color: t.colors.onPrimary },
    primaryBtnText: {},
  };
}
