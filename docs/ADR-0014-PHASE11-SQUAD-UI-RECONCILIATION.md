# ADR-0014 — Phase 11 Squad UI Contract Reconciliation

**Status:** Accepted
**Date:** 2026-09-07

## Context

Phase 11 required a final product decision for the user-facing Squad summary and navigation. The historical Phase 4 section in `PROJECT_ROADMAP.md` still contains the earlier hierarchical/10-level Squad model.

The governing Squad contract is `docs/SQUAD_SYSTEM_CONTRACT.md`, which explicitly supersedes the old hierarchical/10-level model. The implemented backend derives the current Squad tier from the existing admin-configured membership tiers and current member count.

## Decision

For the Phase 11 user application UI:

- Bottom navigation remains five items: **Home → Tasks → Squad → Friends → Wallet**.
- Squad is the centered and visually prominent navigation item.
- Home displays the server-derived summary in the form:
  `Squad #123 • Level 2 • 37 Members`.
- The Squad progress explanation displays:
  - Current Level → Level 2
  - Current Members → 37
  - Required → 50
  - Progress → 74%
- The displayed level is the presentation ordinal of the configured membership tier. It is not the obsolete hierarchical ten-level Squad system.
- `requiredMembers` is the configured tier upper bound used by the existing Squad membership contract; `progressPercent` is derived from current membership count against that requirement.
- No new Squad business source of truth, database field, Economy, Ledger, Verification, Activity, or Reward system is introduced.

## Consequence

The stale hierarchical/10-level wording in the historical Phase 4 roadmap section must not be used to guide implementation. `docs/SQUAD_SYSTEM_CONTRACT.md` remains the authoritative Squad business contract.

Phase 11 UI reconciliation is therefore a documentation clarification, not a reopening of the Squad business model.

## Validation boundary

The implementation was merged through PR #268. CI remains authoritative for code validation. Runtime deployment validation is tracked separately and must not be inferred from this documentation decision.
