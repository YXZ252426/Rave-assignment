# AI usage notes

## Workflow

This project uses a fully AI-native development workflow directed by the user. Codex performed the DeFi/API research, wrote the development plan, and implemented G1, including project configuration, the token registry, exact amount handling, input validation, the adapter, the CLI, tests, and documentation. The user selected larger goal-based commits and prioritized a working Bebop request path before comprehensive error handling.

No independent human review is claimed. AI-written tests provide regression checks; they are not proof of provider compatibility or liquidity.

## G1 evidence

- Addresses and decimals were checked against Uniswap's official token-list source; Circle's documentation independently confirmed the USDC addresses.
- Four bounded, unauthenticated GET requests probed Bebop token discovery and quotes on Ethereum and Base. All returned HTTP 403; one reported Cloudflare error 1010. No live quote succeeded. See `docs/api-integration.md` and its dated evidence files.
- A clean temporary copy passed `npm ci` and `npm run check` on Node 24.21.0: formatting, source/test type checking, compilation, and all 76 tests across 3 files. Both documented example commands succeeded. The final G1 results are also recorded in `DEVELOPMENT_PLAN.md`.
- No private key, wallet signing, approval submission, transaction broadcast, or settlement was used.

The system initially supplied Node 23.7.0. A separate temporary Node 24.21.0 installation was used for validation without replacing the system runtime. Project setup remains the documented Node 24 plus `npm ci` workflow.

The shell sandbox failed with `mountinfo path is not absolute`; workspace edits and checks used the approved execution fallback. This is an environment detail, not a runtime requirement of the CLI.

## G2 work and evidence

Codex implemented the Bebop client, runtime response validation, exact rate/expiry inspection, quote service, optional API-key loading, proxy-aware startup, text/JSON CLI command, synthetic fixtures, and integration tests. The CLI remains quote-only.

Unlike the G1 probes, real Node-client requests succeeded on both chains through the environment's existing proxy. Actual outputs and times are recorded in [live verification](docs/live-verification.md). A further request verified the final npm startup command. No API key was used in those calls; authenticated header behavior is covered by a fake-key test rather than claimed as live verification.

The synthetic test data was informed by the official response contract and checked against the fields consumed by successful live requests. It is not presented as captured live payloads. No raw calldata, credential, signature, or transaction submission is part of the saved quote reports.

Final G2 validation passed formatting, type checking, compilation, and all 133 tests across 8 files. The completion status is recorded in `DEVELOPMENT_PLAN.md`. Node 24.5+ is now required because startup uses the documented built-in environment proxy flag.

## G3 work and evidence

Codex implemented bounded retries, attempt/total deadlines, cancellation, response-size limits, structured retry diagnostics, an offline synthetic demo, and the CI workflow. The minimum-size error mapping uses one actual Bebop error response, saved with its request and timestamp; broader error-code meanings were not guessed.

Retry and deadline behavior is tested with injected transport and simulated time, without repeatedly calling the live API. The demo is explicitly mocked and expired. CI was configured with official action versions pinned to commit hashes; a hosted Actions result is not claimed from local tests.

Work briefly paused because automatic approval review could not run after a service usage limit. The write was not executed; following the user's instruction to continue, the approval service recovered and work resumed. The resumed shell used the existing nvm Node 24.21.0 installation after its default PATH no longer contained npm. These are development-environment observations, not application setup requirements.

Final G3 validation: clean installation, formatting, type checking, build, and 183 tests across 11 files passed on Node 24.21.0. Help, guarded JSON demo, and one-command demo passed; workflow YAML structure was checked. One live Base regression quote succeeded after the HTTP-layer change. Hosted CI execution remains unverified until a push/run occurs.
