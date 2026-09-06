/**
 * PostCard (social-discovery blueprint section 6,
 * `docs/social-discovery-2026-09-06/30-BLUEPRINT.md`; SD-04, SD-06).
 *
 * What this suite pins:
 *  - every story kind renders its own body (a kind that silently rendered
 *    nothing would ship a blank card, and a blank card looks like a bug in
 *    the person's training rather than in ours);
 *  - the card reads ONLY the allow-listed payload keys for its kind, so a
 *    payload that somehow carried bodyweight, body fat, kcal or a coaching
 *    line could not put any of it on screen. The behavioural half of the
 *    privacy rule the source guard covers statically;
 *  - the reaction is "Respect" with a count and a thumbs-up glyph, and the
 *    comment glyph is a chat bubble (lead visual review 2026-09-06,
 *    ruling 3: no hearts).
 */
import { create, act } from 'react-test-renderer';

jest.mock('../../../store/useAppStore', () => ({
  __esModule: true,
  default: (sel) => sel({ accessibility: { reduceMotion: true } }),
}));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

import PostCard, { bodyForKind, postDayLabel } from '../PostCard';

const AUTHOR = {
  user_id: 'u2', handle: 'rowan_lifts', display_name: 'Rowan M', avatar_preset: null,
};

function render(post, props = {}) {
  let tree = null;
  act(() => {
    tree = create(<PostCard post={post} author={AUTHOR} {...props} />);
  });
  return tree;
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

function icons(tree) {
  return tree.root.findAll((n) => n.props && typeof n.props.name === 'string' && n.props.size)
    .map((n) => n.props.name);
}

const POSTS = {
  pr: {
    id: 'p1', kind: 'pr', reaction_count: 3, comment_count: 1, created_at: Date.now(),
    payload: {
      exerciseName: 'Bench press', weight: 85, reps: 5, units: 'kg',
      previousBest: 82.5, date: Date.now(),
    },
  },
  session: {
    id: 'p2', kind: 'session', reaction_count: 0, comment_count: 0, created_at: Date.now(),
    payload: {
      sessionName: 'Upper A', workingSets: 18, duration: 55, tonnage: 5400,
      exerciseCount: 6, exercises: ['Bench press'], prCount: 1, topSet: null,
      intensityTier: 'solid', units: 'kg', planName: 'Push Pull Legs', date: Date.now(),
    },
  },
  block: {
    id: 'p3', kind: 'block', reaction_count: 5, comment_count: 2, created_at: Date.now(),
    payload: {
      planName: 'Kettlebell Foundations', weeks: 6, sessions: 17, sessionsPerWeek: 2.8,
      completedAt: Date.now(), lifts: [{ exerciseName: 'Goblet squat', deltaKg: 4, units: 'kg' }],
    },
  },
  milestone: {
    id: 'p4', kind: 'milestone', reaction_count: 0, comment_count: 0, created_at: Date.now(),
    payload: {
      eyebrow: 'One year in', title: 'A year of lifts', heroValue: '104',
      heroUnit: 'sessions', caption: 'Two years next.', stats: [],
    },
  },
  programme: {
    id: 'p5', kind: 'programme', reaction_count: 0, comment_count: 0, created_at: Date.now(),
    payload: {
      id: 'prog1', title: 'Three days, no machines', style_key: 'strength',
      days_per_week: 3, exercise_count: 12,
    },
  },
};

describe('every story kind renders a body', () => {
  test.each(Object.keys(POSTS))('%s', (kind) => {
    const tree = render(POSTS[kind]);
    const body = bodyForKind(POSTS[kind]);
    expect(body.eyebrow).toBeTruthy();
    expect(body.hero).toBeTruthy();
    const text = texts(tree);
    expect(text).toContain(body.eyebrow);
    expect(text).toContain(body.hero);
    act(() => { tree.unmount(); });
  });

  test('the PR card carries the lift, the reps and the previous best', () => {
    const tree = render(POSTS.pr);
    const text = texts(tree);
    expect(text).toContain('Bench press');
    expect(text).toContain('85 kg x 5');
    expect(text).toContain('Previous best 82.5 kg');
    act(() => { tree.unmount(); });
  });

  test('an unknown kind renders the author and the actions, never a broken body', () => {
    const tree = render({ id: 'px', kind: 'nonsense', payload: {}, reaction_count: 0, comment_count: 0 });
    const text = texts(tree);
    expect(text).toContain('Rowan M');
    expect(text).toContain('Respect 0');
    act(() => { tree.unmount(); });
  });
});

describe('nothing personal can reach a card', () => {
  // Every kind, handed a payload stuffed with the things Community must
  // never carry. The renderer names its fields one by one, so none of these
  // has a path onto the screen.
  const POISON = {
    bodyweight: 78.4,
    body_weight: 78.4,
    weightKg: 78.4,
    bodyFat: 14.2,
    kcal: 2450,
    protein_g: 180,
    firstName: 'Rowan',
    dateOfBirth: '1990-01-01',
    edPatternFlag: true,
    coachVerdict: 'Hold calories',
    progressScan: { chest: 137.7 },
    notes: 'Private note',
  };

  test.each(Object.keys(POSTS))('%s renders none of it', (kind) => {
    const post = { ...POSTS[kind], payload: { ...POSTS[kind].payload, ...POISON } };
    const tree = render(post);
    const text = texts(tree);
    for (const value of ['78.4', '14.2', '2450', '180', '1990-01-01', 'Hold calories', '137.7', 'Private note']) {
      expect(text).not.toContain(value);
    }
    // "Rowan M" is the author's display name and is meant to be there; the
    // first name from the poisoned payload must not add a second one.
    expect(text.match(/Rowan/g)).toHaveLength(1);
    act(() => { tree.unmount(); });
  });
});

describe('the reaction row (lead visual review ruling 3)', () => {
  test('Respect carries the count and an outline thumbs-up when off', () => {
    const tree = render(POSTS.pr, { myReaction: false });
    expect(texts(tree)).toContain('Respect 3');
    expect(icons(tree)).toContain('thumbs-up-outline');
    expect(icons(tree)).toContain('chatbubble-outline');
    expect(icons(tree)).not.toContain('heart');
    expect(icons(tree)).not.toContain('heart-outline');
    act(() => { tree.unmount(); });
  });

  test('the glyph fills when the viewer has already reacted', () => {
    const tree = render(POSTS.pr, { myReaction: true });
    expect(icons(tree)).toContain('thumbs-up');
    act(() => { tree.unmount(); });
  });

  test('tapping Respect reports the NEXT state, not the current one', () => {
    const onReact = jest.fn();
    const tree = render(POSTS.pr, { myReaction: false, onReact });
    const button = tree.root.findAll(
      (n) => n.props?.accessibilityLabel === 'Respect this' && typeof n.props.onPress === 'function',
    )[0];
    act(() => { button.props.onPress(); });
    expect(onReact).toHaveBeenCalledWith(true);
    act(() => { tree.unmount(); });
  });
});

describe('postDayLabel', () => {
  test('today, yesterday and this week read as plain words', () => {
    const day = 24 * 60 * 60 * 1000;
    expect(postDayLabel(Date.now())).toBe('Today');
    expect(postDayLabel(Date.now() - day)).toBe('Yesterday');
    expect(postDayLabel(Date.now() - 3 * day)).toBe('3 days ago');
  });

  test('a missing or unreadable date is nothing at all, never "Invalid Date"', () => {
    expect(postDayLabel(null)).toBe('');
    expect(postDayLabel('not a date')).toBe('');
  });
});
