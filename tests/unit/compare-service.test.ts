import { describe, expect, it, vi } from 'vitest';
import { CompareService } from '../../src/services/compare-service.js';
import { ExplorerError } from '../../src/domain/errors.js';
import type { NormalizedQuoteRequest } from '../../src/domain/types.js';
import { NOW, intentFor } from '../helpers/bebop.js';
import { comparisonQuote } from '../helpers/comparison.js';

const intent = intentFor('base');

describe('trade-size comparisons', () => {
  it.each(
    [
      [],
      ['1', '2', '3', '4', '5', '6'],
      [100],
      ['0'],
      ['1e2'],
      ['01'],
      ['100', '100.0'],
      ['1', '0.0000001'],
      ['1', '-2'],
      ['1', ' 2'],
      ['1', '2.'],
      ['1', ''],
    ].map((amounts) => ({ amounts })),
  )(
    'validates every size before calling the provider: %j',
    async ({ amounts }) => {
      const provider = { getQuote: vi.fn() };
      await expect(
        new CompareService(provider).compare(intent, amounts),
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
      expect(provider.getQuote).not.toHaveBeenCalled();
    },
  );

  it('validates the complete base intent, including its amount and route', async () => {
    const provider = { getQuote: vi.fn() };
    for (const input of [
      { ...intent, amountIn: '0' },
      { ...intent, toChain: 1 },
    ]) {
      await expect(
        new CompareService(provider).compare(input, ['100']),
      ).rejects.toBeInstanceOf(ExplorerError);
    }
    expect(provider.getQuote).not.toHaveBeenCalled();
  });

  it('preserves route and receiver and waits for each size to finish', async () => {
    const receiver = '0x1111111111111111111111111111111111111111';
    let active = 0;
    let peak = 0;
    const getQuote = vi.fn(async (request: NormalizedQuoteRequest) => {
      active++;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active--;
      expect(request).toMatchObject({
        network: 'base',
        chainId: 8453,
        receiverAddress: receiver,
        takerAddress: intent.userAddress,
      });
      expect(request.sellToken.symbol).toBe('USDC');
      expect(request.buyToken.symbol).toBe('WETH');
      return comparisonQuote(request);
    });
    const report = await new CompareService({ getQuote }, () => NOW).compare(
      { ...intent, receiverAddress: receiver },
      ['1', '2', '3', '4', '5'],
    );
    expect(peak).toBe(1);
    expect(getQuote).toHaveBeenCalledTimes(5);
    expect(report.rows.map((row) => row.amountBaseUnits)).toEqual([
      '1000000',
      '2000000',
      '3000000',
      '4000000',
      '5000000',
    ]);
    expect(report).toMatchObject({
      outcome: 'complete',
      counts: { succeeded: 5, failed: 0, skipped: 0 },
      best: { rowIndexes: [1] },
    });
  });

  it('uses WETH precision and rate units for a reverse route', async () => {
    const getQuote = vi.fn(async (request: NormalizedQuoteRequest) =>
      comparisonQuote(request, '250000000'),
    );
    const report = await new CompareService({ getQuote }, () => NOW).compare(
      { ...intent, fromToken: 'WETH', toToken: 'USDC' },
      ['0.1', '0.2'],
    );
    expect(report.rows.map((row) => row.amountBaseUnits)).toEqual([
      '100000000000000000',
      '200000000000000000',
    ]);
    expect(report.best).toMatchObject({
      rowIndexes: [1],
      effectivePrice: { value: '2500', units: 'USDC per WETH' },
    });
  });

  it('ranks the rate instead of the total output and preserves ties', async () => {
    const outputs = [
      '40000000000000000',
      '180000000000000000',
      '240000000000000000',
    ];
    const getQuote = vi.fn(async (request: NormalizedQuoteRequest) =>
      comparisonQuote(request, outputs.shift()!),
    );
    const report = await new CompareService({ getQuote }, () => NOW).compare(
      intent,
      ['100', '500', '600'],
    );
    expect(report.best?.rowIndexes).toEqual([1, 3]);
    expect(report.rows.map((row) => row.index)).toEqual([1, 2, 3]);
  });

  it('ranks distinct exact ratios even when both display as zero', async () => {
    const getQuote = vi.fn(async (request: NormalizedQuoteRequest) =>
      comparisonQuote(
        request,
        request.sellAmountBaseUnits === '100000000' ? '1' : '3',
      ),
    );
    const report = await new CompareService({ getQuote }, () => NOW).compare(
      intent,
      ['100', '200'],
    );
    expect(
      report.rows.every(
        (row) =>
          row.status === 'success' && row.quote.effectivePrice.value === '0',
      ),
    ).toBe(true);
    expect(report.best?.rowIndexes).toEqual([2]);
  });

  it('rechecks earlier quotes at completion and excludes an expired better price', async () => {
    let now = NOW;
    const getQuote = vi.fn(async (request: NormalizedQuoteRequest) => {
      now += 1000;
      return {
        ...comparisonQuote(request),
        expiry: Math.floor(now / 1000) + 1,
        retrievedAt: new Date(now).toISOString(),
      };
    });
    const report = await new CompareService({ getQuote }, () => now).compare(
      intent,
      ['100', '200'],
    );
    expect(report.best?.rowIndexes).toEqual([2]);
    expect(report.counts.expired).toBe(1);
    const first = report.rows[0]!;
    expect(first.status === 'success' && first.quote.warnings).toContain(
      'expired',
    );
    for (const row of report.rows)
      if (row.status === 'success')
        expect(row.quote.inspectedAt).toBe(report.completedAt);
  });

  it('keeps expired quotes visible without a winning row', async () => {
    const provider = {
      getQuote: async (request: NormalizedQuoteRequest) => ({
        ...comparisonQuote(request),
        expiry: NOW / 1000,
      }),
    };
    const report = await new CompareService(provider, () => NOW).compare(
      intent,
      ['100'],
    );
    expect(report).toMatchObject({
      outcome: 'complete',
      counts: { expired: 1 },
      best: null,
    });
  });

  it('allows price inspection of incomplete payloads with explicit warnings', async () => {
    const provider = {
      getQuote: async (request: NormalizedQuoteRequest) => ({
        ...comparisonQuote(request),
        transaction: null,
      }),
    };
    const report = await new CompareService(provider, () => NOW).compare(
      intent,
      ['100'],
    );
    expect(report.best?.rowIndexes).toEqual([1]);
    const row = report.rows[0]!;
    expect(row.status === 'success' && row.quote.warnings).toContain(
      'missing_transaction_data',
    );
    expect(report.limitations.join(' ')).toContain(
      'does not establish execution readiness',
    );
  });

  it.each([
    'NO_QUOTE',
    'UPSTREAM_FAILURE',
    'UPSTREAM_TIMEOUT',
    'INVALID_UPSTREAM_RESPONSE',
  ] as const)(
    'retains a failed %s row and continues subsequent sizes',
    async (code) => {
      let index = 0;
      const getQuote = vi.fn(async (request: NormalizedQuoteRequest) => {
        if (++index === 2) throw new ExplorerError(code, 'Unavailable');
        return comparisonQuote(request);
      });
      const report = await new CompareService({ getQuote }, () => NOW).compare(
        intent,
        ['100', '200', '300'],
      );
      expect(getQuote).toHaveBeenCalledTimes(3);
      expect(report).toMatchObject({
        outcome: 'partial',
        counts: { succeeded: 2, failed: 1, skipped: 0 },
      });
      expect(report.rows[1]).toMatchObject({
        status: 'failed',
        error: { code },
      });
    },
  );

  it.each([
    'UPSTREAM_AUTH_ERROR',
    'UPSTREAM_ACCESS_DENIED',
    'RATE_LIMITED',
  ] as const)(
    'stops after %s and records all remaining rows as skipped',
    async (code) => {
      const getQuote = vi.fn(async () => {
        throw new ExplorerError(code, 'Unavailable', undefined, 429, {
          attempts: 3,
          retryable: true,
          retryAfterMs: 60000,
        });
      });
      const report = await new CompareService({ getQuote }, () => NOW).compare(
        intent,
        ['100', '200', '300'],
      );
      expect(getQuote).toHaveBeenCalledOnce();
      expect(report).toMatchObject({
        outcome: 'failed',
        counts: { failed: 1, skipped: 2 },
        best: null,
      });
      expect(report.rows[1]).toMatchObject({
        status: 'skipped',
        requestedAt: null,
        reason: { code, attempts: 3, retryAfterMs: 60000 },
      });
    },
  );

  it('reports all independent no-quote failures without inventing results', async () => {
    const provider = {
      getQuote: async () => {
        throw new ExplorerError('NO_QUOTE', 'No quote');
      },
    };
    const report = await new CompareService(provider, () => NOW).compare(
      intent,
      ['1', '2'],
    );
    expect(report).toMatchObject({
      outcome: 'failed',
      counts: { succeeded: 0, failed: 2, skipped: 0 },
      best: null,
    });
  });

  it('preserves completed results when cancellation interrupts a later request', async () => {
    const controller = new AbortController();
    let index = 0;
    const getQuote = vi.fn(
      async (request: NormalizedQuoteRequest, signal?: AbortSignal) => {
        expect(signal).toBe(controller.signal);
        if (++index === 2) {
          controller.abort();
          throw new ExplorerError('REQUEST_CANCELLED', 'Cancelled');
        }
        return comparisonQuote(request);
      },
    );
    const report = await new CompareService({ getQuote }, () => NOW).compare(
      intent,
      ['100', '200', '300'],
      controller.signal,
    );
    expect(report).toMatchObject({
      outcome: 'cancelled',
      counts: { succeeded: 1, failed: 1, skipped: 1 },
    });
    expect(report.rows.map((row) => row.status)).toEqual([
      'success',
      'failed',
      'skipped',
    ]);
  });

  it('cancels before the first call and marks each row skipped', async () => {
    const provider = { getQuote: vi.fn() };
    const report = await new CompareService(provider).compare(
      intent,
      ['100', '200'],
      AbortSignal.abort(),
    );
    expect(report).toMatchObject({
      outcome: 'cancelled',
      counts: { skipped: 2 },
    });
    expect(provider.getQuote).not.toHaveBeenCalled();
  });

  it('hides unexpected exception details and stops the collection', async () => {
    const provider = {
      getQuote: vi.fn(async () => {
        throw new Error('secret');
      }),
    };
    const report = await new CompareService(provider).compare(intent, [
      '100',
      '200',
    ]);
    expect(report.rows[0]).toMatchObject({
      status: 'failed',
      error: { code: 'INTERNAL_ERROR' },
    });
    expect(JSON.stringify(report)).not.toContain('secret');
    expect(provider.getQuote).toHaveBeenCalledOnce();
  });
});
