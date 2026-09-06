/**
 * C8 phase 1 (founder-accepted marketing sequence, 2026-07-11): coarse
 * first-touch attribution. Pins the founder's scope exactly — incoming
 * deep-link source → persist first touch → attach coarse source to
 * first-workout telemetry — and the privacy shape that makes it safe:
 *
 *  - the token is only ever a sanitised lowercase [a-z0-9_-] slug capped at
 *    32 chars: never a raw URL, never a click id, never PII;
 *  - first-write-wins: a later link can NEVER overwrite the recorded
 *    acquisition source;
 *  - capture is passive (never consumes or reroutes the link) and
 *    best-effort (storage failure never throws into the deep-link path);
 *  - the one attach point is the first_workout_logged payload, warmed at
 *    startup so the workout-finish hot path stays synchronous.
 *
 * Explicitly out of scope for phase 1 (founder ruling): no advertising SDK,
 * no fingerprinting, no native Install Referrer dependency, no attribution
 * platform. A test demanding any of those is wrong, not the code.
 */
const mockStore = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn((k) => Promise.resolve(k in mockStore ? mockStore[k] : null)),
  setItem: jest.fn((k, v) => { mockStore[k] = v; return Promise.resolve(); }),
}));

const fs = require('fs');
const path = require('path');
const AsyncStorage = require('@react-native-async-storage/async-storage');

const KEY = '@volyume_first_touch_source';

// The module caches in memory (so the workout-finish path never awaits
// storage); a fresh require per test isolates that cache.
let attribution;
beforeEach(() => {
  for (const k of Object.keys(mockStore)) delete mockStore[k];
  AsyncStorage.getItem.mockClear();
  AsyncStorage.setItem.mockClear();
  AsyncStorage.getItem.mockImplementation((k) => Promise.resolve(k in mockStore ? mockStore[k] : null));
  AsyncStorage.setItem.mockImplementation((k, v) => { mockStore[k] = v; return Promise.resolve(); });
  jest.resetModules();
  attribution = require('../attribution');
});

describe('parseSourceFromUrl: sanitised slug or null, never a raw URL', () => {
  test('reads ?src= and ?utm_source=, including on custom schemes', () => {
    expect(attribution.parseSourceFromUrl('https://volyume.app/get?src=instagram')).toBe('instagram');
    expect(attribution.parseSourceFromUrl('https://volyume.app/get?utm_source=reddit')).toBe('reddit');
    expect(attribution.parseSourceFromUrl('volyume://open?src=tiktok_bio')).toBe('tiktok_bio');
    expect(attribution.parseSourceFromUrl('volyume://partner/ABC123?other=1&src=partner-invite')).toBe('partner-invite');
  });

  test('lowercases and strips everything outside [a-z0-9_-]', () => {
    expect(attribution.parseSourceFromUrl('app://x?src=InstaGram')).toBe('instagram');
    expect(attribution.parseSourceFromUrl('app://x?src=you%20tube%21')).toBe('youtube');
    expect(attribution.parseSourceFromUrl('app://x?src=%3Cscript%3E')).toBe('script');
  });

  test('caps the slug at 32 characters', () => {
    const long = 'a'.repeat(64);
    expect(attribution.parseSourceFromUrl(`app://x?src=${long}`)).toBe('a'.repeat(32));
  });

  test('stops at & and # so only the one parameter value is read', () => {
    expect(attribution.parseSourceFromUrl('app://x?src=insta&code=SECRET')).toBe('insta');
    expect(attribution.parseSourceFromUrl('app://x?src=insta#access_token=abc')).toBe('insta');
  });

  test('null for missing/empty/non-string input and for a fully-stripped value', () => {
    expect(attribution.parseSourceFromUrl(null)).toBeNull();
    expect(attribution.parseSourceFromUrl(undefined)).toBeNull();
    expect(attribution.parseSourceFromUrl(42)).toBeNull();
    expect(attribution.parseSourceFromUrl('volyume://open')).toBeNull();
    expect(attribution.parseSourceFromUrl('app://x?src=%21%40%23')).toBeNull();
  });

  test('tolerates malformed percent-encoding instead of throwing', () => {
    // %zz is not a valid escape: decodeURIComponent throws, the raw match is
    // used instead, and sanitisation strips the stray % sign.
    expect(attribution.parseSourceFromUrl('app://x?src=bad%zzvalue')).toBe('badzzvalue');
  });
});

describe('captureFirstTouch: first-write-wins, passive, never throws', () => {
  test('persists the first source and never overwrites it', async () => {
    await attribution.captureFirstTouch('app://x?src=instagram');
    await attribution.captureFirstTouch('app://x?src=reddit');
    expect(mockStore[KEY]).toBe('instagram');
    expect(attribution.getFirstTouchSource()).toBe('instagram');
  });

  test('a previously persisted source wins over a fresh cold-start link', async () => {
    mockStore[KEY] = 'youtube';
    await attribution.captureFirstTouch('app://x?src=reddit');
    expect(mockStore[KEY]).toBe('youtube');
    expect(attribution.getFirstTouchSource()).toBe('youtube');
  });

  test('a link with no source token touches nothing', async () => {
    await attribution.captureFirstTouch('volyume://partner/ABC123');
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    expect(attribution.getFirstTouchSource()).toBeNull();
  });

  test('storage failure is swallowed (attribution is never worth a crash)', async () => {
    AsyncStorage.getItem.mockRejectedValueOnce(new Error('disk'));
    await expect(attribution.captureFirstTouch('app://x?src=insta')).resolves.toBeUndefined();
  });
});

describe('warmFirstTouch / getFirstTouchSource: sync reads on the hot path', () => {
  test('null before anything is recorded', () => {
    expect(attribution.getFirstTouchSource()).toBeNull();
  });

  test('warm loads the persisted value; get is then synchronous', async () => {
    mockStore[KEY] = 'instagram';
    await attribution.warmFirstTouch();
    expect(attribution.getFirstTouchSource()).toBe('instagram');
  });

  test('warm survives a storage read failure and reports null', async () => {
    AsyncStorage.getItem.mockRejectedValueOnce(new Error('disk'));
    await expect(attribution.warmFirstTouch()).resolves.toBeNull();
    expect(attribution.getFirstTouchSource()).toBeNull();
  });
});

describe('C8 wiring pins (source-level)', () => {
  const read = (rel) => fs.readFileSync(path.resolve(__dirname, '..', '..', '..', rel), 'utf8');

  test('App.js captures passively as the FIRST action on every incoming link', () => {
    const APP = read('App.js');
    // Capture sits inside the single deep-link entry point, before the auth
    // handler can consume the link. (The partner intercept that used to sit
    // between them went with the retired Partners feature, SD-03 2026-09-06;
    // capture is now immediately followed by the auth path.)
    expect(APP).toMatch(/function handleIncomingDeepLink\(url\) \{\s*\n\s*if \(!url\) return;\s*\n[^\n]*\n[^\n]*\n\s*captureFirstTouch\(url\)\.catch\(\(\) => \{\}\);\s*\n\s*const supabase = getSupabaseClient\(\);/);
    // The cache is warmed at startup, before the initial URL is read, so the
    // workout-finish path can read synchronously.
    expect(APP).toMatch(/warmFirstTouch\(\)\.catch\(\(\) => \{\}\);\s*\n\s*Linking\.getInitialURL\(\)/);
  });

  test('the coarse source is attached to first_workout_logged and nowhere else', () => {
    const WORKOUT = read('src/screens/ActiveWorkoutScreen.js');
    expect(WORKOUT).toMatch(/trackFirst\(uid, 'first_workout_logged', \{\s*\n\s*first_touch_source: getFirstTouchSource\(\),\s*\n\s*\}\)\.catch\(\(\) => \{\}\);/);
    // Phase-1 scope: exactly one attach point in the whole src tree. The
    // colon form matches the payload-key usage only (the events.js catalogue
    // comment NAMES the key without attaching it, and must not count).
    const grepTree = (dir) => {
      let hits = 0;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) hits += grepTree(p);
        else if (entry.name.endsWith('.js') && !p.includes('__tests__') && p !== path.resolve(__dirname, '..', 'attribution.js')) {
          hits += (fs.readFileSync(p, 'utf8').match(/first_touch_source:/g) ?? []).length;
        }
      }
      return hits;
    };
    expect(grepTree(path.resolve(__dirname, '..', '..'))).toBe(1);
  });

  test('phase-1 privacy scope: no attribution SDK, referrer dependency or raw-URL storage', () => {
    const ATTR = read('src/lib/attribution.js');
    // The only thing ever persisted is the sanitised slug under the one key.
    expect(ATTR).toContain("const FIRST_TOUCH_KEY = '@volyume_first_touch_source';");
    expect(ATTR).toMatch(/\.toLowerCase\(\)\.replace\(\/\[\^a-z0-9_-\]\/g, ''\)\.slice\(0, 32\)/);
    // No new dependency crept in: AsyncStorage is the module's only import.
    const imports = ATTR.match(/^import .+ from '(.+)';$/gm) ?? [];
    expect(imports).toEqual(["import AsyncStorage from '@react-native-async-storage/async-storage';"]);
    const PKG = read('package.json');
    for (const banned of ['react-native-google-analytics', 'appsflyer', 'adjust', 'branch', 'install-referrer', 'firebase-analytics', 'segment']) {
      expect(PKG.toLowerCase()).not.toContain(banned);
    }
  });
});
