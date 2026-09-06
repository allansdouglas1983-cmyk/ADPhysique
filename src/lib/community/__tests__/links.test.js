/**
 * What this suite pins (blueprint sections 5.6, 8; SD-16):
 *
 *  - the three addresses build in the query form the static site needs
 *    (`/u/?h=`, `/p/?id=`, `/s/?id=`), web and app scheme alike;
 *  - build and parse round-trip, including a handle or id that needs
 *    percent-encoding;
 *  - the host is matched EXACTLY. A `startsWith` test would accept
 *    `volyume.app.attacker.example`, which is the house rule
 *    `authDeepLink.isVolyumeLink` already holds.
 */

const {
  WEB_ORIGIN, profileUrl, programmeUrl, storyUrl,
  appProfileUrl, appProgrammeUrl, appStoryUrl, parseCommunityLink,
} = require('../links');

describe('building', () => {
  test('the web forms are the query shape the static site can serve', () => {
    expect(WEB_ORIGIN).toBe('https://volyume.app');
    expect(profileUrl('alex_lifts')).toBe('https://volyume.app/u/?h=alex_lifts');
    expect(programmeUrl('abc-123')).toBe('https://volyume.app/p/?id=abc-123');
    expect(storyUrl('def-456')).toBe('https://volyume.app/s/?id=def-456');
  });

  test('the app forms carry the same path and query on the volyume scheme', () => {
    expect(appProfileUrl('alex_lifts')).toBe('volyume://u/?h=alex_lifts');
    expect(appProgrammeUrl('abc-123')).toBe('volyume://p/?id=abc-123');
    expect(appStoryUrl('def-456')).toBe('volyume://s/?id=def-456');
  });

  test('a value needing encoding is encoded', () => {
    expect(programmeUrl('a b&c')).toBe('https://volyume.app/p/?id=a%20b%26c');
  });
});

describe('parsing', () => {
  test.each([
    ['profile', 'alex_lifts', profileUrl, 'handle'],
    ['programme', 'abc-123', programmeUrl, 'id'],
    ['story', 'def-456', storyUrl, 'id'],
  ])('%s round-trips through the web form', (kind, value, build, field) => {
    expect(parseCommunityLink(build(value))).toEqual({ kind, [field]: value });
  });

  test.each([
    ['profile', 'alex_lifts', appProfileUrl, 'handle'],
    ['programme', 'abc-123', appProgrammeUrl, 'id'],
    ['story', 'def-456', appStoryUrl, 'id'],
  ])('%s round-trips through the app form', (kind, value, build, field) => {
    expect(parseCommunityLink(build(value))).toEqual({ kind, [field]: value });
  });

  test('a percent-encoded id decodes back to itself', () => {
    expect(parseCommunityLink(programmeUrl('a b&c'))).toEqual({ kind: 'programme', id: 'a b&c' });
  });

  test('a handle is lowercased on the way in', () => {
    expect(parseCommunityLink('https://volyume.app/u/?h=ALEX')).toEqual({ kind: 'profile', handle: 'alex' });
  });

  test('the path works with or without its trailing slash', () => {
    expect(parseCommunityLink('https://volyume.app/p?id=x')).toEqual({ kind: 'programme', id: 'x' });
    expect(parseCommunityLink('https://volyume.app/p/?id=x')).toEqual({ kind: 'programme', id: 'x' });
  });

  test('a look-alike host is refused, never prefix-matched', () => {
    expect(parseCommunityLink('https://volyume.app.attacker.example/p/?id=x')).toBeNull();
    expect(parseCommunityLink('https://notvolyume.app/p/?id=x')).toBeNull();
    expect(parseCommunityLink('https://evil.example/?next=https://volyume.app/p/?id=x')).toBeNull();
  });

  test('http is not https and is refused', () => {
    expect(parseCommunityLink('http://volyume.app/p/?id=x')).toBeNull();
  });

  test('a Community path with no value is not a link', () => {
    expect(parseCommunityLink('https://volyume.app/u/')).toBeNull();
    expect(parseCommunityLink('https://volyume.app/p/?id=')).toBeNull();
  });

  test('other Volyume paths are not Community links', () => {
    expect(parseCommunityLink('https://volyume.app/partner/ABCDEF1234')).toBeNull();
    expect(parseCommunityLink('https://volyume.app/')).toBeNull();
  });

  test('rubbish input is null, not a throw', () => {
    expect(parseCommunityLink(null)).toBeNull();
    expect(parseCommunityLink('')).toBeNull();
    expect(parseCommunityLink('not a url')).toBeNull();
  });
});
