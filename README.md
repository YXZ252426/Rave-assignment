# Intent-to-RFQ Quote Explorer

A read-only TypeScript CLI that normalizes a simplified swap intent, requests a Bebop RFQ quote, and explains its pricing, expiry, and transaction fields.

Supports USDC and WETH on Ethereum and Base, live LI.FI chain discovery, and comparisons across up to five trade sizes. Real Bebop quotes have succeeded on both chains; see [dated evidence](docs/live-verification.md).

Start with the offline example below, then request a live quote. For the assignment deliverables, short integration explanations, and remaining handoff items, see [Submission notes](SUBMISSION.md). The [GitHub repository](https://github.com/YXZ252426/Rave-assignment) has been created; code upload and the author-recorded video are pending. The [latest readiness check](docs/submission-readiness.md) records a current HTTP 403 on both anonymous quote routes, alongside the earlier successful observations.

## Setup and run

Use **Node.js 24.5+ within the 24.x line** and npm. If you use nvm, run `nvm install` and `nvm use` in this directory.

```bash
npm ci
npm run demo
npm start -- quote --intent examples/ethereum-usdc-weth.json
npm start -- quote --intent examples/base-usdc-weth.json --json
npm start -- chains --provider lifi
npm start -- compare --intent examples/base-usdc-weth.json --amounts 100,500,1000
npm start -- normalize --intent examples/ethereum-usdc-weth.json
npm start -- normalize --intent examples/base-usdc-weth.json --json
npm run check
```

Run commands from the repository root. No wallet, private key, funded account, RPC URL, or database is needed. `npm ci` requires access to the npm registry or an existing package cache; after installation, `normalize`, `demo`, and `check` run without provider access. `quote`, `compare`, and `chains` need outbound HTTPS.

`npm start` builds the TypeScript source before running the CLI. To pipe JSON without npm's lifecycle banners, use:

```bash
npm --silent start -- normalize --intent examples/base-usdc-weth.json --json
```

After `npm run build`, you can also run `node --use-env-proxy dist/cli.js quote --intent <file> --json`. Use `npm start -- --help` for available commands. Normalization needs no configuration. Quotes can be requested without an API key; anonymous access is restricted by Bebop and may not work in every environment.

## API configuration

An optional `BEBOP_API_KEY` can be provided in your shell environment or in a local `.env` file based on `.env.example`. Copy the example to `.env` and edit it locally if needed; `.env` is gitignored. Never put a wallet private key in this file. Process environment values take precedence, including an explicitly empty value for anonymous access. Only this key is read from `.env`; its contents are not applied to the global process environment or printed.

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

## Chain discovery and size comparisons

```bash
npm start -- chains --provider lifi
npm --silent start -- chains --json
npm start -- compare --intent examples/base-usdc-weth.json --amounts 100,500,1000
npm --silent start -- compare --intent examples/base-usdc-weth.json --amounts 100,500,1000 --json
```

`chains` calls LI.FI Intents' public `GET https://order.li.fi/chains/supported` endpoint without authentication. It displays chain ID, name, type, catalog ID, and whether that chain is in the explorer's local allowlist. `chainId` is the network identifier; `id` is a catalog record identifier (for example, Base returned `chainId: "8453"` and `id: 2`). Discovery is independent of Bebop and does not expand the allowlist or establish pair liquidity.

`compare` accepts **one to five unique positive decimal sizes**, in human units of the sell token. The base intent must still contain all seven valid fields, including `amountIn`; each supplied size then replaces that amount. Every size is checked before the first HTTP call. Values such as `100` and `100.0` count as duplicates. CLI whitespace around comma-separated entries is ignored.

Requests run sequentially. Output preserves input order, retrieval times, expiry, and each row's `success`, `failed`, or `skipped` status. JSON includes the full quote inspection for every successful row. Rates use buy units per sell unit; a larger output alone does not imply a better rate. Ranking compares exact ratios, includes ties, and excludes quotes expired at collection completion. Quotes with missing transaction data stay labeled; ranking does not establish execution readiness.

Partial results remain on stdout with exit code `1`; cancellation keeps collected rows and exits `130`. Authentication/access rejection, exhausted rate limits, cancellation, or an internal error skip remaining sizes. Other quote failures remain per-row results and allow later sizes to run. Each size inherits the HTTP retry budget: at most 3 attempts and 20 seconds, so five sizes can use up to 15 HTTP attempts and about 100 seconds.

These are observations at different times, exclude separate gas fees, and do not measure market price impact. See [discovery and comparison notes](docs/discovery-and-comparison.md) for the data contract and dated live results.

## Offline demo

```bash
npm run demo
npm --silent start -- demo --json
```

The demo is synthetic and deterministic. It uses a fixed historical inspection time, shows `provenance: "mock"`, and always labels the example as expired. Amounts, contract addresses, and calldata are illustrative. It needs neither network nor credentials and does not refresh expiry to make the example look executable. Live `quote` requests never invoke the demo as a fallback.

## Errors and retries

Single-command results go to stdout and command-level errors go to stderr. Comparison row failures are embedded in the report on stdout, preserving partial results. With `--json`, errors contain `code`, `message`, and optional `field`, `httpStatus`, `attempts`, and `retryAfterMs`, plus `retryable` (whether the failure category permits a later attempt; it does not mean the command is still retrying). Exit codes are `0` for help or successful command processing, `2` for invalid input or unsupported routes, `1` for provider or runtime failures, and `130` for a cancelled request (Ctrl-C). An expired or incomplete quote can still be displayed with exit code `0` and explicit warnings; this never asserts execution readiness.

The HTTP client permits at most **3 attempts**, each capped at **10 seconds**, within a **20-second total budget** covering body reads and retry waits. It retries HTTP 408, 429, 500, 502, 503, and 504, per-attempt timeouts, and selected transient connection errors. Retry delays use bounded exponential backoff with jitter.

`Retry-After` seconds and HTTP-date values are respected as minimum waits. If the wait will exhaust the remaining budget, the command returns the original failure and waiting guidance immediately; it does not retry earlier than requested. Authentication/access failures, malformed or mismatched quote data, known no-quote results, and unclassified provider errors are not retried. Responses are limited to 1 MiB, and error messages do not echo upstream bodies or credentials.

| Error                                 | Meaning                                                                                           |
| ------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `INVALID_INPUT` / `UNSUPPORTED_ROUTE` | Invalid local input or unsupported chain/token pair; no provider request                          |
| `NO_QUOTE`                            | The observed Bebop minimum-size rejection (`errorCode: 104`, `MinSize:`); try a larger trade size |
| `UPSTREAM_AUTH_ERROR`                 | HTTP 401 authentication rejection                                                                 |
| `UPSTREAM_ACCESS_DENIED`              | HTTP 403 access denial; authentication is not assumed to be the cause                             |
| `RATE_LIMITED`                        | HTTP 429; retries exhausted or required waiting would exceed the budget                           |
| `UPSTREAM_TIMEOUT`                    | Attempt/total deadline exceeded                                                                   |
| `UPSTREAM_FAILURE`                    | Other HTTP/transport errors or an unclassified provider error envelope                            |
| `INVALID_UPSTREAM_RESPONSE`           | Invalid JSON, oversized body, malformed fields, or request/quote mismatch                         |
| `REQUEST_CANCELLED`                   | Caller cancelled; pending requests/waits are stopped                                              |
| `INTERNAL_ERROR`                      | Unexpected local failure; internal exception details are not exposed                              |

The known minimum-size error was [observed live](docs/evidence/g3-provider-error.json). Other provider-specific no-liquidity codes are intentionally left unclassified until verified. See [reliability notes](docs/reliability.md) for validation scope.

## Architecture

| Responsibility                                            | Implementation                                                                                             |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Command parsing, input files, output and exit codes       | [`src/cli-app.ts`](src/cli-app.ts), [`src/presentation/text.ts`](src/presentation/text.ts)                 |
| Pure intent validation and normalization                  | [`LiFiIntentAdapter`](src/adapters/lifi-intent-adapter.ts), [`domain`](src/domain), [`config`](src/config) |
| HTTP deadlines, retries, response limits and cancellation | [`JsonHttpClient`](src/clients/http.ts)                                                                    |
| Bebop parameters, response schema and request consistency | [`BebopClient`](src/clients/bebop-client.ts), [`response validator`](src/clients/bebop-schema.ts)          |
| LI.FI public chain catalog                                | [`LiFiClient`](src/clients/lifi-client.ts)                                                                 |
| Single quote and sequential comparison orchestration      | [`QuoteService`](src/services/quote-service.ts), [`CompareService`](src/services/compare-service.ts)       |
| Exact rate, expiry, completeness and analysis             | [`QuoteInspector`](src/analysis/quote-inspector.ts)                                                        |

The adapter performs no HTTP calls. Clients validate provider data before services pass it to the inspector. Transport and clocks are injectable for deterministic tests. The analysis summary is generated from validated fields; running this AI-developed project does not call an LLM or need an AI API key.

## Checks and limitations

`npm run check` checks formatting, type-checks source and tests, builds the CLI, and runs offline Vitest tests. Coverage includes exact amounts, route validation, distinct receivers, query parameters, response identity checks, HTTP failures, request/body deadlines, rates, expiry, LI.FI catalog IDs, bounded sequential comparisons, partial results, and text/JSON CLI output. Success fixtures are [explicitly synthetic](tests/fixtures/bebop/README.md); one provider-error fixture is a dated live observation. Default checks block accidental fetches and require no network or credentials. Retry waits use simulated time. `npm test` builds before testing; `npm run format` applies formatting.

[GitHub Actions](.github/workflows/ci.yml) is configured for pushes, pull requests, and manual runs. It installs from the lockfile on Node 24, runs the offline check suite, and exercises help and the demo. It does not call Bebop or require an API key. The workflow is configured locally; a hosted run is not claimed until the repository is pushed and Actions completes.

Supported assets remain USDC and WETH on Ethereum and Base. Native ETH, USDT, cross-chain routes, broader provider-specific no-liquidity classification, and the full LI.FI order lifecycle remain outside the current scope. Raw-response export is also deferred. Anonymous pricing, access, and quote availability may change. See [the five-goal plan](DEVELOPMENT_PLAN.md).

The project never requests private keys, signs messages or transactions, submits approvals, broadcasts transactions, or settles trades.

## Documentation and delivery

- [Submission notes](SUBMISSION.md): requirement checklist, short explanations, and remaining author tasks.
- [Integration notes](docs/api-integration.md): LI.FI/Bebop roles, lifecycle boundary, exact request mapping, and research history.
- [Live verification](docs/live-verification.md): dated real quotes, including failed early access probes.
- [Discovery and comparison](docs/discovery-and-comparison.md): catalog schema, ranking, partial results, and observation limits.
- [Reliability](docs/reliability.md): retries, deadlines, cancellation, and provider errors.
- [Local delivery verification](docs/local-verification.md): clean-install checks and their scope.
- [AI usage notes](AI_USAGE.md): AI contributions and evidence; no independent human review is claimed.
- [Development plan](DEVELOPMENT_PLAN.md): five milestones and their delivery status.
