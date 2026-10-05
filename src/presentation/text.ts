import type { ChainCatalog } from '../clients/lifi-client.js';
import type { ComparisonReport } from '../services/compare-service.js';
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

export function renderChains(catalog: ChainCatalog): string {
  return [
    `LI.FI Intents chain catalog (${catalog.provenance.toUpperCase()})`,
    `Retrieved: ${catalog.retrievedAt}`,
    'Chain ID | Chain name | Type | Catalog ID | Supported by explorer',
    ...catalog.chains.map(
      (chain) =>
        `${safeText(chain.chainId)} | ${safeText(chain.name)} | ${safeText(chain.chainType)} | ${chain.catalogId} | ${chain.supportedByExplorer ? 'yes' : 'no'}`,
    ),
    catalog.note,
  ].join('\n');
}

export function renderComparison(report: ComparisonReport): string {
  const lines = [
    `Bebop trade-size comparison: ${report.network} (${report.chainId})`,
    `Taker: ${report.takerAddress}`,
    `Receiver: ${report.receiverAddress}`,
    `Completed: ${report.completedAt}`,
    `# | Input (${report.sellToken.symbol}) | Output (${report.buyToken.symbol}) | Rate (${report.buyToken.symbol}/${report.sellToken.symbol}) | Result`,
  ];
  for (const row of report.rows) {
    if (row.status === 'success') {
      const quote = row.quote;
      lines.push(
        `${row.index} | ${row.amountIn} | ${quote.buyAmount} | ${quote.effectivePrice.value === '0' ? '<0.000000000000000001' : quote.effectivePrice.value} | ${quote.provenance.toUpperCase()} ${quote.expiry.expired ? 'EXPIRED' : 'valid at completion'}`,
      );
      lines.push(
        `  Retrieved: ${quote.retrievedAt}; expiry: ${quote.expiry.utc}; calldata: ${quote.hasCalldata ? 'present' : 'missing'}; warnings: ${quote.warnings.join(', ') || 'none'}`,
      );
      for (const warning of quote.providerWarnings)
        lines.push(`  Provider warning: ${safeText(warning)}`);
    } else if (row.status === 'failed') {
      lines.push(
        `${row.index} | ${row.amountIn} | - | - | FAILED ${row.error.code}: ${safeText(row.error.message)}`,
      );
      lines.push(
        `  Requested: ${row.requestedAt}; finished: ${row.finishedAt}; attempts: ${row.error.attempts ?? 'unknown'}`,
      );
      if (row.error.retryAfterMs !== undefined)
        lines.push(
          `  Provider wait guidance: at least ${Math.ceil(row.error.retryAfterMs / 1000)} seconds.`,
        );
    } else
      lines.push(
        `${row.index} | ${row.amountIn} | - | - | SKIPPED after ${row.reason.code}`,
      );
  }
  return [...lines, report.summary, ...report.limitations].join('\n');
}
