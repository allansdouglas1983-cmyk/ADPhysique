/**
 * campaign7.releaseConfig.test.js — durable release-config laws from the
 * Campaign 7 release-delta audit. Pins app.json facts a drive-by config
 * edit could silently break.
 */
const fs = require('fs');
const path = require('path');

const appJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'app.json'), 'utf8'));
const expo = appJson.expo;

describe('C7 release-config laws', () => {
  test('identity is the single production family', () => {
    expect(expo.ios.bundleIdentifier).toBe('app.volyume');
    expect(expo.android.package).toBe('app.volyume');
    expect(expo.scheme).toBe('volyume');
  });

  test('the E6A rest-timer permissions stay declared (they are NOT dead)', () => {
    // C7 correction, caught by e6aRestSurvival.guard: the audit lane
    // called these dead because the SESSION sticky flag
    // (USE_FOREGROUND_SERVICE=false) is off - but modules/rest-timer-live
    // hosts a live shortService foreground service whose own manifest
    // relies on the app-level FOREGROUND_SERVICE declaration, and it
    // upgrades the end-of-rest alarm to setExactAndAllowWhileIdle behind
    // canScheduleExactAlarms(). Removing either would break the shipped
    // rest timer. Both founder-approved E6A (2026-07-02).
    expect(expo.android.permissions).toContain('android.permission.FOREGROUND_SERVICE');
    expect(expo.android.permissions).toContain('android.permission.SCHEDULE_EXACT_ALARM');
    // The RESTRICTED alarm permission must never creep in (Play limits it
    // to alarm-clock/calendar apps).
    expect(expo.android.permissions).not.toContain('android.permission.USE_EXACT_ALARM');
  });

  test('no cardio/health permission or module ships', () => {
    const raw = JSON.stringify(appJson);
    expect(raw).not.toMatch(/health_connect|healthkit|BODY_SENSORS|ACTIVITY_RECOGNITION/i);
  });

  // REVERSED 2026-08-18 (D111-4). This pinned the OPPOSITE until today:
  // `associatedDomains: ['applinks:volyume.app']`, added 2026-08-11 in
  // fc08bd1e. That entitlement broke every iOS build. EAS enabled the
  // Associated Domains capability on the App ID but kept signing with the
  // stored provisioning profile minted 2026-06-10, which predates it, so
  // Xcode failed the archive with the only two errors in the whole build
  // log: "doesn't support the Associated Domains capability" and "doesn't
  // include the com.apple.developer.associated-domains entitlement"
  // (run #146, xcodebuild log lines 1978-1979; the compile itself was
  // clean). Run #145 on 2026-07-30, the last green iOS build, predates
  // the entitlement.
  //
  // Removing it costs users NOTHING: no shipped iOS build ever carried it,
  // so this reverts an unshipped change rather than dropping a live
  // feature. iOS partner links keep working through the volyume:// scheme.
  //
  // The AASA file stays served from public/.well-known/ and is still
  // asserted below, so restoring the entitlement is a one-line app.json
  // change the moment a provisioning profile carrying it exists.
  test('iOS Universal Links entitlement stays off until the profile carries it', () => {
    expect(expo.ios.associatedDomains).toBeUndefined();
    const aasa = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'public', '.well-known', 'apple-app-site-association'), 'utf8'));
    expect(aasa.applinks.details[0].appID.endsWith('app.volyume')).toBe(true);
  });

  test('the Android https app links are scoped to exactly the paths the AASA claims', () => {
    // SD-16: Community's external link pages (blueprint §8) add /u, /p and
    // /s alongside the existing /partner intent filter, same autoVerify
    // https/volyume.app shape.
    const https = expo.android.intentFilters.flatMap((f) => f.data ?? []).filter((d) => d.host === 'volyume.app');
    const pathPrefixes = https.map((d) => d.pathPrefix).sort();
    expect(pathPrefixes).toEqual(['/p', '/partner', '/s', '/u']);
  });

  test('package-visibility query actions are BARE names (the plugin prepends the prefix)', () => {
    const plugins = expo.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-build-properties');
    const intents = plugins[1].android.manifestQueries.intent;
    for (const i of intents) expect(i.action).not.toMatch(/^android\.intent/);
  });

  test('cleartext stays off and backups stay off', () => {
    const bp = expo.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-build-properties')[1];
    expect(bp.android.usesCleartextTraffic).toBe(false);
    expect(expo.android.allowBackup).toBe(false);
  });
});
