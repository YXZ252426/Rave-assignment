import { describe, expect, it } from 'vitest';
import { inspectQuote } from '../../src/analysis/quote-inspector.js';
import { normalizeBebopQuote } from '../../src/clients/bebop-schema.js';
import { renderQuote } from '../../src/presentation/text.js';
import { NOW, fixtureFor, requestFor } from '../helpers/bebop.js';

function quote() {
  return normalizeBebopQuote(
    fixtureFor('base'),
    requestFor('base'),
    new Date(NOW).toISOString(),
    'mock',
  );
}
describe('quote inspection', () => {
  it('calculates the price in human-token units', () => {
    const report = inspectQuote(quote(), () => NOW);
    expect(report.effectivePrice.value).toBe('0.0004');
    expect(report.effectivePrice.units).toBe('WETH per USDC');
    expect(report.buyAmount).toBe('0.04');
    expect(report.sellAmount).toBe('100');
    expect(report.expiry).toEqual({
      unix: 1791168660,
      utc: '2026-10-05T02:51:00.000Z',
      remainingSeconds: 60,
      expired: false,
    });
    expect(report.hasCalldata).toBe(true);
  });

  it('rounds down repeating prices while preserving the exact rational', () => {
    const report = inspectQuote(
      {
        ...quote(),
        sellAmountBaseUnits: '3000000',
        buyAmountBaseUnits: '1000000000000000000',
      },
      () => NOW,
    );
    expect(report.effectivePrice.value).toBe('0.333333333333333333');
    expect(BigInt(report.effectivePrice.numerator) * 3n).toBe(
      BigInt(report.effectivePrice.denominator),
    );
  });

  it('supports the reverse rate and amounts above Number precision', () => {
    const original = quote();
    const report = inspectQuote(
      {
        ...original,
        sellToken: original.buyToken,
        buyToken: original.sellToken,
        sellAmountBaseUnits: '1000000000000000000',
        buyAmountBaseUnits: '9007199254740993123456',
      },
      () => NOW,
    );
    expect(report.effectivePrice.value).toBe('9007199254740993.123456');
    expect(report.effectivePrice.units).toBe('USDC per WETH');
  });

  it('marks expiry at the exact boundary', () => {
    const report = inspectQuote(quote(), () => NOW + 60000);
    expect(report.expiry.expired).toBe(true);
    expect(report.expiry.remainingSeconds).toBe(0);
    expect(report.warnings).toContain('expired');
  });

  it.each([null, '0x'])('marks absent calldata %j', (data) => {
    const original = quote();
    const report = inspectQuote(
      { ...original, transaction: { ...original.transaction!, data } },
      () => NOW,
    );
    expect(report.hasCalldata).toBe(false);
    expect(report.warnings).toContain('missing_transaction_data');
  });

  it('reports missing transaction data without inventing fields', () => {
    const report = inspectQuote({ ...quote(), transaction: null }, () => NOW);
    expect(report.transaction).toBeNull();
    expect(report.hasCalldata).toBe(false);
    expect(renderQuote(report)).toContain('Transaction target: not provided');
  });

  it('labels native value independently from gas and renders every required field', () => {
    const original = quote();
    const report = inspectQuote(
      {
        ...original,
        transaction: {
          ...original.transaction!,
          valueBaseUnits: '1000000000000000000',
        },
      },
      () => NOW,
    );
    const text = renderQuote(report);
    for (const label of [
      '(MOCK)',
      'Sell:',
      'Buy:',
      'Effective price:',
      'Expiry:',
      'Approval target:',
      'Settlement address:',
      'Transaction target:',
      'Transaction value:',
      'Calldata present:',
    ])
      expect(text).toContain(label);
    expect(text).toContain('(1 ETH); excludes gas fee');
    expect(text).toContain('execution success have not been verified');
  });

  it('shows tiny positive rates as below display precision', () => {
    const report = inspectQuote(
      { ...quote(), buyAmountBaseUnits: '1', sellAmountBaseUnits: '100000000' },
      () => NOW,
    );
    expect(report.warnings).toContain('rate_below_display_precision');
    expect(renderQuote(report)).toContain(
      '<0.000000000000000001 WETH per USDC',
    );
  });

  it('removes terminal control characters from provider text', () => {
    const report = inspectQuote(
      {
        ...quote(),
        quoteId: 'bad\u001b[2J',
        providerWarnings: ['warning\n\u001b[31m'],
      },
      () => NOW,
    );
    const text = renderQuote(report);
    expect(text).not.toContain('\u001b');
    expect(report.providerWarnings).toEqual(['warning\n\u001b[31m']);
  });
});
