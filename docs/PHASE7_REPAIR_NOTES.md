# Phase 7 Repair Notes

- Daily raw Total Contribution DZP is derived from the existing Ledger reward records for the current UTC+1 day.
- The modifier contract is `sqrt(C)` interpreted as a percentage; `modifier_rate` stores the decimal ratio (`sqrt(C) / 100`) consumed by the existing reward multiplier path.
- `modifier_rate` remains `NUMERIC(30,9)` and is no longer capped at `1`.
- The existing daily-state and contributor mechanisms remain the temporal/source-of-truth boundaries.
- Members without qualifying verified activity do not receive the daily Squad modifier.
- Phase 7 changes the existing Reward path so the Squad modifier applies to COIN, DZX, and DZP while preserving `earned_dzp` provenance.
