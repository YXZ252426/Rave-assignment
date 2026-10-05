import { LiFiIntentAdapter } from '../adapters/lifi-intent-adapter.js';
import { inspectQuote } from '../analysis/quote-inspector.js';
import { normalizeBebopQuote } from '../clients/bebop-schema.js';

/** Deliberately synthetic historical data; never load this from the live quote path. */
export function createDemoReport() {
  const capturedAt = '2026-10-05T02:50:00.000Z';
  const inspectedAt = Date.parse('2026-10-05T02:52:00.000Z');
  const request = new LiFiIntentAdapter().normalize({
    fromChain: 8453,
    toChain: 8453,
    fromToken: 'USDC',
    toToken: 'WETH',
    amountIn: '100',
    userAddress: '0x1111111111111111111111111111111111111111',
    receiverAddress: '0x2222222222222222222222222222222222222222',
  });
  const body = {
    status: 'SIG_SUCCESS',
    requestId: 'mock-demo-request',
    quoteId: 'mock-demo-quote',
    chainId: 8453,
    approvalType: 'Standard',
    taker: request.takerAddress,
    receiver: request.receiverAddress,
    expiry: 1791168660,
    sellTokens: {
      [request.sellToken.address]: { amount: '100000000', decimals: 6 },
    },
    buyTokens: {
      [request.buyToken.address]: { amount: '40000000000000000', decimals: 18 },
    },
    approvalTarget: '0x3333333333333333333333333333333333333333',
    settlementAddress: '0x4444444444444444444444444444444444444444',
    tx: {
      to: '0x5555555555555555555555555555555555555555',
      value: '0x0',
      data: '0x12345678',
      from: request.takerAddress,
    },
    warnings: [
      {
        code: 'MOCK',
        message:
          'Synthetic amounts, contract addresses, and calldata; not an executable quote.',
      },
    ],
  };
  return {
    ...inspectQuote(
      normalizeBebopQuote(body, request, capturedAt, 'mock'),
      () => inspectedAt,
    ),
    demo: {
      clock: 'fixed historical reference',
      note: 'OFFLINE MOCK. Times are fixed for reproducibility; this example is expired and cannot be executed.',
    },
  };
}
