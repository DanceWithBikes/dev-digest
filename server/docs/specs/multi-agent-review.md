# Spec: Multi-Agent Review — server

Spec ID: SPEC-06
Status: implemented
Overview: [../../../docs/specs/multi-agent-review.md](../../../docs/specs/multi-agent-review.md)

## Scope in this module

The server holds copy 1 of the `@devdigest/shared` contracts this feature changes. It holds the schema change that links each agent run to its parent `multi_agent_runs` row and stores the selected agents. The new multi-run service (parent list and detail reads, grouping heuristic, conflicts and estimates) is the `multi-agent` module under `src/modules/`; its criteria, AC-31 to AC-60, are in that module's part. The trigger and executor changes are in the `reviews` module part.

## Acceptance criteria (EARS)

### Contract (`@devdigest/shared`, copy 1)

- [x] AC-1 Every contract change in this section shall be identical in both copies of `@devdigest/shared`. — `server/src/vendor/shared/contracts/observability.ts:94` (`MultiAgentRun`) · untested (checked with `diff` of the two copies: empty for the four changed contract files)
- [x] AC-2 The `RunRequest` contract shall accept an optional `agentIds` field holding 1 to 6 agent id strings, alongside the unchanged `agentId` and `all` fields. — `server/src/vendor/shared/contracts/platform.ts:307` (`RunRequest.agentIds`) · test: `server/test/contracts.test.ts:475` ("RunRequest.agentIds accepts 1 and 6 ids and rejects 0 and 7 (AC-2, NFR-1)")
- [x] AC-3 The response of `POST /pulls/:id/review` shall carry a `multi_agent_run_id` field that holds the parent run id when the request used `agentIds` and is null otherwise. — `server/src/vendor/shared/contracts/review-api.ts:57` (`ReviewRunResponse.multi_agent_run_id`), `server/src/modules/reviews/routes.ts:56` (`POST /pulls/:id/review response`) · test: `server/test/multi-agent.it.test.ts:352` ("creates one run per distinct id plus one parent holding the ids in request order (AC-13, AC-14, AC-15, AC-3)"), `server/test/multi-agent.it.test.ts:412` ("creates no parent and returns multi_agent_run_id null for agentId and for all (AC-3, AC-18)")
- [x] AC-4 The `AgentColumn` contract's `status` shall accept exactly `queued`, `running`, `done`, `failed` and `cancelled`. — `server/src/vendor/shared/contracts/observability.ts:45` (`AgentColumn.status`) · test: `server/test/multi-agent.it.test.ts:312` ("GET /multi-agent-runs/:id returns 2 done columns and 2 groups with 1 conflict")
- [x] AC-5 Each finding in an `AgentColumn` shall carry the full finding record: id, severity, category, title, file, start line, end line, rationale, suggestion, confidence, kind, and the accepted, dismissed and learned timestamps. — `server/src/vendor/shared/contracts/observability.ts:53` (`AgentColumn.findings`), `server/src/vendor/shared/contracts/review-api.ts:15` (`FindingRecord`) · test: `server/test/multi-agent.it.test.ts:312` ("GET /multi-agent-runs/:id returns 2 done columns and 2 groups with 1 conflict")
- [x] AC-6 The finding record contract shall carry a nullable `learned_at` timestamp. — `server/src/vendor/shared/contracts/review-api.ts:19` (`FindingRecord.learned_at`), `server/src/db/schema/reviews.ts:47` (`findings.learnedAt`), `server/src/db/migrations/0023_smart_komodo.sql:1` (`ADD COLUMN "learned_at"`) · test: `server/test/multi-agent.it.test.ts:563` ("Learn sets learned_at, keeps accept/dismiss, and makes no model call or memory/eval row (AC-26, AC-28, AC-29)")
- [x] AC-7 The `ConflictTake` contract's `verdict` shall accept a severity, `ignored` or `no_result`. — `server/src/vendor/shared/contracts/observability.ts:65` (`ConflictTake.verdict`) · test: `server/test/contracts.test.ts:484` ("ConflictTake verdict is a severity, ignored or no_result and nothing else (AC-7-AC-9)")
- [x] AC-8 The `ConflictTake` contract's `note` shall be nullable. — `server/src/vendor/shared/contracts/observability.ts:66` (`ConflictTake.note`) · test: `server/test/multi-agent-domain.test.ts:288` ("marks a done column without members ignored with a null note (AC-55)")
- [x] AC-9 The `MultiAgentRun` contract shall carry a `status` of exactly one of `running`, `done`, `failed` or `partial`. — `server/src/vendor/shared/contracts/observability.ts:100` (`MultiAgentRun.status`) · test: `server/test/multi-agent.it.test.ts:312` ("GET /multi-agent-runs/:id returns 2 done columns and 2 groups with 1 conflict")
- [x] AC-10 The `MultiAgentRun` contract shall carry a boolean `cost_partial`. — `server/src/vendor/shared/contracts/observability.ts:105` (`MultiAgentRun.cost_partial`) · test: `server/test/contracts.test.ts:493` ("MultiAgentRunSummary requires cost_partial and allows a null total cost") (the test covers `MultiAgentRunSummary`, which carries the same field)
- [x] AC-11 The `MultiAgentRun` contract shall carry, in place of its current `conflicts` list, a list of location groups, each with file, start line, end line, title, a boolean `conflict`, its members (finding id and agent id per member) and its takes (one `ConflictTake` per selected agent). — `server/src/vendor/shared/contracts/observability.ts:82` (`LocationGroup`), `server/src/vendor/shared/contracts/observability.ts:107` (`MultiAgentRun.groups`) · test: `server/test/multi-agent.it.test.ts:312` ("GET /multi-agent-runs/:id returns 2 done columns and 2 groups with 1 conflict")
- [x] AC-12 A run-estimate contract shall carry agent id, median duration in ms (nullable), median cost in USD (nullable) and the number of runs the medians were computed from. — `server/src/vendor/shared/contracts/observability.ts:127` (`RunEstimate`) · test: `server/test/contracts.test.ts:504` ("RunEstimate allows null medians with runs 0 (AC-60)")

### Parent run persistence

- [x] AC-14 WHEN `POST /pulls/:id/review` is requested with `agentIds`, the API shall create exactly one parent multi-agent run for that PR. — `server/src/modules/reviews/service.ts:153` (`ReviewService.runReview`), `server/src/modules/reviews/repository/run.repo.ts:242` (`createMultiAgentLaunch`) · test: `server/test/multi-agent.it.test.ts:352` ("creates one run per distinct id plus one parent holding the ids in request order (AC-13, AC-14, AC-15, AC-3)")
- [x] AC-15 WHEN `POST /pulls/:id/review` is requested with `agentIds`, every agent run it creates shall reference that parent run. — `server/src/modules/reviews/repository/run.repo.ts:271` (`createMultiAgentLaunch (multiAgentRunId)`), `server/src/db/schema/runs.ts:36` (`agentRuns.multiAgentRunId`) · test: `server/test/multi-agent.it.test.ts:352` ("creates one run per distinct id plus one parent holding the ids in request order (AC-13, AC-14, AC-15, AC-3)")

### Multi-run service (moved)

AC-31 to AC-60 (parent list and detail reads, status, totals, location groups, takes, conflicts and estimates) live in the `multi-agent` module part: [server/src/modules/multi-agent/docs/specs/multi-agent-review.md](../../src/modules/multi-agent/docs/specs/multi-agent-review.md). Their numbers are unchanged.

### Seed

- [x] AC-125 The server seed shall create, idempotently, one finished parent run on a seeded PR with 2 `done` child runs whose persisted findings form at least 1 location group with `conflict` true. — `server/src/db/seed.ts:477` (`seedMultiAgentRun`), `server/src/db/seed.ts:309` (`seed (call site)`) · test: `server/test/multi-agent.it.test.ts:293` ("the seed leaves exactly one parent run, on PR #484"), `server/test/multi-agent.it.test.ts:303` ("GET /multi-agent-runs lists the seeded parent as done"), `server/test/multi-agent.it.test.ts:312` ("GET /multi-agent-runs/:id returns 2 done columns and 2 groups with 1 conflict"), `server/test/multi-agent.it.test.ts:343` ("seeding a third time after parents exist still leaves the seeded PR with one parent (AC-125)")

## Module notes

- The seed must stay idempotent, because it runs on every `dev.sh` (AC-125) — `../../src/db/AGENTS.md` ("`seed.ts` must stay idempotent").

- `@devdigest/shared` exists in two copies, and both must change together — `../../../AGENTS.md:28`.
- Migrations are generated by `pnpm db:generate` only and never hand-edited. They do not run on boot — `../../../AGENTS.md:29`, `../../../AGENTS.md:34`.
- `multi_agent_runs` was a stub (id, workspace, PR, ran_at). It was extended, not renamed or dropped: `agent_ids` was added to it, and `agent_runs` gained `multi_agent_run_id`, `started_at` and `finished_at` (migration 0022, generated) — `../../src/db/schema/runs.ts:51`, `../../src/db/schema/runs.ts:36`, `../../src/db/migrations/0023_smart_komodo.sql:1`, `../../src/db/AGENTS.md` ("Don't rename or drop existing tables").
- The new `multi-agent` module is registered in `src/modules/index.ts` (`../../src/modules/index.ts:17`, `:48`) and carries its own `AGENTS.md`, `CLAUDE.md` symlink, `docs/specs/` and `docs/insights.md` — `../../src/modules/AGENTS.md` (Adding a module), `../../src/modules/multi-agent/AGENTS.md`.
- The `multi-agent` module reads `agent_runs`, `findings` and `agents` from its own repository, not through the `reviews` module's folder — `../../src/modules/multi-agent/repository.ts:32`, `../../src/modules/AGENTS.md` ("Never import another module's folder").
