/**
 * CommunityHubScreen state matrix (blueprint sections 1, 6; SD-04, SD-10).
 *
 * Mounts the real screen against a mocked client library, once per state
 * the hub genuinely has, and asserts what a person would see:
 *
 *   1. No profile: the hero, the privacy receipt and "Create my profile",
 *      with Discover still rendering underneath it, because reading
 *      public content never requires a profile (SD-04).
 *   2. Following, nothing followed yet: the empty state that answers
 *      "what now" plus the suggestion strip with its reasons.
 *   3. Discover: community programmes AND the "By Volyume" tiles built
 *      from the local library plans, so an empty community still has
 *      something in it.
 *   4. Offline: the cached payload renders with the quiet line, never an
 *      error screen.
 *   5. A legacy partner link: the "Partner invites have moved" card.
 *
 * The client library is mocked because this suite is about what the
 * screen does with a payload, not about the transport (which has its own
 * suite under src/lib/community/__tests__).
 */

import { create, act } from 'react-test-renderer';

jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: ({ children }) => children }));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('../../components/BackHeader', () => ({ right }) => right ?? null);
jest.mock('../../lib/haptics', () => ({ selection: jest.fn(), commit: jest.fn() }));
jest.mock('../../lib/errorLog', () => ({ logError: jest.fn(), logWarn: jest.fn(), logInfo: jest.fn() }));

jest.mock('../../lib/database', () => ({
  getLibraryPlans: jest.fn(() => Promise.resolve([])),
  getPlanWorkoutCounts: jest.fn(() => Promise.resolve({})),
}));

jest.mock('../../hooks/useCommunityMe', () => ({
  __esModule: true,
  default: jest.fn(() => ({ me: { profile: null }, loading: false, error: null, refresh: jest.fn() })),
}));

jest.mock('../../lib/community', () => ({
  loadHub: jest.fn(),
  hasProfile: (me) => !!me?.profile?.handle,
  hasUnseen: () => false,
  reactToPost: jest.fn(() => Promise.resolve()),
  COMMUNITY_DIMENSION_MIN_FOR_HUB: 3,
  COMMUNITY_STYLE_KEYS: { strength: 'Strength', kettlebell: 'Kettlebell' },
  COMMUNITY_GOALS: { get_stronger: 'Get stronger' },
  COMMUNITY_SETTINGS: { home_gym: 'Home gym' },
  follow: jest.fn(),
  unfollow: jest.fn(),
}));

import { loadHub } from '../../lib/community';
import { getLibraryPlans, getPlanWorkoutCounts } from '../../lib/database';
import useCommunityMe from '../../hooks/useCommunityMe';
import CommunityHubScreen from '../CommunityHubScreen';

const ME_WITH_PROFILE = {
  profile: { user_id: 'u1', handle: 'rowan_lifts', display_name: 'Rowan M', visibility: 'public' },
  pending_requests: 0,
  unseen_activity: 0,
  is_moderator: false,
};

function emptyHub(over = {}) {
  return {
    segment: 'following',
    posts: [],
    programmes: [],
    people: [],
    dimensions: [],
    cursor: null,
    fromCache: false,
    error: null,
    ...over,
  };
}

function card(over = {}) {
  return {
    user_id: 'u2',
    handle: 'priya_kb',
    display_name: 'Priya K',
    avatar_preset: null,
    styles: ['kettlebell'],
    goal: 'get_stronger',
    setting: 'home_gym',
    follower_count: 3,
    following_count: 2,
    relationship: { following: 'none', followed_by: false, muted: false, blocked: false },
    ...over,
  };
}

function flattenText(node) {
  if (node == null) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(flattenText).join(' ');
  return flattenText(node.children);
}

async function flush() {
  await act(async () => {
    for (let i = 0; i < 12; i += 1) await Promise.resolve();
    await new Promise((r) => setImmediate(r));
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
  });
}

/**
 * The hub's list is a FlashList (E8), which the jest moduleNameMapper
 * points at the react-native manual mock's FlatList passthrough host. Its
 * ListHeaderComponent / ListEmptyComponent therefore stay unrendered
 * ELEMENTS in props, so both are rendered for real here, which is how this
 * suite reads everything the hub puts above and instead of the feed.
 */
function renderList(tree) {
  const list = tree.root.findAll((n) => n.type === 'FlatList')[0];
  const parts = [];
  const trees = [];
  for (const element of [list.props.ListHeaderComponent, list.props.ListEmptyComponent]) {
    if (!element) continue;
    let part = null;
    act(() => { part = create(element); });
    trees.push(part);
    parts.push(flattenText(part.toJSON()));
  }
  return { list, trees, text: parts.join(' ') };
}

async function render(params = {}) {
  const parent = { navigate: jest.fn() };
  const navigation = { navigate: jest.fn(), push: jest.fn(), getParent: () => parent };
  let tree;
  await act(async () => {
    tree = create(<CommunityHubScreen navigation={navigation} route={{ params }} />);
  });
  await flush();
  const { list, trees, text } = renderList(tree);
  return {
    tree, list, parent, navigation, partTrees: trees,
    text: `${flattenText(tree.toJSON())} ${text}`,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  loadHub.mockResolvedValue(emptyHub());
  getLibraryPlans.mockResolvedValue([]);
  getPlanWorkoutCounts.mockResolvedValue({});
  useCommunityMe.mockReturnValue({ me: { profile: null }, loading: false, error: null, refresh: jest.fn() });
});

describe('state 1: no Community profile', () => {
  test('shows the hero, the privacy receipt and the one committing action', async () => {
    const { text } = await render();

    expect(text).toContain('Programmes you can make your own');
    expect(text).toContain('Nothing about your body, food or coaching is ever shared.');
    // The receipt's two columns, verbatim from the blueprint.
    expect(text).toContain('Others can see');
    expect(text).toContain('Never shared');
    expect(text).toContain('Create my profile');
    expect(text).toContain('Browse first');
  });

  test('reads Discover, not Following: value is visible before joining', async () => {
    await render();
    expect(loadHub).toHaveBeenCalledWith('discover', expect.any(Object));
  });

  test('no segmented control is offered until there is a profile', async () => {
    const { text } = await render();
    expect(text).not.toContain('Following');
  });
});

describe('state 2: Following with nothing followed yet', () => {
  test('the empty state answers "what now" and the suggestions carry reasons', async () => {
    useCommunityMe.mockReturnValue({
      me: ME_WITH_PROFILE, loading: false, error: null, refresh: jest.fn(),
    });
    loadHub.mockResolvedValue(emptyHub({
      people: [{ card: card(), reasons: ['Also trains kettlebell', 'Lists Leeds'] }],
    }));

    const { text } = await render();

    expect(text).toContain('Nothing here yet');
    expect(text).toContain('Follow a few people and their training stories will appear here.');
    expect(text).toContain('Find people');
    expect(text).toContain('People you may want to follow');
    expect(text).toContain('Also trains kettlebell · Lists Leeds');
  });
});

describe('state 3: Discover with Volyume tiles', () => {
  test('community programmes and the By Volyume tiles both render', async () => {
    useCommunityMe.mockReturnValue({
      me: ME_WITH_PROFILE, loading: false, error: null, refresh: jest.fn(),
    });
    getLibraryPlans.mockResolvedValue([
      { id: 'lib-1', name: 'Kettlebell Foundations', tags: 'style:kettlebell_foundations featured' },
    ]);
    getPlanWorkoutCounts.mockResolvedValue({ 'lib-1': 3 });
    loadHub.mockResolvedValue(emptyHub({
      segment: 'discover',
      programmes: [{
        id: 'p1',
        title: 'Minimal Push Pull Legs',
        style_key: 'strength',
        days_per_week: 3,
        exercise_count: 14,
        has_circuits: false,
        use_count: 4,
      }],
      dimensions: [
        { kind: 'style', key: 'kettlebell', label: 'Kettlebell lifters', count: 6 },
        // Below COMMUNITY_DIMENSION_MIN_FOR_HUB: never surfaced on the hub.
        { kind: 'area', key: 'leeds', label: 'Lifters in Leeds', count: 2 },
      ],
    }));

    const { text } = await render({ segment: 'discover' });

    expect(text).toContain('Programmes');
    expect(text).toContain('Minimal Push Pull Legs');
    expect(text).toContain('Kettlebell Foundations');
    expect(text).toContain('By Volyume');
    expect(text).toContain('Volyume');
    expect(text).toContain('Around you');
    expect(text).toContain('Kettlebell lifters');
    expect(text).not.toContain('Lifters in Leeds');
  });

  test('a Volyume tile opens the existing library plan detail, cross-tab', async () => {
    useCommunityMe.mockReturnValue({
      me: ME_WITH_PROFILE, loading: false, error: null, refresh: jest.fn(),
    });
    getLibraryPlans.mockResolvedValue([
      { id: 'lib-1', name: 'Kettlebell Foundations', tags: 'style:kettlebell_foundations featured' },
    ]);
    getPlanWorkoutCounts.mockResolvedValue({ 'lib-1': 3 });
    loadHub.mockResolvedValue(emptyHub({ segment: 'discover' }));

    const { partTrees, parent } = await render({ segment: 'discover' });
    const header = partTrees[0];
    const tile = header.root.findAll(
      (n) => n.props?.accessibilityLabel === 'Kettlebell Foundations, By Volyume',
    )[0];
    await act(async () => { tile.props.onPress(); });

    // navigateCrossTab dispatches on the TAB navigator, so the library plan
    // opens through the parent, exactly as PlanLibraryScreen's own rows do.
    expect(parent.navigate).toHaveBeenCalledWith(
      'PlansTab',
      expect.objectContaining({
        screen: 'PlanDetail',
        params: { planId: 'lib-1', isLibrary: true },
      }),
    );
  });
});

describe('state 4: offline with a cached payload', () => {
  test('the cached content renders under one quiet line, not an error', async () => {
    useCommunityMe.mockReturnValue({
      me: ME_WITH_PROFILE, loading: false, error: null, refresh: jest.fn(),
    });
    loadHub.mockResolvedValue(emptyHub({
      people: [{ card: card(), reasons: [] }],
      fromCache: true,
      error: 'offline',
    }));

    const { text } = await render();

    expect(text).toContain('Showing what you last saw. You are offline.');
    expect(text).toContain('Priya K');
    expect(text).not.toMatch(/something went wrong/i);
  });
});

describe('state 5: a legacy partner link', () => {
  test('the moved-invites card is shown, with a way onward', async () => {
    const { text } = await render({ legacyPartnerCode: 'ABCD12' });

    expect(text).toContain('Partner invites have moved');
    expect(text).toContain('Training partners are now part of Community.');
    expect(text).toContain('Find people');
  });

  test('no card without a legacy code', async () => {
    const { text } = await render();
    expect(text).not.toContain('Partner invites have moved');
  });
});

// ─── Product review 2026-09-06 (items 13 and 14) ────────────────────────
describe('the entry points that name a half of the hub', () => {
  beforeEach(() => {
    useCommunityMe.mockReturnValue({
      me: ME_WITH_PROFILE, loading: false, error: null, refresh: jest.fn(),
    });
  });

  test('params that arrive at an ALREADY MOUNTED hub still land on Discover', async () => {
    // The hub is a tab root, so Train's "Programmes from the community"
    // usually navigates to a screen that is already mounted: initial state
    // alone left the reader on whichever half they last looked at.
    loadHub.mockResolvedValue(emptyHub());
    const navigation = { navigate: jest.fn(), push: jest.fn(), getParent: () => ({ navigate: jest.fn() }) };
    let tree;
    await act(async () => {
      tree = create(
        <CommunityHubScreen navigation={navigation} route={{ params: { segment: 'following' } }} />,
      );
    });
    await flush();
    expect(loadHub).toHaveBeenLastCalledWith('following', expect.any(Object));

    await act(async () => {
      tree.update(
        <CommunityHubScreen
          navigation={navigation}
          route={{ params: { segment: 'discover', focus: 'programmes' } }}
        />,
      );
    });
    await flush();

    expect(loadHub).toHaveBeenLastCalledWith('discover', expect.any(Object));
  });

  test('"See all" opens the programmes half of search, which lists them all', async () => {
    loadHub.mockResolvedValue(emptyHub({
      segment: 'discover',
      programmes: [{
        id: 'p1', title: 'Minimal Push Pull Legs', style_key: 'strength',
        days_per_week: 3, exercise_count: 14, has_circuits: false, use_count: 4,
      }],
    }));

    const { partTrees, navigation, text } = await render({ segment: 'discover' });
    expect(text).toContain('See all');

    const header = partTrees[0];
    const seeAll = header.root.findAll(
      (n) => n.props?.accessibilityLabel === 'See all community programmes',
    )[0];
    await act(async () => { seeAll.props.onPress(); });

    expect(navigation.navigate).toHaveBeenCalledWith('CommunitySearch', { tab: 'programmes' });
  });

  test('with no community programmes there is nothing to see all of', async () => {
    getLibraryPlans.mockResolvedValue([
      { id: 'lib-1', name: 'Kettlebell Foundations', tags: 'style:kettlebell_foundations featured' },
    ]);
    getPlanWorkoutCounts.mockResolvedValue({ 'lib-1': 3 });
    loadHub.mockResolvedValue(emptyHub({ segment: 'discover' }));

    const { text } = await render({ segment: 'discover' });

    expect(text).toContain('Kettlebell Foundations');
    expect(text).not.toContain('See all');
  });
});
