import { formatUnits } from 'viem';
import { ExplorerError } from './errors.js';

export const UINT256_MAX = (1n << 256n) - 1n;

/** Validate before converting: some unit parsers round excess decimal places. */
export function parseAmountIn(amount: string, decimals: number): string {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
    throw new Error('Invalid token decimals in registry.');
  }
  // 78 integer digits suffice for uint256; bound input before BigInt conversion.
  if (
    amount.length > 78 + 1 + decimals ||
    amount !== amount.trim() ||
    !/^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(amount)
  ) {
    throw new ExplorerError(
      'INVALID_INPUT',
      'Use a positive decimal string without spaces, leading zeros, signs, or exponents.',
      'amountIn',
    );
  }
  const [whole = '0', fraction = ''] = amount.split('.');
  if (fraction.length > decimals) {
    throw new ExplorerError(
      'INVALID_INPUT',
      `At most ${decimals} decimal places are allowed for the sell token; amounts are never rounded.`,
      'amountIn',
    );
  }
  const units =
    BigInt(whole) * 10n ** BigInt(decimals) +
    BigInt(fraction.padEnd(decimals, '0') || '0');
  if (units === 0n || units > UINT256_MAX) {
    throw new ExplorerError(
      'INVALID_INPUT',
      'Amount must be positive and fit within uint256 base units.',
      'amountIn',
    );
  }
  return units.toString();
}

export function formatAmount(baseUnits: string, decimals: number): string {
  return formatUnits(BigInt(baseUnits), decimals);
}
