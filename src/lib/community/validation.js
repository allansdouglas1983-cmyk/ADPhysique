/**
 * Community input validation and the payload allow-lists (blueprint
 * `docs/social-discovery-2026-09-06/30-BLUEPRINT.md` sections 2, 5.6;
 * rulings SD-04, SD-07).
 *
 * PURE. No I/O, no store, no database. Every rule here is mirrored in
 * SQL by the `community_*` RPCs, and `community.privacy.guard.test.js`
 * pins the two lists against the migration so the client and the server
 * can never disagree about what a post may carry.
 *
 * The whole point of this module is SD-04: nothing about a person's
 * body, food, health, coaching or identity ever enters Community.
 * `SENSITIVE_COMMUNITY_KEYS` is the refusal list; a payload whose
 * recursive key set touches it is rejected here and again on the server.
 */

import { containsBlockedTerm } from './keywordFilter';

/** Lowercase ASCII, 3 to 20 characters. Leading/trailing underscore is
 * rejected separately by `isValidHandle` so the regex stays the exact
 * shape the SQL CHECK carries. */
export const HANDLE_REGEX = /^[a-z0-9_]{3,20}$/;

/**
 * Names Volyume speaks with, safety words, and the app's own route and
 * link words. A handle that reads as the app, its staff, a moderator or
 * a support channel is impersonation by default (SD-11).
 */
export const RESERVED_HANDLES = Object.freeze([
  'volyume', 'admin', 'administrator', 'support', 'help', 'helpdesk',
  'moderator', 'moderation', 'mod', 'official', 'staff', 'team',
  'community', 'coach', 'coaching', 'beat', 'nhs',
  // Link and route words: /u, /p, /s and every Community route stem.
  'u', 'p', 's', 'profile', 'programme', 'programmes', 'program', 'post',
  'posts', 'story', 'stories', 'feed', 'discover', 'search', 'activity',
  'dimension', 'rules', 'privacy', 'terms', 'report', 'block', 'mute',
  'follow', 'followers', 'following', 'partner', 'partners', 'join',
  // App destinations.
  'home', 'today', 'train', 'plans', 'plan', 'progress', 'food', 'you',
  'settings', 'account', 'notifications', 'about', 'legal', 'scan',
  // Web and auth words that would read as an official page.
  'www', 'api', 'app', 'web', 'blog', 'news', 'login', 'signin', 'signup',
  'register', 'auth', 'callback', 'password', 'reset', 'delete', 'new',
  'edit', 'me', 'null', 'undefined', 'anonymous',
]);

export const DISPLAY_NAME_MAX = 40;
export const BIO_MAX = 160;
export const CAPTION_MAX = 280;
export const COMMENT_MAX = 500;
export const PROGRAMME_TITLE_MAX = 60;
export const PROGRAMME_DESCRIPTION_MAX = 500;
export const EXERCISE_NOTE_MAX = 200;
export const AREA_LABEL_MAX = 40;
export const GYM_LABEL_MAX = 60;
export const REPORT_DETAIL_MAX = 500;
export const MAX_STYLES_PER_PROFILE = 3;

/**
 * The refusal list (blueprint section 2). Every key here names data that
 * must never cross from one user to another: body composition, food,
 * Progress Scan, coaching output, capability rules (Article 9 health
 * data), and direct identity. Checked recursively at any depth, on the
 * client before a write and again in SQL by `_community_forbidden_keys`.
 *
 * Never shorten this list. Adding to it is always safe.
 */
export const SENSITIVE_COMMUNITY_KEYS = Object.freeze([
  'weight_kg', 'bodyweight', 'body_weight', 'bodyWeight',
  'body_fat', 'bf_pct', 'ffm', 'fm_kg',
  'height', 'height_cm', 'age', 'date_of_birth', 'dateOfBirth', 'dob',
  'kcal', 'calories', 'protein', 'carbs', 'fat_g', 'fibre',
  'first_name', 'firstName', 'last_name', 'email', 'phone',
  'scan', 'progress_scan', 'volyume_score',
  'capability', 'constraint', 'limitation', 'injury',
  'ed_pattern', 'scoff',
  'starting_weight', 'startingWeight', 'selection_reason', 'selectionReason',
  'user_id', 'userId',
]);

const SENSITIVE_KEY_SET = new Set(SENSITIVE_COMMUNITY_KEYS);

/**
 * The EXACT key allow-list per post kind (blueprint section 5.5). A post
 * payload may carry these keys and nothing else; the server holds the
 * same list. "Allow-list, not deny-list" is the point: a new personal
 * column added to the app in a year's time cannot leak into a post
 * because it was never named here.
 */
export const POST_PAYLOAD_KEYS = Object.freeze({
  pr: Object.freeze(['exerciseName', 'weight', 'reps', 'units', 'previousBest', 'date']),
  session: Object.freeze([
    'sessionName', 'workingSets', 'duration', 'tonnage', 'exerciseCount',
    'exercises', 'prCount', 'topSet', 'intensityTier', 'units', 'planName', 'date',
  ]),
  block: Object.freeze([
    'planName', 'weeks', 'sessions', 'sessionsPerWeek', 'completedAt', 'lifts',
  ]),
  milestone: Object.freeze([
    'eyebrow', 'title', 'heroValue', 'heroUnit', 'caption', 'stats',
  ]),
  programme: Object.freeze(['id', 'title', 'style_key', 'days_per_week', 'exercise_count']),
});

export const POST_KINDS = Object.freeze(Object.keys(POST_PAYLOAD_KEYS));

/** The style chips a profile may choose (up to three). Labels are the
 * user-facing words; keys are stable and mirrored in SQL. */
export const COMMUNITY_STYLE_KEYS = Object.freeze({
  bodybuilding: 'Bodybuilding',
  strength: 'Strength',
  kettlebell: 'Kettlebell',
  circuits: 'Circuits',
  bands: 'Bands',
  bodyweight: 'Bodyweight',
  minimal_kit: 'Minimal kit',
  home_gym: 'Home gym',
});

export const COMMUNITY_GOALS = Object.freeze({
  build_muscle: 'Build muscle',
  get_stronger: 'Get stronger',
  general_fitness: 'General fitness',
  returning: 'Returning to training',
});

export const COMMUNITY_SETTINGS = Object.freeze({
  commercial_gym: 'Commercial gym',
  home_gym: 'Home gym',
  minimal_kit: 'Minimal kit',
});

/** SD-11. "Harmful body or eating content" exists as its own reason so
 * an ED-adjacent report is prioritised rather than filed under a vague
 * "inappropriate". */
export const REPORT_REASONS = Object.freeze({
  spam: 'Spam',
  harassment: 'Harassment or bullying',
  impersonation: 'Pretending to be someone else',
  harmful_body_or_eating_content: 'Harmful body or eating content',
  inappropriate: 'Inappropriate content',
  other: 'Something else',
});

export const PROFILE_VISIBILITIES = Object.freeze(['public', 'followers']);
export const PROGRAMME_VISIBILITIES = Object.freeze(['public', 'followers', 'link']);
export const POST_VISIBILITIES = Object.freeze(['public', 'followers']);

/**
 * Is `h` a handle this app will accept? The regex is the shape; this is
 * the policy: no leading or trailing underscore (so "_volyume" cannot
 * shadow a reserved word visually) and nothing on the reserved list.
 *
 * @param {string} h
 * @returns {boolean}
 */
export function isValidHandle(h) {
  if (typeof h !== 'string') return false;
  const s = h.trim();
  if (!HANDLE_REGEX.test(s)) return false;
  if (s.startsWith('_') || s.endsWith('_')) return false;
  return !RESERVED_HANDLES.includes(s);
}

/**
 * Does this object carry a forbidden key at ANY depth? Arrays are walked
 * as well as objects, because a nested station or stat row is exactly
 * where a personal column would hide.
 *
 * Bounded to a sane depth so a pathological or circular payload cannot
 * hang the check; anything deeper than that is refused as forbidden
 * rather than passed through unread (fail closed).
 *
 * @param {*} obj
 * @param {number} [depth]
 * @returns {boolean}
 */
export function hasForbiddenKeys(obj, depth = 0) {
  if (depth > 12) return true;
  if (Array.isArray(obj)) return obj.some((v) => hasForbiddenKeys(v, depth + 1));
  if (!obj || typeof obj !== 'object') return false;
  for (const key of Object.keys(obj)) {
    if (SENSITIVE_KEY_SET.has(key)) return true;
    if (hasForbiddenKeys(obj[key], depth + 1)) return true;
  }
  return false;
}

/**
 * Validate one post payload against its kind's allow-list.
 *
 * @param {string} kind one of POST_KINDS
 * @param {object} payload
 * @returns {{ok: boolean, errors: string[]}}
 */
export function validatePostPayload(kind, payload) {
  const errors = [];
  const allowed = POST_PAYLOAD_KEYS[kind];
  if (!allowed) return { ok: false, errors: ['unknown_kind'] };
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, errors: ['invalid_input'] };
  }
  for (const key of Object.keys(payload)) {
    if (!allowed.includes(key)) errors.push(`unexpected_key:${key}`);
  }
  if (hasForbiddenKeys(payload)) errors.push('forbidden_field');
  return { ok: errors.length === 0, errors };
}

/**
 * Trim, collapse whitespace and length-check one free-text field, then
 * run it past the shared keyword filter.
 *
 * @param {string} s
 * @param {number} max
 * @returns {{ok: boolean, value: string, reason: (string|null)}}
 *   reason is one of 'invalid_input' | 'empty' | 'too_long' |
 *   'content_not_allowed'.
 */
export function cleanText(s, max) {
  if (typeof s !== 'string') return { ok: false, value: '', reason: 'invalid_input' };
  const value = s.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (!value) return { ok: false, value: '', reason: 'empty' };
  if (typeof max === 'number' && value.length > max) {
    return { ok: false, value, reason: 'too_long' };
  }
  if (containsBlockedTerm(value)) return { ok: false, value, reason: 'content_not_allowed' };
  return { ok: true, value, reason: null };
}

/** An optional free-text field: empty is fine, anything present is
 * cleaned. Used for bio, description, area and gym labels. */
export function cleanOptionalText(s, max) {
  if (s == null || (typeof s === 'string' && !s.trim())) {
    return { ok: true, value: null, reason: null };
  }
  const out = cleanText(s, max);
  return out.ok ? out : out;
}

/** Up to three known style keys, order preserved, duplicates dropped. */
export function cleanStyles(styles) {
  if (!Array.isArray(styles)) return [];
  const seen = new Set();
  const out = [];
  for (const key of styles) {
    if (typeof key !== 'string' || !COMMUNITY_STYLE_KEYS[key] || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
    if (out.length >= MAX_STYLES_PER_PROFILE) break;
  }
  return out;
}
