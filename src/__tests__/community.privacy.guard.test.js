/**
 * community.privacy.guard.test.js - blueprint section 10
 * (`docs/social-discovery-2026-09-06/30-BLUEPRINT.md`), SD-04.
 *
 * What this suite pins: the ONE thing Community must never do. Nothing
 * about a person's body, food, Progress Scan, coaching output, health
 * data or direct identity may enter it, in any form, from any file.
 *
 * A source-level guard rather than a behavioural one because the failure
 * mode is a future edit: someone adding a "nice touch" to a post card
 * that reads bodyweight, or a screen that shows the user's kcal beside
 * their session. A unit test only covers the code that exists today;
 * this covers the code nobody has written yet.
 *
 * A SECOND allowance, narrower still, for two files whose whole job is to
 * SAY what is never shared: `src/components/community/PrivacyReceipt.js`
 * (the "Others can see" / "Never shared" receipt) and
 * `src/screens/CommunityRulesScreen.js` (the versioned rules text, which
 * lists "Your bodyweight and body composition", "Your Progress Scan",
 * "Your nutrition and food diary"). Those words are USER-FACING COPY, the
 * opposite of a read: they are the promise itself. So for exactly those
 * two files, and no others, quoted string literals are stripped before the
 * scan and the remaining code is scanned as normal. A real read in either
 * file (a property access, an import, a database call) still fails, because
 * none of that is inside a string.
 *
 * ONE deliberate allowance, and why it is not a hole. The blueprint's
 * section 10 shorthand lists "capability" among the words no Community
 * file may read, while section 5.4 requires "Adapt for me" to compose
 * `loadCapabilityResolveState` and `blockingConflicts` by name. Both are
 * right: adaptation has to ask the recipient's own device whether a
 * movement clashes with their own rules, or it would serve them the
 * exact thing that layer exists to keep out. What must never happen is
 * a capability-derived FACT leaving the device (the Q4 ruling quoted at
 * `sessionEffective.js:723-726`: "no capability-derived event leaves the
 * device"). So the allowance is exactly two imports in exactly one file,
 * and the same file is forbidden from touching the transport.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const LIB_DIR = path.join(ROOT, 'src/lib/community');
const COMPONENT_DIR = path.join(ROOT, 'src/components/community');
const SCREEN_DIR = path.join(ROOT, 'src/screens');
const HOOK = path.join(ROOT, 'src/hooks/useCommunityMe.js');
const MIGRATION = path.join(ROOT, 'supabase/migrate_160_community.sql');

const { SENSITIVE_COMMUNITY_KEYS, POST_PAYLOAD_KEYS } = require('../lib/community/validation');
const { BLOCKED_TERMS } = require('../lib/community/keywordFilter');

/** Strip block and line comments so a rule NAMED in a comment (this file
 * is full of them, and so is the source) is never mistaken for a read. */
function code(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/** The two files that exist to say what is never shared (see the header).
 * Their copy names the forbidden things on purpose; their CODE still may
 * not read any of it. */
const COPY_ONLY_FILES = [
  'src/components/community/PrivacyReceipt.js',
  'src/screens/CommunityRulesScreen.js',
];

/** Strip quoted string literals, leaving the code around them. Applied to
 * the two copy-only files above and to nothing else. */
function stripStrings(source) {
  return source
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/`(?:\\.|[^`\\])*`/g, '``');
}

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

// The refusal list, as things a source file could plausibly READ. Kept
// as regexes so both the snake_case column and the camelCase field are
// caught, and so a partial word ("scanning", "agenda") is not.
const FORBIDDEN_READS = [
  /\bbodyweight\b/i,
  /\bbody_weight\b/i,
  /\bweight_kg\b/i,
  /\bbody_fat\b/i,
  /\bbf_pct\b/i,
  /\bffm\b/i,
  /\bfm_kg\b/i,
  /\bheight_cm\b/i,
  /\bkcal\b/i,
  /\bcalories\b/i,
  /\bmacros?\b/i,
  /\bfood_entries\b/i,
  /\bdaily_intake\b/i,
  /\bprogress_scan\b/i,
  /\bprogress_photos?\b/i,
  /\bprogressScan\b/,
  /\bed_pattern\b/i,
  /\bedPattern\b/,
  /\bscoff\b/i,
  /\bfirst_name\b/i,
  /\bfirstName\b/,
  /\bdate_of_birth\b/i,
  /\bdateOfBirth\b/,
  /\bweekly_?[Cc]oach\b/,
  /\bcoach_outputs?\b/i,
  /\bweight_log\b/i,
  /\bbody_composition_log\b/i,
  /\bcapability_constraints\b/i,
  /\bgetCapabilityConstraints\b/,
];

// The only Community file allowed to name the capability lane at all,
// and the only two symbols it may take from it (blueprint section 5.4).
const CAPABILITY_ALLOWED_FILE = path.join(LIB_DIR, 'adapt.js');
const CAPABILITY_ALLOWED_IMPORTS = [
  "import { bestEligibleSubstitute } from '../capability/effective';",
  "import { blockingConflicts, capabilityKnown, loadCapabilityResolveState } from '../capability/resolve';",
];

describe('no Community file reads personal data', () => {
  test('there is Community source to guard', () => {
    // If this ever fails, the guard has quietly stopped guarding
    // anything (a folder rename, a moved file) rather than passing.
    expect(communityFiles().length).toBeGreaterThan(10);
  });

  test.each(communityFiles().map((f) => [path.relative(ROOT, f), f]))(
    '%s reads nothing personal',
    (rel, full) => {
      // validation.js IS the refusal list. It names every forbidden key
      // on purpose, which is the one place that is correct.
      if (rel.endsWith('src/lib/community/validation.js')) return;
      const stripped = code(fs.readFileSync(full, 'utf8'));
      // The two copy-only files keep every line of code under the scan;
      // only their quoted copy is set aside (see the header).
      const source = COPY_ONLY_FILES.includes(rel.split(path.sep).join('/'))
        ? stripStrings(stripped)
        : stripped;
      for (const pattern of FORBIDDEN_READS) {
        expect(source).not.toMatch(pattern);
      }
    },
  );

  test('only adapt.js reaches the capability lane, and only for the two composed functions', () => {
    for (const full of communityFiles()) {
      const source = code(fs.readFileSync(full, 'utf8'));
      const imports = (source.match(/^import [^\n]*capability[^\n]*$/gim) ?? []).map((l) => l.trim());
      if (full === CAPABILITY_ALLOWED_FILE) {
        expect(imports.sort()).toEqual([...CAPABILITY_ALLOWED_IMPORTS].sort());
      } else {
        expect({ file: path.relative(ROOT, full), imports }).toEqual({
          file: path.relative(ROOT, full), imports: [],
        });
      }
    }
  });

  test('the adaptation lane cannot send anything to the server', () => {
    // Capability answers are read on the device to choose a substitute
    // and are written only to the recipient's own local rows. A route
    // from this file to the transport is how a capability-derived fact
    // would start leaving the device.
    const source = code(fs.readFileSync(CAPABILITY_ALLOWED_FILE, 'utf8'));
    expect(source).not.toMatch(/from '\.\/transport'/);
    expect(source).not.toMatch(/callCommunity|invokeCommunityFunction/);
  });

  test('no Community file imports the food, nutrition, wellbeing or ED modules', () => {
    for (const full of communityFiles()) {
      const source = code(fs.readFileSync(full, 'utf8'));
      for (const pattern of [
        /from '[^']*\/food\//, /from '[^']*nutritionEngine'/, /from '[^']*wellbeing'/,
        /from '[^']*edPatternDetector'/, /from '[^']*weeklyCoach'/, /from '[^']*coachApply'/,
        /from '[^']*progressScan[^']*'/,
      ]) {
        expect(source).not.toMatch(pattern);
      }
    }
  });
});

describe('the client and the SQL agree', () => {
  // The migration is written in a separate lane. These checks arm
  // themselves the moment the file lands, so the two copies of each list
  // can never drift once both exist. `describe` cannot be conditional
  // without hiding the reason, so the condition is stated in each test.
  const sql = fs.existsSync(MIGRATION) ? fs.readFileSync(MIGRATION, 'utf8') : null;

  test('the SQL forbidden-key list is the client refusal list', () => {
    if (!sql) { expect(fs.existsSync(MIGRATION)).toBe(false); return; }
    for (const key of SENSITIVE_COMMUNITY_KEYS) {
      expect(sql).toContain(`'${key}'`);
    }
  });

  test('the SQL blocked-terms array carries every client term', () => {
    if (!sql) { expect(fs.existsSync(MIGRATION)).toBe(false); return; }
    // The safety-critical direction. A term the client refuses but the
    // server accepts is a bypass: the client is a convenience, the
    // server is the rule. `keywordFilter.js` is the authority (blueprint
    // section 3: "the list is the same array as BLOCKED_TERMS"), so a
    // failure here is fixed by adding the named terms to
    // `_community_blocked_terms()`, never by shortening the client list.
    const missingFromSql = BLOCKED_TERMS.filter((term) => !sql.includes(`'${term}'`));
    expect({ missingFromSql }).toEqual({ missingFromSql: [] });
  });

  test('the SQL payload allow-lists are the client allow-lists', () => {
    if (!sql) { expect(fs.existsSync(MIGRATION)).toBe(false); return; }
    for (const keys of Object.values(POST_PAYLOAD_KEYS)) {
      for (const key of keys) expect(sql).toContain(`'${key}'`);
    }
  });
});
