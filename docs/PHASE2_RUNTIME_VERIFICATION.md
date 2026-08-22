# Phase 2 Runtime Verification Plan

## Purpose

Define the existing runtime verification gate for Phase 2 without introducing new runtime architecture.

## Scope

The verification gate covers the existing Phase 2 implementation:

- task catalog
- task execution
- task lifecycle transitions
- task verification
- verification advertisement gate
- existing economy/ledger integration
- Daily Check-in backend foundation
- advertisement provider boundaries

## Required validation

Run against an isolated PostgreSQL test database:

1. `npm run migrate`
2. `npm run test:phase2`
3. `npm run test:phase1`
4. `npm run test:economy-ledger`
5. `npm run test:deposit`
6. `npm run reconcile:economy`
7. `/health` returns HTTP 200
8. `/health/db` returns HTTP 200

## Acceptance rule

Phase 2 remains incomplete until the runtime verification commands pass on the current commit and the relevant integration boundaries remain intact.

## Explicit non-goals

This document does not introduce:

- a new service
- a new task verifier architecture
- a new economy or ledger
- a Daily Check-in HTTP contract
- real advertisement providers
- production callbacks
- new database migrations

Those require their own validated implementation scope.
