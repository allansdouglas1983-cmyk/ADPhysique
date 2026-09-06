/**
 * communityCategories.test.js — SD-15 (blueprint §7, 40-DECISIONS.md).
 *
 * Pins the two Community notification categories exactly as the blueprint
 * specifies them, in isolation from the wider Campaign 14 suites (which
 * derive their live-type inventory from what the emitters currently bake in,
 * and community-notify is a separate lane's Edge Function, not yet an
 * emitter this repo can read):
 *
 *   - both categories exist on the CATEGORY enum;
 *   - both are budgeted (present in EVENT_PRIORITY, after PARTNER_CHEER);
 *   - both route to HomeTab / CommunityActivity with a notification source;
 *   - both channel sets are PUSH + IN_APP;
 *   - both prefs default true.
 */

const { CATEGORY, CATEGORY_CHANNELS, CHANNEL, categoryForDataType } = require('../categories');
const { EVENT_PRIORITY, isEventCategory } = require('../budget');
const { routeForNotificationType } = require('../notificationRoute');
const { CATEGORY_PREFS, isCategoryEnabled } = require('../categoryPrefs');

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => {}),
    removeItem: jest.fn(async () => {}),
  },
}));

describe('SD-15: COMMUNITY_FOLLOW and COMMUNITY_ACTIVITY exist', () => {
  test('both category values are registered', () => {
    expect(CATEGORY.COMMUNITY_FOLLOW).toBe('community_follow');
    expect(CATEGORY.COMMUNITY_ACTIVITY).toBe('community_activity');
  });

  test('categoryForDataType resolves both data.type strings', () => {
    expect(categoryForDataType('community_follow')).toBe(CATEGORY.COMMUNITY_FOLLOW);
    expect(categoryForDataType('community_activity')).toBe(CATEGORY.COMMUNITY_ACTIVITY);
  });
});

describe('SD-15: both are budgeted, after PARTNER_CHEER', () => {
  test('both sit in EVENT_PRIORITY', () => {
    expect(isEventCategory(CATEGORY.COMMUNITY_FOLLOW)).toBe(true);
    expect(isEventCategory(CATEGORY.COMMUNITY_ACTIVITY)).toBe(true);
  });

  test('both rank below PARTNER_CHEER (higher index = lower priority)', () => {
    const partnerCheerIdx = EVENT_PRIORITY.indexOf(CATEGORY.PARTNER_CHEER);
    expect(EVENT_PRIORITY.indexOf(CATEGORY.COMMUNITY_FOLLOW)).toBeGreaterThan(partnerCheerIdx);
    expect(EVENT_PRIORITY.indexOf(CATEGORY.COMMUNITY_ACTIVITY)).toBeGreaterThan(partnerCheerIdx);
  });
});

describe('SD-15: both route to the Community Activity screen', () => {
  test('community_follow', () => {
    expect(routeForNotificationType('community_follow')).toEqual({
      tab: 'HomeTab', screen: 'CommunityActivity', params: { source: 'notification' },
    });
  });

  test('community_activity', () => {
    expect(routeForNotificationType('community_activity')).toEqual({
      tab: 'HomeTab', screen: 'CommunityActivity', params: { source: 'notification' },
    });
  });
});

describe('SD-15: both channel sets are PUSH + IN_APP', () => {
  test('community_follow', () => {
    expect(CATEGORY_CHANNELS[CATEGORY.COMMUNITY_FOLLOW]).toEqual([CHANNEL.PUSH, CHANNEL.IN_APP]);
  });

  test('community_activity', () => {
    expect(CATEGORY_CHANNELS[CATEGORY.COMMUNITY_ACTIVITY]).toEqual([CHANNEL.PUSH, CHANNEL.IN_APP]);
  });
});

describe('SD-15: both prefs default true', () => {
  test('CATEGORY_PREFS default is true', () => {
    expect(CATEGORY_PREFS[CATEGORY.COMMUNITY_FOLLOW].defaultEnabled).toBe(true);
    expect(CATEGORY_PREFS[CATEGORY.COMMUNITY_ACTIVITY].defaultEnabled).toBe(true);
  });

  test('an untouched install reads both as enabled', async () => {
    expect(await isCategoryEnabled(CATEGORY.COMMUNITY_FOLLOW)).toBe(true);
    expect(await isCategoryEnabled(CATEGORY.COMMUNITY_ACTIVITY)).toBe(true);
  });
});
