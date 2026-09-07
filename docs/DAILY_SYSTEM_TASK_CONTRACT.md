# Daily System Task Contract

Status: implemented for the currently validated Daily system-task contracts

## Daily categories

System-defined Daily tasks are distinct from user/provider/advertiser tasks. The current Task Catalog remains the single source of truth for task records.

The supported Daily system tasks are:

- `daily_check_in`
- `check_for_update`
- `share_with_friends`
- `view_ads`
- referral achievements: `invite_1`, `invite_10`, `invite_20`, `invite_50`, and additional thresholds as configured by the product

## Timing rules

- Daily Check-in uses the existing server-side rolling 24-hour rule.
- Check for Update resets once per UTC+1 calendar day. It is not a rolling 24-hour cooldown.
- Share with Friends resets once per UTC+1 calendar day. It is not a rolling 24-hour cooldown.
- Referral achievements never reset. Each threshold is claimable once for the lifetime of the user.

## Check for Update

The current production contract is:

1. The user presses **Check for Update**.
2. DzMoney opens the Telegram channel `@DzMoneyChecking` at `https://t.me/DzMoneyChecking`.
3. The user joins/is a member of that channel.
4. When the user returns to the Mini App, the existing authenticated verification endpoint checks membership server-side through the Telegram Bot API boundary.
5. Only successful membership verification earns the task reward.
6. The task can be rewarded once per UTC+1 calendar day.
7. Opening the channel without membership is insufficient evidence.
8. Advertisement verification is not part of this task.
9. The reward continues through the existing Economy/Ledger path.

The public channel reference remains server-owned. The client consumes the server-provided action URL and does not act as the reward authority.

## Share with Friends

The task opens Telegram's sharing UI using the user's own referral link. Completion requires the sharing interaction defined by the client/server contract; merely opening a generic URL must not be treated as a referral achievement.

## Referral achievements

The existing referral attribution/qualification state is the source of truth for qualified referrals. Do not introduce a duplicate referral counter.

For threshold `N`:

1. The user must have at least `N` qualified referrals.
2. The threshold becomes claimable once that condition is true.
3. Claim requires a successfully verified advertisement.
4. The achievement reward is granted through the existing Economy/Ledger path.
5. The threshold becomes permanently completed and cannot be claimed again.

Referral activation and referral achievement rewards are separate business events and may both occur for the first qualified referral.

### Invite Achievement integration validation

PR #287 closed the integration-evidence gap without changing the approved business contract. The validated test now exercises the real Daily system-task execution and existing verification-gate lifecycle against the test PostgreSQL database.

Coverage includes:

- canonical qualified-referral eligibility and below-threshold rejection;
- real `executeSystemTask` attempt/gate creation;
- no reward while the verification advertisement gate is pending;
- the existing `achievementThreshold` is preserved through `resolveVerificationConfig` into the existing Invite verifier boundary;
- successful reward through the canonical Economy/Ledger path;
- concurrent finalization produces exactly one rewarded claim and one duplicate result;
- retries after successful verification produce no additional reward;
- temporary database fixtures are cleaned without closing the shared test pool.

Exact validated head: `92120e7dabca6e990b49e7a0be8a724acbd1e37e`.

CI evidence: Test Governance, Security, Phase 10 Promo Codes, and Phase 2 boundaries/full `test:all` all passed for that exact head. The Phase 2 full suite completed successfully after the integration test was corrected to keep the shared PostgreSQL pool alive for subsequent tests.

The corresponding production correction is intentionally minimal: no new service, table, migration, Economy/Ledger, Referral system, anti-fraud system, or UI was introduced.

## Architectural constraints

Reuse the existing Task Catalog, Task Execution, Verification, Advertisement, Referral, Economy and Ledger components. Do not create a second Task Service, Referral counter, Reward system, Economy or Ledger.

No database migration was introduced for the Check for Update contract because the existing task/gate/configuration model already represents the required state and idempotency boundary.
