import { describe, expect, it } from 'vitest';
import { normalizeBebopQuote } from '../../src/clients/bebop-schema.js';
import { NOW, fixtureFor, requestFor } from '../helpers/bebop.js';

function parse(body: unknown) {
  return normalizeBebopQuote(
    body,
    requestFor(),
    new Date(NOW).toISOString(),
    'mock',
  );
}
describe('Bebop quote consistency', () => {
  it('preserves three independent addresses and normalizes hex value', () => {
    const body = fixtureFor();
    body.tx = { ...(body.tx as object), value: '0xde0b6b3a7640000' };
    const quote = parse(body);
    expect(quote.approvalTarget).toBe(
      '0x1111111111111111111111111111111111111111',
    );
    expect(quote.settlementAddress).toBe(
      '0x2222222222222222222222222222222222222222',
    );
    expect(quote.transaction?.to).toBe(
      '0x3333333333333333333333333333333333333333',
    );
    expect(quote.transaction?.valueBaseUnits).toBe('1000000000000000000');
  });

  it.each([
    'chainId',
    'taker',
    'receiver',
    'sellTokens',
    'buyTokens',
    'tx.from',
    'sellAmount',
    'decimals',
  ])('rejects mismatched %s', (field) => {
    const body = fixtureFor();
    if (field === 'chainId') body.chainId = 8453;
    if (field === 'taker' || field === 'receiver')
      body[field] = '0x1111111111111111111111111111111111111111';
    if (field === 'sellTokens' || field === 'buyTokens')
      body[field] = {
        '0x1111111111111111111111111111111111111111': {
          amount: '1',
          decimals: 6,
        },
      };
    if (field === 'tx.from')
      body.tx = {
        ...(body.tx as object),
        from: '0x1111111111111111111111111111111111111111',
      };
    if (field === 'sellAmount' || field === 'decimals')
      body.sellTokens = {
        [requestFor().sellToken.address]: {
          amount: field === 'sellAmount' ? '1' : '100250000',
          decimals: field === 'decimals' ? 18 : 6,
        },
      };
    expect(() => parse(body)).toThrow(
      expect.objectContaining({ code: 'INVALID_UPSTREAM_RESPONSE' }),
    );
  });

  it.each(['-1', '0', 'nope', '1e18', '1\n', (1n << 256n).toString()])(
    'rejects malformed or nonpositive amounts: %j',
    (amount) => {
      const body = fixtureFor();
      body.buyTokens = {
        [requestFor().buyToken.address]: { amount, decimals: 18 },
      };
      expect(() => parse(body)).toThrow(
        expect.objectContaining({ code: 'INVALID_UPSTREAM_RESPONSE' }),
      );
    },
  );

  it('rejects extra token entries including duplicate addresses with different casing', () => {
    const body = fixtureFor();
    body.sellTokens = {
      ...(body.sellTokens as object),
      [requestFor().sellToken.address]: { amount: '100250000', decimals: 6 },
    };
    expect(() => parse(body)).toThrow(
      expect.objectContaining({ code: 'INVALID_UPSTREAM_RESPONSE' }),
    );
  });

  it.each([null, undefined])(
    'keeps absent transaction and contract fields explicit',
    (missing) => {
      const quote = parse({
        ...fixtureFor(),
        tx: missing,
        approvalTarget: missing,
        settlementAddress: missing,
      });
      expect(quote.transaction).toBeNull();
      expect(quote.approvalTarget).toBeNull();
      expect(quote.settlementAddress).toBeNull();
    },
  );

  it.each(['0x123', 'xyz', '0x00\n'])('rejects invalid calldata %j', (data) => {
    const body = fixtureFor();
    body.tx = { ...(body.tx as object), data };
    expect(() => parse(body)).toThrow(
      expect.objectContaining({ code: 'INVALID_UPSTREAM_RESPONSE' }),
    );
  });

  it('allows unknown provider fields and preserves warning objects', () => {
    const warnings = [{ code: 'SYNTHETIC', message: 'Test only' }];
    const quote = parse({ ...fixtureFor(), newProviderField: true, warnings });
    expect(quote.providerWarnings).toEqual(warnings);
  });
});
