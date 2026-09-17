# server/platform — app infrastructure

- `container.ts` — composition root: config, db, jobs, runBus, lazy adapters, shared repos (`agentsRepo`, `reviewRepo`), `priceBook`. Tests swap parts via `ContainerOverrides`.
- `container.llm(provider)` throws when the key is missing — callers turn that into a `failed` run.
- `jobs.ts` — background jobs (p-queue + `jobs` table, timeout + retry). Long work never runs inside a route handler.
- `sse.ts` (`runBus`) — run event stream and cancellation (`isCancelled`).
- `errors.ts` — `AppError` / `NotFoundError` / `ValidationError`; throw them, the error handler maps the status.
- `config.ts` — secrets are NOT part of `AppConfig`; they go through `SecretsProvider`.

Do-not-touch: `grounding.ts`, `prompt.ts` are re-export shims of `@devdigest/reviewer-core` — add no logic here.

Docs: ../../README.md · ../../docs/insights.md
