/**
 * CommunityProgrammeScreen (social-discovery blueprint sections 6 and 13,
 * `docs/social-discovery-2026-09-06/30-BLUEPRINT.md`).
 *
 * What this suite pins:
 *  - the structure renders CIRCUITS as one block carrying rounds and round
 *    rest, and straight sets with their reps and rest. A shared circuit that
 *    lost its rounds would read as three unrelated exercises, which is not
 *    the training the creator built;
 *  - NO WEIGHT is ever rendered from a snapshot. Snapshots do not carry one;
 *    this is the behavioural half of that rule, so a future field could not
 *    quietly start showing loads;
 *  - the action hierarchy the lead visual review settled (2026-09-06,
 *    ruling 2): "Adapt for me" leads as the `primary` with `options-outline`,
 *    "Use as-is" is the `secondary`, and neither is emphatic;
 *  - "Use as-is" confirms before it copies, then copies, records the use and
 *    lands on the new plan.
 *
 * The Community client library is mocked at its barrel: this suite is about
 * the screen, and the library has its own suites.
 */
import { create, act } from 'react-test-renderer';

const mockToastShow = jest.fn();
const mockAppAlert = jest.fn();
const mockNavigateCrossTab = jest.fn();

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
jest.mock('../../components/AppAlert', () => ({ appAlert: (...a) => mockAppAlert(...a) }));
jest.mock('../../navigation/navigateCrossTab', () => ({
  navigateCrossTab: (...a) => mockNavigateCrossTab(...a),
}));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));
// The sibling lane's components are rendered as their props, so this suite
// asserts what the screen HANDS them rather than how they draw.
jest.mock('../../components/community/ProfileCard', () => () => null);
jest.mock('../../components/community/ReportSheet', () => () => null);

jest.mock('../../lib/community', () => ({
  getCommunityProgramme: jest.fn(),
  recordProgrammeUse: jest.fn(() => Promise.resolve({})),
  listComments: jest.fn(() => Promise.resolve({ comments: [], cursor: null })),
  addComment: jest.fn(() => Promise.resolve({})),
  deleteComment: jest.fn(() => Promise.resolve({})),
  importSnapshotAsPlan: jest.fn(),
  notifyCommunityEvent: jest.fn(),
  snapshotStats: jest.requireActual('../../lib/community/snapshot').snapshotStats,
  COMMUNITY_STYLE_KEYS: jest.requireActual('../../lib/community/validation').COMMUNITY_STYLE_KEYS,
  programmeUrl: (id) => `https://volyume.app/p?id=${id}`,
  COMMENT_MAX: 500,
}));

import {
  getCommunityProgramme, recordProgrammeUse, importSnapshotAsPlan, notifyCommunityEvent,
} from '../../lib/community';
import CommunityProgrammeScreen from '../CommunityProgrammeScreen';

// A real-shaped snapshot: day 1 is a three-station circuit at 3 rounds with
// 90 s between rounds, then two straight sets; day 2 is straight sets only.
const SNAPSHOT = {
  v: 1,
  title: 'Full-body circuit, dumbbells',
  description: 'Three short sessions with one pair of dumbbells.',
  style_key: 'circuits',
  days_per_week: 2,
  days: [
    {
      name: 'Full body A',
      position: 0,
      exercises: [
        {
          exercise_id: 'e1', exercise_name: 'Goblet squat', order: 0, sets: 3,
          reps_min: 8, reps_max: 12, rest_seconds: 0, notes: null,
          superset_group_id: 'g1', group_kind: 'circuit', round_rest_seconds: 90,
        },
        {
          exercise_id: 'e2', exercise_name: 'Push-up', order: 1, sets: 3,
          reps_min: 8, reps_max: 12, rest_seconds: 0, notes: null,
          superset_group_id: 'g1', group_kind: 'circuit', round_rest_seconds: 90,
        },
        {
          exercise_id: 'e3', exercise_name: 'Dumbbell row', order: 2, sets: 3,
          reps_min: 8, reps_max: 12, rest_seconds: 0, notes: null,
          superset_group_id: 'g1', group_kind: 'circuit', round_rest_seconds: 90,
        },
        {
          exercise_id: 'e4', exercise_name: 'Romanian deadlift', order: 3, sets: 3,
          reps_min: 8, reps_max: 10, rest_seconds: 90, notes: null,
          superset_group_id: null, group_kind: null, round_rest_seconds: null,
        },
      ],
    },
    {
      name: 'Full body B',
      position: 1,
      exercises: [
        {
          exercise_id: 'e5', exercise_name: 'Floor press', order: 0, sets: 4,
          reps_min: 6, reps_max: 8, rest_seconds: 120, notes: null,
          superset_group_id: null, group_kind: null, round_rest_seconds: null,
        },
      ],
    },
  ],
};

const PROGRAMME = {
  id: 'prog1', owner_id: 'u2', title: 'Full-body circuit, dumbbells',
  description: 'Three short sessions with one pair of dumbbells.',
  style_key: 'circuits', days_per_week: 2, exercise_count: 5, has_circuits: true,
  snapshot: SNAPSHOT, version: 1, visibility: 'public', use_count: 4,
};

const PAYLOAD = {
  programme: PROGRAMME,
  creator: { user_id: 'u2', handle: 'priya_kb', display_name: 'Priya K' },
  my_use: null,
  comments_count: 0,
};

/** The RN manual mock renders FlatList as a passthrough host, so its
 * ListHeaderComponent/ListFooterComponent stay unrendered ELEMENTS in props.
 * Pull the header out and render it for real, which is how this suite reads
 * everything the screen puts above the comment thread. */
function renderHeader(tree) {
  const list = tree.root.findAll((n) => n.type === 'FlatList')[0];
  let header = null;
  act(() => { header = create(list.props.ListHeaderComponent); });
  return header;
}

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

function buttons(tree) {
  return tree.root.findAll((n) => typeof n.type === 'function' && n.props && 'title' in n.props && 'onPress' in n.props)
    .map((n) => n.props);
}

async function flush() {
  await act(async () => {
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
    await new Promise((r) => setImmediate(r));
  });
}

async function mount() {
  let tree = null;
  await act(async () => {
    tree = create(
      <CommunityProgrammeScreen
        navigation={{ navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn() }}
        route={{ params: { id: 'prog1' }, name: 'CommunityProgramme' }}
      />,
    );
  });
  await flush();
  return tree;
}

beforeEach(() => {
  jest.clearAllMocks();
  getCommunityProgramme.mockResolvedValue(PAYLOAD);
  importSnapshotAsPlan.mockResolvedValue({ plan: { id: 'plan-new' }, unresolved: [], rowsByDay: {} });
});

describe('the structure reads as the training the creator built', () => {
  test('a circuit group is one block with its rounds and its round rest', async () => {
    const tree = await mount();
    const header = renderHeader(tree);
    const text = texts(header);
    expect(text).toContain('Circuit · 3 rounds · 90 s between rounds');
    // The three stations sit inside that block, in order.
    expect(text.indexOf('Circuit · 3 rounds')).toBeLessThan(text.indexOf('Goblet squat'));
    expect(text.indexOf('Goblet squat')).toBeLessThan(text.indexOf('Push-up'));
    expect(text.indexOf('Push-up')).toBeLessThan(text.indexOf('Dumbbell row'));
    act(() => { tree.unmount(); });
  });

  test('straight sets carry sets, reps and rest; circuit stations carry reps only', async () => {
    const tree = await mount();
    const text = texts(renderHeader(tree));
    expect(text).toContain('3 x 8 to 10 · 90 s');
    expect(text).toContain('4 x 6 to 8 · 120 s');
    // A station never repeats the round rest that the group label already
    // carries, and never claims a per-set rest a circuit does not have.
    expect(text).not.toContain('3 x 8 to 12 · 0 s');
    act(() => { tree.unmount(); });
  });

  test('every day is named and numbered', async () => {
    const tree = await mount();
    const text = texts(renderHeader(tree));
    expect(text).toContain('Day 1 · Full body A');
    expect(text).toContain('Day 2 · Full body B');
    act(() => { tree.unmount(); });
  });

  test('no weight is rendered, even when the snapshot carries one', async () => {
    getCommunityProgramme.mockResolvedValue({
      ...PAYLOAD,
      programme: {
        ...PROGRAMME,
        snapshot: {
          ...SNAPSHOT,
          days: [{
            ...SNAPSHOT.days[1],
            exercises: [{
              ...SNAPSHOT.days[1].exercises[0],
              starting_weight: 47.5, weight: 47.5, bodyweightKg: 81.3,
            }],
          }],
        },
      },
    });
    const tree = await mount();
    const text = texts(renderHeader(tree));
    expect(text).not.toContain('47.5');
    expect(text).not.toContain('81.3');
    expect(text).not.toMatch(/\bkg\b/);
    act(() => { tree.unmount(); });
  });
});

describe('the action row (lead visual review ruling 2)', () => {
  test('Adapt for me leads as the primary with the options glyph', async () => {
    const tree = await mount();
    const adapt = buttons(tree).find((b) => b.title === 'Adapt for me');
    expect(adapt).toBeTruthy();
    // `primary` is the Button default, so an absent variant IS primary.
    expect(adapt.variant ?? 'primary').toBe('primary');
    expect(adapt.icon).toBe('options-outline');
    act(() => { tree.unmount(); });
  });

  test('Use as-is is the secondary, and nothing on this screen is emphatic', async () => {
    const tree = await mount();
    const all = buttons(tree);
    expect(all.find((b) => b.title === 'Use as-is').variant).toBe('secondary');
    expect(all.some((b) => b.variant === 'emphatic')).toBe(false);
    act(() => { tree.unmount(); });
  });

  test('Adapt for me is listed before Use as-is', async () => {
    const tree = await mount();
    const titles = buttons(tree).map((b) => b.title);
    expect(titles.indexOf('Adapt for me')).toBeLessThan(titles.indexOf('Use as-is'));
    act(() => { tree.unmount(); });
  });
});

describe('Use as-is', () => {
  test('confirms in the words that say nothing is activated', async () => {
    const tree = await mount();
    const useAsIs = buttons(tree).find((b) => b.title === 'Use as-is');
    await act(async () => { useAsIs.onPress(); });
    expect(mockAppAlert).toHaveBeenCalled();
    const [title, message] = mockAppAlert.mock.calls[0];
    expect(title).toBe('Copy this programme?');
    expect(message).toBe(
      'It goes to your plans as a new programme. Nothing is activated and your current plan is untouched.',
    );
    act(() => { tree.unmount(); });
  });

  test('copies, records the use, tells the creator and lands on the new plan', async () => {
    const tree = await mount();
    const useAsIs = buttons(tree).find((b) => b.title === 'Use as-is');
    await act(async () => { useAsIs.onPress(); });
    const confirm = mockAppAlert.mock.calls[0][2].find((b) => b.text === 'Copy to my plans');
    await act(async () => { await confirm.onPress(); });
    await flush();

    expect(importSnapshotAsPlan).toHaveBeenCalledWith('u1', SNAPSHOT, {
      communityId: 'prog1', mode: 'use',
    });
    expect(recordProgrammeUse).toHaveBeenCalledWith('prog1', 'use');
    expect(notifyCommunityEvent).toHaveBeenCalledWith('programme_used', 'u2', 'prog1');
    expect(mockToastShow).toHaveBeenCalledWith('Added to your plans', { variant: 'success' });
    expect(mockNavigateCrossTab).toHaveBeenCalledWith(
      expect.anything(), 'PlansTab', 'PlanDetail', { planId: 'plan-new' },
    );
    act(() => { tree.unmount(); });
  });

  test('a failed copy is a calm toast and no navigation', async () => {
    importSnapshotAsPlan.mockRejectedValue(new Error('nope'));
    const tree = await mount();
    const useAsIs = buttons(tree).find((b) => b.title === 'Use as-is');
    await act(async () => { useAsIs.onPress(); });
    const confirm = mockAppAlert.mock.calls[0][2].find((b) => b.text === 'Copy to my plans');
    await act(async () => { await confirm.onPress(); });
    await flush();
    expect(mockToastShow).toHaveBeenCalledWith('That did not copy. Please try again.', { variant: 'error' });
    expect(mockNavigateCrossTab).not.toHaveBeenCalled();
    act(() => { tree.unmount(); });
  });
});

describe('when Community cannot be reached', () => {
  test('the screen says so calmly and offers a retry, never an error code', async () => {
    getCommunityProgramme.mockRejectedValue(Object.assign(new Error('offline'), { code: 'offline' }));
    const tree = await mount();
    const text = texts(tree);
    expect(text).toContain('Volyume could not reach Community just now.');
    expect(text).toContain('Try again');
    expect(text).not.toContain('offline');
    act(() => { tree.unmount(); });
  });
});
