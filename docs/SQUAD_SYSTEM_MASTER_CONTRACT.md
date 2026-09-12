# DzMoney — Squad System Master Contract

> **Status: Draft for Contract Reconciliation — Business/Design Source**
>
> This document consolidates the current Squad business model and the decisions explicitly locked for the redesigned Squad roadmap. It is documentation only. It does not authorize runtime implementation by itself.
>
> **Authority order:** current GitHub implementation/schema/tests for implemented behavior; this document for the redesigned business contract once approved/merged. Any contradiction must be resolved by Contract Lineage before implementation.

## 1. Scope and invariants

Squad is a membership, classification, and modifier layer. It must reuse existing project sources of truth and must not create parallel systems for Economy, Ledger, Reward, Verification, Activity, Task, or Advertisement Event.

Core invariants:

- A user belongs to at most one live Squad membership at a time.
- Existing membership statuses are `active`, `inactive`, `suspended`, and terminal `cancelled`.
- `active`, `inactive`, and `suspended` count as having a Squad; `cancelled` does not.
- Membership, reward, balance, verification, eligibility, and financial state remain server-authoritative.
- Financial mutations must remain atomic and idempotent through the existing Economy/Ledger boundary.
- No frontend code is a source of truth for reward, balance, verification, eligibility, or payment settlement.
- No new service, table, notification subsystem, or economic source of truth is introduced when an existing project primitive is sufficient.

## 2. Squad formation entry paths

There are three independent entry paths. They coexist and must not be conflated.

### 2.1 Referral-based organic formation

The existing Referral relationship is reused as the canonical relationship for organic Squad formation. No second referral system is introduced.

Formation rules:

- **A — both users have no live Squad:** create one new Squad for the referral relationship.
- **B — exactly one user has a live Squad:** the other user joins that Squad.
- **C — inconsistent/impossible state:** reject formation defensively without inventing a new Squad or mutating unrelated state.
- **D — both users are already in the same Squad:** no-op.
- **E — users are in different Squads:** reject Squad formation; preserve the Referral attribution.

The formation operation is synchronous after the Referral attribution is created. The first person who establishes the resulting referral-formed Squad is the deterministic Owner, subject to the one-Squad invariant.

The former automatic ten-user provisioning model is obsolete and must not be reintroduced.

### 2.2 Owner-direct invitation

`squad_invitations` remains an independent, optional third path.

- It is not replaced by Referral formation.
- It is not converted into a Referral relationship.
- It remains an Owner-direct free invitation/acceptance path.
- Free membership activation continues to require the applicable Verified Activity contract.

### 2.3 Paid membership

Paid membership is a separate path.

- The user does not select a specific Squad.
- The user selects a requested pricing/classification tier.
- The backend performs eligibility and deterministic matching.
- Paid membership does not require Owner approval.
- Payment is never represented by a frontend-only mutation.

## 3. Ten live classification tiers

The ten tiers are **pricing/classification categories, not hard membership caps**.

| Tier | Current live member count | Price | `maxMembers` |
| --- | ---: | ---: | ---: |
| T1 | 1–10 | 100 DZP | 10 |
| T2 | 11–20 | 200 DZP | 20 |
| T3 | 21–50 | 500 DZP | 50 |
| T4 | 51–100 | 1,000 DZP | 100 |
| T5 | 101–200 | 2,000 DZP | 200 |
| T6 | 201–300 | 3,000 DZP | 300 |
| T7 | 301–400 | 4,000 DZP | 400 |
| T8 | 401–500 | 5,000 DZP | 500 |
| T9 | 501–1000 | 7,500 DZP | 1000 |
| T10 | 1000+ | 10,000 DZP | `NULL` |

### T10 rule

`maxMembers = NULL` means **UNBOUNDED**. It is the canonical representation of the 1000+ classification and must never be interpreted as a numeric capacity.

### Boundary rule

Crossing a classification boundary is automatic and free for existing members. A Squad may grow beyond every listed upper boundary.

Examples:

- 10 → 11 members: T1 → T2.
- 20 → 21: T2 → T3.
- 100 → 101: T4 → T5.
- 1000 → 1001: T9 → T10.

No existing member must repurchase merely because the live Squad classification increases.

## 4. Three distinct tier concepts

The system must never conflate these concepts:

### Current Squad Tier

The live classification derived from the Squad's current live member count.

### Purchased Tier

The historical commercial tier recorded when a user's paid membership was established. It is not silently rewritten when the Squad grows.

### Requested Tier

The tier selected for a new purchase, Switch, or Upgrade operation.

Current Squad Tier is a live classification. Purchased Tier is historical commercial state. Requested Tier is an operation input.

## 5. Paid purchase matching

### 5.1 Tier 1

If an eligible Squad exists, the backend matches the purchaser to the eligible Squad with the fewest current members, using deterministic tie-breaking and the existing transaction/locking discipline.

If no eligible T1 Squad exists:

- create a persistent pending purchase intent;
- charge **zero DZP** at pending creation;
- perform no Ledger burn for the pending state;
- settle only when an eligible match is actually available;
- make the pending state visible to the user;
- reuse the existing notification mechanism when settlement becomes possible/complete.

When pending T1 requests form a new matched Squad, the earliest pending request becomes the resulting Squad Owner.

### 5.2 Tier 2+

If no qualifying Squad is currently available:

- create a persistent interest request with `pending` state;
- charge **zero** at interest creation;
- do not create a financial Ledger mutation until actual settlement;
- automatically match when an eligible Squad becomes available;
- notify through the existing notification mechanism;
- do not create a new notification subsystem.

## 6. Squad growth and classification

Classification never acts as a hard capacity gate.

A new member may cause the Squad to move to a higher classification. Existing members automatically receive the higher live classification for Squad-level behavior without a retroactive purchase or charge.

The system must not reject a valid join solely because the previous classification's upper number has been crossed.

## 7. Modifier — Diminishing Returns

The Squad activity modifier uses a diminishing-returns curve based on raw total contribution.

### Locked design direction

Replace the previous linear form:

`Contribution / 100`

with the square-root curve:

`Modifier(C) = sqrt(C)`

where `C` is the raw `Total Contribution DZP`.

The square-root result is interpreted as the modifier percentage. For example:

- `C = 10,000` → `sqrt(C) = 100` → **100%**
- `C = 75,000` → `sqrt(C) = 273.86` → **273.86%**
- `C = 500,000` → `sqrt(C) = 707.11` → **707.11%**

### Economic intent

This curve is intentionally:

- monotonic: more contribution never reduces the modifier;
- unbounded: there is no arbitrary hard cap;
- diminishing: each additional unit contributes less incremental modifier as contribution grows;
- incentive-friendly at lower activity levels;
- protective against runaway linear growth at very high activity levels.

The square-root function is therefore a business/economic contract decision, not a cosmetic refactor.

### Important multiplier distinction

**Modifier** and **Multiplier** are different concepts.

- `Modifier` is the percentage generated from the contribution curve.
- `Multiplier` is the final factor applied to the base reward.

The exact final Multiplier equation must be taken from the actual DzMoney reward contract/implementation before runtime modification. It must not be invented from an example calculation.

## 8. Economic reference values

For economic simulation and validation, the current reference assumptions are:

- `1 TON = 10,000 DZX`.
- `1 TON = $1.40`.
- Reference advertisement CPM = `$1.18`.

These values are simulation inputs and must not silently become hard-coded runtime constants unless their existing project configuration/contract confirms that behavior.

## 9. Economic safety requirements

For every proposed Modifier/Multiplier implementation, validate at minimum:

1. contribution = 0;
2. small contribution increments;
3. tier-boundary contribution;
4. 75,000 DZP reference scenario;
5. 100,000 contribution scenario;
6. 500,000 contribution stress scenario;
7. very large contribution values;
8. monotonicity;
9. diminishing marginal returns;
10. numerical precision and overflow safety;
11. reward cost versus advertisement revenue;
12. positive safety margin under realistic and stress assumptions.

No economic implementation is accepted merely because a unit test returns a mathematically valid number. Revenue, reward cost, Ledger effects, idempotency, and runtime provider behavior must remain consistent.

## 10. Membership lifecycle — Switch

Same-tier Switch remains a paid lifecycle operation subject to the later semantic gate.

The redesigned contract requires:

- the user's historical Purchased Tier remains the commercial reference for the same-tier operation;
- target selection uses the new live classification model rather than treating `maxMembers` as a hard capacity;
- the current Squad is excluded from target selection;
- existing approved tax, atomicity, status-preservation, and idempotency rules remain unless a later contract explicitly changes them;
- Switch must not be confused with automatic free Squad classification growth.

## 11. Membership lifecycle — Upgrade

Upgrade remains an explicit paid operation and is distinct from automatic/free Squad promotion.

- A live Squad moving to a higher classification does **not** automatically upgrade a user's Purchased Tier.
- An Upgrade occurs only through an explicit user-paid operation.
- If the requested higher tier has no eligible Squad, use the same persistent interest-request mechanism defined for Tier 2+ availability.
- The pending Upgrade request is zero-charge until an eligible match exists.
- Settlement and notification reuse the existing financial and notification primitives.
- The precise Phase 6 settlement semantics must be validated against the existing membership lifecycle implementation before code changes.

## 12. Ownership rules

Ownership is server-authoritative.

- Users cannot self-assign ownership.
- Referral-created Squad ownership follows the deterministic first-formation rule.
- For pending T1 system matching, the earliest pending request becomes Owner when the resulting Squad is formed.
- Owner-direct invitations remain an independent entry path.
- Paid membership does not require Owner approval.

## 13. State and status rules

Do not invent a `removed` membership status when the current schema uses `cancelled` as the terminal state.

For live-Squad membership checks, the explicit live allow-list is:

`active`, `inactive`, `suspended`

`cancelled` is terminal/non-live.

This rule is local to membership semantics. A different occurrence such as a uniqueness constraint using `status <> 'cancelled'` must not be globally rewritten without semantic inspection.

## 14. Source-of-truth boundaries

### Economy / Ledger

All financial charging, settlement, burning, and balance effects remain within the existing Economy/Ledger boundary.

### Reward

Reward calculation remains server-authoritative and must consume the approved Squad modifier without moving reward authority to the frontend.

### Verification

Verified Activity remains the source of qualifying activity evidence.

### Activity

Squad contribution is derived from the existing activity/economic contract and must not create a second activity ledger.

### Referral

The existing Referral relationship is the source for referral-based organic Squad formation.

### Advertisement Event

Advertisement events remain governed by the existing Advertisement Event source of truth. Squad reward accounting must not create a parallel ad-event record merely to calculate contribution.

## 15. Prohibited regressions

The following must not be reintroduced:

- automatic ten-user Squad provisioning;
- `/api/me` as an automatic Squad-provisioning trigger;
- treating classification boundaries as hard capacity limits;
- a numeric upper bound for T10;
- conflating Current Tier with Purchased Tier;
- automatic paid Upgrade when a Squad grows;
- Owner approval for paid membership;
- a duplicate referral system;
- a duplicate notification subsystem;
- a new Economy, Ledger, Reward, Verification, Activity, Task, or Advertisement Event source of truth;
- frontend-authoritative rewards or balances;
- charging a pending request before an actual match;
- global replacement of membership status predicates without semantic proof.

## 16. Phase gates

### Phase 0 — Contract Lock

Contract decisions are documented and reconciled before runtime implementation.

### Phase 1 — Remove Old Automatic Provisioning

The obsolete automatic provisioning mechanism is removed from runtime.

### Phase 2 — Organic Squad Formation via Referral

Referral-based A/B/C/D/E behavior is implemented and verified. Referral attribution remains intact in case E.

### Phase 3 — Ten Live Classification Tiers

Implement and verify the ten live classification tiers. Tests must cover lower bound, upper bound, exact boundary, +1 transition, T10, and every classification transition.

### Phase 4 — Paid Purchase + Tier-1 Waiting

Implement immediate matching when eligible and persistent zero-charge pending matching otherwise.

### Phase 5 — Persistent Interest Requests

Implement persistent Tier 2+ interest requests, notification, and deferred settlement.

### Phase 6 — Switch and Upgrade Semantic Gate

Finalize and implement the redesigned Switch/Upgrade semantics, including the same interest-request mechanism when no eligible target exists.

### Phase 7 — Modifier/Economy decision and implementation gate

Finalize the economic contract, validate the square-root modifier through stress simulations, then implement only after Economy/Ledger/Reward lineage is verified.

## 17. Acceptance criteria

The Squad system is accepted only when:

- the contract and implementation agree;
- current membership status semantics are preserved;
- Referral formation A/B/C/D/E is behaviorally verified;
- the ten classification tiers are correct, including T1 = 1–10 and T10 = 1000+;
- T10 uses `NULL` for unbounded `maxMembers`;
- classification is never treated as a hard cap;
- Current, Purchased, and Requested Tier are distinct;
- pending purchases/interests are zero-charge before matching;
- settlement is atomic and idempotent;
- existing notification infrastructure is reused;
- Modifier is monotonic, unbounded, and diminishing;
- the actual Multiplier equation is proven from code/contract before implementation;
- economic stress tests demonstrate acceptable safety margin;
- no unrelated business/API/schema behavior is changed;
- no future phase is implemented early;
- CI and behavioral tests run on the exact repair HEAD;
- runtime/provider truth is verified separately from CI;
- documentation, tests, schema, implementation, and callers have no stale conflicting contract.

## 18. ODRCA / Constitution 54 operating rule

All future Squad changes follow:

**Fail → Trace → Root Cause → Minimal Fix → Verify → Record → Continue**

and:

**Observe → Correlate → Diagnose → Repair → Confirm**

No implementation starts from an assumption. Ambiguity requires inspection of implementation, tests, schema/migrations, callers, and documentation. Economy, Ledger, Reward, Verification, TON, and other protected systems must not be modified by routine cleanup.

## 19. Phase 8 — Squad UX Contract (Design Only)

Phase 8 is a **design gate only**. It defines how the already-approved Squad contract is presented to users. It does not authorize runtime business-logic changes.

### UX objectives

The Squad UI must make the user's state understandable without conflating live classification, purchased commercial state, or a pending request.

The design must cover:

- Squad entry/navigation and discovery;
- Current Squad Tier;
- current live member count;
- Squad Owner;
- membership state;
- Purchased Tier;
- Requested Tier when an operation is pending;
- contribution/activity;
- approved Modifier and reward presentation;
- pending purchase/interest state;
- Switch and Upgrade actions;
- referral-created Squad state;
- Owner-direct invitation state;
- no-Squad, empty, loading, success, unavailable, already-member, and error states;
- settlement and notification states.

### Tier presentation rules

- Show T1–T10 consistently with the canonical classification table.
- T10 must be presented as `1000+`, never as a finite capacity.
- The upper number of a tier must never be presented as a hard membership cap.
- A live classification increase must not be presented as a purchase or charge.
- Current Tier, Purchased Tier, and Requested Tier must have distinct labels and meanings.

### Purchase and pending UX

The UI must distinguish:

1. immediately matched paid membership;
2. pending T1 purchase;
3. Tier 2+ interest request;
4. pending Switch/Upgrade where applicable;
5. completed settlement.

Pending states must clearly communicate **zero charge before settlement** and must not imply that payment has already been consumed.

Paid membership must not display Owner approval as a prerequisite.

### Switch and Upgrade UX

Switch and Upgrade must be visibly distinct from automatic classification growth.

- A higher Current Squad Tier is not an automatic Purchased Tier upgrade.
- Upgrade is explicitly paid.
- When no eligible target exists, the UI presents the persistent pending/interest state rather than a false immediate rejection.
- Confirmation screens must clearly state the requested operation and applicable price before settlement.

### Economy transparency

The UI may display server-provided reward, modifier, price, contribution, and settlement information, but it must never calculate or authorize financial truth independently.

No frontend-only balance, reward, verification, eligibility, or payment state is authoritative.

### Telegram Mini App constraints

The design must remain compatible with the existing vanilla HTML/CSS/JavaScript Telegram Mini App architecture. Phase 8 must not introduce a framework, service, database table, or parallel state system merely for presentation.

### Phase 8 acceptance criteria

Phase 8 is accepted only when:

- all required Squad states have an explicit UX representation;
- Current/Purchased/Requested Tier cannot be confused;
- tier boundaries are not described as hard caps;
- T10 is clearly unbounded/1000+;
- pending states clearly communicate zero-charge-before-settlement;
- paid membership does not imply Owner approval;
- Switch and Upgrade are clearly distinguished from free classification growth;
- loading/empty/error/success/pending states are defined;
- the design maps directly to existing backend contracts without inventing new business rules;
- no runtime implementation is performed merely by completing the design gate.

## 20. Phase 9 — Squad UI Implementation Gate

Phase 9 begins only after Phase 8 design acceptance.

Implementation rules:

- implement the approved Phase 8 UX only;
- use the existing vanilla HTML/CSS/JavaScript architecture;
- do not introduce a new frontend framework for Squad;
- do not introduce a new service, table, notification system, or economic source of truth;
- keep all reward, balance, verification, eligibility, membership, and settlement authority on the server;
- consume existing APIs/contracts rather than silently changing their business semantics;
- no Economy/Ledger/Reward/Verification/TON changes unless a separately approved contract requires them;
- preserve Telegram WebApp behavior;
- use minimal diffs and avoid unrelated cleanup.

### Phase 9 behavioral requirement

Route existence or source-text assertions are insufficient. UI implementation must be verified through realistic behavior, including state transitions, user interaction, backend responses, pending states, errors, and successful settlement where applicable.

### Phase 9 acceptance criteria

- every approved Phase 8 state is reachable through the actual UI;
- user actions produce the expected server interaction;
- displayed state reflects server responses rather than frontend assumptions;
- pending operations remain pending until the backend confirms settlement;
- financial values cannot be fabricated or mutated client-side;
- Telegram Mini App interaction remains functional;
- no unrelated API/schema/business behavior changes are introduced;
- tests cover behavioral paths, not merely route/source existence.

## 21. Phase 10 — Investigation and Validation Gate

Phase 10 is the formal validation stage after UI implementation. It is an investigation gate, not a license to patch failures without diagnosis.

### Validation model

Use ODRCA:

1. **Observe** — collect actual UI, API, database, logs, CI, and provider/runtime evidence.
2. **Correlate** — connect user-visible behavior to the exact backend path, state, contract, and data mutation.
3. **Diagnose** — identify the root cause before changing code.
4. **Repair** — apply the smallest justified repair within the active phase.
5. **Confirm** — rerun the same scenario on the exact repair HEAD and verify no new failure was introduced.

### Realistic user-experience simulation

Validation must simulate the user's actual journey rather than stopping at route existence or string matching.

At minimum validate:

- referral formation A/B/C/D/E;
- no-Squad and existing-Squad states;
- paid purchase with an eligible match;
- paid purchase with no eligible T1 match and persistent pending state;
- Tier 2+ interest request and later availability;
- Current/Purchased/Requested Tier presentation;
- classification boundary transitions;
- T10 / 1000+ presentation;
- contribution and Modifier display;
- Switch behavior;
- Upgrade behavior;
- pending Upgrade/interest behavior when no eligible target exists;
- notifications using the existing mechanism;
- success, loading, empty, unavailable, and error states;
- server-authoritative balance/reward/eligibility behavior;
- duplicate/retry/idempotency scenarios for sensitive operations.

### Runtime versus CI

CI PASS is necessary but does not by itself prove Telegram/provider/runtime correctness. Where behavior depends on Telegram WebApp or external advertisement/provider runtime, validate the actual runtime path separately.

### Phase 10 stop conditions

Stop rather than patch when:

- the active branch or exact HEAD is unclear;
- implementation and contract lineage disagree;
- test lineage is unknown;
- schema/migration semantics are unclear;
- the failure crosses a protected Economy/Ledger/Verification/TON boundary without an approved contract;
- the minimal repair would require unrelated business logic changes;
- CI is running against a different HEAD from the repair;
- provider/runtime truth is unavailable for a claim that depends on it.

## 22. Complete phase-gate order

The Squad roadmap is sequential at the contract/implementation gate level:

**Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 7 → Phase 8 → Phase 9 → Phase 10**

Rules:

- Do not begin implementation of Phase N+1 while Phase N acceptance remains unresolved.
- Phase 8 is design-only until the applicable business contracts are locked/reconciled.
- Phase 9 starts only after Phase 8 acceptance.
- Phase 10 validates Phase 9 and does not authorize unrelated future-phase implementation.
- Documentation of a future phase does not mean that phase has been implemented.
- Any contradiction between this contract and current implementation must be resolved through Contract Lineage before runtime changes.

## Change record

- **Current document:** consolidated master Squad contract for reconciliation.
- **Design direction:** organic referral formation + optional Owner-direct invitation + paid matching; ten live classification tiers; persistent pending/interest; distinct live/purchased/requested tiers; diminishing-returns modifier.
- **Modifier decision recorded here:** `sqrt(TotalContributionDZP)`.
- **Multiplier equation:** intentionally left dependent on proven existing contract/implementation; no assumption is made here.
- **Phase 8–10 addition:** UX design, UI implementation gate, and realistic investigation/validation are explicitly part of the master roadmap and remain gated; documentation does not imply implementation.
