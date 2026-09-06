/**
 * What this suite pins (discovery blueprint section 1; SD-20, SD-25,
 * SD-32):
 *
 *  - the connect state machine. A profile card's `connection` is the only
 *    thing that decides which button a person sees, and an ABSENT or
 *    unknown value reads as 'none'. The failure this pins is the other
 *    direction: a stale card defaulting to 'connected' would offer
 *    Message on a tie that does not exist, and every message behind it
 *    would be refused server-side with nothing on screen explaining why;
 *  - the four reasons, in the exact wording the request sheet and the
 *    recipient's activity row both show. The recipient reads these words
 *    to decide whether to accept, so they are a contract, not a label;
 *  - at most two reasons and a 120 character note, cleaned through the
 *    same keyword filter as every other free-text field. A note is the
 *    only free text in a connection request, which makes it the one place
 *    a request could carry something unpleasant;
 *  - partner preferences are CLOSED SETS only (SD-25, SD-31). Free text
 *    or a precise time in a preference would be a way round the band
 *    rule the whole training profile is built on;
 *  - every RPC is called with the underscore-prefixed parameter names
 *    from blueprint section 11. PostgREST names arguments; a wrong key is
 *    "function does not exist" on a real device.
 */

jest.mock('../transport', () => {
  class CommunityError extends Error {
    constructor(code) { super(code); this.name = 'CommunityError'; this.code = code; }
  }
  return { callCommunity: jest.fn(async () => ({})), CommunityError };
});

const { callCommunity } = require('../transport');
const {
  connect, respondToConnect, withdrawConnect, removeConnection, listConnections,
  setConnectFrom, setShowProgrammes, setPartner,
  connectionState, cleanReasons, cleanPartnerPrefs,
  CONNECT_REASONS, CONNECT_NOTE_MAX, CONNECT_FROM_VALUES, CONNECT_BUTTON_LABELS,
  MAX_CONNECT_REASONS,
} = require('../connections');

beforeEach(() => {
  jest.clearAllMocks();
  callCommunity.mockResolvedValue({});
});

describe('the state machine behind the Connect button', () => {
  test.each([
    ['none', 'Connect'],
    ['requested_by_me', 'Requested'],
    ['requested_by_them', 'Respond'],
    ['connected', 'Connected'],
  ])('%s shows "%s"', (state, label) => {
    expect(connectionState({ connection: state })).toBe(state);
    expect(CONNECT_BUTTON_LABELS[state]).toBe(label);
  });

  test('a card with no connection field reads as none, never as connected', () => {
    expect(connectionState({ handle: 'jamie' })).toBe('none');
    expect(connectionState(null)).toBe('none');
    expect(connectionState(undefined)).toBe('none');
  });

  test('an unknown state reads as none rather than being passed through', () => {
    expect(connectionState({ connection: 'pending' })).toBe('none');
    expect(connectionState({ connection: true })).toBe('none');
  });

  test('a row that wraps its card is read the same way', () => {
    expect(connectionState({ card: { connection: 'connected' } })).toBe('connected');
  });
});

describe('the reasons a request may carry', () => {
  test('the four reasons read exactly as the blueprint writes them', () => {
    expect(CONNECT_REASONS).toEqual({
      same_gym: 'Same gym',
      same_programme: 'Same programme',
      train_like_me: 'You train like me',
      train_together: 'Want to train together?',
    });
  });

  test('at most two, in the order they were chosen', () => {
    expect(cleanReasons(['same_gym', 'same_programme', 'train_like_me']))
      .toEqual(['same_gym', 'same_programme']);
    expect(MAX_CONNECT_REASONS).toBe(2);
  });

  test('an unknown reason is dropped, not sent on for the server to refuse', () => {
    expect(cleanReasons(['same_gym', 'because_i_said_so'])).toEqual(['same_gym']);
    expect(cleanReasons('same_gym')).toEqual([]);
    expect(cleanReasons(null)).toEqual([]);
  });

  test('a duplicate reason is counted once', () => {
    expect(cleanReasons(['same_gym', 'same_gym', 'train_together']))
      .toEqual(['same_gym', 'train_together']);
  });
});

describe('sending a request', () => {
  test('the RPC takes the blueprint parameter names', async () => {
    await connect('u2', { reasons: ['same_gym'], note: 'We both train Tuesdays.' });
    expect(callCommunity).toHaveBeenCalledWith('community_connect', {
      _target: 'u2', _reasons: ['same_gym'], _note: 'We both train Tuesdays.',
    });
  });

  test('no note is a null note, never an empty string', async () => {
    await connect('u2', {});
    expect(callCommunity.mock.calls[0][1]._note).toBeNull();
  });

  test('a note over the limit is refused here rather than at the server', async () => {
    await expect(connect('u2', { note: 'x'.repeat(CONNECT_NOTE_MAX + 1) }))
      .rejects.toMatchObject({ code: 'invalid_input' });
    expect(callCommunity).not.toHaveBeenCalled();
  });

  test('a note the keyword filter refuses never leaves the device', async () => {
    await expect(connect('u2', { note: 'post more thinspo' }))
      .rejects.toMatchObject({ code: 'content_not_allowed' });
    expect(callCommunity).not.toHaveBeenCalled();
  });

  test('no target is invalid input, not a call with a null target', async () => {
    await expect(connect(null, {})).rejects.toMatchObject({ code: 'invalid_input' });
    expect(callCommunity).not.toHaveBeenCalled();
  });

  test('the server refusals arrive as codes the screen can map', async () => {
    callCommunity.mockRejectedValue(Object.assign(new Error('connect_not_allowed'), { code: 'connect_not_allowed' }));
    await expect(connect('u2', {})).rejects.toMatchObject({ code: 'connect_not_allowed' });
  });
});

describe('answering, withdrawing and removing', () => {
  test('accept and decline are the same call with a boolean', async () => {
    await respondToConnect('u2', true);
    expect(callCommunity).toHaveBeenCalledWith('community_respond_connect', {
      _requester: 'u2', _accept: true,
    });
    await respondToConnect('u2', false);
    expect(callCommunity).toHaveBeenLastCalledWith('community_respond_connect', {
      _requester: 'u2', _accept: false,
    });
  });

  test('a truthy value that is not true still sends a boolean', async () => {
    await respondToConnect('u2', 'yes');
    expect(callCommunity.mock.calls[0][1]._accept).toBe(true);
  });

  test('withdraw and remove are two different calls, not one', async () => {
    await withdrawConnect('u2');
    await removeConnection('u2');
    expect(callCommunity.mock.calls.map(([name]) => name))
      .toEqual(['community_withdraw_connect', 'community_remove_connection']);
  });

  test('each of them refuses an empty target', async () => {
    await expect(respondToConnect(null, true)).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(withdrawConnect('')).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(removeConnection(undefined)).rejects.toMatchObject({ code: 'invalid_input' });
  });
});

describe('the connections list', () => {
  test('rows and the server cursor come back unwrapped', async () => {
    callCommunity.mockResolvedValue({ people: [{ handle: 'jamie' }], cursor: 'ts|uuid' });
    const page = await listConnections('u1', { limit: 10 });
    expect(page).toEqual({ people: [{ handle: 'jamie' }], cursor: 'ts|uuid' });
    expect(callCommunity).toHaveBeenCalledWith('community_list_connections', {
      _uid: 'u1', _cursor: null, _limit: 10,
    });
  });

  test('a payload of the wrong shape leaves an array behind', async () => {
    callCommunity.mockResolvedValue(null);
    expect(await listConnections()).toEqual({ people: [], cursor: null });
  });

  test('a cursor the server did not mint is never invented', async () => {
    callCommunity.mockResolvedValue({ people: [], cursor: 12345 });
    expect((await listConnections()).cursor).toBeNull();
  });
});

describe('the three privacy controls', () => {
  test('connect_from takes one of exactly three values', async () => {
    expect(Object.keys(CONNECT_FROM_VALUES)).toEqual(['anyone', 'followers', 'nobody']);
    expect(CONNECT_FROM_VALUES.followers).toBe('People who follow me');
    await setConnectFrom('followers');
    expect(callCommunity).toHaveBeenCalledWith('community_set_connect_from', { _value: 'followers' });
  });

  test('anything else is refused before the network', async () => {
    await expect(setConnectFrom('everyone')).rejects.toMatchObject({ code: 'invalid_input' });
    expect(callCommunity).not.toHaveBeenCalled();
  });

  test('"Show which programmes I use" sends a boolean', async () => {
    await setShowProgrammes(0);
    expect(callCommunity).toHaveBeenCalledWith('community_set_show_programmes', { _value: false });
  });

  test('switching the partner flag off clears the preferences with it', async () => {
    await setPartner(false, { days: ['mon'], same_gym_only: true });
    expect(callCommunity).toHaveBeenCalledWith('community_set_partner', { _open: false, _prefs: null });
  });

  test('switching it on sends closed-set preferences only', async () => {
    await setPartner(true, {
      days: ['mon', 'not_a_day'],
      time_bands: ['evening', '19:30'],
      same_gym_only: 'yes',
      note: 'meet me by the squat rack',
    });
    expect(callCommunity).toHaveBeenCalledWith('community_set_partner', {
      _open: true,
      _prefs: { days: ['mon'], time_bands: ['evening'], same_gym_only: true },
    });
  });

  test('preferences can never carry free text or a precise time', () => {
    const cleaned = cleanPartnerPrefs({ days: ['tue'], time_bands: ['evening'], extra: 'anything' });
    expect(Object.keys(cleaned).sort()).toEqual(['days', 'same_gym_only', 'time_bands']);
    expect(cleanPartnerPrefs(null)).toBeNull();
    expect(cleanPartnerPrefs('evenings please')).toBeNull();
  });
});
