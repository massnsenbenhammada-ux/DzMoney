# Test Governance

**Status:** Active project testing governance

## Purpose

Test Governance is the operating contract for the DzMoney test library. It protects the existing tests while requiring release-critical behavior to be proven through the real application state, not only through source inspection, contracts, mocks, or isolated path assertions.

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
11. **A contract/static test is evidence of implementation structure, not evidence that the product works for a user.** It cannot satisfy a release-critical real-state journey by itself.
12. **Every release-critical user journey must have an executable real-state E2E test.** The test must exercise the actual application, authenticated test state, real HTTP boundaries, canonical database/economic state, and the user-visible outcome.
13. **Real-state E2E tests must verify outcomes, not only paths.** A reward journey must assert before/after state, persisted economic effect, returned reward, visible reward UX, reload persistence, and duplicate/idempotency behavior where applicable.
14. **Skipped real-state tests do not constitute release evidence.** A required real-state gate must fail when its required environment is unavailable; it must not silently convert to PASS through `test.skip()`.
15. Provider-specific tests may use a deterministic provider adapter only when that adapter exercises the same production HTTP/database/reward boundaries. SDK mocking alone is not proof of end-to-end product behavior.

## Test layers

- **Contract:** protects an explicit API, domain, UI, provider, or configuration contract. Contract tests are not release acceptance by themselves.
- **Integration:** protects behavior across real application boundaries such as HTTP, PostgreSQL, Economy/Ledger, or provider ingress.
- **Security:** protects authentication, authorization, rate limits, trust boundaries, and abuse resistance.
- **Regression:** permanently protects a previously observed defect or failure mode.
- **Real-state E2E:** starts from a real authenticated application state, performs the user journey through the actual UI/application, and proves the resulting persisted and user-visible state.
- **Full regression:** `test:all` and the CI jobs that execute the repository-wide suite.

These labels describe purpose, not a required directory layout. Existing files remain where they are.

## Real-state acceptance rule

For release-critical user journeys, the required evidence is:

`Real initial state → real user action → real application boundary → real verification → real persistence → real economic outcome → real UI outcome → reload/repeat safety`

A test that only checks source text, function names, mocked return values, route wiring, or the existence of a popup function is **not** a real-state test.

For reward-producing journeys, the minimum assertion set is:

1. authenticated test user exists;
2. prerequisite state is created through the application contract;
3. the user action is performed through the real UI;
4. the actual server endpoint is exercised;
5. verification/ad completion reaches the real server boundary;
6. the canonical Economy/Ledger records the expected result;
7. the HTTP response contains the canonical reward outcome;
8. the frontend renders the actual reward outcome visibly;
9. a fresh read/reload confirms the persisted state;
10. repeating the same logical operation does not create a second economic credit.

The exact prerequisite and provider mechanism is owned by the relevant phase contract. Governance does not authorize a second verification, Economy, Ledger, or advertisement system.

## Release-critical journey registry

The repository currently treats these user journeys as release-critical because failures in them can directly produce a false reward/no-reward experience:

| Journey | Required executable gate | Required evidence |
| --- | --- | --- |
| Gaming Watch Ad → Reward | `test:e2e:real-state-gaming` | real UI → ad completion boundary → canonical reward → Economy/Ledger → visible reward outcome → persistence/idempotency |
| Share with Friends → Reward | `test:e2e:real-state-share-with-friends` | real UI → Verification Advertisement prerequisite → Click Proof verification → canonical reward → Economy/Ledger → visible reward outcome → persistence/idempotency |

Test Governance validates that each required gate exists, invokes Playwright against the declared real-state spec, and is included in the full regression suite. Missing coverage is a **governance failure**, not a warning.

## Invariant-first rule

Before adding a test, identify the behavior it protects:

`Requirement → Invariant → Test → Implementation → CI`

For release-critical journeys, extend this to:

`Requirement → Real initial state → Real user journey → Persisted outcome → User-visible outcome → Test → CI`

If an existing test already protects the invariant, extend that test instead of creating another overlapping test. An existing contract/integration test does not remove the real-state E2E requirement.

## `test:all` integrity

The full suite is a curated execution list. Governance must detect broken references and accidental duplication without changing the suite's current order or coverage. The automated governance guard validates referenced npm test scripts, direct test files, duplicate entries, and `test:all` recursion. It also validates that every release-critical real-state journey has an executable Playwright gate included in `test:all`.

## Regression discipline

When a production or CI defect is fixed:

`Failure → root cause → regression test → fix → full suite`

For a release-critical user-visible defect, the regression test must reproduce the real user state and fail on the observed defect before the fix whenever practical. A source-text assertion that merely recognizes the intended implementation is insufficient.

## Change control

Testing changes follow Constitution 54: inspect the current repository and history first, make the smallest safe change, run targeted tests, then the full suite/CI before merge. Do not introduce a second test framework unless an existing requirement proves it necessary.
