/**
 * communityCategories.test.js — SD-15 (blueprint §7, 40-DECISIONS.md) and
 * SD-21 (blueprint §2, messaging).
 *
 * Pins the Community notification categories exactly as the blueprint
 * specifies them, in isolation from the wider Campaign 14 suites (which
 * derive their live-type inventory from what the emitters currently bake in,
 * and community-notify is a separate lane's Edge Function, not yet an
 * emitter this repo can read):
 *
 *   - all three categories exist on the CATEGORY enum;
 *   - all three are budgeted (present in EVENT_PRIORITY, after PARTNER_CHEER);
 *   - COMMUNITY_MESSAGE ranks above COMMUNITY_FOLLOW and COMMUNITY_ACTIVITY;
 *   - COMMUNITY_FOLLOW / COMMUNITY_ACTIVITY route to HomeTab /
 *     CommunityActivity with a notification source; COMMUNITY_MESSAGE routes
 *     to HomeTab / CommunityConversation with the conversation id;
 *   - all three channel sets are PUSH + IN_APP;
 *   - all three prefs default true.
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

describe('SD-15/SD-21: COMMUNITY_FOLLOW, COMMUNITY_ACTIVITY and COMMUNITY_MESSAGE exist', () => {
  test('all three category values are registered', () => {
    expect(CATEGORY.COMMUNITY_FOLLOW).toBe('community_follow');
    expect(CATEGORY.COMMUNITY_ACTIVITY).toBe('community_activity');
    expect(CATEGORY.COMMUNITY_MESSAGE).toBe('community_message');
  });

  test('categoryForDataType resolves all three data.type strings', () => {
    expect(categoryForDataType('community_follow')).toBe(CATEGORY.COMMUNITY_FOLLOW);
    expect(categoryForDataType('community_activity')).toBe(CATEGORY.COMMUNITY_ACTIVITY);
    expect(categoryForDataType('community_message')).toBe(CATEGORY.COMMUNITY_MESSAGE);
  });
});

describe('SD-15/SD-21: all three are budgeted, after PARTNER_CHEER', () => {
  test('all three sit in EVENT_PRIORITY', () => {
    expect(isEventCategory(CATEGORY.COMMUNITY_FOLLOW)).toBe(true);
    expect(isEventCategory(CATEGORY.COMMUNITY_ACTIVITY)).toBe(true);
    expect(isEventCategory(CATEGORY.COMMUNITY_MESSAGE)).toBe(true);
  });

  test('all three rank below PARTNER_CHEER (higher index = lower priority)', () => {
    const partnerCheerIdx = EVENT_PRIORITY.indexOf(CATEGORY.PARTNER_CHEER);
    expect(EVENT_PRIORITY.indexOf(CATEGORY.COMMUNITY_FOLLOW)).toBeGreaterThan(partnerCheerIdx);
    expect(EVENT_PRIORITY.indexOf(CATEGORY.COMMUNITY_ACTIVITY)).toBeGreaterThan(partnerCheerIdx);
    expect(EVENT_PRIORITY.indexOf(CATEGORY.COMMUNITY_MESSAGE)).toBeGreaterThan(partnerCheerIdx);
  });

  test('SD-21: COMMUNITY_MESSAGE outranks COMMUNITY_FOLLOW and COMMUNITY_ACTIVITY', () => {
    // A message from a connected person outranks a reaction/follow beat.
    const messageIdx = EVENT_PRIORITY.indexOf(CATEGORY.COMMUNITY_MESSAGE);
    expect(messageIdx).toBeLessThan(EVENT_PRIORITY.indexOf(CATEGORY.COMMUNITY_FOLLOW));
    expect(messageIdx).toBeLessThan(EVENT_PRIORITY.indexOf(CATEGORY.COMMUNITY_ACTIVITY));
  });
});

describe('SD-15: COMMUNITY_FOLLOW and COMMUNITY_ACTIVITY route to the Community Activity screen', () => {
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

describe('SD-21: COMMUNITY_MESSAGE routes to the conversation it names', () => {
  test('community_message with conversation_id', () => {
    expect(routeForNotificationType('community_message', { conversation_id: 'conv-1' })).toEqual({
      tab: 'HomeTab', screen: 'CommunityConversation', params: { id: 'conv-1', source: 'notification' },
    });
  });

  test('community_message reads the camelCase field too', () => {
    expect(routeForNotificationType('community_message', { conversationId: 'conv-2' })).toEqual({
      tab: 'HomeTab', screen: 'CommunityConversation', params: { id: 'conv-2', source: 'notification' },
    });
  });

  test('community_message with no id data still routes, with a null id rather than throwing', () => {
    expect(routeForNotificationType('community_message')).toEqual({
      tab: 'HomeTab', screen: 'CommunityConversation', params: { id: null, source: 'notification' },
    });
  });
});

describe('SD-15/SD-21: all three channel sets are PUSH + IN_APP', () => {
  test('community_follow', () => {
    expect(CATEGORY_CHANNELS[CATEGORY.COMMUNITY_FOLLOW]).toEqual([CHANNEL.PUSH, CHANNEL.IN_APP]);
  });

  test('community_activity', () => {
    expect(CATEGORY_CHANNELS[CATEGORY.COMMUNITY_ACTIVITY]).toEqual([CHANNEL.PUSH, CHANNEL.IN_APP]);
  });

  test('community_message', () => {
    expect(CATEGORY_CHANNELS[CATEGORY.COMMUNITY_MESSAGE]).toEqual([CHANNEL.PUSH, CHANNEL.IN_APP]);
  });
});

describe('SD-15/SD-21: all three prefs default true', () => {
  test('CATEGORY_PREFS default is true', () => {
    expect(CATEGORY_PREFS[CATEGORY.COMMUNITY_FOLLOW].defaultEnabled).toBe(true);
    expect(CATEGORY_PREFS[CATEGORY.COMMUNITY_ACTIVITY].defaultEnabled).toBe(true);
    expect(CATEGORY_PREFS[CATEGORY.COMMUNITY_MESSAGE].defaultEnabled).toBe(true);
  });

  test('an untouched install reads all three as enabled', async () => {
    expect(await isCategoryEnabled(CATEGORY.COMMUNITY_FOLLOW)).toBe(true);
    expect(await isCategoryEnabled(CATEGORY.COMMUNITY_ACTIVITY)).toBe(true);
    expect(await isCategoryEnabled(CATEGORY.COMMUNITY_MESSAGE)).toBe(true);
  });
});
