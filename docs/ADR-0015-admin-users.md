# ADR-0015: Admin Users Management Uses Canonical Economy/Ledger

## Status
Accepted

## Context
Phase 12 requires an operational Admin Users surface for search, profile inspection, canonical balances, source visibility, and manual balance adjustments.

The existing system already has canonical `users`, `wallet_accounts`, `ledger_transactions`, and `ledger_entries` tables plus the canonical Economy service.

## Decision
- Admin Users reads the existing `users`, `wallet_accounts`, and ledger tables directly through one Admin Users service.
- Manual balance adjustments are posted through `postEconomyTransaction` with transaction type `ADMIN_BALANCE_ADJUSTMENT`.
- Every adjustment requires the authenticated admin actor, a reason, and an idempotency key.
- Ledger metadata records actor, reason, currency, amount, and DZP source when applicable.
- DZP adjustments require one existing source bucket (`earned_dzp`, `converted_dzp`, or `purchased_dzp`). The canonical Economy movement keeps both aggregate balance and selected source bucket consistent for credits and debits.
- DZX source attribution is represented by canonical ledger `source` and transaction metadata; no new DZX wallet bucket is introduced.
- Account status controls are not introduced in this milestone because the current `users` schema has no status field or established enforcement boundary.

## Consequences
- No duplicate wallet, ledger, reward, or user-management system is created.
- Manual changes remain atomic, idempotent, and auditable through existing economic infrastructure.
- Account status remains a separate future decision requiring a traced authentication/enforcement contract before any schema change.
