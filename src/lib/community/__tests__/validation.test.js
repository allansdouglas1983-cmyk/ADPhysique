/**
 * What this suite pins (blueprint section 10; SD-04, SD-07):
 *
 *  - the handle policy, including the two things the regex alone does
 *    not say: no leading/trailing underscore, and no reserved word;
 *  - `SENSITIVE_COMMUNITY_KEYS` catching a forbidden key at ANY depth,
 *    because a personal column would hide inside a nested station or
 *    stat row, not at the top level;
 *  - `POST_PAYLOAD_KEYS` being an exact allow-list per kind, so a key
 *    nobody named can never travel;
 *  - `cleanText` refusing over-length and blocked content rather than
 *    silently truncating it.
 *
 * Written to FAIL if the refusal list is ever shortened or a payload
 * gains an unnamed key.
 */

const {
  HANDLE_REGEX, RESERVED_HANDLES, isValidHandle,
  DISPLAY_NAME_MAX, BIO_MAX, CAPTION_MAX, COMMENT_MAX,
  PROGRAMME_TITLE_MAX, PROGRAMME_DESCRIPTION_MAX, EXERCISE_NOTE_MAX,
  SENSITIVE_COMMUNITY_KEYS, POST_PAYLOAD_KEYS,
  COMMUNITY_STYLE_KEYS, COMMUNITY_GOALS, COMMUNITY_SETTINGS, REPORT_REASONS,
  hasForbiddenKeys, validatePostPayload, cleanText, cleanStyles,
} = require('../validation');

describe('handles', () => {
  test('the regex is the shape the SQL CHECK carries', () => {
    expect(HANDLE_REGEX.source).toBe('^[a-z0-9_]{3,20}$');
  });

  test.each(['alex', 'alex_lifts', 'a1_b2', 'abc', 'a'.repeat(20)])('%s is valid', (h) => {
    expect(isValidHandle(h)).toBe(true);
  });

  test.each([
    ['ab', 'too short'],
    ['a'.repeat(21), 'too long'],
    ['Alex', 'uppercase'],
    ['alex lifts', 'a space'],
    ['alex-lifts', 'a hyphen'],
    ['alex.lifts', 'a full stop'],
    ['_alex', 'a leading underscore'],
    ['alex_', 'a trailing underscore'],
    ['alex@x', 'punctuation'],
    ['', 'empty'],
  ])('%s is refused (%s)', (h) => {
    expect(isValidHandle(h)).toBe(false);
  });

  test.each(['volyume', 'admin', 'support', 'moderator', 'community', 'coach', 'beat', 'nhs'])(
    'the reserved word %s cannot be taken',
    (h) => {
      expect(RESERVED_HANDLES).toContain(h);
      expect(isValidHandle(h)).toBe(false);
    },
  );

  test('the link path words are reserved so a handle cannot shadow a share URL', () => {
    for (const word of ['u', 'p', 's', 'partner', 'profile', 'programme']) {
      expect(isValidHandle(word)).toBe(false);
    }
  });

  test('a non-string is refused rather than coerced', () => {
    expect(isValidHandle(null)).toBe(false);
    expect(isValidHandle(undefined)).toBe(false);
    expect(isValidHandle(12345)).toBe(false);
  });
});

describe('length caps', () => {
  test('the caps are the numbers the blueprint fixes', () => {
    expect(DISPLAY_NAME_MAX).toBe(40);
    expect(BIO_MAX).toBe(160);
    expect(CAPTION_MAX).toBe(280);
    expect(COMMENT_MAX).toBe(500);
    expect(PROGRAMME_TITLE_MAX).toBe(60);
    expect(PROGRAMME_DESCRIPTION_MAX).toBe(500);
    expect(EXERCISE_NOTE_MAX).toBe(200);
  });
});

describe('the refusal list', () => {
  test('every key the blueprint names is on it', () => {
    for (const key of [
      'weight_kg', 'bodyweight', 'body_weight', 'bodyWeight', 'body_fat', 'bf_pct',
      'ffm', 'fm_kg', 'height', 'height_cm', 'age', 'date_of_birth', 'dateOfBirth',
      'dob', 'kcal', 'calories', 'protein', 'carbs', 'fat_g', 'fibre', 'first_name',
      'firstName', 'last_name', 'email', 'phone', 'scan', 'progress_scan',
      'volyume_score', 'capability', 'constraint', 'limitation', 'injury',
      'ed_pattern', 'scoff', 'starting_weight', 'startingWeight', 'selection_reason',
      'selectionReason', 'user_id', 'userId',
    ]) {
      expect(SENSITIVE_COMMUNITY_KEYS).toContain(key);
    }
  });

  test('a forbidden key at the top level is caught', () => {
    expect(hasForbiddenKeys({ title: 'Push', bodyweight: 82 })).toBe(true);
  });

  test('a forbidden key nested four deep is caught', () => {
    const payload = { days: [{ exercises: [{ meta: { startingWeight: 60 } }] }] };
    expect(hasForbiddenKeys(payload)).toBe(true);
  });

  test('a forbidden key inside an array of arrays is caught', () => {
    expect(hasForbiddenKeys([[{ kcal: 2200 }]])).toBe(true);
  });

  test('an ordinary structural payload passes', () => {
    const payload = {
      title: 'Push', days: [{ name: 'Day 1', exercises: [{ exercise_name: 'Bench Press', sets: 3 }] }],
    };
    expect(hasForbiddenKeys(payload)).toBe(false);
  });

  test('an absurdly deep payload fails CLOSED rather than passing unread', () => {
    let deep = { ok: true };
    for (let i = 0; i < 40; i += 1) deep = { nested: deep };
    expect(hasForbiddenKeys(deep)).toBe(true);
  });
});

describe('post payload allow-lists', () => {
  test('the keys are exactly the blueprint list, per kind', () => {
    expect(POST_PAYLOAD_KEYS.pr).toEqual(
      ['exerciseName', 'weight', 'reps', 'units', 'previousBest', 'date'],
    );
    expect(POST_PAYLOAD_KEYS.session).toEqual([
      'sessionName', 'workingSets', 'duration', 'tonnage', 'exerciseCount',
      'exercises', 'prCount', 'topSet', 'intensityTier', 'units', 'planName', 'date',
    ]);
    expect(POST_PAYLOAD_KEYS.block).toEqual(
      ['planName', 'weeks', 'sessions', 'sessionsPerWeek', 'completedAt', 'lifts'],
    );
    expect(POST_PAYLOAD_KEYS.milestone).toEqual(
      ['eyebrow', 'title', 'heroValue', 'heroUnit', 'caption', 'stats'],
    );
    expect(POST_PAYLOAD_KEYS.programme).toEqual(
      ['id', 'title', 'style_key', 'days_per_week', 'exercise_count'],
    );
  });

  test('there are exactly five kinds', () => {
    expect(Object.keys(POST_PAYLOAD_KEYS).sort())
      .toEqual(['block', 'milestone', 'pr', 'programme', 'session']);
  });

  test('a valid PR payload passes', () => {
    const out = validatePostPayload('pr', {
      exerciseName: 'Deadlift', weight: 180, reps: 3, units: 'kg', previousBest: 175, date: 1,
    });
    expect(out).toEqual({ ok: true, errors: [] });
  });

  test('an unnamed key is refused by name', () => {
    const out = validatePostPayload('pr', { exerciseName: 'Deadlift', rpe: 9 });
    expect(out.ok).toBe(false);
    expect(out.errors).toContain('unexpected_key:rpe');
  });

  test('a forbidden key is refused even when it would be allowed by name', () => {
    const out = validatePostPayload('session', {
      sessionName: 'Push', topSet: { weight: 100, reps: 5, bodyweight: 82 },
    });
    expect(out.ok).toBe(false);
    expect(out.errors).toContain('forbidden_field');
  });

  test('an unknown kind is refused', () => {
    expect(validatePostPayload('checkin', {})).toEqual({ ok: false, errors: ['unknown_kind'] });
  });
});

describe('cleanText', () => {
  test('trims and collapses runs of spaces', () => {
    expect(cleanText('  strong   week  ', 100)).toEqual({ ok: true, value: 'strong week', reason: null });
  });

  test('empty is refused', () => {
    expect(cleanText('   ', 100).reason).toBe('empty');
  });

  test('over the cap is refused, never truncated silently', () => {
    const out = cleanText('a'.repeat(300), CAPTION_MAX);
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('too_long');
  });

  test('blocked content is refused', () => {
    expect(cleanText('go kys', 100).reason).toBe('content_not_allowed');
  });

  test('ordinary gym language is not refused', () => {
    expect(cleanText('Absolutely knackered but that was a great session.', 280).ok).toBe(true);
  });
});

describe('profile vocabularies', () => {
  test('the style chips are the eight the blueprint lists, with their labels', () => {
    expect(COMMUNITY_STYLE_KEYS).toEqual({
      bodybuilding: 'Bodybuilding',
      strength: 'Strength',
      kettlebell: 'Kettlebell',
      circuits: 'Circuits',
      bands: 'Bands',
      bodyweight: 'Bodyweight',
      minimal_kit: 'Minimal kit',
      home_gym: 'Home gym',
    });
  });

  test('goals, settings and report reasons carry their exact copy', () => {
    expect(COMMUNITY_GOALS.returning).toBe('Returning to training');
    expect(COMMUNITY_SETTINGS.commercial_gym).toBe('Commercial gym');
    expect(REPORT_REASONS.harmful_body_or_eating_content).toBe('Harmful body or eating content');
    expect(Object.keys(REPORT_REASONS)).toEqual([
      'spam', 'harassment', 'impersonation',
      'harmful_body_or_eating_content', 'inappropriate', 'other',
    ]);
  });

  test('at most three styles survive, unknown keys are dropped', () => {
    expect(cleanStyles(['kettlebell', 'kettlebell', 'strength', 'bands', 'circuits', 'nonsense']))
      .toEqual(['kettlebell', 'strength', 'bands']);
  });
});
