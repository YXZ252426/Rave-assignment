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
