# Intent-to-RFQ Quote Explorer — Submission notes

## Delivery status

The implementation and documentation are ready for code review in [YXZ252426/Rave-assignment](https://github.com/YXZ252426/Rave-assignment). The author has confirmed that the tool runs successfully in their environment and authorized publication. The author will attach the video separately. The [first hosted verification](https://github.com/YXZ252426/Rave-assignment/actions/runs/37291242441) passed for commit `a02af85`; subsequent runs are listed in [GitHub Actions](https://github.com/YXZ252426/Rave-assignment/actions).

**Access evidence:** captured live quotes succeeded earlier on both chains. A later anonymous check returned HTTP 403 in the development environment; the author subsequently reported successful operation in their own environment. That confirmation is user-reported, not an additional captured API response. See the [readiness record](docs/submission-readiness.md).

| Deliverable                                   | Location / status                                                         |
| --------------------------------------------- | ------------------------------------------------------------------------- |
| Source, examples, lockfile and tests          | [GitHub source](https://github.com/YXZ252426/Rave-assignment)             |
| Setup, commands, API behavior and limitations | [README](README.md)                                                       |
| AI usage disclosure                           | [AI_USAGE.md](AI_USAGE.md)                                                |
| Real two-chain quote evidence                 | [Live verification](docs/live-verification.md)                            |
| Clean installation and offline verification   | [Local verification](docs/local-verification.md)                          |
| GitHub repository URL                         | [YXZ252426/Rave-assignment](https://github.com/YXZ252426/Rave-assignment) |
| Screenshot or short demo video                | To be recorded and attached by the author                                 |

## Short explanation: LI.FI intent model

An intent specifies the result a user wants instead of the execution steps. LI.FI Intents provides an order server and solver network that match requested outcomes to available solver quotes. The simplified input here expresses the sell chain/token/amount, desired buy chain/token, funding address, and recipient. It is not LI.FI's real order schema or a signed order. The explorer queries LI.FI's public chain catalog as a separate bonus; it does not create, fund, or settle LI.FI orders. See the [protocol explanation and sources](docs/api-integration.md).

## Short explanation: intent-to-RFQ mapping

`LiFiIntentAdapter` validates the complete input, resolves allowlisted tokens, preserves the recipient, and converts human-unit amounts to exact integer strings. `BebopClient` sends an exact-input GET request to `https://api.bebop.xyz/pmm/{network}/v3/quote`.

| Input / policy         | Normalized request and Bebop mapping                                        |
| ---------------------- | --------------------------------------------------------------------------- |
| `fromChain`, `toChain` | Both must match; `1` selects `ethereum`, `8453` selects `base`              |
| `fromToken`            | Local token address → `sell_tokens`                                         |
| `toToken`              | Local token address → `buy_tokens`                                          |
| `amountIn`             | Sell-token decimals → exact `sell_amounts`; 100.25 USDC becomes `100250000` |
| `userAddress`          | Normalized taker → `taker_address`                                          |
| `receiverAddress`      | Normalized recipient → `receiver_address`, even when different from taker   |
| Approval mode          | `approval_type=Standard`; inspection only                                   |

No `buy_amounts` is sent, and cross-chain requests fail locally. Token amounts and effective rates use integer/rational arithmetic. No float conversion is used for token quantities.

## Short explanation: Bebop response fields

| Provider field                             | Meaning and displayed result                                                                                      |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `sellTokens[address].amount` / `.decimals` | Exact sell quantity; checked against the normalized request and local decimals                                    |
| `buyTokens[address].amount` / `.decimals`  | Exact quoted buy quantity; formatted into human units                                                             |
| Computed effective price                   | Buy human units divided by sell human units; exact fraction retained in JSON, display rounded down to 18 decimals |
| `expiry`                                   | Absolute Unix expiry; UTC, remaining seconds and expired flag displayed                                           |
| `approvalTarget`                           | Provider-designated spender for token allowance                                                                   |
| `settlementAddress`                        | Provider-designated settlement address, kept separate from the other targets                                      |
| `tx.to`                                    | Transaction call target                                                                                           |
| `tx.value`                                 | Native value attached to the call, displayed in wei and ETH; not the gas fee                                      |
| `tx.data`                                  | Validated for hexadecimal byte structure; only calldata presence is exposed in reports                            |
| `quoteId`, `requestId`, `warnings`         | Trace identifiers and provider warnings included in inspection                                                    |

Missing transaction fields are explicit. Calldata presence does not establish execution readiness: balances, allowance, gas, bytecode, and transaction simulation remain unverified. Saved reports preserve historical expiry. No signing, approval submission, broadcast, or settlement is implemented.

## Requirement checklist

| Requirement                                                   | Evidence                                                                                   |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Seven-field simplified intent                                 | [Input validation](src/domain/validation.ts), [example](examples/ethereum-usdc-weth.json)  |
| At least two chains and a small token list                    | Ethereum/Base; USDC/WETH; [registry](src/config/tokens.ts)                                 |
| Intent adapter                                                | [LiFiIntentAdapter](src/adapters/lifi-intent-adapter.ts)                                   |
| Clean Bebop client and required inspection fields             | [Client](src/clients/bebop-client.ts), [inspector](src/analysis/quote-inspector.ts)        |
| Invalid input, unsupported route, API and rate-limit failures | [Errors and HTTP transport](docs/reliability.md)                                           |
| Setup, API explanation, flow, limits and AI notes             | [README](README.md), [AI disclosure](AI_USAGE.md)                                          |
| LI.FI public endpoint bonus                                   | Live `GET /chains/supported`; [dated catalog](docs/evidence/g4-discovery-cli.json)         |
| Multiple trade sizes and analysis bonus                       | Sequential 1–5 sizes; [comparison behavior and evidence](docs/discovery-and-comparison.md) |
| Mocked tests and startup bonus                                | `npm run check`; after `npm ci`, `npm start -- quote --intent <file>` builds and runs      |
| Approval risk and execution assumptions bonus                 | [Lifecycle boundary](docs/api-integration.md#lifecycle-boundary)                           |

The implementation is a CLI. Docker, a frontend, native ETH, USDT, dynamic token discovery, raw-calldata export, and cross-chain execution are outside the delivered scope. Existing USDC-to-WETH live evidence does not guarantee every supported direction/size has current liquidity.

## Reviewer walkthrough

Use Node 24.5+ within the 24.x line and run from the repository root:

```bash
npm ci
npm run check
npm run demo
npm start -- normalize --intent examples/ethereum-usdc-weth.json
npm start -- quote --intent examples/ethereum-usdc-weth.json
npm start -- quote --intent examples/base-usdc-weth.json --json
npm start -- chains --provider lifi
npm start -- compare --intent examples/base-usdc-weth.json --amounts 100,500,1000
```

The first three commands establish installation, offline checks, and an explicitly MOCK example. Live commands depend on provider availability; they never silently fall back to mocks. Add `--json` and use `npm --silent start` for machine-readable output. See the README for optional Bebop credentials, retry behavior and exit codes.

## Remaining author handoff

- Record the implemented CLI, attach the screenshot or video, and add its path or URL here. Include input, live required fields on both chains, and a local validation failure; label any mock example and historical quote expiry.
- Include the repository URL and AI usage notes with the recording when sending the final assignment submission.
