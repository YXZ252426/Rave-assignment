import { describe, expect, it, vi } from 'vitest';
import { runCli } from '../../src/cli-app.js';
import { BebopClient } from '../../src/clients/bebop-client.js';
import { QuoteService } from '../../src/services/quote-service.js';
import { NOW, fixtureFor, intentFor } from '../helpers/bebop.js';

describe('quote CLI through real client with mocked HTTP', () => {
  it.each(['ethereum', 'base'] as const)(
    'runs the full %s intent-to-quote path',
    async (network) => {
      const stdout = vi.fn();
      const stderr = vi.fn();
      const fetch = vi.fn(async () => Response.json(fixtureFor(network)));
      const provider = new BebopClient({
        fetch,
        now: () => NOW,
        provenance: 'mock',
      });
      const exit = await runCli(
        ['quote', '--intent', `examples/${network}-usdc-weth.json`, '--json'],
        { stdout, stderr, provider, now: () => NOW },
      );
      expect(exit).toBe(0);
      expect(stderr).not.toHaveBeenCalled();
      const report = JSON.parse(stdout.mock.calls[0]![0]);
      expect(report.provenance).toBe('mock');
      expect(report.network).toBe(network);
      expect(report.transaction.target).toBe(
        '0x3333333333333333333333333333333333333333',
      );
      expect(report.hasCalldata).toBe(true);
      expect(fetch).toHaveBeenCalledOnce();
    },
  );

  it('uses the same pipeline for human output', async () => {
    const stdout = vi.fn();
    const provider = new BebopClient({
      fetch: async () => Response.json(fixtureFor()),
      provenance: 'mock',
    });
    expect(
      await runCli(['quote', '--intent', 'examples/ethereum-usdc-weth.json'], {
        stdout,
        provider,
        now: () => NOW,
      }),
    ).toBe(0);
    expect(stdout.mock.calls[0]![0]).toContain('Bebop RFQ quote (MOCK)');
  });

  it('rejects bad input without calling the provider', async () => {
    const provider = { getQuote: vi.fn() };
    const stderr = vi.fn();
    expect(
      await runCli(['quote', '--intent', 'missing-intent.json', '--json'], {
        provider,
        stderr,
      }),
    ).toBe(2);
    expect(provider.getQuote).not.toHaveBeenCalled();
  });

  it('rejects a cross-chain intent before calling the provider', async () => {
    const provider = { getQuote: vi.fn() };
    await expect(
      new QuoteService(provider).quote({ ...intentFor(), toChain: 8453 }),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_ROUTE' });
    expect(provider.getQuote).not.toHaveBeenCalled();
  });

  it('reports a real client failure without mock fallback', async () => {
    const stdout = vi.fn();
    const stderr = vi.fn();
    const provider = new BebopClient({
      fetch: async () => new Response('blocked', { status: 403 }),
    });
    const exit = await runCli(
      ['quote', '--intent', 'examples/base-usdc-weth.json', '--json'],
      { stdout, stderr, provider },
    );
    expect(exit).toBe(1);
    expect(stdout).not.toHaveBeenCalled();
    expect(JSON.parse(stderr.mock.calls[0]![0]).error).toMatchObject({
      code: 'UPSTREAM_ACCESS_DENIED',
      httpStatus: 403,
    });
  });
});
