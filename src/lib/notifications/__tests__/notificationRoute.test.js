/**
 * Every notification type the scheduler sets must have a DECIDED tap
 * treatment, or the notification dead-ends by accident. This locks the
 * mapping: a real destination, or an explicit non-navigating decision.
 *
 * Updated 2026-09-03 (fully-free product, founder decision): the four
 * billing-lifecycle types (cascade_gate, trial_day3, winback,
 * subscription_payment_failure) are now the explicit non-navigating kind.
 */
import { routeForNotificationType } from '../notificationRoute';

describe('routeForNotificationType', () => {
  test('weekly_checkin opens the check-in in the Coach tab', () => {
    expect(routeForNotificationType('weekly_checkin')).toEqual({
      tab: 'ProfileTab', screen: 'WeeklyCheckIn',
    });
  });

  test('year_of_lifts_unlock opens Year of Lifts in the Progress tab', () => {
    expect(routeForNotificationType('year_of_lifts_unlock')).toEqual({
      tab: 'ProgressTab', screen: 'YearOfLifts',
    });
  });

  // FULLY-FREE PRODUCT (founder decision 2026-09-03). INVERTED PINS: these
  // four used to assert the billing destinations (CascadeGate, the check-in
  // gate / Home for the day-3 trial moment, Subscription for the win-back and
  // for a payment failure). Volyume has no trial, no paywall and no
  // subscription surface registered any more, so each of those would now be a
  // false deep link or an outright dead route. The intent this suite pins is
  // therefore the opposite one: a billing-lifecycle tap opens the app and
  // navigates nowhere.
  test('cascade_gate no longer routes anywhere (no trial gate to convert at)', () => {
    expect(routeForNotificationType('cascade_gate')).toBeNull();
  });

  test('weekly_coach_ready opens Precision Coaching', () => {
    expect(routeForNotificationType('weekly_coach_ready')).toEqual({
      tab: 'ProfileTab', screen: 'CoachOutput',
    });
  });

  test('trial_day3 no longer routes anywhere, whatever variant it carries', () => {
    for (const variant of ['S1', 'S2', 'S3']) {
      expect(routeForNotificationType('trial_day3', { variant })).toBeNull();
    }
    expect(routeForNotificationType('trial_day3')).toBeNull();
  });

  test('winback no longer routes to Subscription (no offer to return to)', () => {
    expect(routeForNotificationType('winback')).toBeNull();
  });

  test('subscription_payment_failure no longer routes to Subscription (dead route)', () => {
    // The screen is not registered in any navigator now, so a route string
    // here would be a silent no-op tap.
    expect(routeForNotificationType('subscription_payment_failure')).toBeNull();
  });

  test('each of the four is an EXPLICIT case, not a default fall-through', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '..', 'notificationRoute.js'), 'utf8',
    );
    for (const type of ['cascade_gate', 'winback', 'trial_day3', 'subscription_payment_failure']) {
      expect(src).toMatch(new RegExp(`case '${type}':`));
    }
  });

  // RE-ANCHORED 2026-09-06 (SD-03, Partners retired). The three partner beat
  // types keep their `case` labels so a push already scheduled, in a tray or
  // sent by the still-deployed partner-cheer Edge Function resolves to a real
  // screen; Community is the surface that replaced the pairing model. Full
  // coverage lives in campaign14.routingTruth.test.js.
  test.each(['partner_cheer', 'partner_streak', 'partner_joined'])(
    'a retired %s beat lands on Community, never a dead route',
    (type) => {
      expect(routeForNotificationType(type)).toEqual({
        tab: 'HomeTab', screen: 'Community', params: { source: 'notification' },
      });
    },
  );

  test('F3: the planned-meal confirm nudge opens the Diary', () => {
    expect(routeForNotificationType('planned_meal_confirm')).toEqual({
      tab: 'DiaryTab', screen: 'Diary',
    });
  });

  test('SD-15: community_follow and community_activity land on the Community Activity screen', () => {
    expect(routeForNotificationType('community_follow')).toEqual({
      tab: 'HomeTab', screen: 'CommunityActivity', params: { source: 'notification' },
    });
    expect(routeForNotificationType('community_activity')).toEqual({
      tab: 'HomeTab', screen: 'CommunityActivity', params: { source: 'notification' },
    });
  });

  test('§15 item 8: diary_day with a valid local day-key opens that exact diary day', () => {
    expect(routeForNotificationType('diary_day', { date: '2026-07-05' })).toEqual({
      tab: 'DiaryTab', screen: 'Diary', params: { date: '2026-07-05' },
    });
  });

  test('§15 item 8: diary_day with a missing or non-day-key-shaped date falls back to the Diary root, not a dead-end', () => {
    expect(routeForNotificationType('diary_day')).toEqual({
      tab: 'DiaryTab', screen: 'Diary',
    });
    expect(routeForNotificationType('diary_day', { date: 'not-a-date' })).toEqual({
      tab: 'DiaryTab', screen: 'Diary',
    });
    expect(routeForNotificationType('diary_day', { date: '5 July 2026' })).toEqual({
      tab: 'DiaryTab', screen: 'Diary',
    });
  });

  test('OPP-C03: the same-evening missed check-in nudge opens the check-in wizard', () => {
    expect(routeForNotificationType('checkin_missed', { slot: 'evening' })).toEqual({
      tab: 'ProfileTab', screen: 'WeeklyCheckIn',
    });
    // No slot data behaves like the evening nudge (not a dead-end).
    expect(routeForNotificationType('checkin_missed')).toEqual({
      tab: 'ProfileTab', screen: 'WeeklyCheckIn',
    });
  });

  test('OPP-C03: the +48h value follow-up lands on the Progress trend view', () => {
    expect(routeForNotificationType('checkin_missed', { slot: 'followup' })).toEqual({
      tab: 'ProgressTab', screen: 'Analytics',
    });
  });

  test('an unknown or no-op type returns null (no navigation)', () => {
    // PM-04 (D96) re-anchor: 'morning_weight' is no longer an unrouted type.
    // It was used here as the stand-in for "a type with no route", which is
    // exactly the defect PM-04 closed: the two daily weigh-in prompts, the
    // most frequent Pro pushes of the month, dead-ended on whatever screen
    // was last open. The property this test pins (an unknown type navigates
    // nowhere) is unchanged and still asserted below.
    expect(routeForNotificationType('unknown')).toBeNull();
    expect(routeForNotificationType(undefined)).toBeNull();
  });

  // PM-04 / FM-08 (D96): every type the scheduler sets has a route, which is
  // this module's own stated contract.
  test('PM-04: both weigh-in prompts open the Today strip weight input', () => {
    for (const type of ['morning_weight', 'evening_weight']) {
      const target = routeForNotificationType(type);
      expect(target.tab).toBe('HomeTab');
      expect(target.screen).toBe('Home');
      // Minted per tap, so a repeat tap re-opens the input (HomeScreen keys
      // the open on a fresh value, as the check-in gate's deep link does).
      expect(Number.isFinite(target.params.openWeightLog)).toBe(true);
    }
  });

  test('FM-08: the two Free-tier pushes land on Home rather than dead-ending', () => {
    expect(routeForNotificationType('training_reminder')).toEqual({ tab: 'HomeTab', screen: 'Home' });
    expect(routeForNotificationType('activation_nudge')).toEqual({ tab: 'HomeTab', screen: 'Home' });
  });

  test('PM-01(b): the coach-ready push opens the week it was laid for', () => {
    expect(routeForNotificationType('weekly_coach_ready', { weekStart: 1750000000000 })).toEqual({
      tab: 'ProfileTab', screen: 'CoachOutput', params: { weekStart: 1750000000000 },
    });
    // A legacy push with no baked week keeps the old no-params behaviour.
    expect(routeForNotificationType('weekly_coach_ready')).toEqual({
      tab: 'ProfileTab', screen: 'CoachOutput',
    });
  });
});
