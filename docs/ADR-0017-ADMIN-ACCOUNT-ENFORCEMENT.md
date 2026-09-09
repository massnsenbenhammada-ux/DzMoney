# ADR-0017 — Admin Account Enforcement

## Status

Accepted for Phase 12.

## Context

The Admin Panel roadmap requires account status and explicit enforcement. The repository already had:

- canonical Telegram authentication;
- Admin authorization and rate limiting;
- `admin_audit_log`;
- `idempotency_records`;
- Squad membership states including `suspended` and `cancelled`.

The `users` table did not have an app-level account status. No automatic ban engine or warning subsystem was present, and no current issue defined one.

## Decision

1. Add `users.account_status` with `active`, `suspended`, and `banned` states through migration `048_admin_account_status.sql`.
2. Enforce non-active accounts at the existing Telegram authentication boundary.
3. Keep Admin authorization independent of account status so authorized Admins retain access to the control plane.
4. Expose explicit Admin suspend/ban/activate actions through a protected Admin route.
5. Require an Admin actor, mandatory reason, and idempotency key for mutations.
6. Reuse `admin_audit_log` and `idempotency_records`; do not create parallel audit or idempotency infrastructure.
7. When a user has a Squad membership, suspend maps to the existing `suspended` membership state and ban maps to the existing `cancelled` state. Activation restores the existing membership to `active`.
8. Do not introduce automatic ban detection, a new warning table, or a separate Suspension/Ban service without a later contract proving the need.

## Consequences

- Account enforcement becomes server-authoritative and applies consistently to Telegram-authenticated user APIs.
- Existing Squad settlement eligibility semantics remain reusable.
- The Admin Panel gains the required explicit enforcement surface without reviving Reward Pool or introducing a second user-management system.
- Automatic abuse detection remains outside this slice until an evidence source and governing contract exist.
