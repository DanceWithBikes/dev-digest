# Spec: Project Context — server/modules/project-context

Spec ID: SPEC-01
Status: approved
Overview: [../../../../../../docs/specs/project-context.md](../../../../../../docs/specs/project-context.md)

## Scope in this module

This new module owns the server side of Project Context outside the review run. It finds a repo's Markdown documents in its default-branch clone against the repo's own search roots, and serves the list, previews and re-index. It stores both attachment stores: an agent's and a skill's selection of paths per repo. It flags missing attachments and counts how many agents and skills use each document. The reviews module reads these attachments when a run starts. The studio is the only caller of these routes; the server copy of the `@devdigest/shared` contract carries AC-1 and AC-2.

## Acceptance criteria (EARS)

- [ ] AC-1 The `@devdigest/shared` contract shall describe a listed context document by its repo-relative path, its document type, its size in characters, its estimated token count, and the number of agents and of skills it is attached to for that repo, counting every stored attachment whether or not the agent or skill is enabled.
- [ ] AC-2 A document's type shall be one of `spec`, `insights`, `doc`, decided by these rules applied in order with the first match winning: `spec` when any directory in its path is named `specs`; `insights` when any directory in its path is named `insights` or the file is named `insights.md`; `doc` otherwise.

### Discovery, preview and search roots

- [ ] AC-6 WHEN a user requests the Project Context list for a repo (`GET /repos/:id/context`), the API shall return every `.md` file in the repo's default-branch clone that matches that repo's search roots.
- [ ] AC-7 The search roots of a repo that has never saved its own shall be the single glob `**/{specs,docs,insights}/**/*.md`.
- [ ] AC-8 The API shall leave out of every Project Context list any file under a `.git/` or `node_modules/` directory, whatever the repo's search roots.
- [ ] AC-9 WHEN a user saves search roots for a repo, the API shall store them for that repo only.
- [ ] AC-10 IF a submitted search root is an empty string, absolute, or contains a `..` segment, THEN the API shall reject the request with a 422 and keep the previous roots.
- [ ] AC-11 The API shall compute every estimated token count of this feature as ceil(characters / 4) of the text it measures.
- [ ] AC-12 WHEN a user requests the preview of one listed document, the API shall return its full text as stored on the repo's default branch.
- [ ] AC-13 IF a requested preview path is absolute, contains a `..` segment, resolves outside the repo's clone, or matches none of the repo's search roots, THEN the API shall respond with a 4xx error without reading any file.
- [ ] AC-14 WHEN a user triggers a re-index (`POST /repos/:id/context/reindex`), the API shall rescan the clone against the repo's search roots and return the number of documents found and the scan time.
- [ ] AC-15 IF the repo has no clone on disk, THEN the API shall return an empty Project Context list with a 200, not an error.
- [ ] AC-68 WHEN a user saves an empty list of search roots for a repo, the API shall store it and return an empty Project Context list for that repo.

### Attachments

- [ ] AC-16 WHEN a user saves an agent's context selection for a repo, the API shall store the selected repo-relative paths for that agent and repo pair.
- [ ] AC-17 WHEN a user saves a skill's context selection for a repo, the API shall store the selected repo-relative paths for that skill and repo pair.
- [ ] AC-18 The API shall store attachments as paths only, never as document text.
- [ ] AC-19 IF a path submitted for attachment is absolute or contains a `..` segment, THEN the API shall reject the whole selection with a 422 and store nothing.
- [ ] AC-20 WHEN the studio reads an agent's or a skill's attachments for a repo, the API shall flag each attached path that is no longer present on the repo's default branch as `missing`.
- [ ] AC-21 The API shall keep a `missing` attachment stored until a user removes it from the selection.
- [ ] AC-70 Saving an agent's context selection shall not create a new agent version.
- [ ] AC-72 WHEN an agent, a skill or a repo is deleted, the API shall delete every attachment that belongs to it.

## Module notes

- A new module is a Fastify plugin registered statically in `modules/index.ts`. It adds only its own tables through a migration and never edits shared schema tables — `server/src/modules/AGENTS.md` (Adding a module).
- Another module's data (agents, skills, repos) is read with a query in this module's own repository; another module's behaviour goes through a `container` port; never import another module's folder — `server/src/modules/AGENTS.md` (Rules), `server/src/modules/reviews/docs/insights.md:69`.
- Validation failures answer 422 through the shared error handler; business failures throw a class from `platform/errors.ts` — `server/src/app.ts:114`, `server/src/modules/AGENTS.md` (Rules).
- The git adapter's working-tree read joins the path to the clone without a containment check, so AC-13 must not rely on the adapter for path safety — `server/src/adapters/git/simple-git.ts:129`.
- Agents and skills are workspace-wide (no repo column), which is why attachments are keyed by owner and repo — `server/src/db/schema/agents.ts:8`, `server/src/db/schema/skills.ts:5`.
- This module has no `AGENTS.md` or `docs/insights.md` yet; creating them is part of the new-module checklist (`doc-writer`).
