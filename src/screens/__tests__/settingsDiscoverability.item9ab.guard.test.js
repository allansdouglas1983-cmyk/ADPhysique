/**
 * Item 9 (D141, founder order 2026-09-04), parts (a) and (b): reminder
 * settings discoverability.
 *
 * (a) SettingsScreen had two rows -- "Notifications and reminders" and
 *     "Coaching reminders" -- whose subtitles both mentioned "check-ins",
 *     even though only CoachingRemindersScreen owns any check-in reminder
 *     (weekly check-in + its follow-up); NotificationSettingsScreen's own
 *     check-in toggles were removed and moved there. Pins that the
 *     overlapping word is gone from the row that does not own it, and that
 *     each subtitle names only what its destination screen actually
 *     controls.
 * (b) NotificationSettingsScreen already links forward to Coaching
 *     reminders; CoachingRemindersScreen had no reciprocal link, only a
 *     code comment. Pins the new cross-link row exists, targets
 *     NotificationSettings, and reuses the copied crossLink/crossLinkTitle/
 *     crossLinkSub style trio rather than inventing new styles.
 *
 * Per repo convention (source-level guards, not a render test).
 */
const fs = require('fs');
const path = require('path');

const SETTINGS = fs.readFileSync(path.join(__dirname, '..', 'SettingsScreen.js'), 'utf8');
const COACHING_REMINDERS = fs.readFileSync(path.join(__dirname, '..', 'CoachingRemindersScreen.js'), 'utf8');
const NOTIF_SETTINGS = fs.readFileSync(path.join(__dirname, '..', 'NotificationSettingsScreen.js'), 'utf8');

describe('Item 9(a): SettingsScreen subtitles no longer overlap on "check-ins"', () => {
  test('the Notifications and reminders row subtitle drops "check-in" (not owned there)', () => {
    const site = SETTINGS.indexOf("label=\"Notifications and reminders\"");
    expect(site).toBeGreaterThan(-1);
    const window = SETTINGS.slice(site, site + 200);
    const subMatch = window.match(/sub="([^"]*)"/);
    expect(subMatch).not.toBeNull();
    expect(subMatch[1]).not.toMatch(/check-in/i);
  });

  test('the Coaching reminders row subtitle keeps naming its check-in ownership', () => {
    const site = SETTINGS.indexOf('label="Coaching reminders"');
    expect(site).toBeGreaterThan(-1);
    const window = SETTINGS.slice(site, site + 200);
    const subMatch = window.match(/sub="([^"]*)"/);
    expect(subMatch).not.toBeNull();
    expect(subMatch[1]).toMatch(/check-in/i);
  });
});

describe('Item 9(b): CoachingRemindersScreen carries the reciprocal cross-link to NotificationSettings', () => {
  test('receives navigation and navigates to NotificationSettings on tap', () => {
    expect(COACHING_REMINDERS).toMatch(/export default function CoachingRemindersScreen\(\{ navigation \}\)/);
    expect(COACHING_REMINDERS).toMatch(/onPress=\{\(\) => navigation\.navigate\('NotificationSettings'\)\}/);
  });

  test('reuses the copied crossLink style trio, matching NotificationSettingsScreen\'s own cross-link values', () => {
    expect(COACHING_REMINDERS).toMatch(/style=\{\[styles\.crossLink, live\.crossLink\]\}/);
    for (const key of ['crossLink', 'crossLinkTitle', 'crossLinkSub']) {
      expect(COACHING_REMINDERS).toMatch(new RegExp(`${key}:\\s*\\{`));
    }
    // Values copied, not invented: same background/border tokens both static
    // and live, matching NotificationSettingsScreen's own definitions.
    expect(COACHING_REMINDERS).toMatch(/crossLink: \{ backgroundColor: t\.colors\.surface2, borderColor: t\.colors\.border \}/);
    expect(NOTIF_SETTINGS).toMatch(/crossLink: \{ backgroundColor: t\.colors\.surface2, borderColor: t\.colors\.border \}/);
  });

  test('the subtitle names only what NotificationSettingsScreen owns', () => {
    const site = COACHING_REMINDERS.indexOf("navigate('NotificationSettings')");
    expect(site).toBeGreaterThan(-1);
    const window = COACHING_REMINDERS.slice(site, site + 700);
    expect(window).toMatch(/Training reminder, meal reminders and quiet hours\./);
  });
});
