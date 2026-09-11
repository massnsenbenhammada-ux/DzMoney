# ADR-0022 — Digging Daily Board Reset

## Status

Accepted

## Context

Phase 5 currently documents Digging sessions as persistent until the board is fully revealed. The intended product behavior is instead a fresh Digging board for each Gaming Day (UTC+1), with an unfinished previous board forfeited when the day changes.

This is a product/behavior change and therefore must be explicit before implementation. The existing `gaming_sessions` table already records session creation time and status, and an existing partial unique index limits users to one `active` session. No second board-state system is justified.

## Decision

1. Digging has one board per Gaming Day.
2. The Gaming Day is the existing canonical convention already used by `gaming-service.js`:
   `(NOW() AT TIME ZONE 'UTC' + INTERVAL '1 hour')::date`.
3. When an `active` Digging session belongs to an earlier Gaming Day, it is marked `expired` and a new board may be started for the current day.
4. `expired` is distinct from `completed`: an unfinished board that crosses the Gaming Day boundary was not completed.
5. The existing partial unique index for `status='active'` remains the concurrency boundary; no second session-state/index system is introduced.
6. The existing `created_at` timestamp is used to determine the session's Gaming Day. A new `board_day` column is not introduced because it would duplicate information already derivable from the canonical timestamp and add schema surface without need.
7. `getGamingState()` must not expose a stale previous-day active board. It must expire such a session before returning state.
8. `startDigging()` must perform stale-session detection and expiry under the existing transaction/locking boundary before deciding whether an active session already exists.
9. Starting a new daily board still consumes one Axe. The daily reset changes board lifecycle only; it does not grant a free Axe or change the Economy/Ledger contract.
10. Energy continues to use the existing daily reset mechanism and canonical Gaming Day.

## Schema consequence

The existing `gaming_sessions.status` CHECK constraint is extended to allow `expired`. No new table, board-day column, or duplicate state machine is introduced.

## Supersession

This ADR explicitly supersedes the statement in `PHASE5_GAMING.md` that a Digging session persists without a Gaming-Day boundary. The corrected Phase 5 contract is: an active board persists across app closes/reopens during its Gaming Day, but an unfinished board expires at the next Gaming Day boundary.

## Consequences

- Users see a fresh empty 16-tile board on a new Gaming Day.
- Unfinished tiles from the previous day are forfeited.
- Historical expired sessions remain auditable rather than being rewritten as completed.
- Existing Economy/Ledger, reward selection, configuration versioning, and idempotency boundaries remain unchanged.
- The smallest schema change is required: one additional allowed session status value.
