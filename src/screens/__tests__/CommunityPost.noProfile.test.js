/**
 * CommunityPostScreen, read by someone with no Community profile
 * (blueprint section 6; SD-04; product review 2026-09-06, item 16).
 *
 * What this suite pins: reading a story never needs a profile, but
 * reacting and commenting do (`community_react` and `community_comment`
 * both raise `no_profile`). The screen used to show the composer and the
 * Respect tap to a reader without one and then say "that comment did not
 * send", which is the wrong reason and no route to the fix. Now there is
 * one quiet row that goes to Join and comes back here.
 *
 * The client library is mocked at its barrel: this is about what the
 * screen offers, not about the RPC.
 */

import { create, act } from 'react-test-renderer';

const mockToastShow = jest.fn();

jest.mock('../../store/useAppStore', () => ({
  __esModule: true,
  default: (sel) => sel({ user: { id: 'u1' }, accessibility: { reduceMotion: true } }),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (cb) => { const React = require('react'); React.useEffect(() => cb(), [cb]); },
  useNavigation: () => ({ goBack: jest.fn(), navigate: jest.fn() }),
}));
jest.mock('../../components/Toast', () => ({ useToast: () => ({ show: mockToastShow }) }));
jest.mock('../../components/AppAlert', () => ({ appAlert: jest.fn() }));
jest.mock('../../lib/haptics', () => ({ selection: jest.fn(), commit: jest.fn() }));
jest.mock('../../components/community/ReportSheet', () => () => null);

jest.mock('../../hooks/useCommunityMe', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('../../lib/community', () => ({
  getPost: jest.fn(),
  reactToPost: jest.fn(() => Promise.resolve({})),
  deletePost: jest.fn(),
  listComments: jest.fn(() => Promise.resolve({ comments: [], cursor: null })),
  addComment: jest.fn(() => Promise.resolve({})),
  deleteComment: jest.fn(),
  notifyCommunityEvent: jest.fn(),
  hasProfile: (me) => !!me?.profile?.handle,
  REPORT_REASONS: {},
  COMMENT_MAX: 500,
}));

import { getPost } from '../../lib/community';
import useCommunityMe from '../../hooks/useCommunityMe';
import CommunityPostScreen from '../CommunityPostScreen';

const PAYLOAD = {
  post: {
    id: 'post1',
    author_id: 'u2',
    kind: 'session',
    payload: { exercises: 5, sets: 18, minutes: 47 },
    caption: 'Good session.',
    reaction_count: 2,
    comment_count: 0,
    created_at: Date.now(),
  },
  author: { user_id: 'u2', handle: 'priya_kb', display_name: 'Priya K' },
  my_reaction: false,
};

function texts(tree) {
  const out = [];
  const walk = (node) => {
    if (node == null) return;
    if (typeof node === 'string' || typeof node === 'number') { out.push(String(node)); return; }
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (node.children) walk(node.children);
  };
  walk(tree.toJSON());
  return out.join(' | ');
}

async function flush() {
  await act(async () => {
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
    await new Promise((r) => setImmediate(r));
  });
}

async function mount() {
  const navigation = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn() };
  let tree = null;
  await act(async () => {
    tree = create(
      <CommunityPostScreen
        navigation={navigation}
        route={{ params: { id: 'post1' }, name: 'CommunityPost' }}
      />,
    );
  });
  await flush();
  return { tree, navigation };
}

/** The RN manual mock renders FlatList as a passthrough host, so the
 * header and footer stay unrendered ELEMENTS in props. */
function part(tree, key) {
  const list = tree.root.findAll((n) => n.type === 'FlatList')[0];
  let rendered = null;
  act(() => { rendered = create(list.props[key]); });
  return rendered;
}

function withProfile() {
  useCommunityMe.mockReturnValue({
    me: { profile: { user_id: 'u1', handle: 'rowan_lifts' } },
    loading: false,
    error: null,
    refresh: jest.fn(),
  });
}

function withoutProfile() {
  useCommunityMe.mockReturnValue({
    me: { profile: null }, loading: false, error: null, refresh: jest.fn(),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  getPost.mockResolvedValue(PAYLOAD);
  withProfile();
});

describe('a reader with no Community profile', () => {
  test('is offered one quiet row to Join, in place of the composer', async () => {
    withoutProfile();
    const { tree, navigation } = await mount();
    const footer = part(tree, 'ListFooterComponent');

    expect(texts(footer)).toContain('Create your Community profile to react and comment');

    const row = footer.root.findAll(
      (n) => n.props?.accessibilityLabel === 'Create your Community profile to react and comment'
        && 'onPress' in n.props,
    )[0];
    await act(async () => { row.props.onPress(); });

    expect(navigation.navigate).toHaveBeenCalledWith('CommunityJoin', {
      next: { screen: 'CommunityPost', params: { id: 'post1' } },
    });
    act(() => { footer.unmount(); tree.unmount(); });
  });

  test('the Respect tap is not offered either: it would only be refused', async () => {
    withoutProfile();
    const { tree } = await mount();
    const header = part(tree, 'ListHeaderComponent');

    // PostCard disables the tap when it is handed no onReact.
    const card = header.root.findAll(
      (n) => typeof n.type === 'function' && n.props && 'myReaction' in n.props,
    )[0];
    expect(card.props.onReact).toBeUndefined();
    // The story itself still reads, profile or not (SD-04).
    expect(texts(header)).toContain('Good session.');
    act(() => { header.unmount(); tree.unmount(); });
  });
});

describe('a reader with a Community profile', () => {
  test('gets the composer and a live Respect tap', async () => {
    const { tree } = await mount();
    const footer = part(tree, 'ListFooterComponent');
    const header = part(tree, 'ListHeaderComponent');

    expect(texts(footer)).not.toContain('Create your Community profile to react and comment');

    const card = header.root.findAll(
      (n) => typeof n.type === 'function' && n.props && 'myReaction' in n.props,
    )[0];
    expect(typeof card.props.onReact).toBe('function');
    act(() => { footer.unmount(); header.unmount(); tree.unmount(); });
  });
});
