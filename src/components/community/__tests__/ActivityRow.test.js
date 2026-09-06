/**
 * ActivityRow (blueprint sections 3, 6; SD-15; product review 2026-09-06,
 * item 27).
 *
 * What this suite pins: a follow-request row is a PLAIN line that opens
 * the profile. It used to render its own Accept and Decline, which
 * nothing ever wired up (`CommunityActivityScreen` passes no `onRespond`
 * and filters those rows out of the list), so the buttons were two dead
 * taps on the one row whose whole point is deciding. Deciding lives in
 * the "Follow requests" section at the top of that screen.
 */

import { create, act } from 'react-test-renderer';

jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('../../../lib/haptics', () => ({ selection: jest.fn(), commit: jest.fn() }));
jest.mock('../../../store/useAppStore', () => ({
  __esModule: true,
  default: (sel) => sel({ user: { id: 'u1' }, accessibility: { reduceMotion: true } }),
}));

import ActivityRow, { activityLine } from '../ActivityRow';

const ACTOR = { user_id: 'u2', handle: 'priya_kb', display_name: 'Priya K', avatar_preset: null };

function item(over = {}) {
  return {
    id: 'a1',
    kind: 'follow_request',
    actor: ACTOR,
    target_kind: null,
    target_id: null,
    preview: null,
    created_at: Date.now(),
    seen: false,
    ...over,
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

function render(props) {
  let tree = null;
  act(() => { tree = create(<ActivityRow {...props} />); });
  return tree;
}

describe('a follow-request row', () => {
  test('says what happened and carries no Accept or Decline', () => {
    const tree = render({ item: item(), onPress: jest.fn() });
    const text = texts(tree);

    expect(text).toContain('@priya_kb asked to follow you');
    expect(text).not.toContain('Accept');
    expect(text).not.toContain('Decline');
    act(() => { tree.unmount(); });
  });

  test('is pressable like every other kind, and opens what it is about', () => {
    const onPress = jest.fn();
    const tree = render({ item: item(), onPress });

    const card = tree.root.findAll((n) => n.props?.onPress && n.props?.accessibilityLabel)[0];
    act(() => { card.props.onPress(); });

    expect(onPress).toHaveBeenCalledTimes(1);
    act(() => { tree.unmount(); });
  });
});

describe('the other kinds are unchanged', () => {
  test.each([
    ['follow', 'followed you'],
    ['reaction', 'gave your post respect'],
    ['comment', 'commented on your post'],
    ['programme_used', 'is using your programme'],
  ])('%s reads "%s"', (kind, line) => {
    expect(activityLine(item({ kind }))).toBe(`@priya_kb ${line}`);
  });

  test('an unknown kind never renders a raw enum', () => {
    expect(activityLine(item({ kind: 'something_new' })))
      .toBe('@priya_kb did something in Community');
  });
});
