# Insights — server/modules/agents

Knowledge you can't see in the code. Newest entry on top of each section.
Format and rules: `.claude/skills/engineering-insights/SKILL.md`.

## What Works

## What Doesn't Work

## Codebase Patterns

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

## Open Questions

- **2026-09-19 · Should skill ids be validated, and `setSkills` made atomic?** — Only the uuid shape is checked; no existence or workspace check, so a skill from another workspace can be linked. `setSkills` deletes all links, then inserts, with no transaction — an unknown id fails the FK AFTER the delete, returning a 500 (echoing the Postgres message) and wiping the agent's existing links. Checked: no test covers the skills routes. Owner: whoever next touches skills.
  Where: `routes.ts:62` (`skill_ids: z.array(z.string().uuid())`), `repository.ts:229` (`setSkills`) → `repository.ts:230` (the unguarded delete)

- **2026-09-19 · `PUT /agents/:id` with an empty body returns 500** — an empty patch reaches `.set({})`, Drizzle throws `No values to set`, surfaced as `internal_error`. Open: reject empty bodies in the zod schema (422) or no-op? Untested.
  Where: `repository.ts:126` (`.set({`)

- **2026-09-19 · Version history has gaps and duplicates** — (1) seeded built-ins bypass the repository, so they have no v1 snapshot (dev DB: General Reviewer versions {2,3,4,5}; Security/Performance none); (2) name/description changes bump the version but aren't in the snapshot, so a rename yields an identical snapshot; (3) linking skills never versions. Open: is `agent_versions` meant to be a full audit trail? If yes, all three need fixing.
  Where: `server/src/db/seed.ts:220` (direct insert), `helpers.ts:76` (bump rule) vs `repository.ts:155` (snapshot content)
