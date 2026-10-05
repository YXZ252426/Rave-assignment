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

## G4 work and evidence

Codex researched the current LI.FI Intents endpoint documentation, fetched the public chain catalog, and implemented `LiFiClient`, the independent `chains` command, sequential `CompareService`, text/JSON comparison output, and focused tests. The observed `id`/`chainId` distinction informed parsing: Base's catalog ID is 2, while its EVM chain ID is 8453. The catalog fixture is a labeled subset of a dated real response; quote fixtures remain synthetic.

Comparison design validates every size before HTTP, preserves route and receiver, retains partial results, and skips further work after authentication/access failures, rate-limit exhaustion, cancellation, or internal errors. Ranking uses exact rational arithmetic and reevaluates all expiry timestamps at collection completion. Tests exercise precision differences hidden by display rounding, tied rates, reverse routes, expiry during collection, and the maximum fifteen HTTP attempts for five sizes. These tests use injected transport/time rather than live polling.

Final G4 validation passed formatting, source/test type checking, compilation, and **244 tests across 14 files** on Node 24.21.0. The final discovery CLI returned 30 records. One live Base comparison requested 100, 500, and 1000 USDC: all three returned validated quote reports with calldata and were unexpired when comparison completed. See [dated G4 observations](docs/discovery-and-comparison.md). Calls used anonymous access and the environment's existing proxy. No authenticated access, transaction execution, or hosted CI result is claimed. The saved reports are historical and keep their original expiry.

## G5 documentation and handoff

The author narrowed G5 to local documentation and reproducibility verification, requested that GitHub publication wait, and chose to record the demo video personally. Codex did not create a screenshot, video, repository remote, or hosted CI result for this step.

Codex reviewed the README and milestone records against the implementation, rechecked official LI.FI and Bebop documentation, added a reviewer-facing submission document, and clarified the separate protocol lifecycles. The LI.FI explanation follows its documented standing-quote matching model; the explorer's main quote path remains a local adapter followed by a direct Bebop RFQ. Historical G1 access findings are preserved but no longer described as the current integration state.

No application behavior or dependencies changed in G5. Clean-source verification results are documented in [local verification](docs/local-verification.md). Existing live observations remain dated evidence, not refreshed quotes. No new live RFQ calls were needed for these documentation changes. The final author handoff in [SUBMISSION.md](SUBMISSION.md) leaves the recording, GitHub URL, and hosted Actions verification explicitly open.

G5 clean-source verification completed on 2026-10-05 at 07:10:34–07:10:40 UTC using Node 24.21.0 and npm 11.19.0. A temporary source snapshot without `.env`, dependencies, generated output or Git metadata passed `npm ci`, the complete 244-test check suite, startup/help, both normalization examples, and offline text/JSON demo commands. The [recorded outputs](docs/evidence/g5-local-verification.json) refer to application commit `7bc7ab1`; subsequent changes were documentation and evidence only. A temporary approval-service quota failure interrupted a documentation write; it was not executed, and work resumed after the user asked to continue and approval review recovered.

## Final readiness follow-up

After the author supplied the GitHub repository URL, Codex checked the public repository metadata, remote refs and workflow runs. The repository existed but had no branches or Actions runs; the local checkout had no configured remote. Codex added the URL and outstanding delivery tasks to the documentation without pushing code or creating a recording.

The complete local check suite again passed with 244 tests across 14 files. Two fresh anonymous Bebop requests on 2026-10-05 at 09:25 UTC returned HTTP 403, one on each chain. The CLI reported access denial without retrying; no successful quote is claimed for this check and the cause was not inferred from the status alone. [Submission readiness](docs/submission-readiness.md) and its saved evidence distinguish this current limitation from the earlier successful quotes. No application code or dependency changed.

## Publication authorization

The author subsequently reported successful operation in their own environment and explicitly authorized publication to `YXZ252426/Rave-assignment`. Codex updated the readiness wording to distinguish that user report from captured API evidence, retained the historical 403 result, and prepared the local history for the remote `main` branch. No new live quote, code change, or explanation for the environment-specific access result is inferred from the author's message. Video recording remains the author's task.
