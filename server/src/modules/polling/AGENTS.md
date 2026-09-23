# modules/polling — PR list sync

Route: `POST /repos/:id/poll`

- Only syncs the PR list from GitHub (new/updated PRs, `head_sha`) and bumps `last_polled_at`.
- Never triggers a review — reviews are always manual (reviews module).
- `routes.ts` → `service.ts` → `repository.ts`; `compose.ts` wires them. The upsert is the same idempotent (repo_id, number) write the pulls module does, and it deliberately leaves the diff stats alone — the list payload reports them as zero.

Docs: docs/specs/ · docs/insights.md
