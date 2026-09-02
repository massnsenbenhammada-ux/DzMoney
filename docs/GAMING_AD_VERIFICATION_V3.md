# Gaming Ads Verification V3

## Problem
Gaming Ads can be displayed successfully while the Gaming progress counter remains unchanged. The current flow depends on an asynchronous third-party postback to correlate a pending `activity_ad_events` row. UI polling cannot prove that the provider callback was received or that the callback reached canonical Gaming finalization.

## Evidence
- The Gaming client starts `/api/gaming/ads/start`, then invokes the provider handler.
- The OnClickA documented callback supplies `USERID` to the configured handler.
- Production uses OnClickA; the previous implementation introduced a secret-gated callback that is not part of the documented OnClickA callback contract.
- CI proves the callback boundary in isolation, but Production runtime logs are unavailable through the current Railway connector role. Therefore CI success must not be treated as proof that the live callback is reaching the production application.

## V3 strategy
Treat the ad provider display and the server verification callback as separate asynchronous events. The server must remain the only authority for crediting progress. The client must not infer verification from `show()` resolving and must not create a second reward/counter system.

The next implementation should add deterministic observability at the existing callback boundary and at Gaming finalization, using the existing `activity_ad_events` row as the correlation record. The callback must record an explicit terminal verification state for the pending event before canonical Gaming finalization. The client should refresh state after the handler returns, but polling remains only a UX convenience and never a verification mechanism.

## Non-goals
- No new Economy/Ledger/Reward service.
- No client-side reward credit.
- No guessed provider secret/signature.
- No replacement of `activity_ad_events`.
- No "most recent event" heuristic when multiple pending events exist.
