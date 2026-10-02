# Spec: Project Context — client

Spec ID: SPEC-01
Status: approved
Overview: [../../../docs/specs/project-context.md](../../../docs/specs/project-context.md)

## Scope in this module

The studio provides three surfaces. The Project Context page lets a user browse, search and preview a repo's documents and edit its search roots. The agent editor's "Context" tab and the skill page's "Project context to use" section let a user attach documents per repo. The run trace's "Project context · attached specs" entry shows exactly what each run sent. The studio relies on the server for listing, previews, attachments and trace data, and holds the client copy of the `@devdigest/shared` contract.

## Acceptance criteria (EARS)

- [ ] AC-1 The `@devdigest/shared` contract shall describe a listed context document by its repo-relative path, its document type, its size in characters, its estimated token count, and the number of agents and of skills it is attached to for that repo, counting every stored attachment whether or not the agent or skill is enabled.
- [ ] AC-2 A document's type shall be one of `spec`, `insights`, `doc`, decided by these rules applied in order with the first match winning: `spec` when any directory in its path is named `specs`; `insights` when any directory in its path is named `insights` or the file is named `insights.md`; `doc` otherwise.
- [ ] AC-3 The `@devdigest/shared` run-trace contract shall hold one attached-document entry per collected path, carrying the path, the origin (`agent` or `skill: <name>`), the version read (a commit SHA or `working-tree`), the status (`sent` or `not_found`), the estimated token count, and the exact text sent (null when not found).
- [ ] AC-4 The run trace's `specs_read` list shall name the path of every attached document whose status is `sent`, in prompt order.
- [ ] AC-5 IF a stored run trace has no attached-document entries, THEN the studio shall render that trace without the "Project context · attached specs" entry and without an error.

### Project Context page

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

### Agent and skill attachment

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

### Run trace

- [ ] AC-62 WHEN a run trace has attached-document entries, the Prompt assembly section shall show an entry labelled "Project context · attached specs".
- [ ] AC-71 WHEN a run trace has attached-document entries, the Prompt assembly section shall not show the generic specs block.
- [ ] AC-63 The "Project context · attached specs" entry shall list each document with its path, origin, version read and estimated token count.
- [ ] AC-64 WHEN a user opens a document in the "Project context · attached specs" entry, the studio shall show the full recorded text as plain, unrendered text.
- [ ] AC-65 IF an attached-document entry has status `not_found`, THEN the studio shall show it in that entry marked "not found" and with no text to open.
- [ ] AC-66 The trace Configuration section shall list the paths in the run's `specs_read`.

## Module notes

- `@devdigest/shared` exists in two copies; a contract change here must be mirrored in `server/src/vendor/shared` — `client/AGENTS.md` (Gotchas).
- All copy goes through `useTranslations`; a new feature gets a new `messages/en/<feature>.json` — `client/AGENTS.md` (Conventions).
- Components never call `fetch` directly, only hooks from `src/lib/hooks`. Placeholder hooks for the list and re-index routes already exist — `client/src/lib/hooks/core.ts:147`, `client/src/lib/hooks/core.ts:155`.
- The sidebar already maps paths containing `/context` to the `context` nav key, which is the active-state half of AC-73 — `client/src/components/app-shell/helpers.ts:30`.
- The trace already renders a "specs read" row and a generic `specs` prompt block; AC-71 hides the generic block when the new entry is shown — `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/_components/TraceBody/TraceBody.tsx:39`, `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/_components/TraceBody/TraceBody.tsx:95`.
- The studio's existing token estimate is ceil(chars / 4), the formula AC-11 fixes for the server too — `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/helpers.ts:32`.
- Components must render in both themes — `client/AGENTS.md` (Conventions).
