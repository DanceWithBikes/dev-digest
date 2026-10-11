# Implementation Plan: Export to CI (SPEC-05)

## Blocking

One spec conflict blocks part of two criteria. It needs a `spec-creator` decision before Step 9 ships that path.

- **B-1 — A workflow edited in Preview vs. the triggers and post-as mode chosen later in Configure (AC-19, AC-28 vs AC-37, AC-94).** The wizard order is fixed as 1 Target · 2 Preview · 3 Configure · 4 Install (AC-88). So the user can edit `.github/workflows/devdigest-review.yml` in step 2 and *then* change the trigger chips or "Post results as" in step 3. AC-37 and AC-94 say the edited file is committed as edited. AC-19 and AC-28 say the committed workflow has exactly the triggers and post-as mode chosen in the wizard. Both cannot hold when the edits and the choices disagree. The spec does not say which wins: reject, overwrite the edit's `on:`/`env`, or regenerate the preview after Configure. This plan covers AC-19 and AC-28 fully for an **unedited** workflow, which is regenerated at install time from the Configure choices. For an **edited** workflow it commits the edit as submitted (the literal AC-37 behaviour). In that case AC-19 and AC-28 are marked **partially uncovered**. → route to `spec-creator` to update SPEC-05.

## Goal

A repo owner opens an agent's new **CI** tab and clicks "+ Add to CI". A four-step wizard (Target → Preview → Configure → Install) produces a reviewed bundle: agent manifest, skills, memory file, a least-privilege GitHub Actions workflow and the prebuilt `agent-runner` bundle. The wizard either opens or updates a PR on the `devdigest/ci` branch of an imported repo, or downloads the bundle as a zip. It never writes to any other branch. The installed workflow reviews same-repo PRs from the base checkout. The runner writes a richer `devdigest-result.json`. The server pulls that artifact through the GitHub API and verifies it against GitHub's own run metadata before it records a `source='ci'` agent run. A new **CI Runs** page lists those runs with repo, PR, agent, verdict, findings, cost, duration and job link. The CI tab lists installations with their state and shows which ones are behind.

## Requirements

- Source: `docs/specs/export-to-ci.md`, Spec ID SPEC-05, Status: approved (2026-10-11). Parts, all `Status: approved`: `server/docs/specs/export-to-ci.md`, `server/src/modules/ci/docs/specs/export-to-ci.md`, `client/docs/specs/export-to-ci.md`, `agent-runner/docs/specs/export-to-ci.md`, `e2e/docs/specs/export-to-ci.md`.
- Gate check: every part says `Status: approved`. No `[NEEDS CLARIFICATION` marker appears in any of the six files. OQ-1, OQ-2 and OQ-3 are closed (`docs/specs/export-to-ci.md:357-359`).
- Covered: AC-1 to AC-132 and NFR-1 to NFR-9. AC-19 and AC-28 are partially uncovered (B-1). AC-126 to AC-130 are manual verification by the user.

## Spec conflicts found while planning

None of these block a criterion's literal text. Each one produces user-visible behaviour the spec probably did not intend. The plan implements the literal criteria. → route each to `spec-creator`.

- **SC-1 — The export PR triggers its own workflow, which flips the installation to `active` before merge (AC-62 vs AC-63).** The workflow file arrives in the PR's merge commit, so opening the `devdigest/ci` PR runs it. The job checks out the **base** commit (AC-22), where `.devdigest/runner/index.js` does not exist yet. The step fails and no artifact is written. AC-61 then stores a `failed` run for the export PR. AC-62 then sets a `pr_open` installation to `active` before anything was merged, which defeats AC-63/AC-64's merge semantics, and the export PR also shows a red check. Evidence: `agent-runner/src/manifest.ts:32-34` (missing `.devdigest/agents` → `RunnerError`), `agent-runner/src/run.ts:167-172` (hard-fail, no artifact). → route to spec-creator (see Recommendation 3).
- **SC-2 — Two agents on one repo, or a renamed agent, break the runner (AC-8, AC-45).** The runner accepts exactly one manifest: `agent-runner/src/manifest.ts:40-43` throws on more than one `.yaml`. A second agent exported to the same repo commits `.devdigest/agents/<slug2>.yaml` next to the first. The fixed workflow path `.github/workflows/devdigest-review.yml` (AC-8) is overwritten with the second installation id. `commitFiles` layers on the parent tree (`server/src/adapters/github/octokit.ts:331-342`) and never deletes, so a renamed agent leaves its old manifest behind. Both cases make every CI run exit 1. Ingest also lists the same workflow runs for both installations, which would attribute one run to two agents (AC-54 is per installation). The upstream branch hit the same problem (commit `2643a31`, "prune stale generated files", on `remotes/upstream/full-functionality`). → route to spec-creator.
- **SC-3 — "Skill slug" is not a stored field, and two skills can collide (AC-8, AC-16).** `skills` has no slug column (`server/src/db/schema/skills.ts:17-33`), and neither does `agents`. The plan derives a slug from the name (see Open questions). Two skills whose names derive to the same slug would produce one path for two files, which breaks AC-8's "one file per skill". The plan rejects that case with 400 naming both skills, the same way AC-16 rejects a bad slug. Confirm, or specify the slug. → route to spec-creator.
- **SC-4 — AC-125 assumes the hermetic stack can use the mock GitHub client. Today it cannot.** `scripts/e2e.sh:137` boots `src/server.ts` → `buildApp({ config })` with no overrides (`server/src/server.ts:7`). The container builds a real `OctokitGitHubClient` or throws `ConfigError` (`server/src/platform/container.ts:196-202`). A **global** mock switch would also break flows 05/08/13: `PullsService.detail` refetches the PR from GitHub and calls `replaceFiles` (`server/src/modules/pulls/service.ts:113-130`). The mock's `getPullRequest` returns one fixture file (`server/src/adapters/mocks.ts:165-190`). The plan adds a mock switch **scoped to the ci module only** (Step 5). This is infrastructure, not behaviour. It is listed so the user knows a test-only switch is being added.

## Recommendations

1. **Return 422 for request-validation errors, matching the house convention, or accept a per-route 400.**
   - **Why:** AC-16, AC-18, AC-20, AC-32 to AC-35 and AC-131 say 400. The global error handler maps every route-schema failure to 422 (`server/src/app.ts:128-129`), and `ValidationError` is 422 (`server/src/platform/errors.ts:25-29`).
   - **Trade-off:** as planned, the ci routes use Fastify's `attachValidation: true` and throw a new `BadRequestError` (400) (Step 6, Step 11). That means two validation status codes in one API.
   - **Affects:** AC-16, AC-18, AC-20, AC-32 to AC-35, AC-131; Steps 6 and 11. **Planned as the spec says (400)** unless the user moves the spec to 422.
2. **Use content hashes, not package versions, for the runner version.**
   - **Why:** AC-44 and AC-78 need a runner version. The only one in the code is the constant `RUNNER_VERSION = '1'` in `agent-runner/src/artifact.ts:6`, which the server cannot import (no tsconfig alias, and `agent-runner/package.json` is `0.0.0`). The adapter reports the first 12 hex characters of the bundle's sha256.
   - **Trade-off:** the label reads "runner 3f9a2c1d0b7e" rather than "runner 1", but it changes whenever the shipped bundle changes.
   - **Affects:** AC-4, AC-44, AC-71, AC-78; Step 5. **Planned this way.**
3. **Have ingest skip workflow runs whose `head_branch` is `devdigest/ci` (fixes SC-1).**
   - **Why:** SC-1.
   - **Trade-off:** none for real PRs. It is new behaviour the spec does not state.
   - **Affects:** AC-61, AC-62; Step 10. **Not planned** until the user accepts it.
4. **Have ingest require `artifact.installation_id === installation.id` (mitigates SC-2's double attribution).**
   - **Why:** AC-29 and AC-120 already carry the id end to end, but AC-51 does not list it among the verified fields.
   - **Trade-off:** old bundles without the field already fail AC-51. This adds one more check.
   - **Affects:** AC-51, AC-54, AC-70; Step 7 (`verifyArtifact`). **Not planned** until accepted.
5. **Zip the bundle with `node:zlib` instead of a new dependency.**
   - **Why:** the skills module already ships a hand-written zip reader on `node:zlib` (`server/src/modules/skills/helpers.ts:1`, `:22-24`, `:377`). It is pure in dependency-cruiser's eyes, because `zlib` is not in `IO_BUILTINS` (`server/.dependency-cruiser.cjs:22`). The module may not import the skills module (`server/.dependency-cruiser.cjs:120-128`), so the ci module gets its own small writer (stored/deflate + CRC-32) and a one-entry reader whose `maxOutputLength` enforces AC-132.
   - **Trade-off:** about 120 lines of zip code to own. The only new dependency is `yaml` (Risks).
   - **Affects:** AC-46, AC-49, AC-132; Step 7. **Planned this way.**
6. **Return the zip as base64 inside JSON rather than as an `application/zip` stream.**
   - **Why:** `apiFetch` only parses JSON (`client/src/lib/api.ts:21-63`). A zod response schema keeps both install modes typed through one route.
   - **Trade-off:** about 33 % payload inflation on a ≤5 MB bundle.
   - **Affects:** AC-46, AC-106; Steps 1, 9, 13. **Planned this way.**

## Constraints that shape this plan

| Constraint | Source | What it forces |
|---|---|---|
| Only `repository.ts` touches drizzle / `src/db/**`, including `import type` | `server/.dependency-cruiser.cjs:39-48` | The ci domain types live in `domain.ts`. Row types never leave `repository.ts`. `agent_runs` and `ci_runs` writes go there. |
| Routes talk only to services; services take ports, not the `Container` | `server/.dependency-cruiser.cjs:28-36`, `:75-87`; `server/src/modules/AGENTS.md` | `CiService` and `CiIngest` take a deps object. Only `compose.ts` and `routes.ts` see the container. |
| No cross-module imports | `server/.dependency-cruiser.cjs:120-128` | Agent data comes via `container.agentsRepo` (`getById` `server/src/modules/agents/repository.ts:65`, `linkedSkills` `:192`). The skills zip reader is re-implemented, not imported. |
| Modules never import adapters, and the application ring has no direct I/O (`octokit`, `fs`) | `server/.dependency-cruiser.cjs:66-74`, `:88-96` | The runner bundle is read by a new adapter behind a port. GitHub Actions calls are new `GitHubClient` methods. Pure `yaml` and `node:zlib` / `node:crypto` are allowed in helpers. |
| `domain-files-are-pure` matches exact filenames only | `server/.dependency-cruiser.cjs:105`, `server/docs/insights.md:106` | Generators and validators go in `helpers.ts` / `domain.ts` so the gate covers them. `ingest.ts` is application ring. |
| New adapter = interface + implementation + mock + `ContainerOverrides` field; adapters built only in `container.ts` | `server/src/adapters/AGENTS.md:3-5`; precedent `FileEvalRecordsSource` at `server/src/adapters/eval-records/file.ts:4-22`, `server/src/platform/container.ts:105-107` | Step 5 follows the eval-records pattern exactly. |
| A new mock port method must delegate to its siblings | `server/docs/insights.md:45` | The new `MockGitHubClient` methods keep their state in one place (the `committed` / `openedPrs` arrays), not in parallel `opts` reads. |
| `commitFiles` force-moves an existing branch | `server/src/adapters/github/octokit.ts:353-359`; `server/src/modules/ci/docs/insights.md:12` | The AC-42 foreign-commit check runs **before** `commitFiles`, using a new `compareCommits` read. |
| A specific 409 code needs `AppError` / the `ConflictError` code argument | `server/docs/insights.md:14`; `server/src/platform/errors.ts:49-52` | AC-42 throws `new ConflictError(msg, details, 'ci_branch_foreign_commit')`. |
| Services may read a GitHub error's `status` structurally | precedent `server/src/modules/pulls/service.ts:269-270` | AC-43 maps `status ∈ {403, 404}` via a pure `githubStatusOf(err)` helper, with no `octokit` import. |
| Route-schema validation answers 422 | `server/src/app.ts:128-129` | Recommendation 1: the ci routes use `attachValidation: true` and `BadRequestError`. |
| Secrets only via `container.secrets`; never log a token | `server/AGENTS.md` (Gotchas); spec AC-67, NFR-8 | Ingest logs only repo, run id and reason (zod issue *paths and codes*, never values or the artifact body). |
| Every domain table has `workspace_id`; migrations come from `pnpm db:generate` only, never hand-edited, never on boot | `server/src/db/AGENTS.md:5-6`, `:10`; root `AGENTS.md:29`, `:34`; `server/src/modules/ci/docs/insights.md:15` | Step 3 adds columns, Step 4 generates and applies them. Additive only: `server/docs/insights.md:10` (mixing add and drop hangs drizzle-kit). |
| `@devdigest/shared` has two copies, already drifting in 5 files; the client copy lacks `AgentManifest` | root `AGENTS.md:28`; `docs/insights.md:72`; `diff` of `server/src/vendor/shared/contracts/eval-ci.ts` vs client (server `:144-172` absent from client) | Step 1 edits `contracts/eval-ci.ts` in both copies and brings `AgentManifest` across, so the CI section is byte-identical. |
| The client must never value-import `@devdigest/shared` | `client/docs/insights.md:52` | Client code uses `import type` only. Trigger values and post-as options are client constants. |
| `agent-runner` aliases the **server** shared copy | `agent-runner/AGENTS.md` ("Consuming reviewer-core"); `agent-runner/docs/insights.md:17` | The artifact schema change in Step 1 is what the runner compiles against. B1 must finish before B3. |
| The runner bundle is not committed: `agent-runner/.gitignore:2` ignores `dist/`, overriding the root un-ignore at `.gitignore:3-6` | `agent-runner/.gitignore:2` | The server reads a locally built `agent-runner/dist/index.js`. The hermetic e2e stack and CI must build it (Step 17). |
| `agent-runner` and `server` typecheck need `reviewer-core/node_modules` | `docs/insights.md:140`; `agent-runner/docs/insights.md:13` | Every gate that typechecks or builds those packages first runs `cd reviewer-core && npm ci` once. |
| Client: routes do not import each other; folders are entered through `index.ts`; zero-tolerance `arch:check`, test files included | `client/.dependency-cruiser.cjs:45-78`; `client/docs/insights.md:102` | The CI tab links to `/ci-runs` with an `href`, never an import. The wizard lives under the CI tab folder. |
| Sidebar labels are `nav.ts` literals, and `shell.json` feeds only the palette | `client/docs/insights.md:44`; `client/src/vendor/ui/nav.ts:34-42`; `client/messages/en/shell.json:28` | Adding "CI Runs" touches `nav.ts`. `shell.json` already has the label. |
| A brand-new route fails typecheck until Next regenerates route types | `client/docs/insights.md:119` | B4's gate requests `/ci-runs` once under `pnpm dev` before `pnpm typecheck`. |
| The hermetic stack runs every flow under a raised rate limit and with Docker | `scripts/e2e.sh:44`; `e2e/docs/insights.md:38` | Flow 14 is appended last. No rate-limit change is needed. |

## Touched packages / modules

| Package | Module | Ring / layer | Why it changes |
|---|---|---|---|
| server | `src/vendor/shared/contracts/eval-ci.ts` (copy 1) | domain (contracts) | AC-1 to AC-7, plus the new preview, export-result and runs-page shapes |
| client | `src/vendor/shared/contracts/eval-ci.ts` (copy 2) | contracts | AC-7 (identical CI section) |
| server | `src/vendor/shared/adapters.ts` (copy 1 only) | port | New `GitHubClient` methods for repo metadata, compare, workflow runs, artifacts, PR state |
| server | `src/adapters/github/octokit.ts`, `src/adapters/mocks.ts` | infrastructure | Implement the new methods. The mock gains a runner-bundle source. |
| server | `src/adapters/runner-bundle/file.ts` (NEW) | infrastructure | Reads the prebuilt `agent-runner/dist/index.js` (AC-14, AC-15, NFR-1) |
| server | `src/platform/config.ts`, `src/platform/container.ts`, `src/platform/errors.ts` | composition / platform | Bundle path, ci-scoped mock switch, `BadRequestError` |
| server | `src/db/schema/ci.ts` + generated migration | infrastructure | `workspace_id`, state, versions, GitHub ids, idempotency key |
| server | `src/modules/ci/*` (NEW code) | all rings | Bundle generation, validation, install, ingest, lists |
| server | `src/modules/index.ts` | composition root | Register the module |
| server | `package.json` / `pnpm-lock.yaml` | — | Add `yaml` |
| agent-runner | `src/context.ts`, `src/artifact.ts`, `src/run.ts` (+ tests) | CLI | AC-120 to AC-124 |
| client | `src/lib/hooks/ci.ts` (NEW), `src/lib/hooks/index.ts` | data access | Preview, export, installations, runs |
| client | `src/app/agents/[id]/page.tsx`, `AgentEditor/*`, `AgentEditor/_components/CiTab/**` (NEW) | route / feature | CI tab and wizard |
| client | `src/app/ci-runs/**` (NEW) | route | CI Runs page |
| client | `src/vendor/ui/nav.ts` | design system | "CI Runs" sidebar entry |
| client | `messages/en/ci.json` | copy | New strings; retire the AC-102 string and the leftovers |
| e2e | `specs/14-export-to-ci.flow.json` (NEW) | test | AC-125 |
| repo | `scripts/e2e.sh`, `.github/workflows/e2e-web.yml` | tooling | Build the runner bundle; enable the ci-scoped mock |

## Steps

### Step 1 — Rewrite the Export-to-CI contracts in both shared copies
- **Files:** `server/src/vendor/shared/contracts/eval-ci.ts`, `client/src/vendor/shared/contracts/eval-ci.ts`, `server/test/contracts.test.ts`
- **Change:**
  - In the "Export-to-CI + CI Runs" section (`server/.../eval-ci.ts:129-239`):
    - `CiExportInput`: `repo` ("owner/name", min 1); `target: z.literal('gha').default('gha')` (AC-6); `mode: z.enum(['open_pr','zip']).default('open_pr')`; `post_as` (unchanged enum); `triggers: z.array(z.enum(['opened','synchronize','reopened'])).min(1).default(['opened','synchronize'])` (AC-20, AC-96); `edits: z.array(z.object({ path: z.string(), contents: z.string() })).default([])`. Remove `base` (AC-39 uses the workspace record; the `'main'` default is at `:181`).
    - `CiPreviewQuery` (`repo`, `triggers`, `post_as`) and `CiPreview` (`files: CiFile[]`, `installation_id`, `agent_version`, `runner_version`).
    - `CiInstallationState = z.enum(['pr_open','active','pr_closed'])` (AC-3).
    - `CiInstallation`: `id`, `agent_id`, `repo`, `target_type: z.literal('gha')`, `state`, `agent_version`, `runner_version`, `pr_url` nullable, `behind` boolean, `installed_at`, `updated_at`, `latest_run: { status, ran_at } | null` (AC-4, AC-71).
    - `CiExportResult`: discriminated union on `mode`. `open_pr` carries `installation` and `pr_url`; `zip` carries `filename` and `zip_base64`.
    - `CiRun`: `id`, `repository`, `pr_number` nullable, `agent` nullable, `verdict` nullable `Verdict`, `findings_count` nullable, `blockers` nullable, `cost_usd` nullable, `duration_ms` nullable, `head_sha` nullable, `job_url` nullable, `status: CiRunStatus`, `ran_at` (AC-5).
    - `CiRunsQuery`: `window: z.enum(['7d','all']).default('7d')`, `agent_id?`, `repo?`, `status?`, `page` ≥ 1, default 1. `CiRunsPage`: `runs`, `warnings: { repo, message }[]`, `page`, `has_more`.
    - `CiResultArtifact`: add the optional fields `repository`, `repository_id` (int), `head_sha`, `verdict` (`Verdict`), `blockers` (int), `run_id` (int), `run_attempt` (int), `installation_id`, `model`. Add no credential-shaped field (AC-1, AC-2). Keep zod's default strip of unknown keys.
  - Keep `CiTarget` and `CiFile` exported unchanged.
  - Write the server copy, then copy the section and `AgentManifest` (server `:144-172`) to the client. Change the client import line to `import { EvalRun, EvalOwnerKind, Conformance, Provider, CiFailOn } from './knowledge.js';`. Both names already exist in the client `knowledge.ts` (`:271`, `:283`).
  - Note that `CiExport` / `CiRun` have no consumers in `client/src` or `server/src` today (verified by grep), so nothing else breaks.
- **Satisfies:** AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7 (and the schema half of AC-18, AC-20)
- **Skills:** zod, typescript-expert
- **Insights:** `docs/insights.md:72` (copies drift; diff before and after); `client/docs/insights.md:52` (client imports types only)
- **Owner:** implementer
- **Depends on:** nothing
- **Done when:**
  - `diff server/src/vendor/shared/contracts/eval-ci.ts client/src/vendor/shared/contracts/eval-ci.ts` prints only the pre-existing Conformance `provider` hunk (server `:249` / client `:220`).
  - `cd server && pnpm exec vitest run contracts` passes, with new cases: an artifact with none of the new fields parses; an artifact with all of them parses; `target: 'circle'` fails; `triggers: []` and `triggers: ['closed']` fail; an extra `token` key is stripped.
  - `cd client && pnpm typecheck` is green.

### Step 2 — Extend the GitHub port and implement it in Octokit and the mock
- **Files:** `server/src/vendor/shared/adapters.ts` (server copy only — the client copy already lacks `commitFiles`/`findOpenPr`), `server/src/adapters/github/octokit.ts`, `server/src/adapters/mocks.ts`, `server/test/adapters.test.ts`
- **Change:**
  - Add to `GitHubClient` (`server/src/vendor/shared/adapters.ts:177-205`), with types declared next to `CommitFilesPayload` (`:153-160`):
    - `getRepository(repo) → { id: number; full_name: string }`
    - `compareCommits(repo, base, head) → { ahead_by: number; commits: { sha: string; message: string }[] } | null` (null when `head` is 404)
    - `listWorkflowRuns(repo, workflowFile, { status: 'completed'; perPage }) → WorkflowRunMeta[]`, where each item carries `id`, `run_attempt`, `head_sha`, `head_branch`, `conclusion`, `html_url`, `repository: { id, full_name }`, `pull_numbers: number[]` and `updated_at`
    - `listRunArtifacts(repo, runId) → { id; name; size_in_bytes; expired }[]`
    - `downloadArtifact(repo, artifactId) → Uint8Array`
    - `getPullState(repo, n) → 'open' | 'closed' | 'merged'`
  - Implement each with `withRetry(() => withTimeout(…))`, like the neighbours (`octokit.ts:288-305`). Octokit calls: `repos.get`, `repos.compareCommits` (`basehead`), `actions.listWorkflowRuns`, `actions.listWorkflowRunArtifacts`, `actions.downloadArtifact` (`archive_format: 'zip'`) and `pulls.get`. **Never** call any `actions.*Secret*` endpoint (AC-66).
  - `MockGitHubClient`: `getRepository` returns `{ id: 4242, full_name: owner/name }`. `compareCommits` derives from `this.committed`: `null` before the first commit, then one commit per payload with that payload's `message`. The new fixtures (`workflowRuns`, `artifacts`, `artifactZips`, `pullStates`) are options, and the methods read them through one accessor, in line with `server/docs/insights.md:45`.
- **Satisfies:** infrastructure for AC-39 to AC-44, AC-48, AC-49, AC-61, AC-63, AC-64, AC-66
- **Skills:** backend-onion-architecture, typescript-expert
- **Insights:** `server/docs/insights.md:45` (mock methods delegate); `server/src/modules/ci/docs/insights.md:12` (force-push)
- **Owner:** implementer
- **Depends on:** nothing
- **Done when:**
  - `cd server && pnpm typecheck` is green.
  - `grep -rn "Secret" server/src/adapters/github/octokit.ts` finds no Actions-secrets call.
  - A unit test in `adapters.test.ts` shows `MockGitHubClient.compareCommits` returning null, then one commit after `commitFiles`.

### Step 3 — Extend the CI schema (add-only)
- **Files:** `server/src/db/schema/ci.ts`, `server/src/db/schema.ts` (only if a new export is added; `ciInstallations` / `ciRuns` are already registered at `:39`, `:86-87`)
- **Change:**
  - `ci_installations` (`ci.ts:4-12`) gains:
    - `workspace_id` uuid not null, FK `workspaces` on delete cascade
    - `repo_id` uuid, FK `repos` on delete set null
    - `github_repo_id` bigint (`mode: 'number'`) not null
    - `state` text enum `pr_open|active|pr_closed`, not null, default `pr_open`
    - `agent_version` int not null
    - `runner_version` text not null
    - `pr_url` text
    - `pr_number` int
    - `updated_at` timestamptz default now, not null
  - Indexes on `ci_installations`: unique `(agent_id, repo)` (AC-45); `(workspace_id)`; `(repo_id)`.
  - `ci_runs` (`:14-26`) gains:
    - `workspace_id` uuid not null, FK cascade
    - `agent_run_id` uuid not null, FK `agent_runs` on delete cascade
    - `repo` text not null
    - `head_sha` text
    - `github_run_id` bigint (`mode: 'number'`) not null
    - `run_attempt` int not null
    - `artifact_id` bigint (`mode: 'number'`)
  - Indexes on `ci_runs`: unique `(ci_installation_id, github_run_id, run_attempt)` (AC-54); `(workspace_id, ran_at)`; `(agent_run_id)`.
  - Reuse the existing `github_url` column for the job URL and `pr_number` / `ran_at` as they are. Leave the legacy `status` / `findings_count` / `cost_usd` / `source` columns untouched and unused. `agent_runs` holds those values (AC-52). Nothing is dropped or renamed.
- **Satisfies:** infrastructure for AC-44, AC-45, AC-53, AC-54, AC-62 to AC-64, AC-68 to AC-72
- **Skills:** drizzle-orm-patterns, postgresql-table-design
- **Insights:** `server/src/modules/ci/docs/insights.md:15` (no `workspace_id` today); `server/docs/insights.md:10` (add-only); `server/docs/insights.md:111` (text enums need no migration of their own)
- **Owner:** implementer
- **Depends on:** nothing
- **Done when:** `cd server && pnpm typecheck` is green.

### Step 4 — Generate and apply the migration
- **Files:** `server/src/db/migrations/0022_*.sql` + `server/src/db/migrations/meta/*` (generated by `pnpm db:generate`, **never hand-edited**)
- **Change:**
  - First check that both tables are empty in the dev DB: `docker exec devdigest-postgres psql -U devdigest -d devdigest -tc "select count(*) from ci_installations; select count(*) from ci_runs;"` (`docs/insights.md:121`). The new NOT NULL columns have no default and would fail on existing rows. If either count is non-zero, stop and ask the user.
  - Then run `cd server && pnpm db:generate`, inspect the SQL, and run `pnpm db:migrate`.
- **Satisfies:** infrastructure
- **Skills:** drizzle-orm-patterns
- **Insights:** `server/docs/insights.md:10`; `docs/insights.md:180` (pnpm build-approval gate)
- **Owner:** implementer
- **Depends on:** Step 3
- **Done when:** the SQL holds only `ALTER TABLE … ADD COLUMN`, `ADD CONSTRAINT … FOREIGN KEY` and `CREATE [UNIQUE] INDEX` (no `DROP`, no `RENAME`), and `pnpm db:migrate` ends with its success line.

### Step 5 — Add the runner-bundle adapter, its config, and a ci-scoped GitHub mock switch
- **Files:**
  - `server/src/adapters/runner-bundle/file.ts` (NEW)
  - `server/src/adapters/mocks.ts`
  - `server/src/platform/config.ts`
  - `server/src/platform/container.ts`
  - `server/test/config.test.ts`
  - `server/test/runner-bundle.test.ts` (NEW)
- **Change:**
  - Model the adapter on `FileEvalRecordsSource` (`server/src/adapters/eval-records/file.ts:4-22`). Interface: `RunnerBundleReader { read(): Promise<{ contents: string; bytes: number; version: string } | null> }`. Missing file (ENOENT) → `null`. `version` is the first 12 hex characters of the sha256 of the bundle (Recommendation 2). It never spawns a build (AC-15).
  - Config:
    - `DEVDIGEST_RUNNER_BUNDLE_PATH` (optional) resolves `runnerBundlePath`. The default is `fileURLToPath(new URL('../../../agent-runner/dist/index.js', import.meta.url))`, the same idiom as `evalRecordsPath` (`config.ts:80-84`). **This is how the server locates the bundle.**
    - `DEVDIGEST_CI_GITHUB_MOCK` → `ciGithubMock: boolean`, forced to `false` when `NODE_ENV=production`.
  - Container:
    - A `runnerBundle` getter, with `runnerBundle?` in `ContainerOverrides` (`:47-63`).
    - A `ciGithub(): Promise<GitHubClient>` method: `overrides.github ?? (config.ciGithubMock ? (this._ciMock ??= new MockGitHubClient()) : this.github())`. Log one warning at boot when the switch is on. The global `github()` (`:196-202`) is left unchanged (SC-4).
  - Mock: `MockRunnerBundleSource` in `mocks.ts`, taking `contents | null`.
- **Satisfies:** AC-14 (detection), AC-15, NFR-1 (size is read here and enforced in Step 9), NFR-4; infrastructure for AC-125
- **Skills:** backend-onion-architecture, security
- **Insights:** `docs/insights.md:72` (n/a); `server/docs/insights.md:19` (container is the composition root)
- **Owner:** implementer
- **Depends on:** Step 2
- **Done when:**
  - `runner-bundle.test.ts` passes: a temp file returns contents and a stable version, and a missing path returns `null`.
  - `config.test.ts` shows `ciGithubMock` is false under `NODE_ENV=production` even with the env var set.
  - `cd server && pnpm arch:check` reports no new violation.

### Step 6 — Add `BadRequestError` (400) to the error taxonomy
- **Files:** `server/src/platform/errors.ts`
- **Change:** add `class BadRequestError extends AppError { constructor(message, details?, code = 'bad_request') { super(code, message, 400, details); } }`, next to `ValidationError` (`:25-29`). The global handler already serializes any `AppError` by its status.
- **Satisfies:** infrastructure for AC-16, AC-18, AC-20, AC-32 to AC-35, AC-131 (Recommendation 1)
- **Skills:** backend-onion-architecture
- **Insights:** `server/docs/insights.md:14` (pick a class with a code)
- **Owner:** implementer
- **Depends on:** nothing
- **Done when:** `cd server && pnpm typecheck` is green.

### Step 7 — Write the ci module's pure ring: constants, domain, ports, helpers
- **Files:**
  - `server/src/modules/ci/constants.ts` (NEW)
  - `server/src/modules/ci/domain.ts` (NEW)
  - `server/src/modules/ci/ports.ts` (NEW)
  - `server/src/modules/ci/helpers.ts` (NEW)
  - `server/package.json` + `server/pnpm-lock.yaml` (add `yaml` ^2.6.1, already used by `agent-runner/package.json`)
  - `server/test/ci-helpers.test.ts` (NEW)
- **Change:**
  - **`constants.ts`:**
    - `CI_BRANCH = 'devdigest/ci'`, `WORKFLOW_PATH = '.github/workflows/devdigest-review.yml'`, `WORKFLOW_FILE = 'devdigest-review.yml'`, `RUNNER_PATH = '.devdigest/runner/index.js'`, `MEMORY_PATH`.
    - `ARTIFACT_NAME = 'devdigest-result'`, `ARTIFACT_FILE = 'devdigest-result.json'`, `MAX_ARTIFACT_BYTES = 65_536` (AC-132), `MAX_RUNNER_BYTES = 5_242_880` (NFR-1).
    - `PR_TITLE = 'Add DevDigest CI review'` (AC-41), the commit-message marker trailer `DevDigest-Bundle: v1` (AC-42), `RUNS_PAGE_SIZE = 50` (NFR-2), `INGEST_RUNS_PER_PAGE = 30`.
    - The pinned action SHAs (`actions/checkout`, `actions/setup-node`, `actions/upload-artifact`, each a 40-hex SHA with its tag in a comment). The implementer resolves them once with `git ls-remote https://github.com/actions/<name> refs/tags/v4*` and records the tags. No SHA is invented.
  - **`domain.ts`:** domain types (`BundleFile`, `InstallationRecord`, `CiRunInsert`, `RunVerification`) and the rules:
    - `validateEditedWorkflow(yamlText)` returns the first violation:
      - not valid YAML → AC-32;
      - top-level `permissions` missing, or not exactly `{contents: read, pull-requests: write}`; also any job-level `permissions` that grants more → AC-33;
      - `pull_request_target` in `on` as a string, array item or map key → AC-34;
      - no `actions/checkout` step with `with.ref` equal to `${{ github.event.pull_request.base.sha }}`, or any checkout of `head`/`merge` → AC-131;
      - the review job's `if` does not contain the same-repo guard (whitespace-normalized) → AC-131;
      - any `uses:` not matching `^[^@\s]+@[0-9a-f]{40}$` → AC-131.
    - `validateEdits(edits, generatedFiles)`: rejects the manifest, `memory.jsonl`, the runner bundle, or an unknown path → AC-35.
    - `statusFor(artifact)` → `no_findings` / `succeeded` (AC-59, AC-60).
    - `isBehind(agentVersion, installedVersion)` (AC-72).
  - **`ports.ts`:** narrow consumer-owned ports:
    - `AgentSource` (`getById`, `linkedSkills`, the structural subset of `AgentsRepository`)
    - `CiStore` (the repository surface of Step 8)
    - `CiGitHub` (the Step 2 methods + `commitFiles`, `findOpenPr`, `openPullRequest`)
    - `GitHubFactory = () => Promise<CiGitHub>`
    - `RunnerBundleSource`
    - `CiLog` (`warn` / `info`)
  - **`helpers.ts`** (pure; may import `yaml`, `node:zlib`, `node:crypto` — none is in `IO_BUILTINS`, `server/.dependency-cruiser.cjs:22`):
    - `slugify(name)`: lowercase, NFKD, runs outside `[a-z0-9._-]` → `-`, trim `-`. Assumption: see Open questions.
    - `assertSafeSkillPaths(skills)`: 400 naming the skill when the slug is empty, contains `/`, `\` or `..`, or collides with another skill's slug (AC-16, SC-3).
    - `buildManifestYaml(agent, skillSlugs)`: `yaml.stringify`, and re-check with `AgentManifest.parse` (AC-9).
    - `buildMemoryJsonl(entries)`: one `{"content","kind"}` line each, `''` when empty (AC-10, AC-11).
    - `buildWorkflowYaml({ triggers, postAs, installationId })` (AC-19, AC-21 to AC-31). The required shape:
      - `on.pull_request.types` = exactly the selected types;
      - top-level `permissions: {contents: read, pull-requests: write}`;
      - one job with `if: github.event.pull_request.head.repo.full_name == github.repository` (`docs/insights.md:84`);
      - checkout pinned to a SHA with `ref: ${{ github.event.pull_request.base.sha }}` and `persist-credentials: false`;
      - pinned `setup-node` with node `22`;
      - the run step `run: node .devdigest/runner/index.js`, with `env:` holding `OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}`, `GITHUB_TOKEN: ${{ github.token }}`, `DEVDIGEST_POST_AS: <mode>` and `DEVDIGEST_INSTALLATION_ID: <id>`, with no `${{ github.event.* }}` text in any `run:`;
      - a pinned `upload-artifact` with `if: ${{ always() }}`, `name: devdigest-result`, `path: devdigest-result.json`, `if-no-files-found: ignore`;
      - no `pull_request_target` anywhere, and no `devdigest/review-action`.
    - `buildBundle(...)` returns the five-kind file list with `editable` set (workflow and skills `true`; manifest, memory and runner `false`) (AC-8, AC-12, AC-13).
    - `installationIdFor(agentId, repoFullName)`: a deterministic UUID-formatted sha1 hash, so preview and install agree on the AC-29 id before the row exists.
    - `zipFiles(files)`: deflate via `deflateRawSync` plus a CRC-32 table. Do not rely on `zlib.crc32`, which needs Node ≥22.2. (AC-46.)
    - `readSingleZipEntry(bytes, name, maxBytes)`: inflate with `maxOutputLength`, and throw `oversized` when exceeded (AC-132).
    - `verifyArtifact(artifact, run, installation)` → `null | { field }` for `repository`, `repository_id`, `head_sha`, `pr_number`, missing or mismatched against the run and the installation (AC-51).
    - `githubStatusOf(err)` (pattern `pulls/service.ts:269`).
    - `prNumberFromUrl(url)`.
    - `toInstallationDto` / `toCiRunDto`.
- **Satisfies:** AC-8 to AC-13, AC-16, AC-19, AC-21 to AC-35, AC-46 (archive), AC-51, AC-59, AC-60, AC-72, AC-131, AC-132 (mechanism)
- **Skills:** backend-onion-architecture, zod, typescript-expert, security
- **Insights:** `server/docs/insights.md:106` (exact filenames are gated as pure); `docs/insights.md:84` (compare full names, not `head.repo.fork`); `server/src/modules/ci/docs/insights.md:18` (diff exclusions); `docs/insights.md:86` (no `env`/`runner` contexts in job-level `env`)
- **Owner:** implementer
- **Depends on:** Steps 1, 6
- **Done when:** `cd server && pnpm exec vitest run ci-helpers` passes. Each case below is checked by parsing the YAML, not by grepping:
  - the generated workflow parses and passes `validateEditedWorkflow`;
  - its `on` has only `pull_request` with the given types;
  - its `permissions` deep-equal the two grants;
  - every `uses:` is pinned;
  - no `run:` contains `${{`;
  - the checkout `ref` is the base SHA;
  - the upload step is `always()`;
  - each AC-32, AC-33, AC-34 and AC-131 violation is rejected with its own message;
  - a manifest round-trips through `AgentManifest`;
  - empty memory gives `''`;
  - zip round-trip: `readSingleZipEntry(zipFiles(x))` returns `x`;
  - a 65,537-byte entry throws without `JSON.parse`;
  - `verifyArtifact` names each mismatched field.
  
  `pnpm arch:check` reports no new violation.

### Step 8 — Write the ci repository
- **Files:** `server/src/modules/ci/repository.ts` (NEW)
- **Change:** `CiRepository(db)`. Every query is scoped by `workspaceId` and returns domain types:
  - `findRepoByFullName(ws, fullName)` → `{ id, owner, name, fullName, defaultBranch }` (AC-17, AC-39)
  - `memoryForRepo(ws, repoId)` → `scope='repo' AND repo_id=?` OR `scope='global'`, ordered by `created_at, id`, returning content and kind only (AC-10)
  - `findInstallation(agentId, repo)`
  - `upsertInstallation(...)` with `onConflictDoUpdate` on `(agent_id, repo)`, setting state `pr_open` and the versions (AC-44, AC-45)
  - `listInstallations(ws)` and `listInstallationsForAgent(ws, agentId)`, each joined to the agent's name and version and to the latest `ci_runs` + `agent_runs` status and time (AC-71)
  - `ingestedKeys(installationId)`
  - `findPullId(ws, repoId, number)` (AC-55, AC-56; it never inserts — AC-57)
  - `insertCiRun(input)`: one transaction. Insert the `agent_runs` row (`source: 'ci'`, `agent_id` = installation's agent, `pr_id` or null, `ran_at` = GitHub `updated_at`, model, duration, cost as given — null stays null (AC-58), findings_count, blockers, status). Then insert the `ci_runs` row with `onConflictDoNothing` on the unique key. If no row comes back, throw a sentinel that rolls back the agent run, and return `false` (AC-52 to AC-54).
  - `setInstallationState`
  - `hasIngestedRun`
  - `listCiRuns(ws, query)`: joins `ci_runs → agent_runs → ci_installations → agents` for the name (AC-70); filters on window, agent, repo and status; `ORDER BY ran_at DESC`; `LIMIT 51` gives `has_more` (AC-68, AC-69, NFR-2).
- **Satisfies:** AC-10, AC-11, AC-17, AC-44, AC-45, AC-52 to AC-58, AC-62 to AC-64 (persistence), AC-68 to AC-71
- **Skills:** drizzle-orm-patterns, backend-onion-architecture, postgresql-table-design
- **Insights:** `server/docs/insights.md:48` (do not reach for `src/db/rows.ts` from a service)
- **Owner:** implementer
- **Depends on:** Steps 4, 7
- **Done when:** `cd server && pnpm typecheck && pnpm arch:check` is green. Behaviour is covered by T1.

### Step 9 — Write `CiService`: preview, install as PR or zip, installations list
- **Files:** `server/src/modules/ci/service.ts` (NEW), `server/test/ci-service.test.ts` (NEW)
- **Change:** `CiService({ store, agents, github: GitHubFactory, bundle: RunnerBundleSource, log })`.
  - **`preview(ws, agentId, query)`** — no GitHub call:
    1. Agent → `NotFoundError`.
    2. Repo by full name in the workspace → `NotFoundError` (AC-17).
    3. `bundle.read()` → if `null`, throw `ConfigError("Runner bundle not found at <path>. Build it: cd agent-runner && pnpm install && pnpm build")` (AC-14). If larger than `MAX_RUNNER_BYTES`, throw `ConfigError` (NFR-1).
    4. Skills → `assertSafeSkillPaths` (AC-16).
    5. Memory.
    6. Installation id = existing row's id ?? `installationIdFor`.
    7. Return `buildBundle(...)`. Always freshly generated (AC-36).
  - **`export(ws, agentId, input)`:**
    - Run the same preamble.
    - Apply edits: `validateEdits`, then `validateEditedWorkflow` when the workflow is edited (AC-32 to AC-35, AC-131). Every failure throws `BadRequestError` before any GitHub call.
    - An unedited workflow is regenerated from the input's `triggers` / `post_as` (AC-19, AC-28; edited case → B-1).
    - `mode: 'zip'` → `zipFiles` → `{ mode, filename: 'devdigest-ci-<repo>.zip', zip_base64 }`. No GitHub call, no store write (AC-46, AC-47).
    - `mode: 'open_pr'`:
      1. `gh = await github()`.
      2. `getRepository` (numeric id).
      3. `compareCommits(defaultBranch, CI_BRANCH)`: any ahead commit without the marker trailer → `ConflictError(…, 'ci_branch_foreign_commit')` (409, branch unchanged — AC-42).
      4. `commitFiles({ branch: CI_BRANCH, base: repo.defaultBranch, message: '<summary>\n\nDevDigest-Bundle: v1', files })` (AC-37 to AC-39; one commit; only `devdigest/ci`).
      5. `findOpenPr(CI_BRANCH)` ?? `openPullRequest({ title: PR_TITLE, head: CI_BRANCH, base: repo.defaultBranch, body })` (AC-40, AC-41).
      6. `upsertInstallation` with state `pr_open`, agent version, runner version, `github_repo_id`, `pr_url`, `pr_number` (AC-44, AC-45).
    - Any GitHub error with `githubStatusOf ∈ {403, 404}` (writes; reads too, since a hidden repo cannot be written) → `AppError('github_write_denied', 'token lacks write access to <owner/name>', 403)`. Nothing is upserted (AC-43). Other GitHub errors → `ExternalServiceError`.
  - **`listInstallations(ws, agentId)`** → `toInstallationDto`, with `behind` set (AC-71, AC-72).
  - No model call anywhere (NFR-3). No secret is logged or returned (AC-67).
- **Satisfies:** AC-8, AC-12 to AC-17, AC-19 (unedited), AC-28 (unedited), AC-32 to AC-47, AC-71, AC-72, AC-131, NFR-1, NFR-3, NFR-4
- **Skills:** backend-onion-architecture, security, typescript-expert
- **Insights:** `server/src/modules/ci/docs/insights.md:12` (check before `commitFiles`); `server/docs/insights.md:14`
- **Owner:** implementer
- **Depends on:** Steps 5, 7, 8
- **Done when:** `cd server && pnpm exec vitest run ci-service` passes, with in-memory fakes (no Docker) and `MockGitHubClient`:
  - preview returns exactly five kinds of paths and the editable flags;
  - a missing bundle gives the build message;
  - an unknown repo gives 404 and the mock records 0 calls;
  - each validation failure gives 400 and 0 GitHub calls;
  - a foreign commit gives 409 and `committed` stays empty;
  - a fake throwing `{status: 403}` gives the exact message and no upsert;
  - a second export reuses the open PR and keeps one installation;
  - zip mode makes 0 GitHub calls and 0 store writes;
  - all committed paths are `.devdigest/**` or the workflow path, on branch `devdigest/ci`.

### Step 10 — Write `CiIngest`: pull, verify and record CI runs
- **Files:** `server/src/modules/ci/ingest.ts` (NEW), `server/test/ci-ingest.test.ts` (NEW)
- **Change:** `CiIngest({ store, github, log }).refresh(ws) → warnings[]`. Process each workspace installation inside its own try/catch, all in parallel via `Promise.allSettled` (NFR-9):
  1. `listWorkflowRuns(repo, WORKFLOW_FILE, { status: 'completed', perPage: INGEST_RUNS_PER_PAGE })`. Skip keys already in `ingestedKeys` and runs with `conclusion === 'skipped'` (fork PRs; Edge cases) (AC-48).
  2. Find the `ARTIFACT_NAME` artifact that is not expired.
     - None → store `failed`, with `pr_number` = `run.pull_numbers[0] ?? null`, `head_sha`, `job_url = run.html_url`, and no findings count (AC-61).
     - `size_in_bytes > MAX_ARTIFACT_BYTES` → reject (AC-132).
     - Otherwise `downloadArtifact` with the server token (AC-49), then `readSingleZipEntry(…, MAX_ARTIFACT_BYTES)`: oversized → reject without parsing (AC-132). Then `JSON.parse` + `CiResultArtifact.safeParse`: failure → reject (AC-50). Then `verifyArtifact`: mismatch → reject naming the field (AC-51).
     - Verified → `insertCiRun` with status from `statusFor`, blockers from the artifact, and `job_url`, run id and attempt **from GitHub metadata** (AC-52 to AC-60).
  3. After the first stored run of a `pr_open` installation → `active` (AC-62).
  4. Then, if the installation is still `pr_open` and has a `pr_number`, check `getPullState`: `merged` → `active` (AC-63); `closed` with no ingested run → `pr_closed` (AC-64).
  5. A rejection writes exactly one `log.warn({ repo, runId, reason })` line. The reason is the zod issue paths and codes or the mismatched field name, never values or the body (NFR-8, AC-67). A GitHub failure for a repo (403, 404, 429, network, or the `ConfigError` for a missing token) → one warn line, plus a warning `{ repo, message }` returned to the caller (AC-65).
  
  `CiService.listRuns(ws, query)` calls `ingest.refresh` first, then `store.listCiRuns`, and returns `{ runs, warnings, page, has_more }` (AC-48, AC-68 to AC-70).
- **Satisfies:** AC-48 to AC-65, AC-67 to AC-70, AC-132, NFR-2, NFR-8
- **Skills:** backend-onion-architecture, security, zod
- **Insights:** `server/docs/insights.md:64` (the unit suite reaps running `agent_runs` — CI rows are never `running`, but do not run the suite during a live review)
- **Owner:** implementer
- **Depends on:** Steps 2, 7, 8
- **Done when:** `cd server && pnpm exec vitest run ci-ingest` passes with fakes:
  - a forged repository, repository id, head SHA or PR → no insert, plus one warn naming the field;
  - a 70 KB artifact → no parse (spy on `JSON.parse`, or assert the reject reason `oversized`);
  - malformed JSON → reject;
  - no artifact → `failed` with metadata;
  - null cost stays null;
  - 0 findings → `no_findings`;
  - findings on a failed job → `succeeded` with blockers;
  - a duplicate run → one row (fake store honours the key);
  - a 403 from one repo still returns stored runs plus a warning;
  - merged PR → `active`; closed PR with no runs → `pr_closed`; closed PR with a run → stays `active`;
  - a captured logger never contains the fake token string.

### Step 11 — Wire compose, routes, the registry and module memory
- **Files:**
  - `server/src/modules/ci/compose.ts` (NEW)
  - `server/src/modules/ci/routes.ts` (NEW)
  - `server/src/modules/index.ts`
  - `server/src/modules/ci/AGENTS.md`
- **Change:**
  - **`compose.ts`:** `makeCiService(container, log)`. Add compile-time `Assert` that `Container['agentsRepo'] extends AgentSource` (pattern `server/src/modules/eval/compose.ts:27-29`). Wire `github: () => container.ciGithub()`, `bundle: container.runnerBundle` and `new CiRepository(container.db)`.
  - **`routes.ts`**, using `withTypeProvider<ZodTypeProvider>()`, `getContext` and `IdParams`. Each route has `attachValidation: true`, and the handler's first line throws `new BadRequestError('Request validation failed', req.validationError)` when it is set (AC-18, AC-20):
    - `GET /agents/:id/export-ci/preview` (querystring `CiPreviewQuery`, response `CiPreview`)
    - `POST /agents/:id/export-ci` (body `CiExportInput`, response `CiExportResult`)
    - `GET /agents/:id/ci-installations` (response `CiInstallation[]`)
    - `GET /ci-runs` (querystring `CiRunsQuery`, response `CiRunsPage`)
  - **Registry:** add `ci` to `modules/index.ts` (one import + one entry).
  - **`AGENTS.md`:** replace "Status: scaffold … No code yet." (`AGENTS.md:3`) with the file roles and the four routes. The `CLAUDE.md` symlink already exists.
- **Satisfies:** AC-17, AC-18, AC-20, plus the HTTP surface of every server AC
- **Skills:** fastify-best-practices, backend-onion-architecture, zod
- **Insights:** `server/docs/insights.md:68` (Fastify body/null behaviour); `server/docs/insights.md:19`
- **Owner:** implementer
- **Depends on:** Steps 9, 10
- **Done when:** `cd server && pnpm typecheck && pnpm arch:check && pnpm exec vitest run --exclude '**/*.it.test.ts'` are green, including `routes-smoke`.

### Step 12 — Add the identity fields to the runner's artifact
- **Files:**
  - `agent-runner/src/context.ts`
  - `agent-runner/src/artifact.ts`
  - `agent-runner/src/run.ts`
  - `agent-runner/src/run.test.ts`
  - `agent-runner/src/context.test.ts` (NEW)
- **Change:**
  - **`context.ts`:** `resolvePrContext` (`:63-94`) also returns `repositoryId` (`Number(env.GITHUB_REPOSITORY_ID)`), `headSha` (`event.pull_request.head.sha`, not `GITHUB_SHA`, which is the merge commit), `runId` / `runAttempt` (`GITHUB_RUN_ID` / `GITHUB_RUN_ATTEMPT`) and `installationId` (`DEVDIGEST_INSTALLATION_ID`). Missing values become `undefined`, never a throw, so old workflows keep working.
  - **`artifact.ts`:** `buildResultArtifact` (`:32-44`) gains `repository`, `repository_id`, `head_sha`, `verdict`, `blockers`, `run_id`, `run_attempt`, `installation_id` and `model`.
  - **`run.ts`:** at `:142-148`, `verdict` = deterministic `payload.event` mapped to `Verdict` (`REQUEST_CHANGES→request_changes`, `COMMENT→comment`, `APPROVE→approve`), and `blockers` = `countBlockers(...)` (`:137`), never `outcome.review.verdict` (AC-121). `model` = `manifest.model`.
  - The diff path (`fetchPrDiff`, `run.ts:108`), hard-fail exit 1 (`:167-172`) and the no-secret logging (`index.ts:52-58`) stay unchanged (AC-122, AC-124).
- **Satisfies:** AC-120, AC-121, AC-122, AC-123, AC-124
- **Skills:** typescript-expert, security
- **Insights:** `agent-runner/docs/insights.md:9` (ncc inlines aliases); `agent-runner/docs/insights.md:13` (needs `reviewer-core/node_modules`); `agent-runner/docs/insights.md:27` (narrow on `artifact === null`); `agent-runner/docs/insights.md:37` (the `post_as` gap closes through `DEVDIGEST_POST_AS`)
- **Owner:** implementer
- **Depends on:** Step 1
- **Done when:** `cd agent-runner && pnpm typecheck && pnpm test && pnpm build` are green. New tests:
  - a stub model returning `verdict: approve` with a CRITICAL finding under `ci_fail_on: critical` gives artifact `verdict: request_changes` and `blockers: 1`;
  - all nine fields are present and pass `CiResultArtifact.safeParse`;
  - with `OPENROUTER_API_KEY` / `GITHUB_TOKEN` set to sentinel strings, neither appears in the written artifact, captured stdout/stderr or the posted payload;
  - an LLM failure still exits 1 with no artifact.
  
  Then `ls agent-runner/dist` shows `index.js` only, and `wc -c < agent-runner/dist/index.js` ≤ 5,242,880 (NFR-1).

### Step 13 — Add the CI query hooks and copy
- **Files:**
  - `client/src/lib/hooks/ci.ts` (NEW)
  - `client/src/lib/hooks/index.ts`
  - `client/messages/en/ci.json`
  - `client/src/lib/hooks/ci.test.tsx` (NEW)
- **Change:**
  - **Hooks:**
    - `useCiPreview(agentId, { repo, triggers, post_as }, enabled)` → `GET …/export-ci/preview`.
    - `useExportCi(agentId)`: a mutation. `onSuccess` invalidates `['ci-installations', agentId]` (AC-105). For a zip result it decodes `zip_base64` into a `Blob` and triggers a download (AC-106) through a small pure `downloadBase64Zip(filename, b64)` in the same file.
    - `useCiInstallations(agentId)`.
    - `useCiRuns(query)`, with no `refetchInterval` (AC-115). Refresh = `refetch()` (AC-114).
    - Types only: `import type` from `@devdigest/shared`.
    - Add `export * from "./ci";` to the barrel.
  - **Copy in `ci.json`:**
    - Remove `runs.autoRefresh` (`:7`, AC-115), `exportWizard.blockMergeDesc` (`:71`, AC-102), the `circle/jenkins/cli` target strings and the `publishDialog` / old `ciTab` leftovers (`:77-102`).
    - Add `ciTab.heading` "CI deployment", `activeIn` "Active in {count} repos", `githubActions`, `noRunsYet` "no runs yet", `version` "agent v{agent} · runner {runner}", `behind`, the state labels, `failOn` with its "Update CI config" note (AC-83), `addToCi` "+ Add to CI", `updateCiConfig`, `addRepository` "+ Add repository" and `history`.
    - Wizard Configure strings: triggers, `secretInstruction` (Settings → Secrets and variables → Actions), `githubTokenAuto` "Auto-provided by Actions", the AC-101 info text, `installZip` "Copy files as a zip", `prLink`.
    - Runs table columns and `blockers`.
- **Satisfies:** AC-102, AC-105, AC-106, AC-114, AC-115, NFR-5
- **Skills:** react-best-practices, frontend-ui-architecture, react-testing-library
- **Insights:** `client/docs/insights.md:52` (type-only imports); `client/docs/insights.md:99` (grep for unused keys is unreliable — remove by reading each consumer)
- **Owner:** implementer
- **Depends on:** Step 1
- **Done when:**
  - `grep -rn "Requires a GitHub App\|auto-refresh on" client/messages client/src` returns nothing.
  - `cd client && pnpm test -- ci` passes: export success invalidates the installations key, and a zip result calls `URL.createObjectURL` once.
  - `pnpm typecheck` is green.

### Step 14 — Add the CI tab to the agent editor
- **Files:**
  - `client/src/app/agents/[id]/page.tsx` (`VALID_TABS` `:15`)
  - `client/src/app/agents/[id]/_components/AgentEditor/AgentEditor.tsx` (`:26-29`)
  - `client/src/app/agents/[id]/_components/AgentEditor/constants.ts` (`TABS` `:11-16`)
  - `client/src/app/agents/[id]/_components/AgentEditor/_components/ConfigTab/constants.ts` (`:10`)
  - `client/src/app/agents/[id]/_components/AgentEditor/_components/ConfigTab/ConfigTab.tsx`
  - `.../AgentEditor/_components/CiTab/{CiTab.tsx, helpers.ts, constants.ts, styles.ts, index.ts}` (NEW)
  - `.../CiTab/_components/InstallationRow/{InstallationRow.tsx, index.ts}` (NEW)
- **Change:**
  - **Tab registration:** add `ci` to `VALID_TABS` and `TABS` (`labelKey: "editor.tabs.ci"`, which already exists in `messages/en/agents.json:60`) and render `<CiTab agent>` (AC-75).
  - **Promote `CI_FAIL_ON_VALUES`** from `ConfigTab/constants.ts` to `AgentEditor/constants.ts` (precedent `SortableSkillRow.tsx:14` imports `../../constants`) and update ConfigTab's import.
  - **CiTab:**
    - heading, plus the badge `count(state==='active')` (AC-76);
    - one `InstallationRow` per installation: repo, "GitHub Actions", latest-run status plus `relativeTime(ran_at, now)` or "no runs yet", the version line, a "behind" badge, the state label, and an "Update CI config" button (AC-77 to AC-80, AC-85);
    - a "Fail CI on" `SelectInput` over the promoted values, saved with `useUpdateAgent({ id, patch: { ci_fail_on } })` — the same field as ConfigTab (`ConfigTab.tsx:118-124`) — with the AC-83 note next to it (AC-81, AC-82);
    - "+ Add to CI" opens the wizard (AC-84);
    - "+ Add repository" row → `router.push("/onboarding")` (AC-86; `client/docs/insights.md:55`);
    - a history link `href="/ci-runs?agent=<id>"` (AC-87).
  - Pure counting and labels go in `helpers.ts`. All copy via `useTranslations("ci")`. Styles use theme variables only (NFR-7).
- **Satisfies:** AC-75 to AC-87, NFR-5, NFR-6 (tab keyboard via the existing `Tabs`), NFR-7
- **Skills:** frontend-ui-architecture, react-best-practices, next-best-practices
- **Insights:** `client/docs/insights.md:80` (`relativeTime` needs `now`); `client/docs/insights.md:96` (`Badge`/`Chip` drop `aria-label`); `client/docs/insights.md:55`
- **Owner:** implementer
- **Depends on:** Step 13
- **Done when:** `cd client && pnpm typecheck && pnpm arch:check && pnpm test` are green. `/agents/<id>?tab=ci` renders the tab.

### Step 15 — Build the Export to CI wizard
- **Files:**
  - `.../CiTab/_components/ExportCiWizard/{ExportCiWizard.tsx, useExportWizard.ts, helpers.ts, constants.ts, styles.ts, index.ts}` (NEW)
  - `.../ExportCiWizard/_components/{TargetStep, PreviewStep, ConfigureStep, InstallStep}/{<Name>.tsx, index.ts}` (NEW)
- **Change:**
  - **Shell:** `Modal` (from `@devdigest/ui`) with title "Export to CI" and the subtitle carrying the agent name. `ExportWizardSteps` (`client/src/vendor/ui/ExportWizardSteps.tsx:6`) shows the 4 labels (AC-88).
  - **`useExportWizard`** holds step, repo, edits map, triggers, post-as and mode. The wizard is mounted only while open, so closing unmounts it and discards edits (AC-94, AC-95). The hook owns a `keydown` listener: Escape closes, Enter continues (NFR-6; the `Modal` has no Escape handling).
  - **Target:** only the GitHub Actions card, "recommended" and selected (AC-89, AC-90). A repo picker built from `useRepos()` (`client/src/lib/hooks/core.ts:66`), preselecting the preset repo or `useActiveRepo()` (`client/src/lib/repo-context.tsx:58`) (AC-91).
  - **Preview:** "FILES TO CREATE" list from `useCiPreview` and a contents pane. A `Textarea` only for `editable` files, with an "editable" badge. Contents render as text, never markdown (AC-92, AC-93).
  - **Configure:**
    - three trigger chips (defaults: opened and synchronize on, reopened off); "Continue" is disabled when none is on (AC-96, AC-97);
    - `OPENROUTER_API_KEY` with the instruction and no status badge;
    - `GITHUB_TOKEN` "Auto-provided by Actions";
    - post-as radios with "GitHub review" recommended and the default;
    - the AC-101 info text;
    - no secret input anywhere (AC-98 to AC-101, AC-108).
  - **Install:** two radio cards, "Open a PR with these files" (recommended, default) and "Copy files as a zip" (AC-103). Submit calls `useExportCi` with `edits` = the changed editable files only (AC-94).
    - Success (PR) → a PR link (`target="_blank" rel="noopener noreferrer"`) (AC-104); the CI tab updates through invalidation (AC-105).
    - Success (zip) → download (AC-106).
    - Error → stay on Install and show `ApiError.message` (AC-107).
- **Satisfies:** AC-84, AC-85 (preset), AC-88 to AC-108, NFR-5, NFR-6, NFR-7
- **Skills:** frontend-ui-architecture, react-best-practices, security
- **Insights:** `client/docs/insights.md:58` (a 422 hides the message in details — ci returns 400 / `AppError` with a top-level message); `client/docs/insights.md:87` (keyboard tests are structural in jsdom)
- **Owner:** implementer
- **Depends on:** Step 14
- **Done when:** `cd client && pnpm typecheck && pnpm arch:check && pnpm test` are green, and a manual run in `pnpm dev` walks all four steps in both themes.

### Step 16 — Add the CI Runs page and its sidebar entry
- **Files:**
  - `client/src/app/ci-runs/page.tsx` (NEW)
  - `client/src/app/ci-runs/_components/CiRunsView/{CiRunsView.tsx, helpers.ts, constants.ts, styles.ts, index.ts}` (NEW)
  - `client/src/vendor/ui/nav.ts`
- **Change:**
  - **Route:** a thin `page.tsx` (model: `client/src/app/eval/page.tsx`) reads `?agent=` and renders `CiRunsView`.
  - **Filters:** "Last 7 days" (`window`), "All agents" (`useAgents`), "All repos" (`useRepos`) and "All statuses" (AC-116).
  - **Refresh button:** `refetch()`; the label shows "Refreshing…" while fetching (AC-114). No auto-refresh label (AC-115).
  - **Warnings banner** above the table, naming each repo (AC-117).
  - **Table:** columns repository, pull request, agent, verdict, findings, cost, duration, job link (AC-109).
    - cost `null` → "—" (AC-110);
    - distinct labels and colours for `failed` vs `succeeded` vs `no_findings` (AC-111);
    - blockers shown for `succeeded` runs with blockers (AC-112);
    - every value rendered as a plain text node, with no `Markdown` component and no `dangerouslySetInnerHTML` (AC-113);
    - the job link opens in a new tab with `rel="noopener noreferrer"` (AC-119).
  - **Empty state:** the two existing strings (AC-118).
  - **Pager:** 50 per page, with Next driven by `has_more`.
  - **Sidebar:** add `{ key: "ci-runs", label: "CI Runs", icon: <existing icon name>, href: "/ci-runs" }` to the SKILLS LAB group in `nav.ts:34-42`. `activeKeyFor` already maps it (`client/src/components/app-shell/helpers.ts:39`).
- **Satisfies:** AC-87 (target), AC-109 to AC-119, NFR-5 to NFR-7
- **Skills:** frontend-ui-architecture, next-best-practices, react-best-practices, security
- **Insights:** `client/docs/insights.md:44` (nav labels live in two copies); `client/docs/insights.md:119` (new route types); `client/docs/insights.md:40` (do not strip markdown — render text as-is)
- **Owner:** implementer
- **Depends on:** Step 13
- **Done when:** after requesting `/ci-runs` once under `pnpm dev`, `cd client && pnpm typecheck && pnpm arch:check && pnpm test` are green, and the sidebar shows "CI Runs".

### Step 17 — Make the hermetic and CI e2e stacks able to preview and install
- **Files:** `scripts/e2e.sh`, `.github/workflows/e2e-web.yml`
- **Change:**
  - **`e2e.sh`:** after the `reviewer-core` install (`:120`), install `agent-runner` deps if missing (`pnpm install`) and run `pnpm build`. Then `export DEVDIGEST_CI_GITHUB_MOCK=true` before the API starts (`:137`).
  - **`e2e-web.yml`:**
    - the same `agent-runner` build after the reviewer-core `npm ci` step (`:77-80`);
    - `DEVDIGEST_CI_GITHUB_MOCK: 'true'` in the API step env;
    - `agent-runner/**` added to both `paths:` lists (`:14-24`).
  - `NODE_ENV` stays non-production in both.
- **Satisfies:** infrastructure for AC-125 (and AC-14's happy path on those stacks)
- **Skills:** security
- **Insights:** `docs/insights.md:65` (path filters decide whether CI runs); `e2e/docs/insights.md:57` (CI can miss e2e-breaking changes)
- **Owner:** implementer
- **Depends on:** Steps 5, 12
- **Done when:** `bash -n scripts/e2e.sh` is clean, and the workflow YAML parses (`node -e "require('yaml')…"` from `server/`, or an equivalent check).

### Step T1 — Server integration tests for the ci module
- **Files:** `server/test/ci.it.test.ts` (NEW)
- **Change:** run `buildApp` with a testcontainers Postgres, `overrides.github = MockGitHubClient` with fixtures, and a mock runner bundle. Cover:
  - routes AC-17, AC-18, AC-20, AC-32 to AC-35 and AC-131, with 400/404 and 0 mock calls;
  - AC-37 to AC-45 (`committed`, `openedPrs`, one installation row, state `pr_open`, `github_repo_id` 4242);
  - AC-46, AC-47 (zip decodes to exactly the files; 0 writes);
  - AC-52 to AC-64 through `GET /ci-runs`, with fixture runs and zips built by `zipFiles`;
  - AC-54 (two refreshes, one row);
  - AC-55, AC-56 (seeded PR linked vs. unknown PR null);
  - AC-57 (repo/PR counts unchanged);
  - AC-65 (one repo throws 403 → runs plus warning);
  - AC-68 to AC-72 (51 runs → 50 + `has_more`; filters; agent name from the installation; `behind` after an agent update);
  - AC-74: a linked CI run's cost appears in `GET /repos/:id/pulls` COST through the existing `totalCostByPr` (`server/src/modules/pulls/repository.ts:190-203`).
- **Satisfies:** proof for AC-17 to AC-20, AC-32 to AC-74, AC-131, AC-132, NFR-2
- **Skills:** backend-onion-architecture, drizzle-orm-patterns
- **Insights:** `server/docs/insights.md:64`
- **Owner:** test-writer
- **Depends on:** Step 11
- **Done when:** `cd server && pnpm exec vitest run ci.it` passes (**needs Docker**).

### Step T2 — Client component tests
- **Files:** `CiTab.test.tsx`, `ExportCiWizard.test.tsx`, `CiRunsView.test.tsx` (NEW, next to their components)
- **Change:** `vi.mock("…/lib/hooks/ci")` and assert:
  - AC-76 to AC-87 (badge count, row texts, behind, state label, the shared `ci_fail_on` mutation payload, the link href);
  - AC-88 to AC-108 (step labels, no CircleCI/Jenkins/CLI, editable-only textarea, edits kept across steps and sent, reset on reopen, chips default, Continue disabled, no secret input, error stays on Install);
  - AC-109 to AC-119 ("—" cost, failed vs succeeded labels, blockers, a `<b>` string rendered literally, Refresh calls `refetch`, no "auto-refresh on", warning banner, empty state, `target="_blank"`).
- **Satisfies:** proof for AC-75 to AC-119
- **Skills:** react-testing-library
- **Insights:** `client/docs/insights.md:87`; `client/docs/insights.md:102` (test files are cruised too)
- **Owner:** test-writer
- **Depends on:** Steps 14 to 16
- **Done when:** `cd client && pnpm test && pnpm arch:check` are green.

### Step T3 — Hermetic e2e flow 14
- **Files:** `e2e/specs/14-export-to-ci.flow.json` (NEW)
- **Change:**
  1. Open `/agents` and click a seeded built-in agent by `--exact` text.
  2. Open `?tab=ci`, wait for "CI deployment", click "+ Add to CI".
  3. Target: `acme/payments-api` is preselected → Continue.
  4. Preview: wait for each of the five path kinds, including `.devdigest/runner/index.js` and `.github/workflows/devdigest-review.yml` → Continue.
  5. Configure → Continue.
  6. Install: keep "Open a PR" → Install → wait for the PR link.
  7. Close, then wait for a row `acme/payments-api` with `pr_open`.
  
  Deterministic locators only; no model call.
- **Satisfies:** AC-125
- **Skills:** none (agent-browser flow JSON)
- **Insights:** `e2e/docs/insights.md:21` (`--exact` for buttons); `e2e/docs/insights.md:24` (`wait --url` is a substring); `e2e/docs/insights.md:30` (`--exact` on short text); `e2e/docs/insights.md:9` (stop dev web first)
- **Owner:** test-writer
- **Depends on:** Steps 15, 17
- **Done when:** `cd e2e && npm run e2e:hermetic` passes 14/14 (**needs Docker**; run by the main session or the user).

### Step T4 — Manual verification on real GitHub Actions
- **Files:** none
- **Change:** the user follows AC-126 to AC-130 on a fork of a demo repo:
  1. Export.
  2. Inspect the PR files.
  3. Set `OPENROUTER_API_KEY`.
  4. Merge.
  5. Open a same-repo test PR with a CRITICAL finding under `critical`, with the check marked required.
  6. Check the job log and artifact for the key.
  7. Refresh CI Runs.
- **Satisfies:** AC-126 to AC-130, NFR-9 (observe timings)
- **Skills:** none
- **Insights:** `docs/insights.md:84`
- **Owner:** user (manual)
- **Depends on:** all batches
- **Done when:** each AC-126 to AC-130 is observed and noted in `docs/plans/export-to-ci/verification.md`.

## Batches

| Batch | Steps | Why together | Gate at the end |
|---|---|---|---|
| B1 — contracts, port, DB | 1, 2, 3, 4 | Freezes everything other batches compile against: both shared copies, the server `GitHubClient` port with its implementations, and the schema | `diff` of both `eval-ci.ts` (only the known hunk); `cd reviewer-core && npm ci` (once); `cd server && pnpm typecheck && pnpm arch:check && pnpm exec vitest run --exclude '**/*.it.test.ts'`; `pnpm db:migrate` OK; `cd client && pnpm typecheck` |
| B2 — server module | 5, 6, 7, 8, 9, 10, 11 | One module from the centre outwards, plus its adapter and wiring | `cd server && pnpm typecheck && pnpm arch:check && pnpm exec vitest run --exclude '**/*.it.test.ts'` |
| B3 — agent-runner | 12 | Separate package; needs only B1's artifact schema | `cd agent-runner && pnpm typecheck && pnpm test && pnpm build`; `wc -c < dist/index.js` ≤ 5,242,880 |
| B4 — client | 13, 14, 15, 16 | Hooks and copy, then tab, wizard, page | `cd client && pnpm typecheck && pnpm arch:check && pnpm test` (request `/ci-runs` once under `pnpm dev` first) |
| B5 — e2e infrastructure | 17 | Needs the runner build (B3) and the mock switch (B2) | `bash -n scripts/e2e.sh`; workflow YAML parses |

**Order and parallelism.** B1 runs first and alone. After B1, **B2, B3 and B4 touch disjoint files**: `server/**` except shared; `agent-runner/**`; `client/**` except shared and its `messages`. Only B2 runs the server unit suite, so there is no `agent_runs` reaping race. They are therefore *parallel-safe by file set*, as SPEC-03's B2 ∥ B3 was (`docs/insights.md:203`). The pipeline rule is still "implementers never in parallel" (`.claude/agents/README.md:86`). The default is sequential: B1 → B2 → B3 → B4 → B5. Run B2 ∥ B3 ∥ B4 only if the user explicitly opts in. B5 always runs last. T1 to T3 are `test-writer` steps and are in no batch.

## Requirements coverage

| Requirement | Steps | Proved by |
|---|---|---|
| AC-1, AC-2 | 1, 12 | `server/test/contracts.test.ts`; `agent-runner/src/run.test.ts` |
| AC-3, AC-4, AC-5, AC-6 | 1 | `contracts.test.ts` |
| AC-7 | 1 | `diff` of both `eval-ci.ts` copies (known hunk only) |
| AC-8, AC-9, AC-10, AC-11, AC-12, AC-13 | 7, 8, 9 | `ci-helpers.test.ts`, `ci-service.test.ts`, T1 |
| AC-14, AC-15 | 5, 9 | `runner-bundle.test.ts`, `ci-service.test.ts` (no spawn; build message) |
| AC-16 | 7, 9 | `ci-helpers.test.ts`, `ci-service.test.ts` |
| AC-17, AC-18 | 9, 11 | T1 (404 / 400, 0 mock calls) |
| AC-19 | 7, 9 | `ci-helpers.test.ts` — **partially uncovered for an edited workflow (B-1)** |
| AC-20 | 1, 11 | `contracts.test.ts`, T1 |
| AC-21, AC-22, AC-23, AC-24, AC-25, AC-26, AC-27 | 7 | `ci-helpers.test.ts` (parsed YAML) |
| AC-28 | 7, 9 | `ci-helpers.test.ts` — **partially uncovered for an edited workflow (B-1)** |
| AC-29, AC-30, AC-31 | 7 | `ci-helpers.test.ts` |
| AC-32, AC-33, AC-34, AC-35, AC-131 | 7, 9, 11 | `ci-helpers.test.ts`, `ci-service.test.ts`, T1 |
| AC-36 | 9 | `ci-service.test.ts` (preview after edited install equals generated) |
| AC-37, AC-38, AC-39, AC-40, AC-41 | 2, 9 | `ci-service.test.ts`, T1 |
| AC-42 | 2, 9 | `ci-service.test.ts` (409, `committed` empty) |
| AC-43 | 9 | `ci-service.test.ts` (exact message, no upsert) |
| AC-44, AC-45 | 3, 8, 9 | T1 |
| AC-46, AC-47 | 7, 9 | `ci-service.test.ts`, T1 |
| AC-48, AC-49 | 2, 10 | `ci-ingest.test.ts`, T1 |
| AC-50, AC-51, AC-132 | 7, 10 | `ci-ingest.test.ts`, `ci-helpers.test.ts` |
| AC-52, AC-53, AC-54, AC-55, AC-56, AC-57, AC-58, AC-59, AC-60, AC-61 | 8, 10 | `ci-ingest.test.ts`, T1 |
| AC-62, AC-63, AC-64 | 10 | `ci-ingest.test.ts`, T1 |
| AC-65 | 10 | `ci-ingest.test.ts`, T1 |
| AC-66 | 2 | `grep -rn "Secret" server/src/adapters/github server/src/modules/ci` → none; code review |
| AC-67 | 9, 10 | `ci-ingest.test.ts` (captured logger has no sentinel token); `security-review` |
| AC-68, AC-69, AC-70 | 8, 10 | T1 |
| AC-71, AC-72 | 7, 8, 9 | `ci-helpers.test.ts`, T1 |
| AC-73 | — (boundary) | `git diff --stat main -- server/src/modules/pulls server/src/modules/reviews` is empty |
| AC-74 | 8 | T1 (pulls COST includes the CI run cost) |
| AC-75 to AC-87 | 13, 14 | T2 `CiTab.test.tsx` |
| AC-88 to AC-108 | 13, 15 | T2 `ExportCiWizard.test.tsx`; `ci.test.tsx` for AC-105, AC-106 |
| AC-109 to AC-119 | 13, 16 | T2 `CiRunsView.test.tsx`; grep for AC-102/AC-115 strings |
| AC-120, AC-121, AC-122, AC-123, AC-124 | 12 | `agent-runner/src/run.test.ts`, `context.test.ts` |
| AC-125 | 5, 17, T3 | `npm run e2e:hermetic` (flow 14) |
| AC-126 to AC-130 | T4 | manual on real GitHub Actions |
| NFR-1 | 5, 9, 12 | `wc -c` gate; `ci-service.test.ts` oversize case |
| NFR-2 | 8 | T1 (51 → 50 + `has_more`) |
| NFR-3 | 9, 10 | code review: no `container.llm` in `modules/ci`; `grep -n "llm" server/src/modules/ci` empty |
| NFR-4 | 5, 9 | code review: only `container.secrets` via `github()` |
| NFR-5 | 13 to 16 | review: no literal copy in the new components; `useTranslations("ci")` |
| NFR-6 | 14 to 16 | T2 structural keyboard tests; manual tab-through |
| NFR-7 | 14 to 16 | manual check under `data-theme="dark"` and `"light"` |
| NFR-8 | 10 | `ci-ingest.test.ts` (exactly one warn per rejection, no body) |
| NFR-9 | 9, 10 | manual timing (`curl -w '%{time_total}'`) during T4 |

## Skills the implementer must apply

| Path / glob | Skill | Why it applies |
|---|---|---|
| `server/src/vendor/shared/contracts/eval-ci.ts`, `client/src/vendor/shared/contracts/eval-ci.ts` | zod | The contract changes (optional fields, literal target, discriminated union) |
| `server/src/vendor/shared/adapters.ts`, `server/src/adapters/**` | backend-onion-architecture | New port methods and a new adapter + mock + override |
| `server/src/db/schema/ci.ts`, migrations | drizzle-orm-patterns, postgresql-table-design | New columns, FK indexes, unique keys for upsert and idempotency |
| `server/src/modules/ci/**` | backend-onion-architecture | A new module, placed by ring |
| `server/src/modules/ci/routes.ts` | fastify-best-practices | Zod type provider, `attachValidation`, response schemas |
| `server/src/modules/ci/{domain,helpers,service,ingest}.ts` | security | Untrusted edited workflow, untrusted artifact, token hygiene |
| `server/src/platform/{config,container,errors}.ts` | backend-onion-architecture, security | Composition root and a test-only switch that must stay off in production |
| `agent-runner/src/**` | typescript-expert, security | CI-only code that must not leak secrets |
| `client/src/lib/hooks/ci.ts` | react-best-practices, frontend-ui-architecture | All HTTP stays in hooks |
| `client/src/app/agents/[id]/_components/AgentEditor/**`, `client/src/app/ci-runs/**` | frontend-ui-architecture, react-best-practices, next-best-practices | New tab tree, wizard and route |
| `client/src/vendor/ui/nav.ts` | frontend-ui-architecture | A design-system extension |
| `**/*.test.ts(x)` | react-testing-library (client) | Test style |
| any `docs/insights.md` touched at session end | engineering-insights | Record the quirks listed at the bottom |

## Verification

| Command | cwd | Triggered by | Expected |
|---|---|---|---|
| `npm ci` (once) | `reviewer-core` | prerequisite for server and agent-runner typecheck/build | exit 0 |
| `pnpm typecheck` | `server` | `server/**/*.ts`, shared | exit 0 |
| `pnpm arch:check` | `server` | `server/src/**` | no new violation |
| `pnpm exec vitest run --exclude '**/*.it.test.ts'` | `server` | `server/src/**` | all pass (do not run during a live studio review: `server/docs/insights.md:64`) |
| `pnpm exec vitest run ci.it` | `server` | ci module, schema | pass — **needs Docker** |
| `pnpm db:generate` → `pnpm db:migrate` | `server` | `schema/ci.ts` | additive SQL; success line |
| `pnpm typecheck && pnpm test && pnpm build` | `agent-runner` | `agent-runner/**`, server shared copy | exit 0; `dist/index.js` ≤ 5,242,880 bytes |
| `pnpm typecheck` | `client` | `client/**/*.{ts,tsx}` | exit 0 (after requesting `/ci-runs` once) |
| `pnpm arch:check` | `client` | `client/src/**` | 0 violations |
| `pnpm test` | `client` | `client/src/**` | all pass |
| `npm run typecheck` | `e2e` | `e2e/**/*.ts` | exit 0 |
| `npm run e2e:hermetic` | `e2e` | flow 14, client, server, runner | 14/14 pass — **needs Docker**; stop dev web :3000 first (`e2e/docs/insights.md:9`) |
| `diff server/src/vendor/shared/contracts/eval-ci.ts client/src/vendor/shared/contracts/eval-ci.ts` | repo root | contracts | only the pre-existing Conformance `provider` hunk |
| `git diff --stat main -- server/src/modules/pulls server/src/modules/reviews` | repo root | AC-73 | empty |

## Risks, dead ends already recorded

- **New dependency: `yaml` (^2.6.1) in `server`.** Purpose: emit the manifest and parse the edited workflow (AC-9, AC-32 to AC-34, AC-131). Cost: one pure, zero-dependency package, already used by `agent-runner/package.json`. No zip dependency (Recommendation 5).
- `commitFiles` force-moves `devdigest/ci` (`server/src/modules/ci/docs/insights.md:12`). The AC-42 check must come before it, and the check rests on a commit-message trailer that a teammate could imitate. That is not a security boundary; branch protection is (Non-goals).
- `commitFiles` sends file contents inline in one `createTree` call (`octokit.ts:331-342`), with a 30 s timeout (`:19`). A ~5 MB runner bundle may hit GitHub's request limits or NFR-9's 10 s install budget. If T4 shows failures there, switch large files to `git.createBlob` first. That is an adapter-only change.
- **Posting `APPROVE` with the Actions `GITHUB_TOKEN` is often refused (422) unless the repo allows Actions to approve.** A zero-finding PR then throws after the artifact is written, and `runCi` exits 1 (`agent-runner/src/run.ts:152-156`, `:167-172`). The check goes red although the review passed. This is unverified here; T4 (AC-127) will show it. It is not in the spec. Raise it with `spec-creator` if confirmed.
- The runner always uses `OpenRouterProvider` (`agent-runner/src/index.ts:39`). An agent with `provider: openai` and a bare model id (e.g. `gpt-4o-mini`) may not resolve on OpenRouter in CI. Pick an OpenRouter model for T4.
- SC-1 (the export PR's own failing run), SC-2 (one manifest per repo) and SC-3 (slug collisions) remain user-visible until `spec-creator` resolves them.
- Ingest re-downloads and re-logs a rejected artifact on every refresh, because a rejection writes no record (AC-50, AC-51). The log volume per refresh is bounded by `INGEST_RUNS_PER_PAGE`. Runs older than that window are never ingested.
- CI runs linked to a PR will appear in that PR's run list (`server/src/modules/reviews/repository/run.repo.ts:76-83`) without a trace, so "Open run trace" there finds nothing. This is reviews-module behaviour, kept unchanged by AC-73.
- The ci-scoped mock switch (`DEVDIGEST_CI_GITHUB_MOCK`) is production-forced-off but still a test hook in production code. Ask `security-review` to confirm the scoping.
- Adding NOT NULL columns without defaults fails on non-empty tables. Step 4 checks the counts first.
- `zlib.crc32` exists only from Node 22.2. The zip writer carries its own CRC-32 table.
- A new route fails typecheck until Next regenerates its route types (`client/docs/insights.md:119`).
- `pnpm` may stop on the build-script approval gate in `server/` or `agent-runner/` (`docs/insights.md:180`).

## Open questions

- **Slug derivation (AC-8, AC-16):** assumed `slugify(name)` = lowercase, NFKD, runs outside `[a-z0-9._-]` → `-`, trim `-`, for both the agent and the skills. `..` stays reachable, so the AC-16 guard is testable on real names, e.g. `v1..v2`. Collisions → 400 (SC-3). The user or `spec-creator` confirms.
- **Disabled-but-attached skills:** AC-8 says "every skill attached", so the plan includes disabled ones. A studio review uses enabled skills only (the eval plan mirrors the enabled-only mapping of `server/src/modules/reviews/helpers.ts:31`). Confirm whether CI should match the studio.
- **"Job URL" (AC-53, AC-119, AC-130):** the plan uses the workflow run's `html_url`, which lists the job, rather than an extra `jobs` API call per run. Confirm that is acceptable for AC-130.
- **Cancelled runs:** a `cancelled` run with no artifact is stored as `failed` per AC-61. Only `skipped` runs (fork PRs) are ignored. Confirm.
- **`window` filter:** `CiRunsQuery.window` is `7d | all`, defaulting to `7d`. The spec names only "Last 7 days".
- **Action SHAs:** unknown until the implementer resolves them with `git ls-remote` (Step 7). None is written here.
- **ncc output:** assumed to be `dist/index.js` only (`agent-runner/docs/insights.md:9`). If `pnpm build` emits extra chunk files, the single-file bundle assumption of AC-8 breaks. Step 12's gate checks `ls dist`.
- **Stale anchor for `doc-writer`:** `server/src/modules/ci/docs/specs/export-to-ci.md:93` cites `octokit.ts:353-359` for the force update; the code agrees today. The root `.gitignore:3-6` comment ("dist/ MUST be committed") is contradicted by `agent-runner/.gitignore:2`.

## Handoff

1. `implementer`: B1, then B2 → B3 → B4 (sequential by default; B2 ∥ B3 ∥ B4 only if the user opts in, see Batches), then B5. Use one fresh run per batch, and each batch ends on its gate.
2. `plan-verifier` (Steps mode) against Steps 1 to 17.
3. `test-writer` for T1 (server IT, Docker), T2 (client) and T3 (flow 14). The main session or the user runs `npm run e2e:hermetic`.
4. `/code-review` over the whole diff.
5. `architecture-reviewer` for:
   - Step 2 (port extension in the shared copy);
   - Step 5 (new adapter, container switch);
   - Steps 7 to 11 (new module, ports, compose);
   - Steps 14 to 16 (new tab tree, route, `nav.ts`).
6. `security-review` for:
   - Step 7 (edited-workflow validation, workflow least-privilege, zip reader limits);
   - Steps 9 and 10 (untrusted artifact, verification, token hygiene in logs, 403/404 mapping);
   - Step 5 (the mock switch);
   - Step 12 (runner secrets);
   - Step 16 (plain-text rendering, `noopener`).
7. `implementer` on the review findings.
8. `plan-verifier` (Acceptance mode) against AC-1 to AC-132 and NFR-1 to NFR-9. Save the report as `docs/plans/export-to-ci/verification.md`.
9. The user runs T4 (AC-126 to AC-130).
10. `doc-writer`:
    - anchor the shipped `AC-N`s and set `Status: implemented`;
    - update the server README API map and the client README route map;
    - add the ci module `AGENTS.md` polish;
    - fix the stale `.gitignore` comment reference.
11. `pr-self-review` last.

`spec-creator` is needed for B-1 and SC-1 to SC-3. Recommendations 3 and 4 depend on its answers.

## Confidence

Medium. Every boundary, anchor and reused symbol was opened. The open items are real GitHub behaviours that only T4 can confirm:
- the inline 5 MB tree;
- Actions `APPROVE`;
- the export PR's own run;
- whether `size_in_bytes` reflects the JSON size;
- B-1.

These would raise confidence:
- `spec-creator`'s answer on B-1 and SC-1 to SC-3;
- a dry `pnpm db:generate` showing additive SQL;
- one real `pnpm build` of `agent-runner` showing a single `dist/index.js` under 5 MB;
- confirming that `attachValidation` works with `fastify-type-provider-zod` v4 on these routes.

---

Things worth recording via `engineering-insights`:
- `agent-runner/docs/insights.md` (or the root insights): `agent-runner/.gitignore:2` ignores `dist/` and overrides the root `.gitignore:3-6` un-ignore, whose comment ("its bundled dist/ MUST be committed") is stale. The bundle has to be built locally wherever the server previews or installs.
- `server/docs/insights.md`: there is no way to put the hermetic stack on `MockGitHubClient` globally. `PullsService.detail` refetches from GitHub and `replaceFiles` the seeded PR (`server/src/modules/pulls/service.ts:113-130`), so any GitHub mock for e2e must be scoped to one module.
- `server/src/modules/ci/docs/insights.md`: a `pull_request` workflow added by a PR runs on that same PR. With a base-commit checkout, the export PR's own run cannot find `.devdigest/runner/index.js` and fails.

## Plan amendments (2026-10-11, after spec re-approval)

SPEC-05 was re-approved after the decisions recorded in the top Changelog entries of `docs/specs/export-to-ci.md`. All six parts are `Status: approved`, with no `[NEEDS CLARIFICATION` markers. **Where this section and the plan above disagree, this section wins.**

### Resolved — remove from the plan

- `## Blocking` / B-1 is resolved: Configure wins. AC-19 and AC-28 are fully covered through AC-135 to AC-137.
- SC-1 → AC-140. SC-2 → AC-138, AC-139 and a new Non-goal. SC-3 → AC-133, AC-134. SC-4 stays as planned (mock switch scoped to the ci module).
- Recommendation 1 is reversed: validation errors are **422**, like the rest of the API. Recommendation 3 → AC-140. Recommendation 4 → AC-51. Recommendations 2, 5, 6 stand.
- Closed open questions: slug rule (AC-133); enabled skills only (AC-8); job URL = run `html_url` (AC-53); `cancelled` → `failed`, `skipped` ignored (AC-61, AC-141); window `7d | all` (AC-69, AC-142).

### Step changes

**Step 1 (contracts)** — no schema change. `CiRunsQuery.window` stays `z.enum(['7d','all']).default('7d')`. The `triggers` `.min(1)`/enum rule and `target: z.literal('gha')` fail through the route schema with the house 422 (AC-18, AC-20, `server/src/app.ts:128-129`). Contract-test status expectations → 422.

**Step 2 (GitHub port) — add delete capability and a tree listing**
- `CommitFilesPayload` (`server/src/vendor/shared/adapters.ts:153-160`, server copy only) gains `deletePaths?: string[]`.
- `OctokitGitHubClient.commitFiles` (`server/src/adapters/github/octokit.ts:331-342`) appends one tree entry per delete path, `{ path, mode: '100644', type: 'blob', sha: null }`, in the same `createTree` call on top of `base_tree` — still one commit (AC-37, AC-139). Only pass paths that exist in the parent tree; real-GitHub behaviour confirmed in T4.
- New `listTreePaths(repo, ref, prefixes): Promise<string[]>` — `git.getRef(heads/<ref>)` → `git.getCommit` → `git.getTree({ recursive: 'true' })`, keep blob paths under the prefixes; `[]` when the ref does not exist.
- `MockGitHubClient`: `commitFiles` records `deletePaths` in `committed[]`; `listTreePaths` derives its answer from cumulative `committed` files minus deletions (delegate, `server/docs/insights.md:45`), optionally seedable.
- Done when (added): `adapters.test.ts` mock shows a path committed, then deleted, then no longer listed.

**Step 3 (schema)** — replace the unique index `(agent_id, repo)` with a unique index on **`(workspace_id, repo)`** (AC-138); keep a plain index on `(agent_id)`. Same agent re-install stays an upsert (AC-45). If Step 4 already ran, change the schema and run `pnpm db:generate` again (index-only DROP/CREATE), then `pnpm db:migrate`. Never hand-edit the migration.

**Step 4 (migration)** — unchanged apart from the index above.

**Step 6 — dropped.** No `BadRequestError`, no `attachValidation`. Route-schema failures already answer 422; service-level rule failures throw the existing `ValidationError` (`server/src/platform/errors.ts:25-29`, 422) — AC-16, AC-32 to AC-35, AC-131, AC-134. Drop the Step 6 dependency from Steps 7, 9, 11.

**Step 7 (pure ring)**
- `slugify(name)` per AC-133: NFKD → lowercase → each run outside `[a-z0-9._-]` → one `-` → trim `-`. Used for the agent slug and every skill slug.
- `assertSafeSlugs(agent, enabledSkills)` throws `ValidationError`: a skill slug with `/`, `\` or `..` (naming the skill, AC-16); two enabled skills with the same slug (naming both, AC-134); an empty agent or skill slug (naming it, AC-134).
- `validateEditedWorkflow` gains a rule: at least one step whose trimmed `run` contains `node .devdigest/runner/index.js` (AC-131). All its errors are `ValidationError`.
- New `patchWorkflow(yamlText, { triggers, postAs })` (AC-135 to AC-137): `yaml.parseDocument` with the default YAML 1.2 core schema (**never `version: '1.1'`** — `on` parses to `true`); `doc.setIn(['on','pull_request','types'], triggers)`; for every step whose `run` contains the runner command, set `env.DEVDIGEST_POST_AS = postAs`; return `doc.toString()` (other keys, values and comments preserved).
- Edited-workflow pipeline: `validateEditedWorkflow` → `patchWorkflow` → `validateEditedWorkflow` again.
- New pure `stalePaths(existing, generated)`: existing paths matching `^\.devdigest/agents/[^/]+\.yaml$` or `^\.devdigest/skills/[^/]+\.md$` not in the generated set (AC-139). Never any other path.
- `verifyArtifact` also compares `installation_id` with the installation's id; missing or different = mismatch on that field (AC-51).
- New pure `shouldIngest(run)`: false when `head_branch === 'devdigest/ci'` (AC-140) or `conclusion === 'skipped'` (AC-141). `cancelled` passes through to the "no artifact → failed" rule (AC-61).
- `buildBundle` takes **enabled** skills only (AC-8), filtering `skill.enabled` from `linkedSkills` (`server/src/modules/agents/repository.ts:192-200`).
- Done when (added): edited workflow with comments and extra keys gets new triggers and post-as and is otherwise deep-equal; missing runner step rejected; slug cases (`"Security / OWASP"` → `security-owasp`, `"v1..v2"` → AC-16 reject, `"!!!"` → empty → 422); `stalePaths` never returns `.github/**` or `.devdigest/runner/**`; `shouldIngest` covers each branch.

**Step 8 (repository)** — `findInstallation(agentId, repo)` becomes `findInstallationByRepo(ws, repo)` returning the row with `agent_id`. Upsert `onConflictDoUpdate` target → `(workspace_id, repo)`. A unique violation from a racing install maps to the same 409.

**Step 9 (service)**
- Preamble for preview, zip and PR, in order: agent lookup (404) → repo lookup (404, AC-17) → read bundle (AC-14, NFR-1) → load enabled skills + `assertSafeSlugs` (AC-16, AC-133, AC-134).
- Install, both modes: right after the preamble, if `findInstallationByRepo` returns an installation with `agent_id ≠ agentId`, throw `new ConflictError('<repo> already has the DevDigest CI installation of another agent', …, 'ci_repo_has_other_agent')` before any GitHub call (AC-138). Then `validateEdits` (AC-35); edited workflow → validate → patch → validate (AC-32 to AC-34, AC-131, AC-135 to AC-137); an unedited workflow is regenerated from Configure choices (AC-19, AC-28). Zip mode returns as before (AC-46, AC-47).
- PR mode, after the AC-42 compare: `parentRef = compare === null ? repo.defaultBranch : CI_BRANCH`; `existing = await gh.listTreePaths(repoRef, parentRef, ['.devdigest/agents/', '.devdigest/skills/'])`; `commitFiles({ …, deletePaths: stalePaths(existing, generatedPaths) })` (AC-139). 403/404 mapping unchanged (AC-43).
- Done when (added): agent A installed on a repo → agent B's PR and zip installs 409 with 0 GitHub calls; renamed agent re-install deletes exactly the old `.yaml`; edited workflow + Configure `['reopened']`/`none` commits `types: [reopened]` and `DEVDIGEST_POST_AS: none`; every validation failure 422 with 0 calls.

**Step 10 (ingest)** — apply `shouldIngest` before artifact lookup; excluded runs are neither stored nor logged as rejections (AC-140, AC-141). `cancelled` without artifact → `failed` (AC-61). `verifyArtifact` includes `installation_id` (AC-51). Job URL = `run.html_url` (AC-53). Done when (added): a `devdigest/ci` run stores nothing and the installation stays `pr_open`; `skipped` stores nothing; `cancelled` stores `failed`; wrong/missing `installation_id` rejected with that field logged.

**Step 11 (routes)** — plain zod `schema` options, no `attachValidation`, no 400 branch.

**Step 12 (runner)** — unchanged (`installation_id` already in AC-120).

**Step 13 (client copy)** — add `runs.filters.allTime` (AC-142). AC-107 already shows 409 (AC-138) and 422 messages via `ApiError.message`.

**Step 15 (wizard)** — on 409 or 422 the Install step stays open and shows the message (AC-107).

**Step 16 (CI Runs page)** — time filter is a select over `7d` ("Last 7 days", default) and `all` (AC-69, AC-142).

**Step T1** — expect **422** for AC-16, AC-18, AC-20, AC-32 to AC-35, AC-131, AC-134. Add AC-138 (both modes), AC-139 (mock shows the stale manifest deleted), AC-140, AC-141.

**Step T2** — add AC-142 (select starts on "Last 7 days", offers "All time") and a 409 message shown on Install.

### Updated coverage rows (replace the matching rows)

| Requirement | Steps | Proved by |
|---|---|---|
| AC-8 | 7, 8, 9 | `ci-helpers.test.ts` (disabled attached skill absent), T1 |
| AC-16, AC-133, AC-134 | 7, 9 | `ci-helpers.test.ts`, `ci-service.test.ts` (422, 0 calls), T1 |
| AC-18, AC-20 | 1, 11 | `contracts.test.ts`, T1 (422) |
| AC-19, AC-28 | 7, 9 | `ci-helpers.test.ts`, `ci-service.test.ts` |
| AC-32–AC-35, AC-131 | 7, 9, 11 | `ci-helpers.test.ts` (incl. missing runner step), `ci-service.test.ts`, T1 |
| AC-135–AC-137 | 7, 9 | `ci-helpers.test.ts` (deep-equal of untouched keys), `ci-service.test.ts` |
| AC-37, AC-46 | 7, 9 | `ci-service.test.ts`, T1 |
| AC-138 | 3, 8, 9 | `ci-service.test.ts` (409 PR and zip, 0 GitHub calls), T1 |
| AC-139 | 2, 7, 9 | `adapters.test.ts`, `ci-helpers.test.ts`, `ci-service.test.ts`, T1; T4 for real `sha: null` |
| AC-51 | 7, 10 | `ci-helpers.test.ts`, `ci-ingest.test.ts` |
| AC-53 | 8, 10 | T1 (`job_url === run.html_url`) |
| AC-61, AC-140, AC-141 | 7, 10 | `ci-ingest.test.ts`, T1 |
| AC-62 | 10 | `ci-ingest.test.ts` (export-PR run does not flip `pr_open`) |
| AC-69, AC-142 | 1, 8, 16 | T1 (`window=all`), T2 `CiRunsView.test.tsx` |

### Batches (replaces the parallelism note)

The user opted in: **B1 alone**, then **B2 ∥ B3 ∥ B4**, then **B5** (overrides `.claude/agents/README.md:86`; precedent `docs/insights.md:203`).
- B1 owns every shared file: both `eval-ci.ts` copies, server `adapters.ts` (incl. `deletePaths`, `listTreePaths`), `octokit.ts`, `mocks.ts` (GitHub part), `schema/ci.ts`, the migration. B1 runs `cd reviewer-core && npm ci` once.
- B2 touches only `server/**`, never `server/src/vendor/shared/**`, `scripts/` or `.github/`; the only batch that runs the server unit suite. B2 = Steps 5, 7–11.
- B3 touches only `agent-runner/**`.
- B4 touches only `client/**`, never `client/src/vendor/shared/**`; may run `pnpm dev` once on :3000 for route types.
- Each parallel batch ends on its own gate. B5 starts only after all three are green.

### Risks (additions)

- `yaml` must stay on YAML 1.2 — under 1.1 `on:` becomes boolean `true`.
- `sha: null` deletion on a path absent from the parent tree is unverified; Step 9 passes only paths from `listTreePaths`; T4 confirms.
- The `(workspace_id, repo)` unique index makes AC-138 hold under concurrent installs.

### Handoff (changes only)

- `spec-creator` is no longer needed.
- `security-review` also covers `patchWorkflow`, `stalePaths` and Step 9's delete paths — deletion stays confined to `.devdigest/agents/*.yaml` and `.devdigest/skills/*.md`.
