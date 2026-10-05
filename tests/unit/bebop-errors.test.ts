import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { BebopClient } from '../../src/clients/bebop-client.js';
import { requestFor } from '../helpers/bebop.js';

const captured = JSON.parse(
  readFileSync('docs/evidence/g3-provider-error.json', 'utf8'),
) as { body: unknown };
describe('observed Bebop errors', () => {
  it('classifies the captured HTTP 200 minimum-size rejection without retry', async () => {
    const fetch = vi.fn(async () => Response.json(captured.body));
    await expect(
      new BebopClient({ fetch }).getQuote(requestFor()),
    ).rejects.toMatchObject({
      code: 'NO_QUOTE',
      field: 'amountIn',
      retryable: false,
      attempts: 1,
    });
    expect(fetch).toHaveBeenCalledOnce();
  });
  it.each([
    { error: { errorCode: 999, message: 'secret' } },
    { error: { errorCode: 104, message: 'unknown variant' } },
    { status: 'UNKNOWN' },
  ])('does not infer a meaning from unverified errors', async (body) => {
    const fetch = vi.fn(async () => Response.json(body));
    const pending = new BebopClient({ fetch }).getQuote(requestFor());
    await expect(pending).rejects.toMatchObject({
      code: 'UPSTREAM_FAILURE',
      attempts: 1,
      retryable: false,
    });
    await expect(pending).rejects.not.toThrow('secret');
    expect(fetch).toHaveBeenCalledOnce();
  });
});
