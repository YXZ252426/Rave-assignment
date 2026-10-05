import { ExplorerError } from '../domain/errors.js';
import type {
  NormalizedQuote,
  NormalizedQuoteRequest,
  QuoteProvenance,
} from '../domain/types.js';
import { normalizeBebopQuote } from './bebop-schema.js';

export type FetchLike = (url: URL, init: RequestInit) => Promise<Response>;
export interface QuoteProvider {
  getQuote(request: NormalizedQuoteRequest): Promise<NormalizedQuote>;
}
interface BebopClientOptions {
  fetch?: FetchLike;
  now?: () => number;
  apiKey?: string;
  timeoutMs?: number;
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
  private readonly fetch: FetchLike;
  private readonly now: () => number;
  private readonly timeoutMs: number;
  private readonly apiKey: string | undefined;
  private readonly provenance: QuoteProvenance;

  constructor(options: BebopClientOptions = {}) {
    this.fetch = options.fetch ?? globalThis.fetch;
    this.now = options.now ?? Date.now;
    this.timeoutMs = options.timeoutMs ?? 10000;
    this.apiKey = options.apiKey?.trim() || undefined;
    this.provenance = options.provenance ?? 'live';
    if (
      !Number.isSafeInteger(this.timeoutMs) ||
      this.timeoutMs <= 0 ||
      this.timeoutMs > 30000
    )
      throw new Error('Invalid request timeout.');
    if (this.apiKey && /[\r\n]/.test(this.apiKey))
      throw new ExplorerError(
        'INVALID_INPUT',
        'API key must not contain line breaks.',
        'BEBOP_API_KEY',
      );
  }

  async getQuote(request: NormalizedQuoteRequest): Promise<NormalizedQuote> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;
    try {
      const response = await this.fetch(buildQuoteUrl(request), {
        method: 'GET',
        headers,
        signal: controller.signal,
        redirect: 'error',
      });
      if (!response.ok) {
        // Do not print untrusted error bodies or infer authentication from a 403.
        await response.body?.cancel();
        if (response.status === 401)
          throw new ExplorerError(
            'UPSTREAM_AUTH_ERROR',
            'Bebop rejected authentication (HTTP 401). Check BEBOP_API_KEY.',
            undefined,
            401,
          );
        if (response.status === 403)
          throw new ExplorerError(
            'UPSTREAM_ACCESS_DENIED',
            'Bebop access denied (HTTP 403). This may be an edge/access-policy rejection; credentials are not confirmed as the cause.',
            undefined,
            403,
          );
        if (response.status === 429)
          throw new ExplorerError(
            'RATE_LIMITED',
            'Bebop rate limit reached (HTTP 429). No automatic retry was attempted.',
            undefined,
            429,
          );
        throw new ExplorerError(
          'UPSTREAM_FAILURE',
          `Bebop request failed (HTTP ${response.status}).`,
          undefined,
          response.status,
        );
      }
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        if (controller.signal.aborted)
          throw new ExplorerError(
            'UPSTREAM_TIMEOUT',
            'Bebop request exceeded its deadline.',
          );
        throw new ExplorerError(
          'INVALID_UPSTREAM_RESPONSE',
          'Bebop returned a response that is not valid JSON.',
        );
      }
      if (
        body &&
        typeof body === 'object' &&
        ('error' in body || ('status' in body && body.status !== 'SIG_SUCCESS'))
      ) {
        throw new ExplorerError(
          'UPSTREAM_FAILURE',
          'Bebop returned a provider error or a non-success quote status.',
        );
      }
      return normalizeBebopQuote(
        body,
        request,
        new Date(this.now()).toISOString(),
        this.provenance,
      );
    } catch (error) {
      if (error instanceof ExplorerError) throw error;
      if (controller.signal.aborted)
        throw new ExplorerError(
          'UPSTREAM_TIMEOUT',
          'Bebop request exceeded its deadline.',
        );
      throw new ExplorerError(
        'UPSTREAM_FAILURE',
        'Could not reach Bebop. Check network access and proxy configuration.',
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
