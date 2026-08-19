# DZP implementation status

## Implemented
- Locked business specification in `docs/DZP-REWARDS-POOL-SPEC.md`.
- Canonical user DZP balance is `users.dzp`.
- Idempotent activity DZP ledger in `dzp_activity_ledger`.
- Task completions can award Admin-controlled activity DZP through the Rewards Pool migration trigger.
- Confirmed AdsGram views award the Admin-controlled `dzp_ad_reward` value server-side through a database trigger.
- One-time referral DZP is granted automatically on the first finalized task/ad reward for a referred user, using the Admin-controlled `dzp_referral_reward` value.
- Referral DZP is protected by a unique `referred_user_id` ledger key and is never granted again for future activity.
- DZP grants are recorded in `economy_ledger` as `DZP / CREDIT` with distinct source types.
- The existing Admin Panel settings table exposes three DZP controls:
  - `dzp_referral_reward`
  - `dzp_default_activity`
  - `dzp_ad_reward`
- Changes made through the existing Admin settings API are synchronized to the DZP source-of-truth table.
- Rewards Pool tables and package DZP-weight storage remain separate from Referral and Squad accounting.

## Locked business rules
- Coins remain the direct activity reward.
- DZX remains the economic balance for deposit/withdrawal rules.
- DZP is the activity/Rewards Pool weight and package participation points.
- Activity DZP comes from the user's own completed tasks and confirmed advertisements.
- Referral DZP is a one-time Admin-defined reward when the referred user first qualifies; it is not recurring.
- Referral DZP is not added again for later activity by the referred user.
- Referral and Squad bonuses remain separate from Rewards Pool accounting.
- DZP is never silently converted into DZX and is not a withdrawal currency.

## Safety
- All activity/referral/ad DZP grants are idempotent at the database ledger level.
- Ads must be confirmed server-side by AdsGram before the ad DZP trigger can run.
- No unagreed numerical DZP values were hard-coded as active rewards; defaults remain zero until configured by Admin.
- Existing package configuration remains separate; package purchase logic and package activity bonus still require their dedicated implementation stage.
