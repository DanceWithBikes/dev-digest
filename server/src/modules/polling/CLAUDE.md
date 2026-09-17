# modules/polling — PR list sync

Route: `POST /repos/:id/poll`

- Only syncs the PR list from GitHub (new/updated PRs, `head_sha`) and bumps `last_polled_at`.
- Never triggers a review — reviews are always manual (reviews module).
- The whole module is a single `routes.ts`.

Docs: docs/specs/ · docs/insights.md
