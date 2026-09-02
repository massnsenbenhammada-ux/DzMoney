# DzMoney Gaming System Contract

**Status:** Draft-to-implementation contract authorized by the Gaming product decision.

**Scope:** Spin and Digging only. Phase 5 Reward Pool and Phase 6 Packages remain skipped and are not dependencies of Gaming.

## 1. Source-of-truth rules

- Backend is authoritative for resources, eligibility, energy, boards, rolls, rewards and cooldown/day boundaries.
- Gaming reuses the existing Economy/Ledger, Activity, Advertisement and configuration primitives.
- No second Economy, Ledger, Reward, Verification, Activity or Advertisement system is allowed.
- Every economic mutation is transactional and idempotent.
- Gaming must never use client-generated randomness as an authoritative result.

## 2. Resources

Gaming has three distinct resource concepts:

- **Spin** — consumable Spin attempts. Activity claims and Spin advertisements may increase it.
- **Axe** — opens a Digging board/session. It is consumed when a new board is created, not per tile.
- **Energy** — Digging-only daily tile attempts. Daily maximum is 3 and resets at 00:00 UTC+1.

Resources are not internal Economy currencies. When Gaming grants COIN, DZX or DZP, the reward is posted through the existing Economy/Ledger boundary.

## 3. Activity resource grants

The locked product proposal states:

- one claimed qualifying Gaming activity gives +1 Spin;
- Axe progress is also driven by activity, but the exact Axe threshold is **not yet an economic final** and must be resolved before production implementation.

The example `17 activities -> 7 remaining, Axe 1` and `20 activities -> Axe 2` is treated as a simulation input, not an authoritative production rule, until the threshold is explicitly locked.

## 4. Spin

Flow:

```text
Spin available
  -> authenticated request
  -> idempotency check
  -> transactional resource consumption
  -> server-side weighted roll
  -> Economy reward, if any
  -> persisted audit result
  -> response
```

The browser only animates the already-decided server result.

### Proposed simulation weights

These are **simulation inputs only**, not production configuration:

| Result | Weight |
|---|---:|
| 100 COIN | 400 |
| 1,000 COIN | 40 |
| 1 DZX | 20 |
| 10 DZX | 2 |
| 1 DZP | 20 |
| 10 DZP | 2 |
| +1 Spin | 16 |
| No Reward | 1,500 |

A Jackpot is a separate rare result candidate and is not part of the base production weights until simulation proves a safe value.

## 5. Digging

Starting a Digging board consumes one Axe and creates one immutable server-side board. A board is never regenerated because the client reconnects or requests a tile again.

A board has 16 tiles. Energy permits at most 3 tile reveals per UTC+1 day. If the user leaves the app with an unfinished board, the board remains available and its unrevealed tiles remain unchanged.

### Proposed simulation distribution

| Tile result | Count in a 16-tile board |
|---|---:|
| No Reward | 10 |
| 100 COIN | 3 |
| 1 DZX | 1 |
| 1 DZP | 1 |
| +1 Axe | 1 |

This is a simulation distribution, not a final production configuration. A future Jackpot, if accepted, must be explicitly included in the board-generation configuration and simulation.

## 6. Advertisement boundary

Gaming reuses `activity_ad_events` and the provider registry.

Required explicit contexts:

- `gaming_spin_ad`
- `gaming_digging_ad`

They must not count as `task`, `reward_pool`, `verification` or `daily_checkin` events.

### Spin advertisement

```text
verified ad -> +1 Spin -> independent ad bonus roll
```

### Digging advertisement

```text
verified ad -> ad progress +1 -> every configured 10 ads: +1 Axe -> independent ad bonus roll
```

Spin and Digging ad counters are separate. The initial simulation limit is 100 ads/day/game; the production limit must be Admin-configurable.

Ad bonus candidates are 100 COIN or 1 DZX with independent Admin weights. Final weights require simulation.

No economic reward is authorized from a browser-only ad completion event.

## 7. Gaming Tasks

Gaming task claims are game-specific:

- Spin task claim -> +1 Spin.
- Digging task claim -> +1 Axe.

A single claim must not silently create multiple Gaming resources or an additional Activity reward unless an explicit contract later says so.

Existing Task Catalog/Execution/Verification/Economy boundaries remain authoritative.

## 8. Configuration versioning

Every Gaming configuration snapshot that can affect a result must have a version. A persisted Spin result or Digging board references the version used at creation.

Changing configuration creates a new version. It must not reinterpret historical sessions or boards.

Admin configuration must reuse the existing `admin_settings` and audit pattern unless the repository proves that a dedicated persisted configuration record is required for historical snapshots.

## 9. Auditability

A Gaming economic operation must retain enough immutable data to answer:

- which user performed it;
- which game and operation occurred;
- which resource was consumed/granted;
- which configuration version applied;
- which authoritative result was produced;
- which Economy transaction, if any, issued the reward;
- when the operation started/completed.

For Digging, the persisted board/session must additionally identify the board and revealed tile state.

The implementation must avoid storing sensitive server secrets or exposing the random seed to clients.

## 10. Concurrency and replay

Every Spin, board creation and tile reveal must be protected against replay and concurrent requests.

The canonical sequence is:

```text
authenticate
  -> validate ownership/input
  -> BEGIN
  -> lock relevant Gaming state
  -> idempotency check
  -> consume resource / reveal immutable state
  -> Economy/Ledger mutation when applicable
  -> persist audit state
  -> COMMIT
```

External provider/network calls must remain outside the transaction.

## 11. Day boundary

Gaming daily Energy and daily ad limits use **00:00 UTC+1** as the calendar-day boundary. The server computes the day; the client never supplies authoritative eligibility.

## 12. UX contract

Gaming Home:

```text
Gaming
  -> Spin
  -> Digging
```

Each game page uses exactly this order:

```text
Game
  -> Gaming Ads
  -> Tasks
```

Spin displays current Spins and a server-authoritative wheel result. Digging displays Axe, Energy and the persistent 16-tile board.

The UI should use modern native HTML/CSS primitives first: semantic elements, native `<dialog>` where needed, CSS Grid, container queries, custom properties, modern selectors and reduced-motion support. No UI framework is introduced solely for Gaming.

## 13. Economy simulation gate

No final reward amount, weight, Jackpot probability, ad-bonus weight, Axe threshold or daily ad limit is considered production-locked until the deterministic 1,000-user/30-day simulation and scenario analysis have been reviewed.

Required outputs:

- activities;
- Spins generated/consumed;
- Axes generated/consumed;
- Energy usage;
- ads watched by game;
- COIN emission;
- DZX emission;
- DZP emission;
- Jackpot frequency;
- extra Spin/Axe generation;
- per-user average reward;
- best/worst observed scenarios;
- total Gaming economic emission in DZX-equivalent terms.

The simulation must make its assumptions explicit and must not be mistaken for production accounting.

## 14. Explicit non-decisions

Not yet production-locked:

- final Spin weights;
- Jackpot amount and weight;
- Pity rules;
- final Digging distribution;
- Axe-from-Activity threshold;
- final ad-bonus weights;
- final daily ad limits;
- whether Gaming Activity contributes to any separate activity metric beyond the explicit resource grant.

These remain simulation/configuration decisions, not implementation gaps to solve by guessing.
