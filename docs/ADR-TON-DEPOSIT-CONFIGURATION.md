# ADR — TON Deposit Network and Address Configuration

## Status
Accepted

## Decision
DzMoney stores one deposit address per TON network in the existing `admin_settings` source of truth:

- `deposit.ton.testnet_address`
- `deposit.ton.mainnet_address`

The values are managed only through an authenticated and authorized admin API and every change is recorded in `admin_audit_log`.

The client never chooses the authoritative deposit destination. The server selects the configured address from the expected network, and blockchain verification must independently prove that the observed transaction matches that destination.

## Security invariants

1. Testnet and Mainnet addresses are isolated and cannot be used interchangeably.
2. Private keys and seed phrases are never stored in DzMoney.
3. A deposit address change is atomic with its audit record.
4. Historical deposits retain the destination observed at verification time.
5. TON blockchain evidence, not a client-supplied confirmation count, is the source of truth for deposit verification.
6. Configuration validation fails closed when the network and address do not match.

## Consequences

This reuses the existing `admin_settings`, `admin_audit_log`, database transaction helper, and Deposit/Economy services. No second configuration store or second economy/ledger is introduced.

The Mainnet address supplied for the project is intentionally not hard-coded; it must be entered through the secured admin configuration path after the Mainnet verification adapter is ready.
