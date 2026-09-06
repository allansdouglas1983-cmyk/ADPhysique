/**
 * Feed, Discover, search and the programme surfaces (blueprint sections
 * 3, 5.7; SD-06, SD-09, SD-10).
 *
 * Every list here is CHRONOLOGICAL. There is no engagement ranking
 * anywhere in Community, by decision (SD-06): an engagement-ranked feed
 * on a body-adjacent product is exactly what the ED-safety guidance
 * warns against, and the loudest complaint about the closest comparable
 * product is its uncurated ranked feed.
 *
 * The hub payload is cached per user under `@volyume_community_hub_<uid>`
 * so an offline open shows the last thing the user saw with a quiet
 * line, rather than an error. Cursors are opaque strings the server
 * mints; nothing here interprets one.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { callCommunity } from './transport';
import { currentUserId } from './profile';

export const HUB_CACHE_PREFIX = '@volyume_community_hub_';
export const DEFAULT_PAGE_SIZE = 20;

export function hubCacheKey(uid) {
  return `${HUB_CACHE_PREFIX}${uid ?? 'unknown'}`;
}

async function readCachedHub(uid) {
  if (!uid) return null;
  try {
    const raw = await AsyncStorage.getItem(hubCacheKey(uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_e) {
    return null;
  }
}

async function writeCachedHub(uid, payload) {
  if (!uid) return;
  try {
    await AsyncStorage.setItem(hubCacheKey(uid), JSON.stringify(payload));
  } catch (_e) { /* best effort: the cache is a convenience, never truth */ }
}

export async function clearCachedHub(uid) {
  if (!uid) return;
  try {
    await AsyncStorage.removeItem(hubCacheKey(uid));
  } catch (_e) { /* best effort */ }
}

/**
 * Every list RPC answers a wrapper object: `{posts, cursor}`,
 * `{people, cursor}`, `{comments, cursor}` and so on (the
 * `RETURN jsonb_build_object` lines in `migrate_160_community.sql`). The
 * rows are unwrapped here, in one place, and the CURSOR is the server's
 * own opaque string: `_community_cursor_parts` requires `ts|uuid` and
 * refuses anything a client tries to build for itself.
 *
 * @param {object|null} data the RPC payload
 * @param {string} key the wrapper's row key
 */
function listPage(data, key) {
  const rows = data?.[key];
  return {
    [key]: Array.isArray(rows) ? rows : [],
    cursor: typeof data?.cursor === 'string' ? data.cursor : null,
  };
}

/**
 * Load one half of the hub.
 *
 * Discover is readable without a Community profile (SD-04), so the two
 * sections that are ABOUT the reader's own profile — suggestions and the
 * dimensions they share — are only asked for once there is one: both
 * raise `no_profile` otherwise. The four reads are settled independently
 * as well, so one section failing leaves the rest of Discover standing
 * rather than emptying the screen.
 *
 * @param {'following'|'discover'} segment
 * @param {{cursor?: string|null, limit?: number, userId?: string,
 *   joined?: boolean}} [opts]
 * @returns {Promise<{segment: string, posts: Array, programmes: Array,
 *   people: Array, dimensions: Array, cursor: (string|null),
 *   programmesCursor: (string|null), fromCache: boolean,
 *   error: (string|null)}>} never throws.
 */
export async function loadHub(segment = 'following', {
  cursor = null, limit = DEFAULT_PAGE_SIZE, userId = null, joined = true,
} = {}) {
  const uid = userId ?? currentUserId();
  const empty = {
    segment, posts: [], programmes: [], people: [], dimensions: [], cursor: null,
    programmesCursor: null, fromCache: false, error: null,
  };
  try {
    if (segment === 'discover') {
      // Paging Discover pages the training stories: they are the list. The
      // sections above them are a header, read once per open.
      if (cursor) {
        const page = await loadDiscoverPosts({ cursor, limit });
        return { ...empty, posts: page.posts, cursor: page.cursor };
      }
      const settled = await Promise.allSettled([
        discoverProgrammes({ limit }),
        loadDiscoverPosts({ limit }),
        joined ? suggestedPeople({ limit: 5 }) : Promise.resolve({ people: [] }),
        joined ? myDimensions() : Promise.resolve({ dimensions: [] }),
      ]);
      const [programmes, posts, people, dimensions] = settled;
      // Discover IS the programmes and the stories. If neither read
      // answered there is nothing to show, so fall through to the cache.
      if (programmes.status === 'rejected' && posts.status === 'rejected') {
        throw programmes.reason;
      }
      const payload = {
        ...empty,
        programmes: programmes.value?.programmes ?? [],
        posts: posts.value?.posts ?? [],
        people: people.value?.people ?? [],
        dimensions: dimensions.value?.dimensions ?? [],
        // `cursor` pages the training stories: they are the list. The
        // programmes have a cursor of their own and it is kept apart from
        // it, because paging the list with the programme cursor (or the
        // other way round) silently reads the wrong page (product review
        // 2026-09-06, item 14).
        cursor: posts.value?.cursor ?? null,
        programmesCursor: programmes.value?.cursor ?? null,
      };
      await writeCachedHub(uid, payload);
      return payload;
    }
    const page = await loadFeed({ cursor, limit });
    const payload = { ...empty, posts: page.posts, cursor: page.cursor };
    if (!cursor) await writeCachedHub(uid, payload);
    return payload;
  } catch (e) {
    const cached = cursor ? null : await readCachedHub(uid);
    if (cached && cached.segment === segment) return { ...cached, fromCache: true, error: e?.code ?? 'unavailable' };
    return { ...empty, error: e?.code ?? 'unavailable' };
  }
}

/** @returns {Promise<{posts: Array, cursor: (string|null)}>} */
export async function loadFeed({ cursor = null, limit = DEFAULT_PAGE_SIZE } = {}) {
  return listPage(await callCommunity('community_feed', { _cursor: cursor, _limit: limit }), 'posts');
}

/** @returns {Promise<{posts: Array, cursor: (string|null)}>} */
export async function loadDiscoverPosts({ cursor = null, limit = DEFAULT_PAGE_SIZE } = {}) {
  return listPage(await callCommunity('community_discover_posts', { _cursor: cursor, _limit: limit }), 'posts');
}

/** @returns {Promise<{people: Array, cursor: (string|null)}>} */
export async function searchPeople(q, { limit = 20 } = {}) {
  return listPage(
    await callCommunity('community_search_people', { _q: String(q ?? '').trim(), _limit: limit }),
    'people',
  );
}

/** @returns {Promise<{programmes: Array, cursor: (string|null)}>} */
export async function searchProgrammes(q, { style = null, cursor = null, limit = DEFAULT_PAGE_SIZE } = {}) {
  return listPage(await callCommunity('community_search_programmes', {
    _q: String(q ?? '').trim(), _style: style, _cursor: cursor, _limit: limit,
  }), 'programmes');
}

/** @returns {Promise<{people: Array, cursor: (string|null)}>} */
export async function suggestedPeople({ limit = 10 } = {}) {
  return listPage(await callCommunity('community_suggested_people', { _limit: limit }), 'people');
}

/** @returns {Promise<{dimensions: Array, cursor: (string|null)}>} */
export async function myDimensions() {
  return listPage(await callCommunity('community_dimensions_me', {}), 'dimensions');
}

/**
 * One dimension page: its label and count, the people in it and the
 * programmes published in it.
 *
 * @returns {Promise<{label: (string|null), count: number, people: Array,
 *   programmes: Array, cursor: (string|null)}>}
 */
export async function loadDimension(kind, key, { cursor = null, limit = DEFAULT_PAGE_SIZE } = {}) {
  const data = await callCommunity('community_dimension', {
    _kind: kind, _key: key, _cursor: cursor, _limit: limit,
  });
  return {
    label: data?.label ?? null,
    count: Number(data?.count ?? 0),
    ...listPage(data, 'people'),
    programmes: Array.isArray(data?.programmes) ? data.programmes : [],
  };
}

// ─── Programmes ──────────────────────────────────────────────────────

export async function publishProgramme(payload) {
  return callCommunity('community_publish_programme', { _p: payload });
}

export async function unpublishProgramme(id) {
  return callCommunity('community_unpublish_programme', { _id: id });
}

export async function getCommunityProgramme(id) {
  return callCommunity('community_get_programme', { _id: id });
}

export async function recordProgrammeUse(id, mode) {
  return callCommunity('community_record_programme_use', { _id: id, _mode: mode });
}

/** @returns {Promise<{programmes: Array, cursor: (string|null)}>} */
export async function myProgrammes() {
  return listPage(await callCommunity('community_my_programmes', {}), 'programmes');
}

/** @returns {Promise<{programmes: Array, cursor: (string|null)}>} */
export async function discoverProgrammes({ style = null, cursor = null, limit = DEFAULT_PAGE_SIZE } = {}) {
  return listPage(
    await callCommunity('community_discover_programmes', { _style: style, _cursor: cursor, _limit: limit }),
    'programmes',
  );
}

// ─── Posts, reactions and comments ───────────────────────────────────

export async function createPost({
  kind, payload, caption = null, programmeId = null, visibility = 'public',
}) {
  return callCommunity('community_create_post', {
    _kind: kind, _payload: payload, _caption: caption,
    _programme_id: programmeId, _visibility: visibility,
  });
}

export async function deletePost(id) {
  return callCommunity('community_delete_post', { _id: id });
}

export async function getPost(id) {
  return callCommunity('community_get_post', { _id: id });
}

/** One "Respect" tap, on or off. */
export async function reactToPost(postId, on) {
  return callCommunity('community_react', { _post_id: postId, _on: !!on });
}

export async function addComment(targetKind, targetId, body) {
  return callCommunity('community_comment', {
    _target_kind: targetKind, _target_id: targetId, _body: body,
  });
}

export async function deleteComment(id) {
  return callCommunity('community_delete_comment', { _id: id });
}

/** @returns {Promise<{comments: Array, cursor: (string|null)}>} */
export async function listComments(targetKind, targetId, { cursor = null, limit = DEFAULT_PAGE_SIZE } = {}) {
  return listPage(await callCommunity('community_list_comments', {
    _target_kind: targetKind, _target_id: targetId, _cursor: cursor, _limit: limit,
  }), 'comments');
}
