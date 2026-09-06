/**
 * CommunityPublishProgrammeScreen (blueprint section 6; SD-04; product
 * review 2026-09-06, items 12, 17 and 33).
 *
 * What this suite pins:
 *  - the hand-off to Join REPLACES this screen rather than pushing Join on
 *    top of it, because Join comes back with a `replace` of its own;
 *  - the preview shows the exercise NOTES that are about to be published,
 *    and one caption says they travel. A private note on an exercise used
 *    to be published unseen;
 *  - a plan that cannot be shared is told WHY. `validateSnapshot` fails on
 *    the caps as well as on an empty plan, and one line for all of them
 *    told a creator with nine days to add a workout;
 *  - "Link only" carries the line that says what link-only means.
 */

import { create, act } from 'react-test-renderer';

jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: ({ children }) => children }));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('../../components/BackHeader', () => () => null);
jest.mock('../../components/Toast', () => ({ useToast: () => ({ show: jest.fn() }) }));
jest.mock('../../components/AppAlert', () => ({ appAlert: jest.fn() }));
jest.mock('../../lib/haptics', () => ({ selection: jest.fn(), commit: jest.fn() }));
jest.mock('../../lib/errorLog', () => ({ logError: jest.fn(), logWarn: jest.fn(), logInfo: jest.fn() }));

jest.mock('../../lib/community', () => ({
  buildSnapshotForPlan: jest.fn(),
  validateSnapshot: jest.requireActual('../../lib/community/snapshot').validateSnapshot,
  snapshotStats: jest.requireActual('../../lib/community/snapshot').snapshotStats,
  publishProgramme: jest.fn(),
  unpublishProgramme: jest.fn(),
  myProgrammes: jest.fn(() => Promise.resolve({ programmes: [] })),
  hasProfile: (me) => !!me?.profile?.handle,
  loadMe: jest.fn(),
  programmeUrl: (id) => `https://volyume.app/p/?id=${id}`,
  PROGRAMME_TITLE_MAX: 60,
  PROGRAMME_DESCRIPTION_MAX: 400,
  SNAPSHOT_MAX_DAYS: 8,
  SNAPSHOT_MAX_EXERCISES_PER_DAY: 20,
}));

import { buildSnapshotForPlan, loadMe } from '../../lib/community';
import CommunityPublishProgrammeScreen, {
  publishBlockedLine, snapshotHasNotes, NOTES_TRAVEL_LINE, LINK_ONLY_LINE,
} from '../CommunityPublishProgrammeScreen';

function day(name, position, exercises) {
  return { name, position, exercises };
}

function exercise(id, name, order, over = {}) {
  return {
    exercise_id: id,
    exercise_name: name,
    order,
    sets: 3,
    reps_min: 8,
    reps_max: 12,
    rest_seconds: 90,
    notes: null,
    superset_group_id: null,
    group_kind: null,
    round_rest_seconds: null,
    ...over,
  };
}

function snapshot(over = {}) {
  const days = over.days ?? [
    day('Upper', 0, [exercise('e1', 'Bench press', 0)]),
    day('Lower', 1, [exercise('e2', 'Back squat', 0)]),
  ];
  return {
    v: 1,
    title: 'Two-day starter',
    description: 'Two sessions a week.',
    style_key: 'strength',
    split_type: 'upper_lower',
    difficulty: 'beginner',
    days_per_week: days.length,
    ...over,
    days,
  };
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

async function flush() {
  await act(async () => {
    for (let i = 0; i < 12; i += 1) await Promise.resolve();
    await new Promise((r) => setImmediate(r));
  });
}

async function mount() {
  const navigation = { navigate: jest.fn(), replace: jest.fn(), goBack: jest.fn(), push: jest.fn() };
  let tree = null;
  await act(async () => {
    tree = create(
      <CommunityPublishProgrammeScreen navigation={navigation} route={{ params: { planId: 'plan1' } }} />,
    );
  });
  await flush();
  return { tree, navigation };
}

beforeEach(() => {
  jest.clearAllMocks();
  loadMe.mockResolvedValue({ me: { profile: { user_id: 'u1', handle: 'rowan_lifts' } } });
  buildSnapshotForPlan.mockResolvedValue(snapshot());
});

describe('the hand-off to Join (item 12)', () => {
  test('REPLACES this screen, so the stack never carries two of them', async () => {
    loadMe.mockResolvedValue({ me: { profile: null } });

    const { tree, navigation } = await mount();

    expect(navigation.replace).toHaveBeenCalledWith('CommunityJoin', {
      next: { screen: 'CommunityPublishProgramme', params: { planId: 'plan1' } },
    });
    expect(navigation.navigate).not.toHaveBeenCalled();
    act(() => { tree.unmount(); });
  });
});

describe('the exercise notes in the preview (item 17)', () => {
  test('a note is shown, with the caption that says it travels', async () => {
    buildSnapshotForPlan.mockResolvedValue(snapshot({
      days: [
        day('Upper', 0, [exercise('e1', 'Bench press', 0, { notes: 'Shoulder, keep it light' })]),
      ],
    }));

    const { tree } = await mount();
    const text = texts(tree);

    expect(text).toContain('Shoulder, keep it light');
    expect(text).toContain(NOTES_TRAVEL_LINE);
    act(() => { tree.unmount(); });
  });

  test('with no notes anywhere, the caption is not shown', async () => {
    const { tree } = await mount();

    expect(texts(tree)).not.toContain(NOTES_TRAVEL_LINE);
    act(() => { tree.unmount(); });
  });

  test('snapshotHasNotes ignores a blank note', () => {
    expect(snapshotHasNotes(snapshot())).toBe(false);
    expect(snapshotHasNotes(snapshot({
      days: [day('Upper', 0, [exercise('e1', 'Bench press', 0, { notes: '   ' })])],
    }))).toBe(false);
    expect(snapshotHasNotes(snapshot({
      days: [day('Upper', 0, [exercise('e1', 'Bench press', 0, { notes: 'Slow eccentric' })])],
    }))).toBe(true);
    expect(snapshotHasNotes(null)).toBe(false);
  });
});

describe('why a plan cannot be shared (item 33)', () => {
  test('each cap has its own line, and the empty plan keeps the original', () => {
    expect(publishBlockedLine(['too_many_days']))
      .toBe('A shared programme can have up to 8 days. Take one out, then share it.');
    expect(publishBlockedLine(['day_2_too_many_exercises']))
      .toBe('A day can have up to 20 exercises. Shorten the longest day, then share it.');
    expect(publishBlockedLine(['too_large']))
      .toBe('This plan is too big to share. Shorten the descriptions and your exercise notes, then share it.');
    expect(publishBlockedLine(['no_days']))
      .toBe('This plan has no days and exercises to publish. Add a workout to it first, then share it.');
    expect(publishBlockedLine([]))
      .toContain('This plan has no days and exercises to publish.');
  });

  test('a plan over the day cap says so on screen, not "add a workout"', async () => {
    const days = Array.from({ length: 9 }, (_, i) => day(`Day ${i + 1}`, i, [exercise(`e${i}`, 'Bench press', 0)]));
    buildSnapshotForPlan.mockResolvedValue(snapshot({ days }));

    const { tree } = await mount();
    const text = texts(tree);

    expect(text).toContain('A shared programme can have up to 8 days.');
    expect(text).not.toContain('Add a workout to it first');
    act(() => { tree.unmount(); });
  });
});

describe('the visibility control (item 33)', () => {
  test('"Link only" explains itself, and the other choices do not borrow the line', async () => {
    const { tree } = await mount();
    expect(texts(tree)).not.toContain(LINK_ONLY_LINE);

    const control = tree.root.findAll(
      (n) => typeof n.type === 'function' && n.props && 'options' in n.props && 'onChange' in n.props,
    )[0];
    await act(async () => { control.props.onChange('link'); });

    expect(texts(tree)).toContain(LINK_ONLY_LINE);
    expect(LINK_ONLY_LINE).toBe('Anyone with the link can open it. It is not listed anywhere.');
    act(() => { tree.unmount(); });
  });
});
