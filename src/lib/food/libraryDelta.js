/**
 * Food library delta puller.
 *
 * Step 3 of the food data plan. Pulls cloud-side `foods` rows
 * updated since this device's last pull, upserts into the local
 * foods cache. Keeps the cached library fresh between APK releases.
 *
 * Pairs with:
 *   - assets/seed/off_uk_snapshot.json (the build-time bundle that
 *     primes a fresh install)
 *   - supabase/migrate_028_food_library_pull.sql (the read-only RPC
 *     that returns changed rows since a timestamp)
 *
 * Cadence: called once per app foreground transition, no oftener
 * than the throttle interval below. Cheap when there's nothing to
 * pull (~1 round-trip returning an empty array).
 *
 * Failure mode: every error is logged with the boundary it occurred
 * at (no-session / no-client / RPC error / chunk insert / cursor
 * persist). On any failure the function returns; local cache is
 * unchanged from this run, app continues to work via whatever's
 * already cached + live OFF / USDA fallback. No load-bearing
 * dependency.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db, uid as makeUid, runInTransaction } from '../database';
import { getSupabaseClient, withClockSkewRetry } from '../supabase';
import { logInfo, logWarn, logError } from '../errorLog';
import { microSqlColumns, microSqlPlaceholders, microSqlUpsertExcluded, microValuesFromRow } from './micronutrients';

const CURSOR_KEY = '@volyume_food_library_pull_cursor_v1';
const THROTTLE_KEY = '@volyume_food_library_pull_last_ms_v1';
const THROTTLE_MS = 6 * 60 * 60 * 1000;   // pull at most every 6 hours
const PAGE_SIZE = 5000;                    // matches the RPC LIMIT
const MAX_PAGES_PER_RUN = 5;               // 25k rows max per app foreground

let _inFlight = null;

/**
 * Pull foods that changed since the cursor, repeating until the
 * server returns less than a full page or we hit MAX_PAGES_PER_RUN.
 * Concurrent callers share a single in-flight run.
 */
export async function pullFoodLibraryDelta({ force = false } = {}) {
  if (_inFlight) return _inFlight;
  _inFlight = _run({ force }).finally(() => { _inFlight = null; });
  return _inFlight;
}

async function _run({ force }) {
  const t0 = Date.now();

  // ── 0. Throttle ───────────────────────────────────────────────────
  if (!force) {
    try {
      const last = parseInt(await AsyncStorage.getItem(THROTTLE_KEY), 10);
      if (Number.isFinite(last) && (Date.now() - last) < THROTTLE_MS) {
        return { ok: true, reason: 'throttled', pulledRows: 0 };
      }
    } catch (_) { /* tolerate -- treat as not throttled */ }
  }

  // ── 1. Need an authenticated client ──────────────────────────────
  const sb = getSupabaseClient();
  if (!sb) {
    logWarn('food.libraryDelta.noClient', 'no supabase client; skip');
    return { ok: false, reason: 'no_client', pulledRows: 0 };
  }
  try {
    const { data: sess } = await sb.auth.getSession();
    if (!sess?.session?.user?.id) {
      // Not signed in: there is no point pulling.
      return { ok: true, reason: 'no_session', pulledRows: 0 };
    }
  } catch (e) {
    logWarn('food.libraryDelta.session', e?.message ?? 'unknown', {});
    return { ok: false, reason: 'session_failed', pulledRows: 0 };
  }

  // ── 2. Load the cursor ───────────────────────────────────────────
  let cursor = null;
  try {
    cursor = await AsyncStorage.getItem(CURSOR_KEY);
  } catch (_) { /* treat as initial sync */ }

  logInfo('food.libraryDelta.start',
    `pull since=${cursor ?? 'epoch'} (force=${!!force})`);

  // ── 3. Paginate until exhausted or capped ────────────────────────
  let d;
  try {
    d = await db();
  } catch (e) {
    logError('food.libraryDelta.dbOpen', e, { message: e?.message });
    return { ok: false, reason: 'db_open_failed', pulledRows: 0 };
  }

  let totalPulled = 0;
  let pages = 0;
  let highestUpdatedAt = cursor;

  for (let page = 0; page < MAX_PAGES_PER_RUN; page++) {
    let rows = null;
    try {
      // PGRST303 clock skew (2026-09-06, Sentry VOLYUME-32): the device clock
      // sitting a second or two ahead of Dublin makes PostgREST reject the JWT
      // as "issued at future". It is transient and the same token works on a
      // retry, so wait it out once rather than breaking the page loop and
      // leaving the library stale until the next throttle window.
      const { data, error } = await withClockSkewRetry(() => sb.rpc('food_library_pull', {
        _since: highestUpdatedAt,
      }));
      if (error) {
        logWarn('food.libraryDelta.rpc', error.message, {
          code: error.code, page,
        });
        break;
      }
      rows = Array.isArray(data) ? data : [];
    } catch (e) {
      logError('food.libraryDelta.rpcThrew', e, { page, message: e?.message });
      break;
    }

    if (rows.length === 0) {
      // Reached the tip of the change log; no more to pull.
      break;
    }

    // Upsert this page into local foods. Chunk insert wrapped in a
    // transaction. INSERT OR REPLACE keyed on (source, source_id)
    // via the unique index; for rows without source_id we fall back
    // to (id) replace, but cloud foods always have source_id.
    // Rides the app-wide runInTransaction queue (2026-07-12, same fix
    // class as VOLYUME-1N in food/seed.js): a raw BEGIN here could
    // interleave with a queued transaction on the shared connection and
    // die with "cannot commit - no transaction is active".
    const now = Date.now();
    try {
      await runInTransaction(d, async () => {
      for (const row of rows) {
        try {
          const sourceId = row.source_id ?? row.id;
          // Find existing local row by (source, source_id) so we
          // preserve the local id (downstream FKs may point at it).
          const existing = await d.getFirstAsync(
            'SELECT id FROM foods WHERE source = ? AND source_id = ? LIMIT 1',
            [row.source, sourceId]
          );
          const localId = existing?.id ?? makeUid();
          await d.runAsync(
            `INSERT INTO foods
              (id, source, source_id, barcode_ean, name, brand,
               serving_g, serving_label,
               kcal_100g, protein_100g, carbs_100g, fat_100g, fibre_100g,
               sodium_100g, sugar_100g, ${microSqlColumns},
               verified, fetched_at, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${microSqlPlaceholders}, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               barcode_ean = excluded.barcode_ean,
               name = excluded.name,
               brand = excluded.brand,
               serving_g = excluded.serving_g,
               serving_label = excluded.serving_label,
               kcal_100g = excluded.kcal_100g,
               protein_100g = excluded.protein_100g,
               carbs_100g = excluded.carbs_100g,
               fat_100g = excluded.fat_100g,
               fibre_100g = excluded.fibre_100g,
               sodium_100g = excluded.sodium_100g,
               sugar_100g = excluded.sugar_100g,
               ${microSqlUpsertExcluded},
               verified = excluded.verified,
               fetched_at = excluded.fetched_at,
               updated_at = excluded.updated_at`,
            [
              localId, row.source, sourceId, row.barcode_ean ?? null,
              row.name ?? 'Unknown', row.brand ?? null,
              _num(row.serving_g) ?? 100, row.serving_label ?? null,
              _num(row.kcal_100g), _num(row.protein_100g),
              _num(row.carbs_100g), _num(row.fat_100g),
              _num(row.fibre_100g), _num(row.sodium_100g), _num(row.sugar_100g),
              ...microValuesFromRow(row, _num),
              row.verified ? 1 : 0,
              _msSince(row.fetched_at) ?? now,
              now, _msSince(row.updated_at) ?? now,
            ]
          );
          totalPulled++;
        } catch (_rowErr) {
          // One bad row -- skip. Don't log per row; surfaces in the
          // page-level totals so we don't spam Sentry on a malformed
          // entry that hits every pull cycle.
        }
      }
      });
    } catch (chunkErr) {
      // runInTransaction has already rolled the page back.
      logError('food.libraryDelta.chunk', chunkErr, {
        page, chunkSize: rows.length, message: chunkErr?.message,
      });
      // Don't advance the cursor -- next run retries this delta.
      break;
    }

    // Advance the cursor to the highest updated_at we just saw.
    const newCursor = rows[rows.length - 1]?.updated_at ?? null;
    if (newCursor) highestUpdatedAt = newCursor;
    pages++;

    if (rows.length < PAGE_SIZE) {
      // Last page (server returned fewer than the limit).
      break;
    }
  }

  // ── 4. Persist cursor + throttle stamp ───────────────────────────
  if (highestUpdatedAt && highestUpdatedAt !== cursor) {
    try {
      await AsyncStorage.setItem(CURSOR_KEY, String(highestUpdatedAt));
    } catch (e) {
      logWarn('food.libraryDelta.cursor.persist', e?.message ?? 'unknown', {
        highestUpdatedAt,
      });
    }
  }
  try {
    await AsyncStorage.setItem(THROTTLE_KEY, String(Date.now()));
  } catch (_) { /* tolerate */ }

  const ms = Date.now() - t0;
  logInfo('food.libraryDelta.done',
    `pulled=${totalPulled} pages=${pages} ms=${ms} cursor=${highestUpdatedAt ?? 'unchanged'}`);

  return {
    ok: true,
    reason: 'pulled',
    pulledRows: totalPulled,
    pages,
    cursor: highestUpdatedAt,
    ms,
  };
}

function _num(v) {
  if (v == null) return null;
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : null;
}

function _msSince(iso) {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}
