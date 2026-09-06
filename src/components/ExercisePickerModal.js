import { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, Modal,
  TouchableOpacity, ScrollView, AccessibilityInfo,
} from 'react-native';
// Campaign item 14 (D25): react-native-keyboard-controller outside sheets
// (this is a plain RN Modal, not a gorhom BottomSheet). Used only for the
// inline "New exercise" create form below — the horizontal filter-chip
// ScrollViews further down have no text inputs and are left as core
// ScrollView.
import { KeyboardAwareScrollView, KeyboardGestureArea } from 'react-native-keyboard-controller';
// E8 perf: the full library is ~920 rows with no render cap; FlashList
// recycles rows instead of mounting them all (audit/perf-baseline.md section 2).
import { FlashList } from '@shopify/flash-list';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, fontWeight, spacing, radius, type, fontFamily } from '../styles/theme';
import useTheme from '../hooks/useTheme';
import { MUSCLE_DISPLAY_NAMES } from '../lib/algorithms';
import { getAllExercises, insertExercise, getRecentlyUsedExerciseIds, getExerciseUsageStats, getActiveBlock, clearExerciseIntent } from '../lib/database';
import { loadExerciseIntentState, isEligible, intentFor, isFamilyBlocked, movementFamilyOf, isEligibleExercise } from '../lib/exercise/intent';
// CC27 (sections 9.2.6, 9.4, 8.4): the picker asks the capability lane's
// pure questions, offers the manual-conflict flows, and hosts the
// single-axis ask on custom creation. Storage writes go through the
// capability store (allowances) - the same door every capability write uses.
import { capabilityBlockReason, demandConflicts, CAPABILITY_BLOCK } from '../lib/capability/resolve';
import { demandLabel, CONSTRAINT_SOURCE } from '../lib/capability/model';
import { rulePhrase, sidedUnionShape } from '../lib/capability/phrase';
import { familyLabel } from '../lib/exercise/movementFamily';
// Red-team finding 1 (bundle): the capability-unavailable notice is shown
// only to users who actually turned the feature on, so everyone else never
// sees noise about a lane they do not use.
import { getLocalCapabilityConsent } from '../lib/consent/capabilityConsent';
import { appAlert } from './AppAlert';
import { matchesEquipmentFilter, matchesMuscleFilter, PICKER_EQUIPMENT_CHIPS } from '../lib/exerciseDisplay';
// CC27 (section 34.1): custom creation derives equipment metadata from the
// owner's own choices so customs can meet the built-in pool-entry bar.
import { deriveExerciseMetadata } from '../lib/exerciseMetadata';
import { fuzzySearch, findCanonicalNameMatch } from '../lib/exerciseFuzzySearch';
import { tierRank } from '../lib/exercise/canonicality';
import { buildRecentAndFrequentIds, buildEmptyQuerySections, flattenSectionsForList } from '../lib/exercisePickerSections';
import useAppStore from '../store/useAppStore';
import * as haptics from '../lib/haptics';
import Chip from './Chip';
import SearchBar from './SearchBar';
import SectionLabel from './SectionLabel';
import TextField from './TextField';
import { useToast } from './Toast';

// Shared exercise picker: search the library and, when the exercise you want
// isn't there, create it inline as a custom exercise. Lifted out of
// ManualBuilder so the same browse-and-create flow is available everywhere an
// exercise is chosen (plan building, plan editing, in-workout swap). Custom
// exercises are written with isCustom:1 into the exercises table, the same
// path ManualBuilder already shipped, so getAllExercises() surfaces them and
// the existing syncExercises push covers them.
const PICKER_MUSCLES = Object.keys(MUSCLE_DISPLAY_NAMES);
// F-09 (certification 2026-09-05): Kettlebell joins the chip row. The
// corpus carries a full kettlebell family and five kettlebell library
// plans, and matchesEquipmentFilter already handled the label; the picker
// simply never offered it.
// Certification 2026-09-06: the list itself moved to exerciseDisplay.js,
// beside the filter that resolves each label, and gained Landmine,
// Suspension and Other so every equipment family in the corpus has a chip.
const PICKER_EQUIPMENT = PICKER_EQUIPMENT_CHIPS;

// L07-F8: the exercise TYPE axis a custom exercise can pick, matching the
// existing exercise_type CHECK constraint (supabase/migrate_091_exercise_type.sql,
// database.js exercise_type migration) so a custom exercise renders the same
// set-input schema (SetEntry.js) and joins the same duration/distance volume
// exclusions as a seeded library exercise. Defaulting to weight_reps keeps
// every exercise that never touches this row byte-identical to before.
const EXERCISE_TYPE_OPTIONS = [
  { key: 'weight_reps', label: 'Weight & reps' },
  { key: 'weighted_bodyweight', label: 'Bodyweight + added weight' },
  { key: 'reps_only', label: 'Reps only' },
  { key: 'duration', label: 'Time' },
  { key: 'distance', label: 'Distance & time' },
];

// D107-2 load semantics (LOAD-SEMANTICS-SPEC): what the entered weight
// number MEANS. Drives the logger's field label ("per hand" / "Assistance")
// and the tonnage/PR calculations in algorithms.js. Neutral copy only -
// "Assistance", never anything body-referencing.
const LOAD_SEMANTICS_OPTIONS = [
  { key: 'total', label: 'Total weight' },
  { key: 'per_hand', label: 'Per hand' },
  { key: 'assisted', label: 'Assistance' },
  { key: 'added_bodyweight', label: 'Added weight' },
];

// CC27 (section 8.4): the single-axis ask specs. Each entry is ONE
// optional question, rendered only when the user has an active demand
// constraint on that axis. Answers write the exercise's own demand
// columns; skipping stays NULL (unknown, honest).
const DEMAND_ASK_SPECS = {
  standing: { field: 'position', label: 'How is this performed?', options: [
    { key: 'standing', label: 'Standing' }, { key: 'seated', label: 'Seated' },
    { key: 'lying', label: 'Lying' }, { key: 'kneeling', label: 'Kneeling' },
    { key: 'mixed', label: 'Mixed' }] },
  floor_access: { field: 'floorAccess', label: 'Does it involve getting to or from the floor?', options: [
    { key: true, label: 'Yes' }, { key: false, label: 'No' }] },
  overhead_position: { field: 'overheadPosition', label: 'Does it involve reaching overhead?', options: [
    { key: true, label: 'Yes' }, { key: false, label: 'No' }] },
  grip_bar: { field: 'gripDemand', label: 'What kind of grip does it need?', options: [
    { key: 'none', label: 'No grip needed' }, { key: 'supportive', label: 'Light hold' },
    { key: 'bar', label: 'Firm grip' }] },
  bilateral_upper: { field: 'bilateralUpper', label: 'Does it need both arms?', options: [
    { key: true, label: 'Yes' }, { key: false, label: 'No' }] },
  bilateral_lower: { field: 'bilateralLower', label: 'Does it need both legs?', options: [
    { key: true, label: 'Yes' }, { key: false, label: 'No' }] },
  axial_load: { field: 'axialLoad', label: 'Does it load the spine?', options: [
    { key: true, label: 'Yes' }, { key: false, label: 'No' }] },
  impact: { field: 'impact', label: 'Does it involve jumping or impact?', options: [
    { key: true, label: 'Yes' }, { key: false, label: 'No' }] },
  balance_high: { field: 'balanceDemand', label: 'How balanced does it need you to be?', options: [
    { key: 'supported', label: 'Supported' }, { key: 'stable', label: 'Free-standing' },
    { key: 'high', label: 'Single-leg or unstable' }] },
  weight_bearing_hands: { field: 'weightBearingHands', label: 'Does it take weight through flat hands, like a push-up?', options: [
    { key: true, label: 'Yes' }, { key: false, label: 'No' }] },
};

// CC27 (CAP-18): one grouped, mechanical description of why an exercise
// sits outside how the user trains. Names the axis/rule and nothing else -
// no advice, no safety claim, no diagnosis language.
function describeCapabilityConflict(capabilityState, exercise, reason) {
  const conflicts = demandConflicts(capabilityState, exercise);
  if (reason === CAPABILITY_BLOCK.CLINICIAN) {
    // Natural coach-language order (2026-08-21): name the movement the
    // clinician-reported rule covers; an exercise-level rule has no name
    // to add beyond the row itself.
    const clin = conflicts.find(c => c.source === CONSTRAINT_SOURCE.CLINICIAN_REPORTED && !c.unknown);
    const named = clin ? rulePhrase(clin) : null;
    if (named) return `You told Volyume a clinician asked you to keep ${named} out`;
    // F5 (source outranks certainty): an UNKNOWN clinician conflict now
    // ranks here rather than falling to the add-anyway flow - and the
    // copy states BOTH facts honestly: the rule, and that the app does
    // not know whether this movement involves it.
    const clinUnknown = conflicts.find(c => c.source === CONSTRAINT_SOURCE.CLINICIAN_REPORTED && c.unknown);
    if (clinUnknown) {
      const label = demandLabel(clinUnknown.ruleValue).toLowerCase();
      return `You told Volyume a clinician asked you to keep ${label} out, and Volyume doesn't know yet whether this involves it`;
    }
    return 'You told Volyume a clinician asked for this one to stay out';
  }
  if (reason === CAPABILITY_BLOCK.UNKNOWN) {
    const axis = conflicts.find(c => c.unknown)?.ruleValue;
    const label = axis ? demandLabel(axis).toLowerCase() : 'this';
    return `Volyume doesn't know yet whether this involves ${label}`;
  }
  const first = conflicts.find(c => !c.unknown);
  if (first?.ruleKind === 'demand') {
    // A sided rule says which side it is about, so the reason is never
    // vaguer than what the user actually told Volyume. Round 8 (R8-4):
    // branched on the movement fact and the rule union, because under
    // the round-7 union a sided conflict on a ONE-SIDE-LOADABLE
    // movement is reachable exactly when its axis no longer carves -
    // and the old single sentence then stated a wrong mechanical fact
    // ("cannot be done a side at a time" about a movement that can)
    // while naming only one of the user's two rules.
    const sided = rulePhrase(first);
    if (first.laterality && sided) {
      const oneSideLoadable = exercise?.unilateralLoadable === true || exercise?.unilateralLoadable === 1;
      if (!oneSideLoadable) {
        return `You've said ${sided} does not work, and this one cannot be done a side at a time`;
      }
      // One-side-loadable yet still definitely conflicted: the axis no
      // longer carves. Both sides restricted names both facts; a sided
      // rule beside an unsided one falls to the unsided wording, which
      // already covers the whole axis. Round 16 (R16-3): the union
      // question moved to sidedUnionShape so this surface and the
      // in-session named line consume ONE answer - the inline scan here
      // is how the law stayed picker-only for eight rounds.
      const shape = sidedUnionShape(first, capabilityState);
      const base = rulePhrase({ ...first, laterality: null });
      if (shape === 'both_sides' && base) return `You've said ${base} does not work on either side`;
    }
    return `Involves ${demandLabel(first.ruleValue).toLowerCase()}, which you keep out under Injuries & limitations`;
  }
  // CC33 D112 R6 (closes audit T2-33/T1-19): the capability lane never
  // borrows the preference lane's "set aside" (RoutineDetailScreen's own
  // exclusion copy owns that verb). Every branch here names how the user
  // trains, not what they set aside.
  if (first?.ruleKind === 'family') return `Involves ${familyLabel(first.ruleValue)}, which you keep out under Injuries & limitations`;
  return 'You keep this movement out under Injuries & limitations.';
}

// saveLabel / actionLabel are aliases for the create-form's save button text
// (RoutineDetail/ManualBuilder pass saveLabel, ActiveWorkout passes
// actionLabel). Either works; saveLabel wins if both are given.
//
// EL-20 (docs/exercise-library-expansion-2026-09-05/05-DECISIONS.md):
// `planExercises` is an OPTIONAL array of the exercises already in the
// plan/routine currently being built, passed by callers that have it
// cheaply on hand (RoutineDetailScreen, ManualBuilderScreen). Only used to
// promote "In your plan" ahead of "Staples" for an empty query; a caller
// that omits it simply gets no such section, everything else unchanged.
export default function ExercisePickerModal({
  visible, onClose, onSelect, saveLabel, actionLabel, planExercises,
}) {
  const toast = useToast();
  const userId = useAppStore(s => s.user?.id);
  const reduceMotion = useAppStore(s => s.accessibility?.reduceMotion);
  // CP-10 stage 3 (theming batch 2): live theme, same append-after pattern
  // as batch 1. `styles` stays frozen; `live` carries the colour/fontSize/
  // type-bearing keys only.
  const t = useTheme();
  const live = {
    pickerSafe: { backgroundColor: t.colors.background },
    pickerHeader: { borderBottomColor: t.colors.borderSubtle },
    pickerClose: { backgroundColor: t.colors.surface, borderColor: t.colors.borderSubtle },
    pickerExName: { ...t.type.label, color: t.colors.textPrimary },
    pickerMuscle: { ...t.type.caption, color: t.colors.textMuted },
    pickerSetAside: { ...t.type.caption, color: t.colors.textMuted },
    pickerAllowAgain: { ...t.type.caption, color: t.colors.primary },
    showExcludedText: { ...t.type.caption, color: t.colors.textMuted },
    constraintsUnavailableText: { ...t.type.caption, color: t.colors.textMuted },
    existingMatchText: { ...t.type.caption, color: t.colors.textMuted },
    existingMatchName: { ...t.type.captionStrong, color: t.colors.primary },
    pickerEmptyText: { ...t.type.body, color: t.colors.textMuted },
    separator: { backgroundColor: t.colors.borderSubtle },
    createNewBtn: { backgroundColor: t.colors.surface, borderColor: t.colors.borderSubtle },
    createNewBtnText: { ...t.type.label, color: t.colors.textPrimary },
    createTitle: { ...t.type.title, color: t.colors.textPrimary },
    createNameInputText: { ...t.type.bodyStrong },
    createLabel: { ...t.type.captionStrong, color: t.colors.textMuted },
    filterChipText: { ...t.type.label, color: t.colors.textSecondary },
    filterChipTextActive: { color: t.colors.primary },
    createSaveBtn: { backgroundColor: t.colors.surface2, borderColor: t.colors.border },
    createSaveBtnText: { ...t.type.label, color: t.colors.textPrimary },
  };
  const buttonLabel = saveLabel || actionLabel || 'Add exercise';
  const isSwapAction = buttonLabel.toLowerCase().includes('swap');
  const showBrowseFilters = !isSwapAction;
  const [query, setQuery] = useState('');
  const [muscleFilter, setMuscleFilter] = useState('');
  const [equipmentFilter, setEquipmentFilter] = useState('');
  const [allExercises, setAll] = useState([]);
  const [recentIds, setRecentIds] = useState([]);
  // EL-20: per-exercise completed-session counts ({exerciseId, sessions,
  // lastTrainedMs}), for exercises trained OFTEN but not necessarily in
  // the last 8 (getRecentlyUsedExerciseIds' own limit) -- e.g. a staple
  // lifted every week is "frequent" even on a week it wasn't the very
  // last thing logged. Merged with recentIds for the empty-query "Recent"
  // section below; recency still wins the ordering (see
  // recentAndFrequentItems).
  const [usageStats, setUsageStats] = useState([]);
  // C9: the user's exercise intent, and whether they have asked to see
  // what they have set aside.
  const [intentState, setIntentState] = useState(null);
  const [showExcluded, setShowExcluded] = useState(false);
  // D109-2 fail direction: true only when the intent read genuinely FAILED
  // (getActiveBlock rejected), never for "no constraints recorded" - those
  // are indistinguishable in intentState itself by design, so this is
  // tracked separately.
  const [intentUnavailable, setIntentUnavailable] = useState(false);
  // Red-team finding 1 (bundle), section 9.6: true only when the CAPABILITY
  // read failed with NO known state this session - the one posture where
  // the browse list filters nothing for Injuries & limitations - AND the user has
  // the feature turned on (local consent flag), so it is a true notice,
  // never noise.
  const [capabilityUnavailable, setCapabilityUnavailable] = useState(false);
  // CC27 (section 9.2.6): default-on capability filter with a "show anyway"
  // toggle - the existing showExcluded pattern, its own switch so the two
  // lanes' actions stay distinct (Allow again vs the section 9.4 flows).
  const [showIncompatible, setShowIncompatible] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createMuscle, setCreateMuscle] = useState('');
  const [createEquipment, setCreateEquipment] = useState('');
  // L07-F8: secondary muscles (multi-select) + exercise type, so a custom
  // exercise carries the same fields a seeded library exercise does.
  const [createSecondaryMuscles, setCreateSecondaryMuscles] = useState([]);
  const [createExerciseType, setCreateExerciseType] = useState('weight_reps');
  // D107-2 load semantics: what the entered weight means for this exercise.
  // Smart-defaulted from equipment/type (dumbbell -> per hand, loaded
  // bodyweight -> added weight) until the user picks one themselves; an
  // explicit choice always wins.
  const [createLoadSemantics, setCreateLoadSemantics] = useState('total');
  const [createLoadSemanticsTouched, setCreateLoadSemanticsTouched] = useState(false);
  useEffect(() => {
    if (createLoadSemanticsTouched) return;
    setCreateLoadSemantics(
      createExerciseType === 'weighted_bodyweight' ? 'added_bodyweight'
        : createEquipment === 'Dumbbell' ? 'per_hand'
          : 'total',
    );
  }, [createEquipment, createExerciseType, createLoadSemanticsTouched]);
  const [creating, setCreating] = useState(false);
  // CC27 (section 8.4): the single-axis ask. Rendered ONLY for axes the
  // user actually has an active demand constraint on - progressive
  // disclosure, never a biomechanics exam. Unanswered stays NULL and the
  // exercise remains fully manually usable.
  const [createDemands, setCreateDemands] = useState({});
  // 2026-07-11 (TASKBOARD "exercise picker first-open fix", D33): on the
  // FIRST open of a session the Android Modal's native window is freshly
  // created, and FlashList's native measurement handshake races that
  // window's setup (the same class of race the SafeAreaProvider comment
  // below already documents for insets) -- the list commits a ~zero-height
  // first paint, clipping results/ListEmptyComponent/the create-custom
  // footer and the browse-filter chips into a blank gap. Second and later
  // opens self-heal because Android remounts the modal's child tree each
  // open, so the native setup is already warm. `modalShown` gates that
  // content on the Modal's onShow, which only fires after the window is
  // actually presented, so the first layout pass always runs against a
  // presented window instead of a still-forming one.
  const [modalShown, setModalShown] = useState(false);

  useEffect(() => {
    if (!visible) {
      // Reset point: this effect already re-arms every other per-open bit
      // of state (query/filters/showCreate) the moment the modal closes, so
      // resetting modalShown here too keeps the "next open starts cold"
      // gate in the same single place rather than adding a second effect.
      setModalShown(false);
      return;
    }
    setQuery('');
    setMuscleFilter('');
    setEquipmentFilter('');
    setShowCreate(false);
    getAllExercises().then(exs => {
      setAll(exs);
    }).catch(() => {});
    // L07-F7: most-recently-used row, add-mode only (swap already narrows to
    // search-and-select). A read failure just leaves the row empty; browsing
    // the full library still works.
    if (!isSwapAction && userId) {
      getRecentlyUsedExerciseIds(userId).then(setRecentIds).catch(() => setRecentIds([]));
      // EL-20: frequency, from completed-session counts per exercise, for
      // the empty-query "Recent" section (recentAndFrequentItems below).
      // Best-effort, same fail-quiet posture as the recency read above.
      getExerciseUsageStats(userId).then(setUsageStats).catch(() => setUsageStats([]));
    } else {
      setRecentIds([]);
      setUsageStats([]);
    }
    // C9 Work 2/7: this picker is the shared entry point for the workout
    // builder, the plan builder, the routine editor and the swap
    // fall-through, so honouring exercise intent HERE covers all of them
    // at once. Set aside exercises are hidden from the browse list by
    // default and reachable behind an explicit "Show set aside" toggle,
    // where they are clearly marked and can be allowed again. Restoration
    // must never be obscure.
    setShowExcluded(false);
    setShowIncompatible(false);
    setIntentUnavailable(false);
    setCapabilityUnavailable(false);
    if (userId) {
      getActiveBlock(userId)
        .then(block => loadExerciseIntentState(userId, { activeMesocycleId: block?.id ?? null }))
        .then(state => {
          setIntentState(state);
          // loadExerciseIntentState fails open internally (returns an empty
          // state, never throws), so `unavailable` is how a genuine read
          // failure is told apart from "nothing set aside" - see D109-2.
          if (state?.unavailable) {
            setIntentUnavailable(true);
            // CC32 (section 27): announce the state change - iOS has no
            // live regions, so the imperative announcement covers both
            // platforms; the row below also carries liveRegion for
            // Android focus-order arrivals.
            try { AccessibilityInfo.announceForAccessibility('Avoided movements could not be checked right now, so nothing is filtered for them.'); } catch (_a) { /* best effort */ }
          }
          // Red-team finding 1 (bundle), section 9.6: with no known
          // capability state this session the list filters nothing for how
          // you train, and that fact gets the same visible notice the
          // intent lane's failure gets. Stale last-known state keeps
          // filtering normally (CAP-17), so it stays quiet here.
          if (state?.capability?.unavailable && !state.capability.stale) {
            getLocalCapabilityConsent(userId)
              .then((consented) => {
                if (consented === true) {
                  setCapabilityUnavailable(true);
                  try { AccessibilityInfo.announceForAccessibility('Injuries & limitations could not be checked right now, so nothing is filtered for it.'); } catch (_a) { /* best effort */ }
                }
              })
              .catch(() => {});
          }
        })
        .catch(() => { setIntentState(null); setIntentUnavailable(true); });
    } else {
      setIntentState(null);
    }
  }, [visible, isSwapAction, userId]);

  // CC27 (section 8.4): the demand axes this user actually has active
  // constraints on - the ONLY axes the create form may ask about.
  const constrainedAxes = [...new Set((intentState?.capability?.restrictions ?? [])
    .filter(r => r.ruleKind === 'demand' && DEMAND_ASK_SPECS[r.ruleValue])
    .map(r => r.ruleValue))];

  // Recents are an entry point into an untouched browse, not another filter:
  // once the user is searching or has a chip active, the row steps aside.
  const recentExercises = (!isSwapAction && !query.trim() && !muscleFilter && !equipmentFilter)
    ? recentIds.map(id => allExercises.find(e => String(e.id) === String(id))).filter(Boolean)
      // CC27: the Recent rail was id-blind; it now asks the SENIOR question
      // (intent + family + capability), so nothing set aside or outside how
      // you train is quietly re-offered through recency.
      .filter(e => !intentState || isEligibleExercise(intentState, e))
    : [];

  // L07-F6/EL-20 perf: the equipment/muscle/intent/capability filter is
  // independent of `query` (typing a search character never changes it),
  // so it is its own memo -- recomputed only when a FILTER actually
  // changes, not on every keystroke. `fuzzySearch` below then does its own
  // per-exercise-list-identity memoisation (a WeakMap keyed on this exact
  // `base` array reference) of name/alias tokenisation, so a keystroke
  // pays only for the ranked comparison itself, never for re-filtering or
  // re-tokenising the library from scratch.
  const base = useMemo(() => allExercises.filter(e =>
    matchesMuscleFilter(e, muscleFilter) &&
    matchesEquipmentFilter(e, equipmentFilter) &&
    // Hidden from SUGGESTIONS, never from the user: the toggle below
    // brings them back, marked, with an "Allow again" action.
    (showExcluded || !intentState || isEligible(intentState, e.id)) &&
    // D107-2 senior enforcement: a movement-pattern avoidance hides the
    // whole family the same way an id-level exclusion does. Kept as a
    // separate AND term (not folded into the clause above) so the
    // pre-existing id-level regression-guard string stays byte-exact
    // (campaign9.generation.test.js "the shared picker honours intent").
    (showExcluded || !intentState || !isFamilyBlocked(intentState, movementFamilyOf(e))) &&
    // CC27 (section 9.2.6): the capability filter, default on, with its
    // own "show anyway" toggle. A separate AND term for the same reason
    // as the family term above: the pinned id-level clause stays intact.
    (showIncompatible || !intentState?.capability
      || capabilityBlockReason(intentState.capability, e) === null),
  ), [allExercises, muscleFilter, equipmentFilter, intentState, showExcluded, showIncompatible]);

  // EL-20: recent-and-frequent ids, merged and capped
  // (exercisePickerSections.js), recomputed only when the underlying reads
  // change (never on a keystroke).
  const recentAndFrequentIds = useMemo(
    () => buildRecentAndFrequentIds(recentIds, usageStats),
    [recentIds, usageStats],
  );

  // EL-20: for a non-empty query, the alias-aware six-tier ranked search
  // (exerciseFuzzySearch.js) - staples outrank specialists within a tier
  // via `getTier`. For an EMPTY query (add-mode only; swap mode stays a
  // flat alphabetical browse, matching its existing search-and-select
  // posture), the picker's own recent/plan/staples/rest ordering, each
  // section flattened with a header marker the renderItem below detects.
  // `base` is already alphabetical (`getAllExercises()` is
  // `ORDER BY name ASC`, and every filter preserves relative order), so
  // "everything else" needs no separate sort of its own either way.
  const listData = useMemo(() => {
    const q = query.trim();
    if (q || isSwapAction) {
      return fuzzySearch(base, query, e => e.name, {
        getAliases: e => e.aliases,
        getTier: e => tierRank(e.name),
      });
    }
    const sections = buildEmptyQuerySections({ base, recentAndFrequentIds, planExercises });
    return flattenSectionsForList(sections);
  }, [base, query, isSwapAction, recentAndFrequentIds, planExercises]);

  // CC27 (section 9.4): the manual-conflict flows. Selection of a
  // capability-conflicted movement is never silent and never hard-blocked
  // for SELF-declared rules; clinician-reported rules are edited, not
  // excepted (CAP-7), so their path routes to the restriction editor.
  async function writeAllowance(item) {
    try {
      // eslint-disable-next-line global-require
      const { createConstraint } = require('../lib/capability/store');
      await createConstraint(userId, {
        role: 'baseline', source: 'self',
        ruleKind: 'exercise_allow', ruleValue: item.id,
        startsAt: Date.now(),
      });
      const block = await getActiveBlock(userId).catch(() => null);
      setIntentState(await loadExerciseIntentState(userId, { activeMesocycleId: block?.id ?? null }));
      return true;
    } catch (_e) {
      toast.show('Could not record that just now. The exercise is still added.', { variant: 'warning' });
      return false;
    }
  }

  function handleSelect(item, capReason) {
    if (!capReason) { onSelect(item); onClose(); return; }
    const commit = () => { onSelect(item); onClose(); };
    if (capReason === CAPABILITY_BLOCK.CLINICIAN) {
      // No inline override for a clinician-reported rule (CAP-7).
      appAlert(
        `${item.name} is one you're keeping out`,
        `${describeCapabilityConflict(intentState.capability, item, capReason)}. If that's changed, update it under Injuries & limitations first.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Open Injuries & limitations',
            onPress: () => {
              onClose?.();
              try {
                // Lazy: importing the navigator statically would create an
                // import cycle (navigator -> screens -> this picker).
                // eslint-disable-next-line global-require
                const { navigationRef } = require('../navigation/RootNavigator');
                if (navigationRef.isReady()) navigationRef.navigate('HowYouTrain');
              } catch (_e) { /* best effort */ }
            },
          },
        ],
      );
      return;
    }
    if (capReason === CAPABILITY_BLOCK.UNKNOWN) {
      const caption = describeCapabilityConflict(intentState.capability, item, capReason);
      appAlert(
        'Not sure yet',
        `${caption}. You can still add it yourself.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Add anyway', onPress: commit },
          { text: 'Add, this works for me', onPress: async () => { await writeAllowance(item); commit(); } },
        ],
      );
      return;
    }
    // Self-declared conflict: inline warning naming the constraint + the
    // two actions (section 9.4). "Add anyway" changes no state - the
    // conflict badge persists; "This one works for me" records the
    // allowance.
    const caption = describeCapabilityConflict(intentState.capability, item, capReason);
    appAlert(
      item.name,
      `${caption}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Add anyway, just this plan', onPress: commit },
        { text: 'This one works for me', onPress: async () => { await writeAllowance(item); commit(); } },
      ],
    );
  }

  async function handleCreate() {
    if (!createName.trim()) {
      toast.show('Enter a name for the exercise', { variant: 'warning' });
      return;
    }
    setCreating(true);
    try {
      const created = await insertExercise({
        name: createName.trim(),
        primaryMuscle: createMuscle || null,
        // L07-F8: secondary muscles, so a custom exercise's volume/muscle
        // tracking counts the same secondary-muscle contribution a seeded
        // exercise's secondary_muscles column already gives it.
        secondaryMuscles: createSecondaryMuscles.length ? createSecondaryMuscles : null,
        equipment: createEquipment || null,
        // L07-F8: the exercise type axis, so e.g. a custom plank or carry
        // gets the duration/distance SetEntry schema instead of always
        // defaulting to weight_reps.
        exerciseType: createExerciseType,
        // D107-2: what the entered weight means (per hand / assistance /
        // added weight / total). Only meaningful on weight-bearing schemas;
        // other types store 'total', today's de facto meaning.
        loadSemantics: (createExerciseType === 'weight_reps' || createExerciseType === 'weighted_bodyweight')
          ? createLoadSemantics : 'total',
        // SFR is left null/unknown, never a guessed midpoint: the swap and plan
        // engines treat a missing stimulus-to-fatigue ratio as "no data" and
        // skip the SFR scoring term. A hard-coded value (e.g. 3) would make a
        // brand-new custom move falsely read as a real, ranked candidate.
        stimulusToFatigueRatio: null,
        isCustom: 1,
        // CC27 (section 34.1): equipment metadata derives from what the
        // owner just chose, so the custom can meet the SAME pool-entry
        // requirements as a built-in (metadata sufficiency, never
        // is_custom). Demand axes are NOT derived here - section 8.4 says
        // they are asked, one axis at a time, only when a constraint makes
        // one relevant; unanswered stays NULL and manual use never needs it.
        ...deriveExerciseMetadata({
          name: createName.trim(),
          equipment: createEquipment || null,
          movementPattern: null,
          compoundIsolation: null,
        }),
        // CC27 (section 8.4): the owner's own single-axis answers, if any.
        ...createDemands,
      });
      const all = await getAllExercises();
      setAll(all);
      // WK-6: include the id from insertExercise in the fallback so onSelect
      // never hands back an id-less exercise (which would log a set against a
      // null exercise_id) if the name lookup misses.
      const newEx = all.find(e => e.name === createName.trim())
        || {
          id: created?.id,
          name: createName.trim(),
          primaryMuscle: createMuscle,
          secondaryMuscles: createSecondaryMuscles.length ? createSecondaryMuscles : null,
          equipment: createEquipment,
          exerciseType: createExerciseType,
          loadSemantics: (createExerciseType === 'weight_reps' || createExerciseType === 'weighted_bodyweight')
            ? createLoadSemantics : 'total',
        };
      onSelect(newEx);
      onClose();
    } catch (_e) {
      toast.show("Couldn't save exercise, try again", { variant: 'error' });
    } finally {
      setCreating(false);
    }
  }

  // EL-18: while typing a new custom exercise's name, does it already
  // exist as a canonical row (exact name or alias, normalised)? Checked
  // against the FULL library, not the currently-filtered `base` - a name
  // match matters regardless of which equipment/muscle chip happens to be
  // active. Recomputed only when the typed name or the library changes,
  // never per render.
  const existingMatch = useMemo(
    () => findCanonicalNameMatch(createName, allExercises),
    [createName, allExercises],
  );

  // EL-18: "Use it instead?" - selects the existing canonical row exactly
  // as tapping it in the browse list would (same capability-conflict
  // presentation via handleSelect), rather than a silent, different path.
  function useExistingInstead() {
    if (!existingMatch) return;
    const capReason = intentState?.capability
      ? capabilityBlockReason(intentState.capability, existingMatch) : null;
    haptics.selection();
    handleSelect(existingMatch, capReason);
  }

  function openCreate() {
    setCreateName(query.trim());
    setCreateMuscle('');
    setCreateEquipment('');
    setCreateSecondaryMuscles([]);
    setCreateExerciseType('weight_reps');
    setCreateDemands({});
    setShowCreate(true);
  }

  // Choosing a primary muscle drops it from the secondary set, so the same
  // muscle can never be both primary and secondary at once.
  function selectPrimaryMuscle(m) {
    setCreateMuscle(prev => (prev === m ? '' : m));
    setCreateSecondaryMuscles(prev => prev.filter(x => x !== m));
  }

  function toggleSecondaryMuscle(m) {
    setCreateSecondaryMuscles(prev => (
      prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]
    ));
  }

  return (
    <Modal visible={visible} animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={showCreate ? () => setShowCreate(false) : onClose}
      // 2026-07-11: onShow fires after the modal's native window is actually
      // presented on both platforms (unlike the `visible` prop, which flips
      // the instant we ask for it) -- it is the first point we can trust
      // that a first native layout pass will land against a real, presented
      // window rather than one still mid-setup.
      onShow={() => setModalShown(true)}
    >
      {/* A core RN <Modal> presents in its own window on iOS and does not
          inherit the root SafeAreaProvider's measured frame, so a bare
          SafeAreaView inside reads top:0 and the search field jams against the
          status bar / Dynamic Island. A nested provider makes the modal
          measure its own insets. */}
      <SafeAreaProvider>
      <SafeAreaView style={[styles.pickerSafe, live.pickerSafe]} edges={['top', 'bottom']}>
        {showCreate ? (
          <KeyboardGestureArea interpolator="ios" style={{ flex: 1 }}>
            <View style={[styles.pickerHeader, live.pickerHeader]}>
              <TouchableOpacity accessibilityRole="button"
                accessibilityLabel="Back to exercise search"
                onPress={() => { haptics.selection(); setShowCreate(false); }}
                style={[styles.pickerClose, live.pickerClose]}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="arrow-back" size={24} color={t.colors.textSecondary} />
              </TouchableOpacity>
              <Text style={[styles.createTitle, live.createTitle]} numberOfLines={1} ellipsizeMode="tail">New exercise</Text>
              <TouchableOpacity accessibilityRole="button"
                accessibilityLabel="Close exercise picker"
                onPress={() => { haptics.selection(); onClose?.(); }}
                style={[styles.pickerClose, live.pickerClose]}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="close" size={24} color={t.colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <KeyboardAwareScrollView contentContainerStyle={styles.createContent} keyboardShouldPersistTaps="handled">
              <TextField
                accessibilityLabel="New exercise name"
                value={createName}
                onChangeText={setCreateName}
                placeholder="Exercise name"
                placeholderTextColor={t.colors.textMuted}
                autoFocus
                autoCapitalize="words"
                surface={t.colors.inputBg}
                containerStyle={styles.createNameInputContainer}
                fieldStyle={styles.createNameInputField}
                inputStyle={[styles.createNameInputText, live.createNameInputText]}
              />
              {/* EL-18: a calm, non-blocking nudge toward the existing
                  canonical row rather than a duplicate - creating anyway
                  stays fully available below, untouched. */}
              {existingMatch ? (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={`Looks like ${existingMatch.name} already exists. Use it instead?`}
                  onPress={useExistingInstead}
                  style={styles.existingMatchRow}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="information-circle-outline" size={14} color={t.colors.textMuted} />
                  <Text style={[styles.existingMatchText, live.existingMatchText]}>
                    Looks like <Text style={[styles.existingMatchName, live.existingMatchName]}>{existingMatch.name}</Text> already exists. Use it instead?
                  </Text>
                </TouchableOpacity>
              ) : null}
              <Text style={[styles.createLabel, live.createLabel]}>Muscle group</Text>
              <View style={styles.chipRow}>
                {PICKER_MUSCLES.map(m => (
                  <Chip
                    key={m}
                    label={MUSCLE_DISPLAY_NAMES[m]}
                    selected={createMuscle === m}
                    onPress={() => { haptics.selection(); selectPrimaryMuscle(m); }}
                  />
                ))}
              </View>
              {/* L07-F8: secondary muscles, multi-select, so a custom
                  exercise's volume/muscle tracking counts a secondary
                  contribution the same way a seeded exercise's
                  secondary_muscles column already does. The current primary
                  muscle is left out of the list so the same muscle cannot be
                  picked as both. */}
              <Text style={[styles.createLabel, live.createLabel]}>Secondary muscles (optional)</Text>
              <View style={styles.chipRow}>
                {PICKER_MUSCLES.filter(m => m !== createMuscle).map(m => {
                  const selected = createSecondaryMuscles.includes(m);
                  return (
                    <Chip
                      key={m}
                      label={MUSCLE_DISPLAY_NAMES[m]}
                      selected={selected}
                      onPress={() => { haptics.selection(); toggleSecondaryMuscle(m); }}
                      accessibilityLabel={`${selected ? 'Remove' : 'Add'} ${MUSCLE_DISPLAY_NAMES[m]} as a secondary muscle`}
                    />
                  );
                })}
              </View>
              <Text style={[styles.createLabel, live.createLabel]}>Equipment</Text>
              <View style={styles.chipRow}>
                {PICKER_EQUIPMENT.map(eq => (
                  <Chip
                    key={eq}
                    label={eq}
                    selected={createEquipment === eq}
                    onPress={() => { haptics.selection(); setCreateEquipment(prev => prev === eq ? '' : eq); }}
                  />
                ))}
              </View>
              {/* L07-F8: exercise type, matching the schema's existing
                  exercise_type enum so a custom plank/carry/sprint can get the
                  correct SetEntry input schema instead of always defaulting
                  to weight_reps. */}
              <Text style={[styles.createLabel, live.createLabel]}>Exercise type</Text>
              <View style={styles.chipRow}>
                {EXERCISE_TYPE_OPTIONS.map(opt => (
                  <Chip
                    key={opt.key}
                    label={opt.label}
                    selected={createExerciseType === opt.key}
                    onPress={() => { haptics.selection(); setCreateExerciseType(opt.key); }}
                    accessibilityLabel={`Exercise type: ${opt.label}`}
                  />
                ))}
              </View>
              {/* D107-2: what the entered weight number means, smart-defaulted
                  from equipment/type. Shown only for weight-bearing schemas -
                  a timed hold or a distance entry has no weight to describe. */}
              {(createExerciseType === 'weight_reps' || createExerciseType === 'weighted_bodyweight') && (
                <>
                  <Text style={[styles.createLabel, live.createLabel]}>Weight entered as</Text>
                  <View style={styles.chipRow}>
                    {LOAD_SEMANTICS_OPTIONS.map(opt => (
                      <Chip
                        key={opt.key}
                        label={opt.label}
                        selected={createLoadSemantics === opt.key}
                        onPress={() => {
                          haptics.selection();
                          setCreateLoadSemantics(opt.key);
                          setCreateLoadSemanticsTouched(true);
                        }}
                        accessibilityLabel={`Weight entered as: ${opt.label}`}
                      />
                    ))}
                  </View>
                </>
              )}
              {/* CC27 (section 8.4): the single-axis ask - one optional
                  question per axis the user has an active constraint on,
                  never more. Skipping leaves the axis unknown, which the
                  browse and generation surfaces report honestly. */}
              {constrainedAxes.map(axis => {
                const spec = DEMAND_ASK_SPECS[axis];
                return (
                  <View key={axis}>
                    <Text style={[styles.createLabel, live.createLabel]}>{spec.label} (optional)</Text>
                    <View style={styles.chipRow}>
                      {spec.options.map(opt => (
                        <Chip
                          key={String(opt.key)}
                          label={opt.label}
                          selected={createDemands[spec.field] === opt.key}
                          onPress={() => {
                            haptics.selection();
                            setCreateDemands(prev => (
                              prev[spec.field] === opt.key
                                ? Object.fromEntries(Object.entries(prev).filter(([k]) => k !== spec.field))
                                : { ...prev, [spec.field]: opt.key }
                            ));
                          }}
                          accessibilityLabel={`${spec.label} ${opt.label}`}
                        />
                      ))}
                    </View>
                  </View>
                );
              })}
              <TouchableOpacity accessibilityRole="button"
                accessibilityLabel={buttonLabel}
                style={[styles.createSaveBtn, live.createSaveBtn, creating && { opacity: 0.5 }]}
                onPress={() => { haptics.commit(); handleCreate(); }}
                disabled={creating}
              >
                <Ionicons name={isSwapAction ? 'swap-horizontal' : 'add-circle'} size={20} color={t.colors.primary} />
                <Text style={[styles.createSaveBtnText, live.createSaveBtnText]} numberOfLines={1}>{buttonLabel}</Text>
              </TouchableOpacity>
            </KeyboardAwareScrollView>
          </KeyboardGestureArea>
        ) : (
          <>
            <View style={[styles.pickerHeader, live.pickerHeader]}>
              <SearchBar
                style={styles.pickerSearchBar}
                value={query}
                onChangeText={setQuery}
                placeholder="Search exercises"
                autoFocus
              />
              <TouchableOpacity accessibilityRole="button"
                accessibilityLabel="Close exercise picker"
                onPress={() => { haptics.selection(); onClose?.(); }}
                style={[styles.pickerClose, live.pickerClose]}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="close" size={24} color={t.colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {recentExercises.length > 0 ? (
              <View style={styles.recentSection}>
                <SectionLabel style={styles.recentLabel}>Recent</SectionLabel>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={styles.filterRow}
                >
                  {recentExercises.map(ex => (
                    <Chip
                      key={ex.id}
                      icon="time-outline"
                      label={ex.name}
                      numberOfLines={1}
                      accessibilityLabel={`Add ${ex.name}`}
                      onPress={() => { haptics.selection(); onSelect(ex); onClose(); }}
                      style={styles.recentChip}
                    />
                  ))}
                </ScrollView>
              </View>
            ) : null}

            {/* D109-2: the constraints read genuinely failed. Generation and
                suggestion still proceed (the browse list simply shows
                everything, unfiltered by avoidance) - this is the visible
                notice that fact requires, not a block. */}
            {intentUnavailable ? (
              <View style={styles.constraintsUnavailableRow} accessibilityLiveRegion="polite">
                <Ionicons name="information-circle-outline" size={14} color={t.colors.textMuted} />
                <Text style={[styles.constraintsUnavailableText, live.constraintsUnavailableText]}>
                  Avoided movements could not be checked right now, so nothing is filtered for them.
                </Text>
              </View>
            ) : null}

            {/* Red-team finding 1 (bundle), section 9.6: the capability
                lane's read failed with no known state, so the list is not
                filtered for Injuries & limitations. Same visible-notice posture as
                the intent row above; shown only when the feature is on. */}
            {capabilityUnavailable ? (
              <View style={styles.constraintsUnavailableRow} accessibilityLiveRegion="polite">
                <Ionicons name="information-circle-outline" size={14} color={t.colors.textMuted} />
                <Text style={[styles.constraintsUnavailableText, live.constraintsUnavailableText]}>
                  Injuries & limitations could not be checked right now, so nothing is filtered for it.
                </Text>
              </View>
            ) : null}

            {/* CC27 (section 9.2.6): the capability "show anyway" toggle,
                shown only while active constraints exist. Its own switch so
                restoring a set-aside exercise and overriding a capability
                conflict stay visibly different actions. */}
            {intentState?.capability && !intentState.capability.empty ? (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={showIncompatible ? 'Hide movements that clash with your limitations' : 'Show movements that clash with your limitations'}
                onPress={() => setShowIncompatible(v => !v)}
                style={styles.showExcludedRow}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={[styles.showExcludedText, live.showExcludedText]}>
                  {showIncompatible ? 'Hide movements that clash with your limitations' : 'Show movements that clash with your limitations'}
                </Text>
              </TouchableOpacity>
            ) : null}

            {/* C9 Work 2: restoration must not be obscure. The toggle only
                appears when the user actually has something set aside. */}
            {intentState && [...intentState.intents.keys()].length > 0 ? (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={showExcluded ? 'Hide exercises you have set aside' : 'Show exercises you have set aside'}
                onPress={() => setShowExcluded(v => !v)}
                style={styles.showExcludedRow}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={[styles.showExcludedText, live.showExcludedText]}>
                  {showExcluded ? 'Hide what you have set aside' : 'Show what you have set aside'}
                </Text>
              </TouchableOpacity>
            ) : null}

            {modalShown && showBrowseFilters ? (
              <>
                {/* Browse filters are for adding exercises. Swap mode stays
                    search-and-select so it does not bury the replacement list
                    under two rows of unrelated chips mid-workout.
                    2026-07-11: also gated on modalShown -- see the
                    first-open native-race comment by the modalShown
                    declaration above. Pre-show frame renders nothing here
                    (see the FlashList gate below for why). */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={styles.filterRow}
                >
                  {PICKER_MUSCLES.map(m => (
                    <Chip
                      key={m}
                      label={MUSCLE_DISPLAY_NAMES[m]}
                      selected={muscleFilter === m}
                      onPress={() => { haptics.selection(); setMuscleFilter(prev => (prev === m ? '' : m)); }}
                      accessibilityLabel={`Filter by ${MUSCLE_DISPLAY_NAMES[m]}`}
                      style={styles.filterChip}
                      labelStyle={[styles.filterChipText, live.filterChipText]}
                      selectedLabelStyle={[styles.filterChipTextActive, live.filterChipTextActive]}
                    />
                  ))}
                </ScrollView>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={styles.filterRow}
                >
                  {PICKER_EQUIPMENT.map(eq => (
                    <Chip
                      key={eq}
                      label={eq}
                      selected={equipmentFilter === eq}
                      onPress={() => { haptics.selection(); setEquipmentFilter(prev => (prev === eq ? '' : eq)); }}
                      accessibilityLabel={`Filter by ${eq}`}
                      style={styles.filterChip}
                      labelStyle={[styles.filterChipText, live.filterChipText]}
                      selectedLabelStyle={[styles.filterChipTextActive, live.filterChipTextActive]}
                    />
                  ))}
                </ScrollView>
              </>
            ) : null}

            {/* 2026-07-11: gated on modalShown, see the first-open
                native-race comment by the modalShown declaration above.
                Pre-show frame renders nothing rather than a placeholder
                View -- the SafeAreaView above already paints the themed
                background across this whole area, so there is no black
                void to cover, and skipping an extra element keeps this
                change to state + a condition, not a new node that could
                itself need to survive the same measurement race. */}
            {modalShown ? (
            <View style={styles.pickerListWrap}>
            <FlashList
              data={listData}
              keyExtractor={item => (item.__section ? item.key : String(item.id))}
              // EL-20: FlashList recycles cells by type (perf, matches the
              // existing E8 rationale for this list), so a section header
              // and an exercise row - very different shapes - never share
              // a recycled cell.
              getItemType={item => (item.__section ? 'sectionHeader' : 'row')}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.pickerList}
              renderItem={({ item }) => {
                // EL-20: the empty-query list is sectioned (Recent, In your
                // plan, Staples, All exercises); a non-empty query or swap
                // mode stays a flat ranked/alphabetical list with no
                // headers at all - `listData` only ever carries `__section`
                // markers in the sectioned case.
                if (item.__section) {
                  return (
                    <SectionLabel style={styles.pickerSectionLabel} heading>
                      {item.__section}
                    </SectionLabel>
                  );
                }
                // C9: a set-aside exercise is only reachable here when the
                // user asked to see them. It says so plainly and offers the
                // way back, so restoring is never a hunt.
                const setAside = intentState ? !isEligible(intentState, item.id) : false;
                // CC27 (CAP-18): the capability caption is mechanical - the
                // conflict names its own axis/rule, nothing is inferred.
                const capReason = intentState?.capability
                  ? capabilityBlockReason(intentState.capability, item) : null;
                const capCaption = capReason ? describeCapabilityConflict(intentState.capability, item, capReason) : null;
                return (
                  <TouchableOpacity accessibilityRole="button"
                    accessibilityLabel={`${isSwapAction ? 'Swap in' : 'Add'} ${item.name}${setAside ? ', set aside' : ''}${capCaption ? `, ${capCaption}` : ''}`}
                    style={styles.pickerRow}
                    onPress={() => { haptics.selection(); handleSelect(item, capReason); }}
                  >
                    <View style={styles.pickerRowContent}>
                      <Text style={[styles.pickerExName, live.pickerExName]}>{item.name}</Text>
                      {setAside ? (
                        <Text style={[styles.pickerSetAside, live.pickerSetAside]}>
                          {intentFor(intentState, item.id)?.kind === 'avoided_block'
                            ? 'Set aside for this block'
                            : 'You asked Volyume not to suggest this'}
                        </Text>
                      ) : capCaption ? (
                        <Text style={[styles.pickerSetAside, live.pickerSetAside]}>{capCaption}</Text>
                      ) : item.primaryMuscle ? (
                        <Text style={[styles.pickerMuscle, live.pickerMuscle]}>{item.primaryMuscle}</Text>
                      ) : null}
                    </View>
                    {setAside ? (
                      <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel={`Allow ${item.name} again`}
                        // Round 14 (J2): a caption plus 8dp of slop was
                        // well under the 48 minimum on the lane's own
                        // allowance control; the style gives it a real
                        // target and the slop stays as margin for error.
                        style={styles.pickerAllowAgainBtn}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        onPress={async () => {
                          try {
                            await clearExerciseIntent(userId, item.id);
                            const block = await getActiveBlock(userId).catch(() => null);
                            setIntentState(await loadExerciseIntentState(userId, { activeMesocycleId: block?.id ?? null }));
                          } catch (_) { /* best effort */ }
                        }}
                      >
                        <Text style={[styles.pickerAllowAgain, live.pickerAllowAgain]}>Allow again</Text>
                      </TouchableOpacity>
                    ) : (
                      <Ionicons name={isSwapAction ? 'swap-horizontal' : 'add-circle-outline'} size={20} color={t.colors.textSecondary} />
                    )}
                  </TouchableOpacity>
                );
              }}
              ItemSeparatorComponent={() => <View style={[styles.separator, live.separator]} />}
              ListFooterComponent={!isSwapAction ? (
                // Always offer "create custom", with or without a query, so the
                // option to add your own exercise is never hidden behind an
                // empty search result.
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={query.trim().length > 0
                    ? `Create ${query.trim()} as custom exercise`
                    : 'Create a custom exercise'}
                  style={[styles.createNewBtn, live.createNewBtn, { marginTop: spacing.md }]}
                  onPress={() => { haptics.selection(); openCreate(); }}
                >
                  <Ionicons name="add-circle-outline" size={18} color={t.colors.primary} />
                  <Text style={[styles.createNewBtnText, live.createNewBtnText]}>
                    {query.trim().length > 0
                      ? `Create "${query.trim()}" as custom exercise`
                      : 'Create a custom exercise'}
                  </Text>
                </TouchableOpacity>
              ) : null}
              ListEmptyComponent={
                <View style={styles.pickerEmpty}>
                  <Ionicons name="search-outline" size={32} color={t.colors.textMuted} style={{ marginBottom: spacing.md }} />
                  <Text style={[styles.pickerEmptyText, live.pickerEmptyText]}>
                    {(isSwapAction ? 'No swaps found. ' : 'No matches found. ')
                      + ((muscleFilter || equipmentFilter) ? 'Try fewer words, or clear a filter.' : 'Try fewer words, or a different search.')}
                  </Text>
                </View>
              }
            />
            </View>
            ) : null}
          </>
        )}
      </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  pickerSafe: { flex: 1, backgroundColor: colors.background },
  // THE fix for the first-open blank picker (founder report 2026-08-19,
  // reproduced on BOTH platforms). The FlashList had no style and no flex,
  // and its parent is a Fragment, so nothing in the layout ever told it how
  // tall it was: its height was left to FlashList's own native measurement
  // handshake, which races the modal window's setup and can commit a
  // ~zero-height first paint. That is what put the results, the empty state
  // and the create-custom footer into a blank gap, and why a second open
  // "self-healed" (warm measurement) and why it looked random.
  //
  // The 2026-07-11 `modalShown` gate was a TIMING mitigation for the same
  // symptom: it delays WHEN the list mounts but never gives it a height, so
  // it narrows the race instead of closing it, which is why the bug survived
  // it. A flex:1 wrapper is laid out by Yoga on the first pass, so the list
  // is handed a definite height before it measures anything. Deterministic,
  // not timed. The gate is kept as belt and braces; it is now redundant
  // rather than load-bearing.
  pickerListWrap: { flex: 1 },
  pickerHeader: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.borderSubtle,
  },
  pickerSearchBar: { flex: 1 },
  pickerClose: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  pickerList: { paddingHorizontal: spacing.lg, paddingTop: spacing.xs, paddingBottom: spacing.xxl },
  // EL-20: the empty-query section headers (Recent / In your plan /
  // Staples / All exercises), inside the same padded list as the rows -
  // FlashList's contentContainerStyle padding already indents these.
  pickerSectionLabel: { paddingTop: spacing.md, paddingBottom: spacing.xs },
  pickerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 54, paddingVertical: spacing.sm },
  pickerRowContent: { flex: 1, gap: spacing.xxs },
  pickerExName: { ...type.label, color: colors.textPrimary },
  pickerMuscle: { ...type.caption, color: colors.textMuted, textTransform: 'capitalize' },
  // C9: a set-aside row states its own status and offers the way back.
  pickerSetAside: { ...type.caption, color: colors.textMuted },
  pickerAllowAgain: { ...type.caption, color: colors.primary },
  pickerAllowAgainBtn: { minHeight: spacing.xxxl, justifyContent: 'center', paddingHorizontal: spacing.xs },
  // Round 15 (R15-2, J2): a caption plus 8dp of slop was ~39dp effective
  // on the only control that reveals what the user's rules removed - the
  // same shape D126 ruling 5 closed one style-line above. Real 48 now.
  showExcludedRow: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, minHeight: spacing.xxxl, justifyContent: 'center' },
  showExcludedText: { ...type.caption, color: colors.textMuted },
  constraintsUnavailableRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    paddingHorizontal: spacing.lg, paddingBottom: spacing.sm,
  },
  constraintsUnavailableText: { ...type.caption, color: colors.textMuted, flex: 1 },
  // EL-18: the "looks like this already exists" nudge under the new-
  // exercise name field. Row shape matches showExcludedRow/
  // constraintsUnavailableRow (icon + caption), so it reads as the same
  // family of calm, low-emphasis inline notice.
  existingMatchRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs,
    paddingHorizontal: spacing.xs, paddingTop: spacing.xxs,
  },
  existingMatchText: { ...type.caption, color: colors.textMuted, flex: 1 },
  existingMatchName: { ...type.captionStrong, color: colors.primary },
  pickerEmpty: { alignItems: 'center', paddingTop: spacing.xxxl, gap: spacing.lg, paddingHorizontal: spacing.xl },
  pickerEmptyText: { ...type.body, color: colors.textMuted },
  separator: { height: 1, backgroundColor: colors.borderSubtle },
  createNewBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs,
    // Round 14 (J2): 48 effective (the styling law's minimum), on the
    // scale - 44 was both under it and an off-scale literal.
    minHeight: spacing.xxxl,
    backgroundColor: colors.surface, borderRadius: radius.lg,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderWidth: 1, borderColor: colors.borderSubtle,
  },
  createNewBtnText: { ...type.label, color: colors.textPrimary, flex: 1 },
  createTitle: { ...type.title, flex: 1, color: colors.textPrimary, textAlign: 'center' },
  createContent: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxxl },
  createNameInputContainer: { gap: 0 },
  createNameInputField: { borderRadius: radius.md },
  createNameInputText: { ...type.bodyStrong, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  createLabel: { ...type.captionStrong, color: colors.textMuted },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  filterRow: {
    flexDirection: 'row', gap: spacing.xs, flexGrow: 0,
    paddingHorizontal: spacing.lg, paddingTop: spacing.sm,
  },
  filterChip: { paddingVertical: spacing.xs, paddingHorizontal: spacing.sm },
  filterChipText: { ...type.label, color: colors.textSecondary },
  filterChipTextActive: { color: colors.primary, fontFamily: fontFamily.semibold, fontWeight: fontWeight.semibold },
  recentSection: { paddingTop: spacing.sm },
  recentLabel: { paddingHorizontal: spacing.lg },
  recentChip: { maxWidth: 180 },
  createSaveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs,
    minHeight: spacing.xxxl,
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingVertical: spacing.sm, marginTop: spacing.sm,
  },
  createSaveBtnText: { ...type.label, color: colors.textPrimary },
});
