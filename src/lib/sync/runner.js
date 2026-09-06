/**
 * Sync runner. SYNC_ARCHITECTURE_LOCKED.md lines 156-238.
 *
 * - All four sync triggers (foreground, network, write, periodic)
 *   route through syncAll(). A single in-memory lock deduplicates
 *   concurrent calls so a periodic + write trigger fired in the
 *   same instant produce one round.
 * - getStatus() exposes synced / pending / offline / error for the
 *   status indicator in the nav header.
 * - This phase delegates the actual pull/push work to the existing
 *   src/lib/sync.js helpers (bulkUploadLocalData + pullFromCloud).
 *   Future iterations migrate that logic into transport.js
 *   table-by-table, each guarded by the sync regression matrix
 *   from TESTING_STRATEGY_LOCKED.md lines 144-160.
 */

// E12 step 0 (memo docs/e12-sync-consolidation-memo-2026-07-03.md): the
// registry sync_queue was built but never fed and never drained, so its
// depth could only mislead the "changes waiting" line. It is deleted; the
// LIVE retry queue is legacy pending_sync_ops (src/lib/syncQueue.js) and
// status depth now reads that. Lazy-required to avoid an import cycle.
import { trackSyncRun } from './telemetry';
import { listSyncableTables } from './registry';
import { MIGRATED_TABLES, pushTable, pullTable, beginFoodRun } from './transport';
import { isSignOutWiping } from './signOutGuard';

let _runLock = false;
let _lastStatus = 'unknown'; // 'synced' | 'pending' | 'offline' | 'error' | 'unknown'
let _lastRunAt = 0;
let _lastError = null;

async function _livePendingCount(userId) {
  try {
    // eslint-disable-next-line global-require
    const { getQueueStats } = require('../syncQueue');
    // eslint-disable-next-line global-require
    const uid = userId ?? require('../../store/useAppStore').default.getState().user?.id;
    if (!uid) return 0;
    const stats = await getQueueStats(uid);
    return stats?.pending ?? 0;
  } catch (_) {
    return 0;
  }
}
// Resolvers waiting for the in-flight run to finish (whenSyncIdle). Notified in
// the syncAll finally when the run-lock is released.
let _idleWaiters = [];

function _notifyIdle() {
  if (!_idleWaiters.length) return;
  const waiters = _idleWaiters;
  _idleWaiters = [];
  for (const resolve of waiters) {
    try { resolve(true); } catch (_) { /* ignore */ }
  }
}

/**
 * Resolve once no syncAll is in flight. Combined with the sign-out wipe guard
 * (which stops NEW runs starting), the sign-out flow awaits this before wiping
 * so an already-running cycle finishes its DB writes BEFORE the wipe, never
 * after it (SYNC-3 airtight). Bounded by timeoutMs so sign-out can't hang on a
 * stuck run; resolves true if it went idle, false on timeout.
 */
export function whenSyncIdle({ timeoutMs = 5000 } = {}) {
  if (!_runLock) return Promise.resolve(true);
  return new Promise((resolve) => {
    let settled = false;
    let timer = null;
    const finish = (v) => {
      if (settled) return;
      settled = true;
      if (timer) { clearTimeout(timer); timer = null; }
      resolve(v);
    };
    _idleWaiters.push(() => finish(true));
    if (timeoutMs > 0) timer = setTimeout(() => finish(false), timeoutMs);
  });
}

/**
 * Run a full sync cycle. Returns the structured result the
 * sync_run telemetry event uses.
 *
 * @param {Object} opts
 * @param {string} opts.userId            - Supabase user id
 * @param {string} opts.localUserId       - Local SQLite user id
 * @param {'foreground'|'network'|'write'|'periodic'|'manual'} opts.triggeredBy
 */
export async function syncAll({ userId, localUserId, triggeredBy = 'manual' } = {}) {
  // SYNC-3: refuse to run while sign-out is wiping local data, so a live
  // lifecycle trigger can't pull cloud rows back into the DB mid-wipe. The
  // sign-out's own push-first syncAll runs before the flag is set.
  if (isSignOutWiping()) {
    return { status: 'skipped', reason: 'sign_out_wiping' };
  }
  // F2 (audit SC-1): Article 9 fail-closed gate. Health-domain tables must
  // never move for a session whose consent is unresolved (null) or denied
  // (false). Every consented user carries healthConsent === true (local
  // cache or cloud read) before any lifecycle trigger fires, so a skip here
  // is always the gate doing its job, and granting consent on the Article 9
  // screen kicks a fresh sync immediately. The store read is lazy so the
  // runner stays isolated in tests; ANY read failure counts as unresolved
  // (closed), never as consent.
  if (userId) {
    let healthConsent = null;
    try {
      // eslint-disable-next-line global-require
      healthConsent = require('../../store/useAppStore').default.getState()?.healthConsent;
    } catch (_) { healthConsent = null; }
    if (healthConsent !== true) {
      return { status: 'skipped', reason: 'health_consent_unresolved' };
    }
  }
  // VOLYUME-2D/2F/2H: a signed-in user whose phone was locked could lose the
  // Supabase session mid-background-run (the Keychain refuses the read). Every
  // push then went out with no user JWT, auth.uid() was NULL, and RLS rejected
  // it with 42501 -- the write was LOST, and reported as an error rather than
  // retried. Refuse to run at all without a live access token: the queue is
  // left untouched and the next foreground trigger syncs it properly. This is
  // strictly narrower than the existing auth checks and never drops work.
  //
  // Fail OPEN, deliberately: only an explicit `false` (getSession answered and
  // there was no access token) blocks the run. Anything else -- unavailable,
  // threw, undefined -- proceeds exactly as before. "I could not check" must
  // never be allowed to silently switch sync off for everybody.
  if (userId) {
    let live = null;
    try {
      // eslint-disable-next-line global-require
      live = await require('../supabase').hasLiveSession();
    } catch (_) { live = null; }
    if (live === false) {
      return { status: 'skipped', reason: 'no_live_session' };
    }
  }
  if (_runLock) {
    return { status: 'skipped', reason: 'already_running' };
  }
  _runLock = true;
  const startMs = Date.now();
  let status = 'success';
  let queueBefore = 0;
  let queueAfter = 0;
  let erroredCount = 0;
  let rejectedCount = 0;
  let pullCountPerTable = {};
  let pushCountPerTable = {};

  try {
    // Reset the food-domain coordinator cache so this cycle's
    // first food-table push/pull call drives a fresh bulk RPC.
    beginFoodRun();
    queueBefore = await _livePendingCount(userId);

    if (!userId) {
      status = 'success';
    } else {
      // Best-effort retry of any health-consent record the Article 9 screen
      // couldn't push at the time (Art 9 audit evidence). Independent of the
      // table sync; never blocks or fails the run. Lazy-required so the runner
      // stays isolated in tests.
      try {
        // eslint-disable-next-line global-require
        require('../consent/pendingConsent').flushPendingConsent().catch(() => {});
        // eslint-disable-next-line global-require
        require('../consent/capabilityConsent').flushPendingCapabilityConsent().catch(() => {});
      } catch (_) { /* tolerate */ }
      // FQ-6.1 (D96): the trial-grant retry rides the same trigger, in the
      // same shape - queue on network failure at consent, flush on sync.
      // Idempotent server-side; never touches the tier from here.
      try {
        // eslint-disable-next-line global-require
        require('../payments/pendingCascade').flushPendingCascade(userId).catch(() => {});
      } catch (_) { /* tolerate */ }
      // Two-track push/pull. The registry-driven transport.js owns
      // every table listed in MIGRATED_TABLES; everything else still
      // lives inside bulkUploadLocalData / pullFromCloud in
      // src/lib/sync.js. As more tables migrate, MIGRATED_TABLES
      // grows and the legacy helpers shrink.
      //
      // Explicit '.js' extension on the require: without it, some
      // bundlers (notably ones that prefer directory resolution
      // over file resolution) could pick up './index.js' inside
      // this directory and produce a circular import that silently
      // drops bulkUploadLocalData + pullFromCloud. Node's standard
      // CommonJS resolution picks the file first, but being
      // explicit removes the bundler-dependent ambiguity.
      // eslint-disable-next-line global-require
      const sync = require('../sync.js');
      // Lazy require the observability layer so the runner stays
      // testable in isolation (Jest mocks the sync surface; we don't
      // want to drag observability into every sync test). When the
      // helper isn't available (test env, missing layer), the
      // breadcrumb call is a no-op.
      function syncCrumb(scope, message, extra) {
        try {
          // eslint-disable-next-line global-require
          const obs = require('../observability');
          if (obs?.track?.warn) obs.track.warn(message, scope, extra);
        } catch (_) { /* tolerate */ }
      }

      try {
        // 1. Per-table push for migrated tables.
        for (const tableName of MIGRATED_TABLES) {
          const result = await pushTable(tableName, { userId, localUserId }).catch((e) => {
            erroredCount += 1;
            syncCrumb(`sync.push.${tableName}`, `sync.push.${tableName}.threw`, {
              error: String(e?.message ?? e).slice(0, 200),
            });
            return { count: 0, errors: 1, _err: e };
          });
          pushCountPerTable[tableName] = result?.count ?? 0;
          if (result?.errors) {
            erroredCount += result.errors;
            // Emit a breadcrumb-level warn so the next real error in
            // the session carries "table X pushed with N errors" on
            // its Sentry trail. Without this the failure only lived
            // in the individual handler's logSyncError and never
            // joined a parent error's context.
            syncCrumb(`sync.push.${tableName}`, `sync.push.${tableName}.errors`, {
              errors: result.errors,
              count: result.count ?? 0,
              skipped: result.skipped ?? null,
            });
          }
        }
        // 2. Legacy bulk push for everything else.
        if (typeof sync.bulkUploadLocalData === 'function' && localUserId) {
          const upload = await sync.bulkUploadLocalData(userId, localUserId).catch(e => {
            erroredCount += 1;
            syncCrumb('sync.push.legacy', 'sync.push.legacy.threw', {
              error: String(e?.message ?? e).slice(0, 200),
            });
            return { _err: e };
          });
          if (upload && typeof upload === 'object') {
            if (upload.pushCountPerTable) {
              pushCountPerTable = { ...pushCountPerTable, ...upload.pushCountPerTable };
            }
            // Legacy bulk push swallows each table's PostgREST {error} so one
            // failure can't abort the rest; it reports the total back here so a
            // rejected push counts as an error (and the sign-out push-first
            // safety won't wipe local data that never reached cloud).
            if (upload.errors) {
              erroredCount += upload.errors;
              // lastError/allNetwork (2026-09-06, Sentry VOLYUME-2C): the
              // aggregate's own text says nothing about WHY the legacy push
              // failed, so the Sentry noise gate had to infer it from NetInfo
              // -- which reports "connected" right through the flaky handover
              // that produced 401 of these. bulkUploadLocalData now reports the
              // cause it observed (message only, no PII), and allNetwork===true
              // demotes the aggregate to a breadcrumb in sentry.js.
              syncCrumb('sync.push.legacy', 'sync.push.legacy.errors', {
                errors: upload.errors,
                lastError: upload.lastError ?? null,
                allNetwork: upload.allNetwork === true,
              });
            }
          }
        }
        // 3. Per-table pull for migrated tables.
        for (const tableName of MIGRATED_TABLES) {
          // Abort the pull track the moment a sign-out wipe is committing (audit
          // 2026-07-01): the run-start guard (line ~76) only stops a NEW run;
          // a run already in flight when clearAuthStateForSignOut raises the flag
          // would otherwise keep pulling cloud rows straight back into the DB
          // being wiped (whenSyncIdle then times out and the wipe races them).
          // Re-checking here lets the in-flight run drain quickly and cleanly so
          // whenSyncIdle resolves before the wipe touches the DB.
          if (isSignOutWiping()) break;
          const result = await pullTable(tableName, { userId, localUserId }).catch((e) => {
            erroredCount += 1;
            syncCrumb(`sync.pull.${tableName}`, `sync.pull.${tableName}.threw`, {
              error: String(e?.message ?? e).slice(0, 200),
            });
            return { count: 0, errors: 1, _err: e };
          });
          pullCountPerTable[tableName] = result?.count ?? 0;
          if (result?.errors) {
            erroredCount += result.errors;
            syncCrumb(`sync.pull.${tableName}`, `sync.pull.${tableName}.errors`, {
              errors: result.errors,
              count: result.count ?? 0,
              skipped: result.skipped ?? null,
            });
          }
        }
        // 4. Legacy bulk pull for everything else. Skip entirely if a sign-out
        // wipe is committing — pulling here would repopulate the DB being wiped.
        if (!isSignOutWiping() && typeof sync.pullFromCloud === 'function') {
          const pull = await sync.pullFromCloud(userId).catch(e => {
            erroredCount += 1;
            syncCrumb('sync.pull.legacy', 'sync.pull.legacy.threw', {
              error: String(e?.message ?? e).slice(0, 200),
            });
            return { _err: e };
          });
          if (pull && typeof pull === 'object' && pull.pullCountPerTable) {
            pullCountPerTable = { ...pullCountPerTable, ...pull.pullCountPerTable };
          }
        }
      } catch (e) {
        status = 'failure';
        erroredCount += 1;
        _lastError = String(e?.message ?? e);
      }
    }

    queueAfter = await _livePendingCount(userId);
    if (erroredCount > 0) status = queueAfter < queueBefore ? 'partial' : 'failure';

    // Deleted-account residual sync (CURRENT_STATUS 2026-06-09, the
    // daily_steps FK noise): when the auth user has been deleted but the
    // device still holds a live JWT, every push fails its auth.users FK until
    // the token expires, logging errors for up to an hour. After an errored
    // cycle, ask Auth whether the user still exists; if the account is gone,
    // drop the local session so the device stops pushing as a ghost and the
    // navigator routes back to sign-in. A transient network failure never
    // matches the check, so flaky connectivity cannot sign anyone out.
    if (erroredCount > 0 && userId) {
      await _clearSessionIfAuthUserGone();
    }
  } finally {
    const durationMs = Date.now() - startMs;
    _lastRunAt = Date.now();
    _lastStatus = status === 'failure' ? 'error'
      : queueAfter > 0 ? 'pending'
      : 'synced';
    _runLock = false;
    _notifyIdle();

    trackSyncRun(userId, {
      status,
      duration_ms: durationMs,
      triggered_by: triggeredBy,
      pull_count_per_table: pullCountPerTable,
      push_count_per_table: pushCountPerTable,
      rejected_count: rejectedCount,
      errored_count: erroredCount,
      queue_depth_before: queueBefore,
      queue_depth_after: queueAfter,
    }).catch(() => {});
  }

  return {
    status: _lastStatus,
    duration_ms: Date.now() - startMs,
    queue_depth: queueAfter,
    // Surfaced so the sign-out push-first safety can refuse to wipe on any
    // error, including the narrow case where the queue drained to empty in
    // the same cycle (status 'partial' maps to 'synced' but errors occurred).
    errored_count: erroredCount,
  };
}

/**
 * If the signed-in auth user no longer exists (deleted account), drop the
 * local session. Returns true only when a session was actually cleared.
 *
 * The check is deliberately narrow: auth.getUser() must come back with a
 * 401/403 whose message says the user is gone (Supabase: "User from sub claim
 * in JWT does not exist" / user_not_found). Any other failure — offline,
 * timeout, 5xx — leaves the session untouched, so flaky connectivity can
 * never sign a real user out. signOut uses scope 'local' because there is no
 * server-side session left to revoke for a deleted account.
 *
 * Exported for tests. Lazy-requires the Supabase client so the runner stays
 * importable in test environments that mock the sync surface only.
 */
export async function _clearSessionIfAuthUserGone() {
  try {
    // eslint-disable-next-line global-require
    const { getSupabaseClient } = require('../supabase');
    const sb = getSupabaseClient();
    if (!sb) return false;
    const { data, error } = await sb.auth.getUser();
    if (!error && data?.user) return false;
    const statusCode = error?.status ?? null;
    const message = String(error?.message ?? '');
    const userGone = (statusCode === 401 || statusCode === 403)
      && /does not exist|user_not_found|sub claim/i.test(message);
    if (!userGone) return false;
    await sb.auth.signOut({ scope: 'local' });
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Single-table sync. Currently a thin wrapper that runs the full
 * cycle and reports the per-table counts; will become a true
 * per-table call as transport.js gains per-table push/pull paths.
 */
export async function syncTable(name, { userId, localUserId, triggeredBy = 'manual' } = {}) {
  if (!listSyncableTables().includes(name)) {
    throw new Error(`syncTable: unknown table '${name}' (not in SYNC_REGISTRY)`);
  }
  return syncAll({ userId, localUserId, triggeredBy });
}

/**
 * Snapshot of sync state for the UI indicator. SYNC_ARCHITECTURE_LOCKED.md
 * lines 266-276.
 *
 * Returns:
 *   {
 *     status: 'synced' | 'pending' | 'offline' | 'error' | 'unknown',
 *     queue_depth,
 *     last_run_at,
 *     last_error,
 *   }
 */
export async function getStatus() {
  const queueDepth = await _livePendingCount();
  return {
    status: _lastStatus,
    queue_depth: queueDepth,
    last_run_at: _lastRunAt,
    last_error: _lastError,
  };
}

/**
 * Test helper: reset the internal run lock + status snapshot. Not
 * exported via index.js.
 */
export function _resetRunnerForTests() {
  _runLock = false;
  _lastStatus = 'unknown';
  _lastRunAt = 0;
  _lastError = null;
  _idleWaiters = [];
}
