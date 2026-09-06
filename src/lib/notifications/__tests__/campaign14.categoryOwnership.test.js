/**
 * CAMPAIGN 14 jobs 3 + 4 — one authority per notification category, and a
 * real off switch that governs every delivery path.
 *
 * What this suite pins and why:
 *
 * JOB 3. A user-controlled category had up to three independent
 * representations of the same choice: the '@volyume_notification_prefs'
 * blob, a dedicated AsyncStorage key, and a per-category row in
 * notification_preferences. Each syncs by a different mechanism with a
 * different conflict rule, so after a cross-device conflict they can
 * disagree, and nothing decided which was right. Training reminders
 * showed it plainly: Settings read the SQLite row, the scheduler read the
 * dedicated key, so the switch could read OFF while reminders arrived.
 *
 * The rule now: the blob is the AUTHORITY (what every scheduler already
 * gates on, guarded and stamped, restored on reinstall); the per-category
 * row is a PROJECTION written on every change and never consulted as the
 * on-device answer, existing so the SERVER can read the choice; the
 * legacy key is a derived MIRROR. Nothing is deleted, only subordinated,
 * and every write goes through one function so they move together.
 *
 * JOB 4. A switch that silences the local scheduler while the server
 * keeps delivering is not an unsubscribe. Partner cheers are the one live
 * optional category the server sends, and the Edge Function read neither
 * the toggle nor anything derived from it.
 */

const fs = require('fs');
const path = require('path');

const mockStore = new Map();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async k => (mockStore.has(k) ? mockStore.get(k) : null)),
    setItem: jest.fn(async (k, v) => { mockStore.set(k, String(v)); }),
    removeItem: jest.fn(async (k) => { mockStore.delete(k); }),
  },
}));
jest.mock('../../sync', () => ({ notePrefWrite: jest.fn() }));
jest.mock('../preferences', () => ({ setPreference: jest.fn(async () => {}) }));

const {
  isCategoryEnabled, setCategoryEnabled, CATEGORY_PREFS, NOTIF_PREFS_KEY,
} = require('../categoryPrefs');
const { CATEGORY } = require('../categories');
const { setPreference } = require('../preferences');

const SRC = f => fs.readFileSync(path.resolve(__dirname, f), 'utf8');

beforeEach(() => { mockStore.clear(); jest.clearAllMocks(); });

describe('C14-3 each live category has exactly one user-choice authority (11)', () => {
  test('every live user-controlled category is registered exactly once', () => {
    const registered = Object.keys(CATEGORY_PREFS);
    expect(registered).toContain(CATEGORY.TRAINING_REMINDER);
    expect(registered).toContain(CATEGORY.MORNING_WEIGHT);
    expect(registered).toContain(CATEGORY.WEEKLY_CHECKIN_REMINDER);
    expect(registered).toContain(CATEGORY.CHECKIN_MISSED);
    expect(registered).toContain(CATEGORY.PLANNED_MEAL_CONFIRM);
    expect(registered).toContain(CATEGORY.PARTNER_CHEER);
    expect(registered).toContain(CATEGORY.ACTIVATION_NUDGE);
    // SD-15: Community's two categories, same server-sendable shape as
    // partner cheer.
    expect(registered).toContain(CATEGORY.COMMUNITY_FOLLOW);
    expect(registered).toContain(CATEGORY.COMMUNITY_ACTIVITY);
    // One blob field per category, and no field serving two categories -
    // a shared field would be two switches fighting over one answer.
    const fields = registered.map(c => CATEGORY_PREFS[c].blobField);
    expect(new Set(fields).size).toBe(fields.length);
  });

  test('the authority is the blob; the projection row is never read back', async () => {
    mockStore.set(NOTIF_PREFS_KEY, JSON.stringify({ trainingEnabled: true }));
    expect(await isCategoryEnabled(CATEGORY.TRAINING_REMINDER)).toBe(true);

    mockStore.set(NOTIF_PREFS_KEY, JSON.stringify({ trainingEnabled: false }));
    expect(await isCategoryEnabled(CATEGORY.TRAINING_REMINDER)).toBe(false);

    // The read path must not consult the per-category table at all: doing
    // so would recreate the two disagreeing authorities.
    const src = SRC('../categoryPrefs.js');
    const start = src.indexOf('export async function isCategoryEnabled');
    const body = src.slice(start, src.indexOf('\n}', start));
    expect(body).not.toMatch(/getPreference|getAllPreferences/);
  });

  test('the legacy key answers only when the authority has never recorded it', async () => {
    // A pre-migration install: no blob field, dedicated key says on.
    mockStore.set('@volyume_reminder_enabled_v1', 'true');
    expect(await isCategoryEnabled(CATEGORY.TRAINING_REMINDER)).toBe(true);
    // Once the authority holds a value, the legacy key stops deciding.
    mockStore.set(NOTIF_PREFS_KEY, JSON.stringify({ trainingEnabled: false }));
    expect(await isCategoryEnabled(CATEGORY.TRAINING_REMINDER)).toBe(false);
  });

  test('a write moves the authority, the mirror and the projection together', async () => {
    await setCategoryEnabled('u1', CATEGORY.TRAINING_REMINDER, false, { timePref: '08:00' });
    expect(JSON.parse(mockStore.get(NOTIF_PREFS_KEY)).trainingEnabled).toBe(false);
    expect(mockStore.get('@volyume_reminder_enabled_v1')).toBe('false');
    expect(setPreference).toHaveBeenCalledWith('u1', CATEGORY.TRAINING_REMINDER, {
      enabled: false, time_pref: '08:00',
    });
  });

  test('a write merges, so a sibling screen’s field is never dropped', async () => {
    mockStore.set(NOTIF_PREFS_KEY, JSON.stringify({ missedCheckinEnabled: false, checkinDay: 3 }));
    await setCategoryEnabled('u1', CATEGORY.PARTNER_CHEER, false);
    const blob = JSON.parse(mockStore.get(NOTIF_PREFS_KEY));
    expect(blob.partnerCheerEnabled).toBe(false);
    expect(blob.missedCheckinEnabled).toBe(false);
    expect(blob.checkinDay).toBe(3);
  });

  test('every write stamps, so a stale device cannot revert the choice', async () => {
    // eslint-disable-next-line global-require
    const { notePrefWrite } = require('../../sync');
    await setCategoryEnabled('u1', CATEGORY.ACTIVATION_NUDGE, false);
    expect(notePrefWrite).toHaveBeenCalledWith(NOTIF_PREFS_KEY);
  });

  test('the training scheduler gates on the authority, not the dedicated key', () => {
    const src = SRC('../trainingReminders.js');
    expect(src).toMatch(/isCategoryEnabled\(CATEGORY\.TRAINING_REMINDER\)/);
    // The old direct read is gone, so the scheduler and the screen can no
    // longer answer the same question from different places.
    expect(src).not.toMatch(/const enabledRaw = await AsyncStorage\.getItem\(REMINDER_PREF_KEY\)/);
  });

  test('the Settings screen shows what the scheduler will actually do', () => {
    const src = SRC('../../../screens/NotificationSettingsScreen.js');
    expect(src).toMatch(/setTrainingEnabled\(await isCategoryEnabled\(CATEGORY\.TRAINING_REMINDER\)\)/);
  });
});

describe('C14-4 a real off switch exists for every optional category (12, 13, 14)', () => {
  test('the two forced-on coaching reminders now honour a user choice', () => {
    const src = SRC('../../../screens/CoachingRemindersScreen.js');
    // They used to schedule unconditionally and write enabled: true.
    expect(src).not.toMatch(/morningEnabled: true,\s*\n\s*checkinEnabled: true,/);
    expect(src).toMatch(/const morningOn = prefs\.morningEnabled !== false;/);
    expect(src).toMatch(/const checkinOn = prefs\.checkinEnabled !== false;/);
    expect(src).toContain('accessibilityLabel="Morning weight reminder toggle"');
    expect(src).toContain('accessibilityLabel="Weekly check-in reminder toggle"');
  });

  test('switching the weigh-in reminder off also stands the evening backstop down', () => {
    // The screen copy promises the 7.30 pm backstop "turns off with this
    // reminder". It has to be true.
    const src = SRC('../../../screens/CoachingRemindersScreen.js');
    expect(src).toMatch(/} else \{\s*\n\s*\/\/ The backstop rides the same switch[\s\S]*?await cancelEveningWeightReminder\(\);/);
  });

  test('defaults match what the schedulers already do, so nobody moves', async () => {
    // The opt-outs default on: an absent flag has always read as enabled.
    expect(CATEGORY_PREFS[CATEGORY.PARTNER_CHEER].defaultEnabled).toBe(true);
    expect(CATEGORY_PREFS[CATEGORY.CHECKIN_MISSED].defaultEnabled).toBe(true);
    expect(await isCategoryEnabled(CATEGORY.PARTNER_CHEER)).toBe(true);
    // SD-15: both Community categories default on, same as partner cheer.
    expect(CATEGORY_PREFS[CATEGORY.COMMUNITY_FOLLOW].defaultEnabled).toBe(true);
    expect(CATEGORY_PREFS[CATEGORY.COMMUNITY_ACTIVITY].defaultEnabled).toBe(true);
    expect(await isCategoryEnabled(CATEGORY.COMMUNITY_FOLLOW)).toBe(true);
    expect(await isCategoryEnabled(CATEGORY.COMMUNITY_ACTIVITY)).toBe(true);
    // The two coaching reminders default OFF because their field is seeded
    // by Pro onboarding, so absent means "not set up", exactly as
    // restoreNotifications has always read it. The authority must say what
    // the app does, not what would be tidier.
    expect(CATEGORY_PREFS[CATEGORY.MORNING_WEIGHT].defaultEnabled).toBe(false);
    expect(CATEGORY_PREFS[CATEGORY.WEEKLY_CHECKIN_REMINDER].defaultEnabled).toBe(false);
    expect(await isCategoryEnabled(CATEGORY.MORNING_WEIGHT)).toBe(false);
    // A set-up user is unaffected.
    mockStore.set(NOTIF_PREFS_KEY, JSON.stringify({ morningEnabled: true }));
    expect(await isCategoryEnabled(CATEGORY.MORNING_WEIGHT)).toBe(true);
  });

  test('the REMOTE partner-cheer path enforces the recipient’s opt-out (13)', () => {
    const fn = fs.readFileSync(
      path.resolve(__dirname, '../../../../supabase/functions/partner-cheer/index.ts'), 'utf8',
    );
    // Reads the recipient's own projection row, server-side, before send.
    expect(fn).toMatch(/from\('notification_preferences'\)/);
    expect(fn).toMatch(/\.eq\('category', 'partner_cheer'\)/);
    expect(fn).toMatch(/cheerPref\.enabled === false/);
    // The check must sit BEFORE the push fan-out, not after it.
    const prefIdx = fn.indexOf("'partner_cheer')");
    const pushIdx = fn.indexOf('functions/v1/send-push');
    expect(prefIdx).toBeGreaterThan(-1);
    expect(pushIdx).toBeGreaterThan(prefIdx);
  });

  test('the server never infers suppression from a device-local value', () => {
    const fn = fs.readFileSync(
      path.resolve(__dirname, '../../../../supabase/functions/partner-cheer/index.ts'), 'utf8',
    );
    expect(fn).not.toMatch(/@volyume_/);
    expect(fn).not.toMatch(/AsyncStorage/);
  });

  test('an opted-IN recipient still receives the push (14)', () => {
    // Absence of a row means the user never touched the toggle, which for
    // an opt-out control is consent. Only an explicit false blocks.
    const fn = fs.readFileSync(
      path.resolve(__dirname, '../../../../supabase/functions/partner-cheer/index.ts'), 'utf8',
    );
    expect(fn).toMatch(/if \(cheerPref && cheerPref\.enabled === false\)/);
  });

  test('a failed preference read holds the push rather than guessing', () => {
    const fn = fs.readFileSync(
      path.resolve(__dirname, '../../../../supabase/functions/partner-cheer/index.ts'), 'utf8',
    );
    expect(fn).toMatch(/if \(cheerPrefErr\) \{[\s\S]*?delivered: 'in_app'/);
  });

  test('mandatory transactional messages gain no opt-out', () => {
    // Payment failure is the live server-sent category besides cheers.
    // The campaign is about optional engagement notifications only.
    const registered = Object.keys(CATEGORY_PREFS);
    expect(registered).not.toContain(CATEGORY.SUBSCRIPTION_PAYMENT_FAILURE);
    expect(registered).not.toContain(CATEGORY.CASCADE_GATE);
    expect(registered).not.toContain(CATEGORY.ED_PATTERN_LOCKOUT);
  });
});

describe('C14 the live matrix — a new category cannot slip through unclassified', () => {
  // Every category in the enum must be a deliberate one of two things:
  // user-controlled (registered in CATEGORY_PREFS, so it has an authority,
  // a projection and a switch) or not user-controlled, for a stated
  // reason. Adding a category to categories.js without deciding which
  // fails HERE, which is the point: the old failure mode was a
  // notification shipping with a reader, no writer and no way off.
  const NOT_USER_CONTROLLED = {
    // Mandatory transactional / account integrity. No opt-out by policy.
    [CATEGORY.SUBSCRIPTION_PAYMENT_FAILURE]: 'transactional: a failed charge',
    [CATEGORY.SUBSCRIPTION_EXPIRING]: 'transactional: the subscription is ending',
    [CATEGORY.CASCADE_GATE]: 'account integrity: entitlement change',
    [CATEGORY.COACH_TRIAL_ENDING]: 'transactional: the trial is ending',
    [CATEGORY.TRIAL_DAY3]: 'trial lifecycle, single-shot',
    // Safety surfaces. In-app only by policy; a switch would be a way to
    // turn safety off, which is never offered.
    [CATEGORY.ED_PATTERN_LOCKOUT]: 'safety, in-app only',
    [CATEGORY.FFM_FLOOR_HOLD]: 'safety, in-app only',
    // Diagnostics and in-session UI, not recurring engagement.
    [CATEGORY.SYNC_ERROR]: 'in-app diagnostic',
    [CATEGORY.REST_TIMER]: 'live in-session timer the user started',
    // Single-shot or self-limiting, driven by an action the user took.
    [CATEGORY.YEAR_OF_LIFTS_UNLOCK]: 'one-off unlock',
    [CATEGORY.MONTHLY_RECAP]: 'periodic recap, no live scheduler switch',
    [CATEGORY.WINBACK]: 'single-shot per episode, floored at 180 days',
    [CATEGORY.WEEKLY_COACH_READY]: 'the coach run the user asked for',
    // DAILY_CHECKIN_REMINDER entry removed (Campaign 24 Wave F LEAD RULING
    // item 3): the category no longer exists in categories.js (it was a
    // phantom declaration -- no schedule* function ever created it). This
    // NOT_USER_CONTROLLED map only classifies categories that still exist.
    [CATEGORY.EVENING_WEIGHT]: 'rides the morning weigh-in switch',
    // Own dedicated preference structure, not a single on/off flag.
    [CATEGORY.MEAL_LOG_REMINDER]: 'per-meal array, its own control',
  };

  test('every category is either user-controlled or explicitly not', () => {
    const unclassified = Object.values(CATEGORY).filter(
      c => !CATEGORY_PREFS[c] && !NOT_USER_CONTROLLED[c],
    );
    expect(unclassified).toEqual([]);
  });

  test('nothing is classified both ways', () => {
    const both = Object.keys(NOT_USER_CONTROLLED).filter(c => CATEGORY_PREFS[c]);
    expect(both).toEqual([]);
  });
});

describe('C14-4 restore, quiet hours and the Campaign 1 guarantees survive (15-18)', () => {
  test('restore cannot re-enable a category the user disabled (15)', async () => {
    // restoreNotifications re-lays from the blob, which IS the authority,
    // so a disabled category is simply not laid. Pinned as behaviour: the
    // read used by every scheduler returns false after an off.
    await setCategoryEnabled('u1', CATEGORY.CHECKIN_MISSED, false);
    expect(await isCategoryEnabled(CATEGORY.CHECKIN_MISSED)).toBe(false);
    const scheduler = SRC('../scheduler.js');
    expect(scheduler).toMatch(/prefs\.missedCheckinEnabled === false/);
    expect(scheduler).toMatch(/prefs\.activationNudgeEnabled === false/);
    expect(scheduler).toMatch(/prefs\.plannedMealConfirmEnabled === false/);
  });

  test('quiet hours remain authoritative and separately owned (16)', () => {
    // Quiet hours are a window, not a category switch, and must not have
    // been folded into the category registry by this campaign.
    const registered = Object.values(CATEGORY_PREFS).map(v => v.blobField);
    expect(registered).not.toContain('quietHours');
    const quiet = SRC('../quietHours.js');
    expect(quiet).toMatch(/@volyume_quiet_hours_v1/);
  });

  test('the Campaign 1 meal-reminder restoration is untouched (17)', () => {
    // Meal reminders keep their own array key and their own restore path.
    const scheduler = SRC('../scheduler.js');
    expect(scheduler).toMatch(/MEAL_REMINDERS_KEY/);
    const registered = Object.values(CATEGORY_PREFS).map(v => v.blobField);
    expect(registered).not.toContain('mealReminders');
  });

  test('no cardio notification is resurrected (18)', () => {
    const registered = Object.keys(CATEGORY_PREFS).join(' ');
    expect(registered).not.toMatch(/cardio/i);
    // eslint-disable-next-line global-require
    const { CATEGORY: ALL } = require('../categories');
    expect(Object.values(ALL).join(' ')).not.toMatch(/cardio/i);
  });
});
