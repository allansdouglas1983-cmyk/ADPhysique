import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { appAlert } from '../components/AppAlert';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { planHeadingName } from '../lib/planDisplay';
import { useFocusEffect, useScrollToTop } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { colors, fontSize, fontWeight, spacing, radius, type, withAlpha, circle, alpha, iconSize, fontFamily } from '../styles/theme';
import useTheme from '../hooks/useTheme';
import ScreenHeader from '../components/ScreenHeader';
import { SkeletonCard } from '../components/Skeleton';
import Button from '../components/Button';
import Card from '../components/Card';
import EmptyState from '../components/EmptyState';
import TextField from '../components/TextField';
import SectionLabel from '../components/SectionLabel';
import PressableCard from '../components/PressableCard';
import PeekMenu from '../components/PeekMenu';
import BottomSheet from '../components/BottomSheet';
import {
  getActivePlan, getAllPlansForUser, getArchivedPlansForUser,
  getWorkoutTemplates, getPlanWorkoutCounts, getAllRoutineExerciseCounts,
  activatePlanWithBlock, getRoutinesForPlan, createWorkout, getRoutineExercisesWithDetails,
  archivePlan, unarchivePlan, softDeleteRoutine, getActiveBlock,
  getPlanFolders, createPlanFolder, renamePlanFolder, deletePlanFolder, setPlanFolder, getAllExercises } from '../lib/database';
import { getBlockAdvice, buildNextBlockOptions, applyAdjustEvidence } from '../lib/blockAdvisor';
import { adjustPreviewLines } from '../lib/nextBlockPreview';
import { confirmPlanSwitchMidBlock } from '../lib/planSwitch';
import { BLOCK_START_SENTENCE, ACTIVATION_MEANING_SENTENCE, buildSeedReceipt, BLOCK_DEFINITION } from '../lib/blockExplain';
import InfoTooltip from '../components/InfoTooltip';
import { GLOSSARY } from '../lib/coachGlossary';
import { generateAndSavePlan } from '../lib/planAutoGen';
// CC27 (section 9.6) red-team finding 1: every generateAndSavePlan surface
// runs the capability pre-flight first - never a silent fail-open.
import { capabilityPreflight, offerCapabilityPreflightChoice } from '../lib/capability/preflight';
// D139: "Start with a plan" previews before it generates. prepareStartWithPlan
// owns the capability pre-flight and the READ-ONLY dry run; commitStartWithPlan
// is the real generation, run only after the athlete confirms in
// PlanPreviewSheet (same shared helper and sheet HomeScreen's own no-plan CTA
// uses, so the app's one first-plan route behaves identically everywhere).
import { prepareStartWithPlan, commitStartWithPlan } from '../lib/startWithPlan';
import PlanPreviewSheet from '../components/PlanPreviewSheet';
import { navigateCrossTab } from '../navigation/navigateCrossTab';
import { loadExerciseIntentState, listActiveMovementConstraints } from '../lib/exercise/intent';
// D134 (founder 2026-09-03): the Injuries & limitations row's live line.
import { loadCapabilityState } from '../lib/capability/store';
import { howYouTrainSummary } from '../lib/capability/summary';
import useAppStore from '../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import { useToast } from '../components/Toast';
import { track } from '../lib/telemetry';
import { logError, logInfo } from '../lib/errorLog';
import * as haptics from '../lib/haptics';

// C6 F8 (D97): per-user, matching every sibling dismissal key - a second
// account on the same device must not inherit the first account's snooze.
const BLOCK_SNOOZE_KEY_FOR = (uid) => `@volyume_block_snooze_${uid ?? 'anon'}`;


// FOUNDER DECISION (fully free, no tier split): every account sees "switch
// your active plan" framings now -- the Free ACTION_CARDS_DEFAULT set
// (library first, manual second, no Adjust card) is retired.
// "Adjust training plan" sits at the top: it rebuilds the plan via the
// training-only PlanUpdate screen. Goal and calorie/macro changes live in the
// Coach tab (Update goal and phase / Nutrition targets), so this Train-side flow never
// touches nutrition targets.
const ACTION_CARDS_PRO_SWITCH = [
  {
    id: 'goals',
    icon: 'flag-outline',
    title: 'Adjust training plan',
    description: 'Change schedule, equipment, experience, division or weak points. Volyume previews the rebuild before it replaces your active plan.',
    screen: 'PlanUpdate',
  },
  {
    id: 'library',
    icon: 'library-outline',
    title: 'Pick from the plan library',
    description: "Choose a ready-made plan. Your coach keeps adjusting whichever plan you're on.",
    screen: 'PlanLibrary',
  },
  {
    id: 'manual',
    icon: 'create-outline',
    title: 'Create your own',
    description: 'Create your own plan and choose every exercise. Your coach keeps reading your training the same way.',
    screen: 'ManualBuilder',
  },
];

const BLOCK_ICON = {
  heads_up: 'alert-circle-outline',
  early_deload: 'battery-charging-outline',
  in_recovery: 'moon-outline',
  post_recovery: 'checkmark-circle-outline',
};

// Campaign 25 (PLANS-SCREEN-SPEC.md §2/§3): the single-line-height plan row
// that replaces the retired renderPlanCard (and its duplicated archived
// copy) everywhere a non-hero plan is listed -- folder bodies, the unfiled
// list and the archived list. Sibling function-component scope, own
// useTheme(), matching YouScreen's NavRow precedent (CP-10 batch G).
//
// AX-11 LAW (unnest the options button, launch accessibility audit): the
// options button is a SIBLING of the row's pressable, never nested inside
// it -- the same law renderPlanCard enforced with an absolutely-positioned
// overlay button. A compact row has no card padding to overlay against, so
// the row itself lays every action out as true flex siblings under one
// plain, non-interactive View: the PressableCard (row press = View plan,
// long-press = options), the previous-only "Set active" button, then the
// options button. None nests inside another.
//
// Props: plan, meta (workout-count string or null), onPress, onLongPress,
// onOptions, onSetActive (null for archived rows -- activation stays
// inside the archived options sheet, unchanged), archived (muted name
// styling variant, matching the old archivedPlanCardName treatment),
// isLast (drops the row's own hairline divider on the final row of its
// section body).
function CompactPlanRow({
  plan, meta, onPress, onLongPress, onOptions, onSetActive, archived = false, isLast = false,
}) {
  const t = useTheme();
  const live = useMemo(() => buildLiveStyles(t), [t]);
  const name = planHeadingName(plan.name);
  return (
    <View style={[styles.compactRow, live.compactRow, isLast && styles.compactRowLast]}>
      <PressableCard
        style={styles.compactRowPress}
        onPress={onPress}
        onLongPress={onLongPress}
        accessibilityLabel={name}
      >
        <Text
          style={[styles.compactRowName, live.compactRowName, archived && [styles.compactRowNameArchived, live.compactRowNameArchived]]}
          numberOfLines={1}
        >
          {name}
        </Text>
        {meta ? (
          <Text style={[styles.compactRowMeta, live.compactRowMeta]} numberOfLines={1}>{meta}</Text>
        ) : null}
      </PressableCard>
      {onSetActive ? (
        <Button
          variant="tertiary"
          size="sm"
          fullWidth={false}
          title="Set active"
          onPress={onSetActive}
          accessibilityLabel={`Set ${name} as active plan`}
        />
      ) : null}
      <TouchableOpacity
        style={styles.moreBtn}
        onPress={onOptions}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        accessibilityRole="button"
        accessibilityLabel={archived ? 'Archived plan options' : 'Plan options'}
      >
        <Ionicons name="ellipsis-vertical" size={18} color={t.colors.textSecondary} />
      </TouchableOpacity>
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

export default function PlansScreen({ navigation }) {
  const toast = useToast();
  // Selector-scoped subscription: only re-render when these specific
  // fields change. Without useShallow, the previous `useAppStore()` call
  // subscribed to every store mutation (rest timer ticks, PR queue
  // updates, set saves) which forced a full PlansScreen re-render every
  // second during a workout.
  // R9 (D70): reduceMotion left with the raw folder Modal - BottomSheet
  // owns it now.
  const { user, startWorkout, tier, userProfile } = useAppStore(useShallow(s => ({
    user: s.user,
    startWorkout: s.startWorkout,
    tier: s.tier,
    userProfile: s.userProfile,
  })));
  // CP-10 batch G (2026-07-11): live theme (src/hooks/useTheme.js). Memoised
  // because this screen renders plan/folder/template lists via .map.
  const t = useTheme();
  const live = useMemo(() => buildLiveStyles(t), [t]);
  const [activePlan, setActivePlanData] = useState(null);
  const [myPlans, setMyPlans] = useState([]);
  // Plan folders (Hevy teardown R1): organise the My plans list. FREE, no Pro gate.
  const [folders, setFolders] = useState([]);
  const [collapsedFolders, setCollapsedFolders] = useState({});
  // Name prompt drives both create and rename. { mode: 'create' | 'rename', folder }.
  const [folderPrompt, setFolderPrompt] = useState(null);
  const [folderName, setFolderName] = useState('');
  const [savingFolder, setSavingFolder] = useState(false);
  const [archivedPlans, setArchivedPlans] = useState([]);
  const [archivedExpanded, setArchivedExpanded] = useState(false);
  // Campaign 25 (PLANS-SCREEN-SPEC.md §3): the "Previous plans" collapsed
  // section mirrors archivedExpanded's own precedent -- session-scoped,
  // collapsed by default on every mount.
  const [previousExpanded, setPreviousExpanded] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [planWorkoutCounts, setPlanWorkoutCounts] = useState({});
  const [exerciseCounts, setExerciseCounts] = useState({});
  const [refreshing, setRefreshing] = useState(false);
  const [blockAdvice, setBlockAdvice] = useState(null);
  // B-1 (F-18): Train's next-workout row reads the SAME programme position
  // Home does, so the two cannot disagree about whether the week's required
  // work is done. False until proved: an unreadable position is not evidence
  // that anything is finished.
  const [weekComplete, setWeekComplete] = useState(false);
  // Stage 8: the finished block's ledger story for the decision card.
  const [ledgerStory, setLedgerStory] = useState(null);
  // C8 Work 1: the adjust-vs-repeat delta preview for the decision card.
  const [adjustPreview, setAdjustPreview] = useState(null);
  // FB-24 (D96): the post-transition receipt, held until the user closes it.
  const [seedReceipt, setSeedReceipt] = useState(null);
  // C16 phase C (completion pass): the next-block review, shown BEFORE the
  // adjusted block is activated. Holds the exercise decisions (with their
  // reasons), the volume changes and the programme verdict.
  const [blockReview, setBlockReview] = useState(null);
  const [preparingReview, setPreparingReview] = useState(false);
  // FB-15 (D96): the active block's id, for the decision card's summary link.
  const [activeBlockId, setActiveBlockId] = useState(null);
  const [blockSnoozed, setBlockSnoozed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // D109-3: the Plan tools count for the "Avoided movements" row. Loaded
  // independently of loadData's Promise.all batch (own failure mode, own
  // req-guard would be overkill for one count) - a read failure just leaves
  // the row hidden, which is the correct degrade (D109-2 fail-open: never
  // block, and there is nothing to filter here, only a count to show).
  const [avoidedMovementsCount, setAvoidedMovementsCount] = useState(0);
  // D134: the live one-line status under the Injuries & limitations row.
  const [hytSummary, setHytSummary] = useState(() => howYouTrainSummary(null));
  // EP-09/P-06 (Codex end-user-polish audit): whether the most recent
  // loadData() attempt failed. Previously the catch block swallowed the
  // exception entirely (`catch (_e) {}`), so a rejected read still landed on
  // `loaded = true` with every plan/folder state left at its initial empty
  // value, and the render below could only ever show "No active plan" -- a
  // load FAILURE painted as a real, confirmed empty account. A failure never
  // resets the plan/folder state that's already on screen (see loadData's
  // catch branch), so a refresh failure preserves whatever was showing.
  const [loadError, setLoadError] = useState(false);
  // D139: "Start with a plan" preview state -- { preview, otherPlansCount }
  // once prepareStartWithPlan resolves, null otherwise (drives the sheet's
  // `visible`). `startingPlan` is the commit's own busy flag.
  const [planPreview, setPlanPreview] = useState(null);
  const [startingPlan, setStartingPlan] = useState(false);
  // Item 3 (D141): true from the EmptyState tap until prepareStartWithPlan
  // resolves (sheet set) or the attempt fails, so the button can show it is
  // doing real work (a DB-backed capability preflight plus a full engine dry
  // run) instead of sitting inert. Reset in `finally` alongside the ref
  // guard below, which stays for the same-render double-entry protection
  // this state cannot provide by itself.
  const [preparingPlan, setPreparingPlan] = useState(false);

  const scrollRef = useRef(null);
  const peekRef = useRef(null);
  // D139: double-tap guard on the preview step (the dry run is real work;
  // the commit step has its own guard via `startingPlan`).
  const startWithPlanRef = useRef(false);
  // Stage 6: re-entry guard for the block restart (the seed build is
  // real work; a re-confirmed alert must never run two activations).
  const restartingRef = useRef(false);
  // Stage 7-8 review #21: monotonic request counter so a stale loadData
  // (two rapid focuses racing across the ledger await) cannot overwrite
  // the newest request's block-end story.
  const ledgerLoadRef = useRef(0);
  // FB-24 (D96): the finished block's ledger record itself, kept so the
  // transition can compose its receipt from the same rationales the
  // decision card showed. loadData() re-runs immediately after the write
  // and clears the story state, so a ref is what survives the reload.
  const ledgerRecordRef = useRef(null);
  useScrollToTop(scrollRef);

  useEffect(() => {
    return navigation.getParent()?.addListener('tabPress', () => {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    });
  }, [navigation]);


  useFocusEffect(
    useCallback(() => {
      loadData();
      loadAvoidedMovementsCount();
      loadHowYouTrainSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id]),
  );

  /** D134: the Injuries & limitations line, refreshed on every focus so a change made there shows here on the way back. */
  async function loadHowYouTrainSummary() {
    if (!user?.id) { setHytSummary(howYouTrainSummary(null)); return; }
    try {
      const [state, library] = await Promise.all([loadCapabilityState(user.id), getAllExercises().catch(() => [])]);
      setHytSummary(howYouTrainSummary(state, { nameOf: (id) => library.find((e) => e.id === id)?.name ?? null }));
    } catch (_) { setHytSummary(howYouTrainSummary({ baseline: [], episodes: [], history: [], unavailable: true })); }
  }

  /** D109-3: refreshed on every focus, so a Remove on AvoidedMovementsScreen updates this count on the way back. */
  async function loadAvoidedMovementsCount() {
    if (!user?.id) { setAvoidedMovementsCount(0); return; }
    try {
      const block = await getActiveBlock(user.id).catch(() => null);
      const state = await loadExerciseIntentState(user.id, { activeMesocycleId: block?.id ?? null });
      setAvoidedMovementsCount(listActiveMovementConstraints(state).length);
    } catch (_) { setAvoidedMovementsCount(0); }
  }

  // Cloud restore: re-run loadData once pullFromCloud lands so a fresh
  // device sees the plan / template list populate without navigating
  // away and back.
  const cloudSyncVersion = useAppStore(s => s.cloudSyncVersion);
  useEffect(() => {
    if (!user?.id || cloudSyncVersion === 0) return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudSyncVersion]);

  // FQ-2 (D96): the block-completion decision reads the real entitlement, so
  // a tier change while this screen is open (a trial starting, an
  // entitlement lapsing mid-session) rebuilds the card rather than leaving
  // one composed for the other tier on screen. First run is the focus load
  // above, not this.
  const tierRef = useRef(tier);
  useEffect(() => {
    if (tierRef.current === tier) return;
    tierRef.current = tier;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tier]);

  async function loadData() {
    if (!user?.id) return;
    const req = ++ledgerLoadRef.current;
    try {
      const [active, all, archived, tmpl, pwc, exc, block, folderRows] = await Promise.all([
        getActivePlan(user.id),
        getAllPlansForUser(user.id),
        getArchivedPlansForUser(user.id),
        getWorkoutTemplates(user.id),
        getPlanWorkoutCounts(),
        getAllRoutineExerciseCounts(),
        getActiveBlock(user.id),
        getPlanFolders(user.id),
      ]);
      // RB-4 (D96, Review B): the req guard used to protect only the ledger
      // story, so a stale pro-tier load resolving after the tier-lapse
      // reload (the FQ-2 effect) could repaint the Pro decision card for a
      // free user. Guard EVERY setter: only the newest request paints.
      if (req !== ledgerLoadRef.current) return;
      setActivePlanData(active || null);
      // FB-15 (D96): the finished block's id, so the decision card can offer
      // the summary that informs the decision.
      setActiveBlockId(block?.id ?? null);
      setMyPlans(all.filter(p => !active || p.id !== active.id));
      setFolders(folderRows || []);
      setArchivedPlans(archived || []);
      setTemplates(tmpl);
      setPlanWorkoutCounts(pwc);
      setExerciseCounts(exc);

      // B-1 (F-18): the same authority handleStartNextWorkout already reads
      // below, read here too so the ROW can say what the button would do.
      // Best-effort: an unreadable position leaves the row as it was.
      let position = null;
      if (active) {
        // eslint-disable-next-line global-require
        const { resolveProgrammePosition, isWeekComplete } = require('../lib/programmePosition');
        position = await resolveProgrammePosition(user.id).catch(() => null);
        if (req !== ledgerLoadRef.current) return;
        setWeekComplete(isWeekComplete(position));
      } else {
        setWeekComplete(false);
      }

      if (block) {
        // FOUNDER DECISION (fully free, no tier split): every account gets
        // adaptive next-block coaching now, so isPro is always true.
        const advice = await getBlockAdvice(user.id, block, userProfile, { isPro: true })
          .catch(() => null);
        // RB-4: re-check after the await; the advice carries the closure's
        // tier, so a stale request must never paint it.
        if (req !== ledgerLoadRef.current) return;
        setBlockAdvice(advice);

        // Stage 8 (§3.6): the block-end story on the decision card. The
        // ledger is computed once (idempotent by version) and its
        // delta-composed rationales render verbatim, plus the
        // user-confirmed longer-recovery proposal when the ledger made
        // one. Best-effort: the card renders without it.
        //
        // Review blocker #3 (Stage 8) gated these rows on the 'adjust'
        // recommendation, because the rationales make forward claims ("the
        // next block starts 1 set higher") that only the adjust button
        // applies. FQ-2 (D96) resolves that differently and correctly: a Pro
        // user is now ALWAYS offered "Continue with adjustments" beside the
        // repeat, so the rows always sit above a button that honours them,
        // and the card states which option they describe (see the framing
        // line in the render). That kills FB-19's core defect -- a block that
        // went well was the one case where the app threw its own ledger away.
        // The rows are the coaching decision's evidence, so they are Pro;
        // the ledger itself stays tier-blind (it is workout evidence, and
        // BlockReflection remains the full reflection for any intent). The
        // longer-recovery line is a user-call proposal, honest under any
        // button, so it renders for all post_recovery cards.
        if (advice?.action === 'post_recovery') {
          try {
            // eslint-disable-next-line global-require
            const { computeAndStoreBlockLedger } = require('../lib/blockLedgerRunner');
            // eslint-disable-next-line global-require
            const { buildLedgerReflectionRows, recoveryProposalLine } = require('../lib/blockExplain');
            const ledger = await computeAndStoreBlockLedger(user.id, block.id, { userProfile, tier });
            // Review #21: this await widens the race window between two
            // rapid focuses; only the newest request may set the story.
            if (req !== ledgerLoadRef.current) return;
            // FB-24: hold the record for the transition receipt.
            ledgerRecordRef.current = ledger;
            const allRows = buildLedgerReflectionRows(ledger);
            // C8 Work 1 (RA6-8/RA6-9): the decision card must show the
            // REAL Repeat-vs-Adjust difference, and the recommendation
            // must be decided by that same evidence rather than by
            // check-in readiness alone. Build the adjust-intent seed
            // ranges the "Continue with adjustments" button would
            // actually use, diff them against what Repeat gives (the
            // block's observed numbers), and keep both the lines and
            // the evidence. FOUNDER DECISION (fully free, no tier split):
            // this IS coaching output, and it runs for everyone now.
            let preview = null;
            try {
              // eslint-disable-next-line global-require
              const { buildSeedRangesForNextBlock } = require('../lib/blockLedgerRunner');
              // eslint-disable-next-line global-require
              const { buildAdjustPreview } = require('../lib/nextBlockPreview');
              const seeded = await buildSeedRangesForNextBlock(user.id, { intent: 'adjust', userProfile, tier });
              if (req !== ledgerLoadRef.current) return;
              preview = buildAdjustPreview({ ranges: seeded?.ranges ?? null, ledger });
            } catch (_) { preview = null; }
            setAdjustPreview(preview);
            setLedgerStory({
              rows: allRows.slice(0, 4),
              // RA-2 (D96, Review A): judged on EVERY entry, not the sliced
              // four. When the whole ledger is INSUFFICIENT_DATA the two
              // options produce the same targets, and the framing line must
              // not describe a difference that does not exist.
              allUnjudged: allRows.length > 0
                && allRows.every((r) => r.classification === 'INSUFFICIENT_DATA'),
              recoveryLine: recoveryProposalLine(ledger),
            });
          } catch (_e) { setLedgerStory(null); setAdjustPreview(null); }
        } else {
          setLedgerStory(null);
          setAdjustPreview(null);
        }

        // Any non-continue advice, heads_up included, respects the 7-day
        // snooze so tapping "Got it" keeps the card dismissed across tab
        // focus instead of reappearing on every visit.
        if (advice && advice.action !== 'continue') {
          const snoozeRaw = await AsyncStorage.getItem(BLOCK_SNOOZE_KEY_FOR(user?.id)).catch(() => null);
          if (snoozeRaw) {
            setBlockSnoozed(Date.now() < parseInt(snoozeRaw, 10));
          } else {
            setBlockSnoozed(false);
          }
        } else {
          setBlockSnoozed(false);
        }
      } else {
        setBlockAdvice(null);
        setBlockSnoozed(false);
      }
      setLoadError(false);
    } catch (_e) {
      // EP-09/P-06: a rejected read here must never read as a genuine "no
      // active plan, no plans, no folders" account state. Nothing above this
      // catch has been reassigned (the whole read is one Promise.all), so
      // whatever plan/folder state was already on screen is untouched;
      // loadError alone flags the failure for the render layer.
      logError('PlansScreen.loadData', _e, { userId: user?.id });
      setLoadError(true);
    } finally {
      setLoaded(true);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }

  // ── D139: "Start with a plan", in two steps (same shape as HomeScreen's
  // own no-plan CTA, so the app's one route to a first plan behaves
  // identically wherever it is reached). Step 1 previews: the capability
  // pre-flight and the READ-ONLY dry run live inside prepareStartWithPlan,
  // then the sheet. Nothing is generated, saved or activated here. ──────────
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
          logError('PlansScreen.startWithPlanPreview', new Error(prep.error ?? 'plan_generation_failed'), { userId: user?.id });
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
      // D112 R5 (closes audit T1-12): every generation entry reveals
      // capability effects.
      if (result.capabilityBlockedCount > 0) {
        toast.show(capabilityBlockedNote(result.capabilityBlockedCount), { variant: 'info', duration: 5000 });
      }
    } else {
      logError('PlansScreen.startWithPlan', new Error(result.error ?? 'plan_generation_failed'), { userId: user?.id });
      toast.show("Couldn't start your plan, try again", { variant: 'error', duration: 5000 });
    }
  }

  // Stage 1 seam (2026-08-09, blueprint §3.5): `intent` is the advisor
  // recommendation the user tapped ('repeat' | 'adjust' |
  // 'consider_rebuild'). Stage 6 branches here to build the Block Ledger
  // ('repeat' = carry-over forced to true repeat, 'adjust' = full ledger)
  // and passes it through activatePlanWithBlock's { ledger } option;
  // until then ledger stays null and the intent is recorded for
  // observability so the seam is live, not decorative.
  async function handleRestartPlan(intent = null) {
    if (!activePlan) return;
    // FOUNDER DECISION (fully free, no tier split): the adjusted path's
    // second entitlement lock (FQ-2, D96) is retired -- every account can
    // reach the adaptive seed now.
    // RB-3 (D96, Review B): the guard is at the TOP, before anything is
    // shown. appAlert is a queue, so two same-frame taps on the two decision
    // buttons used to queue two confirms.
    if (restartingRef.current) return;
    restartingRef.current = true;
    // D139 item 9: funnel telemetry, the block decision by intent. Fired the
    // moment the athlete picks an option, independent of the review/confirm
    // that follows -- counts and enums only, fire-and-forget.
    if (user?.id) track(user.id, 'block_decision', { intent }).catch(() => {});

    // C16 phase C (completion pass): "Continue with adjustments" now REVIEWS
    // before it acts. It gathers what the next block would actually be -
    // the volume the ledger resolved AND the exercise decisions continuity
    // would make - and shows both before anything is written. The previous
    // behaviour reactivated the same programme and applied volume only, so
    // the whole longitudinal engine reached the user as a single sentence
    // on a card and no exercise it judged was ever changed.
    if (intent === 'adjust') {
      try {
        await openNextBlockReview();
      } catch (e) {
        logError('PlansScreen.openNextBlockReview', e, { userId: user?.id, planId: activePlan?.id });
        toast.show("Couldn't prepare your next block, try again", { variant: 'error' });
        restartingRef.current = false;
      }
      return;
    }

    // REPEAT MEANS REPEAT. Everything below is the literal path: the same
    // programme, the same workouts, the same targets. It never calls the
    // review, never runs the generator and never reaches the refine branch
    // of runBlockActivation - `refine` is hard-coded false here rather than
    // derived, so no future edit can make an elective refinement arrive
    // through a button whose alert promises the opposite.
    appAlert(
      'Run this plan again?',
      "A new training block starts today with the same workouts and the same set targets as last time. Aim to match or improve on last time's weights.",
      [
        { text: 'Cancel', style: 'cancel', onPress: () => { restartingRef.current = false; } },
        {
          text: 'Start new block',
          onPress: async () => {
            try {
              logInfo('PlansScreen.blockRestart', `intent=${intent}`);
              await runBlockActivation({ intent, refine: false });
              // CC33 D112 R1a (closes audit T1-11): REPEAT MEANS REPEAT
              // stands - the block just started is the literal same
              // programme. But a plan whose rows now sit outside the
              // user's BASELINE rules is never re-served in silence: the
              // same rewrite proposal a new baseline rule fires is
              // OFFERED here, after activation, and declining keeps the
              // plan with its quiet markers. Best-effort: the offer can
              // never fail the restart.
              try {
                // eslint-disable-next-line global-require
                const { computeCapabilityPlanRewrite, applyCapabilityPlanRewrite } = require('../lib/sessionEffective');
                const rw = await computeCapabilityPlanRewrite(user.id, {});
                if (rw.lines.length && rw.substitutable > 0) {
                  const n = rw.lines.length;
                  const plural = n === 1 ? '' : 's';
                  appAlert(
                    'Update this plan to match your limitations?',
                    `${n} exercise${plural} in it ${n === 1 ? "clashes with an injury or limitation you've set" : 'clash with your injuries or limitations'}. Volyume can swap ${n === 1 ? 'it' : 'them'} for movements that fit. Your history is not rewritten.`,
                    [
                      // Round 8 (R8-3): the F-1 no-op wording here too -
                      // this cancel writes nothing, and in the
                      // capability lane 'Not now' is the word that
                      // DECLINES (HowYouTrainScreen's apply proposal).
                      // One phrase per meaning, on every screen.
                      { text: 'Leave it as it is', style: 'cancel' },
                      {
                        text: 'Update my plan',
                        onPress: async () => {
                          const res = await applyCapabilityPlanRewrite(user.id, rw.lines);
                          if (res.applied > 0) toast.show(`Updated. ${res.applied} exercise${res.applied === 1 ? '' : 's'} swapped to fit your limitations.`);
                        },
                      },
                    ],
                  );
                }
              } catch (_e) { /* the offer is additive; the restart already stands */ }
            } catch (e) {
              logError('PlansScreen.handleRestartPlan', e, { userId: user?.id, planId: activePlan?.id, intent });
              toast.show("Couldn't restart plan, try again", { variant: 'error' });
            } finally {
              restartingRef.current = false;
            }
          },
        },
      ],
    );
  }

  /**
   * Build the next-block review and open it.
   *
   * Everything shown is what the confirm would ACTUALLY do:
   *   - the volume half comes from the same `buildSeedRangesForNextBlock`
   *     the activation passes as its ledger;
   *   - the exercise half comes from a DRY RUN of the same generator the
   *     confirm runs, so the stays/changes/why list is the decision record
   *     the commit will act on rather than a parallel description of it.
   */
  async function openNextBlockReview() {
    // eslint-disable-next-line global-require
    const { buildSeedRangesForNextBlock } = require('../lib/blockLedgerRunner');
    // eslint-disable-next-line global-require
    const { generatePlanDryRun } = require('../lib/planAutoGen');
    // eslint-disable-next-line global-require
    const { buildChangeReceipt } = require('../lib/planRationale');

    setPreparingReview(true);
    try {
      const seedRanges = await buildSeedRangesForNextBlock(user.id, {
        intent: 'adjust', userProfile, tier,
      }).catch(() => null);
      const programmeProposal = blockAdvice?.programmeReview ?? null;
      const dry = await generatePlanDryRun(user.id, userProfile, {
        continuityProposal: programmeProposal,
      }).catch(() => null);
      const decisions = dry?.ok ? (dry.continuity?.decisions ?? []) : [];
      const receipt = decisions.length ? buildChangeReceipt(decisions) : null;
      // Only a genuine exercise change earns a rebuilt programme. When the
      // decisions are all retentions, confirming reactivates the plan the
      // user already has: "if only volume changes are justified, do NOT
      // create needless exercise churn".
      // Round 5 (R5-1): an incumbent no longer in the rebuilt plan IS an
      // exercise change - without it in this count a drop-only rebuild
      // took the reactivation path, so the receipt's "No longer in your
      // plan" section described a drop the confirm would never make.
      const exerciseChanges = receipt
        ? receipt.changes.length + receipt.added.length + receipt.noLongerIn.length
        : 0;
      const prescriptionChanges = receipt?.prescriptionCount ?? 0;
      setBlockReview({
        seedRanges,
        programmeProposal,
        receipt,
        exerciseChanges,
        prescriptionChanges,
        volume: buildSeedReceipt({ ranges: seedRanges?.ranges, ledger: ledgerRecordRef.current }),
        verdictCopy: blockAdvice?.programmeReview?.copy ?? null,
        dryFailed: !dry?.ok,
      });
    } finally {
      setPreparingReview(false);
    }
  }

  /**
   * The one activation path for a block boundary.
   *
   * `refine` decides whether the next block is a rebuilt programme or the
   * same one reactivated. It is passed explicitly by each caller rather
   * than inferred, so the Repeat route cannot acquire a refinement by a
   * change somewhere else in this file.
   */
  async function runBlockActivation({ intent, refine, review = null }) {
    // eslint-disable-next-line global-require
    const { buildSeedRangesForNextBlock, recordSeedOutcome } = require('../lib/blockLedgerRunner');
    // FOUNDER DECISION (fully free, no tier split): only the 'adjust' option
    // applies the full ledger, now with no entitlement to check; everything
    // else is a true repeat.
    const seedIntent = intent === 'adjust' ? 'adjust' : 'repeat';
    // REPEAT MEANS REPEAT, enforced here and not only at the call site: a
    // repeat intent may never rebuild the programme, whatever it was asked
    // for. This is the assertion the epoch module's own header promised.
    const mayRefine = refine === true && seedIntent === 'adjust';
    const seedRanges = review?.seedRanges ?? blockReview?.seedRanges ?? await buildSeedRangesForNextBlock(user.id, {
      intent: seedIntent, userProfile, tier,
    }).catch(() => null);

    if (mayRefine) {
      // The refined next programme, built by the REAL generator, so it
      // carries division intent, movement roles, equipment, session length,
      // exclusions and continuity exactly as a rebuild does. The finished
      // block's own programme is left intact and archived, so what the user
      // actually trained stays true in their history.
      // CC27 (section 9.6) red-team finding 1: the refinement is a real
      // generator run, so the capability pre-flight gates it like every
      // other generation surface. Holding falls into the literal
      // reactivation below: the user keeps their current workouts and no
      // new suggestions are generated on unknown capability state.
      const preflight = await capabilityPreflight(user.id);
      const goAhead = preflight.proceed || await new Promise((resolve) => {
        offerCapabilityPreflightChoice({
          onHold: () => resolve(false),
          onContinue: () => resolve(true),
        });
      });
      const result = !goAhead
        ? { ok: false, error: 'capability_preflight_hold' }
        : await generateAndSavePlan(user.id, userProfile, {
          ledger: seedRanges,
          allowLearnedCarry: true,
          continuityProposal: review?.programmeProposal ?? blockReview?.programmeProposal ?? null,
        });
      if (!result?.ok) {
        // The refinement failed (or the user held it at the pre-flight).
        // Fall back to the literal reactivation the user would otherwise
        // have had rather than leaving them with no new block at all, and
        // say so. A hold is a user choice, not an error, so it skips the
        // error log.
        if (result?.error !== 'capability_preflight_hold') {
          logError('PlansScreen.refineNextBlock', result?.error ?? 'unknown', { userId: user?.id });
        }
        await activatePlanWithBlock(user.id, activePlan.id, planHeadingName(activePlan.name), {
          ledger: seedRanges, allowLearnedCarry: true,
        });
        toast.show('Your next block started with your current workouts', { variant: 'warning' });
      } else if (result.capabilityBlockedCount > 0) {
        // D112 R5 (closes audit T1-12): every generation entry reveals
        // capability effects.
        toast.show(capabilityBlockedNote(result.capabilityBlockedCount), { variant: 'info', duration: 5000 });
      }
    } else {
      // Review D5: on a repeat intent the activation must never reach for
      // the learned carry if the seed build failed.
      await activatePlanWithBlock(user.id, activePlan.id, planHeadingName(activePlan.name), {
        ledger: seedRanges,
        allowLearnedCarry: seedIntent !== 'repeat',
      });
    }

    if (seedRanges?.sourceMesocycleId) {
      recordSeedOutcome(user.id, seedRanges.sourceMesocycleId, {
        intent: seedIntent, ranges: seedRanges.ranges,
      }).catch(() => {});
    }
    const receipt = seedIntent === 'adjust'
      ? buildSeedReceipt({ ranges: seedRanges?.ranges, ledger: ledgerRecordRef.current })
      : null;
    await AsyncStorage.removeItem(BLOCK_SNOOZE_KEY_FOR(user?.id)).catch(() => {});
    await loadData();
    if (receipt && (receipt.changed.length > 0 || receipt.held > 0)) {
      setSeedReceipt(receipt);
    }
  }

  /** Confirm the reviewed next block. */
  async function confirmNextBlockReview() {
    const reviewed = blockReview;
    const refine = ((reviewed?.exerciseChanges ?? 0) + (reviewed?.prescriptionChanges ?? 0)) > 0;
    setBlockReview(null);
    try {
      logInfo('PlansScreen.blockRestart', `intent=adjust refine=${refine}`);
      await runBlockActivation({ intent: 'adjust', refine, review: reviewed });
    } catch (e) {
      logError('PlansScreen.handleRestartPlan', e, { userId: user?.id, planId: activePlan?.id, intent: 'adjust' });
      toast.show("Couldn't restart plan, try again", { variant: 'error' });
    } finally {
      restartingRef.current = false;
    }
  }

  async function handleSnoozeBlock() {
    const snoozeUntil = Date.now() + 7 * 24 * 60 * 60 * 1000;
    await AsyncStorage.setItem(BLOCK_SNOOZE_KEY_FOR(user?.id), String(snoozeUntil)).catch(() => {});
    setBlockSnoozed(true);
  }

  async function handleStartNextWorkout(plan) {
    try {
      const routines = await getRoutinesForPlan(plan.id);
      if (routines.length === 0) {
        toast.show('This plan has no workouts yet', { variant: 'warning' });
        return;
      }
      // C18 BLOCK PROGRESSION: the same authority Home and Train read, so
      // starting from Plans cannot open a different workout from the one Home
      // says is next. The retired `nextWorkoutIndex` is not consulted.
      // eslint-disable-next-line global-require
      const { resolveProgrammePosition } = require('../lib/programmePosition');
      const position = await resolveProgrammePosition(user.id).catch(() => null);
      const next = position?.nextSession ?? null;
      const idx = next
        ? Math.max(0, routines.findIndex((r) => r.id === next.routineId))
        : 0;
      const routine = routines[idx];
      const workout = await createWorkout(user.id, routine.id, {
        mesocycleWeekId: position?.activeWeekId,
      });
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
      logError('PlansScreen.handleStartNextWorkout', e, { userId: user?.id, planId: plan?.id });
      toast.show("Couldn't start workout, try again", { variant: 'error' });
    }
  }

  async function handleSetActive(plan) {
    // C5-P10-01 / C5-P10-08 (D96): "Set as active" was a bare verb. It
    // creates a training block, so it says so before it runs, in the same
    // wording every other activation entry point uses, free and Pro alike.
    // Only on a FIRST activation: once a plan is active, switching already
    // has its own explanation (confirmPlanSwitchMidBlock names the block it
    // restarts), and two dialogues in a row would be the noise Campaign 5
    // is removing. In week 1 that confirm passes silently by design, which
    // is why a first-time user could never be told.
    // RB-3 (D96, Review B): this path had no entry guard at all, and once a
    // plan is active the confirm above it is skipped, so two taps ran two
    // activations back to back. Same ref as the block restart, so the two
    // activation paths also exclude each other.
    if (restartingRef.current) return;
    restartingRef.current = true;
    try {
      // D139: planSwitch now shows this same dialogue itself whenever a block
      // exists (week 1 included), so this local copy is only for the truly
      // first activation with no block at all; otherwise two identical
      // dialogues would run back to back.
      if (!activePlan && !blockAdvice?.blockStatus) {
        const confirmed = await new Promise((resolve) => {
          appAlert(
            'Make this your active plan?',
            `${BLOCK_START_SENTENCE} ${ACTIVATION_MEANING_SENTENCE}`,
            [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Set as active', onPress: () => resolve(true) },
            ],
            { cancelable: true, onDismiss: () => resolve(false) },
          );
        });
        if (!confirmed) return;
      }
      const ok = await confirmPlanSwitchMidBlock(user.id, { newPlanName: planHeadingName(plan.name) });
      if (!ok) return;
      await activatePlanWithBlock(user.id, plan.id, planHeadingName(plan.name));
      await loadData();
      // C5-P10-05 (D96): the same success confirmation the other activation
      // paths give; this one used to toast on failure only.
      toast.show(`"${planHeadingName(plan.name)}" is now your active plan`, { variant: 'success' });
    } catch (e) {
      logError('PlansScreen.handleSetActive', e, { userId: user?.id, planId: plan?.id });
      toast.show("Couldn't set active plan, try again", { variant: 'error' });
    } finally {
      restartingRef.current = false;
    }
  }

  function toggleFolder(folderId) {
    // R9 (D70): folder expand/collapse joins the app's haptic vocabulary.
    haptics.selection();
    setCollapsedFolders(prev => ({ ...prev, [folderId]: !prev[folderId] }));
  }

  function openRenameFolder(folder) {
    setFolderName(folder.name);
    setFolderPrompt({ mode: 'rename', folder });
  }

  async function handleSaveFolder() {
    const name = folderName.trim();
    if (!name || savingFolder) return;
    // Block a duplicate name (case-insensitive). On rename the folder may keep
    // its own name; only a *different* folder sharing the name is a clash.
    const editingId = folderPrompt?.mode === 'rename' ? folderPrompt.folder?.id : null;
    const clash = folders.some(
      f => f.id !== editingId && (f.name || '').trim().toLowerCase() === name.toLowerCase(),
    );
    if (clash) {
      toast.show('A folder with that name already exists', { variant: 'warning' });
      return;
    }
    setSavingFolder(true);
    try {
      if (folderPrompt?.mode === 'rename' && folderPrompt.folder) {
        await renamePlanFolder(folderPrompt.folder.id, name);
      } else {
        await createPlanFolder(user.id, name);
      }
      setFolderPrompt(null);
      setFolderName('');
      await loadData();
    } catch (e) {
      logError('PlansScreen.handleSaveFolder', e, { userId: user?.id });
      toast.show("Couldn't save folder, try again", { variant: 'error' });
    } finally {
      setSavingFolder(false);
    }
  }

  function handleDeleteFolder(folder) {
    appAlert(
      'Delete folder?',
      `"${folder.name}" will be removed. Its plans are kept and moved back to My plans.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete folder',
          style: 'destructive',
          onPress: async () => {
            try {
              await deletePlanFolder(folder.id);
              await loadData();
            } catch (e) {
              logError('PlansScreen.handleDeleteFolder', e, { userId: user?.id, folderId: folder?.id });
              toast.show("Couldn't delete folder, try again", { variant: 'error' });
            }
          },
        },
      ],
    );
  }

  function handleFolderOptions(folder) {
    // R9 (D70): every peek-menu-opening tap ticks selection().
    haptics.selection();
    peekRef.current?.open({
      title: folder.name,
      items: [
        { icon: 'create-outline', label: 'Rename folder', onPress: () => openRenameFolder(folder) },
        {
          icon: 'trash-outline', label: 'Delete folder', destructive: true,
          onPress: () => handleDeleteFolder(folder),
        },
      ],
    });
  }

  async function handleMovePlanToFolder(plan, folderId) {
    try {
      await setPlanFolder(plan.id, folderId);
      await loadData();
    } catch (e) {
      logError('PlansScreen.handleMovePlanToFolder', e, { userId: user?.id, planId: plan?.id });
      toast.show("Couldn't move plan, try again", { variant: 'error' });
    }
  }

  // "Move to folder" peek: lists every folder plus "No folder" to unfile.
  function handleMovePlanOptions(plan) {
    const items = folders.map(f => ({
      icon: plan.folderId === f.id ? 'checkmark-circle-outline' : 'folder-outline',
      label: f.name,
      onPress: () => handleMovePlanToFolder(plan, f.id),
    }));
    items.push({
      icon: plan.folderId == null ? 'checkmark-circle-outline' : 'remove-circle-outline',
      label: 'No folder',
      onPress: () => handleMovePlanToFolder(plan, null),
    });
    peekRef.current?.open({ title: `Move ${planHeadingName(plan.name)}`, items });
  }

  async function handlePlanOptions(plan) {
    // R9 (D70): every peek-menu-opening tap ticks selection().
    haptics.selection();
    const isActiveForUser = activePlan?.id === plan.id;
    // FOUNDER DECISION (fully free, no tier split): every account keeps an
    // always-active plan as part of Precision Coaching now, so nobody gets
    // the Duplicate action (it applied to Free only). Archiving inactive
    // plans stays available, with restore from the Archived section.
    const items = [
      {
        icon: 'eye-outline',
        label: 'View plan',
        onPress: () => navigation.navigate('PlanDetail', { planId: plan.id, isLibrary: false }),
      },
      {
        icon: 'play-circle-outline',
        label: 'Set active',
        onPress: () => handleSetActive(plan),
      },
      {
        icon: 'folder-outline',
        label: plan.folderId ? 'Move to another folder' : 'Move to folder',
        onPress: () => handleMovePlanOptions(plan),
      },
    ];
    if (!isActiveForUser) {
      items.push({
        icon: 'archive-outline',
        label: 'Archive plan',
        destructive: true,
        // R9 (D70): archiving is reversible by its own copy (the Archived
        // section restores it), so per the house rule it commits
        // immediately with an undo toast instead of a blocking confirm.
        onPress: async () => {
          await archivePlan(plan.id);
          await loadData();
          toast.show(`${planHeadingName(plan.name)} archived. Session history stays intact.`, {
            variant: 'undo',
            action: {
              label: 'Undo',
              onPress: async () => {
                try { await unarchivePlan(plan.id); await loadData(); } catch (_) { /* best effort */ }
              },
            },
          });
        },
      });
    }
    peekRef.current?.open({ title: planHeadingName(plan.name), items });
  }

  function handleArchivedPlanOptions(plan) {
    // R9 (D70): every peek-menu-opening tap ticks selection().
    haptics.selection();
    const items = [
      {
        icon: 'eye-outline',
        label: 'View plan',
        onPress: () => navigation.navigate('PlanDetail', { planId: plan.id, isLibrary: false }),
      },
      {
        icon: 'arrow-undo-outline',
        label: 'Restore plan',
        onPress: async () => { await unarchivePlan(plan.id); await loadData(); },
      },
    ];
    peekRef.current?.open({ title: planHeadingName(plan.name), items });
  }

  async function handleTemplateOptions(routine) {
    // R9 (D70): the "..." options tap ticks selection(), same as the other
    // plan/folder options affordances, even though this one opens an
    // appAlert rather than the shared PeekMenu.
    haptics.selection();
    appAlert(routine.name, undefined, [
      { text: 'Edit', onPress: () => navigation.navigate('RoutineDetail', { routineId: routine.id }) },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => appAlert(
          'Delete saved workout?',
          `"${routine.name}" will be removed.`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              // D141 item 4: the sibling folder delete above logs and tells
              // the user on failure; this one had no handling at all, so a
              // thrown softDeleteRoutine was an unhandled rejection and the
              // workout simply failed to disappear with nothing said.
              onPress: async () => {
                try {
                  await softDeleteRoutine(routine.id);
                  await loadData();
                } catch (e) {
                  logError('PlansScreen.handleDeleteRoutine', e, { userId: user?.id, routineId: routine?.id });
                  toast.show("Couldn't delete that workout, try again", { variant: 'error' });
                }
              },
            },
          ],
        ),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function handleStartTemplate(routine) {
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
      logError('PlansScreen.handleStartTemplate', e, { userId: user?.id, routineId: routine?.id });
      toast.show("Couldn't start workout, try again", { variant: 'error' });
    }
  }

  // CP-10 batch G (2026-07-11): defined inside the component body (not
  // module scope), so it already closes over `t` from the render above --
  // wording/logic byte-identical, only the token SOURCE moved from the
  // frozen import to the live theme.
  function blockIconColor(action) {
    if (action === 'in_recovery') return t.colors.primary;
    if (action === 'post_recovery') return t.colors.success;
    return t.colors.warning;
  }

  const showBlockCard = blockAdvice && activePlan &&
    blockAdvice.action !== 'continue' &&
    !blockSnoozed;

  // FB-04 (D96): exactly the week the advisor's dead 'continue' body is a
  // real warning -- the last accumulation week, with the recovery week next.
  const showPeakWeekNote = blockAdvice?.action === 'continue'
    && blockAdvice.blockStatus
    && (blockAdvice.blockStatus.recoveryWeek - blockAdvice.blockStatus.currentWeek) === 1;

  // FQ-2 (D96): the block-completion decision. The two options are constants
  // of this surface, always both, always in this order; the advisor's
  // recommendation can only MARK one of them (blockAdvisor.buildNextBlockOptions).
  // Which options a user can reach comes from the real entitlement, never
  // from what the advisor decided or what check-in rows happen to exist.
  // C8 Work 1 (RA6-8/RA6-9): the recommendation is re-decided from the
  // evidence that actually seeds the adjusted block, so the mark on the
  // options, the headline/body and the delta lines all agree. With no
  // preview this is the base recommendation, unchanged. FQ-2 is intact:
  // buildNextBlockOptions still receives only a MARK, never a gate.
  const nextBlockDecided = blockAdvice?.nextBlock
    ? applyAdjustEvidence(blockAdvice.nextBlock, adjustPreview, {
        finished: blockAdvice.action === 'post_recovery',
      })
    : null;
  // FOUNDER DECISION (fully free, no tier split): isPro is always true, so
  // buildNextBlockOptions never marks an option locked any more.
  const nextBlockOptions = nextBlockDecided
    ? buildNextBlockOptions({
        recommendation: nextBlockDecided.recommendation,
        isPro: true,
      })
    : [];
  const reachableOptions = nextBlockOptions.filter((o) => !o.locked);
  const anyRecommended = nextBlockOptions.some((o) => o.recommended);
  function optionVariant(opt) {
    if (opt.recommended) return 'primary';
    // With nothing recommended and only one option reachable, that option
    // carries the card. Two reachable options stay visually equal unless the
    // advisor has actually suggested one.
    if (!anyRecommended && reachableOptions.length === 1) return 'primary';
    return 'secondary';
  }

  const isProWithPlan = !!activePlan;
  // FOUNDER DECISION (fully free, no tier split): every account gets the
  // coached-builder card set now (it used to be Pro-only); the Free default
  // order (library first, manual second) is retired.
  // D139 (finding: "'Adjust training plan' rendered with no plan to
  // adjust"): with no active plan there is nothing for it to adjust, and
  // the library card duplicates the no-plan EmptyState's own "Browse
  // plans" route, so the no-plan state offers only "Create your own".
  const actionCards = activePlan
    ? ACTION_CARDS_PRO_SWITCH
    : ACTION_CARDS_PRO_SWITCH.filter((card) => card.id === 'manual');

  // Group the non-active plans by folder. Plans whose folder_id is null (or
  // points at a now-deleted folder) fall through to the unfiled "My plans"
  // list, so a plan can never become unreachable.
  const folderIds = new Set(folders.map(f => f.id));
  const plansByFolder = {};
  const unfiledPlans = [];
  for (const plan of myPlans) {
    if (plan.folderId && folderIds.has(plan.folderId)) {
      (plansByFolder[plan.folderId] = plansByFolder[plan.folderId] || []).push(plan);
    } else {
      unfiledPlans.push(plan);
    }
  }

  return (
    <SafeAreaView style={[styles.safe, live.safe]} edges={['top']}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={t.colors.primary} />}
      >
        <ScreenHeader title="Train" />

        {/* First-load skeleton: mirror the active-plan hero + a couple of
            plan cards so the screen doesn't flash empty states before data
            arrives. Refreshes (pull-to-refresh, focus) keep the real
            content, since `loaded` stays true after the first pass. */}
        {!loaded ? (
          <View style={styles.skeletonWrap}>
            <SkeletonCard height={120} />
            <SkeletonCard height={72} />
            <SkeletonCard height={72} />
          </View>
        ) : null}

        {loaded ? (
          <>
        {/* Active Plan. Campaign 25 (PLANS-SCREEN-SPEC.md §2 item 1): the
            hero renders FIRST -- content and the three branches below are
            byte-identical to before, only their position (now ahead of the
            block-advice card) moved. */}
        {loadError && !activePlan ? (
          // EP-09/P-06: only shown when there is genuinely nothing to fall
          // back on (a refresh failure with an already-loaded active plan
          // keeps showing that plan card instead, per loadError being gated
          // on !activePlan here). A load failure must never be mistaken for
          // a confirmed "no active plan" account state.
          <EmptyState
            icon="cloud-offline-outline"
            title="Couldn't load your plans"
            text="Check your connection and try again. Nothing has been lost."
            actionLabel="Retry"
            onAction={loadData}
            actionAccessibilityLabel="Retry loading your plans"
          />
        ) : activePlan ? (
          <View style={styles.section}>
            <Card style={[styles.activePlanCard, live.activePlanCard]}>
              <View style={styles.activePlanHeader}>
                <View style={[styles.activeBadge, live.activeBadge]}>
                  <Text style={[styles.activeBadgeText, live.activeBadgeText]}>Active</Text>
                </View>
                <TouchableOpacity onPress={() => handlePlanOptions(activePlan)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityRole="button" accessibilityLabel="Plan options">
                  <Ionicons name="ellipsis-vertical" size={18} color={t.colors.textSecondary} />
                </TouchableOpacity>
              </View>
              {/* Must-fix 3 (2026-07-11): this is the card heading, so it drops the
                  "N×/Week" frequency baked into activePlan.name (see planDisplay.js);
                  the raw name is unchanged everywhere else it is read. */}
              <Text style={[styles.activePlanName, live.activePlanName]}>{planHeadingName(activePlan.name)}</Text>
              {planWorkoutCounts[activePlan.id] ? (
                <Text style={[styles.activePlanMeta, live.activePlanMeta]}>
                  {planWorkoutCounts[activePlan.id]} workout{planWorkoutCounts[activePlan.id] !== 1 ? 's' : ''}
                </Text>
              ) : null}
              {/* D139 (finding: "the one good block definition sat behind a
                  tooltip on a secondary screen while 'Week N of M' hid
                  whenever the advisor was not on 'continue'"): the block
                  position now renders whenever a block exists, on every
                  advisor branch, not only 'continue' -- with a state-aware
                  label (recovery week; block finished, awaiting a decision)
                  and the same block definition MesocycleBuilderScreen's own
                  tooltip carries, from the one shared constant. */}
              {blockAdvice?.blockStatus && (
                <View style={styles.activePlanWeekRow}>
                  <Text style={[styles.activePlanWeek, live.activePlanWeek]}>
                    {blockAdvice.blockStatus.status === 'recovery'
                      ? `Recovery week, week ${blockAdvice.blockStatus.currentWeek} of ${blockAdvice.blockStatus.totalWeeks}`
                      : blockAdvice.blockStatus.status === 'completed_awaiting_decision'
                        ? 'Block finished'
                        : `Week ${blockAdvice.blockStatus.currentWeek} of ${blockAdvice.blockStatus.totalWeeks}`}
                  </Text>
                  <InfoTooltip text={BLOCK_DEFINITION} size={13} />
                </View>
              )}
              {/* FB-04 (D96): the only forward warning in the product --
                  "One more week before your recovery week. Push hard this
                  week. It's your peak." -- was composed by the advisor's
                  'continue' branch and then never rendered, because the
                  block card is hidden on 'continue'. It is surfaced here in
                  the week it is true, so a first-time user meets the
                  recovery week having been told it is coming. The other
                  'continue' bodies ("Training is going well. Stay on plan.")
                  stay unrendered: they add nothing this card does not say. */}
              {blockAdvice?.action === 'continue' && showPeakWeekNote && (
                <Text style={[styles.proCoachNote, live.proCoachNote]}>{blockAdvice.body}</Text>
              )}
              {/* FOUNDER DECISION (fully free, no tier split): this note
                  renders for every account now. */}
              <Text style={[styles.proCoachNote, live.proCoachNote]}>
                Your coach reviews this plan each week and suggests changes for you to apply. Change training setup or switch plans from the options below.
              </Text>
              {/* B-1 (F-18): once every required session this week is
                  resolved there is no "next workout" to start, and the row
                  used to start session 1 again. It states the position and
                  its action becomes the choice, mirroring Today's own
                  week-complete hero. */}
              {weekComplete ? (
                <Text style={[styles.proCoachNote, live.proCoachNote]}>
                  Week complete. Your next session is on Monday.
                </Text>
              ) : null}
              <View style={styles.activePlanActions}>
                {/* R9 (D70): startNextBtn -> shared Button primary (fires its
                    own selection() tick on press). */}
                <Button
                  variant="primary"
                  icon={weekComplete ? 'list-outline' : 'play'}
                  title={weekComplete ? 'Do another session' : 'Start next workout'}
                  onPress={() => (weekComplete
                    ? navigation.navigate('PlanDetail', { planId: activePlan.id, isLibrary: false })
                    : handleStartNextWorkout(activePlan))}
                  accessibilityLabel={weekComplete ? 'Do another session from your plan' : 'Start next workout'}
                  style={styles.startNextBtnWrap}
                />
                {/* B-1 (F-18): in the week-complete state the primary above
                    already opens the plan (to choose an extra session), so a
                    second button to the same screen would be noise. Nothing
                    is lost: the destination is identical. */}
                {weekComplete ? null : (
                  <Button
                    variant="secondary"
                    title="View plan"
                    onPress={() => navigation.navigate('PlanDetail', { planId: activePlan.id, isLibrary: false })}
                    accessibilityLabel="View plan"
                  />
                )}
              </View>
            </Card>
          </View>
        ) : (
          /* FOUNDER DECISION (fully free, no tier split): the Free no-plan
             branch (FreeStarter quiz) is retired -- this is the only
             no-plan state now.
             C5-P10-09 (D96): the Pro no-plan state used to be an inert Card
             naming an action it did not offer ("Start with a plan" is the
             FREE path's route to the starter quiz; there was no Pro
             affordance with that name, no onPress and no button). It gets
             the same real two-CTA EmptyState shape the free branch had,
             with the coach-built plan Home's Pro branch already offers, so
             the verb and the action finally agree. */
          /* D141 item 10a: unified with HomeScreen's own no-plan copy.
             Voice rule applied: COACHING_VOICE_SYNTHESIS_LOCKED.md addendum
             "actor-naming rule (two registers)" (line ~836) -- "Volyume"
             names the app only (saving, syncing, reminders), never the
             coaching decider; building the plan is Precision Coaching's
             call, so the actor is "your coach", the locked informal actor
             for running prose (line ~829-830), not collaborative "we".
             Noun unified to "setup" (was "profile" here). Plans' own extra
             clause (the library) is kept. */
          <EmptyState
            icon="barbell-outline"
            title="No active plan yet"
            text={`Start with a plan and your coach builds one from your setup, or browse the library and pick one yourself. ${BLOCK_START_SENTENCE}`}
            actionLabel="Start with a plan"
            onAction={handleStartWithPlanPress}
            actionAccessibilityLabel="Start with a plan built from your setup"
            busy={preparingPlan}
            secondaryLabel="Browse plans"
            onSecondary={() => navigation.navigate('PlanLibrary')}
            secondaryAccessibilityLabel="Browse the plan library"
          />
        )}

        {/* Block advisor card */}
        {showBlockCard && (
          <Card style={[
            styles.blockCard,
            blockAdvice.action === 'heads_up' && [styles.blockCardHeadsUp, live.blockCardHeadsUp],
            blockAdvice.action === 'early_deload' && [styles.blockCardWarning, live.blockCardWarning],
            blockAdvice.action === 'in_recovery' && [styles.blockCardRecovery, live.blockCardRecovery],
            blockAdvice.action === 'post_recovery' && [styles.blockCardComplete, live.blockCardComplete],
          ]}>
            <View style={styles.blockCardHeader}>
              <View style={[styles.blockCardIconWrap, live.blockCardIconWrap]}>
                <Ionicons
                  name={BLOCK_ICON[blockAdvice.action] || 'information-circle-outline'}
                  size={20}
                  color={blockIconColor(blockAdvice.action)}
                />
              </View>
              <Text style={[styles.blockCardTitle, live.blockCardTitle]}>{blockAdvice.headline}</Text>
            </View>

            <Text style={[styles.blockCardBody, live.blockCardBody]}>{blockAdvice.body}</Text>

            {/* C16 phase C: the recovery-week heads-up. It says a review is
                coming and what it will consider. It promises no changes,
                because none have been decided yet. */}
            {blockAdvice.reviewHeadsUp && (
              <Text style={[styles.blockReviewHeadsUp, live.blockReviewHeadsUp]}>
                {blockAdvice.reviewHeadsUp}
              </Text>
            )}

            {/* C16 phase C: the programme verdict, in user language, on the
                persistent decision surface. Shown beside the volume
                recommendation, never instead of it: a block boundary always
                evaluates volume, and structure only when there is history
                for it. Nothing here has happened yet. */}
            {blockAdvice.programmeReview?.copy && (
              <View style={[styles.programmeVerdict, live.programmeVerdict]}>
                <Text style={[styles.programmeVerdictTitle, live.programmeVerdictTitle]}>
                  {blockAdvice.programmeReview.copy.title}
                </Text>
                <Text style={[styles.programmeVerdictBody, live.programmeVerdictBody]}>
                  {blockAdvice.programmeReview.copy.body}
                </Text>
              </View>
            )}

            {/* Signal chips, shown for early_deload and heads_up */}
            {blockAdvice.signals?.filter(s => s.severity !== 'info').length > 0 && (
              <View style={styles.signalRow}>
                {blockAdvice.signals.filter(s => s.severity !== 'info').map((sig, i) => (
                  <View key={i} style={[styles.signalChip, live.signalChip, sig.severity === 'high' && [styles.signalChipHigh, live.signalChipHigh]]}>
                    <Text style={[styles.signalChipText, live.signalChipText, sig.severity === 'high' && [styles.signalChipTextHigh, live.signalChipTextHigh]]}>
                      {sig.label}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* Next block recommendation */}
            {blockAdvice.nextBlock && (
              <View style={[styles.nextBlockSection, live.nextBlockSection]}>
                {blockAdvice.action === 'in_recovery' && (
                  <Text style={[styles.nextBlockPreLabel, live.nextBlockPreLabel]}>After your recovery week</Text>
                )}
                {/* C8 Work 1: recommendation and explanation come from ONE
                    source - the same seed evidence the lines below show. */}
                <Text style={[styles.nextBlockHeadline, live.nextBlockHeadline]}>{nextBlockDecided.headline}</Text>
                <Text style={[styles.nextBlockBody, live.nextBlockBody]}>{nextBlockDecided.body}</Text>

                {/* Stage 8 (§3.6): the block-end story, muscle by muscle,
                    each line the ledger's own delta-composed rationale.
                    FQ-2 (D96): the rows render with the decision whatever
                    the advisor favours -- a well-run block never silently
                    discards its own ledger again (FB-19) -- gated only on
                    the Pro entitlement in loadData, since they are the
                    coaching decision's evidence. The framing line below
                    keeps the forward claims honest now that both options
                    are on the card. The recovery proposal line is a
                    user-call statement and renders for any post_recovery
                    card. */}
                {blockAdvice.action === 'post_recovery'
                  && (ledgerStory?.rows?.length || ledgerStory?.recoveryLine) ? (
                    <View style={styles.ledgerStory}>
                      {ledgerStory.rows?.length ? (
                        <Text style={[styles.ledgerStoryLabel, live.ledgerStoryLabel]}>
                          What this block showed
                        </Text>
                      ) : null}
                      {(ledgerStory.rows || []).map((row) => (
                        <Text key={row.muscle} style={[styles.ledgerStoryLine, live.nextBlockBody]}>
                          {row.rationale}
                        </Text>
                      ))}
                      {/* C8 Work 1 (RA6-8/RA6-9): the REAL difference between
                          the two options, computed from the seed ranges the
                          adjust intent would actually use. When there is no
                          meaningful difference the preview says so plainly
                          rather than implying adaptation. Falls back to the
                          previous framing line only when the preview could
                          not be built. */}
                      {ledgerStory.rows?.length ? (
                        adjustPreview ? (
                          <>
                            <Text style={[styles.ledgerStoryLabel, live.ledgerStoryLabel]}>
                              {adjustPreview.meaningful
                                ? 'What continuing with adjustments would change'
                                : 'What continuing with adjustments would change: nothing'}
                            </Text>
                            {adjustPreviewLines(adjustPreview).map((line, i) => (
                              <Text key={String(i)} style={[styles.ledgerStoryLine, live.nextBlockBody]}>
                                {line}
                              </Text>
                            ))}
                            <Text style={[styles.ledgerStoryLine, live.nextBlockBody]}>
                              {adjustPreview.meaningful
                                ? 'Running the plan again keeps the same targets as last time.'
                                : 'Either option gives you the same training week.'}
                            </Text>
                          </>
                        ) : (
                          <Text style={[styles.ledgerStoryLine, live.nextBlockBody]}>
                            {ledgerStory.allUnjudged
                              ? 'This block did not log enough recovery feedback to judge these, so this time both options start the next block from the same targets.'
                              : 'These apply if you continue with adjustments. Running the plan again keeps the same targets as last time.'}
                          </Text>
                        )
                      ) : null}
                      {ledgerStory.recoveryLine ? (
                        <Text style={[styles.ledgerStoryLine, live.nextBlockBody]}>
                          {ledgerStory.recoveryLine}
                        </Text>
                      ) : null}
                    </View>
                  ) : null}

                {/* FB-15 (D96): the block summary, reachable AT the decision
                    it exists to inform. A finished block keeps is_active = 1
                    until the next one is created, so it appeared in neither
                    "Past blocks" nor MesocycleBuilder's "View block summary"
                    button for the entire awaiting-decision window -- the one
                    screen that answers "what did this block show" was
                    reachable only after the decision had been made. */}
                {blockAdvice.action === 'post_recovery' && activeBlockId && (
                  <Button
                    variant="tertiary"
                    size="sm"
                    fullWidth={false}
                    icon="document-text-outline"
                    title="See what this block showed"
                    onPress={() => navigateCrossTab(navigation, 'ProfileTab', 'BlockReflection', { mesocycleId: activeBlockId })}
                    accessibilityLabel="See what this block showed"
                  />
                )}

                {/* CTAs only shown when block is complete and recovery is done.
                    FQ-2 (D96): BOTH next-block options render, side by side as
                    equally reachable choices. Before this, the advisor returned
                    ONE object and the screen rendered ONE primary button, so
                    the other path was unreachable from the only decision
                    surface in the app (FB-31) and which one you got turned on
                    weekly check-in readiness (FB-19/FB-36). The advisor is now
                    advice: it may mark one option "Suggested" and explains why
                    in the headline/body above, and it can neither hide nor
                    pre-select away the other. Every option still goes through
                    handleRestartPlan's explicit confirm (FB-34/35 unchanged:
                    nothing transitions on its own). */}
                {blockAdvice.action === 'post_recovery' && (
                  <View style={styles.blockDecision}>
                    {reachableOptions.length > 1 ? (
                      // RA-6 (D96, Review A): the entire difference between
                      // the two options rests on "weekly set targets", a
                      // term unglossed at the most consequential decision
                      // in the app. GLOSSARY.volume defines it plainly.
                      <Text style={[styles.nextBlockBody, live.nextBlockBody]}>
                        Both options are open. Whichever you choose, the new block starts today.{' '}
                        <InfoTooltip text={GLOSSARY.volume} size={13} />
                      </Text>
                    ) : null}

                    {nextBlockOptions.map((opt) => (
                      <View key={opt.intent} style={styles.blockOption}>
                        {/* R9 (D70): the shared Button primitive. Primary
                            fires its own selection() tick, so no manual
                            haptic here. */}
                        {/* FOUNDER DECISION (fully free, no tier split):
                            nextBlockOptions is built with isPro: true now,
                            so no option is ever locked -- the ProUpgrade
                            route and the ProBadge/"Part of Pro" tag below
                            are retired. */}
                        <Button
                          variant={optionVariant(opt)}
                          icon={opt.intent === 'repeat' ? 'refresh-outline' : 'trending-up-outline'}
                          title={opt.label}
                          onPress={() => handleRestartPlan(opt.intent)}
                          // The adjusted route reads the plan and dry-runs the
                          // generator before it can show the review, so the
                          // button reports that rather than sitting inert.
                          loading={preparingReview && opt.intent === 'adjust'}
                          disabled={preparingReview}
                          accessibilityLabel={opt.label}
                        />
                        {opt.recommended ? (
                          <View style={styles.blockOptionTags}>
                            <Text style={[styles.blockOptionFlag, live.blockOptionFlag]}>Suggested</Text>
                          </View>
                        ) : null}
                        <Text style={[styles.blockOptionDetail, live.blockOptionDetail]}>
                          {opt.detail}
                        </Text>
                      </View>
                    ))}

                    {/* FOUNDER DECISION (fully free, no tier split): this
                        always opens PlanUpdate now -- the Free route to
                        PlanLibrary/ProUpgrade (D94, Campaign 3, F1) is
                        retired. */}
                    <Button
                      variant="secondary"
                      title={blockAdvice.nextBlock.secondaryLabel}
                      onPress={() => {
                        // D139 item 9: funnel telemetry, the block decision
                        // by intent -- 'change' for the "Change my training
                        // setup" route.
                        if (user?.id) track(user.id, 'block_decision', { intent: 'change' }).catch(() => {});
                        navigation.navigate('PlanUpdate');
                      }}
                      accessibilityLabel={blockAdvice.nextBlock.secondaryLabel}
                    />
                  </View>
                )}
              </View>
            )}

            {/* Early deload dismiss options */}
            {blockAdvice.action === 'early_deload' && (
              <View style={styles.blockCardActions}>
                {/* R9 (D70): blockRestartBtn -> Button primary. handleSnoozeBlock
                    is shared with the plain snooze text-links below, which get
                    a manual selection() tick; this one doesn't, since the
                    primary variant already fires one on press (never double-fire). */}
                <Button
                  variant="primary"
                  title="Got it, ease off this week"
                  onPress={handleSnoozeBlock}
                  accessibilityLabel="Got it, ease off this week"
                  style={styles.blockCtaButton}
                />
                {/* blockNewBtn -> Button secondary. Secondary stays silent by
                    itself, so the snooze tap gets its manual selection() tick
                    here (R9 (D70) haptics vocabulary sweep). */}
                <Button
                  variant="secondary"
                  title="Keep going"
                  onPress={() => { haptics.selection(); handleSnoozeBlock(); }}
                  accessibilityLabel="Keep going"
                  style={styles.blockCtaButton}
                />
              </View>
            )}

            {/* Snooze links for recovery states */}
            {(blockAdvice.action === 'in_recovery' || blockAdvice.action === 'post_recovery') && (
              <TouchableOpacity
                onPress={() => { haptics.selection(); handleSnoozeBlock(); }}
                style={styles.blockSnooze}
                accessibilityRole="button"
                accessibilityLabel={blockAdvice.action === 'in_recovery'
                  ? 'Remind me after recovery week'
                  : 'Not quite ready. Remind me later.'}
              >
                <Text style={[styles.blockSnoozeText, live.blockSnoozeText]}>
                  {blockAdvice.action === 'in_recovery'
                    ? 'Remind me after recovery week'
                    : 'Not quite ready. Remind me later.'}
                </Text>
              </TouchableOpacity>
            )}

            {/* Heads-up acknowledge: lets the user close the banner once
                they've read it. Reuses the same 7-day snooze used by the
                recovery states; the next weekly check-in (or fresh signals)
                will surface the banner again if conditions still apply. */}
            {blockAdvice.action === 'heads_up' && (
              <TouchableOpacity onPress={() => { haptics.selection(); handleSnoozeBlock(); }} style={styles.blockSnooze} accessibilityRole="button" accessibilityLabel="Got it">
                <Text style={[styles.blockSnoozeText, live.blockSnoozeText]}>Got it</Text>
              </TouchableOpacity>
            )}
          </Card>
        )}

        {/* Community (blueprint section 1, entry point 3): programmes other
            lifters have published, under the user's own plans. Same row
            shape as Plan tools below, so it reads as one more place plans
            come from rather than a promotion. */}
        <View style={styles.section}>
          <Card
            style={styles.trainingBlocksRow}
            onPress={() => navigateCrossTab(navigation, 'HomeTab', 'Community', { segment: 'discover', focus: 'programmes' })}
            accessibilityLabel="Programmes from the community"
          >
            <View style={[styles.trainingBlocksIcon, live.trainingBlocksIcon]}>
              <Ionicons name="people-outline" size={20} color={t.colors.textSecondary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.trainingBlocksLabel, live.trainingBlocksLabel]}>Programmes from the community</Text>
              <Text style={[styles.trainingBlocksSub, live.trainingBlocksSub]}>Use or adapt what other lifters have built</Text>
            </View>
            <Ionicons name="chevron-forward" size={iconSize.sm} color={t.colors.textMuted} />
          </Card>
        </View>

        {/* Plan tools. Campaign 25 (PLANS-SCREEN-SPEC.md §2 item 3): MOVED UP
            from the page bottom, one SectionLabel over the training-blocks
            row and the action cards -- same components, same destinations,
            same tier logic (actionCards, above), only position and the
            unifying label change. */}
        <View style={styles.section}>
          <SectionLabel>Plan tools</SectionLabel>
          {/* D134 (founder 2026-09-03): the FIRST row, always shown - the
              thing every plan is built from lives where plans are built.
              Same card as the rows beneath; only the live line is new. */}
          <Card
            style={styles.trainingBlocksRow}
            onPress={() => navigation.navigate('HowYouTrain')}
            accessibilityLabel={`Injuries & limitations. ${hytSummary.sub}`}
          >
            <View style={[styles.trainingBlocksIcon, live.trainingBlocksIcon]}>
              <Ionicons name="body-outline" size={20} color={hytSummary.attention ? t.colors.primary : t.colors.textSecondary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.trainingBlocksLabel, live.trainingBlocksLabel]}>Injuries & limitations</Text>
              <Text style={[styles.trainingBlocksSub, live.trainingBlocksSub]}>{hytSummary.sub}</Text>
            </View>
            <Ionicons name="chevron-forward" size={iconSize.sm} color={t.colors.textMuted} />
          </Card>
          <Card
            style={styles.trainingBlocksRow}
            onPress={() => navigation.navigate('MesocycleBuilder')}
            accessibilityLabel="Training blocks"
          >
            <View style={[styles.trainingBlocksIcon, live.trainingBlocksIcon]}>
              <Ionicons name="layers-outline" size={20} color={t.colors.textSecondary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.trainingBlocksLabel, live.trainingBlocksLabel]}>Training blocks</Text>
              <Text style={[styles.trainingBlocksSub, live.trainingBlocksSub]}>View completed blocks and long-term progress</Text>
            </View>
            <Ionicons name="chevron-forward" size={iconSize.sm} color={t.colors.textMuted} />
          </Card>
          {/* D109-3: only renders when the count is > 0 - no empty-state
              entry point in Plan tools for a feature most users never touch.
              Set/clear stays on the exercise long-press (RoutineDetailScreen);
              this is the list home. */}
          {avoidedMovementsCount > 0 && (
            <Card
              style={styles.trainingBlocksRow}
              onPress={() => navigation.navigate('AvoidedMovements')}
              accessibilityLabel={`Avoided movements, ${avoidedMovementsCount}`}
            >
              <View style={[styles.trainingBlocksIcon, live.trainingBlocksIcon]}>
                <Ionicons name="shield-outline" size={20} color={t.colors.textSecondary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.trainingBlocksLabel, live.trainingBlocksLabel]}>
                  Avoided movements · {avoidedMovementsCount}
                </Text>
                <Text style={[styles.trainingBlocksSub, live.trainingBlocksSub]}>Movement patterns Volyume is leaving out of suggestions</Text>
              </View>
              <Ionicons name="chevron-forward" size={iconSize.sm} color={t.colors.textMuted} />
            </Card>
          )}
          {/* C5-P10-01 (D96): this sentence was the only place in the
              product that said activation starts a block, and it was gated
              on already BEING Pro with an active plan, so no first-time
              user could ever read it. The gate stays (it is the switching
              audience's note), and the first-use paths now carry the same
              fact at their own activation decision points. */}
          {isProWithPlan && (
            <Text style={[styles.sectionSubtitle, live.sectionSubtitle]}>
              Your check-ins, PRs, and coach output keep working whichever plan you choose. Activating a new plan starts a fresh training block.
            </Text>
          )}
          {actionCards.map(card => {
            const featured = card.featured !== undefined ? card.featured : Boolean(card.badge);
            return (
              <Card
                key={card.id}
                style={[styles.actionCard, featured && [styles.actionCardFeatured, live.actionCardFeatured]]}
                onPress={() => navigation.navigate(card.screen)}
                accessibilityLabel={card.title}
              >
                <View style={[styles.actionCardIcon, live.actionCardIcon, featured && [styles.actionCardIconFeatured, live.actionCardIconFeatured]]}>
                  <Ionicons name={card.icon} size={24} color={t.colors.primary} />
                </View>
                <View style={styles.actionCardBody}>
                  <View style={styles.actionCardTitleRow}>
                    <Text style={[styles.actionCardTitle, live.actionCardTitle]}>{card.title}</Text>
                    {card.badge ? (
                      <View style={[styles.actionCardBadge, live.actionCardBadge]}>
                        <Text style={[styles.actionCardBadgeText, live.actionCardBadgeText]}>{card.badge}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={[styles.actionCardDesc, live.actionCardDesc]}>{card.description}</Text>
                </View>
                <Ionicons name="chevron-forward" size={iconSize.sm} color={featured ? t.colors.primary : t.colors.textMuted} />
              </Card>
            );
          })}
        </View>

        {/* Previous plans. Campaign 25 (PLANS-SCREEN-SPEC.md §2 item 4): the
            NEW collapsed section replacing the previously always-open
            Folders + "My plans" stacks. Collapsed by default on every mount
            (session-scoped, archivedExpanded's own precedent); renders
            nothing at all when there are no non-active plans (no empty
            shell -- §4 edge case). N = myPlans.length (filed + unfiled). */}
        {myPlans.length > 0 && (
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.archivedHeader}
              onPress={() => setPreviousExpanded(v => !v)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityState={{ expanded: previousExpanded }}
              accessibilityLabel={`Previous plans, ${myPlans.length}`}
            >
              <Text style={[styles.archivedHeaderText, live.archivedHeaderText]}>
                Previous plans · {myPlans.length}
              </Text>
              <Ionicons
                name={previousExpanded ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={t.colors.textSecondary}
              />
            </TouchableOpacity>
            {previousExpanded && (
              <>
                {/* Folders are only shown when they already exist. Folder
                    creation is intentionally hidden from the main Train
                    surface to keep the core coaching flow clean. Toggle,
                    options and a11y semantics, and the empty-folder copy,
                    are byte-identical to before this campaign; only each
                    folder's body content (compact rows, not renderPlanCard)
                    changed. */}
                {folders.length > 0 && folders.map(folder => {
                  const filed = plansByFolder[folder.id] || [];
                  const collapsed = !!collapsedFolders[folder.id];
                  return (
                    <View key={folder.id} style={[styles.folderBlock, live.folderBlock]}>
                      {/* AX-11 (launch accessibility audit): the folder-options
                          button used to be a TouchableOpacity nested inside this
                          header TouchableOpacity, so an accessible iOS parent
                          grouped it and it was never a separate VoiceOver focus
                          stop. folderHeader (row/gap/padding, unchanged) now
                          wraps a plain View instead of being touchable itself;
                          its two children -- folderHeaderPress (the toggle,
                          flex:1) and the options button -- are true siblings, and
                          folderHeaderPress's own row+gap reproduces the same
                          uniform gap:sm the five items used to share, so the
                          pixel layout is unchanged (verified in
                          PlansScreen.optionsButtonSiblings.guard.test.js). */}
                      <View style={styles.folderHeader}>
                        <TouchableOpacity
                          style={styles.folderHeaderPress}
                          onPress={() => toggleFolder(folder.id)}
                          onLongPress={() => handleFolderOptions(folder)}
                          accessibilityRole="button"
                          accessibilityState={{ expanded: !collapsed }}
                          accessibilityLabel={`${folder.name}, ${filed.length} plan${filed.length !== 1 ? 's' : ''}`}
                        >
                          <Ionicons
                            name={collapsed ? 'chevron-forward' : 'chevron-down'}
                            size={16}
                            color={t.colors.textSecondary}
                          />
                          <Ionicons name="folder-outline" size={16} color={t.colors.textSecondary} />
                          <Text style={[styles.folderName, live.folderName]} numberOfLines={1}>{folder.name}</Text>
                          <Text style={[styles.folderCount, live.folderCount]}>{filed.length}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.moreBtn}
                          onPress={() => handleFolderOptions(folder)}
                          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                          accessibilityRole="button"
                          accessibilityLabel={`${folder.name} folder options`}
                        >
                          <Ionicons name="ellipsis-vertical" size={18} color={t.colors.textSecondary} />
                        </TouchableOpacity>
                      </View>
                      {!collapsed && (
                        filed.length > 0
                          ? (
                            <View style={[styles.folderBody, live.folderBody]}>
                              {filed.map((plan, i) => (
                                <CompactPlanRow
                                  key={plan.id}
                                  plan={plan}
                                  meta={planWorkoutCounts[plan.id] ? `${planWorkoutCounts[plan.id]} workout${planWorkoutCounts[plan.id] !== 1 ? 's' : ''}` : null}
                                  onPress={() => navigation.navigate('PlanDetail', { planId: plan.id, isLibrary: false })}
                                  onLongPress={() => handlePlanOptions(plan)}
                                  onOptions={() => handlePlanOptions(plan)}
                                  onSetActive={() => handleSetActive(plan)}
                                  isLast={i === filed.length - 1}
                                />
                              ))}
                            </View>
                          )
                          : <Text style={[styles.folderEmpty, live.folderEmpty]}>No plans in here yet. Use a plan&apos;s options to move it in.</Text>
                      )}
                    </View>
                  );
                })}

                {/* Unfiled plans. Plans not in any folder, or whose folder was
                    deleted, always live here so a plan is never hidden (§4
                    deleted-folder fallthrough). No "My plans" sub-label --
                    the section header above already covers them. */}
                {unfiledPlans.length > 0 && (
                  <View style={[styles.compactListBody, live.compactListBody]}>
                    {unfiledPlans.map((plan, i) => (
                      <CompactPlanRow
                        key={plan.id}
                        plan={plan}
                        meta={planWorkoutCounts[plan.id] ? `${planWorkoutCounts[plan.id]} workout${planWorkoutCounts[plan.id] !== 1 ? 's' : ''}` : null}
                        onPress={() => navigation.navigate('PlanDetail', { planId: plan.id, isLibrary: false })}
                        onLongPress={() => handlePlanOptions(plan)}
                        onOptions={() => handlePlanOptions(plan)}
                        onSetActive={() => handleSetActive(plan)}
                        isLast={i === unfiledPlans.length - 1}
                      />
                    ))}
                  </View>
                )}
              </>
            )}
          </View>
        )}

        {/* Archived Plans. Campaign 25 (PLANS-SCREEN-SPEC.md §2 item 5, §5):
            kept as its own section (a deliberate "I am done with this" user
            act, distinct from Previous plans), same header idiom, same
            position (last), same collapsed-by-default behaviour. The
            duplicated full-card JSX is retired: expanded content is now the
            SAME compact row component the Previous section uses, with the
            archived name-style variant and no inline Set-active -- restoring
            activation stays inside handleArchivedPlanOptions's sheet exactly
            as before. */}
        {archivedPlans.length > 0 && (
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.archivedHeader}
              onPress={() => setArchivedExpanded(v => !v)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityState={{ expanded: archivedExpanded }}
              accessibilityLabel={`Archived plans, ${archivedPlans.length}`}
            >
              <Text style={[styles.archivedHeaderText, live.archivedHeaderText]}>
                Archived plans · {archivedPlans.length}
              </Text>
              <Ionicons
                name={archivedExpanded ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={t.colors.textSecondary}
              />
            </TouchableOpacity>
            {archivedExpanded && (
              <View style={[styles.compactListBody, live.compactListBody]}>
                {archivedPlans.map((plan, i) => (
                  <CompactPlanRow
                    key={plan.id}
                    plan={plan}
                    meta={planWorkoutCounts[plan.id] ? `${planWorkoutCounts[plan.id]} workout${planWorkoutCounts[plan.id] !== 1 ? 's' : ''}` : null}
                    onPress={() => navigation.navigate('PlanDetail', { planId: plan.id, isLibrary: false })}
                    onLongPress={() => handleArchivedPlanOptions(plan)}
                    onOptions={() => handleArchivedPlanOptions(plan)}
                    onSetActive={null}
                    archived
                    isLast={i === archivedPlans.length - 1}
                  />
                ))}
              </View>
            )}
          </View>
        )}

        {/* Workout Templates. Not part of the spec's five-section target
            architecture (spec silent on it); left in its existing relative
            position -- immediately after Archived, which it already
            followed -- since only the Training-blocks row and action cards
            that used to sit after it were named for relocation. */}
        {templates.length > 0 && (
          <View style={styles.section}>
            <SectionLabel>Saved workouts</SectionLabel>
            <Text style={[styles.sectionSubtitle, live.sectionSubtitle]}>Saved workouts you can start directly.</Text>
            {templates.map(routine => (
              <Card key={routine.id} style={styles.templateCard}>
                <View style={styles.templateMain}>
                  <Text style={[styles.templateName, live.templateName]} numberOfLines={2}>{routine.name}</Text>
                  {exerciseCounts[routine.id] ? (
                    <Text style={[styles.templateMeta, live.templateMeta]}>{exerciseCounts[routine.id]} exercises</Text>
                  ) : null}
                </View>
                <View style={styles.templateActions}>
                  {/* R9 (D70): startTemplateBtn -> shared Button secondary sm. */}
                  <Button
                    variant="secondary"
                    size="sm"
                    fullWidth={false}
                    icon="play"
                    title="Start"
                    onPress={() => handleStartTemplate(routine)}
                    accessibilityLabel={`Start ${routine.name}`}
                  />
                  <TouchableOpacity
                    style={styles.moreBtn}
                    onPress={() => handleTemplateOptions(routine)}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    accessibilityRole="button"
                    accessibilityLabel="Routine options"
                  >
                    <Ionicons name="ellipsis-vertical" size={18} color={t.colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              </Card>
            ))}
          </View>
        )}
          </>
        ) : null}

      </ScrollView>
      <PeekMenu ref={peekRef} />

      {/* D139: the first plan is previewed before it is built. The sheet
          shows the prospective week, what a block is, and what happens to
          the plans already on the device; the generator runs on confirm. */}
      <PlanPreviewSheet
        userId={user?.id ?? null}
        source="plans"
        visible={!!planPreview}
        preview={planPreview?.preview ?? null}
        currentPlanName={planPreview?.preview?.currentPlanName ?? null}
        otherPlansCount={planPreview?.otherPlansCount ?? 0}
        confirmLabel="Start this plan"
        onConfirm={handleConfirmStartWithPlan}
        onClose={() => { if (!startingPlan) setPlanPreview(null); }}
        busy={startingPlan}
      />

      {/* FB-24 (D96): the receipt for "Continue with adjustments". Every
          line is composed from the ledger the decision card already showed
          plus the seed ranges the write actually used, so it can only ever
          describe what happened. Retention is stated as a decision
          (FB-27) rather than left as an absence. */}
      <BottomSheet
        visible={!!seedReceipt}
        onClose={() => setSeedReceipt(null)}
        accessibilityLabel="What changed in your next block"
      >
        <Text style={[styles.receiptTitle, live.receiptTitle]}>Your next block is set</Text>
        {/* RA-2 (D96, Review A): "Here is what your last block changed"
            above zero changed rows was a false note. */}
        <Text style={[styles.receiptSub, live.receiptSub]}>
          {(seedReceipt?.changed?.length ?? 0) > 0
            ? 'Same workouts. Here is what your last block changed.'
            : 'Same workouts. No targets moved this time.'}
        </Text>
        {(seedReceipt?.changed ?? []).map((row) => (
          <View key={row.muscle} style={styles.receiptRow}>
            <Text style={[styles.receiptRowTitle, live.receiptRowTitle]}>
              {row.label}: {row.change}
            </Text>
            {row.rationale ? (
              <Text style={[styles.receiptRowBody, live.receiptRowBody]}>{row.rationale}</Text>
            ) : null}
          </View>
        ))}
        {seedReceipt?.moreChanged > 0 ? (
          <Text style={[styles.receiptRowBody, live.receiptRowBody]}>
            Plus {seedReceipt.moreChanged} more muscle group{seedReceipt.moreChanged === 1 ? '' : 's'} that moved.
          </Text>
        ) : null}
        {seedReceipt?.heldLine ? (
          <Text style={[styles.receiptRowBody, live.receiptRowBody]}>{seedReceipt.heldLine}</Text>
        ) : null}
        <Button
          variant="primary"
          title="Got it"
          onPress={() => setSeedReceipt(null)}
          accessibilityLabel="Got it"
          style={styles.receiptBtn}
        />
      </BottomSheet>

      {/* C16 phase C + D (completion pass): the NEXT-BLOCK REVIEW. The user
          sees what stays, what changes, why, the volume moves and any
          prescription change BEFORE anything is activated. Every line comes
          from the same dry run and the same resolved ledger the confirm
          will act on, so the activated plan matches what was shown. Nothing
          has happened at the point this is on screen. */}
      <BottomSheet
        visible={!!blockReview}
        onClose={() => {
          if (!restartingRef.current) return;
          setBlockReview(null);
          restartingRef.current = false;
        }}
        accessibilityLabel="Your next block"
        scroll
      >
        <Text style={[styles.receiptTitle, live.receiptTitle]}>Your next block</Text>
        {blockReview?.verdictCopy ? (
          <>
            <Text style={[styles.receiptRowTitle, live.receiptRowTitle]}>
              {blockReview.verdictCopy.title}
            </Text>
            <Text style={[styles.receiptSub, live.receiptSub]}>{blockReview.verdictCopy.body}</Text>
          </>
        ) : (
          <Text style={[styles.receiptSub, live.receiptSub]}>
            Here is what your next block would look like. Nothing changes until you confirm.
          </Text>
        )}

        {/* WHAT STAYS. A retained exercise is a decision that was made, so
            it is named with its reason rather than left as the remainder. */}
        {(blockReview?.receipt?.stays?.length ?? 0) > 0 ? (
          <View style={styles.receiptRow}>
            <Text style={[styles.receiptRowTitle, live.receiptRowTitle]}>What stays</Text>
            {blockReview.receipt.stays.slice(0, 6).map((l, i) => (
              <Text key={`rv-stay-${l.exerciseId ?? l.exerciseName}-${i}`} style={[styles.receiptRowBody, live.receiptRowBody]}>
                {l.exerciseName}{l.why ? ` - ${l.why}` : ''}
                {l.prescriptionCopy ? ` ${l.prescriptionCopy}` : ''}
              </Text>
            ))}
            {blockReview.receipt.stays.length > 6 ? (
              <Text style={[styles.receiptRowBody, live.receiptRowBody]}>
                Plus {blockReview.receipt.stays.length - 6} more staying as they are.
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* WHAT CHANGES, and why. */}
        {(blockReview?.receipt?.changes?.length ?? 0) > 0 ? (
          <View style={styles.receiptRow}>
            <Text style={[styles.receiptRowTitle, live.receiptRowTitle]}>What changes</Text>
            {blockReview.receipt.changes.map((l, i) => (
              <Text key={`rv-chg-${l.exerciseId ?? l.exerciseName}-${i}`} style={[styles.receiptRowBody, live.receiptRowBody]}>
                {l.previousExerciseName ? `${l.previousExerciseName} to ` : ''}{l.exerciseName}
                {l.why ? ` - ${l.why}` : ''}
              </Text>
            ))}
          </View>
        ) : null}

        {(blockReview?.receipt?.added?.length ?? 0) > 0 ? (
          <View style={styles.receiptRow}>
            <Text style={[styles.receiptRowTitle, live.receiptRowTitle]}>New in your plan</Text>
            {blockReview.receipt.added.map((l, i) => (
              <Text key={`rv-new-${l.exerciseId ?? l.exerciseName}-${i}`} style={[styles.receiptRowBody, live.receiptRowBody]}>
                {l.exerciseName}{l.why ? ` - ${l.why}` : ''}
              </Text>
            ))}
          </View>
        ) : null}

        {/* CC33 round 5 (R5-1): the receipt's completeness section, on
            THIS renderer too - round 4 added it to PlanUpdateScreen only,
            and the block-boundary sheet (the more travelled rebuild
            route) still dropped incumbents in silence. Keys are the
            exercise's ID (R5-3): names are not unique. */}
        {(blockReview?.receipt?.noLongerIn?.length ?? 0) > 0 ? (
          <View style={styles.receiptRow}>
            <Text style={[styles.receiptRowTitle, live.receiptRowTitle]}>No longer in your plan</Text>
            {blockReview.receipt.noLongerIn.map((l, i) => (
              <Text key={`rv-gone-${l.previousExerciseId ?? i}`} style={[styles.receiptRowBody, live.receiptRowBody]}>
                {l.exerciseName}{l.why ? ` - ${l.why}` : ''}
              </Text>
            ))}
          </View>
        ) : null}

        {/* VOLUME. The same numbers the activation seeds. */}
        {(blockReview?.volume?.changed?.length ?? 0) > 0 ? (
          <View style={styles.receiptRow}>
            <Text style={[styles.receiptRowTitle, live.receiptRowTitle]}>Your set targets</Text>
            {blockReview.volume.changed.map((row) => (
              <Text key={`rv-vol-${row.muscle}`} style={[styles.receiptRowBody, live.receiptRowBody]}>
                {row.label}: {row.change}
              </Text>
            ))}
            {blockReview.volume.heldLine ? (
              <Text style={[styles.receiptRowBody, live.receiptRowBody]}>{blockReview.volume.heldLine}</Text>
            ) : null}
          </View>
        ) : null}

        {blockReview
          && blockReview.exerciseChanges === 0
          && blockReview.prescriptionChanges === 0 ? (
          <Text style={[styles.receiptRowBody, live.receiptRowBody]}>
            Your workouts stay exactly as they are. Only your set targets move.
          </Text>
        ) : null}

        {blockReview
          && blockReview.exerciseChanges === 0
          && blockReview.prescriptionChanges > 0 ? (
            <Text style={[styles.receiptRowBody, live.receiptRowBody]}>
              Your exercises stay. The rep target changes shown above will be applied.
            </Text>
          ) : null}

        <Button
          variant="emphatic"
          title="Start next block"
          onPress={confirmNextBlockReview}
          accessibilityLabel="Start next block"
          style={styles.receiptBtn}
        />
        <Button
          variant="tertiary"
          title="Not yet"
          onPress={() => { setBlockReview(null); restartingRef.current = false; }}
          accessibilityLabel="Not yet"
        />
      </BottomSheet>

      {/* Folder name prompt, shared by create + rename. */}
      {/* R9 (D70): the folder create/rename prompt moves off its hand-rolled
          centred Modal (backdrop, panel, keyboard maths all bespoke) onto the
          shared BottomSheet, which owns scrim, chrome, keyboard avoidance and
          every dismiss path. The title now reflects the actual mode - the old
          dialog said "Rename folder" even when creating one. */}
      <BottomSheet
        visible={!!folderPrompt}
        // Close-review fix (R9): the clear must be UNCONDITIONAL. BottomSheet
        // adds a swipe-down gesture the old Modal never had; a swipe while a
        // save was in flight animated the panel closed but the savingFolder
        // guard kept `visible` true, so the next open produced no transition
        // and the sheet went dark. An in-flight save still completes in the
        // background (its own success path clears the prompt as a no-op; a
        // failure shows the error toast and the user reopens to retry).
        onClose={() => setFolderPrompt(null)}
        keyboardAvoiding
        accessibilityLabel="Folder name"
      >
        <Text style={[styles.folderSheetTitle, live.folderSheetTitle]}>
          {folderPrompt?.mode === 'rename' ? 'Rename folder' : 'New folder'}
        </Text>
        <TextField
          fieldStyle={styles.folderInputField}
          inputStyle={[styles.folderInput, live.folderInput]}
          value={folderName}
          onChangeText={setFolderName}
          placeholder="Folder name"
          placeholderTextColor={t.colors.textMuted}
          autoFocus
          maxLength={60}
          returnKeyType="done"
          onSubmitEditing={handleSaveFolder}
          accessibilityLabel="Folder name"
        />
        <View style={styles.folderSheetActions}>
          <Button
            title="Cancel"
            variant="secondary"
            size="sm"
            fullWidth={false}
            style={styles.folderSheetCancelButton}
            textStyle={[styles.folderSheetCancel, live.folderSheetCancel]}
            onPress={() => { if (!savingFolder) setFolderPrompt(null); }}
            disabled={savingFolder}
            accessibilityLabel="Cancel"
          />
          <Button
            title="Save"
            size="sm"
            fullWidth={false}
            style={styles.folderSheetSaveButton}
            textStyle={[styles.folderSheetSave, live.folderSheetSave]}
            onPress={handleSaveFolder}
            disabled={!folderName.trim() || savingFolder}
            loading={savingFolder}
            accessibilityLabel="Save folder name"
            accessibilityState={{ disabled: !folderName.trim() || savingFolder }}
          />
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  skeletonWrap: { gap: spacing.lg },
  section: { gap: spacing.md },
  sectionSubtitle: { ...type.caption, color: colors.textMuted, marginTop: -spacing.sm },

  // Folders (Hevy teardown R1)
  foldersHeaderRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  folderBlock: {
    borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: radius.lg,
    backgroundColor: colors.surface, overflow: 'hidden',
  },
  folderHeader: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
  },
  // AX-11: the toggle-pressable's own row, sibling to moreBtn inside
  // folderHeader. flex: 1 takes the same remaining width the whole row used
  // to give folderName, and its own gap: sm reproduces the uniform spacing
  // the five original children shared.
  folderHeaderPress: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1,
  },
  folderName: { flex: 1, ...type.bodyStrong, color: colors.textPrimary },
  folderCount: { ...type.num('caption'), color: colors.textMuted },
  // Campaign 25: folderBody now holds CompactPlanRow children directly (no
  // per-row Card, so no gap/padding of its own -- each row self-pads and
  // draws its own hairline divider); only the separator from the header
  // above survives from the pre-campaign style.
  folderBody: {
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  folderEmpty: {
    ...type.caption, color: colors.textMuted,
    paddingHorizontal: spacing.md, paddingBottom: spacing.md,
  },

  // Folder name prompt
  // R9 (D70): folderModalFill/backdrop/folderSheet deleted - the shared
  // BottomSheet owns scrim and panel chrome now.
  folderSheetTitle: { ...type.bodyStrong, color: colors.textPrimary },
  // FB-24 (D96): the next-block receipt sheet.
  receiptTitle: { ...type.h3, color: colors.textPrimary, marginBottom: spacing.xs },
  receiptSub: { ...type.bodySm, color: colors.textMuted, marginBottom: spacing.lg },
  receiptRow: { marginBottom: spacing.md, gap: spacing.xs },
  receiptRowTitle: { ...type.bodyStrong, color: colors.textPrimary },
  receiptRowBody: { ...type.bodySm, color: colors.textSecondary, marginBottom: spacing.sm },
  receiptBtn: { marginTop: spacing.md },
  folderInputField: { borderRadius: radius.md },
  folderInput: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: fontSize.md,
  },
  folderSheetActions: {
    flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: spacing.sm,
  },
  folderSheetCancelButton: { borderRadius: radius.md },
  folderSheetCancel: { ...type.label, color: colors.textSecondary },
  folderSheetSaveButton: { borderRadius: radius.md },
  folderSheetSave: { ...type.label },

  trainingBlocksRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
  },
  trainingBlocksIcon: {
    width: 40, height: 40, borderRadius: radius.md,
    backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  trainingBlocksLabel: { ...type.bodyStrong, color: colors.textPrimary },
  trainingBlocksSub: { ...type.caption, color: colors.textMuted, marginTop: spacing.xxs },
  proCoachNote: {
    fontSize: fontSize.xs, color: colors.textMuted, lineHeight: 18,
    borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm,
  },

  noActivePlanRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
  },
  noActivePlanText: { ...type.bodySm, flex: 1, color: colors.textMuted },

  activePlanCard: {
    borderColor: withAlpha(colors.primary, alpha.edge), gap: spacing.md,
  },
  activePlanHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  activeBadge: {
    backgroundColor: colors.primaryBg, borderRadius: radius.full,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs,
    borderWidth: 1, borderColor: withAlpha(colors.primary, alpha.strong),
  },
  activeBadgeText: { fontSize: fontSize.xs, color: colors.primary, fontFamily: fontFamily.heavy, fontWeight: fontWeight.black },
  activePlanName: { fontSize: fontSize.xl, fontFamily: fontFamily.bold, fontWeight: fontWeight.bold, color: colors.textPrimary },
  activePlanMeta: { fontSize: fontSize.sm, color: colors.textSecondary },
  activePlanWeek: { ...type.num('caption'), color: colors.textMuted },
  // D139: the block-position line plus its InfoTooltip, as true row
  // siblings (AX-11 law: never nest a touchable inside another).
  activePlanWeekRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  activePlanActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xs },
  // R9 (D70): startNextBtn/startNextBtnText/viewPlanBtn/viewPlanBtnText
  // deleted - converted to the shared Button primitive (primary/secondary).
  // startNextBtnWrap carries only the pure layout key (flex: 1) the old
  // startNextBtn used to fill the row; Button owns the rest of the chrome.
  startNextBtnWrap: { flex: 1 },

  archivedHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  archivedHeaderText: {
    ...type.label, color: colors.textSecondary,
  },
  moreBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },

  // Campaign 25 (PLANS-SCREEN-SPEC.md §2/§3): the compact plan row that
  // replaced renderPlanCard and the archived section's duplicated card JSX.
  // compactListBody is the standalone bordered section body (the folderBody
  // idiom, without a header above it) used by the unfiled list and the
  // archived list; folder bodies reuse the existing folderBlock/folderBody
  // pair instead, since they already carry a header.
  compactListBody: {
    borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: radius.lg,
    backgroundColor: colors.surface, overflow: 'hidden',
  },
  compactRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderSubtle,
  },
  // The last row in any section body drops its own divider so the body's
  // own bottom edge is the only line there.
  compactRowLast: { borderBottomWidth: 0 },
  compactRowPress: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
  },
  compactRowName: { ...type.bodyStrong, color: colors.textPrimary, flex: 1 },
  compactRowNameArchived: { color: colors.textSecondary },
  compactRowMeta: { ...type.num('caption'), color: colors.textSecondary },

  templateCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
  },
  templateMain: { flex: 1, gap: spacing.xs },
  templateName: { ...type.bodyStrong, color: colors.textPrimary },
  templateMeta: { ...type.num('caption'), color: colors.textSecondary },
  templateActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  // R9 (D70): startTemplateBtn/startTemplateBtnText deleted - converted to
  // the shared Button primitive (secondary sm).

  actionCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
  },
  actionCardIcon: {
    width: 48, height: 48, borderRadius: radius.md,
    backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  actionCardBody: { flex: 1 },
  actionCardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xxs },
  actionCardTitle: { ...type.bodyStrong, color: colors.textPrimary },
  actionCardBadge: {
    backgroundColor: colors.primaryBg, borderRadius: radius.full,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs,
    borderWidth: 1, borderColor: withAlpha(colors.primary, alpha.edge),
  },
  actionCardBadgeText: { fontSize: fontSize.micro, fontFamily: fontFamily.heavy, fontWeight: fontWeight.black, color: colors.primary },
  actionCardDesc: { ...type.captionTight, color: colors.textMuted },
  actionCardFeatured: {
    borderColor: withAlpha(colors.primary, alpha.edge),
    backgroundColor: colors.primaryBg,
  },
  actionCardIconFeatured: {
    backgroundColor: colors.surface,
    borderColor: withAlpha(colors.primary, alpha.edge),
  },
  // Block advisor card
  blockCard: {
    gap: spacing.md,
  },
  blockCardHeadsUp: {
    backgroundColor: colors.surface,
    borderColor: withAlpha(colors.warning, alpha.mid),
  },
  blockCardWarning: {
    backgroundColor: colors.surface,
    borderColor: withAlpha(colors.warning, alpha.strong),
  },
  blockCardRecovery: {
    backgroundColor: colors.surface,
    borderColor: withAlpha(colors.primary, alpha.mid),
  },
  blockCardComplete: {
    backgroundColor: colors.surface,
    borderColor: withAlpha(colors.success, alpha.mid),
  },
  blockCardHeader: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
  },
  blockCardIconWrap: {
    width: 36, height: 36, borderRadius: circle(36),
    backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  blockCardTitle: {
    flex: 1, ...type.bodyStrong, color: colors.textPrimary,
  },
  blockCardBody: {
    ...type.bodySm, color: colors.textSecondary,
  },

  // C16 phase C: block-boundary review surfaces.
  blockReviewHeadsUp: {
    ...type.bodySm, color: colors.textSecondary, marginTop: spacing.sm,
  },
  programmeVerdict: {
    marginTop: spacing.md, paddingTop: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.border, gap: spacing.xxs,
  },
  programmeVerdictTitle: { ...type.w('bodySm', 'semibold'), color: colors.textPrimary },
  programmeVerdictBody: { ...type.bodySm, color: colors.textSecondary },

  // Signal chips
  signalRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs,
  },
  signalChip: {
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
    backgroundColor: colors.surface2, borderRadius: radius.full,
    borderWidth: 1, borderColor: withAlpha(colors.warning, alpha.mid),
  },
  signalChipHigh: {
    borderColor: withAlpha(colors.error, alpha.strong),
    backgroundColor: withAlpha(colors.error, alpha.ghost),
  },
  signalChipText: {
    fontSize: fontSize.xs, color: colors.warning, fontFamily: fontFamily.medium, fontWeight: fontWeight.medium,
  },
  signalChipTextHigh: {
    color: colors.error,
  },

  // Next block section
  nextBlockSection: {
    borderTopWidth: 1, borderTopColor: colors.borderSubtle,
    paddingTop: spacing.md, gap: spacing.sm,
  },
  nextBlockPreLabel: {
    fontSize: fontSize.xs, fontFamily: fontFamily.semibold, fontWeight: fontWeight.semibold,
    color: colors.textMuted,
  },
  nextBlockHeadline: {
    ...type.bodyStrong, color: colors.textPrimary,
  },
  nextBlockBody: {
    ...type.bodySm, color: colors.textSecondary,
  },
  // Stage 8: the block-end ledger story under the decision body.
  ledgerStory: { marginTop: spacing.sm, gap: spacing.xs },
  ledgerStoryLabel: {
    fontSize: fontSize.xs, fontFamily: fontFamily.semibold, fontWeight: fontWeight.semibold, color: colors.textMuted,
  },
  ledgerStoryLine: { ...type.bodySm, color: colors.textSecondary },

  // FQ-2 (D96): the two next-block options, stacked so each carries its own
  // one-line description (and, where it applies, its Pro mark or the
  // advisor's "Suggested" flag) instead of two bare side-by-side buttons.
  blockDecision: { marginTop: spacing.xs, gap: spacing.md },
  blockOption: { gap: spacing.xs },
  blockOptionTags: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  blockOptionFlag: {
    fontSize: fontSize.xs, fontFamily: fontFamily.semibold, fontWeight: fontWeight.semibold, color: colors.primary,
  },
  blockOptionDetail: { ...type.caption, color: colors.textSecondary },

  // Block card action buttons
  blockCardActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.xs },
  // R9 (D70): blockRestartBtn/blockRestartBtnText/blockNewBtn/blockNewBtnText
  // deleted - converted to the shared Button primitive (primary/secondary).
  // blockCtaButton carries only the pure layout keys the two old styles
  // shared (flex: 1, minWidth: 144); Button owns the rest of the chrome.
  blockCtaButton: { flex: 1, minWidth: 144 },
  blockSnooze: { alignItems: 'center', paddingTop: spacing.xs },
  blockSnoozeText: { ...type.caption, color: colors.textMuted },
});

// CP-10 batch G (2026-07-11): the frozen `styles` block above stays byte-
// identical. This mirrors ONLY the colour/fontSize/type-bearing sub-
// properties of the matching frozen style, at identical rest values, so the
// screen carries no static island under a live theme toggle. Pure layout
// keys (flex/gap/padding/width/borderWidth, no token) are correctly omitted
// -- there is nothing to unfreeze for them. Same pattern as
// WorkoutSummaryScreen.js's buildLiveStyles.
function buildLiveStyles(t) {
  return {
    safe: { backgroundColor: t.colors.background },
    sectionSubtitle: { ...t.type.caption, color: t.colors.textMuted },
    folderBlock: { borderColor: t.colors.borderSubtle, backgroundColor: t.colors.surface },
    folderName: { ...t.type.bodyStrong, color: t.colors.textPrimary },
    folderCount: { ...t.type.num('caption'), color: t.colors.textMuted },
    folderBody: { borderTopColor: t.colors.border },
    folderEmpty: { ...t.type.caption, color: t.colors.textMuted },
    folderSheetTitle: { ...t.type.bodyStrong, color: t.colors.textPrimary },
    receiptTitle: { ...t.type.h3, color: t.colors.textPrimary },
    receiptSub: { ...t.type.bodySm, color: t.colors.textMuted },
    receiptRowTitle: { ...t.type.bodyStrong, color: t.colors.textPrimary },
    receiptRowBody: { ...t.type.bodySm, color: t.colors.textSecondary },
    folderInput: { fontSize: t.fontSize.md },
    folderSheetCancel: { ...t.type.label, color: t.colors.textSecondary },
    folderSheetSave: { ...t.type.label },
    trainingBlocksIcon: { backgroundColor: t.colors.surface2, borderColor: t.colors.border },
    trainingBlocksLabel: { ...t.type.bodyStrong, color: t.colors.textPrimary },
    trainingBlocksSub: { ...t.type.caption, color: t.colors.textMuted },
    proCoachNote: { fontSize: t.fontSize.xs, color: t.colors.textMuted, borderTopColor: t.colors.border },
    noActivePlanText: { ...t.type.bodySm, color: t.colors.textMuted },
    activePlanCard: { borderColor: withAlpha(t.colors.primary, alpha.edge) },
    activeBadge: { backgroundColor: t.colors.primaryBg, borderColor: withAlpha(t.colors.primary, alpha.strong) },
    activeBadgeText: { fontSize: t.fontSize.xs, color: t.colors.primary },
    activePlanName: { fontSize: t.fontSize.xl, color: t.colors.textPrimary },
    activePlanMeta: { fontSize: t.fontSize.sm, color: t.colors.textSecondary },
    activePlanWeek: { ...t.type.num('caption'), color: t.colors.textMuted },
    // R9 (D70): startNextBtn/startNextBtnText/viewPlanBtn/viewPlanBtnText/
    // planCardFooterGhost/planCardFooterPrimary/startTemplateBtn/
    // startTemplateBtnText live twins deleted alongside their frozen styles -
    // the shared Button primitive resolves its own live theme internally.
    archivedHeaderText: { ...t.type.label, color: t.colors.textSecondary },
    // Campaign 25: renderPlanCard's live twins (planCardName/planCardMeta/
    // planCardFooter/archivedPlanCardName) are retired alongside their
    // frozen styles. CompactPlanRow calls this SAME buildLiveStyles(t) from
    // its own useTheme() (sibling scope, matching NavRow's precedent), so
    // its tokens live here once and both callers (this screen and the row
    // component) read the identical entries.
    compactListBody: { borderColor: t.colors.borderSubtle, backgroundColor: t.colors.surface },
    compactRow: { borderBottomColor: t.colors.borderSubtle },
    compactRowName: { ...t.type.bodyStrong, color: t.colors.textPrimary },
    compactRowNameArchived: { color: t.colors.textSecondary },
    compactRowMeta: { ...t.type.num('caption'), color: t.colors.textSecondary },
    templateName: { ...t.type.bodyStrong, color: t.colors.textPrimary },
    templateMeta: { ...t.type.num('caption'), color: t.colors.textSecondary },
    actionCardIcon: { backgroundColor: t.colors.surface2, borderColor: t.colors.border },
    actionCardTitle: { ...t.type.bodyStrong, color: t.colors.textPrimary },
    actionCardBadge: { backgroundColor: t.colors.primaryBg, borderColor: withAlpha(t.colors.primary, alpha.edge) },
    actionCardBadgeText: { fontSize: t.fontSize.micro, color: t.colors.primary },
    actionCardDesc: { ...t.type.captionTight, color: t.colors.textMuted },
    actionCardFeatured: { borderColor: withAlpha(t.colors.primary, alpha.edge), backgroundColor: t.colors.primaryBg },
    actionCardIconFeatured: { backgroundColor: t.colors.surface, borderColor: withAlpha(t.colors.primary, alpha.edge) },
    blockCardHeadsUp: { backgroundColor: t.colors.surface, borderColor: withAlpha(t.colors.warning, alpha.mid) },
    blockCardWarning: { backgroundColor: t.colors.surface, borderColor: withAlpha(t.colors.warning, alpha.strong) },
    blockCardRecovery: { backgroundColor: t.colors.surface, borderColor: withAlpha(t.colors.primary, alpha.mid) },
    blockCardComplete: { backgroundColor: t.colors.surface, borderColor: withAlpha(t.colors.success, alpha.mid) },
    blockCardIconWrap: { backgroundColor: t.colors.surface2 },
    blockCardTitle: { ...t.type.bodyStrong, color: t.colors.textPrimary },
    blockCardBody: { ...t.type.bodySm, color: t.colors.textSecondary },
    blockReviewHeadsUp: { ...t.type.bodySm, color: t.colors.textSecondary },
    programmeVerdict: { borderTopColor: t.colors.border },
    programmeVerdictTitle: { ...t.type.w('bodySm', 'semibold'), color: t.colors.textPrimary },
    programmeVerdictBody: { ...t.type.bodySm, color: t.colors.textSecondary },
    signalChip: { backgroundColor: t.colors.surface2, borderColor: withAlpha(t.colors.warning, alpha.mid) },
    signalChipHigh: { borderColor: withAlpha(t.colors.error, alpha.strong), backgroundColor: withAlpha(t.colors.error, alpha.ghost) },
    signalChipText: { fontSize: t.fontSize.xs, color: t.colors.warning },
    signalChipTextHigh: { color: t.colors.error },
    nextBlockSection: { borderTopColor: t.colors.borderSubtle },
    nextBlockPreLabel: { fontSize: t.fontSize.xs, color: t.colors.textMuted },
    nextBlockHeadline: { ...t.type.bodyStrong, color: t.colors.textPrimary },
    nextBlockBody: { ...t.type.bodySm, color: t.colors.textSecondary },
    ledgerStoryLabel: { fontSize: t.fontSize.xs, color: t.colors.textMuted },
    // FQ-2 (D96): the two next-block options' flag and description lines.
    blockOptionFlag: { fontSize: t.fontSize.xs, color: t.colors.primary },
    blockOptionDetail: { ...t.type.caption, color: t.colors.textSecondary },
    // R9 (D70): blockRestartBtn/blockRestartBtnText/blockNewBtn/
    // blockNewBtnText live twins deleted alongside their frozen styles - the
    // shared Button primitive resolves its own live theme internally.
    blockSnoozeText: { ...t.type.caption, color: t.colors.textMuted },
  };
}
