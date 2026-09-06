# VOLYUME TASKBOARD — the single current task source

_Created 2026-07-10 by the docs staleness sweep. This is THE list the project
works from. Update it at every landing (add, move to done, re-verify).
Landed-item detail rolls to
`docs/ux-world-class-audit-2026-07-09/_HANDOVER-ARCHIVE.md` at each landing
(D41 token hygiene): this board holds only in-flight / queued / held._

## How this board works (D37 + D38 + D47 - restated)

- **D47 (order rule, founder 2026-07-11).** The board is worked TOP TO
  BOTTOM, every item, in order - the lead never selects, defers or
  re-prioritises items by preference. Blocked items are surfaced and the
  next in order starts immediately.

## (D37 + D38 detail)

- **D37 (staleness rule).** Nothing from a pre-campaign audit is built from its
  old blueprint. Every pre-campaign item is triaged against today's tree + the
  decision register first; superseded/reverted items are closed, not
  resurrected. All dated audit folders and loose audit/status docs now carry a
  SUPERSEDED/CLOSED banner pointing here. Work flows only from
  `docs/ux-world-class-audit-2026-07-09/_HANDOVER-AND-RESUME.md` and this board.
- **D38 (elevation rule).** A job being on a list, in an audit, or in an old
  queue is NEVER sufficient reason to build it. Before dispatch, the brief must
  state, verified against the tree: CURRENT STATE (what the app does today on
  that surface), END STATE (what the item delivers), ELEVATES BECAUSE (why the
  delta improves the app as it now is). Any item that cannot honestly carry all
  three drops to NEEDS JUSTIFICATION at the bottom of this board, not the queue.

Authority for every line below is cited inline (decision Dnn + source doc).
The full register is `docs/ux-world-class-audit-2026-07-09/DECISIONS-2026-07-09.md`.

---

## COMMUNITY REPLACES PARTNERS (2026-09-06) — LANDED on `claude/volyume-social-discovery-h7dknu`, merged to main; CLOUD 160 WRITTEN NOT APPLIED

Founder brief in chat 2026-09-06 (one autonomous end-to-end task). Campaign
folder `docs/social-discovery-2026-09-06/` (README = document map;
`40-DECISIONS.md` SD-01..SD-16 + build-time rulings; `30-BLUEPRINT.md`;
`50-VERIFICATION.md`; `60-FINAL-REPORT.md`; reviews `51`, `52`). Safety
records `docs/community-safety/`. What landed: Community (Following +
Discover) off Today, Coach, Train, Settings and every share surface;
profiles with chosen facts and their own consent row; follows with
requests; card-based training stories; versioned structure-only programme
snapshots with Use as-is and an explained deterministic Adapt for me;
search, suggestions with reasons, dimension pages; report, block, mute,
auto-hide, moderator queue with audit log; two budgeted push categories;
deep links `community`/`u`/`p`/`s`; static link pages; Partners RETIRED
(SD-03) with active pairs becoming mutual follows on join and old links
landing on Community. Founder actions: section 3 (Community block).

---

## NEW-FAMILY REACHABILITY AFTER VOLYUME-28 (2026-09-06) — LANDED ON MAIN. Record: `docs/final-certification-2026-09-05/07-FINDINGS.md` F-21..F-23 + table; ruling D154.

Founder brief in chat: kettlebells missing from library plans, "probably
on the engine and plan builder too. Check all the new ones". Opus audit
against the real corpus and real `generatePlan`, lead-reviewed.
- [x] Library: the seed race (VOLYUME-28) was the whole library cause;
      all 57 plans' names resolve against the corpus (lead probe).
- [x] F-21: 79 landmine/suspension/sandbag/medicine-ball/sled rows had no
      picker chip. Chip row now `PICKER_EQUIPMENT_CHIPS` with Landmine,
      Suspension, Other; pinned against the corpus (0 unreachable).
- [x] F-22: six "Band-Resisted"/"Reverse Band" barbell lifts derived as
      band (excluded from Full Gym). Fixed; rederive key v7 so existing
      installs take it.
- [x] F-23 / D154: ordinary generation reaches 0 kettlebell slots by the
      C16 tiers; kettlebell STYLE plans fill 9/9. Ruled: no tier change
      (profiles cannot tell who owns a bell). Founder fork open: an
      equipment inventory if ordinary home plans should use kettlebells.
Device checklist (EAS build): 1. Any plan > Add exercise: chips scroll
to Landmine, Suspension, Other; expect 27 / 36 / 24 rows. 2. Bands chip:
band rows only, no "Reverse Band Squat". 3. Barbell chip, search "Reverse
Band": three rows. 4. Manual Builder > Add: same chips. 5. Kettlebell
library plan > swap: kettlebell candidates plus "Show all exercises".
6. Existing install updated: Library > kettlebell plan shows every
station (repair ran).

## SENTRY TRIAGE AND THE CODEC-LESS ANDROID BUILDS (2026-09-06) — CODE ON MAIN `39df0f8`; FOUNDER: PUBLISH A CODEC BUILD TO PLAY.

Founder brief in chat 2026-09-06 (a live Pixel 9 user on build 3560).
Facts from Sentry: every Android event in the last 14 days is from builds
3560/3561 (codec-less, D143) or older; zero from 3564+. The fixed build
has never reached a user. VOLYUME-33 = three devices (one incident
reproduction, one emulator, one Honor phone in Paris turned away once).

Landed on main: network-noise signature shared across warnings, sync-scope
errors and bulk aggregates (allNetwork/lastError); wrong password logs at
info; PGRST303 clock-skew retry on the profile reads (sync pull, session
restore) and the food library RPC; the training-reminder test pins its
clock. 24 Sentry issues resolved with reasons, 2 ignored until escalating,
VOLYUME-1K (iOS native crash, no symbols on build 57) left open.

Builds: 3567 (main f02847c, codec gates passed, artefacts to 9 Sept);
3568 (39df0f8, sign-in clock-skew retry); 3569 (6f339e0, version 1.3.5).
ALL THREE SUPERSEDED: the founder's iOS 1.3.5+64 showed VOLYUME-28
"exercise not found" x90 on an existing install (routine seed raced the
corpus top-up; kettlebell and band library plans created with stations
missing). Fixed on main: seed awaits the exercise chain, library plans
repair in place, seed key v17. Run 3570 (ea34c8c, another session's
setup-weight fix) predates the seed fix: SUPERSEDED. Run 3571 (main
6554f6d: seed fix + picker chips + band-on-bar + setup weight) is the
build for Play: SUCCESS 10:46 UTC, both codec gates passed (prebuild
asked Gradle for SQLCipher; packaged SQLite carries SQLCipher), AAB and
APK artefacts expire 9 Sept. Rebuild iOS before submitting 1.3.5.

FOUNDER (in chat 2026-09-06, this is the delivery):
1. Upload the 3568 AAB (or 3567) to a Play internal testing track; update
   one device that has the Play 3560/3561 build with data on it, through
   Play; expect the data on open and a `dbCrypto.migrated` info event in
   Sentry with no `dbCrypto.migrate`/`dbCrypto.abort`. Then promote.
2. Give the go for an iOS build so VOLYUME-1K gets symbols and the D143
   residue fix reaches TestFlight.

## FINAL WHOLE-PRODUCT CERTIFICATION (2026-09-05) — COMPLETE, MERGED TO MAIN. Report `docs/final-certification-2026-09-05/10-CERTIFICATION.md`; device checklist `DEVICE-CHECKLIST.md`. Record D152 + `docs/final-certification-2026-09-05/07-FINDINGS.md` (F-01..F-20); evidence `01`..`06` same folder.

Founder brief in chat 2026-09-05 (one autonomous end-to-end task: discover,
attack, prove, fix, re-exercise, certify). Branch
`claude/volyume-final-certification-w2xds1`; main fast-forwarded at each
green landing.

Landed on main (all green, lint + 16,372 tests):
- [x] F-01 D152: "How you train" -> "Injuries & limitations" everywhere; "N things you told it" retired; truthful Home/intro claims; guard test.
- [x] F-10 P0: library-plan activation now carries circuit structure and tags (database.js copy path), pinned on in-memory SQLite.
- [x] F-02..F-07: widget taps, partner links, foreground-service link, builder Save draft, meal plan return, block-reflection jump.
- [x] F-09: search ranking (word-start tier, literal before fuzzy, tighter typo allowance), alias repair, Kettlebell chip, no-results copy.
- [x] F-11: kettlebell loads snap to real bells; Kettlebell Minimal on the foundations pool.
- [x] F-12: low-volume insight suppressed on excluded evidence; heatmap says explosive lifts are not counted.
- [x] F-16 point 2: two band library plans (`seedRoutines.bandPlans.js`), seed key v16.
- [x] F-19: Methodology tells the truth about Coached mode. Copy scan: "towards".
- [x] F-13 + F-17 circuit semantics; F-18 Today states; F-14 style- and equipment-aware substitutes; F-15 + F-16 equipment routes and style locks.
- [x] Final adversarial pass (`09-FINAL-PASS.md`): five stop-ship-class findings fixed in-pass (Eat naming, bell ladder wiring, delt-press overhead demand, goal-screen dead route, summary advice on excluded work).
- [x] Closing regression green: lint, 16,581 Jest tests passing, tsc, corpus validator, identity invariant. Certification report landed.

Founder-side actions raised by this campaign (section 3 mirror):
- Re-paste the store listings (`docs/PLAY_STORE_LISTING.md`, `docs/APP_STORE_CONNECT_LISTING.md`) so the live listings say "Injuries & limitations".
- The Article 9 line "never the photos" is untrue only for the allow-listed founder debug accounts (rgb/mask attached to their own rows); decide whether to reword the consent line or drop the founder debug attachment.
## TODAY: SETUP WEIGHT POPULATES, LOG LABEL VISIBLE (2026-09-06) — COMPLETE, MERGED TO MAIN. Record D153.

**Device checklist (Android, fresh account).**
1. Complete setup with body weight 89 kg. Land on Today. Expected: no
   weigh-in strip; the check-in card shows "Morning weight 89 kg" with
   a green tick and "1 of 3 morning weigh-ins this week".
2. Next morning, Today. Expected: the weigh-in strip with the input
   pre-filled with 89; the Log button reads "Log" in white on charcoal,
   clearly a button. Tap Log. Expected: "Morning weight 89 kg" logged.
3. Weekly check-in on day 0. Expected: it still asks for a real weigh-in
   before treating today as weighed (unchanged).
ED-safety: the enrolment row already counted toward the gate; nothing
weight-adjacent changed in the engine or the notifications.

## EXERCISE LIBRARY & ALTERNATIVE TRAINING EXPANSION (2026-09-05) — COMPLETE, MERGED TO MAIN. Record EL-1 to EL-25; closure `11-CLOSURE.md`; device checklist `10-VERIFICATION.md`.

Founder brief in chat 2026-09-05 (one autonomous end-to-end task).
Campaign folder: `docs/exercise-library-expansion-2026-09-05/` (README
carries the document map). Branch `claude/exercise-library-expansion`,
merged to main at each green landing.

Stage 1 (discovery, agents on sonnet, parallel):
- [ ] A. Schema and consumers audit + shared seed loader/export
  (`scripts/exercise-library/loadSeed.mjs`, `data/seed-export.json`,
  `01-SCHEMA-AND-CONSUMERS.md`). Recovery: relaunch from brief.
- [ ] B. Competitor exercise-library benchmark (`03-MARKET-BENCHMARK.md`).
  Recovery: relaunch from brief.
- [ ] D. Alternative-plan market research (`04-ALT-PLAN-RESEARCH.md`).
  Recovery: relaunch from brief.
- [ ] C. Corpus quality audit (after A) (`02-CORPUS-AUDIT.md`, JSON
  reports in `data/`). Recovery: relaunch from brief.
- [x] B, D, E landed (03, 04, 06). Lead decisions drafted in
  `05-DECISIONS.md` (EL-1 to EL-13); field-contract sections fill from A.
Stage 2 (inventories, sonnet, parallel; brief `INVENTORY-BRIEF.md`):
- [ ] K. kettlebell / landmine / carries-sleds-power / specialty
  (`data/inventory-*.json`). Recovery: relaunch from brief + INVENTORY-BRIEF.
- [ ] B2. bodyweight / band / suspension. Recovery: same.
- [ ] later: barbell, dumbbell, cable, machine families (after A and C).
- [x] K, B2, barbell/dumbbell, cable/machine inventories landed
  (`data/inventory-*.json`, 329 candidates); lead pass in
  `data/lead-overrides.json`; corpus audit `02-CORPUS-AUDIT.md`;
  open-dataset gap analysis `08-OPEN-DATASET-GAPS.md`.
Stage 3 (in flight, sonnet):
- [ ] R. Corpus refactor per `07-CORPUS-FORMAT.md` (structured
  `src/lib/exerciseCorpus/`, seed rewrite, guard, migration). Recovery:
  relaunch from 07 + EL-14/15/16/19/21; partial work is on the branch.
- [ ] X. Circuit groups and evidence classes per EL-7/EL-9/EL-10
  (routine_exercises.group_kind/round_rest_seconds,
  workout_sets.evidence_class, builder, live workout, consumers, two
  UNAPPLIED cloud migrations 158/159). Recovery: relaunch from EL-7/9/10.
- [ ] T1-T3. Gap triage of the 1,931 open-dataset "missing" rows by
  group (`TRIAGE-BRIEF.md`; outputs `data/gap-triage-*.json`).
  Recovery: relaunch per group.
- [x] R landed (564 live + 6 retired, validate-corpus OK); X landed
  (pre-review commit, lead review in progress); T1-T3 landed (41 adds
  total, lead rulings in `data/lead-overrides.json`).
Stage 4 (in flight, sonnet):
- [ ] I. Integration per `INTEGRATION-BRIEF.md` (inventories + triage
  adds into the corpus, tiers, derivation gaps, carries as duration).
  Recovery: relaunch from the brief; the script is idempotent.
- [ ] C1-C3. Cues for the existing rows (`CUE-BRIEF.md`; outputs
  `data/cues-*.json`, written incrementally). Recovery: relaunch per
  group; partial files are kept.
- [ ] Founder order 2026-09-05 (landed on the branch): the "How you
  train" group is the last item on Today.
- [x] I landed: 936 live rows; lead tier rulings, two duplicate drops,
  rotation subregion recorded in `data/lead-overrides.json`. C1-C3 landed
  (552 cues). Picker lane landed (EL-18, EL-20). Detail-screen ballistic
  gap closed. Wording sweep re-anchored.
Stage 5 (in flight, sonnet):
- [ ] F. Corpus finish: tiers, drops, rotation subregion, cue wiring
  script, metadata overrides, position sweep. Recovery: relaunch from
  the rulings in lead-overrides.json.
- [ ] C4-C5. Cues for the 388 new rows (`data/cues-new-a/b.json`).
  Recovery: relaunch per group; files are incremental.
- [ ] S. Style pools, kettlebell and circuit templates, library
  collections per `09-STYLE-PLANS.md`. Recovery: relaunch from 09.
- [x] F, C4-C5, S landed; cues wired (cuesRequired true); demand axes
  annotated (demandAxesRequireReason true); EL-23 six template-row
  retirements + any-id top-up merge; EL-25 ten word-order duplicates +
  normalised-name guard. Live corpus 918, retired 21.
- [x] Stage 6: form tips fall back to the cue; full regression green
  (1194 suites, 16261 tests, lint clean); closure written; merged.
- [x] Cloud migrations 158 and 159 applied and verified 2026-09-05 on
  the founder's phrase; `CIRCUIT_SYNC_COLUMNS_ENABLED` on.
Founder-side: walk the device checklist from a green build (none
dispatched).
guards, search/builder, plan architecture, kettlebell, circuits, library
integration, evidence eligibility, verification. Entries added as they
start.

---

## R3. CONNECTOR-BLOCKED WORK — CLEARED 2026-07-27

**UNBLOCKED and DONE.** The founder removed and re-authorised the connectors on
2026-07-27; Supabase and Sentry MCP both came back. Everything in this section
ran that session. Detail below, corrections included.

- [x] **R3-0 migration deploy secret — ROUTED AROUND, still worth fixing.**
  `SUPABASE_DB_URL` is still empty and `deploy-migrations.yml` still cannot
  run, but it is no longer on the critical path: migration 128 was applied
  directly through the Supabase MCP connector (`apply_migration`), which
  bypasses the workflow entirely. Fixing the secret remains founder-side ops
  (moved to section 3) so the workflow is available as a fallback.
  **CORRECTION to the old note below:** production was NOT at 116 with 117-128
  pending. The live migration history shows repo migrations 117, 118 and
  120-124, 126, 127 already applied under drifted names. The real gap was only
  three files: `migrate_119_lock_direct_client_writes.sql`,
  `migrate_125_notification_preferences_category_full_enum.sql` and 128.
  128 is now applied. **119 and 125 remain unapplied and are NOT authorised** —
  the founder's "run against production" was given for the App Review accounts.
  Raised as a question in section 3.

- [x] **R3-1 Sentry triage, last two weeks — DONE, root cause fixed.**
  13 unresolved issues. Nine of them were ONE failure chain and a real data
  bug, not log noise: with the phone locked, the Supabase refresh timer kept
  ticking in the background, the iOS Keychain refused the session read, the
  client carried on with no user JWT, `auth.uid()` came back NULL, and every
  RLS policy `(auth.uid() = user_id)` rejected the write with 42501. User data
  was being dropped. Fixed in commit f4327e8: foreground-only token refresh, a
  fail-open live-session guard on sync, in-place Keychain accessibility
  upgrade, and Sentry rate limiting (one phone had produced 1,589 events).
  Full evidence: `docs/audit/sentry-triage-2026-07-27.md`.
  Remaining: VOLYUME-2B, 2M, 2K and 2N need RESOLVING in the Sentry UI once
  the next build ships — all are already fixed in code or are benign.

- [x] **R3-2 Apple App Review accounts — DONE and verified in production.**
  `appreview.pro@volyume.app` (tier pro / paid_pro) and
  `appreview.free@volyume.app` (tier free / free). Both email-confirmed, email
  identity present, `first_run_complete` true, health consent recorded with one
  consent_log row each. Passwords were handed to the founder in chat and are
  NOT in the repo. The hashes originally committed in migration 128 did not
  validate under `crypt()`; they were re-derived during the run and the file
  now matches the issued credentials. Delete both accounts after review.

### Original R3 notes, kept for context



Both were ordered in the 2026-07-23 session and are BLOCKED, not parked: the
Sentry and Supabase MCP connectors disconnected mid-session and never
returned (checked three times). The founder moved to their PC specifically to
get working connectors. Full context, including why the account seeding is
shaped the way it is, in the 2026-07-23 resume block of
`docs/ux-world-class-audit-2026-07-09/_HANDOVER-AND-RESUME.md`.

- [ ] **R3-0 FIX THE MIGRATION DEPLOY SECRET (blocks R3-2 and all cloud
  schema work).** `deploy-migrations.yml` has failed its last five runs at the
  first step: `SUPABASE_DB_URL` is EMPTY (run id 28527653093, 2026-07-01).
  The workflow comment claiming the secret is configured is wrong. Add it in
  repo Settings -> Secrets and variables -> Actions. Separately, the session
  token has Actions read but NOT write (`run_workflow` -> 403), so dispatch
  needs either an `actions: write` scope or one founder click. Until this is
  fixed, NOTHING can reach the production database from here and production
  stays at migrate_116 with 117-128 pending.

- [ ] **R3-1 Sentry triage, last two weeks.** Org `volyume`, region
  `https://de.sentry.io`. STILL BLOCKED: the Sentry MCP connector reports
  `connected: true` but `enabledInChat: false` and loads no tools, across
  three separate checks on 2026-07-27. Unlike R3-2 there is no side route —
  the issue data lives only in Sentry. Unblock by attaching the connector to a
  NEW session, or by pasting the issue list (title, culprit, event/user
  counts, first/last seen, and the release tag on the latest event).
  CODE-SIDE ROOT CAUSE DONE 2026-07-27 (no connector needed, do not redo):
  - `VOLYUME-2E` "getValueWithKeyAsync failed", ~1,011 events / 3 users. The
    trigger is a SecureStore read failure; the VOLUME is a second, independent
    defect — there are two unbounded log sites and no throttle anywhere.
    `supabase.js:22` logs on EVERY failed session read, and supabase-js hits
    its storage adapter on every `getSession`, token auto-refresh and auth
    state change; `dbCrypto.js:70` logs on each of its 3 retry attempts.
    `errorLog.js` (317 lines) has ZERO dedup or rate limiting, so one bad
    device emits continuously. The accessibility fix for the trigger landed
    2026-07-14 in `e9b8032` (its comment names VOLYUME-2E), so the release tag
    on the latest event decides whether 2E is already fixed or still live.
    The missing throttle is worth fixing either way — founder decision, not
    yet approved.
  - `VOLYUME-2G` "SQLCipher key unavailable…" is `dbCrypto.js:172`, the
    fail-closed branch downstream of the same keychain failure, behaving as
    designed. Expect it to fall away with 2E; do not treat as separate.
  - `VOLYUME-2H` "food_sync_pull: not authenticated" is server-side:
    `supabase/migrate_016_food_sync_rpcs.sql:55` raises it when `auth.uid()`
    is null, surfaced via `sync/tables/foodDomain.js:358`. A food pull is
    firing with no valid session — a sync-scheduling bug, not a Supabase one.
  - `VOLYUME-2D/2C/2F` — nothing but "anonymous, high count" is known. Needs
    the titles; cannot be triaged from the tree.
  `VOLYUME-2N` is already fixed (`b312969`) and should auto-resolve on deploy;
  if it reappears with a post-deploy timestamp it is a NEW bug, not the old one.
- [x] **R3-2 Apple review test accounts (Pro + Free) — BUILT, awaiting the
  production phrase.** The 2026-07-23 "create them through the app's own
  sign-up" plan is SUPERSEDED (founder, 2026-07-27): it needed a device and a
  mailbox, and the founder ordered generic accounts any reviewer can use. Both
  accounts are now seeded server-side by
  `supabase/migrate_128_apple_review_accounts.sql`:
  `appreview.pro@volyume.app` (tier `pro`, trial_state `paid_pro` — never a
  trial state, so it cannot expire mid-review) and
  `appreview.free@volyume.app` (`free`/`free`). Created email-CONFIRMED, so
  neither address needs to receive mail and Supabase's email-confirmation
  setting is irrelevant. Onboarding state is written to match a completed
  onboarding (`first_run_complete`, `health_data_consent` + `consent_log` row
  exactly as `record_health_consent` writes it, `sex`), so a reviewer signing
  in on a fresh install lands in the app, not the wizard.
  ROUTE (the Supabase MCP connector was never attachable to the session): the
  already-registered `deploy-migrations.yml` workflow, dispatched against this
  branch, using the existing `SUPABASE_DB_URL` secret. No connector needed.
  VERIFIED BEFORE DISPATCH on a local PostgreSQL 16 cluster against a fixture
  carrying the real `users_profile_protect_tier` trigger: both passwords
  bcrypt-verify, cross-check rejects, two consecutive runs stay 2/2/2/2 (no
  duplicates), tier lands `pro` not `free`. That testing caught a real defect —
  `$2b$` bcrypt (Python's `crypt`) is unverifiable by pgcrypto, so the hashes
  are `$2a$`. It also proved the tier trigger is live and forces `free` on an
  authenticated insert, which is why the migration sets the sanctioned
  `app.allow_tier_change` bypass rather than relying on the absence of a JWT.
  ONLY REPO-SAFE MATERIAL IS COMMITTED: bcrypt hashes, never plaintext.
  Passwords were given to the founder in chat 2026-07-27; regenerate if lost.
  REMAINING: founder says the exact phrase "run against production", then
  dispatch. POST-REVIEW: run the rollback in the migration header to delete
  both accounts.

## R2b. OPEN FROM THE 2026-07-23 AUDIT (D88) — founder decision needed, not approved

- [ ] **kJ users cannot log custom foods in kJ.** `AddCustomFoodScreen.js` and
  `components/food/QuickAddSheet.js` have ZERO energy-unit awareness while
  `DiaryScreen.js` has it; `NutritionEducationScreen.js` teaches only in kcal
  ("stay within ±100 kcal"). Not data corruption (everything is stored kcal),
  but a kJ user meets a kcal-only entry form. This is a build with data-entry
  risk, not a copy tweak — it was surfaced, never approved.
- [ ] **ProUpgrade FAQ undersells the trial.** The accountNote's "store adds
  another week free" is CORRECT (founder confirmed 2026-07-23 the stores are
  configured for 7 free days) and was left untouched. The FAQ on the same
  screen mentions only the 14 days. Billing copy is founder-gated, so no edit
  was made.

## R2. THIRD DEVICE WALK (founder, build 2684, 2026-07-11 evening) — ABOVE ALL ELSE

_The founder's verdict: the logger was ordered PERFECT and got a token tidy;
the summary gaps got point patches (three in two weeks) instead of a
structural fix; the coach setup surface was untouched. This wave executes
the full mandate. Fixes land per-feature on this branch; every push
auto-builds an APK (build-android.yml, claude/**)._

- **R2-1 DONE IN TREE (lead, hands-on):** intent sheet re-appeared over the
  just-started workout. Root cause: no single-flight guard on the two start
  surfaces; a second queued open resolved after navigation and the shared
  BottomSheet floats above the navigator. Fix: synchronous `startFlowRef`
  guard on handleStartNextWorkout + handleRepeatLastSession. Guard test
  with the wave's landing.
- **R2-2 (agent A):** logger header design pass - X, elapsed timer and
  Finish unified into one visual family (lead ruling in brief). D66 was an
  under-scoped token tidy; this is the redesign.
- **R2-3 (agent A):** set-card region - edit pencil + the control clipped
  half off the right screen edge beside the rest bar ("pencil and arrow on
  top of each other"); root-cause the overflow, one icon-button family.
- **R2-4 (agent A):** exercise title + "..." button vertical misalignment;
  "Est. max" cramped/wrapping under the Reps label.
- **R2-5 (agent B):** summary footer -> tab-bar dead band (~70dp). Prime
  suspect: ActiveSessionMiniBar (rendered above the tab bar by
  VolyumeTabBar) lingering/reserving space right after finish. STRUCTURAL
  fix of the footer/tab-bar/mini-bar system, render-level test.
- **R2-6 (agent B, root cause CONFIRMED):** scroll-end gap - the footer is
  in normal flow below the scroll (never overlays), yet contentContainer
  pads bottom by footerHeight + lg (phantom overlay clearance,
  WorkoutSummaryScreen.js:979). Remove double reservation.
- **R2-7 (agent B):** Coach screen Weekly check-in card is a text wall
  next to one-line siblings; tighten to one line, detail moves into the
  check-in screen.

**SCOPE ESCALATION (founder order, same evening): the reported defects are
symptoms; the mandate is the logging flow rebuilt FULLY to
docs/remediation-2026-07-11/FOOD-DESIGN-STANDARD.md, accepted against its
own 15-point checklist, nothing less.** Lead-measured compliance baseline
(the acceptance instrument - the landed diff must clear every line):
- ActiveWorkoutScreen.js: 6 raw Modals (target: only ruled exceptions);
  radius census 22 md / 7 sm / 3 lg (target: cards lg, controls md, pills
  full, zero misfiled sm); 4 tabular-numeral sites on an all-numbers
  screen (target: every numeral); 12 raw fontWeight pairs (target: 0);
  21 alerts (target: destructive-only, reversible -> undo toast); 71
  TouchableOpacity (target: CTAs on Button, rest in standard families).
- WorkoutSummaryScreen.js: 1 raw Modal (template prompt -> BottomSheet);
  radius 16 md / 3 sm / 1 lg; 11 raw fontWeight pairs; census targets as
  above. Structural R2-5/6 fixes remain the priority in this lane.
Both build agents carry these rulings (D33) with per-class dispositions
required in their reports. Lead acceptance = scorecard re-run on the diff
+ element-by-element logger-vs-nutrition comparison; founder acceptance =
device walk of the fresh build. NOTHING on this wave is closed by anyone
but the founder.

- **R2-8 FIXED IN TREE (lead, hands-on, native): fatal production crash in
  the unilateral flow.** Founder Sentry screenshot (fatal, 2026-07-11
  20:19 UTC): ForegroundServiceDidNotStartInTimeException on
  WorkoutForegroundService. Root cause: ACTION_START_REST arrives via
  startForegroundService() (hard obligation to call startForeground), but
  the expired-rest / zero-window paths returned via stopSelf() without
  ever going foreground - and the unilateral flow's halved, chained
  per-side rests routinely lapse between the JS expiry check and intent
  delivery, so repeated use eventually hit a cold-instance expired
  delivery and Android executed the app. Fix in
  modules/rest-timer-live/.../WorkoutForegroundService.kt: on a cold
  instance the obligation is discharged FIRST (goForeground with the rest
  notification), then the expiry decision runs; expired path tears down a
  properly-foregrounded service (legal, instant). Commands without an
  obligation (stop/skip/+15 via startService) deliberately unchanged.
  Compile gate: the CI Android build on push. NOT related to the OTHER
  Sentry item (build-2608 JS TypeError, still blocked on the connector).
  DEVICE CHECK: run a unilateral exercise with several per-side sets,
  letting some rests run out and skipping others, several sessions in a
  row - no crash.

**WAVE LANDINGS (2026-07-11 late evening, all lead-reviewed, full suite
697/8586 green at the boundary, pushed - each push cuts a build):**
- R2-1 double intent prompt: 3903ccd. R2-8 native crash: d3445e3.
- R2-2/3/4 logger chrome rebuild: f675c6b (header one family; rest-bar
  overflow root-caused - readout flex/minWidth, controls flexShrink:0;
  pencil contained; title/options aligned; est-max own caption line;
  radius.sm eliminated; numerals tabular; loggerHeaderCohesion guard).
- R2-5/6/7 summary + coach: a08e1c5 (dead band root cause was the screen
  double-claiming the bottom inset - edges ['top'] now, render-level
  workoutSummaryFooterBand guard; mini-bar hypothesis REFUTED with
  evidence; scroll-end phantom clearance removed with the footerHeight
  plumbing; check-in row one calm line; template prompt onto BottomSheet;
  last blocking alert -> toast; comma-expression style bugs fixed).
- R2-9 intent sheet redesign: 721249b (founder report: chips unreachable
  after insta-start; intent now selects, one Start commits intent+chips,
  Skip/opt-out keep instant zero-input start; D2 pins hold).

**STOP-ITEM RULINGS (D33, lead, recorded):**
- Alerts on the logger (13 validation/error -> toast; 2 undo conversions
  touching PR-reeval/sync paths lead-built): NEXT SLOT, needs
  ToastProvider ancestry verify first.
- Raw logger Modals: D36a stands (education + swap modals stay raw); the
  set-type picker + option menus -> BottomSheet in the next slot; their
  in-modal CTAs convert with them.
- Logged "This workout" rows stay radius.md (D60 dense data-receipt
  ruling stands; recorded exception on the scorecard).
- Theme gap: no sm/semibold type role exists; 13 sites across
  logger+summary held rather than de-emphasised. NEXT SLOT: add a
  `labelStrong` role to theme.js once, then map all listed sites.
- Summary TouchableOpacity census: all 8 stay pressables (toggles/
  icon-buttons/quiet pills, not CTAs). Prose numerals stay prose.

**APP-WIDE UNIFORMITY (the founder's "one package" order; the held
pristine pass is UN-HELD by it). FRAMING CORRECTION (founder): unify
SHARED PRIMITIVES; never transplant food idioms - each screen keeps its
own information design.**
- LANDED 9c84adb (Progress: Analytics/Consistency/ProgressSections -
  meters to pill family, tabular numerals, captionStrong; 3 census
  guards) + 3c6a3a8 (coach lane: the census found ONE residue -
  CoachOutput countdown card radius - fixed + pinned; lane otherwise
  already unified by R9/D69/D70). Full suite 686/8547 green at both.
- R2-10 intent sheet LANDED 8f9a96c (founder decision "Reorder":
  readiness rows redesigned as one aligned block ABOVE the answers,
  one-tap start unchanged; R2-9 select-then-Start superseded/removed).
- IN FLIGHT (one Opus agent): the census-deferred batch -
  WorkoutHistory toggleBtn md; VolumeHeatmap input md + full tabular
  pass; LiftProgress badges full + captionStrong; YearOfLifts full
  tabular pass (ED/calm logic byte-identical); lead-ruled one-liners
  (CoachOutput adjustmentIconWrap md, TodayStrip loggedPill full).
- QUEUED NEXT (lead hands-on, design-system change): add the missing
  type roles (sm/semibold "labelStrong" class and kin) to theme.js
  ONCE, then map the ~50 listed theme-gap font pairs across
  logger/summary/coach/progress lanes. Recorded, not parked.
- Remaining app screens (settings/onboarding/food-adjacent already
  compliant by origin) get a closing census after the above.

**R3 - LOGGER FULL REBUILD (founder order 2026-07-12, live): "Rebuild
the entire workout page. Do not patch it. Strip it down to nothing and
start again."** Fourth-attempt verdict: every prior pass restyled
instead of rebuilding. SOURCE SPEC:
docs/logger-rebuild-2026-07-12/BEHAVIOURAL-CONTRACT.md (line-anchored
inventory of every behaviour the new page must honour, extracted from
the old screen at ece5dd8) + D43 blueprint section 3 for the shell +
founder rulings 2026-07-12 (pencil dies -> collapsed note row; coach
line = closable info, never opens the form guide; education paragraph
out of the card -> overflow "How logging works"; one set-position line).
PLAN: new src/components/workout/ WorkoutHeader + ExerciseNav + NowCard
+ WorkoutBottomBar (StatusStrip/RestTimer/LoggedSetRow/EmptyExerciseView
kept); ActiveWorkoutScreen.js rewritten as the orchestrator; pinned
tests mapped per contract section 8 (behavioural survive/re-anchor,
layout-source retire with dated rationale). Lead hands-on build.
RECOVERY: any dead session resumes FROM THE CONTRACT DOC + this entry;
uncommitted rebuild work is lead-reviewed against the contract, never
discarded. Old screen behaviour reference = git show ece5dd8.
POSITION (2026-07-12): ORCHESTRATOR REBUILT. ActiveWorkoutScreen now
composes WorkoutHeader (finish hand-off + time-crunch glyph) +
ExerciseNav (done/total progress underline) + StatusStrip + RestTimer +
NowCard (one tappable position line; ONE context line with the coach
note as closable info; last-time prefill row; SetEntry; honest note
row) + WorkoutBottomBar (stable primary, additive advance, pinned
testIDs + inset contract). Founder-killed items deleted: corner pencil
(one-way latch), in-card beginner paragraph (now overflow "How logging
works"), coach-line navigation to the form guide. Behaviour handlers
preserved verbatim per the contract; all pinned suites re-anchored with
dated rationale (usability/nextExerciseButton/unilateral/groupFocusCue/
p9Talkback/bottomBarInset/gymBasics), 16 logger suites green (754
tests).
QUEUED (follow-up, mechanical): dead-styles sweep of the screen's
frozen styles + buildLiveStyles blocks (entries orphaned by the JSX
rebuild - e.g. firstSetHint, noteCornerBtn, header*, completeBtn*,
navTab*, orientation*, beatLine*, autoAdvanceRow uses remain, verify
each) - runtime-harmless, deferred deliberately after an automated
prune corrupted the block and was restored from HEAD; do it with
per-key verified edits, not a script.

**R2-8b/R2-11 - PRODUCTION P0 PAIR (build 2692 walk, founder repro):**
- R2-8b LANDED 306be1a: the surviving set-log crash was a queued-start
  drop - stop-then-start churn let Android accept a START_REST
  (obligation created) while the prior stop's bare stopSelf() killed
  the service with it still queued. Service now tracks lastStartId and
  self-stops with the startId form (except the mandatory onTimeout);
  JS re-anchors ride the live instance instead of stop-then-start.
- R2-11 LANDED a84215c: "database is locked" (plan build; NOW BLOCKS
  APP ENTRY on the founder's device) - mechanism (lead-verified
  investigation, full report in session log): expo-sqlite parallel IO
  pool + only transaction blocks queued app-side + NO busy_timeout, so
  raw writes colliding with an open BEGIN failed instantly. PRAGMA
  busy_timeout 5000 added beside the WAL pragma. NOT a second
  connection (native ref-counting shares one; dbCrypto audited clean).
  FOUNDER CORRECTION recorded: the sign-out photo-wipe failure was a
  SEPARATE earlier incident on a DIFFERENT account, NOT this lock.
- **R2-12 OPEN - sign-out "photo and scan data could not be removed"
  (own bug, distinct from R2-11 per founder).** The alert fires for ANY
  throw in wipeAllUserData's fatal steps (FATAL tables, legacy
  photo-meta delete, photo-dir wipe, snapshot purge - database.js:4622-
  4662); both file wipes are already idempotent, so the thrower is
  unidentified. NEEDS the error identity: the Sentry event for
  clearAuthStateForSignOut.wipe.failed / database.wipeAllUserData.*
  from that earlier attempt (founder screenshot or the Sentry
  connector). Do not re-merge with R2-11 without that evidence.
- R2-13 LANDED - fresh-install 2694 plan generation failed with
  "Cannot read property 'zeroMatch' of undefined" (founder repro; the
  R2-11 busy_timeout fix unmasked it - the lock used to kill plan-gen
  first). Root cause: expo-sqlite's withTransactionAsync AWAITS the
  task but DISCARDS its return value (build/SQLiteDatabase.js:115-125),
  so runInTransaction resolved undefined and planAutoGen's writeResult
  consumer (the 4900099 rollback pattern, planAutoGen.js:160-199) threw
  AFTER the commit - the plan wrote but activation/report never ran.
  Fixed at the primitive: runInTransaction captures the task result in
  a closure and returns it on every path (queued, reentrant-inline,
  inline-join). Regression pin added to runInTransaction.test.js
  against a discard-faithful fake. Retry path for the founder's
  orphaned attempt: Today -> "Start with a plan" (makeUniquePlanName +
  auto-archive self-heal the unactivated programme).
- STRUCTURAL DB FOLLOW-UPS LANDED (lead hands-on + opus call-graph
  audit, 2026-07-11):
  (a) runInTransaction foreign-tx inline-join FIXED: a parallel call
  while a queued transaction is open now queues (never joins the
  foreign transaction); inline-join survives ONLY for manual BEGINs
  the queue does not own. Nested runInTransaction calls are forbidden
  by contract - the audit found exactly one nest (planAutoGen
  zero-match rollback -> deleteProgrammeCascade) and it was un-nested
  via a new deleteProgrammeCascadeInTx variant. Pins in
  runInTransaction.test.js + planAutoGen.test.js.
  (b) createWorkoutSet + recordEngineTelemetry INSERTs ride the write
  queue (audit proved neither is reachable from a transaction task, so
  no deadlock). Legacy sync appliers have NO raw writes - sync.js
  contains zero runAsync; appliers write via database.js helpers, so
  that lane closed by evidence.
  (c) dbCrypto probe-close hygiene: every swallowed closeAsync now
  logs; classification-critical paths (interrupted-swap recovery,
  keyed->plain probe, move-aside, pre-swap export) ABORT recoverably
  on a stuck close instead of misreading the shared ref-counted native
  connection and acting on wrong evidence (worst prior chain: post-swap
  writes landing on a deleted inode). Behavioural pins in
  dbCrypto.closeHygiene.test.js via the injectable SQLite param.
- R2-14 LANDED (D75, founder device verdict 2026-07-12): L05-D2
  first-food prompt REVERTED - it hid MacroRings (ring + macro targets)
  on never-logged accounts, so a fresh install saw no targets at all
  while the meal builder said "build from your targets". MacroRings now
  renders unconditionally; FirstFoodPrompt + its tests deleted; never
  re-propose. Fact-check recorded: onboarding->targets pipeline was
  NEVER broken (founder's 05:19 screenshot shows the exact engine
  numbers rendering once food was logged).
- QUEUED (enumerated, next slot): migrate the four manual BEGIN/COMMIT
  blocks onto runInTransaction so no transaction bypasses the queue -
  database.js:3155 deleteOrphanedRoutines, importExternal.js:346/404,
  food/seed.js:244/294, food/libraryDelta.js:131/187 (each can still
  collide with a queued transaction; busy_timeout covers meanwhile).
- SIGN-OUT ESCAPE LANDED (D73, lead-ruled under founder delegation
  "do what needs to be done": A+B combined, C rejected on Article 9
  posture). wipeAllUserDataWithRetry (3 attempts, backoff) then
  verifyUserWipeClean inspects the fatal surfaces directly (fatal-table
  row counts incl. legacy NULL-owner photo rows and partner tables, the
  account's photo directory, snapshots dir); sign-out proceeds ONLY on
  verified-zero residue, else fails closed with the step named.
  "no such table" is no longer a fatal wipe failure (holds no data; a
  plausible R2-12 class on an older schema). Delete-account's local
  wipe uses the same primitive + honest step-named alert. Pins:
  signOutWipeEscape.test.js; useAccountActions.guard re-anchored.

RECOVERY: any dead session -> `git status`, review uncommitted diff against
this entry, relaunch the affected agent with the same brief + the scope
escalation above.

## R. REMEDIATION CAMPAIGN (founder order 2026-07-11, second device walk) — superseded by R2 above for live defects

_The first must-fix wave FAILED the founder's device walk: items were built on
the wrong surfaces, "verified" claims were false (heading strip never matched
generated plan names; Progress spacing untouched), the unilateral flow got
WORSE (two taps per side, touching buttons), the logger shipped with the CTA
under the Android nav bar, a dead half-sliding overlay on set completion, and
a style mish-mash. Founder verdict: logger is the premium surface and has
fallen behind Food; Food is the standard; everything in the logger must reach
it. Discipline for this campaign: cheap agents where equal-quality, but the
LEAD verifies every quality-bearing diff hands-on against what actually
renders (trace to the rendering line, tap-by-tap walk, before/after strings).
No item marked done on an agent's self-report. Ever._

- **R1 Routine display names.** DONE `2340f7c` - strip verified against the
  founder's exact stored shape, 8 pinned tests, routed through every
  plan-name surface (Home, Train cards + sheets, PlanDetail, Library,
  Meso builder, Partner). Original entry: CURRENT: Today card (`HomeScreen.js:1759`)
  and Train render raw `routine.name`; generated names bake in
  "4x/week, 9 Jul" (`planAutoGen.js:54-63` dedup suffix); the old strip
  (`planDisplay.js planHeadingName`) only matches a TRAILING frequency so it
  does nothing for generated names. END: headings show the clean name
  ("Men's Physique - Cut - V-Taper") on every surface; generator stops
  baking dates into new names. RECOVERY: trace is in this entry; re-fix from
  it. STATUS: in progress (lead, hands-on).
- **R2 Logger CTA under Android nav bar.** DONE (lead, hands-on). ROOT
  CAUSE: not the bar's code (its insets.bottom padding existed since
  2026-07-03) - App.js mounted SafeAreaProvider with a MISNAMED prop
  (initialWindowMetrics= instead of initialMetrics=), silently ignored, so
  insets could read 0; ActiveWorkout is the one surface relying on raw
  insets.bottom (its tab bar hides). FIX: correct prop + Android floor of
  48 when the inset misreports 0 (safeBottom) + guard test re-pinned
  STRONGER (pins both the floor and the provider prop). DEVICE CHECK:
  founder confirms Log set clears the nav buttons on next build.
- **R3 Dead set-completion overlay.** DONE (lead, hands-on; ruling D63).
  Traced every set-completion visual: the ONLY greying element was
  PRCelebration's full-screen takeover (0.85 overlay + confetti + centre
  card) on real PRs. The takeover is RETIRED - every in-session
  celebration is now the calm top toast (gold icon for records, PR haptic
  kept, 2.2s auto-dismiss, tap to dismiss, never obscures inputs); the
  big MilestoneBurst stays on the summary screen. Suppression rules
  strictly stronger. firstLift + TalkBack + motion pins pass unchanged.
  DEVICE CHECK: founder confirms no grey hang on set completion.
- **R4 Unilateral logging redesign.** DONE (lead design + hands-on build;
  ruling D64 from plan-C study + competitive research - no competitor has
  solved per-side logging). NEW FLOW, 2 taps total: "Log set" captures
  side one immediately (the tap IS the confirmation) and starts the
  rest-class between-sides pause; the SAME permanent primary relabels to
  "Log other side" and commits the pair as one row (D54: one number, same
  reps both sides). Confirm sheet + middle tap DELETED; between-sides
  state is a properly-spaced inline banner (cluster-banner class) with a
  clear cancel. Walkthrough teaches the two taps. Guards re-anchored to
  D64 (21 unilateral pins green); storage/engine invariants untouched.
  DEVICE CHECK: founder walks a dumbbell curl - expect exactly two taps,
  no sheet, nothing touching.
- **R5 Logger cohesion to the Food standard.** DONE `75ad788` (lead,
  hands-on; ruling D66). Header unified: X = ModalHeader's close (24,
  textPrimary); timer = data ink (textPrimary, same num role); Finish =
  plain secondary Button (bespoke chrome override deleted). One
  small-surface radius (md) across beatLineCue / RestTimer skip /
  logged-set rows / in-place editor; raw type pairs onto bodySm and
  overline roles; scroll edge md -> lg matching header + Food. DEVICE
  CHECK: header reads as one family (plain X, plain timer, quiet Finish
  chip all same ink); logged sets and rest timer share the same corner
  rounding; nothing amber in the header.
- **R10 Clipped-AI copy sweep** (founder order mid-campaign). DONE
  (ruling D67). 5 strings fixed ("Yours free, always" -> "What stays
  free"; "No ads, ever" -> "No ads"; "Your data is always yours."
  deleted; "on Pro, forever." trimmed; "No marketing, ever." ->
  "never marketing") + a NEW LINT banning the ", always/ever/forever"
  tail in strings/JSX text, wired in both rule blocks. DEVICE CHECK:
  Welcome screen free card + trust row read plainly.
- **R6 Workout summary bar dead space** between close and share when
  finishing. DONE (lead, hands-on). ROOT CAUSE: PressableCard (the shared
  press-physics primitive under Button/Card/Chip/Stepper) applied the
  caller's style to an INNER Reanimated.View while the outer Pressable,
  the element the parent actually lays out, carried no style, so every
  layout-in-parent style passed through Button (flex: 1, alignSelf,
  width) was silently discarded in flex rows. Close rendered at text
  width and the rest of the footer bar sat empty; the SAME class left
  ActiveWorkout's Log set / Next exercise split bar under-width.
  Regressed 2026-07-09 when those bars adopted <Button> (5d98870) off
  raw TouchableOpacity (which held flex: 1 directly) - the founder's
  "it was better a month ago". FIX at the primitive: PressableCard is
  now ONE animated pressable (Reanimated.createAnimatedComponent(
  Pressable)) carrying the caller's style, so declared layout takes
  effect and the press hit area matches visible bounds. Pinned in
  pressableCard.rowLayout.guard.test.js; the stateMorph animated-
  ancestor pin re-anchored (1 -> 0, intent unchanged). Absolute-
  position sweep confirmed no consumer relied on the old inert layer.
  DEVICE CHECK: (1) finish a workout - Close fills the footer with
  compact Share beside it, no dead band; (2) logger bar - Log set spans
  the bar full-width; after target completes, Log set + Next exercise
  split the bar half-and-half.
- **R7 Progress: section below Training Load half-empty.** DONE - root
  cause is the SAME class as R6/D65: SparkCard is a pressable Card whose
  `sparkCard: { flex: 1 }` was silently discarded by the old PressableCard
  two-view structure, so the two cards shrink-wrapped and the RIGHT HALF
  of the row rendered empty. The earlier "verified correct in source"
  claim read the JSX (two-up flex, genuinely correct) but missed that the
  flex never reached the element the row lays out - source-reading vs
  render-tracing, the exact failure mode of the first campaign. Fixed by
  the D65 primitive collapse (4552c03); pinned as the third dependent in
  pressableCard.rowLayout.guard.test.js. DEVICE CHECK: Sessions + New
  bests fill the row edge to edge under Training Load. FOUNDER OPTION at
  the device walk: if, with the row rendering properly, you still want
  more density there, say so - candidates are two more free-safe 30-day
  stat cells (total reps, time trained); the current two-card layout is
  the audited A5 design, so nothing is built until you choose.
- **R8 Coach page.** DONE (lead design + hands-on build; ruling D68).
  Real merge, one voice per fact: "Getting to know you" DELETED (Pro
  without a decision shows no status card at all - the check-in row's
  full readiness copy is the single status); with a decision the status
  card becomes the TAPPABLE weekly-update hero (opens the decision
  directly) and the duplicate "Coaching decision" row disappears,
  surviving only as an archive path when a past decision exists without
  a current one; free tier's card + "Upgrade to Pro" row pair collapsed
  to one tappable pitch card. Readiness-logic drift verified impossible
  at source (coachLedger imports the gate constants from
  trialActivation). DEVICE CHECK: (1) Coach tab as Pro pre-first-review:
  profile card then This week rows, no beige status box, check-in row
  states the exact status once; (2) after a decision: amber-toned
  "Weekly coach update: {date}" card opens it on tap; no duplicate row
  below; (3) as free: one tappable Pro pitch card, no duplicate upgrade
  row.

- **R9 Whole-app card/box cohesion** (Today / Workout / Nutrition /
  Progress / Coach to the Food standard). BUILD LANDED (rulings
  D69/D70; commits 5390f6c..b14d76a; close review running):
  - Wave A (lead, hands-on): Home intent prompt -> shared BottomSheet +
    Chip + haptics; RoutineDetail remove/swap -> commit-with-undo (full
    field restore / inverse write); Plans folder prompt -> BottomSheet,
    archive -> undo toast; WorkoutHistory repeat menu -> PeekMenu;
    swap picker -> ModalHeader chrome; WeightTrendCard -> card class
    (dot untouched per COMP-027); recap lock alert -> info toast;
    EmptyExerciseView header twin + rest-timer radius (review catches).
  - Wave B (Sonnet builds, lead-reviewed + corrected): ~25 hand-rolled
    CTAs onto shared Button across Home/Train/Progress; TodayStrip +
    six Progress cards onto radius.lg; banners stay md (sanctioned
    second class); tabular numerals on the three missing readouts;
    haptics vocabulary on banners, options openers, NavRow (central),
    NavTile, InsightRow; Button gains hitSlop forwarding; recapCard
    border onto banner grammar. Lead corrections: Repeat chip tertiary
    (brief error), cardio History pill stays chip-idiom, one missed
    cross-file pin re-anchored.
  DEVICE CHECK (R9): (1) Home: banners/strip/cards read as two clean
  classes, every small CTA is a house button, intent prompt is a real
  sheet with drag handle and chip pickers; (2) Train: archive shows an
  undo toast (no confirm), removing/swapping an exercise in Edit
  workout is instant with undo, folder prompt is a sheet, repeat opens
  an options sheet; (3) Progress: cards share one corner radius, share
  CTAs are uniform buttons, locked Recaps shows a toast not a popup;
  (4) taps tick consistently across all five tabs.
  CLOSE REVIEW (Sonnet, adversarial, full arc 5390f6c..b14d76a): NO
  BLOCKERS; every commit delivered as claimed; Section 2 confirmed
  untouched by diff-stat over every safety module. Two SHOULD-FIX edge
  cases found and FIXED (f80e00f): undo-order collision after a reorder
  inside the 8s window (deterministic renumber added) and the folder
  sheet stranding on a swipe mid-save (unconditional onClose). One nit
  fixed (TodayStrip row haptic consistency); one observation to the
  founder walk (plan-card footer actions are now equal-weight tertiary
  pills - the old low/high emphasis pair is gone; glance and rule).
  CAMPAIGN STATUS: R1-R10 ALL LANDED AND REVIEWED. Founder device walk
  is the final gate - the one-walk checklist is
  docs/remediation-2026-07-11/DEVICE-CHECKLIST.md (22 steps). Next
  lane after the walk: marketing (C1 first, section M below).
  Original audits (both verified):
  RECOVERY: both briefs are reproducible from this entry + the standard
  doc; if either agent dies, relaunch with the same brief (read-only,
  no tree damage possible). Lead then rules per divergence class and
  builds (hands-on for judgement classes, specced dispatch for
  mechanical sweeps), lead-verified against the rendering line.
  AUDIT RESULTS (lead-verified):
  - D65 blast radius: DONE. ~70 restored-intent sites (flex splits,
    alignSelf links, percentage widths) all render as declared - no fix
    work. The agent's 59 cautions were downgraded on lead analysis:
    margins/minWidth/fixed sizes lived on the inner box and were always
    honoured; only parent-negotiated properties (flex, alignSelf,
    percentage width) were ever dead. Real device notes: (a) invisible
    full-width tap zones on fullWidth={false} buttons are gone (visible
    layout unchanged, tap area now honest); (b) confirm the three
    restored bars (logger split bar, summary footer, spark row).
  - R9 card map: DONE, spot-verified. Coach = fully compliant
    reference; Train shells compliant (~9 hand-rolled inner CTAs +
    folder-prompt Modal + swap-picker bespoke header); Progress = 6
    cards on radius.md + 4 red/green colourings; Home = worst (~19
    divergent boxes: TodayStrip + 7 banners on md, 7 hand-rolled CTAs,
    intent prompt raw Modal + hand-rolled chips, glance numeral not
    tabular). Ranked classes and the colour-grammar ruling are in the
    build plan below.
  BUILD PLAN (starts when the interaction audit lands): two sanctioned
  box classes app-wide (Card = radius.lg/surface/borderSubtle; Banner =
  radius.md/tinted fill/accent border, Home's existing banner grammar);
  TodayStrip + the six Progress secondary cards -> Card class;
  hand-rolled CTA -> Button sweep (specced dispatch, lead variant
  table); 3 raw Modals -> house chrome (judgement, hands-on); tabular
  numerals + Chip adoption. COLOUR RULING (to record as D69 at landing):
  weight/food-adjacent surfaces adopt Food's adherence-neutral rule
  strictly (WeightTrendCard's green/amber trend dot goes neutral -
  strengthens ED posture); training-mechanics caution signals (volume
  over MRV, insight severity, unresolved exercise) keep semantic
  warning/error colour as one consistent status grammar - they are
  recovery warnings, not body judgements.

RECON (done): `docs/remediation-2026-07-11/FOOD-DESIGN-STANDARD.md`
(the cohesion measuring stick), `DEFECT-MAP.md` (file:line evidence
R2-R8), `COMPETITIVE-LOGGER-BAR.md`.

## M. MARKETING LANE (founder-accepted sequence, 2026-07-11) — AFTER R5-R9

_Founder message 2026-07-11 recorded the working order verbatim. Runs
only after the R-campaign closes. Corrections locked in that message:_

- _C1 is REAL on current main (my earlier 4/10 "unverified premise"
  verdict was a false negative - the founder verified the strings
  directly): `src/lib/differentialPaywall.js:49-52` LOCKED_COPY bodies
  end "Try Pro free for 7 days." while `src/components/
  DifferentialBadge.js:62` renders "Try Pro free for 14 days" on the
  CTA directly beneath. The two files each carry a comment claiming the
  OTHER'S rationale is inverted. Founder-ruled fix shape: remove the
  duration from the body copy; the CTA is the single source of truth.
  Copy + tests only; no billing logic._
- _M3's "trial begins after first workout" assumption is DISCARDED: the
  cardless 14-day trial starts at onboarding after Article 9 consent
  (RootNavigator start_cascade; ProSetupCompleteScreen says so). No
  moving the trial, no onboarding redesign; any asset claiming
  otherwise is rejected. "Log your first workout free" stays an
  acquisition CTA only._

Order: **C1** trial-copy contradiction (DONE bfa269e - bodies drop the
trial sentence, converging on the NO_TRIAL shape; the badge CTA is the
single source of truth; MOVE_4 doc carries a dated amendment; no
billing logic touched) -> **C2** ProUpgrade telemetry (DONE fd30f11 -
impression + entry source, period choice, CTA taps, dismisses and
sheet-cancel through one trackCta helper on paywall_shown /
paywall_tapped_cta; restore_purchases_attempted enriched on both store
variants; entry sources threaded at every navigate('ProUpgrade');
allow-list reuse so NO new event names and NO server migration; guard
suite `src/__tests__/proUpgradeTelemetry.guard.test.js`) -> **C7**
account-requirement copy sweep (DONE f2f2547 - SubscriptionPolicy
"no account needed" claim corrected; earlier R10 trimmed the clipped
tail) -> **C8** attribution phase 1 (DONE - `src/lib/attribution.js`:
?src=/?utm_source= -> sanitised [a-z0-9_-] slug max 32 chars,
first-write-wins in AsyncStorage, warmed at startup; App.js captures
passively as the first action on every incoming link;
`first_touch_source` attached to the first_workout_logged payload in
ActiveWorkoutScreen (the one attach point, pinned); NO ad SDK /
fingerprinting / Install Referrer dep — guard suite
`src/lib/__tests__/attribution.test.js`) -> **C3** duplicate
paywall READ-ONLY audit (AUDIT DONE, decision OPEN - PaywallScreen is
a verified orphan: registered once, ZERO navigation call sites, still
defaults annual against the 2026-07-02 monthly ruling, still says
"7 days"; but holds two capabilities ProUpgrade lacks - Play-review
social proof + inline restore. Founder brief with options A-D:
`docs/marketing-2026-07-11/C3-duplicate-paywall-decision-brief.md`.
NO code touched; DifferentialBadge untouched) -> **C5** day-14 factual
recap (MEMO DONE, decision OPEN - three forks: surface (enrich
CascadeGate / RecapStory trial variant / counts-aware day-14 push /
close C5), fact scope (training-only vs +neutral activity counts),
thin-recap threshold. ED guardrails baked in as conditions, not
options: no outcome language ever, weight/food-adjacent lines
suppressed fail-closed under calm/ED, no thin recap.
`docs/marketing-2026-07-11/C5-day14-recap-decision-memo.md`. NO code
touched). RULINGS (D33, founder reaffirmed delegation 2026-07-11):
**D71** C3 = option B, port social-proof excerpt + inline restore onto
ProUpgrade then delete the orphaned PaywallScreen; **D72** C5 = option
A, training-facts block on the CascadeGate trial-end variant,
training-mechanics only, floor 3+ completed workouts. Both recorded
with rationale in the decisions register. BUILDS IN FLIGHT (two Opus
agents, disjoint lanes): C3-B owns ProUpgradeScreen / PaywallScreen
deletion / RootNavigator / tier-screens-mount + paywall test
re-anchors; C5-A owns CascadeGateScreen + cascadeGateRecap guard test.
RECOVERY PATH if a session dies mid-build: `git status` the working
tree; lead-review any uncommitted diff against D71/D72 and the briefs
embedded in this entry's two docs; relaunch the affected agent with
the same brief rather than hand-finishing. Lead-held uncommitted
edits: DifferentialBadge.js + ProGate.js stale-comment fixes and this
board/register update (commit with the C3 landing). PARKED for usage
evidence: C4, C6, C9 (behind C8), C10; win-back wording stays
founder-gated.

## 0. FOUNDER MUST-FIX LIST (device-testing session, 2026-07-11) — SUPERSEDED BY R-CAMPAIGN

_The founder's numbered hands-on list, given at session start. Its "done"
claims FAILED the founder's device walk; every surviving defect is now an
R-item above. Kept for traceability only._

1. **Revert the new font.** DONE — Manrope backed out (`52e65dd`, `a6083f7`,
   `b2be386`), font is Inter again; D53 recorded (`36fc5d2`).
2. **Fix the unilateral workout flow** (no divergent per-side reps; one set,
   same reps both sides, guided side 1 -> transition -> side 2). DONE
   (`f94d156`, D54).
3. **Simplify routine headings on Today and Train** (name only; drop the
   days-per-week + date cram). NOT DONE — was deferred to "need a screenshot".
   Real live cause found: training frequency ("N x/Week") is baked into the
   plan NAME, so it read as name+frequency crammed. DONE (`e7a84f8`):
   display-only planHeadingName() strips the "N x/Week" suffix at the Today
   and Train heading sites; raw plan.name untouched everywhere else.
4. **Fix the empty third card on Progress** (Sessions + New Bests in a 3-slot
   layout, blank third). NEEDS VERIFY — a read found AnalyticsScreen's spark row
   already two-up flex (flex:1, no third slot); confirm there is no OTHER
   progress surface with the gap. VERIFIED (`e7a84f8` report): AnalyticsScreen
   spark row is already two-up flex with no third slot, no other progress
   surface has the gap - already correct in source, shows fixed on a fresh
   build.
5. **Clean up the Coach screen.** PARTIAL. DONE (`f822a91`): removed the
   "private coaching based on your logs" footer, consolidated the check-in
   info onto the check-in row, fixed the "come back Sunday" vs dated-button
   mismatch (weekday-anchor bug). OUTSTANDING: the card/heading showing only
   "Your" (should be "Your week"). VERIFIED already correct in source: the
   NavRow renders "Your week" in full with no numberOfLines/width clip;
   "This week" heading fits its content - resolves on a fresh build. The
   footer/consolidation/date-fix half remains landed at `f822a91`.
6. **Pre/Post-workout meals.** Founder ruling: fully implement (off by default,
   populated + macro-redistributed when on) OR remove — not half-built.
   PHASE 1 DONE (`b53a817`): off by default, hidden when off. PHASE 2 DONE
   (`04f033d`): when enabled and empty, the Diary offers a curated-meal
   suggestion scored against the day's REMAINING macros (reuses the existing
   mealSuggest ranking), so the day stays within tolerance, not piled on top;
   evidence-based pre/post pool already present; no engine touch. FULLY DONE.
7. **Add a completion action to Dietary Needs** (Done/Save/Close). DONE
   (`2d17fff`, "Done" button).
8. **Fix the Dietary Needs reopen bug** (open/close/reopen dead). DONE
   (`2d17fff`, shared BottomSheet re-present race fix).
9. **Fix Body Metrics weight history** (only current shown, no history). DONE
   (`94cd1fe`): history now merges the morning_weights table too, not just
   body_metric_log.

**ALL NINE COMPLETE.** #1,2,3,6,7,8,9 landed; #4 and #5 verified correct in
source (confirm on a fresh build - gated on the EAS build fix). List done;
queue paused here for the founder review per D55.

---

## 1. IN FLIGHT

### CC33 — INJURY / DISABILITY CONFIGURATION: 10/10 SURFACE CAMPAIGN (founder order 2026-08-28) — IN FLIGHT

**Founder order (chat, 2026-08-28, verbatim intent):** extensive review of the
injury/disability configuration design and implementation. Founder's stated
beliefs to test adversarially: not easily understandable; not easy to find; not
easy to use; not explanatory enough; integration possibly imperfect. Lowest
capable agent tiers for leverage work; lead does decisions/design. Target: a
differentiator, 10/10 for people with disabilities AND short/long-term
injuries.

- CURRENT STATE (verified against board + tree): CC25 workstream engineering is
  complete and on main (demand ontology, resolver, "How you train" surface
  CAP-19, inclusive onboarding, Training considerations directory, family
  plans, reintroduction, consent+erasure; migrations 145-149+151 applied). No
  post-landing adversarial UX audit of the CONFIGURATION SURFACE has run; the
  founder reports it fails on findability/comprehension/usability/explanation.
- END STATE: audited-with-evidence UX + integration verdict; lead design ruling
  recorded in the decisions register; rebuilt/repositioned configuration
  surface landed to main green; device checklist; truth fields kept honest
  (REAL-DISABLED-USER-VALIDATED stays NO until real users validate).
- ELEVATES BECAUSE: the engine can only differentiate if users can find,
  understand and trust the surface that drives it; today the founder cannot,
  which predicts users cannot.

**ORDER AMENDMENT (founder, 2026-08-28, second directive):** not limited to
configuration screens. Trace complete end-to-end behaviour of every
disability / long-term restriction / temporary injury setting through plan
generation, existing-plan handling, exercise selection, swaps, active
workouts, coaching, block transitions and future plan generation. Find where
a setting is stored but its effect is invisible, not understandable, or not
consistently honoured. AUDIT FIRST, redesign after. End state: one coherent
capability, not a collection of settings. Audit schema:
`docs/injury-disability-audit-2026-08-28/AUDIT-SPEC.md` (matrix rows R1-R11 x
stages A-H, HONOURED/VISIBLE/EXPLAINED per cell, severities S1-S5).

Stages: S1 recon+research (pair 1: Sonnet inventory read-only, Opus external
research) -> S2 END-TO-END TRACE per AUDIT-SPEC (pair 2, Opus x2 per the
standing tier law - audits are the Opus lane: T1 generation half A/B/C/G/H,
T2 live half D/E/F + lifecycle R10) -> S3 lead audit synthesis + design
ruling (docs/injury-disability-audit-2026-08-28/, decisions to the
D-register) -> S4 build waves (Sonnet surfaces, lead engine/safety-adjacent +
review) -> S5 gate: lint + full suite + merge + device checklist.

STAGE LOG: S1 BANKED (S1-SURFACE-INVENTORY-BANKED.md, 7 entry points, zero
post-session surface; S1-RESEARCH-EVIDENCE-BANKED.md, 20-pattern digest).
S2 BANKED (S2-T1-GENERATION-TRACE.md, 27 findings, lead-verified;
S2-T2-LIVE-TRACE.md, 33 findings, lead-verified — headline S1s: T2-01
promotion breaks serving, T2-02 allowances never consulted; T2's
migration-149 question CLOSED: supabase/README:194 record + read-only
production column check both confirm 145-149+151 live, the database.js:2703
/ capabilityConstraints.js:9 comments are STALE — comment fix queued for
S4). All four evidence lanes complete: 60 findings. S3 DELIVERED
(2026-08-28): FINDINGS.md (verdict: all five founder beliefs CONFIRMED,
four S1s, six structural causes, full 60-finding roll-up with wave map)
+ DESIGN-RULING.md (coherence model "temporary is an overlay; permanent
is the document"; rulings CC33-R1..R8; residual dispositions; success
criteria; five-wave build plan) + register entry D112. S4 IN FLIGHT. W1 (lead, hands-on) LANDED in four
green landings, each merged to main same-session: L1 allowance seam
(blockingConflicts decision layer, 7 consumers, T2-02); L2 posture
unification (T2-19 withhold, T1-09, T1-21, T1-22, T2-09 honest lane
copy) + manual-add respect (T2-04, _userAdded through store and serve)
+ prescription rebuild (T2-03 shared helper); L3 honest block seeding
(T1-01: baselineBlockedMuscles at activation, zero rows + [0,0] band
for baseline-emptied pools, EPISODE rows protected for the §23 ramp -
refinement recorded in DESIGN-RULING §2 R1c); L4 baseline plan rewrite
(T1-03: computeCapabilityPlanRewrite/applyCapabilityPlanRewrite in
sessionEffective, proposal on new baseline rule AND on promotion via
minted ids - T2-01 closed; RT2-1 amendment notice in ActiveWorkout with
lane-correct label). New suites: allowanceSeam,
sessionEffective.serveGuard, capabilityPosture.w1.guard,
baselineBlockedMuscles, capabilityPlanRewrite. W2 (lead) LANDED in three green landings merged to main: L5 mechanism
(T2-12 slope over eligible sets + regression driver; T2-13 substituted
effects entries + reshaped counter through stats/fact/context/classifier),
L6 story+copy (T2-14 CONSTRAINED story/hold/watch lines; T2-15
non-accusing adherence; T2-17 'fine' lands; T2-18 subject-first copy,
words-in-mouth removed), L7 receipt+carry (T1-07 writer honours
CAPABILITY_HOLD - document keeps the movement, serve overlays; T2-25
two-week reintroduction carry at window grain; R1d disposition recorded
in DESIGN-RULING §2 - closes by composition). Suites: constrainedTruth.w2,
capabilityHoldAndCarry.w2; three stale copy pins updated in
capabilityCoach.test.js.

W3 + W5 LANDED TO MAIN (bca83133, full gate 1,097 suites / 14,989
green): W3A session+plan visibility and W3B home+generation visibility
both lead-reviewed with corrections (held-episode filter on the Home
line; unresolved rows earn no plan marker; two builder pins moved to
the stricter shapes); W5 complete - §25 suspension end to end
(migrate_152 APPLIED to production on the founder's named
confirmation), block review asks the capability question with stored
KEEPs never outranking it, resolver door shut on the last raw-library
paths, T1-11 repeat-offer, capabilityShaped threaded through commit AND
dry-run. Gate closure resolved nine failures at root (five fixture
offset bumps per the append convention, one shape pin, two annotated
log-guards, one calendar-rotted fixture proved pre-existing on main and
clock-pinned, one REAL route gap the nav sweep caught - HowYouTrain +
SettingsWorkout registered in ProgressStack). W4B LANDED reviewed
(9d5b4a1b, branch): capture preselect, vocabulary sweep, provenance,
T2-30, stale comments - plus the lead's root closures of its two STOPs
(causeOverride wired end-to-end with the catch preserving the override;
T1-08 capabilityIneligible chain planAutoGen -> programmeEpoch ->
planRationale, blockAdvisor/continuity re-keyed off the shared
name-based autoEligible seam, STOP suite converted to hold the fix).
W4A LANDED reviewed with lead closures (settled gate: lint exit 0;
npm test 1108 suites passed / 1 skipped, 15082 tests passed / 13
skipped): honest preview (computePlanEffectiveLines; summary is its
reduction), per-line review REWORKED by the lead to the representable
model (self rules any-line-applied + allowance mints for kept lines
through the landed carve seam; clinician all-or-nothing behind the
named confirm - rank 2 has no carve), flare/sync re-propose, revisit
row with honest empty tap, T2-27 copy. Two W4A-surfaced defects closed
at root: the plan rewrite's apply no-op (row.id on the nested
{routineExercise, exercise} shape; suite re-shaped to the REAL shape +
would-have-caught pin) and capability-blind substitute selection (ONE
composed senior question - intent AND zero blockingConflicts - now
feeds serve/count/rewrite/preview; pinned at serve + rewrite). T1-20
closed at its root (AvoidedMovements in all six stacks, cross-ref both
ways, sweep watches the route). Ownership sweep caught two unowned
items and closed them: T2-25's durable reintroduction line (stamp read
back into a coach-story change with its own why + quiet Home plan-view
row; three suites) and G1's banned-construction re-audit (clean, hits
judged with mechanism read). SCORECARD refreshed post-W4 (all build
rows LANDED; +I9 preview/serve/rewrite-agree). ADVERSARIAL REVIEW
ROUND 1 RAN (Opus, on main 1839143e): 12 BROKEN, 16 QUALIFIED, 1 STOP,
64 HOLD across the real 93 rows (the 86/87 headers under-counted; fixed).
ALL actionable findings closed at root the same day, rulings recorded
as D113: F1/F2 row-shape class at serve + block review (library
resolution everywhere; UNKNOWN-drives-nothing law at every automation
gate), F3 sync carry unconditional (driven round-trip pin replaces the
source-string pin that let it ship), F4 honest unknown copy on session/
plan surfaces, F5 clinician source-outranks-certainty (carve + rank +
picker copy), F6 episode-scoped keeps + distinct allowance rendering +
reversed remove confirm, F7 tick + border weight on Choice selection,
F8 production-shaped fixtures (serveGuard asServed + drift guard,
sideCarve driven both shapes), Q4 export completeness, E1 Home
ask-row for arrived-undecided rules, J5 arrow spoken label. Q5 stands
documented. FOUNDER-side from the review: S1 (migrate_152 record's
phrase-gate equivalence vs CLAUDE.md's exact-phrase law - ratify or
tighten) and CLAUDE.md's stale migration-status block. ROUND 2 RAN on
715ad90e: 7 BROKEN, 16 QUALIFIED, 0 STOP - converging; ALL actionable
findings closed at root same day (D114): unknown-drives-nothing reached
planAutoGen (excluded = preference lanes asked directly; ineligible =
definite blockingConflicts, byte-matching blockAdvisor) + the
completion-excusal caller (library-resolved rows); episodeStatus
derives from restrictions (a Keep never disables its group's AWAITING;
model pin); near-miss list obeys source-outranks-certainty (pin); R2-6
stale-slot window CLOSED (id-stamped resolve, silence over wrong
claims); R2-5 vacuous applied on nothing-affected (Home ask-row always
clears); R2-7 claimed-index serve mapping (duplicate slots keep their
own prescriptions); R2-8 preselect definite-only; R2-9 Past "(kept
in)"; R2-10 hold caption definite-only; R2-12 label wrap idiom; R2-13
spoken subs (additive SettingRow override + Choice composes). ROUND 3 RAN on 59a7daa4: NOT
CLEAN - 8 BROKEN / 5 roots, two of them round-2 regressions; the
reviewer's process verdict (fixes landing at the named line, next
consumer along missed; source-string pins) ACTED ON: round-3 closures
are mechanism-level with DRIVEN pins through real entry points
(generatePlanDryRun rebuild retains a NULL-column custom lift into the
RESOLVED plan + definite-block control; rejecting-DB pins assert no
vacuous write; duplicate+omitted+_userAdded serve pin). Closures (D115,
which also corrects two D114 claims round 3 falsified): R3-1
currentLibraryIds equipment-only + capability_unknown never blocks the
resolution write; R3-2 `checked` tri-state + applied-rules revisit
reach; R3-3 held notice definite-only (matches plan view); R3-4 serve
returns base indexes ({served, baseIndexes, untouched}); R3-5 check-in
restrictions-only + rulePhrase never names an allowance; fresh
capability state at finish. OPEN work item (D115, recorded not rushed):
untagged custom incumbents contest no continuity slot - silent rebuild
drop, pre-existing, stated on A13, round 4 attacks it. ROUND 4 RAN on 05a7f49d: NOT CLEAN - 7 BROKEN / 4
roots, none a round-3 regression; ALL closed same day (D116) + the
OPEN item + every actionable QUALIFIED: F-1 per-GROUP applied-revisit
dialogue (true no-op cancel; group-scoped stop behind the clinician
confirm; the round-3 flat union could decline every episode on one
cancel tap), F-2 effects follow the serve decision (fully-omitted =
fail-safe with ZERO records; never-served-empty RULED), F-3 caption
uses serve's actionable gate, F-4 Home rows minHeight 48 + first
touch-target pin, Q1 unknown-never-masks-preference in generation
order + POOL invariant pinned over the real seed, Q2 the silent
rebuild drop closed at its reporting root (NO_LONGER_IN outcome + "No
longer in your plan" receipt section + driven untagged-custom pin;
carry-design question recorded for post-campaign ruling), Q3
partial-read never proposes, Q4 one sweep per focus. ROUND 5 RAN on
88f45b5a: NOT CLEAN - 11 BROKEN / 9 roots, FOUR of them round-4
regressions (Q2 and F-1 each landed one consumer short); ALL closed
same day (D117) plus four qualified conditions and both documentation
items: R5-8 the taken-set (bestEligibleSubstitute + serve/preview/
count/rewrite thread it, seeded with the session's own rows; the probe
had two rows permanently rewritten to one movement; driven pins at all
three entry points), R5-4 count mirror shares the never-served-empty
fail-safe, R5-5 §18 predictive weekly-denominator reduction DELETED
(D117 ruling 3 correcting D116 ruling 2 - premise provably false in
every firing; also fixes the "Q5's row" phantom reference: condition
stated on B9), R5-1/2/3 receipt complete on BOTH renderers + drops
count into exerciseChanges (drop-only rebuild takes the rebuild path,
not reactivation) + headline speaks drops + dedupe + identity keys,
R5-6/Q-3 revisit chooser (every conversation reachable, one per tap,
nothing stacks on the per-line review), R5-9 {surfaced, checked}
through both proposal helpers + honest could-not-read toast + detector
key stamped only on completed checks, R5-7 caption speaks serve's
answer off one hoisted memo (substituteSeniorQuestion exported - one
answer, five consumers), Q-1 in-session generic states the conflict
never an adaptation, Q-2 clinician confirm frames (decline/stop/keep),
Q-4 fall-through + headline + PlansScreen pins, Q-5 dissolved by R5-8;
REVIEW-BRIEF 87->93; J1 W3 sweep recorded (no interactive controls
added by W3), J1 LANDED. ROUND 6 RAN on 4584c860: NOT CLEAN - 8
BROKEN / 6 roots + 8 QUALIFIED; ALL closed same day (D118, correcting
two D117 claims): R6-1 the substitute pool honours "Avoid for this
block" (scoped intent loader across all four seam paths; the reviewer
had serve substituting IN the avoided machine and the rewrite writing
it permanently; pins converted to run the REAL senior question - none
ever had), R6-2 caption inputs match serve + focus re-read, R6-3
serveGate mode (dialogues state only what serve is DOING; both modes
mirror the fail-safe; declined co-drivers never produce lines), R6-4
the NAMED in-session line states the conflict (the round-5 fix had
missed the dominant branch), R6-5 composed headline + added count +
additive rep-target statement + entry-keyed matching/id-keyed
accounting + identity keys, R6-6 checked-aware per-line empty answer,
B9 null-not-0 count on unreadable routine, C1 chooser cancel wording,
J2 AppAlert 48dp, J4 label collisions dated, J5 alert actions scroll.
Also: TRN fixture time-bomb repaired in its own commit (wall-clock
fixtures for a wall-clock function; red on the unchanged base,
proven). ROUND 7 RAN on e2807c24: NOT CLEAN - 7 BROKEN / 6 roots + 8
QUALIFIED; ALL closed same day (D119): R7-3 the side carve is a UNION
per axis (left+right no longer combine into fully-available - the
campaign's most safety-adjacent finding; note and block share one
answer; six union pins), R7-1 per-workout retention guard (one
incumbent never into two slots of one session; cross-day retention
stays), R7-4 the fail-safe is TOLD (informational alert before the
vacuous applied; fail-safed rules revisitable; honest group dialogue),
R7-2 both divisionDiff paths rerouted block-scoped + door guard
widened, R7-5 'Not now' only on the decline (source-guarded), R7-6
alert actions bounded by maxHeight not flexShrink (D42 restored), B3
single first load. Reviewer also proved the wall-clock fixture class
empty (+90/+400-day full-suite runs, green). NEW FOUNDER-side items
surfaced in chat (schema records are founder-gated, untouched):
supabase has TWO files numbered migrate_152; README ledger rows
missing for 152_p0/153/154; CLAUDE.md Section 1 migration counts stale
(133 files/136 highest vs the tree's 152 files/154 highest). ROUND 8 RAN on c60ccc57: NOT CLEAN - 3 BROKEN / 4 roots + 11
QUALIFIED - converging; ALL closed same day (D120): R8-1 both-sides
prompt gates on sidedRuleTouches (the union rightly kills the carve
with both sides restricted, which had un-suppressed the forbidden "do
the same reps on each side" ask), R8-2 the fail-safe sentence is
first-class (mixed proposal + group body; outcome-phrased, attribution
banned), R8-3 'Not now' only-on-decline tree-wide (PlansScreen twin
fixed; sweep guard), R8-4 the picker's sided reason three-way true,
D120 ruling 2 the hold-union fork RULED (facts vs automation; per-
consumer scoping rejected as reopening R7-3), I4 sideCarveByAxis
memoised per state (6x allocation removed; round-1 figures superseded
on the row), A1 division recompute carries generation's structure +
canonical-name inputs and renders nothing on an unavailable read, B3
re-closed with a burst window (isFocused premise disproven from the
navigation source), I8 serve effects source-tagged + self-correcting
(real-DB pin), J2/J5 alert rows bounded horizontally (long pairs
stack, rows wrap, buttons shrink). ROUND 9 RAN on 71702dce: NOT CLEAN
- 1 BROKEN + 9 QUALIFIED, 0 STOP - the strongest convergence yet, and
the one broken row is round 8's own fix. Closed same day (D121): R9-1
the replaceSource mechanism REVERTED (serve runs over the persisted
reduced list, so a second pass cannot re-derive pass-1's omissions and
the replace DELETED them; both scenarios D120 ruling 9 cited are
unreachable; pure deduped merge restored, source tag forensics-only,
driven two-pass real-DB pin; I8's revocation claim withdrawn on the
row), B4/E1 Home renders one quiet non-tappable could-not-check line
on the resolver's exact no-known-state signature (unavailable &&
!stale, and the catch; stale-but-known serves per CAP-17), C1/I6 the
'Not now' sweep made RECURSIVE (components/auth + components/food sat
outside the flat readdir) and widened to the write-side identifiers,
with walked-sanity + non-vacuity assertions, R8-1's stale suppression
comment corrected in place. Conditions stated on rows: effects record
corrects only FORWARD (manual re-add never revokes an omission -
B6/B8/B9); division recompute reads TODAY's inputs (A1/I9); I4's two
figures are different fixtures, both Node. ROUND 10 RAN on d7816ec8:
NOT CLEAN - 5 BROKEN from 3 roots (B5, B6, B8, B9, I8) + 8 QUALIFIED,
0 STOP - all three roots in the effects-record seam. Closed same day
(D122, which corrects D121 rulings 1 and 2 plainly): R10-1 the
record's identity is the PLANNED SLOT - writers stamp rowId and the
dedupe keys (effect, exerciseFrom, rowId), so a doubled exercise's two
slots write two true entries (the old per-exercise key silently
deleted the second; legacy tolerance both directions; driven on the
real DB, twin omissions AND twin substitutions), R10-2 a manual swap
over a serve substitute clears _capabilityTemp, makes the row the
user's own, and amends the slot's entry to name what actually stood
(toChosenByUser; swap-back revokes) - the quiet line stops claiming
the app's workaround over the user's pick, R10-3 the record corrects
FORWARD on workout_sets fact - completion passes performedIds, every
performed omission renames 'omitted_revoked', and all strict-matching
readers drop it with no change (the reshaped counter's any-record
predicate corrected to live-entry LIKEs; driven 1/1 before, 0/0
after), B4 cancellation guard on Home's capability effect, C1
FreeStarter's first-run cancel action-phrased off the decline word,
I6 sweep triggers widened to the lane's read identifiers + both quote
forms + button-bounded window, contradictions a-e corrected in place
(reachability wording, raw-library fallback comment, "no legitimate
second write" premise, slot index spaces). ROUND 11 RAN on ea0b712f:
NOT CLEAN - 8 BROKEN from 4 roots + 2 QUALIFIED, 0 STOP - the
round-10 seam work landed one lane, one identity source, one sweep
trigger and one marker short. Closed same day (D123, correcting D122
rulings 2 and 3): R11-1 the SUBSTITUTED lane corrects forward too
(performed-original substitutions revoke at reconciliation; a removed
substitute CONVERTS to an omission; the receipt finally reads
toChosenByUser - "You chose X in for Y", neutral headline on any
user-chosen slot - D122's "no surface attributes" claim had no reader
behind it), R11-2 the two ad-hoc entry points mint stable slot ids at
construction (every rowId was null there - the round-10 collapse
survived on build-a-workout and repeat-as-is), the legacy tolerance
is COUNTED (one keyless entry absorbs exactly one keyed
re-derivation) and ambiguous amends touch at most one entry, R11-3
ProOnboarding's total-block dismiss says 'Got it' + sweep triggers on
the preflight identifiers (WeeklyCheckIn checked, NOT dragged in),
R11-4 EVERY manual swap marks the row the user's own (round 10's
conditional left ordinary swaps reversible by the reachable second
pass), B9 counters require is_completed = 1 + the all-revoke/ledger
fork RULED (count-revoke rejected as fabricated CONSTRAINED
evidence; conservative under-read stated), discard tombstones the
effects record. Six new driven pins; 1/1→0/0 counter pin extended.
ROUND 12 RAN on 68d35635: NOT CLEAN - 9 BROKEN from 5 roots + 4
QUALIFIED, 0 STOP - every root a reachable user chain through the
round-11 closures. Closed same day (D124, correcting D123 rulings 1
and 2): R12-1 the conversion keys on the slot's RECORD, not the
marker the swap clears (swap-then-remove had left the amended entry
standing - the receipt told the user they chose a movement for a
deleted slot; rowId-only matching is exact), R12-2 the removal writer
gains its certainty term (an UNKNOWN-only conflict wrote a durable
excusal while the row's own notice said "doesn't know yet"; the gate
now consumes the shared removalExcusalConflicts answer, a substituted
slot's story is the conversion, and a user-chosen row's removal
records no excusal), R12-3 the THIRD keyless source mints (picker
adds; a "Start without a plan" session was entirely keyless), R12-4
the effects record dies with a deleted COMPLETED workout and the
replace preserves deleted_at (a racing write used to resurrect
tombstones into sync and the export), R12-5 the receipt's
How-you-train link rises to 48dp (two sibling links rise with it - a
visible change for the founder walk), C1/I6 the sweep gains the
resolver/directory identifiers with WeeklyCheckIn's exclusion RULED.
Five new driven pins. ROUND 13 RAN on 3adfb9d8: NOT CLEAN - 10
BROKEN from 4 roots + 4 QUALIFIED, 0 STOP - two roots were earlier
defect classes at yet another instance, so the closures close the
CLASSES (D125, correcting D124 rulings 2 and 3): R13-1 Home's repeat
card was the FOURTH keyless slot construction - per-site minting is
unwinnable, so the store's withSetsArrays chokepoint now mints for
any keyless entry on every fresh/restored/mutated list (fifth
construction impossible; old snapshots heal; Home's site also mints
with the honest working-set count), R13-2 ONE shared excusal gate at
both writers (the completion projection dropped _userAdded - an
add-anyway row was excused if left unlogged but not if deleted - and
the writers disagreed on a held co-driver; held now drops BEFORE the
applied test per D120 facts-vs-automation, the round-12 reject shape
revised not defended; driven at both writers, constraintIds equal),
R13-3 Clear workout history tombstones the effects records (the
THIRD delete path; erasure strengthened, ruled lead-side), R13-4
TrainingConsiderations' four 44dp literals tokenised to 48, B5 a
definite conflict on the SUBSTITUTE outranks the marker line, J5 the
receipt's pill labels carry the R2-12 wrapping idiom. ROUND 14 RAN on c579e272: NOT CLEAN - 4 BROKEN from 3 roots + 7
QUALIFIED, 0 STOP - converging; the briefed hostility toward the two
round-13 class closures found both nets imperfect. Closed same day
(D126, correcting D125 rulings 1 and 5): R14-1 the substitution
marker yields only to conflicts with LIVE automation (a held-only
definite set had killed it and let the held line deny the
substitution), R14-2 the in-session conflict lists reload on FOCUS
with B3's burst window + a sequence guard (the round-13 ruling's own
mid-session-capture scenario had stayed invisible on the row it was
captured from), R14-3 the Article 9 consent dismiss stops wearing the
lane's decline word ('Leave it for now'; JSX-prop form invisible to
four rounds of alert-literal sweeping - the sweep now matches
text:/label=/title=/text-node forms), the chokepoint's two proven
holes closed (null entries mint; the picker append routes through the
net; per-site mint copy deleted; records re-scoped to "every path
that CREATES entries"), and the picker's two undersized lane controls
rise to 48. ROUND 15 RAN on 1ff1a059: NOT CLEAN - 3 BROKEN from 2 roots + 9
QUALIFIED, 0 STOP - strongest convergence since round 9; both roots
were THIRD instances of twice-corrected chains, so the closures end
the chains (D127, correcting D126 rulings 1, 2 and 5): R15-1 the
notice's branch selection extracted into constraintNoticeKind - pure,
twelve-state truth table DRIVEN plus the breaking state at the real
resolver (the held line had fired over a substituted row whenever a
definite baseline conflict co-existed; the episode line now names
driving rules only; a held-only set beside a baseline conflict yields
the actionable baseline line by ruling), R15-2 the picker's
show-anyway/set-aside toggles rise from ~39dp to 48 and the lane gets
its FIRST enumerated touch-target guard with a strays assertion, the
reload failure branch keeps the last state (a transient read failure
no longer erases a correct notice), the swap sheet's write joins the
sequence guard, the sweep gains template/title forms with
element-bounded JSX windows, the R13-3 clear-history sync asymmetry
stated on H2/I2/B9, F7's stale cell corrected. ROUND 16 RAN on 7ce82989: NOT CLEAN - 7 BROKEN from 3 roots + 10
QUALIFIED, 0 STOP - each root a consumer an earlier extraction or
ruling did not reach. Closed same day (D128, correcting D127 rulings
3 and 4): R16-1 the plan caption consumes constraintNoticeKind (its
inline chain kept the pre-round-15 order - the held line silenced a
definite baseline conflict on the surface built to resolve it, while
the session strip said the opposite), R16-2 a user-chosen row never
reserves a substitute (the taken-set leak omitted a planned row and
durably excused it while an eligible substitute sat idle; the fact
now lives IN the view, the serve loop's duplicated early return
deleted, driven), R16-3 the sided-union phrasing is ONE shared
answer (sidedUnionShape; both in-session named lines phrase a
union-blocked sided rule UNSIDED; the picker consumes the same
helper), R16-4 round 15's false reload rationale DELETED (the state
is user-scoped - keep-last on every failed trigger; the swap write
sequence-guarded both directions), clearWorkoutHistory schedules its
tombstones' push, sweep + touch-guard hardened, two stale migration
comments corrected. ROUND 17 RAN on 8ee4949d: NOT CLEAN - 1 BROKEN + 9 QUALIFIED, 0
STOP - matching round 9's best convergence; the one break was a
hook-ordering hole no source pin could see. Closed same day (D129):
R17-1 the both-sides ask WAITS for its inputs (readiness terms
precede the suppression gate and the self-tag; ruled as a posture
split - silence for notices, an explicit wait for actions), Q1
RoutineDetail's intent writers join the sequence guard, Q2 every
effects tombstone schedules its own push (all three delete paths),
Q3 the install-conflict sheet's three ~34dp buttons floored and
enumerated, Q4 the unknown named line unsides, L4's deliberate
rebuild ranking stated, the stale round-3 rationale rewritten. ROUND
18 RAN on 1eb99e66 (after a rate-limit relaunch): NOT CLEAN - 6
BROKEN from 2 roots + 5 QUALIFIED, 0 STOP - both roots the round-17
closures one layer short. Closed same day (D130, correcting D129
rulings 1, 4 and 6): R18-1 readiness means KNOWLEDGE, not presence
(capabilityKnown extracted and driven at the real loader; the ask
holds on the unknown-empty resolver shape and an unfetchable
judgement row; the removal excusal writer takes a FRESH read at
write time like the completion writer), R18-2 a rule that drives
nothing cannot veto a live baseline rewrite (both rebuild builders
now consume the shared removalExcusalConflicts gate for the live
overlay and baselineConflicts for the document question;
slotVerdict ranks live KEEP > baseline REPLACE > open-episode KEEP;
the held-only fork LEAD-RULED to keep deferring - the write carve
voids unmarked conflicted incumbents, so plain evidence judgement
would resurrect T1-07), the sheet's fourth button floored, the
touch guard counts applications, the sweep reaches the sheet and
AvoidedMovements, the unreachable completion .catch deleted with
its false comment. ROUND 19 RAN on 9c54c860: NOT CLEAN - 9 BROKEN
from 4 roots + 9 QUALIFIED, 0 STOP. Closed same day (D131): R19-1
the coach volume withhold could only fire on a throw and the
resolver cannot throw (a cold read failure raised volume body-wide;
it gates on capabilityKnown now), R19-3 the notice/caption let a
declined or undecided rule outrank a definite baseline fact (a
permanent conflict worded as temporary; the helper mirrors
slotVerdict now), R19-2 both rebuild builders refused a stale-known
state the write carve honoured (T1-07 again; capabilityKnown at
both, and at the swap cause derivation), R19-4 the removal excusal
writer had no performed gate (an unrevocable "left out" over the
user's own logged sets, repeated by the receipt, the weekly
counters and the block ledger).

CC33 STATUS: **CLOSED** (D132, founder order "find a way to
satisfactorily close this off without crazy round after round"). The
review loop stopped at round 19 and was REPLACED with a finite
criterion: the capability census
(src/lib/__tests__/capabilityCensus.guard.test.js) enumerates every
site in the tree participating in the four classes the rounds kept
re-finding, asserts each class invariant at each site, and fails by
default on any new unclassified site. Its first run found three more
class-1 instances in ONE pass (two fixed: exercise-detail served
UNFILTERED swap suggestions under a stale-known read, and the volume
landmarks dropped their blocked-muscle facts; one STATED, B7's coach
fact, because closing it means an engine contract change). Round 20
was not dispatched. The
scorecard's "undeniable" bar (a clean adversarial pass) is NOT met
and is not claimed. Every finding raised across 19 rounds is closed
at mechanism level with pins over a green tree; round 19's own
closures have never been adversarially reviewed. X1 = NO, X2 =
founder device walk PENDING - the device checklist was delivered in
chat. NEXT (founder-gated): the device walk, then whether to resume
review at round 20 or close CC33 as-is.

**2026-09-03 UPDATE — X2 HAPPENED; FLOW AUDIT LANDED.** The founder
device-walked the feature and returned the verdict in chat, verbatim:
"It's when you click on one thing like Add Something, it's not clear what
or if you have to do anything next. There's no clear understandable flow
that a normal human will understand ... It just seems bolted together."
Lead-run flow audit (impeccable critique method, dual-agent, every P0/P1
verified against source) landed at
`docs/how-you-train-usability-audit-2026-09-03/AUDIT.md` (commits
125236d7 + this landing). Thirteen flows traced stage by stage against
start / place / end / result / next; 21 findings (HYT-01..21: 4 P0, 7 P1);
25 separately-landed pieces enumerated with their provenance (the
"bolted together" evidence); eight items the original spec asked for and
CC33 never built (ARCHITECTURE §12 time remaining + edit + waiting-to-
confirm, §22 "never a modal ambush", §33.7 badge decay, §33.16 one-
sentence readback). Section 4.2 lists the CC33 findings closed at
mechanism level that are still open as experience (T2-11, T2-23,
T1-15/T2-24, T2-25, T2-26). Off-board commits since 8050bc0b now recorded
there (b0829ba1, 20cb3b66, be4c7c7e, 6fedf6a5).
**HYT-01 is a correctness defect** (backdrop-dismiss of the apply
proposal records a decline, AppAlert.js:78-92 + HowYouTrainScreen.js:626-
632): to land first, alone, with its own test, before any flow work.
NEXT (founder-gated): the five product forks in AUDIT.md section 6
(flow container, where plan decisions live, the check-in card's shape,
edit, consent placement), then the redesign session builds from the
audit. X1 = NO unchanged.

**2026-09-03 BUILD (D133) — IN FLIGHT, slices land one at a time.**
Founder order: "Go through all variants and make it very easily
understandable for even the most stupid human." The five forks are
lead-ruled under D33 (register D133). Slice 0 LANDED `605c1330`
(HYT-01: the apply proposal cannot be declined by dismissal). Slice A
LANDED (this entry): the add flow is its own screen,
`src/screens/HowYouTrainAddScreen.js` (route `HowYouTrainAdd`, every
stack, unguarded), on a pure core `src/lib/capability/addFlow.js`
(computed step plan, full readback, byte-equivalent rows, the saved
sentence and what-happens-next) and `lineChoices.js` (the representable
per-line model, I/O injected). Titled, "Step N of M", Back on every
step, Cancel always, one question per step, the plan decision as the
last step, a Saved screen that says what happens next; the home
screen's "Add something" is the shared Button and forwards every
preselect. Guards re-anchored to intent with header notes:
capabilityGuards CC-D27, capabilityDirectoryDiscovery preselect,
capabilityCopyLeakage side-picker (its screen half had been stale since
the side stage landed 2026-08-21), capabilityRoutesReachable (+route).
NEXT: slice B (home screen: one primary action under the intro, no
orphaned headings, status cards with dates and state, pending decisions
as cards instead of the focus-fired modal, Past with dates), then C
(check-in card), D (edit), E (arrival context + a11y). Founder device
walk of slice A is in chat.
Slice B LANDED (this entry): the home screen. The primary button sits
under the two-sentence intro on every visit; the two empty-state cards
and the orphaned section headings are gone (one hint line when nothing
is set up). "Waiting for you" holds decisions that used to fire as a
modal on focus (HYT-14) and the past-planned-end question; "Your plan"
says in the indicative what the current plan is doing (HYT-08) above the
D112 R4 review row; episode cards are titled by what they are about with
since/until and a state chip (Working around it / Not applied / On hold /
Waiting for your decision / Checking with you; HYT-05); setup rows carry
"Since"; Past rows carry the end date and duration (HYT-15); "More ways
in" is "Related"; the card the wizard just made scrolls into view and
flashes once (HYT-03). Guards re-anchored: T1-06 (detect-and-show, never
propose-on-focus), R5-9 (no back-off key to stamp). NEXT: slice C
(check-in card: the question as a heading, two answers, the rest behind
More options), D (edit), E (arrival context + a11y).
Slice C LANDED (this entry): the check-in card asks one question as a
heading ("Still need this?") with two answers (Still going / Done with
it) and an Options row; every other action (extend, hold or resume, make
permanent, still-going) lives in a bottom sheet where each row says what
it does before it is tapped (HYT-09, HYT-17). The five co-equal pills
are gone. Pinned D112 R8 labels and the hold sentence kept. NEXT: slice
D (edit a permanent rule: tap a row, change a line, save; old row ends,
new row starts). Arrival context and a11y (E) landed inside A and B: the
wizard names the source profile and pre-selects its suggested role,
announces and focuses each step, and multi-selects are checkboxes.
Slice D LANDED (this entry): edit, as ARCHITECTURE section 12
specified ("edit = supersede"). Tapping a setup row or an episode's
Options opens "Change what this covers"; the wizard opens on the check
step with every line filled in (addFlow.draftFromRows, round-trip
tested) and titled "Change this"; saving writes the new rows first and
then marks the old ones superseded (store.markConstraintSuperseded /
endEpisode reason 'superseded'), so nothing lapses in between and Past
says what happened. The bare per-row Remove became a sheet row with its
consequence stated (HYT-21, HYT-17). D133 build COMPLETE on main; the
founder device walk is the next gate (checklist in chat).
Fresh-eyes adversarial review (Sonnet, 2026-09-03) of the whole build:
seven findings, six verified and FIXED in one landing: a failed supersede
was swallowed behind "Saved" (now counted and told, on the Done screen and
in a toast); a failed plan check rendered like "nothing to decide" (now
told); the end-of-flow scroll-and-flash only worked for episodes (now
keys the baseline section); a failed exercise-library load left a blank
screen (now a retry state); the consent grant had no error path; "Change"
from the check step walked forward through every step (now returns to
the check once the rest is answered). Guards: a dedicated wizard guard
(HowYouTrainAddScreen.wizard.guard.test.js), the wizard added to the
touch-target enumeration and the em-dash sweep.
OPEN (founder-raised 2026-09-03): WHERE the primary entry lives. Today
Coach tab > Settings > How you train (RT2-2 / D112 §4 ruled the Settings
home). Options and evidence delivered in chat; awaiting the founder's
choice before any move.
FOUNDER CHOSE B (2026-09-03): "do all three" - register D134; ARCHITECTURE
section 12 amended. LANDED (this entry): (1) Train tab, Plan tools, first
row, always shown, live one-line status (lib/capability/summary.js,
tested); (2) Coach tab, tier-blind "Your body" group above the Pro-only
Setup with the same live line; (3) Home, a one-time offer card for a
person with nothing set up (no rows at all, history included), once the
welcome card has retired and only when no ranked banner holds the
attention slot; "Set it up" opens the add wizard, "No thanks" dismisses;
either dismisses forever; retires by itself when anything is set up.
Pinned by howYouTrainEntries.guard.test.js. Settings row and every
need-moment entry unchanged. NEXT: founder device walk (checklist in
chat).

Superseded dispatch record (W3, kept for the recovery trail): agent
W3A (session+plan surfaces):
WorkoutSummaryScreen (T2-07 post-workout quiet line + T2-22 effects
render), RoutineDetailScreen (T2-32 plan markers, T2-08 narrowing
count), ActiveWorkoutScreen swap-sheet count only (T2-08) + session
reduced signal (T2-06), laterality lines (T2-20/T1-24); agent W3B
(home+generation surfaces): HomeScreen/homeCoachBrief (T1-14/T2-31
ordinary-state line, T1-17 effective count, T1-15 Today AWAITING),
generation reveals (T1-12 blocked-slot counts on all entries, T1-13
graded total-block state), BuildWorkoutScreen travel naming (T1-23),
widgets/writer + partners/weekSignalWriter effective denominators
(T2-16), planEngine buildWhyThis capability line (T1-16). RECOVERY:
agents work tree-only on the campaign branch, never commit/push/stash;
a dead agent's uncommitted diff is lead-reviewed against its brief then
landed or reverted; lanes above are exclusive, lead stays out of them
while agents run. Lead runs W5-minus-PlansScreen concurrently (R8
suspension schema/model/HowYouTrain + migrate_152 WRITTEN
founder-gated; T1-10 blockAdvisor senior question; T1-02 divisionDiff;
T2-10 ExerciseDetail) - PlansScreen items (T1-11) deferred until W3B
lands to avoid a shared lane. THEN W4 Sonnet pair (flows+vocabulary:
T2-11 capture, T2-23 per-line + revisit incl. the standing no-ids
rewrite audit, T2-05 honest preview, T1-05/T1-06 re-propose,
T2-33/T1-19/T1-08/T1-20 vocabulary + cross-refs, T1-26/T1-04 clinician
standing, T2-28 provenance, stale migration comments, T2-27, T2-30),
lead does T1-11 + adversarial Opus review of the whole build vs
DESIGN-RULING -> S5 gate.

RECOVERY PATHS (recorded before dispatch, per operating model): S1/S2 agents
are READ-ONLY (no repo writes) — a dead agent is re-dispatched with the same
brief, nothing to land. S4 builders work only in named file lanes on the
campaign branch; a dead builder's uncommitted diff is lead-reviewed against its
spec and landed or reverted, never blind-committed. Campaign branch:
`claude/p0-01-db-authz-containment` (current session branch, == main at S1
open), merge-to-main at green landings per the 2026-07-30 order.

D37 note: CC25's blueprints are AUTHORITY for what exists, not for what to
build; every S4 item carries its own CURRENT/END/ELEVATES against today's tree.


### CAPABILITY CAMPAIGN 25 (CC25) — capability-aware, disability-inclusive, restriction & injury-aware training intelligence. WORKSTREAM COMPLETE AND ON MAIN (2026-08-21): architecture + CC26 foundations + bundle 1 (CC27–29) + bundle 2 (CC30–32) + the founder's final GAP-CLOSURE order, all gated and merged. Remaining items are founder-side/external only (FOUNDER-ACTION-PACK.md).

**Founder order 2026-08-20** (master brief in chat; architecture campaign
first, implementation campaigns CC26+ only after its completion gate).
Numbering note: the brief numbers this workstream from 25; the global board
already runs to 33, so this stream is namespaced CC25+ (no renumbering; the
closed 2026-08-17 "Campaign 25 — Plans screen" is unrelated).
CURRENT STATE: constraint handling is C31 PATTERN_AVOID (day-bound/indefinite
movement avoidance) + equipment filtering; no baseline-capability model, no
learning-eligibility provenance, no inclusive onboarding step.
END STATE: full architecture (domain model, product laws, precedence,
provenance, exercise-demand ontology, resolver, lifecycle, privacy/safety
boundaries) + CC26+ implementation roadmap, red-teamed and gated.
ELEVATES BECAUSE: the app currently cannot correctly serve users whose
normal training differs from an unrestricted template, and temporary
restrictions can contaminate durable learning.

**AMENDMENT 1 (founder, 2026-08-20, binding, same day):** disability-first
product completeness. Core disability/capability accommodation is NOT
Pro-gated (founder decision FD-1); dual completion standard (A training
intelligence + B disability product readiness); free capability-aware
routine library; population layer only behind evidence dossiers; coverage
registry + marketing readiness gates + disabled-user validation plan;
Grok/Gemini consultation via an EXTERNAL CONSULTATION QUEUE (not reachable
from this environment — amendment §22 route). Full integration record:
`docs/capability-campaign-25-2026-08-20/_CAMPAIGN-LOG.md` Amendment 1 block.

Lead: Fable (main loop), decision authority per brief; clinical/legal/
irreversible-business calls flagged to registers, ED-safety and all
Section 2 inviolables untouched. Campaign folder:
`docs/capability-campaign-25-2026-08-20/` (challenge pass, roster,
stage plan). Branch `claude/build-name-prompt-apple-auth-fp49by` (== main
at open), merge-to-main at green landings per the 2026-07-30 order.

**STATE (2026-08-20 close):** Wave 1 (8 audits + 6 research) banked;
consolidated map; lead-written ARCHITECTURE.md (1,408 lines incl. the
§33 revision round), DECISION-REGISTER.md, ROADMAP-CC26-PLUS.md,
EXTERNAL-CONSULTATION-QUEUE.md — all in
`docs/capability-campaign-25-2026-08-20/`. Both budgeted red teams run
and adjudicated (30 attacks + 14 lead self-attacks; every accepted item
a binding amendment). Completion gate PASSED (record in
`_CAMPAIGN-LOG.md`). Cost governance: 0 pre-synthesis subagents, 2
red-team sonnet agents, ledger in the folder.
**FOUNDER-SIDE (section 3 material; corrected 2026-08-21 under the
no-outside-party law GC-D12):** (1) CC-F1 counsel and (3) CC-F6
clinical review are CLOSED INTERNALLY - rulings in
DPIA-COUNSEL-INPUT-PACK and CLINICAL-REVIEW-PACK; no engagement exists.
Still standing: (2) CC-F2 per-side logging reopen question (recommend
NO); (4) CC-F8 free-tier generation question (recommend not v1); (5)
the Checkpoint prompts in EXTERNAL-CONSULTATION-QUEUE.md remain
optional ideation, never a dependency; (6) PD-1..9 pre-existing defects
recorded in the register for triage — notably PD-1 (adapted-MAV
per-session unit) and PD-2 (Engine Log's false rotation claim).
**CC26 (2026-08-20, same session as the start order):** capability
foundations landed per the roadmap CC26 block — local + cloud schema
(145/146/147 written, NOT applied, CC-F7), registry sync, granular
consent + erasure, How you train surface (CAP-19 free), CAP-4 lane
guards, scrub coverage, 105 targeted tests. Lane is inert by
construction (guard-tested: selection/generation/coaching unchanged).
Ruling CC-D27: demand-only add UI in CC26; family/exercise/allow add
surfaces are a named CC27 gate item. Zero implementation subagents;
red-team record in `_CAMPAIGN-LOG.md`. Full record: campaign log CC26
block + STATUS-LEDGER.md.
**CC27–CC29 (2026-08-20, execution bundle 1, founder bundle order):**
all three campaigns landed back-to-back per the roadmap blocks — demand
ontology + resolver + composed senior question everywhere (CC27),
inclusive onboarding + computed library compatibility + ten family
plans (CC28), effective prescription + honest adherence denominators
(CC29). Cloud files 148/149 written, NOT applied (CC-F7; 145-149 all
await the founder phrase). ONE bundle-end Sonnet red team: 4 accepted
BREAKs, all fixed and pinned. Full-suite gate green; merged to main.
Full record: `CC27-29-BUNDLE-TRACKER.md` + STATUS-LEDGER.md in the
campaign folder; physical device walk banked in
PHYSICAL-VALIDATION-BACKLOG.md (30 steps, CC26-CC29).
**CC30–CC32 (2026-08-20/21, execution bundle 2, founder bundle order):**
learning eligibility + contamination shield (CC30), coach/check-in/
return path with the CONSTRAINED limiter and conservative formula-free
reintroduction (CC31), accessibility + observability + privacy/
readiness (CC32). Cloud file 150 written, NOT applied. Sonnet red team:
3 accepted findings fixed and pinned. Full-suite gate green; merged to
main at `1259a9f`; report delivered. Full record: campaign folder
STATUS-LEDGER.md + _CAMPAIGN-LOG.md.
**GAP CLOSURE (2026-08-21, founder final order, banked at
GAP-CLOSURE-ORDER-2026-08-21.md):** phases A–I complete — original-spec
traceability (T1–T30), Training considerations directory (20 condition
+ 20 injury stateless knowledge profiles + OTHER path, live-verified
citations, wording-law validator), eleventh demand axis
weight_bearing_hands (migrate_151 written NOT applied), library tagging
closed (nine axes 100%, unilateral 95% with 26 deliberate NULLs, wbh
98%), five new family plans (16 capability families, seed v14, 2 new
seeded movements), adapted-setup layer (29 rich entries + GC-D11 class defaults over all
220 materially-needing exercises), directory-wide
scenario matrix + nine §16 movement fixtures + coverage stats, truth
pass (registry, matrix 8-status ladder, REAL-DISABLED-USER-VALIDATED =
NO). Cost: 5/6 Haiku, 0/1 Sonnet, 0 Opus, no agent-to-agent
delegation. Final gate: 40-item walk (one genuine find fixed at the
gate), lint green, ONE full suite green (1033 suites / 13,929 tests),
merged to main. Full record: GAP-CLOSURE-TRACKER.md +
ORIGINAL-SPEC-TRACEABILITY.md + COST-GOVERNANCE-LEDGER.md.
**RECOVERY/RESUME:** the workstream is CLOSED, and the 2026-08-21
no-outside-party law (GC-D12) closed every external-professional item
internally. Remaining founder actions after the 2026-08-21 production apply
(145-149 + 151 APPLIED AND VERIFIED on the phrase; 150 retired/skipped;
supabase/README batch block): iOS profile delete; device walks.


### CAMPAIGN 6: RETURNING USERS, LONG-TERM PERSONALISATION, LAPSES,
### REINSTALL AND MULTI-BLOCK EXPERIENCE (founder order 2026-08-11)
- IN FLIGHT on `claude/campaign6-long-term` from main `5764a947`.
- Purpose: Campaign 5 answered "does Volyume make sense when I
  start?"; Campaign 6 answers "does Volyume still make sense after it
  knows me?" — 30/90/180/365-day horizons, lapse/return, reinstall,
  new device, two devices, plan/phase/tier changes, multi-block.
  Central promise: PERSONALISATION SHOULD COMPOUND, but history must
  never become false certainty.
- Three long-term laws: MEMORY MUST HELP NEVER TRAP; NO
  PERSONALISATION WITHOUT PROVENANCE; LAPSE ≠ FAILURE.
- 62 phases: journey map (16 personas), personalisation maturity
  model, six-block synthetic athlete + compounding invariants,
  learnedRange longitudinal audit, D91-25 long-layoff
  CHARACTERISATION (never implemented), D91-24 CHARACTERISATION
  (never stealth-fixed), stale-history copy truth, plan switching,
  exercise history/PR/progression/Apply over months, Repeat-vs-Adjust
  sequences, manual overrides, coaching modes, calm mode, tier
  transitions (Free↔Pro), trial-retry long-term, nutrition
  90/180-day + phases + lapses, weight history, lapse/return matrix,
  block state during absence, streaks, win-back, progress at scale,
  historical edits, reinstall, migration 132/134/135 contracts
  (NEVER run), adaptation_events (FR-C4-3), notification prefs
  (FR-C4-2), two-device conflicts, weeks offline, timezone/DST,
  scale/row-caps, local-only truth, partners, plan archives,
  personalisation copy maturity, non-change explanations, long-term
  safety, six-month Free/Pro, three permanent E2Es (180-day athlete /
  90-day lapse / reinstall), four adversarial reviews, debt triage,
  H4, legal copy gate, migration release table,
  campaign6.longTerm.test.js, gates, 80-item handover. STOP after.
- HARD: no production migration run; trial law settled (never
  re-ask); Free has no coaching; no cardio/AI/social/gamification;
  no auto transitions; Article 9/ED/billing/D92-11 untouched; no
  travel mode (clock correctness only); no photo cloud sync.
- FOUNDER ADDENDUM (2026-08-11 mid-campaign): THE PERSONALISATION
  DIVIDEND + long-term coaching relationship - governing law for this
  campaign (verbatim in scratchpad
  c6-ADDENDUM-PERSONALISATION-DIVIDEND.txt; summarised at the top of
  the campaign log). Five promises (remember/respond/improve/respect/
  show-why), muscle-specific dividend proof Block 1->3->6, non-change
  states never collapse, anti-anthropomorphism + anti-manipulative-
  retention laws, four new docs + Review E, relationship invariants in
  the suites, handover grows to 96 items. Integrated, not a new
  campaign; "What Volyume has learned" surface is feasibility-audit
  ONLY (verdict A/B/C/D, separate founder ruling to build).
- RECOVERY: order verbatim in session scratchpad
  c6-CAMPAIGN6-ORDER.txt + the addendum file above; campaign docs in
  docs/long-term-audit-2026-08-11/ (CAMPAIGN-LOG.md = running
  state); rulings register as D97.

### ADAPTIVE MESOCYCLE BUILD (founder GO 2026-08-09) — 8 stages, test-first
- Authority: docs/blueprint-adaptive-mesocycle-2026-08-09.md §3.9 + the
  founder's staged order (verbatim in session 2026-08-09): Stage 1
  lifecycle/trust (COMPLETED_AWAITING_DECISION), 2 pure Block Ledger,
  3 performance metric, 4 fatigue context, 5 learned range (reuse adaptive
  bands), 6 seeding fallback chain, 7 strain-aware deload, 8 explanation
  layer. Sixteen named test scenarios written BEFORE implementation.
  RESPONSIVE retains the successful dose by default; +start only on
  in-block dose-response evidence. Engine spine = lead hands-on; each
  landed stage gets an adversarial review agent vs the blueprint.
- Recovery path: stages land individually green to main; board updated per
  stage; a dead session resumes at the first unlanded stage from the
  blueprint + this entry.
- Stage 1 LANDED (2026-08-09): getBlockStatus merges complete/overdue into
  completed_awaiting_decision (+awaitingDecision, weeksOverdue);
  getCurrentMesoWeek gains { wrap: false } clamp; the db week resolver
  returns awaitingDecision; honest "Block finished" copy on the Home chip,
  BlockShapeCard (finished prop, all three consumers), BlockProgressCard,
  MesocyclePulseCard; widget writer drops the live-week claim; blockAdvisor
  reads the merged state, loses the false "automatic adjustment" promise
  and the stale "take your recovery week" line; Consistency tooltip stops
  promising an automatic heavier next block. Ledger seam threaded through
  activatePlanWithBlock -> generateInitialPlannedVolume (unused until
  Stage 6). createMesocycle confirmed DEAD (zero callers; resolve in
  Stage 6). Pins: src/lib/__tests__/blockLifecycle.stage1.test.js (14).
- Stage 2 LANDED (2026-08-09): pure src/lib/interBlock.js (Block Ledger).
  classifyMuscleBlock + buildBlockLedger; classes RESPONSIVE/OVERREACHED/
  STALE/STRAINED/INSUFFICIENT_DATA; founder retention rule enforced (+1
  only on doseResponse.lateProgression && lateRecoveryOk, never more);
  blueprint caps (learnedCeiling-2, MAV start cap, achievedPeak-2
  OVERREACHED peak, MAV STRAINED peak, MRV+30-set peak ceiling, MEV
  floor); INSUFFICIENT_DATA split: undelivered dose (adherence<0.6 or
  exposures<4) -> research seed, broken measurement with dose tolerated
  (no recovery data / discontinuity / confidence<0.6) -> retention;
  suppression (calm/ED, caller-ORed, tier-blind) blocks all upward
  carry, reductions pass; stale evidence >=4 weeks blocks increases;
  STALE stimulus proposal (variant_swap primary / rep_range alt) only
  when entrenched (priorFlatBlocks>=1) or perf down; block-level
  proposedRecoveryDays 10 only with a STRAINED entry AND >=2 persistent
  systemic signals, else 7 (proposal only). Pins:
  src/lib/__tests__/interBlock.stage2.test.js (36: 4 worked examples,
  12 founder scenarios, quadrant gaps, caps, purity/tier-blind).
  Next: Stage 3 performance metric (per stable exercise, never average
  raw e1RM across exercises; rebound/new-lift discounting; PR density
  over eligible exposures) feeding interBlock's performance input.
- Stage 2 REVIEW REMEDIATION LANDED (2026-08-09; adversarial review
  executed the module and ran a 41-case mutation sweep; all 17 findings
  fixed, none parked): rationale now composed from the FINAL clamped
  numbers (the blocker: copy could claim "starts lower" while proposing
  identical numbers, guaranteed for every existing user whose block
  seeds MEV->MAV); OVERREACHED peak = min(achieved, planned) - 2;
  unearned RESPONSIVE peak holds the block's plan (no silent ramp-top
  reset to MAV); suppression hold cap = previous start / researchMev
  (adapted MEV can no longer raise volume under calm/ED); finite-number
  coercion (string '12' concatenation and NaN proposals killed);
  missing/inverted landmarks fail closed to a null proposal;
  +1 gated on COMPOSITE confidence; STRAINED capped at MAV;
  MUSCLE_DISPLAY_NAMES in copy; ledger tolerates junk entries;
  blueprint §3.1 carries the founder's +1 amendment note. Suite
  36 -> 61 tests incl. at-boundary pins for every gate constant the
  mutation sweep showed unpinned, and a rationale-vs-numbers
  consistency sweep across all 15 branches.
- Stage 3 LANDED (2026-08-09): pure src/lib/blockMetrics.js
  (computeBlockPerformance) computes interBlock's performance input
  from raw workout_sets rows: per-exercise least-squares e1RM slopes
  (fitted-start normalised, weighted mean of SLOPES, raw e1RM never
  pooled across exercises); stable = >=3 sessions spanning both
  accumulation halves; x0.5 weights for new-this-block lifts and
  mid-block rep-range shifts (null targets = unknown); confidence =
  weighted stable share; discontinuity = stable raw share < 0.5
  (exercise-swap case); PR replay per exercise vs prior-history best
  (calculate1RM + the 1.001 detectPR margin, first-ever never a PR),
  rebound-window PRs weigh 0.25; eligible exposures = distinct
  primary-role sessions, deload week excluded everywhere; doseResponse
  = late half beats early by >=1% (or late PR) + POSITIVE late feedback
  evidence (absent feedback is false - no evidence, no increase).
  Pins: blockMetrics.stage3.test.js (29, written first). Recon notes
  (agent, 2026-08-09): no PR table exists (replay is the only route);
  advisor deload-flag firings are NOT persisted - Stage 4/6 must read
  coach_outputs.recovery_flag (dated) and mesocycle_weeks.is_deload on
  non-final weeks (applied early deloads) as the persisted substitutes;
  getAdaptiveLandmarkHistory is primary-only/undated (Stage 6 gathers
  its own block-windowed recovery rows); mesocycle_weeks
  started_at/completed_at are dead columns (weeks are calendar-derived);
  blocks have no plan FK (previous block = recency).
  Next: Stage 4 fatigue context in weeklyCoach (week-in-block expected
  fatigue; PR-binary replacement with density+slope per §3.3).
- Stage 4 LANDED (2026-08-09): week-in-block fatigue context + PR density
  in weeklyCoach (§3.3). contextAdjustedRecovery: an observed recovery
  grade 3 in the PEAK week (final accumulation week, blocks >= 3 accum
  weeks) reads as 2 for the push/hold branch ONLY - deload thresholds
  read the RAW grade (founder red line), grade 4 never softens, weeks
  1..n-1 never soften (early warning preserved), persistent fatigue
  (consecutivePoorRecoveryWeeks >= 1) never softens; safetyHold still
  caps any push (order unchanged); output carries
  peakWeekContextApplied. getPerformanceScore: top grade now needs PR
  DENSITY >= 0.3 (prs / completed sessions) or caller-supplied
  blockE1rmSlopePct >= 1.5 (Stage 6 wires blockMetrics into it) or the
  check-in's own 'exceeded' verdict; legacy binary preserved when no
  session count supplied. New engine inputs blockWeekIndex /
  blockAccumWeeks / blockE1rmSlopePct all default null = byte-identical
  legacy. CoachOutputScreen threads the context (null for a finished
  block) AND gains the deload-row apply guard: a positive volume apply
  never writes into a recovery week's rows (pre-existing hazard the
  peak-week push would have amplified; card explains, handler backstops).
  Pins: weeklyCoach.stage4.fatigueContext.test.js (17, written first).
  Full suite green (9406), no collateral re-anchors needed.
  Next: Stage 5 learned working range (reuse computeAdaptiveLandmarks /
  effectiveLandmarks precedence; block-grain ceiling/floor updates;
  slow conservative moves, min evidence, one block nudges never
  overwrites).
- Stage 3 REVIEW REMEDIATION LANDED (2026-08-09; review executed the
  module with real-shaped rows and adversarial series; both blockers +
  ten defects fixed, none parked): rows read actual_reps (the schema
  column - `reps` does not exist; the old code silently zeroed every
  real row, which would have reseeded every muscle from research);
  per-session weeks now share mesocycle.localDaysElapsed (exported) so
  the block-activation clock time and DST can never flip a verdict;
  slope is a robust Theil-Sen fit clamped +/-25% (one mistyped set no
  longer swings +/-100 points); unusable fits EXCLUDE the exercise
  (weight 0) instead of shipping a false 0% at full confidence, and
  confidence only credits exercises with a usable loaded series;
  deloadWeekIndex null = last week; zero-load bodyweight work counts as
  exposures (e1RM path still needs load); muscle attribution goes
  through allocateExerciseVolume (legacy 'shoulders' etc. normalise);
  new/rep-shift discounts now reach PR density; rep-SHIFT means the
  early and late halves' target pairs are disjoint (a heavy/volume-day
  split is not a shift); newness needs >= 4 usable prior rows; missing
  joint answers and self-selected feedback scraps (< half the late
  sessions) never read as recovered; finite-number guards throughout.
  Suite 29 -> 42. Lead rulings recorded in module docs: rep-count
  progression raising e1RM is the app's single strength model (X4);
  PR density stays corroborating evidence, classification runs on the
  slope.
- Stage 5 LANDED (2026-08-09): pure src/lib/learnedRange.js
  (computeLearnedRange) - the block-grain learned working range as a
  REPLAY of persisted Block Ledger history over the profile-adjusted
  prior (no parallel store; session-grain adaptive bands untouched).
  Ceiling: prior MAV moving toward the highest volume HANDLED
  (RESPONSIVE -> achievedPeak, +/-2 per block; OVERREACHED ->
  achievedPeak-2 downward only; STRAINED -> block start downward only;
  STALE no move). Floor: prior MEV nudging 1/block toward the lowest
  progressing start (RESPONSIVE only). Clamps: research MEV anchor,
  adapted MRV / prior MRV / 30 ceiling cap, floor <= ceiling-2.
  Min evidence: confidence >= 0.6 + real classification + observed
  numbers; isLearned only after >= 1 qualifying block. interBlock
  entries now echo observed {startSets, achievedPeak, plannedPeak} for
  the replay. Pins: learnedRange.stage5.test.js (19, written first).
  Next: Stage 6 seeding refactor (fallback order manual -> valid ledger
  -> learned band -> profile-adjusted research -> raw research; ledger
  persistence + block-end computation hook; advisor buttons map to the
  ledger; createMesocycle deadness resolved).
- Stage 4 REVIEW REMEDIATION LANDED (2026-08-09; review swept 9,000
  inputs old-vs-new engine; all findings fixed or honestly recorded):
  softening now CAUSE-GATED (soreness >= 3 AND energy >= 3 AND stress
  < 4 - a grade 3 from low energy or high stress never softens;
  PIPE-001 restored) and double persistence-gated (new
  consecutiveGrade3RecoveryWeeks input, caller-derived from PRIOR
  weeks' soreness >= 3, so a user sore every week is never softened);
  D15 escalation gains !peakWeekContextApplied (a softened push is not
  escalation evidence); the softened training note names the mechanism
  ("Peak-week fatigue is part of the plan") and never claims excellent
  recovery; D16 Coached walk mirrors the deload-row guard (it used to
  STALL for ever in the final accumulation week, silently skipping all
  nutrition applies); the training card reads "Hold through your
  recovery week" instead of an unappliable "Add N sets";
  nextWeekIsDeload refreshes after an applied early deload; data_hold
  output gains peakWeekContextApplied parity. RECORD CORRECTIONS
  (review #6/#7): (a) the deload BRANCH reads the raw recovery grade,
  but the PERFORMANCE grade feeding it did change - ~45/9000 legacy
  inputs now deload where they held (conservative direction, intended
  per §3.3); (b) the PR-density change ALTERS LIVE BEHAVIOUR for
  existing users (the caller always passes a session count): a 1-PR
  4-session adherent week grades 2 not 1 (~495/9000 inputs shift
  volumeSignal) - this IS §3.3's ordered replacement of the binary,
  stated here plainly. Known limits recorded: weekly PR density
  normalises by total sessions (blockMetrics' block-grain density is
  the exposure-normalised one); blockAccumWeeks derives from
  plannedWeeks (an applied early deload shifts the true peak by one -
  Stage 6's gather counts is_deload rows). Suite 17 -> 27 + d16 guard.
- Stage 6 PART 1 LANDED (2026-08-09): pure src/lib/blockSeed.js
  (resolveSeedRange) - the per-muscle fallback chain exactly as
  ordered (manual -> valid ledger -> learned band -> profile-adjusted
  -> raw research), source named for the explanation layer; 'repeat'
  = true repeat from observed numbers, 'adjust' = full proposal;
  suppression degrades ledger seeds to repeat (reductions pass),
  skips the learned band, never touches manual; research MEV + 30-set
  clamps. Pins: blockSeed.stage6.test.js (20, written first).
  Stage 6 REMAINING: local migration (mesocycles.block_ledger TEXT) +
  cloud migrate_131 (write only - founder-gated apply, ORDER: before
  next build) + sync push/pull round-trip; the block-end gather hook
  (computeAndStoreBlockLedger: sets/feedback/checkins/coach_outputs
  recovery_flag -> buildBlockLedger, fail-closed suppression read);
  generateInitialPlannedVolume consumes the ledger via resolveSeedRange
  per muscle; PlansScreen builds+passes the ledger with intent;
  advisor 'Continue with adjustments' label returns WITH behaviour;
  createMesocycle deleted (test pin update).
- Stage 6 PART 2 LANDED (2026-08-09): ledger persistence.
  Local migration v69 (mesocycles.block_ledger TEXT, additive,
  snapshot-guarded, benign on re-run; frontDelt/biceps last-N test
  windows re-anchored +1). Cloud migrate_131 WRITTEN, NOT APPLIED
  (founder-gated; ORDER: must run against production BEFORE the next
  build ships, migrate_129 precedent). Sync round trip: push parses
  the TEXT ledger to an object for jsonb (unparseable -> null, never
  poisons the batch); pull stringifies jsonb back to TEXT and
  PRESERVES a local ledger when the cloud row carries none (the
  INSERT OR REPLACE wipe hazard). GATE LIFTED 2026-08-09: migrate_131
  APPLIED to EU-Dublin production and VERIFIED (column jsonb/nullable/
  no default; 11 rows untouched, 0 ledgers; migration ledger ordered
  after 129/130) under the founder's staged follow-up order ("1. Let
  both adversarial reviews finish ... 5. Only then run migrate_131
  against production. 6. Verify production migration/schema"), with
  all four preconditions re-verified first (reviews remediated; lint +
  9,586 tests green on main; strain->deload monotonicity executed
  around the MEV floor; mixed-muscle e2e regression green). Artefacts
  built from main at/after 30fb2f53 are now clear to ship.
- Stage 5 REVIEW REMEDIATION LANDED (2026-08-09; review executed the
  module + 5000-case fuzz + mutation run; both blockers + all defects
  fixed): the research-MEV anchor now OUT-RANKS every cap (52 real
  profile x muscle combinations could drag the floor beneath research
  MEV via a profile-shrunk prior; the cap now yields to the anchor);
  the ceiling learns the HIGHEST handled volume (running max - a later
  good lower-volume block no longer erases proven capacity at 2 sets a
  block, and the RESPONSIVE/STRAINED oscillation resolves); the floor
  is MONOTONE DOWNWARD only (not trying lower volumes is not evidence
  they fail; a rising floor was upward volume pressure - the old
  behaviour was pinned and is reversed); interBlock echoes NULL for
  absent observed inputs (landmark fallbacks could fabricate
  "measurements" the user never performed) and carries a suppressed
  marker; string-coercion parity with interBlock (a stringly
  confidence no longer erases the range); empty observed objects are
  not evidence and cannot mark the range learned; degenerate priors
  fail closed to null bounds; optional muscle guard against blended
  ledgers. Suite 19 -> 33 incl. anchor-vs-cap, running-max, boundary
  0.6 and real prior-MRV cap pins.
- D91 rulings 11-12 added (see register): (11) s3.8's no-upward-carry
  BINDS THE MEMORY - a block trained under calm/ED never raises the
  learned ceiling, its downward evidence still counts; (12) manual-
  override blocks never teach the engine - a valid ledger entry with
  deferredToManual is skipped by the replay, so removed overrides
  cannot launder user-chosen numbers into "learned from your history".
- Stage 6 COMPLETE (2026-08-09, founder GO "proceed with the next
  stages"): the ledger goes live end to end. Pure gather transforms
  (blockLedgerGather.js: soreness 1-3 -> 1-5 remap per the adaptive-
  history precedent; readinessSlope = normalised total change;
  sleep-flag weeks; deload flags from the persisted substitutes
  (coach_outputs recovery_flag + applied early deloads, mid-block =
  before the peak week per D91#4); rebound windows (14-day gap rule);
  allocator-attributed adherence sums; primary-role session rows;
  achieved weekly peak; the seeded linear ramp) - 22 pins written
  first. Impure runner (blockLedgerRunner.js): computeAndStoreBlockLedger
  (idempotent by LEDGER_VERSION, fail-closed suppression read, persists
  via storeBlockLedger + sync) and buildSeedRangesForNextBlock (full
  fallback chain per muscle via resolveSeedRange; learned range replays
  prior stored ledgers incl. the just-finished block). Thin database.js
  readers added (block training data, prior sets, planned-for-block
  +week_index, deload-suggested week starts, exercise rows map,
  checkins-in-range, storeBlockLedger). generateInitialPlannedVolume
  consumes the seed map (per-muscle start->peak ramp via
  buildSeededWeeklyTargets; row source records seed_<source> vs
  template so Stage 8 can never claim a personalisation that is not
  there). PlansScreen builds+passes the seed ranges with the tapped
  intent; blockAdvisor's "Continue with adjustments" label RETURNS with
  the behaviour behind it. createMesocycle DELETED (dead; pins updated:
  0 occurrences, 2 INSERT sites). Exports added for reuse-not-fork:
  mesocycle.localDaysElapsed (earlier), blockAdvisor.checkinReadiness,
  planEngine.computeLandmarks, effectiveLandmarks getManualLandmarks/
  getAdaptedLandmarks (getEffectiveLandmarks refactored through them,
  behaviour identical).
  Next: Stage 7 strain-aware deload (computeDeloadVolume % of achieved
  peak scaled by strain, seeded deload week likewise; 10-day window
  stays a proposal and its COPY lands with Stage 8's explanation
  surfaces).
- Stage 7 LANDED (2026-08-09): strain-aware deload (§3.4).
  deloadShare: 60% of the achieved peak at strain 0 stepping five
  points per strain point to the 40% floor at strain >= 4.
  computeDeloadVolume(rows, { peaks, strainScore }): each muscle lands
  at max(MEV, achieved peak x share), only ever reducing, legacy
  flat-MEV byte-identical without context. The coach deload apply
  passes the active block's achieved weekly peaks
  (blockLedgerRunner.getAchievedWeeklyPeaks) with strain mapped from
  the persisted weekly recovery read (deload_suggested -> 4,
  concerned -> 2, else 0); a failed peak load degrades to the legacy
  cut, never blocks. Ledger-sourced seeds carry deloadSets (share of
  the entry's achieved peak using its recovery_cost_weight), and the
  seeded deload week consumes it; non-ledger sources keep flat MEV.
  RIR 4 untouched. The 10-day window stays a PROPOSAL
  (ledger.proposedRecoveryDays); its user-facing copy lands in Stage 8.
  Pins: deload.stage7.test.js (15, written first); blockSeed exact-
  shape pins re-anchored (+deloadSets).
  Next: Stage 8 explanation layer (block-start seed lines from the
  WRITTEN plan rows, BlockReflection ledger section, PlansScreen
  decision rationales + 10-day proposal line, CoachOutput ramp
  position; never claim an adjustment unless the plan contains it).
- Stage 8 LANDED (2026-08-09) - ALL EIGHT STAGES BUILT. Pure builders
  (blockExplain.js, 17 pins written first): summariseSeededPlan reads
  the WRITTEN planned rows (never the requested seed map - a skipped
  insert can never be narrated); buildBlockStartLines speaks only for
  personalised sources (seed_ledger/learned/manual; template and
  profile ramps earn no claim); buildLedgerReflectionRows reuses each
  entry's delta-composed rationale verbatim, STRAINED first,
  INSUFFICIENT_DATA last; recoveryProposalLine renders ONLY when the
  ledger proposed 10 days, always "your call" (Stage 7's deferred
  copy); buildRampPositionLine claims a coach adjustment only for an
  APPLIED delta. Surfaces: HomeBlockShapeSheet seed lines (loaded from
  plan rows by HomeScreen); PlansScreen decision card ledger story (4
  rows) + recovery proposal; BlockReflection "What this block showed"
  section from the stored ledger; CoachOutput training-card note gains
  the ramp position.
  CAMPAIGN REMAINING: founder device walk (checklist in the handover),
  migrate_131 apply (founder phrase "run against production") BEFORE
  the next EAS build ships.
- FINAL REMEDIATION BATCH LANDED (2026-08-09; founder final order +
  Stage 6 review + Stage 7-8 adversarial review; every finding fixed,
  ONE explicit deferral recorded as D91-24, nothing silently parked).
  Founder Stage 7 refinement built: deloadFloor = MEV/2 min 1
  (coachApply) - MEV never forces a recovery week UPWARD (D91-14);
  strain muscle-specific (per-muscle strains map + per-entry
  recovery_cost_weight, D91-15); founder monotonicity sentence pinned
  verbatim (deload.stage7). Review blockers: deloadSets clamped to
  min(startSets, 30) (D91-18); suppression withholds deloadSets - flat
  MEV recovery week for flagged users (D91-19, ED-safety); Plans card
  rationale rows render only above the 'adjust' button that applies
  them, recovery-proposal line stays for all post_recovery (D91-22).
  Defects: share applies to peak CAPPED at the row/seeded peak so a
  deload is never a no-op (D91-17); strain fails CLOSED to heavy
  (D91-16); integer share maths (no float half-loss); repeat carries no
  deloadSets (D91-20); ramp line derives its climb from WRITTEN weekly
  totals + names the magnitude, coach clause needs musclesChanged>0,
  only rendered for the CURRENT week; block-start lines name the peak
  week (never "final week"), flat seeds "held steady", colon phrasing
  (plural names), source taken from the week-1 row with ORDER BY
  week_index (row-order bug), coach-raised weeks excluded from the seed
  peak; Home sheet skips seed lines when awaitingDecision; deload copy
  made qualitative ("fewer sets"; 2 snapshots re-anchored, D91-23);
  getAchievedWeeklyPeaks skips deleted rows + newest-active;
  PlansScreen ledger-story request guard. INSUFFICIENT_DATA never
  seeds as 'ledger' (D91-21). Tests: deload.stage7 rebuilt (30 pins),
  blockExplain.stage8 re-anchored + review pins, blockSeed.stage6
  re-anchored (4), NEW adaptiveBlock.e2e.test.js - the founder's
  synthetic athlete campaign (six muscles/six outcomes, repeat-vs-
  adjust PERMANENT regression, suppression/stale/manual/null-ledger
  variants, gather-extraction pins, sync-authority + provenance
  source pins, chain purity).
  FUTURE (recorded, founder order - do NOT build yet): training-epoch /
  learned-ceiling freshness for long layoffs, detraining and profile
  change; no arbitrary weekly decay (D91-25).
- FULL PRODUCT MAP CAMPAIGN (2026-08-09, founder order) - COMPLETE.
  Discovery/documentation ONLY; zero code/copy/test/schema/behaviour
  changes (verified: lint clean + full suite green over the delivered
  tree). Deliverables: docs/_FULL-APP-PRODUCT-MAP.md (15,249 lines:
  lead-written spine for the cross-cutting parts + eight lane chapters
  from paired Opus read agents) and
  docs/_FULL-APP-PRODUCT-MAP-HANDOVER.md (method, counts,
  uncertainties, review disposition, reading order). Fresh-eyes
  adversarial review returned 21 findings (6 blockers incl. plate
  calculator wrongly LIVE, giant sets wrongly "do not build", partner
  cap, health screens dark, rapid-loss rule overstated) - ALL actioned
  in the document. 84 lane uncertainties recorded; highest-stakes open
  items for founder/device verification are in map Part 33 (cardio
  dead-tap, planned_muscle_volume restore gap, privacy-pref sync,
  allergen stamp drop, meal-reminder re-lay). Doc-vs-code
  contradictions (15, incl. stale CLAUDE.md facts) listed in Part 33 /
  D2 E.7 - NOT fixed, per the discovery-only order.
- Stage 1 REVIEW REMEDIATION LANDED (2026-08-09, adversarial review vs
  blueprint; all 12 findings fixed, none parked): partner block-finished
  milestone re-keyed to awaitingDecision && weeksOverdue===0 (was dead on
  the retired 'complete' string; mock re-anchored + overdue regression
  pin); ActiveWorkoutScreen banner/targetReason say "Block finished" not
  a live "Recovery week" (prescription behaviour unchanged);
  MesocycleBuilderScreen plan card + ActiveMesoDashboard gain finished
  state; blockAdvisor buildNextBlockRecommendation is phase-aware (no
  "After your recovery week" once it has passed) and the 'adjust' CTA is
  honestly "Restart this programme" until Stage 6 restores "Continue
  with adjustments" WITH the behaviour; PlansScreen threads the tapped
  recommendation (intent) into handleRestartPlan -> activatePlanWithBlock
  ({ ledger: null }) with logInfo observability (the live Stage 6 seam);
  INSERT pin widened to OR-variants (3 sites incl. insertMesocycleFromCloud,
  sync mirror of the user's own action); { wrap:false } documented as
  schedule-bound (no production callers; block code uses getBlockStatus);
  stale JSDoc/comments updated (mesocycle, planSwitch, blockAdvisor);
  WorkoutSummary celebration fires only at the completion moment (not
  every limbo session), drops the false "sensible progressions" promise,
  and aligns naming to "Block finished"; CoachOutput training card
  explains WHY applies are unavailable when the block is finished;
  HomeBlockShapeSheet gains a "Choose your next block" CTA (routes to
  Plans). New pins: BlockShapeCard.finished render+call-site suite,
  widget gatherWidgetInputs behavioural pin, sheet CTA tests.

### D89 comprehension-and-trust + design-consistency remediation (2026-08-06) — ALL WAVES LANDED to main (d251f50d)
- Source of authority: `docs/audit/comprehension-trust-audit-2026-08-06.md`
  (all 61 findings, rulings, wave plan). Register entry: D89.
- W1 (19 copy-truth fixes) LANDED to main this session with re-anchored
  shareWins/PartnerScreen copy pins. Founder veto point flagged: the
  Calmer-coaching "safer calorie floors" claim was corrected to truthful
  copy (T18/T19) — copy only, no safety behaviour touched.
- W2 LANDED (lanes A1/A2/B + lead review corrections: time-based
  detectPhase, Class B neutral phase chip). W3 LANDED (lane C + lead:
  T1 widget streak via high-water mirror, T7+O16 calendar-week
  convergence, T11, T13, T15 science layer wired + guard suite, T16,
  T17 quiet hours + soft notification title, T3, T4, O4, O34 with the
  wizard-header exception documented inline).
- DESIGN lanes D1+D2 LANDED (111 of 113 deviations fixed or verified
  already-resolved; recorded exceptions: EmptyExerciseView, YouScreen
  error banner, O33 layout, CVD info-hue follow-up).
- NO CHANGE recorded: O33 NotificationSettings layout (deliberate
  exception, revisit post-release).
- DESIGN CONSISTENCY (founder push 2026-08-06, "ensure every page on the
  app has a consistent design"): full 9-agent per-screen audit COMPLETE,
  89 surfaces matrixed, 113 deviations, all ruled — source of authority
  `docs/audit/design-consistency-audit-2026-08-06.md`. Fix lanes D1
  (screens A-M + components) and D2 (screens N-Z + settings) dispatch
  after lane C lands; three C-owned files excluded from D lanes. One new
  recorded exception: ActiveWorkoutScreen's EmptyExerciseView (twins the
  live-session chrome). Recovery path: re-run the doc's deviation list
  per lane.

_Reconciled 2026-07-11 (D46 boundary): D42 AppAlert, logged-set row, D44
auto-advance cues, summary footer, picker first-open, CP-10 batch F and the
leg-day engine work (D45 + D46) all LANDED - detail rolled to
`_HANDOVER-ARCHIVE.md` TASKBOARD HISTORY per D41._

_2026-07-12 night: iOS TestFlight emergency session (founder live on build
40) LANDED TO MAIN same night on founder order - startup crash-loop (iOS
long-press menu removed, D77.1), food-seed + importer + libraryDelta
transactions onto the app-wide queue (D77.8), check-in nudge trust fix
(D77.9), tab bar restored to stock geometry (D77.3), progress-scan TFLite
model v2 (D77.2, WATCH first fast_tflite traffic), Apple sign-in error-1000
remedy copy (D77.5), expected-offline Sentry demotion (D77.4). Main
commits `deded3e`, `852cd17`, `44dc987`, plus the raw-BEGIN sweep landing
after. Full rulings: DECISIONS register D77. Requires a fresh EAS build on
BOTH platforms - nothing here is OTA-carryable._

### D43 logger redesign blueprint - APPROVED + IN BUILD (D49/D57) (2026-07-11)
- Research complete (Opus teardown: full ActiveWorkoutScreen read, all
  pinned tests mapped, Hevy corpus synthesised - report in session
  log). Blueprint authored by the lead:
  `docs/ux-world-class-audit-2026-07-09/D43-LOGGER-REDESIGN-BLUEPRINT.md`
  - the 3/10 is presentation/IA/cohesion, not capability; strong core
  preserved behind a new shell; 5 staged slots (S1 decomposition -> S2
  Now card + status strip -> S3 stable CTA + overflow diet -> S4
  in-place edit + plate readout -> S5 cohesion polish). RPE stays out
  per D14/D19 held list. S4 = in-place edit ONLY (plate readout DROPPED,
  D57).
  - S1 slice 1 LANDED (`31b14a7`): LoggedSetRow + EmptyExerciseView
    extracted, guards re-pinned, suite green.
  - S2 LANDED (`ca9bb87`): "N notes" accordion -> StatusStrip
    (content-labelled chips); Now card onto house Card (radius lg/16);
    orientation+target folded to one Line 1; note-pencil corner
    affordance; chrome above inputs 8 -> 2 lines. Beat line KEPT as a
    compact row (ruling D58 - carries the cue/range/deload variants that
    input placeholders can't; SetEntry contract untouched; founder
    device-walk taste veto at S5). eslint clean; 15 suites / 126 tests
    green.
  - S3 LANDED (`567c073`): stable dual CTA (Log set stays put; Next
    exercise / Finish workout appears BESIDE it at target, no
    same-pixel swap; promoted "Log another set" retired). Overflow
    trimmed 11 -> 7: Move up/down deleted (Reorder sheet is the one
    path; dead handlers removed), note row -> S2 card pencil, Exercise
    info -> tap the exercise title. Guided warm-up ramp KEPT its row
    (ruling D59 - the set-type picker can't reproduce the computed
    ramp; warm-up-as-a-type is still in the picker). 3 guard suites
    re-anchored, no pin removed. Lead-verified green: 15 suites / 124
    + full src/screens 132 / 1013.
  - S4 LANDED (`335ad64`): edit a logged set IN PLACE - tapping a row
    (or Edit from its menu) expands it into an inline SetEntry editor
    with Save/Cancel, the edit modal removed; one editing slot so a
    second row collapses the first. Save/Delete reuse the existing
    handlers unchanged, so the PR-re-eval-on-edit/delete contract holds
    (prReEval.guard passes unmodified); SetEntry untouched; plate stays
    dropped (D57). Lead-verified green: 15 / 125 + full src/screens
    132 / 1014.
  - S5 BUILT (`bf72c51` token polish + `4e02f9b` house numeral role on
    the logged numerals): the surface was already largely tokenised by
    S1-S4 (no hard-coded colours, haptics on the shared vocabulary), so
    S5 was small. Three flagged design calls ruled in D60: logged-row
    radius KEEP dense (data receipt, not cards), beat-line line-height
    KEEP tight, type.num() APPLIED to the logged numerals. Lead-verified
    green throughout.
  - S5 REVIEW DONE (`49d56db` + `b7b6761`): the mandated Opus fresh-eyes
    adversarial review of the full S1-S5 arc returned NO blocker/high and
    cleared it as safe for the device walk. Four minor findings triaged
    (D61): L2 stale comment + N1 per-keystroke re-render FIXED; L1 (invalid
    past-target tap flipped the CTA mode early) FIXED per founder GO (arm
    moved into handleCompleteSet's success path); M1 (inline-editor keyboard
    occlusion on small Android) -> device-walk verify item below. Full
    suite green: 689 suites / 8513 tests.
  - **D43 LOGGER REDESIGN IS CODE-COMPLETE.** Only two things remain, both
    the FOUNDER's: (1) the 10/10 device walk (blueprint Section 9), and
    (2) migrations when ready.
    DEVICE-WALK ITEMS (blueprint Section 9 + review):
    - Section 9 steps 1-10 (the 10/10 walk).
    - M1 verify: edit the LAST logged set in a long session on a small
      Android phone -> confirm the inline Save button is not hidden behind
      the keyboard.
    - Taste-veto decisions open to the founder: D58 (beat line kept as a
      compact row, not dissolved into input placeholders), D59 (guided
      warm-up ramp kept its overflow row), D60 calls 1-2 (logged rows kept
      dense; beat-line line-height kept tight).

### LANDED - CP-10 theming batch G, BOTH LANES (2026-07-11)
- Lane 2 (20 plain screens) `3adf551`; lane 1 (15 high-risk screens;
  SettingsDietary already live) `4947509`. Billing/consent/ED bounds
  held byte-identical, verified at lead review; guard suites
  re-anchored contracts-unchanged; batch flip-tests added; full suite
  685 suites / 8,480 tests green at the lane 1 boundary. Screen
  coverage now ~83/84 live (remaining static count to be re-verified
  at the next recon; stage-5 restart-prompt retirement unlocks at
  zero).
  Stage 5 landed `3d3eae8` (restart prompt retired - CP-10 COMPLETE).
  Manrope adopted `9148a6f` (D50 landed; Inter files removed).

### HELD (D57) - D43 full-app pristine pass (founder, second amendment)
- CLOSING PHASE by founder order: every area polished to the
  pristine/world-class bar, cohesive (one-amalgamated-application
  mandate), using the SCORECARD-2026-07-10 rubric as the baseline
  instrument. Runs AFTER the defect fixes, the engine verdict, the
  remaining theming batches and the logger redesign, so it polishes
  finished surfaces. Lead-driven; founder holds taste vetoes.
- On hold per founder 2026-07-11 (rework risk vs work already done).

### PRODUCTION CRASH TRIAGE - Sentry TypeError (2026-07-11, gated on connector)
- Sentry alert (email screenshot): TypeError "undefined is not a
  function", production, 02:14:15 UTC 2026-07-11, event
  a82ce651514f4a9085a0e3540b6e17bf, during the founder's live session
  on build 2608. Minified Hermes stack; lead symbolication from the
  run-2608 APK bundle narrowed the offset to RN's
  RefreshControl/ScrollView bytecode region BUT Hermes dedupes
  identical function bodies, so the offset is not uniquely
  attributable. NEXT STEP (blocked): founder enables the Sentry
  connector for this chat (connected at org level, enabledInChat
  false) -> pull the event's remaining 13 frames + breadcrumbs ->
  attribute and fix. CI note: android build workflow archives no
  sourcemap - queue a workflow tweak to save the Hermes map artefact
  so future crashes symbolicate exactly.

### OPEN - EAS (APK) build failing after native changes (founder report) PAUSED by founder 2026-07-11, revisit later.
- Founder reports the EAS build FAILING after item 14/15 native changes
  (keyboard-controller/zeego, expo-splash-screen, monochrome icon). CI
  Android build is GREEN (run 2611), so the break is EAS-specific.
  NARROWED (2026-07-11): `npx expo prebuild --platform android` runs
  CLEAN on this branch locally, so it is NOT a config-plugin/prebuild
  failure (the haptic-feedback class) - the break is downstream in the
  EAS Gradle/native compile stage or EAS environment. STILL BLOCKED on
  founder: share the EAS build logs (or grant EAS access); then
  diagnose + fix.

### LANDED - SD-11 applyRemoteSetEvent idempotency `7e0dabe` (2026-07-11)
- The await-spanning race fixed hands-on: eventId reserved
  synchronously before the DB await, released on failure so retries
  stay possible. Two new tests pin the mid-await race and the
  failure-release path. Store suites + lint green.

## 2. QUEUED (build slots - two agents at a time, lowest capable tier)

### SCAN-ACC-1: Progress Scan accuracy round (founder order 2026-07-13 "when I next do a round of fixes I want it improved")
- **Source:** D85 (decisions register) + paired telemetry evidence in `scan_calibration_events` (iOS row a5aad947 vs Android 89/91 rows): waist reads match cross-device; gap is the shoulder read (shoulderToHeight 0.291 iOS vs 0.311 Android) driven by smaller body-in-frame (bodyAreaRatio 0.133 vs 0.143-0.152) eroding shoulder pixels at 256px.
- **CURRENT STATE:** iOS orientation fixed and device-proven (D85); iOS scores ~6-8 pts under Android on the same body; founder accepts as indicator for now.
- **END STATE (all deterministic, platform-shared, no AI):** (1) two-pass zoom analysis - segment person bbox, re-run segmentation on the person crop so the body gets the model's full 256px at any camera distance; (2) decode/resample normalisation across platforms (recorded D84 RISK); (3) P3->sRGB colour normalisation on iOS (D84 RISK); (4) median-of-three-frames per pose (same frames -> same result, determinism intact); (5) side-pose nudge (prediction on record: lifts moderate->high confidence); (6) cross-device calibration pass from accumulated clean telemetry.
- **ELEVATES BECAUSE:** direct founder order; accuracy is the product's headline promise and the telemetry now proves where the error lives.
- **Bounds:** engine stays pure/deterministic; ED-safety untouched; guard test on extractRgb (pure-CG) must stay green; both native modules change in lockstep or not at all.
- **Recovery path:** all evidence and analysis recorded in D85; paired rows queryable by platform in scan_calibration_events.

### CP-10 screen theming - remaining batches (F onward)
- **Source:** `CP-10-restart-free-theming-plan.md`; D16, D24, D29; handover THEMING COVERAGE TRACKER.
- **CURRENT STATE:** components 105/110 live; screens 37/85 live at batch E close (48 static remain); the stage-5 honesty gate (retiring the restart prompt) stays blocked until a toggle's full dependency set is live.
- **END STATE:** every screen live-themed, stage-5 cleared so restart-free theming ships fully with no stale surfaces.
- **ELEVATES BECAUSE:** the theme toggle becomes genuinely live and complete - no static islands, no restart, honest stage-5 retirement.
- **Bounds:** batch pattern as D/E; ProGate/tier logic untouched; frozen static stylesheets stay byte-identical unless converted.

### QUEUED - DECISION ROUNDS (await founder input or assets; do NOT build until resolved)
_These are open decision forks, not dispatchable builds. Their elevation is
conditional on the decision; recorded here so they are visible, not lost._

- **Watch-app scoping round.** Source: D27 (watch app SCOPING approved); `docs/ux-world-class-audit-2026-07-09/watch-app-scoping-memo.md` (5 founder questions at the end, unanswered); handover AWAITING FOUNDER. CURRENT STATE: no watch app exists; HealthKit is removed; the scoping memo is written with 5 questions open, plus a side-finding (SD-11 idempotency defect in `applyRemoteSetEvent`) flagged must-fix-before-wrist-traffic. DECISION NEEDED: founder answers the 5 questions before any build brief. ELEVATION: deferred - cannot be claimed until the scope is set. PAUSED by founder 2026-07-11.
- **Brand font - REVERTED to Inter on founder verdict (Manrope backed out); D50 closed.**

---

## 3. FOUNDER-SIDE OPS (not agent work - only the founder can do these)

- **COMMUNITY (2026-09-06) - four actions, in order.** (1) Say "run
  against production" for migration 160 (`supabase/migrate_160_community.sql`)
  and the deploy of `community-notify` and `community-public`; Claude
  runs them and re-verifies read-only. Until then every Community read
  fails as "unavailable" and the screens show their calm error state with
  Try again (the Volyume library tiles still render). (2) Give the go for
  an Android build from main, then walk the sixteen-step device checklist
  in `30-BLUEPRINT.md` section 12 with two test accounts. (3) Decide on
  image upload (posts and photo avatars): it needs an image-moderation
  processor with an EU residency check and a data-processing agreement,
  which is a new dependency and a new data category; not built (SD-12).
  (4) Migration 155 becomes applicable once a build WITHOUT Partners is
  in users' hands (README note). Also: the three link pages carry the App
  Store id placeholder until the iOS app is on the store.
- **NOTE, NOT A DEFECT (2026-08-18) - Android App Links are not verified,
  and that is fine.** Recorded so nobody "fixes" it again. The served
  assetlinks.json carries one fingerprint (the upload key) where the
  template has two slots, so Android does not auto-open
  https://volyume.app/partner/<CODE> in the app. That is NOT a broken
  feature: per src/lib/partners/link.js, the web link is DESIGNED to land
  on the web/ page that states the derived-signals-only promise and links
  to the store, for a partner who does not have the app yet, and
  parseInviteCode accepts the volyume:// scheme link, the web link, or a
  bare code typed or pasted. Partner invites work today and always have.
  Adding the Play app signing SHA-256 (Play Console -> Test and release ->
  Setup -> App signing) would only add the convenience of an already
  installed user's https link opening the app directly. Worth doing
  eventually, worth nobody's time now. Raised on 2026-08-18 as a "live
  defect" purely from the fingerprint count, before reading how invites
  actually work; that framing was wrong.

- **OPEN (2026-08-18) - DELETE THE iOS PROVISIONING PROFILE. One click,
  blocks every iOS build.** Build iOS (EAS) #146 failed at signing:
  `Provisioning profile "*[expo] app.volyume AppStore
  2026-06-10T11:35:55.490Z" doesn't support the Associated Domains
  capability`. `ios.associatedDomains` was added on 2026-08-11 (fc08bd1e)
  and EAS enabled the capability on the App ID, but it REUSES the stored
  profile, which predates the capability. This is the same GOTCHA already
  recorded in build-ios.yml's header from 2026-06-10. No code change fixes
  it and there is no non-interactive EAS flag (D111-3).
  FIX: expo.dev -> Account `volyume` -> Project `volyume` -> Credentials
  -> iOS -> `app.volyume` -> App Store -> **delete the Provisioning
  Profile**. KEEP the Distribution Certificate (serial
  4C11E6AEB51102841B0A3D62B64FDA85) - deleting that one is the damaging
  mistake. Then re-run Build iOS (EAS); it mints a fresh profile carrying
  Associated Domains and Push Notifications.
  Repeat this whenever a future app.json change adds an iOS capability.

- **CLOSED (2026-08-18) - the API-36 release is LIVE on Play** (founder
  confirmed). Detail kept for the record. Was:** Build Android run **3359** on main (354bc2cb) went
  green end to end at targetSdk 36, including the release-signing check
  and the 16 KB native-library page-size gate. Download
  **`volyume-release-aab-3359`** from
  https://github.com/allansdouglas1983-cmyk/ADPhysique/actions/runs/32128221878
  and upload it to Play. It carries versionCode **3359** (the workflow run
  number, set by the Set Android versionCode step), not 31 - that jump is
  expected and permanent; Play only requires the number to increase. Hard
  deadline: updates submitted on or after **2026-08-31** are rejected
  below API 36, so this upload cannot slip past that date. NOTE: this AAB
  predates any founder device walk of today's landings, so walk it from
  the matching APK (`volyume-release-apk-3359`) before promoting it
  beyond internal testing.

- **NEW PRODUCT WORK (2026-08-18, from D111-1) - Android large-screen
  layout.** The founder ruled to ship API 36 with NO resizability
  opt-out, so from the next release Android 16 ignores the portrait lock
  on displays >= 600dp: tablets and unfolded foldables render all 82
  screens in landscape at tablet width, which the app has never been laid
  out for. Phones are unaffected. This is accepted, known breakage, not a
  defect report - but it is now real outstanding work and should be
  scheduled as its own campaign.


- **STILL BLOCKED after Campaign 15: deploy the `partner-cheer` Edge
  Function.** Retried at the start of C15 and the reason is now precise:
  the Supabase connector is authorised at ORG level but is toggled OFF for
  this chat (`enabledInChat: false`), so no Supabase tool loads and there
  is no deploy path at all. There is also no Supabase CLI in the
  environment. FIX: enable the Supabase connector for the session in
  claude.ai connector settings, or deploy it yourself with the command
  below. Details unchanged:

- **C14-J4 BLOCKED: deploy the `partner-cheer` Edge Function.** Campaign 14
  made the recipient's partner-cheer opt-out real by enforcing it
  SERVER-side: the function now reads the recipient's own
  `notification_preferences` row and downgrades to in-app only when it
  says `enabled = false`. The code is on main
  (`supabase/functions/partner-cheer/index.ts`), pinned by
  `src/lib/notifications/__tests__/campaign14.categoryOwnership.test.js`.
  NO MIGRATION IS OUTSTANDING - the table (044) and the `partner_cheer`
  category (125) have been in production since 2026-07-27, and the client
  already pushes the row. Until the function is redeployed, the toggle
  silences the local path only and a partner's cheer still pushes.
  EXACT ACTION: `supabase functions deploy partner-cheer` (needs the
  auto-populated SUPABASE_URL + SERVICE_ROLE_KEY + ANON_KEY).
  Why Claude did not do it: the Supabase connector is not authorised in
  this session, so there was no deploy path and no way to verify against
  production. Verification once deployed: with two paired test accounts,
  switch partner cheers OFF on the recipient, send a cheer from the
  other device, and confirm the response is `{ ok: true, delivered:
  'in_app' }` with no push on the recipient's phone; switch it back ON
  and confirm the push arrives.

- **H4 IS NOW A PRODUCT-TRUTH RELEASE BLOCKER (elevated by the
  Campaign 5 order, 2026-08-10).** The published Play/App Store
  listings still promise cardio logging, which no longer exists. The
  repo does not own the authoritative listing source; only the founder
  can clear this. EXACT ACTION BEFORE ANY RELEASE: in Play Console
  (Store presence → Main store listing) and App Store Connect (App
  Information / version metadata), remove every cardio-logging claim -
  the stale lines are enumerated in docs/PLAY_STORE_LISTING.md
  (:41,:44,:56,:149,:202-203 area) and
  docs/APP_STORE_CONNECT_LISTING.md (:326 area) - and BOTH Data
  Safety / privacy declarations must drop cardio as a collected data
  type. The in-repo source docs carry STALE-ON-CARDIO banners and must
  be refreshed before pasting.
- **CAMPAIGN 4 (2026-08-10) — update the published listings and rule on
  the FR-C4 items.** Full detail per item:
  `docs/coherence-cleanup-2026-08-10/D95-RULINGS.md` (founder-items
  section).
  - **H4 — published listings still promise cardio.** Cardio logging is
    removed from the app; the Play Store / App Store Connect listings
    (and any live marketing copy sourced from them) need the cardio
    lines removed. The repo source docs now carry STALE-ON-CARDIO
    banners; only the founder can edit the consoles.
  - ~~FQ-6.3 console check~~ CLOSED 2026-08-10: the founder confirmed
    (repeated confirmation) that the 7-day introductory offer exists
    in BOTH consoles - 14 days free in-app, then the first 7 days of
    a store subscription free through Apple and Google. The in-app
    copy stands. Recorded permanently in docs/rules/billing.md so it
    is never re-asked. (H4's cardio listing edits remain open.)
  - FR-C4-1 cardio export coverage · FR-C4-2 notification-pref
    dual-family drift · FR-C4-3 adaptation_events restore path ·
    FR-C4-4 CALC-5 law vs live computeSetTargets · FR-C4-5 partner
    telemetry catalogue · FR-C4-6 notification category derivation
    gaps · FR-C4-7 progress-photo capture-weight gating
    (ED/privacy-adjacent) · FR-C4-8 check-in reminders have no off
    switch despite the locked unsubscribe ledger · FR-C4-9 root
    billing.md/styling.md/watermelon.md and settings.json misnamed
    rules files presenting stale law under config names (rename
    needs founder knowledge of local hook wiring) · FR-C4-10 the
    public/app-map pages are a stale June audit report still published
    (refresh or unpublish) · FR-C4-11 activitySteps.js and the engine's
    steps lever are retained-dormant (zero production callers /
    stepsEnabled:false at the only call site) - revive or retire is a
    product call · FR-PW-1 peak-week retirement design.
  - Data note for FR-C4-1's cluster (Review A): with cardio push
    removed, a cardio row logged offline and never synced before the
    app update cannot reach the cloud and is lost at sign-out (rare;
    recorded on H1). A one-shot drain is a small follow-up if wanted.
  - FR-1..FR-5 (Campaign 3) remain open and unchanged.

- ~~RUN MIGRATIONS 129 + 130~~ DONE 2026-08-06: both applied to
  EU-Dublin by Claude on founder GO and verified (deload_week column +
  comment present -- pre-flight showed the column already existed, the
  Wave-2 "no cloud column" note was stale, so no build-ordering risk ever
  existed; anon-executable SECURITY DEFINER functions 34 -> 0 with
  authenticated access preserved). Nothing blocks the next build.

### CLOSED (2026-07-27) - FULL migration sweep: production is COMPLETE

Founder: "Run all non applied against production there might be more." Swept
every one of the 125 repo migrations against the ACTUAL production schema, not
against the migration history (the history only starts at 101 - everything
before that was applied outside the runner, so it can never answer this).

Method: extracted every object the migrations create - 55 tables, 121 columns,
46 functions - and checked each one for existence in production.

**Result: ZERO missing. Zero tables, zero columns, zero functions.** Every repo
migration is applied. Constraint-only changes were checked separately, since an
object sweep cannot see them: migration 059's numbered meal-slot CHECK is live
(`meal_[0-9]+` present in the pattern), so it is applied despite the CLAUDE.md
header still listing it as HELD - another stale note, like the "116 with
117-128 pending" one.

**Migration 049 is correctly NOT applied and must stay that way.** It drops
`peak_week_plans`, and its own header says "This is a DRAFT. Do not apply yet.
Client-side cleanup required first", listing five client changes that must land
first (sync.js `_pushPeakWeekPlans`, database.js CREATE TABLE and the
deleted_at step, the drift-audit expected set, migration 025's DELETE branch).
Verified: the table still exists. Applying it now would break sync. NOT applied.

### OPEN (2026-07-27) - hardening, NOT a live hole, needs founder sign-off
Ran Supabase's own security advisors while connected. **No ERROR-level findings.**
97 WARN/INFO, of which one class is worth a decision:

**34 SECURITY DEFINER functions are executable by the `anon` role.** I checked
the two that carry no `auth.uid()` guard, because those are the ones that could
matter, and BOTH are safe in effect:
- `apply_founder_pro_entitlement(_user_id, ...)` - gated on the allow-list
  `private.is_founder_pro_user(_user_id)`. An anon caller passing an arbitrary
  UUID gets `founder_pro: false`. It cannot grant Pro to anyone not already
  entitled, so there is no free-Pro path.
- `cascade_advance_due_users()` - takes no parameters and only DOWNGRADES users
  whose trial has already expired. An anon caller can only do what the
  scheduled worker already does. It cannot upgrade anyone.

So: no privilege escalation and no data exposure. It is still poor posture that
`anon` can reach them at all. Revoking `EXECUTE FROM anon` is the fix, but these
are TIER/BILLING functions and CLAUDE.md Section 2 requires explicit founder
permission before any billing change - so I have not touched them.
**Founder: say the word and I will revoke anon EXECUTE on the tier/billing RPCs.**

Also WARN, judged intentional, no action taken: three always-true INSERT
policies (`marketing_waitlist`, `marketing_survey_responses`,
`scan_calibration_events`) - all deliberately anonymous-insert surfaces; 15
functions with a mutable `search_path`; one public storage bucket allowing
listing; and Supabase's leaked-password protection being off.

### CLOSED (2026-07-27) - migrations 119 and 125 APPLIED
Founder authorised: "Yes run 119 and 125 against production". Both applied
through the Supabase connector and verified against production afterwards.

- **119 (lock direct client writes)** was ALREADY applied on 2026-07-12, but
  outside the migration runner, so it never showed in the cloud history and the
  file read as pending for two weeks. Re-running it was a no-op; it is now
  recorded in the history so this cannot mislead again. Verified: all four
  write policies absent, no INSERT/UPDATE/DELETE for `authenticated` on
  partnerships, no INSERT on engine_telemetry or consent_log, and the
  partner_weekly_intentions UPDATE policy carries the hardened
  active-pair-membership qual. Checked and NOT a hole: `authenticated` still
  holds UPDATE/DELETE grants on engine_telemetry and consent_log, but RLS is on
  and neither table has an UPDATE or DELETE policy, so RLS denies both.
- **125 (notification category CHECK)** genuinely was pending. Applied.
  Verified the CHECK now admits 'planned_meal_confirm' - the category whose
  23514 rejection failed the entire preference push every sync and blocked
  sign-out behind "Sync incomplete" - and carries all 23 categories. The list
  was diffed against CATEGORY in src/lib/notifications/categories.js before
  applying: 23 for 23, no drift in either direction.

**Every repo migration is now applied to production.** No pending schema work.

### (superseded) OPEN (2026-07-27) - DECISION NEEDED: apply migrations 119 and 125?
Production migration history was checked directly this session. The old
"production is at 116, 117-128 pending" note was WRONG: 117, 118, 120-124,
126 and 127 are all applied (under drifted names). Migration 128 was applied
this session on your "run against production".

Two repo migrations are genuinely NOT applied and NOT authorised:
- `migrate_119_lock_direct_client_writes.sql`
- `migrate_125_notification_preferences_category_full_enum.sql`
Your authorisation was given in the context of the App Review accounts, so I
have not touched these. Say "run against production" again naming 119 and 125
if you want them applied.

### OPEN (2026-07-27) - Apple App Review accounts: DELETE AFTER REVIEW
Both accounts are live in production now. Rollback SQL is in the header of
`supabase/migrate_128_apple_review_accounts.sql`. Run it once review completes;
they are not meant to live indefinitely.

### OPEN (2026-07-27) - CLAUDE.md wording lags a founder decision
Section 2 says share cards never include bodyweight, with ONE approved
exception (the Pro before/after card). The weekly recap card is a SECOND
approved exception - you ruled it on 2026-06-22, recorded verbatim at
`src/lib/shareCard/greatWeek.js:13-19`. The code is correct and stays as is;
the constitution's sentence needs a one-line correction to match. Flagged
rather than edited, because Section 2 is yours.

### OPEN (2026-07-27) - share-card canvas format question
The share-card audit recommends retiring the 1:1 square canvas for 4:5, which
is the largest ratio Instagram renders without cropping and would remove the
dead space on story cards. I have NOT changed it: it is a product decision
about what users are already sharing, not a defect. Want it changed?

### OPEN (2026-07-27) - SUPABASE_DB_URL secret still empty
`deploy-migrations.yml` still cannot run (five consecutive failures at step 1).
Not blocking any more - cloud work now goes through the Supabase connector -
but worth adding in repo Settings -> Secrets and variables -> Actions so the
workflow survives as a fallback.


- **App Store Connect IAP check (VOLYUME-17, founder said "tomorrow" on
  2026-07-12).** Two things: (1) Business/Agreements shows the Paid
  Applications agreement ACTIVE with banking + tax complete; (2) the app's
  Subscriptions show `pro_monthly` + `pro_annual` in "Ready to Submit"
  with prices set. IAP works in TestFlight sandbox once these are green -
  "only TestFlight" is not the cause, and it will not self-fix at release.
  If both are already green, report the subscription states back and the
  lead digs into the code path (billing gate applies). Source: D77.6.
- **Fresh EAS iOS build + crash-fix device walk (2026-07-12 session).**
  Bump the build number; nothing from the session is OTA-carryable. Walk:
  cold-launch x4 (no crash-loop), tab bar flush on BOTH devices, progress
  scan (Sentry diagnostic should read engine: fast_tflite, no new
  VOLYUME-1F), tap a logged set -> edit sheet with delete on iOS
  (long-press menu is now Android-only - amend walk item 14 accordingly),
  fresh-profile check-in nudge stays quiet inside the 5-day baseline,
  Apple sign-in on the founder device. Source: D77.
- **iOS Live Activity provisioning.** App Groups provisioning on BOTH App IDs (`app.volyume` + `app.volyume.widget`, then EAS credentials re-sync) + fresh EAS build. The Live Activity is ALREADY fully wired in code (item 19, `60190a7` docs-only fix). Source: D27; handover item 19.
- **Fresh EAS build (device-walk gate).** Required before device-walking this branch: native modules/code landed this campaign (keyboard-controller + zeego + peers, expo-splash-screen, themed monochrome icon, D34 Kotlin rest-timer bridge, react-native-haptic-feedback). CI Android build is GREEN (run 2611, `3daa3ae`) but a signed EAS build must still be produced. Source: handover FOUNDER-SIDE ACTIONS.
- **Play OAuth SHA-1 confirm.** Source: CLAUDE.md status banner; handover.
- **Run `refresh-off-snapshot.yml`.** Lands OFF branded micronutrient data into the bundled snapshot (the operational remainder of item 16). Source: D26/D37; handover.
- **migrate_117 apply.** Telemetry-view REVOKE (drafted + committed `653fe32`); needs the exact phrase "run against production", then re-verify grants and update the file header + `supabase/README`. Source: handover AWAITING FOUNDER; CLAUDE.md supabase rules.
- **Device-walk backlog.** The fresh EAS build carries a large walk backlog: item 6 (max system font), item 13 (photo gallery), item 14 (keyboard/zeego + set-row menu), item 20 (drag reorder), weigh-in edit/delete, dietary needs, vitamins/micros, haptics, next-exercise reorder, bottom sheets, Help/FAQ, live theming, and VERIFY the timeline diary reverted to meal cards. Full step-by-step checklists are in the handover (and its archive) per item. Source: handover FOUNDER-SIDE ACTIONS + per-item checklists.

---

## 4. HELD / NEVER RE-PROPOSE (visible in one place - do NOT build or re-surface)

- **Exercise media programme (#18)** - HELD, founder not funding it now (D14 assessment; D29 STILL HELD). Do not re-propose.
- **Rest-day notification (#22)** - HELD (D17 FQ-1 option 3; D29 STILL HELD). Recorded gated copy/trigger for if it ever unblocks; do not build.
- **Plate calculator** - REJECTED, moot for UK users (D14 assessment). Do not re-propose.
- **Paywall social proof (review excerpts)** - NO, stays dark (D14 assessment). Do not re-propose.
- **RPE/RIR reinstatement** - settled-removed; the effort picker stays out (D14; D19 addendum re-affirmed). Do not re-surface.
- **Flat timeline food diary** - built and REVERTED on the founder's device verdict; meal cards are canonical. NEVER re-propose (D37 item 15).
- **Supabase migrations 049 / 059** - HELD (CLAUDE.md status; `supabase/README`). Do not apply.
- **AI-assisted food input (photo meal-scan / voice)** - HELD by founder order, not rejected and not approved; do not build or re-propose unprompted (D27 addendum). (The coaching engine's no-AI rule is separate and absolute.)

---

## 5. NEEDS JUSTIFICATION - do not dispatch (D38: missing a verifiable field)

### Kala namak micro-call - RESOLVED (D52, 2026-07-11)
- Ruled KEEP with a sourcing note on the tip copy; detail in the
  decisions register. No open items remain in this section.

---

## Appendix - folded-in / reference-only sources (not build queues)

- Landed-item history: `docs/ux-world-class-audit-2026-07-09/_HANDOVER-ARCHIVE.md`
  (TASKBOARD HISTORY section) + the handover stage log.
- `docs/exercise-planning-2026-07-09/` (plans A-G): all SHIPPED; retained as
  design reference only. Do not rebuild. Residual engine changes go through the
  register + D37/D38 triage.
- `docs/design-usability-audit-2026-07-09/`: D7 programme complete; only
  `coverage-00-SYNTHESIS.md` survives as a cited reference. Residual IDs are
  tracked in the live campaign, not re-mined from that folder.
- CAMPAIGN 1: PRODUCT INTEGRITY (2026-08-10, founder order) - COMPLETE,
  merged to main at 0a552cc4 the same day; 11-item handover delivered.
  Scope: integrity/safety/privacy/state ONLY; cardio permanently out of
  scope (D92-1). P0 verification vs main: P0-1 planned-volume restore
  gap CONFIRMED+FIXED (pull now lands in the PRIMARY table, LWW by
  updated_at, provenance rides via migrate_132 with column-tolerant
  push, legacy rows degrade to research+template, unknown muscles
  skipped; mirror no longer written - dead, for the dead-code
  campaign); P0-2 privacy pref sync CONFIRMED+FIXED (excluded both
  directions, read-failure fails telemetry closed, migrate_133 cleanup
  written); P0-3 allergen stamp CONFIRMED+FIXED (tracked field +
  staleness notice via planConflictsWithExclusions + rebuild CTA,
  D92-2); P0-4 joint/soreness unknown-vs-no CONFIRMED+FIXED (gather
  nulls, runner passthrough, check-in tri-state, D92-3); P0-5 meal
  reminder restore CONFIRMED+FIXED (re-lay in restoreNotifications,
  key single-owner); P0-6 FFM floor divergence CONFIRMED+FIXED
  (canonical resolveFfmFloorWeightKg, both sites, D92-4). Pins:
  campaign1.integrity.test.js (30) + syncPrefExclusions extension.
  MIGRATIONS WRITTEN, NOT RUN (founder-gated): migrate_132 (provenance
  columns; not a hard release gate - push is column-tolerant),
  migrate_133 (privacy row cleanup; hygiene), migrate_134 (stale-write
  triggers on the nine unguarded coaching-state tables; client pushes
  are honest-timestamp as of this campaign, so safe to add).
  P0-7 SWEEP: 61 paths inspected, 14 permissive-default defects ALL
  FIXED (workout-summary default-writing root cause; intake-read floor
  bypass; unknown-sex floor; check-in counter resets; deload-signal
  dilution; scoff/profile fail-closed; session-adjustment and advisor
  read failures; null-profile meal planning refusal; 7 defect-encoding
  test pins re-anchored with rulings named). P0-8 AUDIT: 15 defects -
  14 FIXED (mesocycle/programme/routine/coach-output/nutrition-target/
  body-profile LWW appliers, honest push timestamps, null-ledger push
  omission, RIR-ladder-preserving week pulls, goal-lock round-trip,
  landmark + wellbeing pull guards with the CALM RATCHET D92-7, 41
  two-device applier simulations), 1 FOUNDER QUESTION (D92-11:
  ed_pattern_flags never pushed - open flag does not reach a second
  device; wiring the recorded raise-only design transmits Article 9
  data, so founder's call). Residuals recorded in D92-10, never
  silently parked. ADVERSARIAL REVIEW (fresh eyes, the founder's ten
  questions): 17 findings - 3 blockers (engine-layer permissive
  defaults defeating the D7 fix; the meal-log reminder as the one
  food-adjacent notification with no ED gate, now gated at schedule AND
  delivery; the planned-volume restore truncating at PostgREST's
  1000-row cap) + 6 defects + 5 gaps + 3 nits - ALL ACTIONED, incl.
  the calm ratchet failing closed on read errors, honest edit-time
  provenance for guarded prefs carried through pulls, the week applier
  LWW gate (D92-10(c) withdrawn as wrong), one canonical sex-floor
  statement across all three restatements, deterministic one-row-per-
  week coach-output identity (local v71 + migrate_135 written,
  founder-gated), and the diet axis in the meal-plan staleness notice.
  Q3 (privacy) and Q10 (cardio scope) passed outright. Final pins:
  campaign1.integrity 51 + campaign1.syncConflict 41. Suite 9,681
  passing / lint clean at landing.
  RECOVERY: reports in session scratchpad map/ (C1P07/C1P08/
  C1REVIEW); code on claude/campaign1-integrity; D92 is the spec.
- CAMPAIGN 2: COMPREHENSION, EXPLANATION AND TERMINOLOGY (2026-08-10,
  founder order) - COMPLETE, merged to main the same day; final
  handover delivered in chat. Full record: docs/
  comprehension-audit-2026-08-10/ (CAMPAIGN-LOG, PHASE1-CLASSIFICATION,
  PHASE2-TERMINOLOGY-CANON, PHASE9-15-RULINGS) + D93 in the register.
  Residuals for later campaigns recorded in D93 addendum item 5.
  Originally opened as: IN FLIGHT on branch claude/campaign2-comprehension
  (from main 0a552cc4).
- CAMPAIGN 3: DISCOVERABILITY, SETTINGS AND EXISTING-FEATURE UX
  (2026-08-10, founder order) - COMPLETE, merged to main the same day;
  36-item handover delivered in chat. Full record:
  docs/discoverability-audit-2026-08-10/ (seven files) + D94 in the
  register. FIVE FOUNDER RULINGS OPEN (FR-1..FR-5 in
  SETTINGS-OWNERSHIP.md). Campaign 4 list carried in the same folder.
  Originally: IN FLIGHT on claude/campaign3-discoverability (from
  main 9aae57cb).
- CAMPAIGN 4: WHOLE-PRODUCT COHERENCE, LEGACY/DEAD-CODE CLEANUP AND
  PRODUCT-BOUNDARY CLOSURE (2026-08-10, founder order) - **COMPLETE,
  merged to main 2026-08-10** (record:
  docs/coherence-cleanup-2026-08-10/ - CAMPAIGN-LOG.md,
  D95-RULINGS.md, PHASE-30-GATES.md, eight AUDIT files; register D95;
  founder-side items in §3 above; STOPPED after Campaign 4 per the
  order). Originally: IN FLIGHT on
  claude/campaign4-coherence (from main 92b9644e). Purpose: make the
  shipping product and the live repository agree. Core law: DELETE
  ONLY WHAT YOU CAN PROVE IS DEAD OR OUT OF SCOPE (A-I classes; zero
  callers alone is never sufficient); never delete historical user
  data because a feature is gone; a removed feature must leave no
  product promise behind. CARDIO LOGGING: current founder ruling, NOT
  part of Volyume - complete boundary closure (UI/routes/toggle/copy/
  engine deps removed non-destructively; historical data preserved
  under export/delete contracts; permanent boundary guard) while
  steps/general-activity and strength-to-health integrations are
  DIFFERENT live concepts and must survive. PEAK WEEK: legacy-load-
  bearing, migration 049 stays HELD, no casual cleanup. 30 phases:
  reachability map, cardio closure (2A-2D), Campaign 3 deferred items,
  dead engine functions / copy generators / modules (behavioural laws
  move to live code BEFORE dead tests die), dark flags/rollback seams
  (ONBOARDING_QUIZ_FIRST + PRO_BETA_ACTIVE + USE_FOREGROUND_SERVICE
  presumed intentional), travel mode, peak week, two-family sync
  (no wholesale consolidation), stale routes, dead pref keys,
  FR-1..FR-5 carried NOT resolved, duplicated calculations (one
  mathematical truth), comment/doc truth with authority chain, stale
  SQL snapshots, test truthfulness, telemetry catalogue, subscription
  truth, export/delete coverage for retired data, deep links/
  notification destinations, cross-feature coherence,
  campaign4.boundaries.test.js, tombstone guards, THREE adversarial
  reviews (reachability / boundaries / repository truth), quality
  gates with before/after censuses. HARD CONSTRAINTS: migrations
  132-135 unrun + 049 held; no destructive migration without founder
  ruling; no EAS; D92-11 unaltered; billing untouched; ED semantics
  untouched; deterministic no-AI coaching intact; STOP after
  Campaign 4 (no onboarding restructuring, no long-term-user work).
  40-item final handover.
- CAMPAIGN 5: FIRST-USE, ONBOARDING AND FIRST-BLOCK JOURNEY
  (2026-08-10, founder order) - COMPLETE 2026-08-11, merged to main.
  All 45 phases delivered; FQ-1..FQ-8 founder rulings integrated;
  Reviews A (10 findings), B (5 defects + 9 latents), C (9 findings)
  actioned; Phase 41 synthetic journey + Phase 45 release-truth audit
  landed; gates green (full suite, lint, campaigns 1-5, jargon,
  identity). State: docs/first-use-audit-2026-08-10/CAMPAIGN-LOG.md;
  rulings D96 (D96-RULINGS.md + DECISIONS-2026-07-09.md); H4 remains
  the founder-side release blocker (§3). The 64-item final handover
  was delivered in-session per the order.
  Original order (for the record): NOT a feature campaign: make INSTALL → ACCOUNT
  → CONSENT → SETUP → FIRST PLAN → FIRST WORKOUT → FIRST WEEK → FIRST
  CHECK-IN → FIRST RECOVERY WEEK → FIRST BLOCK COMPLETION → FIRST
  PERSONALISED NEXT BLOCK exceptionally clear. Three first-use laws:
  MINIMUM REQUIRED INFORMATION MAXIMUM EARLY VALUE (every input
  classified A-H: A required-before-safe-use, B before training
  prescription, C before nutrition prescription, D deferrable
  personalisation, E optional, F state-gated, G advanced-never-first-
  use, H legacy); DO NOT TEACH THE PRODUCT BEFORE USE (do → see
  result → explain when relevant); NO FALSE PERSONALISATION (research
  + profile day 1; learning claimed only when history exists -
  Campaign 2 provenance laws). 45 phases: journey map from code,
  entry/account, Article 9 comprehension (never weakened), wellbeing/
  calm first-run, profile input necessity matrix, goal-vs-phase
  comprehension, Free/Pro paths + trial/paywall comprehension (billing
  LOCKED - copy conflicts STOP for founder), units timing, first plan/
  block/home/workout/progression/PR/summary/feedback, first week +
  missed week, first check-in, first Pro nutrition week, weigh-in
  habit, first recovery week, block completion, personalised next
  block, repeat-vs-adjust, permissions timing, notifications, 
  interrupted onboarding, back navigation, Free/Pro first month,
  experienced + novice lenses, empty states, copy density, visual
  hierarchy (no redesign), onboarding analytics (NO new telemetry by
  default), ONBOARDING_QUIZ_FIRST stays off with rollback infra
  intact, campaign5.firstUse.test.js matrix, synthetic end-to-end
  first user + variants, THREE adversarial reviews (brand-new user /
  interruption-state / experienced user), release-truth audit (H4
  stays tracked until founder action). HARD CONSTRAINTS: no AI, no
  cardio, no new social/gamification/training/nutrition scope, no
  advanced controls in first use, Article 9 + ED safety + D92-11
  untouched, billing untouched, no auto block creation, migrations
  132-135 + 049 unrun, no EAS, STOP after Campaign 5 (no
  returning-user work). 64-item final handover.
  RECOVERY: order verbatim in session scratchpad
  c5-CAMPAIGN5-ORDER.txt; campaign docs in
  docs/first-use-audit-2026-08-10/ (CAMPAIGN-LOG.md = running state);
  rulings register as D96.
  RECOVERY: order verbatim in session scratchpad
  c4-CAMPAIGN4-ORDER.txt; campaign docs in
  docs/coherence-cleanup-2026-08-10/ (CAMPAIGN-LOG.md = running
  state); rulings register as D95. Objective:
  every EXISTING meaningful feature and behaviour-changing control
  discoverable at the moment of need, WITHOUT clutter, a settings
  dumping ground, duplicated controls, new scope, AI search/chat, or
  permanent visibility for contextual features. Three laws:
  discoverability is not visibility (A-G classification per control);
  ONE OWNER PER SETTING (one canonical editor; contextual shortcuts
  link, never fork state); surface controls at the point of
  consequence. 25 phases: rebuild the live settings inventory (do not
  trust the map's 98/93/14 counts), ownership audit (writers/readers/
  stale state), settings IA, re-audit the 14 hard-to-find controls,
  training/nutrition/notification discoverability, control-gap
  rulings (A fix / B document / C defer / D founder), contextual
  shortcuts with navigation pins, hidden-gesture audit (no important
  action gesture-only), state-gated feature audit, advanced controls,
  searchability-without-search, units/display, partner, privacy/data,
  tier discoverability, empty states as discovery, first-time vs
  experienced, setting side-effect truth pins, no duplicated control
  state, dead-code recorded for Campaign 4 (surgical fixes only for
  visible defects), campaign3.discoverability.test.js, two
  adversarial reviews (normal user + power user/state truth),
  product-boundary review. HARD CONSTRAINTS: migrations 132-135
  unrun; no EAS; D92-11 unaltered; cardio permanently out (its
  absence is NOT a discoverability problem); Campaign 1 integrity +
  Campaign 2 comprehension suites stay green; D93 terminology canon
  binding; founder rulings recorded, never inferred from residue;
  STOP after Campaign 3 (no Campaign 4, no broad dead-code cleanup).
  36-item final handover required.
  RECOVERY: order verbatim in session scratchpad
  c3-CAMPAIGN3-ORDER.txt; campaign docs in
  docs/discoverability-audit-2026-08-10/ (CAMPAIGN-LOG.md is the
  running state); rulings go to the register as D94. Objective: an ordinary user understands what is
  happening, why, what it means for them, what happens next, and whether
  it is automatic / a proposal / their choice - without jargon, internal
  classifier names, matrices or thresholds. Three design laws: explain
  the CONSEQUENCE not the algorithm; never explain more than the engine
  can prove (degrade honestly, silence beats invention); progressive
  disclosure (surface line / optional why / methodology). 21 phases:
  comprehension audit (A-H classification of ~40 concepts vs map D1
  Part E), terminology canon (19 collisions incl. the four "volume"
  senses - UI vocabulary only, no engine/DB symbol renames), PR
  definition + first encounter, training-block mental model (no
  "mesocycle" in prose), reps-short-of-failure effort model, readiness
  purpose-at-point-of-asking, learned-personalisation copy from real
  provenance (never "optimal volume"; never MEV/MAV/MRV/Block Ledger),
  recovery/deload explanation (exact sets useful, no strain maths),
  ~20 unexplained coach decisions classified, nutrition WHAT/WHY/NEXT
  incl. the displayed-EWMA-vs-decision-trend honesty fix, consistent
  "we don't know yet" language + the not-changing-is-a-decision
  principle, automatic-vs-proposal-vs-choice audit, progress-metric
  honesty, safety copy audit (language only), glossary classification
  (31 entries, 6 orphaned), first-encounter rule, accessibility
  comprehension, voice/jargon-blocklist audit, reuse of the existing
  explanation architecture (one rationale source of truth), test-driven
  comprehension pins, two adversarial reviews (novice + truth). HARD
  CONSTRAINTS: migrations 132-135 stay UNRUN; no EAS builds; D92-11
  behaviour unaltered; no new cross-device sensitive-data paths; cardio
  permanently out of scope (D92-1); Campaign 1 pins stay green; STOP
  after Campaign 2.
  RECOVERY: campaign evidence in session scratchpad c2/ ; spec is the
  founder's Campaign 2 order (2026-08-10 chat) + this block; code on
  claude/campaign2-comprehension; rulings go to the D-register as D93.

## CAMPAIGN 7 (2026-08-11) — release readiness. Branch claude/campaign7-release-readiness off main 80ff8191.
Order: 90 phases, docs under docs/release-readiness-2026-08-11/, five adversarial
reviews, 1-124 handover. NO production actions of any kind. Recovery path for all
agent lanes: each writes ONLY its named docs; on death relaunch from the phase
list; lead lands all findings hands-on. Ledger: CAMPAIGN7-COMPLIANCE-LEDGER.md.

## CAMPAIGN 17B (2026-08-14) — food logging, search & personal nutrition UX. LANDED on main.

Branch `claude/codebase-audit-docs-pv6mjd`, merged to main at `6908c839`. Eight
jobs, all delivered through a real app path (the founder's completion law:
module exists != delivered). Commits, oldest first:

- `34828346` saved meals and recipes are first-class plan candidates (job 3)
- `16ab3a70` meal-count habit is ASKED, never silently applied (job 4)
- `1720a872` the plan explains itself from stamped reason codes (job 5)
- `9e8376ee` calorie bank comprehension copy + real-value receipt (job 6)
- `56c55e33` Food Insights coverage honesty + "so what" lines (job 7)
- `6908c839` one "don't suggest" instruction, obeyed everywhere (job 8)

Earlier jobs 1-2 (personal search ranking, fast repeat logging + serving
memory) landed in the same sequence before `34828346`.

New modules: `src/lib/food/insights.js`, `habits.js`, `mealRationale.js`;
`searchTabs.js` gained the personal-match merge. New suites:
`insights.test.js`, `calorieBankUx.test.js`, `coherence.test.js`,
`habits.test.js`, `mealRationale.test.js`, `searchPersonal.test.js`,
`personalMealsFirstClass.test.js`.

Gates at landing: `npm run lint` clean, `npm test` 904 suites / 11,821 passed
(1 suite + 10 tests skipped, pre-existing), identity invariant clean.

**MIGRATIONS 137 / 138 - STATUS UNKNOWN, NOT "not applied".** Both are
authorised ("run against production") and both are applied LOCALLY (`v75`,
`v77`). Their production state is **UNKNOWN**: no session since they were
authored has had the Supabase connector attached, and the founder performs
production migration work outside these sessions. The `-- Applied remotely: NO`
line in each file header was written when the file was AUTHORED and is a
statement of intent at that moment, not a verification - it must not be read
as evidence of the current production state, and no session should turn a
missing connector into a claim of non-application. Verify with the connector
before acting. `049` stays HELD; never apply it.

## CAMPAIGN 18 (2026-08-14) — whole-athlete coaching intelligence. PART-LANDED on main.

Branch `claude/codebase-audit-docs-pv6mjd`, rebased onto `7a618d70` and merged
to main at `c05d7e86`. Commits, oldest first:

- `1d7199ed` coachContext + coachPrecedence: one shared reading of the evidence
- `26809d4b` the two "do not judge a plan that was not run" gates
- `e61c834b` coachStory: the week as one account, on CoachOutputScreen
- `c05d7e86` seven longitudinal athletes A-G

**LIVE with production consumers:** jobs 1, 2, 3, 4, 5, 8, 10, 11, 12, 14, 16,
17, 18. New modules `src/lib/coachContext.js`, `src/lib/coachPrecedence.js`,
`src/lib/coachStory.js`. Consumers: `weeklyCoach.runWeeklyCoach` (all five
return paths carry `context` + `limiters`), `blockAdvisor.buildProgrammeReview`,
`programmeEpoch.slotVerdict`, `blockReview.proposeNextBlock`,
`CoachOutputScreen` (renders the story).

**PHASE E/F COMPLETED 2026-08-14 (see the Campaign 18 closeout block below).
The list that follows was the state at the part-landing and is superseded.**

**WAS NOT DONE at the part-landing:**
1. Job 6 recovery-consumer trace (interBlock, blockLedgerGather, blockSeed vs
   the weekly card) - scope LANGUAGE is delivered, the consumer trace is not.
2. Job 7 broader weight-evidence audit. The four roles are documented in
   `coachContext.js`; the product-wide trace for conflicting "latest weight"
   definitions has NOT been run.
3. Job 9 release/tombstone trace for explicit user choices.
4. Job 13 meal builder <-> nutrition target chain.
5. Job 15 planned != eaten re-verification across domains.
6. Job 19 notification/attention policy.
7. Job 20 systematic adversarial pass over every new user-facing claim.
8. Elite-coach scorecard (founder addendum 2026-08-14) - 18 dimensions.
9. Outcome follow-up (elite-coach bar item 11): previous coaching decisions
   becoming evidence for future ones. NOT BUILT. `coachOutcome.js` and
   `coachLedger.js` exist and were not assessed this session.

**Test-only by design (audited, none product-critical):** `contextFacts`,
`conflictOutcome`, `storyLines`, `volumeIsUserManaged`. Their underlying
behaviour is live via `buildCoachContext` / `classifyLimiters` /
`chooseInterventions`; these four are inspection helpers. No Campaign 18
symbol is DEAD or COMPUTED-BUT-DISCARDED.

**Known unrelated flake:** `src/lib/widgets/__tests__/storage.test.js`
("never touches the iOS bridge on Android") fails roughly one full-suite run
in three under parallel load and passes 6/6 in isolation. Reproduced on the
pre-Campaign-18 tree; not caused by this work. Not fixed - out of scope.


## CAMPAIGN 18 CLOSEOUT (2026-08-14) — phases E and F. LANDED on main at `791de30e`.

- `4655bdaa` outcome follow-up: intervention records, five outcome states,
  anti-oscillation
- `b09daa7f` jobs 6/7/9/13/15/19 traced and pinned; two real defects fixed
- `791de30e` job 20 adversarial pass; three real defects fixed

New module `src/lib/coachIntervention.js`. Consumers: `CoachOutputScreen`
(writes the record on both Apply taps, reads it back before the run, renders
the outcome line), `weeklyCoach.runWeeklyCoach` (anti-oscillation gate).

**Job 19 ruling: NO NEW NOTIFICATION REQUIRED.** `WEEKLY_COACH_READY` already
covers both the weekly review and the block review, and nothing Campaign 18
built schedules anything of its own. Pinned in `coachMealChain.test.js`.

**Renamed:** `coachStory.buildWeeklyStory` -> `buildCoachStory`, because
`src/lib/weeklyStory.js` already owns that export name for the four-chapter
WeeklyStoryScreen recap.

Gates at closeout: lint clean, identity invariant clean, full suite
**917 suites / 12,190 passed, 10 skipped, 0 failed**.

## CAMPAIGN 20 (2026-08-16) — live set prescription & progressive overload intelligence. PHASE 1 COMPLETE; ALL FOUR RULINGS RESOLVED same day — DESIGN LOCKED (verdict A), Phase 2 ready.

**Founder rulings 2026-08-16 (binding, verbatim record in
`docs/live-prescription-campaign-20-2026-08-16/FOUNDER-RULINGS-2026-08-16.md`):**
(1) prefill = B-plus; (2) mid-session adds = overshoot only, AMENDED: no add
under deload/recovery, re-entry easing or active readiness reduction (senior);
(3) advance window = one session; (4) tier = ungated. Phase 2 implements per
design doc §19 staged order.

Phase 1 was AUDIT + RESEARCH + DESIGN ONLY — no production code touched, no
migration, per the campaign brief. Baseline traced: main `9816b601`.

- Deliverable: `docs/live-prescription-campaign-20-2026-08-16/CAMPAIGN-20-PHASE-1-DESIGN.md`
  (22 sections: full A–G production trace, authority map, laws A–H rulings,
  resolver design, 46-scenario matrix, implementation + test plans).
- Evidence appendices (same folder): `EVIDENCE-SCIENCE.md` (primary-literature
  sweep, per-claim SUPPORTED/INFERENCE/UNSUPPORTED tags),
  `EVIDENCE-COMPETITORS.md` (Hevy/Strong/Alpha/KeyLifts/RP/Boostcamp/Fitbod/
  JuggernautAI, vendor-verbatim; no binaries examined).
- Verdict: **A — design locked** (was B at authoring; the founder resolved all
  four §21 rulings the same day — see the rulings block at the top of this
  entry).
- Key trace findings now on record: no live next-set prescription exists in
  production (setTargets computed once per exercise load, never updated from
  today's sets); computeSetTargets' target weights render almost nowhere; the
  ordinal "Set 3 = 75 forever" teaching lives in the Last-session reference
  row + ghost + per-ordinal targets; five competing authorities incl. dead
  `getProgressionSuggestion` and unit-blind `stalledAdvice` +2.5 literal.
- Phase 2 (implementation) COMPLETE and LANDED on main (2026-08-16, same
  day). Three lead-reviewed stages: `d9f8d105` resolver module + 121-test
  contract; `4d1f0274` logger wiring (live first-set + next-set
  re-resolution, override authority, provenance line, six mounted
  scenario tests, three guard re-pins); `5ebaae41` authority retirement
  (computeSetTargets, getProgressionSuggestion, getBestAnchorSet,
  prefillRepsForTarget, applyReadinessToTargets all deleted with
  grep-proofs; laws migrated onto the resolver suites; FR-C4-4 closed) +
  Stage 15 restore/replay pins with one directly connected defect fixed
  (stale ghost after edit/delete) + lead draft-restore fix. Final full
  suite at landing: 952 suites / 12,733 tests, 0 failures. KNOWN FLAKE
  (pre-campaign, recorded): src/lib/widgets/__tests__/storage.test.js
  fails order-dependently in some full parallel runs, passes 4/4 in
  isolation, reproduced on the pre-campaign baseline; needs its own
  session. Founder device retest of the new prescription flow is the
  outstanding action (checklist in the Phase 2 handover message).

## CAMPAIGN 21 (2026-08-16) — coach decision-graph validation & whole-athlete scenario matrix. COMPLETE, LANDED on main.

Founder order 2026-08-16 (validation + repair, no new features). Branch
`claude/campaign21-coach-validation` off main `c6eb3cf2`. Fable leads;
sonnet traces/oracles/reviews; haiku expands mechanics. Campaign folder:
`docs/coach-validation-campaign-21-2026-08-16/` (decision graph, ledger,
oracle, coverage). LANDED same day: 113 production rules mapped and
oracle-locked; ~250 whole-athlete scenarios + boundary/temporal/property/
restraint/suppression/persistence suites through 23 real seams; FOUR
production defects found and fixed (EWMA same-day double-learning in both
engines, future-dated rows passing two past-only windows, non-numeric
planned_sets junk); hostile review closed (matrixDeload gate, bulk
branches, banking ED-gate behavioural coverage, persistence proofs);
strict coverage gate green with ONE named explained residue (U-AUTH-01
round trip, fix recipe documented in the gate file). Final full suite
968 suites / 13,187 tests, zero failures. FOUNDER-SIDE OPEN ITEMS:
(1) T-RECOVERY-05 evaluateAutoReg/predictDeloadWeek dead-code candidate,
D37 triage; (2) the ED detector's positional weeklyHistory contract
(architecture note, single verified caller, no change made); (3) the
known widget-storage full-run flake (pre-Campaign-20, still intermittent,
needs its own session).

## CAMPAIGN 24 (2026-08-17) — WHOLE-APP UX/LOGIC/PRESENTATION COHERENCE SWEEP. COMPLETE, MERGED TO MAIN.

**VERDICT A.** All seven waves + cohesion pass + hostile review (7
confirmed findings, all closed) landed same day. Register acceptance:
81 screens, 61 NO_CHANGE_REQUIRED / 24 IMPLEMENTED / 1
FOUNDER_ACCEPTED / 0 UNREVIEWED. Zero founder rulings needed
(FOUNDER-RULINGS.md + D100). Final gates: lint, tsc, check:imports,
diff-check all clean; definitive full suite 993 suites / 13,435 tests,
zero failures. Full handover:
docs/whole-app-coherence-campaign-24-2026-08-17/FINAL-LANDING.md.
FOUNDER-SIDE OPEN: DEVICE-CHECKLIST.md (26 checks, aeroplane-mode
startup first) + the three standing prior-campaign walks.

Founder order 2026-08-17. Branch `claude/campaign24-whole-app` off main
`e5319811`. One programme: register reconciliation → waves A-G (each
audits AND implements, committed per wave after lead review) → global
cohesion pass → hostile review → full gates → ONE merge to main.
Constraints: ActiveWorkout FOUNDER_ACCEPTED (no deep reaudit);
Home/Progress reference baselines (no IA reopen); C20/C21
authoritative; near-zero founder interruption (undecidable forks go to
FOUNDER-RULINGS.md, work continues). Campaign folder:
docs/whole-app-coherence-campaign-24-2026-08-17/. RECOVERY PATH: the
board + CAMPAIGN-24-OVERVIEW.md + FINDINGS-LEDGER.md carry live state;
each wave commits when green so a dead session resumes from the last
wave commit on the branch; uncommitted wave work is lead-reviewed
against the wave's ledger entries, landed or relaunched.

## CAMPAIGN 23 (2026-08-17) — UX/presentation, screen 2: Progress. PHASE 1 (AUDIT) COMPLETE — TWO FOUNDER RULINGS OPEN.

**AUDIT LANDED** same day. NO production code touched (src/ diff vs
main empty, verified). Deliverables in
docs/progress-audit-campaign-23-2026-08-17/: ELEMENT-INVENTORY.md,
FORYOU-AUTHORITY-TRACE.md, METRICS-AND-SHARE-TRACE.md,
PHOTO-SCAN-CHAIN-TRACE.md, and PROGRESS-UX-SPEC.md (the authoritative
34-section audit/spec). Master screen register created:
docs/ux-screen-programme-2026-08-17/SCREEN-UX-REGISTER.md (80 screens;
Analytics AUDITED; next-screen recommendation: ActiveWorkout).
VERDICT B. Headline findings: the "For You" feed is a live second
progression/programme authority (4 stale-authority defects incl. a
contradiction of C20's founder-ordered senior gate and missing ED/calm
suppression) — retired in the spec; hierarchy inverted (workload
headline, answer buried); two week definitions on one screen; PR count
inflates without dedup; photo→coach chain is verdict B BY DESIGN (D18
render-time-only corroboration, no photo-derived data ever synced).
FOUNDER RULINGS: ANSWERED AND LOCKED same day (R1 derived signal only;
R2 connect the bounded corroboration to the authoritative run) —
verbatim in FOUNDER-RULINGS-PHASE2.md; D99 + privacy-law amendment
D99-3 in the decisions register. PHASE 2 IN FLIGHT on
`claude/campaign23-progress-impl`. STAGE 1 LANDED `1c84531c`
(lead-built hands-on, safety-adjacent): coarse photoCorroborationBasis
feeds runWeeklyCoach; engine-internal direction classification against
its own trend; one-step rule under the senior blocked-set; D18
render-time overlay retired; no photo-derived flags persist; guards
re-pinned to D99. Gates: lint 0 warnings; full suite green except the
KNOWN pre-existing widget-storage flake (passed the prior full run and
passes isolated; still queued for its own session). STAGE 2 LANDED
`b8347c55` (lead-reviewed; one lead amendment: the Visual pillar
copy's false 'since <month>' anchor removed — the baseline date is
not carried by the bounded summary, so the claim now cites the
comparable-scan count; the agent's four flagged calls ruled and
recorded in the commit body, incl. volume strip stays tier-unchanged
per the senior CLAUDE.md free list). Gates: lint 0 warnings; full
suite green (one appearance of the documented widget-storage flake on
an identical-tree rerun, passes isolated — both outcomes on record).
STAGE 3 LANDED (this commit): §23 A-P mounted state matrix + guards
(density ceiling, suppression seniority, single CTA, For You absence
with legacy rows). The matrix caught a real §15 defect — the Body
pillar's hard-coded kg/week rate for lbs/stone users — fixed at the
lead review (formatBodyWeightRate, units.js) and re-pinned. CAMPAIGN
23 COMPLETE, MERGED TO MAIN. Final gates: lint 0 warnings, 978 suites
/ 13,344 tests, zero failures. FOUNDER-SIDE OPEN: the 12-step Android
device walk (PHASE2-LANDING.md; ED/calm cases steps 9-11). Recorded
for later sessions: WeightTrendCard's sibling kg literal (BodyMetrics
detail); user_insights still in legacy sync though unwritten;
prBars/computePRsPerWeek + buildWeeklySessionCounts now
production-unreferenced (future dead-code sweep); the widget-storage
flake session.

Founder order 2026-08-17. Fable lead; sonnet for authority tracing;
haiku for mechanical inventory; no Opus; NO IMPLEMENTATION this phase.
Branch `claude/campaign23-progress-audit` off main `4aa39c6f` (docs
only). Deliverables: the 34-section Progress audit/spec in
docs/progress-audit-campaign-23-2026-08-17/ and the permanent master
screen register docs/ux-screen-programme-2026-08-17/
SCREEN-UX-REGISTER.md. Screenshot evidence: no image files supplied in
the environment — the brief's own transcription is the screenshot
record, and nothing beyond it may be claimed. Key laws: Progress is a
summary + evidence surface, never a second progression/coaching engine
(C20 resolver and C21 graph are the authorities); Progress Photos are
a core differentiator whose photo→coach chain must be PROVEN, not
assumed. RECOVERY PATH: docs-only branch; if the session dies, land or
relaunch from the last pushed commit on this branch; no production
code may have been touched (verify with git diff --stat against
4aa39c6f -- src/).

## CAMPAIGN 22 (2026-08-16) — UX/presentation, screen 1: Home/Today. PHASE 2 LANDED ON MAIN 2026-08-17.

**COMPLETE.** All three stages lead-reviewed and landed (0deb5ff4 /
56782be2+D98 / b23bd9d6), full gates green at every landing (final:
973 suites / 13,268 tests), merged to main 2026-08-17. Landing record
+ 15-step founder device checklist:
docs/home-today-ux-campaign-22-2026-08-16/PHASE2-LANDING.md.
FOUNDER-SIDE OPEN: the Android device walk (ED cases steps 12-14).
Historical in-flight detail below rolls to the archive at the next
sweep.

Founder order 2026-08-16 (full brief received after an initial truncated
send). Branch `claude/campaign22-home-today-audit` off main `624cf126`.
NO production code touched. Deliverables in
docs/home-today-ux-campaign-22-2026-08-16/: STATE-INVENTORY.md (21
sections, 47 axes, ~120 strings), STATE-MATRIX-AND-DENSITY.md (18
material states, 4 collisions, 7 duplications, one MEASURED copy
contradiction: readinessSummary vs recoveryState wording in the same
render), and HOME-TODAY-UX-SPEC.md - the 25-section authoritative spec.
Verdict B: three founder rulings open (R1 weight row below hero; R2
redesigned first-review readiness line returns; R3 everyday trial
presence leaves the top slot). Phase 2 implements only after the
rulings. Startup auth-hydration flash: recorded as a SEPARATE bounded
task (spec section 21), still pending since the input-focus campaign.
PHASE 2 (2026-08-16): all three rulings answered YES and locked
(FOUNDER-RULINGS-PHASE2.md). Implementation branch
`claude/campaign22-home-impl` off main `3ab82c4b`+rulings-commit.
Stages: (1) TodayLine component + P1 slot arbitration + banner-idiom
unification + recovery single-wording-source fix; (2) weight row below
hero (R1) + first-review readiness line (R2) + trial rehome (R3) + hero
merge + footer discipline; (3) guards + 18-state mounted suite + gates
+ merge. Commit per stage, lead review every diff, merge when green.
STAGE 1 LANDED `0deb5ff4` (lead-reviewed, lint 0 warnings, full suite
970 suites / 13,224 tests green): todayLineArbiter.js (8-rank pure
resolver) + TodayLine.js + HomeScreen banner unification +
readinessSummary gatedRecoveryState wording-source fix +
recoveryWordingSource.test.js + 12 guard re-pins. NOTE: Stage 1 retires
the everyday trial card from Home but its You/Profile rehome is Stage
2 — branch must NOT merge to main until Stage 2 lands the rehome (the
gap would ship). STAGE 2 LANDED `56782be2` + D98 rulings `f66131e8`
(lead-reviewed with three lead amendments, recorded as D98-1..3 in the
decisions register: the missing §17 R4 rank-4.5 conflict-day fallback
built in full; first-review-line suppression widened to the You tab's
full edSuppressed formula, source-pinned; rehomed trial card's S3 tap
retargeted to the Today Start hero). Gates: lint 0 warnings, full
suite 971 suites / 13,241 tests green. The trial rehome is now IN,
so the merge blocker above is cleared once Stage 3's gates pass.
STAGE 3 IN FLIGHT (guards + 18-state suite + merge + handover).
RECOVERY PATH: uncommitted work lead-reviewed against
HOME-TODAY-UX-SPEC.md sections 13/17/20 + the rulings file; land or
relaunch from last green commit (`0deb5ff4`). Preservation contract
(spec section 20) is binding: no engine, tier, trial-logic or
safety-gate changes.

## CAMPAIGN 25 (2026-08-17) — Plans screen hierarchy redesign. COMPLETE, MERGED TO MAIN `36389c80`.

Founder order: active-plan hero stays primary; previous plans collapse
to compact rows; plan tools rise above history; no capability removed.
Spec + diagnosis: docs/plans-screen-campaign-25-2026-08-17/
PLANS-SCREEN-SPEC.md (Section 1 carries a landing correction note on the
pre-campaign hero/block-card order, ruling D101-1). Built by a sonnet
agent against the spec, lead-reviewed hands-on; new
PlansScreen.hierarchy.guard.test.js pins the section order, collapsed
default, deleted-folder fallthrough and tier logic; AX-11 sibling law
re-pinned for CompactPlanRow. Rulings D101-1..3. Gates at landing: lint
clean, full suite 994 suites / 13,455 passed. Device checklist:
docs/plans-screen-campaign-25-2026-08-17/DEVICE-CHECKLIST.md (12 checks,
founder walk pending).

## CAMPAIGN 26 (2026-08-17) — founder device-order batch: Today, logger, Progress. COMPLETE, MERGED TO MAIN.

Nine direct founder device orders landed same-day (register D102; the
first three merged earlier as `a02afeb8`/`0040997f`/`16cd167b`):
NowCard accent gone; Progress tonnage landmark gone (share budget on the
landing now ZERO; tonnageMilestone.js production-unreferenced, left in
tree); "Visual" pillar renamed "Progress photos" with honest empty-state
copy; Diary macros-guide row gone; Today greeting gone; hero chip
default now "On track for this block." (D102-3); logger workspace
cleared - no standing effort line, no in-card coach note (D102-4,
reverses C20 Stage 11 presentation on founder order; prescriptions
unchanged; explanations stay on-demand in the adjustment/readiness
sheets); exercise-header ellipsis chromeless with full 44dp target;
Progress pillar text wraps instead of truncating (D102-5); and the
restored since-check-in evidence pane (D102-1/2): EvidencePanel +
resolveEvidencePanel replace the C22 FirstReviewLine (deleted with its
resolver/test; honest-denominator + D98-2 suppression pins re-anchored
into HomeScreen.todayLinePresentationGuards, never lapsed), weigh-in
strip renders only while unlogged, logged weight is a quiet tick row.
Branch claude/campaign26-home-logger-progress. Device checklist:
docs/home-logger-progress-campaign-26-2026-08-17/DEVICE-CHECKLIST.md
(15 checks, founder walk pending). Known flake: widget-storage suite
under the parallel run (passes isolated; recorded residue).

## CAMPAIGN 27 (2026-08-17) — responsive display consistency. PROPOSAL APPROVED IN FULL (D104) — PHASE 2 IN FLIGHT.

Founder question: text/layout renders very differently 17 Pro Max vs
S22+, worse on smaller screens; research how mobile apps achieve
consistent display and propose a solution (Progress was the proven case,
now fixed by wrap; the class remains). Phase 1 is RESEARCH + PROPOSAL
ONLY - no production code. Two read-only agents (opus codebase sizing
audit; sonnet industry-practice research), lead synthesis to
docs/responsive-display-campaign-27-2026-08-17/PROPOSAL.md.
RECOVERY PATH: agents are read-only; if either dies, relaunch from this
entry's brief summary - no tree state to recover. Implementation only
after the founder chooses among the proposal's options.

**C27 Phase 1 landed 2026-08-17.** Both agents reported (sonnet
audit + sonnet research, per the founder's low-tier order); lead
synthesis in docs/responsive-display-campaign-27-2026-08-17/
(PROPOSAL.md + AUDIT-FINDINGS.md + RESEARCH-FINDINGS.md). Founder
ruling D103 recorded (text-size law open). BLOCKED ON: the three
choice points in PROPOSAL.md section 4 (EP-14 amendment shape, narrow-
device bucket, phasing). No production code until answered.

**C27 Phase 2 opened 2026-08-17.** All three choice points approved
(D104). Order: 2a wrap-first sweep of the AUDIT-FINDINGS top-15
register (sonnet agent, lead review); 2b central cap table + Settings
copy + guard rewrite (lead hands-on); 2c narrow bucket in resolveTheme
(lead hands-on); 2d Maestro net. RECOVERY PATH (2a): agent works on
branch claude/campaign27-responsive-research, never commits; on death,
lead-review the working tree against AUDIT-FINDINGS.md section 4 and
PROPOSAL.md Pillar A, then land or relaunch.

**C27 Phase 2a LANDED 2026-08-17.** Wrap-first sweep of the top-15
register (sonnet agent, lead-reviewed): sentence clamps removed on the
Home coach line, TodayStrip explainer, plateau/activation banners,
Diary planned-hint, onboarding outcome chips and the trial banner; hero
session name widened to three lines; SettingRow gained minWidth:0;
identifier clamps verified honest (food/plan names, logged-set rows,
PeekMenu titles). Plus D105: logger exercise name title->bodyStrong.
Report-only residue for 2b: SetEntry label column (chrome cap),
MacroRings kcalPlanned numeral cap, PeekMenu subtitle latent-truncation
doc note. NEW PHASE 2e QUEUED (D105): type-role adoption sweep of the
~177 hand-rolled size sites, after 2b/2c so it normalises onto the
finished system. Gates at landing: lint clean, full suite 994 suites /
13,463 passed.

## CAMPAIGN 28 (2026-08-17) — founder device tweaks, third batch. COMPLETE, MERGED TO MAIN.

Evidence pane: no coach-voiced title in any state (D106-1), food
adherence row (D106-2). Logger: name/dots true centre line + details
chevron affordance (D106-3). C27 Phase 2b PAUSED and banked per D106-4
- board status: 2b/2c/2d/2e HELD until the founder resumes next week;
the campaign branch fails Chip.a11y BY DESIGN until then, do not merge
it. Gates: lint clean; full suite green (known widget flake only).

## CAMPAIGN 29 (2026-08-17) — competitive complaint-research triage. COMPLETE (D107) — two build specs queued for next session.

Founder supplied a deep-research report (competitor complaint corpus,
17 fitness apps) and asked what, if anything, Volyume should implement
NOW. Phase 1: two read-only sonnet agents verify the report's claims
and P0/P1 recommendations against the ACTUAL tree (the report's
"product map" input may be stale); lead triage to
docs/complaint-research-triage-2026-08-17/TRIAGE.md. No production
code without founder answers. RECOVERY PATH: agents read-only; on
death relaunch from this entry. C27 2b/2c/2d/2e remain PAUSED (D106-4).

## CAMPAIGN 30 (2026-08-17) — share-card elite revamp. SPEC COMPLETE (D108) — build queued next session.

Founder order: complete revamp - cards "don't work well at all, look
dull, data doesn't fit, not attractive or share worthy"; target = as
good and appealing as competitors. Phase 1 now: two read-only sonnet
agents (share-system inventory; competitor share-card research), lead
design spec to docs/share-cards-campaign-30-2026-08-17/. Build next
session with the C27 resume + D107-2 specs. GDPR share-card law binding
throughout (no name/bodyweight/measurements/notes; Pro before/after
exception only). RECOVERY PATH: agents read-only; relaunch from this
entry on death.

## CAMPAIGN 30/31/32 BUILD BATCH (2026-08-17) — share cards, injury constraints, load semantics. COMPLETE, ALL ON MAIN (2026-08-18).

All three landed in the founder's order, merged to main continually:
- **C30 share cards**: renderer rebuild (847ab8af, sonnet agent + two
  lead render-review fixes: the "0m" TIME box now hidden below one
  minute, and a bright-TOPPED photo scrims from the top - the sampler
  reports the top band separately) and the B3 screen (e8313c68, lead
  hands-on after the agent pool hit the session cap): live-thumbnail
  template strip, Story/Square/4:5/Sticker format row (story-first,
  D109-1), gallery picker + Dark background row, transparent sticker
  export inheriting suppression. 30 review PNGs rendered via
  scripts/render-share-card.cjs.
- **C31 injury constraints** (f672c590): the injury agent died on the
  session cap AFTER completing the build (lint clean, tests unrun);
  recovered per the recovery path - lead-reviewed in full, corrected
  (write helpers out of the pinned read-only intent.js into
  movementConstraints.js; isPatternAvoided hardened against the
  undefined-kind misread; migration-window suites bumped; the
  identical-writes pin re-pinned under D109-2), landed. migrate_142
  written, NOT applied (founder-gated).
- **C32 load semantics** (26d1a39b, lead hands-on): load_semantics
  catalogue column + shared seed/backfill derivation with an explicit
  single-implement exception list; per_hand tonnage x2, assistance
  excluded from tonnage (no bodyweight coupling, ED law), assisted PR
  inversion in detectPR + buildRecordLine (D87 contract both sides);
  logger field labels, creation picker, ExerciseDetail sentence.
  migrate_143 written, NOT applied (founder-gated).

Founder-side: device-walk checklist in the session report (share
export to Instagram Stories incl. sticker + light-photo background;
avoid-pattern set/notice/list/allow-again; dumbbell 20 kg -> 40 kg
per rep session tonnage; assisted PR fires on lower assistance).
Cloud batch: DONE. migrate_142 + migrate_143 applied and verified
against production 2026-08-18 on the founder's phrase (Claude-run,
before any build carrying the new pushes shipped). The same session's
pre-apply verification found 137-141 already LIVE in production - the
supabase/README ledger was stale and is corrected in place there.

---

## CAMPAIGN 33 (2026-08-19) — Sign in with Apple must not ask for a name. LANDED ON MAIN `aa34828`.

**Founder report, twice in one day.** First: "It asks you on the first bloody
box of onboarding!" Second, with a TestFlight screenshot of Pro onboarding
"Step 1 of 5 - Baseline" from a build already carrying the first attempt: it
still asked.

**Root cause of the second report.** The first attempt (`bacc1ca`) hid the
first-name box only when a name had actually arrived, so an athlete who
cleared the name on Apple's own sheet still had somewhere to answer. Apple
supplies the name on the FIRST authorisation for an Apple ID and returns null
on every sign-in after it, so every re-install - every TestFlight tester, every
App Review re-test, every athlete on a new phone - reaches onboarding with no
credential, no stored profile and nothing to suppress on, and the box came
straight back. Verified: the build the founder ran was EAS iOS run at
16:06 UTC off `214b57f`, which contains the first attempt.

**Landed (`0d5ed6f`).** `hideNameField = appleUser`, on both onboarding routes
(`FirstRunScreen`, `ProOnboardingScreen`). No condition. Nobody is stranded:
the name is presentation only, no engine reads it, every greeting surface has a
neutral fallback, and `SettingsProfileScreen` sets or changes it at any time.
`appleFirstName` also reads the Apple identity row on the auth user, not just
`user_metadata`, so a re-installing athlete is still greeted by the name
Supabase stored at their first authorisation. The two mount cases that pinned
"the box comes back" now pin the opposite and name the founder's own state.

**Also landed (`aa34828`), unrelated, found while verifying.** Main CI's Jest
job had been red on every commit that day on one suite:
`workletClosure.guard.test.js` shelled out to ripgrep, which is not on the
GitHub Actions image, so it threw ENOENT before compiling a single file - red
CI, and the VOLYUME-2A worklet defect class unguarded in CI the whole time.
Now walks the source roots with `fs`, no external tool, same checks.

`npm run lint` clean; `npm test` 1002 suites passed, 13569 tests passed,
0 failed (the ripgrep suite included, for the first time in CI).

**Founder-side:** an iOS build is manual-dispatch only (build credits), so the
fix is on main and waiting for a dispatch. Device checklist in the session
report.

---

## STORE RELEASE NOTES, v1.3.0 (2026-08-25) — WRITTEN AND GATED, awaiting the founder's paste.

**Founder ask:** a short "what's new in this version" to attract users.

**Delivered.** Play (403 of 500 characters) and App Store (771 of 4,000)
release notes for 1.3.0, in `docs/PLAY_STORE_LISTING.md` and
`docs/APP_STORE_CONNECT_LISTING.md`. Both sections had been left at the
v1.2.0 full-release text; the v1.2.0 Play block is kept beneath the new one
for reference. Facts added to `marketing/hq/PRODUCT-FACTS.md` section H,
each read in the cited file rather than taken from a commit summary.

**The constraint that shaped the copy.** The biggest thing in 1.3.0 is the
capability lane, and CLAIMS-STANDARDS section 9A forbids naming any
population while every row of MARKETING-READINESS-MATRIX.md reads NO. So
the lead line uses the product's own neutral words, which is the one
framing 9A permits: "Tell Volyume what to build your training around, and
which side it affects. You never need to say why." No population, no
medical framing, no condition named.

**Gates.** `npm run lint` clean. `marketingClaimsGuard.test.js` 5/5 pass
over both listings and PRODUCT-FACTS. Full suite run at the same landing.
Copy additionally checked line by line against the section 9 human-voice
bans (em dash, exclamation, hype words, US spellings, negation pivots,
audience sweeps, emoji) using the repo's own R2 and population regexes.

**Open founder question (asked in chat, not blocking):** which version is
live on Google Play right now. If 1.2.1 never shipped, the notes should
also carry its headline items (equipment-aware plan updates, background
rest cues, tap-to-edit a logged set, the share-card rebuild) because those
users are coming from 1.2.0. Recorded as UNKNOWN in PRODUCT-FACTS section H
rather than guessed.

## ONE PRODUCT COHERENCE PASS (2026-09-03) — COMPLETE, MERGED TO MAIN. Ruling D135.

Branch `claude/volyume-coherence-pass-6s991m`. Founder order: one
autonomous product-coherence pass over the CURRENT app; not a feature
campaign. Rulings, evidence and the deliberately-unchanged list:
`docs/ux-world-class-audit-2026-07-09/DECISIONS-2026-07-09.md` D135.

**Landed.**
- One name per concept: "coaching decision" (summary link, You status
  title), tab/header "Nutrition", "block" in partner sharing (screen +
  `lib/partners/shareWins.js`), "Coaching log", "food library" (scan +
  search error copy), "Working sets" on the block summary, "targets" on
  the Settings row, sentence-case "Nutrition targets" / "Workout
  templates" in toasts.
- Progress: duplicate Body Metrics / Lifts tiles removed from "More
  stats"; "Full history" sentence case. BlockProgressCard no longer
  restates the week and is tappable on Consistency (opens the heatmap).
- Workout summary ends on a primary "Done".
- Shared Button rendered as itself on the weekly check-in, partner and
  plan-builder CTAs; MyRecipes / MyMeals use ModalHeader.

**Gates.** `npm run lint` clean. Full suite: 1135 suites passed (1
skipped), 15644 tests passed (13 skipped). New pins:
`src/components/__tests__/BlockProgressCard.test.js`; updated pins in the
Analytics state matrix, partner placement spine, workout summary
feedback/cohesion guards, YouScreen load-state guard, food search /
barcode copy tests, partner screen and shareWins tests, MyRecipes /
MyMeals tests (mock ModalHeader instead of BackHeader).

**Device checklist (Android, EAS build).**
1. Nutrition tab: header reads "Nutrition". Expected: matches the tab.
2. Progress tab: "More stats" shows Consistency, Full history, Recaps,
   Partners (Year of Lifts only once unlocked). Expected: no Body
   Metrics or Lifts tiles; Training and Body pillars above still open
   Lift progress and Body metrics.
3. Progress > Consistency (with an active block): "This week's plan"
   card shows "Effort N/5" (or "Recovery week") on the right, not "Week
   N/M"; tapping the card opens the volume heatmap.
4. Finish any workout: footer shows an orange primary "Done" beside
   Share; Done returns to Today. If a coaching decision exists this week,
   the quiet link reads "See this week's coaching decision".
5. Coach tab (Pro): status title reads "Weekly coaching decision: <date>".
6. Coach tab > held decisions history: the collapsible card is titled
   "Coaching log".
7. Weekly check-in: the step CTA looks like every other primary button;
   while a step is incomplete it is dimmed, not solid grey.
8. Partners with a shared block: every line says "block name", never
   "phase".
9. Nutrition > scan a barcode offline: copy says "food library".
10. Nutrition > Recipes and Saved meals: modal header with a close
    control, "New recipe" plus icon still on Recipes.
11. Train > Build a plan manually: "Create plan and add workouts" is the
    standard large primary button.
ED-safety cases: none of the above touches floors, gates, calm mode or
notification suppression; check-in flow and copy unchanged (only its
button styling).

**Follow-ups recorded, not built (D135):** single deload-signal
resolver across Home / Consistency / Plans / readiness; one editor for
days / equipment / experience; the "for now" vocabulary collision;
dead `WeightTrendCard.js` and `CoachBriefCard` default export.

## FIRST 14 DAYS / ACTIVATION PASS (2026-09-03) — COMPLETE, MERGED TO MAIN. Ruling D136.

Branch `claude/volyume-coherence-pass-6s991m`. Founder order: make the
first fourteen days exceptionally good; treat install → account as a
product funnel. Rulings, evidence, the unchanged list and the open founder
question (quiz-first flag): DECISIONS D136.

**Landed.** Welcome and Login lighter with trust at the ask; wizard skip
for body composition; logger first-time load guidance, rest-timer
introduction and in-context notification ask; summary first-session
memory line; honest zero-history readiness chip; free-tier prompt copy;
welcome card without a plan; check-in purpose line; seven funnel
telemetry events plus `migrate_156` (NOT applied).

**Gates.** Lint clean, typecheck clean, full suite 1139 suites / 15693
tests passing (49 new pins across the logger, summary, readiness, Home,
check-in, coach output, body metrics and permissions).

**Founder-side.** (1) Answer the quiz-first question in D136. (2) Apply
`supabase/migrate_156_activation_funnel_telemetry.sql` with the exact
phrase when ready; until then the new events queue on device.

**Device checklist (Android, EAS build, fresh install).**
1. First open: wordmark, "Less thinking. More lifting.", one line "A
   training plan that adjusts to what you log.", one card with three
   bullets, one sentence on the trial with the price, an orange "Start
   your 14 days" button, one muted line about the free version, the
   trust row, "Already have an account? Sign in".
2. Tap Start: create-account screen shows the trust line under the
   Create account button. Sign up with Google or email.
3. Consent gate unchanged. Wizard step 2 shows "Skip for now" under
   Continue; tapping it moves on without a body-fat value.
4. Reminder rows still read "Part of your coaching".
5. Today with no session: chip under the workout name reads "First
   session of your plan. Nothing to read yet." Welcome card shows even
   if no plan was generated.
6. Start workout (free account): prompt sub-line reads "Saved with your
   session, and read back to you on Today before your next one."
7. First lift: quiet line "First time on this lift. Pick a weight you
   could lift about N times, with a couple in reserve. It is saved for
   next time." Not repeated on set 2.
8. Log the set: rest strip appears with the caption above it; the OS
   notification prompt appears once (only if never answered). "Got it"
   clears the caption; kill and relaunch, log a set: no caption, no
   second prompt.
9. Finish: summary hero shows "First time on this session. Every set is
   saved. Next time, these numbers show as Last session while you lift."
   Not shown under calm mode or an open ED flag. Second session: the
   usual comparison row instead.
10. Pro account, check-in due: Today line reads "Your weekly check-in is
    ready. It shapes this week's coaching decision."
ED-safety: the first-session line and readiness chip carry no weight or
food content; calm/ED suppression on the summary line verified by pin;
floors, gates and notification suppression untouched.

## FREE PRODUCT + FIRST LAUNCH (2026-09-03) — COMPLETE, MERGED TO MAIN. Ruling D137.

Branch `claude/volyume-coherence-pass-6s991m`. Founder decision: Volyume
is a complete free product; first launch rebuilt from research. Full
architecture, removals, first-launch design, analytics and the external
follow-up list: DECISIONS D137. CLAUDE.md Section 1 (Tier, Payments) and
Section 2 (the gating law) updated to the new truth.

**Gates.** Lint clean, typecheck clean, full suite 1140 suites / 15673
tests passing; ED fail-closed, coach validation, identity and capability
guards unweakened.

**Founder-side.** (1) Play Console + App Store Connect: paste the
refreshed listings from `docs/PLAY_STORE_LISTING.md` and
`docs/APP_STORE_CONNECT_LISTING.md`; deactivate (do not delete) the two
subscription products and the subscription group; replace any paywall
screenshot; update review notes ("free, no purchase"). (2) volyume.app
live site: same pass on pricing/FAQ (outside this repo). (3) Apply
`migrate_156` (funnel telemetry) and `migrate_157` (pause the cascade
cron) with the exact phrase when ready. (4) Answer the quiz-first
question carried from D136.

**Device checklist (Android, EAS build).**
A. Fresh install. 1. First screen: wordmark, "Less thinking. More
   lifting.", one promise line, the example-week card (Train / Coach /
   Progress rows, block dots), "An example week. Yours is built around
   you.", orange "Get started", "Already have an account? Sign in", the
   trust row. No price, no trial, no bullets. 2. Get started: "Create your
   account", one why-account line, Apple/Google first, "Continue with
   email" reveals the fields, trust line under the form. 3. Consent gate
   unchanged. 4. Setup: six steps as before, no PRO badge, no trial
   mention; body-composition step still offers "Skip for now". 5. Setup
   complete: no "Your 14 days run to" row; "Start training" lands on
   Today with the plan hero and the welcome card. 6. Nutrition tab opens
   the diary directly (no lock). Coach tab: no "Coach is available on
   Pro" card; the check-in row shows the readiness countdown. Progress:
   Body and Progress photos pillars open directly. 7. Settings: Account
   shows email only (no Plan/Subscription/Go Pro rows); Nutrition targets,
   Dietary needs and Coaching reminders rows always present; FAQ has no
   free-vs-Pro or subscription entries.
B. Existing account that was on the free tier or an expired trial.
   1. Sign in: no paywall, no cascade gate, no "trial ending" line; all
   Pro surfaces open. 2. No win-back or trial reminder notification
   arrives over the following days. 3. Morning-weight and check-in
   reminders re-lay if they were on.
C. Logger and summary unchanged from D136 apart from the pre-workout
   prompt now showing the coaching sentence for everyone.
ED-safety: floors, gates, calm mode, notification suppression untouched;
the ED fail-closed guard still pins every remaining read (count updated
for the two removed free branches).

## NUTRITION EXPERIENCE MASTERPASS (2026-09-03) — COMPLETE, MERGED TO MAIN. Ruling D138.

Branch `claude/volyume-coherence-pass-6s991m`. Founder order: make the
daily nutrition experience stand beside a dedicated food app. Research,
findings, the preserved list, rulings and the unchanged list: D138.

**Gates.** Lint clean, typecheck clean, full suite 1146 suites / 15741
tests passing; tap-count guard and planned/eaten pins unchanged.

**Device checklist (Android, EAS build; account with nutrition targets set
and a few days of food logged).**
1. Nutrition tab: after the meals and "Add meal", one chip row reads
   Meal builder · Higher-calorie day (if allowed) · Trends. No separate
   Meal builder row or banking button. Trends opens Food Insights.
2. Empty slot with a usual: chip reads "Porridge oats · 60 g" (or the
   serving, e.g. "Toast · 2 slices"). One tap logs it; toast offers Undo;
   Undo removes it. Long-press opens the portion editor instead.
3. Log breakfast today. Lunch slot (empty) shows "Yesterday's lunch" when
   yesterday had lunch; tapping copies only lunch; Undo removes all rows.
4. Add food (with recents): list shows immediately, keyboard closed. Add
   food on a fresh account: keyboard opens on arrival. Row button reads
   "Add"; bar reads "2 to log · Log 2".
5. Reopen a food logged as 2 slices: sheet opens at 2 servings, not 62 g.
6. Scan a label in poor light, leave an amber figure untouched, Save:
   confirm "Some figures weren't read clearly. Save anyway?". Scan a drink
   label: serving arrives as ml.
7. More tab: edit a custom food (pencil / long-press), change kcal, save.
   A previously logged entry keeps its old kcal; a new log uses the new.
8. Remove your nutrition targets (or a fresh account): under the rings a
   compact card says "Set your targets first" and opens Nutrition
   targets.
9. Meal builder empty state bullet reads "Nothing counts until you mark
   it eaten". Grocery list: tick items, close, reopen: ticks persist;
   rebuild the plan: ticks clear.
10. Diary open, date swipes and add-food open feel immediate with 40+
    favourites (batch resolution).
ED-safety: floors, calm mode, planned/eaten filters and evidence
untouched; no shaming copy added; usual chips follow the rings' gating.

## EXERCISE LIST ROW, EXERCISE SHEET, INSTRUCTION CONTRACT (2026-09-05) — COMPLETE, MERGED TO MAIN. Record D151.

Founder brief in chat 2026-09-05. Outline current row: surface2 band,
amber dot, semibold white name, white set count (full-row amber tint
gone). Exercise sheet: "Back · Cable" display labels; Setup / Execution
/ Watch stack in the primary ink with a "Plan note" above when the
routine carries one; tonal adjusted/eased box; one calm fallback line
for custom exercises. Detail screen: the same three fields; its
duplicate amber cue card removed. Instructions: shared contract
`src/lib/exerciseCorpus/instructionContract.js` (validator rule 10 +
Jest mirror read it); every corpus entry is `setup` / `execution` /
optional `watch`; `cue` derived; FORM_TIPS (545 legacy paragraphs)
retired; `METADATA_REDERIVE_KEY` v4. Audit (`audit-instructions.mjs`,
report `data/instruction-audit.json`): 918 rows, 0 violations,
916 carry a watch line. Five Opus lanes against
`INSTRUCTION-BRIEF.md`, each lead-reviewed on a sample plus every
least-sure row: cable/band/suspension 111 of 216 rows changed;
machine/smith/sled/medicine ball/sandbag 119 of 136; bodyweight 116 of
176 (+7 by hand); barbell/landmine 116 of 188; dumbbell/kettlebell 96
of 202 (+1 by hand). Accuracy fixes found by the read-through, not the
contract: neck harness load positions reversed, sled row facing the
wrong way, barbell glute bridge described as a hip thrust, axle bar
"wide" not thick, dumbbell windmill written for a kettlebell, and
roughly fifty rows whose setup held the whole movement with a fault
sentence as the execution (a shape the mechanical split could not see).

**FOLLOW-UP, founder decision (row identity, outside this brief).** The
lanes flagged near-duplicate LIVE pairs that read as one movement under
two names and survived the EL-25 normalised-name pass because the
names differ by a bracket or a word: e.g. Cable Woodchop / Cable
Woodchop (High to Low); Cable Wrist Curl / Single-Arm Cable Wrist Curl;
Ab Rollout / Ab Wheel (Kneeling) / Ab Wheel Rollout / Kneeling Ab
Rollout; Chin-Up / Chin-Up (Supinated); Nordic Curl / Nordic Glute
Curl; Lying Leg Curl / Prone Leg Curl; Seated Calf Raise / Seated
Machine Calf Raise; Machine Rear Delt Fly / Reverse Pec Deck / Seated
Rear Delt Machine / Plate-Loaded Rear Delt; Good Morning / Barbell Good
Morning; Romanian Deadlift / Romanian Deadlift (Barbell); Safety Bar
Squat / SSB Squat; Sumo Deadlift / Sumo Deadlift (Wide Stance); Fat
Grip Curl / Thick Bar Curl; Landmine Rotation / Landmine Twist; Meadows
Row (barbell family) / Landmine Meadows Row; Dumbbell Pullover /
Dumbbell Pullover (Chest); Plank Row / Renegade Row; Step-Up (Dumbbell)
/ Step-Up (Weighted); four single-leg RDL rows. Each pair kept distinct
instructions; nothing merged. Retirement is an EL-21 ruling with a
founder-reviewed list (corpus-floor.json rule), so it is queued, not
done. Also flagged: Monster Walk, Spanish Squat, Terminal Knee
Extension and Clamshell describe a band while tagged bodyweight; Wall
Ball Squat describes a ball while tagged dumbbell (metadata, not text).

**Device checklist (Android, from a green build).**
1. Start a multi-exercise workout, tap the outline strip. Expected: the
   current exercise row is a slightly lighter charcoal band with an
   amber dot and a white name and count; completed rows keep the grey
   tick and n/n; upcoming rows keep the hollow ring; no amber wash.
2. Tap another row. Expected: instant switch, the band moves, the list
   collapses as before; long-press still opens reorder.
3. Open exercise options, then Exercise info, on a library exercise.
   Expected: title, then "Back · Cable"-style metadata (display names,
   middle dot), the amber prescription line, then Setup, Execution and,
   where present, Watch, each a short label over one or two sentences
   in white. No paragraph wall, no amber tinted boxes.
4. Same on an exercise inside a plan that carries a note (e.g. Face
   Pull in a library plan). Expected: "Plan note" first, then the three
   sections.
5. On an adjusted day (or with a readiness reduction). Expected: the
   "Adjusted today" / "Eased for today" box is charcoal with a hairline
   and amber icon and title, not an amber-filled card; the revert
   action still works.
6. Create a custom exercise, open its info. Expected: "How to do it"
   with your notes, or the one calm fallback line.
7. Library > any exercise > detail screen. Expected: "How to do it" as
   Setup / Execution / Watch; no separate amber bulb card above it.
8. Existing install (not fresh): after update, open any exercise info.
   Expected: the new wording (the v4 re-derive ran once at launch).
9. Light theme: same structure, amber ink on the prescription line only.
10. TalkBack on the sheet: each section label is read before its text.
ED-safety: not adjacent (no bodyweight, food or notification copy).

## LIVE PR CALLOUT RESTYLED; LOG SET TROPHY RETIRED (2026-09-05) — COMPLETE, MERGED TO MAIN. Record D150.

The record row under the weight/reps controls keeps its place and the
set-entry workflow. It now takes the Last session strip's shell (surface2
fill, hairline, radius.md, spacing.md inset, 36 dp), one small amber
trophy, a white headline "New PR if you complete this set", and one
soft-grey line per record: "Heaviest weight yet · Previous best 90kg",
"Most reps at 92.5kg · Previous best 8 reps", "Est. max ~130kg ·
Previous best ~126kg" (assisted: "Least assistance yet · Previous best
25kg"). Multiple records stack as separate lines. The trophy on the Log
set button is gone. Copy and presentation only; `buildRecordLine` still
reuses detectPR over the log path's history, so the callout can never
promise a record the celebration withholds. Guards:
`workoutRecordLine.test.js`, `loggerVisualArchitecture.guard.test.js`.

**Device checklist (Android, from a green build).**
1. Start a workout on an exercise with history (e.g. best 90kg x 12).
   Dial in 80kg x 8. Expected: no callout; the card is just the strip,
   the steppers and Add a note. Log set shows no trophy.
2. Dial in 90kg x 13. Expected: a charcoal row appears under the
   steppers with the same edges, corner radius and left inset as the
   Last session strip; small amber trophy centred on the first line;
   white "New PR if you complete this set"; grey lines "Est. max ~129kg
   · Previous best ~126kg" and "Most reps at 90kg · Previous best 12
   reps". Nothing in the row is brighter than the stepper numbers.
3. Dial in 92.5kg x 10 (heavier for fewer reps). Expected: one grey
   line, "Heaviest weight yet · Previous best 90kg", and NO estimated-max
   line (92.5 x 10 does not beat the ~126kg estimate).
4. Dial in 100kg x 13 after a 95kg x 12 set is logged. Expected: two
   lines stacked, "Est. max ~143kg · Previous best ~133kg" then "Heaviest
   weight yet · Previous best 95kg" (two is the most that can fall at
   once), each on its own line under the one headline.
5. Tap Log set on a record set. Expected: the usual PR toast and haptic
   as before; the callout disappears once the new best is on record.
6. Step the reps back down to your best. Expected: the row vanishes and
   the card returns to its ordinary height with no jump elsewhere.
7. Warm-up set with record numbers. Expected: no callout (unchanged).
8. Assisted machine (e.g. assisted pull-up) with history: lower the
   assistance at the same reps. Expected: "Least assistance yet ·
   Previous best Nkg".
9. Light theme: charcoal becomes the light surface2, trophy is the amber
   ink, headline the dark ink; still no tinted fill.
10. TalkBack on the row: reads the headline then each record line.
ED-safety: not adjacent (lift records only; no bodyweight or food copy).

## NO SPLASH SCREEN: STRAIGHT INTO WELCOME (2026-09-05) — COMPLETE, MERGED TO MAIN. Record D149.

The native launch frame is a plain charcoal frame (transparent plugin
image, light and dark); the 1.6 s first-run hold is gone; the old
wordmark assets are deleted; a VERIFIED fresh install (no owner marker,
no stored auth session) opens on Welcome at the first frame while the
database opens behind it (D149 part 2). The OS launch frame itself
cannot be removed on either platform (D149 states why). Guards:
`splashLogoAsset.guard.test.js`, `authBootGate.test.js`,
`supabase.storedSession.test.js`. Needs a fresh EAS build to see: the
native frame is baked in at build time.

**Device checklist (Android, from a green build).**
1. Fresh install, cold start. Expected: the system icon animation, then
   the Welcome screen at once. No wordmark frame, no charcoal wait, no
   second loading screen.
2. Tap Get started straight away and sign up. Expected: the sheet works
   immediately; after sign-up the Article 9 gate, then the wizard, as
   before. Nothing flashes between the sheet and the gate.
3. Sign in with an existing account, kill the app, cold start. Expected:
   charcoal frame, then Today directly. No flash of Welcome.
4. Aeroplane mode, cold start signed in. Expected: charcoal frame, then
   Today (local truth), never a Welcome flash; a genuinely stuck session
   read still lands on the bounded "try again" state as before.
5. Dark and light system themes: the frame is charcoal in both.
6. Uninstall, reinstall (no account on the device). Expected: step 1
   again, straight to Welcome.
ED-safety: not adjacent.

## AMBER IS ACCENT, NOT "THIS IS A BUTTON" (2026-09-04) — COMPLETE, MERGED TO MAIN. Record D148.

Five-tier action hierarchy in `src/components/Button.js` (emphatic /
primary raised / secondary / tertiary tint / icon-FAB); sixteen emphatic
marks pinned by an allowlist in `Button.hierarchy.guard.test.js`; the
hand-rolled amber fills migrated; the in-app splash is a bare background
now that Welcome carries the product. Full list, exceptions and contrast
figures in D148.

**Device checklist (Android, existing account with an active plan).**
1. Today tab. Expected: Start workout is a raised charcoal button with a
   hairline border, white label and an amber play glyph; Options sits
   beside it flatter. The only amber fills on the screen are the
   selected tab and the wordmark.
2. Tap Start workout. Expected: the same short haptic tick as before.
3. Train tab. Expected: Start next workout raised and neutral, View plan
   flatter; the Active badge and the block dots still amber.
4. Active workout. Expected: Log set at the bottom is raised charcoal
   with a white label; the active exercise chip, rest-timer drain and
   +15 stay amber; Finish unchanged. Log a set. Expected: same tick,
   same flow.
5. Nutrition tab. Expected: the scan FAB is a charcoal disc with an amber
   barcode glyph; Mark eaten on a meal is raised and neutral; the
   calorie ring and macro bars are unchanged.
6. Food search, food detail, curated meal: the add / save buttons are
   raised and neutral. Body metrics Log and Save likewise.
7. Partner tab. Expected: the support-plan action is an amber-tinted
   pill with amber text; in the invite sheet the favoured channel is
   tinted, the others plain. Agree and get my code (first visit) is the
   one amber fill.
8. Sign out, cold start. Expected: no amber splash card; the Welcome
   screen appears with Get started as the one amber button; the sheet's
   Continue with email and Create account are amber.
9. Wizard: Build my plan and See my plan are amber; every Continue is
   raised and neutral.
10. Font size at the largest accessibility setting: every raised button
    keeps its label on one or two lines inside its box; nothing clips.
ED-safety: the coach lockout CTA and the Article 9 consent CTA are
unchanged and still amber; no weight/food copy or gate changed.

## PLAN-GENERATION CARD: FIXED LAYOUT, PAYOFF IN PLACE (2026-09-04) — COMPLETE, MERGED TO MAIN. Record D147.

Guard: `ProOnboardingScreen.buildCard.guard.test.js`. Version bumped to
1.3.3 in the same landing on the founder's ask (App Store Connect).

**Device checklist (Android, fresh account, through the whole wizard).**
1. Tap Continue on the final step. Expected: the card appears with all
   four stages listed at once; the first shows a small spinner, the rest
   a dim ring. Nothing above the card moves from here on.
2. Watch the stages complete about every 0.8 s. Expected: each row's
   spinner becomes an amber tick with a soft fade, the next row brightens
   and takes the spinner. The card's edges do not move at any point.
3. When the fourth completes: all four ticks hold for half a second, a
   short haptic, then the card's content fades to "Plan ready", "Your
   plan is ready", the goal and phase, the split and days, "5 build weeks
   + 1 recovery week", one line about targets and check-in, and See my
   plan. The card is the same size as before.
4. Tap See my plan. Expected: the app opens on the Train tab with the
   new plan active, not on Today.
5. Reduce motion on (system setting): the same card, no fades; states
   switch instantly; the payoff appears without a crossfade.
6. Force a generation failure is not reproducible on device; the failure
   path is unchanged and covered by tests.

## SETUP WIZARD POINTS AT WHAT IS MISSING (2026-09-04) — COMPLETE, MERGED TO MAIN. Record D146.

Continue never greys out; a tap with a gap marks the missing boxes,
scrolls to and focuses the first, names the rest under the button. One
control family on the baseline step. Guards:
`ProOnboardingScreen.gaps.guard.test.js`; sex and height gate guards
re-anchored to the validator.

**Device checklist (Android, fresh account).**
1. Baseline step, leave everything blank, tap Continue. Expected: a short
   buzz; the sex control's border turns red with "Choose your biological
   sex." under it; the page scrolls so the sex control is in view; the
   line under Continue reads "Still needed: biological sex, age, height,
   body weight."; the step does not advance.
2. Choose a sex. Expected: its red clears at once; the line under
   Continue drops "biological sex".
3. Tap Continue again. Expected: the page scrolls to Age and the cursor
   lands in it with the keyboard up; Age shows "Enter your age, 13 to
   100." Type 200. Expected: still red (out of range). Type 30. Expected:
   clears.
4. Height with ft + in selected: both boxes are the same width and both
   carry the red border with one message under the pair. Switch to cm:
   one box, same message. The unit picker looks identical to the weight
   unit picker below it.
5. Fill everything and tap Continue. Expected: advances, no alert.
6. Training step: tap Continue with nothing chosen. Expected: the
   experience dropdown border turns red with its message, the session
   and days tracks turn red with messages, equipment likewise, and the
   line names all four. Choose each; each clears.
7. Focus step: Continue with no focus chosen. Expected: the dropdown
   marks and "Still needed: your focus." shows.
8. Final step: Continue with no recovery level. Expected: the page
   scrolls up to the recovery dropdown, marked, with its message.
9. Larger text on: messages wrap under their box without overlapping.
ED-safety: the ranges and floors are unchanged; the sex gate is unchanged.

## ONBOARDING KEYBOARD DISMISSES ON ITS OWN (2026-09-04) — COMPLETE, MERGED TO MAIN.

Founder defect (Android walk): on the setup wizard the keyboard stayed up
across Continue, Back and the selectors until closed by hand. Cause, from
the code: Android's number pad has no Done bar (the bar is iOS-only by
design, A1); the wizard's ScrollViews use keyboardShouldPersistTaps
"handled", so a tap on Continue or a selector never blurs the field; and
Android does not reliably hide the keyboard when the focused input
unmounts with the step. Fix: every step transition (advanceFrom2 to 7,
goBack) and every non-text selector on the input steps (sex, height and
weight units, body-fat source) calls Keyboard.dismiss() first, and the
wizard's scroll views carry the app's platform-split drag-to-dismiss
(iOS interactive, Android none, the reason recorded in
ActiveWorkoutScreen). Guard:
`ProOnboardingScreen.keyboardDismiss.guard.test.js`.

**Device checklist (Android).**
1. Fresh account, setup step with age, height and weight: type a weight,
   tap Continue. Expected: the keyboard drops as the next step appears.
2. Type an age, then tap a sex option or switch the height units.
   Expected: the keyboard drops on the tap; the selection registers.
3. Type a value, tap Back. Expected: the keyboard drops with the step.
4. On the number pad, tap the tick. Expected: the keyboard drops (this
   was already the case; confirming it still is).
5. iOS, if a build is made: drag the form down while the keyboard is up.
   Expected: it follows the drag away.

## VERSION 1.3.3 (2026-09-04) — ON MAIN. Founder-side: create the 1.3.3 version in App Store Connect. (1.3.2 was bumped earlier the same day at `e9dd8b74`; the founder asked for a further bump.)

App Store Connect refused iOS build 1.3.1 (61) with 90062/90186: the
1.3.1 train is closed because 1.3.1 was approved, so every further iOS
build needs a higher CFBundleShortVersionString. `expo.version` is the
single source (app.json, mirrored in package.json and the lockfile root),
so the bump to 1.3.2 covers iOS's short version and Android's versionName
in one place. Build numbers are unaffected: EAS manages the iOS build
number remotely (autoIncrement; 61 was the last), Android's versionCode is
the workflow run number. `runtimeVersion` follows appVersion but the app
ships no OTA updates, so nothing changes at runtime.

**Founder-side.** In App Store Connect, add version 1.3.2 under the app
(the "+" beside iOS App), then run the iOS build when you decide to; it
will upload as 1.3.2 (62). Google Play needs nothing: the next Android
build from main carries 1.3.2 by itself.

## PREMIUM FIRST LAUNCH: WELCOME + CREATE ACCOUNT (2026-09-04) — COMPLETE, MERGED TO MAIN. Record D145.

Branch `claude/fix-sqlcipher-fresh-install`. Founder spec delivered in
chat 2026-09-04; ruling and rationale: D145. Rendered for review at
`https://claude.ai/code/artifact/9c7eb2a6-68f7-4beb-ab27-bf26e361147e`.

**Gates.** Lint clean, full suite green (exact counts in the closure
report). No migration, no new dependency (expo-linear-gradient was
already installed), no native change: the next Android build from main
carries it.

**Device checklist (Android, next build from main, fresh install).**
1. First screen: wordmark, "Everything you need / to build your
   physique." on two clean lines, one support line, three real product
   screens as the hero fading into the page, "Completely free · No ads",
   Get started, and "Already have an account? Sign in" as plain text.
   Get started is on screen without scrolling.
2. Tap Get started: a sheet rises over the same Welcome (dimmed behind):
   "Create your account", one line, Continue with Google, Continue with
   email (amber), "Already have an account? Sign in", Privacy policy. No
   logo or artwork inside the sheet. Swipe down or tap outside closes it.
3. Tap Continue with email: the same sheet grows into Email, Password and
   Create account, with a Back control that returns to the options. The
   keyboard lifts the sheet; the button stays reachable.
4. Close the sheet, tap Sign in: the sheet opens as "Welcome back" with
   the fields visible, Sign in, Forgot your password? and "New here?
   Create an account". Sign in with a real account and land in the app.
5. Tap Privacy policy inside the sheet: the sheet closes and the policy
   opens; Back returns to Welcome.
6. Settings, Display, larger text on: the headline still breaks cleanly
   and the sheet still fits.
ED-safety: copy only; nothing weight, food or notification adjacent.

## FRESH-INSTALL INCIDENT (2026-09-04) — FIXED ON MAIN `9a2e6cfe`, ANDROID BUILD 3564 GREEN. Record D143. FOUNDER: INSTALL AND CONFIRM.

Branch `claude/fix-sqlcipher-fresh-install`. Every fresh install since
the 2026-09-03 morning build failed: Android "Couldn't open your data",
iOS "Couldn't switch accounts safely". Two causes, both proven and both
fixed; the full evidence and rulings are D143.

**What ships.** GitHub Actions run 33875960876 (build 3564, main
`9a2e6cfe`): artefacts `volyume-release-aab-9a2e6cfe…` (Play) and
`volyume-release-apk-9a2e6cfe…` (sideload), expiring 2026-09-07. The run
proved the packaged SQLite library carries SQLCipher in all four native
libraries. iOS: the residue fix is on main; an iOS build needs the
founder's explicit go (it costs money) and is NOT started.

**Gates.** Lint clean, full suite green at 9a2e6cfe (exact counts in the
closure report); build 3564 passed every workflow gate including the new
packaged-library check.

**Device checklist (Android, build 3564 from the run above).**
1. Uninstall Volyume completely, install the 3564 APK (or the Play build
   once the AAB is uploaded). Expected: the app opens to first run or
   sign-in with no "Couldn't open your data".
2. Sign in with Google, Apple or email on that fresh install. Expected:
   lands in the app; no "Couldn't switch accounts safely".
3. Finish onboarding, log one workout, force-close and reopen. Expected:
   the workout and profile are still there.
4. On a phone that already had 3560 with data, update to 3564. Expected:
   opens straight into the existing data, still signed in.
5. Sentry VOLYUME-33: no event from release 1.3.1+3564 after steps 1 to
   4. Then resolve the issue.
6. Sign out and sign in as a different account on the same install.
   Expected: the account switch still refuses if data from the first
   account remains (the residue check is intact for real residue).
ED-safety: nothing in the engine, floors, flags or notifications was
touched; the change is the build script, the open path's logging and one
snapshot-kind check.

**Founder-side.** Cancel the leftover EAS iOS build on expo.dev if it is
still listed (the GitHub run 33873252133 was cancelled; the EAS job may
have continued). Upload the 3564 AAB to Play.

## BOUNDED TRAINING HORIZON + WELCOME-BACK NOTE (2026-09-04) — COMPLETE, MERGED TO MAIN. Founder decision D142.

Branch `claude/volyume-coherence-pass-6s991m`. Founder answered the D141
question "C". Contract: the D142 addendum in `docs/NOTIFICATIONS_LOCKED.md`;
rulings: D142 in the decisions register.

**Gates.** Lint clean, typecheck clean, full suite green (exact counts in
the closure report). No migration, no new dependency, no native rebuild.

**Device checklist (Android, EAS build from main).**
1. Settings, Notifications and reminders: "Remind me to train" on with a
   time. Train on two or three weekdays so a habit exists. Expected: the
   reminders keep arriving on those days at the chosen time, exactly as
   before (they are now dated one-shots, not a weekly repeat; nothing
   visible changes for an active user).
2. Developer check if possible: the scheduled notifications list holds
   at most 28 training entries, the last about eight weeks out, ids like
   `volyume_training_day_3_20261029`.
3. Settings, Notifications and reminders, Getting started card: a new
   "Welcome-back note" switch, on by default, with the helper text. Turn
   it off and on: no crash, no toast.
4. Cannot be walked in a day: with the switch on, an account with at
   least one completed workout and an active plan, the note "Your plan is
   still here" arrives at 10:00 local on the 21st day after the app was
   last opened, once, and never while the app is being opened regularly.
5. Calm mode on (or an open wellbeing flag): the note is never laid.
   Turning calm mode off and reopening the app lays it again.
6. Fresh account with no completed workout: no welcome-back note (the
   getting-started nudge covers that window).
ED-safety: the note is suppressed under an open ED flag and calm mode,
both failing closed; no floors, thresholds, seeds or scoring touched.

## TOP-TEN IMPROVEMENT PASS, FIRST LAUNCH AND RETENTION (2026-09-04) — COMPLETE, MERGED TO MAIN. Record D141.

Branch `claude/volyume-coherence-pass-6s991m`. Founder order: rank the
ten best improvements to what exists (no new features) from three
read-only audit lanes, then "action all of these to the absolute best
standard". Every item, its mechanism and the lead-review rulings: D141.

**Gates.** Lint clean, typecheck clean, full suite green (exact counts in
the closure report). Engine, ED-safety, consent and billing untouched.

**Open founder question (delivered in chat).** The training reminder's
horizon for a fully lapsed user (D141, "Open founder question").

**Device checklist (Android, EAS build from main).**
1. Sign in with Google on a connection that accepts but never answers
   (a captive portal works): after about 20 seconds the button releases
   and the toast says you need an internet connection. On a normal
   connection sign-in is unchanged.
2. Boot: cannot be forced on a healthy phone. If "Couldn't open your
   data" ever appears, "Try again" recovers once the phone is idle.
3. Fresh account, Today or Train, tap "Start with a plan": the button
   shows a spinner and dims until the preview sheet opens; "Browse
   plans" stays tappable. Both tabs read "your coach builds one from
   your setup".
4. Start a workout, log a set, let the rest timer run, Discard: the
   rest chronometer disappears at once, the screen goes back. Diary:
   swipe-delete an entry; on success the undo toast, on a failure a calm
   "Couldn't delete that entry" toast and the row snaps back. Train tab,
   delete a saved workout: same pattern.
5. Activate a plan, then Settings, Notifications: no visible change, but
   on the morning the block finishes a push "Your next block is ready"
   arrives (respecting quiet hours), even if the app was not opened. It
   never arrives for a block that has already finished when you open
   the app.
6. Coach tab after a weekly review lands: You-tab dot shows. Close the
   Home banner with its X: dot stays. Open the review: dot clears and
   stays clear on relaunch and on returning to Today.
7. Train on Monday and Thursday for three weeks, then open the app on a
   different day without training: the training reminder days follow
   your habit without needing a finished workout first.
8. Settings, Your data: with parked sync changes the line reads "N
   changes couldn't sync." and a "Retry now" row appears; tapping it
   shows "Retrying now." and the count clears once synced.
9. Settings rows read "Training reminder, meal reminders and quiet
   hours" and "Weigh-in and weekly check-in schedule". Coaching
   reminders has a row through to Notifications and reminders. Diary:
   with targets set, meal reminders off, at least one logged day and two
   unlogged days in the last week: the "Want a nudge to log?" card shows
   once; "Not now" or "Set up reminders" removes it for good. Under calm
   mode or an open ED flag it never appears.
10. Setup complete after a failed generation: the "Train your split" row
    is plain text saying where to start a plan, no dead tap.
ED-safety: the meal offer is off under calm mode and an open ED flag;
no floors, thresholds, seeds or scoring touched; no new push category.

## KEEP THE BLOCK ACROSS AN EXERCISE-PRESERVING REBUILD (2026-09-03) — COMPLETE, MERGED TO MAIN. Founder decision D140.

Branch `claude/volyume-coherence-pass-6s991m`. Founder answered the D139
question "Yes" (A): a days-per-week change that keeps every exercise
keeps the running block. Rule, rationale, states, copy and the
recovery-week dialogue fix: D140.

**What changed.** `planDiff.keepsBlockOnRebuild` (pure rule);
`database.activatePlanKeepingBlock` (activates the new programme, writes
no mesocycle); `generateAndSavePlan({ keepBlock })` with
`activatePlanWithBlock` fallback; `confirmPlanSwitchMidBlock({ keepBlock })`
plus the 'recovery' status fix; PlanPreviewSheet kept line;
PlanUpdateScreen rules once for the sheet and again at confirm. Engine
untouched.

**Gates.** Lint clean, typecheck clean, full suite green (exact counts in
the closure report).

**Device checklist (Android, EAS build).**
1. Active plan in week 3 of 6. Train tab, Adjust training plan, change
   4 days to 3, leave everything else, Review. Expected: the sheet's
   receipt shows every exercise under "Stays" and the block line reads
   "Every exercise stays, so your current block carries on at week 3 of
   6 rather than restarting. Your workout history and PRs are kept." No
   "This starts a six-week training block" sentence. Hand-edits line and
   "Your other N plans move to Archived plans" still show.
2. Confirm and rebuild. Expected: NO "Restart your training block?"
   dialogue; toast "Plan rebuilt around your new training setup. Your
   block carries on where it was"; Train tab plan card still reads "Week
   3 of 6"; Training blocks screen shows the same block, same start date,
   no new block in Past blocks; the new plan has 3 workouts.
3. Same start, but also change equipment so at least one exercise is
   replaced or dropped, Review. Expected: the sheet reads "This starts a
   six-week training block ... Confirming ends your current block at week
   3 of 6 and starts a new one from week 1." Confirm: the "Restart your
   training block?" dialogue appears; after Switch plan, "Week 1 of 6".
4. Block in its recovery week (week 6 of 6), days-only change. Expected:
   sheet reads "carries on at week 6 of 6"; no dialogue; block stays.
5. Block finished (decision open), "Change my training setup", days-only
   change. Expected: sheet shows the block-start sentence (no "carries
   on"); confirm shows "Skip the open block decision?"; a new block
   starts at week 1.
6. Recovery week, Plan library, activate another plan. Expected: "Switch
   during your recovery week?" dialogue (previously silent). Cancel
   leaves the plan and block untouched.
7. Fresh account with a plan but somehow no block (not normally
   reachable): a days-only rebuild still creates a block (fallback).
ED-safety and engine: no floors, thresholds, seeds or scoring touched;
nothing weight or food adjacent.

## PROGRAMME CREATION & PLANNING MASTERPASS (2026-09-03) — COMPLETE, MERGED TO MAIN. Ruling D139.

Branch `claude/volyume-coherence-pass-6s991m`. Founder order: make the
programme engine feel simple to operate. Research, preserved list,
findings, rulings and the unchanged list: D139.

**Gates.** Lint clean, typecheck clean, full suite 1160 suites / 15853
tests passing; engine untouched (labels and one shared constant only).

**Founder question: ANSWERED "Yes" (option A) the same day. Built as
D140, entry above.** (Was: should a days-per-week change that keeps every
exercise also keep the running block? A. Yes. B. No. C. Weeks 1 and 2
only.)

**Device checklist (Android, EAS build).**
1. Fresh account, Today or Train, "Start with a plan": a preview sheet
   appears (days, split, session length, workouts, the block sentence)
   with "Start this plan" and "Not yet". Nothing is created until
   confirmed. "Browse plans" is offered on both tabs.
2. Train tab with an active plan in week 3: the plan card reads "Week 3
   of 6" with an info tooltip explaining the block. In a recovery week it
   reads "Recovery week, week 6 of 6".
3. Plan tools: "Adjust training plan" only with an active plan.
4. Adjust training plan, change 4 days to 3, Review: the sheet shows the
   continuity line (if you have history), the receipt, "Confirming ends
   your current block at week 3 of 6...", "Your other N plans move to
   Archived plans", and the hand-edits line. Confirm asks the mid-block
   question before rebuilding.
5. Coach tab, change goal: the same preview appears before the plan is
   rebuilt; targets behave exactly as before.
6. Library: open a plan; the preview shows "Fits how you train" or "N to
   swap" and names the exercises; a rationale line appears under the
   workouts.
7. Block finished: the third option reads "Change my training setup".
8. Train tab: the section reads "Saved workouts"; finishing a session
   offers "Save this workout to reuse".
9. Create your own: fill page 1, go to page 2, press back without saving:
   no plan appears in My plans. Save draft creates it. Day headers show
   "~N min" if estimated.
10. Edit a workout's sets: the sheet says "This changes this workout
    only. Your weekly set targets stay with the block."
11. Week 1 of a new block, activate another plan from the library: a
    confirm appears (no silent switch).
ED-safety and engine: no floors, thresholds, seeds or scoring touched.
