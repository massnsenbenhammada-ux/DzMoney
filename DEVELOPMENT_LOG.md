# DzMoney Development Log

## 2026-09-07 — Phase 12 Admin Task/Campaign Review

### Pre-change audit
Inspected current `main` code, creator/task services and routes, Git history and recent Phase 12 PRs, CI/test coverage, request-to-Economy/Ledger tracing, roadmap/contracts/ADRs, repository issues, and recent runtime/deployment failure history before implementation.

### Findings
- Creator campaigns already use the canonical `activity_tasks` table and `task-service.js`.
- Existing lifecycle is `draft → pending_review → active → paused → completed/expired → closed/refunded`; no new state is required.
- Creator campaign creation debits DZX through the existing Economy/Ledger path and snapshots the Admin-controlled campaign price.
- Existing `approveCreatorCampaign` and `rejectCreatorCampaign` already enforce the lifecycle and rejection refund/tax economics.
- No protected Admin task/campaign review route existed.
- Existing `adminAuth`, rate limiting, `admin_audit_log`, and `idempotency_records` are the canonical Admin primitives.
- No GitHub issue authorized a separate task-review engine or alternative campaign accounting source.

### Implementation
- Added `src/services/admin-task-campaign-service.js` as a thin Admin orchestration boundary.
- Added protected `GET /api/admin/tasks` with existing status filtering.
- Added protected `POST /api/admin/tasks/:taskId/review` for only `approve` or `reject`.
- Reused existing Task Service lifecycle/economics rather than duplicating them.
- Required Admin actor, reason, and idempotency key for review mutations.
- Reused existing Admin audit/idempotency tables.
- Added a minimal mobile Admin campaign-review surface to the existing Admin page.
- Added `test:admin-task-campaign` to `test:all`.
- Added a CodeQL rate-limit rationale matching the project's existing suppression pattern.
- Rendered campaign fields with DOM `textContent` instead of HTML interpolation to avoid admin-side DOM XSS from creator-controlled titles/metadata.
- Recorded the decision in `docs/ADR-0018-ADMIN-TASK-CAMPAIGN-REVIEW.md`.

### CI correction
- Exact-head CI initially failed only because the new contract test incorrectly expected `approve`/`reject` literals in the HTTP route instead of the service boundary.
- No product/runtime failure occurred; migrations, TON tests, isolated server health, and all checks before `test:all` passed.
- Corrected the test to assert action transport at the route and transition ownership in the service.

### Non-goals
- No new task engine, verification service, reward service, campaign table, pricing source, or lifecycle state.
- No manual balance mutation.
- No automatic review.
- No Reward Pool revival.
