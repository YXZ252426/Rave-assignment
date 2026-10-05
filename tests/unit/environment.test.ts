import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, expect, it } from 'vitest';
import { readBebopApiKey } from '../../src/config/environment.js';

const dir = mkdtempSync(join(tmpdir(), 'rfq-env-'));
const file = join(dir, '.env');
writeFileSync(file, 'BEBOP_API_KEY="test-file-key"\nIGNORED=unused\n');
afterAll(() => rmSync(dir, { recursive: true, force: true }));
it('reads the optional key without changing environment variables', async () => {
  const env = {};
  expect(await readBebopApiKey(env, file)).toBe('test-file-key');
  expect(env).toEqual({});
});
it('gives the process environment precedence, including explicit anonymous mode', async () => {
  expect(await readBebopApiKey({ BEBOP_API_KEY: 'test-env-key' }, file)).toBe(
    'test-env-key',
  );
  expect(await readBebopApiKey({ BEBOP_API_KEY: '' }, file)).toBeUndefined();
});
it('allows a missing .env file', async () => {
  expect(await readBebopApiKey({}, join(dir, 'missing'))).toBeUndefined();
});
