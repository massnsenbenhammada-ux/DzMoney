# DzMoney 2.0 — Phase 2 Design Review

## Status

Design review completed. **No Phase 2 implementation is authorized by this document alone.** Implementation starts only after the Phase 2 design is explicitly approved.

## 1. Scope

Phase 2 covers Activity, Advertisements, Daily Check-in and the task engine.

The backend/database remains authoritative for completion, rewards, balances and ledger entries.

## 2. Economic contract

Default qualifying activity reward:

**1,000 COIN + 1 DZX + 1 DZP**

The reward is Admin-configurable.

For qualifying activity, the resulting `earned_dzp` is the only DZP bucket that contributes to Daily Activity / Reward Pool weight.

The following must never be reclassified as earned activity:

- converted DZP;
- purchased DZP;
- deposited DZX;
- transferred value;
- Referral rewards;
- Squad modifier output;
- Reward Pool distributions;
- Promo rewards.

Promo may issue COIN or DZX according to its campaign configuration. Squad modifies an underlying qualifying reward; it does not mint an independent Squad reward.

## 3. Advertisement architecture

There are distinct advertisement contexts:

### Activity/Task ads
Ads used as qualifying activity or as a verification gate for tasks.

### Reward Pool ads
Ads viewed inside the Reward Pool page. They are counted only toward the Reward Pool activation requirement and must never be counted as Task ads.

### Daily Check-in ad
Daily Check-in is ad-gated. The configured Daily Check-in reward is issued only after the required ad completion is authoritatively confirmed.

### Verification ad
A short ad shown after the user presses Verify on a non-advertisement task. It is a gate only and creates no separate reward.

Each ad event must carry an explicit context/source so one ad cannot satisfy another subsystem's counter accidentally.

## 4. Advertisement completion

Frontend ad callbacks are not authoritative.

The server must validate the ad completion using the configured provider integration and an idempotent event/reference.

Opening an ad is not completion.

A duplicate callback, refresh, retry or replay must not produce a second reward or increment a protected counter twice.

## 5. Daily Check-in

Daily Check-in is one reward opportunity per account per configured cooldown window.

Default cooldown: 24 hours.

Required flow:

**Claim → required ad → verified ad completion → server-side eligibility check → reward**

Rules:

- Claim must not permanently consume the reward before successful ad completion.
- Failed/abandoned ad completion does not issue the reward.
- Successful completion issues exactly one reward.
- The next eligible timestamp is calculated by the backend.
- The frontend displays the cooldown but does not decide eligibility.
- Duplicate callbacks cannot reset or bypass the cooldown.

## 6. Task categories

Phase 2 supports strict categories:

- Daily Tasks
- Game Tasks
- Social Tasks
- Web Tasks
- Special/Partner Tasks

Advertisement items are not treated as ordinary task verification flows.

User-created tasks are limited to the categories allowed by the roadmap. Special/Partner campaigns require the Admin/partner workflow.

## 7. Non-advertisement task interaction

Every non-advertisement task exposes exactly two primary actions:

1. **Execute**
2. **Verify**

The required flow is:

**Execute → Verify → short verification ad → authoritative server verification → reward**

The short verification ad is configurable to 5 or 10 seconds through backend/Admin configuration.

The frontend must not be able to choose a different duration and must not be able to mark the gate as complete by itself.

## 8. Task verification states

The task engine should distinguish at minimum:

`available → executing/attempted → verification_pending → ad_gate_pending → verifying → verified/rejected`

A verified task can receive its reward once only.

A rejected task receives no reward.

An expired or disabled task cannot be verified successfully.

## 9. Reward calculation

The reward calculation must occur server-side after successful verification.

Conceptually:

`base reward → applicable Admin configuration → Squad modifier, if active → final reward`

The Squad modifier changes the qualifying reward amount according to the applicable Admin percentage. It does not create a second transaction described as a standalone Squad reward.

Referral processing, when applicable, is a separate downstream economic action based only on qualifying base activity rules. It must never treat the Squad modifier as a separate base activity source.

## 10. Ledger/source rules

Every reward must preserve its true economic source.

Examples:

- advertisement activity → `advertisement`
- task activity → `task`
- referral → `referral`
- Reward Pool distribution → `reward_pool`
- deposit → `deposit`
- Promo DZX → `promo`

Verification ads use audit metadata such as `verification_gate=true` and a verification reference, but are not a reward source by themselves.

The ledger must preserve balance-before, balance-after, currency, amount, source and idempotency/reference information.

## 11. Idempotency and anti-duplication

The following operations must be idempotent:

- ad completion reward;
- Daily Check-in reward;
- task verification reward;
- verification-ad completion;
- protected task counters;
- protected Reward Pool counters.

A single logical event must have one economic effect even if the provider or client sends it multiple times.

## 12. Reward Pool boundary

Phase 2 must not implement Reward Pool distribution logic.

However, Phase 2 must emit enough explicit source/activity information for the later Reward Pool phase to distinguish:

- qualifying activity DZP;
- Reward Pool ads;
- Task ads;
- converted/purchased/deposited value;
- other DZX sources.

Reward Pool-page advertisements must have a separate context and must not accidentally satisfy Task or Daily Activity counters unless the later approved design explicitly says so.

## 13. Admin settings required before implementation

Phase 2 should read real backend settings for at least:

- standard activity COIN reward;
- standard activity DZX reward;
- standard activity earned DZP reward;
- Daily Check-in reward values;
- Daily Check-in cooldown;
- verification-ad duration (5 or 10 seconds);
- task-category enable/disable state;
- task reward overrides where supported;
- ad-gating requirements.

No authoritative Phase 2 economic value should be hard-coded in frontend code.

## 14. Acceptance criteria

Phase 2 cannot be marked complete unless all of these are verified:

- [ ] Advertisement completion is server-authoritative.
- [ ] Advertisement rewards are idempotent.
- [ ] Daily Check-in is ad-gated and cooldown-enforced server-side.
- [ ] Daily Check-in cannot be claimed twice in one cooldown window.
- [ ] Every non-ad task exposes Execute and Verify.
- [ ] Verify requires the configured 5/10-second verification ad.
- [ ] Verification ad completion alone never grants the task reward.
- [ ] Server-side task verification decides success/failure.
- [ ] Failed verification grants nothing.
- [ ] Successful verification grants the configured reward exactly once.
- [ ] Repeated Verify requests and ad callbacks cannot duplicate rewards.
- [ ] Task, advertisement, Reward Pool and verification-ad contexts are distinguishable.
- [ ] Standard reward is `1,000 COIN + 1 DZX + 1 DZP` unless Admin configuration changes it.
- [ ] Only qualifying earned DZP contributes to activity weight.
- [ ] Squad is applied as a modifier and never emitted as an independent reward source.
- [ ] Referral remains independent from Squad and Reward Pool.
- [ ] Promo remains independent and can reward COIN or DZX according to configuration.
- [ ] All economic effects are atomic and ledger-backed.
- [ ] Phase 1 regression tests remain green after Phase 2 implementation.

## 15. Explicit non-goals

Phase 2 must not implement:

- Referral engine;
- Squad engine;
- Reward Pool distribution;
- Packages;
- Deposit redesign;
- Withdrawal redesign;
- Admin UI redesign;
- unrelated legacy/BUX compatibility logic.

Those systems may consume Phase 2's explicit events and ledger records later, but they remain isolated subsystems.
