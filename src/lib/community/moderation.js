/**
 * Reporting and the moderator queue (blueprint sections 3, 5.7; SD-11).
 *
 * Moderation ships with the feature, not after it. Reporting is
 * available on every profile, post, comment and programme; three
 * distinct open reports auto-hide a piece of content pending review;
 * a moderator can dismiss, hide, unhide, delete, restrict or suspend,
 * and every action writes an audit row server-side.
 *
 * "Harmful body or eating content" is its own reason and is flagged
 * priority by the server, so an ED-adjacent report is never queued
 * behind spam.
 */

import { callCommunity, CommunityError } from './transport';
import { REPORT_REASONS, REPORT_DETAIL_MAX, cleanOptionalText } from './validation';

export const DEFAULT_PAGE_SIZE = 30;

export const MODERATION_ACTIONS = Object.freeze([
  'dismiss', 'hide_content', 'unhide_content', 'delete_content',
  'restrict_account', 'unrestrict_account', 'suspend_account', 'unsuspend_account',
]);

/** `message` joins the list with the discovery campaign (blueprint
 * section 2): a private conversation is exactly where harassment goes
 * when the public surfaces are moderated, so reporting one has to be
 * available from the moment messaging exists, not after it. */
export const REPORT_TARGET_KINDS = Object.freeze(['profile', 'post', 'comment', 'programme', 'message']);

/**
 * File a report.
 *
 * @param {{targetKind: string, targetId: string, reason: string, detail?: string}} input
 * @returns {Promise<{id: string}>}
 * @throws {CommunityError} 'invalid_input' for an unknown kind or reason,
 *   'already_reported' when this reporter already has one open.
 */
export async function reportContent({
  targetKind, targetId, reason, detail = null,
}) {
  if (!REPORT_TARGET_KINDS.includes(targetKind) || !REPORT_REASONS[reason]) {
    throw new CommunityError('invalid_input');
  }
  const cleaned = cleanOptionalText(detail, REPORT_DETAIL_MAX);
  return callCommunity('community_report', {
    _target_kind: targetKind,
    _target_id: targetId,
    _reason: reason,
    _detail: cleaned.ok ? cleaned.value : null,
  });
}

/** Is this account a moderator? The Community moderation screen is not
 * registered for anyone else. */
export async function isModerator() {
  return !!(await callCommunity('community_is_moderator', {}));
}

/**
 * @param {'open'|'actioned'|'dismissed'} status
 */
export async function moderationQueue(status = 'open', { cursor = null, limit = DEFAULT_PAGE_SIZE } = {}) {
  return callCommunity('community_moderation_queue', { _status: status, _cursor: cursor, _limit: limit });
}

/**
 * Act on one report. Every call closes the report and writes an audit
 * row; there is no silent action.
 *
 * @param {string} reportId
 * @param {string} action one of MODERATION_ACTIONS
 * @param {string|null} note
 */
export async function moderate(reportId, action, note = null) {
  if (!MODERATION_ACTIONS.includes(action)) {
    throw new CommunityError('invalid_input');
  }
  return callCommunity('community_moderate', {
    _report_id: reportId, _action: action, _note: note,
  });
}
