# DzMoney — Squad Phase 6 Contract Amendment

> **Status: Accepted — Phase 6 semantic decision locked**
>
> This amendment is part of the Squad System Master Contract and locks the source-membership validity rule for deferred Upgrade requests. It authorizes contract lineage only; it does not authorize runtime implementation until the Phase 6 implementation gate is satisfied.

## 1. Scope

This amendment defines when a persistent, zero-charge `Upgrade` interest request remains eligible for deferred settlement and when it must become terminal `invalidated`.

It applies only to pending Upgrade requests. Existing paid-purchase interest requests are not changed by this amendment.

## 2. Recorded source context

When a paid Upgrade cannot be matched immediately, the pending request must retain the source membership context on which the Upgrade was requested:

- `current_membership_id`
- `current_squad_id`

The pending request remains zero-charge while it is valid and pending.

## 3. Valid source membership

A pending Upgrade request has a valid source membership only when all of the following remain true at settlement time:

1. the recorded `current_membership_id` still exists;
2. that membership belongs to the same user who created the request;
3. its status is exactly one of `active` or `inactive`;
4. its `squad_id` is still the recorded `current_squad_id`.

The membership status `suspended` is **not** a valid source state for deferred Upgrade settlement.

## 4. Invalidation rule

A pending Upgrade request becomes `invalidated` when its recorded source membership no longer satisfies the valid-source rule above.

Therefore the following source changes invalidate the request:

- source membership becomes `suspended`;
- source membership becomes terminal `cancelled`;
- source membership is deleted or otherwise no longer exists;
- source membership is replaced by another membership;
- source membership belongs to a different user than the recorded requester;
- source membership moves to a different Squad from the recorded `current_squad_id`.

The rule is based on the identity and semantic validity of the recorded source membership, not merely on whether the user currently has some other live Squad membership.

## 5. Invalidation effects

When invalidation is detected:

- no DZP is charged;
- no Economy/Ledger settlement is created;
- no replacement membership is created;
- no old membership is cancelled by the deferred Upgrade settlement;
- the request is marked `invalidated` and is not eligible for future settlement;
- an invalidation notification is sent using the existing ADR-0023 notification mechanism as a best-effort, post-commit side effect.

`invalidated` is distinct from `cancelled`: it records that a valid deferred Upgrade request can no longer be fulfilled because its required source context ceased to be valid.

## 6. Invalidation notification

Invalidation is **not silent**. The user is informed because they explicitly requested an Upgrade and may otherwise reasonably believe the request is still pending.

The notification is sent only after the invalidation transaction commits, uses the existing Telegram notification primitive, and is best-effort with no delivery guarantee. Notification failure must not roll back or alter the committed invalidation.

**Locked Phase 6 invalidation notification text:**

`Your pending Squad upgrade could not be completed because your current membership status changed. Please check your current Squad status and submit a new upgrade request if needed.`

The notification is informational only. It does not create a new request, charge the user, or change membership state.

## 7. Valid deferred settlement

If the source membership remains valid and an eligible target Squad later becomes available, the Upgrade may settle atomically using the existing Economy/Ledger and membership primitives.

The settlement must verify the recorded source membership and target eligibility inside the same transaction before charging or replacing the membership.

After a successful commit, the existing notification mechanism is used as a post-commit side effect.

## 8. Explicit non-rule

Do **not** use the broad predicate `status != 'active'` or any equivalent shortcut for Upgrade invalidation.

`inactive` remains a valid source state for this contract. `suspended` does not.

This decision must not globally rewrite membership status predicates elsewhere in the system.

## 9. Phase 6 acceptance criteria

The implementation is accepted only when tests demonstrate at minimum:

- pending Upgrade remains uncharged while source membership is `active`;
- pending Upgrade remains uncharged while source membership is `inactive`;
- `suspended` source invalidates the request without charging or replacement and attempts the invalidation notification after commit;
- `cancelled` source invalidates the request without charging or replacement;
- deleted/missing source invalidates the request without charging or replacement;
- changed `squad_id` invalidates the request without charging or replacement;
- a different replacement membership does not get silently upgraded;
- a still-valid source settles exactly once when an eligible target becomes available;
- settlement remains atomic and idempotent;
- notification occurs only after successful commit and notification failure does not change business outcome.

## 10. Governance

This amendment is governed by ODRCA + Constitution 54:

**Observe → Correlate → Diagnose → Repair → Confirm**

and:

**Fail → Trace → Root Cause → Minimal Fix → Verify → Record → Continue**

No migration or runtime code change is authorized by this document alone. Implementation must first reconcile this amendment with the current schema, callers, tests, membership lifecycle, and Phase 5 settlement trigger lineage.
