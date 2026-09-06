/**
 * notifications/scheduler.js
 *
 * Cron-like scheduling helpers built on top of expo-notifications.
 * Each helper:
 *   1. Applies quiet hours to the requested trigger.
 *   2. Cancels the previous schedule for the same logical slot.
 *   3. Calls expo-notifications.scheduleNotificationAsync.
 *   4. On failure, fires notification_failed with the category.
 *
 * The handler in handler.js does the smart-suppression check at
 * delivery time. This file just lays the schedules down.
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CATEGORY } from './categories';
import {
  getQuietHours,
  shiftHourMinuteOutOfQuietHours,
  shiftDateOutOfQuietHours,
} from './quietHours';
import { trackNotificationFailed } from './telemetry';
import { COACHING_REMINDERS_CHANNEL } from './channels';
import { requestEventPushSlot } from './budget';
import { winbackPush, monthLabel } from './winbackContent';
import {
  getEpisode as getWinbackEpisode,
  getLastFiredAt as getWinbackLastFiredAt,
  getStatedReturn as getWinbackStatedReturn,
  markWinbackLaid,
  winbackFireDate,
  canLayWinback,
} from '../payments/winbackState';
import { localWeekStartMs } from '../dayKey';
import { logWarn } from '../errorLog';
import {
  trialDay3FireDate,
  trialStartFromEndsAt,
  selectTrialVariant,
  firstReviewUnlockDate,
  dayName,
  trialDay3Push,
} from '../trialActivation';
import { missedCheckinFireDates, missedCheckinPush } from './missedCheckin';
import { plannedMealConfirmPush, plannedConfirmSlot } from './plannedMealConfirm';
import { resolveActivationNudge, activationNudgePush, NUDGE_WINDOW_GRACE_MS } from '../activationNudge';
import { scheduleCheckedNotification } from './triggerDate';

const NOTIF_ID_MORNING = 'volyume_morning_weight';
const NOTIF_ID_EVENING = 'volyume_evening_weight';
const NOTIF_ID_CHECKIN = 'volyume_weekly_checkin';
const NOTIF_ID_TRIAL_DAY3 = 'volyume_trial_day3';
const NOTIF_ID_WINBACK = 'volyume_winback';
const NOTIF_PREFS_KEY = '@volyume_notification_prefs';

// The user's first name for a warm, personal greeting, or '' when we don't
// have one (so copy reads naturally either way). Read lazily from the store at
// schedule time, the same lazy-require pattern the rest of lib/ uses, so a name
// change is picked up the next time notifications are re-laid. Capped so a long
// or odd value can't blow out a notification title.
function greetName() {
  try {
    // eslint-disable-next-line global-require
    const useAppStore = require('../../store/useAppStore').default;
    const raw = useAppStore.getState()?.userProfile?.firstName;
    if (!raw || typeof raw !== 'string') return '';
    const first = raw.trim().split(/\s+/)[0];
    return first && first.length <= 20 ? `, ${first}` : '';
  } catch (_) {
    return '';
  }
}

// ─── Morning weight copy ──────────────────────────────────────────────────────

// Warm, encouraging morning copy. A gentle good-morning with the user's name
// (when we have it) and a kind nudge to weigh in. No clipped commands. The
// pool rotates across the week so it doesn't feel robotic; `name` is the
// pre-formatted ', First' suffix (or '').
function morningCopies(name) {
  return [
    { title: `Good morning${name}`, body: 'Whenever you\'re ready, hop on the scales and log today\'s weight.' },
    { title: `Good morning${name}`, body: 'A quiet weigh-in to start the day. No rush, just whenever suits you.' },
    { title: `Morning${name}`, body: 'When you get a moment, pop on the scales and log your weight. Volyume looks at these across the weeks to work out whether anything needs changing.' },
    { title: `Rise and shine${name}`, body: 'Logging your weight today keeps your coaching on track. Whenever you\'re ready.' },
  ];
}

function pickMorningCopy(dayOfWeek, name = '') {
  const copies = morningCopies(name);
  return copies[dayOfWeek % copies.length];
}

/**
 * Daily morning weight reminder. Quiet-hours shifts the trigger out
 * of the window if needed.
 *
 * @param {number} hour    0-23, default 7
 * @param {number} minute  0-59, default 0
 */

// ─── C8 Work 5 (R-16): bounded weigh-in reminder horizon ─────────────────────
// The two daily weight prompts used to be laid as REPEATING WEEKLY
// triggers, i.e. indefinitely. Campaign 7 measured the consequence: a
// user who stops opening the app keeps receiving two audible weight
// prompts a day for months (~360 over a 180-day lapse), with no in-app
// off switch at the tier most of them are on.
//
// The fix is restraint, not retention. Instead of an unbounded repeat,
// each prompt is laid as a bounded run of one-shot DATE triggers
// covering the app's existing 14-day recency boundary (the same
// constant the engine already treats as the detraining horizon - no new
// magic duration). Opening the app re-lays them (restoreNotifications
// runs at launch), so an ACTIVE user's experience is unchanged and a
// genuine return immediately restores the normal cadence. A user who
// never comes back simply stops being prompted after the horizon runs
// out.
//
// Copy rotation is preserved: each date keeps the weekday's own copy.
// Pending-notification budget: 14 days x 2 prompts is 28 one-shots,
// which sits inside iOS's 64-pending ceiling alongside the training,
// check-in and meal reminders.
const WEIGH_IN_HORIZON_DAYS = 14;

function weighInHorizonDates(hour, minute, days = WEIGH_IN_HORIZON_DAYS) {
  const out = [];
  // VOLYUME-1K, same fail-open shape as getNextWeekdayDate. An unusable hour
  // or minute makes every `new Date(...)` below invalid, and the past-date
  // skip cannot catch it because `NaN <= Date.now()` is FALSE: the Invalid
  // Date is pushed and scheduled, and traps natively. restoreNotifications
  // feeds this from stored prefs via `prefs.morningHour ?? 7`, and `??`
  // defaults only null/undefined, so a stored NaN reaches here intact.
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return out;
  const now = new Date();
  for (let i = 0; i <= days; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, hour, minute, 0, 0);
    if (!Number.isFinite(d.getTime())) continue; // proved, not compared
    if (d.getTime() <= Date.now()) continue; // never schedule into the past
    out.push(d);
    if (out.length >= days) break;
  }
  return out;
}

export async function scheduleMorningWeightNotification(hour = 7, minute = 0, { userInitiated = false } = {}) {
  if (Platform.OS === 'web') return;
  try {
    await cancelMorningNotification();
    // Review D6: stamp the horizon whenever this runs to a decision, so
    // the weekly foreground top-up knows how fresh the schedule is. A
    // withheld lay counts: there is nothing to top up while a flag is
    // open, and the ED-clear path re-lays immediately when it closes.
    await AsyncStorage.setItem(WEIGH_IN_LAID_KEY, String(Date.now())).catch(() => {});
    // ED-flag schedule gate (Q1): now that the morning nudge fires with sound,
    // it is also withheld while an ED flag is open, matching the evening
    // backstop. cancelMorningNotification above already cleared both prompts.
    if (await weighInEdFlagOpen()) return;
    // C14 J6 (R-16): three-week inactivity stand-down. cancelMorningNotification
    // above has already cleared anything laid, so returning here leaves the
    // user with no routine weigh-in prompts until a completed session returns
    // them. Their stored preference is untouched (see weighInStandDown).
    if (!userInitiated && await weighInStandDown()) return;
    const quiet = await getQuietHours();
    const { hour: h, minute: m } = shiftHourMinuteOutOfQuietHours(hour, minute, quiet);
    const name = greetName();
    // NOTIF-4: schedule one WEEKLY trigger per weekday so the morning copy
    // actually rotates. The old single DAILY trigger froze whatever copy was
    // picked at schedule time, so the per-weekday rotation never happened until
    // the next re-lay. expo weekday is 1=Sunday..7=Saturday -> JS getDay (w-1).
    // C8 Work 5 (R-16): a BOUNDED run of one-shots, re-laid on every
    // launch, instead of an indefinite weekly repeat.
    const dates = weighInHorizonDates(h, m);
    for (let i = 0; i < dates.length; i += 1) {
      const when = dates[i];
      const copy = pickMorningCopy(when.getDay(), name);
      // eslint-disable-next-line no-await-in-loop
      await scheduleCheckedNotification({
        identifier: `${NOTIF_ID_MORNING}_${i + 1}`,
        content: {
          title: copy.title,
          body: copy.body,
          data: { type: 'morning_weight' },
          // Q1: sound ON so a locked-phone morning nudge is actually noticed
          // (was silent). The handler still stands this down once the weight is
          // logged, and now also under an open ED flag (louder => must go quiet
          // when a flag is open).
          sound: true,
        },
        trigger: {
          channelId: COACHING_REMINDERS_CHANNEL,
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: when,
        },
      });
    }
  } catch (e) {
    trackNotificationFailed({
      category: CATEGORY.MORNING_WEIGHT,
      reason: 'schedule_threw',
      payload: { message: e?.message ?? 'unknown' },
    });
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      logWarn('notifications.scheduleMorningWeight', e?.message);
    }
  }
}

// ─── Evening weigh-in backstop (Q1) ───────────────────────────────────────────
// A gentle end-of-day second chance to log today's weight, laid alongside the
// morning nudge and governed by the SAME morningEnabled toggle. Copy is neutral
// ("if you haven't yet") so it never accuses a user who already logged, and the
// handler stands it down at delivery once the weight is logged or an ED flag is
// open. Additionally ED-gated at SCHEDULE time here: while a flag is open we do
// not lay it at all (a second daily weight prompt at a flagged user is the harm
// pattern). Re-laid on every launch (restoreNotifications), so it comes back the
// moment a flag clears.

// C5-P22-03 (D96): this is the weigh-in copy a first-week user reads most
// often, and it invited an evening reading into a series the app labels and
// consumes as MORNING weights. Two of the four rotating lines now name the
// trade-off, so a user who takes the backstop still learns the rule. Copy
// only: the ED schedule gate, the delivery stand-down, the toggle and the
// timing are untouched (Campaign 1 notification integrity).
function eveningCopies(name) {
  return [
    { title: `Evening${name}`, body: 'If you haven\'t caught today\'s weight yet, there\'s still time. No worries either way.' },
    { title: `Before the day\'s out${name}`, body: 'Still time to weigh in today if you want. Mornings are more consistent though, because food and drink through the day move the number about.' },
    { title: `Quick one${name}`, body: 'If you haven\'t weighed in today, there\'s still time whenever it suits you.' },
    { title: `Evening${name}`, body: 'Weigh in tonight if you like, or wait until tomorrow morning. Mornings are steadier, because your weight shifts through the day as you eat and drink.' },
  ];
}

function pickEveningCopy(dayOfWeek, name = '') {
  const copies = eveningCopies(name);
  return copies[dayOfWeek % copies.length];
}

// Shared ED-flag schedule gate for BOTH weigh-in prompts. A loud/repeated
// weight prompt at a flagged user is the harm pattern, so neither the morning
// nudge nor the evening backstop is laid while a flag is open. Because the OS
// delivers already-laid triggers in the background (where no handler runs),
// CoachOutputScreen also cancels these prompts the instant it raises a flag —
// this gate then stops restoreNotifications (which cancels-all, then re-lays)
// from putting them back while the flag stays open.
async function weighInEdFlagOpen() {
  try {
    // eslint-disable-next-line global-require
    const useAppStore = require('../../store/useAppStore').default;
    const uid = useAppStore.getState()?.user?.id;
    if (!uid) return false;
    // eslint-disable-next-line global-require
    const { getOpenEdPatternFlag } = require('../database');
    return !!(await getOpenEdPatternFlag(uid));
  } catch (_) {
    // ED-safety, fail CLOSED: a transient flag read error must SUPPRESS the
    // weigh-in schedule gate (treat it as flag-open), never lay a second daily
    // weight prompt at a possibly-flagged user.
    return true;
  }
}

// ─── C14 J6 (R-16): three-week inactivity stand-down ─────────────────────────
// Founder ruling (Campaign 14, Job 6, verbatim): "After THREE FULL WEEKS with
// no completed training session: routine weigh-in reminder scheduling stands
// down. This is not punishment and not a user-facing 'you disappeared' event.
// It simply stops repeated weight-adjacent prompting when the user is no
// longer actively using the training loop."
//
// What this is NOT: it is not "the setting was disabled". Nothing here writes,
// clears or downgrades the user's stored preference, so the Coaching reminders
// screen keeps showing their real choice. The state is: enabled, but
// temporarily inactive because the training loop went quiet.
//
// RETURN is automatic and silent. Every path that re-lays the weigh-in family
// re-evaluates this gate (restoreNotifications at launch / timezone change /
// the weekly foreground top-up, the reminders screen, and
// relayWeighInAfterTrainingReturn below, which the workout-finish flow calls),
// so a genuine completed session simply restores the existing schedule. No
// "welcome back to weighing" notification is sent, and the user never has to
// toggle the setting off and on again.
//
// It FAILS OPEN, deliberately, in both unknowable cases:
//   - the history read failed: behave exactly as before this change;
//   - no completed session exists at all: a brand-new user who set the
//     reminder up in onboarding and has not trained yet is owned by the
//     early-activation lever (activationNudge.js), not by this one.
// Silently suppressing a reminder the user asked for is worse than one extra
// prompt. That is the opposite direction of travel from weighInEdFlagOpen
// above, which fails CLOSED, and deliberately so: the ED gate protects a
// flagged user, this gate only restrains volume.
//
// One deliberate exemption, `userInitiated` (C14 lead ruling under D33). A
// user who goes to Settings and switches weigh-in reminders ON right now is
// making an explicit, present-tense request, and swallowing it would be the
// one case where this gate overrides a live user instruction rather than
// restraining unasked prompting. Their choice wins; the stand-down resumes
// on its own at the next ordinary re-lay if the training loop stays quiet.
// It exempts NOTHING else: the ED gate, the tier gate, quiet hours and the
// permission check all still run ahead of it on that path.
export const WEIGH_IN_STAND_DOWN_DAYS = 21; // three full weeks

// Local midnight, `days` LOCAL calendar days ago. Calendar arithmetic rather
// than days * 86400000 so a DST transition inside the window cannot move the
// boundary by an hour, matching weighInHorizonDates above and dayKey.js.
function localMidnightDaysAgo(days, nowMs = Date.now()) {
  const now = new Date(Number.isFinite(nowMs) ? nowMs : Date.now());
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - days).getTime();
}

async function weighInStandDown() {
  try {
    // eslint-disable-next-line global-require
    const useAppStore = require('../../store/useAppStore').default;
    const uid = useAppStore.getState()?.user?.id;
    if (!uid) return false; // nobody to read history for: behave as before
    // The canonical "when was the last COMPLETED training session" read: the
    // existing bounded recent-completed page, ordered by
    // COALESCE(ended_at, started_at, created_at) DESC, asked for one row --
    // exactly how blockAdvisor.js:521 already asks this same question. No new
    // query, and no is_completed definition of its own.
    // eslint-disable-next-line global-require
    const { getRecentCompletedWorkouts } = require('../database');
    const recent = await getRecentCompletedWorkouts(uid, 1);
    const last = Array.isArray(recent) ? recent[0] : null;
    const lastMs = Number(last?.endedAt ?? last?.startedAt ?? last?.createdAt);
    if (!Number.isFinite(lastMs)) return false; // no history on record: fail open
    // Stand down only once the whole of the last WEIGH_IN_STAND_DOWN_DAYS local
    // days has passed without a completed session. A session ON the boundary
    // day still counts as training, so the boundary itself fails open too.
    return lastMs < localMidnightDaysAgo(WEIGH_IN_STAND_DOWN_DAYS);
  } catch (_) {
    // Fail OPEN: a history-read failure must never silently suppress a
    // reminder the user opted into.
    return false;
  }
}

export async function cancelEveningWeightReminder() {
  // C8 Work 5: covers the old 7 weekly ids and the bounded one-shots.
  for (let w = 1; w <= WEIGH_IN_HORIZON_DAYS; w += 1) {
    // eslint-disable-next-line no-await-in-loop
    try { await Notifications.cancelScheduledNotificationAsync(`${NOTIF_ID_EVENING}_${w}`); } catch {}
  }
}

/**
 * Evening weigh-in backstop. Lays a BOUNDED 14-day run of one-shot triggers
 * (rotating copy, like the morning nudge), refreshed on every launch.
 * Suppressed at schedule time under an open ED flag, and again at delivery
 * (handler) once the weight is logged / the flag is open.
 *
 * @param {number} hour    0-23, default 19 (19:30 local)
 * @param {number} minute  0-59, default 30
 */
export async function scheduleEveningWeightReminder(hour = 19, minute = 30, { userInitiated = false } = {}) {
  if (Platform.OS === 'web') return;
  try {
    await cancelEveningWeightReminder();
    // ED-flag schedule gate: never lay a second daily weight prompt while a flag
    // is open. Re-laid by restoreNotifications on the next launch/foreground
    // after the flag clears (and by clearEdPatternFlag's caller at clear time).
    if (await weighInEdFlagOpen()) return;
    // C14 J6 (R-16): the same three-week inactivity stand-down as the morning
    // nudge. cancelEveningWeightReminder above has already cleared anything
    // laid; the user's stored preference is untouched.
    if (!userInitiated && await weighInStandDown()) return;
    const quiet = await getQuietHours();
    const { hour: h, minute: m } = shiftHourMinuteOutOfQuietHours(hour, minute, quiet);
    const name = greetName();
    // C8 Work 5 (R-16): same bounded horizon as the morning prompt.
    const dates = weighInHorizonDates(h, m);
    for (let i = 0; i < dates.length; i += 1) {
      const when = dates[i];
      const copy = pickEveningCopy(when.getDay(), name);
      // eslint-disable-next-line no-await-in-loop
      await scheduleCheckedNotification({
        identifier: `${NOTIF_ID_EVENING}_${i + 1}`,
        content: {
          title: copy.title,
          body: copy.body,
          data: { type: 'evening_weight' },
          sound: true,
        },
        trigger: {
          channelId: COACHING_REMINDERS_CHANNEL,
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: when,
        },
      });
    }
  } catch (e) {
    trackNotificationFailed({
      category: CATEGORY.EVENING_WEIGHT,
      reason: 'schedule_threw',
      payload: { message: e?.message ?? 'unknown' },
    });
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      logWarn('notifications.scheduleEveningWeight', e?.message);
    }
  }
}

/**
 * C14 J6 (R-16): the silent RETURN path for the inactivity stand-down.
 *
 * Called from the workout-finish flow once a completed session has landed in
 * the DB (ActiveWorkoutScreen). It re-lays the user's EXISTING weigh-in
 * schedule and nothing else: standing down never touched their stored
 * preference, so there is nothing to restore and nothing to tell them. No
 * notification is sent about the return, and no new copy exists for it.
 *
 * Deliberately narrow rather than a call to restoreNotifications: that path
 * cancels ALL scheduled notifications first, which would wipe already-laid
 * one-shots (the activation nudge) whose own watermarks would
 * then refuse to lay them again. So it re-lays only the weigh-in family, and
 * carries the same three gates restoreNotifications applies to that family --
 * OS permission, the E10-F4 Pro tier gate, and the user's own morningEnabled
 * toggle (a user who opted out stays opted out). Quiet hours, the ED-flag
 * schedule gate and the stand-down gate itself are applied by the two
 * schedulers below, exactly as on every other path.
 *
 * Best-effort and never throws; if it cannot run, the next launch re-lay
 * (restoreNotifications) covers the same ground.
 */
export async function relayWeighInAfterTrainingReturn() {
  if (Platform.OS === 'web') return;
  try {
    const raw = await AsyncStorage.getItem(NOTIF_PREFS_KEY);
    const prefs = raw ? JSON.parse(raw) : null;
    // Reads the preference through the ONE authority (C14 job 3), never
    // writes it. Reading prefs.morningEnabled directly would be stricter
    // than the authority is: a user who has never opened the reminders
    // screen has no such field and IS enabled by default, and would have
    // been skipped by the return path while every other path scheduled
    // for them - the exact two-answers-to-one-question defect job 3 exists
    // to remove.
    // eslint-disable-next-line global-require
    const { isCategoryEnabled } = require('./categoryPrefs');
    // eslint-disable-next-line global-require
    const { CATEGORY: CAT } = require('./categories');
    if (!(await isCategoryEnabled(CAT.MORNING_WEIGHT))) return;
    // eslint-disable-next-line global-require
    const { getNotificationPermissionStatus } = require('./permissions');
    const status = await getNotificationPermissionStatus();
    if (status !== 'granted') return;
    let isPro = false;
    try {
      // eslint-disable-next-line global-require
      isPro = require('../../store/useAppStore').default.getState()?.tier === 'pro';
    } catch (_) { /* store unavailable: fail closed (no coaching re-lay) */ }
    if (!isPro) return;
    await scheduleMorningWeightNotification(prefs?.morningHour ?? 7, prefs?.morningMinute ?? 0);
    await scheduleEveningWeightReminder(prefs?.eveningHour ?? 19, prefs?.eveningMinute ?? 30);
  } catch (_) { /* best-effort: the next launch re-lay covers this */ }
}

// ─── Meal-log reminders (gap #4) ───────────────────────────────────────────────
// Opt-in, convenience-only daily nudges to log a meal. STRICTLY no guilt: no
// "you haven't logged", no "you're behind", no streak. The body just offers a
// gentle reminder. Default OFF; added in Notification settings. Quiet hours are
// respected. Each reminder is { id, label, hour, minute, enabled }.
//
// FM-01 (D96): PRO ONLY. The food diary these reminders point at is Pro
// (DiaryScreen is read-only for every other tier), so a Free user who switched
// them on was nudged to log breakfast, lunch and dinner every day into a
// feature they cannot use -- a Pro feature failing silently on their phone,
// which Phase 31 forbids. The gate lives in scheduleMealReminders itself as
// well as at the offer (NotificationSettingsScreen), so the launch re-lay in
// restoreNotifications and any future caller inherit it.
const NOTIF_ID_MEAL_PREFIX = 'volyume_meal_reminder_';

// Campaign 1 P0-5: the meal-reminder preference key lives HERE (single
// owner) so restoreNotifications can re-lay the user's enabled reminders
// after its cancelAllNotifications wipe. NotificationSettingsScreen
// imports this same constant; before the fix the key existed only in the
// screen and the restore path omitted meal reminders entirely, so every
// app launch silently erased them until the user revisited settings.
export const MEAL_REMINDERS_KEY = '@volyume_meal_reminders';

export async function cancelMealReminders() {
  if (Platform.OS === 'web') return;
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
    for (const n of all || []) {
      if (typeof n?.identifier === 'string' && n.identifier.startsWith(NOTIF_ID_MEAL_PREFIX)) {
        // eslint-disable-next-line no-await-in-loop
        await Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {});
      }
    }
  } catch (_) { /* tolerate */ }
}

export async function scheduleMealReminders(reminders = []) {
  if (Platform.OS === 'web') return;
  try {
    await cancelMealReminders();
    // FM-01 (D96): Pro-gated, like schedulePlannedMealConfirm. See the note
    // above this function for why. Fail closed on an unreadable store.
    try {
      // eslint-disable-next-line global-require
      const store = require('../../store/useAppStore').default;
      if (store.getState()?.tier !== 'pro') return;
    } catch (_) { return; }
    // Campaign 1 review BLOCKER 2 (ED-safety): meal-log reminders are
    // weight/food-adjacent and were the ONE such category with no ED-flag
    // gate - largely masked while the launch wipe kept them from firing,
    // which the P0-5 re-lay fixed. Fail CLOSED like every sibling
    // scheduler (schedulePlannedMealConfirm): an open flag, or a failed
    // read, schedules nothing (the reminders are already cancelled above,
    // so a flag raised after scheduling also goes quiet on next launch;
    // the delivery handler is the second line of defence).
    try {
      // eslint-disable-next-line global-require
      const store = require('../../store/useAppStore').default;
      const uid = store.getState().user?.id ?? null;
      if (uid) {
        // eslint-disable-next-line global-require
        const { getOpenEdPatternFlag } = require('../database');
        const flag = await getOpenEdPatternFlag(uid).catch(() => 'read_failed');
        if (flag) return;
      }
    } catch (_) { return; /* cannot verify the flag: stay silent */ }
    const quiet = await getQuietHours();
    for (const r of reminders) {
      // Campaign 1 review NIT 16: explicit-true only, matching the
      // re-lay gate's semantics (stored shapes always carry the boolean).
      if (!r || r.enabled !== true || r.id == null) continue;
      const hr = Math.max(0, Math.min(23, r.hour | 0));
      const mn = Math.max(0, Math.min(59, r.minute | 0));
      const { hour: h, minute: m } = shiftHourMinuteOutOfQuietHours(hr, mn, quiet);
      const label = (typeof r.label === 'string' && r.label.trim()) ? r.label.trim().slice(0, 24) : 'Meal';
      // eslint-disable-next-line no-await-in-loop
      await scheduleCheckedNotification({
        identifier: `${NOTIF_ID_MEAL_PREFIX}${r.id}`,
        content: {
          title: label,
          body: 'A gentle reminder to log it if it helps. No pressure.',
          data: { type: CATEGORY.MEAL_LOG_REMINDER },
          sound: false,
        },
        trigger: {
          channelId: COACHING_REMINDERS_CHANNEL,
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: h,
          minute: m,
        },
      });
    }
  } catch (e) {
    trackNotificationFailed({
      category: CATEGORY.MEAL_LOG_REMINDER,
      reason: 'schedule_threw',
      payload: { message: e?.message ?? 'unknown' },
    });
  }
}

// ─── Weekly check-in reminder ─────────────────────────────────────────────────

function checkinCopy(name) {
  return {
    title: `How has your week gone${name}?`,
    body: 'A two-minute check-in is all it takes, and your coach tunes next week around it.',
  };
}

/**
 * Returns a Date for the next occurrence of (weekday at hour:minute)
 * strictly after `after`. Used for one-off check-in reminders so we
 * can skip the week when the user has already checked in.
 */
function getNextWeekdayDate(weekday, hour, minute, after = new Date()) {
  // VOLYUME-1K: this used to be able to hand back an Invalid Date, which then
  // killed the app natively downstream (see triggerDate.js for the trap).
  // setHours(NaN, ...) invalidates the Date outright, and neither guard below
  // repairs it: `target.getTime() <= after.getTime()` is FALSE for NaN, and
  // setDate(getDate() + NaN) leaves it invalid. So the inputs are proved
  // usable here rather than assumed, and an unusable one yields null for the
  // caller to skip on. Proving beats comparing: NaN passes every comparison.
  const usable = (n) => Number.isFinite(n);
  if (!usable(weekday) || !usable(hour) || !usable(minute)) return null;
  const target = new Date(after);
  if (Number.isNaN(target.getTime())) return null;
  const currentDow = target.getDay();
  let daysUntil = (weekday - currentDow + 7) % 7;
  target.setHours(hour, minute, 0, 0);
  if (daysUntil === 0 && target.getTime() <= after.getTime()) {
    daysUntil = 7;
  }
  target.setDate(target.getDate() + daysUntil);
  return target;
}

export async function scheduleCheckinReminder(weekday = 0, hour = 12, minute = 0, options = {}) {
  if (Platform.OS === 'web') return;
  try {
    await Notifications.cancelScheduledNotificationAsync(NOTIF_ID_CHECKIN).catch(() => {});

    const baseAfter = options.skipThisWeek
      ? new Date(Date.now() + 24 * 60 * 60 * 1000)
      : new Date();
    let fireAt = getNextWeekdayDate(weekday, hour, minute, baseAfter);
    // Unusable weekday/hour/minute: skip rather than schedule. Reported so
    // the caller that supplied them names itself (VOLYUME-1K).
    if (!fireAt) {
      trackNotificationFailed({
        category: CATEGORY.WEEKLY_CHECKIN_REMINDER,
        reason: 'invalid_trigger_date',
        payload: { raw: 'unusable-weekday-hour-minute', scope: 'scheduleCheckinReminder' },
      });
      return;
    }

    // Minimum-gap enforcement: when the user changes their check-in
    // day mid-cycle, the next reminder must still land at least
    // minGapDays after their LAST check-in so the coach gets a full
    // weekly trend window.
    const minGapMs = (options.minGapDays ?? 0) * 24 * 60 * 60 * 1000;
    const lastCheckinMs = options.lastCheckinMs ?? 0;
    // Coach-wiring audit finding 2 (2026-07-13, same trust-defect class as
    // the Home nudge fix): a reminder must never fire before the check-in
    // gate can possibly open. Callers that know an unlock time (onboarding
    // knows the first check-in needs FIRST_CHECKIN_MIN_DAYS of data) pass
    // earliestMs; occurrences before it roll forward a week at a time,
    // exactly like the min-gap rule.
    const earliest = Math.max(
      minGapMs > 0 && lastCheckinMs > 0 ? lastCheckinMs + minGapMs : 0,
      options.earliestMs ?? 0,
    );
    if (earliest > 0) {
      while (fireAt.getTime() < earliest) {
        fireAt.setDate(fireAt.getDate() + 7);
      }
    }

    const quiet = await getQuietHours();
    const { date: shiftedDate } = shiftDateOutOfQuietHours(fireAt, quiet);

    const checkin = checkinCopy(greetName());
    await scheduleCheckedNotification({
      identifier: NOTIF_ID_CHECKIN,
      content: {
        title: checkin.title,
        body: checkin.body,
        data: { type: 'weekly_checkin' },
        sound: false,
      },
      trigger: {
        channelId: COACHING_REMINDERS_CHANNEL,
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: shiftedDate,
      },
    });
  } catch (e) {
    trackNotificationFailed({
      category: CATEGORY.WEEKLY_CHECKIN_REMINDER,
      reason: 'schedule_threw',
      payload: { message: e?.message ?? 'unknown' },
    });
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      logWarn('notifications.scheduleCheckin', e?.message);
    }
  }
}

/**
 * Start (Monday 00:00 LOCAL) of the current week, in epoch ms. Local, not
 * UTC, so it matches getCurrentWeekStart in WeeklyCheckInScreen and the
 * rest of the app's week boundary (UK-local rule).
 */
function getCurrentMondayWeekStartMs() {
  return localWeekStartMs();
}

/**
 * Schedule the next check-in reminder, but skip the upcoming
 * check-in day if the user has already saved a check-in for this
 * calendar week.
 */
export async function scheduleNextCheckinReminder(userId, weekday = 0, hour = 12, minute = 0) {
  let alreadyDone = false;
  try {
    if (userId) {
      // eslint-disable-next-line global-require
      const { getLatestCheckin } = require('../database');
      const latest = await getLatestCheckin(userId);
      const cycleStart = getCurrentMondayWeekStartMs();
      const now = Date.now();
      // Suppress on the check-in's actual creation instant, not its stored
      // week_start. created_at is an absolute timestamp, so it matches the
      // local week regardless of how week_start was computed (older rows
      // stored a UTC-Monday week_start); falls back to weekStart only if a
      // row somehow lacks created_at.
      // A row can exist from a completed workout (which contributes only
      // sleep_quality), so require a real check-in: energy_score is always set
      // by the weekly check-in. Without this, training suppressed the next
      // check-in reminder even though the user never checked in.
      const madeAt = latest?.createdAt ?? latest?.weekStart ?? 0;
      if (latest && latest.energyScore != null && madeAt >= cycleStart && madeAt <= now) {
        alreadyDone = true;
      }
    }
  } catch {}
  await scheduleCheckinReminder(weekday, hour, minute, { skipThisWeek: alreadyDone });
}

// ─── Cascade gate (day 19 + day 21) ─────────────────────────────────────────────
// NOTIFICATIONS_LOCKED.md "Timing": cascade day 19 (Pro winding down)
// and day 21 (auto-downgrade fired) both at 10:00 local, not
// configurable. These are LOCAL one-shots derived from the trial end
// date the device already holds (proTrialEndsAt); no server push is
// involved. The end date is the trial cutover (day 14 of the 14-day
// trial); the first push fires 2 days before (day 12), matching the
// "ends in two days" copy. The identifier strings still say day19/day21
// from the retired 3-tier cascade: they are KEPT deliberately, because
// cancel-before-reschedule matches on identifier and renaming them would
// orphan schedules already laid on updated devices. Names are cosmetic;
// the fire dates are derived from proTrialEndsAt either way (E10-F6).

const NOTIF_ID_CASCADE_19 = 'volyume_cascade_day19';
const NOTIF_ID_CASCADE_21 = 'volyume_cascade_day21';

const CASCADE_19_COPY = {
  title: 'Your free Pro trial ends in two days',
  body: 'Hope you\'ve been enjoying it. Have a look at your options whenever you\'re ready.',
};
const CASCADE_21_COPY = {
  title: 'You\'re back on the free plan',
  body: 'Everything you\'ve logged is safe and waiting. You can go Pro again any time.',
};

/**
 * Schedule both cascade-gate reminders from the trial end date.
 *
 * @param {number|string|Date} trialEndsAt  proTrialEndsAt: the day-21
 *        cutover instant. Day 19 is derived as 2 days earlier.
 *
 * Both fire at 10:00 local on their day, shifted out of quiet hours.
 * Past gates are skipped (a trial ending tomorrow has no day-19 push).
 * Re-running cancels and re-lays the schedules, so calling this on
 * every launch is safe and idempotent.
 */
export async function scheduleCascadeGateNotifications(trialEndsAt) {
  if (Platform.OS === 'web') return;
  // FULLY-FREE PRODUCT (founder decision 2026-09-03, src/lib/proGate.js).
  // There is no trial, no cascade gate and no churn, so this family is a
  // no-op. The function, its ids and its copy module stay compiled and
  // tested; only the scheduling is stood down, and any already-laid push is
  // cancelled so an existing user's queue drains rather than firing a
  // notification about a trial that no longer exists.
  // eslint-disable-next-line global-require
  if (require('../proGate').FULL_ACCESS_FOR_ALL) { await cancelCascadeGateNotifications(); return; }
  const endMs = trialEndsAt instanceof Date
    ? trialEndsAt.getTime()
    : (typeof trialEndsAt === 'number' ? trialEndsAt : Date.parse(trialEndsAt));
  if (!Number.isFinite(endMs)) return;

  try {
    await Notifications.cancelScheduledNotificationAsync(NOTIF_ID_CASCADE_19).catch(() => {});
    await Notifications.cancelScheduledNotificationAsync(NOTIF_ID_CASCADE_21).catch(() => {});

    const quiet = await getQuietHours();
    const now = Date.now();

    // Day 21: 10:00 local on the cutover day.
    const day21 = new Date(endMs);
    day21.setHours(10, 0, 0, 0);
    // Day 19: 10:00 local, two days before the cutover.
    const day19 = new Date(endMs);
    day19.setDate(day19.getDate() - 2);
    day19.setHours(10, 0, 0, 0);

    const gates = [
      { id: NOTIF_ID_CASCADE_19, when: day19, copy: CASCADE_19_COPY },
      { id: NOTIF_ID_CASCADE_21, when: day21, copy: CASCADE_21_COPY },
    ];

    for (const g of gates) {
      if (g.when.getTime() <= now) continue; // past gate, don't schedule
      const { date: shifted } = shiftDateOutOfQuietHours(g.when, quiet);
      // Push budget (NOTIFICATIONS_LOCKED addendum): cascade gates are top
      // priority, so this evicts a lower-priority push on a full day rather
      // than ever dropping the gate itself.
      const slot = await requestEventPushSlot({ category: CATEGORY.CASCADE_GATE, fireDate: shifted });
      if (!slot.allowed) continue;
      await scheduleCheckedNotification({
        identifier: g.id,
        content: {
          title: g.copy.title,
          body: g.copy.body,
          data: { type: 'cascade_gate' },
          sound: false,
        },
        trigger: {
          channelId: COACHING_REMINDERS_CHANNEL,
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: shifted,
        },
      });
    }
  } catch (e) {
    trackNotificationFailed({
      category: CATEGORY.CASCADE_GATE,
      reason: 'schedule_threw',
      payload: { message: e?.message ?? 'unknown' },
    });
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      logWarn('notifications.scheduleCascadeGate', e?.message);
    }
  }
}

export async function cancelCascadeGateNotifications() {
  try { await Notifications.cancelScheduledNotificationAsync(NOTIF_ID_CASCADE_19); } catch {}
  try { await Notifications.cancelScheduledNotificationAsync(NOTIF_ID_CASCADE_21); } catch {}
}

// ─── COMP-023: trial day-3 "the coach saw you" moment ─────────────────────────
// One local notification per trial, fired at trial start + 3 days, 10:00 local
// (quiet-hours-shifted), variant + copy baked from live local counters at
// schedule time. Like the cascade gates, this is wiped by cancelAllNotifications
// on restore, so restoreNotifications re-lays it. Suppressed entirely under an
// open ED flag (the Home banner carries a neutral, no-weight line instead).

export async function cancelTrialDay3Notification() {
  try { await Notifications.cancelScheduledNotificationAsync(NOTIF_ID_TRIAL_DAY3); } catch {}
}

export async function scheduleTrialDay3Notification(userId, profile) {
  if (Platform.OS === 'web') return;
  // FULLY-FREE PRODUCT (founder decision 2026-09-03, src/lib/proGate.js).
  // There is no trial, no cascade gate and no churn, so this family is a
  // no-op. The function, its ids and its copy module stay compiled and
  // tested; only the scheduling is stood down, and any already-laid push is
  // cancelled so an existing user's queue drains rather than firing a
  // notification about a trial that no longer exists.
  // eslint-disable-next-line global-require
  if (require('../proGate').FULL_ACCESS_FOR_ALL) { await cancelTrialDay3Notification(); return; }
  try {
    // eslint-disable-next-line global-require
    const { stageOf } = require('../payments/cascade');
    if (!profile || stageOf(profile) !== 'pro_trial') { await cancelTrialDay3Notification(); return; }

    const endsAt = profile.proTrialEndsAt ?? profile.pro_trial_ends_at ?? null;
    const fire = trialDay3FireDate(endsAt);
    // No valid date, or day 3 already passed (user opening later in the trial):
    // nothing to lay; the Home banner carries the moment in-app.
    if (!fire || fire.getTime() <= Date.now()) { await cancelTrialDay3Notification(); return; }

    // eslint-disable-next-line global-require
    const db = require('../database');
    const [workouts, weights, edFlag] = await Promise.all([
      userId ? db.getAllWorkouts(userId).catch(() => []) : Promise.resolve([]),
      userId ? db.getMorningWeightsLast14Days(userId).catch(() => []) : Promise.resolve([]),
      // ED-safety, fail CLOSED: a transient flag read maps to the truthy
      // 'read_failed' sentinel so the gate below suppresses the weight-adjacent
      // push, never lays it at a possibly-flagged user.
      userId ? db.getOpenEdPatternFlag(userId).catch(() => 'read_failed') : Promise.resolve(null),
    ]);

    // Open ED flag → never schedule a weight-adjacent push; the banner falls
    // back to a neutral line with no counts or weight ask.
    if (edFlag) { await cancelTrialDay3Notification(); return; }

    const trialStart = trialStartFromEndsAt(endsAt);
    const completedSessions = workouts.filter(w => w.isCompleted && (w.startedAt ?? 0) >= trialStart).length;
    const weekAgo = Date.now() - 7 * 86400000;
    const weighIns7d = weights.filter(w => (w.loggedAt ?? 0) >= weekAgo).length;
    const firstWeightAt = weights.length
      ? Math.min(...weights.map(w => w.loggedAt ?? Infinity))
      : null;

    let checkinDay = 0;
    try {
      const raw = await AsyncStorage.getItem(NOTIF_PREFS_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (Number.isFinite(p?.checkinDay)) checkinDay = p.checkinDay;
      }
    } catch (_) { /* default Sunday */ }

    const variant = selectTrialVariant({ completedSessions, weighIns7d });
    const unlock = firstReviewUnlockDate(firstWeightAt, checkinDay);
    const copy = trialDay3Push({ variant, completedSessions, weighIns7d, unlockDayName: dayName(unlock) });

    await cancelTrialDay3Notification();
    const quiet = await getQuietHours();
    const { date: shifted } = shiftDateOutOfQuietHours(fire, quiet);
    // Push budget (NOTIFICATIONS_LOCKED addendum). Blocked = dropped, not
    // re-queued; the Home banner still carries the day-3 moment in-app.
    const slot = await requestEventPushSlot({ category: CATEGORY.TRIAL_DAY3, fireDate: shifted });
    if (!slot.allowed) return;
    await scheduleCheckedNotification({
      identifier: NOTIF_ID_TRIAL_DAY3,
      content: {
        title: copy.title,
        body: copy.body,
        data: { type: 'trial_day3', variant },
        sound: false,
      },
      trigger: {
        channelId: COACHING_REMINDERS_CHANNEL,
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: shifted,
      },
    });
  } catch (e) {
    trackNotificationFailed({
      category: CATEGORY.TRIAL_DAY3,
      reason: 'schedule_threw',
      payload: { message: e?.message ?? 'unknown' },
    });
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      logWarn('notifications.scheduleTrialDay3', e?.message);
    }
  }
}

// ─── COMP-025-A: post-churn win-back ─────────────────────────────────────────
// One local notification per churn episode, anchored on the lapse timestamp
// (+30 days by default, or the §4d stated-return window). Re-laid on each app
// open while the fire date is still in the future so the session counts stay
// fresh (local notifications bake content at schedule time). Suppressed
// entirely while a wellbeing/ED flag is open. Single-shot is enforced by
// winbackState (one per episode + an absolute 180-day floor across episodes).
//
// Honest v1 limit (accepted, see blueprint §4c): a user who never reopens the
// app during the lapsed window never gets it — quiet hours + prefs live only on
// device, and an unsolicited server push to the never-returning segment reads
// most like spam.

export async function cancelWinbackNotification() {
  try { await Notifications.cancelScheduledNotificationAsync(NOTIF_ID_WINBACK); } catch {}
}

export async function scheduleWinbackNotification(userId) {
  if (Platform.OS === 'web') return;
  // FULLY-FREE PRODUCT (founder decision 2026-09-03, src/lib/proGate.js).
  // There is no trial, no cascade gate and no churn, so this family is a
  // no-op. The function, its ids and its copy module stay compiled and
  // tested; only the scheduling is stood down, and any already-laid push is
  // cancelled so an existing user's queue drains rather than firing a
  // notification about a trial that no longer exists.
  // eslint-disable-next-line global-require
  if (require('../proGate').FULL_ACCESS_FOR_ALL) { await cancelWinbackNotification(); return; }
  try {
    const episode = await getWinbackEpisode();
    if (!episode) { await cancelWinbackNotification(); return; }

    // ED/wellbeing suppression (§5): never lay (and cancel any already-laid one)
    // while a flag is open. Silence is the respectful behaviour.
    // eslint-disable-next-line global-require
    const db = require('../database');
    // ED-safety, fail CLOSED: a transient flag read maps to the truthy
    // 'read_failed' sentinel so the gate suppresses (cancels) the win-back push.
    const edFlag = userId ? await db.getOpenEdPatternFlag(userId).catch(() => 'read_failed') : null;
    if (edFlag) { await cancelWinbackNotification(); return; }
    // C6 R-17 (D97-22): calm mode joins the gate. Suppressions on this
    // surface treat calm and an open flag as one posture (deliberately
    // ORed app-wide); the win-back was the one lay that only checked the
    // flag. The calm read uses the app's standard getWellbeingMode
    // semantics; the ED read above remains the fail-closed layer.
    try {
      // eslint-disable-next-line global-require
      const { getWellbeingMode, isCalm } = require('../wellbeing');
      const mode = await getWellbeingMode().catch(() => 'calm');
      if (isCalm(mode)) { await cancelWinbackNotification(); return; }
    } catch (_) { await cancelWinbackNotification(); return; }

    const statedReturn = await getWinbackStatedReturn();
    const fire = winbackFireDate(episode.lapseAt, statedReturn);
    // The window has arrived/passed: leave whatever is already laid (it has
    // fired or fires imminently); never schedule a past date. v1 does not chase
    // a window that elapsed while suppressed.
    if (fire.getTime() <= Date.now()) return;

    // First lay of this episode is gated by the cross-episode 180-day floor;
    // a re-lay (to refresh counts) of an already-laid episode is not — it is the
    // same single win-back, rescheduled under one identifier.
    const firstLay = !episode.winbackLaid;
    if (firstLay) {
      const lastFiredAt = await getWinbackLastFiredAt();
      if (!canLayWinback({ episode, lastFiredAt })) return;
    }

    // Counts from existing free-tier data (sessions only — never weight or
    // calorie figures, per §5).
    const workouts = userId ? await db.getAllWorkouts(userId).catch(() => []) : [];
    const completed = workouts.filter(w => w.isCompleted);
    const sessionsSince = completed.filter(w => (w.startedAt ?? 0) >= episode.lapseAt).length;
    const totalSessions = completed.length;
    const copy = winbackPush({
      sessionsSince,
      totalSessions,
      sinceLabel: monthLabel(episode.lapseAt),
      statedReturn,
    });

    await cancelWinbackNotification();
    const quiet = await getQuietHours();
    const { date: shifted } = shiftDateOutOfQuietHours(fire, quiet);
    // Push budget (NOTIFICATIONS_LOCKED addendum). Blocked = not laid and not
    // marked, so the next app-open re-lay retries the same window.
    const slot = await requestEventPushSlot({ category: CATEGORY.WINBACK, fireDate: shifted });
    if (!slot.allowed) return;
    await scheduleCheckedNotification({
      identifier: NOTIF_ID_WINBACK,
      content: {
        title: copy.title,
        body: copy.body,
        data: { type: 'winback' },
        sound: false,
      },
      trigger: {
        channelId: COACHING_REMINDERS_CHANNEL,
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: shifted,
      },
    });
    // notification_sent telemetry fires from the OS-received listener
    // (listeners.js), which derives the WINBACK category from data.type — the
    // same convention the other schedulers follow. Emitting it here would
    // double-count on every count-refresh re-lay.
    if (firstLay) await markWinbackLaid();
  } catch (e) {
    trackNotificationFailed({
      category: CATEGORY.WINBACK,
      reason: 'schedule_threw',
      payload: { message: e?.message ?? 'unknown' },
    });
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      logWarn('notifications.scheduleWinback', e?.message);
    }
  }
}

// ─── OPP-C03: missed check-in ghost prevention ───────────────────────────────
// Two single-shot pushes per missed check-in episode: a gentle same-evening
// nudge (20:00 local on the check-in day) and a value-led +48h follow-up.
// Never shame copy. Pro-only, toggleable (Settings → Coaching reminders),
// suppressed entirely under an open ED flag, quiet-hours shifted and gated
// through the push budget. Like the cascade gates, the pair is wiped by
// cancelAllNotifications on restore, so restoreNotifications re-lays it; the
// episode maths in missedCheckin.js keeps re-lays single-shot (a slot whose
// date has passed is never laid again for the same episode).

const NOTIF_ID_CHECKIN_MISSED_EVENING = 'volyume_checkin_missed_evening';
const NOTIF_ID_CHECKIN_MISSED_48H = 'volyume_checkin_missed_48h';

export async function cancelMissedCheckinFollowups() {
  try { await Notifications.cancelScheduledNotificationAsync(NOTIF_ID_CHECKIN_MISSED_EVENING); } catch {}
  try { await Notifications.cancelScheduledNotificationAsync(NOTIF_ID_CHECKIN_MISSED_48H); } catch {}
}

export async function scheduleMissedCheckinFollowups(userId) {
  if (Platform.OS === 'web') return;
  try {
    // Pro-only: check-ins are a Pro coaching input, so the follow-ups never
    // reach free users.
    // eslint-disable-next-line global-require
    const useAppStore = require('../../store/useAppStore').default;
    if (useAppStore.getState()?.tier !== 'pro') {
      await cancelMissedCheckinFollowups();
      return;
    }

    // Category toggle (default on) + the user's check-in schedule, from the
    // same prefs blob the check-in reminder uses.
    let prefs = {};
    try {
      const raw = await AsyncStorage.getItem(NOTIF_PREFS_KEY);
      if (raw) prefs = JSON.parse(raw) ?? {};
    } catch (_) { /* defaults below */ }
    if (prefs.missedCheckinEnabled === false) {
      await cancelMissedCheckinFollowups();
      return;
    }
    const weekday = Number.isFinite(prefs.checkinDay) ? prefs.checkinDay : 0;
    const hour = Number.isFinite(prefs.checkinHour) ? prefs.checkinHour : 18;
    const minute = Number.isFinite(prefs.checkinMinute) ? prefs.checkinMinute : 0;

    // Open ED/wellbeing flag → never lay (and retire anything laid). Silence
    // is the respectful behaviour; the suppression is consumed here, never
    // altered.
    // eslint-disable-next-line global-require
    const db = require('../database');
    // ED-safety, fail CLOSED: a transient flag read maps to the truthy
    // 'read_failed' sentinel so the gate suppresses (retires) the follow-ups.
    const edFlag = userId ? await db.getOpenEdPatternFlag(userId).catch(() => 'read_failed') : null;
    if (edFlag) {
      await cancelMissedCheckinFollowups();
      return;
    }

    // The last REAL check-in (energy score present, same rule as the
    // reminder's skip logic) resolves the episode: a checked-in week pre-lays
    // for the next expected occurrence instead.
    let lastCheckinMs = 0;
    try {
      const latest = userId ? await db.getLatestCheckin(userId) : null;
      if (latest && latest.energyScore != null) {
        lastCheckinMs = latest.createdAt ?? latest.weekStart ?? 0;
      }
    } catch (_) { /* treat as never checked in */ }

    const { evening, followup } = missedCheckinFireDates({
      weekday, hour, minute, now: new Date(), lastCheckinMs, minGapDays: 7,
    });

    await cancelMissedCheckinFollowups();
    const quiet = await getQuietHours();
    const copy = missedCheckinPush(greetName());
    const slots = [
      { id: NOTIF_ID_CHECKIN_MISSED_EVENING, when: evening, copy: copy.evening, slot: 'evening' },
      { id: NOTIF_ID_CHECKIN_MISSED_48H, when: followup, copy: copy.followup, slot: 'followup' },
    ];
    for (const s of slots) {
      if (!s.when || s.when.getTime() <= Date.now()) continue; // past slot: never chased
      const { date: shifted } = shiftDateOutOfQuietHours(s.when, quiet);
      // Push budget: blocked = dropped for this episode, never re-queued.
      // eslint-disable-next-line no-await-in-loop
      const slotOk = await requestEventPushSlot({ category: CATEGORY.CHECKIN_MISSED, fireDate: shifted });
      if (!slotOk.allowed) continue;
      // eslint-disable-next-line no-await-in-loop
      await scheduleCheckedNotification({
        identifier: s.id,
        content: {
          title: s.copy.title,
          body: s.copy.body,
          data: { type: 'checkin_missed', slot: s.slot },
          sound: false,
        },
        trigger: {
          channelId: COACHING_REMINDERS_CHANNEL,
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: shifted,
        },
      });
    }
  } catch (e) {
    trackNotificationFailed({
      category: CATEGORY.CHECKIN_MISSED,
      reason: 'schedule_threw',
      payload: { message: e?.message ?? 'unknown' },
    });
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      logWarn('notifications.scheduleMissedCheckin', e?.message);
    }
  }
}

// ─── S6: early-activation nudge ──────────────────────────────────────────────
// A single-shot push per stall stage (0/1/2 completed sessions in the first 14
// days) for a brand-new user, plus the matching Home banner (HomeScreen reads
// the same resolveActivationNudge). Tier-blind (activation is a free action).
// ED-flag suppressed at schedule AND delivery (handler), quiet-hours shifted,
// budget-gated. The anchored fire dates keep re-lays single-shot: a slot whose
// date has passed is never laid again (the missed-check-in pattern), so no
// per-stage flag is needed. Wiped by cancelAllNotifications on restore, so
// restoreNotifications re-lays it (which also lays the 0-session cold-start for
// a user who never returns to complete a workout); the workout-completion hook
// lays the next stage the instant a session lands.
const NOTIF_ID_ACTIVATION_NUDGE = 'volyume_activation_nudge';

export async function cancelActivationNudge() {
  try { await Notifications.cancelScheduledNotificationAsync(NOTIF_ID_ACTIVATION_NUDGE); } catch {}
}

export async function scheduleActivationNudge(userId) {
  if (Platform.OS === 'web') return;
  try {
    // eslint-disable-next-line global-require
    const useAppStore = require('../../store/useAppStore').default;
    const uid = userId ?? useAppStore.getState()?.user?.id ?? null;
    if (!uid) { await cancelActivationNudge(); return; }

    // Category toggle (default on).
    let prefs = {};
    try {
      const raw = await AsyncStorage.getItem(NOTIF_PREFS_KEY);
      if (raw) prefs = JSON.parse(raw) ?? {};
    } catch (_) { /* defaults below */ }
    if (prefs.activationNudgeEnabled === false) { await cancelActivationNudge(); return; }

    // Account-creation date (install proxy) from the live session. Without it we
    // cannot place the window, so we stand down rather than guess.
    let accountCreatedAtMs = null;
    try {
      // eslint-disable-next-line global-require
      const { getSupabaseClient } = require('../supabase');
      const { data } = await getSupabaseClient().auth.getSession();
      const iso = data?.session?.user?.created_at ?? null;
      if (iso) accountCreatedAtMs = new Date(iso).getTime();
    } catch (_) { accountCreatedAtMs = null; }
    if (!Number.isFinite(accountCreatedAtMs)) { await cancelActivationNudge(); return; }

    // Cheap early-out: past the window + grace the lever is done for this user
    // (this also skips the workout read for every established user). The window
    // hard-stop is the shared NUDGE_WINDOW_GRACE_MS, never a duplicated literal.
    if (Date.now() - accountCreatedAtMs > NUDGE_WINDOW_GRACE_MS) { await cancelActivationNudge(); return; }

    // Open ED/wellbeing flag → never lay (and retire anything laid). Silence is
    // the respectful behaviour; the suppression is consumed here, never altered.
    // eslint-disable-next-line global-require
    const db = require('../database');
    // ED-safety, fail CLOSED: a transient flag read maps to the truthy
    // 'read_failed' sentinel so the gate suppresses (retires) the nudge.
    const edFlag = await db.getOpenEdPatternFlag(uid).catch(() => 'read_failed');
    if (edFlag) { await cancelActivationNudge(); return; }

    // Completed-session start times only (never weight or calorie figures).
    // Fail safe: a workout-read failure must NOT let the nudge compute cold_start
    // from an empty list and mis-fire "start your first session" at an activated
    // user. Stand down (leave whatever is laid; the next relaunch/finish re-runs).
    let workouts;
    try {
      workouts = await db.getAllWorkouts(uid);
    } catch (_) {
      await cancelActivationNudge();
      return;
    }
    const completedStartedAtMs = workouts.filter((w) => w.isCompleted).map((w) => w.startedAt ?? 0);

    const nudge = resolveActivationNudge({ accountCreatedAtMs, completedStartedAtMs, nowMs: Date.now() });
    if (!nudge) { await cancelActivationNudge(); return; }

    await cancelActivationNudge();
    const fire = new Date(nudge.fireAtMs);
    // A fire time already in the past is never chased: an anchored slot that has
    // passed is not re-laid (single-shot per stage), matching missed check-in.
    if (fire.getTime() <= Date.now()) return;

    const quiet = await getQuietHours();
    const { date: shifted } = shiftDateOutOfQuietHours(fire, quiet);
    const slot = await requestEventPushSlot({ category: CATEGORY.ACTIVATION_NUDGE, fireDate: shifted });
    if (!slot.allowed) return;
    const copy = activationNudgePush(nudge.stage, greetName());
    await scheduleCheckedNotification({
      identifier: NOTIF_ID_ACTIVATION_NUDGE,
      content: {
        title: copy.title,
        body: copy.body,
        data: { type: 'activation_nudge', stage: nudge.stage },
        sound: false,
      },
      trigger: {
        channelId: COACHING_REMINDERS_CHANNEL,
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: shifted,
      },
    });
  } catch (e) {
    trackNotificationFailed({
      category: CATEGORY.ACTIVATION_NUDGE,
      reason: 'schedule_threw',
      payload: { message: e?.message ?? 'unknown' },
    });
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      logWarn('notifications.scheduleActivationNudge', e?.message);
    }
  }
}

// ─── D142: the return nudge (founder decision C, 2026-09-04) ─────────────────
const NOTIF_ID_RETURN_NUDGE = 'volyume_return_nudge';
const RETURN_NUDGE_LAID_KEY = '@volyume_return_nudge_laid_at';
export const RETURN_NUDGE_ABSENCE_DAYS = 21;
export const RETURN_NUDGE_HOUR = 10;
// Re-laying on every single foreground would cost reads for no gain; the
// 21-day clock only needs to move once in a while. Six hours keeps the
// fire time within a quarter of a day of "21 days since last open".
const RETURN_NUDGE_RELAY_AFTER_MS = 6 * 60 * 60 * 1000;

/**
 * D142 copy. Calm, no shame: never "you missed", never "behind", never a
 * streak. Pure, exported for the copy tests.
 */
export function returnNudgePush() {
  return {
    title: 'Your plan is still here',
    body: 'Whenever you are ready, your next session is waiting for you. Nothing has been lost.',
  };
}

export async function cancelReturnNudge() {
  try { await Notifications.cancelScheduledNotificationAsync(NOTIF_ID_RETURN_NUDGE); } catch {}
}

/**
 * D142 (founder decision C, 2026-09-04): one calm note after three weeks of
 * genuine absence.
 *
 * MECHANISM. There is no background execution in this app, so nothing can
 * observe an absent user. Instead the note is laid AHEAD, for
 * RETURN_NUDGE_ABSENCE_DAYS from now, and re-laid (cancel, then lay again)
 * every time the app opens. While the user keeps opening the app the fire
 * date keeps moving away and it never fires; it fires exactly once, only
 * after the app has not been opened for the whole window. Nothing chases
 * it afterwards: the next lay happens only when the app runs again.
 *
 * GATES, each honoured here rather than assumed:
 *   - the user's own toggle (returnNudgeEnabled, default on);
 *   - an established user only: at least one completed workout AND an
 *     active plan, so there is something true to say "is still here". A
 *     brand-new user is the activation nudge's domain (S6), whose window
 *     hard-stops on its own;
 *   - never under an open ED/wellbeing flag or calm mode, both failing
 *     CLOSED on an unreadable value;
 *   - quiet hours shift it; the push budget can refuse it; one fixed
 *     identifier so it can never stack.
 *
 * @param {string|null} userId
 * @param {{ force?: boolean }} [opts] force skips the six-hour re-lay throttle
 */
export async function scheduleReturnNudge(userId, { force = false } = {}) {
  if (Platform.OS === 'web') return;
  try {
    // eslint-disable-next-line global-require
    const useAppStore = require('../../store/useAppStore').default;
    const uid = userId ?? useAppStore.getState()?.user?.id ?? null;
    if (!uid) { await cancelReturnNudge(); return; }

    let prefs = {};
    try {
      const raw = await AsyncStorage.getItem(NOTIF_PREFS_KEY);
      if (raw) prefs = JSON.parse(raw) ?? {};
    } catch (_) { /* defaults below */ }
    if (prefs.returnNudgeEnabled === false) { await cancelReturnNudge(); return; }

    if (!force) {
      try {
        const laidRaw = await AsyncStorage.getItem(RETURN_NUDGE_LAID_KEY);
        const laid = laidRaw == null ? null : Number(laidRaw);
        if (Number.isFinite(laid) && Date.now() - laid < RETURN_NUDGE_RELAY_AFTER_MS) return;
      } catch (_) { /* unreadable stamp: lay */ }
    }

    // ED-safety and calm mode, both fail CLOSED: an unreadable value
    // suppresses (and retires anything laid).
    // eslint-disable-next-line global-require
    const db = require('../database');
    const edFlag = await db.getOpenEdPatternFlag(uid).catch(() => 'read_failed');
    if (edFlag) { await cancelReturnNudge(); return; }
    let wellbeing;
    try {
      // eslint-disable-next-line global-require
      const { WELLBEING_KEY } = require('../wellbeing');
      wellbeing = await AsyncStorage.getItem(WELLBEING_KEY);
    } catch (_) { wellbeing = 'read_failed'; }
    if (wellbeing === 'calm' || wellbeing === 'read_failed') { await cancelReturnNudge(); return; }

    // Established user with something to come back to. A read failure
    // stands down (leaves whatever is laid; the next open re-runs).
    let workouts;
    let plan;
    try {
      workouts = await db.getAllWorkouts(uid);
      plan = await db.getActivePlan(uid);
    } catch (_) { return; }
    const hasCompleted = Array.isArray(workouts) && workouts.some((w) => w.isCompleted);
    if (!hasCompleted || !plan) { await cancelReturnNudge(); return; }

    await cancelReturnNudge();
    const now = new Date();
    const fireAt = new Date(
      now.getFullYear(), now.getMonth(), now.getDate() + RETURN_NUDGE_ABSENCE_DAYS,
      RETURN_NUDGE_HOUR, 0, 0, 0,
    );
    const quiet = await getQuietHours();
    const { date: shifted } = shiftDateOutOfQuietHours(fireAt, quiet);
    const slot = await requestEventPushSlot({ category: CATEGORY.RETURN_NUDGE, fireDate: shifted });
    if (!slot.allowed) return;
    const copy = returnNudgePush();
    await scheduleCheckedNotification({
      identifier: NOTIF_ID_RETURN_NUDGE,
      content: {
        title: copy.title,
        body: copy.body,
        data: { type: 'return_nudge' },
        sound: false,
      },
      trigger: {
        channelId: COACHING_REMINDERS_CHANNEL,
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: shifted,
      },
    });
    await AsyncStorage.setItem(RETURN_NUDGE_LAID_KEY, String(Date.now())).catch(() => {});
  } catch (e) {
    trackNotificationFailed({
      category: CATEGORY.RETURN_NUDGE,
      reason: 'schedule_threw',
      payload: { message: e?.message ?? 'unknown' },
    });
  }
}

// ─── F3: planned-meal confirm reminder ───────────────────────────────────────
const NOTIF_ID_PLANNED_MEAL_CONFIRM = 'volyume_planned_meal_confirm';

export async function cancelPlannedMealConfirm() {
  try { await Notifications.cancelScheduledNotificationAsync(NOTIF_ID_PLANNED_MEAL_CONFIRM); } catch {}
}

/**
 * F3: lay a gentle 20:00 nudge to confirm today's planned meals, but only when
 * the day actually has planned meals the user has not marked eaten. Pro-only,
 * toggle-gated (plannedMealConfirmEnabled, default on), suppressed under an open
 * ED/wellbeing flag, and quiet-hours-shifted + budgeted like every event push.
 * Self-suppresses (cancels) when there is nothing to confirm.
 * Spec: docs/f3-planned-meal-reminder-notification-spec-2026-06-16.md.
 */
export async function schedulePlannedMealConfirm(userId) {
  if (Platform.OS === 'web') return;
  try {
    // eslint-disable-next-line global-require
    const useAppStore = require('../../store/useAppStore').default;
    if (useAppStore.getState()?.tier !== 'pro') { await cancelPlannedMealConfirm(); return; }

    let prefs = {};
    try {
      const raw = await AsyncStorage.getItem(NOTIF_PREFS_KEY);
      if (raw) prefs = JSON.parse(raw) ?? {};
    } catch (_) { /* defaults below */ }
    if (prefs.plannedMealConfirmEnabled === false) { await cancelPlannedMealConfirm(); return; }

    const uid = userId ?? useAppStore.getState()?.user?.id ?? null;
    if (!uid) { await cancelPlannedMealConfirm(); return; }

    // Open ED/wellbeing flag → never lay (a food push at a flagged user is the
    // harm pattern, exactly as CHECKIN_MISSED / ED_PATTERN_LOCKOUT).
    // eslint-disable-next-line global-require
    const db = require('../database');
    // ED-safety, fail CLOSED: a transient flag read maps to the truthy
    // 'read_failed' sentinel so the gate suppresses the food push at a
    // possibly-flagged user, never lays it.
    const edFlag = await db.getOpenEdPatternFlag(uid).catch(() => 'read_failed');
    if (edFlag) { await cancelPlannedMealConfirm(); return; }

    // Self-suppress: only nudge when TODAY has unconfirmed planned meals.
    // eslint-disable-next-line global-require
    const { getFoodEntriesForDay } = require('../food/db');
    // eslint-disable-next-line global-require
    const { todayLocalKey } = require('../dayKey');
    const entries = await getFoodEntriesForDay(uid, todayLocalKey()).catch(() => []);
    const hasUnconfirmed = Array.isArray(entries) && entries.some((e) => e.is_planned);
    if (!hasUnconfirmed) { await cancelPlannedMealConfirm(); return; }

    await cancelPlannedMealConfirm();
    const when = plannedConfirmSlot(new Date());
    if (!when || when.getTime() <= Date.now()) return; // past 20:00 today: no nudge

    const quiet = await getQuietHours();
    const { date: shifted } = shiftDateOutOfQuietHours(when, quiet);
    const slotOk = await requestEventPushSlot({ category: CATEGORY.PLANNED_MEAL_CONFIRM, fireDate: shifted });
    if (!slotOk.allowed) return;

    const copy = plannedMealConfirmPush(greetName());
    await scheduleCheckedNotification({
      identifier: NOTIF_ID_PLANNED_MEAL_CONFIRM,
      content: {
        title: copy.title,
        body: copy.body,
        data: { type: 'planned_meal_confirm' },
        sound: false,
      },
      trigger: {
        channelId: COACHING_REMINDERS_CHANNEL,
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: shifted,
      },
    });
  } catch (e) {
    trackNotificationFailed({
      category: CATEGORY.PLANNED_MEAL_CONFIRM,
      reason: 'schedule_threw',
      payload: { message: e?.message ?? 'unknown' },
    });
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      logWarn('notifications.schedulePlannedMealConfirm', e?.message);
    }
  }
}

// ─── Weekly coach output ready ───────────────────────────────────────────────────
// NOTIFICATIONS_LOCKED.md "Timing": Monday 09:00 local, time-only
// configurable. Coach output is computed client-side after the weekly
// check-in, so this is a LOCAL recurring weekly reminder, not a server
// push. The default weekday is Monday (weekday 2 in expo's 1=Sunday
// convention); hour/minute are user-adjustable.

const NOTIF_ID_COACH_READY = 'volyume_weekly_coach_ready';

const COACH_READY_COPY = {
  title: 'Your coaching for the week is ready',
  body: 'Have a look at what\'s changed for you this week, and the thinking behind it.',
};

/**
 * Schedule a ONE-OFF "weekly coach output ready" reminder for the next Monday.
 *
 * @param {number} hour    0-23, default 9 (09:00 local)
 * @param {number} minute  0-59, default 0
 * @param {object} [opts]
 * @param {number} [opts.weekStart] epoch ms of the week this push is about
 *   (PM-01(b), D96). The push is laid when a check-in is submitted, so it is
 *   about THAT week's review; carrying the week in `data` means the tap opens
 *   the reviewed week instead of the current one, which on a Monday morning
 *   is a week that has barely started. Omitted (legacy callers) the route
 *   falls back to its old no-params behaviour.
 *
 * This is laid only when the user submits a check-in
 * (WeeklyCheckInScreen.handleSubmit), so the "your plan is ready" notification
 * fires only in a week the user actually checked in, i.e. only when a real
 * review exists. A week with no check-in gets no notification. Previously this
 * was a RECURRING weekly notification that fired every Monday regardless, and
 * tapping it (with no review for the week) dropped the user on the
 * "building baseline" screen. One-off + re-laid each check-in fixes that.
 * Re-running cancels and re-lays, so it stays idempotent.
 */
export async function scheduleWeeklyCoachReady(hour = 9, minute = 0, { weekStart = null } = {}) {
  if (Platform.OS === 'web') return;
  try {
    await Notifications.cancelScheduledNotificationAsync(NOTIF_ID_COACH_READY).catch(() => {});
    const quiet = await getQuietHours();
    const { hour: h, minute: m } = shiftHourMinuteOutOfQuietHours(hour, minute, quiet);
    // Next Monday at h:m (getNextWeekdayDate uses JS getDay, Monday = 1).
    const fireAt = getNextWeekdayDate(1, h, m, new Date());
    // Same skip-rather-than-trap rule as scheduleCheckinReminder above.
    if (!fireAt) {
      trackNotificationFailed({
        category: CATEGORY.WEEKLY_COACH_READY,
        reason: 'invalid_trigger_date',
        payload: { raw: 'unusable-hour-minute', scope: 'scheduleWeeklyCoachReady' },
      });
      return;
    }
    // Push budget (NOTIFICATIONS_LOCKED addendum): rank 2, evicts a
    // lower-priority push on a full Monday rather than being dropped.
    const slot = await requestEventPushSlot({ category: CATEGORY.WEEKLY_COACH_READY, fireDate: fireAt });
    if (!slot.allowed) return;
    await scheduleCheckedNotification({
      identifier: NOTIF_ID_COACH_READY,
      content: {
        title: COACH_READY_COPY.title,
        body: COACH_READY_COPY.body,
        data: weekStart != null && Number.isFinite(Number(weekStart))
          ? { type: 'weekly_coach_ready', weekStart: Number(weekStart) }
          : { type: 'weekly_coach_ready' },
        sound: false,
      },
      trigger: {
        channelId: COACHING_REMINDERS_CHANNEL,
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fireAt,
      },
    });
  } catch (e) {
    trackNotificationFailed({
      category: CATEGORY.WEEKLY_COACH_READY,
      reason: 'schedule_threw',
      payload: { message: e?.message ?? 'unknown' },
    });
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      logWarn('notifications.scheduleWeeklyCoachReady', e?.message);
    }
  }
}

export async function cancelWeeklyCoachReady() {
  try { await Notifications.cancelScheduledNotificationAsync(NOTIF_ID_COACH_READY); } catch {}
}

// ─── Block complete, ready to review (C16 phase C) ───────────────────────────

const NOTIF_ID_BLOCK_READY = 'volyume_block_ready';

/**
 * C16 phase C: one push when a block finishes and its next-block proposal
 * is ready to review.
 *
 * The founder's constraints, each honoured here rather than assumed:
 *
 *   EXISTING CATEGORY. WEEKLY_COACH_READY is the coaching/review category
 *   and this is a coaching review. A new category would need a new opt-out
 *   the user has never seen, and Campaign 14 made every category's
 *   ownership explicit precisely so new pushes stop inventing one.
 *
 *   AT MOST ONE. A fixed identifier, cancelled and re-laid, so a block that
 *   is evaluated more than once cannot stack pushes.
 *
 *   OPT-OUT, QUIET HOURS, PERMISSION, BUDGET. All inherited by going
 *   through the same path the weekly coach push uses:
 *   isCategoryEnabled gates it, quiet hours shift it, and the push budget
 *   can refuse it.
 *
 *   NEVER "YOUR PROGRAMME HAS CHANGED". The body comes from
 *   blockReview.blockReadyNotificationBody, which only mentions changes
 *   when a proposal actually has some, and never says anything has already
 *   happened.
 *
 * @param {object|null} proposal blockReview.proposeNextBlock output, or null
 * @param {Date|number} when     when to fire; defaults to now + 1 minute
 */
export async function scheduleBlockReadyToReview(proposal = null, when = null) {
  if (Platform.OS === 'web') return;
  try {
    await Notifications.cancelScheduledNotificationAsync(NOTIF_ID_BLOCK_READY).catch(() => {});
    // Campaign 14: the user's own opt-out for this category decides.
    // eslint-disable-next-line global-require
    const { isCategoryEnabled } = require('./categoryPrefs');
    const enabled = await isCategoryEnabled(CATEGORY.WEEKLY_COACH_READY);
    if (!enabled) return;

    // eslint-disable-next-line global-require
    const { blockReadyNotificationBody } = require('../blockReview');
    const base = when instanceof Date ? when : new Date(Number(when) || (Date.now() + 60000));
    const quiet = await getQuietHours();
    const { hour, minute } = shiftHourMinuteOutOfQuietHours(
      base.getHours(), base.getMinutes(), quiet,
    );
    const fireAt = new Date(base);
    fireAt.setHours(hour, minute, 0, 0);
    if (fireAt.getTime() <= Date.now()) fireAt.setTime(Date.now() + 60000);

    const slot = await requestEventPushSlot({
      category: CATEGORY.WEEKLY_COACH_READY, fireDate: fireAt,
    });
    if (!slot.allowed) return;

    await scheduleCheckedNotification({
      identifier: NOTIF_ID_BLOCK_READY,
      content: {
        title: 'Your next block is ready',
        body: blockReadyNotificationBody(proposal),
        data: { type: 'block_ready_to_review' },
        sound: false,
      },
      trigger: {
        channelId: COACHING_REMINDERS_CHANNEL,
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fireAt,
      },
    });
  } catch (e) {
    trackNotificationFailed({
      category: CATEGORY.WEEKLY_COACH_READY,
      reason: 'schedule_threw',
      payload: { message: e?.message ?? 'unknown' },
    });
  }
}

export async function cancelBlockReadyToReview() {
  try { await Notifications.cancelScheduledNotificationAsync(NOTIF_ID_BLOCK_READY); } catch {}
}

/**
 * D141 item 5 (2026-09-04): scheduleBlockReadyToReview above was fully built
 * (budget, quiet hours, opt-out, route) and had no caller, so the one
 * five-to-six-week decision moment in the product depended entirely on the
 * user opening the app to notice the block had finished.
 *
 * Laid AHEAD, at activation, for the local day the block finishes at 09:00
 * (quiet hours shift it), so it reaches a user who is not opening the app -
 * the only kind of user the push exists for. Re-laid by restoreNotifications
 * (which wipes every scheduled push first) so a quiet-hours edit or a DST
 * reschedule cannot lose it. One fixed identifier, so re-laying never stacks.
 *
 * Never laid for a block that is already over: the user is in the app when
 * this runs, the decision card is on the Plans tab, and a push a minute
 * later about the screen they are looking at would be noise. Never laid
 * without an active block. No proposal is attached (none exists yet at
 * activation), so the body is the plain "ready to review" line, which is
 * the only honest one ahead of time.
 */
export async function scheduleBlockReadyForActiveBlock(userId) {
  if (Platform.OS === 'web') return;
  if (!userId) return;
  try {
    // eslint-disable-next-line global-require
    const { getActiveBlock } = require('../database');
    const block = await getActiveBlock(userId);
    if (!block) { await cancelBlockReadyToReview(); return; }
    const plannedWeeks = Number(block.plannedWeeks ?? block.durationWeeks);
    if (!Number.isFinite(plannedWeeks) || plannedWeeks <= 0) return;
    // eslint-disable-next-line global-require
    const { getBlockStatus } = require('../mesocycle');
    const status = getBlockStatus(block.startDate ?? block.createdAt ?? Date.now(), plannedWeeks);
    if (status.status === 'completed_awaiting_decision') { await cancelBlockReadyToReview(); return; }
    // Local calendar arithmetic, the same day-counting getBlockStatus uses:
    // the block is over once plannedWeeks * 7 local days have elapsed from
    // the start day, so that is the morning the push belongs to.
    const startRaw = block.startDate ?? block.createdAt ?? Date.now();
    const startDate = typeof startRaw === 'string' && /^\d{4}-\d{2}-\d{2}/.test(startRaw)
      ? new Date(Number(startRaw.slice(0, 4)), Number(startRaw.slice(5, 7)) - 1, Number(startRaw.slice(8, 10)))
      : new Date(startRaw);
    if (!Number.isFinite(startDate.getTime())) return;
    const fireAt = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + plannedWeeks * 7, 9, 0, 0, 0);
    await scheduleBlockReadyToReview(null, fireAt);
  } catch (e) {
    trackNotificationFailed({
      category: CATEGORY.WEEKLY_COACH_READY,
      reason: 'block_ready_relay_threw',
      payload: { message: e?.message ?? 'unknown' },
    });
  }
}

// ─── Cancel helpers ───────────────────────────────────────────────────────────

export async function cancelMorningNotification() {
  // Legacy single id (pre-NOTIF-4), the 7 per-weekday ids from the old
  // weekly scheme, and the C8 Work 5 bounded horizon's one-shot ids.
  // The range covers both schemes so an upgrading device is cleaned.
  try { await Notifications.cancelScheduledNotificationAsync(NOTIF_ID_MORNING); } catch {}
  for (let w = 1; w <= WEIGH_IN_HORIZON_DAYS; w += 1) {
    // eslint-disable-next-line no-await-in-loop
    try { await Notifications.cancelScheduledNotificationAsync(`${NOTIF_ID_MORNING}_${w}`); } catch {}
  }
  // Q1: the evening backstop rides the same morningEnabled toggle, so turning
  // the morning nudge off clears it too.
  await cancelEveningWeightReminder();
}

export async function cancelCheckinNotification() {
  try { await Notifications.cancelScheduledNotificationAsync(NOTIF_ID_CHECKIN); } catch {}
}

export async function cancelAllNotifications() {
  try { await Notifications.cancelAllScheduledNotificationsAsync(); } catch {}
}

// ─── Restore on app launch ────────────────────────────────────────────────────

/**
 * Re-applies saved notification preferences on app launch.
 * Call from RootNavigator after the user session is restored.
 *
 * @param {object} prefs - { morningEnabled, morningHour, morningMinute,
 *                           checkinEnabled, checkinDay, checkinHour, checkinMinute }
 * @param {string|null} userId
 */
// NOTIF-1: the morning/check-in/coach triggers bake the quiet-hours-shifted
// hour in at schedule time, computed against the device's timezone THEN. After
// the user changes timezone (travel), that baked-in hour is wrong until the
// next cold start re-lays it. Call this on foreground: if the timezone offset
// changed since we last scheduled, re-lay the notifications so quiet-hours is
// recomputed for the new zone. Gated on the offset so a normal foreground does
// no work.
const TZ_OFFSET_KEY = '@volyume_notif_tz_offset';
const WEIGH_IN_LAID_KEY = '@volyume_weighin_laid_at';

/**
 * C8 Work 5, review D6: keep the bounded weigh-in horizon topped up for a
 * user who IS active.
 *
 * The horizon only covers 14 days, and the re-lay paths are all cold
 * start, the settings screen, and an ED-flag clear. An app that stays
 * resident (a phone with plenty of memory, foregrounded daily, never
 * restarted) would therefore run out mid-use and stop prompting a user
 * who never stopped turning up - the opposite of the intent, which was
 * to stop chasing people who left.
 *
 * So: on foreground, if the prompts were last laid more than a week ago,
 * lay them again. Well inside the 14-day horizon, once a week at most,
 * and it re-lays nothing on its own - it goes through restoreNotifications,
 * which keeps every tier gate, permission gate and ED gate exactly as
 * they are. A user who has stopped opening the app never reaches it.
 */
const WEIGH_IN_REFRESH_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

export async function refreshWeighInHorizonIfStale(userId = null) {
  if (Platform.OS === 'web') return;
  try {
    const raw = await AsyncStorage.getItem(WEIGH_IN_LAID_KEY);
    const last = raw == null ? null : Number(raw);
    const now = Date.now();
    if (Number.isFinite(last) && now - last < WEIGH_IN_REFRESH_AFTER_MS) return;
    const prefsRaw = await AsyncStorage.getItem('@volyume_notification_prefs');
    if (!prefsRaw) return;
    await restoreNotifications(JSON.parse(prefsRaw), userId);
  } catch (_) { /* tolerate: the cold-start re-lay still covers this */ }
}

export async function rescheduleForTimezoneIfChanged(userId = null) {
  if (Platform.OS === 'web') return;
  try {
    const current = new Date().getTimezoneOffset();
    const storedRaw = await AsyncStorage.getItem(TZ_OFFSET_KEY);
    const stored = storedRaw == null ? null : Number(storedRaw);
    if (stored === current) return; // no change, nothing to do
    await AsyncStorage.setItem(TZ_OFFSET_KEY, String(current));
    if (stored === null) return; // first run: just record the baseline
    const raw = await AsyncStorage.getItem('@volyume_notification_prefs');
    if (raw) await restoreNotifications(JSON.parse(raw), userId);
  } catch (_) { /* tolerate */ }
}

export async function restoreNotifications(prefs, userId = null) {
  if (!prefs) return;
  // eslint-disable-next-line global-require
  const { getNotificationPermissionStatus } = require('./permissions');
  const status = await getNotificationPermissionStatus();
  if (status !== 'granted') return;

  await cancelAllNotifications();

  // E10-F4: the weigh-in prompts and the check-in reminder are Pro coaching
  // surfaces (their tap targets are Pro-gated, and a lapsed free user has no
  // free surface to act on them or any UI to turn them off). Re-lay them for
  // Pro only, matching the tier gates the missed-check-in and planned-meal
  // schedulers already carry. A daily audible weigh-in prompt aimed at
  // someone who cannot act on it is exactly the pressure pattern the ED
  // rules exist to avoid.
  let isPro = false;
  try {
    // eslint-disable-next-line global-require
    isPro = require('../../store/useAppStore').default.getState()?.tier === 'pro';
  } catch (_) { /* store unavailable: fail closed (no coaching re-lays) */ }

  if (isPro && prefs.morningEnabled) {
    await scheduleMorningWeightNotification(prefs.morningHour ?? 7, prefs.morningMinute ?? 0);
    // Q1: the evening backstop rides the same toggle. Fixed 19:30 default; the
    // helper self-gates under an open ED flag.
    await scheduleEveningWeightReminder(prefs.eveningHour ?? 19, prefs.eveningMinute ?? 30);
  } else {
    await cancelEveningWeightReminder();
  }
  if (isPro && prefs.checkinEnabled) {
    await scheduleNextCheckinReminder(
      userId,
      prefs.checkinDay ?? 0,
      prefs.checkinHour ?? 12,
      prefs.checkinMinute ?? 0,
    );
  }

  // RB-2 (D96, Review B): the Monday "coaching ready" push was the ONE
  // family this restore did not re-lay, so a quiet-hours edit or a DST
  // reschedule (both call this) silently destroyed it along with its
  // PM-01(b) weekStart param, which only the NEXT check-in could rebuild.
  // The check-in submit stamps coachReady.weekStart into the prefs blob;
  // re-lay only a push a check-in actually laid, and only while its own
  // Monday (the one after the reviewed week) is still ahead - later, the
  // schedule call would aim the push at the wrong week. Pro-only, like the
  // check-in reminder above; not weight- or food-adjacent.
  if (isPro && prefs?.coachReady?.enabled !== false) {
    const ws = Number(prefs?.coachReady?.weekStart);
    const crHour = prefs?.coachReady?.hour ?? 9;
    const crMinute = prefs?.coachReady?.minute ?? 0;
    if (Number.isFinite(ws)
      && Date.now() < ws + 7 * 86400000 + crHour * 3600000 + crMinute * 60000) {
      await scheduleWeeklyCoachReady(crHour, crMinute, { weekStart: ws });
    }
  }

  // TRIAL RE-LAY REMOVED (founder decision 2026-09-03, fully-free product).
  // This block used to re-lay the cascade-gate pushes (ids _19/_21) and the
  // COMP-023 day-3 push after cancelAllNotifications wiped them, reading the
  // trial stage off userProfile. Volyume has no trial, so there is nothing to
  // re-lay and reading the stage here would only reanimate a trial an existing
  // user is no longer on. cancelAllNotifications above already drains any
  // survivor from the OS queue, and both schedulers self-cancel while
  // FULL_ACCESS_FOR_ALL is on. The win-back re-lay went with it: there is no
  // churn episode to serve while the product is free.

  // OPP-C03: the missed check-in follow-ups were wiped by
  // cancelAllNotifications too (the same historic wipe pattern that lost the
  // cascade gates). Re-lay; the helper self-guards (Pro-only, toggle, ED flag,
  // past slots skipped).
  try {
    // eslint-disable-next-line global-require
    const store = require('../../store/useAppStore').default;
    await scheduleMissedCheckinFollowups(userId ?? store.getState().user?.id ?? null);
  } catch (_) { /* follow-up re-lay is best-effort */ }

  // F3: re-lay the planned-meal confirm nudge (self-guards: Pro-only, toggle,
  // ED flag, only when today has unconfirmed planned meals, past slot skipped).
  try {
    // eslint-disable-next-line global-require
    const store = require('../../store/useAppStore').default;
    await schedulePlannedMealConfirm(userId ?? store.getState().user?.id ?? null);
  } catch (_) { /* planned-meal nudge re-lay is best-effort */ }

  // S6: re-lay the early-activation nudge (self-guards: toggle, window elapsed,
  // ED flag, activated, past slot skipped). This is also the path that lays the
  // 0-session cold-start for a user who signs up and never returns.
  try {
    // eslint-disable-next-line global-require
    const store = require('../../store/useAppStore').default;
    await scheduleActivationNudge(userId ?? store.getState().user?.id ?? null);
  } catch (_) { /* activation-nudge re-lay is best-effort */ }

  // Campaign 1 P0-5: re-lay the user's opt-in meal reminders. The
  // cancelAllNotifications above wiped them on EVERY launch and nothing
  // restored them - the same historic wipe pattern that lost the cascade
  // and win-back notifications. scheduleMealReminders self-guards
  // (disabled entries skipped, quiet hours applied) and cancels its own
  // identifiers first, so the re-lay is idempotent; a disabled or absent
  // preference restores nothing.
  try {
    const rawMeals = await AsyncStorage.getItem(MEAL_REMINDERS_KEY);
    const reminders = rawMeals ? JSON.parse(rawMeals) : null;
    if (Array.isArray(reminders) && reminders.some((r) => r?.enabled === true)) {
      await scheduleMealReminders(reminders);
    }
  } catch (_) { /* meal-reminder re-lay is best-effort */ }

  // FM-03 (D96): training reminders were wiped by the cancelAllNotifications
  // above on EVERY launch and never re-laid -- the same historic wipe pattern
  // that lost the cascade, win-back and meal reminders. They came back only
  // after the user's NEXT completed workout, i.e. after the session the
  // missing reminder was meant to prompt. scheduleTrainingReminders
  // self-guards (preference off, permission absent or no habit-derived
  // schedule all no-op and cancel), so this re-lay is idempotent and can
  // never invent a schedule. Tier-blind, like the reminder itself.
  try {
    // eslint-disable-next-line global-require
    const { scheduleTrainingReminders } = require('./trainingReminders');
    await scheduleTrainingReminders();
  } catch (_) { /* training-reminder re-lay is best-effort */ }

  // D141 item 5: the block-finished push is laid ahead at activation and
  // wiped by cancelAllNotifications above like everything else; re-lay it
  // from the active block (self-guards: no block, block already over).
  try {
    // eslint-disable-next-line global-require
    const store = require('../../store/useAppStore').default;
    await scheduleBlockReadyForActiveBlock(userId ?? store.getState().user?.id ?? null);
  } catch (_) { /* block-ready re-lay is best-effort */ }

  // D142: the return nudge is laid ahead and re-laid on every open; this
  // is the launch re-lay (forced: the cancel-all above just wiped it).
  try {
    // eslint-disable-next-line global-require
    const store = require('../../store/useAppStore').default;
    await scheduleReturnNudge(userId ?? store.getState().user?.id ?? null, { force: true });
  } catch (_) { /* return-nudge re-lay is best-effort */ }
}

// ─── Year of Lifts unlock ─────────────────────────────────────────────────────
// Year of Lifts is gated until the user has 365 days of training (see
// AnalyticsScreen). The first time the gate opens, we fire a one-shot
// local notification. Idempotent via AsyncStorage flag.

const YEAR_OF_LIFTS_NOTIFIED_KEY = '@volyume_year_of_lifts_notified';

export async function checkYearOfLiftsUnlock(earliestWorkoutAt) {
  if (Platform.OS === 'web') return;
  if (!earliestWorkoutAt) return;
  const YEAR_MS = 365 * 86400000;
  if (Date.now() - earliestWorkoutAt < YEAR_MS) return;
  try {
    const already = await AsyncStorage.getItem(YEAR_OF_LIFTS_NOTIFIED_KEY);
    if (already === 'true') return;
    // Push budget (NOTIFICATIONS_LOCKED addendum). Fires immediately, so the
    // slot is today's. Blocked = flag stays unset, so a later open retries.
    const slot = await requestEventPushSlot({ category: CATEGORY.YEAR_OF_LIFTS_UNLOCK, fireDate: new Date() });
    if (!slot.allowed) return;
    await scheduleCheckedNotification({
      identifier: 'volyume_year_of_lifts_unlock',
      content: {
        title: 'A whole year of lifts',
        body: 'What a year. Your wrap-up is ready, swipe through it on the Progress tab.',
        data: { type: 'year_of_lifts_unlock' },
        sound: true,
      },
      trigger: { channelId: COACHING_REMINDERS_CHANNEL },
    });
    await AsyncStorage.setItem(YEAR_OF_LIFTS_NOTIFIED_KEY, 'true');
  } catch (e) {
    trackNotificationFailed({
      category: CATEGORY.YEAR_OF_LIFTS_UNLOCK,
      reason: 'schedule_threw',
      payload: { message: e?.message ?? 'unknown' },
    });
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      logWarn('notifications.yearOfLiftsUnlock', e?.message);
    }
  }
}

const MONTHLY_RECAP_NOTIFIED_PREFIX = '@volyume_recap_notified_';

// COMP-005: one-shot monthly recap nudge. Mirrors checkYearOfLiftsUnlock —
// fires once per calendar month (idempotent per-month AsyncStorage key) on the
// app open that first satisfies the conditions: the user has unlocked recaps
// (>=10 lifetime sessions) AND trained at least once in the month being
// recapped. A zero-session month gets nothing — silence, not shame. The body
// softens under calm mode / an open ED flag (passed in as `neutral`).
export async function checkMonthlyRecapReady({ completedCount = 0, monthSessions = 0, monthKey, monthLabel, neutral = false } = {}) {
  if (Platform.OS === 'web') return;
  if (!monthKey || !monthLabel || completedCount < 10 || monthSessions < 1) return;
  const key = `${MONTHLY_RECAP_NOTIFIED_PREFIX}${monthKey}`;
  try {
    const already = await AsyncStorage.getItem(key);
    if (already === 'true') return;
    // Push budget (NOTIFICATIONS_LOCKED addendum). Fires immediately, so the
    // slot is today's. Blocked = the month flag stays unset, so a later
    // qualifying open retries within the same month.
    const slot = await requestEventPushSlot({ category: CATEGORY.MONTHLY_RECAP, fireDate: new Date() });
    if (!slot.allowed) return;
    await scheduleCheckedNotification({
      identifier: `volyume_monthly_recap_${monthKey}`,
      content: {
        title: `Your ${monthLabel} recap is ready`,
        body: neutral
          ? 'Last month\'s training, summed up. Have a look when you fancy.'
          : '45 seconds of what you put in last month. Have a look when you fancy.',
        data: { type: 'monthly_recap' },
        sound: true,
      },
      trigger: { channelId: COACHING_REMINDERS_CHANNEL },
    });
    await AsyncStorage.setItem(key, 'true');
  } catch (e) {
    trackNotificationFailed({
      category: CATEGORY.MONTHLY_RECAP,
      reason: 'schedule_threw',
      payload: { message: e?.message ?? 'unknown' },
    });
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      logWarn('notifications.monthlyRecap', e?.message);
    }
  }
}
