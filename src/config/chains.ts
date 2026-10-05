import { ExplorerError } from '../domain/errors.js';
import type { BebopNetwork, SupportedChainId } from '../domain/types.js';

interface ChainDefinition {
  readonly chainId: SupportedChainId;
  readonly name: string;
  readonly network: BebopNetwork;
}

export const CHAINS = {
  1: { chainId: 1, name: 'Ethereum', network: 'ethereum' },
  8453: { chainId: 8453, name: 'Base', network: 'base' },
} as const satisfies Record<SupportedChainId, ChainDefinition>;

export function resolveChain(chainId: number, field: string): ChainDefinition {
  if (chainId !== 1 && chainId !== 8453) {
    throw new ExplorerError(
      'UNSUPPORTED_ROUTE',
      'Supported chains: Ethereum (1) and Base (8453).',
      field,
    );
  }
  return CHAINS[chainId];
}
