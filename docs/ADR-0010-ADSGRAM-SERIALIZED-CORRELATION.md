# ADR-0010 — AdsGram Test Reward correlation uses serialized dual confirmation

**Status:** Accepted  
**Date:** 2026-09-08

## Context

AdsGram's documented Publisher Reward URL supplies the Telegram user identifier through the `[userId]` placeholder but does not document a per-impression event ID or signed provider webhook. A client `show()` completion therefore cannot be the economic trust boundary. Conversely, binding a delayed callback to the latest event would risk cross-event attribution.

The AdsGram account/API `token` documented for advertiser conversion tracking is a different API contract and is not a documented credential for the Mini App Publisher Reward URL.

## Decision

AdsGram Test Reward Block `44442` is enabled only through server configuration and only for the existing `task` advertisement context.

Task advertisement provider selection is strict rotation:

**Monetag → AdsGram → Monetag → AdsGram …**

This is rotation, not fallback. A failed provider attempt does not switch providers inside the same attempt.

For AdsGram, one unresolved event per user is permitted. The existing `activity_ad_events.metadata` stores:

- `client_completed`
- `provider_confirmed`
- the configured Test Block ID

The client completion endpoint can set only `client_completed`. The AdsGram Reward URL can set only `provider_confirmed`. The event becomes `verified` only when both confirmations exist. The existing advertisement finalization then reuses the existing Economy/Ledger reward transaction and idempotency boundary.

The Reward URL accepts the documented Telegram user ID callback over HTTPS/GET and binds it to the configured Block ID and the single pending AdsGram event. No undocumented AdsGram callback token is required or treated as provider authentication.

If a provider callback never arrives, the AdsGram event remains pending. The next rotation attempt may use Monetag, but another AdsGram event for that user cannot start. No arbitrary timeout converts a missing callback into a reward because a late callback could otherwise be attached to a different event.

No new Economy, Ledger, Task, Verification or reward store is introduced. No database migration is required.

## Consequences

The existing `activity_ad_events` source of truth prevents cross-event callback reassignment under the serialized invariant. Duplicate confirmations and reward finalization remain idempotent. Deterministic tests prove the local boundary; real AdsGram Test Platform execution remains a separate acceptance gate and is not represented as PASS by synthetic tests.
