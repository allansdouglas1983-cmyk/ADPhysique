# 05 — Recon: programme model, exercise identity, copy and adaptation APIs

READ-ONLY recon for the Social / Community / Discovery campaign
(`docs/social-discovery-2026-09-06/README.md`). What EXISTS today, with
`file:line`. No recommendations, no new engine code. Tree at 2026-09-06.

---

## 1. Plan data model

A plan is `programmes` -> N `routines` (days) -> N `routine_exercises`
(rows in day order). No nested JSON: the structure is relational. Blocks
(`mesocycles`) are created ON ACTIVATION and are not part of plan
structure (§7).

**`programmes`** — base `src/lib/database.js:294`; ALTERs:
`is_active` :485, `next_workout_index` :486 (INERT, tombstone at :5313),
**`tags` :487** (carries `style:`), `split_type` :488, `is_archived` :489,
`difficulty` :576, **`source_programme_id` :720**, `deleted_at` :797,
`folder_id` :1566.

**`routines`** (one per DAY) — base `database.js:280`
(`id, user_id, name, description, split_type, is_active, is_library,
is_sample, source_routine_id, programme_id, created_at, updated_at`);
ALTERs: `is_template` :490, `day_of_week` :719, `deleted_at` :796,
**`position` :1831** (day order within the plan).

**`routine_exercises`** — base `database.js:303`:

```
id, routine_id, exercise_id, order_in_routine DEFAULT 0,
recommended_sets DEFAULT 3, recommended_reps_min DEFAULT 6,
recommended_reps_max DEFAULT 12, notes, created_at, updated_at
```
ALTERs: `starting_weight` :468 (PERSONAL LOAD, §5), `rest_seconds` :469,
`superset_group_id` :470, `deleted_at` :799, `exercise_name` :800
(denormalised fallback), `user_id` :1158, `selection_reason` :2433,
**`group_kind` :2794** ('circuit' | NULL = superset),
**`round_rest_seconds` :2795**.

The only JSON-ish plan-adjacent columns: `mesocycles.rir_ladder`
(:527, e.g. `'[3,2,1,0,4]'`) and `mesocycles.block_ledger` (:2146).

### 1.1 Circuits (EL-9 / EL-7)

Migration header, `database.js:2769-2773`, verbatim:

```
//   evidence_class      NULL = conventional | 'circuit' | 'ballistic' |
//                       'circuit_ballistic'. Stamped at WRITE time by the
//                       live screen from structure (group_kind) and
//                       exercise metadata (load_character), never chosen
//                       by the user (EL-7).
```

**Rounds are not a column.** A circuit's round count IS the group's
`recommended_sets`, read from the group's FIRST station —
`src/lib/circuitRound.js:82-90`: "Rounds are read from the group's FIRST
station: EL-9 keeps rounds equal within a circuit".

### 1.2 Concrete example

Library source (`src/lib/seedRoutines.js:2280-2292`, "Full-Body Circuit:
Dumbbells"):

```js
tags: 'style:circuit_dumbbell circuit equipment:dumbbell home full_body goal:build_muscle days:3 short beginner intermediate',
{ name: 'Goblet Squat', sets: 3, repsMin: 8, repsMax: 12, rest: 0,
  notes: 'Circuit 1, station 1. …',
  supersetGroupId: 'circuit1', groupKind: 'circuit', roundRestSeconds: 90 },
```

The same day as `routine_exercises` rows — a 3-station circuit at 3
rounds / 90s round rest, plus one straight-sets row:

```json
[
 {"id":"re_a1","routine_id":"rt_1","exercise_id":"<canonicalExerciseId('Goblet Squat')>",
  "exercise_name":"Goblet Squat","order_in_routine":0,"recommended_sets":3,
  "recommended_reps_min":8,"recommended_reps_max":12,"rest_seconds":0,
  "superset_group_id":"circuit1","group_kind":"circuit","round_rest_seconds":90,
  "starting_weight":null,"selection_reason":null,"notes":"Circuit 1, station 1. …"},
 // re_a2 Push-Up (order 1) and re_a3 Dumbbell Row (order 2): identical group
 // fields — same superset_group_id "circuit1", group_kind "circuit",
 // round_rest_seconds 90, recommended_sets 3. Rounds live on the FIRST station.
 {"id":"re_a4","routine_id":"rt_1","exercise_id":"<id('Barbell Back Squat')>",
  "exercise_name":"Barbell Back Squat","order_in_routine":3,"recommended_sets":3,
  "recommended_reps_min":5,"recommended_reps_max":8,"rest_seconds":120,
  "superset_group_id":null,"group_kind":null,"round_rest_seconds":null,"starting_weight":null}
]
```

An ordinary SUPERSET is the same with `group_kind: null` + a shared
`superset_group_id`. Straight sets: all three group fields NULL. Every
reader takes these via `?? null` (`database.js:2775-2785`), so an absent
column degrades to "ordinary superset / no group / conventional".

Straight-sets library source for contrast (`seedRoutines.js:76`):
`{ name: 'Barbell Back Squat', sets: 3, repsMin: 5, repsMax: 8, rest: 120, notes: '…' }`.

### 1.3 Style, equipment, origin fields

- **Training style lives ONLY in `programmes.tags`** as `style:<pool>`.
  Parser `styleKeyFromTags(tagsString)` — `src/lib/exercise/stylePools.js:178`:
  `/(?:^|\s)style:(\S+)/`. There is **no `training_style` column**
  (grep of `database.js` for `training_style|trainingStyle`: zero hits).
- **Style lock**: `styleLockFromTags(tags)` —
  `src/lib/exercise/styleLock.js:41` -> `{key, collection, label}` for
  kettlebell/circuit/band, else null. Replaces the rebuild form with a
  notice on BOTH rebuild screens (`PlanUpdateScreen.js:132`,
  `ProGoalSetupScreen.js:204`; copy at `styleLock.js:58,68`).
- **Style-constrained swaps**: `stylePoolFor(tag)` (`stylePools.js:190`)
  -> `rankSwaps(..., {stylePool})` (`swapEngine.js:210`), wired at
  `ActiveWorkoutScreen.js:1593`, `RoutineDetailScreen.js:632`.
- **Equipment is NOT on the plan.** It is per-exercise
  `exercises.equipment_profiles` (JSON array, `database.js:1366`) plus
  the athlete's `userProfile.equipment` in the store, persisted to
  AsyncStorage `@volyume_user_profile_<uid>`
  (`src/store/useAppStore.js:16,393`). Library plans carry an
  `equipment:<kit>` tag token as metadata only.
- **Origin/provenance**: `programmes.source_programme_id` (written
  `database.js:5355`), `routines.source_routine_id` (written :5372),
  `is_library`, `is_sample`, `is_template`, and per-row
  `selection_reason` (engine `SELECTION_REASON`, `planEngine.js:1859`).
  No "generated vs custom" boolean — it is inferred.

---

## 2. Exercise identity

- **Canonical id = hash of the NAME.** `canonicalExerciseId(name)` —
  `src/lib/exercise/canonicalId.js:48`; lowercase+trim then a
  UUID-shaped 128-bit hash so "the SAME exercise on two devices" gets
  the same id (`:26-42`). This is what makes a cross-user plan
  resolvable at all.
- **Corpus**: `src/lib/exerciseCorpus/index.js` — `CORPUS` :57,
  `CORPUS_BY_NAME` :61, `RETIRED_ENTRIES` :64,
  `RETIRED_NAME_TO_SURVIVOR` :67, `corpusEntryToSeedRow(entry)` :87
  (retired names map forward to a survivor).
- **Aliases**: `exercises.aliases` JSON — `database.js:2827`. Header
  `:2825-2830` records them **LOCAL-ONLY, NOT SYNCED (EL-19)**, canonical
  rows only.
- **Custom exercises**: separate table, composite PK —
  `database.js:1178` (`PRIMARY KEY (user_id, id)`), random `uid()`, not a
  canonical hash (`canonicalId.js:41-43`).

**Unknown exercise id on the receiving device.** There is a DISPLAY
fallback, not a resolver. `getRoutineExercisesWithDetails` —
`database.js:4670`:

```sql
SELECT re.*, COALESCE(e.name, re.exercise_name) AS resolved_name, …
FROM routine_exercises re LEFT JOIN exercises e ON e.id = re.exercise_id
```

and `database.js:4738`: `unresolved: !row.primary_muscle && !!row.resolved_name`
("Active screens can render an inline 'Re-link exercise' affordance
here", :4735-4737). The row renders by its denormalised name but carries
NO muscle/equipment/family/demand metadata — so it is invisible to volume
maths, swap ranking, capability eligibility and style-pool membership.
Same denormalisation on logged sets (`workout_sets.exercise_name` :795,
written :4270-4279).

**No name->id re-resolver on import exists.** Nearest machinery:
`resolveSeed(exerciseMap, filteredLibrary, exerciseName, exerciseId)`
(`planAutoGen.js:359`) and `resolvePlanAgainstLibrary(plan, exerciseMap,
filteredLibrary)` (`planAutoGen.js:747`, reports `missedNames`/
`missedCount`); fuzzy search at `src/lib/exerciseFuzzySearch.js`.

---

## 3. The library-plan copy path (the analogue of "Use this programme")

**`copyPlanFromLibrary(libraryPlanId, userId)` — `src/lib/database.js:5336`:**

```js
const newPlan = await createProgramme(
  userId, libPlan.name, libPlan.description, 0,
  libPlan.tags ?? null, libPlan.splitType ?? null, libPlan.difficulty ?? null,
);
await d.runAsync(
  'UPDATE programmes SET source_programme_id = ?, updated_at = ? WHERE id = ?',
  [libraryPlanId, Date.now(), newPlan.id],
);
… for each library routine, in position order:
const newRoutine = await duplicateRoutine(libRoutine.id, userId, libRoutine.name);
await d.runAsync(
  'UPDATE routines SET programme_id = ?, is_library = 0, source_routine_id = ?, is_template = 0, position = ? WHERE id = ?',
  [newPlan.id, libRoutine.id, i, newRoutine.id],
);
return { ...newPlan, sourceProgrammeId: libraryPlanId };
```

Its own comment records the P0 (`database.js:5340-5344`): "Tags, split
type and difficulty travel with the copy. Without tags the user's plan
has no style key, so a kettlebell or circuit plan's swap pool, 'Adjust
plan' constraint and style swap-cause all died on activation
(certification 2026-09-05, finding A0b)."

**`duplicateRoutine(routineId, userId, newName)` — `database.js:4917`**
is the row-level half and the other half of the same P0
(`:4930-4936`: "Every structural column travels with the copy. The call
used to stop at supersetGroupId…"):

```js
await addExerciseToRoutine(
  newRoutine.id, re.exerciseId, i,
  re.recommendedRepsMin, re.recommendedRepsMax, re.notes, re.recommendedSets,
  re.startingWeight, re.restSeconds, re.supersetGroupId, true,
  re.selectionReason ?? null, re.groupKind ?? null, re.roundRestSeconds ?? null,
);
```

Note it DOES carry `re.startingWeight` (:4943) — harmless for library
plans (always NULL) but a live hazard for a user-to-user share (§5).

Writer signatures: `addExerciseToRoutine(routineId, exerciseId, order,
repsMin=6, repsMax=12, notes=null, sets=3, startingWeight=null,
restSeconds=null, supersetGroupId=null, scheduleSync=true,
selectionReason=null, groupKind=null, roundRestSeconds=null)` —
`database.js:4746`; `createProgramme(userId, name, description=null,
isLibrary=0, tags=null, splitType=null, difficulty=null,
scheduleSync=true)` — :4564; `createRoutine(userId, name,
description=null, splitType=null, isLibrary=0, sourceRoutineId=null,
programmeId=null, isSample=false, scheduleSync=true)` — :4433.

Callers: `PlanDetailScreen.js:207,222`, `PlanLibraryScreen.js:503,523`,
and `installLibraryPlanForKit(userId, {kit, daysPerWeek, experience})` —
`src/lib/startWithPlan.js:278` (`copyPlanFromLibrary ->
activatePlanWithBlock`, :285).

Pinned by `src/lib/__tests__/copyPlanFromLibrary.structure.test.js`
(real database module on in-memory SQLite).

---

## 4. Generation and adaptation APIs

PURE = no I/O, no store, no DB, no `Date.now()` unless injected.

| Function | file:line | Returns / note | Purity |
|---|---|---|---|
| `generatePlan(inputs)` — `{experience, daysPerWeek, sessionLengthMinutes, equipment, goal, phase, weakPoints, recoveryRating, nutritionPhase, exerciseLibrary, canonicalNames, stylePool, demonstratedStructure}` | `planEngine.js:3143` | `{workouts:[{name,exercises:[{exerciseId,exerciseName,sets,repMin,repMax,restSec,supersetGroupId,selectionReason}]}], splitType}` | PURE (module pool swapped in try/finally :3147-3172) |
| `buildPlanInputs(profile)` | `planAutoGen.js:96` | the inputs object above | PURE |
| `generateAndSavePlan(userId, profile, {ledger, allowLearnedCarry, continuityProposal, keepBlock})` | `planAutoGen.js:950` | `{ok, prog, totalWritten, missedCount, missedNames, blockedSlots}` | writes |
| `generatePlanDryRun(userId, profile, {continuityProposal})` | `planAutoGen.js:1216` | preview, writes nothing | read-only |
| `assessScheduleFit(profile, {userId, durationOptions, dayOptions})` | `planAutoGen.js:227` | `{ok, …fit, durations}`; "writes nothing" :146-149 | read-only |
| `resolvePlanAgainstLibrary(plan, exerciseMap, filteredLibrary)` | `planAutoGen.js:747` | `{workouts, totalRequested, totalResolved, missedCount, missedNames, blockedSlots}` | PURE |
| `equipmentReachable(ex, equipment)` | `planAutoGen.js:400` | boolean; THE shared equipment predicate | PURE |
| `buildExerciseIndex(all)` / `canonicalNameSet(all)` | `planAutoGen.js:407` / `:620` | Map / Set | PURE |
| `activePlanHasCircuitGroups(userId)` | `planAutoGen.js:298` | boolean, DISCLOSURE ONLY | read-only |
| `applyContinuity({generated, incumbents, evidenceFor, verdictFor, familyOf, context, isRebuild})` | `exercise/continuity.js:112` | `{workouts, decisions[]}`; incumbents are `[{exerciseId,exerciseName,muscle,family}]` | PURE (:83) |
| `rankSwaps(originalExercise, allExercises, {equipment, numResults, excludeIds, excludeAssisted, stylePool})` | `swapEngine.js:210` | `[{exercise, score, reason}]` | PURE |
| `substituteCandidateFilter({styleKey, equipment})` | `exercise/candidateScope.js:64` | `(exercise)=>boolean` or **null** = no constraint | PURE |
| `bestEligibleSubstitute(exercise, library, isEligibleRow, taken, isCandidate)` | `capability/effective.js:109` | one exercise or null | PURE |
| `computeEffectiveSession(baseRows, library, capState, isEligibleRow, isCandidate)` | `capability/effective.js:139` | per-row effective view | PURE |
| `computeCapabilityPlanRewrite(userId, {ruleIds, equipment})` | `sessionEffective.js:704` | `{lines:[{routineId,routineExerciseId,from,to,constraintIds}], substitutable, unsolvable, checked}` | read-only proposal |
| `applyCapabilityPlanRewrite(userId, lines)` | `sessionEffective.js:802` | `{applied, failed}` | writes |
| `loadSubstituteScope(userId, {planTags, equipment})` | `sessionEffective.js:110` | the predicate or null | read-only |
| `filterLibraryForGeneration(library, state)` | `exercise/generation.js:148` | filtered library (SAME array if nothing excluded) | PURE |
| `isEligibleExercise` / `filterEligibleExercises` / `rankPersonalised` / `approvedDefaultFor` | `exercise/intent.js:323,352,693,406` | exclusions, avoid-this-block, learned defaults | PURE |
| `loadExerciseIntentState(userId, {activeMesocycleId, progressionForIds})` | `exercise/intent.js:76` | intent state | read-only |
| `loadCapabilityResolveState(userId, {atMs})` | `capability/resolve.js:300` | capability state | read-only |
| `blockingConflicts` / `isCapabilityEligible` / `filterCapabilityEligible` | `capability/resolve.js:383,422,428` | conflicts / boolean / array | PURE |
| `computePlanCompatibility(state, exerciseRows)` | `capability/planCompat.js:29` | whole-plan verdict | PURE |
| `deriveEquipmentProfiles(equipmentCategory, name, compoundIsolation)` | `exerciseMetadata.js:136` | `['full_gym','home_gym',…]`; `PROFILES_BY_CATEGORY` at :80 | PURE |
| `parseProfiles` / `toPoolEntry` / `generatePoolFromLibrary` / `deriveParamKey` | `poolGenerator.js:104,113,172,23` | profiles / entry / pool / tier key | PURE |
| `repRangeFor` / `restFor` / `isDefaultPrescription` | `exercise/prescription.js:125,136,149` | `{repMin,repMax}` / seconds / boolean | PURE |
| `stylePoolFor` / `isInStylePool` / `styleKeyFromTags` / `styleLabelFor` | `exercise/stylePools.js:190,196,178,204` | pool / boolean / key / label | PURE |
| `summariseCircuitGroups` / `formatCircuitPreviewLine` / `circuitRoundState` | `circuitRound.js:90,117,38` | group summary / copy / round state | PURE |
| `computeLandmarks` / `selectExercisesForMuscle` / `estimateWorkoutMinutes` / `classifySupersetPair` | `planEngine.js:127,1435,910,3054` | landmarks / slot selection / minutes / pairing | PURE |
| `applyTimeCrunch(exercises, targetMinutes, estimateFn, options)` | `mesocycle.js:372` | trimmed exercise list | PURE |
| `assessPlanFit({inputs, generate, durationOptions, dayOptions})` | `planFit.js:98` | fit verdict, injected `generate` | PURE |
| `summariseCurrentPlan(routines, mins)` / `diffPlans(now, after)` | `planDiff.js:83,113` | summaries / diff | PURE |
| `adaptedSetupFor(exOrName)` / `materialContextsFor(ex)` | `exercise/adaptedSetup.js:233,194` | setup lines per context | PURE |

### 4.1 Composable today: per-row re-fit that preserves structure

The capability rewrite lane already IS "given routine R and recipient
constraints C, substitute with same-pattern, same-style alternatives".
Reference implementation: `sessionEffective.js:704` (propose) and `:802`
(apply). The chain:

1. `loadCapabilityResolveState(userId)` + `loadScopedIntentState(userId)`
   (`sessionEffective.js:62`) — recipient limitations, exclusions,
   avoid-this-block.
2. `substituteCandidateFilter({ styleKey: styleKeyFromTags(sharedPlan.tags),
   equipment: recipientProfile.equipment })` — `candidateScope.js:64`.
   This is CREATOR'S STYLE + RECIPIENT'S KIT in one predicate, exactly
   the "preserve intent, re-fit the person" shape. Fails open (:31-34).
3. `blockingConflicts(capState, exercise)` filtered to `!c.unknown`
   (`sessionEffective.js:761-770`) — definite conflicts only.
4. `bestEligibleSubstitute(exercise, library, isEligibleRow, taken,
   isCandidate)` (`capability/effective.js:109`) — same primary muscle,
   not-taken, eligible, style- and equipment-scoped.
5. `updateRoutineExerciseExercise(routineExerciseId, newExerciseId)`
   (`database.js:4828`), which recalibrates reps/rest for the new
   movement's tier (`deriveParamKey` + `repRangeFor` + `restFor`) and
   **clears `starting_weight` to NULL** (:4879, :4888).
6. `recordExerciseSwap(userId, from, to, {routineId, explicit:true,
   scope: SWAP_SCOPE.PROGRAMME})` (`database.js:11348`).

Steps 1-6 never touch `superset_group_id`, `group_kind` or
`round_rest_seconds`, so circuits, rounds and round rest survive.

### 4.2 Gaps — does NOT exist

- **Day-count re-mapping.** Nothing re-maps an N-day plan to M days.
  `generatePlan` builds the week from scratch by `daysPerWeek`
  (`planEngine.js:3211-3222`: clamp 2-6, beginners capped at 4). Grep
  `remapDays|redistributeDays|refitPlan|adaptPlan` over `src/`:
  **zero hits**.
- **Circuit-preserving generation.** `planAutoGen.js:284-288`, verbatim:
  "No generation path emits `groupKind` or `roundRestSeconds` (grep
  planAutoGen/planEngine/poolGenerator: zero hits) and `assignSupersets`
  was deliberately deleted, so a circuit-grouped plan that is
  regenerated comes back as ungrouped straight sets." Disclosure string
  `CIRCUIT_FLATTEN_NOTICE` (`planAutoGen.js:279`):
  `'Circuit rounds are not kept. Volyume will build straight sets from the same kind of exercises.'`
  Confirmed at the write site: `generateAndSavePlan` stops at
  `supersetGroupId` + `selectionReason` (`planAutoGen.js:1080-1093`).
- **Style-native regeneration.** `styleLock.js:11-15`: the generator
  "builds from six equipment profiles only, it emits no grouping at all …
  and it cannot produce a kettlebell-only or a differentiated band plan."
  Hence the locks on both rebuild screens.
- **Session-length re-fit of an existing plan.** `applyTimeCrunch` trims
  a list but is not wired to plan-level re-fit of a shared programme.
- **Any importer/validator for a foreign plan payload.** Nothing ingests
  a plan that is not already `programmes`/`routines` rows on the device.

---

## 5. Prescriptions: personal vs structural

**STRUCTURE (creator intent — should travel):**
`routine_exercises.recommended_sets` (also the circuit ROUND count),
`recommended_reps_min`, `recommended_reps_max`, `rest_seconds`,
`order_in_routine`, `notes`, `superset_group_id`, `group_kind`,
`round_rest_seconds`; `routines.name/position/split_type/day_of_week`;
`programmes.name/description/tags/split_type/difficulty`.

**PERSONAL (must NOT cross users):**
- `routine_exercises.starting_weight` — the only load on the plan, and
  `duplicateRoutine` currently copies it (`database.js:4943`).
  Prescription law, `exercise/prescription.js:41-43`: "No fabricated
  starting load. Volyume does not know what anyone can lift, and a
  made-up number on a first session is worse than an empty field."
  `updateRoutineExerciseExercise` already nulls it on any swap.
- `routine_exercises.selection_reason` — why the engine picked it for
  THAT athlete (`planEngine.js:1859`).
- `programmes.is_active`, `is_archived`, `folder_id`, `user_id`,
  `next_workout_index`; all `deleted_at`.
- Working weights are **outside the plan entirely**: derived at serve
  time by `resolveSetPrescription(packet, position)` —
  `livePrescription.js:981`, over `buildEvidencePacket({...})` (:725)
  built from the RECIPIENT'S own logged sets. 13 provenance codes at
  `livePrescription.js:52`; the no-history case is `FIRST_TIME_BAND`,
  whose rule is "startingWeight-or-blank" (:35-37).
- Learned ranges: `mesocycles.block_ledger` (`database.js:2146`),
  consumed by `blockSeed.resolveSeedRange` and
  `buildLearnedSeedRangesForActivation` (`database.js:5099`).
- `exercise_intent` / `exercise_swaps` / `exercise_slot_defaults`
  (`database.js:2215,2228,2242`) and `capability_constraints` (:2655) —
  per-user, none of them plan columns. `capability_constraints` is
  Article 9 health data; the Q4 ruling quoted at
  `sessionEffective.js:723-726`: "no capability-derived event leaves the
  device".

---

## 6. Completed workouts

**`workouts`** — `database.js:240` (`id, user_id, routine_id, mesocycle_id,
started_at, ended_at, duration_minutes, notes, session_difficulty,
overall_pump, soreness_24h_before, fatigue_level, is_completed, created_at,
updated_at`); ALTERs: `last_activity_at`/`active_elapsed_seconds` :471-472,
`name`/`set_count`/`total_volume` :491-493, `mesocycle_week_id` :564,
`joint_discomfort` :572, `pre_workout_intent` :634, `deleted_at` :793,
`sleep_quality`/`energy_score` :1474-1475.

**`workout_sets`** — `database.js:257` (`id, user_id, workout_id,
exercise_id, set_number, set_type DEFAULT 'straight', target_reps_min,
target_reps_max, actual_reps, weight, rir, rpe, failed, notes, post_set_pump,
post_set_muscle_connection, joint_discomfort, is_amrap, amrap_reps,
created_at, updated_at`); ALTERs: `missed_reps` :499, `deleted_at`/
`exercise_name` :794-795, `left_reps`/`right_reps` :1291-1292,
**`evidence_class` :2796**.

**No round column on `workout_sets`.** A station logs one working set per
round, so the round is derived:
`circuitRoundState({stationLogged, groupLogged, targetRounds})` —
`circuitRound.js:38` -> `{roundsStarted, round, targetRounds, missedRound}`
(rationale at :7-13, defect A8: stations desynchronised).
`evidence_class` is stamped at insert by the caller
(`database.js:4286,4313`; live screen `ActiveWorkoutScreen.js:2749,4237`).

- **PR detection**: `detectPR(newSet, historicalSets, exercise, units)` —
  `algorithms.js:465`; assisted-machine semantics invert (:475-495);
  cluster rows excluded via `isE1rmEligibleRow` (:473).
- **Live record line**: `buildRecordLine({weight, reps, historySets,
  units, isWarmup, exerciseType, loadSemantics, evidenceClass})` —
  `workoutRecordLine.js:54`; returns null for warm-ups, non
  weight-and-reps schemas, empty history, ballistic classes (:70-76).
  PURE, and reuses `detectPR` so promise and award cannot disagree
  (:9-18).
- **Volume/duration**: `summariseWorkoutSets(sets, {exerciseTypeById,
  loadSemanticsById})` — `algorithms.js:215` ->
  `{totalSets, workingSetCount, tonnage}`; denormalised onto the workout
  row as `set_count`/`total_volume`/`duration_minutes`.
  `allocateExerciseVolume(exercise)` — `algorithms.js:236`.
- **Share builders**: `topSetFromExerciseData`, `intensityTier(prCount,
  tonnage, sets)`, `shareSessionName(routineName, exerciseNames)` —
  `sessionShareData.js:18,49,67`. Weekly:
  `buildWeeklyRecapParams(output, {...})`, `isGreatWeek(output)` —
  `shareCard/greatWeek.js:87,40`; `buildRecapMilestoneData` —
  `shareCard/recapPayload.js:43`; renderer `shareCard/drawShareCard.js`.
  Best lift: `pickBestLift(weekSets, priorBestByExercise, e1rmFn)` —
  `bestLift.js:40`.
- **Reads**: `getWorkoutById` :3641, `getWorkoutSetsForWorkout` :4090,
  `getWorkoutSetsForWorkoutIds` :3904, `getWorkoutSetsForExercise` :4158,
  `getWorkoutSetsSince` :3882.

---

## 7. Blocks

`mesocycles` — `database.js:315` + `block_type`, `planned_weeks`,
`deload_protocol`, `rir_ladder`, `status` (:524-528), `deleted_at` :801,
`block_ledger` :2146, `progression_anchor_week` :2527.
`mesocycle_weeks` :529 (`week_index`, `is_deload`, `rir_target`,
`started_at`, `completed_at`).

**Start is recorded on ACTIVATION**:
`activatePlanWithBlock(userId, planId, planName, {ledger,
allowLearnedCarry})` — `database.js:5052`. Writes a LOCAL-day
`start_date` (:5109-5112), `end_date` six weeks out (:5115-5117),
`planned_weeks`/`deload_week` from `mesocycle.js:28-29`
(`BLOCK_PLANNED_WEEKS = 6`, `BLOCK_DELOAD_WEEK = 6`), `rir_ladder
'[3,2,1,0,0,4]'` (:5152), then `generateMesocycleWeeks(id)` (:5159). It
truncates the previous block's `end_date` to today on switch
(:5137-5141).

**"Block complete" has ONE definition**: `blockCompletionState(meso,
nowMs)` — `mesocycle.js:513` -> `BLOCK_COMPLETION.ACTIVE | COMPLETED |
ABANDONED` (:507), built on `getBlockStatus(startDateMs, plannedWeeks,
nowMs)` — `mesocycle.js:533`:

```js
{ status, awaitingDecision, currentWeek, totalWeeks, weeksOverdue, recoveryWeek }
// status: 'active' | 'recovery' | 'completed_awaiting_decision'
```

Both PURE with `nowMs` injected; `localDaysElapsed` (`mesocycle.js:73`)
is the DST-safe day counter.

**Week-complete / block-finished UI**: `HomeScreen.js:1678`
(`weekComplete`), `:2127` (`blockComplete` fact),
`src/lib/home/todayLineArbiter.js:60`, copy at
`weekCompleteLine(nextSessionName, nowMs)` — `planDisplay.js:98`.
`blockFinished` is also a senior input to the live prescription
(`livePrescription.js:442,943`).

**Session truth for a week**: `resolveWeekSessions({...})`
`blockProgression.js:242`; `requiredSessions(weekId, routines)` :202;
`executionSummary(sessions)` :326; `weekProgressionResolved` :312.

**Block summary material for a "training story"**:
`computeBlockPerformance({muscle, sets, exercisesById, priorSets,
workoutsById, blockStart, blockWeeks, deloadWeekIndex, reboundWindowsMs,
appliedEarlyDeloadWeekIndices})` — `blockMetrics.js:164` ->
`{e1rmSlopePct, prDensity, rawPrCount, eligibleExposures, confidence,
discontinuity, doseResponse}` (PURE); `effectiveBlockSlopePct` :475;
`proposeNextBlock({...})` / `reviewSections(proposal)` —
`blockReview.js:64,211`; `summariseSeededPlan` /
`buildBlockStartLines` / `buildLedgerReflectionRows` —
`blockExplain.js:160,244,324`;
`computeAndStoreBlockLedger(userId, mesocycleId, {force, userProfile})` /
`getAchievedWeeklyPeaks(userId)` — `blockLedgerRunner.js:228,527`.

---

## 8. Training styles

`STYLE_POOL_KEYS` — `src/lib/exercise/stylePools.js:37`:

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

Two pools HAND-CURATED (both kettlebell, RKC/StrongFirst competence
ordering, :12-19); the rest DERIVED at import time by equipment category
+ auto tier (`deriveByEquipment` :130-137, `STAPLE`/`COMMON` only).
`KETTLEBELL_NEVER_AUTO_EXCEPTIONS` (:121) is the closed list of
NEVER_AUTO ballistics a pool may carry.

Tagged plans: `style:kettlebell_foundations` `seedRoutines.js:2081,2113,2246`;
`style:kettlebell_experienced` :2156,2196,2366;
`style:circuit_dumbbell` :2280; `style:circuit_bodyweight` :2323;
`style:band` `seedRoutines.bandPlans.js:60,106`.

**Training-style separation — three enforcement points, one source:**
1. **Generation**: `generatePlan` restricts selection to
   `inputs.stylePool` (`planEngine.js:3163-3172`), fed from
   `stylePoolFor(styleKeyFromTags(currentPlan.tags))`
   (`planAutoGen.js:1000-1006`, `:1246-1252`).
2. **Swaps**: `.filter((ex) => !styleSet || styleSet.has(ex.name))`
   (`swapEngine.js:227`); "Show all exercises" relaxes it by omitting
   the option (:206-208).
3. **Serve-time capability substitution**: `substituteCandidateFilter`
   (`candidateScope.js:64`), added by F-14 because that lane was
   "style-blind and equipment-blind" — verbatim `:6-14`: a "no overhead"
   rule inside "Full-Body Circuit: Dumbbells" "could serve a barbell or
   a machine press to someone training at home with a pair of
   dumbbells."

Plus the **style LOCK** on regeneration (`styleLock.js:41`), covering
kettlebell/circuit/band only — "an unknown style must never silently
disable a rebuild path" (:32-35) — implemented once and imported by both
screens because "a rule implemented twice is a rule that drifts" (:18-22).

**Fail-open contract (load-bearing, stated twice):** an unknown/absent
style key is NO constraint, never an empty pool (`stylePools.js:186-191`,
`candidateScope.js:69-71`); a row with no equipment profiles (a custom
exercise) is never hidden (`candidateScope.js:31-34`,
`swapEngine.js:252-255`).

---

## 9. Tests to respect

- `src/lib/__tests__/copyPlanFromLibrary.structure.test.js` — every
  structural fact (tags, group_kind, round_rest_seconds) must reach the
  copy; real DB module on in-memory SQLite (A0 / A0b, P0).
- `src/lib/__tests__/activatePlanKeepingBlock.guard.test.js` — activation
  must not silently destroy the running block.
- `src/lib/__tests__/planDiff.keepsBlock.test.js` — when a rebuild keeps
  the block.
- `src/lib/__tests__/circuitRound.test.js` — round arithmetic derived
  once, cannot desynchronise across stations (F-13(e), F-17(h)).
- `src/lib/__tests__/database.circuitEvidenceMigration.test.js` — the
  three nullable columns exist with NO backfill; pre-migration rows NULL.
- `src/lib/__tests__/stylePlans.pools.test.js` — exact pool contents;
  foundations carries no single-arm swing/clean/snatch (EL-8, EL-11).
- `src/lib/__tests__/stylePlans.seedTags.test.js` — a beginner-tagged
  plan must never carry `style:kettlebell_experienced` (A11).
- `src/lib/__tests__/stylePlans.capability.test.js` — all eight style
  templates pass `computePlanCompatibility` like any library plan.
- `src/lib/__tests__/seedRoutines.bandPlans.test.js` — the two band plans
  exist and carry `style:band` (F-16 revised, A2/A14).
- `src/lib/__tests__/swapEngine.equipment.test.js` — a swap must never
  offer kit the athlete does not have (founder report 2026-08-19).
- `src/lib/__tests__/sessionEffective.styleEquipmentScope.test.js` —
  serve-time substitution is style- and equipment-scoped, asserting BY
  IDENTITY that `equipmentReachable` is the shared predicate (F-14).
- `src/lib/__tests__/planAutoGen.equipmentContinuity.test.js` — equipment
  loss survives the continuity/rebuild layer (founder report 2026-08-18).
- `src/lib/__tests__/capabilityPlanRewrite.test.js` — the baseline plan
  rewrite (CC33 D112 R1a/b; closes T1-03, T2-01).
- `src/lib/__tests__/capabilityGeneratedPlans.test.js`,
  `capabilityFamilyPlans.test.js`,
  `src/lib/exercise/__tests__/capabilityComposition.test.js` —
  capability + intent composition across generated plans and families.
- Engine invariants any adaptation work will hit:
  `planEngine.test.js`, `planEngineLibraryPool.test.js`,
  `planengineDayClamp.test.js`, `planengineRebuildPhase1..4.test.js`,
  `planAutoGen.test.js`, `campaign16.planFit.test.js`,
  `planFit`/`planDiff` suites.

---

## Cross-cutting notes for the payload designer

- **Sync**: plan rows already sync. `programmes` push map
  `src/lib/sync.js:917` (`source_programme_id`); `routine_exercises`
  `src/lib/sync.js:1032` (`starting_weight`, `rest_seconds`,
  `superset_group_id`). Circuit columns now travel:
  `CIRCUIT_SYNC_COLUMNS_ENABLED = true` (`src/lib/sync/featureFlags.js:26`)
  and `supabase/README.md:430-431` records migrations 158 and 159
  **APPLIED AND VERIFIED 2026-09-05**.
- **Aliases do NOT sync** (EL-19, `database.js:2825-2830`), so a shared
  plan cannot rely on the recipient's alias table for name resolution.
- Cloud pull appliers: `database.js:9759` (routines), `:9829`
  (programmes), `:9908`/`:9938` (routine_exercises), `:10516`
  (workout_sets incl. `evidence_class`).
