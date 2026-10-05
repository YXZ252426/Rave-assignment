import { readFileSync } from 'node:fs';
import { LiFiIntentAdapter } from '../../src/adapters/lifi-intent-adapter.js';

export const NOW = Date.parse('2026-10-05T02:50:00Z');
export function intentFor(network: 'ethereum' | 'base' = 'ethereum') {
  return JSON.parse(
    readFileSync(`examples/${network}-usdc-weth.json`, 'utf8'),
  ) as Record<string, unknown>;
}
export function requestFor(network: 'ethereum' | 'base' = 'ethereum') {
  return new LiFiIntentAdapter().normalize(intentFor(network));
}
export function fixtureFor(network: 'ethereum' | 'base' = 'ethereum') {
  return JSON.parse(
    readFileSync(`tests/fixtures/bebop/${network}.json`, 'utf8'),
  ) as Record<string, unknown>;
}
