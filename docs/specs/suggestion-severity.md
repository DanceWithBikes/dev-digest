# SUGGESTION severity

> Introduced in: L01. Refs are `path:line` (`symbol`) at the time of writing — if a line moved,
> search for the symbol.

## Goal
Make the SUGGESTION severity reachable for the built-in General Reviewer. Its prompt defined SUGGESTION as "a minor improvement or nit" and then banned nits twice, so the model never emitted it — although the score penalises SUGGESTION (−3, `reviewer-core/src/review/reduce.ts:16`) and the UI renders a SUGGESTION pill.

## Acceptance criteria
- [x] SUGGESTION is defined by concrete cases on code that is correct today: a duplicated magic constant, dead or unreachable code, a misleading name or doc comment, a redundant check — `server/src/db/seed-prompts.ts:69` (`GENERAL_REVIEWER_PROMPT`) · untested
- [x] The Quality-bar ban went from "No style nits" to formatting and naming-preference nits (whitespace, quote style, import order, naming taste); Clarity §4's "not a license to report style nits" is unchanged (`server/src/db/seed-prompts.ts:47`) — `server/src/db/seed-prompts.ts:57` · untested
- [x] `docs/agent-prompts/general-reviewer.md` carries the same text (= `GENERAL_REVIEWER_PROMPT` + a trailing newline, checked 2026-09-19); nothing enforces the sync — `docs/agent-prompts/general-reviewer.md:59` (SUGGESTION), `docs/agent-prompts/general-reviewer.md:47` (ban) · untested
- [x] The seed inserts a built-in agent only when none with that name exists, so the new text reaches an existing DB only via `PUT /agents/:id` with `system_prompt`, which bumps the agent's version — `server/src/db/seed.ts:220`, `server/src/modules/agents/helpers.ts:80` · test: `server/test/reviews.it.test.ts:127` ("agents CRUD"; the version bump only)

## Touched packages / modules
- Seed data: `server/src/db/seed-prompts.ts` (no `docs/specs/` — `server/src/db` is not a module).
- Prompt docs: `docs/agent-prompts/general-reviewer.md`.
- Live data: the General Reviewer row in `agents` (updated through the API, no code change).
- No module code changed, so no module has a part file.

## Open questions
- **The live prompt has lost its markdown** — in the dev DB (2026-09-19, read-only SELECT) General Reviewer v5 has the same wording, so the new rule is live, but no backticks and no `**` (4592 chars vs 4640 for `GENERAL_REVIEWER_PROMPT`). The server stores `system_prompt` verbatim (`server/src/modules/agents/repository.ts:131`), so it was stripped before the `PUT`. Tracked in `server/src/modules/reviews/docs/insights.md` (Open Questions).
- **Clarity §4 vs SUGGESTION** — Clarity is limited to "only when it can cause a real bug" (`server/src/db/seed-prompts.ts:45`), yet SUGGESTION allows "a misleading name or doc comment on otherwise-correct code" (`server/src/db/seed-prompts.ts:71`).
- **Seeded agents have no v1 snapshot** — the seed inserts into `agents` directly (`server/src/db/seed.ts:220`), bypassing the repository's v1 snapshot, so the General Reviewer's history starts at v2 (dev DB: versions {2,3,4,5}).
