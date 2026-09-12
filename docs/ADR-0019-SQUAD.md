# ADR-0019 — Squad Contract and Membership Model

**Status:** Accepted — Business Contract Locked  
**Original Date:** 2026-08-31  
**Latest Amendment:** 2026-09-12 — Ten-tier pricing and uncapped activity-derived Squad Modifier

## Context

Earlier Squad material described a hierarchical ten-level model and a daily activation rule requiring both a member target and 50% activity. That design is obsolete. The current Squad contract must remain the only business source of truth before and during runtime implementation work.

## Decision

The complete locked Squad business contract is defined in `docs/SQUAD_SYSTEM_CONTRACT.md`. This ADR records the pricing and Modifier amendment at ADR level and is authoritative with that contract.

### A. Final ten-tier pricing

The six-tier pricing table is superseded by the following final ten-tier classification/pricing table:

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

T10 has no upper member ceiling. `1000+` is a floor. These are classification/pricing tiers, not hard global member caps.

The selected tier price is the price at purchase time. Paid DZP continues to be burned through the existing Economy/Ledger boundary and is not paid to the Squad Owner.

### B. Squad Modifier formula

The previous fixed-threshold Modifier mapping is replaced by a continuous activity-derived formula.

**Total Contribution DZP** is the sum of the RAW, pre-Modifier DZP value of all qualifying Verified Activity across all eligible members of the Squad for that day.

The Modifier is:

`Modifier % = Total Contribution DZP / 100`

The Modifier is **UNCAPPED**. No maximum percentage is imposed.

The Modifier is justified by genuine verified activity and is not an independent issuance source. It is calculated independently for each day and does not compound prior Modifier values.

### C. Contribution DZP vs Earned DZP — protected separation

The implementation must preserve a strict distinction:

- **Contribution DZP:** raw, pre-Modifier verified-activity value. This is the only value used for the Squad Target and Modifier calculation.
- **Earned DZP:** actual DZP credited to a user's wallet after the Modifier is applied.

Earned DZP after Modifier application must never feed back into Contribution DZP for the same user, the aggregate Squad, or any later day. This is an explicit anti-feedback/economic-safety requirement.

Before implementation code is changed, the existing Economy schema and Ledger/Reward paths must be inspected to determine whether the existing wallet fields (`earned_dzp`, `converted_dzp`, `purchased_dzp`) provide a clean reusable separation. If they do not represent an aggregate Squad-level raw contribution cleanly, the implementation design must report the least-state alternative before introducing any new state. No new ledger primitive may be invented merely for Squad.

### D. Activation condition

For a Squad's Modifier to be active for the following day, **at least one** of these conditions must hold for the current day:

1. At least **50% of eligible Squad members** performed qualifying Verified Activity that day; OR
2. The **Squad Target** is reached, where:
   `Squad Target = eligible Squad Members × 10`
   and the target is measured using raw Contribution DZP.

The two conditions are alternatives, not cumulative requirements.

### E. Per-member eligibility for the Modifier benefit

Squad-level activation and member-level benefit eligibility are separate.

Once the Modifier is active, only a member who performed qualifying Verified Activity on that same day and therefore has actual base earnings receives the Modifier benefit on that member's own qualifying earnings.

A member with zero verified activity that day receives **no Modifier bonus**. Other members' activity may activate the Squad Modifier, but it never creates a bonus for an inactive member.

### F. Modifier scope

The Modifier applies to **all three currencies**:

- COIN
- DZX
- DZP

For example, a 150% Modifier applied to a qualifying base reward of `1000 COIN + 1 DZX + 1 DZP` results in `2500 COIN + 2.5 DZX + 2.5 DZP`.

This explicitly reverses the earlier rule that excluded DZP from Modifier application.

## Superseded decisions / changelog

### Superseded: old six-tier table

The former six-tier initial table ending at 201–300 members and describing further tiers as Admin-defined is superseded by the final locked ten-tier table in this amendment.

### Superseded: fixed Modifier thresholds

The former fixed mapping:

- 1,500 DZP → 15%
- 5,000 DZP → 50%
- 10,000 DZP → 100%
- 15,000 DZP → 100%
- maximum 100%

is **fully replaced** by `Modifier % = Total Contribution DZP / 100`, with **no cap**.

### Superseded: DZP excluded from Modifier

The former rule that Squad Modifier applied to qualifying reward currencies **except DZP** is explicitly reversed. DZP is now included alongside COIN and DZX.

### Superseded: earned-to-contribution equivalence for Modifier accounting

Any prior wording that treats post-Modifier Earned DZP as the same value as Modifier Contribution DZP is superseded. Modifier accounting must use raw pre-Modifier Contribution DZP only.

### Superseded: contributor-only activation interpretation

The Squad activation condition is Squad-wide and may be satisfied by either 50% active members OR the raw DZP Squad Target. Once activated, the benefit is then evaluated per member. A member need not personally cause activation, but must have qualifying activity and actual base earnings to receive the benefit.

## Existing locked decisions retained

All other accepted Squad decisions remain unchanged unless explicitly superseded above, including system-created Squads, one-Squad membership, server-authoritative Verified Activity, existing Economy/Ledger as economic source of truth, paid membership burn, activation after Verified Activity, same-tier switch, upgrade lifecycle, daily UTC+1 accounting, Challenge separation, canonical rounding, and idempotency.

## Consequences

1. Phase implementation must replace the legacy fixed Modifier thresholds with the formula above.
2. Contribution accounting must be demonstrably protected from post-Modifier Earned DZP feedback.
3. Modifier application must include COIN, DZX, and DZP.
4. The 50%-active and Squad Target conditions are OR conditions.
5. Inactive members receive no Modifier benefit even when the Squad as a whole is activated.
6. T10 is unbounded above and must be represented without an artificial maximum member count.
7. **No economy/reward implementation is authorized by this documentation amendment itself.** Implementation follows the Constitution 54 sequence: Contract → ADR/Documentation → Implementation → Tests → CI → Verify.
