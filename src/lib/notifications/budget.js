/**
 * notifications/budget.js
 *
 * Push-budget enforcement per the NOTIFICATIONS_LOCKED.md proposed
 * addendum (2026-06-12, founder decision 5 / gap G6): at most
 * EVENT_DAILY_CAP event-class pushes per local day and
 * EVENT_WEEKLY_CAP per local week, with a fixed collision priority.
 * Higher priority wins; the loser is dropped, not queued to a worse
 * day. Equal priority never evicts.
 *
 * Class split (see the addendum):
 *   Event pushes  one-shot lifecycle pushes (cascade gates, coach
 *                 ready, missed check-in, trial day 3, win-back,
 *                 year of lifts, monthly recap, partner cheer).
 *                 Fully budgeted here.
 *   Habit pushes  user-scheduled recurring reminders (morning
 *                 weight, training day, weekly check-in). Outside
 *                 the event cap: each is capped by its own schedule
 *                 and self-suppresses at delivery once the action
 *                 is done (handler.js).
 *   Transactional server pushes (payment failure, expiring). Cannot
 *                 be locally budgeted; exempt.
 *
 * The decision core (decideBudget + occupancy helpers) is pure so it
 * unit-tests without the OS. requestEventPushSlot is the thin async
 * orchestrator the schedulers call: it reads the pending schedule
 * from expo-notifications, applies the pure decision, cancels any
 * evicted push, and fails OPEN (allows) if the schedule can't be
 * read, because the budget must never be the reason a push silently
 * breaks.
 */

import { CATEGORY, categoryForDataType } from './categories';

export const EVENT_DAILY_CAP = 2;
export const EVENT_WEEKLY_CAP = 8;

/**
 * Collision priority, highest first. Mirrors the addendum table.
 * Anything not listed here is not an event category and is exempt
 * from the budget.
 */
export const EVENT_PRIORITY = Object.freeze([
  CATEGORY.CASCADE_GATE,
  CATEGORY.WEEKLY_COACH_READY,
  // S6 (founder call 2026-07-03, retention-first): a brand-new user one session
  // short of activating is the highest-leverage save, so on a collision the
  // activation nudge outranks an already-engaged user's missed-check-in push.
  CATEGORY.ACTIVATION_NUDGE,
  CATEGORY.CHECKIN_MISSED,
  // D142: an established user's return note. Below the missed check-in
  // (an engaged user's live loop) and above the lifecycle/recap pushes; in
  // practice it fires only when nothing else has for three weeks.
  CATEGORY.RETURN_NUDGE,
  CATEGORY.TRIAL_DAY3,
  CATEGORY.WINBACK,
  CATEGORY.YEAR_OF_LIFTS_UNLOCK,
  CATEGORY.MONTHLY_RECAP,
  CATEGORY.PLANNED_MEAL_CONFIRM, // F3: gentle, low-priority nudge
  CATEGORY.PARTNER_CHEER,
  // SD-15: Community's two categories sit at the bottom of the priority
  // list, same rank tier as partner cheer.
  CATEGORY.COMMUNITY_FOLLOW,
  CATEGORY.COMMUNITY_ACTIVITY,
]);

export function isEventCategory(category) {
  return EVENT_PRIORITY.includes(category);
}

/** Lower rank = higher priority. Non-event categories rank Infinity. */
export function eventPriorityRank(category) {
  const i = EVENT_PRIORITY.indexOf(category);
  return i === -1 ? Infinity : i;
}

// ─── Occupancy (pure, defensive against trigger shape drift) ─────────────────

function asMs(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function triggerFireMs(trigger) {
  if (!trigger) return null;
  return asMs(trigger.date) ?? asMs(trigger.value) ?? null;
}

function sameLocalDay(ms, date) {
  const a = new Date(ms);
  return a.getFullYear() === date.getFullYear()
    && a.getMonth() === date.getMonth()
    && a.getDate() === date.getDate();
}

/** Local Monday 00:00 for the week containing `date` (app week rule). */
function localMondayStartMs(date) {
  const d = new Date(date);
  const daysFromMon = d.getDay() === 0 ? 6 : d.getDay() - 1;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - daysFromMon).getTime();
}

/**
 * Does this pending notification fire on the given local day?
 * DATE one-shots compare the local day; WEEKLY repeats match the
 * weekday (expo weekday = JS getDay + 1); a bare hour/minute repeat
 * fires daily. Unknown shapes count as not firing (defensive: the
 * budget should not block on a shape it can't read).
 */
function firesOnDay(trigger, date) {
  const ms = triggerFireMs(trigger);
  if (ms != null) return sameLocalDay(ms, date);
  if (!trigger || typeof trigger !== 'object') return false;
  if (Number.isFinite(trigger.weekday)) return trigger.weekday === date.getDay() + 1;
  if (Number.isFinite(trigger.hour)) return true; // daily repeat
  return false;
}

function firesInWeek(trigger, date) {
  const weekStart = localMondayStartMs(date);
  const weekEnd = weekStart + 7 * 86400000;
  const ms = triggerFireMs(trigger);
  if (ms != null) return ms >= weekStart && ms < weekEnd;
  if (!trigger || typeof trigger !== 'object') return false;
  // Weekly and daily repeats fire at least once in any week.
  if (Number.isFinite(trigger.weekday) || Number.isFinite(trigger.hour)) return true;
  return false;
}

function toOccupant(request) {
  const type = request?.content?.data?.type ?? null;
  const category = type ? categoryForDataType(type) : null;
  if (!category || !isEventCategory(category)) return null;
  return { identifier: request?.identifier ?? null, category };
}

/**
 * Event-class occupants of the local day containing `date`, from the
 * raw expo-notifications pending list.
 * @returns {Array<{identifier: string|null, category: string}>}
 */
export function eventOccupantsOnDay(scheduled, date) {
  const out = [];
  for (const request of scheduled ?? []) {
    const occ = toOccupant(request);
    if (occ && firesOnDay(request?.trigger, date)) out.push(occ);
  }
  return out;
}

/** Event-class occupants of the local Monday-anchored week of `date`. */
export function eventOccupantsInWeek(scheduled, date) {
  const out = [];
  for (const request of scheduled ?? []) {
    const occ = toOccupant(request);
    if (occ && firesInWeek(request?.trigger, date)) out.push(occ);
  }
  return out;
}

// ─── The pure decision ────────────────────────────────────────────────────────

function lowestPriorityOccupant(occupants) {
  let lowest = null;
  for (const occ of occupants) {
    if (!lowest || eventPriorityRank(occ.category) > eventPriorityRank(lowest.category)) {
      lowest = occ;
    }
  }
  return lowest;
}

/**
 * May `category` take a slot, given the event pushes already laid for
 * the same day and week? Pure. Callers cancel their own identifier
 * BEFORE asking, so occupants never include the push being re-laid.
 *
 * @returns {{ allowed: boolean, evict: Array<{identifier, category}>, reason: string }}
 *   reason: 'exempt' | 'ok' | 'evicted' | 'duplicate_topic'
 *           | 'day_capped' | 'week_capped'
 *   evict:  pushes the caller must cancel before scheduling (the
 *           collision losers; dropped, never re-queued).
 */
export function decideBudget({
  category,
  dayOccupants = [],
  weekOccupants = [],
  dailyCap = EVENT_DAILY_CAP,
  weeklyCap = EVENT_WEEKLY_CAP,
} = {}) {
  if (!isEventCategory(category)) return { allowed: true, evict: [], reason: 'exempt' };

  // One notification per topic per day (locked principle).
  if (dayOccupants.some((o) => o.category === category)) {
    return { allowed: false, evict: [], reason: 'duplicate_topic' };
  }

  const evict = [];
  let day = dayOccupants.slice();
  let week = weekOccupants.slice();

  if (day.length >= dailyCap) {
    const loser = lowestPriorityOccupant(day);
    // Strictly-higher priority required: equal priority never evicts.
    if (!loser || eventPriorityRank(category) >= eventPriorityRank(loser.category)) {
      return { allowed: false, evict: [], reason: 'day_capped' };
    }
    evict.push(loser);
    day = day.filter((o) => o !== loser);
    week = week.filter((o) => o !== loser && o.identifier !== loser.identifier);
  }

  if (week.length >= weeklyCap) {
    const loser = lowestPriorityOccupant(week);
    if (!loser || eventPriorityRank(category) >= eventPriorityRank(loser.category)) {
      return { allowed: false, evict: [], reason: 'week_capped' };
    }
    evict.push(loser);
  }

  return { allowed: true, evict, reason: evict.length ? 'evicted' : 'ok' };
}

// ─── The orchestrator the schedulers call ─────────────────────────────────────

/**
 * Request a budget slot for an event push on the day of `fireDate`.
 * Reads the pending schedule, applies decideBudget, cancels any
 * evicted losers, and records drops/evictions as notification_failed
 * (reason budget_capped / budget_evicted; existing event name, no new
 * telemetry events).
 *
 * Fails OPEN on any read error: the budget must never be the reason a
 * push silently breaks.
 *
 * @returns {Promise<{ allowed: boolean, reason: string }>}
 */
export async function requestEventPushSlot({ category, fireDate } = {}) {
  if (!isEventCategory(category)) return { allowed: true, reason: 'exempt' };
  const date = fireDate instanceof Date ? fireDate : new Date(fireDate ?? Date.now());
  let scheduled;
  try {
    // eslint-disable-next-line global-require
    const Notifications = require('expo-notifications');
    scheduled = await Notifications.getAllScheduledNotificationsAsync();
  } catch (_) {
    return { allowed: true, reason: 'schedule_unreadable' };
  }

  const decision = decideBudget({
    category,
    dayOccupants: eventOccupantsOnDay(scheduled, date),
    weekOccupants: eventOccupantsInWeek(scheduled, date),
  });

  if (!decision.allowed) {
    try {
      // eslint-disable-next-line global-require
      const { trackNotificationFailed } = require('./telemetry');
      trackNotificationFailed({
        category,
        reason: 'budget_capped',
        payload: { budget_reason: decision.reason },
      });
    } catch (_) { /* telemetry must never break scheduling */ }
    return { allowed: false, reason: decision.reason };
  }

  for (const loser of decision.evict) {
    if (!loser.identifier) continue;
    try {
      // eslint-disable-next-line global-require
      const Notifications = require('expo-notifications');
      await Notifications.cancelScheduledNotificationAsync(loser.identifier);
    } catch (_) { /* best-effort; an uncancelled loser only overshoots the cap */ }
    try {
      // eslint-disable-next-line global-require
      const { trackNotificationFailed } = require('./telemetry');
      trackNotificationFailed({
        category: loser.category,
        reason: 'budget_evicted',
        payload: { evicted_by: category },
      });
    } catch (_) { /* tolerate */ }
  }

  return { allowed: true, reason: decision.reason };
}
