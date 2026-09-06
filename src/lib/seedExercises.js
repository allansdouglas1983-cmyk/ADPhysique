import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getAllExercises, insertExerciseWithId, updateExerciseMetadata, mergeExerciseIdInto,
} from './database';
import { deriveExerciseMetadata } from './exerciseMetadata';
import { logError, logInfo } from './errorLog';
// Exercise-library-expansion-2026-09-05 (EL-14): the corpus replaces RAW
// and every seed-local name-keyed override map (SUBREGION_MAP,
// EXERCISE_TYPE_MAP, SINGLE_IMPLEMENT_TOTAL, ASSISTED_NAMES). One
// structured module, one mapping function (corpusEntryToSeedRow), used by
// the seed, the top-up and the re-derive alike, so the three can never
// drift the way the old per-row hand insert used to.
import { CORPUS, CORPUS_BY_NAME, RETIRED_ENTRIES, corpusEntryToSeedRow } from './exerciseCorpus';

const SEEDED_KEY = '@volyume_exercises_seeded_v7';
// Bumped when the derived metadata changes so the backfill re-runs once.
const METADATA_BACKFILL_KEY = '@volyume_exercise_metadata_backfilled_v1';
// Bumped when the metadata RULES change (not just new columns) so every
// canonical row is re-derived once, even ones the v1 backfill already filled.
// v2: equipment profiles now keep bodyweight compounds and bands out of
// loaded plans (founder direction, plans use measurable staples only).
// v3 (EL-14/EL-16/EL-21, exercise-library-expansion-2026-09-05): rewrites
// aliases, load_character, cue, exercise_category, increment_kg and coarse
// equipment (band/landmine/suspension reclassification) via the corpus
// mapping, on top of the columns v1/v2 already covered.
// v4 (D151, instruction contract): the cue column is now the joined
// setup/execution/watch text and the family audit rewrote many watch
// lines, so every canonical row takes the new instructions once.
// v5 (F-09, final-certification-2026-09-05): the search-alias repair.
// Sixteen garbled bulk-import aliases were deleted (one of them made
// "glute bridge" return Dumbbell Bench Press) and the "Flat ...",
// "Hamstring Curl" aliases the picker had no word for were added. The
// aliases column is written by corpusEntryToSeedRow, so without this
// bump an install that already ran v4 would keep the broken alias data
// for good and the search fix would only reach fresh installs.
// v6 (final pass S2, 2026-09-05): every delt-primary press now derives the
// overhead position, so a "no overhead" rule covers Seated Dumbbell Press,
// Z-Press, Log Press and the kettlebell presses on existing installs too.
const METADATA_REDERIVE_KEY = '@volyume_exercise_metadata_rederived_v6';
// Bumped when exercises are added to the corpus so the top-up scans for the
// new canonical IDs once on installs that already seeded an earlier list.
// v4 (EL-14/EL-15, exercise-library-expansion-2026-09-05): the corpus
// format migration itself — the 18 seedRoutines.js REQUIRED_EXERCISES rows
// fold in as canonical (id-remapped from their old random uid via the
// same-name merge below) and the six EL-21 duplicate pairs retire.
const LIBRARY_VERSION_KEY = '@volyume_exercise_library_topped_up_v4';

// ─── Deterministic canonical exercise IDs ────────────────────────────────
//
// The hash itself lives in ./exercise/canonicalId, a pure module with no
// storage or database imports, so planEngine and the corpus package can
// both stamp a canonical ID without pulling AsyncStorage into a pure
// module. Re-exported here because this is the import path the seed, the
// v18 re-id migration and the sync layer already use.
import { canonicalExerciseId } from './exercise/canonicalId';

export { canonicalExerciseId };

// deriveLoadSemantics moved to ./exercise/loadSemantics (EL-14) so
// exerciseCorpus/index.js can call it without importing this module (which
// pulls in AsyncStorage/database.js and cannot run under plain Node).
// Re-exported so every existing import of `deriveLoadSemantics` from
// seedExercises.js keeps working unchanged.
export { deriveLoadSemantics } from './exercise/loadSemantics';

export async function seedExercisesIfNeeded() {
  try {
    const seeded = await AsyncStorage.getItem(SEEDED_KEY);
    if (seeded === 'true') return;

    const existing = await getAllExercises();
    if (existing.length > 0) {
      await AsyncStorage.setItem(SEEDED_KEY, 'true');
      return;
    }

    // Batched: build every row first, then insert. corpusEntryToSeedRow is
    // pure, so this is safe to do outside the write loop and keeps the
    // fresh-install seed well under a second for the full corpus.
    const rows = CORPUS.map((entry) => [canonicalExerciseId(entry.name), corpusEntryToSeedRow(entry)]);
    for (const [id, row] of rows) {
      await insertExerciseWithId(id, row);
    }

    await AsyncStorage.setItem(SEEDED_KEY, 'true');
    // A fresh seed already carries the metadata and the full list, so mark
    // both follow-up passes done to skip the redundant work.
    await AsyncStorage.setItem(METADATA_BACKFILL_KEY, 'true');
    await AsyncStorage.setItem(METADATA_REDERIVE_KEY, 'true');
    await AsyncStorage.setItem(LIBRARY_VERSION_KEY, 'true');
    logInfo('seedExercises.seed', `Inserted ${rows.length} exercises`);
  } catch (err) {
    logSeedChainFailure('seedExercises.seedExercisesIfNeeded', err);
  }
}

// Idempotent top-up for installs that seeded an earlier, shorter corpus and
// would otherwise never receive exercises added later (the seed
// early-returns when any rows exist). For every corpus entry whose
// canonical ID is not already present: if a non-custom row with the SAME
// NAME (case-insensitive) exists under a different id — the exact shape
// the 18 former seedRoutines.js REQUIRED_EXERCISES rows are in, having
// been inserted with a random uid() before EL-15 — that row is re-idded to
// the canonical id via the shared merge helper (mergeExerciseIdInto,
// database.js — the same one the sync pull's own same-name merge uses);
// otherwise the row is freshly inserted. EL-21 retirement runs in the same
// pass: any existing row seeded under a now-retired name's canonical id
// merges into its survivor's id and is removed. Safe to re-run:
// insertExerciseWithId is INSERT OR IGNORE, mergeExerciseIdInto is a no-op
// once its `from` row is gone, and a version flag skips the scan once the
// current corpus is in. Custom exercises are untouched throughout.
export async function topUpNewExercisesIfNeeded() {
  try {
    const done = await AsyncStorage.getItem(LIBRARY_VERSION_KEY);
    if (done === 'true') return;

    const existing = await getAllExercises();
    const haveIds = new Set(existing.map((e) => e.id));
    const byNameLower = new Map(
      existing.filter((e) => !e.isCustom).map((e) => [String(e.name).toLowerCase().trim(), e]),
    );

    let added = 0;
    let reidded = 0;
    for (const entry of CORPUS) {
      const id = canonicalExerciseId(entry.name);
      if (haveIds.has(id)) continue;
      const dup = byNameLower.get(String(entry.name).toLowerCase().trim());
      if (dup && dup.id !== id) {
        await mergeExerciseIdInto(dup.id, id);
        reidded++;
      }
      await insertExerciseWithId(id, corpusEntryToSeedRow(entry));
      haveIds.add(id);
      added++;
    }

    let retired = 0;
    for (const { name, retiredInto } of RETIRED_ENTRIES) {
      const survivorId = canonicalExerciseId(retiredInto);
      if (!haveIds.has(survivorId)) continue; // survivor is a live CORPUS
      // entry, inserted (or re-idded here) by the loop above, so this
      // should never actually be false — defensive only.
      // EL-23 (05-DECISIONS.md): the six template-scaffolding rows shipped
      // on existing installs under a RANDOM id (they predate EL-15's
      // canonical-id-per-corpus-entry scheme), not necessarily under the
      // retired name's own canonical id. Match by name — case-insensitive,
      // non-custom, exactly like the same-name merge above — so a retired
      // name is found and merged under ANY id it happens to sit at, not
      // only its canonical one.
      const nameKey = String(name).toLowerCase().trim();
      const dup = byNameLower.get(nameKey);
      const retiredRowId = dup ? dup.id : null;
      if (retiredRowId && retiredRowId !== survivorId) {
        await mergeExerciseIdInto(retiredRowId, survivorId);
        haveIds.delete(retiredRowId);
        byNameLower.delete(nameKey);
        retired++;
      }
    }

    await AsyncStorage.setItem(LIBRARY_VERSION_KEY, 'true');
    if (added > 0 || reidded > 0 || retired > 0) {
      logInfo('seedExercises.topUp', `Topped up ${added} exercises, re-idded ${reidded} by name, retired ${retired}`);
    }
  } catch (err) {
    logSeedChainFailure('seedExercises.topUpNewExercisesIfNeeded', err);
  }
}

// One-time backfill for installs whose canonical exercises were seeded
// before the metadata columns existed (phase 7 step 1 added the columns;
// the seed early-returns when rows already exist, so those rows have null
// metadata). Derives and writes the columns in place. Idempotent and safe
// to re-run: it only touches rows whose equipment_category is still null,
// and a guard flag skips the pass entirely once done.
//
// Canonical exercises only (is_custom = 0). Custom exercises keep null
// metadata; selection falls back to their coarse equipment string.
export async function backfillExerciseMetadataIfNeeded() {
  try {
    const done = await AsyncStorage.getItem(METADATA_BACKFILL_KEY);
    if (done === 'true') return;

    const all = await getAllExercises();
    let updated = 0;
    for (const ex of all) {
      if (ex.isCustom === 1 || ex.isCustom === true) continue;
      if (ex.equipmentCategory) continue; // already populated
      await updateExerciseMetadata(ex.id, deriveExerciseMetadata(ex));
      updated++;
    }

    await AsyncStorage.setItem(METADATA_BACKFILL_KEY, 'true');
    if (updated > 0) logInfo('seedExercises.backfill', `Backfilled metadata on ${updated} exercises`);
  } catch (err) {
    logSeedChainFailure('seedExercises.backfillExerciseMetadataIfNeeded', err);
  }
}


// Founder clean-slate round (2026-07-13, Sentry VOLYUME-27): the boot-time
// seed/derive chain runs hundreds of statements fire-and-forget. When a
// concurrent database lifecycle event (the sign-in account switch or the
// sign-out wipe resetting local data) releases the connection mid-loop,
// the next statement rejects with "Cannot use shared object that was
// already released" / "cannot be cast to type expo.modules.sqlite...".
// That interruption is BENIGN: every task here is idempotent and
// version-flagged, and the flag is only written on completion, so the
// task simply re-runs on the next launch. It must therefore log as a
// breadcrumb-level info line, not a Sentry error. Walks the cause chain
// because the release detail can sit on a nested cause.
export function isDbLifecycleInterruption(err) {
  let node = err;
  for (let depth = 0; node && depth < 6; depth += 1) {
    const msg = String(node.message ?? node ?? '');
    if (/already released|cannot be cast to type expo\.modules\.sqlite|NativeDatabase.*(closed|released)/i.test(msg)) {
      return true;
    }
    node = node.cause;
  }
  return false;
}

function logSeedChainFailure(scope, err) {
  if (isDbLifecycleInterruption(err)) {
    logInfo(scope, `interrupted by a concurrent database reset; will re-run next launch (${String(err?.message ?? '').slice(0, 120)})`);
    return;
  }
  logError(scope, err);
}

// One-shot full re-derive for installs that ran the v1 backfill before the
// equipment-profile rules changed, and for the EL-14/EL-16/EL-21 corpus
// format migration. Unlike the backfill above (which only fills null
// rows), this recomputes EVERY derived column on every canonical row via
// the SAME corpusEntryToSeedRow mapping the seed and top-up use, so an
// existing install converges on exactly what a fresh install gets:
// aliases, load_character, cue, exercise_category, increment_kg and the
// coarse equipment column (band/landmine/suspension reclassification) are
// rewritten alongside the equipment-metadata/demand columns. A row whose
// name is not in the corpus (a custom exercise, or a name this build no
// longer recognises) is left untouched. Idempotent and version-guarded;
// canonical exercises are local, so this touches nothing that syncs.
export async function rederiveExerciseMetadataIfNeeded() {
  try {
    const done = await AsyncStorage.getItem(METADATA_REDERIVE_KEY);
    if (done === 'true') return;

    const all = await getAllExercises();
    let updated = 0;
    for (const ex of all) {
      if (ex.isCustom === 1 || ex.isCustom === true) continue;
      const entry = CORPUS_BY_NAME.get(ex.name);
      if (entry && !entry.retiredInto) {
        await updateExerciseMetadata(ex.id, corpusEntryToSeedRow(entry));
      } else {
        await updateExerciseMetadata(ex.id, deriveExerciseMetadata(ex));
      }
      updated++;
    }

    await AsyncStorage.setItem(METADATA_REDERIVE_KEY, 'true');
    if (updated > 0) logInfo('seedExercises.rederive', `Re-derived metadata on ${updated} exercises`);
  } catch (err) {
    logSeedChainFailure('seedExercises.rederiveExerciseMetadataIfNeeded', err);
  }
}

// ── Readiness for the routine seed (Sentry VOLYUME-28, 2026-09-06) ────────
// seedRoutinesIfNeeded reads getAllExercises() to resolve every template
// name. On an existing install updating to a build whose corpus has grown
// (the kettlebell and band families, 918 rows), that read used to race the
// fire-and-forget top-up below: Home mounted, the routine seed ran, and 90
// template names were "not found" for two seconds while the new rows were
// still being inserted. The kettlebell and band library plans were then
// created with stations missing, and the name dedupe froze them that way.
// The chain is now one promise the routine seed awaits, with a ceiling so
// a stuck chain can never hold the routine seed for ever.
let _chainPromise = null;

export async function runExerciseSeedChain() {
  if (_chainPromise) return _chainPromise;
  _chainPromise = (async () => {
    await seedExercisesIfNeeded();
    await topUpNewExercisesIfNeeded();
    await backfillExerciseMetadataIfNeeded();
    await rederiveExerciseMetadataIfNeeded();
  })().catch((err) => {
    // Every step logs its own failure; the chain itself never rejects, so
    // a waiter proceeds with whatever the table holds.
    logError('seedExercises.runExerciseSeedChain', err, {});
  });
  return _chainPromise;
}

/**
 * Resolves once the exercise seed chain has finished (or after `timeoutMs`,
 * whichever is first). Resolves immediately when no chain was ever started
 * in this process (tests, tools), so a caller can always await it.
 */
export function exercisesReady({ timeoutMs = 20000 } = {}) {
  if (!_chainPromise) return Promise.resolve();
  let timer;
  const ceiling = new Promise((resolve) => { timer = setTimeout(resolve, timeoutMs); });
  return Promise.race([_chainPromise, ceiling]).then(() => clearTimeout(timer));
}

/** Test seam: forget the chain so a suite can start a fresh one. */
export function _resetExerciseSeedChainForTests() { _chainPromise = null; }
