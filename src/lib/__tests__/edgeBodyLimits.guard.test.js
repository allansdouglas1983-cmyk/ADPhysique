const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../../supabase/functions');
const read = (name) => fs.readFileSync(path.join(ROOT, name, 'index.ts'), 'utf8');

describe('changed Edge functions enforce actual streamed body limits', () => {
  test.each([
    ['partner-cheer', '4096'],
    ['app-store-verify', '64 * 1024'],
    ['play-billing-rtdn', '1024 * 1024'],
    ['app-store-notifications', '128 * 1024'],
    // community-notify takes a three-field body and nothing else, so it gets
    // the same tight bound as partner-cheer.
    ['community-notify', '4096'],
  ])('%s uses the shared bounded reader (%s bytes)', (name, bound) => {
    const source = read(name);
    expect(source).toContain('readBoundedJson');
    expect(source).toContain(bound);
    expect(source).not.toMatch(/body\s*=\s*await req\.json\(\)/);
  });

  test('the reader counts streamed bytes and uses fatal UTF-8 decoding', () => {
    const shared = fs.readFileSync(path.join(ROOT, '_shared', 'boundedJson.ts'), 'utf8');
    expect(shared).toContain('total += value.byteLength');
    expect(shared).toContain('if (total > maxBytes)');
    expect(shared).toContain('new TextDecoder("utf-8", { fatal: true })');
  });
});
