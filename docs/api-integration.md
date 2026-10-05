# API integration findings

Recorded on 2026-10-05. The G1 observations below are historical. G2 subsequently obtained real quotes on both chains; see [live verification](live-verification.md).

## LI.FI, RFQ, and Bebop in this project

An **intent** describes a desired outcome, such as selling a specified amount of USDC for WETH to a recipient. An **RFQ** (request for quote) asks a liquidity source to price that concrete trade. A **quote** is the returned offer: token quantities, expiry, and execution information where available. Requesting or inspecting a quote does not itself move funds.

LI.FI Intents is an order-server and solver marketplace. Its current documentation describes matching user intents against solvers' published standing quotes and inventory. This project's adapter takes inspiration from that outcome-oriented model; it does not reproduce LI.FI's matching process or assert that LI.FI routes to Bebop. See the [LI.FI introduction](https://docs.li.fi/lifi-intents/introduction).

The real LI.FI API uses structured inputs/outputs and interoperable addresses (EIP-7930). The assignment's seven fields are a deliberately smaller local schema. `LiFiIntentAdapter` normalizes them directly for Bebop. Only the independent `chains` command calls LI.FI, through `GET /chains/supported`. See the [LI.FI Quickstart](https://docs.li.fi/lifi-intents/quickstart) and [discovery implementation](discovery-and-comparison.md).

Bebop provides the downstream RFQ endpoint. This CLI sends token addresses, the exact sell quantity, taker and receiver, then inspects the returned quote and transaction fields. It is a quote consumer, not a market maker, solver, pool, or on-chain router. The request mapping follows the [Bebop quote reference](https://docs.bebop.xyz/rfq-api/api-reference/quote).

## Lifecycle boundary

| Flow                       | Sequence                                                                                                  | Implemented here                                          |
| -------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Assignment explorer        | Simplified intent → local normalization → Bebop RFQ → validated quote → inspection                        | Entire sequence                                           |
| LI.FI standard escrow flow | Quote → token approval → open/fund an order → solver delivery → verified settlement                       | Chain discovery only; no quote request or order lifecycle |
| Bebop direct wallet flow   | RFQ → inspect quote → establish required allowance → sign/broadcast the returned transaction → settlement | RFQ and inspection only                                   |

The LI.FI standard escrow sequence is documented in its [Quickstart](https://docs.li.fi/lifi-intents/quickstart); other LI.FI order types have different funding/submission details. Bebop's [Quickstart](https://docs.bebop.xyz/rfq-api/quickstart) describes the direct execution path. These are separate protocol flows, not one pipeline that this project executes.

A returned transaction payload is conditional execution data, not a completed swap. This explorer checks response structure and consistency, but does not decode or simulate the call, verify contract bytecode, inspect balances/allowances, or estimate gas. Expiry is checked against the local clock. A saved quote cannot be refreshed by editing its timestamp.

The approval target is the spender authorized to transfer sell tokens; settlement and transaction targets are separately reported provider fields. A token allowance can outlive a quote. Broad or unlimited approvals increase exposure to that spender. This application reports the addresses without requesting or submitting an approval.

## Token registry provenance

| Registry entries                              | Verification source                                                                                           |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Ethereum WETH and USDC addresses and decimals | [Uniswap mainnet token list](https://github.com/Uniswap/default-token-list/blob/main/src/tokens/mainnet.json) |
| Base WETH and USDC addresses and decimals     | [Uniswap Base token list](https://github.com/Uniswap/default-token-list/blob/main/src/tokens/base.json)       |
| Both USDC contract addresses                  | [Circle's official USDC contract list](https://developers.circle.com/stablecoins/usdc-contract-addresses)     |

The four selected entries were fetched from the raw Uniswap source at approximately 02:32:38 UTC; a minimal dated record is saved in [token verification](evidence/g1-token-verification.json). USDC uses 6 decimals and WETH uses 18 on both chains. At G1, Bebop discovery was inaccessible, so live pair availability was unverified then. G2 subsequently obtained USDC-to-WETH quotes on both chains. Dynamic Bebop token discovery is not implemented; the application uses a verified local allowlist.

## Early Bebop access probe

The [Bebop Quickstart](https://docs.bebop.xyz/rfq-api/quickstart) documents token discovery and restricted public demo access. The [quote reference](https://docs.bebop.xyz/rfq-api/api-reference/quote) documents the parameters and Bearer authorization. G2 subsequently added optional key configuration and verified anonymous quote access. The earlier failed probes do not prove that adding a key would resolve an access denial.

At approximately **2026-10-05 02:31:12 UTC**, four GET requests were issued with a 15-second timeout and no retries or credentials:

| Network  | Request                   | HTTP result | Response                                               |
| -------- | ------------------------- | ----------- | ------------------------------------------------------ |
| Ethereum | `/pmm/ethereum/v3/tokens` | 403         | HTML, Cloudflare server                                |
| Ethereum | `/pmm/ethereum/v3/quote`  | 403         | JSON Cloudflare error 1010, `browser_signature_banned` |
| Base     | `/pmm/base/v3/tokens`     | 403         | HTML, Cloudflare server                                |
| Base     | `/pmm/base/v3/quote`      | 403         | HTML, Cloudflare server                                |

Each quote probe requested 100 USDC to WETH (`sell_amounts=100000000`), with `approval_type=Standard`. Taker and receiver were the public Quickstart example address `0x5Bad996643a924De21b6b2875c85C33F3c5bBcB6`. Exact public URLs, timestamps, status codes, and concise outcomes are saved in [probe evidence](evidence/g1-bebop-access.json).

The Ethereum JSON response explicitly classified the failure as edge access denial. No attempt was made to bypass the block or retry it. These are failed requests, not quotes, and do not establish missing credentials or unavailable liquidity. No executable payload was received or submitted.

## Historical G1 implication

At the G1 checkpoint, normalization worked independently of network access and live quoting remained incomplete. G2 later satisfied the two-chain live acceptance requirement. Any future provider-specific schema findings must come from official documentation and actual responses; these 403 responses are not a quote schema sample.

## G2 outcome and implemented mapping

The Node client obtained real quotes on both chains, using the existing outbound proxy. G2 live acceptance is now supported by [dated CLI evidence](live-verification.md). The G1 failures remain in the record; a successful current path does not explain every earlier failure.

| Normalized request    | Bebop query               |
| --------------------- | ------------------------- |
| `network`             | `/pmm/{network}/v3/quote` |
| `sellToken.address`   | `sell_tokens`             |
| `buyToken.address`    | `buy_tokens`              |
| `sellAmountBaseUnits` | `sell_amounts`            |
| `takerAddress`        | `taker_address`           |
| `receiverAddress`     | `receiver_address`        |
| Direct approval mode  | `approval_type=Standard`  |

Only exact-input requests are made; `buy_amounts` is not sent. API keys are optional and appear only in the Bearer header. Unknown response fields are tolerated; consumed fields are runtime-validated. Token-map keys are matched without case sensitivity, while chain, amounts, accounts, and decimals must match the request.

The G2 transport initially made one GET with a 10-second deadline covering headers and body. It identifies 401, 403, and 429, reports other HTTP/transport failures, and rejects malformed or inconsistent success responses. Provider error envelopes and non-success statuses fail explicitly. G3 now implements bounded retries and `Retry-After` handling, and classifies the observed minimum-size rejection. See [reliability notes](reliability.md); additional provider-specific errors remain unclassified until verified.
