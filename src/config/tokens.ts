import { ExplorerError } from '../domain/errors.js';
import type { SupportedChainId, TokenDefinition } from '../domain/types.js';
import { normalizeAddress } from '../domain/validation.js';

// Provenance and verification date: docs/api-integration.md.
export const TOKENS: readonly TokenDefinition[] = Object.freeze([
  Object.freeze({
    chainId: 1,
    symbol: 'USDC',
    address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    decimals: 6,
  } as const),
  Object.freeze({
    chainId: 1,
    symbol: 'WETH',
    address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    decimals: 18,
  } as const),
  Object.freeze({
    chainId: 8453,
    symbol: 'USDC',
    address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    decimals: 6,
  } as const),
  Object.freeze({
    chainId: 8453,
    symbol: 'WETH',
    address: '0x4200000000000000000000000000000000000006',
    decimals: 18,
  } as const),
]);

export function resolveToken(
  chainId: SupportedChainId,
  input: string,
  field: string,
): TokenDefinition {
  const key = /^0x/i.test(input)
    ? normalizeAddress(input, field)
    : input.toUpperCase();
  const token = TOKENS.find(
    (entry) =>
      entry.chainId === chainId &&
      (entry.symbol === key || entry.address === key),
  );
  if (!token) {
    throw new ExplorerError(
      'UNSUPPORTED_ROUTE',
      'Supported tokens on this chain: USDC and WETH. Use a symbol or its chain-specific contract address.',
      field,
    );
  }
  return token;
}
