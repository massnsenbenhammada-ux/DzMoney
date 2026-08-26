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

## Trusted evidence contract

A verifier must derive its decision from **server-trusted evidence appropriate to the task type**.

The following are never sufficient evidence by themselves:

- client-provided `completed=true`;
- arbitrary client timestamps;
- arbitrary client counters;
- client-only success flags;
- equivalent frontend assertions that are not independently verified by the backend.

The existing task verification service is the verification/reward boundary. A concrete verifier must return a success decision only; it must not mint rewards or write Economy/Ledger state directly.

Before a concrete verifier is implemented for a category, the repository must define:

1. the exact user action/event being verified;
2. the trusted evidence source;
3. identity binding between that evidence and the authenticated Telegram user;
4. replay/idempotency behavior;
5. failure behavior and, where relevant, reversal behavior.

### Current category status

The repository currently defines the generic verification boundary, but it does **not** define complete trusted evidence sources for the following categories:

- **Daily:** evidence source not yet specified;
- **Game:** evidence source not yet specified;
- **Social:** evidence source and supported platform/provider not yet specified;
- **Web:** evidence source not yet specified;
- **Special/Partner:** partner/provider identity and trusted callback/evidence contract not yet specified.

Therefore no concrete verifier/adapter for these categories may be invented merely to satisfy an implementation checklist. Until the evidence source and contract are defined, the category remains **pending specification** and Phase 2 remains open.

### Provider-ready evidence contracts

The following contracts are now the canonical preparation model for future Creator/User-created task integrations. They define the integration seam without claiming that a real provider currently exists.

#### Game — Telegram Mini App

**Task meaning:** a user completes an action inside a Telegram Mini App.

**Preferred trusted evidence:** a server-to-server provider API or a signed callback/webhook from the Mini App's authoritative backend. A game `start` endpoint such as `POST /api/game/start` records/initiates a lifecycle event and is **not completion evidence by itself**.

A completion contract must identify the exact completion event, for example `game_completed`, `level_completed`, `score_reached`, or another provider-defined event. The provider backend must bind the event to the authenticated Telegram identity and the configured task/provider identity. Signed requests must use a server-held secret or equivalent asymmetric verification contract. Provider event IDs are the preferred idempotency key, with timestamp/replay-window validation where supported.

**Required contract:** provider identity + completion event + Telegram user binding + authenticity mechanism + idempotency key + replay policy + failure semantics.

#### Social

**Task meaning:** the user performs a specific social action.

**Preferred trusted evidence:** the official API of the social platform, queried server-side with an authenticated/bound provider identity. For Telegram channel membership, the existing `getChatMember` integration is authoritative evidence for membership state and is already implemented in the repository.

For other actions (follow, like, comment, subscription, etc.), the platform/provider must expose an authoritative API or signed server event capable of proving that exact action. Opening a social URL, a client click, or a client assertion is not sufficient evidence.

**Required contract:** provider/platform identity + exact action + authenticated external account binding + authoritative API/event + idempotency/replay behavior + failure semantics.

#### Web

**Task meaning:** the user completes an action on an external website.

**Preferred trusted evidence:** a signed server-to-server webhook from the website/provider. Where a webhook is not available, a callback carrying a unique, single-use token bound server-side to the authenticated Telegram user, task and provider may be used when the provider contract can prove completion rather than merely link opening.

A bare redirect, URL visit, browser callback without authenticity, or client `completed=true` is not sufficient evidence.

**Required contract:** provider identity + exact event + user/task binding + HMAC/signature or equivalent authenticity + event/token idempotency + replay policy + failure/reversal semantics.

#### Special / Partner

**Task meaning:** an externally defined activity performed for a partner. Partner tasks may represent game, social, web, survey, registration, purchase, installation, or another partner-defined action; the category describes the integration context, not a second verification engine.

**Completion service:** Server Verified only, as already locked by ADR-0010.

**Preferred trusted evidence:** partner backend API or signed/HMAC server-to-server webhook/callback. The partner contract must state the exact event and the identity mapping used to bind it to the authenticated Telegram user and configured task. Partner event IDs must be idempotent and replay protection must be defined.

Partner credentials/secrets must remain in the protected provider integration configuration and must never be stored in `activity_tasks.config`.

**Required contract:** partner identity + exact activity/event + trusted evidence source + Telegram/user identity binding + authenticity + idempotency/replay + failure/reversal semantics.

#### Daily

Daily tasks remain a special case because some are DzMoney-owned system activities and some may depend on an external provider. Existing server-authoritative Daily implementations remain the source of truth for the activities they already own. For any new provider-backed Daily activity, the same provider evidence contract used by Game, Social, Web, or Partner must be explicitly selected; `ad_provider` activity events alone must not be generalized into proof of an unrelated task action.

**Required contract for a new provider-backed Daily task:** exact daily event + trusted source + authenticated user binding + provider authenticity + idempotency/replay + failure semantics.

### Provider configuration model

The Creator/User-created task configuration must remain provider-neutral. The intended configuration concept is:

- task category/type;
- provider identifier;
- verification method;
- exact provider event/action;
- non-secret provider reference/configuration;
- identity-binding mode;
- authenticity mode;
- idempotency/replay mode.

Provider credentials, API secrets, HMAC secrets, access tokens and similar credentials are never stored in task configuration. They belong to protected provider integration configuration.

No concrete provider is considered enabled merely because a configuration entry exists. A provider becomes usable only after its server-side evidence contract is implemented, tested and explicitly enabled.

The existing `task-verification-service.js` remains the verification/reward boundary, `task-verification-config.js` remains the task-scoped configuration boundary, and the existing provider registries remain the provider-selection boundaries. No duplicate task verifier, Economy, Ledger, or reward system is introduced.

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

## Independence rules

Task verification must remain independent from:

- Referral lifetime rewards;
- Squad modifiers;
- Reward Pool distributions;
- Promo rewards;
- unrelated advertisement contexts.

A verifier must never write to those systems directly.

## Acceptance criteria

A Phase 2 implementation is not accepted unless all of the following pass:

- [ ] Every non-ad task has Execute and Verify actions.
- [ ] Advertisement tasks do not receive a second verification advertisement.
- [ ] Verify cannot finalize a reward before the configured short ad gate is completed.
- [ ] The backend performs the authoritative task verification.
- [ ] Every implemented task category has a defined trusted evidence source.
- [ ] Evidence is bound to the authenticated Telegram user where applicable.
- [ ] Failed verification produces no task reward.
- [ ] Successful verification produces exactly one configured reward.
- [ ] Repeated Verify attempts cannot duplicate the reward.
- [ ] Repeated ad callbacks cannot duplicate the reward.
- [ ] The verification advertisement does not create an additional reward.
- [ ] Task-earned DZP is the only DZP from this flow that contributes to activity weight.
- [ ] The transaction and ledger records preserve the task source and verification-gate metadata.
- [ ] Squad, Referral, Reward Pool and Promo logic remain independent from the task verification mechanism.
- [ ] Tests exist for each concrete verifier before its category is considered complete.

## Implementation constraint

**Do not implement a concrete Phase 2 task verifier until its trusted evidence contract is defined and the corresponding TDD behavior is specified.**

If the required evidence source is not specified, the correct state is **pending specification**, not a guessed adapter.

**Do not create another Phase 2 specification file for this contract. This file is the canonical task-verification behavior document.**
