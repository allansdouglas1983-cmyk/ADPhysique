// Shared "the network was unreachable" signature (2026-09-06, Sentry triage
// VOLYUME-2F/2D/2C/28/2H/2J/31).
//
// One iOS TestFlight session on a flaky connection during a workout produced
// the six noisiest unresolved issues in the project: 736 fetch timeouts, 886
// db.upsert.failed events whose errorMessage WAS that timeout, 401 legacy push
// aggregates, a partial push, 201 capabilityConstraints upserts and a syncCrumb
// aggregate. Every one of them describes the same expected offline-first
// condition -- the device could not reach Dublin and the sync queue owns the
// retry -- so they belong on the breadcrumb trail, not in the issue stream.
//
// The old gate in sentry.js only knew the React Native fetch string "Network
// request failed". These are the other shapes the same condition arrives in,
// gathered from the live project:
//
//   Network request failed                            RN fetch, Android + iOS
//   TypeError: Network request timed out              RN fetch, iOS timeout
//   AuthRetryableFetchError                           supabase-js auth transport
//   TypeError: Load failed                            WebKit/iOS fetch failure
//   The Internet connection appears to be offline     NSURLErrorNotConnected
//   Could not connect to the server                   NSURLErrorCannotConnect
//   ECONNRESET / ETIMEDOUT / ENOTFOUND                socket + DNS level
//   Software caused connection abort                  iOS socket teardown
//
// "Load failed" is deliberately the tightest alternative here: on its own it is
// a generic two words that would swallow unrelated warnings such as "image load
// failed". It only matches at the start of the text, after a wrapping prefix
// ("TypeError: Load failed"), or immediately after a JSON quote (the form it
// takes once an extra has been stringified) -- never mid-sentence.
//
// This module is pure and dependency-free on purpose: sentry.js imports it from
// inside the Sentry wrapper and sync.js imports it from the sync layer, and
// neither may drag the other in.

export const NETWORK_NOISE = new RegExp([
  'network request (?:failed|timed out)',
  'authretryablefetcherror',
  '(?:^|["\':])\\s*(?:[a-z]*error:\\s*)?load failed\\b',
  'the internet connection appears to be offline',
  'could not connect to the server',
  '\\beconnreset\\b',
  '\\betimedout\\b',
  '\\benotfound\\b',
  'software caused connection abort',
].join('|'), 'i');

/**
 * True when `value` reads as an unreachable-network failure.
 *
 * Accepts anything: a string, an Error, a PostgREST { message } object or a
 * whole extra bag. Objects are stringified (bounded by JSON.stringify's own
 * behaviour) so a network cause buried in `extra.errorMessage` still matches.
 * Never throws -- a circular structure or a hostile getter returns false, which
 * fails OPEN to visibility (the event ships as normal).
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isNetworkNoise(value) {
  if (value == null) return false;
  try {
    if (typeof value === 'string') return NETWORK_NOISE.test(value);
    if (value instanceof Error) return NETWORK_NOISE.test(String(value.message ?? ''));
    if (typeof value === 'object') return NETWORK_NOISE.test(JSON.stringify(value) ?? '');
    return NETWORK_NOISE.test(String(value));
  } catch (_) {
    return false;
  }
}
