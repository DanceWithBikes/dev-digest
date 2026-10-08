# eval — turn decided findings into regression cases, score an agent over them

One click turns an accepted finding into a `must_find` case and a dismissed one into a
`must_not_flag` case. `POST /agents/:id/eval-runs` runs the agent over its whole case set in
the background with frozen inputs; the scorers in `reviewer-core` (no model call) produce
recall, precision and citation accuracy per case and per batch. Spec: `docs/specs/eval-pipeline.md`.

## Layers (flat module)
`routes.ts` → `service.ts` (use cases) + `runner.ts` (background batch execution) →
`repository.ts` (the only file touching drizzle / `src/db`) + `ports.ts` + `domain.ts`/`helpers.ts`/`constants.ts`
(pure). `compose.ts` is the only file that sees the `Container`.

## Rules you can't infer from the code
- `workspaceId` only via `getContext`. Never import another module's folder: review and agent data
  arrive through `container.reviewRepo` / `container.agentsRepo`, adapted structurally in `compose.ts`.
- Specific 409 codes (`finding_undecided`, `no_agent`, `no_patch`, `no_eval_cases`, `batch_running`) are
  `new ConflictError(msg, undefined, ERR.X)` — the third argument is the envelope's `error.code`
  (default `conflict`). `insertBatch` returns `undefined` on the partial unique index
  `eval_batches_one_running_uq` (one `running` batch per agent); the service maps that to `batch_running`.
- The runner loads all cases of a batch once and writes the scored `expected_output` into each run's
  `actual_output`; `getBatchWithRuns` prefers that snapshot over the live case.
- A stored PR patch has no `---`/`+++` header: build case diffs with `fileDiff(path, patch)` from reviewer-core.
- Diffs are parsed through `@devdigest/reviewer-core`, never the server's git adapter (modules may not import adapters).
- The batch snapshot (prompt, model, provider, skill bodies) is taken once at request time; the runner reads only
  the snapshot. The engine gets no intent, memory, specs, callers or repo map (AC-49).
- The runner is fire-and-forget (`void run().catch(log)`), never inside `container.jobs` (it re-runs failed handlers).
- Every model request of a batch goes through `withRequestDeadline(llm, CASE_TIMEOUT_MS)` (wired in `compose.ts`): only `singleAttempt: true` honours `timeoutMs`, otherwise a stalled request waits the provider's 900 s default.
- Logs carry ids, counts and metrics only — never diffs, prompts or PR text (NFR-11).
- An `*.it.test.ts` that starts a batch must override every reachable LLM in `buildApp({ overrides })`.
- Pure code stays in `constants.ts`/`domain.ts`/`helpers.ts`/`ports.ts` (the purity rule matches exact filenames).

## Docs
`../AGENTS.md` (module rules) · `docs/insights.md` · `docs/specs/eval-pipeline.md` · the `backend-onion-architecture` skill
