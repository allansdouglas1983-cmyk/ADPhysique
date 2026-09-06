/**
 * Community is RPC-ONLY (SD-14, blueprint section 3).
 *
 * WHAT THIS SUITE PINS, and why it is written to fail rather than to pass:
 * Community is the product's first cross-user surface. Every other table in
 * this database is owner-scoped, so a mistake there exposes a row to its own
 * owner. A mistake HERE exposes one person's data to a stranger. The whole
 * security model is therefore a single sentence: the community_* tables have
 * RLS enabled with no policy for anon or authenticated and no grants, and
 * SECURITY DEFINER RPCs pinned to a fixed search_path are the only way in or
 * out. Effective privilege lives in the database and no Jest test can read
 * it, so what this suite CAN do, and does, is fail the moment
 * supabase/migrate_160_community.sql stops saying that.
 *
 * It also pins the erasure surface: delete_user_data() must name every
 * community table, because a table added to the schema and forgotten there is
 * a GDPR defect that nothing else in the repo would catch.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const MIGRATION = path.join(ROOT, 'supabase', 'migrate_160_community.sql');
const SQL = fs.readFileSync(MIGRATION, 'utf8');

/** Statement lines only: a rule quoted in a comment proves nothing. */
const CODE_LINES = SQL.split('\n').filter((l) => !l.trim().startsWith('--'));
const CODE = CODE_LINES.join('\n');

const COMMUNITY_TABLES = [
  'community_profiles',
  'community_follows',
  'community_blocks',
  'community_mutes',
  'community_programmes',
  'community_programme_uses',
  'community_posts',
  'community_reactions',
  'community_comments',
  'community_reports',
  'community_moderators',
  'community_moderation_log',
  'community_activity',
  'community_rate_events',
];

/** Every function this migration declares, with its name and its full header. */
function declaredFunctions() {
  const out = [];
  const re = /CREATE OR REPLACE FUNCTION\s+public\.([a-z_0-9]+)\s*\(/g;
  let m;
  while ((m = re.exec(SQL)) !== null) {
    const name = m[1];
    const bodyStart = SQL.indexOf('AS $$', m.index);
    out.push({ name, header: SQL.slice(m.index, bodyStart === -1 ? m.index + 400 : bodyStart) });
  }
  return out;
}

/**
 * The two signature lists the privilege loops iterate. Reading them out of the
 * SQL is what makes the per-function tests below evidence rather than a
 * restatement of the same string.
 */
function signatureList(revokeClause) {
  const at = SQL.indexOf(revokeClause);
  if (at === -1) return [];
  const arrayStart = SQL.lastIndexOf('FOREACH sig IN ARRAY ARRAY[', at);
  if (arrayStart === -1) return [];
  const block = SQL.slice(arrayStart, at);
  return [...block.matchAll(/'([a-z_0-9]+\([^']*\))'/g)].map((m) => m[1]);
}

const HELPER_SIGNATURES = signatureList(
  "REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated'",
);
const RPC_SIGNATURES = signatureList("REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon'");

const FUNCTIONS = declaredFunctions();
const COMMUNITY_FUNCTIONS = FUNCTIONS.filter(
  (f) => f.name.startsWith('community_') || f.name.startsWith('_community_'),
);
const RPCS = COMMUNITY_FUNCTIONS.filter((f) => f.name.startsWith('community_'));
const HELPERS = COMMUNITY_FUNCTIONS.filter((f) => f.name.startsWith('_community_'));

describe('no community table is reachable directly', () => {
  test.each(COMMUNITY_TABLES)('%s exists, has RLS on and is revoked', (table) => {
    expect(CODE).toContain(`CREATE TABLE IF NOT EXISTS public.${table} `);
    // Both are issued by one loop over the table list, so the list is the proof.
    expect(CODE).toContain(`'${table}'`);
    expect(CODE).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(CODE).toMatch(/REVOKE ALL ON public\.%I FROM anon, authenticated/);
  });

  test('the RLS/revoke loop covers every community table by name', () => {
    const loop = CODE.slice(
      CODE.indexOf('FOREACH t IN ARRAY ARRAY['),
      CODE.indexOf('END $$;', CODE.indexOf('FOREACH t IN ARRAY ARRAY[')),
    );
    for (const table of COMMUNITY_TABLES) expect(loop).toContain(`'${table}'`);
  });

  test('the migration creates no policy at all', () => {
    // A policy is the only thing that could hand a community row to
    // authenticated or anon, so the safe number of them is zero.
    expect(CODE).not.toMatch(/CREATE POLICY/i);
  });

  test('nothing grants a community table to anon or authenticated', () => {
    const grants = CODE_LINES.filter(
      (l) => /GRANT\s/i.test(l) && /community_/i.test(l) && !/ON FUNCTION/i.test(l),
    );
    expect(grants).toEqual([]);
  });
});

describe('every community function is a pinned SECURITY DEFINER', () => {
  test('the migration declares both the RPCs and the internal helpers', () => {
    expect(RPCS.length).toBeGreaterThanOrEqual(41);
    expect(HELPERS.length).toBeGreaterThanOrEqual(25);
  });

  test.each(COMMUNITY_FUNCTIONS.map((f) => [f.name, f]))(
    '%s is SECURITY DEFINER with a pinned search_path',
    (_name, fn) => {
      expect(fn.header).toMatch(/SECURITY DEFINER/);
      expect(fn.header).toMatch(/SET search_path = public, pg_temp/);
    },
  );
});

describe('EXECUTE is granted deliberately, never by default', () => {
  test('the two privilege loops exist and say the right thing', () => {
    expect(CODE).toContain("REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated'");
    expect(CODE).toContain("REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon'");
    expect(CODE).toContain("GRANT EXECUTE ON FUNCTION public.%s TO authenticated'");
    expect(HELPER_SIGNATURES.length).toBeGreaterThanOrEqual(25);
    expect(RPC_SIGNATURES.length).toBeGreaterThanOrEqual(41);
  });

  test.each(RPCS.map((f) => f.name))('%s is in the grant-to-authenticated list', (name) => {
    expect(RPC_SIGNATURES.some((sig) => sig.startsWith(`${name}(`))).toBe(true);
    expect(HELPER_SIGNATURES.some((sig) => sig.startsWith(`${name}(`))).toBe(false);
  });

  test.each(HELPERS.map((f) => f.name))('%s is in the revoke-from-authenticated list', (name) => {
    expect(HELPER_SIGNATURES.some((sig) => sig.startsWith(`${name}(`))).toBe(true);
    expect(RPC_SIGNATURES.some((sig) => sig.startsWith(`${name}(`))).toBe(false);
  });

  test('no helper is granted to authenticated anywhere', () => {
    const grantLines = CODE_LINES.filter((l) => /GRANT EXECUTE ON FUNCTION/i.test(l));
    for (const line of grantLines) {
      expect(line).not.toMatch(/public\._community_/);
    }
  });
});

describe('erasure covers Community completely', () => {
  const DELETE_BODY = SQL.slice(
    SQL.indexOf('CREATE OR REPLACE FUNCTION public.delete_user_data()'),
    SQL.indexOf('GRANT EXECUTE ON FUNCTION public.delete_user_data() TO authenticated'),
  );

  test('delete_user_data is re-issued in this migration', () => {
    expect(DELETE_BODY).toContain('CREATE OR REPLACE FUNCTION public.delete_user_data()');
    // Re-issued IN FULL: the pre-existing tables must still be there, or this
    // migration would silently narrow the erasure it is meant to widen.
    for (const table of ['workout_sets', 'food_entries', 'users_profile', 'user_prefs',
      'progress_photos', 'capability_constraints', 'consent_log']) {
      expect(DELETE_BODY).toContain(table);
    }
  });

  test.each(COMMUNITY_TABLES)('delete_user_data names %s', (table) => {
    expect(DELETE_BODY).toContain(table);
  });

  test('rows naming two people are deleted from both sides', () => {
    expect(DELETE_BODY).toMatch(/community_follows WHERE follower_id = uid OR followee_id = uid/);
    expect(DELETE_BODY).toMatch(/community_blocks WHERE blocker_id = uid OR blocked_id = uid/);
    expect(DELETE_BODY).toMatch(/community_mutes WHERE muter_id = uid OR muted_id = uid/);
    expect(DELETE_BODY).toMatch(/community_activity WHERE user_id = uid OR actor_id = uid/);
  });

  test('the moderation audit trail is anonymised, not deleted', () => {
    expect(DELETE_BODY).toMatch(
      /UPDATE community_moderation_log SET moderator_id = NULL WHERE moderator_id = uid/,
    );
  });

  test('the users_profile delete stays last', () => {
    const communityIdx = DELETE_BODY.indexOf('community_profiles');
    const profileIdx = DELETE_BODY.indexOf('DELETE FROM users_profile WHERE id = uid;');
    expect(communityIdx).toBeGreaterThan(-1);
    expect(profileIdx).toBeGreaterThan(communityIdx);
  });
});

describe('consent is recorded on the existing rail', () => {
  test('the consent_log CHECK gains community_visibility and keeps every older value', () => {
    const check = CODE.slice(
      CODE.indexOf('ADD CONSTRAINT consent_log_consent_type_check'),
      CODE.indexOf(';', CODE.indexOf('ADD CONSTRAINT consent_log_consent_type_check')),
    );
    expect(check).toContain("'community_visibility'");
    for (const older of ['health_data', 'marketing', 'analytics',
      'partner_sharing', 'capability_data']) {
      expect(check).toContain(`'${older}'`);
    }
  });

  test('joining writes a granted row and leaving writes a withdrawal', () => {
    expect(CODE).toMatch(/VALUES \(v_uid, 'community_visibility', true, now\(\), '1'\)/);
    expect(CODE).toMatch(/VALUES \(v_uid, 'community_visibility', false, now\(\), '1'\)/);
  });
});
