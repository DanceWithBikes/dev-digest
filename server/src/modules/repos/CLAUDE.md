# modules/repos — repositories

Routes: `POST /repos` · `GET /repos` · `POST /repos/:id/refresh` · `DELETE /repos/:id`

- Adding a repo enqueues an async `clone` job (`GitClient`), followed by a repo-intel index job.
- Clones live in `DEVDIGEST_CLONE_DIR` (default `./clones`, git-ignored).
- `service.ts` has no HTTP and no raw SQL: SQL → `repository.ts`, transforms → `helpers.ts`, literals → `constants.ts`.
- `withGitHubToken` embeds the token in the clone URL — never log those URLs.

Docs: docs/specs/ · docs/insights.md
