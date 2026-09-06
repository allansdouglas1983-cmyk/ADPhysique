/**
 * CommunityJoinScreen (blueprint sections 2, 6; SD-04).
 *
 * Two things this screen must get right, both pinned here:
 *
 *   1. The handle line tells the truth at every step. A handle of the
 *      wrong shape never reaches the server (nothing is asked of it until
 *      the shape is right), a taken handle says "Taken", a free one says
 *      "Available", and "Create profile" is only reachable from the last
 *      of those.
 *   2. Creating the profile IS the consent record. The call carries
 *      `accept_rules_version`, because a profile created without the
 *      accepted version is a Community row with no consent behind it.
 *
 * The client library is mocked: this is about what the screen sends and
 * shows, not about the RPC.
 */

import { create, act } from 'react-test-renderer';

jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: ({ children }) => children }));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('../../components/BackHeader', () => () => null);
jest.mock('../../lib/haptics', () => ({ selection: jest.fn(), commit: jest.fn() }));

const mockToastShow = jest.fn();
jest.mock('../../components/Toast', () => ({ useToast: () => ({ show: mockToastShow }) }));

jest.mock('../../hooks/useCommunityMe', () => ({
  __esModule: true,
  default: jest.fn(() => ({ me: { profile: null, is_minor: false }, loading: false, error: null, refresh: jest.fn() })),
}));

jest.mock('../../lib/community', () => ({
  // The real shape rule, not a stand-in: 3 to 20 lowercase letters,
  // digits or underscores, no leading or trailing underscore.
  isValidHandle: (h) => /^[a-z0-9_]{3,20}$/.test(h) && !h.startsWith('_') && !h.endsWith('_'),
  checkHandle: jest.fn(),
  upsertProfile: jest.fn(),
  DISPLAY_NAME_MAX: 40,
  COMMUNITY_RULES_VERSION: 1,
}));

import { checkHandle, upsertProfile, COMMUNITY_RULES_VERSION } from '../../lib/community';
import useCommunityMe from '../../hooks/useCommunityMe';
import CommunityJoinScreen from '../CommunityJoinScreen';

function flattenText(node) {
  if (node == null) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(flattenText).join(' ');
  return flattenText(node.children);
}

async function flush() {
  await act(async () => {
    jest.advanceTimersByTime(400);
    for (let i = 0; i < 12; i += 1) await Promise.resolve();
  });
}

function field(tree, label) {
  return tree.root.findAll((n) => n.props?.accessibilityLabel === label && n.props?.onChangeText)[0];
}

function button(tree, label) {
  return tree.root.findAll(
    (n) => typeof n.type === 'function' && n.props?.accessibilityLabel === label && 'onPress' in n.props,
  )[0];
}

async function mount() {
  const navigation = { navigate: jest.fn(), replace: jest.fn(), goBack: jest.fn() };
  let tree;
  await act(async () => {
    tree = create(<CommunityJoinScreen navigation={navigation} route={{ params: {} }} />);
  });
  await flush();
  return { tree, navigation };
}

async function type(tree, label, value) {
  await act(async () => { field(tree, label).props.onChangeText(value); });
  await flush();
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  checkHandle.mockResolvedValue(true);
  upsertProfile.mockResolvedValue({ user_id: 'u1', handle: 'rowan_lifts' });
  useCommunityMe.mockReturnValue({
    me: { profile: null, is_minor: false }, loading: false, error: null, refresh: jest.fn(),
  });
});

afterEach(() => { jest.useRealTimers(); });

describe('the handle line', () => {
  test('starts as the shape rule, and asks the server nothing', async () => {
    const { tree } = await mount();

    expect(flattenText(tree.toJSON()))
      .toContain('Use 3 to 20 letters, numbers or underscores.');
    expect(checkHandle).not.toHaveBeenCalled();
  });

  test('a handle of the wrong shape never reaches the server', async () => {
    const { tree } = await mount();
    await type(tree, 'Handle', 'ro');

    expect(checkHandle).not.toHaveBeenCalled();
    expect(flattenText(tree.toJSON()))
      .toContain('Use 3 to 20 letters, numbers or underscores.');
  });

  test('a free handle reads Available', async () => {
    const { tree } = await mount();
    await type(tree, 'Handle', 'rowan_lifts');

    expect(checkHandle).toHaveBeenCalledWith('rowan_lifts');
    expect(flattenText(tree.toJSON())).toContain('Available');
  });

  test('a used handle reads Taken', async () => {
    checkHandle.mockResolvedValue(false);
    const { tree } = await mount();
    await type(tree, 'Handle', 'rowan_lifts');

    expect(flattenText(tree.toJSON())).toContain('Taken');
  });

  test('whitespace and case are normalised before the check', async () => {
    const { tree } = await mount();
    await type(tree, 'Handle', 'Rowan Lifts');

    expect(checkHandle).toHaveBeenCalledWith('rowanlifts');
  });
});

describe('creating the profile', () => {
  test('is unreachable until the handle is available and a name is typed', async () => {
    const { tree } = await mount();
    expect(button(tree, 'Create my Community profile').props.disabled).toBe(true);

    await type(tree, 'Handle', 'rowan_lifts');
    expect(button(tree, 'Create my Community profile').props.disabled).toBe(true);

    await type(tree, 'Display name', 'Rowan M');
    expect(button(tree, 'Create my Community profile').props.disabled).toBe(false);
  });

  test('sends the accepted rules version with the profile', async () => {
    const { tree } = await mount();
    await type(tree, 'Handle', 'rowan_lifts');
    await type(tree, 'Display name', 'Rowan M');

    await act(async () => { button(tree, 'Create my Community profile').props.onPress(); });
    await flush();

    expect(upsertProfile).toHaveBeenCalledTimes(1);
    expect(upsertProfile).toHaveBeenCalledWith(expect.objectContaining({
      handle: 'rowan_lifts',
      display_name: 'Rowan M',
      visibility: 'public',
      accept_rules_version: COMMUNITY_RULES_VERSION,
    }));
  });

  test('a refusal is spoken calmly and nothing is claimed to have happened', async () => {
    const err = new Error('handle_taken');
    err.code = 'handle_taken';
    upsertProfile.mockRejectedValueOnce(err);

    const { tree, navigation } = await mount();
    await type(tree, 'Handle', 'rowan_lifts');
    await type(tree, 'Display name', 'Rowan M');
    await act(async () => { button(tree, 'Create my Community profile').props.onPress(); });
    await flush();

    expect(mockToastShow).toHaveBeenCalledWith(
      'That handle is taken. Try another.',
      expect.objectContaining({ variant: 'error' }),
    );
    expect(navigation.goBack).not.toHaveBeenCalled();
  });
});

describe('the rules and the under-18 rule', () => {
  test('the four rules are on the screen before the action', async () => {
    const { tree } = await mount();
    const text = flattenText(tree.toJSON());

    expect(text).toContain('Training talk only.');
    expect(text).toContain('Be decent to people.');
    expect(text).toContain('No body-shaming, no diet or calorie talk.');
    expect(text).toContain('Report what breaks this.');
  });

  test('an under-18 account is told its profile is followers-only', async () => {
    useCommunityMe.mockReturnValue({
      me: { profile: null, is_minor: true }, loading: false, error: null, refresh: jest.fn(),
    });
    const { tree } = await mount();

    expect(flattenText(tree.toJSON()))
      .toContain('Under 18: your profile is followers-only and does not appear in search.');
  });
});
