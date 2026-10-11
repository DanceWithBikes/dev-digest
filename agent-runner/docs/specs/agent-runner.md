# Agent Runner (CI)

> Introduced in: L07. Refs are `path:line` (`symbol`) at the time of writing — if a line moved,
> search for the symbol. Written as-built; the `AC-NN` labels inside test names come from the
> original CI-export plan and are kept only as search anchors.

## Goal

Run a DevDigest review agent inside a target repository's own GitHub Actions, with the same
`reviewer-core` pipeline a studio review uses, and turn the grounded result into a PR review,
a `devdigest-result.json` artifact and a deterministic exit code — without the server, its DI
graph or Postgres. `src/index.ts` is `ncc`-bundled into one self-contained `dist/index.js`.

## Acceptance criteria

### Inputs
- [x] Exactly one `.devdigest/agents/*.yaml` manifest is loaded and validated against `AgentManifest` before anything else runs; zero, several, malformed YAML or a schema failure is a hard failure — `agent-runner/src/manifest.ts:80` (`loadManifest`) · test: `agent-runner/src/manifest.test.ts:30` ("loads and validates a well-formed manifest against the AgentManifest schema"), `:41`, `:56`, `:61`, `:66`, `:72`, `agent-runner/src/run.test.ts:198` ("AC-20: fails clearly … before any LLM call is made")
- [x] Skill bodies listed by the manifest are read from `.devdigest/skills/<slug>.md`; a missing file is a hard failure — `agent-runner/src/skills.ts:12` (`loadSkillBodies`) · untested
- [x] PR owner/repo/number/title/body come from `GITHUB_REPOSITORY`, `PR_NUMBER` (falling back to the event's `pull_request.number`) and `GITHUB_EVENT_PATH`; a number that is not a positive integer is a hard failure — `agent-runner/src/context.ts:63` (`resolvePrContext`) · untested
- [x] DevDigest's own exported files (`.devdigest/**`, `.github/workflows/**`) are stripped from the PR diff before parsing — `agent-runner/src/diff.ts:34` (`stripIgnoredFiles`) · test: `agent-runner/src/diff.test.ts:91` ("drops the .devdigest/ runner bundle (the source of the GitHub 422)"), `:96`, `:101`, `:110`
- [x] The unified diff parser reports exact new-side line numbers per hunk (no phantom trailing line) — `agent-runner/src/diff.ts:63` (`parseUnifiedDiff`) · test: `agent-runner/src/diff.test.ts:22` ("parses a single-file, single-hunk diff into files + hunks + new-side line numbers"), `:42`, `:48`

### Review
- [x] The review goes through `reviewer-core`'s `reviewPullRequest`, so the diff and PR body are wrapped as `<untrusted>` with the injection guard and the grounding gate always runs — `agent-runner/src/run.ts:118` (`runCi` → `reviewPullRequest`) · test: `agent-runner/src/run.test.ts:213` ("AC-21: the assembled prompt fences the diff and PR body as <untrusted> and carries the injection guard")
- [x] A run where grounding drops every finding is a successful zero-finding review — `agent-runner/src/run.ts:83` (`runCi`) · test: `agent-runner/src/run.test.ts:234` ("AC-22: an all-dropped grounding result is a valid zero-finding success, not an error")
- [x] Verdict, blocker count and gate come from the grounded findings and the manifest's `ci_fail_on` (`toReviewPayload` / `countBlockers` / `gateTriggered`), never the model's self-reported verdict — `agent-runner/src/run.ts:132` (`runCi` → `toReviewPayload`) · test: `agent-runner/src/run.test.ts:247` ("AC-23: verdict/blocker count come from the deterministic gate, never the model's self-reported verdict")
- [x] The posted payload equals a direct local `reviewPullRequest` + `toReviewPayload` run on the same diff and model output — test: `agent-runner/src/run.test.ts:334` ("AC-36: parity …")

### Outputs
- [x] `devdigest-result.json` is written before posting and passes `CiResultArtifact.safeParse` — `agent-runner/src/artifact.ts:32` (`buildResultArtifact`) · test: `agent-runner/src/run.test.ts:301` ("AC-26: the written devdigest-result.json passes CiResultArtifact.safeParse")
- [x] `post_as` = `github_review` posts a PR review, `pr_comment` posts an issue comment, `none` posts nothing; `GITHUB_TOKEN` is required unless `none` — `agent-runner/src/run.ts:152` (`runCi`), `agent-runner/src/github.ts:48` (`postGithubReview`), `:97` (`postPrComment`) · test: `agent-runner/src/run.test.ts:262`, `:277`, `:289`
- [x] The exit code is 1 iff the gate triggered `REQUEST_CHANGES`, otherwise 0 — `agent-runner/src/run.ts:160` (`runCi`) · test: `agent-runner/src/run.test.ts:262` ("AC-24 + AC-25: post_as=\"github_review\" posts a review and exits non-zero on a triggered gate"), `:289`
- [x] Any failure before a grounded review exists (manifest, skills, context, diff fetch, model call) exits 1, posts nothing and writes no artifact — `agent-runner/src/run.ts:167` (`runCi` catch) · test: `agent-runner/src/run.test.ts:319` ("Q5: an LLM/model-call error hard-fails …")

## Touched packages / modules
- `agent-runner/` — the whole package (new).
- Consumes, unchanged: `reviewer-core/src/index.ts` and `server/src/vendor/shared` via tsconfig path aliases (`agent-runner/tsconfig.json`).

## Open questions
- `post_as` reaches the runner only through the optional `DEVDIGEST_POST_AS` env var (default `github_review`) — `agent-runner/src/index.ts:25` (`resolvePostAs`). `CiExportInput.post_as` exists in `server/src/vendor/shared/contracts/eval-ci.ts:179`, but nothing in this repo generates the workflow that would pass it: `server/src/modules/ci/` (referenced from `agent-runner/src/index.ts:5`) does not exist yet.
- `loadSkillBodies` and `resolvePrContext` failure paths have no direct test.
