# DzMoney 2.0 — Phase 2 Task Verification Rules

## Status

**Canonical Task Model — locked.** This document is the canonical Phase 2 task-verification contract. It defines Tasks, not campaigns or creator ownership.

## 1. Scope and terminology

- **Task Type** = what kind of task the user is completing.
- **Verification Method** = how that task is verified.
- **Provider** = an external trusted system used by a selected verification contract.
- **User Creator** and **Partner/Special** describe the task/campaign context; they are not interchangeable with Task Type.
- A task has exactly **one** verification method. Verification methods cannot be combined for one task.

## 2. Canonical Task model

```text
TASK
│
├─ Daily
│  ├─ Daily Check-in → Ad Provider
│  ├─ Check for Update → Telegram Membership → Bot API
│  ├─ Ad View → Ad Provider
│  ├─ Share with Friends → User Referral Link → Click Proof
│  ├─ Invite 1 Friend → User Referral Link → Qualified Referral Count → Threshold → Invite / Claim
│  ├─ Invite 10 Friends → User Referral Link → Qualified Referral Count → Threshold → Invite / Claim
│  ├─ Invite 20 Friends → User Referral Link → Qualified Referral Count → Threshold → Invite / Claim
│  ├─ Invite 50 Friends → User Referral Link → Qualified Referral Count → Threshold → Invite / Claim
│  └─ Invite 100 Friends → User Referral Link → Qualified Referral Count → Threshold → Invite / Claim
│
├─ Game
│  ├─ Click Proof
│  └─ URL Format Match → External Mini App → Referral URL
│
├─ Social
│  ├─ Click Proof
│  └─ Bot API
│
├─ Web
│  └─ Click Proof
│
└─ Partner / Special
   ├─ Mini App → mini_app_backend
   ├─ Social → Bot API
   └─ Web → HMAC / Webhook
```

**Important:** `Game` is the ordinary user-created Mini App task type. `Partner/Special → Mini App` is a partner integration subtype and must not be confused with the ordinary Game task type.

## 3. User-created task verification

### Game

The task creator chooses exactly one:

- **Click Proof**; or
- **URL Format Match**.

For URL Format Match, the campaign/task creator supplies the referral URL of the **external Mini App** they want to receive referrals for. The user supplies the referral URL obtained for that external application. Verification is **URL Format Match** against the campaign's configured target URL format. A format match does not claim proof of downstream conversion that DzMoney cannot independently establish.

### Social

The task creator chooses exactly one:

- **Click Proof**; or
- **Bot API**.

Bot API is used only where it can provide authoritative evidence for the required action. Click Proof and Bot API cannot be combined for one task.

### Web

The user-created Web verification method is:

- **Click Proof**.

HMAC/Webhook is not implied for an ordinary user-created Web task.

## 4. Daily tasks

### Daily Check-in

```text
Daily Check-in → Ad Provider
```

Supported ad providers are configurable and may include Monetag, OnClickA, and AdsGram when actually enabled. Provider evidence must be authenticated and bound to the relevant user/task according to the provider contract. The 24-hour policy remains server-authoritative.

### Check for Update

```text
Check for Update → Telegram Membership → Bot API
```

The server-side Telegram membership result is the trusted evidence.

### Ad View

```text
Ad View → Ad Provider → completion evidence → server verification
```

The selected provider supplies the completion evidence. Provider configuration does not itself constitute proof or enablement.

### Share with Friends

```text
Share with Friends
        ↓
User Referral Link
        ↓
Click Proof
```

The task uses the user's canonical DzMoney referral link. The recorded click proof is the completion evidence for this task.

### Invite Friends

```text
Invite Friends
        ↓
User Referral Link
        ↓
Qualified Referral Count
        ↓
Threshold
        ↓
Invite / Claim
```

The qualified count is derived from the existing referral source of truth. It must not be replaced by a client-supplied counter.

The displayed count stops at the configured threshold:

```text
display_count = min(qualified_count, threshold)
```

Before the threshold is reached, the action is **Invite** and uses the user's referral link. When the threshold is reached, the action becomes **Claim**.

Claim requires the configured advertisement gate:

```text
Claim
 ↓
Advertisement
 ↓
Server Verification
 ↓
Reward
```

Failure to complete the required advertisement produces no reward. The reward remains idempotent.

## 5. Partner / Special

Partner/Special is intended for large sites, channels, applications, and other partner integrations. It is not the ordinary User Creator task path.

Its supported subtypes are:

```text
PARTNER / SPECIAL
│
├─ Mini App → mini_app_backend
├─ Social   → Bot API
└─ Web      → HMAC / Webhook
```

Partner/Special does **not** permit Click Proof or URL Format Match as its verification method.

### Partner Mini App

Trusted completion evidence comes from the partner's authoritative `mini_app_backend`. The contract must define the exact completion event, identity binding, authenticity, idempotency/replay policy, and failure behavior.

### Partner Social

Trusted evidence comes from the partner/provider Bot API or another explicitly supported authoritative API capable of proving the exact required action.

### Partner Web

Trusted evidence comes from an authenticated HMAC/signature webhook or equivalent server-to-server callback. A bare redirect or client assertion is insufficient.

Partner credentials and secrets belong only to protected provider integration configuration and never to task configuration.

## 6. Verification-method selection

```text
Task Type
   ↓
Allowed Verification Methods
   ↓
Creator selects exactly ONE
   ↓
Task stores the selected method
   ↓
Execution
   ↓
Evidence
   ↓
Server Verification
```

Required combinations:

- `GAME + Click Proof` → allowed.
- `GAME + URL Format Match` → allowed.
- `GAME + Click Proof + URL Format Match` → forbidden.
- `SOCIAL + Click Proof` → allowed.
- `SOCIAL + Bot API` → allowed.
- `SOCIAL + Click Proof + Bot API` → forbidden.
- `WEB + Click Proof` → allowed.
- `PARTNER/SPECIAL + Mini App` → allowed only through the partner Mini App backend contract.
- `PARTNER/SPECIAL + Social` → allowed only through the partner Bot API contract.
- `PARTNER/SPECIAL + Web` → allowed only through the partner HMAC/Webhook contract.
- `PARTNER/SPECIAL + Click Proof` → forbidden.
- `PARTNER/SPECIAL + URL Format Match` → forbidden.

## 7. Evidence and security rules

The following are never sufficient by themselves:

- client-provided `completed=true`;
- arbitrary client timestamps;
- arbitrary client counters;
- client-only success flags;
- an unauthenticated callback;
- a browser navigation treated as provider-confirmed completion.

Every provider-backed contract must define:

1. exact action/event;
2. trusted evidence source;
3. Telegram/user identity binding where applicable;
4. authenticity mechanism;
5. replay/idempotency behavior;
6. failure and, where relevant, reversal behavior.

The existing security boundary that prevents untrusted `open_link` completion from becoming trusted verification must remain intact. A Click Proof contract must not be implemented by weakening that boundary.

## 8. Verification and reward boundary

The existing task-verification service remains the verification/reward boundary. Concrete verification returns a decision; it does not independently mint rewards or bypass Economy/Ledger.

```text
Task Creation
    ↓
Task Type + ONE Verification Method
    ↓
Task Execution
    ↓
Evidence
    ↓
Server Verification
    ↓
PASS → Idempotency Check → Existing Economy → Reward → Ledger
  │
  └→ FAIL → No Task Reward
```

## 9. Advertisement gate

Where the Phase 2 product contract requires a verification advertisement:

```text
Execute → Verify → configured short advertisement → server verification → reward
```

The advertisement is a prerequisite/gate, not a second task reward. Advertisement tasks do not receive a second verification advertisement.

## 10. Reward and Economy rules

- Reward is issued only after successful verification.
- Verification-gate viewing does not create an additional task reward.
- Successful verification issues the configured task reward exactly once.
- Repeated requests, callbacks, refreshes, retries, or idempotency keys cannot duplicate the reward.
- Failed verification produces no reward.
- Existing Economy and Ledger remain the only reward/accounting path.

The standard qualifying activity reward remains **1,000 COIN + 1 DZX + 1 DZP**, subject to Admin configuration. Task-earned activity DZP is the only DZP from this flow that contributes to Daily Activity / Reward Pool weighting.

## 11. Referral independence

Daily `Share with Friends` and `Invite Friends` use the existing user referral system. Do not create a second referral system.

`Game → URL Format Match` is separate: it concerns an external Mini App referral URL supplied by the campaign/task creator and verified by URL Format Match. It must not reuse the Daily `user_referral_link` as its source of truth.

## 12. Configuration rules

Task configuration may contain only non-secret values required by the selected contract, including task type, selected method, provider identifier, exact event/action, non-secret references, identity-binding mode, authenticity mode, and idempotency/replay mode.

Secrets, API keys, access tokens, HMAC secrets, and equivalent credentials must remain in protected provider configuration.

No configuration entry is proof that a provider exists or is enabled.

## 13. Implementation constraints

- Do not create a duplicate Task system.
- Do not create a duplicate Verification system.
- Do not create a duplicate Referral system.
- Do not create a duplicate Economy or Ledger.
- Do not create provider adapters before their evidence contracts are defined.
- Do not weaken the existing `open_link` security invariant.
- Reuse the existing verification runtime and provider boundaries.
- Keep changes scoped and TDD-first.
- Use migrations for schema changes.
- Reconcile existing open PRs before creating another overlapping correction.

## 14. Acceptance criteria

- [ ] Daily contains Check-in, Check for Update, Ad View, Share with Friends, and Invite Friends thresholds 1/10/20/50/100.
- [ ] Share with Friends uses User Referral Link + Click Proof.
- [ ] Invite Friends uses User Referral Link + qualified referral count + threshold + Invite/Claim behavior.
- [ ] Displayed referral count is capped at the threshold.
- [ ] Claim requires the configured advertisement gate before reward.
- [ ] Game supports Click Proof OR URL Format Match.
- [ ] Game URL Format Match uses an external Mini App referral URL and matches the configured URL format.
- [ ] Social supports Click Proof OR Bot API.
- [ ] Web uses Click Proof for User Creator tasks.
- [ ] Partner/Special uses Mini App, Social, or Web subtypes with their respective provider contracts.
- [ ] Partner/Special does not use Click Proof or URL Format Match.
- [ ] No verification methods are combined for one task.
- [ ] Evidence is server-validated and idempotent.
- [ ] Existing Economy/Ledger remain the only reward path.
- [ ] The existing `open_link` security boundary remains intact.

## 15. Canonicality

**This document is the canonical Phase 2 Task Verification contract.** Older descriptions that treat `special` as an ordinary User Creator task type, use `Game Backend` as the ordinary Game verifier, combine verification methods, or use Daily `user_referral_link` for external Game referrals are superseded.

No second Phase 2 task-verification specification should be created for this model.
