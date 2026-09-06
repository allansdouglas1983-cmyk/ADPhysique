/**
 * What this suite pins (blueprint section 5.6; SD-11):
 *
 *  - the filter catches self-harm instruction and pro-eating-disorder
 *    vocabulary, which is why it exists at all;
 *  - it matches WHOLE WORDS after folding, so "Scunthorpe" and
 *    "retardant" are not false positives and "retàrd" is not a bypass;
 *  - ordinary swearing is deliberately NOT blocked. A filter that
 *    refuses "bloody hell" teaches people to work around it and catches
 *    nothing that matters.
 */

const { BLOCKED_TERMS, foldText, containsBlockedTerm, blockedTermsIn } = require('../keywordFilter');

describe('foldText', () => {
  test('lowercases, strips accents and collapses whitespace', () => {
    expect(foldText('  Réntré   PÅ\tDay  ')).toBe('rentre pa day');
  });

  test('the two-letter ligatures fold to two letters', () => {
    expect(foldText('Æsop œuvre straße')).toBe('aesop oeuvre strasse');
  });

  test('a non-string folds to empty rather than throwing', () => {
    expect(foldText(null)).toBe('');
    expect(foldText(undefined)).toBe('');
  });
});

describe('the list', () => {
  test('every entry is lowercase and single-spaced', () => {
    for (const term of BLOCKED_TERMS) {
      expect(term).toBe(term.toLowerCase());
      expect(term).toBe(term.trim());
      expect(term).not.toMatch(/\s{2,}/);
    }
  });

  test('the self-harm and pro-ED terms the blueprint names are present', () => {
    for (const term of ['kys', 'kill yourself', 'thinspo', 'pro ana', 'proana', 'pro mia', 'meanspo']) {
      expect(BLOCKED_TERMS).toContain(term);
    }
  });

  test('ordinary swearing is not on the list', () => {
    for (const word of ['bloody', 'damn', 'shit', 'crap', 'bugger', 'arse', 'bollocks']) {
      expect(BLOCKED_TERMS).not.toContain(word);
    }
  });
});

describe('containsBlockedTerm', () => {
  test.each(['kys', 'go kys mate', 'kill yourself', 'thinspo', 'pro ana tips', 'meanspo please'])(
    'refuses %s',
    (s) => { expect(containsBlockedTerm(s)).toBe(true); },
  );

  test('an accented bypass is still caught', () => {
    expect(containsBlockedTerm('rétard')).toBe(true);
  });

  test('a hyphen or full stop is a word boundary, not a bypass', () => {
    expect(containsBlockedTerm('re-tard')).toBe(false);
    expect(containsBlockedTerm('you.kys.now')).toBe(true);
  });

  test.each([
    'Scunthorpe gym session',
    'flame retardant kit bag',
    'analysis of my week',
    'bananas before training',
    'Great week, absolutely knackered.',
    'Kettlebell circuits, three rounds.',
  ])('lets %s through', (s) => {
    expect(containsBlockedTerm(s)).toBe(false);
  });

  test('empty and non-string input is not a match', () => {
    expect(containsBlockedTerm('')).toBe(false);
    expect(containsBlockedTerm(null)).toBe(false);
  });
});

describe('blockedTermsIn', () => {
  test('names what matched, for the moderation view only', () => {
    expect(blockedTermsIn('kys and thinspo')).toEqual(expect.arrayContaining(['kys', 'thinspo']));
  });

  test('clean text returns nothing', () => {
    expect(blockedTermsIn('good session today')).toEqual([]);
  });
});
