import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiFiIntentAdapter } from '../../src/adapters/lifi-intent-adapter.js';
import { TOKENS } from '../../src/config/tokens.js';
import { normalizeAddress } from '../../src/domain/validation.js';

const user = '0x5Bad996643a924De21b6b2875c85C33F3c5bBcB6';
const receiver = '0x1111111111111111111111111111111111111111';
const input = {
  fromChain: 1,
  toChain: 1,
  fromToken: 'USDC',
  toToken: 'WETH',
  amountIn: '100.25',
  userAddress: user,
  receiverAddress: receiver,
};
const adapter = new LiFiIntentAdapter();

describe('LiFiIntentAdapter', () => {
  beforeEach(() =>
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        throw new Error('Unexpected network access');
      }),
    ),
  );
  afterEach(() => {
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it.each([
    [
      'ethereum',
      1,
      '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      '100250000',
    ],
    [
      'base',
      8453,
      '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      '0x4200000000000000000000000000000000000006',
      '100000000',
    ],
  ])(
    'normalizes the checked-in %s example',
    (network, chainId, sellAddress, buyAddress, units) => {
      const example: unknown = JSON.parse(
        readFileSync(`examples/${network}-usdc-weth.json`, 'utf8'),
      );
      expect(adapter.normalize(example)).toEqual({
        chainId,
        network,
        sellToken: {
          chainId,
          address: sellAddress,
          symbol: 'USDC',
          decimals: 6,
        },
        buyToken: {
          chainId,
          address: buyAddress,
          symbol: 'WETH',
          decimals: 18,
        },
        sellAmountBaseUnits: units,
        takerAddress: user,
        receiverAddress: user,
      });
    },
  );

  it('preserves a separate receiver and leaves the input untouched', () => {
    const original = structuredClone(input);
    const result = adapter.normalize(Object.freeze({ ...input }));
    expect(result.receiverAddress).toBe(receiver);
    expect(result.takerAddress).toBe(user);
    expect(input).toEqual(original);
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  it('supports a reverse WETH-to-USDC route at full 18-decimal precision', () => {
    const result = adapter.normalize({
      ...input,
      fromToken: 'weth',
      toToken: 'usdc',
      amountIn: '1.000000000000000001',
    });
    expect(result.sellAmountBaseUnits).toBe('1000000000000000001');
    expect(result.sellToken.symbol).toBe('WETH');
    expect(result.buyToken.symbol).toBe('USDC');
  });

  it.each(TOKENS)(
    'accepts symbol/address inputs for $symbol on $chainId',
    (token) => {
      const other = token.symbol === 'USDC' ? 'WETH' : 'USDC';
      const expected = adapter.normalize({
        ...input,
        fromChain: token.chainId,
        toChain: token.chainId,
        fromToken: token.symbol,
        toToken: other,
      });
      for (const address of [
        token.address,
        token.address.toLowerCase(),
        '0x' + token.address.slice(2).toUpperCase(),
      ]) {
        expect(
          adapter.normalize({
            ...input,
            fromChain: token.chainId,
            toChain: token.chainId,
            fromToken: address,
            toToken: other,
          }),
        ).toEqual(expected);
      }
    },
  );

  it.each(Object.keys(input))('requires %s', (field) => {
    const incomplete: Record<string, unknown> = { ...input };
    delete incomplete[field];
    expect(() => adapter.normalize(incomplete)).toThrow(
      expect.objectContaining({ code: 'INVALID_INPUT', field }),
    );
  });

  it.each([
    ['cross-chain', { toChain: 8453 }, 'UNSUPPORTED_ROUTE', 'toChain'],
    [
      'unsupported source chain',
      { fromChain: 10, toChain: 10 },
      'UNSUPPORTED_ROUTE',
      'fromChain',
    ],
    [
      'unsupported target chain',
      { toChain: 10 },
      'UNSUPPORTED_ROUTE',
      'toChain',
    ],
    ['native ETH', { fromToken: 'ETH' }, 'UNSUPPORTED_ROUTE', 'fromToken'],
    ['unlisted USDT', { fromToken: 'USDT' }, 'UNSUPPORTED_ROUTE', 'fromToken'],
    ['unknown token', { toToken: receiver }, 'UNSUPPORTED_ROUTE', 'toToken'],
    [
      'wrong-chain token',
      { fromToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' },
      'UNSUPPORTED_ROUTE',
      'fromToken',
    ],
    [
      'same token by address',
      { toToken: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' },
      'UNSUPPORTED_ROUTE',
      'toToken',
    ],
    ['numeric amount', { amountIn: 100.25 }, 'INVALID_INPUT', 'amountIn'],
    ['string chain', { fromChain: '1' }, 'INVALID_INPUT', 'fromChain'],
    ['fractional chain', { fromChain: 1.5 }, 'INVALID_INPUT', 'fromChain'],
    [
      'invalid user',
      { userAddress: 'alice.eth' },
      'INVALID_INPUT',
      'userAddress',
    ],
    [
      'zero user',
      { userAddress: '0x' + '0'.repeat(40) },
      'INVALID_INPUT',
      'userAddress',
    ],
    [
      'zero receiver',
      { receiverAddress: '0x' + '0'.repeat(40) },
      'INVALID_INPUT',
      'receiverAddress',
    ],
    [
      'bad checksum',
      { userAddress: '0x5bad996643a924De21b6b2875c85C33F3c5bBcB6' },
      'INVALID_INPUT',
      'userAddress',
    ],
    ['bad token address', { fromToken: '0x123' }, 'INVALID_INPUT', 'fromToken'],
    ['extra field', { slippage: 0.01 }, 'INVALID_INPUT', 'intent'],
  ])('rejects %s before networking', (_name, overrides, code, field) => {
    expect(() => adapter.normalize({ ...input, ...overrides })).toThrow(
      expect.objectContaining({ code, field }),
    );
  });

  it.each([null, [], 'intent', 123])(
    'rejects a non-object input: %j',
    (value) => {
      expect(() => adapter.normalize(value)).toThrow(
        expect.objectContaining({ code: 'INVALID_INPUT' }),
      );
    },
  );

  it('returns canonical checksummed account addresses', () => {
    expect(normalizeAddress(user.toLowerCase(), 'userAddress')).toBe(user);
  });
});
