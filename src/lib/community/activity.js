/**
 * The Community activity inbox (blueprint sections 3, 5.7; SD-15).
 *
 * In-app first: every follow, reaction, comment and programme use lands
 * here whether or not a push was allowed to leave the server. A push is
 * an extra, never the record.
 */

import { callCommunity } from './transport';
import { refreshMe } from './profile';

export const DEFAULT_PAGE_SIZE = 30;

/**
 * @param {{cursor?: string|null, limit?: number}} [opts]
 * @returns {Promise<Array>} newest first
 */
export async function loadActivity({ cursor = null, limit = DEFAULT_PAGE_SIZE } = {}) {
  const rows = await callCommunity('community_activity', { _cursor: cursor, _limit: limit });
  return Array.isArray(rows) ? rows : [];
}

/**
 * Mark everything seen, then refresh the cached `me` so the header dot
 * clears without waiting for the next open.
 */
export async function markActivitySeen() {
  const out = await callCommunity('community_mark_activity_seen', {});
  await refreshMe().catch(() => { /* the dot clears on the next load */ });
  return out;
}

/**
 * The follow requests the Activity screen shows above the list. They
 * arrive as ordinary activity rows of kind `follow_request`, so there is
 * no second call and no second definition of what a pending request is.
 *
 * @param {Array} rows from `loadActivity`
 */
export function pendingRequestsFrom(rows) {
  return (Array.isArray(rows) ? rows : []).filter((r) => r?.kind === 'follow_request');
}

/**
 * The requests themselves, as profile cards, for the Accept / Decline
 * section. `_kind: 'requests'` is visible to the owner only, server-side.
 *
 * @param {{cursor?: string|null, limit?: number}} [opts]
 */
export async function pendingFollowRequests({ cursor = null, limit = DEFAULT_PAGE_SIZE } = {}) {
  return callCommunity('community_list_follows', {
    _uid: null, _kind: 'requests', _cursor: cursor, _limit: limit,
  });
}
