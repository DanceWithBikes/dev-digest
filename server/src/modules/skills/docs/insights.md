# Insights — modules/skills

Knowledge you can't see in the code. Newest entry on top of each section.
Format and rules: `.claude/skills/engineering-insights/SKILL.md`.

## What Works

- **2026-09-21 · A NEW module cannot be copied from `agents` — two of its imports are baselined violations** — `agents/helpers.ts:3` imports `AgentRow` from `./repository.js` and `agents/service.ts:54` takes the whole `Container`. Both are forbidden (`domain-files-are-pure`, `services-take-ports-not-the-container`) and only pass because they sit in `.dependency-cruiser-known-violations.json`; a new file doing the same fails `pnpm arch:check` immediately, and the fix is NOT to re-run `arch:baseline`. What works instead, and what this module does: (1) `helpers.ts` declares the persisted shapes structurally (`SkillRecord`, `SkillVersionRecord`) instead of importing the Drizzle row — the repository's rows satisfy them; (2) `service.ts` takes `SkillsRepository`, and a `compose.ts` holds the one `new SkillsRepository(container.db)` call, because `routes-only-talk-to-services` also forbids `routes.ts → repository.ts` while `compose.ts` is explicitly exempt from the container rule. Cost: two small extra pieces. Benefit: `arch:check` green with zero baseline churn, and the service is unit-testable with a fake repo.
  Where: `helpers.ts:20` (`SkillRecord`), `compose.ts:10` (`makeSkillsService`), `routes.ts:39` (`makeSkillsService(app.container)`); the rules: `server/.dependency-cruiser.cjs:29` (`routes-only-talk-to-services`), `:100` (`domain-files-are-pure`), `:76` (`services-take-ports-not-the-container`)

## What Doesn't Work

## Codebase Patterns
- **2026-10-08 · `.claude/skills/*` never reaches the studio's Skills list, and `eval_*` tables cannot hold skill eval results** — the studio's `skills` table is filled only by the seed, `POST /skills` (Import/Create) or agents; nothing scans `.claude/skills`, so a skill written for Claude Code stays invisible until it is seeded or imported. Likewise `eval_batches.agent_id` is NOT NULL and the eval module filters on `ownerKind='agent'`, so results from the `evals/` package (`evals/results/records.jsonl`, gitignored, no explicit `skill` field — derive it from the `skill:<name>` segment of `nodeid`) need their own table instead of `eval_runs`.
  Where: `server/src/db/seed.ts:480` (`seedSkills`), `server/src/db/schema/eval.ts:59` (`agentId`)

- **2026-09-21 · `/skills/parse` must be registered BEFORE `/skills/:id`, and its no-write property is the import guarantee** — `IdParams` validates `:id` as a uuid, so a `POST /skills/parse` registered after the parameterised route would 422 on "parse" instead of hitting the parser. More importantly the split into `POST /skills/parse` (pure, returns a `SkillDraft`) + `POST /skills` (persists) is deliberate: the preview endpoint has no repository call at all, so "nothing is saved until the user confirms" is enforced by the API shape rather than by UI discipline. Do not "simplify" it into a single endpoint with a `dryRun` flag — that moves the guarantee back into a branch someone can get wrong.
  Where: `routes.ts:47` (`POST /skills/parse`, registered first), `service.ts:90` (`parse()` — no repo access), `helpers.ts:160` (`parseSkillMarkdown`)

- **2026-09-21 · Only a BODY change versions a skill — unlike agents, where any config change does** — `skill_versions` stores `(skill_id, version, body)` and nothing else, so snapshotting a rename or a type change would write a row byte-identical to its predecessor. Hence `isBodyChange` rather than the agents module's `isConfigChange`, and hence toggling `enabled` never bumps the version. This is what makes the UI copy "Saving a changed body creates a new immutable version" literally true. If the table ever gains columns, this rule has to change with it.
  Where: `helpers.ts:70` (`isBodyChange`), `repository.ts:87` (`bodyChanged` → `nextVersion`), `server/src/db/schema/skills.ts:23` (`skillVersions`)

## Tool & Library Notes
- **2026-10-08 · A failed judge practice is written with `evidence: null`, so a strict `evidence: z.string()` silently drops the failing records** — 7 of 91 `react-best-practices` records were skipped this way and the Evals tab showed 2/5 passing instead of 4/5, because the failed runs (the interesting ones) were the ones lost. The parser now normalises `null` to `''` locally; the response contract in `@devdigest/shared` stays `z.string()`.
  Where: `server/src/modules/skills/eval-records.ts:15` (`RecordPractice`), `server/test/skill-eval-records.test.ts` (null-evidence test)
- **2026-10-08 · `parseSkillMarkdown` silently hard-truncates `description` to 280 chars** — a long SKILL.md frontmatter description (e.g. `engineering-insights`) is cut mid-sentence when seeded or imported; no error is raised. Shorten the description in the SKILL.md itself if the cut matters.
  Where: `server/src/modules/skills/helpers.ts:198` (`.slice(0, MAX_DESCRIPTION_CHARS)`), `server/src/modules/skills/constants.ts:19` (`MAX_DESCRIPTION_CHARS`)
- **2026-10-08 · `evals/results/records.jsonl` mixes record shapes — match `nodeid` before validating** — legacy `skill:react-best-practices` / `skill:dependency-checker` lines fail a strict shape check, so validating first inflates the `skipped` count (10 false skips seen); `workflow:*` records can carry the same skill name but are not skill-suite results. `run_id` is `YYYYMMDDTHHMMSS` in UTC.
  Where: `server/src/modules/skills/eval-records.ts:56` (`parseNodeId`), `server/src/modules/skills/eval-records.ts:141` (`recordsForSkill`)
- **2026-10-08 · A second repository in a module must live in `repository/<x>.repo.ts`, and any fs call goes through an adapter on `Container`** — the dependency-cruiser rules allow `drizzle-orm` / `src/db` only in `repository.ts` or `repository/**`, and forbid `fs` in `compose.ts` (`application-has-no-direct-io`) and `adapters/` imports from modules (`modules-depend-on-ports-not-adapters`); `pnpm arch:check` fails otherwise.
  Where: `server/.dependency-cruiser.cjs:35` (`to.path` repository/adapters rule)

- **2026-09-21 · A zip reader belongs in `helpers.ts` — `node:zlib` is NOT in the arch gate's `IO_BUILTINS`** — `application-has-no-direct-io` blocks every file except `repository.ts` from importing `node:fs`/`node:net`/etc., which makes it look as though unzipping has to live in an adapter. It doesn't: the gate's `IO_BUILTINS` list has no `zlib`, because `inflateRawSync` is a CPU primitive over a `Buffer` the caller already has — no descriptor, no socket, nothing to mock. So `extractSkillMarkdownFromZip` sits in the pure helpers with the rest of the parser and is unit-testable by building a zip in the test with `deflateRawSync`. The security guard that actually matters is `inflateRawSync(buf, { maxOutputLength })`: it aborts mid-inflate, whereas trusting the central directory's declared uncompressed size checks a number the attacker wrote.
  Where: `../../helpers.ts` (`extractSkillMarkdownFromZip`), `../../constants.ts` (`MAX_SKILL_ARCHIVE_ENTRY_BYTES`), `server/.dependency-cruiser.cjs` (`IO_BUILTINS`, rule `application-has-no-direct-io`)

## Recurring Errors & Fixes

## Session Notes

## Open Questions
