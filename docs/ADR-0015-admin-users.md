# ADR-0015: Admin Users Management Uses Canonical Economy/Ledger

## Status

Accepted

## Context

The Admin Users surface provides user search, profile inspection, canonical balances, ledger visibility, and manual balance adjustments.

The existing system already has canonical `users`, `wallet_accounts`, `ledger_transactions`, and `ledger_entries` tables plus the canonical Economy service.

## Decision

- Admin Users reads the existing `users`, `wallet_accounts`, and ledger tables directly through one Admin Users service.
- Manual balance adjustments are posted through `postEconomyTransaction` with transaction type `ADMIN_BALANCE_ADJUSTMENT`.
- Every adjustment requires the authenticated admin actor, a reason, and an idempotency key.
- Ledger metadata records actor, reason, currency, and amount; the ledger entry source is `admin_adjustment`.
- Admin grants apply equally to COIN, DZX, and DZP and are real wallet balances, not a separate balance or frontend-only entitlement.
- Admin DZP grants are not classified as `earned_dzp`, `converted_dzp`, or `purchased_dzp`. Those fields remain provenance fields for their existing economic sources; Admin provenance is represented by the canonical ledger transaction and `admin_adjustment` source.
- DZP source provenance is not constrained to be less than or equal to current spendable balance, because sourced DZP can be spent while its provenance remains historical. The aggregate wallet balance remains the spendable economic truth and the ledger remains the audit trail.
- DZX source attribution is represented by the canonical ledger `source` and transaction metadata; no new DZX wallet bucket is introduced.
- Account status controls are not introduced because the current `users` schema has no status field or established enforcement boundary.

## Consequences

- No duplicate wallet, ledger, reward, or user-management system is created.
- Manual changes remain atomic, idempotent, and auditable through existing economic infrastructure.
- All three currencies follow the same Admin Grant economic path and can participate in their normal balance-based operations.
- DZP provenance remains available for reporting/reward semantics without making historical source totals a spendability constraint.
