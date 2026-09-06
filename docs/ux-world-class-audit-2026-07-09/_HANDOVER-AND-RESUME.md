# UX world-class audit — handover and resume note

===============================================================================
## ★ 2026-09-06 — COMMUNITY REPLACES PARTNERS (social / discovery / sharing) ★

Founder brief (in chat): one autonomous end-to-end task to replace
Partners with a real social, discovery, community and sharing ecosystem.
Campaign folder `docs/social-discovery-2026-09-06/` (README = document
map; `40-DECISIONS.md` SD-01..SD-16 plus build-time rulings;
`30-BLUEPRINT.md` = the spec; `60-FINAL-REPORT.md` = the report;
`50-VERIFICATION.md` = tails + device checklist). What landed: Community
(Following + Discover) off the Today header, Coach row, Train row and
every share surface; profiles with chosen facts and a separate consent
row; follow graph with requests; card-based training stories from real
logged data; versioned programme snapshots (structure only) with Use
as-is and a deterministic, explained Adapt for me; search, suggestions
with reasons, dimension pages (style, programme, gym, area); report,
block, mute, auto-hide, moderator queue with audit log; two budgeted push
categories; deep links `community`, `u`, `p`, `s`; static link pages on
volyume.app; safety records in `docs/community-safety/`. Partners is
RETIRED (SD-03): code removed, cloud untouched, active pairs become
mutual follows on join, old links land on Community. Cloud migration 160
and the two functions are WRITTEN, NOT APPLIED (founder gate). Founder
actions: TASKBOARD.md section 3.
===============================================================================
## ★ 2026-09-06 — SENTRY FOLLOW-THROUGH: SEED RACE (VOLYUME-28) AND NEW-FAMILY REACHABILITY (on main) ★

Founder brief (in chat): the iOS 1.3.5+64 build raised "exercise not
found" x90 and the kettlebell library plans were missing stations;
"check for kettlebell ... probably on the engine and plan builder too.
Check all the new ones". Cause of the library gap: the routine seed
raced the corpus top-up on an existing install. Landed: one awaited seed
chain (`runExerciseSeedChain`, `exercisesReady`), library plans repair
their own gaps (`repairLibraryPlans`, seed key v17, incomplete flag).
Then an Opus audit of every new family on every surface, lead-reviewed:
F-21 (79 rows had no picker chip; Landmine, Suspension, Other added and
pinned against the corpus), F-22 (six banded barbell lifts classed as
band; fixed, rederive key v7), F-23 ruled D154 (ordinary generation
never picks kettlebells by the C16 tiers; the kit-named path fills 9/9;
no tier change; founder fork = an equipment inventory). Record:
`docs/final-certification-2026-09-05/07-FINDINGS.md` F-21..F-23 and the
reachability table; board block "NEW-FAMILY REACHABILITY". Founder
actions: TASKBOARD section 3 plus the board's Sentry block (Play
internal-testing upload of the codec build, iOS rebuild before
submitting 1.3.5).

===============================================================================
## ★ 2026-09-05 — FINAL WHOLE-PRODUCT CERTIFICATION (COMPLETE, on main) ★

Founder brief (in chat): one autonomous adversarial certification of the
whole product. Campaign folder `docs/final-certification-2026-09-05/`
(README = document map; `07-FINDINGS.md` = every ruling F-01..F-20 with
evidence; register D152). Landed and on main: the injuries / limitations
feature renamed "Injuries & limitations" with truthful readback (D152,
founder: "injury" and "disability" may be used freely); the P0
library-plan copy path that dropped circuit structure and tags; five
navigation dead ends; search ranking and alias repair; kettlebell bell
ladder; ballistic-aware insights; two band library plans; Methodology
truth. Also landed: circuit logger semantics, Today week-complete and
block-finished states, style-aware capability substitutes, kettlebell
and band equipment routes with style locks on both rebuild screens, and
the five final-pass fixes. Certification: `10-CERTIFICATION.md`
(CERTIFIED with three qualifications: store listings to re-paste, the
Article 9 founder-debug line, device-only visual review). Founder
device checklist: `DEVICE-CHECKLIST.md`. No build dispatched.

===============================================================================
## ★ 2026-09-05 — EXERCISE LIST ROW, EXERCISE SHEET, INSTRUCTION CONTRACT (D151) ★

Founder brief (in chat). The outline's current row is a tonal surface2
band with the amber dot and a white set count (the full-row amber tint is
gone); the exercise sheet shows "Back · Cable" from the display labels
and renders the corpus instructions as Setup / Execution / Watch with a
"Plan note" above when the routine carries one; the adjusted/eased box is
tonal. Instructions: every corpus entry now carries structured
`setup` / `execution` / optional `watch` under the shared contract
`src/lib/exerciseCorpus/instructionContract.js` (validator rule 10 + Jest
mirror read the same module); the `cue` column is derived; the 545-entry
hand-written FORM_TIPS map is RETIRED; the detail screen's duplicate cue
card is gone; `METADATA_REDERIVE_KEY` is v4. Audit: `scripts/exercise-
library/audit-instructions.mjs` (report in the campaign `data/`
folder); family rewrites by Opus agents against `INSTRUCTION-BRIEF.md`
with lead sample review. Register: D151. Device checklist on the board.

===============================================================================
## ★ 2026-09-05 — LIVE PR CALLOUT RESTYLED (D150); LOG SET TROPHY RETIRED ★

Founder brief (in chat): the "Record set if you hit this" row under the
weight/reps controls was the one element below the active-set card's
standard. Same place, same workflow; new treatment and copy. The callout
now shares the Last session strip's shell (surface2, hairline, radius.md,
spacing.md inset, 36 dp), carries one small amber trophy, a white `label`
headline "New PR if you complete this set" and one soft-grey line per
record in the pattern "<what> · Previous best <number>". The trophy on
the Log set button is retired (one place says a PR is on). Files:
`src/lib/workoutRecordLine.js`, `src/components/SetEntry.js`,
`src/screens/ActiveWorkoutScreen.js`, tests alongside. Register: D150.
Device checklist on the board.

===============================================================================
## ★ 2026-09-05 — EXERCISE LIBRARY & ALTERNATIVE TRAINING EXPANSION (campaign, landing) ★

Founder brief (one autonomous end-to-end task). Campaign folder
`docs/exercise-library-expansion-2026-09-05/` (README = document map;
`05-DECISIONS.md` EL-1 to EL-25 = every ruling with rationale;
`10-VERIFICATION.md` = performance figures + device checklist). State at
this banner: corpus moved to `src/lib/exerciseCorpus/` (structured, one
module per family, guard `scripts/exercise-library/validate-corpus.mjs`
+ Jest mirror); 552 -> 918 live canonical rows (21 retired into
survivors with history merged by the top-up; 6 template-scaffolding rows
folded in), every row with aliases, tier, demands, adapted setup and an
original cue; circuits as a named superset group with rounds and round
rest; `workout_sets.evidence_class` with EL-7 consumer exclusions; five
kettlebell and three circuit library plans in style pools with
style-constrained swaps; picker ranking with aliases and recent/staple
sections; custom-exercise delete and existing-match suggestion. Two
cloud migrations WRITTEN, NOT APPLIED (158, 159; push omits the columns
behind `CIRCUIT_SYNC_COLUMNS_ENABLED`). Full regression and closure
follow on the campaign branch, then merge to main.

===============================================================================
## ★ 2026-09-05 — NO SPLASH SCREEN (D149); 1.3.4 BUMPED ★

Founder order: straight into Welcome. The native launch frame is now a
plain charcoal frame (transparent expo-splash-screen image), the 1.6 s
first-run "brand hold" in RootNavigator is gone, the wordmark splash
assets are deleted, and a VERIFIED fresh install (no owner marker, no
stored auth session; `classifyFreshInstall`) opens on Welcome at the
first frame while the database opens behind it. The OS frame itself
cannot be removed (D149 records the platform facts). Version bumped to 1.3.4 for the next iOS build on
the founder's ask. No build dispatched; the founder must create 1.3.4 in
App Store Connect and give the go for the build.

===============================================================================
## ★ 2026-09-04 — ACTION HIERARCHY: AMBER IS ACCENT (D148); ALSO D146, D147 LANDED ★

Founder brief: orange was doing "brand accent" and "this is a button" at
once. `Button.js` now has five tiers (emphatic amber fill for one
decisive action per journey; the default is a raised charcoal surface
with a hairline and an amber icon; secondary flat; tertiary tint;
icon-FAB). Hand-rolled amber fills migrated; Partner action pill and
favoured channel tinted; in-app splash is a bare background. Coach root
(YouScreen) was already at the bar and is unchanged. Exceptions kept
amber (AppAlert confirm, Article 9 CTA, coach ED lockout CTA, Nutrition
Calculate, every selection/state use) are listed in D148 with the
contrast figures. Guard: `Button.hierarchy.guard.test.js`. Earlier the
same day: D146 (wizard points at what is missing) and D147 (plan
generation card never moves; See my plan lands on Train); 1.3.3 bumped
for iOS. No build dispatched (founder's call, Section 4 rule).

===============================================================================
## ★ 2026-09-04 — PREMIUM FIRST LAUNCH: WELCOME + CREATE ACCOUNT (D145) ★

Founder spec (in chat, 2026-09-04) after the D144 welcome failed on
device. Welcome: small mark, benefit headline at the display face / h2
size, one support line, three REAL product captures as the hero (sized
from the free height, centred between spacers), "Completely free · No
ads", Get started, text sign-in. Create Account: no watermark, no
tagline, no dividers; left-aligned heading, one line, Google, email,
text actions, one trust line. Rendered for review (artifact link in
D145). Board entry carries the device checklist. Record: D145.

===============================================================================
## ★ 2026-09-04 — FIRST LAUNCH REDESIGNED (D145): PRODUCT-LED WELCOME, AUTH AS A SHEET ★

Founder spec and three device verdicts in one day. Welcome (approved):
wordmark, benefit headline, one line, three real captures as the hero,
free line, Get started, text sign-in. Authentication: a bottom sheet
over Welcome (`components/auth/AuthSheet.js`, all former LoginScreen
logic moved verbatim); the Login route renders Welcome with the sheet
open. Rendered for review; record D145 (three passes, with what was
rejected and why). Board entry carries the checklist. No Android build
dispatched; founder's call.

===============================================================================
## ★ 2026-09-04 — FIRST SCREEN REBUILT, TAGLINE RETIRED (D144) ★

Founder device verdict on build 3564: "Less thinking. More lifting." is the
clipped slogan copy the voice rules ban; the welcome sizes were mismatched;
the mocked example week looked bad. The tagline is retired everywhere
(one constant, `src/lib/brand.js`: "Your plan adjusts to what you log."),
the mock-up is gone, the welcome is wordmark, h2 headline, one sentence,
CTA. Founder scoped the rule the same day: it bans slogan fragment pairs
only; status-label-then-sentence copy (block dots line, recovery lines) is
fine and a rewrite of it was reverted. Record: D144.

===============================================================================
## ★ 2026-09-04 — FRESH-INSTALL INCIDENT FIXED (D143); FOUNDER CONFIRMATION PENDING ★

Fresh installs since the 2026-09-03 morning build failed on both
platforms. Android: the packaged SQLite library had no SQLCipher, and the
09-01 fail-closed open refused the database (Sentry VOLYUME-33). iOS: the
09-01 residue check refused the install's own pre-migration snapshot.
Fixed on main `9a2e6cfe`: codec pinned on in the expo-sqlite build script
plus a binary gate that fails any build without it; migration snapshots
pass the residue check. Android build 3564 green on every gate. iOS build
NOT started: founder's explicit go required (costs money). Board entry
carries the checklist and the artefact run. Open: why Gradle evaluated the
flag false in builds 3559 to 3563 (not established; moot under the pin).

===============================================================================
## ★ 2026-09-04 — BOUNDED TRAINING HORIZON + WELCOME-BACK NOTE (D142) ★

Founder chose C on the D141 question. The training reminder is a bounded
eight-week run of dated one-shots (capped at 28), and a new return_nudge
category lays one calm push 21 days ahead, re-laid on every open, so it
fires only after genuine absence. Contract: NOTIFICATIONS_LOCKED D142
addendum; record: D142; board entry with the device checklist. Also this
day: migrations 156 and 157 applied to production on the exact phrase;
155 blocked on a client fix (README status block).

===============================================================================
## ★ 2026-09-04 — TOP-TEN IMPROVEMENT PASS LANDED (D141) ★

Three read-only audit lanes (first launch, retention, reliability), ten
ranked improvements to what exists, all built: bounded sign-in and boot,
busy state on the first tap, destructive actions that never fail
silently, the block-finished push wired, the coach badge until viewed,
launch-time training-schedule refresh, visible sync give-ups, reminder
discoverability, first-run polish. Record: D141; board entry with the
device checklist; one open founder question (training reminder horizon).

===============================================================================
## ★ 2026-09-03 — KEEP THE BLOCK ACROSS AN EXERCISE-PRESERVING REBUILD (D140) ★

Founder answered the D139 question "Yes": a days-per-week change that
keeps every exercise keeps the running block. Built as one pure rule
(`planDiff.keepsBlockOnRebuild`) read by the preview sheet and the
commit, a mesocycle-free activation writer, and a fixed recovery-week
dialogue. Record: D140; board entry with the device checklist.

===============================================================================
## ★ 2026-09-03 — PROGRAMME CREATION & PLANNING MASTERPASS LANDED (D139) ★

Founder order: make the deterministic programme engine feel simple.
Three discovery lanes, three implementation packages. Record: D139;
board entry with the device checklist and one open founder question
(keep the block across a days-only change).

===============================================================================
## ★ 2026-09-03 — NUTRITION EXPERIENCE MASTERPASS LANDED (D138) ★

Founder order: the daily food path. Four discovery lanes (experience
audit, search plumbing, meal-planning evidence law, competitor
logging-speed research), three implementation packages. Record: D138;
board entry "NUTRITION EXPERIENCE MASTERPASS" with the device checklist.

===============================================================================
## ★ 2026-09-03 — VOLYUME IS A COMPLETE FREE PRODUCT; FIRST LAUNCH REBUILT (D137) ★

Founder decision: fully free, no trial, no Free/Pro split. One flag
(`FULL_ACCESS_FOR_ALL`, proGate.js) clamps every tier write; the payments
barrel is the dormant boundary; consent no longer starts the cascade;
guards and tier routing removed; free branches removed from every screen;
first screen rebuilt as an example week; account step OAuth-first. Full
record: DECISIONS D137; board entry "FREE PRODUCT + FIRST LAUNCH" with the
device checklist and founder-side follow-ups (store consoles, live site,
migrations 156 and 157). CLAUDE.md updated.

===============================================================================
## ★ 2026-09-03 — FIRST 14 DAYS / ACTIVATION PASS LANDED (D136) ★

Founder order: the first fourteen days, install → account → setup →
first workout → return → first coaching payoff. Four discovery lanes,
lead verification, four implementation packages, landed on main.
Rulings and the open founder question (the quiz-first flag) in DECISIONS
D136; board entry with the device checklist in `docs/TASKBOARD.md`
"FIRST 14 DAYS / ACTIVATION PASS". Cloud migration `migrate_156` written,
NOT applied. Rendered inspection was not possible in the session
container; the founder's device walk is the visual check.

===============================================================================
## ★ 2026-09-03 — ONE PRODUCT COHERENCE PASS LANDED (D135) ★

Founder order: one autonomous pass to make the CURRENT app feel like one
product. Four read-only discovery lanes (navigation, visual system,
journeys, language/state), lead verification of every claim built on,
then three implementation packages. Landed on main. Rulings and the
deliberately-unchanged list with reasons: DECISIONS D135. Board entry
(with the device checklist and recorded follow-ups): `docs/TASKBOARD.md`
"ONE PRODUCT COHERENCE PASS". Gates at landing: lint clean, 1135 suites /
15644 tests passing. Rendered inspection was not possible in the session
container; the founder's device walk is the visual check.

===============================================================================
## ★ 2026-08-30 — CC33 CLOSED (ROUNDS 1–19 + THE CENSUS, D132); DEVICE WALK IS THE ONLY OPEN ITEM ★

All five S4 waves are built and merged; the campaign is in the
scorecard's adversarial review loop (SCORECARD.md, 93 rows + X1/X2:
each round attacks every row, every broken claim becomes a work item,
the review re-runs until the attack fails). Rounds 1–19 have run;
every actionable finding was closed same-day at mechanism level —
rulings D113 through D129, each later round also correcting any
earlier ruling's claim it proved false (D115 corrects D114, D117
corrects D116, D118 corrects D117, D119 corrects D118's blast radii,
D120 corrects D119's and rules the hold-union fork, D121 REVERTS
D120's ruling 9, D122 corrects D121's rulings 1 and 2, D123 corrects
D122's rulings 2 and 3, D124 corrects D123's rulings 1 and 2, D125
corrects D124's rulings 2 and 3, D126 corrects D125's rulings 1 and
5, D127 corrects D126's rulings 1, 2 and 5, D128 corrects D127's
rulings 3 and 4, D130 corrects D129's rulings 1, 4 and 6 — the
long-running chains each ended by extraction
to a driven mechanism (slot identity → the store chokepoint; the
notice ranking → constraintNoticeKind, now consumed by BOTH its
surfaces; the sided-union phrasing → sidedUnionShape, all three named
branches); the round-by-round trajectory is
12→7→5→4→9→6→6→4→1→3→4→5→4→3→2→3→1→2 roots; round 18's two are the
round-17 closures themselves, each landing one layer short —
readiness tested presence where the break was readability, and the
rebuild ranking rode a proxy term).
Pinning, stated precisely (round 6 called
out the earlier wording as broader than the pins): the engine and seam
closures carry DRIVEN pins through the real entry points — since round
6, through the REAL composed senior question; the screen-render halves
are source-level guards per the screens' own established convention,
each suite's header saying so. Live position and per-round detail: the
CC33 entry in `docs/TASKBOARD.md` (single live task source). THE LOOP IS STOPPED at round 19 by FOUNDER DECISION (D131 ruling 6:
nineteen rounds called ridiculous, 75% of the week's usage consumed).
Round 20 was NOT dispatched, and this is not a clean round — the
scorecard's "undeniable" bar is NOT met and must never be claimed.
The root trajectory (12,7,5,4,9,6,6,4,1,3,4,5,4,3,2,3,1,2,4) was not
converging to zero: rounds 10–19 were largely closures landing one
layer short, and rounds 18 and 19 each found defects the previous
round's fix created or widened. Every finding raised was closed at
mechanism level with pins over a green tree; round 19's own closures
are unreviewed. CC33 IS CLOSED on the census criterion (D132): the four recurring
defect classes are now closed by ENUMERATION over every site in the
tree, not by sampling, and the census fails by default on any new
unclassified consumer - so the loop has a terminating condition it
never had. NEXT, founder-gated: the device walk (checklist delivered
in chat). X1 = NO and X2 = pending; reopening CC33 is a founder call,
and the honest trigger is the device walk finding something, not
another review round.

===============================================================================
## ★ 2026-08-28 — CC33 INJURY/DISABILITY AUDIT COMPLETE, DESIGN RULED (D112); S4 BUILD WAVES NEXT ★

Founder order 2026-08-28 (two directives: adversarial review of the
injury/disability configuration; then end-to-end trace of every setting
through generation, existing plans, selection, swaps, active workouts,
coaching, block transitions and future generation — audit first, then
one coherent capability). Campaign folder:
`docs/injury-disability-audit-2026-08-28/` — AUDIT-SPEC.md (matrix +
severities), four banked evidence lanes (S1 surface inventory, S1
research evidence, S2-T1 generation trace 27 findings, S2-T2 live trace
33 findings, both lead-verified), FINDINGS.md (verdict: all five founder
beliefs CONFIRMED; four S1 not-honoured defects — T1-01 volume ceilings
never enforced, T1-03 baseline+installed plan inert, T2-01 promotion
silently reverts substitutions, T2-02 allowances ignored beyond the
picker; six structural causes; 60-finding roll-up with wave map), and
DESIGN-RULING.md (D112: "temporary is an overlay; permanent is the
document"; rulings CC33-R1..R8; five-wave S4 plan — W1/W2/W5 lead
hands-on, W3/W4 Sonnet pairs; §25 suspension built with migrate_152
WRITTEN-not-applied, founder phrase required). T2's migration question
CLOSED: 145–149+151 confirmed live (README record + read-only
production column check); the contrary comments at database.js:2703 and
sync/tables/capabilityConstraints.js:9 are stale (fix queued W4).
Position on entering S4: W1 (honour core) is the lead's first build.
Board: CC33 entry, section 1. Everything through S3 merged to main.

===============================================================================
## ★ 2026-08-21 — CAPABILITY WORKSTREAM CC25–CC32 + GAP CLOSURE: COMPLETE, ON MAIN ★

The whole capability/disability-inclusion workstream is CLOSED and
merged: architecture (CC25), foundations (CC26), execution bundles 1
(CC27–29) and 2 (CC30–32), and the founder's final gap-closure order
(2026-08-21, banked at `docs/capability-campaign-25-2026-08-20/
GAP-CLOSURE-ORDER-2026-08-21.md`). Gap closure shipped: the Training
considerations directory (20 condition + 20 injury stateless knowledge
profiles + OTHER path, live-verified citations), the eleventh demand
axis (weight_bearing_hands, migrate_151 now applied in production), full
library tagging (nine axes 100%), five new family plans (library at 16
capability families, seed v14), the adapted-setup layer (29 rich entries plus class-level defaults
covering all 220 materially-needing exercises, reconciliation GC-D11),
the directory-wide scenario matrix + nine movement fixtures, and the
truth pass (registry, marketing matrix 8-status ladder,
REAL-DISABLED-USER-VALIDATED = NO). Final gate: lint green, ONE full
suite green (1033 suites / 13,929 tests), merged to main. Records:
`GAP-CLOSURE-TRACKER.md`, `ORIGINAL-SPEC-TRACEABILITY.md`,
`COST-GOVERNANCE-LEDGER.md` in the campaign folder. Founder-side
actions: `FOUNDER-ACTION-PACK.md`. CORRECTED 2026-08-21 by the
founder's no-outside-party law (GC-D12): counsel, clinical review and
disabled-user recruitment are CLOSED INTERNALLY (rulings in the two
former packs); migrate_150 RETIRED (capability telemetry removed
client-side under the Q4 ruling). Remaining founder actions are
production/device/credential only. Migrations 145-149 + 151 were then
APPLIED AND VERIFIED on the founder's phrase (2026-08-21, README batch
block; 150 retired/skipped). Remaining: iOS profile delete; device
walks. No new campaign was opened.

===============================================================================
## ★ 2026-08-20 — CAPABILITY CAMPAIGN 25 (CC25): ARCHITECTURE COMPLETE, ON MAIN ★

The capability/disability-inclusion workstream (founder master brief +
Amendment 1, 2026-08-20) completed its architecture campaign under the
same-day cost-governance order. Everything lives in
`docs/capability-campaign-25-2026-08-20/`: ARCHITECTURE.md (incl. §33
red-team revisions), DECISION-REGISTER.md (laws CAP-1..22, decisions,
rejections, CLIN/LEG/founder registers), ROADMAP-CC26-PLUS.md (CC26-32
+ Amendment deliverables), STATUS/COST ledgers, 8 audits, 6 research
reports, 2 red-team reports. Gate passed; board entry updated;
**next session begins CC26 (capability foundations) from the roadmap.**
Founder-side asks are on the board (CC-F1/2/6/8, Checkpoint A prompts,
PD-1..9 triage).

===============================================================================
## ★ FRESH SESSION START HERE (2026-08-13, after Campaign 15) ★

**Campaigns 1-15 are CLOSED. Main is `0f7f0775`** (merge commit "Merge
Campaign 15: cross-device, reinstall and recovery closeout"). Gates:
`npm run lint` clean, identity invariant clean, full suite green on the
FIRST run - 875 suites, 11,142 tests, zero failures, and neither known
flake fired.

**Campaign 15 covered cross-device, reinstall, backup/restore, offline
recovery and state rehydration. What changed, and what was only proven:**

1. **partner-cheer deploy: STILL BLOCKED**, and now for a precise reason -
   the Supabase connector is authorised at org level but toggled OFF for
   the chat, so no Supabase tool loads and there is no CLI in the
   environment either. TASKBOARD section 3 carries the command and the
   verification steps. NO migration is outstanding for it.
2. **adaptation_events restore was ALREADY correct** (Campaign 8 Work 4
   pointed it at the authoritative table). Verified end to end rather than
   taken on trust, and now pinned THROUGH the live readers: the Engine Log
   and the session engine share `getRecentAdaptationEvents`, and restored
   revert memory and same-week caps really do suppress an add the engine
   would otherwise make.
3. **Mature-athlete reinstall equivalence** is proven by running the real
   `buildSeedRangesForNextBlock` on an established account and on the same
   rows restored through the real appliers, comparing whole maps.
4. **Sync ownership ruled** for the two keys C14 left conservative. Both
   STAY, for different reasons (split ownership vs incomplete dedicated
   carrier). The trace found a real defect: the per-day pattern was
   unanchored and also matched the device write clock. Anchored, and the
   clock excluded by name.
5. **Backup restore can no longer create a dead file reference.** Checked
   before the write, not cleaned up after. Rows that stand alone keep
   their data with the reference cleared; rows that exist only to point at
   a file are not restored; a relocated file is re-pointed within the same
   user's directory.
6. **Startup ordering verified and pinned** rather than changed - the
   re-lay cancels before it schedules, so a category disabled elsewhere is
   genuinely undone.
7. **Offline convergence** exercises six laws together in one stale-device
   sequence, and pins both halves of the distinction: a newer explicit
   deletion wins, a failed cloud read never erases local state.
8. **The state contract is now executable** (`campaign15.stateContract`),
   with a completeness guard that immediately caught five backed-up tables
   nobody had classified.

**New regression family:** `campaign15.reinstallContract`,
`campaign15.staleDeviceConvergence`, `campaign15.matureAthleteRestore`,
`campaign15.stateContract` (src/__tests__), plus
`campaign15.syncOwnership` and `campaign15.backupFileIntegrity`
(src/lib/__tests__).

**Process note.** Both delegated lanes died mid-task on an account session
limit, leaving partial work in the tree - one had written helpers but had
NOT wired them into `importBackup`, so the fix was dead code that looked
finished. Both were reviewed and completed by hand. Staging was explicit
per file throughout, per the founder's process law; no `git add -A`.

**Genuine remaining debt in this area** is listed in the Campaign 15
handover: the Edge Function deploy, and the claim in
`src/lib/sync/tables/perDayTargetOffsets.js` that cloud migration 110 is
not yet applied, which could not be checked without the connector.

The Campaign 14 block below is the previous entry.

===============================================================================
## ★ SUPERSEDED (2026-08-13, after Campaign 14) ★

**Campaigns 1-14 are CLOSED. Main is `268ad4d4`** (merge commit
"Merge Campaign 14: preferences, notifications and user-control
closeout"), gates green: `npm run lint` clean, identity invariant
clean, full suite 868 suites / 11,050 tests with one failure that was
a superseded source guard, re-anchored and re-run green. Neither known
flake (widgets/storage iOS bridge, shareCard/drawShareCard) fired.

**What Campaign 14 changed, in one line each:**

1. Generic preference sync is FAIL-CLOSED. `SYNCED_PREF_PATTERNS` in
   `src/lib/sync.js` is now an allowlist; an unknown `@volyume_*` key
   does not sync in either direction. The exclusion list is retained as
   a second gate evaluated FIRST, so the Campaign 10H privacy families
   stay refused even if the allowlist is later widened by mistake.
2. Deleting a synced preference sticks. `deleteUserPref` /
   `setUserPref` are the pair; the empty-value sentinel the landmark
   reset has used since Campaign 1 is now the general tombstone; the
   pull REMOVES a tombstoned key rather than writing `''`; and the push
   no longer walks a guarded row backwards over a newer cloud edit
   (`_dropStaleGuardedPushes`, fails open).
3. Every live notification category has ONE authority
   (`src/lib/notifications/categoryPrefs.js`): the prefs blob decides,
   the per-category `notification_preferences` row is an outbound
   PROJECTION never read back on device, the legacy dedicated key is a
   derived mirror. Nothing was deleted, only subordinated.
4. Real unsubscribes. The morning weigh-in and weekly check-in
   reminders gained genuine off switches (they were forced on with no
   way off). Partner cheers are enforced SERVER-side in the
   `partner-cheer` Edge Function. **The one BLOCKED subitem in the
   whole campaign: that function still needs deploying — see TASKBOARD
   section 3, "C14-J4 BLOCKED". No migration is outstanding.**
5. Notification routing tells the truth: the three partner types now
   reach Partner (partner_cheer previously opened Consistency, which
   has had no partner content since 2026-07-03); meal_log_reminder and
   subscription_payment_failure no longer dead-end; rest_timer and
   rest_end are explicitly non-navigating; meal_log_reminder's missing
   telemetry category is restored so a non-navigating tap still records
   an open.
6. Three full local weeks with no completed session stands the weigh-in
   reminders down, without touching the user's stored preference. A
   completed session re-lays silently from the workout-finish flow.
   Lead ruling under D33: an explicit Settings toggle ON is honoured
   immediately rather than held by the stand-down.
7. Manual "pin to research" was already recorded (Campaign 8 stamps
   `explicit`); Campaign 14 added the missing per-muscle release
   ("Let Volyume manage this") so intent can be handed back without a
   whole-table reset. Manual blocks still do not teach the engine.

**Regression family:** `campaign14.prefSyncFailClosed`,
`campaign14.prefDeletion`, `campaign14.manualIntent` (src/lib/__tests__),
`campaign14.categoryOwnership`, `campaign14.routingTruth`,
`campaign14.inactivityStandDown` (src/lib/notifications/__tests__).
The category suite carries the live matrix: every value in `CATEGORY`
must be either user-controlled or explicitly classified as not, so a new
notification cannot ship without a routing and ownership decision.

**Superseded guards re-anchored, never deleted, each with the reason in
a comment:** `intentPromptOptOut.guard`,
`SettingsDataScreen.skipNameToggle`,
`CoachingRemindersScreen.partnerCheers.guard`, `notificationRoute`, and
one Campaign 10H pin that had asserted the old fail-open behaviour.

**Process note on record:** a `git add -A` mid-campaign swept two
concurrent lanes' in-progress work into a commit before it had been
lead-reviewed. Nothing reached main unreviewed — the review happened
before the merge and corrected three things (the return path now reads
the one authority; that authority's default for the two coaching
reminders is `false`, matching what `restoreNotifications` has always
done; and two of the lead's own first corrections were themselves wrong
and were reverted). Stage agent work with explicit paths, not `-A`.

The Campaign 6 block below is the previous entry.

===============================================================================
## ★ SUPERSEDED (2026-08-11, Campaign 6: long-term) ★

**Campaign 6 (returning users, long-term personalisation, lapses,
reinstall, multi-block) is IN FLIGHT on `claude/campaign6-long-term`
from main `5764a947`. Live state:
docs/long-term-audit-2026-08-11/CAMPAIGN-LOG.md + the taskboard
Campaign 6 block. Order verbatim in the session scratchpad
(c6-CAMPAIGN6-ORDER.txt). Rulings register as D97. Three long-term
laws: memory must help never trap / no personalisation without
provenance / lapse ≠ failure. 62 phases, four adversarial reviews,
three permanent E2Es, 80-item handover. D91-24 characterise-only,
D91-25 characterise-only (NO freshness algorithm), migrations 132-135
+ 049 NEVER run, trial law settled (never re-ask). Campaigns 1-5
COMPLETE (D92-D96). The block below is the superseded post-Campaign-5
record.**

===============================================================================
## ★ SUPERSEDED (2026-08-11, after Campaign 5) ★

**Campaigns 1-5 are ALL COMPLETE and merged to main (D92/D93/D94/D95/
D96). Campaign 5 (first-use, onboarding and first-block journey)
closed 2026-08-11: record in docs/first-use-audit-2026-08-10/
(CAMPAIGN-LOG.md = the authoritative stage log, D96-RULINGS.md = every
ruling with rationale, twelve audit files, REVIEW-A/B/C reports,
RELEASE-TRUTH-2026-08-11.md), register block D96 in
DECISIONS-2026-07-09.md. The FQ-1..FQ-8 founder rulings are landed and
pinned; Reviews A/B/C actioned in full; the synthetic journey suite
(campaign5.syntheticJourney.test.js) and the first-use matrix
(campaign5.firstUse.test.js) are the campaign's regression contract.
WORK IS STOPPED per the founder's order — no returning-user work, no
migrations (132-135 unapplied, 049 HELD), no builds. Founder-side
actions (H4 store listings above all) + FR items: docs/TASKBOARD.md
§3. The block below is the superseded Campaign 5 in-flight record.**

===============================================================================
## ★ SUPERSEDED (2026-08-10, Campaign 5: first use) ★

**Campaign 5 (first-use, onboarding and first-block journey) is IN
FLIGHT on `claude/campaign5-first-use` from main `1665f4ba`. Live
state: docs/first-use-audit-2026-08-10/CAMPAIGN-LOG.md + the taskboard
Campaign 5 block. Order verbatim in the session scratchpad
(c5-CAMPAIGN5-ORDER.txt). Rulings register as D96. NOT a feature
campaign: three first-use laws (minimum required information /
don't teach before use / no false personalisation), A-H input
classification, 45 phases, three adversarial reviews, 64-item
handover. H4 is now a PRODUCT-TRUTH RELEASE BLOCKER (taskboard §3).
Peak-week wording reconciled in D95-RULINGS.md (dated block).
Campaigns 1-4 COMPLETE (D92-D95). The block below is the superseded
post-Campaign-4 record.**

===============================================================================
## ★ SUPERSEDED (2026-08-10, after Campaign 4) ★

**Campaigns 1-4 are ALL COMPLETE and merged to main (D92/D93/D94/D95).
Campaign 4 (whole-product coherence, legacy/dead-code cleanup,
product-boundary closure) closed 2026-08-10: record in
docs/coherence-cleanup-2026-08-10/ (CAMPAIGN-LOG.md, D95-RULINGS.md,
PHASE-30-GATES.md, eight AUDIT files), register block D95 in
DECISIONS-2026-07-09.md. Cardio logging is NOT part of Volyume
(boundary pinned by src/__tests__/campaign4.boundaries.test.js).
WORK IS STOPPED per the founder's order - no onboarding restructuring,
no long-term-user work, no migrations (132-135 unapplied, 049 HELD),
no builds. Founder-side actions + FR items: docs/TASKBOARD.md §3.
The block below is the superseded Campaign 4 in-flight record.**

**Campaign 4 (whole-product coherence, legacy/dead-code cleanup,
product-boundary closure) is IN FLIGHT on `claude/campaign4-coherence`
from main `92b9644e`. Live state:
docs/coherence-cleanup-2026-08-10/CAMPAIGN-LOG.md + the taskboard
Campaign 4 block. Campaigns 1-3 are COMPLETE (D92/D93/D94). The block
below is the superseded Campaign 3 record.**


**Campaign 3 (discoverability/settings/existing-feature UX) is IN FLIGHT
on `claude/campaign3-discoverability` from main `9aae57cb`. Live state:
docs/discoverability-audit-2026-08-10/CAMPAIGN-LOG.md + the taskboard
Campaign 3 block. Campaign 2 is COMPLETE (D93). The block below is the
superseded Campaign 2 session-start record.**

===============================================================================

**Read this block, then `docs/TASKBOARD.md` (the Campaign 2 entry in the
appendix is the live spec pointer), then `CLAUDE.md`, then `git status`.
Every block below this one is SUPERSEDED and kept as history.**

Since the 2026-07-27 block below: the adaptive-mesocycle campaign landed
(D91, blueprint `docs/blueprint-adaptive-mesocycle-2026-08-09.md`, incl.
migrate_129-131; 131 applied to production on the founder's phrase); the
full product map was built (`docs/_FULL-APP-PRODUCT-MAP.md` + its
handover); Campaign 1 (Product Integrity, D92) landed and merged to main
at `0a552cc4` with 9,681 tests passing, lint clean, and migrations
132-135 written but NOT applied (founder-gated).

**COMPLETE: Campaign 2 — comprehension, explanation, terminology** (merged to main 2026-08-10; record in docs/comprehension-audit-2026-08-10/ + D93; STOPPED after Campaign 2 per the order)
on branch `claude/campaign2-comprehension`. The founder's full order is
preserved verbatim in the session scratchpad
(`c2/CAMPAIGN2-ORDER.txt`) and summarised on the taskboard. Hard
constraints: migrations 132-135 stay unrun, no EAS builds, D92-11
(ED-flag propagation) unaltered, no new cross-device sensitive-data
paths, cardio permanently out of scope (D92-1), Campaign 1 pins stay
green, STOP after Campaign 2. Rulings go to the register as D93.

**Recovery path if this session dies:** read the Campaign 2 block on the
taskboard, the D93 register entries made so far, and the phase evidence
files in the scratchpad `c2/` directory; verify `git status`; uncommitted
work is lead-reviewed against the order before landing, never discarded,
never blindly committed.

===============================================================================
## SUPERSEDED — (2026-07-27, final pre-release sweep) ★
===============================================================================

**Read this block, then `docs/TASKBOARD.md`, then `CLAUDE.md`, then
`git status`. Every block below this one is SUPERSEDED and kept as history.**

Branch: `claude/codebase-audit-docs-pv6mjd`. Working tree green at the last
landing: lint clean, full suite passing.

### What happened this session

**Connectors came back.** The founder removed and re-authorised them, so the
Supabase and Sentry MCP connectors both work. Everything that was blocked on
them is now done.

**Migration 128 applied to production** on the founder's "run against
production". Both Apple App Review accounts exist and were verified live:
`appreview.pro@volyume.app` (pro / paid_pro) and `appreview.free@volyume.app`
(free / free), email-confirmed, onboarding complete, health consent recorded.
The bcrypt hashes originally committed did not validate under `crypt()`; they
were re-derived during the run and the migration file now matches the issued
credentials. Passwords live in chat only, never in the repo.

**CORRECTION to a long-standing wrong note.** Production was NOT stuck at
migration 116 with 117-128 pending. The live history shows 117, 118, 120-124,
126 and 127 already applied under drifted names. The real gap was three files;
128 is now applied, and **119 and 125 remain unapplied and unauthorised** —
surfaced to the founder in TASKBOARD section 3.

**Sentry triage: complete, zero unresolved issues remain.** 13 issues were
open. Nine of them were ONE failure chain and a genuine data bug, not noise:
with the phone locked, the Supabase refresh timer kept ticking in the
background, the iOS Keychain refused the session read, the client continued
with no user JWT, `auth.uid()` came back NULL, and every RLS policy of the form
`(auth.uid() = user_id)` rejected the write with 42501. **User data was being
dropped.** Fixed in `f4327e8`. RLS policies were deliberately NOT loosened —
they were correct; the session was missing. Evidence:
`docs/audit/sentry-triage-2026-07-27.md`.

**Full adversarial pre-release sweep** run by four read-only audit agents
(share cards, data entry/keyboard, layout/sizing, crash safety). All findings
and the lead rulings on every fork are in
`docs/audit/pre-release-sweep-2026-07-27.md` and
`docs/audit/share-card-audit-2026-07-27.md`. Read those before touching any of
those surfaces — the rulings are made, not open.

### Landed commits (in order)

- `f4327e8` background session loss dropping cloud writes + Sentry flood guard
- `f64c012` share-card brand lockup: cannot export unbranded, one lockup size
  across formats, descender/empty-hero/PB fixes, ED suppression now fails closed
- `08b80d6` pre-release sweep audit findings and lead rulings
- `3fdc7ac` comma-decimal corruption of typed numbers + two unusable numeric
  inputs
- `791cd45` taskboard update

### IN FLIGHT at the time of writing

Two Sonnet build agents were dispatched against
`docs/audit/pre-release-sweep-2026-07-27.md`:
- **Lane A** (keyboard): centralise the iOS numeric Done bar in
  `src/components/TextField.js`, add `keyboardShouldPersistTaps="handled"`,
  strip dead `returnKeyType` from numeric pads.
- **Lane C/D** (errors + layout): stop raw exception text reaching users in the
  plan rebuild and snapshot restore; font-scale ceilings on fixed containers;
  toast safe-area bottom inset; Analytics hero wrap; plan-name capping;
  body-metrics label wrap.

**Recovery path if this session died mid-flight:** their work is uncommitted in
the working tree. Lead-review each diff against the ruling it cites in the
sweep doc, run `npm run lint && npm test`, then land it. Do not discard it and
do not commit it blind. The edit-gate (`.claude/edit-gate`) is armed against
`docs/audit/pre-release-sweep-2026-07-27.md`; it is a SHARED single file, so
never let two agents rewrite it concurrently.

### Still open, needing the founder

All in `docs/TASKBOARD.md` section 3: whether to apply migrations 119 and 125;
deleting the review accounts after review; a one-line CLAUDE.md correction (the
weekly recap card is a SECOND founder-approved bodyweight exception, ruled
2026-06-22 and recorded at `src/lib/shareCard/greatWeek.js:13-19`, but Section 2
still says there is only one); the share-card 1:1 vs 4:5 canvas question; and
the still-empty `SUPABASE_DB_URL` secret.

===============================================================================
## SUPERSEDED (2026-07-23, chat cleared, founder moving to PC)
===============================================================================

**Read this block, then `docs/TASKBOARD.md`, then `CLAUDE.md`, then
`git status`. The 2026-07-10 block below is SUPERSEDED and kept only as
history.**

**BRANCH:** `claude/codebase-audit-docs-pv6mjd`, pushed and EVEN with
`origin/main` (verified `git rev-list --left-right --count origin/main...HEAD`
= `0 0` at `44f0c4d`). Tree is settled and green: **lint clean, 775 suites /
9,107 tests pass, exit 0**. Everything below is already merged to main.

**WHY THIS SESSION ENDED:** the founder is switching to their PC to get
working Sentry and Supabase connectors. TWO ORDERED TASKS ARE UNSTARTED AND
BLOCKED ON THAT, not parked (see FIRST ACTIONS below).

### FIRST ACTIONS IN THE NEW SESSION (both were founder-ordered, both blocked)

**1. Sentry triage, last two weeks.** Founder: "you have access to my Sentry,
please browse and fix any issues reported in the last two weeks." The
Sentry MCP disconnected mid-session and never returned; checked three times,
never actioned. Known state from earlier in the session (org `volyume`,
region `https://de.sentry.io`):
- `VOLYUME-2N` TypeError "Cannot read property 'filter' of undefined", scope
  `ActiveWorkoutScreen.handleFinishWorkout` -- ALREADY FIXED this session
  (`b312969`, commit says `Fixes VOLYUME-2N`); should auto-resolve on deploy.
  If it recurs with a timestamp AFTER that build ships, it is a NEW bug.
- `VOLYUME-2E` "Calling the 'getValueWithKeyAsync' function has failed",
  ~1,011 events / 3 users, secure-store related. This is the loudest open
  issue and the obvious next target. NOT investigated.
- Also open and unlooked-at: `VOLYUME-2D/2C/2F` (anonymous, high count),
  `VOLYUME-2H` "food_sync_pull: not authenticated", `VOLYUME-2G` "SQLCipher
  key unavailable and existing DB is not plaintext-readable".

**2. Apple review test accounts.** Founder: "create two generic accounts,
fully activated one with Pro, one with Free ... generic email addresses that
anyone can login with and secure complex passwords. Ensure it's all safe."
Supabase MCP disconnected; NOT created. The prepared plan, and WHY it is
shaped this way:
- Do NOT hand-seed `auth.users` via SQL. Consent goes through the
  `record_health_consent` RPC (`supabase/migrate_019_health_consent.sql`) and
  profile/onboarding/consent state must line up; untested seeding SQL risks a
  half-formed account that fails App Review, which is worse than none.
- SAFE PATH: create both accounts through the app's own email/password
  sign-up (shipped 2026-07-21, `src/screens/LoginScreen.js`) and walk
  onboarding once each. Every gate, consent row and profile field is then
  correct by construction.
- Then ONE statement flips the Pro account:
  `update users_profile set trial_state = 'paid_pro' where id = (select id
  from auth.users where email = '<pro address>');`
  `paid_pro` deliberately, NOT a trial state, so it cannot expire during
  review. Free account stays `free`. Both values verified against the CHECK
  constraint in `supabase/migrate_030_tier_infrastructure.sql`.
- STILL NEEDED FROM FOUNDER: the two email addresses, and whether Supabase
  has email confirmation switched on (if it does, they must be addresses the
  founder can actually receive mail at).
- CREDENTIALS: two strong reviewer-typeable passwords were generated and
  given to the founder IN CHAT ONLY on 2026-07-23. They are deliberately NOT
  in this repo and must never be committed. If the founder did not save them,
  generate fresh ones. Disable both accounts once review completes.

### ⚠ THE MIGRATION DEPLOY PATH IS BROKEN (diagnosed 2026-07-27, ACT ON THIS)

The founder gave "run against production" for migrate_128. It was NOT applied.
Two independent blockers, both proven, neither guessed:

1. **The workflow secret is missing.** `.github/workflows/deploy-migrations.yml`
   has failed on its last FIVE runs (run numbers 6-10, latest 2026-07-01, run
   id 28527653093), every one at the very first step. Job log, verbatim:
   `env: SUPABASE_DB_URL:` (empty) then
   `##[error]SUPABASE_DB_URL is empty.` The workflow's own header comment
   claims the secret was "already configured per founder, 2026-06-06" -- that
   comment is WRONG, or the secret was removed since. This is why production
   sits at migrate_116 while TWELVE files (117-128) are pending, and why every
   migration to date had to be pasted in by hand.
   FIX: repo Settings -> Secrets and variables -> Actions -> add
   `SUPABASE_DB_URL` = the Supabase Postgres connection string (Project
   Settings -> Database -> Connection string, URI form, INCLUDING the
   password). Nothing else in the workflow needs changing.

2. **The session token cannot dispatch workflows.** `run_workflow` on
   deploy-migrations.yml returned `403 Resource not accessible by integration`.
   Actions READ works (run history and job logs were both retrieved), so this
   is a missing `actions: write` scope, not connectivity. Either grant that
   scope or click "Run workflow" once in the GitHub UI after fixing the secret.

WHEN IT RUNS, IT APPLIES ALL TWELVE PENDING FILES (117-128), not just 128 --
the workflow loops every untracked `migrate_*.sql` (049/059 stay HELD). All
are required to be additive and idempotent and each runs in a single
transaction with ON_ERROR_STOP, so a re-apply is a no-op and a failure rolls
back that file loudly. Check the run log afterwards: migrate_128 ends with a
verification SELECT that prints the seeded account state.

migrate_128 STATUS: written, reviewed, merged to main, NOT APPLIED. The two
Apple review accounts DO NOT EXIST yet and will not sign in.

### ADAPTIVE MESOCYCLE BUILD — LIVE CAMPAIGN (2026-08-09, founder GO)

Authority: `docs/blueprint-adaptive-mesocycle-2026-08-09.md` §3.9 + the
founder's staged order (8 stages, test-first). LIVE STATE AND PER-STAGE
DETAIL: `docs/TASKBOARD.md`, "ADAPTIVE MESOCYCLE BUILD" entry — that entry
is the resume point, not this file.

- Stage 1 LANDED (`6d0d59c6`): completed_awaiting_decision block state,
  no week wrap, honest "Block finished" copy across surfaces, ledger seam.
- Stage 1 review remediation LANDED (`5193dd87`): all 12 adversarial-review
  findings fixed (partner milestone, ActiveWorkout/MesocycleBuilder/
  CoachOutput honesty, advisor phase-aware copy, live PlansScreen intent
  seam, widened creation pin, strengthened test pins).
- Stage 2 LANDED (`1b6fd27a`): pure Block Ledger `src/lib/interBlock.js`
  (36 tests written first; founder retention rule enforced).
- Stages 3-8 LANDED (see the taskboard entry for per-stage detail and
  commits): performance metric (blockMetrics), fatigue context + PR
  density (weeklyCoach), learned working range (learnedRange), the full
  ledger wiring (gather/runner/seeding/PlansScreen, createMesocycle
  deleted), strain-aware deload, and the explanation layer
  (blockExplain + four surfaces). Reviews: ALL EIGHT stages adversarially
  reviewed and remediated (Stage 6 review + the founder's final delta +
  the Stage 7-8 review landed 2026-08-09 as the FINAL REMEDIATION BATCH -
  see the taskboard record and D91 rulings 14-25; one explicit deferral,
  D91-24; e2e synthetic-athlete suite adaptiveBlock.e2e.test.js).

ADDITIONAL DEVICE CHECKS for Stages 6-8 (same single EAS build):
10) Finish a block (start date 6+ weeks back), open Train: the decision
   card now reads "Continue with adjustments" and shows up to four
   muscle-by-muscle lines in the coach's words (e.g. "Chest responded
   well, so the next block starts 1 set higher."). If several strain
   signals ran together, a 10-day recovery line appears, ending "Your
   call."
11) Tap "Continue with adjustments": a new block starts; open the Home
   block sheet - up to three lines like "Chest: 11 sets in week 1,
   building to 17 by week 4, then a recovery week (set by how your last
   block went)". A first-ever block shows NO such lines (nothing to
   claim). If the card instead offered "Continue this programme" (a
   true repeat), the muscle-by-muscle rationale lines do NOT appear on
   it (they would promise changes that button does not make); the full
   story still shows on the old block's Block summary.
12) Open the old block's Block summary: a "What this block showed"
   section lists each muscle's verdict.
13) Weekly coach, mid-block: the training note opens "Week N of M in
   your block.", names the climb only when next week's written plan is
   genuinely higher ("The planned climb adds N sets next week."), and
   only mentions the coach adding sets AFTER you tapped Apply AND it
   changed at least one muscle.
14) Coach deload apply mid-block: every muscle's recovery target drops
   below its current row (never a no-op), scaled 60% down to 40% of its
   recent working volume as the week's recovery read worsens; the
   applied row states the share. The dose can sit below MEV now
   (founder ruling: MEV is not a recovery-week minimum).
15) Calm-mode spot-check on the new block: seed lines never propose
   more than the last block ran (suppression degrades to repeat).

RELEASE GATE LIFTED (2026-08-09): migrate_131 was applied to EU-Dublin
production and verified (column present jsonb/nullable, 11 rows
untouched, ledger ordered after 129/130) under the founder's staged
order, after re-verifying all four preconditions (reviews remediated;
lint + full suite green on main; strain monotonicity executed; e2e
regression green). Artefacts built from main at/after 30fb2f53 are
clear to ship. The next EAS build can go whenever the founder is ready
to device-walk the checklist above.
16) Calm-mode / open-ED-flag deload spot-check: with calm mode on,
   restarting with adjustments never sizes the recovery week above the
   flat MEV week, and no seed starts above the last block's own
   numbers.

DEVICE CHECKLIST for the lifecycle changes (single EAS build, physical
Android; run with a block whose start date is set 6+ weeks back so it is
finished): 1) Home chip reads "Block finished. Targets hold at
recovery-week volume until you choose what comes next." — never "Deload
week" or a wrapped "Week 1". 2) Tapping the chip opens the block sheet:
all dots done, "Block finished" line, and a "Choose your next block"
button that lands on the Train tab's decision card. 3) That card's body
never says "After your recovery week"; its primary button reads "Restart
this programme" (adjust) or "Continue this programme" (repeat). 4) Start
a workout: the banner says "Block finished" with the holding line, NOT
"Recovery week"; targets still show the light recovery numbers.
5) Training blocks screen: plan card and dashboard read "Block finished",
no "Week 6 of 6 · recovery week". 6) Finish a session: no gold "Block
complete" celebration re-fires; the block strip shows the finished line.
7) Coach tab weekly review: the training card explains volume changes
have nowhere to land and points at the Train tab (no silent dead Apply).
8) Progress tab: "This week's plan" header reads "Block finished";
pulse card reads "Block finished", not "Week 5 of 5 · 100% complete".
9) ED-safety spot-check: enable calm mode — widget and streak surfaces
unchanged from before (suppression untouched by this campaign).

### WHAT SHIPPED THIS SESSION (all on main, all green)

Device-reported fixes: `d96bec9` Log-button height; `674f98d` eight
row-alignment defects from a 4-agent sweep; `1309081` numeric-keypad Done bar
plus 8s idle dismiss (iOS decimal/number pads have no Done key); `f5c8aa7` PR
toast clearing the Dynamic Island; `b312969` the Finish crash (VOLYUME-2N).

`251e92a` (D86) Coaching-decision page rebuilt for end users: photo talk out
of the lead card and compacted low on the page, machine voice rewritten,
StatChips de-buttoned, bottom jargon row removed. ENGINE UNTOUCHED.

`d99dc7e` (D87) live personal-record line under the weight/reps steppers,
reusing `detectPR` so it can never promise a record the celebration withholds.

`fbce1d3`..`44f0c4d` (D88) five-lane copy/design/trust audit and its
remediation: raw crash text removed from three setup paths, first-person AI
voice fixed at source in `planExplain.js`, kJ/kcal double-total, duration and
estimated-max unified, en dashes and curly apostrophes, terminology drift,
destructive-confirm consequences, and the PR-not-PB standardisation.

### TWO CORRECTIONS ON RECORD (read before trusting old notes)
- The "Settings > Health is a reachable ghost feature" finding was WRONG and
  is withdrawn (D88). The row is gated on `isHealthAvailable()`, which is
  always false by design. No change was made.
- CLAUDE.md's "Apple + Google OAuth ONLY" line was stale and is corrected:
  email/password is live and ungated since 2026-07-21. Do not "restore" its
  removal.

### DECISIONS ADDED THIS SESSION
`docs/ux-world-class-audit-2026-07-09/DECISIONS-2026-07-09.md`: **D86**
(coaching-decision simplification), **D87** (live record indicator), **D88**
(audit remediation, the withdrawn Health finding, and the PR/PB ruling with
its evidence).

### OPEN, NOT BLOCKED (founder decisions still outstanding)
- kJ users cannot log custom foods in kJ: `AddCustomFoodScreen.js` and
  `components/food/QuickAddSheet.js` have ZERO energy-unit awareness while
  `DiaryScreen.js` has it; `NutritionEducationScreen.js` teaches in kcal only.
  Not data corruption (all stored kcal) but a real inconsistency. This is a
  build, not a copy tweak, and was never approved.
- `ProUpgradeScreen` FAQ describes only the 14-day trial and omits the store's
  further 7 free days. The founder confirmed 2026-07-23 that the 7 days ARE
  configured, so the accountNote claim is CORRECT and was left untouched;
  the FAQ simply undersells it. Billing copy is founder-gated.

===============================================================================

### 2026-09-03 — HOW YOU TRAIN FLOW BUILD (D133) — COMPLETE, ALL ON MAIN
Founder order after the audit: make every variant understandable to
"the most stupid human". Rulings D133 (register). Slice 0: HYT-01
hotfix. Slice A: the add flow is its own wizard screen
(`HowYouTrainAddScreen`) on a pure, tested core (`addFlow.js`,
`lineChoices.js`); the home screen lost 415 lines of inline flow and
gained a real primary button and a preselect forwarder. Slice B: the
home screen reads as state (Waiting for you, Your plan, dated cards with
chips, Past with durations) and never fires a modal on focus. Full suite
green at each landing. Slice C: the check-in card asks one question
with two answers; everything else is an options sheet with consequences.
Slice D: edit as supersede, from an options sheet on every card.
Next gate: the founder's device walk (checklist delivered in chat).

### 2026-09-03 — HOW YOU TRAIN FLOW AUDIT — COMPLETE, LANDED
Docs-only landing. Founder device-walked the injury/disability feature
(CC33's pending X2) and returned a flow verdict: after any tap it is not
clear what to do or what happens next; "bolted together". Full audit at
`docs/how-you-train-usability-audit-2026-09-03/AUDIT.md`: every flow
traced stage by stage (section 1), 21 findings with file:line (section
2), the 25-piece provenance table that proves the bolting (0.2), the
spec-vs-built table (0.3), prior-audit reconciliation (4), constraints
(5) and the five founder forks (6). One correctness defect found:
HYT-01, dismissing the apply proposal records a decline. The 2026-09-02
visual restyle of the same feature (be4c7c7e, 6fedf6a5) is recorded as
closed there and in TASKBOARD's CC33 block. Snapshot persisted at
`.impeccable/critique/2026-09-03T06-00-14Z__src-screens-howyoutrainscreen-js.md`.
No production code touched. Next: founder answers section 6; a redesign
session builds from the audit, HYT-01 first and alone.

### 2026-08-18 — CAMPAIGNS 30/31/32 (share revamp, injury constraints, load semantics) — COMPLETE, ALL ON MAIN
All three landed in the founder's order and merged continually (C30
renderer 847ab8af + B3 screen e8313c68, C31 f672c590, C32 26d1a39b;
plus the outline strip dd729202 and the Nutrition Targets explainer
114fb9a3 from earlier in the window). The injury agent died on the
session cap post-build and was recovered per the board's recovery path
(lead review + corrections, rulings D110-1/2); C30-B3 and all of C32
were built lead hands-on for the same cap reason. Full detail:
docs/TASKBOARD.md "CAMPAIGN 30/31/32 BUILD BATCH" entry; rulings
D109/D110 in the decisions register. Outstanding founder-side: the
device walk (checklist in the session report / board entry) and the
cloud batch phrase for migrate_142 + migrate_143 (run BEFORE the next
build ships - order note in each header). Paused next week: C27-2b
(banked at 586206d1 on claude/campaign27-responsive-research, fails
Chip.a11y BY DESIGN, do not merge), 2c, 2d, 2e.

### 2026-08-17 — CAMPAIGN 26 (founder device-order batch: Today/logger/Progress) — COMPLETE, LANDED
Nine direct founder device orders, same-day: three early fixes merged at
`16cd167b` (NowCard accent, Progress tonnage landmark + "Progress
photos" pillar rename, Diary macros-guide row), then the main batch on
branch claude/campaign26-home-logger-progress - greeting removed, hero
chip default now block-truthful, logger workspace cleared of standing
explanations (C20 Stage 11 presentation reversed on founder order,
prescriptions untouched), chromeless header ellipsis, Progress pillar
text wraps, and the restored since-check-in evidence pane with the
logged weight folded in as a quiet row (EvidencePanel/resolveEvidencePanel;
FirstReviewLine deleted; ED suppression pins re-anchored, never lapsed).
Rulings: register D102. Detail: TASKBOARD Campaign 26 entry; device
checklist docs/home-logger-progress-campaign-26-2026-08-17/.

### 2026-08-17 — CAMPAIGN 25 (Plans screen hierarchy) — COMPLETE, LANDED
Hero first, Plan tools risen, "Previous plans · N" collapsed compact
rows, Archived on the same row system, renderPlanCard retired, AX-11
sibling law kept. Rulings D101-1..3. Merged to main `36389c80`. Detail:
TASKBOARD Campaign 25 entry; spec + checklist in
docs/plans-screen-campaign-25-2026-08-17/.

### 2026-08-17 — CAMPAIGN 24 (whole-app coherence sweep) — COMPLETE, VERDICT A, LANDED
All 81 production screens reviewed in seven waves; 3 authority
collisions closed, the startup auth flash root-caused and fixed, 20+
unit sites corrected, ED suppression extended to BodyMetrics, dead
surfaces retired, one shared deload-bucket derivation, hostile review
closed (7 findings fixed). Zero founder rulings. Definitive gates: 993
suites / 13,435 tests, zero failures. Handover + 26-step device
checklist: docs/whole-app-coherence-campaign-24-2026-08-17/
(FINAL-LANDING.md, DEVICE-CHECKLIST.md).

### 2026-08-17 — CAMPAIGN 23 PHASE 2 (Progress redesign) — IMPLEMENTED, LANDED
Full implementation landed on main same day (stages 1c84531c /
b8347c55 / Stage-3 commit + D99 rulings and privacy-law amendment):
bounded photo corroboration connected to the authoritative coach run
(R2, lead-built), the three-pillar Answer Block landing with the
signal-only Visual pillar (R1), For You feed retired (the second
progression authority closed), single share CTA, Monday-anchored
weeks, A-P mounted state matrix. Three genuine defects caught at lead
review across stages (false date anchor; §15 unit mixing; plus the
D98-pattern flagged calls all ruled). Detail + 12-step founder device
checklist: docs/progress-audit-campaign-23-2026-08-17/
PHASE2-LANDING.md. Outstanding: founder Android walk (ED/calm cases
9-11); next screen per the register: ActiveWorkout.

### 2026-08-17 — CAMPAIGN 23 PHASE 1 (Progress audit) — COMPLETE, LANDED, RULINGS OPEN
Docs-only audit landed on main same day. Four evidence traces + the
34-section PROGRESS-UX-SPEC.md (verdict B) in
docs/progress-audit-campaign-23-2026-08-17/; permanent master screen
register created (docs/ux-screen-programme-2026-08-17/
SCREEN-UX-REGISTER.md, 80 screens). Core findings: For You feed =
live second progression authority (retired in spec); hierarchy
inversion; photo→coach = verdict B by D18 design. OPEN: founder
rulings R1/R2 (spec §33) gate the Visual pillar; Phase 2 implements
after they land. Next-screen recommendation: ActiveWorkout.

### 2026-08-17 — CAMPAIGN 22 PHASE 2 (Home/Today redesign) — IMPLEMENTED, LANDED
Full implementation landed on main same day (stages 0deb5ff4 / 56782be2 /
b23bd9d6 + D98 rulings): single arbitrated Today line (9-rank pure
resolver), weight row below hero with permanent tutorial retirement,
self-retiring first-review readiness line (unclamped, full ED/calm
suppression parity), trial card rehomed to You, hero merge, footer
discipline, 18-state mounted matrix suite. Three lead amendments
recorded as D98-1..3 in the decisions register. Detail + founder device
checklist: docs/home-today-ux-campaign-22-2026-08-16/PHASE2-LANDING.md.
Outstanding: founder Android device walk (15 steps, ED cases 12-14).

### 2026-08-16 — CAMPAIGN 21 (coach decision-graph validation) — COMPLETE, LANDED
Whole-system coaching validation landed on main same day: 113 rules
mapped/oracle-locked, ~250 scenarios + adversarial suites through real
seams, four production defects fixed, hostile review closed, strict
coverage gate green (one explained residue). Detail: TASKBOARD Campaign
21 entry; campaign folder docs/coach-validation-campaign-21-2026-08-16/.

### 2026-08-16 — CAMPAIGN 20 PHASE 2 (live set prescription) — IMPLEMENTED, LANDED
Full implementation landed on main same day (commits d9f8d105 / 4d1f0274 /
5ebaae41): one authoritative pure resolver (src/lib/livePrescription.js),
logger wired through it end to end, five legacy authorities deleted, 170+
new tests, full suite green at landing. Detail: TASKBOARD Campaign 20
entry. Outstanding: founder Android device retest.

### 2026-08-16 — CAMPAIGN 20 PHASE 1 (live set prescription) — DESIGN COMPLETE
Docs-only landing. Design doc + two evidence appendices in
`docs/live-prescription-campaign-20-2026-08-16/` (see TASKBOARD Campaign 20
entry for the four open founder rulings). No production code touched.
Phase 2 implements only after the rulings land.

===============================================================================
===============================================================================
## ARCHIVE POINTER + STANDING TOKEN-HYGIENE RULE (D41, founder 2026-07-11)
The day-by-day historical campaign log now lives in
`_HANDOVER-ARCHIVE.md` (same folder — full history, never deleted).
STANDING RULE: at every landing, stage-log entries older than the
current resume point roll into the archive; this live file stays under
~600 lines so a fresh session (and every agent brief citing it) reads
it in one cheap pass. Landed-item detail on docs/TASKBOARD.md moves to
the archive at the same time; the board holds only in-flight / queued /
held. Agent briefs cap final reports: structured, evidence-first, no
narrative padding (detail-bearing audit evidence exempt).
===============================================================================
