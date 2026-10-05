# Spec: Onboarding Tour — client

Spec ID: SPEC-02
Status: approved
Overview: [../../../docs/specs/onboarding-tour.md](../../../docs/specs/onboarding-tour.md)

## Scope in this module

The studio adds the "Onboarding Tour" sidebar entry and the page at `/repos/:repoId/onboarding`. That covers the header, the "On this page" list, Regenerate, Share link, the empty state, the status and staleness banners, and the five rendered sections. It also carries the client copy of the `@devdigest/shared` tour contract. Everything it shows comes from `GET /repos/:id/onboarding`, and it only ever requests a generation through `POST /repos/:id/onboarding/generate` on a user's click.

## Acceptance criteria (EARS)

### Contract (`@devdigest/shared`, client copy)

- [ ] AC-1 The `@devdigest/shared` onboarding-tour contract shall describe a stored tour by its repo full name, the indexed commit SHA it was built from, its generation time, its status, its indexed source-file count, its candidate source-file count, the number of file facts dropped for budget, the provider and model used, its input and output token counts, and its estimated cost in USD, which is null when unknown.
- [ ] AC-2 A tour shall hold exactly five sections, in this order and with these anchors: `architecture`, `critical-paths`, `run-locally`, `reading-path`, `first-tasks`.
- [ ] AC-3 The contract shall shape the sections as follows: `architecture` holds Markdown prose, `directories` (the top-level directories holding indexed files, each as a path and its indexed file count, filled from the index whatever the section's origin) and a diagram of at most 12 nodes (id, label) and at most 20 directed edges (from, to, weight); `critical-paths` and `reading-path` hold ordered entries of a repo-relative path and a one-line reason that may be empty; `run-locally` holds ordered steps of command text, the repo-relative path of the source file, and a `risky` flag; `first-tasks` holds entries of a title, a description and one or more cited repo-relative paths.
- [ ] AC-4 Every section shall carry an origin of `model` or `skeleton`.
- [ ] AC-5 A tour's status shall be one of `ready`, `index_partial`, `unsupported_language`, `no_data`, `index_failed`, `llm_not_configured`, `llm_failed`, `timed_out`.
- [ ] AC-6 The response of `GET /repos/:id/onboarding` shall carry the stored tour or null, a `stale` flag, a `generating` flag, and the last failed attempt (its status and time) or null.

### Studio

- [ ] AC-69 The studio sidebar shall show an "Onboarding Tour" entry in the WORKSPACE group, after Project Context, that leads to `/repos/:repoId/onboarding` for the active repo.
- [ ] AC-70 WHILE `/repos/:repoId/onboarding` is open, the studio shall highlight the "Onboarding Tour" sidebar entry.
- [ ] AC-71 WHILE the add-repository screen `/onboarding` is open, the studio shall not highlight the "Onboarding Tour" sidebar entry.
- [ ] AC-72 The Onboarding Tour page shall show the title "Onboarding for <repo full name>".
- [ ] AC-73 The Onboarding Tour page shall show under the title "Generated from index of N files · last refreshed <relative time>", where N is the tour's indexed source-file count and the time is measured from the tour's generation.
- [ ] AC-74 WHERE the tour's indexed source-file count is below its candidate source-file count, the studio shall show "Indexed X of Y source files" in place of "Generated from index of N files".
- [ ] AC-75 The Onboarding Tour page shall show an "On this page" list naming the five sections in tour order.
- [ ] AC-76 WHEN a user selects an "On this page" entry, the studio shall scroll to that section and set the URL fragment to the section's anchor.
- [ ] AC-77 WHEN the page opens with a URL fragment that names a section anchor, the studio shall scroll to that section.
- [ ] AC-78 WHEN a user clicks "Share link", the studio shall copy the page's absolute URL, including the anchor of the current section when one is set, to the clipboard.
- [ ] AC-79 WHEN the studio has copied a share link, it shall show the confirmation "Link copied".
- [ ] AC-80 IF the repo has no stored tour and no generation in flight, THEN the studio shall show the empty state titled "Generate onboarding tour" with a "Generate onboarding tour" button.
- [ ] AC-81 The studio shall request a generation only when a user clicks "Generate onboarding tour" or "Regenerate".
- [ ] AC-82 WHEN a user clicks "Regenerate", the studio shall request a generation for the repo.
- [ ] AC-83 WHILE a generation is in flight, the studio shall show the generate or regenerate button labelled "Generating…" and disabled.
- [ ] AC-84 WHILE a generation is in flight, the studio shall refetch the tour every 3 seconds.
- [ ] AC-85 IF a generation is still in flight 120 seconds after the studio requested it, THEN the studio shall stop refetching and show "Generation is taking longer than expected. Reload to check again."
- [ ] AC-86 WHERE the tour is stale, the studio shall show "Out of date — the index has moved past the commit this tour was built from."
- [ ] AC-87 IF the tour's status is not `ready`, THEN the studio shall show a status banner with exactly this sentence for its status: `index_partial` "Partial index: some source files were left out, so rankings may miss parts of the repository."; `unsupported_language` "This repository's language isn't indexed, so critical paths and the reading path are unavailable."; `no_data` "No index for this repository yet — showing an outline built without AI."; `index_failed` "The repository index failed — showing an outline built without AI."; `llm_not_configured` "No API key is configured for the Onboarding Tour model — showing an outline built without AI."; `llm_failed` "The AI write-up failed — showing an outline built without AI."; `timed_out` "Generation timed out — showing an outline built without AI."
- [ ] AC-88 WHERE the tour's status is `llm_not_configured`, the status banner shall link to `/settings/models`.
- [ ] AC-89 WHERE a last failed attempt is recorded, the studio shall show "The last regeneration failed <relative time> — showing the previous tour." followed by that attempt's status sentence from AC-87.
- [ ] AC-90 WHERE a section's origin is `skeleton`, the studio shall show the label "Outline · no AI" on that section's heading.
- [ ] AC-91 The architecture section shall show its prose and render its diagram as labelled nodes joined by directed edges.
- [ ] AC-107 The architecture section shall show, below its diagram, the `directories` of AC-3 as a list of each directory path with its indexed file count, whatever the section's origin.
- [ ] AC-92 The studio shall show each critical-paths entry as its path in monospace, its reason, and an "Open" link.
- [ ] AC-93 Every "Open" link and every cited-path link shall point to `https://github.com/<owner>/<repo>/blob/<tour commit SHA>/<path>` and open in a new tab.
- [ ] AC-94 The studio shall show the run-locally section as a numbered list of steps, each with its command as plain text and its source file path.
- [ ] AC-95 WHEN a user clicks a step's "Copy" button, the studio shall copy that step's exact command text to the clipboard.
- [ ] AC-96 WHERE a run step is marked `risky`, the studio shall show the marker "Review before running" next to it.
- [ ] AC-97 The studio shall show the reading path as a numbered list in stored order, each entry with its path, its reason and an "Open" link.
- [ ] AC-98 The studio shall show each first task with its title, its description and each cited path as a link.
- [ ] AC-99 The studio shall render model-written text as Markdown without executing scripts and without rendering raw HTML.
- [ ] AC-100 IF a link in model-written text points anywhere other than `https://github.com/<owner>/<repo>/` of this repo, THEN the studio shall render the link's text as plain text without a link.
- [ ] AC-101 The Onboarding Tour page header shall show the model and the estimated cost of the stored tour, "cost unknown" when the cost is null, and "no model call" when no model call was made.
- [ ] AC-102 WHERE the tour's status is `unsupported_language`, the critical-paths and reading-path sections shall show "Not available for this repository's language."
- [ ] AC-103 WHERE the first-tasks section holds no entries, the studio shall show "First tasks need the AI write-up — regenerate once it is available."

## Module notes

- `/onboarding` is already the add-repository screen, and the active-key helper maps any path containing `/onboarding` to `onboarding-tour`, so AC-71 needs the add-repo screen excluded explicitly: `client/src/app/onboarding/page.tsx:1`, `client/src/components/app-shell/helpers.ts:29`.
- WORKSPACE holds Pull Requests and Project Context today; the new entry goes after Project Context: `client/src/vendor/ui/nav.ts:25-31`.
- An `onboarding` message namespace already exists, but its copy describes a different set of five sections and must be brought in line with this spec: `client/messages/en/onboarding.json:10`.
- All copy goes through `messages/en/<namespace>.json`; components never call `fetch`, only hooks; every component renders in both themes: `client/AGENTS.md:20`, `client/AGENTS.md:25-26`, `client/AGENTS.md:29`.
- The shared Markdown primitive renders without raw HTML (`client/src/components/context-selection/ContextDocPreview.tsx:2`). The architecture diagram is a native node/edge component built from the stored nodes and edges; Mermaid is not used (2026-10-03 plan review).
- `@devdigest/shared` exists in two copies; AC-1 to AC-6 must hold identically here and in the server copy (root `AGENTS.md:27`).
