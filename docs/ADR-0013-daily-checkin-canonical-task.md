# ADR-0013: Daily Check-in uses the canonical Daily Task pipeline

## Status
Accepted for implementation.

## Context
Daily Check-in was exposed directly from Home and executed through a specialized `daily-checkin-service`, while the project contract defines it as the `daily_check_in` Daily System Task subtype. This created a second execution lifecycle beside the canonical Task Catalog → Task Execution → Verification → Economy flow and left the Home button dependent on a separate verification state.

## Decision
Treat `daily_check_in` as a canonical active `activity_tasks` record and execute it through the existing Daily System Task and Task Verification boundaries.

The existing `daily_checkins` table remains a backward-compatible state read during the transition so historical successful Check-ins continue to enforce the rolling 24-hour rule. No new domain service, Economy, Ledger, provider registry, or verifier is introduced.

The Check-in task uses `dailyPolicy=rolling_24h` and `dailyMode=advertisement`. The existing verification advertisement provider boundary remains authoritative; a client-side advertisement completion is never sufficient proof by itself.

The legacy `/api/daily-checkin/claim` route becomes a compatibility transport that delegates to the canonical Daily System Task execution. The Home UI no longer exposes an independent Check-in action; the task is rendered under Tasks → Daily Activity.

## Consequences

- One canonical Task Execution path is used for new Check-ins.
- Existing Economy/Ledger and provider infrastructure are reused.
- Existing `daily_checkins.last_claimed_at` remains a compatibility read until historical state is fully represented by canonical attempts.
- The rolling 24-hour rule is server-side and independent of client countdowns.
- No additional architecture is introduced.

## Verification requirements

The change must pass the existing full CI/test suite, including migration execution and economy reconciliation. Runtime verification must confirm: execute → verification ad event → trusted provider verification → finalization → exactly-once reward → 24-hour cooldown.
