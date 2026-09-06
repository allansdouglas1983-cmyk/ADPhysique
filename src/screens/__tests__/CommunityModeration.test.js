/**
 * CommunityModerationScreen (blueprint sections 3, 6; SD-11; product
 * review 2026-09-06, items 19 and 22).
 *
 * What this suite pins:
 *  - the actions sheet CAPTURES the "why". `moderate()` was always called
 *    with a null note while `CommunityRulesScreen` promised every action
 *    is recorded "including who did it and why", so the promise could
 *    never be true;
 *  - an empty note is sent as null, never as a blank string;
 *  - the Actioned tab is named as the audit view it is, and it renders a
 *    moderator handle and a note when the queue returns them;
 *  - the queue is still moderator-only.
 */

import { create, act } from 'react-test-renderer';

const mockToastShow = jest.fn();

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../store/useAppStore', () => ({
  __esModule: true,
  default: (sel) => sel({ user: { id: 'u1' }, accessibility: { reduceMotion: true } }),
}));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('../../components/BackHeader', () => () => null);
jest.mock('../../components/Toast', () => ({ useToast: () => ({ show: mockToastShow }) }));
jest.mock('../../lib/haptics', () => ({ selection: jest.fn(), commit: jest.fn() }));

jest.mock('../../hooks/useCommunityMe', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('../../lib/community', () => ({
  moderationQueue: jest.fn(),
  moderate: jest.fn(() => Promise.resolve({ ok: true })),
  MODERATION_ACTIONS: jest.requireActual('../../lib/community/moderation').MODERATION_ACTIONS,
  REPORT_REASONS: jest.requireActual('../../lib/community/validation').REPORT_REASONS,
}));

import { moderationQueue, moderate } from '../../lib/community';
import useCommunityMe from '../../hooks/useCommunityMe';
import CommunityModerationScreen, { MODERATION_NOTE_MAX } from '../CommunityModerationScreen';

// The shape `community_moderation_queue` actually returns
// (supabase/migrate_160_community.sql): id, target_kind, target_id,
// target_owner_id, reason, detail, status, priority, created_at, content.
const REPORT = {
  id: 'r1',
  target_kind: 'comment',
  target_id: 'c1',
  target_owner_id: 'u9',
  reason: 'harassment',
  detail: 'Told someone to eat less.',
  status: 'open',
  priority: true,
  created_at: Date.now(),
  content: { body: 'Told someone to eat less.', status: 'visible' },
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
  let tree = null;
  await act(async () => { tree = create(<CommunityModerationScreen />); });
  await flush();
  return tree;
}

/** The RN manual mock renders FlashList as a passthrough FlatList host, so
 * a row is read by rendering `renderItem` for real. */
function row(tree, item) {
  const list = tree.root.findAll((n) => n.type === 'FlatList')[0];
  let rendered = null;
  act(() => { rendered = create(list.props.renderItem({ item })); });
  return rendered;
}

function field(tree, label) {
  return tree.root.findAll((n) => n.props?.accessibilityLabel === label && n.props?.onChangeText)[0];
}

function action(tree, label) {
  return tree.root.findAll(
    (n) => typeof n.type === 'function' && n.props?.accessibilityLabel === label && 'onPress' in n.props,
  )[0];
}

beforeEach(() => {
  jest.clearAllMocks();
  useCommunityMe.mockReturnValue({
    me: { profile: { user_id: 'u1', handle: 'mod' }, is_moderator: true },
    loading: false,
    error: null,
    refresh: jest.fn(),
  });
  moderationQueue.mockResolvedValue({ reports: [REPORT], cursor: null });
});

async function openSheet(tree) {
  const card = row(tree, REPORT);
  const pressable = card.root.findAll((n) => n.props?.onPress && n.props?.accessibilityLabel)[0];
  await act(async () => { pressable.props.onPress(); });
  act(() => { card.unmount(); });
}

describe('the note for the record', () => {
  test('travels with the action', async () => {
    const tree = await mount();
    await openSheet(tree);

    await act(async () => { field(tree, 'Note for the record').props.onChangeText('Repeat offender.'); });
    await act(async () => { action(tree, 'Hide the content').props.onPress(); });
    await flush();

    expect(moderate).toHaveBeenCalledWith('r1', 'hide_content', 'Repeat offender.');
    act(() => { tree.unmount(); });
  });

  test('an empty note is null, never a blank string', async () => {
    const tree = await mount();
    await openSheet(tree);

    await act(async () => { field(tree, 'Note for the record').props.onChangeText('   '); });
    await act(async () => { action(tree, 'Dismiss the report').props.onPress(); });
    await flush();

    expect(moderate).toHaveBeenCalledWith('r1', 'dismiss', null);
    act(() => { tree.unmount(); });
  });

  test('is capped, and the sheet says the note is part of the record', async () => {
    const tree = await mount();
    await openSheet(tree);

    expect(field(tree, 'Note for the record').props.maxLength).toBe(MODERATION_NOTE_MAX);
    expect(MODERATION_NOTE_MAX).toBe(300);
    expect(texts(tree))
      .toContain('Every action is recorded with who did it, when, and the note you leave here.');
    act(() => { tree.unmount(); });
  });
});

describe('the Actioned tab is the audit view', () => {
  test('it is named as one', async () => {
    const tree = await mount();
    expect(texts(tree)).toContain('Actioned (audit log)');
    act(() => { tree.unmount(); });
  });

  test('a row renders the moderator and the note when the queue returns them', async () => {
    const tree = await mount();
    const card = row(tree, {
      ...REPORT,
      status: 'actioned',
      resolution: 'hide_content',
      moderator_handle: 'mod',
      note: 'Repeat offender.',
    });

    const text = texts(card);
    expect(text).toContain('Resolution: Hide the content');
    expect(text).toContain('by @mod');
    expect(text).toContain('Note: Repeat offender.');
    act(() => { card.unmount(); tree.unmount(); });
  });

  test('a row with neither invents neither', async () => {
    const tree = await mount();
    const card = row(tree, { ...REPORT, status: 'actioned' });

    expect(texts(card)).not.toContain('by @');
    expect(texts(card)).not.toContain('Note:');
    act(() => { card.unmount(); tree.unmount(); });
  });
});

describe('the guard', () => {
  test('a non-moderator sees a calm note and no queue', async () => {
    useCommunityMe.mockReturnValue({
      me: { profile: { user_id: 'u2', handle: 'rowan' }, is_moderator: false },
      loading: false,
      error: null,
      refresh: jest.fn(),
    });

    const tree = await mount();

    expect(texts(tree)).toContain('The moderator queue is only open to moderators.');
    expect(moderationQueue).not.toHaveBeenCalled();
    act(() => { tree.unmount(); });
  });
});
