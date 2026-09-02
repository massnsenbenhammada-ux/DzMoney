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

## Spin

- 1 claimed Gaming activity gives +1 Spin.
- Spins accumulate and do not expire during the day.
- 1 Spin produces exactly one server-side roll and exactly one result.
- The wheel animation is presentation only; the server result is authoritative.
- Initial reward weights are simulation inputs, not final economic values.
- No Reward remains the most common result in the initial model.
- Jackpot is a separate rare result and is not No Reward.

Candidate rewards for simulation:
- 100 COIN
- 1,000 COIN
- 1 DZX
- 10 DZX
- 1 DZP
- 10 DZP
- +1 Spin
- No Reward
- rare Jackpot

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

### Candidate tile rewards

- 100 COIN
- 1 DZX
- 1 DZP
- +1 Axe
- No Reward
- rare Jackpot when enabled

The example distribution is not final and must be validated by simulation.

## Gaming Ads

Spin and Digging have independent ad counters and independent progress.

### Spin

Verified Spin advertisement → +1 Spin → independent random Ad Bonus.

### Digging

Verified Digging advertisement → +1 Digging ad progress. Every configured 10 verified ads → +1 Axe → independent random Ad Bonus.

### Ad Bonus

Ad Bonus is independent of the game result and may be:
- 100 COIN
- 1 DZX

Admin controls its weights.

Default proposal: 100 verified Gaming ads/day per game. The limit is configurable and must be checked by economic simulation.

## Gaming Tasks

- Spin Task Claim → +1 Spin.
- Digging Task Claim → +1 Axe.
- One claim must not ambiguously issue multiple Gaming resources.
- Existing Task Verification and Economy/Ledger boundaries remain authoritative.

## Configuration

Admin controls, as applicable:
- Gaming daily activity rules;
- daily ad limits;
- reset timezone;
- enabled state;
- Spin rewards/weights/jackpot;
- Digging board size/energy/rewards/weights;
- Gaming Ad Bonus rewards/weights.

Every configuration change creates a new configuration version. Existing sessions retain the version under which they were created.

## Audit and idempotency

Gaming session records retain user, game, consumed resource, configuration version, result, reward and timestamps.

Gaming advertisement records retain user, game, verification evidence, reward, progress and timestamp.

Repeatable external reward events are idempotent.

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
- Tasks → +1 Spin;
- Possible Rewards.

Digging page:
- back to Gaming;
- Axe balance;
- Energy 3/3;
- tile board;
- Gaming Ads counter/progress;
- WATCH AD;
- Tasks → +1 Axe;
- Possible Rewards.

Use native semantic HTML and modern mobile-first CSS primitives. Keep the existing DzMoney visual language; no unrelated redesign or UI framework. Support `:focus-visible` and `prefers-reduced-motion`.

## Economic simulation gate

Before finalizing reward values or weights, simulate 1,000 users × 30 days and measure:
- activities;
- Spins;
- Axes;
- ads;
- COIN emission;
- DZX emission;
- DZP emission;
- jackpot frequency;
- extra Spin/Axe generation;
- average reward;
- best/worst case;
- total Gaming cost to the existing Economy.

No simulation result is to be treated as a final economic contract until reviewed.
