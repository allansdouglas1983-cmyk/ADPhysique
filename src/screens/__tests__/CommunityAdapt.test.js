/**
 * CommunityAdaptScreen (social-discovery blueprint sections 5.4, 6 and 13,
 * `docs/social-discovery-2026-09-06/30-BLUEPRINT.md`; SD-09).
 *
 * What this suite pins:
 *  - every proposed change carries the RIGHT reason in the blueprint's own
 *    words. A swap with no reason, or the wrong one, is a plan the athlete
 *    cannot check;
 *  - a change with no substitute reads as KEPT, not as a removal;
 *  - the days-mismatch notice appears when the counts differ, and names the
 *    thing the athlete would actually do about it;
 *  - the CLASS 1 state: when the recipient's limitations could not be read,
 *    the screen offers NO Save at all and says why. An unreadable capability
 *    state is not "no restrictions", and a Save button there would write a
 *    plan nobody checked;
 *  - Save applies the adaptation, records the use and lands on the new plan.
 */
import { create, act } from 'react-test-renderer';

const mockToastShow = jest.fn();
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

jest.mock('../../lib/community', () => ({
  getCommunityProgramme: jest.fn(),
  recordProgrammeUse: jest.fn(() => Promise.resolve({})),
  notifyCommunityEvent: jest.fn(),
  loadAdaptationContext: jest.fn(() => Promise.resolve({})),
  planAdaptation: jest.fn(),
  applyAdaptation: jest.fn(),
  ADAPT_REASON: jest.requireActual('../../lib/community/adapt').ADAPT_REASON,
  snapshotStats: jest.requireActual('../../lib/community/snapshot').snapshotStats,
}));

import {
  getCommunityProgramme, recordProgrammeUse, notifyCommunityEvent,
  planAdaptation, applyAdaptation, ADAPT_REASON,
} from '../../lib/community';
import CommunityAdaptScreen, {
  reasonLine, summaryLine, daysMismatchLine, CAPABILITY_UNREADABLE_LINE,
} from '../CommunityAdaptScreen';

const SNAPSHOT = {
  v: 1, title: 'Full-body circuit, dumbbells', days_per_week: 3,
  days: [{
    name: 'Full body A',
    position: 0,
    exercises: [
      { exercise_id: 'e1', exercise_name: 'Dumbbell overhead press', order: 0, sets: 3, reps_min: 8, reps_max: 12 },
      { exercise_id: 'e2', exercise_name: 'Romanian deadlift', order: 1, sets: 3, reps_min: 8, reps_max: 10 },
      { exercise_id: 'e3', exercise_name: 'Floor press', order: 2, sets: 3, reps_min: 8, reps_max: 12 },
      { exercise_id: 'e4', exercise_name: 'Zercher good morning', order: 3, sets: 3, reps_min: 8, reps_max: 12 },
      { exercise_id: 'e5', exercise_name: 'Goblet squat', order: 4, sets: 3, reps_min: 8, reps_max: 12 },
    ],
  }],
};

const PROGRAMME = {
  id: 'prog1', owner_id: 'u2', title: 'Full-body circuit, dumbbells',
  days_per_week: 3, exercise_count: 5, snapshot: SNAPSHOT,
};

const RESULT = {
  changes: [
    {
      day: 0, order: 0, from: { id: 'e1', name: 'Dumbbell overhead press' },
      fromName: 'Dumbbell overhead press', to: { id: 'x1', name: 'Band overhead press' },
      reason: ADAPT_REASON.EQUIPMENT, kept: false,
    },
    {
      day: 0, order: 1, from: { id: 'e2', name: 'Romanian deadlift' },
      fromName: 'Romanian deadlift', to: { id: 'x2', name: 'Single-leg hip hinge' },
      reason: ADAPT_REASON.EXCLUDED, kept: false,
    },
    {
      day: 0, order: 2, from: { id: 'e3', name: 'Floor press' },
      fromName: 'Floor press', to: { id: 'x3', name: 'Push-up' },
      reason: ADAPT_REASON.LIMITATION, kept: false,
    },
    {
      day: 0, order: 3, from: { id: 'e4', name: 'Zercher good morning' },
      fromName: 'Zercher good morning', to: null,
      reason: ADAPT_REASON.EQUIPMENT, kept: true,
    },
    {
      day: 0, order: 4, from: null, fromName: 'Sandbag carry', to: null,
      reason: ADAPT_REASON.UNKNOWN_EXERCISE, kept: true,
    },
  ],
  substitutions: 3,
  kept: 2,
  daysMismatch: null,
  capabilityChecked: true,
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
      <CommunityAdaptScreen
        navigation={{ navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn() }}
        route={{ params: { id: 'prog1' }, name: 'CommunityAdapt' }}
      />,
    );
  });
  await flush();
  return tree;
}

beforeEach(() => {
  jest.clearAllMocks();
  getCommunityProgramme.mockResolvedValue({ programme: PROGRAMME, creator: null });
  planAdaptation.mockReturnValue(RESULT);
  applyAdaptation.mockResolvedValue({ plan: { id: 'plan-new' }, applied: 3, kept: 2, unresolved: [] });
});

describe('the reason on every change', () => {
  test('each reason has its own plain sentence', () => {
    expect(reasonLine({ reason: ADAPT_REASON.EQUIPMENT, to: { id: 'x' } })).toBe('Not in your equipment');
    expect(reasonLine({ reason: ADAPT_REASON.EXCLUDED, to: { id: 'x' } })).toBe('Excluded by you');
    expect(reasonLine({ reason: ADAPT_REASON.LIMITATION, to: { id: 'x' } })).toBe('Clashes with a limitation');
    expect(reasonLine({ reason: ADAPT_REASON.EQUIPMENT, to: null, kept: true }))
      .toBe('No alternative in this style, kept');
    expect(reasonLine({ reason: ADAPT_REASON.UNKNOWN_EXERCISE, to: null, kept: true }))
      .toBe('Not in your exercise library, kept');
  });

  test('the screen renders all five, with the from and to names', async () => {
    const tree = await mount();
    const text = texts(tree);
    expect(text).toContain('Dumbbell overhead press');
    expect(text).toContain('Band overhead press');
    expect(text).toContain('Not in your equipment');
    expect(text).toContain('Excluded by you');
    expect(text).toContain('Clashes with a limitation');
    expect(text).toContain('No alternative in this style, kept');
    expect(text).toContain('Not in your exercise library, kept');
    act(() => { tree.unmount(); });
  });

  test('a change with no substitute names the movement once, as kept', async () => {
    const tree = await mount();
    const text = texts(tree);
    expect(text).toContain('Sandbag carry');
    expect(text.match(/Sandbag carry/g)).toHaveLength(1);
    act(() => { tree.unmount(); });
  });

  test('the summary counts what was kept, swapped and kept with a note', async () => {
    const tree = await mount();
    // 5 exercises: 3 swapped, 2 kept with a note, so nothing was untouched.
    expect(texts(tree)).toContain(summaryLine({ total: 5, substitutions: 3, kept: 2 }));
    expect(summaryLine({ total: 11, substitutions: 2, kept: 0 })).toBe('9 exercises kept, 2 swapped');
    act(() => { tree.unmount(); });
  });
});

describe('the days-mismatch notice', () => {
  test('is absent when the counts agree', async () => {
    const tree = await mount();
    expect(texts(tree)).not.toContain('days a week');
    act(() => { tree.unmount(); });
  });

  test('names dropping a day when the programme runs more days than the athlete', async () => {
    planAdaptation.mockReturnValue({ ...RESULT, daysMismatch: { snapshot: 4, yours: 3 } });
    const tree = await mount();
    expect(texts(tree)).toContain(
      'This programme is 4 days a week. Your setup says 3. '
      + "Volyume keeps the creator's structure; you can drop a day in the plan editor.",
    );
    act(() => { tree.unmount(); });
  });

  test('names adding a day when the athlete trains more days than the programme', () => {
    expect(daysMismatchLine({ snapshot: 3, yours: 4 })).toContain('you can add a day in the plan editor.');
    expect(daysMismatchLine(null)).toBeNull();
  });
});

describe('when the limitations could not be read (CLASS 1)', () => {
  test('there is no Save, and the screen says what happened', async () => {
    planAdaptation.mockReturnValue({
      changes: [], substitutions: 0, kept: 0, daysMismatch: null, capabilityChecked: false,
    });
    const tree = await mount();
    const text = texts(tree);
    expect(text).toContain(CAPABILITY_UNREADABLE_LINE);
    expect(buttons(tree).some((b) => b.title === 'Save to my plans')).toBe(false);
    act(() => { tree.unmount(); });
  });

  test('it is never presented as "nothing needed changing"', async () => {
    planAdaptation.mockReturnValue({
      changes: [], substitutions: 0, kept: 0, daysMismatch: null, capabilityChecked: false,
    });
    const tree = await mount();
    expect(texts(tree)).not.toContain('Nothing needed changing');
    act(() => { tree.unmount(); });
  });
});

describe('Save to my plans', () => {
  test('is the one emphatic action, and says the original is untouched', async () => {
    const tree = await mount();
    const save = buttons(tree).find((b) => b.title === 'Save to my plans');
    expect(save.variant).toBe('emphatic');
    expect(texts(tree)).toContain('The original programme is not changed.');
    act(() => { tree.unmount(); });
  });

  test('applies the changes, records the use, tells the creator and opens the plan', async () => {
    const tree = await mount();
    const save = buttons(tree).find((b) => b.title === 'Save to my plans');
    await act(async () => { await save.onPress(); });
    await flush();
    expect(applyAdaptation).toHaveBeenCalledWith('u1', SNAPSHOT, RESULT.changes, {
      communityId: 'prog1', capabilityChecked: true,
    });
    expect(recordProgrammeUse).toHaveBeenCalledWith('prog1', 'adapt');
    expect(notifyCommunityEvent).toHaveBeenCalledWith('programme_used', 'u2', 'prog1');
    expect(mockNavigateCrossTab).toHaveBeenCalledWith(
      expect.anything(), 'PlansTab', 'PlanDetail', { planId: 'plan-new' },
    );
    act(() => { tree.unmount(); });
  });

  test('a failed save is a calm toast and no navigation', async () => {
    applyAdaptation.mockRejectedValue(new Error('nope'));
    const tree = await mount();
    const save = buttons(tree).find((b) => b.title === 'Save to my plans');
    await act(async () => { await save.onPress(); });
    await flush();
    expect(mockToastShow).toHaveBeenCalledWith('That did not save. Please try again.', { variant: 'error' });
    expect(mockNavigateCrossTab).not.toHaveBeenCalled();
    act(() => { tree.unmount(); });
  });
});
