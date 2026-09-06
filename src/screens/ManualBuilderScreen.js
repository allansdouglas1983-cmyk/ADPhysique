import { useState, useEffect, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import BackHeader from '../components/BackHeader';
import Card from '../components/Card';
import ExercisePickerModal from '../components/ExercisePickerModal';
import { Skeleton, SkeletonCard } from '../components/Skeleton';
import Stepper from '../components/Stepper';
import Button from '../components/Button';
import Chip from '../components/Chip';
import TextField from '../components/TextField';
import BottomSheet from '../components/BottomSheet';
import InfoTooltip from '../components/InfoTooltip';
import DragReorderList from '../components/DragReorderList';
import { useDragAutoScrollBridge } from '../components/DragReorderList';

import { colors, fontSize, fontWeight, spacing, radius, type, hitSlop, fontFamily } from '../styles/theme';
import useTheme from '../hooks/useTheme';
import {
  createProgramme, createRoutine, addExerciseToRoutine,
  activatePlanWithBlock, uid, getProgrammeById, getRoutinesForPlan,
  getRoutineExercisesWithDetails, updateRoutineName, removeExerciseFromRoutine,
  softDeleteRoutine, updateProgrammeName, db, runInTransaction,
} from '../lib/database';
import { MUSCLE_DISPLAY_NAMES, VOLUME_LANDMARKS } from '../lib/algorithms';
import { suggestRestSeconds } from '../lib/restSuggest';
import { classifySupersetPair, estimateWorkoutMinutes } from '../lib/planEngine';
import { confirmPlanSwitchMidBlock } from '../lib/planSwitch';
import { BLOCK_START_SENTENCE } from '../lib/blockExplain';
import { logError } from '../lib/errorLog';
import { GLOSSARY } from '../lib/coachGlossary';
import { swapAdjacentBlocks } from '../lib/reorder';
import { appAlert } from '../components/AppAlert';
import { track } from '../lib/engineTelemetry';
import useAppStore from '../store/useAppStore';
import { navigateCrossTab } from '../navigation/navigateCrossTab';
import { useShallow } from 'zustand/react/shallow';
import { useToast } from '../components/Toast';
import * as haptics from '../lib/haptics';

// ─── Constants ────────────────────────────────────────────────────────────────

const GOALS = [
  { key: 'hypertrophy', label: 'Build muscle' },
  { key: 'balanced',    label: 'Balanced bodybuilding' },
  { key: 'aesthetic',   label: 'Aesthetic focus' },
  { key: 'strength',    label: 'Strength-biased' },
  { key: 'recomp',      label: 'Lose fat, keep muscle' },
];

// Selectable training-days-per-week. Default stays 4 (the prior hardcoded
// value) so existing behaviour is unchanged for users who don't touch it.
const DAY_COUNT_OPTIONS = [2, 3, 4, 5, 6];

// S5: matches BuildWorkoutScreen's shipped defaults, so an exercise dropped
// into a plan here starts with the same targets it would in the workout
// builder.
const DEFAULT_SETS = 3;
const DEFAULT_REST = 90;
// EL-9 circuit model (docs/exercise-library-expansion-2026-09-05/
// 05-DECISIONS.md): rounds are the members' recommended_sets, kept equal
// within the group; round rest is the between-round rest, a template
// constant never auto-shortened (EL-10). Defaults picked to read as an
// ordinary starter circuit; both are adjustable per group.
const DEFAULT_ROUNDS = 3;
const MIN_ROUNDS = 2;
const MAX_ROUNDS = 6;
const DEFAULT_ROUND_REST = 90;
const MIN_ROUND_REST = 30;
const MAX_ROUND_REST = 180;
// Hit slop for the small +/- stepper buttons, ported verbatim from
// BuildWorkoutScreen's stepBtn touchables.
const STEPPER_HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };

// Formats seconds as "90s" / "2m" / "2m 15s", ported verbatim from
// BuildWorkoutScreen so rest reads identically wherever it's edited.
function formatRest(secs) {
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

// D139 (lead programme ruling): a day's session length, so the builder can
// tell someone how long a day takes before they leave the screen. Reuses
// the engine's own pure estimator (planEngine.js's estimateWorkoutMinutes,
// the same maths BuildWorkoutScreen's plan-fit surfaces trust) rather than
// inventing a second one -- it takes only { sets, restSec } per exercise, so
// this is a plain field-name adapter, not a new estimate.
function estimateDayMinutes(day) {
  const exercises = (day.exercises || []).map(ex => ({
    sets: ex.sets || DEFAULT_SETS,
    restSec: ex.restSeconds ?? DEFAULT_REST,
  }));
  return Math.round(estimateWorkoutMinutes(exercises));
}

// ─── Plan Balance Helpers ─────────────────────────────────────────────────────

const PRIORITY_MUSCLES = ['chest', 'back', 'shoulders', 'quads', 'hamstrings', 'biceps', 'triceps', 'glutes'];

function computePlanVolume(days) {
  const sets = {};
  for (const day of days) {
    for (const ex of day.exercises) {
      const m = ex.primaryMuscle;
      if (!m) continue;
      sets[m] = (sets[m] || 0) + (ex.sets || 3);
    }
  }
  return sets;
}

function muscleStatus(muscle, totalSets) {
  const lm = VOLUME_LANDMARKS[muscle];
  if (!lm) return null;
  // Muscles with a 0 minimum (e.g. glutes) grow from compound work alone
  // zero direct sets is acceptable, so don't flag them as missing.
  if (totalSets === 0)      return lm.mev === 0 ? 'good' : 'none';
  if (totalSets < lm.mev)   return 'low';
  if (totalSets <= lm.mav)  return 'good';
  if (totalSets <= lm.mrv)  return 'high';
  return 'over';
}

// CP-10 batch G (2026-07-11): converted to accept the live colour table `c`
// -- the status -> colour mapping is byte-identical in meaning, only the
// token SOURCE moved from the frozen import to the live theme.
function buildStatusColor(c) {
  return {
    none: c.textMuted,
    low:  c.warning,
    good: c.success,
    high: c.success,
    over: c.error,
  };
}
const STATUS_DOT = {
  none: '○',
  low:  '◐',
  good: '●',
  high: '●',
  over: '●',
};

// CP-10 batch G (2026-07-11): rendered once per screen render (not a list
// row), but with its own separate `balanceStyles` block, so it takes its own
// useTheme() call rather than prop-drilling `t`/`live` from the parent.
function PlanBalanceCard({ days }) {
  const t = useTheme();
  const live = useMemo(() => buildBalanceLiveStyles(t), [t]);
  const statusColor = useMemo(() => buildStatusColor(t.colors), [t]);
  const volume = computePlanVolume(days);
  const daysWithWork = days.filter(d => d.exercises.length > 0);
  const hasAnyExercise = daysWithWork.length > 0;
  if (!hasAnyExercise) return null;

  const rows = PRIORITY_MUSCLES.map(m => {
    const sets = volume[m] || 0;
    const status = muscleStatus(m, sets);
    return { muscle: m, sets, status };
  }).filter(r => r.status !== null);

  const warnings = rows.filter(r => r.status === 'none' || r.status === 'low');
  const overloaded = rows.filter(r => r.status === 'over');
  // D139: the typical (mean) session length across days that actually have
  // exercises, so an empty day someone hasn't got to yet never drags the
  // figure toward zero.
  const typicalMinutes = Math.round(
    daysWithWork.reduce((sum, d) => sum + estimateDayMinutes(d), 0) / daysWithWork.length,
  );

  return (
    <Card style={balanceStyles.card}>
      <View style={balanceStyles.header}>
        <Ionicons name="pie-chart-outline" size={16} color={t.colors.textSecondary} />
        <Text style={[balanceStyles.title, live.title]}>Plan balance</Text>
        {/* NV-1: the dot legend (full/half/hollow, green/amber/red) has no key
            anywhere else on this card, so a first-time builder can only learn
            it by triggering a warning. Reuses the volume-bands gloss already
            shown on BodyDiagramHeatmap.js, same InfoTooltip+GLOSSARY pattern. */}
        <InfoTooltip text={GLOSSARY.volumeBands} size={14} />
      </View>

      {/* D139: how long a day takes, so this reads before someone leaves the
          screen rather than only being discovered mid-workout. */}
      <Text style={[balanceStyles.durationLine, live.durationLine]}>
        {`Typical session: ~${typicalMinutes} min`}
      </Text>

      <View style={balanceStyles.grid}>
        {rows.map(({ muscle, sets, status }) => (
          <View key={muscle} style={balanceStyles.cell}>
            <Text style={[balanceStyles.dot, live.dot, { color: statusColor[status] }]}>
              {STATUS_DOT[status]}
            </Text>
            <Text style={[balanceStyles.muscleName, live.muscleName]}>{MUSCLE_DISPLAY_NAMES[muscle]}</Text>
            {sets > 0 && (
              <Text style={[balanceStyles.setCount, live.setCount]}>{sets}×</Text>
            )}
          </View>
        ))}
      </View>

      {warnings.length > 0 && (
        <Card surface="surface2" radius="md" padding="md" style={balanceStyles.warningBox}>
          {warnings.map(({ muscle, status }) => (
            <View key={muscle} style={balanceStyles.warningRow}>
              <Ionicons
                name={status === 'none' ? 'alert-circle-outline' : 'information-circle-outline'}
                size={14}
                color={status === 'none' ? t.colors.warning : t.colors.textMuted}
              />
              <Text style={[balanceStyles.warningText, live.warningText, status === 'none' && { color: t.colors.warning }]}>
                {status === 'none'
                  ? `No ${MUSCLE_DISPLAY_NAMES[muscle]} work in this plan`
                  : `${MUSCLE_DISPLAY_NAMES[muscle]} work is low. Consider adding a set or two.`}
              </Text>
            </View>
          ))}
        </Card>
      )}

      {overloaded.length > 0 && (
        <Card surface="surface2" radius="md" padding="md" style={balanceStyles.warningBox}>
          {overloaded.map(({ muscle }) => (
            <View key={muscle} style={balanceStyles.warningRow}>
              <Ionicons name="warning-outline" size={14} color={t.colors.error} />
              <Text style={[balanceStyles.warningText, live.warningText, { color: t.colors.error }]}>
                {`${MUSCLE_DISPLAY_NAMES[muscle]} volume is very high. This may affect recovery.`}
              </Text>
            </View>
          ))}
        </Card>
      )}
    </Card>
  );
}

// ─── Target stepper ───────────────────────────────────────────────────────────
// S5: compact wrapper around the shared +/- Stepper so sets, rep ranges and
// rest use the app's one numeric-control primitive while the screen keeps the
// training-specific clamp/coherence rules.
// CP-10 batch G (2026-07-11): called many times per row (once per target),
// so its own useTheme() call rather than prop-drilling `t`/`live` through
// every TargetStepper call site. Shares the parent's `buildLiveStyles(t)`
// since both read the same `styles` block.
function TargetStepper({
  label,
  value,
  displayValue,
  valueLabel,
  decreaseLabel,
  increaseLabel,
  onChange,
  min,
  max,
  step = 1,
}) {
  const t = useTheme();
  const live = useMemo(() => buildLiveStyles(t), [t]);
  return (
    <View style={styles.controlGroup}>
      {/* One line only: a two-word label (Reps min/Reps max) must not wrap
          under large text, or its stepper drops below the single-line
          siblings and the four controls step out of row alignment. */}
      <Text style={[styles.controlLabel, live.controlLabel]} numberOfLines={1}>{label}</Text>
      <Stepper
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={onChange}
        size="compact"
        hitSlop={STEPPER_HIT_SLOP}
        label={label.toLowerCase()}
        formatValue={() => `${displayValue}`}
        valueLabel={valueLabel}
        decreaseLabel={decreaseLabel}
        increaseLabel={increaseLabel}
      />
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ManualBuilderScreen({ navigation, route }) {
  const { planId } = route?.params || {};
  // F7: subscribe to just these fields (a bare useAppStore() re-renders on every store mutation).
  const { user } = useAppStore(useShallow(s => ({
    user: s.user,
  })));
  const toast = useToast();
  // D35: edge auto-scroll for page 2's day-exercise drag-reorder lists
  // (one bridge, shared by every day's DragReorderList -- they all live in
  // the SAME page-2 ScrollView). Declared unconditionally up here, ahead of
  // the page-1/page-2 early return below, per the Rules of Hooks.
  const { scrollRef, scrollOffset, onScroll, onContentSizeChange } = useDragAutoScrollBridge();

  // Page 1 state
  const [page, setPage]               = useState(1);
  const [planName, setPlanName]       = useState('');
  const [selectedGoal, setGoal]       = useState('hypertrophy');
  const [daysPerWeek, setDaysPerWeek] = useState(4);

  // Page 2 state
  const [programmeId, setProgrammeId]         = useState(null);
  const [editablePlanName, setEditableName]   = useState('');
  const [days, setDayList]                    = useState([]);
  const [pickerDayIndex, setPickerDayIdx]     = useState(null);
  const [showPicker, setShowPicker]           = useState(false);
  const [saving, setSaving]                   = useState(false);

  // S5: editing an already-saved plan (reached with a planId param, e.g. from
  // PlanDetailScreen's Manage section) bypasses Page 1 entirely and loads
  // straight into the Page 2 editor, the same surface used to author a new
  // plan, so every affordance below (steppers, duplicate, supersets) is
  // available on a plan someone comes back to later.
  const isEditMode = !!planId;
  const [loadingExisting, setLoadingExisting] = useState(isEditMode);
  // Existing routines removed locally during this edit session. Nothing here
  // writes until Save (matching the rest of this screen's model), so the
  // actual soft-delete happens in persistDays; Undo simply un-marks it.
  const [removedRoutineIds, setRemovedRoutineIds] = useState([]);
  // CP-10 batch G (2026-07-11): live theme (src/hooks/useTheme.js).
  const t = useTheme();
  const live = useMemo(() => buildLiveStyles(t), [t]);

  useEffect(() => {
    if (!planId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const [plan, routines] = await Promise.all([
          getProgrammeById(planId),
          getRoutinesForPlan(planId),
        ]);
        if (!plan) throw new Error('Plan not found');
        const loadedDays = await Promise.all(routines.map(async (routine) => {
          const withDetails = await getRoutineExercisesWithDetails(routine.id);
          return {
            // Reuse the real routine id as the local id: it's already
            // unique and lets persistDays recognise this as an existing
            // day (routineId set) rather than a brand new one.
            localId: routine.id,
            name: routine.name,
            routineId: routine.id,
            exercises: withDetails.map(({ routineExercise, exercise }) => ({
              localId: routineExercise.id,
              id: exercise.id,
              name: exercise.name,
              primaryMuscle: (exercise.primaryMuscle || '').toLowerCase() || null,
              // Plan-D builder nudge: carried so handleGroupSuperset can reuse
              // the engine's own pairing classifier (classifySupersetPair).
              equipmentCategory: exercise.equipmentCategory || null,
              compoundIsolation: exercise.compoundIsolation || null,
              sets: routineExercise.recommendedSets ?? DEFAULT_SETS,
              repsMin: routineExercise.recommendedRepsMin ?? 8,
              repsMax: routineExercise.recommendedRepsMax ?? 12,
              restSeconds: routineExercise.restSeconds ?? DEFAULT_REST,
              supersetGroupId: routineExercise.supersetGroupId ?? null,
              // EL-9: 'circuit' | null (superset/no group). round_rest_seconds
              // travels with every member so ungrouping one member never
              // loses the group's own setting for the rest.
              groupKind: routineExercise.groupKind ?? null,
              roundRestSeconds: routineExercise.roundRestSeconds ?? null,
            })),
          };
        }));
        if (cancelled) return;
        setProgrammeId(planId);
        setEditableName(plan.name || '');
        setDayList(loadedDays);
        setPage(2);
      } catch (e) {
        if (cancelled) return;
        logError('ManualBuilderScreen.loadExistingPlan', e, { planId });
        toast.show("Couldn't load this plan, try again", { variant: 'error' });
        navigation.goBack();
      } finally {
        if (!cancelled) setLoadingExisting(false);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId]);

  // A5: set the instant a completed save is about to leave the screen, so the
  // D139 discard confirm below (which watches every removal) stays out of the
  // way of a save that has already been written. Synchronous ref, not state:
  // the removal is dispatched in the same tick.
  const savedAndLeavingRef = useRef(false);

  // D139: hardware back / header back / swipe-back off page 2 with unsaved
  // exercises must ask before discarding them. Nothing has been written yet
  // at this point (the programme row is created by ensureProgramme on Save,
  // never before), so there is no row to clean up here -- this is purely
  // the confirm a person who put in real work deserves. Edit mode is
  // unchanged (S5): leaving an edit session was never gated like this and
  // this build does not add it. Guards navigation.addListener defensively
  // (a test-mounted screen, or an isolated render, may hand in a
  // navigation object without it), the same tolerance BackHeader's own
  // useNavigation() try/catch carries.
  useEffect(() => {
    if (isEditMode || page !== 2) return undefined;
    if (typeof navigation?.addListener !== 'function') return undefined;
    const hasWork = days.some(d => d.exercises.length > 0);
    const unsub = navigation.addListener('beforeRemove', (e) => {
      if (!hasWork) return;
      // A5: "Save draft" now pops this stack, which is a removal. The work
      // has just been written, so the discard confirm must not fire on it.
      if (savedAndLeavingRef.current) return;
      e.preventDefault();
      appAlert('Discard this plan?', 'The workouts you added here will not be saved.', [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
      ]);
    });
    return unsub;
  }, [navigation, isEditMode, page, days]);

  // ── Page 1: move to page 2 (no write yet) ─────────────────────────────────
  // D139 (lead programme ruling): this used to write the programme row
  // immediately, so abandoning page 2 left an empty plan behind in My
  // plans. Page 1's inputs (planName/selectedGoal/daysPerWeek) already live
  // in state and stay there; the real programme row is created on the
  // FIRST save, by ensureProgramme() below (called from persistDays'
  // three callers), when there is finally something worth keeping.

  function handleCreatePlan() {
    if (!planName.trim()) {
      toast.show('Enter a name for your plan', { variant: 'warning' });
      return;
    }
    if (!user?.id) {
      toast.show('Setting up your profile, try again in a second', { variant: 'info' });
      return;
    }
    setEditableName(planName.trim());
    setDayList(
      Array.from({ length: daysPerWeek }, (_, i) => ({
        localId:   `day-${i}-${Date.now()}`,
        name:      `Day ${i + 1}`,
        exercises: [],
        routineId: null,
      })),
    );
    setPage(2);
    track(user.id, 'manual_plan_started', {})?.catch?.(() => {});
  }

  // ── Page 2: day & exercise management ────────────────────────────────────

  function openPicker(dayIndex) {
    setPickerDayIdx(dayIndex);
    setShowPicker(true);
  }

  function handleExerciseSelected(exercise) {
    if (pickerDayIndex === null) return;
    setDayList(prev => prev.map((d, i) => {
      if (i !== pickerDayIndex) return d;
      return {
        ...d,
        exercises: [
          ...d.exercises,
          {
            localId:      `${Date.now()}-${Math.random()}`,
            id:           exercise.id,
            name:         exercise.name,
            primaryMuscle: (exercise.primaryMuscle || exercise.primary_muscle || '').toLowerCase() || null,
            // Plan-D builder nudge: carried so handleGroupSuperset can reuse
            // the engine's own pairing classifier (classifySupersetPair).
            equipmentCategory: exercise.equipmentCategory || exercise.equipment_category || null,
            compoundIsolation: exercise.compoundIsolation || exercise.compound_isolation || null,
            sets:         DEFAULT_SETS,
            repsMin:      exercise.defaultRepMin || exercise.default_rep_min || 8,
            repsMax:      exercise.defaultRepMax || exercise.default_rep_max || 12,
            // B9 deterministic rest suggestion (compound 180s / isolation
            // 90s), the same fixed table BuildWorkoutScreen falls back to.
            // Editable via the stepper the moment it's added.
            restSeconds:  suggestRestSeconds({ exercise }),
          },
        ],
      };
    }));
  }

  function handleLongPressExercise(dayIndex, exLocalId, exName) {
    // Undo pattern: remove immediately + toast with Undo for 8 seconds.
    // No "Are you sure?" Alert, the safety net is the Undo button.
    // Captures the removed exercise so Undo can put it back at its
    // original index, not the end.
    haptics.commit();
    let removed = null;
    let removedIndex = -1;
    setDayList(prev => prev.map((d, i) => {
      if (i !== dayIndex) return d;
      const idx = d.exercises.findIndex(e => e.localId === exLocalId);
      if (idx === -1) return d;
      removed = d.exercises[idx];
      removedIndex = idx;
      return { ...d, exercises: d.exercises.filter(e => e.localId !== exLocalId) };
    }));
    if (!removed) return;
    toast.show(`Removed ${exName}`, {
      variant: 'undo',
      action: {
        label: 'Undo',
        onPress: () => {
          haptics.selection();
          setDayList(prev => prev.map((d, i) => {
            if (i !== dayIndex) return d;
            const next = d.exercises.slice();
            next.splice(removedIndex, 0, removed);
            return { ...d, exercises: next };
          }));
        },
      },
    });
  }

  function handleAddDay() {
    haptics.selection();
    setDayList(prev => [
      ...prev,
      { localId: `day-${Date.now()}`, name: `Day ${prev.length + 1}`, exercises: [], routineId: null },
    ]);
  }

  function handleRemoveDay(dayIndex) {
    // Same Undo pattern as exercise removal: remove immediately, no
    // confirm Alert, an Undo toast restores the whole day (incl. its
    // exercises) at its original position. Read the day straight from the
    // current render's days (not a setDayList updater's side effect, which
    // runs on React's own schedule) so the routineId check below is never
    // stale.
    const removed = days[dayIndex];
    if (!removed) return;
    haptics.commit();
    setDayList(prev => prev.filter((_, i) => i !== dayIndex));
    // S5 edit mode: this day may already be a saved routine. Nothing is
    // written until Save, so mark it for soft-delete then (persistDays)
    // rather than deleting it here.
    if (removed.routineId) {
      setRemovedRoutineIds(prev => [...prev, removed.routineId]);
    }
    toast.show(`Removed ${removed.name}`, {
      variant: 'undo',
      action: {
        label: 'Undo',
        onPress: () => {
          haptics.selection();
          setDayList(prev => {
            const next = prev.slice();
            next.splice(dayIndex, 0, removed);
            return next;
          });
          if (removed.routineId) {
            setRemovedRoutineIds(prev => prev.filter(id => id !== removed.routineId));
          }
        },
      },
    });
  }

  function updateDayName(dayIndex, newName) {
    setDayList(prev => prev.map((d, i) => i === dayIndex ? { ...d, name: newName } : d));
  }

  function handleDuplicateDay(dayIndex) {
    const original = days[dayIndex];
    if (!original) return;
    // Remap superset group ids so the clone's pairs are independent of the
    // original's (grouping/ungrouping one copy never touches the other).
    const groupIdMap = {};
    const clonedExercises = original.exercises.map(ex => {
      let newGroupId = null;
      if (ex.supersetGroupId) {
        if (!groupIdMap[ex.supersetGroupId]) {
          groupIdMap[ex.supersetGroupId] = `ss-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        }
        newGroupId = groupIdMap[ex.supersetGroupId];
      }
      return { ...ex, localId: uid(), supersetGroupId: newGroupId };
    });
    const clone = {
      localId: uid(),
      name: `${original.name} (copy)`,
      exercises: clonedExercises,
      // A fresh day, even when duplicating one that's already saved: it
      // gets its own new routine on Save, the original is untouched.
      routineId: null,
    };
    // Append at the end rather than right after the original: day order persists
    // purely by routine created_at (there is no position column yet), and the
    // clone gets a brand new routine on Save, so it always reloads last. Placing
    // it last here keeps the on-screen order identical to the saved-and-reloaded
    // order, instead of showing it mid-list then having it jump to the end.
    haptics.selection();
    setDayList(prev => [...prev, clone]);
    toast.show(`Duplicated ${original.name}`, { variant: 'success' });
  }

  // ── Supersets ─────────────────────────────────────────────────────────────
  // Exercises in a day that share the same supersetGroupId are one superset.
  // The user multi-selects rows (per day) then groups them; the engine and
  // ActiveWorkout already understand a shared supersetGroupId. We only write
  // the existing field, no schema or write-path change.

  // { [dayIdx]: Set<exLocalId> } of rows currently selected for grouping.
  const [supersetSelection, setSupersetSelection] = useState({});

  function toggleSupersetSelect(dayIndex, exLocalId) {
    // Giant sets (campaign item 21): a group may hold three or more exercises.
    // The live session cycles every member of a shared supersetGroupId in order
    // (A -> B -> C -> back to A), so there is no longer a pair cap here.
    // Auto-generated pairings stay pairs-only in the engine (assignSupersets);
    // this is the user-built giant-set path.
    haptics.selection();
    setSupersetSelection(prev => {
      const next = new Set(prev[dayIndex] || []);
      if (next.has(exLocalId)) next.delete(exLocalId);
      else next.add(exLocalId);
      return { ...prev, [dayIndex]: next };
    });
  }

  function clearSupersetSelection(dayIndex) {
    setSupersetSelection(prev => ({ ...prev, [dayIndex]: new Set() }));
  }

  function handleGroupSuperset(dayIndex) {
    const selected = supersetSelection[dayIndex];
    if (!selected || selected.size < 2) {
      toast.show('Select at least two exercises to superset', { variant: 'warning' });
      return;
    }
    haptics.selection();

    // Plan-D Option B/C calm nudge (docs/exercise-planning-2026-07-09/
    // plan-D-intelligent-supersets.md), extended to giant sets (campaign
    // item 21): reuse the auto-gen engine's own relationship + equipment-zone
    // classifier so the builder shares the same "coach-logical" bar the engine
    // already enforces, without enforcing it here. For a giant set of 3+ we
    // classify each consecutive link in day order; if any link clears neither
    // bar we nudge once. Never blocks; a link is only judged when both members
    // resolve a muscle (an unclassifiable custom exercise never gets a false
    // nudge).
    const members = (days[dayIndex]?.exercises || []).filter(ex => selected.has(ex.localId));
    let anyImpractical = false;
    for (let k = 0; k < members.length - 1; k++) {
      const a = members[k];
      const b = members[k + 1];
      if (!a.primaryMuscle || !b.primaryMuscle) continue;
      if (!classifySupersetPair(a, b).practical) { anyImpractical = true; break; }
    }
    if (anyImpractical) {
      toast.show(
        'Supersets work best when the exercises share a station or target opposing muscles.',
        { variant: 'info' },
      );
    }

    const groupId = `ss-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setDayList(prev => prev.map((d, i) => {
      if (i !== dayIndex) return d;
      return {
        ...d,
        exercises: d.exercises.map(ex =>
          selected.has(ex.localId) ? { ...ex, supersetGroupId: groupId } : ex,
        ),
      };
    }));
    clearSupersetSelection(dayIndex);
  }

  function handleUngroupSuperset(dayIndex, groupId) {
    haptics.commit();
    setDayList(prev => prev.map((d, i) => {
      if (i !== dayIndex) return d;
      return {
        ...d,
        exercises: d.exercises.map(ex =>
          ex.supersetGroupId === groupId ? { ...ex, supersetGroupId: null } : ex,
        ),
      };
    }));
  }

  // EL-9 circuit model (docs/exercise-library-expansion-2026-09-05/
  // 05-DECISIONS.md): a circuit is the SAME group primitive as a superset
  // (shared supersetGroupId, cycled A -> B -> C -> A by the live screen's
  // existing group advance) with group_kind:'circuit' and two behaviours
  // on top - rounds (recommended_sets) equalised across every member via
  // ONE group rounds stepper, and every member's rest_seconds forced to 0
  // (transition; the group's round_rest_seconds is the rest that fires
  // after the last station instead). Each member's PREVIOUS sets/rest are
  // captured so Ungroup can restore them exactly, never guess a default.
  function handleGroupCircuit(dayIndex) {
    const selected = supersetSelection[dayIndex];
    if (!selected || selected.size < 2) {
      toast.show('Select at least two exercises to make a circuit', { variant: 'warning' });
      return;
    }
    haptics.selection();
    const groupId = `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setDayList(prev => prev.map((d, i) => {
      if (i !== dayIndex) return d;
      const members = d.exercises.filter(ex => selected.has(ex.localId));
      // Starting rounds: the highest sets count already dialled in among
      // the selected exercises, clamped to the 2-6 template range - a
      // calmer starting point than always resetting to the bare default.
      const startingRounds = Math.max(
        MIN_ROUNDS,
        Math.min(MAX_ROUNDS, Math.max(DEFAULT_ROUNDS, ...members.map(m => m.sets || 0))),
      );
      return {
        ...d,
        exercises: d.exercises.map(ex => (
          selected.has(ex.localId)
            ? {
              ...ex,
              supersetGroupId: groupId,
              groupKind: 'circuit',
              // Restored verbatim on Ungroup.
              _preCircuitSets: ex.sets,
              _preCircuitRestSeconds: ex.restSeconds,
              sets: startingRounds,
              restSeconds: 0, // transition between stations, no rest (EL-9)
              roundRestSeconds: DEFAULT_ROUND_REST,
            }
            : ex
        )),
      };
    }));
    clearSupersetSelection(dayIndex);
  }

  function handleUngroupCircuit(dayIndex, groupId) {
    haptics.commit();
    setDayList(prev => prev.map((d, i) => {
      if (i !== dayIndex) return d;
      return {
        ...d,
        exercises: d.exercises.map(ex => {
          if (ex.supersetGroupId !== groupId) return ex;
          const { _preCircuitSets, _preCircuitRestSeconds, ...rest } = ex;
          return {
            ...rest,
            supersetGroupId: null,
            groupKind: null,
            roundRestSeconds: null,
            sets: _preCircuitSets ?? ex.sets,
            restSeconds: _preCircuitRestSeconds ?? DEFAULT_REST,
          };
        }),
      };
    }));
  }

  // The group's rounds stepper writes recommended_sets to EVERY member at
  // once (EL-9: rounds are kept equal within a circuit by the builder).
  function setGroupRounds(dayIndex, groupId, rounds) {
    const next = Math.max(MIN_ROUNDS, Math.min(MAX_ROUNDS, rounds));
    setDayList(prev => prev.map((d, i) => (i !== dayIndex ? d : {
      ...d,
      exercises: d.exercises.map(ex => (
        ex.supersetGroupId === groupId ? { ...ex, sets: next } : ex
      )),
    })));
  }

  // The group's round-rest stepper writes round_rest_seconds to EVERY
  // member (read off whichever station finishes the round).
  function setGroupRoundRest(dayIndex, groupId, seconds) {
    const next = Math.max(MIN_ROUND_REST, Math.min(MAX_ROUND_REST, seconds));
    setDayList(prev => prev.map((d, i) => (i !== dayIndex ? d : {
      ...d,
      exercises: d.exercises.map(ex => (
        ex.supersetGroupId === groupId ? { ...ex, roundRestSeconds: next } : ex
      )),
    })));
  }

  // ── Target steppers ───────────────────────────────────────────────────────
  // Single clamp-and-set helper behind every target change (sets, reps min/max,
  // rest), the same Math.max/Math.min clamp BuildWorkoutScreen's target editors
  // use.
  function setExerciseNumber(dayIndex, exLocalId, field, value, min, max) {
    // D8 calm nudge (founder ruling 2026-07-09): manual builder never blocks,
    // but a quiet one-line note past 4 sets on one exercise matches the
    // auto-gen cap's reasoning. Fires only on the crossing edge (<=4 -> >4),
    // not on every further +1, so it stays one quiet line rather than
    // nagging on 5->6->7. Read from the current `days` state directly
    // (rather than inside the setDayList updater below) because a functional
    // setState updater is not guaranteed to run synchronously, and a toast
    // fired from inside it could double-fire under React's strict-mode
    // double-invoke or fire out of step with the render that triggered it.
    if (field === 'sets') {
      const prevSets = days[dayIndex]?.exercises.find(ex => ex.localId === exLocalId)?.sets ?? 0;
      const next = Math.max(min, Math.min(max, value));
      if (next > 4 && prevSets <= 4) {
        toast.show('A second exercise from a different angle usually beats piling more sets onto this one.', { variant: 'info' });
      }
    }
    setDayList(prev => prev.map((d, i) => {
      if (i !== dayIndex) return d;
      return {
        ...d,
        exercises: d.exercises.map(ex => {
          if (ex.localId !== exLocalId) return ex;
          let next = Math.max(min, Math.min(max, value));
          // Keep the rep range coherent: min can never climb above max, nor max
          // drop below min, so a saved target can never read "13-12 reps".
          if (field === 'repsMin') next = Math.min(next, ex.repsMax ?? max);
          else if (field === 'repsMax') next = Math.max(next, ex.repsMin ?? min);
          return { ...ex, [field]: next };
        }),
      };
    }));
  }

  // ── Reorder ───────────────────────────────────────────────────────────────
  // T7 (docs/world-class-audit-2026-07-03/_SYNTHESIS.md:171): reorder
  // exercises within a day. react-native-gesture-handler is in the tree, but
  // no screen in the app builds a drag surface on it: RoutineDetailScreen's
  // exercise list (the one existing reorder UI) swaps adjacent rows via
  // up/down chevrons, so this matches that established convention rather
  // than introducing a new interaction. Nothing writes to the DB here, same
  // as every other edit on this page: the new order lives only in local
  // state until Save, when persistDays() below re-inserts routine_exercises
  // in array order (its `j` loop index becomes order_in_routine), so
  // reordering the in-memory list is all that's needed for the new order to
  // persist and reload correctly (getRoutineExercisesWithDetails reads back
  // `ORDER BY re.order_in_routine ASC`).
  function moveExercise(dayIndex, exLocalId, direction) {
    let moved = false;
    setDayList(prev => prev.map((d, i) => {
      if (i !== dayIndex) return d;
      // Reorder at the level of superset BLOCKS, not individual rows. A pair
      // sharing a supersetGroupId must stay adjacent (ActiveWorkout only treats
      // two ADJACENT same-group rows as a superset), so a move must never split
      // one: a pair travels as a single unit, and a lone exercise hops over a
      // whole pair rather than landing between its members. The block-move
      // arithmetic itself is shared (src/lib/reorder.js, D32 2026-07-10) with
      // every other reorder surface, unit-tested there directly.
      const exIndex = d.exercises.findIndex(e => e.localId === exLocalId);
      if (exIndex === -1) return d;
      const next = swapAdjacentBlocks(d.exercises, exIndex, direction, ex => ex.supersetGroupId ?? null);
      if (next === d.exercises) return d;
      moved = true;
      return { ...d, exercises: next };
    }));
    if (moved) haptics.selection();
  }

  // D32 (2026-07-10, campaign item 20): true long-press drag, additive to
  // the chevrons above. DragReorderList already fires the pickup/drop
  // haptics itself. Nothing writes to the DB here, same as every other edit
  // on this page (see moveExercise's own comment): the reordered array is
  // just the new in-memory day.exercises, persisted on Save by persistDays.
  function handleReorderDayExercises(dayIndex, nextExercises) {
    setDayList(prev => prev.map((d, i) => (i === dayIndex ? { ...d, exercises: nextExercises } : d)));
  }

  // ── Validation & persistence ──────────────────────────────────────────────

  function validate(requireExercises = true) {
    if (!editablePlanName.trim()) {
      toast.show('Give your plan a name before saving', { variant: 'warning' });
      return false;
    }
    if (days.length === 0) {
      toast.show('Add at least one training day', { variant: 'warning' });
      return false;
    }
    if (requireExercises) {
      const empty = days.find(d => d.exercises.length === 0);
      if (empty) {
        toast.show(`"${empty.name}" has no exercises. Add one or remove the day`, { variant: 'warning', duration: 5000 });
        return false;
      }
    }
    return true;
  }

  // D139: the programme row itself no longer exists by the time a save
  // handler calls this -- it is created HERE, on the first save, not on
  // page 1. `pid` is threaded in explicitly (rather than read off the
  // `programmeId` state) so a brand-new id from ensureProgramme() is used
  // immediately in the same save, with no stale-closure risk from waiting
  // on the setProgrammeId state update to land.
  async function persistDays(pid) {
    const d = await db();
    // Atomic: the edit path clear-and-reinserts a day's routine_exercises, so an
    // interruption between the delete (removeExerciseFromRoutine) and the
    // reinsert (addExerciseToRoutine) would otherwise leave a previously
    // populated day empty and unrecoverable. One transaction makes the whole
    // save all-or-nothing (mirrors duplicateRoutine). The helpers called
    // inside are raw single-statement writers; none may call runInTransaction
    // itself (nested calls deadlock the queue - contract tightened
    // 2026-07-11, see runInTransaction in database.js).
    await runInTransaction(d, async () => {
    for (let i = 0; i < days.length; i++) {
      const day = days[i];
      let routineId = day.routineId;
      if (routineId) {
        // S5 edit mode: an existing routine, loaded for editing. Keep its
        // identity (workout history references it by routine_id, never by
        // routine_exercises row id) so past sessions stay linked; rename if
        // changed, then rebuild its exercise list from the current local
        // state. routine_exercises are lightweight template rows with no FK
        // from logged workout_sets, so clear-and-reinsert is safe here, the
        // same approach duplicateRoutine already uses to copy a routine.
        await updateRoutineName(routineId, day.name.trim() || `Day ${i + 1}`);
        const existingExercises = await getRoutineExercisesWithDetails(routineId);
        for (const { routineExercise } of existingExercises) {
          await removeExerciseFromRoutine(routineExercise.id);
        }
      } else {
        const routine = await createRoutine(
          user.id,
          day.name.trim() || `Day ${i + 1}`,
          null, null, 0, null,
          pid,
        );
        routineId = routine.id;
      }
      for (let j = 0; j < day.exercises.length; j++) {
        const ex = day.exercises[j];
        await addExerciseToRoutine(
          routineId, ex.id, j, ex.repsMin, ex.repsMax, null, ex.sets,
          null, ex.restSeconds ?? null, ex.supersetGroupId ?? null,
          true, null, ex.groupKind ?? null, ex.roundRestSeconds ?? null,
        );
      }
    }
    // Days that existed on load but were removed during this edit session:
    // soft-delete now so they drop out of the plan everywhere else
    // (PlanDetailScreen's workout list etc.)
    for (const routineId of removedRoutineIds) {
      await softDeleteRoutine(routineId);
    }
    });
  }

  // D139: the programme row is created here, on the FIRST save, using page
  // 1's inputs (still sitting in state since handleCreatePlan stopped
  // writing them immediately). Edit mode never calls this -- programmeId is
  // already set from the load effect, so this is a no-op return for it.
  async function ensureProgramme() {
    if (programmeId) return programmeId;
    const goalLabel = GOALS.find(g => g.key === selectedGoal)?.label ?? selectedGoal;
    const prog = await createProgramme(user.id, planName.trim() || 'My Plan', goalLabel, 0);
    if (!prog?.id) throw new Error('Could not create plan.');
    setProgrammeId(prog.id);
    return prog.id;
  }

  const [successModal, setSuccessModal] = useState(false);
  const [savedPlanName, setSavedPlanName] = useState('');

  // RB-3 (D96, Review B): setSaving(true) happened AFTER the awaited
  // confirm, and confirmPlanSwitchMidBlock returns true silently in week 1,
  // so a first-week double tap ran two activations with no dialogue between
  // them. Synchronous ref, checked before anything awaits.
  const activatingRef = useRef(false);

  async function handleSaveAndActivate() {
    if (!validate(true)) return;
    if (activatingRef.current) return;
    activatingRef.current = true;
    // C5-P10-10 (D96): this was the ONE activation path that skipped
    // confirmPlanSwitchMidBlock, so a user who built their own plan in week
    // 3 silently restarted their block and never saw the one dialogue that
    // explains what activation does to it. Same call, same position
    // (before the write) as PlanLibrary, PlanDetail and PlansScreen.
    const ok = await confirmPlanSwitchMidBlock(user.id, {
      newPlanName: editablePlanName.trim() || planName.trim() || 'My Plan',
    });
    if (!ok) { activatingRef.current = false; return; }
    setSaving(true);
    try {
      // A rename on this final builder page lives in editablePlanName, not
      // the page-1 planName it started from. Use whichever the user
      // actually finished with, so the activated plan and the success
      // modal below both reflect the name they last saw on screen (matches
      // handleSaveDraft/handleSaveEdit, which persist editablePlanName too).
      const finalName = editablePlanName.trim() || planName.trim() || 'My Plan';
      const pid = await ensureProgramme();
      await updateProgrammeName(pid, finalName);
      await persistDays(pid);
      await activatePlanWithBlock(user.id, pid, finalName);
      track(user.id, 'manual_plan_saved', { activated: true })?.catch?.(() => {});
      setSavedPlanName(finalName);
      setSuccessModal(true);
    } catch (e) {
      logError('ManualBuilderScreen.handleSaveAndActivate', e);
      toast.show("Couldn't save your plan, try again", { variant: 'error' });
    } finally {
      setSaving(false);
      activatingRef.current = false;
    }
  }

  async function handleSaveDraft() {
    if (!validate(false)) return;
    setSaving(true);
    try {
      // Persist any rename made on the builder page (persistDays writes only
      // the routines, not the programme name).
      const pid = await ensureProgramme();
      await updateProgrammeName(pid, editablePlanName.trim() || 'My Plan');
      await persistDays(pid);
      track(user.id, 'manual_plan_saved', { activated: false })?.catch?.(() => {});
      // A5 (certification 2026-09-05): this was navigate('PlansTab'), the tab
      // this screen already lives in. The action bubbled to the tab navigator,
      // which was already focused on PlansTab and was handed no nested screen,
      // so nothing popped and "Save draft" left the person on the builder with
      // only a toast. Popping the Train stack is the primitive that actually
      // returns them to My plans, and it is what the sibling completions use
      // (WorkoutSummaryScreen.js:864,1005; CoachOutputScreen.js:2489).
      savedAndLeavingRef.current = true;
      navigation.popToTop();
    } catch (e) {
      logError('ManualBuilderScreen.handleSaveDraft', e);
      toast.show("Couldn't save your draft, try again", { variant: 'error' });
    } finally {
      setSaving(false);
    }
  }

  // A5 (certification 2026-09-05): the activation success sheet's "Go to
  // Today" used navigation.navigate('HomeTab'), a bare tab hop that bypassed
  // the sanctioned cross-tab helper and left ManualBuilder sitting on the
  // Train stack, so the next visit to Train re-opened the finished builder.
  // Two synchronous dispatches, no timer: switch tabs through the helper
  // (which also clears any retained history on Today), then pop the Train
  // stack behind us. The tab's stack stays mounted through a tab switch, so
  // the second dispatch lands; the saved-and-leaving ref keeps the D139
  // discard confirm out of a plan that has just been activated.
  function handleGoToToday() {
    setSuccessModal(false);
    savedAndLeavingRef.current = true;
    navigateCrossTab(navigation, 'HomeTab', 'Home');
    navigation.popToTop();
  }

  // S5 edit mode: a single Save, no separate Activate step. Re-running
  // activatePlanWithBlock on a plan someone is just editing would spin up a
  // brand new training block (and deload timing) as a side effect of, say,
  // adding one superset, an unrelated and surprising reset. Editing an
  // already-active plan should never touch that. Saves are lenient (matches
  // Save Draft), an edit session can leave a day empty and be finished later.
  async function handleSaveEdit() {
    if (!validate(false)) return;
    setSaving(true);
    try {
      // Persist the (possibly renamed) plan name too: persistDays only writes
      // the routines/day names, never the programme row.
      await updateProgrammeName(programmeId, editablePlanName.trim() || 'My Plan');
      await persistDays();
      toast.show('Plan updated', { variant: 'success' });
      navigation.goBack();
    } catch (e) {
      logError('ManualBuilderScreen.handleSaveEdit', e);
      toast.show("Couldn't save your changes, try again", { variant: 'error' });
    } finally {
      setSaving(false);
    }
  }

  // ── Loading an existing plan (S5 edit mode) ───────────────────────────────

  if (loadingExisting) {
    return (
      <SafeAreaView style={[styles.safe, live.safe]} edges={['top', 'bottom']}>
        <BackHeader title="Edit plan" />
        <View style={styles.page2Content}>
          <Skeleton width="55%" height={24} />
          <SkeletonCard height={140} />
          <SkeletonCard height={140} />
        </View>
      </SafeAreaView>
    );
  }

  // ── Page 1 render ─────────────────────────────────────────────────────────

  if (page === 1) {
    return (
      <SafeAreaView style={[styles.safe, live.safe]} edges={['top', 'bottom']}>
        <BackHeader title="Create a plan" />
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            contentContainerStyle={styles.page1Content}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={[styles.subtitle, live.subtitle]}>
              Set up the basics, then add your workouts day by day.
            </Text>

            {/* Plan name */}
            <View style={styles.section}>
              <TextField
                label="Plan name"
                accessibilityLabel="Plan name"
                fieldStyle={[styles.textField, live.textField]}
                inputStyle={[styles.textInput, live.textInput]}
                value={planName}
                onChangeText={setPlanName}
                placeholder="e.g. My Push Pull Legs"
                placeholderTextColor={t.colors.textMuted}
                autoCapitalize="words"
                returnKeyType="done"
              />
            </View>

            {/* Goal */}
            <View style={styles.section}>
              <Text style={[styles.label, live.label]}>Goal</Text>
              <View style={styles.pillWrap}>
                {GOALS.map(g => (
                  <Chip
                    key={g.key}
                    label={g.label}
                    selected={selectedGoal === g.key}
                    onPress={() => { haptics.selection(); setGoal(g.key); }}
                    accessibilityLabel={g.label}
                    style={styles.pill}
                    labelStyle={[styles.pillText, live.pillText]}
                  />
                ))}
              </View>
            </View>

            {/* Days per week */}
            <View style={styles.section}>
              <Text style={[styles.label, live.label]}>Training days per week</Text>
              <View style={styles.pillWrap}>
                {DAY_COUNT_OPTIONS.map(n => (
                  <Chip
                    key={n}
                    label={String(n)}
                    selected={daysPerWeek === n}
                    onPress={() => { haptics.selection(); setDaysPerWeek(n); }}
                    accessibilityLabel={`${n} training days per week`}
                    style={styles.dayCountPill}
                    labelStyle={[styles.pillText, live.pillText]}
                  />
                ))}
              </View>
              <Text style={[styles.hintText, live.hintText]}>
                We&apos;ll create {daysPerWeek} empty days. You can add or remove days later.
              </Text>
            </View>

            <Button variant="emphatic"
              title="Create plan and add workouts"
              icon="add-circle"
              size="lg"
              style={styles.primaryBtn}
              onPress={handleCreatePlan}
              accessibilityLabel="Create plan and add workouts"
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── Page 2 render ─────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[styles.safe, live.safe]} edges={['top', 'bottom']}>
      <BackHeader title={isEditMode ? 'Edit plan' : 'Create a plan'} />
      <ExercisePickerModal
        visible={showPicker}
        onClose={() => setShowPicker(false)}
        onSelect={handleExerciseSelected}
        saveLabel="Add to Plan"
        // EL-20: the day currently being built, so an empty-query browse
        // can surface "In your plan" ahead of Staples/All exercises.
        planExercises={pickerDayIndex !== null ? days[pickerDayIndex]?.exercises : undefined}
      />

      <ScrollView
        ref={scrollRef}
        onScroll={onScroll}
        onContentSizeChange={onContentSizeChange}
        scrollEventThrottle={16}
        contentContainerStyle={styles.page2Content}
        keyboardShouldPersistTaps="handled"
      >
        {/* Editable plan name */}
        <TextField
          accessibilityLabel="Plan name"
          containerStyle={styles.planNameFieldContainer}
          fieldStyle={[styles.planNameField, live.planNameField]}
          inputStyle={[styles.planNameInput, live.planNameInput]}
          value={editablePlanName}
          onChangeText={setEditableName}
          placeholder="Plan name"
          placeholderTextColor={t.colors.textMuted}
          autoCapitalize="words"
          returnKeyType="done"
        />

        {/* Day cards */}
        {days.map((day, dayIdx) => (
          <Card key={day.localId} style={styles.dayCard}>
            {/* Day header */}
            <View style={[styles.dayHeader, live.dayHeader]}>
              <View style={styles.dayHeaderLabel}>
                <Text style={[styles.dayNumber, live.dayNumber]}>Day {dayIdx + 1}</Text>
                {/* D139: how long this day takes, before someone leaves the
                    screen -- muted, so it reads as an estimate not a target. */}
                {day.exercises.length > 0 && (
                  <Text style={[styles.dayDuration, live.dayDuration]}>
                    {`~${estimateDayMinutes(day)} min`}
                  </Text>
                )}
              </View>
              <TextField
                accessibilityLabel={`Name for day ${dayIdx + 1}`}
                containerStyle={styles.dayNameFieldContainer}
                fieldStyle={styles.dayNameField}
                inputStyle={[styles.dayNameInput, live.dayNameInput]}
                value={day.name}
                onChangeText={v => updateDayName(dayIdx, v)}
                placeholder="Day name"
                placeholderTextColor={t.colors.textMuted}
              />
              <TouchableOpacity
                onPress={() => handleDuplicateDay(dayIdx)}
                hitSlop={hitSlop}
                accessibilityRole="button"
                accessibilityLabel={`Duplicate ${day.name}`}
              >
                <Ionicons name="copy-outline" size={18} color={t.colors.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleRemoveDay(dayIdx)}
                hitSlop={hitSlop}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${day.name}`}
              >
                <Ionicons name="trash-outline" size={18} color={t.colors.error} />
              </TouchableOpacity>
            </View>

            {/* Exercise list */}
            {day.exercises.length > 0 && (() => {
              const selected = supersetSelection[dayIdx] || new Set();
              // Order in which group ids first appear, for stable A/B/C labels.
              const groupOrder = [];
              for (const ex of day.exercises) {
                if (ex.supersetGroupId && !groupOrder.includes(ex.supersetGroupId)) {
                  groupOrder.push(ex.supersetGroupId);
                }
              }
              return (
                <View style={styles.exList}>
                  {/* D32 (2026-07-10, campaign item 20): true long-press
                      drag, block-aware (a superset/giant-set pair/group
                      always moves as one unit -- src/lib/reorder.js, shared
                      with moveExercise's chevron path just above). Additive:
                      the chevrons inside each row (styles.reorderCol) stay
                      the accessible move path, DragReorderList hides its
                      own drag handle from screen readers. Nothing writes to
                      the DB here, same as every other edit on this page --
                      persistDays() on Save is what commits the new order. */}
                  <DragReorderList
                    items={day.exercises}
                    keyExtractor={(ex) => ex.localId}
                    getGroupId={(ex) => ex.supersetGroupId ?? null}
                    onReorder={(next) => handleReorderDayExercises(dayIdx, next)}
                    handleAccessibilityLabel={(ex) => `Drag to reorder ${ex.name}`}
                    gap={spacing.xs}
                    scrollRef={scrollRef}
                    scrollOffset={scrollOffset}
                    renderRow={({ item: ex, index: exIdx }) => {
                    const isSelected = selected.has(ex.localId);
                    const groupIdx = ex.supersetGroupId ? groupOrder.indexOf(ex.supersetGroupId) : -1;
                    const isFirst = exIdx === 0;
                    const isLast = exIdx === day.exercises.length - 1;
                    // EL-9: a circuit group shows its rounds/round-rest
                    // steppers once, on the group's first member in day order.
                    const isCircuit = ex.groupKind === 'circuit';
                    const isFirstOfGroup = groupIdx >= 0
                      && day.exercises.findIndex(e => e.supersetGroupId === ex.supersetGroupId) === exIdx;
                    return (
                      <TouchableOpacity
                        style={[styles.exRow, live.exRow, isSelected && [styles.exRowSelected, live.exRowSelected]]}
                        onPress={() => toggleSupersetSelect(dayIdx, ex.localId)}
                        onLongPress={() => handleLongPressExercise(dayIdx, ex.localId, ex.name)}
                        delayLongPress={400}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        // F-13 (docs/final-certification-2026-09-05/
                        // 07-FINDINGS.md, evidence A5): a circuit station is
                        // spoken in rounds, and it is never offered for
                        // superset selection - a circuit is built and
                        // changed as a group, not paired row by row.
                        accessibilityLabel={isCircuit
                          ? `${ex.name}, ${ex.sets} round${ex.sets === 1 ? '' : 's'}`
                          : `${ex.name}, ${ex.sets} sets`}
                        accessibilityHint={isCircuit
                          ? 'Hold to remove'
                          : 'Tap to select for a superset, hold to remove'}
                        accessibilityState={{ selected: isSelected }}
                      >
                        <Ionicons
                          name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                          size={18}
                          color={isSelected ? t.colors.primary : t.colors.textMuted}
                        />
                        <View style={styles.exRowLeft}>
                          <View style={styles.exNameRow}>
                            <Text style={[styles.exName, live.exName]}>{ex.name}</Text>
                            {groupIdx >= 0 && (
                              <View style={[styles.ssChip, live.ssChip]}>
                                <Ionicons name={isCircuit ? 'repeat' : 'link'} size={11} color={t.colors.primary} />
                                <Text style={[styles.ssChipText, live.ssChipText]}>
                                  {isCircuit ? 'Circuit' : 'Superset'} {String.fromCharCode(65 + groupIdx)}
                                </Text>
                              </View>
                            )}
                          </View>
                          {/* EL-9: the group header, plus its rounds/round-rest
                              steppers, shown once on the first member. */}
                          {isCircuit && isFirstOfGroup && (
                            <Text style={[styles.groupBtnText, live.groupBtnText]}>
                              Circuit {String.fromCharCode(65 + groupIdx)} · {ex.sets} round{ex.sets === 1 ? '' : 's'} · {formatRest(ex.roundRestSeconds ?? DEFAULT_ROUND_REST)} between rounds
                            </Text>
                          )}
                          {isCircuit && isFirstOfGroup && (
                            <View style={styles.controls}>
                              <TargetStepper
                                label="Rounds"
                                value={ex.sets}
                                displayValue={ex.sets}
                                valueLabel={`${ex.sets} rounds`}
                                decreaseLabel="Decrease rounds"
                                increaseLabel="Increase rounds"
                                min={MIN_ROUNDS}
                                max={MAX_ROUNDS}
                                onChange={(next) => setGroupRounds(dayIdx, ex.supersetGroupId, next)}
                              />
                              <TargetStepper
                                label="Between rounds"
                                value={ex.roundRestSeconds ?? DEFAULT_ROUND_REST}
                                displayValue={formatRest(ex.roundRestSeconds ?? DEFAULT_ROUND_REST)}
                                valueLabel={`${formatRest(ex.roundRestSeconds ?? DEFAULT_ROUND_REST)} between rounds`}
                                decreaseLabel="Decrease rest between rounds"
                                increaseLabel="Increase rest between rounds"
                                min={MIN_ROUND_REST}
                                max={MAX_ROUND_REST}
                                step={15}
                                onChange={(next) => setGroupRoundRest(dayIdx, ex.supersetGroupId, next)}
                              />
                            </View>
                          )}
                          <View style={styles.controls}>
                            {!isCircuit && (
                              <TargetStepper
                                label="Sets"
                                value={ex.sets}
                                displayValue={ex.sets}
                                valueLabel={`${ex.sets} sets`}
                                decreaseLabel={`Decrease sets for ${ex.name}`}
                                increaseLabel={`Increase sets for ${ex.name}`}
                                min={1}
                                max={20}
                                onChange={(next) => setExerciseNumber(dayIdx, ex.localId, 'sets', next, 1, 20)}
                              />
                            )}
                            <TargetStepper
                              label="Reps min"
                              value={ex.repsMin}
                              displayValue={ex.repsMin}
                              valueLabel={`${ex.repsMin} minimum reps`}
                              decreaseLabel={`Decrease minimum reps for ${ex.name}`}
                              increaseLabel={`Increase minimum reps for ${ex.name}`}
                              min={1}
                              max={50}
                              onChange={(next) => setExerciseNumber(dayIdx, ex.localId, 'repsMin', next, 1, 50)}
                            />
                            <TargetStepper
                              label="Reps max"
                              value={ex.repsMax}
                              displayValue={ex.repsMax}
                              valueLabel={`${ex.repsMax} maximum reps`}
                              decreaseLabel={`Decrease maximum reps for ${ex.name}`}
                              increaseLabel={`Increase maximum reps for ${ex.name}`}
                              min={1}
                              max={50}
                              onChange={(next) => setExerciseNumber(dayIdx, ex.localId, 'repsMax', next, 1, 50)}
                            />
                            {!isCircuit && (
                              <TargetStepper
                                label="Rest"
                                value={ex.restSeconds ?? DEFAULT_REST}
                                displayValue={formatRest(ex.restSeconds ?? DEFAULT_REST)}
                                valueLabel={`Rest ${formatRest(ex.restSeconds ?? DEFAULT_REST)}`}
                                decreaseLabel={`Decrease rest for ${ex.name}`}
                                increaseLabel={`Increase rest for ${ex.name}`}
                                min={30}
                                max={600}
                                step={15}
                                onChange={(next) => setExerciseNumber(dayIdx, ex.localId, 'restSeconds', next, 30, 600)}
                              />
                            )}
                          </View>
                        </View>
                        <View style={styles.reorderCol}>
                          <TouchableOpacity
                            onPress={() => moveExercise(dayIdx, ex.localId, 'up')}
                            disabled={isFirst}
                            style={[styles.reorderBtn, live.reorderBtn, isFirst && styles.reorderBtnDisabled]}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            accessibilityRole="button"
                            accessibilityLabel={`Move ${ex.name} up`}
                            accessibilityState={{ disabled: isFirst }}
                          >
                            <Ionicons name="chevron-up" size={14} color={isFirst ? t.colors.border : t.colors.textMuted} />
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => moveExercise(dayIdx, ex.localId, 'down')}
                            disabled={isLast}
                            style={[styles.reorderBtn, live.reorderBtn, isLast && styles.reorderBtnDisabled]}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            accessibilityRole="button"
                            accessibilityLabel={`Move ${ex.name} down`}
                            accessibilityState={{ disabled: isLast }}
                          >
                            <Ionicons name="chevron-down" size={14} color={isLast ? t.colors.border : t.colors.textMuted} />
                          </TouchableOpacity>
                        </View>
                        {groupIdx >= 0 && (
                          <TouchableOpacity
                            onPress={() => (isCircuit
                              ? handleUngroupCircuit(dayIdx, ex.supersetGroupId)
                              : handleUngroupSuperset(dayIdx, ex.supersetGroupId))}
                            hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
                            accessibilityRole="button"
                            accessibilityLabel={`Ungroup ${isCircuit ? 'circuit' : 'superset'} ${String.fromCharCode(65 + groupIdx)}`}
                          >
                            <Ionicons name="close-circle-outline" size={16} color={t.colors.textMuted} />
                          </TouchableOpacity>
                        )}
                        {/* Phase 10 finding #1 (discoverability audit
                            2026-08-10): removal was long-press-only with a
                            screen-reader-only disclosure. Visible remove
                            control, mirroring the day-level trash icon at
                            :1006-1013. Reuses the same handler/undo-toast
                            path as the long press below - no new state. */}
                        <TouchableOpacity
                          onPress={() => handleLongPressExercise(dayIdx, ex.localId, ex.name)}
                          hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
                          accessibilityRole="button"
                          accessibilityLabel={`Remove ${ex.name}`}
                        >
                          <Ionicons name="trash-outline" size={16} color={t.colors.error} />
                        </TouchableOpacity>
                      </TouchableOpacity>
                    );
                    }}
                  />

                  {selected.size >= 2 && (
                    <View style={styles.groupBtnRow}>
                      <Button
                        title={`Group ${selected.size} into superset`}
                        icon="link"
                        variant="tertiary"
                        size="sm"
                        onPress={() => handleGroupSuperset(dayIdx)}
                        style={styles.groupBtn}
                        textStyle={[styles.groupBtnText, live.groupBtnText]}
                        accessibilityLabel={`Group ${selected.size} exercises into a superset`}
                      />
                      {/* NV-2: "superset" is unexplained jargon for a novice
                          building their own plan (no equivalent of the
                          in-session teaching modal here). */}
                      <InfoTooltip text={GLOSSARY.superset} size={14} />
                    </View>
                  )}
                  {/* EL-9: the circuit action sits beside the existing
                      superset action rather than replacing it - a circuit
                      is a different group KIND, not a superset variant. */}
                  {selected.size >= 2 && (
                    <View style={styles.groupBtnRow}>
                      <Button
                        title={`Make circuit of ${selected.size}`}
                        icon="repeat"
                        variant="tertiary"
                        size="sm"
                        onPress={() => handleGroupCircuit(dayIdx)}
                        style={styles.groupBtn}
                        textStyle={[styles.groupBtnText, live.groupBtnText]}
                        accessibilityLabel={`Make a circuit of ${selected.size} exercises`}
                      />
                      <InfoTooltip text={GLOSSARY.circuit} size={14} />
                    </View>
                  )}
                </View>
              );
            })()}

            {/* Add exercise button */}
            <Button
              title="Add exercise"
              icon="add"
              variant="tertiary"
              size="sm"
              fullWidth={false}
              onPress={() => openPicker(dayIdx)}
              style={styles.addExBtn}
              textStyle={[styles.addExText, live.addExText]}
              accessibilityLabel="Add exercise"
            />
          </Card>
        ))}

        {/* Add day */}
        <Button
          title="Add day"
          icon="add-circle-outline"
          variant="outline"
          onPress={handleAddDay}
          style={[styles.addDayBtn, live.addDayBtn]}
          textStyle={[styles.addDayText, live.addDayText]}
          accessibilityLabel="Add day"
        />

        {/* Plan balance */}
        <PlanBalanceCard days={days} />

        {/* Action buttons. Editing an existing plan gets one calm Save: no
            separate Activate step, so saving a superset tweak never spins up
            a new training block as a side effect (see handleSaveEdit). */}
        {isEditMode ? (
          <View style={styles.actionRow}>
            <Button
              title="Save changes"
              icon="checkmark-circle"
              style={[styles.activateBtn, saving && styles.btnDisabled]}
              textStyle={[styles.activateBtnText, live.activateBtnText]}
              onPress={handleSaveEdit}
              disabled={saving}
              loading={saving}
              accessibilityLabel="Save changes"
              accessibilityState={{ disabled: saving }}
            />
          </View>
        ) : (
          <View style={styles.actionRow}>
            <Button
              title="Save draft"
              variant="secondary"
              style={[styles.draftBtn, saving && styles.btnDisabled]}
              textStyle={[styles.draftBtnText, live.draftBtnText]}
              onPress={handleSaveDraft}
              disabled={saving}
              loading={saving}
              accessibilityLabel="Save draft"
              accessibilityState={{ disabled: saving }}
            />
            <Button
              title="Save and activate"
              icon="flash"
              style={[styles.activateBtn, saving && styles.btnDisabled]}
              textStyle={[styles.activateBtnText, live.activateBtnText]}
              onPress={handleSaveAndActivate}
              disabled={saving}
              loading={saving}
              accessibilityLabel="Save and activate"
              accessibilityState={{ disabled: saving }}
            />
          </View>
        )}
      </ScrollView>

      {/* Success Sheet */}
      <BottomSheet
        visible={successModal}
        onClose={() => setSuccessModal(false)}
        accessibilityLabel="Plan activated"
        sheetStyle={styles.successSheet}
      >
        <View style={styles.successIconWrap}>
          <Ionicons name="checkmark-circle" size={48} color={t.colors.success} />
        </View>
        <Text style={[styles.successTitle, live.successTitle]}>Plan activated</Text>
        <Text style={[styles.successName, live.successName]}>{savedPlanName}</Text>
        {/* C5-P10-01 (D96): "Your plan is set as active and ready to use"
            never mentioned that a training block had just been created,
            with a fixed effort ladder and a scheduled recovery week. Same
            tier-blind sentence the other activation paths state. */}
        <Text style={[styles.successSub, live.successSub]}>
          Your plan is set as active and ready to use. {BLOCK_START_SENTENCE}
        </Text>
        <View style={styles.successActions}>
          <Button
            title="Stay here"
            variant="secondary"
            fullWidth={false}
            style={styles.successSecondary}
            textStyle={[styles.successSecondaryText, live.successSecondaryText]}
            onPress={() => setSuccessModal(false)}
            accessibilityLabel="Stay here"
          />
          {/* C5-P10-06 (D96): this button was labelled "Go to Train" and
              navigated to HomeTab, the tab titled "Today", while the same
              screen's Save draft goes to PlansTab, the tab titled "Train".
              One word meant two destinations. The label is corrected rather
              than the route: Today is where the freshly activated plan's
              next session waits, which is the useful landing. */}
          <Button
            title="Go to Today"
            icon="home"
            fullWidth={false}
            style={styles.successPrimary}
            textStyle={[styles.successPrimaryText, live.successPrimaryText]}
            onPress={handleGoToToday}
            accessibilityLabel="Go to Today"
          />
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // ── Page 1 ──────────────────────────────────────────────────────────────────

  page1Content: {
    padding: spacing.lg,
    gap: spacing.xl,
    paddingBottom: spacing.xxxl,
  },
  subtitle: {
    ...type.bodySm,
    color: colors.textMuted,
    marginTop: 0,
  },
  section: {
    gap: spacing.md,
  },
  label: {
    ...type.label,
    color: colors.textSecondary,
  },
  textField: {
    backgroundColor: colors.inputBg,
    borderRadius: radius.md,
  },
  textInput: {
    ...type.body,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  pillWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
  },
  pillText: {
    ...type.label,
  },
  dayCountPill: {
    minWidth: 48,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
  },
  hintText: {
    ...type.captionTight,
    color: colors.textMuted,
  },
  // Coherence pass: label typography and the disabled state come from the
  // shared Button primitive (size="lg"), so only the local margin survives.
  primaryBtn: {
    marginTop: spacing.sm,
  },

  // ── Page 2 ──────────────────────────────────────────────────────────────────

  page2Content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  planNameFieldContainer: {
    gap: 0,
    marginBottom: spacing.xs,
  },
  planNameField: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    borderRadius: 0,
    minHeight: 48,
  },
  planNameInput: {
    ...type.h2,
    paddingBottom: spacing.sm,
    paddingHorizontal: 0,
    paddingTop: 0,
  },
  dayCard: {
    padding: 0,
    overflow: 'hidden',
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dayHeaderLabel: {
    minWidth: 44,
  },
  dayNumber: {
    fontSize: fontSize.xs,
    fontFamily: fontFamily.heavy, fontWeight: fontWeight.black,
    color: colors.primary,
  },
  dayDuration: {
    ...type.captionTight,
    color: colors.textMuted,
    marginTop: 2,
  },
  dayNameFieldContainer: {
    flex: 1,
    gap: 0,
  },
  dayNameField: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    minHeight: 32,
  },
  dayNameInput: {
    ...type.bodyStrong,
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  exList: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    gap: spacing.xs,
  },
  exRow: {
    flexDirection: 'row',
    // flex-start, not center: the control row below the exercise name can
    // wrap onto a second line, so the leading select icon stays pinned to
    // the name rather than floating in the middle of a taller row.
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.surface3,
  },
  exRowSelected: {
    backgroundColor: colors.primaryBg,
    borderRadius: radius.sm,
  },
  exRowLeft: {
    flex: 1,
    gap: spacing.xxs,
  },
  // T7: up/down reorder controls, same reorderActions/reorderBtn look as
  // RoutineDetailScreen's existing exercise-reorder chevrons.
  reorderCol: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: spacing.xxs,
  },
  reorderBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    backgroundColor: colors.surface2,
  },
  reorderBtnDisabled: {
    opacity: 0.3,
  },
  exNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  ssChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.sm,
    backgroundColor: colors.primaryBg,
  },
  ssChipText: {
    fontSize: fontSize.xs,
    fontFamily: fontFamily.semibold, fontWeight: fontWeight.semibold,
    color: colors.primary,
  },
  groupBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  groupBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    flex: 1,
  },
  groupBtnText: {
    ...type.label,
    color: colors.primary,
  },
  exName: {
    fontSize: fontSize.md,
    fontFamily: fontFamily.medium, fontWeight: fontWeight.medium,
    color: colors.textPrimary,
  },
  // Target steppers (S5): compact layout around the shared Stepper primitive.
  controls: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  controlGroup: {
    gap: spacing.xs,
    alignItems: 'center',
    minWidth: 70,
  },
  controlLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontFamily: fontFamily.medium, fontWeight: fontWeight.medium,
    textAlign: 'center',
  },
  addExBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  addExText: {
    ...type.label,
    color: colors.primary,
  },
  addDayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderStyle: 'dashed',
    paddingVertical: spacing.lg,
  },
  addDayText: {
    fontSize: fontSize.md,
    fontFamily: fontFamily.medium, fontWeight: fontWeight.medium,
    color: colors.textSecondary,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  draftBtn: {
    flex: 1,
    paddingVertical: spacing.lg,
  },
  draftBtnText: {
    ...type.bodyStrong,
    color: colors.textSecondary,
  },
  activateBtn: {
    flex: 2,
    paddingVertical: spacing.lg,
  },
  activateBtnText: {
    ...type.bodyStrong,
    color: colors.textPrimary,
  },
  successSheet: {
    alignItems: 'center',
    gap: spacing.md,
  },
  successIconWrap: {
    marginBottom: spacing.sm,
  },
  successTitle: {
    fontSize: fontSize.xxl,
    fontFamily: fontFamily.heavy, fontWeight: fontWeight.black,
    color: colors.textPrimary,
  },
  successName: {
    ...type.title,
    color: colors.primary,
    textAlign: 'center',
  },
  successSub: {
    ...type.bodySm,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  successActions: {
    flexDirection: 'row',
    gap: spacing.md,
    width: '100%',
  },
  successSecondary: {
    flex: 1,
    paddingVertical: spacing.lg,
  },
  successSecondaryText: {
    ...type.bodyStrong,
    color: colors.textSecondary,
  },
  successPrimary: {
    flex: 1,
    paddingVertical: spacing.lg,
  },
  successPrimaryText: {
    ...type.bodyStrong,
    color: colors.textPrimary,
  },
});

// CP-10 batch G (2026-07-11): the frozen `styles` block above stays byte-
// identical. This mirrors ONLY the colour/fontSize/type-bearing sub-
// properties of the matching frozen style, at identical rest values, so the
// screen carries no static island under a live theme toggle. Pure layout
// keys (flex/gap/padding/borderWidth/borderRadius/borderStyle, no token) and
// fontWeight/opacity (not part of the live theme table) are correctly
// omitted -- there is nothing to unfreeze for them. Same pattern as
// DebugLogScreen.js's buildLiveStyles (batch F).
function buildLiveStyles(t) {
  return {
    safe: { backgroundColor: t.colors.background },
    subtitle: { ...t.type.bodySm, color: t.colors.textMuted },
    label: { ...t.type.label, color: t.colors.textSecondary },
    textField: { backgroundColor: t.colors.inputBg },
    textInput: { ...t.type.body },
    pillText: { ...t.type.label },
    hintText: { ...t.type.captionTight, color: t.colors.textMuted },
    planNameField: { borderBottomColor: t.colors.borderLight },
    planNameInput: { ...t.type.h2 },
    dayHeader: { borderBottomColor: t.colors.border },
    dayNumber: { fontSize: t.fontSize.xs, color: t.colors.primary },
    dayDuration: { ...t.type.captionTight, color: t.colors.textMuted },
    dayNameInput: { ...t.type.bodyStrong },
    exRow: { borderBottomColor: t.colors.surface3 },
    exRowSelected: { backgroundColor: t.colors.primaryBg },
    reorderBtn: { backgroundColor: t.colors.surface2 },
    ssChip: { backgroundColor: t.colors.primaryBg },
    ssChipText: { fontSize: t.fontSize.xs, color: t.colors.primary },
    groupBtnText: { ...t.type.label, color: t.colors.primary },
    exName: { fontSize: t.fontSize.md, color: t.colors.textPrimary },
    controlLabel: { fontSize: t.fontSize.xs, color: t.colors.textMuted },
    addExText: { ...t.type.label, color: t.colors.primary },
    addDayBtn: { backgroundColor: t.colors.surface, borderColor: t.colors.borderLight },
    addDayText: { fontSize: t.fontSize.md, color: t.colors.textSecondary },
    draftBtnText: { ...t.type.bodyStrong, color: t.colors.textSecondary },
    activateBtnText: { ...t.type.bodyStrong, color: t.colors.textPrimary },
    successTitle: { fontSize: t.fontSize.xxl, color: t.colors.textPrimary },
    successName: { ...t.type.title, color: t.colors.primary },
    successSub: { ...t.type.bodySm, color: t.colors.textSecondary },
    successSecondaryText: { ...t.type.bodyStrong, color: t.colors.textSecondary },
    successPrimaryText: { ...t.type.bodyStrong, color: t.colors.textPrimary },
  };
}

const balanceStyles = StyleSheet.create({
  card: {
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    fontSize: fontSize.sm,
    fontFamily: fontFamily.bold, fontWeight: fontWeight.bold,
    color: colors.textSecondary,
  },
  durationLine: {
    ...type.captionTight,
    color: colors.textMuted,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  cell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minWidth: '45%',
    flex: 1,
  },
  dot: {
    fontSize: fontSize.sm,
    lineHeight: 16,
  },
  muscleName: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    flex: 1,
  },
  setCount: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontFamily: fontFamily.semibold, fontWeight: fontWeight.semibold,
    minWidth: 24,
    textAlign: 'right',
  },
  // Card owns background/radius/padding here.
  warningBox: {
    gap: spacing.sm,
  },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  warningText: {
    ...type.captionTight,
    flex: 1,
    color: colors.textMuted,
  },
});

// CP-10 batch G (2026-07-11): the frozen `balanceStyles` block above stays
// byte-identical. This mirrors ONLY the colour/fontSize/type-bearing
// sub-properties of the matching frozen style, at identical rest values, so
// PlanBalanceCard carries no static island under a live theme toggle. Pure
// layout keys (flex/gap, no token) and fontWeight/lineHeight (not part of
// the live theme table) are correctly omitted -- there is nothing to
// unfreeze for them. Own function (not `buildLiveStyles`) because this is a
// separate StyleSheet.create block for PlanBalanceCard's own scope.
function buildBalanceLiveStyles(t) {
  return {
    title: { fontSize: t.fontSize.sm, color: t.colors.textSecondary },
    durationLine: { ...t.type.captionTight, color: t.colors.textMuted },
    dot: { fontSize: t.fontSize.sm },
    muscleName: { fontSize: t.fontSize.sm, color: t.colors.textSecondary },
    setCount: { fontSize: t.fontSize.xs, color: t.colors.textMuted },
    warningText: { ...t.type.captionTight, color: t.colors.textMuted },
  };
}
