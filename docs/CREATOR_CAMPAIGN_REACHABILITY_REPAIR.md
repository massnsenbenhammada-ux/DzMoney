# Creator Campaign Reachability Repair

## ODRCA repair contract

Base: `5439933a89cfc42fae45e473e8575b05b09b021c`.

### Existing contracts preserved

- `GET /api/tasks` remains the normal catalog and continues to exclude Creator Campaigns through `creator_id IS NULL`.
- Existing task execution remains `POST /api/tasks/execute`.
- Existing verification and target-enforcement paths remain unchanged.
- Creator campaign debit/refund and Economy/Ledger behavior remain unchanged.
- No migration or new persistence model is introduced.

### Discovery surface

Authenticated executors receive active Creator Campaigns through:

`GET /api/tasks/creator`

The response is derived from `activity_tasks` where:

- `status = 'active'`
- `creator_id IS NOT NULL`

Progress is derived from verified `task_attempts`; no campaign-progress table is introduced.

The frontend combines this discovery response with the existing normal task response for presentation, while execution still uses the existing task execution boundary.

### Creator read model

Authenticated creators receive their own campaigns through:

- `GET /api/creator/tasks`
- `GET /api/creator/tasks/:taskId`

The read model derives:

- lifecycle status
- target
- verified executions
- remaining executions
- reserved campaign cost
- configured per-execution price
- refund/tax data when a refund exists

The read model is creator-scoped by the authenticated user and does not introduce a second lifecycle engine.

### UX terminology

Creation is labelled **Create Campaign**. Submission is labelled **Submit for Review**. This reflects the existing backend lifecycle:

`draft -> pending_review -> active`

The creator panel also exposes the creator's campaign status and progress.

### Verification boundary

The repair is covered by:

- HTTP boundary coverage for executor discovery.
- HTTP boundary coverage for creator read access and ownership isolation.
- Frontend contract assertions for the new discovery/read bindings.
- Existing creator lifecycle integration coverage extended to verify discovery, normal-catalog exclusion, and creator read visibility.

Production impact remains unverified because the historical Production database is unavailable after hosting expiry.
