# ADR-0018 — Admin Task/Campaign Review Boundary

**Status:** Accepted

## Context

Creator campaigns already use the canonical `activity_tasks` table and `task-service.js`. The existing Creator flow can create a campaign, debit the creator through Economy/Ledger, and submit it to `pending_review`, but there was no protected Admin control surface for that review step.

## Decision

1. Add a thin Admin Task/Campaign route and service boundary; do not create a second task engine.
2. Admin lists creator-owned tasks from `activity_tasks` and filters by the existing `TASK_STATUSES` values.
3. Admin review supports only the existing `approve` and `reject` transitions.
4. Approval reuses `taskService.approveCreatorCampaign`.
5. Rejection reuses `taskService.rejectCreatorCampaign`, including its existing campaign refund/tax economics and Ledger idempotency.
6. Admin mutations require the existing Admin authentication, a reason, and an idempotency key.
7. Review actions are recorded in the existing `admin_audit_log` and `idempotency_records`; no parallel audit or task-review tables are introduced.
8. No new task lifecycle state, verification path, reward path, campaign pricing source, or provider credential mechanism is introduced.

## Non-goals

- No redesign of the Creator Task Engine.
- No manual balance mutation.
- No new campaign accounting system.
- No automatic approval/rejection.
- No Reward Pool revival.
