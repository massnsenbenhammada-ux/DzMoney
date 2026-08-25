# Daily System Task Contract

Status: proposed contract for implementation

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

The user must be a member of the configured Telegram updates channel. Opening the channel URL is not sufficient evidence. Verification must be performed server-side using the existing trusted Telegram verification boundary.

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

## Architectural constraints

Reuse the existing Task Catalog, Task Execution, Verification, Advertisement, Referral, Economy and Ledger components. Do not create a second Task Service, Referral counter, Reward system, Economy or Ledger.

No database migration is justified by this contract alone. A migration is allowed only if the existing schema cannot represent the required permanent achievement idempotency state.
