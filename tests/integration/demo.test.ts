import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { runCli } from '../../src/cli-app.js';

describe('explicit offline demo', () => {
  it('does not read credentials or call the provider', async () => {
    const stdout = vi.fn();
    const stderr = vi.fn();
    const provider = { getQuote: vi.fn() };
    const env = new Proxy(
      {},
      {
        get() {
          throw new Error('Unexpected credential access');
        },
      },
    );
    expect(
      await runCli(['demo', '--json'], { stdout, stderr, provider, env }),
    ).toBe(0);
    expect(provider.getQuote).not.toHaveBeenCalled();
    expect(stderr).not.toHaveBeenCalled();
    const report = JSON.parse(stdout.mock.calls[0]![0]);
    expect(report.provenance).toBe('mock');
    expect(report.expiry.expired).toBe(true);
    expect(report.warnings).toContain('mock_quote');
    expect(report.demo.note).toContain('OFFLINE MOCK');
  });
  it('is reproducible from an unrelated working directory without fixtures on disk', () => {
    const args = [
      '--import',
      resolve('tests/helpers/no-network.mjs'),
      resolve('dist/cli.js'),
      'demo',
      '--json',
    ];
    const first = spawnSync(process.execPath, args, {
      cwd: '/tmp',
      encoding: 'utf8',
      timeout: 5000,
    });
    const second = spawnSync(process.execPath, args, {
      cwd: '/tmp',
      encoding: 'utf8',
      timeout: 5000,
    });
    expect(first.status).toBe(0);
    expect(first.stderr).toBe('');
    expect(second.stdout).toBe(first.stdout);
    expect(JSON.parse(first.stdout).provenance).toBe('mock');
  });
  it('labels human output as an expired synthetic example', async () => {
    const stdout = vi.fn();
    expect(await runCli(['demo'], { stdout })).toBe(0);
    expect(stdout.mock.calls[0]![0]).toContain('OFFLINE MOCK');
    expect(stdout.mock.calls[0]![0]).toContain('EXPIRED');
    expect(stdout.mock.calls[0]![0]).toContain(
      'Synthetic example; not a live quote.',
    );
  });
});
