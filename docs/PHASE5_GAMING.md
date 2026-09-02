# Phase 5 — Gaming

## Status

Gaming is the official Phase 5 of DzMoney.

The former **Reward Pool** phase is removed from the product scope. Reward Pool must not be implemented, resurrected, or assigned a replacement phase without a new explicit product decision.

Historical Reward Pool PRs/commits remain Git history only.

## Scope

Gaming is an independent subsystem containing:
- 🎡 Spin
- ⛏️ Digging

Gaming must reuse the existing Activity, Advertisement, Task, Verification, Economy/Ledger and configuration boundaries. It must not create a second Economy, Ledger, Reward or Verification system.

## Resource sources

Spin and Axe have two independent sources.

### Activity Verified

`Activity Verified` is the global qualifying activity boundary. It is not a Gaming Ads event and is not limited to Gaming. A qualifying verified task/activity produces:
- +1,000 COIN
- +1 DZX
- +1 DZP
- +1 Spin

Every 10 qualifying `Activity Verified` events also grant:
- +1 Axe

The Activity Verified counter is independent from all Gaming Ad counters.

### Gaming Ads

Gaming Ads are standalone in-game advertisements and never become `Activity Verified`.

Spin:
- every verified Gaming Ad → +1 Spin;
- every verified Gaming Ad also receives one independent random Ad Bonus: +100 COIN or +1 DZX.

Digging:
- every verified Gaming Ad increments the Digging Ad counter;
- every 10 verified Digging Ads → +1 Axe;
- every verified Gaming Ad also receives one independent random Ad Bonus: +100 COIN or +1 DZX.

The Spin and Digging ad counters are independent.

## Spin

- 1 Spin produces exactly one server-side roll and exactly one result.
- The wheel animation is presentation only; the server result is authoritative.
- Game Random Reward results are:
  - 100 COIN
  - 1,000 COIN
  - 1 DZX
  - 10 DZX
  - 1 DZP
  - 10 DZP
  - +1 Spin
  - No Reward
- Game Random Reward is independent from Gaming Ad Bonus and Activity Verified rewards.

## Digging

- 1 Axe starts one Digging session.
- A session creates its board server-side once and persists it.
- Initial board target: 16 tiles.
- A session starts with 3 Energy.
- One tile reveal consumes one Energy.
- The Axe is not consumed per tile.
- A revealed tile always returns its persisted result; it is never randomized again.
- Leaving the app does not destroy the active session.

### Energy

- Daily Energy: 3.
- Reset: 00:00 UTC+1.
- At zero: `No more digs today`.

### Game Random Reward

Digging uses the same Random Reward table as Spin, except the resource result is:
- +1 Axe

The full Digging Game Random Reward table is:
- 100 COIN
- 1,000 COIN
- 1 DZX
- 10 DZX
- 1 DZP
- 10 DZP
- +1 Axe
- No Reward

## Gaming Tasks

Gaming Ads are **not** Gaming Tasks.

The canonical `Spin — Watch Ad` and `Digging — Watch Ad` task rows are retired/closed so the standalone Gaming Ads surface cannot appear as a Task.

Normal Game Tasks remain part of the existing Task Catalog → Execution → Verification → Reward pipeline. When a normal Game Task is successfully verified, it is a qualifying `Activity Verified` event and therefore receives the standard Activity Verified reward, including +1 Spin and every-10 +1 Axe. It does not receive a separate Gaming Task resource grant.

## Configuration

Admin controls, as applicable:
- Gaming daily ad limits;
- reset timezone;
- enabled state;
- Spin rewards/weights;
- Digging board size/energy/rewards/weights;
- Gaming Ad Bonus rewards/weights;
- Digging Gaming Ad threshold.

Every configuration change creates a new configuration version. Existing sessions retain the version under which they were created.

The initial distribution is intentionally ordered:

`No Reward > 100 COIN > +1 Spin/+1 Axe > 1,000 COIN > 1 DZX > 1 DZP > 10 DZX > 10 DZP`

Initial Spin weights:
- No Reward: 750
- 100 COIN: 180
- +1 Spin: 50
- 1,000 COIN: 15
- 1 DZX: 5
- 1 DZP: 3
- 10 DZX: 1
- 10 DZP: 1

Initial Digging weights use the same values, with `+1 Axe` replacing `+1 Spin`.

Weights are versioned configuration data and remain Admin-configurable through the existing Admin authentication boundary. The initial values must pass the economic simulation gate before merge.

## Audit and idempotency

Gaming session records retain user, game, consumed resource, configuration version, result, reward and timestamps.

Gaming advertisement records retain user, game, verification evidence, reward, progress and timestamp.

Repeatable external reward events are idempotent.

Activity Verified resource issuance occurs inside the same transaction as the qualifying Economy reward and is only applied when that reward transaction is newly created.

## UX contract

Gaming Home selects Spin or Digging and shows their independent resources.

Exact page order on both game pages:

**Game → Gaming Ads → Tasks**

Spin page:
- back to Gaming;
- Spin balance;
- wheel/result;
- SPIN;
- Gaming Ads counter/progress;
- WATCH AD;
- Tasks entry → Tasks page;
- Possible Rewards.

Digging page:
- back to Gaming;
- Axe balance;
- Energy 3/3;
- tile board;
- Gaming Ads counter/progress;
- WATCH AD;
- Tasks entry → Tasks page;
- Possible Rewards.

Use native semantic HTML and modern mobile-first CSS primitives. Keep the existing DzMoney visual language; no unrelated redesign or UI framework. Support `:focus-visible` and `prefers-reduced-motion`.

## Economic simulation gate

Before finalizing reward values or weights, simulate 1,000 users × 30 days and measure:
- Activity Verified events;
- Spins;
- Axes;
- Gaming Ads;
- COIN emission;
- DZX emission;
- DZP emission;
- extra Spin/Axe generation;
- average reward;
- best/worst case;
- total Gaming cost to the existing Economy.

The simulation must consume the current versioned Gaming configuration rather than an independent copy of reward weights.

The existing 1,200-DZX average-cost guardrail remains unchanged.

No simulation result is to be treated as a final economic contract until reviewed.
