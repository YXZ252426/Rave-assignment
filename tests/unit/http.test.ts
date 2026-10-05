import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  JsonHttpClient,
  parseRetryAfter,
  type FetchLike,
  type HttpOptions,
} from '../../src/clients/http.js';
import { ExplorerError } from '../../src/domain/errors.js';

const NOW = Date.parse('2026-10-05T04:00:00Z');
const URL = new globalThis.URL('https://api.bebop.xyz/pmm/base/v3/quote');
const parse = (body: unknown) => body;
afterEach(() => vi.useRealTimers());
function harness(fetch: FetchLike, options: HttpOptions = {}) {
  let elapsed = 0;
  const sleep = vi.fn(async (ms: number) => {
    elapsed += ms;
  });
  const client = new JsonHttpClient({
    fetch,
    sleep,
    now: () => NOW + elapsed,
    elapsedNow: () => elapsed,
    random: () => 0,
    ...options,
  });
  return { client, sleep };
}

describe('Retry-After', () => {
  it.each([
    ['2', 2000],
    [' 0 ', 0],
    ['Mon, 05 Oct 2026 04:00:03 GMT', 3000],
    ['Mon, 05 Oct 2026 03:59:59 GMT', 0],
    ['999999999999999999999999', Number.MAX_SAFE_INTEGER],
    [null, undefined],
    ['', undefined],
    ['-1', undefined],
    ['1.5', undefined],
    ['1e3', undefined],
    ['tomorrow', undefined],
  ])('parses %j as %j', (value, expected) => {
    expect(parseRetryAfter(value, NOW)).toBe(expected);
  });
});

describe('bounded GET retries', () => {
  it.each(['2', 'Mon, 05 Oct 2026 04:00:02 GMT'])(
    'honors Retry-After %s before retrying',
    async (header) => {
      const fetch = vi
        .fn<FetchLike>()
        .mockResolvedValueOnce(
          new Response('', { status: 429, headers: { 'Retry-After': header } }),
        )
        .mockResolvedValueOnce(Response.json({ ok: true }));
      const { client, sleep } = harness(fetch);
      expect(await client.get(URL, { parse })).toEqual({ ok: true });
      expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([2000]);
      expect(fetch).toHaveBeenCalledTimes(2);
    },
  );

  it('stops at three total attempts with bounded exponential jitter', async () => {
    const fetch = vi.fn(async () => new Response('', { status: 503 }));
    const { client, sleep } = harness(fetch);
    await expect(client.get(URL, { parse })).rejects.toMatchObject({
      code: 'UPSTREAM_FAILURE',
      httpStatus: 503,
      attempts: 3,
      retryable: true,
    });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([125, 250]);
  });

  it.each([408, 500, 502, 503, 504])(
    'retries transient HTTP %i',
    async (status) => {
      const fetch = vi
        .fn<FetchLike>()
        .mockResolvedValueOnce(new Response('', { status }))
        .mockResolvedValueOnce(Response.json({ ok: true }));
      await harness(fetch).client.get(URL, { parse });
      expect(fetch).toHaveBeenCalledTimes(2);
    },
  );

  it.each([400, 401, 403, 404, 422, 501])(
    'does not retry HTTP %i',
    async (status) => {
      const fetch = vi.fn(
        async () => new Response('untrusted-body', { status }),
      );
      const { client, sleep } = harness(fetch);
      const promise = client.get(URL, { parse });
      await expect(promise).rejects.toMatchObject({
        attempts: 1,
        retryable: false,
      });
      await expect(promise).rejects.not.toThrow('untrusted-body');
      expect(fetch).toHaveBeenCalledOnce();
      expect(sleep).not.toHaveBeenCalled();
    },
  );

  it('returns guidance when Retry-After exceeds the remaining budget', async () => {
    const fetch = vi.fn(
      async () =>
        new Response('', { status: 429, headers: { 'Retry-After': '60' } }),
    );
    const { client, sleep } = harness(fetch);
    await expect(client.get(URL, { parse })).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      retryAfterMs: 60000,
      attempts: 1,
    });
    expect(sleep).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('never truncates an enormous Retry-After into an early retry', async () => {
    const fetch = vi.fn(
      async () =>
        new Response('', {
          status: 503,
          headers: { 'Retry-After': '999999999999999999999999' },
        }),
    );
    const { client, sleep } = harness(fetch);
    await expect(client.get(URL, { parse })).rejects.toMatchObject({
      retryAfterMs: Number.MAX_SAFE_INTEGER,
      attempts: 1,
    });
    expect(sleep).not.toHaveBeenCalled();
  });

  it('uses backoff for malformed Retry-After', async () => {
    const fetch = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(
        new Response('', { status: 429, headers: { 'Retry-After': 'bad' } }),
      )
      .mockResolvedValueOnce(Response.json({ ok: true }));
    const { client, sleep } = harness(fetch, { random: () => 1 });
    await client.get(URL, { parse });
    expect(sleep.mock.calls[0]?.[0]).toBe(250);
  });

  it('does not start another attempt when backoff consumes the budget', async () => {
    const fetch = vi.fn(async () => new Response('', { status: 503 }));
    const { client, sleep } = harness(fetch, { totalTimeoutMs: 100 });
    await expect(client.get(URL, { parse })).rejects.toMatchObject({
      attempts: 1,
    });
    expect(sleep).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('retries a connection reset without exposing its exception text', async () => {
    const fetch = vi
      .fn<FetchLike>()
      .mockRejectedValueOnce(
        new TypeError('secret', { cause: { code: 'ECONNRESET' } }),
      )
      .mockResolvedValueOnce(Response.json({ ok: true }));
    expect(await harness(fetch).client.get(URL, { parse })).toEqual({
      ok: true,
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('does not retry a certificate failure', async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError('secret', { cause: { code: 'CERT_HAS_EXPIRED' } });
    });
    await expect(
      harness(fetch).client.get(URL, { parse }),
    ).rejects.toMatchObject({ retryable: false, attempts: 1 });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('never retries invalid successful JSON or a response mismatch', async () => {
    const fetch = vi.fn(async () => new Response('<html>no</html>'));
    await expect(
      harness(fetch).client.get(URL, { parse }),
    ).rejects.toMatchObject({ code: 'INVALID_UPSTREAM_RESPONSE', attempts: 1 });
    expect(fetch).toHaveBeenCalledOnce();
    const validFetch = vi.fn(async () => Response.json({ ok: true }));
    await expect(
      harness(validFetch).client.get(URL, {
        parse: () => {
          throw new ExplorerError('INVALID_UPSTREAM_RESPONSE', 'Mismatch');
        },
      }),
    ).rejects.toMatchObject({ attempts: 1 });
    expect(validFetch).toHaveBeenCalledOnce();
  });
});

describe('deadlines, cancellation, and cleanup', () => {
  it('enforces the total deadline even when fetch ignores abort', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn<FetchLike>(() => new Promise(() => {}));
    const client = new JsonHttpClient({
      fetch,
      timeoutMs: 1000,
      totalTimeoutMs: 100,
      elapsedNow: () => Date.now(),
    });
    const assertion = expect(client.get(URL, { parse })).rejects.toMatchObject({
      code: 'UPSTREAM_TIMEOUT',
      attempts: 1,
    });
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
    expect(fetch).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('retries an attempt timeout within the total budget', async () => {
    vi.useFakeTimers();
    const fetch = vi
      .fn<FetchLike>()
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockResolvedValueOnce(Response.json({ ok: true }));
    const client = new JsonHttpClient({
      fetch,
      timeoutMs: 50,
      totalTimeoutMs: 500,
      random: () => 0,
      elapsedNow: () => Date.now(),
    });
    const pending = client.get(URL, { parse });
    await vi.advanceTimersByTimeAsync(175);
    expect(await pending).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels a stalled body reader at the deadline', async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const fetch = vi.fn(
      async () =>
        new Response(
          new ReadableStream({
            start(c) {
              c.enqueue(new TextEncoder().encode('{'));
            },
            cancel,
          }),
        ),
    );
    const client = new JsonHttpClient({ fetch, timeoutMs: 100, maxRetries: 0 });
    const assertion = expect(client.get(URL, { parse })).rejects.toMatchObject({
      code: 'UPSTREAM_TIMEOUT',
      attempts: 1,
    });
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
    expect(cancel).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('refuses an already cancelled request without networking', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetch = vi.fn<FetchLike>();
    await expect(
      harness(fetch).client.get(URL, { parse, signal: controller.signal }),
    ).rejects.toMatchObject({ code: 'REQUEST_CANCELLED', attempts: 0 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('cancels during backoff and clears both timers', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const fetch = vi.fn(async () => new Response('', { status: 429 }));
    const client = new JsonHttpClient({ fetch, random: () => 0 });
    const assertion = expect(
      client.get(URL, { parse, signal: controller.signal }),
    ).rejects.toMatchObject({ code: 'REQUEST_CANCELLED', attempts: 1 });
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await assertion;
    expect(fetch).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('enforces the total budget during an injected stalled delay', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(async () => new Response('', { status: 503 }));
    const client = new JsonHttpClient({
      fetch,
      totalTimeoutMs: 500,
      sleep: () => new Promise(() => {}),
    });
    const assertion = expect(client.get(URL, { parse })).rejects.toMatchObject({
      code: 'UPSTREAM_TIMEOUT',
      attempts: 1,
    });
    await vi.advanceTimersByTimeAsync(500);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('bounded response reading', () => {
  it('rejects oversized content-length before reading the stream', async () => {
    const cancel = vi.fn();
    const fetch = async () =>
      new Response(new ReadableStream({ cancel }), {
        headers: { 'content-length': '100' },
      });
    await expect(
      harness(fetch, { maxResponseBytes: 10 }).client.get(URL, { parse }),
    ).rejects.toMatchObject({ code: 'INVALID_UPSTREAM_RESPONSE' });
    expect(cancel).toHaveBeenCalledOnce();
  });
  it('counts actual bytes even when content-length is absent or false', async () => {
    const fetch = async () =>
      new Response('"中文"', { headers: { 'content-length': '1' } });
    await expect(
      harness(fetch, { maxResponseBytes: 5 }).client.get(URL, { parse }),
    ).rejects.toMatchObject({ code: 'INVALID_UPSTREAM_RESPONSE' });
    expect(
      await harness(fetch, { maxResponseBytes: 8 }).client.get(URL, { parse }),
    ).toBe('中文');
  });
});
