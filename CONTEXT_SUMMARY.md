# DzMoney — Context Summary

## Snapshot

- Current main commit: `808adfc052812554d1903691f948dfcddbd0a472`.
- Current main CI: GitHub Actions run #405 (`32865975721`) passed.
- Current phase: Phase 2 Activity/Ads/Tasks remains open; Phase 3 Referral core is partially implemented.
- Open PR at the time of this summary: PR #103, a documentation-only Share-with-Friends trust-boundary change based on the previous `main` commit and therefore stale relative to current main.

## Recently completed validated milestones

1. Daily system-task contract (#98) — merged.
2. Daily Check for Update lifecycle (#101) — merged; UTC+1 calendar-day eligibility and server-side Telegram membership verification.
3. Daily View Ads lifecycle (#102) — merged; UTC+1 calendar-day eligibility and existing trusted task-advertisement flow.
4. Referral activation (#96) — merged; one-time 10,000 COIN + 10 DZX + 10 DZP through the existing Economy/Ledger path.
5. Permanent Referral achievements (#104) — merged; Invite 1/10/20/50/100 based on canonical qualified referrals and existing task verification state.

## Architectural decisions

- `activity_tasks` remains the task catalog/source of truth.
- Existing Task Execution, Task Verification, Advertisement, Referral and Economy/Ledger boundaries must be reused.
- No second reward store, ledger, economy, verification system or referral counter is allowed.
- Daily Check-in uses rolling 24 hours; Check for Update and View Ads use UTC+1 calendar-day eligibility.
- Referral achievements are permanent, not time-based; each threshold is claimable once.
- Share with Friends must not reward from an untrusted frontend-only share/click/dialog signal.
- Referral lifetime 20% applies only to qualifying base task/advertisement activity before Squad modifiers and excludes activation, Squad, Reward Pool, Promo, packages and referral earnings.

## Remaining work

- Share with Friends: implement only after the existing codebase provides or can safely integrate a trusted server-verifiable completion signal and canonical referral-link bootstrap. Do not invent a callback or second state store.
- Referral HTTP/bootstrap and user-facing referral-link exposure.
- Referral lifetime 20% through the existing Economy/Ledger boundary.
- Broader real task adapters/verifiers for Game, Social, Web and Special/Partner tasks.
- Anti-fraud and full Phase 2/3 acceptance hardening.
- Later phases: Squad, Reward Pool, Packages, Conversion UI, Withdrawal, Promo, full UI, Admin, final security/release.

## Tests / CI

The repository `test:all` suite includes frontend, Phase 1, Economy/Ledger, Deposit, Phase 2, Referral attribution/qualification/activation/achievements, Daily Check-in, Daily system-task lifecycle, View Ads, Task Catalog/Execution/Verification, advertisement provider flows, creator campaigns, Monetag/OnClickA provider contracts and economy reconciliation.

## Documentation risk

`IMPLEMENTATION_STATUS.md` had become stale relative to the merged Daily and Referral work. It was reconciled on branch `docs/reconcile-current-state`. This summary is created now because the validated milestone count since the prior known summary boundary has reached five.
