# DzMoney 2.0 — Implementation Status

## Current State

**Current phase:** Phase 2 — Activity / Ads / Tasks. Backend foundations exist, but Phase 2 is **NOT CLOSED**.

**Documentation authority:** `PROJECT_ROADMAP.md` defines phase order/scope; `docs/ARCHITECTURE_RULES.md` defines architecture constraints; `ADR.md` records architectural decisions; `TODO.md` contains deferred non-blocking work.

**Repository boundary:** premature Squad runtime and temporary Monetag diagnostics were removed. Premature Phase 12 admin-provider runtime was removed. Migration `008_squad_engine.sql` remains immutable history; `009_cleanup_unreleased_squad.sql` keeps active environments aligned with the Phase 2 boundary.

## Phase 0 — Specification Lock

🟢 Completed.

- Internal currencies: COIN / DZX / DZP.
- TON is external reference/settlement only.
- `1 TON = 10,000 DZX = 10,000,000 COIN`.
- `1 DZP = 10 DZX = 10,000 COIN`.
- Referral, Squad and Reward Pool remain separate systems.
- Squad is a future reward modifier, not a direct DZX source.
- Withdrawal economics remain locked by the approved specification.

## Phase 1 — Economy & Currency Core

🟢 **CLOSED / VERIFIED.**

The canonical Economy and Ledger are the only economic source of truth. No second Economy or Ledger may be introduced.

Previously verified evidence includes migrations, Phase 1 tests, economy/ledger tests, reconciliation and health/database checks. Phase 1 must only be revisited for a newly demonstrated invariant or security failure.

## Phase 2 — Activity / Ads / Tasks

🟡 **IMPLEMENTED FOUNDATION — VERIFICATION PENDING.**

### Implemented

- Task definitions, attempts, advertisement contexts, verification gates and Daily Check-in state.
- Server-authoritative Execute → Verify task flow.
- Verification advertisement is distinct from task/reward-pool advertisement contexts.
- Reward is blocked until required verification succeeds.
- Reward uses the existing Economy/Ledger primitive and is idempotent.
- Task DZP uses the existing `earned_dzp` bucket.
- One active/pending attempt per user/task is enforced at database level.
- Daily Check-in backend enforces the 24-hour cooldown and advertisement gate.
- Daily Check-in HTTP boundary authenticates Telegram `initData` server-side and exposes the claim boundary.
- Advertisement ownership is checked server-side before verification/finalization.
- Reward finalization is not a client-callable economic operation; trusted provider callback is the verification/finalization boundary.
- Monetag integration includes server-generated YMID, server-side postback verification/finalization and centralized zone/context configuration.
- Temporary Monetag diagnostic UI/code was removed.

### Phase 2 Closure Gate

Phase 2 remains open until evidence exists for the **current commit** for all of the following:

- ⬜ Isolated migrations
- ⬜ `npm run test:all`
- ⬜ Economy/Ledger regression
- ⬜ Deposit regression
- ⬜ Phase 2 invariants
- ⬜ Daily Check-in service and HTTP integration
- ⬜ Task Catalog / Execution / Lifecycle / Verification configuration
- ⬜ Advertisement provider system
- ⬜ Monetag postback / YMID / finalization
- ⬜ Economy reconciliation
- ⬜ `/health` and `/health/db`
- ⬜ Real supported Telegram provider runtime behavior
- ⬜ Daily Check-in acceptance: claim → ad → trusted callback → reward
- ⬜ Anti-fraud review for callback ownership, replay and trust boundaries
- ⬜ Full CI green on the current commit

**No historical CI run, deployment success, or merged older PR is sufficient to close this gate.**

### Remaining Phase 2 implementation

- ⬜ Required real task adapters/verifiers for the approved Phase 2 task types.
- ⬜ Advertisement task flow without an unintended second verification advertisement.
- ⬜ Anti-fraud hardening.

## Later Phases

- Phase 3 Referral: ⬜ Not started.
- Phase 4 Squad: ⬜ Not started.
- Phase 5 Reward Pool: ⬜ Not started.
- Phase 6 Packages: ⬜ Not started.
- Phase 7 Conversion UI: ⬜ Not started.
- Phase 8 Deposit: 🟡 Foundation exists; phase implementation/verification remains pending by roadmap order.
- Phase 9 Withdrawal: ⬜ Not started.
- Phase 10 Promo Codes: ⬜ Not started.
- Phase 11 User UI/UX: ⬜ Initial shell only; full implementation not started.
- Phase 12 Admin Panel: ⬜ Not started.
- Phase 13 Security/Anti-Fraud: ⬜ Not started as a dedicated phase; Phase 2 blocking hardening remains part of the current gate.
- Phase 14 Final Testing/Release: ⬜ Not started.

## Documentation Reconciliation

- PR #26 is documentation-only but is based on an older `main` commit. It is **not** evidence for current state and must not be merged blindly.
- Current documentation must describe the authenticated Daily Check-in HTTP boundary as it exists on current `main`.
- Documentation must distinguish implemented backend boundaries from unverified production/runtime acceptance.
- No duplicate specification/TDD/YAGNI file is required; the existing architecture/ADR documents remain authoritative.

## Update Rule

After each validated milestone, record:
1. What was implemented.
2. What was actually tested.
3. The commit/reference used.
4. Remaining limitations.

Never mark unvalidated work as complete.
