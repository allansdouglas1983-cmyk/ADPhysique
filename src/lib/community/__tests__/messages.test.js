/**
 * What this suite pins (discovery blueprint section 2; SD-21, SD-31,
 * SD-32):
 *
 *  - the 1 to 1,000 character body, cleaned through the same keyword
 *    filter as every other free-text field, refused HERE before a doomed
 *    round trip. A private conversation is the one Community surface with
 *    no audience to report it, so the filter runs on the way in;
 *  - the composer placeholder is a PROMPT and never a draft. Nothing is
 *    pre-written and nothing is sent on a person's behalf (SD-21), so the
 *    only thing the surface contributes is the placeholder word;
 *  - one context reference at most, and only a COMPLETE one. A kind
 *    without an id renders as a broken tile above a real message, so a
 *    half reference is dropped rather than sent;
 *  - the list RPCs answer wrapper objects and the cursor carried onward
 *    is the server's own opaque string, the same contract as every other
 *    Community list;
 *  - the refusals that make messaging safe (`not_connected`,
 *    `minor_restricted`) arrive as codes. Nothing here can grant either:
 *    the connection IS the consent gate, and it lives on the server.
 */

jest.mock('../transport', () => {
  class CommunityError extends Error {
    constructor(code) { super(code); this.name = 'CommunityError'; this.code = code; }
  }
  return { callCommunity: jest.fn(async () => ({})), CommunityError };
});

const { callCommunity } = require('../transport');
const {
  listConversations, listMessages, sendMessage, markRead, deleteMessage,
  placeholderFor, MESSAGE_MAX, MESSAGE_REF_KINDS,
} = require('../messages');

beforeEach(() => {
  jest.clearAllMocks();
  callCommunity.mockResolvedValue({});
});

describe('the composer placeholder is a prompt, never a draft', () => {
  test('opened from a programme', () => {
    expect(placeholderFor({ kind: 'programme' })).toBe('Ask about this programme');
    expect(placeholderFor('programme')).toBe('Ask about this programme');
  });

  test('opened from a training story', () => {
    expect(placeholderFor({ kind: 'post' })).toBe('Say something about this session');
    expect(placeholderFor({ ref_kind: 'post', ref_id: 'p1' })).toBe('Say something about this session');
  });

  test('opened from nowhere in particular', () => {
    expect(placeholderFor(null)).toBe('Write a message');
    expect(placeholderFor({})).toBe('Write a message');
    expect(placeholderFor({ kind: 'workout' })).toBe('Write a message');
  });
});

describe('sending', () => {
  test('the RPC takes the blueprint parameter names', async () => {
    callCommunity.mockResolvedValue({ conversation_id: 'c1', message: { id: 'm1' } });
    const out = await sendMessage('u2', 'How are you finding week three?');
    expect(callCommunity).toHaveBeenCalledWith('community_send_message', {
      _target: 'u2',
      _body: 'How are you finding week three?',
      _ref_kind: null,
      _ref_id: null,
    });
    expect(out).toEqual({ conversation_id: 'c1', message: { id: 'm1' } });
  });

  test('a context reference travels as a kind and an id together', async () => {
    await sendMessage('u2', 'Is this one four days a week?', { refKind: 'programme', refId: 'g1' });
    expect(callCommunity.mock.calls[0][1]).toMatchObject({ _ref_kind: 'programme', _ref_id: 'g1' });
  });

  test('a kind with no id is dropped rather than sent as half a tile', async () => {
    await sendMessage('u2', 'Nice session.', { refKind: 'post', refId: null });
    expect(callCommunity.mock.calls[0][1]).toMatchObject({ _ref_kind: null, _ref_id: null });
  });

  test('an unknown reference kind is dropped, id and all', async () => {
    await sendMessage('u2', 'Nice session.', { refKind: 'workout', refId: 'w1' });
    expect(callCommunity.mock.calls[0][1]).toMatchObject({ _ref_kind: null, _ref_id: null });
    expect(MESSAGE_REF_KINDS).toEqual(['programme', 'post']);
  });

  test('an empty body never leaves the device', async () => {
    await expect(sendMessage('u2', '   ')).rejects.toMatchObject({ code: 'invalid_input' });
    expect(callCommunity).not.toHaveBeenCalled();
  });

  test('a body over a thousand characters is refused before the round trip', async () => {
    expect(MESSAGE_MAX).toBe(1000);
    await expect(sendMessage('u2', 'x'.repeat(MESSAGE_MAX + 1)))
      .rejects.toMatchObject({ code: 'invalid_input' });
    expect(callCommunity).not.toHaveBeenCalled();
  });

  test('exactly a thousand characters is allowed', async () => {
    await sendMessage('u2', 'x'.repeat(MESSAGE_MAX));
    expect(callCommunity).toHaveBeenCalled();
  });

  test('the keyword filter runs on the way in', async () => {
    await expect(sendMessage('u2', 'send me thinspo'))
      .rejects.toMatchObject({ code: 'content_not_allowed' });
    expect(callCommunity).not.toHaveBeenCalled();
  });

  test('no target is invalid input, not a send into nowhere', async () => {
    await expect(sendMessage(null, 'hello')).rejects.toMatchObject({ code: 'invalid_input' });
  });

  test('a send to someone not connected arrives as a code the screen maps', async () => {
    callCommunity.mockRejectedValue(Object.assign(new Error('not_connected'), { code: 'not_connected' }));
    await expect(sendMessage('u2', 'hello')).rejects.toMatchObject({ code: 'not_connected' });
  });

  test('a send from or to a minor arrives as its own code', async () => {
    callCommunity.mockRejectedValue(Object.assign(new Error('minor_restricted'), { code: 'minor_restricted' }));
    await expect(sendMessage('u2', 'hello')).rejects.toMatchObject({ code: 'minor_restricted' });
  });

  test('a response of the wrong shape leaves nulls behind, never undefined', async () => {
    callCommunity.mockResolvedValue(null);
    expect(await sendMessage('u2', 'hello')).toEqual({ conversation_id: null, message: null });
  });
});

describe('the two lists', () => {
  test('conversations answer rows and the server cursor', async () => {
    callCommunity.mockResolvedValue({ conversations: [{ id: 'c1' }], cursor: 'ts|uuid' });
    const page = await listConversations({ limit: 5 });
    expect(page).toEqual({ conversations: [{ id: 'c1' }], cursor: 'ts|uuid' });
    expect(callCommunity).toHaveBeenCalledWith('community_conversations', { _cursor: null, _limit: 5 });
  });

  test('messages answer rows and the server cursor', async () => {
    callCommunity.mockResolvedValue({ messages: [{ id: 'm1' }], cursor: 'ts|uuid' });
    const page = await listMessages('c1', { cursor: 'prev', limit: 20 });
    expect(page.messages).toEqual([{ id: 'm1' }]);
    expect(callCommunity).toHaveBeenCalledWith('community_messages', {
      _conversation_id: 'c1', _cursor: 'prev', _limit: 20,
    });
  });

  test('a wrapper of the wrong shape leaves arrays behind', async () => {
    callCommunity.mockResolvedValue({ conversations: 'nope', cursor: 7 });
    expect(await listConversations()).toEqual({ conversations: [], cursor: null });
  });

  test('a list with no conversation id is refused before the network', async () => {
    await expect(listMessages(null)).rejects.toMatchObject({ code: 'invalid_input' });
    expect(callCommunity).not.toHaveBeenCalled();
  });
});

describe('reading and deleting', () => {
  test('marking read takes the conversation id', async () => {
    await markRead('c1');
    expect(callCommunity).toHaveBeenCalledWith('community_mark_conversation_read', { _conversation_id: 'c1' });
  });

  test('deleting takes the message id', async () => {
    await deleteMessage('m1');
    expect(callCommunity).toHaveBeenCalledWith('community_delete_message', { _id: 'm1' });
  });

  test('both refuse an empty id', async () => {
    await expect(markRead('')).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(deleteMessage(null)).rejects.toMatchObject({ code: 'invalid_input' });
    expect(callCommunity).not.toHaveBeenCalled();
  });
});
