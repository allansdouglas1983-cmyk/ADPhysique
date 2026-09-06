/**
 * campaign14.routingTruth.test.js — Campaign 14 job 5, "notification
 * navigation / routing truth" (founder ruling).
 *
 * WHAT THIS SUITE PINS, AND WHY
 *
 * The ruling: "A delivered notification must not navigate to: a dead route, an
 * unrelated screen, or a screen with no representation of what the
 * notification described. [...] Each live notification gets one of:
 * A. meaningful existing destination, or B. intentionally non-navigating
 * notification. Do not navigate merely because a route string exists."
 *
 * Three defect classes had to become impossible to reintroduce:
 *
 *   1. DEAD ROUTE — `routeForNotificationType` names a `{tab, screen}` that no
 *      navigator registers. React Navigation drops such a navigate() silently,
 *      so it only ever shows up as "the tap did nothing" in production. The
 *      registered route names are therefore read out of RootNavigator.js
 *      itself rather than restated here, so renaming a screen breaks this
 *      suite instead of breaking a user's tap.
 *
 *   2. MISLEADING DESTINATION — a registered screen that does not carry the
 *      notification's subject. This is what `partner_cheer` was doing: it
 *      landed on ProgressTab/Consistency on the claim that "the partner row
 *      hosts the cheer caption", but that row had been removed from
 *      ConsistencyScreen on the founder device-walk of 2026-07-03. Every
 *      destination below is therefore checked against a marker in the
 *      destination screen's own source that proves the subject is represented.
 *
 *   3. SILENT DEAD-END — a live type with no mapping at all, so the tap opens
 *      whatever screen was last on top. `partner_streak`, `partner_joined`,
 *      `meal_log_reminder` and `subscription_payment_failure` were in this
 *      state. Non-navigating is allowed, but only as an explicit, reasoned
 *      decision (option B), never as a default fall-through.
 *
 * The live type inventory is DERIVED from the emitters (scheduler.js,
 * trainingReminders.js, restEnd.js, activeWorkout.js and the Edge Functions
 * that call send-push), not hand-listed, so a new notification type cannot be
 * shipped without a routing decision being made for it here.
 *
 * Finally, the ruling's telemetry clause: "Do not let 'no destination' mean
 * 'no open event recorded.'" The open event fires in listeners.js before and
 * independently of the route mapping; that ordering is pinned behaviourally
 * against the real listeners + real telemetry modules.
 */

import fs from 'fs';
import path from 'path';

// Jest mock factories may only reference `mock`-prefixed outer vars.
const mockTapListeners = [];
jest.mock('expo-notifications', () => ({
  addNotificationResponseReceivedListener: jest.fn((fn) => {
    mockTapListeners.push(fn);
    return { remove: () => {} };
  }),
  addNotificationReceivedListener: jest.fn(() => ({ remove: () => {} })),
  getLastNotificationResponseAsync: jest.fn(async () => null),
  DEFAULT_ACTION_IDENTIFIER: 'expo.modules.notifications.actions.DEFAULT',
}));

const mockTrack = jest.fn(() => Promise.resolve());
jest.mock('../../engineTelemetry', () => ({ track: (...a) => mockTrack(...a) }));
jest.mock('../../../store/useAppStore', () => ({
  __esModule: true,
  default: { getState: () => ({ user: { id: 'u1' } }) },
}));

const { routeForNotificationType } = require('../notificationRoute');
const { categoryForDataType, CATEGORY } = require('../categories');
const { installNotificationListeners } = require('../listeners');

const ROOT = path.resolve(__dirname, '../../../..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// ───────────────────────── live type inventory ──────────────────────────────

// Every file that bakes a `data.type` onto a notification a real user can
// receive today. The Edge Functions are included because the ruling names them
// explicitly: a server push dead-ends exactly like a local one.
const EMITTERS = [
  'src/lib/notifications/scheduler.js',
  'src/lib/notifications/trainingReminders.js',
  'src/lib/notifications/restEnd.js',
  'src/lib/notifications/activeWorkout.js',
  'supabase/functions/play-billing-rtdn/index.ts',
  'supabase/functions/_shared/appStore.ts',
  'supabase/functions/partner-cheer/index.ts',
];

// The one emitted type that is NOT live: the whole workout-progress surface
// no-ops (founder decision, the confusing "Set 3 of 2" numbering), so nothing
// is ever delivered with this type. Pinned as disabled below, so if the
// surface is ever revived this suite forces a routing decision for it.
const DISABLED_TYPES = new Set(['active_workout']);

function emittedTypes() {
  const found = new Set();
  for (const rel of EMITTERS) {
    const src = read(rel);
    for (const m of src.matchAll(/\{\s*type:\s*['"]([a-z0-9_]+)['"]/g)) found.add(m[1]);
    for (const m of src.matchAll(/\{\s*type:\s*CATEGORY\.([A-Z0-9_]+)/g)) {
      const value = CATEGORY[m[1]];
      if (value) found.add(value);
    }
  }
  return found;
}

const LIVE_TYPES = [...emittedTypes()].filter((t) => !DISABLED_TYPES.has(t)).sort();

// Destination decisions, one row per live type. `screen: null` is option B:
// an intentionally non-navigating notification. `marker` is a regex that must
// appear in the destination screen's own source and that proves the screen
// represents what the notification said — the anti-"unrelated screen" check.
const DECISIONS = {
  morning_weight: {
    tab: 'HomeTab', screen: 'Home',
    file: 'src/screens/HomeScreen.js', marker: /openWeightLog/,
  },
  evening_weight: {
    tab: 'HomeTab', screen: 'Home',
    file: 'src/screens/HomeScreen.js', marker: /openWeightLog/,
  },
  training_reminder: {
    tab: 'HomeTab', screen: 'Home',
    file: 'src/screens/HomeScreen.js', marker: /Start workout/,
  },
  activation_nudge: {
    tab: 'HomeTab', screen: 'Home',
    file: 'src/screens/HomeScreen.js', marker: /Start workout/,
  },
  // D142: "your plan is still here" lands where the plan and Start workout
  // live, the same destination as the getting-started nudge.
  return_nudge: {
    tab: 'HomeTab', screen: 'Home',
    file: 'src/screens/HomeScreen.js', marker: /Start workout/,
  },
  weekly_checkin: {
    tab: 'ProfileTab', screen: 'WeeklyCheckIn',
    file: 'src/screens/WeeklyCheckInScreen.js', marker: /[Cc]heck-[Ii]n/,
  },
  checkin_missed: {
    tab: 'ProfileTab', screen: 'WeeklyCheckIn',
    file: 'src/screens/WeeklyCheckInScreen.js', marker: /[Cc]heck-[Ii]n/,
  },
  weekly_coach_ready: {
    tab: 'ProfileTab', screen: 'CoachOutput',
    file: 'src/screens/CoachOutputScreen.js', marker: /weekStart/,
  },
  // C16 phase C: the block-complete review opens the surface that carries
  // the decision card, not a generic screen.
  block_ready_to_review: {
    tab: 'PlansTab', screen: 'Plans',
    file: 'src/screens/PlansScreen.js', marker: /programmeReview/,
  },
  // Option B, FULLY-FREE PRODUCT (founder decision 2026-09-03). These four
  // used to be option A: CascadeGate (the day-14 trial gate), the check-in
  // gate / Home (the day-3 trial moment) and Subscription (the win-back offer
  // and the payment-failure fix-up). Volyume has no trial, no paywall and no
  // expiry now, and CascadeGateScreen / SubscriptionScreen are no longer
  // registered in any navigator, so every one of those destinations would be
  // either a false deep link (defect class 2) or an outright dead route
  // (defect class 1) - the two things this suite exists to make impossible.
  // The ruling's option B is the correct treatment, and it is written down
  // here and as an explicit `case` in notificationRoute.js.
  cascade_gate: { tab: null, screen: null },
  trial_day3: { tab: null, screen: null },
  winback: { tab: null, screen: null },
  subscription_payment_failure: { tab: null, screen: null },
  year_of_lifts_unlock: {
    tab: 'ProgressTab', screen: 'YearOfLifts',
    file: 'src/screens/YearOfLiftsScreen.js', marker: /[Yy]ear of [Ll]ifts/,
  },
  monthly_recap: {
    tab: 'ProgressTab', screen: 'Analytics',
    file: 'src/screens/AnalyticsScreen.js', marker: /recap/,
  },
  // Partners was retired on 2026-09-06 (SD-03). partner_cheer is still a
  // LIVE type because the partner-cheer Edge Function stays deployed, so an
  // in-flight or already-delivered push must still resolve. It now lands on
  // Community, the surface that replaced the pairing model, which explains
  // the retirement in its own copy. partner_streak and partner_joined left
  // the live inventory with the local scheduler that emitted them; their
  // `case` labels stay in notificationRoute.js for anything still in a tray.
  partner_cheer: {
    tab: 'HomeTab', screen: 'Community',
    file: 'src/screens/CommunityHubScreen.js', marker: /[Pp]artner/,
  },
  planned_meal_confirm: {
    tab: 'DiaryTab', screen: 'Diary',
    file: 'src/screens/DiaryScreen.js', marker: /Mark as eaten/,
  },
  meal_log_reminder: {
    tab: 'DiaryTab', screen: 'Diary',
    file: 'src/screens/DiaryScreen.js', marker: /[Mm]eal/,
  },
  // Option B. Both are live-workout notifications whose tap happens while the
  // user is mid session, so the OS already restores them to the Active Workout
  // screen; rest_timer's real controls are its action buttons, handled in
  // listeners.js before onTap runs. Deep-linking would duplicate the screen
  // when a workout is live and land on an empty one when the notification is
  // stale, which is the "no representation" defect the ruling forbids.
  rest_timer: { tab: null, screen: null },
  rest_end: { tab: null, screen: null },
};

// Sample `data` payloads, matching the shapes the emitters actually bake, for
// the types whose target depends on a baked field.
const SAMPLE_DATA = {
  trial_day3: { variant: 'S1' },
  checkin_missed: { slot: 'evening' },
  weekly_coach_ready: { weekStart: 1_750_000_000_000 },
  partner_joined: { pairId: 'pair-1' },
};

// ─────────────────── registered routes, read from the navigator ─────────────

const NAV = read('src/navigation/RootNavigator.js');

/** tab route name -> the stack component that tab renders. */
function tabToStack() {
  const map = {};
  for (const m of NAV.matchAll(/<Tab\.Screen\s+name="([A-Za-z]+)"\s+component=\{([A-Za-z]+)\}/g)) {
    map[m[1]] = m[2];
  }
  return map;
}

/** The screen names a given stack function registers. */
function screensIn(stackFnName) {
  const start = NAV.indexOf(`function ${stackFnName}(`);
  if (start === -1) return null;
  const next = NAV.indexOf('\nfunction ', start + 1);
  const body = NAV.slice(start, next === -1 ? NAV.length : next);
  return new Set([...body.matchAll(/<Stack\.Screen\s+name="([A-Za-z0-9]+)"/g)].map((m) => m[1]));
}

const TAB_TO_STACK = tabToStack();

describe('live notification type inventory is derived, not assumed', () => {
  test('every emitted type has an explicit routing decision (A or B)', () => {
    // A new notification type cannot ship without a decision being recorded
    // here: this is the mechanical form of "each live notification gets one of
    // A or B".
    const undecided = LIVE_TYPES.filter((t) => !(t in DECISIONS));
    expect(undecided).toEqual([]);
  });

  test('the inventory matches the traced set (a new emitter forces a re-trace)', () => {
    expect(LIVE_TYPES).toEqual([
      'activation_nudge',
      'block_ready_to_review',
      'cascade_gate',
      'checkin_missed',
      'evening_weight',
      'meal_log_reminder',
      'monthly_recap',
      'morning_weight',
      'partner_cheer',
      'planned_meal_confirm',
      'rest_end',
      'rest_timer',
      'return_nudge',
      'subscription_payment_failure',
      'training_reminder',
      'trial_day3',
      'weekly_checkin',
      'weekly_coach_ready',
      'winback',
      'year_of_lifts_unlock',
    ]);
  });

  test('active_workout is excluded because its surface is genuinely disabled', () => {
    const src = read('src/lib/notifications/activeWorkout.js');
    // The function short-circuits before it can ever schedule; if that early
    // return is removed, the type becomes live and the inventory test above
    // starts failing until a routing decision is made for it.
    expect(src).toMatch(
      /export async function showActiveWorkoutNotification\([^)]*\)\s*\{\s*\n\s*return;/,
    );
  });
});

// (19) ────────────────────────────────────────────────────────────────────────
describe('(19) every routed live type reaches a route a navigator registers', () => {
  const routed = LIVE_TYPES.filter((t) => DECISIONS[t].screen !== null);

  test.each(routed)('%s lands on its decided destination', (type) => {
    const target = routeForNotificationType(type, SAMPLE_DATA[type] ?? {});
    expect(target).not.toBeNull();
    expect(target.tab).toBe(DECISIONS[type].tab);
    expect(target.screen).toBe(DECISIONS[type].screen);
  });

  test.each(routed)('%s: the tab it names is a registered bottom tab', (type) => {
    const { tab } = routeForNotificationType(type, SAMPLE_DATA[type] ?? {});
    expect(Object.keys(TAB_TO_STACK)).toContain(tab);
  });

  test.each(routed)('%s: the screen it names is registered in that tab\'s stack (no dead route)', (type) => {
    const { tab, screen } = routeForNotificationType(type, SAMPLE_DATA[type] ?? {});
    const screens = screensIn(TAB_TO_STACK[tab]);
    expect(screens).not.toBeNull();
    expect([...screens]).toContain(screen);
  });

  test.each(routed)('%s: the destination screen actually represents its subject', (type) => {
    const { file, marker } = DECISIONS[type];
    expect(read(file)).toMatch(marker);
  });

  test('trial_day3 navigates nowhere, whatever variant it carries', () => {
    // Was: the S3 variant landed on the Today tab root and S1/S2 on the
    // check-in gate. Under the fully-free product there is no trial and no
    // day-3 moment to open, so every variant is non-navigating.
    for (const variant of ['S1', 'S2', 'S3', undefined]) {
      expect(routeForNotificationType('trial_day3', { variant })).toBeNull();
    }
  });

  test('checkin_missed follow-up lands on the trend view it promises, not the wrong-day check-in gate', () => {
    const target = routeForNotificationType('checkin_missed', { slot: 'followup' });
    expect(target).toEqual({ tab: 'ProgressTab', screen: 'Analytics' });
    expect([...screensIn(TAB_TO_STACK.ProgressTab)]).toContain('Analytics');
    expect(read('src/screens/AnalyticsScreen.js')).toMatch(/[Tt]rend/);
  });

  test('every live type still resolves a telemetry category (no live type can lose its open event)', () => {
    for (const type of LIVE_TYPES) {
      expect(categoryForDataType(type)).not.toBeNull();
    }
  });
});

// (20) ────────────────────────────────────────────────────────────────────────
describe('(20) the retired partner beats still resolve, on Community', () => {
  // Partners was retired on 2026-09-06 (SD-03). The three data types are kept
  // as explicit cases so a push already scheduled, in a tray, or sent by the
  // still-deployed partner-cheer Edge Function opens a real screen instead of
  // dead-ending on whatever was last on top.
  const PARTNER_TYPES = ['partner_cheer', 'partner_streak', 'partner_joined'];

  test.each(PARTNER_TYPES)('%s lands on Community', (type) => {
    expect(routeForNotificationType(type, SAMPLE_DATA[type] ?? {})).toEqual({
      tab: 'HomeTab', screen: 'Community', params: { source: 'notification' },
    });
  });

  test('Community is registered in HomeStack, so the tap is never a dead route', () => {
    expect([...screensIn(TAB_TO_STACK.HomeTab)]).toContain('Community');
  });

  test('the Partner route and screen are gone with the feature', () => {
    expect(NAV).not.toMatch(/<Stack\.Screen name="Partner"/);
    expect(fs.existsSync(path.resolve(__dirname, '../../../screens/PartnerScreen.js'))).toBe(false);
  });

  test('Community explains where partner invites went', () => {
    // The destination has to represent the subject: the hub carries the
    // "Partner invites have moved" card for the legacy link path.
    expect(read('src/screens/CommunityHubScreen.js')).toMatch(/[Pp]artner/);
  });

  test('no pairId is forwarded (the pair no longer exists to open)', () => {
    const target = routeForNotificationType('partner_joined', { pairId: 'pair-1' });
    expect(target.params).toEqual({ source: 'notification' });
    expect(target.params.pairId).toBeUndefined();
  });
});

// (21) ────────────────────────────────────────────────────────────────────────
describe('(21) intentionally non-navigating types are safe', () => {
  const NON_NAVIGATING = LIVE_TYPES.filter((t) => DECISIONS[t].screen === null);

  test('the non-navigating set is the two live-workout notifications plus the four dormant billing ones', () => {
    // rest_end / rest_timer: the tap happens mid-session, so the OS already
    // restores the Active Workout screen. cascade_gate / trial_day3 /
    // winback / subscription_payment_failure: fully-free product, 2026-09-03
    // - nothing to convert at, no offer to return to, and their old screens
    // are unregistered. Any NEW type appearing here still has to be a
    // deliberate decision, which is what this list enforces.
    expect(NON_NAVIGATING).toEqual([
      'cascade_gate',
      'rest_end',
      'rest_timer',
      'subscription_payment_failure',
      'trial_day3',
      'winback',
    ]);
  });

  test.each(NON_NAVIGATING)('%s returns null, never undefined and never a partial target', (type) => {
    const target = routeForNotificationType(type);
    expect(target).toBeNull();
    expect(target).not.toBeUndefined();
  });

  test.each(NON_NAVIGATING)('%s is an explicit case, not a default fall-through', (type) => {
    // The difference between option B and a silent dead-end is that option B
    // is written down. Both types must appear as their own `case` label.
    const src = read('src/lib/notifications/notificationRoute.js');
    expect(src).toMatch(new RegExp(`case '${type}':`));
  });

  test('no live type ever yields a target with an undefined screen alongside a screen key', () => {
    for (const type of LIVE_TYPES) {
      const target = routeForNotificationType(type, SAMPLE_DATA[type] ?? {});
      if (target === null) continue;
      expect(typeof target.tab).toBe('string');
      if ('screen' in target) expect(typeof target.screen).toBe('string');
    }
  });

  test('unknown, absent and malformed types resolve to null rather than throwing', () => {
    for (const bad of [undefined, null, '', 'not_a_type', 0, {}, []]) {
      expect(() => routeForNotificationType(bad)).not.toThrow();
      expect(routeForNotificationType(bad)).toBeNull();
    }
    // A malformed `data` payload must not crash the mapping either.
    expect(() => routeForNotificationType('trial_day3', null)).not.toThrow();
    expect(() => routeForNotificationType('checkin_missed', 'nonsense')).not.toThrow();
    expect(() => routeForNotificationType('weekly_coach_ready', { weekStart: 'soon' })).not.toThrow();
    expect(routeForNotificationType('weekly_coach_ready', { weekStart: 'soon' }))
      .toEqual({ tab: 'ProfileTab', screen: 'CoachOutput' });
  });

  test('the navigator refuses to navigate on a null target (the tap just opens the app)', () => {
    // RootNavigator's onTap: `const target = routeForNotificationType(...); if
    // (!target) return;`. Pinned at source because the effect is not exported.
    expect(NAV).toMatch(/const target = routeForNotificationType\(type, data\);\s*\n\s*if \(!target\) return;/);
  });
});

// (22) ────────────────────────────────────────────────────────────────────────
describe('(22) the open telemetry event still fires on a non-navigating tap', () => {
  beforeEach(() => {
    mockTapListeners.length = 0;
    mockTrack.mockClear();
  });

  function tap(type, extra = {}) {
    const onTap = jest.fn();
    installNotificationListeners({ onTap });
    mockTapListeners[0]({
      notification: { request: { content: { data: { type } } } },
      ...extra,
    });
    return onTap;
  }

  test.each(['rest_end', 'rest_timer'])(
    '%s: a body tap records notification_tapped even though it navigates nowhere',
    (type) => {
      const onTap = tap(type);
      // Non-navigating by decision...
      expect(routeForNotificationType(type)).toBeNull();
      // ...but the open event is still recorded, with the right category.
      expect(mockTrack).toHaveBeenCalledWith(
        'u1',
        'notification_tapped',
        expect.objectContaining({ category: CATEGORY.REST_TIMER, data_type: type }),
      );
      // rest_timer's plain body tap still reaches onTap so the app opens; only
      // an action-button response short-circuits.
      expect(onTap).toHaveBeenCalledTimes(1);
    },
  );

  test('a rest-timer ACTION button still records the open event before short-circuiting', () => {
    const onTap = tap('rest_timer', { actionIdentifier: 'rest_plus_15' });
    expect(mockTrack).toHaveBeenCalledWith(
      'u1',
      'notification_tapped',
      expect.objectContaining({ category: CATEGORY.REST_TIMER, data_type: 'rest_timer' }),
    );
    expect(onTap).not.toHaveBeenCalled();
  });

  test('telemetry is fired before routing, so it cannot depend on a destination existing', () => {
    const src = read('src/lib/notifications/listeners.js');
    const trackAt = src.indexOf('trackNotificationTapped(');
    const onTapAt = src.indexOf('onTap(response)');
    expect(trackAt).toBeGreaterThan(-1);
    expect(onTapAt).toBeGreaterThan(-1);
    expect(trackAt).toBeLessThan(onTapAt);
  });

  test('every live type, routed or not, records an open event on tap', () => {
    for (const type of LIVE_TYPES) {
      mockTrack.mockClear();
      mockTapListeners.length = 0;
      tap(type);
      expect(mockTrack).toHaveBeenCalledWith(
        'u1',
        'notification_tapped',
        expect.objectContaining({ data_type: type }),
      );
    }
  });
});
