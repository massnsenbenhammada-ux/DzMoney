# DzMoney Admin Economy Controls

## Authoritative controls

The Admin Panel controls the real PostgreSQL economy state, not presentation-only values.

### User DZP balance

Admins can:

- Set an exact user's DZP balance.
- Apply a positive or negative DZP delta.
- Never reduce the balance below zero.
- Every non-zero admin adjustment is written to `economy_ledger` as `ADMIN_ADJUSTMENT` and to `admin_audit`.
- Admin adjustments do not create `ACTIVITY_WEIGHT` records and therefore do not masquerade as earned activity.

### Economic conversion rates

The primary configurable rates are:

- `dzx_per_ton`: DZX received per TON.
- `coins_per_dzx`: COIN value per DZX.
- `coins_per_ton`: derived automatically as `dzx_per_ton * coins_per_dzx`.

Initial values are:

`1 TON = 10,000 DZX = 1,000,000 COIN`

The Admin Panel may change the two primary rates. The derived TON-to-COIN rate is recalculated automatically so the relationship cannot become internally inconsistent.

The rates are stored in both `economy_settings` (system source) and the Admin `settings` table for compatibility. DZX withdrawal/economy services read the authoritative `economy_settings` values.
