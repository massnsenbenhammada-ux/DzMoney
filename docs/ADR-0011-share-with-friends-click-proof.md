# ADR-0011 — Share with Friends uses Click Proof

**Status:** Accepted  
**Date:** 2026-08-26  
**Supersedes:** ADR-0007 for the completion-evidence decision

## Context

Telegram does not provide DzMoney with a trusted server callback proving that a user completed the Share with Friends action. Waiting for a nonexistent external proof would leave the Daily task permanently unverifiable, while treating a client-only `shared=true` signal as authoritative would create an economic trust-boundary violation.

The product decision is therefore to make Share with Friends a **Click Proof** task: DzMoney proves only that the authenticated user invoked the share action, not that Telegram completed the external share.

## Decision

Share with Friends will:

1. use the authenticated user's canonical referral link from the existing Referral system;
2. open Telegram's share UI with that link;
3. record the share action against the existing Daily task attempt through the existing server click-evidence boundary;
4. require the existing verification-ad gate where configured for non-ad Daily tasks;
5. finalize through the existing Task Verification and Economy/Ledger paths;
6. allow one successful completion per user per UTC+1 calendar day;
7. rely on server-side task state and idempotency for replay protection.

The recorded click is named and treated as **Click Proof**, not as proof that the Telegram share itself succeeded.

## Consequences

No new Share tracking table, verifier, reward service, Economy, Ledger, or referral source is introduced.

The existing Task Verification boundary remains authoritative. The client only requests the Share action and reports the action click; it cannot directly authorize an economic reward.

The actual advertisement provider remains responsible for the advertisement presentation/duration. DzMoney does not expose a Creator-controlled verification-ad duration for Share with Friends.
