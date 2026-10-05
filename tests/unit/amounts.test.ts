import { describe, expect, it } from 'vitest';
import {
  formatAmount,
  parseAmountIn,
  UINT256_MAX,
} from '../../src/domain/amounts.js';

describe('exact token amounts', () => {
  it.each([
    ['100.25', 6, '100250000'],
    ['0.000001', 6, '1'],
    ['1.000000000000000001', 18, '1000000000000000001'],
    ['0.000000000000000001', 18, '1'],
    ['9007199254740993', 6, '9007199254740993000000'],
    ['1.230000', 6, '1230000'],
  ])('converts %s with %i decimals exactly', (amount, decimals, units) => {
    expect(parseAmountIn(amount, decimals)).toBe(units);
  });

  it.each([
    '',
    '0',
    '0.000000',
    '-1',
    '+1',
    '1e3',
    '1E3',
    '1,000',
    ' 1',
    '1 ',
    '1\n',
    '1\r',
    '1\r\n',
    '01',
    '.1',
    '1.',
    'NaN',
    'Infinity',
    '0x10',
    '0.0000001',
    '1.0000000',
    '9'.repeat(1000),
  ])('rejects %j without rounding', (amount) => {
    expect(() => parseAmountIn(amount, 6)).toThrow(
      expect.objectContaining({ code: 'INVALID_INPUT', field: 'amountIn' }),
    );
  });

  it.each([6, 18])(
    'enforces the exact uint256 boundary with %i decimals',
    (decimals) => {
      expect(
        parseAmountIn(formatAmount(UINT256_MAX.toString(), decimals), decimals),
      ).toBe(UINT256_MAX.toString());
      expect(() =>
        parseAmountIn(
          formatAmount((UINT256_MAX + 1n).toString(), decimals),
          decimals,
        ),
      ).toThrow(/uint256/);
    },
  );

  it('formats a large value without precision loss', () => {
    expect(formatAmount('9007199254740993123456', 6)).toBe(
      '9007199254740993.123456',
    );
  });
});
