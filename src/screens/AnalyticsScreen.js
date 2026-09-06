import { useRef, useEffect, useState, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useToast } from '../components/Toast';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useScrollToTop } from '@react-navigation/native';
import { format } from 'date-fns/format';
import { safeDate, safeFormatDate } from '../lib/safeFormat';

import { colors, fontSize, fontWeight, spacing, radius, buildVolumeStatusColor, type, circle, iconSize, withAlpha, alpha, fontFamily } from '../styles/theme';
import useTheme from '../hooks/useTheme';
import * as haptics from '../lib/haptics';
import Button from '../components/Button';
import Card from '../components/Card';
import SectionLabel from '../components/SectionLabel';
import ScreenHeader from '../components/ScreenHeader';
import { SkeletonCard } from '../components/Skeleton';
import AnimatedEntrance from '../components/AnimatedEntrance';
import EmptyState from '../components/EmptyState';
import InfoTooltip from '../components/InfoTooltip';
import useAppStore from '../store/useAppStore';
import useProgressData from '../hooks/useProgressData';
import useWeightTrend from '../hooks/useWeightTrend';
import useVisualPillar from '../hooks/useVisualPillar';
import { formatNumber } from '../lib/format';
import { formatBodyWeight, formatBodyWeightRate } from '../lib/units';
import { VOLUME_LANDMARKS, getVolumeStatus, calculateTonnage, buildLoadSemanticsById } from '../lib/algorithms';
import { getEffectiveLandmarks } from '../lib/effectiveLandmarks';
import { localWeekStartMs } from '../lib/dayKey';
import { computeTrainingPillarSummary, buildVisualPillarCopy } from '../lib/progress/pillars';

const DAY_MS = 24 * 60 * 60 * 1000;

// COMP-005: which monthly recap the Recaps tile / ephemeral card opens. The last
// completed calendar month when the user was training before this month began;
// otherwise the current month-to-date (so a just-unlocked user in their first
// month sees "June so far" rather than an empty last month). Local time, like
// the app's week rule. Returns RecapStory route params.
function recentMonthRecapParams(earliestWorkoutAt) {
  const now = new Date();
  const curMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
  const startOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
  if (earliestWorkoutAt != null && earliestWorkoutAt < curMonthStart) {
    return {
      variant: 'month',
      startMs: prevMonthStart,
      endMs: curMonthStart,
      monthLabel: format(new Date(prevMonthStart), 'MMMM'),
    };
  }
  return {
    variant: 'month',
    startMs: curMonthStart,
    endMs: startOfTomorrow,
    monthLabel: `${format(new Date(curMonthStart), 'MMMM')} so far`,
  };
}

// Campaign 23 (§8/§21/§22 R2): the Training pillar's copy, built from
// computeTrainingPillarSummary's pure counts (lib/progress/pillars.js) --
// no imperative training advice, only factual evidence statements and (for
// the zero-history state) the single honest next action §23's state F/L
// sanctions.
function trainingPillarCopy({ completedWorkoutCount, summary, lastSessionAt, unitsLabel, now = Date.now() }) {
  if (completedWorkoutCount === 0) {
    return { state: 'No sessions logged yet', evidence: 'Log your first session to start your training evidence.' };
  }
  if (summary.trainedCount === 0) {
    const days = Number.isFinite(lastSessionAt) ? Math.max(0, Math.floor((now - lastSessionAt) / DAY_MS)) : null;
    return {
      state: days != null ? `No sessions in the last ${days} day${days === 1 ? '' : 's'}` : 'No sessions this month',
      evidence: null,
    };
  }
  const state = summary.improvedCount > 0
    ? `Strength up on ${summary.improvedCount} of ${summary.trainedCount} lift${summary.trainedCount === 1 ? '' : 's'} this month`
    : 'No new bests this month, holding steady';
  const best = summary.namedBests[0];
  const evidence = best
    ? `${best.exerciseName} ${formatNumber(Math.round(best.weight))} ${unitsLabel} x ${best.reps}, new best`
    : 'Keep training to build your evidence trail.';
  return { state, evidence };
}

// Campaign 23 (§15/§22 R2): the Body pillar's copy is the SAME weightTrend
// view-model WeightTrendCard already renders (useWeightTrend/deriveWeightTrend)
// -- no new derivation, only a compact two-line read of fields that already
// exist. The full chart/maintenance detail stays one tap away in BodyMetrics
// (WeightTrendCard renders there unchanged).
function bodyPillarCopy(weightTrend, bodyWeightUnits) {
  if (!weightTrend?.render) {
    return { state: 'No weigh-ins logged yet', evidence: 'Log a morning weight to start your trend.' };
  }
  const parts = [];
  if (weightTrend.state >= 2 && weightTrend.ewmaNow != null) {
    parts.push(formatBodyWeight(weightTrend.ewmaNow, bodyWeightUnits));
    if (weightTrend.showRate && Number.isFinite(weightTrend.weeklyChange)) {
      // Lead fix (Stage 3 review, state O): the rate follows the user's
      // display units (§15 single-system rule) — never a kg rate beside an
      // lbs/stone weight on the same evidence row.
      parts.push(formatBodyWeightRate(weightTrend.weeklyChange, bodyWeightUnits));
    }
  }
  return { state: weightTrend.insight, evidence: parts.length ? parts.join(', ') : null };
}

export default function AnalyticsScreen({ navigation, route }) {
  const toast = useToast();
  const user = useAppStore(s => s.user);
  const tier = useAppStore(s => s.tier);
  const bodyWeightUnits = useAppStore(s => s.bodyWeightUnits);
  const units = useAppStore(s => s.units);
  // CP-10 batch G (2026-07-11): live theme (src/hooks/useTheme.js). Memoised
  // because this screen renders a recent-sessions list.
  const t = useTheme();
  const live = useMemo(() => buildLiveStyles(t), [t]);

  // COMP-004 "Body pillar". FOUNDER DECISION (fully free, no tier split):
  // morning weighing runs for every account now, so the Pro-only ternary
  // that withheld the userId is retired.
  const weightTrend = useWeightTrend(user?.id);
  // Campaign 23 R1 (§16/§22 R2): the Visual pillar's derived signal. Fails
  // closed under calm mode/open ED flag regardless of tier (usePhotoSuppression
  // inside the hook); only fetches scan data for a Pro user once suppression
  // is confirmed lifted.
  const visualPillar = useVisualPillar(user?.id, tier);

  // Founder device order 2026-08-17: the lifetime-tonnage landmark Moment
  // (the last survivor of the COMP-018 landmark family) is retired - it sat
  // between Recent sessions and More stats serving no decision, off the
  // screen's style. The R5 Moment slot is recap-only now; the share surface
  // for training wins lives on Recaps and LiftProgress. tonnageMilestone.js
  // remains in the tree, production-unreferenced.
  // D90 #3 (2026-08-06): the resolved landmark table for the volume strip
  // (manual > adapted(Pro) > research), loaded on focus below.
  const [landmarkResolution, setLandmarkResolution] = useState(null);
  useEffect(() => {
    let cancelled = false;
    if (!user?.id) { setLandmarkResolution(null); return undefined; }
    getEffectiveLandmarks(user.id, { tier })
      .then((r) => { if (!cancelled) setLandmarkResolution(r); })
      .catch(() => { if (!cancelled) setLandmarkResolution(null); });
    return () => { cancelled = true; };
  }, [user?.id, tier]);

  const scrollRef = useRef(null);
  useScrollToTop(scrollRef);

  useEffect(() => {
    return navigation.getParent()?.addListener('tabPress', () => {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    });
  }, [navigation]);

  // COMP-004 door: arriving from the Home TodayStrip weight cell scrolls the
  // Body pillar row into view (once the Answer Block has rendered), then
  // clears the param so a normal re-focus does not re-scroll. Programmatic
  // navigation does not fire 'tabPress', so this never fights the
  // scroll-to-top above.
  const trendSectionY = useRef(0);
  useEffect(() => {
    if (!route?.params?.focusWeightTrend) return undefined;
    const timer = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: Math.max(0, trendSectionY.current - 12), animated: true });
    }, 350);
    navigation.setParams({ focusWeightTrend: undefined });
    return () => clearTimeout(timer);
  }, [route?.params?.focusWeightTrend, navigation]);

  const {
    loading, refreshing, loadError,
    weeklyVolume,
    recentSessions, allSets, exerciseMap, earliestWorkoutAt, completedWorkoutCount,
    hasData,
    handleRefresh,
  } = useProgressData();

  // Campaign 23 (§8/§21/§22 R2): the Training pillar's numeric summary
  // (trailing-month strength-direction count + named bests, per-exercise-
  // per-day deduplicated, IA-3). Derived from the already-loaded data, no
  // new query.
  const trainingSummary = useMemo(
    () => computeTrainingPillarSummary(allSets, exerciseMap, { windowDays: 30 }),
    [allSets, exerciseMap],
  );
  const lastSessionAt = useMemo(
    () => allSets.reduce((m, s) => Math.max(m, s.createdAt ?? s.created_at ?? 0), 0) || null,
    [allSets],
  );
  const unitsLabel = units === 'lbs' ? 'lbs' : 'kg';
  const trainingCopy = useMemo(
    () => trainingPillarCopy({ completedWorkoutCount, summary: trainingSummary, lastSessionAt, unitsLabel }),
    [completedWorkoutCount, trainingSummary, lastSessionAt, unitsLabel],
  );
  const bodyCopy = useMemo(() => bodyPillarCopy(weightTrend, bodyWeightUnits || 'st'), [weightTrend, bodyWeightUnits]);
  const visualCopy = useMemo(() => buildVisualPillarCopy({
    hasScan: visualPillar.hasScan,
    hasNote: visualPillar.hasNote,
    packet: visualPillar.packet,
    capturedAt: visualPillar.capturedAt,
  }), [visualPillar.hasScan, visualPillar.hasNote, visualPillar.packet, visualPillar.capturedAt]);

  // R3's quiet adherence context line ("3 sessions this week"), Monday-
  // anchored -- the SAME week boundary the volume strip below already uses,
  // so the landing carries one definition of "this week" (§6/§28 IA-2).
  const sessionsThisWeek = useMemo(() => {
    const weekStart = localWeekStartMs(Date.now());
    const ids = new Set();
    for (const s of allSets) {
      const at = s.createdAt ?? s.created_at ?? 0;
      if (at >= weekStart) ids.add(s.workoutId ?? s.workout_id);
    }
    return ids.size;
  }, [allSets]);

  // R4's visibility condition: something logged in the current Monday-
  // anchored week (§22: "cond: ... any sets this Monday-anchored week").
  const hasVolumeThisWeek = useMemo(
    () => Object.values(weeklyVolume).some(m => (m?.workingSets ?? 0) > 0),
    [weeklyVolume],
  );

  // COMP-005: ephemeral recap card, for the first 7 days of the month, once
  // the user has unlocked recaps. R5 (§22): at most one Moment at a time,
  // recap outranks the tonnage milestone.
  const [recapCardHidden, setRecapCardHidden] = useState(true);
  const recapMonthKey = format(new Date(), 'yyyy-MM');
  useEffect(() => {
    if (new Date().getDate() > 7 || completedWorkoutCount < 10) { setRecapCardHidden(true); return; }
    AsyncStorage.getItem(`@volyume_recap_card_${recapMonthKey}`)
      .then(v => setRecapCardHidden(v === 'dismissed'))
      .catch(() => setRecapCardHidden(false));
  }, [completedWorkoutCount, recapMonthKey]);
  const dismissRecapCard = () => {
    setRecapCardHidden(true);
    AsyncStorage.setItem(`@volyume_recap_card_${recapMonthKey}`, 'dismissed').catch(() => {});
  };

  return (
    <SafeAreaView style={[styles.safe, live.safe]} edges={['top']}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={t.colors.primary}
          />
        }
      >
        {/* ── Header (R1) ───────────────────────────────────── */}
        <ScreenHeader title="Progress" />

        {/* ── The Answer Block (R2, always): "am I actually making
            progress?" in one glance -- three compact pillar rows inside one
            container, never three hero cards (§26). No share CTA, no
            imperative copy, evidence statements only (§14). ── */}
        {loading ? (
          <SkeletonCard height={168} />
        ) : (
          <AnimatedEntrance>
            {/* D3 (design audit 03): the hero is the screen's ONLY elevated
                object, so surfaceElevated ranks it above every flat surface
                card in the stack. The Answer Block is what the Progress tab
                is FOR -- it says where training, body and photos stand -- but
                it rendered on plain `surface`, pixel-identical to each
                session card listed beneath it, so the screen's answer had no
                more weight than one row of its evidence. Its two internal
                dividers deliberately stay on `border`: on the raised surface
                borderSubtle falls to 1.17:1 and the three pillars would run
                together. */}
            <Card padding="none" surface="surfaceElevated" style={styles.answerBlock}>
              <PillarRow
                icon="barbell-outline"
                label="Training"
                stateText={trainingCopy.state}
                evidenceText={trainingCopy.evidence}
                onPress={() => navigation.navigate('LiftProgress')}
              />
              <View style={[styles.answerDivider, live.answerDivider]} />
              <View onLayout={(e) => { trendSectionY.current = e.nativeEvent.layout.y; }}>
                <PillarRow
                  icon="body-outline"
                  label="Body"
                  stateText={bodyCopy.state}
                  evidenceText={bodyCopy.evidence}
                  onPress={() => navigation.navigate('BodyMetrics')}
                />
              </View>
              {!visualPillar.suppressed && (
                <>
                  <View style={[styles.answerDivider, live.answerDivider]} />
                  {/* Founder device order 2026-08-17: the row is named after
                      the feature it reads from and opens - "Visual" was
                      internal architecture vocabulary users cannot decode. */}
                  <PillarRow
                    icon="camera-outline"
                    label="Progress photos"
                    stateText={!visualPillar.loading ? visualCopy.state : null}
                    evidenceText={!visualPillar.loading ? visualCopy.evidence : null}
                    onPress={() => navigation.navigate('ProgressPhotos')}
                  />
                </>
              )}
            </Card>
          </AnimatedEntrance>
        )}

        {/* EP-09/P-06 (Codex end-user-polish audit): a load that FAILED must
            never read as "no training trends yet" -- that used to happen
            because useProgressData's loadError was ignored here entirely.
            Shown ahead of the real empty state and gated on it (loadError can
            stay true briefly after data existed from a prior successful
            load; hasData / allSets still reflect whatever was last
            committed, so this only replaces the messaging when there is
            nothing to fall back on). */}
        {!loading && loadError && allSets.length === 0 && (
          <EmptyState
            icon="cloud-offline-outline"
            title="Couldn't load your training trends"
            text="Check your connection and try again. Your data is safe on this device."
            actionLabel="Retry"
            onAction={handleRefresh}
            actionAccessibilityLabel="Retry loading training trends"
          />
        )}

        {/* ── Empty state (U-D-4: encouragement-framed, matching BodyMetrics) ──
            C5-P35-01 (D96): the second sentence named three destinations
            (body metrics, progress photos, scans) that were Pro-locked for a
            free user with no history - the read-only guards probe a history
            they do not have, so each tap lands on the hard gate.
            FOUNDER DECISION (fully free, no tier split): every destination
            is now genuinely open to every account, so there is one sentence,
            not a tier fork. */}
        {!loading && !loadError && allSets.length === 0 && (
          <EmptyState
            icon="analytics-outline"
            title="No training trends yet"
            text="Training charts appear here once sessions are logged. Body metrics, progress photos and scans are still available below."
          />
        )}

        {/* ── Evidence trail (R3, cond: any sessions exist) ──────── */}
        {recentSessions.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.adherenceLine, live.adherenceLine]}>
              {sessionsThisWeek} session{sessionsThisWeek === 1 ? '' : 's'} this week
            </Text>
            <View style={styles.rowBetween}>
              <SectionLabel>Recent sessions</SectionLabel>
              {/* R9 (D70): seeAllButton -> shared Button outline sm. */}
              <Button
                variant="outline"
                size="sm"
                fullWidth={false}
                icon="list-outline"
                title="All sessions"
                onPress={() => navigation.navigate('WorkoutHistory')}
                accessibilityLabel="See all sessions"
              />
            </View>
            {recentSessions.map(w => {
              // L04-1 (design audit 2026-07-09): these cards used to render
              // with no onPress while sharing the same tappable-looking Card
              // styling as every other navigating card on this screen. Wire
              // them to WorkoutSummary (read-only), computing the same stats
              // WorkoutHistoryScreen derives from allSets/exerciseMap so the
              // summary isn't just zeros.
              const mySets = allSets.filter(s => s.workoutId === w.id);
              const workingSets = mySets.filter(s => s.setType !== 'warmup');
              const exerciseIds = [...new Set(mySets.map(s => s.exerciseId))];
              const exerciseNames = exerciseIds.slice(0, 4)
                .map(id => exerciseMap[id]?.name)
                .filter(Boolean);
              return (
                <SessionCard
                  key={w.id}
                  workout={w}
                  onPress={() => navigation.navigate('WorkoutSummary', {
                    workoutId: w.id,
                    durationMinutes: w.durationMinutes,
                    exerciseCount: exerciseIds.length,
                    setCount: mySets.length,
                    workingSetCount: workingSets.length,
                    // D107-2: per-hand sets count x2, assistance is excluded.
                    tonnage: calculateTonnage(mySets, null, buildLoadSemanticsById(Object.values(exerciseMap))),
                    exerciseNames,
                    startedAt: w.startedAt,
                    endedAt: w.endedAt,
                    // Founder device report 2026-08-24: without the routine
                    // the summary has nothing to title the session with and
                    // its share card falls back to a join of the first two
                    // exercise names, which then moves whenever an exercise
                    // is swapped. getAllWorkouts joins the routine, so both
                    // are already on the row.
                    routineId: w.routineId ?? null,
                    routineName: w.routineName ?? null,
                    readOnly: true,
                  })}
                />
              );
            })}
          </View>
        )}

        {/* ── Plan evidence (R4, cond: any sets logged this Monday-anchored
            week) -- the volume-vs-targets strip exactly as built. ── */}
        {hasData && hasVolumeThisWeek && (
        <View style={styles.section}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
            <SectionLabel>This week's volume</SectionLabel>
            <InfoTooltip text={
              'Working sets per muscle this week, measured against your targets.\n\n' +
              'Tap to see every muscle on the heatmap.'
            } />
          </View>
          <VolumeSummaryStrip
            volume={weeklyVolume}
            landmarksTable={landmarkResolution?.table}
            loading={loading}
            onPress={() => navigation.navigate('VolumeHeatmap')}
          />
        </View>
        )}

        {/* ── Moments (R5, cond). Recap-only since the founder device
            order of 2026-08-17 retired the tonnage-milestone row; the
            recap card remains transient and dismissible. ── */}
        {!recapCardHidden ? (
          <TouchableOpacity
            style={[styles.recapCard, live.recapCard]}
            activeOpacity={0.85}
            onPress={() => { dismissRecapCard(); navigation.navigate('RecapStory', recentMonthRecapParams(earliestWorkoutAt)); }}
            accessibilityRole="button"
            accessibilityLabel="Open your monthly recap, about 45 seconds"
          >
            <Ionicons name="newspaper-outline" size={18} color={t.colors.primary} />
            <Text style={[styles.recapCardText, live.recapCardText]}>
              Your {recentMonthRecapParams(earliestWorkoutAt).monthLabel.replace(' so far', '')} recap is ready - 45 seconds
            </Text>
            <TouchableOpacity
              onPress={dismissRecapCard}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Dismiss"
            >
              <Ionicons name="close" size={16} color={t.colors.textMuted} />
            </TouchableOpacity>
          </TouchableOpacity>
        ) : null}

        {/* ── Utilities (R6, always) ──────────────────────────── */}
        <View style={styles.section}>
          <SectionLabel>More stats</SectionLabel>
          <View style={styles.navGrid}>
            {/* Body Metrics and Lifts are removed here: the Answer Block's
                pillar rows above already cover the same destinations
                (Body -> BodyMetrics, Training -> LiftProgress), so keeping
                them in the grid too meant the Progress tab listed the same
                two screens twice. */}
            <NavTile icon="pulse" color={t.colors.success} label="Consistency" onPress={() => navigation.navigate('Consistency')} />
            <NavTile icon="time" color={t.colors.textSecondary} label="Full history" onPress={() => navigation.navigate('WorkoutHistory')} />
            {(() => {
              // COMP-005: Recaps replaces the year-long locked Year-of-Lifts
              // tile. It unlocks after 10 logged sessions (~a fortnight, not a
              // year) and opens the most recent monthly recap. Year of Lifts
              // stays the annual crown but only appears once it has unlocked,
              // so it is never shown dimmed for a year.
              const RECAP_GATE = 10;
              const recapUnlocked = completedWorkoutCount >= RECAP_GATE;
              const toGo = Math.max(0, RECAP_GATE - completedWorkoutCount);
              return (
                <NavTile
                  icon="newspaper-outline"
                  color={t.colors.textSecondary}
                  label="Recaps"
                  locked={!recapUnlocked}
                  lockedSub={`${toGo} session${toGo === 1 ? '' : 's'} to go`}
                  onPress={() => {
                    if (!recapUnlocked) {
                      // R9 (D70): a blocking alert for purely informational
                      // copy diverged from the house rule (toast for
                      // non-destructive feedback; alerts for destructive
                      // confirms only).
                      toast.show(`Your first monthly recap is ready after ${RECAP_GATE} logged sessions. ${toGo} to go.`, { variant: 'info' });
                      return;
                    }
                    navigation.navigate('RecapStory', recentMonthRecapParams(earliestWorkoutAt));
                  }}
                />
              );
            })()}
            {(() => {
              // Year of Lifts: the annual crown, shown only once unlocked.
              const YEAR_MS = 365 * 86400000;
              const unlocked = earliestWorkoutAt && (Date.now() - earliestWorkoutAt) >= YEAR_MS;
              if (!unlocked) return null;
              return (
                <NavTile
                  icon="calendar-outline"
                  color={t.colors.textSecondary}
                  label="Year of Lifts"
                  onPress={() => navigation.navigate('YearOfLifts')}
                />
              );
            })()}
            {/* The Partners tile is REMOVED (blueprint section 1, entry
                point 4). Community is not a stat, so it gets no tile here;
                it is reached from the Today header, the Coach Support row
                and the Train programmes row. No replacement is added. */}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

// Campaign 23 (§21/§22 R2): one row inside the Answer Block.
// FOUNDER DECISION (fully free, no tier split): the `proGated` variant
// (ProBadge + "Part of Pro" dimmed treatment) is retired -- every pillar
// always shows its real state/evidence copy now.
function PillarRow({ icon, label, stateText, evidenceText, onPress }) {
  const t = useTheme();
  const live = useMemo(() => buildLiveStyles(t), [t]);
  const a11y = [label, stateText, evidenceText].filter(Boolean).join('. ');
  return (
    <TouchableOpacity
      style={styles.pillarRow}
      onPress={() => { haptics.selection(); onPress?.(); }}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={a11y}
    >
      <Ionicons name={icon} size={22} color={t.colors.primary} />
      <View style={styles.pillarTextWrap}>
        <View style={styles.pillarLabelRow}>
          <Text style={[styles.pillarLabel, live.pillarLabel]}>{label}</Text>
        </View>
        {/* Founder device order 2026-08-17: the two-line clamps cut
            pillar sentences mid-word ("Maintenance comes fr..."), so
            nearly every box at the top of Progress ran out of space.
            Evidence text wraps in full now; the row grows instead of
            truncating. */}
        {stateText ? <Text style={[styles.pillarState, live.pillarState]}>{stateText}</Text> : null}
        {evidenceText ? <Text style={[styles.pillarEvidence, live.pillarEvidence]}>{evidenceText}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={iconSize.sm} color={t.colors.textMuted} />
    </TouchableOpacity>
  );
}

const MUSCLES = Object.keys(VOLUME_LANDMARKS);

// Compact landing read for weekly volume. The full per-muscle picture lives on
// the heatmap (the one volume home); this is a glanceable summary that drills
// in: how many muscles were trained, how many sit outside their target, and
// an inline stacked bar, one segment per trained muscle, sized by its
// working sets and coloured through the volumeStatusColor grammar, so the
// week's volume shape is visible without leaving the dashboard.
// CP-10 batch G (2026-07-11): sibling function-component scope, own
// useTheme() call (same reasoning as PillarRow above), same shared
// buildLiveStyles(t).
function VolumeSummaryStrip({ volume, loading, onPress, landmarksTable = null }) {
  const t = useTheme();
  const live = useMemo(() => buildLiveStyles(t), [t]);
  const trained = MUSCLES.filter(m => (volume[m]?.workingSets ?? 0) > 0);
  if (trained.length === 0) {
    // Don't flash "Nothing logged" while the underlying data is still
    // resolving; only show the empty state once the load has finished.
    if (loading) return null;
    return (
      <Card
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="This week's volume. Open the heatmap."
      >
        <Text style={[styles.volEmptyText, live.volEmptyText]}>Nothing logged this week yet.</Text>
      </Card>
    );
  }
  let below = 0;
  let over = 0;
  for (const m of trained) {
    const ws = volume[m]?.workingSets ?? 0;
    const lm = landmarksTable?.[m] ?? VOLUME_LANDMARKS[m];
    if (!lm) continue;
    if (ws < lm.mev) below += 1;
    else if (ws > lm.mrv) over += 1;
  }
  const flags = [];
  if (below > 0) flags.push({ key: 'below', n: below, label: 'below target', color: t.colors.textMuted });
  if (over > 0) flags.push({ key: 'over', n: over, label: 'over max', color: t.colors.error });
  // A5 inline stacked bar: one segment per trained muscle, widest first,
  // width proportional to its working sets, coloured by its volume status.
  const resolveVolumeStatusColor = buildVolumeStatusColor(t.colors);
  const segments = trained
    .map(m => {
      const ws = volume[m]?.workingSets ?? 0;
      return { muscle: m, sets: ws, color: resolveVolumeStatusColor(getVolumeStatus(ws, m, landmarksTable).status) };
    })
    .sort((a, b) => b.sets - a.sets);
  return (
    <Card
      style={styles.volSummary}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="This week's volume by muscle. Open the heatmap."
    >
      <View style={styles.volSummaryTop}>
        <View style={styles.volSummaryMain}>
          <Text style={[styles.volSummaryCount, live.volSummaryCount]}>{trained.length}</Text>
          <Text style={[styles.volSummaryLabel, live.volSummaryLabel]}>
            {trained.length === 1 ? 'muscle trained' : 'muscles trained'}
          </Text>
        </View>
        <View style={styles.volSummaryFlags}>
          {flags.length === 0 ? (
            <Text style={[styles.volSummaryClear, live.volSummaryClear]}>All in range</Text>
          ) : flags.map(f => (
            <View key={f.key} style={styles.volLegendItem}>
              <View style={[styles.volLegendDot, { backgroundColor: f.color }]} />
              <Text style={[styles.volSummaryFlagText, live.volSummaryFlagText]}>{f.n} {f.label}</Text>
            </View>
          ))}
        </View>
        <Ionicons name="chevron-forward" size={iconSize.sm} color={t.colors.textMuted} />
      </View>
      <View style={styles.volStackBar}>
        {segments.map(seg => (
          <View
            key={seg.muscle}
            style={[styles.volStackSegment, { flex: Math.max(seg.sets, 0.5), backgroundColor: seg.color }]}
          />
        ))}
      </View>
    </Card>
  );
}

// CP-10 batch G (2026-07-11): sibling function-component scope, own
// useTheme() call (same reasoning as PillarRow above), same shared
// buildLiveStyles(t).
function SessionCard({ workout, onPress }) {
  const t = useTheme();
  const live = useMemo(() => buildLiveStyles(t), [t]);
  const name = workout.name || 'Session';
  const at = workout.startedAt ?? workout.createdAt ?? workout.created_at ?? 0;
  const diff = workout.sessionDifficulty ?? null;
  // R9 (D70): radius="md" -> default (radius.lg).
  return (
    <Card
      style={styles.sessionCard}
      onPress={onPress}
      accessibilityLabel={`View summary for ${name}`}
    >
      <View style={styles.sessionLeft}>
        <Text style={[styles.sessionName, live.sessionName]} numberOfLines={1}>{name}</Text>
        <Text style={[styles.sessionMeta, live.sessionMeta]}>
          {at && safeDate(at) ? safeFormatDate(at, 'EEE d MMM') : ''}
          {workout.durationMinutes ? ` - ${workout.durationMinutes}m` : ''}
        </Text>
      </View>
      {diff != null && (
        <View style={[styles.diffChip, { backgroundColor: buildDiffChipBg(t, diff) }]}>
          <Text style={[styles.diffText, live.diffText, { color: buildDiffChipColor(t, diff) }]}>
            {diff}/10
          </Text>
        </View>
      )}
      <Ionicons name="chevron-forward" size={iconSize.sm} color={t.colors.textMuted} />
    </Card>
  );
}

function NavTile({ icon, color, label, onPress, locked, lockedSub }) {
  // `locked` = not-enough-data-yet (the Recaps countdown pattern): dimmed
  // tile, a progress icon and a countdown sub-line, so it reads as "keep
  // going" rather than a paywall. Tapping fires an inline explanation
  // rather than navigating. Used for features that need accumulated
  // training data (e.g. Recaps needs RECAP_GATE logged sessions).
  // FOUNDER DECISION (fully free, no tier split): the `pro` variant
  // (undimmed icon + PRO badge for a Pro-gated destination) is retired --
  // no tile on this screen is tier-gated any more.
  // CP-10 batch G (2026-07-11): sibling function-component scope, own
  // useTheme() call (same reasoning as PillarRow above), same shared
  // buildLiveStyles(t). `color` arrives pre-resolved from the caller
  // (t.colors.* at each call site); only the locked/label-muted tokens
  // owned by this component need their own `t`.
  const t = useTheme();
  const live = useMemo(() => buildLiveStyles(t), [t]);
  return (
    <TouchableOpacity
      style={[styles.navTile, live.navTile, locked && styles.navTileLocked]}
      // R9 (D70): NavTile presses join the app's haptic vocabulary.
      onPress={() => { haptics.selection(); onPress?.(); }}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={locked ? `${label}. ${lockedSub ?? 'Not ready yet.'}` : label}
      accessibilityState={{ disabled: !!locked }}
    >
      <Ionicons
        name={locked ? 'time-outline' : icon}
        size={22}
        color={locked ? t.colors.textMuted : color}
      />
      <View style={styles.navTileLabelRow}>
        <Text style={[styles.navTileLabel, live.navTileLabel, locked && [styles.navTileLabelLocked, live.navTileLabelLocked]]}>{label}</Text>
      </View>
      {locked && lockedSub ? (
        <Text style={[styles.navTileSub, live.navTileSub]} numberOfLines={1}>{lockedSub}</Text>
      ) : null}
    </TouchableOpacity>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// CP-10 batch G (2026-07-11): converted to accept the live theme `t` on the
// buildLevelStyle(t, level) precedent (DebugLogScreen, batch F) -- the
// difficulty -> tone mapping is byte-identical in meaning, only the token
// SOURCE moved from the frozen import to the live theme.
function buildDiffChipBg(t, d) {
  if (d >= 8) return t.colors.errorBg;
  if (d >= 6) return t.colors.warningBg;
  return t.colors.surface2;
}
function buildDiffChipColor(t, d) {
  if (d >= 8) return t.colors.error;
  if (d >= 6) return t.colors.warning;
  return t.colors.textSecondary;
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: colors.background },
  content:     { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl },
  section:     { gap: spacing.md },
  rowBetween:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  // ── Answer Block (R2) ──
  answerBlock: {},
  answerDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  pillarRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  pillarTextWrap: { flex: 1, gap: spacing.xxs },
  pillarLabelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  pillarLabel: { ...type.overline, color: colors.textMuted },
  pillarState: { ...type.bodyStrong, color: colors.textPrimary },
  pillarEvidence: { ...type.bodySm, color: colors.textSecondary },

  // ── Evidence trail (R3) ──
  adherenceLine: { ...type.caption, color: colors.textMuted },

  // ── Moments (R5) ──
  recapCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.primaryBg, borderRadius: radius.md,
    borderWidth: 1, borderColor: withAlpha(colors.primary, alpha.mid),
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  recapCardText: { flex: 1, fontSize: fontSize.sm, color: colors.textPrimary, fontFamily: fontFamily.semibold, fontWeight: fontWeight.semibold },

  // ── Volume snapshot (R4) ──
  volEmptyText: { fontSize: fontSize.sm, color: colors.textMuted },
  volSummary:      { gap: spacing.md },
  volSummaryTop:   { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  volStackBar:     { flexDirection: 'row', height: 8, gap: spacing.xxs },
  volStackSegment: { borderRadius: radius.hair },
  volSummaryMain:  { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs },
  volSummaryCount: { fontSize: fontSize.xl, fontFamily: fontFamily.bold, fontWeight: fontWeight.bold, color: colors.textPrimary, fontVariant: ['tabular-nums'] },
  volSummaryLabel: { fontSize: fontSize.sm, color: colors.textSecondary },
  volSummaryFlags: { flex: 1, alignItems: 'flex-end', gap: spacing.xxs },
  volSummaryFlagText: { fontSize: fontSize.micro, color: colors.textSecondary, fontVariant: ['tabular-nums'] },
  volSummaryClear: { fontSize: fontSize.micro, color: colors.textMuted },
  volLegendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  volLegendDot: { width: 8, height: 8, borderRadius: circle(8) },

  // ── Recent sessions (R3) ──
  sessionCard: {
    flexDirection: 'row', alignItems: 'center',
    gap: spacing.md,
  },
  sessionLeft:  { flex: 1 },
  sessionName:  { ...type.bodyStrong, color: colors.textPrimary },
  sessionMeta:  { ...type.num('caption'), color: colors.textSecondary, marginTop: spacing.xxs },
  diffChip:     { borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: spacing.xxs },
  // R2 (cohesion sweep, 2026-07-11): the difficulty readout ("8/10") is a
  // data numeral, so it joins the screen's tabular-figure discipline like
  // every other numeral here (volSummaryCount). fontSize.xs +
  // fontWeight.bold has no exact type.* role (theme gap logged in the R2
  // report), so the raw weight stays rather than dropping emphasis.
  diffText:     { fontSize: fontSize.xs, fontFamily: fontFamily.bold, fontWeight: fontWeight.bold, fontVariant: ['tabular-nums'] },

  // ── Utilities (R6) ──
  navGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  navTile: {
    flex: 1, minWidth: '45%',
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.lg, alignItems: 'center', gap: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  navTileLabelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  // R2 (cohesion sweep, 2026-07-11): the raw fontSize.xs + fontWeight.semibold
  // pair maps exactly onto type.captionStrong (the named xs+semibold role for
  // small non-uppercase data-adjacent labels), so it joins the shared type
  // system instead of a hand-rolled pair.
  navTileLabel: {
    ...type.captionStrong,
    color: colors.textSecondary, textAlign: 'center',
  },
  // Not-enough-data-yet tile variant (Recaps countdown pattern, T6): dimmed
  // while a feature is still accumulating data (e.g. Recaps needs
  // RECAP_GATE logged sessions). Never used for a Pro lock, which stays
  // undimmed with a PRO badge instead, so the two states never look alike.
  navTileLocked: { opacity: 0.55 },
  navTileLabelLocked: { color: colors.textMuted },
  navTileSub: {
    ...type.num('caption'),
    color: colors.textMuted,
    marginTop: spacing.xxs,
    textAlign: 'center',
  },
});

// CP-10 batch G (2026-07-11): the frozen `styles` block above stays byte-
// identical. This mirrors ONLY the colour/fontSize/type-bearing sub-
// properties of the matching frozen style, at identical rest values, shared
// by this screen's several function-component scopes (AnalyticsScreen and
// its sibling PillarRow/VolumeSummaryStrip/SessionCard/NavTile) so they can
// never drift out of step with each other or the frozen block. Pure layout
// keys (flex/gap/padding/width/borderWidth, no token) are correctly omitted
// -- there is nothing to unfreeze for them.
function buildLiveStyles(t) {
  return {
    safe: { backgroundColor: t.colors.background },
    answerDivider: { backgroundColor: t.colors.border },
    pillarLabel: { ...t.type.overline, color: t.colors.textMuted },
    pillarState: { ...t.type.bodyStrong, color: t.colors.textPrimary },
    pillarEvidence: { ...t.type.bodySm, color: t.colors.textSecondary },
    adherenceLine: { ...t.type.caption, color: t.colors.textMuted },
    recapCard: { backgroundColor: t.colors.primaryBg, borderColor: withAlpha(t.colors.primary, alpha.mid) },
    recapCardText: { fontSize: t.fontSize.sm, color: t.colors.textPrimary },
    volEmptyText: { fontSize: t.fontSize.sm, color: t.colors.textMuted },
    volSummaryCount: { fontSize: t.fontSize.xl, color: t.colors.textPrimary },
    volSummaryLabel: { fontSize: t.fontSize.sm, color: t.colors.textSecondary },
    volSummaryFlagText: { fontSize: t.fontSize.micro, color: t.colors.textSecondary },
    volSummaryClear: { fontSize: t.fontSize.micro, color: t.colors.textMuted },
    sessionName: { ...t.type.bodyStrong, color: t.colors.textPrimary },
    sessionMeta: { ...t.type.num('caption'), color: t.colors.textSecondary },
    diffText: { fontSize: t.fontSize.xs },
    navTile: { backgroundColor: t.colors.surface, borderColor: t.colors.border },
    navTileLabel: { ...t.type.captionStrong, color: t.colors.textSecondary },
    navTileLabelLocked: { color: t.colors.textMuted },
    navTileSub: { ...t.type.num('caption'), color: t.colors.textMuted },
  };
}
