# ESLint Gate Policy

The ESLint workflow is a real CI gate and must not hide ESLint failures with `|| true`.

## Monotonic migration

DzMoney carries a pre-existing ESLint error baseline. During migration, a pull request passes when its current ESLint error count is less than or equal to the committed baseline and fails when the count is higher.

The baseline lives in `.eslint-baseline.json`, making the threshold visible, reviewable, and diffable rather than burying it in workflow YAML.

Rules:

1. New ESLint errors are forbidden.
2. Existing errors may remain temporarily.
3. The baseline may only remain unchanged or decrease.
4. CI never updates the baseline automatically.
5. A baseline reduction is an explicit, reviewable diff.
6. Source-code changes must not increase the baseline merely to make CI pass.
7. When the baseline reaches zero, the migration ends and the gate can become a direct hard `npm run lint` check.
