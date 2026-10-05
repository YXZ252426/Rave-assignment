# Intent-to-RFQ Quote Explorer

A read-only TypeScript CLI that turns the assignment's simplified swap intent into an exact, chain-specific quote request.

**Current milestone: G1 — intent input and normalization.** Live Bebop quoting is the next milestone. The current `normalize` command makes no network calls and does not produce a price, quote, or executable transaction.

## Setup and run

Use **Node.js 24.x** and npm. If you use nvm, run `nvm install` and `nvm use` in this directory.

```bash
npm ci
npm start -- normalize --intent examples/ethereum-usdc-weth.json
npm start -- normalize --intent examples/base-usdc-weth.json --json
npm run check
```

`npm start` builds the TypeScript source before running the CLI. To pipe JSON without npm's lifecycle banners, use:

```bash
npm --silent start -- normalize --intent examples/base-usdc-weth.json --json
```

After `npm run build`, you can also run `node dist/cli.js normalize --intent <file> --json`. Use `npm start -- --help` for available commands. No environment variables, wallet connection, or credentials are needed for G1.

## Intent input

```json
{
  "fromChain": 1,
  "toChain": 1,
  "fromToken": "USDC",
  "toToken": "WETH",
  "amountIn": "100.25",
  "userAddress": "0x5Bad996643a924De21b6b2875c85C33F3c5bBcB6",
  "receiverAddress": "0x5Bad996643a924De21b6b2875c85C33F3c5bBcB6"
}
```

The example address comes from [Bebop's public Quickstart](https://docs.bebop.xyz/rfq-api/quickstart). It is only sample input; this project does not own it or establish its balance or allowance. You may use your own public addresses. The receiver can differ from the user.

| Field                            | Accepted input                                                                                      |
| -------------------------------- | --------------------------------------------------------------------------------------------------- |
| `fromChain`, `toChain`           | Integer chain IDs: Ethereum `1`, Base `8453`; both must match                                       |
| `fromToken`, `toToken`           | `USDC` or `WETH` (case-insensitive), or their allowlisted address on that chain; tokens must differ |
| `amountIn`                       | Positive human-unit decimal **string**, such as `"100.25"`; never a JSON number                     |
| `userAddress`, `receiverAddress` | Nonzero 20-byte EVM addresses; mixed-case addresses must have a valid checksum                      |

All seven fields are required; additional fields are rejected. Lowercase and uppercase address bodies are accepted and normalized to checksum form. Amounts reject exponents, signs, surrounding spaces, leading zeros, missing integer/fraction digits, and precision beyond the sell token's decimals—even extra zero digits. The converted amount must fit uint256.

For USDC (6 decimals), `"100.25"` becomes `"100250000"`. WETH has 18 decimals. Amount conversion uses `bigint`; serialized amounts are decimal strings, preserving values larger than JavaScript's safe integer range.

## Supported assets

| Chain        | Token | Decimals | Address                                      |
| ------------ | ----- | -------- | -------------------------------------------- |
| Ethereum (1) | USDC  | 6        | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` |
| Ethereum (1) | WETH  | 18       | `0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2` |
| Base (8453)  | USDC  | 6        | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| Base (8453)  | WETH  | 18       | `0x4200000000000000000000000000000000000006` |

These are local normalization allowlists. They do not establish current Bebop liquidity. Registry provenance and the blocked provider-access probe are recorded in [integration notes](docs/api-integration.md).

## Data flow and output

```text
Intent JSON file
  -> CLI file loading
  -> LiFiIntentAdapter: validate fields, chain, tokens, accounts, and amount
  -> NormalizedQuoteRequest
  -> human-readable text or JSON
```

The output contains `chainId`, Bebop `network`, `sellToken`, `buyToken`, `sellAmountBaseUnits`, `takerAddress`, and `receiverAddress`. Each token includes its address, symbol, decimals, and chain ID. The adapter is pure and independent of HTTP and terminal rendering.

The simplified intent describes the desired swap. It is inspired by LI.FI Intents but is **not** the real LI.FI order-server schema or a signed order. G2 will map the normalized request into a Bebop RFQ (request for quote) and inspect the returned price, expiry, and transaction fields. The current release does not call LI.FI or contain a Bebop client.

Success goes to stdout; errors go to stderr. With `--json`, errors have an `error` object containing `code`, `message`, and optional `field`. Exit codes are `0` for successful normalization/help, `2` for invalid input or unsupported routes, and `1` for an unexpected runtime failure.

## Checks and limitations

`npm run check` checks formatting, type-checks source and tests, builds the CLI, and runs offline Vitest tests. Tests cover exact precision and uint256 boundaries, both chain examples, required fields, cross-chain and wrong-token rejection, separate receivers, and the compiled command's output and exit codes. `npm test` also builds before testing. `npm run format` applies formatting.

G1 supports USDC and WETH only. Native ETH, USDT, cross-chain routes, real quotes, retry handling, LI.FI discovery, and size comparisons are not implemented yet. Bebop requests from this environment currently encounter Cloudflare access denial; no successful live quote has been recorded. See [the five-goal plan](DEVELOPMENT_PLAN.md).

The project never requests private keys, signs messages or transactions, submits approvals, broadcasts transactions, or settles trades.

See [AI usage notes](AI_USAGE.md) for the development workflow and verification record.
