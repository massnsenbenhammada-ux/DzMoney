# Phase 7 — Buying Points & Conversion

## Implemented boundary

The existing Phase 1 Economy/Ledger conversion primitives are now exposed through the authenticated user API and the existing Wallet UI:

- `COIN → DZP`
- `DZX → DZP`

Rates are read server-side from `admin_settings` and are never calculated authoritatively by the browser.

Every conversion request requires an idempotency key scoped to its conversion operation and is settled through the existing Economy/Ledger transaction boundary.

## DZP source rule

Conversion credits `converted_dzp`. Converted DZP is not earned activity and must not increase Reward Pool weight.

## TON purchases

Buying DZX with TON reuses the already-implemented Phase 8 deposit boundary. No second purchase or payment system is introduced.

## Explicitly skipped phases

Phase 5 Reward Pool and Phase 6 Packages are intentionally skipped by the current execution order and are not implemented by this milestone.
