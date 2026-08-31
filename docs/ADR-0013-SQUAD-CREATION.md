# ADR-0013 — System-Created Squads and Owner Assignment

**Status:** Accepted  
**Date:** 2026-08-31

## Decision

Squads are created by the system. Users cannot create a Squad and cannot self-assign as its Owner.

The system assigns the Owner server-side and idempotently. Owner assignment must be deterministic and must reuse the existing user identity and membership records; no second identity source of truth is permitted.

The business contract does not expose Owner selection as a user choice. The implementation may choose the minimum deterministic rule necessary to assign an eligible user when a new Squad requires an Owner, provided that the rule is server-authoritative, repeatable, race-safe and covered by TDD.

## Consequences

- Squad creation remains automated rather than user-driven.
- Owner invitations remain the only free membership acquisition path initiated by an Owner.
- Paid membership remains tier-selected by the user and Squad-selected by the backend.
- Legacy hierarchical Squad creation and self-assigned ownership must not be restored.
- No separate identity, user-role, or ownership service is introduced.
