/**
 * CommunityEditProfileScreen and the visibility control on
 * CommunityPrivacyScreen (blueprint sections 2, 6; SD-05).
 *
 * Both screens send a PARTIAL profile: `community_upsert_profile` treats a
 * key that is absent on an update as "keep the current value" and a key
 * sent as null as "clear it" (migrate_160_community.sql, product review
 * 2026-09-06 findings 1-2). What this suite pins is the client half of
 * that contract, because getting it wrong is silent and total:
 *
 *   1. Neither screen sends a `handle`. Neither offers a handle field, and
 *      a save that carried one would either rename the profile or be
 *      refused as `handle_invalid` for a field the user cannot see.
 *   2. A refusal is spoken calmly, names nothing the user did not do, and
 *      nothing is claimed to have happened (no toast of success, no
 *      goBack).
 *   3. The privacy screen sends `{ visibility }` and NOTHING else, and a
 *      failure puts the segment back where it was rather than leaving a
 *      privacy control showing a state the server never accepted.
 *
 * The client library is mocked: this is about what the screens send and
 * show, not about the RPC.
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
  default: jest.fn(),
}));

jest.mock('../../lib/community', () => ({
  upsertProfile: jest.fn(),
  leaveCommunity: jest.fn(),
  relationships: jest.fn(),
  unblockUser: jest.fn(),
  unmuteUser: jest.fn(),
  hasProfile: (me) => !!me?.profile?.handle,
  COMMUNITY_STYLE_KEYS: { strength: 'Strength', kettlebell: 'Kettlebell' },
  COMMUNITY_GOALS: { get_stronger: 'Get stronger' },
  COMMUNITY_SETTINGS: { home_gym: 'Home gym' },
  MAX_STYLES_PER_PROFILE: 3,
  DISPLAY_NAME_MAX: 40,
  BIO_MAX: 160,
  AREA_LABEL_MAX: 60,
  GYM_LABEL_MAX: 60,
}));

import { upsertProfile, relationships } from '../../lib/community';
import useCommunityMe from '../../hooks/useCommunityMe';
import CommunityEditProfileScreen from '../CommunityEditProfileScreen';
import CommunityPrivacyScreen from '../CommunityPrivacyScreen';

const PROFILE = {
  user_id: 'u1',
  handle: 'rowan_lifts',
  display_name: 'Rowan M',
  bio: 'Kettlebells and squats.',
  avatar_preset: null,
  styles: ['kettlebell'],
  goal: 'get_stronger',
  setting: 'home_gym',
  area_label: 'Leeds',
  gym_label: 'PureGym Leeds',
  visibility: 'public',
};

function flattenText(node) {
  if (node == null) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(flattenText).join(' ');
  return flattenText(node.children);
}

async function flush() {
  await act(async () => {
    for (let i = 0; i < 12; i += 1) await Promise.resolve();
  });
}

function byLabel(tree, label) {
  return tree.root.findAll(
    (n) => typeof n.type === 'function' && n.props?.accessibilityLabel === label,
  )[0];
}

function field(tree, label) {
  return tree.root.findAll((n) => n.props?.accessibilityLabel === label && n.props?.onChangeText)[0];
}

async function mount(Screen) {
  const navigation = { navigate: jest.fn(), goBack: jest.fn(), popToTop: jest.fn() };
  let tree;
  await act(async () => {
    tree = create(<Screen navigation={navigation} route={{ params: {} }} />);
  });
  await flush();
  return { tree, navigation };
}

beforeEach(() => {
  jest.clearAllMocks();
  upsertProfile.mockResolvedValue({ ...PROFILE });
  relationships.mockResolvedValue({ blocked: [], muted: [] });
  useCommunityMe.mockReturnValue({
    me: { profile: PROFILE, is_moderator: false },
    loading: false,
    error: null,
    refresh: jest.fn(),
  });
});

describe('Edit profile saves the fields it owns', () => {
  test('the save carries no handle, and no handle field is on the screen', async () => {
    const { tree, navigation } = await mount(CommunityEditProfileScreen);

    await act(async () => { field(tree, 'Bio').props.onChangeText('Now with more squats.'); });
    await act(async () => { byLabel(tree, 'Save profile').props.onPress(); });
    await flush();

    expect(upsertProfile).toHaveBeenCalledTimes(1);
    const sent = upsertProfile.mock.calls[0][0];
    expect(sent).not.toHaveProperty('handle');
    expect(sent).toEqual(expect.objectContaining({
      display_name: 'Rowan M',
      bio: 'Now with more squats.',
      visibility: 'public',
    }));
    expect(field(tree, 'Handle')).toBeUndefined();
    expect(mockToastShow).toHaveBeenCalledWith('Profile saved');
    expect(navigation.goBack).toHaveBeenCalled();
  });

  test('a taken handle is spoken calmly and the screen stays put', async () => {
    const err = new Error('handle_taken');
    err.code = 'handle_taken';
    upsertProfile.mockRejectedValueOnce(err);

    const { tree, navigation } = await mount(CommunityEditProfileScreen);
    await act(async () => { byLabel(tree, 'Save profile').props.onPress(); });
    await flush();

    expect(mockToastShow).toHaveBeenCalledWith(
      'That handle is taken. Try another.',
      expect.objectContaining({ variant: 'error' }),
    );
    expect(mockToastShow).not.toHaveBeenCalledWith('Profile saved');
    expect(navigation.goBack).not.toHaveBeenCalled();
  });

  test('a rate limit says so plainly, and never blames the wording', async () => {
    const err = new Error('rate_limited');
    err.code = 'rate_limited';
    upsertProfile.mockRejectedValueOnce(err);

    const { tree } = await mount(CommunityEditProfileScreen);
    await act(async () => { byLabel(tree, 'Save profile').props.onPress(); });
    await flush();

    expect(mockToastShow).toHaveBeenCalledWith(
      'That is a lot of changes for one day. Try again tomorrow.',
      expect.objectContaining({ variant: 'error' }),
    );
  });
});

describe('the privacy screen visibility control', () => {
  function segment(tree) {
    return tree.root.findAll(
      (n) => typeof n.type === 'function' && n.props?.accessibilityLabel === 'Who can follow you',
    )[0];
  }

  test('sends only the visibility, and nothing else', async () => {
    const { tree } = await mount(CommunityPrivacyScreen);

    await act(async () => { segment(tree).props.onChange('followers'); });
    await flush();

    expect(upsertProfile).toHaveBeenCalledTimes(1);
    expect(upsertProfile).toHaveBeenCalledWith({ visibility: 'followers' });
    expect(mockToastShow).toHaveBeenCalledWith('You approve every follower');
  });

  test('a refusal puts the control back where it was', async () => {
    upsertProfile.mockRejectedValueOnce(Object.assign(new Error('offline'), { code: 'offline' }));

    const { tree } = await mount(CommunityPrivacyScreen);
    await act(async () => { segment(tree).props.onChange('followers'); });
    await flush();

    expect(segment(tree).props.value).toBe('public');
    expect(mockToastShow).toHaveBeenCalledWith(
      'Could not change that just now.',
      expect.objectContaining({ variant: 'error' }),
    );
  });

  test('the moderation queue is offered to a moderator only', async () => {
    const { tree } = await mount(CommunityPrivacyScreen);
    expect(flattenText(tree.toJSON())).not.toContain('Moderation queue');

    useCommunityMe.mockReturnValue({
      me: { profile: PROFILE, is_moderator: true },
      loading: false,
      error: null,
      refresh: jest.fn(),
    });
    const moderator = await mount(CommunityPrivacyScreen);
    expect(flattenText(moderator.tree.toJSON())).toContain('Moderation queue');
  });
});
