# DzMoney — Squad System Master Contract

> **Status: Draft for Contract Reconciliation — Business/Design Source**
>
> This document consolidates the current Squad business model and the decisions explicitly locked for the redesigned Squad roadmap. It is documentation only. It does not authorize runtime implementation by itself.
>
> **Authority order:** current GitHub implementation/schema/tests for implemented behavior; this document for the redesigned business contract once approved/merged. Any contradiction must be resolved by Contract Lineage before implementation.

## 19. Phase 8 — Squad UX Contract (Design Only)

Phase 8 is a design-only gate. It defines how the approved Squad contract is presented to users and does not authorize runtime business-logic changes.

### UX objectives

The Squad UI must make the user's state understandable without conflating live classification, purchased commercial state, or a pending request.

The design must cover navigation/entry, Current Squad Tier, live member count, Owner, membership state, Purchased Tier, Requested Tier, contribution/activity, approved Modifier/reward presentation, pending purchase/interest, Switch, Upgrade, referral formation, Owner-direct invitation, and loading/empty/success/unavailable/already-member/error/notification/settlement states.

### Tier presentation

- Show T1–T10 using the canonical classification table.
- T10 is `1000+` and must never be presented as a finite capacity.
- Tier upper boundaries are classifications, not hard membership caps.
- Live classification growth is not a purchase and does not create a charge.
- Current Tier, Purchased Tier, and Requested Tier must have distinct labels and meanings.

### Purchase and pending UX

The UI must distinguish immediate paid matching, pending T1 purchase, Tier 2+ interest request, pending Switch/Upgrade, and completed settlement. Pending states must clearly communicate zero charge before settlement. Paid membership must not display Owner approval as a prerequisite.

### Switch and Upgrade UX

Switch and Upgrade must be visibly distinct from automatic classification growth. A higher Current Squad Tier is not an automatic Purchased Tier upgrade. Upgrade is explicitly paid. If no eligible target exists, present the persistent pending/interest state rather than a false immediate rejection.

### Economy transparency

The UI may display server-provided reward, modifier, price, contribution, and settlement information, but it must never calculate or authorize financial truth independently. Frontend state is never authoritative for balance, reward, verification, eligibility, or payment settlement.

### Telegram Mini App constraints

Phase 8 must remain compatible with the existing vanilla HTML/CSS/JavaScript Telegram Mini App architecture and must not introduce a framework, service, database table, or parallel state system merely for presentation.

### Phase 8 acceptance

Phase 8 is accepted only when all required Squad states have explicit UX representations; Current/Purchased/Requested Tier cannot be confused; tier boundaries are not described as hard caps; T10 is clearly unbounded/1000+; pending states communicate zero-charge-before-settlement; paid membership does not imply Owner approval; Switch and Upgrade are distinguished from free classification growth; loading/empty/error/success/pending states are defined; the design maps to existing backend contracts without inventing business rules; and no runtime implementation is performed merely by completing the design gate.

## 20. Phase 9 — Squad UI Implementation Gate

Phase 9 begins only after Phase 8 acceptance.

Implementation rules:

- implement only the approved Phase 8 UX;
- use the existing vanilla HTML/CSS/JavaScript architecture;
- introduce no new frontend framework, service, table, notification system, or economic source of truth;
- keep reward, balance, verification, eligibility, membership, and settlement authority on the server;
- consume existing APIs/contracts rather than silently changing business semantics;
- no Economy/Ledger/Reward/Verification/TON changes unless separately approved by contract;
- preserve Telegram WebApp behavior;
- use minimal diffs and avoid unrelated cleanup.

Route existence or source-text assertions are insufficient. UI implementation must be verified through realistic behavior: state transitions, user interaction, backend responses, pending states, errors, and successful settlement where applicable.

Phase 9 is accepted only when every approved Phase 8 state is reachable through the actual UI, user actions produce expected server interaction, displayed state reflects server responses, pending operations remain pending until backend confirmation, financial values cannot be fabricated or mutated client-side, Telegram Mini App interaction remains functional, no unrelated behavior changes are introduced, and tests cover behavioral paths rather than only route/source existence.

## 21. Phase 10 — Investigation and Validation Gate

Phase 10 is the formal validation stage after UI implementation. It is an investigation gate, not a license to patch failures without diagnosis.

### ODRCA validation

1. **Observe** — collect actual UI, API, database, logs, CI, and provider/runtime evidence.
2. **Correlate** — connect user-visible behavior to the exact backend path, state, contract, and data mutation.
3. **Diagnose** — identify the root cause before changing code.
4. **Repair** — apply the smallest justified repair within the active phase.
5. **Confirm** — rerun the same scenario on the exact repair HEAD and verify no new failure was introduced.

### Realistic UX validation

At minimum validate referral formation A/B/C/D/E; no-Squad and existing-Squad states; paid purchase with eligible matching; T1 pending when no eligible match exists; Tier 2+ interest and later availability; Current/Purchased/Requested Tier presentation; classification transitions; T10/1000+ presentation; contribution and Modifier display; Switch; Upgrade; pending Upgrade/interest; existing notifications; loading/empty/success/unavailable/error states; server-authoritative balance/reward/eligibility; and duplicate/retry/idempotency behavior for sensitive operations.

### Runtime versus CI

CI PASS is necessary but does not by itself prove Telegram/provider/runtime correctness. Provider/runtime-dependent behavior must be validated separately from CI.

### Stop conditions

Stop rather than patch when the active branch or exact HEAD is unclear; implementation and contract lineage disagree; test lineage is unknown; schema/migration semantics are unclear; a failure crosses protected Economy/Ledger/Verification/TON boundaries without an approved contract; the minimal repair would require unrelated business logic; CI is running against a different HEAD; or provider/runtime truth is unavailable for a claim that depends on it.

## 22. Complete phase-gate order

**Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 7 → Phase 8 → Phase 9 → Phase 10**

- Do not begin Phase N+1 implementation while Phase N acceptance remains unresolved.
- Phase 8 is design-only until applicable business contracts are locked/reconciled.
- Phase 9 starts only after Phase 8 acceptance.
- Phase 10 validates Phase 9 and does not authorize unrelated future-phase implementation.
- Documentation of a future phase does not mean that phase has been implemented.
- Any contradiction between this contract and current implementation must be resolved through Contract Lineage before runtime changes.

## Change record

- **Master contract:** consolidated Squad business/design contract for reconciliation.
- **Modifier:** `sqrt(TotalContributionDZP)` is the locked design direction.
- **Multiplier:** exact runtime equation remains dependent on proven existing reward contract/implementation; no assumption is authorized.
- **Phase 8–10:** UX design, UI implementation, and realistic investigation/validation are explicitly included as gated phases; documentation does not imply implementation.
