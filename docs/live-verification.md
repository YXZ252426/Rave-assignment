# G2 live verification

**Real quotes succeeded on Ethereum and Base on 2026-10-05.** This record describes historical observations, not currently executable prices or transactions.

The compiled G2 CLI requested quotes from `https://api.bebop.xyz/pmm/{network}/v3/quote` using the checked-in intents. Both calls used Node 24.21.0, the environment's existing outbound proxy, standard Node fetch, and no API key. The requests were not signed, and no approval or settlement transaction was sent.

| Network  | Retrieved at (UTC)      | Sold        | Quoted purchase           | Expiry (UTC)        | Calldata |
| -------- | ----------------------- | ----------- | ------------------------- | ------------------- | -------- |
| Ethereum | 2026-10-05 02:51:59.322 | 100.25 USDC | 0.036326619975792452 WETH | 2026-10-05 02:52:29 | Present  |
| Base     | 2026-10-05 02:52:00.122 | 100 USDC    | 0.036241347518952 WETH    | 2026-10-05 02:52:09 | Present  |

Both reports had `tx.value=0` after conversion to base units. Approval target, settlement address, and transaction target each resolved to `0xBeb0009ACa35087ce7cCF11637E24dd1Aad3bf2A` in these observations. The application reads these independently from the response; synthetic tests deliberately use different addresses.

The normalized response validator accepted the chain, token maps, decimals, sell amount, taker, receiver, transaction sender, and transaction fields. These checks establish consistency with the submitted request, not on-chain execution success or contract safety.

- [Two-chain JSON evidence](evidence/g2-live-quotes.json) contains the original normalized CLI outputs and input intents. Validity fields describe their `inspectedAt` time; saved quotes are now historical.
- [Startup smoke evidence](evidence/g2-startup-smoke.json) records a further real Base request using the final `npm --silent start -- quote ...` command and text output.
- [Synthetic fixtures](../tests/fixtures/bebop/README.md) are separate, visibly mocked test inputs. They were not used by the live CLI.

## Access findings

G1's Python probes returned Cloudflare 403 responses. The G2 Node client succeeded through the existing configured proxy. This demonstrates a working access path in this environment; it does not isolate the precise cause of the earlier denial or guarantee future access from every network. No host substitution, user-agent impersonation, or access-control bypass was used.

`npm start` enables Node's built-in `--use-env-proxy`, which reads already configured `HTTP_PROXY`, `HTTPS_PROXY`, and `NO_PROXY` environment variables. The flag requires Node 24.5 or newer in the supported 24.x line. See [Node's CLI documentation](https://nodejs.org/docs/latest-v24.x/api/cli.html#--use-env-proxy).

## Reproduce

```bash
npm ci
npm start -- quote --intent examples/ethereum-usdc-weth.json
npm --silent start -- quote --intent examples/base-usdc-weth.json --json
```

Use Node 24.5+ within the 24.x line. If an API key is available, set `BEBOP_API_KEY` in the process environment or optional `.env` file. Neither was used for these observations. Provider availability, rates, transaction fields, and validity will vary between requests. No live requests run in the default test suite.

## G4 discovery and comparison verification

On 2026-10-05 at 06:54:38–06:54:39 UTC, the final `chains --provider lifi --json` CLI returned 30 chain records and exited 0. Its local supported intersection was Ethereum and Base; it correctly kept Base's catalog ID 2 separate from chain ID 8453.

At 06:54:39–06:54:42 UTC, the final Base `compare --amounts 100,500,1000 --json` command returned three successful, validated Bebop quotes and exited 0. Each quote included calldata and was unexpired at completion. The best observed WETH-per-USDC rate belonged to row 3. No approval, signing, or submission was performed.

The [G4 notes](discovery-and-comparison.md) explain semantics, limitations, and observed prices. [Discovery output](evidence/g4-discovery-cli.json) and [comparison output](evidence/g4-live-comparison.json) include command, timestamps, and exit status. These are historical reports with original expiry, not current executable quotes. Default tests do not read these reports as live responses.

## Final pre-submission check: access currently denied

On **2026-10-05 at 09:25:21–09:25:23 UTC**, the unchanged CLI was exercised again on Ethereum and Base, using the checked-in example intents, anonymous access, and the existing environment proxy configuration. Both returned **HTTP 403**, surfaced as `UPSTREAM_ACCESS_DENIED` with exit code `1`, one attempt, and no retry. No live quote was obtained in this check.

The [saved check](evidence/pre-submission-check.json) contains timestamps, commands, and structured errors. The status alone does not establish missing credentials or a particular edge-policy cause. No bypass or repeated request loop was attempted. Prior successful observations remain historical evidence; they do not establish current access. Recheck in the actual demonstration environment before recording or submitting a claim that live requests currently succeed.
