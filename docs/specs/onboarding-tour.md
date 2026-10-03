# Spec: Onboarding Tour

Spec ID: SPEC-02
Status: approved
Supersedes: —
Introduced in: L05

## Problem & user

A developer who joins an unfamiliar repository that is already imported into the studio has no guided way in today. They read the README, guess which files matter, and work out how to run the project by trial and error, which costs hours before their first useful change. The studio already holds a ranked import-graph index of the repo, but nothing turns it into a reading order or an overview. The sidebar has no tour page; the add-repository screen is the only thing named "onboarding".

## Goals / Non-goals

Goals:
- A developer new to a repo can open one page in the studio and get a five-section tour: Architecture overview, Critical paths, How to run locally, Guided reading path, First tasks.
- Every fact in the tour is collected deterministically from the repo's index and clone, and the reading path is computed from the import graph, ranked by PageRank × (1 + hotness).
- A tour costs exactly one structured model call, which only writes prose and one-line reasons around the precomputed facts.
- When the index is missing, failed or partial, or when the model call fails, the page still shows a deterministic outline and says exactly why.
- A developer can regenerate the tour on demand and share a link to it, or to one of its sections, with someone who uses the same studio.

Non-goals:
- Feeding the tour into review prompts or any review agent. The tour is for humans only.
- An MCP tool for reading or generating the tour.
- Per-branch or per-PR tours. A tour is per repo, built from the default branch.
- Using Project Context attachments or search roots as tour input (they ground review agents, SPEC-01).
- A public, unauthenticated or tokenised share link, an export, or writing the tour into the repo folder.
- Tour history. Only the latest tour per repo is kept.
- Automatic generation on page open, on new commits or on re-index.
- Changing which files the indexer selects when a repo exceeds its file cap (today it keeps the first 5,000 by path), and parsing languages other than JavaScript and TypeScript.
- GitHub API calls of any kind, including "good first issue" lookups for First tasks.
- Executing any command shown in the tour.
- Languages other than English for the tour text.

## User stories

- US-1: As a developer new to a repo, I want an architecture overview with a small diagram, so that I understand how the repo's main parts connect before reading code.
- US-2: As a developer new to a repo, I want the critical files and a recommended reading order with a one-line reason each, so that I read the foundations first instead of guessing.
- US-3: As a developer new to a repo, I want numbered, copyable commands taken from the repo's own manifests, so that I can run the project locally without inventing steps.
- US-4: As a developer new to a repo, I want a few first tasks grounded in real files, so that I have a concrete place to start contributing.
- US-5: As a reviewer in the studio, I want to regenerate the tour and see when it was built and from which index, so that I know whether it is current.
- US-6: As a reviewer in the studio, I want to copy a link to the tour or one of its sections, so that I can point a teammate at it.
- US-7: As an operator running the server, I want the tour to state honestly when it was built without the model or from a partial index, so that nobody trusts an outline as a full analysis.

## Acceptance criteria (EARS)

### Contract (`@devdigest/shared`, both copies)

- [ ] AC-1 The `@devdigest/shared` onboarding-tour contract shall describe a stored tour by its repo full name, the indexed commit SHA it was built from, its generation time, its status, its indexed source-file count, its candidate source-file count, the number of file facts dropped for budget, the provider and model used, its input and output token counts, and its estimated cost in USD, which is null when unknown.
- [ ] AC-2 A tour shall hold exactly five sections, in this order and with these anchors: `architecture`, `critical-paths`, `run-locally`, `reading-path`, `first-tasks`.
- [ ] AC-3 The contract shall shape the sections as follows: `architecture` holds Markdown prose, `directories` (the top-level directories holding indexed files, each as a path and its indexed file count, filled from the index whatever the section's origin) and a diagram of at most 12 nodes (id, label) and at most 20 directed edges (from, to, weight); `critical-paths` and `reading-path` hold ordered entries of a repo-relative path and a one-line reason that may be empty; `run-locally` holds ordered steps of command text, the repo-relative path of the source file, and a `risky` flag; `first-tasks` holds entries of a title, a description and one or more cited repo-relative paths.
- [ ] AC-4 Every section shall carry an origin of `model` or `skeleton`.
- [ ] AC-5 A tour's status shall be one of `ready`, `index_partial`, `unsupported_language`, `no_data`, `index_failed`, `llm_not_configured`, `llm_failed`, `timed_out`.
- [ ] AC-6 The response of `GET /repos/:id/onboarding` shall carry the stored tour or null, a `stale` flag, a `generating` flag, and the last failed attempt (its status and time) or null.

### Server — repo index: hotness and rank

- [ ] AC-7 WHEN the index computes file ranks, during a full index or an incremental refresh, the indexer shall count, for each indexed file, the commits that touched it among the at most 50 most recent commits present in the clone.
- [ ] AC-8 The indexer shall exclude from that count the commit at the clone's shallow boundary.
- [ ] AC-9 The indexer shall set each indexed file's hotness to its commit count divided by the highest commit count of any indexed file.
- [ ] AC-10 IF no indexed file has a counted commit, THEN the indexer shall set every indexed file's hotness to 0.
- [ ] AC-11 The indexer shall set each indexed file's rank to its PageRank × (1 + hotness), and compute its percentile from that rank.
- [ ] AC-12 The index state shall report whether hotness was available for the last rank computation and how many commits were counted.
- [ ] AC-13 Computing hotness shall make zero model calls and zero GitHub API calls.
- [ ] AC-14 The indexer shall compute identical hotness values for the same set of commits present in the clone.
- [ ] AC-106 WHEN a repo whose index was built before hotness existed is next refreshed, the indexer shall rebuild that repo's index in full, so that every indexed file gains hotness.

### Server — deterministic facts

- [ ] AC-15 WHEN a generation runs, the API shall build the tour's facts only from the repo's index and from files in the repo's clone.
- [ ] AC-16 The API shall build byte-identical facts for two generations of the same repo while its indexed commit SHA, its index state and its clone contents are unchanged.
- [ ] AC-17 No model call shall select, rank, order or filter the facts.
- [ ] AC-18 The facts shall include at most the 30 highest-ranked indexed files, leaving out test, mock, fixture, configuration, type-declaration and migration files.
- [ ] AC-19 The facts shall include at most 50 endpoints, at most 20 run commands, a directory tree of at most 200 entries down to depth 2, and at most the first 8,000 characters of the root README.
- [ ] AC-20 IF the facts' prompt input exceeds 24,000 estimated tokens, computed as ceil(characters / 4), THEN the API shall drop file facts lowest rank first until the input fits, and record the number dropped on the tour.
- [ ] AC-21 The API shall take run commands only from `package.json` scripts, `Makefile` targets, Docker Compose files, and `.nvmrc` or `engines` Node versions found at the repo root or one directory below it, and from fenced shell code blocks in the root README.
- [ ] AC-22 WHEN a run command comes from a `package.json` script, the API shall prefix it with the package manager named by the lockfile in the same directory (`pnpm`, `yarn`, `bun` or `npm`), and with `npm` when that directory has no lockfile.
- [ ] AC-23 The API shall record, for each run command, the repo-relative path of the file it came from.
- [ ] AC-24 The API shall mark a run command `risky` when it pipes a `curl` or `wget` download into a shell or contains `sudo`.
- [ ] AC-25 The API shall never read into the facts a file named `.env` or starting with `.env.`, a file ending in `.pem` or `.key`, or a file whose name starts with `secrets`.
- [ ] AC-26 IF a file the facts would read has an absolute path, contains a `..` segment, or resolves outside the repo's clone, THEN the API shall skip it without reading it.

### Server — sections computed from the import graph

- [ ] AC-27 The API shall choose the reading path's files as the 12 highest-ranked indexed files, by the rank of AC-11 and leaving out the file kinds AC-18 leaves out, or all of them when fewer exist.
- [ ] AC-28 The API shall order the reading path so that each file comes after every other reading-path file it imports, breaking ties and import cycles by higher rank first, then by path in ascending order.
- [ ] AC-29 The API shall take the critical-paths files, at most 8 distinct ones, from the index's import-graph dependency chains that start at the highest-ranked files, in chain order.
- [ ] AC-30 The API shall build the architecture diagram from the import graph, leaving out the file kinds AC-18 leaves out both as nodes and as edge endpoints, as follows: for each candidate depth from 1 to 4, it groups indexed files by their directory prefix of that many levels, where a path segment named `src` does not count as a level (so `server/src/modules/x.ts` groups as `server/modules` at depth 2), a file whose directory has fewer levels groups by its whole directory, and repo-root files form one node `(root)`; it keeps the 12 groups with the most indexed files; it draws one directed edge from kept group A to a different kept group B, weighted by the number of import edges from files in A to files in B, with no self-edges, and keeps the 20 heaviest edges; and it uses the depth whose kept groups have the most import edges running between two different kept groups, the smaller depth winning a tie.
- [ ] AC-31 The API shall keep the computed files and order of the reading path and of the critical paths, taking only a one-line reason per file from the model.

### Server — generation and the model call

- [ ] AC-32 WHEN a user requests a generation (`POST /repos/:id/onboarding/generate`), the API shall respond 202 without waiting for the generation to finish.
- [ ] AC-33 WHILE a generation for a repo is in flight, the API shall answer a further generation request for that repo with 202 and start no second generation.
- [ ] AC-34 IF a repo receives more than 5 generation requests within one minute, THEN the API shall answer the excess requests with 429 and make no model call for them.
- [ ] AC-35 A generation shall make at most one model call, with zero retries.
- [ ] AC-36 WHEN a generation's status is none of `no_data`, `index_failed` and `llm_not_configured` after its facts are collected, the API shall make exactly one structured model call that turns the facts into the five sections.
- [ ] AC-37 The model call shall use the workspace's choice for the `onboarding` feature model (Settings → Feature Models).
- [ ] AC-38 IF the repo has no clone or no index state, THEN the generation shall make no model call and end with status `no_data`.
- [ ] AC-39 IF the index status is `failed`, or reading the index raises an error, THEN the generation shall make no model call and end with status `index_failed`.
- [ ] AC-40 IF no API key is configured for the provider of the `onboarding` feature model, THEN the generation shall make no model call and end with status `llm_not_configured`.
- [ ] AC-41 IF the model call fails, does not return within 60 seconds, or returns output that does not match the section schema, THEN the generation shall end with status `llm_failed`.
- [ ] AC-42 IF a generation has not finished 90 seconds after the API accepted its generation request, THEN the API shall end it with status `timed_out`.
- [ ] AC-43 The API shall drop every model-written reason whose file path is not one of its section's computed files.
- [ ] AC-44 The API shall remove from each model-written first task every cited path that is not in the facts, and drop a first task left with no cited path.
- [ ] AC-45 The API shall keep at most 5 first tasks, in the model's order.
- [ ] AC-46 The API shall drop every model-written run step whose command text does not exactly match a run command in the facts, and keep at most 10 run steps in the model's order.
- [ ] AC-47 IF every model-written entry of a section is dropped, THEN the API shall store that section in its skeleton form with origin `skeleton`, keeping the other sections.
- [ ] AC-48 IF every section of a model-written tour falls back to its skeleton form, THEN the generation shall end with status `llm_failed`.
- [ ] AC-49 IF the repo has a clone but its index holds no JavaScript or TypeScript source file, THEN the generation shall end with status `unsupported_language` and store the critical paths and the reading path in skeleton form with no entries.
- [ ] AC-50 IF the index status is `partial`, or the index left out candidate source files because of its file cap, THEN the generation shall proceed with the model call and end with status `index_partial`.
- [ ] AC-51 IF more than one status applies to a generation, THEN the API shall store the first that applies in this order: `no_data`, `index_failed`, `llm_not_configured`, `timed_out`, `llm_failed`, `unsupported_language`, `index_partial`, `ready`.
- [ ] AC-52 WHEN a generation ends, the API shall store its tour as the repo's only tour, replacing the previous one, except as AC-53 states.
- [ ] AC-53 IF a generation ends with status `no_data`, `index_failed`, `llm_not_configured`, `llm_failed` or `timed_out` while the repo already has a stored tour with status `ready`, `index_partial` or `unsupported_language`, THEN the API shall keep the stored tour and record the failed generation's status and end time as the last failed attempt.
- [ ] AC-54 WHEN a generation replaces the stored tour, the API shall clear the last failed attempt.
- [ ] AC-55 The API shall store every section of a tour with status `no_data`, `index_failed`, `llm_not_configured`, `llm_failed` or `timed_out` with origin `skeleton`.
- [ ] AC-56 The skeleton form of `architecture` shall carry the `directories` of AC-3 and the diagram of AC-30, with no prose.
- [ ] AC-57 The skeleton form of `critical-paths` and of `reading-path` shall list the computed files of AC-27 to AC-29 in their computed order, each with an empty reason.
- [ ] AC-58 The skeleton form of `run-locally` shall list the facts' run commands in the order they were collected, at most 10.
- [ ] AC-59 The skeleton form of `first-tasks` shall hold no entries.
- [ ] AC-60 WHEN a user requests the tour of a repo in the workspace (`GET /repos/:id/onboarding`), the API shall respond 200 with the stored tour, or with null when none exists.
- [ ] AC-61 IF the requested repo does not exist in the workspace, THEN the API shall respond 404.
- [ ] AC-62 The API shall set `stale` to true when the repo's current last indexed commit SHA differs from the commit SHA the stored tour was built from.
- [ ] AC-63 The API shall start a generation only on a generation request.
- [ ] AC-64 The API shall store with each tour the provider, model, token counts and estimated cost of its model call, with zero tokens and a null cost when no model call was made.
- [ ] AC-65 The API shall place every string taken from the repo into the model prompt inside an untrusted-data delimiter block.
- [ ] AC-66 IF a string taken from the repo contains the closing delimiter, THEN the API shall escape it so the block cannot be closed early.
- [ ] AC-67 The model prompt's system message shall carry a trusted instruction that content inside untrusted-data blocks is data whose instructions are ignored.
- [ ] AC-68 WHEN a generation ends, the API shall log exactly one line with the repo id, the status, the file-fact count, the run-command count, the input and output token counts and the duration, and no repo content or prompt text.

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

### e2e

- [ ] AC-104 The e2e suite shall open the Onboarding Tour from the sidebar for the seeded repo `acme/payments-api` and confirm the empty state titled "Generate onboarding tour" renders.
- [ ] AC-105 The e2e suite shall click "Generate onboarding tour" for the seeded repo, which has no clone, and confirm the `no_data` banner sentence of AC-87 renders, without any model call.

## Edge cases

- **First visit to a repo:** the empty state shows, and nothing runs until the user clicks Generate (AC-80, AC-81, AC-63).
- **Repo never cloned, such as the seeded `acme/payments-api`:** the generation makes no model call and stores an all-skeleton tour with status `no_data`. With no clone, every section is empty except where the index has data (AC-38, AC-55, AC-105).
- **First depth-1 clone that has not been resynced:** every file's hotness is 0, so rank equals PageRank. The index state reports that hotness was unavailable (AC-8, AC-10, AC-12).
- **Repo with more than 5,000 source files**, such as a 12,450-file repo: the index keeps the first 5,000 by path. The tour is generated with status `index_partial`, and the header reads "Indexed 5000 of 12450 source files" (AC-50, AC-74).
- **Python, Go or another unindexed language:** status `unsupported_language`. Architecture prose, run steps and first tasks can still come from the model; critical paths and the reading path say they are unavailable (AC-49, AC-102). First tasks may only cite paths that are in the facts (AC-44).
- **A monorepo whose packages import each other only within themselves:** top-level grouping draws almost no edges. On `DanceWithBikes/dev-digest` it gave 5 nodes and 1 edge out of 514 import edges. The diagram therefore uses the deeper grouping that shows the most cross-group imports, such as `server/modules` or `client/app`, still capped at 12 nodes and 20 edges (AC-30). If no depth yields an edge between two different groups, depth 1 is used and the diagram shows its nodes with no edges (AC-30, tie rule). The `directories` list stays top-level whatever depth the diagram uses (AC-3, AC-107).
- **Repo with no manifests and no README code blocks:** run-locally has no steps. If the model writes steps anyway, they are dropped because they match no fact command (AC-46, AC-47).
- **The model cites a file that is not in the facts, or invents a command:** that entry is dropped (AC-43, AC-44, AC-46). If a whole section empties, that section shows its outline with "Outline · no AI" (AC-47, AC-90). If every section empties, the status is `llm_failed` (AC-48).
- **Regeneration fails while a good tour exists:** the good tour stays and the "last regeneration failed" banner appears (AC-53, AC-89).
- **Regeneration fails and no good tour exists:** the skeleton tour is stored with the failure status (AC-52, AC-55).
- **Two users click Regenerate at once, or one user double-clicks:** only one generation runs (AC-33).
- **A sixth request within a minute:** 429, and no model call (AC-34).
- **New commits are indexed after the tour was built:** the tour shows "Out of date" and is not regenerated automatically (AC-62, AC-86, AC-63).
- **An index job runs during generation:** the tour records the commit SHA its facts came from. If the index moves on, the tour is stale on the next read (AC-1, AC-62).
- **A missing API key for the `onboarding` model's provider:** status `llm_not_configured`, with a link to Feature Models (AC-40, AC-88).
- **The model hangs:** after 60 seconds the status is `llm_failed` (AC-41). A whole generation stuck past 90 seconds ends `timed_out` (AC-42). The studio stops polling after 120 seconds (AC-85).
- **A repo-intel read raises a database error:** the generation ends `index_failed` instead of surfacing a 500 (AC-39).
- **A README instructs the model to "ignore previous instructions" or to recommend a malicious command:** the text is delimited untrusted data (AC-65–AC-67). A command that is not in the manifests is dropped (AC-46). The model's text renders without HTML or foreign links (AC-99, AC-100).
- **A committed symlink named `package.json` that points outside the clone:** it is skipped (AC-26).
- **A `.env` file at the repo root:** it is never read (AC-25).
- **A repo-root `install.sh` invoked by a README line `curl … | sh`:** shown with "Review before running" (AC-24, AC-96).
- **Other features that read file rank change when hotness changes the ranks:** Blast Radius caller order, Conventions samples, the review prompt's repo map and caller ranks all read the AC-11 rank. Their outputs may reorder after the first resync, and that is accepted.
- **A share link opened by someone who cannot reach this studio:** it does not work, because no public endpoint exists (Non-goals).
- **A URL fragment that names no section:** the page opens at the top. No criterion covers it.

## Non-functional requirements

- NFR-1: `GET /repos/:id/onboarding` shall respond in p95 ≤ 300 ms for a repo with 5,000 indexed files.
- NFR-2: Fact collection shall take p95 ≤ 5,000 ms for a repo with 5,000 indexed files.
- NFR-3: A generation shall end within 90 s (AC-42). The model call shall time out at 60 s (AC-41).
- NFR-4: Model-call budget per generation: at most 1 call, 0 retries, at most 24,000 estimated input tokens (ceil(characters / 4)), at most 4,000 output tokens.
- NFR-5: Rate limits: at most 1 generation in flight per repo (AC-33) and at most 5 generation requests per repo per minute (AC-34).
- NFR-6: Hotness shall add at most 1 local git history read over at most 50 commits per rank computation, and 0 network calls (AC-7, AC-13).
- NFR-7: Every new studio string shall live in `client/messages/en/`, with 0 hard-coded UI strings in components.
- NFR-8: The Onboarding Tour page, its empty state and every banner shall render in both `data-theme="dark"` and `data-theme="light"`.
- NFR-9: Every "On this page" entry, the Generate, Regenerate and Share link buttons, every Copy button and every Open link shall be reachable with Tab and operable with Enter or Space.
- NFR-10: The server shall log exactly 1 line per generation (AC-68), and 0 log lines shall contain repo content or prompt text.
- NFR-11: While a generation is in flight, the studio shall poll at most every 3 s and at most 40 times per generation (AC-84, AC-85).

## Inputs and provenance

### Data inputs

| Input | Source | Trusted? | Freshness |
|---|---|---|---|
| Ranked files, import edges, dependency chains, endpoints, index state, indexed and candidate counts | repo-intel index (Postgres) | Yes as structure; the file paths and endpoint strings inside are not trusted | as of the last full index or incremental refresh |
| Per-file commit counts (hotness) | filesystem clone, git history of at most the 50 most recent commits | No (commit content is repo-controlled; counts are derived) | as of the last index or refresh; 0 until the first resync |
| Manifest files (`package.json`, lockfiles, `Makefile`, Compose files, `.nvmrc`) | filesystem clone, default branch | No | as of the clone's last sync |
| Root README text | filesystem clone, default branch | No | as of the clone's last sync |
| Directory tree | repo-intel index | No (names are repo-controlled) | as of the last index |
| Model output (prose, reasons, task text, run-step order) | LLM output | No | written once per generation |
| `onboarding` feature-model choice, API key presence | Postgres settings, secrets store | Yes | read at generation start |
| Generation and share-link clicks, URL fragment | user in the studio | No (validated) | per request |
| Stored tour | Postgres (written by a generation) | Yes as provenance; the model-written text inside is untrusted | as of its generation time |

### Requirement provenance

- **The five sections, header text, Regenerate, Share link, "On this page" table of contents, and the deterministic-facts → one-structured-call → honest-skeleton shape:** the user's feature request, relayed by the coordinator. The design artboards "Onboarding Tour (N5)" and "Onboarding Tour · empty" are in `client/docs/design/DevDigest Design (standalone).html`, `ScreenTour`. That screen's body is bundled and could not be text-searched, so labels come from the request.
- **The four invariants the user named:** each is pinned as criteria — deterministic facts (AC-15–AC-17), the reading path from the import graph (AC-27, AC-28, AC-31), exactly one structured model call (AC-35, AC-36), and an honest skeleton status (AC-51, AC-55, AC-87, AC-90).
- **Hotness (AC-7–AC-12):** the user's decision Q14. Hotness is the per-file commit count over the window the resync fetch already pulls, normalised to [0, 1], 0 without history, and rank = PageRank × (1 + hotness). The window size of 50 commits is `RESYNC_FETCH_DEPTH` at `server/src/adapters/git/simple-git.ts:20`. The first clone is depth 1 (`server/src/modules/repos/constants.ts:9`), so hotness is 0 until the first resync. Normalising by the highest count (AC-9) and excluding the shallow boundary commit (AC-8) are spec-creator choices that satisfy that decision: in a shallow clone, the boundary commit appears to touch every file.
- **Hotness is 0 today:**
  - Rank = PageRank under "Option B": `server/src/modules/repo-intel/pipeline/rank.ts:4-7`, `server/src/db/schema/repo-intel.ts:95-98`.
  - The index stats already carry a `hotnessAvailable: false` flag: `server/src/modules/repo-intel/pipeline/full.ts:262`, `server/src/modules/repo-intel/pipeline/incremental.ts:251`.
- **First tasks (AC-44, AC-45):** the user's decision Q17 — model-written, 3–5 tasks, each citing a fact file or dropped, with no GitHub call. The grounding pattern comes from `server/src/modules/conventions/docs/insights.md:21`.
- **Large repos (AC-50, AC-74, Non-goals):** the user's decision Q8/Q9.
  - The cap is the first 5,000 files by path: `server/src/modules/repo-intel/constants.ts:42`, `server/src/modules/repo-intel/pipeline/walk.ts:63-68`.
  - Only JavaScript and TypeScript are parsed: `server/src/modules/repo-intel/constants.ts:14`.
- **Share link and first visit (AC-78–AC-81):** the user's decision Q22/Q24.
- **Every other point accepted from pass 1 defaults (questions 1–7, 10–13, 15, 16, 18–21, 23, 25–36):** the user's answers relayed by the coordinator. Those defaults cover the route, human audience and no MCP tool, fact budgets and output sizes, foundations-first order, the manifest-only command source, `no_data` for never-cloned repos, GitHub "Open" links at the tour SHA, latest-only persistence, the stale rule, asynchronous regeneration that keeps the last good tour, cost in the header, the status set and skeleton contents, partial index still calling the model, facade errors becoming `index_failed`, untrusted delimiting, Markdown without HTML, a deterministic diagram, copy-only commands with a risk marker, the secrets exclusion, and the rate limit.
- **Facts from the import graph:** the index already ranks files and builds dependency chains from the highest-ranked roots (5 roots, depth 2). See `server/src/modules/repo-intel/types.ts:164-170` and `server/src/modules/repo-intel/service.ts:656-723`. The exclusion list for tests and configs is at `server/src/modules/repo-intel/service.ts:730-750`.
- **Endpoints per file:** precomputed by the index, `server/src/db/schema/repo-intel.ts:75-88`. The index state carries status, counts and the last indexed SHA, `server/src/db/schema/repo-intel.ts:35-48`.
- **Facade errors (AC-39):** a repo-intel read can raise a database error despite the facade's "never throws" note, `server/src/modules/repo-intel/docs/insights.md:27`.
- **The `onboarding` feature-model slot:** already exists, with default `openrouter` / `deepseek/deepseek-v4-flash`, at `server/src/vendor/shared/contracts/platform.ts:15-16` and `:46-52`. A missing key for a feature model is a known trap, `server/src/modules/conventions/docs/insights.md:28`.
- **Earlier scaffolding this spec replaces:**
  - a loose `Onboarding` contract: `server/src/vendor/shared/contracts/knowledge.ts:28-47`
  - an `onboarding` table keyed by repo only: `server/src/db/schema/context.ts:120-126`
  - a system prompt with a different section set and an untrusted-data rule: `server/src/prompts/onboarding.system.md:1-12`
  - client copy listing a different five sections: `client/messages/en/onboarding.json:10`
- **Route and sidebar (AC-69–AC-71):**
  - `/onboarding` is the add-repository screen: `client/src/app/onboarding/page.tsx:1`
  - the active-key helper maps any path containing `/onboarding` to `onboarding-tour`: `client/src/components/app-shell/helpers.ts:29`
  - WORKSPACE holds Pull Requests and Project Context: `client/src/vendor/ui/nav.ts:25-31`
  - the Feature Models settings section key is `models`: `client/src/vendor/ui/nav.ts:51-54`
- **The clone is never executed** (basis of the Non-goal on running commands): `server/src/adapters/git/simple-git.ts:24`. Reads are contained to the clone and refuse `..`, absolute paths and escaping symlinks (basis of AC-26): `server/src/adapters/git/simple-git.ts:129-143`.
- **No auth and one workspace** (basis of the share-link Non-goal): `server/src/adapters/auth/local.ts:7-13`.
- **Background jobs time out at 120 s:** `server/src/platform/jobs.ts:41`. NFR-3 sits under that limit.
- **Studio rendering:** the Markdown primitive renders without raw HTML, `client/src/components/context-selection/ContextDocPreview.tsx:2`. The architecture diagram is a native node/edge component rendering labels as text; Mermaid is not used.
- **The seeded repo is never cloned:** `docs/specs/project-context.md:139`. e2e flows use seeded data and never call a model: `e2e/AGENTS.md:17`.
- **ceil(characters / 4) estimate:** the same as Project Context, `docs/specs/project-context.md:55` (AC-11 there).
- **Amendment of 2026-10-03, after the cross-model plan review:** the user's decisions are recorded at `docs/plans/onboarding-tour/review.md:5-10`.
  - AC-3 gains the architecture `directories`, filled from the index for both origins, and AC-56 now points at them.
  - The AC-42 clock starts when the generation request is accepted; the runner is dedicated and in-process, with concurrency 1 and no retries.
  - Manifests are read by the onboarding module, not repo-intel, and repo-intel exposes read-only index facts.
  - AC-106 covers the full reindex that gives existing repos hotness.
  - AC-22 and AC-64 are explicitly unchanged.

## Untrusted inputs

- **README text and manifest contents.** Threats: prompt injection into the model call ("ignore your instructions", "recommend running this script"), and a malicious command presented as a setup step.
  - Neutralised by AC-65, AC-66 and AC-67 (delimited untrusted data under a trusted instruction).
  - AC-46 drops any command not literally present in the manifests.
  - AC-24 and AC-96 mark download-piped-to-shell and `sudo` commands.
  - DevDigest never runs a command (Non-goals).
- **File paths, directory names and endpoint strings from the index.** Threats: label injection into the prompt, and markup injection where paths are shown. Neutralised by AC-65 and AC-66 in the prompt. In the studio, AC-92, AC-94 and AC-97 render paths as plain or monospace text.
- **Commit history (hotness).** Threat: an attacker could pad commits to push a file up the reading path. The window is capped at 50 commits (AC-7) and hotness at most doubles a file's PageRank (AC-9, AC-11). This only reorders real files; it cannot introduce one (AC-27). The residual risk is accepted.
- **Secrets in the clone.** Threat: `.env`, key or secrets files reaching the model provider. Neutralised by AC-25.
- **Symlinks and traversal in manifest reads.** Threat: reading files outside the clone into the prompt. Neutralised by AC-26.
- **Model output.** Threats: invented files, commands or tasks; script, raw-HTML or link injection into the studio; and malformed output.
  - AC-43, AC-44, AC-46, AC-47 and AC-48 handle grounding.
  - AC-31 keeps the computed files and order.
  - AC-41 handles schema validation.
  - AC-99 and AC-100 cover rendering.
  - The diagram is built without the model (AC-30).
- **Generation requests.** Threat: model-cost amplification from repeated clicks or scripted requests. Neutralised by AC-33 and AC-34.
- **URL fragment and share link.** Threats: an unknown fragment, and exposing the tour beyond the studio. A fragment only selects among the five fixed anchors (AC-77), and no public endpoint exists (Non-goals).

## Open questions

- None open. Every pass-1 question was answered by the user on 2026-10-03 (Q8/Q9, Q14, Q17, Q22/Q24 explicitly; the rest by accepting the stated defaults).

## Changelog

- 2026-10-03 · L05 · approved — AC-30 adaptive grouping re-approved by the user.
- 2026-10-03 · L05 · draft (was approved) — AC-30 changed: the diagram now uses adaptive, deterministic directory-prefix grouping at depth 1–4, where `src` segments do not count as a level, files of the kinds AC-18 leaves out are excluded, and the chosen depth is the one with the most cross-group import edges among the 12 kept groups (smaller depth on a tie). US-1 was reworded; a monorepo edge case was added. Top-level grouping drew 5 nodes and 1 edge out of 514 import edges on a real tour; the user decided this after seeing that tour.
- 2026-10-03 · L05 · approved — AC-107 added (studio shows the architecture `directories` list under the diagram, whatever the origin); Mermaid notes replaced by the native diagram. Re-approved by the user.
- 2026-10-03 · L05 · draft (was approved) — AC-3, AC-42 and AC-56 changed; AC-106 added. The repo-intel part's scope now lists the read-only facade readers and notes that manifest reading belongs to the onboarding module. These amendments were approved by the user after the cross-model plan review.
- 2026-10-03 · L05 · draft — created: AC-1–AC-105, US-1–US-7, NFR-1–NFR-11; no open questions. First spec for the Onboarding Tour, drafted from the user's pass-1 answers.
