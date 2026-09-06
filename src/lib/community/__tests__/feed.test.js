/**
 * What this suite pins (blueprint sections 5.7, 6; SD-04, SD-09, SD-10;
 * product review 2026-09-06 finding 3, security review finding 9):
 *
 *  - every list RPC answers a WRAPPER object (`{posts, cursor}`,
 *    `{people, cursor}`, `{comments, cursor}`, `{activity, cursor}`), and
 *    the rows that leave this module are always arrays. Treating a
 *    wrapper as an array is silent: the inbox reads empty and the hub
 *    calls `.map` on an object;
 *  - the cursor carried onward is the SERVER's string. Rebuilding one
 *    from `created_at` is refused by `_community_cursor_parts` as
 *    `invalid_input`, so nothing here mints its own;
 *  - reading Discover never requires a Community profile (SD-04). Without
 *    one, `community_suggested_people` and `community_dimensions_me` are
 *    not called at all: both raise `no_profile`;
 *  - one failing section never empties Discover. The reads are settled
 *    independently, and a rejected optional section is simply empty.
 */

jest.mock('../transport', () => ({ callCommunity: jest.fn() }));
jest.mock('../profile', () => ({ currentUserId: () => 'u1' }));

const { callCommunity } = require('../transport');
const { loadHub, loadFeed, listComments, clearCachedHub } = require('../feed');
const { loadActivity } = require('../activity');

function refusal(code) {
  const e = new Error(code);
  e.code = code;
  return e;
}

/** Answer each RPC by name, so a call that should never happen is loud. */
function server(map) {
  callCommunity.mockImplementation((name) => {
    if (!(name in map)) return Promise.reject(refusal('unexpected_rpc'));
    const value = map[name];
    return value instanceof Error ? Promise.reject(value) : Promise.resolve(value);
  });
}

const POST_PAGE = { posts: [{ post: { id: 'p1' } }], cursor: '2026-09-06T10:00:00.000000+00|p1' };
const PROGRAMME_PAGE = { programmes: [{ id: 'g1' }], cursor: '2026-09-05T10:00:00.000000+00|g1' };

beforeEach(async () => {
  jest.clearAllMocks();
  // The hub caches per user, and an offline open is meant to fall back to
  // it. Each case starts from a cold cache so the assertion is about the
  // read, not about what a previous case left behind.
  await clearCachedHub('u1');
});

describe('the wrapper objects are unwrapped', () => {
  test('the feed answers rows and the server cursor, never the wrapper', async () => {
    server({ community_feed: POST_PAGE });
    const page = await loadFeed({});
    expect(page.posts).toEqual(POST_PAGE.posts);
    expect(page.cursor).toBe(POST_PAGE.cursor);
  });

  test('the activity inbox answers rows, not an empty list', async () => {
    server({ community_activity: { activity: [{ id: 'a1', kind: 'reaction' }], cursor: 'c1' } });
    const page = await loadActivity({});
    expect(page.activity).toHaveLength(1);
    expect(page.cursor).toBe('c1');
  });

  test('comments answer rows and the server cursor', async () => {
    server({ community_list_comments: { comments: [{ id: 'c1' }], cursor: 'k1' } });
    const page = await listComments('post', 'p1');
    expect(page.comments).toEqual([{ id: 'c1' }]);
    expect(page.cursor).toBe('k1');
  });

  test('a payload of the wrong shape leaves an array behind, never undefined', async () => {
    server({ community_feed: null });
    const page = await loadFeed({});
    expect(page.posts).toEqual([]);
    expect(page.cursor).toBeNull();
  });

  test('a cursor the server did not mint is never invented', async () => {
    server({ community_feed: { posts: [{ post: { id: 'p1', created_at: 12345 } }] } });
    const page = await loadFeed({});
    expect(page.cursor).toBeNull();
  });
});

describe('Discover without a Community profile (SD-04)', () => {
  test('the two reads that need a profile are not made', async () => {
    server({
      community_discover_programmes: PROGRAMME_PAGE,
      community_discover_posts: POST_PAGE,
    });

    const hub = await loadHub('discover', { joined: false });

    const called = callCommunity.mock.calls.map(([name]) => name);
    expect(called).not.toContain('community_suggested_people');
    expect(called).not.toContain('community_dimensions_me');
    expect(hub.programmes).toEqual(PROGRAMME_PAGE.programmes);
    expect(hub.posts).toEqual(POST_PAGE.posts);
    expect(hub.people).toEqual([]);
    expect(hub.dimensions).toEqual([]);
    expect(hub.error).toBeNull();
  });

  test('the paging cursor is the stories cursor the server minted', async () => {
    server({
      community_discover_programmes: PROGRAMME_PAGE,
      community_discover_posts: POST_PAGE,
    });
    const hub = await loadHub('discover', { joined: false });
    expect(hub.cursor).toBe(POST_PAGE.cursor);
  });
});

describe('one failing section never empties Discover', () => {
  test('a refused suggestions read leaves the programmes and stories standing', async () => {
    server({
      community_discover_programmes: PROGRAMME_PAGE,
      community_discover_posts: POST_PAGE,
      community_suggested_people: refusal('no_profile'),
      community_dimensions_me: { dimensions: [{ kind: 'style', key: 'kb', count: 4 }] },
    });

    const hub = await loadHub('discover', { joined: true });

    expect(hub.programmes).toEqual(PROGRAMME_PAGE.programmes);
    expect(hub.posts).toEqual(POST_PAGE.posts);
    expect(hub.people).toEqual([]);
    expect(hub.dimensions).toHaveLength(1);
  });

  test('only a Discover with neither programmes nor stories is a failure', async () => {
    server({
      community_discover_programmes: refusal('offline'),
      community_discover_posts: refusal('offline'),
      community_suggested_people: { people: [] },
      community_dimensions_me: { dimensions: [] },
    });

    const hub = await loadHub('discover', { joined: true });

    expect(hub.error).toBe('offline');
    expect(hub.fromCache).toBe(false);
    expect(hub.posts).toEqual([]);
  });

  test('with something read earlier, offline shows that instead of nothing', async () => {
    server({
      community_discover_programmes: PROGRAMME_PAGE,
      community_discover_posts: POST_PAGE,
      community_suggested_people: { people: [] },
      community_dimensions_me: { dimensions: [] },
    });
    await loadHub('discover', { joined: true });

    server({
      community_discover_programmes: refusal('offline'),
      community_discover_posts: refusal('offline'),
      community_suggested_people: refusal('offline'),
      community_dimensions_me: refusal('offline'),
    });
    const hub = await loadHub('discover', { joined: true });

    expect(hub.fromCache).toBe(true);
    expect(hub.error).toBe('offline');
    expect(hub.posts).toEqual(POST_PAGE.posts);
  });
});

describe('paging Discover', () => {
  test('pages the stories only, and asks for nothing else again', async () => {
    server({ community_discover_posts: { posts: [{ post: { id: 'p2' } }], cursor: 'next' } });

    const page = await loadHub('discover', { cursor: 'c0', joined: true });

    expect(callCommunity.mock.calls.map(([name]) => name)).toEqual(['community_discover_posts']);
    expect(page.posts).toHaveLength(1);
    expect(page.cursor).toBe('next');
  });
});
