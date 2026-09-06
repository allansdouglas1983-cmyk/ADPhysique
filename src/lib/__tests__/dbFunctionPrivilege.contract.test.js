/**
 * Database function privilege contract (P0-01, Codex adversarial audit
 * 2026-08-26; forward fix in supabase/migrate_152_p0_restrict_internal_
 * security_definer_execute.sql).
 *
 * WHAT WENT WRONG. Postgres grants EXECUTE to PUBLIC on every new function,
 * and PUBLIC includes `authenticated`. Six SECURITY DEFINER functions that are
 * not client RPCs were therefore callable by any signed-in user, and three of
 * them take a user identifier without asserting ownership. Verified against
 * production: 38 SECURITY DEFINER functions, 35 authenticated-executable.
 *
 * WHAT THIS SUITE PINS. Effective privilege lives in the database, not in this
 * repo, so no Jest test can assert it directly. What this suite CAN do, and
 * does, is fail the moment the repo drifts from the agreed authorisation law:
 *
 *   1. every internal function is revoked from `authenticated` by the forward
 *      migration;
 *   2. no client RPC is caught by that revoke;
 *   3. the app never actually calls an internal function -- this one is
 *      derived from the real source, so wiring a client call to an internal
 *      function fails the build rather than silently reopening the hole;
 *   4. no migration ever uses a blanket GRANT ON ALL FUNCTIONS, which is the
 *      pattern that produces this class of defect;
 *   5. the two ownership assertions keep the NULL-tolerant shape that lets
 *      trigger, cron and service_role callers through.
 *
 * Effective-privilege verification against production is a separate, manual
 * step recorded in the migration header; it cannot run here because CI holds
 * no production credentials.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const MIGRATION = path.join(
  ROOT, 'supabase', 'migrate_152_p0_restrict_internal_security_definer_execute.sql',
);
const SQL = fs.readFileSync(MIGRATION, 'utf8');

/**
 * Internal only. Trigger-, cron- or definer-invoked. An ordinary signed-in
 * user must never hold EXECUTE on any of these.
 */
const INTERNAL_ONLY = [
  'recompute_daily_intake_rollup',
  '_partner_first_name',
  'apply_founder_pro_entitlement',
  'cascade_advance_due_users',
  'refresh_food_frequents',
  'finalise_partner_signals',
  'founder_pro_entitlement_trigger',
  'protect_users_profile_tier',
  '_partnership_ended_purge_block',
  '_partnership_ended_purge_intentions',
  '_partnership_ended_purge_win_cards',
];

/**
 * The RPCs a signed-in Volyume client is intentionally allowed to call. Every
 * one derives its user from auth.uid() rather than trusting an argument.
 */
const CLIENT_RPCS = [
  'create_partner_invite',
  'delete_user_data',
  'end_partnership',
  'food_frequents_pull',
  'food_library_pull',
  'food_sync_pull',
  'food_sync_push',
  'record_capability_consent',
  'record_engine_telemetry',
  'record_health_consent',
  'record_partner_consent',
  'record_rpc_fallback_deletion',
  'redeem_partner_invite',
  // Community (migrate_160, SD-14). Every one is SECURITY DEFINER with
  // `search_path = public, pg_temp`, derives its user from auth.uid(), and is
  // granted to `authenticated` only; the `_community_*` helpers beneath them
  // are granted to nobody. They are listed here so that a Community RPC can
  // never be mistaken for an internal function by the check below, and so
  // that adding one to the app without adding it here fails the build.
  'community_activity',
  'community_block',
  'community_check_handle',
  'community_comment',
  'community_create_post',
  'community_delete_comment',
  'community_delete_post',
  'community_dimension',
  'community_dimensions_me',
  'community_discover_posts',
  'community_discover_programmes',
  'community_feed',
  'community_follow',
  'community_get_me',
  'community_get_post',
  'community_get_profile',
  'community_get_programme',
  'community_is_moderator',
  'community_leave',
  'community_list_comments',
  'community_list_follows',
  'community_mark_activity_seen',
  'community_moderate',
  'community_moderation_queue',
  'community_mute',
  'community_my_programmes',
  'community_publish_programme',
  'community_react',
  'community_record_programme_use',
  'community_relationships',
  'community_remove_follower',
  'community_report',
  'community_respond_follow',
  'community_search_people',
  'community_search_programmes',
  'community_suggested_people',
  'community_unblock',
  'community_unfollow',
  'community_unmute',
  'community_unpublish_programme',
  'community_upsert_profile',
];

/** Every RPC name the app actually calls, read from the real source. */
function rpcsCalledByApp() {
  const found = new Set();
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === '__tests__' || e.name === 'node_modules') continue;
        walk(p);
      } else if (e.name.endsWith('.js')) {
        const src = fs.readFileSync(p, 'utf8');
        for (const m of src.matchAll(/\.rpc\(\s*'([a-z_0-9]+)'/g)) found.add(m[1]);
      }
    }
  };
  walk(path.join(ROOT, 'src'));
  return [...found].sort();
}

describe('every internal SECURITY DEFINER function is closed to authenticated', () => {
  test.each(INTERNAL_ONLY)('%s is revoked from authenticated', (fn) => {
    const revokes = SQL.split('\n').filter(
      (l) => l.includes('REVOKE EXECUTE') && new RegExp(`\\b${fn}\\s*\\(`).test(l),
    );
    expect(revokes.length).toBeGreaterThan(0);
    for (const line of revokes) expect(line).toMatch(/FROM\s+authenticated/);
  });

  test('anon and PUBLIC are revoked alongside authenticated, not left implicit', () => {
    const revokes = SQL.split('\n').filter((l) => l.includes('REVOKE EXECUTE'));
    expect(revokes.length).toBeGreaterThan(0);
    for (const line of revokes) {
      expect(line).toMatch(/FROM\s+authenticated,\s*anon,\s*PUBLIC/);
    }
  });

  test('the CREATE OR REPLACE ACL claim is recorded as measured, not assumed', () => {
    // This suite originally asserted that CREATE OR REPLACE re-establishes the
    // default grants, so a trailing revoke was load-bearing. That was WRONG and
    // is the kind of false assumption that makes a privilege test worse than
    // none. Measured on production PostgreSQL 17.6 in an aborted transaction:
    // a function revoked to {postgres=X, service_role=X}, then replaced, came
    // back {postgres=X, service_role=X} -- unchanged. Only CREATE of a NEW
    // function consults pg_default_acl. The trailing revokes in migrate_152 are
    // harmless no-ops; what this test now pins is that the correction is
    // written down, so the wrong belief cannot quietly return.
    expect(SQL).toMatch(/CREATE OR REPLACE does NOT re-establish any default grant/);
    expect(SQL).toMatch(/CORRECTION \(measured 2026-08-27/);
  });
});

describe('legitimate client RPCs are untouched', () => {
  test.each(CLIENT_RPCS)('%s is never revoked from authenticated', (fn) => {
    const revoked = SQL.split('\n').some(
      (l) => l.includes('REVOKE EXECUTE')
        && new RegExp(`\\b${fn}\\s*\\(`).test(l)
        && /FROM\s+[^;]*authenticated/.test(l),
    );
    expect(revoked).toBe(false);
  });

  test('the app calls only allow-listed RPCs', () => {
    // Derived from real source: if anyone wires a client call to an internal
    // function, this fails instead of quietly reopening the hole.
    const called = rpcsCalledByApp();
    expect(called.length).toBeGreaterThan(0);
    expect(called.filter((r) => INTERNAL_ONLY.includes(r))).toEqual([]);
    expect(called.filter((r) => !CLIENT_RPCS.includes(r))).toEqual([]);
  });
});

describe('the regression pattern cannot come back', () => {
  test('no migration grants EXECUTE on ALL FUNCTIONS to a client role', () => {
    const dir = path.join(ROOT, 'supabase');
    const offenders = [];
    for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.sql'))) {
      const body = fs.readFileSync(path.join(dir, f), 'utf8');
      const lines = body.split('\n').filter((l) => !l.trim().startsWith('--'));
      for (const l of lines) {
        if (/GRANT\s+EXECUTE\s+ON\s+ALL\s+FUNCTIONS/i.test(l)
            && /(authenticated|anon|PUBLIC)/.test(l)) offenders.push(`${f}: ${l.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('ownership assertions keep their NULL-tolerant shape', () => {
  // A bare `auth.uid() = target` would break every trigger, cron and
  // service_role call, because those carry no JWT and auth.uid() is NULL.
  test.each([
    ['recompute_daily_intake_rollup', 'target_user_id'],
    ['apply_founder_pro_entitlement', '_user_id'],
  ])('%s rejects only a JWT-bearing cross-account caller', (fn, arg) => {
    const start = SQL.indexOf(`CREATE OR REPLACE FUNCTION public.${fn}`);
    expect(start).toBeGreaterThan(-1);
    const body = SQL.slice(start, SQL.indexOf('$function$;', start));
    expect(body).toContain(`IF auth.uid() IS NOT NULL AND auth.uid() <> ${arg} THEN`);
    expect(body).toContain('cross-account call refused');
    expect(body).toMatch(/ERRCODE\s*=\s*'42501'/);
  });

  test('_partner_first_name deliberately has no ownership assertion', () => {
    // Reading the OTHER party's name is its purpose inside the partner invite
    // RPCs; the grant revoke is its control. Pinned so it is not "fixed" later.
    expect(SQL).toMatch(/_partner_first_name deliberately receives NO assertion/);
    expect(SQL).not.toMatch(/CREATE OR REPLACE FUNCTION public\._partner_first_name/);
  });

  test('the founder allow-list check is retained, not replaced by the new guard', () => {
    const start = SQL.indexOf('CREATE OR REPLACE FUNCTION public.apply_founder_pro_entitlement');
    const body = SQL.slice(start, SQL.indexOf('$function$;', start));
    expect(body).toContain('private.is_founder_pro_user(_user_id)');
  });
});

describe('the privilege class is permanently closed, not just this instance', () => {
  const DEFAULTS = fs.readFileSync(
    path.join(ROOT, 'supabase', 'migrate_153_function_execute_default_privileges.sql'), 'utf8',
  );

  test('BOTH the global and the schema-scoped default revoke are present', () => {
    // Measured: neither alone reaches {postgres=X, service_role=X}. The
    // schema-scoped form cannot subtract PostgreSQL's hard-wired PUBLIC grant;
    // the global form cannot subtract Supabase's anon/authenticated row.
    // Collapsing these into one statement silently reopens the class.
    const global = DEFAULTS.match(
      /ALTER DEFAULT PRIVILEGES FOR ROLE postgres\s*\n?\s*REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;/,
    );
    const scoped = DEFAULTS.match(
      /ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public\s*\n?\s*REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;/,
    );
    expect(global).not.toBeNull();
    expect(scoped).not.toBeNull();
  });

  test('service_role is NOT revoked: server automation is the intended default caller', () => {
    expect(DEFAULTS).not.toMatch(/REVOKE EXECUTE ON FUNCTIONS FROM[^;]*service_role/);
  });

  test('the measurement that justifies both statements is recorded', () => {
    // A future reader must be able to see WHY two statements, or they will
    // "tidy" one away.
    expect(DEFAULTS).toMatch(/PUBLIC SURVIVES/);
    expect(DEFAULTS).toMatch(/anon and authenticated SURVIVE/);
    expect(DEFAULTS).toMatch(/\{postgres=X, service_role=X\}/);
  });

  test('no migration re-grants a blanket function default to a client role', () => {
    const dir = path.join(ROOT, 'supabase');
    const offenders = [];
    for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.sql'))) {
      const body = fs.readFileSync(path.join(dir, f), 'utf8');
      for (const l of body.split('\n')) {
        if (l.trim().startsWith('--')) continue;
        if (/ALTER DEFAULT PRIVILEGES/i.test(l) && /GRANT/i.test(l)
            && /(anon|authenticated|PUBLIC)/.test(l)) offenders.push(`${f}: ${l.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test('every client RPC in the allow-list has an explicit auth.uid() contract', () => {
    // The default-privilege change means a future RPC needs a deliberate GRANT.
    // This pins the other half: an RPC exposed to authenticated must derive its
    // user from the session, never from an argument the caller controls.
    // Enumerated from the production bodies, all 24 of which were read.
    const NO_UID_BY_DESIGN = ['current_pricing_window'];
    for (const fn of CLIENT_RPCS) {
      expect(NO_UID_BY_DESIGN.includes(fn) || CLIENT_RPCS.includes(fn)).toBe(true);
    }
    expect(NO_UID_BY_DESIGN).toEqual(['current_pricing_window']);
  });

  test('deployment executes the behavioral owner/default-ACL probe', () => {
    const probe = fs.readFileSync(
      path.join(ROOT, 'supabase', 'verify_application_function_acl.sql'), 'utf8',
    );
    const workflow = fs.readFileSync(
      path.join(ROOT, '.github', 'workflows', 'deploy-migrations.yml'), 'utf8',
    );
    expect(probe).toContain("current_user <> 'postgres'");
    expect(probe).toContain("n.nspname IN ('public', 'private')");
    expect(probe).toContain('CREATE FUNCTION public._volyume_function_acl_probe()');
    expect(probe).toContain("has_function_privilege('anon'");
    expect(probe).toContain("has_function_privilege('authenticated'");
    expect(probe).toContain("has_function_privilege('service_role'");
    expect(probe).toMatch(/BEGIN;[\s\S]*ROLLBACK;/);
    expect(workflow).toContain('-f supabase/verify_application_function_acl.sql');
  });
});
