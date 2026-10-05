import { formatAmount } from '../domain/amounts.js';
import type { NormalizedQuote } from '../domain/types.js';

/** Display truncates downward to 18 decimals; retain the exact rational too. */
export function effectivePrice(quote: NormalizedQuote) {
  const numerator =
    BigInt(quote.buyAmountBaseUnits) * 10n ** BigInt(quote.sellToken.decimals);
  const denominator =
    BigInt(quote.sellAmountBaseUnits) * 10n ** BigInt(quote.buyToken.decimals);
  return {
    value: formatAmount(
      ((numerator * 10n ** 18n) / denominator).toString(),
      18,
    ),
    numerator: numerator.toString(),
    denominator: denominator.toString(),
    units: `${quote.buyToken.symbol} per ${quote.sellToken.symbol}`,
    displayDecimals: 18,
    rounding: 'down' as const,
  };
}

export function inspectQuote(
  quote: NormalizedQuote,
  now: () => number = Date.now,
) {
  const inspectedAtMs = now();
  const expired = inspectedAtMs >= quote.expiry * 1000;
  const remainingSeconds = Math.max(
    0,
    Math.floor((quote.expiry * 1000 - inspectedAtMs) / 1000),
  );
  const hasCalldata = Boolean(
    quote.transaction?.data && quote.transaction.data !== '0x',
  );
  const price = effectivePrice(quote);
  const warnings: string[] = [];
  if (quote.provenance === 'mock') warnings.push('mock_quote');
  if (expired) warnings.push('expired');
  if (!quote.transaction || !hasCalldata)
    warnings.push('missing_transaction_data');
  if (!quote.approvalTarget) warnings.push('missing_approval_target');
  if (!quote.settlementAddress) warnings.push('missing_settlement_address');
  if (quote.providerWarnings.length) warnings.push('provider_warnings');
  if (price.value === '0') warnings.push('rate_below_display_precision');
  const transaction = quote.transaction
    ? {
        target: quote.transaction.to,
        valueBaseUnits: quote.transaction.valueBaseUnits,
        valueNative: formatAmount(quote.transaction.valueBaseUnits, 18),
        nativeSymbol: 'ETH',
        hasCalldata,
      }
    : null;
  const summary = [
    quote.provenance === 'mock' ? 'Synthetic example; not a live quote.' : '',
    `Quoted rate: ${price.value === '0' ? '<0.000000000000000001' : price.value} ${price.units} (excluding separate network fees).`,
    expired
      ? 'Quote is expired.'
      : `Quote expires in ${remainingSeconds} seconds.`,
    hasCalldata
      ? 'Transaction calldata is present.'
      : 'Transaction calldata is missing.',
    quote.providerWarnings.length
      ? `${quote.providerWarnings.length} provider warning(s); inspect them below.`
      : '',
    'Balances, allowances, gas, contract identity, and execution success have not been verified.',
  ]
    .filter(Boolean)
    .join(' ');
  return {
    provider: quote.provider,
    provenance: quote.provenance,
    chainId: quote.chainId,
    network: quote.network,
    requestId: quote.requestId,
    quoteId: quote.quoteId,
    retrievedAt: quote.retrievedAt,
    inspectedAt: new Date(inspectedAtMs).toISOString(),
    takerAddress: quote.takerAddress,
    receiverAddress: quote.receiverAddress,
    sellToken: quote.sellToken,
    sellAmountBaseUnits: quote.sellAmountBaseUnits,
    sellAmount: formatAmount(
      quote.sellAmountBaseUnits,
      quote.sellToken.decimals,
    ),
    buyToken: quote.buyToken,
    buyAmountBaseUnits: quote.buyAmountBaseUnits,
    buyAmount: formatAmount(quote.buyAmountBaseUnits, quote.buyToken.decimals),
    effectivePrice: price,
    expiry: {
      unix: quote.expiry,
      utc: new Date(quote.expiry * 1000).toISOString(),
      remainingSeconds,
      expired,
    },
    approvalTarget: quote.approvalTarget,
    settlementAddress: quote.settlementAddress,
    transaction,
    hasCalldata,
    warnings,
    providerWarnings: quote.providerWarnings,
    summary,
  };
}
export type QuoteReport = ReturnType<typeof inspectQuote>;
