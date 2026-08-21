# DzMoney Task Engine v1 — Implementation Contract

> **Status:** DRAFT — implementation is blocked until this contract is approved.
>
> **Authoritative business source:** `PROJECT_ROADMAP.md`, Phase 2 — Activity, Ads & Tasks.
>
> This document is intentionally **not a second business-rule source of truth**. The roadmap owns economic rules, categories, pricing, and product requirements. This document only defines the implementation boundaries, invariants, and test gate needed to implement those requirements safely.

## 1. Scope

Task Engine v1 implements the Task requirements already defined in `PROJECT_ROADMAP.md` Phase 2, including:

- Daily, Game, Social, Web, and Special/Partner tasks;
- user-created Game/Social/Web campaigns;
- Execute → Verify for non-advertisement tasks;
- verified advertisement-task completion;
- optional verification advertisements;
- server-side verification;
- idempotent reward issuance;
- task lifecycle/state enforcement;
- campaign accounting;
- auditability and anti-fraud controls.

Out of scope: Referral, Squad, Reward Pool distribution, Packages, Withdrawal, and unrelated UI work.

## 2. Single-Source-of-Truth Rule

Business/product rules remain in `PROJECT_ROADMAP.md`.

The implementation must obtain authoritative economic configuration from the backend/database. Frontend values are presentation only.

The Task Engine must not create a competing balance, reward, or ledger system. All economic mutations must pass through the established Economy/Ledger boundary.

## 3. Architecture Boundary

Required conceptual flow:

```text
HTTP/API
   ↓
Task Service
   ↓
Verification Service
   ↓
Provider Adapter (when external verification is required)
   ↓
Economy/Ledger Service
```

Rules:

- Task Service must not contain Squad, Referral, or Reward Pool logic.
- Task Service must not directly mutate wallet balances.
- Provider-specific callback/signature logic belongs inside provider adapters.
- Frontend is never authoritative for completion, eligibility, reward amount, or balance.
- No second/parallel Task Engine may be introduced.

## 4. Lifecycle Invariant

The implementation must enforce the lifecycle defined by the roadmap:

```text
DRAFT
  ↓
PENDING_REVIEW
  ↓
ACTIVE
  ↓
PAUSED
  ↓
COMPLETED / EXPIRED
  ↓
CLOSED / REFUNDED
```

State transitions must be explicit, authorized, auditable, and server-enforced.

Terminal states cannot silently become active again.

## 5. Execute → Verify Invariant

For every non-advertisement task:

```text
Execute
   ↓
completion evidence/session
   ↓
Verify
   ↓
server-side eligibility + verification
   ↓
atomic reward transaction
```

`Execute` never grants the reward.

`Verify` must authenticate the user, validate task state/eligibility, validate required evidence, enforce configured verification-ad requirements, enforce idempotency, and commit the reward only through the Economy/Ledger boundary.

Advertisement tasks use their own verified-ad completion flow because the advertisement itself is the activity.

## 6. Verification-Provider Boundary

External providers must be accessed through adapters.

A provider callback/event may affect economic state only after server-side validation using the provider's trusted verification mechanism.

Provider identifiers and task verification identifiers must remain distinguishable from Reward Pool and other advertisement activity identifiers.

## 7. Idempotency / Replay Invariant

Economic reward issuance must be exactly-once from the user's economic perspective.

Required behavior:

```text
first valid completion                 → reward once
same completion again                  → no second reward
same idempotency key + same payload   → idempotent success/no duplicate reward
same idempotency key + changed data   → reject
replayed/invalid provider event       → reject/no reward
```

Durable database uniqueness/constraints are required. In-memory flags are insufficient.

## 8. Atomic Reward Invariant

A successful task reward must commit as one durable transaction:

```text
BEGIN
  validate completion/eligibility
  enforce uniqueness/idempotency
  create immutable ledger records
  update authoritative balances through the economy boundary
  mark completion rewarded
COMMIT
```

Any failure rolls back the entire reward operation.

Concurrent verification attempts must not produce duplicate rewards or ledger drift.

## 9. Completion State Model

Execution/completion records should distinguish at minimum:

```text
STARTED
PENDING_VERIFICATION
VERIFIED
REWARDED
REJECTED
EXPIRED
```

`VERIFIED` means completion evidence was accepted.

`REWARDED` means the economic transaction committed.

An intermediate state must never permit a second reward.

## 10. Eligibility Boundary

Eligibility is checked server-side at verification time, including as applicable:

- task is active/eligible;
- task has not expired;
- user is authorized to participate;
- campaign/user limits have not been exceeded;
- completion has not already been rewarded;
- required evidence exists and is valid;
- required verification advertisement is completed;
- provider event has not been replayed.

Cooldowns, limits, and other configurable constraints must be stored as backend configuration rather than invented in frontend code.

## 11. Campaign Accounting Boundary

The roadmap owns campaign pricing and product economics.

Implementation must keep these concerns separate:

```text
campaign budget/accounting
        ≠
user reward accounting
```

Before implementation, the exact budget-reservation point must be selected and documented in the implementation/design record: creation, activation, execution, or another explicit atomic point.

Unused budget/refunds require explicit auditable financial records. No silent balance rewrites.

## 12. Data-Model Boundary

Keep separate durable concepts for:

- task definition;
- creator/campaign owner;
- execution/session;
- completion/verification;
- provider event/idempotency identity;
- campaign budget/accounting;
- reward/ledger transaction.

Do not overload one table as the source of truth for unrelated concerns.

Historical rewards must retain the source/configuration actually applied at the time.

## 13. API Boundary

Exact route names are not fixed here until the existing HTTP architecture is reviewed.

The API must provide distinct responsibilities for:

- task discovery/listing;
- task detail;
- task execution/start;
- task verification/claim;
- provider callback/webhook;
- admin task management;
- campaign management.

No API route may bypass the Economy/Ledger service to mutate balances.

## 14. Admin Boundary

Admin controls described in the roadmap must change real backend behavior.

The implementation must not create frontend-only settings that appear authoritative.

Admin mutations require authorization and auditability.

## 15. Anti-Fraud Invariants

Never:

- trust a client-provided reward amount;
- trust client completion state;
- let frontend code write balances;
- let clients choose arbitrary ledger sources;
- accept unverified provider callbacks as economic proof;
- reward the same completion twice;
- count a verification advertisement as a second task reward;
- count Reward Pool advertisements as Task completions;
- mix identifiers for unrelated advertisement/activity types;
- rely on application memory as the only duplicate-prevention mechanism.

## 16. Audit / Observability

Every economically relevant task event must be traceable to the applicable:

- user;
- task;
- category;
- campaign;
- completion/execution identity;
- provider event identity;
- reward source;
- reward amount/currency;
- timestamp;
- verification outcome.

Failed verification must be observable.

Economic history is immutable; corrections use compensating/auditable records.

## 17. Mandatory Test Gate

The Task Engine cannot be considered complete until automated tests cover:

### Happy path
- Execute → Verify → reward;
- advertisement completion → reward;
- verification-ad flow → exactly one task reward.

### Duplicate/replay
- duplicate verify;
- duplicate provider callback;
- repeated identical idempotency key;
- conflicting idempotency payload;
- replayed provider event.

### Eligibility
- inactive/paused/expired task;
- completed campaign;
- exceeded user/campaign limit;
- unauthorized creator/category action.

### Atomicity
- transaction rollback;
- concurrent verification;
- concurrent provider callbacks;
- ledger/balance consistency after failure.

### Separation
- verification ad ≠ second task reward;
- Reward Pool ad ≠ Task activity;
- activity identifiers remain separated;
- task reward source remains `task`.

### Security
- forged reward amount;
- forged completion state;
- invalid provider signature/callback;
- unauthorized admin mutation;
- cross-user completion/replay.

## 18. Implementation Order

```text
1. Approve this implementation contract
        ↓
2. Inspect current Phase 2/task code for contradictions
        ↓
3. Design schema + database constraints
        ↓
4. Design service boundaries
        ↓
5. Implement lifecycle/state machine
        ↓
6. Implement verification/idempotency
        ↓
7. Integrate atomic reward + ledger
        ↓
8. Implement provider adapters
        ↓
9. Implement APIs
        ↓
10. Implement Admin controls
        ↓
11. Implement frontend task UI
        ↓
12. Run complete test gate
        ↓
13. Deploy to Railway
        ↓
14. Re-run health/reconciliation checks
```

## 19. Anti-Drift Rule

If a new Task business rule is proposed, update `PROJECT_ROADMAP.md` first. Do not silently add conflicting economic/product rules to this file.

If an implementation constraint changes, update this file without duplicating the roadmap's business rules.

Do not create `TASK_ENGINE_V2`, `TASK_ENGINE_FINAL`, or parallel task specifications. Git history is the change history.

## 20. Approval Gate

Before implementation begins, the project owner must approve:

1. the roadmap's Task categories;
2. Execute → Verify behavior;
3. verification-ad behavior;
4. advertisement-task separation;
5. roadmap reward model;
6. lifecycle states;
7. campaign pricing/accounting model;
8. eligibility/limits;
9. idempotency model;
10. provider verification boundary;
11. data-model boundaries;
12. test requirements.

Until approved, this document is not permission to implement the Task Engine.
