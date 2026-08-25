# DzMoney 2.0 — Implementation Status

## Current state

**Current phase:** Phase 2 — Activity / Ads / Tasks, with Phase 3 Referral core partially implemented.

**Specification:** `PROJECT_ROADMAP.md` is the product specification. `docs/ARCHITECTURE_RULES.md` and `ADR.md` govern implementation/change control.

**Current main:** `193abce3baf9a4e088a635b9bc735ffa4721b313`.

**Current CI evidence:** PR #118 CI run #439 passed for the exact head that introduced the task-type Server Verified contract documentation. The documentation-only PR was then squash-merged to `main` as `193abce3baf9a4e088a635b9bc735ffa4721b313`. No production behavior was changed by that PR.

**Important reconciliation:** This status file is reconciled to the merged `main` state. Only merged commits on `main` are treated as completed.

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
- 🟢 Social Telegram-channel server verification through the existing Task Verification boundary; task-specific Telegram channels are preserved through verification-config resolution.
- 🟢 Task completion-service contract: supported creator-facing modes are Open Link → Click Proof and Server Verified; Special/Partner is Server Verified only.
- 🟢 Task-type Server Verified contract boundaries documented for Daily, Mini App, Social, Web and Special/Partner, including source, evidence, verification method, identity correlation, required user input and replay/idempotency requirements.
- 🟢 Creator-input rule documented: future User Create Tasks UI must consume the applicable verification contract and must not maintain a second hand-authored mapping of verification fields.

### Referral work now present on main as Phase 3 foundation

- 🟢 Immutable one-level referral attribution.
- 🟢 Server-side qualification from verified task or advertisement evidence.
- 🟢 One-time referral activation reward through the existing Economy/Ledger path.
- 🟢 Canonical qualified-referral count used by permanent achievement eligibility.
- 🟢 Permanent referral achievement catalog/tasks: Invite 1, 10, 20, 50 and 100 Friends.
- 🟢 Achievement claims use existing verified `task_attempts` state and the existing verification-ad/economy path; no second achievement store exists.
- 🟢 Referral Telegram bootstrap foundation and referral-link test coverage are present in the repository test suite.
- 🟢 Canonical user-facing referral link support is present and covered by `test:referral-link`.
- 🟢 Referral lifetime 20% reward from qualifying base COIN/DZX activity is merged through the existing Economy/Ledger path and covered by `test:referral-lifetime`.

### Not yet implemented / accepted

- ⬜ Daily `Share with Friends` production reward flow. The requirement is Telegram share of the user's referral link once per UTC+1 calendar day, but the current backend has no trusted completion signal for an actual share. A frontend-only signal must not authorize an economic reward.
- ⬜ Real task adapters/verifiers for the broader Daily/Game/Social/Web/Special-Partner task catalog beyond the currently implemented Telegram Social verifier and Daily Check for Update path.
- ⬜ User Create Tasks runtime UI for the completion-service contract and task-type-specific Server Verified inputs.
- ⬜ Broader anti-fraud hardening around task/ad callbacks and verification.
- ⬜ Full acceptance of advertisement-task behavior across all required providers/contexts.

Phase 2 remains open until its remaining implementation and acceptance criteria are completed and verified.

## Task completion service contract — specification locked, runtime pending

🟡 **Specification recorded; no production behavior changed by the documentation work.**

The creator-facing completion choice for supported user-created task categories is documented in `docs/TASK_COMPLETION_SERVICE_CONTRACT.md` and `ADR.md`:

- **Open Link → Click Proof** — use when opening the configured link is itself the task outcome.
- **Server Verified** — use when the creator requires trusted proof of an external outcome beyond opening the link.

For Server Verified tasks, the future User Create Tasks UI must derive and display, when the applicable provider contract exists:
- Verification Source;
- Evidence Type;
- Verification Method;
- Required User Input.

The UI must not invent required inputs, and an unimplemented provider must not be exposed as an operational verification option. Mini App `initData` is documented as an identity/authentication boundary, not by itself proof of arbitrary in-Mini-App completion.

Special/Partner is contractually restricted to Server Verified only; this restriction is not merely a UI choice and must be enforced server-side when runtime task-configuration support is implemented.

This documentation change does **not** mark the broader task adapters/verifiers or User Create Tasks UI as implemented.

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

The abandoned/closed earlier PRs that proposed a combined Referral foundation are not evidence of implementation; only merged commits on `main` count.

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

This update reconciles the status document with merged main commit `193abce3baf9a4e088a635b9bc735ffa4721b313`. It records the task completion-service and task-type Server Verified specification as completed documentation work only. It does not change production behavior or claim runtime implementation of unimplemented providers or User Create Tasks UI.

## Update Rule

After every validated milestone, update this file with:
1. What was implemented.
2. What was actually tested.
3. Commit/reference used.
4. Remaining limitations.

Never mark unvalidated work as completed.
