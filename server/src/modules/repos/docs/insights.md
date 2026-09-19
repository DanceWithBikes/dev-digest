# Insights — server/modules/repos

Knowledge you can't see in the code. Newest entry on top of each section.
Format and rules: `.claude/skills/engineering-insights/SKILL.md`.

## What Works

## What Doesn't Work

## Codebase Patterns

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

## Open Questions

- **2026-09-19 · Repo URL parsing rejects valid repos and accepts wrong hosts** — the SSH form `git@github.com:o/r.git` is handled by the regex and `withGitHubToken` but rejected earlier by `RepoInput.url = z.string().url()` (422); names containing `.` (`foo.js`) fail `[^/.]+` (400); `github\.com` isn't anchored to the host, so `https://notgithub.com/o/r` is accepted; dedupe on `fullName` is case-sensitive.
  Where: `constants.ts:18` (`GITHUB_URL_REGEX`), `server/src/vendor/shared/contracts/platform.ts:137` (`RepoInput.url`), `repository.ts:28` (`eq(fullName)`)

- **2026-09-19 · `POST /repos/:id/refresh` doesn't advance the code** — an existing clone only gets `git fetch`, so HEAD never moves and the follow-up `repo-intel-refresh` ends on `sha_unchanged`. Only `POST /repos/:id/resync` (repo-intel) runs `reset --hard`. And `default_branch` is always `main` (never read from GitHub), so resync on a `master` repo degrades to `sync_failed`. Instead, today: use resync, not refresh, to pull new commits.
  Where: `server/src/adapters/git/simple-git.ts:59` (fetch-only branch), `server/src/adapters/git/simple-git.ts:86` (`reset --hard` in `sync`), `server/src/modules/repo-intel/pipeline/incremental.ts:97` (`sha_unchanged`), `repository.ts:44` (no `defaultBranch` set)

- **2026-09-19 · The GitHub token is persisted in each clone's `.git/config`** — the token-embedded URL goes to `git clone`, and git stores it as `remote.origin.url`, so the PAT sits in plaintext under the clone dir and later fetches keep using the old token after rotation. Delete also leaves the clone on disk. Open: clone with a credential helper / `http.extraHeader` instead?
  Where: `service.ts:54` (token URL passed to clone), `service.ts:141` (`remove` deletes only the row)
