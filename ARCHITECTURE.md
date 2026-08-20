# DzMoney 2.0 — Architecture

## 1. Architectural rule

The backend is the source of truth. The client never decides balances, reward eligibility, package state, referral qualification, Squad membership, Reward Pool weight, deposit status, withdrawal status or Admin settings.

## 2. Module boundaries

- `identity`: Telegram user identity, authentication context and roles.
- `wallet`: wallet accounts and balance projections.
- `ledger`: immutable financial/point transaction history and idempotency.
- `economy`: currencies, configurable rates, conversions and purchases.
- `tasks`: task catalog, categories, creator-funded tasks, completion and escrow.
- `ads`: provider abstraction, ad contexts, verification and counters.
- `activity`: daily activity aggregation and Daily Activity DZP.
- `referral`: direct referral attribution, qualification and lifetime commission.
- `squad`: hierarchical membership, levels, activity threshold and next-day bonuses.
- `packages`: package catalog, purchase, expiry and multiplier state.
- `reward-pool`: daily TON pool, activation, weight calculation and distribution.
- `deposits`: TON deposit detection, confirmation and TON→DZX conversion.
- `withdrawals`: eligibility, fee calculation and payout state machine.
- `promo`: promo codes, ad-gated redemption and reward issuance.
- `admin`: settings, user operations, approvals and audit actions.
- `notifications`: event-driven user notifications.
- `fraud`: rate limits, anomaly signals and eligibility restrictions.

Modules communicate through application services/events rather than directly modifying another module's tables or balances.

## 3. Currency/accounting model

Currencies:

- `COIN`: integer activity/reward currency.
- `DZX`: integer system utility currency.
- `DZP`: integer activity indicator/points currency.
- `TON`: stored internally as nanoTON (`1 TON = 1,000,000,000 nanoTON`).

DZP accounting has two source classes:

- `EARNED`: activity/referral/conversion sources allowed by the configured rules; only eligible earned activity can contribute to Daily Activity/Weight.
- `PURCHASED`: bought using DZX; usable for Packages but never contributes to Reward Pool Weight.

A user's accumulated DZP balance is not the same thing as `Daily Activity DZP`.

## 4. Ledger rule

Every balance mutation must execute inside one database transaction that:

1. validates the actor and business rule;
2. validates sufficient available balance where required;
3. writes an idempotent transaction record;
4. writes signed ledger entries;
5. updates the wallet balance projection;
6. commits atomically.

No endpoint may perform `balance = balance + amount` without an associated ledger transaction.

## 5. Idempotency

Any operation that can grant, deduct, convert, reserve or release value accepts an idempotency key scoped to the operation type and actor. A repeated request returns the original result instead of issuing another reward/payment.

## 6. Daily cycle

The business day boundary is **UTC+1**. Daily Activity and Reward Pool calculations operate on an explicit `activity_date` rather than server-local time. The distribution worker closes the previous activity date before opening the new one.

## 7. Reward Pool calculation

For each eligible user:

`effective_weight = daily_activity_dzp × active_package_multiplier`

If there is no active package, multiplier is `1.00x`.

`share = effective_weight / sum(all_effective_weights)`

`user_reward_ton = configured_daily_pool_ton × share`

Purchased DZP is never included in `daily_activity_dzp`.

## 8. Referral separation

Referral commission is independent of Squad and Reward Pool. A qualified direct referral produces a one-time `10,000 COIN + 10 DZX + 10 DZP` reward. The DZP is one-time and is not used as the basis of the lifetime commission. Lifetime commission is 20% of eligible direct-referral task/ad activity and pays COIN + DZX only.

## 9. Squad separation

Squad is hierarchical. A user's downstream descendants belong to the same Squad tree. Level thresholds and percentage bonuses are Admin-controlled. A level bonus becomes active for the following day only when both the member threshold and at least 50% activity condition are satisfied for the current day.

## 10. Package rules

A user may have one active Package only. Packages do not stack and a new package cannot be purchased before the current one expires. Expiry returns the multiplier to `1.00x`. Package price and multiplier are Admin-controlled.

Packages:

- Starter — 30 days
- Growth — 60 days
- Advanced — 90 days
- Pro — 180 days
- Elite — 360 days
- Infinity — Lifetime

## 11. API authorization

- Public/read APIs require an authenticated Telegram user context where user data is involved.
- User mutations verify ownership of the affected resource.
- Admin mutations require an Admin role and create an audit record.
- Financial mutations are never accepted based on client-supplied balances or eligibility claims.

## 12. Event model

Important domain events include:

`user.created`, `task.completed`, `ad.verified`, `referral.qualified`, `package.purchased`, `package.expired`, `squad.level.qualified`, `reward_pool.activated`, `reward_pool.distributed`, `deposit.confirmed`, `withdrawal.requested`, `withdrawal.completed`, `promo.redeemed`.

Events are informational/integration records; ledger writes remain authoritative for value movement.
