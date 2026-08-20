# DzMoney 2.0 — Roadmap

> This roadmap is the implementation contract for the new DzMoney repository. Build in phases, validate each phase before moving to the next, and update `IMPLEMENTATION_STATUS.md` after every completed phase.

## Project Principles

- Backend is authoritative for balances, rewards, eligibility, Weight, Packages, referrals, Squad, Reward Pool, deposits and withdrawals.
- Financial and point changes use an auditable ledger; no direct client-side balance mutation.
- Admin settings change the real system/database configuration, not presentation-only values.
- Modules remain separated so a change in one subsystem does not destabilize unrelated subsystems.
- Category permissions are enforced by the backend as well as the UI.
- Earned DZP and Purchased DZP are distinct accounting buckets.
- Daily Activity DZP is distinct from the user's accumulated DZP balance.
- No legacy BUX terminology or legacy economy logic in the new core.

---

## Phase 0 — Specification & Architecture

**Goal:** freeze the domain model before implementation.

- [ ] Finalize repository structure.
- [ ] Define domain modules and service boundaries.
- [ ] Define database entities and relationships.
- [ ] Define ledger/event model.
- [ ] Define API conventions and authorization model.
- [ ] Define UTC+1 daily-cycle handling.
- [ ] Define idempotency and audit requirements.

**Exit criteria:** architecture is documented and no core module relies on frontend state.

## Phase 1 — Core Database & Ledger

**Goal:** establish the stable financial/accounting foundation.

- [ ] Users and Telegram identity.
- [ ] Wallets and balances: COIN, DZX, DZP.
- [ ] Earned DZP vs Purchased DZP accounting.
- [ ] Immutable transaction/ledger records.
- [ ] Balance snapshots/reconciliation.
- [ ] Admin settings storage.
- [ ] Audit log.
- [ ] Idempotency keys for reward/financial operations.

**Exit criteria:** balances can be credited/debited only through validated backend services and every change is auditable.

## Phase 2 — Economy & Conversion Engine

**Goal:** implement the configurable economy.

- [ ] Fixed default relationships:
  - `1 TON = 10,000 DZX`
  - `1 TON = 1,000,000 COIN`
  - `1,000 COIN = 1 DZP`
- [ ] Admin-editable conversion rates.
- [ ] COIN → DZP conversion.
- [ ] DZX → DZP conversion.
- [ ] DZX → Purchased DZP purchase flow.
- [ ] Clear separation between conversion and purchase accounting.
- [ ] Economy validation and transaction limits.

**Exit criteria:** all conversions are backend-authoritative, configurable, logged and reversible only through controlled ledger operations.

## Phase 3 — Tasks, Ads & Activity Engine

**Goal:** create the activity source that generates Daily Activity DZP.

### Task categories
- [ ] Daily Activity.
- [ ] Game Tasks.
- [ ] Social Tasks.
- [ ] Web Tasks.
- [ ] Special Tasks.
- [ ] Partner Tasks.

### Permissions
- [ ] User-created Game/Social/Web tasks.
- [ ] Special/Partner requests require Admin contact/review.
- [ ] Backend category/type validation prevents cross-category creation.
- [ ] Task approval/rejection workflow.

### Rewards
- [ ] Default task reward: `1000 COIN + 1 DZX + 1 DZP`.
- [ ] Configurable task reward settings.
- [ ] User-created task creator-funded rewards.
- [ ] Task Escrow.
- [ ] Cost benchmark: `1,000 visits = 0.90 TON = 9,000 DZX`; configurable by Admin.

### Ads
- [ ] Ads provider abstraction.
- [ ] AdsGram integration/verification boundary.
- [ ] Independent ad counters by context.
- [ ] Task/ad reward verification on backend.

### Daily Activity
- [ ] Daily Activity DZP from eligible task completions and ads.
- [ ] Qualified referral DZP included as defined by the economy rules.
- [ ] Daily Activity DZP is separate from accumulated DZP balance.

**Exit criteria:** valid activity produces exactly one auditable reward and cannot be double-counted.

## Phase 4 — Referral System

**Goal:** implement direct referrals independently from Squad and Reward Pool.

- [ ] Referral attribution.
- [ ] Qualification requires invited user to complete at least one task or watch at least one ad.
- [ ] One-time qualification reward: `10,000 COIN + 10 DZX + 10 DZP`.
- [ ] One-time referral DZP does not participate in lifetime 20% commission.
- [ ] Lifetime direct referral commission: 20% of eligible task/ad activity only.
- [ ] Lifetime commission pays COIN + DZX only.
- [ ] No commission from Squad or Reward Pool.
- [ ] Anti-self-referral and abuse controls.

**Exit criteria:** referral accounting is completely independent from Squad and Reward Pool accounting.

## Phase 5 — Hierarchical Squad Engine

**Goal:** implement the independent hierarchical Squad system.

- [ ] Automatic hierarchical membership propagation.
- [ ] Ten Admin-defined Squad levels.
- [ ] Admin-defined member threshold per level.
- [ ] Admin-defined percentage bonus per level.
- [ ] Daily activity condition: at least 50% of Squad members must perform at least one eligible task or ad activity.
- [ ] Both conditions (member threshold + 50% activity) must be satisfied.
- [ ] Qualified bonus becomes active for the following day.
- [ ] Squad bonus remains separate from Referral and Reward Pool.
- [ ] Squad hierarchy visualization/data API.

**Exit criteria:** hierarchy, level qualification and next-day bonus activation are deterministic and test-covered.

## Phase 6 — Packages & Weight Engine

**Goal:** implement one active package per user and its Weight multiplier.

### Packages
- [ ] Starter — 30 days.
- [ ] Growth — 60 days.
- [ ] Advanced — 90 days.
- [ ] Pro — 180 days.
- [ ] Elite — 360 days.
- [ ] Infinity — Lifetime.

### Rules
- [ ] Only one active package per user.
- [ ] No stacking.
- [ ] No new package purchase before current package expires.
- [ ] Package price controlled by Admin.
- [ ] Package multiplier controlled by Admin.
- [ ] Expiry automatically returns multiplier to `1.00x`.
- [ ] Purchased DZP can be used for packages but never increases Weight.
- [ ] Package purchase consumes Purchased DZP first where applicable.
- [ ] Optional package-themed profile styling tied to active package state.

**Exit criteria:** package state and multiplier are server-derived and cannot be manipulated from the client.

## Phase 7 — Reward Pool

**Goal:** distribute a daily TON pool according to activity Weight.

### Activation
- [ ] Reward Pool is available to all users.
- [ ] User must watch exactly 10 qualifying ads inside the Reward Pool page to activate participation.
- [ ] Ads watched in Tasks do not count toward Reward Pool activation.
- [ ] Independent Reward Pool ad counter and ledger.

### Weight
- [ ] Daily Activity DZP is the base activity measure.
- [ ] Purchased DZP never enters Weight.
- [ ] Effective Weight = Daily Activity DZP × active Package Multiplier.
- [ ] No active package = `1.00x`.
- [ ] User share = Effective Weight / total Effective Weight.

### Distribution
- [ ] Admin-configured daily TON distribution amount.
- [ ] Distribution occurs at the beginning of each day at UTC+1.
- [ ] Freeze previous-day activity before calculation.
- [ ] Calculate total effective activity.
- [ ] Create immutable distribution ledger entries.
- [ ] Credit TON rewards through the ledger.
- [ ] Provide user-facing explanation and Fair Play warning.

**Exit criteria:** a complete daily cycle can be calculated deterministically and reconciled from the ledger.

## Phase 8 — Wallet, Deposit & Withdrawal

**Goal:** implement controlled blockchain money flows.

### Deposit
- [ ] TON deposit flow.
- [ ] Blockchain detection.
- [ ] Confirmation/verification.
- [ ] Automatic TON → DZX conversion using configured rate.
- [ ] Deposited value is non-withdrawable until used according to system rules.
- [ ] Deposit ledger and reconciliation.

### Withdrawal
- [ ] Minimum default: `0.2 TON`.
- [ ] Required default balance conditions: `2,000,000 COIN + 2,000 DZX`.
- [ ] COIN/DZX requirements configurable by Admin.
- [ ] Required COIN/DZX deducted after withdrawal according to transaction rules.
- [ ] Withdrawal fees charged to the user when enabled.
- [ ] Network verification and payout state machine.
- [ ] Anti-duplicate payout protection.

**Exit criteria:** every deposit/withdrawal is verifiable, idempotent and auditable.

## Phase 9 — User App UI/UX

**Goal:** build the final user-facing experience on top of stable APIs.

### Home
- [ ] COIN, DZX, DZP balances.
- [ ] Promo Code field.
- [ ] Promo Code Claim/Redeem requires qualifying ad view before reward release.
- [ ] Squad card with member count and level.
- [ ] Reward Pool card/status.
- [ ] My Package card.
- [ ] Coming Soon card.
- [ ] Daily Activity DZP.
- [ ] Daily Total Activity.

### Bottom navigation
- [ ] Home.
- [ ] Tasks.
- [ ] Packages (center).
- [ ] Referral.
- [ ] Wallet.

### User drawer
- [ ] Right-to-left drawer covering approximately 85% of the screen.
- [ ] Username and avatar.
- [ ] COIN/DZX/DZP balances.
- [ ] Squad and status.
- [ ] Reward Pool status.
- [ ] Daily Activity DZP.
- [ ] Daily Total Activity.

### Packages UI
- [ ] Distinct names, colors and visual identities.
- [ ] Active package badge.
- [ ] Optional profile accent/theme matching active package until expiry.

### Informational pages
- [ ] Squad explanation, requirements and Fair Play warning.
- [ ] Reward Pool explanation, activation requirements and Fair Play warning.

**Exit criteria:** UI consumes live backend data, does not own business logic, and page refreshes do not reset navigation state.

## Phase 10 — Admin Panel

**Goal:** create a professional operational control center.

- [ ] Live Dashboard.
- [ ] Users/User Management.
- [ ] Economy.
- [ ] DZP settings and user balance controls with audit.
- [ ] Tasks and Task Requests.
- [ ] Ads.
- [ ] Referral.
- [ ] Squad.
- [ ] Reward Pool.
- [ ] Packages.
- [ ] Deposits.
- [ ] Withdrawals.
- [ ] Promo Codes.
- [ ] Notifications.
- [ ] System settings.
- [ ] Audit logs.

### Dashboard
- [ ] Live member count.
- [ ] Live ads watched count.
- [ ] Live tasks completed count.
- [ ] Seven-day bar charts with different colors.
- [ ] Top 10 active members.
- [ ] Top 10 referrers.

**Exit criteria:** every editable value is connected to the actual backend setting or ledger and every sensitive action is audited.

## Phase 11 — Security, Anti-Fraud & Reliability

- [ ] Authentication and authorization hardening.
- [ ] Telegram WebApp identity verification.
- [ ] Rate limiting.
- [ ] Replay/idempotency protection.
- [ ] Reward abuse detection.
- [ ] Referral abuse detection.
- [ ] Ad verification abuse detection.
- [ ] Task completion abuse detection.
- [ ] Squad manipulation detection.
- [ ] Reward Pool manipulation detection.
- [ ] Financial anomaly detection.
- [ ] Admin action audit trail.
- [ ] Secrets/configuration review.
- [ ] Database backup/recovery procedure.

## Phase 12 — Testing, Integration & Production

- [ ] Unit tests for every economy formula.
- [ ] Integration tests for ledgers and transactions.
- [ ] Task/Ad reward idempotency tests.
- [ ] Referral tests.
- [ ] Squad hierarchy and next-day bonus tests.
- [ ] Package expiry tests.
- [ ] Reward Pool daily-cycle tests.
- [ ] Deposit/withdrawal state tests.
- [ ] Admin setting propagation tests.
- [ ] End-to-end Telegram Mini App tests.
- [ ] Load/performance testing.
- [ ] Production environment configuration.
- [ ] Monitoring and error reporting.
- [ ] Final security audit.
- [ ] Production deployment.

---

## Definition of Done for Every Phase

A phase is not considered complete merely because code exists. It must have:

1. Backend implementation.
2. Database/migration changes where required.
3. Validation and authorization.
4. Tests for critical rules.
5. No hard-coded Admin-controlled business values.
6. Audit/ledger coverage for financial or reward changes.
7. Documentation updated.
8. `IMPLEMENTATION_STATUS.md` updated with the completed work.
9. Regression check against previously completed phases.

## Current Position

The project is at **Phase 0 — Specification & Architecture**. The agreed business rules are documented in this roadmap and will be translated into the new repository incrementally. No legacy implementation should be copied blindly into the new core.
