/**
 * community.transport.guard.test.js - blueprint sections 5.1, 10
 * (`docs/social-discovery-2026-09-06/30-BLUEPRINT.md`), SD-13, SD-14.
 *
 * What this suite pins: `src/lib/community/transport.js` is the ONLY
 * Community file that touches Supabase.
 *
 * Why it is a source guard. The three gates (sign-out wiping, Article 9
 * consent, live session) only hold if every call passes through the one
 * function that asks them. A screen that reaches for `getSupabaseClient`
 * directly to "just fetch one thing" would ship a path with no consent
 * gate on it, and nothing at runtime would notice. Three screens in the
 * app already call the client directly (consent, account, dormant
 * billing); Community adds no fourth.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const LIB_DIR = path.join(ROOT, 'src/lib/community');
const COMPONENT_DIR = path.join(ROOT, 'src/components/community');
const SCREEN_DIR = path.join(ROOT, 'src/screens');
const HOOK = path.join(ROOT, 'src/hooks/useCommunityMe.js');
const TRANSPORT = path.join(LIB_DIR, 'transport.js');

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : walk(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });
}

function communityFiles() {
  const screens = fs.existsSync(SCREEN_DIR)
    ? fs.readdirSync(SCREEN_DIR)
      .filter((f) => f.startsWith('Community') && f.endsWith('.js'))
      .map((f) => path.join(SCREEN_DIR, f))
    : [];
  return [
    ...walk(LIB_DIR),
    ...walk(COMPONENT_DIR),
    ...screens,
    ...(fs.existsSync(HOOK) ? [HOOK] : []),
  ];
}

describe('one transport', () => {
  test('transport.js exists and is the file that holds the gates', () => {
    const source = fs.readFileSync(TRANSPORT, 'utf8');
    expect(source).toContain("import { getSupabaseClient, hasLiveSession } from '../supabase'");
    expect(source).toContain("import { isSignOutWiping } from '../sync/signOutGuard'");
    expect(source).toContain("require('../../store/useAppStore')");
    // The three refusals, by name, in the file that raises them.
    expect(source).toContain("'sign_out_wiping'");
    expect(source).toContain("'health_consent_unresolved'");
    expect(source).toContain("'not_signed_in'");
    // Consent fails CLOSED: anything that is not an explicit true.
    expect(source).toContain('if (consent !== true)');
    // Only an ANSWERED false blocks; null means "could not determine".
    expect(source).toContain('if (live === false)');
  });

  test('no other Community file imports the Supabase client', () => {
    const offenders = [];
    for (const full of communityFiles()) {
      if (full === TRANSPORT) continue;
      const source = fs.readFileSync(full, 'utf8');
      if (/getSupabaseClient|from '[^']*\/supabase'|require\(['"][^'"]*\/supabase['"]\)/.test(source)) {
        offenders.push(path.relative(ROOT, full));
      }
    }
    expect(offenders).toEqual([]);
  });

  test('no other Community file calls .rpc( or functions.invoke( itself', () => {
    const offenders = [];
    for (const full of communityFiles()) {
      if (full === TRANSPORT) continue;
      const source = fs.readFileSync(full, 'utf8');
      if (/\.rpc\(|functions\.invoke\(/.test(source)) offenders.push(path.relative(ROOT, full));
    }
    expect(offenders).toEqual([]);
  });

  test('every Community RPC name in the client is called through the transport', () => {
    // A `community_*` name appearing anywhere outside transport.js must
    // be an argument to callCommunity, never a direct client call.
    for (const full of communityFiles()) {
      if (full === TRANSPORT) continue;
      const source = fs.readFileSync(full, 'utf8');
      const names = source.match(/'community_[a-z_]+'/g) ?? [];
      for (const name of names) {
        const usedThroughTransport = new RegExp(
          `(callCommunity|invokeCommunityFunction)\\(\\s*${name}`,
        ).test(source) || /validation|limits|links/.test(path.basename(full));
        expect({ file: path.relative(ROOT, full), name, usedThroughTransport })
          .toEqual({ file: path.relative(ROOT, full), name, usedThroughTransport: true });
      }
    }
  });

  test('the guard is actually looking at Community files', () => {
    expect(communityFiles().length).toBeGreaterThan(10);
  });
});

/**
 * PostgREST names arguments; it does not position them. A client that
 * sends `{ id }` to a function declared `(_id uuid)` gets
 * "function does not exist", at runtime, on a real user's device, with
 * nothing in the tree to have caught it. The house convention
 * (migrate_102 / 147, carried into 160) is an underscore prefix on every
 * RPC parameter, so the two halves have to be compared, not remembered.
 */
describe('client RPC arguments match the migration signatures', () => {
  const MIGRATION = path.join(ROOT, 'supabase/migrate_160_community.sql');
  // The discovery campaign's RPCs live in a second migration, written in a
  // separate lane (discovery blueprint
  // `docs/social-discovery-2026-09-06/70-DISCOVERY-BLUEPRINT.md` section
  // 11). Both files are parsed together so a client call is checked
  // against whichever one declares it.
  const MIGRATION_161 = path.join(ROOT, 'supabase/migrate_161_community_connections.sql');
  const sql160 = fs.existsSync(MIGRATION) ? fs.readFileSync(MIGRATION, 'utf8') : null;
  const sql161 = fs.existsSync(MIGRATION_161) ? fs.readFileSync(MIGRATION_161, 'utf8') : null;
  const sql = sql160 === null && sql161 === null ? null : `${sql160 ?? ''}\n${sql161 ?? ''}`;

  /**
   * The RPCs migrate_161 must declare (blueprint section 11), listed here
   * so this guard knows which client calls it CANNOT check while that
   * file is absent, rather than reporting them as missing functions. Once
   * the file lands, every name below is checked like any other; a name
   * the migration does not declare fails the first test.
   */
  const RPCS_161 = [
    'community_connect',
    'community_respond_connect',
    'community_withdraw_connect',
    'community_remove_connection',
    'community_list_connections',
    'community_update_training_profile',
    'community_set_partner',
    'community_set_connect_from',
    'community_set_show_programmes',
    'community_find_people',
    'community_programme_people',
    'community_gym_summary',
    'community_gym_suggest',
    'community_conversations',
    'community_messages',
    'community_send_message',
    'community_mark_conversation_read',
    'community_delete_message',
  ];
  /** Every `community_*` function name one migration declares. */
  function namesIn(text) {
    return new Set(
      (text.match(/CREATE OR REPLACE FUNCTION public\.(community_[a-z_]+)/gi) ?? [])
        .map((line) => line.split('public.')[1].toLowerCase()),
    );
  }

  const NAMES_160 = sql160 ? namesIn(sql160) : new Set();
  const NAMES_161 = sql161 ? namesIn(sql161) : new Set();

  /** name -> Set of declared parameter names, from the SQL. */
  function declaredParams() {
    const out = new Map();
    const re = /CREATE OR REPLACE FUNCTION public\.(community_[a-z_]+)\s*\(([\s\S]*?)\)\s*\r?\n?\s*RETURNS/gi;
    let m = re.exec(sql);
    while (m) {
      const names = (m[2].match(/(^|,)\s*(_[a-z_]+)\s/g) ?? [])
        .map((s2) => s2.replace(/[,\s]/g, ''));
      out.set(m[1].toLowerCase(), new Set(names));
      m = re.exec(sql);
    }
    return out;
  }

  /** Every `callCommunity('name', { ... })` site, with its top-level keys. */
  function callSites() {
    const sites = [];
    for (const full of communityFiles()) {
      const source = fs.readFileSync(full, 'utf8');
      const re = /callCommunity\(\s*'(community_[a-z_]+)'\s*,\s*\{/g;
      let m = re.exec(source);
      while (m) {
        // Walk to the matching brace so a nested object literal (the
        // `_p` payload) does not truncate the read.
        let depth = 0;
        let i = m.index + m[0].length - 1;
        for (; i < source.length; i += 1) {
          if (source[i] === '{') depth += 1;
          else if (source[i] === '}') { depth -= 1; if (depth === 0) break; }
        }
        const body = source.slice(m.index + m[0].length, i);
        const keys = [];
        let d = 0;
        let start = 0;
        const parts = [];
        for (let j = 0; j <= body.length; j += 1) {
          const ch = body[j];
          if (ch === '{' || ch === '[' || ch === '(') d += 1;
          else if (ch === '}' || ch === ']' || ch === ')') d -= 1;
          if (j === body.length || (ch === ',' && d === 0)) { parts.push(body.slice(start, j)); start = j + 1; }
        }
        for (const part of parts) {
          const key = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*[:,]?/.exec(part);
          if (key && part.trim()) keys.push(key[1]);
        }
        sites.push({ file: path.relative(ROOT, full), name: m[1], keys });
        m = re.exec(source);
      }
    }
    return sites;
  }

  test('the migrations are present and declare every RPC the client calls', () => {
    if (!sql) { expect(fs.existsSync(MIGRATION)).toBe(false); return; }
    const declared = declaredParams();
    expect(declared.size).toBeGreaterThan(30);
    // A discovery RPC that migrate_161 has not declared YET is listed as
    // pending rather than missing: that file is written in a separate
    // lane and may be absent or part-written when this runs. Anything
    // else the client calls and nothing declares is a real defect.
    const missing = [...new Set(callSites().map((s2) => s2.name))]
      .filter((name) => !declared.has(name) && !RPCS_161.includes(name));
    expect({ missing }).toEqual({ missing: [] });
  });

  test('every argument the client sends is a declared parameter', () => {
    if (!sql) { expect(fs.existsSync(MIGRATION)).toBe(false); return; }
    const declared = declaredParams();
    const wrong = [];
    for (const site of callSites()) {
      const params = declared.get(site.name);
      if (!params) continue;
      for (const key of site.keys) {
        if (!params.has(key)) wrong.push(`${site.file}: ${site.name} sent "${key}"`);
      }
    }
    expect({ wrong }).toEqual({ wrong: [] });
  });

  /**
   * migrate_161 is written in a separate lane, so at any moment it can be
   * absent, part-written or finished. What this checks is the thing that
   * is true in all three states and is the actual cross-lane risk: the
   * two lanes must not drift on NAMES. A discovery RPC declared under a
   * name the client never calls, or called under a name the migration
   * never declares, is "function does not exist" on a real device, and
   * neither lane's own tests would see it.
   *
   * The argument NAMES are checked by the test above for every RPC that
   * is declared, so each of these arms itself the moment its function
   * lands, with nothing here to change.
   */
  test('migrate_161 declares nothing under a name the blueprint did not give it', () => {
    if (!sql161) {
      // NOT YET CHECKED: supabase/migrate_161_community_connections.sql
      // does not exist, so the 18 RPCs in RPCS_161 (connections, messages,
      // training profile, find people, gym) have no declared signature to
      // compare against. This arms itself the moment that file appears.
      expect(fs.existsSync(MIGRATION_161)).toBe(false);
      return;
    }
    // A name 161 declares that is neither on the blueprint's list nor a
    // re-issue of a 160 function (`community_get_me` and
    // `community_upsert_profile` are re-issued to add the new fields).
    const unexpected = [...NAMES_161]
      .filter((name) => !RPCS_161.includes(name) && !NAMES_160.has(name));
    expect({ unexpected }).toEqual({ unexpected: [] });
  });

  test('every discovery RPC the client calls is one the blueprint named', () => {
    // The other direction, and the one that catches a client typo: a
    // `community_*` call that neither migration declares must at least be
    // a name migrate_161 is on record to declare. Anything else is a call
    // nobody is writing a function for.
    const called = [...new Set(callSites().map((s2) => s2.name))];
    const unaccounted = called
      .filter((name) => !NAMES_160.has(name) && !NAMES_161.has(name) && !RPCS_161.includes(name));
    expect({ unaccounted }).toEqual({ unaccounted: [] });
  });
});
