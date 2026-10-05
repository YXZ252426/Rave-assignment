import { formatAmount } from '../domain/amounts.js';
import type { NormalizedQuoteRequest } from '../domain/types.js';

export function renderNormalizedRequest(
  request: NormalizedQuoteRequest,
): string {
  return [
    'Normalized quote request (offline; no quote requested)',
    `Chain: ${request.network} (${request.chainId})`,
    `Sell token: ${request.sellToken.symbol} (${request.sellToken.address}, ${request.sellToken.decimals} decimals)`,
    `Buy token: ${request.buyToken.symbol} (${request.buyToken.address}, ${request.buyToken.decimals} decimals)`,
    `Sell amount: ${formatAmount(request.sellAmountBaseUnits, request.sellToken.decimals)} ${request.sellToken.symbol}`,
    `Sell amount (base units): ${request.sellAmountBaseUnits}`,
    `Taker: ${request.takerAddress}`,
    `Receiver: ${request.receiverAddress}`,
  ].join('\n');
}
