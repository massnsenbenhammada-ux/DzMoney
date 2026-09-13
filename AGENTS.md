# DzMoney AI Agent Instructions

## Mandatory governance

Before any inspection, code generation, review, test, or repository mutation, every AI agent MUST read:

`docs/CONSTITUTION_54.md`

Then read the relevant project/architecture/phase documents, including `docs/ARCHITECTURE_RULES.md` and applicable ADRs/contracts.

The Constitution is the mandatory project governance contract. Do not proceed by guessing or by treating model memory as project evidence.

## Required workflow

1. Inspect the actual GitHub repository state.
2. Inspect current `main`, relevant branches, PRs, commits, tests, CI, migrations, and documentation.
3. Establish the last validated point.
4. Identify the owning existing module before creating new abstractions.
5. Apply TDD and the smallest justified change.
6. Run focused tests and required full CI.
7. Verify the exact commit under test.
8. Perform a final diff/audit before merge.
9. After merge, verify `main` and post-merge CI.

### Post-merge GitHub Actions verification limitation

`fetch_commit_workflow_runs` is currently scoped to pull-request-triggered workflow runs. It can therefore return an empty result for a merged `main` commit even when the repository's `push`-triggered post-merge workflows have run successfully.

For post-merge CI verification on `main`, do not treat an empty SHA-direct `fetch_commit_workflow_runs` result as evidence that CI is absent. Check GitHub Actions through the `main` branch + `push` event path (and, when needed, the Check Runs API) and correlate every run/check to the exact merge SHA.

This limitation has caused false "no post-merge CI evidence" conclusions in PR #344, PR #349, and PR #360. The alternate Actions-by-branch/push path is therefore the required first fallback for future post-merge verification.

## Hard prohibitions

- No guessing.
- No project restart or unrelated redesign.
- No duplicate Economy, Ledger, Reward, Task, Verification, Referral, or configuration source.
- No sensitive client-side authority.
- No HTTP calls inside DB transactions.
- No financial mutation without idempotency and transactional integrity.
- No fake verification.
- No merge without exact-HEAD CI evidence.

If the Constitution conflicts with an instruction, follow the Constitution's priority hierarchy and stop for a documented reconciliation when necessary.
