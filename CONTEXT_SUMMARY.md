# DzMoney — Context Summary

## Snapshot

- **Authoritative main baseline:** `de1280d42f3f2d438665b9708f1ac2ae9c3abc99`.
- **Current phase:** Phase 2 — Activity / Ads / Tasks remains open; Phase 3 Referral core is partially implemented.
- **Latest authoritative milestone:** PR #148, covering the current TON/Deposit hardening milestone.
- **Documentation reconciliation:** `IMPLEMENTATION_STATUS.md` has been reconciled to the current main baseline.

## Validated architecture

- `activity_tasks` remains the task catalog/source of truth.
- Existing Task Execution, Task Verification, Advertisement, Referral and Economy/Ledger boundaries must be reused.
- No second reward store, ledger, economy, verification system or referral counter is allowed.
- Daily Check-in uses rolling 24 hours; Daily system tasks use the documented UTC+1 calendar-day policy where applicable.
- Referral achievements are permanent and threshold-based.
- Share with Friends must not reward from an untrusted frontend-only share/click/dialog signal.
- Referral lifetime 20% applies only to qualifying base COIN/DZX activity and flows through the existing Economy/Ledger boundary.

## Phase 2 evidence status

### Proven trusted evidence

- **Telegram Channel Membership:** existing `telegram-channel-verifier.js` uses Telegram Bot API `getChatMember` with authenticated Telegram identity and accepts the documented membership states.
- **Monetag:** existing provider postback contract validates the documented provider fields and supplies the provider reference through the existing adapter boundary.
- **OnClickA:** existing adapter requires authenticated provider postback evidence, validates the configured spot and binds the reference to the supplied user identity.

### Not proven as generic task-completion evidence

- Daily provider-specific completion beyond the existing advertisement-event boundary.
- Game / Mini App completion from a concrete trusted backend provider contract.
- Non-Telegram social actions without an authoritative provider event/API.
- Web completion without a signed S2S webhook or authenticated server-bound single-use token.
- Special/Partner completion without a concrete partner authenticity/signature/HMAC contract and identity binding.

Generic `SERVER_VERIFIED_CONTRACTS` entries are not evidence and must not be treated as enabled providers.

## Referral status

Implemented in the current main baseline:

- attribution;
- server-side qualification;
- activation reward;
- qualified referral count;
- permanent referral achievement tasks;
- Telegram bootstrap/referral-link foundation;
- lifetime 20% reward from qualifying base COIN/DZX activity.

Still pending:

- production Share with Friends reward flow requiring trusted completion evidence;
- remaining referral UI/acceptance coverage.

## TON Deposit status

The current main milestone contains the server-side blockchain evidence gate, transaction normalization, finality handling, trace binding, persisted network handling and related validation. Automated validation is part of the CI baseline.

Production acceptance remains a separate operational gate and is not inferred from tests alone.

## Open/stale work interpretation

- Open Issues are not automatically unimplemented features.
- Work already present in merged `main` must be reconciled rather than reimplemented.
- PRs #146/#147 are not separate implementation milestones where superseded by merged PR #148.
- Issue #134 remains the Phase 2 evidence-contract gate for any new verifier.

## Remaining work

- Phase 2: concrete trusted evidence contracts and implementations only where an actual provider/evidence source is proven.
- Phase 2: broader anti-fraud and provider/context acceptance hardening.
- Phase 3: trusted Share with Friends completion/reward flow and remaining acceptance.
- Later phases remain gated by the roadmap and phase-isolation rules.

## Next authorized action

After this documentation reconciliation, freeze the authoritative baseline and proceed with Phase 2 evidence-contract work only where concrete, testable provider evidence exists. Tests must precede newly authorized implementation, and no duplicate Task/Verification/Reward/Economy/Ledger source of truth may be introduced.
