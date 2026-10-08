# Verification: SPEC-04 Eval pipeline (Acceptance mode)

Date: 2026-10-07 · Branch: L6 (all work uncommitted, in the working tree) · Items: 141 (AC-1…AC-130, NFR-1…NFR-11)
Verifier: `plan-verifier` (Acceptance mode), run by the coordinating session. Line anchors are as of the run; see the follow-up section at the bottom for what was changed afterwards.

Source of items: `docs/specs/eval-pipeline.md`, overview. 130 unique `AC-N` lines (`grep -oE '^- \[ \] AC-[0-9]+' | sort -u | wc -l` returned 130) and 11 `NFR-N` lines. None are struck through. That makes **141 items**, and there are 141 rows below.

## Summary
Met: 126 · Partially met: 10 · Not met: 0 · Cannot verify: 5

**Mode:** Acceptance. **Verdict at run time: INCOMPLETE.** Every gate passes and no item is Not met. Ten items held only in part:
- AC-8 and AC-9: the parser deliberately differs from HEAD.
- AC-34: a missing owner agent returns 409 instead of 404.
- AC-48: the engine gets an extra constant `task` line.
- AC-79: a case whose last run errored shows "never run".
- AC-109: "Run all agents" skips agents that already have a running batch.
- AC-124: the added prompt line is not the spec's exact wording.
- NFR-5: latency was measured without the specified load fixture.
- NFR-8: two new strings live in `nav.ts`.
- NFR-11: the batch log line has no agent version or model.

Five items could not be checked: the four e2e flow ACs (not run by the verifier) and the visual theme NFR-10.

This result is advisory. The pre-PR gate is `pr-self-review`.

## Gates run
| Gate | cwd | Result | Notes |
|---|---|---|---|
| `pnpm verify` | repo root | PASS, exit 0 | `All 10 lanes PASS`: reviewer-core typecheck, reviewer-core tests, server typecheck, server arch:check, server unit (eval, seed-eval, contracts), shared copies parity, scoring guard, client typecheck, client arch:check, client unit (eval-related) |
| `pnpm exec vitest run eval.it` | server | PASS | `1 passed (1)`, `30 passed (30)`. `docker info` succeeded first. Printed `NFR-5 p95 (ms): {"GET /agents/:id/eval-runs":2.19,"GET /eval-runs/:id":2.07,"GET /eval/overview":5.37}` |
| `pnpm exec vitest run --exclude '**/*.it.test.ts'` | server | PASS | `55 passed (55)`, `792 passed (792)`. This lane boots `buildApp`, which reaps running `agent_runs` / eval batches. No batch was running (the 6 Security Reviewer batches were `done`/`failed` just before) |
| `npm test` | reviewer-core | PASS | `8 passed (8)`, `82 passed (82)`; includes `eval-score.test.ts` (12) and `diff-parse.test.ts` (20) |
| `pnpm test` | client | PASS | `66 passed (66)`, `412 passed (412)` |
| `diff` of the two `contracts/eval-pipeline.ts` copies and of the two `index.ts` copies | repo root | 0 differences | Printed `PARITY_EVAL_OK`, `PARITY_INDEX_OK` |
| `GET` on the dev API :3001 (read-only), 20 calls per route | — | p95: eval-runs 12.4 ms, eval-runs/:id 9.4 ms, overview 16.2 ms | Supplementary evidence for NFR-5 |
| `npm run e2e:hermetic` | e2e | **skipped by the verifier** | It restarts services. AC-113…AC-116 are Cannot verify in this run; see the follow-up section |

## Items
| Item | Verdict | Proof |
|---|---|---|
| AC-1 | Met | `server/src/vendor/shared/contracts/eval-pipeline.ts:29-37` (`EvalExpectation`: kind enum, `file` min 1, `start_line`/`end_line` int ≥1, `title`/`severity`/`category` nullish); `server/test/contracts.test.ts:425` "rejects start_line 0…" |
| AC-2 | Met | `eval-pipeline.ts:40-42` (`expectations: z.array(EvalExpectation).min(1)`); `contracts.test.ts:420` "rejects empty expectations" |
| AC-3 | Met | `eval-pipeline.ts:62-69` (`EvalCaseRecord = EvalCase.extend` with typed `expected_output`, `created_at`, `created_from`, nullable `source_finding_id`, nullable `last_run`) |
| AC-4 | Met | `eval-pipeline.ts:99-130` (`EvalBatchSnapshot` + `EvalBatch`: all listed fields with the listed nullability) |
| AC-5 | Met | `eval-pipeline.ts:134-161` (`EvalCaseActual`: kept, dropped, matched_expectations, noise_finding_ids, mode, tokens; `EvalBatchRun` extends `EvalRunRecord` (case_id, case_name, pass, metrics) + expected_output + nullable error; `EvalBatchDetail`) |
| AC-6 | Met | `eval-pipeline.ts:167-181` (`EvalAgentSummary`: agent_id, name, model, cases_total, nullable latest_batch, `trend` `.max(10)`; `EvalOverview`) |
| AC-7 | Met | the `diff` of both copies printed nothing; verify lane "shared copies parity" PASS (`scripts/verify.sh:59-70`) |
| AC-8 | Partially met | See details |
| AC-9 | Partially met | See details |
| AC-10 | Met | `reviewer-core/src/diff/parse.ts:119-121` (`fileDiff`); `reviewer-core/test/diff-parse.test.ts:27,31` |
| AC-11 | Met | `reviewer-core/src/eval/score.ts:41-64` (`rangesIntersect`, `matchesExpectation`); `eval-score.test.ts:40,47` |
| AC-12 | Met | `score.ts:96-100` (`must_find` matched only against `kept`; dropped findings are a count only); `eval-score.test.ts:56,65` |
| AC-13 | Met | `score.ts:102-105` (`noiseIds`); `eval-score.test.ts:73` |
| AC-14 | Met | `score.ts:118` (`pass: matched.length === mustFindTotal && noiseIds.length === 0`) |
| AC-15 | Met | `score.ts:107-120` (`...metrics(counts)` on the case's own counts) |
| AC-16 | Met | `score.ts:67-69,79` (`ratio`, recall; 1 when den 0); `eval-score.test.ts:110` |
| AC-17 | Met | `score.ts:80` |
| AC-18 | Met | `score.ts:81` |
| AC-19 | Met | `score.ts:127-146` (`scoreBatch`: sums counts, then `metrics(sum)`; `null` adds to `cases_total` only); `eval-score.test.ts:118` |
| AC-20 | Met | `eval-score.test.ts:88` "AC-20: three-case fixture" (passes) |
| AC-21 | Met | `eval-score.test.ts:104` "AC-21: an errored (null) case only raises cases_total" |
| AC-22 | Met | `score.ts:1` (only `import type`); verify lane "scoring guard" PASS; `eval-score.test.ts:143` |
| AC-23 | Met | `server/src/modules/eval/service.ts:45-85` (`createFromFinding`); `helpers.ts:39-51` (`expectationFromFinding`); `server/test/eval.it.test.ts:226` (201, must_find, config.ts 12-12) |
| AC-24 | Met | `helpers.ts:40` (dismissed → `must_not_flag`); `eval.it.test.ts:257` |
| AC-25 | Met | `helpers.ts:47-49`; `server/test/eval-helpers.test.ts:51` "maps accepted to must_find with title/severity/category" |
| AC-26 | Met | `service.ts:69-71,77` + `helpers.ts:54-56` (`fileDiff`); `eval.it.test.ts:226` asserts the `--- a/src/config.ts\n+++ b/src/config.ts` prefix and `input_diff === CONFIG_DIFF`; `eval-helpers.test.ts:69` (exactly 1 file) |
| AC-27 | Met | `service.ts:78` (`inputMeta: { title: ctx.pull.title, body: ctx.pull.body }`); `eval.it.test.ts:226` asserts `input_meta.title` |
| AC-28 | Met | `service.ts:63,75,81-82`; `eval.it.test.ts:226` (`owner_id` = Security Reviewer, `created_from: 'finding'`, `source_finding_id`) |
| AC-29 | Met | `service.ts:64`; `eval.it.test.ts:299` (201 owned by the body's `agent_id`) |
| AC-30 | Met | `service.ts:65-67` (409 `no_agent`); `eval.it.test.ts:299` |
| AC-31 | Met | `service.ts:54-57`; `eval.it.test.ts:271` (409 `finding_undecided`, 0 rows) |
| AC-32 | Met | `service.ts:69-71`; `eval.it.test.ts:284` (missing row and NULL patch → 409 `no_patch`) |
| AC-33 | Met | `service.ts:59-60`; route `routes.ts:48` (200/201); `eval.it.test.ts:226` (second call 200, same id, 1 row) |
| AC-34 | Partially met | See details |
| AC-35 | Met | `repository.ts:109-123` (`lastRuns`, DISTINCT ON newest); `eval.it.test.ts:363` (last_run null), `:398` (`{pass:true,batch_id}`) |
| AC-36 | Met | `service.ts:95-110` (`createdFrom: 'manual'`), `routes.ts:62-71` (201); `eval.it.test.ts:363` |
| AC-37 | Met | `service.ts:112-125`; `eval.it.test.ts:363` (PUT → 200 renamed) |
| AC-38 | Met | `repository.ts:211-218` (FK cascade), `routes.ts:82-87` (204); `eval.it.test.ts:398` (runs gone after delete) |
| AC-39 | Met | `helpers.ts:97-98` → `ValidationError` (`service.ts:202-205`); `eval.it.test.ts` it.each "a diff that parses to 0 files" (422 on create and update, list unchanged) |
| AC-40 | Met | `helpers.ts:99-101`; it.each "an expectation file that is not in the diff" |
| AC-41 | Met | `eval-pipeline.ts:77-80` (refine `start_line <= end_line`); it.each "start_line greater than end_line" |
| AC-128 | Met | `eval-pipeline.ts:16,75` (`max(200_000)`); `server/src/app.ts:128-133` (zod failure → 422 `validation_error`); it.each "a diff over the 200,000-character cap" |
| AC-129 | Met | `eval-pipeline.ts:41` (`min(1)`) + `app.ts:131`; it.each "empty expectations" |
| AC-42 | Met | `service.ts:113-114,128-129,196-199`; `server/test/eval-service.test.ts:364` "404 for an unknown agent or case"; `eval.it.test.ts:363` (second DELETE → 404) |
| AC-43 | Met | `service.ts:135-171` (insert `running`, fire-and-forget `void runner.execute`), `routes.ts:89-98` (202); `eval.it.test.ts:464` (202 `running`), `:519` (runs `[]` while gated) |
| AC-44 | Met | `helpers.ts:115-126` (`snapshotOf`); `eval.it.test.ts:556` (snapshot = version 1, original prompt, provider, model) |
| AC-45 | Met | `service.ts:139-142`; `eval.it.test.ts:543` (409 `no_eval_cases`, 0 batches) |
| AC-46 | Met | `service.ts:143-151` + partial unique index (migration `0020_daily_sue_storm.sql`); `eval.it.test.ts:519`, `:894` (simultaneous starts → [202, 409]) |
| AC-47 | Met | `runner.ts:50-54` (sequential `for … await`), case ids frozen at start (`service.ts:139,161`) |
| AC-48 | Partially met | See details |
| AC-49 | Met | `runner.ts:89-98` (no intent/memory/specs/callers/repoMap keys); `eval-service.test.ts:387` asserts the exact key set `['diff','llm','model','prDescription','skills','strategy','systemPrompt','task']` |
| AC-50 | Met | `runner.ts:89-95` reads only `frozen.*`; `eval.it.test.ts:556` (edit → v2, sent prompt has only `ORIGINAL-PROMPT-MARKER`); `eval-service.test.ts:487` |
| AC-51 | Met | `eval.it.test.ts:464` (`structuredCalls(mock)` 2 and `mock.calls` 2 for 2 cases) |
| AC-52 | Met | `runner.ts:100-123`, `repository.ts:295-315` (`insertRun` with `batchId`, actual, pass, metrics) |
| AC-53 | Met | `runner.ts:125-141` (error, null metrics, `pass: null`, loop continues); `scoreBatch` excludes it from `cases_passed`; `eval.it.test.ts:602` |
| AC-54 | Met | `helpers.ts:170-188` (`finaliseBatch` done), `repository.ts:317-339` (`finishedAt: new Date()`); `eval.it.test.ts:464` (counts, metrics, cost, `finished_at`) |
| AC-55 | Met | `helpers.ts:160-169` (`all ${n} cases failed: ${first}`, null metrics, `cases_passed` 0); `eval.it.test.ts:622` |
| AC-56 | Met | `runner.ts:35-45`; `eval.it.test.ts:638` (error contains `ANTHROPIC_API_KEY`) |
| AC-57 | Met | `helpers.ts:132-135,187` (`sumReported`); `eval-helpers.test.ts:131` "has null cost when no case reported one" |
| AC-58 | Met | `server/src/app.ts:88-95` (`reapOrphans`), `repository.ts:460-466`; `eval.it.test.ts:686` |
| AC-59 | Met | `constants.ts:4` (50), `repository.ts:342-349` (`desc(ranAt)`, limit); `eval.it.test.ts:804` (50 of 55, newest first) |
| AC-60 | Met | `routes.ts:109-116`, `service.ts:179-183`; `eval.it.test.ts:464` (`EvalBatchDetail.parse` of the response) |
| AC-61 | Met | `service.ts:173-176,180-181`; `eval-service.test.ts:522` "404 for a missing batch" |
| AC-62 | Met | `helpers.ts:192-215` (`trendOf`: done, newest 10, reversed), `repository.ts:398-447`; `eval.it.test.ts:664`, `:816` |
| AC-63 | Met | `repository.ts:448-455` (limit 20, newest first); `eval.it.test.ts:816` (`recent_batches` 20) |
| AC-64 | Met | `server/src/db/seed-fixtures.ts:131-153` (`PR_482_PATCHES`: hunk `+8`, so `sk_live_` is on line 12; users hunk `+43`, so the added lines are 45–51), `seed.ts:136-149` (insert), `seed.ts:208-213` (`isNull(patch)` backfill); `server/test/seed-eval-cases.test.ts:53` |
| AC-65 | Met | `seed.ts:289-304` (`isNull(t.reviews.agentId)`); `eval.it.test.ts:737`, `:748` |
| AC-66 | Met | `server/src/db/seed-eval-cases.ts:104-178` (8 cases, exact files/ranges listed in the AC; JWT case has 2 expectations); `seed-eval-cases.test.ts:26` |
| AC-67 | Met | `seed-eval-cases.test.ts:45` "every must_find range intersects an added line" |
| AC-68 | Met | `seed-eval-cases.test.ts:37` |
| AC-69 | Met | `seed.ts:355-415` (`scoreCase`/`scoreBatch` on the stored outputs, `model: 'seed'`); `seed-eval-cases.test.ts:64`. Live: batches `4416e8cf…` / `88e7e42e…` are `done`, model `seed` |
| AC-70 | Met | `seed.ts:337-355` (cases keyed by `(owner_id,name)`, batches by `(agent_id, model='seed')`); `eval.it.test.ts:737` "keeps 8 cases, 2 seed batches, 16 runs, the #482 patches and the review agent unchanged on a second seed", `:748` |
| AC-71 | Met | `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/FindingCard.tsx:115-134` in the action row; FindingCard is rendered by `FindingsPanel/FindingsPanel.tsx:83` and `DiffTab/DiffTab.tsx:91` |
| AC-72 | Met | `FindingCard/useTurnIntoEval.ts:14,20-21` (disabled + hint "Accept or reject this finding first", `client/messages/en/prReview.json`); `FindingCard.test.tsx:110` |
| AC-73 | Met | `client/src/lib/hooks/evals.ts:54-61` (`POST /findings/${findingId}/eval-case`); `FindingCard.test.tsx:110` |
| AC-74 | Met | `useTurnIntoEval.ts:20` (`create.isPending`); `FindingCard.test.tsx:110` "pending: no double submit" |
| AC-75 | Met | `useTurnIntoEval.ts:26` (`finding.evalCreated` = "Eval case created"); `FindingCard.test.tsx:110` |
| AC-76 | Met | `FindingCard.tsx:115-119` (`/agents/${ownerId}?tab=evals`); `FindingCard.test.tsx:110` (href `/agents/agent-9?tab=evals`) |
| AC-77 | Met | `useTurnIntoEval.ts:27`; `FindingCard.test.tsx:145` "toasts the server message and keeps the button on error" |
| AC-78 | Met | `AgentEditor/constants.ts` (`evals` tab), `AgentEditor.tsx` (`tab === "evals"`), `agents/[id]/page.tsx:15` (`VALID_TABS` includes `evals`) |
| AC-79 | Partially met | See details |
| AC-80 | Met | `EvalsTab/EvalsTab.tsx:79,85-90` → `CaseEditorModal` with `record`; `CaseEditorModal/helpers.ts:41-58` (`draftFromRecord`); `CaseEditorModal.test.tsx:111` |
| AC-81 | Met | `EvalsTab.tsx:41-42`, `hooks/evals.ts:45-51` (`DELETE /eval-cases/:id`, invalidates the list on success) |
| AC-82 | Met | `EvalsTab.tsx:61-72` (`runEvals` "Run evals ({count})", `newCase`) |
| AC-83 | Met | `EvalsTab.tsx:38,65`; `EvalsTab.test.tsx:81,103` |
| AC-84 | Met | `EvalsTab.tsx:40` → `hooks/evals.ts:90-99` (`POST /agents/${agentId}/eval-runs`); `EvalsTab.test.tsx:88` |
| AC-85 | Met | `hooks/evals.ts:16-17,71`; `client/src/lib/hooks/evals.test.tsx:43` "refetches every 4 s while a batch is running and stops once none is" |
| AC-86 | Met | `EvalMetrics/EvalMetrics.tsx:19-36`, `client/src/lib/eval-metrics.ts:10-12` (`Math.round`); `eval-metrics.test.ts:48` |
| AC-87 | Met | `EvalMetrics.tsx:32` + `EvalsTab/helpers.ts:11-19` (`metricDelta` vs previous done); `EvalsTab.test.tsx:110` |
| AC-88 | Met | `EvalMetrics.tsx:17`; `client/messages/en/eval.json:121` "No runs yet. Create an eval case and run it." |
| AC-89 | Met | `EvalTrendChart.tsx:15-35`, `eval-metrics.ts:60-71` (done only, chronological, 3 series, `v${agent_version}`); `EvalTrendChart.test.tsx:38` |
| AC-90 | Met | `EvalTrendChart.tsx:36-43`, `eval-metrics.ts:74-76` (null → "—"); `EvalTrendChart.test.tsx:38` "…shows a dash in the tooltip for a null cost" |
| AC-91 | Met | `EvalRunHistory/EvalRunHistory.tsx:13,52-75` (version, ran_at, status, 3 metrics, passed/total, cost, checkbox; `newestFirst`); `EvalRunHistory.test.tsx:22` |
| AC-92 | Met | `EvalRunHistory.tsx:64-67`; `EvalRunHistory.test.tsx:22` |
| AC-93 | Met | `EvalRunHistory.tsx:30` (`selected.length !== 2`); `EvalsTab.test.tsx:110` |
| AC-94 | Met | `CompareRunsModal/CompareRunsModal.tsx:30-68` (`orderPair` by `ran_at`, `batchDelta` newer − older); `CompareRunsModal.test.tsx:47` |
| AC-95 | Met | `CompareRunsModal.tsx:43,72-76` (`toDiffFile(…, older.system_prompt, newer.system_prompt)`); `CompareRunsModal.test.tsx:47,70` |
| AC-96 | Met | `CompareRunsModal.tsx:17-18` → `hooks/evals.ts:102-108` (`GET /eval-runs/${id}` only) |
| AC-97 | Met | `CaseEditorModal/CaseEditorModal.tsx:101-189` (name, diff textarea, preview, notes, rows with kind/file/start/end, "Add expectation", per-row "Remove") |
| AC-130 | Met | `CaseEditorModal.tsx:184` (`disabled={draft.expectations.length <= 1}`); `CaseEditorModal.test.tsx:91` |
| AC-98 | Met | `CaseEditorModal.tsx:121-128` (preview when the diff is non-empty; hidden only above the 200,000 cap, where an error shows instead) |
| AC-99 | Met | `CaseEditorModal.tsx:45-46,71,156` (options = `splitUnifiedDiff` paths plus an empty placeholder); `CaseEditorModal.test.tsx:102` |
| AC-100 | Met | `CaseEditorModal/helpers.ts:65-78` (`validateDraft`), `CaseEditorModal.tsx:82,94`; `helpers.test.ts:5`, `CaseEditorModal.test.tsx:53` |
| AC-101 | Met | `CaseEditorModal.tsx:58-69` (POST vs PUT, `onClose` on success), list invalidation `hooks/evals.ts:32,41`; `CaseEditorModal.test.tsx:53,111` |
| AC-102 | Met | `CaseEditorModal.tsx:49,91`; `CaseEditorModal.test.tsx:122` |
| AC-103 | Met | `client/src/vendor/ui/nav.ts:34-40` (SKILLS LAB, `href: "/eval"`), `client/src/components/app-shell/helpers.ts:36`; `helpers.test.ts:43` |
| AC-104 | Met | `nav.ts:40` (`gKey: "e"`), `app-shell/hooks/useGlobalShortcuts.ts:31-47` (text-input guard, G-then-key); `helpers.test.ts:43` |
| AC-105 | Met | `client/src/app/eval/_components/EvalDashboardView/EvalDashboardView.tsx:45` (crumbs `Skills Lab`, `Eval Dashboard`; chevron separator `vendor/ui/shell/Topbar.tsx:41`) |
| AC-106 | Met | `AgentEvalRow/AgentEvalRow.tsx:31-54` (name, model, `latest` v/date/passed, sparkline, 3 metrics, link `?tab=evals`); `EvalDashboardView.test.tsx:65`. Sparkline is drawn from 2 done batches up (`constants.ts:2`) |
| AC-107 | Met | `AgentEvalRow.tsx:34-48` (`noBatch`, metric cells empty unless a done batch exists) |
| AC-108 | Met | `AgentEvalRow.tsx:52` → `EvalDashboardView.tsx:27-30` (`useRunEvals`); `EvalDashboardView.test.tsx:65` |
| AC-109 | Partially met | See details |
| AC-110 | Met | `EvalDashboardView.tsx:31-32` (`dashboard.runFailed` with agent name + message); `EvalDashboardView.test.tsx:89` |
| AC-111 | Met | `RecentRunsTable/RecentRunsTable.tsx:9-34` (agent, version, ran_at, status, 3 metrics, cost; data = `recent_batches`, server-capped at 20); `RecentRunsTable.test.tsx:18` |
| AC-112 | Met | `grep -rln "Markdown\|dangerouslySetInnerHTML"` over `client/src/app/eval` and `EvalsTab/` → no output (exit 1); `CaseEditorModal.test.tsx:133` "renders a case name as plain text, never as markup (AC-112)" |
| AC-113 | Cannot verify | `e2e/specs/13-eval-pipeline.flow.json` steps 1–15 (open #482, Accept, click "Turn into eval case", `wait --text "Eval case created"`). Not run by the verifier; handoff `docs/plans/eval-pipeline/handoff.md:36` records 13/13 flows |
| AC-114 | Cannot verify | flow 13 steps 16–23 (Evals tab, `wait --text "Must find: Hardcoded Stripe secret key in commit"`, `wait --text "must find"`). Not run; handoff record only |
| AC-115 | Cannot verify | flow 13 steps 24–29 (`/eval`, `7/8 passed`, row contains `83%`,`100%`,`86%`, which matches seed batch `4416e8cf…`: 0.833/1.0/0.857, 7/8). Not run; handoff record only |
| AC-116 | Cannot verify | Requires a hermetic run of all 13 flows. Not run; handoff record "13/13 flows" only |
| AC-117 | Met | root `package.json` (`verify` and `verify:l06` → `bash scripts/verify.sh`; `verify:it` → `--it`); `scripts/verify.sh:6-7,106-108` |
| AC-118 | Met | `scripts/verify.sh:50-56,59-94,97-103` (all listed lanes); the run printed the 10 lane names |
| AC-119 | Met | `scripts/verify.sh:1-4` (no `set -e`), summary loop and `exit 1`/`exit 0` at the end; run printed `Summary … All 10 lanes PASS` |
| AC-120 | Met | `scripts/verify.sh:72-94` (non-type import check + the 7 tokens) |
| AC-121 | Met | `scripts/verify.sh:97-100` (hint printed when the client typecheck lane fails) |
| AC-122 | Met | `pnpm verify` → exit 0, "All 10 lanes PASS" (run 2026-10-07) |
| AC-123 | Met | Live `GET /agents/c96b9abe…/eval-cases`: 10 cases; `created_from: "finding"` for "Must find: Hardcoded Stripe secret key in commit" (must_find) and "Must not flag: N+1 query in user list endpoint" (must_not_flag) |
| AC-124 | Partially met | See details |
| AC-125 | Met | API: batch 1 `e898aadf` recall 0.7142857 / precision 0.8571429; batch 2 `710fa40e` recall 0.8571429 / precision 1. Both differ |
| AC-126 | Met | API: batch 3 `55b99a0c` precision 0.6363636 (7/11) < batch 2 precision 1 (7/7) |
| AC-127 | Met | `docs/specs/eval-pipeline.md` `## Experiment log` has id, version, model, recall, precision, citation, passed/total, cost and a prompt summary for all 3 batches; every value matches the API rounded to 3 dp (narrative errors listed under "Work not asked for" were corrected afterwards, see the follow-up section) |
| NFR-1 | Met | API `duration_ms`: 414194 / 193266 / 469066 (all < 600000); model `deepseek/deepseek-v4-flash` = seeded `DEFAULT_MODEL` (`seed.ts:19`); every scored run `mode: single-pass`; 10 cases (≥ the 8 seeded) |
| NFR-2 | Met | `eval-score.test.ts:131` "scores 1,000 findings x 100 expectations in under 50 ms" (passes) |
| NFR-3 | Met | scoring-guard lane PASS; `score.ts:1`; `eval-score.test.ts:143` |
| NFR-4 | Met | `eval.it.test.ts:464` (2 requests for 2 cases); `mock.calls` 0 after one-click (`:226`), CRUD (`:363`), overview (`:664`) |
| NFR-5 | Partially met | See details |
| NFR-6 | Met | `hooks/evals.ts:17,71` (4000 ms only while a batch is `running`); `evals.test.tsx:43,95` |
| NFR-7 | Met | `diff server/…/contracts/eval-pipeline.ts client/…/contracts/eval-pipeline.ts` → no output |
| NFR-8 | Partially met | See details |
| NFR-9 | Met | All listed controls are native elements: `vendor/ui/primitives/Button.tsx:69` `<button>`, `kit/SelectInput.tsx:29` `<select>`, `kit/TextInput.tsx:32` `<input>`, `kit/Textarea.tsx:18` `<textarea>`, checkbox `<input type="checkbox">` (`EvalRunHistory.tsx:55`). Checked by code inspection, not in a browser |
| NFR-10 | Cannot verify | See "Cannot verify" |
| NFR-11 | Partially met | See details |

## Not met / Partially met: details

### AC-8: "The reviewer engine shall export a unified-diff parser whose output equals the output of the server's current diff parser for every input."
**Verdict:** Partially met
**Evidence:**
- The parser is exported: `reviewer-core/src/diff/parse.ts:14` (`parseUnifiedDiff`) via `reviewer-core/src/index.ts`.
- It matches the HEAD parser on the golden corpus: `diff-parse.test.ts:14` "matches the HEAD parser: …" against `test/fixtures/diff-parse.golden.json`.
- It deliberately diverges in two places:
  - `parse.ts:37-55` counts hunk lines, so a content line starting with `--- `/`+++ ` stays hunk content. At HEAD (`git show HEAD:server/src/adapters/git/diff-parser.ts`) `+++ added rule` set the file path and `--- …` was skipped.
  - `parse.ts:68-75` starts a new file on `---` after finished hunks.
- `diff-parse.test.ts` "keeps the file and line numbers when content lines start with ++ / --" asserts behaviour that HEAD does not have.

**Gap:** "for every input" does not hold. Inputs with `++`/`--` content lines and concatenated headerless file diffs parse differently from HEAD.
**To close it:** Either amend AC-8 to state the intended divergence (the handoff already queues this for `doc-writer`: `handoff.md:19-20`), or revert the two branches.

### AC-9: "The server's existing diff-parsing entry point shall keep returning the same output for the same input after the parser moves to the reviewer engine."
**Verdict:** Partially met
**Evidence:**
- `server/src/adapters/git/diff-parser.ts:1` is `export { parseUnifiedDiff } from '@devdigest/reviewer-core';`.
- The server suites still pass (792 tests).

**Gap:** For the same inputs listed under AC-8, the server entry point now returns different output than before the move.
**To close it:** Same as AC-8.

### AC-34: "IF the finding, or the agent that would own the case, does not exist in the caller's workspace, THEN `POST /findings/:id/eval-case` shall respond 404 and create no case."
**Verdict:** Partially met
**Evidence:**
- Finding branch holds: `service.ts:52` returns `NotFoundError` for a missing or cross-workspace finding (`eval.it.test.ts:321`, `eval-service.test.ts:331`).
- Agent branch: `service.ts:63-67`. A review agent that no longer exists, or a body `agent_id` from another workspace, falls through to `ConflictError(…, ERR.NO_AGENT)`, which is 409.
- `eval-service.test.ts:321` encodes exactly this: `ctx({ agentId: 'gone' })` → `['no_agent', 409]`.
- The spec's Edge cases (`docs/specs/eval-pipeline.md:225`) say a deleted review agent must give 404.

**Gap:** A non-existent owning agent gets 409 `no_agent`, not 404.
**To close it:** Throw `NotFoundError` when `ctx.review.agentId` or `body.agent_id` is set but `agents.getById` returns nothing, and update the test at `eval-service.test.ts:321`. Or amend AC-34 and the Edge case.

### AC-48: "For each case, the batch runner shall give the reviewer engine only the snapshot system prompt, the snapshot model, the case's parsed input diff, the bodies of the snapshot's linked skills, and the case's title and body as the PR description."
**Verdict:** Partially met
**Evidence:**
- `runner.ts:89-98` passes all five listed inputs.
- It also passes `task: EVAL_TASK_LINE` (`constants.ts:34-36`, a fixed instruction sentence). `eval-service.test.ts:387` pins the key set including `'task'`.
- `llm` and `strategy` are execution mechanics, not content.

**Gap:** The engine receives one more content input than "only" allows: a constant task line that is the same for every case.
**To close it:** Drop `task` (`ReviewInput.task` is optional, `reviewer-core/src/review/run.ts:83`), or amend AC-48 to list the fixed eval task line.

### AC-79: "The Evals tab shall list every case of the agent with its name, each expectation as "must find" or "must not flag" with its `file:start-end`, and its last-run status as "passed", "failed" or "never run"."
**Verdict:** Partially met
**Evidence:**
- Name, kinds and ranges: `EvalCaseList.tsx:42-50`.
- `EvalsTab/helpers.ts:21-24`: `if (!c.last_run || c.last_run.pass == null) return "neverRun"`.
- An errored run stores `pass: null` (`runner.ts:132`). Live: "Path traversal in upload reader" has `last_run: {"pass":null,"batch_id":"55b99a0c…"}`, so the tab shows "never run" for a case that ran in batch 3.

**Gap:** A case whose newest run errored shows "never run" instead of "failed". AC-53 counts it as not passed.
**To close it:** In `caseStatus`, map `last_run` present with `pass == null` to `"failed"`, and add the case to `EvalsTab/helpers.test.ts:21`.

### AC-109: "WHEN a user clicks "Run all agents", the studio shall request `POST /agents/:id/eval-runs` once for each agent that has at least 1 case."
**Verdict:** Partially met
**Evidence:**
- `EvalDashboardView.tsx:42,49` runs `runnableAgents(...)`.
- `helpers.ts:4-6` (`canRunAgent`) also excludes agents whose `latest_batch.status === "running"`. Test `helpers.test.ts:16` "only runs agents with cases and no batch in flight".
- The spec's Edge case (`docs/specs/eval-pipeline.md:234`) expects the request to be sent and its 409 `batch_running` named in a notification.

**Gap:** An agent with cases and a running batch gets no request and no notification.
**To close it:** Have "Run all" filter on `cases_total > 0` only and let the AC-110 toast report the 409, or amend AC-109 and the Edge case.

### AC-124: "The experiment shall run 3 batches for the Security Reviewer on the same case set with a real model: batch 1 on the seeded prompt, batch 2 on a tightened prompt, and batch 3 on a prompt that adds the line "Flag every `const` declaration as a SUGGESTION"."
**Verdict:** Partially met
**Evidence:**
- 3 `done` batches on `deepseek/deepseek-v4-flash` over the same 10 cases.
- Batch 1's prompt equals the seeded snapshot (compared against seed batch `4416e8cf`: `true`).
- Batch 2 adds "# Scope lock" plus one paragraph.
- Batch 3 adds exactly one line versus v1: "Flag every `const` declaration in the diff as a SUGGESTION finding, citing its exact line." (line diff of the `system_prompt` snapshots from `GET /agents/:id/eval-runs`).

**Gap:** The added line is not the AC's quoted line verbatim (extra "in the diff" and "finding, citing its exact line"). The intent is the same.
**To close it:** Amend the AC-124 wording to the line actually used, or record the exact line in the Experiment log and accept it.

### NFR-5: "`GET /agents/:id/eval-runs`, `GET /eval-runs/:id` and `GET /eval/overview` shall respond within 200 ms at p95 on the local dev stack, for an agent with 50 batches of 8 cases each."
**Verdict:** Partially met
**Evidence:**
- `eval.it.test.ts:828`: p95 2.19 / 2.07 / 5.37 ms.
- The fixture (`:778-790`) inserts 55 batches with `casesTotal: 0` and no runs. The detail call uses a seeded batch with 8 runs.
- Dev API p95 over 20 calls: 12.4 / 9.4 / 16.2 ms, with 6 batches.

**Gap:** Neither measurement uses the specified load of 50 batches × 8 case runs. The latency is far under 200 ms but was never measured at that load.
**To close it:** Seed 50 batches with 8 `eval_runs` each for the history agent in the NFR-5 fixture and re-run `pnpm exec vitest run eval.it`.

### NFR-8: "Every new UI string shall live in `client/messages/en/eval.json`, except the finding card strings, which shall live in `client/messages/en/prReview.json`."
**Verdict:** Partially met
**Evidence:**
- The eval components use `useTranslations("eval")`, and the finding-card strings are in `prReview.json` (`turnIntoEval`, `evalNeedsDecision`, `evalCreated`, `openEvals`).
- Two new strings are TS literals in `client/src/vendor/ui/nav.ts`:
  - `label: "Eval Dashboard"` (`:40`), rendered by the sidebar via `item.label` (`vendor/ui/shell/NavItem.tsx:54`).
  - `"Go to Eval Dashboard"` (`:72`), rendered by `command-palette/ShortcutsHelp.tsx:46`.

**Gap:** Two new UI strings live outside `messages/en/*.json`. This follows the existing nav.ts convention for every other nav item, but the NFR has no exception for it.
**To close it:** Amend NFR-8 with the nav.ts exception, or move nav labels to messages.

### NFR-11: "Each finished batch shall log 1 line with the batch id, agent id, agent version, model, status, cases passed and total, the three metrics, tokens, cost and duration. It shall never log diff text, prompt text, PR title or body, or finding text."
**Verdict:** Partially met
**Evidence:**
- `runner.ts:75` logs `batchLogFields(...)`, defined at `helpers.ts:218-237`. Its keys are `batch_id, agent_id, status, cases_total, cases_passed, recall, precision, citation_accuracy, duration_ms, tokens_in, tokens_out, cost_usd`.
- `agent_version` and `model` are absent.
- The "never log" half holds: `eval-service.test.ts:508`.

**Gap:** Agent version and model are missing from the line.
**To close it:** Pass `frozen.snapshot.agentVersion` / `.model` into `batchLogFields`, and extend `eval-helpers.test.ts:145` to assert both keys.

## Work not asked for by any item
- `server/src/platform/config.ts` (`RATE_LIMIT_MAX`, default 120), `server/src/app.ts` (`max: config.rateLimitMax`), `server/test/config.test.ts`, `scripts/e2e.sh` (`RATE_LIMIT_MAX=2000`). This is e2e infrastructure for the 13th flow hitting 429; no AC or NFR asks for it, and the plan does not mention it.
- `e2e/specs/08-smart-diff.flow.json`: scroll changed from `700` to `5000`. No item asks for it.
- `server/src/modules/eval/helpers.ts:74-83` (`withRequestDeadline`) and `constants.ts:13` (`CASE_TIMEOUT_MS = 240_000`). This per-request deadline was added after the stalled first experiment attempt; no AC asks for it.
- `server/src/platform/errors.ts:50-52`: `ConflictError` gains a `code` parameter. The spec's provenance says the 409 codes go through `AppError` directly. The wire envelope is the same; this deviation is recorded in `handoff.md:75-76`.
- Migration `0020_daily_sue_storm.sql` (partial unique index, one running batch per agent). The plan's Recommendation 2 says "Not planned unless the user accepts it"; `handoff.md:40` lists it as applied.
- `client/src/vendor/ui/charts/Sparkline.tsx` and `Sparkline.test.tsx`: single-point fix, not in the plan's touched list.
- `.gitignore`: `/pnpm-lock.yaml`.
- `evals/skills/backend-onion-architecture/`: the spec lists it as a Non-goal and a separate artifact.
- Doc edits not tied to an item: `README.md`, `client/README.md`, `server/README.md`, `docs/insights.md`, `server/docs/insights.md`, `e2e/docs/insights.md`, `docs/retros/ledger.md`.
- Expected but not present yet at run time (pending `doc-writer` per `handoff.md:18-22`): spec `Status` still `approved`, AC checkboxes unticked, no Features row in `docs/specs/README.md`. The new module's memory is present: `server/src/modules/eval/AGENTS.md` and `CLAUDE.md -> AGENTS.md`.
- Experiment log narrative contradicted the API data at run time (corrected afterwards, see the follow-up section). The required AC-127 fields were correct.
  - **Batch 1 also had an errored case.** "Discount arithmetic is not a security finding" hit the 240 s deadline, so batch 1 is scored over 9 cases. The log mentioned an errored case only for batch 3.
  - **The Stripe claim was wrong.** "Known miss on every batch … both Stripe `must_find` cases score recall 0" is false: in batch 1 the one-click Stripe case passed (kept `src/config.ts:11-14`); in batches 2 and 3 the seeded Stripe case passed (kept `src/config.ts:12-12`).
  - **Batch 3 noise was mislabelled.** It was called "4 ungrounded or off-expectation findings", but batch 3 `dropped_total` is 0. All 4 noise findings are kept findings on `src/api/users.ts` lines 47–51 that match the two N+1 `must_not_flag` cases.
  - **Durations differed slightly.** The log had 416 s / 196 s for batches 1 and 2; the API `duration_ms` is 414194 / 193266.

## Cannot verify
- **AC-113, AC-114, AC-115, AC-116.**
  - Tried: read `e2e/specs/13-eval-pipeline.flow.json` (29 steps; the step assertions match the AC texts, and step 29's `83%/100%/86%` and step 28's `7/8 passed` match seed batch `4416e8cf`). Read the handoff record "13/13 flows" (`handoff.md:36`).
  - Why not settled: the verifier was told not to run `npm run e2e:hermetic`.
  - What would settle it: `cd e2e && npm run e2e:hermetic` reporting 13/13, with flow 13 green and no LLM call in the captured API log.
- **NFR-10** ("render legibly in both the `dark` and `light` themes").
  - Tried: `grep -rnE '#[0-9a-fA-F]{3,6}\b|rgb\('` over `client/src/app/eval` and `EvalsTab/` returned no output, so every colour is a CSS variable. Only the FindingCard test renders both themes (`FindingCard.test.tsx:110`); no Evals tab, Case Editor, Compare or Dashboard test does.
  - Why not settled: legibility is a visual property.
  - What would settle it: a manual or agent-browser screenshot of the four surfaces under `data-theme="dark"` and `"light"`.

## Confidence
- **High** for the contracts, engine, server and seed items: the code was read at the symbol, the cited tests were run green, and the live dev-API data was checked.
- **Medium** for the studio items: the evidence is unit tests and code, not a browser.
- **Low** for AC-113…AC-116 and NFR-10, which rest only on the handoff record and code inspection.
- What would raise it: a hermetic e2e run, a two-theme visual check, and the NFR-5 fixture at 50 × 8.

## Follow-up (coordinating session, 2026-10-07, after the run)

| Item | Closed by | Where |
|---|---|---|
| AC-34 | code (`implementer`, then corrected): a resolved-but-missing owning agent is 404 `not_found`; 409 `no_agent` only when neither the review nor the body names one. The review's agent stays primary (AC-28) and the body `agent_id` is the fallback (AC-29) | `server/src/modules/eval/service.ts:64-69` (`ownerId`, `NotFoundError('Agent not found')`); `server/test/eval-service.test.ts` "owns by the body agent only when the review has none…", "the review agent wins over a body agent_id (AC-28), even when the review agent is gone (AC-34)", "404 not_found when the owning agent no longer resolves…" |
| AC-79 | code: a case with a `last_run` whose `pass` is `null` (errored) shows "failed"; only a missing `last_run` is "never run" | `client/src/app/agents/[id]/_components/AgentEditor/_components/EvalsTab/helpers.ts:22-24` (`caseStatus`); `helpers.test.ts` "maps last_run to a status" |
| AC-109 | code: "Run all agents" requests every agent with `cases_total > 0`; a server 409 `batch_running` is toasted (AC-110). Side effect: the per-row Run button is also enabled while a batch runs | `client/src/app/eval/_components/EvalDashboardView/helpers.ts` (`canRunAgent`); `helpers.test.ts` "runs every agent with cases, including one with a batch in flight…" |
| NFR-5 | test fixture: 55 history batches × 8 `eval_runs`; `GET /eval-runs/:id` measured on one of them. p95 after the change: 2.57 / 1.37 / 4.36 ms | `server/test/eval.it.test.ts:774-808` (`histBatchId`, `casesTotal: 8`), `:841` |
| NFR-11 | code: the batch log line carries `agent_version` and `model` | `server/src/modules/eval/helpers.ts:227-228` (`batchLogFields`); `server/test/eval-helpers.test.ts` "log fields carry ids, counts and metrics only" |
| AC-8, AC-9 | spec amended to the shipped parser (two stated divergences from the pre-move server parser) | `docs/specs/eval-pipeline.md` Changelog 2026-10-07 |
| AC-48 | spec amended: the fixed `EVAL_TASK_LINE` is listed as an input | same |
| AC-124 | spec amended to the exact line used in batch 3 | same |
| NFR-8 | spec amended with the `nav.ts` label exception | same |
| AC-113…AC-116 | still "verified by handoff record" (13/13 hermetic flows before the follow-up code changes). The coordinating session was not permitted to re-run `npm run e2e:hermetic`; the user should run it once before the PR | `docs/plans/eval-pipeline/handoff.md` Gate status |
| NFR-10 | unchanged: Cannot verify without a visual check; all colours are CSS variables | — |
| Experiment log narrative | corrected from `GET /eval-runs/:id` per-case data (batch 1 errored case, Stripe cases mutually exclusive, batch 3 noise is kept findings, durations 414/193/469 s) | `docs/specs/eval-pipeline.md` `## Experiment log` |

Gates re-run after the code changes (all green): `cd server && pnpm typecheck && pnpm arch:check`; server unit 55 files / 794 tests; `eval.it` 30 tests; `cd client && pnpm typecheck && pnpm arch:check && pnpm test` 66 files / 412 tests; `pnpm verify` 10/10 lanes.
