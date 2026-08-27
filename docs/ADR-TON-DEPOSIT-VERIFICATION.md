# ADR: TON Deposit Blockchain Evidence Contract

## Status
Accepted — implementation stage.

## Context
DzMoney must credit TON deposits only from blockchain evidence. Client-supplied transaction amounts or confirmation counts are not a source of truth.

## Decision
1. TON Center API v3 is the initial blockchain read adapter.
2. Mainnet and Testnet use separate base URLs and configuration addresses.
3. A deposit candidate is read by transaction hash and must contain an inbound message to the configured deposit address.
4. The transaction account and inbound-message destination must both canonicalize to the configured address.
5. The blockchain inbound value is compared as integer nanoTON to the expected amount; floating-point arithmetic is forbidden.
6. Bounced or aborted transactions are rejected.
7. A transaction is eligible for credit only after masterchain finality is established. A provider failure or incomplete/non-finalized evidence results in HOLD, never credit.
8. The existing Deposit Service and Economy/Ledger remain the single internal accounting path. No second ledger or reward path is introduced.
9. Provider access is isolated behind an adapter so a second independent provider can be added later without changing Deposit business rules.

## Failure policy
- Provider timeout/HTTP failure: HOLD.
- Transaction not found: HOLD until a later verification attempt; never credit.
- Not finalized: HOLD.
- Wrong destination, amount, bounced, or aborted transaction: REJECT.
- Replay: handled by the existing unique transaction hash and idempotency constraints before Economy credit.
- Mainnet reorg: finalized transactions are treated as irreversible according to TON finality; pre-finality evidence is never credited.

## Consequence
The blockchain is the source of truth for transaction evidence. Admin settings are the source of truth for the current receiving address. The Economy remains the source of truth for internal balances.
