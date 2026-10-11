# B1 handoff (done, gates green, uncommitted)
Migration: server/src/db/migrations/0022_lowly_katie_power.sql (applied to isolated DB devdigest_export_ci).

Contracts (both @devdigest/shared copies, contracts/eval-ci.ts):
- CiExportInput: repo, target:'gha', mode:'open_pr'|'zip', post_as, triggers (enum opened|synchronize|reopened, min 1, default ['opened','synchronize']), edits[{path,contents}]. No base field.
- CiExportInputBody, CiPreviewQuery, CiPreview (files, installation_id, agent_version, runner_version).
- CiInstallationState, CiInstallation (+ state, agent_version, runner_version, pr_url, behind, updated_at, latest_run).
- CiExportResult discriminated on mode: open_pr → installation, pr_url; zip → filename, zip_base64.
- CiRun (new shape), CiRunStatus, CiRunsQuery (window 7d|all, agent_id, repo, status, page), CiRunsPage (runs, warnings, page, has_more).
- CiResultArtifact: new nullish repository, repository_id, head_sha, verdict, blockers, run_id, run_attempt, installation_id, model.
- Old CiExport removed; CiTarget, CiFile unchanged. AgentManifest/AgentManifestInput now in client copy too (client: import type only).

Port (server/src/vendor/shared/adapters.ts): types RepoInfo, CommitComparison, WorkflowRunMeta, RunArtifactMeta, ListWorkflowRunsOptions, PullState.
GitHubClient: getRepository(repo); compareCommits(repo, base, head) → null when head missing; listWorkflowRuns(repo, workflowFile, {status, perPage}); listRunArtifacts(repo, runId); downloadArtifact(repo, artifactId) → Uint8Array; getPullState(repo, n); listTreePaths(repo, ref, prefixes). CommitFilesPayload.deletePaths?: string[].
MockGitHubOptions: repository, workflowRuns, artifacts, artifactZips, pullStates, treePaths. Mock compareCommits/listTreePaths are per branch over `committed`.

Schema: ciInstallations workspaceId, repoId, githubRepoId, state, agentVersion, runnerVersion, prUrl, prNumber, updatedAt; unique (workspaceId, repo) `ci_installations_workspace_repo_uq`. ciRuns workspaceId, agentRunId, repo, headSha, githubRunId, runAttempt, artifactId; unique (ciInstallationId, githubRunId, runAttempt) `ci_runs_installation_run_attempt_uq`. Legacy ci_runs status/findingsCount/costUsd/source columns unused.
