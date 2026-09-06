/**
 * Pure mapping from a notification's `data.type` to a navigation target.
 *
 * Kept separate from RootNavigator so it can be unit-tested without the
 * navigator: the navigator owns only "given this target, navigate". The day-14
 * trial gate (`cascade_gate`) dead-ending is the bug this module first closed;
 * under the fully-free product (2026-09-03) that type, `winback` and
 * `trial_day3` are deliberately non-navigating again - see their case below.
 *
 * ROUTING TRUTH (Campaign 14 job 5, founder ruling). Every LIVE notification
 * type gets exactly one of two treatments, and nothing else:
 *
 *   A. a meaningful existing destination -- a screen that a navigator really
 *      registers AND that genuinely represents what the notification said, or
 *   B. an intentionally non-navigating notification -- an explicit `case`
 *      returning null, so the tap simply opens the app.
 *
 * A route string is never used merely because it exists, and no screen is
 * created merely to satisfy navigation. Where no screen can truthfully carry
 * the notification's subject, B is preferred over a false deep link. The
 * `notification_tapped` open event fires in `listeners.js` before and
 * independently of this mapping, so choosing B never costs the open telemetry.
 *
 * Returns `{ tab, screen, params? }` or `null` for an unknown / no-op type.
 * `tab` is the bottom-tab route; `screen` is the screen inside that tab's
 * stack; `params` (optional) are passed to the screen.
 *
 * @param {string} type  the `data.type` on the notification
 * @param {object} [data] the full `data` payload, for types whose target
 *        depends on a baked field (e.g. COMP-023 trial_day3 variant)
 * @returns {{tab: string, screen: string, params?: object} | null}
 */
// Local day-key format used app-wide (YYYY-MM-DD, `src/lib/dayKey.js`). Kept
// as a local regex (this module stays import-free) so an invalid/missing
// date on a future notification can never produce a malformed diary route.
const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function routeForNotificationType(type, data = {}) {
  switch (type) {
    case 'weekly_checkin':
      return { tab: 'ProfileTab', screen: 'WeeklyCheckIn' };
    case 'year_of_lifts_unlock':
      return { tab: 'ProgressTab', screen: 'YearOfLifts' };
    case 'monthly_recap':
      // COMP-005: lands on Progress, where the ephemeral recap card and the
      // Recaps tile open the story. The month window is dynamic, so it is not
      // carried on the static notification route.
      return { tab: 'ProgressTab', screen: 'Analytics' };
    case 'cascade_gate':
    case 'winback':
    case 'trial_day3':
    case 'subscription_payment_failure':
      // FULLY-FREE PRODUCT (founder decision 2026-09-03, src/lib/proGate.js):
      // treatment B, INTENTIONALLY non-navigating, listed explicitly so it
      // reads as a decision rather than an accidental fall-through.
      //
      // All three are billing-lifecycle pushes and none is laid any more (the
      // schedulers self-cancel while FULL_ACCESS_FOR_ALL is on). Their old
      // destinations were CascadeGate (the day-14 trial gate), Subscription
      // (the +30-day win-back offer) and the check-in gate / Home (the day-3
      // trial moment). Two of those screens are being unregistered with the
      // paywall, and all three would be a false deep link now: there is no
      // trial to end, no offer to return to and no gate to convert at. A
      // survivor already in a user's OS queue therefore just opens the app.
      // The `notification_tapped` open event still fires in listeners.js,
      // which runs before and independently of this mapping.
      //
      // `subscription_payment_failure` joins them for the DEAD-ROUTE reason
      // rather than the trial reason: it is a server-sent push (the
      // play-billing-rtdn / app-store Edge Functions), so it can still
      // technically arrive for a legacy subscription, but the Subscription
      // screen it used to open is no longer registered in any navigator.
      // Navigating to an unregistered route is a silent no-op, which is
      // exactly the dead-route defect this module exists to prevent, so the
      // decision is written down here instead.
      return null;
    case 'block_ready_to_review':
      // C16 phase C: the block-complete review. The decision card - the
      // programme verdict, what stays, what changes and the next-block
      // options - lives on the Plans surface, so that is where the push
      // opens. It carries no params: the card reads the active block
      // itself, and a stale id in a notification would be worse than none.
      return { tab: 'PlansTab', screen: 'Plans' };
    case 'weekly_coach_ready':
      // PM-01(b) (D96): the Monday 09:00 push is laid when a check-in is
      // submitted, so it is about THAT week's review. It used to carry no
      // params, and CoachOutput defaults to the CURRENT week, so on Monday
      // morning the tap opened a week nine hours old with no check-in in it.
      // The reviewed week is baked into `data` at schedule time and passed
      // through here, exactly as the day-3 trial variant already is.
      return data?.weekStart != null && Number.isFinite(Number(data.weekStart))
        ? { tab: 'ProfileTab', screen: 'CoachOutput', params: { weekStart: Number(data.weekStart) } }
        : { tab: 'ProfileTab', screen: 'CoachOutput' };
    case 'morning_weight':
    case 'evening_weight':
      // PM-04 (D96): the two most frequent Pro pushes of the month had no
      // route at all, so the tap landed on whatever screen was last open.
      // The destination already exists and is already used by the check-in
      // gate's "Log my weight first": the Today strip's weight input on Home.
      // The param is minted per tap (RootNavigator passes params straight
      // through, and HomeScreen keys the open on a fresh value).
      return { tab: 'HomeTab', screen: 'Home', params: { openWeightLog: Date.now() } };
    case 'training_reminder':
      // FM-08 (D96): a Free-tier push with no route. Home is where the
      // session hero and "Start workout" live, which is what the reminder is
      // about.
      return { tab: 'HomeTab', screen: 'Home' };
    case 'activation_nudge':
      // FM-08 (D96): the nudge exists to restart a stalled user, and the
      // in-app banner version of it already routes to the next workout on
      // Home. Same destination, so the two cannot disagree.
      return { tab: 'HomeTab', screen: 'Home' };
    case 'return_nudge':
      // D142: "your plan is still here" lands on Home, where the session
      // hero and "Start workout" are, so the tap goes straight to the plan
      // the note is about.
      return { tab: 'HomeTab', screen: 'Home' };
    case 'partner_cheer':
    case 'partner_streak':
    case 'partner_joined':
      // Partners was retired on 2026-09-06 (SD-03). These three types are
      // kept ONLY so a notification that was already scheduled or already
      // sitting in the tray still resolves to a real screen instead of
      // dead-ending on whatever was last open. Community is the surface
      // that replaced the pairing model, so that is where an old cheer,
      // shared-streak or joined beat now lands.
      return { tab: 'HomeTab', screen: 'Community', params: { source: 'notification' } };
    case 'meal_log_reminder':
      // Campaign 14 job 5: the opt-in meal-log nudge (scheduler.js
      // scheduleMealReminders, Pro-gated and ED-flag gated at both schedule
      // and delivery time) had no mapping, so "a gentle reminder to log it"
      // dead-ended. The Diary IS the thing it names, and it is the same
      // destination the planned-meal confirm nudge already uses. DiaryScreen
      // is registered as the Pro-guarded GatedDiary, so the tier gate is
      // unchanged.
      return { tab: 'DiaryTab', screen: 'Diary' };
    case 'rest_timer':
    case 'rest_end':
      // Campaign 14 job 5: INTENTIONALLY non-navigating, listed explicitly so
      // it reads as a decision rather than an accidental fall-through.
      //
      // Both are live-workout notifications. rest_timer is a silent ongoing
      // sticky whose real controls are its action buttons (handled in
      // listeners.js before onTap ever runs); rest_end is the one-shot "Rest
      // done" alert. A body tap on either happens while the user is mid
      // session, so the OS restores the app exactly where they left it: the
      // Active Workout screen. Pushing an ActiveWorkout route on top of that
      // would duplicate the screen when a workout is live, and land on an
      // empty one when the notification is stale. The tap therefore just
      // opens the app; the notification_tapped telemetry still fires in
      // listeners.js, which runs before and independently of this mapping.
      return null;
    case 'checkin_missed':
      // OPP-C03 ghost prevention. The same-evening nudge lands on the
      // check-in wizard (it is still the user's check-in day); the +48h
      // value follow-up promises the weekly trend, so it lands on the
      // Progress trend view rather than dead-ending on the check-in
      // screen's wrong-day gate.
      return data?.slot === 'followup'
        ? { tab: 'ProgressTab', screen: 'Analytics' }
        : { tab: 'ProfileTab', screen: 'WeeklyCheckIn' };
    case 'planned_meal_confirm':
      // F3: tap lands on the Diary, where the "Mark as eaten" banner and the
      // per-meal confirm live for the day with unconfirmed planned meals.
      return { tab: 'DiaryTab', screen: 'Diary' };
    case 'community_follow':
    case 'community_activity':
      // SD-15: both Community push categories land on the Activity screen
      // inside Community, the inbox for follows, reactions, comments and
      // programme-use beats. `source` mirrors the other notification-driven
      // entry points (e.g. the retired partner beats above) so surface-view
      // telemetry can attribute the open.
      return { tab: 'HomeTab', screen: 'CommunityActivity', params: { source: 'notification' } };
    case 'diary_day':
      // §15 item 8 (deep-link expansion): the general-purpose target for any
      // notification that references ONE specific diary day rather than
      // today (e.g. a future "confirm what you logged on Tuesday" nudge). No
      // scheduler call site sets this type yet; the mapping exists so the
      // first one to need it has somewhere to land instead of dead-ending.
      // `data.date` is a local day-key (YYYY-MM-DD); an absent or malformed
      // value falls through to the Diary root (today), same as
      // planned_meal_confirm above, never a crash.
      return DAY_KEY_RE.test(data?.date)
        ? { tab: 'DiaryTab', screen: 'Diary', params: { date: data.date } }
        : { tab: 'DiaryTab', screen: 'Diary' };
    default:
      return null;
  }
}
