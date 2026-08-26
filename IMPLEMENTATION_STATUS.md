# DzMoney 2.0 — Implementation Status

## Current state

**Current phase:** Phase 2 — Activity / Ads / Tasks, with Phase 3 Referral core partially implemented.

**Current main:** `656f26f5ee4ac9d45d7705762f91a035322fde9a` (PR #126 merged).

**Latest CI evidence:** PR #126 head `631a084dc968d2c1d98b2c6e8610fae37f8beafb` passed workflow run `32982388297` (`test-all`), including migrations, isolated runtime health and the full test suite. PR #126 was then merged to `main` as `656f26f5ee4ac9d45d7705762f91a035322fde9a`.

**Reconciliation rule:** Only merged commits on `main` are treated as completed. PR #125 was closed as superseded by PR #126; it is not a separate implementation milestone.

## Phase 0 — Specification Lock

🟢 Completed

The economic and architectural rules remain those defined in `PROJECT_ROADMAP.md`, including COIN/DZX/DZP internal currencies, TON as external reference/settlement only, atomic idempotent Economy/Ledger movements, and strict separation of Referral, Squad and Reward Pool.

## Phase 1 — Economy & Currency Core

🟢 Runtime verified and signed off.

- Internal wallet currencies: COIN, DZX, DZP.
- TON is not an internal wallet currency.
- Economy conversions and ledger-backed movements exist.
- Deposit foundation exists.
- Economy reconciliation exists.

No new Phase 1 refactor is in scope unless a new invariant/security defect is discovered.

## Phase 2 — Activity / Ads / Tasks

🟡 Partially implemented; not closed.

### Implemented and merged

- 🟢 `activity_tasks`, task attempts, verification gates and Daily Check-in state.
- 🟢 Non-ad Task Execute → Verify flow.
- 🟢 Server-authoritative task verification.
- 🟢 Verification-ad gate before trusted task verification.
- 🟢 Provider-neutral advertisement registry and trusted provider ingress.
- 🟢 Tasks-page advertisement direct ad → reward flow using existing advertisement/Economy/Ledger boundaries.
- 🟢 Daily Check-in with backend rolling 24-hour cooldown and advertisement gate.
- 🟢 Daily `Check for Update` system task with UTC+1 calendar-day eligibility and existing Telegram membership verification.
- 🟢 Daily `View Ads` system task with UTC+1 calendar-day eligibility and the existing Tasks-page advertisement provider flow.
- 🟢 Daily system-task contract for rolling 24-hour versus UTC+1 calendar-day policies and permanent referral achievement thresholds.
- 🟢 Social Telegram-channel server verification through the existing Task Verification boundary.
- 🟢 Task completion-service contract: Open Link → Click Proof and Server Verified; Special/Partner is Server Verified only.
- 🟢 Task-type Server Verified contract boundaries documented for Daily, Mini App, Social, Web and Special/Partner.
- 🟢 User Create Tasks runtime UI and authenticated HTTP boundary for Game/Social/Web.
- 🟢 User Creator is prevented from creating Special/Partner campaigns; Special/Partner remains Admin-only.
- 🟢 Creator target is server-enforced at minimum `1000`, in steps of `1000`.
- 🟢 Creator campaign pricing is Admin-controlled; `9 DZX` per valid execution is the initial/default reference value and campaign cost is calculated from target.
- 🟢 Creator cannot control COIN/DZX/DZP reward values or verification-ad duration; authoritative Admin settings are used server-side.
- 🟢 Creator supplies the destination URL for Open Link and Server Verified; the URL is not verification evidence.
- 🟢 Creator campaign debit, review and rejection-refund paths remain on the existing Economy/Ledger source of truth.
- 🟢 Economy idempotency ownership and operation-mismatch protections are covered by regression testing.
- 🟢 Migration `019_creator_campaign_pricing.sql` provisions `9 DZX` as the initial value with `ON CONFLICT DO NOTHING`, preserving an existing Admin-controlled value.

### Latest Creator Campaign CI evidence

- 🟢 Exact PR #126 head: `631a084dc968d2c1d98b2c6e8610fae37f8beafb`.
- 🟢 Workflow run: `32982388297`.
- 🟢 Job: `test-all`.
- 🟢 Install dependencies: passed.
- 🟢 Run migrations: passed.
- 🟢 Isolated runtime health: passed.
- 🟢 Full test suite: passed.
- 🟢 PR #126 merged to `main` as `656f26f5ee4ac9d45d7705762f91a035322fde9a`.

### Not yet implemented / accepted

- ⬜ Daily `Share with Friends` production reward flow; no trusted backend completion signal exists for an actual Telegram share.
- ⬜ Real task adapters/verifiers for the broader Daily/Game/Social/Web/Special-Partner catalog beyond the currently implemented Telegram Social verifier and Daily Check for Update path.
- ⬜ Provider/Partner-specific Creator Input contracts where the generic contract intentionally remains undefined.
- ⬜ Broader anti-fraud hardening around task/ad callbacks and verification.
- ⬜ Full acceptance of advertisement-task behavior across all required providers/contexts.

Phase 2 remains open until the remaining implementation and acceptance criteria are completed and verified.

## Task completion service contract — runtime partially implemented

🟡 Specification is locked and the User Create Tasks runtime boundary is implemented for the currently supported Game/Social/Web creator surface. Provider-specific verification remains pending where the contract is intentionally undefined.

The creator-facing completion choices are:

- **Open Link → Click Proof** — opening the configured link is itself the task outcome.
- **Server Verified** — trusted server-verifiable evidence is required for the external outcome.

The Creator UI consumes the existing verification contract rather than maintaining a second source of truth. Special/Partner remains excluded from the User Creator surface and remains Admin-only.

Provider-specific Server Verified fields remain undefined until an applicable provider/partner contract exists. The UI must not invent required inputs, and an unimplemented provider must not be exposed as operational verification.

## Phase 3 — Referral

🟡 Core foundation partially implemented; Phase 3 is not closed.

Implemented:
- attribution;
- server-side qualification;
- activation reward;
- qualified referral count;
- permanent referral achievement tasks;
- Telegram bootstrap/link foundation;
- lifetime 20% reward from qualifying base COIN/DZX activity.

Pending:
- user-facing Share with Friends production reward flow subject to a trusted completion signal;
- full referral acceptance tests and remaining UI acceptance.

## Later phases

### Phase 4 — Squad
⬜ Not started.

### Phase 5 — Reward Pool
⬜ Not started.

### Phase 6 — Packages
⬜ Not started.

### Phase 7 — Buying Points & Conversion UI
⬜ Not started.

### Phase 8 — Deposit
🟡 Foundation exists ahead of phase order; final implementation/verification pending.

### Phase 9 — Withdrawal
⬜ Not started.

### Phase 10 — Promo Codes
⬜ Not started.

### Phase 11 — User UI/UX
⬜ Foundation only; full acceptance pending.

### Phase 12 — Admin Panel
⬜ Not started.

### Phase 13 — Ledger / Security / Anti-Fraud hardening
⬜ Not started.

### Phase 14 — Final Testing & Production Release
⬜ Not started.

## Documentation reconciliation note

This update reconciles the status document with merged main commit `656f26f5ee4ac9d45d7705762f91a035322fde9a`. It records the validated User Create Tasks runtime boundary, Admin-controlled campaign pricing, initial `9 DZX` provisioning migration, and related regression coverage as completed. It does not claim implementation of provider-specific verification contracts, broader task adapters, Share with Friends reward authorization, or full Phase 2 acceptance.

## Update Rule

After every validated milestone, update this file with:
1. What was implemented.
2. What was actually tested.
3. Commit/reference used.
4. Remaining limitations.

Never mark unvalidated work as completed.
