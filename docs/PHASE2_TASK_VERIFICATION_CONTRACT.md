# DzMoney 2.0 — Phase 2 Task Verification Contract

## Status

**Contract clarification only.** This document does not authorize a new verifier implementation by itself. It records the minimum evidence contract required before a non-advertisement task can be considered verified.

## Source of truth

- Product behavior: `PROJECT_ROADMAP.md`
- Phase 2 design: `docs/PHASE2_DESIGN_REVIEW.md`
- Task verification rules: `docs/PHASE2_TASK_VERIFICATION_RULES.md`
- Runtime behavior: current code and tests
- Architectural constraints: `docs/ARCHITECTURE_RULES.md`

If these sources disagree, stop implementation and reconcile them before proceeding.

## Core contract

Every non-advertisement task follows:

**Execute → Verify → verification ad (when configured) → server verification → reward**

`task-verification-service.js` owns the verification/reward boundary. A verifier supplied to that boundary must return a boolean success decision; it must not mint rewards or write the ledger itself.

## Evidence requirement

A task verifier must derive its decision from **server-trusted evidence appropriate to the task type**. A client-provided `completed=true`, arbitrary timestamp, arbitrary counter, or equivalent client assertion is not sufficient evidence.

The repository currently defines the verification boundary and configuration validation, but it does **not** define concrete external evidence adapters for Daily, Game, Social, Web, or Special/Partner tasks. Therefore those adapters are not to be invented or treated as complete until their evidence sources and contracts are explicitly defined.

## Category contract

### Daily

Evidence source: **not yet specified in the current repository**.

Required before implementation:
- exact daily action being verified;
- trusted server-observable evidence;
- identity binding between evidence and Telegram user;
- replay/idempotency behavior.

### Game

Evidence source: **not yet specified in the current repository**.

Required before implementation:
- exact game event/result being verified;
- trusted server-side source or authenticated integration;
- identity binding;
- replay/idempotency behavior.

### Social

Evidence source: **not yet specified in the current repository**.

Required before implementation:
- exact social action;
- supported platform/provider;
- server-verifiable evidence;
- ownership/identity verification rules;
- replay/idempotency behavior.

### Web

Evidence source: **not yet specified in the current repository**.

Required before implementation:
- exact web action;
- trusted evidence source;
- identity/session binding;
- replay/idempotency behavior.

### Special/Partner

Evidence source: **not yet specified in the current repository**.

Required before implementation:
- partner/provider identity;
- authenticated callback or equivalent trusted evidence;
- event/reference identity;
- replay/idempotency behavior;
- failure/reversal behavior where applicable.

## Advertisement tasks

Advertisement tasks are excluded from this contract's two-action task verification model. The advertisement itself is the qualifying event and must use the advertisement provider verification boundary defined by Phase 2.

## Reward boundary

A verifier must only decide whether the task requirements were satisfied.

It must not:

- credit COIN directly;
- credit DZX directly;
- credit DZP directly;
- create ledger entries directly;
- apply Referral logic;
- apply Squad as a separate source;
- distribute Reward Pool funds.

Successful verification returns control to the existing task verification service, which performs the canonical atomic economy/ledger operation.

## Acceptance gate

Phase 2 cannot be closed while a required task category lacks a defined trusted evidence contract and corresponding tests.

No implementation should be added merely to make a checkbox pass. If the required evidence source is not specified, the correct state is **pending specification**, not a guessed adapter.
