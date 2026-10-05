# Synthetic Bebop test fixtures

These responses are **MOCK**, written for deterministic tests against the [official quote contract](https://docs.bebop.xyz/rfq-api/api-reference/quote). They are not captured quotes or executable transactions. Prices, addresses, identifiers, and calldata are deliberately synthetic. The three contract addresses differ to catch accidental conflation. Token-map keys use lowercase to exercise address matching.

The fixed test clock is 2026-10-05 02:50:00 UTC; fixture expiry is one minute later. Production commands never load these files or fall back to them. Real G2 observations live separately under `docs/evidence/` and are historical.
