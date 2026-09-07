# Test Governance

**Status:** Active project testing governance

## Purpose

Test Governance is the lightweight operating contract for the existing DzMoney test library. It organizes and protects the current tests without moving, deleting, renaming, or rewriting them.

## Principles

1. The existing test suite is the baseline. Do not rebuild it.
2. Every new test should protect a concrete contract, invariant, security property, integration boundary, or regression.
3. Prefer extending an existing test when it already owns the relevant invariant.
4. Do not add duplicate tests merely to increase test count.
5. Regression tests should correspond to a real defect or verified failure mode.
6. Domain logic remains tested at the narrowest useful boundary; integration tests protect cross-boundary behavior.
7. Security-sensitive behavior requires explicit security coverage rather than relying only on happy-path tests.
8. `test:all` remains the full regression gate; its execution semantics must not be silently changed by governance work.
9. Test infrastructure changes must not weaken existing CI coverage.
10. New tests should be deterministic, isolated where practical, and safe to run repeatedly.

## Test layers

- **Contract:** protects an explicit API, domain, UI, provider, or configuration contract.
- **Integration:** protects behavior across real application boundaries such as HTTP, PostgreSQL, Economy/Ledger, or provider ingress.
- **Security:** protects authentication, authorization, rate limits, trust boundaries, and abuse resistance.
- **Regression:** permanently protects a previously observed defect or failure mode.
- **Full regression:** `test:all` and the CI jobs that execute the repository-wide suite.

These labels describe purpose, not a required directory layout. Existing files remain where they are.

## Invariant-first rule

Before adding a test, identify the behavior it protects:

`Requirement → Invariant → Test → Implementation → CI`

If an existing test already protects the invariant, extend that test instead of creating another overlapping test.

## `test:all` integrity

The full suite is a curated execution list. Governance must detect broken references and accidental duplication without changing the suite's current order or coverage. A future automated checker may validate that every referenced npm test script exists, every referenced test file exists, and `test:all` does not recursively invoke itself.

## Regression discipline

When a production or CI defect is fixed:

`Failure → root cause → regression test → fix → full suite`

The regression test should fail for the defect before the fix whenever practical.

## Change control

Testing changes follow Constitution 54: inspect the current repository and history first, make the smallest safe change, run targeted tests, then the full suite/CI before merge. Do not introduce a second test framework unless an existing requirement proves it necessary.
