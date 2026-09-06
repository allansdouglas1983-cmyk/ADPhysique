# 03 — Recon: data, sync, security and lifecycle machinery

Read-only recon for the Social / Community / Discovery campaign (founder brief
2026-09-06). Scope: what a NEW cloud-backed, cross-user social system must plug
into. Partners *tables* are inventoried by the sibling recon (01); this file
names the partner mechanism only where it is the sole precedent for a
cross-user read.

Every claim carries `file:line`. Quotes are verbatim.

---

## 1. Cloud migration conventions

**Where the rules live.** `supabase/README.md` is the authoritative tracker.
- `supabase/README.md:3-9` — "**Migration tracking is mandatory** per `CLAUDE.md` § 2 … an undocumented migration is not considered complete."
- `supabase/README.md:16-23` — cloud migrations are **CLAUDE-RUN** since 2026-07-10; the gate is unchanged: "nothing is applied to EU-Dublin without the founder's exact phrase \"run against production\" in that session, given AFTER Claude has presented the audited apply list." Each apply is followed by read-only re-verification of every object.
- Applies go through the Supabase MCP `apply_migration` path and land a row in `supabase_migrations.schema_migrations` (`supabase/README.md:214-232`).

**Status block (as of 2026-09-05/06).**
- Applied to EU-Dublin: `001-048, 050-071, 073-154, 156-159` (`supabase/README.md:76-79` for the 154/156/157 statement; `supabase/README.md:214-232` for the 2026-09-05 batch that added **158 and 159 APPLIED AND VERIFIED**).
- **049 HELD** — destructive `drop peak_week_plans`, client prerequisite not landed, "must not be applied" (`supabase/README.md:63-66`).
- **150 RETIRED, NEVER TO BE RUN** — founder no-outside-party law + Q4 ruling; file kept as a no-op for numbering (`supabase/README.md:424`).
- **155 BLOCKED on a client fix** — its new INSERT policy requires `sent_on` to equal the DB's UTC date, but `src/lib/partners/service.js` `insertCheerDirectly` stamps `todayLocalKey()` (local). "The client fallback must stamp the UTC date and that build must be in users' hands before 155 runs." (`supabase/README.md:80-89`). **Directly relevant to social: any per-day rate key must be server/UTC-stamped, never client-local.**
- **072** never applied and never will be; its content shipped inside 118 (`supabase/README.md:267`, `:348`).

**Numbering.** Files are `supabase/migrate_NNN_snake_name.sql`, numeric order.
Highest existing number is **159** (`supabase/migrate_159_workout_set_evidence_class.sql`). Gaps: 011, 026, 082, 083 never used; **085 is used twice** (`migrate_085_food_quality_telemetry.sql`, `migrate_085_notification_preferences_checkin_missed.sql`) and **152 twice** (`migrate_152_capability_adaptation_mode.sql`, `migrate_152_p0_restrict_internal_security_definer_execute.sql`). A new social migration starts at **160**.

**Header template (verbatim shape, from `supabase/migrate_159_workout_set_evidence_class.sql:1-60`):**

```sql
-- migrate_159_workout_set_evidence_class.sql
--
-- Purpose:           <what + authority doc + the exact column/table semantics>
--                    Push:  <client module that sends it, and any feature flag>
--                    Pull:  <client module that reads it, and the null-degrade>
--
-- Applied locally:   YES (database.js SCHEMA_MIGRATIONS: one ALTER TABLE ADD
--                    COLUMN on workout_sets, no backfill ...)
--
-- Applied remotely:  YES - 2026-09-05, Claude-run on the founder's exact
--                    phrase, via the Supabase MCP apply_migration path;
--                    columns, CHECK constraint and ledger row verified
--                    read-only afterwards (supabase/README, 2026-09-05 batch).
-- Safe to re-run:    YES - IF NOT EXISTS / duplicate-tolerant.
--
-- Rollback:          alter table public.workout_sets drop column if exists evidence_class;
--                    Additive and unread by any pre-EL-7 client ...
--
-- GDPR note:         No new user data category. ...
```

Body convention: `add column if not exists`, CHECK constraints wrapped in a
`do $$ … exception when duplicate_object then null; end $$;` block
(`supabase/migrate_159_*.sql:62-76`), then an `-- ─── Acceptance check ───`
`select` over `information_schema` (`:78-83`).

**Postgres functions (RPCs) — every `create [or replace] function` in `supabase/`.** Latest definition wins; the file named is where the current shape lives.
- `delete_user_data()` — purges every `public.*` row for `auth.uid()`; re-created many times, current shape `supabase/migrate_154_workout_notes_conflict_target_and_deletion_completeness.sql:230-370`.
- `record_engine_telemetry(...)` — allow-listed telemetry ingress; current allow-list `supabase/migrate_156_activation_funnel_telemetry.sql`.
- `record_health_consent(...)` — Article 9 consent audit row (`migrate_019_health_consent.sql`).
- `record_capability_consent(...)` — capability-lane consent audit (`migrate_147_capability_consent.sql`).
- `record_partner_consent(...)` — partner-sharing consent (`migrate_102_partner_safety_consent.sql`).
- `food_sync_push` / `food_sync_pull` — the food-domain bulk RPC pair (`migrate_016`, current `migrate_118_workouts_recipes_sync_schema_fix.sql`).
- `food_library_pull` (`migrate_028`, current `migrate_116`), `food_frequents_pull` + `refresh_food_frequents` (`migrate_051`).
- `create_partner_invite`, `redeem_partner_invite` (`migrate_081`, current `migrate_102`), `end_partnership` (`migrate_092`, current `migrate_107`).
- `start_cascade`, `upgrade_tier`, `upgrade_tier_for_user`, `cascade_advance_due_users`, `current_pricing_window`, `_tier_for_trial_state`, `protect_users_profile_tier` — dormant billing/tier lane (`migrate_030`, `033`, `042`, `067`, `068`, `070`, `095`).
- `clear_goal_lock` (`migrate_017`), `record_account_deletion_started/_completed` (`migrate_039`, `097`), `record_rpc_fallback_deletion` + `private.sweep_incomplete_account_deletions` (`migrate_098`).
- `apply_founder_pro_entitlement` + `private.is_founder_pro_email/_user`, `private.email_trial_hash` (`migrate_071`, `108`).
- `_partner_first_name(uuid)` — first whitespace token of the enrolment name, ≤40 chars, `REVOKE EXECUTE … FROM authenticated` (`migrate_102_partner_safety_consent.sql:154-168`). **The only existing "show another user a name" primitive, and it is server-side only.**
- Many `_<table>_touch_updated_at()` / `_<table>_refuse_stale()` triggers (`migrate_044`, `046`, `047`, `053`, `056`, `060`, `064`, `110`, `134`, `140`, `141`, `145`, `146`); `mesocycle_weeks_inherit_user_id` / `routine_exercises_inherit_user_id` / `recipe_ingredients_inherit_user_id` (`migrate_018`, `021`); `recompute_daily_intake_rollup` + `food_entries_rollup_trigger` (`migrate_015`).

**Edge functions (`supabase/functions/`), one line each:**
- `delete-account/index.ts` — verifies caller JWT, calls `delete_user_data` under that JWT, then service-role deletes `auth.users` for the same uid (`:11-22`).
- `partner-cheer/index.ts` — one cheer per pair per UTC day; the unique `(…, sent_on)` constraint IS the rate limit, 429 `already_cheered` on duplicate (`:8`, `:24`, `:130`).
- `send-push/index.ts` — service-role-only fan-out to `device_push_tokens` via Expo push; "The client app must never call this" (`:16-21`).
- `play-billing-rtdn/index.ts` — Google RTDN webhook (dormant billing lane).
- `app-store-verify/index.ts`, `app-store-notifications/index.ts` — Apple receipt/notification lane (dormant).
- `_shared/appStore.ts`, `_shared/boundedJson.ts` (+ test) — shared helpers; `boundedJson` caps request-body size.

---

## 2. Cloud tables today and their RLS pattern

**The pattern is owner-only, everywhere, with four documented exceptions.**
There are 127 `CREATE POLICY` statements across `supabase/migrate_*.sql`; the
dominant form is literally `FOR ALL USING (auth.uid() = user_id) WITH CHECK
(auth.uid() = user_id)` — e.g. the generated loop in
`supabase/migrate_012_complete_sync.sql:320`:

```sql
'CREATE POLICY "Users manage own %s" ON %I FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)',
```

`users_profile` uses `auth.uid() = id` (`supabase/migrate_005_rls_hardening.sql:34`).

The canonical disposition map is `scripts/security/supabase-matrix.targets.json`
— 85 tables, of which **69 are `owner`**, plus:
- `child_owner` (6): `routine_exercises`, `mesocycle_weeks`, `workout_sets`, `planned_muscle_volume`, `adaptation_events`, `recipe_ingredients`.
- `authority_read_only` (3): `tier_history`, `food_frequents`, `engine_overrides`.
- `global_read_only` (3): `foods`, `exercises`, `pricing_config` — authenticated `SELECT USING (true)` (`supabase/migrate_015_food_logging.sql:45-49`, `supabase/migrate_030_tier_infrastructure.sql:110-114`). These are **catalogue** rows, not user rows.
- `pair` (6): `partnerships`, `partner_week_signals`, `partner_cheers`, `partner_shared_blocks`, `partner_weekly_intentions`, `partner_win_cards`.
- `one_way_telemetry` (1): `scan_calibration_events` — `WITH CHECK (true)`, insert-only (`supabase/migrate_126_scan_calibration_events.sql:52`).
- `service_only` / `private_service_only` (4): `account_deletions_log`, `private.trial_ledger`, `private.founder_pro_ledger`, `private.trial_salt`.
- marketing tables (10): admin-gated by `EXISTS (SELECT 1 FROM marketing_admins ma WHERE ma.email = (auth.jwt() ->> 'email'))` (`supabase/migrate_121_marketing_hq_tables.sql:122-129`), or `bounded_public_insert` to `anon` with no SELECT grant (`supabase/migrate_120_marketing_waitlist.sql:50-68`).

**Is ANY table readable by another end user today?** Only the six `pair`
tables, and only through an *active partnership* membership predicate — e.g.
`supabase/migrate_081_training_partners.sql:140-152`:

```sql
CREATE POLICY "Pair members read signals" ON partner_week_signals
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM partnerships p
      WHERE p.id = partner_week_signals.pair_id
        AND p.status = 'active'
        AND (auth.uid() = p.member_a OR auth.uid() = p.member_b)
    )
  );
```

**There is NO policy anywhere that lets an arbitrary authenticated user read
another user's row.** `users_profile` in particular is owner-only. A social
system needs an entirely new, deliberately-scoped read surface — there is no
existing "public profile" precedent to extend.

**`users_profile` columns.** Base table `supabase/schema.sql` (stale snapshot,
`CREATE TABLE users_profile`): `id UUID PK REFERENCES auth.users(id)`,
`username TEXT UNIQUE`, `first_name TEXT`, `training_focus`, `training_age`,
`primary_equipment`, `units`, `tier`, `bar_weight`, `goal_start_date`,
`created_at`, `updated_at`. Added by migration:
- `first_name`, `tier`, `bar_weight` (`migrate_001:5-7`), `is_beta_tester` (`migrate_002:5`)
- `health_data_consent`, `health_data_consent_at` (`migrate_019:23-24`)
- `trial_state` (`migrate_030:32`), `billing_period` (`migrate_066:32`)
- `column_updates_at jsonb` (`migrate_045`, the per-column merge map; also `migrate_112`)
- `diet_preference` (`migrate_055:47`), `sex` (`migrate_094:31`)
- `capability_data_consent`, `capability_data_consent_at` (`migrate_147:36-38`)

**There is no avatar, no bio, no handle in use.** `username` exists in the
stale snapshot and is not written by the client profile sync
(`src/lib/sync/tables/profiles.js`); `first_name` is the only display-name
field, and it is exposed to a partner **only** via the server-side
`_partner_first_name` helper, never by a cross-user SELECT.

---

## 3. Local schema conventions (`src/lib/database.js`, 12,932 lines)

- **Base schema** is one `execAsync` block of `CREATE TABLE IF NOT EXISTS` at `src/lib/database.js:221-444`, then `await runMigrations(opened)` at `:445`; `_db` is published only after migrations complete (`:446-450`).
- **Migrations** are `SCHEMA_MIGRATIONS` (`src/lib/database.js:463`), an array of arrays; each entry is one version, an ordered list of SQL strings (or async functions for data migrations). The contract, `src/lib/database.js:453-462`:
  > "The applied version is tracked in SQLite's own `PRAGMA user_version`, so every migration runs exactly once … **IMPORTANT: never edit or reorder an existing migration once shipped. Only append new ones.**"
- Head version: `export const CURRENT_SCHEMA_VERSION = SCHEMA_MIGRATIONS.length;` (`src/lib/database.js:2835`). **89 entries today** (counted from the literal; the last is `ALTER TABLE exercises ADD COLUMN aliases/load_character`, `:2827-2830`). Pinned by `src/__tests__/campaign7.upgrade.test.js:116`.
- Runner: reads `PRAGMA user_version` (`:3114`), snapshots before migrating (`:3136`), applies each version's ops then `PRAGMA user_version = ${v + 1}` in the SAME transaction (`:3187-3212`). `addColumnIfMissing` (`:2837`) proves the column landed by re-reading `PRAGMA table_info`.
- **Adding a table** = append one entry with `CREATE TABLE IF NOT EXISTS …` + its indexes, and a header comment stating purpose, "Applied: LOCALLY via this user_version bump", the cloud counterpart migration number, additive/idempotent status and rollback. Worked example: `plan_folders` at `src/lib/database.js:1551-1565` (paired with `supabase/migrate_089_plan_folders.sql`).
- **IDs:** `export function uid()` (`src/lib/database.js:70-79`) returns a **UUID v4 string** — "required so rows sync cleanly to Supabase, whose primary-key columns are typed UUID." The CSPRNG variant with prefixes is `src/lib/uuid.js` (`generateUUID(prefix)`, `secureRandomBytes` at `:26`), used by `syncQueue` (`src/lib/syncQueue.js:32-34`) and the food domain.
- **Timestamps:** epoch ms INTEGER locally; ISO strings on the wire. Handlers convert both ways (`src/lib/sync/tables/planFolders.js:26-38`, `_toIso` / `_toMs`). Local-day keys via `src/lib/dayKey.js` (`localDayKey:17`, `todayLocalKey:61`, `localWeekStartMs:130` — UK-local, Monday weeks).
- **Soft delete:** `deleted_at` column, tombstones are pushed like ordinary rows and applied on pull; server hard-deletes after 30 days (`src/lib/sync/registry.js:17-19`).
- **Owner column:** every user-scoped local table carries `user_id TEXT`; the cloud counterpart is `PRIMARY KEY (user_id, id)` per `docs/IDENTITY_AND_OWNERSHIP_LOCKED.md:32-36` ("Composite primary keys … Two users cannot collide on a row at the schema level").

**Account isolation, locally.**
- Locked decisions: no anonymous mode; **sign-out wipes local data**; composite PKs; no destructive cleanup of existing user data (`docs/IDENTITY_AND_OWNERSHIP_LOCKED.md:25-42`). The principle: "A row's `user_id` is set at INSERT and never changes … Local SQLite holds at most one user's data at a time; sign-out empties it." (`:45-49`).
- **Owner marker:** AsyncStorage key `@volyume_last_supabase_user_id`, read at `src/navigation/RootNavigator.js:1278` (`readDeviceOwner`).
- **Boundary preflight:** `src/lib/accountTransitionGuard.js` — `prepareIncomingAccountOnce` (`:10`) is fail-closed: unreadable marker → `owner_marker_unreadable` (`:25-29`); no marker → `verifyFirstAccountClean` must pass or `unowned_local_residue` (`:31-41`); different uid → prompt, then `beginAccountEpoch` → `quiesceAccountWork` → `wipeNotifications` → `wipeDatabase` → `wipeStorage` → `resetMemory` → re-stamp and **read back** the marker (`:63-121`). Transitions are serialised through `transitionTail` (`:126-131`).
- **Residue proof:** `verifyNoForeignLocalData(incomingUserId)` (`src/lib/database.js:6963`) scans every `WIPE_DIRECT_TABLES` table for `user_id IS NULL OR user_id <> ?` (`:6967-6979`), four parent-join child checks (`:6982-7005`), the six **non-user-keyed pair mirrors** (any row at all is disqualifying, `:7006-7016`), custom exercises, and the private file namespaces `progress_photos/users/<uid>/` + snapshot dir (`:7028-7060`).
- **Wipe set:** `export const WIPE_DIRECT_TABLES` (`src/lib/database.js:6875-6934`) — every user-scoped local table. `FATAL_LOCAL_WIPE_TABLES` (`:6936-6947`) are tables whose wipe failure aborts sign-out (photos, scans, and all six partner mirrors). **A new social table MUST be added to both lists or it survives sign-out onto the next account** — that omission is recorded as "a real ownership leak, not cosmetic" (`:6907-6912`).
- **Sign-out sync guard:** `src/lib/sync/signOutGuard.js` — a module-level `_wiping` flag, `setSignOutWiping` / `isSignOutWiping` (`:18-25`). Push-first sign-out runs `syncAll`, then sets the flag, then wipes; `syncAll` bails while set (`:9-16`). Set/cleared from `src/store/useAppStore.js:328` and `clearAuthStateForSignOut` (`:434`).

---

## 4. Sync registry — how to register a new synced table

**The entry shape (verbatim, `src/lib/sync/registry.js:257-266`):**

```js
  {
    // Plan folders (Hevy teardown R1). User-owned organisation of the My Plans
    // list (= programmes); FREE feature, no Pro gate. One row per folder, own-row
    // RLS. Bidirectional LWW on epoch-ms updated_at, soft-delete tombstones
    // propagate (deleting a folder unfiles its plans and tombstones the folder).
    // Cloud migration 089. Handler: src/lib/sync/tables/planFolders.js.
    table: 'plan_folders',
    pk: 'id',
    conflictStrategy: 'last_write_wins',
    serverAuthoritative: false,
    softDelete: true,
    direction: 'bidirectional',
  },
```

Fields: `table` (cloud table name), `pk` (string or string[] for composite —
e.g. `pk: ['pair_id', 'user_id', 'week_start']` at `:234`), `conflictStrategy`
(`'last_write_wins' | 'server_wins' | 'merge'`), `serverAuthoritative`,
`softDelete`, `direction` (`'bidirectional' | 'pull_only'`). Strategies are
documented at `src/lib/sync/registry.js:11-19`. `SYNC_REGISTRY` starts at `:22`;
`getRegistryEntry` `:281`, `listSyncableTables` `:285`.

There is **no `toRow`/`fromRow`/`pullFilter` in the registry entry** — that
logic lives in the per-table handler file. Registration is four coordinated
steps (`src/lib/sync/transport.js:72-77`):
1. add the registry entry in `src/lib/sync/registry.js`;
2. write `src/lib/sync/tables/<table>.js` exporting `push<Table>(sb, {userId, localUserId})` and `pull<Table>(sb, {userId, localUserId})`, each returning `{ count, errors, skipped? }` and **never throwing** (model: `src/lib/sync/tables/planFolders.js`);
3. add the name to `MIGRATED_TABLES` (`src/lib/sync/transport.js:88`) and to `PUSH_HANDLERS` (`:112`) / `PULL_HANDLERS` (`:141`);
4. extend the tests (`src/lib/sync/__tests__/sync.registry.test.js` `EXPECTED_TABLES`, and the regression matrix).

**`MIGRATED_TABLES`** = the set of tables whose push+pull is owned by the
registry-driven transport rather than the legacy `bulkUploadLocalData` /
`pullFromCloud` in `src/lib/sync.js` (`src/lib/sync/transport.js:69-87`). 22
tables today; `PULL_HANDLERS` 22, `PUSH_HANDLERS` 18 (four are pull-only). The
runner iterates them in array order — push all (`src/lib/sync/runner.js:205-247`),
then legacy bulk push (`:249-286`), then pull all (`:288-311`), then legacy bulk
pull (`:313+`). `recipe_ingredients` is listed last so its parent `recipes`
moves first (`transport.js:107-109`).

**Pull filters by user explicitly.** Handlers do `.eq('user_id', userId)`
(`src/lib/sync/tables/planFolders.js:98-101`); RLS is the floor, the filter is
the intent. Incremental pulls use per-`(user, table)` watermarks in AsyncStorage
under `@volyume_pull_wm_` / `@volyume_push_wm_` (`src/lib/sync/watermark.js:29-38`),
advanced by `nextWatermark = max(existing, max received updated_at)` (`:69-71`),
queried with `.gte(cursorIso)` so the boundary row is re-pulled (`:22-24`).
Sign-out clears AsyncStorage, so the next sign-in does a full pull (`:14-21`).

**Conflict.** `src/lib/sync/conflict.js` `resolve({table, recordId, local, server, userId})`
(`:21`) dispatches on the registry strategy: `server_wins` (`:34-37`),
`merge` — per-column via the `column_updates_at` jsonb map, `profiles` only,
falling back to LWW when the server has no map (`:38-52`, `mergeColumns` `:84`),
and `last_write_wins` on `updated_at` (`:53-59`). Every resolve fires
`trackSyncConflictResolved` (`:61-66`).

**Push-on-save + queue.**
- Every mutating write in `database.js` calls `_scheduleSync()` (`src/lib/database.js:63-68`) → `scheduleSync()` (`src/lib/sync.js:624`), a ~2s debounce that coalesces rapid edits (`src/lib/sync.js:613-625`).
- Failures are enqueued in SQLite `pending_sync_ops` (created `src/lib/database.js:696`). API: `enqueueSyncOp(opType, entityId, userId, payload)` (`src/lib/syncQueue.js:48`), `drainSyncQueue(sb, userId)` (`:76`) on foreground, `getQueueStats`, `clearQueueForUser` (used by Delete account). Backoff `[0, 1min, 5min, 30min, 2h, 8h]`, `MAX_RETRIES = 6` (`src/lib/syncQueue.js:24-25`). A drain against a dead session is deferred whole rather than burning retries (`:78-86`).
- The registry `sync_queue` was built, never fed, and deleted; `pending_sync_ops` is the live queue (`src/lib/sync/runner.js:18-22`).

**Gates on every push/pull, per call.** `_transportBlockedReason(userId)`
(`src/lib/sync/transport.js:183-197`) returns `'sign_out_wiping'` or
`'health_consent_unresolved'`; **any read failure counts as unresolved
(closed), never as consent** (`:177-182`). `syncAll` repeats the same three
gates plus a live-token check: sign-out wiping (`runner.js:94`), health consent
`!== true` (`:111`), `hasLiveSession() === false` (`:131-135`), run lock (`:137`).

**Existing cross-user read mechanism (one line):** `src/lib/sync/tables/partners.js`,
registered as the pair-scoped `partner_signals` entry
(`src/lib/sync/registry.js:230-240`), pulls **both members'** rows for the
caller's active pairs under the `EXISTS (SELECT 1 FROM partnerships …)` RLS
predicate — plus the `create_partner_invite` / `redeem_partner_invite` /
`end_partnership` SECURITY DEFINER RPCs and the `partner-cheer` edge function
for anything RLS cannot express.

---

## 5. Supabase client

- Created lazily in `getSupabaseClient()` (`src/lib/supabase.js:208-238`): `createClient(url, key, { auth: { storage: secureAuthStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false } })` (`:215-222`). Env: `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
- The raw client is wrapped by `instrumentSupabase` from `src/lib/observability.js` so **every `.from(table)` and `.rpc(name)` emits a breadcrumb** with table/operation/duration (`src/lib/supabase.js:223-235`).
- Session storage is `expo-secure-store` (`secureAuthStorage`), chunked; auto-refresh is bound to AppState so a locked phone never refreshes against an unreadable Keychain (`src/lib/supabase.js:241-266`) — the root cause of the VOLYUME-2D/2F/2H 42501 write-loss cascade.
- `hasLiveSession()` is deliberately tri-state — `true` / `false` / `null` ("could not determine"), and only an answered `getSession()` with no (or expired-and-unrefreshable) token returns `false` (`src/lib/supabase.js:286-330`).
- **Realtime: not used anywhere.** No `.channel(`, no `.subscribe()` against Supabase in `src/` (the only `unsubscribe()` is the auth state listener, `src/navigation/RootNavigator.js:1923`). A live feed would be the first realtime consumer.
- **Storage buckets: not used at all.** No `.storage.from(` anywhere in `src/`, and no `storage.objects` / bucket policy in any migration. Progress photos are **device-local files** under `${documentDirectory}progress_photos/users/<uid>/` (`src/lib/database.js:7032-7040`). **Any social system with images needs a bucket + its policies built from scratch, and a new GDPR/residency argument for it.**
- **RPCs called from the client**, all through `getSupabaseClient().rpc(...)` (no dedicated helper wrapper): `delete_user_data`, `record_rpc_fallback_deletion`, `record_health_consent` (`src/hooks/useAccountActions.js:269,288,478`; `src/screens/Article9ConsentScreen.js:83`; `src/lib/consent/pendingConsent.js:52`), `record_capability_consent` (`src/lib/consent/capabilityConsent.js:50,112`), `record_engine_telemetry` (`src/lib/telemetry/transport.js`), `food_library_pull` (`src/lib/food/libraryDelta.js`), `food_frequents_pull` (`src/lib/food/frequents.js`), `food_sync_push`/`food_sync_pull` (`src/lib/sync/tables/foodDomain.js`), `record_partner_consent` (`src/lib/partners/consent.js`), `create_partner_invite`/`redeem_partner_invite`/`end_partnership` (`src/lib/partners/service.js`), plus the dormant cascade RPCs (`src/lib/payments/cascade.js`). The canonical list is `scripts/security/supabase-matrix.targets.json` → `clientRpcNames` (17 names).
- **"Components never query Supabase directly" — enforcement is NOT a lint rule.** `eslint.config.js` has no `no-restricted-imports` for supabase, and `npm run lint` would not catch it. The de-facto enforcement is (a) the architectural convention, (b) `scripts/check-imports.cjs` run by `release:quality`, and (c) `supabase/migrate_119_lock_direct_client_writes.sql` — which REVOKEs direct `authenticated` writes on `partnerships`, `engine_telemetry`, `consent_log` and re-keys the `partner_weekly_intentions` UPDATE policy so a SECURITY DEFINER RPC is the only ingress (`:1-46`). Three screens still call `getSupabaseClient()` directly: `src/screens/Article9ConsentScreen.js`, `src/screens/SettingsDataScreen.js`, `src/screens/ProUpgradeScreen.js` — consent + account + dormant-billing paths.

---

## 6. Account deletion, sign-out and account switch

**Delete account (and consent withdrawal — the same pipeline).**
1. `src/hooks/useAccountActions.js` → `performDeleteAccount(reason = 'user_requested')` (`:199`). Withdraw-consent calls it with `'consent_withdrawal'` (`:506`) because losing Article 9 consent removes the lawful basis (`:18-24`).
2. `markAuthDeletionPending` / `establishAuthDeletionBackstop` (`src/lib/deletionRetry.js`) stamp a durable marker first.
3. `sb.functions.invoke('delete-account', …)` (`:238`) — the edge function verifies the JWT, calls `delete_user_data` **under the user's JWT so RLS still scopes it**, then service-role deletes `auth.users` (`supabase/functions/delete-account/index.ts:11-22, 68-80`).
4. Fallback when the function is unreachable: `sb.rpc('delete_user_data')` (`:269`) then `sb.rpc('record_rpc_fallback_deletion')` (`:288`); `src/lib/deletionRetry.js:125-160` retries the edge function later; `private.sweep_incomplete_account_deletions` (`supabase/migrate_098`) sweeps server-side.
5. Local: `wipeAllUserDataWithRetry(userId)` (`:332`, defined `src/lib/database.js:7375`, core `wipeAllUserData` `:7098` over `WIPE_DIRECT_TABLES`), then `clearDeletedAccountStorage`, then cloud `signOut()`.

**`delete_user_data()` coverage** — 77 `DELETE FROM` statements, each wrapped
`BEGIN … EXCEPTION WHEN undefined_table THEN NULL; END;` so a table that does
not exist yet is tolerated (`supabase/migrate_154_*.sql:230-370`). Partner
tables are deleted through the pair (`:314-341`); `partner_blocks` deletes on
`blocker_id OR blocked_id` (`:341`); the last statement is
`DELETE FROM users_profile WHERE id = uid;` (`:370`).
**A new social schema MUST be added here in a new migration that re-issues
`CREATE OR REPLACE FUNCTION delete_user_data()` in full** — and note the
migrate_130 ACL is preserved only because `CREATE OR REPLACE` keeps an existing
ACL (`supabase/README.md:160-164`). Rows keyed by *both* participants (follows,
blocks, DMs) need the two-sided `WHERE a = uid OR b = uid` form, per
`partner_blocks`.

**Sign-out.** `clearAuthStateForSignOut` (`src/store/useAppStore.js:434`) is
push-first: `syncAll` → `whenSyncIdle` → `setSignOutWiping(true)` →
`wipeAllUserData` → cloud `signOut()`. If the push fails, sign-out aborts and
the user stays signed in unless they choose "Sign out anyway"
(`src/hooks/useAccountActions.js:110-123`). A wipe failure names the failing
step in the user-facing copy (`wipeFailedBody`, `:32-42`).

**Account switch.** `prepareIncomingAccount` (§3 above) — every step must
succeed or the incoming session is never published to app state.

---

## 7. Consent and privacy

- **Article 9 gate.** Flags `healthConsent` and `healthConsentChecked`, read in `src/navigation/RootNavigator.js:946-947`. The gate: `if (user && !user.isLocal && healthConsentChecked && (healthConsent === false || consentUnresolvedForNewUser)) return <Article9ConsentStack />;` (`:2150-2152`), where `consentUnresolvedForNewUser = healthConsent == null && !firstRunComplete` (`:2149`) — i.e. **fails closed for new users**; a returning user with a null read is not re-prompted (`:2140-2148`). A failsafe latch stops the gate hanging (`:1958-1966`).
- **Recording consent.** `Article9ConsentScreen` calls `sb.rpc('record_health_consent', {...})` (`src/screens/Article9ConsentScreen.js:83`); on failure the grant is queued (`queuePendingConsent`, `src/lib/consent/pendingConsent.js:22`, key `pendingHealthConsent.v1` `:18`) and retried from the sync runner (`flushPendingConsent`, `:38`; invoked `src/lib/sync/runner.js:165-167`). Same shape for the capability lane (`src/lib/consent/capabilityConsent.js:50,112`).
- **Server-side audit** rows land in `consent_log`; direct client INSERT was revoked so the RPCs are the only writer (`supabase/migrate_119_lock_direct_client_writes.sql:95-97`).
- **Analytics opt-out** is device-local: `privacy: { analyticsOptOut: false }` in the store (`src/store/useAppStore.js:2464-2486`), persisted under `@volyume_privacy_prefs` (`src/lib/privacyPrefs.js:7`) and **explicitly excluded from cloud sync** by an allow-list regex (`src/lib/sync.js:1682-1691`) — migration 133 deleted the rows that had leaked before that fix (`supabase/README.md:128-131`).
- Any social sharing surface inherits the Section 2 share-card rule: no name, bodyweight, measurements or private notes, and the whole card is withheld under calm mode or an open ED flag.

---

## 8. Observability

- **`src/lib/errorLog.js`** — `logError(scope, error, context)` (`:218`), `logWarn(scope, message, context)` (`:236`), `logInfo(scope, message, context)` (`:249`). `scope` is `'Module.operation'`. Ring buffer of 200 entries in AsyncStorage under `@volyume_error_log_v1` (`:47-50`), user-exportable via Settings → Debug logs, so it reuses the Sentry scrub patterns caller-side (`:40-44`): `import { isSensitiveKey, scrubValue } from './observability/sentryScrub';`. `VERBOSE_LOGGING` is `__DEV__`-gated (`:25`).
- **`src/lib/observability/sentryScrub.js`** is the single source of truth; `src/lib/sentry.js` imports `scrubEvent` (`:247`) / `scrubBreadcrumb` (`:294`). Exports `SENSITIVE_KEY_PATTERNS` (`:37`), `SENSITIVE_VALUE_SUBSTRINGS` (`:126`), `isSensitiveKey` (`:188`), `scrubValue` (`:201`), `scrubObject` (`:210`). Recursion bounded to depth 6 (`:29`).
- **Key patterns redacted** (`:37-124`): `^capability`, `^constraint`, `^rule_value`, `^laterality`, `^episode_group`; `^weight`, `^body_weight`, `^bf_pct`, `^body_fat`, `^ffm`, `^fm_kg`, `^height`; all macro names (`^kcal`, `^protein`, `^carbs?`, `^fat_g|100g|value|serving|target`, `^fibre`, `^sodium`, `^sugar`, `^quantity_g`, `^serving_g`); PII (`^email`, first/last/full name, DOB, `^phone`, `^address`); auth material (`access|refresh|id_token`, `token_hash`, `authorization`, `cookies?`, `password`, `client_secret`, auth/verification code, `otp`); every body measurement; `^signals_json`, `^signals`, `^ed_pattern`.
- **Value substrings redacted** (`:126-153`): `weight_log`, `food_entries`, `custom_foods`, `body_composition_log`, `daily_intake_rollups`, `ed_pattern_flags`, `health_data_consent`, `progress_photo_meta`, `progress_scan_sessions`, `progress_scan_assets`, `progress_photos/`, `capability_constraints`, `session_constraint_effects`, `capability_data_consent`.
- Value regexes also catch file/content URIs, base64 images, emails, JWTs, bearer/credential pairs and inline `weight: 82`-style health text (`:155-165`), with three-pass percent-decoding for classification (`:174-186`).
- **For social:** usernames, handles, display names, bios, post/comment bodies, follow-graph identifiers and any free-text moderation reason are NOT currently covered. `^email` and the name patterns are the only near-misses. New patterns (e.g. `^username`, `^handle`, `^display_name`, `^bio`, `^post_body`, `^comment`) and new table-name substrings must be added to these two locked lists, and the header notes a CI test asserts the scrub rules still match the schema (`:14-18`).

---

## 9. Tests and CI

- **Registry shape lock:** `src/lib/sync/__tests__/sync.registry.test.js` — `EXPECTED_TABLES` (`:15`) pins every registry table by name with its cloud migration number in a comment; a dropped or renamed entry fails here.
- **Per-table behaviour:** `src/lib/sync/__tests__/sync.regressionMatrix.test.js` — one matrix file driven by `SYNC_REGISTRY`, eight scenarios T1-T8 (`:14-21`): local insert→push upsert, local update→newer row, soft-delete→ships `deleted_at`, remote insert→local applier invoked, conflict→strategy applies, push error→`errors > 0` and does not throw; T7/T8 (two-device, offline collision) are applier-level in `campaign1.syncConflict.test.js`. **A new synced table gets a fixture here or it has no coverage.**
- Dedicated examples to copy: `sync.transport.test.js`, `transport.guards.test.js`, `planFolders.adversarial.test.js`, `sync.partners.test.js`, `sync.profiles.test.js`, `runner.consent.test.js` (Article 9 fail-closed), `runner.authGone.test.js`, `migratedTablesOrder.test.js`, `watermark.test.js`, `upsertConflictTargets.guard.test.js`.
- **Migration validation:** `src/lib/__tests__/migrationDurability.test.js` (transactional migration + `user_version` rollback, `:224-315`), `src/__tests__/campaign7.upgrade.test.js:116` (head == `CURRENT_SCHEMA_VERSION`), plus per-migration suites (`database.frontDeltMigration.test.js`, `database.effectiveMaintenanceMigration.test.js`, `database.coachOutputReid.test.js`, `database.demandMetadataMigration.test.js`).
- **Cloud/RLS validation:** `scripts/security/run-effective-supabase-matrix.cjs` — a hostile PostgREST/RPC matrix run by two users (A and B) against an **isolated disposable project only** (`DAYBREAK_ISOLATED_PROJECT_CONFIRM=YES`, `:37-39`); targets in `scripts/security/supabase-matrix.targets.json` (85 tables + 17 RPC names). Guarded by `src/__tests__/effectiveSupabaseHarness.guard.test.js`. A new cross-user table must be added to the targets file with an explicit disposition.
- **Identity invariant:** `scripts/check-identity-invariant.sh`.
- **npm scripts** (`package.json`): `lint` = `eslint . --max-warnings 0`; `test` = `cross-env TZ=Europe/London jest`; `typecheck` = `tsc --noEmit`; `check:imports` = `node scripts/check-imports.cjs`; `release:quality` = `npx tsc --noEmit --strict && npm run lint && npm run check:imports && npm test -- --runInBand`; `release:check` = `npm ci --legacy-peer-deps --ignore-scripts && npm run release:quality && npm run release:audit`; `release:audit` = `node scripts/release-audit-report.cjs`.

---

## 10. Rate limits and abuse controls today

**There is no general server-side rate limiter, no captcha, and no reporting or
moderation surface anywhere in the repo.** What exists:

- **One-per-UTC-day cheer limit**, enforced by a UNIQUE constraint, not by code: `supabase/functions/partner-cheer/index.ts:8` — "the `(… sent_on)` constraint enforces the one-per-UTC-day rate limit"; a duplicate returns 429 `already_cheered` (`:24`, `:130`). "The rate key must never come from JSON" (`:101`). Migration **155** hardens this with an INSERT policy pinning `sent_on` to the DB's UTC date — and is BLOCKED on the client fallback still stamping a local date (§1).
- **Block list:** `partner_blocks` (`supabase/migrate_081_training_partners.sql:240`, `FOR ALL USING (auth.uid() = blocker_id)`), consulted inside `create_partner_invite` / `redeem_partner_invite`; deletion covers both sides (`migrate_154:341`).
- **Pair ceiling:** a 3-pair maximum, enforced only inside the invite RPCs (`supabase/migrate_119_lock_direct_client_writes.sql:10-20`).
- **Write-path lockdown as the real abuse control:** direct `authenticated` writes revoked on `partnerships`, `engine_telemetry`, `consent_log`, with SECURITY DEFINER RPCs as the sole ingress (`supabase/migrate_119_*.sql:1-46`); function EXECUTE defaults tightened in `migrate_152_p0_restrict_internal_security_definer_execute.sql` and `migrate_153_function_execute_default_privileges.sql`; SECURITY DEFINER `search_path` pinned in `migrate_061`.
- **Telemetry allow-list:** `record_engine_telemetry` accepts only allow-listed event names (105 after `migrate_156`); anything else is rejected.
- **Payload bounding:** `supabase/functions/_shared/boundedJson.ts` caps edge-function request bodies.
- **Push budget** is client-side only (`src/lib/notifications/`, `docs/NOTIFICATIONS_LOCKED.md`); `send-push` itself is service-role-only and rejects anything else 401 (`supabase/functions/send-push/index.ts:16-21`).

**Implication:** a social system introduces the first user-generated content and
the first many-to-many write surface in the product. Every abuse control it
needs — posting rate limits, follow-spam ceilings, report/moderation queues,
content length bounds, block semantics beyond a single pair — has no existing
implementation to extend. The only proven pattern here is *"make the constraint
the limit, and make a SECURITY DEFINER RPC the only writer."*
