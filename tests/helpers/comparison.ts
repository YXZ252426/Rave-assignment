import { normalizeBebopQuote } from '../../src/clients/bebop-schema.js';
import type { NormalizedQuoteRequest } from '../../src/domain/types.js';
import { fixtureFor, NOW, requestFor } from './bebop.js';

/** Synthetic service-level quote; HTTP integration tests exercise the real parser separately. */
export function comparisonQuote(
  request: NormalizedQuoteRequest,
  buyAmountBaseUnits = '40000000000000000',
) {
  return {
    ...normalizeBebopQuote(
      fixtureFor(request.network),
      requestFor(request.network),
      new Date(NOW).toISOString(),
      'mock',
    ),
    ...request,
    buyAmountBaseUnits,
  };
}
