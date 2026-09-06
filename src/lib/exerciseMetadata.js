// Exercise metadata derivation (docs/audit/volyume-exercise-audit-2026-05-30).
//
// The richer schema (04-metadata-schema-proposal) adds equipment_category,
// machine_type, force, laterality, difficulty, machine_ok, home_ok and
// equipment_profiles to every exercise. Rather than hand-edit 445 rows,
// these fields are DERIVED from what each exercise already carries (name,
// equipment, movement pattern, compound/isolation), with small override
// maps for the judgment calls the audit flagged: splitting the generic
// `machine` bucket into selectorised vs plate-loaded, and reclassifying
// landmine and band moves.
//
// Pure and dependency-free so it unit-tests without a database and so the
// seed and any backfill can both call it and get identical results. It
// reads no theme, no store, no SQLite.

// ── Equipment category ──────────────────────────────────────────────────
// The coarse `equipment` string stays for display and back-compat; this is
// the granular class selection logic reads. Allowed values match table A.

// A landmine move is a barbell in a landmine sleeve. The seed tags these
// `barbell`; the audit (05) wants them reclassified so the equipment filter
// and swap engine treat them as their own class.
const LANDMINE_RE = /\blandmine\b/i;

// Band moves are tagged `bodyweight` in the seed so the "Bands" library
// filter never matches them. Reclassify to `band`.
const BAND_RE = /\bband(ed)?\b/i;

// ...but ONLY for a row whose coarse equipment is that legacy `bodyweight`
// (or the corrected `band` the corpus now carries, or nothing at all). A
// row that names a band while carrying its OWN implement is that
// implement's lift with accommodating resistance, not a band movement:
// EL-4 (05-DECISIONS.md) files "chains, bands on bars" under specialty
// barbell work, never under the band family. Without this gate the six
// corpus rows "Band-Resisted Squat/Bench Press/Deadlift" and "Reverse Band
// Squat/Bench Press/Deadlift" (equipment 'barbell') derived to `band`,
// which put them under the picker's Bands chip instead of Barbell and,
// through PROFILES_BY_CATEGORY.band below, made them reachable ONLY in the
// no-equipment `bodyweight` profile and never in Full Gym or Barbell &
// Plates -- the two contexts that actually have a loaded bar.
const BAND_RECLASSIFIABLE_EQUIPMENT = new Set(['', 'bodyweight', 'band']);

// Plate-loaded / iso-lateral machines (Hammer Strength and the like) load a
// movement differently from a selectorised stack. Only relevant when the
// seed already calls it a `machine`; "Hammer Curl" is a dumbbell move, not a
// plate-loaded machine, so the equipment gate matters.
const PLATE_LOADED_RE = /hammer strength|plate-loaded|iso-lateral|\bhs\b/i;

// Conditioning / strongman implements the seed lumps under `machine` but
// which are not resistance machines and should not count towards the
// machine-only pathway.
const CONDITIONING_RE = /sled|prowler|battle rope|assault bike|cycling|tyre flip|rower|ski erg|treadmill|elliptical/i;

export function deriveEquipmentCategory(name, equipment) {
  const n = String(name || '');
  if (LANDMINE_RE.test(n)) return 'landmine';
  if (BAND_RE.test(n) && BAND_RECLASSIFIABLE_EQUIPMENT.has(String(equipment ?? ''))) return 'band';

  switch (equipment) {
    case 'barbell':       return 'barbell';
    case 'dumbbell':      return 'dumbbell';
    case 'cable':         return 'cable';
    case 'smith_machine': return 'smith';
    case 'kettlebell':    return 'kettlebell';
    case 'ez_bar':        return 'barbell'; // an EZ bar is a barbell variant for selection
    case 'bodyweight':    return 'bodyweight';
    // EL-21 (docs/exercise-library-expansion-2026-09-05/05-DECISIONS.md):
    // a suspension trainer (TRX, gymnastics rings) is its own equipment
    // family, not bodyweight — before this it had no category of its own
    // and fell through to 'other', which the pool generator drops entirely
    // (generatePoolFromLibrary skips equipmentCategory === 'other').
    case 'suspension':    return 'suspension';
    // The corpus sets `equipment` to the CORRECTED coarse family (EL-21,
    // vocab.js), so a band or landmine row states its own family rather
    // than relying on the legacy name regexes above. Explicit cases here
    // keep a future row whose name omits the word ("Pull-Apart",
    // "Meadows Row") out of the `other` bucket, which the pool generator
    // drops entirely.
    case 'band':          return 'band';
    case 'landmine':      return 'landmine';
    // exercise-library-expansion-2026-09-05 (integration stage 2, job 3):
    // sled/medicine_ball/sandbag get their own categories rather than
    // falling to 'other', so PROFILES_BY_CATEGORY below can give each its
    // real equipment context instead of the 'other' catch-all's bare
    // ['full_gym'].
    case 'sled':          return 'sled';
    case 'medicine_ball':  return 'medicine_ball';
    case 'sandbag':        return 'sandbag';
    case 'machine':
      if (CONDITIONING_RE.test(n)) return 'other';
      if (PLATE_LOADED_RE.test(n)) return 'machine_plate_loaded';
      return 'machine_selectorised';
    default:
      return 'other';
  }
}

// ── Equipment profiles ──────────────────────────────────────────────────
// Which equipment contexts an exercise is valid in. These strings are the
// exact values planEngine's pool filter consumes (filterPool reads `eq`),
// so the pool can later be generated from the library (06 section 0).
const PROFILES_BY_CATEGORY = {
  barbell:              ['full_gym', 'barbell_plates'],
  dumbbell:             ['full_gym', 'dumbbells_only', 'home_gym'],
  cable:                ['full_gym', 'machines_cables'],
  machine_selectorised: ['full_gym', 'machines_cables'],
  machine_plate_loaded: ['full_gym', 'machines_cables'],
  smith:                ['full_gym', 'machines_cables'],
  kettlebell:           ['full_gym', 'dumbbells_only', 'home_gym'],
  landmine:             ['full_gym', 'barbell_plates'],
  band:                 ['bodyweight'],
  bodyweight:           ['bodyweight'],
  // EL-21: a suspension trainer is cheap, portable home equipment, not a
  // full/machines-only or barbell-only context, and not the bare-bodyweight
  // profile either (the strap is required). full_gym and home_gym are the
  // two profiles that plausibly carry one.
  suspension:           ['full_gym', 'home_gym'],
  // exercise-library-expansion-2026-09-05 (integration stage 2, job 3):
  // sled and medicine ball work needs open floor space, so it reads as a
  // full-gym context only; a sandbag is common home/garage equipment, so
  // it also carries a home-gym profile like the dumbbell/kettlebell rows.
  sled:                 ['full_gym'],
  medicine_ball:        ['full_gym'],
  sandbag:              ['full_gym', 'home_gym'],
  other:                ['full_gym'],
};

// What load can a bodyweight exercise carry in a plan?
//  - Isolation / core (crunch, hanging leg raise, leg raise, plank) are gym
//    staples anyone trains at any level, so they belong in every plan.
//  - Compounds (pull-up, dip, push-up, inverted row) ask a lifter to move
//    their whole bodyweight, which not everyone can, so they are confined to
//    the no-equipment profile. A "weighted" variant (belt + plates) assumes
//    the unloaded version first, so it earns no generated-plan slot at all,
//    it stays in the library for anyone who wants to hand-pick it.
const BW_LOADED_PROFILES = ['full_gym', 'machines_cables', 'dumbbells_only', 'barbell_plates', 'home_gym', 'bodyweight'];
const WEIGHTED_BW_RE = /\bweighted\b/i;

// D10 (docs/ux-world-class-audit-2026-07-09/DECISIONS-2026-07-09.md §D10),
// reaffirmed and generalised by D19 (§D19, 2026-07-09, "amend the rule for
// this case"): ONE named exception to "bands never reach a loaded plan
// (measurable staples only)". D19's wording is the general form of the same
// exception D10 named directly: band exercises may enter a loaded plan ONLY
// for the vertical-pull movement pattern AND ONLY where the equipment
// context has zero measurable (non-band) vertical-pull alternative. Verified
// against the real generated pool (see poolGenerator.test.js): Dumbbells
// Only / Barbell & Plates / Home Gym have no non-band vertical_pull entry at
// all, so Band Lat Pulldown and Band Assisted Pull-Up become available there
// as accessories; Full Gym and Machines & Cables already carry cable lat
// pulldown variants, so they are deliberately left OUT of this list — those
// contexts have a measurable alternative and must never receive bands. The
// rule stands unchanged for every other band exercise, every other
// subregion and every other profile (band stays confined to `bodyweight`
// there).
const D10_BAND_LOADED_EXCEPTION_NAMES = new Set(['Band Lat Pulldown', 'Band Assisted Pull-Up']);
const D10_BAND_LOADED_EXCEPTION_PROFILES = ['bodyweight', 'dumbbells_only', 'barbell_plates', 'home_gym'];

export function deriveEquipmentProfiles(equipmentCategory, name, compoundIsolation) {
  if (equipmentCategory === 'bodyweight') {
    if (compoundIsolation === 'isolation') return [...BW_LOADED_PROFILES];
    if (WEIGHTED_BW_RE.test(String(name || ''))) return [];
    return ['bodyweight'];
  }
  if (equipmentCategory === 'band' && D10_BAND_LOADED_EXCEPTION_NAMES.has(String(name || ''))) {
    return [...D10_BAND_LOADED_EXCEPTION_PROFILES];
  }
  return [...(PROFILES_BY_CATEGORY[equipmentCategory] ?? ['full_gym'])];
}

// ── Force ───────────────────────────────────────────────────────────────
// push / pull / static, for antagonist pairing and pattern checks. Derived
// from the movement pattern, with isolation resolved by primary muscle
// (a curl pulls, an extension pushes, a raise is treated as a pull for
// pairing since it opposes pressing).
const PULL_MUSCLES = new Set([
  'back', 'biceps', 'rear_delts', 'traps', 'hamstrings', 'forearms',
]);
const STATIC_PATTERNS = new Set(['carry', 'core']);

export function deriveForce(movementPattern, primaryMuscle) {
  switch (movementPattern) {
    case 'push':
    case 'squat':
      return 'push';
    case 'pull':
    case 'hinge':
      return 'pull';
    case 'carry':
    case 'core':
      return 'static';
    case 'isolation':
      if (primaryMuscle === 'abs') return 'static';
      return PULL_MUSCLES.has(primaryMuscle) ? 'pull' : 'push';
    default:
      return STATIC_PATTERNS.has(movementPattern) ? 'static' : 'push';
  }
}

// ── Laterality ──────────────────────────────────────────────────────────
// bilateral / unilateral, for correct volume accounting (a unilateral set
// is per side) and balance. Detected from the name.
const UNILATERAL_RE = /single-arm|single-leg|one-arm|one-leg|bulgarian|split squat|\blunge\b|pistol|b-stance|concentration|kickback|step-up|curtsy|single arm|single leg|cossack|skater|shrimp/i;
// EL-21: "Alternating" (e.g. "Alternating Dumbbell Curl") is its own
// laterality value — one side works at a time like a unilateral movement,
// but both sides load across the set, which a plain 'unilateral' tag would
// misrepresent for volume accounting. Checked before the unilateral regex
// so an alternating name never falls through to 'unilateral'.
const ALTERNATING_RE = /\balternating\b/i;

export function deriveLaterality(name) {
  const n = String(name || '');
  if (ALTERNATING_RE.test(n)) return 'alternating';
  return UNILATERAL_RE.test(n) ? 'unilateral' : 'bilateral';
}

// ── Machine type ────────────────────────────────────────────────────────
// Controlled vocab (table C), set only for resistance machines so the
// machine-only pathway can verify coverage. Keyed by exact seed name.
// Exported (EL-14/07-CORPUS-FORMAT.md section 6) so the corpus guard can
// verify every name referenced here exists in the corpus or is a retired
// name — a rename that silently drops the override must fail the build,
// not fail closed to "no machine type".
export const MACHINE_TYPE_BY_NAME = {
  'Machine Chest Press':            'chest_press',
  'Incline Machine Press':          'incline_press',
  'Decline Machine Press':          'decline_press',
  'Hammer Strength Chest Press':    'chest_press',
  'Dip Machine':                    'assisted_dip',
  'Assisted Pull-Up':               'assisted_pullup',
  'Machine Row (Chest Supported)':  'chest_supported_row',
  'Seated Machine Row (Wide)':      'seated_row',
  'Machine Row (Hammer Strength)':  'seated_row',
  'Machine Lateral Raise':          'lateral_raise',
  'Machine Shoulder Press':         'shoulder_press',
  'Machine Rear Delt Fly':          'reverse_pec_deck',
  'Reverse Pec Deck':               'reverse_pec_deck',
  'Seated Rear Delt Machine':       'reverse_pec_deck',
  'Pec Deck (Machine Fly)':         'pec_deck',
  'Machine Curl':                   'bicep_curl_machine',
  'Machine Tricep Extension':       'triceps_extension',
  'Machine Crunch':                 'ab_crunch',
  'Hack Squat Machine':             'hack_squat',
  'Leg Press':                      'leg_press',
  'Single Leg Press':               'leg_press',
  'Leg Press (Narrow Stance)':      'leg_press',
  'Leg Press (High Foot)':          'leg_press',
  'Pendulum Squat':                 'pendulum_squat',
  'Leg Extension':                  'leg_extension',
  'Lying Leg Curl':                 'lying_leg_curl',
  'Seated Leg Curl':                'seated_leg_curl',
  'Standing Leg Curl':              'standing_leg_curl',
  'Prone Leg Curl':                 'lying_leg_curl',
  'Machine Hip Thrust':             'hip_thrust',
  'Abduction Machine':              'hip_abduction',
  'Donkey Kickback (Machine)':      'glute_kickback',
  'Standing Calf Raise (Machine)':  'calf_raise_standing',
  'Seated Calf Raise':              'calf_raise_seated',
  'Seated Machine Calf Raise':      'calf_raise_seated',
  'Leg Press Calf Raise':           'calf_raise_standing',
  'Neck Flexion (Machine)':         'neck_machine',
  'Neck Extension (Machine)':       'neck_machine',
};

export function deriveMachineType(name, equipmentCategory) {
  if (equipmentCategory !== 'machine_selectorised' && equipmentCategory !== 'machine_plate_loaded') {
    return null;
  }
  return MACHINE_TYPE_BY_NAME[name] ?? null;
}

// ── machine_ok / home_ok ────────────────────────────────────────────────
// Fast filter flags. machine_ok: usable in a machines-and-cables-only plan.
// home_ok: usable in a home / minimal plan.
export function deriveMachineOk(equipmentProfiles) {
  return equipmentProfiles.includes('machines_cables');
}

export function deriveHomeOk(equipmentProfiles) {
  return equipmentProfiles.includes('home_gym') || equipmentProfiles.includes('bodyweight');
}

// ── Difficulty ──────────────────────────────────────────────────────────
// 1 beginner, 2 intermediate, 3 advanced. Generated plans gate advanced
// lifts away from beginners (founder decision), so the value is functional,
// not just a label. Derived from a base per equipment category, then bumped
// to 3 for high-skill movements and dropped to 1 for simple ones.
const ADVANCED_RE = /snatch|clean|jerk|muscle-up|planche|pistol|nordic|dragon flag|front squat|deficit deadlift|good morning|overhead squat|zercher|sissy|handstand|ring|pull-over barbell/i;
const SIMPLE_RE = /machine|push-up|crunch|plank|leg extension|leg curl|pec deck|cable|lateral raise|calf raise|glute bridge|dead bug|bird dog|wall sit|hold|raise \(machine\)/i;

const DIFFICULTY_BASE = {
  barbell:              2,
  dumbbell:             2,
  cable:                1,
  machine_selectorised: 1,
  machine_plate_loaded: 1,
  smith:                1,
  kettlebell:           2,
  landmine:             2,
  band:                 1,
  bodyweight:           2,
  suspension:           2,
  // exercise-library-expansion-2026-09-05 (integration stage 2, job 3).
  sled:                 2,
  medicine_ball:        2,
  sandbag:              2,
  other:                1,
};

export function deriveDifficulty(name, equipmentCategory, fatigueCost) {
  const n = String(name || '');
  if (ADVANCED_RE.test(n)) return 3;
  let base = DIFFICULTY_BASE[equipmentCategory] ?? 2;
  // A heavy barbell compound is at least intermediate even if it slipped to
  // a simpler base; a high systemic-fatigue lift is rarely a true novice move.
  if (equipmentCategory === 'barbell' && (fatigueCost ?? 0) >= 4) base = Math.max(base, 2);
  if (SIMPLE_RE.test(n) && base > 1) base = 1;
  return base;
}

// ── Top-level deriver ───────────────────────────────────────────────────
// Given the existing fields of an exercise, return the derived metadata.
// `subregion` is intentionally NOT derived here: it has its own unified
// taxonomy work (04 table B) handled separately.
//
//   ex: { name, primaryMuscle, equipment, movementPattern,
//         compoundIsolation, fatigueCost }
//
// Returns { equipmentCategory, machineType, force, laterality, difficulty,
//           machineOk, homeOk, equipmentProfiles }.
export function deriveExerciseMetadata(ex) {
  const name = ex?.name;
  const equipment = ex?.equipment;
  const equipmentCategory = deriveEquipmentCategory(name, equipment);
  const equipmentProfiles = deriveEquipmentProfiles(equipmentCategory, name, ex?.compoundIsolation);
  return {
    equipmentCategory,
    machineType: deriveMachineType(name, equipmentCategory),
    force: deriveForce(ex?.movementPattern, ex?.primaryMuscle),
    laterality: deriveLaterality(name),
    difficulty: deriveDifficulty(name, equipmentCategory, ex?.fatigueCost),
    machineOk: deriveMachineOk(equipmentProfiles),
    homeOk: deriveHomeOk(equipmentProfiles),
    equipmentProfiles,
  };
}
