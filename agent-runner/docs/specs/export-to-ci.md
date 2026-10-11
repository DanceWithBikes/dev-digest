# Spec: Export to CI — agent-runner

Spec ID: SPEC-05
Status: implemented
Overview: [../../../docs/specs/export-to-ci.md](../../../docs/specs/export-to-ci.md)

## Scope in this module

The runner is the code the generated workflow executes in the target repo. For this feature it adds the identity fields that let the server verify an artifact on ingest, and it keeps its existing guarantees: deterministic gate, diff only through the API, no secrets in outputs, exit 1 on any failure. It relies on the `ci` module to generate the workflow, which passes the post-as mode and the installation id and checks out the base commit.

## Acceptance criteria (EARS)

- [x] AC-1 The `CiResultArtifact` schema shall accept the optional fields `repository`, `repository_id`, `head_sha`, `verdict`, `blockers`, `run_id`, `run_attempt`, `installation_id` and `model`, and an artifact that omits all of them shall still validate. — `server/src/vendor/shared/contracts/eval-ci.ts:293` (`CiResultArtifact`) · test: `server/test/contracts.test.ts:477` ("artifact without identity fields parses; with all fields parses; unknown keys are stripped")
- [x] AC-2 The `CiResultArtifact` schema shall define no field meant to carry a credential, API key or token value. — `server/src/vendor/shared/contracts/eval-ci.ts:293` (`CiResultArtifact`) · test: `server/test/contracts.test.ts:477` ("artifact without identity fields parses; with all fields parses; unknown keys are stripped")
- [x] AC-120 WHEN the runner writes `devdigest-result.json`, it shall include `repository`, `repository_id`, `head_sha`, `verdict`, `blockers`, `run_id`, `run_attempt`, `installation_id` and `model`. — `agent-runner/src/artifact.ts:43` (`buildResultArtifact`), `agent-runner/src/run.ts:148` (`runCi`), `agent-runner/src/context.ts:81` (`resolvePrContext`) · test: `agent-runner/src/run.test.ts:319` ("AC-120/121: artifact carries all identity fields, with verdict/blockers from the deterministic gate (model said approve)"), `agent-runner/src/context.test.ts:9` ("reads repository id, run id/attempt, installation id from env and head sha from the event")
- [x] AC-121 The runner shall take `verdict` and `blockers` in the artifact from the deterministic gate against the manifest's `ci_fail_on`, never from the model's self-reported verdict. — `agent-runner/src/run.ts:143` (`runCi`), `agent-runner/src/run.ts:158` (`runCi`) · test: `agent-runner/src/run.test.ts:247` ("AC-23: verdict/blocker count come from the deterministic gate, never the model's self-reported verdict"), `agent-runner/src/run.test.ts:319` ("AC-120/121: artifact carries all identity fields, with verdict/blockers from the deterministic gate (model said approve)")
- [x] AC-122 The runner shall read the PR's changes only through the GitHub API diff, never from files of the PR head. — `agent-runner/src/run.ts:114` (`runCi`) · untested
- [x] AC-123 The runner shall write no value of `OPENROUTER_API_KEY` or `GITHUB_TOKEN` to `devdigest-result.json`, to stdout or stderr, or to any posted review or comment. — `agent-runner/src/artifact.ts:43` (`buildResultArtifact`) · test: `agent-runner/src/run.test.ts:365` ("AC-123: neither OPENROUTER_API_KEY nor GITHUB_TOKEN reaches the artifact, stdout/stderr or the posted payload")
- [x] AC-124 IF the runner fails before a grounded review exists, THEN it shall exit 1, as it does today. — `agent-runner/src/run.ts:183` (`runCi (catch)`), `agent-runner/src/run.ts:187` (`runCi`) · test: `agent-runner/src/run.test.ts:402` ("Q5: an LLM/model-call error hard-fails — non-zero exit, error status, nothing posted, no artifact, no synthetic review")

## Module notes

- The grounding gate, `<untrusted>` wrapping and the deterministic verdict are mandatory invariants. Never bypass them to make CI work (`agent-runner/AGENTS.md:61-70`).
- Reading `OPENROUTER_API_KEY` / `GITHUB_TOKEN` from `process.env` is the correct mechanism here. Never log them (`agent-runner/AGENTS.md:41-50`).
- `src/index.ts` changes affect every repo that already installed the bundle (`agent-runner/AGENTS.md:78-79`). Old bundles without the new fields are rejected on ingest (overview, Edge cases).
- `.devdigest/**` and `.github/workflows/**` stay excluded from the reviewed diff (`agent-runner/src/diff.ts:21`).
- `post_as` arrives through `DEVDIGEST_POST_AS`. This closes the open question at `agent-runner/docs/insights.md:37`.
- The server now rejects an artifact whose `installation_id` is missing or differs from the installation's id (overview AC-51), so AC-120's `installation_id` is load-bearing on ingest, not informational.
- The runner accepts exactly one manifest under `.devdigest/agents/` (`docs/plans/export-to-ci/plan.md:24`); the server keeps it that way with one agent per repo and stale-file pruning (overview AC-138, AC-139).
