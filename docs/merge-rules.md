# Merge rules

Read by the merge owner session before the first gate. Source: GitHub settings, read 2026-11-24.

- **Review rules:** none. `main` has no branch protection and no rulesets. A push to a PR dismisses nothing.
- **Merge method:** merge commit (`gh pr merge <N> --merge`), for every branch.
- **Together check:** `pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test`.
  On the private archive the CI job skips, so `gh pr checks` reports skipped checks and gate 2 passes
  with nothing run. On the public repository, CI runs lint, type check, test and build on every push
  to a branch other than `main` and on pull requests from forks, and gate 2 reads those checks. Gate 4
  always runs the together check locally on the merged tree, even when the branch is up to date.
- **Repo gates:** none.
- **Post-merge run:** none. A push to `main` starts no workflow.
