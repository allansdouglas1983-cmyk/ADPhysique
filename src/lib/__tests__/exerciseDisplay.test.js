import {
  matchesEquipmentFilter,
  matchesMuscleFilter,
  equipmentDisplayLabel,
  difficultyDisplayLabel,
  subregionDisplayLabel,
  PICKER_EQUIPMENT_CHIPS,
} from '../exerciseDisplay';
import { CORPUS, corpusEntryToSeedRow } from '../exerciseCorpus/index.js';

describe('matchesEquipmentFilter', () => {
  test('no filter matches everything', () => {
    expect(matchesEquipmentFilter({ equipment: 'barbell' }, null)).toBe(true);
    expect(matchesEquipmentFilter({ equipment: 'barbell' }, '')).toBe(true);
  });

  // The bug this module exists to fix: band moves keep the legacy
  // equipment='bodyweight' string but carry equipmentCategory='band'.
  test('Bands chip matches a band move classified only by category', () => {
    const bandMove = { equipment: 'bodyweight', equipmentCategory: 'band' };
    expect(matchesEquipmentFilter(bandMove, 'Bands')).toBe(true);
    // and it must NOT match the Bodyweight chip just because of the raw string
    expect(matchesEquipmentFilter(bandMove, 'Barbell')).toBe(false);
  });

  test('Bodyweight chip does not catch a reclassified band move', () => {
    const bandMove = { equipment: 'bodyweight', equipmentCategory: 'band' };
    // It still technically reads bodyweight in the legacy string, which is the
    // historical behaviour; the important guarantee is that Bands now works.
    expect(matchesEquipmentFilter({ equipment: 'bodyweight', equipmentCategory: 'bodyweight' }, 'Bodyweight')).toBe(true);
    expect(matchesEquipmentFilter(bandMove, 'Bands')).toBe(true);
  });

  test('Machine chip catches selectorised and plate-loaded', () => {
    expect(matchesEquipmentFilter({ equipmentCategory: 'machine_selectorised' }, 'Machine')).toBe(true);
    expect(matchesEquipmentFilter({ equipmentCategory: 'machine_plate_loaded' }, 'Machine')).toBe(true);
    expect(matchesEquipmentFilter({ equipmentCategory: 'barbell' }, 'Machine')).toBe(false);
  });

  test('Plate-loaded chip is specific to plate-loaded machines', () => {
    expect(matchesEquipmentFilter({ equipmentCategory: 'machine_plate_loaded' }, 'Plate-loaded')).toBe(true);
    expect(matchesEquipmentFilter({ equipmentCategory: 'machine_selectorised' }, 'Plate-loaded')).toBe(false);
  });

  test('Landmine chip matches the landmine category', () => {
    expect(matchesEquipmentFilter({ equipment: 'barbell', equipmentCategory: 'landmine' }, 'Landmine')).toBe(true);
    expect(matchesEquipmentFilter({ equipmentCategory: 'barbell' }, 'Landmine')).toBe(false);
  });

  test('Smith machine chip is distinct from generic machine', () => {
    expect(matchesEquipmentFilter({ equipmentCategory: 'smith' }, 'Smith Machine')).toBe(true);
    expect(matchesEquipmentFilter({ equipmentCategory: 'smith' }, 'Machine')).toBe(true);
  });

  test('Barbell chip catches an EZ-bar move reclassified to barbell', () => {
    expect(matchesEquipmentFilter({ equipment: 'ez_bar', equipmentCategory: 'barbell' }, 'Barbell')).toBe(true);
  });

  test('falls back to the raw string when no category is present', () => {
    expect(matchesEquipmentFilter({ equipment: 'Dumbbell' }, 'Dumbbell')).toBe(true);
    expect(matchesEquipmentFilter({ equipment: 'Cable' }, 'Barbell')).toBe(false);
  });
});

describe('matchesMuscleFilter', () => {
  test('no filter matches everything', () => {
    expect(matchesMuscleFilter({ primaryMuscle: 'chest' }, null)).toBe(true);
    expect(matchesMuscleFilter({ primaryMuscle: 'chest' }, '')).toBe(true);
  });

  test('matches the primary muscle key exactly', () => {
    expect(matchesMuscleFilter({ primaryMuscle: 'chest' }, 'chest')).toBe(true);
    expect(matchesMuscleFilter({ primaryMuscle: 'front_delts' }, 'front_delts')).toBe(true);
    expect(matchesMuscleFilter({ primaryMuscle: 'chest' }, 'back')).toBe(false);
  });

  test('is case-insensitive on the raw key', () => {
    expect(matchesMuscleFilter({ primaryMuscle: 'Chest' }, 'chest')).toBe(true);
    expect(matchesMuscleFilter({ primaryMuscle: 'chest' }, 'CHEST')).toBe(true);
  });

  test('a missing primary muscle never matches a set filter', () => {
    expect(matchesMuscleFilter({}, 'chest')).toBe(false);
    expect(matchesMuscleFilter({ primaryMuscle: null }, 'chest')).toBe(false);
  });
});

// The picker composes both filters with AND, so verify they intersect the way
// the modal's filter effect relies on (search + muscle + equipment all true).
describe('muscle + equipment filters compose', () => {
  const library = [
    { name: 'Barbell Bench Press', primaryMuscle: 'chest', equipment: 'barbell', equipmentCategory: 'barbell' },
    { name: 'Dumbbell Bench Press', primaryMuscle: 'chest', equipment: 'dumbbell', equipmentCategory: 'dumbbell' },
    { name: 'Barbell Row', primaryMuscle: 'back', equipment: 'barbell', equipmentCategory: 'barbell' },
  ];

  const apply = (muscle, equipment) =>
    library.filter(e => matchesMuscleFilter(e, muscle) && matchesEquipmentFilter(e, equipment));

  test('muscle filter alone narrows to that muscle', () => {
    expect(apply('chest', '').map(e => e.name)).toEqual(['Barbell Bench Press', 'Dumbbell Bench Press']);
  });

  test('equipment filter alone narrows to that equipment', () => {
    expect(apply('', 'Barbell').map(e => e.name)).toEqual(['Barbell Bench Press', 'Barbell Row']);
  });

  test('both filters intersect (chest AND barbell)', () => {
    expect(apply('chest', 'Barbell').map(e => e.name)).toEqual(['Barbell Bench Press']);
  });

  test('no filters returns the whole library', () => {
    expect(apply('', '')).toHaveLength(3);
  });
});

describe('equipmentDisplayLabel', () => {
  test('prefers a friendly label from the derived category', () => {
    expect(equipmentDisplayLabel({ equipmentCategory: 'machine_plate_loaded', equipment: 'machine' }))
      .toBe('Plate-loaded machine');
    expect(equipmentDisplayLabel({ equipmentCategory: 'band', equipment: 'bodyweight' }))
      .toBe('Resistance band');
    expect(equipmentDisplayLabel({ equipmentCategory: 'smith' })).toBe('Smith machine');
  });

  test('tidies the raw string when category is unknown', () => {
    expect(equipmentDisplayLabel({ equipment: 'ez_bar' })).toBe('Ez bar');
    expect(equipmentDisplayLabel({ equipmentCategory: 'other', equipment: 'sled' })).toBe('Sled');
  });

  test('returns null when nothing is known', () => {
    expect(equipmentDisplayLabel({})).toBeNull();
    expect(equipmentDisplayLabel(null)).toBeNull();
  });
});

describe('difficultyDisplayLabel', () => {
  test('maps numeric difficulty to a word', () => {
    expect(difficultyDisplayLabel({ difficulty: 1 })).toBe('Beginner');
    expect(difficultyDisplayLabel({ difficulty: 2 })).toBe('Intermediate');
    expect(difficultyDisplayLabel({ difficulty: 3 })).toBe('Advanced');
  });

  test('reads a custom exercise note token', () => {
    expect(difficultyDisplayLabel({ notes: 'difficulty:advanced' })).toBe('Advanced');
    expect(difficultyDisplayLabel({ notes: 'something difficulty:beginner else' })).toBe('Beginner');
  });

  test('handles numeric-as-string and returns null otherwise', () => {
    expect(difficultyDisplayLabel({ difficulty: '2' })).toBe('Intermediate');
    expect(difficultyDisplayLabel({})).toBeNull();
    expect(difficultyDisplayLabel({ notes: 'no token here' })).toBeNull();
  });
});

describe('subregionDisplayLabel', () => {
  test('humanises a token', () => {
    expect(subregionDisplayLabel('rear_delts')).toBe('Rear Delts');
    expect(subregionDisplayLabel('upper_chest')).toBe('Upper Chest');
  });

  test('returns null for empty', () => {
    expect(subregionDisplayLabel(null)).toBeNull();
    expect(subregionDisplayLabel('')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Certification 2026-09-06: the picker's chip row is a CONTRACT with the
// corpus, not a hand-kept list. The 2026-09-05 expansion added five
// equipment families (landmine, suspension, sandbag, medicine ball, sled)
// and the chip row was never extended, so 79 live rows could be reached
// only by typing a name: no chip matched them. These pin the chips against
// the REAL corpus so a new family can never ship chipless again.
// ---------------------------------------------------------------------------
describe('PICKER_EQUIPMENT_CHIPS against the real corpus', () => {
  const ROWS = CORPUS.map(corpusEntryToSeedRow);

  test('the chip row is the specified list, in order', () => {
    expect(PICKER_EQUIPMENT_CHIPS).toEqual([
      'Barbell', 'Dumbbell', 'Kettlebell', 'Cable', 'Machine',
      'Smith machine', 'Bodyweight', 'Bands', 'Landmine', 'Suspension',
      'Other',
    ]);
  });

  test('every live corpus row is reachable through at least one chip', () => {
    const unreachable = ROWS
      .filter(r => !PICKER_EQUIPMENT_CHIPS.some(c => matchesEquipmentFilter(r, c)))
      .map(r => `${r.name} (${r.equipmentCategory})`);
    expect(unreachable).toEqual([]);
  });

  test('each of the expansion families has a chip that finds it', () => {
    const countFor = (chip, category) => ROWS.filter(
      r => r.equipmentCategory === category && matchesEquipmentFilter(r, chip),
    ).length;
    expect(countFor('Landmine', 'landmine')).toBeGreaterThan(20);
    expect(countFor('Suspension', 'suspension')).toBeGreaterThan(30);
    expect(countFor('Kettlebell', 'kettlebell')).toBeGreaterThan(50);
    expect(countFor('Other', 'sandbag')).toBeGreaterThan(0);
    expect(countFor('Other', 'medicine_ball')).toBeGreaterThan(0);
    expect(countFor('Other', 'sled')).toBeGreaterThan(0);
  });

  // 'Machine' is deliberately absent from the named list below: its filter
  // has always matched the RAW string 'machine' too, so the eight
  // conditioning rows the seed lumps under equipment 'machine' (Assault
  // Bike, Sled Push, Tyre Flip...) but which derive to category 'other'
  // answer to both chips. That overlap is pre-existing and harmless, and
  // narrowing the Machine chip would hide those rows from legacy installs.
  test('the Other chip never claims a row a named chip already owns', () => {
    const owned = ROWS.filter(r => matchesEquipmentFilter(r, 'Other')
      && ['Barbell', 'Dumbbell', 'Kettlebell', 'Cable', 'Bodyweight', 'Bands', 'Landmine', 'Suspension', 'Smith machine']
        .some(c => matchesEquipmentFilter(r, c)))
      .map(r => r.name);
    expect(owned).toEqual([]);
  });

  test('a custom row with no derived metadata still lands under exactly one chip', () => {
    const custom = { name: 'My Move', equipment: 'dumbbell' };
    expect(matchesEquipmentFilter(custom, 'Dumbbell')).toBe(true);
    expect(matchesEquipmentFilter(custom, 'Other')).toBe(false);
    const unknown = { name: 'My Odd Move', equipment: '' };
    expect(matchesEquipmentFilter(unknown, 'Other')).toBe(true);
  });

  test('a barbell lift with bands on the bar is a Barbell chip row, not a Bands row', () => {
    const banded = ROWS.filter(r => /^(Band-Resisted|Reverse Band) /.test(r.name));
    expect(banded.length).toBe(6);
    for (const row of banded) {
      expect(row.equipmentCategory).toBe('barbell');
      expect(matchesEquipmentFilter(row, 'Barbell')).toBe(true);
      expect(matchesEquipmentFilter(row, 'Bands')).toBe(false);
      // ...and it reaches the two profiles that actually have a loaded bar.
      expect(row.equipmentProfiles).toEqual(['full_gym', 'barbell_plates']);
    }
  });
});
