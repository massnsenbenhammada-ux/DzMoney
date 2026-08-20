# DzMoney Admin Panel V2 — Audit and Control Contract

## Purpose

The Admin Panel is an owner control surface, not a presentation-only dashboard. Every editable economic/task value must be written to the canonical PostgreSQL source used by the runtime.

## Removed from the visible Admin UI

- Legacy BUX controls
- Legacy BUX/TON and BUX/Coins conversion controls
- Unlabelled/ambiguous settings
- Free-form task types
- Reward fields that do not map to the canonical task catalog

## Canonical economy controls

Initial values:

- 1 TON = 10,000 DZX
- 1 DZX = 100 COIN
- Therefore 1 TON = 1,000,000 COIN

The owner may change DZX/Ton and COIN/DZX. COIN/Ton is derived and is never an independent source of truth.

## DZP controls

The owner can change:

- DZP per activity task
- DZP per confirmed AdsGram reward
- One-time Referral DZP qualification reward

The settings are stored in `settings` and synchronized to `dzp_settings` where the DZP service reads them.

## User DZP balance

The Users section exposes exact DZP balance and DZP delta controls. These call the authoritative economy balance endpoints and create `ADMIN_ADJUSTMENT` ledger entries plus an admin audit record.

## Task catalog

Tasks are created/edited against the canonical `tasks` table used by `/api/v2/tasks`.

Official categories, in order:

1. Daily Activity
2. Game Tasks
3. Social Tasks
4. Web Tasks
5. Special Tasks
6. Partner Tasks

Each task explicitly defines its verification method and reward fields:

- Coins
- DZP
- DZX
- Economic budget DZX
- Required count
- Cooldown
- Active state

## Compatibility policy

Legacy BUX routes remain in the server only as compatibility infrastructure while the new DZX/DZP economy is stabilized. They are not exposed as controls in Admin Panel V2 and must not become the source of truth for new features.

## Verification after deploy

1. Admin login works.
2. Economy values read from `/api/admin/settings`.
3. Saving economy values changes the database and subsequent economic calculations.
4. Saving DZP settings changes the database and future task/ad/referral rewards.
5. User DZP exact/delta controls change the real `users.dzp` balance and ledger.
6. Creating a task appears under the selected canonical category and is returned by `/api/v2/tasks`.
7. Activating/deactivating a task changes the canonical `tasks.active` value.
8. Admin audit records are created for changes.
