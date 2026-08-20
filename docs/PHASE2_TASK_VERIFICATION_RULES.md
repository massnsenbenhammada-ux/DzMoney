# DzMoney 2.0 — Phase 2 Task Verification Rules

## Status

Design decision locked before Phase 2 implementation.

## Scope

These rules apply to **all task categories except advertisement tasks**.

Advertisement items are already ad-based and therefore do not receive a second verification advertisement.

## Task interaction flow

Every non-advertisement task exposes two separate actions:

1. **Execute** — the user performs the required task action.
2. **Verify** — the user requests server-side verification after attempting the task.

The verification flow is:

**Execute → Verify → short verification advertisement → server-side verification → reward**

## Verification advertisement

When the user presses **Verify**, the system must require completion of a short advertisement before performing the final verification/reward step.

The verification advertisement duration is configurable between the agreed short durations:

- 5 seconds; or
- 10 seconds.

The exact duration/configuration is controlled by the backend/Admin configuration and must not be trusted from the frontend.

## Reward rules

- Viewing the verification advertisement **does not create an additional task reward**.
- The verification advertisement is a prerequisite/gate for verification, not a separate reward source.
- The task reward is issued only after the server confirms that the task requirements were actually satisfied.
- A user cannot obtain the task reward merely by opening or completing the verification advertisement.
- A successful task verification issues the configured task reward exactly once.
- Duplicate Verify requests, repeated advertisement callbacks, refreshes, retries, or repeated idempotency keys must not create duplicate rewards.

## Economy rules

For standard qualifying activity, the default reward remains:

**1,000 COIN + 1 DZX + 1 DZP**

The exact reward is Admin-configurable.

Only the **earned activity DZP** issued for the qualifying task contributes to Daily Activity / Reward Pool weighting.

The verification advertisement itself:

- does not add another DZP;
- does not add another DZX;
- does not add another COIN;
- does not create earned activity DZP separately.

## Ledger requirements

The backend must record the task reward with its real source as `task` (or the final agreed task source identifier).

The verification advertisement must remain distinguishable in audit metadata as a verification gate and must never be silently reclassified as a separate task reward.

The final reward transaction must be atomic and idempotent.

## Acceptance criteria

A Phase 2 implementation is not accepted unless all of the following pass:

- [ ] Every non-ad task has Execute and Verify actions.
- [ ] Advertisement tasks do not receive a second verification advertisement.
- [ ] Verify cannot finalize a reward before the configured short ad gate is completed.
- [ ] The backend performs the authoritative task verification.
- [ ] Failed verification produces no task reward.
- [ ] Successful verification produces exactly one configured reward.
- [ ] Repeated Verify attempts cannot duplicate the reward.
- [ ] Repeated ad callbacks cannot duplicate the reward.
- [ ] The verification advertisement does not create an additional reward.
- [ ] Task-earned DZP is the only DZP from this flow that contributes to activity weight.
- [ ] The transaction and ledger records preserve the task source and verification-gate metadata.
- [ ] Squad, Referral, Reward Pool and Promo logic remain independent from the task verification mechanism.

## Implementation constraint

**Do not implement Phase 2 until the complete Phase 2 design and acceptance criteria have been reviewed and approved.**
