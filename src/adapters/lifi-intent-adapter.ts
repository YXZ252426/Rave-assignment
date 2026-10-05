import { resolveChain } from '../config/chains.js';
import { resolveToken } from '../config/tokens.js';
import { parseAmountIn } from '../domain/amounts.js';
import { ExplorerError } from '../domain/errors.js';
import type { NormalizedQuoteRequest } from '../domain/types.js';
import { normalizeAddress, parseIntent } from '../domain/validation.js';

/** Pure adapter for the assignment's simplified, LI.FI-inspired input model. */
export class LiFiIntentAdapter {
  normalize(input: unknown): NormalizedQuoteRequest {
    const intent = parseIntent(input);
    const chain = resolveChain(intent.fromChain, 'fromChain');
    resolveChain(intent.toChain, 'toChain');
    if (intent.fromChain !== intent.toChain) {
      throw new ExplorerError(
        'UNSUPPORTED_ROUTE',
        'Only same-chain quotes are supported; fromChain must equal toChain.',
        'toChain',
      );
    }
    const sellToken = resolveToken(
      chain.chainId,
      intent.fromToken,
      'fromToken',
    );
    const buyToken = resolveToken(chain.chainId, intent.toToken, 'toToken');
    if (sellToken.address === buyToken.address) {
      throw new ExplorerError(
        'UNSUPPORTED_ROUTE',
        'Sell and buy tokens must be different.',
        'toToken',
      );
    }
    return {
      chainId: chain.chainId,
      network: chain.network,
      sellToken,
      buyToken,
      sellAmountBaseUnits: parseAmountIn(intent.amountIn, sellToken.decimals),
      takerAddress: normalizeAddress(intent.userAddress, 'userAddress'),
      receiverAddress: normalizeAddress(
        intent.receiverAddress,
        'receiverAddress',
      ),
    };
  }
}
