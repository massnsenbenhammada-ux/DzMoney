# DzMoney 2.0 — API Contracts (Foundation)

These are boundary contracts, not an implementation of the full API. Business modules must preserve these rules.

## Authentication

All user-scoped endpoints resolve the Telegram user from a verified Telegram WebApp init payload/session. A client-supplied `userId` is not trusted for authorization.

## Common mutation contract

Mutation endpoints that can change value accept:

- `idempotencyKey`: unique request key.
- validated request data only; no client-supplied balance or eligibility fields.

Responses should include a stable operation/transaction identifier where value changed.

## Foundation endpoints

### `GET /api/me`

Returns identity, roles and profile metadata.

### `GET /api/wallet`

Returns COIN, DZX, DZP balances and relevant account state. Purchased DZP and earned DZP accounting must remain distinguishable in backend data even if the UI displays one total balance.

### `GET /api/activity/today`

Returns:

- `dailyActivityDzp`
- `dailyTotalActivityDzp`
- `effectiveWeight`
- `packageMultiplier`
- `activityDate` (UTC+1 business date)

### `GET /api/economy/rates`

Returns current public conversion rates. Admin-only configuration endpoints are separate.

### `POST /api/economy/convert`

Server determines whether COIN→DZP or DZX→DZP is permitted, calculates the amount using the current rate, writes a ledger transaction and returns the resulting balances.

### `GET /api/packages`

Returns active package catalog and current user's package state.

### `POST /api/packages/purchase`

Server verifies one-package-only rule, expiry state, Purchased DZP availability and package configuration before charging the user and activating the package.

### `GET /api/reward-pool`

Returns activation state, qualifying Reward Pool ad count, daily activity, multiplier and current-cycle information.

### `POST /api/reward-pool/activate-ad`

Records only a verified Reward Pool ad. Task-page ads must not satisfy this endpoint.

### `POST /api/promo/redeem`

Creates a pending redemption. Reward is released only after a qualifying ad verification is attached to the redemption.

## Admin API principles

Admin routes must:

- verify Admin authorization;
- validate setting identifiers against an allow-list/schema;
- persist the change in the real settings store;
- write an audit log;
- return the new effective value.

No Admin setting should exist only in frontend state.
