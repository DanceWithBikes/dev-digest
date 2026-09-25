# modules/pulls — pull requests

Routes: `GET /repos/:id/pulls` · `GET /pulls/:id` · `GET /pulls/:id/smart-diff` · `POST /pulls/:id/smart-diff/summaries` · `GET|POST /pulls/:id/comments`

- `GET /pulls/:id/smart-diff` groups the PR's files by reviewer role (`core → tests → wiring → docs → boilerplate`, `helpers.ts:classifyFile`) and attaches finding-line anchors from ALL of the PR's review runs (accepted + dismissed). No GitHub call — pure local read.
- `pseudocode_summary` (per file) is cached in its own table, `pr_file_summary` (`db/schema/pulls.ts`) — NOT a `pr_files` column, because `replaceFiles` deletes and reinserts every `pr_files` row on each `GET /pulls/:id` detail refresh. `GET /pulls/:id/smart-diff` only ever reads that cache (still LLM-free); `POST /pulls/:id/smart-diff/summaries` is the one route that calls a model, and only for uncached `core`-group files, capped at `SMART_DIFF_SUMMARY_LIMIT`. A cached row's `patch_sha` must match the file's current patch or it is served as `null` (stale, not deleted). The model call goes through the `SummaryGenerator` port (`ports.ts`), resolved in `compose.ts` from `container.featureModel(ws, 'smart_diff')`.

- The DB `status` column is GitHub's merge state (open/merged/closed).
- Review status (`needs_review` / `reviewed` / `stale`) is DERIVED in `status.ts` from `lastReviewedSha` vs head plus age (`STALE_DAYS`); it is not stored.
- `status.ts` is pure (no DB) and unit-tested (`test/pulls-status.test.ts`).
- Severities: `CRITICAL` / `WARNING` / `SUGGESTION`.
- Reads are LOCAL-FIRST: `service.ts` syncs from GitHub when a token is configured but never fails the request — already-imported/seeded PRs stay viewable offline. Posting a comment has no fallback and does fail.
- `repository.ts` names every column and returns the types in `domain.ts`, never Drizzle rows; `ports.ts` has the one-level `WarnLogger` so the service stays free of `fastify`.

Docs: docs/specs/ · docs/insights.md
