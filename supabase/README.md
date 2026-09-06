# Supabase migrations — application + verification guide

> **Migration tracking is mandatory** per `CLAUDE.md` § 2 INVIOLABLE
> CONSTRAINTS, "Database schema" (the older citation to a
> "Permanent engineering rules Rule 6" section was dangling: `CLAUDE.md`
> has sections 1-4 plus DETAILED RULES, and no Rule 6). This document is
> the authoritative tracker for: migration number, purpose, applied
> locally, applied remotely, safe to re-run, rollback notes, and
> app-code dependencies. Keep this file current when adding any
> migration; an undocumented migration is not considered complete.

This is the playbook for applying the pending migrations and
proving each one landed. Run them in numeric order in the Supabase
Dashboard SQL Editor. Every migration is additive and idempotent
unless the file header says otherwise.

> **OPERATING MODEL CHANGE (founder, 2026-07-10): cloud migrations are now
> CLAUDE-RUN.** The founder connected a Supabase connector to the Claude
> session and switched application from founder-run to Claude-run. The
> production safety gate is unchanged: nothing is applied to EU-Dublin
> without the founder's exact phrase "run against production" in that
> session, given AFTER Claude has presented the audited apply list. Each
> apply is followed by a read-only re-verification of every object the
> batch should have created. On 2026-07-10, under this model, **migrations
> 101-116 were applied to EU-Dublin and verified** (17/17 object checks
> green; the prior founder-run state had stopped after 100/102's DDL, and
> the deployed telemetry allow-list predated 101). 049 and 059 were both
> excluded from that batch. **059 has since been applied** (see the
> 2026-08-10 status block and the 059 row below); **only 049 is still
> HELD**, and it stays excluded from every batch until the founder
> unholds it.
>
> **2026-08-09: migrate_131 (mesocycles.block_ledger jsonb) applied to
> EU-Dublin and verified** under the founder's staged order ("1. Let
> both adversarial reviews finish … 5. Only then run migrate_131 against
> production. 6. Verify production migration/schema"), after the four
> preconditions were re-verified in-session (both adversarial reviews
> remediated; lint + full suite green on main; strain→deload
> monotonicity executed around the MEV floor; mixed-muscle e2e
> regression green). Verification: column present (jsonb, nullable, no
> default), 11 mesocycle rows untouched (0 ledgers), migration ledger
> ordered after migrate_129/130 (both already applied 2026-08-08).
> Additive + idempotent; rollback `DROP COLUMN block_ledger`.

## CURRENT STATUS (re-derived 2026-08-10)

This is the authoritative applied-vs-pending statement for the repository.
It replaces the old pointer to `docs/CURRENT_STATUS.md` § 3, which has
carried a SUPERSEDED/CLOSED banner since 2026-07-10: a current locked
contract must not delegate its authority to a superseded audit.

- **Files in this folder: 132** (`ls supabase/migrate_*.sql | wc -l`).
  Numbering runs 001-135 with 011, 026, 082 and 083 never used and two
  files sharing the number 085 (`migrate_085_food_quality_telemetry.sql`
  and `migrate_085_notification_preferences_checkin_missed.sql`).
- **Applied to EU-Dublin production: 001-048, 050-071 and 073-131** (072 is
  the one exception below, deliberately never applied). The full sweep
  of 2026-07-27 (`docs/TASKBOARD.md`, "CLOSED (2026-07-27) - FULL
  migration sweep") checked every object each migration creates against
  the live schema and found zero missing, plus the constraint-only cases
  separately. 129 and 130 followed on the founder's 2026-08-06 GO and
  131 on 2026-08-09.
- **HELD: 049 only.** `migrate_049_drop_peak_week_plans.sql` is
  destructive and its client-side prerequisites have not landed. It must
  not be applied. See its own header and the row below.
- **156-157 APPLIED 2026-09-04** (founder's exact phrase, Claude-run via
  MCP, project `sujrylzzxcqxxfygptns`). Pre-apply audit: the live
  `record_engine_telemetry` carried migration 104's 87 names; 156 was
  checked locally to keep all 87 and add 18, and to cover every
  non-deferred client catalogue event. Post-apply verification read-only:
  - **156** all 18 new names present in the live function definition,
    EXECUTE still granted to `authenticated`, ledger 20260904082129.
  - **157** `cron.job` holds zero rows named `cascade-advance-due-users`
    (job 3, `*/15 * * * *`, had been live); `cascade_advance_due_users()`
    remains defined; ledger 20260904082135.
  - **Applied to EU-Dublin production is now 001-048, 050-071, 073-154,
    156-157.** 155 is PENDING on a client prerequisite (below). 049 HELD.
    150 RETIRED.
- **155 BLOCKED on a client fix (found 2026-09-04 during the batch
  audit).** The new INSERT policy requires `sent_on` to equal the
  database's UTC date. The deployed `partner-cheer` Edge Function stamps
  UTC, but the app's own fallback insert (`src/lib/partners/service.js`,
  `insertCheerDirectly`, used when the function call fails) stamps
  `todayLocalKey()`, the LOCAL date. Around UTC midnight that fallback
  would be rejected and `normaliseCheerInsertError` would map the RLS
  rejection to "partner not active". The client fallback must stamp the
  UTC date and that build must be in users' hands before 155 runs.
  **155 update (2026-09-06, Community campaign):** the blocking client
  fallback (`insertCheerDirectly`) is scheduled for deletion with the whole
  Partners surface under SD-03
  (`docs/social-discovery-2026-09-06/40-DECISIONS.md`), in the Partners
  retirement lane that runs AFTER Community lands. That deletion has NOT
  happened yet, so as of today 155 is still blocked by exactly the fallback
  described above. Once Partners is retired and that build is in users'
  hands, nothing in the client can stamp a local date any more and 155 is no
  longer blocked. It stays NOT APPLIED either way until the founder
  authorises it.
- **160 WRITTEN, NOT APPLIED (Community; founder gate).**
  `migrate_160_community.sql` is the complete Community schema (SD-01 to
  SD-16, blueprint section 3): fourteen `community_*` tables, all with RLS
  enabled and NO policy for anon or authenticated and all privileges revoked
  from both, plus 41 SECURITY DEFINER RPCs (`search_path = public, pg_temp`,
  EXECUTE revoked from PUBLIC and anon, granted to authenticated) which are
  the only ingress and egress (SD-14). It also widens the `consent_log`
  CHECK with `community_visibility`, widens the
  `notification_preferences` category CHECK with `community_follow` and
  `community_activity`, seeds `community_moderators` with the marketing
  admin address, and re-issues `delete_user_data()` IN FULL (migrate_154's
  body plus the Community deletes). Nothing has been applied: it waits for
  the founder's exact phrase "run against production" for the batch that
  carries it. Verification after any future apply: the acceptance check at
  the end of the file (14 tables, `rls_enabled = t`, `policy_count = 0` on
  every one; 72 functions, all `security_definer = t` with the search_path
  in `settings`; `authenticated_can_execute = t` for exactly the 41
  `community_*` RPCs and `f` for every `_community_*` helper).
- **132-136 APPLIED 2026-08-12** (founder order, Claude-run, project
  `sujrylzzxcqxxfygptns`, eu-west-1). Every object verified read-only
  after the apply:
  - **132** `planned_muscle_volume` gained `mev, mav, mrv` (integer) and
    `source` (text). Verified present.
  - **133** no-op in practice: production held **0**
    `@volyume_privacy_prefs` rows in `user_prefs` before the DELETE ran.
    The client-side exclusion (P0-2) had already stopped the leak, and
    nothing had accumulated. 0 rows after.
  - **134** all nine target tables now carry a `touch_updated_at` trigger
    (`mesocycles, mesocycle_weeks, coach_outputs, nutrition_targets,
    user_body_profile, programmes, routines, routine_exercises,
    planned_muscle_volume`), joining the eight guarded since 047.
  - **135** the DELETE was a no-op (0 duplicate week groups). The real
    work was step 2: all 4 `coach_outputs` rows now carry the
    deterministic `co_<week_start>_<user_id>` id (0 non-deterministic
    ids), 4 rows before and after — nothing lost. **See the defect note
    on step 3 below.**
  - **136** all three tables created with RLS enabled and one
    "Users manage own …" policy each; `delete_user_data()` re-created and
    confirmed to cover all three. Posture is identical to the existing
    `weekly_checkins_v2` (RLS on, one policy, the default `anon` grants
    that RLS blocks), so no new exposure. migrate_130's revoke survived:
    `delete_user_data` ACL is `postgres, authenticated, service_role`
    only — no `anon`, no `PUBLIC` — because `CREATE OR REPLACE` preserves
    an existing ACL.
- **DEFECT FOUND IN 135 (2026-08-12, recorded not fixed).** Step 3 is
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_coach_outputs_user_week`, but
  production already had a **non-unique** index of that exact name
  (`(user_id, week_start DESC)`). `IF NOT EXISTS` matches by NAME, so the
  statement was a **silent no-op** and created no unique index. It did no
  harm here — `coach_outputs_user_id_week_start_key UNIQUE (user_id,
  week_start)` has enforced the invariant since table creation
  (`setup_complete.sql`), which is also why the DELETE found nothing — but
  on any environment lacking that constraint the file would silently fail
  to create the structure it exists to create. The name collision must be
  resolved before this file is trusted on a fresh project.
- **059 IS APPLIED.** Every "059 is drafted / pending / held" line that
  survives further down this file is stale and is corrected in place. The
  live CHECK on `food_entries.meal_slot` carries the `meal_[0-9]+`
  pattern, and the client has written numbered slots since
  `src/lib/food/mealSlots.js`, `mealPlanAssembler.js` and
  `MealNamesScreen.js` shipped; were 059 unapplied, every diary push would
  fail the old fixed-list CHECK.
- **137 IS AUTHORISED AND STILL PENDING (2026-08-14).** The founder gave the
  exact phrase. It was not executed because the Supabase MCP server was not
  attached to that session's runtime. The connector was installed,
  authenticated AND fully permitted (all 29 tools set to Always in the
  founder's connector settings) - the server simply dropped part-way
  through a long session and does not re-attach mid-session, so nothing in
  it could reach EU-Dublin: no connector tools, no Supabase CLI on the box,
  no connection string.

  Two distinct layers, and confusing them wasted a round trip:
  `ListConnectors` reports `enabledInChat`, which reads like a per-chat
  SETTING but reflects the runtime LOAD state; `ListMcpResourcesTool` is
  the honest check - it listed only the `github` and Spotify servers.
  **The fix is a fresh session**, not a settings change.
  **The deploy-migrations workflow is not a substitute.** It applies every file absent from
  `claude_schema_migrations`, and that tracking table has never been
  populated by the connector-run and SQL-Editor-run applies that actually
  put 060-136 into production - so dispatching it would attempt to re-run
  roughly seventy-six migrations against the live database, with no way to
  verify production truth first. The founder authorised one migration, not
  that. It waits for a session with the Supabase server actually attached,
  where the apply can be followed by the read-only verification this playbook
  requires: a column check on `exercise_swaps.scope` expecting one row,
  type `text`, nullable `YES`.
- **Client impact while it waits:** none that loses data. The push tolerates
  the column's absence (the row still carries every other field), and the
  NEGATIVE reading counts only `scope = 'programme'`, so an unknown scope
  can never cost a user an exercise. What is deferred is cross-device
  fidelity of the session-versus-programme distinction, not the local
  behaviour.
- **138 IS AUTHORISED AND STILL PENDING (2026-08-14).** `migrate_138_food_swaps.sql`,
  the cloud half of the Campaign 17A job 3 food-intent layer (one new table,
  `food_swaps`, local schema v77). The founder authorised it in the 17A
  closeout: "run migrate_138_food_swaps.sql against production".

  **NOT EXECUTED. The exact blocker, checked once and not retried:** this
  session has no route to EU-Dublin at all. Three checks, all negative:
  `ListMcpResourcesTool` lists only the `github` and Spotify servers (no
  Supabase MCP server attached); a tool search for Supabase/SQL/migration
  tooling returns nothing; and while `psql` is on the box, no connection
  string exists in the environment (no `SUPABASE_*`, no `DATABASE_URL`, no
  `supabase` CLI). There is nothing to authenticate with and nothing to
  connect to.

  Same cause as 137 and the same fix: **a session with the Supabase server
  actually attached**, where the apply can be followed by the read-only
  verification this playbook requires. Apply 137 and 138 in the SAME batch.
  Verification for 138: the table exists, RLS is enabled, one
  "Users manage own food_swaps" policy is present, and `scope` is `text`,
  `NOT NULL`.
  **Client impact while it waits:** none that loses data. The table is
  device-local until it runs; the push finds no remote table, the slice is
  skipped and retries every sync, and a second device simply has no
  remembered food replacements - exactly the behaviour before the feature
  existed. Verification after the apply: the table exists with RLS enabled
  and one "Users manage own food_swaps" policy, and `scope` is `text`,
  `NOT NULL`.

- **2026-08-18 BATCH (Claude-run, founder phrase "run against production",
  project `sujrylzzxcqxxfygptns`): 142 and 143 APPLIED AND VERIFIED, and
  the 137-141 ledger corrected against the LIVE schema.**
  - **Pre-apply verification falsified the two stale pending bullets
    above**: a single read-only information_schema sweep found
    `exercise_swaps.scope` (137), the `food_swaps` table (138),
    `routine_exercises.selection_reason` (139), `session_resolutions`
    (140) and `effective_maintenance_memos` (141) ALL present in
    production. Those objects were applied at some point after the
    2026-08-14 session wrote the bullets; the who/when is not resolvable
    from the repository, so the fact of liveness is recorded here from
    direct schema verification and the stale rows in the tracker below
    are corrected in place. The 137/138 bullets above are kept for
    history of the 2026-08-14 operator incident.
  - **142** `exercise_intent.expires_at` added. Verified: present,
    `timestamp with time zone`, nullable YES. Applied BEFORE any build
    carrying the PATTERN_AVOID push shipped, per its header's order note.
  - **143** `exercises.load_semantics` + `custom_exercises.load_semantics`
    added with the four-value CHECK on each. Verified: both columns
    present (`text`, nullable YES) and both named constraints present in
    `pg_constraint`.
  - Both applied via the Supabase MCP `apply_migration` path (recorded in
    the project's migration history as `migrate_142_exercise_intent_expiry`
    and `migrate_143_load_semantics`).
- **2026-09-05 BATCH (Claude-run, founder phrase "run against production"
  given in chat after the closure named the batch, project
  `sujrylzzxcqxxfygptns`, via the Supabase MCP `apply_migration` path):
  158 and 159 APPLIED AND VERIFIED.** Pre-apply read-only sweep confirmed
  `routine_exercises.group_kind`, `routine_exercises.round_rest_seconds`
  and `workout_sets.evidence_class` did not exist and that the parent
  columns (`superset_group_id`, `rest_seconds`, `set_type`) did.
  Post-apply verification, all green: the three columns (text, integer,
  text; all nullable), both CHECK constraints
  (`routine_exercises_group_kind_check`: null | 'superset' | 'circuit';
  `workout_sets_evidence_class_check`: null | 'circuit' | 'ballistic' |
  'circuit_ballistic'), and the two ledger rows in
  `supabase_migrations.schema_migrations` (versions 20260905123313 and
  20260905123316). No data rewritten; every existing row is NULL, the
  pre-migration meaning. `CIRCUIT_SYNC_COLUMNS_ENABLED` flipped to true
  in the same landing so the client pushes the columns from the next
  build; older builds keep omitting them and the pull tolerates either.
  155 remains PENDING on its client prerequisite; 049 HELD.

- **2026-08-21 BATCH (Claude-run, founder phrase "run against production",
  project `sujrylzzxcqxxfygptns`, via the Supabase MCP `apply_migration`
  path): 145, 146, 147, 148, 149 and 151 APPLIED AND VERIFIED.**
  Pre-apply read-only sweep confirmed none of the batch's objects
  existed and that `consent_log` held only `health_data` values against
  exactly the four-value CHECK 147 widens. Post-apply verification, all
  green: `capability_constraints` (18 columns incl. 149's
  `effective_choice`, RLS on, owner policy, refuse-stale trigger, both
  indexes), `session_constraint_effects` (7 columns, RLS, policy,
  unique (user_id, workout_id)), consent CHECK now five values,
  `users_profile` capability consent columns, `record_capability_consent`
  present, eleven demand columns on BOTH `exercises` and
  `custom_exercises` (148 + 151), `exercise_swaps.cause`, and
  `delete_user_data()` recreated WITH its migrate_130 ACL preserved
  (postgres/authenticated/service_role only).
  - **ACL completion found and fixed during verification:** the freshly
    created `record_capability_consent` carried default PUBLIC/anon
    EXECUTE (the function self-guards on auth.uid, but the standing
    migrate_130 posture says no anon call right). Revoked + re-granted
    to authenticated/service_role as
    `migrate_147_capability_consent_acl_revoke`; final ACL verified
    identical to `record_health_consent`. The revoke is appended to the
    147 file so fresh environments match.
  - **150 was deliberately SKIPPED (retired, never to be run - Q4/GC-D12):**
    verified negatively that `record_engine_telemetry` contains no
    capability event names.
  - **144 ledger gap RESOLVED - it IS APPLIED:** both App Review demo
    accounts carry exactly the file's password hashes (updated_at
    2026-08-19/20), so the one-time data migration ran. The gap note
    below is superseded by this finding.
  - **NOTHING IS NOW PENDING for production except 049 (HELD forever
    unless the founder unholds it).** The client's capability sync,
    custom-exercise demand pushes and consent RPC go live server-side
    from this batch.
- **072 was never applied and never will be.** Its content was delivered
  by `migrate_118_workouts_recipes_sync_schema_fix.sql` on 2026-07-11; the
  file is kept for history only (its own header says so).

Per-migration detail lives in two tables below: the original apply-order and
verification playbook covers 037-071, and the rebuilt tracker
("Migrations 072-135") covers everything after it.

## Application order and verification playbook (migrations 037-071)

> This table is the apply-order and verification playbook for every
> migration from 037 to 071; a row appearing here does not by itself mean
> the migration is still unapplied. Migrations
> 037-048, 050-058 are applied (the 048, 050-055, 058 set was applied by the
> founder on 2026-06-01); 049 remains held (destructive, client cleanup
> outstanding); 059 (numbered meal slots) is APPLIED and its
> `meal_[0-9]+` CHECK is live; and **060-067 were APPLIED by the founder on
> 2026-06-06** (060 morning-weights reconcile / SYNC-6, 061 search_path pinning /
> HP-1, 062 delete-fallback erasure gap / HP-3, 063 engagement telemetry / LB-8,
> 064 cardio_log table, 065 trial 21→14 days, 066 users_profile.billing_period,
> 067 client-pro self-grant fix / subscriptions audit C-1); **068 (tier-RPC
> GUC bypass) and 069 (auth.users FK cascade) were APPLIED by the founder on
> 2026-06-07** (068 still needs its verification query run to confirm the tier
> RPCs no longer throw). Only **049 remains held**.
> **070 (protect trial/entitlement columns from client writes / trial-subscription
audit C-1) and 071 (trial ledger / delete-and-restart abuse guard) were APPLIED by the
founder on 2026-06-08**, closing the trial extend/reset and delete-and-restart holes.
Apply any future migration in numeric order in the SQL Editor.

| # | File | What it adds | Verification query |
|---|---|---|---|
| 037 | `migrate_037_lifecycle_sync_telemetry.sql` | Extends `record_engine_telemetry` allow-list with `app_cold_start`, `app_foregrounded`, `app_backgrounded`, `sync_run`. | See § Verify allow-list extension |
| 038 | `migrate_038_payments_cascade_telemetry.sql` | Adds `cascade_state_transition`, `purchase_initiated`, `purchase_completed`, `purchase_failed`, `subscription_cancelled`, `restore_purchases_attempted`. | Same |
| 039 | `migrate_039_account_deletions_log.sql` | Creates `account_deletions_log` table + `record_account_deletion_started` / `record_account_deletion_completed` RPCs. Service-role only. | See § Verify account_deletions_log |
| 040 | `migrate_040_notification_telemetry.sql` | Adds `notification_sent`, `notification_tapped`, `notification_failed` to the allow-list. | See § Verify allow-list extension |
| 041 | `migrate_041_consent_withdrawal_telemetry.sql` | Adds `article9_consent_withdrawn` to the allow-list. | Same |
| 042 | `migrate_042_upgrade_tier_for_user.sql` | Service-role-only `upgrade_tier_for_user(_user_id, ...)` RPC for the Play Billing RTDN webhook. | See § Verify upgrade_tier_for_user |
| 043 | `migrate_043_sync_conflict_telemetry.sql` | Adds `sync_conflict_resolved` to the allow-list. Fires from `src/lib/sync/conflict.js`. | See § Verify allow-list extension |
| 044 | `migrate_044_notification_preferences.sql` | Creates `notification_preferences(user_id, category, enabled, time_pref)` with RLS + updated_at trigger. Backs NOTIFICATIONS_LOCKED.md lines 117-119. | See § Verify notification_preferences |
| 045 | `migrate_045_users_profile_column_updates_at.sql` | Adds `column_updates_at jsonb` to `users_profile` + safe-merge trigger so the per-column merge conflict strategy can decide field-by-field which side wrote a profile field most recently. Backs SYNC_REGISTRY profiles.merge contract. | See § Verify users_profile.column_updates_at |
| 046 | `migrate_046_recipe_ingredients_soft_delete.sql` | Adds `updated_at` + `deleted_at` columns to `recipe_ingredients`, plus a BEFORE UPDATE touch trigger and a partial index over live rows. Required for the registry's softDelete:true + LWW contract on recipe_ingredients; without it the per-table push raises PGRST204 on every sync. | See § Verify recipe_ingredients soft-delete |
| 047 | `migrate_047_body_metrics_weekly_checkins_lww.sql` | Adds `updated_at` to both `body_metrics` and `weekly_checkins_v2` (+ touch triggers refusing stale writes), plus `deleted_at` and a partial live index to `body_metrics`. Closes the locked LWW + soft-delete gaps for `body_composition_log` and `weekly_checkins_v2` registry entries. | See § Verify body_metrics + weekly_checkins_v2 LWW |
| 048 | `migrate_048_food_preferences_kind.sql` | Adds `kind text NOT NULL DEFAULT 'fav'` + a CHECK constraint to `food_favourites` so the same table holds both "user likes this" (fav) and "user excluded this" (dislike). Backs the food-dislike feature added 2026-05-27. Old AAB sends rows without `kind`; DEFAULT covers them. | See § Verify food_favourites.kind |
| 050 | `migrate_050_weekly_checkins_cardio_adherence.sql` | Adds nullable `cardio_adherence text` to `weekly_checkins_v2`. Applied; column retained. **Historical: cardio logging and the coach's cardio prescription were removed from the product on 2026-08-10 (D92-1/D95).** The check-in asks no cardio question and the save deliberately omits the key so stored answers are preserved (D95 H5). The column now holds history only; do not drop it. Additive + nullable. | See § Verify weekly_checkins_v2.cardio_adherence |
| 051 | `migrate_051_food_frequents.sql` | Creates `food_frequents` cache table (RLS read-own) + `refresh_food_frequents()` nightly pg_cron worker (top-20 foods over 30 days, all users) + `food_frequents_pull()` RPC the client calls. Backs the Frequents search tab (GAP row 28). Fully additive: the frozen AAB never references it, and it sits outside the food_sync_pull/push cycle, so existing sync is untouched. Requires `pg_cron` (already enabled by migration 031). | See § Verify food_frequents |
| 052 | `migrate_052_daily_water_reconcile.sql` | **Apply ASAP: fixes the live "Sync error" badge.** The live `daily_water` table is missing `entry_date` (drifted from migrate_015), so `food_sync_push` throws 42703 and fails the whole food push + the entire sync run. This recreates `daily_water` to the canonical shape, but only when `entry_date` is missing (no-op + safe to re-run otherwise). No data loss: daily_water never synced successfully, so the cloud table is empty; clients re-push local water on next sync. | See § Verify daily_water reconcile |
| 053 | `migrate_053_device_push_tokens.sql` | Creates `device_push_tokens(user_id, expo_push_token, platform, ...)` with composite PK + RLS + touch trigger. Backs the Expo remote-push pipeline (NOTIFICATIONS_LOCKED.md provider stack). The client registers its token after sign-in; the `send-push` Edge Function reads rows (service role) to fan out; the Play Billing RTDN webhook calls it on payment failure. Fully additive; the frozen AAB has no writer for this table. **Also requires `extra.eas.projectId` in app.json before any token can be obtained (see founder-action queue).** | See § Verify device_push_tokens |
| 054 | `migrate_054_workout_sets_unilateral.sql` | Adds nullable `left_reps` + `right_reps` to `workout_sets` for per-side (unilateral) logging (GAP row 20). `actual_reps` holds the lower side, so volume/PR/progression are unchanged; the new columns are a display record. Additive; the frozen AAB sends the old column set and reads `actual_reps` as before. Apply before the next AAB ships (same ordering rule as every additive workout_sets column). | See § Verify workout_sets unilateral |
| 055 | `migrate_055_diet_preference.sql` | Adds `diet_preference text DEFAULT 'omnivore'` to `users_profile`. Backs the curated meal-suggestion feature: the user's diet layer (omnivore/vegetarian/vegan) filters the curated meal library in the Suggested food-search tab. Joins the migration-045 per-column merge set (no trigger change; the jsonb merge handles the new key). Additive + defaulted; the frozen AAB neither writes nor reads it. Apply before the next AAB ships. | See § Verify users_profile.diet_preference |
| 056 | `migrate_056_daily_steps.sql` | Creates `daily_steps(user_id, entry_date, steps, source, updated_at)` with composite PK + RLS + a BEFORE UPDATE touch trigger (last-write-wins), same per-day shape as `daily_water`. The activity store for the cardio/steps audit: the manual step log writes here and the coach's step target checks against it. Bidirectional sync via the `daily_steps` registry entry + `src/lib/sync/tables/dailySteps.js`. `user_id` FK is ON DELETE CASCADE so account deletion clears it; `delete_user_data` is not rewritten here (fold a `daily_steps` DELETE in at its next revision). Fully additive: the frozen AAB has no writer. Safe to apply any time. | See § Verify daily_steps |
| 057 | `migrate_057_meal_slots_periworkout.sql` | Relaxes the `food_entries.meal_slot` CHECK (set by migration 015) to also allow `'preworkout'` and `'postworkout'`, backing the new Pre-workout and Post-workout diary sections and the curated peri-workout meals. Purely additive: the four original slots still pass, so nothing stored changes and the frozen AAB (which only sends the original four) keeps syncing. Local SQLite `meal_slot` has no CHECK, so logging works before this is applied; only cloud sync of the new slots needs it. Apply before a build that writes the new slots reaches production sync. | See § Verify peri-workout meal slots |
| 058 | `migrate_058_weekly_checkins_steps_avg.sql` | Adds nullable `steps_avg integer` to `weekly_checkins_v2`. The persistent home for the week's average steps the Precision Coach reads as a secondary signal: the check-in saves the auto average when 4+ days of `daily_steps` are registered, otherwise the user's typed average. Additive + nullable, mirrors migration 050; the frozen AAB omits it (left NULL). The per-table weekly-checkins push ships `steps_avg`, so without the column that push is rejected. | See § Verify weekly_checkins_v2.steps_avg |
| 059 | `migrate_059_meal_slots_numbered.sql` | **Numbered meal slots. APPLIED** (verified 2026-07-27: the live CHECK carries the `meal_[0-9]+` pattern). Replaces the fixed `food_entries.meal_slot` CHECK (six legacy values, set by 015 + 057) with a pattern CHECK allowing `meal_[0-9]+` plus the legacy values, backing the flexible "Meal 1..N" diary model (founder direction 2026-06-01). Purely additive: the six legacy values still match, so the frozen AAB keeps syncing; a `meal_N` row synced down to the old build is just not displayed, no crash. Apply before a client that writes `meal_N` slots reaches production sync, otherwise those pushes fail the old CHECK (caught per-table, row stays local, wider run still succeeds). | `SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname LIKE '%meal_slot%';` shows the `meal_[0-9]+` pattern. |
| 060 | `migrate_060_morning_weights_updated_at.sql` | **SYNC-6. Applied 2026-06-06 (founder).** Adds `updated_at timestamptz NOT NULL DEFAULT now()` + a BEFORE UPDATE touch trigger to `morning_weights` (mirrors 047; no `deleted_at`, the table is hard-delete). The cloud table never had `updated_at`, so the client pull's `.gte('updated_at', cursor)` watermark could never advance and the local applier's `INSERT OR IGNORE` never updated an existing row: a weight edited on another device never reconciled. The client commit switches `insertMorningWeightFromCloud` to a last-write-wins upsert. Additive: the frozen AAB pushes without `updated_at` (DEFAULT + trigger fill it) and its pull starts working rather than breaking. `_pushMorningWeights` does NOT send `updated_at`; the trigger manages it. Apply before a build that relies on cross-device weight reconcile. | `SELECT column_name FROM information_schema.columns WHERE table_name='morning_weights' AND column_name='updated_at';` returns 1 row; `SELECT tgname FROM pg_trigger WHERE tgname='morning_weights_touch_updated_at';` returns 1 row. |
| 061 | `migrate_061_pin_securitydefiner_search_path.sql` | **HP-1. Applied 2026-06-06 (founder).** Pins `search_path = public` on the last three SECURITY DEFINER functions that never set it: `recompute_daily_intake_rollup(uuid, date)` (migration 015), `clear_goal_lock()` (017), `record_health_consent(boolean, text, text)` (019). Every other SECURITY DEFINER function already pins it. Uses `ALTER FUNCTION ... SET search_path`, so bodies and signatures are unchanged and the RPC contract is identical: the app and the frozen AAB are unaffected. Safe to apply any time; idempotent. | `SELECT proname, proconfig FROM pg_proc WHERE proname IN ('recompute_daily_intake_rollup','clear_goal_lock','record_health_consent');` returns 3 rows, each `proconfig` containing `search_path=public`. |
| 063 | `migrate_063_engagement_telemetry_events.sql` | **LB-8. Applied 2026-06-06 (founder).** Adds `workout_started`, `workout_completed`, `plan_activated` to the `record_engine_telemetry` allow-list (the core activation/retention loop the dashboards were missing). Reproduces the migration 043 list verbatim plus the three names; payloads carry counts/flags only and flow through the LB-9 opt-out gate. Apply before a build that emits them reaches production sync; until then those three pushes are rejected and retried, nothing else affected. Idempotent. | `SELECT pg_get_functiondef('record_engine_telemetry(text,jsonb,timestamptz)'::regprocedure)` contains `workout_started`, `workout_completed` and `plan_activated`. |
| 064 | `migrate_064_cardio_log.sql` | **Applied 2026-06-06 (founder). Table RETAINED, feature RETIRED.** Created the `cardio_log` table (one row per logged cardio session, PK `(user_id, id)`, soft delete + LWW, RLS own-rows, BEFORE UPDATE touch trigger). **Historical: cardio logging was removed from the product on 2026-08-10 (D92-1/D95, commit `3e8ab0c6`)** - the screens, routes, Settings toggle, activity library and passive Health import are gone and no local writer remains. Sync is now **pull-only**, not bidirectional (`direction: 'pull_only'` in `src/lib/sync/registry.js`; push handler removed, D95 H1), retained so existing cloud history is never stranded by a sign-out local wipe. No product surface reads the rows. Do not drop the table: it holds real user history. The old "apply 064 to turn on cardio cloud sync" instruction and the PGRST205 benign-skip note are both spent (the table exists). Separately, the LOCAL SQLite `cardio_log` schema was first added in the middle of `SCHEMA_MIGRATIONS` instead of appended, so existing installs never created the table; a corrective trailing migration (database.js, 2026-06-03) now creates it on next launch. | `SELECT to_regclass('public.cardio_log');` is non-null; `SELECT tgname FROM pg_trigger WHERE tgname='cardio_log_touch_updated_at';` returns 1 row; an own-row insert succeeds and a cross-user insert is rejected by RLS. |
| 065 | `migrate_065_trial_14_days.sql` | **Trial 21→14 days. Applied 2026-06-06 (founder).** `CREATE OR REPLACE start_cascade` with the in-app cardless reverse-trial window changed from `interval '21 days'` to `interval '14 days'` (founder direction 2026-06-06: 14 cardless days + a 7-day Play intro free trial = 21 days free total). Only the interval changes; signature, return keys and the `tier_history` insert are identical to migration 033. The `cascade_advance_due_users` worker is unchanged (it expires on `pro_trial_ends_at <= now()`, so a 14-day window auto-expires at day 14). Safe during beta: `PRO_BETA_ACTIVE` masks trial_state, so no one loses Pro on the current build. The frozen AAB reads `pro_trial_ends_at` with no hardcoded 21-day break (its paywall string still shows "21 days", cosmetic only). Idempotent; safe to re-run. Rollback = re-apply 033's body. Apply alongside the real Play Billing path + the Play Console 7-day offer. | `SELECT pg_get_functiondef('start_cascade()'::regprocedure)` contains `interval '14 days'` and not `interval '21 days'`. |
| 066 | `migrate_066_users_profile_billing_period.sql` | **Billing period. Applied 2026-06-06 (founder).** Adds nullable `billing_period text` to `users_profile` so the Subscription screen shows the right price for monthly vs annual subscribers (flat pricing, 2026-06-06). The Play RTDN webhook (`play-billing-rtdn`) sets it from the purchased product id (`pro_monthly`→'monthly', `pro_annual`→'annual') via a service-role PATCH; not guarded by the `protect_users_profile_tier` trigger (that guards `tier` only). Client reads it via `refreshTierFromCloud`→`store.billingPeriod`→SubscriptionScreen; NULL shows the monthly price, so the frozen AAB and pre-webhook rows are fine. Additive, idempotent (`ADD COLUMN IF NOT EXISTS`). **Redeploy the play-billing-rtdn edge function after applying so it writes the column.** Rollback = `DROP COLUMN billing_period`. | `SELECT column_name FROM information_schema.columns WHERE table_name='users_profile' AND column_name='billing_period';` returns 1 row. |
| 067 | `migrate_067_upgrade_tier_block_client_pro.sql` | **C-1 self-grant fix. Applied 2026-06-06 (founder).** `CREATE OR REPLACE upgrade_tier` (the authenticated function) so it may only downgrade toward `free`: it now raises on `_target_tier <> 'free'` and on `_reason IN ('user_paid','admin')`. Closes the hole where any signed-in caller could grant itself `paid_pro` with a fabricated `_payment_ref` and no receipt check. Real Pro grants come only from the Google Play RTDN via the service-role `upgrade_tier_for_user` (042) after Play API verification; the trial grant is `start_cascade` (both unchanged). Body is migration 033's verbatim plus the guard. Ships WITH the client change (paid purchase = optimistic local unlock reconciled by the RTDN-written tier: `cascade.payAt` + `store.setOptimisticPaid`). Frozen-AAB safe (it never calls `upgrade_tier('pro')`). Idempotent; safe to re-run. Rollback = re-apply 033's `upgrade_tier`. **Apply alongside deploying play-billing-rtdn, or new purchases won't grant Pro server-side.** | `SELECT upgrade_tier('pro','user_paid',NULL,'x');` raises; `SELECT upgrade_tier('free','user_skip','t',NULL);` succeeds with `tier=free`. |
| 069 | `migrate_069_auth_user_fk_cascade.sql` | **Auth-user FK cascade (account deletion). APPLIED 2026-06-07 (founder).** Deleting a user failed with "Database error deleting user" in the dashboard, and the in-app delete left the auth row behind whenever `delete_user_data` missed a table the account had rows in. Root cause: `users_profile.id` and ~25 other public tables reference `auth.users(id)` with NO `ON DELETE` action (defaults to NO ACTION / RESTRICT), so Postgres refuses to delete the auth row while any child row exists. This migration converts every public FK to `auth.users` that is NO ACTION or RESTRICT to `ON DELETE CASCADE` via a dynamic `DO` block; FKs with `ON DELETE SET NULL` (e.g. `ed_pattern_flags.set_by`) are left alone. After this, deleting the auth user cascades all child rows automatically, so deletion works from the dashboard, the admin API and the Edge Function, and a missing table in `delete_user_data` can never strand an account again. Idempotent (skips FKs already CASCADE); safe to re-run. Rollback = recreate the specific constraints without CASCADE (not advised). No app-code or RLS change. | Verification query in the migration footer must return ZERO rows; then deleting a stuck user from Authentication -> Users succeeds. |
| 068 | `migrate_068_tier_trigger_guc_bypass.sql` | **Tier RPC GUC bypass. APPLIED 2026-06-07 (founder), verification query still to run.** Sentry (prod, 2026-06-06): `permission denied to set parameter "session_replication_role"`. `start_cascade`, `upgrade_tier`, `upgrade_tier_for_user` and `cascade_advance_due_users` all toggled `session_replication_role` (a superuser-only parameter) to bypass the `users_profile_protect_tier` trigger while writing `tier`. On hosted Supabase the function owner is not a superuser, so every one threw and aborted: the 14-day Pro trial never started, so a user tapping "Go Pro" never became Pro and the app routed them to the free first-run screen. This migration makes the trigger also allow a tier change when a transaction-local custom GUC `app.allow_tier_change='on'` is set (dotted-namespace GUCs need no special role), and re-creates all four functions to set that flag instead of `session_replication_role`. Bodies reproduced verbatim from 065/067/042/033 with only the two `set_config` lines swapped; signatures, return shapes, grants and transition logic unchanged. Client direct tier writes are still blocked (a client cannot set the GUC). Idempotent (`CREATE OR REPLACE`); safe to re-run. Rollback = re-apply 065/067/042/033 + setup_complete.sql's trigger (restores the broken state, so only roll back if 068 is wrong). No new app-code dependency; the frozen AAB calls `start_cascade` too and benefits. | As an authenticated user with `trial_state='unstarted'`: `SELECT start_cascade();` returns `tier='pro'` and `SELECT tier,trial_state FROM users_profile WHERE id=auth.uid();` shows `pro`/`pro_trial_active`. Then `UPDATE users_profile SET tier='pro' WHERE id=auth.uid();` followed by a re-select must STILL show `free` (client write blocked). |
| 070 | `migrate_070_protect_trial_columns.sql` | **Protect trial columns (audit C-1). Applied 2026-06-08 (founder).** `CREATE OR REPLACE protect_users_profile_tier` so the trigger also reverts client writes to `trial_state`, `trial_started_at`, `pro_trial_ends_at`, `complete_trial_ends_at`, `locked_in_price_tier` (previously only `tier` was guarded), and clamps a client INSERT to a clean unstarted free state. Closes the hole where a user could PATCH their own `pro_trial_ends_at`/`trial_state` via PostgREST for unlimited free Pro (RLS is FOR ALL own-row, migrate_005; the prior security audit only checked `tier`). Uses the same `app.allow_tier_change` GUC bypass as 068, so the trusted RPCs (start_cascade / upgrade_tier / upgrade_tier_for_user / cascade_advance_due_users) are unaffected, and service role bypasses. Frozen-AAB safe: the shipped client never writes these columns. Idempotent (`CREATE OR REPLACE`); rollback = re-apply 068's trigger body. | As an authenticated user with `trial_state='pro_trial_active'`: `UPDATE users_profile SET pro_trial_ends_at = now() + interval '999 days' WHERE id=auth.uid();` then re-select shows the ORIGINAL end (write reverted); `UPDATE users_profile SET trial_state='unstarted' WHERE id=auth.uid();` then re-select still shows `pro_trial_active`. `SELECT start_cascade();` from a genuinely unstarted account still returns `pro`. |
| 071 | `migrate_071_trial_ledger.sql` | **Trial ledger: stop delete-and-restart trial abuse. Applied 2026-06-08 (founder).** The 14-day cardless trial was anchored to `users_profile.trial_state` (keyed by `auth.uid()`), which account-delete wipes, so a delete + re-signup (even same email) got a fresh 14-day trial with no guard. Adds `private.trial_ledger` (a salted SHA-256 of the email, no user_id, in the `private` schema so it is not exposed via PostgREST, and NOT in `delete_user_data`'s list, so it deliberately survives deletion) plus `private.trial_salt` (one per-deployment random salt) and `private.email_trial_hash()`. `CREATE OR REPLACE start_cascade()` reproduces the 068 body (the **GUC** `app.allow_tier_change` bypass, NOT `session_replication_role`) and adds: for an `unstarted` account, hash the email; if it is in the ledger, move straight to `cascade_expired`/`free` (no second trial); otherwise grant the 14 days and record the hash. Privacy: hash retention after deletion is a documented legitimate-interest (fraud-prevention) exception to "delete wipes everything" (IDENTITY doc §E + privacy policy updated). Idempotent (`IF NOT EXISTS` + `CREATE OR REPLACE`; salt is `ON CONFLICT DO NOTHING` so it is generated once). Rollback = re-apply 068's `start_cascade` and drop the private objects (re-opens the abuse). | Fresh account: `SELECT start_cascade();` -> `pro_trial_active` and `private.trial_ledger` gains one row. Then delete + re-signup with the same email and run to Article 9: `SELECT start_cascade();` -> `already_trialled=true`, `trial_state='cascade_expired'`, `tier='free'` (no new 14 days). |
| 062 | `migrate_062_delete_user_data_post025_tables.sql` | **HP-3. Applied 2026-06-06 (founder).** Extends the `delete_user_data` fallback RPC (last completed in migration 025) to the five user-scoped tables added since: `tier_history` (030), `notification_preferences` (044), `food_frequents` (051), `device_push_tokens` (053), `daily_steps` (056). The primary delete path (Edge Function -> `auth.admin.deleteUser` -> ON DELETE CASCADE) already wiped these; the gap was only the fallback used when the Edge Function is un-deployed. `account_deletions_log` is deliberately NOT wiped (it is the surviving deletion audit trail). Reproduces the 025 body verbatim plus the new section; every delete stays wrapped in `EXCEPTION WHEN undefined_table`. Identical signature, so old builds and the frozen AAB keep working. Safe to apply any time; idempotent. | `SELECT pg_get_functiondef('delete_user_data()'::regprocedure)` contains `tier_history`, `notification_preferences`, `food_frequents`, `device_push_tokens` and `daily_steps`, and still contains `account_deletions_log` nowhere. |

> Migration 049 (`migrate_049_drop_peak_week_plans.sql`) is **drafted and HELD** - do NOT apply. It drops `peak_week_plans`, which is still live product state: `getActivePeakWeekPlan` is read by `src/screens/ProGoalSetupScreen.js` and `src/screens/CoachOutputScreen.js` (the B4 contest countdown), and the push and pull paths in `src/lib/sync.js` still carry the table. Applying it would break sync and remove a shipped surface. See the migration's own header for the full client-side prerequisite list.

> Migration 051 is independent of 049/050 and safe to apply any time. Until it's applied, the Frequents tab simply shows its empty state (the `food_frequents_pull` RPC call fails quietly and the cache stays empty); nothing else is affected.

## Migrations 072-135

Rebuilt 2026-08-10: every migration after 071 was previously undocumented
here, so a reader of the authoritative tracker could not learn that
unapplied migrations exist at all. Status below is taken from each file's
own header, cross-checked against the 2026-07-27 production sweep recorded
in `docs/TASKBOARD.md`. Verification queries live in the migration files
themselves; add a row here whenever a migration is added.

| # | File | What it adds | Applied to production |
|---|---|---|---|
| 072 | `migrate_072_workouts_readiness_columns.sql` | `workouts.sleep_quality` + `energy_score` (COMP-008 pre-workout readiness). | **NEVER APPLIED, SUPERSEDED.** Its content shipped inside 118 on 2026-07-11. Kept for history; do not run. |
| 073 | `migrate_073_session_adjustment_telemetry.sql` | Telemetry allow-list: `session_adjustment_shown`, `session_adjustment_reverted` (COMP-015). | YES (2026-07-27 sweep) |
| 074 | `migrate_074_methodology_telemetry.sql` | Telemetry allow-list: `methodology_opened` (COMP-006). | YES (2026-07-27 sweep) |
| 075 | `migrate_075_recap_telemetry.sql` | Telemetry allow-list: `recap_opened` (COMP-005). | YES (2026-07-27 sweep) |
| 076 | `migrate_076_first_session_choice_telemetry.sql` | Telemetry allow-list: `first_session_choice` (COMP-013). | YES (2026-07-27 sweep) |
| 077 | `migrate_077_chart_window_telemetry.sql` | Telemetry allow-list: `chart_window_changed` (COMP-019). | YES (2026-07-27 sweep) |
| 078 | `migrate_078_streak_telemetry.sql` | Telemetry allow-list: `streak_week_resolved`, `streak_milestone_reached`, `streak_paused` (COMP-018). | YES (2026-07-27 sweep) |
| 079 | `migrate_079_cancel_reason_telemetry.sql` | Telemetry allow-list: `cancel_reason_captured` (COMP-025-A, enum values only). | YES (2026-07-27 sweep) |
| 080 | `migrate_080_step_tdee_telemetry.sql` | Telemetry allow-list: `step_tdee_modifier_evaluated` (COMP-026). | YES (2026-07-27 sweep) |
| 081 | `migrate_081_training_partners.sql` | The four training-partner tables (`partnerships`, week signals, cheers, invites) with RLS (NEW-002). | YES (2026-07-27 sweep) |
| 084 | `migrate_084_watch_telemetry.sql` | Telemetry allow-list: the four Apple Watch events (COMP-020). | YES (2026-07-27 sweep) |
| 085a | `migrate_085_food_quality_telemetry.sql` | Telemetry allow-list: `meal_plan_assembled`, `food_promote_failed`, `ocr_low_confidence_saved`, `food_sanity_check_failed`. | YES (2026-07-27 sweep) |
| 085b | `migrate_085_notification_preferences_checkin_missed.sql` | Widens the `notification_preferences` category CHECK to admit `checkin_missed` (OPP-C03). Superseded in scope by 125. | YES (2026-07-27 sweep) |
| 086 | `migrate_086_meal_plans.sql` | `meal_plans` cloud mirror (epoch-ms timestamps, `plan_json` jsonb). | YES (2026-07-27 sweep) |
| 087 | `migrate_087_cardio_log_ext_id.sql` | `cardio_log.ext_id` + partial unique index for passive import de-duplication. Historical: cardio logging was removed from the product 2026-08-10 (D92-1/D95); the table and column are retained, unread by any writer. | YES (2026-07-27 sweep) |
| 088 | `migrate_088_drop_debug_log_open_insert.sql` | Drops the open INSERT policy on `debug_log_uploads` (audit F-013). | YES (2026-07-27 sweep) |
| 089 | `migrate_089_plan_folders.sql` | `plan_folders` table + RLS + `programmes.folder_id` (free feature, never Pro-gated). | YES (2026-07-27 sweep) |
| 090 | `migrate_090_food_delete_tombstones.sql` | `deleted_at` tombstones on `food_favourites` + `daily_water`, and the bulk pull/push RPCs taught to carry them. | YES (2026-07-27 sweep) |
| 091 | `migrate_091_exercise_type.sql` | `exercises.exercise_type` + `custom_exercises.exercise_type` with a five-value CHECK; `weight_reps` stays the default. | YES (2026-07-27 sweep) |
| 092 | `migrate_092_partner_end_purge.sql` | `end_partnership(_pair_id)` so unpair actually deletes the pair's shared signals and cheers (the in-app promise / GDPR). | YES (2026-07-27 sweep) |
| 093 | `migrate_093_landmark_telemetry.sql` | Telemetry allow-list: `tonnage_milestone_reached`, `perfect_month_reached`. | YES (2026-07-27 sweep) |
| 094 | `migrate_094_users_profile_sex.sql` | `users_profile.sex` (nullable + CHECK) so biological sex survives a cloud restore alongside the rest of the profile. | YES (2026-07-27 sweep) |
| 095 | `migrate_095_trial_resume_within_window.sql` | `start_cascade` resumes an unspent trial inside its original 14-day window after account deletion. | YES (2026-07-27 sweep) |
| 096 | `migrate_096_delete_user_data_completeness2.sql` | Extends the `delete_user_data` fallback RPC to every table added since 062 (Article 17 completeness). | YES (2026-07-27 sweep) |
| 097 | `migrate_097_deletion_log_anonymise.sql` | Replaces plaintext `account_deletions_log.user_email` with a salted hash (Article 5(1)(e)). | YES (2026-07-27 sweep) |
| 098 | `migrate_098_deletion_sweeper.sql` | Server-side deletion sweeper that finishes a deletion the Edge Function could not complete. | YES (2026-07-27 sweep) |
| 099 | `migrate_099_funnel_telemetry.sql` | Telemetry allow-list: the activation-funnel events (`onboarding_step_completed`, the three firsts, `trial_lapse_day1_return`). | YES (2026-07-27 sweep) |
| 100 | `migrate_100_partner_shared_blocks.sql` | `partner_shared_blocks` (one shared block per pair) + RLS + LWW trigger + purge-path extension. | YES (2026-07-27 sweep) |
| 101 | `migrate_101_longest_run_pb_telemetry.sql` | Telemetry allow-list: `longest_run_pb_reached`. | YES 2026-07-10 (Claude-run, founder-authorised) |
| 102 | `migrate_102_partner_safety_consent.sql` | Partner STEP A: `partner_sharing` consent type + notice version, single-mint invites, and the rest of the safety foundation. | YES 2026-07-10 |
| 103 | `migrate_103_feature_locked_telemetry.sql` | Telemetry allow-list: `feature_locked_viewed` (the Pro lock view half of the funnel). | YES 2026-07-10 |
| 104 | `migrate_104_photo_prompt_telemetry.sql` | Telemetry allow-list: `photo_prompt_shown`, `photo_prompt_accepted`. | YES 2026-07-10 |
| 105 | `migrate_105_partner_weekly_intention.sql` | Partner D5-A: the mutual weekly session aim (a small integer per member per week). | YES 2026-07-10 |
| 106 | `migrate_106_partner_cheer_kind.sql` | Partner D5-B1: the acknowledgement enum column on `partner_cheers`. | YES 2026-07-10 |
| 107 | `migrate_107_partner_win_cards.sql` | Consent-gated partner win cards (no raw sets, food, coach notes, metrics or images). | YES 2026-07-10 |
| 108 | `migrate_108_founder_pro_ledger.sql` | Private founder Pro ledger so founder test accounts stay Pro across delete/re-signup. | YES 2026-07-10 |
| 109 | `migrate_109_micronutrient_columns.sql` | The 27 UK-NRV micronutrient columns on `foods` + `custom_foods` (MN-1). | YES 2026-07-10 |
| 110 | `migrate_110_perday_target_offsets.sql` | `perday_target_offsets` cloud mirror for the per-day-of-week calorie offsets (L05-PDT1). | YES 2026-07-10 |
| 111 | `migrate_111_nutrition_targets_goal_protein.sql` | `nutrition_targets.goal` + `protein_approach` (L05-NT1). | YES 2026-07-10 |
| 112 | `migrate_112_allergen_excludes.sql` | `users_profile.allergen_excludes` so an FSA allergen set survives a device change. | YES 2026-07-10 |
| 113 | `migrate_113_routine_position.sql` | `routines.position` for day-level plan reordering. | YES 2026-07-10 |
| 114 | `migrate_114_food_entry_weight_state.sql` | `food_entries.weight_state` (`as_weighed`/`raw`/`cooked`), a stored label with no conversion. | YES 2026-07-10 |
| 115 | `migrate_115_food_entry_eaten_at.sql` | `food_entries.eaten_at`, the optional editable time eaten (D22). | YES 2026-07-10 |
| 116 | `migrate_116_food_library_pull_micros.sql` | Re-issues `food_library_pull` to select the micronutrient columns 109 added. | YES 2026-07-10 |
| 117 | `migrate_117_telemetry_view_grants.sql` | Revokes anon/authenticated SELECT on `engine_telemetry_daily` (security-advisor ERROR). | YES 2026-07-11 |
| 118 | `migrate_118_workouts_recipes_sync_schema_fix.sql` | Four cloud/client drift fixes, including 072's `workouts.energy_score` + `sleep_quality` and the recipes/saved_meals sync shape. | YES 2026-07-11 |
| 119 | `migrate_119_lock_direct_client_writes.sql` | Closes four trust-boundary holes where a permissive RLS write policy let `authenticated` bypass a SECURITY DEFINER RPC (Codex adversarial audit). | YES - first run 2026-07-12 outside the runner, re-applied through it 2026-07-27 |
| 120 | `migrate_120_marketing_waitlist.sql` | `marketing_waitlist` (public, GDPR-consented signups). Renumbered from a historical 119. | YES 2026-07-12 |
| 121 | `migrate_121_marketing_hq_tables.sql` | `marketing_admins` + the four Marketing HQ tables. Renumbered from a historical 120. | YES 2026-07-12 |
| 122 | `migrate_122_marketing_admins_self_read.sql` | Own-row read policy on `marketing_admins`. Renumbered from a historical 121. | YES 2026-07-12 |
| 123 | `migrate_123_retention_email_loop.sql` | The four retention-email tables (log, opt-out, survey responses, schedule). Renumbered from a historical 122. | YES 2026-07-12 |
| 124 | `migrate_124_marketing_email_optout_anon_insert.sql` | Anon INSERT-only policy on `marketing_email_optout` so the public unsubscribe page works. | YES 2026-07-12 |
| 125 | `migrate_125_notification_preferences_category_full_enum.sql` | Widens the `notification_preferences` category CHECK to the full 23-value client enum (Sentry VOLYUME-20/21/22). | YES 2026-07-27 (founder: "Yes run 119 and 125 against production") |
| 126 | `migrate_126_scan_calibration_events.sql` | `scan_calibration_events`, anonymous by construction, client INSERT only (D81). | YES 2026-07-13 |
| 127 | `migrate_127_scan_calibration_vision_debug.sql` | Founder-account-only diagnostic columns on `scan_calibration_events` (D83). | YES 2026-07-13 |
| 128 | `migrate_128_apple_review_accounts.sql` | Seeds the two App Review sign-in accounts (Pro + Free). | YES 2026-07-27 |
| 129 | `migrate_129_mesocycles_deload_week.sql` | `mesocycles.deload_week` so the user's real deload placement can sync. | YES (file header: 2026-08-06, founder GO) |
| 130 | `migrate_130_revoke_anon_execute_security_definer.sql` | Revokes anon EXECUTE on 34 SECURITY DEFINER functions; authenticated and service_role keep theirs. | YES (file header: 2026-08-06, founder GO) |
| 131 | `migrate_131_mesocycles_block_ledger.sql` | `mesocycles.block_ledger` jsonb (adaptive mesocycle Stage 6). | YES 2026-08-09, verified |
| 132 | `migrate_132_planned_muscle_volume_provenance.sql` | Landmark bounds + seed provenance on `planned_muscle_volume` (Campaign 1 P0-1). | **YES - applied 2026-08-12, verified** (row corrected 2026-08-18 against the CURRENT STATUS block, which is the authority) |
| 133 | `migrate_133_delete_privacy_pref_rows.sql` | Deletes `@volyume_privacy_prefs` rows that should never have been transmitted (Campaign 1 P0-2). | **YES - applied 2026-08-12** (no-op: 0 rows; row corrected 2026-08-18 against the CURRENT STATUS block) |
| 134 | `migrate_134_stale_write_triggers.sql` | Refuse-stale-write triggers on the nine unguarded coaching-state tables (Campaign 1 P0-8). | **YES - applied 2026-08-12, verified** (row corrected 2026-08-18 against the CURRENT STATUS block) |
| 135 | `migrate_135_coach_outputs_week_unique.sql` | De-duplicates `coach_outputs` per user-week, then a unique index (Campaign 1 review finding 10). | **YES - applied 2026-08-12** (step 3 silent no-op, see the DEFECT note in the CURRENT STATUS block; row corrected 2026-08-18) |
| 136 | `migrate_136_exercise_intent.sql` | `exercise_intent`, `exercise_swaps`, `exercise_slot_defaults` - the cloud half of the Campaign 9 exercise-intent layer (local schema v73). Must land BEFORE a build carrying their sync push ships. | **YES - applied 2026-08-12, verified** (this row said "awaiting the phrase" until 2026-08-14; corrected against the CURRENT STATUS block above, which is the authority) |
| 137 | `migrate_137_exercise_swap_scope.sql` | `exercise_swaps.scope` ('session' \| 'programme'), so a temporary in-workout substitution is distinguishable from a permanent programme replacement. Campaign 16 quality law 1. NULL means the row predates the column; the client's NEGATIVE reading counts only 'programme', so an unknown row can never cost a user an exercise. Local schema v75. | **YES - LIVE, verified 2026-08-18** (`exercise_swaps.scope` present, text, nullable, checked directly against production during the 142/143 batch; the exact apply date/session is not resolvable from the repository - see the 2026-08-18 batch note above). |
| 138 | `migrate_138_food_swaps.sql` | `food_swaps` - the cloud half of the Campaign 17A job 3 food-intent layer (local schema v77). `scope` is `just_this_time` or `persistent`, NOT NULL: a one-off swap ("no chicken in the house tonight") must never teach food dislike, while a standing replacement ("use turkey from now on") legitimately steers future plans. Ship order does not matter; until it runs the table is device-local. | **YES - LIVE, verified 2026-08-18** (`food_swaps` table present in production, checked directly during the 142/143 batch; apply date/session not resolvable from the repository). |
| 139 | `migrate_139_routine_exercises_selection_reason.sql` | Adds nullable `routine_exercises.selection_reason` so Campaign 16 selector provenance survives cloud backup and fresh-device restore. Client push retries without the optional column until it exists. | **YES - LIVE, verified 2026-08-18** (`routine_exercises.selection_reason` present in production, checked directly during the 142/143 batch). |
| 140 | `migrate_140_session_resolutions.sql` | Campaign 18 explicit `SKIPPED_BY_USER` / `ENDED_EARLY` session resolutions, owner/parent RLS, and deterministic refuse-stale conflict trigger. Renumbered from a colliding draft named 137; local schema counterpart is live. | **YES - LIVE, verified 2026-08-18** (`session_resolutions` table present in production, checked directly during the 142/143 batch). 049 is unrelated and remains HELD. |
| 141 | `migrate_141_effective_maintenance_memos.sql` | Campaign 19 effective-maintenance memo + revalidation marker (cloud half of local v80/v81). | **YES - LIVE, verified 2026-08-18** (`effective_maintenance_memos` table present in production, checked directly during the 142/143 batch). |
| 142 | `migrate_142_exercise_intent_expiry.sql` | `exercise_intent.expires_at` (timestamptz) - the D107-2 PATTERN_AVOID day-bound duration (local `expires_at_ms`, schema counterpart live). Must land BEFORE a build carrying the PATTERN_AVOID push ships. | **YES - applied 2026-08-18, verified** (Claude-run on the founder phrase; column present, timestamptz, nullable). |
| 143 | `migrate_143_load_semantics.sql` | `exercises.load_semantics` + `custom_exercises.load_semantics` (text, four-value CHECK) - the D107-2 weight-meaning axis (total / per_hand / assisted / added_bodyweight). | **YES - applied 2026-08-18, verified** (Claude-run, same batch as 142; both columns and both named CHECKs present). |
| 145 | `migrate_145_capability_constraints.sql` | `capability_constraints` - the CC26 capability lane's cloud table (role baseline/episode, source, rule_kind, laterality, interval fields, supersession lifecycle), refuse-stale trigger, owner RLS, and `delete_user_data()` recreated with the capability deletes (Art 9 erasure reach). Local schema counterpart is live (CC26). | **YES - APPLIED 2026-08-21** (founder phrase, MCP apply; verified: table/RLS/policy/trigger/indexes). |
| 146 | `migrate_146_session_constraint_effects.sql` | `session_constraint_effects` - per-workout constraint-effect provenance (one row per workout, effects JSON), refuse-stale trigger, owner RLS. Inert until CC27+ writes effects. | **YES - APPLIED 2026-08-21** (same batch; verified incl. unique (user_id, workout_id)). |
| 147 | `migrate_147_capability_consent.sql` | Widens the `consent_log` CHECK with `capability_data`, adds `users_profile.capability_data_consent`/`_at`, and `record_capability_consent()` RPC (granular Art 9 consent for the capability lane, separate from healthConsent). | **YES - APPLIED 2026-08-21** (same batch; CHECK widened to five values; RPC present; ACL aligned to record_health_consent via migrate_147_capability_consent_acl_revoke). |
| 148 | `migrate_148_exercise_demands.sql` | CC27 demand ontology: ten nullable demand columns on `exercises` + `custom_exercises` (position/floor/overhead/grip/unilateral/bilateral upper+lower/axial/impact/balance; NULL = UNKNOWN, CAP-8). Until it runs, custom-exercise pushes fail soft (the migrate_143 tolerated mode) and local derivation stays authoritative via the pull applier's COALESCE. | **YES - APPLIED 2026-08-21** (same batch; ten columns verified on both tables). |
| 149 | `migrate_149_swap_cause_effective_choice.sql` | CC29: `exercise_swaps.cause` (eligibility-derived 'constraint' provenance, CAP-13) + `capability_constraints.effective_choice` (the section 14 Apply/Decline standing choice). Both nullable additive; pushes fail soft until applied. | **YES - APPLIED 2026-08-21** (same batch; both columns verified). |
| 150 | `migrate_150_capability_telemetry.sql` | **RETIRED, NEVER TO BE RUN** (founder no-outside-party law + Q4 ruling, 2026-08-21): even content-free capability events land per-user, so their presence could reveal capability-lane use. Client emission and catalogue entries removed the same day; the file is now a no-op kept for numbering. | **RETIRED UNAPPLIED - exclude from every batch.** The capability run set is 145-149 and 151. |
| 151 | `migrate_151_weight_bearing_hands.sql` | Gap-closure Phase C: eleventh demand column `weight_bearing_hands` (boolean, NULL = unknown) on `exercises` + `custom_exercises` - the push-up class loads extended wrists while reading grip-free, so wrist/hand restrictions were inexpressible. Movement metadata only, no user data. Until it runs, custom pushes carrying the field fail soft per the migrate_143 tolerated mode. | **YES - APPLIED 2026-08-21** (same batch; column verified on both tables). |
| 152 | `migrate_152_capability_adaptation_mode.sql` | CC33 D112 R8 (section 25, audit T2-26): `capability_constraints.adaptation_mode` ('hold' \| 'propose'; NULL = propose) - the per-episode "just hold my plan" choice. Additive nullable; the push includes the field only when a pushed row carries it. | **YES - APPLIED 2026-08-28** (founder authorisation given as an explicit named confirmation of "Apply migrate_152 to the production database" in chat, recorded here as the phrase-gate equivalent; MCP apply; verified: column text/nullable with its CHECK present via information_schema). |
| 155 | `migrate_155_partner_cheer_server_date.sql` | Replaces the partner-cheer INSERT policy so `sent_on` must be the database's UTC date. Closes arbitrary-date daily-rate bypass; deploy with the matching `partner-cheer` Edge Function change. | **PENDING - Daybreak Blue 2026-08-28; do not apply without explicit production authorization.** |
| 156 | `migrate_156_activation_funnel_telemetry.sql` | Replaces `record_engine_telemetry` with the complete allow-list: migration 104's 87 names plus the 18 activation and programme funnel events the client emits (first_workout_started, first_weigh_in, checkin_started, first_checkin_completed, coach_result_viewed, coach_recommendation_accepted/declined, notification_permission_requested, setup_started, first_home_landed, plan_preview_shown/confirmed/dismissed, block_decision, library_plan_previewed, manual_plan_started, manual_plan_saved, plan_replaced). Create-or-replace, idempotent. Rollback: re-apply 104. | **YES - APPLIED 2026-09-04** (exact phrase; MCP; verified as above). |
| 157 | `migrate_157_pause_cascade_cron.sql` | Unschedules the `cascade-advance-due-users` pg_cron job (migration 031) on the fully-free product; the function stays defined, nothing else touched. Rollback: one `cron.schedule` statement (see file header). | **YES - APPLIED 2026-09-04** (exact phrase; MCP; verified: zero matching cron rows, function still defined). |
| 158 | `migrate_158_routine_exercise_groups.sql` | Exercise library expansion EL-9: two nullable columns on `routine_exercises` (`group_kind` 'circuit'\|null=superset, `round_rest_seconds`) for the circuit model. Client push omits both while `CIRCUIT_SYNC_COLUMNS_ENABLED` (src/lib/sync/featureFlags.js) is false; pull reads both via `?? null`. | **APPLIED AND VERIFIED 2026-09-05** (Claude-run batch below). |
| 159 | `migrate_159_workout_set_evidence_class.sql` | Exercise library expansion EL-7: nullable `workout_sets.evidence_class` (null=conventional \| 'circuit' \| 'ballistic' \| 'circuit_ballistic'), stamped by the live screen, never user-chosen. Client push omits it while `CIRCUIT_SYNC_COLUMNS_ENABLED` is false; pull reads it via `?? null`. | **APPLIED AND VERIFIED 2026-09-05** (Claude-run batch below); flag flipped ON in the same landing. |
| 160 | `migrate_160_community.sql` | Community (Social / Community / Discovery campaign, `docs/social-discovery-2026-09-06/30-BLUEPRINT.md` section 3). Fourteen `community_*` tables (profiles, follows, blocks, mutes, programmes + uses, posts, reactions, comments, reports, moderators, moderation log, activity, rate events), all RLS-enabled with NO anon/authenticated policy and ALL privileges revoked from both; 41 SECURITY DEFINER RPCs pinned to `search_path = public, pg_temp` as the only ingress and egress (SD-14). Widens the `consent_log` CHECK (`community_visibility`) and the `notification_preferences` category CHECK (`community_follow`, `community_activity`); seeds `community_moderators`; re-issues `delete_user_data()` in full with two-sided Community deletes. Rollback: drop the fourteen tables and the `community_*` / `_community_*` functions, re-apply migrate_154, re-narrow both CHECKs (see the file header). | **WRITTEN, NOT APPLIED - awaiting the founder's exact phrase.** |

> Ledger gap noted 2026-08-20: `migrate_144_apple_review_password_reset.sql`
> exists in this folder but has no row in this table (it predates CC26 and
> belongs to the App Review account workstream). The gap is recorded here
> rather than back-filled, because its applied/not-applied status is not
> resolvable from the repository alone.

> Date note: the 2026-08-09 block near the top of this file describes 129 and
> 130 as "already applied 2026-08-08", while both migration headers record
> 2026-08-06. The applied fact is not in doubt; the exact date is not
> resolvable from the repository, so both readings are left visible rather
> than one being silently picked.

## How to apply

Migrations 037-048 and 050-059 are applied (founder applied the 048,
050-055, 058 set on 2026-06-01). 049 is HELD and must not be applied. This
playbook stands for any future migration; apply in numeric order in the SQL
Editor. After applying 051, `SELECT refresh_food_frequents();` was run once
to seed the cache.

1. Open the Supabase Dashboard → SQL Editor → New query.
2. Open one migration file at a time from this folder in numeric order.
3. Paste the full contents into the SQL Editor.
4. Click **Run**. The migrations are wrapped in `CREATE OR REPLACE
   FUNCTION` / `CREATE TABLE IF NOT EXISTS`, so re-running an
   already-applied migration is a no-op (does not throw).
5. After running, paste the matching verification query (below).
6. If a verification fails, stop and report back before applying
   the next one. Don't skip ahead.

## Verifications

### Verify allow-list extension (works for migrations 037, 038, 040, 041, 043)

After applying each allow-list migration, this query lists every
event the RPC currently accepts. You should see every event the
migration added.

```sql
-- Pull the IN-list from the RPC source.
SELECT pg_get_functiondef(p.oid) AS def
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'record_engine_telemetry';
```

Read the `IF _event NOT IN (...)` block in the returned definition.
The complete expected list after all five migrations (037 through
041) is:

```
ed_pattern_flag_fired, ed_pattern_flag_cleared,
goal_lock_set, goal_lock_cleared,
tier_changed,
cascade_started, cascade_advanced, cascade_skipped_ahead,
paid_converted, churn_at_gate,
food_lookup_barcode, ocr_writeback_attempted,
rapid_loss_compression_triggered,
weekly_coach_run, ffm_floor_hold_fired,
food_logged, food_search_attempt,
paywall_shown, paywall_tapped_cta,
sign_in, sign_out, article9_consent_recorded,
account_created, custom_food_created,
app_cold_start, app_foregrounded, app_backgrounded, sync_run,
cascade_state_transition, purchase_initiated, purchase_completed,
purchase_failed, subscription_cancelled, restore_purchases_attempted,
notification_sent, notification_tapped, notification_failed,
article9_consent_withdrawn,
sync_conflict_resolved
```

39 events total.

### Verify `account_deletions_log` (migration 039)

```sql
-- Table exists with the expected columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'account_deletions_log'
ORDER BY ordinal_position;
```

Expected columns: `id (uuid)`, `user_id (uuid)`, `user_email (text)`,
`initiated_at (timestamptz)`, `completed_at (timestamptz)`,
`reason (text)`, `source (text)`, `app_version (text)`,
`platform (text)`.

```sql
-- RLS is enabled
SELECT relrowsecurity FROM pg_class
WHERE relname = 'account_deletions_log' AND relnamespace = (
  SELECT oid FROM pg_namespace WHERE nspname = 'public'
);
-- Expected: t
```

```sql
-- The two RPCs are service-role only (no GRANT to authenticated)
SELECT p.proname,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_can_call,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_can_call
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('record_account_deletion_started', 'record_account_deletion_completed');
-- Expected: auth_can_call = f, service_can_call = t
```

### Verify `upgrade_tier_for_user` (migration 042)

```sql
-- Function exists with the expected signature
SELECT pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'upgrade_tier_for_user';
-- Expected: _user_id uuid, _target_tier text, _reason text, _source_surface text, _payment_ref text
```

```sql
-- Service-role only (no GRANT to authenticated/anon)
SELECT has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_can_call,
       has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon_can_call,
       has_function_privilege('service_role',  p.oid, 'EXECUTE') AS service_can_call
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'upgrade_tier_for_user';
-- Expected: auth_can_call = f, anon_can_call = f, service_can_call = t
```

### Verify `notification_preferences` (migration 044)

```sql
-- Table exists with the expected columns + composite PK
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'notification_preferences'
ORDER BY ordinal_position;
-- Expected: user_id (uuid, NO), category (text, NO), enabled (boolean, NO),
--           time_pref (text, YES), created_at (timestamptz, NO), updated_at (timestamptz, NO)
```

```sql
-- Composite PK on (user_id, category)
SELECT a.attname AS column_name
FROM pg_index i
JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
WHERE i.indrelid = 'notification_preferences'::regclass AND i.indisprimary
ORDER BY array_position(i.indkey, a.attnum);
-- Expected: user_id, category
```

```sql
-- RLS enabled + four per-operation policies
SELECT relrowsecurity FROM pg_class
WHERE relname = 'notification_preferences' AND relnamespace = (
  SELECT oid FROM pg_namespace WHERE nspname = 'public'
);
-- Expected: t
```

## After all eight are applied

Smoke-test from the live app build:

1. Cold-start the app. Should fire `app_cold_start`. Background the
   app and bring it back to active — should fire
   `app_backgrounded` then `app_foregrounded`.
2. Log a workout, see set fire `food_logged` / lifecycle events
   reach the cloud (drain queue).
3. Settings → Privacy → Withdraw health-data consent. Should
   produce a new row in `consent_log` with `granted = false` AND a
   row in `engine_telemetry` with `event = 'article9_consent_withdrawn'`.
4. Sign in, tap Delete Account, type DELETE, confirm. After ~30s
   check `account_deletions_log` for a row with both `initiated_at`
   and `completed_at` populated.
5. Trigger a sync conflict (edit the same row on two devices, sync
   both). Should produce a row in `engine_telemetry` with
   `event = 'sync_conflict_resolved'` carrying `table`, `record_id`,
   `strategy`, `winner` in the payload.
6. Toggle a category in You → Notifications. Should produce or
   update a row in `notification_preferences` for that
   `(user_id, category)` pair with `enabled = false` / new
   `time_pref`, and the sync indicator should briefly show
   `pending` before going back to `synced`.

If `completed_at` is null after a few minutes for step 4, the
`auth.admin.deleteUser` leg in the Edge Function failed silently
and you'll need to inspect the function logs.

## Re-application safety

All five migrations are additive and idempotent:

- 037, 038, 040, 041 are `CREATE OR REPLACE FUNCTION
  record_engine_telemetry(...)`. The function definition is
  replaced wholesale each time. The most recently applied one
  carries the union of all allow-listed events.
- 039 uses `CREATE TABLE IF NOT EXISTS` + `CREATE INDEX IF NOT
  EXISTS` + `CREATE OR REPLACE FUNCTION`. Safe to re-run.

If you apply them out of order, the last allow-list migration you
run determines the final allow-list. Apply them in order anyway —
the documentation in each file references the previous ones for
context.

### Verify `users_profile.column_updates_at` (migration 045)

```sql
-- Column exists, jsonb, NOT NULL, default '{}'
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'users_profile'
  AND column_name = 'column_updates_at';
-- Expected: column_updates_at | jsonb | NO | '{}'::jsonb

-- Safe-merge trigger is installed
SELECT trigger_name
FROM information_schema.triggers
WHERE event_object_table = 'users_profile'
  AND trigger_name = 'users_profile_merge_column_updates_at';
-- Expected: one row

-- Existing rows defaulted to empty maps (not NULL)
SELECT count(*) FILTER (WHERE column_updates_at IS NULL) AS null_rows,
       count(*) AS total_rows
FROM users_profile;
-- Expected: null_rows = 0
```

Then sanity-check the trigger does the right thing on a touch:

```sql
-- Pick a real user id from auth.users for this. Replace <UID>.
UPDATE users_profile
SET first_name = first_name,
    column_updates_at = '{"first_name": "2026-05-27T00:00:00Z"}'::jsonb
WHERE id = '<UID>';

SELECT column_updates_at FROM users_profile WHERE id = '<UID>';
-- Expected: { "first_name": "2026-05-27T00:00:00Z" } merged with whatever
-- was there before (other keys preserved).
```

If `column_updates_at` does not appear, the migration did not run.
If trigger row is missing, the merge function did not install.
If existing rows still show NULL, the DEFAULT did not back-fill —
re-run the migration (idempotent) and re-check.

### Verify `recipe_ingredients` soft-delete (migration 046)

```sql
-- Both columns present, with the expected types and defaults
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'recipe_ingredients'
  AND column_name IN ('updated_at', 'deleted_at')
ORDER BY column_name;
-- Expected:
--   deleted_at | timestamp with time zone | YES | (null)
--   updated_at | timestamp with time zone | NO  | now()

-- Touch trigger is installed
SELECT trigger_name
FROM information_schema.triggers
WHERE event_object_table = 'recipe_ingredients'
  AND trigger_name = 'recipe_ingredients_touch_updated_at';
-- Expected: one row

-- Partial live index is installed
SELECT indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'recipe_ingredients'
  AND indexname = 'idx_recipe_ingredients_live';
-- Expected: one row

-- Every row has a non-NULL updated_at thanks to the DEFAULT now()
-- on column creation.
SELECT count(*) FILTER (WHERE updated_at IS NULL) AS null_rows,
       count(*) AS total_rows
FROM recipe_ingredients;
-- Expected: null_rows = 0
```

If `updated_at` does not appear, the migration did not run. If
trigger row is missing, the touch function did not install. If
any rows show NULL updated_at, the DEFAULT did not land. Re-run
the migration (idempotent) and re-check.

### Verify `body_metrics` + `weekly_checkins_v2` LWW (migration 047)

```sql
-- body_metrics: updated_at + deleted_at present, with expected
-- types + defaults.
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'body_metrics'
  AND column_name IN ('updated_at', 'deleted_at')
ORDER BY column_name;
-- Expected:
--   deleted_at | timestamp with time zone | YES | (null)
--   updated_at | timestamp with time zone | NO  | now()

-- weekly_checkins_v2: updated_at only (registry says
-- softDelete:false, so no deleted_at).
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'weekly_checkins_v2'
  AND column_name = 'updated_at';
-- Expected:
--   updated_at | timestamp with time zone | NO  | now()

-- Touch triggers installed on both tables.
SELECT event_object_table, trigger_name
FROM information_schema.triggers
WHERE event_object_table IN ('body_metrics', 'weekly_checkins_v2')
  AND trigger_name IN (
    'body_metrics_touch_updated_at',
    'weekly_checkins_v2_touch_updated_at'
  )
ORDER BY event_object_table;
-- Expected: two rows, one per table.

-- Partial live index on body_metrics for Athlete Hub reads.
SELECT indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'body_metrics'
  AND indexname = 'idx_body_metrics_live';
-- Expected: one row.

-- Every existing row carries the migration-time DEFAULT now().
SELECT
  (SELECT count(*) FILTER (WHERE updated_at IS NULL) FROM body_metrics)       AS body_metrics_null_updated_at,
  (SELECT count(*) FILTER (WHERE updated_at IS NULL) FROM weekly_checkins_v2) AS weekly_checkins_v2_null_updated_at;
-- Expected: both 0.
```

If either column does not appear, the migration did not run on
that table. If trigger rows are missing, the touch functions did
not install. Re-run (idempotent) and re-check.

### Verify `food_favourites.kind` (migration 048)

```sql
-- Column present with the right type + default
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'food_favourites'
  AND column_name = 'kind';
-- Expected:
--   kind | text | 'fav'::text | NO

-- CHECK constraint installed
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname = 'food_favourites_kind_check';
-- Expected: one row with definition CHECK ((kind = ANY (ARRAY['fav','dislike'])))

-- Every existing row has kind populated (DEFAULT applied)
SELECT count(*) FILTER (WHERE kind IS NULL) AS null_kind_rows,
       count(*) AS total_rows
FROM food_favourites;
-- Expected: null_kind_rows = 0.
```

If the column doesn't appear, the ADD COLUMN didn't run. If the
constraint is missing, the DO block fell through; re-run the
migration (idempotent) and re-check.

### Verify `weekly_checkins_v2.cardio_adherence` (migration 050)

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'weekly_checkins_v2'
  AND column_name = 'cardio_adherence';
-- Expected: cardio_adherence | text | YES
```

If the column is absent, the per-table weekly-checkins push will
reject any row carrying a cardio adherence answer ("column
cardio_adherence does not exist"). Re-run the migration (IF NOT
EXISTS makes it safe) and re-check.

### Verify `food_frequents` (migration 051)

Three checks: the table exists, the cron job is scheduled, and the
worker runs.

```sql
-- 1. Table + RLS.
SELECT relrowsecurity FROM pg_class WHERE relname = 'food_frequents';
-- Expected: t (RLS enabled)

-- 2. Cron job scheduled.
SELECT jobname, schedule FROM cron.job WHERE jobname = 'refresh-food-frequents';
-- Expected: refresh-food-frequents | 10 3 * * *

-- 3. Run the worker once by hand to seed before the first night.
SELECT refresh_food_frequents();
-- Expected: {"rows": <n>, "ran_at": ..., "duration_ms": ...}

-- 4. Spot-check a user's rows (replace the uid).
SELECT food_ref, log_count FROM food_frequents
WHERE user_id = '<uid>' ORDER BY log_count DESC;
```

The client calls `food_frequents_pull()` (returns the caller's rows as
a jsonb array) when the Frequents tab opens and the local cache is
older than 12h. If the migration isn't applied, that RPC 404s, the app
swallows it, and the tab shows "Nothing logged often enough yet." No
other surface is affected.

### Verify daily_water reconcile (migration 052)

```sql
-- 1. Confirm the column is now present.
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'daily_water'
ORDER BY ordinal_position;
-- Expected to include: user_id (uuid), entry_date (date), ml (integer), updated_at (timestamptz)

-- 2. Confirm the composite primary key.
SELECT a.attname
FROM pg_index i
JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
WHERE i.indrelid = 'daily_water'::regclass AND i.indisprimary;
-- Expected: user_id, entry_date
```

After applying, open the app and pull-to-refresh / let it sync. The red
"Sync error" badge should clear (no more `food_sync_push` 42703), and the
Sentry `sync.tables.foodDomain.push` errors should stop.

### Verify `users_profile.diet_preference` (migration 055)

```sql
-- Column present with the right type + default
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'users_profile'
  AND column_name = 'diet_preference';
-- Expected:
--   diet_preference | text | 'omnivore'::text
```

If the column doesn't appear, the ADD COLUMN didn't run; re-run the
migration (idempotent) and re-check. Until it's applied, the new
build's profile pull errors on the missing column, so apply this
before the next AAB ships. Existing rows read as 'omnivore' on the
client whether the stored value is the default or NULL.

### Verify daily_steps (migration 056)

After applying, confirm the table, policy, and trigger exist:

```sql
SELECT column_name, data_type FROM information_schema.columns
  WHERE table_name = 'daily_steps' ORDER BY ordinal_position;
-- expect: user_id uuid, entry_date date, steps integer,
--         source text, updated_at timestamp with time zone

SELECT polname FROM pg_policies WHERE tablename = 'daily_steps';
-- expect: "Users can manage own steps"

SELECT tgname FROM pg_trigger WHERE tgrelid = 'daily_steps'::regclass
  AND NOT tgisinternal;
-- expect: daily_steps_touch_updated_at
```

If any are missing, re-run the migration (idempotent) and re-check.
Additive and independent, so it can go any time; until it's applied
the new client keeps step data local (per-table push errors are
caught and do not fail the wider sync run).

### Verify peri-workout meal slots (migration 057)

After applying, confirm the relaxed CHECK is in place:

```sql
SELECT pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname = 'food_entries_meal_slot_check';
-- expect the definition to list all six values:
--   CHECK ((meal_slot = ANY (ARRAY['breakfast','lunch','dinner',
--           'snack','preworkout','postworkout'])))

-- A peri-workout insert is now accepted (rolls back, no row kept):
BEGIN;
INSERT INTO food_entries
  (id, user_id, entry_date, meal_slot, food_ref, quantity_g,
   kcal, protein_g, carbs_g, fat_g)
VALUES (gen_random_uuid(), auth.uid(), current_date, 'preworkout',
   'global:test', 100, 0, 0, 0, 0);
ROLLBACK;
-- expect: INSERT 0 1 (no CHECK violation), then ROLLBACK
```

If the constraint still lists only four values, re-run the migration
(idempotent) and re-check. Additive: the four original slots stay
valid, so the frozen AAB keeps syncing; only the two new values need
this applied before they can reach the cloud.

### Verify weekly_checkins_v2.steps_avg (migration 058)

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'weekly_checkins_v2'
  AND column_name = 'steps_avg';
-- Expected: steps_avg | integer | YES
```

If the column is absent, the per-table weekly-checkins push rejects any
row carrying a steps average ("column steps_avg does not exist"). Re-run
the migration (IF NOT EXISTS makes it safe) and re-check. Additive +
nullable, so the frozen AAB is unaffected (its pushes omit the column).

### Verify numbered meal slots (migration 059)

```sql
SELECT pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.food_entries'::regclass
  AND conname = 'food_entries_meal_slot_check';
-- Expected: CHECK ((meal_slot ~ '^(breakfast|lunch|dinner|snack|preworkout|postworkout|meal_[0-9]+)$'::text))
```

This is APPLIED. Before it was, any 'meal_N' entry from a build using the
flexible meal model failed the old fixed-list CHECK on push (caught
per-table; the row stayed local, the wider sync run still succeeded). The six
legacy values still match the pattern, so the frozen AAB is unaffected.

## Cloud schema drift audit

`supabase/audit_cloud_schema_drift.sql` is a read-only audit query.
Run it any time you suspect the live cloud has diverged from what
the sync handlers expect (the recipe_ingredients.created_at gap
that broke migration 046's first apply was this kind of drift).

How to use:

1. Supabase Dashboard -> SQL Editor -> paste the whole file -> Run.
2. The first result set lists every (table, column) the per-table
   sync handlers depend on, with `status = OK` when present in
   the live cloud and `status = MISSING` when not. MISSING rows
   sort to the top; any MISSING row is a drift that needs a
   migration (or a handler fix if the column was renamed
   client-side).
3. The second result set lists every public table on the cloud
   that is neither in the SYNC_REGISTRY nor on the audit's
   intentional exclusion list (service-role only, telemetry,
   legacy schema). New tables added server-side without a
   client-side handler surface here.

The expected column set is hand-maintained inside the audit file;
when you add a column to a sync handler, add a row to the
matching VALUES section in the audit. CI does not catch this
omission yet; the follow-up lives on `docs/TASKBOARD.md` (the old pointer
here was to `docs/CURRENT_STATUS.md` § 8, which has been SUPERSEDED/CLOSED
since 2026-07-10).
