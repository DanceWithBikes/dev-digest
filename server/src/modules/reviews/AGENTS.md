# modules/reviews — review runs, findings, run traces

Routes: `POST /pulls/:id/review` · `/reviews` · `/findings/:id/(accept|dismiss)` · `/runs/:id/(events|trace)` · `/pulls/:id/intent` (GET/POST)

- `POST /pulls/:id/review` inserts `agent_runs` and responds immediately; the work runs in `run-executor.ts` (`executeRuns` is not awaited).
- Review logic lives in `@devdigest/reviewer-core`. This module only does I/O: diff, repo-intel context, persistence, `runBus`.
- A diff-load failure fails ALL queued agents (`failAll`); a single agent failure is isolated.
- `blockers` = `countBlockers(findings, agent.ciFailOn)`; the model's verdict is never the signal.
- Every run ends with `completeAgentRun` + ONE `run_traces` document + `runBus.complete(runId)` — also on failure/cancel.
- `repository.ts` is a facade over `repository/{pull,review,run}.repo.ts`.
- `POST /pulls/:id/review` has a tighter rate limit (10/min) than the global one.
- **Intent Layer (L03)**: `intent-helpers.ts`/`intent-sources.ts`/`intent-prompt.ts` are pure; `ports.ts` declares `IntentSourceCollector`/`IntentClassifier`; `compose.ts` wires the concrete `RepoIntentSourceCollector`/`LlmIntentClassifier` against the `Container` (`makeIntentEngine`, same shape as `conventions/compose.ts`). The classifier's own prompt `wrapUntrusted()`s the title/body/issue/spec (and, defense-in-depth, the files/commits digest too) — confidence/sources/missing_context are DERIVED from which sources resolved, never model-reported. `service.ts#getIntent`/`detectIntent` is the manual re-run path (`POST /pulls/:id/intent`), scoped through `getPull(workspaceId, prId)` first since `pr_intent` has no `workspace_id` of its own. `ReviewRunExecutor#deriveIntent` runs the SAME collect→classify→upsert sequence once per run, shared across every queued agent via the fanned-out `RunLogger`, between the diff load and the per-agent loop — reusing the stored record when `head_sha` still matches `pull.headSha`, re-classifying when it's missing or stale. The collector+classifier pair is INJECTED into the executor's constructor by `service.ts` (`makeIntentEngine`), never pulled off the `Container` inside the executor, so the LLM call stays out of the application ring. A classifier failure there is best-effort — logged, never `failAll` — unlike a diff-load failure.

Do-not-touch: grounding and `INJECTION_GUARD` live only in reviewer-core — never duplicate them here.
- `platform/model-router.ts#routeModel(task:'intent')` is DEAD CODE — nothing calls it; never wire it up as a rival to `container.featureModel(ws, 'review_intent')`, the actual mechanism `LlmIntentClassifier` uses (`compose.ts`).

Docs: ../../../../reviewer-core/README.md · ../../../README.md (Review context) · docs/specs/ · docs/insights.md
