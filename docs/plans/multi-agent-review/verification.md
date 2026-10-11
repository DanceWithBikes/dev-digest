# Plan verification: SPEC-06 Multi-Agent Review (`docs/specs/multi-agent-review.md`, plan `docs/plans/multi-agent-review/plan.md`)

Repo root for every relative path below: `/Users/detrix/emdash/worktrees/dev-digest-82ca6d50/emdash-multi-agent-review-7c2jf`. Test files are shortened as follows:
- **MAIT** = `server/test/multi-agent.it.test.ts`
- **MAD** = `server/test/multi-agent-domain.test.ts`
- **MAH** = `server/test/multi-agent-helpers.test.ts`
- **RIS** = `server/test/reviews-run-in-slots.test.ts`
- **CT** = `server/test/contracts.test.ts`
- **RVT** = `client/src/app/multi-agent-review/_components/MultiAgentResultsView/MultiAgentResultsView.test.tsx`
- **DST** = `…/DisagreementSection/DisagreementSection.test.tsx`
- **CRT** = `…/ConfigureRunView/ConfigureRunView.test.tsx`
- **IVT** = `…/MultiAgentIndexView/MultiAgentIndexView.test.tsx`
- **RPT** = `client/src/app/repos/[repoId]/pulls/[number]/_components/RunReviewPopover/RunReviewPopover.test.tsx`

## Verdict

**Mode: Acceptance.** **INCOMPLETE.** The checklist has 135 items: AC-1…AC-125 (none struck through) plus NFR-1…NFR-10.

- Met: 124 of 135
- Partially met: 11 of 135 (AC-62, AC-63, AC-74, AC-77, AC-78, AC-82, AC-98, NFR-7, NFR-8, NFR-9, NFR-10)
- Not met: 0 of 135
- Cannot verify: 0 of 135

**Is the plan done?** Not fully. Every server, contract, seed and boundary criterion is met with a passing test. Eleven criteria fall short:
- Five come from one deliberate UI change that the spec never recorded: the 6-agent cap.
- One is a `?pr=` behaviour that contradicts AC-74.
- The rest are a queued column with no live log, a second SSE connection when the trace drawer is open, hard-coded "—" placeholders, a finding accordion you can't open by keyboard, and NFR-10 logging with no test behind it.

This verdict is advisory. The pre-PR gate is `pr-self-review`.

## Checklist

| # | Item | Verdict | Evidence |
|---|---|---|---|
| AC-1 | Every contract change … identical in both copies | Met | `diff` of observability/review-api/platform/findings between copies: empty (the only drift is in untouched files, pre-existing) |
| AC-2 | `RunRequest` … optional `agentIds` 1 to 6 | Met | `server/src/vendor/shared/contracts/platform.ts:307`; CT:475 pass |
| AC-3 | response … `multi_agent_run_id` | Met | `review-api.ts:57`; `reviews/routes.ts` returns it; MAIT:352, :412 pass |
| AC-4 | `AgentColumn` `status` … five values | Met | `observability.ts:45` |
| AC-5 | Each finding in an `AgentColumn` … full finding record | Met | `observability.ts:53` (`z.array(FindingRecord)`); `review-api.ts:19` |
| AC-6 | finding record … nullable `learned_at` | Met | `review-api.ts:19`; `schema/reviews.ts` `learnedAt`; migration 0022 |
| AC-7 | `ConflictTake` `verdict` … severity, `ignored`, `no_result` | Met | `observability.ts:65`; CT:484 |
| AC-8 | `ConflictTake` `note` nullable | Met | `observability.ts:66` |
| AC-9 | `MultiAgentRun` `status` … four values | Met | `observability.ts:100`; CT:484 |
| AC-10 | `MultiAgentRun` … boolean `cost_partial` | Met | `observability.ts:105`; CT:493 |
| AC-11 | … list of location groups … | Met | `observability.ts:80-90`, `:107` |
| AC-12 | run-estimate contract … | Met | `observability.ts:127` (`RunEstimate`); CT:504 |
| AC-13 | one agent run per distinct listed agent id | Met | `service.ts` `resolveTargets` `dedupeIds`; MAIT:352 |
| AC-14 | exactly one parent multi-agent run | Met | `run.repo.ts:242` `createMultiAgentLaunch`; MAIT:352 |
| AC-15 | every agent run … reference that parent | Met | `run.repo.ts` `multiAgentRunId: parent!.id`; MAIT:352 |
| AC-16 | unknown id → 404, nothing created | Met | `service.ts:69-74`; MAIT:370 |
| AC-17 | empty or >6 → 400, nothing created | Met | `routes.ts:36-39`; MAIT:380, :391 |
| AC-18 | `agentId`/`all` … as before, no parent | Met | `service.ts` else-branch; MAIT:412 |
| AC-19 | diff and intent once per launch | Met | `run-executor.ts:125-139`; MAIT:512 |
| AC-20 | at most 4 … `running` | Met | `run-executor.ts:147` `runInSlots(jobs, MAX_PARALLEL_AGENTS…)`; MAIT:437; RIS:93 |
| AC-21 | ≤4 agents … all running before any settles | Met | `helpers.ts:177` `runInSlots`; MAIT:465; RIS:74 |
| AC-22 | next queued in request order | Met | MAIT:437; RIS:93 |
| AC-23 | one failure … others to final status | Met | MAIT:478; RIS:118 |
| AC-24 | diff cannot be loaded → every run `failed` | Met | `diff-loader.ts:33`, `run-executor.ts:130`; MAIT:498 (not `it.fails`) |
| AC-25 | MCP … at most 4 running | Met | `mcp/compose.ts:64` shares `runReview`; `mcp.it.test.ts:266` pass |
| AC-26 | learn … persist time, `learned_at` non-null | Met | `findings.ts:31`; `review.repo.ts:167`; MAIT:563 |
| AC-27 | learn outside workspace → 404 | Met | `findings.ts:17-19`; MAIT:607 |
| AC-28 | learn leaves accepted/dismissed unchanged | Met | `review.repo.ts:167` sets only `learnedAt`; MAIT:563, :595 |
| AC-29 | learn … no model call, memory, eval | Met | MAIT:563 |
| AC-30 | no `POST /findings/:id/reply` route | Met | `routes.ts:20` `FINDING_ACTIONS`; MAIT:625 |
| AC-31 | `GET /multi-agent-runs` newest first with fields | Met | `multi-agent/repository.ts:45`; MAIT:664 |
| AC-32 | `GET …/:id` … columns in selection order | Met | `domain.ts:113` `orderColumns`; MAIT:676 |
| AC-33 | unknown/foreign parent → 404 | Met | `service.ts:22-25`; MAIT:323, :688; MAH:137 |
| AC-34 | any child queued/running → `running` | Met | `domain.ts:86`; MAD:74; MAIT:701 |
| AC-35 | all done → `done` | Met | `domain.ts:88`; MAD:78 |
| AC-36 | all failed/cancelled → `failed` | Met | `domain.ts:89`; MAD:81; MAIT:498 |
| AC-37 | mixed → `partial` | Met | `domain.ts:89`; MAD:84; MAIT:478 |
| AC-38 | total cost = sum | Met | `domain.ts:101-104`; MAD:96 |
| AC-39 | missing cost → `cost_partial: true` | Met | `domain.ts:105`; MAD:101 |
| AC-40 | duration earliest start → latest settle | Met | `domain.ts:93-99`; `run.repo.ts:187`, `:223`; MAD:111 |
| AC-41 | score null unless `done` | Met | `domain.ts:129`; MAD:132 |
| AC-42 | grouping rule (file, ≤3 lines, ≥0.5) | Met | `domain.ts:166-175`; MAD:172, :180, :192 |
| AC-43 | title normalisation, Jaccard | Met | `domain.ts:138-154`; MAD:159-166 |
| AC-44 | transitive grouping | Met | `domain.ts:181` union-find; MAD:209 |
| AC-45 | every done-run finding in exactly one group | Met | `domain.ts:288-296`; MAD:222, :328 |
| AC-46 | members carry original ids | Met | `domain.ts:305`; MAD:227 |
| AC-47 | order by file, then start line | Met | `domain.ts:247-249`; MAD:231 |
| AC-48 | start = min, end = max | Met | `domain.ts:240-241`; MAD:244 |
| AC-49 | title from most severe, confidence, selection order | Met | `domain.ts:231-237`; MAD:257-263 |
| AC-50 | computed at read time, none persisted | Met | MAIT:631 |
| AC-51 | conflict when a done agent did not flag | Met | `domain.ts:276-282`; MAD:298 |
| AC-52 | conflict when take verdicts differ | Met | `domain.ts:281`; MAD:301, :310 |
| AC-53 | one take per selected agent | Met | `domain.ts:256-270`; MAD:274 |
| AC-54 | take = most severe member + its title | Met | `domain.ts:262-266`; MAD:278 |
| AC-55 | done + no member → `ignored`, null note | Met | `domain.ts:267`; MAD:288 |
| AC-56 | not done → `no_result` | Met | `domain.ts:268`; MAD:292 |
| AC-57 | no model call for groups/takes/notes | Met | `domain.ts:1-5` (pure); MAIT:650 |
| AC-58 | estimates: one per agent | Met | `multi-agent/service.ts:30-38`; MAIT:741; MAH:156 |
| AC-59 | median of 10 most recent done on current model | Met | `multi-agent/repository.ts:211-228`; `domain.ts:329`; MAIT:741; MAD:349 |
| AC-60 | no done run → nulls, 0 | Met | `domain.ts:329-340`; MAD:364; MAIT:741 |
| AC-61 | popover "PICK AGENTS TO RUN" … one row per agent | Met | `RunReviewPopover.tsx:80`, `:97-113`; RPT:47 |
| AC-62 | check every enabled agent | Partially met | `lib/multi-agent.ts:14` `.slice(0, MAX_AGENTS_PER_RUN)` caps at 6 |
| AC-63 | disabled row dimmed, checkbox operable | Partially met | dimmed `RunReviewPopover.tsx:102`; inoperable at cap `:100-104` |
| AC-64 | "Clear" unchecks every agent | Met | `RunReviewPopover.tsx:81`; RPT:62 |
| AC-65 | "Run multi-agent review (N)" | Met | `RunReviewPopover.tsx:128`; `prReview.json` `runMulti` |
| AC-66 | disabled at 0 | Met | `RunReviewPopover.tsx:124`; RPT:62 |
| AC-67 | one POST with `agentIds`, open results | Met | `RunReviewPopover.tsx:52-56`; RPT:47 |
| AC-68 | failure: stay open, show error, no nav | Met | `RunReviewPopover.tsx:57-58`, `:115-119`; RPT:62 |
| AC-69 | "Configure agents…" → `/new?pr=` | Met | `RunReviewPopover.tsx:130` |
| AC-70 | merged/closed warning above list | Met | `RunReviewPopover.tsx:85-90` before `:96` |
| AC-71 | breadcrumb, title, subtitle | Met | `ConfigureRunView.tsx:73-82`; `runs.json` `configure.*`; CRT:98 |
| AC-72 | dropdown placeholder, "#n · title" | Met | `ConfigureRunView.tsx:88-97`; CRT:98 |
| AC-73 | `pr` in list → preselect | Met | `ConfigureRunView.tsx:44`; CRT:122 |
| AC-74 | `pr` not in list → unselected | Partially met | `ConfigureRunView.tsx:38-44` fetches and preselects a PR from another repo; CRT:240 pins that |
| AC-75 | no PR → "Pick a pull request first" | Met | `ConfigureRunView.tsx:133-137`; CRT:98 |
| AC-76 | one card per agent: checkbox, name, description, estimate | Met | `AgentCard.tsx:33-53`; CRT:141 |
| AC-77 | first display checks every enabled card | Partially met | `ConfigureRunView.tsx:47` → `initialAgentSelection` caps at 6 |
| AC-78 | disabled card dimmed, unchecked, checkable | Partially met | dimmed `AgentCard.tsx:33`; uncheckable at cap `AgentCard.tsx:39`, `ConfigureRunView.tsx:55` |
| AC-79 | accent colour and icon from palette by position | Met | `AgentCard.tsx:27`; `constants.ts:6` |
| AC-80 | "<s>s · $<c>" with 1 and 2 decimals | Met | `helpers.ts:13-17`; `helpers.test.ts:23` |
| AC-81 | "—" + "no history" | Met | `AgentCard.tsx:47-51`; CRT:141 |
| AC-82 | "Select all" checks every card | Partially met | `ConfigureRunView.tsx:107` `all.slice(0, MAX_AGENTS_PER_RUN)` |
| AC-83 | footer "Run multi-agent review (N)" | Met | `ConfigureRunView.tsx:150` |
| AC-84 | disabled without PR or agent | Met | `ConfigureRunView.tsx:146`; CRT:159 |
| AC-85 | "≈ Ts · $C · parallel" (max / sum) | Met | `ConfigureRunView.tsx:152-157`; `helpers.ts:29-45`; CRT:159 |
| AC-86 | "partial" label | Met | `ConfigureRunView.tsx:158`; CRT:159 |
| AC-87 | footer POST + navigate | Met | `ConfigureRunView.tsx:62-67`; CRT:181 |
| AC-88 | error shown, selection kept | Met | `ConfigureRunView.tsx:68-69`, `:162-166`; CRT:190 |
| AC-89 | results breadcrumb, title, meta | Met | `MultiAgentResultsView.tsx:46-49`; `ResultsHeader.tsx:28-29`; RVT:146 |
| AC-90 | "Configure run" → `/new?pr=` | Met | `MultiAgentResultsView.tsx:94`; RVT:146 |
| AC-91 | subheader left/right | Met | `ResultsHeader.tsx:38-48`; RVT:146 |
| AC-92 | cost "partial" label | Met | `ResultsHeader.tsx:49`; RVT:146 |
| AC-93 | Columns/Tabs toggle in `view` | Met | `helpers.ts:50`; `MultiAgentResultsView.tsx:29-35`; RVT:175 |
| AC-94 | not-found with link to index | Met | `MultiAgentResultsView.tsx:51-62`; RVT:164 |
| AC-95 | one column per agent, selection order | Met | `AgentColumns.tsx:29-39`; RVT:198; e2e flow 14 |
| AC-96 | header: name, s·$, score ring, status | Met | `AgentColumn.tsx:86-96`; RVT:198 |
| AC-97 | null score → "—" | Met | `ScoreRing.tsx:6-24`; RVT:198 |
| AC-98 | queued/running → live log | Partially met | running `AgentColumn.tsx:57-58`; queued shows static text `:59-60`, no stream `:47` |
| AC-99 | settle → findings without reload | Met | `AgentColumn.tsx:50-54` → refetch; RVT:216 |
| AC-100 | card: severity icon, title, file:line | Met | `finding-card/FindingCard.tsx:65`, `:69`, `:76-78` |
| AC-101 | failed → error text | Met | `AgentColumn.tsx:63-64`; RVT:249 |
| AC-102 | footer "View trace", "<N> findings" | Met | `AgentColumn.tsx:99-104`; RVT:198 |
| AC-103 | "View trace" → same drawer | Met | `MultiAgentResultsView.tsx:114-122` (`@/components/run-trace-drawer`, also used by PR `page.tsx`); RVT:259, :272 |
| AC-104 | one tab per agent "name · score" | Met | `AgentTabs.tsx:39-42`; RVT:272; e2e flow 14 |
| AC-105 | panel: ring, name, summary, trace, s·$ | Met | `AgentTabs.tsx:50-62`; RVT:272 |
| AC-106 | accordion: category, file:line, "n% conf", rationale, SUGGESTED FIX | Met | `FindingCard.tsx:70`, `:76-79`, `:88-96`; `ConfidenceNum.tsx` `pct + "% conf"`; RVT:289 |
| AC-107 | Accept, Dismiss, Learn, eval; no Reply | Met | `FindingCard.tsx:100-151`; RVT:303 |
| AC-108 | action uses original finding id | Met | `AgentColumn.tsx:74`, `AgentTabs.tsx:77`; RVT:303 |
| AC-109 | new decision shown without reload | Met | `hooks/multi-agent.ts:55-58`; RVT:317 |
| AC-110 | eval disabled until accepted/dismissed | Met | `useTurnIntoEval.ts:14`, `:20`; RVT:317; `FindingCard.test.tsx:135` |
| AC-111 | "Where agents disagree" below, toggle on | Met | `MultiAgentResultsView.tsx:112`; `DisagreementSection.tsx:20`, `:27-31`; RVT:337; DST:50 |
| AC-112 | on → only conflicts | Met | `helpers.ts:55-57`; DST:50 |
| AC-113 | off → every group | Met | DST:50 |
| AC-114 | row: file:start, title, takes in selection order | Met | `DisagreementSection.tsx:42-52`; DST:77, :127 |
| AC-115 | take label by verdict | Met | `DisagreementSection.tsx:61-73`; `helpers.ts:62`; DST:77, :101 |
| AC-116 | "No conflicts — …" text | Met | `DisagreementSection.tsx:33-34`; DST:65 |
| AC-117 | index list rows, links | Met | `MultiAgentIndexView.tsx:50-65`; IVT:48 |
| AC-118 | empty state → `/new` | Met | `MultiAgentIndexView.tsx:37-46`; IVT:67 |
| AC-119 | sidebar GLOBAL, one entry | Met | `vendor/ui/nav.ts:43-50`; `app-shell/helpers.test.ts:51` |
| AC-120 | active under `/multi-agent-review` | Met | `app-shell/helpers.ts:28`; `helpers.test.ts:51` |
| AC-121 | no "p-queue"/"worktrees" | Met | `rg` matches only the test file; RVT:370 |
| AC-122 | markdown for rationale/suggestion, titles plain | Met | `FindingCard.tsx:69`, `:88`, `:94`; `DisagreementSection.tsx:46`; `ResultsHeader.tsx:41` |
| AC-123 | hermetic e2e flow for the seeded run | Met | `e2e/specs/15-multi-agent-review.flow.json`; e2e typecheck exit 0; 14/14 reported by main session |
| AC-125 | seed: idempotent 2-agent parent with conflict | Met | `server/src/db/seed.ts:477` `seedMultiAgentRun`; MAIT:293, :312, :343 |
| AC-124 | CI runner unchanged | Met | `git diff --stat -- agent-runner` empty; typecheck exit 0; `pnpm test` 23/23 |
| NFR-1 | ≤4 running, ≤6 total | Met | MAIT:437, :380; RIS:70 |
| NFR-2 | ≤1 intent call; 0 for grouping/estimates | Met | MAIT:512, :650 |
| NFR-3 | 10 req/min on review route | Met | `reviews/routes.ts:31` |
| NFR-4 | detail p95 <300 ms (6×300) | Met | MAIT:797 pass |
| NFR-5 | list p95 <300 ms (200 parents) | Met | MAIT:814 pass |
| NFR-6 | estimates p95 <200 ms (20 agents) | Met | MAIT:830 pass |
| NFR-7 | ≤1 live connection per unsettled child | Partially met | `AgentColumn.tsx:47` and `run-trace-drawer/RunTraceDrawer.tsx:47` both subscribe for the same running run |
| NFR-8 | all new strings in `messages/en` | Partially met | "—" hard-coded in `helpers.ts:5`, `ScoreRing.tsx:9,22`, `ResultsHeader.tsx:23`, `AgentTabs.tsx:41` |
| NFR-9 | keyboard reachable/operable; both themes | Partially met | `FindingCard.tsx:63` accordion header is a `div onClick`, so it can't be reached or opened by keyboard; no manual theme/keyboard pass |
| NFR-10 | info log per parent creation and per agent start | Partially met | `service.ts:164`, `run-executor.ts:180-192`; no test (the plan names a T2 log spy) |

Row count: 135, matching the Step 0 count.

## Item-by-item

### AC-1 Every contract change in this section shall be identical in both copies of `@devdigest/shared`.
**Verdict:** Met · **Evidence:** I ran `diff` on `server/src/vendor/shared/contracts/{observability,review-api,platform,findings}.ts` against the client copies and got no output. `diff -r` of the two trees shows differences only in `adapters.ts`, `eval-ci.ts`, `knowledge.ts`, `productionize.ts` and `trace.ts`. None of those is modified on this branch (absent from `git status`), so that drift is pre-existing. · **Gap:** none · **To close it:** —

### AC-2 The `RunRequest` contract shall accept an optional `agentIds` field holding 1 to 6 agent id strings, alongside the unchanged `agentId` and `all` fields.
**Verdict:** Met · **Evidence:** `platform.ts:307` `agentIds: z.array(z.string()).min(1).max(6).optional()`; CT:475 "RunRequest.agentIds accepts 1 and 6 ids and rejects 0 and 7" passes. · **Gap:** none · **To close it:** —

### AC-3 The response of `POST /pulls/:id/review` shall carry a `multi_agent_run_id` field that holds the parent run id when the request used `agentIds` and is null otherwise.
**Verdict:** Met · **Evidence:** `review-api.ts:57`; `reviews/routes.ts` returns `multi_agent_run_id: multiAgentRunId`; MAIT:352 and MAIT:412 pass. · **Gap:** none · **To close it:** —

### AC-4 The `AgentColumn` contract's `status` shall accept exactly `queued`, `running`, `done`, `failed` and `cancelled`.
**Verdict:** Met · **Evidence:** `observability.ts:45`. · **Gap:** none · **To close it:** —

### AC-5 Each finding in an `AgentColumn` shall carry the full finding record: id, severity, category, title, file, start line, end line, rationale, suggestion, confidence, kind, and the accepted, dismissed and learned timestamps.
**Verdict:** Met · **Evidence:** `observability.ts:53` `findings: z.array(FindingRecord)`. `FindingRecord` is `Finding` (id, suggestion, confidence, kind at `findings.ts:48-58`) plus `accepted_at`, `dismissed_at` and `learned_at` (`review-api.ts:17-19`). · **Gap:** none · **To close it:** —

### AC-6 The finding record contract shall carry a nullable `learned_at` timestamp.
**Verdict:** Met · **Evidence:** `review-api.ts:19`; column `learned_at` in `server/src/db/migrations/0023_smart_komodo.sql:1`. · **Gap:** none · **To close it:** —

### AC-7 The `ConflictTake` contract's `verdict` shall accept a severity, `ignored` or `no_result`.
**Verdict:** Met · **Evidence:** `observability.ts:65`; CT:484 passes. · **Gap:** none · **To close it:** —

### AC-8 The `ConflictTake` contract's `note` shall be nullable.
**Verdict:** Met · **Evidence:** `observability.ts:66`. · **Gap:** none · **To close it:** —

### AC-9 The `MultiAgentRun` contract shall carry a `status` of exactly one of `running`, `done`, `failed` or `partial`.
**Verdict:** Met · **Evidence:** `observability.ts:100`. · **Gap:** none · **To close it:** —

### AC-10 The `MultiAgentRun` contract shall carry a boolean `cost_partial`.
**Verdict:** Met · **Evidence:** `observability.ts:105`. · **Gap:** none · **To close it:** —

### AC-11 The `MultiAgentRun` contract shall carry, in place of its current `conflicts` list, a list of location groups, each with file, start line, end line, title, a boolean `conflict`, its members (finding id and agent id per member) and its takes (one `ConflictTake` per selected agent).
**Verdict:** Met · **Evidence:** `observability.ts` `LocationGroupMember` and `LocationGroup` (`:80-90`), `groups: z.array(LocationGroup)` at `:107`. `conflicts` is removed. · **Gap:** none · **To close it:** —

### AC-12 A run-estimate contract shall carry agent id, median duration in ms (nullable), median cost in USD (nullable) and the number of runs the medians were computed from.
**Verdict:** Met · **Evidence:** `observability.ts:127` `RunEstimate`; CT:504 passes. · **Gap:** none · **To close it:** —

### AC-13 WHEN `POST /pulls/:id/review` is requested with `agentIds`, the API shall create exactly one agent run per distinct listed agent id and no run for any other agent.
**Verdict:** Met · **Evidence:** `reviews/service.ts` `resolveTargets` uses `dedupeIds` (`helpers.ts:223`); MAIT:352 passes. · **Gap:** none · **To close it:** —

### AC-14 WHEN `POST /pulls/:id/review` is requested with `agentIds`, the API shall create exactly one parent multi-agent run for that PR.
**Verdict:** Met · **Evidence:** `service.ts:153` → `run.repo.ts:242` `createMultiAgentLaunch` (a single transaction); MAIT:352. · **Gap:** none · **To close it:** —

### AC-15 WHEN `POST /pulls/:id/review` is requested with `agentIds`, every agent run it creates shall reference that parent run.
**Verdict:** Met · **Evidence:** in `createMultiAgentLaunch`, each child is inserted with `multiAgentRunId: parent!.id`; MAIT:352. · **Gap:** none · **To close it:** —

### AC-16 IF any id in `agentIds` does not name an agent of the caller's workspace, THEN `POST /pulls/:id/review` shall respond 404 and create no agent run and no parent run.
**Verdict:** Met · **Evidence:** `service.ts:69-74` does one scoped `agentsByIds` lookup and throws `NotFoundError` before any insert; MAIT:370 ("unknown or non-uuid id, even next to a valid one"). · **Gap:** none · **To close it:** —

### AC-17 IF `agentIds` is empty or holds more than 6 ids, THEN `POST /pulls/:id/review` shall respond 400 and create no agent run and no parent run.
**Verdict:** Met · **Evidence:** `routes.ts:36-39` (`safeParse` → `InvalidRunRequestError`); MAIT:380 and MAIT:391 pass. · **Gap:** none · **To close it:** —

### AC-18 WHEN `POST /pulls/:id/review` is requested with `agentId` or `all: true` and without `agentIds`, the API shall resolve the agents as it did before this spec and create no parent run.
**Verdict:** Met · **Evidence:** `service.ts` non-`multiAgent` branch keeps the `createAgentRun` loop; MAIT:412. · **Gap:** none · **To close it:** —

### AC-19 The review executor shall load the PR diff and derive the PR intent once per launch, whatever the number of agents.
**Verdict:** Met · **Evidence:** `run-executor.ts:125` (diff) and `:139` (intent) run before `runInSlots` at `:147`; MAIT:512. · **Gap:** none · **To close it:** —

### AC-20 WHILE a launch has agents that have not settled, the review executor shall keep at most 4 of that launch's agents in `running` at the same time.
**Verdict:** Met · **Evidence:** `run-executor.ts:147`; `constants.ts` `MAX_PARALLEL_AGENTS = 4`; MAIT:437; RIS:70, RIS:93. · **Gap:** none · **To close it:** —

### AC-21 WHEN a launch holds 4 or fewer agents, the review executor shall move every one of them from `queued` to `running` before any of them settles.
**Verdict:** Met · **Evidence:** `helpers.ts:177` `runInSlots` awaits `Promise.all(first.map(startSafely))` before any run starts; MAIT:465; RIS:74. · **Gap:** none · **To close it:** —

### AC-22 WHEN a running agent of a launch settles and the launch still has `queued` agents, the review executor shall move the next queued agent, in request order, to `running`.
**Verdict:** Met · **Evidence:** the `runInSlots` lane uses `queue.shift()`; MAIT:437; RIS:93. · **Gap:** none · **To close it:** —

### AC-23 IF one agent's run fails or is cancelled, THEN the review executor shall run every other agent of the launch to its own final status.
**Verdict:** Met · **Evidence:** `runSafely` swallows rejections; a failed `start` now settles the row as failed (in the `run-executor.ts` start handler); MAIT:478; RIS:118. · **Gap:** none · **To close it:** —

### AC-24 IF the PR diff cannot be loaded, THEN the review executor shall mark every run of the launch `failed` with the load error.
**Verdict:** Met · **Evidence:** `diff-loader.ts:33` throws on an empty fallback; `run-executor.ts:130` calls `failAll`; MAIT:498 passes as a plain `it` (no `it.fails`/`skip` found in the file). · **Gap:** none against AC-24; see Beyond the plan for the edge-case conflict. · **To close it:** —

### AC-25 Review runs launched through the MCP server shall keep at most 4 agents of one launch in `running` at the same time.
**Verdict:** Met · **Evidence:** `server/src/mcp/compose.ts:64` calls the shared `runReview`; `server/test/mcp.it.test.ts:266` passes. · **Gap:** none · **To close it:** —

### AC-26 WHEN `POST /findings/:id/learn` is requested for a finding of the caller's workspace, the API shall persist the current time as that finding's learn decision and respond with the finding whose `learned_at` is non-null.
**Verdict:** Met · **Evidence:** `routes.ts:20` registers `learn`; `findings.ts:31`; `review.repo.ts:167`; MAIT:563. · **Gap:** none · **To close it:** —

### AC-27 IF `POST /findings/:id/learn` names a finding outside the caller's workspace, THEN the API shall respond 404 and change no finding.
**Verdict:** Met · **Evidence:** `findings.ts:17-19`; MAIT:607. · **Gap:** none · **To close it:** —

### AC-28 WHEN a learn decision is recorded, the API shall leave the finding's accepted and dismissed timestamps unchanged.
**Verdict:** Met · **Evidence:** `review.repo.ts:167` `.set({ learnedAt: at })` only; MAIT:563 and MAIT:595. · **Gap:** none · **To close it:** —

### AC-29 WHEN a learn decision is recorded, the API shall make no model call and create no memory record and no eval case.
**Verdict:** Met · **Evidence:** MAIT:563 ("makes no model call or memory/eval row"). · **Gap:** none · **To close it:** —

### AC-30 The API shall register no `POST /findings/:id/reply` route, so that a request to it keeps receiving the 404 route-not-found response it receives before this spec.
**Verdict:** Met · **Evidence:** `routes.ts:20` `['accept','dismiss','learn']`; MAIT:625. · **Gap:** none · **To close it:** —

### AC-31 WHEN `GET /multi-agent-runs` is requested, the API shall return the caller's workspace parent runs newest first, each with id, PR id, PR number, PR title, agent count, status, total duration and total cost.
**Verdict:** Met · **Evidence:** `multi-agent/repository.ts:44-46` (workspace filter, `desc(ranAt)`, limit 50); MAIT:664. · **Gap:** none · **To close it:** —

### AC-32 WHEN `GET /multi-agent-runs/:id` is requested, the API shall return a `MultiAgentRun` with one column per selected agent, in the order the agents were selected.
**Verdict:** Met · **Evidence:** `domain.ts:113` `orderColumns` over `agent_ids`; MAIT:676; MAD:141. · **Gap:** none · **To close it:** —

### AC-33 IF `GET /multi-agent-runs/:id` names no parent run of the caller's workspace, THEN the API shall respond 404.
**Verdict:** Met · **Evidence:** `multi-agent/service.ts:22-25`; `repository.ts:108` workspace filter; MAIT:323, MAIT:688; MAH:137, MAH:145. · **Gap:** none · **To close it:** —

### AC-34 WHILE any child run of a parent is `queued` or `running`, the API shall report the parent's status as `running`.
**Verdict:** Met · **Evidence:** `domain.ts:86`; MAD:74; MAIT:701. · **Gap:** none · **To close it:** —

### AC-35 WHEN every child run of a parent is `done`, the API shall report the parent's status as `done`.
**Verdict:** Met · **Evidence:** `domain.ts:88`; MAD:78; MAIT:303. · **Gap:** none · **To close it:** —

### AC-36 WHEN every child run of a parent is `failed` or `cancelled`, the API shall report the parent's status as `failed`.
**Verdict:** Met · **Evidence:** `domain.ts:89`; MAD:81; MAIT:498. · **Gap:** none · **To close it:** —

### AC-37 WHEN every child run of a parent has settled with at least one `done` and at least one `failed` or `cancelled`, the API shall report the parent's status as `partial`.
**Verdict:** Met · **Evidence:** `domain.ts:89`; MAD:84; MAIT:478. · **Gap:** none · **To close it:** —

### AC-38 The API shall report a parent's total cost as the sum of its child runs' recorded costs.
**Verdict:** Met · **Evidence:** `domain.ts:101-104`; MAD:96; MAIT:701. · **Gap:** none · **To close it:** —

### AC-39 IF any child run of a parent has no recorded cost, THEN the API shall report `cost_partial: true` for that parent.
**Verdict:** Met · **Evidence:** `domain.ts:105`; MAD:101; MAIT:701. · **Gap:** none · **To close it:** —

### AC-40 The API shall report a parent's total duration as the time from the earliest moment one of its child runs moved from `queued` to `running` to the latest moment one of its child runs settled.
**Verdict:** Met · **Evidence:** `domain.ts:93-99`. `started_at` is set at `run.repo.ts:187`; `finished_at` at `:223`, `:136` and `:147`. MAD:111, MAD:122; MAIT:701. · **Gap:** none · **To close it:** —

### AC-41 The API shall report a column's score as null for any child run whose status is not `done`.
**Verdict:** Met · **Evidence:** `domain.ts:129-131`; MAD:132; MAH:92. · **Gap:** none · **To close it:** —

### AC-42 The API shall put two findings of one parent into the same location group WHEN they name the same file, AND their line ranges overlap or are at most 3 lines apart, AND the token similarity of their normalised titles is at least 0.5.
**Verdict:** Met · **Evidence:** `domain.ts:166-175`; `constants.ts:7,10`; MAD:172, MAD:180 (3 joins, 4 doesn't), MAD:192 (exactly 0.5). · **Gap:** none · **To close it:** —

### AC-43 The API shall normalise a title by lower-casing it, splitting it on every non-alphanumeric character and dropping empty tokens, and shall compute token similarity as the size of the intersection of the two token sets divided by the size of their union.
**Verdict:** Met · **Evidence:** `domain.ts:138-154`; MAD:159, MAD:162. · **Gap:** none · **To close it:** —

### AC-44 WHEN finding A groups with finding B and finding B groups with finding C, the API shall put A, B and C in one location group.
**Verdict:** Met · **Evidence:** `domain.ts:181-217` (union-find); MAD:209. · **Gap:** none · **To close it:** —

### AC-45 The API shall place every finding of a parent's `done` child runs in exactly one location group, a finding that matches no other forming a group of its own.
**Verdict:** Met · **Evidence:** `domain.ts:288-296`; MAD:222, MAD:328. · **Gap:** none · **To close it:** —

### AC-46 Each location group member shall carry its original finding id and the id of the agent that produced it, unchanged.
**Verdict:** Met · **Evidence:** `domain.ts:305`; MAD:227. · **Gap:** none · **To close it:** —

### AC-47 The API shall order location groups by file path, then by start line.
**Verdict:** Met · **Evidence:** `domain.ts:247-249`; MAD:231. · **Gap:** none · **To close it:** —

### AC-48 The API shall set a location group's start line to the lowest start line and its end line to the highest end line of its members.
**Verdict:** Met · **Evidence:** `domain.ts:240-241`; MAD:244. · **Gap:** none · **To close it:** —

### AC-49 The API shall set a location group's title to the title of its most severe member, ties broken by the higher confidence, then by the earlier selection order of the member's agent.
**Verdict:** Met · **Evidence:** `domain.ts:231-237`; MAD:257, MAD:260, MAD:263. · **Gap:** none · **To close it:** —

### AC-50 The API shall compute location groups from the persisted findings at read time and persist no group.
**Verdict:** Met · **Evidence:** groups are built in `toMultiAgentRunDto` per request; MAIT:631. · **Gap:** none · **To close it:** —

### AC-51 The API shall set a location group's `conflict` to true WHEN at least one selected agent has a member in it and at least one other selected agent whose run is `done` has none.
**Verdict:** Met · **Evidence:** `domain.ts:276-282`; MAD:298, MAD:307. · **Gap:** none · **To close it:** —

### AC-52 The API shall set a location group's `conflict` to true WHEN at least two agents with members in it have takes whose verdicts (the most severe member severity, AC-54) differ.
**Verdict:** Met · **Evidence:** `domain.ts:281`; MAD:301, MAD:310. · **Gap:** none · **To close it:** —

### AC-53 The API shall give every location group exactly one take per selected agent of the parent and no take for an agent that was not selected.
**Verdict:** Met · **Evidence:** `domain.ts:256-270` (`columns.map`); MAD:274; MAIT:549. · **Gap:** none · **To close it:** —

### AC-54 WHEN a selected agent has members in a location group, its take shall carry the most severe of those members' severities as its verdict and that member's title as its note.
**Verdict:** Met · **Evidence:** `domain.ts:262-266`; MAD:278. · **Gap:** none · **To close it:** —

### AC-55 WHEN a selected agent's run is `done` and it has no member in a location group, its take shall carry the verdict `ignored` and a null note.
**Verdict:** Met · **Evidence:** `domain.ts:267`; MAD:288. · **Gap:** none · **To close it:** —

### AC-56 WHEN a selected agent's run is not `done`, its take in every location group shall carry the verdict `no_result` and a null note.
**Verdict:** Met · **Evidence:** `domain.ts:268`; MAD:292, MAD:328. · **Gap:** none · **To close it:** —

### AC-57 The API shall make no model call to build location groups, takes or notes.
**Verdict:** Met · **Evidence:** `multi-agent/domain.ts` is pure (no imports beyond types and constants); MAIT:650. · **Gap:** none · **To close it:** —

### AC-58 WHEN `GET /multi-agent-runs/estimates` is requested, the API shall return one run estimate per agent of the caller's workspace.
**Verdict:** Met · **Evidence:** `multi-agent/service.ts:30-38`; MAIT:333, MAIT:741; MAH:156. · **Gap:** none · **To close it:** —

### AC-59 The API shall compute an agent's estimate as the median duration and the median recorded cost of that agent's 10 most recent `done` runs on the agent's current model, across all PRs.
**Verdict:** Met · **Evidence:** `multi-agent/repository.ts:211-228` (`status='done'`, `model = agents.model`, `rn <= 10`); `domain.ts:329`; MAIT:741; MAD:349. · **Gap:** none · **To close it:** —

### AC-60 IF an agent has no `done` run on its current model, THEN its estimate shall carry a null duration, a null cost and a run count of 0.
**Verdict:** Met · **Evidence:** `domain.ts:329-340`; MAD:364; MAIT:741. · **Gap:** none · **To close it:** —

### AC-61 WHEN the reviewer clicks "Run Review" on the PR page, the studio shall open a popover headed "PICK AGENTS TO RUN" with one checkbox row per agent of the workspace.
**Verdict:** Met · **Evidence:** `PrDetailHeader.tsx` renders `RunReviewPopover`; `RunReviewPopover.tsx:80` heading, `:97-113` one row per agent; `prReview.json` `pickAgents`; RPT:47. · **Gap:** none · **To close it:** —

### AC-62 WHEN the popover opens, the studio shall check every enabled agent and leave every disabled agent unchecked.
**Verdict:** Partially met · **Evidence:** It holds for 6 or fewer enabled agents (`RunReviewPopover.tsx:35` → `lib/multi-agent.ts:10-15`; RPT:47). With more than 6 enabled agents, `lib/multi-agent.ts:14` `.slice(0, MAX_AGENTS_PER_RUN)` checks only the first 6 (RPT:76 pins this). · **Gap:** The UI 6-agent cap contradicts "check every enabled agent", and the spec was not amended. The seed has 5 agents (`server/src/db/seed.ts:224-271`), so this is invisible on seed data. · **To close it:** Either amend SPEC-06 (AC-62/63/77/78/82 plus a changelog line recording the 6-cap pre-check and the disabled-at-cap rows), or drop the client cap and let AC-17's 400 surface through AC-68.

### AC-63 The popover shall render a disabled agent's row dimmed and keep its checkbox operable.
**Verdict:** Partially met · **Evidence:** The disabled row is dimmed via `s.row(a.enabled)` at `RunReviewPopover.tsx:102`. Its checkbox is operable until 6 agents are checked. After that, every unchecked row, disabled ones included, gets `pointerEvents: "none"` (`:100-104`). · **Gap:** Same unrecorded cap as AC-62. · **To close it:** Same as AC-62.

### AC-64 WHEN the reviewer clicks "Clear", the studio shall uncheck every agent in the popover.
**Verdict:** Met · **Evidence:** `RunReviewPopover.tsx:81` `setSelected([])`; RPT:62. · **Gap:** none · **To close it:** —

### AC-65 The popover's primary button shall read "Run multi-agent review (N)", N being the number of checked agents.
**Verdict:** Met · **Evidence:** `RunReviewPopover.tsx:128`; `prReview.json` `"runMulti": "Run multi-agent review ({count})"`. · **Gap:** none · **To close it:** —

### AC-66 WHILE no agent is checked, the popover's primary button shall be disabled.
**Verdict:** Met · **Evidence:** `RunReviewPopover.tsx:124`; RPT:62. · **Gap:** none · **To close it:** —

### AC-67 WHEN the reviewer clicks the popover's primary button, the studio shall send one `POST /pulls/:id/review` with the checked agents' ids as `agentIds` and open `/multi-agent-review/<parent id>`.
**Verdict:** Met · **Evidence:** `RunReviewPopover.tsx:52-56`; `hooks/reviews.ts` `useRunReview` sends `agentIds`; RPT:47. · **Gap:** none · **To close it:** —

### AC-68 IF the popover's review request fails, THEN the studio shall keep the popover open, show the API error message in it and navigate nowhere.
**Verdict:** Met · **Evidence:** `RunReviewPopover.tsx:57-58` and `:115-119` (`open` is untouched on error); RPT:62. · **Gap:** none · **To close it:** —

### AC-69 WHEN the reviewer clicks "Configure agents…" in the popover, the studio shall open `/multi-agent-review/new?pr=<PR id>`.
**Verdict:** Met · **Evidence:** `RunReviewPopover.tsx:130`. · **Gap:** none · **To close it:** —

### AC-70 WHILE the PR is merged or closed, the popover shall show the existing merged-PR warning above the agent list.
**Verdict:** Met · **Evidence:** `RunReviewPopover.tsx:85-90` renders before the list at `:96`. `PrDetailHeader.tsx` passes `warnMerged` for merged or closed. · **Gap:** none · **To close it:** —

### AC-71 The Configure run screen at `/multi-agent-review/new` shall show the breadcrumb "Multi-Agent Review › Configure run", the title "Run a Multi-Agent Review" and the subtitle "Pick a pull request and choose which agents to fan out — they run in parallel and you compare their findings side by side."
**Verdict:** Met · **Evidence:** `ConfigureRunView.tsx:73-82`; `runs.json` `configure.crumb/title/subtitle` match the spec verbatim; CRT:98. · **Gap:** none · **To close it:** —

### AC-72 Step 1 "Pull request" shall offer a dropdown with the placeholder "Select a pull request…" listing the PRs of the active repository as "#<number> · <title>".
**Verdict:** Met · **Evidence:** `ConfigureRunView.tsx:86-97`; `configure.selectPr` and `configure.prItem`; CRT:98. (The extra foreign-PR row is covered under AC-74.) · **Gap:** none · **To close it:** —

### AC-73 WHEN the Configure run screen opens with a `pr` query parameter that names a PR in that list, the studio shall preselect that PR.
**Verdict:** Met · **Evidence:** `ConfigureRunView.tsx:44`; CRT:122. · **Gap:** none · **To close it:** —

### AC-74 IF the `pr` query parameter names no PR in that list, THEN the studio shall leave Step 1 unselected.
**Verdict:** Partially met · **Evidence:** An unknown id, or one from another workspace, leaves Step 1 empty (CRT:122). But `ConfigureRunView.tsx:38-44` fetches a `?pr=` that is not in the active repo's list via `usePullDetail` and prepends and preselects it. CRT:240, "keeps a ?pr= from another repo selectable by fetching that PR", pins this. · **Gap:** A PR from another repository of the same workspace is preselected. The spec's "Untrusted inputs" section names AC-74 as the control against exactly this ("a crafted id pointing at a PR outside the active repository"). · **To close it:** Remove the `usePullDetail` fallback at `ConfigureRunView.tsx:38-43` and invert CRT:240 to expect Step 1 unselected. Otherwise, amend AC-74 and the Untrusted-inputs row with a changelog entry.

### AC-75 WHILE no PR is selected, Step 2 "Agents to run" shall show "Pick a pull request first" with the body "Choose which PR to review above, then select the agents to run on it."
**Verdict:** Met · **Evidence:** `ConfigureRunView.tsx:133-137`; `runs.json` `pickPrFirst`/`pickPrFirstBody`; CRT:98. · **Gap:** none · **To close it:** —

### AC-76 WHILE a PR is selected, Step 2 shall show one card per agent of the workspace with a checkbox, the agent name, the agent's description and its estimate.
**Verdict:** Met · **Evidence:** `ConfigureRunView.tsx:118-131`; `AgentCard.tsx:33-53`; CRT:141. · **Gap:** none · **To close it:** —

### AC-77 WHEN Step 2 first shows the agent cards, the studio shall check every enabled agent's card.
**Verdict:** Partially met · **Evidence:** `ConfigureRunView.tsx:47` → `initialAgentSelection` caps at 6 (`lib/multi-agent.ts:14`); CRT:219 pins "pre-checks at most 6". · **Gap:** Same unrecorded cap as AC-62. · **To close it:** Same as AC-62.

### AC-78 Step 2 shall render a disabled agent's card dimmed, unchecked on first display and checkable.
**Verdict:** Partially met · **Evidence:** Dimmed via `AgentCard.tsx:33` `s.card(color, agent.enabled)`; unchecked on first display (CRT:141). It is not checkable once 6 are checked (`AgentCard.tsx:39` `pointerEvents: "none"`, `ConfigureRunView.tsx:55`). · **Gap:** Same unrecorded cap as AC-62. · **To close it:** Same as AC-62.

### AC-79 Each agent card shall show an accent colour and an icon taken from a fixed palette by the agent's position in the list.
**Verdict:** Met · **Evidence:** `AgentCard.tsx:27` `paletteAt(index)`; `multi-agent-review/constants.ts:6`; CRT:141. · **Gap:** none · **To close it:** —

### AC-80 An agent card's estimate shall read "<seconds>s · $<cost>", the median duration with one decimal and the median cost with two decimals.
**Verdict:** Met · **Evidence:** `multi-agent-review/helpers.ts:13-17`; `helpers.test.ts:23`; CRT:141. · **Gap:** none · **To close it:** —

### AC-81 IF an agent has no estimate, THEN its card shall show "—" with the hint "no history".
**Verdict:** Met · **Evidence:** `AgentCard.tsx:47-51`; CRT:141. · **Gap:** none · **To close it:** —

### AC-82 WHEN the reviewer clicks "Select all", the studio shall check every agent card.
**Verdict:** Partially met · **Evidence:** `ConfigureRunView.tsx:107` `all.slice(0, MAX_AGENTS_PER_RUN)`; CRT:219 "Select all stops at 6". It checks every card only when there are 6 or fewer. · **Gap:** Same unrecorded cap as AC-62. · **To close it:** Same as AC-62.

### AC-83 The Configure run footer button shall read "Run multi-agent review (N)", N being the number of checked agent cards.
**Verdict:** Met · **Evidence:** `ConfigureRunView.tsx:150`. · **Gap:** none · **To close it:** —

### AC-84 WHILE no PR is selected or no agent card is checked, the Configure run footer button shall be disabled.
**Verdict:** Met · **Evidence:** `ConfigureRunView.tsx:146`; CRT:159. · **Gap:** none · **To close it:** —

### AC-85 The Configure run footer shall show "≈ <T>s · $<C> · parallel", T being the largest median duration and C the sum of median costs over the checked agents that have an estimate.
**Verdict:** Met · **Evidence:** `ConfigureRunView.tsx:152-157`; `helpers.ts:29-45`; `helpers.test.ts:33`; CRT:159. · **Gap:** none · **To close it:** —

### AC-86 IF any checked agent has no estimate, THEN the Configure run footer total shall carry the label "partial".
**Verdict:** Met · **Evidence:** `ConfigureRunView.tsx:158`; `helpers.test.ts:37`; CRT:159. · **Gap:** none · **To close it:** —

### AC-87 WHEN the reviewer clicks the Configure run footer button, the studio shall send one `POST /pulls/:id/review` with the checked agents' ids as `agentIds` and open `/multi-agent-review/<parent id>`.
**Verdict:** Met · **Evidence:** `ConfigureRunView.tsx:62-67`; CRT:181. · **Gap:** none · **To close it:** —

### AC-88 IF the Configure run review request fails, THEN the studio shall show the API error message on the Configure run screen and keep the PR and agent selection.
**Verdict:** Met · **Evidence:** `ConfigureRunView.tsx:68-69`, `:162-166`; CRT:190. · **Gap:** none · **To close it:** —

### AC-89 The results page `/multi-agent-review/<id>` shall show the breadcrumb "Multi-Agent Review › #<PR number>", the title "Multi-Agent Review" and the meta line "<N> selected agents · parallel".
**Verdict:** Met · **Evidence:** `MultiAgentResultsView.tsx:46-49`; `ResultsHeader.tsx:28-29`; `runs.json` `page.meta`; RVT:146. · **Gap:** none · **To close it:** —

### AC-90 WHEN the reviewer clicks "Configure run" on the results page, the studio shall open `/multi-agent-review/new?pr=<PR id>`.
**Verdict:** Met · **Evidence:** `MultiAgentResultsView.tsx:94`; RVT:146. · **Gap:** none · **To close it:** —

### AC-91 The results page subheader shall show "#<number> <PR title>" on the left and "<N> agents · parallel · <T>s total · $<C>" on the right, from the parent's total duration and total cost.
**Verdict:** Met · **Evidence:** `ResultsHeader.tsx:38-48`; `runs.json` `page.summary`; RVT:146. · **Gap:** none · **To close it:** —

### AC-92 IF the parent reports `cost_partial: true`, THEN the results subheader cost shall carry the label "partial".
**Verdict:** Met · **Evidence:** `ResultsHeader.tsx:49`; RVT:146. · **Gap:** none · **To close it:** —

### AC-93 The results page shall offer a Columns | Tabs segmented toggle with the selected mode kept in the `view` query parameter, any value other than `tabs` selecting Columns.
**Verdict:** Met · **Evidence:** `ViewToggle.tsx:27-45`; `helpers.ts:50-52`; `MultiAgentResultsView.tsx:29-35`; RVT:175. · **Gap:** none · **To close it:** —

### AC-94 IF the results page's parent id names no parent run, THEN the studio shall show a not-found state with a link to `/multi-agent-review`.
**Verdict:** Met · **Evidence:** `MultiAgentResultsView.tsx:51-62` (an EmptyState whose CTA pushes `/multi-agent-review`); RVT:164. · **Gap:** none · **To close it:** —

### AC-95 WHILE Columns mode is selected, the results page shall show one column per selected agent, in selection order.
**Verdict:** Met · **Evidence:** `AgentColumns.tsx:29-39` (server order per AC-32); RVT:198; e2e flow 14 step "AC-123: Columns mode shows exactly 2 agent columns". · **Gap:** none · **To close it:** —

### AC-96 Each column header shall show the agent name, "<seconds>s · $<cost>", the score ring and the run status.
**Verdict:** Met · **Evidence:** `AgentColumn.tsx:86`, `:88`, `:91`, `:94-96`; RVT:198. · **Gap:** none · **To close it:** —

### AC-97 IF a column's score is null, THEN its score ring shall show "—".
**Verdict:** Met · **Evidence:** `ScoreRing.tsx:6-24`; RVT:198. · **Gap:** none · **To close it:** —

### AC-98 WHILE a column's run is `queued` or `running`, the column body shall show that run's live log stream.
**Verdict:** Partially met · **Evidence:** A running column shows the stream (`AgentColumn.tsx:57-58`). A queued column subscribes to nothing (`:47`, `column.status === "running" ? [...] : []`) and renders a static `column.queuedBody` "Waiting for a free slot…" (`:59-60`). RVT:216 pins "a queued one waits without a stream". The spec's edge case says queued columns "show the live log with the 'Queued' line", and the server does emit that line (`run-executor.ts:144`). · **Gap:** Queued columns show no live log. · **To close it:** Subscribe for `queued` as well as `running` at `AgentColumn.tsx:47` and render `LiveLogStream` for both. This stays within NFR-7 (at most 6 connections) once the drawer duplicate (NFR-7) is fixed. Then update RVT:216. Otherwise, amend AC-98 and its edge case.

### AC-99 WHEN a column's run settles, the studio shall replace that column's live log with the run's findings without a page reload.
**Verdict:** Met · **Evidence:** `AgentColumn.tsx:50-54` triggers a refetch when the stream ends; `hooks/multi-agent.ts:29` polls every 4 s while running; RVT:216. · **Gap:** none · **To close it:** —

### AC-100 Each finding card in a column shall show the severity icon, the title and "<file>:<line>".
**Verdict:** Met · **Evidence:** `components/finding-card/FindingCard.tsx:65`, `:69`, `:76-78`; `FindingCard.test.tsx:83`. · **Gap:** none · **To close it:** —

### AC-101 IF a column's run is `failed`, THEN the column body shall show the run's error text.
**Verdict:** Met · **Evidence:** `AgentColumn.tsx:63-64`; RVT:249. · **Gap:** none · **To close it:** —

### AC-102 Each column footer shall show "View trace" and "<N> findings".
**Verdict:** Met · **Evidence:** `AgentColumn.tsx:99-104`; RVT:198. · **Gap:** none · **To close it:** —

### AC-103 WHEN the reviewer clicks "View trace" in a column or in the Tabs panel, the studio shall open the run trace drawer for that agent's run, with the same tabs the PR page's run trace drawer shows.
**Verdict:** Met · **Evidence:** `MultiAgentResultsView.tsx:114-122` uses `@/components/run-trace-drawer`, the same module the PR `page.tsx` imports (moved, not forked); RVT:259, RVT:272. · **Gap:** none · **To close it:** —

### AC-104 WHILE Tabs mode is selected, the results page shall show one tab per selected agent, labelled with the agent name and score.
**Verdict:** Met · **Evidence:** `AgentTabs.tsx:39-42`; RVT:272; e2e flow 14 "Tabs mode shows exactly 2 agent tab buttons". · **Gap:** none · **To close it:** —

### AC-105 The selected tab's panel shall show the score ring, the agent name, the run summary, "View trace" and "<seconds>s · $<cost>".
**Verdict:** Met · **Evidence:** `AgentTabs.tsx:50-62`; RVT:272. · **Gap:** none · **To close it:** —

### AC-106 The Tabs panel shall list the agent's findings as an accordion whose expanded item shows the category tag, "<file>:<line>", the confidence as "<n>% conf", the rationale and, when the finding has a suggestion, a "SUGGESTED FIX" section.
**Verdict:** Met · **Evidence:** `FindingCard.tsx:70`, `:76-79`, `:88`, `:90-96`. `ConfidenceNum.tsx` renders `pct + "% conf"`. The label is uppercased via `textTransform: "uppercase"` (`finding-card/styles.ts:79`). RVT:289. · **Gap:** none · **To close it:** —

### AC-107 An expanded finding in the Tabs panel shall offer the actions Accept, Dismiss, Learn and Turn into eval case, and no Reply to author action.
**Verdict:** Met · **Evidence:** `FindingCard.tsx:100-151` (`showLearn` passed at `AgentTabs.tsx:75`); no reply button in the component; RVT:303. · **Gap:** none · **To close it:** —

### AC-108 WHEN the reviewer clicks Accept, Dismiss or Learn on a finding of the results page, the studio shall send that action for the original per-agent finding id.
**Verdict:** Met · **Evidence:** `AgentColumn.tsx:74` and `AgentTabs.tsx:77` pass `f.id`; `hooks/multi-agent.ts:54`; RVT:303. · **Gap:** none · **To close it:** —

### AC-109 WHEN a finding action on the results page succeeds, the studio shall show the new decision on that finding without a page reload.
**Verdict:** Met · **Evidence:** `hooks/multi-agent.ts:55-58` invalidates `["multi-agent-run", id]`; RVT:317. · **Gap:** none · **To close it:** —

### AC-110 WHILE a finding is neither accepted nor dismissed, its Turn into eval case action shall be disabled.
**Verdict:** Met · **Evidence:** `useTurnIntoEval.ts:14` `decided = accepted_at || dismissed_at`, `:20` disabled; RVT:317; `FindingCard.test.tsx:135`. · **Gap:** none · **To close it:** —

### AC-111 The results page shall show, below the agent results in both modes, a section headed "Where agents disagree" with a "Show only conflicts" toggle that is on by default.
**Verdict:** Met · **Evidence:** `MultiAgentResultsView.tsx:112` (after both modes); `DisagreementSection.tsx:20`, `:27-31`; RVT:337; DST:50. · **Gap:** none · **To close it:** —

### AC-112 WHILE "Show only conflicts" is on, the "Where agents disagree" section shall list only the location groups whose `conflict` is true.
**Verdict:** Met · **Evidence:** `helpers.ts:55-57`; DST:50. · **Gap:** none · **To close it:** —

### AC-113 WHILE "Show only conflicts" is off, the "Where agents disagree" section shall list every location group.
**Verdict:** Met · **Evidence:** `helpers.ts:56`; DST:50. · **Gap:** none · **To close it:** —

### AC-114 Each "Where agents disagree" row shall show the group's "<file>:<start line>", its title and one take per selected agent, in selection order.
**Verdict:** Met · **Evidence:** `DisagreementSection.tsx:42-52` (takes matched by position); DST:77, DST:127. · **Gap:** none · **To close it:** —

### AC-115 A take shall show the agent name and, by verdict, the severity label, "did not flag" for `ignored`, or "no result" for `no_result`.
**Verdict:** Met · **Evidence:** `DisagreementSection.tsx:61-73`; `helpers.ts:62-66`; DST:77, DST:101. · **Gap:** none · **To close it:** —

### AC-116 IF "Show only conflicts" is on and no location group is a conflict, THEN the section shall show "No conflicts — the agents agree on every flagged location."
**Verdict:** Met · **Evidence:** `DisagreementSection.tsx:33-34`; `runs.json` `conflicts.empty`; DST:65. · **Gap:** none · **To close it:** —

### AC-117 The page `/multi-agent-review` shall list the parent runs newest first, each row showing the PR number and title, the agent count, the status, the total duration and the total cost, and linking to its results page.
**Verdict:** Met · **Evidence:** `MultiAgentIndexView.tsx:50-65` (keeps the server's newest-first order); IVT:48. · **Gap:** none · **To close it:** —

### AC-118 IF there is no parent run, THEN `/multi-agent-review` shall show an empty state with a "Configure run" action that opens `/multi-agent-review/new`.
**Verdict:** Met · **Evidence:** `MultiAgentIndexView.tsx:37-46`, `:25`; IVT:67. · **Gap:** none · **To close it:** —

### AC-119 The sidebar shall show a GLOBAL section holding a single "Multi-Agent Review" entry that opens `/multi-agent-review`.
**Verdict:** Met · **Evidence:** `client/src/vendor/ui/nav.ts:43-50`; `app-shell/helpers.test.ts:51`. · **Gap:** none · **To close it:** —

### AC-120 WHILE the path starts with `/multi-agent-review`, the sidebar shall mark the "Multi-Agent Review" entry active.
**Verdict:** Met · **Evidence:** `client/src/components/app-shell/helpers.ts:28` `startsWith("/multi-agent-review")`; `helpers.test.ts:51`. · **Gap:** none · **To close it:** —

### AC-121 The studio shall not display the words "p-queue" or "worktrees" in any Multi-Agent Review copy.
**Verdict:** Met · **Evidence:** `rg -n "p-queue|worktrees" client/messages client/src` matches only `MultiAgentResultsView.test.tsx:370,376` (the guard test itself); RVT:370 passes. The old `page.meta` "fan-out via p-queue" was removed from `runs.json`. · **Gap:** none · **To close it:** —

### AC-122 The studio shall render finding rationales and suggestions on the Multi-Agent Review pages with the same markdown renderer the PR page uses, and render PR titles and finding titles as plain text.
**Verdict:** Met · **Evidence:** Markdown is rendered by the shared `FindingCard.tsx:88`, `:94` `<Markdown>` (the same component the PR `FindingsPanel` now imports). Titles are plain text at `FindingCard.tsx:69`, `DisagreementSection.tsx:46`, `ResultsHeader.tsx:41` and `MultiAgentIndexView.tsx:54`. · **Gap:** none · **To close it:** —

### AC-123 The hermetic e2e suite shall include a flow that opens the results page of the seeded 2-agent parent run, without launching any run, and asserts that Columns mode shows 2 columns, Tabs mode shows 2 agent tabs, and the "Where agents disagree" section shows at least 1 conflict row.
**Verdict:** Met · **Evidence:** `e2e/specs/15-multi-agent-review.flow.json` exists. It opens the index, clicks the #484 row (no launch step) and asserts `[data-agent-column]` count 2, 2 tab buttons plus `[data-agent-tab]` count 2, and `[data-conflict-row]` count ≥1. `cd e2e && npm run typecheck` exits 0. The seed data it relies on is proven by MAIT:312 ("2 done columns and 2 groups with 1 conflict"). · **Gap:** I did not run the 14/14 pass myself (my constraints forbid running e2e). That pass is the main session's reported result. · **To close it:** —

### AC-125 The server seed shall create, idempotently, one finished parent run on a seeded PR with 2 `done` child runs whose persisted findings form at least 1 location group with `conflict` true.
**Verdict:** Met · **Evidence:** `server/src/db/seed.ts:309`, `:477` `seedMultiAgentRun` (keyed on PR #484); MAIT:293, MAIT:312, MAIT:343. · **Gap:** none · **To close it:** —

### AC-124 The CI runner's CLI contract, outputs and exit codes shall be unchanged by this feature.
**Verdict:** Met · **Evidence:** `git diff --stat -- agent-runner` and `git status --short -- agent-runner` both print nothing. `cd agent-runner && pnpm typecheck` exits 0; `pnpm test` gives 3 files / 23 tests passed. · **Gap:** none · **To close it:** —

### NFR-1: One launch shall have at most 4 agents in `running` at once and at most 6 agents in total.
**Verdict:** Met · **Evidence:** MAIT:437 (4 of 6 running), MAIT:380 (7 → 400), RIS:70; `platform.ts:307` `.max(6)`. · **Gap:** none · **To close it:** —

### NFR-2: A launch shall make at most 1 intent-classification model call plus the model calls of its agents' reviews. Grouping, takes and estimates make 0 model calls.
**Verdict:** Met · **Evidence:** MAIT:512 ("classifies intent once per launch"), MAIT:650 (0 calls across the read routes). · **Gap:** none · **To close it:** —

### NFR-3: `POST /pulls/:id/review` keeps its per-route limit of 10 requests per minute.
**Verdict:** Met · **Evidence:** `server/src/modules/reviews/routes.ts:31` `rateLimit: { max: 10, timeWindow: '1 minute' }` is unchanged. The plan proves this by code review, because the limiter is off under test. · **Gap:** none · **To close it:** —

### NFR-4: `GET /multi-agent-runs/:id` shall respond within 300 ms at p95 for a parent with 6 child runs and 300 findings, against local Postgres.
**Verdict:** Met · **Evidence:** MAIT:797 passes ("serves a parent with 6 children x 300 findings in under 300 ms (NFR-4)", 588 ms test wall time including setup). · **Gap:** none · **To close it:** —

### NFR-5: `GET /multi-agent-runs` shall respond within 300 ms at p95 with 200 parent runs in the workspace.
**Verdict:** Met · **Evidence:** MAIT:814 passes. · **Gap:** none · **To close it:** —

### NFR-6: `GET /multi-agent-runs/estimates` shall respond within 200 ms at p95 for a workspace with 20 agents.
**Verdict:** Met · **Evidence:** MAIT:830 passes. · **Gap:** none · **To close it:** —

### NFR-7: The results page shall hold at most 1 open live-event connection per unsettled child run (at most 6).
**Verdict:** Partially met · **Evidence:** Columns open one stream per running column only (`AgentColumn.tsx:47`; RVT:216). But with the trace drawer open on a running column, `client/src/components/run-trace-drawer/RunTraceDrawer.tsx:47` `useRunEvents(running ? [runId] : [])` opens a second SSE for the same run while the column's stream is still open. `MultiAgentResultsView.tsx:120` passes `running` for queued or running columns. · **Gap:** That makes 2 connections for one unsettled run while the drawer is open in Columns mode. · **To close it:** Either hand the drawer the column's events and pass `running={false}` while the column streams, or suppress the column subscription while that run's drawer is open. Add an RVT case that opens the drawer on a running column and asserts one `useRunEvents` subscription for that run id.

### NFR-8: Every new UI string shall live in `messages/en`, and 0 hard-coded user-visible strings shall be added, with exactly 2 exceptions: the sidebar section header "GLOBAL" and the sidebar nav label "Multi-Agent Review" are literals in the design system's nav definition, as every existing sidebar section and nav entry is.
**Verdict:** Partially met · **Evidence:** All copy routes through `prReview.json`/`runs.json`, and the nav literals are the allowed exceptions (`nav.ts:46-47`). But the visible "—" placeholder is hard-coded in four places:
- `client/src/app/multi-agent-review/helpers.ts:5` (`NO_VALUE = "—"`, rendered in cards, columns and index rows)
- `…/ScoreRing/ScoreRing.tsx:9`, `:22`
- `…/ResultsHeader/ResultsHeader.tsx:23`
- `…/AgentTabs/AgentTabs.tsx:41`

The same glyph does live in messages as `runs.configure.noEstimate` (used at `AgentCard.tsx:49`). · **Gap:** 4 literal "—" sites outside `messages/en`. · **To close it:** Read the placeholder from `t("configure.noEstimate")` (or a shared `runs.page.none` key) at those four sites. `formatSecondsCost` would take the placeholder as a parameter.

### NFR-9: Every popover checkbox, "Clear", "Select all", the Columns | Tabs toggle, the agent tabs, the "Show only conflicts" toggle and every finding action shall be reachable with Tab and operable with Enter or Space. Each screen shall render correctly in both themes (`dark`, `light`).
**Verdict:** Partially met · **Evidence:**
- Native buttons: vendor `Checkbox` is `<button role="checkbox">`, `ViewToggle.tsx:28` `<button>`, vendor `Tabs` buttons and the `Toggle` (DST:118 `role=switch`).
- Structural tests pass: CRT:204, RVT:358, DST:117.
- However, finding actions render only inside the expanded accordion. Its header at `client/src/components/finding-card/FindingCard.tsx:63` is `<div onClick=…>` with no `tabIndex`, `role` or `onKeyDown` (a grep for `onKeyDown|tabIndex` in `components/finding-card/` returns nothing). Neither mode passes `defaultExpanded`, so a keyboard user cannot reach Accept, Dismiss, Learn or Turn into eval case.
- No manual Tab/Enter/Space pass and no manual dark/light pass of the three new screens was done (caller confirms). Theme coverage is automated only for `FindingCard` (`FindingCard.test.tsx:83`, `:135`) and the gallery smoke test.

· **Gap:** The accordion can't be reached by keyboard, and the manual keyboard and theme passes are outstanding. · **To close it:** Make the header at `FindingCard.tsx:63` a `<button type="button" aria-expanded={expanded}>` (or add `role="button" tabIndex={0}` plus an Enter/Space `onKeyDown`) and add a structural test. Then do the manual pass on `/multi-agent-review`, `/new` and `/<seeded id>` in both themes.

### NFR-10: The server shall log 1 info line per parent run creation, with the parent id, PR id and agent count. It shall log 1 info line per agent start, with the run id and the number of agents running in that launch.
**Verdict:** Partially met · **Evidence:** Both lines exist in code:
- `server/src/modules/reviews/service.ts:164` `logger?.info({ parentId, prId, agentCount }, 'review: multi-agent launch created')`
- `server/src/modules/reviews/run-executor.ts:180-192` (`runId`, `running: state.running`)

I observed the per-agent line at runtime in the mcp.it output: `"msg":"review: agent \"Cap 4 …\" started (openrouter/m)","runId":"487bb6c9-…","running":2`. The parent-creation line was not observed: `pnpm exec vitest run multi-agent.it | grep "multi-agent launch created"` printed nothing, because that suite's logger is silent. The plan's Proved-by for NFR-10 is a "T2 log spy", and no such test exists (`grep -rn "NFR-10\|launch created" server/test` finds only an unrelated onboarding test). · **Gap:** No automated proof of either line or its "exactly 1" count. · **To close it:** Add a MAIT case that passes a spy logger to `ReviewService.runReview` (or `buildApp` with a capturing pino stream). Assert exactly one `'review: multi-agent launch created'` with `{parentId, prId, agentCount}` per launch, and one `started` line per agent carrying `runId` and `running`.

## Beyond the plan

- **Edge case contradicted by the AC-24 fix.** `server/src/modules/reviews/diff-loader.ts:30-33` now throws `no diff available` when the PR has no clone diff and no stored patches. The spec's Edge cases section (line 219) says that for such a PR "the agents review an empty diff and return no findings". The change also affects single-agent and MCP reviews: on PR #482 a run that used to be `done` with 0 findings is now `failed`. Either the spec edge case or `server/src/modules/reviews/docs/insights.md` needs an update recording the decision.
- **Unrecorded client 6-agent cap** (`client/src/lib/multi-agent.ts:7-15`, cap hints in `prReview.json` `runReview.maxAgents` and `runs.json` `configure.maxAgents`). No AC asks for it; it causes the AC-62/63/77/78/82 partials.
- **Foreign `?pr=` fetch** (`ConfigureRunView.tsx:38-43`, CRT:240). No AC asks for it, and it contradicts AC-74.
- **Copy change on the PR page:** `prReview.json` `finding.dismiss` changed from "Reject" to "Dismiss", which affects the existing PR-page FindingsPanel. The sibling key `evalNeedsDecision` still reads "Accept or reject this finding first".
- **Extra cache invalidations** in `useRunReview` (`["pr-active-runs", prId]`, `["pr-runs", prId]`) at `client/src/lib/hooks/reviews.ts`.
- **`RunReviewDropdown` deleted.** The PR page no longer offers "run one agent" or "run all"; every PR-page launch is now a multi-agent launch. This is plan Step 15, listed for completeness.
- **Route list not updated:** `server/src/modules/reviews/AGENTS.md:3` still lists `/findings/:id/(accept|dismiss)`, with no `learn`. That belongs to the doc-writer stage.
- `server/src/modules/_shared/uuid.ts` (new), `server/src/platform/errors.ts` `InvalidRunRequestError`, and `server/test/mcp-tools.test.ts`: review-fix support, accounted for by AC-16/AC-17/AC-33.
- New module memory exists: `server/src/modules/multi-agent/AGENTS.md`, with `CLAUDE.md -> AGENTS.md` symlink confirmed (`lrwxr-xr-x … CLAUDE.md -> AGENTS.md`).

## Gates and tests run

| Command | cwd | Result | Notes |
|---|---|---|---|
| `pnpm typecheck` | server | exit 0 | |
| `pnpm arch:check` | server | `✔ no dependency violations found (275 modules, 943 dependencies cruised)` | 33 known violations ignored (baseline) |
| `pnpm exec vitest run --exclude '**/*.it.test.ts'` | server | 60 files, 877 tests passed | Opens `DATABASE_URL` and reaps running `agent_runs` on the dev DB; the caller requested it |
| `pnpm exec vitest run multi-agent.it reviews.it reviews-skills.it run-queue.it mcp.it intent.it` | server | 6 files, 56 tests passed (multi-agent.it 32, mcp.it 5) | `docker info` succeeded beforehand; testcontainers, not the dev DB. `describe.skip` applies only without Docker, so the suites really ran |
| `pnpm exec vitest run multi-agent.it \| grep -E "multi-agent launch created\|started \("` | server | 3 files / 23 tests passed; grep printed no log line | NFR-10 probe: that suite's logger is silent |
| `pnpm typecheck` | client | exit 0 | |
| `pnpm arch:check` | client | `✔ no dependency violations found (586 modules, 1269 dependencies cruised)` | |
| `pnpm test` | client | 74 files, 466 tests passed | Only stderr is the pre-existing recharts width warning in `smoke.test.tsx` |
| `pnpm typecheck` | agent-runner | exit 0 | |
| `pnpm test` | agent-runner | 3 files, 23 tests passed | Plan's AC-124 row |
| `git diff --stat -- agent-runner` | root | empty | |
| `diff` contract pairs (observability, review-api, platform, findings) | root | empty | `diff -r` of the whole tree shows only pre-existing drift in untouched files |
| `rg -n "p-queue\|worktrees" client/messages client/src` | root | matches only the guard test | AC-121 |
| `npm run typecheck` | e2e | exit 0 | |
| `npm run e2e:hermetic` | e2e | **not run** | My constraints forbid running e2e. 14/14 is the main session's reported result |
| `pnpm db:generate` / `db:migrate` / `db:seed` | server | **not run** | Writes to the DB. Migration 0022 and the seed are validated by the testcontainers IT (MAIT:293/:343), per the caller |
| manual dark/light and keyboard pass | client | **not done** | Caller confirms; counted against NFR-9 |

## Cannot verify

- No item is in this status.
- One input is a claim rather than my own run: the e2e 14/14 pass behind AC-123. I verified the flow file's contents, the e2e typecheck, and the seed shape it depends on (MAIT:312). Re-running `PATH="$HOME/.npm-global/bin:$PATH" npm run e2e:hermetic` from `e2e/` would settle it independently.

## Confidence

**High** for the server, contract, seed and boundary items: every one has a named, passing test that I ran. **Medium-high** for the studio items: component tests pass and I read every rendering path, but nothing renders in a real browser except flow 14.

Three things would raise it:
- an independent `e2e:hermetic` run;
- the manual keyboard and theme pass;
- a log-spy test for NFR-10.

## Insights to record

- The `multi-agent.it` suite runs with a silent logger, so you can't check server log lines (NFR-10-style requirements) by grepping its output. Only `mcp.it` prints pino lines. Log assertions need an injected spy logger.
- `diff -r server/src/vendor/shared client/src/vendor/shared` is never empty on main: `adapters`, `eval-ci`, `knowledge`, `productionize` and `trace` have drifted. Verify "both copies identical" per touched file, not per tree.
- zsh treats a bare `echo ===` as `=cmd` expansion and aborts the compound command. Use `echo ---` as a separator in verification one-liners.
