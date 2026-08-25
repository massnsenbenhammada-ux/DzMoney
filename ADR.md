# DzMoney — Architecture Decision Record

## ADR-0001 — Additive engineering execution rules

**Status:** Accepted  
**Date:** 2026-08-21

### Context

DzMoney already has architecture and change-control rules in `docs/ARCHITECTURE_RULES.md`. The project now needs additional engineering execution rules without duplicating or replacing those existing rules.

### Decision

The following rules are additive to the existing architecture rules:

1. **YAGNI:** do not implement unnecessary additions. Proposed improvements are recorded in `TODO.md` and are not implemented opportunistically.
2. **TDD:** write focused unit tests before implementation, then add the minimum code required to pass them.
3. **Code quality:** new functions should be kept at 20 lines or fewer where practical; public functions require docstrings; complex code requires explanatory comments; errors must be handled explicitly.
4. **Scope discipline:** do not make unrelated improvements while implementing a requested feature.
5. **Context summaries:** after every five completed features, create or update `CONTEXT_SUMMARY.md` with the validated project state, decisions, tests and remaining risks.
6. **Integration testing:** every completed feature must include integration coverage for its interaction with relevant existing features.
7. **Database changes:** every schema change requires an append-only migration, a practical rollback/reversal strategy where applicable, and an updated application/database model.
8. **Self-review:** before delivery, review duplication, performance, security, consistency, source-of-truth alignment, tests and scope.

### Consequences

These rules reduce architectural drift and uncontrolled cleanup while making feature work reproducible. They do not override the existing phase, migration, economy, testing, or source-of-truth rules; they supplement them.

## ADR-0002 — Active task catalog remains a service read model

**Status:** Accepted  
**Date:** 2026-08-21

### Context

Phase 2 already owns the `activity_tasks` schema and `task-service.js`. The first task feature needs a safe catalog of user-visible active tasks without introducing another repository, table, or task-specific service.

### Decision

Expose the active task catalog through `task-service.js` as a read operation. It returns only active tasks and the fields required by the catalog: category, title, description, configured rewards and verification-ad duration. Optional category filtering is validated against the existing task type set.

No new database table, migration, provider, or service is introduced for the catalog.

### Consequences

The existing `activity_tasks` table remains the single persistence source for tasks, while `task-service.js` remains the business boundary. Draft and inactive tasks cannot leak into the user catalog. Future HTTP/UI work can consume this service without duplicating task selection rules.

## ADR-0003 — Task verification configuration is task-scoped and provider-neutral

**Status:** Accepted  
**Date:** 2026-08-21

### Context

Tasks may require different external verification sources. Some sources can provide a known verifier automatically, while others require administrator configuration. Some registration tasks also need an external application's referral link, optionally followed by verification that the registered account belongs to the task user.

### Decision

Keep verification configuration inside the existing `activity_tasks.config` JSONB owned by `task-service.js`. Do not introduce a second task configuration store or a second verification service.

Verification defaults are provider-neutral and resolve to `automatic` mode when no task-specific override exists. A known provider can be selected by its provider identifier without embedding provider credentials in a task record.

External referral configuration has exactly these modes:

- `disabled`
- `link_only`
- `link_and_owner_verification`

`link_only` means DzMoney may provide the external application's referral link, but the link itself is not proof of registration or task completion. `link_and_owner_verification` requires a trusted external verification source capable of proving that the completed external account belongs to the task user before a reward can be issued.

Provider credentials must not be stored in task configuration. They belong to a separate protected provider-credential mechanism to be added only when an actual admin/provider integration requires it.

### Consequences

Existing Task Execution, Task Verification, Economy, and Ledger boundaries remain unchanged. Adding another provider later does not require rewriting task reward logic. Tasks without a trusted verifier cannot be treated as verified merely because a client event or referral link was opened.

## ADR-0004 — Advertisement providers are interchangeable and provider-neutral

**Status:** Accepted  
**Date:** 2026-08-21

### Context

DzMoney must not depend on a single advertisement network. Task verification, Daily Check-in, Reward Pool and other advertisement contexts must be able to use different providers without duplicating reward or verification logic. The existing `ad-event-service.js` already owns advertisement event state and idempotency, while `task-verification-service.js` owns the task verification state machine.

### Decision

Introduce one provider-neutral advertisement provider boundary in `ad-provider-service.js`. Providers are registered with an identifier, supported advertisement contexts, enabled state, priority and a server-side `verifyCompletion` function.

Provider selection is performed by context and optional explicit provider identifier. Enabled providers are ordered by priority. A provider may be replaced or another provider added without changing Task Execution, Task Verification, Economy or Ledger logic.

Provider failover is allowed only when the selected provider is unavailable or times out. A provider response that explicitly verifies or rejects an event is authoritative for that attempt and must not silently fall through to another provider. Malformed provider results fail closed.

Provider credentials and secrets are never stored in task configuration. They remain inside the eventual provider adapter/runtime configuration. No real provider is registered until its server-side verification contract is implemented and tested.

No database migration is required for this boundary. Existing `activity_ad_events` remains the source of truth for advertisement event state and idempotency.

### Consequences

Adding AdsGram, another ad network, or multiple networks later requires provider adapters only. The core verification and reward paths remain provider-independent. A provider outage can be isolated without turning an invalid verification response into a successful reward.

## ADR-0005 — Monetag Rewarded Interstitial uses a server-side postback boundary

**Status:** Accepted  
**Date:** 2026-08-22

### Context

DzMoney now has a real Monetag Rewarded Interstitial zone. Monetag provides a client SDK completion signal and a server-side postback containing the Telegram ID, zone, event type, reward-event flag, YMID and request context. DzMoney must not issue economic rewards from the browser alone.

### Decision

Use Monetag only through the existing advertisement provider registry. Monetag postbacks are accepted through a dedicated server-side HTTP boundary protected by a server-only secret. A postback must match an existing `daily_checkin` advertisement event by `ymid`, match the stored user's Telegram ID, use the configured Monetag zone, use the `impression` event and a monetized (`valued`) reward event flag, and carry the `daily_checkin` request context.

A successful Monetag verification marks the existing `activity_ad_events` row verified through `ad-event-service.js`. The existing Daily Check-in service remains responsible for the final economic reward and idempotency. No second ledger, reward service, or advertisement event store is introduced.

The Monetag provider is disabled unless explicitly enabled by server configuration. Its postback endpoint is exposed only when its server-side secret is configured. No Monetag secret is stored in the frontend or task configuration.

### Consequences

The frontend SDK is not an economic trust boundary. Monetag remains replaceable through the existing provider registry. Existing Daily Check-in and Economy/Ledger code remain the single sources of truth. No database migration is required because `activity_ad_events.external_ad_id` and existing verification state are sufficient for correlation and idempotency.

## ADR-0006 — Tasks-page advertisement completion is a direct ad-to-reward flow

**Status:** Accepted  
**Date:** 2026-08-25

### Context

Phase 2 requires Tasks-page advertisements to remain separate from Reward Pool advertisements, Daily Check-in advertisements and verification advertisements. The existing `activity_ad_events` schema already has a `task` context, and the provider-neutral advertisement registry already permits providers to serve that context. The remaining rule needed before implementation is how a Tasks-page advertisement reaches its reward without incorrectly entering the non-ad task Execute → Verify flow.

### Decision

A Tasks-page advertisement is an advertisement event with `context = 'task'`. It is not an `activity_tasks` row and therefore does not create a `task_attempts` or `task_verification_gates` record.

The flow is:

**start task advertisement → trusted provider callback → verify the existing `task` ad event → issue the configured standard activity reward exactly once**.

The existing `activity_ad_events` row is the source of truth for the advertisement attempt and idempotency. The existing provider registry is the source of truth for provider verification. The existing atomic economy/ledger primitive is the source of truth for the reward. The reward source is `advertisement` and must never be recorded as `task` merely because the advertisement appeared on the Tasks page.

A Tasks-page advertisement never receives the short verification advertisement used by non-ad tasks. A provider callback is accepted only when it matches an existing `task` ad event, the authenticated Telegram identity binding, and the provider's real server-side verification contract. Duplicate callbacks and repeated finalization are idempotent.

No new database table or migration is required. A small orchestration boundary is justified because completing the workflow requires coordinating the existing advertisement event, provider verification and economy primitives without moving their responsibilities into one another. It must reuse those existing primitives and must not become a second reward or verification system.

### Consequences

Tasks-page ads remain independent from verification ads and Reward Pool ads. The flow can support Monetag or another provider through the existing provider registry without changing Economy/Ledger logic. The client never receives authoritative reward state from its own ad-completion signal.

## ADR-0007 — Share with Friends trust boundary

**Status:** Accepted  
**Date:** 2026-08-25

### Context

The Daily `Share with Friends` task requires the user to open Telegram's share flow and share the user's canonical referral link once per UTC+1 calendar day. Reward eligibility and completion state remain server-authoritative. The current repository has no trusted server callback that proves the share was actually completed after the share UI is opened.

### Decision

Opening Telegram's share UI, a client click, or a frontend-only `shared=true` signal is not authoritative proof of completion and must not authorize an economic reward. Do not introduce a second share-tracking table, reward store, or client-side source of truth to compensate for the missing trusted signal.

The existing Daily task infrastructure remains the intended execution boundary. The canonical referral-link/bootstrap path must be implemented through the existing Referral system before the Share task can expose the user's referral link. A trusted provider/Telegram completion signal may later be integrated into the existing Daily task and Economy/Ledger path without creating a parallel state system.

### Consequences

`Share with Friends` remains an explicit integration gap rather than a forgeable reward path. The UTC+1 daily policy remains defined, but no economic reward is enabled until server-verifiable completion exists.
