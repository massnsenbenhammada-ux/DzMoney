# DzMoney — Squad System Contract

> **Status: LOCKED BUSINESS CONTRACT**
>
> This document supersedes all earlier Squad rules. The old hierarchical/10-level Squad specification is obsolete and must not be reintroduced.

## 1. Independence and sources of truth

- Squad is independent from Referral and Reward Pool.
- Verified Activity remains the source of activity evidence.
- Existing Economy/Ledger remains the single economic source of truth.
- Squad is a modifier/accounting layer, not a new Economy, Ledger, Verification, Reward, or Activity system.
- DZP is the Squad measurement unit and contribution unit. It is not a new currency.

## 2. Squad membership

A user can belong to only one Squad.

### Free invitation

- A Squad Owner may invite a user.
- The user accepts the invitation.
- Invitation itself is free.
- Membership becomes ACTIVE only after the user performs at least one Verified Activity.

### Paid membership

A user may purchase membership only when the user does not currently have an eligible Squad membership.

The user does not choose a specific Squad. The user chooses only a member-count/price tier. The backend selects the eligible Squad with the lowest current member count within that tier.

Initial Admin-configurable price tiers:

| Current member count | Initial price |
|---|---:|
| 1–10 | 100 DZP |
| 11–20 | 200 DZP |
| 21–50 | 500 DZP |
| 51–100 | 1,000 DZP |
| 101–200 | 2,000 DZP |
| 201–300 | 3,000 DZP |
| … | additional Admin-defined tiers |

- The purchase price is the price of the selected tier at purchase time.
- The paid DZP is burned through the existing Economy/Ledger boundary.
- The burned DZP is not paid to the Squad Owner.
- Payment alone does not activate membership.
- The user must perform one Verified Activity after purchase; then membership becomes ACTIVE.
- A purchase is not a Challenge reward, DZP Contribution, or activity reward.

### Dynamic tier

A Squad's tier is derived from its current member count. It is not an independent source of truth.

Adding a member may move a Squad into the next tier. There is no artificial global member cap.

Example: a 100-member Squad may accept another selected member and become a 101-member Squad in the 101–200 tier.

### System-created Squads and Owner assignment

- Users cannot create Squads.
- The system creates Squads automatically.
- The system assigns the Squad Owner; users cannot self-assign as Owner.
- Owner assignment is server-authoritative and idempotent.
- The implementation must use a deterministic assignment rule and must not introduce a second identity or membership source of truth.

### Leaving and suspension

- A member cannot voluntarily leave a Squad.
- App Ban is the exception that can terminate the membership.
- A revoked/cancelled membership does not receive Challenge rewards.
- `squad_membership.status = suspended` represents suspension.
- Suspension/activation is distinct from the Squad's daily ACTIVE/RISK state.
- A suspended member is not made active merely by hypothetical activity while suspended; the membership must first be valid for activity to count.

## 3. Daily Squad state

Each UTC+1 calendar day is evaluated independently.

### Daily target

The Admin controls the daily target rule. The target is based on the eligible Squad member count for that day.

Initial rule examples:

- 50 eligible members → target 500
- 55 eligible members → target 550
- 60 eligible members → target 600

The target is evaluated for the current day and must not be retroactively recomputed from later membership changes.

### Activation rule

A Squad is ACTIVE for the following day if either condition is satisfied:

1. Daily Target is reached; OR
2. at least 50% of Eligible Squad Members were Active during the day.

If neither condition is satisfied, the Squad state is RISK.

`RISK` is a state of the Squad, not a member state.

### Member activity state

- `inactive` means the member has not yet satisfied the day's activity requirement.
- `active` means the member has performed at least one qualifying Verified Activity during that day.
- Daily activity is counted from the existing verified-activity records.
- Active-member accounting includes all members who were active on that day, not only Contributors.

### Daily verified Squad ad target

The default is 10 verified advertisements per new UTC+1 day. The value is Admin-configurable.

## 4. Daily DZP Contribution

Verified Activity produces the normal activity reward through the existing Economy/Ledger path.

**1 DZP earned = 1 DZP Contribution.**

Contribution is accounting only and does not mint additional DZP.

The system distinguishes activity types when a Challenge scope requires it. An advertisement Challenge does not count task-completion DZP, and a task Challenge does not count advertisement DZP.

A verified activity may contribute to multiple matching Challenges, but the underlying activity reward is never paid twice merely because multiple Challenges match it.

## 5. Contributors and daily Modifier

The Squad Modifier is produced independently for each day.

At the end of day D, the Squad calculates its contribution for that day. If the Squad is activated by either daily condition, it produces a Modifier for day D+1.

Initial modifier mapping:

| DZP Contribution | Modifier |
|---:|---:|
| 1,500 | 15% |
| 5,000 | 50% |
| 10,000 | 100% |
| 15,000 | 100% |

Modifier maximum: 100%.

The modifier is independent for each day and is never carried forward cumulatively.

### Contributor eligibility

The daily Modifier applies only to members who contributed to the activation of that day's Squad condition.

A member who was merely active but did not contribute to activation does not receive that Modifier.

### Modifier application

The Modifier applies to all qualifying Verified Activity rewards for eligible contributors on D+1.

It modifies all reward currencies except DZP.

With a base reward of `1000 COIN + 1 DZX + 1 DZP` and a 15% Modifier:

`1150 COIN + 1.15 DZX + 1 DZP`.

DZP is never increased by the Squad Modifier.

The original reward source remains immutable. Squad is metadata/modifier information and is not a new economic source.

## 6. Weekly Challenges

Weekly Challenge is an achievement system, not Reward Pool.

Multiple Challenges may be active simultaneously.

Each Challenge:

- starts at 00:00 UTC+1 on its first day;
- lasts exactly 7 consecutive days;
- ends at 23:59:59 UTC+1 on day 7;
- has its own independent accounting;
- starts the next cycle from zero Challenge Contribution;
- never carries old Challenge accounting into a new cycle;
- keeps its configuration fixed for the current cycle; Admin changes apply to a new cycle.

### Challenge scope

Admin may select:

- `ALL TASKS`
- `Type Tasks`
- `Verified Ad`
- `Verified Task`
- `Verified Squad AdView`
- `All Activity Verified`

The Challenge source is always the existing Verified Activity system.

### Challenge reward

The Admin defines the reward amount/currency. Challenge rewards use the existing Economy/Ledger path.

Challenge rewards are credited to users' balances; they do not create a second wallet or reward system.

Distribution is based only on the DZP Contribution earned during the current Challenge cycle. Old cycles are never included.

A member must remain eligible at settlement to receive the Challenge reward. A cancelled/revoked membership does not receive it.

## 7. Rounding

Squad calculations use the existing project's canonical Economy/decimal rounding rules. No Squad-specific rounding algorithm is introduced.

## 8. Security and idempotency

- Membership activation is server-authoritative.
- Purchase/burn is atomic and idempotent through the existing Economy/Ledger boundary.
- Verified Activity evidence remains server-authoritative.
- Challenge settlement is idempotent.
- Daily state and Modifier calculations are server-authoritative.
- Frontend state never determines eligibility, contribution, Modifier, or reward amounts.

## 9. Explicitly obsolete designs

The following earlier Squad assumptions are obsolete and must not be implemented:

- hierarchical 10-level Squad bonuses;
- requiring both Daily Target and 50% Active;
- treating Risk as a member state;
- a separate Squad Economy/Ledger/Reward/Verification service;
- carrying Challenge points into a later cycle;
- modifying DZP with the Squad percentage;
- paying membership purchase DZP to the Squad Owner;
- allowing users to select a specific Squad directly;
- allowing users to create Squads or self-assign ownership.
