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

/**
 * The discovery campaign's files (discovery blueprint
 * `docs/social-discovery-2026-09-06/70-DISCOVERY-BLUEPRINT.md` section 3;
 * SD-30). These are the first Community files that read the training
 * history at all, which makes them the first place a body, food or
 * coaching read could plausibly be added by someone reaching for "one
 * more useful signal". They are named here so a rename cannot quietly
 * drop them out of the walk, and they are held to a STRICTER list than
 * the rest: none of them has the adaptation lane's reason to name the
 * capability layer, so for these four the bare words are refused too.
 */
const DISCOVERY_FILES = [
  'src/lib/community/trainingProfile.js',
  'src/lib/community/connections.js',
  'src/lib/community/messages.js',
  'src/lib/community/findPeople.js',
];

const DISCOVERY_EXTRA_FORBIDDEN = [
  /\bscan\b/i,
  /\bcapability\b/i,
  /\bcapabilities\b/i,
  /\bprotein\b/i,
  /\bcarbs\b/i,
  /\bcheck_?in\b/i,
  /\binjur/i,
  /\blimitation\b/i,
  /\bmeasurement/i,
  /\bage\b(?!_band)/i,
];

/**
 * The ONLY device reads `trainingProfile.js` may make (SD-30: "the
 * training profile reads completed-workout timestamps and exercise ids
 * only"). An allow-list rather than a deny-list, for the same reason the
 * post payloads are: a database helper added to the app next year cannot
 * be pulled in here, because it was never named.
 */
const TRAINING_PROFILE_FILE = path.join(LIB_DIR, 'trainingProfile.js');
const TRAINING_PROFILE_DB_READS = [
  'getCompletedWorkoutStartTimestamps',
  'getWorkoutSetsSince',
  'getAllExercises',
  'getActivePlan',
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

  test('every discovery file is present and inside the walk', () => {
    // A rename that moved one of these out of src/lib/community would
    // leave the guard passing over a file it no longer sees.
    const walked = new Set(communityFiles().map((f) => path.relative(ROOT, f).split(path.sep).join('/')));
    const missing = DISCOVERY_FILES.filter((rel) => !walked.has(rel));
    expect({ missing }).toEqual({ missing: [] });
  });

  test.each(DISCOVERY_FILES)('%s reads nothing personal, on the stricter list', (rel) => {
    const source = code(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
    for (const pattern of [...FORBIDDEN_READS, ...DISCOVERY_EXTRA_FORBIDDEN]) {
      expect({ rel, pattern: String(pattern), matched: pattern.test(source) })
        .toEqual({ rel, pattern: String(pattern), matched: false });
    }
  });

  test('trainingProfile.js reads only the four device functions SD-30 allows', () => {
    const source = code(fs.readFileSync(TRAINING_PROFILE_FILE, 'utf8'));
    // The single database import, and everything it takes from it.
    const imports = source.match(/import\s*\{[^}]*\}\s*from\s*'\.\.\/database';/g) ?? [];
    expect(imports).toHaveLength(1);
    const named = imports[0]
      .replace(/^import\s*\{|\}\s*from\s*'\.\.\/database';$/g, '')
      .split(',')
      .map((s2) => s2.trim())
      .filter(Boolean);
    expect(named.sort()).toEqual([...TRAINING_PROFILE_DB_READS].sort());
    // And no second route to the device: a lazy require would sidestep
    // the import above entirely.
    expect(source).not.toMatch(/require\(['"][^'"]*database['"]\)/);
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

/**
 * The training profile's closed sets exist twice: once in
 * `trainingProfile.js` and `connections.js`, once in migrate_161, which
 * validates every value it is sent against them. Two copies of a closed
 * set drift, and the failure is quiet in the worst way: a band the client
 * offers and the server rejects makes a toggle that silently does
 * nothing. migrate_161 says in its own comments that a Jest guard compares
 * the two; this is that guard.
 */
describe('the closed sets are the same on both sides', () => {
  const MIGRATION_161 = path.join(ROOT, 'supabase/migrate_161_community_connections.sql');
  const sql161 = fs.existsSync(MIGRATION_161) ? fs.readFileSync(MIGRATION_161, 'utf8') : null;

  const {
    TP_DAYS, TP_TIME_BANDS, TP_SESSIONS_BANDS, TP_SESSIONS_BAND_ORDER,
    TP_EXPERIENCE_BANDS, TP_AGE_BANDS,
  } = require('../lib/community/trainingProfile');
  const { CONNECT_REASONS, CONNECT_FROM_VALUES } = require('../lib/community/connections');

  /** The array literal one `_community_*_list()` helper returns. */
  function sqlList(helper) {
    const re = new RegExp(`FUNCTION public\\.${helper}\\(\\)[\\s\\S]*?ARRAY\\[([^\\]]*)\\]`, 'i');
    const m = re.exec(sql161);
    if (!m) return null;
    return m[1].split(',').map((s2) => s2.trim().replace(/^'|'$/g, '')).filter(Boolean);
  }

  test.each([
    ['_community_tp_days_list', () => Object.keys(TP_DAYS)],
    ['_community_tp_time_bands_list', () => Object.keys(TP_TIME_BANDS)],
    // Not Object.keys: '3' is an integer-like key and JavaScript would
    // hoist it to the front. TP_SESSIONS_BAND_ORDER is the order.
    ['_community_tp_sessions_list', () => [...TP_SESSIONS_BAND_ORDER]],
    ['_community_tp_experience_list', () => Object.keys(TP_EXPERIENCE_BANDS)],
    ['_community_tp_age_bands_list', () => Object.keys(TP_AGE_BANDS)],
    ['_community_connect_reasons_list', () => Object.keys(CONNECT_REASONS)],
  ])('%s carries the client set, in the same order', (helper, clientKeys) => {
    if (!sql161) { expect(fs.existsSync(MIGRATION_161)).toBe(false); return; }
    expect({ helper, values: sqlList(helper) })
      .toEqual({ helper, values: clientKeys() });
  });

  test('the connect_from CHECK carries the client values', () => {
    if (!sql161) { expect(fs.existsSync(MIGRATION_161)).toBe(false); return; }
    for (const value of Object.keys(CONNECT_FROM_VALUES)) {
      expect(sql161).toContain(`'${value}'`);
    }
  });

  test('the band phrases the reasons line uses read the same on both sides', () => {
    if (!sql161) { expect(fs.existsSync(MIGRATION_161)).toBe(false); return; }
    // "Both usually train evenings", "Both train 4 to 5 times a week": the
    // server composes these, and a phrase that differs from the client's
    // preview line would show one person a band worded two ways.
    for (const label of Object.values(TP_TIME_BANDS)) expect(sql161).toContain(`'${label}'`);
    for (const label of Object.values(TP_SESSIONS_BANDS)) expect(sql161).toContain(`'${label}'`);
  });
});
