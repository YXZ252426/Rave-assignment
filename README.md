# Intent-to-RFQ Quote Explorer

A read-only TypeScript CLI that normalizes a simplified swap intent, requests a Bebop RFQ quote, and explains its pricing, expiry, and transaction fields.

**Implemented: G1 intent normalization and G2 Bebop quote inspection.** Real quotes have succeeded on Ethereum and Base; see [dated evidence](docs/live-verification.md). The offline `normalize` command remains available for inspecting inputs.

## Setup and run

Use **Node.js 24.5+ within the 24.x line** and npm. If you use nvm, run `nvm install` and `nvm use` in this directory.

```bash
npm ci
npm start -- quote --intent examples/ethereum-usdc-weth.json
npm start -- quote --intent examples/base-usdc-weth.json --json
npm start -- normalize --intent examples/ethereum-usdc-weth.json
npm start -- normalize --intent examples/base-usdc-weth.json --json
npm run check
```

`npm start` builds the TypeScript source before running the CLI. To pipe JSON without npm's lifecycle banners, use:

```bash
npm --silent start -- normalize --intent examples/base-usdc-weth.json --json
```

After `npm run build`, you can also run `node --use-env-proxy dist/cli.js quote --intent <file> --json`. Use `npm start -- --help` for available commands. Normalization needs no configuration. Quotes can be requested without an API key; anonymous access is restricted by Bebop and may not work in every environment.

## API configuration

An optional `BEBOP_API_KEY` can be provided in your shell environment or in a local `.env` file based on `.env.example`. Process environment values take precedence, including an explicitly empty value for anonymous access. Only this key is read from `.env`; its contents are not applied to the global process environment or printed.

`npm start` enables Node's built-in environment proxy support. If your network uses a proxy, export its existing `HTTP_PROXY`, `HTTPS_PROXY`, and `NO_PROXY` settings in your shell before startup. The CLI does not choose a proxy or load proxy settings from `.env`.

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

These are local normalization allowlists. Both USDC-to-WETH routes produced real quotes during G2 verification; token support alone never guarantees current liquidity. Registry provenance, earlier access failures, and the working request mapping are recorded in [integration notes](docs/api-integration.md).

## Data flow and output

```text
Intent JSON file
  -> CLI file loading
  -> LiFiIntentAdapter: validate fields, chain, tokens, accounts, and amount
  -> NormalizedQuoteRequest
  -> BebopClient: exact-input GET /pmm/{network}/v3/quote
  -> response validation and request consistency checks
  -> QuoteInspector: exact rate, expiry, transaction completeness, summary
  -> human-readable text or JSON
```

The simplified intent expresses the user's desired swap. It is inspired by LI.FI Intents but is **not** the real LI.FI order-server schema or a signed order. The adapter converts it locally into an RFQ request; there is no LI.FI HTTP call in this path. An RFQ asks the liquidity source for a concrete quote. Bebop returns quoted amounts, validity, and transaction data that could be used for execution subject to the quote's conditions. This tool stops at inspection.

`normalize` stops at the internal request and makes no HTTP calls. Its output includes chain/network, token definitions, sell amount in base units, taker, and receiver.

`quote` displays:

| Field                       | Meaning                                                                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Sell and buy tokens/amounts | Verified token addresses/decimals, exact base-unit strings, and human-unit values                                                           |
| Effective price             | Buy human units / sell human units, with explicit units; 18 decimal places rounded down; JSON preserves the exact numerator and denominator |
| Expiry                      | Provider Unix timestamp, UTC time, remaining seconds, and expired flag evaluated at inspection time                                         |
| Approval target             | API-provided spender address; `null` / `not provided` when absent                                                                           |
| Settlement address          | API-provided settlement address, displayed independently                                                                                    |
| Transaction target          | `tx.to`, displayed independently                                                                                                            |
| Transaction value           | `tx.value` normalized to wei and ETH; this is attached native currency, not the gas fee                                                     |
| Calldata present            | Whether validated `tx.data` contains nonempty, even-length hexadecimal bytes                                                                |
| Analysis                    | Rate, validity, data completeness, provider warnings, and unverified execution assumptions                                                  |

JSON also includes provider, chain, quote/request IDs, taker/receiver, retrieval/inspection timestamps, `provenance`, and warnings. The report omits raw calldata. `quote` always uses the live client; it never falls back to test fixtures. Missing transaction data is explicit, and saved reports retain their original expiry rather than becoming new quotes. Separate network fees are excluded from the rate calculation.

An approval permits the designated spender to transfer tokens within its allowance. The tool displays the API's target but does not verify its bytecode or submit approval. Calldata presence does not establish sufficient balance, allowance, gas, contract safety, or successful execution.

Success goes to stdout and errors to stderr. With `--json`, errors contain `code`, `message`, and optional `field` / `httpStatus`. Exit codes are `0` for a displayed result/help, `2` for invalid input or unsupported routes, and `1` for provider or runtime failures. An expired or incomplete quote can still be displayed with exit code `0` and explicit warnings; this never asserts execution readiness.

The current client makes one GET with a 10-second deadline covering headers and body. It handles HTTP 401, 403, 429, other HTTP errors, transport failures, and invalid responses. It never retries automatically. HTTP 403 is reported as access denial rather than assumed to mean a missing API key.

## Checks and limitations

`npm run check` checks formatting, type-checks source and tests, builds the CLI, and runs offline Vitest tests. Coverage includes exact amounts, route validation, distinct receivers, query parameters, response identity checks, HTTP failures, request/body deadlines, rates, expiry, and text/JSON CLI output. Test fixtures are [explicitly synthetic](tests/fixtures/bebop/README.md); default checks require no network or credentials. `npm test` builds before testing; `npm run format` applies formatting.

Supported assets remain USDC and WETH on Ethereum and Base. Native ETH, USDT, cross-chain routes, automatic retries, `Retry-After` handling, detailed no-liquidity classification, an offline demo command, CI, LI.FI discovery, and size comparisons remain future work. Raw-response export is also deferred. Anonymous pricing, access, and quote availability may change. See [the five-goal plan](DEVELOPMENT_PLAN.md).

The project never requests private keys, signs messages or transactions, submits approvals, broadcasts transactions, or settles trades.

See [AI usage notes](AI_USAGE.md) for the development workflow and verification record.
