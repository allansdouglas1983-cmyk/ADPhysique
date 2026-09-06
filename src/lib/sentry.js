// Sentry wrapper, lazy-loaded so the app keeps building and running
// even before @sentry/react-native is installed. Once you've added
// the package and set EXPO_PUBLIC_SENTRY_DSN, initSentry() does the
// real wiring; until then every call is a no-op.
//
// This file is the only place that talks to Sentry directly. The rest
// of the codebase calls into errorLog.js, which forwards to here. That
// way the on-device ring buffer (Settings → Debug logs) and Sentry
// receive the same events, and we can swap Sentry out without touching
// every call site.
//
// Why so cautious about the import? @sentry/react-native depends on
// native modules. If the package is missing, calling its functions
// throws synchronously. Wrapping the import in try/catch and exposing
// no-ops means the JS bundle keeps loading and the app keeps running
// during the transition between "no Sentry" and "Sentry installed".

import { scrubEvent, scrubBreadcrumb } from './observability/sentryScrub';
import { NETWORK_NOISE, isNetworkNoise } from './observability/networkNoise';

let SentryNative = null;
let initialised = false;

try {
  // eslint-disable-next-line global-require, import/no-unresolved
  SentryNative = require('@sentry/react-native');
} catch (_) {
  // Package not installed yet, that's fine. All calls below no-op.
}

export function isSentryAvailable() {
  return SentryNative != null;
}

/**
 * Initialise the Sentry SDK. Safe to call multiple times, guards
 * against double-init. No-op if the package isn't installed or the
 * DSN env var is missing.
 *
 * Call once at app startup (App.js).
 *
 * Release/dist are deliberately NOT set here: the @sentry/react-native/expo
 * plugin uploads source maps tagged with the SDK's auto-detected release
 * (bundleId@version+build) and dist (the native build number). Setting a
 * custom `release` here (and no `dist`) made events arrive under a name that
 * did not match the uploaded artifacts, so Sentry could not symbolicate and
 * every production stack trace came back minified. Leaving them unset lets the
 * SDK auto-detect both, so events line up with the maps and traces resolve.
 */
export function initSentry({ environment } = {}) {
  if (!SentryNative || initialised) return;
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) return;

  // Validate the DSN format in JS BEFORE handing it to the native SDK.
  // sentry-android continues init on a background thread after
  // SentryNative.init() returns; a malformed DSN throws a Java
  // exception on that thread which JS try/catch cannot catch and which
  // kills the process before any handler is registered. The symptom is
  // a splash flash then immediate close, with no JS log, no tombstone
  // and no Sentry event. Reject obviously bad DSNs here so the app
  // still launches; the only cost is no error reporting until the DSN
  // is fixed.
  // Expected shape: https://<publicKey>@<host>/<projectId>
  // Self-hosted Sentry instances are allowed http for local-network use.
  // Trim first: env vars routinely pick up a trailing newline from
  // shell heredocs and CI secret injection, and the native parser
  // treats that as a malformed value.
  const trimmed = dsn.trim();
  const DSN_PATTERN = /^https?:\/\/[^@\s/]+@[^/\s]+\/\d+$/;
  if (!DSN_PATTERN.test(trimmed)) return;

  try {
    SentryNative.init({
      dsn: trimmed,
      // release + dist auto-detected (see the note above) so events match the
      // plugin-uploaded source maps and stack traces symbolicate.
      environment: environment ?? (__DEV__ ? 'development' : 'production'),
      // The observability layer emits a breadcrumb per screen change, user
      // action, store action and DB query, so a busy session generates plenty.
      // The SDK default (100) can evict early crumbs before a late crash; 150
      // keeps a longer trail at negligible cost.
      maxBreadcrumbs: 150,
      // 5% performance trace sampling in production. At the 100k-user
      // target, every foreground / screen mount / sync is a candidate
      // transaction, so even a few percent is plenty to surface slow
      // paths without burning the Sentry quota. Raise it temporarily
      // when chasing a specific perf regression. In dev we sample 100%
      // so local profiling is always visible.
      tracesSampleRate: __DEV__ ? 1.0 : 0.05,
      // Keep this explicit even though it is currently the SDK default. A
      // future SDK/default change must not start collecting IP or request PII.
      sendDefaultPii: false,
      // Sentry's own session tracking, counts crash-free sessions
      // and users per release. Required for the release-health
      // dashboard view to populate.
      enableAutoSessionTracking: true,
      attachStacktrace: true,
      // beforeSend is Sentry's last-chance hook to mutate an event
      // before it leaves the device. We use it to:
      //   1. Strip known PII keys from extra context (observability
      //      already redacts most callers but this is a belt-and-
      //      braces defence for direct Sentry calls or third-party
      //      breadcrumbs).
      //   2. Drop events tagged "drop" by the caller (used to
      //      suppress duplicate or noisy patterns).
      //
      // FAIL CLOSED, not open: if the scrubber itself throws (a bug in
      // scrubEvent/scrubBreadcrumb, a malicious getter on the event, or
      // an SDK shape change it doesn't expect), returning the original
      // event would ship it UNSANITISED, including whatever PII was
      // attached (e.g. the user's email, see setSentryUser below). A
      // dropped crash report is an acceptable cost; a leaked event is
      // not. So the catch branch returns null (drop) rather than the
      // untouched input. No payload is logged here, only a boolean
      // signal, so the failure is observable without repeating the leak.
      beforeSend: (event) => {
        try { return scrubEvent(event); }
        catch (_) {
          if (__DEV__) {
            // eslint-disable-next-line no-console
            console.warn('[sentry] beforeSend scrub threw, dropping event to avoid an unsanitised send');
          }
          return null;
        }
      },
      beforeBreadcrumb: (crumb) => {
        try { return scrubBreadcrumb(crumb); }
        catch (_) {
          if (__DEV__) {
            // eslint-disable-next-line no-console
            console.warn('[sentry] beforeBreadcrumb scrub threw, dropping breadcrumb to avoid an unsanitised send');
          }
          return null;
        }
      },
    });
    initialised = true;
  } catch (_) {
    // SDK init can throw on missing native modules in some builds.
    // Treat as "not available" rather than crashing the app.
    SentryNative = null;
  }
}

/**
 * Tag the current session with a user identity so issues are
 * searchable by user. Call after sign-in (and on auth state changes).
 * Pass null to clear (call on sign-out).
 */
export function setSentryUser(user) {
  if (!SentryNative || !initialised) return;
  try {
    if (!user) {
      SentryNative.setUser(null);
      return;
    }
    SentryNative.setUser({
      id: user.id,
      // Deliberately omit email / username / ip at the source.
    });
  } catch (_) {}
}

// captureError's ONE gate (2026-09-06, Sentry VOLYUME-2H + the 2D family).
// Historically captureError was ungated on principle: real errors always ship.
// That principle holds everywhere except one case the triage proved -- a sync
// or supabase scope whose error IS the network being unreachable. Those are not
// defects: the app is offline-first, the push failed because there was no
// route to Dublin, and src/lib/syncQueue.js owns the retry. Nothing is
// actionable, nothing is lost, and 201 events of
// "sync.tables.capabilityConstraints.pushUpsert / TypeError: Network request
// failed" is the same non-event 201 times.
//
// Both halves are required, deliberately:
//   - the scope must match /^(sync|supabase)\./, so a network failure anywhere
//     ELSE (a screen, a payment, a media upload) still ships as an error;
//   - the text must match the network signature in the error message or in
//     extra.originalError (the coerced-PostgREST shape captureError builds
//     above), so a sync-scope error with a REAL cause -- RLS 42501, a schema
//     drift, a constraint violation -- still ships.
// The local errorLog ring buffer (Settings -> Debug Logs) is upstream of this
// and keeps every one of these either way.
function _isExpectedNetworkSyncError(err, ctx, extra) {
  try {
    if (!/^(sync|supabase)\./.test(String(ctx?.scope ?? ''))) return false;
    if (isNetworkNoise(err?.message)) return true;
    return isNetworkNoise(extra?.originalError);
  } catch (_) { /* fail open to visibility: capture normally */ }
  return false;
}

/**
 * Forward an error to Sentry. errorLog.logError → captureError.
 *
 * @param {Error|unknown} error    Error instance or anything throwable
 * @param {Object}  ctx            Optional structured context
 * @param {string}  ctx.scope      Logical scope (e.g. 'ProUpgrade.activatePro')
 * @param {Object}  ctx.extra      Arbitrary key/value extras
 * @param {Object}  ctx.tags       Search-friendly tags (low cardinality)
 */
export function captureError(error, ctx = {}) {
  if (!SentryNative || !initialised) return;
  try {
    // Coerce non-Error values into a real Error. Supabase/PostgREST rejects with
    // a plain object {code, details, hint, message}; passing that straight to
    // captureException makes Sentry report the useless "Object captured as
    // exception with keys: code, details, hint, message" and lose the message.
    // Wrap it so events group by the real message, and keep the original as an
    // extra so code/details/hint survive.
    let err = error;
    let extra = ctx.extra;
    if (!(error instanceof Error)) {
      const msg = error && typeof error === 'object'
        ? (error.message || error.code || JSON.stringify(error).slice(0, 200))
        : String(error);
      err = new Error(msg || 'Non-Error value captured');
      extra = { ...(ctx.extra || {}), originalError: error };
    }
    if (_isExpectedNetworkSyncError(err, ctx, extra)) {
      SentryNative.addBreadcrumb({
        message: err?.message ?? String(error),
        category: ctx.scope ?? 'app',
        level: 'error',
        data: extra ?? undefined,
      });
      return;
    }
    SentryNative.withScope((scope) => {
      if (ctx.scope) scope.setTag('scope', ctx.scope);
      if (ctx.tags) {
        for (const [k, v] of Object.entries(ctx.tags)) scope.setTag(k, String(v));
      }
      if (extra) {
        for (const [k, v] of Object.entries(extra)) scope.setExtra(k, v);
      }
      SentryNative.captureException(err);
    });
  } catch (_) {}
}

// Expected-offline noise gate (2026-07-12, Sentry VOLYUME-S/1A/1B/1C/1D/1E):
// a device syncing with no connectivity retried pushes for a whole
// backgrounded session and every attempt shipped a warning EVENT (3,856
// events on a single issue). An unreachable network is expected
// offline-first behaviour -- the sync queue owns the retry -- so these
// demote to a warning-level breadcrumb: still attached to any subsequent
// real error, no event, no quota burn. Three triggers (the third added by
// the 2026-09-06 triage):
//   1. the network-unreachable signature (observability/networkNoise.js:
//      failed/timed-out fetches, AuthRetryableFetchError, "Load failed",
//      NSURL "appears to be offline", ECONNRESET/ETIMEDOUT/ENOTFOUND ...)
//      anywhere in the message or context, regardless of connectivity
//      knowledge;
//   2. a sync-family warning (sync.* / supabase.* scope) while NetInfo has
//      told us the device is offline (observability.isKnownOffline) -- the
//      aggregate warnings (e.g. sync.push.legacy.errors) don't carry the
//      fetch text but describe the same expected condition;
//   3. an aggregate warning that STATES its cause: extra.allNetwork === true
//      is set by the sync layer when every error counted during the window
//      matched the signature (sync.js logPgErr/logBulkWarn). This replaces
//      guessing at an aggregate whose own text carries no network wording --
//      "partial push 400 of 600" (VOLYUME-28) and sync.push.legacy.errors
//      (VOLYUME-2C) now say so themselves.
// The 2026-09-06 triage widened the signature after the same offline session
// shipped 736 timeouts, 886 db.upsert.failed and 401 aggregates under strings
// the old single-pattern gate did not know.
// Store-side "cannot sell right now" warnings from the payments layer
// (2026-07-13, founder clean-slate mandate): a sideloaded Android build --
// the founder's whole test loop -- gets one of these from Google's billing
// client on EVERY paywall/catalogue touch ("SKU not found", ITEM/BILLING/
// SERVICE UNAVAILABLE, unknown St13runtime_error from the Nitro fetch),
// and both stores emit them during transient outages. Same classification
// as src/lib/payments/storeErrors.js plus the raw Nitro fetch failure;
// scoped to payments.* warnings only, and captureError is never gated.
const STORE_NOISE = /sku not found|item.{0,12}unavailable|billing.{0,12}unavailable|service.{0,12}unavailable|no play offer|product not found|st13runtime_error/i;
function _isExpectedOfflineNoise(message, ctx) {
  try {
    if (ctx?.extra?.allNetwork === true) return true;
    if (NETWORK_NOISE.test(String(message ?? ''))) return true;
    if (ctx?.extra && isNetworkNoise(ctx.extra)) return true;
    if (/^payments\./.test(String(ctx?.scope ?? '')) && STORE_NOISE.test(String(message ?? ''))) return true;
    if (/^(sync|supabase)\./.test(String(ctx?.scope ?? ''))) {
      // Lazy require: observability's own Sentry forwarding goes through
      // errorLog, so a top-level import here could cycle at module init.
      // eslint-disable-next-line global-require
      const { isKnownOffline } = require('./observability');
      return typeof isKnownOffline === 'function' && isKnownOffline() === true;
    }
  } catch (_) { /* fail open to visibility: capture normally */ }
  return false;
}

/**
 * Forward a warning-level event. errorLog.logWarn → captureWarning.
 * Use this for "something's not right but we recovered" cases.
 */
export function captureWarning(message, ctx = {}) {
  if (!SentryNative || !initialised) return;
  try {
    if (_isExpectedOfflineNoise(message, ctx)) {
      SentryNative.addBreadcrumb({
        message,
        category: ctx.scope ?? 'app',
        level: 'warning',
        data: ctx.extra ?? undefined,
      });
      return;
    }
    SentryNative.withScope((scope) => {
      scope.setLevel('warning');
      if (ctx.scope) scope.setTag('scope', ctx.scope);
      if (ctx.tags) {
        for (const [k, v] of Object.entries(ctx.tags)) scope.setTag(k, String(v));
      }
      if (ctx.extra) {
        for (const [k, v] of Object.entries(ctx.extra)) scope.setExtra(k, v);
      }
      SentryNative.captureMessage(message);
    });
  } catch (_) {}
}

/**
 * Add a breadcrumb (low-priority crumb of context that's attached to
 * the next error). errorLog.logInfo → addBreadcrumb. Doesn't create
 * a Sentry event on its own; only enriches subsequent errors.
 */
export function addBreadcrumb(message, ctx = {}) {
  if (!SentryNative || !initialised) return;
  try {
    SentryNative.addBreadcrumb({
      message,
      category: ctx.scope ?? 'app',
      level: 'info',
      data: ctx.extra ?? undefined,
    });
  } catch (_) {}
}

// PII / sensitive-data redaction lives in src/lib/observability/sentryScrub.js
// per PRIVACY_CONSENT_LOCKED.md line 282. This file imports `scrubEvent`
// and `scrubBreadcrumb` and wires them into Sentry's beforeSend +
// beforeBreadcrumb hooks above. Audit tests live in
// src/lib/__tests__/sentryScrub.test.js. The fail-closed behaviour of the
// hooks themselves (drop on scrub throw, never leak the original) is
// pinned in src/lib/__tests__/sentry.test.js.
