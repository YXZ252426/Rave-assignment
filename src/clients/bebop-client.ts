import { ExplorerError } from '../domain/errors.js';
import type {
  NormalizedQuote,
  NormalizedQuoteRequest,
  QuoteProvenance,
} from '../domain/types.js';
import { JsonHttpClient, type HttpOptions } from './http.js';
import { checkBebopError } from './bebop-errors.js';
import { normalizeBebopQuote } from './bebop-schema.js';

export type { FetchLike } from './http.js';
export interface QuoteProvider {
  getQuote(
    request: NormalizedQuoteRequest,
    signal?: AbortSignal,
  ): Promise<NormalizedQuote>;
}
interface BebopClientOptions extends HttpOptions {
  apiKey?: string;
  provenance?: QuoteProvenance;
}

export function buildQuoteUrl(request: NormalizedQuoteRequest): URL {
  const url = new URL(`https://api.bebop.xyz/pmm/${request.network}/v3/quote`);
  url.search = new URLSearchParams({
    sell_tokens: request.sellToken.address,
    buy_tokens: request.buyToken.address,
    sell_amounts: request.sellAmountBaseUnits,
    taker_address: request.takerAddress,
    receiver_address: request.receiverAddress,
    approval_type: 'Standard',
  }).toString();
  return url;
}

export class BebopClient implements QuoteProvider {
  private readonly http: JsonHttpClient;
  private readonly now: () => number;
  private readonly apiKey: string | undefined;
  private readonly provenance: QuoteProvenance;

  constructor(options: BebopClientOptions = {}) {
    this.http = new JsonHttpClient(options);
    this.now = options.now ?? Date.now;
    this.apiKey = options.apiKey?.trim() || undefined;
    this.provenance = options.provenance ?? 'live';
    if (this.apiKey && /[^\x21-\x7e]/.test(this.apiKey))
      throw new ExplorerError(
        'INVALID_INPUT',
        'API key must contain printable non-space ASCII characters.',
        'BEBOP_API_KEY',
      );
  }

  async getQuote(
    request: NormalizedQuoteRequest,
    signal?: AbortSignal,
  ): Promise<NormalizedQuote> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;
    return this.http.get(buildQuoteUrl(request), {
      headers,
      ...(signal ? { signal } : {}),
      parse: (body) => {
        checkBebopError(body);
        return normalizeBebopQuote(
          body,
          request,
          new Date(this.now()).toISOString(),
          this.provenance,
        );
      },
    });
  }
}
