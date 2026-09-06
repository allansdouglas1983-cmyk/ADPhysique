/**
 * migrate_160_community.sql keeps the house migration shape.
 *
 * WHAT THIS SUITE PINS. CLAUDE.md section 2 ("Database schema") requires every
 * migration to be additive, idempotent, and headed with a note stating
 * purpose, applied-locally/remotely status, safe-to-re-run and rollback.
 * supabase/README.md then treats that header as the tracker of record. This
 * file is the largest migration in the repository and the first one to create
 * cross-user tables, so the two things most worth failing on are: the header
 * still says WRITTEN, NOT APPLIED (nobody has quietly marked it applied
 * without the founder's phrase), and every statement is still re-runnable.
 *
 * It is deliberately a SHAPE test. What the migration does is pinned by
 * community.rpcOnly.guard.test.js; what it promises about itself is pinned
 * here.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const MIGRATION = path.join(ROOT, 'supabase', 'migrate_160_community.sql');
const SQL = fs.readFileSync(MIGRATION, 'utf8');
const HEADER = SQL.slice(0, SQL.indexOf('-- ─── Part 1'));
const CODE = SQL.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');

describe('the mandatory header is present and honest', () => {
  test.each([
    ['Purpose', /^-- Purpose:/m],
    ['Push', /Push:/],
    ['Pull', /Pull:/],
    ['Applied locally', /^-- Applied locally:/m],
    ['Applied remotely', /^-- Applied remotely:/m],
    ['Safe to re-run', /^-- Safe to re-run:/m],
    ['Rollback', /^-- Rollback:/m],
    ['GDPR note', /^-- GDPR note:/m],
  ])('the header states %s', (_label, re) => {
    expect(HEADER).toMatch(re);
  });

  test('it names its authority document', () => {
    expect(HEADER).toContain('docs/social-discovery-2026-09-06/30-BLUEPRINT.md');
  });

  test('Applied remotely still says NO, awaiting the founder phrase', () => {
    // If this test ever fails because someone edited the header, the question
    // to ask is whether the founder actually gave the phrase for this batch,
    // not how to make the test pass.
    expect(HEADER).toMatch(/Applied remotely:\s+NO/);
    expect(HEADER).toContain('run against production');
  });

  test('Applied locally says N/A: Community adds no local SQLite table (SD-13)', () => {
    expect(HEADER).toMatch(/Applied locally:\s+N\/A/);
  });

  test('the GDPR note names the new data category and the consent type', () => {
    expect(HEADER).toContain('community_visibility');
    expect(HEADER).toMatch(/EU-Dublin/);
  });
});

describe('every statement is re-runnable', () => {
  test('tables and indexes use IF NOT EXISTS', () => {
    const creates = CODE.split('\n').filter((l) => /^CREATE (TABLE|INDEX|UNIQUE INDEX)/i.test(l.trim()));
    expect(creates.length).toBeGreaterThan(0);
    for (const line of creates) expect(line).toMatch(/IF NOT EXISTS/i);
  });

  test('added columns use ADD COLUMN IF NOT EXISTS', () => {
    const adds = CODE.split('\n').filter((l) => /ADD COLUMN/i.test(l));
    expect(adds.length).toBeGreaterThan(0);
    for (const line of adds) expect(line).toMatch(/ADD COLUMN IF NOT EXISTS/i);
  });

  test('every named CHECK is added inside a duplicate_object-tolerant block', () => {
    const blocks = SQL.match(/DO \$\$ BEGIN\s+ALTER TABLE[\s\S]*?EXCEPTION WHEN duplicate_object THEN NULL; END \$\$;/g) || [];
    expect(blocks.length).toBeGreaterThanOrEqual(12);
    const guardedChecks = blocks.join('\n').match(/ADD CONSTRAINT/g) || [];
    // The consent_log and notification_preferences CHECKs are the two
    // exceptions: they REPLACE an existing constraint, so they use the
    // drop-then-add form (migrate_102 / migrate_147 shape) instead.
    const allChecks = CODE.match(/ADD CONSTRAINT/g) || [];
    expect(allChecks.length - guardedChecks.length).toBe(2);
    expect(CODE).toContain('DROP CONSTRAINT IF EXISTS consent_log_consent_type_check');
    expect(CODE).toContain('DROP CONSTRAINT IF EXISTS notification_preferences_category_check');
  });

  test('every function is CREATE OR REPLACE, never a bare CREATE FUNCTION', () => {
    expect(CODE).not.toMatch(/^CREATE FUNCTION/m);
    expect((CODE.match(/CREATE OR REPLACE FUNCTION/g) || []).length).toBeGreaterThanOrEqual(70);
  });

  test('every trigger is dropped before it is created', () => {
    const created = [...CODE.matchAll(/CREATE TRIGGER\s+([a-z_0-9]+)/g)].map((m) => m[1]);
    expect(created.length).toBeGreaterThanOrEqual(8);
    for (const name of created) {
      expect(CODE).toMatch(new RegExp(`DROP TRIGGER IF EXISTS ${name} ON`));
    }
  });

  test('the moderator seed cannot duplicate or overwrite', () => {
    expect(CODE).toMatch(/INSERT INTO public\.community_moderators \(email\)[\s\S]*?ON CONFLICT DO NOTHING;/);
  });

  test('nothing destructive touches an existing table', () => {
    // DROP CONSTRAINT on the two CHECKs being widened is the only drop allowed;
    // a DROP TABLE / DROP COLUMN / TRUNCATE here would be a data loss event.
    expect(CODE).not.toMatch(/DROP TABLE/i);
    expect(CODE).not.toMatch(/DROP COLUMN/i);
    expect(CODE).not.toMatch(/TRUNCATE/i);
    const drops = CODE.split('\n').filter((l) => /^\s*(ALTER TABLE|DROP)/i.test(l) && /DROP/i.test(l));
    for (const line of drops) {
      expect(line).toMatch(/DROP (TRIGGER IF EXISTS|CONSTRAINT IF EXISTS)/i);
    }
  });

  test('it ends with an acceptance check over the catalogues', () => {
    expect(SQL).toContain('information_schema.tables');
    expect(SQL).toContain('relrowsecurity');
    expect(SQL).toContain('pg_policy');
    expect(SQL).toContain('prosecdef');
  });
});

describe('the file is registered in the tracker', () => {
  const README = fs.readFileSync(path.join(ROOT, 'supabase', 'README.md'), 'utf8');

  test('supabase/README.md carries the status entry and a ledger row', () => {
    expect(README).toContain('160 WRITTEN, NOT APPLIED (Community; founder gate)');
    expect(README).toContain('| 160 | `migrate_160_community.sql` |');
  });
});

/**
 * ── migrate_161_community_connections.sql keeps the same shape ───────────
 *
 * Same rules, same reasons. The one difference worth stating: 161 widens
 * three CHECKs that 160 already created, so it uses the drop-then-add form
 * for those three and the duplicate_object form for the constraints on its
 * own new tables. Both are pinned below, because "additive and idempotent" is
 * a promise about the whole file rather than about the parts that were easy.
 */
const MIGRATION_161 = path.join(ROOT, 'supabase', 'migrate_161_community_connections.sql');
const SQL161 = fs.readFileSync(MIGRATION_161, 'utf8');
const HEADER_161 = SQL161.slice(0, SQL161.indexOf('-- ─── Part 1'));
const CODE_161 = SQL161.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');

describe('161: the mandatory header is present and honest', () => {
  test.each([
    ['Purpose', /^-- Purpose:/m],
    ['Push', /Push:/],
    ['Pull', /Pull:/],
    ['Applied locally', /^-- Applied locally:/m],
    ['Applied remotely', /^-- Applied remotely:/m],
    ['Safe to re-run', /^-- Safe to re-run:/m],
    ['Rollback', /^-- Rollback:/m],
    ['GDPR note', /^-- GDPR note:/m],
  ])('the header states %s', (_label, re) => {
    expect(HEADER_161).toMatch(re);
  });

  test('it names its authority document', () => {
    expect(HEADER_161).toContain('docs/social-discovery-2026-09-06/');
    expect(HEADER_161).toContain('70-DISCOVERY-BLUEPRINT.md');
  });

  test('Applied remotely still says NO, awaiting the founder phrase', () => {
    expect(HEADER_161).toMatch(/Applied remotely:\s+NO/);
    expect(HEADER_161).toContain('run against production');
  });

  test('it records that it depends on 160 and must never run before it', () => {
    expect(HEADER_161).toContain('migrate_160');
  });

  test('Applied locally says N/A: this adds no local SQLite table either', () => {
    expect(HEADER_161).toMatch(/Applied locally:\s+N\/A/);
  });

  test('the GDPR note explains the bands and the age derivation', () => {
    expect(HEADER_161).toContain('tp_age_band');
    expect(HEADER_161).toContain('date_of_birth');
    expect(HEADER_161).toMatch(/coarse bands/i);
  });

  test('the rules version bump is recorded with its re-consent path', () => {
    expect(HEADER_161).toContain('rules_outdated');
    expect(HEADER_161).toContain('accept_rules_version');
    expect(HEADER_161).toContain('COMMUNITY-RULES.md');
  });
});

describe('161: every statement is re-runnable', () => {
  test('tables and indexes use IF NOT EXISTS', () => {
    const creates = CODE_161.split('\n')
      .filter((l) => /^CREATE (TABLE|INDEX|UNIQUE INDEX)/i.test(l.trim()));
    expect(creates.length).toBeGreaterThan(0);
    for (const line of creates) expect(line).toMatch(/IF NOT EXISTS/i);
  });

  test('added columns use ADD COLUMN IF NOT EXISTS', () => {
    const adds = CODE_161.split('\n').filter((l) => /ADD COLUMN/i.test(l));
    expect(adds.length).toBeGreaterThan(0);
    for (const line of adds) expect(line).toMatch(/ADD COLUMN IF NOT EXISTS/i);
  });

  test('new constraints are duplicate_object tolerant; the three widenings drop first', () => {
    const blocks = SQL161.match(
      /DO \$\$ BEGIN\s+ALTER TABLE[\s\S]*?EXCEPTION WHEN duplicate_object THEN NULL; END \$\$;/g,
    ) || [];
    expect(blocks.length).toBeGreaterThanOrEqual(5);
    const guarded = (blocks.join('\n').match(/ADD CONSTRAINT/g) || []).length;
    const all = (CODE_161.match(/ADD CONSTRAINT/g) || []).length;
    // Exactly three unguarded ADD CONSTRAINTs, and each is preceded by its own
    // DROP CONSTRAINT IF EXISTS inside a DO block.
    expect(all - guarded).toBe(3);
    for (const name of ['community_activity_kind_check',
      'community_reports_target_kind_check',
      'notification_preferences_category_check']) {
      expect(CODE_161).toContain(`DROP CONSTRAINT IF EXISTS ${name}`);
      expect(CODE_161).toContain(`ADD CONSTRAINT ${name}`);
    }
  });

  test('every function is CREATE OR REPLACE, never a bare CREATE FUNCTION', () => {
    expect(CODE_161).not.toMatch(/^CREATE FUNCTION/m);
    expect((CODE_161.match(/CREATE OR REPLACE FUNCTION/g) || []).length)
      .toBeGreaterThanOrEqual(44);
  });

  test('every trigger is dropped before it is created', () => {
    const created = [...CODE_161.matchAll(/CREATE TRIGGER\s+([a-z_0-9]+)/g)].map((m) => m[1]);
    expect(created.length).toBeGreaterThanOrEqual(2);
    for (const name of created) {
      expect(CODE_161).toMatch(new RegExp(`DROP TRIGGER IF EXISTS ${name} ON`));
    }
  });

  test('nothing destructive touches an existing table', () => {
    expect(CODE_161).not.toMatch(/DROP TABLE/i);
    expect(CODE_161).not.toMatch(/DROP COLUMN/i);
    expect(CODE_161).not.toMatch(/TRUNCATE/i);
    const drops = CODE_161.split('\n')
      .filter((l) => /^\s*(ALTER TABLE|DROP)/i.test(l) && /DROP/i.test(l));
    for (const line of drops) {
      expect(line).toMatch(/DROP (TRIGGER IF EXISTS|CONSTRAINT IF EXISTS)/i);
    }
  });

  test('it ends with an acceptance check over the catalogues', () => {
    expect(SQL161).toContain('information_schema.tables');
    expect(SQL161).toContain('relrowsecurity');
    expect(SQL161).toContain('pg_policy');
    expect(SQL161).toContain('prosecdef');
    expect(SQL161).toContain('pg_get_constraintdef');
  });
});

describe('161 is registered in the tracker', () => {
  const README = fs.readFileSync(path.join(ROOT, 'supabase', 'README.md'), 'utf8');

  test('supabase/README.md carries the status entry and a ledger row', () => {
    expect(README).toContain(
      '161 WRITTEN, NOT APPLIED (Community connections and messaging; founder gate)',
    );
    expect(README).toContain('| 161 | `migrate_161_community_connections.sql` |');
  });
});
