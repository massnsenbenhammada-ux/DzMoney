# ADR-0007 — Advertisement provider rotation

**Status:** Accepted
**Date:** 2026-09-03

## Context

DzMoney has one canonical `activity_ad_events` store and multiple advertisement providers. The previous provider-selection contract used priority ordering and provider failover. Gaming now requires each new advertisement button press to use the next available provider in a deterministic sequence.

## Decision

Provider order is the runtime registration order in `AdProviderRegistry`.

Rotation is **per advertisement context**. For a context, the next provider is the first currently available provider after the provider recorded on the latest event in that context, wrapping to the beginning when necessary. Disabled or context-disabled providers are skipped.

The rotation cursor is not stored in a second state table. The latest provider recorded in the canonical `activity_ad_events` history is the source used to derive the next provider. Provider allocation and event creation are serialized with a PostgreSQL transaction advisory lock for the context, so concurrent new presses cannot allocate the same sequence position.

The provider recorded on an advertisement event is immutable for that event. Verification never rotates or falls back to another provider. It resolves only the provider recorded on the event and fails closed when that provider is unavailable or rejects verification.

Idempotent retries return the existing event and provider and do not advance rotation.

The client does not select a provider. The server creates the event first, returns its selected provider identifier, and the client invokes the matching already-loaded provider adapter.

## Consequences

The existing advertisement event, verification, reward, Economy and Ledger boundaries remain the single sources of truth. No rotation service, rotation table, client-side cursor, priority setting, or provider failover path is required.

Provider availability can change without changing historical events. A provider that becomes disabled is skipped for subsequent new events, while existing events remain bound to their recorded provider.
