# G3 reliability and offline verification

G3 separates a bounded GET transport from Bebop parameter mapping and response validation. Retries are limited to safe, idempotent quote GETs; no signing or execution path exists.

## Retry contract

- Default attempt limit: 3 total requests (first attempt plus 2 retries).
- Per-attempt timeout: 10 seconds, including response-body reading.
- Total deadline: 20 seconds, including retries and delays; a monotonic clock measures the budget.
- Eligible HTTP statuses: 408, 429, 500, 502, 503, 504.
- Eligible transport failures: selected connection reset/refused/timeout, temporary DNS, and Undici socket/header/body timeout codes. Unknown exceptions and certificate errors are not automatically retried.
- Jittered delay ranges: 125–250 ms before retry 1, 250–500 ms before retry 2. A valid `Retry-After` takes precedence when it requests a longer wait.
- `Retry-After` supports nonnegative integer seconds and parseable HTTP dates. Negative/fractional/non-date values are ignored. Excessively large valid waits return guidance; they are never clamped into an earlier request.
- A wait that would use up the remaining budget ends the command with the last provider failure and its retry guidance. A stalled request or wait ends at the total deadline.
- Cancellation aborts in-flight fetch/body reads and clears waits and deadline timers. Ctrl-C during a quote reports `REQUEST_CANCELLED` and exit 130.

Status, attempts, and retry guidance are structured error metadata. Raw provider errors and transport exception text are not printed. Success responses are bounded to 1 MiB, counting actual received bytes regardless of `Content-Length`.

## Verified provider error

On 2026-10-05 at 03:09:33 UTC, an unauthenticated quote request to sell 0.000001 USDC on Ethereum returned HTTP 200 with a JSON error envelope: `errorCode: 104` and a `MinSize:` message. The [saved response](evidence/g3-provider-error.json) supports the exact `NO_QUOTE` classification used here. Unknown codes and other messages remain `UPSTREAM_FAILURE`; tests do not invent undocumented provider semantics.

## Offline demo and CI

`demo` builds a synthetic Base USDC/WETH example using the same adapter, provider-response validator, and quote inspector, without an HTTP client. Its fixed historical clock is after its fixed expiry, and both text and JSON label the result as MOCK and expired. It does not read `.env`, need a token balance, or load fixture files relative to the working directory.

The test suite replaces the default fetch implementation with a network guard. HTTP behavior uses injected responses, clocks, random values, and fake timers. Subprocess demo tests also block fetch and run from an unrelated directory. This checks reproducibility and keeps live access independent of offline test success.

The CI workflow pins official checkout/setup-node releases, uses Node 24 and `npm ci`, then runs the offline checks, help, and a network-guarded demo. Local verification and hosted Actions execution are recorded separately; creating the workflow does not prove a hosted run has happened.

## Completed checks (2026-10-05)

A clean temporary copy passed `npm ci`, formatting, type checking, compilation, and **183 tests across 11 files** on Node 24.21.0. CLI help, the network-guarded JSON demo, and `npm run demo` also passed. The workflow YAML parsed successfully and its triggers, permissions, and six steps were checked locally.

One [live Base regression request](evidence/g3-live-smoke.json) succeeded through the new HTTP layer at 05:41:18 UTC, with calldata present. This supplements the G2 two-chain evidence; it does not trigger repeated live requests in tests. The separate minimum-size probe supplied the error-classification evidence. No hosted CI run or on-chain execution is claimed.
