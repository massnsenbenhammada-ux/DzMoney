# DzMoney Admin Panel Audit

## Purpose
The Admin Panel is a control plane. A successful Admin change must modify the authoritative PostgreSQL state used by the user-facing system; changing HTML/JS alone is not considered a valid configuration change.

## Findings and fixes

### 1. DZP settings were rejected by the Admin API
The legacy `/api/admin/settings` allowlist did not include the three DZP controls exposed by the DZP migration:

- `dzp_default_activity`
- `dzp_ad_reward`
- `dzp_referral_reward`

This produced `Unknown or protected setting` and prevented the Admin Panel from changing DZP rewards.

**Fixed:** the authoritative Admin settings layer now validates and persists all three keys to both `settings` and the corresponding `dzp_settings` keys in one transaction.

### 2. Admin task controls targeted the legacy task fields
The current task catalog uses:

- `reward_coins`
- `reward_dzp`
- `reward_dzx`
- `verification_method`
- `required_count`
- `cadence_seconds`

The older Admin task handlers used the legacy `reward` field and therefore did not control the canonical task economy correctly.

**Fixed:** Admin task GET/POST/PUT/DELETE operations now use the canonical task catalog columns. Legacy UI fields such as `reward` and `duration` are accepted as compatibility aliases, but writes land in the canonical columns.

### 3. Admin task changes are authoritative
Task creation/update/delete is now written directly to PostgreSQL and audited. DZP/DZX/Coins values are not merely cosmetic UI values.

### 4. Protected economy rates remain protected
`coins_per_bux` and `bux_per_ton` remain fixed by the server economy definition and are not made editable by the Admin compatibility layer.

## Control rule
For future Admin Panel features:

> Admin UI -> Admin API -> authoritative database/economy service -> user-facing behavior.

Never implement an Admin control as a frontend-only display change.

## Current compatibility layer
`admin-settings-compat.js` is preloaded before `server.js`. It replaces only the affected Admin settings/task handlers while preserving the existing `requireAdmin` middleware. All unrelated server routes remain untouched.
