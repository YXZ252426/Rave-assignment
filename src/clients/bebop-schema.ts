import { getAddress, isAddress, zeroAddress } from 'viem';
import { z } from 'zod';
import { UINT256_MAX } from '../domain/amounts.js';
import { ExplorerError } from '../domain/errors.js';
import type {
  NormalizedQuote,
  NormalizedQuoteRequest,
  QuoteProvenance,
  TokenDefinition,
} from '../domain/types.js';

const address = z
  .string()
  .refine(
    (v) =>
      v.length === 42 &&
      isAddress(v, { strict: false }) &&
      v.toLowerCase() !== zeroAddress,
  )
  .transform((v) => getAddress(v.toLowerCase()));
const amount = z
  .string()
  .max(78)
  .regex(/^[0-9]+$/)
  .refine(
    (v) =>
      v.length <= 78 &&
      v === v.trim() &&
      /^[0-9]+$/.test(v) &&
      BigInt(v) > 0n &&
      BigInt(v) <= UINT256_MAX,
  )
  .transform((v) => BigInt(v).toString());
const value = z
  .string()
  .max(78)
  .refine(
    (v) =>
      v.length <= 78 &&
      v === v.trim() &&
      /^(?:0x[0-9a-fA-F]+|[0-9]+)$/.test(v) &&
      BigInt(v) <= UINT256_MAX,
  )
  .transform((v) => BigInt(v).toString());
const data = z
  .string()
  .refine((v) => v === v.trim() && /^0x(?:[0-9a-fA-F]{2})*$/.test(v));
const tokenAmount = z.object({
  amount,
  decimals: z.number().int().min(0).max(255),
});
const quoteSchema = z.object({
  status: z.literal('SIG_SUCCESS'),
  requestId: z.string().min(1).max(512),
  quoteId: z.string().min(1).max(512),
  chainId: z.number().int(),
  approvalType: z.literal('Standard'),
  taker: address,
  receiver: address,
  expiry: z.number().int().positive().max(253402300799),
  sellTokens: z.record(z.string(), tokenAmount),
  buyTokens: z.record(z.string(), tokenAmount),
  approvalTarget: address.nullish(),
  settlementAddress: address.nullish(),
  tx: z
    .object({
      to: address,
      value,
      data: data.nullish(),
      from: address.optional(),
    })
    .nullish(),
  warnings: z.array(z.unknown()).default([]),
});

function mismatch(field: string): never {
  throw new ExplorerError(
    'INVALID_UPSTREAM_RESPONSE',
    'Bebop quote does not match the normalized request.',
    field,
  );
}

function tokenFromMap(
  map: Record<string, z.infer<typeof tokenAmount>>,
  token: TokenDefinition,
  field: string,
): string {
  const entries = Object.entries(map);
  const entry = entries[0];
  if (
    entries.length !== 1 ||
    !entry ||
    entry[0].toLowerCase() !== token.address.toLowerCase() ||
    entry[1].decimals !== token.decimals
  )
    mismatch(field);
  return entry[1].amount;
}

export function normalizeBebopQuote(
  body: unknown,
  request: NormalizedQuoteRequest,
  retrievedAt: string,
  provenance: QuoteProvenance,
): NormalizedQuote {
  const parsed = quoteSchema.safeParse(body);
  if (!parsed.success) {
    throw new ExplorerError(
      'INVALID_UPSTREAM_RESPONSE',
      'Bebop returned an incomplete or malformed quote response.',
    );
  }
  const quote = parsed.data;
  if (quote.chainId !== request.chainId) mismatch('chainId');
  if (quote.taker !== request.takerAddress) mismatch('taker');
  if (quote.receiver !== request.receiverAddress) mismatch('receiver');
  if (quote.tx?.from && quote.tx.from !== request.takerAddress)
    mismatch('tx.from');
  const sellAmount = tokenFromMap(
    quote.sellTokens,
    request.sellToken,
    'sellTokens',
  );
  const buyAmount = tokenFromMap(
    quote.buyTokens,
    request.buyToken,
    'buyTokens',
  );
  if (sellAmount !== request.sellAmountBaseUnits) mismatch('sellTokens.amount');
  return {
    provider: 'bebop',
    provenance,
    chainId: request.chainId,
    network: request.network,
    requestId: quote.requestId,
    quoteId: quote.quoteId,
    retrievedAt,
    takerAddress: quote.taker,
    receiverAddress: quote.receiver,
    sellToken: request.sellToken,
    buyToken: request.buyToken,
    sellAmountBaseUnits: sellAmount,
    buyAmountBaseUnits: buyAmount,
    expiry: quote.expiry,
    approvalTarget: quote.approvalTarget ?? null,
    settlementAddress: quote.settlementAddress ?? null,
    transaction: quote.tx
      ? {
          to: quote.tx.to,
          valueBaseUnits: quote.tx.value,
          data: quote.tx.data ?? null,
        }
      : null,
    providerWarnings: quote.warnings,
  };
}
