# DzMoney 2.0 — Implementation Status

## Current state

**Current phase:** Phase 2 — Activity / Ads / Tasks, with Phase 3 Referral core partially implemented.

**Specification:** `PROJECT_ROADMAP.md` is the product specification. `docs/ARCHITECTURE_RULES.md` and `ADR.md` govern implementation/change control.

**Current main:** `0a7138d1dfe2e68e3620c56c33af1698fd2d1e0d`.

**Current CI evidence:** PR #114 CI run #431 (`32881938993`) passed for the exact head `e72754cd0f9e9884c43af52c67f51e954cbec93e`; post-merge main CI run #432 (`32882089264`) also passed for exact main commit `0a7138d1dfe2e68e3620c56c33af1698fd2d1e0d`.

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
- ⬜ Broader anti-fraud hardening around task/ad callbacks and verification.
- ⬜ Full acceptance of advertisement-task behavior across all required providers/contexts.

Phase 2 remains open until its remaining implementation and acceptance criteria are completed and verified.

## Daily task rules currently locked by implementation/contract

- `Daily Check-in`: rolling 24-hour backend cooldown.
- `Check for Update`: once per UTC+1 calendar day; server-side Telegram membership verification is required.
- `View Ads`: once per UTC+1 calendar day; the advertisement itself is the completion event and uses the existing trusted task-advertisement path.
- `Share with Friends`: intended once per UTC+1 calendar day and must use the user's referral link, but no reward is enabled until a trusted server-verifiable completion signal exists.
- `Invite 1/10/20/50/100`: permanent achievement thresholds based on canonical qualified referrals; each threshold is claimable once and requires the existing verification-ad gate before reward finalization.

## Task completion service contract — specification locked, runtime pending

🟡 **Specification recorded; no production behavior changed.**

The creator-facing completion choice for supported user-created task categories is now documented in `docs/TASK_COMPLETION_SERVICE_CONTRACT.md` and `ADR.md` (ADR-0010):

- **Open Link → Click Proof** — use when opening the configured link is itself the task outcome.
- **Server Verified** — use when the creator requires trusted proof of an external outcome beyond opening the link.

For Server Verified tasks, the future User Create Tasks UI must derive and display, when the applicable provider contract exists:
- Verification Source;
- Evidence Type;
- Verification Method;
- Required User Input.

The UI must not invent required inputs, and an unimplemented provider must not be exposed as an operational verification option. Mini App `initData` is documented as an identity/authentication boundary, not by itself proof of arbitrary in-Mini-App completion.

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

This update records the task completion-service specification only. It does not change production behavior or the validated implementation state on `main`. The specification branch is based on merged main commit `0a7138d1dfe2e68e3620c56c33af1698fd2d1e0d`.

## Update Rule

After every validated milestone, update this file with:
1. What was implemented.
2. What was actually tested.
3. Commit/reference used.
4. Remaining limitations.

Never mark unvalidated work as completed.
