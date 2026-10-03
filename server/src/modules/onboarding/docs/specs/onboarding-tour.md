# Spec: Onboarding Tour — server/modules/onboarding

Spec ID: SPEC-02
Status: approved
Overview: [../../../../../../docs/specs/onboarding-tour.md](../../../../../../docs/specs/onboarding-tour.md)

## Scope in this module

This module owns `GET /repos/:id/onboarding` and `POST /repos/:id/onboarding/generate`. Its job runs in five steps:

1. Collect the deterministic facts from the repo-intel facade and from fixed manifest files in the clone.
2. Compute the reading path, critical paths and architecture diagram from the import graph.
3. Make the single structured model call.
4. Ground the model's output against the facts.
5. Store the tour with an honest status.

It relies on repo-intel for ranks (which include hotness), import edges, dependency chains, endpoints and index state. It relies on settings for the `onboarding` feature-model choice. It also carries the server copy of the `@devdigest/shared` tour contract.

## Acceptance criteria (EARS)

### Contract (`@devdigest/shared`, server copy)

- [ ] AC-1 The `@devdigest/shared` onboarding-tour contract shall describe a stored tour by its repo full name, the indexed commit SHA it was built from, its generation time, its status, its indexed source-file count, its candidate source-file count, the number of file facts dropped for budget, the provider and model used, its input and output token counts, and its estimated cost in USD, which is null when unknown.
- [ ] AC-2 A tour shall hold exactly five sections, in this order and with these anchors: `architecture`, `critical-paths`, `run-locally`, `reading-path`, `first-tasks`.
- [ ] AC-3 The contract shall shape the sections as follows: `architecture` holds Markdown prose, `directories` (the top-level directories holding indexed files, each as a path and its indexed file count, filled from the index whatever the section's origin) and a diagram of at most 12 nodes (id, label) and at most 20 directed edges (from, to, weight); `critical-paths` and `reading-path` hold ordered entries of a repo-relative path and a one-line reason that may be empty; `run-locally` holds ordered steps of command text, the repo-relative path of the source file, and a `risky` flag; `first-tasks` holds entries of a title, a description and one or more cited repo-relative paths.
- [ ] AC-4 Every section shall carry an origin of `model` or `skeleton`.
- [ ] AC-5 A tour's status shall be one of `ready`, `index_partial`, `unsupported_language`, `no_data`, `index_failed`, `llm_not_configured`, `llm_failed`, `timed_out`.
- [ ] AC-6 The response of `GET /repos/:id/onboarding` shall carry the stored tour or null, a `stale` flag, a `generating` flag, and the last failed attempt (its status and time) or null.

### Deterministic facts

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

### Sections computed from the import graph

- [ ] AC-27 The API shall choose the reading path's files as the 12 highest-ranked indexed files, by the rank of AC-11 and leaving out the file kinds AC-18 leaves out, or all of them when fewer exist.
- [ ] AC-28 The API shall order the reading path so that each file comes after every other reading-path file it imports, breaking ties and import cycles by higher rank first, then by path in ascending order.
- [ ] AC-29 The API shall take the critical-paths files, at most 8 distinct ones, from the index's import-graph dependency chains that start at the highest-ranked files, in chain order.
- [ ] AC-30 The API shall build the architecture diagram from the import graph, leaving out the file kinds AC-18 leaves out both as nodes and as edge endpoints, as follows: for each candidate depth from 1 to 4, it groups indexed files by their directory prefix of that many levels, where a path segment named `src` does not count as a level (so `server/src/modules/x.ts` groups as `server/modules` at depth 2), a file whose directory has fewer levels groups by its whole directory, and repo-root files form one node `(root)`; it keeps the 12 groups with the most indexed files; it draws one directed edge from kept group A to a different kept group B, weighted by the number of import edges from files in A to files in B, with no self-edges, and keeps the 20 heaviest edges; and it uses the depth whose kept groups have the most import edges running between two different kept groups, the smaller depth winning a tie.
- [ ] AC-31 The API shall keep the computed files and order of the reading path and of the critical paths, taking only a one-line reason per file from the model.

### Generation and the model call

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

## Module notes

- Facts come only from the `repoIntel.*` facade and from fixed manifest files in the clone, and the pipeline is never imported. There is exactly one structured model call per generation, and on degradation or model failure the skeleton is stored with an honest status: `server/src/modules/onboarding/AGENTS.md:5-6`.
- A facade read can raise a database error despite the "never throws" note, so AC-39 treats any read error as `index_failed`: `server/src/modules/repo-intel/docs/insights.md:27`.
- The feature model must be resolved through the container, not by importing the settings module (`pnpm arch:check`): `server/src/modules/conventions/docs/insights.md:8`. A workspace with only an OpenRouter key works with the `onboarding` default: `server/src/modules/conventions/docs/insights.md:28`.
- Earlier scaffolding this spec replaces:
  - a loose `Onboarding` contract: `server/src/vendor/shared/contracts/knowledge.ts:28-47`
  - an `onboarding` table keyed only by `repo_id`, with no workspace column, commit SHA or status: `server/src/db/schema/context.ts:120-126`. The db rules require `workspace_id` on every domain table, and migrations are generated, never hand-written.
  - a system prompt with a different section set: `server/src/prompts/onboarding.system.md:1-12`
- Background jobs time out at 120 s, above the 90 s generation limit of AC-42: `server/src/platform/jobs.ts:41`.
- User decisions of 2026-10-03 (`docs/plans/onboarding-tour/review.md:5-10`):
  - Manifest files and the README are read here, not in repo-intel, through a git-backed port. The allow-list, the depth rule and the secret-name refusal (AC-21, AC-25) are owned by this module. Path containment (AC-26) stays in the git client.
  - repo-intel supplies only read-only index facts.
  - Generation runs on a dedicated in-process runner with concurrency 1 and no retries. The 90 s clock of AC-42 starts when the request is accepted.
