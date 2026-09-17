# modules/pulls — pull requests

Routes: `GET /repos/:id/pulls` · `GET /pulls/:id` · `GET|POST /pulls/:id/comments`

- The DB `status` column is GitHub's merge state (open/merged/closed).
- Review status (`needs_review` / `reviewed` / `stale`) is DERIVED in `status.ts` from `lastReviewedSha` vs head plus age (`STALE_DAYS`); it is not stored.
- `status.ts` is pure (no DB) and unit-tested (`test/pulls-status.test.ts`).
- Severities: `CRITICAL` / `WARNING` / `SUGGESTION`.

Docs: docs/specs/ · docs/insights.md
