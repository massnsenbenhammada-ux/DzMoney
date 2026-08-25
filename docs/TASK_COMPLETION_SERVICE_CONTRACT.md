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

Some task categories are intentionally restricted to one completion service. In particular, **Special/Partner tasks are Server Verified only**. The Creator must not be offered Open Link → Click Proof for this category, and the server-side task contract must reject that combination even if a client attempts to submit it.

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
| Special/Partner | **No — restricted** | **Yes — only supported completion service** | Partner-signed evidence such as HMAC/signature, defined by the partner contract |

For **Special/Partner**, the restriction is contractual, not merely a UI convenience:

```text
Special / Partner
        ↓
Server Verified only
        ↓
Partner Verification Contract
        ↓
Trusted Partner Evidence
        ↓
DzMoney Verification
```

The User Create Tasks UI must therefore show only **Server Verified** for Special/Partner and explain why: partner outcomes require trusted external evidence and cannot be established by a client-side click alone.

The server must reject any Special/Partner task configuration that selects Open Link / Click Proof, even if a malformed or manipulated client request attempts to submit it.

The table is an architectural target. A row marked as supported by a provider is not implementation evidence. `IMPLEMENTATION_STATUS.md` remains authoritative for what is actually implemented on `main`.

## 5. Server Verified contract by task type

`Server Verified` is a completion service, not a single verification mechanism shared blindly by every task type. Each task type has its own **verification contract** while all contracts terminate at the same existing Task Verification boundary and the same Economy/Ledger path.

The minimum contract for every Server Verified task is:

```text
Task Type
   ↓
Completion Service = Server Verified
   ↓
Verification Source
   ↓
Evidence Type
   ↓
Verification Method
   ↓
Identity Correlation
   ↓
Required User Input
   ↓
Replay / Idempotency Rule
   ↓
Verification Decision
```

### 5.1 Daily — Server Verified

For a Daily task whose completion is tied to an advertisement/provider activity, the trusted source is the configured ad-provider verification boundary.

```text
Daily
  ↓
Server Verified
  ↓
Ad Provider
  ↓
Trusted activity evidence
  ↓
activity_ad_events / applicable provider event
  ↓
Provider/event validation
  ↓
User + task correlation
  ↓
Verification
```

The contract must distinguish the ad event from the task reward itself. An ad event is evidence for the verification boundary; it is not an independent Economy/Ledger source.

The exact provider-specific event fields and creator inputs remain provider-contract details. They must not be invented in the generic Task UI.

### 5.2 Mini App — Server Verified

For a Mini App task where the required outcome occurs inside the Mini App, Telegram `initData` establishes the authenticated Telegram user/session boundary. It does not by itself prove that the requested action happened.

```text
Mini App
  ↓
Server Verified
  ↓
Mini App Backend
  ↓
Trusted completion evidence
  ↓
Correlation with authenticated Telegram user
  ↓
Server verification
```

The verification contract must define how the Mini App backend proves the requested completion and how that evidence is bound to the DzMoney/Telegram user. A generic `initData` value must never be treated as arbitrary completion evidence.

If the Mini App contract requires creator-configured identifiers or user-provided values, those fields are exposed only after the provider contract defines them.

### 5.3 Social — Server Verified

Social verification is task-specific. Telegram channel membership is one supported verification contract; it must not be generalized into proof of every possible social action.

```text
Social
  ↓
Server Verified
  ↓
Applicable Telegram / social verification source
  ↓
Action-specific evidence
  ↓
Identity correlation
  ↓
Server verification
```

For Telegram channel membership, the existing Telegram verification boundary may use the authenticated user and Telegram membership state. `initData` authenticates the Telegram user/session; it is not by itself evidence of joining, sharing, or completing another social action.

Share, join, react, follow, and similar actions must each have a trusted completion contract before they can be represented as Server Verified. No client-side `openTelegramLink()` or click event may be promoted to completion proof without such a contract.

### 5.4 Web — Server Verified

For Web tasks requiring an outcome beyond opening the website:

```text
Web
  ↓
Server Verified
  ↓
External Website / Provider
  ↓
Signed webhook / unique token / other trusted evidence
  ↓
Authenticate evidence source
  ↓
Bind evidence to user + task
  ↓
Replay protection
  ↓
Verification
```

The exact webhook payload, token format, signing algorithm, and required creator/user inputs belong to the external provider contract. They must not be invented by the generic task configuration.

### 5.5 Special / Partner — Server Verified only

Special/Partner tasks have no Click Proof completion service.

```text
Special / Partner
        ↓
Server Verified ONLY
        ↓
Partner Backend
        ↓
Signed / HMAC evidence
        ↓
Authenticate partner evidence
        ↓
Bind evidence to user + task
        ↓
Replay protection
        ↓
DzMoney Verification
```

The exact HMAC/signature protocol, partner identifier, callback payload, correlation value, and required inputs are defined only when an actual partner contract exists.

No Partner API, provider credentials, or Partner Verification Service is created merely by defining this contract.

## 6. Verification contract is the source for Creator inputs

The Creator UI must not contain a second hand-maintained mapping of verification fields.

The dependency is:

```text
Task Type
    ↓
Completion Contract
    ↓
Applicable Verification Contract
    ↓
Required Inputs
    ↓
User Create Tasks UI
```

The UI is a consumer of the contract, not its source of truth.

Examples such as `player_id`, `account_id`, `username`, or a unique code must not be added by assumption. The actual field is determined by the trusted provider/verification contract.

If no user input is required, the UI must explicitly show **None required** rather than inventing a field.

## 7. Mini App identity versus completion

For Mini App verification, validated Telegram WebApp `initData` is used to authenticate the Telegram user/session and protect the identity boundary.

`initData` alone does **not** prove that the user completed an arbitrary action inside the Mini App.

When completion requires an action inside the Mini App, the completion contract must additionally define trusted evidence from the Mini App/backend capable of proving that outcome and correlating it to the authenticated Telegram user.

## 8. User Input requirements for User Create Tasks

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

For Special/Partner, `Completion Service` is fixed to `Server Verified`; the UI must not render a Click Proof choice.

## 9. Reward boundary

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

## 10. Architectural role of the Task Creator as service/configuration provider

For **User Create Tasks**, the Task Creator is the party that supplies/configures the external service details needed to make the selected verification contract operational. This is a configuration role; it does not make the Creator the trusted evidence authority.

The distinction is mandatory:

```text
Task Creator
   ↓
provides/configures service details
   ↓
Verification Contract
   ↓
trusted source / evidence
   ↓
DzMoney server verification
```

The Creator therefore must be shown the **verification method available for the selected task type**, together with the exact configuration information that the current contract permits the Creator to supply.

The Creator must not be asked for arbitrary implementation details that are not part of the selected verification contract, and the UI must never imply that Creator-provided text itself is proof of user completion.

### 10.1 Available Server Verified methods by Task Type

The Creator-facing contract is:

```text
Daily
  → Server Verified
  → Ad Provider activity evidence
  → activity_ad_events / applicable trusted provider event
```

```text
Mini App
  → Server Verified
  → Mini App backend completion evidence
  → Telegram initData for authenticated-user correlation
```

```text
Social
  → Server Verified
  → Telegram/social action-specific verification
  → authenticated Telegram identity + trusted action evidence
```

```text
Web
  → Server Verified
  → External site/provider evidence
  → signed webhook / unique token / other trusted server-verifiable mechanism
```

```text
Special / Partner
  → Server Verified ONLY
  → Partner backend evidence
  → HMAC/signature or equivalent trusted partner evidence
```

These are the **verification mechanisms available in the architecture**, not a claim that every adapter/provider is already implemented. `IMPLEMENTATION_STATUS.md` remains authoritative for runtime availability.

### 10.2 What the Creator configures

When the selected verification contract is implemented and enabled, the Creator UI must expose only the configuration fields defined by that contract, for example:

```text
Task Type
   ↓
Server Verified method
   ↓
Contract-defined Creator configuration
   ↓
Task saved
```

The generic contract does not invent provider-specific fields. If the contract has not yet defined a field, the UI must not create one merely because a provider could theoretically need it.

The Creator is therefore the **configuration provider**, while the external provider/partner remains the **evidence provider** when the selected verification model depends on one.

This distinction prevents a second source of truth:

```text
ONE VERIFICATION CONTRACT
          ↓
   Creator configuration
          ↓
 Existing verification boundary
```

not:

```text
Creator UI mapping + Backend mapping + Provider mapping
        ↓
multiple competing truths ❌
```

## 11. Phase and implementation rule

This document locks the contract now. It does **not** authorize production UI, provider integrations, database changes, new services, or new routes before their owning phase is opened.

The future User Create Tasks UI phase must consume this contract and present the applicable completion-service choice(s) with concise instructions. For categories supporting both modes, it presents Open Link / Click Proof and Server Verified. For Special/Partner, it presents Server Verified only. Server Verified configuration fields must be derived from the validated provider/verification contract available at that time.

Until then, unimplemented providers remain pending and must not be represented as active functionality.

## 12. Architectural constraints

- One Task Catalog and one Task Execution/Verification boundary.
- No second Task Engine.
- No second Economy or Ledger.
- No category-specific reward service merely to support verification.
- Provider credentials never belong in task configuration.
- Server verification is authoritative for Server Verified tasks.
- Client-side click events cannot prove deeper external completion.
- Special/Partner tasks are Server Verified only; Click Proof is not a valid completion contract for this category.
- The Special/Partner restriction must be enforced server-side as well as in the future Creator UI.
- Each task type may have a distinct verification contract, but all contracts terminate at the existing Task Verification boundary.
- The Creator UI must consume verification-contract metadata and must not duplicate it as a second source of truth.
- The Task Creator is the configuration provider for a user-created task; the external provider/partner, where applicable, remains the trusted evidence provider.
- `initData` is an identity/authentication mechanism for Mini Apps, not a universal completion-proof mechanism.
- Social verification must be action-specific; Telegram identity is not generic proof of every social action.
- Externally repeatable verification/reward operations must remain idempotent.
- New provider work requires focused TDD and integration tests before enabling rewards.
- `IMPLEMENTATION_STATUS.md` must never mark this contract as runtime-complete until code and tests prove it.
