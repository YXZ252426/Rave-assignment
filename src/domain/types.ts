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

export type QuoteProvenance = 'live' | 'mock';

export interface NormalizedQuote {
  readonly provider: 'bebop';
  readonly provenance: QuoteProvenance;
  readonly chainId: SupportedChainId;
  readonly network: BebopNetwork;
  readonly requestId: string;
  readonly quoteId: string;
  readonly retrievedAt: string;
  readonly takerAddress: Address;
  readonly receiverAddress: Address;
  readonly sellToken: TokenDefinition;
  readonly buyToken: TokenDefinition;
  readonly sellAmountBaseUnits: string;
  readonly buyAmountBaseUnits: string;
  readonly expiry: number;
  readonly approvalTarget: Address | null;
  readonly settlementAddress: Address | null;
  readonly transaction: {
    readonly to: Address;
    readonly valueBaseUnits: string;
    readonly data: string | null;
  } | null;
  readonly providerWarnings: readonly unknown[];
}
