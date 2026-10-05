import { getAddress, isAddress, zeroAddress } from 'viem';
import { z } from 'zod';
import { ExplorerError } from './errors.js';

export const intentSchema = z.strictObject({
  fromChain: z.number().int().positive(),
  toChain: z.number().int().positive(),
  fromToken: z.string().min(1).max(42),
  toToken: z.string().min(1).max(42),
  amountIn: z.string().min(1).max(334),
  userAddress: z.string(),
  receiverAddress: z.string(),
});

export type SimplifiedIntent = z.infer<typeof intentSchema>;

export function parseIntent(input: unknown): SimplifiedIntent {
  const result = intentSchema.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0];
    const field = issue?.path.join('.') || 'intent';
    const message =
      issue?.code === 'unrecognized_keys'
        ? 'Only the seven documented intent fields are accepted.'
        : (issue?.message ?? 'Expected a simplified intent object.');
    throw new ExplorerError('INVALID_INPUT', message, field);
  }
  return result.data;
}

export function normalizeAddress(value: string, field: string) {
  // Accept unchecksummed lower/uppercase input; verify mixed-case EIP-55 input.
  const body = value.slice(2);
  const uniformCase =
    body === body.toLowerCase() || body === body.toUpperCase();
  if (!isAddress(value, { strict: !uniformCase })) {
    throw new ExplorerError(
      'INVALID_INPUT',
      'Expected a 20-byte EVM address with a valid checksum when mixed-case.',
      field,
    );
  }
  const address = getAddress(value);
  if (address === zeroAddress) {
    throw new ExplorerError(
      'INVALID_INPUT',
      'The zero address is not allowed.',
      field,
    );
  }
  return address;
}
