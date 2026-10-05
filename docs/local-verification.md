# Local delivery verification

G5 is limited to local documentation and reproducibility at the author's request. The author will produce the video, and GitHub publication is deferred. No screenshot, recording, hosted CI run, or published URL is claimed here.

## Procedure

A fresh temporary source snapshot is created from tracked files plus the final documentation, excluding `.git`, `node_modules`, `dist`, `.env`, and other untracked workspace state. Dependencies are installed from the committed lockfile using Node 24. This verifies the source package without relying on the development checkout's generated files or credentials.

The checks exercise installation, formatting, source/test type checking, compilation, all offline tests, CLI help, both normalization examples, and the offline demo. A fetch guard is also used when invoking the built demo and normalizer directly. LI.FI and Bebop are not called during this check; existing dated live evidence is linked separately.

## Result

All seven command checks passed on **2026-10-05, 07:10:34–07:10:40 UTC**, using **Node v24.21.0** and **npm 11.19.0** on Linux. The source snapshot used application commit `7bc7ab1`; only documentation changed during G5. Machine-readable timestamps, command arguments, exit codes, outputs and the lockfile hash are saved in [verification evidence](evidence/g5-local-verification.json).

| Command                                          | Result                                                                                      |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `npm ci`                                         | Clean installation succeeded                                                                |
| `npm run check`                                  | Formatting, source/test type checking, compilation and **244 tests across 14 files** passed |
| `npm --silent start -- --help`                   | Build-on-start succeeded; all five commands listed                                          |
| Guarded `normalize` with the Ethereum example    | Valid text output; no provider request                                                      |
| Guarded `normalize --json` with the Base example | Valid JSON output; no provider request                                                      |
| `npm run demo`                                   | Build and explicitly labeled offline MOCK output succeeded                                  |
| Guarded `demo --json`                            | Valid JSON, mock provenance and expired historical quote                                    |

The guarded invocations use `node --import ./tests/helpers/no-network.mjs dist/cli.js ...`; default fetch calls fail immediately in that mode. The complete arguments are in the evidence file. Final documentation formatting and relative links were checked after recording these results.

## Scope of the evidence

A clean local installation is evidence of reproducibility in the tested Node/Linux environment, not proof of a hosted GitHub Actions run or current market liquidity. The application's source remains the G4 implementation; G5 updates documentation only. [Live verification](live-verification.md) records actual provider calls, while [AI usage notes](../AI_USAGE.md) distinguish generated tests from external observations.
