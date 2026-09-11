# DzMoney — Squad System Contract

> **Status: LOCKED BUSINESS CONTRACT — AMENDED 2026-09-11**
>
> This document preserves the previous locked contract as historical context and formally supersedes only the conflicting rules in the amendment below. The old hierarchical/10-level Squad specification remains obsolete and must not be reintroduced.

## 1. Independence and sources of truth

- Squad is independent from Referral and Reward Pool as an economic/reward system, but Referral relationships are now an approved input to organic Squad formation.
- Verified Activity remains the source of activity evidence.
- Existing Economy/Ledger remains the single economic source of truth.
- Squad is a modifier/accounting layer, not a new Economy, Ledger, Verification, Reward, or Activity system.
- DZP is the Squad measurement unit and contribution unit. It is not a new currency.

## 2. Historical contract — retained for traceability

The rules below were part of the locked contract before the 2026-09-11 amendment. They remain here to preserve decision history. Where they conflict with the amendment, the amendment is authoritative.

### Historical free invitation

- A Squad Owner may invite a user.
- The user accepts the invitation.
- Invitation itself is free.
- Membership becomes ACTIVE only after the user performs at least one Verified Activity.

### Historical paid membership

A user may purchase membership only when the user does not currently have an eligible Squad membership, except for the higher-tier upgrade path defined in the 2026-09-10 membership lifecycle amendment.

The user does not choose a specific Squad. The user chooses only a member-count/price tier. The backend selects the eligible Squad with the lowest current member count within that tier.

Historical initial Admin-configurable price tiers were:

| Current member count | Initial price |
| -------------------- | ------------: |
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

### Historical dynamic tier and formation

A Squad's tier was derived from its current member count and there was no artificial global member cap. Users could not create Squads or self-assign ownership. The system created Squads automatically and assigned ownership server-side.

### Historical leaving/suspension

- A member could not voluntarily leave a Squad, except through the paid same-tier Squad switch.
- App Ban could terminate membership.
- A revoked/cancelled membership did not receive Challenge rewards.
- `squad_membership.status = suspended` represented suspension.
- Suspension/activation was distinct from the Squad's daily ACTIVE/RISK state.
- A suspended member was not made active merely by activity while suspended.

### 2026-09-10 membership lifecycle amendment — historical record

The following rules were added before the 2026-09-11 product amendment and remain historical unless explicitly superseded below:

1. **Same-tier Switch:** A user with an active or inactive paid Squad membership may switch to a different eligible Squad within the exact member-count tier originally purchased. The current Squad is excluded from selection. The backend reuses the smallest-eligible-Squad selection rule and locks the selected target Squad before the membership mutation. No cooldown or switch-count limit is imposed; the DZX tax is the intended friction.
2. **Switch tax:** The tax is 10% of the DZP price recorded in the purchase/upgrade transaction that established the user's current membership. That DZP-equivalent amount is converted to DZX using the current `economy.dzx_per_dzp` setting. The tax is deducted only from DZX through the existing Economy/Ledger transaction boundary. Insufficient DZX or lack of another eligible Squad causes the entire operation to fail without a charge.
3. **Switch status:** Switching preserves the user's existing membership status (`active` remains `active`; `inactive` remains `inactive`). It does not invoke an additional activation penalty.
4. **Upgrade:** A user with an active or inactive paid membership may select only a strictly higher configured tier. The full price of the new tier is paid in DZP through the existing Economy/Ledger boundary. No value, discount, credit, or carry-over from the old membership is applied.
5. **Upgrade replacement:** The old `squad_memberships` row is changed to `cancelled`, and exactly one replacement row is created for the new membership. The replacement starts `inactive`, following the existing paid-membership activation contract. No two non-cancelled memberships may remain for the user.
6. **Idempotency:** Both operations use dedicated idempotency keys and persist their operation result in the existing ledger transaction metadata so retries do not repeat the financial mutation.

## 3. 2026-09-11 contract amendment — formation model

### 3.1 New users

A new user has **no Squad by default**. The previous automatic `provisionSquadForUsers()` mechanism and its `/api/me` trigger are obsolete and must not exist in the new runtime model.

### 3.2 Referral-based organic formation

- The existing Referral relationship remains the canonical referral relationship; no second Referral system is introduced.
- Referral-connected users form/join the same Squad organically according to the referral tree.
- The first person who starts the relevant referral tree is the permanent Owner of that referral-formed Squad.
- Server-side enforcement remains authoritative and must preserve the one-Squad invariant.
- Referral formation is a Squad membership/formation path, not a replacement Economy/Ledger/Reward system.

### 3.3 Owner-direct invitation

`squad_invitations` is retained as a **third, separate, optional free formation/join path** alongside Referral-based formation and paid membership.

- Owner-direct invitation is not replaced by Referral formation.
- It remains Owner-gated.
- Invitation acceptance remains subject to the one-Squad membership invariant and the existing Verified Activity activation contract unless a later amendment changes that rule.

### 3.4 Paid membership

Paid membership is independent of Owner approval. It may join an existing eligible Squad or participate in the pending matching rules below.

## 4. Ten pricing/classification tiers

Tiers classify a Squad by its **current live member count** and provide the pricing classification used by paid membership operations. They are **not hard membership caps**.

| Tier | Current member count | Canonical `maxMembers` |
| --- | ---: | ---: |
| 1 | 2–10 | `10` |
| 2 | 11–20 | `20` |
| 3 | 21–50 | `50` |
| 4 | 51–100 | `100` |
| 5 | 101–200 | `200` |
| 6 | 201–300 | `300` |
| 7 | 301–400 | `400` |
| 8 | 401–500 | `500` |
| 9 | 501–1000 | `1000` |
| 10 | 1000+ | `NULL` |

For Tier 10, `maxMembers = NULL` is the canonical representation of an unbounded upper range. Tier 10 means `memberCount >= 1000` and never blocks additional membership.

A Squad may cross any classification boundary because a new member joins. For example, a 10-member Tier-1 Squad may accept a new member and become an 11-member Tier-2 Squad. Existing members are promoted for live Squad classification without paying again.

## 5. Purchased Tier versus Current Squad Tier

The system must keep these concepts distinct:

- **Current Squad Tier:** derived from the Squad's current live member count.
- **Purchased Tier:** the historical commercial tier recorded when an individual's paid membership was established.
- **Requested Tier:** the tier selected for a new purchase, switch, or upgrade operation.

Crossing a tier boundary does not rewrite a member's historical Purchased Tier, purchase price, or Ledger history.

The Squad's reward Modifier uses the **Current Squad Tier/live Squad classification**, not each member's Purchased Tier. When the Squad crosses a boundary, all members are subject to the same applicable current-tier Squad behavior; no member is retroactively charged for the promotion.

## 6. Paid purchase matching and deferred charging

### 6.1 Tier 1

1. The user selects Tier 1.
2. If an eligible Squad exists, the backend matches the user to the eligible Squad with the fewest current members, using deterministic tie-breaking and existing locking/transaction discipline.
3. If no eligible Squad exists, the purchase intent becomes `pending` with no DZP charge and no financial Ledger burn.
4. Pending Tier-1 requests are automatically matched when an eligible Squad becomes available.
5. If pending Tier-1 requests are matched together to form a new system-matched Squad, the earliest-created request becomes the Owner.
6. Financial settlement occurs only after a real match and is atomic/idempotent through the existing Economy/Ledger boundary.
7. The user sees a persistent processing state and is notified through the app's existing notification mechanism when the request is settled; a new notification subsystem must not be introduced solely for Squad matching.

### 6.2 Tier 2 through Tier 10

1. The user may tap an unavailable Tier 2–Tier 10 pricing classification.
2. If no qualifying Squad is currently available, the tap creates a persistent `pending` **interest request** with no charge.
3. The request is automatically matched when an eligible Squad becomes available.
4. Financial settlement remains deferred until an actual match.
5. The user is notified through the app's existing notification mechanism; the user must not be required to poll manually.

## 7. No hard tier ceiling

`maxMembers` is a classification boundary, not a database/business rule that rejects additional members. Selection logic must never interpret the upper boundary as a permanent capacity ceiling.

Tier 10 is unbounded. A Tier-9 Squad at 1000 members becomes Tier 10 when the live count reaches 1000; it can continue growing beyond 1000.

## 8. Switch and Upgrade — Phase 6 decision gate

The 2026-09-10 Switch and Upgrade behavior is retained as historical behavior but is **not silently carried forward unchanged**.

### Recommendation — Switch: SURVIVE WITH MODIFICATION

Switch should remain because it provides an explicit user-controlled way to move a paid membership without creating a second membership and because the existing implementation has already been hardened for transaction locking, tax, status preservation and idempotency.

However, the old definition of "same tier" must be changed from a hard member-count capacity concept to the new classification model. The user's historical Purchased Tier remains the commercial reference for the operation; target Squad eligibility must use the new live classification semantics and must not treat `maxMembers` as a hard ceiling.

### Recommendation — Upgrade: SURVIVE WITH MODIFICATION

Upgrade should remain as an explicit paid commercial operation, but it must be kept completely separate from automatic/free Squad promotion. When a Squad crosses from Tier 1 to Tier 2 because a new member joins, existing members do not receive an automatic paid Upgrade and their Purchased Tier does not change.

The existing Economy/Ledger atomicity, replacement-membership model and idempotency are valuable and should be preserved where compatible. The Phase 6 design gate must define how a requested higher Purchased Tier maps to a target Squad under the new classification model and how unavailable higher-tier targets interact with the persistent interest-request mechanism.

No Switch/Upgrade implementation change is authorized by this contract section until the Phase 6 gate is explicitly approved.

## 9. Daily Squad state

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

## 10. Daily DZP Contribution

Verified Activity produces the normal activity reward through the existing Economy/Ledger path.

**1 DZP earned = 1 DZP Contribution.**

Contribution is accounting only and does not mint additional DZP.

The system distinguishes activity types when a Challenge scope requires it. An advertisement Challenge does not count task-completion DZP, and a task Challenge does not count advertisement DZP.

A verified activity may contribute to multiple matching Challenges, but the underlying activity reward is never paid twice merely because multiple Challenges match it.

## 11. Contributors and daily Modifier

The Squad Modifier is produced independently for each day.

At the end of day D, the Squad calculates its contribution for that day. If the Squad is activated by either daily condition, it produces a Modifier for day D+1.

Initial modifier mapping:

| DZP Contribution | Modifier |
| ---------------: | -------: |
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

**Live-tier requirement:** Any Squad-level modifier classification used by runtime reward calculation must resolve from the Squad's current live member-count tier. An individual's historical Purchased Tier must not override the Squad's live classification.

## 12. Weekly Challenges

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

## 13. Rounding

Squad calculations use the existing project's canonical Economy/decimal rounding rules. No Squad-specific rounding algorithm is introduced.

## 14. Security and idempotency

- Membership activation is server-authoritative.
- Purchase/burn is atomic and idempotent through the existing Economy/Ledger boundary.
- Pending purchase/interest state is not a financial transaction until a real match is settled.
- Verified Activity evidence remains server-authoritative.
- Challenge settlement is idempotent.
- Daily state and Modifier calculations are server-authoritative.
- Frontend state never determines eligibility, contribution, Modifier, or reward amounts.
- The one-Squad invariant remains server-authoritative across all three free/paid formation paths.

## 15. Explicitly obsolete designs

The following earlier Squad assumptions are obsolete and must not be implemented:

- hierarchical 10-level Squad bonuses;
- requiring both Daily Target and 50% Active;
- treating Risk as a member state;
- a separate Squad Economy/Ledger/Reward/Verification service;
- carrying Challenge points into a later cycle;
- modifying DZP with the Squad percentage;
- paying membership purchase DZP to the Squad Owner;
- allowing users to select a specific Squad directly;
- allowing users to create Squads or self-assign ownership;
- automatic ten-user/system provisioning as the default formation mechanism;
- treating a tier's `maxMembers` as a hard membership ceiling;
- charging existing members merely because their Squad crosses into a higher live classification tier;
- changing an individual's historical Purchased Tier merely because the Squad's live classification changes;
- using an individual's Purchased Tier as the source of the Squad's live Modifier classification;
- automatic App Ban from Squad/activity logic.

## 16. Changelog

**2026-09-11 — Contract Amendment:** Replaced automatic ten-user provisioning with no-default-Squad membership. Added Referral-based organic formation and retained Owner-direct `squad_invitations` as a separate optional free path. Locked ten pricing/classification tiers, with Tier 10 represented by nullable `maxMembers` (`NULL` = unbounded). Added deferred Tier-1 purchase matching and persistent Tier-2+ interest requests with no charge before match and reuse of the existing notification mechanism. Distinguished live Current Squad Tier from historical Purchased Tier and made live Squad tier the source for Squad-level Modifier behavior. Retained Switch and Upgrade as explicit paid operations pending Phase 6 semantic adaptation rather than silently removing hardened lifecycle behavior.
