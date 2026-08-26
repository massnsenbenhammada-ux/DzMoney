# DzMoney Constitution 54

**Status:** Mandatory project governance contract

**Applies to:** Every human or AI agent, coding assistant, reviewer, automated code generator, and autonomous development tool working on this repository.

**Canonical location:** `docs/CONSTITUTION_54.md`

## 0. Mandatory reading and precedence

Before inspecting, proposing, modifying, reviewing, testing, or merging code, an AI tool MUST read this document and the repository's governing documentation. This document is the mandatory AI change-control contract for DzMoney.

Required reading also includes, when present and relevant:
- `docs/ARCHITECTURE_RULES.md`
- `PROJECT_ROADMAP.md`
- `IMPLEMENTATION_STATUS.md`
- relevant ADRs
- phase-specific contracts/rules
- task/economy/security contracts

If another document conflicts with this Constitution, the higher-priority rule is Security, Financial/Data Integrity, then Correctness, then Compatibility, then Architecture/Maintainability, then Performance, then Features. Existing project documents remain authoritative for domain-specific facts unless this Constitution explicitly governs the process.

AI tools MUST NOT claim compliance without actually reading the relevant source files.

> Repository files cannot technically force an arbitrary external AI product to read a file. This document therefore defines the repository's mandatory governance contract; root instruction files point every supported coding agent to it.

## 1. Zero Guessing / Source of Truth

- NEVER guess variable names, functions, schemas, routes, file paths, APIs, business rules, or current project state.
- GitHub repository state, code, Git history, commits, PRs, CI, tests, migrations, and project documentation are the evidence sources.
- Code is authoritative for runtime behavior.
- `PROJECT_ROADMAP.md` is the product specification when present.
- `IMPLEMENTATION_STATUS.md` records validated implementation state when present.
- If specification, status, and code disagree, stop feature work and reconcile them before proceeding.
- Never restart the project from scratch.
- Never redesign existing architecture merely because a different design appears simpler.

## 2. Strict priority hierarchy

1. Security — P0
2. Financial and data integrity — P0
3. Correctness — P1
4. Backward compatibility — P1
5. General data integrity — P2
6. Architecture and maintainability — P2
7. Performance and optimization — P3
8. Features — P3

## 3. Complete, minimal changes

- Never output or commit incomplete files, stubs, placeholders, or omitted sections.
- Never import a package absent from `package.json` without first proving the dependency change is required and documenting it.
- Do not delete, reorder, or alter unrelated code.
- Preserve surrounding behavior unless the change is explicitly required by the diagnosed root cause.
- Scope every PR to one coherent problem/phase.
- Prefer the smallest change that restores the verified contract.

## 4. Mandatory pre-flight audit

Before code changes, verify:

- required dependencies exist;
- relevant architecture and contracts were read;
- no existing module already owns the responsibility;
- external HTTP calls are outside database transactions;
- authentication is server-side and TMA-compatible;
- sensitive input is validated reject-by-default;
- secrets are environment variables;
- new environment variables are documented in `.env.example` when applicable;
- the intended test and CI gates are known.

## 5. Telegram Mini App security

- Telegram `initData` MUST be authenticated server-side using the repository's established HMAC-SHA256 verification implementation.
- `auth_date` MUST be validated according to the repository's current security contract; the default maximum age is 86,400 seconds unless a stricter existing rule applies.
- Do not rely solely on third-party cookies in Telegram WebViews.
- Sensitive endpoints MUST use the repository's established Bearer-token/initData authentication mechanism.
- Never trust client-supplied identity, balance, reward, eligibility, verification, campaign price, or authorization state.
- Protected resources MUST enforce ownership/authorization server-side.
- Never hardcode secrets, tokens, JWT secrets, provider keys, or credentials.

## 6. IDOR and input validation

Every protected resource must verify that the authenticated principal owns or is authorized to access it.

Examples of untrusted input include:
- `user_id`
- `taskId`
- reward amounts
- campaign prices
- referral identifiers
- verification results
- provider callbacks

Unknown fields MUST be rejected where the endpoint contract requires strict input.

## 7. Architecture layers

The required layering is:

```text
HTTP Controller / Express Handler
        ↓
Service Layer
        ↓
Repository / DB Model
```

Repository architecture remains authoritative:

```text
public/                 presentation only
src/http/               authentication, validation, transport
src/services/           business rules and transactions
src/db/                 database infrastructure
migrations/             append-only schema evolution
scripts/                repeatable verification/maintenance
```

- No raw SQL business logic in `server.js` or HTTP controllers.
- No financial mutation in controllers.
- Services must not depend on browser state.
- Do not create duplicate domain services for an existing responsibility.

## 8. Single Source of Truth

There MUST NOT be a second independent implementation of:

- Economy
- Ledger
- Rewards
- Task Catalog
- Task Execution
- Task Verification
- Referral
- Squad
- configuration
- eligibility/cooldown authority

Reuse existing primitives unless the repository proves a genuinely different responsibility exists.

## 9. Financial integrity / transactions

NEVER perform network/HTTP/external-provider calls inside a database transaction.

Required sequence:

```text
External Verification / HTTP
        ↓
BEGIN
        ↓
SELECT ... FOR UPDATE where required
        ↓
Idempotency check
        ↓
Ledger / Balance mutation
        ↓
Explicit audit
        ↓
COMMIT
```

If database operations fail, explicitly `ROLLBACK`. Never swallow transaction errors.

Every externally repeatable reward, settlement, or balance mutation MUST use a strict idempotency key. The default retention target is 30 days unless the repository has a stricter domain rule.

Historical ledger records are immutable.

## 10. Economy

- All balance movements MUST use the existing atomic Economy/Ledger primitives.
- Every reward has one immutable economic source.
- Referral, Squad, Reward Pool, task rewards, and campaign economics remain distinct according to the existing architecture.
- A modifier is never silently converted into a second reward source.
- Never trust reward values supplied by the client.

## 11. Database and migrations

- Migrations are append-only once they may have reached an environment.
- Never edit/delete a deployed migration to hide an architectural mistake.
- Correct obsolete schema with a new explicit migration.
- Every migration must work through the canonical migration runner.
- Never create compatibility tables/aliases without documented, time-bounded justification.

## 12. Task architecture

The canonical task flow is:

```text
Task Catalog
   ↓
Task Execution
   ↓
Verification
   ↓
Reward through existing Economy/Ledger
```

Do not invent `Task Service`, `Verification Service`, or `Reward Service` duplicates when existing responsibilities already exist.

Task verification MUST be server-side, replay-safe, and idempotent. A client-side event alone is never sufficient proof for a reward.

Provider callbacks must be real, authenticated, and replay-safe before they can authorize rewards.

## 13. Verification Advertisement boundary

The DzMoney verification-ad gate is an internal DzMoney mechanism.

It is NOT a Creator-controlled task duration and NOT a task-provider duration.

```text
User completes task
        ↓
DzMoney verification-ad gate
        ↓
Ad provider presents advertisement
        ↓
Provider controls actual advertisement presentation/duration
        ↓
Verification continues
```

Do not introduce a Creator/provider-controlled `verification_ad_duration` rule unless repository evidence proves a different existing meaning.

## 14. Share with Friends contract

Share with Friends uses **Click Proof**, not proof that Telegram actually completed an external share.

The system MUST NOT claim that a Telegram share was successfully completed when only a client click/open event is known.

The existing authenticated user identity, canonical referral link, task attempt, verification gate, and Economy/Ledger paths must be reused.

Do not create:
- a second referral source;
- a Share database/table solely to duplicate existing state;
- a new Economy or Ledger;
- a fake Telegram share verifier;
- a duplicate reward service.

Eligibility is server-side and is once per calendar day using **UTC+1**. It is not a rolling 24-hour timer.

```text
UTC+1 00:00
    ↓
new calendar day
    ↓
eligibility may reset
```

The client MUST NOT be the source of truth for the day boundary.

## 15. Creator campaign pricing

The administrator controls the campaign price through the existing campaign configuration/management architecture.

`9 DZ` is an initial/default price, not an immutable universal price, unless the repository explicitly proves otherwise.

Never hardcode the default as an unchangeable business invariant when Admin configuration is the established source of truth.

## 16. Daily systems

Daily Check-in, Daily View Ads, and other daily tasks must use their existing server-side eligibility/idempotency architecture.

Do not introduce a parallel cooldown or eligibility engine.

When a daily feature is explicitly deferred by the roadmap, do not prematurely implement production behavior merely because the UI exposes a placeholder.

## 17. Logging and error handling

- No `console.log` in production code when the repository provides structured logging.
- Use the repository's established structured logger.
- Include correlation/request identifiers when the existing logging contract requires them.
- Never expose stack traces, SQL, environment variables, secrets, or internal implementation errors to clients.
- Respect existing timeout contracts; external calls should use the repository's configured provider timeout and must not run inside DB transactions.

## 18. TDD and testing

For a new behavior or bug fix:

```text
Reproduce / failing test
        ↓
Root-cause diagnosis
        ↓
Minimal fix
        ↓
Focused tests
        ↓
Integration tests
        ↓
Full required suite
        ↓
CI
```

Do not change production code merely to make a stale test pass. First establish whether the test or production contract is wrong from code, history, ADRs, and domain contracts.

Existing baseline gates must not be weakened. New subsystems must add focused invariants.

## 19. CI and merge gate

`mergeable`, `Ready to merge`, or a green-looking GitHub button is NOT equivalent to CI proof.

Before merge, validate the **exact PR HEAD** against the required workflow(s).

A CI run on `main` cannot be used as proof for a different PR HEAD.

Required gate:

```text
Exact PR HEAD
   ↓
Exact workflow run
   ↓
Migrations
   ↓
Focused tests
   ↓
Existing full suite
   ↓
Economy reconciliation
   ↓
Security/invariant checks
   ↓
GREEN
   ↓
Final diff audit
   ↓
Merge
```

If CI fails, identify the exact failing job/assertion and trace it to the relevant production contract before changing code.

## 20. Post-merge verification

After every merge:

```text
PR merged
   ↓
Confirm merge commit
   ↓
Confirm main HEAD
   ↓
Inspect post-merge CI
   ↓
Verify migrations/tests/reconciliation/runtime as applicable
   ↓
Only then continue the roadmap
```

Never assume `main` is healthy merely because a PR merged.

## 21. Git workflow

Normal feature/fix work uses:

```text
feature/<name>
fix/<name>
chore/<name>
docs/<name>
```

Preferred flow:

```text
TDD
 ↓
Implementation
 ↓
Focused tests
 ↓
Integration/full CI
 ↓
Diff audit
 ↓
PR
 ↓
Review
 ↓
Merge
 ↓
Post-merge verification
```

Do not modify `main` directly when the repository workflow requires a PR.

## 22. Scope control

Every change must answer:

1. Which phase owns it?
2. Which existing module owns the behavior?
3. Is a new table/service/route actually required?
4. Which invariant prevents duplicate/conflicting state?
5. Which tests prove the behavior?
6. Does implementation status remain truthful?

If an answer is unclear, stop before adding the feature.

## 23. AI execution protocol

Every AI agent working on DzMoney MUST:

1. Read `docs/CONSTITUTION_54.md` first.
2. Read relevant project contracts and architecture rules.
3. Inspect current GitHub state before changing anything.
4. Establish the last validated point from commits/PRs/CI/docs.
5. Build a verified plan before implementation.
6. Never fabricate missing information.
7. Never provide partial implementation when a complete artifact is required.
8. Never silently weaken a test or invariant.
9. Never merge without the required exact-HEAD CI gate.
10. Record material architectural decisions in an ADR when required by the repository.
11. Keep implementation status synchronized with validated state.
12. At the end of each phase, report evidence, not assumptions.

## 24. Stop conditions

An AI agent may stop and ask the user only when:

- required repository evidence genuinely does not exist after reasonable inspection;
- an external permission/access capability is unavailable;
- a business/product decision cannot be inferred from the repository's authoritative sources.

The agent MUST state what it inspected, what is missing, and why that missing fact blocks safe continuation.

## 25. Non-negotiable rule

**No guessing. No architectural duplication. No client authority over sensitive state. No financial mutation without idempotency and transactional integrity. No fake verification. No merge without exact-HEAD CI evidence.**

This Constitution is mandatory project governance for AI-assisted development of DzMoney.
