# modules/pulls — pull requests

Routes: `GET /repos/:id/pulls` · `GET /pulls/:id` · `GET|POST /pulls/:id/comments`

- The DB `status` column is GitHub's merge state (open/merged/closed).
- Review status (`needs_review` / `reviewed` / `stale`) is DERIVED in `status.ts` from `lastReviewedSha` vs head plus age (`STALE_DAYS`); it is not stored.
- `status.ts` is pure (no DB) and unit-tested (`test/pulls-status.test.ts`).
- Severities: `CRITICAL` / `WARNING` / `SUGGESTION`.
- Reads are LOCAL-FIRST: `service.ts` syncs from GitHub when a token is configured but never fails the request — already-imported/seeded PRs stay viewable offline. Posting a comment has no fallback and does fail.
- `repository.ts` names every column and returns the types in `domain.ts`, never Drizzle rows; `ports.ts` has the one-level `WarnLogger` so the service stays free of `fastify`.

Docs: docs/specs/ · docs/insights.md
