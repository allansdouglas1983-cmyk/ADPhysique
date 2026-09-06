/**
 * Deep-link routing — the navigator's REAL linking config, resolved through
 * the same `getStateFromPath` the navigator installs.
 *
 * What this pins: every URL the app itself mints or hands to the OS resolves
 * to a registered route in the right tab, with the params that route reads.
 * The config is read out of RootNavigator.js rather than restated here, so a
 * path deleted or renamed in the navigator fails this suite instead of
 * quietly passing against a copy.
 *
 * Why it exists: route-graph certification 2026-09-05.
 *   A2 — the retired Partners feature minted volyume://partner/<CODE> and
 *        https://volyume.app/partner/<CODE>, app.json carries the autoVerify
 *        intent filter for /partner, and the old PartnerScreen read
 *        route.params.code — but no path in the config matched, so the whole
 *        invite path was unwired and the code had to be typed by hand.
 *   A3 — the Android foreground-service notification hands
 *        volyume://active-workout to the OS
 *        (lib/notifications/activeWorkout.js:152) and nothing matched it.
 *
 * Params are asserted, not just route names: A2's sibling failure (audit
 * 2026-07-01) was a path whose param was named `:id` while the screen read
 * `planId`, which routes perfectly and dead-ends on a blank screen.
 *
 * AMENDED 2026-09-06 (social-discovery blueprint sections 1 and 8):
 *   - The partner invite path now lands on Community with the code in hand,
 *     so an old share message opens the "Partner invites have moved" card
 *     instead of a screen that no longer has a home. React Navigation 6
 *     allows one path per screen and Community already owns `community`, so
 *     the remap is a rewrite in front of the resolver
 *     (`rewriteLegacyCommunityPath`) rather than a second config entry. The
 *     rewrite is READ OUT OF RootNavigator.js and evaluated here, the same
 *     way the config below is, so a change to it fails this suite rather
 *     than quietly passing against a copy.
 *   - The three Community share pages (`u`, `p`, `s`) carry their argument
 *     as a QUERY, because the site is static GitHub Pages with no path
 *     rewriting.
 */
const fs = require('fs');
const path = require('path');

const { safeGetStateFromPath } = require('../safeGetStateFromPath');

const extractPathFromURL = require(
  '@react-navigation/native/lib/commonjs/extractPathFromURL',
).default;

const ROOT_NAVIGATOR = path.join(__dirname, '..', 'RootNavigator.js');
const source = fs.readFileSync(ROOT_NAVIGATOR, 'utf8');

/**
 * Strip line comments outside string literals, so a `{` written inside an
 * explanatory comment cannot throw the brace count off.
 */
function stripLineComments(src) {
  return src.split('\n').map((line) => {
    let quote = null;
    for (let i = 0; i < line.length; i += 1) {
      const c = line[i];
      if (quote) {
        if (c === '\\') { i += 1; continue; }
        if (c === quote) quote = null;
        continue;
      }
      if (c === '\'' || c === '"' || c === '`') { quote = c; continue; }
      if (c === '/' && line[i + 1] === '/') return line.slice(0, i);
    }
    return line;
  }).join('\n');
}

/** Extract the `config: { ... }` object literal from the `linking` constant. */
function readLinkingConfig(src) {
  const clean = stripLineComments(src);
  const start = clean.indexOf('const linking = {');
  if (start < 0) throw new Error('linking constant not found in RootNavigator.js');
  const configAt = clean.indexOf('config: {', start);
  if (configAt < 0) throw new Error('linking.config not found in RootNavigator.js');
  const open = clean.indexOf('{', configAt);
  let depth = 0;
  let quote = null;
  for (let i = open; i < clean.length; i += 1) {
    const c = clean[i];
    if (quote) {
      if (c === '\\') { i += 1; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '\'' || c === '"' || c === '`') { quote = c; continue; }
    if (c === '{') depth += 1;
    if (c === '}') {
      depth -= 1;
      // eslint-disable-next-line no-eval
      if (depth === 0) return eval(`(${clean.slice(open, i + 1)})`);
    }
  }
  throw new Error('linking.config braces never closed');
}

/** Extract one named top-level function declaration's source text. */
function readFunctionSource(src, name) {
  const clean = stripLineComments(src);
  const at = clean.indexOf(`function ${name}(`);
  if (at < 0) throw new Error(`${name} not found in RootNavigator.js`);
  const open = clean.indexOf('{', at);
  let depth = 0;
  let quote = null;
  for (let i = open; i < clean.length; i += 1) {
    const c = clean[i];
    if (quote) {
      if (c === '\\') { i += 1; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '\'' || c === '"' || c === '`') { quote = c; continue; }
    if (c === '{') depth += 1;
    if (c === '}') {
      depth -= 1;
      if (depth === 0) return clean.slice(at, i + 1);
    }
  }
  throw new Error(`${name} braces never closed`);
}

const config = readLinkingConfig(source);
// The legacy-path rewrite the navigator installs in front of the resolver,
// evaluated together with the regex constant it closes over (declared
// immediately above it in the source) so the pair runs exactly as written.
// eslint-disable-next-line no-eval
const rewriteLegacyCommunityPath = eval(`(() => {
  ${source.match(/^const LEGACY_PARTNER_PATH = .*$/m)[0]}
  ${readFunctionSource(source, 'rewriteLegacyCommunityPath')}
  return rewriteLegacyCommunityPath;
})()`);
const PREFIXES = ['volyume://', 'https://volyume.app'];

/** The exact pair the navigator uses: prefix extraction, then its resolver. */
function routeFor(url) {
  const p = extractPathFromURL(PREFIXES, url);
  if (p === undefined) return undefined;
  const state = safeGetStateFromPath(rewriteLegacyCommunityPath(p), config);
  // Walk to the deepest route: [MainTabs-level tab] → [stack screen].
  let route = state?.routes?.[0];
  const tab = route?.name;
  while (route?.state?.routes?.length) route = route.state.routes[route.state.routes.length - 1];
  return route ? { tab, name: route.name, params: route.params } : undefined;
}

describe('linking config — legacy partner invite links now open Community', () => {
  test.each([
    'volyume://partner/ABCD12',
    'https://volyume.app/partner/ABCD12',
  ])('%s opens Community in the Home tab with the legacy code', (url) => {
    expect(routeFor(url)).toEqual({
      tab: 'HomeTab',
      name: 'Community',
      params: { legacyPartnerCode: 'ABCD12' },
    });
  });

  test('a real server-issued code still arrives intact', () => {
    // Codes were uppercase hex, 8 characters or more. Community does not
    // redeem one; it carries it so the "Partner invites have moved" card
    // knows the link was an invite. Partners itself retired on 2026-09-06
    // (SD-03), so nothing parses the code any more, but links already out
    // in share messages must still resolve.
    const route = routeFor('volyume://partner/9F3A1C7B');

    expect(route).toMatchObject({ name: 'Community', params: { legacyPartnerCode: '9F3A1C7B' } });
    expect(route.params.legacyPartnerCode).toBe('9F3A1C7B');
  });

  test('a bare partner link still resolves, to Community with no code', () => {
    expect(routeFor('volyume://partner')).toMatchObject({
      tab: 'HomeTab',
      name: 'Community',
    });
  });

  test('the Partner route is no longer a deep-link destination', () => {
    // Retired outright on 2026-09-06 (SD-03): the screen and its
    // registration are gone, so there is nothing left to link to.
    expect(config.screens.ProgressTab.screens.Partner).toBeUndefined();
    expect(source).not.toMatch(/<Stack\.Screen name="Partner"/);
  });
});

describe('linking config — Community share links (blueprint section 8)', () => {
  test('volyume://community opens the hub', () => {
    expect(routeFor('volyume://community')).toMatchObject({
      tab: 'HomeTab',
      name: 'Community',
    });
  });

  test.each([
    ['https://volyume.app/u/?h=rowan_lifts', 'CommunityProfile', { h: 'rowan_lifts' }],
    ['https://volyume.app/p/?id=prog-1', 'CommunityProgramme', { id: 'prog-1' }],
    ['https://volyume.app/s/?id=post-1', 'CommunityPost', { id: 'post-1' }],
  ])('%s opens %s with its query param', (url, name, params) => {
    expect(routeFor(url)).toMatchObject({ tab: 'HomeTab', name, params });
  });

  test('the app-scheme forms resolve the same way', () => {
    expect(routeFor('volyume://u/?h=priya')).toMatchObject({
      name: 'CommunityProfile',
      params: { h: 'priya' },
    });
  });
});

describe('linking config — active workout notification (A3)', () => {
  // The foreground-service notification survives a force-close, so this can
  // arrive on a cold start with no session in memory. It maps to Today, which
  // rehydrates the session (HomeScreen restoreActiveWorkout) and shows the
  // "Continue active workout" card — not to ActiveWorkout, which would mount
  // with nothing to show.
  test('volyume://active-workout opens the Today tab root', () => {
    expect(routeFor('volyume://active-workout')).toMatchObject({
      tab: 'HomeTab',
      name: 'Home',
    });
  });
});

describe('linking config — existing paths still resolve', () => {
  test.each([
    ['volyume://workout/start', 'HomeTab', 'BuildWorkout'],
    ['volyume://diary/2026-09-02', 'DiaryTab', 'Diary'],
    ['volyume://routine/plan-7', 'PlansTab', 'PlanDetail'],
    ['volyume://progress', 'ProgressTab', 'Analytics'],
    ['volyume://coach', 'ProfileTab', 'CoachOutput'],
    ['volyume://checkin', 'ProfileTab', 'WeeklyCheckIn'],
  ])('%s → %s / %s', (url, tab, name) => {
    expect(routeFor(url)).toMatchObject({ tab, name });
  });

  test('the plan deep link still names the param PlanDetailScreen reads', () => {
    expect(routeFor('volyume://routine/plan-7').params).toEqual({ planId: 'plan-7' });
  });

  test('an unowned host is still rejected', () => {
    expect(routeFor('https://evil.example/partner/9F3A1C7B')).toBeUndefined();
  });

  // Vacuity guard: a parse that silently stopped matching would let every
  // assertion above run against an empty config and fail loudly rather than
  // pass — but an over-permissive parse (e.g. one that returned `{}`) is
  // caught here, at the source.
  test('the config was actually parsed out of RootNavigator.js', () => {
    expect(Object.keys(config.screens).sort())
      .toEqual(['DiaryTab', 'HomeTab', 'PlansTab', 'ProfileTab', 'ProgressTab']);
    expect(config.screens.HomeTab.screens.Home).toBe('active-workout');
    expect(config.screens.HomeTab.screens.Community).toBe('community');
  });

  // Same vacuity guard, for the rewrite: an extraction that stopped matching
  // would leave every legacy-link assertion above running against an
  // identity function.
  test('the legacy rewrite was actually read out of RootNavigator.js', () => {
    expect(rewriteLegacyCommunityPath('partner/ABCD12'))
      .toBe('community?legacyPartnerCode=ABCD12');
    expect(rewriteLegacyCommunityPath('diary/2026-09-02')).toBe('diary/2026-09-02');
  });
});

// ─── APPENDED 2026-09-06 (product review, item 23) ──────────────────────
//
// The "Open in Volyume" button on the three static share pages hands the OS
// exactly the string `src/lib/community/links.js` builds. That exact form
// (`volyume://p/?id=`, with the slash before the query) was never resolved
// through the real config, and the pages were emitting `volyume://p?id=`.
// The URLs here are BUILT BY links.js rather than typed out, so the app
// form and the route it must reach can never drift apart again.
describe('linking config — the exact app-scheme forms links.js builds', () => {
  const {
    appProfileUrl, appProgrammeUrl, appStoryUrl,
  } = require('../../lib/community/links');

  test.each([
    [appProgrammeUrl('prog-1'), 'CommunityProgramme', { id: 'prog-1' }],
    [appProfileUrl('rowan_lifts'), 'CommunityProfile', { h: 'rowan_lifts' }],
    [appStoryUrl('post-1'), 'CommunityPost', { id: 'post-1' }],
  ])('%s resolves to %s with its param', (url, name, params) => {
    expect(url).toContain('/?');
    expect(routeFor(url)).toMatchObject({ tab: 'HomeTab', name, params });
  });
});
