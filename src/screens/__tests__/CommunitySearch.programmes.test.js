/**
 * CommunitySearchScreen, the programmes half (blueprint sections 1, 6;
 * SD-09; product review 2026-09-06, item 14).
 *
 * What this suite pins: an EMPTY query on the Programmes tab lists the
 * Discover programmes and pages them on the SERVER cursor. That is what
 * "See all" beside the hub's Programmes section opens, and it is the only
 * way to read past the first twenty: the hub merged the stories' cursor
 * with the programmes and dropped the next page of them entirely.
 *
 * People are unchanged: a name search needs a name.
 */

import { create, act } from 'react-test-renderer';

jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: ({ children }) => children }));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('../../components/BackHeader', () => () => null);
jest.mock('../../lib/haptics', () => ({ selection: jest.fn(), commit: jest.fn() }));
jest.mock('../../store/useAppStore', () => ({
  __esModule: true,
  default: (sel) => sel({ user: { id: 'u1' }, accessibility: { reduceMotion: true } }),
}));

jest.mock('../../lib/community', () => ({
  searchPeople: jest.fn(() => Promise.resolve({ people: [], cursor: null })),
  searchProgrammes: jest.fn(() => Promise.resolve({ programmes: [], cursor: null })),
  discoverProgrammes: jest.fn(() => Promise.resolve({ programmes: [], cursor: null })),
  COMMUNITY_STYLE_KEYS: jest.requireActual('../../lib/community/validation').COMMUNITY_STYLE_KEYS,
}));

import { searchPeople, searchProgrammes, discoverProgrammes } from '../../lib/community';
import CommunitySearchScreen from '../CommunitySearchScreen';

function programme(id, title) {
  return {
    id,
    title,
    style_key: 'strength',
    days_per_week: 3,
    exercise_count: 12,
    has_circuits: false,
    use_count: 1,
  };
}

async function flush() {
  await act(async () => {
    jest.advanceTimersByTime(400);
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
  });
}

async function mount(params = {}) {
  const navigation = { navigate: jest.fn(), goBack: jest.fn() };
  let tree = null;
  await act(async () => {
    tree = create(<CommunitySearchScreen navigation={navigation} route={{ params }} />);
  });
  await flush();
  return { tree, navigation };
}

function list(tree) {
  return tree.root.findAll((n) => n.type === 'FlatList')[0];
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
});

afterEach(() => { jest.useRealTimers(); });

describe('the programmes tab with no query', () => {
  test('lists the Discover programmes, and searches nothing', async () => {
    discoverProgrammes.mockResolvedValue({ programmes: [programme('p1', 'Minimal PPL')], cursor: 'c1' });

    const { tree } = await mount({ tab: 'programmes' });

    expect(discoverProgrammes).toHaveBeenCalledWith({ limit: 20 });
    expect(searchProgrammes).not.toHaveBeenCalled();
    expect(list(tree).props.data).toHaveLength(1);
    act(() => { tree.unmount(); });
  });

  test('pages on the server cursor and appends the next page', async () => {
    discoverProgrammes
      .mockResolvedValueOnce({ programmes: [programme('p1', 'Minimal PPL')], cursor: 'c1' })
      .mockResolvedValueOnce({ programmes: [programme('p2', 'Kettlebell base')], cursor: 'c2' });

    const { tree } = await mount({ tab: 'programmes' });
    await act(async () => { list(tree).props.onEndReached(); });
    await flush();

    expect(discoverProgrammes).toHaveBeenLastCalledWith({ cursor: 'c1', limit: 20 });
    expect(list(tree).props.data.map((r) => r.id)).toEqual(['p1', 'p2']);
    act(() => { tree.unmount(); });
  });

  test('a page that comes back empty ends the paging rather than looping', async () => {
    discoverProgrammes
      .mockResolvedValueOnce({ programmes: [programme('p1', 'Minimal PPL')], cursor: 'c1' })
      .mockResolvedValueOnce({ programmes: [], cursor: 'c2' });

    const { tree } = await mount({ tab: 'programmes' });
    await act(async () => { list(tree).props.onEndReached(); });
    await flush();
    await act(async () => { list(tree).props.onEndReached(); });
    await flush();

    expect(discoverProgrammes).toHaveBeenCalledTimes(2);
    act(() => { tree.unmount(); });
  });

  test('with nothing published, the empty state says so', async () => {
    const { tree } = await mount({ tab: 'programmes' });

    const empty = list(tree).props.ListEmptyComponent;
    let rendered = null;
    act(() => { rendered = create(empty); });
    const out = [];
    const walk = (n) => {
      if (n == null) return;
      if (typeof n === 'string' || typeof n === 'number') { out.push(String(n)); return; }
      if (Array.isArray(n)) { n.forEach(walk); return; }
      if (n.children) walk(n.children);
    };
    walk(rendered.toJSON());

    expect(out.join(' ')).toContain('No programmes yet');
    act(() => { rendered.unmount(); tree.unmount(); });
  });
});

describe('the programmes tab with a query', () => {
  test('searches by title, and pages that search on its own cursor', async () => {
    searchProgrammes
      .mockResolvedValueOnce({ programmes: [programme('p1', 'Minimal PPL')], cursor: 'c1' })
      .mockResolvedValueOnce({ programmes: [programme('p2', 'Minimal upper')], cursor: null });

    const { tree } = await mount({ tab: 'programmes', q: 'minimal' });

    expect(searchProgrammes).toHaveBeenCalledWith('minimal', { limit: 20 });
    await act(async () => { list(tree).props.onEndReached(); });
    await flush();

    expect(searchProgrammes).toHaveBeenLastCalledWith('minimal', { cursor: 'c1', limit: 20 });
    expect(list(tree).props.data.map((r) => r.id)).toEqual(['p1', 'p2']);
    act(() => { tree.unmount(); });
  });
});

describe('the people tab is unchanged', () => {
  test('an empty query asks the server nothing', async () => {
    const { tree } = await mount();

    expect(searchPeople).not.toHaveBeenCalled();
    expect(discoverProgrammes).not.toHaveBeenCalled();
    act(() => { tree.unmount(); });
  });
});
