# LI.FI discovery and trade-size comparison

Implemented in G4, 2026-10-05. Both commands are read-only.

## LI.FI's role

The [LI.FI Intents API overview](https://docs.li.fi/lifi-intents/intents-api/api-overview) documents the production order server at `https://order.li.fi` and public integrator endpoints. This explorer uses `GET /chains/supported` for discovery. It does not request a LI.FI quote, create an order, collect a signature, or perform settlement. The assignment's seven-field input remains a local simplified intent, rather than the real order-server request schema described in the [LI.FI Quickstart](https://docs.li.fi/lifi-intents/quickstart).

`LiFiClient` shares the bounded HTTP transport with `BebopClient`, but uses its own response schema and no Authorization header. The command never reads `BEBOP_API_KEY`. A failed discovery call cannot disable `quote` or `compare`; those commands do not call LI.FI.

The observed API returns an array of records:

```json
{ "id": 2, "chainId": "8453", "name": "Base", "chainType": "EVM" }
```

| API field             | Explorer meaning                                                                             |
| --------------------- | -------------------------------------------------------------------------------------------- |
| `id`                  | Provider catalog record ID, exposed as `catalogId`; never used to choose the Bebop network   |
| `chainId`             | Chain identifier, preserved as a string to avoid precision loss and support other namespaces |
| `name`                | Provider name, sanitized for terminal display                                                |
| `chainType`           | Chain namespace, such as EVM or SVM; other values can be displayed                           |
| `supportedByExplorer` | Computed: EVM namespace and membership in the local Ethereum/Base allowlist                  |

Unknown chains remain visible without becoming supported quote routes. Empty arrays are valid. Malformed records, duplicate catalog IDs, and duplicate namespace/chain identities fail with `INVALID_UPSTREAM_RESPONSE`; unrelated extra fields are ignored. Catalog membership does not establish token coverage, active liquidity, or execution readiness on Bebop.

## Comparison flow

```text
Base intent + one to five sizes
  -> validate complete intent and all sizes
  -> normalize each sell amount exactly, preserving route/taker/receiver
  -> sequential Bebop requests through the existing client and parser
  -> retain each successful quote or structured failure
  -> inspect all successful quotes at one completion time
  -> select the best exact rate among unexpired observations
  -> text table or JSON report
```

The base `amountIn` is validated even though the comparison replaces it. Sizes must obey the same precision, positivity, and uint256 constraints as ordinary quotes. Duplicate base-unit amounts are rejected. No provider call occurs if any supplied size is invalid.

Rows have 1-based `index`, original human-unit `amountIn`, exact `amountBaseUnits`, and one of these states:

| State     | Additional fields                                                                                                                                                                               |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `success` | Request start/finish times and complete `QuoteReport`, including its live/mock provenance, retrieval time, expiry, addresses, transaction value, calldata flag, warnings, and exact price ratio |
| `failed`  | Request start/finish times and structured `error`, including available HTTP status, attempt count, and wait guidance                                                                            |
| `skipped` | Null request timestamps and a structured `reason` copied from the stop condition                                                                                                                |

`outcome` is `complete` if all rows returned quotes, `partial` if some returned quotes and others failed or were skipped, `failed` if none succeeded, and `cancelled` when cancellation stops the collection. Expired or incomplete quotes are still successful observations, with warnings. Thus `complete` and exit code `0` do not assert executable trades. Pre-request validation errors use the normal stderr error envelope and exit `2`. After collection starts, even an all-failed or cancelled report is preserved on stdout, with exit `1` or `130` respectively.

The provider's HTTP budget applies to each size: at most three attempts in 20 seconds, with 10-second attempt deadlines. Five sequential sizes therefore permit at most 15 HTTP attempts and approximately 100 seconds of request time. HTTP 401/403, exhausted 429 handling, cancellation, or an unexpected internal failure stop subsequent sizes. Other failures can differ by size, so the service records them and continues. `Retry-After` guidance and the existing backoff rules remain unchanged.

## Price and validity interpretation

For sell amount `S` with `ds` decimals and buy amount `B` with `db` decimals, the exact human-unit rate is `(B × 10^ds) / (S × 10^db)`. Ranking cross-multiplies integer numerators and denominators. It never compares rounded display strings or floating-point conversions. Equal exact rates retain all tied row indexes.

Expiry is recomputed for every success using the same completion timestamp. A quote that expires while later sizes are loading remains in the report and is excluded from `best`. If all successes have expired, `best` is `null`. Missing transaction data does not prohibit price inspection, but remains explicit in warnings and calldata status. Validity refers only to the provider's expiry evaluated against the local clock; there is no on-chain simulation or clock-skew correction.

Sequential quotes reflect different observation times. Rate differences may involve provider pricing, time, and trade size; this command does not isolate market price impact or establish an optimal size. Separate network fees are excluded. No polling, execution, approval, signing, or broadcast occurs.

## Live verification

On 2026-10-05, a [raw discovery probe](evidence/g4-lifi-catalog.json) returned HTTP 200. The final [discovery CLI](evidence/g4-discovery-cli.json) ran at 06:54:38–06:54:39 UTC, returned 30 records, and identified Ethereum and Base as the local intersection. The small mocked test fixture is a dated subset of that actual catalog; it is not used as a live fallback.

The final [comparison CLI](evidence/g4-live-comparison.json) ran on Base at 06:54:39–06:54:42 UTC with anonymous Bebop access and the checked-in public example address:

| Sell USDC | Buy WETH             | Displayed WETH per USDC | Provider expiry UTC |
| --------- | -------------------- | ----------------------- | ------------------- |
| 100       | 0.036302177499175189 | 0.000363021774991751    | 06:54:50            |
| 500       | 0.181517541608622333 | 0.000363035083217244    | 06:54:51            |
| 1000      | 0.363088325878125687 | 0.000363088325878125    | 06:54:52            |

All three returned validated quote reports with calldata present. All were unexpired at collection completion; row 3 had the best observed rate. These are historical observations, not current quotes or a recommendation to execute. The evidence omits raw calldata and retains provider expiry without modification. No transaction was sent.
