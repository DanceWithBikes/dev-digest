# modules/reviews — review runs, findings, run traces

Routes: `POST /pulls/:id/review` · `/reviews` · `/findings/:id/(accept|dismiss)` · `/runs/:id/(events|trace)`

- `POST /pulls/:id/review` inserts `agent_runs` and responds immediately; the work runs in `run-executor.ts` (`executeRuns` is not awaited).
- Review logic lives in `@devdigest/reviewer-core`. This module only does I/O: diff, repo-intel context, persistence, `runBus`.
- A diff-load failure fails ALL queued agents (`failAll`); a single agent failure is isolated.
- `blockers` = `countBlockers(findings, agent.ciFailOn)`; the model's verdict is never the signal.
- Every run ends with `completeAgentRun` + ONE `run_traces` document + `runBus.complete(runId)` — also on failure/cancel.
- `repository.ts` is a facade over `repository/{pull,review,run}.repo.ts`.
- `POST /pulls/:id/review` has a tighter rate limit (10/min) than the global one.

Do-not-touch: grounding and `INJECTION_GUARD` live only in reviewer-core — never duplicate them here.

Docs: ../../../../reviewer-core/README.md · ../../../README.md (Review context) · docs/specs/ · docs/insights.md
