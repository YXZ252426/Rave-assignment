import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  LiFiClient,
  parseSupportedChains,
} from '../../src/clients/lifi-client.js';
import { renderChains } from '../../src/presentation/text.js';
import { NOW } from '../helpers/bebop.js';

const fixture = JSON.parse(
  readFileSync('tests/fixtures/lifi/supported-chains.json', 'utf8'),
) as Record<string, unknown>[];

describe('LI.FI chain discovery', () => {
  it('uses the public endpoint and distinguishes catalog IDs from chain IDs', async () => {
    const fetch = vi.fn(async (url: URL, init: RequestInit) => {
      expect(url.href).toBe('https://order.li.fi/chains/supported');
      expect(init.method).toBe('GET');
      expect(new Headers(init.headers).has('Authorization')).toBe(false);
      return Response.json(fixture);
    });
    const report = await new LiFiClient({
      fetch,
      now: () => NOW,
      provenance: 'mock',
    }).getSupportedChains();
    expect(fetch).toHaveBeenCalledOnce();
    expect(report).toMatchObject({
      provider: 'lifi',
      provenance: 'mock',
      retrievedAt: new Date(NOW).toISOString(),
    });
    expect(report.chains[1]).toMatchObject({
      catalogId: 2,
      chainId: '8453',
      supportedByExplorer: true,
    });
    expect(
      report.chains
        .filter((row) => row.supportedByExplorer)
        .map((row) => row.chainId),
    ).toEqual(['1', '8453']);
    expect(report.chains[3]).toMatchObject({
      chainId: '1151111081099710',
      chainType: 'SVM',
      supportedByExplorer: false,
    });
    expect(report.note).toContain('does not establish Bebop');
  });

  it('preserves unfamiliar chains and extra fields without expanding the local allowlist', () => {
    const rows = parseSupportedChains([
      {
        id: 4,
        chainId: '90071992547409931234',
        name: 'Future EVM',
        chainType: 'EVM',
        extra: true,
      },
      { id: 5, chainId: '8453', name: 'Other namespace', chainType: 'OTHER' },
    ]);
    expect(rows.map((row) => row.supportedByExplorer)).toEqual([false, false]);
    expect(rows[0]!.chainId).toBe('90071992547409931234');
    expect(parseSupportedChains([])).toEqual([]);
  });

  it.each(
    [
      null,
      {},
      { chains: fixture },
      [{ ...fixture[0], chainId: 1 }],
      [{ ...fixture[0], chainId: '01' }],
      [{ ...fixture[0], chainId: '1\n' }],
      [{ ...fixture[0], name: '' }],
      [{ ...fixture[0], id: 1.2 }],
      [fixture[0], fixture[0]],
      [fixture[0], { ...fixture[1], id: 1 }],
      [fixture[0], { ...fixture[0], id: 99 }],
    ].map((body) => ({ body })),
  )('rejects a malformed or ambiguous catalog %#', ({ body }) => {
    expect(() => parseSupportedChains(body)).toThrow(
      expect.objectContaining({ code: 'INVALID_UPSTREAM_RESPONSE' }),
    );
  });

  it('reuses bounded HTTP errors without exposing response bodies', async () => {
    const fetch = vi.fn(
      async () =>
        new Response('sensitive body', {
          status: 429,
          headers: { 'Retry-After': '60' },
        }),
    );
    await expect(
      new LiFiClient({ fetch }).getSupportedChains(),
    ).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      retryAfterMs: 60000,
      attempts: 1,
    });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('honors cancellation before networking', async () => {
    const fetch = vi.fn();
    await expect(
      new LiFiClient({ fetch }).getSupportedChains(AbortSignal.abort()),
    ).rejects.toMatchObject({ code: 'REQUEST_CANCELLED' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sanitizes terminal control characters from chain names', async () => {
    const report = await new LiFiClient({
      fetch: async () =>
        Response.json([{ ...fixture[0], name: 'Name\n\u001b[2J' }]),
      provenance: 'mock',
    }).getSupportedChains();
    expect(renderChains(report)).not.toContain('\u001b');
    expect(renderChains(report)).toContain('(MOCK)');
    expect(renderChains(report)).toContain('1 | Name');
  });
});
