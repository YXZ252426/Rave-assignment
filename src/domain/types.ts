import type { Address } from 'viem';

export type SupportedChainId = 1 | 8453;
export type BebopNetwork = 'ethereum' | 'base';

export interface TokenDefinition {
  readonly chainId: SupportedChainId;
  readonly address: Address;
  readonly symbol: 'USDC' | 'WETH';
  readonly decimals: number;
}

export interface NormalizedQuoteRequest {
  readonly chainId: SupportedChainId;
  readonly network: BebopNetwork;
  readonly sellToken: TokenDefinition;
  readonly buyToken: TokenDefinition;
  readonly sellAmountBaseUnits: string;
  readonly takerAddress: Address;
  readonly receiverAddress: Address;
}
