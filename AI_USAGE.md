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
