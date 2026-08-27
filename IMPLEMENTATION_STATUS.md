# DzMoney 2.0 — Implementation Status

## Current state

**Current phase:** Phase 2 — Activity / Ads / Tasks remains open; Phase 3 Referral core is partially implemented.

**Current authoritative main:** `de1280d42f3f2d438665b9708f1ac2ae9c3abc99` (PR #148 milestone).

**CI evidence:** The current main baseline has the Phase 2 boundaries workflow with migrations, runtime health, full `test:all`, and economy reconciliation. `test:all` explicitly includes the baseline suites and ends with `reconcile:economy`.

**Reconciliation rule:** Only merged commits on `main` are treated as completed. Open, superseded, or stale Issues/PRs are not implementation evidence by themselves.

## Phase 0 — Specification Lock

🟢 Completed.

The economic and architectural rules remain those defined by the project roadmap, architecture rules, ADRs, Constitution 54, and the phase-specific contracts.

## Phase 1 — Economy & Currency Core

🟢 Runtime verified and signed off.

- Internal wallet currencies: COIN, DZX, DZP.
- TON is external settlement/reference, not an internal wallet currency.
- Economy/Ledger remains the single economic source of truth.
- Economy reconciliation exists and is included in the full test suite.

No Phase 1 refactor is authorized unless a new invariant or security defect is proven.

## Phase 2 — Activity / Ads / Tasks

🟡 Partially implemented; not closed.

### Implemented and merged

- `activity_tasks`, task attempts, verification gates and Daily Check-in state.
- Non-ad Task Execute → Verify flow.
- Server-authoritative task verification boundary.
- Verification-ad gate before trusted task verification.
- Provider-neutral advertisement registry and trusted provider ingress.
- Tasks-page advertisement direct ad → reward flow through existing Advertisement/Economy/Ledger boundaries.
- Daily Check-in with backend rolling 24-hour cooldown and advertisement gate.
- Daily `Check for Update` system task with UTC+1 calendar-day eligibility and Telegram membership verification.
- Daily `View Ads` system task with UTC+1 calendar-day eligibility and existing Tasks-page advertisement provider flow.
- Daily system-task contract for rolling 24-hour versus UTC+1 calendar-day policies and permanent referral achievement thresholds.
- Telegram-channel server verification through the existing Task Verification boundary.
- User Create Tasks runtime UI and authenticated HTTP boundary for Game/Social/Web.
- Creator target, pricing, review/rejection and Economy/Ledger debit/refund boundaries.
- Provider-neutral trusted-evidence configuration seam without treating configuration as provider proof.
- Server-side rejection of provider credentials/secrets in task configuration.
- Existing Monetag and OnClickA advertisement-provider evidence boundaries.

### Trusted evidence status

🟢 **Proven:** Telegram Channel Membership through the existing `telegram-channel-verifier.js` and Telegram Bot API `getChatMember` using authenticated Telegram identity.

🟢 **Proven as advertisement-provider evidence:** Monetag and OnClickA postback contracts. These are not generic proof of arbitrary task completion.

🟡 **Still requiring concrete evidence contracts:**

- Daily provider-specific completion beyond the existing ad-event boundary.
- Game / Mini App completion from an actual trusted backend contract.
- Non-Telegram social actions without an authoritative provider event/API.
- Web completion without a signed S2S webhook or authenticated, server-bound single-use token.
- Special/Partner completion without an actual partner authenticity/signature/HMAC contract and identity binding.

**Important:** Generic `SERVER_VERIFIED_CONTRACTS` configuration entries are contracts/placeholders, not evidence that an external provider exists. They must remain non-operational until concrete provider evidence is available.

### Not yet implemented / accepted

- ⬜ Daily `Share with Friends` production reward flow; opening a share UI or generating a referral link is not proof of an actual Telegram share.
- ⬜ Broader real task adapters/verifiers for categories whose trusted provider evidence is not yet proven.
- 🟡 Provider/Partner-specific Creator Input contracts remain undefined until an actual provider/partner contract exists.
- ⬜ Broader anti-fraud hardening around task/ad callbacks and verification.
- ⬜ Full acceptance of advertisement-task behavior across all required providers/contexts.

**Phase 2 remains open.** No new verifier is authorized until its concrete evidence contract is proven and testable.

## Task completion service contract

🟡 Specification is locked and the current User Creator runtime boundary is implemented for the supported Game/Social/Web creator surface.

- **Open Link → Click Proof:** opening the configured link is the task outcome; the URL itself is not evidence for another verification type.
- **Server Verified:** trusted server-verifiable evidence is required.
- **Special/Partner:** remains Admin-only and Server Verified only.

The creator surface reuses the existing verification source of truth and does not create a second Task/Verification/Reward system.

## Phase 3 — Referral

🟡 Core foundation implemented; Phase 3 is not closed.

Implemented and evidenced in current main:

- referral attribution;
- server-side qualification;
- activation reward;
- qualified referral count;
- permanent referral achievement tasks;
- Telegram bootstrap/referral-link foundation;
- lifetime 20% reward from qualifying base COIN/DZX activity through the existing Economy/Ledger path.

Pending:

- user-facing Share with Friends production reward flow subject to a trusted completion signal;
- remaining referral UI/acceptance coverage.

## TON Deposit

🟡 Implementation and automated validation are advanced; production acceptance remains separate.

The current main milestone includes server-side blockchain evidence validation, transaction normalization, finality handling, trace binding, persisted network handling, and the deposit evidence gate. Automated validation is included in the CI baseline.

Production acceptance must still be demonstrated with the real deployment/provider configuration and operational checks; no production success is assumed merely from tests.

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
🟡 Foundation/implementation exists ahead of phase order; production acceptance remains pending.

### Phase 9 — Withdrawal
⬜ Not started.

### Phase 10 — Promo Codes
⬜ Not started.

### Phase 11 — User UI/UX
⬜ Foundation only; full acceptance pending.

### Phase 12 — Admin Panel
⬜ Not started.

### Phase 13 — Ledger / Security / Anti-Fraud hardening
⬜ Not started as a standalone phase; relevant security hardening already exists in earlier milestones and must not be duplicated.

### Phase 14 — Final Testing & Production Release
⬜ Not started.

## Governance / reconciliation

- `main` at `de1280d...` is the authoritative implementation baseline used for this reconciliation.
- PR #148 is the authoritative merged TON/Deposit milestone for the current baseline.
- PRs #146/#147 must not be treated as separate implementation milestones if their work is superseded by #148.
- Issue state is not proof of missing implementation. Issues describing behavior already present in `main` require reconciliation rather than reimplementation.
- Issue #134 remains the active Phase 2 trusted-evidence specification gate.
- Branch-protection status could not be conclusively established with the currently available integration permissions; no assumption is made either way.

## Documentation reconciliation note

This update supersedes the previously stale `main` reference (`efc567b...`) and records `de1280d...` as the current authoritative baseline. It intentionally does not claim production acceptance, a real external Game/Web/Partner provider, or Share-with-Friends completion evidence where those have not been proven.

## Next authorized work

1. Reconcile the remaining canonical project context documentation against this baseline.
2. Keep stale Issues/PRs from being mistaken for unimplemented features.
3. Continue Phase 2 evidence-contract work only for categories with concrete, testable provider evidence.
4. TDD before any newly authorized implementation.
5. Reuse the existing Task, Verification, Advertisement, Referral and Economy/Ledger boundaries; no duplicate sources of truth.
6. Do not advance to a later phase until the current phase acceptance criteria are satisfied.

## Update Rule

After every validated milestone, update this file with:
1. What was implemented.
2. What was actually tested.
3. Commit/reference used.
4. Remaining limitations.

Never mark unvalidated work as completed.
