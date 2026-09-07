# ADR-0014 — GigaPub Gaming Requires Trusted Provider Verification

**Status:** Accepted  
**Date:** 2026-09-07

## Context

The standard GigaPub Gaming integration currently uses `window.showGiga()` and its client-side Promise settlement. The merged PR #241 explicitly chose that Promise as the provider completion signal because no standard-ad server callback was documented at implementation time.

That signal is not sufficient evidence for a reward-bearing server operation: an authenticated client can call the existing Gaming completion endpoint with its pending `adEventId` without proving to DzMoney that GigaPub actually completed the advertisement.

## Decision

GigaPub remains a registered historical provider implementation, but it is **disabled for reward-bearing Gaming** until an authenticated provider-side verification contract for Standard Gaming Ads is available and implemented.

The existing Advertisement provider registry, Gaming event, Verification boundary, Economy and Ledger remain the single sources of truth. No second verification service is introduced.

When GigaPub supplies an authenticated server-side completion mechanism, it must be integrated through the existing provider verification boundary before re-enablement. The exact callback, signature/hash, API, or secret semantics must come from authoritative GigaPub documentation/support; none are invented here.

## Consequences

- Client `showGiga()` settlement cannot directly authorize an economic reward.
- GigaPub is skipped by Gaming provider rotation while this evidence gate is closed.
- Monetag and OnClickA retain their existing trusted callback paths.
- The existing GigaPub reliability/timeout handling remains useful for non-reward diagnostic work but is not treated as verification evidence.
- Re-enablement requires tests proving provider authenticity, user/event correlation, replay protection, and failure behavior.

## Rejection criteria

Do not re-enable GigaPub merely because `showGiga()` resolves, a client callback exists, or `GIGAPUB_SECRET_KEY` is configured. Configuration presence is not evidence of a documented Standard Gaming verification contract.
