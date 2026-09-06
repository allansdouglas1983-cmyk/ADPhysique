/**
 * What this suite pins (discovery blueprint sections 4, 5, 7, 8, 9;
 * SD-23, SD-24, SD-27, SD-28):
 *
 *  - the six doors exist, in order, and a door that cannot work yet says
 *    what would make it work rather than disappearing. SD-28: a door that
 *    hides itself when the network is small is a door nobody can be the
 *    first through, and the honest zero state is the whole density
 *    strategy;
 *  - a count of null is "not read yet", not zero. Rendering "· 0" before
 *    the read lands would tell somebody they are alone when nothing has
 *    been counted;
 *  - `community_find_people` is called with the mode, a cursor and a
 *    limit ONLY. There is no key parameter, deliberately: a client that
 *    could name a gym could list its members without listing itself
 *    (blueprint section 11);
 *  - every row carries its reasons, and the score is transport. SD-24:
 *    no surface turns a score into a percentage, so what the module hands
 *    a screen is the reasons array and an integer that only orders.
 */

jest.mock('../transport', () => {
  class CommunityError extends Error {
    constructor(code) { super(code); this.name = 'CommunityError'; this.code = code; }
  }
  return { callCommunity: jest.fn(async () => ({})), CommunityError };
});

const { callCommunity } = require('../transport');
const {
  FIND_MODES, FIND_MODE_ORDER, doorsFor, doorLine, doorZeroState,
  findPeople, programmePeople, gymSummary, gymSuggest,
} = require('../findPeople');

const ME_FULL = {
  profile: { handle: 'jamie', gym_label: 'PureGym Leeds', area_label: 'Leeds' },
  tp_programme_key: 'community:prog-9',
};

const ME_BARE = { profile: { handle: 'jamie' } };

beforeEach(() => {
  jest.clearAllMocks();
  callCommunity.mockResolvedValue({});
});

describe('the six doors', () => {
  test('they are the six the blueprint names, in the blueprint order', () => {
    expect(FIND_MODE_ORDER).toEqual([
      'gym', 'area', 'like_me', 'programme', 'partners', 'might_know',
    ]);
    expect(doorsFor(ME_FULL).map((d) => d.mode)).toEqual(FIND_MODE_ORDER);
  });

  test('the labels read as the blueprint writes them', () => {
    expect(FIND_MODES.gym.label).toBe('At my gym');
    expect(FIND_MODES.area.label).toBe('Near me');
    expect(FIND_MODES.like_me.label).toBe('Train like me');
    expect(FIND_MODES.programme.label).toBe('On my programme');
    expect(FIND_MODES.partners.label).toBe('Open to training together');
    expect(FIND_MODES.might_know.label).toBe('People you might know');
  });

  test('a profile with everything opens every door', () => {
    for (const door of doorsFor(ME_FULL)) {
      expect({ mode: door.mode, available: door.available })
        .toEqual({ mode: door.mode, available: true });
      expect(door.requirement).toBeNull();
    }
  });

  test('a profile with no gym still SHOWS the door, and says what it needs', () => {
    const gym = doorsFor(ME_BARE).find((d) => d.mode === 'gym');
    expect(gym.available).toBe(false);
    expect(gym.requirement).toBe('Add your gym to see who trains there');
    expect(doorLine(gym)).toBe('Add your gym to see who trains there');
  });

  test('the area and programme doors follow the same pattern', () => {
    const doors = doorsFor(ME_BARE);
    expect(doors.find((d) => d.mode === 'area').requirement)
      .toBe('Add your area to see who trains near you');
    expect(doors.find((d) => d.mode === 'programme').requirement)
      .toBe('Set an active plan to see who else is on it');
  });

  test('the three doors that need nothing are open the moment a profile exists', () => {
    const doors = doorsFor(ME_BARE);
    for (const mode of ['like_me', 'partners', 'might_know']) {
      expect({ mode, available: doors.find((d) => d.mode === mode).available })
        .toEqual({ mode, available: true });
    }
  });

  test('an available door carries the key its count is about', () => {
    const doors = doorsFor(ME_FULL);
    expect(doors.find((d) => d.mode === 'gym').key).toBe('PureGym Leeds');
    expect(doors.find((d) => d.mode === 'area').key).toBe('Leeds');
  });
});

describe('the count line is honest about what it knows', () => {
  const doors = doorsFor(ME_FULL);
  const door = (mode) => doors.find((d) => d.mode === mode);

  test('a gym with six others reads as the blueprint writes it', () => {
    expect(doorLine(door('gym'), 6)).toBe('Trains at PureGym Leeds · 6 others');
  });

  test('one other is not "1 others"', () => {
    expect(doorLine(door('gym'), 1)).toBe('Trains at PureGym Leeds · 1 other');
  });

  test('an area count reads as the blueprint writes it', () => {
    expect(doorLine(door('area'), 12)).toBe('Lifters in Leeds · 12');
  });

  test('a count of zero is stated, not hidden', () => {
    expect(doorLine(door('gym'), 0)).toBe('Trains at PureGym Leeds · 0 others');
  });

  test('a count not read yet shows the plain subtitle, never a zero', () => {
    expect(doorLine(door('gym'))).toBe(FIND_MODES.gym.subtitle);
    expect(doorLine(door('area'), null)).toBe(FIND_MODES.area.subtitle);
  });

  test('the partner door counts people, not places', () => {
    expect(doorLine(door('partners'), 3)).toBe('3 in your area');
  });
});

describe('the zero states never pretend', () => {
  test('the gym zero state is the blueprint sentence', () => {
    const gym = doorsFor(ME_FULL).find((d) => d.mode === 'gym');
    expect(doorZeroState(gym)).toBe(
      'No one else lists PureGym Leeds yet. You are the first here; anyone who adds it will see you.',
    );
  });

  test('a door that is not available says its requirement instead', () => {
    const gym = doorsFor(ME_BARE).find((d) => d.mode === 'gym');
    expect(doorZeroState(gym)).toBe('Add your gym to see who trains there');
  });

  test('every zero state offers the one thing that changes it', () => {
    for (const door of doorsFor(ME_FULL)) {
      expect({ mode: door.mode, empty: doorZeroState(door) === '' })
        .toEqual({ mode: door.mode, empty: false });
    }
  });
});

describe('the scored list', () => {
  test('the RPC takes the mode, a cursor and a limit, and no key', async () => {
    await findPeople('gym', { cursor: 'c0', limit: 20, key: 'PureGym Leeds' });
    expect(callCommunity).toHaveBeenCalledWith('community_find_people', {
      _mode: 'gym', _cursor: 'c0', _limit: 20,
    });
    const [, params] = callCommunity.mock.calls[0];
    expect('_key' in params).toBe(false);
  });

  test('every row keeps its reasons, and the score only orders', async () => {
    callCommunity.mockResolvedValue({
      people: [
        { card: { handle: 'jamie' }, reasons: ['Trains at PureGym Leeds', 'Similar experience'], score: 4 },
        { card: { handle: 'sam' }, reasons: ['Lists Leeds'], score: 2 },
      ],
      cursor: 'ts|uuid',
      count: 6,
    });
    const page = await findPeople('gym');
    expect(page.people[0].reasons).toEqual(['Trains at PureGym Leeds', 'Similar experience']);
    expect(page.people[0].score).toBe(4);
    expect(page.cursor).toBe('ts|uuid');
    expect(page.count).toBe(6);
  });

  test('a row with no reasons is an empty array, never undefined', async () => {
    callCommunity.mockResolvedValue({ people: [{ card: { handle: 'sam' } }] });
    const page = await findPeople('like_me');
    expect(page.people[0].reasons).toEqual([]);
    expect(page.people[0].score).toBe(0);
  });

  test('an unread count is null, not zero', async () => {
    callCommunity.mockResolvedValue({ people: [] });
    expect((await findPeople('like_me')).count).toBeNull();
  });

  test('an unknown mode is refused before the network', async () => {
    await expect(findPeople('nearby_now')).rejects.toMatchObject({ code: 'invalid_input' });
    expect(callCommunity).not.toHaveBeenCalled();
  });

  test('every mode the doors offer is a mode the list accepts', async () => {
    for (const mode of FIND_MODE_ORDER) {
      // eslint-disable-next-line no-await-in-loop
      await findPeople(mode);
    }
    expect(callCommunity.mock.calls.map(([, p]) => p._mode)).toEqual(FIND_MODE_ORDER);
  });
});

describe('the programme and gym surfaces', () => {
  test('people on a programme come back with the server cursor', async () => {
    callCommunity.mockResolvedValue({ people: [{ handle: 'jamie' }], cursor: 'ts|uuid', count: 4 });
    const page = await programmePeople('prog-9', { limit: 10 });
    expect(callCommunity).toHaveBeenCalledWith('community_programme_people', {
      _id: 'prog-9', _cursor: null, _limit: 10,
    });
    expect(page.count).toBe(4);
  });

  test('the gym summary counts and never says who is there now', async () => {
    callCommunity.mockResolvedValue({
      label: 'PureGym Leeds',
      count: 6,
      following_count: 2,
      open_to_partner_count: 1,
      by_style: [{ key: 'strength', count: 3 }],
      by_time_band: [{ band: 'evening', count: 6 }],
    });
    const summary = await gymSummary('puregym-leeds');
    expect(callCommunity).toHaveBeenCalledWith('community_gym_summary', { _key: 'puregym-leeds' });
    expect(summary.count).toBe(6);
    expect(summary.by_time_band).toEqual([{ band: 'evening', count: 6 }]);
    expect('last_active_at' in summary).toBe(false);
    expect('present_now' in summary).toBe(false);
  });

  test('a summary of the wrong shape leaves zeroes and arrays behind', async () => {
    callCommunity.mockResolvedValue(null);
    expect(await gymSummary('k')).toEqual({
      label: null, count: 0, following_count: 0, open_to_partner_count: 0,
      by_style: [], by_time_band: [],
    });
  });

  test('the gym typeahead asks for nothing until there is something to match', async () => {
    expect(await gymSuggest('leeds', '  ')).toEqual([]);
    expect(await gymSuggest(null, 'pure')).toEqual([]);
    expect(callCommunity).not.toHaveBeenCalled();
  });

  test('the typeahead answers labels already used in the same area', async () => {
    callCommunity.mockResolvedValue({ gyms: [{ label: 'PureGym Leeds', count: 6 }] });
    const out = await gymSuggest('leeds', 'pure');
    expect(callCommunity).toHaveBeenCalledWith('community_gym_suggest', {
      _area_key: 'leeds', _prefix: 'pure',
    });
    expect(out).toEqual([{ label: 'PureGym Leeds', count: 6 }]);
  });

  test('a bare string list still resolves to labels', async () => {
    callCommunity.mockResolvedValue(['PureGym Leeds', null]);
    expect(await gymSuggest('leeds', 'pure')).toEqual([{ label: 'PureGym Leeds', count: 0 }]);
  });

  test('an empty programme or gym id is refused before the network', async () => {
    await expect(programmePeople(null)).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(gymSummary('')).rejects.toMatchObject({ code: 'invalid_input' });
  });
});
