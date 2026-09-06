# 05 — Recon: programme model, exercise identity, copy and adaptation APIs

READ-ONLY recon for the Social / Community / Discovery campaign
(`docs/social-discovery-2026-09-06/README.md`). Everything below is what
EXISTS today, with `file:line`. No recommendations, no new engine code.

Verified against the tree at 2026-09-06. All line numbers are from the
files as they stand on this checkout.

---

## 1. The plan data model

### 1.1 The three tables (local SQLite, `src/lib/database.js`)

A "plan"/"programme" is `programmes` -> N `routines` (days) -> N
`routine_exercises` (rows in day order). There is no separate "blocks"
table inside a plan; a training block (`mesocycles`) is created ON
ACTIVATION and points at nothing structurally (see §7).

`programmes` — base at `src/lib/database.js:294`, extended by ALTERs:

```
id TEXT PRIMARY KEY, user_id TEXT, name TEXT NOT NULL, description TEXT,
is_library INTEGER DEFAULT 0, created_at INTEGER, updated_at INTEGER
-- + ALTERs:
is_active INTEGER DEFAULT 0            database.js:485
next_workout_index INTEGER DEFAULT 0   database.js:486  (INERT, see :5313 tombstone)
tags TEXT                              database.js:487  <-- style + audience tags
split_type TEXT                        database.js:488
is_archived INTEGER DEFAULT 0          database.js:489
difficulty INTEGER                     database.js:576
source_programme_id TEXT               database.js:720  <-- provenance
deleted_at INTEGER                     database.js:797
folder_id TEXT                         database.js:1566
```

`routines` (one per training DAY) — base at `src/lib/database.js:280`:

```
id, user_id, name, description, split_type, is_active DEFAULT 1,
is_library DEFAULT 0, is_sample NOT NULL DEFAULT 0, source_routine_id,
programme_id, created_at, updated_at
-- + ALTERs:
is_template INTEGER DEFAULT 0  database.js:490
day_of_week INTEGER            database.js:719
deleted_at INTEGER             database.js:796
position INTEGER               database.js:1831  <-- day order within the plan
```

`routine_exercises` — base at `src/lib/database.js:303`:

```
id, routine_id, exercise_id, order_in_routine DEFAULT 0,
recommended_sets DEFAULT 3, recommended_reps_min DEFAULT 6,
recommended_reps_max DEFAULT 12, notes, created_at, updated_at
-- + ALTERs:
starting_weight REAL        database.js:468  <-- PERSONAL LOAD (see §5)
rest_seconds INTEGER        database.js:469
superset_group_id TEXT      database.js:470  <-- group membership
updated_at / deleted_at     database.js:798-799
exercise_name TEXT          database.js:800  <-- denormalised fallback name
user_id TEXT                database.js:1158
selection_reason TEXT       database.js:2433 (planEngine SELECTION_REASON code)
group_kind TEXT             database.js:2794 <-- 'circuit' | NULL (= superset)
round_rest_seconds INTEGER  database.js:2795 <-- circuit between-round rest
```

There are NO JSON columns on the plan tables. The only JSON-bearing
plan-adjacent columns are `mesocycles.rir_ladder` (`database.js:527`,
e.g. `'[3,2,1,0,4]'`), `mesocycles.block_ledger` (`database.js:2146`) and
`exercises.secondary_muscles` / `equipment_profiles` / `aliases`.

### 1.2 The circuit model (EL-9), verbatim from the migration header

`src/lib/database.js:2769-2796`:

```
//   evidence_class      NULL = conventional | 'circuit' | 'ballistic' |
//                       'circuit_ballistic'. Stamped at WRITE time by the
//                       live screen from structure (group_kind) and
//                       exercise metadata (load_character), never chosen
//                       by the user (EL-7).
```

Rounds are NOT a separate column: a circuit's ROUND COUNT is the group's
`recommended_sets`, read from the group's FIRST station
(`src/lib/circuitRound.js:82-90`, "Rounds are read from the group's FIRST
station: EL-9 keeps rounds equal within a circuit").

### 1.3 Concrete example — one circuit day and one straight-sets day

Library source shape (`src/lib/seedRoutines.js:2280-2292`, plan 35
"Full-Body Circuit: Dumbbells"):

```js
tags: 'style:circuit_dumbbell circuit equipment:dumbbell home full_body goal:build_muscle days:3 short beginner intermediate',
{ name: 'Goblet Squat', sets: 3, repsMin: 8, repsMax: 12, rest: 0,
  notes: 'Circuit 1, station 1. …',
  supersetGroupId: 'circuit1', groupKind: 'circuit', roundRestSeconds: 90 },
```

The same day as ROWS in `routine_exercises` (what a share payload would
have to carry), circuit group of three stations x 3 rounds, 90s round
rest, plus a fourth straight-sets exercise:

```json
[
 {"id":"re_a1","routine_id":"rt_1","exercise_id":"<canonicalExerciseId('Goblet Squat')>",
  "exercise_name":"Goblet Squat","order_in_routine":0,"recommended_sets":3,
  "recommended_reps_min":8,"recommended_reps_max":12,"rest_seconds":0,
  "superset_group_id":"circuit1","group_kind":"circuit","round_rest_seconds":90,
  "starting_weight":null,"selection_reason":null,"notes":"Circuit 1, station 1. …"},
 {"id":"re_a2","routine_id":"rt_1","exercise_id":"<id('Push-Up')>",
  "exercise_name":"Push-Up","order_in_routine":1,"recommended_sets":3,
  "recommended_reps_min":8,"recommended_reps_max":12,"rest_seconds":0,
  "superset_group_id":"circuit1","group_kind":"circuit","round_rest_seconds":90},
 {"id":"re_a3","routine_id":"rt_1","exercise_id":"<id('Dumbbell Row')>",
  "exercise_name":"Dumbbell Row","order_in_routine":2,"recommended_sets":3,
  "recommended_reps_min":8,"recommended_reps_max":12,"rest_seconds":0,
  "superset_group_id":"circuit1","group_kind":"circuit","round_rest_seconds":90},
 {"id":"re_a4","routine_id":"rt_1","exercise_id":"<id('Barbell Back Squat')>",
  "exercise_name":"Barbell Back Squat","order_in_routine":3,"recommended_sets":3,
  "recommended_reps_min":5,"recommended_reps_max":8,"rest_seconds":120,
  "superset_group_id":null,"group_kind":null,"round_rest_seconds":null,
  "starting_weight":null}
]
```

An ordinary SUPERSET is the same shape with `group_kind: null` and a
shared `superset_group_id`. A straight-sets row has all three group
fields NULL. Every reader takes these via `?? null`
(`src/lib/database.js:2775-2785`), so an absent column degrades to
"ordinary superset / no group / conventional evidence".

Straight-sets library source for contrast (`src/lib/seedRoutines.js:76`):

```js
{ name: 'Barbell Back Squat', sets: 3, repsMin: 5, repsMax: 8, rest: 120,
  notes: 'Feet shoulder-width. Hit full depth. Drive through heels.' },
```

### 1.4 Training style / style lock / equipment / origin fields

- **Training style lives ONLY in `programmes.tags`** as a `style:<pool>`
  token. Parser: `styleKeyFromTags(tagsString)` —
  `src/lib/exercise/stylePools.js:178`:
  ```js
  const m = /(?:^|\s)style:(\S+)/.exec(typeof tagsString === 'string' ? tagsString : '');
  ```
  There is NO `training_style` column anywhere (grep of `database.js`
  for `training_style|trainingStyle`: zero hits).
- **Style lock** (2026-09-05 campaign): `styleLockFromTags(tags)` —
  `src/lib/exercise/styleLock.js:41`, returns
  `{ key, collection, label }` for kettlebell / circuit / band, else
  null. Consumed by `src/screens/PlanUpdateScreen.js:132` and
  `src/screens/ProGoalSetupScreen.js:204` to REPLACE the rebuild form
  with a notice (`styleLockRebuildNotice`, `styleLockGoalNotice`,
  `src/lib/exercise/styleLock.js:58,68`).
- **Style-constrained swaps**: `stylePoolFor(tag)`
  (`stylePools.js:190`) -> `rankSwaps(..., { stylePool })`
  (`src/lib/swapEngine.js:210`), wired at
  `src/screens/ActiveWorkoutScreen.js:1593` and
  `src/screens/RoutineDetailScreen.js:632`.
- **Equipment** is NOT on the plan. It is (a) per-exercise
  `exercises.equipment_profiles` (JSON array, `database.js:1366`) and
  (b) the athlete's own `userProfile.equipment` string in the Zustand
  store, persisted to AsyncStorage under `@volyume_user_profile_<uid>`
  (`src/store/useAppStore.js:16,393`). Library plans additionally carry
  an `equipment:<kit>` tag token (see seeds above).
- **Origin / provenance**: `programmes.source_programme_id`
  (`database.js:720`, written at `database.js:5355`),
  `routines.source_routine_id` (`database.js:474`, written at
  `database.js:5372`), `programmes.is_library`, `routines.is_sample`,
  `routines.is_template`, and per-row `routine_exercises.selection_reason`
  (the engine's `SELECTION_REASON` code, `src/lib/planEngine.js:1859`).
  There is no "generated vs manual" boolean — "generated" is inferred
  from `selection_reason` being non-null / no `source_programme_id`.

---

## 2. Exercise identity

- **Canonical id = hash of the NAME.** `canonicalExerciseId(name)` —
  `src/lib/exercise/canonicalId.js:48`. Lowercases + trims the name and
  emits a UUID-shaped 128-bit hash, so "the SAME exercise on two devices"
  gets the same id (`canonicalId.js:26-42`). This is what makes a plan
  shared between devices/users resolvable at all.
- **Corpus**: `src/lib/exerciseCorpus/index.js` — `CORPUS` (:57),
  `CORPUS_BY_NAME` (:61), `RETIRED_ENTRIES` (:64),
  `RETIRED_NAME_TO_SURVIVOR` (:67), `corpusEntryToSeedRow(entry)` (:87).
  Retired names map forward to a survivor, so a rename has a resolver.
- **Aliases**: `exercises.aliases` TEXT (JSON array) —
  `src/lib/database.js:2827`, populated by `corpusEntryToSeedRow`.
  Migration header (`database.js:2803-2822`) records they are
  **LOCAL-ONLY, NOT SYNCED (EL-19)** and only for canonical rows.
- **Custom exercises** live in a separate table with a composite PK —
  `src/lib/database.js:1178`:
  ```
  CREATE TABLE IF NOT EXISTS custom_exercises (
    id TEXT NOT NULL, user_id TEXT NOT NULL, name TEXT NOT NULL, …
    PRIMARY KEY (user_id, id) )
  ```
  They keep a random `uid()`, not a canonical hash
  (`canonicalId.js:41-43`: "Custom exercises are unaffected, they keep
  their random uid()").

**Unknown exercise id on the receiving device — what happens today.**
There IS a fallback, but it is a DISPLAY fallback, not a resolver:

`src/lib/database.js:4670-4700` (`getRoutineExercisesWithDetails`):

```sql
SELECT re.*, COALESCE(e.name, re.exercise_name) AS resolved_name, …
FROM routine_exercises re LEFT JOIN exercises e ON e.id = re.exercise_id
```

and `src/lib/database.js:4738`:

```js
unresolved: !row.primary_muscle && !!row.resolved_name,
```

So an unknown id yields a row that still renders by its denormalised
`exercise_name`, flagged `unresolved: true` ("Active screens can render
an inline 'Re-link exercise' affordance here", `database.js:4735-4737`) —
but with NO muscle, equipment, family or demand metadata, which means it
is invisible to volume maths, swap ranking, capability eligibility and
style-pool membership. The same denormalisation exists on logged sets
(`workout_sets.exercise_name`, `database.js:795`, written at
`database.js:4270-4279`).

There is **no name->canonical-id re-resolver on import**. The nearest
existing machinery is `resolveSeed(exerciseMap, filteredLibrary,
exerciseName, exerciseId)` (`src/lib/planAutoGen.js:359`) and
`resolvePlanAgainstLibrary(plan, exerciseMap, filteredLibrary)`
(`src/lib/planAutoGen.js:747`), which resolve an ENGINE-generated plan's
names against the local library and report `missedNames` / `missedCount`.
Fuzzy matching exists at `src/lib/exerciseFuzzySearch.js`.

---

## 3. The library-plan copy path (closest analogue to "Use this programme")

**`copyPlanFromLibrary(libraryPlanId, userId)` — `src/lib/database.js:5336`.**

```js
const newPlan = await createProgramme(
  userId, libPlan.name, libPlan.description, 0,
  libPlan.tags ?? null, libPlan.splitType ?? null, libPlan.difficulty ?? null,
);
await d.runAsync(
  'UPDATE programmes SET source_programme_id = ?, updated_at = ? WHERE id = ?',
  [libraryPlanId, Date.now(), newPlan.id],
);
…
const newRoutine = await duplicateRoutine(libRoutine.id, userId, libRoutine.name);
await d.runAsync(
  'UPDATE routines SET programme_id = ?, is_library = 0, source_routine_id = ?, is_template = 0, position = ? WHERE id = ?',
  [newPlan.id, libRoutine.id, i, newRoutine.id],
);
return { ...newPlan, sourceProgrammeId: libraryPlanId };
```

Its own comment records the P0 fix (`database.js:5340-5344`): "Tags,
split type and difficulty travel with the copy. Without tags the user's
plan has no style key, so a kettlebell or circuit plan's swap pool,
'Adjust plan' constraint and style swap-cause all died on activation
(certification 2026-09-05, finding A0b)."

**`duplicateRoutine(routineId, userId, newName)` — `src/lib/database.js:4917`**
is the row-level half, and the second half of the same P0 fix
(`database.js:4930-4936`): "Every structural column travels with the
copy. The call used to stop at supersetGroupId, so a library circuit
reached the user's own plan with group_kind and round_rest_seconds NULL".
It passes, per row:

```js
await addExerciseToRoutine(
  newRoutine.id, re.exerciseId, i,
  re.recommendedRepsMin, re.recommendedRepsMax, re.notes, re.recommendedSets,
  re.startingWeight, re.restSeconds, re.supersetGroupId, true,
  re.selectionReason ?? null, re.groupKind ?? null, re.roundRestSeconds ?? null,
);
```

Note `re.startingWeight` IS carried by `duplicateRoutine` (see §5 — this
matters for a person-to-person share).

**Writer signature** — `addExerciseToRoutine` `src/lib/database.js:4746`:

```js
addExerciseToRoutine(routineId, exerciseId, order, repsMin = 6, repsMax = 12,
  notes = null, sets = 3, startingWeight = null, restSeconds = null,
  supersetGroupId = null, scheduleSync = true, selectionReason = null,
  groupKind = null, roundRestSeconds = null)
```

`createProgramme(userId, name, description=null, isLibrary=0, tags=null,
splitType=null, difficulty=null, scheduleSync=true)` — `database.js:4564`.
`createRoutine(userId, name, description=null, splitType=null, isLibrary=0,
sourceRoutineId=null, programmeId=null, isSample=false, scheduleSync=true)`
— `database.js:4433`.

**Callers:** `src/screens/PlanDetailScreen.js:207,222`,
`src/screens/PlanLibraryScreen.js:503,523`, and
`installLibraryPlanForKit(userId, { kit, daysPerWeek, experience })` —
`src/lib/startWithPlan.js:278`, which does
`copyPlanFromLibrary -> activatePlanWithBlock` (:285).

**Pinned by** `src/lib/__tests__/copyPlanFromLibrary.structure.test.js`
(runs the REAL database module against in-memory SQLite; header at
lines 1-15 states exactly what it pins).

---

## 4. Generation and adaptation APIs

Purity column: PURE = no I/O, no store, no DB, no Date.now() unless injected.

| Function | file:line | Inputs | Returns | Purity |
|---|---|---|---|---|
| `generatePlan(inputs)` | `src/lib/planEngine.js:3143` | `{experience, daysPerWeek, sessionLengthMinutes, equipment, goal, phase, weakPoints, recoveryRating, nutritionPhase, exerciseLibrary, canonicalNames, stylePool, demonstratedStructure}` | `{ workouts:[{name,exercises:[{exerciseId,exerciseName,sets,repMin,repMax,restSec,supersetGroupId,selectionReason,…}]}], splitType, … }` | PURE (module-level `_effectivePool` swapped in try/finally, :3147-3172) |
| `buildPlanInputs(profile)` | `src/lib/planAutoGen.js:96` | userProfile | the inputs object above (no library) | PURE |
| `generateAndSavePlan(userId, profile, {ledger, allowLearnedCarry, continuityProposal, keepBlock})` | `src/lib/planAutoGen.js:950` | — | `{ok, prog, totalWritten, missedCount, missedNames, blockedSlots}` | I/O (reads library + intent, writes programme/routines) |
| `generatePlanDryRun(userId, profile, {continuityProposal})` | `src/lib/planAutoGen.js:1216` | — | preview, writes nothing | I/O read-only |
| `assessScheduleFit(profile, {userId, durationOptions, dayOptions})` | `src/lib/planAutoGen.js:227` | — | `{ok, …fit, durations}` | READ-ONLY ("writes nothing: no programme, no routine, no draft", :146-149) |
| `resolvePlanAgainstLibrary(plan, exerciseMap, filteredLibrary)` | `src/lib/planAutoGen.js:747` | engine plan + local library | `{workouts, totalRequested, totalResolved, missedCount, missedNames, blockedSlots}` | PURE |
| `equipmentReachable(ex, equipment)` | `src/lib/planAutoGen.js:400` | exercise row, profile string | boolean | PURE |
| `buildExerciseIndex(allExercises)` / `canonicalNameSet(...)` | `planAutoGen.js:407` / `:620` | library | Map / Set | PURE |
| `activePlanHasCircuitGroups(userId)` | `planAutoGen.js:298` | — | boolean (DISCLOSURE ONLY) | I/O read-only |
| `applyContinuity({generated, incumbents, evidenceFor, verdictFor, familyOf, context, isRebuild})` | `src/lib/exercise/continuity.js:112` | generated workouts + flattened incumbents `[{exerciseId,exerciseName,muscle,family}]` | `{workouts, decisions:[{outcome,reason,previousExerciseName,…}]}` | PURE (":83 Every fact it needs is passed in") |
| `rankSwaps(originalExercise, allExercises, {equipment, numResults, excludeIds, excludeAssisted, stylePool})` | `src/lib/swapEngine.js:210` | — | `[{exercise, score, reason}]` | PURE |
| `substituteCandidateFilter({styleKey, equipment})` | `src/lib/exercise/candidateScope.js:64` | — | `(exercise)=>boolean` or **null** ("no constraint") | PURE |
| `bestEligibleSubstitute(exercise, library, isEligibleRow, taken, isCandidate)` | `src/lib/capability/effective.js:109` | — | one exercise or null | PURE |
| `computeEffectiveSession(baseRows, library, capabilityState, isEligibleRow, isCandidate)` | `src/lib/capability/effective.js:139` | — | per-row effective view | PURE |
| `computeCapabilityPlanRewrite(userId, {ruleIds, equipment})` | `src/lib/sessionEffective.js:704` | — | `{lines:[{routineId,routineExerciseId,from,to,constraintIds}], substitutable, unsolvable, checked}` | I/O read-only (proposal) |
| `applyCapabilityPlanRewrite(userId, lines)` | `src/lib/sessionEffective.js:802` | — | `{applied, failed}` | WRITES (via `updateRoutineExerciseExercise`) |
| `loadSubstituteScope(userId, {planTags, equipment})` | `src/lib/sessionEffective.js:110` | — | the candidate predicate or null | I/O read-only |
| `filterLibraryForGeneration(library, state)` | `src/lib/exercise/generation.js:148` | library + intent state | filtered library (SAME array when nothing excluded) | PURE |
| `isEligibleExercise(state, exercise)` / `filterEligibleExercises` | `src/lib/exercise/intent.js:323,352` | intent state | boolean / array | PURE |
| `loadExerciseIntentState(userId, {activeMesocycleId, progressionForIds})` | `src/lib/exercise/intent.js:76` | — | intent state (exclusions, avoid-this-block, swaps, slot defaults) | I/O read-only |
| `loadCapabilityResolveState(userId, {atMs})` | `src/lib/capability/resolve.js:300` | — | capability state | I/O read-only |
| `blockingConflicts(state, exercise)` / `isCapabilityEligible` / `filterCapabilityEligible` | `src/lib/capability/resolve.js:383,422,428` | — | conflicts / boolean / array | PURE |
| `computePlanCompatibility(state, exerciseRows)` | `src/lib/capability/planCompat.js:29` | — | compatibility verdict for a whole plan | PURE |
| `deriveEquipmentProfiles(equipmentCategory, name, compoundIsolation)` | `src/lib/exerciseMetadata.js:136` | — | `['full_gym','home_gym',…]` | PURE |
| `parseProfiles(ex)` / `toPoolEntry(ex)` / `generatePoolFromLibrary(exercises)` | `src/lib/poolGenerator.js:104,113,172` | — | profiles array / pool entry / pool | PURE |
| `repRangeFor(name, paramKey, isStrength)` / `restFor(paramKey, isStrength)` / `isDefaultPrescription(paramKey, {repMin,repMax,restSec})` | `src/lib/exercise/prescription.js:125,136,149` | — | `{repMin,repMax}` / seconds / boolean | PURE |
| `deriveParamKey(equipmentCategory, compoundIsolation)` | `src/lib/poolGenerator.js:23` | — | tier key | PURE |
| `stylePoolFor(tag)` / `isInStylePool(poolKey, name)` / `styleKeyFromTags(tags)` | `src/lib/exercise/stylePools.js:190,196,178` | — | frozen name array / boolean / key | PURE |
| `summariseCircuitGroups(rows)` / `formatCircuitPreviewLine(summary)` / `circuitRoundState({...})` | `src/lib/circuitRound.js:90,117,38` | routine rows | group summary / copy / round state | PURE |
| `computeLandmarks(experience, recoveryRating, nutritionPhase, age)` | `src/lib/planEngine.js:127` | — | MEV/MAV/MRV landmarks | PURE |
| `selectExercisesForMuscle(muscle, sessionTarget, equipment, goal, slot, usedNames, weeklyTotalSets, landmarks, experience, nutritionPhase, sessionFatigue)` | `src/lib/planEngine.js:1435` | — | selected exercises for one muscle slot | PURE |
| `estimateWorkoutMinutes(exercises)` | `src/lib/planEngine.js:910` | — | minutes | PURE |
| `applyTimeCrunch(exercises, targetMinutes, estimateFn, options)` | `src/lib/mesocycle.js:372` | — | trimmed exercise list | PURE |
| `classifySupersetPair(exA, exB)` / `canSuperset(a,b)` / `relationshipTier` | `src/lib/planEngine.js:3054,2915,3010` | — | pairing verdicts | PURE |
| `assessPlanFit({inputs, generate, durationOptions, dayOptions})` | `src/lib/planFit.js:98` | injected `generate` | fit verdict | PURE |
| `summariseCurrentPlan(routines, sessionLengthMinutes)` / `diffPlans(now, after)` | `src/lib/planDiff.js:83,113` | — | plan summaries / diff | PURE |
| `adaptedSetupFor(exOrName)` / `materialContextsFor(ex)` | `src/lib/exercise/adaptedSetup.js:233,194` | — | setup lines per context | PURE |

### 4.1 What COULD be composed for "Adapt this programme for me"

Per-row substitution while preserving structure already exists end to end,
in the capability rewrite lane. The exact composition, all read-only up to
the last call:

1. `loadCapabilityResolveState(userId)` + `loadScopedIntentState(userId)`
   (`sessionEffective.js:62`) — the recipient's limitations, exclusions
   and avoid-this-block set.
2. `substituteCandidateFilter({ styleKey: styleKeyFromTags(sharedPlan.tags),
   equipment: recipientProfile.equipment })` —
   `candidateScope.js:64`. This is the CREATOR'S STYLE and the
   RECIPIENT'S KIT in one predicate, which is exactly the
   "preserve intent, re-fit the person" shape. It fails open by design
   (`candidateScope.js:31-34`).
3. `blockingConflicts(capState, exercise)` filtered to `!c.unknown`
   (`sessionEffective.js:761-770`) to find rows that must move.
4. `bestEligibleSubstitute(exercise, library, isEligibleRow, taken,
   isCandidate)` (`capability/effective.js:109`) — same primary muscle,
   not-taken, eligible, style- and equipment-scoped.
5. Write with `updateRoutineExerciseExercise(routineExerciseId,
   newExerciseId)` (`database.js:4828`), which RECALIBRATES the
   prescription for the new movement's tier via `deriveParamKey` +
   `repRangeFor` + `restFor` and **clears `starting_weight` to NULL**
   (`database.js:4877-4890`) — see §5.
6. `recordExerciseSwap(userId, from, to, { routineId, explicit:true,
   scope: SWAP_SCOPE.PROGRAMME })` (`database.js:11348`).

Reference implementation of exactly 1-6: `computeCapabilityPlanRewrite` /
`applyCapabilityPlanRewrite`, `src/lib/sessionEffective.js:704` and `:802`.
The group columns (`superset_group_id`, `group_kind`,
`round_rest_seconds`) are untouched by this path, so circuits, rounds and
round rest survive a per-row substitution.

Preference-aware ranking on top: `rankPersonalised(state, candidates,
{fromExerciseId, routineId})` — `src/lib/exercise/intent.js:693`; and
`approvedDefaultFor(state, fromExerciseId, routineId)` — `:406`.

### 4.2 What does NOT exist

- **Day-count re-mapping.** Nothing takes an existing N-day plan and
  re-maps it to M days. `generatePlan` builds a week FROM SCRATCH by
  `daysPerWeek` (`planEngine.js:3211-3222` clamps 2-6, beginners capped
  at 4). Grep for `remapDays|redistributeDays|refitPlan|adaptPlan`
  across `src/`: **zero hits**.
- **Circuit-preserving generation.** No generation path emits
  `groupKind` or `roundRestSeconds`. Stated verbatim at
  `src/lib/planAutoGen.js:284-288`: "No generation path emits `groupKind`
  or `roundRestSeconds` (grep planAutoGen/planEngine/poolGenerator: zero
  hits) and `assignSupersets` was deliberately deleted, so a
  circuit-grouped plan that is regenerated comes back as ungrouped
  straight sets." The disclosure string is
  `CIRCUIT_FLATTEN_NOTICE` (`planAutoGen.js:279`):
  ```
  'Circuit rounds are not kept. Volyume will build straight sets from the same kind of exercises.'
  ```
  Confirmed at the write site: `generateAndSavePlan` calls
  `addExerciseToRoutine(... ex.supersetGroupId ?? null, false,
  ex.selectionReason ?? null)` and stops there — no `groupKind`, no
  `roundRestSeconds` (`planAutoGen.js:1080-1093`).
- **Kettlebell/band/circuit-native regeneration.** `styleLock.js:11-15`
  records the measured finding: the generator "builds from six equipment
  profiles only, it emits no grouping at all … and it cannot produce a
  kettlebell-only or a differentiated band plan." Hence the style locks
  on both rebuild screens.
- **Session-length re-fit of an existing plan.** `applyTimeCrunch`
  (`mesocycle.js:372`) trims a list of exercises, but is not wired to a
  plan-level re-fit of a shared programme.
- **Any importer/validator for a foreign plan payload.** Nothing today
  ingests a plan that did not come from `programmes`/`routines` rows
  already on the device.

---

## 5. Prescriptions — personal numbers vs structure

**STRUCTURE (creator's intent — should travel):**

- `routine_exercises.recommended_sets` (also the circuit ROUND count),
  `recommended_reps_min`, `recommended_reps_max`, `rest_seconds`,
  `order_in_routine`, `notes`
- `superset_group_id`, `group_kind`, `round_rest_seconds`
- `routines.name`, `routines.position`, `routines.split_type`,
  `routines.day_of_week`
- `programmes.name`, `description`, `tags` (carries `style:`),
  `split_type`, `difficulty`

**PERSONAL (must NOT be copied to another user):**

- `routine_exercises.starting_weight` — the only load field on the plan.
  `duplicateRoutine` DOES copy it (`database.js:4943`), which is correct
  for a library plan (always NULL there) but is a live hazard for a
  user-to-user share.
  Prescription law, `src/lib/exercise/prescription.js:41-43`: "No
  fabricated starting load. Volyume does not know what anyone can lift,
  and a made-up number on a first session is worse than an empty field."
  `updateRoutineExerciseExercise` already clears it on any swap
  (`database.js:4879,4888`: `starting_weight = NULL`).
- `routine_exercises.selection_reason` — a code about why the ENGINE
  picked it for THAT athlete (`planEngine.js:1859`).
- `programmes.is_active`, `is_archived`, `folder_id`, `user_id`,
  `next_workout_index` (inert), all `deleted_at`.
- Everything the working weight is actually derived from is **outside the
  plan entirely**: `workout_sets` history, resolved at serve time by
  `resolveSetPrescription(packet, position)` —
  `src/lib/livePrescription.js:981`, with its evidence packet built by
  `buildEvidencePacket({...})` (`:725`) from the recipient's own logged
  sets. Its 13 provenance codes are at `livePrescription.js:52`;
  `FIRST_TIME_BAND` is the "no history" case, whose rule is
  "startingWeight-or-blank" (`livePrescription.js:35-37`).
- Learned per-muscle ranges: `mesocycles.block_ledger`
  (`database.js:2146`), consumed by `blockSeed.resolveSeedRange` and
  `buildLearnedSeedRangesForActivation` (`database.js:5099`). Block-local
  and personal.
- `exercise_intent`, `exercise_swaps`, `exercise_slot_defaults`
  (`database.js:2215,2228,2242`) and `capability_constraints`
  (`database.js:2655`) — all per-user, none of them plan columns. Note
  `capability_constraints` is health data (Article 9); the Q4 ruling
  quoted at `sessionEffective.js:723-726` says "no capability-derived
  event leaves the device".

---

## 6. Completed workouts

`workouts` — `src/lib/database.js:240`:

```
id, user_id, routine_id, mesocycle_id, started_at, ended_at,
duration_minutes, notes, session_difficulty, overall_pump,
soreness_24h_before, fatigue_level, is_completed DEFAULT 0,
created_at, updated_at
-- + ALTERs: last_activity_at, active_elapsed_seconds (:471-472),
   name, set_count, total_volume (:491-493), mesocycle_week_id (:564),
   joint_discomfort (:572), pre_workout_intent (:634),
   updated_at_iso, deleted_at (:792-793), sleep_quality, energy_score (:1474-1475)
```

`workout_sets` — `src/lib/database.js:257`:

```
id, user_id, workout_id, exercise_id, set_number, set_type DEFAULT 'straight',
target_reps_min, target_reps_max, actual_reps, weight, rir, rpe,
failed DEFAULT 0, notes, post_set_pump, post_set_muscle_connection,
joint_discomfort, is_amrap DEFAULT 0, amrap_reps, created_at, updated_at
-- + ALTERs: missed_reps (:499), deleted_at, exercise_name (:794-795),
   left_reps, right_reps (:1291-1292), evidence_class (:2796)
```

There is **no round column on `workout_sets`**. A circuit station logs
one working set per round, so the round is DERIVED:
`circuitRoundState({stationLogged, groupLogged, targetRounds})` —
`src/lib/circuitRound.js:38`, returning
`{roundsStarted, round, targetRounds, missedRound}`. Header at
`circuitRound.js:7-13` explains why (stations desynchronised, A8).

`evidence_class` is stamped at insert by the caller
(`database.js:4286,4313`; live screen at
`src/screens/ActiveWorkoutScreen.js:2749,4237`), never chosen by the user.

- **PR detection**: `detectPR(newSet, historicalSets, exercise, units)` —
  `src/lib/algorithms.js:465`. Assisted-machine semantics invert
  (`algorithms.js:475-495`). Cluster rows are excluded
  (`isE1rmEligibleRow`, `:473`).
- **Live "on for a record" line**: `buildRecordLine({weight, reps,
  historySets, units, isWarmup, exerciseType, loadSemantics,
  evidenceClass})` — `src/lib/workoutRecordLine.js:54`. Returns null for
  warm-ups, non weight-and-reps schemas, empty history, and ballistic
  evidence classes (`:70-76`). PURE, and deliberately reuses `detectPR`
  so the promise and the award cannot disagree
  (`workoutRecordLine.js:9-18`).
- **Volume / duration summary**: `summariseWorkoutSets(sets,
  {exerciseTypeById, loadSemanticsById})` — `src/lib/algorithms.js:215`,
  returns `{totalSets, workingSetCount, tonnage}`. Denormalised onto the
  workout row as `set_count` / `total_volume` / `duration_minutes`.
- **Per-muscle allocation**: `allocateExerciseVolume(exercise)` —
  `src/lib/algorithms.js:236` (primary 1.0, each secondary 0.5).
- **Share-card builders**: `topSetFromExerciseData(exerciseData)`,
  `intensityTier(prCount, tonnage, sets)`,
  `shareSessionName(routineName, exerciseNames)` —
  `src/lib/sessionShareData.js:18,49,67`. Weekly recap:
  `buildWeeklyRecapParams(output, {...})` and `isGreatWeek(output)` —
  `src/lib/shareCard/greatWeek.js:87,40`;
  `buildRecapMilestoneData(data, {...})` —
  `src/lib/shareCard/recapPayload.js:43`. Renderer:
  `src/lib/shareCard/drawShareCard.js`.
- **Best lift of a week**: `pickBestLift(weekSets, priorBestByExercise,
  e1rmFn)` — `src/lib/bestLift.js:40`.
- **Reads**: `getWorkoutById(id)` `database.js:3641`;
  `getWorkoutSetsForWorkout(workoutId)` `:4090`;
  `getWorkoutSetsForWorkoutIds(ids)` `:3904`;
  `getWorkoutSetsForExercise(exerciseId, userId, limit)` `:4158`;
  `getWorkoutSetsSince(userId, sinceMs, {completedOnly})` `:3882`.

---

## 7. Blocks (mesocycles)

`mesocycles` — `src/lib/database.js:315` plus
`block_type`, `planned_weeks`, `deload_protocol`, `rir_ladder`, `status`
(`:524-528`), `deleted_at` (`:801`), `block_ledger` (`:2146`),
`progression_anchor_week` (`:2527`). `mesocycle_weeks` at `:529`
(`week_index`, `is_deload`, `rir_target`, `started_at`, `completed_at`).

**Start is recorded on activation**, not on plan creation:
`activatePlanWithBlock(userId, planId, planName, {ledger,
allowLearnedCarry})` — `src/lib/database.js:5052`. It writes a LOCAL-day
`start_date` (`:5109-5112`), an `end_date` six weeks out (`:5115-5117`),
`planned_weeks = BLOCK_PLANNED_WEEKS` (6) and `deload_week =
BLOCK_DELOAD_WEEK` from `src/lib/mesocycle.js:28-29`, `rir_ladder
'[3,2,1,0,0,4]'` (`:5152`), then `generateMesocycleWeeks(id)` (`:5159`).
It truncates the previous block's `end_date` to today when the user
switches away (`:5137-5141`).

**"Is this block complete" — one definition**:
`blockCompletionState(meso, nowMs)` — `src/lib/mesocycle.js:513`,
returning `BLOCK_COMPLETION.ACTIVE | COMPLETED | ABANDONED`
(`mesocycle.js:507`). Built on `getBlockStatus(startDateMs,
plannedWeeks, nowMs)` — `mesocycle.js:533`, which returns:

```js
{ status, awaitingDecision, currentWeek, totalWeeks, weeksOverdue, recoveryWeek }
// status: 'active' | 'recovery' | 'completed_awaiting_decision'
```

Both PURE with `nowMs` injected. `mesocycle.js:74` `localDaysElapsed`
is the DST-safe day counter both use.

**Week-complete / block-finished UI states**:
`src/screens/HomeScreen.js:1678` (`weekComplete`), `:2127`
(`blockComplete` fact), `src/lib/home/todayLineArbiter.js:60`
(`facts.blockComplete`), copy at `weekCompleteLine(nextSessionName,
nowMs)` — `src/lib/planDisplay.js:98`. `blockFinished` is also a senior
input to the live prescription (`livePrescription.js:442,943`).

**Session-level truth for a week**: `resolveWeekSessions({...})` —
`src/lib/blockProgression.js:242`; `requiredSessions(weekId, routines)`
`:202`; `executionSummary(sessions)` `:326`;
`weekProgressionResolved(sessions)` `:312`.

**Block summary material that could feed a "training story"**:
- `computeBlockPerformance({muscle, sets, exercisesById, priorSets,
  workoutsById, blockStart, blockWeeks, deloadWeekIndex,
  reboundWindowsMs, appliedEarlyDeloadWeekIndices})` —
  `src/lib/blockMetrics.js:164`, returns `{e1rmSlopePct, prDensity,
  rawPrCount, eligibleExposures, confidence, discontinuity,
  doseResponse}`. PURE.
- `effectiveBlockSlopePct(perMuscle)` — `blockMetrics.js:475`.
- `proposeNextBlock({...})` — `src/lib/blockReview.js:64`;
  `reviewSections(proposal)` `:211`.
- `summariseSeededPlan(plannedRows, deloadWeekIndex)` and
  `buildBlockStartLines({summary, limit, previous, hadPriorBlocks})` —
  `src/lib/blockExplain.js:160,244`;
  `buildLedgerReflectionRows(ledger)` `:324`.
- `computeAndStoreBlockLedger(userId, mesocycleId, {force, userProfile})`
  — `src/lib/blockLedgerRunner.js:228`;
  `getAchievedWeeklyPeaks(userId)` `:527`.

---

## 8. Training styles

**The style vocabulary is the pool registry** — `STYLE_POOL_KEYS`,
`src/lib/exercise/stylePools.js:37`:

```js
export const STYLE_POOL_KEYS = Object.freeze({
  KETTLEBELL_FOUNDATIONS: 'kettlebell_foundations',
  KETTLEBELL_EXPERIENCED: 'kettlebell_experienced',
  CIRCUIT_DUMBBELL: 'circuit_dumbbell',
  CIRCUIT_BODYWEIGHT: 'circuit_bodyweight',
  BODYWEIGHT: 'bodyweight',
  BAND: 'band',
  SUSPENSION: 'suspension',
  MINIMAL_HOME: 'minimal_home',
});
```

Two pools are HAND-CURATED (both kettlebell, per RKC/StrongFirst
competence ordering, `stylePools.js:12-19`); the rest are DERIVED at
import time by equipment category + auto-generation tier
(`deriveByEquipment`, `:130-137`; only `AUTO_TIER.STAPLE`/`COMMON`).
`KETTLEBELL_NEVER_AUTO_EXCEPTIONS` (`:121`) is the closed list of
NEVER_AUTO ballistics a style pool is allowed to carry.

**Which plans carry which tag** (`programmes.tags`):
- `style:kettlebell_foundations` — `src/lib/seedRoutines.js:2081, 2113, 2246`
- `style:kettlebell_experienced` — `seedRoutines.js:2156, 2196, 2366`
- `style:circuit_dumbbell` — `seedRoutines.js:2280`
- `style:circuit_bodyweight` — `seedRoutines.js:2323`
- `style:band` — `src/lib/seedRoutines.bandPlans.js:60, 106`

**The separation rule — what must never cross styles.** Three
enforcement points, all reading the SAME `stylePools.js`:

1. **Generation**: `generatePlan` restricts selection to
   `inputs.stylePool` (`planEngine.js:3163-3172`), fed from
   `stylePoolFor(styleKeyFromTags(currentPlan.tags))`
   (`planAutoGen.js:1000-1006`, `:1246-1252`).
2. **Swaps**: `rankSwaps(..., {stylePool})` filters
   `.filter((ex) => !styleSet || styleSet.has(ex.name))`
   (`swapEngine.js:227`). The sheet's explicit "Show all exercises"
   relaxes it by omitting the option (`swapEngine.js:206-208`).
3. **Serve-time capability substitution**: `substituteCandidateFilter`
   (`candidateScope.js:64`), added by F-14 because that lane was
   "style-blind and equipment-blind" — verbatim
   `candidateScope.js:6-14`: a "no overhead" rule inside "Full-Body
   Circuit: Dumbbells" "could serve a barbell or a machine press to
   someone training at home with a pair of dumbbells."

**Style LOCK** (a style plan is never regenerated into another kind of
plan): `styleLockFromTags(tags)` — `styleLock.js:41`, covering
kettlebell / circuit / band only ("an unknown style must never silently
disable a rebuild path", `:32-35`). Enforced on BOTH rebuild screens
(`PlanUpdateScreen.js:132`, `ProGoalSetupScreen.js:204`) precisely
because "a rule implemented twice is a rule that drifts"
(`styleLock.js:18-22`).

**Fail-open contract, stated twice and load-bearing**: an unknown or
absent style key is NO CONSTRAINT, never an empty pool
(`stylePools.js:186-191`, `candidateScope.js:69-71`); a row with no
equipment profiles (a custom exercise) is never hidden
(`candidateScope.js:31-34`, `swapEngine.js:252-255`).

---

## 9. Tests to respect

Plan copy / structure
- `src/lib/__tests__/copyPlanFromLibrary.structure.test.js` — activating a
  library plan must carry every structural fact (tags, group_kind,
  round_rest_seconds) onto the copy; runs the REAL database module on
  in-memory SQLite (findings A0 / A0b, P0).
- `src/lib/__tests__/activatePlanKeepingBlock.guard.test.js` — activation
  must not silently destroy the running block.
- `src/lib/__tests__/planDiff.keepsBlock.test.js` — when a rebuild keeps
  the block.

Circuits / evidence
- `src/lib/__tests__/circuitRound.test.js` — round arithmetic is derived
  once and cannot desynchronise across stations (F-13(e), F-17(h)).
- `src/lib/__tests__/database.circuitEvidenceMigration.test.js` — the
  three nullable columns exist, with NO backfill: every pre-migration row
  reads NULL.

Style locks / pools
- `src/lib/__tests__/stylePlans.pools.test.js` — exact pool contents;
  foundations contains no single-arm swing/clean/snatch (EL-8, EL-11).
- `src/lib/__tests__/stylePlans.seedTags.test.js` — a beginner-tagged plan
  must never carry `style:kettlebell_experienced` (finding A11).
- `src/lib/__tests__/stylePlans.capability.test.js` — all eight style
  templates pass `computePlanCompatibility` like any other library plan.
- `src/lib/__tests__/seedRoutines.bandPlans.test.js` — the two band plans
  exist and carry `style:band` (F-16 revised, A2/A14).

Equipment routes / substitution scope
- `src/lib/__tests__/swapEngine.equipment.test.js` — a swap must never
  offer kit the athlete does not have (founder report 2026-08-19).
- `src/lib/__tests__/sessionEffective.styleEquipmentScope.test.js` —
  serve-time substitution is style- and equipment-scoped, and asserts by
  IDENTITY that `equipmentReachable` is the shared predicate (F-14).
- `src/lib/__tests__/planAutoGen.equipmentContinuity.test.js` — equipment
  loss survives the continuity/rebuild layer (founder report 2026-08-18).
- `src/lib/__tests__/capabilityPlanRewrite.test.js` — the baseline plan
  rewrite (CC33 D112 R1a/b; closes T1-03, T2-01).
- `src/lib/__tests__/capabilityGeneratedPlans.test.js`,
  `capabilityFamilyPlans.test.js` — capability rules hold across
  generated plans and movement families.
- `src/lib/exercise/__tests__/capabilityComposition.test.js` — the
  composition of intent + capability filters.

Engine invariants touched by any adaptation work
- `src/lib/__tests__/planEngine.test.js`,
  `planEngineLibraryPool.test.js`, `planengineDayClamp.test.js`,
  `planengineRebuildPhase1..4.test.js`, `planAutoGen.test.js`,
  `campaign16.planFit.test.js`, `planFit`/`planDiff` suites.

---

## Cross-cutting notes for the payload designer

- **Sync**: plan rows already sync. `programmes` push map at
  `src/lib/sync.js:917` (`source_programme_id`), `routine_exercises` at
  `src/lib/sync.js:1032` (`starting_weight`, `rest_seconds`,
  `superset_group_id`). The circuit columns now travel:
  `CIRCUIT_SYNC_COLUMNS_ENABLED = true`
  (`src/lib/sync/featureFlags.js:26`), and `supabase/README.md:430-431`
  records migrations 158 and 159 **APPLIED AND VERIFIED 2026-09-05**.
- **Aliases do NOT sync** (`database.js:2825-2830`, EL-19), so a shared
  plan cannot rely on the recipient's alias table for name resolution.
- Cloud pull appliers for these tables: `database.js:9759` (routines),
  `:9829` (programmes), `:9908`/`:9938` (routine_exercises),
  `:10516` (workout_sets, including `evidence_class`).
