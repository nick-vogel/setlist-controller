# Merge rules

Read by the merge owner session before the first gate. Source: GitHub settings of the public repository, read
2026-11-25.

- **Review rules:** the ruleset "main: pull requests with green CI only" on `main`: no deletion, no force push, every
  change through a pull request merged with a merge commit, review threads resolved, and the "Lint, type check, test
  and build" check from GitHub Actions green. No approval is required, and nobody bypasses it, so a change to this file
  also comes in by a pull request. A push to a PR dismisses any approval it has.
- **Merge method:** merge commit (`gh pr merge <N> --merge`), for every branch.
- **Together check:** `pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test`.
  On the private archive the CI job skips, so `gh pr checks` reports skipped checks and gate 2 passes
  with nothing run. On the public repository, CI runs lint, type check, test and build on every push
  to a branch other than `main` and on pull requests from forks, and gate 2 reads those checks. Gate 4
  always runs the together check locally on the merged tree, even when the branch is up to date.
- **Repo gates:** the private terms check (`.claude/rules/public-repository.md`), on every PR before its merge:
  `pnpm check:private --range origin/main..<head sha>`, then the PR's title and body through
  `pnpm check:private --stdin`. Either one failing sends the PR back to its session. Where the check notes that it
  found no private terms file, stop and tell Nick: on this Mac the file must exist.
- **Post-merge run:** none. A push to `main` starts no workflow.
