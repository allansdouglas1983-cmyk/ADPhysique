import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
// Campaign item 14 (D25): react-native-keyboard-controller for the main
// content scroll's inline notes fields (which previously had NO keyboard
// avoidance at all). KeyboardAwareScrollView replaces the main content
// ScrollView; KeyboardGestureArea adds interactive (drag-to-dismiss) keyboard
// handling on Android to match iOS's native interactive dismiss. The
// template-name prompt is now the shared BottomSheet (below), which owns its
// own keyboard avoidance (keyboardAvoiding prop) - no separate
// KeyboardAvoidingView needed.
import {
  KeyboardAwareScrollView,
  KeyboardGestureArea,
} from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, fontSize, fontWeight, spacing, radius, type, buildVolumeStatusColor, withAlpha, alpha, circle, motion, iconSize, fontFamily } from '../styles/theme';
import useTheme from '../hooks/useTheme';
import InfoTooltip from '../components/InfoTooltip';
import { GLOSSARY } from '../lib/coachGlossary';
import BackHeader from '../components/BackHeader';
import RollingNumber from '../components/RollingNumber';
import BlockShapeCard from '../components/BlockShapeCard';
import Button from '../components/Button';
import Card from '../components/Card';
import BottomSheet from '../components/BottomSheet';
import TextField from '../components/TextField';
import { useFeedback } from '../components/FeedbackSheet';
import { shouldPrompt } from '../lib/feedback';
import {
  getCompletedWorkoutSets, getAllExercises, getAllWorkouts, updateWorkout,
  getActivePlan, getRoutinesForPlan,
  createAdaptationEvent, getCurrentMesocycleWeek,
  saveWeeklyCheckin, saveNextTimeNote, getRoutineWorkoutTonnages,
  getRoutineById, getWorkoutById, getOpenEdPatternFlag,
  getSessionConstraintEffect,
} from '../lib/database';
import { isCalm, WELLBEING_KEY } from '../lib/wellbeing';
import { claimMilestones } from '../lib/milestones';
import { selection as hapticSelection, prAchieved as hapticMilestone } from '../lib/haptics';
import { MilestoneBurst } from '../components/PRCelebration';
import ProgressPhotoPrompt from '../components/ProgressPhotoPrompt';
import { calculateWeeklyVolume, calculateExcludedWeeklyVolume, getVolumeStatus, MUSCLE_DISPLAY_NAMES, runAdaptiveEngine } from '../lib/algorithms';
import { getEffectiveLandmarks } from '../lib/effectiveLandmarks';
import { getVolumeInsight, getVolumeWhy } from '../lib/volumeInsightCopy';
import { topSetFromExerciseData, intensityTier, shareSessionName } from '../lib/sessionShareData';
import useAppStore from '../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import { useToast } from '../components/Toast';
import { syncWorkout } from '../lib/sync';
import { incrementSessionCount, shouldPromptReview, requestReview } from '../lib/storeReview';
import { workoutDayMs } from '../lib/workoutDate';
import { localWeekStartMs } from '../lib/dayKey';
import { formatNumber, formatWithUnit } from '../lib/format';
import { navigateCrossTab } from '../navigation/navigateCrossTab';
import { logError } from '../lib/errorLog';
import { touchTarget } from '../styles/layout';

// COMP-008: soreness, energy and sleep moved to the pre-workout intent prompt
// (captured where they are accurate). The post-workout block keeps only the
// three session-response ratings plus fatigue.
const RATING_LABELS = {
  sessionDifficulty: ['', 'Very Easy', 'Easy', 'Moderate', 'Hard', 'Brutal'],
  overallPump: ['', 'None', 'Mild', 'Good'],
  fatigueLevel: ['', 'Fresh', 'Mild', 'Moderate', 'High', 'Exhausted'],
  jointDiscomfort: ['None', 'Slight', 'Moderate', 'Significant'],
};

/**
 * CC33 W3 (D112 R5, closes audit T2-07/T2-22): the post-workout quiet line
 * naming what a temporary capability change worked around this session.
 * Pure - counts come straight from the session's session_constraint_effects
 * record (written at serve time and on completion), never from the
 * name-resolved detail list below it, so the top line always renders once
 * the record itself resolves even if a particular exercise's name does not
 * (the detail list's own "never fall back to the raw id" rule is scoped to
 * ITS rows, not this count).
 */
function buildConstraintSummaryLine(substituted, omitted, userChosen = 0) {
  if (substituted > 0 && omitted > 0) {
    return `Today worked around your temporary change: ${substituted} swapped, ${omitted} left out.`;
  }
  if (substituted > 0) {
    // Round 11 (R11-1): when any swapped slot holds the USER's own pick
    // (toChosenByUser), "for one that works right now" would attribute
    // their choice to the app - the neutral sentence states the count
    // and the detail lines below say whose pick each one was.
    if (userChosen > 0) {
      return `Today worked around your temporary change: ${substituted} exercise${substituted === 1 ? '' : 's'} swapped.`;
    }
    return `Today worked around your temporary change: ${substituted} exercise${substituted === 1 ? '' : 's'} swapped for ${substituted === 1 ? 'one that works' : 'ones that work'} right now.`;
  }
  if (omitted > 0) {
    return `Today worked around your temporary change: ${omitted} exercise${omitted === 1 ? '' : 's'} left out, with nothing forced in their place.`;
  }
  return null;
}


function RatingRow({ label, field, value, max, onChange, hint }) {
  // CP-10 stage 3 (theming FINAL batch): live theme (src/hooks/useTheme.js).
  // See buildLiveStyles' header comment (defined further down this
  // file, after the frozen `styles` block -- see the comment there for why).
  const t = useTheme();
  const live = buildLiveStyles(t);
  const labels = RATING_LABELS[field];
  const values = field === 'jointDiscomfort'
    ? [0, 1, 2, 3]
    : Array.from({ length: max }, (_, i) => i + 1);
  return (
    <View style={styles.ratingRow}>
      <View style={styles.ratingLabelRow}>
        <Text style={[styles.ratingLabel, live.ratingLabel]}>{label}</Text>
        {labels?.[value] ? <Text style={[styles.ratingValueLabel, live.ratingValueLabel]}>{labels[value]}</Text> : null}
      </View>
      {hint ? <Text style={[styles.ratingHint, live.ratingHint]}>{hint}</Text> : null}
      <View style={styles.ratingBtns} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {values.map((i) => (
          <TouchableOpacity
            key={i}
            style={[styles.ratingBtn, live.ratingBtn, value === i && [styles.ratingBtnActive, live.ratingBtnActive]]}
            onPress={() => onChange(i)}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            accessibilityRole="radio"
            accessibilityState={{ selected: value === i }}
            accessibilityLabel={labels?.[i] ? `${i}, ${labels[i]}` : String(i)}
          >
            <Text style={[styles.ratingBtnText, live.ratingBtnText, value === i && [styles.ratingBtnTextActive, live.ratingBtnTextActive]]}>
              {i}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

export default function WorkoutSummaryScreen({ navigation, route }) {
  const {
    workoutId, durationMinutes, exerciseCount, setCount, workingSetCount, tonnage,
    exerciseNames = [], readOnly = false,
    routineId = null, routineName: passedRoutineName = null,
    detectedPRs = [], exerciseData = [],
    startedAt = null, endedAt = null,
    // COMP-015: the session's nonzero adjustments, passed from the finish flow
    // ([{ muscle, setDelta }]). Live path only; history (readOnly) has none.
    sessionAdjustments = [],
  } = route.params || {};
  // F7: subscribe to just these fields (a bare useAppStore() re-renders on every store mutation).
  const { user, units, userProfile, session, hasUnseenCoachChange } = useAppStore(useShallow(s => ({
    user: s.user,
    units: s.units,
    userProfile: s.userProfile,
    session: s.session,
    // CO-3 (cohesion audit 2026-07-09): the SAME unseen-coach-change signal
    // that drives the Coach-tab icon badge (T2), reused here so the summary
    // only ever links to Coach when there's a genuinely relevant, fresh
    // review to see, never a generic upsell.
    hasUnseenCoachChange: s.hasUnseenCoachChange,
  })));
  // CP-10 stage 3 (theming FINAL batch): live theme (src/hooks/useTheme.js).
  // See buildLiveStyles' header comment (defined further down this
  // file, after the frozen `styles` block -- see the comment there for why).
  const t = useTheme();
  const live = buildLiveStyles(t);
  const toast = useToast();
  // Renamed to feedbackSheet to avoid clashing with the per-set
  // feedback state below (sessionDifficulty, overallPump, etc.).
  // Both live in the same scope, JS doesn't let two consts share a
  // name in the same block.
  const feedbackSheet = useFeedback();
  const [feedback, setFeedback] = useState({
    sessionDifficulty: 3,
    overallPump: 2,
    fatigueLevel: 2,
    jointDiscomfort: 0,
  });
  // Campaign 1 P0-7 D9 (root cause): the summary used to WRITE these
  // defaults to the workout row on mount - an unanswered form became an
  // explicit "no joint discomfort / moderate session" in the database,
  // defeating the joint hold and admitting the row as deload evidence.
  // Only fields the user actually touches are written now, and the
  // adaptive engine only runs on a rated session (D7).
  const feedbackDirtyRef = useRef(new Set());
  const notesDirtyRef = useRef(false);
  // Campaign 1 review blocker 1: the set of fields carrying a REAL answer
  // (touched this visit, or stored from a previous one). The engine
  // mapping passes null for anything not in this set, so a default can
  // never masquerade as a rating.
  const realFieldsRef = useRef(new Set());
  const [feedbackTouched, setFeedbackTouched] = useState(false);
  const rateFeedback = (field) => (v) => {
    feedbackDirtyRef.current.add(field);
    realFieldsRef.current.add(field);
    setFeedbackTouched(true);
    setFeedback((f) => ({ ...f, [field]: v }));
  };
  // COMP-008: soreness and sleep are now captured before the session and live
  // on the workout row. The summary reads them back so the adaptive engine
  // still gets a soreness input and the weekly recovery record still receives a
  // sleep value, both sourced from the more accurate pre-workout capture.
  const [preWorkoutReadiness, setPreWorkoutReadiness] = useState({
    soreness24hBefore: null,
    sleepQuality: null,
  });
  const [notes, setNotes] = useState('');
  const [nextTimeNote, setNextTimeNote] = useState('');
  // The day's name (e.g. "Back + Delts (Width)") for the share card title.
  // The live finish flow arrives with routineId but not the name, so the
  // effect below fetches it; the history route now passes the name it
  // already holds, which seeds this so the title is right on first paint
  // rather than after a round trip (founder device report 2026-08-24).
  const [routineName, setRoutineName] = useState(passedRoutineName || '');
  const [weeklyVolume, setWeeklyVolume] = useState({});
  const [excludedVolume, setExcludedVolume] = useState({});
  // C5-P16-01 (D96): how far through the session's own week this is, so the
  // volume card can state a week in progress instead of delivering a
  // finished-week verdict after session one.
  const [weekProgress, setWeekProgress] = useState({ logged: 0, planned: null, inProgress: false });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [completedWorkoutCount, setCompletedWorkoutCount] = useState(null);
  // COMP-013: the calibrated first-session acknowledgement, shown only on the
  // live summary of a user's very first completed session. null = not the first
  // session, or suppressed under calmer experience / an open ED pattern flag
  // (the header's neutral "Workout complete" is acknowledgement enough; no push).
  const [firstSessionLine, setFirstSessionLine] = useState(null);
  // D1 (int-04 F1): the beginner early-win ladder. The single milestone rung
  // crossed by this session (first_week, 5/10/25/50/100 sessions), or null.
  // Claimed once per rung from local workout rows; inherits the same calm/ED
  // suppression as firstSessionLine. PRs are owned by PRCelebration and the
  // first session by COMP-013, so neither double-celebrates here.
  const [milestone, setMilestone] = useState(null);
  // D2: the gold particle burst for the big rungs (50/100 sessions).
  const [milestoneBurst, setMilestoneBurst] = useState(false);
  // D2: calm-mode / open-ED suppression flag for the peak-surface celebratory
  // cards (the programme-arc strip + the phase-completion card). Set once from
  // the shared wellbeing read in loadVolumeAndHistory.
  const [calmSuppressed, setCalmSuppressed] = useState(false);
  // Keep the completion state calm: the workout is done, and the primary
  // actions must be visible immediately. These optional answers still feed the
  // coaching loop, but only open when the lifter deliberately rates the session.
  const [feedbackExpanded, setFeedbackExpanded] = useState(false);
  const [expandedVolumeWhy, setExpandedVolumeWhy] = useState(null);
  const [adaptiveDecisions, setAdaptiveDecisions] = useState({});
  const [readOnlyExerciseData, setReadOnlyExerciseData] = useState([]);
  // D90 #3 (2026-08-06): the ONE landmark precedence (manual > adapted(Pro)
  // > research) resolved once per load; both getVolumeStatus call sites and
  // the tooltip copy read it. { table, source } from effectiveLandmarks.js.
  const [landmarkResolution, setLandmarkResolution] = useState(null);
  const [templateModalVisible, setTemplateModalVisible] = useState(false);
  const [templateName, setTemplateName] = useState('');

  // 4-week comparison: how does this session stack up against the same
  // routine over the last 4 weeks? null while loading or when there's no
  // routine / no prior history to compare to (a one-off session is also
  // an "n/a" case).
  const [comparison, setComparison] = useState(null);
  // C5-P16-02 (D96): the next planned session in the plan's rotation.
  const [nextSessionName, setNextSessionName] = useState('');

  // CC33 W3 (D112 R5, closes audit T2-07/T2-22): the post-workout quiet
  // line naming what a temporary capability change worked around this
  // session, and the "What changed" expand state for its detail list.
  // null = nothing to say (no record, a read failure, or a record with no
  // resolvable entries) - the line and the expander both render nothing.
  const [constraintEffect, setConstraintEffect] = useState(null);
  const [constraintDetailExpanded, setConstraintDetailExpanded] = useState(false);

  const feedbackDebounceRef = useRef(null);

  useEffect(() => {
    if (!readOnly && routineId && user?.id) {
      (async () => {
        try {
          const activePlan = await getActivePlan(user.id);
          if (activePlan) {
            const planRoutines = await getRoutinesForPlan(activePlan.id);
            const idx = planRoutines.findIndex(r => r.id === routineId);
            if (idx >= 0) {
              // C18 BLOCK PROGRESSION. The blind increment that used to live
              // here is GONE. `advancePlanNextWorkout` moved
              // `next_workout_index` on by one whatever routine had just been
              // finished, so an athlete whose next required session was Legs,
              // who trained Push & Arms instead, had the pointer moved PAST
              // Legs - never performed, never marked anything, simply consumed
              // by a counter.
              //
              // Completing a workout now resolves the instance that was
              // ACTUALLY performed, because the completed workout row IS the
              // completion evidence and carries its own (mesocycle_week_id,
              // routine_id). Nothing needs to be advanced, and out-of-order
              // training cannot consume anything.
              // C5-P16-02 (D96): what happens next. Unchanged in intent, but
              // it now asks the authoritative resolver rather than assuming
              // the rotation moved on - so after an out-of-order session it
              // names the workout that is genuinely still outstanding.
              // eslint-disable-next-line global-require
              const { resolveNextSession } = require('../lib/programmePosition');
              // eslint-disable-next-line global-require
              const { sessionDisplayName } = require('../lib/blockProgression');
              const nextSession = await resolveNextSession(user.id).catch(() => null);
              if (nextSession?.name) {
                // eslint-disable-next-line global-require
                const { resolveProgrammePosition } = require('../lib/programmePosition');
                const pos = await resolveProgrammePosition(user.id).catch(() => null);
                setNextSessionName(sessionDisplayName(nextSession, pos?.sessions ?? []));
              }
            }
          }
        } catch (_e) {}
      })();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadVolumeAndHistory();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load the routine/day name so the share card can title the session with the
  // real workout name rather than a join of the first two exercise names.
  useEffect(() => {
    let cancelled = false;
    if (!routineId) return undefined;
    (async () => {
      try {
        const r = await getRoutineById(routineId);
        if (!cancelled && r?.name) setRoutineName(r.name);
      } catch (_e) { /* fall back to the exercise-name title */ }
    })();
    return () => { cancelled = true; };
  }, [routineId]);

  // CC33 W3 (D112 R5, closes audit T2-07/T2-22): read the session's durable
  // constraint-effects record (written by sessionEffective.js at serve time
  // and by ActiveWorkoutScreen on removal/completion) and resolve each
  // entry's names against the library. Runs for BOTH the live finish flow
  // and a history reopen (this screen is reachable from history too - no
  // separate history work needed), keyed only on workoutId + userId.
  // Best-effort throughout: any read failure leaves constraintEffect null,
  // so nothing renders - no crash, no error line.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!user?.id || !workoutId) return;
        const record = await getSessionConstraintEffect(user.id, workoutId);
        const effects = record?.effects;
        if (!Array.isArray(effects) || !effects.length) return;
        const library = await getAllExercises();
        const byId = new Map(library.map((e) => [e.id, e]));
        let substituted = 0;
        let omitted = 0;
        let userChosen = 0;
        const lines = [];
        effects.forEach((entry, i) => {
          if (entry?.effect === 'substituted') {
            substituted += 1;
            if (entry.toChosenByUser) userChosen += 1;
            const fromName = byId.get(entry.exerciseFrom)?.name;
            const toName = entry.exerciseTo ? byId.get(entry.exerciseTo)?.name : null;
            // Never fall back to the raw id: a name that doesn't resolve
            // simply omits its detail line (the summary count above is
            // unaffected - it counts the record's entries, not this list).
            // Round 11 (R11-1): an amended entry names the USER's pick,
            // so its line says whose choice stood - the app's wording on
            // the user's own swap was the round-11 C2/B8 break.
            if (fromName && toName) {
              lines.push({
                key: `s-${i}-${entry.exerciseFrom}`,
                text: entry.toChosenByUser ? `You chose ${toName} in for ${fromName}` : `${toName} in for ${fromName}`,
              });
            }
          } else if (entry?.effect === 'omitted') {
            omitted += 1;
            const fromName = byId.get(entry.exerciseFrom)?.name;
            if (fromName) {
              lines.push({ key: `o-${i}-${entry.exerciseFrom}`, text: `${fromName} left out` });
            }
          }
        });
        if (cancelled) return;
        if (!substituted && !omitted) return;
        setConstraintEffect({ substituted, omitted, userChosen, lines });
      } catch (_e) { /* best-effort: no line, no crash */ }
    })();
    return () => { cancelled = true; };
  }, [user?.id, workoutId]);

  // Contextual feedback prompt, fires ONCE after the user has
  // completed their first ~3 sessions. Suppressed thereafter via
  // the @volyume_feedback_prompt_history_v1 store. Never fires in
  // read-only mode (viewing old history).
  useEffect(() => {
    if (readOnly || !feedbackSheet) return;
    const totalDone = completedWorkoutCount ?? 0;
    // Trigger windows: after session 1 (the "is this for you?" beat)
    // and after session 10 (the "still working?" beat). Both gated
    // by the 14-day suppression in feedback.js.
    let triggerKey = null;
    if (totalDone === 1) triggerKey = 'first_workout_summary';
    else if (totalDone === 10) triggerKey = 'tenth_workout_summary';
    if (!triggerKey) return;
    // Show the sheet a beat after the screen settles so the user
    // has registered the summary before we ask. 1.4s feels natural
    //, long enough to read the headline, short enough to not feel
    // detached from the completion moment.
    const t = setTimeout(async () => {
      const ok = await shouldPrompt(triggerKey).catch(() => false);
      if (!ok) return;
      feedbackSheet.open({
        trigger: 'contextual',
        triggerKey,
      });
    }, 1400);
    return () => clearTimeout(t);
  }, [readOnly, completedWorkoutCount, feedbackSheet]);

  // 4-week comparison against prior sessions of the SAME routine. Skipped
  // for one-off sessions (no routineId) and for read-only history views
  // where the "current" workout already lives in the dataset and the
  // ranking would double-count.
  useEffect(() => {
    if (readOnly || !routineId || !user?.id) return;
    const since = Date.now() - 28 * 24 * 60 * 60 * 1000; // 4 weeks
    getRoutineWorkoutTonnages(user.id, routineId, since, workoutId)
      .then(prior => {
        if (!prior.length) {
          setComparison({ verdict: 'first', priorCount: 0 });
          return;
        }
        const tonnages = prior.map(p => p.tonnage || 0).filter(t => t > 0);
        if (!tonnages.length) {
          setComparison({ verdict: 'first', priorCount: 0 });
          return;
        }
        const avg = tonnages.reduce((a, b) => a + b, 0) / tonnages.length;
        const current = tonnage || 0;
        const pct = avg > 0 ? Math.round(((current - avg) / avg) * 100) : 0;
        // Rank: position of `current` if inserted into sorted list (desc).
        // 1 = top of the window. of = total sessions inc. current.
        const allSorted = [...tonnages, current].sort((a, b) => b - a);
        const position = allSorted.indexOf(current) + 1;
        const total = allSorted.length;
        let verdict;
        if (position === 1) verdict = 'best';
        else if (pct >= 10) verdict = 'up';
        else if (pct <= -10) verdict = 'down';
        else verdict = 'on_pace';
        setComparison({ verdict, pct, position, total, priorCount: tonnages.length, avgTonnage: Math.round(avg) });
      })
      .catch(() => setComparison(null));
  }, [readOnly, routineId, user?.id, workoutId, tonnage]);

  // COMP-008: pull the pre-workout soreness + sleep off the workout row so the
  // engine and the weekly sleep write read the concurrent capture rather than a
  // post-session rating. A Skip-started (or pre-COMP-008) session leaves these
  // null, which both readers already treat as a neutral default.
  useEffect(() => {
    if (readOnly || !workoutId) return;
    let cancelled = false;
    (async () => {
      try {
        const w = await getWorkoutById(workoutId);
        if (!cancelled && w) {
          setPreWorkoutReadiness({
            soreness24hBefore: w.soreness24hBefore ?? null,
            sleepQuality: w.sleepQuality ?? null,
          });
          // Campaign 1 P0-7 D9: prefill stored ratings so a re-open shows
          // (and re-writes) the user's real answers rather than clobbering
          // them with defaults. Prefill never marks fields dirty; stored
          // ratings DO count as a rated session for the engine gate.
          // (Rows written by pre-fix builds may carry the old stamped
          // defaults; those are indistinguishable from real answers and
          // prefill as-is - unrecoverable legacy, documented in D92.)
          const stored = {};
          if (w.sessionDifficulty != null) stored.sessionDifficulty = w.sessionDifficulty;
          if (w.overallPump != null) stored.overallPump = w.overallPump;
          if (w.jointDiscomfort != null) stored.jointDiscomfort = w.jointDiscomfort;
          if (w.fatigueLevel != null) stored.fatigueLevel = w.fatigueLevel;
          if (Object.keys(stored).length) {
            setFeedback((f) => ({ ...f, ...stored }));
            for (const k of Object.keys(stored)) realFieldsRef.current.add(k);
            setFeedbackTouched(true);
          }
        }
      } catch (_e) {}
    })();
    return () => { cancelled = true; };
  }, [readOnly, workoutId]);

  // COMP-005: block-end recap. When the session just finished sits in the final
  // planned week of the active mesocycle, offer the block story in-flow (no
  // push needed, the user is right here). Heuristic detection: there is no
  // status='completed' writer, so the final-week reached (weekIndex >=
  // plannedWeeks) is the signal, tolerant of training past the planned end.
  const [blockStory, setBlockStory] = useState(null);
  // D2: the current mesocycle week, for the "Week N of M" programme-arc strip.
  const [mesoWeek, setMesoWeek] = useState(null);
  useEffect(() => {
    if (readOnly || !user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const wk = await getCurrentMesocycleWeek(user.id);
        if (cancelled || !wk) return;
        setMesoWeek(wk);
        // FB-03 (D96): "Block finished. 6 weeks completed, including your
        // recovery week." used to fire on `weekIndex >= plannedWeeks &&
        // !awaitingDecision`, which is precisely the recovery week ITSELF,
        // not the state after it -- so a user training four days in their
        // recovery week saw it four times, the first on day 35 with five
        // days of the block still to run. The state that genuinely means
        // finished is awaitingDecision, and the in-file comment already
        // said the intent was to celebrate it ONCE, so a seen key makes
        // that true. The block story route and share artefact are
        // untouched.
        if (wk.mesocycleId && wk.awaitingDecision) {
          const seenKey = `@volyume_block_finished_seen_${wk.mesocycleId}`;
          const seen = await AsyncStorage.getItem(seenKey).catch(() => null);
          if (cancelled) return;
          if (!seen) {
            await AsyncStorage.setItem(seenKey, 'true').catch(() => {});
            if (cancelled) return;
            setBlockStory({ mesocycleId: wk.mesocycleId, name: wk.mesoName });
          }
        }
      } catch (_e) {}
    })();
    return () => { cancelled = true; };
  }, [readOnly, user?.id]);

  useEffect(() => {
    // Campaign 1 P0-7 D7: the engine only runs on a RATED session. The
    // untouched form's defaults used to land exactly on under_stimulus
    // (+2 sets) and were persisted as an adaptation event - a volume
    // increase recommended from feedback the user never gave.
    if (!feedbackTouched) {
      setAdaptiveDecisions({});
      return;
    }
    // Map feedback to adaptive engine scales per muscle, then run adaptive engine
    // soreness24hBefore: 1=fresh→2, 2=mild→3, 3=sore→4 (now sourced pre-workout)
    // sessionDifficulty: 1=veryEasy→1(exceeded), 2=easy→1, 3=moderate→2(met), 4=hard→3(struggled), 5=brutal→4(failed)
    // overallPump: 1=none→1, 2=mild→2, 3=good→4
    // jointDiscomfort: 0=none→0, 1=slight→1, 2=moderate→2, 3=significant→3
    // Campaign 1 review blocker 1: unanswered maps to NULL, never to a
    // default rating - the engine holds on missing required signals.
    const soreness = preWorkoutReadiness.soreness24hBefore == null
      ? null
      : ([0, 2, 3, 4][preWorkoutReadiness.soreness24hBefore - 1] ?? null);
    const performance = realFieldsRef.current.has('sessionDifficulty')
      ? ([0, 1, 1, 2, 3, 4][feedback.sessionDifficulty] ?? null)
      : null;
    const pump = realFieldsRef.current.has('overallPump')
      ? ([1, 1, 2, 4][feedback.overallPump - 1] ?? null)
      : null;
    const joint = realFieldsRef.current.has('jointDiscomfort')
      ? (feedback.jointDiscomfort ?? 0)
      : 0;

    // Build per-muscle feedback using the weekly volume
    const muscleFeedback = {};
    for (const [muscle, volData] of Object.entries(weeklyVolume)) {
      const { mev = 6, mav = 14, mrv = 22 } = (typeof getVolumeStatus === 'function'
        ? (getVolumeStatus(volData.workingSets, muscle, landmarkResolution?.table)?.landmarks || {})
        : {});
      muscleFeedback[muscle] = {
        soreness,
        performance,
        pump,
        joint,
        currentSets: volData.workingSets,
        mev,
        mav,
        mrv,
      };
    }
    const decisions = runAdaptiveEngine(muscleFeedback);
    setAdaptiveDecisions(decisions);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedback, weeklyVolume, preWorkoutReadiness, feedbackTouched]);

  useEffect(() => {
    if (!workoutId || readOnly) return;
    // Campaign 1 P0-7 D9: write ONLY what the user touched. The old
    // unconditional payload stamped the default ratings onto the row on
    // mount, turning "unanswered" into explicit negative evidence
    // (joint_discomfort = 0 etc.). updateWorkout is a preserving partial
    // writer, so undefined fields are left alone.
    if (feedbackDirtyRef.current.size === 0 && !notesDirtyRef.current) return;
    if (feedbackDebounceRef.current) clearTimeout(feedbackDebounceRef.current);
    feedbackDebounceRef.current = setTimeout(async () => {
      try {
        const patch = {};
        for (const field of feedbackDirtyRef.current) patch[field] = feedback[field];
        // COMP-008: soreness_24h_before is written pre-session by
        // createWorkout; the summary no longer rates or writes it, so it
        // must not be sent here or it would clobber the pre-workout value.
        if (notesDirtyRef.current) patch.notes = notes || null;
        await updateWorkout(workoutId, patch);
      } catch (_e) {}
    }, 1000);
    return () => {
      if (feedbackDebounceRef.current) clearTimeout(feedbackDebounceRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedback, notes]);

  async function loadVolumeAndHistory() {
    if (!user?.id) return;
    // O16 (comprehension-trust audit 2026-08-06): "This week's volume" used a
    // rolling trailing-7-days window from the moment of viewing; every other
    // weekly surface (and this screen's own sleep check-in write) anchors to
    // the Monday-start local week. Anchored to the SESSION's week, bounded
    // both ends, so a history reopen shows that week's totals rather than a
    // window trailing from today.
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const sessionWeekStart = localWeekStartMs(workoutDayMs({ startedAt, endedAt }));
    const sessionWeekEnd = sessionWeekStart + weekMs;
    const [allSets, allExercises, allWorkouts] = await Promise.all([
      getCompletedWorkoutSets(user.id),
      getAllExercises(),
      getAllWorkouts(user.id),
    ]);
    const resolved = await getEffectiveLandmarks(user.id).catch(() => null);
    setLandmarkResolution(resolved);
    const recentSets = allSets.filter(s => s.createdAt >= sessionWeekStart && s.createdAt < sessionWeekEnd);
    const exerciseMap = Object.fromEntries(allExercises.map(e => [e.id, e]));
    const volume = calculateWeeklyVolume(recentSets, exerciseMap);
    setWeeklyVolume(volume);
    // Final pass S4 (certification 2026-09-05, same law as F-12): the volume
    // read drops explosive (ballistic) sets, so a muscle trained partly
    // through swings must not be told to add sets for work it has done.
    // The excluded read is the same inputs, counting only what was dropped.
    setExcludedVolume(calculateExcludedWeeklyVolume(recentSets, exerciseMap));

    // C5-P16-01 (D96): is this week finished, or still in progress?
    //
    // The window above is correct and deliberate (the session's own week to
    // date), but one session's sets were then judged against a FULL week's
    // landmarks, so after session 1 of a 4-session week every muscle read
    // "Below target · below the minimum for growth" and the explanation
    // told the user to add sets next week -- sets their plan already covers
    // on Wednesday and Friday. The card contradicted the app's own
    // prescription at the most trust-sensitive moment in the product.
    // getVolumeStatus, the landmarks and the colours are untouched; only
    // the advice waits until the week can actually be judged.
    const sessionsThisWeek = allWorkouts.filter(w => w.isCompleted
      && workoutDayMs({ startedAt: w.startedAt, endedAt: w.endedAt }) >= sessionWeekStart
      && workoutDayMs({ startedAt: w.startedAt, endedAt: w.endedAt }) < sessionWeekEnd).length;
    let plannedSessions = null;
    try {
      const plan = await getActivePlan(user.id);
      if (plan?.id) {
        const planRoutines = await getRoutinesForPlan(plan.id);
        if (planRoutines?.length) plannedSessions = planRoutines.length;
      }
    } catch (_e) { /* best-effort: without it the week reads as complete */ }
    const weekOver = Date.now() >= sessionWeekEnd;
    setWeekProgress({
      logged: sessionsThisWeek,
      planned: plannedSessions,
      // In progress only while the week is still running AND the plan says
      // more sessions are due. A read failure or an unplanned session
      // resolves to "complete", which keeps today's behaviour.
      inProgress: !weekOver && plannedSessions != null && sessionsThisWeek < plannedSessions,
    });

    const fourWeeksAgo = Date.now() - 28 * 24 * 60 * 60 * 1000;
    const completed = allWorkouts.filter(w => w.isCompleted && w.startedAt >= fourWeeksAgo);
    setCompletedWorkoutCount(completed.length);

    // COMP-013 + D1: the first-session line and the early-win milestone ladder
    // share one wellbeing read. Live summary only (never the read-only history
    // view). The just-finished workout is already marked complete by the time
    // this runs, so it is counted here.
    if (!readOnly) {
      const completedWorkouts = allWorkouts.filter(w => w.isCompleted);
      const totalCompleted = completedWorkouts.length;
      // Calm-mode / open-ED flag suppress BOTH surfaces. When suppressed we
      // skip the milestone claim entirely, so a rung crossed during a wellbeing
      // hold is caught and shown later rather than silently consumed.
      let calm = false;
      let edFlag = null;
      try {
        // Fail CLOSED: read the raw wellbeing flag rather than the memoised
        // getWellbeingMode() helper (which swallows storage errors down to
        // 'unspecified'). A genuine read failure here must suppress, not
        // silently fall through to an unsuppressed surface.
        const [mode, flag] = await Promise.all([
          AsyncStorage.getItem(WELLBEING_KEY).then((v) => v || 'unspecified').catch(() => 'read_failed'),
          user?.id ? getOpenEdPatternFlag(user.id).catch(() => 'read_failed') : Promise.resolve(null),
        ]);
        calm = isCalm(mode) || mode === 'read_failed';
        edFlag = flag;
      } catch (_) {}
      const suppressed = calm || !!edFlag;
      setCalmSuppressed(suppressed);

      // COMP-013: first completed session ever → the calibrated acknowledgement.
      if (totalCompleted === 1) {
        setFirstSessionLine(suppressed ? null : "Your first workout is done, and that's the hard part over.");
      }

      // D1: claim the early-win milestone for this session. Skipped on the very
      // first session (COMP-013 owns that beat) and whenever suppressed. PRs are
      // owned by PRCelebration, so everHitPR is held false here, first_pr never
      // fires a second celebration on top of the PR burst.
      if (!suppressed && totalCompleted > 1 && user?.id) {
        try {
          const sessionDaysMs = completedWorkouts
            .map(w => w.startedAt)
            .filter(Number.isFinite);
          const shown = await claimMilestones(user.id, {
            sessionCount: totalCompleted,
            sessionDaysMs,
            everHitPR: false,
          });
          if (shown) {
            setMilestone(shown);
            // D2 (design audit 03 win #4): scale the payoff to the rung. The
            // big rungs (50/100 sessions) earn the gold particle burst and the
            // celebration haptic ladder; the earlier rungs keep the quiet
            // tick. Same calm/ED suppression as the card (this branch), and
            // the burst itself renders nothing under reduce-motion.
            if (shown.key === 'sessions_50' || shown.key === 'sessions_100') {
              setMilestoneBurst(true);
              hapticMilestone();
            } else {
              hapticSelection();
            }
          }
        } catch (_) {}
      }
    }

    // For readOnly (history) view, load and group sets by exercise
    if (readOnly && workoutId) {
      try {
        const { getWorkoutSetsForWorkout } = await import('../lib/database');
        const wSets = await getWorkoutSetsForWorkout(workoutId);
        const exerciseMap = Object.fromEntries(allExercises.map(e => [e.id, e]));
        const grouped = [];
        const seen = [];
        for (const s of wSets) {
          if (!seen.includes(s.exerciseId)) seen.push(s.exerciseId);
        }
        for (const exId of seen) {
          const ex = exerciseMap[exId];
          if (!ex) continue;
          grouped.push({
            exerciseId: exId,
            name: ex.name,
            loggedSets: wSets
              .filter(s => s.exerciseId === exId)
              .map(s => ({
                weight: s.weight,
                reps: s.actualReps ?? s.actual_reps,
                setType: s.setType ?? s.set_type ?? 'straight',
              })),
          });
        }
        setReadOnlyExerciseData(grouped);
      } catch (_e) {}
    }
  }

  async function handleDone() {
    if (readOnly) {
      navigation.goBack();
      return;
    }
    if (!workoutId) { navigation.popToTop(); return; }
    setSaving(true);
    setSaveError(null);
    if (feedbackDebounceRef.current) clearTimeout(feedbackDebounceRef.current);
    try {
      // C5-P17-01 (D96): Close writes ONLY real answers. Campaign 1 P0-7 D9
      // fixed the autosave so untouched defaults never persist; this path
      // slipped through and stamped every skipped rating as "moderate
      // session, no joint discomfort", which the block ledger then counted
      // as genuine evidence. A field not in realFieldsRef (touched this
      // visit or stored from a previous one) is simply not sent - the
      // preserving updateWorkout leaves it NULL, and the engine's unrated-
      // session gate keeps working as designed.
      // COMP-008: soreness_24h_before is written pre-session by createWorkout;
      // never sent here so the post-workout save can't clobber it.
      const ratings = {};
      for (const k of ['sessionDifficulty', 'overallPump', 'jointDiscomfort', 'fatigueLevel']) {
        if (realFieldsRef.current.has(k)) ratings[k] = feedback[k];
      }
      await updateWorkout(workoutId, {
        ...ratings,
        notes: notes || null,
      });
    } catch (e) {
      logError('WorkoutSummaryScreen.saveWorkoutFeedback', e, { workoutId, userId: user?.id });
      setSaving(false);
      setSaveError('Could not save your session notes and ratings on your device. Try Close again.');
      toast.show('Could not save your session yet. Try Close again.', { variant: 'error' });
      return;
    }

    // Contribute this session's sleep-quality rating to the week's recovery
    // record. This is the ONLY field WorkoutSummary writes to weekly_checkins:
    // sleep_quality is read by CoachReview + the recovery-trend insight, and the
    // weekly coach does NOT read it. Everything else this screen used to write
    // either duplicated a weekly-coach input on a conflicting scale (energy,
    // soreness, training_performance) or is sourced better elsewhere (per-session
    // soreness/fatigue live on the workouts row). The save is preserving, so
    // passing only sleepQuality leaves the user's calorie / steps / cardio /
    // training answers for the week untouched.
    //
    // COMP-008: sleep is now captured pre-session and lives on the workout row,
    // so the value comes from preWorkoutReadiness rather than a post-workout
    // rating. Only write when the lifter actually answered it, passing null
    // would clear a sleep value the weekly check-in (or an earlier session)
    // already set this week, since saveWeeklyCheckin treats explicit null as
    // "clear".
    if (user?.id && preWorkoutReadiness.sleepQuality != null) {
      try {
        await saveWeeklyCheckin(user.id, {
          // FF-006: attribute the sleep-quality rating to the workout's own
          // week, not the wall clock at summary-close time. A late or
          // cross-midnight close used to land it in the wrong weekly bucket.
          // localWeekStartMs is the locked-rule, local Monday-anchored helper.
          weekStart: localWeekStartMs(workoutDayMs({ startedAt, endedAt })),
          sleepQuality: preWorkoutReadiness.sleepQuality,
        });
      } catch (e) {
        logError('WorkoutSummaryScreen.saveSleepQuality', e, { workoutId, userId: user?.id });
      }
    }

    // Write adaptation events for engine decisions. These are an
    // in-session record of how each muscle responded (soreness /
    // performance / pump / joint), surfaced in the Engine Log on the Coach tab.
    //
    // The per-session engine no longer writes NEXT-WEEK planned volume.
    // Founder decision 2026-05-28: the weekly coach owns next-week
    // volume (confirm-then-apply on the coach card), so the per-session
    // engine stays in-session only. Letting both write next week's plan
    // double-counted volume. nextWeekSets is still recorded on the
    // adaptation event as a signal, it just no longer mutates the plan.
    try {
      const currentWeek = await getCurrentMesocycleWeek(user?.id);
      if (currentWeek?.id && Object.keys(adaptiveDecisions).length > 0) {
        for (const [muscle, dec] of Object.entries(adaptiveDecisions)) {
          // Campaign 1 review blocker 1: an insufficient-feedback hold is
          // the absence of evidence, not evidence - it is never persisted
          // as an adaptation event.
          if (dec?.reasonCode === 'insufficient_feedback') continue;
          await createAdaptationEvent({
            mesocycleWeekId: currentWeek.id,
            muscle,
            decision: dec.decision,
            delta: dec.delta,
            reasonCode: dec.reasonCode,
            reasonText: dec.reasonText,
            signals: {
              soreness: dec.soreness ?? null,
              performance: dec.performance ?? null,
              pump: dec.pump ?? null,
              joint: dec.joint ?? null,
              currentSets: dec.currentSets,
              nextWeekSets: dec.nextWeekSets,
            },
          });
        }
      }
    } catch (e) {
      logError('WorkoutSummaryScreen.createAdaptationEvents', e, { workoutId, userId: user?.id });
    }

    // Save "next time" note if the user typed one
    if (user?.id && nextTimeNote.trim()) {
      try {
        await saveNextTimeNote(user.id, { routineId: routineId ?? null, note: nextTimeNote.trim() });
      } catch (e) {
        logError('WorkoutSummaryScreen.saveNextTimeNote', e, { workoutId, userId: user?.id });
      }
    }

    // Background sync to Supabase, fire and forget, never blocks navigation
    const supabaseUserId = session?.user?.id;
    if (supabaseUserId && workoutId) {
      syncWorkout(supabaseUserId, workoutId).catch(() => {});
    }

    // Write the session to Apple Health / Health Connect so the user's
    // weekly activity stays accurate across their health stack. Silent
    // no-op if the user hasn't granted the workout write scope.
    try {
      const endedAt = Date.now();
      const startedAt = endedAt - Math.max(1, durationMinutes || 1) * 60_000;
      // eslint-disable-next-line global-require
      const { writeWorkoutToHealth } = require('../lib/health');
      writeWorkoutToHealth({
        startedAt,
        endedAt,
        tonnageKg: tonnage || 0,
        bodyWeightKg: userProfile?.bodyWeightKg ?? userProfile?.bodyweightKg ?? null,
        notes: exerciseNames?.length ? exerciseNames.slice(0, 4).join(', ') : null,
      }).catch(() => {});
    } catch (_) {}

    // Count the completed session and ask for an App Store / Play Store
    // review once the habit gates pass (sessions + days, see storeReview.js).
    incrementSessionCount().then(() => {
      shouldPromptReview().then(should => { if (should) requestReview(); });
    }).catch(() => {});

    setSaving(false);
    navigation.popToTop();
  }

  function handleShareCard() {
    // WAVE-D-FINDINGS.md IA_DEFECT (:1811, lead ruling item 3): the live
    // path's `exerciseData` route param is never populated for a readOnly
    // (history) open -- WorkoutHistoryScreen's navigate call only supplies
    // `readOnlyExerciseData` (loaded separately, above), which is the SAME
    // shape topSetFromExerciseData expects ([{ name, loggedSets }]), so it
    // is the correct read here rather than a second data load. `detectedPRs`
    // stays at its route-params default ([]) in readOnly, which degrades
    // gracefully (no PR badge on a shared historical session), never a
    // crash -- confirmed in the findings' own analysis of this path. Same
    // fallback pattern already used for the on-screen exercise list (:1369).
    const shareExerciseData = readOnly ? readOnlyExerciseData : exerciseData;
    // Top set across the whole session, heaviest non-warmup set drives the
    // "best lift" highlight on the share card.
    const topSet = topSetFromExerciseData(shareExerciseData);

    // Intensity tier, drives the badge on the share card. Heuristic, but
    // gives a "great workout" flavour without needing a full grading system.
    const sets = workingSetCount ?? setCount ?? 0;
    const ton = tonnage || 0;
    const tier = intensityTier(detectedPRs.length, ton, sets);

    // Title with the real day name (e.g. "Back + Delts (Width)") when we have
    // it. Fall back to a join of the first exercises, then a generic label.
    const sessionName = shareSessionName(routineName, exerciseNames);
    const sessionData = {
      sessionName,
      duration: durationMinutes || 0,
      workingSets: sets,
      exerciseCount: exerciseCount || 0,
      tonnage: ton,
      exercises: exerciseNames,
      prCount: detectedPRs.length,
      topSet,
      intensityTier: tier,
      // R8/M5 (share-card audit 2026-07-27): the session card hard-coded 'kg'
      // for the tonnage hero/stat/top-lift line regardless of the user's
      // chosen gym unit.
      units: units === 'lbs' ? 'lbs' : 'kg',
    };
    const prData = detectedPRs.length > 0 ? detectedPRs[0] : null;
    // Pass every PR from the session so the share card can let the user choose
    // which one to feature (a session can set several); prData stays as the
    // first for back-compat.
    // `workoutId` rides along for Community entry point 7 only: ShareCard's
    // own card build never reads it (social-discovery blueprint section 1).
    navigation.navigate('ShareCard', { sessionData, workoutId, prData, prList: detectedPRs });
  }

  // CO-3: destination for the quiet "See your progress" link. A PR routes
  // straight to that lift's own trend (the most relevant single number to
  // check right now); otherwise the general lift-progress list, since no
  // single exercise is what the volume verdict is about.
  function handleSeeProgress() {
    if (firstPrWithExercise) {
      navigateCrossTab(navigation, 'ProgressTab', 'ExerciseDetail', { exerciseId: firstPrWithExercise.exerciseId });
      return;
    }
    navigateCrossTab(navigation, 'ProgressTab', 'LiftProgress');
  }

  // D2 (decision 4b: share artefacts are FREE): a 2-tap share of the early-win
  // milestone, reusing ShareCard's generic milestone layout. No Pro gate.
  function handleShareMilestone() {
    if (!milestone) return;
    navigation.navigate('ShareCard', {
      milestoneData: {
        eyebrow: 'Milestone',
        title: milestone.title,
        heroValue: milestone.heroValue ?? '',
        heroUnit: milestone.heroUnit ?? '',
        caption: milestone.body,
        date: Date.now(),
      },
    });
  }

  // D2: share the phase-completion (a block finished) as a free artefact.
  function handleShareBlock() {
    if (!blockStory) return;
    const weeks = mesoWeek?.plannedWeeks;
    navigation.navigate('ShareCard', {
      milestoneData: {
        eyebrow: 'Block finished',
        title: blockStory.name || 'Training block finished',
        heroValue: Number.isFinite(weeks) ? String(weeks) : '',
        heroUnit: Number.isFinite(weeks) ? 'weeks trained' : '',
        caption: 'A full training block completed.',
        date: Date.now(),
      },
    });
  }

  function handleSaveAsTemplate() {
    if (!exerciseData.length) {
      // Compliance pass (remediation 2026-07-11, food design standard section 6
      // / checklist 11): a non-destructive "nothing to do here" guard is a calm
      // toast, not a blocking alert. A blocking confirm stays reserved for
      // genuinely destructive actions (there are none on this screen).
      toast.show('Nothing to save from this session.', { variant: 'info' });
      return;
    }
    setTemplateName(exerciseNames.slice(0, 2).join(' & ') || 'My Workout');
    setTemplateModalVisible(true);
  }

  async function confirmSaveTemplate() {
    const name = templateName.trim();
    if (!name) return;
    setTemplateModalVisible(false);
    try {
      const { createWorkoutTemplateFromWorkout } = require('../lib/database');
      await createWorkoutTemplateFromWorkout(user.id, name, exerciseData);
      toast.show(`"${name}" saved to Saved workouts`, { variant: 'success' });
    } catch (_) {
      toast.show('Could not save this workout. Try again.', { variant: 'error' });
    }
  }

  const musclesWorked = Object.keys(weeklyVolume)
    .filter(m => weeklyVolume[m]?.workingSets > 0)
    .sort((a, b) => (weeklyVolume[b]?.workingSets || 0) - (weeklyVolume[a]?.workingSets || 0))
    .slice(0, 6);

  const displayWorkingSets = workingSetCount ?? setCount ?? 0;

  // CO-3 (cohesion audit 2026-07-09, docs/ux-world-class-audit-2026-07-09/
  // cohesion-01-flow-language.md): quiet onward links so workout completion
  // gestures at the rest of the app instead of dead-ending. Live path only,
  // readOnly is a history view where neither signal below is meaningful.
  //
  // Progress: only when this session set a PR (link straight to that lift's
  // own trend) or logged meaningful volume against the 4-week baseline (the
  // 'best'/'up' comparison verdict already computed above for the hero
  // card). Training-only, never a weight/body/intake reference.
  const firstPrWithExercise = detectedPRs.find(pr => pr?.exerciseId) || null;
  const showProgressLink = !readOnly
    && (!!firstPrWithExercise || comparison?.verdict === 'best' || comparison?.verdict === 'up');
  const progressLinkLabel = firstPrWithExercise
    ? `See your progress on ${firstPrWithExercise.exerciseName || firstPrWithExercise.exercise || 'that lift'}`
    : 'See your progress';

  // Coach: only when there is a genuinely relevant state to point at, never
  // a generic upsell.
  const showCoachLink = !readOnly && hasUnseenCoachChange;

  // Photos LOOP-3 (D4): the competence-event id the photo invitation dedupes on.
  // COMPETENCE ONLY — a claimed session/consistency milestone (its stable rung
  // key), else a new PB this session (keyed per workout so it fires at most once
  // per session). Never a weigh-in, bodyweight, body-composition or appearance
  // event. Null on the read-only history view and when no competence win fired,
  // so ProgressPhotoPrompt renders nothing. The prompt re-gates on suppression /
  // opt-out / frequency itself.
  const photoPromptMilestoneId = readOnly
    ? null
    : milestone?.key
      ? `milestone:${milestone.key}`
      : detectedPRs.length > 0
        ? `pb:${workoutId}`
        : null;

  // The session's own day (when it was trained/completed), NOT the moment this
  // screen is opened. Viewing a past workout used to show today's date because
  // this read new Date(); now it reads the workout's ended/started time.
  const completionDate = new Date(workoutDayMs({ startedAt, endedAt })).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  const prExerciseNames = detectedPRs
    .slice(0, 3)
    .map(pr => pr.exerciseName || pr.exercise || '')
    .filter(Boolean)
    .join(', ');

  // Founder ruling 2026-08-23, after "it's oddly saying I only had 1 PR
  // when I had about 10". detectedPRs is bestPRPerExercise's output, so it
  // has always been one entry per LIFT, not one per record: working up
  // through three new bests on the same lift is one entry. Read as "1 new
  // PR" that flatly contradicted the three celebrations the session had
  // just given. The founder's call was to keep the list at one per lift
  // and say what the number actually counts.
  const prLine = detectedPRs.length === 1
    ? `New best on ${prExerciseNames || '1 lift'}`
    : `New bests on ${detectedPRs.length} lifts${prExerciseNames ? ` - ${prExerciseNames}` : ''}`;

  return (
    // R2-5 (remediation 2026-07-11, founder device walk build 2684): edges is
    // ['top'] only, NOT ['top', 'bottom']. This screen always renders INSIDE a
    // tab stack (HomeStack / ProgressStack) with VolyumeTabBar below it, and
    // that band already owns the system bottom inset (it pads by insets.bottom;
    // VolyumeTabBar.js, content-hugging since 2026-07-12). Claiming 'bottom'
    // here made
    // the SafeAreaView add the inset a SECOND time as padding under the sticky
    // footer, which is the ~70dp dead band the founder photographed between the
    // Close/Share footer and the tab bar. Exactly one component owns each system
    // inset: the tab band owns bottom on this screen, so the screen must not.
    // (The inverse case, ActiveWorkout, where the band HIDES, is the one that
    // owns its own bottom inset - bottomBarInset.guard.test.js pins both sides.)
    <SafeAreaView style={[styles.safe, live.safe]} edges={['top']}>
      {readOnly ? <BackHeader title="Workout summary" /> : null}
      <KeyboardGestureArea interpolator="ios" style={{ flex: 1 }}>
      <KeyboardAwareScrollView
        // R2-6 (remediation 2026-07-11): the scroll content's bottom padding is
        // its OWN rhythm (styles.content -> paddingBottom: spacing.xxxl), NOT a
        // footer-height clearance. The sticky footer is a normal-flow SIBLING
        // below this scroll (SafeAreaView -> KeyboardGestureArea{scroll} ->
        // footer), so the scroll never renders UNDER the footer and needs no
        // overlay clearance. The old Math.max(spacing.xxxl, footerHeight + lg)
        // double-reserved that phantom overlay, leaving ~85-100dp of dead space
        // above the buttons at the end of the scroll. KeyboardAwareScrollView
        // manages the keyboard inset itself (bottomOffset), and the footer,
        // being a sibling, can never cover a focused notes field - so the
        // footerHeight measurement plumbing is gone entirely.
        contentContainerStyle={styles.content}
        bottomOffset={24}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.completionHeader}>
          <View style={styles.checkRow}>
            <Ionicons name="checkmark-circle" size={28} color={t.colors.success} />
            <Text style={[styles.completionTitle, live.completionTitle]}>Workout complete</Text>
          </View>
          <Text style={[styles.completionDate, live.completionDate]}>{completionDate}</Text>
          {firstSessionLine ? (
            <Text style={[styles.firstSessionLine, live.firstSessionLine]}>{firstSessionLine}</Text>
          ) : null}
        </View>

        {/* D1 (int-04 F1): the early-win milestone card, the celebratory beat
            for a beginner crossing first week / 5 / 10 / 25 / 50 / 100 sessions.
            Sits at the top emotional peak, only rendered on the rare session a
            rung is crossed (and never under calm/ED). Calm in tone, not loud. */}
        {milestone ? (
          <RevealSection delay={120}>
            <Card tone="gold" style={styles.milestoneCard}>
              <View style={[styles.milestoneIconWrap, live.milestoneIconWrap]}>
                <Ionicons name={milestone.icon} size={22} color={t.colors.gold} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.milestoneTitle, live.milestoneTitle]}>{milestone.title}</Text>
                <Text style={[styles.milestoneBody, live.milestoneBody]}>{milestone.body}</Text>
              </View>
              <TouchableOpacity
                style={[styles.milestoneShareBtn, live.milestoneShareBtn]}
                onPress={handleShareMilestone}
                accessibilityRole="button"
                accessibilityLabel="Share this milestone"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="share-social-outline" size={18} color={t.colors.gold} />
              </TouchableOpacity>
            </Card>
          </RevealSection>
        ) : null}

        {/* D3 (design audit 03): tonnage is THE headline. One elevated hero
            card carrying the display-size animated counter, with the 4-week
            comparison verdict fused into it; the remaining three stats step
            down to a compact row below. The hero is the screen's single
            amber object (the numeral); everything else is neutral or tint. */}
        <Card elevated padding="xl" style={styles.heroCard}>
          <StatBox
            hero
            // WAVE-A-FINDINGS.md UNIT_DEFECT (:1220-1226): hard-coded 'kg'
            // regardless of the store's units, mislabelling an lbs user's
            // total. Matches the already-fixed ShareCard sibling (R8/M5,
            // :936: `units === 'lbs' ? 'lbs' : 'kg'`).
            value={formatWithUnit(formatNumber(Math.round(tonnage || 0)), units === 'lbs' ? 'lbs' : 'kg')}
            label="Total lifted"
            tooltip={'Total weight moved this session: sets x reps x weight added together. A rough measure of how much work you did. More is not always better; quality of effort matters more than raw numbers.'}
          />
          {/* 4-week comparison verdict, fused into the hero so "your number"
              and "how it compares" read as one statement. Renders once we
              have either a prior session to compare against, or the 'first'
              verdict (no prior session at all - lead ruling: a session with
              nothing to compare against still deserves an honest line about
              what was saved, rather than silence). The 'first' line alone is
              suppressed under calm mode / an open ED flag, exactly like
              firstSessionLine; the established comparison verdicts keep their
              existing behaviour. Comparison itself is never computed in
              readOnly mode, so this is already live-summary-only. */}
          {comparison && (comparison.priorCount > 0 || (comparison.verdict === 'first' && !calmSuppressed)) && (() => {
            const { verdict, pct, position, total, priorCount } = comparison;
            let headline, sub, accent;
            if (verdict === 'first') {
              headline = 'First time on this session';
              sub = 'Every set is saved. Next time, these numbers show as Last session while you lift.';
              accent = t.colors.textPrimary;
            } else if (verdict === 'best') {
              headline = `Strongest workout in 4 weeks`;
              sub = `Top of ${total} sessions logged for this routine.`;
              accent = t.colors.gold;
            } else if (verdict === 'up') {
              headline = `${pct >= 0 ? '+' : ''}${pct}% vs your 4-week average`;
              sub = `Position ${position} of ${total} sessions in the window.`;
              accent = t.colors.success;
            } else if (verdict === 'down') {
              headline = `${pct}% vs your 4-week average`;
              sub = `Sessions vary with recovery, sleep and stress. The 4-week trend carries more signal than any single session.`;
              accent = t.colors.textSecondary;
            } else {
              headline = `On pace with your last ${priorCount} session${priorCount !== 1 ? 's' : ''}`;
              sub = 'Within about 10% of your 4-week average. Consistency is the goal.';
              // Neutral, not amber: the hero numeral is this screen's one
              // amber object (design audit 03 amber-inflation rule).
              accent = t.colors.textPrimary;
            }
            return (
              <View style={[styles.verdictRow, live.verdictRow]}>
                <Ionicons
                  name={verdict === 'best' ? 'trophy-outline' : verdict === 'up' ? 'trending-up-outline' : verdict === 'down' ? 'trending-down-outline' : 'analytics-outline'}
                  size={16}
                  color={accent}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.verdictHeadline, live.verdictHeadline, { color: accent }]}>{headline}</Text>
                  <Text style={[styles.verdictSub, live.verdictSub]}>{sub}</Text>
                </View>
              </View>
            );
          })()}
        </Card>

        <View style={styles.statsGrid}>
          <StatBox icon="barbell-outline" value={String(exerciseCount || 0)} label="Exercises" animateOrder={0} />
          <StatBox
            icon="layers-outline"
            value={String(displayWorkingSets)}
            label="Working sets"
            tooltip={'The sets counted in your weekly totals. Warm-ups are left out; every other logged set counts, however it felt.'}
            animateOrder={1}
          />
          <StatBox icon="time-outline" value={`${durationMinutes || 0} min`} label="Duration" animateOrder={2} />
        </View>

        {/* Community entry point 6 (social-discovery blueprint section 1):
            where the retired Partners "share with your partner" beat used
            to sit, because
            this is the moment a session is worth telling someone about.
            Always shown: CommunityCompose routes to Join first when there is
            no profile yet. The read-only re-open of an old summary is not a
            posting moment, so it is the one state without it. */}
        {!readOnly && workoutId ? (
          <RevealSection delay={1140}>
            <Button
              title="Post to Community"
              icon="people-outline"
              variant="secondary"
              onPress={() => {
                hapticSelection();
                navigation.navigate('CommunityCompose', { kind: 'session', workoutId });
              }}
              accessibilityLabel="Post this session to Community"
            />
          </RevealSection>
        ) : null}

        {/* D2: programme-arc strip, where this session sits in the block, so
            the work reads as a journey towards the recovery week, not an
            open-ended grind. Suppressed under calm/ED; needs a real ≥2-week
            block. Reuses the same BlockShapeCard as Home and Consistency. */}
        {!readOnly && !calmSuppressed && mesoWeek?.plannedWeeks >= 2 && (
          <RevealSection delay={1160}>
            <Card style={styles.blockArcSection}>
              <Text style={[styles.sectionTitle, live.sectionTitle]}>Your block</Text>
              {mesoWeek.mesoName ? (
                <Text style={[styles.blockArcName, live.blockArcName]}>{mesoWeek.mesoName}</Text>
              ) : null}
              <BlockShapeCard
                weekIndex={mesoWeek.weekIndex}
                plannedWeeks={mesoWeek.plannedWeeks}
                isDeload={mesoWeek.isDeload}
                finished={!!mesoWeek.awaitingDecision}
                compact
              />
              {/* C5-P16-02 (D96): one plain sentence naming the next
                  planned session, on the card that already knows where
                  this session sits in the block. */}
              {/* Founder device order 2026-08-18: the "It is ready on
                  Today..." tail read as nonsense on device - the session
                  name alone says everything. */}
              {nextSessionName ? (
                <Text style={[styles.blockArcName, live.blockArcName]}>
                  Next up: {nextSessionName}.
                </Text>
              ) : null}
            </Card>
          </RevealSection>
        )}

        <RevealSection delay={1220}>{(() => {
          const display = readOnly
            ? readOnlyExerciseData
            : exerciseData.length > 0 ? exerciseData : [];
          if (!display.length) return null;
          return (
            <Card padding="none" style={styles.exerciseList}>
              {display.map((ex, i) => {
                const workingSets = (ex.loggedSets ?? []).filter(
                  s => (s.setType ?? 'straight') !== 'warmup'
                );
                return (
                  <View key={ex.exerciseId || i} style={[styles.exerciseListRow, live.exerciseListRow]}>
                    <Text style={[styles.exerciseListName, live.exerciseListName]} numberOfLines={1}>{ex.name}</Text>
                    {workingSets.length > 0 ? (
                      <View style={styles.exerciseSetsList}>
                        {workingSets.map((s, si) => (
                          <Text key={si} style={[styles.exerciseSetChip, live.exerciseSetChip]}>
                            {s.weight > 0 ? `${s.weight}${units}` : 'BW'} x {s.reps}
                          </Text>
                        ))}
                      </View>
                    ) : (
                      <Text style={[styles.exerciseListMeta, live.exerciseListMeta]}>
                        {ex.recommendedSets} x {ex.repsMin}-{ex.repsMax}
                      </Text>
                    )}
                  </View>
                );
              })}
            </Card>
          );
        })()}</RevealSection>

        {detectedPRs.length > 0 && (
          <RevealSection delay={1340}>
          <View style={[styles.prRow, live.prRow]}>
            <Ionicons name="trophy-outline" size={18} color={t.colors.warning} />
            <Text style={[styles.prRowText, live.prRowText]}>{prLine}</Text>
            {/* C5-P34-02 (D96): this is where a novice meets the term for
                the first time (the in-session celebration labels are plain
                English and stay that way). GLOSSARY.pr was authored for
                exactly this and had one consumer, a screen only reachable
                after a whole block has finished. Its own first words are
                "a new best for you on an exercise", so it still explains
                the line above it after the 2026-08-23 reword. Same tooltip
                primitive and same string as BlockReflectionScreen; no new
                copy and no PR-maths change. */}
            <InfoTooltip text={GLOSSARY.pr} size={13} />
          </View>
          </RevealSection>
        )}

        {/* CO-3 (cohesion audit 2026-07-09): quiet onward links, so workout
            completion gestures at the rest of the app instead of dead-ending.
            Same register as CoachOutputScreen's "See your updated plan" link
            (CO-2): a quiet pill, not a banner. Training-only copy, no weight/
            body/intake references. Each link appears only under its own
            genuinely-relevant state (see showProgressLink/showCoachLink
            above), never as a generic upsell. */}
        {(showProgressLink || showCoachLink) && (
          <RevealSection delay={1360}>
            <View style={styles.onwardLinksRow}>
              {showProgressLink && (
                <TouchableOpacity
                  style={[styles.onwardLink, live.onwardLink]}
                  activeOpacity={0.85}
                  onPress={handleSeeProgress}
                  accessibilityRole="button"
                  accessibilityLabel={progressLinkLabel}
                >
                  <Ionicons name="trending-up-outline" size={14} color={t.colors.textSecondary} />
                  <Text style={[styles.onwardLinkText, live.onwardLinkText]}>{progressLinkLabel}</Text>
                </TouchableOpacity>
              )}
              {showCoachLink && (
                <TouchableOpacity
                  style={[styles.onwardLink, live.onwardLink]}
                  activeOpacity={0.85}
                  onPress={() => navigateCrossTab(navigation, 'ProfileTab', 'CoachOutput')}
                  accessibilityRole="button"
                  accessibilityLabel="See this week's coaching decision"
                >
                  <Ionicons name="pulse-outline" size={14} color={t.colors.textSecondary} />
                  <Text style={[styles.onwardLinkText, live.onwardLinkText]}>See this week&apos;s coaching decision</Text>
                </TouchableOpacity>
              )}
            </View>
          </RevealSection>
        )}

        {/* CC33 W3 (D112 R5, closes audit T2-07/T2-22): the post-workout
            quiet line naming what a temporary capability change worked
            around this session, secondary text style, never a banner - with
            an expandable "What changed" detail in plain words and a quiet
            link to Injuries & limitations. Independent of showProgressLink/
            showCoachLink above (readOnly-safe: reachable from history too,
            since WorkoutSummaryScreen serves both the live finish flow and
            a history reopen). */}
        {constraintEffect ? (
          <RevealSection delay={1380}>
            <View style={styles.constraintEffectSection}>
              <Text style={[styles.constraintEffectLine, live.constraintEffectLine]}>
                {buildConstraintSummaryLine(constraintEffect.substituted, constraintEffect.omitted, constraintEffect.userChosen)}
              </Text>
              {constraintEffect.lines.length > 0 && (
                <>
                  <TouchableOpacity
                    onPress={() => setConstraintDetailExpanded((v) => !v)}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: constraintDetailExpanded }}
                    accessibilityLabel={constraintDetailExpanded ? 'Hide what changed' : 'What changed'}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    style={[styles.volumeWhyToggle, live.volumeWhyToggle]}
                  >
                    <Text style={[styles.volumeWhyToggleText, live.volumeWhyToggleText]}>
                      {constraintDetailExpanded ? 'Hide what changed' : 'What changed'}
                    </Text>
                    <Ionicons
                      name={constraintDetailExpanded ? 'chevron-up' : 'chevron-down'}
                      size={14}
                      color={t.colors.textSecondary}
                    />
                  </TouchableOpacity>
                  {constraintDetailExpanded && (
                    <View style={styles.constraintEffectDetail}>
                      {constraintEffect.lines.map((line) => (
                        <Text key={line.key} style={[styles.volumeWhyBody, live.volumeWhyBody]}>{line.text}</Text>
                      ))}
                    </View>
                  )}
                </>
              )}
              <TouchableOpacity
                style={[styles.onwardLink, live.onwardLink]}
                activeOpacity={0.85}
                onPress={() => navigation.navigate('HowYouTrain')}
                accessibilityRole="button"
                accessibilityLabel="Injuries & limitations"
              >
                <Ionicons name="body-outline" size={14} color={t.colors.textSecondary} />
                <Text style={[styles.onwardLinkText, live.onwardLinkText]}>Injuries & limitations</Text>
              </TouchableOpacity>
            </View>
          </RevealSection>
        ) : null}

        {/* Photos LOOP-3 (D4): the calm, opt-in "mark the moment" invitation,
            appended inside the celebration surface on a competence win only (a
            PB or a session-streak milestone). ProgressPhotoPrompt owns every
            gate itself (fail-closed suppression, permanent opt-out, ≤1/day
            + per-milestone dedupe); a null milestone id renders nothing. */}
        {photoPromptMilestoneId ? (
          <RevealSection delay={1400}>
            <ProgressPhotoPrompt
              milestoneId={photoPromptMilestoneId}
              onAddPhoto={() => navigateCrossTab(navigation, 'ProgressTab', 'ProgressPhotos')}
            />
          </RevealSection>
        ) : null}

        <View style={[styles.divider, live.divider]} />

        {musclesWorked.length > 0 && (
          <RevealSection delay={1460}>
          <View style={styles.section}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
              {/* O16: a history reopen shows the SESSION's week, so the
                  heading must not claim the current one. */}
              <Text style={[styles.sectionTitle, live.sectionTitle]}>{readOnly ? "That week's volume" : "This week's volume"}</Text>
              {/* O1 (comprehension-trust-audit-2026-08-06): 'minimum' used
                  to share the warning yellow with 'near_mrv' -- one colour
                  giving two opposite instructions ("add more" vs "ease
                  off"). 'minimum' now has its own line and its own colour
                  (theme.js's stateColors.info). */}
              <InfoTooltip size={11} text={
                'How much you\'ve trained each muscle group this week.\n\n' +
                'Green = Good range: enough training to grow without overdoing it\n' +
                'Yellow = Getting close: one more session and it may be too much\n' +
                'Red = Too much: consider doing a little less next week\n' +
                'Blue = Just enough: right at the floor, one or two more sets would be stronger\n' +
                'Grey = Below target: not enough logged yet to drive growth\n\n' +
                // C6 RE6-4 (D97-25): the adapted branch fired on ANY single
                // adapted muscle but claimed the plural for all of them -
                // the sentence is now scoped to "muscles with enough
                // logged data", true whatever the mix.
                // Founder ruling 2026-08-23: the bands can now come from
                // the athlete's own plan or their profile, so "research
                // starting points" is false for most readers. Each source
                // gets its own true sentence, checked in the order that
                // describes the strongest thing behind the ranges.
                (() => {
                  const sources = Object.values(landmarkResolution?.source ?? {});
                  if (sources.includes('adapted')) {
                    return 'These ranges start from your plan and your profile and, for muscles with enough logged data, have adjusted to your own response. You can also set them by hand with Edit volume targets on the Volume screen, your edits always win.';
                  }
                  if (sources.includes('plan')) {
                    return 'These ranges come from what your plan programs each week, inside the range your experience, recovery, phase and age support. You can also set them by hand with Edit volume targets on the Volume screen, your edits always win.';
                  }
                  if (sources.includes('profile')) {
                    return 'These ranges are matched to your training experience, recovery, phase and age. Once a plan programs a muscle they follow what it aims at, and you can set them by hand with Edit volume targets on the Volume screen.';
                  }
                  return 'These ranges are research-based starting points. With enough logged sessions they adjust to your response, and you can set them by hand with Edit volume targets on the Volume screen.';
                })()
              } />
            </View>
            {/* C5-P16-01 (D96): the week-in-progress statement, so the
                counts below read as a week under way rather than a verdict
                on a finished one. */}
            {!readOnly && weekProgress.inProgress && weekProgress.planned != null ? (
              <Text style={[styles.volumeInsightText, live.volumeInsightText]}>
                Week in progress: {weekProgress.logged} of {weekProgress.planned} sessions logged.
              </Text>
            ) : null}
            {/* D3: one compressed card, hairline dividers between muscles,
                instead of a stack of same-weight bordered cards. */}
            <Card padding="none" style={styles.volumeCard}>
            {musclesWorked.map((muscle, mi) => {
              const data = weeklyVolume[muscle];
              const { label, status } = getVolumeStatus(data.workingSets, muscle, landmarkResolution?.table);
              // CP-10 stage 3 (theming FINAL batch, 2026-07-10): live
              // variant of volumeStatusColor (src/styles/theme.js), fed by
              // this screen's own t.colors so the muscle-volume tone stays in
              // step with the rest of this screen's theme generation. Same
              // status -> tone mapping as the legacy singleton (kept for
              // VolumeHeatmapScreen.js/AnalyticsScreen.js, unmigrated).
              const color = buildVolumeStatusColor(t.colors)(status);
              // C5-P16-01 (D96): mid-week, the verdict copy and its
              // "add a couple of sets next week" explanation are withheld
              // in favour of the neutral count line this card already has
              // as its fallback branch. The status badge, its colour and
              // the landmarks are unchanged; only the advice waits until
              // the week is one that can be judged.
              const weekJudgeable = readOnly || !weekProgress.inProgress;
              // C6 RD6-1 (D97-25): the copy receives the SAME resolved
              // table (and this muscle's source) the verdict two lines up
              // was computed from, so the quoted range can never
              // contradict the status beside it.
              // S4: advice waits when this muscle also did work the read
              // excluded; the count line then says so instead.
              const hasExcludedWork = (excludedVolume?.[muscle]?.excludedSets ?? 0) > 0;
              const adviceAllowed = weekJudgeable && !hasExcludedWork;
              const insight = adviceAllowed ? getVolumeInsight(muscle, data.workingSets, status, landmarkResolution?.table) : null;
              const why = adviceAllowed ? getVolumeWhy(muscle, data.workingSets, status, landmarkResolution?.table, landmarkResolution?.source?.[muscle] ?? null) : null;
              const isExpanded = expandedVolumeWhy === muscle;
              return (
                <View key={muscle} style={[styles.volumeRow, live.volumeRow, mi === musclesWorked.length - 1 && styles.volumeRowLast]}>
                  <View style={styles.volumeRowMain}>
                    <Text style={[styles.muscleName, live.muscleName]}>{MUSCLE_DISPLAY_NAMES[muscle] || muscle}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: withAlpha(color, 0.133) }]}>
                      <Text style={[styles.statusText, live.statusText, { color }]}>{label}</Text>
                    </View>
                  </View>
                  {insight ? (
                    <Text style={[styles.volumeInsightText, live.volumeInsightText]}>{insight}</Text>
                  ) : (
                    <Text style={[styles.volumeInsightText, live.volumeInsightText]}>
                      {Math.round(data.workingSets)} sets {weekJudgeable ? 'this week' : 'so far this week'}{hasExcludedWork ? '. Explosive lifts like swings are not counted here.' : ''}
                    </Text>
                  )}
                  {why && (
                    <>
                      <TouchableOpacity
                        onPress={() => setExpandedVolumeWhy(isExpanded ? null : muscle)}
                        accessibilityRole="button"
                        accessibilityLabel={isExpanded ? `Hide why ${MUSCLE_DISPLAY_NAMES[muscle] || muscle} sits here` : `Why ${MUSCLE_DISPLAY_NAMES[muscle] || muscle} sits here`}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        style={[styles.volumeWhyToggle, live.volumeWhyToggle]}
                        >
                        <Text style={[styles.volumeWhyToggleText, live.volumeWhyToggleText]}>
                          {isExpanded ? 'Hide explanation' : 'Why this status?'}
                        </Text>
                        <Ionicons
                          name={isExpanded ? 'chevron-up' : 'chevron-down'}
                          size={14}
                          color={t.colors.textSecondary}
                        />
                      </TouchableOpacity>
                      {isExpanded && (
                        <Text style={[styles.volumeWhyBody, live.volumeWhyBody]}>{why}</Text>
                      )}
                    </>
                  )}
                </View>
              );
            })}
            </Card>
          </View>
          </RevealSection>
        )}

        {/* COMP-005 + D2: block-end recap. Under calm/ED this stays the quiet
            neutral link (the recap is still reachable, no celebration cues). */}
        {!readOnly && blockStory && calmSuppressed && (
          <RevealSection delay={1480}>
            <TouchableOpacity
              style={[styles.blockRecapRow, live.blockRecapRow]}
              activeOpacity={0.85}
              onPress={() => navigateCrossTab(navigation, 'ProgressTab', 'RecapStory', { variant: 'block', mesocycleId: blockStory.mesocycleId, blockName: blockStory.name })}
              accessibilityRole="button"
              accessibilityLabel="Watch your block story"
            >
              <Ionicons name="film-outline" size={16} color={t.colors.textSecondary} />
              <Text style={[styles.blockRecapText, live.blockRecapText]}>You&apos;ve finished this block. Have a look back at how it went.</Text>
              <Ionicons name="chevron-forward" size={iconSize.sm} color={t.colors.textMuted} />
            </TouchableOpacity>
          </RevealSection>
        )}

        {/* D2: phase-completion celebration card, the full beat when a block's
            final week closes (recap line + what's next), with the block story
            and a free share artefact (decision 4b). Suppressed under calm/ED,
            which falls back to the neutral link above. */}
        {!readOnly && blockStory && !calmSuppressed && (
          <RevealSection delay={1480}>
            <Card tone="gold" style={styles.phaseCard}>
              <View style={styles.phaseHeaderRow}>
                <Ionicons name="flag" size={18} color={t.colors.gold} />
                <Text style={[styles.phaseTitle, live.phaseTitle]}>Block finished</Text>
              </View>
              {blockStory.name ? (
                <Text style={[styles.phaseName, live.phaseName]}>{blockStory.name}</Text>
              ) : null}
              <Text style={[styles.phaseRecap, live.phaseRecap]}>
                {Number.isFinite(mesoWeek?.plannedWeeks)
                  ? `${mesoWeek.plannedWeeks} weeks completed, including your recovery week.`
                  : 'A full training block completed.'}
              </Text>
              {/* Stage 1 honesty (2026-08-09): the old line promised
                  "sensible progressions from this one" which the app does
                  not make yet (seeding is a fresh ramp until the Stage 6
                  ledger); point to the real decision instead. */}
              <Text style={[styles.phaseNext, live.phaseNext]}>
                What's next: choose your next block from the Train tab when you're ready.
              </Text>
              <View style={styles.phaseActions}>
                <Button
                  title="Watch your block story"
                  icon="sparkles"
                  variant="tertiary"
                  size="sm"
                  onPress={() => navigateCrossTab(navigation, 'ProgressTab', 'RecapStory', { variant: 'block', mesocycleId: blockStory.mesocycleId, blockName: blockStory.name })}
                  style={[styles.phaseActionBtn, live.phaseActionBtn, { backgroundColor: 'transparent' }]}
                  textStyle={[styles.phaseActionText, live.phaseActionText]}
                  accessibilityLabel="Watch your block story"
                />
                <TouchableOpacity
                  style={[styles.phaseShareBtn, live.phaseShareBtn]}
                  activeOpacity={0.85}
                  onPress={handleShareBlock}
                  accessibilityRole="button"
                  accessibilityLabel="Share block finished"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="share-social-outline" size={18} color={t.colors.primary} />
                </TouchableOpacity>
              </View>
            </Card>
          </RevealSection>
        )}

        {/* COMP-015: confirmation row, closes the loop at the moment the user
            is about to give the next round of feedback. Live path only. */}
        {!readOnly && sessionAdjustments.length > 0 && (
          <RevealSection delay={1520}>
            <View style={[styles.adjustedSummaryRow, live.adjustedSummaryRow]}>
              <Ionicons name="sparkles" size={15} color={t.colors.primary} />
              <Text style={[styles.adjustedSummaryText, live.adjustedSummaryText]}>
                Adjusted today: {sessionAdjustments.map(a =>
                  `${(MUSCLE_DISPLAY_NAMES[a.muscle] || a.muscle).toLowerCase()}, ${a.setDelta < 0 ? '1 set fewer' : '1 set added'}`,
                ).join(' - ')}
              </Text>
            </View>
          </RevealSection>
        )}

        {/* D3 (design audit 03): the "tell the coach" zone, the session's
            inputs grouped into ONE distinct card at the end, separated from
            the celebratory "what happened" zone above. Same controls, same
            handlers; only the grouping and header treatment changed. */}
        {!readOnly && (
          <Card style={styles.coachZoneCard}>
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionTitle, live.sectionTitle]}>Workout feedback</Text>
              <Text style={[styles.optionalLabel, live.optionalLabel]}>optional</Text>
            </View>
            <Text style={[styles.coachZoneSubHeading, live.coachZoneSubHeading]}>How did the session feel?</Text>
            {/* C5-P17-03 (D96): the purpose sentence sat INSIDE the
                expander, so the user had to decide to rate before being
                told why rating matters. That is the opposite order to the
                pre-session prompt, which leads with its purpose line before
                any control. Same sentence, same words, moved above the
                toggle. */}
            <Text style={[styles.feedbackPurpose, live.feedbackPurpose]}>
              Your answers shape how your recovery is read and, when coaching is active, whether next session's workload still makes sense. Skip anything you're not sure about.
            </Text>
            <TouchableOpacity
              style={[styles.feedbackToggleBtn, live.feedbackToggleBtn]}
              onPress={() => setFeedbackExpanded(e => !e)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityState={{ expanded: feedbackExpanded }}
              accessibilityLabel={feedbackExpanded ? 'Hide workout rating' : 'Rate this workout'}
            >
              <Text style={[styles.feedbackToggleBtnText, live.feedbackToggleBtnText]}>
                {feedbackExpanded ? 'Hide workout rating' : 'Rate this workout'}
              </Text>
              <Ionicons
                name={feedbackExpanded ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={t.colors.textSecondary}
              />
            </TouchableOpacity>
            {feedbackExpanded && (
              <View style={styles.feedbackCard}>
                {/* COMP-008: Soreness, Energy and Sleep moved to the
                    pre-workout intent prompt. The block keeps the three session
                    responses you can only judge once the work is done, plus
                    fatigue. */}
                {/* D93 (Campaign 2, Phase 6): purpose at the point of asking,
                    no direction taught. "Skip anything you're not sure about"
                    is load-bearing: unanswered saves as null and the engine
                    holds on insufficient feedback rather than guessing.
                    C5-P17-03 (D96): the sentence itself now renders above
                    the expander toggle, so it is read BEFORE the decision to
                    rate, not after it. */}
                {/* C5-P17-02 (D96): a row shows a selection only when a REAL
                    answer exists (touched this visit or stored). The form
                    used to open with "Moderate" / "None" pre-selected -
                    four answers the user never gave, contradicting its own
                    "Skip anything you're not sure about". */}
                <RatingRow label="Difficulty" field="sessionDifficulty" value={realFieldsRef.current.has('sessionDifficulty') ? feedback.sessionDifficulty : null} max={5} onChange={rateFeedback('sessionDifficulty')} />
                <RatingRow label="Muscle engagement" field="overallPump" value={realFieldsRef.current.has('overallPump') ? feedback.overallPump : null} max={3} onChange={rateFeedback('overallPump')} />
                <RatingRow label="Joint discomfort" field="jointDiscomfort" value={realFieldsRef.current.has('jointDiscomfort') ? feedback.jointDiscomfort : null} max={3} onChange={rateFeedback('jointDiscomfort')} hint="Joints and tendons, not normal muscle soreness" />
                <RatingRow label="Fatigue" field="fatigueLevel" value={realFieldsRef.current.has('fatigueLevel') ? feedback.fatigueLevel : null} max={5} onChange={rateFeedback('fatigueLevel')} />
                <TextField accessibilityLabel="Workout feedback notes"
                  fieldStyle={styles.notesField}
                  inputStyle={[styles.notesInput, live.notesInput]}
                  value={notes}
                  onChangeText={(t) => { notesDirtyRef.current = true; setNotes(t); }}
                  placeholder="Anything notable from this session"
                  placeholderTextColor={t.colors.textMuted}
                  multiline
                />
              </View>
            )}
            <View style={[styles.coachZoneDivider, live.coachZoneDivider]} />
            <Text style={[styles.coachZoneSubHeading, live.coachZoneSubHeading]}>Notes for next time</Text>
            <TextField accessibilityLabel="Notes for next time"
              fieldStyle={styles.nextTimeNoteField}
              inputStyle={[styles.nextTimeNoteInput, live.nextTimeNoteInput]}
              value={nextTimeNote}
              onChangeText={setNextTimeNote}
              // WAVE-A-FINDINGS.md COPY_DEFECT (:1744): the example hard-coded
              // kg regardless of the user's chosen unit; same root cause as
              // the hero-stat fix above, bundled per the change plan.
              placeholder={`Anything to remember for next session? e.g. try ${units === 'lbs' ? '185lbs' : '85kg'}, wider grip, reduce volume`}
              placeholderTextColor={t.colors.textMuted}
              multiline
              numberOfLines={3}
            />
          </Card>
        )}

        {!readOnly && !routineId && exerciseData.length > 0 && (
          <RevealSection delay={1700}>
          <View style={styles.secondaryActions}>
            <Button
              title="Save this workout to reuse"
              variant="secondary"
              icon="bookmark-outline"
              style={styles.templateBtn}
              textStyle={[styles.templateBtnText, live.templateBtnText]}
              onPress={handleSaveAsTemplate}
              accessibilityLabel="Save this workout to reuse"
            />
          </View>
          </RevealSection>
        )}
      </KeyboardAwareScrollView>
      </KeyboardGestureArea>

      {/* Sticky footer, a NORMAL-FLOW sibling below the scroll (not an overlay).
          Flat spacing.lg bottom token, never insets.bottom: R2-5 (2026-07-11)
          makes the SafeAreaView own only the top edge, and the VolyumeTabBar
          band below this screen owns the system bottom inset, so this footer
          sits flush on the band with no dead space between them. The 2026-07-03
          founder-evidenced rule (the tab band absorbs the inset, so a sticky
          footer here uses a flat token) still holds; bottomBarInset.guard.test.js
          pins it. R2-6 (2026-07-11): the footer no longer measures its own
          height - the scroll padding is independent of it (the footer never
          overlays the scroll), so the onLayout/footerHeight plumbing is gone.
          R6 (2026-07-11): the earlier dead band beside Close was doneBtn's
          flex: 1 being discarded by PressableCard's old two-view shape; fixed at
          the primitive, pinned in pressableCard.rowLayout.guard.test.js. */}
      <View style={[styles.stickyFooter, live.stickyFooter, { paddingBottom: spacing.lg }]}>
        {saveError ? (
          <View style={[styles.saveErrorCard, live.saveErrorCard]}>
            <Ionicons name="warning-outline" size={16} color={t.colors.error} />
            <Text style={[styles.saveErrorText, live.saveErrorText]}>{saveError}</Text>
          </View>
        ) : null}
        <View style={styles.footerRow}>
          {/* Coherence pass: the terminal action of the core training loop
              is the screen's primary CTA, in the same register as Today's
              "Start workout" that began it. "Done" closes the loop; "Close"
              read as dismissing a dialog. */}
          <Button
            title={saving ? 'Saving' : 'Done'}
            variant="primary"
            onPress={handleDone}
            disabled={saving}
            style={styles.doneBtn}
            accessibilityLabel="Done"
            accessibilityState={{ disabled: saving }}
          />
          {/* R11/L2 (share-card audit 2026-07-27): a zero-working-set session
              (e.g. a warm-up-only or cardio-only log) still offered Share and
              rendered a card reading "0 SETS / 0m" -- nothing worth sharing.
              WAVE-D-FINDINGS.md IA_DEFECT (lead ruling item 3): a past
              session opened from history used to have NO share affordance
              at all, ever again, unlike every other progress surface's
              "share your own evidence" standing capability. handleShareCard
              now reads readOnlyExerciseData in readOnly mode (above), so the
              !readOnly guard is no longer needed here. */}
          {displayWorkingSets > 0 && (
            <Button
              title="Share"
              icon="share-social-outline"
              variant="tertiary"
              size="sm"
              fullWidth={false}
              onPress={handleShareCard}
              style={[styles.shareFooterBtn, live.shareFooterBtn]}
              textStyle={[styles.shareFooterBtnText, live.shareFooterBtnText]}
              accessibilityLabel="Share session"
            />
          )}
        </View>
      </View>

      {/* Template name prompt. Compliance pass (remediation 2026-07-11, food
          design standard section 5): migrated off the raw RN modal onto the
          shared BottomSheet chrome - one sheet chrome app-wide, never a
          hand-rolled sheet (checklist item 9). Plain bold title line, the
          TextField, then a secondary Cancel beside a primary Save that takes the
          remaining width (item 10). BottomSheet owns the scrim, drag handle,
          radius.xl top corners and keyboard avoidance (keyboardAvoiding). */}
      <BottomSheet
        visible={templateModalVisible}
        onClose={() => setTemplateModalVisible(false)}
        keyboardAvoiding
        accessibilityLabel="Save this workout to reuse"
      >
        <Text style={[styles.templateModalTitle, live.templateModalTitle]}>Save this workout to reuse</Text>
        <TextField accessibilityLabel="Workout name"
          fieldStyle={styles.templateModalField}
          inputStyle={[styles.templateModalInput, live.templateModalInput]}
          value={templateName}
          onChangeText={setTemplateName}
          placeholder="Workout name"
          placeholderTextColor={t.colors.textMuted}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={confirmSaveTemplate}
          selectTextOnFocus
        />
        <View style={styles.templateModalBtns}>
          <Button
            title="Cancel"
            variant="secondary"
            fullWidth={false}
            style={[styles.templateModalCancel, live.templateModalCancel]}
            onPress={() => setTemplateModalVisible(false)}
            accessibilityLabel="Cancel"
            textStyle={[styles.templateModalCancelText, live.templateModalCancelText]}
          />
          <Button
            title="Save"
            fullWidth={false}
            style={[styles.templateModalSave, live.templateModalSave]}
            onPress={confirmSaveTemplate}
            disabled={!templateName.trim()}
            accessibilityLabel="Save workout"
            accessibilityState={{ disabled: !templateName.trim() }}
            textStyle={[styles.templateModalSaveText, live.templateModalSaveText]}
          />
        </View>
      </BottomSheet>
      {/* D2: gold burst over the summary for the 50/100-session rungs. Set
          only inside the calm/ED-suppressed-free branch; renders nothing
          under reduce-motion; never blocks taps. */}
      {milestoneBurst ? <MilestoneBurst onDone={() => setMilestoneBurst(false)} /> : null}
    </SafeAreaView>
  );
}

// Keep the summary layout stable. These sections used to fade in with staggered
// opacity delays, but the completion controls must be available immediately on
// tired thumbs and should never depend on native-driver animation state.
function RevealSection({ children }) {
  return <View>{children}</View>;
}

// StatBox renders a single stat. When the value is a pure
// number-like string (no letters), the value animates from 0 up to
// the target across ~900ms with an ease-out curve. The user sees
// "Total kg: 4,000 → 8,432 → 12,800" tick by rather than the number
// just appearing, gives the summary a cinematic beat. Reduce-motion
// users get the final value immediately.
//
// D3: `hero` renders the same animated counter at display size for the
// screen's one headline number (tonnage), without the box chrome; the
// three compact boxes below keep the original treatment.
//
// Named export (CP-10 stage 3, theming FINAL batch, 2026-07-10): this screen
// as a whole is impractical to mount in a test (SQLite, wellbeing reads,
// mesocycle week -- see this screen's own guard tests' header comments), but
// StatBox only needs a handful of primitive props and one store field
// (reduceMotion), so it is exported purely so the live-theme flip contract
// can be pinned against a real mounted instance (see
// cp10Stage3WorkoutShellsLiveTheme.test.js). No behaviour change.
export function StatBox({ icon, value, label, tooltip, animateOrder = 0, hero = false }) {
  // CP-10 stage 3 (theming FINAL batch): live theme (src/hooks/useTheme.js).
  // See buildLiveStyles' header comment (defined further down this
  // file, after the frozen `styles` block -- see the comment there for why).
  const t = useTheme();
  const live = buildLiveStyles(t);
  const reduceMotion = useAppStore(s => s.accessibility?.reduceMotion);
  // Parse the value to detect whether it's "10,432 kg" (number with
  // optional suffix) or "12m" (number + unit) or "8" (pure number).
  // We keep the suffix and animate only the number.
  const parsed = React.useMemo(() => {
    const m = String(value || '').match(/^([\d,]+(?:\.\d+)?)(.*)$/);
    if (!m) return null;
    const cleanNum = parseFloat(m[1].replace(/,/g, ''));
    if (!Number.isFinite(cleanNum)) return null;
    return { num: cleanNum, suffix: m[2] };
  }, [value]);

  const opacity = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  const translateY = useRef(new Animated.Value(reduceMotion ? 0 : 8)).current;
  const delay = animateOrder * 80;

  useEffect(() => {
    if (reduceMotion) return;
    // Staggered reveal, each StatBox starts ~80ms after the previous
    // one. Gives the grid a left-to-right shimmer rather than four
    // boxes appearing simultaneously.
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: motion.enter, delay, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: motion.enter, delay, useNativeDriver: true }),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // E9/E15-4: the count-up rides RollingNumber on the UI thread (the old
  // requestAnimationFrame counter re-rendered this box every frame).
  // Non-numeric values render static, as before.
  // CP-10 stage 3 (theming FINAL batch, 2026-07-10): numeral now takes the
  // frozen style AND its live override separately (rather than one
  // `textStyle` prop) so both call sites below can pass `styles.KEY` plus
  // `live.KEY` through to the actual Text/RollingNumber `style` array --
  // the mechanical styles.KEY->styles.KEY, live.KEY substitution elsewhere
  // in this file would otherwise have silently changed numeral's arity
  // without this fix.
  // D1 (pre-release sweep 2026-07-27, LANE D): optional font-scale ceiling,
  // passed only for the tonnage HERO numeral below. RollingNumber's
  // maxFontSizeMultiplier stayed optional (D6) rather than required, this is
  // the call site that needed capping, the compact statBox numerals did not.
  const numeral = (frozenStyle, liveStyle, maxFontSizeMultiplier) => (parsed ? (
    <RollingNumber
      value={parsed.num}
      from={0}
      delayMs={delay}
      suffix={parsed.suffix}
      style={[frozenStyle, liveStyle]}
      accessibilityLabel={String(value)}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
    />
  ) : (
    <Text style={[frozenStyle, liveStyle]} maxFontSizeMultiplier={maxFontSizeMultiplier}>{value}</Text>
  ));

  if (hero) {
    return (
      <Animated.View style={[styles.heroValueWrap, { opacity, transform: [{ translateY }] }]}>
        {numeral(styles.heroValue, live.heroValue, 1.3)}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xxs }}>
          <Text style={[styles.heroValueLabel, live.heroValueLabel]}>{label}</Text>
          {tooltip ? <InfoTooltip size={11} text={tooltip} /> : null}
        </View>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[styles.statBox, live.statBox, { opacity, transform: [{ translateY }] }]}>
      <Ionicons name={icon} size={20} color={t.colors.textSecondary} />
      {numeral(styles.statValue, live.statValue)}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xxs }}>
        <Text style={[styles.statLabel, live.statLabel]}>{label}</Text>
        {tooltip ? <InfoTooltip size={10} text={tooltip} /> : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.xl, paddingBottom: spacing.xxxl },
  completionHeader: { gap: spacing.xs, paddingVertical: spacing.md },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  completionTitle: { ...type.h2, color: colors.textPrimary },
  completionDate: { fontSize: fontSize.sm, color: colors.textMuted },
  firstSessionLine: { fontSize: fontSize.sm, fontFamily: fontFamily.semibold, fontWeight: fontWeight.semibold, color: colors.primary, marginTop: spacing.xs },
  // D1 early-win milestone card. Gold accent (an achievement beat, kin to the
  // PR row) but calm: a soft surface card, no confetti, no full-screen takeover.
  milestoneCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
  },
  milestoneIconWrap: {
    width: 40, height: 40, borderRadius: circle(40),
    backgroundColor: withAlpha(colors.gold, 0.125),
    alignItems: 'center', justifyContent: 'center',
  },
  milestoneTitle: { fontSize: fontSize.md, fontFamily: fontFamily.bold, fontWeight: fontWeight.bold, color: colors.textPrimary },
  milestoneBody: { ...type.captionTight, color: colors.textSecondary, marginTop: spacing.xxs },
  milestoneShareBtn: {
    width: 36, height: 36, borderRadius: circle(36),
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: withAlpha(colors.gold, 0.125),
  },
  // D2 phase-completion celebration card.
  phaseCard: {
    gap: spacing.sm,
  },
  phaseHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  phaseTitle: { fontSize: fontSize.md, fontFamily: fontFamily.bold, fontWeight: fontWeight.bold, color: colors.textPrimary },
  phaseName: { fontSize: fontSize.sm, fontFamily: fontFamily.semibold, fontWeight: fontWeight.semibold, color: colors.primary },
  phaseRecap: { ...type.bodySm, color: colors.textSecondary },
  phaseNext: { ...type.captionTight, color: colors.textMuted },
  phaseActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xxs },
  phaseActionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs,
    paddingVertical: spacing.md, borderRadius: radius.md,
    borderWidth: 1, borderColor: withAlpha(colors.primary, 0.376),
  },
  phaseActionText: { fontSize: fontSize.sm, fontFamily: fontFamily.semibold, fontWeight: fontWeight.semibold, color: colors.primary },
  phaseShareBtn: {
    width: touchTarget.minimum, height: touchTarget.minimum, borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: withAlpha(colors.primary, 0.376),
  },
  // D2 programme-arc strip wrapper, surface card matching the other summary
  // sections, holding the reused BlockShapeCard (dots + effort word).
  blockArcSection: {
    gap: spacing.sm,
  },
  blockArcName: { fontSize: fontSize.sm, fontFamily: fontFamily.semibold, fontWeight: fontWeight.semibold, color: colors.textPrimary },
  // D3 hero: the one elevated object on the screen (surfaceElevated ranks
  // the hero, design audit 03 rule 4), carrying the display-size tonnage.
  heroCard: {
    gap: spacing.md,
    alignItems: 'center',
  },
  heroValueWrap: { alignItems: 'center', gap: spacing.xs },
  heroValue: { ...type.num('display'), color: colors.primary },
  heroValueLabel: { ...type.caption, color: colors.textSecondary },
  verdictRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
    alignSelf: 'stretch',
    borderTopWidth: 1, borderTopColor: colors.borderSubtle,
    paddingTop: spacing.md,
  },
  verdictHeadline: { ...type.bodyStrong },
  verdictSub: { ...type.captionTight, color: colors.textMuted, marginTop: spacing.xxs },
  // The three remaining stats step down to one compact row under the hero.
  statsGrid: { flexDirection: 'row', gap: spacing.md },
  // Compliance pass (remediation 2026-07-11, food design standard section 2 /
  // checklist 1): the three stat tiles are card-class surfaces, so radius.lg
  // (16, the one card radius), colors.surface, 1px border - matching Card.
  statBox: {
    flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, alignItems: 'center', gap: spacing.xs, borderWidth: 1, borderColor: colors.borderSubtle,
  },
  statValue: { ...type.num('h3'), color: colors.textPrimary },
  statLabel: { ...type.caption, color: colors.textSecondary },
  prRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.warningBg, borderRadius: radius.md, padding: spacing.md,
    borderWidth: 1, borderColor: withAlpha(colors.warning, 0.251),
  },
  prRowText: { ...type.label, flex: 1, color: colors.warning },
  // CO-3: quiet onward links, same register as CoachOutputScreen's
  // planEditLink ("See your updated plan") -- a neutral pill, never amber.
  onwardLinksRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  onwardLink: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    // Round 12 (R12-5, J2): 48 effective (spacing.xxxl), per
    // docs/rules/styling.md - the old 40 was both under the minimum and
    // an off-scale literal. Shared by three onward links on this screen.
    alignSelf: 'flex-start', gap: spacing.xs, minHeight: spacing.xxxl,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    borderRadius: radius.full, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface2,
  },
  // Round 13 (J5): the in-row wrapping bound, ADAPTED from R2-12's
  // choiceLabelInRow (that one is flex: 1, minWidth: 0 - correct in a
  // full-width row; here flexShrink replaces flex because a
  // flex-basis-0 label would collapse this content-sized pill to icon
  // width). Without a bound a long label at large accessibility type
  // had nothing to shrink or wrap against inside its pill.
  onwardLinkText: { ...type.label, color: colors.textPrimary, flexShrink: 1, minWidth: 0 },
  // CC33 W3 (D112 R5): the post-workout constraint-effect line, secondary
  // text style (adjustedSummaryText's exact pairing), never a banner.
  constraintEffectSection: { gap: spacing.xs },
  constraintEffectLine: { ...type.bodySm, color: colors.textSecondary },
  constraintEffectDetail: { gap: spacing.xxs, marginTop: spacing.xxs },
  divider: { height: 1, backgroundColor: colors.border },
  section: { gap: spacing.md },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  // D3: real section headers (design audit 03 rule 3), the D0 `title` role,
  // not a body-sized label.
  sectionTitle: { ...type.title, color: colors.textPrimary },
  optionalLabel: { ...type.caption, color: colors.textMuted },
  // D3: the weekly-volume rows live in ONE card with hairline dividers.
  volumeCard: {
    overflow: 'hidden',
  },
  volumeRow: {
    flexDirection: 'column', gap: spacing.xs,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.borderSubtle,
  },
  volumeRowLast: { borderBottomWidth: 0 },
  volumeRowMain: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
  },
  muscleName: { flex: 1, ...type.bodyStrong, color: colors.textPrimary },
  volumeInsightText: { fontSize: fontSize.xs, color: colors.textMuted, lineHeight: 18 },
  volumeWhyToggle: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    alignSelf: 'flex-start', minHeight: 40, paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs, borderRadius: radius.full,
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
  },
  volumeWhyToggleText: {
    ...type.caption, color: colors.textSecondary,
  },
  volumeWhyBody: {
    fontSize: fontSize.xs, color: colors.textSecondary, lineHeight: 19,
    // R2 (lead ruling): small surface, radius.md per the standard.
    backgroundColor: colors.surface2, borderRadius: radius.md,
    padding: spacing.sm, marginTop: spacing.xxs,
  },
  // R2 (lead ruling): a badge is a pill, per the standard's pill class.
  statusBadge: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs, borderRadius: radius.full },
  statusText: { ...type.captionStrong },
  // D3 "tell the coach" zone: the session's inputs as one distinct card.
  coachZoneCard: {
    gap: spacing.md,
  },
  coachZoneSubHeading: { ...type.label, color: colors.textSecondary },
  coachZoneDivider: { height: 1, backgroundColor: colors.borderSubtle },
  feedbackToggleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.surface2, borderRadius: radius.lg, padding: spacing.md,
    borderWidth: 1, borderColor: colors.border,
  },
  feedbackToggleBtnText: { ...type.bodyStrong, color: colors.textSecondary },
  feedbackCard: { gap: spacing.md, paddingTop: spacing.xs },
  // COMP-015 confirmation row
  adjustedSummaryRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.primaryBg, borderRadius: radius.md,
    borderWidth: 1, borderColor: withAlpha(colors.primary, 0.251),
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md, marginBottom: spacing.md,
  },
  adjustedSummaryText: { ...type.bodySm, flex: 1, color: colors.textSecondary },
  // COMP-005 block-end recap row
  blockRecapRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surface2, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md, marginBottom: spacing.md,
  },
  blockRecapText: { flex: 1, ...type.label, color: colors.textPrimary },
  ratingRow: { gap: spacing.xs2 },
  ratingLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ratingLabel: { ...type.label, color: colors.textSecondary },
  ratingHint: { ...type.caption, color: colors.textMuted },
  feedbackPurpose: { ...type.caption, color: colors.textMuted },
  ratingBtns: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, minHeight: 44 },
  ratingBtn: {
    width: touchTarget.minimum, height: touchTarget.minimum, minWidth: touchTarget.minimum, borderRadius: radius.md, backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border,
  },
  // D3: selected state uses the app-wide chip grammar (tint + amber edge,
  // see components/Chip.js), not a full amber fill.
  ratingBtnActive: { backgroundColor: colors.primaryBg, borderColor: colors.primary },
  ratingBtnText: { fontSize: fontSize.md, fontFamily: fontFamily.bold, fontWeight: fontWeight.bold, color: colors.textSecondary },
  ratingBtnTextActive: { color: colors.primary },
  ratingValueLabel: { fontSize: fontSize.xs, color: colors.primary, fontFamily: fontFamily.medium, fontWeight: fontWeight.medium },
  notesField: { borderRadius: radius.md },
  notesInput: { ...type.body, padding: spacing.lg, minHeight: 80, textAlignVertical: 'top' },
  nextTimeNoteField: { borderRadius: radius.md },
  nextTimeNoteInput: {
    fontSize: fontSize.sm,
    padding: spacing.lg,
    minHeight: 72,
    textAlignVertical: 'top',
  },
  secondaryActions: { gap: spacing.sm },
  templateBtn: {
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
  },
  templateBtnText: { ...type.label, color: colors.textSecondary },
  stickyFooter: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    minHeight: 68,
    backgroundColor: colors.background,
  },
  saveErrorCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    // Compliance pass (remediation 2026-07-11, food design standard section 2 /
    // checklist 1): card-class surface -> radius.lg (the one card radius).
    borderRadius: radius.lg,
    backgroundColor: withAlpha(colors.error, 0.12),
    borderWidth: 1,
    borderColor: withAlpha(colors.error, 0.28),
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  saveErrorText: { ...type.caption, color: colors.textPrimary, flex: 1, lineHeight: 18 },
  footerRow: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
  },
  // D3: Close owns the footer. Share stays available, but compact, so the
  // completion action does not become two competing large buttons.
  // Fill, radius and label typography come from the shared Button primitive
  // (variant="primary"); the local layout keys survive.
  doneBtn: {
    flex: 1,
    minHeight: touchTarget.minimum,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareFooterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    flexShrink: 0,
    minWidth: 108,
    minHeight: touchTarget.minimum,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: withAlpha(colors.primary, alpha.strong),
    backgroundColor: colors.primaryBg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  shareFooterBtnText: {
    ...type.label,
    color: colors.primary,
  },
  exerciseList: {
    overflow: 'hidden',
  },
  exerciseListRow: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    gap: spacing.xs,
  },
  exerciseListName: {
    ...type.label,
    color: colors.textPrimary,
  },
  exerciseListMeta: {
    ...type.num('caption'),
    color: colors.textSecondary,
  },
  exerciseSetsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  exerciseSetChip: {
    ...type.num('caption'),
    color: colors.textSecondary,
    backgroundColor: colors.surface2 ?? colors.background,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    // R2 (lead ruling): a chip is a pill, per the standard's chip idiom.
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },

  // Template-name prompt (now inside the shared BottomSheet; the sheet owns the
  // scrim + panel, so no templateModalBg/Card wrapper here). Title line, field,
  // then a Cancel-beside-Save row where Save takes the remaining width per the
  // food design standard's sheet action-row idiom (section 5 / checklist 10).
  templateModalTitle: {
    ...type.title, color: colors.textPrimary,
  },
  templateModalField: { borderRadius: radius.md },
  templateModalInput: { ...type.body, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2 },
  templateModalBtns: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  templateModalCancel: {
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
  },
  templateModalCancelText: { ...type.label, color: colors.textSecondary },
  templateModalSave: {
    flex: 1,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    borderRadius: radius.md, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
  },
  templateModalSaveText: { ...type.label, color: colors.textPrimary },
});

// CP-10 stage 3 (theming FINAL batch, 2026-07-10): buildLiveStyles is the
// shared "frozen base + live override" map for this screen's three
// function-component scopes (RatingRow, WorkoutSummaryScreen, StatBox) --
// each calls `const t = useTheme(); const live = buildLiveStyles(t);` and
// appends `live.KEY` after `styles.KEY` in every style array, same pattern
// as ActiveWorkoutScreen.js's buildLiveStyles (this batch) and batch
// 1/2's buildBriefIconColor. Extracted to one function so the three
// scopes can never drift out of step with each other or with the frozen
// `styles` block above -- every key here mirrors only the colour/
// fontSize/type-bearing sub-properties of the matching frozen style, at
// identical rest values; pure layout keys (flex/gap/padding/width, no
// token) are correctly omitted, there is nothing to unfreeze for them.
// RevealSection has no colour/fontSize/type tokens at all, so it stays
// untouched -- there is nothing for it to unfreeze.
function buildLiveStyles(t) {
  return {
    safe: { backgroundColor: t.colors.background },
    completionTitle: { ...t.type.h2, color: t.colors.textPrimary },
    completionDate: { fontSize: t.fontSize.sm, color: t.colors.textMuted },
    firstSessionLine: { fontSize: t.fontSize.sm, color: t.colors.primary },
    milestoneIconWrap: { backgroundColor: withAlpha(t.colors.gold, 0.125) },
    milestoneTitle: { fontSize: t.fontSize.md, color: t.colors.textPrimary },
    milestoneBody: { ...t.type.captionTight, color: t.colors.textSecondary },
    milestoneShareBtn: { backgroundColor: withAlpha(t.colors.gold, 0.125) },
    phaseTitle: { fontSize: t.fontSize.md, color: t.colors.textPrimary },
    phaseName: { fontSize: t.fontSize.sm, color: t.colors.primary },
    phaseRecap: { ...t.type.bodySm, color: t.colors.textSecondary },
    phaseNext: { ...t.type.captionTight, color: t.colors.textMuted },
    phaseActionBtn: { borderColor: withAlpha(t.colors.primary, 0.376) },
    phaseActionText: { fontSize: t.fontSize.sm, color: t.colors.primary },
    phaseShareBtn: { borderColor: withAlpha(t.colors.primary, 0.376) },
    blockArcName: { fontSize: t.fontSize.sm, color: t.colors.textPrimary },
    heroValue: { ...t.type.num('display'), color: t.colors.primary },
    heroValueLabel: { ...t.type.caption, color: t.colors.textSecondary },
    verdictRow: { borderTopColor: t.colors.borderSubtle },
    verdictHeadline: { ...t.type.bodyStrong },
    verdictSub: { ...t.type.captionTight, color: t.colors.textMuted },
    statBox: { backgroundColor: t.colors.surface, borderColor: t.colors.border },
    statValue: { ...t.type.num('h3'), color: t.colors.textPrimary },
    statLabel: { ...t.type.caption, color: t.colors.textSecondary },
    prRow: { backgroundColor: t.colors.warningBg, borderColor: withAlpha(t.colors.warning, 0.251) },
    prRowText: { ...t.type.label, color: t.colors.warning },
    onwardLink: { borderColor: t.colors.border, backgroundColor: t.colors.surface2 },
    onwardLinkText: { ...t.type.label, color: t.colors.textPrimary },
    constraintEffectLine: { ...t.type.bodySm, color: t.colors.textSecondary },
    divider: { backgroundColor: t.colors.border },
    sectionTitle: { ...t.type.title, color: t.colors.textPrimary },
    optionalLabel: { ...t.type.caption, color: t.colors.textMuted },
    volumeRow: { borderBottomColor: t.colors.borderSubtle },
    muscleName: { ...t.type.bodyStrong, color: t.colors.textPrimary },
    volumeInsightText: { fontSize: t.fontSize.xs, color: t.colors.textMuted },
    volumeWhyToggle: { backgroundColor: t.colors.surface2, borderColor: t.colors.border },
    volumeWhyToggleText: { ...t.type.caption, color: t.colors.textSecondary },
    volumeWhyBody: { fontSize: t.fontSize.xs, color: t.colors.textSecondary, backgroundColor: t.colors.surface2 },
    statusText: { ...t.type.captionStrong },
    coachZoneSubHeading: { ...t.type.label, color: t.colors.textSecondary },
    coachZoneDivider: { backgroundColor: t.colors.borderSubtle },
    feedbackToggleBtn: { backgroundColor: t.colors.surface2, borderColor: t.colors.border },
    feedbackToggleBtnText: { ...t.type.bodyStrong, color: t.colors.textSecondary },
    adjustedSummaryRow: { backgroundColor: t.colors.primaryBg, borderColor: withAlpha(t.colors.primary, 0.251) },
    adjustedSummaryText: { ...t.type.bodySm, color: t.colors.textSecondary },
    blockRecapRow: { backgroundColor: t.colors.surface2, borderColor: t.colors.border },
    blockRecapText: { ...t.type.label, color: t.colors.textPrimary },
    ratingLabel: { ...t.type.label, color: t.colors.textSecondary },
    ratingHint: { ...t.type.caption, color: t.colors.textMuted },
    feedbackPurpose: { ...t.type.caption, color: t.colors.textMuted },
    ratingBtn: { backgroundColor: t.colors.surface, borderColor: t.colors.border },
    ratingBtnActive: { backgroundColor: t.colors.primaryBg, borderColor: t.colors.primary },
    ratingBtnText: { fontSize: t.fontSize.md, color: t.colors.textSecondary },
    ratingBtnTextActive: { color: t.colors.primary },
    ratingValueLabel: { fontSize: t.fontSize.xs, color: t.colors.primary },
    notesInput: { ...t.type.body },
    nextTimeNoteInput: { fontSize: t.fontSize.sm },
    templateBtnText: { ...t.type.label, color: t.colors.textSecondary },
    stickyFooter: { borderTopColor: t.colors.border, backgroundColor: t.colors.background },
    saveErrorCard: { backgroundColor: withAlpha(t.colors.error, 0.12), borderColor: withAlpha(t.colors.error, 0.28) },
    saveErrorText: { ...t.type.caption, color: t.colors.textPrimary },
    shareFooterBtn: { borderColor: withAlpha(t.colors.primary, alpha.strong), backgroundColor: t.colors.primaryBg },
    shareFooterBtnText: { ...t.type.label, color: t.colors.primary },
    exerciseListRow: { borderBottomColor: t.colors.borderSubtle },
    exerciseListName: { ...t.type.label, color: t.colors.textPrimary },
    exerciseListMeta: { ...t.type.num('caption'), color: t.colors.textSecondary },
    exerciseSetChip: { ...t.type.num('caption'), color: t.colors.textSecondary, backgroundColor: t.colors.surface2 ?? t.colors.background, borderColor: t.colors.border },
    templateModalTitle: { ...t.type.title, color: t.colors.textPrimary },
    templateModalInput: { ...t.type.body },
    templateModalCancel: { borderColor: t.colors.border },
    templateModalCancelText: { ...t.type.label, color: t.colors.textSecondary },
    templateModalSave: { backgroundColor: t.colors.surface2, borderColor: t.colors.border },
    templateModalSaveText: { ...t.type.label, color: t.colors.textPrimary },
  };
}
