/**
 * DiaryScreen - the food diary entry point (Move #1).
 *
 * Locked in UI_FLOWS_LOCKED.md and MOVE_1_FOOD_FOUNDATION_AND_FFM.md.
 * Voice rules from COACHING_VOICE_SYNTHESIS_LOCKED.md.
 *
 * Ships: date pager, macro summary, six meal sections as contained cards
 * (Breakfast, Lunch, Dinner, Pre/Post-workout, Snacks), search-based add,
 * barcode scan, swipe-delete, multi-select bulk tools, copy yesterday, and a
 * designed empty state (diary-tab redesign 2026-06-01).
 *
 * D138 (the diary as a daily workspace): a usual chip on an empty meal logs
 * its remembered portion in ONE tap (portion stated on the chip, undo toast
 * after, hold to change it first); an empty meal whose slot had food
 * yesterday offers "Yesterday's <meal>" to copy just that meal across; the
 * two-line meal-builder row and the standalone banking button are one
 * compact chip row (Meal builder / Higher-calorie day / Trends) under the
 * meals; and a user with no targets gets a way out from under the rings.
 * The canonical add path (Add food -> search -> Add to diary) is unchanged:
 * this is a shorter path for repeats, not a replacement for it.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { appAlert } from '../components/AppAlert';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector, Directions } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as haptics from '../lib/haptics';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from '@react-navigation/native';
import { colors, fontSize, fontWeight, spacing, radius, shadow, circle, type, iconSize, fontFamily, withAlpha, alpha } from '../styles/theme';
import useTheme from '../hooks/useTheme';
import AnimatedEntrance from '../components/AnimatedEntrance';
import Card from '../components/Card';
import {
  getFoodEntriesForDay, getRecentLoggedDays, deleteFoodEntry, restoreFoodEntry, updateFoodEntry, getRollupForDay,
  applyCuratedMealToDiary,
  setWater, getWater, createSavedMeal, confirmPlannedDay, clearPlannedDay,
  getSlotRecents, logFoodEntry, upsertSlotRecent,
} from '../lib/food/db';
// D138 one-tap usual: the SAME payload builders FoodSearchScreen's confirmLog
// uses, so a chip-logged entry and a sheet-logged entry are byte-identical.
import { buildFoodEntryPayload, buildSlotRecentPayload } from '../lib/food/loggingPayloads';
import { isoDate, shiftDate, weekDatesMon, weekdayShort, friendlyDate } from '../lib/food/diaryDates';
import { createRaceGuard } from '../lib/food/loadRaceGuard';
import { navigateCrossTab } from '../navigation/navigateCrossTab';
// resolveFoodRefs batches the diary's list reads (D138 item 6); resolveFoodRef
// stays for the single lookup the edit sheet makes when one row is opened.
import { resolveFoodRef, resolveFoodRefs } from '../lib/food/sources/localCache';
import { getNutritionTargets, getOpenEdPatternFlag, getLatestBodyWeight, getLatestBodyComposition, getLatestCoachOutput } from '../lib/database';
import { computeFFMFloor } from '../lib/nutritionEngine';
import { targetWasFloored } from '../lib/food/mealPlanAssembler';
import { getCuratedCandidates } from '../lib/food/curatedMeals';
import { rankSuggestions, mealsLeftToday } from '../lib/food/mealSuggest';
import { safeDayFloorKcal, displayBankedDelta } from '../lib/food/calorieBank';
import { resolveEffectiveTargets, dayTypeLabel } from '../lib/food/effectiveTargets';
import {
  resyncBankedPlannedFood, restoreUnbankedPlannedFood,
  withDoNotSuggest, doNotSuggestRefs,
} from '../lib/food/mealPlanService';
// Campaign 17B job 6: the bank receipt, in the user's words and real numbers.
import { bankHeadline, bankPlanLine } from '../lib/food/calorieBank';
import { buildPlanEditNarration } from '../lib/food/planExplain';
import CalorieBankSheet from '../components/food/CalorieBankSheet';
import DiaryDatePicker from '../components/food/DiaryDatePicker';
import { audit } from '../lib/observability';
import { logError } from '../lib/errorLog';
import useAppStore from '../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import MacroRings from '../components/food/MacroRings';
import MacroBreakdownSheet from '../components/food/MacroBreakdownSheet';
import FoodDetailSheet from '../components/food/FoodDetailSheet';
import QuickAddSheet from '../components/food/QuickAddSheet';
import BottomSheet from '../components/BottomSheet';
import EmptyDiary from '../components/food/EmptyDiary';
import EmptyState from '../components/EmptyState';
import { SkeletonRow } from '../components/Skeleton';
import MealSection, { usualPortionText } from '../components/food/MealSection';
import HintCaption from '../components/HintCaption';
import { friendlyFoodName } from '../components/food/EntryRow';
import ScreenHeader from '../components/ScreenHeader';
import Button from '../components/Button';
import SectionLabel from '../components/SectionLabel';
import Chip from '../components/Chip';
import TextField from '../components/TextField';
import { useToast } from '../components/Toast';
import { deleteEntries, restoreEntries, moveEntriesToSlot, copyEntriesToDate } from '../lib/food/bulkEntryOps';
import { shouldShowOffConsentCard, dismissOffConsentCard } from '../lib/food/writeback';
import { buildMealSlots, highestLoggedMeal, inferMealSlotForHour, DEFAULT_MEALS_PER_DAY } from '../lib/food/mealSlots';
import { scaleMacros } from '../lib/food/macros';
import { deriveDiaryDayViewModel } from '../lib/food/diaryViewModel';
import { toEnergy, energyUnitLabel } from '../lib/format';
import { parseLocalDay } from '../lib/dayKey';
import { touchTarget } from '../styles/layout';
import { getRecentIntakeSummary } from '../lib/food/db';
import { WELLBEING_KEY, isCalm } from '../lib/wellbeing';
import { resolveMealReminderOfferEligible, MEAL_REMINDER_OFFER_DISMISSED_KEY_FOR } from '../lib/food/mealReminderOffer';

// D138 item 6: the diary resolves its food refs in ONE batched read (the
// day's entries, and the usual chips per slot) via resolveFoodRefs.
async function resolveRefsBatched(userId, refs) {
  const unique = [...new Set((refs ?? []).filter(Boolean))];
  if (!unique.length) return new Map();
  return resolveFoodRefs(userId, unique);
}

// Audit item 6: same 7-day freshness window HomeScreen's coach banner uses
// (showCoachBanner), so "recent" reads consistently across the app.
const TARGETS_CHANGED_WINDOW_MS = 7 * 86400000;

// §15 item 8 (deep-link expansion): validates an incoming `route.params.date`
// from the volyume://diary/:date link or a future diary_day notification
// (both a local day-key, YYYY-MM-DD, `src/lib/dayKey.js`). Guards against a
// malformed external value ever producing an Invalid Date / NaN-keyed day;
// the caller falls back to today (or the current selection) instead.
function isValidDayKey(value) {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(parseLocalDay(value).getTime());
}

export default function DiaryScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const {
    user, calorieBank, sex, energyUnit, periWorkoutSlots,
    dietPreference, mealPlanExcludeFoods, mealPlanExcludeTags,
  } = useAppStore(useShallow((s) => ({
    user: s.user,
    calorieBank: s.userProfile?.calorieBank ?? null,
    sex: s.userProfile?.sex ?? null,
    energyUnit: s.accessibility?.energyUnit ?? 'kcal',
    // Pre/Post-workout meal cards are opt-in (off by default, 2026-07-11
    // fix): the same "Around training" preference the meal-plan generator
    // already gates on (MealPlanScreen.js), so one toggle controls both.
    periWorkoutSlots: !!s.userProfile?.mealPlanPeriWorkout,
    // Phase 2 (founder must-fix #6): the curated-meal suggestion for an empty
    // pre/post-workout slot needs the same diet + exclusion inputs the
    // FoodSearchScreen "Suggested" tab already uses.
    dietPreference: s.userProfile?.dietPreference ?? 'omnivore',
    mealPlanExcludeFoods: s.userProfile?.mealPlanExcludeFoods,
    mealPlanExcludeTags: s.userProfile?.mealPlanExcludeTags,
  })));
  const setCalorieBank = useAppStore((s) => s.setCalorieBank);
  const userId = user?.id;
  const toast = useToast();
  // CP-10 batch E (2026-07-10): live theme (src/hooks/useTheme.js). This
  // screen renders its rows via plain .map() inside a ScrollView (no
  // FlatList/FlashList/SectionList), so an unmemoised call matches
  // AddCustomFoodScreen's/FoodInsightsScreen's own precedent (batch D/E).
  const t = useTheme();
  const live = buildLiveStyles(t);

  // COMP-004's "Your trend" card was removed from the Diary (founder decision
  // 2026-06-16: a weight trend has nothing to do with the food diary). The
  // card still hosts on Progress/Analytics and the Home strip tap-through;
  // only the Diary mount is gone.

  const [selectedDate, setSelectedDate] = useState(() => {
    const paramDate = route?.params?.date;
    return isValidDayKey(paramDate) ? paramDate : isoDate(new Date());
  });
  // Diary is DiaryTab's root screen, so it stays mounted across tab
  // switches; a diary-day link/notification tapped while it's already
  // focused updates route.params on the existing instance rather than
  // remounting it, so the initializer above alone would miss it. Ignores an
  // absent/invalid date (leaves the current selection alone), never crashes.
  useEffect(() => {
    const paramDate = route?.params?.date;
    if (isValidDayKey(paramDate) && paramDate !== selectedDate) {
      setSelectedDate(paramDate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route?.params?.date]);
  const [entries, setEntries] = useState([]);
  // Whether the first load for the current day has resolved. Until then we show
  // a skeleton instead of the empty state, so a day that DOES have food never
  // flashes "Nothing logged yet" before it paints (food review U-M7).
  const [loaded, setLoaded] = useState(false);
  // EP-07/UI-02 (Codex end-user-polish audit): whether the MOST RECENT load()
  // attempt for the day in view failed. A failed load never wipes whatever
  // was already on screen (see the catch branch in load() below); it only
  // flips this flag so the render layer can show a retryable error state
  // instead of either a permanent skeleton or a false "nothing logged" empty
  // state. Reset to false on the next successful load.
  const [loadError, setLoadError] = useState(false);
  const [rollup, setRollup] = useState(null);
  const [waterMl, setWaterMl] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [targets, setTargets] = useState(null);
  // Open ED-pattern flag disables calorie banking (CB-1 safety carve-out).
  const [edFlagOpen, setEdFlagOpen] = useState(false);
  const [bankSheetVisible, setBankSheetVisible] = useState(false);
  // The safe per-day floor banking must never breach: max(sex floor, FFM floor)
  // (CB-1 blueprint line 90). Computed on load from latest weight + body comp.
  const [floorKcal, setFloorKcal] = useState(() => safeDayFloorKcal({ sex }));
  // Whether the day before the one in view has any food logged. Drives
  // EmptyDiary's optional "Copy yesterday" action; the premium meal builder
  // now owns planning for a day with no history.
  const [yesterdayHasFood, setYesterdayHasFood] = useState(false);
  // D138 item 2: yesterday's rows, kept so an empty meal can offer to copy
  // just THAT meal across. Loaded by the same (conditional) read that feeds
  // yesterdayHasFood, never a second query.
  const [yesterdayEntries, setYesterdayEntries] = useState([]);
  // The slot ladder currently on screen, for load()'s "is any meal empty?"
  // test. A ref, not a dep: adding mealSlots to load() would rebuild it (and
  // re-fire the focus effect) every time "Add meal" is tapped.
  const mealSlotKeysRef = useRef([]);
  // Audit item 6 (coach receipt chip): the latest coach output, read only for
  // Pro (free never reaches CoachOutputScreen so never has an applied
  // adjustment to point at). Used solely to detect a recent coach-applied
  // calorie/diet-break change and link to the exact week's receipt; nothing
  // else on this screen reads it.
  const [latestCoachOutput, setLatestCoachOutput] = useState(null);

  // BUG-1 (elite audit 2026-07-04): the day-load had no in-flight guard, so
  // rapid date navigation (or a focus-triggered load landing mid-flight)
  // could put two loads for different days in flight at once; whichever
  // resolved LAST used to win regardless of which day it was for, briefly
  // painting a stale day's calories/entries under the newer, currently-
  // selected date. loadGuardRef hands out a token per load() call; a load
  // only commits its result if it is still the most recently started one
  // when its awaits settle, so a slower stale request is silently dropped.
  const loadGuardRef = useRef(null);
  if (!loadGuardRef.current) loadGuardRef.current = createRaceGuard();

  const load = useCallback(async () => {
    if (!userId) return;
    const loadToken = loadGuardRef.current.next();
    // EP-07/UI-02: the whole body is now wrapped so a core read's rejection
    // can never leave `loaded` stuck at false (the old endless-skeleton bug)
    // nor pass silently while the day still shows stale/no data. A caught
    // failure never wipes entries/rollup/etc already on screen (see catch
    // below); only the try's own success path commits fresh values.
    try {
      const [es, r, w, targetsRow, edFlag, bodyWeight, bodyComp, coachOut] = await Promise.all([
        getFoodEntriesForDay(userId, selectedDate),
        getRollupForDay(userId, selectedDate),
        getWater(userId, selectedDate),
        getNutritionTargets(userId),
        // ED-safety, fail CLOSED: a transient flag read maps to the truthy
        // 'read_failed' sentinel (setEdFlagOpen(!!edFlag) below), so the banking
        // carve-out stays DISABLED at a possibly-flagged user rather than opening
        // on a read error.
        getOpenEdPatternFlag(userId).catch(() => 'read_failed'),
        getLatestBodyWeight(userId).catch(() => null),
        getLatestBodyComposition(userId).catch(() => null),
        // Audit item 6: best-effort. A read failure just hides the "Targets
        // updated" chip, it never blocks the rest of the diary load.
        getLatestCoachOutput(userId).catch(() => null),
      ]);
      // A newer load has started since this one began; drop this stale result
      // before doing any more work with it (never mind committing it).
      if (!loadGuardRef.current.isCurrent(loadToken)) return;
      // Safe banking floor = max(sex floor, FFM floor). FFM floor needs a body
      // weight; when present we use the engine's own computeFFMFloor (with body
      // fat if logged, else its sex-based fallback), matching the coach's RED-S
      // floor. No weight -> sex floor alone.
      let floor = safeDayFloorKcal({ sex });
      if (bodyWeight?.weightKg > 0) {
        try {
          const ffm = computeFFMFloor(bodyWeight.weightKg, {
            bodyFatPercent: bodyComp?.bodyFatPercent ?? null,
            bodyFatSource: bodyComp?.bodyFatSource ?? null,
            sex,
          });
          floor = safeDayFloorKcal({ sex, ffmFloorKcal: ffm?.floorKcal });
        } catch (_) { /* keep sex floor */ }
      }
      // D138 item 5: yesterday's entries are only READ when this day can
      // actually use them - the day is empty (the EmptyDiary "Copy yesterday"
      // CTA) or at least one visible meal is empty (the per-meal
      // "Yesterday's <meal>" chip). A day with every meal already filled
      // pays nothing for a fetch it cannot show. mealSlotKeysRef carries the
      // currently rendered slot ladder (assigned during render below).
      const loggedSlotKeys = new Set((es ?? []).map((e) => e.meal_slot));
      const needYesterday = (es ?? []).length === 0
        || (mealSlotKeysRef.current ?? []).some((k) => !loggedSlotKeys.has(k));
      // Resolve every entry's actual food name + brand from the foods /
      // custom_foods tables in ONE batched read (D138 item 6; food_entries
      // denormalises macros at log time but NOT the name, so without this
      // enrichment the row falls through to a generic "Food" label).
      const [foodMap, yEntries] = await Promise.all([
        resolveRefsBatched(userId, (es ?? []).map((e) => e.food_ref)).catch(() => new Map()),
        needYesterday
          ? getFoodEntriesForDay(userId, shiftDate(selectedDate, -1)).catch(() => [])
          : Promise.resolve([]),
      ]);
      const enriched = (es ?? []).map((entry) => {
        const food = foodMap?.get?.(entry.food_ref) ?? null;
        return {
          ...entry,
          _name: food?.name ?? null,
          _brand: food?.brand ?? null,
        };
      });
      // Check again: the enrichment await above is itself a second point where
      // a newer load could have started and already committed its own result.
      if (!loadGuardRef.current.isCurrent(loadToken)) return;
      setEntries(enriched);
      setRollup(r);
      setWaterMl(w);
      setTargets(targetsRow);
      setEdFlagOpen(!!edFlag);
      setFloorKcal(floor);
      // Only meaningful when the fetch actually ran; it gates the EmptyDiary
      // "Copy yesterday" CTA, which can only render on a day with no entries
      // at all - exactly one of the cases that forces the fetch above.
      setYesterdayEntries(yEntries ?? []);
      setYesterdayHasFood((yEntries?.length ?? 0) > 0);
      setLatestCoachOutput(coachOut ?? null);
      setLoadError(false);
    } catch (e) {
      // A stale (superseded) load failing is not news; only report/commit the
      // error for the load that is still the current one for this screen.
      if (loadGuardRef.current.isCurrent(loadToken)) {
        logError('DiaryScreen.load', e, { userId, selectedDate });
        setLoadError(true);
      }
    } finally {
      // Always settle `loaded`, success or failure, so a rejected read can
      // never leave the skeleton spinning forever (EP-07/UI-02).
      if (loadGuardRef.current.isCurrent(loadToken)) setLoaded(true);
    }
  }, [userId, selectedDate, sex]);

  // Planned scaffolding from a meal plan (adherence model): shown with a
  // confirm banner so it counts towards adherence only once the user says they
  // ate it. "Mark as eaten" flips the day's planned meals to actuals; "Clear"
  // discards them. Future days only offer Clear (you can't have eaten yet).
  // Count distinct planned MEALS (meal slots), not individual food items. A
  // day plan is ~6 meals of several foods each, so counting entries made the
  // banner read "20 planned meals" for a single planned day (QA 2026-06-16).
  // deriveDiaryDayViewModel's readOnly option is a lib API outside this
  // screen's lane; Volyume is fully free, so it is always false here.
  const { viewEntries, plannedCount, plannedTotals } = useMemo(
    () => deriveDiaryDayViewModel(entries, { readOnly: false }),
    [entries],
  );
  const isFutureDay = selectedDate > isoDate(new Date());

  const handleConfirmPlanned = useCallback(async () => {
    if (!userId) return;
    try {
      const n = await confirmPlannedDay(userId, selectedDate);
      await load();
      if (n > 0) dismissMarkEatenHint(); // discovery: bulk mark-as-eaten used
      if (n > 0) dismissPlanAddedHint(); // same discovery, plan-added teach's signal
      toast.show(n > 0 ? `${n} planned ${n === 1 ? 'meal' : 'meals'} marked as eaten.` : 'Nothing to confirm.', { variant: n > 0 ? 'success' : 'info' });
    } catch (_) {
      toast.show("Couldn't update. Try again.", { variant: 'error' });
    }
  }, [userId, selectedDate, load, toast, dismissMarkEatenHint, dismissPlanAddedHint]);

  // Food audit item 1 ("mark planned meal eaten", one tap): confirm just ONE
  // meal's planned rows, not the whole day, so staging a plan into the diary
  // does not force an all-or-nothing choice. Same real write path as the
  // day-level confirm (confirmPlannedDay -> is_planned 1->0), scoped to a
  // meal_slot; MealSection only renders the button when that slot actually
  // holds planned rows.
  const handleConfirmPlannedSlot = useCallback(async (slotKey) => {
    if (!userId || !slotKey) return;
    try {
      const n = await confirmPlannedDay(userId, selectedDate, slotKey);
      await load();
      if (n > 0) {
        dismissMarkEatenHint(); // discovery: per-meal mark-as-eaten used
        dismissPlanAddedHint(); // same discovery, plan-added teach's signal
        toast.show('Marked as eaten.', { variant: 'success' });
      }
    } catch (_) {
      toast.show("Couldn't update. Try again.", { variant: 'error' });
    }
  }, [userId, selectedDate, load, toast, dismissMarkEatenHint, dismissPlanAddedHint]);

  const handleClearPlanned = useCallback(async () => {
    if (!userId) return;
    try {
      await clearPlannedDay(userId, selectedDate);
      await load();
      toast.show('Planned meals cleared.', { variant: 'info' });
    } catch (_) {
      toast.show("Couldn't update. Try again.", { variant: 'error' });
    }
  }, [userId, selectedDate, load, toast]);

  // Calorie banking (CB-1) availability: disabled when the target was
  // floored/compressed or an ED-pattern flag is open. (The carb-cycle and
  // refeed carve-outs went with those features under the one-daily-truth law,
  // Campaign 17A: banking is now the ONLY thing that moves a single day, so
  // there is nothing left for it to collide with.) This single gate governs
  // BOTH whether the control appears AND whether a persisted bank is allowed
  // to display, so a stale bank can never apply once a carve-out closes
  // banking (review fix #2).
  const bankingAvailable = !!targets && !targetWasFloored(targets) && !edFlagOpen;

  // The banked delta to show for the day in view. Zero unless banking is
  // currently allowed, even if a bank is still persisted.
  const bankedDelta = useMemo(
    () => displayBankedDelta({ bankingAvailable, calorieBank, dayKey: selectedDate }),
    [bankingAvailable, calorieBank, selectedDate],
  );

  // The effective macro target for the day: the stored nutrition target,
  // unless the athlete has banked calories onto (or off) this day themselves.
  // ONE DAILY TRUTH (Campaign 17A) - nothing else moves it.
  const effectiveTargets = useMemo(
    () => resolveEffectiveTargets(targets, { bankedDelta }),
    [targets, bankedDelta],
  );

  const dayTypeChip = dayTypeLabel({ bankedDelta });

  // Audit item 6 (coach receipt chip, size S): a quiet "Targets updated" link
  // shown ONLY when the COACH itself changed the calorie target recently, so
  // it never mis-attributes a self-made edit (Nutrition Targets screen,
  // ProGoalSetup) to the coach. `appliedAdjustments` is only ever written by
  // CoachOutputScreen's confirm-then-apply handlers (markApplied in
  // coachApply.js), so its presence IS the receipt: tapping the chip opens
  // that exact week's decision, the real "why", not a guess. No new
  // explanation engine, no new persistence, this reads the same coach_outputs
  // row YouScreen already reads via getLatestCoachOutput.
  const coachTargetsChange = latestCoachOutput?.appliedAdjustments?.calories
    ?? latestCoachOutput?.appliedAdjustments?.dietBreak
    ?? null;
  const targetsChangedRecently = !!coachTargetsChange?.appliedAt
    && (Date.now() - coachTargetsChange.appliedAt) < TARGETS_CHANGED_WINDOW_MS;

  // Banking handlers (CB-1). bankingAvailable is computed above (governs the
  // control AND any persisted bank's display).
  const weekDates = useMemo(() => weekDatesMon(selectedDate), [selectedDate]);
  const selectedDateDetail = useMemo(() => {
    const d = parseLocalDay(selectedDate);
    if (Number.isNaN(d.getTime())) return selectedDate;
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  }, [selectedDate]);
  const bankActiveThisWeek = !!calorieBank && weekDates.includes(calorieBank.bigDayKey);

  const applyBank = useCallback(async (bank) => {
        // CB-1b: move the planned FOOD to match the new per-day targets, not just the
    // target number. The food rewrite is the write boundary: a failed rewrite
    // must not leave an applied target whose visible meals still describe the
    // ordinary week.
    let perDayChanges = [];
    try {
      const res = await resyncBankedPlannedFood(userId, {
        perDayDeltaKcal: bank?.perDayDeltaKcal, floorKcal, startDate: isoDate(new Date()),
      });
      perDayChanges = res.perDayChanges || [];
    } catch (_) {
      toast.show("Couldn't plan your higher-calorie day. Nothing has changed, so try again in a moment.", { variant: 'error' });
      return;
    }
    await setCalorieBank(bank);
    setBankSheetVisible(false);
    await load();
    // Campaign 17B job 6: lead with the plain fact, in ACTUAL values, before
    // the per-day detail. "You have moved 300 calories to Saturday. Your
    // weekly total has not changed."
    const bigLabel = friendlyDate(bank?.bigDayKey);
    const headline = bankHeadline({
      deltaKcal: bank?.perDayDeltaKcal?.[bank?.bigDayKey],
      dayLabel: bigLabel,
      otherDays: Object.keys(bank?.perDayDeltaKcal || {}).length - 1,
    });
    if (perDayChanges.length > 0) {
      const lines = perDayChanges.map(({ dayKey, change }) => {
        const n = buildPlanEditNarration(change, { register: 'supportive' });
        const detail = (n.edits && n.edits.length) ? n.edits.join(' ') : (n.body || '');
        return `${friendlyDate(dayKey)}: ${detail}`.trim();
      });
      appAlert(
        'Your week, adjusted',
        [headline, bankPlanLine(bigLabel), '', lines.join('\n\n'), '', 'Change anything you like.']
          .filter((x) => x !== null && x !== undefined).join('\n'),
        [{ text: 'OK' }],
      );
    } else if (headline) {
      appAlert('Your week, adjusted', headline, [{ text: 'OK' }]);
    } else {
      toast.show('Higher-calorie day planned. Your weekly total stays the same.', { variant: 'success' });
    }
  }, [setCalorieBank, toast, userId, floorKcal, load]);

  const clearBank = useCallback(async () => {
        // Restore the original (un-banked) planned food before clearing the bank.
    try {
      await restoreUnbankedPlannedFood(userId, {
        perDayDeltaKcal: calorieBank?.perDayDeltaKcal, startDate: isoDate(new Date()),
      });
    } catch (_) {
      toast.show("Couldn't undo your higher-calorie day. It is still planned, so try again in a moment.", { variant: 'error' });
      return;
    }
    await setCalorieBank(null);
    setBankSheetVisible(false);
    await load();
    toast.show('Higher-calorie day cleared.', { variant: 'info' });
  }, [setCalorieBank, toast, userId, calorieBank, load]);

  // BUG-1: this used to also fire from a plain `useEffect(() => { load(); },
  // [load])` alongside the useFocusEffect below. useFocusEffect already
  // re-runs on every `load` change (new selectedDate/macroCycle/refeed/sex)
  // whenever the screen is focused, same as a bare effect would, so the two
  // triggers doubled every load's concurrency for no benefit and made the
  // stale-result race easier to hit. One trigger is enough: mount, refocus,
  // and every dependency change while this tab is the one in view.
  useFocusEffect(useCallback(() => { load().catch(() => {}); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  // Bucket every entry by its slot, whatever the slot key (numbered, legacy or
  // peri-workout), so nothing logged is ever dropped.
  const entriesBySlot = useMemo(() => {
    const out = {};
    for (const e of viewEntries) {
      (out[e.meal_slot] ??= []).push(e);
    }
    return out;
  }, [viewEntries]);

  // The flexible numbered-meal model: a ladder of "Meal 1..N" plus the two
  // peri-workout meals, never fewer than the highest numbered meal already
  // logged, extended by the "Add meal" affordance. buildMealSlots also folds in
  // any legacy slot that has entries so existing diaries keep showing.
  // The numbered ladder honours the user's meals-per-day preference (set in
  // Nutrition targets, the same `@volyume_meals_per_day` key the suggestion
  // engine reads), defaulting to DEFAULT_MEALS_PER_DAY. "Add meal" extends it
  // for the session; the ladder is never shorter than the highest numbered
  // meal already logged that day.
  const [prefMeals, setPrefMeals] = useState(DEFAULT_MEALS_PER_DAY);
  const [addedMeals, setAddedMeals] = useState(0);
  useEffect(() => { setAddedMeals(0); }, [selectedDate]);

  // COMP-022 one-time OFF-consent card: offered after a first completed
  // barcode-heal chain, never mid-task. Re-checked on focus so flipping consent
  // (or dismissing) makes it disappear next time.
  const [showOffCard, setShowOffCard] = useState(false);
  useFocusEffect(useCallback(() => {
    let active = true;
    shouldShowOffConsentCard().then((show) => { if (active) setShowOffCard(show); }).catch(() => {});
    return () => { active = false; };
  }, []));
  const onDismissOffCard = useCallback(() => {
    setShowOffCard(false);
    dismissOffConsentCard().catch(() => {});
  }, []);

  // Item 9(c) (D141): a calm, one-time, dismissible offer for the opt-in
  // meal-log reminder (Settings -> Notifications and reminders -> Meal
  // reminders), shown only on today's diary when the diary itself shows
  // the gap the reminder would help close. Pure eligibility
  // (resolveMealReminderOfferEligible) computed from facts this screen
  // already loads (targets, edFlagOpen -- both fail CLOSED per this
  // screen's own load(), see edFlagOpen's comment above) plus three small
  // reads: the existing 7-day intake summary (day-level presence, reused
  // rather than a new query), the meal-reminders AsyncStorage flag, and
  // this offer's own per-user dismissal marker. Calm mode has no existing
  // read on this screen, so it is read directly here and, like the ED
  // flag, fails CLOSED (a read failure suppresses the offer -- CLAUDE.md
  // forbids a food-adjacent nudge under either signal, on doubt or not).
  const [mealReminderOfferVisible, setMealReminderOfferVisible] = useState(false);
  useEffect(() => {
    let active = true;
    if (!loaded || !userId || selectedDate !== isoDate(new Date())) {
      setMealReminderOfferVisible(false);
      return undefined;
    }
    // scheduler.js pulls in expo-notifications at module scope; a static
    // import of it here would drag that into every test that mounts this
    // whole screen (DiaryScreen.bankingAvailable.test.js,
    // DiaryScreen.dailyWorkspace.test.js), which do not mock it. Lazy
    // require, guarded, with a literal fallback that matches the exported
    // constant -- the same value either way, this only changes WHEN the
    // module graph is walked.
    let mealRemindersKey = '@volyume_meal_reminders'; // MEAL_REMINDERS_KEY, src/lib/notifications/scheduler.js
    try {
      // eslint-disable-next-line global-require
      mealRemindersKey = require('../lib/notifications/scheduler').MEAL_REMINDERS_KEY;
    } catch (_) { /* keep the literal fallback above */ }
    (async () => {
      // Best-effort, wrapped whole: any read failing (including a
      // synchronous throw, not just a rejection) must only suppress the
      // offer, never break the diary screen around it.
      try {
        const [summary, remindersRaw, wellbeingRaw, dismissedRaw] = await Promise.all([
          Promise.resolve().then(() => getRecentIntakeSummary(userId)).catch(() => null),
          AsyncStorage.getItem(mealRemindersKey).catch(() => null),
          AsyncStorage.getItem(WELLBEING_KEY).catch(() => 'read_failed'),
          AsyncStorage.getItem(MEAL_REMINDER_OFFER_DISMISSED_KEY_FOR(userId)).catch(() => null),
        ]);
        if (!active) return;
        let mealRemindersEnabled = false;
        try {
          const parsedReminders = remindersRaw ? JSON.parse(remindersRaw) : null;
          mealRemindersEnabled = Array.isArray(parsedReminders) && parsedReminders.some((r) => r?.enabled === true);
        } catch (_) { mealRemindersEnabled = false; }
        // A null read (key never set) legitimately means 'unspecified', not
        // a failure; only the .catch above maps an actual read error to the
        // 'read_failed' sentinel, matching every other fail-closed read on
        // this screen (edFlagOpen above, HomeScreen's identical convention).
        const wellbeing = wellbeingRaw || 'unspecified';
        setMealReminderOfferVisible(resolveMealReminderOfferEligible({
          hasAccount: !!userId,
          hasNutritionTargets: !!targets,
          daysLoggedLast7: summary?.daysLogged,
          mealRemindersEnabled,
          calmMode: wellbeingRaw === 'read_failed' || isCalm(wellbeing),
          edFlagOpen: !!edFlagOpen,
          dismissed: dismissedRaw === 'true',
        }));
      } catch (_) {
        if (active) setMealReminderOfferVisible(false);
      }
    })();
    return () => { active = false; };
  }, [loaded, userId, targets, edFlagOpen, selectedDate]);
  const dismissMealReminderOffer = useCallback(() => {
    setMealReminderOfferVisible(false);
    AsyncStorage.setItem(MEAL_REMINDER_OFFER_DISMISSED_KEY_FOR(userId), 'true').catch(() => {});
  }, [userId]);
  useFocusEffect(useCallback(() => {
    let active = true;
    AsyncStorage.getItem('@volyume_meals_per_day').then((v) => {
      const n = parseInt(v, 10);
      if (active && Number.isFinite(n) && n >= 1) setPrefMeals(n);
    }).catch(() => {});
    return () => { active = false; };
  }, []));

  // NU-9: per-user daily water target (device-local preference). Defaults to
  // the old hardcoded 3.0 L; tapping the water value picks a new one. Purely
  // a hydration nudge, so it stays well away from calorie/coaching targets.
  const [waterTargetMl, setWaterTargetMl] = useState(WATER_TARGET_ML);
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(WATER_TARGET_KEY).then((v) => {
      const n = parseInt(v, 10);
      if (active && Number.isFinite(n) && n >= 1000 && n <= 6000) setWaterTargetMl(n);
    }).catch(() => {});
    return () => { active = false; };
  }, []);
  const changeWaterTarget = useCallback(() => {
    appAlert(
      'Daily water target',
      'Pick the daily amount you are aiming for.',
      [
        ...[2000, 2500, 3000, 3500, 4000].map((n) => ({
          text: `${(n / 1000).toFixed(1)} L`,
          onPress: () => {
            setWaterTargetMl(n);
            AsyncStorage.setItem(WATER_TARGET_KEY, String(n)).catch(() => {});
          },
        })),
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  }, []);

  // Wave A C7 (2026-07-03): two long-press-only fast paths had no visible
  // affordance for a sighted user (accessibilityHint/accessibilityLabel only)
  //, holding a food row to edit its portion (FoodSearchScreen's "add again"
  // rows) or to start multi-select here, and holding the water +/- to move
  // 500ml instead of 250. Each gets a single one-time caption, same
  // '@volyume_seen_*' convention as ActiveWorkoutScreen's info-button tip:
  // shown until the user performs the gesture it describes (proves
  // discovery) or dismisses it directly, never again after.
  // showFoodHint state removed 2026-07-13 (founder order): the caption is
  // gone; the once-ever key + dismissFoodHint discovery write remain.
  const [showWaterHint, setShowWaterHint] = useState(false);
  // D12 item 3 (ux-world-class-audit-2026-07-09): a user's first sight of
  // planned meals in the diary now has no bulk-mark button right there (it
  // moved to the bottom of the page, D12 item 2), so this one-time hint
  // teaches both ways to confirm a planned meal, same once-ever convention.
  const [showMarkEatenHint, setShowMarkEatenHint] = useState(false);
  // Founder ask (2026-07-09): fires once ever, only on arrival from the meal
  // builder / meal plan's "Add this day" / "Add this week" (route param
  // `justAddedPlan`, set by MealPlanScreen), not on every sighting of planned
  // meals like DIARY_MARKEATEN_HINT_KEY above.
  const [showPlanAddedHint, setShowPlanAddedHint] = useState(false);
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(DIARY_WATER_HINT_KEY).then((v) => {
      if (active && v !== 'true') setShowWaterHint(true);
    }).catch(() => {});
    AsyncStorage.getItem(DIARY_MARKEATEN_HINT_KEY).then((v) => {
      if (active && v !== 'true') setShowMarkEatenHint(true);
    }).catch(() => {});
    return () => { active = false; };
  }, []);
  // One-shot: only when the nav param is actually present (arriving straight
  // from a meal-builder add), and only if never dismissed before. The param
  // is cleared immediately so revisiting this Diary instance later (tab
  // round-trip, backgrounding) never re-fires it, matching the setParams
  // idiom AnalyticsScreen's focusWeightTrend and RecipeBuilderScreen's
  // addedIngredient already use for a one-shot arrival signal.
  useEffect(() => {
    if (!route?.params?.justAddedPlan) return;
    navigation.setParams({ justAddedPlan: undefined });
    let active = true;
    AsyncStorage.getItem(DIARY_PLANADDED_HINT_KEY).then((v) => {
      if (active && v !== 'true') setShowPlanAddedHint(true);
    }).catch(() => {});
    return () => { active = false; };
  }, [route?.params?.justAddedPlan, navigation]);
  const dismissFoodHint = useCallback(() => {
    AsyncStorage.setItem(DIARY_FOOD_HINT_KEY, 'true').catch(() => {});
  }, []);
  const dismissWaterHint = useCallback(() => {
    setShowWaterHint(false);
    AsyncStorage.setItem(DIARY_WATER_HINT_KEY, 'true').catch(() => {});
  }, []);
  const dismissMarkEatenHint = useCallback(() => {
    setShowMarkEatenHint(false);
    AsyncStorage.setItem(DIARY_MARKEATEN_HINT_KEY, 'true').catch(() => {});
  }, []);
  const dismissPlanAddedHint = useCallback(() => {
    setShowPlanAddedHint(false);
    AsyncStorage.setItem(DIARY_PLANADDED_HINT_KEY, 'true').catch(() => {});
  }, []);

  const mealsPerDay = Math.max(prefMeals + addedMeals, highestLoggedMeal(viewEntries));
  const mealSlots = useMemo(
    () => buildMealSlots(viewEntries, mealsPerDay, periWorkoutSlots),
    [viewEntries, mealsPerDay, periWorkoutSlots],
  );
  const likelyMealSlot = useMemo(() => {
    const keys = mealSlots.map((m) => m.key);
    if (selectedDate === isoDate(new Date())) return inferMealSlotForHour(new Date().getHours(), keys);
    return keys[0] ?? null;
  }, [mealSlots, selectedDate]);
  const visibleSlots = mealSlots;
  // Assigned during render (derived purely from the memo above) so load()'s
  // conditional yesterday read always tests the ladder that is actually on
  // screen, without making load() depend on it.
  mealSlotKeysRef.current = mealSlots.map((m) => m.key);

  // GAP #5: usual-food shortcuts for empty meal slots. Each slot offers up to three
  // of the foods most logged into THAT slot (the same `food_slot_recents`
  // ranking the "Add again" list uses), resolved to current food records, so a
  // regular breakfast is a single tap rather than a search. Only ever shown on a
  // slot with no entries yet, so it reads as a prompt, never as clutter over
  // food already logged. Keyed on the memoised mealSlots so it reloads after a
  // log (recents shift) or a date change, and never on every render.
  const [slotUsuals, setSlotUsuals] = useState({});
  useEffect(() => {
    if (!userId) { setSlotUsuals({}); return; }
    let active = true;
    (async () => {
      const rowsPerSlot = await Promise.all(
        mealSlots.map((slot) => getSlotRecents(userId, slot.key, 3).catch(() => [])),
      );
      // D138 item 6: one batched resolve for every slot's recents together,
      // instead of a resolve per row per slot (up to 3 x slots round trips).
      const refs = rowsPerSlot.flat().map((row) => row?.food_ref).filter(Boolean);
      const foodMap = await resolveRefsBatched(userId, refs).catch(() => new Map());
      const next = {};
      mealSlots.forEach((slot, i) => {
        const foods = (rowsPerSlot[i] ?? []).map((row) => {
          const food = foodMap?.get?.(row.food_ref) ?? null;
          if (!food) return null;
          // Carry the remembered portion through: it is what the chip states
          // and what a one-tap log writes (and what FoodDetailSheet opens on
          // when the user holds the chip to change it).
          return { ...food, food_ref: row.food_ref, last_quantity_g: row.last_quantity_g };
        }).filter(Boolean);
        if (foods.length) next[slot.key] = foods;
      });
      if (active) setSlotUsuals(next);
    })();
    return () => { active = false; };
  }, [userId, selectedDate, mealSlots]);

  // Hold a usual chip (or tap one with no remembered portion): the food is
  // only a preselection, and the shared detail sheet still confirms grams,
  // meal and date before its normal write path runs. This is the path that
  // existed before D138 and it stays exactly as it was.
  const onEditUsual = useCallback((food, slotKey) => {
    if (!userId || !food) return;
    haptics.selection();
    navigation.navigate('FoodSearch', {
      entryDate: selectedDate,
      mealSlot: slotKey,
      preselectedFood: food,
    });
  }, [userId, selectedDate, navigation]);

  // D138 item 1: ONE tap logs the remembered portion the chip already states.
  // The write is the diary's canonical one (buildFoodEntryPayload ->
  // logFoodEntry -> upsertSlotRecent -> reload), the same calls
  // FoodSearchScreen's confirmLog makes, followed by the undo-variant toast
  // every other log path shows. No haptic on the write itself: a diary-marking
  // moment is the recorded no-haptic exception (docs/remediation-2026-07-11/
  // FOOD-DESIGN-STANDARD.md, "Haptics vocabulary"), so only the neutral
  // navigation on hold ticks. A food with no remembered weight falls back to
  // the sheet rather than guessing one.
  const loggingUsualRef = useRef(false);
  const onLogUsual = useCallback(async (food, slotKey) => {
    if (!userId || !food) return;
    const quantityG = Math.round(Number(food.last_quantity_g) || 0);
    if (!(quantityG > 0)) { onEditUsual(food, slotKey); return; }
    if (loggingUsualRef.current) return; // a fast double tap logs once
    loggingUsualRef.current = true;
    try {
      audit('food.add', {
        source: food.source ?? 'unknown',
        mealSlot: slotKey,
        fromScan: false,
        surface: 'diary_usual',
      });
      const entryId = await logFoodEntry(userId, buildFoodEntryPayload({
        entryDate: selectedDate,
        mealSlot: slotKey,
        foodRef: food.food_ref,
        quantityG,
        food,
      }));
      await upsertSlotRecent(userId, buildSlotRecentPayload({
        mealSlot: slotKey,
        foodRef: food.food_ref,
        quantityG,
      })).catch(() => {}); // derived memory only; never fail the log
      await load();
      const portion = usualPortionText({ ...food, last_quantity_g: quantityG });
      toast.show(`${food.name ?? 'Food'} logged, ${portion ?? `${quantityG} g`}.`, {
        variant: 'undo',
        action: {
          label: 'Undo',
          onPress: async () => {
            try { await deleteFoodEntry(entryId, userId); } catch (_) { /* already gone */ }
            await load();
          },
        },
      });
    } catch (e) {
      logError('DiaryScreen.logUsual', e, { userId, slotKey });
      toast.show("Couldn't log that. Try again.", { variant: 'error' });
    } finally {
      loggingUsualRef.current = false;
    }
  }, [userId, selectedDate, load, toast, onEditUsual]);

  // D138 item 2: yesterday's rows for THIS day's view, bucketed by meal and
  // limited to real intake. A planned-but-unconfirmed row was never eaten, so
  // it is not part of "yesterday's breakfast" and is never copied forward.
  const yesterdaySlotEntries = useMemo(() => {
    const out = {};
    for (const e of (yesterdayEntries ?? [])) {
      if (e.is_planned) continue;
      (out[e.meal_slot] ??= []).push(e);
    }
    return out;
  }, [yesterdayEntries]);

  // Copy ONE of yesterday's meals into the same meal today. Same per-entry
  // primitive as every other copy path (copyEntriesToDate -> logFoodEntry), so
  // rollups, sync and telemetry stay consistent; the created ids drive a
  // single Undo that removes every copied row (MyMealsScreen's saved-meal
  // undo pattern).
  const copyYesterdaySlot = useCallback(async (slotKey, slotLabel) => {
    const rows = yesterdaySlotEntries[slotKey] ?? [];
    if (!userId || !rows.length) return;
    try {
      const ids = await copyEntriesToDate(userId, rows, selectedDate, { mealSlot: slotKey });
      await load();
      toast.show(`${slotLabel} copied from yesterday, ${ids.length} ${ids.length === 1 ? 'entry' : 'entries'}.`, {
        variant: 'undo',
        action: {
          label: 'Undo',
          onPress: async () => {
            try { await Promise.all(ids.map((id) => deleteFoodEntry(id, userId))); } catch (_) { /* already gone */ }
            await load();
          },
        },
      });
    } catch (e) {
      logError('DiaryScreen.copyYesterdaySlot', e, { userId, slotKey });
      toast.show("Couldn't copy that meal. Try again.", { variant: 'error' });
    }
  }, [userId, selectedDate, yesterdaySlotEntries, load, toast]);

  // Founder must-fix #6 phase 2: a genuine meal suggestion for an empty
  // pre/post-workout slot, not just a visible-but-empty card. Reuses the
  // exact deterministic ranking FoodSearchScreen's "Suggested" tab already
  // uses (getCuratedCandidates filtered to the slot's preworkout/postworkout
  // tag + the user's diet/exclusions, then rankSuggestions against the day's
  // REMAINING macros, i.e. target minus what's already logged). Because the
  // candidate is scored on what's left of the day, adding it redistributes
  // within the existing day target rather than adding on top - the same
  // aggregate-safety mealPlanAssembler.js relies on, just applied to a
  // single manual pick instead of a whole generated day. Only ever computed
  // for a slot that is enabled (mealSlots already gates on periWorkoutSlots)
  // and currently empty; a slot with food already logged never shows a
  // suggestion.
  const [slotMealSuggestion, setSlotMealSuggestion] = useState({});
  useEffect(() => {
    if (!userId) { setSlotMealSuggestion({}); return; }
    const periSlots = mealSlots.filter(
      (s) => (s.key === 'preworkout' || s.key === 'postworkout') && !(entriesBySlot[s.key]?.length),
    );
    if (!periSlots.length) { setSlotMealSuggestion({}); return; }
    let active = true;
    (async () => {
      try {
        const [targetsRow, rollup, dontSuggest] = await Promise.all([
          getNutritionTargets(userId),
          getRollupForDay(userId, selectedDate),
          // Campaign 17B job 8: a food the user marked "don't suggest" on its
          // own row must not come back through a curated peri-workout meal.
          doNotSuggestRefs(userId),
        ]);
        if (!targetsRow) { if (active) setSlotMealSuggestion({}); return; }
        const targets = {
          kcal: targetsRow.targetKcal, protein: targetsRow.proteinG,
          carbs: targetsRow.carbsG, fat: targetsRow.fatG,
        };
        const consumed = rollup
          ? { kcal: rollup.kcal_total, protein: rollup.protein_g, carbs: rollup.carbs_g, fat: rollup.fat_g }
          : { kcal: 0, protein: 0, carbs: 0, fat: 0 };
        const loggedSlots = viewEntries.map((e) => e.meal_slot);
        const mealsLeft = mealsLeftToday(mealsPerDay, loggedSlots);
        const next = {};
        periSlots.forEach((slot) => {
          const candidates = getCuratedCandidates({
            diet: dietPreference,
            slot: slot.key,
            ...withDoNotSuggest(
              { excludeFoodKeys: mealPlanExcludeFoods, excludeTags: mealPlanExcludeTags },
              dontSuggest,
            ),
          });
          const { suggestions } = rankSuggestions({
            targets, consumed, savedMeals: candidates, foods: [], slot: slot.key, mealsLeft, limit: 1,
          });
          if (suggestions.length) next[slot.key] = suggestions[0];
        });
        if (active) setSlotMealSuggestion(next);
      } catch (_) {
        if (active) setSlotMealSuggestion({});
      }
    })();
    return () => { active = false; };
  }, [
    userId, selectedDate, mealSlots, entriesBySlot, viewEntries, mealsPerDay,
    dietPreference, mealPlanExcludeFoods, mealPlanExcludeTags,
  ]);

  // One-tap log of the pre/post-workout meal suggestion: fans the curated
  // meal's foods into the diary at this slot/date via the same write path
  // FoodSearchScreen's "Add to diary" uses (applyCuratedMealToDiary), then
  // refreshes so the day's rollup/macro rings reflect it immediately. No
  // silent retry, no partial fallback: a failure surfaces a calm toast and
  // the slot stays empty for the user to try again or pick manually.
  const loggingMealSuggestionRef = useRef(false);
  const onLogMealSuggestion = useCallback(async (suggestion, slotKey) => {
    if (!userId || !suggestion?.id || loggingMealSuggestionRef.current) return;
    loggingMealSuggestionRef.current = true;
    audit('food.suggestMeal', { surface: 'diary_periworkout', mealId: suggestion.id, mealSlot: slotKey });
    try {
      const logged = await applyCuratedMealToDiary(userId, suggestion.id, { mealSlot: slotKey, entryDate: selectedDate });
      if (!logged) { toast.show("Couldn't add that meal. Try again.", { variant: 'error' }); return; }
      await load();
      toast.show(`${suggestion.name ?? 'Meal'} added.`, { variant: 'success' });
    } catch (_) {
      toast.show("Couldn't add that meal. Try again.", { variant: 'error' });
    } finally {
      loggingMealSuggestionRef.current = false;
    }
  }, [userId, selectedDate, load, toast]);

  // Haptics completion pass (2026-07-10): the haptic lives INSIDE the
  // handler (not wrapped at the JSX callsite) so the swipe gesture, which
  // shares these exact closures via dayNavRef (daySwipe.guard.test.js),
  // gets the same feel as the chevron tap -- and the chevron's
  // onPress={gotoYesterday}/{gotoTomorrow} wiring the guard pins stays a
  // bare reference.
  function gotoYesterday() { haptics.selection(); setSelectedDate(shiftDate(selectedDate, -1)); }
  function gotoTomorrow()  { haptics.selection(); setSelectedDate(shiftDate(selectedDate, 1)); }
  function gotoToday()     { setSelectedDate(isoDate(new Date())); }

  // NAV-3 (elite audit 2026-07-04): the diary only had single-day chevrons
  // for the whole history, so correcting food from three weeks ago meant
  // ~21 chevron taps. Tapping the date label opens the native date picker
  // (DiaryDatePicker) to jump straight to any day; the chevrons and swipe
  // are untouched. A read (viewing a different day), so it stays available
  // read-only too, same as the chevrons.
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  // Haptics completion pass (2026-07-10): haptic lives inside the handler
  // (not the JSX callsite) so onPress={openDatePicker} stays a bare
  // reference (raceGuardAndDateJump.guard.test.js pins the exact wiring).
  const openDatePicker = useCallback(() => { haptics.selection(); setDatePickerVisible(true); }, []);
  const closeDatePicker = useCallback(() => setDatePickerVisible(false), []);
  const onPickDate = useCallback((iso) => setSelectedDate(iso), []);

  // C5: a horizontal swipe on the diary body is a second way to change day,
  // the chevrons (day pager row below) stay as-is. Fling only activates on a
  // fast, predominantly-horizontal flick past its own threshold, so it never
  // contests the vertical ScrollView (or its pull-to-refresh) underneath it;
  // no simultaneous/waitFor wiring needed. Swipe LEFT reads as "go forward"
  // (next day), swipe RIGHT as "go back" (previous day), the same sense as
  // paging through a calendar or photo gallery.
  //
  // Latest-ref pattern (same idiom as the VolyumeChart scrub gesture,
  // src/components/VolyumeChart.js): the Gesture.Race is built once (stable
  // deps []) so it is never rebuilt on every render, but it always calls
  // through to the CURRENT gotoTomorrow/gotoYesterday closure via the ref,
  // never a stale `selectedDate` captured when the gesture was first built.
  const dayNavRef = useRef({ next: gotoTomorrow, prev: gotoYesterday });
  dayNavRef.current.next = gotoTomorrow;
  dayNavRef.current.prev = gotoYesterday;
  const daySwipe = useMemo(() => {
    const next = () => dayNavRef.current.next();
    const prev = () => dayNavRef.current.prev();
    return Gesture.Race(
      Gesture.Fling().direction(Directions.LEFT).onEnd(() => { runOnJS(next)(); }),
      Gesture.Fling().direction(Directions.RIGHT).onEnd(() => { runOnJS(prev)(); }),
    );
  }, []);

  function addFood(slot) {
    // Search-first flow: most adds will be a known food. The search
    // screen surfaces a "create a custom food" CTA inline for misses.
    navigation.navigate('FoodSearch', { mealSlot: slot, entryDate: selectedDate });
  }

  function addSavedMeal(slot) {
    setSavedPickerSlot(slot);
  }

  function scanForMeal(slot) {
    navigation.navigate('ScanBarcode', { mealSlot: slot, entryDate: selectedDate });
  }

  const [editSheet, setEditSheet] = useState(null); // { entry, food } | null

  // Quick add straight from a meal card (COMP-003): the escape hatch for
  // meals not worth a lookup. Same sheet and write path as the tertiary
  // flash-icon route in FoodSearchScreen, reached with zero navigation.
  const [quickAddSlot, setQuickAddSlot] = useState(null); // meal slot key | null
  const [savedPickerSlot, setSavedPickerSlot] = useState(null); // meal slot key | null

  function openSavedFoodRoute(routeName) {
    const mealSlot = savedPickerSlot || likelyMealSlot || 'snack';
    setSavedPickerSlot(null);
    navigation.navigate(routeName, { mealSlot, entryDate: selectedDate });
  }

  async function confirmQuickAdd({ kcal, protein, carbs, fat, mealSlot }) {
        // food_ref 'quick:adhoc' has no resolvable name, so the diary shows it
    // as "Quick add" with no gram weight.
    // eslint-disable-next-line global-require
    const { logFoodEntry } = require('../lib/food/db');
    await logFoodEntry(userId, {
      entryDate: selectedDate,
      mealSlot,
      foodRef: 'quick:adhoc',
      quantityG: 0,
      kcal,
      proteinG: protein,
      carbsG: carbs,
      fatG: fat,
      fibreG: null,
    });
    await load();
  }

  // Multi-select (GAP row 26) + per-meal breakdown sheet (GAP row 27).
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [movePickerVisible, setMovePickerVisible] = useState(false);
  const [saveMealItems, setSaveMealItems] = useState(null); // captured items | null
  const [saveMealName, setSaveMealName] = useState('');
  const [breakdownVisible, setBreakdownVisible] = useState(false);
  // F-6: jump from the macro breakdown sheet to a meal card. We capture each
  // meal section's y in the scroll content and scrollTo it.
  const scrollRef = useRef(null);
  const mealLayoutY = useRef({});
  const jumpToMeal = useCallback((slotKey) => {
    setBreakdownVisible(false);
    const y = mealLayoutY.current[slotKey];
    if (Number.isFinite(y)) scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
  }, []);
  const [copyDays, setCopyDays] = useState(null); // recent logged days | null (picker hidden)
  const [diaryToolsOpen, setDiaryToolsOpen] = useState(false);

  // Leaving the day, or deselecting the last row, drops selection mode
  // so the toolbar never lingers empty.
  useEffect(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, [selectedDate]);
  useEffect(() => {
    if (selectionMode && selectedIds.size === 0) setSelectionMode(false);
  }, [selectionMode, selectedIds]);

  // Wave A C7: entering selection mode only ever happens via the long-press
  // this hint is teaching, so it's the discovery signal, watched here rather
  // than added inside enterSelection itself, so the long-press -> selection
  // wiring is untouched.
  useEffect(() => {
    if (selectionMode) dismissFoodHint();
  }, [selectionMode, dismissFoodHint]);

  const enterSelection = useCallback((entry) => {
    setSelectionMode(true);
    setSelectedIds(new Set([entry.id]));
  }, []);

  const toggleSelect = useCallback((entry) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(entry.id)) next.delete(entry.id);
      else next.add(entry.id);
      return next;
    });
  }, []);

  const exitSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const selectedEntries = useCallback(
    () => entries.filter((e) => selectedIds.has(e.id)),
    [entries, selectedIds],
  );

  // Optimistic delete + Undo (food audit F-1). Rows are soft-deleted, so the
  // toast's Undo restores them; no confirm dialog (Toast reserves Alert for
  // account-level destructive actions). If the toast times out the rows simply
  // stay deleted, the commit already happened.
  const doDeleteSelected = useCallback(async () => {
    const sel = selectedEntries();
    if (sel.length === 0) return;
    const n = sel.length;
    audit('food.delete', { mealSlot: 'multi', count: n });
    await deleteEntries(userId, sel);
    // Haptics completion pass (2026-07-10): data-first, mirrors the
    // single-row requestDelete's commit beat -- fires only after the
    // bulk delete has actually landed.
    haptics.commit();
    exitSelection();
    await load();
    toast.show(`${n} ${n === 1 ? 'entry' : 'entries'} deleted.`, {
      variant: 'undo',
      action: { label: 'Undo', onPress: async () => { await restoreEntries(userId, sel); await load(); } },
    });
  }, [selectedEntries, userId, exitSelection, load, toast]);

  const doCopySelectedToToday = useCallback(async () => {
    const sel = selectedEntries();
    if (sel.length === 0) return;
    const today = isoDate(new Date());
    await copyEntriesToDate(userId, sel, today);
    exitSelection();
    if (selectedDate === today) {
      await load();
    } else {
      toast.show(`${sel.length} ${sel.length === 1 ? 'entry' : 'entries'} added to today.`, { variant: 'success' });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEntries, userId, selectedDate, exitSelection, load]);

  const doMoveSelected = useCallback(async (slot) => {
    const sel = selectedEntries();
    setMovePickerVisible(false);
    if (sel.length === 0) return;
    await moveEntriesToSlot(userId, sel, slot);
    exitSelection();
    await load();
  }, [selectedEntries, userId, exitSelection, load]);

  // "Save as meal": snapshot the selected entries into a reusable saved
  // meal. Capture the items now (before the name prompt) so exiting
  // selection mid-prompt can't lose them.
  const openSaveMeal = useCallback(() => {
    const sel = selectedEntries();
    if (sel.length === 0) return;
    const items = sel.map((e) => ({
      foodRef: e.food_ref,
      name: friendlyFoodName(e),
      quantityG: e.quantity_g,
      kcal: e.kcal,
      proteinG: e.protein_g,
      carbsG: e.carbs_g,
      fatG: e.fat_g,
      fibreG: e.fibre_g ?? null,
    }));
    setSaveMealItems(items);
    setSaveMealName('');
  }, [selectedEntries]);

  const submitSaveMeal = useCallback(async () => {
    const name = saveMealName.trim();
    const items = saveMealItems;
    if (!name || !items || items.length === 0) { setSaveMealItems(null); return; }
    setSaveMealItems(null);
    try {
      await createSavedMeal(userId, { name, items });
      audit('food.saveMeal', { count: items.length });
      exitSelection();
      toast.show(`"${name}" is in Saved meals.`, { variant: 'success' });
    } catch (_) {
      toast.show('Couldn\'t save. Try again.', { variant: 'error' });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveMealName, saveMealItems, userId, exitSelection]);

  async function openEditSheet(entry) {
    const food = await resolveFoodRef(userId, entry.food_ref).catch(() => null);
    setEditSheet({
      entry,
      food: food ?? {
        name: friendlyFoodName(entry), brand: null, source: null,
        kcal_100g: entry.kcal && entry.quantity_g ? (entry.kcal / entry.quantity_g) * 100 : 0,
        protein_100g: entry.protein_g && entry.quantity_g ? (entry.protein_g / entry.quantity_g) * 100 : 0,
        carbs_100g: entry.carbs_g && entry.quantity_g ? (entry.carbs_g / entry.quantity_g) * 100 : 0,
        fat_100g: entry.fat_g && entry.quantity_g ? (entry.fat_g / entry.quantity_g) * 100 : 0,
        fibre_100g: entry.fibre_g && entry.quantity_g ? (entry.fibre_g / entry.quantity_g) * 100 : null,
      },
    });
  }

  async function saveEditSheet({ quantityG, mealSlot, entryDate, weightState, eatenAt }) {
        const { entry, food } = editSheet;
    await updateFoodEntry(entry.id, userId, {
      entryDate,
      mealSlot,
      foodRef: entry.food_ref,
      quantityG,
      ...scaleMacros(food, quantityG), // { kcal, proteinG, carbsG, fatG, fibreG }
      // Ultimate-Audit item 12: the sheet always sends the current basis label
      // (untouched or user-chosen); falls back to the entry's existing value
      // so a food with no raw/cooked choice never loses its prior label.
      weightState: weightState ?? entry.weight_state,
      // Item 15 data layer (kept after the meal-card layout restoration,
      // founder 2026-07-10): the sheet's optional eaten-at edit persists.
      // undefined leaves the stored value untouched (updateFoodEntry
      // preserves omitted fields); an explicit value or null writes through.
      ...(eatenAt !== undefined ? { eatenAt } : null),
    });
    await load();
  }

  async function deleteFromEditSheet() {
    if (!editSheet?.entry) return;
    const removed = editSheet.entry;
    await deleteFoodEntry(removed.id, userId);
    await load();
    toast.show(`${friendlyFoodName(removed)} deleted.`, {
      variant: 'undo',
      action: { label: 'Undo', onPress: async () => { await restoreFoodEntry(removed.id, userId); await load(); } },
    });
  }

  function lightTap() {
    // D2: routed through the vocabulary so reduce-motion silences it too.
    haptics.press();
  }

  async function logWaterDelta(deltaMl) {
        if (deltaMl > 0) lightTap();
    const next = Math.max(0, waterMl + deltaMl);
    await setWater(userId, selectedDate, next);
    setWaterMl(next);
  }

  // Swipe-to-delete handler used by EntryRow. Optimistic delete + Undo toast
  // (food audit F-1): a swipe removes the row immediately and the toast offers
  // an 8s window to restore it, rather than a confirm dialog on every swipe.
  const requestDelete = useCallback(async (entry, closeSwipe) => {
    audit('food.delete', { mealSlot: entry?.mealSlot ?? 'unknown' });
    try {
      await deleteFoodEntry(entry.id, userId);
      // D2: a delete is a commit beat; the Undo restores with a light
      // selection tick. Fires AFTER the delete succeeds so a thrown delete
      // never gives a felt commit with nothing deleted (hostile review).
      haptics.commit();
      await load();
      toast.show(`${friendlyFoodName(entry)} deleted.`, {
        variant: 'undo',
        action: { label: 'Undo', onPress: async () => { haptics.selection(); await restoreFoodEntry(entry.id, userId); await load(); } },
      });
    } catch (e) {
      // D138 contract: no optimistic removal happened above (the row only
      // leaves the list once `load()` re-reads the deleted state after a
      // successful delete), so on failure there is nothing to revert - the
      // row is still in the list and the swipe panel just needs to close.
      logError('DiaryScreen.deleteFoodEntry', e, { entryId: entry?.id, mealSlot: entry?.mealSlot ?? 'unknown' });
      closeSwipe?.();
      toast.show("Couldn't delete that entry, try again", { variant: 'error' });
    }
  }, [userId, load, toast]);

  // Shared copy core: replay a source day's entries into the day in view.
  // Re-uses logFoodEntry (via the food-domain layer) so the rollup trigger and
  // sync queue stay consistent, and surfaces partial failures rather than
  // swallowing them (food review U-M6). Used by both "Copy yesterday" and the
  // "copy a previous day" picker (food audit F-3).
  const copyFromDate = useCallback(async (sourceDate) => {
    if (!userId || !sourceDate) return;
    const srcEntries = await getFoodEntriesForDay(userId, sourceDate).catch(() => []);
    if (!srcEntries || srcEntries.length === 0) {
      toast.show('Nothing logged that day to copy.', { variant: 'info' });
      return;
    }
    // eslint-disable-next-line global-require
    const { logFoodEntry } = require('../lib/food/db');
    let ok = 0;
    let failed = 0;
    for (const e of srcEntries) {
      try {
        await logFoodEntry(userId, {
          entryDate: selectedDate,
          mealSlot: e.meal_slot,
          foodRef: e.food_ref,
          quantityG: e.quantity_g,
          kcal: e.kcal,
          proteinG: e.protein_g,
          carbsG: e.carbs_g,
          fatG: e.fat_g,
          fibreG: e.fibre_g ?? null,
          weightState: e.weight_state,
        });
        ok++;
      } catch (_) {
        failed++;
      }
    }
    await load();
    if (failed > 0) {
      toast.show(
        ok > 0 ? `Copied ${ok}; ${failed} couldn't be added.` : "Couldn't copy. Try again.",
        { variant: ok > 0 ? 'info' : 'error' },
      );
    } else {
      // D88: one word for one thing. These rows are "entries" when deleted and
      // added, so they are entries here too.
      toast.show(`Copied ${ok} ${ok === 1 ? 'entry' : 'entries'}.`, { variant: 'success' });
    }
  }, [userId, selectedDate, load, toast]);

  // "Copy yesterday" quick action (empty-state CTA): confirm, then copy.
  const copyYesterday = useCallback(async () => {
    if (!userId) return;
    const yesterday = shiftDate(selectedDate, -1);
    const yEntries = await getFoodEntriesForDay(userId, yesterday).catch(() => []);
    if (!yEntries || yEntries.length === 0) {
      toast.show('Nothing logged yesterday to copy.', { variant: 'info' });
      return;
    }
    appAlert(
      `Copy ${yEntries.length} ${yEntries.length === 1 ? 'entry' : 'entries'} from yesterday?`,
      'They\'ll land in this day\'s diary under the same meals.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Copy', onPress: () => copyFromDate(yesterday) },
      ],
    );
  }, [userId, selectedDate, copyFromDate, toast]);

  // "Copy a previous day" picker (food audit F-3): open a list of recent days
  // with food logged, before the day in view; tapping one copies it in.
  const openCopyPicker = useCallback(async () => {
    if (!userId) return;
    const days = await getRecentLoggedDays(userId, selectedDate, 14).catch(() => []);
    setCopyDays(days || []);
  }, [userId, selectedDate]);

  const openDiaryActions = useCallback(() => {
    setDiaryToolsOpen(true);
  }, []);

  const todayIso = isoDate(new Date());
  const isViewingToday = selectedDate === todayIso;
  const dateHeading = isViewingToday ? 'Today' : friendlyDate(selectedDate);
  const dateSubCopy = selectedDateDetail;
  const bottomInset = Math.max(0, Number(insets?.bottom) || 0);
  // CP-10 batch E (2026-07-10): `t` joins the dep list on both memos below so
  // a theme change (which changes live.scanFab/live.selectionBar's colours)
  // invalidates the cached array too -- bottomInset alone would otherwise
  // strand a stale live.* reference after the first theme toggle. `live` is
  // deliberately NOT listed: it is a fresh object every render derived
  // purely from `t` (buildLiveStyles(t) above), so depending on `t` already
  // captures every render where live.scanFab/live.selectionBar could change.
  const scanFabStyle = useMemo(
    // Founder report 2026-07-13: the FAB floated a full spacing.xl above the
    // tab bar and sat over the water card / last food rows. Tuck it into the
    // corner just above the bar instead, and give the scroll content enough
    // bottom padding (scrollContent) that everything can scroll clear of it.
    () => [styles.scanFab, live.scanFab, { bottom: spacing.sm + bottomInset }],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bottomInset, t],
  );
  const selectionBarStyle = useMemo(
    () => [styles.selectionBar, live.selectionBar, { paddingBottom: spacing.xl + bottomInset }],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bottomInset, t],
  );

  return (
    <SafeAreaView style={[styles.safe, live.safe]} edges={['top']}>
      {/* C5: GestureDetector wraps the day content so a horizontal swipe
          changes day the same way the chevrons do (Directions.LEFT = next,
          Directions.RIGHT = previous). The chevrons and every touchable
          inside are untouched, Fling only wins the gesture race on a fast
          horizontal flick, so ordinary taps/scrolls pass straight through. */}
      <GestureDetector gesture={daySwipe}>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.colors.primary} />}
      >
        <ScreenHeader title="Nutrition" />

        {/* Day pager + compact options. Sits under the standard
            ScreenHeader so the Nutrition tab now matches Today, Train,
            Progress and You at the top, with day navigation as a
            secondary row rather than the whole header bar. */}
        <View style={styles.dayPagerCard}>
          <View style={[styles.dateCluster, live.dateCluster]}>
            <TouchableOpacity
              onPress={gotoYesterday}
              hitSlop={12}
              style={styles.dayPagerNav}
              accessibilityRole="button"
              accessibilityLabel="Previous day"
            >
              <Ionicons name="chevron-back" size={21} color={t.colors.textSecondary} />
            </TouchableOpacity>
            {/* NAV-3: the date itself is the jump-to-date affordance, opening
                the native date picker so any day is reachable directly. */}
            <TouchableOpacity
              onPress={openDatePicker}
              hitSlop={12}
              style={styles.dateButton}
              accessibilityRole="button"
              accessibilityLabel={`${dateHeading}, ${dateSubCopy}. Jump to a date`}
            >
              <Ionicons name="calendar-outline" size={15} color={t.colors.textSecondary} />
              <View style={styles.dateCopy}>
                <Text style={[styles.dateLabel, live.dateLabel]}>{dateHeading}</Text>
                <Text style={[styles.dateSubLabel, live.dateSubLabel]}>{dateSubCopy}</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={gotoTomorrow}
              hitSlop={12}
              style={styles.dayPagerNav}
              accessibilityRole="button"
              accessibilityLabel="Next day"
            >
              <Ionicons name="chevron-forward" size={21} color={t.colors.textSecondary} />
            </TouchableOpacity>
          </View>
          {!isViewingToday ? (
            <TouchableOpacity onPress={() => { haptics.selection(); gotoToday(); }} hitSlop={10} style={[styles.todayPill, live.todayPill]} accessibilityRole="button" accessibilityLabel="Jump to today">
              <Text style={[styles.todayPillText, live.todayPillText]}>Today</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            onPress={() => { haptics.selection(); openDiaryActions(); }}
            hitSlop={12}
            style={[styles.dayPagerMore, live.dayPagerMore]}
            accessibilityRole="button"
            accessibilityLabel="Open diary tools"
          >
            <Ionicons name="options-outline" size={19} color={t.colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <View style={styles.macroRingsWrap}>
          {/* Audit item 6: quiet coach receipt chip. Shown only when the coach
              itself recently changed the calorie target; links to that exact
              week's decision in CoachOutputScreen, the real "why". */}
          {targetsChangedRecently ? (
            <TouchableOpacity
              style={styles.targetsChangedRow}
              onPress={() => { haptics.selection(); navigateCrossTab(navigation, 'ProfileTab', 'CoachOutput', { weekStart: latestCoachOutput.weekStart }); }}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              accessibilityRole="button"
              accessibilityLabel="Targets updated. See why."
            >
              <Ionicons name="information-circle-outline" size={13} color={t.colors.textSecondary} />
              <Text style={[styles.targetsChangedText, live.targetsChangedText]}>Targets updated. See why</Text>
              <Ionicons name="chevron-forward" size={iconSize.sm} color={t.colors.textMuted} />
            </TouchableOpacity>
          ) : null}
          {/* MacroRings renders unconditionally, first day included (founder
              device verdict 2026-07-12, D75: L05-D2's first-food swap
              REVERTED - a new user must SEE the ring, targets and macros to
              plan their first day; the meal builder tells them to build from
              targets they could not see). Never re-propose hiding it. */}
          <MacroRings
            rollup={rollup}
            targets={effectiveTargets}
            planned={plannedTotals}
            dayTypeLabel={dayTypeChip}
            onPress={viewEntries.length ? () => setBreakdownVisible(true) : undefined}
          />
          {/* D138 item 4: a user with no nutrition targets sees rings with
              nothing to aim at and, until now, no way out of that state from
              the diary at all. Same copy and same destination as the "no
              targets" empty state in food search's Suggested tab
              (FoodSearchScreen.js renderSuggested), so the one way out reads
              identically wherever it is met. MacroRings' own target-less
              render is untouched: the rings still show the day's intake. */}
          {loaded && !effectiveTargets ? (
            <View style={styles.noTargetsWrap}>
              <EmptyState
                compact
                icon="restaurant-outline"
                text="Set your targets first and Volyume can suggest meals that fit them."
                actionLabel="Set nutrition targets"
                onAction={() => navigateCrossTab(navigation, 'ProfileTab', 'NutritionTargets')}
                actionAccessibilityLabel="Set nutrition targets"
              />
            </View>
          ) : null}
          {/* Founder device order 2026-08-17: the C5-P21-03 (D96) "New to
              macros? Read the 5-minute guide" row under the rings is
              removed. The guide itself (NutritionEducation) and its other
              two doors (NutritionTargetsScreen education card,
              ProSetupCompleteScreen) are untouched. Never re-add a standing
              education row to the Diary without a founder order. */}
        </View>

        {showOffCard && selectedDate === isoDate(new Date()) ? (
          <View style={[styles.offCard, live.offCard]}>
            <Text style={[styles.offCardText, live.offCardText]}>
              Share barcode fixes? This helps food searches improve for everyone. It is off by default and you choose.
            </Text>
            <View style={styles.offCardRow}>
              <Button
                title="Not now"
                onPress={onDismissOffCard}
                variant="secondary"
                size="sm"
                fullWidth={false}
                style={[styles.offCardButton, live.offCardButton, styles.offCardButtonMuted, live.offCardButtonMuted]}
                textStyle={[styles.offCardDismiss, live.offCardDismiss]}
                accessibilityLabel="Not now"
              />
              <Button
                title="Sharing settings"
                // F4 (audit NAV-3): SettingsPrivacy lives in ProfileStack; the
                // old bare navigate silently no-opped AFTER dismissing the
                // card, destroying the affordance. Navigate first (cross-tab),
                // and only dismiss once the navigation has been issued.
                onPress={() => {
                  navigateCrossTab(navigation, 'ProfileTab', 'SettingsPrivacy');
                  onDismissOffCard();
                }}
                variant="secondary"
                size="sm"
                fullWidth={false}
                style={[styles.offCardButton, live.offCardButton]}
                textStyle={[styles.offCardCta, live.offCardCta]}
                accessibilityLabel="Open sharing settings"
              />
            </View>
          </View>
        ) : null}

        {/* Item 9(c) (D141): calm, dismissible, one-time discovery offer for
            the opt-in meal-log reminder. Same card shape as the OFF-consent
            card above (offCard styles reused, not duplicated), with a title
            line added since this offer needs one. */}
        {mealReminderOfferVisible ? (
          <View style={[styles.offCard, live.offCard]}>
            <Text style={[styles.mealReminderOfferTitle, live.mealReminderOfferTitle]}>
              Want a nudge to log?
            </Text>
            <Text style={[styles.offCardText, live.offCardText]}>
              A gentle reminder at your usual meal times can make logging easier. You choose the times, and you can turn it off any time.
            </Text>
            <View style={styles.offCardRow}>
              <Button
                title="Not now"
                onPress={dismissMealReminderOffer}
                variant="secondary"
                size="sm"
                fullWidth={false}
                style={[styles.offCardButton, live.offCardButton, styles.offCardButtonMuted, live.offCardButtonMuted]}
                textStyle={[styles.offCardDismiss, live.offCardDismiss]}
                accessibilityLabel="Not now"
              />
              <Button
                title="Set up reminders"
                // NotificationSettings lives in ProfileStack, so this diary
                // (DiaryStack) must cross-tab, same idiom as the OFF-consent
                // card's "Sharing settings" button just above. Navigate
                // first, then dismiss, so the tap is never lost.
                onPress={() => {
                  navigateCrossTab(navigation, 'ProfileTab', 'NotificationSettings');
                  dismissMealReminderOffer();
                }}
                variant="secondary"
                size="sm"
                fullWidth={false}
                style={[styles.offCardButton, live.offCardButton]}
                textStyle={[styles.offCardCta, live.offCardCta]}
                accessibilityLabel="Set up meal reminders"
              />
            </View>
          </View>
        ) : null}

        {!loaded ? (
          <View style={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}>
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </View>
        ) : loadError && viewEntries.length === 0 ? (
          // EP-09/P-06: a load that FAILED must never read as "nothing logged
          // this day". Only shown when there is nothing already on screen to
          // preserve (a refresh failure with existing entries keeps showing
          // them, per the loadError branch not gating that case).
          <View style={{ paddingHorizontal: spacing.lg }}>
            <EmptyState
              icon="cloud-offline-outline"
              title="Couldn't load this day"
              text="Check your connection and try again. Nothing has been lost."
              actionLabel="Retry"
              onAction={load}
              actionAccessibilityLabel="Retry loading this day"
            />
          </View>
        ) : viewEntries.length === 0 ? (
          <EmptyDiary
            onAdd={() => addFood(likelyMealSlot || 'meal_1')}
            addLabel="Add food"
            addAccessibilityLabel="Add food"
            onCopyYesterday={yesterdayHasFood ? copyYesterday : undefined}
            onPlanDay={() => navigation.navigate('MealPlan', { entryDate: selectedDate })}
          />
        ) : (
          <>
            {/* Founder ask (2026-07-09): the moment meals from the meal
                builder / meal plan land here (arrival flagged by
                justAddedPlan above), a one-time hint teaches the same two
                ways to confirm them, anchored to that specific arrival
                rather than "any time planned meals are visible" (D12's
                showMarkEatenHint just below). The two never stack: this one
                takes priority the first time round, since it is more
                specific to what the user just did; D12's general hint
                still covers every other time planned meals appear if this
                one somehow never fires (e.g. an older, already-planned day
                reached without a fresh add). */}
            {plannedCount > 0 && !selectionMode && showPlanAddedHint ? (
              <HintCaption
                text="Your meals are in the diary. Mark each one eaten as you go, or mark them all at the end of the day."
                onDismiss={dismissPlanAddedHint}
              />
            ) : null}
            {/* D12 item 3 (ux-world-class-audit-2026-07-09): the bulk
                "mark all as eaten" banner used to live here; it is now at
                the bottom of the page (D12 item 2). The first time a user
                sees planned meals in the diary, this one-time hint (same
                '@volyume_seen_*' once-ever convention as showFoodHint /
                showWaterHint below) teaches both ways to confirm them, since
                the bulk control is no longer visible at this scroll
                position. Gone the moment it's dismissed or the user marks
                any meal as eaten (individually or in bulk). Never shows
                alongside showPlanAddedHint above (mutually exclusive: a
                fresh plan-add always dismisses both discovery signals
                together, see dismissMarkEatenHint/dismissPlanAddedHint in
                handleConfirmPlanned/handleConfirmPlannedSlot). */}
            {plannedCount > 0 && !selectionMode && !showPlanAddedHint && showMarkEatenHint ? (
              <HintCaption
                text="Tick meals off one by one as you eat, or mark them all as eaten at once from the bottom of the page."
                onDismiss={dismissMarkEatenHint}
              />
            ) : null}
            {/* Founder order (2026-07-13): the "Hold a food to select
                several" caption is REMOVED - it stacked on top of the
                mark-eaten hint above and read as notification noise. The
                gesture still works; discovery keeps writing the same
                once-ever flag (dismissFoodHint on first selection) so this
                stays dead for users who already saw it if it is ever
                reconsidered. Do not re-add without a founder decision. */}
            {visibleSlots.map((slot, i) => (
              <View
                key={slot.key}
                onLayout={(e) => { mealLayoutY.current[slot.key] = e.nativeEvent.layout.y; }}
              >
                <AnimatedEntrance index={i}>
                  <MealSection
                    slot={slot}
                    entries={entriesBySlot[slot.key] ?? []}
                    usuals={(entriesBySlot[slot.key]?.length) ? null : (slotUsuals[slot.key] ?? null)}
                    onLogUsual={(food) => onLogUsual(food, slot.key)}
                    onEditUsual={(food) => onEditUsual(food, slot.key)}
                    /* D138 item 2: only on an empty meal, and only when
                       yesterday actually had food in this same meal. */
                    yesterdayCopy={
                      (entriesBySlot[slot.key]?.length || !(yesterdaySlotEntries[slot.key]?.length))
                        ? null
                        : { label: `Yesterday's ${slot.label}`, count: yesterdaySlotEntries[slot.key].length }
                    }
                    onCopyYesterday={() => copyYesterdaySlot(slot.key, slot.label)}
                    mealSuggestion={(entriesBySlot[slot.key]?.length) ? null : (slotMealSuggestion[slot.key] ?? null)}
                    onLogMealSuggestion={(suggestion) => onLogMealSuggestion(suggestion, slot.key)}
                    onAdd={() => addFood(slot.key)}
                    /* L05-D1/D6 (design-usability audit 2026-07-09): kept
                       wired but intentionally unused by MealSection - a
                       prior polish pass deliberately simplified the
                       per-meal-card hub to the single "Add food" action
                       (MealSection.polish.guard.test.js /
                       foodComponents.test.js pin exactly that), so a
                       4-button hub is not being restored here. Scan and
                       quick-add/saved-meals stay reachable via
                       Add food -> FoodSearchScreen's "More" tab; these
                       three callbacks are left connected (not deleted) so
                       addSavedMeal/scanForMeal/setQuickAddSlot and their
                       sheets below stay live code, in case a future
                       session is asked to wire a genuine second entry
                       point rather than remove them outright. */
                    onSavedMeals={() => addSavedMeal(slot.key)}
                    onScan={() => scanForMeal(slot.key)}
                    onQuickAdd={() => setQuickAddSlot(slot.key)}
                    onEdit={openEditSheet}
                    onDelete={requestDelete}
                    selectionMode={selectionMode}
                    selectedIds={selectedIds}
                    onLongPressEntry={enterSelection}
                    onToggleSelect={toggleSelect}
                    // readOnly is a MealSection prop outside this screen's
                    // lane; Volyume is fully free, so it is always false.
                    readOnly={false}
                    // One-tap "mark eaten" per meal (food audit item 1). Only
                    // offered when the day has happened; MealSection itself
                    // decides whether THIS slot has any planned rows to
                    // confirm.
                    onConfirmPlanned={!isFutureDay ? () => handleConfirmPlannedSlot(slot.key) : undefined}
                  />
                </AnimatedEntrance>
              </View>
            ))}
            {!selectionMode ? (
              <>
                <Button
                  title="Add meal"
                  icon="add"
                  onPress={() => { lightTap(); setAddedMeals((n) => n + 1); }}
                  variant="outline"
                  style={[styles.addMealRow, live.addMealRow]}
                  textStyle={[styles.addMealLabel, live.addMealLabel]}
                  accessibilityLabel="Add another meal"
                />
              </>
            ) : null}
          </>
        )}

        {/* D138 item 3: one compact chip row carries the day's remaining
            doors, replacing the two-line "Meal builder" nav row and the
            standalone "Plan a higher-calorie day" button that used to stack
            here. Fewer competing blocks under the meals, and trends finally
            have a door on the surface itself rather than only inside the Day
            tools sheet (which still lists both, unchanged).
            "Higher-calorie day" keeps the EXACT banking gate the button had
            (bankingAvailable: targets present, not floored, no open ED flag)
            and its accessibility label, so the ED-safety carve-out reads and
            tests the same. On a day with nothing logged, EmptyDiary carries
            its own meal-builder promo, so the chip is dropped there rather
            than repeated. */}
        {loaded && !selectionMode ? (
          <View style={styles.dayToolsRow}>
            {viewEntries.length > 0 ? (
              <Chip
                label="Meal builder"
                icon="restaurant-outline"
                onPress={() => { lightTap(); navigation.navigate('MealPlan', { entryDate: selectedDate }); }}
                accessibilityLabel="Open meal builder for this day or week"
              />
            ) : null}
            {bankingAvailable ? (
              <Chip
                label="Higher-calorie day"
                icon="trending-up-outline"
                onPress={() => setBankSheetVisible(true)}
                accessibilityLabel="Plan a higher-calorie day"
              />
            ) : null}
            <Chip
              label="Trends"
              icon="analytics-outline"
              onPress={() => { lightTap(); navigation.navigate('FoodInsights'); }}
              accessibilityLabel="Open nutrition trends and export"
            />
          </View>
        ) : null}
        <WaterRow
          ml={waterMl}
          targetMl={waterTargetMl}
          onAdd={(amount) => { logWaterDelta(amount); if (amount >= 500) dismissWaterHint(); }}
          onSub={(amount) => { logWaterDelta(-amount); if (amount >= 500) dismissWaterHint(); }}
          onEditTarget={changeWaterTarget}
          showHint={showWaterHint}
          onDismissHint={dismissWaterHint}
        />

        {/* D12 (ux-world-class-audit-2026-07-09, founder direct order): the
            bulk "mark all planned meals as eaten" control demoted to the
            bottom of the diary page. Per-meal marking (MealSection's
            onConfirmPlanned, wired above) is the primary interaction; this
            is the same confirm/clear pair and gating that used to sit above
            the meal sections, unchanged in behaviour, just relocated. */}
        {plannedCount > 0 && !selectionMode ? (
          <View style={[styles.plannedBanner, live.plannedBanner]}>
            <Text style={[styles.plannedBannerText, live.plannedBannerText]}>
              {plannedCount} planned {plannedCount === 1 ? 'meal' : 'meals'} for this day.
              {isFutureDay ? ' Confirm them on the day once eaten.' : ' Mark them as eaten when you have them so they count in your day.'}
            </Text>
            <View style={styles.plannedBannerRow}>
              {!isFutureDay ? (
                <Button
                  title="Mark as eaten"
                  onPress={handleConfirmPlanned}
                  variant="primary"
                  size="sm"
                  fullWidth={false}
                  style={[styles.plannedBtnPrimary, live.plannedBtnPrimary]}
                  textStyle={[styles.plannedBtnPrimaryText, live.plannedBtnPrimaryText]}
                  accessibilityLabel="Mark planned meals as eaten"
                />
              ) : null}
              <Button
                title="Clear"
                onPress={handleClearPlanned}
                variant="secondary"
                size="sm"
                fullWidth={false}
                style={[styles.plannedBtnGhostButton, live.plannedBtnGhostButton]}
                textStyle={[styles.plannedBtnGhost, live.plannedBtnGhost]}
                accessibilityLabel="Clear the planned meals"
              />
            </View>
          </View>
        ) : null}
      </ScrollView>
      </GestureDetector>

      <FoodDetailSheet
        visible={!!editSheet}
        mode="edit"
        food={editSheet?.food}
        initialQuantityG={editSheet?.entry?.quantity_g}
        initialMealSlot={editSheet?.entry?.meal_slot ?? 'snack'}
        initialEntryDate={editSheet?.entry?.entry_date ?? selectedDate}
        initialWeightState={editSheet?.entry?.weight_state}
        initialEatenAt={editSheet?.entry?.eaten_at ?? null}
        onSave={saveEditSheet}
        onDelete={deleteFromEditSheet}
        // Phase 10 finding #2 (discoverability audit 2026-08-10): the only
        // way into multi-select was an undisclosed long press on the row.
        // A normal tap already opens this sheet, so its "Select entries"
        // action closes the sheet and enters the SAME selection mode
        // (enterSelection, :1010) pre-selecting the entry the user was
        // just looking at. No new state, no new writer.
        onSelectEntries={() => {
          const entry = editSheet?.entry;
          setEditSheet(null);
          if (entry) enterSelection(entry);
        }}
        onClose={() => setEditSheet(null)}
      />

      <QuickAddSheet
        visible={!!quickAddSlot}
        initialMealSlot={quickAddSlot ?? 'snack'}
        onSave={confirmQuickAdd}
        onClose={() => setQuickAddSlot(null)}
      />

      <BottomSheet
        visible={!!savedPickerSlot}
        onClose={() => setSavedPickerSlot(null)}
        accessibilityLabel="Saved meals and recipes"
      >
        <Text style={[styles.savedFoodTitle, live.savedFoodTitle]}>Saved meals and recipes</Text>
        <Text style={[styles.savedFoodIntro, live.savedFoodIntro]}>Use a saved meal from your diary, or a recipe you built.</Text>
        <TouchableOpacity
          style={styles.savedFoodOption}
          onPress={() => { haptics.selection(); openSavedFoodRoute('MyMeals'); }}
          accessibilityRole="button"
          accessibilityLabel="Open saved meals"
        >
          <View style={[styles.savedFoodIcon, live.savedFoodIcon]}>
            <Ionicons name="bookmark-outline" size={20} color={t.colors.primary} />
          </View>
          <View style={styles.savedFoodText}>
            <Text style={[styles.savedFoodOptionTitle, live.savedFoodOptionTitle]}>Saved meals</Text>
            <Text style={[styles.savedFoodOptionSub, live.savedFoodOptionSub]}>Foods you saved together from the diary.</Text>
          </View>
          <Ionicons name="chevron-forward" size={iconSize.sm} color={t.colors.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.savedFoodOption}
          onPress={() => { haptics.selection(); openSavedFoodRoute('MyRecipes'); }}
          accessibilityRole="button"
          accessibilityLabel="Open recipes"
        >
          <View style={[styles.savedFoodIcon, live.savedFoodIcon]}>
            <Ionicons name="restaurant-outline" size={20} color={t.colors.primary} />
          </View>
          <View style={styles.savedFoodText}>
            <Text style={[styles.savedFoodOptionTitle, live.savedFoodOptionTitle]}>Recipes</Text>
            <Text style={[styles.savedFoodOptionSub, live.savedFoodOptionSub]}>Recipes with ingredients and servings.</Text>
          </View>
          <Ionicons name="chevron-forward" size={iconSize.sm} color={t.colors.textMuted} />
        </TouchableOpacity>
      </BottomSheet>

      <MacroBreakdownSheet
        visible={breakdownVisible}
        entries={viewEntries}
        dateLabel={friendlyDate(selectedDate)}
        onClose={() => setBreakdownVisible(false)}
        onSelectMeal={jumpToMeal}
      />

      {/* FABs hide while selecting so the bottom toolbar owns the
          action space, and on the read-only diary (a scan is a write,
          and ScanBarcode is a hard-locked Pro route anyway). */}
      {!selectionMode ? (
        <TouchableOpacity
          style={scanFabStyle}
          onPress={() => {
            haptics.selection();
            // Pass the likely meal slot so a scan no longer defaults to
            // 'snack'. The empty-day CTA uses the same inferred slot.
            navigation.navigate('ScanBarcode', { entryDate: selectedDate, mealSlot: likelyMealSlot });
          }}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Scan barcode"
        >
          <Ionicons name="barcode-outline" size={26} color={t.colors.primary} />
        </TouchableOpacity>
      ) : null}

      {selectionMode ? (
        <View style={selectionBarStyle}>
          <View style={styles.selTopRow}>
            <TouchableOpacity onPress={() => { haptics.selection(); exitSelection(); }} hitSlop={10} style={styles.selCancel} accessibilityRole="button" accessibilityLabel="Cancel selection">
              <Ionicons name="close" size={22} color={t.colors.textPrimary} />
            </TouchableOpacity>
            <Text style={[styles.selCount, live.selCount]}>{selectedIds.size} selected</Text>
          </View>
          <View style={styles.selActions}>
            <TouchableOpacity onPress={() => { haptics.selection(); setMovePickerVisible(true); }} style={styles.selAction} accessibilityRole="button" accessibilityLabel="Move to another meal">
              <Ionicons name="swap-vertical" size={20} color={t.colors.textPrimary} />
              <Text style={[styles.selActionLabel, live.selActionLabel]}>Move</Text>
            </TouchableOpacity>
            {/* Haptics completion pass (2026-07-10): copying to today is a
                bulk food-log write (diary-marking), excluded per the
                campaign's ED-pattern-detection rule -- left without an
                added haptic. */}
            <TouchableOpacity onPress={doCopySelectedToToday} style={styles.selAction} accessibilityRole="button" accessibilityLabel="Copy to today">
              <Ionicons name="copy-outline" size={20} color={t.colors.textPrimary} />
              <Text style={[styles.selActionLabel, live.selActionLabel]}>To today</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { haptics.selection(); openSaveMeal(); }} style={styles.selAction} accessibilityRole="button" accessibilityLabel="Save selected as a meal">
              <Ionicons name="bookmark-outline" size={20} color={t.colors.textPrimary} />
              <Text style={[styles.selActionLabel, live.selActionLabel]}>Save meal</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={doDeleteSelected} style={styles.selAction} accessibilityRole="button" accessibilityLabel="Delete selected">
              <Ionicons name="trash-outline" size={20} color={t.colors.error} />
              <Text style={[styles.selActionLabel, live.selActionLabel, { color: t.colors.error }]}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      <BottomSheet
        visible={movePickerVisible}
        onClose={() => setMovePickerVisible(false)}
        accessibilityLabel="Move selected foods"
      >
        <SectionLabel style={styles.moveTitle}>Move to</SectionLabel>
        {mealSlots.map((s) => (
          <TouchableOpacity
            key={s.key}
            style={styles.moveOption}
            onPress={() => { haptics.selection(); doMoveSelected(s.key); }}
            accessibilityRole="button"
            accessibilityLabel={`Move to ${s.label}`}
          >
            <Text style={[styles.moveOptionText, live.moveOptionText]}>{s.label}</Text>
          </TouchableOpacity>
        ))}
      </BottomSheet>

      <BottomSheet
        visible={!!saveMealItems}
        onClose={() => setSaveMealItems(null)}
        keyboardAvoiding
        accessibilityLabel="Save as meal"
      >
        <SectionLabel style={styles.moveTitle}>Save as meal</SectionLabel>
        <Text style={[styles.saveMealHint, live.saveMealHint]}>
          {saveMealItems?.length ?? 0} {(saveMealItems?.length ?? 0) === 1 ? 'entry' : 'entries'} saved together. Name it.
        </Text>
        <TextField
          fieldStyle={styles.saveMealInputField}
          inputStyle={[styles.saveMealInput, live.saveMealInput]}
          value={saveMealName}
          onChangeText={setSaveMealName}
          placeholder="e.g. My breakfast"
          placeholderTextColor={t.colors.textMuted}
          accessibilityLabel="Meal name"
          autoFocus
          maxLength={60}
          returnKeyType="done"
          onSubmitEditing={submitSaveMeal}
        />
        <View style={styles.saveMealActions}>
          <Button
            title="Cancel"
            variant="secondary"
            size="sm"
            fullWidth={false}
            style={styles.saveMealBtn}
            textStyle={[styles.saveMealBtnText, live.saveMealBtnText]}
            onPress={() => setSaveMealItems(null)}
            accessibilityLabel="Cancel"
          />
          <Button
            title="Save"
            size="sm"
            fullWidth={false}
            style={styles.saveMealBtn}
            textStyle={[styles.saveMealBtnTextPrimary, live.saveMealBtnTextPrimary]}
            onPress={submitSaveMeal}
            disabled={!saveMealName.trim()}
            accessibilityLabel="Save meal"
            accessibilityState={{ disabled: !saveMealName.trim() }}
          />
        </View>
      </BottomSheet>

      <BottomSheet
        visible={diaryToolsOpen}
        onClose={() => setDiaryToolsOpen(false)}
        accessibilityLabel="Diary tools"
      >
        <SectionLabel style={styles.moveTitle}>Day tools</SectionLabel>
        <Text style={[styles.saveMealHint, live.saveMealHint]}>
          Copy foods from another day, check nutrition trends, or export your diary.
        </Text>
        <TouchableOpacity
          style={styles.diaryToolRow}
          onPress={() => { haptics.selection(); setDiaryToolsOpen(false); openCopyPicker(); }}
          accessibilityRole="button"
          accessibilityLabel="Copy food from another logged day"
        >
          <View style={[styles.diaryToolIcon, live.diaryToolIcon]}>
            <Ionicons name="copy-outline" size={18} color={t.colors.primary} />
          </View>
          <View style={styles.diaryToolCopy}>
            <Text style={[styles.diaryToolTitle, live.diaryToolTitle]}>Copy from another day</Text>
            <Text style={[styles.diaryToolText, live.diaryToolText]}>Choose a recent logged day and copy its foods into this one.</Text>
          </View>
          <Ionicons name="chevron-forward" size={iconSize.sm} color={t.colors.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.diaryToolRow}
          onPress={() => { haptics.selection(); setDiaryToolsOpen(false); navigation.navigate('FoodInsights'); }}
          accessibilityRole="button"
          accessibilityLabel="Open nutrition trends and export"
        >
          <View style={[styles.diaryToolIcon, live.diaryToolIcon]}>
            <Ionicons name="analytics-outline" size={18} color={t.colors.primary} />
          </View>
          <View style={styles.diaryToolCopy}>
            <Text style={[styles.diaryToolTitle, live.diaryToolTitle]}>Trends and export</Text>
            <Text style={[styles.diaryToolText, live.diaryToolText]}>See calorie, macro and consistency trends, or export your diary.</Text>
          </View>
          <Ionicons name="chevron-forward" size={iconSize.sm} color={t.colors.textMuted} />
        </TouchableOpacity>
      </BottomSheet>

      <BottomSheet
        visible={copyDays != null}
        onClose={() => setCopyDays(null)}
        accessibilityLabel="Copy from another day"
      >
        <SectionLabel style={styles.moveTitle}>Copy from another day</SectionLabel>
        {copyDays && copyDays.length === 0 ? (
          <Text style={[styles.saveMealHint, live.saveMealHint]}>No earlier days with food logged yet.</Text>
        ) : (
          (copyDays || []).map((d) => (
            // Haptics completion pass (2026-07-10): copying a day's foods is
            // a direct diary-write (food-logging), excluded per the
            // campaign's ED-pattern-detection rule -- left without an added
            // haptic.
            <TouchableOpacity
              key={d.entry_date}
              style={styles.moveOption}
              onPress={() => { setCopyDays(null); copyFromDate(d.entry_date); }}
              accessibilityRole="button"
              accessibilityLabel={`Copy ${friendlyDate(d.entry_date)}, ${d.count} ${d.count === 1 ? 'entry' : 'entries'}`}
            >
              <Text style={[styles.moveOptionText, live.moveOptionText]}>{friendlyDate(d.entry_date)}</Text>
              <Text style={[styles.copyRowMeta, live.copyRowMeta]}>
                {d.count} {d.count === 1 ? 'entry' : 'entries'} - {toEnergy(Math.round(d.kcal ?? 0), energyUnit)} {energyUnitLabel(energyUnit)}
              </Text>
            </TouchableOpacity>
          ))
        )}
      </BottomSheet>
      <CalorieBankSheet
        visible={bankSheetVisible}
        onClose={() => setBankSheetVisible(false)}
        weekDates={weekDates}
        defaultBigDay={selectedDate}
        baseTargetKcal={targets?.targetKcal ?? 0}
        floorKcal={floorKcal}
        bandMaxKcal={Math.round((targets?.targetKcal ?? 0) * 1.1)}
        existingBank={bankActiveThisWeek ? calorieBank : null}
        onApply={applyBank}
        onClear={clearBank}
        dayLabel={weekdayShort}
      />
      {/* NAV-3: date-jump. A read (viewing a different day), available in
          read-only too, same as the chevrons it sits beside. */}
      <DiaryDatePicker
        visible={datePickerVisible}
        valueIso={selectedDate}
        onChange={onPickDate}
        onClose={closeDatePicker}
      />
    </SafeAreaView>
  );
}

// Default daily hydration target; NU-9 made it a per-user preference (tap the
// value to change it, stored device-locally) instead of a hardcoded 3.0 L.
const WATER_TARGET_ML = 3000;
const WATER_TARGET_KEY = '@volyume_water_target_ml';

// Wave A C7 (2026-07-03): one-time hint flags, same convention as
// '@volyume_seen_workout_info' (ActiveWorkoutScreen).
const DIARY_FOOD_HINT_KEY = '@volyume_seen_diary_food_hint';
const DIARY_WATER_HINT_KEY = '@volyume_seen_diary_water_hint';
const DIARY_MARKEATEN_HINT_KEY = '@volyume_seen_diary_markeaten_hint';
// Founder ask (2026-07-09): a one-time teach anchored to the moment meals
// from the meal builder / meal plan land in the diary (MealPlanScreen's
// "Add this day" / "Add this week", via the `justAddedPlan` nav param),
// distinct from DIARY_MARKEATEN_HINT_KEY above (D12's general first-sight-of-
// planned-meals teach). Same once-ever convention; the two never render at
// once (see the mutually-exclusive gating where showMarkEatenHint is read).
const DIARY_PLANADDED_HINT_KEY = '@volyume_seen_diary_planadded_hint';

function WaterRow({
  ml, targetMl = WATER_TARGET_ML, onAdd, onSub, onEditTarget,
  showHint = false, onDismissHint,
}) {
  // CP-10 batch E (2026-07-10): sibling function-component scope (not
  // prop-drilled `live`/`t` from DiaryScreen, matching AddCustomFoodScreen's
  // Field/NumField precedent from batch D), own useTheme() call and shared
  // buildLiveStyles(t).
  const t = useTheme();
  const live = buildLiveStyles(t);
  const litres = (ml / 1000).toFixed(1);
  const targetL = (targetMl / 1000).toFixed(1);
  const progress = Math.max(0, Math.min(1, ml / targetMl));
  return (
    <Card padding="md" style={styles.waterRow}>
      <View style={styles.waterHeader}>
        <View style={styles.waterLeft}>
          <Ionicons name="water-outline" size={18} color={t.colors.primary} />
          <Text style={[styles.waterLabel, live.waterLabel]}>Water</Text>
        </View>
        <View style={styles.waterButtons}>
          {/* NU-9: the value doubles as the target editor. */}
          <TouchableOpacity
            onPress={() => { haptics.selection(); onEditTarget?.(); }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Water ${litres} of ${targetL} litres. Tap to change your daily target.`}
          >
            <Text style={[styles.waterValue, live.waterValue]}>{litres} / {targetL} L</Text>
          </TouchableOpacity>
          {/* NU-9: long-press moves a bottle (500 ml) at a time, so a full day
              of water no longer needs 12 taps. */}
          <TouchableOpacity
            style={[styles.waterBtn, live.waterBtn]}
            onPress={() => onSub(250)}
            onLongPress={() => onSub(500)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Remove 250 millilitres of water. Long press to remove 500."
          >
            <Ionicons name="remove" size={16} color={t.colors.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.waterBtn, live.waterBtn]}
            onPress={() => onAdd(250)}
            onLongPress={() => onAdd(500)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Add 250 millilitres of water. Long press to add 500."
          >
            <Ionicons name="add" size={16} color={t.colors.textPrimary} />
          </TouchableOpacity>
        </View>
      </View>
      <View
        style={[styles.waterTrack, live.waterTrack]}
        accessibilityRole="progressbar"
        accessibilityLabel="Water intake"
        accessibilityValue={{ min: 0, max: targetMl, now: Math.round(ml) }}
      >
        <View style={[styles.waterFill, live.waterFill, { width: `${Math.round(progress * 100)}%` }]} />
      </View>
      {/* Wave A C7: the +/- long-press-for-500 move had no visible affordance
          (accessibilityLabel only). Gone once discovered or dismissed. */}
      {showHint ? (
        <HintCaption
          text="Hold to add 500 ml."
          onDismiss={onDismissHint}
          style={styles.waterHint}
        />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  // D148: the one floating action is a raised charcoal disc with an amber
  // glyph, not an amber disc. It is found by form, place and glyph.
  scanFab: {
    position: 'absolute', right: spacing.lg, bottom: spacing.xl,
    width: 56, height: 56, borderRadius: circle(56),
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
    ...shadow.lg,
  },
  safe: { flex: 1, backgroundColor: colors.background },
  // Two rows so a wide selection ("5 selected") and four labelled actions never
  // collide on a narrow screen the way a single row did: count + cancel on top,
  // the action set spread evenly beneath.
  selectionBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    backgroundColor: colors.surface,
    borderTopWidth: 1, borderTopColor: colors.border,
    gap: spacing.md,
  },
  selTopRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  selCancel: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  selCount: { ...type.bodyStrong, color: colors.textPrimary },
  selActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  selAction: { flex: 1, alignItems: 'center', gap: spacing.xxs },
  selActionLabel: { color: colors.textPrimary, fontSize: fontSize.xs, fontFamily: fontFamily.medium, fontWeight: fontWeight.medium },
  moveTitle: {
    paddingHorizontal: spacing.sm, paddingTop: spacing.xs, paddingBottom: spacing.sm,
  },
  moveOption: {
    minHeight: 48, justifyContent: 'center',
    paddingHorizontal: spacing.sm, borderRadius: radius.md,
  },
  moveOptionText: { color: colors.textPrimary, fontSize: fontSize.md, fontFamily: fontFamily.medium, fontWeight: fontWeight.medium },
  copyRowMeta: { color: colors.textMuted, fontSize: fontSize.sm, marginTop: 2 },
  diaryToolRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  diaryToolIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryBg,
  },
  diaryToolCopy: { flex: 1, minWidth: 0 },
  diaryToolTitle: { ...type.bodyStrong, color: colors.textPrimary },
  diaryToolText: { ...type.bodySm, color: colors.textMuted, marginTop: 2 },
  saveMealHint: {
    color: colors.textMuted, fontSize: fontSize.sm,
    paddingHorizontal: spacing.sm, paddingBottom: spacing.md,
  },
  saveMealInputField: { borderRadius: radius.md, marginHorizontal: spacing.sm },
  saveMealInput: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.md,
  },
  saveMealActions: {
    flexDirection: 'row', justifyContent: 'flex-end',
    marginTop: spacing.md, gap: spacing.sm,
  },
  saveMealBtn: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.md },
  saveMealBtnText: { ...type.body, color: colors.textPrimary },
  saveMealBtnTextPrimary: { ...type.label, color: colors.textPrimary },
  savedFoodTitle: { ...type.bodyStrong, color: colors.textPrimary },
  savedFoodIntro: { ...type.bodySm, color: colors.textMuted },
  savedFoodOption: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  savedFoodIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryBg,
  },
  savedFoodText: { flex: 1 },
  savedFoodOptionTitle: { ...type.bodyStrong, color: colors.textPrimary },
  savedFoodOptionSub: { ...type.bodySm, color: colors.textMuted, marginTop: 2 },
  dayPagerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  dateCluster: {
    flex: 1,
    minWidth: 0,
    minHeight: touchTarget.minimum,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    // The date rail is navigation chrome, not a primary control. surface2
    // sits HIGHER on the elevation ladder than the meal cards it navigates,
    // which inverts the hierarchy, so it keeps `surface`. The button-shaped
    // controls on this screen took the unified surface2 vocabulary instead.
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.xxs,
  },
  dayPagerNav: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: 'transparent',
  },
  dateButton: {
    flex: 1,
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.sm,
    backgroundColor: 'transparent',
  },
  dateCopy: { alignItems: 'center', justifyContent: 'center', minWidth: 0 },
  dateLabel: { ...type.label, color: colors.textPrimary, textAlign: 'center' },
  dateSubLabel: { ...type.caption, color: colors.textMuted, textAlign: 'center', marginTop: -2 },
  todayPill: {
    // Was 42, below the platform minimum on a control users tap every day.
    minHeight: touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  todayPillText: { ...type.caption, color: colors.textPrimary, fontWeight: fontWeight.semibold },
  dayPagerMore: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  scroll: { flex: 1 },
  // Bottom padding clears the 56pt scan FAB (bottom: spacing.sm) plus a gap,
  // so the water card / last food rows always scroll out from under it.
  scrollContent: { padding: spacing.lg, paddingBottom: spacing.sm + 56 + spacing.xl },
  macroRingsWrap: { marginBottom: spacing.lg },
  // D138 item 4: the no-targets way out, tucked under the rings.
  noTargetsWrap: { marginTop: spacing.md },
  // D138 item 3: the day's remaining doors as one wrapping chip row (shared
  // Chip primitive, so no colour or type is set here).
  dayToolsRow: {
    flexDirection: 'row', flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  // NU-2: quiet mode rows under the rings and the banking-paused note.
  targetModeRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.xxs, marginTop: spacing.sm,
  },
  targetModeText: { color: colors.textMuted, fontSize: fontSize.xs, fontFamily: fontFamily.medium, fontWeight: fontWeight.medium },
  // Audit item 6: the quiet coach-receipt chip, same row shape as
  // targetModeRow but sits ABOVE the rings and is always a link (never just
  // informational), so it reads distinctly from the NU-2 exit rows below.
  targetsChangedRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.xxs, marginBottom: spacing.sm,
  },
  targetsChangedText: { color: colors.textSecondary, fontSize: fontSize.xs, fontFamily: fontFamily.medium, fontWeight: fontWeight.medium },
  bankOffNote: {
    color: colors.textMuted, fontSize: fontSize.xs, textAlign: 'center',
    marginTop: spacing.sm, paddingHorizontal: spacing.lg,
  },
  offCard: {
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.borderSubtle,
    padding: spacing.md, marginBottom: spacing.lg,
  },
  offCardText: { ...type.bodySm, color: colors.textSecondary },
  // Item 9(c) (D141): the meal-reminder offer's title line, the offCard
  // shape's only user with a heading above the body text.
  mealReminderOfferTitle: { ...type.bodyStrong, color: colors.textPrimary },
  offCardRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, flexWrap: 'wrap' },
  offCardButton: {
    minHeight: 40,
    justifyContent: 'center',
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
    paddingHorizontal: spacing.md,
  },
  offCardButtonMuted: {
    borderColor: colors.border,
    backgroundColor: colors.surface2,
  },
  offCardDismiss: { fontSize: fontSize.sm, fontFamily: fontFamily.semibold, fontWeight: fontWeight.semibold, color: colors.textMuted },
  offCardCta: { ...type.label, color: colors.textPrimary },
  addMealRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.xs, minHeight: touchTarget.minimum,
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    marginBottom: spacing.sm,
  },
  addMealLabel: { ...type.label, color: colors.textPrimary },
  plannedBanner: {
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: withAlpha(colors.primary, alpha.edge),
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  plannedBannerText: { ...type.bodySm, color: colors.textPrimary },
  plannedBannerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  plannedBtnPrimary: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, minHeight: 40,
    alignItems: 'center', justifyContent: 'center',
  },
  plannedBtnPrimaryText: { fontFamily: fontFamily.semibold, fontWeight: fontWeight.semibold, fontSize: fontSize.sm },
  plannedBtnGhostButton: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plannedBtnGhost: { ...type.label, color: colors.textPrimary },
  waterRow: {
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  waterHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  waterLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  waterLabel: { color: colors.textPrimary, fontSize: fontSize.md, fontFamily: fontFamily.medium, fontWeight: fontWeight.medium },
  waterValue: { color: colors.textMuted, fontSize: fontSize.sm, fontVariant: ['tabular-nums'], marginRight: spacing.xs },
  waterButtons: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  waterBtn: {
    width: 36, height: 36, borderRadius: radius.md,
    backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center',
  },
  waterTrack: {
    height: 6, borderRadius: radius.full,
    backgroundColor: colors.surface2, overflow: 'hidden',
  },
  waterFill: { height: '100%', borderRadius: radius.full, backgroundColor: colors.primary },
  // waterRow already pads/gaps its children; HintCaption's own padding would
  // double up, so this instance is flush.
  waterHint: { paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0 },
});

// CP-10 batch E (2026-07-10): the frozen `styles` block above stays byte-
// identical. This mirrors ONLY the colour/fontSize/type-bearing sub-
// properties of the matching frozen style, at identical rest values, shared
// by this file's two function-component scopes (DiaryScreen, WaterRow) so
// they can never drift out of step with each other or the frozen block.
// Pure layout keys (flex/gap/padding/width, no token) are correctly omitted
// -- there is nothing to unfreeze for them. Same pattern as
// AddCustomFoodScreen.js's buildLiveStyles (batch D). fontWeight.* is not
// part of useTheme()'s returned shape (src/hooks/useTheme.js -- it derives
// colors/fontSize/shadow/resolvedTheme/type only) because it never varies by
// theme/contrast, so it stays frozen wherever the source style spreads it.
// scanFab's shadow.lg DOES vary by theme (shadowOpacity only -- see
// src/styles/theme.js's lightShadowOpacity table), so that one opacity
// value is mirrored the same way a colour would be; the rest of the shadow
// shape (offset/radius/elevation/colour) is theme-invariant and stays
// frozen. The `selActionLabel`/`{ color: colors.error }` inline override on
// the Delete action is theme-neutral factual state (a destructive-action
// colour), not an ED-gated valence mapping, so it converts mechanically
// like every other colour token here.
function buildLiveStyles(t) {
  return {
    safe: { backgroundColor: t.colors.background },
    scanFab: { backgroundColor: t.colors.surface2, borderColor: t.colors.border, shadowOpacity: t.shadow.lg.shadowOpacity },
    selectionBar: { backgroundColor: t.colors.surface, borderTopColor: t.colors.border },
    selCount: { ...t.type.bodyStrong, color: t.colors.textPrimary },
    selActionLabel: { color: t.colors.textPrimary, fontSize: t.fontSize.xs },
    moveOptionText: { color: t.colors.textPrimary, fontSize: t.fontSize.md },
    copyRowMeta: { color: t.colors.textMuted, fontSize: t.fontSize.sm },
    diaryToolIcon: { backgroundColor: t.colors.primaryBg },
    diaryToolTitle: { ...t.type.bodyStrong, color: t.colors.textPrimary },
    diaryToolText: { ...t.type.bodySm, color: t.colors.textMuted },
    saveMealHint: { color: t.colors.textMuted, fontSize: t.fontSize.sm },
    saveMealInput: { fontSize: t.fontSize.md },
    saveMealBtnText: { ...t.type.body, color: t.colors.textPrimary },
    saveMealBtnTextPrimary: { ...t.type.label, color: t.colors.textPrimary },
    savedFoodTitle: { ...t.type.bodyStrong, color: t.colors.textPrimary },
    savedFoodIntro: { ...t.type.bodySm, color: t.colors.textMuted },
    savedFoodIcon: { backgroundColor: t.colors.primaryBg },
    savedFoodOptionTitle: { ...t.type.bodyStrong, color: t.colors.textPrimary },
    savedFoodOptionSub: { ...t.type.bodySm, color: t.colors.textMuted },
    dateCluster: { borderColor: t.colors.border, backgroundColor: t.colors.surface },
    dateLabel: { ...t.type.label, color: t.colors.textPrimary },
    dateSubLabel: { ...t.type.caption, color: t.colors.textMuted },
    todayPill: { borderColor: t.colors.border, backgroundColor: t.colors.surface2 },
    todayPillText: { ...t.type.caption, color: t.colors.textPrimary },
    dayPagerMore: { borderColor: t.colors.border, backgroundColor: t.colors.surface },
    targetModeText: { color: t.colors.textMuted, fontSize: t.fontSize.xs },
    targetsChangedText: { color: t.colors.textSecondary, fontSize: t.fontSize.xs },
    bankOffNote: { color: t.colors.textMuted, fontSize: t.fontSize.xs },
    offCard: { backgroundColor: t.colors.surface, borderColor: t.colors.border },
    offCardText: { ...t.type.bodySm, color: t.colors.textSecondary },
    mealReminderOfferTitle: { ...t.type.bodyStrong, color: t.colors.textPrimary },
    offCardButton: { borderColor: t.colors.border, backgroundColor: t.colors.surface2 },
    offCardButtonMuted: { borderColor: t.colors.border, backgroundColor: t.colors.surface2 },
    offCardDismiss: { fontSize: t.fontSize.sm, color: t.colors.textMuted },
    offCardCta: { ...t.type.label, color: t.colors.textPrimary },
    addMealRow: { backgroundColor: t.colors.surface2, borderColor: t.colors.border },
    addMealLabel: { ...t.type.label, color: t.colors.textPrimary },
    plannedBanner: { backgroundColor: t.colors.surface2, borderColor: withAlpha(t.colors.primary, alpha.edge) },
    plannedBannerText: { ...t.type.bodySm, color: t.colors.textPrimary },
    plannedBtnPrimary: {},
    plannedBtnPrimaryText: { fontSize: t.fontSize.sm },
    plannedBtnGhostButton: { borderColor: t.colors.border, backgroundColor: t.colors.surface2 },
    plannedBtnGhost: { ...t.type.label, color: t.colors.textPrimary },
    waterLabel: { color: t.colors.textPrimary, fontSize: t.fontSize.md },
    waterValue: { color: t.colors.textMuted, fontSize: t.fontSize.sm },
    waterBtn: { backgroundColor: t.colors.surface2 },
    waterTrack: { backgroundColor: t.colors.surface2 },
    waterFill: { backgroundColor: t.colors.primary },
  };
}
