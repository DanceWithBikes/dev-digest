# Implementation Plan: PR Brief (SPEC-03)

## Goal
A reviewer opens a PR's Overview tab and sees a **PR Brief** section above the Intent and Blast Radius cards. While the PR has no brief, the section shows a "Generate brief" button. After one click the server builds the brief and the studio shows it without a reload:
- a summary of what the PR does and why;
- the newest review's verdict, counts and score;
- the brief's cost and tokens, its "Generated … · model" line and a stale badge;
- a "Missing data" list;
- Risk areas inside the Intent card;
- a full-width "Review focus — read these first (N)" list. Clicking an item opens that file on Files changed.

On the server, a new `brief` module makes exactly one structured model call over the PR's own inputs: title, body, files and patches, the stored intent, the Blast Radius map and Project Context documents. It grounds every path the model returns against the PR's changed files and blast callers, then stores the result in `pr_brief`. It never regenerates on its own.

Today `PrBrief` is an unused contract (`server/src/vendor/shared/contracts/brief.ts:137-143`), `pr_brief` is an empty table, and nothing serves or renders a brief.

## Requirements
- Source: `docs/specs/pr-brief.md`, Spec ID **SPEC-03**, Status **approved** (the user, 2026-10-03), plus its parts:
  - `server/docs/specs/pr-brief.md`
  - `client/docs/specs/pr-brief.md`
  - `e2e/docs/specs/pr-brief.md`
- OQ-1 to OQ-6 defaults are treated as accepted, except where the Requirements review below says otherwise (OQ-1 is routed, not planned).
- Covered: AC-1 … AC-85 (all) and NFR-1 … NFR-9 (all). Non-goals `docs/specs/pr-brief.md:21-29` are out of scope (no MCP tool, no auto-generation, no history, no line highlighting, no repair call).

## Requirements review
None of these blocks the plan. Each states the assumption the plan makes.

- **AC-12 — the user brief says "`resolveFeatureModel(container, workspaceId, 'risk_brief')`", but a module cannot import it.**
  - Importing `modules/settings/feature-models.ts` from another module fails `no-cross-module-imports` (`server/src/modules/conventions/docs/insights.md:8`).
  - The plan calls `container.featureModel(workspaceId, 'risk_brief')`, which is that function on the composition root (`server/src/platform/container.ts:123-125`).
  - The registry default is `openai` / `gpt-4.1` (`server/src/vendor/shared/contracts/platform.ts:61-65`). Without an OpenAI key, `container.llm` throws `ConfigError` (`container.ts:194-212`), and the POST answers with that error (AC-46).
- **AC-47 vs NFR-3 and the edge case "the provider adapter's existing re-ask applies" — a real abort and the re-ask are mutually exclusive today.**
  - Only `singleAttempt: true` makes a provider abort its HTTP request. It also disables the re-ask (`server/src/vendor/shared/adapters.ts:64-71`).
  - Without it, OpenRouter ignores `timeoutMs` and stops only at its 900 s constructor deadline (`reviewer-core/src/llm/openrouter.ts:32,79-80`). OpenAI and Anthropic only *race* the promise (`server/src/platform/resilience.ts:13`).
  - This is recorded in `server/docs/insights.md:74`.
  - Assumption: keep the re-ask, as the spec's edge case says. "Abort" means:
    - at `requestStart + 90 s` the POST stops waiting and answers an error;
    - the in-flight slot is released;
    - a per-PR token guarantees the abandoned generation never stores (pattern: `server/src/modules/onboarding/docs/insights.md:12`).
  - The abandoned provider call may run on in the background, and its cost is not recorded. Recommendation 1 offers the true abort.
- **AC-46, AC-47 — synchronous generation vs `server/src/platform/AGENTS.md:5` ("Long work never runs inside a route handler").** The user chose synchronous generation (`docs/specs/pr-brief.md:221`). The plan follows the spec. Node's default request timeout (300 s) is above 90 s, so nothing in Fastify cuts the request short.
- **AC-46 — provider errors carry raw model output.**
  - OpenAI and Anthropic throw `ExternalServiceError(…, { raw })` (`server/src/adapters/llm/openai.ts:136-138`, `anthropic.ts:151`). `details` is sent to the client.
  - OpenRouter throws plain `Error`s that include model text (`reviewer-core/src/llm/openrouter.ts:118,160`).
  - The service catches every model failure and throws its own `ExternalServiceError('PR brief generation failed')` with **no details**. `ConfigError` passes through unchanged.
- **AC-48, AC-49 — the scope of the rate limit.**
  - AC-48 says "for the same PR". AC-49 and NFR-5 name only the route.
  - Assumption: 409 is per PR. The 5-per-minute window is **per workspace across all PRs**: it bounds model spend, and the studio is single-user.
  - The window counts every POST that passes the 404 check, including the ones answered 409 or 429. It is checked **before** the in-flight flag.
  - It lives in the service, not in `@fastify/rate-limit`. That plugin is keyed by IP and is not registered under `NODE_ENV=test` (`server/src/app.ts:93-97`), so tests could not prove AC-49 through it.
  - The state is per process (`server/docs/insights.md:27`).
  - If per-PR is meant → route to spec-creator.
- **AC-31, AC-32 — two readings of the diff budget.**
  - (a) "while the running total stays at or below 60,000": the plan **stops at the first patch that would cross the budget**, and every later file goes without a patch.
  - (b) "N is the number of files sent without a patch": the plan counts only files **whose patch existed and was withheld**. A file GitHub sent with no patch (binary, too large) is not counted.
  - Without (b), seeded PR #482, whose 7 files have no patch (`server/src/db/seed.ts:131-139`), would claim "diff truncated (7 files)".
  - If either reading is wrong → route to spec-creator. Recommendation 4 covers skip-and-continue.
- **AC-6 — a regex can only reject `a.ts:0` if paths contain no `:`.**
  - The contract ref is `^[^:]+(?::[1-9]\d*(?:-[1-9]\d*)?)?$`.
  - Grounding parses the path part as the text before a valid `:<start>[-<end>]` suffix. A ref with any other colon is dropped, because its path part is not an allowed path.
  - A real repo path that contains `:` therefore cannot appear in `file_refs`. That is accepted.
- **AC-16, AC-31 — "the PR's file order" is not stored.**
  - `pr_files` has no position column. The Files changed tab reads it with no `ORDER BY` (`server/src/modules/pulls/repository.ts:221-228`), after a delete-and-reinsert (`:245-247`).
  - The brief repository uses the same read, so the order matches what the reviewer sees. Tests use explicit fixtures.
- **AC-19 — staleness is by head SHA only.**
  - `reviews`' `isIntentStale` also compares the body hash (`server/src/modules/reviews/intent-helpers.ts:105`). AC-19 names only the SHA, and the plan follows AC-19.
  - A stored intent with `head_sha = null` (rows from before the column) counts as "differs", so it is flagged stale.
- **AC-21 — `degraded: true` without a `reason`.** `BlastRadius.reason` is optional (`brief.ts:61-62`). The plan writes "blast radius degraded (unknown)".
- **AC-44 + NFR-9 — one log line serves both.** Every generation logs exactly one line, and that line always carries the three dropped counts. When drops are above 0, this line is the AC-44 line too, so no second line is written.
- **AC-40 — hunks with no new side.**
  - New-side ranges come from the `@@ … +start,len @@` headers of the stored patch. A missing `len` means 1, and `len = 0` hunks are skipped.
  - If a patch has no new-side range at all (deletions only), the line is kept as returned, like the patch-less edge case.
  - The adapter's diff parser (`server/src/adapters/git/diff-parser.ts:46`) cannot be imported by a module, so a 10-line pure helper reads the headers.
- **AC-58, AC-59 — the "newest completed review" (OQ-5).**
  - Taken client-side from `usePrReviews`, which returns reviews newest first (`client/src/app/repos/[repoId]/pulls/[number]/page.tsx:77`). It is the first review with `kind === 'review'` and a non-null `verdict`.
  - Findings count is `findings.length`. Blockers are non-dismissed `CRITICAL` findings, exactly as `ReviewRunAccordion.tsx:60` counts them.
- **AC-68, AC-69 — `brief.intent` vs the live Intent card.**
  - `IntentCard` renders the *live* intent from `GET /pulls/:id/intent` (`IntentCard.tsx:22`), not the brief's snapshot. The plan places Risk areas by `brief.intent`, as the AC says.
  - When `brief.intent` is null, the Risk areas card **replaces** the Intent card, including its "Detect intent" call to action (`IntentCard.tsx:40-53`). This is the literal AC-69.
- **AC-78 — the URL parameter.** The target file goes in `?file=<path>`. `URLSearchParams` encodes `/` as `%2F`. A manual tab switch clears `file`, and only a review focus click sets it.
- **AC-82 — "that file is expanded" cannot fail on the seed.**
  - Every seeded PR #482 file is under the auto-expand threshold, so each one opens on its own (`client/src/components/diff-viewer/FileCard/FileCard.tsx:44-46`, `constants.ts:4`; `client/docs/insights.md:13`).
  - The e2e step still asserts it through a `data-open` attribute. A client unit test with a file over 200 lines proves the forced expansion.
- **AC-83 — needs a DB where #483 has no brief.** A manual generate against the dev DB breaks the flow, as with onboarding (`e2e/docs/insights.md`, entry "A manual smoke `POST /repos/:id/onboarding/generate`…"). Run it with `e2e:hermetic`.
- **AC-84, AC-85 — where the seed insert goes.** The PR #482 block runs only when the PR row is missing (`server/src/db/seed.ts:106`). The brief insert sits after that block, with its own existence check keyed by `pr.id`, so existing dev DBs get the seeded brief too.
- **OQ-1 — the module spec part is not in this plan.**
  - The OQ-1 default asks the implementer to write `server/src/modules/brief/docs/specs/pr-brief.md`. A plan step may create only the empty `docs/specs/.gitkeep`.
  - Step 6 scaffolds the directory in B1 (`docs/insights.md:27`). → route to spec-creator to write the module part (AC-9 to AC-49 verbatim) and trim the server part, after B1 and before doc-writer.
- **NFR-1 — "p95 ≤ 200 ms on the local dev stack" has no automated gate.** Proof is manual: 20 `curl` runs of `GET /pulls/:id/brief` against the seeded #482 brief.
- **AC-43 — `minItems` in a strict schema.** `toJsonSchema` emits `minItems: 1` for `.min(1)`, and both OpenAI and OpenRouter send `strict: true` (`openai.ts:104-107`, `openrouter.ts:99`). If a provider rejects the keyword, the call fails as AC-46. This is listed under Risks.

## Recommendations
1. **True abort at 90 s: `singleAttempt: true` with `timeoutMs = remaining`.**
   - **Why:** this is the only path on which every provider aborts the HTTP request (`server/src/vendor/shared/adapters.ts:64-71`, `server/docs/insights.md:74`). It stops a background call from spending money after the user has seen the error.
   - **Trade-off:** no re-ask on schema-invalid output, which contradicts the spec's edge case (`docs/specs/pr-brief.md:174`). A wrong-shaped output then fails immediately.
   - **Affects:** AC-46, AC-47, NFR-3; Steps 12, 13.
2. **Wrap the changed-file and caller-file path lists in untrusted blocks as well.**
   - **Why:** file names are author-controlled. AC-33 lists title, body, patches, intent, blast names and documents, but not the path lists that AC-35 tells the model to cite.
   - **Trade-off:** none in behaviour. It goes slightly beyond AC-33's list.
   - **Affects:** AC-33, AC-35; Step 9.
3. **Two-column Intent | Blast layout from the mockup.**
   - **Why:** the mockup puts the two cards side by side. Today they are stacked (`client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/OverviewTab.tsx:27-35`).
   - **Trade-off:** no AC asks for it, and `BlastRadiusCard`'s graph view was built for the full 1080 px column. The plan keeps the stacked layout.
   - **Affects:** AC-52, AC-74; Step 21.
4. **Skip-and-continue for patches (as AC-27 does for documents).**
   - **Why:** under "stop at first overflow", one huge first patch hides every small patch after it.
   - **Trade-off:** this is a spec change → spec-creator.
   - **Affects:** AC-31, AC-32; Step 8.

## Constraints that shape this plan
| Constraint | Source | What it forces |
|---|---|---|
| `@devdigest/shared` exists in two copies — change both | `AGENTS.md:27`, `client/AGENTS.md:32`; drift is already recorded in `docs/insights.md:53` | Steps 1 + 2; AC-8 is a byte-equality check of `contracts/brief.ts` |
| The shared barrel is self-contained | `server/.dependency-cruiser.cjs:147` | The contract imports only `zod` and sibling contracts |
| The client never value-imports `@devdigest/shared` | `client/docs/insights.md:45` | Client code uses `import type` only. The file-ref regex and other client constants stay client-local (Step 20) |
| Migrations only via `pnpm db:generate`; not run on boot | `AGENTS.md:28,33`, `server/src/db/AGENTS.md:6,10` | **No migration.** `pr_brief` keeps `pr_id + json`, and all metadata goes in the JSON (AC-5) |
| Every query is scoped by workspace; `pr_brief` has no `workspace_id` | `server/src/db/AGENTS.md:5`; `server/src/db/schema/reviews.ts:80-85` | Every brief read and write happens only after a workspace-scoped PR lookup (pattern: `server/src/modules/reviews/service.ts:215-218`) |
| Modules never import each other | `server/src/modules/AGENTS.md:17`; `server/.dependency-cruiser.cjs:121` | Blast goes through a new `container.blastReader`. The document reader is promoted to `modules/_shared`. Intent and attachments are read through brief's own repository |
| Cross-module *data* is a query in your own repository | `server/src/modules/reviews/docs/insights.md:73` | `BriefRepository` reads `pr_intent`, `pull_requests`, `pr_files`, `agents`, `agent_skills`, `skills` and both attachment tables |
| Cross-module *behaviour* is a delegation on the container | `server/src/modules/conventions/docs/insights.md:8`; `server/.dependency-cruiser.cjs:139` (container is exempt) | `container.featureModel(…, 'risk_brief')`; `container.blastReader(log)` |
| Only repositories touch the DB; only routes know Fastify; services take ports, not the Container; the application ring has no I/O | `server/.dependency-cruiser.cjs:40,52,76,89`; `server/src/modules/AGENTS.md:18-19` | The module's file layout; `compose.ts` is the only file that sees `Container` |
| The purity gate checks only `domain`, `ports`, `helpers` and `constants` directly under the module | `server/docs/insights.md:95` | All pure logic goes in `helpers.ts`. `prompt.ts` purity is a review item |
| Errors are classes; statuses live only in `errors.ts` | `server/AGENTS.md:27`; `server/src/modules/AGENTS.md:20`; `server/src/platform/errors.ts:7-47` | New `ConflictError` (409). `RateLimitError` (429) already exists |
| Untrusted text goes through `wrapUntrusted` / `escapeUntrustedContent` | `reviewer-core/src/prompt.ts:66-84`, `reviewer-core/src/index.ts:15-22` | Step 9 (AC-33, AC-34) |
| A reasoning model can spend `max_tokens` before it answers | `server/docs/insights.md:60` | Send `reasoning: { enabled: false }` (ignored by non-OpenRouter providers) |
| Integration tests make REAL model calls unless every provider is mocked | `server/docs/insights.md:115,89` | Step 24 mocks `openai` (the `risk_brief` default) **and** `openrouter`, plus `github` |
| The seed is idempotent and keyed by name | `server/src/db/AGENTS.md:7`; `server/docs/insights.md:42` | Step 15 adds a separate existence check by `pr_id` |
| Client: copy via `useTranslations`; no `fetch` in components; folders entered through `index.ts`; both themes; design system extended, not rewritten | `client/AGENTS.md:23-29,36`; `client/.dependency-cruiser.cjs:45,59,97,111` | Steps 16–21 |
| Sibling route components may be imported only by the bare folder name | `client/docs/insights.md:54` | `../VerdictBanner`, `../IntentCard` — never their deep paths |
| `relativeTime` needs a live `now` | `client/docs/insights.md:69,76` | `useNow({ updateInterval: 30_000 })` in the "Generated …" line |
| e2e: seeded data only, no LLM; `--exact` on short text; `wait --url` matches a substring; the page scrolls inside `main`; `wait --text` matches the rendered (uppercased) casing | `e2e/AGENTS.md:15-17`; `e2e/docs/insights.md`, entries "`find text "X" click` can silently click…", "`agent-browser wait --url` takes a substring…", "`find <locator> click` reports `✓ Done`…", "`wait --text` and `find text` read different DOM representations…" | Step 26 |

## Touched packages / modules
| Package | Module | Ring / layer | Why it changes |
|---|---|---|---|
| server | `src/vendor/shared/contracts/brief.ts`, `index.ts` (comment) | domain (contracts, copy 1) | New `PrBrief` shape: AC-1 to AC-7 |
| client | `src/vendor/shared/contracts/brief.ts`, `index.ts` (comment) | contracts copy 2 | Byte-identical copy: AC-8 |
| server | `src/platform/errors.ts` | platform | `ConflictError` (409) for AC-48 |
| server | `src/modules/_shared/context-doc-reader.ts` (NEW), `src/modules/reviews/compose.ts` | shared module piece; composition root of reviews | The head → `pr-<n>` → working-tree reader is promoted so that brief reuses it (AC-26) |
| server | `src/platform/container.ts` | composition root | `blastReader(log)` delegates to `makeBlastService` (AC-20 to AC-22) |
| server | `src/modules/brief/**` (NEW), `src/modules/index.ts` | full module | Routes, service, repository, grounding, prompt, gate |
| server | `src/db/seed-fixtures.ts`, `src/db/seed.ts` | infrastructure (seed) | Seeded brief for #482 (AC-84, AC-85) |
| client | `src/lib/hooks/brief.ts` (NEW), `src/lib/hooks/index.ts` | data layer | `usePrBrief`, `useGeneratePrBrief` |
| client | `messages/en/brief.json` | copy | Every new string; replaces `unavailableHint` (NFR-8) |
| client | `src/components/diff-viewer/{DiffViewer,FileCard}` | shared component | Target file: force open, scroll, `data-file-path` / `data-open` (AC-77) |
| client | `src/app/repos/[repoId]/pulls/[number]/page.tsx` | route | `?file=` parameter; `openFile` handler; passes `files` to Overview (AC-76, AC-78) |
| client | `…/pulls/[number]/_components/DiffTab/DiffTab.tsx` | route component | Passes the target file to every `DiffViewer` |
| client | `…/pulls/[number]/_components/VerdictBanner/VerdictBanner.tsx` | route component | Nullable verdict; `actions` and `meta` slots (AC-57 to AC-63) |
| client | `…/pulls/[number]/_components/IntentCard/IntentCard.tsx` | route component | `footer` slot for Risk areas (AC-68) |
| client | `…/pulls/[number]/_components/OverviewTab/**` (helpers + NEW `_components/{PrBriefSection,RiskAreas,ReviewFocus}`) | route component | The brief UI (AC-50 to AC-80) |
| e2e | `specs/11-pr-brief.flow.json`, `specs/12-pr-brief-empty.flow.json` (NEW), `README.md` | e2e | AC-81 to AC-83 |

## Steps

### Step 1 — Reshape the brief contract in the server copy of `@devdigest/shared`
- **Files:**
  - `server/src/vendor/shared/contracts/brief.ts`
  - `server/src/vendor/shared/index.ts` (barrel comment, line 6)
  - `server/test/contracts.test.ts`
- **Change:**
  - Add:
    - `RiskFileRef = z.string().regex(/^[^:]+(?::[1-9]\d*(?:-[1-9]\d*)?)?$/)`; `Risk.file_refs` becomes `z.array(RiskFileRef)`.
    - `ReviewFocusItem {file: string.min(1), line: int.min(1), reason: string.min(1)}`.
    - `BriefMissingSource = z.enum(['intent','blast','specs','diff'])`.
    - `BriefMissing {source, reason: string.min(1)}`.
  - Redefine `PrBrief` as `{ summary, intent: Intent.nullable(), blast: BlastRadius.nullable(), risks: Risks, history: PrHistory, review_focus, missing, head_sha, generated_at, model, cost_usd: number.nullable(), tokens_in: int.nullable(), tokens_out: int.nullable() }`. The OQ-4 names are used, and the existing `risks` / `history` nesting is kept.
  - Add `PrBriefResponse = PrBrief.nullable()`.
  - Update the barrel comment.
  - Pin one valid `PrBrief.parse` and one rejection (`line: 0`, ref `a.ts:0`) in `contracts.test.ts`. The existing `Risks` fixture with `file_refs: []` stays valid.
- **Satisfies:** AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7 (shape)
- **Skills:** zod, typescript-expert
- **Insights:** `docs/insights.md:53` (copies drift); `client/docs/insights.md:57` (a required array may be `[]`)
- **Owner:** implementer
- **Depends on:** nothing
- **Done when:** `cd server && pnpm typecheck` is green, and `pnpm exec vitest run test/contracts.test.ts` passes.

### Step 2 — Mirror the contract in the client copy
- **Files:**
  - `client/src/vendor/shared/contracts/brief.ts`
  - `client/src/vendor/shared/index.ts` (comment)
- **Change:** a byte-identical copy of Step 1's `brief.ts`, and the same comment line.
- **Satisfies:** AC-8 (and AC-1 to AC-7 client side)
- **Skills:** zod
- **Insights:** `docs/insights.md:53`
- **Owner:** implementer
- **Depends on:** 1
- **Done when:** `diff server/src/vendor/shared/contracts/brief.ts client/src/vendor/shared/contracts/brief.ts` prints nothing, and `cd client && pnpm typecheck` is green.

### Step 3 — Add a 409 error class
- **Files:** `server/src/platform/errors.ts`
- **Change:** add `ConflictError extends AppError` (`code 'conflict'`, `409`), next to `RateLimitError` (`:43-47`).
- **Satisfies:** infrastructure for AC-48
- **Skills:** backend-onion-architecture
- **Insights:** none apply (checked `server/src/platform/AGENTS.md`)
- **Owner:** implementer
- **Depends on:** nothing
- **Done when:** `cd server && pnpm typecheck` is green.

### Step 4 — Promote the Project Context document reader to `modules/_shared`
- **Files:**
  - `server/src/modules/_shared/context-doc-reader.ts` (NEW)
  - `server/src/modules/reviews/compose.ts`
- **Change:**
  - Move `GitContextDocReader` (`reviews/compose.ts:197-271`) verbatim into `_shared`. Its constructor takes a structural `{ readonly git: Pick<GitClient,'readFileAt'|'fetchPullHead'|'resolveRef'|'listFiles'|'readFile'> }`, which the `Container` satisfies. The getter-throw guard stays.
  - Inside the new file, use a local `'working-tree'` version literal equal to `reviews/constants.ts`'s `WORKING_TREE`.
  - `reviews/compose.ts` re-exports the class and keeps `makeContextDocReader`, so `test/reviews-project-context.test.ts:4,74` stays unchanged.
  - Rationale: this is the third copy of the three-step fallback (the first is `RepoIntentSourceCollector#readSpecAtHead`), so it is abstracted now.
- **Satisfies:** infrastructure for AC-26
- **Skills:** backend-onion-architecture
- **Insights:**
  - `server/docs/insights.md:15` (never read inside `.git/`; the reader's tracked-files guard stays)
  - `server/docs/insights.md:21` (`MockGitClient.readFile` returns `''`)
- **Owner:** implementer
- **Depends on:** nothing
- **Done when:** `cd server && pnpm arch:check && pnpm typecheck` are green, and `pnpm exec vitest run test/reviews-project-context.test.ts` passes unchanged.

### Step 5 — Expose the Blast Radius map on the container
- **Files:** `server/src/platform/container.ts`
- **Change:**
  - Add `blastReader(log: BlastLog): Pick<BlastService, 'forPull'>`, which returns `makeBlastService(this, log)` (`server/src/modules/blast/compose.ts:12-19`). Use a type import of `BlastLog` / `BlastService`.
  - Add a doc comment: "for modules that may not import `blast/` (the brief)".
  - The map is then produced by exactly the code the Overview card uses: the self-file filter and the degradation refinement (`server/src/modules/blast/AGENTS.md:24-34`).
- **Satisfies:** infrastructure for AC-20, AC-21, AC-22, AC-36
- **Skills:** backend-onion-architecture
- **Insights:**
  - `server/src/modules/blast/docs/insights.md:12` (the self-file filter is load-bearing)
  - `server/src/modules/blast/docs/insights.md:15` (a degraded map can carry callers)
  - `server/src/modules/blast/docs/insights.md:35` (`no_data` when `pr_files` is empty)
- **Owner:** implementer
- **Depends on:** nothing
- **Done when:** `cd server && pnpm arch:check && pnpm typecheck` are green, with no change to the baseline.

### Step 6 — Scaffold the brief module's memory
- **Files:**
  - `server/src/modules/brief/AGENTS.md` (NEW)
  - `server/src/modules/brief/CLAUDE.md` (NEW symlink)
  - `server/src/modules/brief/docs/insights.md` (NEW)
  - `server/src/modules/brief/docs/specs/.gitkeep` (NEW)
- **Change:**
  - `AGENTS.md` states:
    - the routes `GET` / `POST /pulls/:id/brief`;
    - the layers;
    - that blast comes only through `container.blastReader`, and documents through `_shared/context-doc-reader`;
    - that intent and attachments come through the module's own repository;
    - one structured call per generation (`risk_brief`), with no `singleAttempt`;
    - the 90 s deadline from request start, with the token guard;
    - 409 per PR, and 5 per minute per workspace checked before in-flight;
    - JSON-only storage, with no migration;
    - that an unparseable stored body reads as null;
    - one log line, never containing content.
  - Then run `cd server/src/modules/brief && ln -s AGENTS.md CLAUDE.md`.
  - `docs/insights.md` uses the section skeleton of `server/src/modules/blast/docs/insights.md:1-10`.
- **Satisfies:** infrastructure (OQ-1 directory)
- **Skills:** engineering-insights
- **Insights:** `docs/insights.md:117` (symlink mechanics); `docs/insights.md:27` (scaffold before spec-creator writes the part)
- **Owner:** implementer
- **Depends on:** nothing
- **Done when:** `readlink server/src/modules/brief/CLAUDE.md` prints `AGENTS.md`, and the three files plus `.gitkeep` exist.

### Step 7 — Constants and domain types
- **Files:**
  - `server/src/modules/brief/constants.ts` (NEW)
  - `server/src/modules/brief/domain.ts` (NEW)
- **Change:**
  - `constants.ts` holds:
    - `BRIEF_TIMEOUT_MS = 90_000`;
    - `RATE_LIMIT_MAX = 5`, `RATE_LIMIT_WINDOW_MS = 60_000`;
    - `DIFF_BUDGET_CHARS = 60_000`;
    - `DOC_BUDGET_TOKENS = 20_000`, `CHARS_PER_TOKEN = 4`;
    - `BODY_CAP_CHARS = 8_000` (OQ-2);
    - `MAX_RISKS = 6`, `MAX_FOCUS = 10`;
    - `MAX_OUTPUT_TOKENS = 4_000`;
    - `SCHEMA_NAME = 'pr_brief'`;
    - the exact missing reasons: "no intent derived for this PR", "blast radius unavailable", "no project context documents attached", plus builders for the stale, degraded, budget, not-found and truncated reasons;
    - the log message.
  - `domain.ts` holds plain types: `PullForBrief {prId, repoId, owner, name, number, title, body, headSha, files: BriefFile[]}`, `BriefFile {path, additions, deletions, patch|null}`, `StoredIntent`, `AttachmentOwner` (agent `{id, name, createdAt, paths, skills: {id, name, order, enabled, paths}[]}`), `ModelBriefOutput`, `DroppedCounts`, `GroundingContext`.
- **Satisfies:** infrastructure for AC-16 to AC-45, NFR-4
- **Skills:** backend-onion-architecture, typescript-expert
- **Insights:** `server/docs/insights.md:95` (only these names are purity-gated)
- **Owner:** implementer
- **Depends on:** 1
- **Done when:** `cd server && pnpm arch:check && pnpm typecheck` are green.

### Step 8 — Pure input selection and grounding
- **Files:** `server/src/modules/brief/helpers.ts` (NEW)
- **Change:** pure functions, with no imports beyond the domain ring:
  - `capBody(body)` cuts at 8,000 characters and reports `truncated`.
  - `intentMissing(intent, prHeadSha)`:
    - null → "no intent derived for this PR";
    - SHA differs or is null → "intent is stale (derived for <sha7>)".
  - `blastMissing(map | null)`: null → "blast radius unavailable"; `degraded` → "blast radius degraded (<reason|unknown>)".
  - `collectBriefDocPaths(owners)` orders agents by name ascending (code-unit sort), then `createdAt` ascending (OQ-3).
    - Within each agent: its own paths ascending, then each enabled skill by link `order` ascending (ties by skill id), with each skill's paths ascending.
    - A path seen before is skipped (first position wins).
    - Disabled agents and skills are never passed in.
  - `applyDocBudget(planned, reads)` keeps whole documents in order. It skips a document that would push the running ceil(chars/4) total above 20,000, and continues with the next one. It returns `sent[]` plus the budget and not-found missing reasons, or "no project context documents attached" when `planned` is empty.
  - `applyDiffBudget(files)` sends patches in file order until the next patch would push the total above 60,000 characters. Every later file goes without a patch. It returns `{files, withheld}` and "diff truncated (N files)", where N counts only withheld patches (Requirements review).
  - `allowedPaths(files, blast)` = changed paths ∪ every `downstream[].callers[].file`. `callerLines(blast)` maps a path to its set of caller lines.
  - `parseRefPath(ref)` = the text before a valid `:<start>[-<end>]` suffix, else the whole string.
  - `newSideRanges(patch)` parses the hunk headers.
  - `groundBrief(output, ctx)` applies:
    - drop refs whose path is not allowed;
    - drop risks left with no ref;
    - drop focus items whose file is not allowed;
    - clamp a focus line outside the patch's new-side ranges to the first range's start (changed file with a patch only);
    - drop a blast-only focus item whose line matches no caller line;
    - then cap at 6 risks and 10 focus items, in model order.
    - It returns `{risks, review_focus, dropped: {fileRefs, risks, focus}}`.
- **Satisfies:** AC-17, AC-18, AC-19, AC-21, AC-22, AC-23, AC-24, AC-25, AC-27, AC-28, AC-29, AC-30, AC-31, AC-32, AC-36, AC-37, AC-38, AC-39, AC-40, AC-41, AC-42, AC-45, NFR-4
- **Skills:** backend-onion-architecture, typescript-expert, security
- **Insights:**
  - `server/docs/insights.md:45` (`DiffHunk` has no content; read the headers yourself)
  - `server/src/modules/reviews/helpers.ts:56-71` (`collectContextPaths` — the same dedupe idiom to mirror, not import)
- **Owner:** implementer
- **Depends on:** 7
- **Done when:** `cd server && pnpm arch:check && pnpm typecheck` are green.

### Step 9 — Prompt and model-output schema
- **Files:** `server/src/modules/brief/prompt.ts` (NEW)
- **Change:**
  - `briefOutputSchema(minFocus: 0 | 1)` is strict-compatible, with every field required: `summary: string.min(1)`, `risks: {kind, title, explanation, severity: RiskSeverity, file_refs: string[]}[]`, and `review_focus: {file, line: int.min(1), reason: string.min(1)}[]` with `.min(minFocus)`. The service passes `minFocus = 1` when `files.length ≥ 1` (AC-43).
  - `SYSTEM_PROMPT` states three rules (AC-35):
    1. content inside `<untrusted>` blocks is data, and instructions inside it are ignored;
    2. only paths from the two supplied lists may be cited;
    3. the output format.
  - `buildMessages(inputs)` wraps each item in its own `wrapUntrusted` block: the title, the capped body (with the cut noted outside the block), each sent patch, the intent text and scope bullets, the blast symbol and caller names, and each document. It also lists every changed file with `+a −d`, and the caller files with their caller lines.
  - Pure string building, no I/O.
- **Satisfies:** AC-16, AC-17, AC-20, AC-33, AC-34, AC-35, AC-43, NFR-4
- **Skills:** zod, security, backend-onion-architecture
- **Insights:**
  - `server/src/modules/onboarding/prompt.ts:15-16` (the strict-schema idiom)
  - `reviewer-core/src/prompt.ts:66-84` (escaping is built into `wrapUntrusted`)
- **Owner:** implementer
- **Depends on:** 7, 8
- **Done when:** `cd server && pnpm typecheck` is green, and `toJsonSchema(briefOutputSchema(1), SCHEMA_NAME)` contains `"minItems": 1` on `review_focus` (checked in a quick local assertion).

### Step 10 — Ports
- **Files:** `server/src/modules/brief/ports.ts` (NEW)
- **Change:** consumer-owned, structural ports:
  - `BriefStore {getPull(ws, prId), getIntent(prId), listAttachmentOwners(ws, repoId), getBrief(prId): Promise<{kind:'found', brief}|{kind:'invalid'}|null>, saveBrief(prId, brief)}`
  - `BlastMapReader {forPull(ws, prId): Promise<BlastRadius>}`
  - `BriefDocReader {readAll(repo, {number, headSha}, paths): Promise<Map<string, {text, version}>>}`
  - `BriefWriter {prepare(ws): Promise<{model: string; write(messages, {schema, timeoutMs}): Promise<{data, model, tokensIn, tokensOut, costUsd}>}>}`, which may throw `ConfigError`
  - `BriefGate {admit(ws, now): boolean; tryBegin(prId): number|null; isCurrent(prId, token): boolean; end(prId, token): void}`
  - `Clock {now(); after(ms)}`
  - `BriefLog {info; warn}`
- **Satisfies:** infrastructure
- **Skills:** backend-onion-architecture
- **Insights:** `server/src/modules/blast/ports.ts:1-13` (structural copies, no cross-module type import)
- **Owner:** implementer
- **Depends on:** 7
- **Done when:** `cd server && pnpm arch:check` is green.

### Step 11 — Brief repository
- **Files:** `server/src/modules/brief/repository.ts` (NEW)
- **Change:** `BriefRepository implements BriefStore` provides:
  - `getPull`: `pull_requests ⨝ repos`, scoped by `pull_requests.workspace_id` (pattern `server/src/modules/blast/repository.ts:14-35`), plus `pr_files` (path, additions, deletions, patch) read exactly as `pulls/repository.ts:221-228`.
  - `getIntent`: `pr_intent` by `pr_id`, mapped to `{intent, in_scope, out_of_scope, head_sha}`.
  - `listAttachmentOwners`: enabled agents of the workspace with their repo-scoped `agent_context_attachments`, plus linked skills (`agent_skills.order`, `skills.enabled`) with their repo-scoped `skill_context_attachments`. The pattern is `reviews/repository/context.repo.ts:12-51`.
  - `getBrief`: `PrBrief.safeParse(row.json)` → found, invalid or null.
  - `saveBrief`: upsert on `pr_id` (`onConflictDoUpdate`, `set: {json}`).
- **Satisfies:** AC-9, AC-10, AC-11, AC-13, AC-16, AC-17, AC-23, OQ-6
- **Skills:** drizzle-orm-patterns, backend-onion-architecture
- **Insights:**
  - `server/src/modules/reviews/docs/insights.md:73` (query other modules' tables here)
  - `server/src/modules/pulls/docs/insights.md:42` (`pr_files` may be newer than `head_sha`)
- **Owner:** implementer
- **Depends on:** 10
- **Done when:** `cd server && pnpm arch:check && pnpm typecheck` are green.

### Step 12 — Brief service: read and generate
- **Files:** `server/src/modules/brief/service.ts` (NEW)
- **Change:** `BriefService(deps)` has two use cases.
  - **`getBrief(ws, prId)`:**
    1. A missing PR throws `NotFoundError`.
    2. `found` → the brief; `invalid` → `log.warn` one line with `prId`, then return null; null → null.
    3. It never calls the writer.
  - **`generate(ws, prId)`:**
    1. 404 check.
    2. `gate.admit(ws, now)`, else `RateLimitError`.
    3. `gate.tryBegin(prId)`, else `ConflictError`.
    4. Race `build()` against `clock.after(BRIEF_TIMEOUT_MS)`. A lost race throws `ExternalServiceError('PR brief generation timed out')`.
    5. `finally gate.end`.
  - **`build()`:**
    1. Read intent, blast and attachment owners in parallel. A thrown `blast.forPull` becomes null + "blast radius unavailable".
    2. Read the planned documents (`docs.readAll` errors → an empty map).
    3. Apply both budgets.
    4. `writer.prepare(ws)`, then one `write` with `timeoutMs` = the remaining time. Every non-`ConfigError` failure becomes `ExternalServiceError('PR brief generation failed')` with no details.
    5. `groundBrief`.
    6. Assemble the `PrBrief`: `history: {history: []}`, `head_sha: pull.headSha`, `generated_at: now`, `model: result.model`, and cost and tokens from the result.
    7. Store **only if** `gate.isCurrent(prId, token)`.
    8. Log one line: `{prId, model, tokensIn, tokensOut, costUsd, missing: sources[], dropped}`. A failure logs `{prId, model, outcome}` only — never body, patch, document or error text.
    9. Return the stored brief.
- **Satisfies:** AC-9, AC-10, AC-11, AC-12, AC-13, AC-14, AC-15, AC-17, AC-18, AC-19, AC-20, AC-21, AC-22, AC-26, AC-28, AC-29, AC-30, AC-32, AC-44, AC-45, AC-46, AC-47, AC-48, AC-49, NFR-2, NFR-3, NFR-5, NFR-9, OQ-6
- **Skills:** backend-onion-architecture, security
- **Insights:**
  - `server/src/modules/onboarding/docs/insights.md:12` (a late result must not store; keep the race outside `build`)
  - `server/docs/insights.md:74` (timeouts do not abort)
  - `server/docs/insights.md:124` (never leak a rejection)
  - `server/docs/insights.md:27` (per-process gate)
- **Owner:** implementer
- **Depends on:** 3, 8, 9, 10
- **Done when:** `cd server && pnpm arch:check && pnpm typecheck` are green. `service.ts` imports no `Container`, `drizzle-orm`, `fastify`, adapter or `node:*`.

### Step 13 — Composition: model writer, gate, clock
- **Files:** `server/src/modules/brief/compose.ts` (NEW)
- **Change:**
  - `LlmBriefWriter.prepare(ws)` calls `container.featureModel(ws, 'risk_brief')`, then `container.llm(choice.provider)`, which throws `ConfigError`. `write` calls `llm.completeStructured({ model, schema, schemaName: SCHEMA_NAME, messages, temperature: 0, maxTokens: MAX_OUTPUT_TOKENS, timeoutMs, reasoning: { enabled: false } })`, with **no** `singleAttempt`, so the adapter's re-ask stays (NFR-3).
  - `InMemoryBriefGate`:
    - a per-workspace sliding window that counts every admitted POST and prunes by age;
    - per-PR tokens.
    - A local copy of the pattern in `server/src/modules/onboarding/compose.ts:84-115`, which cannot be imported.
  - A clock with `after(ms)`.
  - `makeBriefService(container, log)` wires:
    - `store: new BriefRepository(container.db)`;
    - `blast: container.blastReader(log)`;
    - `docs: new GitContextDocReader(container)` from `../_shared/context-doc-reader.js`;
    - the writer, gate, clock and log.
  - Add port-shape `Assert<…>` types as in `onboarding/compose.ts:25-29`.
- **Satisfies:** AC-12, AC-26, AC-47, AC-48, AC-49, NFR-3, NFR-5
- **Skills:** backend-onion-architecture
- **Insights:**
  - `server/docs/insights.md:60` (`reasoning: {enabled:false}`)
  - `server/src/modules/conventions/docs/insights.md:8` (`container.featureModel`)
- **Owner:** implementer
- **Depends on:** 4, 5, 11, 12
- **Done when:** `cd server && pnpm arch:check && pnpm typecheck` are green, with no baseline change.

### Step 14 — Routes and registration
- **Files:**
  - `server/src/modules/brief/routes.ts` (NEW)
  - `server/src/modules/index.ts`
- **Change:**
  - `GET /pulls/:id/brief` uses `{params: IdParams, response: {200: PrBriefResponse}}` and calls `service.getBrief`.
  - `POST /pulls/:id/brief` uses `{params: IdParams, response: {200: PrBrief}}` and calls `service.generate`.
  - Both read the workspace via `getContext` (`server/src/modules/AGENTS.md:14-16`). No `reply.code`.
  - Register `brief` in `modules/index.ts:29-43`.
- **Satisfies:** AC-9, AC-10, AC-11, AC-14, AC-15
- **Skills:** fastify-best-practices, backend-onion-architecture
- **Insights:** `client/AGENTS.md:33` (an empty-body POST must carry no JSON content-type — the client side of this route)
- **Owner:** implementer
- **Depends on:** 13
- **Done when:** both packages' gates are green, and under `pnpm dev`, `curl -s localhost:3001/pulls/<#482 id>/brief` returns the seeded brief after Step 15. Do **not** POST against #483 on the dev DB (AC-83).

### Step 15 — Seed a cached brief for PR #482
- **Files:**
  - `server/src/db/seed-fixtures.ts`
  - `server/src/db/seed.ts`
- **Change:**
  - Add `PR_482_BRIEF: PrBrief` (type import) to `seed-fixtures.ts`, built on the facts in `seed.ts:149-189`:
    - `summary`: the seeded review's theme;
    - `intent: null`;
    - `blast`: the degraded `no_data` map (`changed_symbols: []`, `downstream: []`, summary `"0 symbols · 0 callers · 0 endpoints · 0 crons"`, `degraded: true`, `reason: 'no_data'`);
    - three risks with refs to changed files (e.g. `src/config.ts:12`, `src/api/users.ts:45-52`, `src/middleware/ratelimit.ts`);
    - three focus items, the first `{file: 'src/config.ts', line: 12, …}`;
    - `missing` entries for intent, blast (`no_data`) and specs;
    - `head_sha: 'a1b2c3d4e5f6'` (`seed.ts:117`), `model: 'seed'`, `cost_usd`, `tokens_in` and `tokens_out` null, `history: {history: []}`.
  - In `seed.ts`, after the #482 block (`:189`), select `pr_brief` by `pr.id`, and insert only when it is absent.
- **Satisfies:** AC-84, AC-85
- **Skills:** drizzle-orm-patterns, zod
- **Insights:**
  - `server/docs/insights.md:42` (seeding is by name; this one is by `pr_id`)
  - `server/docs/insights.md:33` (the #482 seed's file set)
  - `e2e/docs/insights.md`, entry "The hermetic seed has no repo-intel index…" (`no_data` is the honest blast state)
- **Owner:** implementer
- **Depends on:** 1
- **Done when:** `cd server && pnpm typecheck` is green. Running `pnpm db:seed` twice leaves exactly one `pr_brief` row for #482 (`docker exec devdigest-postgres psql -U devdigest -d devdigest -tc "select count(*) from pr_brief"`, `docs/insights.md:75`).

### Step 16 — Client query hooks
- **Files:**
  - `client/src/lib/hooks/brief.ts` (NEW)
  - `client/src/lib/hooks/index.ts`
- **Change:**
  - `usePrBrief(prId)`: key `["pr-brief", prId]`, `api.get<PrBrief | null>`, enabled when `prId`.
  - `useGeneratePrBrief(prId)`: `api.post<PrBrief>` with no body. `onSuccess` calls `qc.setQueryData(["pr-brief", prId], data)`. An error never touches the cache (AC-66).
  - Add `export * from "./brief"` to the documented barrel (`index.ts:13`).
- **Satisfies:** AC-53, AC-55, AC-56, AC-64, AC-66
- **Skills:** react-best-practices, frontend-ui-architecture
- **Insights:** `client/docs/insights.md:45` (type-only shared imports)
- **Owner:** implementer
- **Depends on:** 2
- **Done when:** `cd client && pnpm typecheck && pnpm arch:check` are green.

### Step 17 — Brief copy
- **Files:** `client/messages/en/brief.json`
- **Change:**
  - Replace `unavailableHint` (`:12`) with copy about generating a brief.
  - Keep `noRisks` (`:8`) for AC-73, and keep `why`.
  - Add keys for:
    - the Generate button, "Regenerate brief" and "Retry";
    - the generation error;
    - "Missing data" and the four source labels;
    - "Risk areas" and the expand / collapse labels;
    - "Review focus — read these first ({count})" and its empty line;
    - "Generated {time} · {model}";
    - "Stale — generated for {sha}".
  - `prReview.overview.prBrief` (`client/messages/en/prReview.json:139`) stays the section title.
- **Satisfies:** NFR-8 (and copy for AC-50 to AC-74)
- **Skills:** next-best-practices
- **Insights:** `client/docs/insights.md:88` (grepping for unused keys is unreliable; do not delete `block.*` / `noHistory`)
- **Owner:** implementer
- **Depends on:** nothing
- **Done when:** the JSON parses, and `cd client && pnpm test` still passes.

### Step 18 — Files changed target file: URL, expand, scroll
- **Files:**
  - `client/src/components/diff-viewer/DiffViewer/DiffViewer.tsx`
  - `client/src/components/diff-viewer/FileCard/FileCard.tsx`
  - `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/DiffTab.tsx`
  - `client/src/app/repos/[repoId]/pulls/[number]/page.tsx`
- **Change:**
  - `DiffViewer` gets `targetPath?: string | null` and passes `isTarget={f.path === targetPath}`.
  - `FileCard`:
    - starts open when auto-expand applies **or** `isTarget`;
    - an effect calls `setOpen(true)` and `rootRef.scrollIntoView({block: "start"})` when `isTarget` turns true;
    - its root carries `data-file-path` and `data-open`.
  - `DiffTab` gets `targetFile` and passes it to every `DiffViewer` (`:187`, `:192`).
  - `page.tsx` reads `search.get("file")` and passes it to `DiffTab`.
    - `openFile(path)` replaces `tab=diff&file=<path>` in one `router.replace` (the multi-key form of `setParam`, `:69-75`).
    - `setTab` clears `file`.
    - `pr.files` and `openFile` are passed to `OverviewTab`.
- **Satisfies:** AC-76, AC-77, AC-78
- **Skills:** frontend-ui-architecture, react-best-practices, next-best-practices
- **Insights:**
  - `client/docs/insights.md:13` (small files auto-open)
  - `client/docs/insights.md:79` (the page scrolls inside `main`)
  - `client/docs/insights.md:121` (`page.tsx` is not thin; add nothing beyond the wiring)
- **Owner:** implementer
- **Depends on:** nothing
- **Done when:** `cd client && pnpm typecheck && pnpm arch:check && pnpm test` are green. Under `pnpm dev`, opening `?tab=diff&file=src%2Fconfig.ts` on #482 scrolls to that file.

### Step 19 — Slots on `VerdictBanner` and `IntentCard`
- **Files:**
  - `client/src/app/repos/[repoId]/pulls/[number]/_components/VerdictBanner/VerdictBanner.tsx`
  - `…/VerdictBanner/styles.ts`
  - `client/src/app/repos/[repoId]/pulls/[number]/_components/IntentCard/IntentCard.tsx`
- **Change:**
  - `VerdictBanner`:
    - `verdict: Verdict | null`. With null, it hides the verdict label, the counts badge and the score, and shows a neutral icon.
    - New optional `actions?: ReactNode` sits beside the score column, and `meta?: ReactNode` sits under the summary next to the `run` cost line (`:54-63`).
    - The existing call site (`ReviewRunAccordion.tsx:144-157`) is unchanged.
  - `IntentCard`: new optional `footer?: ReactNode`, rendered at the bottom of the empty and the loaded card (`:40-53`, `:83-153`).
- **Satisfies:** AC-57, AC-58, AC-59, AC-60, AC-61, AC-62, AC-63, AC-68 (slots)
- **Skills:** react-best-practices, frontend-ui-architecture
- **Insights:**
  - `docs/insights.md:18` (the `run` prop history)
  - `client/docs/insights.md:85` (`Badge` drops `aria-label`)
- **Owner:** implementer
- **Depends on:** nothing
- **Done when:** `cd client && pnpm typecheck && pnpm test` are green, and `VerdictBanner.test.tsx` and `IntentCard.test.tsx` pass unchanged.

### Step 20 — Brief components and pure helpers
- **Files:** under `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/`:
  - `helpers.ts` (NEW)
  - `_components/PrBriefSection/{PrBriefSection.tsx, styles.ts, index.ts}` (NEW)
  - `_components/RiskAreas/{RiskAreas.tsx, constants.ts, styles.ts, index.ts}` (NEW)
  - `_components/ReviewFocus/{ReviewFocus.tsx, styles.ts, index.ts}` (NEW)
- **Change:**
  - **`helpers.ts`:**
    - `parseRefPath`;
    - `newestReviewSummary(reviews)` → `{verdict, summary?, findingsCount, blockers, score} | null`;
    - `isBriefStale(brief, headSha)`;
    - `shortSha`;
    - `focusTarget(item, changedPaths, repoFullName, headSha)` → `tab | github(url via githubBlobUrl) | text`.
  - **`PrBriefSection`** renders:
    - the "PR Brief" `SectionLabel`;
    - while the brief is loading, a skeleton;
    - with no brief, the Generate `Button`;
    - with a brief, `../../../VerdictBanner` with the brief summary, the newest review's verdict, counts and score, `run={cost/tokens}`, `meta` = "Generated <relativeTime(useNow)> · model" + the stale badge, and `actions` = an icon-only `Button` (`aria-label` "Regenerate brief", `loading`);
    - a "Missing data" list;
    - an inline error with Retry on failure, while the previous brief stays.
    - Both buttons are disabled while pending, and the spinner shows only on the clicked button.
  - **`RiskAreas`:**
    - severity → `var(--crit)`, `var(--warn)` or `var(--info)`;
    - each chip is a `<button aria-expanded>` showing the title and the first ref;
    - expanding shows the explanation and all refs;
    - "No notable risks flagged." when the list is empty;
    - it renders bare (for the Intent footer) or inside its own `Card`.
  - **`ReviewFocus`:** a full-width `Card` with the title and count. Each item reads `<file>:<line> — <reason>` and is a `<button>` → `onOpenFile`, an `<a target=_blank rel="noopener noreferrer">` to GitHub, or plain text.
  - All model text is rendered as text nodes. Never `Markdown` or `dangerouslySetInnerHTML`.
- **Satisfies:** AC-50, AC-51, AC-53, AC-54, AC-55, AC-57, AC-58, AC-59, AC-60, AC-61, AC-62, AC-63, AC-64, AC-65, AC-66, AC-67, AC-70, AC-71, AC-72, AC-73, AC-74, AC-75, AC-76, AC-79, AC-80, NFR-6, NFR-7, NFR-8
- **Skills:** frontend-ui-architecture, react-best-practices, next-best-practices, security
- **Insights:**
  - `client/docs/insights.md:54` (sibling imports only by the bare folder name)
  - `client/docs/insights.md:69` (`useNow`)
  - `client/docs/insights.md:85` (raw `<a>` for an accessible name)
  - `server/src/modules/blast/docs/insights.md:26` (caller lines vs the head SHA)
- **Owner:** implementer
- **Depends on:** 16, 17, 19
- **Done when:** `cd client && pnpm typecheck && pnpm arch:check` are green.

### Step 21 — Compose the Overview tab
- **Files:** `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/OverviewTab.tsx`, `…/OverviewTab/styles.ts`
- **Change:**
  - `OverviewTab` gets `files: PrFile[]` and `onOpenFile`, and calls `usePrBrief` and `usePrReviews`. It renders, in order:
    1. `PrBriefSection`;
    2. `IntentCard footer={<RiskAreas/>}` when `brief?.intent` is set, else `<RiskAreas card/>` when a brief exists, else `IntentCard` as today;
    3. the divider;
    4. `BlastRadiusCard`, unchanged;
    5. `ReviewFocus`, only when a brief exists;
    6. the description, as today.
  - The stacked layout is kept (Recommendation 3).
- **Satisfies:** AC-50, AC-52, AC-56, AC-68, AC-69, AC-74
- **Skills:** frontend-ui-architecture, react-best-practices
- **Insights:** none apply (checked `client/src/app/repos/[repoId]/pulls/[number]/AGENTS.md`)
- **Owner:** implementer
- **Depends on:** 18, 20
- **Done when:** `cd client && pnpm arch:check && pnpm typecheck && pnpm test` are green. Under `pnpm dev`, #482 shows the seeded brief in both themes and #483 shows "Generate brief".

### Step 22 — Server pure-unit tests from the AC
- **Files:**
  - `server/test/brief-contract.test.ts` (NEW): AC-1 to AC-8. AC-8 compares the bytes of both `brief.ts` files with `node:fs`.
  - `server/test/brief-helpers.test.ts` (NEW): AC-17 to AC-19, AC-21 to AC-25, AC-27 to AC-32, AC-36 to AC-42, NFR-4.
  - `server/test/brief-prompt.test.ts` (NEW): AC-16, AC-20, AC-33 to AC-35, and AC-43 via `toJsonSchema`.
  - `server/test/seed-fixtures.test.ts`: AC-84. `PR_482_BRIEF` parses, its focus file is a seeded changed file, and its `head_sha` equals the seeded one.
- **Change:** tests derived from the AC text, with no Docker.
- **Satisfies:** AC-1 to AC-8, AC-16 to AC-25, AC-27 to AC-43, AC-84, NFR-4
- **Skills:** zod, security
- **Insights:** `server/docs/insights.md:45` (build hunk fixtures from header text)
- **Owner:** test-writer
- **Depends on:** 15
- **Done when:** `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'` is green.

### Step 23 — Brief service unit tests with fakes
- **Files:** `server/test/brief-service.test.ts` (NEW)
- **Change:** a fake store, blast, document reader, writer, gate, clock and log cover:
  - a GET makes no writer call (AC-9, AC-15);
  - 404 (AC-11);
  - exactly one `write` (AC-12, NFR-3);
  - replace-and-return (AC-13, AC-14);
  - intent and blast branches, including a blast throw (AC-17 to AC-22);
  - document order through the reader (AC-26, AC-28 to AC-30);
  - the drop log (AC-44) and empty grounding (AC-45);
  - failure keeps the stored brief, and no `raw` or text reaches the error (AC-46);
  - the deadline through the fake clock: the late result never stores (AC-47);
  - a 409 while in flight (AC-48);
  - a 429 on the sixth POST in a minute across two PRs (AC-49);
  - an invalid stored body → null plus one warn line (OQ-6);
  - one log line with the NFR-9 fields and no body, patch or document text (NFR-9).
- **Satisfies:** AC-9 to AC-15, AC-17 to AC-22, AC-26, AC-28 to AC-30, AC-44 to AC-49, NFR-2, NFR-3, NFR-5, NFR-9
- **Skills:** backend-onion-architecture
- **Insights:** `server/src/modules/onboarding/docs/insights.md:28` (the fake writer must not reject by default; time is taken at request)
- **Owner:** test-writer
- **Depends on:** 13
- **Done when:** the unit suite is green.

### Step 24 — Server integration tests (Docker)
- **Files:** `server/test/brief.it.test.ts` (NEW)
- **Change:** `buildApp` with `overrides.llm = { openai: new MockLLMProvider('openai', { structuredBySchema: { pr_brief: … } }), openrouter: … }`, a `github` mock and a `MockGitClient` subclass whose reads throw for unknown paths. Over a real Postgres:
  - `GET` → null on #483 (AC-10);
  - a foreign workspace → 404 (AC-11);
  - `POST` → 200 with the stored brief, and exactly one `completeStructured` with the `risk_brief` model (AC-12 to AC-14);
  - a second POST replaces the brief (AC-13);
  - enabled and disabled agents and skills decide which documents are sent (AC-23);
  - a mock that throws keeps the old brief (AC-46);
  - a deferred mock → 409 (AC-48);
  - the sixth POST → 429 (AC-49);
  - a corrupt `pr_brief.json` → null (OQ-6);
  - `seed()` twice → one #482 brief, and a regenerated #482 brief is not replaced by a re-seed (AC-84, AC-85);
  - a 20-run timing of `GET` on #482 recorded for NFR-1.
- **Satisfies:** AC-9 to AC-14, AC-23, AC-46, AC-48, AC-49, AC-84, AC-85, NFR-1 (indicative)
- **Skills:** drizzle-orm-patterns, fastify-best-practices
- **Insights:**
  - `server/docs/insights.md:115` (mock every provider, and GitHub)
  - `server/docs/insights.md:89` (the `MockLLMProvider('openai')` idiom)
  - `server/docs/insights.md:21` (subclass `readFile` to throw)
- **Owner:** test-writer
- **Depends on:** 15
- **Done when:** `cd server && pnpm exec vitest run .it.test` is green (**needs Docker**).

### Step 25 — Client tests from the AC
- **Files:**
  - `…/OverviewTab/OverviewTab.test.tsx` (NEW)
  - `…/OverviewTab/helpers.test.ts` (NEW)
  - `…/OverviewTab/_components/{PrBriefSection,RiskAreas,ReviewFocus}/*.test.tsx` (NEW)
  - `…/VerdictBanner/VerdictBanner.test.tsx`
  - `…/DiffTab/DiffTab.test.tsx`
  - `client/src/components/diff-viewer/FileCard` test (NEW)
- **Change:** with the hooks mocked (`client/docs/insights.md:125`), cover:
  - the section order and title (AC-50, AC-74);
  - no brief → Generate, and the cards as today (AC-51, AC-52);
  - a click triggers the mutation, the buttons disable, and the spinner shows on the clicked one (AC-53, AC-54, AC-64);
  - success renders (AC-55);
  - no POST on mount (AC-56);
  - the header contents and their absence (AC-57 to AC-63);
  - the error with Retry, while the previous brief stays (AC-65, AC-66);
  - missing data (AC-67);
  - intent placement (AC-68, AC-69);
  - chips (AC-70 to AC-73);
  - focus items: tab switch, GitHub link and plain text (AC-75, AC-76, AC-79);
  - the target file over 200 lines is forced open and `scrollIntoView` is called (AC-77);
  - `openFile` writes `file=` (AC-78);
  - `<script>` / `**md**` text renders literally (AC-80);
  - native buttons and links with `tabIndex ≥ 0` (NFR-6);
  - every rendered string comes from `brief.json` (NFR-8).
- **Satisfies:** AC-50 to AC-80, NFR-6, NFR-8
- **Skills:** react-testing-library
- **Insights:**
  - `client/docs/insights.md:13` (a small fixture is already open)
  - `client/docs/insights.md:16` (fallback tests that cannot fail)
  - `client/docs/insights.md:76` (keyboard tests are structural; fix `now`)
  - `client/docs/insights.md:91` (`arch:check` covers tests)
- **Owner:** test-writer
- **Depends on:** 21
- **Done when:** `cd client && pnpm test && pnpm arch:check` are green.

### Step 26 — e2e flows over seeded data
- **Files:**
  - `e2e/specs/11-pr-brief.flow.json` (NEW)
  - `e2e/specs/12-pr-brief-empty.flow.json` (NEW)
  - `e2e/README.md`
- **Change:**
  - **Flow 11:**
    1. Open #482 via the `--exact` row click.
    2. `wait --text` on "PR BRIEF", the seeded summary, the risk-areas heading in its rendered casing, and the first risk title.
    3. `scroll down 700 --selector main`, then `wait --text` on the review-focus title in its rendered casing.
    4. `eval "!document.body.innerText.includes('Generate brief')"` with `stdoutIncludes: "true"` (AC-81).
    5. `find role button click --name "src/config.ts:12"`.
    6. `wait --url "tab=diff"`, then `wait --url "file=src%2Fconfig.ts"`.
    7. `eval` of `[data-file-path="src/config.ts"]`'s `data-open` with `stdoutIncludes: "true"` (AC-82).
  - **Flow 12:** open #483 ("Add coupon discount calculation + tests", `--exact`), then `wait --text` on "PR BRIEF" and "Generate brief" (AC-83).
  - Before writing a `wait --text`, grep each component for `textTransform`.
  - List both flows in the README.
- **Satisfies:** AC-81, AC-82, AC-83
- **Skills:** none applicable (agent-browser JSON flows)
- **Insights:** `e2e/docs/insights.md`, entries "`find text "X" click` can silently click…", "`agent-browser wait --url` takes a substring…", "`find <locator> click` reports `✓ Done`…", "`wait --text` and `find text` read different DOM representations…", "A manual smoke `POST /repos/:id/onboarding/generate`…"
- **Owner:** test-writer
- **Depends on:** 21, 15
- **Done when:** `cd e2e && npm run e2e:hermetic` passes every flow, including 11 and 12 (**needs Docker** and agent-browser).

## Batches
| Batch | Steps | Why together | Gate at the end |
|---|---|---|---|
| B1 — contract + shared infrastructure | 1, 2, 3, 4, 5, 6 | Both contract copies plus every cross-module seam the module needs, before any consumer exists | `cd server && pnpm arch:check && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts'`; `cd client && pnpm arch:check && pnpm typecheck`; the `diff` of the two `brief.ts` files is empty |
| B2 — brief module + seed | 7, 8, 9, 10, 11, 12, 13, 14, 15 | One module built from the centre outwards, then its seed | `cd server && pnpm arch:check && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts'`; `pnpm db:seed` run twice leaves one #482 brief; a GET `curl` of #482 |
| B3 — studio | 16, 17, 18, 19, 20, 21 | One package; the page wiring, shared diff viewer and Overview change together | `cd client && pnpm arch:check && pnpm typecheck && pnpm test`; a manual look at #482 / #483 in both themes |

Steps 22–26 belong to `test-writer` and run after B3, in order.

## Requirements coverage
| Requirement | Steps | Proved by |
|---|---|---|
| AC-1 | 1, 2 | Step 22 `brief-contract.test.ts` |
| AC-2 | 1, 2 | Step 22 `brief-contract.test.ts` |
| AC-3 | 1, 2 | Step 22 `brief-contract.test.ts` |
| AC-4 | 1, 2 | Step 22 `brief-contract.test.ts` |
| AC-5 | 1, 2, 12 | Step 22; Step 24 (stored metadata) |
| AC-6 | 1, 2, 8 | Step 22 (regex + grounding) |
| AC-7 | 1, 12 | Step 23 (`history` empty) |
| AC-8 | 2 | Step 22 byte check; B1 `diff` gate |
| AC-9 | 11, 12, 14 | Steps 23, 24 |
| AC-10 | 11, 14 | Step 24 |
| AC-11 | 11, 12, 14 | Steps 23, 24 |
| AC-12 | 12, 13 | Step 23 (one write); Step 24 (one call, `risk_brief` model) |
| AC-13 | 11, 12 | Steps 23, 24 |
| AC-14 | 12, 14 | Steps 23, 24 |
| AC-15 | 12, 14 | Step 23 (GET never writes); code review: the only call site is `generate` |
| AC-16 | 9, 11 | Step 22 `brief-prompt.test.ts` |
| AC-17 | 8, 9, 12 | Steps 22, 23 |
| AC-18 | 8, 12 | Steps 22, 23 |
| AC-19 | 8, 12 | Steps 22, 23 |
| AC-20 | 5, 9, 12 | Steps 22, 23 |
| AC-21 | 8, 12 | Steps 22, 23 |
| AC-22 | 8, 12 | Steps 22, 23 |
| AC-23 | 8, 11 | Step 22 (helper); Step 24 (enabled flags in the DB) |
| AC-24 | 8 | Step 22 |
| AC-25 | 8 | Step 22 |
| AC-26 | 4, 13 | the existing `test/reviews-project-context.test.ts` (reader); Step 23 (wiring) |
| AC-27 | 8 | Step 22 |
| AC-28 | 8, 12 | Steps 22, 23 |
| AC-29 | 8, 12 | Steps 22, 23 |
| AC-30 | 8, 12 | Steps 22, 23 |
| AC-31 | 8 | Step 22 |
| AC-32 | 8, 12 | Step 22 |
| AC-33 | 9 | Step 22 `brief-prompt.test.ts` |
| AC-34 | 9 | Step 22 |
| AC-35 | 9 | Step 22 |
| AC-36 | 5, 8 | Step 22 |
| AC-37 | 8 | Step 22 |
| AC-38 | 8 | Step 22 |
| AC-39 | 8 | Step 22 |
| AC-40 | 8 | Step 22 |
| AC-41 | 8 | Step 22 |
| AC-42 | 8 | Step 22 |
| AC-43 | 9, 12 | Step 22 (`minItems` in the emitted schema) |
| AC-44 | 12 | Step 23 (log spy) |
| AC-45 | 8, 12 | Step 23 |
| AC-46 | 12 | Steps 23, 24 |
| AC-47 | 12, 13 | Step 23 (fake clock, late result not stored) |
| AC-48 | 3, 12, 13 | Steps 23, 24 |
| AC-49 | 12, 13 | Steps 23, 24 |
| AC-50 | 20, 21 | Step 25 |
| AC-51 | 20 | Step 25; Step 26 flow 12 |
| AC-52 | 21 | Step 25 |
| AC-53 | 16, 20 | Step 25 |
| AC-54 | 20 | Step 25 |
| AC-55 | 16, 20 | Step 25 |
| AC-56 | 16, 21 | Step 25; Step 26 flow 11 |
| AC-57 | 19, 20 | Step 25 |
| AC-58 | 19, 20 | Step 25 |
| AC-59 | 19, 20 | Step 25 |
| AC-60 | 19, 20 | Step 25 |
| AC-61 | 20 | Step 25 |
| AC-62 | 20 | Step 25 |
| AC-63 | 19, 20 | Step 25 |
| AC-64 | 16, 20 | Step 25 |
| AC-65 | 20 | Step 25 |
| AC-66 | 16, 20 | Step 25 |
| AC-67 | 20 | Step 25 |
| AC-68 | 19, 21 | Step 25 |
| AC-69 | 21 | Step 25 |
| AC-70 | 20 | Step 25 |
| AC-71 | 20 | Step 25 |
| AC-72 | 20 | Step 25 |
| AC-73 | 17, 20 | Step 25 |
| AC-74 | 20, 21 | Step 25 |
| AC-75 | 20 | Step 25 |
| AC-76 | 18, 20 | Step 25; Step 26 flow 11 |
| AC-77 | 18 | Step 25 (FileCard > 200 lines); Step 26 flow 11 |
| AC-78 | 18 | Step 25; Step 26 flow 11 |
| AC-79 | 20 | Step 25 |
| AC-80 | 20 | Step 25 |
| AC-81 | 15, 21 | Step 26 flow 11 |
| AC-82 | 15, 18, 21 | Step 26 flow 11 |
| AC-83 | 21 | Step 26 flow 12 |
| AC-84 | 15 | Steps 22, 24 |
| AC-85 | 15 | Step 24 |
| NFR-1 | 11, 14 | manual: 20 × `curl -w '%{time_total}'` of `GET /pulls/<#482>/brief` on the dev stack; p95 ≤ 0.2 s (Step 24 records an indicative figure) |
| NFR-2 | 12 | Step 23 (AC-47) |
| NFR-3 | 12, 13 | Steps 23, 24 |
| NFR-4 | 8, 9 | Step 22 |
| NFR-5 | 12, 13 | Steps 23, 24 |
| NFR-6 | 20 | Step 25 (structural); manual Tab / Enter pass in the browser |
| NFR-7 | 20 | manual: `data-theme="light"` and `"dark"` on #482 |
| NFR-8 | 17, 20 | Step 25; code review (no literals) |
| NFR-9 | 12 | Step 23 (log spy, no content) |

## Skills the implementer must apply
| Path / glob | Skill | Why it applies |
|---|---|---|
| `server/src/vendor/shared/contracts/brief.ts`, `client/src/vendor/shared/contracts/brief.ts`, `server/src/modules/brief/prompt.ts` | zod | New contract and the model-output schema |
| `server/src/modules/brief/**`, `server/src/modules/_shared/context-doc-reader.ts`, `server/src/modules/reviews/compose.ts`, `server/src/platform/{container,errors}.ts` | backend-onion-architecture | A new module, ports and compose; a container delegation; a promoted reader |
| `server/src/modules/brief/repository.ts`, `server/src/db/seed.ts`, `server/src/db/seed-fixtures.ts` | drizzle-orm-patterns | Cross-table reads, an upsert, an idempotent seed insert |
| `server/src/modules/brief/routes.ts` | fastify-best-practices | Params / response schemas, including a nullable 200 |
| `server/src/modules/brief/{helpers,prompt,service}.ts`, `…/OverviewTab/_components/**` | security | Untrusted PR, document and model text; path allow-listing; error-detail hygiene; plain-text rendering; external links |
| `client/src/app/repos/[repoId]/pulls/[number]/**`, `client/src/components/diff-viewer/**`, `client/src/lib/hooks/brief.ts` | frontend-ui-architecture, react-best-practices | New `_components`, slots on existing components, hook placement |
| `client/src/app/repos/[repoId]/pulls/[number]/page.tsx`, `client/messages/en/brief.json` | next-best-practices | `useSearchParams` / `router.replace`; next-intl copy |
| `server/src/modules/brief/AGENTS.md`, `docs/insights.md` | engineering-insights | Module memory and any dead end found while building |
| `server/src/modules/brief/{domain,helpers}.ts` | typescript-expert | Discriminated store results and grounding types |

## Verification
| Command | cwd | Triggered by | Expected |
|---|---|---|---|
| `pnpm arch:check` | `server` | `server/src/**` | No new violations, no re-baselining |
| `pnpm typecheck` | `server` | `server/**/*.ts` | Green (needs `reviewer-core/node_modules`, `docs/insights.md:94`) |
| `pnpm exec vitest run --exclude '**/*.it.test.ts'` | `server` | `server/src/**` | Green; it touches the dev DB (`server/docs/insights.md:55`) |
| `pnpm exec vitest run .it.test` | `server` | Step 24 | Green — **needs Docker** |
| `pnpm db:seed` (twice) | `server` | Step 15 | One #482 `pr_brief` row — **needs Docker** (dev Postgres) |
| `diff server/src/vendor/shared/contracts/brief.ts client/src/vendor/shared/contracts/brief.ts` | repo root | Steps 1–2 | No output |
| `pnpm arch:check` | `client` | `client/src/**` | Zero violations |
| `pnpm typecheck` | `client` | `client/**/*.{ts,tsx}` | Green |
| `pnpm test` | `client` | `client/src/**` | Green |
| `npm run e2e:hermetic` | `e2e` | Step 26 | All flows pass, including 11 and 12 — **needs Docker** and agent-browser |

No migration is generated or run: there is no schema change. `reviewer-core` is not touched.

## Risks, dead ends already recorded
- **The abandoned call keeps running after a 90 s timeout and spends money unseen** (`server/docs/insights.md:74`). Recommendation 1 removes this.
- **The per-process gate and rate window.** The MCP process does not generate briefs, so this is harmless today (`server/docs/insights.md:27`).
- **A dropped rejection crashes the API** (`server/docs/insights.md:124`). The abandoned `build()` promise needs a terminal `.catch` once the race is lost.
- **The strict schema with `minItems`.** If a provider rejects it, every generation fails as AC-46. Check with one real call after B2.
- **`pr_files` vs `head_sha`.** Files may come from a newer head than the stored `head_sha` (`server/src/modules/pulls/docs/insights.md:42`). The brief and its stale badge use `pull_requests.head_sha`, consistently with the page.
- **Blast-only GitHub links** use the brief's head SHA, while caller lines come from the index SHA, so they may be off on a stale index (`server/src/modules/blast/docs/insights.md:26`).
- **The promoted reader touches reviews' run path.** It is a move with a re-export; architecture-reviewer should check Step 4.
- **`container.blastReader`** is the first container method that builds a module *service*. It is load-bearing for the module-isolation story.
- **Seeded `pr_brief` rows** now exist in every `seed()`-based integration test. Step 24 generates on #483, never #482.
- **A dev-DB POST on #483** breaks flow 12 outside `e2e:hermetic` (`e2e/docs/insights.md`, entry "A manual smoke `POST /repos/:id/onboarding/generate`…").
- **Uncommitted SPEC-02 work.** The working tree carries it (including `server/src/db/migrations/meta/_journal.json`). This plan adds no migration, so it does not collide, but commit or stash that work before B1.
- **No new dependency.**

## Open questions
- **AC-49 scope** (per workspace vs per PR) and **AC-31 / AC-32 readings** (stop at the first overflow; count only withheld patches): plan defaults, which the user should confirm, or → spec-creator.
- **AC-47 "abort" = abandon** (re-ask kept), or a true abort via `singleAttempt` (Recommendation 1). The user decides.
- **AC-69 replacing the live Intent card** (and its Detect CTA) when `brief.intent` is null is the literal reading. Confirm that this is wanted.
- **Fastify serialising a `null` 200 body** through `PrBriefResponse` (a nullable zod schema) was not verified. Step 24 pins it. If it fails, the route needs a `reply.send(null)`-style fix, not a contract change.
- **agent-browser `eval` with `stdoutIncludes`** for the negative and attribute checks is assumed from `e2e/lib/assert.ts:16` and the eval usage recorded in `e2e/docs/insights.md`. If it does not work, Step 26 falls back to `get count`.
- **OQ-1:** the module spec part is not written by this plan (→ spec-creator after B1).

## Handoff
1. **`implementer`.** Run B1 (Steps 1–6), then a fresh implementer for B2 (Steps 7–15), then a fresh one for B3 (Steps 16–21). Run them in sequence, and each must end on its gate.
2. **`spec-creator`**, after B1: write `server/src/modules/brief/docs/specs/pr-brief.md` (AC-9 to AC-49 verbatim, per OQ-1) and trim `server/docs/specs/pr-brief.md`. Also settle any of the AC-31, AC-32, AC-47, AC-49 or AC-69 readings the user wants changed.
3. **`plan-verifier`**, against this plan's Steps.
4. **`test-writer`** for Steps 22–26, with tests derived from the AC text, not from the code.
5. **`/code-review`** for bugs.
6. **`architecture-reviewer`** on Steps 4, 5, 10–14 and 18–21. It must check:
   - `modules/brief/**` imports no other module folder;
   - blast comes only through `container.blastReader`, and the reader comes from `_shared`;
   - the service takes ports only, and only `repository.ts` touches the DB;
   - routes do parse → one call → return;
   - `prompt.ts` is pure;
   - the client does no cross-route deep imports, and `diff-viewer` stays domain-free;
   - `arch:check` is green in both packages with no baseline change.
7. **`security-review`** on Steps 8, 9 and 12 (untrusted delimiting, path grounding, error details, logging) and Step 20 (plain-text rendering, `rel="noopener noreferrer"` links).
8. **`plan-verifier`** again, against SPEC-03 AC-1 to AC-85 and NFR-1 to NFR-9.
9. **`doc-writer`.** Anchor the AC lines in the overview, the three parts and the new module part; add both routes to `server/README.md` and the client route map; mark SPEC-03 implemented.
10. **`pr-self-review`** last.

## Confidence
Medium-High. Every seam was verified in code: the container delegations, the reader, the gate pattern and the seed position. The remaining doubt is about readings, not mechanics. Four things would raise it to High:
- the user confirming the AC-47, AC-49 and AC-31/32 defaults;
- one real `risk_brief` call accepting `minItems`;
- confirming that a nullable 200 serialises as `null`.

Insight to record via `engineering-insights` (in `server/docs/insights.md`): `pr_files` has no position column, so "the PR's file order" is whatever the no-`ORDER BY` read returns after `replaceFiles`' delete and reinsert. Any feature that promises file order is relying on heap order.

## Decisions (2026-10-03)
The user approved the plan and delegated the open choices ("where in doubt, take the recommended option"). Resolved as follows:
- **AC-47:** keep the re-ask. "Abort" means the POST stops waiting at 90 s, the in-flight slot is released and a per-PR token blocks the late store. Recommendation 1 is **rejected**: the user's brief names the `completeStructured` re-ask as the intended behaviour, and the spec's edge case keeps it.
- **AC-49:** 5 per minute per workspace across all PRs, checked before the in-flight flag (plan default).
- **AC-31 / AC-32:** stop at the first patch that would cross the budget, and count only patches that existed and were withheld (plan default). Recommendation 4 is **rejected** because it is a spec change.
- **AC-69:** when `brief.intent` is null, the Risk areas card replaces the Intent card (literal reading, plan default).
- **Recommendation 2: accepted.** The changed-file and caller-file path lists are wrapped in untrusted blocks too.
- **Recommendation 3: accepted.** Intent and Blast Radius sit side by side in two columns, as in the mockup ("Intent and Blast radius stand next to each other in the brief"), and stack below the `lg` breakpoint. Step 21 implements this.
- **OQ-1:** spec-creator writes the module part after B1 (Handoff 2).
- **Batch order:** B1, then B2 (server) and B3 (client) in parallel. B3 depends only on the B1 contract copies and the HTTP shape fixed in Step 14's spec, not on B2's code.
- **AC-32 wording (decided after the tests):** "diff truncated (N files)" is a template. N = 1 renders as "diff truncated (1 file)" (`missingDiffTruncated`, `server/src/modules/brief/constants.ts:32`). The unit test pins the singular.

## Review fixes (2026-10-03)
These came from the architecture review and the bug/security review, and were applied after B3:
- **AC-47:** a deadline that fires while the save is under way now awaits the save and returns the committed brief. The `committing` and `abandoned` flags are set synchronously alongside `isCurrent`.
- **Docs read:** it runs under its own 15 s sub-deadline (`DOC_READ_TIMEOUT_MS`). Losing that race counts as an empty map, which yields AC-29 "not found" entries.
- **Gate:** `InMemoryBriefGate` moved to `brief/gate.ts`. Memory is bounded: at most 6 timestamps per workspace, and expired keys are swept. The service tests use the real gate.
- **Working tree constant:** `WORKING_TREE_VERSION` is exported from `_shared/context-doc-reader.ts`; `reviews/constants.ts#WORKING_TREE` is removed. The `reviews/compose.ts` re-export is dropped.
- **Client:** `useGeneratePrBrief` calls `cancelQueries` before `setQueryData`.
- **Not fixed:** the PR file order is not deterministic. `pr_files` has no position column (see `server/docs/insights.md`), and fixing it needs a migration outside SPEC-03.
