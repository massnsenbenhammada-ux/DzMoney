# DzMoney — Task Completion Service Contract

## Status

**Specification locked. Runtime implementation is not part of this documentation change.**

This document defines the contract that the future **User Create Tasks** UI must expose when configuring how a user-created task is completed. It is subordinate to `PROJECT_ROADMAP.md`, `docs/ARCHITECTURE_RULES.md`, and `ADR.md` and must not be interpreted as evidence that an unimplemented provider or verifier already exists.

## 1. Creator-facing completion service choice

For a task category that supports both modes, the Task Creator chooses one completion service:

1. **Open Link → Click Proof**
2. **Server Verified**

The UI must explain both choices before the creator selects one.

The choice is a task contract decision. It must not create a second task engine, reward service, economy, ledger, or verification system.

A mode may be offered only when the selected task category has a valid contract for that mode. An unimplemented provider must not be presented as a working verification option.

## 2. Open Link → Click Proof

### Meaning

The task defines opening the configured external link as the required completion action. The server records the click/open evidence through the existing task-verification boundary.

### Creator-facing explanation

Use **Open Link / Click Proof** when opening the link is itself the action the task creator wants to reward.

Opening the link must not be described as proof of a deeper external action. If the real requirement is to register, subscribe, play, purchase, join, complete an action, or otherwise achieve an outcome after opening the link, Click Proof is insufficient and Server Verified is required.

### Contract

- Source: existing frontend/task execution boundary.
- Evidence: existing click evidence (`link_clicked`) where supported by the current task path.
- External provider completion callback: not required for the click itself.
- Required user input for server verification: none merely to establish click proof.
- Final reward: only through the existing verification → Economy/Ledger path; a client event alone never authorizes an economic reward.

## 3. Server Verified

### Meaning

Opening a link or sending a client-side completion signal is not sufficient. The requested external outcome must be supported by a trusted server-verifiable evidence source.

### Creator-facing explanation

Use **Server Verified** when the task creator needs DzMoney to confirm that the requested external action was actually completed, rather than merely opened or clicked.

The creator-facing configuration must identify, when the provider contract exists:

- **Verification Source** — the trusted system that can establish the result.
- **Evidence Type** — the evidence that represents the completed action.
- **Verification Method** — how the DzMoney server authenticates and validates that evidence.
- **Required User Input** — any user data needed to correlate the external action with the DzMoney user.

No user input may be invented by the UI. Required inputs must come from the applicable verification/provider contract.

## 4. Category mapping

The intended contract is:

| Task category | Open Link / Click Proof | Server Verified | Verification source/evidence |
|---|---|---|---|
| Daily | Only where the task contract explicitly defines the activity as click/open proof | Yes for supported ad-provider activity | Trusted ad-provider activity evidence such as `activity_ad_events` |
| Mini App | Yes, when opening the Mini App is itself the required action | Yes when a trusted Mini App backend contract exists | Validated Telegram `initData` establishes Telegram identity/session authenticity; the Mini App backend must provide trusted completion evidence for the requested outcome |
| Social | Yes, when opening Telegram is itself the required action | Yes for supported Telegram verification contracts | Trusted Telegram verification; `initData` is an identity/authentication boundary, not by itself proof that an external action was completed |
| Web | Yes, when opening the site is itself the required action | Yes when an external verification contract exists | Signed webhook, unique token, or another trusted server-verifiable mechanism defined by the provider contract |
| Special/Partner | Yes only when opening the partner link is explicitly the task outcome | Yes when a partner verification contract exists | Partner-signed evidence such as HMAC/signature, defined by the partner contract |

The table is an architectural target. A row marked as supported by a provider is not implementation evidence. `IMPLEMENTATION_STATUS.md` remains authoritative for what is actually implemented on `main`.

## 5. Mini App identity versus completion

For Mini App verification, validated Telegram WebApp `initData` is used to authenticate the Telegram user/session and protect the identity boundary.

`initData` alone does **not** prove that the user completed an arbitrary action inside the Mini App.

When completion requires an action inside the Mini App, the completion contract must additionally define trusted evidence from the Mini App/backend capable of proving that outcome and correlating it to the authenticated Telegram user.

## 6. User Input requirements for User Create Tasks

When **Server Verified** is selected, the future User Create Tasks UI must expose the required input configuration once the applicable verification contract is defined.

The dependency is:

```text
Task Type
    ↓
Completion Service
    ↓
Verification Contract
    ↓
Verification Source
    ↓
Evidence Type
    ↓
Verification Method
    ↓
Required User Input
    ↓
User Create Tasks UI
```

Examples such as `player_id`, `account_id`, `username`, or a unique code must not be added by assumption. The actual field is determined by the trusted provider/verification contract.

If no user input is required, the UI must explicitly show **None required** rather than inventing a field.

## 7. Reward boundary

Neither completion service directly grants a reward.

The authoritative flow remains:

```text
Execute
  ↓
Task Attempt
  ↓
Evidence / Proof
  ↓
Server Verification
  ↓
Verification Ad gate where configured
  ↓
Final Verification
  ↓
Existing Economy
  ↓
Existing Ledger
  ↓
Reward
```

The existing Economy/Ledger remains the sole economic path. Evidence, Verification Ads and provider callbacks are not independent reward sources.

## 8. Phase and implementation rule

This document locks the contract now. It does **not** authorize production UI, provider integrations, database changes, new services, or new routes before their owning phase is opened.

The future User Create Tasks UI phase must consume this contract and present the two completion-service choices with concise instructions. Server Verified configuration fields must be derived from the validated provider/verification contract available at that time.

Until then, unimplemented providers remain pending and must not be represented as active functionality.

## 9. Architectural constraints

- One Task Catalog and one Task Execution/Verification boundary.
- No second Task Engine.
- No second Economy or Ledger.
- No category-specific reward service merely to support verification.
- Provider credentials never belong in task configuration.
- Server verification is authoritative for Server Verified tasks.
- Client-side click events cannot prove deeper external completion.
- Externally repeatable verification/reward operations must remain idempotent.
- New provider work requires focused TDD and integration tests before enabling rewards.
- `IMPLEMENTATION_STATUS.md` must never mark this contract as runtime-complete until code and tests prove it.
