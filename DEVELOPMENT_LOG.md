# DzMoney Development Log

## 2026-09-07 — Phase 12 Admin Enforcement

### Pre-change audit
Inspected the current main code, Git history, merged PRs, CI workflows/status, commits, tracing boundaries, tests, roadmap/status documentation, repository issues, and recent runtime failure history before changing code.

### Findings
- Phase 12 Dashboard, Telegram entry, Economy, Users, Referral, and Squad slices are already merged.
- Phase 11 Home had a recent async MutationObserver regression; PR #276 fixed it and Home runtime was confirmed healthy. This work does not touch that path.
- No app-level account status existed on `users`.
- Existing Squad membership states already provide `suspended` and `cancelled` semantics.
- Existing `admin_audit_log` and `idempotency_records` are the canonical operational primitives.
- No authoritative automatic warning/ban detection source currently exists, so none was invented.

### Implementation
- Added `users.account_status` (`active`, `suspended`, `banned`) in migration `048_admin_account_status.sql`.
- Enforced account status at the existing Telegram authentication boundary.
- Kept Admin authorization independent of account status.
- Added protected Admin enforcement GET/action routes.
- Added explicit suspend, ban, and activate controls with mandatory reason and idempotency.
- Reused existing Squad membership states when membership exists.
- Added audit records to the existing Admin audit log.
- Added a minimal mobile Admin enforcement section.
- Added `test:admin-enforcement` to `test:all`.
- Recorded the architectural decision in `docs/ADR-0017-ADMIN-ACCOUNT-ENFORCEMENT.md`.

### Non-goals
- No automatic ban detection.
- No new warning subsystem.
- No duplicate Ban/Suspension service or table.
- No Reward Pool restoration.
- No unrelated Home/UI runtime changes.
