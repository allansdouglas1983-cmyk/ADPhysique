# 07 — Lead findings and rulings (P0..P3)

Lead-ruled under D33. Evidence: `01`..`06` in this folder. Each finding
carries its ruling; remediation detail lands in `08-REMEDIATION.md`.

## F-01 (P1, founder-confirmed) — "How you train" hides the purpose of the injuries / limitations feature; the populated line says "Built around 4 things you told it"

Evidence: `02-CAPABILITY-CONCEPT.md` (39 non-test src files / 167 lines
carry the phrase; 30 test files pin it; the count in `summary.js:54` is a
row count that includes allowance rows; `subjectPhrase` gives up above two
phrases; the Home offer card and the feature intro claim "every plan and
workout is built around it", which section C shows is true only for
generated plans, the picker, swaps, the live session and library-plan
compatibility, and not for hand-built plans beyond the picker).

### RULING D152 — the feature is called "Injuries & limitations"

Why this name: a person with a bad shoulder, limited grip or a long-term
disability must be able to predict the door without knowing the product.
"How you train" reads as split, frequency or style. "Injuries &
limitations" names what is actually stored: functional limits on movement
("overhead work", "gripping a bar", a family, an exercise), whichever of
injury, pain, condition or disability lies behind them. The subtitle names all
four causes (injuries, pain, long-term conditions, disabilities) so
nobody has to classify themselves at the door. Founder ruling 2026-09-05:
"injury" and "disability" may be used freely, on long-term rules too; the
earlier lane-vocabulary rule (D112 R6) and RT2-2 no longer constrain this
copy. Mid-sentence, "limitation" stays the default noun because it names
what is stored, and "injury"/"disability" are used wherever they read more
naturally. Ampersand titles are house style ("Workout &
units", "Help & FAQ").

Vocabulary (one table, applied everywhere; route ids, file names and
function names are NOT renamed):

| Old | New |
|---|---|
| `How you train` (title, row label, step label, "under / Open / Update How you train") | `Injuries & limitations` |
| Row / card subtitle when nothing is saved | `Injuries, pain, long-term conditions or disabilities that affect your training.` |
| Populated line, baseline only, subject nameable (≤2 phrases) | `Leaves out <subject>` e.g. `Leaves out overhead work and gripping a bar` |
| Populated line, baseline only, not nameable | `<N> injuries or limitations saved. Used when Volyume picks exercises and builds your plan.` (singular: `1 injury or limitation saved.`; N counts RESTRICTION rows only, never allowances) |
| Populated line, baseline restrictions 0 but allowances exist | `Set up. Nothing is left out.` |
| Populated line with an episode | unchanged head (`Working around <subject>, until about <date>`), tail `<N> long-term` instead of `<N> permanent` |
| `Built around N thing(s) you told it` | RETIRED, guard-banned |
| "sits / sat outside how you train" (one movement) | "clashes with a limitation you've set" |
| "sit outside how you train" (several) | "clash with your limitations" |
| "no match inside how you train" / "No close matches inside how you train" | "no match within your limitations" / "No close matches within your limitations." |
| "left out for how you train" | "left out for your limitations" |
| "Fits how you train" (badge, filter chip) | "Fits your limitations" |
| "Volyume doesn't know yet whether this fits how you train" | "Volyume couldn't check this against your limitations yet" |
| "Volyume could not check how you train just now" | "Volyume could not check Injuries & limitations just now" |
| "How you train could not be checked" | "Injuries & limitations could not be checked" |
| "Outside how you train" (conflict reason) | "Clashes with a limitation" |
| "Show / Hide movements outside how you train" | "Show / Hide movements that clash with your limitations" |
| "which you keep out under how you train" | "which you keep out under Injuries & limitations" |
| "Update How you train" (button) | "Open Injuries & limitations" |
| Wizard WHEN question "Is this how you train generally, or temporary?" | "Is this long-term, or temporary?" |
| Option "How I train generally" | "Long-term" (sub: "Part of your normal training. Full progression and coaching, no special labels.") |
| Readback value "How you train generally" / "Part of how you train generally" / "Always. It stays part of how you train." | "Long-term" / "Long-term" / "Always. It stays part of your normal training." |
| "make it part of how you train" / "Make this part of how you train?" | "make it long-term" / "Make this long-term?" |
| Active-workout notice badge (baseline) | "Limitation" (episode badge "Temporary change" unchanged) |
| "Your plan and how you train" | "Your plan and your limitations" |
| "Options for this part of how you train" | "Options for this limitation" |
| "Whatever you add is either part of how you train from now on, or worked around for a while" | "Whatever you add is either long-term, or a temporary change worked around for a while" |
| planEngine `Built around how you train.` | `Built around your limitations.` |
| "nothing that fits your equipment and how you train covers" | "nothing that fits your equipment and your limitations covers" |
| "Volyume could not build a full plan inside how you train." | "Volyume could not build a full plan within your limitations." |
| "matching how you train" (side-carve note) | "matching the side you set" |
| "Things your body needs training built around live under How you train." | "Injuries, pain, conditions and disabilities live under Injuries & limitations." |
| "Something else about how you train" / "describe how you train under How you train" | "Something else" / "say what you cannot do under Injuries & limitations" |
| "Volyume works from what you tell it about how you train." | "Volyume works from what you tell it you cannot do." |
| Home offer card body "Tell Volyume once and every plan and workout is built around it." | "Tell Volyume once and it takes them into account when choosing exercises and building your training." |
| Feature intro "It will build your plans and your workouts around it." | "Volyume takes them into account when it picks exercises and builds your training." |

Truth check on the new claims: "picks exercises and builds your plan /
training" is TRUE for generated plans, the exercise picker, swaps, the
live session and library-plan compatibility (kettlebell and circuit plans
included, pinned by `stylePlans.capability.test.js`). It does not claim
coaching, notifications or Progress, none of which consult baseline rules.

Not renamed: route ids `HowYouTrain`/`HowYouTrainAdd`, screen and
component file names, `howYouTrainSummary`, `HOW_YOU_TRAIN_OFFER`. They are
internal; renaming them is churn with no user value.

Guards to add: a source-level regression test banning `how you train`
(case-insensitive) in user-facing string literals and JSX text under
`src/` (comments allowed), and banning `thing(s) you told`.

Store listings (`docs/PLAY_STORE_LISTING.md`,
`docs/APP_STORE_CONNECT_LISTING.md`) are updated in the repo; the LIVE
listings are the founder's to re-paste (surfaced in the certification
report).

## F-02 (P1) — Home-screen widgets have no click action
Evidence `01-ROUTE-GRAPH.md` A1. Ruling: add the library's open-app click
action to each widget root; the handler comment already claims it.

## F-03 (P1) — Partner invite links are minted but never routed
Evidence A2. Ruling: add the `partner/:code` path to the navigator linking
config so React Navigation's own URL handling delivers the code to
PartnerScreen. No new listener code.

## F-04 (P1) — `volyume://active-workout` from the foreground-service notification is unmapped
Evidence A3. Ruling: map it to wherever a cold start already resumes an
in-progress session; if no such route exists, map to Today, which carries
the resume card. Do not build a new resume mechanism.

## F-05 (P1) — "Save draft" in the custom builder navigates to the tab it is already on
Evidence A5. Ruling: pop to the Train root after saving; the success path
at line 1589 uses the shared cross-tab helper so the builder does not stay
on the Train stack.

## F-06 (P2) — Meal plan → nutrition targets never returns
Evidence A6. Ruling: honour `returnToTab`/`returnToScreen` on the targets
screen's done/back path.

## F-07 (P2) — goBack + setTimeout cross-tab jump
Evidence A7. Ruling: one cross-tab call, as the sibling action at line 240
already does. A timing patch is not a fix.

## F-08 (deliberately unchanged) — quiz-first branch and LoginScreen
Evidence A4. The branch is one documented, reversible flag
(`ONBOARDING_QUIZ_FIRST`); deleting half of it would make the flag a lie.
Unreachable by users; recorded, not changed. A8-A11, A13, A14: not defects
(one primary entry plus contextual shortcuts; founder D134 placed the
Settings row deliberately; MealNames retained by D95).

## F-09 (P1) — Exercise search buries staples and returns nonsense for short words
Evidence `06-LIBRARY-SEARCH.md`. Rulings:
- Prefix tiers must treat "a word in the name or alias starts with the
  query" the same as "the name starts with the query", then order by
  staple tier, then shorter name first, so "bench" finds Barbell Bench
  Press before Bench Dip and "curl" finds Barbell Curl before a Spanish
  wrist-curl alias.
- Exact-token matches outrank fuzzy-token matches before staple preference
  applies, so "swing" finds Kettlebell Swing before Lying Leg Curl.
- Edit-distance allowance: 3 letters or fewer none, 4 to 6 letters one,
  7 or more two.
- Data: remove the garbled aliases on the dumbbell family (e.g. "Glute
  Bridge Single-Arm Press" on Dumbbell Bench Press, "... v. 2"); add
  "Hamstring Curl" to Lying and Seated Leg Curl; add "Flat Dumbbell Bench
  Press" / "Flat Bench Press" aliases to the two bench-press staples; a
  validator rule bans version-suffix aliases.
- Picker: add a Kettlebell equipment chip; no-results copy suggests fewer
  words or clearing a filter when one is active (after the rename lands,
  since the picker file is in the rename lane).
- Burpee: no row, and none added. Conditioning movements sit outside
  resistance-training scope by product law. Recorded.
- Duplicate clusters (Romanian Deadlift pair, Good Morning pair): resolved
  only through the existing retire-and-merge mechanism if it needs no
  cloud migration; otherwise differentiated by name and reported.

## F-10 (P0, FIXED hands-on) — Activating a library plan destroyed circuit structure and style tags
Evidence `04-TRAINING-STYLES.md` A0, A0b; confirmed by reading
`database.js` `duplicateRoutine` (ten of fourteen arguments) and
`copyPlanFromLibrary` (no tags). Fix: the copy passes selection reason,
group kind and round rest; the programme copy passes tags, split type and
difficulty. Pinned by `src/lib/__tests__/copyPlanFromLibrary.structure.test.js`
against the real database module on in-memory SQLite. No repair migration:
the circuit and kettlebell plans merged to main on 2026-09-05 and no
Android or iOS build has been dispatched since (GitHub Actions run list),
so no device holds a broken copy.

## F-11 (P1) — Kettlebell progression proposes bell weights that do not exist
Evidence A1. Ruling: the live prescription snaps kettlebell loads to the
next real bell size (4 to 48 kg ladder) in the consumer, never "+2.5 kg";
the corpus increment stays as is. A11 (beginner plan tagged to the
experienced ballistic pool) is a data fix in the same lane.

## F-12 (P1) — Advice built on excluded evidence
Evidence A7. Ruling: the low-volume insight is suppressed for a muscle
whose window holds excluded-class sets (ballistic, circuit); the heatmap
says plainly that swings and circuit rounds are not counted; the weekly
coach's volume path is traced and, if exposed, gets a deterministic hold
reason (lead implements, safety-adjacent).

## F-13 (P1) — The live logger speaks straight-set language on circuits
Evidence A4, A5, A8, A13, A15. Rulings: the pre-set heads-up gets a circuit
branch with no Unlink; unlinking any group also clears group kind; the
orientation row, outline, reorder chip, lock-screen notification and
logged-row labels say "Round n of m" and "Circuit"; the circuit round is
the circuit's (rounds started across stations), and a station that has
missed a round says so in one short line; "alternates with" becomes
"with"; a full-library swap inside a style plan is not filed as a style
cause. Waits for the rename lane to release ActiveWorkoutScreen.

## F-14 (P1) — Serve-time capability substitution ignores style and equipment
Evidence A6. Ruling: `bestEligibleSubstitute` candidates are filtered by
the plan's style pool (when tagged) and the user's equipment profile
before capability eligibility; if no candidate survives, the existing
"no close match, kept with a note" path stands.

## F-15 (P1) — "Adjust plan" silently flattens a circuit plan
Evidence A3. Ruling: generation does not build circuits (campaign scope);
so the Adjust-plan preview and confirm on a circuit-grouped plan say
plainly that rounds are not kept and straight sets replace them, before
anything changes. Nothing consequential changes silently.

## F-16 (P1) — Bands and kettlebells have no honest route at the equipment question
Evidence A2, A12. Ruling: the onboarding and starter equipment choices
gain Kettlebells and Bands IF the generator can build from those profiles
(verify first; stop and report if not); the library quiz's "No exact
match" state offers "Have Volyume build one for your kit" instead of a
dead end. No hand-authored band plans are added in this campaign; the
gap is recorded.

## F-17 (P2) — Circuit editing and preview
Evidence A9, A10. Rulings: a circuit station's edit sheet edits rounds for
the whole circuit and the round rest, and hides the inert per-station
rest; the plan preview names "Circuit · N stations · N rounds · Ns
between rounds" per day.

## F-18 (P1) — Today re-offers session 1 after the week is done; block-finished contradiction; false "No active plan yet"
Evidence `05-SURFACE-TRUTH.md` B-1, B-3, B-2. Rulings: a week-complete
hero ("Every session done this week", next session named for Monday,
secondary "Do another session" opening the existing change-workout
sheet); when a block awaits its decision the hero IS the decision, not
"Start workout"; a plan with no sessions gets its own empty state
pointing at the plan, never "No active plan yet". Train's next-workout
row mirrors the week-complete state.

## F-19 (P1, FIXED hands-on) — Methodology says the coach cannot overrule you; Coached mode auto-applies
Evidence D-1. Copy scoped to the truth: it never overrules a safety hold,
and outside Coached mode every change waits for the user.

## F-20 (P2, sent to the rename lane) — onboarding "Later" that never comes; "adjusts this plan" overclaim; raw exception on check-in save
Evidence A-1, C-1, H-1. One "Not now" button; "reviews this plan each week
and suggests changes for you to apply"; fixed calm line with the error
logged.

## Recorded, not changed
A14 dead style-pool derivations (no user effect); B-4 unreachable arbiter
branches (documented as retired); H-2 DebugLog behind seven taps
(support-only, the user's own log); A13 wording folded into F-13.

## F-16 REVISED after investigation (`04-TRAINING-STYLES.md` F-16 appendix)
Generation is NOT ready for kettlebell-only (two common-tier kettlebell
rows, no kettlebell shoulder work, swings never auto-selected) or
band-only (the band profile is the bodyweight profile). So the honest
route is the library, not the generator:
1. Onboarding and the starter wizard gain "Kettlebells" and "Bands" as
   equipment answers. Choosing either does not generate: Volyume installs
   the library plan that fits the person's days and experience, and says
   so in one line ("Volyume has kettlebell plans built for this kit. This
   one fits your week.").
2. Two band library plans are authored from the corpus band family
   (Full Body: Bands, 3 days; Upper/Lower: Bands, 4 days), tagged
   `equipment:band style:band`, so the existing band style pool stops
   being dead code and the "Bands" library chip is no longer empty.
   Progression on bands is reps and band grade, never "+2.5 kg".
3. "Adjust training" on a library style plan (kettlebell, circuit, band)
   does not regenerate into a different kind of plan. It says so and
   routes to the Plan Library's matching style filter. This absorbs F-15.

## F-21 (P1, FIXED, agent + lead) — 79 expansion rows had no equipment chip in the picker
Evidence: probe against the real corpus (scratchpad `probe/`, 2026-09-06).
`ExercisePickerModal.js` offered eight chips; the 2026-09-05 expansion's
landmine (27), suspension (36), sandbag (8), medicine ball (5) and sled (3)
families matched none, so those rows were reachable only by typing a
name. Fix: the chip row lives beside its filter as `PICKER_EQUIPMENT_CHIPS`
in `exerciseDisplay.js` (Barbell, Dumbbell, Kettlebell, Cable, Machine,
Smith machine, Bodyweight, Bands, Landmine, Suspension, Other);
`matchesEquipmentFilter` gained an `other` case that claims only what no
named chip owns. Pinned against the real corpus: zero unreachable rows.

## F-22 (P2, FIXED, agent + lead) — six barbell lifts were classed as band
`deriveEquipmentCategory` fired the band regex on the NAME alone, so
"Band-Resisted Squat/Bench Press/Deadlift" and "Reverse Band
Squat/Bench Press/Deadlift" (equipment `barbell`) derived `band`, sat
under the Bands chip, were excluded from Full Gym and Barbell & Plates,
and were offered to the no-equipment profile. EL-4 files bands on bars
under specialty barbell work. Fix: the reclassification applies only when
the coarse equipment is empty, `bodyweight` or `band`; explicit `band` and
`landmine` cases added so a row whose name omits the word cannot fall to
`other`. Rederive key bumped to v7 so existing installs take the new
category (the lead's addition; the agent's fix reached fresh installs only).

## F-23 (ruled D154, not changed) — kettlebells never appear in ORDINARY generated plans
Founder report 2026-09-06: kettlebells "missing from the plans in the
library and probably on the engine and plan builder too". Observed: the
library gap was the seed race (Sentry VOLYUME-28, fixed on main); the
builder's picker has the Kettlebell chip and all 59 rows; the engine
fills kettlebell STYLE plans 9/9 slots with kettlebell rows. Ordinary
generation reaches zero kettlebell slots in 36 runs across every profile
because only two kettlebell rows are COMMON or better in the C16 tier
registry, and the recognisable gate prefers STAPLE/COMMON. Ruling and the
founder fork are in D154.

## New-family reachability table (2026-09-06 audit, real functions)
| family | rows | top-up | chip | ordinary generation | style pool | swap | detail/volume |
|---|---|---|---|---|---|---|---|
| kettlebell | 59 | ok | Kettlebell | 0 slots (D154) | 9/9 | yes | ok |
| band | 62 | ok | Bands | bodyweight profile (D10/D19) | yes | yes | ok |
| landmine | 27 | ok | Landmine (F-21) | 10 slots, barbell_plates | n/a | yes | ok |
| suspension | 36 | ok | Suspension (F-21) | 12 slots, home_gym | yes | yes | ok |
| smith | 13 | ok | Smith machine | 18 slots, machines_cables | n/a | yes | ok |
| sandbag | 8 | ok | Other (F-21) | 0 (no COMMON rows, D154) | n/a | yes | ok |
| medicine ball | 5 | ok | Other (F-21) | 0 (EL-4 power patterns) | n/a | yes | ok |
| sled | 3 | ok | Other (F-21) | 0 (EL-22 duration rows) | n/a | yes | ok |
Top-up: zero canonical id or name collisions; every row inserts on an
existing install. Detail: zero rows with a missing cue, muscle, pattern
or category; zero empty volume allocations.
