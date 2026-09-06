/**
 * Locks the SYNC_REGISTRY shape against the table list in
 * SYNC_ARCHITECTURE_LOCKED.md lines 29-153. A future PR that
 * accidentally drops or renames a registry entry fails here.
 */

import {
  SYNC_REGISTRY,
  getRegistryEntry,
  listSyncableTables,
  listBidirectionalTables,
  listPullOnlyTables,
} from '../registry';

const EXPECTED_TABLES = [
  'weekly_checkins_v2',
  'weight_log',
  'food_entries',
  'custom_foods',
  'saved_meals',
  'recipes',
  'recipe_ingredients',
  'food_favourites',
  'daily_water',
  'daily_intake_rollups',
  'daily_steps',
  'cardio_log',
  'ed_pattern_flags',
  'tier_history',
  'body_composition_log',
  'nutrition_targets',
  'effective_maintenance_memos', // canonical nutrition authority (cloud migration 141)
  'profiles',
  'notification_preferences',
  'meal_plans', // Theme G active-plan mirror (cloud migration 086)
  'plan_folders', // Hevy teardown R1 plan-folder organisation (cloud migration 089)
  'perday_target_offsets', // per-day calorie planning offsets, L05-PDT1 (cloud migration 110)
  'capability_constraints', // CC26 capability lane (cloud migration 145, APPLIED 2026-08-21 - supabase/README batch block)
  'session_constraint_effects', // CC26 per-workout effect provenance (cloud migration 146, APPLIED 2026-08-21 - supabase/README batch block)
];

describe('SYNC_REGISTRY shape', () => {
  test('every locked-spec table is present', () => {
    const actual = SYNC_REGISTRY.map(e => e.table).sort();
    expect(actual).toEqual([...EXPECTED_TABLES].sort());
  });

  test('every entry has the required keys', () => {
    for (const e of SYNC_REGISTRY) {
      expect(e).toHaveProperty('table');
      expect(e).toHaveProperty('pk');
      expect(e).toHaveProperty('conflictStrategy');
      expect(e).toHaveProperty('serverAuthoritative');
      expect(e).toHaveProperty('softDelete');
      expect(e).toHaveProperty('direction');
    }
  });

  test('conflictStrategy is one of the three locked strategies', () => {
    const allowed = new Set(['last_write_wins', 'server_wins', 'merge']);
    for (const e of SYNC_REGISTRY) {
      expect(allowed.has(e.conflictStrategy)).toBe(true);
    }
  });

  test('direction is bidirectional or pull_only', () => {
    const allowed = new Set(['bidirectional', 'pull_only']);
    for (const e of SYNC_REGISTRY) {
      expect(allowed.has(e.direction)).toBe(true);
    }
  });

  test('serverAuthoritative tables are pull_only', () => {
    for (const e of SYNC_REGISTRY) {
      if (e.serverAuthoritative) {
        expect(e.direction).toBe('pull_only');
      }
    }
  });

  test('getRegistryEntry returns the entry by table name', () => {
    const fe = getRegistryEntry('food_entries');
    expect(fe).not.toBeNull();
    expect(fe.softDelete).toBe(true);
    expect(getRegistryEntry('does_not_exist')).toBeNull();
  });

  test('listSyncableTables returns all locked tables', () => {
    expect(listSyncableTables()).toHaveLength(EXPECTED_TABLES.length);
  });

  test('bidirectional + pull_only partition the registry', () => {
    const all = listSyncableTables().length;
    const bidi = listBidirectionalTables().length;
    const pull = listPullOnlyTables().length;
    expect(bidi + pull).toBe(all);
  });
});
