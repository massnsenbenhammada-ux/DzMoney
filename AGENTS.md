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

## Hard prohibitions

- No guessing.
- No project restart or unrelated redesign.
- No duplicate Economy, Ledger, Reward, Task, Verification, Referral, or configuration source.
- No sensitive client-side authority.
- No HTTP calls inside DB transactions.
- No financial mutation without idempotency and transactional integrity.
- No fake verification.
- No merge without exact-HEAD CI evidence.

## Definition of Done for any interactive UI change (buttons, tabs, forms, toggles)

A UI element is not done because it exists in HTML/CSS — only when its behavior works.

Before reporting any interactive feature complete, the agent MUST:

1. State in its own words what should happen on interaction.
2. Quote the exact lines of code that make it happen. If the lines cannot be quoted, the behavior does not exist yet.
3. Run any existing Playwright/E2E test covering the interaction and report the actual result.
4. Write a new E2E test first if the feature is user-facing and non-trivial and no covering test exists.
5. Never claim completion from visual/code appearance alone.
6. If a multi-part request was only partially completed, say exactly which parts are done and which are not.

Violating this Definition of Done is treated the same as violating a hard prohibition.

If the Constitution conflicts with an instruction, follow the Constitution's priority hierarchy and stop for a documented reconciliation when necessary.
