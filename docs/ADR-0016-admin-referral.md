# ADR-0016: Admin Referral Controls Use Existing Referral Settings

## Status
Accepted

## Context
Phase 12 requires an operational Admin Referral surface for qualification visibility, activation reward configuration, and lifetime percentage configuration. The existing schema already contains `referral.reward_coin`, `referral.reward_dzx`, `referral.reward_dzp`, and `referral.lifetime_percent` in `admin_settings`.

The runtime referral service previously used hardcoded activation rewards and a hardcoded 20% lifetime rate.

## Decision
- Keep referral qualification server-authoritative and limited to the existing verified `task` or `advertisement` evidence boundary.
- Expose the existing referral settings through a protected Admin route with the same admin authentication and rate limiting pattern as other Admin settings.
- Write changes through `admin_settings` and `admin_audit_log`; do not create another configuration table.
- Make future activation rewards read the configured COIN/DZX/DZP values.
- Make future lifetime referral rewards read the configured percentage.
- Preserve existing Economy/Ledger, idempotency, attribution, and qualification boundaries.

## Consequences
- Admin changes affect future referral operations without rewriting historical ledger transactions.
- Qualification remains an evidence rule rather than a client-controlled switch.
- No duplicate Referral, Economy, Ledger, or configuration system is introduced.
