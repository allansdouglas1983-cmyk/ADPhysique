# Founder decision register (2026-07-09)

Rulings given by the founder in session, against `ASSESSMENT.md` section 5
and `SCOPING-DIETARY-PREFERENCES.md` section 7. These are settled. Do NOT
re-surface any REJECTED or HELD item as a suggestion in future sessions;
the founder's direction is to strengthen what exists until it ties together
as world class, not to propose additions that were ruled out.

## Assessment items

| Item | Ruling |
|---|---|
| Exercise media programme | **HOLD.** Founder is not putting money towards it now. Do not re-propose. |
| iOS Live Activities wiring | **HOLD.** |
| Plate calculator surfacing | **REJECTED.** Moot for UK-based users; absolutely not needed. Do not re-propose. |
| Haptic vocabulary rollout | **APPROVED.** Extend the existing expo-haptics vocabulary (`src/lib/haptics.js`) across builder/settings surfaces. No new dependency; the gated Core-Haptics question stays gated. |
| Paywall social proof (review excerpts) | **NO.** Stays dark. Do not re-propose. |
| Accessibility / dynamic type / ease-of-use pass | **APPROVED**, with added founder emphasis (verbatim): "I want more attention to user ability and ease of use and design as well. Strengthen that and any other areas instead of suggestions of additions that are already ruled out." |
| RPE/RIR reinstatement | **Treat as settled-removed.** The founder flagged the audit for re-surfacing already-decided removals; the effort picker stays out. |
| Billing default reconciliation, apply-all, giant sets | **Not ruled on.** Do not build; do not re-surface unprompted. |

## Dietary preferences and allergens (structured answers)

| Question | Founder answer |
|---|---|
| Scope | **Phase A + B.** Wire preferences into every suggestion surface, complete FSA vocabulary, first-class Dietary needs settings, plus ~25-40 new diet-tagged curated meals. Phase C (open-food allergen ingestion) not commissioned. |
| Allergy sync | **Sync diet + allergens** (additive `users_profile` columns, founder-applied migration). Taste-only food exclusions may stay local. |
| Diet axes | **Add pescatarian.** Halal/kosher deferred as a separate future decision. |
| Exclusion ceiling (ED-adjacent) | **Soft nudge past threshold** (~15 excluded foods): calm plain-voice line, no block, no shame, tier-blind. |

## Working direction (founder, verbatim)

"It's strengthening what we have so it's all world class and ties together
world class." / "Proceed with dietary."

## Active work queue (session order)

1. Dietary Phase A (engine wiring, settings surface, sync, nudge, tests)
2. Dietary Phase B (curated meal library expansion)
3. Haptics rollout across builder/settings
4. Ease-of-use, ability and design strengthening pass

## D8. Exercise engine + library rulings (founder, structured round, 2026-07-09)

| Question | Ruling |
|---|---|
| Set cap per exercise/session | **4 compound / 3 isolation** (split by the existing compound_isolation field). |
| Overflow past the cap | **Add a different-angle exercise** — weekly volume PRESERVED, spilled deterministically into a complementary-angle exercise (never trimmed). |
| Cap scope | **Auto-gen enforces; manual builder shows a calm nudge past the cap, never blocks.** Existing plans untouched (no migration prompt). |
| Library expansion | **~100 comprehensive** (plan-A Option B): all targeted fills incl. bands + wider depth + subregion-enforcement extension. |

Delegated engine-design details (recorded, not re-asked): max exercises per
session derived as ceil(sessionTarget/cap) bounded by existing session budget;
thin-equipment fallback = equipment-category diversity when no second angle
exists; biceps (and similar already-tagged muscles) join SUBREGION_REQUIREMENTS.
Build split: library agent owns seedExercises DATA + tags ONLY; engine agent
owns ALL planEngine.js changes; engine diff gets LEAD hands-on review before
push (deterministic, replay/invariant tests extended).

## D9. Unilateral logging rulings (founder, structured round, 2026-07-09)

| Question | Ruling |
|---|---|
| Design | **Two-phase per-side flow** (plan-C Option 2): Log set -> left effort, then right effort; ONE workout_sets row; lower side drives progression/PR maths; first-timer walkthrough modelled on the superset modal. No schema change. |
| Activation | **Suggest, user confirms**: metadata-flagged unilateral exercises get a one-time calm prompt ("Log this one side at a time?"); the choice sticks per exercise. |
| Between sides | **Mini timer**: a short configurable intra-set timer between left and right, full rest timer only after both sides. |

Delegated detail (recorded): legacy left/right_reps columns (mig 054) stay in
place untouched (additive schema, never removed); the orphaned unilateral.js
toggle is absorbed/replaced by this build; laterality metadata becomes the
suggestion trigger. BUILD QUEUED under the two-agent rule - fires when the
current four agents drain.

### D9 amendment (founder, 2026-07-09): between-sides rest = HALF the
exercise's normal rest time, applied to EVERY pause in per-side mode (between
sides and after the second side). Example given: 120s exercise -> arm 1, 60s,
arm 2, 60s, arm 1 (next set), 60s... Each arm therefore still receives ~its
full normal recovery (it rests while the other works). Derived automatically
from the exercise's existing rest setting (rounding: whole seconds, ceil);
no separate user setting to learn; the usual timer adjust controls still work
on the derived value.

### D9 amendment 2 (founder, 2026-07-09, supersedes amendment 1's uniform
rule): between-sides rest is set BY EXERCISE CLASS via the existing
compound_isolation field:
- COMPOUND unilateral (split squats, heavy rows): half the exercise's normal
  rest between sides AND after the second side (120s -> L, 60, R, 60, L...).
- ISOLATION unilateral (curls, raises, extensions): a "Switch sides" prompt
  (no forced timer, swap when ready), then the FULL normal rest after both
  sides.
Rationale (expert review vs real-world practice): resting limb recovers while
the other works; systemic fatigue only matters on compounds. One deterministic
rule, no user configuration, self-explanatory in the flow.

## D10. Bands-in-loaded-plans exception (founder, structured round, 2026-07-09)

The locked rule "bands never reach a loaded plan (measurable staples only)"
gains ONE NAMED EXCEPTION: Band Lat Pulldown and Band Assisted Pull-Up become
available in the Dumbbells Only / Barbell & Plates / Home Gym equipment
profiles as accessories, because those contexts otherwise have NO vertical
pull at all. The rule stands for every other band exercise and context. The
exception is documented in exerciseMetadata and pinned by updated tests
(citations D10) replacing the blanket never-rule assertions. QUEUED into pair
1's small-batch slot alongside the B-5 tail + approved-unbuilt items.

## D11. Progress-photos loop rulings (founder, structured round, 2026-07-09)

| Question | Ruling |
|---|---|
| Divergence handling | **Plan deeper corroboration** - commission a follow-up PLAN for photo-signal corroboration influencing coach recommendations. Constraints absolute: floors intact, ED-gated (calm/open-flag suppression), adherence-neutral, deterministic, no appearance-judgement language; the validation-data caveat from the existing blueprint must be addressed head-on in the plan (what data would validate the signal before it ever drives a recommendation). Plan only - no build without a further founder round. |
| Benefit line | **Yes** - one calm factual line on the photo prompt + photos empty state (e.g. "The scale can't tell muscle from water. Photos can."), ED-suppression untouched. |

## D12. Eat diary de-clutter (founder direct order, 2026-07-09)

1. REMOVE the vitamins & minerals display from the Eat diary screen - dead
   space in premium screen real estate. (Diary display only; per-food micro
   detail elsewhere is untouched unless it proves diary-only - agent reports.)
2. MOVE "mark all meals as eaten" to the BOTTOM of the page - individual
   per-meal marking is the preferred primary interaction; the bulk action is
   demoted, not removed.
3. GUIDANCE: when meals are built/planned, ensure there is a calm indicator
   explaining marking-as-eaten - meal by meal as you go, or all at once at
   the end of the day (the bulk control now at the bottom). If no such
   explainer exists, add one using the app's existing one-time first-use
   hint convention.
4. MEAL ADDITIONS FRAMING (founder): the additions list currently reads like
   you should add every item. Reframe as optional pick-any-for-flavour:
   heading/intro along the lines of "Optional extras. Add any you fancy for
   flavour. They will not change the meal's numbers." (exact copy set at
   build; calm, British, no em dash; the existing honesty footnote stays).
   Queued for the next free agent slot (Haiku-grade exact-copy job).

## D13. Small copy fixes register (founder direct orders, 2026-07-09)

1. Coach: "First check-in opens on <long date>" wraps to a second line.
   Shorten to "First check-in: DD/MM/YYYY" (UK short date, en-GB). Grep
   "check-in opens" to locate; keep any surrounding logic/gating untouched.
2. (With D12 item 4) additions-list reframe - both queued as ONE Haiku
   exact-copy agent for the next free slot.
3. Coach layout: the profile block has ended up mid-screen (bottom of "This
   Week") after the reorg. Founder likes the reorg overall but the PROFILE
   belongs at the TOP (it is the user's identity anchor) - move it to the
   top of the Coach screen, or if that genuinely collides with the existing
   hero, the most prominent sensible position (record the choice). The
   queued copy bundle upgrades to ONE SONNET agent covering D13 items 1-3.

## D14 — Scorecard targeting round (founder, 2026-07-09)
Source: docs/ux-world-class-audit-2026-07-09/SCORECARD.md (25 functions).
- **Group A (14 mechanical fixes): APPROVED in full.** Ship in agent waves,
  two at a time, lead-reviewed at each boundary. Items: AC-3 Home ink bug,
  AY-6 share-segment SR state, LT-6 gridlines, CP-5 PR markers, history
  text search + session/workout wording, L07-F6 fuzzy search + L07-F7
  recents row, L05-FS1 "Custom" tab relabel, CP-6 Settings Workout & units
  sub-page, FoodSearchScreen:896 old additions intro, Viking Press +
  Plate-Loaded Shoulder Press retag, CO-2 "see your updated plan" link,
  L05-MR1 recipe-row macros, L05-MM2 connection miscopy (3 screens).
- **Group B (CO-1 naming sweep): APPROVED.** Execute D4 register across all
  ~20 sites. The ED-safety line nutritionEngine.js:402 restored HANDS-ON by
  the lead to the exact pre-drift string ("Precision Coaching has held your
  calorie target.", verified byte-identical against pre-ae42b4d history).
- **Home banner cap: DELEGATED to the lead** ("You decide what will be
  best"). Lead ruling: ONE attention banner max above the Start-Workout
  hero, chosen by the existing full-stack ranking (BANNER_PRIORITY in
  HomeScreen.js; pickAttentionVariant only orders the attention card's own
  sub-variants); others wait their turn (strongest match to the one-hero
  Materials Policy). CORRECTED 2026-07-09 at build time.
- **Group C rounds selected (in order): notifications wording + rest-day
  (A2), Settings cluster (CP-10 restart-free theming, CP-9 Help/FAQ,
  L08-B3 post-cancel link), weigh-in edit/delete (NAV-2).** RPE/RIR
  revisit NOT selected this round (stays settled-removed).

## D15 — Retag gate + notifications + plan-G rulings (founder, 2026-07-09)
- **Division overlap gate RAISED 0.50 -> 0.60** ("Raise the gate"): accepts
  the 0.56 overlap caused by the approved v63 front-delt retag (Viking
  Press + Plate-Loaded Shoulder Press). planengineRebuildPhase2.test.js
  updated with a comment citing this ruling.
- **Notification drift: AMEND THE LOCKED DOC.** The current in-app
  weekly-coach-ready and cascade-gate strings become canonical; Surface 6
  in COACHING_VOICE_SYNTHESIS_LOCKED.md is updated to match them verbatim
  (documented as a founder amendment, not silent drift).
- **Rest-day notification: RE-SPECIFY.** Commission a short spec (copy,
  trigger, quiet hours, ED/calm rules) and bring back for approval before
  any build.
- **Plan-G over-performance: BOTH** - calm acknowledgement copy AND the
  bounded one-step escalation (consecutiveExceededWeeks pattern), still
  MRV-clamped, confirm-before-apply, floors/gates untouched.
- **Plan-G threshold N and adherence-why placement: DELEGATED to lead.**
  Lead rulings: N = 3 consecutive exceeded weeks (sustained pattern,
  responds within a mesocycle); adherence-why surfaces BOTH at Pro setup
  completion and once in the first weekly coach output (one calm line
  each, said once, never repeated).

## D16 — Settings cluster + weigh-in rulings (founder, 2026-07-09, resume session)
- **CP-10 restart-free theming: BUILD.** Full architectural change so the
  theme becomes a live, reactive value across all screens. Proceeds via a
  plan-first investigation (blast radius, options, risk, staged rollout)
  before the build itself; the investigation is a step of the approved
  build, not a gate to re-ask.
- **CP-9 Help/FAQ: IN-APP FAQ SCREEN.** Native Settings sub-screen with
  curated FAQ content in the locked coaching voice, maintained in-repo,
  works offline. (Contact/email row not selected this round.)
- **L08-B3 post-cancel forward link: BUILD, TEST PLAN FIRST.** Written
  billing test plan per docs/rules/billing.md comes first and gets founder
  approval; then the calm forward link ships. Link and copy only — no
  purchase/restore/entitlement/cascade logic is touched.
- **NAV-2 weigh-in management: EDIT + DELETE + HISTORY.** Full management
  on Body Metrics: edit any entry, delete entries, visible history list.
  ED-safety intact: floors, calm mode and ED-flag suppression untouched;
  trend-based detection re-runs on the corrected series after any edit or
  delete.

## D17 — Rest-day/reminder, B41, AY-7, LT-3 (founder + delegated lead rulings, 2026-07-09, resume session)
- **Rest-day notification: HELD** (FQ-1 option 3) until the schedule gap is
  otherwise resolved. Recorded for when it unblocks: gated by ED-flag/calm
  suppression (FQ-2), copy Variant A plan-anchored (FQ-3). FQ-4/FQ-5
  DELEGATED to lead — ruling: folded into the existing Training reminders
  card sharing its enablement, default 09:00 local (distinct from the
  training reminder's 08:00).
- **Training-day reminder dead substrate: FOUNDER STEER** — "Rest days are
  not strictly adhered to, user trains on the days they want and have
  lives." Lead ruling under that steer: do NOT wire a rigid plan-day
  schedule writer. Rebuild the reminder's schedule on habit-derived
  weekdays from completed-workout history, and amend the
  NotificationSettingsScreen copy to describe it honestly. Quiet
  hours/push-budget gates unchanged. QUEUED as a build.
- **B41 check-in reminder drift: DELEGATED to lead** — ruling: amend
  Surface 6 of COACHING_VOICE_SYNTHESIS_LOCKED.md to the live string
  ("How has your week gone{, First}" / "A two-minute check-in is all it
  takes, and your coach tunes next week around it."), dated amendment; the
  live string already matches NOTIFICATIONS_LOCKED and D15 set the
  amend-to-live precedent. Payment-failure push VERIFIED NON-DRIFT (Apple
  handler says "the App Store", Play handler says "Google Play" — both
  match the locked platform bracket). CLOSED.
- **AY-7 ED lockout/cleared screen-reader announcement: APPROVED** —
  announce using the EXACT visible header text (ED_PATTERN_LOCKOUT_COPY /
  ED_PATTERN_CLEARED_COPY), mirroring PRCelebration's pattern. No new
  wording, no ED-safety logic change.
- **LT-3 light-theme elevation: IMPLEMENT THE POLICY** ("Do this", with
  lead judgement latitude): light-theme-only shadow token on the shared
  Card primitive; dark theme keeps the surface ladder untouched.

## D18 — Plan-F progress-photo corroboration (founder, 2026-07-09, resume session)
- **Founder ruling, verbatim intent: THERE IS NO STAGE 2. Everything that
  needs coding gets coded now. No putting things off.** The staged-rollout
  framing is dead: plan-F's ENTIRE coding surface builds now as one piece
  of work — receipt copy (old Stage 0), the persisted classification-
  history table + guard tests (old Stage 1), AND the bounded corroboration
  attachment (photo signal may move confidence.level by exactly one
  bounded step under the named rule in plan-F §4.4; the byte-identical
  engine guard narrows to a bounded-delta guard as part of this build).
- **Safety bounds are part of the build, not optional:** floors untouched,
  one bounded step maximum, suppressed under ED flag/calm mode,
  adherence-neutral framing, deterministic. Engine hunk gets hands-on
  Fable lead review (or hands-on build) at landing per the standing
  engine rule.
- **Non-coding validation items (founder-side, not code):** Tier 1
  volunteer study = leave as-is, revisit later. Tier 2 external programme
  = not at this time. Neither blocks the code above — that is the
  founder's explicit call.
- Stage 0 receipt wording: builder reads plan-E's open question 2 context;
  if a genuine wording fork remains, surface it, do not invent.

## D19 — RED-S wording, VC-1, plan-A band fork (founder, 2026-07-09, resume session)
- **RED-S / autoregulation footer tooltip: DRAFT FOR REVIEW.** Lead drafts
  the two ED-adjacent glossary entries hands-on against the locked voice
  doc; exact strings return to the founder for sign-off before the
  tooltip ships.
- **VC-1 light-theme brand palette: APPROVED AS CODED** (primary ink
  #8A5200, warning #6E6300 and the rest of the light ramp in theme.js).
  VC-1 CLOSED.
- **Plan-A band fork: AMEND THE RULE FOR THIS CASE.** Dated ruling: band
  exercises may enter a LOADED plan ONLY when the user's equipment
  context has no measurable vertical-pull alternative — the narrowest
  possible exception, test-pinned. The general "bands never reach a
  loaded plan" rule stands everywhere else. QUEUED as a build.

## D19 addendum (founder, 2026-07-09, resume session)
- **RED-S / autoregulation tooltip wording: APPROVED AS WRITTEN.** The two
  live coachGlossary strings (autoregulation + redS, surfaced as
  InfoTooltips on the CoachOutput credential footer) are founder-signed-off
  verbatim. The stale "needs founder wording" triage entry is CLOSED.
- **Standing order re-affirmed: agents stay at the LOWEST tier that gets
  the job done to standard, at all times, to preserve tokens.** Sonnet for
  builds, Haiku for mechanical work; Opus only where engine-grade
  judgement is unavoidable; Fable never dispatched.

## D20 — Ultimate-Audit items 11-16 GO (founder, 2026-07-10)
(Originally mis-numbered D16, colliding with the 2026-07-09 Settings-cluster
D16; renumbered. Code and tests citing "D16" dated 2026-07-10 — the
autonomy-hold flag in weeklyCoach.js and the d16Autonomy test files —
mean THIS ruling.)
Source rulings: docs/ux-world-class-audit-2026-07-09/ultimate-audit-11-16-reconciliation.md
(June register reconciliation). Founder: "Start all, in that order":
13 (mid-session swap clause) -> 12 (raw/cooked basis toggle) -> 11
(named autonomy modes; safety rule: never auto-apply during a hold) ->
15 (timeline food logging, large) -> 16 (micronutrients/NRV completion,
large, partially built). Two agents at a time; engine/safety-adjacent
pieces get hands-on lead review; 15 and 16 get a scoping read first.
Item 14 Core-Haptics: RESEARCH approved (package name, purpose, licence,
maintenance health; managed-Expo-compatible) - returns for the founder's
final yes/no BEFORE any install (never-add-deps-without-asking rule).

## D21 — Core-Haptics adoption (founder, 2026-07-10)
(Originally mis-numbered D17, colliding with the 2026-07-09 rest-day D17;
renumbered. The haptics commit message citing "D17" means THIS ruling.)
Item 14 final yes: ADOPT react-native-haptic-feedback v3 (MIT), restricted
to its triggerPattern() JS API (no .ahap, no manual Xcode edits). Scope:
richer iOS curves for rest-timer completion and PR celebration only;
Android keeps existing behaviour; expo-haptics remains for everything
else. Dependency added with package-lock.json regenerated in the same
commit (lockfile rule). Needs a fresh EAS build (founder-side).

## D22 — Items 15 and 16 rulings (founder-delegated to lead, 2026-07-10)
Founder: "You make these decisions." Lead rulings:
- **15a layout: CONTINUOUS LIST WITH QUIET DAY-PART LABELS.** One
  chronological scroll, soft Morning/Afternoon/Evening markers, meal
  names become small tags on entries. Truest to the June ruling
  ("timeline replaces rigid meal buckets") while staying scannable.
- **15b time truth: EDITABLE EATEN-TIME + UNTIMED BULK.** Entries gain
  an optional editable eaten-at time; bulk-confirmed entries carry no
  precise time and display grouped under their meal tag rather than a
  false timestamp. Resolves the honesty/ED flag properly; additive
  eaten_at column (local + cloud, founder-run) per the item-12 pattern.
- **16a path: DATA FIRST, THEN DISPLAY.** Feasibility spike parsing
  CoFID's vitamin/mineral sheets into the bundled snapshot + re-issue
  the food_library_pull RPC for the 27 columns. Shipping a display on
  0% coverage would repeat the exact dead-space failure D12 killed;
  parking would defer codeable work. Display ships only once measured
  coverage is real.
- **16b home: PER-FOOD DETAIL SHEET primary + FOOD INSIGHTS weekly
  average secondary, CONTINGENT on the spike proving truthful coverage.**
  Never a daily-policing surface; the diary placement stays dead (D12).
  Visual register: quiet, non-quantified-first, consistent with
  femaleNutritionAwareness precedent; exact presentation returns for
  founder eyes with the spike's coverage numbers.

## D23 — Design/UX leveling mandate + dependency standing approval (founder, 2026-07-10)
- Founder (verbatim intent): "Is there anything we can do to level up the
  design and UX even further? Extra dependencies and things are allowed
  if they genuinely enhance our product. Mark this as approved too going
  forward."
- STANDING APPROVAL: new dependencies no longer need a per-dependency
  founder round WHEN they genuinely enhance the product. Discipline that
  remains mandatory for every adoption: permissive licence verified,
  maintenance health verified, lockfile regenerated in the same commit,
  recorded in this register with name/purpose/licence, native deps
  flagged for an EAS build. The never-re-propose register still stands
  (media, plate calculator, social proof, RPE/RIR).
- Design/UX leveling work is authorised as a fresh order in this run.

## D24 — Design/UX leveling slate approved (founder, 2026-07-10)
Founder: "OK approved all those." The five leveling items are GO:
1. RESTART-FREE THEMING — reinstated (the 2026-07-10 suspension is
   lifted for this item); build proceeds from the plan doc
   CP-10-restart-free-theming-plan.md, primitives-first staged rollout,
   flagship design project.
2. @gorhom/bottom-sheet adoption (MIT) — gesture-native snap-point
   sheets, migrating the app's custom sheets; D23 dependency discipline
   applies (licence/health verified, lockfile same commit, register
   entry, EAS build flag).
3. Image polish — blurhash/thumbhash placeholders via the installed
   expo-image on progress photos and remote imagery.
4. Shared-element transitions (Reanimated 4, already installed) —
   exercise card->detail, photo grid->viewer.
5. Dynamic-type completion pass — every screen resilient at the largest
   font sizes (extends the approved ability/ease emphasis).
Sequencing (two agents max, product-first): theming stages + bottom-sheet
first (bottom-sheet waits for the NRV agent to release the food sheet
surfaces), then transitions + blurhash, then the dynamic-type pass.

## D25 — Best-in-class dependency slate approved (founder, 2026-07-10)
Founder: "I approve all those too." Approved in full:
- react-native-keyboard-controller (keyboard feel, every input moment)
- zeego (native long-press context menus)
- react-native-awesome-gallery or Reanimated hand-roll (lead decides at
  build by product quality) for progress-photo viewing/compare
- Rive for onboarding/empty-state motion — NOTE: needs designed
  animation assets; adoption lands when assets exist (founder-side or
  commissioned), library work may precede content
- Brand variable font via expo-font — founder taste retained on the
  final typeface choice; lead brings a shortlist
- No-dep enhancements: SQLite FTS5 instant search (foods/exercises/
  history), chart scrub haptics (new pattern API), Android themed icon /
  edge-to-edge / splash polish
D23 discipline on every adoption (licence, health, lockfile same commit,
register entry, EAS flag for native deps). Sequencing after the D24
five, two agents at a time: keyboard-controller + FTS5; zeego + gallery;
scrub haptics + Android polish; Rive/font as assets and shortlist land.

## D26 — Competitor-separation picks approved (founder, 2026-07-10)
Founder: "Approve your suggestions." Approved: (1) OFF micronutrient
parsing into the bundled snapshot (branded/retail foods gain verified-
style micro depth; same honest Tr/N-null pattern as the CoFID landing);
(2) MLKit code-scanner frame processor on vision-camera (faster,
low-light-tolerant barcode scanning; D23 dependency discipline).
NOT covered by this approval: the AI-assisted food input fork (photo
meal-scan / voice) - explicitly left with the founder, still OPEN,
neither approved nor on the never-re-propose register.

## D27 — Workout-logger separators approved (founder, 2026-07-10)
Founder approved the FOUR logger items (corrected count; the AI food
input fork remains OPEN, neither approved nor rejected):
1. iOS Live Activity rest timer: HOLD LIFTED — wire the already-built
   modules/rest-timer-live module. Founder-side prerequisites stand:
   App Groups provisioning + fresh EAS build.
2. Android rest-timer notification actions (skip / +15s from the
   notification): verify what exists, build the gap.
3. Context menus on logged sets: emphasis within the already-approved
   zeego adoption (D25) — the logger is its first surface.
4. Watch app: SCOPING programme approved (memo -> founder round before
   any build; builds on the existing P12 watchOS memo; must respect the
   removed-HealthKit state).

## D27 addendum — AI food input: HELD (founder, 2026-07-10)
Founder: "Hold the AI I'm not sure it's good enough or accurate enough
for use." The AI-assisted food input fork (photo meal-scan / voice
logging) is HELD by founder order - not rejected, not approved; do not
build and do not re-propose unprompted. The coaching engine's no-AI
rule was never in question and stands absolutely.

## D28 — Adversarial review goes external; R1 pulled into the queue (founder, 2026-07-10)
Founder: "let's get these all done and I'll ask codex to do a full
adversarial." Rulings recorded:
- The HELD adversarial whole-diff review transfers to the FOUNDER,
  executed externally (Codex). The internal held task closes as
  superseded; findings from the external review return here as work.
- R1 (curated-meal additions carry no FSA allergen tags/filtering; soya
  and mustard reachable by allergic users on filtered meals) was held
  ONLY because it belonged to that review - with the review external,
  the FIX joins the internal build queue NOW at high priority: tag
  allergen-bearing additions in the curated data + filter by the
  profile's allergen excludes wherever additions render (CuratedMealSheet
  + the diary season-to-taste row + MealPlan additions lists).
- The remaining runway (in-chat list, recorded in the handover) is
  confirmed GO in full.

## D29 — World-class campaign slate approved (founder, 2026-07-10)
Founder reviewed the /10 scorecard (SCORECARD-2026-07-10.md) and confirmed
"all to be done other than exercise media, rest day notification." Full
approved slate documented in CAMPAIGN-2026-07-10-APPROVED-SLATE.md.
- APPROVED (build): every scorecard target item - Coach-half polish,
  finish restart-free theming (stages 4-5), dietary discoverability,
  haptics + dynamic-type completion passes, LiftProgress metric bug,
  history/cardio theming, raw/cooked chip, PR markers on LiftProgress,
  TierComparisonStrip on Subscription, Android rest-timer actions, photo
  gallery, keyboard-controller + zeego, shared-element transitions +
  Android polish, MLKit scanner, small tails. NEWLY UNHELD: iOS Live
  Activity wiring, drag reorder, giant sets (3+), Rive/brand-font
  (asset/taste-gated).
- STILL HELD (founder, do not build): #18 exercise media, #22 rest-day
  notification.
- Two agents at a time, lowest tier, leverage order per the campaign doc.
- Codex external audit CLOSED AUD-01..07 (6 fixes on main, AUD-06 refuted);
  our branch rebased onto that tip; combined tree green (657/8223).
- Chat cleared after this; a fresh Fable session resumes from the handover's
  FRESH SESSION START block.

## D30 — Dynamic-type global ceiling = codemod sweep (founder, 2026-07-10)
Context: campaign item 6. React 19's automatic JSX runtime silently drops
Text.defaultProps (empirically proven against this repo's babel pipeline
with a compiled-JSX probe), so the standard one-line app-wide
maxFontSizeMultiplier default cannot work under RN 0.81 + React 19. The
targeted 1.3 caps on dense fixed-size surfaces landed first (0c85864).
Options put to founder: (1) scripted codemod adding an explicit cap to
every raw Text/TextInput across ~85 screens; (2) boot-time wrap of RN's
Text/TextInput exports (works, but undocumented and upgrade-fragile);
(3) per-component caps only; (4) new shared AppText primitive + rolling
migration.
- FOUNDER RULING: **Option 1 — codemod sweep, full build.** Every cap
  explicit, standard and grep-able; no unusual techniques. Queued for the
  next free agent slot after Pair 4 (photo gallery + keyboard/zeego).
- House cap value stays 1.3 (the existing precedent); RestTimer's 1.15
  outlier and RollingNumber's uncapped default are untouched by the sweep.

## D31 — Item 15 transitions technique (founder-delegated, lead-ruled 2026-07-10)
Context: recon proved Reanimated sharedTransitionTag is absent from the
installed 4.1.7 (grep-verified), so the campaign's named technique cannot
be used; the transition is hand-built either way. Three options were put
to the founder (true cloned-card morph / origin-aware zoom / both split
by content); the founder delegated: "You choose the best for our package
and for end users. That's the priority ahead of the work it will take to
get there."
- LEAD RULING: **Both, split by content.** Origin-aware zoom becomes the
  app-wide standard for card->screen pushes (heroZoomTransition extended
  to grow the incoming screen from the tapped card's measured rect, with
  graceful centre-zoom fallback when no origin is supplied); the true
  measure+clone hero morph is reserved for imagery — photo grid ->
  viewer now, any future image surface later.
- Rationale (product, not effort): a cloned morph on text/chrome cards
  cannot return cleanly on the JS stack — morph-on-push with a standard
  back transition is asymmetric and breaks the illusion it just created,
  reading worse than a consistent symmetric origin zoom. On imagery the
  morph is where perceived quality is dramatic, and the photo viewer is
  same-tree (no navigation coupling), so it takes the full treatment.
- Bounds: photo-viewer suppression behaviour (calm/ED) stays pinned;
  Reduce Motion flattens both treatments; no new dependency.

## D32 — Drag reorder scope + session surface (founder-delegated, lead-ruled 2026-07-10)
Context: campaign item 20. The founder's 2026-07-10 GO ("replace
chevron-only reorder with true drag", newly-unheld list, D29)
supersedes D5/D6's 2026-07-09 chevron-only constraint; the two reorder
guard tests update to the new decision (dated comments), KEEPING the
no-new-dependency and no-library pins and dropping only the
runOnJS/PanResponder-era bans that encoded the old ruling. Verification
found the active session has no draggable list (single-exercise view +
tap-to-jump strip), so "true drag in session" is a design fork; the
founder delegated it ("best for the user").
- LEAD RULING: true long-press drag ships on PlanDetail (days),
  ManualBuilder (superset/giant-set blocks move whole) and
  RoutineDetail (drag made block-aware there too, closing that
  surface's pre-existing block gap); the SESSION gets a purpose-built
  reorder sheet opened from the existing overflow — the whole workout
  as a draggable list in a sheet, workout view untouched. Rationale:
  the single-exercise view is a deliberate focus design; in-view drag
  mid-training is ergonomically risky, and a sheet gives real drag on
  a real list one-handed. Accessible chevron/sheet move paths remain
  everywhere (drag is additive).

## D33 — Standing delegation: product-fork decisions to the lead (founder, 2026-07-10)
Founder's words, given on the item-12 and item-20 rounds: "You make
these and all decisions like this. Make the decision based on the best
possible app and service for users not on the work that takes to get
there." Scope as understood: build/UX product trade-off forks of this
kind are LEAD-RULED on product-best-for-users criteria, recorded here
with rationale. This does NOT loosen the CLAUDE.md Section 2
inviolables — ED-safety, billing, tier gating, GDPR, schema rules, and
NEW DEPENDENCIES stay founder-gated, and anything safety-adjacent still
stops for the founder.

## D34 — Item 12: native Service→JS bridge (lead-ruled under D33, 2026-07-10)
The typical-rest (90s) Android notification is the native FGS
chronometer with zero action buttons; only >170s rests get the JS
sticky's five actions. Options were bridge / deep-link buttons /
shrink FGS window / status quo. RULING: build the native Service→JS
event bridge in modules/rest-timer-live so Skip/+15 on the chronometer
notification act SILENTLY (no app foregrounding), routed into the
existing handleRestTimerAction seam (stale-tap guard + clampRestDelta
floor stay). Rationale: it is the only option where the notification
users actually see gains working controls without sacrificing the
locked opensAppToForeground:false design or the E6A live-countdown/
survival benefit. Effort is explicitly not a criterion (D33).

## D35 — Item 20 follow-up: build drag edge auto-scroll (lead-ruled under D33, 2026-07-10)
DragReorderList shipped without parent-scroll auto-scroll at the drag
edge (disclosed limitation). RULING: build it — drag on a
longer-than-screen list must scroll when the finger nears the edge;
drop-and-redrag is not the complete experience. Constraints carried:
no new dependency, pure-arithmetic worklets, Reduce Motion respected,
chevron paths untouched.

## D36 — Item 17 scope rulings (lead-ruled under D33, 2026-07-10)
From the verify-first read: (a) ONE build slot migrates the four
modals item 17 names (HomeChangeWorkoutSheet, HomeBlockShapeSheet,
PlanLibrary quiz, RoutineDetail edit-exercise) to BottomSheet AND
fixes the two genuine bottom-inset gaps found in the same pattern
(ActiveWorkout supersetHeadsUp/unilateralSuggest shared styles,
ExerciseDetail goal modal). (b) FeedbackSheet + PeekMenu (the two
never-finished targets named in BottomSheet.js's own header) WILL be
migrated — real restructure (imperative singleton API), so it gets
its OWN later slot, not folded in silently. (c) TalkBack sheet
isolation (host screen importantForAccessibility while a sheet is
open) WILL be built as its own cross-cutting slot — genuine
accessibility gap that compounds with every migration. (d)
ProgressPhotosScreen's four content modals get a child-component read
pass before any ruling. AppAlert / InfoTooltip / EatenTimePicker /
centred dialogs stay raw Modals by design (correct semantics).

## D33 AMENDMENT (founder, 2026-07-10, later the same day — strengthened)
Founder's words, verbatim: "Regarding decisions when they come up. You
have permission to make them for me. Now make them based on the
absolute best possible solution for the app and end users never on the
work that it takes to get there. If it takes more work to get a
slightly better app, we do more work. Always."
Effect: the delegation is GENERAL and STANDING for decision forks as
they come up, and the criterion is absolute — even a SLIGHTLY better
outcome for users justifies MORE work, always. Effort is never a
tiebreaker. Scope note kept from D33 unless the founder explicitly
says otherwise: the CLAUDE.md Section 2 inviolables (ED-safety,
billing, tier gating, GDPR, schema rules, new dependencies) have their
own explicit founder gates and are not treated as loosened by this
delegation; everything else is lead-ruled on product-best and recorded
here with rationale.

## D33 SECOND AMENDMENT (founder, 2026-07-10 — gates delegated, one exception)
Founder's words, verbatim: "Delegate all those to you note too other
than billing price changes." Effect: the Section 2 gate items
previously carved out (ED-safety decisions, billing, new dependencies,
GDPR/consent, schema rules) are NOW ALSO delegated to the lead, ruled
on the same absolute product-best-for-users criterion — with ONE
exception: BILLING PRICE CHANGES stay founder-gated.
Lead's standing interpretation, recorded so no future session
over-reads this: delegation transfers DECISION authority, not the
underlying obligations. The ED-safety floors/gates, GDPR/Article 9
compliance, EU data residency, product IDs pro_monthly/pro_annual, and
the deterministic-engine rule remain binding constraints on any ruling
(weakening them would never be "best for end users"); billing changes
other than price still get a written test plan per docs/rules/
billing.md; new dependencies still get the D23 discipline (register
entry, licence check, pinning). Every ruling under this delegation is
recorded in this register with rationale.

## D33 REAFFIRMATION (founder, 2026-07-10, third statement)
Founder's words, verbatim: "Under the same basis, best solution always
wins. Never the cheaper option as far as work you do, if there's one
that brings a better app and service for users." No scope change from
the two amendments above; recorded because the founder has now stated
the principle three times in one day — it is the operating basis, not
a preference. When two candidate solutions differ in product quality
AT ALL, the better one is chosen regardless of how much more work it
costs the lead or agents.

## D36d RULING (lead-ruled under D33, 2026-07-10): fix the three photo-modal inset gaps
The read pass verified ProgressScanCompare / ProgressScanTrend /
ProgressPhotoCompare use SafeAreaView edges={['top']} only, so their
bottom-most interactive controls sit under the Android gesture-nav
strip on devices where the inset exceeds the static padding token.
ProgressScanMeaningMoment is already correct, as is the
ProgressPhotoViewer precedent (edges top+bottom, same family, same
day's commit). RULING: build the fix — add the 'bottom' edge on all
six SafeAreaView instances and make ProgressPhotoCompare's
scrollContent bottom padding inset-aware. DO-NOT-DISTURB contract:
usePhotoSuppression call sites, suppressed-branch JSX and placeholder
copy are pinned by tests and must not change.

## D37 — Ultimate-Audit items 11–16 CLOSED as superseded (staleness triage, 2026-07-10)
Founder flagged the risk of pulling month-old audit items over newer
work; a read-only triage verified all six against the tree and git
history. VERDICT: ALL SIX ALREADY BUILT during this campaign — none
may be re-dispatched from the old pass4 blueprints.
- (11) Named autonomy modes: BUILT `8aae4b7` (Coached/Collaborative/
  Manual, autoApplyHoldActive safety gate, scoffPositive added at lead
  review; D16/D20).
- (12) Raw/cooked: BUILT `86125c0`+`c1f0973` (weight_state basis
  stored, NO conversion factor — that ruling superseded the old
  blueprint's conversion design; migrate_114 applied).
- (13) Mid-session-swap wording: BUILT `21f3265` (volume-credit
  clause; mechanism verified already correct).
- (14) Core-Haptics: BUILT `edd84d9` (react-native-haptic-feedback v3
  MIT per D21; `4de5604` config-plugin drop was a CI build fix, not a
  revert).
- (15) Timeline food logging: BUILT `ae9c311` then REVERTED `363d2d7`
  the same day on the founder's device verdict — meal cards are
  canonical; NEVER RE-PROPOSE a flat diary. The durable parts
  (eaten_at schema migrate_115, quiet time display, editable
  eaten-at) shipped and survive the revert.
- (16) Micronutrients/NRV: BUILT IN FULL (schema v58/migrate_109,
  CoFID micros in the seed `a1c10a9`, migrate_116 RPC, per-food
  MicronutrientDetail + WeeklyMicronutrientsCard `203d6ce`; D22
  data-before-display honoured). Remainder is OPERATIONAL only: the
  founder runs refresh-off-snapshot.yml for OFF branded micros.
STANDING RULE (restated): nothing from a pre-campaign audit is built
from its old blueprint; triage against today's tree + this register
first; superseded items are closed here, not resurrected.

## D38 — Jobs must elevate the CURRENT app, never run off a list (founder, 2026-07-10)
Founder's words, verbatim: "Ok ensure all jobs actually enhance what we
have and are built by comparing what we have to the end solution and
that they elevate the app form its current state. Not just because
they're on a list at some stage."
Effect, standing: before ANY job is dispatched, the brief must state
(a) what the app does TODAY on that surface (verified against the
tree, not a doc), (b) the end solution, and (c) why the delta elevates
the app as it is now. A task being on a list, in an audit, or in an
old queue is NEVER sufficient reason to build it. If the delta cannot
be articulated or has been eroded by newer work, the item is closed or
sent back to triage, not built. TASKBOARD.md carries this per line:
every queued item states current state → end state → elevation
rationale, and items that cannot are parked in a needs-justification
section rather than queued.

## D39 — ScreenBoundary theming architecture (lead-ruled under D33, 2026-07-10)
The class error boundary cannot consume useTheme (hooks are
function-component only; error boundaries must be classes). RULING:
wrap it — a small functional component reads useTheme and passes the
resolved tokens to the class boundary as a prop; the class renders
from that prop with the current static tokens as fallback so a theme
failure can never break the error UI itself (the boundary must be the
most robust component in the tree). Fallback-path behaviour stays
byte-equivalent when no live theme is supplied. Stage-5 note: landing
the final 8 static components does NOT unlock the stage-5 restart-
prompt retirement — screens coverage still lags (the honesty gate
binds on a toggle's FULL dependency set); stage 5 stays gated on the
remaining screen batches.

## D40 — The campaign operating model is PERMANENT law (founder, 2026-07-11)
Founder asked (verbatim intent): the process — Fable coordinating,
agents doing the work, delegated decision authority ruled on criteria,
the handover + task board discipline — becomes permanent for all
sessions, not a campaign artefact. RULING RECORDED: a "SESSION
OPERATING MODEL (PERMANENT)" block now lives in CLAUDE.md Section 4,
codifying six standing rules: (1) session-start protocol (handover →
TASKBOARD.md → git status → recovery paths); (2) Fable coordinates /
agents work, main-loop reads only to judge; (3) agent discipline
(pairs, explicit tier, full briefs, no commit/push/stash/main);
(4) D33 delegation criteria with the inviolables and billing-price
gate intact; (5) landing discipline (lint+test, per-feature
attribution-free commits, handover + board updated, push); (6) founder
interface via structured multi-choice rounds. Scope note surfaced to
the founder honestly: CLAUDE.md binds THIS repo only — other apps each
need the same block in their own CLAUDE.md (per-repo is the reliable
path in cloud sessions; there is no cross-repo global file here). If
the handover location ever moves, CLAUDE.md's block is the single
place to repoint.

## D41 — Token hygiene measures, all four adopted (founder, 2026-07-11)
Founder asked for sensible token savings at zero cost to design or the
app; presented four docs/process-only measures; founder approved ALL
FOUR as standing practice: (1) the handover is SPLIT — the historical
campaign log lives in `_HANDOVER-ARCHIVE.md` (full history, never
deleted) and the live `_HANDOVER-AND-RESUME.md` stays under ~600 lines,
with stage-log entries older than the current resume point rolling to
the archive at every landing; (2) TASKBOARD.md holds only in-flight /
queued / held — landed-item detail rolls to the archive's TASKBOARD
HISTORY section at each landing; (3) CLAUDE.md's STATUS banner is
slimmed to pointers (live state lives in the docs it points at; the
D33 restatement dropped as redundant with the permanent D40 block);
(4) agent briefs cap final reports — structured, evidence-first, no
narrative padding — with detail-bearing audit evidence exempt. What was
explicitly NOT adopted: lowering agent tiers below capability, skipping
the fresh-eyes adversarial review, or shortening the hard-bounds
sections of briefs — that token cost is deliberate insurance.

## D42 — AppAlert gets the overflow contract (lead-ruled under D33, 2026-07-11)
Founder reported the unilateral one-side-at-a-time advice clipped at
the bottom on Android (possibly iOS too). Diagnosis: the first-timer
walkthrough modal was already fixed (D36a inset; the founder's
installed build predates it), but the RECURRING unilateral confirm
rides the shared AppAlert card, which has never had a height cap or
scroll — title + message + actions can exceed a short viewport with
the buttons unreachable, on both platforms. RULING: fix AppAlert
itself, not the unilateral call site — maxHeight cap with an inner
scroll region and the Math.max(token, insets.bottom + token) contract
the sup-modals are pinned to, so every alert in the app (delete,
unpair, cancel-subscription, the unilateral confirm) becomes
clip-proof. Best-product criterion: one shared fix over a
surface-local patch. Action chrome, a11y roles and copy unchanged.

## D43 — FOUNDER ORDER: complete world-class UX pass (founder, 2026-07-11)
Founder's words (device-walking build 2608): "The entire thing for the
workout looks absolutely terrible it needs a complete world class
level redesign... It's not just the workout the layout buttons
everything... A complete ux pass and fix needed." STANDING ORDER
recorded: a full visual/UX quality pass of the app, workout experience
first, judged at the world-class bar, with the founder's photos as
evidence. SEQUENCING (lead, under D33): (1) land the point fixes
already diagnosed (set rows b1403c9, AppAlert in flight, swapper
next); (2) systemic visual audit - zeego clobber footprint beyond set
rows, any other window-2608 break; verified hands-on that
resolveTheme(defaults) shares the frozen token tables, so live theming
at default prefs is not the cause, and the founder confirmed
all-default display settings; (3) fresh green build named for the
founder's re-walk; (4) the redesign pass proper - lead-driven design
judgement, Opus agents for legwork, area by area against best-in-class
references. The pass is NOT conditional on the founder re-walk; it
starts once the point fixes land.

## D43 AMENDMENT (founder, 2026-07-11): logger verdict 3/10, target 10/10
Founder's words: "Let's not hide the entire workout logger is about a
3/10 now we need 10/10 we need a complete redesign in line with the
rest of the app." Standing scope for the D43 pass: the workout logger
gets a COMPLETE redesign to the 10/10 bar, cohesive with the rest of
the app (the ONE-amalgamated-application mandate), not a
polish-in-place. Process: point fixes land first (they stop the
bleeding on the current build); the lead then produces a full
redesign blueprint (hands-on design judgement, Opus agents for
research/reference legwork), presented to the founder for approval
BEFORE the build slots open. The blueprint covers: set entry, logged
sets, rest/timer surfaces, exercise navigation/swap, progression
cues, superset/giant-set presentation, and every button/control on
the logging path, judged against best-in-class references.

## D44 — Superset jumps get cues; round-return built (lead-ruled under D33, 2026-07-11)
Founder: "seems to swap exercise when there's still a set to do at
times without saying anything." Diagnosis: the superset/giant-set
forward jump (handleCompleteSet ~1614-1627) fires on any logged set of
an earlier group member - intended A1->B1 alternation, but with zero
cue (no distinct haptic, no announcement, no visible sign); AND no
mechanism returns focus to the group's first member for the next
round, despite the giant-set guard's own comment asserting it -
the user is silently stranded on the last member. RULING: (a) every
group-driven focus change gets the cue treatment the target-reached
advance already has - distinct haptic, announceForAccessibility, brief
visible banner naming the destination exercise, voice-locked copy;
(b) build the round-return: logging the last member's set moves focus
back to the group's first member with the same cue, completing
A1->B1->A2 as the tests claim. Alternation logic itself unchanged;
engine untouched; copy lead-reviewed at landing.

## D43 SECOND AMENDMENT (founder, 2026-07-11): full-app pristine pass, sequenced last
Founder's words: "a full UX pass should be added to the list and
polish every... absolutely every area to be looking pristine, every
area to be completely and utterly world class. And fitting in with
all the work we're doing now, so I guess we'll do the polish at the
end." STANDING ORDER: after the current defect fixes, the engine
verdict, and the D43 logger redesign, a FULL-APP polish pass runs as
the closing phase - every area brought to the pristine/world-class
bar, cohesive with the one-amalgamated-application mandate. Judged
area by area (the SCORECARD-2026-07-10 rubric is the baseline
instrument), lead-driven design judgement, founder holds taste vetoes.
Sequenced LAST by founder's own call so it polishes the finished
work, not surfaces that are still changing.

## D30 — Engine set-cap + ease-in: investigated, NO CHANGE (lead ruling, 2026-07-10)
Founder delegated two engine questions to the lead with "investigate the
science and bodybuilding then make the call, don't guess." Investigated
against the actual engine + settled hypertrophy science. Both question
premises were misreadings; the engine is already evidence-correct. NO
change to the deterministic engine (correct outcome, not neglect).

1. "Session stacks 21+ sets" is NOT junk volume. Junk volume is a
   PER-MUSCLE-per-session concept; the engine caps it at 8 sets/muscle
   (12 for a weak point) at planEngine.js:1372-1382, matching the ~6-8
   productive-sets-per-muscle-per-session evidence and the principle that
   extra weekly volume comes from FREQUENCY not one giant session. Total
   session size is governed by the user's time budget (trimToTimeBudget),
   not an arbitrary total-set ceiling. A 21-set session = ~3-4 muscles x
   ~6-7 sets within budget = a normal full-body/upper day. Correct as is.
2. "Ease-in week 1 multiplier 1.00 = no reduction" misreads the two
   layers. The block base is set to MEV (the minimum EFFECTIVE volume, the
   floor) at planEngine.js:2666; the mesocycle then ramps it week1=1.00x,
   wk2-4=1.10/1.20/1.25x, wk5/6=0.50x deload (mesocycle.js:17-30). Week 1
   at 1.00x IS the ease-in - it delivers MEV, the lightest working week -
   then progressively overloads. Reducing week 1 BELOW MEV would waste a
   productive week (below-MEV is deload territory, correctly placed at
   block end). Label "Introduction week. Settle into the movements" is
   honest. Correct as is.
Do NOT re-open either as a defect; if a future session believes there is
a junk-volume or ease-in problem, re-read this ruling first.

## D45 — Per-session hard caps: 8 exercises / 25 working sets (founder override of the D30-engine ruling, 2026-07-11)
The engine no-change ruling above (recorded out of sequence as a second
D30) held that "total session size is governed by the time budget, not
an arbitrary total-set ceiling." The founder overrode point 1 of that
ruling directly: "There has to be a maximum per session too, otherwise
you try and jam 9 exercises into one day and absolutely kill yourself.
No bodybuilder does that."

The founder was right and the prior ruling was wrong on this point. On
investigation the time budget did NOT actually bound a session: because
`trimToTimeBudget` protects a muscle's sole exercise in a session, a
low-frequency full-body day (2-3 days/week, every muscle every session)
could hold 9-10 single-exercise muscles that neither the per-muscle cap
(a per-muscle concept) nor the clock could shave - a probe found a real
config (intermediate, 2 days, mens_physique) generating a 9-exercise /
28-set session that also silently overran its own 45-minute clock. The
per-muscle cap and the time budget were both real, but NEITHER bounded
total session size, exactly the gap the founder named.

RULING (lead, executing the founder override): add two hard,
clock-independent per-session ceilings to the deterministic engine -
MAX_EXERCISES_PER_SESSION = 8 and MAX_WORKING_SETS_PER_SESSION = 25 -
enforced through the SAME lowest-priority-first trim as the time budget
(one `overBudget()` predicate now covers clock + exercise count + set
total), plus a final backstop that guarantees the caps are hard by
dropping the lowest-priority exercises (never the opener, never below 3,
non-required first) and shaving sets to the ceiling only when still over.
In the full-body case a dropped muscle is still trained on the split's
OTHER day, so its weekly presence is preserved while the marathon is
trimmed; every structural and weak-point floor is protected exactly as
before.

Numbers rationale (science, per the "don't guess" standing instruction):
real physique sessions run ~4-7 exercises / ~15-25 working sets total; 8
and 25 are ceilings no honest session should reach, past which the added
work is junk fatigue not more growth - the same stimulus-to-fatigue basis
as the per-muscle 8/12 cap, applied at the session level. 8 still allows
a legitimate full-body day its breadth.

Landed: da59274 (cap + behavioural invariant test
`planEngineSessionCap.test.js`). Determinism preserved; ED-safety surface
untouched (training volume only, no nutrition/calorie floors). The
ease-in point (point 2 of the D30-engine ruling) stands unchanged.
Do NOT re-open the session-cap question against the old D30-engine text -
this D45 supersedes its point 1.

## D46 — Full per-exercise secondary-muscle model (founder, 2026-07-11)
Founder, shown the leg-day over-stuffing diagnosis (a leg+abs day trying to
give every individual leg muscle its own dedicated exercise), correctly named
the cause: "maybe it's not counting secondary muscles or something." Verified
against code: the engine has NO working secondary-muscle model. Every POOL
exercise credits exactly one muscle; the `entry.secondary` field is read at
planEngine.js:2091 but NO POOL entry populates it, so indirect-volume
reporting is dead and, more importantly, a leg day double-counts — squats and
RDLs already hammer glutes/adductors, but the engine can't see that, so it
piles dedicated glute isolation (hip thrust + step-up) on top. The only
functioning synergist credit is two hardcoded weekly trims (biceps<-back 0.4,
triceps<-chest 0.5, planEngine.js:371-372); nothing on the lower body.

Offered four scoped options (surgical-now-then-full; full-only; surgical-only;
cap-is-enough), the founder ruled: **"Do it all fully, we do not put off
jobs."** RULING (D46): build the FULL per-exercise secondary-muscle model —
(A) populate `secondary` tags across POOL + poolGenerator (wires the dead
indirect-volume reporting), and (B) generalise the weekly synergist trim from
the two hardcoded pairs to the full biomechanically-real relationship set with
science-calibrated rates (glutes<-quads, glutes<-hamstrings, adductors<-quads,
plus upper-body completeness), so a muscle already fed heavily by compounds
gets appropriately less DIRECT volume and the leg day stops stacking redundant
isolation. All Section-2 inviolables bind: determinism, MEV floors held via
the existing MEV+2 trim buffer, structural muscles never zero, weak points
exempt, glute-priority divisions (bikini/wellness) exempt from the glute trim,
no new deps, engine stays pure/no-AI.

QUEUED for the next fresh Fable session (founder deferred the build under usage
pressure 2026-07-11). Full mapped-out build spec:
`docs/ux-world-class-audit-2026-07-09/SECONDARY-MUSCLE-MODEL-BUILD-SPEC.md`
(problem + reproduction + design halves A/B + phases 0-6 + invariants +
device checklist + code anchors). The acute symptom is already contained by
D45 (`da59274`, per-session hard caps), which is the safety net that lets D46
be built properly rather than rushed.

## D46 LANDED (lead, hands-on, 2026-07-11 — fresh session)
Built in full per the spec, commit `19907a2`. Implementation rulings made
under D33 during the build, each recorded in code comments:
1. **Seed is the single source of truth for secondary tags.** POOL's 65 new
   `secondary` arrays were mirrored programmatically from seedExercises.js
   (union seed primary, minus the POOL entry's own primary, for the three
   cross-primary names) so the two taxonomies cannot drift. Abductor Machine
   (not in seed, isolation) stays untagged.
2. **No rear-delt / traps / front-delt transfers.** Their landmark overrides
   already set MEV 0 BECAUSE they are indirect-fed by design (planEngine
   GENERATOR_LANDMARK_OVERRIDES); adding a transfer would double-count the
   discount. Quads/hamstrings are only ever drivers. Adductors are only
   programmed by glute-emphasised (exempt) divisions, so no adductor trim.
3. **De-emphasised structural floor = effective maintenance with one honest
   entry.** overlay < 1.0 structural muscles owe maint EFFECTIVELY
   (direct + indirect) and keep a minimum ONE 3-set direct entry — never a
   1-2 set sliver, never zero direct (delivery-estimate slack protection,
   and the structural "maintenance, not zero" promise kept in direct work).
4. **Glute-emphasis exemption is overlay semantics, not a goal list:**
   overlay.glutes >= 1.2 (Bikini 1.55, Wellness 1.60, Figure 1.25, Women's
   Physique 1.20) skips the glute trim entirely. Found via the
   coachDivisions stage-2b pin when the first goal-name version (bikini/
   wellness only) trimmed figure's judged glutes 10 -> 8; the overlay rule
   keeps every glute-signature division untouched at its ORIGINAL pin.
5. **T-C re-pin.** The structural-volume T-C test now asserts mens_physique
   glutes effective (direct+indirect) >= 6 with direct >= 3; quads keep the
   pure direct >= 6 pin (no indirect source exists for them).
Outcomes: mp 5-day leg day 8ex/24 -> 7ex/22 (stacked second glute exercise
gone); cp6/general/bikini workout outputs byte-identical; 1,080-config
sweep: effective-maintenance misses 126 (pre-existing) -> 0; the 8 remaining
findings are a pre-existing 2-3-day bodybuilding delivery compression,
byte-identical on the old engine (noted, NOT fixed — out of D46 scope).
Full suite 683 suites / 8,456 tests green, lint clean. New invariant suite
`planEngineSecondaryMuscle.test.js`. Adversarial review dispatched before
push per the operating model.

## D46 ADVERSARIAL REVIEW OUTCOME (2026-07-11)
Fresh-eyes hostile review (Opus, against the build spec) of `19907a2`:
all 20 spot-checked secondary tags seed-faithful; biceps/triceps trims
byte-identical across a 240-config sweep; overlay exemption gate correct
for every division; weak-point skip verified; blast radius clean (no
other consumer of pool entries reads `secondary`; built exercise objects
never carry it); indirect reporting hand-count matched exactly.
ONE MAJOR defect found and FIXED (`209c5e1`): the glute credit was
estimated from weekly TARGETS, but a thin equipment pool (bodyweight
quads = sissy squats; machine-only hamstrings = leg curls) delivers none
of the promised indirect work, so a bodyweight/machine-only Men's
Physique athlete's effective glutes dropped below the structural
maintenance floor (bodyweight 5-day: 3 delivered vs 6 pre-D46). Fix: the
trim now requires BOTH driver pools, filtered to the user's equipment,
to offer at least one glutes-tagged compound (derived from the same pool
data as the credit, so the gate cannot drift); otherwise the trim skips
and the full direct floor stands. The review also exposed that every
probe and test ran full_gym only — the invariant suite now sweeps all
six equipment settings and pins the exact reproduction. Full suite after
fix: 683 suites / 8,457 tests green, lint clean.

## D47 — The queue is not curated: everything gets done, in order (founder, 2026-07-11)
Founder correction, verbatim intent: "No — you don't rule on what to do
and not to do. It all gets done in order." Standing law, permanent:
D33 delegation covers PRODUCT-FORK decisions (which design/approach best
serves users on a job already being done). It does NOT extend to scope
selection. The lead never decides WHETHER a board item gets done, never
re-prioritises it away, never parks it as "later" by preference - the
board is worked TOP TO BOTTOM, every item, in the order it carries
(founder-set sequencing like "pristine pass LAST" is part of that
order). Items advance the moment a slot or the lead's own hands are
free; blocked items (founder-gated inputs) are surfaced and the NEXT
item in order starts immediately - blocking never reorders anything
else. This extends the no-parking rule (Section 4 absolute) from build
scope to queue discipline.

## D48 — Gates are RULED, not waited on (founder correction, 2026-07-11)
Founder, after the lead paused work "awaiting founder approval" on the
D43 blueprint and the font pick: "You make the decisions!! Based on what
brings the best app. You do not park things!!" This restates what the
D33 SECOND AMENDMENT already delegated ("Delegate all those to you...
other than billing price changes") and the lead failed to apply.
STANDING LAW: pre-approval pauses ARE parking. Every decision gate except
BILLING PRICE CHANGES is ruled by the lead on the product-best criterion
and the work PROCEEDS immediately; the founder holds retrospective taste
vetoes (device walks, on-sight reversals), never blocking pre-approvals.
Rulings recorded here as always.

## D49 — D43 blueprint RULED APPROVED; build begins (lead-ruled under D33/D48, 2026-07-11)
The blueprint (D43-LOGGER-REDESIGN-BLUEPRINT.md) is ruled approved as
authored: strong core preserved, new shell per its Section 3, five slots
S1-S5 worked in order starting immediately with S1 (decomposition, zero
visual change). Founder taste veto applies at the device walk.

## D50 — Brand typeface RULED: Manrope (lead-ruled under D25/D33/D48, 2026-07-11)
From the delivered shortlist: Manrope. Rationale: verified tabular
figures (the type.num() numerals system is a hard requirement), full
200-800 variable weight axis in one file, SIL OFL, and the best
calm-but-ownable fit for the locked coaching voice - distinct from
system fonts without reading techy or soft. Inter was the zero-risk
baseline but is ubiquitous (weak brand distinction) - product-best wins
over safest. Adoption slot per the shortlist's plan, in queue order;
founder may veto on sight at the device walk.

## D51 — Token economy: lowest-tier agents, lead coordinates only (founder, 2026-07-11)
Founder order during the session ("Use the lowest level agents you can
as well to preserve usage... Do not read and writes from you"): the
premium main loop dispatches, judges diffs via targeted spot-checks and
rules - it does NOT do its own bulk reads, writes, probes or doc
upkeep. All mechanical work (docs recording, recon, conversions, test
writing) goes to the LOWEST capable tier (haiku for mechanical, sonnet
for risk-bounded builds). Standing law alongside D40/D47/D48.

## D50 LANDED + CP-10 COMPLETE (2026-07-11)
Manrope adopted at `9148a6f` per the D50 ruling: five static weight
instances generated from the verified official variable font (tnum,
axis range and OFL all checked in-file with fontTools before wiring),
swapped through the single fontFamily token file on the codebase's
established static-cuts pattern; full suite green; dead Inter files
removed in the follow-up commit. Founder device walk: cold launch (no
font flash), numeral column alignment in the logger and diary, a11y
toggles, ED surfaces layout-stable.
CP-10 is COMPLETE: batch G closed the last static screens (3adf551,
4947509) and stage 5 retired the restart prompt (`3d3eae8`) - 83/83
screens live-themed, settings apply straight away.

## D52 — Kala namak tip KEPT with a sourcing note (lead-ruled under D33/D48, 2026-07-11)
The open micro-call on the vegan tofu scramble's kala namak addition
(real vegan bodybuilding practice, but not mainstream-UK-stocked) is
ruled KEEP: the app's coaching credibility rests on teaching authentic
technique, the tip is one optional free addition among four (the other
three are mainstream), the sulphite allergen tagging already protects
sensitive users, and it is next-day-deliverable online in the UK. The
copy gains a sourcing note ("Find it in Asian grocers or online") so
the tip never frustrates. This closes the last NEEDS JUSTIFICATION
board item.

## D53 — Manrope VETOED on sight; Inter restored; visual-change gate (founder, 2026-07-11)
Founder device verdict on the D50 typeface: "horrendous... makes the app
look childish... revert." Executed: `9148a6f` and `982f0d2` reverted
(`52e65dd`, `a6083f7`), Inter restored byte-identical, guard re-pinned by
the revert, full suite 8,485 green. D50 is REVERSED - do not re-propose
Manrope or any typeface change unprompted. STANDING LAW (founder): no
major visual or interaction change ships unilaterally again - material
design changes are clearly identified and justified to the founder
BEFORE they land, even under D48 (D48 still covers non-visual gates).
The dead slice-2 agent's WIP snapshot was reverted unreviewed
(`b2be386`); S1 slice 2 restarts clean when the logger queue resumes.

## D54 — Unilateral logging redesigned: one set, same reps both sides (founder D9 reversal, lead-ruled ED review, 2026-07-11)
Founder device verdict: the D9 two-phase per-side flow asked for reps
INDEPENDENTLY on each side and stored the lower - ED-adverse, normalises
imbalance. REVERSED. A unilateral exercise now prescribes ONE reps value
for both sides; logging guides side one -> rest-class transition (D9
amendment 2 rest unchanged) -> side two -> one recorded set with the
single prescribed reps. Guided sheet moved onto the shared
WorkoutBottomSheet idiom. No per-side rep field remains. Old rows still
render their L/R breakdown read-only (formatPerSide in LoggedSetRow);
engine, database and migration 054 untouched. Lead ED-safety review
confirmed the divergent ask is gone and the record path writes one
value. Landed `f94d156`, unilateral guard rewritten to the new contract
23/23, full suite green. Terminology: this is the sequential/unilateral
case (all reps one side then the other), not alternating.

## D55 — Pause for founder review before the big backlog (founder, 2026-07-11)
Founder instruction: once the current device-testing wave fixes (the 12
hands-on items) are all landed, PAUSE the queue. Do NOT auto-proceed into
the remaining board backlog (D43 logger S2-S5, the pristine pass, growth,
etc.). Instead bring the founder a reviewed remaining-task list: for each
item, what it brings to the app, whether it is genuinely necessary, and
how much it improves the user experience - so the founder steers what is
built next. This is a scoped exception to D47 (work top to bottom): the
device-wave is worked to completion in order, THEN a review gate before
anything below it. Standing until the founder resumes the queue.

## D56 — Never park, never pick-and-choose; complete the job or surface the problem (founder, 2026-07-11, EMPHATIC)
Founder, verbatim: "You do not, EVER, park things silently and pick or
choose. We complete the job. If there's a problem with it, or it'll make
the app worse. Bring it up." This is the no-parking rule (Section 4)
stated at maximum force after repeated lead violations this session
(parked Pre/Post meals phase 2 as a "reduced version", deferred the
routine-heading fix to "need a screenshot", handed the founder a made-up
review instead of completing the assigned list). STANDING LAW, absolute:
1. Every assigned job is completed IN FULL. No silent parking, no quiet
   reduced/simpler/"phase 1 only" version, no lead choosing which parts
   to do.
2. The ONLY exception is a genuine problem: if a job cannot be completed,
   or completing it would make the app worse, the lead STOPS and BRINGS
   IT UP to the founder as a surfaced question - never a silent decision,
   never a park.
3. "Investigated and found already correct / no code defect" is a
   COMPLETE outcome only when reported plainly with evidence AND its
   verification path (e.g. confirms on a fresh build); it is not a way to
   close a job the founder still sees broken.
4. The founder's must-fix / assigned lists go on TASKBOARD.md and are
   worked to completion before the lead reports back or moves to backlog.
Supersedes any lighter reading of D33/D48 delegation: delegation is about
HOW to build the best solution, never a licence to not build an assigned
job.

## D57 — Logger redesign GO (cohesion-first, min cost); pristine pass HELD; plate calc DROPPED; token discipline (founder, 2026-07-11)

Founder rulings after the backlog review:
- Action 1 (D43 logger redesign S2-S5): GO. Goal restated: the logger
  must match the rest of the app COMPLETELY and hit world-class, since
  the rest of the app's design is already very good. Build at lowest
  sensible cost.
- Action 2 (D43 full-app pristine pass): HELD for now (rework risk vs
  the CP-10 / consistency / device-wave work already done).
- Plate calculator: ABSOLUTELY DROPPED, never revisit. So D43 S4 is
  in-place set editing ONLY, no plate readout. The blueprint's plate
  reference is struck.
- EAS build fix and Watch-app: PAUSED, revisit later (not cancelled
  work, just deferred by the founder).
- Migrations: founder will trigger (the "run against production" phrase)
  when ready; device-walk is the founder's after the logger lands.
- TOKEN DISCIPLINE (standing): the main loop (Fable) makes only the big
  difficult design decisions; everything else - reads, writes,
  verification - is delegated to the cheapest sensible agent. No big
  reads or writes by the main loop. Be careful about tokens in all ways.

## D58 — Logger S2 landed; beat line KEPT as a compact row (not dissolved into input placeholders) — lead design ruling (2026-07-11)

D43 S2 (Now card + status strip) is built and landed. The two shell
changes the blueprint §3.3/§3.4 called for are done: the ambiguous "N
notes" accordion is replaced by content-labelled chips (StatusStrip:
Deload, Superset, Coach note, Starter session, Target met — named, never
a count), and the Now card moves onto the house `Card` (radius lg/16,
spacing.lg padding) with Line 1 folding the old orientation + target rows
into one tappable line ("Set 2 of 3 - Working - 8-12 reps") and a
note-pencil corner affordance. Chrome above the inputs drops from up to
8 stacked lines to 2.

ONE blueprint mechanic is ruled DIFFERENTLY, on the merits (D33/D48
delegated design authority; surfaced here per D56, not parked). The
blueprint §3.4 Line 2 proposed the beat line "dissolve into the inputs"
as ghost placeholders inside the weight/reps fields. Ruling: KEEP the
beat line as the single compact tappable row it already is, directly
above the inputs. Rationale — the beat line carries strictly MORE than
two prefill numbers can: the directional beat-it cue (the ↑ glyph +
range, a genuine coaching signal), the "Recovery week" deload variant,
the "First time - Target X" variant, and an explicit labelled "Use"
affordance. Ghost placeholders in two numeric fields cannot hold the
glyph, the range, or the deload/first-time context, so dissolving the
line would either DROP coaching signal or push it straight back out as
chrome — a worse app, not a better one. The current row is already one
line, at input size, one-tap-to-apply — exactly the "one honest
mechanism for previous performance, tappable" that the blueprint's own
§2 principles demand. It also keeps the pinned, safety-adjacent
`SetEntry.js` input contract (keyboard-Done-logs, ghost-prefill colour,
tabular-nums, stepper) untouched. This is the better-for-users choice,
not the lighter one. Subject to the founder's device-walk taste veto at
S5 (blueprint §9): if the founder wants the line gone on sight, that
reopens it.

Verification: eslint clean; ActiveWorkoutScreen + SetEntry + LoggedSetRow
+ cp10Stage3WorkoutShells = 15 suites / 126 tests green; the two
source-guard suites re-pinned to the new structure (notesChip thumb
target → StatusStrip chip; "N notes" count wording → content labels +
absence-of-count; targetRow/targetText → orientationTarget fold) with
STRONGER assertions, no pin deleted.

## D59 — Logger S3 landed; guided warm-up ramp KEEPS its overflow row (not forced into the set-type picker) — lead ruling (2026-07-11)

D43 S3 built and landed. Stable CTA (§3.7): the bottom bar's filled "Log
set" primary is now permanent and rendered first; the advance action
("Next exercise" / "Finish workout") appears BESIDE it as an outline
secondary when the target is met, never swapping identity in the same
pixels. The redundant in-scroll "Log another set" button retires — one
tap on the ever-present primary past target both arms `extraSetArmed`
and logs (fewer taps, and "log stays a single stable tap" per the
blueprint §2). Overflow diet (§3.8): "Move exercise up/down" deleted
(the Reorder sheet is the single reorder path; dead
handleMoveExercise/canMoveUp/canMoveDown removed), the "Add/edit note"
row retired to the S2 card-corner pencil, and "Exercise info" relocated
onto a tap of the exercise title.

ONE relocation is ruled DIFFERENTLY on the merits (surfaced per D56, not
parked). §3.8 proposed folding "Warm-up sets" into "the set-type flow".
The agent correctly found the set-type picker only flips
`currentSet.setType` to 'warmup' — it cannot reproduce the guided ramp
(`showWarmupRamp`/`warmupRamp()`: a computed ladder of suggested warm-up
loads up to today's working weight, with the "Empty bar" tag). Ruling:
KEEP the guided warm-up ramp as its own overflow row. Folding it into the
picker would either DROP the computed ramp (a real capability loss) or
bloat a flat radio list with a calculator it isn't shaped for — a worse
app, not a better one. Warm-up as a plain SET TYPE is already reachable
from the picker (that half of §3.8 is honoured); the RAMP HELPER stays in
the overflow. The overflow lands at 7 rows (Swap, Add exercise, Reorder,
Log per side, Warm-up sets, Pair superset, Shorten session, Remove) down
from 11 — the substantial declutter the slot intended, minus a capability
drop the blueprint didn't intend. Subject to the founder's device-walk
taste veto at S5 (same standing as the D58 beat-line ruling).

Verification (lead-run on the settled tree, NOT the agent's self-report):
eslint clean; ActiveWorkoutScreen + SetEntry + LoggedSetRow +
cp10Stage3WorkoutShells = 15 suites / 124 tests green; full `src/screens`
= 132 suites / 1013 tests green. Three guard suites
(nextExerciseButton, reorder, usability) re-anchored to the new structure
with a "D43 S3" note, every invariant preserved, no pin deleted.

PROCESS NOTE (not a product decision): the first S3 agent violated its
brief by spawning a sub-agent, which then ran concurrently with a lead
relaunch on the SAME files — a collision. The on-disk tree resolved to
one clean winner (verified coherent: no duplicate style keys/testIDs,
comments consistent with code, all suites green), but ~420k agent tokens
were burned on duplicate work. Lesson: never relaunch a "no-op" agent
until confirming it left no live descendants; check the task tree first.

## D60 — Logger S5 cohesion pass: three design calls ruled (2026-07-11)

S5 (cohesion polish) found the logger surface already largely tokenised
(S1-S4 did the token work inline: no hard-coded colours, haptics already
on the shared vocabulary). Two pure token substitutions applied and
committed (`bf72c51`: inline-pill minHeight 44 -> workoutLoggerSize
token; orientationRow paddingVertical 2 -> spacing.xxs; byte-identical).
Three design-JUDGEMENT calls were correctly flagged, not guessed; ruled
here on the best-for-users criterion:

1. Logged-row corner radius (radius.xs=4) vs the house Card (radius.lg=16)
   -- KEEP DENSE. The "This workout" logged-set list is a data-dense
   session receipt (one row per set); the house idiom for dense lists is
   compact rows (Diary food entries are dense rows, not cards). The
   cohesion mandate targets the Now card (the hero), which S2 put on the
   house Card. Bumping every row to a 16px card would bloat the receipt
   and cut scannability -- worse for a log. The inline set editor stays
   tied to its row at the same radius. No change.
2. beatLineLabel line-height (hand-rolled 18 vs type.bodySm's 20) -- KEEP
   TIGHT. The beat line is a space-constrained anchor row directly above
   the inputs (D58); the 2px-tighter line-height is intentional density
   where vertical space is most precious. Not forcing the type role here
   is correct. No change. (The other one-off line-heights the agent noted
   -- swapItemReason, firstSetHintText -- are outside the logger hero
   surface and out of this slot's scope.)
3. type.num() on the logged-set data numerals (setNumText, loggedEst1RM)
   -- APPLY. The app-wide "numerals as hero" system puts type.num() +
   tabular-nums on every data number; a stacked column of logged sets
   (100 x 8, 102.5 x 8) genuinely reads better with aligned digits. This
   is the one genuine cohesion win, consistent with the house numerals
   system. Delegated as a small follow-up edit (re-anchor the
   cp10Stage3WorkoutShellsLiveTheme pin to the new invariant, same
   contract).

Calls 1 and 2 (like D58/D59) remain subject to the founder's S5
device-walk taste veto.

## D61 — Logger adversarial review triaged; L1 CTA-arming fixed (founder GO, 2026-07-11)

The mandated fresh-eyes Opus adversarial review of the full S1-S5 logger
arc returned NO blocker/high findings and cleared the arc as safe for the
device walk. It confirmed the S4 edit path reuses the same PR/celebration/
ED-suppression store action (no bypass), every re-pinned guard locks the
same invariant (not a weaker one), and no Section 2 inviolable was
touched. Four minor findings, all triaged:
- L2 (stale "PR not re-run on edit" comment) and N1 (all logged rows
  re-render per keystroke while editing) - FIXED (`49d56db`): comment
  corrected to reflect the L07-F2 re-eval that IS present; the live
  editValue/saving props now flow only to the row being edited so the
  memo shields the rest. Also re-anchored the screen-mount U-A-1 mounted
  test the slot's scoped runs had missed (full suite caught it).
- M1 (inline set editor keyboard occlusion on small Android) - added to
  the founder device-walk checklist as an explicit verify item; the
  editor is now inline in the screen ScrollView (Android adjustResize),
  which is likely better than the old modal, but only a device confirms.
- L1 (an invalid/aborted "Log set" tap past target flipped extraSetArmed
  before the set logged, hiding the advance CTA until the next successful
  log) - founder chose FIX NOW. Fixed by moving the arm OUT of
  handleCompleteSetPress (the tap) and INTO handleCompleteSet's success
  path: a working set logged with the target already met arms
  extraSetArmed only after the set is actually created. Placed after the
  superset forward-jump early-return (a jump changes currentExerciseIndex,
  which resets the flag anyway), so it arms only when we stay on the
  exercise - exactly when the advance CTA shows. Invalid entry (returns at
  validation) and errors (caught) never reach the arm. Guard re-anchored:
  nextExerciseButton.guard now pins that handleCompleteSetPress does NOT
  arm and handleCompleteSet's success path does. Full suite green.

## D63 — In-session PR celebration: full-screen takeover RETIRED, calm toast for all (R3 ruling, 2026-07-11)

The founder's device walk reported: finishing a set greys the screen, a
stunted animation appears and hangs until tapped. Hands-on trace of every
set-completion visual (PRCelebration full path, subdued toast, RestTimer
inline card, auto-advance inline row, the card-border log flash) found
exactly ONE element that greys the screen: PRCelebration's full-screen
overlay (0.85 backdrop + centre card + 40-particle confetti), which fires
on real PRs. Whatever animation glitch the founder's device hit, the
pattern itself violates the logger's first principle (never break the
loop) - no elite logger interrupts logging with a modal takeover.

RULING: the full-screen path is deleted. Every in-session celebration is
the calm top toast (gold icon for real records, primary for the honest
first lift; strong PR haptic ladder kept for real records; light tick for
calm/reduce-motion/first-lift), auto-dismissing at 2.2s, tap to dismiss
early, never obscuring the inputs. The BIG celebration (MilestoneBurst)
stays on the summary screen, untouched. ED-safety: celebrations were
already suppressed via subdued gating; making the subdued surface the
only surface is strictly stronger. The firstLift pin (never the PERSONAL
RECORD treatment) and the P9 TalkBack announcement pins pass unchanged.
Subject to the founder's device-walk taste veto like all R-campaign
rulings.

## D64 — R4 unilateral flow design (lead ruling, 2026-07-11)

Sources: plan-C-unilateral-logging.md (internal study; Option 2
recommended), COMPETITIVE-LOGGER-BAR.md (no competitor has solved
per-side logging; JEFIT forums show live user confusion), DEFECT-MAP.md
R4 (current build: 3 taps - Log set, "Side one done", "Side two done" -
plus touching buttons from a gap-less fragment), and the founder's words:
"two taps to just confirm one side... it needs to be easy to use and self
explanatory."

THE FLOW (2 taps total, no confirm bureaucracy):
1. User does side one, taps the permanent primary "Log set" (reps/weight
   in the inputs as normal). Side one is captured IMMEDIATELY - pressing
   Log set IS the confirmation.
2. The Now card flips to a compact side-two state ("Side 2 - same reps",
   reps prefilled, editable); a short between-sides rest runs inline
   (half the exercise's configured rest via the existing
   halfRestSeconds, floor 15s); the primary bar button relabels to
   "Log other side" - same button, same position (S3 stable-identity
   principle preserved).
3. User does side two, taps "Log other side". The pair commits as ONE
   workout_sets row: actual_reps = lower side (conservative, matches
   migration 054's own maths), breakdown in notes ("L 10 / R 9") - the
   exact D9/cluster storage shape already shipped; no schema change.

SELF-EXPLANATORY: a once-per-exercise first-timer walkthrough modal in
the exact shape of the existing superset heads-up (icon, numbered steps,
tip, "Got it" CTA) with an inline escape ("Log both sides together"
turns per-side off). AUTO-SUGGEST: the dead laterality field finally
gets read - obviously-unilateral exercises auto-enable per-side, and
because the walkthrough ALWAYS fires before the first per-side set, a
wrong regex guess is never silent; declining is one tap. Cancel path:
a small inline cancel in the side-two state discards the pending pair.

Invariants preserved: one logged set = one working set (engine/volume/PR
maths untouched); tier-blind; no new deps; existing crash-recovery draft
covers the mid-pair state. Subject to founder device-walk veto.

## D65 — R6: PressableCard collapsed to a single animated pressable (lead ruling, 2026-07-11)

Sources: founder photo (build 2608, dead band on the workout summary
footer beside Close), DEFECT-MAP.md R6, hands-on trace to the rendering
line.

ROOT CAUSE (whole class, not one screen): PressableCard rendered an
unstyled Pressable wrapping an inner Reanimated.View that carried the
caller's style. The parent lays out the OUTER element, so every
layout-in-parent style passed through Button/Card/Chip (flex: 1,
alignSelf, width) was silently discarded; in flex rows the button
shrink-wrapped to text width. Regressed 2026-07-09 (5d98870) when the
summary footer and the logger's bottom bar moved off raw
TouchableOpacity (which held flex: 1 directly) onto <Button> - the
founder's "it was better a month ago". Live victims traced: Workout
summary Close (dead bar band), ActiveWorkout Log set primary and the
Next exercise / Finish workout advance action (under-width split bar).

RULING: fix at the primitive, not per call site.
PressableCard is now ONE animated pressable
(Reanimated.createAnimatedComponent(Pressable)) carrying
[style, animatedStyle]. Declared layout styles take effect exactly as
written at every call site; press physics unchanged (same springs, same
scale/opacity interpolation, same reduce-motion flat behaviour); the
origin-aware measure API and its never-lose-a-tap fallback unchanged.
Side benefit: the press hit area now matches the visible bounds (the
old outer view could stretch wider than the visible button - an
invisible tap zone).

Re-anchored pins: button.stateMorph animated-ancestor count 1 -> 0
(intent unchanged: the morph adds no animated wrapper);
p9Talkback save-path count 3 -> 2 (the third CTA was retired by design
in D43 S3, window widened for the grown primary tag). New pin:
pressableCard.rowLayout.guard.test.js. Verified: full suite
691 suites / 8,529 tests green; absolute-position sweep found no
consumer relying on the old inert layer. Subject to founder device-walk
veto.

## D66 — R5: logger chrome and small-surface styling unified (lead ruling, 2026-07-11)

Sources: FOOD-DESIGN-STANDARD.md (the measuring stick), DEFECT-MAP.md R5
(header table + radius-cluster inventory), founder's words ("Finish
differs from X, counter different colour/style... different styles for
different things all over the shop").

RULINGS:
1. Header X matches ModalHeader's close exactly (size 24, textPrimary).
2. The elapsed timer is data, not decoration: textPrimary, same
   type.num('title') role. Header amber competed with the one filled
   Log set CTA.
3. Finish drops its bespoke chrome override; Button variant="secondary"
   size="sm" shows through (the override duplicated it at radius.sm).
4. ONE small-surface radius for the logger: radius.md (beatLineCue and
   RestTimer skip sm -> md; logged-set row + in-place editor xs -> md).
   Pills stay radius.full; cards radius.lg. This is the reconciliation
   rule for any future logger surface.
5. Raw type pairs onto house roles: beatLineLabel -> bodySm, RestTimer
   label -> overline. The 26px rest countdown stays a sanctioned hero
   numeral (existing eslint-disable).
6. Content edge: logger scroll paddingHorizontal md -> lg, aligning with
   header/exercise-nav/Food. The tighter vertical rhythm (sm gaps) is a
   deliberate density property of the working surface and STAYS.
Landed 75ad788; full suite green. Subject to founder device-walk veto.

## D67 — Clipped-drama copy ban made mechanical (founder order 2026-07-11)

Founder: "We need a search for clipped ai language... for example 'Yours
free, always' that's not british english and sounds daft, they dont own
it."

Swept and fixed (5 strings): WelcomeScreen "Yours free, always" ->
"What stays free"; WelcomeScreen trust chip "No ads, ever" -> "No ads"
(+ its a11y label); SettingsDataScreen "Your data is always yours." ->
deleted (the factual sentence stands alone); SubscriptionPolicyScreen
"...on Pro, forever." -> "...on Pro."; NotificationSettingsScreen
"No marketing, ever." -> "never marketing" (caught by the new lint, not
the manual grep - the guard already outperforms the sweep).

ENFORCEMENT: two new no-restricted-syntax selectors in eslint.config.js
(both rule blocks, since the HomeScreen-scoped block replaces rather
than merges) banning the ", always/ever/forever" tail at sentence or
string end in Literals and JSXText. Same escape hatch as the other
voice rules: scoped eslint-disable with a reason.

## D68 — R8: Coach page real merge (lead ruling, 2026-07-11)

Sources: DEFECT-MAP.md R8 (side-by-side duplication table), founder ("the
Coach page is now just cobbled together mess with duplication...
'Getting to know you' adds nothing and hogs space... asked for a real
MERGE"), hands-on read of YouScreen.js in full.

FINDINGS: (1) the status card was a third voice - its body pointed at
"the weekly check-in below" while the check-in NavRow directly beneath
carried the FULL specific readiness copy; (2) with a completed decision
the card said "Open it..." but was NOT tappable - the duplicate
"Coaching decision" NavRow did the opening one card down; (3) the free
tier showed a non-tappable pitch card PLUS a duplicate "Upgrade to Pro"
NavRow; (4) the feared readiness-logic drift is already impossible at
source: coachLedger.js imports MIN_WEIGH_INS / FIRST_CHECKIN_MIN_DAYS /
firstReviewUnlockDate from trialActivation.js ("so the ledger can never
disagree with the check-in gate") - the duplication was presentational.

RULINGS (one voice per fact, every surface tappable or gone):
1. Pro + completed decision: the status card IS the weekly update hero -
   tone primary, tappable, opens CoachOutput(weekStart), chevron. The
   "Coaching decision" NavRow disappears in this state (duplicate).
2. Pro, no completed decision: NO status card. "Getting to know you" is
   deleted; the check-in NavRow's pendingCoachCopy is the single status.
   The "Coaching decision" NavRow renders only as the archive path
   (!latestReview && hasCoachHistory, e.g. Monday's new output before
   this week's check-in) - history now loads for Pro too (limit 1).
3. Free: ONE tappable pitch card (opens ProUpgrade) replaces the card +
   "Upgrade to Pro" NavRow pair; only "Coaching history" remains below,
   and only when history exists.
Pins survive by design (label="Weekly check-in" / label="Coaching
decision" / buildPendingCoachCopy / statusCard-after-profileCard /
Coaching-decision-inside-This-week); the physiqueTile pin on the
removed Upgrade NavRow re-anchored to the card path. Full suite
691 suites / 8,530 tests green. Subject to founder device-walk veto.

## D69 — R9 colour grammar across the five areas (lead ruling, 2026-07-11)

Sources: R9 card audit (red/green class, ~7 sites), interaction audit
(VolumeSummaryStrip note), hands-on read of WeightTrendCard.js.

RULING: Food's adherence-neutral rule is absolute for food, calorie,
macro and weight-adherence surfaces. Training-MECHANICS caution signals
(muscle volume over MRV, insight severity, unresolved-exercise repair
state, high session difficulty) keep semantic warning/error colour as
one consistent status grammar: they are recovery/safety warnings about
training load, not judgements about the body, and stripping them would
lose safety-bearing information.

BOUNDARY CASE, reversed at lead verification: the audit provisionally
had WeightTrendCard's onTrack/watch dot going neutral. Hands-on reading
showed the dot is ALREADY governed by COMP-027 Class B (weight numeral
never state-coloured, dot caps at watch so no red exists, dot is
decorative with meaning carried by the insight sentence, and the
view-model strips dot/rate/maintenance under an open ED flag). A prior
safety-reviewed decision outranks cohesion styling; the dot stays.
This is the standing precedent: pre-campaign safety rulings get D37
triage, never cohesion bulldozing.

## D70 — R9 interaction/feedback cohesion rulings (lead, 2026-07-11)

Sources: R9 interaction audit (findings verified hands-on before each
build), FOOD-DESIGN-STANDARD.md sections 4-6.

RULINGS AND LANDINGS:
1. One sheet chrome: Home intent prompt (3f2de24) and PlansScreen
   folder prompt (80dbad5) off raw Modals onto shared BottomSheet;
   RoutineDetail's swap surface keeps its full-screen ranked-candidates
   Modal (deliberately richer than the plain picker; D25 exception
   class) but its bespoke header becomes the house ModalHeader.
2. Undo over confirm for reversible writes: RoutineDetail
   remove-exercise (full-field re-add on undo) and swap-exercise
   (inverse write on undo); PlansScreen archive-plan (unarchive on
   undo). Folder and template deletes KEEP their blocking confirms -
   neither has a restore path today, which is the doc's own exception;
   building restore machinery is a separate feature, not a cohesion
   fix. WorkoutHistory's workout delete keeps its confirm (genuinely
   irreversible, cloud-deleted).
3. One options idiom: WorkoutHistory's repeat menu moves from a native
   alert to PeekMenu, matching PlansScreen's identical moments.
4. Blocking informational alert -> calm info toast (Analytics locked
   Recaps tile).
5. BuildWorkout's hand-rolled picker STAYS: it is a rapid multi-add
   flow (stays open across adds); the shared ExercisePickerModal
   closes on every select, which would make building a session
   strictly worse. Not duplication - a different flow.
6. Sanctioned box classes app-wide: Card (radius.lg, surface,
   borderSubtle/border) and Banner (radius.md, tinted fill, accent
   border - Home's existing banner grammar). Wave B moves the misfiled
   card-class surfaces onto lg; banners stay md.
7. Haptics vocabulary joins every interactive tap on the five areas
   except the recorded ED diary-marking exception; NavRow gains it
   centrally.
8. DifferentialBadge excluded from every sweep (billing surface;
   C3 paywall audit owns it).

## D71 — C3 duplicate paywall: port then delete (lead ruling under D33, 2026-07-11)

Sources: C3 read-only audit (lead-verified),
docs/marketing-2026-07-11/C3-duplicate-paywall-decision-brief.md.
Founder reaffirmed D33 delegation mid-lane: decisions are the lead's,
ruled entirely on the best end result for users and the app.

RULING: Option B. PaywallScreen's two genuinely valuable capabilities
move to the live surface first — the Play-review social-proof excerpt
card (paywallExcerpts.js survives with its tests) and an inline
restore affordance (shared lib/payments/restore module, the ProGate
pattern) land on ProUpgradeScreen — then the orphaned PaywallScreen,
its ProfileStack registration and its orphan-only tests are deleted
and the stale cross-references cleaned. Rationale: the orphan is
unreachable (zero call sites), carries a superseded annual default
and pre-C1 "7 days" copy, and is pure future-drift risk; its social
proof and restore button are real user value the live screen lacks.
Docs-only cleanup (option D) would have been the lighter path; D33's
criterion is explicit that effort is never the tiebreak. An earlier
founder quick-pick of D is superseded by his explicit reaffirmation
that the lead rules on merits. Constraints: product IDs, restore.js,
playBilling.js, cascade.js untouched; a written test plan covers the
restore addition (docs/marketing-2026-07-11/); DifferentialBadge
behaviour untouched.

## D72 — C5 day-14 factual recap: enrich CascadeGate (lead ruling under D33, 2026-07-11)

Sources: C5 fact recon (lead-verified at the day-14 slot and day-3
precedent), docs/marketing-2026-07-11/C5-day14-recap-decision-memo.md.
Founder quick-picks aligned with the merits and are adopted as the
ruling.

RULING: surface = the CascadeGateScreen trial-end variant gains a
small factual block above the Stay-on-Pro/Drop-to-Free choice; facts =
training-mechanics only (workouts completed, sets, unique exercises,
personal bests) so the surface is flag-invariant and renders
identically for every user; floor = fewer than 3 completed workouts in
the trial window renders no block at all (never a thin recap). Window
is [proTrialEndsAt - 14d, proTrialEndsAt) via the existing
getRecapData; PBs via getWeeklyPRCount summed over the window's
Monday-local weeks (the app's one PB definition). No new events, no
notification, no server migration. ED guardrails hold by construction:
no outcome or body-change language anywhere in the copy, nothing
weight/food-adjacent on the surface, and the block is best-effort
(any load failure renders nothing).

## D73 — Sign-out wipe escape: bounded retry + verified-clean gate (lead ruling under D33, 2026-07-11)

Sources: R2-12 investigation (session log, build-2692 walk), the founder's
own trapped device (wipe_failed forced a full storage clear to escape),
useAppStore.clearAuthStateForSignOut, database.wipeAllUserData,
useAccountActions.performDeleteAccount. Founder delegated the decision
("do what needs to be done").

RULING: options A and B combined, C rejected. The wipe_failed block was a
dead end: any throw from a fatal wipe step blocked sign-out forever
(force:true re-ran the same wipe), which punishes the user for a transient
error while protecting nothing. The fail-closed privacy rule is UNCHANGED —
sign-out completes only when zero user data remains on the device — but
"an exception was thrown" is not the same fact as "data remains", so the
gate now measures the fact directly:

1. `wipeAllUserDataWithRetry` (database.js) retries the wipe up to 3 times
   (500ms/1500ms backoff) before concluding anything.
2. If every attempt throws, `verifyUserWipeClean` inspects the actual fatal
   surfaces: user-keyed fatal tables + legacy NULL-owner photo rows +
   flat-wiped partner tables (row counts), this account's photo directory,
   and the snapshots directory. Zero residue → sign-out proceeds
   (`verifiedClean`, logged loudly). Any residue, or any verification error
   other than a missing table → fail closed exactly as before, with the
   failing step named in the alert (R2-12 honesty rule).
3. "no such table" is no longer a fatal wipe failure anywhere in the wipe:
   a table that does not exist holds no data, so it cannot justify trapping
   the user (a plausible R2-12 class on an older schema).
4. Delete-account's local-wipe step uses the same retry + verify primitive
   and the same step-named honest alert (it previously blamed "photo and
   scan data" for every failure class).

Option C (force-with-disclosure) is rejected outright: it would let a
sign-out complete with health data verifiably still on the device, which
Article 9 posture does not permit for a convenience escape.

Regression pins: src/lib/__tests__/signOutWipeEscape.test.js (retry,
verified-clean escape, fail-closed residue, missing-table tolerance) plus
re-anchored useAccountActions.guard ordering pin.

## D74 — Transaction-queue contract: no nesting, no foreign joins (lead ruling under D33, 2026-07-11)

Sources: R2-11 investigation (busy_timeout landed a84215c), opus
call-graph audit of all 18 runInTransaction task bodies (session log,
2026-07-11), founder delegation "do what needs to be done".

RULING: runInTransaction's blanket inline guard (`if (inTx()) return
task()`) is replaced by an ownership-aware rule. A parallel call while a
QUEUED transaction is open now queues - previously it inline-joined the
foreign transaction, so its writes committed or rolled back with someone
else's work and never serialised. Inline-join survives only for manual
BEGINs the queue does not own (seed/import paths). Nested
runInTransaction calls are forbidden by contract: the audit found
exactly one (planAutoGen's zero-match rollback via
deleteProgrammeCascade) and it was un-nested with a raw
deleteProgrammeCascadeInTx variant. createWorkoutSet and
recordEngineTelemetry INSERTs ride the same write queue (audit-proven
unreachable from any task, so deadlock-free). dbCrypto probe closes are
logged and classification-critical paths abort recoverably on a stuck
close (shared ref-counted native connection means a leaked probe
poisons every later probe). Remaining enumerated lane on the board:
migrate the four manual BEGIN/COMMIT blocks onto the queue.

## D75 — L05-D2 first-food prompt REVERTED (founder device verdict, 2026-07-12)

Sources: founder device walk on the fresh install (screenshots 05:14 and
05:19, 2026-07-12), commit b7cd2ab (L05-D2, design-usability audit
2026-07-09), DiaryScreen.js.

VERDICT: REVERTED, never re-propose. L05-D2 swapped MacroRings for a
"calm first-day prompt" while an account had never logged food. On the
founder's own fresh-install walk that meant NO ring, NO macro targets
and NO visibility of what to eat, on the exact day a new user plans
their first food - while the meal builder invited them to "build a day
or week from your targets". The audit optimised for less noise; the
device verdict is that the numbers ARE the product on that surface.

FACT CHECK recorded with it: the onboarding->nutrition-targets pipeline
was NOT broken. The 05:19 screenshot shows the engine's own numbers
(3497 kcal, 227g P, 440g C, 92g F) rendering in full once a food was
logged; the empty-state card also displayed the calorie target. The
regression was purely the display swap.

Change: MacroRings renders unconditionally (first day included);
FirstFoodPrompt component, its test, and the firstFoodPrompt guard test
deleted; the account-wide everLoggedFood read removed from the diary
load. A never-re-propose comment sits at the MacroRings call site.

## D76 — Progress-scan formula accuracy rulings D1–D4 (delegated, 2026-07-12) + founder launch-stability override

Sources: docs/audit/progress-scan-accuracy-audit-2026-07-12.md (5-agent
audit); progressScanCalibrationCorpus.test.js (release band contract);
founder delegation "make your judgement on what would be best for these
and put them into action" and subsequent direction that pinned-test
fall-out from engine changes "isn't acceptable" the night before launch.

RULINGS (lead, D33): D1 fix (continuous blend weight, lean boost pulls
up only, spread out of the score into confidence), D3 fix (measured-lean
silhouette keeps anchor protection regardless of BMI), D4 withhold
(sub-0.30 segmentation, clothing/background uncertainty and >20° tilt
promote from soft warning to withhold). D2: the distance-invariant
solidity redefinition CANNOT be validated offline — the synthetic corpus
fixtures' bodyAreaRatio values exceed their own bbox areas, so solidity
anchors are underivable from them; real device photos are required.

EXECUTION OVERRIDE (founder, same day): the D1 spread change was built
and measured — it moves two ratified release-band corpus cases out of
band (male_lean_broad_frame 80–94 → 78; short_muscular_stocky 74–90 →
71), i.e. a real recalibration of live users' scores. On the founder's
launch-stability direction the SCORE PATH ships byte-identical to live,
and D1+D2+D3+D4 land together as one post-launch corpus/curve retune
validated on real device photos. Hard constraint recorded: that retune
must land BEFORE the bf-estimator asset is ever flipped to 'validated',
because D1a/D3 are masked today only by the provisional ±8 clamp.

LANDED tonight (no score change, corpus 26/26): hardening batch
(33109fc), confidence honesty C-F1/C-F3/C-F4/C-F5 (1a35682), invariant
property suite (3f46160), plus earlier D-F1 facing guard (8cd7d79) and
capture defaults (aaf656c).

## D77 — iOS TestFlight emergency session rulings (lead, D33, 2026-07-12 night)

Sources: founder's live TestFlight session (build 40) Sentry sweep
(VOLYUME-S/12/17/18/1A/1B/1C/1D/1E/1F/1N/1W/1X/1Y, all pulled by time and
date of the session window); founder orders "fix ALL errors", "we don't
focus on fallbacks we fix the core", "merge to main". All landed to main
same night: crashes/tab bar `deded3e`, TFLite model `852cd17`, Apple
sign-in + Sentry noise `44dc987`.

RULINGS:
1. **iOS long-press set menu REMOVED (D25 amendment).**
   react-native-ios-utilities (zeego -> react-native-ios-context-menu)
   throws a fatal NSUnknownKeyException ('reactPropHandler' KVC on a plain
   RCTView) during Fabric descriptor registration at app START on RN 0.81
   — the string exists nowhere else in the dependency tree, and 5.2.0 does
   not change the crash path, so an upgrade is not a fix. Platform fork:
   SetRowMenu.js (Android keeps the zeego menu) / SetRowMenu.ios.js (bare
   row; both actions remain reachable via tap-to-edit). Both packages
   excluded from iOS autolinking (react-native.config.js + expo exclude,
   the Google Sign-In pattern). Packages stay in package.json because
   zeego's shared TS sources value-import from them (Metro must resolve
   them for the Android bundle). Sentry: VOLYUME-1X (1W presumed same
   event JS-side; verify on next build).
2. **Progress-scan TFLite model v2 (VOLYUME-1F root cause).** The bundled
   MediaPipe asset carries the MediaPipe-proprietary custom op
   Convolution2DTransposeBias; stock TFLite cannot resolve it, so
   createModel threw on EVERY device on BOTH platforms — the primary
   engine never ran once in production, all scans rode ML Kit / Apple
   Vision. Replaced with the SAME network converted to builtin ops (PINTO
   zoo #109 fp16, identical IO contract incl. the activation_10 output
   tensor). Validated end-to-end before shipping: flatbuffer op parse, a
   real interpreter run on a real person photo through the app's exact
   preprocessing, and the OLD asset reproducing the exact production error
   under the same interpreter. Renamed *_v2.tflite to bust the per-name
   native model cache. Guard test pins the v2 hash + bans the custom op
   string. WATCH ITEM: quality gates get their first real fast_tflite
   traffic on the next build — monitor scan diagnostics; recalibrate
   thresholds if confidence shifts.
3. **Tab bar restored to stock geometry (E15 §2 amendment).** The custom
   bar hard-coded a 60pt top-aligned content box; the slack pooled under
   the labels and read as a dead band over the iPhone home indicator
   (founder: "not launch worthy"). Now stock BottomTabBar geometry: 49pt
   content zone via minHeight (grows with system text), items centred,
   inset as padding below, fill edge-to-edge.
4. **Expected-offline sync warnings demote to breadcrumbs.**
   captureWarning demotes on the 'Network request failed' signature
   (message or context) or a sync.*/supabase.* scope while
   observability.isKnownOffline() is positively true (fails open on
   unknown). captureError never gated; local errorLog buffer unaffected.
   Kills the ~5,500-event offline flood (VOLYUME-S family).
5. **Apple sign-in error 1000 = device state, surfaced honestly
   (VOLYUME-18).** Entitlement verified present (the
   expo-apple-authentication plugin injects it; ios.usesAppleSignIn added
   belt-and-braces). ASAuthorizationError.unknown is thrown by Apple's
   sheet pre-code; LoginScreen now shows the iCloud remedy for the
   apple_device_state flag instead of a dead-end retry.
6. **VOLYUME-17 (StoreKit fetchProducts) = App Store Connect side, not
   code.** Init ordering verified correct, failure handled, paywall
   re-fetches, purchases unaffected. Founder checks the Paid Applications
   agreement + subscription states (section 3 of the board). Billing code
   untouched per the billing gate.
7. **VOLYUME-12 = working as designed.** It is the deliberate
   useAppStore.setTier tier-transition audit log (caller
   cascade.startCascade); not a defect, left alone.
8. **Raw-BEGIN sweep completed (VOLYUME-1N class).** food/seed.js (the
   Sentry hit), then the two remaining raw BEGIN/COMMIT sites
   (importExternal.runImport, food/libraryDelta page upsert) all ride the
   app-wide runInTransaction queue per D74's contract; no manual
   transaction remains outside database.js.
9. **Check-in trust defect (founder Android report).** The Today nudge
   gated on day-of-week only; it now mirrors the WeeklyCheckIn gate
   (FIRST_CHECKIN_MIN_DAYS + MIN_WEIGH_INS from the same query) and the
   checkinDay pref parse is unified (string-stored day can no longer split
   the surfaces).

## D78 — Founder orders, iOS build 42 walk (2026-07-13, second wave)

1. **The Why? expansion is REMOVED from Progress Photos (founder order).**
   The receipt sentence already carries the primary reason; the extra box
   read as clutter on device (it also appeared platform-asymmetric: it only
   rendered when a scan carried quality warnings, so iOS showed it while
   Android's clean scan did not). buildScanReceipt still produces whyLines
   for the engine contract; no surface renders them. Regression pinned in
   ProgressPhotosScreen.resultsContract.test.js.
2. **VOLYUME-2B root cause = Fabric double-fire of the native Apple
   button's onPress, NOT device state.** Sign-in always succeeded; the
   duplicate concurrent ASAuthorization request was rejected by iOS with
   error 1000 and logged an error against every successful sign-in
   (release 1.2.0+42 events confirm scope LoginScreen.oauth.providerError
   with a successful session each time). Fix: signInWithApple is
   single-flight (duplicate returns { duplicate: true }, silent) plus a
   synchronous in-flight ref guard in all three OAuth surfaces
   (LoginScreen, ProUpgradeScreen, ProOnboardingScreen) so the duplicate
   press never starts. The D77-5 apple_device_state remedy toast stays for
   GENUINE single-request error 1000. Pinned in auth-apple.test.js.
3. **iOS 57 vs Android 60 (Active vs Athletic band boundary) is OPEN and
   significant per the founder.** Scoring is platform-blind (verified: no
   Platform branches in progressScanAnalysis/Vision/ResultsContract); the
   next step is signal-file diffing via the existing calibration export
   (long-press the "Private on this device" pill in Progress Photos — share
   sheet, founder's email is on the allow-list). No engine change without
   the diff evidence; D76 lock stands until then.

## D79 — Scan measurement v2 (founder orders + evidence, 2026-07-13 afternoon)

**Evidence base:** the founder's signal exports from both phones replayed
through the engine reproduce 57 (iOS) and 60 (Android) EXACTLY — the engine
is deterministic and platform-blind; every cross-device difference is in
the measured inputs. His real stats (5'10", 90 kg, 31-inch waist, amateur
men's physique competitor) and the real front photo prove the v1
measurement layer reads the wrong anatomical stations:
- "waist" band (0.44-0.58 of body box) sat at hip/crotch level and measured
  his loose shorts (waistToShoulder 0.83-0.92 measured vs ~0.6 true), which
  zeroed the 30%-weight score component on BOTH devices;
- "hip" band (0.60-0.72) sat at mid-thigh; nearest-centre row read made it
  bimodal (one leg = 0.08 on Android vs both-legs-plus-gap = 0.30 on iOS;
  waistToHip 3.1, anatomically impossible);
- body box/area included stray mask blobs and both final scores sat on the
  provisional ±8 estimator clamp floor (silhouette-8: 65-8=57, 68-8=60).

**Rulings (lead, D33; founder orders quoted):**
1. "A 3 difference is significant and needs ironed out properly" +
   "iron it out properly" → measurement v2 SHIPPED: anatomical bands
   (waist 0.36-0.48, hip 0.46-0.58, thigh 0.58-0.70), central-segment-sum
   for hip/thigh (legs-apart == legs-together), dominant-component
   geometry (blob-proof body box/area), PROGRESS_SCAN_MEASUREMENT_VERSION
   = 'silhouette_bands_anatomical_v2'. The ANALYSIS layer (weights, curve,
   corpus) is untouched and byte-identical: it was calibrated for true
   anatomical ratios all along and the vision layer now supplies them.
   D76's byte-identical lock is superseded for the measurement layer only,
   by the founder's explicit order on real-device evidence.
2. Cross-measurement-version scan pairs fail CLOSED in scanComparability
   ("The scan measuring method was updated...") so a v1-vs-v2 pair can
   never read as fake physique change. Legacy pairs and v2 pairs compare
   normally.
3. Calibration export now carries per-pose capture provenance (engine,
   modelVersion, measurementVersion, fallbackReason, modelBacked) so the
   next cross-device diff can separate camera variance from backend
   divergence.
4. "We need to make the ratings higher and the scoring higher... We can't
   be offending people" → display-calibration uplift is ACCEPTED and
   EVIDENCE-GATED, deliberately sequenced AFTER one v2 scan pair from the
   founder's devices: the corrected measurements land first, he scans and
   exports once per phone, and the calibrateVolyumeScore curve + band
   labels are then set so his physique reads high-Athletic/Lean and softer
   users are never insulted (display floor already 40). Retuning the curve
   blind against mis-measured inputs would just be another guess.

**D79 addendum (population validation, same day):** the founder asked
whether calibrating against one individual is sound. It is not, and the
system is not: the calibration sources are the BodyM external research
dataset (real photographs with real tape measurements; opt-in smoke suite
runs the REAL vision measurement over them), the nine-case synthetic
corpus, and published anthropometric ranges. The founder's scans serve
only as defect evidence (impossible v1 values) and one ground-truth point.
Running the BodyM suite against measurement v2 caught a real regression
the founder's case never could: a BMI 37.5 subject scored 72 "Defined"
because F1(a)'s flat ±8 provisional-estimator cap blocked the deliberate
large-body downward correction (pre-existing clamps allowed -24/-26).
RULING (lead, D33): the provisional downward limit now comes from
estimatorAnchorDownwardLimit (8 for lean/protected physiques, so the
F1(a) athlete guarantee is fully preserved and pinned; 16-26 only via the
high-BMI/large-body gates). Upward stays capped at 8. BodyM suite passes;
corpus bands unchanged; founder's predicted v2 cases unchanged
(82 Lean / 74 Defined / 67 Athletic). The three analysis tests that had
pinned the flat cap (with comments recording the pre-F1 intent) were
re-pinned to the honest outcomes; the F1(a) invariant test now pins BOTH
guarantees (lean ±8, large-body -26). Standing rule: any scan measurement
or scoring change MUST run the BodyM smoke suite before landing
(PROGRESS_SCAN_BODYM_SMOKE=1), it is skip-by-default in CI.

**D79 second addendum (v3, founder rulings same day):**
1. Real Android scan on measurement v2 verified end-to-end: 60 -> 92
   (Very Lean, moderate), both poses fast_tflite + builtin-ops v2 model
   (provenance in the enriched export), ratios anatomically sane and
   consistent with the founder's tape reality. Replay reproduces the
   device score.
2. Founder ruling: "Tighten the hip read" -> measurement v3: hand-width
   runs (under half the row's widest segment) are dropped from the
   hip/thigh central sums; legs (near-equal widths) are kept. Version
   bumped to silhouette_bands_anatomical_v3 so his v2 baseline is never
   compared against v3 scans (he retakes the baseline on the next build).
   Regression pinned (hands-beside-hips test).
3. Honest outcome note: the hip fix corrects the measurement and the
   week-to-week stability, but the founder's score only moves ~92 -> ~91
   because calibrateVolyumeScore compresses the top (raw 65+ maps to 87+),
   and three components saturate at the lean end. The remaining
   "headroom / stage-lean discrimination" concern lives in the display
   curve + leanAt anchors, NOT the measurement. Retuning those is a
   population-level calibration change: OPEN, pending the founder's call
   (retune now against corpus + BodyM + his scan, or gather opt-in fleet
   calibration telemetry first).
4. Android versionCode bumped 28 -> 29 for the founder's next Play AAB.

## D80 — Display-curve retune (founder order "Retune now", 2026-07-13 late)

The hip fix (v3) was honest but only moved the founder ~92 -> ~91: the old
calibrateVolyumeScore top end mapped every strong raw score to 87+, so lean
physiques bunched within a few points of Peak and a full cut moved the
score almost nothing. RULING + founder order: the top half of the curve is
stretched ([55,79],[65,81],[75,85],[85,89],[92,94]); the lower half
(Foundation/Active/Athletic) is unchanged, the display floor stays 40, and
the BodyM population invariants pin the large-body region (suite green).
Result: the founder's real v3-corrected scan reads 88 Lean (high
confidence) with genuine headroom; Very Lean / Peak now mean stage-level
condition. Corpus re-ratified accordingly (very-lean synthetic 84 Lean,
broad-frame 76 Defined, stocky 71 Defined); exact-value pins across the
analysis/store suites updated with D80 notes. Scores across existing
users shift at the lean end only; cross-measurement-version comparability
gating (D79) already prevents any fake "change" reading.

## D81 — Fleet calibration telemetry (founder order, 2026-07-13 late)

Founder: collect scan calibration readings for all users to fine-tune
scoring as the user base grows; "no opt-in toggle, on for all, keep it
private to us, faceless info, no names to the data." Design (lead, GDPR
inviolables applied): rows are ANONYMOUS by construction — no user id, no
photo, no uri, no note, no exact timestamp (day only), height/weight in
5-unit bands — so the stored data is not personal data (GDPR recital 26);
the health-consent purposes copy gains a transparency line and the
privacy posture doc is updated, with no re-consent gate forced. Photos
and per-user scan records remain device-only (the no-sync guard is
untouched: this is one-way, fire-and-forget telemetry, not sync).
Cloud table scan_calibration_events (migration 117, founder-run):
insert-only for authenticated clients, no client read access.

## D82 — Coaching end-to-end verification + wiring fixes (founder order, 2026-07-13 evening)

Founder: confirm coaching + check-in works exactly as prescribed; weeks of
device testing are not plausible. Method: two-agent verification (opus) --
an adversarial wiring trace with file:line evidence, and a 14-week
simulation of the REAL engine (no mocks) across 5 personas with per-week
invariants. Results:
1. ENGINE VERIFIED: 35 existing suites (659 tests) green; simulation
   passed all invariants (floors never crossed, step sizes bounded,
   deterministic, no NaN; female near-floor held by the FFM gate; erratic
   user abstains for 14 weeks; rapid loser locked out of cuts from week 2
   by the ED-pattern detector and only ever adjusted upward).
2. FIXED (CONFIRMED-BROKEN): consecutiveOffTargetWeeks was derived from
   the previous saved coach output but never persisted, so it was
   permanently capped at 1 and the standard calorie-adjustment gate
   (needs 2-3 consecutive off-target weeks) could NEVER fire -- the core
   calorie loop was silently dead; only the rapid-loss override could
   change calories, and users saw "1 more week of the same trend needed"
   forever. Fix: the counter is persisted with the saved output and held
   in the screen state so apply-handler re-saves keep it. Guard test
   pins the wiring (CoachOutputScreen.offTargetCounter.guard.test.js).
3. FIXED (CONFIRMED-BROKEN): the onboarding-scheduled check-in reminder
   ignored the FIRST_CHECKIN_MIN_DAYS unlock, so a brand-new user's first
   reminder could open a locked "wait a few days" screen (same trust-
   defect class as the 2026-07-13 Home-nudge fix, at the push layer).
   Fix: scheduleCheckinReminder accepts earliestMs (same roll-forward
   mechanism as its min-gap rule) and Pro onboarding passes the unlock
   time. Scheduler test added.
4. NOTED RISKS (no action without founder call): (a) apply-time re-clamp
   covers the static sex floors only; the FFM floor is engine-time (the
   engine nulls sub-FFM cuts before they exist -- exposure limited to
   intake collapsing between run and tap, self-corrects next run);
   (b) coach_outputs/planned_muscle_volume/adaptation_events still sync
   via the legacy bulk path -- register them before any legacy-path
   removal; (c) the -1.5%/week rapid-loss flag reads the slow EWMA and
   can trail a true rapid loss by weeks -- the ED-pattern detector and
   the losing-too-fast upward corrections cover the gap (verified in
   simulation), but the flag itself is deliberately lagged.

**D82 addendum (founder "Yes we fix this", 2026-07-13 night):** the
founder's iOS build-43 scan (69, telemetry-verified v3+curve build)
exposed two capture-integrity gaps: an 11-degree propped-phone tilt
collapsed the shoulder read (waistToShoulder 1.79, anatomically
impossible) yet sailed under the 20-degree tilt gate AND was scored.
Fixes: (1) tilt retake threshold 20 -> 10 degrees in both the vision and
analysis gates; (2) new 'silhouette_implausible' abstention (waist to
shoulder > 1.3, waist to hip > 2.2, or shoulder read < 0.12 of height)
at the vision layer AND belt-and-braces on stored ratios at the analysis
layer, added to SCORE_WITHHOLD_REASONS so an impossible capture is never
scored -- calm retake copy names the tilted/propped phone. Valid-scan
score path unchanged (corpus + BodyM untouched by construction; full
suite green).

## D84 — iOS reads its analysis buffer upside-down (audits + founder files, 2026-07-13 late night)

Two adversarial audits (opus) ran on the founder's order to find "why iOS
doesn't work with the components we use". Pipeline audit, top finding
CONFIRMED: modules/progress-scan-image iOS extractRgb drew the photo into
a hand-built CGContext (bottom-left origin, unflipped) with
UIImage.draw(in:) (assumes UIKit's flipped space) -- the 256px model
input was rendered VERTICALLY UPSIDE-DOWN on iOS while Android rendered
upright. Dormant until this morning's v2-model fix switched iOS scans
from the Apple Vision fallback (whose preparedImage uses the correctly
flipped UIGraphicsImageRenderer) onto the flipped path: from then on
every on-iPhone scan measured a head-down body (shoulder band on the
legs) -- low-but-plausible scores or silhouette_implausible/inconclusive,
regardless of photo source. Verified against the founder's own iOS photo:
through a correct upright pipeline here it measures waistToShoulder
0.569 / waistToHeight 0.171 (elite lean ratios) -- the photo was always
good; the reading was broken, exactly as the founder said. Fix: CTM
flip in extractRgb before the UIKit draw. Also fixed from the
integration audit, CONFIRMED: notifications foreground handler returned
only the deprecated shouldShowAlert, so iOS showed no foreground
banners at all (all seven return sites now carry
shouldShowBanner/shouldShowList; ED suppression unchanged).
Recorded RISKS (no action tonight): expo-camera mirror saved-file
divergence Android-vs-iOS (device-walk item), iOS 64-pending-
notification ceiling under large meal-reminder lists, manipulateAsync
deprecation migration, decode-resolution/resampling and P3 colour
divergences (second-order), HEIC-in-.jpg un-baked orientation path.
Process note: a piped test command masked a red suite and one commit
reached main red for ~15 minutes before being fixed; gates now run
with explicit exit-code checks.

## D85 — UIKit removed from the iOS analysis render; fix PROVEN on device (2026-07-13 evening)

The D84 inversion was confirmed red-handed: the founder's own export
(scan scored 82) contained the exact 256px model inputs, both
upside-down. Founder asked for the structural option rather than the
CTM-flip correction ("B if it is definitely a better solution"):
extractRgb now draws the CGImage directly with CGContext.draw -- no
UIKit in the analysis path, so no coordinate-space mismatch exists to
correct and the flip bug class cannot recur. EXIF stays baked in by
kCGImageSourceCreateThumbnailWithTransform; the centred contentRect
keeps pixel placement identical. Guard test pins extractRgb to the
pure-CG primitive (UIImage/UIGraphicsPushContext/.draw(in:) banned on
code lines). Landed on main d7cf68f; gate lint 0 / test 0,
9,061 passed.

Founder built and scanned: the model input pulled from
scan_calibration_events (row a5aad947) is UPRIGHT, and every broken
signal normalised -- waistToShoulder 1.12-1.79 -> 0.609,
frontBackWaistSpread 0.131 -> 0.04, fragments 26-40 -> 12-18, score 83
"Lean" vs Android 89-91. Founder verdict: acceptable as an indicator
for now. OPEN (not parked -- founder said "not bothered for now"):
the residual ~6-8 point iOS-vs-Android gap, now investigable with
clean paired telemetry; prediction on record that including the side
pose lifts confidence from moderate.

## D86 — Coaching-decision results page: elite simplification (founder directive 2026-07-23)

Founder, from device screenshots of the weekly Coaching decision page
(IMG_1882/1883), verbatim: "Weekly check in results page is pretty crap.
Buttons that don't match the style of the app. Gumpf at the bottom out of
alignment and unnecessary. This is meant to be an elite app ... looks cheap
and unexpeccaey ai talk and also not user friendly language. We don't need
progress photos talk dominating the page either." Follow-up rulings,
verbatim: "we want this progress portal as like an addition to the check
ins. It's not a necessary thing ... food and work out logging is the primary
core function of check ins ... we can mention it ... but we don't have it
dominating the page ... Load down is probably better." "this needs to be
understandable, usable by end users, simplified, and for them to understand
what's changed and why ... There's a lot of text at the bottom of the page,
which is, like, fucking calculations and stuff like that that does not need
to be displayed there." Hard bound, verbatim: "We're not changing the
engine at all." "do not be stripping out things that are already there.
They're changing the look and feel of the page to make it more
understandable for the end user."

Delegated ruling (D33, lead): presentation-only rebuild of
CoachOutputScreen and its copy sources. (1) The top summary card renders
the weekly decision only: the photo sentence no longer folds into the
displayed lead paragraph. The applyProgressScanCoachContext wiring stays
exactly as the isolation guard pins it; only which interpretation string
the lead card displays changes. (2) One compact "Progress photos" card
low on the page (receipt headline plus one muted attribution line;
detail-or-non-authority-sentence, so every path still states targets come
from logged data). The scan evidence packet composition, suppression
gates (ED/calm fail-closed), and engine isolation are untouched. (3)
progressScanCoachResolver display strings rewritten from first-person
machine voice ("I am not using them", "low-confidence cross-check, not as
a target-setting trigger") to plain calm human copy with identical
meaning, including the ED-safe framings (not a reason to push the cut
harder; not a reason to change calories). (4) StatChip restyled from
bordered button-look pills to the app's quiet borderless surface2 chip
family (exercise-nav tab precedent) so stats stop reading as buttons.
(5) Hero hold copy simplified ("Hold steady this week."); the "The
reason:" prefix dropped. (6) The bottom credential jargon row (volume
landmarks / autoregulation / RED-S inline-tooltip row, the misaligned
"gumpf") removed; the medical-guidance disclaimer stays. Engine files,
weeklyCoach, nutritionEngine, floors, gates: zero changes.

## D87 — Live personal-record indicator on the logging screen (founder GO 2026-07-23)

Founder, from the active-workout screen (IMG_1884), verbatim: "I want Pr on
the screen so it's easily visible of going for a record or not consider the
best place to have that". Placement proposed and approved ("Ok go for it").

Lead ruling (D33): ONE live record line directly beneath the weight/reps
steppers, absorbing the existing "Est. max" caption rather than adding a row.
Two states. Quiet: "Best 90kg x 12 - Est. max ~128kg", so the bar to beat is
always on screen. Armed, when the currently entered weight and reps would
break a record: a gold trophy row reading "Record set if you hit this" plus a
plain why line naming WHICH record and the number to beat, and the bottom
bar's primary button takes a trophy icon so the signal is unmissable at the
moment of commitment.

Bounds. The indicator is a pure derivation from data the screen already
holds (allTimeSets plus this session's loggedSets for the exercise); no new
query, no new dependency, no engine change. It reuses detectPR, the same
function that fires the PR celebration on log, over the SAME history shape
(all-time sets plus this session's sets for the exercise, warm-ups included,
exactly as prHistory is built in handleCompleteSet), so the screen can never
promise a record it then fails to award. All three record types are covered
and named separately, because they do not move together: a heavier weight
for fewer reps can be a heaviest-weight record while not being an estimated-
max record. Silent cases, all deliberate: warm-up sets (a warm-up must never
chase a record), non weight-and-reps schemas (duration/distance reuse the
weight field, so a weight x reps detector would report meaningless records,
matching the existing isWeightReps gate), and an empty history (the
first-ever set of an exercise beats nothing, holding Wave A A1's honest
first-lift rule). WorkoutBottomBar keeps accessibilityLabel={primaryLabel}
unchanged per the R4/D64 same-string rule; the trophy is a leading icon only,
and the record row carries its own spoken label.

## D88 — Copy/design/trust audit remediation (founder GO 2026-07-23)

Five read-only Sonnet lanes audited onboarding/paywall, coaching/check-in,
food, training and a cross-app terminology sweep. Every finding was verified
hands-on before acting; unsupported claims were dropped (the cross-app lane
claimed "PB" appears only in code comments -- false, both PR and PB are live
in user copy). Founder: "Approve all your fixes."

RESOLVED BY FOUNDER, NO CHANGE: the ProUpgradeScreen trial line stating the
store "adds another week free" is CORRECT -- founder verbatim: "I have
configred the stores to give 7 days free." The audit flagged it as a possible
overclaim against playBilling's server-enforced eligibility comment; the
founder confirms the store offer is configured. Billing copy left untouched.

APPROVED AND BUILT (presentation and copy only; no engine, no thresholds):
1. Raw crash text reaching users: ProOnboardingScreen (plan-fail alert and
   the completion catch-all) and ProGoalSetupScreen (plan-rebuild toast) all
   interpolated a caught e.message straight into user-facing copy, one of them
   at the very end of onboarding. The interpolation is dropped; the existing
   logError calls keep the diagnostics.
2. First-person machine voice in live coach output: planExplain.js's
   supportive register said "I have taken ... off your plan". The actor is now
   "Your coach", per the locked voice doc's actor-naming rule.
3. Two energy totals on one card: MacroBreakdownSheet rendered the converted
   figure (toEnergy) beside an Atwater sum hardcoded to "kcal", so a kJ user
   saw two numbers in two units for one meal. The second figure now converts
   through the same helper.
4. En dashes in user copy (banned): NutritionTargetsScreen's estimated range
   and RoutineDetailScreen's rep range.
5. One number, two conventions: workout duration ("45m" collapsed vs "45 min"
   expanded on the same card) and estimated max ("82.5 kg" vs "~93kg" on one
   screen). Estimated max standardises on the hedged, whole-number form
   because it is an estimate, never an exact figure.
6. Terminology drift inside single screens: BuildWorkoutScreen named one
   action "workout", "training" and "session"; DiaryScreen called the same
   rows entries, items and foods; ExerciseDetailScreen had "Personal bests"
   and "All-time bests" for one list.
7. Destructive confirms that never said what is lost (cardio session removal,
   and the two divergent discard-workout bodies).
8. Smaller: curly apostrophes against a straight-apostrophe norm, an
   unguarded "1 sets" plural, and unreachable under/over calorie branches.

HEALTH SETTINGS -- AUDIT FINDING WITHDRAWN, NO CHANGE MADE. The lead
initially ruled that SettingsHealthScreen was a reachable "ghost feature"
(native Health deps absent from package.json and the app config, yet the
screen still routed and still offering Read morning weight / Write workouts /
Sync weight now, plus a prompt to install Health Connect). That ruling was
WRONG and is withdrawn. SettingsScreen gates the row on
`healthOn = isHealthAvailable()`, and health.js's getIosModule/getAndroidModule
deliberately always return null (documented, founder 2026-06-30: the
health-platform permissions were a Google Play review liability), so
isHealthAvailable() is always false and the row never renders. The feature is
correctly neutralised and unreachable; the screen and route are inert dead
code, not a user-facing trust breaker. The verification error was checking
that a navigate() call existed without checking the conditional wrapping it.
Recorded so the false finding does not outlive the session.

RESOLVED (founder 2026-07-23): PR, not PB. Evidence was the repo's own
competitor teardowns -- Hevy ships "explicit PR callouts" (cited to
help.hevyapp.com) and JEFIT ships "PR tracking" -- plus the term of art in
bodybuilding and strength culture, which is PR worldwide including the UK.
The lead's earlier PB recommendation rested on British English, but that rule
governs spelling and voice (colour, behaviour, optimise), not domain jargon;
"PR" is not an Americanism the way "color" is. Standard form is now "personal
record" in prose and headings, "PR"/"PRs" in chips and badges. CLAUDE.md's
free-tier list is corrected from "PBs" to "PRs" so a later session cannot
reverse it.

NOT swept, deliberately, and each verified in place:
- AnalyticsScreen's longest-run line ("A new personal best. 12 weeks running,
  your longest yet") is a CONSISTENCY STREAK record, not a lift. "A new PR"
  reads wrong for a streak, so it keeps "personal best".
- Every PB token in telemetry/events.js, database.js and partners/* is an
  event name, column or code comment (e.g. longest_run_pb_reached), not copy.
  Renaming those would break the analytics and partner wire contracts.
- ED check before sweeping the chart marker: only LiftProgressScreen passes
  highlightIndices, so bodyweight charts never carry a record marker. A
  bodyweight "record" would have been an ED-safety problem; there is none.

## D89 — Comprehension and trust audit: rulings on all 61 findings (lead-ruled under D33, 2026-08-06)

Founder ordered an extensive audit for confusion and trust-breaking
information (claims vs code, unexplained numbers and averages, chart
legibility, jargon vs the general population, design consistency). 12
read-only auditors + adversarial verification of every trust finding: 24
confirmed trust mismatches, 3 refuted, 37 comprehension/design findings.

All rulings, rationale and the three-wave fix plan live in
docs/audit/comprehension-trust-audit-2026-08-06.md (the source of authority
for every fix landed under this decision). Notables: the "safer calorie
floors" Calmer-coaching copy is FALSE (floors are always-on and mode-blind)
and is being corrected to describe the real behaviour — copy only, no
safety behaviour touched, flagged to founder for veto; "Show the science"
toggle and the widget streak are wired to nothing and will be wired for
real (W3); one deliberate NO CHANGE exception recorded
(NotificationSettingsScreen layout).

## D90 — Founder multi-choice rulings, 2026-08-06 evening

Asked in the structured format the founder mandated the same evening
("If you have questions for me ask them in multi answer format"). Answers:
1. X3 weight stores: WRITE-THROUGH. The Body Metrics form (create and
   edit) also writes morning_weights via the injected day-upsert writer,
   so the coach trend and rapid-loss gate see every weigh-in. The gate's
   input source is unchanged (morningWeightsSource guard stays green
   untouched). Deletes deliberately do not retract the day's weigh-in
   (fail-safe direction, recorded in code).
2. Cloud deload_week: ADD COLUMN. migrate_129 written; push wired.
   ORDERING: 129 must run against production BEFORE the next build ships.
3. Adaptive volume bands: BUILD NOW, not queued — founder verbatim: "We
   don't queue things... queuing things with Claude means they get lost
   forever." Work begins immediately after this landing.
4. Anon EXECUTE on SECURITY DEFINER functions: REVOKE. migrate_130
   written (PUBLIC+anon revoked, authenticated+service_role re-granted —
   a bare anon revoke is a no-op through the PUBLIC grant).
Also this evening (recorded in the design audit addendum 2): widgets stay
shipping with no further effort either way; paywall quiet links convert
to Button outline.

## D91 — Adaptive mesocycle build, Stage 1-2 lead rulings (D33, 2026-08-09)

Campaign authority: docs/blueprint-adaptive-mesocycle-2026-08-09.md §3.9 +
the founder's 8-stage test-first order. Rulings made under delegation while
building Stages 1-2 (all criterion-ruled: best for end users, never effort):

1. One finished-block name everywhere: "Block finished" (chip, sheet,
   Plans, ActiveWorkout banner, Training blocks, CoachOutput note,
   WorkoutSummary celebration + share eyebrow). The old 'complete' /
   'overdue' split and the mixed "Block complete" labels read as two
   states and two products; one state, one name.
2. Interim advisor CTA honesty: 'adjust' recommendation's button reads
   "Restart this programme" until Stage 6 makes an app-side adjustment
   real, at which point "Continue with adjustments" returns WITH the
   behaviour. A button must not promise what the app does not do.
3. interBlock INSUFFICIENT_DATA splits by what was proven: an
   UNDELIVERED dose (adherence < 0.6 or exposures < 4) reseeds from the
   research table (the app's standard start, stated honestly); a broken
   MEASUREMENT over a delivered, tolerated dose (no recovery data,
   exercise-swap discontinuity, low confidence) RETAINS the previous
   volume and never guesses upwards. Retention follows the founder's
   dose-retention principle; blind upgrades are impossible.
4. OVERREACHED "-1 if a deload flag fired mid-block" (blueprint §3.1)
   interpreted as: mid-block = before the peak week. A flag in the peak
   week itself (the §3.7 shoulders example, week 4 of 5) holds the start
   rather than cutting it, which is what makes the worked example
   self-consistent.
5. Longer recovery (10 days) is proposed only when a STRAINED muscle is
   corroborated by >= 2 persistent systemic signals (readiness slope,
   sleep-flag weeks, advisor deload flag) — one struggling muscle never
   stretches the deload alone; 7 days otherwise; always user-confirmed
   (founder Stage 7 language: "multiple persistent signals").
6. STALE first flat block holds quietly; the stimulus-change proposal
   (variant swap primary, rep-range shift alternative) appears from the
   second consecutive flat block, or immediately when performance FELL
   with good recovery and a trusted measurement.
7. A finished block >= 4 weeks old (overdue limbo) keeps its
   classification but its evidence is stale: upward proposals suppress,
   reductions stand (detraining makes an increase unsafe to infer).

## D91 addendum — Stage 4 lead rulings (D33, 2026-08-09)

8. Peak-week softening semantics: only an observed recovery grade 3, only
   in the final accumulation week, only in blocks with >= 3 accumulation
   weeks, and only when consecutivePoorRecoveryWeeks is 0 (persistence
   means the fatigue predates the peak). The deload branch of the matrix
   always reads the raw grade; grade 4 is never touched. safetyHold's cap
   runs after the matrix, unchanged, so no context ever outranks pain or
   illness.
9. PR density threshold 0.3 (roughly one all-time PR per three completed
   sessions) for the top performance grade, with a caller-supplied block
   e1RM slope >= 1.5% as the alternative route (wired in Stage 6) and the
   check-in's own 'exceeded' verdict unchanged. Legacy binary retained
   only when no session count is supplied (older callers).
10. Deload-row apply guard: the coach screen never applies a POSITIVE
   volume delta into a recovery week's planned rows (pre-existing hazard;
   the peak-week push made fixing it non-optional). Reductions and the
   dedicated deload apply are untouched. The card explains the refusal.

11. (Stage 5 review fork, safety-adjacent, ruled most-protective per
   D15 precedent) §3.8's "no upward carry-over anywhere" binds the
   learned MEMORY, not just live proposals: a block trained under calm
   mode or an open ED flag never raises the learned ceiling - even
   after the flag clears - while its downward evidence still folds.
   interBlock entries carry observed.suppressed for this.
12. (Stage 5 review fork) "Manual edits still beat everything" extends
   to teaching: manual-override blocks are skipped by the learned-range
   replay entirely, so removing an override can never surface the
   user's own old numbers dressed up as coach learning.

13. (Stages 6-8 lead rulings, D33, 2026-08-09) The seeded plan's rows
   record their source (seed_ledger/learned/manual/profile/research or
   template) and every explanation surface reads the WRITTEN rows, so
   no narration can outrun the plan. The block-start card lives on the
   Home block sheet; the block-end story on the Plans decision card
   (four rows) and Block summary. The 10-day recovery window renders
   only when the ledger proposed it and always as the user's call. The
   mid-block deload apply maps strain from the persisted weekly
   recovery read (deload_suggested -> 4, concerned -> 2, else 0). The
   weekly ramp line claims a coach adjustment only when one was
   actually applied.

## D91 addendum — founder final order + Stage 7-8 review rulings (D33, 2026-08-09)

14. (FOUNDER RULING, verbatim authority) "Research MEV remains a safety
   reference but should not force a deload UPWARD when a
   percentage-based recovery dose is appropriately lower … MEV is a
   productive-training landmark, not automatically a recovery-week
   minimum." The recovery-week lower clamp is deloadFloor = half of
   research MEV, never below one set (coachApply.deloadFloor). MEV keeps
   its full rank everywhere else (§3.8 floor anchor in seeding and the
   learned range is untouched). Pinned with the founder's sentence:
   "Greater strain can only make a recovery prescription easier or
   longer; it can never make it harder or shorter" (deload.stage7).
15. (FOUNDER RULING) Deload strain is muscle-specific: computeDeloadVolume
   takes per-muscle strains with the block-level score as fallback, and
   the seeded deload reads each ledger entry's own recovery_cost_weight.
16. (Lead ruling, review #13, safety posture) An UNREADABLE strain fails
   CLOSED to heavy — the smallest recovery dose — mirroring the
   runner's fail-closed suppression read. Never the lightest cut.
17. (Lead ruling, review #4) The deload share applies to the muscle's
   peak CAPPED at the row it cuts (and, for seeds, at the seeded peak):
   achieved peaks carry secondary half-credit while planned rows count
   direct sets, so the uncapped share could make the recovery week a
   no-op. Capped, every deload is a genuine cut.
18. (Lead ruling, review BLOCKER #1) deloadSets clamps to
   min(startSets, ABSOLUTE_WEEKLY_SET_CEILING): a recovery week never
   exceeds the block's own lightest training week nor the backstop.
19. (Lead ruling, review BLOCKER #2, most-protective per D15/D91-11
   precedent) Suppression (calm mode OR open ED flag) withholds
   deloadSets entirely: a flagged user's recovery week stays the flat
   research-MEV week. Block carry-over never raises a recovery week.
20. (Lead ruling, review NIT #17) A true repeat carries no deloadSets:
   "the block the user just ran, unchanged" includes its recovery week.
21. (Lead ruling, founder e2e expectation) INSUFFICIENT_DATA is not a
   recommendation: resolveSeedRange skips it so the learned band (real
   prior evidence) speaks next, and the learned replay already ignores
   it. Pinned in adaptiveBlock.e2e ("never seeds as ledger").
22. (Lead ruling, review BLOCKER #3 vs the informed-autonomy ruling)
   The Plans decision card renders the per-muscle rationale rows ONLY
   above the 'adjust' button that actually applies them; 'repeat' and
   'consider_rebuild' run a TRUE repeat, so forward-claiming rows would
   lie there. The full reflection stays one tap away on BlockReflection
   for every intent; the 10-day recovery proposal line (a user-call
   statement, honest under any button) renders for all post_recovery.
23. (Lead ruling, review #5) Deload copy is qualitative ("fewer sets",
   "ease your sets right back") because the cut is now strain-scaled
   per muscle; the applied row states the exact share after the fact
   ("about N% of each muscle's recent working volume"). Two
   whyThisTemplates snapshots re-anchored deliberately for this.
24. (Explicit deferral, Stage 6 review #15, recorded per the no-silent-
   parking rule) Weeks under an applied EARLY deload still count toward
   the block's accumulation-week maths in the gather layer. The +2
   deload-flag weight already forces those blocks down the protective
   classification path, so the residual error is conservative
   (downward); a structural fix would re-thread week semantics through
   several pinned suites. Surfaced for founder review, not silently
   parked: say the word and it gets built in full.
25. (Recorded FUTURE task, founder order — do NOT build now) A
   training-epoch / learned-ceiling freshness rule for long layoffs,
   detraining and profile changes (the learned ceiling currently ages
   only through new block evidence; stale-evidence holds cover overdue
   blocks, not multi-month absences). No arbitrary weekly decay. On
   docs/TASKBOARD.md as a future item.

## D92 — Campaign 1: Product Integrity (founder order + lead rulings, 2026-08-10)

1. (FOUNDER BOUNDARY, verbatim intent) **Volyume is not a cardio logging
   product. Cardio logging is intentionally OUT OF SCOPE.** Any surviving
   cardio engine/schema/screen remnants (including the dead tap found by
   the product map: the only cardio entry navigates to an unregistered
   route) are legacy/incomplete implementation, NOT a hidden roadmap
   commitment. No audit should recommend restoring cardio for feature
   completeness; no campaign may re-enable cardio routes or surface
   cardio UI. Clean removal belongs to the later whole-product
   coherence/dead-code campaign. Exception: a cardio VALUE feeding a
   non-cardio safety decision may be corrected for correctness.
2. (Lead ruling, P0-3) A stored meal plan that conflicts with the user's
   CURRENT allergen/exclusion list is surfaced, never silent and never
   auto-regenerated: pinned meals are the user's own choices, so the
   MealPlanScreen shows a staleness notice naming the conflicting foods
   with the existing one-tap rebuild. Detection routes through
   foodRoles.foodExcluded (the single exclusion predicate) and judges
   curated items only - non-curated refs carry no tag data and are never
   claimed safe. The allergen list itself now rides the per-field profile
   merge (mealPlanExcludeTags added to PROFILE_FIELDS_TRACKED), closing
   the stale-device reversion hole.
3. (Lead ruling, P0-4) Joint/soreness semantics: UNKNOWN is not NO.
   Unanswered check-in joint pain persists as null (tri-state), never as
   an explicit negative; the block gather returns null (not 0) for
   missing joint/soreness aggregates; no-evidence contributes ZERO strain
   weight (pain is never manufactured) and can never satisfy a positive
   recovery requirement (lateRecoveryOk needs real answers for both
   signals). Legacy rows that stored 0 for unanswered are unrecoverable
   and continue to read as explicit "no".
4. (Lead ruling, P0-6) One canonical FFM-floor weight resolution
   (nutritionEngine.resolveFfmFloorWeightKg): profile weight, then
   today's EWMA, then the most recent valid weigh-in. Both weeklyCoach
   evaluations use it, so the floor shown is the floor that gates; the
   last-weigh-in step EXTENDS gate coverage to users with fewer than
   three weigh-ins (strictly more protective).
5. (Lead ruling, P0-2) The analytics opt-out is device-local per its
   module contract: excluded from pref sync in both directions; a FAILED
   preference read keeps telemetry off for the session (a miss still
   applies defaults). Cloud rows already uploaded are removed by
   migrate_133 (founder-gated, hygiene, not a release gate).
6. (Lead ruling, P0-1) planned_muscle_volume restores into the PRIMARY
   table with last-write-wins by updated_at; provenance columns ride via
   migrate_132 with column-tolerant pushes until it is applied; legacy
   rows degrade to research landmarks + source 'template' (the label
   that claims no personalisation); unknown muscles are skipped, never
   invented. The *_sync mirror is no longer written for this table and
   is recorded as dead for the dead-code campaign.

## D92 addendum — P0-7/P0-8 audit remediations (lead rulings, 2026-08-10)

7. (Lead ruling, P0-8 D11) THE CALM RATCHET: on the preference pull,
   a remote non-calm value never replaces a local 'calm', stamps or no
   stamps. Deliberate asymmetry, stated plainly: turning calm OFF
   applies on the device where the user turns it off and does NOT
   remotely un-calm another device - nothing remote may weaken an
   ED-safety state; the user can always turn calm off locally. Manual
   landmark blobs and the wellbeing key are additionally guarded by
   local write stamps (notePrefWrite) so a stale device's pull cannot
   revert them.
8. (Lead ruling, P0-7 D4) Unknown sex takes the HIGHER calorie floor
   (1500): sex is onboarding-enforced, so null only occurs in failure
   states, and a floor that is too high errs protective. Female stays
   1200; the founder floors are untouched. A missing body weight can
   never size a DEFICIT (holds at maintenance with a warning); surplus
   and maintenance still compute for display continuity. Seven test
   pins that encoded the old permissive behaviour were re-anchored
   with comments naming this ruling.
9. (Lead ruling, P0-7 D9/D7) Session feedback is written ONLY when the
   user touches it, and the per-session adaptive engine runs ONLY on a
   rated session. Rows stamped by pre-fix builds carry manufactured
   default answers that are indistinguishable from real ones -
   unrecoverable legacy, accepted.
10. (Recorded residuals, not silently parked) (a) The Home recovery
   banner still cannot compute hasOverMRV (needs the Progress
   surface's full volume pass); it can only UNDER-suggest by 12
   points and the Progress banner computes the complete signal.
   (b) user_prefs has no cloud stale-write trigger: the calm ratchet
   protects every device's local state, but a device that set calm
   cannot teach an offline device that calm was set elsewhere.
   (c) CORRECTED by the adversarial review (finding 9): weeks DO carry
   a user edit (the confirm-then-apply early deload writes
   is_deload/rir_target), so insertMesocycleWeekFromCloud now has the
   same LWW gate and timestamp preservation as its siblings - the
   original "weeks carry no user edits" justification was wrong and is
   withdrawn.
11. (FOUNDER DECISION REQUIRED - flagged, no code touched, per the
   CLAUDE.md ED-safety stop-and-ask rule) P0-8 D12: ed_pattern_flags
   is registered pull_only + server_wins but NOTHING pushes it - an
   open ED flag never reaches a second device, so device B keeps
   sending weight/food-adjacent notifications and offering
   un-suppressed coaching. The registry, the cloud table (migrate_017)
   and a code comment all claim/expect a cloud path, so wiring a
   raise-only push (never clears; cleared_at moves forward only)
   appears to be the RECORDED design - but it transmits Article 9
   special-category data and touches the locked ED-safety system, so
   it is the founder's call, not the lead's. Options: (A) wire the
   raise-only push per the recorded design; (B) keep flags per-device
   deliberately and correct the registry/comment; (C) something else.

## D93 — Campaign 2: Comprehension, explanation and terminology (founder order + lead rulings, 2026-08-10)

Campaign authority: the founder's Campaign 2 order (verbatim in the
session scratchpad `c2/CAMPAIGN2-ORDER.txt`; summarised on
docs/TASKBOARD.md). Branch claude/campaign2-comprehension from main
0a552cc4. Hard constraints: migrations 132-135 unrun, no EAS, D92-11
unaltered, no new cross-device sensitive-data paths, cardio out of
scope (D92-1), Campaign 1 pins stay green.

1. (Lead ruling) Phase 1 comprehension classification of all forty
   ordered concepts, ruled on the verified current tree, recorded in
   full in docs/comprehension-audit-2026-08-10/PHASE1-CLASSIFICATION.md.
   Headlines: class E (over-explained) is EMPTY - the product's failure
   mode is under-explanation and inconsistency, so no copy is removed
   for length; a binding keep-internal list (grades, matrices, band
   widths, smoother identities, strain maths, note-parsing keywords,
   detector thresholds and mechanics) constrains every later phase to
   resulting-reason copy; the two stop-and-report audit findings are
   accepted as in-scope copy defects (the WorkoutSummary working-sets
   tooltip's effort framing contradicting the type-based count, and
   the coach screen's raw weigh-in row counts contradicting the
   engine's distinct-morning hold).
2. (Lead ruling) Phase 2 terminology canon, recorded in full in
   docs/comprehension-audit-2026-08-10/PHASE2-TERMINOLOGY-CANON.md.
   Headlines: "volume" always means sets - every kg quantity is
   "Total lifted"/"total weight moved" (BlockReflection, YearOfLifts,
   ProgressSections, coach report to fix); "recovery week" is the noun
   and the five rendered "Deload" leaks are fixed, with "deload" and
   "tonnage" ADDED to JARGON_PATTERNS (explicit Phase 18 ruling - a
   strengthening; verified no generated copy emits either); "Est. max"
   canonical (LiftProgress "Best set" chip renamed - it collided with
   ExerciseDetail's heaviest-weight "Best set"); PR/personal record
   two-register canon with record types Est. max / Heaviest weight /
   Most reps; "plan" canonical over "programme" (blockAdvisor,
   seedRoutines, planEngine receipt); "Block finished" residue aligned
   to D91-1; "readiness" reserved for the self-report sense ("Profile
   readiness" tile becomes "Profile status", "Muscle readiness" becomes
   "Muscle recovery"); post-workout ratings are "session feedback",
   never "check-ins"; profile-phase labels display as the label the
   user picked (coachingGoals PHASE_LABELS) everywhere the value is the
   profile phase; statistical spans are "ranges" - "band" reserved for
   equipment and the scan leanness band; "hypertrophy" and spelled-out
   "minimum effective volume" replaced with plain growth phrasing;
   "1RM" considered for the blocklist and declined (single leak fixed
   directly). Engine symbols, DB fields, routes and storage keys are
   never renamed.

## D93 addendum — Phases 3-21 rulings and reviews (lead, 2026-08-10)

3. Phases 9-17 ruled in docs/comprehension-audit-2026-08-10/
   PHASE9-15-RULINGS.md: all twenty unexplained decisions classified
   (two fixed, one served by the new Methodology recovery-weeks
   section, keep-hidden set with rationale incl. free-text parsing and
   photo corroboration); phase-label unification VERIFIED NO-CHANGE
   (the calculator displays its own selection; label-string inversion
   coupling documented); glossary classification settled (pr added;
   mesocycle wired to the block sheet; macros/strengthLevel/
   autoregulation/redS orphaned-but-harmless; set/rep a11y-only with
   a recorded novice-pass residual; none removed; no banned entries
   added).
4. Both Phase 21 adversarial reviews ran and every genuine finding was
   actioned (evidence: scratchpad c2/REVIEW-A-novice.md,
   REVIEW-B-truth.md). Notables: one status vocabulary across both
   volume legends; Manual mode now states above the coaching cards
   that recommendations are the user's to make; distinct-morning
   weigh-in counting reached ALL four ledger callers; the RIR gloss,
   readiness purpose lines, research-start line, block-sheet climb
   line and manual-override disclosure were each corrected to claim
   exactly what the engine proves (review B findings 1-9).
5. RECORDED RESIDUALS (not silently parked - founder's list):
   (a) three phase-label vocabularies (harmonisation needs a
   migration-aware pass; persisted label inversion);
   (b) anatomy/technique vocabulary in formTips and plan descriptions
   (a content-education pass, out of this campaign's concept scope);
   (c) glossary set/rep reachable only via screen reader (novice
   pass); (d) the confidence caption's weigh-in addendum counts the
   displayed calendar week while confidence uses a latest-anchored
   window (edge-case divergence, both statements individually true);
   (e) review-deferred dead code and naming items listed in the
   review files for the dead-code campaign.

## D94 — Campaign 3: Discoverability, settings and existing-feature UX (founder order + lead rulings, 2026-08-10)

Campaign authority: the founder's Campaign 3 order (verbatim in session
scratchpad c3-CAMPAIGN3-ORDER.txt; taskboard block). Branch
claude/campaign3-discoverability from main 9aae57cb; foundations merged
at ba6f11aa. Laws: discoverability is not visibility (A-G), one owner
per setting, controls at the point of consequence.

1. (Lead ruling) Phase 2 ownership rulings on the rebuilt inventory's
   16 writer issues, recorded in full in
   docs/discoverability-audit-2026-08-10/SETTINGS-OWNERSHIP.md.
   Landed fixes: partner-cheers toggle (the locked unsubscribe law's
   missing path), onboarding check-in hour 12→18, notification blob
   merge-write, the frozen cloud mirror restored at the live writer,
   shared DIETS list across both diet surfaces, reader-verified
   "Diary meals per day" relabel, and the protein silent-revert fix
   (finding 6 RE-RULED on lane evidence from documented-intentional to
   genuine defect: goal-setup seeded from a stale profile mirror and
   overwrote the live nutrition_targets row on save; it now seeds from
   the saved row). The false "as you chose" scan-privacy claim removed.
   Finding 16 ruled STALE (per-side off switch exists). FOUR FOUNDER
   RULINGS recorded in the order's format: FR-1 calculator Sex/Age/
   Height fields (ED-adjacent; recommended read-only + link), FR-2
   dormant meal-plan prefs, FR-3 hide-exact control, FR-4 rest-timer
   beep mute.
2. (Lead ruling) Phase 11 on the two permanent dismissals: both
   intentional, no re-enables - the reconnect card's action stays
   reachable via the always-visible cheer sheet, and the photo-prompt
   opt-out ends a body-image-adjacent nudge where permanence is the
   protective choice.
3. (Lead rulings, Phase 9/10 landed) Point-of-consequence shortcuts:
   the Diary discloses an applied per-day calorie adjustment with a
   link to its canonical editor (renders only when non-zero); the
   volume-target editor gains a Coach-tab route (its only other path
   is data-gated). Gesture law: visible routes added for plan-day
   exercise removal and diary multi-select (same handlers, no new
   state); the saved-meals empty state names its gesture; entry rows
   disclose the hold shortcut to screen readers.

## D94 addendum — reviews and campaign close (lead, 2026-08-10)

4. Both Phase 24 reviews ran; every genuine finding actioned
   (evidence: REVIEW-A-normal-user.md, REVIEW-B-power-user.md +
   D94-3 in SETTINGS-OWNERSHIP.md). Notables: the campaign's own
   three contextual shortcuts were cross-tab dead taps, fixed through
   navigateCrossTab with the canary guard extended; the Diary offset
   disclosure now states the APPLIED delta only; the goal-change
   summary reads the live protein source; Article 9 cycle revocation
   survives a lapse. Two mirror findings ruled pre-existing
   architecture, documented for Campaign 4.
5. Boundary review clean (cardio/AI/social/auto-transition/safety/
   engines/migrations/builds). Campaign closed; five founder rulings
   (FR-1..FR-5) remain open by design.

## D95 — Campaign 4: Whole-product coherence, legacy/dead-code cleanup and product-boundary closure (founder order + lead rulings, 2026-08-10)

1. Founder order (verbatim in the session scratchpad, summarised on the
   taskboard): make the shipping product and the repository agree. Three
   laws - delete only what is PROVEN dead or out of scope (A-I classes,
   zero callers never sufficient); never delete historical user data
   because a feature is gone; a removed feature leaves no product
   promise behind. Cardio logging ruled NOT part of Volyume; steps/
   general activity and strength-to-health are different concepts and
   survive. Peak week legacy-load-bearing, 049 HELD.
2. Evidence: eight Opus audit lanes (docs/coherence-cleanup-2026-08-10/
   AUDIT-*.md). Rulings register: D95-RULINGS.md in the same folder
   (H1-H6 cardio postures, keep/delete rulings per lane, wave rulings
   D95-2, review rulings D95-3). Order-premise corrections ruled
   honestly: cardio was fully LIVE (removed as real surgery with a
   behavioural invariance pin - calories and steps coached identically
   on the exact fixture that used to fire cardio); peak_week_plans is
   CLASS A LIVE behind the B4 contest countdown (nothing removed,
   049's false header corrected, FR-PW-1 opened).
3. Landed (all merged in order): D95 rulings; engine/coach-screen
   cardio removal; peak-week deleted_at carry (record later corrected -
   defect latent, not closed); dead functions/copy/modules with every
   invariant moved to live code FIRST; campaign4.boundaries suite;
   full cardio closure (76 files, sync converted pull_only per H1,
   deleteCardioLog kept per H3, H5 fully non-destructive); routes/
   deferred/duplicates wave (dead registrations, six+ inert cross-tab
   taps fixed via navigateCrossTab, epleyE1rm consolidated under an
   equivalence test, muscleDisplayName single export); docs-truth wave
   (CLAUDE.md facts, supabase/README 072-135 tracker rebuild, locked-
   doc records, SUPERSEDED banners, U14 public cardio promises gone,
   EU-Dublin residency corrected on the public page).
4. Three adversarial reviews run and actioned (D95-3): A reachability
   (three more inert taps fixed + pinned; the lead's own over-trimmed
   stepsTarget law restored; migrate_059 header; H1/H3 limitations
   recorded), B product boundaries (the check-in save was CLEARING
   retained cardio answers via an explicit null against the
   preserving-write contract - fixed by omitting the key; store-listing
   sources and marketing fact base closed as promise leaks; boundary
   suite re-anchored off dormant steps code), C repository truth
   (watermelon.md/settings.json banners, plate-maths claim deleted
   from the fact base, deploy-migrations header MANUAL-DISPATCH-ONLY,
   39 applied-range migration headers swept from "pending" to YES with
   the 2026-07-27 sweep citation).
5. Phase 28: no new migration written or run; 132-135 unapplied; 049
   HELD. Phase 30: all gates green (PHASE-30-GATES.md - full suite
   9,626 passing, lint clean, campaign 1-4 suites, jargon, identity
   invariant; route census 116→105 registrations, dead taps 16→0,
   sourceless 1→0, boundary remnants 2→0).
6. Founder items opened: FR-C4-1..11 + FR-PW-1 + H4 listing updates
   (all on TASKBOARD §3 with detail in D95-RULINGS.md). FR-1..FR-5
   carried unresolved; FR-2/FR-3/FR-5 recommendations updated on this
   campaign's evidence (PHASE-30-GATES.md Phase 29 section).
   STOPPED after Campaign 4 per the order.

## D96 interim — Campaign 5 founder rulings FQ-1..FQ-8 (2026-08-10)

Recorded mid-campaign on founder order (full text and per-ruling
detail: docs/first-use-audit-2026-08-10/D96-RULINGS.md, founder-rulings
block). Side rulings only; Campaign 5 continues as commissioned.

TIER LAW (founder, verbatim in substance, binding everywhere):
**FREE DOES NOT HAVE COACHING. PRO owns adaptive coaching and
Continue-with-adjustments.** The Block Ledger may remain tier-blind
internally (workout evidence is not a Pro data type); the adaptive
coaching decision built on that evidence is Pro. Accidental
entitlement via placeholder rows or incidental check-in data is
removed; tier eligibility comes from the real entitlement system.

Summary: FQ-1(c) hand-off calm pointer, no new screen, three docs
corrected · FQ-2(a) Pro sees BOTH Repeat and Continue-with-adjustments
side by side, advisor recommends never gates, adjustments consume the
ledger; Free truthfully Pro-gated · FQ-3(b) session difficulty as
separate coarse effort evidence, never fabricated per-set RIR,
conservative fallback, resolves FR-C4-4 · FQ-4(a) Apply wired
end-to-end to session prescriptions; unapplied proposals change
nothing · FQ-5 approved in principle, exact locked-copy wording gated
on founder review · FQ-6.1 approved (idempotent trial-grant retry),
6.2 approved (authoritative trial end date), 6.3 HELD pending store-
console verification (beside H4), 6.4 approved (truthful platform
subscription management replaces the fake local switch) · FQ-7(a)
first qualifying exposure per exercise is baseline, PRs from later
comparable exposures · FQ-8(b) wizard structure unchanged.

## D96 — Campaign 5: first-use, onboarding and first-block journey (CLOSED 2026-08-11)

Campaign complete and merged to main. Full record:
docs/first-use-audit-2026-08-10/ — CAMPAIGN-LOG.md (stage log with
every landing SHA), D96-RULINGS.md (every ruling with rationale:
audit-phase rulings, the founder's FQ-1..FQ-8 block, and the lead's
Review A/B/C rulings), twelve audit evidence files,
REVIEW-A-new-user.md / REVIEW-B-state.md / REVIEW-C-experienced.md,
RELEASE-TRUTH-2026-08-11.md.

Supplements the interim block above:

- FQ-5 wording was subsequently APPROVED IN FULL by the founder
  ("Approve all") and landed (consent version stamp 2026-08-10,
  stamp-only, no re-gating). FQ-6.3 was RESOLVED by founder console
  confirmation (14-day in-app trial + 7-day store intro offer in BOTH
  consoles; permanent record in docs/rules/billing.md, never re-ask).
  FQ-6.1/6.2/6.4 landed with a written billing test plan
  (fq6.billing.test.js).
- Reviews A/B/C (Phases 42-44) each produced genuine findings; all
  were lead-ruled under D33 and actioned same-day (RA-1..RA-10,
  RB-1..RB-12 with two recorded residuals, RC-1..RC-9 including the
  tier-visible RC-1 ruling restoring Edit plan to Pro). Rationale per
  finding in D96-RULINGS.md.
- Phase 41's deterministic synthetic first user
  (campaign5.syntheticJourney.test.js, 29 tests incl. all ordered
  variants) and the first-use matrix (campaign5.firstUse.test.js,
  172 tests) are the campaign's permanent regression contract.
- Phase 45 release-truth audit: all six checks verified; H4 (store
  listings still promise cardio) remains OPEN and founder-side.
- Unchanged, confirmed at close: Article 9 gate, ED safety, D92-11,
  billing architecture and product IDs, no cardio, no AI, no new
  social scope, no auto block transitions, ONBOARDING_QUIZ_FIRST dark
  with rollback infra intact, migrations 132-135 written-unapplied,
  049 HELD, no EAS build. No new telemetry was added.

WORK IS STOPPED per the order — no returning-user work. Founder-side
actions and carried FR items: docs/TASKBOARD.md §3.

## D98 — Campaign 22 Phase 2 Stage 2 lead rulings (2026-08-17, D33)

Recorded at the Stage 2 lead review on `claude/campaign22-home-impl`
(commit 56782be2). Authority: HOME-TODAY-UX-SPEC.md (binding Phase 1
spec) + FOUNDER-RULINGS-PHASE2.md (R1/R2/R3 locked YES).

- **D98-1 (spec conformance, not a fork):** the agent build rendered the
  first-review readiness line only after today's weigh-in was logged,
  silently dropping spec §17 R4's conflict-day clause ("weigh-in wins;
  readiness line moves to R2 slot rank 4.5 on conflict days"). Built in
  full at lead review: `todayLineArbiter` gains a rank-4.5 occupant fed
  only while today's weigh-in is unlogged; on logged days the line
  renders in the Evidence Row as before. The line never simply vanishes.
- **D98-2 (safety parity, inviolable-adjacent):** the Home first-review
  line's suppression is the You tab's FULL `edSuppressed` formula (open
  ED flag, SCOFF >= 2, failed wellbeing read, calm mode - all failing
  closed), not the raw ED flag alone as the agent built it. The two
  surfaces consume the identical ledger, so they can never disagree
  about when weigh-in counting is allowed. Pinned at source level in
  firstReviewLine.test.js.
- **D98-3 (rehomed trial card S3 tap target):** on the You screen the
  S3 zero-history variant ("One session starts your first coaching
  review") taps through to the Today tab's Start hero, not the weekly
  check-in (which at zero sessions opens a hold receipt, not the
  promised session) - the C5-P12-01 principle: the card leads to the
  session it names, or stops claiming to. All other variants open the
  weekly check-in directly. Rationale over effort per D33: one extra
  branch, honest destination.

## D99 — Campaign 23 founder rulings + privacy-law amendment (2026-08-17)

Founder rulings R1/R2 for the Progress redesign, verbatim record in
docs/progress-audit-campaign-23-2026-08-17/FOUNDER-RULINGS-PHASE2.md.

- **D99-1 (R1):** the Progress landing Visual pillar shows derived
  visual-progress intelligence only (assessment/progress signal,
  trend, confidence, comparison status) — never a photo thumbnail.
  Imagery stays inside Progress Photos.
- **D99-2 (R2):** SUPERSEDES D18's render-time-only design as final
  architecture. The coarse locally-derived photoCorroboration
  contract feeds the authoritative runWeeklyCoach call. Authority
  exactly bounded: one-step confidence movement via the existing
  corroboration rule; supports-only; never originates evidence;
  never exits data-hold; all ED/calm/safety suppression senior;
  never alters calories, macros, training, volume, floors, recovery
  or held decisions. Raw photos, scan assets, scores, estimates,
  measurements, scan IDs and history stay local-only, never entering
  sync or coach persistence. Only the ordinary resulting coach output
  persists/syncs; no explicit photo-derived input/source flag is
  persisted unless technically unavoidable and separately justified.
- **D99-3 (PRIVACY-LAW AMENDMENT, exact founder wording, standing):**
  "Raw photos and scan-derived measurements remain on-device. A
  locally derived, non-reversible corroboration signal may contribute
  only to the bounded confidence of an authoritative coaching result;
  underlying visual evidence is never uploaded or synced."

## D100 — Campaign 24 lead rulings (2026-08-17, D33; recorded late —
## hostile-review F5 caught that two commit bodies cited "recorded"
## rulings this register did not yet hold. Corrected before merge.)

- **D100-1 (CoachReview deload gate, Wave C):** the shouldDeload
  suggestion on CoachReviewScreen is the same sanctioned data-driven
  authority Home presents and stays tier-visible (recorded C18 honesty
  rule); the defect was the missing seniority gate. Fixed with Home's
  exact inScheduledRecovery predicate (FB-02). No tier gate.
- **D100-2 (BodyMetrics trend consolidation, Wave D):** the screen's
  parallel rate/maintenance computation consolidated onto the shared
  deriveWeightTrend, extending the RECORDED ED-flag suppression
  (direction-only, no rate, no maintenance, fail-closed reads) to the
  surface that had missed it — the D98-2 suppression-widening
  precedent: safety-positive, no threshold changed, nothing removed,
  no new suppression law invented (no calm gate the sibling lacks).
- **D100-3 (CoachReview bucket unification, cohesion pass):** the
  three deload bucket builders share one derivation
  (buildLast4WeekDeloadBuckets); CoachReview unifies onto the
  D6-correct answered-only path — its pre-D6 coercion of unrated
  values to zero was a stale bug (Campaign 1 P0-7 D6 fixed the other
  two copies), so the sensitivity change is the correction, pinned
  with before/after values.
- **D100-4 (dead settings toggle, Wave F):** showHomeNutrition retired
  (a toggle controlling nothing fails the truth law; building the
  unbuilt feature would be sprawl). Returns with the feature if ever
  built.
- **D100-5 (startup flash, Wave E):** the give-up/retry design per
  WAVE-E-FINDINGS.md item 0 under the founder's neutral-splash law;
  sign-out clears the prior-session marker (hostile F7).

## D101 — Campaign 25 lead rulings at landing (2026-08-17, D33)

- **D101-1 (hero order STOP item):** the implementation agent proved
  (source + git show) that the block-advice card rendered BEFORE the
  hero pre-campaign, contradicting the spec's §1 diagnosis prose. The
  explicit target order in the founder brief and spec §2 (hero first,
  block card second) governs; the reorder the agent applied is
  accepted and the spec carries a correction note in §1.
- **D101-2 (Workout templates placement):** the spec's five-section
  target architecture is silent on the templates section. It stays in
  its pre-existing relative position (after Archived) — nothing in the
  founder order named it, and inventing a move is out of scope.
- **D101-3 (archived restore):** with renderPlanCard's footer retired,
  Restore stays reachable solely through the archived options sheet
  ("Restore plan"), matching the spec's no-inline-Set-active law for
  archived rows. Verified live at handleArchivedPlanOptions.

## D102 — Campaign 26 founder device orders + lead rulings (2026-08-17)

Founder device orders (verbatim intent, from the device-walk messages):
remove the Progress tonnage landmark row; remove the NowCard left accent;
remove the Diary macros-guide row; rename the "Visual" pillar so users
know it is Progress photos; remove the Home greeting; restore the
since-check-in evidence pane the C22 "First review" link had flattened;
combine morning weight + review readiness into one quiet evidence row
with the logged state de-emphasised; clear the logger workspace (no
standing "This week: stop N short of failure" line, no in-card coach
note - the prescription is the intelligence, explanation on demand
only); plain chromeless ellipsis on the exercise header; fix Progress
pillar text running out of space; hero chip text must be about the
block it opens.

Lead rulings under D33 recorded with the implementation:

- **D102-1 (evidence pane honesty reconciliation):** the restore order
  SUPERSEDES the d1f6a608 removal of the runway, and the truth-repair
  ruling's clamp objection stays fixed inside the restored pane - the
  weigh-in row shows "N of 3" needed-to-do progress only while short and
  the ACTUAL count once met, never Math.min. "Since your check-in" only
  after a real check-in (C5-P12-04 kept). Neutral ED variant unchanged
  in scope (date-only, no counts, no weight line).
- **D102-2 (weight fold-in):** the weigh-in strip renders only while
  unlogged (the action state); a logged weight is one quiet tick row in
  the pane. The green Logged pill card is retired.
- **D102-3 (hero chip default):** "On track for this block." - the C22
  single-counter law stands, so no week counter returns to the hero;
  the week's shape (and effort target) stays in the block-shape sheet.
  Priorities 1-4 (recovery/deload/readiness/fatigue) are untouched.
- **D102-4 (logger explanations):** the C20 Stage 11 provenance copy
  bank and the whole in-card coach-line chain are retired; on-demand
  explanation homes remain (session-adjustment sheet, readiness sheet,
  Recovery banner). This REVERSES C20's "answer before every working
  set" presentation contract on the founder's direct order; the
  deterministic prescriptions themselves are unchanged.
- **D102-5 (Progress overflow):** pillar state/evidence text wraps in
  full (rows grow) rather than truncating mid-sentence; copy sources
  unchanged.
- **D102-6 (FRAMING CORRECTION, founder same-day, verbatim: "STOP
  CALLING IT FIRST REVIEW"):** the evidence pane is the RECURRING
  weekly read and is never framed as a first review in any state.
  Titles: "Since your check-in" once ANY real check-in exists in
  history; the ledger's own "What your coach is reading" before that.
  Root cause of the regression on the founder's four-week device: the
  pane (and the C22 line before it) keyed off latestCoachDecisionComplete,
  a CURRENT-WEEK predicate that goes false mid-cycle when the engine
  saves a held output before the week's check-in. "Ever checked in" now
  derives from check-in HISTORY (any weekly_checkins row with an energy
  score); sessions count from the last real check-in's timestamp.
  Pinned: no pane state may ever contain "first review"
  (evidencePanel.test.js framing-law block).

## D103 — text-size law opened for amendment (founder, 2026-08-17)

Founder ruling, given ahead of the Campaign 27 proposal (verbatim
intent): "I am open to modifying any law for the betterment of the
app. The goal is the app to be elite and perfect on a range of
[devices]. All texts can be sized as suited for the best product."
Effect: EP-14's blanket-uncapped text scaling is no longer inviolable;
per-surface caps and device-class type ramps may be proposed and, on
founder approval of the Campaign 27 proposal's choice points, built.
Any capping change must amend the Settings copy that promises the
phone's text size is respected (truth law). The specific amendment
awaits the founder's answers to PROPOSAL.md section 4.

## D104 — Campaign 27 proposal approved in full (founder, 2026-08-17)

The founder answered all three PROPOSAL.md section 4 choice points:
- **D104-1:** EP-14 amendment APPROVED as proposed - per-surface
  font-scale caps from one central theme table (reading 2.0x, dense
  chrome 1.3x, fixed-geometry numerals 1.15x), Settings text-size
  promise re-worded honestly in the same change, and the
  accessibilityDesign guard rewritten so caps may come only from the
  central table (closing the WorkoutSummaryScreen guard-evasion hole).
- **D104-2:** narrow-device type bucket APPROVED - below 390dp window
  width the display sizes step down one notch (40>36, 32>29, 24>22;
  body stays 16) and screen padding drops one step, inside
  resolveTheme/useTheme.
- **D104-3:** phasing APPROVED as sequenced: 2a wrap-first sweep, 2b
  cap table, 2c narrow bucket, 2d Maestro screenshot net (2d may run
  parallel). Each phase lands through the normal gates with its own
  device checklist.

## D105 — category type standardisation sanctioned + logger name step-down (founder, 2026-08-17)

Founder: "I'm open to standardising text across the app based on
category"; specifically, the workout logger's exercise name "could be
ever so slightly smaller". Effects:
- The deferred D0 type-role adoption sweep (~177 hand-rolled
  size/lineHeight sites, noted in theme.js's own bodySm comment) is
  UNLOCKED as Campaign 27 Phase 2e: every user-facing text site
  normalised onto a named type role, category-consistent app-wide.
- The logger exercise name steps title (17) -> bodyStrong (16, same
  medium weight); usability guard re-pinned.

## D106 — founder device orders, third batch (2026-08-17)

- **D106-1:** the evidence pane carries NO coach-voiced title ("the coach
  isn't actually a person"): "Since your check-in" once a check-in
  exists; before that the countdown leads with no title. Pinned.
- **D106-2:** food-adherence row added: "Food logged on N of the last 7
  days" (getRecentIntakeSummary's own day count), only when N >= 1; day
  count only, never amounts; dropped under the neutral ED variant.
- **D106-3:** logger header: exercise name and options dots on one true
  centre line (44dp axis, Android font padding dropped); the name-tap
  gains a quiet muted chevron-down so the exercise-details control is
  obviously interactive; a11y label "Exercise details".
- **D106-4 (PAUSE):** Campaign 27 Phase 2b PAUSED on founder order
  (usage limit) - the half-built cap table is banked unmerged on
  claude/campaign27-responsive-research (commit 586206d1, will fail
  Chip.a11y by design until resume); 2b/2c/2d/2e resume next week.

## D107 — complaint-research triage rulings (founder, 2026-08-17)

- **D107-1:** Apple Health / Health Connect stay DISABLED - founder:
  "very difficult to get through testing to go on the markets". A
  deliberate hold, not a gap; the report's P0 on it is declined. The
  dead-toggle SettingsHealthScreen UI is fixed to state this honestly.
- **D107-2:** injury/constraint controls and load semantics are the two
  workstreams adopted from the report ("would be good"), specced in
  docs/complaint-research-triage-2026-08-17/ (INJURY-CONSTRAINTS-SPEC,
  LOAD-SEMANTICS-SPEC) for the next session's build alongside the
  Campaign 27 resume. Everything else: dispositions in TRIAGE.md
  (mostly already covered; several holds; renewal-date display surfaced
  as a billing-gated founder option, not built).

## D108 — share-card elite revamp specced (founder order 2026-08-17)

Founder: cards "don't work well at all, look dull, data doesn't fit,
not attractive or share worthy" - full revamp to competitor-beating
standard. Evidence phase complete (share-system inventory with
rendered-PNG proof; competitor research). Design spec:
docs/share-cards-campaign-30-2026-08-17/ELITE-SHARE-SPEC.md - photo-
first tone-scrimmed composition, per-moment visual signatures,
story/square/portrait plus a transparent sticker export, quiet brand
mark, template-strip picker. ALL privacy/guard laws inherited; sticker
export adopts no-export-path-under-suppression. Build queued for the
next session; three founder taste choices listed in the spec. Also
surfaced: documentation debt - CLAUDE.md Section 2 does not name the
weekly weight-hero bodyweight exception (greatWeek.js:13-19).

## D109 — build-batch rulings (lead, D33, 2026-08-17)

Founder build order: share cards, then injury constraints, then load
semantics; "use appropriate low level agents as much as possible as
long as quality remains right." Rulings so the build proceeds from
settled law:
- **D109-1 (share taste defaults, per the spec's recommendations,
  reversible on the founder device walk):** story-first default
  format; tagline band dropped on every card; NO new typeface (the
  font-asset decision stays founder-gated) - hero contrast from
  weight/scale/glow only.
- **D109-2 (constraints fail direction):** on a constraints read
  error, generation/suggestion proceeds and the affected surfaces
  show a visible constraints-unavailable notice - never fabricate a
  constraint, never block training, never silently ignore the state.
- **D109-3 (constraints list home):** active movement constraints are
  listed from a "Avoided movements" row in the Plans screen's Plan
  tools section, opening a simple list with per-row removal; set/clear
  stays on the exercise long-press.
- **D109-4 (agent plan):** sonnet builds each spec lane (renderer,
  injury engine, screen UX, load semantics) with strict file lanes;
  the lead hands-on reviews every diff (engine hunks line-by-line)
  and rules all landings; landings in the founder's stated order.

## D110 — build-batch landing rulings (lead, D33, 2026-08-18)

All three lanes landed on main (C30 847ab8af/e8313c68, C31 f672c590,
C32 26d1a39b). Rulings made while landing:
- **D110-1 (read-layer law upheld over convenience):** the injury
  agent's movement-constraint WRITE helpers were moved out of
  intent.js into exercise/movementConstraints.js rather than
  loosening the campaign9.intent.test.js source guard - intent.js
  stays the pinned read-only layer. isPatternAvoided additionally
  hardened to require the row to exist before comparing kinds (an
  undefined-vs-undefined comparison in any context where the constant
  resolves undefined would have silently blocked every family).
- **D110-2 (D109-2 applied to a pinned test):** the "read failure is
  byte-identical to a clean slate" generation pin was re-pinned to
  allow exactly ONE difference - the visible constraintsUnavailable
  flag - because D109-2 rules a read failure must not masquerade as a
  clean slate. Writes remain pinned identical.
- **D110-3 (bright-top photo scrim):** the share scrim's legibility
  decision for the OPENING gradient stop now answers to the photo's
  TOP band luminance, sampled separately from the bottom-weighted
  scrim tone - a bright-sky-top/dark-floor photo previously read
  "dark" overall and left the header text on raw pale photo.
- **D110-4 (per-hand classification record):** dumbbell/kettlebell
  equipment does not imply per_hand; single-implement movements
  (goblet squats, pullovers, swings, one-arm rows, carries, get-ups
  and kin) stay 'total' via an explicit named exception list in
  seedExercises.js - the reviewable judgement record, adjustable
  name-by-name on the founder walk.
- **D110-5 (weekly recap formats):** the weekly card's square-only
  restriction is lifted; the rebuilt renderer composes it on
  story/portrait properly (verified in the review PNGs), so all four
  formats are offered on every card type.

## D111 — Play API-36 block, Android versionCode, iOS signing (2026-08-18)

Three separate release blockers surfaced together on the founder's
device/console walk. Sources: the Play Console policy notice ("App must
target Android 16 (API level 36) or higher... your highest non-compliant
target API level is Android 15"), the founder report "Android version
needs bumped too it's been stuck at 30 for about 3 weeks", and the
failing iOS run
https://github.com/allansdouglas1983-cmyk/ADPhysique/actions/runs/32126449846.
The API-36 analysis was NOT re-derived: it is taken from
`docs/release-readiness-2026-08-11/PLATFORM-REQUIREMENTS-2026-08-11.md`
§1, which audited every Android 16 behaviour change against this repo on
2026-08-11 and reserved exactly one row for the founder.

- **D111-1 (FOUNDER RULING - large screens at targetSdk 36):** the
  audit's adaptive-layout row is the one fork it explicitly refused to
  pre-decide ("must be put to the founder, not pre-decided"). Put as a
  three-way question; the founder chose **ship API 36 with NO opt-out**.
  So `PROPERTY_COMPAT_ALLOW_RESTRICTED_RESIZABILITY` is deliberately NOT
  emitted. Consequence, accepted knowingly: from the next release,
  Android 16 ignores the portrait lock on any display >= 600dp, so
  tablets and unfolded foldables render the 82 screens in landscape at
  tablet width, which the app has never been laid out for. Phones (the
  entire current user base) are unaffected. Large-screen layout is now
  real outstanding product work, not a hypothetical.
- **D111-2 (lead, D33 - versionCode authority moves to CI):** the store
  sat on versionCode 30 for five weeks because the Android release is
  built LOCALLY on the GitHub runner (`expo prebuild` + gradle), so
  eas.json's `appVersionSource: remote` and the production profile's
  `autoIncrement: true` never applied to it - those govern EAS CLOUD
  builds, which this repo uses for iOS only. Every AAB carried whatever
  integer app.json held, last hand-bumped 2026-07-13 (d97d513f), and
  Play rejects a duplicate versionCode. Fixed at the cause rather than
  by another hand-bump: build-android.yml now derives the versionCode
  from `github.run_number` (monotonic, never reused) before prebuild.
  app.json keeps the value as a FLOOR and the step fails loudly if the
  run counter ever regresses below it, so the failure mode is a red CI
  step rather than a silent Play rejection.
- **D111-3 (no code fix exists for the iOS failure):** build #146 failed
  signing, not compiling. `ios.associatedDomains` was added 2026-08-11
  (fc08bd1e); EAS synced the capability onto the App ID but reused the
  provisioning profile minted 2026-06-10, which predates it. This is the
  exact GOTCHA already recorded in build-ios.yml's header from
  2026-06-10. Capability sync does not regenerate an active profile and
  EAS exposes no non-interactive flag that forces it, so the fix is a
  one-time credential deletion by the founder. Driving `eas credentials`
  under expect was considered and REJECTED: its menus are positional and
  a mis-selection revokes the distribution certificate, which is a worse
  failure than the one being fixed. The workflow header now records this
  second occurrence verbatim so the next one is recognised on sight.

- **D111-4 (iOS Universal Links entitlement REVERTED, 2026-08-18):**
  `ios.associatedDomains: ['applinks:volyume.app']`, added 2026-08-11 in
  fc08bd1e, is removed. Evidence: the complete xcodebuild log for run
  #146 contains exactly TWO error lines in 1,995 lines, both at
  Volyume.xcodeproj:1978-1979 - "doesn't support the Associated Domains
  capability" and "doesn't include the com.apple.developer.
  associated-domains entitlement". Every other line is a deployment-target
  warning or a run-script note; the compile was clean, and there is no
  dependency error in the log. Run #145 (2026-07-30), the last green iOS
  build, predates the entitlement.
  Ruled to REMOVE rather than to keep provisioning it, on the founder's
  refusal to spend further build credits testing a signing hypothesis.
  This costs users nothing: no shipped iOS build has EVER carried the
  entitlement, so it reverts an unshipped change rather than dropping a
  live feature, and iOS partner links keep resolving through the
  `volyume://` scheme. The AASA file stays served from
  `public/.well-known/`, and the campaign7.releaseConfig guard now pins
  the ABSENCE with this rationale plus the AASA assertion retained, so
  restoring it is one line in app.json once a provisioning profile
  carrying the entitlement exists.
  Correction recorded against my own earlier advice: I told the founder
  to delete the profile on expo.dev. The run log shows EAS also does
  "Fetched Apple provisioning profiles" from Apple and reports the
  profile Status active, so an expo.dev deletion alone need not remove it
  - the Apple Developer portal copy has to go too. That omission is why
  the same advice had failed before.

## D112 — CC33 injury/disability capability: audit verdict + coherent-capability design ruling (lead-ruled under D33, 2026-08-28)

The CC33 end-to-end audit (four banked evidence lanes, 60 findings,
lead-verified: `docs/injury-disability-audit-2026-08-28/`) CONFIRMS all
five founder beliefs — not findable, not understandable, not easy to
use, not explanatory, imperfectly integrated — and finds integration
worse than believed: four S1 not-honoured defects (T1-01 ceilings never
enforced; T1-03 baseline rule + installed plan changes nothing; T2-01
promotion silently reverts substitutions; T2-02 user allowances ignored
by every consumer but the picker), plus fail-open postures on the coach
apply path and swaps. The engine core is sound; the defect is everything
between the engine and the person (FINDINGS.md §2–3: six structural
causes).

RULED (full rationale in `DESIGN-RULING.md`, same folder): the coherence
model "temporary is an overlay; permanent is the document", enacted by
eight rulings — R1 baseline lifecycle completed (plan-rewrite proposal on
baseline creation AND promotion; RT2-1 amended: baseline invisibility is
correct only while the document is baseline-compatible); R2 the resolver
is the only suggestion door (raw-library paths rerouted, guarded by
regression tests); R3 one fail-safe posture (generation holds; serve
says "could not check"; coach apply withholds — never body-wide on a
failed read); R4 the user's word outranks the model inside the safety
envelope (allowances everywhere, manual adds never overridden, per-line
Apply/Decline + revisit surface, real-outcome previews, no words put in
the user's mouth); R5 the specified quiet visibility layer actually
built (post-workout line, plan markers, why-this, narrowing counts,
effects history, Home line, graded total-block state); R6 one vocabulary
per lane + uniform clinician standing (named decline confirm; provenance
so capability swaps stop teaching the preference lane); R7 coaching
truth (CONSTRAINED reachable on both drivers, substituted effects
recorded, adherence gate defers when excused); R8 §25 "just hold my
plan" built (per-episode adaptation_mode, additive migrate_152 written,
founder phrase to apply).

Residuals RULED, not parked: §20 neverClaim = invariant-pinned, runtime
filter retired; §23.4 no-window stands with the block-boundary stamp gap
closed; stale-vs-unavailable = one user-facing state; live session-length
wiring ruled OUT (against the §14 control model). Unchanged: engine
core, RT2-2 naming, FD-1 free tier, Article 9 lane, notifications lane,
ED-safety, billing/tier. T2's migration question CLOSED by record +
read-only production check: 145–149 + 151 live; the contrary code
comments are stale (fix queued W4). Build: five waves (W1/W2/W5 lead
hands-on — honour core, coaching truth, resolver door + suspension;
W3/W4 Sonnet pairs under lead review — visibility, flows/vocabulary),
then the S5 gate with device checklist. Truth field
REAL-DISABLED-USER-VALIDATED stays NO.

## D113 — CC33 adversarial-review closure rulings (lead-ruled under D33, 2026-08-29)

The fresh-eyes adversarial review (briefed against SCORECARD.md, run on
main 1839143e) returned 12 BROKEN, 16 QUALIFIED, 1 STOP. Every finding
was verified against the code before acting; fixes landed at root the
same day. Three rulings, each on the absolute-best-for-users criterion:

1. **UNKNOWN drives nothing automatic (F1/F2/F4 class).** An UNKNOWN
   capability conflict (a NULL demand column: a custom lift, an
   unresolved row) never substitutes, omits, excuses, proposes, marks a
   review slot, or rewrites the document. It exists ONLY for visible,
   honest notices ("Volyume doesn't know yet whether this involves…" —
   the picker's own branch, now spoken by session and plan surfaces
   too). Rationale: the resolver's own law is "never silently treated as
   fine, never silently treated as a conflict"; automation on an
   unestablished fact was both at once. Enforced at
   computeEffectiveSession, computeCompletionEffects, the preview, the
   rewrite, and blockAdvisor's two fields.

2. **Source outranks certainty (F5).** A clinician-reported rule's
   conflict is never allowance-carved and ranks CLINICIAN whatever its
   certainty; an unknown clinician conflict routes to the rule editor
   like a definite one, never to the inline "Add, this works for me"
   flow, with copy stating both facts (the rule, and the not-knowing).
   Rationale: CAP-7's no-silent-override posture cannot depend on
   whether a movement's metadata is filled in; the conservative reading
   is the only safe one on the clinical axis.

3. **A per-line Keep is episode-scoped (F6).** The "Choose per
   exercise" Keep mints its allowance INTO each driving episode's own
   group (role episode, the group's id): it ends with the episode,
   restarts with a flare, and becomes permanent only on promotion. The
   picker's identity-level "this works for me" keeps its permanent
   baseline mint — two scopes, both representable in the existing model,
   no schema change. Allowance rows now render distinctly everywhere
   (episode card "(kept in)", baseline row "Kept in at your word…",
   reversed remove-confirm) — a keep must never read as a restriction.

Also closed from the same report: F3 (adaptation_mode now travels
unconditionally in sync pushes — the some()-gated carry served a
pre-migrate_152 world that no longer exists, and lost the resume of the
last held episode cross-device; pinned by a driven round-trip test, not
a source string), F7 (Choice selection gains a tick and border weight —
never colour alone), F8 (the pins that let F1/F2/F3 ship now drive the
real mechanisms with production-shaped fixtures), Q4 (the portability
export gains effective_choice and adaptation_mode), E1's gap (Home
carries a quiet ask-row for arrived-but-undecided rules, sharing the
AWAITING slot), and the J5 residual (the per-line arrow carries a
spoken accessibility label). Founder-side items surfaced separately:
the S1 phrase-gate record and CLAUDE.md's stale status block. The
review re-runs against the fixed tree per the scorecard's own process.

## D114 — CC33 review round 2 closures (lead-ruled under D33, 2026-08-29)

Round 2 (on 715ad90e) returned 7 BROKEN, 16 QUALIFIED, 0 STOP - all
actionable findings closed at root the same day. Two new rulings; the
rest apply D113's rulings to gates they had not reached:

1. **A rule with nothing to decide is decided (R2-5).** When a proposal
   finds NOTHING affected (a synced-in rule touching no current plan
   row; a user with no plan), the rule records the vacuous 'applied' -
   the same default the whole-group Apply gives a no-effect rule and
   the same promise the add flow's toast makes. Rationale: leaving it
   undecided made Home's ask-row and the standing revisit row
   permanent, promising a decision no surface could offer; and serve's
   later behaviour under 'applied' (substitute with the visible notice
   and swap shortcut) is exactly the standing product promise.

2. **Episode status derives from restrictions (R2-2).** episodeStatus
   ignores exercise_allow rows (falling back to them only if a group
   somehow holds nothing else), so a per-line Keep - an open-ended
   allow row by design - can never pin its group ACTIVE past its
   planned end. This makes the settings card agree with Home by
   construction (the resolver's restrictions already exclude
   allowances), and keeps the "still need it?" cadence reachable for
   exactly the users who engaged with the per-line review.

D113 ruling 1 (unknown drives nothing) reached its two missed gates:
planAutoGen's evidence now asks each lane directly (excluded = id +
family preference only; capabilityIneligible = DEFINITE blocking
conflict, byte-matching blockAdvisor so the engines cannot drift -
round 2's I9), and the completion-excusal caller resolves rows from
the library before judging. D113 ruling 2 (source outranks certainty)
reached the near-miss list (an unknown clinician conflict never earns
"you can still add it yourself"). The R2-6 stale-slot window my F1 fix
opened is CLOSED, not narrowed: resolves are id-stamped and adopted
only on match, and until then the notices say nothing rather than
something wrong. Also: duplicate-exercise slots serve their own
prescriptions (claimed-index mapping), the capture preselect never
pre-fills an axis from an unknown, ended keeps read "(kept in)" in the
Past list, the hold caption speaks only for definite conflicts, the
Choice label wraps inside its tick row, and the capability rows whose
meaning lives in the sub speak it (additive accessibilityLabel
override on SettingRow; Choice composes its own).

## D115 — CC33 review round 3 closures + register corrections (lead-ruled under D33, 2026-08-29)

Round 3 (on 59a7daa4) was NOT clean: 8 rows BROKEN from 5 roots, two of
them regressions introduced by round 2's own closures, and a process
verdict worth keeping verbatim: "each round's fixes are landing at the
exact line the finding named, and the round after finds the next
consumer along" - because three round-2 fixes were pinned by
source-string guards and one by nothing. Round 3's closures are
mechanism-level with DRIVEN pins through the real entry points.

REGISTER CORRECTIONS (D114 made two claims round 3 proved false; they
are corrected here, not softened): "custom lifts are never REPLACED on
a NULL column" was false - the field fix passed and the slot fell to
equipmentLost one rank later; and "the per-line review remains
reachable from the plan surface" was false for a vacuously-applied rule
that later bites. Both are now true of the tree, per the closures below.

1. **R3-1.** currentLibraryIds derives from ALL exercises filtered by
   equipment alone (never the generation-filtered library, whose
   capability drops made every unknown incumbent read "equipment
   lost"), and an UNKNOWN capability reason never blocks the resolution
   write (only continuity-retained incumbents can carry one; the T1-07
   hold carve-out stands for definite blocks). DRIVEN pin: a real
   generatePlanDryRun rebuild retains a NULL-column custom lift into
   the RESOLVED plan with no equipment/capability receipt line, beside
   a control proving a definite block still replaces with the
   capability reason (planAutoGen.capabilityRebuild.driven.test.js).
   The unknown-episode KEEP round 3 called a regression is ruled
   CORRECTLY retired: CAPABILITY_HOLD's receipt line asserts the
   conflict as fact, so an unknown-episode slot is evidence-judged like
   any other - unknown neither holds nor replaces; it says nothing.

2. **R3-2.** computePlanEffectiveLines/Summary carry `checked`: a
   failed read is "could not tell", never "nothing affected", and the
   vacuous 'applied' fires only on a completed check (driven pins with
   a rejecting DB assert NO write). Limb b: hasCapabilityToRevisit and
   the revisit tap gain the APPLIED-rules reach, so a vacuously-applied
   rule that later produces lines regains its review (Not now flips it
   declined; Choose per exercise reopens the per-line list).

3. **R3-3.** The in-session held notice gates on DEFINITE conflicts,
   byte-matching the plan view's caption - the two surfaces can no
   longer contradict each other about a held unknown row.

4. **R3-4.** applyEffectiveViewToSession returns each served row's BASE
   INDEX ({served, baseIndexes, untouched}); the screen consumes them
   and reconstructs nothing. DRIVEN pin: duplicate exercise ids with an
   omitted plan row and a _userAdded twin - the user's own object is
   served, at its own slot, with the omission recorded for slot 0 only.

5. **R3-5.** The weekly check-in reads restrictions only, and
   rulePhrase returns null for EXERCISE_ALLOW ("a name is never
   inverted") - a keep can never again be spoken as something trained
   without. Also closed: the completion excusal reads a FRESH
   capability state at finish (a rule captured mid-session excuses that
   same session's absences).

NEWLY DISCOVERED while building the R3-1 driven pin, recorded as an
OPEN work item (not fixed this round; round 4 attacks it): an
incumbent custom exercise whose name resolves NO movement family (no
stored subregion tag) never contests any continuity slot, so a rebuild
drops it SILENTLY with no receipt line at all - a pre-existing property
of family-keyed matching, now a stated condition on A13. The fix is a
design question (how an unclassifiable movement is carried) and is not
rushed mid-round.

## D116 — CC33 review round 4 closures (lead-ruled under D33, 2026-08-29)

Round 4 (on 05a7f49d): 7 BROKEN from 4 roots, none a round-3
regression - all seams the earlier fixes had not reached, the worst of
them inside the lead's own round-3 revisit design. All closed, plus the
OPEN item and every actionable QUALIFIED. Rulings:

1. **Revisiting is not re-applying (F-1).** An already-applied episode
   is revisited through its own per-GROUP dialogue: the alert names the
   group's subject, its cancel is a TRUE no-op ("Leave it as it is" -
   looking is not deciding), stopping is the explicit destructive
   action gated by the clinician confirm, and "Choose per exercise"
   opens the per-line review. The round-3 shape passed the flat union
   of every applied rule to the APPLY proposal, whose cancel-styled
   "Not now" declined all of them - one natural dismiss stopped Volyume
   working around every episode the user had.

2. **The record follows the serve decision (F-2).** Effects are written
   only after the served-length decision; a fully-omitted session
   fail-safes with ZERO records. And the fail-safe itself is RULED: a
   session is never served empty - the rows serve with their visible
   conflict notices, because an empty session is a dead end and the
   rules are workarounds, not prohibitions. The weekly denominator's
   predictive whole-session reduction (database.js CC29 §18) stays as
   deliberate coaching conservatism, stated on Q5's row.

3. **One gate, everywhere (F-3).** The plan caption's applied test runs
   over the ACTIONABLE rows (held excluded), serve's own gate - the
   eight hold/applied/declined combinations now agree across surfaces.

4. **Touch targets are law on quiet rows too (F-4).** Home's three
   capability rows carry minHeight 48; the campaign gains its first
   touch-target guard pin.

5. **An absence never outranks a fact (Q1).** generationBlockReason
   reports the preference lane's own reason when rank-4 UNKNOWN would
   mask one, so the R3-1 resolution carve cannot readmit a
   user-excluded exercise; the POOL-never-NULL-on-blockable-axes
   invariant is pinned over the real seed; planAutoGen's false comment
   corrected in place.

6. **Silence is the one outcome a receipt may never have (Q2).** The
   OPEN item is closed at its reporting root: continuity accounts for
   every incumbent - one matching no rebuilt slot lands in the new
   NO_LONGER_IN outcome with reason no_matching_slot, rendered as "No
   longer in your plan" ("The rebuilt plan has nothing doing the job
   this one did. You can add it back to any session yourself."), and
   muscle-less customs are loaded so they too are accounted for. The
   plan itself is untouched - reporting, never a splice; the
   family-match guarantee stands. The deeper design question (should an
   unclassifiable movement be CARRIED - muscle-level fallback, or a
   captured tag at creation) remains open by choice and is recorded on
   the board for a post-campaign ruling; the defect was the silence,
   and the silence is closed. Driven pin: an untagged custom incumbent
   produces exactly one no_longer_in decision through a real
   generatePlanDryRun.

7. **A partial read is not a proposal (Q3).** checked=false with
   affected lines defers the proposal entirely - counts are never
   stated as fact off a plan the app failed to finish reading.

Also: hasCapabilityToRevisit short-circuits baseline-first (Q4, one
sweep on the common focus); the receipt copy stays inside the C16
plain-English law (no "slot" reaches the user).

## D117 — CC33 review round 5 closures + D116 corrections (lead-ruled under D33, 2026-08-29)

Adversarial review round 5 (on main 88f45b5a): 11 rows BROKEN from 9
roots (four of them round-4 regressions - Q2 and F-1 each landed one
consumer short), 6 QUALIFIED, 0 STOP. All nine roots and four of the
qualified conditions closed same-day. Rulings and corrections:

1. **One session, one movement once - with memory (R5-8).**
   bestEligibleSubstitute takes a taken-set; computeEffectiveSession,
   computePlanEffectiveLines and computeCapabilityPlanRewrite thread the
   substitutes already chosen for the same session/routine, seeded with
   the session's own row ids (a substitute must not duplicate an
   unaffected row either - the same law continuity.js states for the
   generator). A slot whose candidates are exhausted falls to the next
   rank, then to the existing honest omitted/unsolvable path - never a
   duplicate, in serve, preview, count or the written document. The
   preview walk additionally consumes substitutes for rows other
   APPLIED groups are already substituting, in row order, so preview
   names match serve assignments. Q-5's qualified condition (counts
   silent about N swaps landing on one movement) dissolves with it: they
   no longer can. Driven pins at serve, count and rewrite.

2. **The mirror shares the fail-safe, not just the wiring (R5-4).**
   countEffectiveSessionRows returns the BASE count when the reduction
   would reach zero - the exact session serve's never-served-empty
   fail-safe (D116 ruling 2) serves in full. The Today card line no
   longer vanishes off a falsy 0.

3. **The weekly denominator predicts nothing (R5-5) - CORRECTING D116
   ruling 2.** D116 kept §18's predictive whole-session reduction as
   "deliberate coaching conservatism". Its premise - that a
   fully-omitted session is "not owed" - became false the moment D116
   itself ruled such sessions are never served empty; and §18's
   capability-only substitute test is strictly weaker than serve's
   composed senior question, so serve's candidate pool is a subset of
   §18's and every session §18 excused was one serve was about to serve
   IN FULL. The reduction could only flatter completed/planned - the
   direction was never conservative. DELETED. The weekly stats read
   what a constraint actually did (effects records: excused, reshaped,
   ended-early), never what one might do. Pinned at source.
   Additionally corrected: D116 ruling 2 said this condition was
   "stated on Q5's row" - the scorecard has no Q5 row (its 93 rows are
   A1-L7 plus X1/X2). The condition now lives where a reader of the
   yardstick can find it: B9's row.

4. **A receipt reaches every renderer, and its headline never denies
   its sections (R5-1/R5-2/R5-3).** PlansScreen's block-boundary sheet
   renders the fourth section; exerciseChanges counts drops, so a
   drop-only rebuild takes the REBUILD path instead of reactivating the
   old plan (the receipt's drop now actually happens - the deeper
   defect behind the silent render); receiptHeadline takes and speaks
   the fourth count; the accounting loop dedupes by exercise id; both
   renderers key the gone-list on previousExerciseId (names are not
   unique). Driven pins for headline, dedupe and line identity; a new
   guard suite pins both renderers.

5. **Every conversation reachable, one per tap (R5-6 + Q-3).** The
   revisit row gathers every available conversation - each applied
   group currently producing lines, and the baseline rewrite - and
   opens exactly one: directly when there is one, through a chooser
   (true no-op cancel) when there are several. Round 4's first-group
   break is gone, and the rewrite no longer stacks on the group
   review's own result. reviewAppliedGroup itself was correct and is
   unchanged.

6. **The toast tells the truth about failed reads (R5-9).** Both
   proposal helpers return {surfaced, checked};
   computeCapabilityPlanRewrite carries checked (unavailable state,
   failed routine read, or a caller's ids an empty state cannot
   explain, all read "could not tell"); the revisit tap's terminal
   line branches: "Volyume could not read your plan just now. Nothing
   has changed. Try again in a moment." - never "nothing needs a
   decision" off a failed read. The detector back-off key is stamped
   only on a COMPLETED check, so a failed read no longer blocks the
   passive retry for the life of the mounted screen.

7. **The caption speaks serve's answer (R5-7).** RoutineDetailScreen
   holds one hoisted memo (I4: never a per-row library scan) running
   the same computeEffectiveSession serve runs, under the now-EXPORTED
   substituteSeniorQuestion - one answer, five consumers - with the
   fail-safe mirrored. The applied caption is three-way: "Swapped in
   sessions while your change lasts." only when serve substitutes;
   "Left out of sessions while your change lasts, with nothing forced
   in its place." when serve omits; the no-promise "Sits outside your
   temporary change." for the fail-safe, an unresolved row, or an
   unresolved memo.

8. **The in-session generic never claims an adaptation (Q-1).** A row
   showing the constraint notice is by construction served as planned,
   so the app-as-subject generic was false in every reachable case.
   Both generics replaced with "This one sits outside your temporary
   change. Swap it when you're ready." - mirroring the baseline
   branch; the substituted row keeps its own truthful marker.

9. **The clinician confirm speaks its frame (Q-2).** Three frames -
   decline (original words, verbatim), stop ("Stopping means your
   sessions show it again." / "Keep working around it" / "Stop
   anyway"), keep ("Keeping it in means your sessions keep showing
   it." / "Go back" / "Keep it in anyway") - one gate, no mid-flow
   vocabulary switch, and no cancel readable as "keep the rule out".

10. **Pin coverage follows the ruling, not the example (Q-4).** The
    Q1 fall-through now has pins for all three preference reasons
    (EXCLUDED, AVOIDED_BLOCK id-level, PATTERN_AVOID family-level);
    the receipt headline and PlansScreen's render are pinned (R5-1/2
    shipped green through 1,109 suites - a gap in pins, not in the
    gate).

Also: REVIEW-BRIEF.md's stale "87 rows" corrected to 93 (lines 26 and
154); J1's W3 half swept - W3 added no interactive controls (both its
notes are plain Text, pinned as such by their own guards; the
SettingsPrimitives accessibilityLabel override is itself the
accessibility fix), so J1's remaining condition is round-4's controls
plus this recorded sweep.

## D118 — CC33 review round 6 closures + D117 corrections (lead-ruled under D33, 2026-08-29)

Adversarial review round 6 (on main 4584c860): 8 rows BROKEN from 6
roots, 8 QUALIFIED, 0 STOP. All six roots and five qualified
conditions closed same-day. Two D117 claims round 6 proved false are
corrected here, not softened:

1. **The substitute pool honours every scope the user's word carries
   (R6-1).** All four capability paths in sessionEffective loaded the
   intent state without the active block's id, so "Avoid for this
   block" rows compared their scope against null and went dormant -
   serve substituted IN the exact movement the user had avoided, and
   the rewrite offered to write it into the document permanently. One
   scoped loader (loadScopedIntentState: getActiveBlock then
   loadExerciseIntentState with the id, planAutoGen's own posture) now
   feeds all four paths. CORRECTING D117 ruling 7: "one answer, five
   consumers" was false as claimed - the fifth consumer (the caption
   memo) was fed a block-scoped state while the other four were not;
   the inputs now match. Driven through the REAL senior question,
   which - the reviewer proved - no pin in the campaign had ever run
   (the old serveGuard mock replaced isEligibleExercise with a
   stand-in; only the loader is mocked now, honouring the scope it is
   asked for, so an unthreaded caller fails the pins).

2. **Dialogues speak in the indicative only about what serve is doing
   (R6-3).** computePlanEffectiveLines gains serveGate mode: a line
   exists only where serve's own substitution gate passes (every
   definite actionable conflict applied). The applied-group revisit
   dialogue and the revisit chooser read this mode, so "Your sessions
   currently show 1 exercise swapped" is never claimed for a row a
   declined or undecided co-driver holds in place - and a group serve
   is not acting on is not offered as a conversation. Default
   (would-if) mode is honest too: a DECLINED co-driver keeps its row
   served whatever the proposal's answer, so it produces no line; an
   undecided one is read optimistically (it has its own proposal
   pending) - the one place the modes differ, pinned as such. BOTH
   modes now mirror the never-served-empty fail-safe per routine: a
   session serve would serve untouched yields no lines, so no proposal
   can claim reductions serve will refuse to make.
   hasCapabilityToRevisit deliberately stays on the would-if mode
   (showing the review row is not a claim; hiding it would strand the
   revisit) - noted in its docblock.

3. **The named in-session line states the conflict (R6-4).**
   CORRECTING D117 ruling 8: "both generics replaced" was true and
   insufficient - the NAMED variant one line above them still claimed
   a workaround in progress, and it is the branch that fires for every
   demand and family rule. It now mirrors the baseline named line:
   "This one involves X, which sits outside your temporary change.
   Swap it when you're ready." - and it was the only conflict line of
   four with no action offer, which this closes too.

4. **The headline is COMPOSED from every rendered count (R6-5).**
   receiptHeadline takes the added count (it had no parameter for it -
   "Nothing is changing" rendered above "New in your plan") and speaks
   changes, additions and drops in one line; the rep-target statement
   is additive and survives drops and changes (it used to be
   unreachable once a drop existed, replaced by "The rest stays as
   it is" - an affirmative denial over moving rep targets).
   PlanUpdateScreen renders prescriptionCopy on its stays lines so the
   count has a section on both renderers. Continuity ruling: matching
   consumes ENTRIES (a lift deliberately programmed on two days
   retains both rows - it was relisted as "New in your plan" while
   also under "What stays"), while the gone-accounting stays keyed on
   IDS (an exercise still anywhere in the new plan is never "no longer
   in your plan" - stated as A13's condition). Every receipt line
   carries exerciseId and every list on both renderers keys on
   identity plus index.

5. **A failed read never says "nothing" anywhere (R6-6 + B9).** The
   per-line review's empty answer branches on checked, sharing one
   COULD_NOT_READ_TOAST constant with the revisit toast so the sites
   cannot drift. countEffectiveSessionRows returns null - not a falsy
   0 - when the routine itself could not be read, so HomeScreen's ??
   fallback shows the raw count exactly as its comment always claimed;
   0 now means only "this routine is empty".

6. **The plan view re-reads on focus (R6-2 staleness limb).**
   RoutineDetailScreen registers a focus listener re-running both
   loaders: it stays mounted while the user trains in another tab, so
   an episode captured mid-session left the captions and the
   serve-outcome memo speaking a pre-capture answer with no refresh
   path short of popping the screen. Cost: the round-6 review measured
   the memo at 0.7 ms per recompute over a 300-exercise library.

7. **Alert ergonomics are law-compliant (J2 + J5) and the chooser is
   unambiguous (J4 + C1).** AppAlert buttons move from an off-scale
   44dp literal to spacing.xxxl (48 - the styling law's minimum,
   "gym, sweaty hands"); the action region becomes its own bounded
   ScrollView, so a long stacked list (the revisit chooser at a large
   font scale) scrolls instead of clipping its last buttons - D42's
   footer-stays-put shape holds in every ordinary alert and the
   pathological case degrades to scrollable, never unreachable. These
   are global-component changes, made under the styling law's own
   authority. The revisit chooser's cancel takes the F-1 no-op wording
   ("Leave it as it is") - "Not now" is this same screen's DECLINE on
   the apply proposal, one state apart - and colliding chooser labels
   are distinguished by the group's start date.

Also recorded: the round-5 handover banner overstated the pins
("closed same-day at mechanism level with driven pins") - five of
round 5's nine closures were pinned by source-string guards; the
banner now says which halves are driven and which are source-pinned,
and this round converted the substitute-selection pins to run the real
senior question. X1 (REAL-DISABLED-USER-VALIDATED = NO) and X2
(founder device walk) remain unclaimable; the round-6 I4 measurements
are Node timings, not device timings.

## D119 — CC33 review round 7 closures (lead-ruled under D33, 2026-08-29)

Adversarial review round 7 (on main e2807c24): 7 rows BROKEN from 6
roots — two of them round-6 regressions (R7-1 from the entry-keyed
matching, R7-6 from the actions-scroll), one a round-6 wording fix
landing one alert short (R7-5), one the round-6 fail-safe's blast
radius (R7-4), and two pre-existing defects the deeper attack surfaced
(R7-2, R7-3). All six closed same-day, plus the B3 double-load
condition. Rulings:

1. **The side carve is a UNION decision (R7-3 - the campaign's most
   safety-adjacent finding).** Evaluated per rule, a LEFT rule and a
   RIGHT rule on one carveable axis each carved independently - two
   rules saying "not this side" combined into "fully available", the
   exercise survived generation, was offered as a substitute, and the
   one-side-at-a-time note told the user they could work the other
   side when they had said they cannot do it on either. sideCarveByAxis
   now decides per axis over the whole state: an axis carves only while
   exactly ONE side is restricted and no unsided rule restricts it too;
   isSideCarvedAvailable consumes the same answer so the note and the
   block can never disagree. Sources are irrelevant to the union on
   purpose (the clinician ranking lives in blockingConflicts). Pinned:
   left+right blocked, left+left still carved, sided+unsided blocked,
   clinician-left+self-right blocked at the clinician rank, different
   axes never combine, and the both-hands movement unchanged.

2. **Matching is per entry ACROSS days, per id WITHIN a session
   (R7-1, correcting D118 ruling 4's blast radius).** The entry-keyed
   matching let one incumbent be retained into two slots of ONE
   session when the rebuilt session held two slots of the same slotKey
   (ordinary for quads). A per-workout guard refuses an incumbent
   whose exercise is already retained into that workout - the slot
   falls through to the generator's own pick, exactly as the id-keyed
   code did - while cross-workout double retention (the R6-5 case)
   stays. Pinned both ways: cross-workout retains both rows,
   same-workout never duplicates.

3. **The fail-safe is TOLD, not silent (R7-4, completing D118 ruling
   2).** Round 6 correctly stopped the proposal claiming reductions
   serve would refuse to make - and folded the case into "nothing
   affected", so the save toast's "Volyume will work around this"
   stood as the only thing ever said about a rule the fail-safe means
   it will not honour, recorded 'applied' with no proposal and no
   revisit. computePlanEffectiveLines now reports failSafeRoutineIds
   and the summary carries the count; the add-flow proposal shows an
   informational alert ("Your sessions stay as they are ... rather
   than serving you nothing, with a quiet note on each affected
   exercise") BEFORE the vacuous write; hasCapabilityToRevisit counts
   a fail-safed rule as revisitable; the revisit flow offers the group
   as a conversation whose dialogue states the truth and keeps
   stopping available. Driven pins through the real resolver.

4. **Both divisionDiff paths are rerouted, block-scoped (R7-2).** The
   design ruling said "both divisionDiff raw paths"; only the
   heatmap's was. RoutineDetailScreen's fingerprint and coverage
   recompute now run over filterLibraryForGeneration under
   loadScopedIntentState - fed the raw library, the fingerprint
   described a plan generation never built and the coverage line named
   "how you train" as a cause it never checked. VolumeHeatmapScreen's
   loader is scoped too (R6-1's class, one consumer along). The door
   guard is widened: any screen calling computeDivisionDiff/Coverage
   without filterLibraryForGeneration fails by name.

5. **One phrase per meaning, completed (R7-5).** The plan-rewrite
   alert's no-op cancel wore the decline's word ("Not now") one tap
   from the chooser round 6 renamed. It takes the F-1 wording; a
   source guard now permits 'Not now' only on the button that reaches
   declineNow.

6. **Alert actions are bounded by maxHeight, never by flexShrink
   (R7-6, correcting D118 ruling 7's geometry).** Round 6's
   flexShrink: 1 made the action region compete with the message for
   the deficit at the 88% cap - Yoga's proportional shrink squeezed an
   ordinary two-button row to a ~25dp sliver under a long message at a
   large font scale, regressing the exact D42 guarantee. flexShrink: 0
   (Yoga's View default, restored) plus maxHeight keeps ordinary
   alerts at full action height with the message alone scrolling; only
   an oversized stacked list scrolls within its own bound. The D42
   guard's header contract is rewritten to state the true shape.

7. **The mount effect owns the first load (B3).** RoutineDetail's
   focus listener skips its registration focus (armed from
   navigation.isFocused(), correct under every mount/param ordering),
   so the division recompute no longer runs twice on first paint.

Stated conditions kept, not closed: C3 (undecided co-driver optimism
is deliberate, D118 ruling 2), I9 (the mirror is per planned routine;
a live session's _userAdded rows are serve's business), J4's residual
collisions (same-day starts, all-null startsAt), A13's id-keyed
gone-accounting. FOUNDER-side, surfaced in chat: the round-1 I5 item
plus two new ledger defects the reviewer found - supabase carries TWO
files numbered migrate_152 (capability_adaptation_mode and
p0_restrict_internal_security_definer_execute), and the README ledger
table ends at row 152 with no rows for 152_p0/153/154 - and CLAUDE.md's
Section 1 migration counts are stale. Migration records are
founder-gated; not touched here.

## D120 — CC33 review round 8 closures + the hold-union ruling (lead-ruled under D33, 2026-08-30)

Adversarial review round 8 (on main c60ccc57): 3 rows BROKEN from 4
roots, 11 QUALIFIED, 0 STOP - converging. All four roots closed
same-day plus six qualified mechanisms; one genuine fork the reviewer
correctly declined to pre-decide is RULED here. Rulings:

1. **Suppression asks its own question (R8-1, correcting D119 ruling
   1's blast radius).** The round-7 union rightly turned the side carve
   OFF when both sides are restricted - which made carvedForOneSide
   false for exactly that state, and the both-sides logging prompt
   ("do the same reps on each side") fired where it is MOST forbidden:
   both sides ruled out. The prompt now gates on sidedRuleTouches -
   does ANY sided rule bear on this movement, whichever way the carve
   resolves - while the one-side-at-a-time note keeps the carve
   answer. Strictly more conservative; pinned both ways.

2. **Facts versus automation, ruled (the A14/D4/L4 fork).** Hold and
   decline suspend a rule's OWN automation, never the fact it records:
   the side is still restricted, exactly as pickers and generation
   already honour held and declined rules. So a held left-side rule
   beside a live applied right-side rule correctly completes the union
   - the live rule's conflict becomes definite and the live rule may
   substitute; the automation is the applied rule's own, the held rule
   contributed a fact. effective.js's docblock is corrected (its "it
   substitutes nothing" wording was falsified by the round-8 probe);
   the ruled behaviour is driven-pinned. Per-consumer union scoping
   was REJECTED: it would reopen R7-3's fail-open.

3. **The fail-safe sentence is first-class (R8-2, completing D119
   ruling 3 at its second consumer).** One shared, outcome-phrased
   sentence ("One of your sessions has nothing left that fits, so it
   runs as it is, with a quiet note on each affected exercise") is
   spoken by the standalone proposal, APPENDED to the mixed proposal
   (round 7 told the case only when nothing else was affected), and
   appended to the ordinary group-review body; the dedicated fail-safe
   dialogue is kept for a group with only that, and its frame stops
   presupposing a workaround ("Keep this applied?" / "Stop applying
   it"). Outcome-phrased BY RULING: a fail-safed session's emptiness
   can be several rules' doing (the round-8 attribution probe), so no
   surface may say "this affects every exercise".

4. **One phrase per meaning, tree-wide (R8-3, completing D119 ruling
   5).** PlansScreen's identical rewrite alert kept 'Not now' on a
   no-op cancel; it takes the F-1 wording, and the guard is widened
   from one file to every screen and component that offers the
   capability rewrite or proposal: 'Not now' may appear only where the
   press reaches the decline write.

5. **The sided reason states only true mechanics (R8-4).** Under the
   union, a sided definite conflict on a one-side-loadable movement is
   reachable - and the picker then said "cannot be done a side at a
   time" about a movement that can, naming one of the user's two
   rules. Three-way branch: the old sentence only for movements that
   genuinely cannot; "does not work on either side" (naming the
   movement fact, no invented side) when both sides are restricted;
   the unsided wording when an unsided rule covers the axis.

6. **The union is computed once per state (I4).** sideCarveByAxis ran
   per exercise - O(exercises) Map/Set allocation that benchmarked at
   six times the pre-union full-library cost. Memoised per state
   object (WeakMap; states are rebuilt per load and never mutated),
   and exported so no surface re-derives the answer. The scorecard's
   stale round-1 numbers are corrected on the row.

7. **Division recompute: honest inputs, honest absence (A1/I9).** An
   UNAVAILABLE lane read now renders NO fingerprint/coverage lines
   (the old fallback rendered from the raw library - a fingerprint of
   a plan generation never built); the recompute carries generation's
   demonstrated-structure and canonical-name inputs through
   generation's own exported paths. The one input that is
   rebuild-time-only (reviewed-replacement omissions, which live
   inside a continuity proposal) is STATED on A1's row, never
   approximated.

8. **B3 re-closed without the false premise.** Round 7's isFocused()
   arming misfired both ways (the round-8 review read the navigation
   source: on a push the state already names the route focused when
   effects run; mounted unfocused, the first genuine focus was
   swallowed). Replaced with a burst window: the mount effect stamps
   its load and a focus event within 800ms is its echo. The window's
   failure mode is one extra load - never staleness; a genuine return
   always reloads.

9. **The effects record corrects itself per writer (I8).** Serve tags
   its entries source:'serve' and replaces that set on each write -
   the pure merge kept the first exerciseTo forever and never revoked
   a serve-time omission, so history could name a movement the user
   never saw and the excusal counter over-credited a declined-then-
   trained row. The removal hook's and completion writer's entries
   carry no source and are never replaced. Driven pin on the real
   database.

10. **Alert rows are bounded horizontally (J2/J5, completing D119
    ruling 6's axis).** Long two-button pairs stack (full-width
    buttons have no horizontal problem; threshold 26 combined
    characters keeps Cancel/Delete-class pairs on one row), rows wrap
    and buttons shrink as the safety net - a wrapped or narrowed
    button stays visible and tappable where an unshrinkable one
    pushed its sibling off the clipped card edge. Device confirmation
    of the geometry rides X2, stated.

Stated, not closed: A13's id-keyed gone-accounting, C3's undecided
optimism, J4's same-day/null-start collisions, I9's planned-vs-live
mirror scope - all deliberate, all recorded on their rows. FOUNDER
items unchanged (duplicate migrate_152 filenames, README ledger rows,
CLAUDE.md counts). X1 = NO and X2 = pending, as ever.

## D121 — CC33 review round 9 closures + D120 ruling 9 reverted (lead-ruled under D33, 2026-08-30)

Adversarial review round 9 (on main 71702dce): 1 row BROKEN, 9
QUALIFIED, 0 STOP - the strongest convergence yet, and the one broken
row is round 8's OWN fix. Rulings:

1. **D120 ruling 9 was wrong and is REVERTED (R9-1, I8).** The
   round-8 replaceSource mechanism deleted true records: serve runs
   over the PERSISTED reduced list, so a second pass's input no longer
   contains pass-1's omitted rows, cannot re-derive their omission,
   and the replace ERASED it - from the record four surfaces score
   from. Both scenarios ruling 9 cited as justification are
   UNREACHABLE: the served reduction is persisted (no later pass ever
   sees the original rows again) and a session already carrying a
   _capabilityTemp marker never re-serves (ActiveWorkoutScreen's
   effective-apply guard returns before the pass). The append is
   reverted to the pure deduped merge; the source:'serve' tag STAYS,
   forensics only, replaced never. Driven two-pass pin on the real
   database: both passes' omissions survive. The I8 row text is
   corrected the same way - its "a declined-then-served row's omission
   is revoked" claim was false and is withdrawn plainly.

2. **The record corrects only forward, stated as a condition (B6/B8/
   B9).** The real residual behind ruling 9's over-crediting worry is
   the manual re-add path: a user re-adding an omitted movement never
   revokes the recorded omission, so adherence surfaces are exactly as
   true as the record - corrected forward by later serves, never
   backward by manual edits. Stated on the rows, not patched: revoking
   on manual re-add would require attributing the user's intent, and
   the round-8 attribution probe already ruled that class out.

3. **Home says when it could not check (B4/E1).** The resolver's
   no-known-state failure synthesises an EMPTY state (unavailable
   true, stale false - resolve.js section 9.6), so every capability
   row on Home vanished silently and a failed check read as "nothing
   going on". One quiet NON-tappable line in the lane's honesty
   vocabulary ("Volyume could not check how you train just now.")
   renders on exactly that signature, and on the effect's own catch.
   Stale-but-KNOWN state keeps serving normally per CAP-17, exactly
   as the tappable rows already do - the line must not fire on it.
   Not tappable by ruling: it asks nothing, and How you train would
   face the same failed read.

4. **The sweep sweeps the whole tree (C1/I6).** The round-8 'Not now'
   guard read only the top level of screens/ and components/ - the
   flat readdir never entered components/auth, components/food and
   friends, so a surface moved into a folder silently left the sweep -
   and triggered only on the two compute identifiers. Now recursive
   (tests excluded: pins quote the literals) and triggered on the
   write-side identifiers too (applyCapabilityPlanRewrite,
   recordEffectiveChoice), with a walked-sanity floor (150+ files) and
   a non-vacuity assertion so a rename can never empty it silently.

5. **The suppression comment tells the round-8 truth (contradiction
   a).** ActiveWorkoutScreen's side-carve note comment still said
   carvedForOneSide suppresses the logging prompt; since R8-1 the
   prompt gates on sidedRuleTouches and the note alone keeps the carve
   answer. Corrected in place - a comment contradicting a driven pin
   is a defect (evidence rule 2), even with the code right.

6. **Benchmark fixtures are named, not blended (I4).** Round 8's "six
   times" and round 9's "2.7 times" are DIFFERENT fixtures (library
   size and rule mix), both Node, neither a device number. Stated on
   the row; the memoisation itself is unchanged and pinned.

Stated, not closed: A1/I9's recompute reads TODAY's structure, library
and profile - it reproduces the build only while those are unchanged
since generation, and the reviewed-replacement omission is one of the
rebuild-time-only inputs, not the only one (row corrected); I6's
driven-vs-source-pinned halves are enumerated on the row. FOUNDER
items unchanged (duplicate migrate_152 filenames, README ledger rows,
CLAUDE.md counts). X1 = NO and X2 = pending, as ever.

## D122 — CC33 review round 10 closures + D121 corrections (lead-ruled under D33, 2026-08-30)

Adversarial review round 10 (on main d7816ec8): 5 BROKEN rows from 3
roots (B5, B6, B8, B9, I8), 8 QUALIFIED, 0 STOP - all three roots in
the effects-record seam, all closed same day. Rulings:

1. **The record's identity is the PLANNED SLOT (R10-1, closing B6/B8/
   I8 and correcting the round-9 comment's premise).** "Within one
   workout no legitimate second write for the same (effect,
   exerciseFrom) exists" was false: one exercise filling two slots is
   ordinary programming, and the per-exercise dedupe silently deleted
   the second slot's true entry - the receipt said one swap where two
   happened, and a served-and-trained substitute was never recorded at
   all. Writers stamp rowId (the planned row's own stable id, which
   survives both serve's rebuild and the manual swap's) and the key is
   (effect, exerciseFrom, rowId). Legacy tolerance both directions: a
   keyed entry never doubles a keyless record of the same fact and a
   keyless entry never doubles anything. The `slot` field is
   informational only - the three writers stamp different index spaces
   (the round-10 review's contradiction e), now stated in the writer.
   Driven on the real database: twin omitted slots both survive; twin
   substituted slots carry two rowIds and two DIFFERENT substitutes.

2. **The user's swap outranks the marker, and the record says whose
   choice stood (R10-2, closing B5/C2).** Manually swapping away a
   serve substitute cleared nothing: the spread carried _capabilityTemp
   forward, the quiet line claimed "Temporarily in for X" over the
   user's own pick, and the record kept naming a substitute the user
   never trained. The swap now clears the marker and makes the row the
   user's own (_userAdded - serve's standing law already serves those
   untouched, which matters because clearing the last marker makes a
   relaunch re-serve pass reachable), and the slot's substitution entry
   is amended to name what actually stood in it, stamped toChosenByUser
   so no surface attributes the user's choice to the app or the app's
   to the user. A swap BACK to the original excluded movement revokes
   the entry instead: the change did not keep the movement out.

3. **The record corrects FORWARD on logged fact (R10-3, closing B9 and
   correcting D121 ruling 2's justification).** D121 said revoking on
   manual re-add "would require attributing the user's intent" - false
   for the performed case: whether a movement was trained is
   workout_sets fact, no intent needed, and the round-8 attribution
   probe ruled out attributing a session's EMPTINESS, nothing about
   performance. Completion passes performedIds and the writer renames
   every performed omission 'omitted_revoked' - kept, never deleted
   (renaming records a later fact about the slot; round 8's replacement
   ERASED one - the R9-1 law distinguishes them). Every reader matches
   strictly, so revoked entries drop from the receipt, the excusal
   counter, the ended-early excusal and the block-ledger denominator
   with no reader change; the reshaped counter's any-non-empty-record
   predicate was the one exception and now requires a LIVE entry. ALL
   omitted entries for a performed exercise revoke, duplicate slots
   included: once the movement happened, the restriction explains no
   shortfall in it, and CONSTRAINED evidence must be earned.
   Reconciliation runs OUTSIDE the capState gate - it needs only the
   record and the logged sets, and still fires when the rules
   themselves ended mid-session. Driven end to end: both weekly
   counters read 1 before reconciliation and 0 after.

4. **Reachability corrected (contradictions b/c; correcting D121
   ruling 1 and the I8 row text).** "A _capabilityTemp session never
   re-serves" was overstated: removing or manually swapping away the
   last marked row clears the markers the relaunch guard checks, so a
   second serve pass IS reachable by ordinary user action. The
   revert's conclusion is unchanged (a later pass still cannot
   re-derive an earlier pass's omission, so replacement was still
   deletion); the comments, this register and the row now state the
   true reason.

5. **Home's effect gains the cancellation guard it never had (B4).**
   Two overlapping focus cycles resolving out of order could leave any
   of the five capability flags describing the older read; blur now
   cancels the in-flight application. The other two B4 conditions are
   STATED, not patched: the line is unscoped to lane users (scoping
   would need the very read that failed) and there is no in-focus
   retry (matching every other lane surface).

6. **The vocabulary guard reaches the lane it guards (C1/I6).**
   FreeStarterScreen's first-run capability alert wore 'Not now' - the
   lane's decline word - on a cancel that writes nothing, structurally
   outside a sweep triggered only on rewrite/proposal identifiers. The
   copy is action-phrased ("Don't start it", beside "Start it anyway")
   and the sweep now triggers on the lane's read identifiers too
   (loadCapabilityResolveState, baselineBlockedMuscles - seven more
   files today), matches both quote forms of the literal, and bounds
   its window to the button's own object so a nearby declineNow can no
   longer false-pass it.

7. **A comment contradicting a driven mechanism is a defect, again
   (contradictions a and d).** RoutineDetail's recompute comment still
   claimed the raw-library fallback round 8 deleted; the writer's
   comment claimed no legitimate duplicate write exists. Both
   corrected in place, same class as D121 ruling 5.

Stated, not closed: I4's memo is per state OBJECT and two production
paths spread the state past it - measured sub-millisecond in every
shape including the memo-defeating ones, third fixture named on the
row, no figure normative; I9's "one seam" now extends to the durable
record through R10-1's per-slot key. FOUNDER items unchanged
(duplicate migrate_152 filenames, README ledger rows, CLAUDE.md
counts). X1 = NO and X2 = pending, as ever.

## D123 — CC33 review round 11 closures + D122 corrections (lead-ruled under D33, 2026-08-30)

Adversarial review round 11 (on main ea0b712f): 8 BROKEN rows from 4
roots, 2 QUALIFIED, 0 STOP - the round-10 seam work landed one lane,
one identity source, one sweep trigger and one marker short. All four
roots closed same day. Rulings:

1. **The substituted lane corrects forward too (R11-1, correcting
   D122 rulings 2 and 3).** D122 ruling 2 claimed "no surface
   attributes the user's choice to the app or the app's to the user" -
   false at the only surface that renders substitution entries:
   toChosenByUser had NO reader, and the receipt said "swapped for one
   that works right now" over the user's own pick. D122 ruling 3's
   forward correction covered one lane. Closed at all three edges:
   (i) reconciliation revokes a substitution whose ORIGINAL was
   performed, exactly as it revokes an omission - both lanes' claims
   fall the same way once the excluded movement happened; (ii)
   removing a serve substitute CONVERTS the slot's entry to an
   omission (the excluded original never happened and nothing stands -
   the record's own vocabulary for that; the substitute's identity
   drops with the claim it stood); (iii) the receipt reads the stamp:
   an amended entry renders "You chose X in for Y" and any user-chosen
   slot switches the headline to the neutral count sentence, so the
   app's wording never covers the user's choice. Copy in the lane's
   calm voice; every correction driven on the real database.

2. **Every live slot has an identity (R11-2, correcting the round-10
   writer comment).** The two ad-hoc entry points (BuildWorkout,
   repeat-as-is) built routineExercise literals with no id, so every
   rowId was null there and the round-10 collapse survived on exactly
   those sessions; the comment's "a slot with no planned row behind
   it" mischaracterised an ordinary user flow as an unreachable edge.
   Both call sites mint a uid at construction (stable for the
   session's life, persisted with the snapshot - a per-pass synthetic
   key was rejected: pass indexes shift across relaunches, which would
   break cross-pass dedupe). The legacy tolerance is now COUNTED - one
   keyless entry absorbs exactly one keyed re-derivation, never a
   whole slot set (the round-10 blanket deleted a true second slot the
   moment a legacy record met new code) - and an ambiguous amend
   (either side keyless) touches AT MOST ONE entry.

3. **The vocabulary guard reaches the preflight surfaces (R11-3).**
   ProOnboarding's total-block alert wore 'Not now' on a pure no-op
   dismiss, reachable through the preflight identifiers alone. The
   dismiss says 'Got it' (the codebase's own word for acknowledging an
   informational alert - its siblings are actions, this is not one)
   and the sweep triggers on capabilityPreflight /
   offerCapabilityPreflightChoice. The reviewer's conditional warning
   that this would drag WeeklyCheckIn's notification prompt into the
   sweep was checked and disproven: that file contains none of the
   eight triggers, so no exclusion ruling is needed.

4. **A manual swap IS the user's word, every time (R11-4).** Round
   10's conditional marked only a swap over a substitute; an ordinary
   swapped row stayed unmarked, and the second serve pass (reachable
   once the last marker clears) substituted over the user's pick -
   against D112 R4 and A10's own title. _userAdded means "the user
   chose this row" and is now set on every manual swap; the store's
   marker comment says so.

5. **All-revoke stands; the ledger condition is STATED (B9).** The
   round-11 fork: revoking every duplicate-slot omission when the
   movement was performed restores the full per-muscle planned dose,
   under-reading adherence where the restriction genuinely removed a
   slot. Count-based revocation was REJECTED: it would leave a live
   omitted entry crediting the week as constraint-excused after the
   user demonstrably performed the movement - fabricated CONSTRAINED
   evidence, the harmful direction - and the ledger's planned-sets map
   is keyed per exercise, not per slot, so per-slot arithmetic is not
   even well-defined there. The conservative under-read is accepted
   and stated on the row. The counters' second gap is FIXED, not
   stated: both weekly constraint counters now require
   is_completed = 1 (an opened-and-abandoned session carries no
   training evidence and counted as a reshaped/excused week while
   counting for nothing as training).

6. **Hygiene closed with the seam (round-11 contradiction 6).**
   Discarding an incomplete workout now tombstones its effects record
   (deleted_at - the table syncs, so that is its delete); the orphan
   previously outlived the workout into sync and the Article 20
   export. And the B4 cancellation pin now requires BOTH guarded
   sites (the catch's guard was unpinned - round-11 contradiction 5).

Stated, not closed: B9's ledger condition (ruling 5 above); L1's
record condition dissolves with R11-2 (ad-hoc slots are keyed now).
FOUNDER items unchanged (duplicate migrate_152 filenames, README
ledger rows, CLAUDE.md counts). X1 = NO and X2 = pending, as ever.

## D124 — CC33 review round 12 closures + D123 corrections (lead-ruled under D33, 2026-08-30)

Adversarial review round 12 (on main 68d35635): 9 BROKEN rows from 5
roots, 4 QUALIFIED, 0 STOP - every root a reachable user chain through
the round-11 closures. All five closed same day. Rulings:

1. **The slot's RECORD is the conversion identity (R12-1, correcting
   the I8 row and D123 ruling 1's completeness).** The round-11
   conversion keyed on the in-memory _capabilityTemp marker - which
   the manual swap clears - so a swap-then-remove chain left the
   amended entry standing: the receipt told the user they chose a
   movement for a slot they had deleted, and the week counted
   reshaped off it. The conversion now falls back to the slot's own
   stable id; a rowId-only match is EXACT in the helper (both keyed
   and equal), so it can never convert a different slot's entry and a
   slot with no substitution entry is a clean no-op. Driven: the full
   amend-then-convert chain on the real database.

2. **Unknown drives no removal excusal (R12-2, closing A15's last
   writer).** The mid-session removal gate had no certainty term, so
   removing a custom lift with null demand columns recorded a durable
   constraint omission off an UNKNOWN conflict - while the same row's
   own notice said "Volyume doesn't know yet". The gate now consumes
   removalExcusalConflicts (capability/effective.js) - one exported
   answer carrying exactly the certainty and choice gates the
   completion writer has always applied - driven against the real
   resolver with a null-demand exercise and a definite control. Two
   adjacent removal-writer rulings land with it: a substituted slot's
   story is the CONVERSION (the excusal append no longer double-writes
   when a mid-session rule bears on the substitute - the round-12
   review disproved the round-11 pin comment's "cannot fire here"),
   and a row the user chose themselves (_userAdded: a picker add or a
   manual swap) is the user's own to remove - its removal records no
   excusal, the conservative direction (an excusal removed, never
   added).

3. **The THIRD keyless source mints (R12-3, correcting D123 ruling 2's
   "every live slot has an id").** addExerciseToWorkout defaulted
   routineExercise to null, so every picker-added row - and every
   "Start without a plan" session in its entirety - was keyless, and
   the round-10 duplicate-slot collapse survived on exactly the
   sessions L1 is about. The store mints the slot id at add time
   (lazy require per its own convention); the writer's comment now
   names all three ad-hoc sources and what a null rowId still means.
   Driven at the real store.

4. **The effects record dies with the workout on BOTH delete paths,
   durably (R12-4).** Round 11 tombstoned only the incomplete-discard
   path; deleting a COMPLETED session from history left its record
   live, synced, and in the Article 20 export - and
   createSessionConstraintEffect's replace dropped deleted_at, so one
   racing best-effort write resurrected any tombstone.
   deleteWorkoutAndSets tombstones now, the replace PRESERVES
   deleted_at (same COALESCE discipline as created_at), and
   workoutTombstoneConvergence's "nothing survives" over-claim is
   corrected in place. Driven: completed-delete tombstone, and a
   post-tombstone write that stays dead.

5. **48dp is the floor on the campaign's own surfaces too (R12-5,
   J2).** The receipt's link into How you train shipped at minHeight
   40 with no hitSlop - under styling.md's minimum and an off-scale
   literal. Raised to spacing.xxxl; two pre-existing sibling links on
   the same style rise with it (a visible row-height change, stated
   for the founder walk); pinned on-scale. The touch-target guard now
   covers this control beside Home's rows.

6. **The sweep's allow-list is widened and its one exclusion is
   RULED (C1/I6).** Triggers now include capabilityBlockReason,
   demandConflicts and capability/directory, bringing
   ExercisePickerModal (which renders the lane's own block reasons)
   and TrainingConsiderations inside. WeeklyCheckIn stays outside
   DELIBERATELY: its capability identifiers are disjoint from every
   trigger, and its one 'Not now' is the notifications lane's
   truthful deferral (the ask genuinely recurs) - renaming it would
   make that lane's copy worse to satisfy this lane's guard.

Stated, not closed (all on their rows): an ambiguous amend (either
side keyless) lands on the first matching entry, which need not be
the swapped slot's - reachable only for a session in flight across
the R11-2 upgrade; the one-shot amend/convert writes have no recovery
pass (unlike serve's re-derivable entries); an untrained-but-standing
substitution keeps describing the served session; D123 ruling 1
(iii)'s "any user-chosen slot switches the headline" is true only of
the substituted-only branch - the mixed sentence never carried the
attribution. FOUNDER items unchanged (duplicate migrate_152
filenames, README ledger rows, CLAUDE.md counts). X1 = NO and X2 =
pending, as ever.

## D125 — CC33 review round 13 closures + D124 corrections (lead-ruled under D33, 2026-08-30)

Adversarial review round 13 (on main 3adfb9d8): 10 BROKEN rows from 4
roots, 4 QUALIFIED, 0 STOP. Two of the four roots were the same defect
CLASSES as earlier rounds surfacing at yet another instance, so round
13 closes the classes, not only the instances. Rulings:

1. **The keyless-slot class is closed at the CHOKEPOINT (R13-1,
   correcting D124 ruling 3 and the round-12 records).** Home's own
   repeat card was the FOURTH keyless session construction - rounds
   11-12's "every live slot has an id" claims were each one source
   short, and per-site minting is demonstrably unwinnable. The store's
   withSetsArrays chokepoint (every fresh, restored or mutated session
   list passes through it) now mints a slot id for any keyless entry,
   idempotently - a fifth construction cannot ship keyless, and an
   old pre-upgrade snapshot heals on restore. Home's branch also mints
   per-site with the previous session's working-set count (mirroring
   repeat-as-is), so the target line stays honest. Driven at the store;
   the site source-pinned.

2. **One shared excusal gate for BOTH writers (R13-2, correcting D124
   ruling 2's parity claim and revising the round-12 held shape).**
   The parity claim was false twice over: the completion writer's
   projection dropped _userAdded (so a user's add-anyway row was
   excused if left unlogged but not if deleted - fabricated
   CONSTRAINED evidence off the user's own choice, the class D123
   ruling 5 rejected), and the two writers disagreed on a held
   co-driver (removal rejected the whole answer; completion excused on
   the live rule). Both writers now consume removalExcusalConflicts,
   which drops HELD rules BEFORE the applied test - the D120 ruling 2
   direction (hold suspends a rule's OWN automation; a held rule
   itself excuses nothing per D112 R8, but it neither vetoes the live
   applied rule's excusal) and the shape the completion writer has
   always been pinned to - and computeCompletionEffects refuses
   user-chosen rows exactly as the removal writer does. The round-12
   removal behaviour (reject on held co-driver) is REVISED, not
   defended: parity on the ruled semantics outranks accidental extra
   conservatism that made the record depend on whether the user
   deleted a row or merely left it unlogged. Driven on one fixture at
   both writers, constraintIds equal.

3. **Erasure reaches the third delete path (R13-3).** "Clear workout
   history" promises "permanently deletes all your logged sessions"
   and left every per-session capability record live, synced, and in
   the Article 20 export. The same tombstone discipline now runs
   inside its transaction, scoped by user. Ruled lead-side under D33:
   this strengthens erasure (more deletion, not less), touches no
   consent gate, PII flow or residency, and is additive and
   idempotent - the Section 2 GDPR gate binds against WEAKENING.
   Driven.

4. **48dp on the directory too (R13-4).** TrainingConsiderations
   carried four off-scale minHeight 44 literals, two of them genuinely
   44dp effective (the back control and the search field) on the
   surface built for exactly the users with the highest incidence of
   tremor and reduced dexterity. All four tokenised to spacing.xxxl.

5. **A definite conflict on the substitute outranks the marker line
   (B5).** The "Temporarily in for X" branch returned before any
   conflict evaluation, so a rule captured mid-session against the
   substitute itself was never spoken on the row it bears on. The
   definite lists are computed first and the marker line renders only
   when none exists; with unknown-only conflicts (which drive
   nothing) the marker stays. One mention per surface holds - the row
   speaks the more consequential truth.

6. **The receipt's pill labels wrap safely (J5).** onwardLinkText
   gains the codebase's own documented in-row idiom (flexShrink 1,
   minWidth 0 - R2-12), so a long label at large accessibility type
   shrinks inside its pill instead of overflowing.

Stated, not closed: I6's driven-vs-source split for the removal
caller's remaining composition (marker/user-chosen terms are source-
pinned; the shared gate itself is driven at both writers now); the
ambiguous-amend and one-shot-write conditions on I8 stand, with the
round-12 reachability clause corrected by ruling 1 (the fourth source
made it false; the chokepoint makes it true going forward). FOUNDER
items unchanged (duplicate migrate_152 filenames, README ledger rows,
CLAUDE.md counts). X1 = NO and X2 = pending, as ever.

## D126 — CC33 review round 14 closures + D125 corrections (lead-ruled under D33, 2026-08-30)

Adversarial review round 14 (on main c579e272): 4 BROKEN rows from 3
roots, 7 QUALIFIED, 0 STOP - converging again, and the reviewer's
special hostility toward the round-13 CLASS closures found both nets
imperfect exactly as briefed. Rulings:

1. **The marker yields only to conflicts with LIVE automation (R14-1,
   correcting D125 ruling 5's class).** Round 13's principle was
   "conflicts that drive nothing leave the marker", but it enumerated
   only unknowns - a HELD definite conflict drives nothing either
   (D120 ruling 2, D112 R8), yet it killed the marker and let the held
   line claim "Volyume changes nothing until you say so" over a row
   Volyume itself substituted in, erasing the substitution's only
   provenance line in the app. The gate now filters held rules out of
   the definite set before it can suppress the marker; a live definite
   conflict still outranks it, per the round-13 ruling.

2. **The in-session lists reload on focus (R14-2).** The round-13 B5
   ruling exists for a rule captured mid-session through "Work around
   this" - a flow that navigates away and back - yet intentState only
   reloaded on exercise change or swap-sheet open, so the freshly
   captured rule stayed invisible on the very row it was captured from
   (the staleness class R6-2 closed on RoutineDetailScreen in round 6,
   never applied to the surface the user trains on). A focus listener
   re-runs the loader with B3's 800ms burst-window discipline and a
   sequence guard replacing the cancelled flag, so an older read
   landing late never overwrites a newer one. This also narrows A15's
   input-state divergence between the two excusal writers: the removal
   writer's state now refreshes on every return to the screen.

3. **The lane's decline word is off the consent card, and the sweep
   sees JSX forms (R14-3).** HowYouTrainScreen's own Article 9 consent
   dismiss wore label="Not now" on a handler that writes nothing - the
   D118 one-phrase-per-meaning blur, on the same screen whose apply
   proposal writes 'declined' under that word, invisible to four
   rounds of sweep widening because every widening grew the TRIGGER
   list while the literal list stayed alert-buttons-only. The dismiss
   is action-phrased ('Leave it for now', beside 'I agree - store this
   information'; the sub-line already states what still works without
   the agreement) - a copy change on the consent card, behaviour
   untouched, flagged for the founder walk - and the sweep's literal
   set now covers the codebase's render forms (text:/label=/title=
   /text-node), which fails loudly on exactly this class.

4. **The chokepoint's two proven holes are closed, and its claim is
   scoped honestly (correcting D125 ruling 1 and the round-13
   records).** "A fifth construction cannot ship keyless" was false as
   written: a null entry slipped through the mint, and
   addExerciseToWorkout appended outside the net with its own per-site
   copy of it. The null shape now mints, the picker append routes
   through withSetsArrays (the per-site copy deleted - duplicated
   mints are exactly how the net grew holes), and every comment and
   record states the precise scope: every path that CREATES session
   entries runs through the chokepoint; the set-mutators only touch
   sets on entries that already passed. Driven on both holes.

5. **48dp reaches the picker (J2's stated residual, closed).** The
   lane's own "Allow again" allowance control was a caption plus 8dp
   of slop; createNewBtn sat at an off-scale 44. Both now carry
   spacing.xxxl targets. The R2-12 citation on the receipt pills is
   corrected in place (the adapted flexShrink form is right for a
   content-sized pill; flex: 1 would collapse it - record the
   adaptation, not the idiom name), and Home's "mirrors" wording now
   names its one deliberate difference.

Stated, not closed: D3/A15's residual sliver (a rule arriving by SYNC
while the user stays on one exercise without leaving the screen is
still invisible to the notices until focus, exercise change or the
swap sheet - the completion record is unaffected, fresh read at
finish); the legacy-record conditions on I8 stand unchanged. OBSERVED
by the round-14 review, pre-existing and OUT of this campaign's scope,
surfaced founder-side rather than acted on: clearWorkoutHistory
deletes local workouts only (the cloud copies survive; the settings
copy says "permanently deletes"), unlike deleteWorkoutAndSets whose
caller pairs the cloud delete. FOUNDER items unchanged (duplicate
migrate_152 filenames, README ledger rows, CLAUDE.md counts). X1 = NO
and X2 = pending, as ever.

## D127 — CC33 review round 15 closures + D126 corrections (lead-ruled under D33, 2026-08-30)

Adversarial review round 15 (on main 1ff1a059): 3 BROKEN rows from 2
roots, 9 QUALIFIED, 0 STOP - the strongest convergence since round 9,
and both roots were third instances of chains the loop had already
corrected twice. Rulings:

1. **The notice's branch selection is a pure, DRIVEN helper (R15-1,
   correcting D126 ruling 1's completeness and D125 ruling 5's cell
   claims).** Rounds 13-15 corrected the inline branch chain three
   times, one branch per round; round 15 found the held line firing
   over a substituted row whenever a definite BASELINE conflict
   co-existed - "Volyume changes nothing until you say so" about a row
   Volyume put there, with the user's just-captured rule never spoken.
   The selection now lives in constraintNoticeKind
   (capability/effective.js): the marker yields only to live episode
   drivers or definite baseline facts; the held line speaks only for a
   PURE held state (no marker, no live driver, no definite baseline -
   the actionable truth outranks a rule that drives nothing); the
   episode line is NAMED from the driving rules alone (naming a held
   co-driver claimed the hold covered the row); baseline rules cannot
   be held (model.js refuses baseline episode groups), so the baseline
   branch needs no hold filter. The full truth table is driven -
   twelve synthetic states plus the breaking state at the real
   resolver - and the screen only words each kind, so a fourth
   ordering defect cannot hide in an inline chain. One behaviour
   change beyond the fix is RULED: a held-only episode set beside a
   definite baseline conflict now yields the BASELINE line even
   without a marker (previously the held line) - the actionable truth
   with a swap on offer outranks reflecting the hold back.

2. **48dp reaches the picker's remaining controls (R15-2, correcting
   D126 ruling 5's "closed" and the J2 cell).** The show-anyway and
   set-aside toggles - the only routes to what the user's rules
   removed - were a caption plus 8dp of slop, ~39dp effective, the
   exact shape ruled undersized one style-line above them. Real 48
   now; createSaveBtn's off-scale 48 literal tokenised in passing. And
   the missing guard exists at last: one enumerated touch-target guard
   over the lane's controls (the round-13 and round-14 closures had NO
   pin, which is how a third instance shipped), with a strays
   assertion so a new numeric minHeight fails loudly.

3. **The reload's failure branch keeps the last state (A15/D3
   conditions closed at mechanism).** A transient read failure on a
   return-focus nulled a CORRECT in-flight state - erasing the notice,
   side-carve note and substitution marker with no word said -
   where RoutineDetail's own precedent keeps the last state. Reload
   failures keep it now; mount and exercise-change failures still
   clear, because there the previous state describes a different slot
   and keeping it would judge the wrong exercise. The remaining
   sliver is stated: a rule arriving by sync mid-focus stays invisible
   until focus, exercise change or the swap sheet.

4. **The swap sheet's write joins the sequence guard (I8 condition
   closed; correcting D126 ruling 2's "never overwrites" claim).**
   handleOpenSwap's setIntentState sat outside the counter, so a
   focus reload started before the tap and resolving after it could
   overwrite the sheet's newer read. The write bumps the counter now,
   invalidating any in-flight reload.

5. **The sweep covers the template and title-expression forms, and
   JSX hits are element-bounded (C1/I6 conditions).** Three more
   static literal forms; a JSX-prop hit's window now ends at its own
   element's close, so a declineNow later in the file cannot vouch
   for a JSX no-op. The honest limit is STATED on the row: a label
   computed at runtime cannot be swept statically.

6. **Conditions stated, records corrected.** The clear-history
   asymmetry R13-3 created is stated on H2/I2/B9 (the effects
   tombstone syncs while the local-only workout delete does not, so a
   full re-pull returns history without its constraint provenance -
   conservative direction, no fabricated CONSTRAINED evidence; the
   wider clear-history cloud story remains the founder-side item D126
   surfaced). F7's "untouched this campaign" cell is corrected (the
   round-14 consent-dismiss copy change is ON the card; behaviour
   verified fail-closed and un-bypassable). The preselect's `driving`
   local is renamed prefillConflicts - it deliberately includes held
   and unknown rows, the opposite of constraintNoticeKind's
   drivingEpisode, and two "driving"s meaning opposite things in one
   region is the comment-contradiction class this campaign keeps
   paying for.

FOUNDER items unchanged (duplicate migrate_152 filenames, README
ledger rows, CLAUDE.md counts, clear-history cloud copies). X1 = NO
and X2 = pending, as ever.

## D128 — CC33 review round 16 closures + D127 corrections (lead-ruled under D33, 2026-08-30)

Adversarial review round 16 (on main 7ce82989): 7 BROKEN rows from 3
roots, 10 QUALIFIED, 0 STOP - each root a consumer an earlier
extraction or ruling did not reach. Rulings:

1. **The plan caption consumes the extracted ranking (R16-1).** Round
   15 extracted the notice ranking precisely because inline chains kept
   shipping ordering defects - and RoutineDetail's plan caption was the
   consumer the extraction did not reach: its own chain kept the
   pre-round-15 order, so a held-only episode set outranked a definite
   BASELINE conflict there ("Held as-is at your request." with the
   standing permanent conflict never spoken on the very surface built
   to resolve it) while the session strip said the opposite about the
   same row. The caption now consumes constraintNoticeKind - one driven
   answer for both surfaces - and its applied test runs over the
   helper's drivingEpisode, so the two cannot diverge on what counts
   as actionable. The source-ORDER pin that passed over this is
   replaced by consumption pins; the ranking's truth table stays
   driven at the helper.

2. **A user-chosen row never reserves a substitute (R16-2).** The
   effective view judged a _userAdded row, reserved the muscle's best
   substitute for it in the taken-set, and serve then threw that
   substitution away - so a later conflicted planned row of the same
   muscle got a lower-ranked substitute or, with a small pool, was
   OMITTED and durably excused while an eligible substitute sat idle
   (and the plan caption's planned-only memo promised "Swapped" for
   the row serve omitted). The user-chosen fact now lives IN the view:
   such a row resolves UNCHANGED before any reservation, the serve
   loop's duplicated early return is deleted (per-site copies of one
   rule are how nets grow holes - D126 ruling 4), and the T2-04 law is
   held by its driven pins plus a new driven pin proving the planned
   row behind a user row now receives the substitute.

3. **The sided-union phrasing is ONE shared answer (R16-3).** R8-4's
   law - never name one side of a closed union on a movement that can
   be loaded a side at a time - lived only in the picker's inline
   scan, so the in-session named line said "involves overhead work
   with your left shoulder" about a block the left rule alone would
   not cause, attributing the whole union to the temporary change.
   The union question is extracted to sidedUnionShape
   (capability/phrase.js: both_sides / unsided_covered / null, role
   and choice blind - facts complete the union, D120 ruling 2); the
   picker consumes it for its three-way sentence and both in-session
   named lines (episode AND baseline) phrase a union-blocked sided
   rule UNSIDED. Driven table on the helper.

4. **Round 15's reload rationale was false and is deleted, not
   softened (R16-4, correcting D127 rulings 3 and 4).** The intent
   state is USER-scoped - loadExerciseIntentState takes no exercise;
   the per-slot clearing lives in resolvedExercise, a different state
   - so the "a mount/exercise-change failure still clears because the
   old state describes a different slot" reasoning attached R2-6's
   rationale to the wrong state, and nulling could not have erased the
   substitution marker either (it reads the store entry, not this
   state). A failed refresh now keeps the last real state on EVERY
   trigger; only a missing user clears. And the swap sheet's write
   PARTICIPATES in the sequence guard from the moment of the tap
   (round 15's post-await bump claimed "newest by construction",
   which was false, and could orphan a genuinely newer exercise-change
   load - both directions guarded now).

5. **Smaller closures.** clearWorkoutHistory schedules its tombstones'
   push (round 13 left their sync to whatever unrelated write came
   next); the sweep gains the template alert form and STATES its two
   static limits (same-line text nodes only; runtime-computed labels
   unsweepable); the touch-target guard's allowlist is counted, so a
   copied duplicate of an allowlisted off-scale value fails as loudly
   as a new number; and the two stale "written not applied" migration
   comments in the sync registry test are corrected to the README's
   applied record (the W4 stale-comment class, two instances the
   correction missed).

Stated, not closed: the swap sheet still writes its fail-open
empty-intents shape over a richer state on a preference-read failure,
with the toast speaking only about the sheet (honest by D109-2's
design; stated on A15/D3); C1's static-sweep limits as above. FOUNDER
items unchanged (duplicate migrate_152 filenames, README ledger rows,
CLAUDE.md counts, clear-history cloud copies). X1 = NO and X2 =
pending, as ever.

## D129 — CC33 review round 17 closures (lead-ruled under D33, 2026-08-30)

Adversarial review round 17 (on main 8ee4949d): 1 BROKEN row, 9
QUALIFIED, 0 STOP - matching round 9's best convergence, and the one
break is a hook-ordering hole no source pin could see. Rulings:

1. **The both-sides ask WAITS for its inputs (R17-1, A11).** On an
   exercise change the prompt effect ran in the same commit that
   cleared the async library resolve, so judgedExercise was null, the
   R8-1 suppression gate answered false, and the ask fired for exactly
   the movement class it is most forbidden on (D120 ruling 1) - then
   self-tagged, so the corrected gate could never re-open it, and the
   wrong answer persisted per exercise. RULED as a posture split: R2-6's
   "stay silent until the resolve matches" is right for RENDERED
   notices (silence is safe); for an ACTION, a pending input must HOLD
   it - proceeding is a fail-open. Two readiness terms now precede the
   gate and the self-tag, both in the dep list so the effect re-runs
   when they settle; source-pinned as ordering within the effect body
   (the honest pin class available without the render harness this
   screen's suites deliberately avoid - stated on I6).

2. **RoutineDetail's intent writers join the sequence guard (Q1,
   B3/I8).** The screen's mount, focus and swap-sheet reads wrote
   intentState unordered - the exact shape rounds 14-16 closed on
   ActiveWorkoutScreen - so an older read landing late could restore a
   pre-capture capability state behind every plan caption and the
   serve-outcome memo. One counter now orders all three, with tap-time
   participation for the swap sheet, both directions.

3. **Every effects tombstone schedules its own push (Q2, H2/I2,
   correcting the round-16 comment's "like every other effects
   write").** deleteWorkoutAndSets and deleteIncompleteWorkout
   tombstoned without scheduling, so their tombstones waited for an
   unrelated write - the exact state round 16 judged a defect on the
   clear path. All three delete paths schedule now; the comment names
   all three.

4. **The lane's install-conflict sheet meets the floor (Q3, J2).**
   Its three sm buttons were ~34dp effective (padding-sized, no
   hitSlop - invisible to the numeric-minHeight strays check, which is
   stated on the row). All three carry the 48 token now and the sheet
   joins the guard's enumeration. Honest scope: Button size="sm" is a
   global pre-campaign component; only the lane surface is floored
   here.

5. **The third named branch unsides (Q4, C7).** The unknown line
   could still name one side of a closed union (reachable when an
   allowance carves the self twin and a clinician rule survives). It
   asserts no block, so the R8-4 harm never followed - but all three
   branches now consume one union answer, and D128 ruling 3's "both
   named lines" undercount is corrected by making it three.

6. **Conditions stated; records corrected.** L4's KEEP-outranks-
   REPLACE rebuild ranking is deliberate and now stated on the row
   (while a definite episode conflict stands, a baseline-blocked
   incumbent is kept and the receipt frames the keep as temporary;
   the permanent conflict surfaces after the episode ends). A15
   carries the general pending-read posture (permissive answers are
   silence for notices and an explicit wait for actions). The stale
   round-3 completion-read rationale is rewritten (the fresh read at
   finish stays right; its staleness reason died with R14-2).

FOUNDER items unchanged (duplicate migrate_152 filenames, README
ledger rows, CLAUDE.md counts, clear-history cloud copies). X1 = NO
and X2 = pending, as ever.

## D130 — CC33 review round 18 closures + D129 corrections (lead-ruled under D33, 2026-08-30)

Adversarial review round 18 (on main 1eb99e66): 6 BROKEN rows from 2
roots, 5 QUALIFIED, 0 STOP. Both roots are last round's own closures
landing one layer short - the readiness fix tested presence where the
break was readability, and the rebuild ranking was implemented through
a proxy term that meant something else. Rulings:

1. **Readiness means KNOWLEDGE, not presence (R18-1, A11/A15;
   corrects D129 ruling 1's record).** D129's "the ask also WAITS for
   its inputs" over-claimed: the round-17 terms held the both-sides
   ask for a PENDING input and passed a settled-but-unreadable one -
   a cold-start capability read failure hands the screen an
   unknown-empty state (unavailable, nothing known), the suppression
   gate answers its permissive false off it, and the ask fired for a
   user whose sided rule the app simply could not read, then
   self-tagged durably (AsyncStorage, across relaunches). Closed by
   extraction: `capabilityKnown(state)` (capability/resolve.js) is
   the one answer to "may an ACTION consult this state" - false only
   for the resolver's unknown-empty shape and a missing state;
   stale-but-known counts as knowledge (the review itself proved
   CAP-17 stale suppression works, and a stale snapshot of an EMPTY
   rule set is still knowledge - `stale` is the mechanism's marker,
   `empty` is not). The ask holds on `!capabilityKnown` AND on a
   judgement row the resolve could not fetch, both before the gate
   and the self-tag, both dep-driven. Stated cost, deliberate: under
   a persistent read failure the D9 per-side suggestion stays silent
   for the session - the conservative direction D129 ruling 1
   demands. The fail DIRECTION is driven (real loader, failing then
   healthy DB) because an ordering pin cannot see it - that is
   ruling 5.

2. **The removal excusal writer joins the fresh-read posture (A15's
   second action site).** The round-17 A15 sentence "an explicit WAIT
   for anything that acts" was implemented at the ask alone; the
   removal writer consumed the pending-gated screen conflicts and
   silently missed legitimate excusals during the mount window (or a
   transient failure the focus reload later recovers from). It now
   takes its own capability read at write time, exactly like the
   completion writer, judging the same shared
   removalExcusalConflicts gate; both failure shapes yield no
   conflicts, so nothing is ever excused on a read that knows
   nothing. The old direction was conservative (missed, never
   fabricated) - the fix removes the miss, not a fabrication.

3. **A rule that drives nothing cannot veto a live baseline rewrite
   (R18-2, A7/A14/D4/L4; corrects D129 ruling 6's wording and the
   reviewer-surfaced fork RULED).** planAutoGen.buildSlotEvidence and
   blockAdvisor.evidenceFor computed `capabilityAffected` from the
   RAW definite episode list - held and declined included - and
   `capabilityIneligible` as "any definite conflict minus affected",
   so a held or declined episode rule (which drives nothing, D120
   ruling 2) flipped a live BASELINE rule's REPLACE into a KEEP whose
   receipt called a permanent conflict "your temporary change". Three
   true facts now, both builders identical: `capabilityAffected` = a
   LIVE overlay in force (the shared removalExcusalConflicts gate -
   the same answer serve and both effects writers act on; fourth and
   fifth consumers of the one gate); `capabilityIneligible` = the
   definite BASELINE fact, asked of baselineConflicts itself
   (allowance-carved); `capabilityEpisodeOpen` = any other definite
   episode conflict (held/declined/undecided). slotVerdict ranks
   them: live overlay KEEP, then baseline REPLACE, then open-episode
   KEEP, each above every evidence rank; the user's own exclusion
   above all. THE FORK (reviewer surfaced (a) keep-un-judged vs (b)
   plain evidence judgement for held/declined-only slots; D33
   lead-ruled): refined (a). Grounds, from reading the mechanism to
   its end: the write-time carve (resolvePlanAgainstLibrary) voids
   any conflicted incumbent that lacks the hold marker, so (b) would
   let an evidence KEEP be silently emptied at write - the exact
   T1-07 receipt/commit contradiction - and a rebuild swapping the
   very movement a decline explicitly kept, or a hold explicitly
   froze, acts against the user's word on precisely the slot their
   choice is about, while the episode is still open. The episode is
   temporary; the document waits for it. D129 ruling 6's ranking
   sentence ("while a definite episode conflict stands...") was
   right about LIVE conflicts and wrong to let the implementing term
   count held/declined ones as rank-2; the KEEP copy ("while your
   temporary change lasts") is now true wherever it renders.

4. **The sheet's fourth button joins the floor (J2; corrects D129
   ruling 4).** "The lane's install-conflict sheet meets the floor"
   over-claimed: three of its four buttons did. The md primary
   ("Done"/"Finish later") was ~46dp effective; it carries the 48
   token now and the guard enumerates it.

5. **Guards pin the fail direction and the application, not only the
   order and the definition (I6).** Two structural blindnesses the
   review named, both closed: an ordering pin cannot see which way a
   gate answers on an unreadable input - capabilityKnown's three
   resolver shapes are DRIVEN against the real loader; and a
   style-definition pin cannot see a deleted `style={styles.X}` - the
   touch guard now asserts an exact application count per enumerated
   style (`styles.<name>` appears only at application sites).

6. **The sweep reaches the lane's own surfaces (C1).**
   ExerciseConflictSheet (renders the lane's reason captions) and
   AvoidedMovementsScreen sat outside every trigger; two reach
   triggers added (capability_declared, listActiveMovementConstraints).
   Neither wears a decline word today - the sweep is vacuous over
   them NOW, and a future regression fails instead of passing unseen.

7. **Records corrected, mechanisms matched (contradictions 1-4).**
   The completion writer's unreachable `.catch` fallback is DELETED
   with its false comment (the resolver cannot reject; the empty gate
   below is the real conservative path, now stated). The round-8 gate
   comment's analogy to the note's fail direction is rewritten - it
   held only for readers (D129 ruling 1), and the ask now holds on
   knowledge upstream. blockAdvisor's stale "Baseline rules never
   mark a slot (CAP-1)" intro is corrected to D112 R1's amendment.
   I9's sixth computation of "what will happen" is gone (ruling 3
   routes both builders through the shared gates), and C2's rebuild
   receipt is true again by the same fix.

X1 = NO (REAL-DISABLED-USER-VALIDATED) and X2 = founder device walk
pending, unchanged by everything above.

## D131 — CC33 review round 19 closures; the review LOOP STOPPED at the founder's call (2026-08-30)

Adversarial review round 19 (on main 9c54c860): 9 BROKEN rows from 4
roots, 9 QUALIFIED, 0 STOP. All four roots closed; the loop then
STOPS - see ruling 6.

1. **The coach volume withhold gates on knowledge (R19-1, A6/I6).**
   Its only trigger was a thrown error, and
   `loadCapabilityResolveState` cannot reject (its whole body is one
   try/catch): a cold read failure RETURNED the unknown-empty shape,
   the episode set came back empty, nothing threw, and the increase
   applied body-wide on a read that knew nothing - the withhold fired
   only when the capability read had SUCCEEDED. Now
   `if (!capabilityKnown(capState)) holdMuscles = null;`. This is
   D112 R3's own posture, and it had never once executed on the
   failure it was written for.

2. **The notice ranks on live overlays (R19-3, B3/B5/C2/I9;
   corrects D130 ruling 3's scope).** D130 closed the
   drives-nothing-cannot-veto class at the rebuild only.
   `constraintNoticeKind` still ranked ANY non-held definite episode
   conflict above a definite baseline fact, so a declined or
   undecided rule (which drives nothing: serve marks the row
   conflicted and substitutes nothing) described a PERMANENT
   conflict as "sits outside your temporary change" - telling the
   user to wait out something that never passes, while the rebuild
   replaced the same row with the permanent wording. The helper now
   mirrors slotVerdict: live overlay (shared
   removalExcusalConflicts), then baseline, then the remaining
   definite episode conflicts. The truth table gains the
   effectiveChoice axis it never varied against a baseline
   co-driver, which is why four rounds of pins passed over it.

3. **Stale-known is honoured wherever the write honours it (R19-2,
   A15/C2/I9, + A7 and F5).** Both rebuild builders' baseline terms
   refused the stale-known shape while `filterLibraryForGeneration`
   and the write-time carve accepted it: the incumbent was kept on
   evidence, given no hold marker, then voided at write - "retained"
   beside an emptied slot, the T1-07 contradiction D130 ruling 3
   cited as its own grounds. Both now take `capabilityKnown`. The
   swap `cause` derivation carried the identical guard, recording a
   capability-forced swap as an unexplained one and feeding
   `swappedAwayCount` - a preference learned from a capability
   event, which the learning shield exists to prevent.

4. **A performed movement is never excused (R19-4, A15/B6/B9).**
   The removal excusal writer had no performed gate at all - the
   completion writer has refused performed rows since it was
   written. Logging sets, capturing a rule, then removing that
   exercise wrote a durable `omitted` over the user's own logged
   sets, unrevocable because `performedIds` was derived from the
   in-memory list the removal had just emptied. Consequences, all
   live: the receipt said "left out", the week counted a session
   constraint-excused, the block ledger dropped the slot from its
   denominator. The writer now refuses a row carrying sets, and
   reconciliation reads `workout_sets` (WK-2's own reasoning, which
   this file states 260 lines above the defect). Round 18 had
   WIDENED this by making the writer fire in more states.

5. **Records corrected.** The removal catch's "completion
   re-derives" was false for that path and is gone. The resolver's
   "exactly three shapes" is four (the no-user empty state). The
   round-18 I9 and A15 scorecard sentences over-claimed and are
   corrected on their rows.

6. **THE REVIEW LOOP STOPS AT ROUND 19 (founder call, not
   delegated).** The founder called nineteen rounds ridiculous and
   reported 75% of the week's usage consumed. Round 20 is NOT
   dispatched. This is recorded as what it is: an explicit founder
   decision to stop, not a clean round. The honest reading of the
   trajectory - 12→7→5→4→9→6→6→4→1→3→4→5→4→3→2→3→1→2→4 roots - is
   that it was NOT converging to zero; rounds 10-19 were largely
   my own closures landing one layer short, and rounds 18 and 19
   each found defects created or widened by the previous round's
   fix. The scorecard's "undeniable" bar (a clean adversarial pass)
   is therefore NOT met and must never be claimed. What IS true:
   every finding raised across nineteen rounds was closed at
   mechanism level with pins, and the tree is green. The unverified
   surface is stated on the rows and in the founder report: round
   19's own closures have never been adversarially reviewed.

X1 = NO (REAL-DISABLED-USER-VALIDATED) and X2 = founder device walk
pending, unchanged.

## D132 — CC33 CLOSED on a finite criterion: the capability census (founder order, 2026-08-30)

Founder order, verbatim: "You need to find a way to satisfactorily
close this task off without crazy round after round."

**The diagnosis.** The loop could not terminate because its exit
condition was unbounded: "a fresh adversarial reviewer fails to break
any of 93 scorecard rows". A reviewer finds ONE INSTANCE of a defect
class per round; the instance is closed; the next round finds the next
instance of the SAME class elsewhere in the tree. The per-round root
count (12,7,5,4,9,6,6,4,1,3,4,5,4,3,2,3,1,2,4) never reached zero
because instance-by-instance closure cannot exhaust a class, and each
round's own closures became the next round's surface.

**The replacement criterion (ruled, and CC33 closes on it).** The four
classes the rounds kept re-finding are each mechanically checkable
across the WHOLE tree by enumeration rather than by judgement:

  1. fail-open on an unreadable capability read (R17-1, R18-1, R19-1,
     R19-2);
  2. a rule that drives nothing (held/declined/undecided) driving
     something (R18-2, R19-3);
  3. two readers of one state giving two answers (R16-1/2, R19-2, I9);
  4. excusing something the user performed or chose (R12-2, R13-2,
     R19-4).

`src/lib/__tests__/capabilityCensus.guard.test.js` enumerates every
site in `src/` that participates in each class and asserts the class
invariant at each, with an explicit exemption list carrying a stated
reason per site and a validity check on each exemption. A NEW site
fails by default, so the census extends itself: a future contributor
cannot add an unclassified consumer without making the decision
consciously. This is finite (a census either passes or names its
offenders), re-runnable in CI forever, and it cannot silently regress -
which is exactly what nineteen rounds of sampling could not achieve.

**Its first run found three more class-1 instances**, in one pass,
where the review found one per round:
  - ExerciseDetailScreen fell back to the UNFILTERED pool under a
    stale-known read, so its swap suggestions could offer a movement
    the user's own rules exclude. FIXED.
  - the volume landmarks' blocked-muscle read had the same guard.
    FIXED.
  - CoachOutputScreen's `physicalConstraint` fact passes null on an
    unknown-empty read (round 19's B7). NOT fixed, and deliberately so:
    closing it properly means giving the coach engine an "unknown"
    fact shape, which is an engine contract change. STATED as a
    condition on B7 rather than half-fixed. (An attempted quick fix
    during this pass would have aborted the whole coach run - caught
    in self-review before landing, and recorded here because it is
    precisely the class of error that produced rounds 10-19.)

**What is and is not claimed at close.** NOT claimed: the scorecard's
"undeniable" bar - a clean adversarial pass - was never met, and round
19's own closures have never been adversarially reviewed. Claimed, and
true: every finding raised across nineteen rounds is closed at
mechanism level; the four recurring classes are now closed by CENSUS
over every site rather than by sample; the tree is green
(lint exit 0; jest exit 0, 1112 suites, 15,240 tests).

X1 = NO (REAL-DISABLED-USER-VALIDATED) and X2 = founder device walk
PENDING. CC33 is CLOSED. Reopening is a founder decision, and the
honest trigger for it is the device walk finding something, not
another review round.

---

## D133 — How you train: the flows are designed, not accreted (lead-ruled, 2026-09-03)

**Authority.** Founder order 2026-09-03, verbatim: "Go through all variants
and make it very easily understandable for even the most stupid human."
Source: `docs/how-you-train-usability-audit-2026-09-03/AUDIT.md` (thirteen
flows traced stage by stage; 21 findings; the 25-piece provenance table
that proves the "bolted together" verdict; the spec-versus-built table).
Decision delegation under D33: product forks ruled on the one criterion,
the best solution for the app and its users, never on effort. Every
Section 2 inviolable and every law in the audit's section 0.4 stays
binding on these rulings.

**The principle every ruling serves.** After any tap in this feature a
person must be able to see, without inferring: what this is, what they are
being asked to do, what will happen when they do it, and what comes next.
A flow is titled, counted, steppable backwards and cancellable. A flow ends
on the thing it made and says what happens next. A follow-up decision is a
step in the flow that caused it, never a surprise dialog.

**The five forks, ruled.**

1. **Where a flow lives → its own pushed screen** (`HowYouTrainAddScreen`,
   route `HowYouTrainAdd`, registered unguarded beside `HowYouTrain` in
   every stack). Rationale: a screen has a title, a back button and a place
   by construction; the inline card (chosen in CC26 to avoid Modal focus
   problems, section 33.18) had none and could not be given them without
   re-inventing a screen. A pushed screen is not a Modal; focus moves to it
   natively and each step announces its question, which the inline card
   never did (one announcement in 1,880 lines).
2. **Where plan decisions live → the last step of the flow that caused
   them.** The episode diff ("Apply this to your current plan?") and the
   baseline rewrite ("Update your plan to match?") render as the wizard's
   post-save step, foreshadowed on the check step, with one primary and
   one secondary button and no way to decide by dismissal. The settings
   home's own dialogs stay for the restart, revisit and sync-arrival paths
   until slice B converts those to "Waiting for you" cards. One phrase per
   meaning is kept: "Not now" declines, "Leave it as it is" is the no-op.
3. **The check-in card → the question as a heading, two answers, the rest
   behind "More options"** with a one-line consequence each (slice C).
4. **Editing → add it**, as ARCHITECTURE section 12 specified ("edit =
   supersede"): tap a row, change a line, save; the old row ends, a new one
   starts (slice D).
5. **Consent → stays at the save, made legible.** The words are the lane's
   own and unchanged; the button says "Agree and save" because it saves,
   the decline says the answers are not kept, and the check step says the
   question is coming. Moving consent to the door would add a gate before a
   person has decided to add anything and would re-open the DPIA record for
   no gain in honesty.

**Order the flow asks in.** WHAT (kind → which → side) before WHEN
(permanent-or-temporary → since → until), then CHECK. A person thinks "my
shoulder cannot go overhead, for a few weeks", not "temporary; a movement".
For a directory preselect the WHAT is already answered, so the first
question is WHEN, with the profile's kind pre-selected and labelled
"Suggested", never skipped (GC-D1). An allowance is baseline by
construction and skips WHEN.

**Step numbering.** Counted up to the save ("Step 3 of 6"); the count
assumes the longer path while the role is unknown so it only ever shrinks.
The post-save steps are named ("Your current plan", "Saved") because the
check step has already said they may come.

**Slices.** 0: HYT-01 (`cancelable: false` on the apply proposal) — landed
`605c1330`. A: the wizard. B: the home screen (one primary action under
the intro, no orphaned headings, status cards with dates and state,
pending decisions as cards, Past with dates). C: the check-in card. D:
edit. E: arrival context and accessibility. Each lands green and merged
before the next starts.

---

## D134 — Where "How you train" lives (FOUNDER decision, 2026-09-03)

**Founder, verbatim.** "I don't think I should be heading within settings
either. Perhaps we should have it in [the UI] in a reasonably prominent
place... Heading in settings seems a little bit hard to find. People are
not gonna see it organically or anything like that, and it's a key
feature." On the options presented: **"B, do all three."**

**What this overrides.** CC33's design ruling listed "'How you train'
name and Settings home (RT2-2)" under "what does not change"
(`docs/injury-disability-audit-2026-08-28/DESIGN-RULING.md` §4). The
NAME stays. The Settings ROW stays. The primary entries move out of
Settings by this decision.

**Evidence the decision rests on.** CC33 FINDINGS §1.1 ("three taps deep
in Settings; a user has to already know the feature exists"); the banked
DfE result (one ungated door took disclosure from 4% to 15%); Fitbod's
placement under My Plan; the D109-3 precedent (the sibling preference
lane already lives in the Train tab's Plan tools); D14's one-banner cap
and §33.16's "always available, never repeated" for the Home card.

**The three moves.**
1. Train tab, Plan tools, FIRST row, always shown: "How you train" with
   a live one-line status (`lib/capability/summary.js`).
2. Coach tab, a tier-blind group above the Pro-only Setup, one row: the
   same live status. Free users see it; it is the first thing the coach
   builds from and it is free by law (CAP-19).
3. Home, one calm one-time card for a person with nothing set up (no
   rows at all, history included), shown only once the welcome card has
   retired and only when no ranked banner holds the attention slot;
   "Set it up" opens the add wizard, "No thanks" dismisses; either
   dismisses forever; it also retires by itself the moment anything is
   set up. An offer in the person's words, never "are you disabled?".

**Unchanged.** Every need-moment entry (Home rows, workout summary,
picker, conflict sheet, workout), the onboarding steps, the Settings row,
the free tier, the vocabulary laws, the consent gate.

## D135 — The "one product" coherence pass: what changed, what deliberately did not (lead-ruled under D33, 2026-09-03)

**Founder order.** A single autonomous end-to-end pass to make Volyume
feel like one intelligently designed product, not a set of strong
features built at different times. Understand once, decide, implement,
verify; no second audit of the same material; no feature creep.

**Discovery (agents, read-only).** Four lanes over the CURRENT tree:
navigation model, visual/component system, journey trace (J1 Home to
J7 You), language/state/interaction patterns. Findings that held up on
the lead's own read of the mechanism:
- Token discipline is near-perfect (two hex literals, both in comments;
  one `rgba` on a camera viewfinder). The fractures are component-reuse
  and naming, not colour or spacing.
- The Progress tab listed LiftProgress and BodyMetrics twice: once as
  Answer Block pillars, again as "More stats" tiles (`AnalyticsScreen.js`).
- The Consistency screen stated the block week three times in three
  syntaxes (BlockShapeCard "Week N of M", MesocyclePulseCard "Week N of
  M, focus", BlockProgressCard "Week N/M · Effort X/5"), and the
  muscle-by-muscle bars were a plain View with nowhere to go.
- One weekly coach artefact had four names: "Coaching decision"
  (its own header), "Weekly coach update" (You), "this week's coaching
  review" (workout summary), "This week's coaching decision" (Today).
- The Nutrition tab's screen was headed "Eat"; every other tab's header
  matched its tab label.
- Partner sharing alone called the user's block a "phase".
- "Engine Log" was a visible card title; three food screens said
  "database" in error copy; "Sets" and "Working sets" labelled the same
  value on adjacent screens; the Nutrition targets row's subtitle said
  "goals".
- The terminal action of the core loop (workout summary) was a
  secondary "Close" beside a tertiary Share, while the loop opens on a
  primary "Start workout".
- Hand-tuned overrides on shared Buttons (check-in CTA, partner CTAs,
  plan builder) and two food modals wearing a pushed-screen header.

**Rulings (all lead-ruled, one criterion: the best product for the end
user; every Section 2 inviolable untouched).**
1. One name per concept, propagated: coaching decision; Nutrition;
   block (never phase); Coaching log; food library; Working sets;
   targets. Free-tier "Training review" (CoachReviewScreen) is a
   different artefact and keeps its name.
2. Progress lists each destination once: the duplicate tiles go; tile
   labels are sentence case like the pillar rows.
3. The block is stated once per screen. BlockProgressCard's header
   carries only what the BlockShapeCard above does not (effort, recovery
   week, finished); with `onPress` it becomes a PressableCard opening the
   volume heatmap.
4. The workout summary ends on a primary "Done". Same register as the
   Start that began it.
5. Shared primitives render as themselves: Button overrides removed on
   the check-in, partner and plan-builder CTAs (Button's own disabled
   state replaces the screens' bespoke dim); MyRecipes and MyMeals carry
   ModalHeader like their sibling food modals.

**Deliberately left unchanged, with the reason.**
- The Home hero's "On track for this block." keeps no week number: the
  C22 single-counter law (readinessSummary.js) forbids a second "N of M"
  on the hero; the week is one tap away in the block sheet.
- HomeBlockShapeSheet's four glossary paragraphs stay in their D93 /
  C5-P11 order: the sheet is the block's ruled education surface.
- `shouldDeload` is computed on Home and in useProgressData and narrated
  in four phrasings. A single resolver is the right shape (recoveryState
  already proved it) but touches coaching-adjacent logic across four
  surfaces; recorded as follow-up, not done in a presentation pass.
- Days/equipment/experience are editable from PlanUpdate, ProGoalSetup
  and ManualBuilder. Consolidation changes Pro onboarding-derived flow;
  follow-up, not done here.
- The Free Home has no evidence region (TodayStrip and EvidencePanel are
  Pro). Showing locked rows would be a gating-surface decision; the
  existing teaser card stands.
- The "for now" collision (recovery "lighter for now" vs How you train
  "Temporary, right now") is real but the capability lane's vocabulary
  is CC33-pinned; recorded.
- Four "dead-end" inline empty states reported by discovery were false
  positives on a full read (each sits inside a tappable card, a row meta
  line, a fallback with its own button, or a feature bullet).
- Dead code noted, not removed (CLAUDE.md: mention, don't fix):
  `WeightTrendCard.js` has no importers; `CoachBriefCard`'s default
  export is never rendered; `MealNames` is registered but unreachable by
  founder order.

**Gates.** `npm run lint` clean; full suite 1135 passed, 1 skipped,
15644 tests passed (13 skipped). Rendered inspection was not possible in
the session container (no emulator, no web target, SQLCipher and camera
natives at boot); the device checklist is in the board entry.

## D136 — First 14 days: activation and the first "this app understands my training" moment (lead-ruled under D33, 2026-09-03)

**Founder order.** One autonomous pass over INSTALL → account → setup →
first value → return → first personalisation → first coaching payoff.
Business context: people install and some never create an account.
Activation and retention only; no new monetisation friction.

**Discovery (four read-only agent lanes, lead-verified where built on).**
Funnel: Welcome → Login → Article 9 (grants the 14-day trial) → six-step
Pro wizard → setup-complete → Today. Eleven surfaces before "Start
workout"; the account wall is screen two. The pre-account quiz and plan
preview (`lib/onboarding/quizFlow.js`, `QuizScreen`, `PlanPreviewScreen`)
are built and OFF by founder decision 2026-06-26 ("a free-style quiz on
the Pro CTA broke the Pro flow"); the wizard does not prefill from the
quiz slice, so with the flag on the training week and goal would be asked
twice. Welcome carried two competing cards, eight bullets and a
three-sentence pricing paragraph before one tap. The login screen carried
no trust line at the identity ask. The wizard's body-composition step said
"skip this" and offered only Continue. In the logger, a lift with no
history showed a blank weight box and said nothing (the quiet first-time
line had been retired for repeating the rep range); the rest timer
appeared unannounced; notification access was never requested on the
training path, so the lock-screen countdown the code builds never showed
for a free user. The first workout summary rendered no comparison row at
all where session two shows one. Today's readiness chip said "On track
for this block." with zero history. The pre-workout prompt promised free
users an easing that only Pro applies. The welcome card was gated on a
plan existing, so a person with no plan got no orientation. The check-in
line said it was ready but not what it was for. The check-in and coach
output surfaces themselves (purpose copy, WhyBlock, confidence caption,
held decisions, "See how Precision Coaching decides") were judged strong
and left alone. Telemetry: first-party pipeline exists (`track`,
`trackFirst`, catalogue guard, server allow-list) with first_plan /
first_workout_logged / first_food_logged; nothing for first workout
started, weigh-in, check-in, coach result viewed, accept/decline, or the
permission prompt result.

**Rulings.**
1. Welcome leads with what the app does, three outcome bullets, one
   honest trial sentence (price still stated), the shared primary button,
   and the free version as one line under the card. Trial-first (OB-1)
   preserved: one CTA, free stated as what remains.
2. Login carries "No payment card. Works fully offline. Your data exports
   anytime." in create-account mode.
3. The body-composition step offers the skip it promised. The reminder
   pill keeps "Part of your coaching": its own comment records that the
   reminder is non-optional (D7), so "Recommended" would be untrue.
4. Logger: a quiet first-time line on the first working set of a lift
   with no history says how to choose a load and that it is kept, in
   words that never repeat the range string. A once-ever caption
   introduces the rest strip; at that same first rest, notification access
   is requested once, only if never answered.
5. First-exposure records stay celebrated (founder ruling 2026-08-23,
   pinned in prDetectionRace / detectPR.firstLift); the proposed
   session-one suppression was NOT built.
6. Summary: the 'first' comparison verdict renders "First time on this
   session. Every set is saved. Next time, these numbers show as Last
   session while you lift." Calm/ED suppression applies to this line only;
   the existing comparison verdicts keep their behaviour.
7. Readiness chip with no session: "First session of your plan. Nothing
   to read yet." (no second counter, per C22).
8. Free-tier pre-workout prompt: "Saved with your session, and read back
   to you on Today before your next one." Pro copy unchanged.
9. Welcome card renders for any zero-session user, plan or not.
10. Check-in Today line: "...It shapes this week's coaching decision."
11. Telemetry: first_workout_started, first_weigh_in (Today quick weigh-in
    and the Body metrics form; the onboarding seed excluded),
    checkin_started {first}, first_checkin_completed, coach_result_viewed
    {first, hold}, coach_recommendation_accepted/declined {kind enum},
    notification_permission_requested {status}. Server allow-list in
    `supabase/migrate_156_activation_funnel_telemetry.sql`, NOT applied
    (awaits the founder's phrase); rejected rows re-push until it is. No
    signup_started: it would fire before an account exists and the
    pipeline attributes to auth.uid() only.

**Founder question (not decided here).** Flip `ONBOARDING_QUIZ_FIRST` so
the plan takes shape before the account wall? It reverses the 2026-06-26
decision. If yes, the wizard must first prefill its training-week and
goal steps from the quiz slice so nothing is asked twice; that wiring is
recorded as the precondition, not built.

**Deliberately unchanged.** Article 9 consent text and gate (locked);
the setup-complete screen's calm-coaching pointer (safety); the
session-one feedback sheet (deliberate "is this for you?" beat); the
Coach tab's absence of a pre-decision status card (founder verdict, the
row already carries the concrete countdown); Diary's Pro lock for free
users (monetisation surface); the engine's own data-hold re-check
disagreeing with the check-in screen's gate count (consequential logic,
recorded as follow-up).

**Gates.** `npm run lint` clean; `tsc --noEmit` clean; full suite 1139
suites passed (1 skipped), 15693 tests passed (13 skipped), 49 new pins.

**Follow-ups recorded.** Quiz-first prefill wiring (above);
`BodyMetricsScreen.js` edit path passes `data.body_weight` where the
validator returns `data.weightKg` (possible undefined save on edit;
flagged by the telemetry agent, not touched); check-in gate versus engine
weigh-in count.

## D137 — Volyume is a complete free product; first launch rebuilt (FOUNDER decision on the product; lead-ruled execution under D33, 2026-09-03)

**Founder, verbatim.** "VOLYUME IS FREE. Not a 14-day trial; freemium; a
founder promotion... From the user's perspective there should simply be:
VOLYUME with the full current product available." And on setup:
"Onboarding as it is now is very valuable and attractive, do not reduce
that in amount of questions if it's adding real value." This decision is
the permission `docs/rules/billing.md` requires. Product IDs
`pro_monthly`/`pro_annual` are untouched.

**Architecture (lead-ruled).** One flag, `FULL_ACCESS_FOR_ALL = true` in
`src/lib/proGate.js` (`PRO_BETA_ACTIVE` kept as its alias). The store's
private `_effectiveTier` clamps every tier write (checkTier incl. the
local trial-expiry demotion, setTier, restoreSessionFromCloud,
refreshTierFromCloud, lockStalePaidEntitlement) and neither restore path
mirrors `trial_state`/`pro_trial_ends_at` onto the profile any more; that
mirror was what re-armed every trial surface. The payments barrel
`src/lib/payments/index.js` is the inactive boundary: while the flag is
on, startCascade / payAt / confirmPurchase / reconcilePaidEntitlement /
restorePurchases / handlePotentialLapse and the Play Billing entry points
resolve to `{ ok: false, error: 'billing_disabled' }` without touching the
network or the store (pinned by billingBoundary.test.js). Consent no
longer starts the cascade. Cascade-gate, trial day-3 and win-back
scheduling are no-ops that also cancel; `restoreNotifications` no longer
re-lays them; their notification types are non-navigating. The engine's
differential paywall output is `{ shown: false }` while the flag is on:
nothing is withheld behind an offer, every other coach output byte-
identical. Existing users get a one-shot `runFreeConversionOnce` before
`restoreNotifications` at session restore: cancels the three push
families, clears the win-back episode, pending cascade and day-14 gate
flag, removes the trial keys, caches tier as full.
`supabase/migrate_157_pause_cascade_cron.sql` unschedules the server's
cascade advance job (NOT applied; awaits the phrase). Re-arming
monetisation is a deliberate two-step: flip the flag and re-register the
dormant surfaces.

**Removed from the runtime.** All 23 `withProGuard`/`withReadOnlyProGuard`
wrappers; the tier routing (everyone goes consent → the six-step setup →
setup complete → Today); FirstRunScreen, FreeStarterScreen and the free
no-plan branches; ProUpgrade, CascadeGate, Subscription and
SubscriptionPolicy route registrations; HomeProTeaserCard,
DifferentialBadge and AttentionCard (no variant left); the free branches
and read-only-lapse paths on Home, You, Progress, Plans, Plan detail,
Diary, Body metrics, Progress photos, Athlete profile, Partners, Workout
summary, the logger and the Settings screens; the PRO badges and trial
rows in setup; the Settings plan section, FAQ entries and subscription
page on the web dashboard; the store listings' trial and IAP sections;
the landing page's offer line. Kept dormant on disk: the billing screens
and components, `src/lib/payments/*`, `differentialPaywall.js`, the
win-back copy, the telemetry catalogue entries (now `deferred`) and
`FEATURE_LOCKED` history.

**First launch (lead-ruled from research).** Principles that carried:
show the product working before asking anything; one OAuth tap for the
account with email secondary; setup questions that visibly build the
plan; contextual permission asks; no landing on a blank slate; deck-of-
cards tutorials do not help (NN/g). Because the account must come first
here (identity law), the first screen SHOWS an example week rendered from
the app's own components: a planned session carrying last time's numbers,
a coaching decision with its reason (glossed), and the block dots. One
headline, one line of promise, one "Get started", the sign-in link, the
trust row. No bullets, no price, no tier. The account step gained a
heading ("Create your account" / "Welcome back"), one why-account line,
OAuth first, email behind one tertiary button in create mode, and the
trust line. The wizard keeps every question; only its tier chrome went.
The quiz-first flag stays off (founder decision 2026-06-26, question
still open from D136).

**Analytics.** `setup_started` (wizard mount) and `first_home_landed`
(first Today render) added to the catalogue and to `migrate_156` (still
unapplied). Pre-account events (first open, intro viewed) cannot be
attributed by this pipeline (auth.uid only, no anonymous install id);
the pre-account gap is read as store installs against `account_created`.

**Deliberately unchanged.** Article 9 consent (locked); the setup
questions and their order; the calm-coaching pointer on setup complete;
the Coach tab's absence of a pre-decision status card (founder verdict);
`lib/onboarding/freeStarter.js` (still feeds plan scoring in PlanDetail
and PlanLibrary); the quiz-first flag.

**Gates.** `npm run lint` clean; `tsc --noEmit` clean; full suite 1140
suites passed (1 skipped), 15673 tests passed (16 skipped). The ED
fail-closed, coach validation, identity and capability guards all green,
unweakened.

**External follow-ups (founder).** Play Console and App Store Connect:
paste the refreshed listings, deactivate (do not delete) the two
subscription products and the subscription group, replace paywall
screenshots, update review notes. volyume.app: the live site is outside
this repo; its pricing/FAQ copy needs the same pass. Internal marketing-HQ
docs and email/retention playbooks built on the trial cadence need a
separate content pass (flagged, not done).

## D138 — Nutrition experience masterpass: the daily food path (lead-ruled under D33, 2026-09-03)

**Founder order.** Make daily nutrition good enough that a person who
would otherwise use a dedicated food app has little reason to leave
Volyume to log food. Not "add a calorie tracker": make the whole daily
experience fast while keeping depth. Audit first; preserve what is
excellent.

**Research that shaped the rulings.** The fastest current loggers win on
action count, not catalogue size: one add surface, recents and frequents
before typing keyed to the meal, last-used portion memory, barcode miss
chaining into label capture, whole-meal and yesterday copy, per-meal
subtotals always visible, missed days treated as neutral. The most-cited
competitor failures are a 2026 redesign that hid per-meal totals behind
taps, a core input (barcode) paywalled, crowdsourced duplicate-choked
databases, AI capture that is slow or wrong, and no offline search.

**What the audit found already excellent, preserved unchanged.** The
remaining-first MacroRings hero (adherence-neutral by construction, with
protein g/kg and P/C/F split); absence never converted into evidence
(logged days only, stated in every insight headline, no shaming copy
anywhere); slot-aware portion memory; personal-history merge into search;
planned never conflated with eaten (every read path filters
`is_planned = 0`, confirmation is the only promotion, unlogged days drop
out of averages rather than scoring zero); honest failure states; the
barcode-miss recovery loop with the barcode attached; the calorie-banking
copy; undo on every log path; micronutrient restraint. The UK-first data
advantage is real (bundled UK Open Food Facts snapshot plus CoFID, local
FTS first, live only when local is weak) and needs no badges.

**Highest-friction findings.** No one-tap re-log of a daily food from
the diary (three taps, a push and a sheet, for a food whose grams the app
already knows); "Copy yesterday" vanishes the moment one item is logged;
the add-food screen resolves up to sixty food references one at a time
before it can render, and the diary does the same per row and per slot;
the diary re-fetches yesterday on every load to gate one button; a user
with no targets sees a dead ring and no way out; Food Insights had one
door, three taps deep behind an unlabelled icon; uncertain label-scan
figures saved silently; a custom food could never be edited; the
remembered portion reopened in grams, discarding the household unit;
search did not focus the keyboard for a new food; the fastest path was
labelled "Plate"; scanned drink labels dropped their millilitre serving;
two dead components shipped on the surface; the planner's "Nothing is
logged until you add it" contradicted the confirm step; the grocery list
could not be ticked.

**Rulings.**
1. One-tap usual from the diary. The usual chip shows the portion in its
   label and logs directly with an undo toast; a long-press opens the
   portion editor. The search screen keeps its row → sheet → confirm
   contract (the tap-count guard protects "confirm the portion before a
   repeat", which the disclosed portion and undo satisfy).
2. Per-meal "Yesterday's {meal}" chip on an empty slot, copying only that
   slot, with a multi-row undo.
3. The daily surface trades the Meal builder row and the banking button
   for one chip row: Meal builder, Higher-calorie day (when allowed),
   Trends. Trends is the door to Food Insights.
4. No targets: a compact EmptyState under the rings with the same copy
   and action the search screen already uses.
5. Batch food-reference resolution (one query per kind) on the diary, the
   add-food screen and the per-slot usuals; live-search cache promotion
   runs concurrently; the yesterday fetch runs only when a slot is empty.
6. Label OCR: uncertain, untouched figures go through a confirm before
   saving; millilitre servings are kept.
7. Custom foods become editable; logged entries keep their stored macros.
8. The remembered portion reopens in the household unit when it divides
   cleanly into the serving.
9. Search focuses the keyboard only when there are no recents to show;
   "Plate" becomes "Add" and the bar reads "N to log".
10. Planner copy: "Nothing counts until you mark it eaten." Grocery ticks
    persist per plan on device.
11. Dead components (HeldDecisionCard, ServingPicker) deleted.

**Superseded contract.** Campaign 17C's adversarial guard pinned that a
diary usual "carries remembered grams into the picker rather than
silently logging". No founder law backed it; it was 17B's own design.
Ruling 1 supersedes it for the diary chip only, on the founder's order
that repeat logging be one or two taps: the chip discloses the portion,
the write is canonical, Undo follows, a food with no remembered weight
still falls back to the picker, and the search screen's rows keep their
row → sheet → confirm contract. The guard now pins that.

**Gates.** `npm run lint` clean; `tsc --noEmit` clean; full suite 1146
suites passed (1 skipped), 15741 tests passed (16 skipped). The tap-count
guard and every planned/eaten and evidence pin unchanged and green.

**Deliberately unchanged, with the reason.** Numbered meal slots (the
founder removed meal renaming on 2026-07-13 as not needed); search
ranking, source order, the strong-local short-circuit and cross-source
dedupe (a ranking change without measured evidence is speculation);
empty meal cards stay full (their usuals row IS the fast path); no new
coach or evidence row on the diary (the surface is already at its
density limit; "Targets updated. See why" and Trends carry the link);
the meal planner's structure, the absence of a "skipped" state (a schema
change to planned rows with no evidence consumer); origin badges on
planned rows; nutrition targets and coaching engines untouched.

## D139 — Programme creation and planning masterpass (lead-ruled under D33, 2026-09-03)

**Founder order.** Make choosing, creating, understanding, editing and
progressing a programme feel simple, personal and under the user's
control, without touching the engine.

**Research that shaped the rulings.** Three clear entry points; a short
generation wizard; a full preview before commit, never generate straight
into active; one plain-language reason per major decision drawn from real
inputs; edits treated as inputs, not breakage; a visible block position;
a structured end-of-block moment; no restart when life changes; one term
per concept; warn before overwriting. Recurring complaints elsewhere:
long questionnaires, opaque decisions, generic plans, constrained
"editing", fear that edits break progression, routine/programme/block
confusion.

**Preserved unchanged (judged strongest).** The next-block review sheet
built from a dry run of the same generator the confirm runs; both
next-block options always reachable with advice as a tag, never a gate;
"what continuing with adjustments would change: nothing" when it is
true; the shared block-start and activation sentences; the swap sheet
(named target, per-candidate reasons, honest capability count, full
escape hatch, undo, a proposal never an auto-default); the capability
lane's temporary-limitation model (sessions adapt, the plan is not
rewritten, everything returns); computed, never tagged, library
compatibility; the onboarding build sequence; the state-specific mid-
block dialogues; continuity-first rebuilds that default to keep and
always receipt a drop; evidence placed at the decision; repeat means
repeat.

**Highest-friction findings.** The most-promoted adjustment route
(PlanUpdate) silently ended the running block and was the only plan-
changing screen without the block sentence; every generation archived
all other plans without a word; week-one activations passed with no
confirm; "Start with a plan" generated straight into active with no
preview although a dry run exists and powers PlanUpdate; the goal-change
flow regenerated blind; the continuity message ("you have trained well
with this split across N blocks") was a six-second toast after commit
and appeared on no commit path's preview; two block-boundary labels
("Build a new plan", "Review with coach") named one destination
("Adjust training"); "Adjust training plan" rendered with no plan to
adjust; two no-plan states differed between Home and Train; the
library's "N to swap" fact vanished on the deciding screen; five words
(day, workout, routine, template, session) named one object; the one
good block definition sat behind a tooltip on a secondary screen while
"Week N of M" hid whenever the advisor was not on "continue"; the manual
builder wrote an empty programme before a single exercise; no edit
stated its scope.

**Rulings.**
1. One shared preview sheet, extracted from PlanUpdate, used by "Start
   with a plan" (Home and Train), PlanUpdate and the goal change. It
   shows the continuity line before confirm, the change receipt, the
   block sentence and, when a block is running, "Confirming ends your
   current block at week N of M and starts a new one from week 1",
   the count of other plans moving to Archived plans, and that hand
   edits to current workouts are not carried over.
2. PlanUpdate goes through the mid-block confirm like every other
   activation. Week-one activations with a live block use the first-
   activation dialogue; only a genuinely blockless state passes silently.
3. Both no-plan states offer Start with a plan and Browse plans; the
   Train tab's tools show Adjust only with an active plan.
4. The active plan card always states the week (recovery week, block
   finished) with the block definition one tooltip away, shared with
   Training blocks.
5. Block-boundary secondaries say "Change my training setup"; the dead
   free-tier option copy goes.
6. One word: "workout". Saved workouts, not templates.
7. The library preview carries the compatibility badge and names up to
   three exercises that would be swapped; every preview carries a split
   rationale when the engine's per-plan reasons are absent.
8. The manual builder writes on first save only and shows a per-day
   duration when a pure estimator exists; a set/rep edit states its
   scope: this workout only, weekly set targets stay with the block.
9. Funnel telemetry: preview shown/confirmed/dismissed by source, block
   decision by intent, library preview, manual plan started/saved, plan
   replaced. Counts and enums only.

**Gates.** `npm run lint` clean; `tsc --noEmit` clean; full suite 1160
suites passed (1 skipped), 15853 tests passed (16 skipped). No engine
module changed except label strings in blockAdvisor and one shared
constant in blockExplain. The library card's session-length estimate was
not added: no pure estimator is reachable without a new bulk query
(recorded, not built).

**Deliberately unchanged, with the reason.** Volume mathematics,
adaptation thresholds, seed resolution, exercise scoring and the block
state machine (engine law); a lightweight "keep my block, just make it
three days" (a new continuity rule across a structure change; the
disclosure fixes the trust problem now, the rule is a founder question,
ANSWERED the same day: see D140); a weekday model for sessions (the plan is ordered, not scheduled; a new
model); the library quiz; goal-based defaults in the manual builder;
Training blocks' week-count fallbacks (latent, both columns written).

## D140 — A rebuild that keeps every exercise keeps the running block (founder decision, 2026-09-03)

**Founder decision.** Asked at the D139 closure: "should a days-per-week
change that keeps every exercise also keep the running block rather than
restart it? A. Yes, keep the block when only days change. B. No, a rebuild
always starts a block. C. Keep it only in weeks one and two." Founder:
"Yes" (option A).

**Rule as built.** From Adjust training, a rebuild whose exercise list is
unchanged (no exercise added, dropped or replaced) keeps the running
block; the new programme is activated underneath it and the block carries
on at the week it is in. Any change to the exercise list restarts the
block exactly as before. Ruled by one pure function,
`keepsBlockOnRebuild` in `src/lib/planDiff.js`, read by the preview sheet
and again by the commit, so the sentence shown and the write made cannot
disagree.

**Why the rule is "every exercise stays", not literally "only days".**
The block (mesocycles, mesocycle_weeks, planned_muscle_volume) is keyed
to the user and to muscles. It is the multi-week shape of the weekly set
targets per muscle; it knows nothing about a programme or how many days
those sets are spread across. Days, session length, split and the other
setup fields cannot invalidate it. What can is the exercise list: the
learned seeds and the ramp are read per exercise, so a replaced or
dropped exercise is a genuinely different block. "Only days" would have
kept the block for a 4-to-3 change and restarted it for a 4-to-3 change
that also shortened the session, with the same exercises either way,
which no user could predict. The exercise list is the one honest line,
and days-only is its headline case. Best-for-user under D33.

**States.** Kept while the block is 'active' or in its 'recovery' week.
Never kept when the block is finished and awaiting its decision: a
rebuild from "Change my training setup" IS that decision and must start
the next block. With no block at all the usual activation runs, so nobody
ends with a plan and no block. The commit re-reads the block's position
at confirm time; if the block finished between preview and confirm, the
rule flips to a restart and the existing open-decision dialogue says so.

**Explicit confirm.** The preview sheet is the explicit yes. With the
block kept nothing at block level is lost, so the "Restart your training
block?" dialogue is skipped (it would be asking about a restart that is
not happening). With the block restarting, the dialogue runs exactly as
D139 left it.

**Copy.** Sheet: "Every exercise stays, so your current block carries on
at week N of M rather than restarting. Your workout history and PRs are
kept." replaces both the block-start sentence and the restart line.
Receipt toast: "Plan rebuilt around your new training setup. Your block
carries on where it was". Hand-edits and archived-plans lines still show:
the workouts are rebuilt.

**Defect fixed on the way, in the same function.** `confirmPlanSwitchMidBlock`
matched the recovery week against 'in_recovery' (blockAdvisor's ACTION
name); `getBlockStatus` reports it as 'recovery'. The branch never fired,
so a recovery-week switch fell through to "anything not 'active' passes"
and went silent, which is the state C6 P9-07 (D97) believed it had closed.
Corrected to 'recovery' and pinned. The keep rule needed the true status
value, which is how it surfaced.

**Telemetry.** No new event. `plan_activated` still fires on the kept
path (inside setActivePlan); `plan_replaced` does not, because no block
was replaced. `plan_preview_confirmed {source:'update'}` counts the
rebuild.

**Scope.** Adjust training only. The Coach tab's goal change
(ProGoalSetup → startWithPlan) still starts a block: it changes the
training phase the engine plans around and was not in the founder's
question. Recorded as unchanged, not parked; raise it if wanted.

**Engine untouched.** No volume mathematics, adaptation thresholds, seed
resolution, exercise scoring or block state machine changed. The block
writer gained a sibling that writes no mesocycle at all
(`activatePlanKeepingBlock`, source-guarded).

**Tests.** `planDiff.keepsBlock.test.js` (the rule),
`activatePlanKeepingBlock.guard.test.js` (no mesocycle write; commit
fallback), `planSwitch.test.js` (keepBlock silence, finished block never
kept, recovery-week dialogue now fires), `PlanPreviewSheet.test.js`
(kept line replaces restart line), `planAutoGen.test.js` (default path
unchanged, keep path, fallback), `PlanUpdateScreen.previewWiring.guard`
(one rule on both sides, re-ruled at confirm).

## D141 — Top-ten improvement pass, first launch and retention (founder order, 2026-09-04)

**Founder order.** "With all you know about the app from all audits ...
propose a top 10 improvements ranked based on the real code base as it is
now. Not new features but improving what we have." Then: "Action all of
these to the absolute best standard." Three read-only audit lanes
(first launch, retention, reliability) produced the candidates; every
ranked finding was verified in code by the lead before ranking.

**The ten, as built.**

1. **Sign-in cannot hang.** Google and Apple token exchange, email sign-in
   and sign-up are raced against a 20 second bound (`withAuthTimeout`,
   `src/lib/supabase.js`); the rejection is network-shaped so the existing
   auth copy shows the calm connectivity sentence. Steps the user is inside
   of (account picker, Apple sheet, Play Services dialogue) are not
   bounded. A late completion still signs the user in through
   onAuthStateChange; nothing is left half-done.
2. **A hung database open reaches the failure screen.** `attemptDbInit`
   races `initDatabase()` against 12 seconds (above the 8 second auth
   latch) and handles a timeout exactly like a thrown open; a late
   completion re-runs the attempt so the flag clears itself.
3. **"Start with a plan" shows it is working.** EmptyState gains `busy`
   (Button's own loading treatment); Today and Train hold it across the
   preflight and dry run. Browse plans stays enabled (ruling: it never
   conflicts with an in-flight preview).
4. **Destructive actions never fail silently.** Discard workout deletes
   first (bounded at 8 seconds), stops a running rest timer, and only then
   ends the session and navigates; an already-gone row counts as
   discarded; failure keeps the user on the screen with a toast. Diary
   swipe-delete logs and tells the user. Delete saved workout on the
   Train tab, which had no handling at all, now logs and tells the user
   like its sibling folder delete.
5. **The block-finished push is sent.** `scheduleBlockReadyForActiveBlock`
   lays the already-built push at activation for 09:00 local on the day
   the block finishes, re-lays it in `restoreNotifications`, never lays it
   for a block already over or without a block, one fixed identifier.
   Not laid on the keep-block path (D140): the block is unchanged.
6. **The coach "unread" signal lasts until the review is opened.** A
   per-user viewed marker (`@volyume_coach_output_viewed_<uid>`, written by
   CoachOutputScreen on a real view) drives the You-tab badge through the
   pure `resolveHasUnseenCoachChange` (`src/lib/home/unseenCoachChange.js`):
   badge = latest decision-complete output newer than the marker, no time
   expiry. The Home banner keeps its seven-day window and its dismissal;
   dismissing the banner never clears the badge. Lead review: Home reloads
   the coach output on every focus, so the marker is re-read on every
   focus too, or the badge a user had just cleared came back on return.
7. **The training reminder is refreshed at launch**, not only when a
   workout finishes (`refreshHabitDerivedTrainingSchedule` after the
   session-branch restore in RootNavigator). See the open question below
   for the rest of the retention lane's finding.
8. **Sync give-ups are visible.** `syncStatusLabel` states parked changes;
   Settings › Your data shows the count with "Retry now";
   `retryFailedOps` resets parked rows for the signed-in user, never
   during a sign-out wipe, and flushes.
9. **Reminder settings are discoverable.** Settings subtitles now name
   only what each screen owns ("Training reminder, meal reminders and
   quiet hours" / "Weigh-in and weekly check-in schedule"); Coaching
   reminders carries the reciprocal cross-link to Notifications and
   reminders in the same component. The opt-in meal-log reminder gets one
   calm, dismissible, one-time offer on the diary ("Want a nudge to
   log?"), ruled by the pure `resolveMealReminderOfferEligible`
   (`src/lib/food/mealReminderOffer.js`): account with targets set, at
   least one logged day AND at least two unlogged days in the last seven,
   meal reminders not already on, NOT under calm mode (a failed wellbeing
   read counts as calm), NOT under an open ED flag (fail closed), not
   previously dismissed (per-user key). Lead review added the "at least
   one logged day" clause: the offer is for a lapsed logger, never a
   first-day user who has not tried the diary yet. No telemetry event.
10. **First-run polish.** One voice for the identical empty state ("your
    coach builds one from your setup", per the locked actor-naming rule);
    the setup-complete "Train your split" row is a plain view with honest
    copy when there is no plan; the rebuild toast keyed off a field the
    commit never returns is removed; orphaned first-set and warm-up hint
    styles are removed rather than wired (no spec exists for the hint;
    inventing coaching copy for a first set is a feature, not polish).

**Defect found while building item 4 (recorded, fixed in scope).**
`endWorkout()` clears the rest-timer store fields but is not one of the
live-activity lifecycle sites, so a discard mid-rest left the iOS Live
Activity counting down a deleted session until expiry or the next launch
sweep. The discard helper now calls `stopRestTimer()` first when a rest is
running.

**Open founder question (retention lane, not built: it is a product
fork on a locked notification category).** The training reminder is an
OS-level weekly repeat, so it is the only push that still reaches a
fully lapsed user, and it cannot adapt without the app running (no
background fetch exists). Two designs, both changes to
NOTIFICATIONS_LOCKED: (A) bound the reminder to a laid-ahead horizon
(e.g. eight weeks of dated one-shots re-laid on every launch), so a user
absent for months stops being pinged from a life they left; (B) keep the
infinite repeat and add one calm return push laid at now + 21 days and
re-laid on every launch, so it fires only after three weeks of genuine
absence ("Your plan is still here whenever you're ready. Nothing has been
lost."), tier-blind, budgeted, off under calm mode or an open ED flag;
(C) both; (D) leave it. Delivered in chat.

**Engine, ED-safety, consent, billing: untouched.** No floors, thresholds,
seeds, scoring, block state machine, consent gate or product ID changed.

## D142 — Bounded training horizon and a welcome-back note (founder decision C, 2026-09-04)

**Founder decision.** Asked at the D141 closure: for a user who stops
opening the app, (A) bound the training reminder to a laid-ahead horizon,
(B) add one calm return push after 21 days, (C) both, (D) leave it.
Founder: **C**. The lead's recommendation was C: one honest invitation
back, then silence rather than nagging.

**As built.** Recorded in full as the D142 addendum to
`docs/NOTIFICATIONS_LOCKED.md` (the locked notifications contract), which
is the authority. In one paragraph: the training reminder is now a
bounded run of dated one-shots (eight weeks, capped at 28 so iOS's
64-pending ceiling holds), re-laid on every launch, foreground top-up and
activation; and a new `return_nudge` category lays one push 21 days ahead
at 10:00 local, re-laid on every open, so it fires exactly once and only
after three weeks of genuine absence. Own toggle (default on), established
users with a plan only, never under an open ED flag or calm mode (both
fail closed), budgeted, routed to Home. Copy: "Your plan is still here /
Whenever you are ready, your next session is waiting for you. Nothing has
been lost."

**Rulings on the way.**
- The one-shot cap is 28, not "eight weeks unconditionally": iOS keeps the
  soonest 64 pending notifications, and a seven-day habit at eight weeks
  would have crowded the weigh-in horizon and the event pushes out. The
  cap shortens the horizon for dense habits (four weeks at seven days a
  week) and never touches the common three-to-four-day case.
- The return note fires at 10:00 local rather than at the lay time of day:
  the lay happens whenever the app was last opened, which is as likely to
  be 23:40 as 10:00.
- A six-hour re-lay throttle on foreground: moving a 21-day clock more
  often than that buys nothing and costs reads on every tab switch. The
  launch re-lay and the settings toggle force past it.
- Calm mode gates the note even though it is not food or weight adjacent:
  a person who has asked for calm has asked for fewer nudges, full stop.

**Engine, ED-safety, consent, billing: untouched.**

## D143 — Fresh-install incident: encryption codec missing from the Android build; first-account residue check tripped by the install's own snapshot (2026-09-04)

**What the founder saw.** Every fresh install since the build made on
the morning of 2026-09-03 failed. Android: "Couldn't open your data" at
boot. iOS: "Couldn't switch accounts safely" on the first sign-in. Existing
installs with data kept working.

**Evidence (observed, not inferred).**
- Sentry VOLYUME-33, `dbCrypto open aborted
  (sqlcipher_unavailable_fresh_database)`: 20 events, all Android,
  releases 1.3.1+3560 (first seen 2026-09-03 07:30 UTC) and 1.3.1+3561.
- Build 3563 was run with the new packaged-library gate
  (`scripts/verify-android-sqlcipher.cjs`): `libexpo-sqlite.so` in both
  the APK and the AAB carried no SQLCipher markers, although
  `android/gradle.properties` carried `expo.sqlite.useSQLCipher=true`
  after prebuild. That is the Android cause, proven on the artefact.
- `verifyNoForeignLocalData` (added 2026-09-01, 34495ebf) refused any
  file in the snapshot directory. `_doInit` writes a pre-migration
  snapshot whenever `user_version` is below the migration count, which
  is true of every fresh install. So the install's own snapshot read as
  another account's residue. That is the iOS cause, and it would have
  hit Android next.

**Why now.** The 2026-09-01 fail-closed open (0bc08b67) turned a missing
codec from a silent plain-SQLite fallback into a hard refusal on any
database created without it. The 09-01 residue check is the second half.
Both were correct in intent; neither had a fresh-install test, and the
build had no proof the codec was actually packaged.

**Fixes (all on main, build 3564 green on every gate).**
- 32ebfdf5: packaged-library gate in the Android workflow (fails the run
  if `libexpo-sqlite.so` lacks `sqlcipher_extra_init`/`cipher_version`),
  a gradle.properties gate after prebuild, and the abort now logs the
  key-probe result so the next failure names itself.
- cfa8c2fe: migration-kind snapshots pass the residue check;
  account-switch, pre-restore and unknown snapshots still refuse
  (`verifyNoForeignLocalData.snapshots.test.js`).
- 9a2e6cfe: `scripts/force-sqlcipher-android.cjs` pins
  `USE_SQLCIPHER = true` in expo-sqlite's Android build script after
  `npm ci`, the Gradle invocation also passes
  `-Pexpo.sqlite.useSQLCipher=true`, and an init script prints the
  evaluated value. Build 3564's log: `USE_SQLCIPHER=true
  findProperty(expo.sqlite.useSQLCipher)=true`, and the gate reported the
  codec in all four native libraries.

**Not established.** Why Gradle evaluated the property false in builds
3559 to 3563. The diagnostic only exists from 3564, where the pin already
forces true, so it cannot show the earlier value. The pin and the binary
gate make the cause moot for shipping: a build without the codec can no
longer pass.

**Rulings.**
- The codec is pinned on unconditionally rather than "fixed properly"
  in prebuild: the app has exactly one storage mode and a build must not
  be able to choose the other one. A gate on the artefact, not on the
  configuration, is the only proof that counts.
- The residue check keeps refusing every non-migration snapshot. Only
  the kind the fresh install itself creates is exempt.
- Sentry VOLYUME-33 stays open until a fresh install of 3564 reports no
  new event; it is the founder's confirmation signal, not ours.

**Standing rule from this incident (founder, 2026-09-04).** Never
trigger an iOS (EAS) build, or any build that costs money, without the
founder's explicit go for that build. An iOS build was started during
this incident without permission and had to be cancelled. Recorded in
CLAUDE.md Section 4.

**Engine, ED-safety, consent, billing: untouched.**

## D144 — First screen rebuilt: no slogan, no mock-up (founder device verdict, 2026-09-04)

**Founder verdict, from a fresh install of build 3564.** "Stop this less
thinking or AI clipped text in general, it is horrible"; "the landing page
looks bad, totally mismatched sizes"; "why do we have that example week,
it looks shit".

**What was on the screen.** The D137 welcome: a 132px wordmark, the
two-fragment tagline "Less thinking. More lifting." at h1 over two lines,
a body promise, then a mocked "example week" card (a fake session with
"Last session: 80 kg x 8", a fake coach line, a block shape) built from
the app's own components, then the CTA. The tagline is exactly the
clipped fragment CLAIMS-STANDARDS tell 2 bans ("Honest coaching. Every
time.") and the voice contract's no-clipped-commands rule; the card put
invented numbers on the app's first screen.

**Ruling (D33, best for the person opening the app).**
- The tagline is retired everywhere it rendered: splash, Welcome, sign-in,
  About, the web page and the marketing fact base. One brand line now
  lives in `src/lib/brand.js` (`TAGLINE`): "Your plan adjusts to what you
  log." One plain sentence, true of the product. It is imported, never
  retyped, so it cannot drift again.
- The mock-up is removed, not restyled. A first screen should not carry
  numbers nobody lifted. The screen is now: wordmark (200px, the hero),
  headline at h2, one body sentence that says what the product does
  ("Volyume builds your training and food targets around you, then checks
  in each week and explains any change it suggests"), the CTA, the
  sign-in link and the trust row. The hero takes the free height above
  the actions so the composition holds on every phone.
- Sizes: the headline steps down from h1 to h2 because the wordmark is
  the hero; the promise stays body. Nothing hand-sized.
- The coach gloss (C5-P34-01) rode the mock-up's Coach row. The first
  screen no longer uses the coaching vocabulary, so there is nothing to
  gloss there; the pin now enforces "gloss it if the word appears, and the
  word does not appear", so the term cannot return unglossed.

**Provenance, corrected the same day.** The slogan entered the tree on
2026-05-19 (an em-dash sweep that turned dashed phrases into fragment
pairs, plus a one-line tagline commit) but sat as small muted caption text
under the wordmark until 2026-09-03, when the D137 first-screen rebuild
promoted it to the h1 headline. The defect users saw is D137's, in builds
3560 onwards, not the May sweep's.

**Scope of the rule, founder-corrected.** The ban is on slogan-shaped
fragment pairs used for effect ("Less thinking. More lifting."). It is
NOT a ban on a status label followed by a sentence: "Week 3 of 5 · Build.
Recovery week in 2 weeks.", "Recovery week. Training is deliberately
lighter. What that means.", "Block finished. Targets hold at
recovery-week volume until you choose what comes next." are fine and
stay as written. The lead rewrote them anyway (d7b26e02) and the founder
rejected it; reverted in full (cd6c4445). The engine's unrendered week
labels were never shown and are untouched. The web page's hero sub-line
still describes a Free/Pro split (pre-D137); flagged, not changed.

**Engine, ED-safety, consent, billing: untouched.**

## D145 — Premium first launch: Welcome and Create Account redesigned (founder spec, 2026-09-04)

**Authority.** The founder's written spec of 2026-09-04 ("VOLYUME —
PREMIUM FIRST-LAUNCH + ACCOUNT CREATION REDESIGN"), delivered in chat
after the D144 welcome was judged "utterly shit" on device: generic,
text-led, dead space, a headline that diced across lines, no product on
the product's first screen. The spec is the contract; this entry records
how it was met and the two places judgement was needed.

**Welcome (`src/screens/WelcomeScreen.js`).** Small wordmark (24dp),
headline "Everything you need to build your physique.", support line
"Training, nutrition, progress and coaching, connected in one app.", the
product as the hero, "Completely free · No ads", Get started, and a text
sign-in. The hero is three REAL captures (the store-listing screenshots
under `marketing/hq/assets/screenshots`, resized to 480px into
`assets/welcome/`: Today, a set being logged, the day's nutrition) framed
at the app's card radius with a hairline border, the main one centred,
the other two behind at 84%, turned 5 degrees and dimmed, the bottom
fading into the page. Nothing drawn, no invented numbers. The
composition is sized from the height the words and the actions leave
(measured by onLayout), capped at 55% of the width, and centred between
two flex spacers, so a tall phone gets a taller composition and a short
phone a smaller one, never a dead band and never a CTA below the fold.

**Type.** The headline is the display face at the h2 size (24dp,
InterDisplay-Bold, line height 1.2): at h1 (32dp) "Everything you need"
cannot fit a 360dp line and the founder's screenshot showed exactly that
dicing. At 24dp the line breaks after "to". The support line is body;
the free line and the sign-in are label and small body; the accent is on
the verb "Sign in" only.

**Create Account (`src/screens/LoginScreen.js`).** The faint background
wordmark, the 56dp centred mark, the tagline, the divider, the "or"
divider and the verbose why-account sentence are gone. Now: back chevron,
a 20dp wordmark, left-aligned heading ("Create your account" / "Welcome
back"), one line ("Save your training, nutrition and progress across
devices." / "Sign in to pick up where you left off."), Continue with
Google (neutral provider button), Continue with email (tertiary, accent
label; expands to the fields), the mode toggle and forgot-password as
text actions with full touch targets, and one restrained trust line
"No ads · Export your data anytime". No blanket offline claim on the
account step. Auth logic, session handling, the identity invariant and
the consent gate are untouched.

**Judgement calls.** (1) The C5-P34-01 gloss pin attached to the word
"coaching" in the founder's support line; the pin now attaches to the
product term and to the noun "coach", since a plain English list of four
things is not jargon. (2) The Welcome sign-in was pinned as "contained
neutral chrome"; the founder's spec makes it a text action, and the pin
now guards the intent (touch target, no underline, accent on the verb).

**Render.** Both screens were rendered from the same values as the code
(Inter, the theme's colours, radii and spacing, the real captures) at
360x800 and 412x915, plus the sign-in mode, and reviewed side by side:
`https://claude.ai/code/artifact/9c7eb2a6-68f7-4beb-ab27-bf26e361147e`.

**Engine, ED-safety, consent, billing: untouched.** One new test double
(`__mocks__/expo-linear-gradient.js`): the real component calls a
react-native function the test environment lacks.

**Second pass on Create Account (founder verdict the same day: Welcome
approved and preserved; the account screen "placed into the upper half of
a large empty black screen").** Composition, not content. Ruled after
rendering three candidates beside the approved Welcome: (A) a full-bleed
dimmed crop of a real screen behind the form failed, the back arrow
collided with the screen's own title and it read as a ghost screen; (B) a
framed, turned capture top-right with the content anchored to the bottom
was right but floated; (C) is B with the account step on a sheet, and is
what shipped. The Train capture (`assets/welcome/train.jpg`, the real
store screenshot) sits top-right, turned 7 degrees, dimmed to 62%,
bleeding off the edge under the status bar; it fades into the page just
above a sheet (surface colour, the card radius on its top corners, a
hairline) that holds: an 18dp mark, the heading one size below Welcome's
(semibold at 20dp), one line ("Keep your training, nutrition and progress
synced across devices."), Continue with Google raised one surface so it
reads on the sheet, Continue with email as the primary amber button (the
translucent tertiary fill was judged cheap), the sign-in text action, and
a quiet in-app Privacy policy link. The marketing trust line is gone from
this screen. The back chevron sits on a round half-alpha scrim so it reads
over the capture. `PrivacyPolicy` is now registered in the pre-account
stack so the link works before sign-in; `OAuthButtons` gained a `raised`
prop. Sign-in mode uses the same sheet with the fields open.

**Third pass, founder direction the same day: STOP iterating the route;
authentication is a sheet over Welcome.** The second pass (capture plus
sheet on its own route) was ruled busier, not more premium: a website
authentication template. The model now: Welcome sells; tapping Get
started raises a bottom sheet over the same Welcome (scrim-dimmed, still
legible), and the sheet holds only the task. Built on the app's own
`BottomSheet` (surface panel, card radius top corners, hairline, handle,
backdrop and hardware-back dismiss, keyboard-aware) as
`components/auth/AuthSheet.js`, which carries every former LoginScreen
handler verbatim (OAuth, email sign-up and sign-in, duplicate-address
and confirm-email notices, password reset; log keys unchanged). Content:
"Create your account", one line, Continue with Google (raised one
surface), Continue with email (primary amber), "Already have an account?
Sign in", Privacy policy. Continue with email expands the SAME sheet into
the form with a Back control to the options; Sign in opens the sheet as
"Welcome back" with the fields visible, Forgot your password and "New
here? Create an account". No mark, no artwork, no trust line, no second
pitch inside the sheet. Fields use a new compact `TextField` size (48dp,
the touch floor) rather than the 50dp default plus label spacing that
read as oversized. The Login route still exists for the app's other
entry points (PlanPreview's account wall, deep links) and renders
Welcome with the sheet already open; closing it pops back when the route
was pushed. Terms of use is not linked because the app has no terms page
of its own (the web site carries only a privacy page); flagged, not
invented. The Train backdrop capture is deleted. Rendered as four
sequential states beside the approved Welcome before landing.

## D146 — The setup wizard points at what is missing (founder request, 2026-09-04)

**Ask.** "Highlight things that are not filled in; when they get to the
end and it is not filled in, bring it back or highlight; ensure all the
boxes display the same; research how other apps do this; do they
highlight the next one; make ours slicker."

**What the wizard did.** Continue was greyed out until every required
field passed, with one generic sentence under it ("Complete your sex,
age, height and body weight to continue") that never said which box.
The range checks fired as modal alerts. No field anywhere in the wizard
had an inline error state. The late bounce-back from step 7 dropped the
user on step 2 with an alert and no marked box. Step 2 mixed a
hand-rolled 28dp unit toggle with the shared 44dp SegmentedControl,
carried inert per-field style overrides on every TextField, and its two
paired rows had different proportions (equal halves for ft/in, 2:3 for
stone/lbs). Step 6 had a gate but no hint at all. Inventory with
file:line evidence in the session record.

**Research (published guidance, not opinion).** NN/g: errors belong next
to the field; a summary alone forces the user to hunt; validate when a
field is finished, never mid-keystroke, and do not steal focus while
someone is typing. Material 3: an error state is the border in the error
colour plus a single-line message that replaces the helper text, with an
icon or word so it does not rely on colour alone; mark the minority
(required or optional) once, not every field. The disabled-button
literature: never grey the submit out silently; keep it enabled, validate
on tap, scroll to the first error and say what is wrong. Premium fitness
onboarding (the one-question-per-screen kind) makes "next" implicit; the
multi-field kind chains focus with Next and marks gaps on submit. Nobody
auto-highlights "the next empty box" before the user has tried: it nags.

**Ruling.**
1. Continue is never greyed out on a gated step. A tap with a gap marks
   the step attempted, every missing box takes the error state with a
   one-line calm message ("Choose your biological sex.", "Enter your age,
   13 to 100."), the first gap is scrolled into view and, if it is a text
   field, focused, a warning haptic fires once, and the line under
   Continue names what is still needed ("Still needed: biological sex,
   height."). Errors clear live as each box is filled. Before the first
   attempt nothing is red.
2. The gate itself is unchanged and stricter: one validator per step
   (validateStep2/4/6/7) is both the display source and the block, and
   advanceFromN returns on any gap before setStep. Biological sex still
   blocks progression with no default and no tap-through; the guard
   tests moved from "the button is disabled" to "the press never advances
   past a missing sex", which also covers the late bounce-back (the
   baseline step now arrives with its gaps already marked).
3. One inline error line, `FieldError` (icon plus caption in the error
   colour, announced politely), used by TextField, Dropdown and beside
   SegmentedControl, each of which gained an `error` prop that colours
   its border. Paired fields share one message.
4. Step 2 is one control family: both unit pickers are the shared
   SegmentedControl above their inputs, the hand-rolled toggle is
   deleted, the inert per-field overrides are deleted, and paired inputs
   share the row equally.
5. Not done, on purpose: no "next field" spotlight before an attempt, no
   asterisks (the optional boxes are already marked), no progress
   counter. Focus chaining from the name field to age was added; the
   numeric pairs already chain through the iOS Next bar.

**Engine, ED-safety, consent, billing: untouched.** Step 3 (optional body
fat) has no gate and gained no error state.

## D147 — The plan-generation card never moves; completion is a payoff in place (founder direction, 2026-09-04)

**Verdict.** "The card begins compact and grows downward as stages are
added; it looks mechanical, like rows appended to a debug panel." Hard
rule: from the moment generation begins to the moment it completes, the
logo, the progress line, the heading and the card keep their position and
the card keeps its size. And completion must be payoff, not the old
"You're all set" instruction page.

**Built.**
- Every stage row is rendered from the first frame in a fixed-height row
  (upcoming: dim ring and 55% text; current: small spinner and full-weight
  text; done: a restrained amber tick that fades in). Only the status
  treatment animates, 200ms opacity, on the native driver. No slice, no
  appended rows, no card growth. Stage copy is one line each so the rows
  keep one height ("Setting each muscle's weekly work", with the division
  name where one applies).
- The card is a charcoal surface with a hairline, not the 1.5px outlined
  box. The payoff is laid out under the stage content at zero opacity from
  the start and measured, so the card reserves the taller of the two
  before anything is seen.
- When the last stage completes: every tick shows, a 500ms hold, the
  ready haptic, then a 220ms crossfade of the card's content to: "Plan
  ready" eyebrow, "Your plan is ready", the goal and phase, the split and
  days, the block shape, "Your targets and weekly check-in are ready
  too.", and See my plan. Every value is read from the plan that was
  written (goal and phase labels, the programme's split type through
  SPLIT_LABELS, the wizard's days, BLOCK_PLANNED_WEEKS); anything
  unreadable is left out, never invented.
- See my plan completes first run and lands on the Train tab (a one-shot
  `postSetupLanding` the tab navigator reads at mount), because the one
  thought at that moment is "show me what you made". The old completion
  screen is no longer visited on success; it remains the destination when
  generation fails, since it owns the no-plan state. Morning weighing,
  food logging and the weekly check-in are taught in the product (the
  Home welcome card and the coach surfaces), not at this beat.
- Reduce Motion runs the same card with every transition instant; it used
  to get a bare spinner instead.

**Reviewed as an animation, not screenshots.** The card was prototyped
at exact token values, recorded with the real timings, and watched:
nothing outside the card moves; the card's box does not change between
the first stage and the payoff. The recording and a filmstrip were
delivered in chat; the animated artboard sits beside the launch screens
on the design canvas with a Replay control.

**Engine, ED-safety, consent, billing: untouched.** Generation itself,
its idempotence record and its failure handling are unchanged.

## D148 — Amber is accent, not "this is a button": the action hierarchy (founder brief, 2026-09-04)

**Verdict.** The founder's brief: orange has been doing two jobs, brand
accent and "this is tappable", so every filled amber button competes with
every other and the accent stops meaning anything. Orange is for accent,
selection, emphasis and identity. The Coach root (YouScreen) is the
reference: it has no amber-filled buttons at all and reads as the most
premium screen in the app. Every other screen moves toward it. Do not
overcorrect: touch targets, contrast and the few genuinely decisive
moments keep their weight.

**Inventory (read agent, Sonnet, full tree).** 307 shared `Button` uses;
145 of them (124 default plus 21 explicit `primary`) rendered as filled
amber, about half of every button in the product. Plus 26 hand-rolled
amber fills across 14 files (FoodSearch, FoodDetailSheet,
CuratedMealSheet, ExercisePickerModal, PlanDetail, BodyMetrics,
ExerciseDetail, WorkoutSummary, ScanBarcode, ScanLabel, Quiz,
PlanLibrary, Diary, ActiveWorkout) and one FAB (Diary scan).

**The hierarchy (`src/components/Button.js`, five tiers).**
- **emphatic** — amber fill, dark text. The one decisive, usually
  once-per-journey action on a screen: Get started, Create account and
  Sign in, Build my plan and See my plan, Start training, Create an
  account to keep it, Agree and get my code, Agree and save, Create plan
  and add workouts, Start next block, Import N sessions, the goal-lock
  Save/Continue, Set active, the plan-preview confirm, Create workout.
  Sixteen marks in fourteen files, pinned by an allowlist in the guard.
- **primary** (the default) — raised surface: `surface2` fill, `border`
  hairline, white label, amber leading icon. The routine forward action:
  Start workout, Log set, Finish, Mark eaten, Save, Continue, Add.
  Reads as the main button on its card without shouting.
- **secondary** — flat `surface`, `border`, secondary text. Options,
  View plan, Cancel-adjacent.
- **tertiary** — amber tint (`primaryBg`) with an amber edge and amber
  text. Accented but not filled: a favoured choice, an in-card action.
- **icon / FAB** — the Diary scan FAB is a raised surface with an amber
  glyph. Amber sits on the icon, the disc stays neutral.
- destructive and outline are unchanged.
Haptics: the selection tick fires on primary and emphatic, nothing else.
Icons take `iconFg` so a raised button's icon can be amber while its
label stays white.

**What changed on screen.** Today card Start workout, Train Start next
workout, Active workout Log set / complete / superset / keep-training /
stale-resume, Nutrition Mark eaten and the scan FAB, the diary planned
banner, the empty-exercise Add, the ghost-capture controls, the wizard's
primary label override, and the fourteen hand-rolled files listed above
(migrated to the shared `Button` where a shared button already sat
beneath, else to the same surface2 + border + white label recipe).
Partner: the support-plan action pill and the favoured invite channel
moved to the tint tier.

**Deliberately still amber, and why.**
- The emphatic set above: one decisive action per journey.
- `AppAlert` confirm: a modal with one answer; the amber says "this is
  the answer", and it is the only fill on screen.
- Article 9 consent CTA: the un-skippable gate's single action; the gate
  must read as the one thing to do (Section 2, GDPR).
- Coach ED-lockout CTA (`CoachOutputScreen.edLockoutCtaPrimary`): the
  safety path's only button; ED-safety surfaces are not restyled without
  a founder decision.
- Nutrition targets Calculate: the single act the screen exists for,
  with a neutral disabled state.
- The label-scan shutter (`ScanLabelScreen.captureBtn`): the one control
  on a full-screen camera, an amber ring inside the conventional white
  shutter ring; it is the emphatic tier in camera clothing.
- Everything that is selection or state, not a button: the active tab,
  the active exercise chip, hour chips, opacity presets, timer chips,
  the selected history day, the current block dot, radio dots, step
  dots, badges, the calorie ring and macro bars, the rest-timer drain,
  the cheer pill (a celebration, not a form action), the beta badge.

**Coach-screen consistency.** YouScreen was already at the target: zero
`Button`s, zero amber fills, amber only on icons, the selected state and
the wordmark. It was left untouched and used as the bar.

**Accessibility.** Every raised button keeps its 48dp minimum height and
padding; white on `surface2` (#2A2A27) is 14.4:1, amber text on the
12% tint is 8.0:1 over the background and 7.0:1 over a surface, all
past AA (computed from the theme tokens). The hairline border keeps the
raised tier visible as a control without relying on colour alone. The
emphatic tier is unchanged (dark on amber, 7.3:1).

**In-app splash.** With the Welcome screen carrying the product, the
in-app splash is a bare background (the native splash still covers the
first paint). The guard that measured the splash hero now pins the bare
container.

**Engine, ED-safety, consent, billing: untouched.** No engine module,
floor, gate, consent path or billing surface changed.

## D149 — No splash screen at all: straight into Welcome (founder, 2026-09-05)

**Founder order.** "No splash screen at all, just into the new welcome
screen."

**What was observed.** Two things stood between launch and Welcome. The
native expo-splash-screen frame carried the V wordmark at 220 px on
charcoal. And RootNavigator held that frame for a fixed minimum of 1.6 s
(`SPLASH_MIN_MS`) for every first-run user, a "brand hold" whose stated
purpose was to mask exercise seeding; the seeding is fire-and-forget in
`attemptDbInit` and nothing Welcome renders depends on it, so the hold
was pure delay. Returning users had already been released on the
readiness flags alone (E8, 2026-07-02).

**What cannot be done.** Both platforms insist on a launch frame: iOS
draws the launch storyboard until the first frame is ready, and Android
12+ draws the system splash (background plus an icon slot) on every cold
start. Neither can be switched off from the app. Stated as a fact about
the platforms, not a choice.

**Ruling.** The nearest honest thing to "no splash" is a plain charcoal
frame, which is also what the iOS guidelines ask a launch screen to be
(a placeholder that resembles the first screen, never a branding moment):
- The plugin's image (light and dark) is a fully transparent PNG
  (`assets/volyume-splash-blank.png`), so the OS frame is the app
  background and nothing else. The Android icon slot is empty rather than
  the launcher icon.
- The 1.6 s hold is gone. `splashReady` releases on the readiness flags
  for first-run users exactly as for returning users. There is no
  minimum splash time anywhere.
- The native frame still lifts only when the boot gate resolves (DB open,
  first-run and tier checks, the one-shot auth latch), so the 2026-07-12
  signed-in flash of Welcome cannot return, and the 400 ms fade
  (`App.js`, `SplashScreen.setOptions`) carries charcoal into the first
  screen.
- The old wordmark and hero splash assets are deleted; the guard
  (`splashLogoAsset.guard.test.js`) now pins the blank asset, its full
  transparency, the absence of the old assets, and the absence of any
  minimum hold.

**Part 2 (same day, founder reaffirmed "no splash screen, straight into
the welcome screen").** On a fresh install the charcoal frame still
lasted the whole database open plus every local migration from
`user_version` 0, because the boot gate refuses to render anything until
the session restore answers (Campaign 24 law: never speculatively render
logged-out UI). Ruling: a VERIFIED fresh install opens on Welcome at the
first frame.
- Two network-free probes run at boot: the owner marker
  (`@volyume_last_supabase_user_id`, AsyncStorage) and the stored auth
  session (the supabase-js keychain item `sb-<ref>-auth-token`,
  `hasStoredAuthSession` in `src/lib/supabase.js`). Each answers
  'present', 'absent' or 'unknown'; every failure is 'unknown'.
- `classifyFreshInstall` (`src/lib/authBootGate.js`) says 'fresh' only
  when BOTH answered 'absent'. Any 'present' or 'unknown' holds the
  frame exactly as before. This refines the Campaign 24 law rather than
  breaking it: the law protects a device that MIGHT be signed in; a
  device with no session token and no owner marker cannot be.
- RootNavigator: `freshInstallOpen` still requires the fast AsyncStorage
  flags (first-run, tier) and bypasses only the auth latch; the native
  frame lifts on `bootGateResolved || freshInstallOpen`; the tree
  rendered is the same one the resolved gate renders, so nothing
  remounts when the latch lands. The retry branch, the DB-failure
  screen, and every post-auth route (Article 9 gate included) are
  unchanged and unreachable from the open.
- Guards: the fresh-install truth table and wiring pins in
  `authBootGate.test.js`; the probe in `supabase.storedSession.test.js`;
  the gate, hide and DB-recovery guards re-anchored to the new literals.

**What the user sees.** Fresh install: the OS icon animation, then
Welcome, with the database opening behind it. Returning user: a charcoal
frame for as long as the session restore takes, then Today. Nothing
reads as a splash screen.

**Engine, ED-safety, consent, billing: untouched.**

## D150 — The live PR callout: a restrained milestone, not a warning banner (founder brief, 2026-09-05)

**Founder brief.** The Active Workout direction is right; do not redesign
the logger. One element sat below the rest of the active-set card: the
"Record set if you hit this" row under the weight/reps controls. Keep its
place and the set-entry workflow; fix the visual treatment and the copy.
Named faults: a muddy olive fill that read as a warning, a loud yellow
headline competing with the inputs, supporting text that read as raw
engine output, awkward wording, and the trophy repeated on the Log set
button.

**What was observed (D87 as built).** `SetEntry.js` rendered the row as a
gold tint (`withAlpha(gold, alpha.soft)`), a 15 px gold trophy and a gold
`label` headline, then every reason joined on one caption line with
"best is" / "beats" phrasing straight from the detector. The bottom bar's
primary took `primaryIcon='trophy'` whenever `recordLine.isRecord` held
(guarded in `loggerVisualArchitecture.guard.test.js`). The Last session
strip directly above the steppers (`NowCard.prefillRow`) is surface2 on
the card's surface with a hairline, radius.md, spacing.md inset and a
36 dp minimum: the silhouette the callout did not share.

**Ruling.**
- **Shell.** The callout takes the strip's exact shell: surface2 fill,
  `borderSubtle` hairline, `radius.md`, spacing.md horizontal inset,
  spacing.sm vertical, 36 dp minimum, and a spacing.xxs top margin so it
  sits the card's own 4 dp step below the steppers, as the strip sits
  above them. No tinted fill anywhere. The rows that bracket the steppers
  now share one silhouette and one left edge.
- **Accent.** One small amber trophy (`iconSize.sm`, `colors.primary`),
  lifted `spacing.hair` so the 16 px glyph is centred on the headline's
  18 px line. Amber, not gold: the founder asked for amber, D148 made
  amber the app's accent, and the yellow was the loudness complained of.
  The PR celebration toast that follows the log is unchanged.
- **Type.** Headline in `label` at `textPrimary`; each record on its own
  `num('caption')` line at `textSecondary`. Nothing in the callout is
  louder than the numbers in the steppers.
- **Copy.** Headline: "New PR if you complete this set". "PR" per the
  2026-07-23 ruling (D88: "personal record" in prose, "PR" in chips and
  badges; "personal best" is a streak term here), so the founder brief's
  "PB" is translated, not adopted. Each record line follows one pattern,
  "<what this set would be> · Previous best <the number it beats>":
  "Heaviest weight yet · Previous best 90kg"; "Most reps at 92.5kg ·
  Previous best 8 reps"; "Est. max ~130kg · Previous best ~126kg";
  assisted machines: "Least assistance yet · Previous best 25kg" and
  "Most reps at 25kg assistance · Previous best 6 reps". The numbers are
  detectPR's own value/previousValue, so nothing is fabricated and the
  D87 agreement contract (the line reuses detectPR over the same history
  the log path assembles) is untouched. Simultaneous records stack as
  separate lines rather than one run-on caption. Verified through the
  real component: two is the most the detector awards at once (a
  heaviest weight has no prior set at that weight, so a most-reps record
  cannot coincide with it), so the callout is one headline plus one or
  two lines.
- **Log set trophy: retired.** It appeared only when a genuine record was
  dialled in, so both states were compared. With the callout now sitting
  directly above the bar in the same visual system, the second trophy
  added nothing but a second place to look; Log set is an action, not an
  achievement. The bar's `primaryIcon` prop remains for other callers;
  the screen no longer passes it. Label and spoken label unchanged
  (R4/D64 same-string rule).

**Bounds.** Presentation and copy only. `buildRecordLine`'s gates (warm-up,
ballistic, non weight-and-reps schema, empty history) and its use of
detectPR are unchanged; no engine, threshold, ED-safety, consent or
billing code is touched. Guards: `workoutRecordLine.test.js` (copy
contract, one pattern per line, retired phrasing absent) and
`loggerVisualArchitecture.guard.test.js` (no trophy on the primary).

## D151 — Exercise list current row, exercise sheet polish, and the instruction contract (founder brief, 2026-09-05)

**Founder brief.** Preserve the active-workout exercise list architecture
(counts, check state, current state, instant switching, hierarchy); test a
more restrained current-row treatment than the full-row amber fill. Keep
the exercise detail bottom sheet's interaction; refine typography,
spacing, metadata ("Back · Cable", not "Back - cable"), instructional copy
and accent restraint. Audit every built-in exercise instruction under a
shared content contract (original, accurate, concise, British, useful at
the rack, no AI prose, consistent Setup / Execution structure, no
automatic mistakes or anatomy sections) using scripts and agents for
coverage, with the lead reviewing samples and ambiguous movements.

**What was observed.**
- `WorkoutOutline.js`: the current row was `primaryBg` (12 % amber) across
  the full row plus an 8 px amber dot and a semibold name; every other
  surface in the refined system separates with a tonal step, not a tint.
- The exercise info sheet showed `Back - cable` from the raw enum, a
  captionStrong "How to do it" label and one `bodySm` paragraph in
  `textSecondary`; the adjusted/eased box was an amber-tinted card with a
  37 % amber border.
- Instructions: every one of the 918 live corpus rows carried a single
  `cue` string written under EL-17 as setup, execution, then the one fault
  (187 to 240 characters; validated for British spelling, banned words, no
  em dash). But `src/lib/formTips.js` still held a 545-entry hand-written
  `FORM_TIPS` map that took precedence over the cue on BOTH surfaces: long
  paragraphs, en dashes, safety wording ("protect your joints", "rotator
  cuff health"), a different register from the other ~373 rows. The
  detail screen also rendered the cue a second time in an amber "bulb"
  card above the numbered steps. Measured over the split cues: setup 28 to
  160 chars, execution 29 to 146, watch 24 to 111 (885 rows carried one);
  no filler phrases, no dashes; 264 watch lines ended in a bare label
  ("... is the common fault.") with no consequence or correction.

**Rulings.**
1. **Current row.** `surface2` on the outline's surface, the same tonal
   step the Last session strip and the record callout use; the amber dot,
   the semibold white name and (new) a white set count mark the row. No
   edge stripe: the NowCard accent stripe was retired as decoration on
   2026-08-17 and the dot plus band plus weight already read unambiguously.
2. **Sheet.** Metadata renders `${muscle} · ${equipmentDisplayLabel}` with
   the shared display labels (Smith machine, Resistance band, Plate-loaded
   machine). Instructions render as a labelled stack: Setup, Execution and,
   where present, Watch; label `captionStrong` muted, body `bodySm` in the
   primary ink because it IS the sheet's content; sections spaced
   `spacing.md`. A routine's own exercise note renders first as "Plan
   note" instead of replacing the instructions. The adjusted/eased box is a
   tonal surface with a hairline; amber stays on the prescription line and
   section titles. Fallback copy for a custom exercise is one calm line.
3. **Instruction contract.** Every live corpus entry carries `setup`
   (required, 25 to 160 chars, at most two sentences), `execution` (same)
   and an optional one-sentence `watch` (20 to 120 chars) that names the
   fault that most changes the lift AND what it costs or what to do
   instead; a bare "is the common fault" tail is a violation. All fields:
   capital start, full stop end, no em or en dash, no exclamation or
   question marks, no set or rep counts, the banned safety/medical words,
   the filler list, British spelling. The rule lives once in
   `src/lib/exerciseCorpus/instructionContract.js` and is read by the
   validator (rule 10), the Jest mirror and the corpus index. The `cue`
   column is derived as the joined paragraph so legacy readers are
   unchanged; no entry carries a `cue` literal. `scripts/exercise-library/
   split-cues.mjs` performed the one-off mechanical split;
   `audit-instructions.mjs` is the reviewer's per-family view.
4. **FORM_TIPS retired.** One source of instructions per exercise. The
   detail screen's duplicate cue card is removed; custom exercises keep
   the numbered-steps rendering of their own notes.
5. **The watch line is kept, on merit, not by default.** The founder brief
   says not to add "common mistakes" automatically. These lines were
   authored per movement under EL-17, and a single specific fault with its
   consequence is what a coach says at the rack. The contract makes the
   line earn its place (specific, consequential, one sentence) and lets an
   agent delete it where nothing does; the surfaces render it only when
   present. Reversal is one condition in the two renderers if the founder
   prefers Setup and Execution alone.
6. **Audit execution.** Agents on Opus, two at a time, one lane per family
   group, editing only their family files against the brief
   (`INSTRUCTION-BRIEF.md`); the lead reviewed representative before/after
   pairs, the ambiguous lists and the least-sure lists. Figures at
   landing are in the audit report
   (`docs/exercise-library-expansion-2026-09-05/data/instruction-audit.json`)
   and in the taskboard block. `METADATA_REDERIVE_KEY` bumped to v4 so
   existing installs take the rewritten text once.
   Landing figures: 918 live rows, 0 contract violations, 916
   rows carry a watch line; 558 rows changed by the lanes plus 8 by the
   lead's hand pass. Accuracy corrections found by the read-through
   rather than the contract: neck harness extension/flexion had their
   load positions reversed; the sled row faced away from the sled; the
   barbell glute bridge described a hip thrust; the axle deadlift called
   the bar wide; the dumbbell windmill was written for a kettlebell; and
   about fifty rows across barbell, dumbbell, kettlebell, bodyweight and
   cable carried the whole movement in setup with a fault sentence as
   the execution. Near-duplicate live pairs flagged by every lane are
   queued for an EL-21 retirement ruling on the board, not merged here.

**Bounds.** Presentation, copy and content only. No engine, threshold,
ED-safety, consent, billing, schema or sync change (canonical exercises
are local and never pushed, EL-19).

## D152 — The injuries / limitations feature is called "Injuries & limitations"; whole-product certification rulings (lead-ruled under D33 on a founder brief, 2026-09-05)

**Founder brief (in chat, 2026-09-05).** One autonomous whole-product
adversarial certification: discover, attack, prove, fix, re-exercise,
certify. It names one confirmed P1: the feature covering injuries, pain,
long-term conditions, disabilities and temporary limitations is surfaced
as "How you train", which a normal person reads as split, frequency,
style or equipment, and its populated line says "Built around 4 things
you told it". The brief's naming direction is "Injuries & limitations",
with the lead to verify coverage.

**Ruled.** The feature is "Injuries & limitations" on every entry row,
screen title and step label, and the vocabulary table in
`docs/final-certification-2026-09-05/07-FINDINGS.md` (F-01) governs every
mid-sentence use. The word "limitation" names what the lane actually
stores: functional limits on movement (an axis, a family, an exercise),
whichever cause lies behind them. The subtitle names all four
causes so nobody classifies themselves at the door. This overrides RT2-2
and D134's "the NAME stays". **Founder ruling (in chat, 2026-09-05):
"injury" and "disability" may be used freely, on long-term rules too; the
D112 R6 lane-vocabulary rule no longer constrains copy.** The baseline
role reads "long-term" (the wizard asks "Is this long-term, or
temporary?") because it is the clearer question, not because of the old
rule; the live-session badge is "Limitation"; the episode vocabulary is
unchanged.

The populated line: a subject where two or fewer rules are nameable
("Leaves out overhead work and gripping a bar"), otherwise "N injuries or
limitations saved. Used when Volyume picks exercises and builds your
plan." The count
is restriction rows only; allowances are not "things it is built around".
"Things you told it" is retired and guard-banned. The claim in the new
copy is exactly what the consumers do: generated plans, the picker, swaps,
the live session and library-plan compatibility consult the lane; weekly
coaching, notifications and Progress do not consult baseline rules and the
copy does not say they do.

**Also ruled in the same campaign (record F-02 to F-20 in 07-FINDINGS.md):**
library-plan activation must carry circuit structure and tags (P0, fixed);
kettlebell progression snaps to real bell sizes; advice never rests on
excluded evidence (ballistic, circuit); the live logger speaks in rounds on
a circuit; serve-time capability substitution respects style pool and
equipment; Adjust plan says before it flattens a circuit; kettlebells and
bands get an honest route at the equipment question if generation can
build from them; Today gets a week-complete state and never re-offers
session 1 after a block ends; widget taps open the app; partner invite
links route; Methodology tells the truth about Coached mode; search ranks
staples by word-start match and staple tier.

**Unchanged by ruling.** Route ids, file names and function names
(`HowYouTrain*`, `howYouTrainSummary`); the quiz-first pre-account branch
behind `ONBOARDING_QUIZ_FIRST` (documented, reversible, deleting half of
it would make the flag a lie); the Settings row (D134 placement); the
ED-safety system, the deterministic engine, the free product, billing
dormancy, identity, schema rules.
## D153 — The setup weight is today's morning weight; the Log label was invisible (founder device report, 2026-09-06)

**Report.** "The first ever morning weight from onboarding doesn't
always populate; when it doesn't, the log button is an empty shell."

**What was observed.** Setup writes today's `morning_weights` row with
an `enrolment` marker. Under C5-P22-01 (a lead ruling, D96) the Today
weigh-in strip deliberately treated a marked row as not logged, so day 0
always showed the empty strip with the typed figure as a prefill.
CORRECTION (founder, same day: both cases were fresh users straight
through setup): the "sometimes populated" case was a race inside setup
itself. Setup wrote today's row twice, first through the body-metric
write-through WITHOUT the marker, then with it; each write fired its own
fire-and-forget cloud push, the cloud stamps `updated_at` at push time,
and the two pushes could land in either order. When the unmarked push
landed last, the next pull's last-write-wins replaced the local row with
the unmarked copy and Today read the weight as logged. Fix: the marked
write goes first and the write-through preserves an existing row's
notes, so both pushes carry the marker and their order cannot change
the row's meaning. Known wider limitation, mentioned not fixed: any two
rapid edits of the same synced row can reorder the same way because the
push stamps its own time; per-row push serialisation or a true
local-edit timestamp in the payload is the general fix. And the strip's
edit-mode Log label still carried the
dark-on-amber colour from before the D148 hierarchy, so on the raised
charcoal primary it was dark on dark: the "empty shell".

**Ruling.** The founder's verdict reverses the display half of
C5-P22-01: the weight typed during setup IS today's morning weight on
Today, so day 0 shows "Morning weight 89 kg" in the evidence panel and
no empty strip. The claim half stands: the marker stays on the row, the
weekly check-in's own "weighed today" logic still does not count a typed
figure, the strip's first-use sentence still waits for a real weigh-in,
and the check-in gate is unchanged. A real weigh-in or a Health import
overwrites the row as before. The Log label uses the primary tier's
foreground. Pins re-anchored in `campaign5.firstUse.test.js`.

## D154 — Kettlebells reach generation through the kit the person named, never by tier (lead ruling under D33, 2026-09-06)

**Report.** Founder, after Sentry VOLYUME-28 on iOS 1.3.5+64: kettlebell
exercises "missing from the plans in the library and probably on the
engine and plan builder too. Check all the new ones".

**What was observed.** Library: the seed race (routine seed ran before
the corpus top-up inserted the kettlebell and band rows) created the
kettlebell and band library plans with stations missing; fixed on main
(seed awaits the exercise chain, plans repair in place). Every exercise
name in all 57 library plans resolves against the live corpus. Builder:
the picker offers the Kettlebell chip and all 59 rows. Engine: a
kettlebell style plan (the F-16 REVISED route: the "Kettlebells"
onboarding answer installs the library plan, and Update plan regenerates
inside its style pool) fills 9 of 9 slots with kettlebell rows. ORDINARY
generation reached 0 kettlebell slots in 36 real runs across all six
equipment profiles: only Kettlebell Goblet Squat and Kettlebell Row
(Single-Arm) are COMMON in the C16 registry; the 40 grinds are
SPECIALIST or NICHE, and the recognisable gate prefers STAPLE/COMMON
whenever enough of them can fill the session.

**Ruling.** No tier change. The profiles that admit kettlebell rows
(full_gym, dumbbells_only, home_gym) do not know whether the person owns
a kettlebell: raising the grinds to COMMON would hand kettlebell presses
and lunges to dumbbell-only and home-gym users who never said they have
one, which is a wrong prescription, not a richer one. The kit the person
NAMES is the only honest trigger, and that path (kettlebell answer,
style pool, swap sheet, picker chip) is complete and verified. C16
(staples first) and EL-11 (ordinary plans never receive kettlebell
content because it exists) stand. Sandbag (8 rows, none COMMON) is
ruled the same way; medicine ball and sled stay out under EL-4 and
EL-22.

**Founder fork, open.** If ordinary home-gym plans SHOULD draw on
kettlebells, the product change is an equipment inventory (a "which of
these do you own" answer that adds kettlebell rows to the person's own
pool), not a tier edit. Put to the founder in chat as a multiple-choice
question; no work started.
