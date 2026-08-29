# ADR-0012 — Creator Campaign Pricing: 10 DZX per Valid Visit

**Status:** Accepted
**Date:** 2026-08-29

## Context

Creator campaign pricing had conflicting historical references. The project previously contained a reference of 9 DZX per valid visit / 9,000 DZX per 1,000 visits, while the validated product decision is to use one unified Creator campaign price.

The pricing unit must be unambiguous and must not create separate prices for Click Proof and Server Verified.

## Decision

The canonical Creator campaign price is:

**10 DZX per valid visit/execution.**

The equivalent CPM representation is:

**10,000 DZX per 1,000 valid visits/executions.**

The unit price, **10 DZX per valid visit**, is authoritative. The 10,000 DZX CPM is only the equivalent presentation for 1,000 visits.

There is no separate Creator price for Click Proof versus Server Verified.

The price remains controlled through the existing Admin campaign configuration/management architecture. It must not be hardcoded independently in the frontend or duplicated in another configuration source.

## Consequences

- Creator campaign pricing has one canonical unit and one equivalent CPM representation.
- Historical 9 DZX / 9,000 DZX references are obsolete for the current product specification.
- Existing campaign/economy primitives remain the source of runtime pricing authority.
- No new pricing service, table, or configuration source is introduced.
- Tests and documentation must use 10 DZX per valid visit when they describe the canonical Creator campaign price.
