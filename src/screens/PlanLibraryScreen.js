import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { appAlert } from '../components/AppAlert';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
// E8 perf: the vertical plans list recycles via FlashList; the small
// horizontal category chip row stays a FlatList (tiny, no gain).
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import BackHeader from '../components/BackHeader';
import Button from '../components/Button';
import { useFocusEffect } from '@react-navigation/native';

import { colors, fontSize, fontWeight, spacing, radius, type, withAlpha, alpha, circle, iconSize, fontFamily } from '../styles/theme';
import useTheme from '../hooks/useTheme';
import { getLibraryPlans, getPlanWorkoutCounts, getLibraryPlanExerciseRows, copyPlanFromLibrary, activatePlanWithBlock, getActiveBlock, updateRoutineExerciseExercise, recordExerciseSwap } from '../lib/database';
import { estimateWorkoutMinutes } from '../lib/planEngine';
import { styleKeyFromTags, styleLabelFor } from '../lib/exercise/stylePools';
import { loadExerciseIntentState, findPlanIntentConflicts } from '../lib/exercise/intent';
import { SWAP_SCOPE } from '../lib/exercise/swapScope';
import ExerciseConflictSheet from '../components/ExerciseConflictSheet';
import { confirmPlanSwitchMidBlock } from '../lib/planSwitch';
import { seedRoutinesIfNeeded } from '../lib/seedRoutines';
import { planHeadingName, planEquipmentLabel } from '../lib/planDisplay';
import { getPlanDays, planEquipmentAllows, scorePlanRecommendation } from '../lib/onboarding/freeStarter';
import { BLOCK_START_SENTENCE, ACTIVATION_MEANING_SENTENCE } from '../lib/blockExplain';
import { SkeletonCard } from '../components/Skeleton';
import SearchBar from '../components/SearchBar';
import Card from '../components/Card';
import { navigateCrossTab } from '../navigation/navigateCrossTab';
import Chip from '../components/Chip';
import EmptyState from '../components/EmptyState';
import useAppStore from '../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import { useToast } from '../components/Toast';
import BottomSheet from '../components/BottomSheet';

// ─── Collections ─────────────────────────────────────────────────────────────

// EL-12 (docs/exercise-library-expansion-2026-09-05/09-STYLE-PLANS.md
// section 4): order is meaningful here - All, Fits your limitations (when
// active), Featured, Kettlebell, Circuits, Minimal equipment, Dumbbells
// only, Bodyweight, Bands, Short sessions, Beginner, For women, For men,
// Bodybuilding divisions.
const COLLECTIONS = [
  { key: 'all',       label: 'All plans' },
  // CC28 (Amendment section 13): a COMPUTED collection - plans whose
  // contents pass the user's capability state. Only rendered while the
  // user actually has active constraints (see collectionsForUser below);
  // families appear in normal browse alongside everything else, never a
  // segregated shelf.
  { key: 'compatible', label: 'Fits your limitations' },
  { key: 'featured',   label: 'Featured' },
  { key: 'kettlebell', label: 'Kettlebell' },
  { key: 'circuit',    label: 'Circuits' },
  { key: 'minimal',    label: 'Minimal equipment' },
  { key: 'dumbbell',   label: 'Dumbbells only' },
  { key: 'bodyweight', label: 'Bodyweight' },
  { key: 'band',       label: 'Bands' },
  { key: 'short',      label: 'Short sessions' },
  { key: 'beginner',   label: 'Beginner' },
  { key: 'women',      label: 'For women' },
  { key: 'men',        label: 'For men' },
  { key: 'division',   label: 'Bodybuilding divisions' },
];

// ─── Divisions ────────────────────────────────────────────────────────────────

const DIVISIONS_MEN = [
  {
    key: 'mens_physique',
    label: "Men's Physique",
    desc: "Wide shoulders, lean midsection, board shorts. Upper-body biased.",
  },
  {
    key: 'classic_physique',
    label: 'Classic Physique',
    desc: "Balanced golden-era build: capped shoulders, full chest, and legs.",
  },
  {
    key: 'mens_bodybuilding',
    label: "Men's Bodybuilding",
    desc: "Maximum muscular development across every group. High set count per week.",
  },
];

const DIVISIONS_WOMEN = [
  {
    key: 'bikini',
    label: 'Bikini',
    desc: "Lean and athletic with rounded glutes. The most glute-forward division.",
  },
  {
    key: 'wellness',
    label: 'Wellness',
    desc: "Developed lower body, proportionally smaller upper body.",
  },
  {
    key: 'figure',
    label: 'Figure',
    desc: "Athletic and muscular: strong shoulders and back with proportional legs.",
  },
  {
    key: 'womens_physique',
    label: "Women's Physique",
    desc: "More muscle across every group. Visible arms, back, and full legs.",
  },
  {
    key: 'womens_bodybuilding',
    label: "Women's Bodybuilding",
    desc: "Maximum female muscular development across every group.",
  },
];

const ALL_DIVISIONS = [...DIVISIONS_MEN, ...DIVISIONS_WOMEN];

// ─── Quiz ─────────────────────────────────────────────────────────────────────

const QUIZ_STEPS = [
  {
    key: 'goal',
    question: 'What is your main goal?',
    options: [
      { key: 'build_muscle', label: 'Build muscle',         icon: 'barbell-outline' },
      { key: 'get_stronger', label: 'Get stronger',         icon: 'trending-up-outline' },
      { key: 'conditioning', label: 'Improve conditioning', icon: 'heart-outline' },
      { key: 'stage_prep',   label: 'Get on stage',         icon: 'trophy-outline' },
    ],
  },
  {
    key: 'equipment',
    question: 'What equipment do you have access to?',
    options: [
      { key: 'full_gym',   label: 'Full gym',              icon: 'fitness-outline' },
      { key: 'dumbbell',   label: 'Dumbbells only',        icon: 'barbell-outline' },
      // EL-12: mapped onto planEquipmentAllows' equipment:kettlebell /
      // equipment:band tags (09-STYLE-PLANS.md section 4), the same
      // shared filter every plan-recommendation quiz reads.
      { key: 'kettlebell', label: 'Kettlebells',           icon: 'barbell-outline' },
      { key: 'band',       label: 'Bands',                 icon: 'body-outline' },
      { key: 'bodyweight', label: 'Home / no equipment',   icon: 'home-outline' },
    ],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hasTag(plan, tag) {
  return plan.tags ? plan.tags.toLowerCase().includes(tag.toLowerCase()) : false;
}

// EL-12: session minutes and the implements a plan needs, both derived
// from the plan's own exercise rows (not tags) via the engine's own
// estimator (planEngine.estimateWorkoutMinutes), so the figure is honest
// about the plan's actual sets/rest rather than a guess from its name.
const EQUIPMENT_IMPLEMENT_LABELS = Object.freeze({
  barbell: 'Barbell', dumbbell: 'Dumbbells', cable: 'Cables', machine: 'Machines',
  smith: 'Smith machine', bodyweight: 'Bodyweight', band: 'Bands',
  suspension: 'Suspension trainer', kettlebell: 'Kettlebell', landmine: 'Landmine',
  carries: 'Carries', power: 'Platform', specialty: 'Specialty kit',
  medicine_ball: 'Medicine ball', sled: 'Sled', sandbag: 'Sandbag',
});

function computeLibraryPlanStats(rows) {
  const byPlan = new Map();
  for (const r of rows ?? []) {
    if (!r?.programmeId) continue;
    if (!byPlan.has(r.programmeId)) byPlan.set(r.programmeId, { byRoutine: new Map(), equipment: new Set() });
    const entry = byPlan.get(r.programmeId);
    if (!entry.byRoutine.has(r.routineId)) entry.byRoutine.set(r.routineId, []);
    entry.byRoutine.get(r.routineId).push({ sets: r.recommendedSets ?? 3, restSec: r.restSeconds ?? 90 });
    if (r.equipment) entry.equipment.add(r.equipment);
  }
  const out = new Map();
  for (const [planId, { byRoutine, equipment }] of byPlan) {
    const perRoutine = [...byRoutine.values()].map((exs) => estimateWorkoutMinutes(exs));
    const minutes = perRoutine.length
      ? Math.round(perRoutine.reduce((a, b) => a + b, 0) / perRoutine.length)
      : null;
    const implementsList = [...equipment].map((e) => EQUIPMENT_IMPLEMENT_LABELS[e] ?? null).filter(Boolean);
    out.set(planId, { minutes, implements: [...new Set(implementsList)] });
  }
  return out;
}

function matchesCollection(plan, key) {
  if (key === 'all') return true;
  if (key === 'featured') return hasTag(plan, 'featured');
  if (key === 'women') return hasTag(plan, 'gender:women');
  if (key === 'men') return hasTag(plan, 'gender:men');
  if (key === 'beginner') return plan.difficulty === 0 || hasTag(plan, 'beginner') || hasTag(plan, 'audience:beginner');
  if (key === 'dumbbell') return hasTag(plan, 'equipment:dumbbell');
  if (key === 'short') return hasTag(plan, 'short');
  if (key === 'division') return hasTag(plan, 'category:division');
  // EL-12: the style collections.
  if (key === 'kettlebell') return hasTag(plan, 'equipment:kettlebell');
  if (key === 'circuit') return hasTag(plan, 'circuit');
  if (key === 'bodyweight') return hasTag(plan, 'equipment:bodyweight');
  if (key === 'band') return hasTag(plan, 'equipment:band');
  // 09 section 4: any plan tagged home, or built for dumbbell / band /
  // suspension / kettlebell / bodyweight equipment.
  if (key === 'minimal') {
    return hasTag(plan, 'home')
      || hasTag(plan, 'equipment:dumbbell')
      || hasTag(plan, 'equipment:band')
      || hasTag(plan, 'equipment:suspension')
      || hasTag(plan, 'equipment:kettlebell')
      || hasTag(plan, 'equipment:bodyweight');
  }
  return false;
}

// T5: stable beginner-first partition for the default (non-quiz) plan list.
// Reuses the exact predicate the "Beginner" collection chip already matches
// on (difficulty 0, or a beginner/audience:beginner tag) so there is one
// definition of "beginner-appropriate" in this file, rather than a second,
// possibly-diverging one. Array.prototype.sort is required to be stable
// (ES2019+), so plans within each half keep their existing relative order
// (created_at ASC from getLibraryPlans).
function sortBeginnerFirst(list) {
  return [...list].sort((a, b) => {
    const aBeginner = matchesCollection(a, 'beginner') ? 0 : 1;
    const bBeginner = matchesCollection(b, 'beginner') ? 0 : 1;
    return aBeginner - bBeginner;
  });
}

// C5-P10-03 (D96): equipment is a hard FILTER, not a score bump.
//
// The scorer used to give a matching equipment tag +4, which a division
// plan cleared on goal alone (+5 for stage_prep), so a "Home / no
// equipment" user answering "Get on stage" was handed a five-day advanced
// full-gym division plan under the heading "Here's our suggestion". An
// emptied pool falls through to the screen's existing "No exact match
// found" branch.
//
// Campaign 24 Wave A (WAVE-A-FINDINGS.md DUPLICATION): the equipment filter
// and the goal/equipment scoring core used to be re-implemented by hand
// here (quizEquipmentAllows + an inline scorer), independently of the
// identically-shaped rules in freeStarter.js's starter quiz -- the same
// user answering equivalent questions in the starter flow and this quiz in
// the same session could get two different plans, and a future rule change
// was not guaranteed to reach both. Both quizzes now share
// freeStarter.planEquipmentAllows / scorePlanRecommendation; this quiz's
// only addition on top is `includeDivisions: true`, since unlike the
// starter quiz it weighs stage_prep/division plans.
//
// Exported for the C5-P10-03 pin: the equipment filter is a behavioural
// rule, not a copy one, so it is asserted against the real scorer (the same
// pattern YearOfLiftsScreen's card builders already use).
export function getQuizRecommendation(answers, plans) {
  const { equipment } = answers;
  if (!plans.length) return null;
  const performable = plans.filter(p => planEquipmentAllows(p, equipment));
  if (!performable.length) return null;

  const scored = performable.map(p => ({
    plan: p,
    score: scorePlanRecommendation(p, answers, { includeDivisions: true }),
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.plan ?? null;
}

function getDivisionForPlan(plan) {
  for (const d of ALL_DIVISIONS) {
    if (hasTag(plan, `division:${d.key}`)) return d;
  }
  return null;
}

const DIFFICULTY_LABELS = ['Beginner', 'Intermediate', 'Advanced'];

// ─── Sub-components ───────────────────────────────────────────────────────────

// CP-10 batch G (2026-07-11): sibling function-component scope (not
// prop-drilled `live`/`t` from PlanLibraryScreen), so its own useTheme() call
// is cleaner than threading two extra props through. Same shared
// buildLiveStyles(t) as the parent screen.
function PlanBadge({ label, amber }) {
  const t = useTheme();
  const live = useMemo(() => buildLiveStyles(t), [t]);

  return (
    <View style={[styles.badge, live.badge, amber && [styles.badgeAmber, live.badgeAmber]]}>
      <Text style={[styles.badgeText, live.badgeText, amber && [styles.badgeTextAmber, live.badgeTextAmber]]}>{label}</Text>
    </View>
  );
}

// CP-10 batch G (2026-07-11): sibling function-component scope, own
// useTheme() call (same reasoning as PlanBadge above), same shared
// buildLiveStyles(t).
function DivisionGrid({ selectedDivision, onSelectDivision }) {
  const t = useTheme();
  const live = useMemo(() => buildLiveStyles(t), [t]);
  return (
    <View style={[styles.divisionSection, live.divisionSection]}>
      <Text style={[styles.divisionIntroDesc, live.divisionIntroDesc]}>
        Plans for stage categories, or anyone training for that shape. Pick a division to narrow the library.
      </Text>
      <Text style={[styles.divisionGroupLabel, live.divisionGroupLabel]}>Men's divisions</Text>
      <View style={styles.divisionChips}>
        {DIVISIONS_MEN.map(d => (
          <Chip
            key={d.key}
            label={d.label}
            selected={selectedDivision === d.key}
            onPress={() => onSelectDivision(selectedDivision === d.key ? null : d.key)}
            style={styles.divisionChip}
            labelStyle={[styles.divisionChipText, live.divisionChipText]}
            selectedLabelStyle={[styles.divisionChipTextActive, live.divisionChipTextActive]}
            accessibilityLabel={d.label}
          />
        ))}
      </View>

      <Text style={[styles.divisionGroupLabel, live.divisionGroupLabel, { marginTop: spacing.md }]}>Women's divisions</Text>
      <View style={styles.divisionChips}>
        {DIVISIONS_WOMEN.map(d => (
          <Chip
            key={d.key}
            label={d.label}
            selected={selectedDivision === d.key}
            onPress={() => onSelectDivision(selectedDivision === d.key ? null : d.key)}
            style={styles.divisionChip}
            labelStyle={[styles.divisionChipText, live.divisionChipText]}
            selectedLabelStyle={[styles.divisionChipTextActive, live.divisionChipTextActive]}
            accessibilityLabel={d.label}
          />
        ))}
      </View>

      {selectedDivision && (() => {
        const d = ALL_DIVISIONS.find(x => x.key === selectedDivision);
        return d ? (
          <Card surface="surface2" radius="md" padding="md" style={styles.divisionDesc}>
            <Text style={[styles.divisionDescText, live.divisionDescText]}>{d.desc}</Text>
          </Card>
        ) : null;
      })()}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

// F-16 REVISED point 3 (docs/final-certification-2026-09-05/07-FINDINGS.md):
// the collection keys another screen may open this library on. Validated
// against COLLECTIONS so a stale or mistyped param can never leave the
// browse showing an empty, unnamed filter.
const COLLECTION_KEYS = new Set(COLLECTIONS.map(c => c.key));

export default function PlanLibraryScreen({ navigation, route }) {
  const toast = useToast();
  // F7: subscribe to just these fields (a bare useAppStore() re-renders on every store mutation).
  const { user } = useAppStore(useShallow(s => ({
    user: s.user,
  })));
  // CP-10 batch G (2026-07-11): live theme (src/hooks/useTheme.js). Memoised
  // because this screen renders a plan list (FlashList) and a chip list
  // (FlatList).
  const t = useTheme();
  const live = useMemo(() => buildLiveStyles(t), [t]);

  const [plans, setPlans] = useState([]);
  // CC28: { state, byPlan: Map<planId, verdict> } or null (no constraints /
  // read unavailable - browse is untouched then).
  const [compatibility, setCompatibility] = useState(null);
  // C9 closeout item 3: a copied published plan may contain exercises the
  // user has set aside. Both facts stand, so they choose.
  const [planConflicts, setPlanConflicts] = useState(null);
  const [conflictIntentState, setConflictIntentState] = useState(null);
  const [workoutCounts, setWorkoutCounts] = useState({});
  // EL-12 (09-STYLE-PLANS.md section 4): planId -> { minutes, implements }.
  // Best-effort - a read failure just leaves cards without this line,
  // same treatment as compatibility above.
  const [planStats, setPlanStats] = useState(new Map());
  const [query, setQuery] = useState('');
  // F-16 REVISED: `initialCollection` is the smallest additive route param
  // that lets Adjust training send someone straight to the style they are
  // already on ('kettlebell' | 'circuit' | 'band'). Anything unrecognised
  // falls back to the ordinary 'All plans' browse.
  const initialCollection = COLLECTION_KEYS.has(route?.params?.initialCollection)
    ? route.params.initialCollection
    : 'all';
  const [activeCollection, setActiveCollection] = useState(initialCollection);
  const [selectedDivision, setSelectedDivision] = useState(null);
  const listRef = useRef(null);
  // RB-3 (D96, Review B): appAlert queues, so two taps on a plan card used
  // to queue two dialogs and run two copies + two activations. One
  // synchronous guard across the whole add flow.
  const addingRef = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // FF-004: distinguish a real load/init failure from a genuinely empty library
  // so the list can offer a retry instead of a misleading "No plans found".
  const [loadError, setLoadError] = useState(false);

  // Quiz state
  const [quizVisible, setQuizVisible] = useState(false);
  const [quizStep, setQuizStep] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState({});
  const [quizResult, setQuizResult] = useState(null);

  useFocusEffect(
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useCallback(() => { loadData(); }, []),
  );

  // Re-load when user.id becomes available, handles the case where the user
  // reaches this screen before the profile is ready, so seedRoutinesIfNeeded
  // was skipped on first mount.
  useEffect(() => {
    if (user?.id) loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function loadData() {
    try {
      if (user?.id) await seedRoutinesIfNeeded(user.id);
      const [lib, pwc] = await Promise.all([getLibraryPlans(), getPlanWorkoutCounts()]);
      setPlans(lib);
      setWorkoutCounts(pwc);
      // CC28 (section 9.2.5): capability-computed compatibility for the
      // whole library in one read. Best-effort - without it the browse
      // renders exactly as before, no chips, no filter.
      try {
        // eslint-disable-next-line global-require
        const { loadCapabilityResolveState } = require('../lib/capability/resolve');
        // eslint-disable-next-line global-require
        const { computeLibraryCompatibility } = require('../lib/capability/planCompat');
        const capState = user?.id ? await loadCapabilityResolveState(user.id, {}) : null;
        if (capState && !capState.empty && !capState.unavailable) {
          setCompatibility({ state: capState, byPlan: await computeLibraryCompatibility(capState) });
        } else {
          setCompatibility(null);
        }
      } catch (_) { setCompatibility(null); }
      // EL-12: session minutes + implements, best-effort - a read failure
      // just leaves the card without this line, browse is unaffected.
      try {
        const rows = await getLibraryPlanExerciseRows();
        setPlanStats(computeLibraryPlanStats(rows));
      } catch (_) { setPlanStats(new Map()); }
      setLoadError(false);
    } catch (e) {
      // FF-004: a real init/storage failure must not masquerade as an empty
      // library. Flag it so the list renders a retryable failure surface.
      // eslint-disable-next-line global-require
      try { require('../lib/errorLog').logWarn('PlanLibrary.load', e?.message ?? 'unknown'); } catch (_) {}
      setLoadError(true);
    } finally {
      setLoaded(true);
    }
  }

  // FF-004: retry a failed load.
  const handleRetry = useCallback(() => {
    setLoaded(false);
    setLoadError(false);
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function handleRefresh() {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }

  async function handleAddToMyPlans(plan) {
    if (!user?.id) {
      toast.show('Setting up your profile, try again in a second', { variant: 'info' });
      return;
    }
    if (addingRef.current) return;
    addingRef.current = true;
    // C4: one decision, one dialog. Both choices copy the plan; only what
    // happens after the copy differs, so each button owns its own copy call
    // and error handling (matches the copy-failure toast either way).
    //
    // The `fromFirstRun` variants that stood here (different alert body,
    // "Start training" instead of "Add and start this plan", a skipped
    // mid-block confirm, and a navigate to ProSetupComplete) were dead: no
    // caller anywhere passed the param, and the two onboarding stacks that
    // registered this screen never reached it. Removed under D95
    // (AUDIT-ROUTES 5.7); the surviving path is the one that always ran.
    // C5-P10-01 / C5-P10-08 (D96): "Make it active now" was the entire
    // explanation of activation. Nothing on any first-plan path said that
    // activating creates a six-week training block with a scheduled
    // recovery week, or what else changes. Both sentences are tier-blind
    // and shared with every other activation decision point.
    appAlert(
      'Add this plan?',
      `Copy "${planHeadingName(plan.name)}" into your plans. Make it active now, or just add it for later.`
      + `\n\n${BLOCK_START_SENTENCE} ${ACTIVATION_MEANING_SENTENCE}`,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => { addingRef.current = false; } },
        {
          text: 'Save for later',
          onPress: async () => {
            try {
              const copy = await copyPlanFromLibrary(plan.id, user.id);
              if (!copy?.id) throw new Error('Copy failed.');
              if (await surfaceConflicts(copy.id)) return;
              navigation.goBack();
            } catch (_e) {
              toast.show("Couldn't copy plan, try again", { variant: 'error' });
            } finally {
              addingRef.current = false;
            }
          },
        },
        {
          text: 'Add and start this plan',
          onPress: async () => {
            // RB-5 (D96, Review B): the try used to end after the copy, so
            // an activation throw rejected an async onPress with no
            // handler - no toast, no navigation, no active plan, and a
            // stray copied programme left behind. The whole path is now
            // wrapped, like every sibling activation path.
            try {
              const copy = await copyPlanFromLibrary(plan.id, user.id);
              if (!copy?.id) throw new Error('Copy failed.');
              const ok = await confirmPlanSwitchMidBlock(user.id, { newPlanName: planHeadingName(plan.name) });
              if (!ok) { navigation.goBack(); return; }
              await activatePlanWithBlock(user.id, copy.id, planHeadingName(plan.name));
              // C5-P10-05 (D96): activation used to end in a bare goBack(),
              // visually identical to "Save for later" -- a user who saw no
              // change tapped a second plan and silently replaced the block
              // created seconds earlier. Same confirmation shape every other
              // activation entry point uses.
              toast.show(`"${planHeadingName(plan.name)}" is now your active plan`, { variant: 'success' });
              if (await surfaceConflicts(copy.id)) return;
              navigation.goBack();
            } catch (_e) {
              toast.show("Couldn't set active plan, try again", { variant: 'error' });
            } finally {
              addingRef.current = false;
            }
          },
        },
      ],
    );
  }

  // Quiz handlers
  function openQuiz() {
    setQuizStep(0);
    setQuizAnswers({});
    setQuizResult(null);
    setQuizVisible(true);
  }

  function handleQuizOption(stepKey, optionKey) {
    const newAnswers = { ...quizAnswers, [stepKey]: optionKey };
    setQuizAnswers(newAnswers);
    if (quizStep < QUIZ_STEPS.length - 1) {
      setQuizStep(s => s + 1);
    } else {
      const result = getQuizRecommendation(newAnswers, plans);
      setQuizResult(result);
      setQuizStep(QUIZ_STEPS.length);
    }
  }

  function dismissQuiz() {
    setQuizVisible(false);
    setQuizStep(0);
    setQuizAnswers({});
    setQuizResult(null);
  }

  function handleQuizStartPlan() {
    setQuizVisible(false);
    if (quizResult) handleAddToMyPlans(quizResult);
  }

  function handleQuizBrowse() {
    setQuizVisible(false);
    setActiveCollection('all');
  }

  // Filter logic
  const queryLower = query.toLowerCase().trim();

  const filteredPlans = plans.filter(p => {
    if (queryLower) {
      return [p.name, p.description, p.tags].filter(Boolean).join(' ').toLowerCase().includes(queryLower);
    }
    if (activeCollection === 'division' && selectedDivision) {
      return hasTag(p, `division:${selectedDivision}`);
    }
    // CC28: computed, never tagged - a plan is in "Fits your limitations"
    // exactly when every one of its exercises passes the user's live
    // capability state (section 9.2.5).
    if (activeCollection === 'compatible') {
      return compatibility?.byPlan?.get(p.id)?.fullyCompatible === true;
    }
    return matchesCollection(p, activeCollection);
  });

  // The computed collection only exists while there is a state to compute
  // against; everyone else sees the browse exactly as before.
  const visibleCollections = compatibility
    ? COLLECTIONS
    : COLLECTIONS.filter(c => c.key !== 'compatible');

  // T5: default to beginner-appropriate plans first, outside the quiz path
  // only. `quizResult` is the same "quiz answered this session" signal
  // showQuizBanner already keys off below; once it is set, the quiz has
  // given its own specific pick, so we leave the list in the order the
  // filters above produced rather than layering a generic reorder on top of
  // a targeted recommendation. Existing filters/collections are untouched,
  // this only reorders whatever they already produced.
  const filtered = quizResult ? filteredPlans : sortBeginnerFirst(filteredPlans);

  const showQuizBanner = !queryLower && activeCollection === 'all' && !quizResult;
  const showDivisionGrid = !queryLower && activeCollection === 'division';

  // ─── Render ──────────────────────────────────────────────────────────────────


  /**
   * C9 closeout item 3. Returns true when a conflict sheet was opened, so
   * the caller holds the screen rather than navigating away from a
   * decision the user has not made yet.
   */
  async function surfaceConflicts(planId) {
    try {
      const block = await getActiveBlock(user.id).catch(() => null);
      const state = await loadExerciseIntentState(user.id, { activeMesocycleId: block?.id ?? null });
      const conflicts = await findPlanIntentConflicts(planId, state);
      if (!conflicts.length) return false;
      setConflictIntentState(state);
      setPlanConflicts({ planId, conflicts });
      return true;
    } catch (_) {
      // Never block the user's own plan choice on this.
      return false;
    }
  }

  async function handleConflictReplacement(conflict, picked) {
    // Replace it in THIS plan only. The global exclusion is untouched.
    try {
      if (conflict?.routineExerciseId && picked?.id) {
        await updateRoutineExerciseExercise(conflict.routineExerciseId, picked.id);
        // D112 R6 (closes audit T2-28b): install-time replacement is a real
        // swap and belongs in the same provenance log as every other one -
        // cause derives centrally (recordExerciseSwap re-checks capability
        // eligibility on the FROM exercise at write time), so a
        // preference-only conflict recorded here still gets cause NULL,
        // exactly as it should.
        if (conflict?.exerciseId && user?.id) {
          await recordExerciseSwap(user.id, conflict.exerciseId, picked.id, {
            routineId: conflict.routineId ?? null,
            explicit: true,
            scope: SWAP_SCOPE.PROGRAMME,
          }).catch(() => { /* best effort */ });
        }
      }
    } catch (_) { /* best effort */ }
  }

  return (
    <SafeAreaView style={[styles.safe, live.safe]} edges={['top', 'bottom']}>
      <BackHeader title="Plan library" />

      <View style={[styles.filterPanel, live.filterPanel]}>
        <SearchBar
          value={query}
          onChangeText={setQuery}
          placeholder="Search plans"
          style={styles.searchRow}
        />

        <FlatList
          horizontal
          data={visibleCollections}
          keyExtractor={c => c.key}
          showsHorizontalScrollIndicator={false}
          style={styles.chipsList}
          contentContainerStyle={styles.chipsContent}
          renderItem={({ item }) => {
            const active = activeCollection === item.key;
            return (
              <Chip
                label={item.label}
                icon={item.key === 'division' ? 'trophy-outline' : undefined}
                selected={active}
                onPress={() => {
                  setActiveCollection(item.key);
                  if (item.key !== 'division') setSelectedDivision(null);
                  listRef.current?.scrollToOffset({ offset: 0, animated: false });
                }}
                accessibilityRole="radio"
                accessibilityLabel={item.label}
                style={styles.collectionChip}
                labelStyle={[styles.collectionChipText, live.collectionChipText]}
                selectedLabelStyle={[styles.collectionChipTextActive, live.collectionChipTextActive]}
              />
            );
          }}
        />
      </View>

      {/* Division grid, shown when Division prep is selected */}
      {showDivisionGrid && (
        <DivisionGrid
          selectedDivision={selectedDivision}
          onSelectDivision={setSelectedDivision}
        />
      )}

      <View style={[styles.listBand, live.listBand]}>
        {/* Plans list */}
        <FlashList
        ref={listRef}
        data={filtered}
        keyExtractor={p => p.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={t.colors.primary} />}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.planSeparator} />}
        ListHeaderComponent={
          <>
            {/* Blueprint section 14: the library is where people choose a
                programme, so other lifters' programmes sit beside Volyume's.
                One row, into Community Discover focused on programmes. */}
            <Card
              style={styles.quizBanner}
              onPress={() => navigateCrossTab(navigation, 'HomeTab', 'Community', { segment: 'discover', focus: 'programmes' })}
              accessibilityLabel="Programmes from other lifters. Use as-is or refit them to your kit."
              accessibilityRole="button"
            >
              <View style={[styles.quizBannerIcon, live.quizBannerIcon]}>
                <Ionicons name="people-outline" size={20} color={t.colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.quizBannerTitle, live.quizBannerTitle]}>Programmes from other lifters</Text>
                <Text style={[styles.quizBannerBody, live.quizBannerBody]}>Use as-is or refit them to your kit.</Text>
              </View>
              <Ionicons name="chevron-forward" size={iconSize.sm} color={t.colors.textMuted} />
            </Card>
            {showQuizBanner ? (
            <Card
              style={styles.quizBanner}
              onPress={openQuiz}
              accessibilityLabel="Not sure where to start? Answer two quick questions for a plan suggestion"
            >
              <View style={[styles.quizBannerIcon, live.quizBannerIcon]}>
                <Ionicons name="help-circle-outline" size={20} color={t.colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.quizBannerTitle, live.quizBannerTitle]}>Not sure where to start?</Text>
                <Text style={[styles.quizBannerBody, live.quizBannerBody]}>Answer two quick questions and we'll point you to the right plan.</Text>
              </View>
              <Ionicons name="chevron-forward" size={iconSize.sm} color={t.colors.textMuted} />
            </Card>
            ) : null}
          </>
        }
        ListEmptyComponent={
          loadError ? (
            <View style={styles.listEmptyWrap}>
              <EmptyState
                icon="cloud-offline-outline"
                title="Couldn't load plans"
                text="Something went wrong loading the plan library."
                actionLabel="Try again"
                onAction={handleRetry}
              />
            </View>
          ) : !loaded ? (
            <View style={styles.skeletonWrap}>
              <SkeletonCard height={96} />
              <SkeletonCard height={96} />
              <SkeletonCard height={96} />
            </View>
          ) : (
            <View style={styles.listEmptyWrap}>
              <EmptyState
                icon="library-outline"
                title="No plans found"
                text={queryLower
                  ? 'Try a different search term.'
                  : activeCollection === 'division' && selectedDivision
                    ? 'No plans for this division yet.'
                    : 'No plans match this filter yet.'}
              />
            </View>
          )
        }
        renderItem={({ item: plan }) => {
          const division = getDivisionForPlan(plan);
          const isFeatured = hasTag(plan, 'featured');
          const isWomen = hasTag(plan, 'gender:women');
          const isMen = hasTag(plan, 'gender:men');
          const wc = workoutCounts[plan.id];
          // C5-P10-02 (D96): days per week was never stated in the library.
          // The card's meta line is a workout count, and planHeadingName
          // strips the "3×/Week" suffix the seed name carries, so the one
          // place the frequency appeared was removed for display. The
          // days:N tag and getPlanDays() already exist; this renders them
          // in the wording FreeStarter already ships.
          const days = getPlanDays(plan);
          const equipmentLabel = planEquipmentLabel(plan);
          // EL-12: the style badge (Kettlebell/Circuit) and the honest,
          // exercise-derived session length. equipmentLabel above (tag-
          // derived) already names the implements a style plan needs -
          // every kettlebell/circuit template's equipment:* tag matches
          // its content exactly, so a second "implements" line would only
          // repeat it.
          const styleKey = styleKeyFromTags(plan.tags);
          const styleLabel = styleKey ? styleLabelFor(styleKey) : null;
          const sessionMinutes = planStats.get(plan.id)?.minutes ?? null;

          return (
            <Card padding="none" style={styles.planCard}>
              <TouchableOpacity
                style={styles.planCardMain}
                onPress={() => navigation.navigate('PlanDetail', { planId: plan.id, isLibrary: true })}
                activeOpacity={0.88}
                accessibilityRole="button"
                accessibilityLabel={[
                  planHeadingName(plan.name),
                  styleLabel ? `${styleLabel} style` : null,
                  plan.difficulty != null ? (DIFFICULTY_LABELS[plan.difficulty] ?? 'Intermediate') : null,
                  equipmentLabel,
                  days != null ? `${days} days a week` : null,
                  wc ? `${wc} workout${wc !== 1 ? 's' : ''}` : null,
                  sessionMinutes != null ? `around ${sessionMinutes} minutes a session` : null,
                ].filter(Boolean).join(', ')}
                accessibilityHint="Opens plan preview"
              >
                {/* Top row: badges */}
                <View style={styles.planCardTopRow}>
                  <View style={styles.badgeRow}>
                    {/* CC28: the computed compatibility chip. Shown only
                        with active constraints; conflicts render as an
                        honest count, never hidden. */}
                    {compatibility?.byPlan?.get(plan.id)?.fullyCompatible === true && (
                      <PlanBadge label="Fits your limitations" />
                    )}
                    {compatibility && compatibility.byPlan?.get(plan.id)
                      && !compatibility.byPlan.get(plan.id).fullyCompatible && (
                      <PlanBadge label={`${compatibility.byPlan.get(plan.id).conflicts.length + compatibility.byPlan.get(plan.id).unknowns.length} to swap`} />
                    )}
                    {isFeatured && <PlanBadge label="Featured" amber />}
                    {/* EL-12: style badge (Kettlebell/Circuit), same slot
                        as a division badge - a plan never carries both. */}
                    {styleLabel && <PlanBadge label={styleLabel.charAt(0).toUpperCase() + styleLabel.slice(1)} />}
                    {division && <PlanBadge label={division.label} />}
                    {!division && isWomen && <PlanBadge label="For women" />}
                    {!division && isMen && <PlanBadge label="For men" />}
                    {plan.difficulty != null && (
                      <PlanBadge label={DIFFICULTY_LABELS[plan.difficulty] ?? 'Intermediate'} />
                    )}
                    {/* C5-P10-04 (D96): what you need to run this plan,
                        answered before adding it rather than after. */}
                    <PlanBadge label={equipmentLabel} />
                  </View>
                  {wc || days != null || sessionMinutes != null ? (
                    <Text style={[styles.workoutCount, live.workoutCount]}>
                      {days != null ? `${days} days a week` : ''}
                      {days != null && wc ? ' · ' : ''}
                      {wc ? `${wc} workout${wc !== 1 ? 's' : ''}` : ''}
                      {(days != null || wc) && sessionMinutes != null ? ' · ' : ''}
                      {sessionMinutes != null ? `~${sessionMinutes} min` : ''}
                    </Text>
                  ) : null}
                </View>

                {/* D4 (pre-release sweep 2026-07-27, LANE D, ruling SPLIT): cap the
                    Plan Library CARD at two lines so cards keep a uniform
                    rhythm in the grid. The Plan Detail heading is a page
                    title and stays uncapped, that ruling is deliberately
                    NOT mirrored there. */}
                <Text style={[styles.planName, live.planName]} numberOfLines={2}>{planHeadingName(plan.name)}</Text>

                {plan.description ? (
                  <Text style={[styles.planDesc, live.planDesc]} numberOfLines={2}>{plan.description}</Text>
                ) : null}
              </TouchableOpacity>

              <View style={[styles.planCardFooter, live.planCardFooter]}>
                <Button
                  title="Preview plan"
                  variant="secondary"
                  size="sm"
                  onPress={() => navigation.navigate('PlanDetail', { planId: plan.id, isLibrary: true })}
                  style={[styles.previewBtn, live.previewBtn]}
                  textStyle={[styles.previewText, live.previewText]}
                  accessibilityLabel={`Preview ${planHeadingName(plan.name)}`}
                />
                <Button
                  testID="volyume-btn-copy-from-library"
                  title="Add to my plans"
                  size="sm"
                  onPress={() => handleAddToMyPlans(plan)}
                  style={[styles.addBtn, live.addBtn]}
                  textStyle={[styles.addBtnText, live.addBtnText]}
                  accessibilityLabel={`Add ${planHeadingName(plan.name)} to my plans`}
                />
              </View>
            </Card>
          );
        }}
        />
      </View>

      {/* Quiz modal.
          D36a (item 17 modal tails, 2026-07-10): migrated off a hand-rolled
          Modal onto the shared BottomSheet chrome. Fixes a genuine inset bug
          (quizSheet's paddingBottom was a fixed token with no safe-area
          inset) alongside the migration; BottomSheet now owns the backdrop,
          drag handle and bottom-inset padding. */}
      <BottomSheet visible={quizVisible} onClose={dismissQuiz} accessibilityLabel="Plan quiz">
            {quizStep < QUIZ_STEPS.length ? (
              // Question step
              <>
                <View
                  style={styles.quizProgress}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                >
                  {QUIZ_STEPS.map((_, i) => (
                    <View
                      key={i}
                      style={[styles.quizDot, live.quizDot, i <= quizStep && [styles.quizDotActive, live.quizDotActive]]}
                    />
                  ))}
                </View>
                <Text style={[styles.quizQuestion, live.quizQuestion]}>{QUIZ_STEPS[quizStep].question}</Text>
                <View style={styles.quizOptions}>
                  {QUIZ_STEPS[quizStep].options.map(opt => (
                    <Card
                      key={opt.key}
                      surface="surface2"
                      radius="md"
                      padding="md"
                      style={styles.quizOptionBtn}
                      onPress={() => handleQuizOption(QUIZ_STEPS[quizStep].key, opt.key)}
                      accessibilityLabel={opt.label}
                    >
                      {opt.icon && (
                        <Ionicons name={opt.icon} size={20} color={t.colors.primary} style={{ marginRight: spacing.md }} />
                      )}
                      <Text style={[styles.quizOptionText, live.quizOptionText]}>{opt.label}</Text>
                      <Ionicons name="chevron-forward" size={iconSize.sm} color={t.colors.textMuted} />
                    </Card>
                  ))}
                </View>
                <TouchableOpacity style={styles.quizSkip} onPress={dismissQuiz} accessibilityRole="button">
                  <Text style={[styles.quizSkipText, live.quizSkipText]}>Skip and browse all plans</Text>
                </TouchableOpacity>
              </>
            ) : quizResult ? (
              // Result step
              <>
                <View style={styles.quizResultIcon}>
                  <Ionicons name="checkmark-circle" size={32} color={t.colors.primary} />
                </View>
                <Text style={[styles.quizResultTitle, live.quizResultTitle]}>Here's our suggestion</Text>
                <Card surface="surface2" style={styles.quizResultCard}>
                  <Text style={[styles.quizResultName, live.quizResultName]}>{quizResult.name}</Text>
                  {quizResult.description ? (
                    <Text style={[styles.quizResultDesc, live.quizResultDesc]} numberOfLines={3}>{quizResult.description}</Text>
                  ) : null}
                  {/* C5-P10-02/04 (D96): the suggestion states what it asks
                      of you (equipment, days a week) before "Add this plan". */}
                  <Text style={[styles.quizResultMeta, live.quizResultMeta]}>
                    {[
                      quizResult.difficulty != null
                        ? (DIFFICULTY_LABELS[quizResult.difficulty] ?? 'Intermediate')
                        : null,
                      planEquipmentLabel(quizResult),
                      getPlanDays(quizResult) != null ? `${getPlanDays(quizResult)} days a week` : null,
                      workoutCounts[quizResult.id] ? `${workoutCounts[quizResult.id]} workouts` : null,
                    ].filter(Boolean).join(' · ')}
                  </Text>
                </Card>
                <Button
                  title="Add this plan"
                  onPress={handleQuizStartPlan}
                  style={[styles.quizStartBtn, live.quizStartBtn]}
                  textStyle={[styles.quizStartText, live.quizStartText]}
                  accessibilityLabel={`Add ${quizResult.name}`}
                />
                <Button
                  title="Preview first"
                  variant="secondary"
                  onPress={() => { dismissQuiz(); navigation.navigate('PlanDetail', { planId: quizResult.id, isLibrary: true }); }}
                  style={[styles.quizBrowseBtn, live.quizBrowseBtn]}
                  textStyle={[styles.quizBrowseText, live.quizBrowseText]}
                  accessibilityLabel={`Preview ${quizResult.name}`}
                />
                <TouchableOpacity style={styles.quizSkip} onPress={handleQuizBrowse} accessibilityRole="button">
                  <Text style={[styles.quizSkipText, live.quizSkipText]}>Browse all plans instead</Text>
                </TouchableOpacity>
              </>
            ) : (
              // No result
              <>
                <Text style={[styles.quizResultTitle, live.quizResultTitle]}>No exact match found</Text>
                <Text style={[styles.quizResultDesc, live.quizResultDesc]}>Browse all the plans below to find one that suits you.</Text>
                <Button
                  title="Browse all plans"
                  onPress={handleQuizBrowse}
                  style={[styles.quizStartBtn, live.quizStartBtn]}
                  textStyle={[styles.quizStartText, live.quizStartText]}
                />
              </>
            )}
      </BottomSheet>
    <ExerciseConflictSheet
        visible={!!planConflicts}
        mode="plan"
        conflicts={planConflicts?.conflicts ?? []}
        userId={user?.id ?? null}
        intentState={conflictIntentState}
        onChooseReplacement={handleConflictReplacement}
        onKeep={() => { /* explicit exception for this plan only; the global exclusion stands */ }}
        onDone={() => { setPlanConflicts(null); navigation.goBack(); }}
        onClose={() => { setPlanConflicts(null); navigation.goBack(); }}
      />
          </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },

  filterPanel: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxs,
    paddingBottom: spacing.xs,
    gap: spacing.xxs,
  },
  searchRow: {
    margin: 0,
  },

  chipsList: { minHeight: 40, maxHeight: 42, flexShrink: 0 },
  chipsContent: {
    paddingVertical: spacing.xxs,
    gap: spacing.sm, alignItems: 'center',
  },
  collectionChip: { minHeight: 36, justifyContent: 'center', paddingVertical: spacing.xxs },
  collectionChipText: { ...type.label, color: colors.textSecondary },
  collectionChipTextActive: { color: colors.primary, fontFamily: fontFamily.bold, fontWeight: fontWeight.bold },

  // Division grid
  divisionSection: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xs,
    borderBottomWidth: 1, borderBottomColor: colors.borderSubtle,
  },
  divisionGroupLabel: {
    fontSize: fontSize.xs, fontFamily: fontFamily.semibold, fontWeight: fontWeight.semibold,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  divisionIntroDesc: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    lineHeight: 18,
    marginBottom: spacing.md,
  },
  divisionChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  divisionChip: {
    paddingHorizontal: spacing.md, paddingVertical: 6,
  },
  divisionChipText: { fontSize: fontSize.xs, color: colors.textSecondary, fontFamily: fontFamily.medium, fontWeight: fontWeight.medium },
  divisionChipTextActive: { color: colors.primary, fontFamily: fontFamily.bold, fontWeight: fontWeight.bold },
  // Card owns background/radius/padding/border here.
  divisionDesc: {
    marginTop: spacing.md,
  },
  divisionDescText: { ...type.bodySm, color: colors.textSecondary },

  // Plan list
  listBand: { flex: 1, backgroundColor: colors.background },
  listContent: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xl },
  listEmptyWrap: {
    minHeight: 340,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  planSeparator: { height: spacing.sm },

  // Quiz banner. Card owns background/radius/padding/border here.
  quizBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    marginBottom: spacing.md,
  },
  quizBannerIcon: {
    width: 40, height: 40, borderRadius: radius.xl,
    backgroundColor: colors.primaryBg, alignItems: 'center', justifyContent: 'center',
  },
  quizBannerTitle: { fontSize: fontSize.sm, fontFamily: fontFamily.bold, fontWeight: fontWeight.bold, color: colors.textPrimary },
  quizBannerBody: { ...type.caption, color: colors.textMuted, marginTop: spacing.xxs },

  // Plan card. Card owns background/radius/border; overflow clips the
  // footer's top border to the rounded corner.
  planCard: {
    overflow: 'hidden',
  },
  planCardMain: { padding: spacing.md, gap: spacing.sm },
  planCardTopRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  badgeRow: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap', flex: 1 },
  badge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface2, borderRadius: radius.sm,
    paddingHorizontal: 6, paddingVertical: spacing.xxs,
    borderWidth: 1, borderColor: colors.border,
  },
  badgeAmber: { backgroundColor: colors.surface2, borderColor: withAlpha(colors.primary, alpha.edge) },
  badgeText: { fontSize: fontSize.micro, color: colors.textMuted, fontFamily: fontFamily.semibold, fontWeight: fontWeight.semibold },
  badgeTextAmber: { color: colors.primary },
  workoutCount: { ...type.caption, color: colors.textMuted, marginLeft: spacing.sm },
  planName: { ...type.bodyStrong, color: colors.textPrimary },
  planDesc: { ...type.bodySm, color: colors.textSecondary },
  planCardFooter: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    borderTopWidth: 1, borderTopColor: colors.border,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  previewText: { ...type.label, color: colors.textSecondary },
  previewBtn: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    backgroundColor: colors.surface2,
  },
  addBtn: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
  },
  addBtnText: { ...type.label, color: colors.textPrimary },

  skeletonWrap: { gap: spacing.md },

  // Quiz modal. BottomSheet supplies the backdrop, panel chrome and drag
  // handle now (D36a migration) -- only the content-level styles remain.
  quizProgress: {
    flexDirection: 'row', gap: spacing.sm, alignSelf: 'center',
    marginBottom: spacing.xs,
  },
  quizDot: {
    width: 8, height: 8, borderRadius: circle(8),
    backgroundColor: colors.border,
  },
  quizDotActive: { backgroundColor: colors.primary },
  quizQuestion: {
    fontSize: fontSize.lg, fontFamily: fontFamily.heavy, fontWeight: fontWeight.black,
    color: colors.textPrimary, textAlign: 'center',
    marginBottom: spacing.xs,
  },
  quizOptions: { gap: spacing.sm },
  // Card owns background/radius/padding/border here.
  quizOptionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
  },
  quizOptionText: { flex: 1, fontSize: fontSize.md, color: colors.textPrimary, fontFamily: fontFamily.medium, fontWeight: fontWeight.medium },
  quizSkip: { alignSelf: 'center', paddingVertical: spacing.sm },
  quizSkipText: { fontSize: fontSize.sm, color: colors.textMuted },

  // Quiz result
  quizResultIcon: { alignSelf: 'center', marginBottom: spacing.xs },
  quizResultTitle: {
    fontSize: fontSize.xl, fontFamily: fontFamily.heavy, fontWeight: fontWeight.black,
    color: colors.textPrimary, textAlign: 'center',
  },
  // Card owns background/radius/padding/border here.
  quizResultCard: {
    gap: spacing.sm,
  },
  quizResultName: { ...type.bodyStrong, color: colors.textPrimary },
  quizResultDesc: { ...type.bodySm, color: colors.textSecondary },
  quizResultMeta: { ...type.caption, color: colors.textMuted },
  quizStartBtn: {
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg,
    paddingVertical: spacing.md, alignItems: 'center',
  },
  quizStartText: { ...type.bodyStrong, color: colors.textPrimary },
  quizBrowseBtn: {
    backgroundColor: colors.surface2, borderRadius: radius.lg,
    paddingVertical: spacing.md, alignItems: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  quizBrowseText: { fontSize: fontSize.md, fontFamily: fontFamily.medium, fontWeight: fontWeight.medium, color: colors.textPrimary },
});

// CP-10 batch G (2026-07-11): the frozen `styles` block above stays byte-
// identical. This mirrors ONLY the colour/fontSize/type-bearing sub-
// properties of the matching frozen style, at identical rest values, so the
// screen (and its sibling PlanBadge/DivisionGrid components) carries no
// static island under a live theme toggle. Pure layout keys (flex/gap/
// padding/width/borderWidth, no token) are correctly omitted -- there is
// nothing to unfreeze for them. Same pattern as WorkoutSummaryScreen.js's
// buildLiveStyles.
function buildLiveStyles(t) {
  return {
    safe: { backgroundColor: t.colors.background },
    filterPanel: { backgroundColor: t.colors.surface, borderBottomColor: t.colors.borderSubtle },
    collectionChipText: { ...t.type.label, color: t.colors.textSecondary },
    collectionChipTextActive: { color: t.colors.primary },
    divisionSection: { backgroundColor: t.colors.surface, borderBottomColor: t.colors.borderSubtle },
    divisionGroupLabel: { fontSize: t.fontSize.xs, color: t.colors.textMuted },
    divisionIntroDesc: { fontSize: t.fontSize.xs, color: t.colors.textMuted },
    divisionChipText: { fontSize: t.fontSize.xs, color: t.colors.textSecondary },
    divisionChipTextActive: { color: t.colors.primary },
    divisionDescText: { ...t.type.bodySm, color: t.colors.textSecondary },
    listBand: { backgroundColor: t.colors.background },
    quizBannerIcon: { backgroundColor: t.colors.primaryBg },
    quizBannerTitle: { fontSize: t.fontSize.sm, color: t.colors.textPrimary },
    quizBannerBody: { ...t.type.caption, color: t.colors.textMuted },
    badge: { backgroundColor: t.colors.surface2, borderColor: t.colors.border },
    badgeAmber: { backgroundColor: t.colors.surface2, borderColor: withAlpha(t.colors.primary, alpha.edge) },
    badgeText: { fontSize: t.fontSize.micro, color: t.colors.textMuted },
    badgeTextAmber: { color: t.colors.primary },
    workoutCount: { ...t.type.caption, color: t.colors.textMuted },
    planName: { ...t.type.bodyStrong, color: t.colors.textPrimary },
    planDesc: { ...t.type.bodySm, color: t.colors.textSecondary },
    planCardFooter: { borderTopColor: t.colors.border },
    previewText: { ...t.type.label, color: t.colors.textSecondary },
    previewBtn: { backgroundColor: t.colors.surface2 },
    addBtn: { backgroundColor: t.colors.surface2, borderColor: t.colors.border },
    addBtnText: { ...t.type.label, color: t.colors.textPrimary },
    quizDot: { backgroundColor: t.colors.border },
    quizDotActive: { backgroundColor: t.colors.primary },
    quizQuestion: { fontSize: t.fontSize.lg, color: t.colors.textPrimary },
    quizOptionText: { fontSize: t.fontSize.md, color: t.colors.textPrimary },
    quizSkipText: { fontSize: t.fontSize.sm, color: t.colors.textMuted },
    quizResultTitle: { fontSize: t.fontSize.xl, color: t.colors.textPrimary },
    quizResultName: { ...t.type.bodyStrong, color: t.colors.textPrimary },
    quizResultDesc: { ...t.type.bodySm, color: t.colors.textSecondary },
    quizResultMeta: { ...t.type.caption, color: t.colors.textMuted },
    quizStartBtn: { backgroundColor: t.colors.surface2, borderColor: t.colors.border },
    quizStartText: { ...t.type.bodyStrong, color: t.colors.textPrimary },
    quizBrowseBtn: { backgroundColor: t.colors.surface2, borderColor: t.colors.border },
    quizBrowseText: { fontSize: t.fontSize.md, color: t.colors.textPrimary },
  };
}
