# conventions — extract a repo's house rules, turn the accepted ones into a skill

`POST /repos/:id/conventions/extract` samples the repo, asks one model for candidate
rules, and persists them as `pending`. A human accepts, rejects or edits each one on
the Conventions page; `POST /repos/:id/conventions/skill` writes the accepted set into
a single `repo-conventions` skill and links it to an agent.

## Layers
`routes.ts` → `service.ts` (orchestration only) → `repository.ts` (the `conventions`
table) + `ports.ts` + `helpers.ts`/`prompt.ts`/`constants.ts` (pure). `compose.ts` holds
the three port implementations and is the only file that touches the container.

## Rules you can't infer from the code
- **Sampling is model-free.** `ConventionSampler` picks config files by name plus the
  top-N ranked files from `container.repoIntel.getConventionSamples()`. Never let a
  model choose what to read: two scans of the same commit must show the same evidence,
  or the confidence numbers mean nothing.
- **Every candidate must cite a sampled file.** `groundDrafts` drops anything whose
  `evidence_path` was not in the sample — the model will happily attribute a real rule
  to a path it never saw, and such a card is unreviewable.
- **A rejection is permanent.** `dropKnownRules` filters a re-scan against every rule
  already on record for the repo, whatever its status. Without it, re-scanning
  resurrects everything the user turned down.
- **One skill per repo, upserted by name.** `REPO_CONVENTIONS_SKILL_NAME` is matched
  exactly; a second scan updates that skill (bumping its version through the normal
  skills update path) instead of leaving two rival copies attached to agents.
- **The caller's body wins.** The create-skill modal shows the assembled markdown for
  editing and sends it back. The service does not regenerate it — an editor whose edits
  are discarded at save time is worse than no editor.
- The `skills` table is owned by the skills module: writes go through
  `container.skillsRepo`, links through `container.agentsRepo`. Never import another
  module's folder (`pnpm arch:check` enforces it).

## Docs
`../AGENTS.md` (module rules) · `docs/insights.md` · the `backend-onion-architecture` skill
