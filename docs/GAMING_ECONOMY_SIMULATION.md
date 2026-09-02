# Gaming Economy Simulation — Baseline

**Status:** Simulation evidence only; not production economics.

## Baseline assumptions

- 1,000 users.
- 30 days.
- 20 qualifying activity claims/user/day.
- Axe activity threshold: 10 claims, used only as a simulation assumption because the production threshold is not yet locked.
- 100 Spin ads/user/day.
- 100 Digging ads/user/day.
- Every 10 Digging ads grants 1 Axe in the simulation.
- Each verified ad grants one independent bonus: 100 COIN or 1 DZX.
- Baseline ad-bonus split: 50% DZX / 50% COIN.
- Users consume all available Spin attempts.
- Digging uses 3 Energy/day and a persistent 16-tile board.
- Digging board distribution: 10 No Reward, 3×100 COIN, 1×1 DZX, 1×1 DZP, 1×Extra Axe.
- Spin uses the proposed weights from `GAMING_SYSTEM_CONTRACT.md`.
- No Jackpot in the baseline run.
- DZX-equivalent accounting uses the existing relationship: 1 DZX = 1,000 COIN and 1 DZP = 10 DZX.

## Deterministic baseline result

Using seed `54`, the simulation model produces:

| Metric | 1,000 users / 30 days |
|---|---:|
| Activity claims | 600,000 |
| Spin ads | 3,000,000 |
| Digging ads | 3,000,000 |
| Total ads | 6,000,000 |
| Spins played | 3,628,769 |
| Extra Spins | 28,769 |
| Digging tile reveals | 80,000 |
| COIN emitted | 446,440,500 |
| DZX emitted | 3,078,633 |
| DZP emitted | 78,261 |
| Jackpots | 0 |
| DZX-equivalent emission | 4,307,683.5 |

Average per user over 30 days:

- 446,440.5 COIN
- 3,078.633 DZX
- 78.261 DZP
- 4,307.6835 DZX-equivalent

## Sensitivity: ad-bonus mix

Keeping all other assumptions unchanged:

| DZX probability in ad bonus | COIN | DZX | DZP | DZX-equivalent |
|---:|---:|---:|---:|---:|
| 10% | 686,488,600 | 678,152 | 78,261 | 2,147,250.6 |
| 50% | 446,440,500 | 3,078,633 | 78,261 | 4,307,683.5 |
| 90% | 206,576,800 | 5,477,270 | 78,261 | 6,466,456.8 |

The important finding is that the **ad-bonus distribution dominates the DZX emission** much more than the proposed Spin reward table. Therefore the ad-bonus weights must be part of the same economy simulation gate.

## Jackpot sensitivity

With the baseline 50/50 ad-bonus split and a 50 DZX Jackpot:

| Jackpot weight | Observed jackpots | Total DZX-equivalent |
|---:|---:|---:|
| 0 | 0 | 4,307,683.5 |
| 1 | 1,691 | 4,388,458.9 |
| 2 | 3,591 | 4,481,561.1 |
| 5 | 9,044 | 4,759,371.0 |
| 10 | 17,869 | 5,188,369.6 |

These are deterministic simulation observations for seed `54`, not confidence intervals. They show that even a small Jackpot weight is measurable at this traffic volume.

## Safety conclusions

1. The proposed Spin table is not the main economic risk under the maximum-ad-view assumption.
2. The 100-ad/game limits create 6 million Gaming ad events in the 30-day, 1,000-user stress scenario. This is the first operational/economic parameter to tune with real provider revenue data.
3. Ad-bonus weights must be simulated jointly for Spin and Digging before production activation.
4. Jackpot amount and weight must remain disabled/zero until a chosen budget is proven safe.
5. The Axe activity threshold remains unresolved and must not be inferred from the illustrative UI example.
6. The simulation currently assumes maximum user engagement. A production decision should compare at least low, median and maximum engagement once real product analytics exist.
7. No production migration or reward endpoint is justified by this document alone.

## Gate

This simulation is a prerequisite for final Gaming economic configuration. It does not authorize the proposed weights, Jackpot, ad limits or Axe threshold for production.
