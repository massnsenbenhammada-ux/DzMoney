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

A user may purchase membership only when the user does not currently have an eligible Squad membership, except for the higher-tier upgrade path defined in the 2026-09-10 membership lifecycle amendment below.

The user does not choose a specific Squad. The user chooses only a member-count/price tier. The backend selects the eligible Squad with the lowest current member count within that tier.

Final locked price tiers:

| Tier | Current member count | Price |
| --- | ---: | ---: |
| T1 | 1–10 | 100 DZP |
| T2 | 11–20 | 200 DZP |
| T3 | 21–50 | 500 DZP |
| T4 | 51–100 | 1,000 DZP |
| T5 | 101–200 | 2,000 DZP |
| T6 | 201–300 | 3,000 DZP |
| T7 | 301–400 | 4,000 DZP |
| T8 | 401–500 | 5,000 DZP |
| T9 | 501–1000 | 7,500 DZP |
| T10 | 1000+ | 10,000 DZP |

T10 is unbounded above: `1000+` is a floor, not a finite range. These tiers are classification/pricing tiers, not hard global membership caps.

- The purchase price is the price of the selected tier at purchase time.
- The paid DZP is burned through the existing Economy/Ledger boundary.
- The burned DZP is not paid to the Squad Owner.
- Payment alone does not activate membership.
- The user must perform one Verified Activity after purchase; then membership becomes ACTIVE.
- A purchase is not a Challenge reward, DZP Contribution, or activity reward.

### Dynamic tier

A Squad's tier is derived from its current member count. It is not an independent source of truth.

Adding a member may move a Squad into the next tier. There is no artificial global member cap.

### System-created Squads and Owner assignment

- Users cannot create Squads.
- The system creates Squads automatically.
- The system assigns the Squad Owner; users cannot self-assign as Owner.
- Owner assignment is server-authoritative and idempotent.
- The implementation must use a deterministic assignment rule and must not introduce a second identity or membership source of truth.

### Leaving and suspension

- A member cannot voluntarily leave a Squad, except through the paid same-tier Squad switch defined in the 2026-09-10 membership lifecycle amendment below.
- App Ban is the exception that can terminate the membership.
- A revoked/cancelled membership does not receive Challenge rewards.
- `squad_membership.status = suspended` represents suspension.
- Suspension/activation is distinct from the Squad's daily ACTIVE/RISK state.
- A suspended member is not made active merely by hypothetical activity while suspended; the membership must first be valid for activity to count.

### 2026-09-10 membership lifecycle amendment

The following membership lifecycle rules are now part of the locked Squad contract and supersede the conflicting limitations above:

1. **Same-tier Switch:** A user with an active or inactive paid Squad membership may switch to a different eligible Squad within the exact member-count tier originally purchased. The current Squad is excluded from selection. The backend reuses the smallest-eligible-Squad selection rule and locks the selected target Squad before the membership mutation. No cooldown or switch-count limit is imposed; the DZX tax is the intended friction.
2. **Switch tax:** The tax is 10% of the DZP price recorded in the purchase/upgrade transaction that established the user's current membership. That DZP-equivalent amount is converted to DZX using the current `economy.dzx_per_dzp` setting. The tax is deducted only from DZX through the existing Economy/Ledger transaction boundary. Insufficient DZX or lack of another eligible Squad causes the entire operation to fail without a charge.
3. **Switch status:** Switching preserves the user's existing membership status (`active` remains `active`; `inactive` remains `inactive`). It does not invoke an additional activation penalty.
4. **Upgrade:** A user with an active or inactive paid membership may select only a strictly higher configured tier. The full price of the new tier is paid in DZP through the existing Economy/Ledger boundary. No value, discount, credit, or carry-over from the old membership is applied.
5. **Upgrade replacement:** The old `squad_memberships` row is changed to `cancelled`, and exactly one replacement row is created for the new membership. The replacement starts `inactive`, following the existing paid-membership activation contract. No two non-cancelled memberships may remain for the user.
6. **Idempotency:** Both operations use dedicated idempotency keys and persist their operation result in the existing ledger transaction metadata so retries do not repeat the financial mutation.

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

A Squad's Modifier is active for the next day if **at least one** of the following conditions is satisfied for the current day:

1. At least 50% of eligible Squad Members performed qualifying Verified Activity during the day; OR
2. The Squad Target is reached, where `Squad Target = eligible Squad Members × 10` and the target is measured in raw Contribution DZP.

If neither condition is satisfied, the Squad's Modifier is not active for the next day.

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

For Modifier accounting, the system must distinguish the following two values:

- **Contribution DZP:** the RAW, pre-modifier DZP value of verified activity, recorded exactly as the activity's earned value before any Squad Modifier is applied. This is the only DZP value used to calculate the Squad Modifier and Squad Target.
- **Earned DZP:** the actual DZP credited to a user's wallet after the Squad Modifier is applied.

Contribution DZP is an accounting measure and does not mint additional DZP.

**Critical anti-feedback rule:** Earned DZP after Modifier application must never feed back into Contribution DZP, whether for the same user, the aggregate Squad total, or any later day. Contribution must always be based on raw pre-modifier verified-activity value.

The system distinguishes activity types when a Challenge scope requires it. An advertisement Challenge does not count task-completion DZP, and a task Challenge does not count advertisement DZP.

A verified activity may contribute to multiple matching Challenges, but the underlying activity reward is never paid twice merely because multiple Challenges match it.

## 5. Squad Modifier

The Squad Modifier is produced independently for each day.

At the end of day D, the Squad calculates **Total Contribution DZP**, defined as the sum of raw, pre-modifier Contribution DZP from all qualifying Verified Activity across all eligible Squad members for that day.

If the Squad activation condition is satisfied by either the 50%-active condition or the Squad Target condition, the resulting Modifier is active for day D+1.

### Modifier formula

`Modifier % = Total Contribution DZP / 100`

The formula is continuous and **UNCAPPED**. There is no maximum Modifier percentage.

Examples are illustrative only: 1,400 DZP → 14%; 1,500 DZP → 15%; 10,000 DZP → 100%; 15,000 DZP → 150%.

The Modifier is independent for each day and is not compounded from prior Modifier values.

### Per-member eligibility

Squad-level activation and per-member benefit eligibility are separate rules.

Once the Squad Modifier is active for a day, **only members who performed qualifying Verified Activity on that same day and therefore have actual base earnings receive the Modifier benefit**.

A member with zero verified activity on that day receives **no Modifier bonus whatsoever**. The member does not receive a bonus merely because other Squad members generated enough activity to activate the Squad Modifier.

The Squad's aggregate Contribution DZP may include activity from every qualifying member, but the Modifier benefit is applied only to each active member's own qualifying base earnings.

### Modifier application

The Modifier applies to all qualifying Verified Activity rewards for eligible members on the applicable day.

It applies to **all three reward currencies: COIN, DZX, and DZP**.

Example: with a 150% Modifier, a qualifying member's base reward of `1000 COIN + 1 DZX + 1 DZP` becomes `2500 COIN + 2.5 DZX + 2.5 DZP`.

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
- fixed Modifier thresholds of 1,500 DZP → 15%, 5,000 DZP → 50%, 10,000 DZP → 100%, or 15,000 DZP → 100%;
- any 100% maximum/cap on the Modifier;
- treating Earned DZP after Modifier as Contribution DZP;
- treating Risk as a member state;
- a separate Squad Economy/Ledger/Reward/Verification service;
- carrying Challenge points into a later cycle;
- excluding DZP from Modifier application;
- paying membership purchase DZP to the Squad Owner;
- allowing users to select a specific Squad directly;
- allowing users to create Squads or self-assign ownership;
- automatic App Ban from Squad/activity logic.
