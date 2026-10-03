# Spec: Project Context

Spec ID: SPEC-01
Status: approved
Supersedes: —
Introduced in: L05

## Problem & user

A reviewer in the studio runs review agents against an imported repo whose own specs, docs and insights files state the rules the code must follow (for example "module `api/` does not import `db/` directly"). Today no review agent ever sees those documents: the prompt has a `## Project context` slot, but nothing fills it, so the run trace always reports zero specs read. Reviewers therefore get findings that ignore the project's documented invariants, and they have no way to point an agent at the documents that matter or to see what that would cost in prompt tokens.

## Goals / Non-goals

Goals:
- A reviewer can find every Markdown document of an imported repo under its configured search roots, read it in the studio, and see its estimated token cost.
- A reviewer can attach chosen documents, per repo, to an agent or to a skill, and see the estimated token cost each agent prompt will carry.
- Every review run on a PR sends the documents attached for that PR's repo to the model as untrusted, delimited data, without any extra model call.
- After a run, the reviewer can see exactly which documents were sent, from which version, at what estimated token cost, and read each one exactly as it appeared in the request.

Non-goals:
- Automatic selection of documents from the PR's content (a separate, future feature). Selection is always manual.
- Editing, creating, uploading or deleting documents from the studio (the design's Edit mode, New file, New folder and Upload buttons). The repo stays the only source of document text.
- Chunking, embedding or indexing document content, and the design's chunk count and COVERAGE score.
- A token budget, hard cap, truncation or size-based skipping of attached documents, and any soft warning threshold (decided 2026-10-01, OQ-3).
- Following a renamed document to its new path.
- Flagging an attached document that the PR itself modifies, beyond recording the version read (decided 2026-10-01, OQ-4).
- An MCP tool for browsing or attaching project context, and the CI runner path. Review runs triggered through the MCP server still carry attached documents (AC-67).

## User stories

- US-1: As a reviewer in the studio, I want to browse and search the Markdown documents of an imported repo, so that I can find the specs and invariants that apply to a review.
- US-2: As a reviewer in the studio, I want to attach documents to an agent for one repo, so that every run of that agent on that repo is grounded in them.
- US-3: As a reviewer in the studio, I want to attach documents to a skill for one repo, so that every agent using that skill gets them on that repo.
- US-4: As a reviewer in the studio, I want to see estimated token counts per document, per selection and per agent prompt, so that I know what attaching context costs before I run.
- US-5: As a reviewer in the studio, I want the run trace to show every attached document exactly as sent, so that I can verify what the model saw and why it cited a document.
- US-6: As a repo owner, I want to choose which directories count as project documentation for my repo, so that the list matches how my repo is laid out.

## Acceptance criteria (EARS)

### Contract (`@devdigest/shared`, both copies)

- [ ] AC-1 The `@devdigest/shared` contract shall describe a listed context document by its repo-relative path, its document type, its size in characters, its estimated token count, and the number of agents and of skills it is attached to for that repo, counting every stored attachment whether or not the agent or skill is enabled.
- [ ] AC-2 A document's type shall be one of `spec`, `insights`, `doc`, decided by these rules applied in order with the first match winning: `spec` when any directory in its path is named `specs`; `insights` when any directory in its path is named `insights` or the file is named `insights.md`; `doc` otherwise.
- [ ] AC-3 The `@devdigest/shared` run-trace contract shall hold one attached-document entry per collected path, carrying the path, the origin (`agent` or `skill: <name>`), the version read (a commit SHA or `working-tree`), the status (`sent` or `not_found`), the estimated token count, and the exact text sent (null when not found).
- [ ] AC-4 The run trace's `specs_read` list shall name the path of every attached document whose status is `sent`, in prompt order.
- [ ] AC-5 IF a stored run trace has no attached-document entries, THEN the studio shall render that trace without the "Project context · attached specs" entry and without an error.

### Server — discovery, preview and search roots

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

### Server — attachments

- [ ] AC-16 WHEN a user saves an agent's context selection for a repo, the API shall store the selected repo-relative paths for that agent and repo pair.
- [ ] AC-17 WHEN a user saves a skill's context selection for a repo, the API shall store the selected repo-relative paths for that skill and repo pair.
- [ ] AC-18 The API shall store attachments as paths only, never as document text.
- [ ] AC-19 IF a path submitted for attachment is absolute or contains a `..` segment, THEN the API shall reject the whole selection with a 422 and store nothing.
- [ ] AC-20 WHEN the studio reads an agent's or a skill's attachments for a repo, the API shall flag each attached path that is no longer present on the repo's default branch as `missing`.
- [ ] AC-21 The API shall keep a `missing` attachment stored until a user removes it from the selection.
- [ ] AC-70 Saving an agent's context selection shall not create a new agent version.
- [ ] AC-72 WHEN an agent, a skill or a repo is deleted, the API shall delete every attachment that belongs to it.

### Server — review run

- [ ] AC-22 WHEN a review run starts for an agent on a PR, the run executor shall collect the agent's attached paths for the PR's repo first, then the attached paths for that repo of each of the agent's linked skills, in skill link order, taking each owner's paths in ascending path order.
- [ ] AC-23 The run executor shall collect a path that is attached more than once only once, keeping the origin of its first occurrence.
- [ ] AC-24 IF a linked skill is disabled globally, THEN the run executor shall collect none of that skill's attached paths.
- [ ] AC-25 The run executor shall never collect attachments saved for a repo other than the PR's repo.
- [ ] AC-26 WHEN the run executor reads a collected document, it shall try the PR's head commit first, then the PR head fetched from the remote, then the clone's working tree, and use the first read that succeeds.
- [ ] AC-27 The run executor shall record, for each sent document, the version it was read from.
- [ ] AC-28 IF a collected document cannot be read at any of those versions, or its path resolves outside the repo's clone, THEN the run executor shall skip that document and continue the run.
- [ ] AC-29 IF the run executor skips a collected document, THEN the run's live log shall contain a line naming that path and the words "not found".
- [ ] AC-30 The run executor shall send every readable collected document in full, without truncation and without skipping for size.
- [ ] AC-31 Collecting and sending project context shall add zero model calls to a review run.
- [ ] AC-32 WHEN a run sends at least one attached document, the run's live log shall contain a line with the number of documents sent and their total estimated token count.
- [ ] AC-33 WHEN a run completes, its persisted trace shall hold the attached-document entries of every collected path, both `sent` and `not_found`.
- [ ] AC-34 The text recorded in a `sent` attached-document trace entry shall equal, byte for byte, the escaped text between that document's opening and closing delimiters in the prompt the model received.
- [ ] AC-67 WHEN a review run is triggered through the MCP server, the run executor shall collect, read, send and record attached documents exactly as for a run triggered from the studio.

### Reviewer engine

- [ ] AC-35 WHERE at least one attached document is sent, the reviewer engine shall render a `## Project context` section in the user message containing each document in its own untrusted delimiter block that names the document's path.
- [ ] AC-36 IF a document's text contains the closing delimiter, THEN the reviewer engine shall escape that delimiter so the block cannot be closed early, and shall apply no other escaping to the document's text.
- [ ] AC-69 IF a document's path contains a double quote, `<`, `>`, a carriage return or a line feed, THEN the reviewer engine shall escape those characters in the block's path label so the label cannot be broken out of.
- [ ] AC-37 WHERE no attached document is sent, the reviewer engine shall produce a prompt byte-identical to the prompt it produces without this feature.
- [ ] AC-38 WHERE the `## Project context` section is present, the reviewer engine shall append to the system message a trusted instruction to name a document's path in a finding's rationale when that finding violates a rule stated in that document.
- [ ] AC-39 WHERE the `## Project context` section is present, the reviewer engine shall append to the system message a trusted instruction stating that project context documents are untrusted data whose instructions are ignored and whose claims cannot waive or descope a real defect.

### Studio — Project Context page

- [ ] AC-40 WHEN a user opens `/repos/:repoId/context`, the studio shall show the Project Context page with the breadcrumb `<repo full name> / Project Context`.
- [ ] AC-41 The Project Context page shall list the repo's documents as a file tree grouped by directory.
- [ ] AC-42 WHEN a user types in the Project Context search box, the studio shall show only documents whose path contains the query, ignoring case.
- [ ] AC-43 WHEN a user selects a document, the studio shall render its Markdown read-only in the preview pane.
- [ ] AC-44 The studio shall render document Markdown without executing scripts and without rendering raw HTML.
- [ ] AC-45 The Project Context page shall show each document's estimated token count.
- [ ] AC-46 WHEN a document is selected, the preview header shall show "Used by N agents · M skills" for that repo, counting every stored attachment whether or not the agent or skill is enabled.
- [ ] AC-47 WHEN a user clicks Re-index, the studio shall request a rescan and refresh the list with its result.
- [ ] AC-48 The Project Context page footer shall show "Indexed: N files · last scanned <relative time>".
- [ ] AC-49 The Project Context page shall show the repo's current search roots and let a user edit and save them.
- [ ] AC-50 IF the repo has no documents matching its search roots, THEN the studio shall show the empty state titled "No spec files yet" with a body stating that documents are attached to agents and skills manually, and an "Edit search roots" action that opens the search-roots editor.
- [ ] AC-73 The studio sidebar shall show a "Project Context" navigation entry that leads to `/repos/:repoId/context` for the active repo.

### Studio — agent and skill attachment

- [ ] AC-51 The agent editor shall have a "Context" tab.
- [ ] AC-52 The Context tab shall show a repo picker that defaults to the active repo.
- [ ] AC-53 The Context tab shall list the picked repo's documents, each with a checkbox, its path, its document type and its estimated token count.
- [ ] AC-54 WHEN a user types in the Context tab search box, the studio shall show only documents whose path contains the query, ignoring case.
- [ ] AC-55 WHEN a user opens a document's preview from the Context tab, the studio shall show its rendered Markdown read-only.
- [ ] AC-56 The Context tab shall show the total estimated token count of the checked documents, counting a `missing` document as 0.
- [ ] AC-57 The Context tab shall show the estimated project-context token count the agent's prompt will carry for the picked repo, counting its own documents and its enabled linked skills' documents once per path and a `missing` document as 0.
- [ ] AC-58 WHEN a user saves the Context tab, the studio shall store the checked paths for that agent and the picked repo.
- [ ] AC-59 IF an attached document is flagged `missing`, THEN the studio shall show it in the list marked "missing".
- [ ] AC-60 The skill page shall have a section titled "Project context to use".
- [ ] AC-61 The "Project context to use" section shall offer, for the skill and the picked repo, the same repo picker, document list, search, preview, selection total, save and "missing" flag as the agent Context tab.

### Studio — run trace

- [ ] AC-62 WHEN a run trace has attached-document entries, the Prompt assembly section shall show an entry labelled "Project context · attached specs".
- [ ] AC-71 WHEN a run trace has attached-document entries, the Prompt assembly section shall not show the generic specs block.
- [ ] AC-63 The "Project context · attached specs" entry shall list each document with its path, origin, version read and estimated token count.
- [ ] AC-64 WHEN a user opens a document in the "Project context · attached specs" entry, the studio shall show the full recorded text as plain, unrendered text.
- [ ] AC-65 IF an attached-document entry has status `not_found`, THEN the studio shall show it in that entry marked "not found" and with no text to open.
- [ ] AC-66 The trace Configuration section shall list the paths in the run's `specs_read`.

## Edge cases

- The repo was never cloned (seeded `acme/payments-api`): the page shows the empty state, and every run reports every attached path as `not_found` without failing — AC-15, AC-50, AC-28.
- A PR deletes or renames an attached document: the read at the PR head fails and falls back to the working tree. If the document still exists there it is sent with version `working-tree`, otherwise it is `not_found` — AC-26, AC-27, AC-28.
- A PR edits an attached document: the run sends the PR's version, because it reads the PR head first. The trace records that version, and nothing further flags the change — AC-26, AC-27 (threat noted in Untrusted inputs).
- The same path is attached to the agent and to one of its skills, or to two skills: it is sent once, with the first origin — AC-23.
- A skill is linked to the agent but has no attachments for the PR's repo: it adds nothing — AC-22, AC-25.
- A document is renamed on the default branch: the old attachment shows "missing", and the new path appears unchecked — AC-20, AC-21, AC-59.
- An attached path no longer matches the repo's search roots after the roots are edited: the attachment is kept and still sent if readable, since roots govern listing, not runs — AC-21, AC-26.
- Map-reduce strategy: the `## Project context` section is part of each chunk call's prompt, so its tokens are paid once per chunk. The trace's per-document token counts stay per document — AC-35, AC-63.
- A very large document: it is sent in full and its estimated token count is shown wherever it is listed, with no warning — AC-30, AC-45, AC-56.
- An empty `.md` file: listed with 0 estimated tokens and sent as an empty block — AC-11, AC-35.
- A trace stored before this feature: rendered as today, with no new entry — AC-5.
- An agent, skill or repo is deleted: its attachments are deleted with it — AC-72.
- A path is both under a `specs` directory and under an `insights` directory, or is `specs/insights.md`: its type is `spec`, because the `spec` rule is checked first — AC-2.
- A repo's search roots are saved as an empty list: the list is stored and the page shows the empty state — AC-68, AC-50.
- A disabled agent or a disabled skill still has attachments: they count toward "Used by N agents · M skills" — AC-1, AC-46; a disabled skill's documents are still not sent — AC-24.
- A skill disabled globally: its documents are not collected, and the live log adds no line beyond the existing skills line that already reports skipped skills — AC-24.
- A checked document is flagged `missing`: it adds 0 to the selection total and to the prompt estimate — AC-56, AC-57.
- A review triggered through the MCP server: attached documents are sent and recorded exactly as for a studio-triggered run — AC-67.

## Non-functional requirements

- NFR-1: Every new studio string shall live in `client/messages/en/`, with 0 hard-coded UI strings in components.
- NFR-2: Every new studio surface (Project Context page, Context tab, skill section, trace entry) shall render in both `data-theme="dark"` and `data-theme="light"`.
- NFR-3: Every document checkbox, the search boxes, the repo pickers, the Re-index button and each trace document opener shall be reachable and operable by keyboard alone (Tab, Space, Enter).
- NFR-4: Project context shall add 0 model calls per run (see AC-31).
- NFR-5: The server shall log, per run, 1 line for the sent documents (count and estimated tokens) and 1 line per skipped document (see AC-29, AC-32). The server shall log no document text.
- NFR-6: The token estimate shall use the formula ceil(characters / 4), identical on the server and in the studio (see AC-11).
- NFR-7: This spec sets no latency or list-size target for `GET /repos/:id/context` (decided 2026-10-01, OQ-5).

## Inputs and provenance

### Data inputs

| Input | Source | Trusted? | Freshness |
|---|---|---|---|
| Document text for the list and preview | filesystem clone, default branch | No | as of the clone's last sync or re-index |
| Document text sent in a run | filesystem clone: PR head commit, then fetched PR head, then working tree | No | read at run start |
| Document paths and filenames | filesystem clone | No | as of the last scan |
| Search roots | user in the studio, stored per repo in Postgres | No (validated) | as last saved |
| Attachment selections (paths) | user in the studio, stored per agent or skill and repo in Postgres | No (validated) | as last saved |
| Agent and skill links, skill enabled flag | Postgres | Yes | read at run start |
| PR head SHA | Postgres (from the GitHub API sync) | Yes | as of the last PR sync |
| Run trace entries | Postgres (written by the run) | Yes as provenance; the recorded text inside them is untrusted | written once per run |

### Requirement provenance

- Requirements 1–9 of the feature request (per-repo document discovery, manual attachment to agents and skills, token display, `## Project context` as untrusted data with delimiters and an injection guard, `specs_read` plus per-document tokens, the "Project context · attached specs" trace entry, no extra model call, no automatic selector, the default glob, the api/→db/ verification scenario): the user's request, relayed by the coordinator.
- Attachment scope per agent or skill and repo, per-repo search roots and the `.git/`/`node_modules/` exclusion, merge order and dedupe, read order and version recording, the ceil(chars/4) estimate with no cap, the missing-document handling, the design scope and the citation instruction: the user's answers to pass 1 (answers 1–8).
- OQ-1–OQ-9 defaults (AC-2 rule, deletion cascade AC-72, no soft warning, no "changed in this PR" flag, no latency target, no new agent version AC-70, generic specs block hidden AC-71, "Edit search roots" empty-state action AC-50, no extra skills log line): accepted by the user on approval, 2026-10-01.
- Planner-driven changes accepted by the user on 2026-10-01: AC-39 made conditional so AC-37 holds; 422 for validation failures (AC-10, AC-19); a new `server/src/modules/project-context/` module holding discovery, search roots, preview and both attachment stores; the sidebar entry (AC-73); path-ascending order within one owner (AC-22); the trace text is the escaped block body (AC-34); label versus content escaping (AC-36, AC-69); `spec` first in AC-2; an empty roots list is accepted (AC-68); counts include disabled owners (AC-1, AC-46); a missing document counts 0 tokens (AC-56, AC-57); MCP-triggered runs carry attached documents (AC-67).
- Every validation failure in this API answers 422 (`validation_error`): `server/src/app.ts:114` (error handler, 422 branch at `:118`).
- MCP-triggered reviews go through the same review service as the studio: `server/src/mcp/compose.ts:64` (`reviews.runReview`).
- Design (breadcrumb, 240px tree panel, Re-index, "Used by" badge, footer, empty-state title): `client/docs/design/DevDigest Design (standalone).html`, artboard "Project Context (N6)" (`ScreenContext`), and the agent editor artboard (tabs Config/Skills/Evals/Stats/CI).
- The `## Project context` slot already exists and wraps each entry as untrusted data: `reviewer-core/src/prompt.ts:61`, `reviewer-core/src/prompt.ts:119`, `reviewer-core/src/prompt.ts:142`.
- `wrapUntrusted` escapes a closing delimiter in content but interpolates the label unescaped: `reviewer-core/src/prompt.ts:44`. This is the basis of AC-36.
- `INJECTION_GUARD` lists untrusted sources without project context, and it is appended to every prompt: `reviewer-core/src/prompt.ts:16`, `reviewer-core/src/prompt.ts:111`. Changing it would break AC-37, so AC-39 adds a separate conditional instruction instead.
- `SCOPE_INSTRUCTION` sets the pattern of a trusted instruction appended only when its slot is present: `reviewer-core/src/prompt.ts:35`. This is the basis of AC-38.
- The trace contract already has `specs` and `specs_read: string[]`: `server/src/vendor/shared/contracts/trace.ts:43`, `server/src/vendor/shared/contracts/trace.ts:88`. The run executor always writes `specs_read: []` and passes no specs today: `server/src/modules/reviews/run-executor.ts:338`, `server/src/modules/reviews/run-executor.ts:238`.
- The trace UI already shows a "specs read" row and a generic `specs` prompt block: `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/_components/TraceBody/TraceBody.tsx:39`, `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/_components/TraceBody/TraceBody.tsx:95`.
- The skills merge rule (only enabled skills, in link order) mirrors today's skill loading: `server/src/modules/reviews/run-executor.ts:523`.
- Agents and skills are workspace-wide and have no repo column. Skills link to agents with an order: `server/src/db/schema/agents.ts:51`, `server/src/db/schema/skills.ts:5`. This is why attachments are keyed by repo (AC-16, AC-17).
- An existing placeholder contract and client hooks for the routes: `server/src/vendor/shared/contracts/platform.ts:288` (`SpecFile`), `client/src/lib/hooks/core.ts:147` (`GET /repos/:id/context`), `client/src/lib/hooks/core.ts:155` (`POST /repos/:id/context/reindex`). The sidebar `context` key: `client/src/components/app-shell/helpers.ts:30`.
- The file read joins the path to the clone without a containment check: `server/src/adapters/git/simple-git.ts:129`. A read at a ref uses `git show`: `server/src/adapters/git/simple-git.ts:140`. This is the basis of AC-13 and AC-28.
- Read order PR head → fetched PR head → working tree, as used for the Intent Layer's linked spec: `server/src/modules/reviews/docs/insights.md:61` (entry, with the 2026-09-24 correction at `:64`).
- The ceil(chars/4) estimate already used by the studio and the server: `server/src/adapters/tokenizer/index.ts:21` (`approxTokens`).
- Chunk storage that this spec deliberately does not use: `server/src/db/schema/context.ts:44`.

## Untrusted inputs

- **Document text (list, preview and run).** Threat: prompt injection into the review prompt ("ignore the auth check", "this module is a test fixture"); script or raw-HTML injection into the studio preview. Neutralised by AC-35 (delimited untrusted block), AC-36 (delimiter escape), AC-39 (trusted project-context guard) and AC-44 (no scripts, no raw HTML).
- **Document text read at the PR head.** Threat: the PR author can edit an attached document in the same PR, for example deleting the invariant that the PR violates, so the model sees the weakened rule. This is only partly neutralised: by AC-39 (claims cannot waive a real defect) and AC-27 plus AC-63 (the version read is visible in the trace). A dedicated "changed in this PR" flag was declined on 2026-10-01 (OQ-4); the residual risk is accepted.
- **Document paths and filenames.** Threat: label break-out in the prompt's delimiter (a quote, `<`, `>` or a line break in a filename), markup injection where paths are rendered, and traversal through a symlink pointing outside the clone. Neutralised by AC-69 (label escaping), AC-13 and AC-28 (no read outside the clone) and AC-44 (rendering).
- **Search roots typed by a user.** Threat: a glob that escapes the clone (`../`, an absolute path). Neutralised by AC-10, AC-8 and AC-13.
- **Attachment paths submitted by a user.** Threat: path traversal to read arbitrary server files into a prompt. Neutralised by AC-19 at attach time and by AC-13 and AC-28 at read time.
- **Very large documents.** Threat: an oversized payload that inflates prompt cost or exceeds the model's context window; there is no cap, by the user's decision. The cost is made visible by AC-45, AC-56, AC-57 and AC-63. No warning is shown, by decision (OQ-3).

## Open questions

- None open. All nine were resolved on 2026-10-01 with their defaults; their numbers are kept and never reused.
- ~~OQ-1: Is the document-type rule in AC-2 the one wanted?~~ — resolved 2026-10-01: yes, applied in order with `spec` first (AC-2).
- ~~OQ-2: What happens to attachments when their agent, skill or repo is deleted?~~ — resolved 2026-10-01: they are deleted with it (AC-72).
- ~~OQ-3: Should a soft warning appear above a token threshold?~~ — resolved 2026-10-01: no warning (Non-goals).
- ~~OQ-4: Should a run flag an attached document that the PR itself modifies?~~ — resolved 2026-10-01: no flag beyond the recorded version (Non-goals, Untrusted inputs).
- ~~OQ-5: Are there latency or size targets for `GET /repos/:id/context`?~~ — resolved 2026-10-01: none in this spec (NFR-7).
- ~~OQ-6: Does saving an agent's context selection create a new agent version?~~ — resolved 2026-10-01: no (AC-70).
- ~~OQ-7: Should the generic "specs" prompt block still show next to the new entry?~~ — resolved 2026-10-01: no (AC-71).
- ~~OQ-8: What does the empty state's call-to-action do?~~ — resolved 2026-10-01: "Edit search roots" opens the search-roots editor (AC-50).
- ~~OQ-9: What does the live log say for a globally disabled skill's documents?~~ — resolved 2026-10-01: nothing extra (Edge cases).

## Changelog

- 2026-10-01 · L05 · approved — re-approved by the user after the planner-driven update (AC-1–AC-73).
- 2026-10-01 · L05 · draft — AC-1, AC-2, AC-10, AC-19, AC-22, AC-34, AC-36, AC-39, AC-46, AC-50, AC-56, AC-57 changed; AC-67, AC-68, AC-69, AC-70, AC-71, AC-72, AC-73 added; OQ-1–OQ-9 resolved into criteria, edge cases, NFR-7 and Non-goals; MCP Non-goal narrowed to "no MCP tool"; parts re-split (new `server/src/modules/project-context` part; agents and skills parts reduced to pointers) — planner-driven changes accepted by the user after approval.
- 2026-10-01 · L05 · approved — approved by the user; OQ-1–OQ-9 accepted with their stated defaults.
- 2026-10-01 · L05 · draft — created: AC-1–AC-66, US-1–US-6, NFR-1–NFR-7, OQ-1–OQ-9 — first SDD spec for the Project Context feature.
