const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const security = require(path.join(ROOT, 'public/auth/confirm/security.js'));

describe('Universal Links migration preparation', () => {
  const nonce = 'ab'.repeat(24);

  test('AASA prepares only the known app and bounded callback paths', () => {
    const aasa = JSON.parse(fs.readFileSync(
      path.join(ROOT, 'public/.well-known/apple-app-site-association'),
      'utf8',
    ));
    expect(aasa.applinks.details).toEqual([expect.objectContaining({
      appID: 'K79JA5JUF8.app.volyume',
      // SD-16: Community's external link pages join the existing partner
      // and auth-callback paths -- profile (/u), programme (/p) and story
      // (/s), each a wildcard prefix over the query-form link.
      paths: expect.arrayContaining([
        '/partner/*', '/auth/callback', '/auth/callback/', '/u/*', '/p/*', '/s/*',
      ]),
    })]);
    expect(aasa.applinks.details[0].paths).toHaveLength(6);
  });

  test.each([
    `volyume://auth-callback?state=${nonce}`,
    `https://volyume.app/auth/callback?state=${nonce}`,
    `https://volyume.app/auth/callback/?state=${nonce}`,
    'volyume://',
  ])('email bridge accepts an exact owned callback: %s', (target) => {
    expect(security.safeCallbackTarget(target)).toBeTruthy();
  });

  test.each([
    'https://evil.example/auth/callback?state=' + nonce,
    'https://volyume.app.evil.example/auth/callback?state=' + nonce,
    'https://volyume.app/auth/callback?state=' + nonce + '&next=https://evil.example',
    'https://volyume.app/auth/callback?state=short',
    'https://volyume.app/auth/callback?state=' + nonce + '#fragment',
    'volyume://evil?state=' + nonce,
    'javascript:alert(1)',
  ])('email bridge rejects an unowned or ambiguous callback: %s', (target) => {
    expect(security.safeCallbackTarget(target)).toBeNull();
  });

  test('confirmation request rejects duplicate credentials and redirect parameters', () => {
    const base = `?token=${'cd'.repeat(24)}&type=signup&redirect_to=${encodeURIComponent(`volyume://auth-callback?state=${nonce}`)}`;
    expect(security.parseConfirmRequest(base).ok).toBe(true);
    expect(security.parseConfirmRequest(`${base}&token=${'ef'.repeat(24)}`).ok).toBe(false);
    expect(security.parseConfirmRequest(`${base}&redirect_to=volyume%3A%2F%2F`).ok).toBe(false);
    expect(security.parseConfirmRequest(base.replace('type=signup', 'type=invite')).ok).toBe(false);
  });

  test('Associated Domains remains off until the signed profile carries it', () => {
    const app = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
    expect(app.expo.ios.associatedDomains).toBeUndefined();
  });
});
