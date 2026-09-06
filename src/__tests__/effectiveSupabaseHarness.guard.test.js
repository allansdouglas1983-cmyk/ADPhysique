const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const source = fs.readFileSync(
  path.join(ROOT, 'scripts/security/run-effective-supabase-matrix.cjs'),
  'utf8',
);
const inventory = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'scripts/security/supabase-matrix.targets.json'),
  'utf8',
));

describe('effective Supabase hostile-matrix harness', () => {
  test('cannot run accidentally or emit a partial-coverage verdict', () => {
    expect(source).toContain("DAYBREAK_ISOLATED_PROJECT_CONFIRM !== 'YES'");
    expect(source).toContain('Fixture coverage is incomplete');
    expect(source).toContain('Missing table targets');
    expect(source).toContain('Missing RPC targets');
  });

  test('does not mistake ordinary constraint/type failures for policy proof', () => {
    expect(source).toContain("evidence: explicitDenial ? 'explicit_policy_or_acl_denial'");
    expect(source).toContain("'non_policy_error'");
    expect(source).toContain('inconclusive');
    expect(source).toMatch(/verdict: all\.every\(\(check\) => check\.passed\)/);
    expect(source).toContain("expected === 'allow_nonempty'");
  });

  test('inventory includes every highest-risk child and private target', () => {
    const names = inventory.directPostgrestTables
      .map((item) => `${item.schema || 'public'}.${item.table}`);
    expect(names.length).toBeGreaterThanOrEqual(80);
    for (const name of [
      'public.routine_exercises', 'public.mesocycle_weeks', 'public.workout_sets',
      'public.planned_muscle_volume', 'public.adaptation_events',
      'public.recipe_ingredients', 'public.partner_cheers',
      'private.trial_ledger', 'private.founder_pro_ledger', 'private.trial_salt',
    ]) expect(names).toContain(name);
    expect(new Set(names).size).toBe(names.length);
  });

  test('every Community table is inventoried as rpc_only', () => {
    // SD-14: the community_* tables have RLS on with no policy for anon or
    // authenticated and all privileges revoked from both, so the ONLY correct
    // hostile-matrix expectation for every attack is a denial. `rpc_only`
    // records that disposition; the runner's default expectation is already
    // 'deny' for select, insert, update, delete and upsert, so a fixture that
    // covers these tables without stating expectations asserts exactly this.
    const COMMUNITY_TABLES = [
      'community_profiles', 'community_follows', 'community_blocks',
      'community_mutes', 'community_programmes', 'community_programme_uses',
      'community_posts', 'community_reactions', 'community_comments',
      'community_reports', 'community_moderators', 'community_moderation_log',
      'community_activity', 'community_rate_events',
      // migrate_161: the connection graph and messaging. A message body is
      // the most private thing Community stores, so the only correct
      // hostile-matrix expectation for these three is a denial on every
      // attack, exactly as for the fourteen above.
      'community_connections', 'community_conversations', 'community_messages',
    ];
    const byName = new Map(
      inventory.directPostgrestTables.map((item) => [`${item.schema || 'public'}.${item.table}`, item]),
    );
    for (const table of COMMUNITY_TABLES) {
      const entry = byName.get(`public.${table}`);
      expect(entry).toBeDefined();
      expect(entry.disposition).toBe('rpc_only');
    }
    expect(source).toContain("const selectExpected = item.expectations?.select_foreign || 'deny'");
    expect(source).toContain("const expected = item.expectations?.[attack] || 'deny'");
  });

  test('every Community RPC is inventoried, because each is the sole ingress to its table', () => {
    const communityRpcs = inventory.clientRpcNames.filter((n) => n.startsWith('community_'));
    expect(communityRpcs.length).toBeGreaterThanOrEqual(59);
    for (const name of [
      'community_get_me', 'community_upsert_profile', 'community_leave',
      'community_follow', 'community_block', 'community_publish_programme',
      'community_create_post', 'community_report', 'community_moderate',
      // migrate_161.
      'community_connect', 'community_respond_connect', 'community_send_message',
      'community_find_people', 'community_update_training_profile',
      'community_conversations', 'community_messages',
    ]) expect(inventory.clientRpcNames).toContain(name);
    // The internal helpers are NOT client RPCs and must never be listed as
    // ones: they are revoked from authenticated entirely.
    expect(inventory.clientRpcNames.filter((n) => n.startsWith('_community_'))).toEqual([]);
  });

  test('RPC inventory includes ownership, entitlement, food and partner boundaries', () => {
    for (const name of [
      'delete_user_data', 'clear_goal_lock', 'record_engine_telemetry',
      'record_health_consent', 'record_capability_consent', 'food_sync_pull',
      'food_sync_push', 'food_library_pull', 'current_pricing_window',
      'start_cascade', 'upgrade_tier', 'food_frequents_pull',
      'create_partner_invite', 'redeem_partner_invite', 'end_partnership',
      'record_rpc_fallback_deletion', 'record_partner_consent',
    ]) expect(inventory.clientRpcNames).toContain(name);
  });
});
