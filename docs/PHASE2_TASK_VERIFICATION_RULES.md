# DzMoney 2.0 — Phase 2 Task Verification Rules

## Status

**Canonical Task Model — locked.** This document is the source of truth for Phase 2 task verification behavior. The previous category/evidence model is superseded by the model below.

## 1. Scope and terminology

This document defines **Tasks**, not campaigns and not creator ownership.

- **Task Type** = what kind of task the user is completing.
- **Verification Method** = how the task owner chooses to verify that task.
- **Provider** = an external trusted system used when the selected verification method requires one.
- **User Creator** and **Partner/Special** describe who/configuration context the task belongs to; they are not substitutes for Task Type.

A Task has exactly **one selected verification method**. The task owner selects that method when creating the task. Multiple verification methods cannot be combined for the same task.

## 2. Canonical Task tree

```text
TASK
│
├── DAILY
│   │
│   ├── Check for Update
│   │   └── Telegram Membership
│   │       └── Bot API
│   │
│   └── Daily Check-in
│       └── Ad Provider
│           ├── Monetag
│           ├── OnClickA
│           └── AdsGram
│
├── SHARE WITH FRIENDS
│   └── Click Proof
│
├── GAME
│   ├── Click Proof
│   └── Referral URL
│
├── SOCIAL
│   ├── Click Proof
│   └── Bot API
│
├── WEB
│   └── Click Proof
│
└── PARTNER / SPECIAL
    │
    ├── WEB
    │   └── Provider
    │       └── HMAC / Webhook
    │
    ├── GAME
    │   └── Provider
    │       └── Game Backend
    │
    └── SOCIAL
        └── Provider
            └── Bot API
```

## 3. User-created task types

The ordinary task types available to task creators are:

### Game

The task creator chooses exactly one:

- **Click Proof**; or
- **Referral URL**.

For Referral URL, the user obtains the referral URL from the application specified by the task and supplies it to DzMoney. The verification contract is a **format match** against the task's configured referral URL format. Format matching must not be presented as proof of downstream referral conversion or another event that the system cannot independently establish.

### Social

The task creator chooses exactly one:

- **Click Proof**; or
- **Bot API**.

Bot API verification is used only where the supported Telegram/bot API can provide authoritative evidence for the exact required action. Click Proof remains a separate, weaker interaction-proof method and cannot be combined with Bot API for the same task.

### Web

The current user-created Web task method is:

- **Click Proof**.

No HMAC/webhook or referral verification is implied for an ordinary user-created Web task merely because those mechanisms exist for Partner/Special integrations.

### Share with Friends

The verification method is:

- **Click Proof**.

A frontend click alone must not be treated as a trusted server assertion beyond the defined click-proof contract.

## 4. Daily tasks

### Check for Update

```text
Check for Update → Telegram Membership → Bot API
```

The server-side Telegram membership result is the trusted evidence for the membership condition.

### Daily Check-in

```text
Daily Check-in → Ad Provider → Monetag / OnClickA / AdsGram
```

The selected ad provider supplies the evidence required by the Daily Check-in contract. Provider callbacks/events must be authenticated and bound to the relevant DzMoney user/session according to the provider contract.

Daily Check-in is not a generic proof mechanism for unrelated tasks.

## 5. Partner / Special tasks

**Partner / Special is a separate integration context for large sites, large channels, applications, and other partners.** It is not the ordinary User Creator verification path.

Partner/Special does not permit Click Proof or Referral URL as its verification method.

Its supported task types and provider evidence are:

```text
PARTNER / SPECIAL
│
├── WEB
│   └── Provider → HMAC / Webhook
│
├── GAME
│   └── Provider → Game Backend
│
└── SOCIAL
    └── Provider → Bot API
```

The environment/integration boundary may be prepared before a real provider exists. A provider is not considered enabled merely because configuration exists. It becomes usable only after its server-side evidence contract is implemented, tested, and explicitly enabled.

### Partner Web

Trusted evidence comes from the partner/provider through an authenticated HMAC/signature webhook or equivalent server-to-server callback.

### Partner Game

Trusted evidence comes from the partner's authoritative Game Backend. The contract must define the exact completion event and bind it to the authenticated DzMoney user and task/provider identity.

### Partner Social

Trusted evidence comes from the partner/provider Bot API or equivalent authoritative API capable of proving the exact required social action.

Partner credentials, API secrets, HMAC secrets, access tokens, and equivalent secrets must remain in protected provider integration configuration and never in task configuration.

## 6. Verification-method selection rule

At task creation:

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

The backend must reject unsupported combinations. Examples:

- `GAME + Click Proof` → allowed.
- `GAME + Referral URL` → allowed.
- `GAME + Click Proof + Referral URL` → forbidden.
- `SOCIAL + Click Proof` → allowed.
- `SOCIAL + Bot API` → allowed.
- `SOCIAL + Click Proof + Bot API` → forbidden.
- `WEB + Click Proof` → allowed.
- `PARTNER/SPECIAL + Click Proof` → forbidden.
- `PARTNER/SPECIAL + Referral URL` → forbidden.

## 7. Trusted evidence rules

A verifier must derive its decision from evidence appropriate to the selected task type and verification method.

The following are never sufficient by themselves:

- client-provided `completed=true`;
- arbitrary client timestamps;
- arbitrary client counters;
- client-only success flags;
- equivalent frontend assertions without independent server validation.

For provider-backed verification, the contract must define:

1. exact user action/event;
2. trusted evidence source;
3. identity binding to the authenticated Telegram user;
4. authenticity mechanism;
5. replay/idempotency behavior;
6. failure behavior and, where applicable, reversal behavior.

For Click Proof, the server must implement the explicitly defined click-proof contract; the mere presence of a browser click or navigation must not be silently upgraded into provider-confirmed completion.

## 8. Verification and reward boundary

The existing task verification service remains the verification/reward boundary. A concrete verifier returns a verification decision; it must not independently mint rewards or write Economy/Ledger state outside the established reward path.

The canonical flow is:

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
PASS ───────────────→ Idempotency Check → Existing Economy → Reward → Ledger
  │
  └─ FAIL ──────────→ No Task Reward
```

## 9. Verification advertisement gate

For non-advertisement tasks, the existing verification-ad gate rules remain applicable where enabled by the Phase 2 product contract:

**Execute → Verify → configured short verification advertisement → server-side verification → reward**

The verification advertisement is a prerequisite/gate, not an additional task reward.

Advertisement tasks do not receive a second verification advertisement.

## 10. Reward rules

- The task reward is issued only after successful server-side verification.
- A verification advertisement does not create an additional task reward.
- Successful verification issues the configured task reward exactly once.
- Duplicate Verify requests, repeated provider callbacks, refreshes, retries, or repeated idempotency keys must not create duplicate rewards.
- Failed verification produces no task reward.

For standard qualifying activity, the default reward remains **1,000 COIN + 1 DZX + 1 DZP**, subject to Admin configuration.

Only the earned activity DZP from the qualifying task contributes to Daily Activity / Reward Pool weighting.

## 11. Economy and Ledger rules

The existing Economy and Ledger are the only reward/accounting systems.

The final task reward transaction must be atomic and idempotent. The ledger source must identify the real task reward source (`task` or the final agreed task source identifier).

Verification-gate metadata must remain distinguishable from the task reward and must never be silently reclassified as a separate task reward.

## 12. Independence rules

Task verification remains independent from:

- Referral lifetime rewards;
- Squad modifiers;
- Reward Pool distributions;
- Promo rewards;
- unrelated advertisement contexts.

A verifier must not write directly to those systems.

## 13. Configuration rules

Task configuration may contain only non-secret task/provider references required by the selected contract, such as:

- task type;
- selected verification method;
- provider identifier where applicable;
- exact event/action where applicable;
- non-secret provider reference/configuration;
- identity-binding mode;
- authenticity mode;
- idempotency/replay mode.

Provider credentials and secrets belong only to protected provider integration configuration.

The task configuration must not permit more than one verification method for a single task.

## 14. Implementation constraints

- Do not create a duplicate Economy, Ledger, reward system, task system, or verification system.
- Do not implement a provider adapter before its trusted evidence contract is defined.
- Do not infer a provider-backed verifier from a frontend click.
- Do not treat a configuration entry as proof that a provider exists or is enabled.
- Keep the existing task verification boundary and provider-selection boundaries unless a repository-backed change proves they must change.
- Changes must follow TDD-first development, scoped changes, migrations for schema changes, and the established branch/PR/CI workflow.

## 15. Phase 2 acceptance criteria

- [ ] Canonical Task Types are represented without confusing Task Type with campaign/creator ownership.
- [ ] Each task has exactly one selected verification method.
- [ ] GAME supports Click Proof or Referral URL, but not both on one task.
- [ ] SOCIAL supports Click Proof or Bot API, but not both on one task.
- [ ] WEB user-created tasks use Click Proof.
- [ ] SHARE WITH FRIENDS uses Click Proof.
- [ ] Check for Update uses Telegram Membership via Bot API.
- [ ] Daily Check-in uses the configured Ad Provider (Monetag, OnClickA, or AdsGram when actually enabled).
- [ ] Partner/Special supports Web/Game/Social provider integrations only.
- [ ] Partner/Special does not use Click Proof or Referral URL.
- [ ] Partner Web uses HMAC/Webhook provider evidence.
- [ ] Partner Game uses Game Backend provider evidence.
- [ ] Partner Social uses Bot API provider evidence.
- [ ] Evidence is server-validated and bound to the relevant authenticated user where applicable.
- [ ] Failed verification produces no reward.
- [ ] Successful verification produces exactly one configured reward.
- [ ] Repeated verification/provider callbacks cannot duplicate the reward.
- [ ] Existing Economy and Ledger remain the only reward/accounting path.

## 16. Canonicality

**This document is the canonical Phase 2 Task Verification contract.** Any older description that treats Game/Web/Social as fixed verifier categories, combines multiple verification methods on one task, or treats Partner/Special as an ordinary User Creator path is superseded by this document.

No second Phase 2 task-verification specification should be created for this model.