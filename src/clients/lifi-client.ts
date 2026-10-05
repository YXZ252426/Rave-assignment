import { z } from 'zod';
import { CHAINS } from '../config/chains.js';
import { ExplorerError } from '../domain/errors.js';
import type { QuoteProvenance } from '../domain/types.js';
import { JsonHttpClient, type HttpOptions } from './http.js';

const catalogSchema = z
  .array(
    z
      .object({
        id: z.number().int().nonnegative(),
        chainId: z.string().min(1).max(128),
        name: z.string().trim().min(1).max(128),
        chainType: z.string().min(1).max(32),
      })
      .refine(
        (row) =>
          row.chainType !== 'EVM' ||
          (row.chainId === row.chainId.trim() &&
            /^[1-9][0-9]*$/.test(row.chainId)),
      ),
  )
  .max(1000);

export function parseSupportedChains(body: unknown) {
  const parsed = catalogSchema.safeParse(body);
  if (!parsed.success)
    throw new ExplorerError(
      'INVALID_UPSTREAM_RESPONSE',
      'LI.FI returned a malformed supported-chain catalog.',
    );
  const identities = new Set<string>();
  const recordIds = new Set<number>();
  return parsed.data.map((row) => {
    const identity = `${row.chainType}:${row.chainId}`;
    if (identities.has(identity) || recordIds.has(row.id))
      throw new ExplorerError(
        'INVALID_UPSTREAM_RESPONSE',
        'LI.FI returned duplicate chain catalog entries.',
      );
    identities.add(identity);
    recordIds.add(row.id);
    return {
      catalogId: row.id,
      chainId: row.chainId,
      name: row.name,
      chainType: row.chainType,
      supportedByExplorer:
        row.chainType === 'EVM' &&
        Object.values(CHAINS).some(
          (chain) => String(chain.chainId) === row.chainId,
        ),
    };
  });
}

export interface ChainCatalog {
  provider: 'lifi';
  provenance: QuoteProvenance;
  retrievedAt: string;
  chains: ReturnType<typeof parseSupportedChains>;
  note: string;
}
export interface ChainCatalogProvider {
  getSupportedChains(signal?: AbortSignal): Promise<ChainCatalog>;
}
interface LiFiClientOptions extends HttpOptions {
  provenance?: QuoteProvenance;
}

export class LiFiClient implements ChainCatalogProvider {
  private readonly http: JsonHttpClient;
  private readonly now: () => number;
  private readonly provenance: QuoteProvenance;
  constructor(options: LiFiClientOptions = {}) {
    this.http = new JsonHttpClient(options);
    this.now = options.now ?? Date.now;
    this.provenance = options.provenance ?? 'live';
  }
  async getSupportedChains(signal?: AbortSignal): Promise<ChainCatalog> {
    return this.http.get(new URL('https://order.li.fi/chains/supported'), {
      ...(signal ? { signal } : {}),
      parse: (body) => ({
        provider: 'lifi',
        provenance: this.provenance,
        retrievedAt: new Date(this.now()).toISOString(),
        chains: parseSupportedChains(body),
        note: 'Explorer support indicates the local chain allowlist only. LI.FI catalog membership does not establish Bebop token-pair liquidity.',
      }),
    });
  }
}
