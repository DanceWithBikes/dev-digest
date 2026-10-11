# modules/ci — Export to CI, CI installations, CI run ingest

Status: implemented (SPEC-05, `docs/specs/export-to-ci.md`; this module's part: `docs/specs/export-to-ci.md`).

- Generates the CI bundle for an agent (manifest, skills, `.devdigest/memory.jsonl`, `.github/workflows/devdigest-review.yml`, the bundled `agent-runner` and its `package.json`) and either opens it as a PR on the `devdigest/ci` branch or returns a zip. It never writes to the default branch and never calls a model.
- Ingest is PULL: on every `GET /ci-runs` the server downloads `devdigest-result.json` through the GitHub API and verifies repo / repository id / head SHA / PR / installation id against GitHub's own run metadata before writing `agent_runs` with `source='ci'` (plus a `ci_runs` side row).
- Out of scope: the multi-run service and the PR feed (`modules/pulls`) — a CI run is counted in a PR's feed COST by the existing totals, with no change there.

## Files
- `constants.ts` — branch, paths, limits (64 KB artifact, 5 MB runner, 50 runs per page), pinned action SHAs, the same-repo guard. `domain.ts` — types + pure rules (`validateEditedWorkflow`, `patchWorkflow`, `validateEdits`, `stalePaths`, `shouldIngest`, `verifyArtifact`, `statusFor`, `isBehind`).
- `helpers.ts` — slugs, manifest / memory / workflow / bundle generation, zip writer and reader (`node:zlib`), DTO mappers, `verdictFor`. `ports.ts` — consumer-owned ports (`CiStore`, `CiGitHub`, `AgentSource`, runner-bundle reader).
- `service.ts` — `CiService`: preview, export (PR or zip), installations list, runs list. `ingest.ts` — `CiIngest`: list runs, download, verify, record, move the installation state. `repository.ts` — Drizzle (`ci_installations`, `ci_runs`, `agent_runs`). `routes.ts` — the four routes. `compose.ts` — the only file that sees the `Container`.

## Routes
- `GET /agents/:id/export-ci/preview` (`CiPreviewQuery` → `CiPreview`) · `POST /agents/:id/export-ci` (`CiExportInput` → `CiExportResult`) · `GET /agents/:id/ci-installations` (→ `CiInstallation[]`) · `GET /ci-runs` (`CiRunsQuery` → `CiRunsPage`).
- Validation failures are 422 (house convention); a repo already installed by another agent is 409 `ci_repo_has_other_agent`; a foreign commit on `devdigest/ci` is 409 `ci_branch_foreign_commit`; a 403/404 from GitHub on a write is 403 `github_write_denied`.

## Rules
- **Edited workflows are validated as an allowlist, never a blocklist.** `validateEditedWorkflow` accepts only what `buildWorkflowYaml` emits: `on` is a mapping with only `pull_request`; top-level and job `permissions` are exactly `contents: read` + `pull-requests: write`; each job's `if` equals the same-repo guard exactly; no job `uses` / `container` / `services` (only the keys in `ALLOWED_JOB_KEYS`); every `uses:` pinned to a 40-hex SHA; the `actions/checkout` step checks out the base SHA with no `repository`; no YAML aliases; only the `${{ }}` expressions in `ALLOWED_EXPRESSIONS`; one job checks out the base commit and then runs `node .devdigest/runner/index.js`. After validation `patchWorkflow` re-applies the Configure choices (`on.pull_request.types`, `DEVDIGEST_POST_AS`, `DEVDIGEST_INSTALLATION_ID`) and the result is validated again. Only the workflow and skill files are editable; any other path in `edits` is a 422.
- **One agent per repo.** The runner accepts exactly one manifest, and `ci_installations` is unique on `(workspace_id, repo)`. A second agent gets 409 in both modes before any GitHub write; the race is closed by `setWhere` in `CiRepository.upsertInstallation`. Every PR install deletes the generated-kind `.devdigest/agents/*.yaml` and `.devdigest/skills/*.md` files it no longer contains (`stalePaths`).
- **The runner bundle is built by hand.** It is read from `agent-runner/dist/index.js` (`DEVDIGEST_RUNNER_BUNDLE_PATH` overrides), is git-ignored and never committed. Build it first: `cd agent-runner && pnpm build`. A missing bundle fails preview and install with that instruction; the API never builds it.
- **An artifact is untrusted.** Reject it (one `warn` line, no body, no token) when it is over 64 KB (checked on the declared size and again while inflating), fails `CiResultArtifact`, or mismatches GitHub's run metadata or the installation. Runs whose head branch is `devdigest/ci` and runs that concluded `skipped` store nothing.
- **A re-install never regresses an `active` installation to `pr_open`** (`CASE` in `CiRepository.upsertInstallation`).

## Gotchas
- GitHub for this module comes from `container.ciGithub()`; `DEVDIGEST_CI_GITHUB_MOCK=true` (ignored in production) swaps in the in-memory mock for the hermetic e2e stack only. The global `github()` is unchanged.
- The run `verdict` is not stored: it is derived from status / blockers / findings (`verdictFor`).
- `commitFiles` force-moves an existing branch, so `CiService.openPr` runs `compareCommits` first and refuses a foreign commit.

Docs: ../../../../docs/specs/export-to-ci.md · docs/specs/ · docs/insights.md
