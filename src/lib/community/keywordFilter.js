/**
 * The shared Community keyword filter (blueprint section 5.6, SD-11).
 *
 * PURE. One list, checked on the client before a write and again in SQL
 * by `_community_blocked_terms()`, so a message refused in the app is
 * refused at the database too and the two can never drift.
 *
 * Scope, deliberately narrow: unambiguous slurs and abuse, self-harm
 * instructions, and pro-eating-disorder vocabulary. Ordinary swearing is
 * NOT on this list. A gym is a place people swear; a filter that refuses
 * "bloody hell" trains people to work around it and catches nothing that
 * matters. What this list exists to stop is the small set of words that
 * are only ever used to attack someone, plus the eating-disorder tags
 * whose whole purpose is to spread harm (ED-safety, CLAUDE.md section 2).
 *
 * Matching is whole-word after folding, so an ordinary word that merely
 * contains a listed sequence is never caught.
 */

/**
 * Lowercase, single-spaced. Multi-word entries are matched as phrases.
 * Keep it alphabetical within each block so an addition is easy to place.
 */
export const BLOCKED_TERMS = Object.freeze([
  // Self-harm instruction. The reason this filter is not optional.
  'kys',
  'kill yourself',
  'kill your self',
  'go kill yourself',
  'neck yourself',

  // Pro-eating-disorder vocabulary (SD-11; ED-safety is inviolable).
  'thinspo',
  'thinspiration',
  'bonespo',
  'meanspo',
  'pro ana',
  'proana',
  'pro mia',
  'promia',
  'ana buddy',
  'ana coach',

  // Racial and ethnic slurs.
  'nigger',
  'niggers',
  'nigga',
  'niggas',
  'chink',
  'chinks',
  'spic',
  'spics',
  'wetback',
  'wetbacks',
  'kike',
  'kikes',
  'gook',
  'gooks',
  'paki',
  'pakis',
  'coon',
  'coons',
  'towelhead',
  'towelheads',
  'raghead',
  'ragheads',

  // Homophobic and transphobic slurs.
  'faggot',
  'faggots',
  'dyke',
  'dykes',
  'tranny',
  'trannies',
  'shemale',
  'shemales',

  // Ableist slurs.
  'retard',
  'retards',
  'retarded',
  'mongoloid',
  'spastic',
  'spastics',
]);

// The common Latin accented characters, folded to their ASCII base, so
// "retàrd" cannot walk past the list. Deliberately a fixed translation
// table rather than a Unicode normalisation call: Hermes has shipped
// without full ICU in the past, and a filter that silently stops folding
// on one runtime is worse than one whose behaviour is identical
// everywhere.
const ACCENT_FROM = 'àáâãäåāăąçćĉċčďđèéêëēĕėęěĝğġģĥħìíîïĩīĭįıĵķĺļľŀłñńņňòóôõöøōŏőŕŗřśŝşšţťŧùúûüũūŭůűųŵýÿŷźżžæœß';
const ACCENT_TO = ['a', 'a', 'a', 'a', 'a', 'a', 'a', 'a', 'a', 'c', 'c', 'c', 'c', 'c', 'd', 'd',
  'e', 'e', 'e', 'e', 'e', 'e', 'e', 'e', 'e', 'g', 'g', 'g', 'g', 'h', 'h',
  'i', 'i', 'i', 'i', 'i', 'i', 'i', 'i', 'i', 'j', 'k', 'l', 'l', 'l', 'l', 'l',
  'n', 'n', 'n', 'n', 'o', 'o', 'o', 'o', 'o', 'o', 'o', 'o', 'o', 'r', 'r', 'r',
  's', 's', 's', 's', 't', 't', 't', 'u', 'u', 'u', 'u', 'u', 'u', 'u', 'u', 'u', 'u',
  'w', 'y', 'y', 'y', 'z', 'z', 'z', 'ae', 'oe', 'ss'];

const ACCENT_MAP = (() => {
  const map = new Map();
  for (let i = 0; i < ACCENT_FROM.length; i += 1) map.set(ACCENT_FROM[i], ACCENT_TO[i] ?? ACCENT_FROM[i]);
  return map;
})();

/**
 * Lowercase, strip the common Latin accents, collapse every run of
 * whitespace to one space, trim.
 *
 * @param {string} s
 * @returns {string}
 */
export function foldText(s) {
  if (typeof s !== 'string') return '';
  let out = '';
  const lower = s.toLowerCase();
  for (const ch of lower) out += ACCENT_MAP.get(ch) ?? ch;
  return out.replace(/\s+/g, ' ').trim();
}

// A word character for this filter's purposes: letters and digits only.
// An apostrophe, hyphen or punctuation mark counts as a boundary, so
// "re-tard" is not a bypass and "Scunthorpe" is not a false positive.
const WORD_CHAR = /[a-z0-9]/;

function isBoundary(text, index) {
  if (index < 0 || index >= text.length) return true;
  return !WORD_CHAR.test(text[index]);
}

/**
 * Does `s` contain a blocked term as a whole word (or whole phrase)
 * after folding?
 *
 * @param {string} s
 * @returns {boolean}
 */
export function containsBlockedTerm(s) {
  const folded = foldText(s);
  if (!folded) return false;
  for (const term of BLOCKED_TERMS) {
    let from = 0;
    for (;;) {
      const at = folded.indexOf(term, from);
      if (at === -1) break;
      if (isBoundary(folded, at - 1) && isBoundary(folded, at + term.length)) return true;
      from = at + 1;
    }
  }
  return false;
}

/**
 * Every blocked term present in `s`, for a moderation view that needs to
 * explain itself. Never shown to the person who typed it: the refusal
 * copy stays calm and does not repeat the word back.
 *
 * @param {string} s
 * @returns {string[]}
 */
export function blockedTermsIn(s) {
  const folded = foldText(s);
  if (!folded) return [];
  const hits = [];
  for (const term of BLOCKED_TERMS) {
    let from = 0;
    for (;;) {
      const at = folded.indexOf(term, from);
      if (at === -1) break;
      if (isBoundary(folded, at - 1) && isBoundary(folded, at + term.length)) { hits.push(term); break; }
      from = at + 1;
    }
  }
  return hits;
}
