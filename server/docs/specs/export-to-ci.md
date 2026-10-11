# Spec: Export to CI — server (shared contracts)

Spec ID: SPEC-05
Status: implemented
Overview: [../../../docs/specs/export-to-ci.md](../../../docs/specs/export-to-ci.md)

## Scope in this module

The server owns copy 1 of `@devdigest/shared`. This includes the CI contracts that the `ci` module, the studio and the bundled runner all compile against (the runner aliases this copy). This part holds the contract changes. The behaviour behind them lives in the `ci` module part, and the client copy must match it.

## Acceptance criteria (EARS)

- [x] AC-1 The `CiResultArtifact` schema shall accept the optional fields `repository`, `repository_id`, `head_sha`, `verdict`, `blockers`, `run_id`, `run_attempt`, `installation_id` and `model`, and an artifact that omits all of them shall still validate. — `server/src/vendor/shared/contracts/eval-ci.ts:293` (`CiResultArtifact`) · test: `server/test/contracts.test.ts:477` ("artifact without identity fields parses; with all fields parses; unknown keys are stripped")
- [x] AC-2 The `CiResultArtifact` schema shall define no field meant to carry a credential, API key or token value. — `server/src/vendor/shared/contracts/eval-ci.ts:293` (`CiResultArtifact`) · test: `server/test/contracts.test.ts:477` ("artifact without identity fields parses; with all fields parses; unknown keys are stripped")
- [x] AC-3 The `CiInstallation` schema shall expose the installation state as exactly one of `pr_open`, `active`, `pr_closed`. — `server/src/vendor/shared/contracts/eval-ci.ts:211` (`CiInstallationState`), `server/src/vendor/shared/contracts/eval-ci.ts:218` (`CiInstallation`) · test: `server/test/ci.it.test.ts:1143` ("returns repo, target, state, versions, and the latest stored run or null (AC-71)")
- [x] AC-4 The `CiInstallation` schema shall expose the installed agent version, the runner version, the PR URL and whether the installation is behind the agent's current version. — `server/src/vendor/shared/contracts/eval-ci.ts:218` (`CiInstallation`), `server/src/vendor/shared/contracts/eval-ci.ts:228` (`behind`) · test: `server/test/ci.it.test.ts:1143` ("returns repo, target, state, versions, and the latest stored run or null (AC-71)"), `server/test/ci.it.test.ts:1168` ("flags an installation behind only when the agent version is newer than the installed one (AC-72)")
- [x] AC-5 The `CiRun` schema shall expose repository, PR number, agent name, verdict, findings count, blocker count, cost (nullable), duration, head SHA, job URL and status. — `server/src/vendor/shared/contracts/eval-ci.ts:251` (`CiRun`) · test: `server/test/ci.it.test.ts:753` ("stores a verified artifact as a source=ci agent run with the run metadata, and reports the installation agent (AC-48, AC-49, AC-52, AC-53, AC-70)")
- [x] AC-6 `CiExportInput` shall accept `gha` as the only `target` value. — `server/src/vendor/shared/contracts/eval-ci.ts:176` (`CiExportInput.target`) · test: `server/test/contracts.test.ts:486` ("CiExportInput rejects other targets and bad triggers; applies defaults")
- [x] AC-7 Each schema change in this spec shall be identical in the server copy and the client copy of `@devdigest/shared`. — `server/src/vendor/shared/contracts/eval-ci.ts:293` (`CiResultArtifact`), `client/src/vendor/shared/contracts/eval-ci.ts:293` (`CiResultArtifact`) · untested

## Module notes

- The two copies have already drifted: `AgentManifest` exists only in the server copy (`server/src/vendor/shared/contracts/eval-ci.ts:152`, absent from `client/src/vendor/shared/contracts/eval-ci.ts:142-145`). Run `diff -rq server/src/vendor/shared client/src/vendor/shared` before changing a contract (`docs/insights.md:72`).
- `agent-runner` resolves `@devdigest/shared` to this copy, so a contract change here also changes the runner bundle (`agent-runner/AGENTS.md:56-57`).
- Schema changes go through `pnpm db:generate` only. Migrations are never hand-edited and do not run on boot (root `AGENTS.md:29`, `:34`).
