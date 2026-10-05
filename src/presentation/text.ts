import type { QuoteReport } from '../analysis/quote-inspector.js';
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

function safeText(value: unknown): string {
  const text =
    typeof value === 'string' ? value : (JSON.stringify(value) ?? 'null');
  return text
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, ' ')
    .slice(0, 512);
}

export function renderQuote(report: QuoteReport): string {
  return [
    `Bebop RFQ quote (${report.provenance.toUpperCase()})`,
    `Chain: ${report.network} (${report.chainId})`,
    `Quote ID: ${safeText(report.quoteId)}`,
    `Retrieved: ${report.retrievedAt}`,
    `Inspected: ${report.inspectedAt}`,
    `Sell: ${report.sellAmount} ${report.sellToken.symbol} (${report.sellToken.address})`,
    `Sell amount (base units): ${report.sellAmountBaseUnits}`,
    `Buy: ${report.buyAmount} ${report.buyToken.symbol} (${report.buyToken.address})`,
    `Buy amount (base units): ${report.buyAmountBaseUnits}`,
    `Effective price: ${report.effectivePrice.value === '0' ? '<0.000000000000000001' : report.effectivePrice.value} ${report.effectivePrice.units} (18 decimals, rounded down)`,
    `Expiry: ${report.expiry.utc} (${report.expiry.expired ? 'EXPIRED' : `${report.expiry.remainingSeconds}s remaining`})`,
    `Taker: ${report.takerAddress}`,
    `Receiver: ${report.receiverAddress}`,
    `Approval target: ${report.approvalTarget ?? 'not provided'}`,
    `Settlement address: ${report.settlementAddress ?? 'not provided'}`,
    `Transaction target: ${report.transaction?.target ?? 'not provided'}`,
    `Transaction value: ${report.transaction ? `${report.transaction.valueBaseUnits} wei (${report.transaction.valueNative} ETH); excludes gas fee` : 'not provided'}`,
    `Calldata present: ${report.hasCalldata ? 'yes' : 'no'}`,
    `Warnings: ${report.warnings.join(', ') || 'none'}`,
    ...report.providerWarnings.map(
      (warning) => `Provider warning: ${safeText(warning)}`,
    ),
    `Analysis: ${report.summary}`,
  ].join('\n');
}
