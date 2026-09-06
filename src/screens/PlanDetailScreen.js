import { useState, useCallback, useMemo, useRef } from 'react';
import { appAlert } from '../components/AppAlert';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { colors, fontSize, fontWeight, spacing, radius, type, withAlpha, circle, iconSize, fontFamily } from '../styles/theme';
import useTheme from '../hooks/useTheme';
import AnimatedEntrance from '../components/AnimatedEntrance';
import {
  getProgrammeById, getRoutinesForPlan, getAllRoutineExerciseCounts,
  activatePlanWithBlock, archivePlan, copyPlanFromLibrary,
  createWorkout, getRoutineExercisesWithDetails, getActivePlan, getAllRoutineSetCounts,
  updateRoutinePosition,
} from '../lib/database';
import { PLAN_WHYTHIS_KEY } from '../lib/planAutoGen';
import { planHeadingName, planEquipmentLabel } from '../lib/planDisplay';
import { getPlanDays } from '../lib/onboarding/freeStarter';
import { BLOCK_START_SENTENCE, ACTIVATION_MEANING_SENTENCE } from '../lib/blockExplain';
import Button from '../components/Button';
import { Skeleton, SkeletonCard } from '../components/Skeleton';
import BackHeader from '../components/BackHeader';
import useAppStore from '../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import { logError } from '../lib/errorLog';
import { useToast } from '../components/Toast';
import { confirmPlanSwitchMidBlock } from '../lib/planSwitch';
import { getSplitRationale } from '../lib/whyThisTemplates';
import { summariseCircuitGroups, formatCircuitPreviewLine } from '../lib/circuitRound';
import { navigateCrossTab } from '../navigation/navigateCrossTab';
import { track } from '../lib/telemetry';
import Card from '../components/Card';
import SectionLabel from '../components/SectionLabel';
import DragReorderList from '../components/DragReorderList';
import { useDragAutoScrollBridge } from '../components/DragReorderList';
import * as haptics from '../lib/haptics';

// Same reading order the enrollment reveal uses: how the week is structured,
// then why the volume and progression, then exercise selection and the
// recovery / nutrition adjustments that shaped it.
const WHY_ORDER = ['schedule', 'goal', 'experience', 'progression', 'equipment', 'recovery', 'nutrition', 'weakPoints'];

export default function PlanDetailScreen({ navigation, route }) {
  const { planId, isLibrary = false } = route.params || {};
  // F7: subscribe to just these fields (a bare useAppStore() re-renders on every store mutation).
  // FOUNDER DECISION (fully free, no tier split): `tier` is no longer read
  // here -- the Duplicate action it used to gate is retired.
  const { user, startWorkout } = useAppStore(useShallow(s => ({
    user: s.user,
    startWorkout: s.startWorkout,
  })));
  const toast = useToast();
  // C6 P9-04 (D97): the one activation entry point RB-3 missed - the
  // same synchronous guard as PlansScreen/PlanLibrary/ManualBuilder.
  const activatingRef = useRef(false);
  const [plan, setPlan] = useState(null);
  const [workouts, setWorkouts] = useState([]);
  const [exerciseCounts, setExerciseCounts] = useState({});
  const [setCounts, setSetCounts] = useState({});
  // F-17 (docs/final-certification-2026-09-05/07-FINDINGS.md, evidence
  // A10): the preview named neither circuits nor rounds, so the only
  // signal before someone committed to a circuit plan was the free-text
  // description. Keyed by routine id, one entry per circuit group.
  const [circuitGroups, setCircuitGroups] = useState({});
  const [activePlan, setActivePlanData] = useState(null);
  const [whyThis, setWhyThis] = useState(null);
  // D139 (finding: "the library's 'N to swap' fact vanished on the deciding
  // screen"): the same capability-computed compatibility verdict the
  // library grid shows, recomputed for this plan's own exercises so the
  // fact survives onto the preview it is deciding from.
  const [compatibility, setCompatibility] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [isReordering, setIsReordering] = useState(false);
  // D35: edge auto-scroll for the workouts drag-reorder list below -- this
  // page's own ScrollView is the drag's scroll container. Harmless when not
  // reordering: the bridge only does anything once a DragReorderList drag
  // actually picks up, and that list only mounts in reorder mode.
  const { scrollRef, scrollOffset, onScroll, onContentSizeChange } = useDragAutoScrollBridge();
  // The authoritative day order, advanced synchronously by every reorder so a
  // second tap builds on the first even before React has re-rendered, plus a
  // promise chain that keeps the position writes in tap order. See
  // handleMoveDay for the corruption these two exist to stop.
  const orderRef = useRef(workouts);
  const reorderChain = useRef(Promise.resolve());
  // CP-10 batch G (2026-07-11): live theme (src/hooks/useTheme.js).
  const t = useTheme();
  const live = useMemo(() => buildLiveStyles(t), [t]);

  useFocusEffect(
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useCallback(() => { loadData(); }, [planId]),
  );

  // D139 item 9 (funnel telemetry: library preview, counts and enums only).
  // Fire-and-forget: a telemetry failure must never affect the preview.
  useFocusEffect(
    useCallback(() => {
      if (isLibrary && user?.id) track(user.id, 'library_plan_previewed', {}).catch(() => {});
    // planId is deliberately a dependency (a new plan previewed is a new
    // event) even though the body doesn't read it directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLibrary, planId, user?.id]),
  );

  async function loadData() {
    if (!planId) return;
    try {
      const [p, routines, counts, sets, active] = await Promise.all([
        getProgrammeById(planId),
        getRoutinesForPlan(planId),
        getAllRoutineExerciseCounts(),
        getAllRoutineSetCounts(),
        user?.id ? getActivePlan(user.id) : Promise.resolve(null),
      ]);
      setPlan(p);
      // A reload is the new truth: reseat the reorder baseline with it, or a
      // later chevron tap would swap against the pre-reload order.
      orderRef.current = routines;
      setWorkouts(routines);
      setExerciseCounts(counts);
      setSetCounts(sets);
      setActivePlanData(active);
      // F-17 (evidence A10): the day rows need the routines' own exercise
      // rows, which the compatibility pass below already reads. Fetched once
      // here and shared, so naming the circuit costs no extra query.
      // Best-effort per routine: a read failure just leaves that day with the
      // plain exercise count it had before.
      const detailsByRoutine = {};
      for (const routine of (routines ?? [])) {
        // eslint-disable-next-line no-await-in-loop
        detailsByRoutine[routine.id] = (await getRoutineExercisesWithDetails(routine.id).catch(() => [])) ?? [];
      }
      const circuits = {};
      for (const routine of (routines ?? [])) {
        const groups = summariseCircuitGroups(
          detailsByRoutine[routine.id].map(row => row?.routineExercise).filter(Boolean),
        );
        if (groups.length) circuits[routine.id] = groups;
      }
      setCircuitGroups(circuits);
      // The rationale cache is per-user and always tracks the active
      // auto-generated plan (every reroll archives the others), so it's
      // only meaningful here when this plan is the active one. Loading it
      // is cheap; the render gates on isActive.
      if (user?.id) {
        try {
          const raw = await AsyncStorage.getItem(PLAN_WHYTHIS_KEY(user.id));
          const parsed = raw ? JSON.parse(raw) : null;
          setWhyThis(parsed && typeof parsed === 'object' ? parsed : null);
        } catch (_) { setWhyThis(null); }
      }
      // D139: the same capability compatibility computation
      // PlanLibraryScreen runs for the whole grid (CC28, section 9.2.5),
      // here for just this plan's own exercises. Best-effort -- without it
      // the preview renders exactly as before, no badge, no swap line.
      if (user?.id) {
        try {
          // eslint-disable-next-line global-require
          const { loadCapabilityResolveState } = require('../lib/capability/resolve');
          // eslint-disable-next-line global-require
          const { computePlanCompatibility } = require('../lib/capability/planCompat');
          const capState = await loadCapabilityResolveState(user.id, {});
          if (capState && !capState.empty && !capState.unavailable) {
            const exerciseRows = [];
            for (const routine of (routines ?? [])) {
              for (const row of (detailsByRoutine[routine.id] ?? [])) {
                if (row?.exercise) exerciseRows.push(row.exercise);
              }
            }
            setCompatibility(computePlanCompatibility(capState, exerciseRows));
          } else {
            setCompatibility(null);
          }
        } catch (_) { setCompatibility(null); }
      } else {
        setCompatibility(null);
      }
    } catch (e) {
      logError('PlanDetailScreen.loadData', e, { planId, userId: user?.id });
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }

  async function handleAddToMyPlans() {
    // C4: one decision, one dialog. Both choices copy the plan; only what
    // happens after the copy differs, so each button owns its own copy call
    // and error handling (matches the copy-failure toast either way).
    // C5-P10-01 / C5-P10-08 (D96): the same tier-blind pair of sentences
    // every activation decision point now states -- activation creates a
    // training block, and this is what else changes.
    appAlert(
      'Add this plan?',
      `Copy "${plan?.name}" into your plans. Make it active now, or just add it for later.`
      + `\n\n${BLOCK_START_SENTENCE} ${ACTIVATION_MEANING_SENTENCE}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Save for later',
          onPress: async () => {
            try {
              await copyPlanFromLibrary(planId, user.id);
              navigation.goBack();
            } catch (_e) {
              toast.show('Could not copy plan. Try again.', { variant: 'error' });
            }
          },
        },
        {
          text: 'Add and start this plan',
          onPress: async () => {
            if (activatingRef.current) return;
            activatingRef.current = true;
            try {
              let copy;
              try {
                copy = await copyPlanFromLibrary(planId, user.id);
              } catch (_e) {
                toast.show('Could not copy plan. Try again.', { variant: 'error' });
                return;
              }
              const ok = await confirmPlanSwitchMidBlock(user.id, { newPlanName: plan?.name });
              if (!ok) { navigation.goBack(); return; }
              await activatePlanWithBlock(user.id, copy.id, plan?.name ?? 'Training Plan');
              // C5-P10-05 (D96): every activation entry point confirms
              // identically. This one used to be a silent goBack(), the same
              // transition "Save for later" makes.
              toast.show(`"${plan?.name}" is now your active plan`, { variant: 'success' });
              navigation.goBack();
            } finally {
              activatingRef.current = false;
            }
          },
        },
      ],
    );
  }

  async function handleSetActive() {
    if (activatingRef.current) return; // C6 P9-04 (D97)
    activatingRef.current = true;
    try {
      const ok = await confirmPlanSwitchMidBlock(user.id, { newPlanName: plan?.name });
      if (!ok) return;
      await activatePlanWithBlock(user.id, planId, plan?.name ?? 'Training Plan');
      await loadData();
      toast.show(`"${plan?.name}" is now your active plan`, { variant: 'success' });
    } catch (e) {
      logError('PlanDetailScreen.handleSetActive', e, { userId: user?.id, planId });
      toast.show("Couldn't activate plan, try again", { variant: 'error' });
    } finally {
      activatingRef.current = false;
    }
  }

  async function handleStartWorkout(routine) {
    try {
      const workout = await createWorkout(user.id, routine.id);
      const withExercises = await getRoutineExercisesWithDetails(routine.id);
      const initialExercises = withExercises.map(({ exercise, routineExercise }) => ({
        exercise, routineExercise, sets: [],
        supersetGroupId: routineExercise?.supersetGroupId ?? null,
        // EL-9 (docs/exercise-library-expansion-2026-09-05/05-DECISIONS.md):
        // hydrate the circuit stamp + round rest alongside the superset id.
        groupKind: routineExercise?.groupKind ?? null,
        roundRestSeconds: routineExercise?.roundRestSeconds ?? null,
      }));
      startWorkout(workout, initialExercises);
      navigation.navigate('HomeTab', { screen: 'ActiveWorkout', initial: false });
    } catch (e) {
      logError('PlanDetailScreen.handleStartWorkout', e, { userId: user?.id, routineId: routine?.id });
      toast.show("Couldn't start workout, try again", { variant: 'error' });
    }
  }

  // Day-level plan reorder (old founder-GO item, verified unbuilt): reuses
  // the same swap-adjacent-positions pattern already shipped for exercises
  // within a day (RoutineDetailScreen.handleMoveExercise), one level up the
  // hierarchy. No drag library, no new dependency.
  async function handleMoveDay(routineId, direction) {
    // Founder report 2026-08-26: "swapping workout days repeatedly". Tapping
    // the chevrons faster than a write completes used to corrupt the order,
    // because this read `workouts` from the render closure and awaited two
    // writes with nothing serialising them:
    //
    //   - tap N+1 could start before tap N's re-render committed, so it built
    //     its swap from an array that was already one swap out of date;
    //   - the two awaits could interleave across taps, so tap N's second write
    //     could land AFTER tap N+1's writes and stamp a dead position;
    //   - the failure path did `setWorkouts(workouts)`, reverting to the same
    //     stale closure array and discarding every later tap.
    //
    // orderRef carries the authoritative order forward synchronously, so each
    // tap always builds on the last one, and reorderChain serialises the
    // writes so they land in the order the taps happened. Every tap is still
    // honoured: nothing is dropped, which matters because the chevrons are the
    // ACCESSIBLE move path (D32) and a silently ignored tap is worse there
    // than anywhere else.
    const current = orderRef.current;
    const index = current.findIndex(w => w.id === routineId);
    if (index === -1) return;
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= current.length) return;
    haptics.selection();

    // Optimistic update.
    const updated = [...current];
    updated[index] = current[swapIndex];
    updated[swapIndex] = current[index];
    orderRef.current = updated;
    setWorkouts(updated);

    // Persist both swapped items using their new positions, strictly after any
    // write already in flight.
    reorderChain.current = reorderChain.current.then(async () => {
      try {
        await updateRoutinePosition(updated[index].id, index);
        await updateRoutinePosition(updated[swapIndex].id, swapIndex);
      } catch (e) {
        logError('PlanDetailScreen.handleMoveDay', e, { planId, routineId });
        // Revert to what the user can actually see now, not to a stale array.
        orderRef.current = current;
        setWorkouts(current);
        toast.show("Couldn't reorder, try again", { variant: 'error' });
      }
    });
    await reorderChain.current;
  }

  // D32 (2026-07-10, campaign item 20): true long-press drag, additive to
  // the chevron swap above (handleMoveDay stays untouched). DragReorderList
  // already fires the pickup/drop haptics, so this handler doesn't repeat
  // one. Persists every day whose position actually moved, via the SAME
  // updateRoutinePosition call and the same optimistic-revert-and-toast
  // failure shape handleMoveDay uses -- generalised from exactly two writes
  // to however many days a single drag actually moved.
  async function handleReorderWorkouts(nextWorkouts) {
    // Shares handleMoveDay's baseline and write chain: a drag and a chevron
    // tap move the same list, so they must not race each other either.
    const previous = orderRef.current;
    orderRef.current = nextWorkouts;
    setWorkouts(nextWorkouts);
    reorderChain.current = reorderChain.current.then(async () => {
      try {
        for (let i = 0; i < nextWorkouts.length; i++) {
          if (previous[i]?.id !== nextWorkouts[i].id) {
            // eslint-disable-next-line no-await-in-loop
            await updateRoutinePosition(nextWorkouts[i].id, i);
          }
        }
      } catch (e) {
        logError('PlanDetailScreen.handleReorderWorkouts', e, { planId });
        orderRef.current = previous;
        setWorkouts(previous);
        toast.show("Couldn't reorder, try again", { variant: 'error' });
      }
    });
    await reorderChain.current;
  }

  async function handleArchive() {
    appAlert(
      'Archive plan?',
      'The plan will be hidden. Session history remains intact.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: async () => {
            try {
              await archivePlan(planId);
              navigation.goBack();
            } catch (e) {
              logError('PlanDetailScreen.handleArchive', e, { planId });
              toast.show("Couldn't archive plan, try again", { variant: 'error' });
            }
          },
        },
      ],
    );
  }

  // FOUNDER DECISION (fully free, no tier split): handleDuplicate is retired
  // with the Duplicate row below (it was the Free-only action).

  // S5: opens the manual builder directly on this plan's days/exercises
  // (route param only, ManualBuilderScreen owns the load + save). Additive:
  // the per-workout pencil (RoutineDetail) is unchanged, this is the one
  // place a user can add or remove a superset on a plan they already saved.
  function handleEditPlan() {
    navigation.navigate('ManualBuilder', { planId });
  }

  const isActive = activePlan?.id === planId;
  // Sum the actual prescribed sets per workout (falling back to 3 per exercise
  // only if a routine has no set-count data), so the estimate reflects the real
  // programme rather than assuming a flat 3 sets per exercise.
  const totalWorkingSets = workouts.reduce(
    (sum, w) => sum + (setCounts[w.id] || (exerciseCounts[w.id] || 0) * 3),
    0,
  );
  // C5-P10-02 (D96): days a week, read from the plan's existing days:N tag.
  const planDays = getPlanDays(plan);
  // D139 (finding: "every preview carries a rationale line"): the split
  // rationale, for library, saved and manual plans alike -- copyPlanFromLibrary
  // and the manual/auto-gen createProgramme calls never carry a split type
  // onto the PROGRAMME row (it stays null there), but duplicateRoutine does
  // carry it onto each ROUTINE row, so this reads the routine, not the plan.
  const splitRationale = workouts[0]?.splitType ? getSplitRationale(workouts[0].splitType) : null;

  if (!plan) {
    // Mirror the loaded layout (header block, primary button, workout rows)
    // so the swap to real content is seamless, rather than a blank flash.
    return (
      <SafeAreaView style={[styles.safe, live.safe]} edges={['top', 'bottom']}>
        <BackHeader title={plan?.name || 'Plan'} />
        <View style={styles.content}>
          <Skeleton width={'55%'} height={28} />
          <Skeleton width={'80%'} height={14} />
          <SkeletonCard height={48} />
          <View style={styles.section}>
            <SkeletonCard height={72} />
            <SkeletonCard height={72} />
            <SkeletonCard height={72} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, live.safe]} edges={['top', 'bottom']}>
      <BackHeader title={plan?.name || 'Plan'} />
      <ScrollView
        ref={scrollRef}
        onScroll={onScroll}
        onContentSizeChange={onContentSizeChange}
        scrollEventThrottle={16}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={t.colors.primary} />}
      >
        {/* Plan header */}
        <AnimatedEntrance index={0}>
        <View style={styles.planHeader}>
          <View style={styles.planHeaderBadgeRow}>
            {isLibrary && (
              <View style={[styles.libraryBadge, live.libraryBadge]}>
                <Text style={[styles.libraryBadgeText, live.libraryBadgeText]}>Library</Text>
              </View>
            )}
            {isActive && (
              <View style={[styles.activeBadge, live.activeBadge]}>
                <Text style={[styles.activeBadgeText, live.activeBadgeText]}>Active plan</Text>
              </View>
            )}
            {plan.tags && plan.tags.includes('featured') && (
              <View style={[styles.featuredBadge, live.featuredBadge]}>
                <Ionicons name="star" size={iconSize.sm} color={t.colors.onPrimary} />
                <Text style={[styles.featuredBadgeText, live.featuredBadgeText]}>Featured</Text>
              </View>
            )}
            {/* C5-P10-04 (D96): equipment was never rendered on this screen
                either, so "what do I need to run this?" could not be
                answered before adding the plan. Same derivation as the
                library card, from the tags the plans already carry. */}
            <View style={[styles.libraryBadge, live.libraryBadge]}>
              <Text style={[styles.libraryBadgeText, live.libraryBadgeText]}>{planEquipmentLabel(plan)}</Text>
            </View>
            {/* D139 (finding: "the library's 'N to swap' fact vanished on
                the deciding screen"): the same computed-never-tagged badge
                the library grid shows (PlanLibraryScreen's PlanBadge),
                carried onto the preview that actually decides. */}
            {compatibility?.fullyCompatible === true && (
              <View style={[styles.libraryBadge, live.libraryBadge]}>
                <Text style={[styles.libraryBadgeText, live.libraryBadgeText]}>Fits your limitations</Text>
              </View>
            )}
            {compatibility && compatibility.fullyCompatible === false && (
              <View style={[styles.libraryBadge, live.libraryBadge]}>
                <Text style={[styles.libraryBadgeText, live.libraryBadgeText]}>
                  {compatibility.conflicts.length + compatibility.unknowns.length} to swap
                </Text>
              </View>
            )}
          </View>
          <Text style={[styles.planName, live.planName]}>{planHeadingName(plan.name)}</Text>
          {plan.description ? (
            <Text style={[styles.planDesc, live.planDesc]}>{plan.description}</Text>
          ) : null}
          {/* The conflicting exercises themselves, named -- the badge above
              says how many, this says which. Named directly up to two;
              beyond that the rest are counted rather than listed, so a
              heavily constrained plan does not turn the header into a
              wall of names. */}
          {compatibility && compatibility.fullyCompatible === false && (() => {
            const names = [...compatibility.conflicts, ...compatibility.unknowns]
              .map((c) => c.row?.name)
              .filter(Boolean);
            if (!names.length) return null;
            let list;
            if (names.length === 1) list = names[0];
            else if (names.length === 2) list = `${names[0]} and ${names[1]}`;
            else list = `${names[0]}, ${names[1]}, and ${names.length - 2} more`;
            return (
              <Text style={[styles.planDesc, live.planDesc]}>Would be swapped: {list}.</Text>
            );
          })()}
          <View style={styles.planStats}>
            {/* C5-P10-02 (D96): days per week, from the plan's own days:N
                tag via the existing getPlanDays() helper. The library used
                to state a workout COUNT and never a frequency, and the
                heading strips the "3×/Week" the seed name carries. */}
            {planDays != null && (
              <View style={styles.planStat}>
                <Text style={[styles.planStatValue, live.planStatValue]}>{planDays}</Text>
                <Text style={[styles.planStatLabel, live.planStatLabel]}>Days a week</Text>
              </View>
            )}
            <View style={styles.planStat}>
              <Text style={[styles.planStatValue, live.planStatValue]}>{workouts.length}</Text>
              <Text style={[styles.planStatLabel, live.planStatLabel]}>Workouts</Text>
            </View>
            {totalWorkingSets > 0 && (
              <View style={styles.planStat}>
                <Text style={[styles.planStatValue, live.planStatValue]}>~{totalWorkingSets}</Text>
                <Text style={[styles.planStatLabel, live.planStatLabel]}>Est. sets/week</Text>
              </View>
            )}
            {plan.difficulty != null && (
              <View style={styles.planStat}>
                <Text style={[styles.planStatValue, live.planStatValue]}>
                  {['Beginner', 'Intermediate', 'Advanced'][plan.difficulty] ?? 'Intermediate'}
                </Text>
                <Text style={[styles.planStatLabel, live.planStatLabel]}>Level</Text>
              </View>
            )}
          </View>
        </View>
        </AnimatedEntrance>

        {/* Primary action */}
        {isLibrary ? (
          <Button title="Add to my plans" icon="copy-outline" size="lg" onPress={handleAddToMyPlans} />
        ) : !isActive ? (
          <Button variant="emphatic" title="Set active" icon="checkmark-circle" size="lg" onPress={handleSetActive} />
        ) : null}

        {/* Community entry point 5 (social-discovery blueprint section 1):
            share this plan's STRUCTURE as a Community programme. Only for a
            plan the user owns -- a library plan is not a row in `programmes`
            yet, so there is nothing to snapshot until they copy it.
            Community is registered in HomeStack, so this is a CROSS-TAB jump
            (F4: a bare navigate() to another stack is silently dropped). */}
        {!isLibrary && (
          <Button
            title="Share programme"
            icon="share-social-outline"
            variant="secondary"
            onPress={() => navigateCrossTab(navigation, 'HomeTab', 'CommunityPublishProgramme', { planId })}
            accessibilityLabel="Share this programme with Community"
          />
        )}

        {/* Workouts list */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <SectionLabel>Workouts</SectionLabel>
            {!isLibrary && workouts.length > 1 && (
              <TouchableOpacity
                onPress={() => { haptics.selection(); setIsReordering(prev => !prev); }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={isReordering ? 'Done reordering workouts' : 'Reorder workouts'}
              >
                <Text style={[styles.reorderToggleText, live.reorderToggleText, isReordering && [styles.reorderToggleTextActive, live.reorderToggleTextActive]]}>
                  {isReordering ? 'Done' : 'Reorder'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
          {workouts.length === 0 ? (
            <Card padding="xl" style={styles.emptyCard}>
              <Text style={[styles.emptyCardText, live.emptyCardText]}>
                {isLibrary ? 'No workouts in this plan.' : 'No workouts yet. Edit the plan to add workouts.'}
              </Text>
            </Card>
          ) : !isLibrary && isReordering ? (
            // D32 (2026-07-10): true long-press drag, additive to the
            // chevrons below (which stay the accessible move path -- the
            // drag handle is hidden from screen readers, see
            // DragReorderList's own header comment). No blocks at the
            // day level, so this degrades to a plain single-item reorder.
            <DragReorderList
              items={workouts}
              keyExtractor={(w) => w.id}
              onReorder={handleReorderWorkouts}
              handleAccessibilityLabel={(w) => `Drag to reorder ${w.name}`}
              gap={spacing.md}
              scrollRef={scrollRef}
              scrollOffset={scrollOffset}
              renderRow={({ item: routine, index: i }) => (
                <Card style={styles.workoutCard}>
                  <View style={[styles.workoutIndex, live.workoutIndex]}>
                    <Text style={[styles.workoutIndexText, live.workoutIndexText]}>{i + 1}</Text>
                  </View>
                  <View style={styles.workoutInfo}>
                    <Text style={[styles.workoutName, live.workoutName]}>{routine.name}</Text>
                    {exerciseCounts[routine.id] ? (
                      <Text style={[styles.workoutMeta, live.workoutMeta]}>
                        {exerciseCounts[routine.id]} exercise{exerciseCounts[routine.id] !== 1 ? 's' : ''}
                      </Text>
                    ) : (
                      <Text style={[styles.workoutMeta, live.workoutMeta]}>No exercises yet</Text>
                    )}
                    {(circuitGroups[routine.id] ?? []).map(group => (
                      <Text key={group.groupId} style={[styles.workoutMeta, live.workoutMeta]}>
                        {formatCircuitPreviewLine(group)}
                      </Text>
                    ))}
                  </View>
                  <View style={styles.reorderActions}>
                    <TouchableOpacity
                      onPress={() => handleMoveDay(routine.id, 'up')}
                      style={[styles.reorderBtn, live.reorderBtn, i === 0 && styles.reorderBtnDisabled]}
                      disabled={i === 0}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: i === 0 }}
                      accessibilityLabel={`Move ${routine.name} up`}
                    >
                      <Ionicons name="chevron-up" size={16} color={i === 0 ? t.colors.border : t.colors.textMuted} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleMoveDay(routine.id, 'down')}
                      style={[styles.reorderBtn, live.reorderBtn, i === workouts.length - 1 && styles.reorderBtnDisabled]}
                      disabled={i === workouts.length - 1}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: i === workouts.length - 1 }}
                      accessibilityLabel={`Move ${routine.name} down`}
                    >
                      <Ionicons name="chevron-down" size={16} color={i === workouts.length - 1 ? t.colors.border : t.colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                </Card>
              )}
            />
          ) : (
            workouts.map((routine, i) => (
              <Card key={routine.id} style={styles.workoutCard}>
                <View style={[styles.workoutIndex, live.workoutIndex]}>
                  <Text style={[styles.workoutIndexText, live.workoutIndexText]}>{i + 1}</Text>
                </View>
                <View style={styles.workoutInfo}>
                  <Text style={[styles.workoutName, live.workoutName]}>{routine.name}</Text>
                  {exerciseCounts[routine.id] ? (
                    <Text style={[styles.workoutMeta, live.workoutMeta]}>
                      {exerciseCounts[routine.id]} exercise{exerciseCounts[routine.id] !== 1 ? 's' : ''}
                    </Text>
                  ) : (
                    <Text style={[styles.workoutMeta, live.workoutMeta]}>No exercises yet</Text>
                  )}
                  {/* F-17 (evidence A10): a day that runs a circuit says so
                      here, with its stations, rounds and round rest, before
                      anyone commits to the plan. */}
                  {(circuitGroups[routine.id] ?? []).map(group => (
                    <Text key={group.groupId} style={[styles.workoutMeta, live.workoutMeta]}>
                      {formatCircuitPreviewLine(group)}
                    </Text>
                  ))}
                </View>
                {!isLibrary && (
                  <View style={styles.workoutActions}>
                    <TouchableOpacity
                      style={[styles.editWorkoutBtn, live.editWorkoutBtn]}
                      onPress={() => navigation.navigate('RoutineDetail', { routineId: routine.id })}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      accessibilityRole="button"
                      accessibilityLabel={`Edit ${routine.name}`}
                    >
                      <Ionicons name="create-outline" size={18} color={t.colors.textSecondary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.startWorkoutBtn, live.startWorkoutBtn]}
                      onPress={() => handleStartWorkout(routine)}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      accessibilityRole="button"
                      accessibilityLabel={`Start ${routine.name}`}
                    >
                      <Ionicons name="play" size={13} color={t.colors.primary} />
                    </TouchableOpacity>
                  </View>
                )}
              </Card>
            ))
          )}
        </View>

        {/* Why this plan, for you. Only on the active auto-generated plan,
            mirroring the enrollment reveal so the rationale is here any
            time, not just right after setup. */}
        {isActive && !isLibrary && whyThis && WHY_ORDER.some(k => whyThis[k]) ? (
          <View style={styles.section}>
            <SectionLabel>Why this plan, for you</SectionLabel>
            <Card style={styles.whyCard}>
              {WHY_ORDER.filter(k => whyThis[k]).map((k, i, arr) => (
                <View key={k} style={[styles.whyItem, i < arr.length - 1 && styles.whyItemGap]}>
                  <View style={[styles.whyBullet, live.whyBullet]} />
                  <Text style={[styles.whyText, live.whyText]}>{whyThis[k]}</Text>
                </View>
              ))}
            </Card>
          </View>
        ) : splitRationale ? (
          // D139 (finding: "every preview carries a rationale line"): the
          // richer per-plan whyThis reveal is only ever recorded for the
          // active auto-generated plan, so a library plan, a saved-but-not-
          // active copy or a manual build never carried any rationale at
          // all. The split's own template line (whyThisTemplates.js, the
          // same source the auto-generated reveal itself draws on) fills
          // that gap for every plan that has a split type.
          <View style={styles.section}>
            <SectionLabel>Why this plan, for you</SectionLabel>
            <Card style={styles.whyCard}>
              <View style={styles.whyItem}>
                <View style={[styles.whyBullet, live.whyBullet]} />
                <Text style={[styles.whyText, live.whyText]}>{splitRationale}</Text>
              </View>
            </Card>
          </View>
        ) : null}

        {/* RC-1 (D96, Review C): Edit and Archive show to every account (the
            builder is a free feature). FOUNDER DECISION (fully free, no
            tier split): Duplicate is now retired entirely -- every account
            runs one always-active plan, the rationale that used to keep
            Duplicate Pro-only. */}
        {!isLibrary && (
          <View style={styles.section}>
            <SectionLabel>Manage</SectionLabel>
            <Card padding="none" style={styles.manageCard}>
              <TouchableOpacity style={[styles.manageRow, live.manageRow]} onPress={handleEditPlan} accessibilityRole="button" accessibilityLabel="Edit plan">
                <Ionicons name="create-outline" size={18} color={t.colors.primary} />
                <Text style={[styles.manageRowText, live.manageRowText]}>Edit plan</Text>
                <Ionicons name="chevron-forward" size={iconSize.sm} color={t.colors.textMuted} />
              </TouchableOpacity>
              {!isActive && (
                <TouchableOpacity style={[styles.manageRow, live.manageRow, styles.manageRowLast]} onPress={handleArchive} accessibilityRole="button" accessibilityLabel="Archive plan">
                  <Ionicons name="archive-outline" size={18} color={t.colors.error} />
                  <Text style={[styles.manageRowText, live.manageRowText, { color: t.colors.error }]}>Archive plan</Text>
                  <Ionicons name="chevron-forward" size={iconSize.sm} color={t.colors.textMuted} />
                </TouchableOpacity>
              )}
            </Card>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.xl, paddingBottom: spacing.xxl },
  planHeader: { gap: spacing.md },
  planHeaderBadgeRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  libraryBadge: {
    alignSelf: 'flex-start', backgroundColor: colors.surface2, borderRadius: radius.full,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderWidth: 1, borderColor: colors.border,
  },
  libraryBadgeText: { fontSize: fontSize.xs, color: colors.textMuted, fontFamily: fontFamily.semibold, fontWeight: fontWeight.semibold },
  activeBadge: {
    alignSelf: 'flex-start', backgroundColor: colors.primaryBg, borderRadius: radius.full,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderWidth: 1, borderColor: withAlpha(colors.primary, 0.376),
  },
  activeBadgeText: { fontSize: fontSize.xs, color: colors.primary, fontFamily: fontFamily.semibold, fontWeight: fontWeight.semibold },
  featuredBadge: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xxs,
    alignSelf: 'flex-start', backgroundColor: colors.primaryFill, borderRadius: radius.full,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
  },
  featuredBadgeText: { fontSize: fontSize.xs, color: colors.onPrimary, fontFamily: fontFamily.bold, fontWeight: fontWeight.bold },
  planName: { fontSize: fontSize.xxl, fontFamily: fontFamily.heavy, fontWeight: fontWeight.black, color: colors.textPrimary },
  planDesc: { ...type.bodySm, color: colors.textSecondary },
  planStats: { flexDirection: 'row', gap: spacing.xl },
  planStat: { gap: spacing.xxs },
  planStatValue: { fontSize: fontSize.xl, fontFamily: fontFamily.heavy, fontWeight: fontWeight.black, color: colors.textPrimary },
  planStatLabel: { ...type.caption, color: colors.textMuted },
  section: { gap: spacing.md },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reorderToggleText: { fontSize: fontSize.sm, color: colors.textSecondary, fontFamily: fontFamily.regular, fontWeight: fontWeight.regular },
  reorderToggleTextActive: { color: colors.primary, fontFamily: fontFamily.bold, fontWeight: fontWeight.bold },
  reorderActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  reorderBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    backgroundColor: colors.surface2,
  },
  reorderBtnDisabled: { opacity: 0.3 },
  // Card owns background/radius/padding/border here.
  emptyCard: {
    alignItems: 'center',
  },
  emptyCardText: { ...type.bodySm, color: colors.textMuted, textAlign: 'center' },
  workoutCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
  },
  workoutIndex: {
    width: 32, height: 32, borderRadius: circle(32), backgroundColor: colors.surface2,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border,
  },
  workoutIndexText: { fontSize: fontSize.sm, fontFamily: fontFamily.bold, fontWeight: fontWeight.bold, color: colors.textSecondary },
  workoutInfo: { flex: 1, gap: spacing.xxs },
  workoutName: { ...type.bodyStrong, color: colors.textPrimary },
  workoutMeta: { ...type.caption, color: colors.textSecondary },
  workoutActions: { flexDirection: 'row', gap: spacing.sm },
  editWorkoutBtn: {
    width: 36, height: 36, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
  },
  startWorkoutBtn: {
    width: 36, height: 36, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
  },
  // Card owns background/radius/border here; overflow clips row dividers to
  // the rounded corner.
  manageCard: {
    overflow: 'hidden',
  },
  manageRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle,
  },
  manageRowLast: { borderBottomWidth: 0 },
  manageRowText: { flex: 1, ...type.body, color: colors.textPrimary },
  // Card owns background/radius/padding/border here.
  whyCard: {
    gap: spacing.sm,
  },
  whyItem: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  whyItemGap: { marginBottom: spacing.xs },
  whyBullet: { width: 6, height: 6, borderRadius: circle(6), backgroundColor: colors.primary, marginTop: spacing.xs2 },
  whyText: { ...type.bodySm, flex: 1, color: colors.textSecondary },
});

// CP-10 batch G (2026-07-11): the frozen `styles` block above stays byte-
// identical. This mirrors ONLY the colour/fontSize/type-bearing sub-
// properties of the matching frozen style, at identical rest values, so the
// screen carries no static island under a live theme toggle. Pure layout
// keys (flex/gap/padding/width/height/overflow, no token) are correctly
// omitted -- there is nothing to unfreeze for them. Same pattern as
// AddCustomFoodScreen.js's buildLiveStyles (batch D).
function buildLiveStyles(t) {
  return {
    safe: { backgroundColor: t.colors.background },
    libraryBadge: { backgroundColor: t.colors.surface2, borderColor: t.colors.border },
    libraryBadgeText: { fontSize: t.fontSize.xs, color: t.colors.textMuted },
    activeBadge: { backgroundColor: t.colors.primaryBg, borderColor: withAlpha(t.colors.primary, 0.376) },
    activeBadgeText: { fontSize: t.fontSize.xs, color: t.colors.primary },
    featuredBadge: { backgroundColor: t.colors.primaryFill },
    featuredBadgeText: { fontSize: t.fontSize.xs, color: t.colors.onPrimary },
    planName: { fontSize: t.fontSize.xxl, color: t.colors.textPrimary },
    planDesc: { ...t.type.bodySm, color: t.colors.textSecondary },
    planStatValue: { fontSize: t.fontSize.xl, color: t.colors.textPrimary },
    planStatLabel: { ...t.type.caption, color: t.colors.textMuted },
    reorderToggleText: { fontSize: t.fontSize.sm, color: t.colors.textSecondary },
    reorderToggleTextActive: { color: t.colors.primary },
    reorderBtn: { backgroundColor: t.colors.surface2 },
    emptyCardText: { ...t.type.bodySm, color: t.colors.textMuted },
    workoutIndex: { backgroundColor: t.colors.surface2, borderColor: t.colors.border },
    workoutIndexText: { fontSize: t.fontSize.sm, color: t.colors.textSecondary },
    workoutName: { ...t.type.bodyStrong, color: t.colors.textPrimary },
    workoutMeta: { ...t.type.caption, color: t.colors.textSecondary },
    editWorkoutBtn: { backgroundColor: t.colors.surface2, borderColor: t.colors.border },
    startWorkoutBtn: { backgroundColor: t.colors.surface2, borderColor: t.colors.border },
    manageRow: { borderBottomColor: t.colors.borderSubtle },
    manageRowText: { ...t.type.body, color: t.colors.textPrimary },
    whyBullet: { backgroundColor: t.colors.primary },
    whyText: { ...t.type.bodySm, color: t.colors.textSecondary },
  };
}
