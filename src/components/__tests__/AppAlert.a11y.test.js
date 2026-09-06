/**
 * AX-3 (whole-app failure register, 2026-07-04): AppAlert, the shared dialog
 * behind every high-stakes confirmation (delete workout,
 * cancel subscription, discard changes), had no focus management and an
 * unlabelled full-screen backdrop. Screen-reader focus landed on the
 * backdrop first, announced nothing, and (because the backdrop wrapped the
 * card as a single accessible node) the title/message/buttons underneath
 * were swallowed into that same blank node instead of being individually
 * reachable.
 *
 * This suite pins:
 *   - the cancelable (default) backdrop is a labelled "Close" button, so a
 *     screen reader announces the tap-to-dismiss instead of a blank control
 *   - a non-cancelable alert's backdrop carries no role/label, since tapping
 *     it does nothing (an announced "Close" would be a dead control)
 *   - the dialog card is marked accessibilityViewIsModal (traps screen
 *     reader navigation to the dialog, matching BottomSheet.js) and
 *     accessible={false} (so it doesn't merge the title/buttons into the
 *     backdrop's single node)
 *   - the title carries accessibilityRole="header"
 *   - every button stays reachable and individually labelled (unchanged
 *     behaviour, re-pinned here so a future edit can't silently regress it
 *     alongside the a11y fix)
 */
import { create, act } from 'react-test-renderer';
import { appAlert, AppAlertHost } from '../AppAlert';

async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

async function mount() {
  let tree;
  await act(async () => { tree = create(<AppAlertHost />); });
  return tree;
}

function findByLabel(tree, label) {
  return tree.root.findAll((n) => n.props.accessibilityLabel === label
    && typeof n.props.onPress === 'function');
}

describe('AppAlert accessibility (AX-3)', () => {
  test('a cancelable alert labels the backdrop "Close" as a button', async () => {
    const tree = await mount();
    act(() => { appAlert('Delete workout?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive' },
    ]); });
    await flush();

    const closeBtn = findByLabel(tree, 'Close')[0];
    expect(closeBtn).toBeTruthy();
    expect(closeBtn.props.accessibilityRole).toBe('button');
  });

  test('a non-cancelable alert leaves the backdrop roleless and unlabelled (tap is a no-op)', async () => {
    const tree = await mount();
    act(() => { appAlert('Please wait', 'This will finish shortly.', [{ text: 'OK' }], { cancelable: false }); });
    await flush();

    expect(findByLabel(tree, 'Close')).toHaveLength(0);
  });

  test('the dialog card traps screen-reader navigation and stops swallowing its own content', async () => {
    const tree = await mount();
    act(() => { appAlert('Delete workout?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive' },
    ]); });
    await flush();

    const card = tree.root.findAll((n) => n.props.accessibilityViewIsModal === true);
    expect(card.length).toBeGreaterThan(0);
    expect(card[0].props.accessible).toBe(false);
  });

  test('the title is announced as a header and every button stays individually reachable', async () => {
    const tree = await mount();
    act(() => { appAlert('Delete workout?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive' },
    ]); });
    await flush();

    const title = tree.root.findAll((n) => n.props.children === 'Delete workout?');
    expect(title.some((n) => n.props.accessibilityRole === 'header')).toBe(true);

    expect(findByLabel(tree, 'Cancel')[0].props.accessibilityRole).toBe('button');
    expect(findByLabel(tree, 'Delete')[0].props.accessibilityRole).toBe('button');
  });

  test('tapping a button still fires its onPress and dismisses (behaviour unchanged)', async () => {
    const tree = await mount();
    const onDelete = jest.fn();
    act(() => { appAlert('Delete workout?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: onDelete },
    ]); });
    await flush();

    await act(async () => { findByLabel(tree, 'Delete')[0].props.onPress(); });
    // dismiss() defers the button's onPress via a real setTimeout(0) so the
    // close animation isn't blocked; wait past it (real timers, not faked).
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
    await flush();

    expect(onDelete).toHaveBeenCalled();
  });
});
