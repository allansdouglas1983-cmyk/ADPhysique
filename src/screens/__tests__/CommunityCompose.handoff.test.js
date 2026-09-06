/**
 * CommunityComposeScreen hand-off to Join (blueprint section 6; SD-06;
 * product review 2026-09-06, item 12).
 *
 * What this suite pins: a reader with no Community profile is handed to
 * Join by REPLACING this screen, never by pushing on top of it. Join
 * comes back with a `replace` of its own, so a push left two Compose
 * screens on the stack: the first had returned early with no payload, so
 * backing out of the posting flow landed on "Nothing to post yet".
 */

import { create, act } from 'react-test-renderer';

jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: ({ children }) => children }));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('../../components/BackHeader', () => () => null);
jest.mock('../../components/Toast', () => ({ useToast: () => ({ show: jest.fn() }) }));
jest.mock('../../lib/haptics', () => ({ selection: jest.fn(), commit: jest.fn() }));
jest.mock('../../lib/errorLog', () => ({ logError: jest.fn(), logWarn: jest.fn(), logInfo: jest.fn() }));
jest.mock('../../store/useAppStore', () => ({
  __esModule: true,
  default: (sel) => sel({ user: { id: 'u1' }, units: 'metric' }),
}));

jest.mock('../../lib/community', () => ({
  loadMe: jest.fn(),
  hasProfile: (me) => !!me?.profile?.handle,
  createPost: jest.fn(),
  buildPrPayload: jest.fn(() => ({ exercise_name: 'Squat' })),
  buildSessionPayload: jest.fn(() => ({ exercises: 5 })),
  buildBlockPayload: jest.fn(() => ({ weeks: 4 })),
  buildMilestonePayload: jest.fn(() => ({ kind: 'streak' })),
  buildProgrammePayload: jest.fn(() => ({ id: 'prog1' })),
  CAPTION_MAX: 280,
}));

import { loadMe } from '../../lib/community';
import CommunityComposeScreen from '../CommunityComposeScreen';

async function flush() {
  await act(async () => {
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
    await new Promise((r) => setImmediate(r));
  });
}

async function mount(params) {
  const navigation = { navigate: jest.fn(), replace: jest.fn(), goBack: jest.fn(), push: jest.fn() };
  let tree = null;
  await act(async () => {
    tree = create(<CommunityComposeScreen navigation={navigation} route={{ params }} />);
  });
  await flush();
  return { tree, navigation };
}

beforeEach(() => { jest.clearAllMocks(); });

describe('with no Community profile', () => {
  test('Join REPLACES Compose, so the stack never carries two of them', async () => {
    loadMe.mockResolvedValue({ me: { profile: null } });

    const { tree, navigation } = await mount({ kind: 'session', workoutId: 'w1' });

    expect(navigation.replace).toHaveBeenCalledWith('CommunityJoin', {
      next: { screen: 'CommunityCompose', params: { kind: 'session', workoutId: 'w1' } },
    });
    expect(navigation.navigate).not.toHaveBeenCalled();
    expect(navigation.push).not.toHaveBeenCalled();
    act(() => { tree.unmount(); });
  });
});

describe('with a Community profile', () => {
  test('nothing is handed off; the composer loads its payload', async () => {
    loadMe.mockResolvedValue({ me: { profile: { user_id: 'u1', handle: 'rowan_lifts' } } });

    const { tree, navigation } = await mount({ kind: 'session', workoutId: 'w1' });

    expect(navigation.replace).not.toHaveBeenCalled();
    expect(navigation.navigate).not.toHaveBeenCalled();
    act(() => { tree.unmount(); });
  });
});
