import { afterEach, describe, expect, it, vi } from 'vitest';
import { BebopClient, buildQuoteUrl } from '../../src/clients/bebop-client.js';
import { NOW, fixtureFor, requestFor } from '../helpers/bebop.js';

afterEach(() => vi.useRealTimers());
describe('Bebop client', () => {
  it.each(['ethereum', 'base'] as const)(
    'maps an exact-input %s request and parses the response',
    async (network) => {
      const request = requestFor(network);
      const fetch = vi.fn(async () => Response.json(fixtureFor(network)));
      const quote = await new BebopClient({
        fetch,
        now: () => NOW,
        provenance: 'mock',
      }).getQuote(request);
      expect(fetch).toHaveBeenCalledOnce();
      const [url, init] = fetch.mock.calls[0] as unknown as [URL, RequestInit];
      expect(url.origin).toBe('https://api.bebop.xyz');
      expect(url.pathname).toBe(`/pmm/${network}/v3/quote`);
      expect(Object.fromEntries(url.searchParams)).toEqual({
        sell_tokens: request.sellToken.address,
        buy_tokens: request.buyToken.address,
        sell_amounts: request.sellAmountBaseUnits,
        taker_address: request.takerAddress,
        receiver_address: request.receiverAddress,
        approval_type: 'Standard',
      });
      expect(init.method).toBe('GET');
      expect(init.redirect).toBe('error');
      expect(new Headers(init.headers).has('Authorization')).toBe(false);
      expect(quote.provenance).toBe('mock');
      expect(quote.sellAmountBaseUnits).toBe(request.sellAmountBaseUnits);
      expect(quote.buyAmountBaseUnits).toBe('40000000000000000');
      expect(quote.retrievedAt).toBe(new Date(NOW).toISOString());
    },
  );

  it('sends and validates a receiver distinct from the taker', async () => {
    const receiver = '0x1111111111111111111111111111111111111111' as const;
    const request = { ...requestFor(), receiverAddress: receiver };
    const fetch = vi.fn(async (url: URL) => {
      expect(url.searchParams.get('receiver_address')).toBe(receiver);
      return Response.json({ ...fixtureFor(), receiver });
    });
    const quote = await new BebopClient({ fetch, provenance: 'mock' }).getQuote(
      request,
    );
    expect(quote.receiverAddress).toBe(receiver);
    expect(quote.takerAddress).toBe(request.takerAddress);
  });

  it('keeps the key only in the Bearer header', async () => {
    const fetch = vi.fn(async (_url: URL, init: RequestInit) => {
      expect(new Headers(init.headers).get('Authorization')).toBe(
        'Bearer test-only-key',
      );
      return Response.json(fixtureFor());
    });
    const quote = await new BebopClient({
      fetch,
      apiKey: 'test-only-key',
    }).getQuote(requestFor());
    expect(buildQuoteUrl(requestFor()).href).not.toContain('test-only-key');
    expect(JSON.stringify(quote)).not.toContain('test-only-key');
  });

  it.each([
    [401, 'UPSTREAM_AUTH_ERROR'],
    [403, 'UPSTREAM_ACCESS_DENIED'],
    [429, 'RATE_LIMITED'],
    [500, 'UPSTREAM_FAILURE'],
  ] as const)('reports HTTP %i with no retry', async (status, code) => {
    const fetch = vi.fn(
      async () => new Response('<html>secret-reflection</html>', { status }),
    );
    const pending = new BebopClient({ fetch, maxRetries: 0 }).getQuote(
      requestFor(),
    );
    await expect(pending).rejects.toMatchObject({ code, httpStatus: status });
    await expect(pending).rejects.not.toThrow('secret-reflection');
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('aborts a stalled request and clears its deadline timer', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(
      (_url: URL, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener(
            'abort',
            () => reject(new Error('aborted')),
            { once: true },
          );
        }),
    );
    const promise = new BebopClient({
      fetch,
      timeoutMs: 100,
      maxRetries: 0,
    }).getQuote(requestFor());
    const assertion = expect(promise).rejects.toMatchObject({
      code: 'UPSTREAM_TIMEOUT',
    });
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('includes body reading in the deadline', async () => {
    vi.useFakeTimers();
    const fetch = async (_url: URL, init: RequestInit) =>
      new Response(
        new ReadableStream({
          start(controller) {
            init.signal?.addEventListener(
              'abort',
              () => controller.error(new Error('aborted')),
              { once: true },
            );
          },
        }),
      );
    const promise = new BebopClient({
      fetch,
      timeoutMs: 100,
      maxRetries: 0,
    }).getQuote(requestFor());
    const assertion = expect(promise).rejects.toMatchObject({
      code: 'UPSTREAM_TIMEOUT',
    });
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears its timer on success', async () => {
    vi.useFakeTimers();
    await new BebopClient({
      fetch: async () => Response.json(fixtureFor()),
    }).getQuote(requestFor());
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['<html>blocked</html>', '{bad json'])(
    'rejects non-JSON successful responses',
    async (body) => {
      await expect(
        new BebopClient({ fetch: async () => new Response(body) }).getQuote(
          requestFor(),
        ),
      ).rejects.toMatchObject({ code: 'INVALID_UPSTREAM_RESPONSE' });
    },
  );

  it('does not expose transport exception contents', async () => {
    const pending = new BebopClient({
      fetch: async () => {
        throw new Error('secret-key');
      },
    }).getQuote(requestFor());
    await expect(pending).rejects.toMatchObject({ code: 'UPSTREAM_FAILURE' });
    await expect(pending).rejects.not.toThrow('secret-key');
  });

  it.each([{ error: { message: 'failure' } }, { status: 'FAILURE' }])(
    'rejects provider errors inside HTTP 200',
    async (body) => {
      await expect(
        new BebopClient({ fetch: async () => Response.json(body) }).getQuote(
          requestFor(),
        ),
      ).rejects.toMatchObject({ code: 'UPSTREAM_FAILURE' });
    },
  );
});
