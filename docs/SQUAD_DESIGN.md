# DzMoney Squad Engine — Design Lock

## Core rules

- Squad is independent from Referral.
- Squad is not an independent DZX source. A daily Squad bonus only modifies an otherwise qualifying base activity reward.
- The modifier percentage is read from Admin settings and is never hardcoded.
- A member remains in the hierarchy after becoming inactive.
- A member becomes inactive after the configured inactivity period (default: 7 days) without a qualifying activity.
- The first qualifying activity after inactivity reactivates the member immediately.
- Only qualifying activity events enter Squad activity and Goal contribution accounting.
- Idempotency keys prevent duplicate Squad activity events.

## Daily Squad activity

For a given day:

`activity_percent = active_today_members / active_squad_members × 100`

A Squad qualifies for the next day when:

- active member count is at least the configured minimum; and
- activity percentage is at least the configured threshold.

The resulting daily snapshot stores the counts, percentage, threshold result and effective bonus rate so the decision can be audited later.

## Daily reward modifier

For a qualifying next-day Squad:

`final_reward = base_reward × (1 + squad_bonus_rate)`

The ledger transaction keeps the original activity source. The Squad modifier is recorded separately in transaction metadata.

## Squad Goals

Goals are generic and are not limited to recruitment. A goal can target an activity type such as `task`, `advertisement`, `member_joined`, or another future qualifying activity type.

Only contributors to the goal receive its distribution. Membership alone is not enough.

For each contributor:

`member_weight = sum(qualifying contribution quantities)`

`member_reward = reward_pool × member_weight / total_weight`

The calculation is stored with the distribution snapshot so the result is explainable and reproducible.

Goal rewards are modeled as DZX Reward Pool distributions. They must be funded/posted through the Reward Pool/economy settlement layer; the Squad engine itself does not mint a standalone Squad currency source.

## Transparency requirement

Every user-facing Squad calculation must be explainable from persisted data:

- active member count;
- active-today member count;
- activity percentage;
- applicable threshold and minimum;
- effective modifier rate;
- base reward;
- final reward;
- Goal target and progress;
- contributor quantity and weight;
- total weight;
- reward pool;
- final share and calculation formula.

No black-box Squad reward is permitted.
