import 'react-native-url-polyfill/auto';
import { Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

// SecureStore adapter for Supabase auth session, encrypted on both iOS and Android.
// Falls back silently so the app still launches if SecureStore is unavailable (e.g. emulator).
// iOS (VOLYUME-2E): the default Keychain accessibility (WHEN_UNLOCKED) refuses
// reads while the phone is locked ("User interaction is not allowed"), so any
// background wake -- notification handling, token auto-refresh -- lost the
// session read and could treat a signed-in user as signed out. Match the
// database key's accessibility (dbCrypto.js): AFTER_FIRST_UNLOCK keeps the
// session readable from background once the device has been unlocked since
// boot, and the item is still hardware-encrypted at rest.
const KEY_OPTS = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };

// An iOS Keychain item keeps the accessibility it was WRITTEN with, so the
// KEY_OPTS above only govern items this build created. Anyone who signed in
// before that change still has a WHEN_UNLOCKED session item, which keeps
// failing exactly as VOLYUME-2E describes however many times we re-read it.
// Rewriting the value once, on the first read that actually succeeds (so the
// device is demonstrably unlocked), upgrades the item in place. Guarded per
// key so this costs one extra write per key per launch, never a loop.
const _accessibilityUpgraded = new Set();
async function _upgradeAccessibility(key, value) {
  if (value == null || _accessibilityUpgraded.has(key)) return;
  _accessibilityUpgraded.add(key);
  try { await SecureStore.setItemAsync(key, value, KEY_OPTS); } catch (_) {}
}

// "User interaction is not allowed" is the Keychain refusing a read on a
// LOCKED device. It is an expected state, not a defect: the correct response
// is to leave the session alone until the device is unlocked. It is not
// evidence that the user is signed out, and logging it at error level is what
// buried thirteen days of real signal under 1,589 events.
function _isKeychainLocked(e) {
  const msg = String(e?.message || e || '');
  return msg.includes('User interaction is not allowed')
    || msg.includes('errSecInteractionNotAllowed');
}

// SECURESTORE WRITE TRUTH (adversarial audit 2026-08-26, finding 9).
//
// expo-secure-store documents a 2048-byte value limit and warns above it that
// the value "may not be stored successfully. In a future SDK version, this call
// may throw an error." A Supabase session is an access-token JWT plus a refresh
// token plus the user object, which is not obviously under that.
//
// The failure mode matters more than the odds. setItem caught, logged and
// returned, so supabase-js believed the session was persisted either way. A
// write that did not stick shows up only at the next cold launch, as a user who
// was signed in and now is not, with nothing in the logs tying the two together.
// This app has already lost thirteen days of signal to a misclassified keychain
// error (VOLYUME-2E), so an auth write that fails silently is exactly the shape
// worth closing.
//
// NOT CURRENTLY HAPPENING. Sentry holds no secureStore or keychain events at all
// across the last 90 days, so this is a diagnostic gap rather than a live
// incident, and it is fixed as one: the write is checked, not re-architected.
// Chunking the session across multiple keychain items would change the storage
// format on the live auth path and is not warranted by anything observed.
const SECURE_STORE_VALUE_LIMIT = 2048;
const _verifiedOnce = new Set();

function _byteLength(value) {
  try { return new TextEncoder().encode(String(value)).length; }
  catch (_) { return String(value ?? '').length; }
}

/**
 * Confirms a write actually landed, for the two cases worth paying a read for:
 * a value over the documented limit, and the first write of each key this
 * launch (which catches a keychain that is broken outright). Every other write
 * is left alone so the token-refresh path keeps its single keychain operation.
 */
async function _verifyWrite(key, value) {
  const bytes = _byteLength(value);
  const oversize = bytes > SECURE_STORE_VALUE_LIMIT;
  if (!oversize && _verifiedOnce.has(key)) return;
  _verifiedOnce.add(key);
  try {
    const readBack = await SecureStore.getItemAsync(key, KEY_OPTS);
    if (readBack === value) return;
    // eslint-disable-next-line global-require
    require('./errorLog').logError(
      'supabase.secureStore.writeNotPersisted',
      new Error('SecureStore write did not persist'),
      { bytes, overDocumentedLimit: oversize, readBackWasNull: readBack == null },
    );
  } catch (e) {
    // A locked keychain cannot answer, which is not evidence of anything.
    if (_isKeychainLocked(e)) return;
    // eslint-disable-next-line global-require
    try { require('./errorLog').logWarn('supabase.secureStore.verifyFailed', String(e?.message || e), { bytes }); } catch (_) {}
  }
}

const secureAuthStorage = {
  getItem: async (key) => {
    try {
      const value = await SecureStore.getItemAsync(key, KEY_OPTS);
      _upgradeAccessibility(key, value).catch(() => {});
      return value;
    }
    catch (e) {
      // Lazy-require errorLog to avoid any import cycle with this module.
      // eslint-disable-next-line global-require
      try {
        const log = require('./errorLog');
        if (_isKeychainLocked(e)) log.logInfo('supabase.secureStore.locked', 'keychain locked, deferring session read');
        else log.logError('supabase.secureStore.getItem', e);
      } catch (_) {}
      return null;
    }
  },
  setItem: async (key, value) => {
    try {
      await SecureStore.setItemAsync(key, value, KEY_OPTS);
      // Deliberately not awaited: the caller is supabase-js persisting a
      // session and must not wait on a diagnostic read.
      _verifyWrite(key, value).catch(() => {});
    }
    catch (e) {
      // Re-triage 2026-08-01: getItem classified locked-device reads as
      // expected, but set/remove kept logging them as errors - the residual
      // VOLYUME-2E events on build 48. Same device state, same classification.
      // eslint-disable-next-line global-require
      try {
        const log = require('./errorLog');
        if (_isKeychainLocked(e)) log.logInfo('supabase.secureStore.locked', 'keychain locked, deferring session write');
        else log.logError('supabase.secureStore.setItem', e);
      } catch (_) {}
    }
  },
  removeItem: async (key) => {
    try {
      await SecureStore.deleteItemAsync(key, KEY_OPTS);
      // A session token that survives a sign-out is a different order of
      // problem from one that fails to save, so it is checked every time and
      // never rate-limited: the next person to hold this device is the one who
      // pays for a silent failure here.
      try {
        const readBack = await SecureStore.getItemAsync(key, KEY_OPTS);
        if (readBack != null) {
          // eslint-disable-next-line global-require
          require('./errorLog').logError(
            'supabase.secureStore.removeNotPersisted',
            new Error('SecureStore delete did not remove the session item'),
            { key: key.startsWith('sb-') ? 'sb-auth-token' : 'other' },
          );
        }
      } catch (verifyErr) {
        if (!_isKeychainLocked(verifyErr)) {
          // eslint-disable-next-line global-require
          try { require('./errorLog').logWarn('supabase.secureStore.removeVerifyFailed', String(verifyErr?.message || verifyErr)); } catch (_) {}
        }
      }
    }
    catch (e) {
      // eslint-disable-next-line global-require
      try {
        const log = require('./errorLog');
        if (_isKeychainLocked(e)) log.logInfo('supabase.secureStore.locked', 'keychain locked, deferring session removal');
        else log.logError('supabase.secureStore.removeItem', e);
      } catch (_) {}
    }
  },
};

// Exported for the write-truth tests (finding 9), which drive the real adapter
// against a SecureStore that fails the way the docs describe: by not storing
// the value rather than by throwing. There is no other way to exercise that.
export const __secureAuthStorageForTests = secureAuthStorage;

// Lazy-init: createClient is never called at module load time.
// D149 (founder, 2026-09-05): a network-free probe for "does this device
// hold a stored auth session at all?". RootNavigator uses it to tell a
// verified fresh install (which may open on Welcome at the first frame)
// from a device that might be signed in (which holds the neutral launch
// frame until the session restore answers). Reads the exact keychain item
// supabase-js keeps the session under: `sb-<project-ref>-auth-token`, the
// client's default storageKey (this client sets none), derived the same
// way supabase-js derives it (first label of the URL's hostname). Returns
// 'present', 'absent' or 'unknown'. Every failure is 'unknown', and
// unknown never opens early, so a locked keychain or a SecureStore fault
// can only keep the old behaviour, never produce a Welcome flash.
export function storedAuthSessionKey(url = process.env.EXPO_PUBLIC_SUPABASE_URL) {
  const m = /^https?:\/\/([^./:]+)/.exec(String(url || ''));
  return m ? `sb-${m[1]}-auth-token` : null;
}

export async function hasStoredAuthSession() {
  const key = storedAuthSessionKey();
  // No Supabase configured: no session can exist on this device.
  if (!key) return 'absent';
  try {
    const value = await SecureStore.getItemAsync(key, KEY_OPTS);
    return value ? 'present' : 'absent';
  } catch (_) {
    return 'unknown';
  }
}

// Returns null when SUPABASE_URL / SUPABASE_ANON_KEY env vars are absent (Stage 1).
let _client = null;
let _initialized = false;

export function getSupabaseClient() {
  if (_initialized) return _client;
  _initialized = true;
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  try {
    const rawClient = createClient(url, key, {
      auth: {
        storage: secureAuthStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
    // Wrap the client in the observability proxy so every .from(table)
    // call emits a breadcrumb with the table name, operation, and
    // round-trip duration. The breadcrumb is opaque to the rest of
    // the code, the proxied client forwards every method through.
    try {
      // eslint-disable-next-line global-require
      const { instrumentSupabase } = require('./observability');
      _client = instrumentSupabase(rawClient);
    } catch (_) {
      _client = rawClient;
    }
    _bindAutoRefreshToAppState(rawClient);
  } catch (_e) {
    _client = null;
  }
  return _client;
}

// VOLYUME-2E root fix. autoRefreshToken starts a timer that keeps ticking
// after the app is backgrounded. Every tick reads the session out of the
// Keychain, and on a locked phone that read is refused -- so supabase-js
// carried on with NO user JWT, auth.uid() came back NULL in Postgres, and
// every RLS policy of the form (auth.uid() = user_id) rejected the write with
// 42501. That is the whole of VOLYUME-2D/2F/2H/2C/2J/28: user data was being
// dropped on the floor, not merely logged noisily.
//
// This is the documented Supabase React Native pattern: refresh only while the
// app is in the foreground, where the Keychain is readable by definition.
// autoRefreshToken stays true so a foreground launch still refreshes
// immediately even if AppState never fires.
let _appStateSub = null;
function _bindAutoRefreshToAppState(client) {
  if (_appStateSub || !client?.auth?.startAutoRefresh) return;
  try {
    // eslint-disable-next-line global-require
    const { AppState } = require('react-native');
    _appStateSub = AppState.addEventListener('change', (state) => {
      try {
        if (state === 'active') client.auth.startAutoRefresh();
        else client.auth.stopAutoRefresh();
      } catch (_) { /* never let lifecycle wiring throw into the app */ }
    });
  } catch (_) { /* no AppState (tests, node): leave the default timer alone */ }
}

// Test seam: lets a suite drop the AppState subscription between runs.
export function _resetAuthRefreshBindingForTests() {
  try { _appStateSub?.remove?.(); } catch (_) {}
  _appStateSub = null;
}

// Tri-state on purpose: true (token in hand), false (positively established
// there is no token), or null (could not determine).
//
// The distinction matters. Callers gate sync on this, and "I could not check"
// is NOT evidence that the user is signed out -- treating it as such would
// silently disable sync for everyone the moment this call became unavailable,
// which is a far worse failure than the RLS rejections it exists to prevent.
// Only an answered getSession() with no access token returns false.
// Treat a token expiring within this window as already expired, so a request
// cannot be sent with a token that dies in flight.
const TOKEN_SKEW_SECONDS = 60;

export async function hasLiveSession() {
  const c = getSupabaseClient();
  if (!c) return null;
  try {
    const { data, error } = await c.auth.getSession();
    if (error) return null;
    const session = data?.session;
    if (!session?.access_token) return false;

    // BUG FOUND IN THE FIRST VERSION OF THIS GUARD (build 48, 2026-08-01).
    // It returned `!!session.access_token` -- PRESENCE, not validity.
    // getSession() hands back the stored session even when the access token
    // has already EXPIRED, so an expired token passed the guard, the request
    // went out anyway, auth.uid() was NULL server-side, and every write came
    // back 42501. The RLS rejections this guard exists to stop carried on.
    //
    // Worse, binding auto-refresh to the foreground (the other half of that
    // fix) makes expiry MORE likely on a background run, so the two changes
    // together left the hole wider than before.
    const expiresAt = Number(session.expires_at); // seconds since epoch
    if (Number.isFinite(expiresAt)) {
      const stillValid = expiresAt - TOKEN_SKEW_SECONDS > Date.now() / 1000;
      if (stillValid) return true;
      // Expired, or about to be. Try once to refresh rather than either
      // blocking a user who can be refreshed, or firing a doomed request.
      try {
        const { data: refreshed, error: refreshError } = await c.auth.refreshSession();
        if (refreshError) return false;
        return !!refreshed?.session?.access_token;
      } catch (_) {
        // Could not determine: fail OPEN, matching the runner's contract.
        // Never let an unanswerable check switch sync off for everyone.
        return null;
      }
    }
    // No expiry on the session: cannot judge validity, so do not claim to.
    return true;
  } catch (_) {
    return null;
  }
}

// Test seam, mirroring playBilling's injectProvider/_resetForTests pattern.
// getSupabaseClient() is a module-level singleton driven by env vars at first
// call, which makes it hostile to test in a shared jest worker (a sibling
// suite can initialise it first and cache a state no later env-set can undo).
// Tests inject a fake client here instead of fighting the module registry.
export function _setClientForTests(client) {
  _client = client;
  _initialized = true;
}

export function isSupabaseConfigured() {
  return !!(
    process.env.EXPO_PUBLIC_SUPABASE_URL &&
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
  );
}

export async function getCurrentUser() {
  const c = getSupabaseClient();
  if (!c) return null;
  const { data: { user } } = await c.auth.getUser();
  return user;
}

// The one redirect Volyume ever asks Supabase to send a user back to.
const OAUTH_REDIRECT_URL = 'volyume://';

/**
 * D141 item 1 (2026-09-04): every sign-in exchange with Supabase is bounded.
 *
 * Every other network call in the app carries a timeout (food search 1.2s,
 * USDA 1.5s, the sign-out push 20s); the auth exchanges did not, and the
 * Supabase client sets no custom fetch timeout either. On a captive portal
 * or a connection that accepts the socket and never answers, the sign-in
 * button stayed disabled for as long as the OS kept the request open, with
 * no toast and no way out short of killing the app. The bound matches the
 * sign-out push. The rejection message is deliberately network-shaped
 * ("timed out") so authErrorCopy.authErrorMessage maps it to the calm
 * connectivity sentence rather than the generic fallback.
 *
 * Only the NETWORK exchanges are bounded, never a step the user is inside
 * of (the Google account picker, the Apple sheet, the Play Services update
 * dialogue): a slow person choosing an account is not a hung request.
 *
 * If the underlying request completes after the bound, Supabase still emits
 * SIGNED_IN through onAuthStateChange and the app signs the user in as
 * normal; the toast they saw was about the wait, not about a failure to
 * sign in, and nothing is left half-done.
 */
export const AUTH_NETWORK_TIMEOUT_MS = 20000;
export const AUTH_TIMEOUT_MESSAGE = 'Sign-in timed out. Check your connection and try again.';

export function withAuthTimeout(promise, ms = AUTH_NETWORK_TIMEOUT_MS) {
  let timer = null;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(AUTH_TIMEOUT_MESSAGE)), ms);
  });
  // The losing promise must never surface as an unhandled rejection.
  Promise.resolve(promise).catch(() => {});
  return Promise.race([promise, timeout]).finally(() => { if (timer) clearTimeout(timer); });
}

export async function signInWithEmail(email, password) {
  const c = getSupabaseClient();
  if (!c) return { data: null, error: { message: 'Cloud sign-in is not available right now.' } };
  try {
    return await withAuthTimeout(c.auth.signInWithPassword({ email, password }));
  } catch (e) {
    return { data: null, error: { message: e?.message ?? AUTH_TIMEOUT_MESSAGE } };
  }
}

export async function signUpWithEmail(email, password) {
  const c = getSupabaseClient();
  if (!c) return { data: null, error: { message: 'Cloud sign-in is not available right now.' } };
  // Founder law 2026-08-27: the verification callback must be attributable to a
  // flow this app began. beginAuthFlow records that and returns a nonce; see
  // authCallbackState.js for what that does and does not buy.
  // eslint-disable-next-line global-require
  const nonce = await require('./authCallbackState').beginAuthFlow('signup', email);
  if (!nonce) return { data: null, error: { message: 'Could not start a secure sign-up flow. Try again.' } };
  let result;
  try {
    result = await withAuthTimeout(c.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${OAUTH_REDIRECT_URL}auth-callback?state=${nonce}` },
    }));
  } catch (e) {
    result = { data: null, error: { message: e?.message ?? AUTH_TIMEOUT_MESSAGE } };
  }
  if (result?.error) await require('./authCallbackState').clearAuthFlow();
  return result;
}

export async function signOut() {
  // A pending auth-flow window must never survive an account boundary: it would
  // let a callback started by the previous user be adopted by the next.
  // eslint-disable-next-line global-require
  try { await require('./authCallbackState').clearAuthFlow(); } catch (_) { /* best-effort */ }
  const c = getSupabaseClient();
  if (!c) return {};
  return c.auth.signOut();
}

export async function resetPassword(email) {
  const c = getSupabaseClient();
  if (!c) return { data: null, error: { message: 'Cloud sign-in is not available right now.' } };
  // Same binding as sign-up: a recovery link is an email callback too, and it
  // is the more dangerous of the two to adopt from an unknown sender.
  // eslint-disable-next-line global-require
  const nonce = await require('./authCallbackState').beginAuthFlow('recovery', email);
  if (!nonce) return { data: null, error: { message: 'Could not start a secure recovery flow. Try again.' } };
  const result = await c.auth.resetPasswordForEmail(
    email,
    { redirectTo: `${OAUTH_REDIRECT_URL}auth-callback?state=${nonce}` },
  );
  if (result?.error) await require('./authCallbackState').clearAuthFlow();
  return result;
}

// ─── OAuth (Google + Apple) ──────────────────────────────────────────────
//
// Flow:
//   1. Call signInWithOAuth, Supabase returns a provider URL.
//   2. Open it in an in-app browser via expo-web-browser.
//   3. User authenticates with Google / Apple in the browser.
//   4. Provider redirects to volyume://?code=..., the OS routes that to
//      the app, where App.js's handleAuthDeepLink exchanges the code for
//      a session.
//   5. RootNavigator's onAuthStateChange listener picks up the new session
//      and routes the user to the right place.
//
// Requires the user to have configured the provider in the Supabase
// dashboard (Authentication → Providers → Google / Apple) AND added
// `volyume://` to the Allowed Redirect URLs list. Without those the call
// returns a clear error from Supabase that we surface to the caller.

async function _signInWithOAuthProvider(provider) {
  const c = getSupabaseClient();
  if (!c) {
    return { error: { message: 'Cloud sign-in is not available right now. Try again.' } };
  }
  try {
    // 1. Ask Supabase for the provider auth URL. skipBrowserRedirect makes
    //    it return the URL instead of trying to navigate (which doesn't
    //    work in React Native).
    const { data, error } = await c.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: OAUTH_REDIRECT_URL,
        skipBrowserRedirect: true,
      },
    });
    if (error) return { error };
    if (!data?.url) return { error: { message: 'No auth URL returned from Supabase.' } };

    // 2. Open in an in-app browser. openAuthSessionAsync auto-closes when
    //    the redirect back to volyume:// fires, so the user doesn't have
    //    to manually return to the app.
    // eslint-disable-next-line global-require
    const WebBrowser = require('expo-web-browser');
    const result = await WebBrowser.openAuthSessionAsync(data.url, OAUTH_REDIRECT_URL);

    if (result.type === 'success' && result.url) {
      // 3. The deep link is also captured by App.js's URL listener, but
      //    we exchange the code here too as a belt-and-braces backup.
      const codeMatch = result.url.match(/[?&]code=([^&#]+)/);
      if (codeMatch) {
        try { await c.auth.exchangeCodeForSession(decodeURIComponent(codeMatch[1])); }
        catch (_) { /* App.js handler will retry */ }
      }
      return { ok: true };
    }
    if (result.type === 'cancel' || result.type === 'dismiss') {
      return { cancelled: true };
    }
    return { error: { message: 'Sign-in flow did not complete.' } };
  } catch (e) {
    return { error: { message: e?.message ?? 'OAuth sign-in failed.' } };
  }
}

// Public Google OAuth Web client ID. Not a secret: it ships in the app binary
// and is the audience Supabase's Google provider is configured with. Native
// Google Sign-In requests an ID token with this as the audience, which Supabase
// verifies via signInWithIdToken.
const GOOGLE_WEB_CLIENT_ID = '520741631478-apaethkp3g55o06lott116jag73l0ves.apps.googleusercontent.com';

// Native Google Sign-In: shows the OS account-picker sheet (no browser, no
// supabase.co URL on screen), returns a Google ID token, and exchanges it with
// Supabase via signInWithIdToken. Same real account + session as the old
// browser OAuth flow, so the locked identity model is unaffected. The native
// module is lazy-required so jest and any non-native env don't try to load it.
//
// Founder setup (one-time): an Android OAuth client in Google Cloud with the
// app's package (app.volyume) and signing SHA-1, plus the Web client above
// configured in Supabase Authentication → Providers → Google.
export async function signInWithGoogle() {
  const c = getSupabaseClient();
  if (!c) {
    return { error: { message: 'Cloud sign-in is not available right now. Try again.' } };
  }
  let GoogleSignin;
  let statusCodes;
  try {
    // eslint-disable-next-line global-require, import/no-unresolved
    ({ GoogleSignin, statusCodes } = require('@react-native-google-signin/google-signin'));
  } catch (_) {
    return { error: { message: 'Google sign-in is unavailable in this build.' } };
  }
  try {
    GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    // Start from a clean native state. The Google SDK keeps the last
    // account signed in at the native layer, and that cache outlives a
    // Volyume sign-out or account deletion (those clear the Supabase
    // session and local storage, not the Google SDK). A stale cache makes
    // the next signIn() resolve with the old account and no fresh idToken,
    // so the button looked dead after deleting an account. Clearing it
    // first forces the account picker and a fresh token every time.
    try { await GoogleSignin.signOut(); } catch (_) { /* not signed in, fine */ }
    const resp = await GoogleSignin.signIn();
    // v13+ shape: { type: 'success' | 'cancelled', data }. Older: { idToken }.
    if (resp?.type === 'cancelled') return { cancelled: true };
    const idToken = resp?.data?.idToken ?? resp?.idToken ?? null;
    if (!idToken) return { error: { message: 'Google did not return a sign-in token.' } };
    // D141 item 1: the token exchange is the network step; bounded.
    const { error } = await withAuthTimeout(c.auth.signInWithIdToken({ provider: 'google', token: idToken }));
    if (error) return { error };
    return { ok: true };
  } catch (e) {
    const code = e?.code;
    if (statusCodes && (code === statusCodes.SIGN_IN_CANCELLED || code === statusCodes.IN_PROGRESS)) {
      return { cancelled: true };
    }
    return { error: { message: e?.message ?? 'Google sign-in failed.' } };
  }
}

// Native Sign in with Apple on iOS. App Store Guideline 4.8 requires the
// native flow (not a web view) and Apple's official button whenever any other
// social sign-in is offered, which we do (Google). Uses
// expo-apple-authentication's signInAsync to get an Apple identity token, then
// exchanges it with Supabase via signInWithIdToken — the same real account +
// session model as native Google, so the locked identity model is unaffected.
//
// On any non-iOS platform (Android) or if the native module is unavailable,
// it falls back to the Supabase Apple web-OAuth flow. Android behaviour is
// therefore completely unchanged: it never touches expo-apple-authentication.
//
// Founder setup (one-time): enable Sign in with Apple on the app.volyume App
// ID, and configure the Apple provider in Supabase (Authentication →
// Providers → Apple) with the app's bundle id (app.volyume) as an allowed
// client id so signInWithIdToken accepts the native token.
// VOLYUME-2B root cause (2026-07-13): under the new architecture (Fabric) the
// native AppleAuthenticationButton can fire onPress twice per tap, so two
// concurrent ASAuthorization requests started. iOS only allows one: the first
// presented the sheet and signed in fine every time, the second was rejected
// immediately with ASAuthorizationError 1000 -- which then logged as a sign-in
// error alongside every SUCCESSFUL sign-in. The guard below makes this
// function single-flight: a call arriving while a native request is already
// up joins the caller silently (duplicate: true routes to the no-op logInfo
// branch in the screens, never a toast, never Sentry).
let _appleSignInInFlight = false;

export async function signInWithApple() {
  if (Platform.OS !== 'ios') {
    return _signInWithOAuthProvider('apple');
  }
  const c = getSupabaseClient();
  if (!c) {
    return { error: { message: 'Cloud sign-in is not available right now. Try again.' } };
  }
  let AppleAuthentication;
  try {
    // eslint-disable-next-line global-require, import/no-unresolved
    AppleAuthentication = require('expo-apple-authentication');
  } catch (_) {
    return _signInWithOAuthProvider('apple');
  }
  if (_appleSignInInFlight) {
    return { duplicate: true };
  }
  _appleSignInInFlight = true;
  try {
    const available = await AppleAuthentication.isAvailableAsync();
    if (!available) return _signInWithOAuthProvider('apple');
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
    const idToken = credential?.identityToken;
    if (!idToken) return { error: { message: 'Apple did not return a sign-in token.' } };
    // D141 item 1: the token exchange is the network step; bounded.
    const { error } = await withAuthTimeout(c.auth.signInWithIdToken({ provider: 'apple', token: idToken }));
    if (error) return { error };
    // Guideline 4: Authentication Services already supplies the user's name and
    // email on the FIRST authorisation (both are null on later sign-ins), so we
    // return them for the caller to pre-fill onboarding rather than making the
    // user type information Apple already gave us.
    //
    // 2026-08-19: returning them is not enough. Sign-in completes through
    // RootNavigator's onAuthStateChange, not this call's return, and two of the
    // three screens calling this dropped both values on the floor. Remember the
    // name here, at the one place Apple ever hands it over, so onboarding never
    // has to ask for it.
    try {
      // eslint-disable-next-line global-require
      require('./appleIdentity').noteAppleCredential({
        givenName: credential?.fullName?.givenName || null,
      });
    } catch (_) { /* best effort: the return below is unaffected */ }
    return {
      ok: true,
      appleGivenName: credential?.fullName?.givenName || null,
      appleEmail: credential?.email || null,
    };
  } catch (e) {
    // The native sheet throws a cancellation error code when the user backs out.
    if (e?.code === 'ERR_REQUEST_CANCELED' || e?.code === 'ERR_CANCELED') {
      return { cancelled: true };
    }
    // ASAuthorizationError.unknown (Apple error 1000, surfaced as
    // ERR_REQUEST_UNKNOWN, Sentry VOLYUME-18): Apple's sheet failed before
    // our code or Supabase ran. In practice this is device state -- most
    // commonly not being (fully) signed in to iCloud, or an Apple ID that
    // needs attention -- so callers show the actual remedy instead of a
    // dead-end "try again". The code flag is what LoginScreen branches on.
    if (e?.code === 'ERR_REQUEST_UNKNOWN') {
      return { error: { code: 'apple_device_state', message: e?.message ?? 'Apple sign-in failed.' } };
    }
    return { error: { message: e?.message ?? 'Apple sign-in failed.' } };
  } finally {
    _appleSignInInFlight = false;
  }
}

// ─── PostgREST clock-skew retry (2026-09-06, Sentry VOLYUME-2Q / 32) ──────
//
// PGRST303 "JWT issued at future" is PostgREST refusing a token whose `iat` is
// ahead of the server's clock. It is not a bad token and not a signed-out user:
// it is a second or two of skew between the device and Dublin, and the SAME
// token is accepted on a retry moments later. 61 events across 5 users landed
// on the users_profile read at login, and more on the food library delta RPC --
// and in both places the app failed the operation outright rather than waiting
// out a clock. A profile read that comes back empty at login is the worst
// possible response to it, because "no profile row" is how the app recognises a
// user who has never onboarded.
//
// The remedy is a short, bounded wait and one retry. Deliberately NOT a general
// retry wrapper: only this one transient auth condition is retried, everything
// else returns or throws exactly as before, and the attempt budget is small
// enough that an exhausted retry still fails fast.

/**
 * True when `err` is PostgREST rejecting a token for clock skew.
 * Accepts a PostgREST { code, message, hint, details } shape or a thrown Error.
 *
 * @param {unknown} err
 * @returns {boolean}
 */
export function isClockSkewError(err) {
  if (!err || typeof err !== 'object') return false;
  if (err.code === 'PGRST303') return true;
  const text = `${err.message ?? ''} ${err.details ?? ''} ${err.hint ?? ''}`;
  return /issued at future/i.test(text);
}

const _skewDelay = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/**
 * Run a Supabase call, retrying ONLY on a clock-skew rejection.
 *
 * `fn` is expected to return a PostgREST-shaped `{ data, error }` (the skew
 * arrives as `error`, not a throw) but a thrown skew error is handled the same
 * way. Any other error -- returned or thrown -- is passed straight back on the
 * first attempt, unretried. When the attempts are exhausted the caller sees
 * exactly what it would have seen without this wrapper: the last result, or the
 * last throw.
 *
 * @template T
 * @param {() => Promise<T>} fn
 * @param {{ delayMs?: number, attempts?: number }} [opts]
 * @returns {Promise<T>}
 */
export async function withClockSkewRetry(fn, { delayMs = 1500, attempts = 2 } = {}) {
  const total = Math.max(1, Math.trunc(attempts) || 1);
  let result;
  for (let i = 0; i < total; i += 1) {
    const isLast = i === total - 1;
    try {
      result = await fn();
    } catch (e) {
      if (isLast || !isClockSkewError(e)) throw e;
      await _skewDelay(delayMs);
      continue;
    }
    if (!isLast && isClockSkewError(result?.error)) {
      await _skewDelay(delayMs);
      continue;
    }
    return result;
  }
  return result;
}

export async function upsertUserProfile(userId, profile) {
  const c = getSupabaseClient();
  if (!c) return { data: null, error: null };
  return c
    .from('users_profile')
    .upsert({ id: userId, ...profile, updated_at: new Date().toISOString() });
}

export async function getUserProfile(userId) {
  const c = getSupabaseClient();
  if (!c) return { data: null, error: null };
  return c
    .from('users_profile')
    .select('*')
    .eq('id', userId)
    .single();
}
