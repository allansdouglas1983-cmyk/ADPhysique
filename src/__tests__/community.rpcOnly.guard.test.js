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
 * supabase/migrate_160_community.sql, or migrate_161_community_connections.sql
 * beneath it, stops saying that.
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

/**
 * ── migrate_161: connections, conversations and messages ─────────────────
 *
 * Same sentence, three more tables, and one of them holds MESSAGE BODIES:
 * the most private thing Community stores. So the rules above are re-run
 * against 161 rather than assumed to carry over, and four things specific to
 * this migration are pinned as well: the closed sets that decide what a
 * training profile may say are exposed as functions a client guard can read;
 * the three CHECK widenings keep every value they already had; erasure names
 * the three new tables from BOTH sides; and the rules-version gate exists at
 * all, because a re-consent path that no RPC enforces is not a consent path.
 */
const MIGRATION_161 = path.join(ROOT, 'supabase', 'migrate_161_community_connections.sql');
const SQL161 = fs.readFileSync(MIGRATION_161, 'utf8');
const CODE_LINES_161 = SQL161.split('\n').filter((l) => !l.trim().startsWith('--'));
const CODE_161 = CODE_LINES_161.join('\n');

const NEW_TABLES_161 = [
  'community_connections',
  'community_conversations',
  'community_messages',
];

function declaredIn(sql) {
  const out = [];
  const re = /CREATE OR REPLACE FUNCTION\s+public\.([a-z_0-9]+)\s*\(/g;
  let m;
  while ((m = re.exec(sql)) !== null) {
    const name = m[1];
    const bodyStart = sql.indexOf('AS $$', m.index);
    out.push({ name, header: sql.slice(m.index, bodyStart === -1 ? m.index + 400 : bodyStart) });
  }
  return out;
}

function signatureListIn(sql, revokeClause) {
  const at = sql.indexOf(revokeClause);
  if (at === -1) return [];
  const arrayStart = sql.lastIndexOf('FOREACH sig IN ARRAY ARRAY[', at);
  if (arrayStart === -1) return [];
  return [...sql.slice(arrayStart, at).matchAll(/'([a-z_0-9]+\([^']*\))'/g)].map((m) => m[1]);
}

const HELPER_SIGNATURES_161 = signatureListIn(
  SQL161, "REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated'",
);
const RPC_SIGNATURES_161 = signatureListIn(
  SQL161, "REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon'",
);
const FUNCTIONS_161 = declaredIn(SQL161).filter(
  (f) => f.name.startsWith('community_') || f.name.startsWith('_community_'),
);
const RPCS_161 = FUNCTIONS_161.filter((f) => f.name.startsWith('community_'));
const HELPERS_161 = FUNCTIONS_161.filter((f) => f.name.startsWith('_community_'));

describe('161: no connection or message row is reachable directly', () => {
  test.each(NEW_TABLES_161)('%s exists, has RLS on and is revoked', (table) => {
    expect(CODE_161).toContain(`CREATE TABLE IF NOT EXISTS public.${table} `);
    expect(CODE_161).toContain(`'${table}'`);
    expect(CODE_161).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(CODE_161).toMatch(/REVOKE ALL ON public\.%I FROM anon, authenticated/);
  });

  test('the RLS/revoke loop covers every new table by name', () => {
    const at = CODE_161.indexOf('FOREACH t IN ARRAY ARRAY[');
    const loop = CODE_161.slice(at, CODE_161.indexOf('END $$;', at));
    for (const table of NEW_TABLES_161) expect(loop).toContain(`'${table}'`);
  });

  test('the migration creates no policy at all', () => {
    expect(CODE_161).not.toMatch(/CREATE POLICY/i);
  });

  test('nothing grants a community table to anon or authenticated', () => {
    const grants = CODE_LINES_161.filter(
      (l) => /GRANT\s/i.test(l) && /community_/i.test(l) && !/ON FUNCTION/i.test(l),
    );
    expect(grants).toEqual([]);
  });
});

describe('161: every function is a pinned SECURITY DEFINER, granted deliberately', () => {
  test('it declares both RPCs and internal helpers', () => {
    expect(RPCS_161.length).toBeGreaterThanOrEqual(23);
    expect(HELPERS_161.length).toBeGreaterThanOrEqual(20);
  });

  test.each(FUNCTIONS_161.map((f) => [f.name, f]))(
    '%s is SECURITY DEFINER with a pinned search_path',
    (_name, fn) => {
      expect(fn.header).toMatch(/SECURITY DEFINER/);
      expect(fn.header).toMatch(/SET search_path = public, pg_temp/);
    },
  );

  test('the two privilege loops exist and say the right thing', () => {
    expect(CODE_161).toContain("REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated'");
    expect(CODE_161).toContain("REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon'");
    expect(CODE_161).toContain("GRANT EXECUTE ON FUNCTION public.%s TO authenticated'");
  });

  test.each(RPCS_161.map((f) => f.name))('%s is in the grant-to-authenticated list', (name) => {
    expect(RPC_SIGNATURES_161.some((sig) => sig.startsWith(`${name}(`))).toBe(true);
    expect(HELPER_SIGNATURES_161.some((sig) => sig.startsWith(`${name}(`))).toBe(false);
  });

  test.each(HELPERS_161.map((f) => f.name))('%s is in the revoke-from-authenticated list', (name) => {
    expect(HELPER_SIGNATURES_161.some((sig) => sig.startsWith(`${name}(`))).toBe(true);
    expect(RPC_SIGNATURES_161.some((sig) => sig.startsWith(`${name}(`))).toBe(false);
  });

  test('no helper is granted to authenticated anywhere', () => {
    for (const line of CODE_LINES_161.filter((l) => /GRANT EXECUTE ON FUNCTION/i.test(l))) {
      expect(line).not.toMatch(/public\._community_/);
    }
  });
});

describe('161: erasure covers connections and messaging completely', () => {
  const DELETE_BODY_161 = SQL161.slice(
    SQL161.indexOf('CREATE OR REPLACE FUNCTION public.delete_user_data()'),
    SQL161.indexOf('GRANT EXECUTE ON FUNCTION public.delete_user_data() TO authenticated'),
  );

  test('delete_user_data is re-issued IN FULL, keeping every earlier table', () => {
    expect(DELETE_BODY_161).toContain('CREATE OR REPLACE FUNCTION public.delete_user_data()');
    for (const table of ['workout_sets', 'food_entries', 'users_profile', 'user_prefs',
      'progress_photos', 'capability_constraints', 'consent_log',
      'community_profiles', 'community_follows', 'community_posts']) {
      expect(DELETE_BODY_161).toContain(table);
    }
  });

  test.each(NEW_TABLES_161)('delete_user_data names %s', (table) => {
    expect(DELETE_BODY_161).toContain(table);
  });

  test('the two-sided rows are deleted from both sides', () => {
    expect(DELETE_BODY_161).toMatch(
      /community_conversations WHERE user_a = uid OR user_b = uid/,
    );
    expect(DELETE_BODY_161).toMatch(
      /community_connections WHERE user_a = uid OR user_b = uid/,
    );
    expect(DELETE_BODY_161).toMatch(/community_messages WHERE sender_id = uid/);
  });

  test('community_leave takes the same three tables, two-sided', () => {
    const leave = CODE_161.slice(
      CODE_161.indexOf('CREATE OR REPLACE FUNCTION public.community_leave()'),
      CODE_161.indexOf('Part 15'),
    );
    expect(leave).toMatch(/DELETE FROM public\.community_messages WHERE sender_id = v_uid/);
    expect(leave).toMatch(
      /DELETE FROM public\.community_conversations WHERE user_a = v_uid OR user_b = v_uid/,
    );
    expect(leave).toMatch(
      /DELETE FROM public\.community_connections WHERE user_a = v_uid OR user_b = v_uid/,
    );
  });

  test('the users_profile delete stays last', () => {
    const connIdx = DELETE_BODY_161.indexOf('community_connections');
    const profileIdx = DELETE_BODY_161.indexOf('DELETE FROM users_profile WHERE id = uid;');
    expect(connIdx).toBeGreaterThan(-1);
    expect(profileIdx).toBeGreaterThan(connIdx);
  });
});

describe('161: the CHECK widenings keep every value they already had', () => {
  function checkBody(name) {
    const at = CODE_161.indexOf(`ADD CONSTRAINT ${name}`);
    expect(at).toBeGreaterThan(-1);
    return CODE_161.slice(at, CODE_161.indexOf(';', at));
  }

  test('community_activity.kind gains the two connection kinds and keeps 160s six', () => {
    const check = checkBody('community_activity_kind_check');
    for (const kind of ['follow', 'follow_request', 'follow_accepted', 'reaction',
      'comment', 'programme_used', 'connect_request', 'connect_accepted']) {
      expect(check).toContain(`'${kind}'`);
    }
  });

  test('community_reports.target_kind gains message and keeps the four', () => {
    const check = checkBody('community_reports_target_kind_check');
    for (const kind of ['profile', 'post', 'comment', 'programme', 'message']) {
      expect(check).toContain(`'${kind}'`);
    }
  });

  test('notification_preferences.category gains community_message and keeps all 25', () => {
    const check = checkBody('notification_preferences_category_check');
    for (const cat of ['daily_checkin_reminder', 'partner_cheer', 'rest_timer',
      'activation_nudge', 'community_follow', 'community_activity', 'community_message']) {
      expect(check).toContain(`'${cat}'`);
    }
  });
});

describe('161: the closed sets are readable, so the client cannot drift from them', () => {
  // SD-22: nothing finer than a band ever leaves the device, and a band the
  // server does not know is invalid input. These five functions are the
  // single definition in SQL; community.privacy.guard.test.js compares them
  // to the client constants character for character.
  const EXPECTED = {
    _community_tp_days_list: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
    _community_tp_time_bands_list: ['morning', 'midday', 'afternoon', 'evening', 'late'],
    _community_tp_sessions_list: ['1_2', '3', '4_5', '6_plus'],
    _community_tp_experience_list: ['new', 'intermediate', 'experienced'],
    _community_tp_age_bands_list: ['18_24', '25_34', '35_44', '45_54', '55_plus'],
  };

  test.each(Object.entries(EXPECTED))('%s returns exactly its set', (fn, values) => {
    const at = SQL161.indexOf(`CREATE OR REPLACE FUNCTION public.${fn}()`);
    expect(at).toBeGreaterThan(-1);
    const body = SQL161.slice(at, SQL161.indexOf('$$;', SQL161.indexOf('AS $$', at)));
    const literals = [...body.matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]);
    expect(literals).toEqual(values);
  });

  test('the connect reasons are the four the sheet offers', () => {
    const at = SQL161.indexOf('CREATE OR REPLACE FUNCTION public._community_connect_reasons_list()');
    const body = SQL161.slice(at, SQL161.indexOf('$$;', SQL161.indexOf('AS $$', at)));
    expect([...body.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]))
      .toEqual(['same_gym', 'same_programme', 'train_like_me', 'train_together']);
  });
});

describe('161: the new refusals and the rules gate exist', () => {
  test('the three new error codes are raised, not merely documented', () => {
    for (const code of ['not_connected', 'connect_not_allowed', 'minor_restricted',
      'rules_outdated']) {
      expect(CODE_161).toContain(`RAISE EXCEPTION USING message = '${code}'`);
    }
  });

  test('connect, send_message and the training profile all take the rules gate', () => {
    for (const fn of ['community_connect', 'community_send_message',
      'community_update_training_profile']) {
      const at = CODE_161.indexOf(`CREATE OR REPLACE FUNCTION public.${fn}(`);
      expect(at).toBeGreaterThan(-1);
      const body = CODE_161.slice(at, CODE_161.indexOf('END $$;', at));
      expect(body).toContain('_community_require_rules');
    }
  });

  test('a profile is created at the current rules version, never a literal', () => {
    const at = CODE_161.indexOf('CREATE OR REPLACE FUNCTION public.community_upsert_profile(');
    const body = CODE_161.slice(at, CODE_161.indexOf('END $$;', at));
    expect(body).toContain('v_accept IS DISTINCT FROM public._community_rules_version()');
    expect(body).toContain("VALUES (v_uid, 'community_visibility', true, now(),");
    expect(body).not.toMatch(/'active', 1, now\(\)\)/);
  });

  test('minors never connect or message, on either side', () => {
    for (const fn of ['community_connect', 'community_send_message']) {
      const at = CODE_161.indexOf(`CREATE OR REPLACE FUNCTION public.${fn}(`);
      const body = CODE_161.slice(at, CODE_161.indexOf('END $$;', at));
      expect(body).toMatch(/_community_caller_is_minor\(v_uid\) OR v_them\.is_minor/);
      expect(body).toContain("RAISE EXCEPTION USING message = 'minor_restricted'");
    }
  });

  test('messaging is refused unless the two people are connected', () => {
    const at = CODE_161.indexOf('CREATE OR REPLACE FUNCTION public.community_send_message(');
    const body = CODE_161.slice(at, CODE_161.indexOf('END $$;', at));
    expect(body).toMatch(/IF NOT public\._community_is_connected\(v_uid, _target\) THEN/);
    expect(body).toContain("RAISE EXCEPTION USING message = 'not_connected'");
  });

  test('the training profile nulls every band the payload leaves out', () => {
    const at = CODE_161.indexOf('CREATE OR REPLACE FUNCTION public.community_update_training_profile(');
    const body = CODE_161.slice(at, CODE_161.indexOf('END $$;', at));
    // The UPDATE assigns from local variables which start NULL, so an absent
    // key is an erasure rather than a value left behind (SD-22).
    for (const col of ['tp_days', 'tp_time_bands', 'tp_sessions_band', 'tp_staple_lifts',
      'tp_experience_band', 'tp_programme_key', 'tp_age_band']) {
      expect(body).toMatch(new RegExp(`${col}\\s*=\\s*v_`));
    }
    expect(body).toContain('public._community_forbidden_keys(_p)');
  });

  test('the age band is derived from the callers own record, never from the payload', () => {
    const at = CODE_161.indexOf('CREATE OR REPLACE FUNCTION public.community_update_training_profile(');
    const body = CODE_161.slice(at, CODE_161.indexOf('END $$;', at));
    expect(body).toContain('FROM public.user_body_profile');
    expect(body).toContain('WHERE user_id = v_uid');
    expect(body).toMatch(/NOT public\._community_caller_is_minor\(v_uid\)/);
    expect(body).not.toMatch(/_p ->> 'tp_age_band'/);
  });
});

describe('161: nothing in this campaign reads body, food or coaching data (SD-30)', () => {
  test('the only table outside Community it reads is the callers own date of birth', () => {
    const forbidden = [
      'morning_weights', 'body_metrics', 'progress_photos', 'food_entries',
      'daily_intake_rollups', 'nutrition_targets', 'coach_outputs',
      'weekly_checkins', 'capability_constraints', 'ed_pattern_flags',
    ];
    // delete_user_data names every table in the database by design, so it is
    // excluded: what this pins is the RPCs above it.
    const beforeErasure = CODE_161.slice(
      0, CODE_161.indexOf('CREATE OR REPLACE FUNCTION public.delete_user_data()'),
    );
    for (const table of forbidden) expect(beforeErasure).not.toContain(table);
    expect(beforeErasure).toContain('user_body_profile');
  });
});
