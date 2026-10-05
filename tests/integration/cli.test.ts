import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const temporary = mkdtempSync(join(tmpdir(), 'intent-rfq-test-'));
afterAll(() => rmSync(temporary, { recursive: true, force: true }));
function run(...args: string[]) {
  return spawnSync(process.execPath, ['dist/cli.js', ...args], {
    encoding: 'utf8',
    timeout: 10000,
  });
}

describe('compiled normalize CLI', () => {
  it.each(['ethereum', 'base'])(
    'prints machine-readable %s output',
    (network) => {
      const result = run(
        'normalize',
        '--intent',
        `examples/${network}-usdc-weth.json`,
        '--json',
      );
      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
      const body = JSON.parse(result.stdout);
      expect(body.network).toBe(network);
      expect(typeof body.sellAmountBaseUnits).toBe('string');
      expect(body.receiverAddress).toBe(body.takerAddress);
    },
  );

  it('shows useful human output with explicit units', () => {
    const result = run(
      'normalize',
      '--intent',
      'examples/ethereum-usdc-weth.json',
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('offline; no quote requested');
    expect(result.stdout).toContain('100.25 USDC');
    expect(result.stdout).toContain('base units): 100250000');
  });

  it('shows help without an error', () => {
    const result = run('--help');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('normalize');
    expect(result.stderr).toBe('');
  });

  it.each(['missing', 'malformed', 'unsupported'])(
    'reports %s input to stderr with exit code 2',
    (kind) => {
      const file = join(temporary, `${kind}.json`);
      if (kind === 'malformed') writeFileSync(file, '{ not json');
      if (kind === 'unsupported')
        writeFileSync(
          file,
          JSON.stringify({
            fromChain: 1,
            toChain: 8453,
            fromToken: 'USDC',
            toToken: 'WETH',
            amountIn: '1',
            userAddress: '0x1111111111111111111111111111111111111111',
            receiverAddress: '0x1111111111111111111111111111111111111111',
          }),
        );
      const result = run('normalize', '--intent', file, '--json');
      expect(result.status).toBe(2);
      expect(result.stdout).toBe('');
      expect(JSON.parse(result.stderr).error.code).toBe(
        kind === 'unsupported' ? 'UNSUPPORTED_ROUTE' : 'INVALID_INPUT',
      );
    },
  );

  it('reports a missing required option', () => {
    const result = run('normalize', '--json');
    expect(result.status).toBe(2);
    expect(result.stdout).toBe('');
    expect(JSON.parse(result.stderr).error.code).toBe('INVALID_INPUT');
  });
});
