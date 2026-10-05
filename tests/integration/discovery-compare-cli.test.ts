import { describe, expect, it, vi } from 'vitest';
import { runCli } from '../../src/cli-app.js';
import { BebopClient } from '../../src/clients/bebop-client.js';
import { LiFiClient } from '../../src/clients/lifi-client.js';
import { NOW, fixtureFor } from '../helpers/bebop.js';

const compareArgs = [
  'compare',
  '--intent',
  'examples/base-usdc-weth.json',
  '--amounts',
  '100,200,300',
];
function httpQuote(url: URL) {
  const fixture = fixtureFor('base');
  return {
    ...fixture,
    sellTokens: {
      [url.searchParams.get('sell_tokens')!]: {
        amount: url.searchParams.get('sell_amounts'),
        decimals: 6,
      },
    },
  };
}

describe('discovery and comparison CLI', () => {
  it.each([false, true])(
    'discovers chains independently of Bebop or its configuration (JSON %s)',
    async (json) => {
      const stdout = vi.fn();
      const stderr = vi.fn();
      const provider = { getQuote: vi.fn() };
      const env = new Proxy(
        {},
        {
          get: () => {
            throw new Error('Bebop configuration must not be read');
          },
        },
      );
      const lifiProvider = new LiFiClient({
        fetch: async () =>
          Response.json([
            { id: 2, chainId: '8453', name: 'Base', chainType: 'EVM' },
          ]),
        provenance: 'mock',
        now: () => NOW,
      });
      expect(
        await runCli(
          ['chains', '--provider', 'lifi', ...(json ? ['--json'] : [])],
          { stdout, stderr, provider, lifiProvider, env },
        ),
      ).toBe(0);
      expect(stderr).not.toHaveBeenCalled();
      expect(provider.getQuote).not.toHaveBeenCalled();
      const output = stdout.mock.calls[0]![0];
      if (json)
        expect(JSON.parse(output).chains[0]).toMatchObject({
          catalogId: 2,
          chainId: '8453',
          supportedByExplorer: true,
        });
      else expect(output).toContain('8453 | Base | EVM | 2 | yes');
    },
  );

  it('rejects an unsupported discovery provider before networking', async () => {
    const lifiProvider = { getSupportedChains: vi.fn() };
    const stderr = vi.fn();
    expect(
      await runCli(['chains', '--provider', 'unknown', '--json'], {
        lifiProvider,
        stderr,
      }),
    ).toBe(2);
    expect(JSON.parse(stderr.mock.calls[0]![0]).error.code).toBe(
      'INVALID_INPUT',
    );
    expect(lifiProvider.getSupportedChains).not.toHaveBeenCalled();
  });

  it('keeps Bebop usable after discovery fails', async () => {
    const stdout = vi.fn();
    const stderr = vi.fn();
    const fetch = vi.fn(async () => new Response('', { status: 503 }));
    const lifiProvider = new LiFiClient({ fetch, maxRetries: 0 });
    expect(
      await runCli(['chains', '--json'], { lifiProvider, stdout, stderr }),
    ).toBe(1);
    expect(stdout).not.toHaveBeenCalled();
    const provider = new BebopClient({
      fetch: async () => Response.json(fixtureFor('base')),
      provenance: 'mock',
      now: () => NOW,
    });
    expect(
      await runCli(
        ['quote', '--intent', 'examples/base-usdc-weth.json', '--json'],
        { lifiProvider, provider, stdout, stderr, now: () => NOW },
      ),
    ).toBe(0);
    expect(fetch).toHaveBeenCalledOnce();
    expect(JSON.parse(stdout.mock.calls[0]![0]).provider).toBe('bebop');
  });

  it.each([false, true])(
    'preserves partial comparison output on stdout with exit 1 (JSON %s)',
    async (json) => {
      const stdout = vi.fn();
      const stderr = vi.fn();
      const fetch = vi.fn(async (url: URL) =>
        Response.json(
          url.searchParams.get('sell_amounts') === '200000000'
            ? { error: { errorCode: 104, message: 'MinSize: synthetic error' } }
            : httpQuote(url),
        ),
      );
      const provider = new BebopClient({
        fetch,
        provenance: 'mock',
        now: () => NOW,
      });
      expect(
        await runCli([...compareArgs, ...(json ? ['--json'] : [])], {
          stdout,
          stderr,
          provider,
          now: () => NOW,
        }),
      ).toBe(1);
      expect(stderr).not.toHaveBeenCalled();
      expect(fetch).toHaveBeenCalledTimes(3);
      expect(stdout).toHaveBeenCalledOnce();
      const output = stdout.mock.calls[0]![0];
      if (json) {
        const report = JSON.parse(output);
        expect(
          report.rows.map((row: { status: string }) => row.status),
        ).toEqual(['success', 'failed', 'success']);
        expect(report.rows[1].error.code).toBe('NO_QUOTE');
        expect(report.rows[0].quote.sellAmount).toBe('100');
        expect(report.rows[2].quote.sellAmount).toBe('300');
        expect(report.best.rowIndexes).toEqual([1]);
      } else {
        expect(output).toContain('MOCK valid at completion');
        expect(output).toContain('FAILED NO_QUOTE');
        expect(output).toContain(
          'Sequential quotes are observations at different times',
        );
      }
    },
  );

  it('returns complete JSON and exit 0 for valid sizes with separator spaces', async () => {
    const stdout = vi.fn();
    const provider = new BebopClient({
      fetch: async (url) => Response.json(httpQuote(url)),
      provenance: 'mock',
      now: () => NOW,
    });
    expect(
      await runCli([...compareArgs.slice(0, 4), '100, 200', '--json'], {
        provider,
        stdout,
        now: () => NOW,
      }),
    ).toBe(0);
    expect(JSON.parse(stdout.mock.calls[0]![0]).counts.succeeded).toBe(2);
  });

  it.each(['100,0', '100,100.0', '100,', '1,2,3,4,5,6'])(
    'rejects invalid comparison sizes before HTTP: %s',
    async (amounts) => {
      const provider = { getQuote: vi.fn() };
      const stderr = vi.fn();
      const stdout = vi.fn();
      expect(
        await runCli([...compareArgs.slice(0, 4), amounts, '--json'], {
          provider,
          stdout,
          stderr,
        }),
      ).toBe(2);
      expect(provider.getQuote).not.toHaveBeenCalled();
      expect(stdout).not.toHaveBeenCalled();
      expect(JSON.parse(stderr.mock.calls[0]![0]).error.code).toBe(
        'INVALID_INPUT',
      );
    },
  );

  it('shows remaining rows as skipped after the HTTP retry budget is exhausted', async () => {
    const fetch = vi.fn(
      async () =>
        new Response('', { status: 429, headers: { 'Retry-After': '60' } }),
    );
    const provider = new BebopClient({ fetch });
    const stdout = vi.fn();
    expect(await runCli(compareArgs, { provider, stdout })).toBe(1);
    expect(fetch).toHaveBeenCalledOnce();
    const text = stdout.mock.calls[0]![0];
    expect(text).toContain('FAILED RATE_LIMITED');
    expect(text).toContain('SKIPPED after RATE_LIMITED');
    expect(text).toContain('at least 60 seconds');
  });

  it('bounds five failing sizes to fifteen HTTP attempts with the default retry count', async () => {
    const fetch = vi.fn(async () => new Response('', { status: 503 }));
    const provider = new BebopClient({
      fetch,
      sleep: async () => {},
      random: () => 0,
    });
    const stdout = vi.fn();
    const stderr = vi.fn();
    expect(
      await runCli(
        [...compareArgs.slice(0, 4), '100,200,300,400,500', '--json'],
        { provider, stdout, stderr },
      ),
    ).toBe(1);
    expect(fetch).toHaveBeenCalledTimes(15);
    const report = JSON.parse(stdout.mock.calls[0]![0]);
    expect(report.counts).toMatchObject({ failed: 5, skipped: 0 });
    expect(
      report.rows.every(
        (row: { error: { attempts: number } }) => row.error.attempts === 3,
      ),
    ).toBe(true);
    expect(stderr).not.toHaveBeenCalled();
  });

  it('returns exit 130 with skipped rows when already cancelled', async () => {
    const provider = { getQuote: vi.fn() };
    const stdout = vi.fn();
    const stderr = vi.fn();
    expect(
      await runCli([...compareArgs, '--json'], {
        provider,
        stdout,
        stderr,
        signal: AbortSignal.abort(),
      }),
    ).toBe(130);
    expect(JSON.parse(stdout.mock.calls[0]![0])).toMatchObject({
      outcome: 'cancelled',
      counts: { skipped: 3 },
    });
    expect(stderr).not.toHaveBeenCalled();
    expect(provider.getQuote).not.toHaveBeenCalled();
  });
});
