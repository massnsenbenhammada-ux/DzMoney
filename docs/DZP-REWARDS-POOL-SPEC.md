# DzMoney — DZP / Rewards Pool Specification

## Locked business rules

### DZP sources
- Users earn DZP from completed tasks.
- Users earn DZP from completed/confirmed advertisements.
- The Admin Panel controls the DZP reward assigned to each activity/task.

### Referral
- Referral qualification remains separate from the activity/rewards-pool system.
- When a referred user becomes qualified by entering through the referral link and completing at least one qualifying activity (task or advertisement), the referrer receives the Admin-defined DZP referral reward **once only**.
- Future activity of the referred user does not generate recurring DZP referral rewards.
- Referral rewards must not be treated as recurring activity DZP.

### Rewards Pool
- Rewards Pool is funded according to the project's actual revenue allocated to the pool.
- Normal users can participate through their own activity strength, represented by activity DZP/weight.
- Users with active packages can receive additional package-related weight according to the package configuration.
- Package weight is temporary and ends when the package expires.
- Package participation does not create a guaranteed return.
- Referral and Squad bonuses remain separate from Rewards Pool accounting.

### Packages
- Packages are purchased with DZP, not DZX.
- Package cost in DZP is configurable by Admin.
- Package activity bonus percentage is configurable by Admin and applies to the user's daily/activity rewards while the package is active.
- Package Rewards Pool weight configuration is percentage-based and configurable by Admin.
- Existing package purchases retain their purchase-time configuration; later Admin edits apply to new purchases only.

### Currency separation
- Coins = direct activity/task reward.
- DZP = activity/rewards-pool weight and package participation points.
- DZX = economic balance used by the project's deposit/withdrawal rules.
- DZP must not be silently converted into DZX or treated as a withdrawal currency.

## Required accounting separation
1. Activity DZP: earned from the user's own completed tasks/ads.
2. Referral DZP: one-time Admin-defined referral reward; not recurring.
3. Package weight: temporary and attached to an active package purchase.
4. Squad bonus: separate calculation and ledger path.
5. Rewards Pool distributions: calculated from eligible pool weight and actual pool allocation.

## Implementation safety
- All DZP grants must be idempotent.
- Server-side confirmation is required for ad completion.
- Admin-controlled values must not be hard-coded into task logic.
- Package configuration must be snapshotted on purchase so later edits cannot retroactively alter an active purchase.
