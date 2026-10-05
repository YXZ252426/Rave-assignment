import { z } from 'zod';
import { LiFiIntentAdapter } from '../adapters/lifi-intent-adapter.js';
import { inspectQuote, type QuoteReport } from '../analysis/quote-inspector.js';
import type { QuoteProvider } from '../clients/bebop-client.js';
import { parseAmountIn } from '../domain/amounts.js';
import { ExplorerError, serializeError } from '../domain/errors.js';
import type {
  NormalizedQuote,
  NormalizedQuoteRequest,
} from '../domain/types.js';

const sizesSchema = z.array(z.string().min(1)).min(1).max(5);
const stopCodes = new Set([
  'UPSTREAM_AUTH_ERROR',
  'UPSTREAM_ACCESS_DENIED',
  'RATE_LIMITED',
  'REQUEST_CANCELLED',
  'INTERNAL_ERROR',
]);
export type ComparisonError = ReturnType<typeof serializeError>;
interface RowInput {
  index: number;
  amountIn: string;
  amountBaseUnits: string;
}
type Observation = RowInput &
  (
    | {
        status: 'success';
        requestedAt: string;
        finishedAt: string;
        quote: NormalizedQuote;
      }
    | {
        status: 'failed';
        requestedAt: string;
        finishedAt: string;
        error: ComparisonError;
      }
    | {
        status: 'skipped';
        requestedAt: null;
        finishedAt: null;
        reason: ComparisonError;
      }
  );
export type ComparisonRow = RowInput &
  (
    | {
        status: 'success';
        requestedAt: string;
        finishedAt: string;
        quote: QuoteReport;
      }
    | {
        status: 'failed';
        requestedAt: string;
        finishedAt: string;
        error: ComparisonError;
      }
    | {
        status: 'skipped';
        requestedAt: null;
        finishedAt: null;
        reason: ComparisonError;
      }
  );

export function comparisonRequests(
  intent: unknown,
  amounts: unknown,
): { amountIn: string; request: NormalizedQuoteRequest }[] {
  const parsed = sizesSchema.safeParse(amounts);
  if (!parsed.success)
    throw new ExplorerError(
      'INVALID_INPUT',
      'Provide one to five positive decimal sizes.',
      'amounts',
    );
  const base = new LiFiIntentAdapter().normalize(intent);
  const seen = new Set<string>();
  return parsed.data.map((amount, index) => {
    let units: string;
    try {
      units = parseAmountIn(amount, base.sellToken.decimals);
    } catch (error) {
      if (error instanceof ExplorerError)
        throw new ExplorerError(error.code, error.message, `amounts[${index}]`);
      throw error;
    }
    if (seen.has(units))
      throw new ExplorerError(
        'INVALID_INPUT',
        'Trade sizes must be unique after conversion to base units.',
        `amounts[${index}]`,
      );
    seen.add(units);
    return {
      amountIn: amount,
      request: { ...base, sellAmountBaseUnits: units },
    };
  });
}

function rankRows(rows: ComparisonRow[]) {
  let best: {
    rowIndexes: number[];
    effectivePrice: QuoteReport['effectivePrice'];
  } | null = null;
  for (const row of rows) {
    if (row.status !== 'success' || row.quote.expiry.expired) continue;
    const rate = row.quote.effectivePrice;
    if (!best) {
      best = { rowIndexes: [row.index], effectivePrice: rate };
      continue;
    }
    const difference =
      BigInt(rate.numerator) * BigInt(best.effectivePrice.denominator) -
      BigInt(best.effectivePrice.numerator) * BigInt(rate.denominator);
    if (difference > 0n)
      best = { rowIndexes: [row.index], effectivePrice: rate };
    else if (difference === 0n) best.rowIndexes.push(row.index);
  }
  return best;
}

export class CompareService {
  constructor(
    private readonly provider: QuoteProvider,
    private readonly now: () => number = Date.now,
  ) {}

  async compare(intent: unknown, amounts: unknown, signal?: AbortSignal) {
    // Validate every size and route before making even the first provider request.
    const requests = comparisonRequests(intent, amounts);
    const base = requests[0]!.request;
    const startedAt = new Date(this.now()).toISOString();
    const observations: Observation[] = [];
    let stopReason: ComparisonError | undefined;
    for (const [index, item] of requests.entries()) {
      const input: RowInput = {
        index: index + 1,
        amountIn: item.amountIn,
        amountBaseUnits: item.request.sellAmountBaseUnits,
      };
      if (!stopReason && signal?.aborted)
        stopReason = serializeError(
          new ExplorerError('REQUEST_CANCELLED', 'Comparison cancelled.'),
        );
      if (stopReason) {
        observations.push({
          ...input,
          status: 'skipped',
          requestedAt: null,
          finishedAt: null,
          reason: stopReason,
        });
        continue;
      }
      const requestedAt = new Date(this.now()).toISOString();
      try {
        const quote = await this.provider.getQuote(item.request, signal);
        observations.push({
          ...input,
          status: 'success',
          requestedAt,
          finishedAt: new Date(this.now()).toISOString(),
          quote,
        });
      } catch (error) {
        const failure =
          error instanceof ExplorerError
            ? error
            : new ExplorerError(
                'INTERNAL_ERROR',
                'Unexpected failure while collecting a comparison quote.',
              );
        const serialized = serializeError(failure);
        observations.push({
          ...input,
          status: 'failed',
          requestedAt,
          finishedAt: new Date(this.now()).toISOString(),
          error: serialized,
        });
        if (stopCodes.has(failure.code)) stopReason = serialized;
      }
    }
    const completedAtMs = this.now();
    const rows: ComparisonRow[] = observations.map((row) =>
      row.status === 'success'
        ? { ...row, quote: inspectQuote(row.quote, () => completedAtMs) }
        : row,
    );
    const best = rankRows(rows);
    const succeeded = rows.filter((row) => row.status === 'success').length;
    const failed = rows.filter((row) => row.status === 'failed').length;
    const skipped = rows.filter((row) => row.status === 'skipped').length;
    const expired = rows.filter(
      (row) => row.status === 'success' && row.quote.expiry.expired,
    ).length;
    const outcome =
      stopReason?.code === 'REQUEST_CANCELLED'
        ? 'cancelled'
        : failed === 0 && skipped === 0
          ? 'complete'
          : succeeded > 0
            ? 'partial'
            : 'failed';
    return {
      provider: 'bebop' as const,
      chainId: base.chainId,
      network: base.network,
      sellToken: base.sellToken,
      buyToken: base.buyToken,
      takerAddress: base.takerAddress,
      receiverAddress: base.receiverAddress,
      startedAt,
      completedAt: new Date(completedAtMs).toISOString(),
      outcome,
      counts: { succeeded, failed, skipped, expired },
      rows,
      best,
      summary: `${succeeded} successful, ${failed} failed, ${skipped} skipped; ${expired} successful quote(s) expired by completion. ${best ? `Best observed rate among still-valid quotes: row(s) ${best.rowIndexes.join(', ')}.` : 'No still-valid quote is available for ranking.'}`,
      limitations: [
        'Sequential quotes are observations at different times, not a simultaneous market snapshot.',
        'Rates compare buy units per sell unit and exclude separate network fees; differences are not measured market price impact.',
        'Ranking uses exact ratios and validity at completion. Missing transaction data stays labeled and does not prevent price comparison; ranking does not establish execution readiness.',
        'At most five sizes are requested sequentially. Each size can use up to three HTTP attempts and 20 seconds; the full comparison can take up to about 100 seconds.',
      ],
    };
  }
}
export type ComparisonReport = Awaited<ReturnType<CompareService['compare']>>;
