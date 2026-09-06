/**
 * Coach home.
 *
 * Historical file/route name kept as YouScreen/You for navigation stability,
 * but the visible tab is now Coach. This is the coaching hub: every
 * destination is a clear Volyume flow with its own guardrails.
 */
import { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from '@react-navigation/native';
// D134 (founder 2026-09-03): the tier-blind Injuries & limitations row's live line.
import { loadCapabilityState } from '../lib/capability/store';
import { howYouTrainSummary } from '../lib/capability/summary';
import { colors, fontSize, fontWeight, spacing, radius, type, withAlpha, alpha, iconSize, fontFamily } from '../styles/theme';
import useTheme from '../hooks/useTheme';
import * as haptics from '../lib/haptics';
import ScreenHeader from '../components/ScreenHeader';
import Card from '../components/Card';
import PressableCard from '../components/PressableCard';
import { Skeleton } from '../components/Skeleton';
import SectionLabel from '../components/SectionLabel';
import ProfileAvatarMark from '../components/ProfileAvatarMark';
import useAppStore from '../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import {
  getAllWorkouts,
  getCoachOutputHistory,
  getLatestCheckin,
  getLatestCoachOutput,
  getMorningWeightsLast14Days,
  getOpenEdPatternFlag,
  getAllExercises,
} from '../lib/database';
import { navigateCrossTab } from '../navigation/navigateCrossTab';
import { logError } from '../lib/errorLog';
import { GOAL_LABELS, PHASE_LABELS } from '../lib/coachingGoals';
import { buildCoachLedger } from '../lib/coachLedger';
import { localWeekStartMs, localDayKey } from '../lib/dayKey';
import { isCalm, WELLBEING_KEY } from '../lib/wellbeing';
import { isApplePrivateRelayEmail } from '../lib/appleIdentity';

function formatDate(ms) {
  if (!ms) return null;
  try {
    return new Date(Number(ms)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  } catch (_) {
    return null;
  }
}

// UK short date (DD/MM/YYYY) for the pending-coach-decision title, which sits
// in a narrow card and wrapped to a second line with the long-form date
// (founder D13.1, 2026-07-09). Same en-GB locale as every other date on this
// screen, just the default numeric format instead of day/month/year options.
// R2-7 (remediation 2026-07-11, founder device walk build 2684): the check-in
// row's date fact reads as a calm British day-and-month line ("19 July"), not a
// numeric DD/MM/YYYY. It titles a one-line NavRow subtitle now that the
// explanatory sentence lives on WeeklyCheckInScreen (where it was already
// conveyed in full), so the row sits level with its one-line siblings.
function formatShortDate(ms) {
  if (!ms) return null;
  try {
    return new Date(Number(ms)).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
  } catch (_) {
    return null;
  }
}

// CP-10 batch G (2026-07-11): sibling function-component scope (not
// prop-drilled `live`/`t` from YouScreen, matching NutritionTargetsScreen's
// MacroCard/WhySection precedent from batch E), own useTheme() call and the
// shared buildLiveStyles(t) (same `styles` block this component reads).
// FOUNDER DECISION (fully free, no tier split): the `pro` flag (ProBadge +
// "Part of Pro" accessibility suffix) is retired -- no row on this screen
// gates on tier any more.
function NavRow({ icon, label, sub, onPress }) {
  const t = useTheme();
  const live = useMemo(() => buildLiveStyles(t), [t]);
  // R9 (D70): the house selection() beat on every nav-row tap, added once
  // here so all consumers gain it together (haptics vocabulary rule;
  // navigation taps are never the ED diary-marking exception).
  const handlePress = onPress
    ? () => { haptics.selection(); onPress(); }
    : onPress;
  return (
    <PressableCard
      style={[styles.navRow, live.navRow]}
      onPress={handlePress}
      accessibilityLabel={label}
    >
      <View style={[styles.navRowIcon, live.navRowIcon]}>
        <Ionicons name={icon} size={18} color={t.colors.primary} />
      </View>
      <View style={styles.navRowText}>
        <View style={styles.navRowLabelRow}>
          <Text style={[styles.navRowLabel, live.navRowLabel]}>{label}</Text>
        </View>
        {sub ? <Text style={[styles.navRowSub, live.navRowSub]}>{sub}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={iconSize.sm} color={t.colors.textMuted} />
    </PressableCard>
  );
}

/**
 * NavGroup
 *
 * One grouped list for a run of NavRows. Each row used to be its own Card,
 * so a section of four links rendered as four separate surfaces with four
 * borders and four sets of padding -- ten near-identical boxes down the
 * screen, with the athlete's own profile card carrying exactly the same
 * weight as a link to a settings page. Nothing ranked.
 *
 * The rows now share one container and are separated by the hairline the
 * rest of the app uses, which is the same shape Settings has always had
 * (SettingsPrimitives' `section` + SettingRow), so the two nav surfaces
 * finally read as one system. The hero cards above keep the Card treatment
 * and are once again the only card-weight objects on the screen.
 */
function NavGroup({ children }) {
  const t = useTheme();
  return (
    <View style={[styles.navGroup, { backgroundColor: t.colors.surface, borderColor: t.colors.borderSubtle }]}>
      {children}
    </View>
  );
}

function profileFocusLine(profile = {}) {
  const safeProfile = profile || {};
  const phase = PHASE_LABELS[safeProfile.trainingPhase] || null;
  const goal = GOAL_LABELS[safeProfile.trainingGoal] || null;
  const days = Number(safeProfile.daysPerWeek);
  return [
    phase,
    goal && goal !== 'Not competing' ? goal : null,
    Number.isFinite(days) && days > 0 ? `${days} days/week` : null,
  ].filter(Boolean).join(' - ');
}

function isCompletedCoachDecision(output, checkin) {
  if (!output?.weekStart || output.hasEnoughData === false) return false;
  return Number(checkin?.weekStart) === Number(output.weekStart) && checkin?.energyScore != null;
}

function parseCheckinDay(rawPrefs) {
  try {
    const prefs = rawPrefs ? JSON.parse(rawPrefs) : null;
    return Number.isFinite(prefs?.checkinDay) ? prefs.checkinDay : 0;
  } catch (_) {
    return 0;
  }
}

function localMidnightMs(ms = Date.now()) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function buildPendingCoachCopy(readiness) {
  if (!readiness) {
    return {
      title: 'First check-in not open yet',
      body: 'Log your morning weight and train as normal. Volyume will open the check-in once the baseline is ready.',
    };
  }
  if (readiness.edSuppressed) {
    return {
      title: readiness.unlockDateMs
        ? `First check-in ${formatShortDate(readiness.unlockDateMs)}`
        : 'First check-in not open yet',
      body: 'Volyume is keeping this calm and will not push weigh-in counts here. Use the check-in when it opens.',
    };
  }
  if (!readiness.firstWeightAt) {
    return {
      title: 'First check-in starts after your first morning weight',
      body: 'Log your first morning weight from Today to start the baseline. Your coach will not change targets until enough data is in.',
    };
  }
  const rows = readiness.ledger?.rows || [];
  const weighInsReady = rows.find(r => r.key === 'weighIns')?.done === true;
  const daysReady = rows.find(r => r.key === 'days')?.done === true;
  const unlockIsTodayOrPast = readiness.unlockDateMs != null
    && readiness.unlockDateMs <= localMidnightMs();
  if (unlockIsTodayOrPast && weighInsReady && daysReady) {
    return {
      title: 'Weekly check-in is open',
      body: 'Answer the weekly check-in to produce your coaching decision. Until you do, targets stay unchanged.',
    };
  }
  if (daysReady && !weighInsReady) {
    return {
      title: 'First check-in needs more morning weights',
      body: 'Keep logging your morning weight. A few more and there will be enough for your first weekly review, since one morning on its own moves about too much to tell you anything.',
    };
  }
  return {
    title: readiness.unlockDateMs
      ? `First check-in ${formatShortDate(readiness.unlockDateMs)}`
      : 'First check-in not open yet',
    body: 'Keep logging morning weight and training. Volyume waits for enough baseline data before it changes targets.',
  };
}

export default function YouScreen({ navigation }) {
  // `tier` left this selector with the Partners row (blueprint section 1,
  // entry point 2): it was read only to pass through to usePartners, and
  // nothing on this screen consults tier now (fully-free product, D137).
  const { user, userProfile } = useAppStore(useShallow(s => ({
    user: s.user,
    userProfile: s.userProfile,
  })));
  const [sessions, setSessions] = useState(null);
  const [latestReview, setLatestReview] = useState(null);
  const [hasCoachHistory, setHasCoachHistory] = useState(false);
  const [coachReadiness, setCoachReadiness] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  // D134: the live Injuries & limitations line, tier-blind, refreshed on focus. Its
  // own small loader so the tab's main load stays exactly as it was.
  const [hytSummary, setHytSummary] = useState(() => howYouTrainSummary(null));
  useFocusEffect(useCallback(() => {
    let alive = true;
    (async () => {
      if (!user?.id) return;
      try {
        const [state, library] = await Promise.all([loadCapabilityState(user.id), getAllExercises().catch(() => [])]);
        if (alive) setHytSummary(howYouTrainSummary(state, { nameOf: (id) => library.find((e) => e.id === id)?.name ?? null }));
      } catch (_) {
        if (alive) setHytSummary(howYouTrainSummary({ baseline: [], episodes: [], history: [], unavailable: true }));
      }
    })();
    return () => { alive = false; };
  }, [user?.id]));
  // CP-10 batch G (2026-07-11): live theme (src/hooks/useTheme.js).
  const t = useTheme();
  const live = useMemo(() => buildLiveStyles(t), [t]);

  useFocusEffect(useCallback(() => {
    let alive = true;
    async function load() {
      if (!user?.id) {
        setLoadError(false);
        setCoachReadiness(null);
        return;
      }
      try {
        const [
          workoutsResult,
          latestResult,
          checkinResult,
          historyResult,
          weightsResult,
          prefsResult,
          edFlagResult,
          wellbeingResult,
        ] = await Promise.allSettled([
          getAllWorkouts(user.id),
          getLatestCoachOutput(user.id),
          getLatestCheckin(user.id),
          // R8 (D68): history now loads for Pro too (limit 1) - it decides
          // whether the "Coaching decision" archive row shows while there is
          // no completed decision for the current week (e.g. Monday's new
          // output before this week's check-in is answered).
          getCoachOutputHistory(user.id, 1),
          // FOUNDER DECISION (fully free, no tier split): these four used to
          // read Free as an empty/absent placeholder; they run unconditionally
          // now, for everyone.
          getMorningWeightsLast14Days(user.id),
          AsyncStorage.getItem('@volyume_notification_prefs'),
          getOpenEdPatternFlag(user.id),
          AsyncStorage.getItem(WELLBEING_KEY).then((v) => v || 'unspecified'),
        ]);
        if (!alive) return;
        const failed = [workoutsResult, latestResult, checkinResult, historyResult].some((r) => r.status === 'rejected');
        if (failed) {
          logError('YouScreen.load', new Error('coach_hub_partial_load_failed'), {
            reloadKey,
            workouts: workoutsResult.status,
            latest: latestResult.status,
            checkin: checkinResult.status,
            history: historyResult.status,
          });
        }
        const workouts = workoutsResult.status === 'fulfilled' ? workoutsResult.value : [];
        const latest = latestResult.status === 'fulfilled' ? latestResult.value : null;
        const checkin = checkinResult.status === 'fulfilled' ? checkinResult.value : null;
        const latestDecision = isCompletedCoachDecision(latest, checkin) ? latest : null;
        const history = historyResult.status === 'fulfilled' ? historyResult.value : [];
        const weights = weightsResult.status === 'fulfilled' ? weightsResult.value : [];
        const checkinDay = parseCheckinDay(prefsResult.status === 'fulfilled' ? prefsResult.value : null);
        const wellbeing = wellbeingResult.status === 'fulfilled' ? (wellbeingResult.value || 'unspecified') : 'read_failed';
        const edFlag = edFlagResult.status === 'fulfilled' ? edFlagResult.value : 'read_failed';
        const completed = (workouts || []).filter(w => !!(w.isCompleted ?? w.is_completed));
        // X11 (cross-surface consistency audit 2026-07-30): was a rolling
        // trailing-7-day window; every "this week" weigh-in count now shares
        // the same Monday-anchored boundary (dayKey.js) as CoachOutputScreen.
        const weekAgo = localWeekStartMs();
        // D93 (review B finding 1): distinct mornings, matching the engine's
        // per-day credit and the ledger label.
        const weighIns7d = new Set(
          (weights || [])
            .filter(w => Number.isFinite(Number(w.loggedAt ?? w.logged_at)) && Number(w.loggedAt ?? w.logged_at) >= weekAgo)
            .map(w => localDayKey(Number(w.loggedAt ?? w.logged_at)))
        ).size;
        const firstWeightAt = weights.length
          ? Math.min(...weights.map(w => w.loggedAt ?? w.logged_at ?? Infinity))
          : null;
        const edSuppressed = !!edFlag
          || (Number.isFinite(userProfile?.scoffScore) && userProfile.scoffScore >= 2)
          || wellbeing === 'read_failed'
          || isCalm(wellbeing);
        // FOUNDER DECISION (fully free, no tier split): the ledger runs for
        // everyone now, not only Pro.
        const ledger = buildCoachLedger({
          weighIns7d,
          completedSessions: completed.length,
          firstWeightAt: Number.isFinite(firstWeightAt) ? firstWeightAt : null,
          checkinDay,
          edFlagOpen: edSuppressed,
        });
        if (workoutsResult.status === 'fulfilled') setSessions(completed.length);
        if (latestResult.status === 'fulfilled' && checkinResult.status === 'fulfilled') setLatestReview(latestDecision);
        if (historyResult.status === 'fulfilled') setHasCoachHistory((history || []).length > 0);
        setCoachReadiness({
          ledger,
          unlockLabel: ledger.unlockLabel,
          unlockDateMs: ledger.unlockDate ? ledger.unlockDate.getTime() : null,
          firstWeightAt: Number.isFinite(firstWeightAt) ? firstWeightAt : null,
          edSuppressed,
        });

        setLoadError(failed);
      } catch (e) {
        if (alive) {
          logError('YouScreen.load', e, { userId: user?.id, reloadKey });
          setLoadError(true);
        }
      }
    }
    load();
    return () => { alive = false; };
  }, [user?.id, reloadKey, userProfile]));

  // The e-mail fallback is a nicety for people whose address carries their
  // name. Apple's Hide My Email gives a random token instead, so that fallback
  // rendered a profile header reading "ab  cd  ef"; skip it and say Athlete.
  const displayName = userProfile?.firstName
    || (isApplePrivateRelayEmail(user?.email)
      ? null
      : user?.email?.split('@')[0]?.replace(/[^a-zA-Z]/g, ' ').trim())
    || 'Athlete';
  const avatarUri = userProfile?.avatarUri || null;
  const reviewDate = latestReview ? formatDate(latestReview.weekStart) : null;
  const profileFocus = profileFocusLine(userProfile);
  const pendingCoachCopy = buildPendingCoachCopy(coachReadiness);

  // Community (blueprint section 1, entry point 2): the Support row that
  // used to open Partners now opens Community, which is where following
  // people, sharing programmes and training stories live. The rest of the
  // partner code stays where it is; retiring it is its own lane.
  const openCommunity = useCallback(() => {
    navigateCrossTab(navigation, 'HomeTab', 'Community');
  }, [navigation]);

  return (
    <SafeAreaView style={[styles.safe, live.safe]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader
          title="Coach"
          subtitle="Weekly coaching from your logs."
          right={(
            <Pressable
              onPress={() => navigation.navigate('Settings')}
              hitSlop={10}
              style={[styles.settingsGear, live.settingsGear]}
              accessibilityRole="button"
              accessibilityLabel="Settings"
            >
              <Ionicons name="settings-outline" size={20} color={t.colors.textPrimary} />
            </Pressable>
          )}
        />

        {/* DD113 (design-consistency-audit-2026-08-06): documented exception,
            not bespoke drift. Unlike AnalyticsScreen's blocking EmptyState
            (the whole screen's content), this is a slim degrade-in-place
            banner that sits ABOVE the rest of the screen, which keeps
            rendering as normal underneath it (profile card, nav sections) --
            a load failure here never blocks the athlete profile or coaching
            nav the user still needs. Converting it to EmptyState would force
            it to take over the screen, breaking that in-place-degrade
            contract, so it stays a compact Card. Visual language (icon +
            title + body, warning tone) still matches the app's other
            failure states as closely as the inline layout allows. */}
        {loadError ? (
          <Card
            style={[styles.loadErrorCard, live.loadErrorCard]}
            onPress={() => setReloadKey((n) => n + 1)}
            accessibilityLabel="Try loading coach data again"
          >
            <View style={[styles.loadErrorIcon, live.loadErrorIcon]}>
              <Ionicons name="warning-outline" size={18} color={t.colors.warning} />
            </View>
            <View style={styles.loadErrorCopy}>
              <Text style={[styles.loadErrorTitle, live.loadErrorTitle]}>Couldn't refresh Coach</Text>
              <Text style={[styles.loadErrorBody, live.loadErrorBody]}>Your saved profile stays unchanged. Tap to try again.</Text>
            </View>
            <Ionicons name="refresh-outline" size={18} color={t.colors.textMuted} />
          </Card>
        ) : null}

        {/* Founder direct order (2026-07-09, resume session): "move User (Pro)
            profile above the Coach box." This supersedes the 2026-07-08 audit
            reorder and D13.3 (2026-07-09 earlier same day), both of which put
            the coach status card first as the screen's hero and the profile
            card directly beneath it. The founder's later instruction reverses
            that: the profile card is now the first thing seen, the coach
            status card follows it, ahead of every nav section. */}
        <Card
          style={styles.profileCard}
          onPress={() => navigation.navigate('AthleteProfile')}
          accessibilityLabel="Open athlete profile"
        >
          <ProfileAvatarMark
            avatarUri={avatarUri}
            presetKey={userProfile?.avatarPreset}
            displayName={displayName}
            size={56}
          />
          <View style={styles.profileInfo}>
            <View style={styles.profileNameRow}>
              <Text style={[styles.profileName, live.profileName]} numberOfLines={1}>{displayName}</Text>
            </View>
            {sessions != null ? (
              <Text style={[styles.profileStat, live.profileStat]}>{sessions} completed session{sessions === 1 ? '' : 's'}</Text>
            ) : user?.id ? (
              <Skeleton width={110} height={12} />
            ) : null}
            {profileFocus ? <Text style={[styles.profileFocus, live.profileFocus]} numberOfLines={2}>{profileFocus}</Text> : null}
          </View>
          <Ionicons name="chevron-forward" size={iconSize.sm} color={t.colors.textMuted} />
        </Card>

        {/* FOUNDER DECISION (fully free, no tier split): the everyday trial
            value card (AttentionCard variant="trial") is retired along with
            the trial itself. */}

        {/* R8 (D68, founder: "cobbled together mess with duplication"):
            the status card is no longer a third voice restating what the
            rows below already say. It is TAPPABLE - it IS the thing it
            describes - and renders only once a completed decision exists:
            the weekly update hero, opening CoachOutput directly (the old
            card said "Open it" but was not pressable; the duplicate
            "Coaching decision" NavRow did the opening one card down).
            With no completed decision it renders NO status card at all:
            "Getting to know you" said nothing (founder verdict) and its
            body just pointed at the check-in row, which already carries
            the full, specific readiness status (pendingCoachCopy).
            FOUNDER DECISION (fully free, no tier split): the Free pitch
            branch (opening ProUpgrade) is retired -- there is nothing left
            to pitch. */}
        {latestReview ? (
          <Card
            style={styles.statusCard}
            tone="primary"
            onPress={() => navigation.navigate('CoachOutput', latestReview?.weekStart ? { weekStart: latestReview.weekStart } : undefined)}
            accessibilityLabel={`Open your weekly coach update${reviewDate ? ` from ${reviewDate}` : ''}`}
          >
            <View style={styles.statusTop}>
              <View style={[styles.statusIcon, live.statusIcon]}>
                <Ionicons name="git-branch-outline" size={20} color={t.colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                {/* The "COACH" kicker that sat here is gone. It restated the
                    heading directly below it ("Weekly coaching decision")
                    beside an icon that already says the same thing -- the
                    category was marked three times over. The heading carries
                    its own weight. */}
                <Text style={[styles.statusTitle, live.statusTitle]}>
                  {`Weekly coaching decision${reviewDate ? `: ${reviewDate}` : ''}`}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={iconSize.sm} color={t.colors.textMuted} />
            </View>
            <Text style={[styles.statusBody, live.statusBody]}>
              What changed, what was held, and the exact signals behind it.
            </Text>
          </Card>
        ) : null}

        {/* D134 (founder 2026-09-03): tier-blind, above Setup. The first
            thing the coach builds from is free by law (CAP-19), so every
            account sees it here, with its live line. */}
        <View style={styles.section}>
          <SectionLabel>Your body</SectionLabel>
          <NavGroup>
            <NavRow
              icon="body-outline"
              label="Injuries & limitations"
              sub={hytSummary.sub}
              onPress={() => navigation.navigate('HowYouTrain')}
            />
          </NavGroup>
        </View>

        {/* FOUNDER DECISION (fully free, no tier split): "This week" is the
            only version of this section now -- the Free "Coach"/"Coaching
            history" branch is retired. */}
        <View style={styles.section}>
          <SectionLabel>This week</SectionLabel>
          <NavGroup>
          {/* R2-7 (remediation 2026-07-11, founder device walk build 2684):
              the subtitle is ONE calm line - the readiness title only (a
              short date fact like "First check-in 19 July", or the open/
              needs-more one-liner). The explanatory sentence
              (pendingCoachCopy.body) is NOT concatenated here; it is already
              conveyed in full on WeeklyCheckInScreen (the row's destination),
              so this row sits level with its one-line siblings instead of
              wrapping to a four-line paragraph. */}
          <NavRow
            icon="clipboard-outline"
            label="Weekly check-in"
            sub={latestReview
              ? "Answer this week's questions so the coach has context."
              : pendingCoachCopy.title}
            onPress={() => navigation.navigate('WeeklyCheckIn')}
          />
          {/* R8 (D68): when a completed decision exists the tappable hero
              card above IS the decision surface, so this row would be a
              duplicate. It renders only as the archive path: no completed
              decision for the current week, but past decisions exist
              (e.g. a new Monday output before the check-in is answered). */}
          {!latestReview && hasCoachHistory ? (
            <NavRow
              icon="pulse-outline"
              label="Coaching decision"
              sub="Your latest decision stays readable here."
              onPress={() => navigation.navigate('CoachOutput')}
            />
          ) : null}
          <NavRow
            icon="book-outline"
            label="Your week"
            sub="Training, eating, weighing in and the coach's decision, in one place."
            onPress={() => navigation.navigate('WeeklyStory')}
          />
          </NavGroup>
        </View>

        {/* FOUNDER DECISION (fully free, no tier split): Setup renders for
            everyone now. */}
        <View style={styles.section}>
          <SectionLabel>Setup</SectionLabel>
          <NavGroup>
          <NavRow
            icon="flag-outline"
            label="Update goal and phase"
            sub="Change goal, phase, schedule, equipment or experience."
            onPress={() => navigation.navigate('ProGoalSetup')}
          />
          <NavRow
            icon="nutrition-outline"
            label="Nutrition targets"
            sub="Calories, macros, protein level and target rationale."
            onPress={() => navigation.navigate('NutritionTargets')}
          />
          <NavRow
            icon="notifications-outline"
            label="Coaching reminders"
            sub="Check-in, weigh-in and adherence reminders that feed the weekly loop."
            onPress={() => navigation.navigate('CoachingReminders')}
          />
          {/* D94 (Campaign 3, Phase 9): the volume-target editor's only
              other route is data-gated through Analytics, so a coached
              user with sparse data had no path to the one control whose
              manual numbers outrank the coach. Direct row, canonical
              editor unchanged. */}
          <NavRow
            icon="stats-chart-outline"
            label="Volume targets"
            sub="Weekly set ranges per muscle. Your own numbers take precedence."
            // Review A finding 3: VolumeHeatmap lives in the Home and Progress
            // stacks, not ProfileTab; cross-tab helper or the tap is dead.
            onPress={() => navigateCrossTab(navigation, 'ProgressTab', 'VolumeHeatmap')}
          />
          </NavGroup>
        </View>

        <View style={styles.section}>
          <SectionLabel>Support</SectionLabel>
          <NavGroup>
          <NavRow
            icon="people-outline"
            label="Community"
            sub="Programmes, training stories and people"
            onPress={openCommunity}
          />
          </NavGroup>
        </View>

        {/* W-8 / C5-P7-07 (D96): this section used to sit inside the isPro
            branch, and YouScreen is the ONLY route to WellbeingCheckScreen in
            the whole app, so a Free user could never take or update the
            self-report screening, nor reach the Beat UK signpost it shows.
            Both screens are registered ungated (RootNavigator) and both rows
            are guardrail INPUTS, not Pro features: the wellbeing check writes
            the SCOFF score the tier-blind safety system reads, and Goal lock
            sets the ED-pattern detector's threshold. CLAUDE.md Section 2 and
            proGate.js are explicit that guardrails never consult tier, so the
            section is tier-blind here too. No screen, question, score,
            threshold, flag or floor is changed by this move. */}
        <View style={styles.section}>
          <SectionLabel>Safety checks</SectionLabel>
          <NavGroup>
          <NavRow
            icon="shield-checkmark-outline"
            label="Goal lock"
            sub="Set the conservative limit for cutting goals."
            onPress={() => navigation.navigate('GoalLockConsent', { editMode: true })}
          />
          <NavRow
            icon="heart-outline"
            label="Wellbeing check"
            // Tier-blind wording now the row is (W-8): the answers shape the
            // safety checks every account gets, whether or not coaching is on.
            sub="Update the questions behind your safety checks."
            onPress={() => navigation.navigate('WellbeingCheck')}
          />
          </NavGroup>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxxl },
  // Audit item 3: account/settings is demoted to this header gear (a
  // secondary entry point, not removed) so the coaching content leads the
  // scrollable body. Sized to match the ScreenHeader brand-mark box it
  // replaces on this one tab.
  settingsGear: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface2,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  profileInfo: { flex: 1, gap: spacing.xxs },
  profileNameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  profileName: { ...type.h3, color: colors.textPrimary, flexShrink: 1 },
  profileStat: { ...type.num('caption'), color: colors.textSecondary },
  profileFocus: { ...type.captionTight, color: colors.textMuted },
  loadErrorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderColor: colors.warning,
  },
  loadErrorIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.warningBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadErrorCopy: { flex: 1, minWidth: 0 },
  loadErrorTitle: { ...type.bodyStrong, color: colors.textPrimary },
  loadErrorBody: { ...type.caption, color: colors.textSecondary, marginTop: spacing.xxs },
  statusCard: { gap: spacing.md },
  statusTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  statusIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: withAlpha(colors.primary, alpha.edge),
  },
  // B-5: statusEyebrow's typography now comes from SectionLabel (tone="primary").
  statusTitle: { ...type.bodyStrong, color: colors.textPrimary },
  statusBody: { ...type.bodySm, color: colors.textSecondary },
  section: { gap: spacing.md },
  navGroup: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    overflow: 'hidden',
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  navRowIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navRowText: { flex: 1 },
  navRowLabelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  navRowLabel: { ...type.bodyStrong, color: colors.textPrimary },
  navRowSub: { ...type.caption, color: colors.textSecondary, marginTop: spacing.xxs },
  about: { alignItems: 'center', paddingTop: spacing.md, gap: spacing.xs },
  aboutName: { fontSize: fontSize.sm, fontFamily: fontFamily.bold, fontWeight: fontWeight.bold, color: colors.textMuted },
  aboutVersion: { ...type.caption, color: colors.textMuted },
});

// CP-10 batch G (2026-07-11): the frozen `styles` block above stays byte-
// identical. This mirrors ONLY the colour/fontSize/type-bearing sub-
// properties of the matching frozen style, at identical rest values, so the
// screen carries no static island under a live theme toggle. Pure layout
// keys (flex/gap/padding/width/height, no token) are correctly omitted --
// there is nothing to unfreeze for them. Same pattern as
// AddCustomFoodScreen.js's buildLiveStyles (batch D).
function buildLiveStyles(t) {
  return {
    safe: { backgroundColor: t.colors.background },
    settingsGear: { backgroundColor: t.colors.surface2 },
    profileName: { ...t.type.h3, color: t.colors.textPrimary },
    profileStat: { ...t.type.num('caption'), color: t.colors.textSecondary },
    profileFocus: { ...t.type.captionTight, color: t.colors.textMuted },
    loadErrorCard: { borderColor: t.colors.warning },
    loadErrorIcon: { backgroundColor: t.colors.warningBg },
    loadErrorTitle: { ...t.type.bodyStrong, color: t.colors.textPrimary },
    loadErrorBody: { ...t.type.caption, color: t.colors.textSecondary },
    statusIcon: { backgroundColor: t.colors.primaryBg, borderColor: withAlpha(t.colors.primary, alpha.edge) },
    statusTitle: { ...t.type.bodyStrong, color: t.colors.textPrimary },
    statusBody: { ...t.type.bodySm, color: t.colors.textSecondary },
    navRow: { borderBottomColor: t.colors.borderSubtle },
    navRowIcon: { backgroundColor: t.colors.primaryBg },
    navRowLabel: { ...t.type.bodyStrong, color: t.colors.textPrimary },
    navRowSub: { ...t.type.caption, color: t.colors.textSecondary },
    aboutName: { fontSize: t.fontSize.sm, color: t.colors.textMuted },
    aboutVersion: { ...t.type.caption, color: t.colors.textMuted },
  };
}
