# DzMoney 2.0 — Implementation Status

## Current state

**Current phase:** Phase 2 — Activity / Ads / Tasks, with Phase 3 Referral core partially implemented.

**Specification:** `PROJECT_ROADMAP.md` is the product specification. `docs/ARCHITECTURE_RULES.md` and `ADR.md` govern implementation/change control.

**Current main:** `808adfc052812554d1903691f948dfcddbd0a472`.

**Current CI evidence:** GitHub Actions run #405 (`32865975721`) for the current `main` commit completed successfully. The repository must still treat any later commit as requiring its own CI result.

**Important reconciliation:** The earlier Phase 2/Phase 3 status below had become stale as later merged PRs added Daily system tasks and Referral foundations. This file now records only the state that is actually present on `main`.

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

### Referral work now present on main as Phase 3 foundation

- 🟢 Immutable one-level referral attribution.
- 🟢 Server-side qualification from verified task or advertisement evidence.
- 🟢 One-time referral activation reward through the existing Economy/Ledger path.
- 🟢 Canonical qualified-referral count used by permanent achievement eligibility.
- 🟢 Permanent referral achievement catalog/tasks: Invite 1, 10, 20, 50 and 100 Friends.
- 🟢 Achievement claims use existing verified `task_attempts` state and the existing verification-ad/economy path; no second achievement store exists.

### Not yet implemented / accepted

- ⬜ Daily `Share with Friends` production reward flow. The user-facing requirement is Telegram share of the user's referral link once per UTC+1 calendar day, but the current backend has no trusted completion signal for an actual share and the current referral HTTP/bootstrap/link flow is not implemented. A frontend-only signal must not authorize an economic reward.
- ⬜ Referral HTTP/bootstrap integration and user-facing canonical referral-link exposure.
- ⬜ Referral lifetime 20% reward from qualifying daily base task/advertisement activity.
- ⬜ Real task adapters/verifiers for the broader Daily/Game/Social/Web/Special-Partner task catalog beyond the currently implemented Daily Check for Update path.
- ⬜ Broader anti-fraud hardening around task/ad callbacks and verification.
- ⬜ Full acceptance of advertisement-task behavior across all required providers/contexts.

Phase 2 remains open until its remaining implementation and acceptance criteria are completed and verified.

## Daily task rules currently locked by implementation/contract

- `Daily Check-in`: rolling 24-hour backend cooldown.
- `Check for Update`: once per UTC+1 calendar day; server-side Telegram membership verification is required.
- `View Ads`: once per UTC+1 calendar day; the advertisement itself is the completion event and uses the existing trusted task-advertisement path.
- `Share with Friends`: intended once per UTC+1 calendar day and must use the user's referral link, but no reward is enabled until a trusted server-verifiable completion signal exists.
- `Invite 1/10/20/50/100`: permanent achievement thresholds based on canonical qualified referrals; each threshold is claimable once and requires the existing verification-ad gate before reward finalization.

## Phase 3 — Referral

🟡 Core foundation partially implemented; Phase 3 is not closed.

Implemented:
- attribution;
- qualification;
- activation reward;
- qualified referral count;
- permanent referral achievement tasks.

Pending:
- Telegram/user bootstrap attribution integration and canonical referral-link exposure;
- lifetime 20% referral earnings from qualifying base activity;
- user-facing referral UI and full acceptance tests.

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

The previous status file incorrectly described Phase 3 as not started and did not include the merged Daily `Check for Update`, `View Ads`, and Referral achievement work. Those statements were stale relative to `main` and have been corrected here. No production behavior is changed by this documentation reconciliation.

## Update Rule

After every validated milestone, update this file with:
1. What was implemented.
2. What was actually tested.
3. Commit/reference used.
4. Remaining limitations.

Never mark unvalidated work as completed.
