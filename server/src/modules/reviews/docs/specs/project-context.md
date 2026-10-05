# Spec: Project Context — server/modules/reviews

Spec ID: SPEC-01
Status: approved
Overview: [../../../../../../docs/specs/project-context.md](../../../../../../docs/specs/project-context.md)

## Scope in this module

The review run collects the documents attached to the agent and to its enabled linked skills for the PR's repo, reads each one at the PR head (with fallbacks), and passes them to the review engine. It logs what was sent or skipped and records every collected document in the run trace. It does the same for runs triggered through the MCP server. It relies on the attachments stored by the `project-context` module, and on the engine in `reviewer-core` for rendering.

## Acceptance criteria (EARS)

- [ ] AC-3 The `@devdigest/shared` run-trace contract shall hold one attached-document entry per collected path, carrying the path, the origin (`agent` or `skill: <name>`), the version read (a commit SHA or `working-tree`), the status (`sent` or `not_found`), the estimated token count, and the exact text sent (null when not found).
- [ ] AC-4 The run trace's `specs_read` list shall name the path of every attached document whose status is `sent`, in prompt order.
- [ ] AC-11 The API shall compute every estimated token count of this feature as ceil(characters / 4) of the text it measures.
- [ ] AC-22 WHEN a review run starts for an agent on a PR, the run executor shall collect the agent's attached paths for the PR's repo first, then the attached paths for that repo of each of the agent's linked skills, in skill link order, taking each owner's paths in ascending path order.
- [ ] AC-23 The run executor shall collect a path that is attached more than once only once, keeping the origin of its first occurrence.
- [ ] AC-24 IF a linked skill is disabled globally, THEN the run executor shall collect none of that skill's attached paths.
- [ ] AC-25 The run executor shall never collect attachments saved for a repo other than the PR's repo.
- [ ] AC-26 WHEN the run executor reads a collected document, it shall try the PR's head commit first, then the PR head fetched from the remote, then the clone's working tree, and use the first read that succeeds.
- [ ] AC-27 The run executor shall record, for each sent document, the version it was read from.
- [ ] AC-28 IF a collected document cannot be read at any of those versions, or its path resolves outside the repo's clone, THEN the run executor shall skip that document and continue the run.
- [ ] AC-29 IF the run executor skips a collected document, THEN the run's live log shall contain a line naming that path and the words "not found".
- [ ] AC-30 The run executor shall send every readable collected document in full, without truncation and without skipping for size.
- [ ] AC-31 Collecting and sending project context shall add zero model calls to a review run.
- [ ] AC-32 WHEN a run sends at least one attached document, the run's live log shall contain a line with the number of documents sent and their total estimated token count.
- [ ] AC-33 WHEN a run completes, its persisted trace shall hold the attached-document entries of every collected path, both `sent` and `not_found`.
- [ ] AC-34 The text recorded in a `sent` attached-document trace entry shall equal, byte for byte, the escaped text between that document's opening and closing delimiters in the prompt the model received.
- [ ] AC-67 WHEN a review run is triggered through the MCP server, the run executor shall collect, read, send and record attached documents exactly as for a run triggered from the studio.

## Module notes

- This module only does I/O; the prompt rendering, the grounding and `INJECTION_GUARD` live in `reviewer-core` and must not be duplicated here — `server/src/modules/reviews/AGENTS.md` (Do-not-touch).
- Every run ends with ONE `run_traces` document, also on failure or cancel — `server/src/modules/reviews/AGENTS.md`.
- The Intent Layer's linked-spec read already uses the PR head → fetched PR head → working tree order. The clone's working tree follows only the default branch — `server/src/modules/reviews/docs/insights.md:61` (and the correction at `:64`).
- Another module's tables are read through a query in this module's own repository, not a new container getter — `server/src/modules/reviews/docs/insights.md:69`.
- MCP-triggered reviews enter through the same review service as the studio, so AC-67 holds if collection lives in the shared run path — `server/src/mcp/compose.ts:64`.
- An optional enrichment is best-effort and never fails the run; AC-28 applies this to context documents, unlike skill bodies, which fail the run on a load error — `server/src/modules/reviews/run-executor.ts:523`.
