# ADR-0013 — System-Created Squads

**Status:** Accepted  
**Date:** 2026-08-31

## Decision

Squads are created by the system, not manually by users or Owners.

The system is also responsible for assigning the Squad Owner. Users do not create Squads and do not self-assign as Owner.

The Owner remains an application-level role used for the locked invitation flow; creation and Owner assignment are system-controlled operations.

## Constraints

- This decision does not revive the obsolete hierarchical ten-level Squad model.
- Squad remains independent from Referral and Reward Pool.
- Existing Economy/Ledger and Verified Activity remain the single sources of truth for their respective concerns.
- The concrete Owner-assignment selection algorithm is an implementation detail and must not introduce a second authority or economic system.
- Any Owner assignment must be server-authoritative and idempotent.

## Consequence

Phase 4 implementation must model system-controlled Squad creation and Owner assignment as part of the minimum Squad persistence/runtime required by `docs/SQUAD_SYSTEM_CONTRACT.md`.
