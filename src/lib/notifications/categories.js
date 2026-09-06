/**
 * notifications/categories.js
 *
 * The category enum from NOTIFICATIONS_LOCKED.md. Every scheduled
 * push, in-app banner, or email belongs to exactly one category.
 *
 * Telemetry events (notification_sent / _tapped / _failed) carry the
 * category in their payload so Panel 6 can break send / open / fail
 * rates down per category.
 *
 * Adding a category here is the right place to register a new
 * notification surface; the schedule helpers in scheduler.js will
 * apply quiet hours + telemetry uniformly once the category is in
 * the map.
 */

export const CATEGORY = Object.freeze({
  // DAILY_CHECKIN_REMINDER removed (Campaign 24 Wave F, LEAD RULING item 3,
  // WAVE-F-FINDINGS.md Documentation-truth finding 2): zero-implementation
  // proof -- grepped the entire src/ tree, the only two references were this
  // declaration and its CATEGORY_CHANNELS entry below; no `schedule*`
  // function in scheduler.js ever created it and no screen offered a
  // control for it. The product's check-in model is weekly, not daily
  // (WEEKLY_CHECKIN_REMINDER, below, is live and correct). Behaviour-neutral
  // removal: nothing fired, so no user is affected.
  WEEKLY_CHECKIN_REMINDER: 'weekly_checkin_reminder',
  CASCADE_GATE: 'cascade_gate',
  SUBSCRIPTION_PAYMENT_FAILURE: 'subscription_payment_failure',
  SUBSCRIPTION_EXPIRING: 'subscription_expiring',
  SYNC_ERROR: 'sync_error',
  ED_PATTERN_LOCKOUT: 'ed_pattern_lockout',
  FFM_FLOOR_HOLD: 'ffm_floor_hold',
  WEEKLY_COACH_READY: 'weekly_coach_ready',
  COACH_TRIAL_ENDING: 'coach_trial_ending',
  // Existing categories that pre-date the locked spec; keep them
  // so historical scheduling code can map onto a category value
  // without lying about its intent.
  MORNING_WEIGHT: 'morning_weight',
  EVENING_WEIGHT: 'evening_weight', // Q1: end-of-day backstop weigh-in nudge
  TRAINING_REMINDER: 'training_reminder',
  YEAR_OF_LIFTS_UNLOCK: 'year_of_lifts_unlock',
  MONTHLY_RECAP: 'monthly_recap', // COMP-005
  TRIAL_DAY3: 'trial_day3', // COMP-023
  WINBACK: 'winback', // COMP-025-A
  PARTNER_CHEER: 'partner_cheer', // NEW-002
  CHECKIN_MISSED: 'checkin_missed', // OPP-C03 ghost prevention
  PLANNED_MEAL_CONFIRM: 'planned_meal_confirm', // F3: confirm planned meals
  REST_TIMER: 'rest_timer', // U1/F3: live lock-screen rest timer with actions
  MEAL_LOG_REMINDER: 'meal_log_reminder', // gap #4: opt-in, convenience-only meal-log nudge
  ACTIVATION_NUDGE: 'activation_nudge', // S6: early-activation re-engagement (0/1/2-session stall)
  // D142 (founder decision C, 2026-09-04): ONE calm note after three weeks
  // without the app being opened, for an established user with a plan. Laid
  // ahead and re-laid on every open, so by construction it fires only after
  // genuine absence. Its own toggle (Settings -> Notifications and reminders).
  RETURN_NUDGE: 'return_nudge',
  // Community (blueprint SD-15, 2026-09-06): the two budgeted Community
  // event categories. COMMUNITY_FOLLOW covers new follower / follow
  // request / request accepted; COMMUNITY_ACTIVITY covers reaction /
  // comment / programme use. Both are server-sendable (community-notify
  // Edge Function), exactly like PARTNER_CHEER above.
  COMMUNITY_FOLLOW: 'community_follow',
  COMMUNITY_ACTIVITY: 'community_activity',
});

/**
 * The expo-notifications notification CATEGORY identifier for the live
 * rest-timer notification. This is the value passed as
 * content.categoryIdentifier when the notification is presented, and the
 * id registered via Notifications.setNotificationCategoryAsync. Keeping it
 * equal to the data.type tag keeps the two in step.
 */
export const REST_TIMER_CATEGORY_ID = 'rest_timer';

/**
 * The action-button identifiers on the rest-timer notification. These are
 * matched on response.actionIdentifier in the response handler
 * (restTimerActions.js) and mapped to the store rest-timer actions.
 * British-English titles; functional, no shame, no loss framing.
 */
export const REST_TIMER_ACTION = Object.freeze({
  COMPLETE_SET: 'complete_set',
  PLUS_15: 'rest_plus_15',
  MINUS_15: 'rest_minus_15',
  SKIP: 'rest_skip',
  // L07-F4 (design-usability audit 2026-07-09): mirrors Hevy's
  // rest_timer_add_exercise_button_text. Opens the app straight to the
  // exercise picker (ActiveWorkoutScreen's notification listener), same
  // opens-app pattern as COMPLETE_SET.
  ADD_EXERCISE: 'add_exercise',
});

/**
 * Action descriptors for setNotificationCategoryAsync. Exported so the
 * test can assert the exact ids without reaching into expo.
 * opensAppToForeground:false on ±15/skip lets the user adjust without
 * yanking the app open; Log set and Add exercise open the app because both
 * run through in-app-only paths (the shared complete-set flow and the
 * exercise picker, respectively).
 */
export const REST_TIMER_ACTIONS = Object.freeze([
  { identifier: REST_TIMER_ACTION.COMPLETE_SET, buttonTitle: 'Log set', options: { opensAppToForeground: true } },
  { identifier: REST_TIMER_ACTION.PLUS_15, buttonTitle: '+15s', options: { opensAppToForeground: false } },
  { identifier: REST_TIMER_ACTION.MINUS_15, buttonTitle: '−15s', options: { opensAppToForeground: false } },
  { identifier: REST_TIMER_ACTION.SKIP, buttonTitle: 'Skip rest', options: { opensAppToForeground: false } },
  { identifier: REST_TIMER_ACTION.ADD_EXERCISE, buttonTitle: 'Add exercise', options: { opensAppToForeground: true } },
]);

/**
 * Channel routing per category. "push" means the OS delivers it;
 * "in_app" means a banner or toast inside the app only. ED-pattern
 * and FFM-floor-hold are in-app-only by policy (push for those is
 * the harm pattern). Sync error stays in-app-only too -- a push
 * about a sync error to a backgrounded app is noise.
 */
export const CHANNEL = Object.freeze({
  PUSH: 'push',
  IN_APP: 'in_app',
  EMAIL: 'email',
});

export const CATEGORY_CHANNELS = Object.freeze({
  // DAILY_CHECKIN_REMINDER's channel entry removed alongside the enum
  // value above -- see that comment for the zero-implementation proof.
  [CATEGORY.WEEKLY_CHECKIN_REMINDER]: [CHANNEL.PUSH],
  [CATEGORY.CASCADE_GATE]: [CHANNEL.PUSH, CHANNEL.IN_APP],
  [CATEGORY.SUBSCRIPTION_PAYMENT_FAILURE]: [CHANNEL.PUSH, CHANNEL.IN_APP],
  [CATEGORY.SUBSCRIPTION_EXPIRING]: [CHANNEL.PUSH, CHANNEL.IN_APP],
  [CATEGORY.SYNC_ERROR]: [CHANNEL.IN_APP],
  [CATEGORY.ED_PATTERN_LOCKOUT]: [CHANNEL.IN_APP],
  [CATEGORY.FFM_FLOOR_HOLD]: [CHANNEL.IN_APP],
  [CATEGORY.WEEKLY_COACH_READY]: [CHANNEL.PUSH],
  [CATEGORY.COACH_TRIAL_ENDING]: [CHANNEL.EMAIL],
  [CATEGORY.MORNING_WEIGHT]: [CHANNEL.PUSH],
  // Q1: the evening weigh-in backstop. Push only; delivery-suppressed once the
  // weight is logged and under an open ED flag (handler), scheduled ED-gated.
  [CATEGORY.EVENING_WEIGHT]: [CHANNEL.PUSH],
  [CATEGORY.TRAINING_REMINDER]: [CHANNEL.PUSH],
  // Campaign 1 review blocker 2: food-adjacent, ED-flag suppressed at
  // schedule time (scheduleMealReminders fails closed) AND at delivery
  // (handler), like its weight-prompt siblings.
  [CATEGORY.MEAL_LOG_REMINDER]: [CHANNEL.PUSH],
  [CATEGORY.YEAR_OF_LIFTS_UNLOCK]: [CHANNEL.PUSH],
  [CATEGORY.MONTHLY_RECAP]: [CHANNEL.PUSH],
  [CATEGORY.TRIAL_DAY3]: [CHANNEL.PUSH, CHANNEL.IN_APP], // COMP-023
  [CATEGORY.WINBACK]: [CHANNEL.PUSH, CHANNEL.IN_APP], // COMP-025-A
  // NEW-002: a partner cheer. Push when backgrounded, in-app toast when
  // foregrounded. While an ED/wellbeing flag is open the delivery downgrades to
  // in-app-only (handled at send time, §5) — pushing at a flagged user is the
  // harm pattern, exactly as ED_PATTERN_LOCKOUT/FFM_FLOOR_HOLD.
  [CATEGORY.PARTNER_CHEER]: [CHANNEL.PUSH, CHANNEL.IN_APP], // NEW-002
  // OPP-C03: the missed check-in follow-ups. Push only; ED-flag
  // suppression and the never-shame copy rule live in the scheduler
  // (scheduleMissedCheckinFollowups) and handler.
  [CATEGORY.CHECKIN_MISSED]: [CHANNEL.PUSH],
  // F3: a gentle evening nudge to confirm planned meals the user logged but
  // never marked eaten. Push only; Pro-gated, ED-flag suppressed and budgeted
  // in the scheduler, exactly like CHECKIN_MISSED.
  [CATEGORY.PLANNED_MEAL_CONFIRM]: [CHANNEL.PUSH],
  // U1/F3: the live rest-timer notification. It surfaces as an OS push
  // (a silent, ongoing local notification on its own channel) but is
  // presented directly via presentRestTimerNotification, never through
  // the scheduler — this entry exists only so tap telemetry can resolve
  // a channel and to satisfy the "every category has channels" invariant.
  [CATEGORY.REST_TIMER]: [CHANNEL.PUSH],
  // S6: the early-activation nudge. Push (the only channel that reaches a user
  // who has stopped opening the app) + an in-app banner off the same stage
  // data (zero extra budget). ED-flag suppression at BOTH schedule and delivery,
  // quiet hours, the push budget, the one-tap toggle and the single-shot-per-
  // stage flags all live in the scheduler + handler, exactly like CHECKIN_MISSED.
  [CATEGORY.ACTIVATION_NUDGE]: [CHANNEL.PUSH, CHANNEL.IN_APP],
  // D142: push only. There is no in-app half - the whole point is a user
  // who is not in the app; once they are back the plan card says it all.
  [CATEGORY.RETURN_NUDGE]: [CHANNEL.PUSH],
  // SD-15: both Community categories are push + in-app, ED-flag downgraded
  // to in-app-only at send time by community-notify, exactly as
  // PARTNER_CHEER above.
  [CATEGORY.COMMUNITY_FOLLOW]: [CHANNEL.PUSH, CHANNEL.IN_APP],
  [CATEGORY.COMMUNITY_ACTIVITY]: [CHANNEL.PUSH, CHANNEL.IN_APP],
});

/**
 * Register the rest-timer notification category with its action
 * buttons. Must run before the first rest-timer notification is
 * presented (the OS attaches the buttons by category id). Idempotent —
 * re-registering simply replaces the definition. Call once at app boot.
 *
 * NOTE: registering a notification category requires a fresh native
 * build; it does not take effect over an OTA/JS-only update.
 */
export async function registerRestTimerCategory() {
  try {
    // Lazily required so this module stays import-light: the category
    // enums above are imported by telemetry/test code that does not mock
    // expo-notifications, and a top-level import would drag the native
    // module into those contexts.
    const Notifications = require('expo-notifications');
    await Notifications.setNotificationCategoryAsync(
      REST_TIMER_CATEGORY_ID,
      REST_TIMER_ACTIONS,
    );
  } catch (_) { /* never break boot on a notification-setup failure */ }
}

/**
 * Whether a category may surface as a push at all. Used by the
 * scheduler to short-circuit OS-push calls for in-app-only types.
 */
export function isPushCategory(category) {
  const channels = CATEGORY_CHANNELS[category] || [];
  return channels.includes(CHANNEL.PUSH);
}

/**
 * Map an expo-notifications data.type string (the runtime tag baked
 * into each scheduled notification's content.data) back to the
 * category enum. Returns null when the type doesn't map. Used by
 * the response listener so the tap telemetry can fire with the
 * right category.
 */
export function categoryForDataType(type) {
  switch (type) {
    case 'morning_weight': return CATEGORY.MORNING_WEIGHT;
    case 'evening_weight': return CATEGORY.EVENING_WEIGHT;
    case 'weekly_checkin': return CATEGORY.WEEKLY_CHECKIN_REMINDER;
    case 'training_reminder': return CATEGORY.TRAINING_REMINDER;
    case 'year_of_lifts_unlock': return CATEGORY.YEAR_OF_LIFTS_UNLOCK;
    case 'monthly_recap': return CATEGORY.MONTHLY_RECAP;
    case 'cascade_gate': return CATEGORY.CASCADE_GATE;
    case 'trial_day3': return CATEGORY.TRIAL_DAY3;
    case 'winback': return CATEGORY.WINBACK;
    case 'partner_cheer': return CATEGORY.PARTNER_CHEER;
    // C7 release audit F3: these two server pushes carried data.type
    // values with no enum mapping, so the daily/weekly event budget
    // never saw them and the 2/day cap could be exceeded. They are the
    // same partner surface with the same tier and controls.
    case 'partner_streak': return CATEGORY.PARTNER_CHEER;
    case 'partner_joined': return CATEGORY.PARTNER_CHEER;
    case 'checkin_missed': return CATEGORY.CHECKIN_MISSED;
    case 'activation_nudge': return CATEGORY.ACTIVATION_NUDGE;
    case 'return_nudge': return CATEGORY.RETURN_NUDGE;
    case 'planned_meal_confirm': return CATEGORY.PLANNED_MEAL_CONFIRM;
    // Campaign 14 job 5 (routing truth, telemetry clause): the meal-log
    // reminder baked this data.type (scheduleMealReminders) but had no entry
    // here, so trackNotificationTapped resolved no category and returned
    // early -- the tap opened the app and recorded NOTHING. Same omission
    // class as the partner_streak / partner_joined gap the C7 audit closed
    // just above. The enum value and its channel entry already existed.
    case 'meal_log_reminder': return CATEGORY.MEAL_LOG_REMINDER;
    case 'rest_timer': return CATEGORY.REST_TIMER;
    case 'rest_end': return CATEGORY.REST_TIMER; // A2: the end-of-rest alert

    case 'subscription_payment_failure': return CATEGORY.SUBSCRIPTION_PAYMENT_FAILURE;
    case 'subscription_expiring': return CATEGORY.SUBSCRIPTION_EXPIRING;
    case 'weekly_coach_ready': return CATEGORY.WEEKLY_COACH_READY;
    // C16 phase C: the block-complete review shares the coaching/review
    // category, so its opt-out, budget rank and telemetry are the ones the
    // user already knows rather than a new surface they have never seen.
    case 'block_ready_to_review': return CATEGORY.WEEKLY_COACH_READY;
    case 'community_follow': return CATEGORY.COMMUNITY_FOLLOW;
    case 'community_activity': return CATEGORY.COMMUNITY_ACTIVITY;
    default: return null;
  }
}
