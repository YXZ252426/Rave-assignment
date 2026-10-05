# API integration findings

Recorded on 2026-10-05. The G1 observations below are historical. G2 subsequently obtained real quotes on both chains; see [live verification](live-verification.md).

## Token registry provenance

| Registry entries                              | Verification source                                                                                           |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Ethereum WETH and USDC addresses and decimals | [Uniswap mainnet token list](https://github.com/Uniswap/default-token-list/blob/main/src/tokens/mainnet.json) |
| Base WETH and USDC addresses and decimals     | [Uniswap Base token list](https://github.com/Uniswap/default-token-list/blob/main/src/tokens/base.json)       |
| Both USDC contract addresses                  | [Circle's official USDC contract list](https://developers.circle.com/stablecoins/usdc-contract-addresses)     |

The four selected entries were fetched from the raw Uniswap source at approximately 02:32:38 UTC; a minimal dated record is saved in [token verification](evidence/g1-token-verification.json). USDC uses 6 decimals and WETH uses 18 on both chains. Bebop discovery was inaccessible, so provider listing and live pair availability remain unverified.

## Early Bebop access probe

The [Bebop Quickstart](https://docs.bebop.xyz/rfq-api/quickstart) documents token discovery and restricted public demo access. The [quote reference](https://docs.bebop.xyz/rfq-api/api-reference/quote) documents the parameters and Bearer authorization. G2 will support optional key configuration and verify actual access; the current evidence does not prove that adding a key resolves the issue.

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

G1 normalization works independently of network access. G2 can implement the client and use labeled fixtures while access is unresolved, but cannot be accepted as complete until real quotes succeed on both chains. Any future provider-specific schema findings must come from official documentation and actual responses; these 403 responses are not a quote schema sample.

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

The current transport makes one GET with a 10-second deadline covering headers and body. It identifies 401, 403, and 429, reports other HTTP/transport failures, and rejects malformed or inconsistent success responses. Provider error envelopes and non-success statuses fail explicitly. Detailed provider-specific no-liquidity classification, automatic retries, and `Retry-After` handling remain G3 work.
