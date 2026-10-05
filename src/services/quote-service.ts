import { LiFiIntentAdapter } from '../adapters/lifi-intent-adapter.js';
import { inspectQuote } from '../analysis/quote-inspector.js';
import type { QuoteProvider } from '../clients/bebop-client.js';

export class QuoteService {
  constructor(
    private readonly provider: QuoteProvider,
    private readonly now: () => number = Date.now,
  ) {}

  async quote(intent: unknown) {
    const request = new LiFiIntentAdapter().normalize(intent);
    return inspectQuote(await this.provider.getQuote(request), this.now);
  }
}
