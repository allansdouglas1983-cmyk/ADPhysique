/**
 * The Community barrel (blueprint section 5).
 *
 * Screens and components import from here, never from a module inside
 * this folder directly, so the surface stays one thing and
 * `transport.js` remains the only route to the network.
 */

export {
  CommunityError, COMMUNITY_ERROR_CODES, isCommunityErrorCode,
  callCommunity, invokeCommunityFunction, assertCommunityGates,
} from './transport';

export {
  HANDLE_REGEX, RESERVED_HANDLES, isValidHandle,
  DISPLAY_NAME_MAX, BIO_MAX, CAPTION_MAX, COMMENT_MAX,
  PROGRAMME_TITLE_MAX, PROGRAMME_DESCRIPTION_MAX, EXERCISE_NOTE_MAX,
  AREA_LABEL_MAX, GYM_LABEL_MAX, REPORT_DETAIL_MAX, MAX_STYLES_PER_PROFILE,
  SENSITIVE_COMMUNITY_KEYS, POST_PAYLOAD_KEYS, POST_KINDS,
  COMMUNITY_STYLE_KEYS, COMMUNITY_GOALS, COMMUNITY_SETTINGS, REPORT_REASONS,
  PROFILE_VISIBILITIES, PROGRAMME_VISIBILITIES, POST_VISIBILITIES,
  hasForbiddenKeys, validatePostPayload, cleanText, cleanOptionalText, cleanStyles,
} from './validation';

export { BLOCKED_TERMS, foldText, containsBlockedTerm, blockedTermsIn } from './keywordFilter';

export {
  COMMUNITY_RULES_VERSION, COMMUNITY_DIMENSION_MIN_FOR_HUB, NEW_ACCOUNT_DAYS,
  FOLLOWS_PER_DAY_NEW, FOLLOWS_PER_DAY_ESTABLISHED, FOLLOWING_CAP,
  POSTS_PER_DAY_NEW, POSTS_PER_DAY_ESTABLISHED,
  COMMENTS_PER_HOUR_NEW, COMMENTS_PER_HOUR_ESTABLISHED,
  REPORTS_PER_DAY, PROGRAMMES_PER_DAY, PROFILE_UPSERTS_PER_DAY,
  HANDLE_CHANGE_DAYS, AUTO_HIDE_REPORTS,
  SNAPSHOT_MAX_BYTES, SNAPSHOT_MAX_DAYS, SNAPSHOT_MAX_EXERCISES_PER_DAY,
  isNewAccount, limitsForAccount,
} from './limits';

export {
  WEB_ORIGIN, APP_SCHEME, profileUrl, programmeUrl, storyUrl,
  appProfileUrl, appProgrammeUrl, appStoryUrl, parseCommunityLink,
} from './links';

export {
  SNAPSHOT_VERSION, COMMUNITY_TAG,
  buildProgrammeSnapshot, validateSnapshot, snapshotStats, snapshotTags,
} from './snapshot';

export {
  importSnapshotAsPlan, buildSnapshotForPlan, communitySourceId,
} from './importProgramme';

export {
  ADAPT_REASON, planAdaptation, loadAdaptationContext, applyAdaptation,
} from './adapt';

export {
  buildPrPayload, buildSessionPayload, buildBlockPayload,
  buildMilestonePayload, buildProgrammePayload,
} from './posts';

export {
  ME_CACHE_PREFIX, meCacheKey, currentUserId, emptyMe, readCachedMe,
  clearCachedMe, loadMe, refreshMe, hasProfile, hasUnseen, upsertProfile,
  checkHandle, leaveCommunity, getProfile, follow, unfollow,
  respondToFollow, removeFollower, listFollows, blockUser, unblockUser,
  muteUser, unmuteUser, relationships,
} from './profile';

export {
  HUB_CACHE_PREFIX, hubCacheKey, clearCachedHub, loadHub, loadFeed,
  loadDiscoverPosts, searchPeople, searchProgrammes, suggestedPeople,
  myDimensions, loadDimension, publishProgramme, unpublishProgramme,
  getCommunityProgramme, recordProgrammeUse, myProgrammes,
  discoverProgrammes, createPost, deletePost, getPost, reactToPost,
  addComment, deleteComment, listComments,
} from './feed';

export {
  loadActivity, markActivitySeen, pendingRequestsFrom, pendingFollowRequests,
} from './activity';

export {
  MODERATION_ACTIONS, REPORT_TARGET_KINDS, reportContent, isModerator,
  moderationQueue, moderate,
} from './moderation';

export { COMMUNITY_NOTIFY_KINDS, notifyCommunityEvent } from './notify';
