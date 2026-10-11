# Insights — server/modules/ci

Knowledge you can't see in the code. Newest entry on top of each section.
Format and rules: `.claude/skills/engineering-insights/SKILL.md`.

## What Works

## What Doesn't Work

- **2026-10-11 · Blocklist and substring checks on an edited GitHub workflow are bypassable; validate it as an allowlist** — The first `validateEditedWorkflow` rejected only `pull_request_target`, matched the same-repo guard with `includes()` and checked only `steps[].uses`. A review accepted all of these: `if: always() || <guard>`, `!(<guard>)`, an extra `workflow_run` event, a job-level `uses: evil/…@main` with `secrets: inherit`, `container: evil/img:latest`, `Actions/checkout@<sha>` (GitHub resolves owner names case-insensitively) pointing at the head SHA, `${{ github.event.pull_request.head.sha }}` in `run:` or in an env var, and a base checkout in job A with the runner in job B. `on: pull_request` (a string) crashed `patchWorkflow` with a 500. Instead, allow only: `on` = a mapping with only `pull_request`; `if` equal to the guard exactly; no job `uses`/`container`/`services`; only the `${{ }}` expressions the generator itself emits; no YAML aliases; base checkout before the runner step in the same job. Treat it as a guard-rail for a human-reviewed PR, not a sandbox: a fixed `run:` can still read `$GITHUB_EVENT_PATH`.
  Where: `server/src/modules/ci/domain.ts` (`validateEditedWorkflow`)


## Codebase Patterns

- **2026-10-11 · `onConflictDoUpdate({ setWhere })` is the race-safe "update only if it is mine" guard for one-agent-per-repo** — With the unique index on `(workspace_id, repo)`, an upsert whose `setWhere` requires `agent_id = <this agent>` returns zero rows when another agent's installation holds the repo, even if it was inserted a moment earlier by a concurrent request. The repository maps zero rows to the 409 `ci_repo_has_other_agent`. Do not replace it with a read-then-write check alone: that one is only the fast path before any GitHub call.
  Where: `server/src/modules/ci/repository.ts:107` (`setWhere`)

- **2026-10-11 · `CiRun.verdict` is derived on read, not stored** — neither `agent_runs` nor `ci_runs` has a verdict column. `verdictFor` recomputes it from the stored counts (blockers > 0 → `request_changes`, findings > 0 → `comment`, else `approve`, `failed` → null), which mirrors the runner's deterministic gate. To show the runner's exact value, add a column in a generated migration and store the artifact's `verdict`.
  Where: `server/src/modules/ci/helpers.ts:317` (`verdictFor`)

- **2026-10-11 · The export PR runs its own workflow and fails, because the job checks out the base commit** — A `pull_request` workflow added by a PR runs on that same PR. The job checks out the base SHA, where `.devdigest/` does not exist yet, so the runner hard-fails with exit 1 and writes no artifact. Untreated, ingest would store a `failed` run and flip a `pr_open` installation to `active` before merge. Instead: ingest skips every workflow run whose head branch is `devdigest/ci` (SPEC-05, user decision 2026-10-11).
  Where: `agent-runner/src/run.ts:187` (hard-fail catch, `artifact: null`)

- **2026-10-11 · The runner accepts exactly one agent manifest, so one repo holds one agent** — `.devdigest/agents/` with two `.yaml` files makes every CI run exit 1. A second agent exported into the same repo, or a renamed agent whose old manifest is left behind (`commitFiles` never deletes), breaks CI. SPEC-05 answers 409 for a second agent and deletes stale generated files in the install commit.
  Where: `agent-runner/src/manifest.ts:40` (`yamlFiles.length > 1`)

- **2026-10-11 · `commitFiles` force-moves an existing branch, so re-installing on `devdigest/ci` silently drops foreign commits** — `commitFiles` creates or updates the branch ref with `force: true`. Any caller must first confirm the branch holds only DevDigest-authored commits (SPEC-05 refuses otherwise), or a teammate's fix on `devdigest/ci` is lost.
  Where: `server/src/adapters/github/octokit.ts:373` (`force: true`)

- **2026-10-11 · Pre-SPEC-05 `ci_installations` / `ci_runs` tables have no `workspace_id`** — they predate the module and break the "every domain table carries `workspace_id`" rule; SPEC-05 needs a generated migration, not a build on top of them.
  Where: `server/src/db/schema/ci.ts:4`

- **2026-10-11 · A PR that edits `.devdigest/**` or `.github/workflows/**` is never reviewed by the CI agent** — the workflow checks out the base SHA and the runner strips those paths from the diff (fixes a 422). Tampering is guarded only by branch protection + CODEOWNERS.
  Where: `agent-runner/src/diff.ts:21`

## Tool & Library Notes

- **2026-10-11 · `MockGitHubClient.listWorkflowRuns` ignores the repo, and ingest refreshes every installation in the workspace** — With two installations, both get the same fixture runs, so a test that seeds runs for one repo sees them attributed twice. Ingest tests use a per-repo subclass (`RepoRunsGitHub` in `server/test/ci.it.test.ts`) and clear `ci_runs`, source-`ci` `agent_runs` and `ci_installations` in `beforeEach`. Without that, rows from other tests leak into a `GET /ci-runs` assertion.
  Where: `server/src/adapters/mocks.ts:287` (`listWorkflowRuns`)

## Open Questions

## Session Notes
