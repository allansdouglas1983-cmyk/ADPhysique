/**
 * Sentry event + breadcrumb scrubber.
 *
 * Locked in PRIVACY_CONSENT_LOCKED.md lines 178-191:
 *
 *   Before any event leaves the device, the Sentry `beforeSend` hook
 *   removes:
 *
 *   - All numeric fields named `weight*`, `kcal*`, `protein*`, `carbs*`,
 *     `fat*`, `fibre*`, `bf_pct`, `body_fat*`, `ffm*`, `fm*`
 *   - All string fields containing `weight_log`, `food_entries`,
 *     `custom_foods`, `body_composition_log`
 *   - All photo file paths and binary payloads
 *   - All `ed_pattern_flags` references and signals_json
 *
 * Quarterly audit (also locked): a CI test asserts the scrub rules
 * still match the schema. If a new field is added that matches a
 * sensitive pattern, the audit fails until the scrub list is updated.
 *
 * This module is the single source of truth. `src/lib/sentry.js`
 * imports `scrubEvent` and `scrubBreadcrumb` from here. Tests in
 * `src/lib/__tests__/sentryScrub.test.js` cover every locked pattern.
 *
 * Performance: scrubbing runs in Sentry's `beforeSend` hook, which
 * fires once per event (rare). Recursion bounded to depth 6 so a
 * pathological circular ref can't hang the hook.
 */

const MAX_DEPTH = 6;
const REDACTED = '[redacted]';

// ────────────────────────────────────────────────────────────────────
// Locked sensitive-key patterns
// Numeric fields whose name matches any of these regexes get redacted.
// ────────────────────────────────────────────────────────────────────

export const SENSITIVE_KEY_PATTERNS = Object.freeze([
  // CC26 capability lane: any capability/constraint field is Article 9
  // content by construction - rule values, roles, laterality included.
  /^capability/i,
  /^constraint/i,
  /^rule[._-]?value$/i,
  /^laterality$/i,
  /^episode[._-]?group/i,
  // Body composition + measurements
  /^weight/i,
  /^body[._-]?weight/i,
  /^bf[._-]?pct$/i,
  /^body[._-]?fat/i,
  /^ffm/i,
  /^fm[._-]?kg/i,
  /^height/i,

  // Macros (covers _g, _100g, _serving, _value, _target variants)
  /^kcal/i,
  /^protein/i,
  /^carbs?/i,
  /^carbohydrates?/i,
  /^fat[._-]?g$/i,
  /^fat[._-]?100g$/i,
  /^fat[._-]?value$/i,
  /^fat[._-]?serving$/i,
  /^fat[._-]?target$/i,
  /^fibre/i,
  /^fiber/i,
  /^sodium/i,
  /^sugar/i,
  /^quantity[._-]?g/i,        // food_entries.quantity_g, dietary intake
  /^serving[._-]?g/i,         // foods.serving_g

  // PII identifiers
  /^email$/i,
  /^firstName$/i,
  /^first[._-]?name$/i,
  /^lastName$/i,
  /^last[._-]?name$/i,
  /^fullName$/i,
  /^full[._-]?name$/i,
  /^dateOfBirth$/i,
  /^date[._-]?of[._-]?birth$/i,
  /^birthDate$/i,
  /^birth[._-]?date$/i,
  /^dob$/i,
  /^phone/i,
  /^address/i,

  // Authentication / session material. Opaque refresh tokens and one-time
  // codes do not look like JWTs, so their key is the only reliable signal.
  /^(?:access|refresh|id)[._-]?token$/i,
  /^token[._-]?hash$/i,
  /^authorization$/i,
  /^cookies?$/i,
  /^password$/i,
  /^client[._-]?secret$/i,
  /^(?:auth|authorization|verification)[._-]?code$/i,
  /^otp$/i,

  // Body measurements (existing locked list)
  /^waist/i,
  /^chest/i,
  /^hips?/i,
  /^thigh/i,
  /^quads?$/i,
  /^ham/i,
  /^hamstring/i,
  /^calf/i,
  /^calves$/i,
  /^arm[._-]?cm$/i,
  /^arms$/i,
  /^shoulders?/i,
  /^forearm/i,

  // ED-pattern surface, entire payload is sensitive
  /^signals[._-]?json$/i,
  /^signals$/i,
  /^ed[._-]?pattern/i,

  // Community (social-discovery campaign 2026-09-06, blueprint section 2).
  // A handle, a display name, a bio, a caption and a comment body are
  // user-authored content that identifies a person to anyone who can
  // read it. None of it is needed to diagnose a crash, and a breadcrumb
  // carrying "@somehandle said ..." is a person's words leaving the
  // device. `^body$` is the comment body column specifically; the
  // measurement patterns above already cover body_weight/body_fat.
  /^handle/i,
  /^display[._-]?name/i,
  /^bio$/i,
  /^caption/i,
  /^comment/i,
  /^body$/i,
]);

// ────────────────────────────────────────────────────────────────────
// Sensitive value patterns
// Strings whose VALUE contains any of these substrings get redacted.
// Catches free-text breadcrumbs and SQL fragments that name protected
// tables.
// ────────────────────────────────────────────────────────────────────

export const SENSITIVE_VALUE_SUBSTRINGS = Object.freeze([
  'weight_log',
  'food_entries',
  'custom_foods',
  'body_composition_log',
  'daily_intake_rollups',
  'ed_pattern_flags',
  'health_data_consent',
  'progress_photo_meta',
  'progress_scan_sessions',
  'progress_scan_assets',
  'progress_photos/',
  // CC26 capability lane (CAP-20/section 26): Article 9 data. Table names
  // AND the consent marker; the key-pattern list below catches field names.
  'capability_constraints',
  'session_constraint_effects',
  'capability_data_consent',
  // Community (social-discovery campaign 2026-09-06): one substring
  // covers every `community_*` table and RPC name, so a PostgREST error
  // string or a Supabase breadcrumb naming the table cannot carry a
  // handle, a caption or a comment body out with it.
  'community_',
]);

// ────────────────────────────────────────────────────────────────────
// Photo paths + binary payloads
// ────────────────────────────────────────────────────────────────────

// Native image/file APIs frequently return opaque content:// identifiers with
// no filename extension (for example media/123), and native decoder errors can
// echo those identifiers verbatim. A scheme/path is already private device
// location evidence; requiring an image extension leaks the common Android
// shape. Redact the whole string whenever one occurs.
const PRIVATE_FILE_URI_RE = /\b(?:file|content):\/\/[^\s"'<>]+|(?:\/storage\/|\/data\/user\/)[^\s"'<>]+/i;
const BASE64_IMAGE_RE = /^data:image\/[a-z]+;base64,/i;
const EMAIL_VALUE_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const JWT_VALUE_RE = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/;
const CREDENTIAL_VALUE_RE = /(?:authorization\s*[:=]\s*bearer\s+[^\s&#]+|(?:access_token|refresh_token|token_hash|id_token|client_secret|auth_code|authorization_code|verification_code|otp)\s*[:=]\s*[^\s&#]+|[?&#]code=[^\s&#]+)/i;
const INLINE_HEALTH_RE = /\b(?:weight|body[._ -]?fat|bf[._ -]?pct|ffm|fm[._ -]?kg|kcal|protein|carbs?|fat|fibre|fiber|waist|chest|hips?|thigh|calf)\w*\s*[:=]\s*-?\d/i;

// Error strings can contain nested/encoded URLs (for example a callback URL
// inside a redirect parameter) and native APIs may percent-encode a private
// file URI before echoing it. Decode ASCII escapes for CLASSIFICATION only so
// those values cannot bypass the plaintext patterns above. This is deliberately
// bounded to three linear passes: it catches ordinary, double and triple
// encoding without invoking a permissive URI decoder or risking unbounded
// canonicalisation work on attacker-controlled telemetry.
function _canonicalizePercentEncodedAscii(s) {
  let current = s;
  for (let pass = 0; pass < 3 && current.includes('%'); pass += 1) {
    const next = current.replace(/%([0-7][0-9a-f])/gi, (_match, hex) => (
      String.fromCharCode(Number.parseInt(hex, 16))
    ));
    if (next === current) break;
    current = next;
  }
  return current;
}

// ────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────

/**
 * Decide whether a given key should be redacted based on the locked
 * patterns. Exported so the audit test can drive it directly.
 */
export function isSensitiveKey(key) {
  if (typeof key !== 'string' || !key) return false;
  return SENSITIVE_KEY_PATTERNS.some(re => re.test(key));
}

/**
 * Scrub a value:
 *   - Strings: redact if they match a photo path / base64 image, or
 *     embed a sensitive table name.
 *   - Numbers/booleans/null: pass through (nullable: redact happens
 *     at the key level via isSensitiveKey).
 *   - Objects/arrays: recurse, redact sensitive keys, scrub values.
 */
export function scrubValue(value, depth = 0) {
  if (value == null) return value;
  if (depth > MAX_DEPTH) return REDACTED;
  if (typeof value === 'string') return _scrubString(value);
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(v => scrubValue(v, depth + 1));
  return scrubObject(value, depth);
}

export function scrubObject(obj, depth = 0) {
  if (obj == null || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  if (depth > MAX_DEPTH) return { [REDACTED]: true };
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (isSensitiveKey(k)) {
      out[k] = v == null ? null : REDACTED;
    } else {
      out[k] = scrubValue(v, depth + 1);
    }
  }
  return out;
}

function _scrubString(s) {
  if (typeof s !== 'string') return s;
  const classified = _canonicalizePercentEncodedAscii(s);
  if (BASE64_IMAGE_RE.test(classified)) return REDACTED;
  if (PRIVATE_FILE_URI_RE.test(classified)) return REDACTED;
  if (EMAIL_VALUE_RE.test(classified)) return REDACTED;
  if (JWT_VALUE_RE.test(classified)) return REDACTED;
  if (CREDENTIAL_VALUE_RE.test(classified)) return REDACTED;
  if (INLINE_HEALTH_RE.test(classified)) return REDACTED;
  // Sensitive table name embedded in the string. The whole string is
  // suspect (it likely carries row data or SQL), so redact wholesale.
  for (const needle of SENSITIVE_VALUE_SUBSTRINGS) {
    if (classified.indexOf(needle) !== -1) return REDACTED;
  }
  return s;
}

/**
 * Sentry `beforeSend` entry point. Mutates the event in place AND
 * returns it (Sentry expects the returned value). Wrapped in
 * try/catch by the caller so a scrubber bug can never block an
 * outbound event entirely.
 */
export function scrubEvent(event) {
  if (!event || typeof event !== 'object') return event;

  if (event.extra) event.extra = scrubObject(event.extra);
  if (event.contexts) event.contexts = scrubObject(event.contexts);
  if (event.tags) event.tags = scrubObject(event.tags);
  if (event.request && typeof event.request === 'object') {
    // Request metadata is SDK/transport controlled and can bypass caller key
    // conventions. Never retain headers, cookies, query strings, or env.
    delete event.request.headers;
    delete event.request.cookies;
    delete event.request.query_string;
    delete event.request.env;
    if (event.request.data) event.request.data = scrubValue(event.request.data);
    if (typeof event.request.url === 'string') {
      event.request.url = _scrubString(event.request.url.split(/[?#]/, 1)[0]);
    }
  }

  // User identity: keep `id` only (low-risk opaque uuid). Drop email,
  // username, ip, anything else Sentry attached automatically.
  if (event.user) {
    event.user = event.user.id ? { id: event.user.id } : {};
  }

  // Message + exception values are free-text; scan them for sensitive
  // substrings (table names) and redact if found.
  if (typeof event.message === 'string') {
    event.message = _scrubString(event.message);
  }
  if (event.exception?.values && Array.isArray(event.exception.values)) {
    event.exception.values = event.exception.values.map(v => ({
      ...v,
      value: typeof v?.value === 'string' ? _scrubString(v.value) : v?.value,
    }));
  }

  if (Array.isArray(event.breadcrumbs)) {
    event.breadcrumbs = event.breadcrumbs.map(scrubBreadcrumb);
  }

  return event;
}

/**
 * Sentry `beforeBreadcrumb` entry point. Same contract as scrubEvent.
 */
export function scrubBreadcrumb(crumb) {
  if (!crumb || typeof crumb !== 'object') return crumb;
  const out = { ...crumb };
  if (crumb.data) out.data = scrubObject(crumb.data);
  if (typeof crumb.message === 'string') out.message = _scrubString(crumb.message);
  return out;
}
