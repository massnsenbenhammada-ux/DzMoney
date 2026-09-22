# DzMoney — CI Tooling Known Limitations

## Post-merge GitHub Actions lookup

For post-merge verification on `main`, an empty result from the repository's SHA-direct `fetch_commit_workflow_runs` lookup is **not** evidence that post-merge CI did not run.

That lookup is currently scoped to pull-request-triggered workflow runs. A merge to `main` can instead produce `push`-triggered workflow runs whose `head_sha` is the merge commit.

### Required verification path

1. Identify the exact `main` merge SHA.
2. Query GitHub Actions for runs on `branch=main` with `event=push` around the merge time.
3. Correlate each returned run's `head_sha` with the exact merge SHA.
4. When necessary, use the Check Runs API for the exact SHA to enumerate all workflow checks and their conclusions.
5. Only then conclude whether post-merge CI evidence exists.

This limitation has produced false "no post-merge CI evidence" conclusions in this repository for PR #344, PR #349, and PR #360. The branch/push Actions path resolved all three cases.

This note documents a tooling/query limitation; it does not change repository CI policy. Exact-HEAD and post-merge verification remain mandatory.
