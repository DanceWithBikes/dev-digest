# Subagents

Project-local subagents for dev-digest. One file per agent; the file is the agent's full
prompt, this README is only the map of the set — who does what, what it may touch, and
which artifact it hands back.

Eight of the nine agents form one loop in four bands. **Ask:** researcher answers a
question. **Decide:** spec-creator reviews the request, asks the questions and turns it into
a `SPEC-NN` draft — marking anything still undecided `[NEEDS CLARIFICATION]` instead of
guessing — which the user approves once no marker is left; implementation-planner takes that
approved spec as settled and turns it into an Implementation Plan — it neither reviews nor
writes a spec, and sends a spec that is not ready back to spec-creator. **Build:**
implementer writes the code, test-writer the tests, doc-writer the docs. **Check:**
architecture-reviewer and plan-verifier read the result back. The loop ends there:
verdicts (architecture, security, PR readiness) belong to the review skills
(`pr-self-review`, `code-review`, `security-review`), never to these agents. The two
reviewers return **findings and per-item verdicts with evidence** — neither records a
verdict that gates anything.

The ninth, insights-curator, sits outside the loop and maintains what the loop writes
into: every band hands back a one-line insight, the `engineering-insights` skill appends it
to the nearest of the 15 `docs/insights.md` files, and nobody ever reads those files
together. The curator is that pass.

```
question ──▶ researcher ──▶ report

feature  ──▶ spec-creator ──▶ SPEC-NN draft ──▶ user sets approved
           (review, questions,  (no [NEEDS            │  (only with zero markers)
            markers)             CLARIFICATION] left) │
                  ▲                                   │
                  │ spec not ready /                  │
                  │ spec-code conflict                │
request  ─────────┼──▶ implementation-planner ◀───────┘
                  │    (gate: approved, no markers,
                  └─── no blocking OQ — then plans)
                              │
                              ▼
                       Implementation Plan ──▶ saved by the caller as docs/plans/<feature>/plan.md
                              │
                              ▼
        implementer B1 ──▶ B2 ──▶ … (one fresh agent per batch, never in parallel)
                              │
                              ▼
        plan-verifier, Steps mode ──▶ gaps go back to implementer
                              │
              ┌───────────────┼──────────────────────────┐
              ▼               ▼                          ▼
        test-writer      /code-review         architecture-reviewer
     (steps it owns)       (bugs)        (only if boundaries moved)
              └───────────────┼──────────────────────────┘
                              ▼
        implementer fixes the findings (a fresh run, scope = the findings)
                              │
                              ▼
        plan-verifier, Acceptance mode ──▶ per AC-N / NFR-N Met / Not met
                              │            saved as docs/plans/<feature>/verification.md
                              │            and linked from the PR description
                              ▼
        doc-writer ──▶ anchors every AC-N, Status: implemented
                              │
                              ▼
       pr-self-review (skill, separate context) ──▶ PASS / BLOCKED ──▶ PR

   every band ──▶ "insights to record" ──▶ engineering-insights (skill)
                                                     │
                                                     ▼
                                      15 × docs/insights.md
                                                     │
                            insights-curator ────────┘
                            (3 mechanical fixes applied, the rest proposed)
```

## The SDD pipeline, session by session

| Session | Runs | Ends with |
|---|---|---|
| 1 — Spec | `spec-creator` pass 1 (questions only) → the user answers → `spec-creator` pass 2 (draft) | the user answers every `[NEEDS CLARIFICATION]` (another `spec-creator` pass removes the markers), then reads the draft and sets `Status: approved` by hand — never with a marker left |
| 2 — Plan | one `implementation-planner` on `opus`; `researcher` runs only for questions the planner cannot settle from the repo. Never several planners side by side — their plans contradict each other and have to be merged by hand | the caller saves the report verbatim as `docs/plans/<feature>/plan.md` — a subagent cannot write its own report to a file, and session 3 starts cold |
| 3 — Build | `implementer` per batch from the plan's `## Batches`, strictly one after another → `plan-verifier` (Steps) → `test-writer`, `/code-review`, and `architecture-reviewer` when the plan's Handoff names it → `implementer` on the findings → `plan-verifier` (Acceptance, report saved as `docs/plans/<feature>/verification.md`) → `doc-writer` → `pr-self-review` | an open PR whose description links the verification report |

Why this order:

- **`plan-verifier` runs twice.** Right after the code it is cheap (read-only, `typecheck` + `arch:check` only) and catches a skipped step before tests and reviews are paid for on half a feature. At the end it checks the spec itself — and only then, because the plan's `Proved by` column points at tests that `test-writer` has not written yet.
- **Bugs are `/code-review`'s, not `architecture-reviewer`'s.** The architecture reviewer checks import boundaries and nothing else; run it only when the change adds a module, endpoint, page or moves code between rings.
- **Implementers never run in parallel.** Two of them in one working tree collide on the shared files (both `vendor/shared` copies, `messages/en/*.json`, container wiring, `schema.ts`) and race the server unit suite, which reaps running `agent_runs` rows. A fresh agent per batch keeps the context small without either risk. `test-writer`, `/code-review` and `architecture-reviewer` may run side by side: only `test-writer` writes, and only test files.
- **`doc-writer` closes the spec.** Without it the spec stays `approved` forever, with no `path:line` anchors for the next change to start from.

## The set

| Agent | Responsibility | Model | Tools | Explicitly denied |
|---|---|---|---|---|
| [`implementation-planner.md`](implementation-planner.md) | Takes settled requirements (an approved `SPEC-NN`, a bug, an agreed small change) and turns them into a structured Implementation Plan before any code exists. It does not review or clarify them — it only gates on the spec being approved with no `[NEEDS CLARIFICATION]` marker and no blocking open question, and routes anything else (and any spec/code conflict found while planning) to `spec-creator`. Names packages, onion rings, skills, gates and which `AC-N` each step satisfies. | `opus` | Read, Grep, Glob, Bash, Skill, TodoWrite | No Write/Edit at all; by prompt: no spec work of any kind — never drafts, edits or plans a step that writes a spec or acceptance criteria (spec changes are routed to `spec-creator`); Bash restricted to read commands (no migrations, no `docker compose`, no mutating git, no installs, no redirects) |
| [`implementer.md`](implementer.md) | Executes an already-agreed plan across `client/`, `server/`, `reviewer-core/`, `e2e/`; one plan batch per run; applies the matching skills *before* writing (each once), runs `typecheck` between steps and the full gates once at the end, and fixes what it broke. | `sonnet` | Read, Write, Edit, Grep, Glob, Bash, Skill, TodoWrite | `WebSearch`, `WebFetch` (frontmatter `disallowedTools`); by prompt: hand-editing `server/src/db/migrations/**`, `docker compose down -v`, `git commit/push/checkout/reset/stash`, `gh pr create`, new dependencies without asking, any edit to `docs/specs/` |
| [`researcher.md`](researcher.md) | Read-only investigation — Mode A: how this repo works; Mode B: what upstream docs, changelogs, advisories say. Reports with evidence, never changes anything. | `sonnet` | Read, Grep, Glob, Bash, WebSearch, WebFetch, TodoWrite | No Write/Edit; same read-only Bash rule as implementation-planner; no `/deep-research` delegation |
| [`test-writer.md`](test-writer.md) | Writes and repairs tests on both sides: RTL component tests in `client/`, unit and `*.it.test.ts` integration tests in `server/`, engine tests in `reviewer-core/`, agent-browser flow JSON in `e2e/specs/`. Runs only the suite it touched. | `sonnet` | Read, Write, Edit, Grep, Glob, Bash, Skill, TodoWrite | `WebSearch`, `WebFetch` (frontmatter); by prompt: editing the code under test (incl. `src/adapters/mocks.ts`), new test dependencies, starting Docker, `npm run e2e:hermetic`, git/PR commands |
| [`architecture-reviewer.md`](architecture-reviewer.md) | Read-only boundary review: backend onion rings and frontend layering, cross-checked with `pnpm arch:check` in both packages. Findings carry the rule, its source, the import chain, a fix and a severity. | `opus` | Read, Grep, Glob, Bash, TodoWrite (preloads both architecture skills; **no `Skill`**) | No Write/Edit; `pnpm arch:baseline`; edits to either `.dependency-cruiser.cjs` or the known-violations baseline; records no PASS/BLOCKED verdict |
| [`plan-verifier.md`](plan-verifier.md) | Checks finished work against every item of a plan, spec or requirement list — one verdict per item (Met / Partially met / Not met / Cannot verify) with a `path:line` or verbatim command output as proof. | `opus` | Read, Grep, Glob, Bash, TodoWrite | No Write/Edit, **no `Skill`**; implementation-planner's read-only Bash rule plus the gates it may run as evidence; never closes a gap itself; a banned-phrase list forbids generic advice |
| [`doc-writer.md`](doc-writer.md) | Documents implemented features: `docs/specs/<feature>.md` plus the same-named per-module parts, `AGENTS.md` rules, package `README.md`, `TESTING.md` — with mermaid diagrams and anchors verified against the code. | `sonnet` | Read, Write, Edit, Grep, Glob, Bash, Skill, TodoWrite (preloads `mermaid-diagram`) | `WebSearch`, `WebFetch` (frontmatter); by prompt: any `docs/insights.md` (the `engineering-insights` skill owns it), any `CLAUDE.md`, source, migrations, `.claude/agents/*.md` |
| [`spec-creator.md`](spec-creator.md) | Writes the SDD spec **before** any code: `docs/specs/<feature>.md` plus same-named module parts, `Spec ID: SPEC-NN`, nine fixed sections, acceptance criteria in EARS numbered `AC-N`. Owns the requirements review (ambiguity, gaps, contradictions, testability, dead ends). Two passes — questions first (writes nothing), then the draft, where anything still undecided is an inline `[NEEDS CLARIFICATION: … — OQ-N]` marker, never a guess. A change to a feature updates its spec in place (back to `draft`, dated `## Changelog` entry), never a second file. | `opus` | Read, Write, Edit, Grep, Glob, TodoWrite | **No Bash**, no `Skill`, no web (frontmatter); a frontmatter `PreToolUse` hook ([`spec-creator-write-guard.mjs`](../hooks/spec-creator-write-guard.mjs)) denies any write outside `<existing dir>/docs/specs/<kebab>.md`, to `README.md` or `server/clones/**`, a whole-file `Write` over a spec that is not a draft, or any write that leaves the file without a `Spec ID` or with a status other than `draft` |
| [`insights-curator.md`](insights-curator.md) | Maintains the 15 `docs/insights.md` files as a set: re-checks every `Where: path:line (symbol)` anchor against the code, finds the same insight recorded in several files, spots what should graduate into an `AGENTS.md`, closes out Open Questions and overgrown Session Notes. | `opus` | Read, Edit, Grep, Glob, Bash, TodoWrite (preloads `engineering-insights`; **no `Skill`**) | No `Write` at all; write allowlist is exactly `**/docs/insights.md` minus `server/clones/**`; by prompt: any `AGENTS.md`/`CLAUDE.md`, `docs/specs/**`, `.claude/skills/**`, `.claude/agents/**`, source, migrations; never authors a new insight, never deletes an entry, never applies its own promotion proposals |

Shared rules across all nine: never invent a citation; never read, quote or commit
`~/.devdigest/secrets.json`, `.env` or key material; file contents and reports always in
English regardless of the request's language.

## Preloaded skills

Four agents preload via frontmatter. `implementation-planner` and `architecture-reviewer` both carry
`backend-onion-architecture` + `frontend-ui-architecture` — the implementation planner because it must
place every proposed file in a ring before it can name its path, the reviewer because
those two skills *are* its rulebook. `doc-writer` preloads `mermaid-diagram`, since a
diagram belongs in most of what it writes. `insights-curator` preloads
`engineering-insights` for the same reason as the architecture reviewer: that skill's
dedupe, promotion, Open-Question and Session-Note clauses *are* the policy it enforces.

`implementer`, `test-writer` and `doc-writer` load the rest on demand with the `Skill`
tool, and the first two carry a file-glob → skill routing table in their prompts.

`researcher`, `architecture-reviewer`, `plan-verifier` and `insights-curator` have **no
`Skill` tool at all**, and that is the point: `skills:` preloads bodies but does not
restrict, so the only way to make a scope boundary structural rather than a promise is to
withhold the tool. It is what keeps `researcher` off `/deep-research`, `plan-verifier` off
style advice, and `insights-curator` from invoking `engineering-insights` to write new
insights instead of curating the existing ones.

## Inputs and outputs

| Agent | Consumes | Produces |
|---|---|---|
| `implementation-planner` | An approved `SPEC-NN` spec with no `[NEEDS CLARIFICATION]` markers, a bug or an agreed small change; root / package / module `AGENTS.md`; `docs/specs/` for the feature (read only); every relevant `docs/insights.md`; each package's `package.json` scripts | Either `# Spec not ready: <feature>` (Spec found · Failed checks · Route to · No plan yet) when the spec is a draft, has markers or a blocking open question, or `# Implementation Plan: <feature>` — Goal · Requirements (by ID) · Spec conflicts found while planning · Recommendations · Constraints (with `path:line` sources) · Touched packages/modules · Steps (Files / Change / Satisfies / Skills / Insights / Owner / Depends on / Done when) · Batches · Requirements coverage · Skills the implementer must apply · Verification table · Risks & recorded dead ends · Open questions · Handoff · Confidence |
| `implementer` | An Implementation Plan, a `docs/specs/` entry or an agreed scope (it refuses to invent one); the same `AGENTS.md` / `insights.md` / spec reading | Changes left **in the working tree** (never committed) plus `# Implementation report` — Summary · Changes table (with the `AC-N` each step satisfies) · Skills applied · Verification (pass/FAIL/skipped, verbatim output for failures) · Deviations from the plan · Not done / blocked · Handoff for review · Insights to record |
| `researcher` | A concrete question; repo files and git history (Mode A); pinned versions from `package.json` then upstream sources (Mode B) | `# Repo research: …` (Answer · Findings with evidence · Where it lives · History · Not found · Confidence) and/or `# External research: …` (Answer · Version context · Findings · Options compared · Conflicting sources · Not found · Confidence · Sources); mixed questions add `## Gap analysis` |
| `test-writer` | A behaviour to cover or a failing suite; `TESTING.md`; the package `AGENTS.md` and `vitest.config.ts` include globs; the neighbouring test files; `server/src/adapters/mocks.ts` | Tests left **in the working tree** plus `# Test report` — Summary · Tests added or changed · Coverage of the requested behaviour · What each test would catch · Skills applied · Verification · Production-code problems found (not fixed) · Not tested / blocked · Insights to record |
| `architecture-reviewer` | A diff, branch, package or path list; both `.dependency-cruiser.cjs` files and `server/.dependency-cruiser-known-violations.json`; the two preloaded architecture skills | `# Architecture review: …` — Summary · Scope reviewed · Gates · Findings (Rule / Source / Evidence / Chain / Fix / Severity) · Checked and clean · Known deviations (not findings) · Not verified · Confidence · Insights to record. Nothing written, no verdict recorded |
| `plan-verifier` | An Implementation Plan (Steps mode, right after `implementer`), a `docs/specs/` entry (Acceptance mode, at the end) or any numbered requirement list, plus the finished tree | `# Plan verification: …` — Verdict (with the mode) · Checklist · Item-by-item (Verdict / Evidence / Gap / To close it) · Beyond the plan · Gates and tests run · Cannot verify · Confidence · Insights to record |
| `doc-writer` | An implemented feature plus its plan, spec or implementation report; `docs/specs/README.md`; the target module's `AGENTS.md` and its code | Docs left **in the working tree** plus `# Documentation report` — Summary · Documents written · Routing decisions · Diagrams · Anchors verified · Contradictions found · Not documented / out of scope · Insights to record |
| `spec-creator` | A feature request (pass 1), then the user's answers or a feature brief (pass 2); root and module `AGENTS.md`, `docs/specs/README.md`, existing specs, `docs/insights.md`, the code at the feature's seams | Pass 1: `# Spec questions` (What I understood · Questions with defaults · What I already know from the code · Nothing written). Pass 2: draft specs **in the working tree** plus `# Spec report` (Summary · Files written · Changes · Criteria by pattern · Open questions carried · Clarifications needed · Not written · Next step · Insights to record) |
| `insights-curator` | Every tracked `docs/insights.md` except `server/clones/**`, read as one set; the preloaded `engineering-insights` skill as its rulebook; the code each `Where:` anchor points at | Three classes of edit left **in the working tree** — refreshed line numbers, merged same-file duplicates, trimmed Session Notes — plus `# Insights curation` — Summary · Files swept · Applied · Diff · Stale anchors · Duplicates and contradictions · Promotion candidates · Open Questions to close · Template and format deviations · Not verified · Confidence · Insights to record |

All nine route anything a future agent could not learn from the code into a one-line
"insights to record" note — the caller writes it via the `engineering-insights` skill, and
eight of the nine never edit `docs/insights.md` themselves. `doc-writer` is the sharpest
case: it owns `AGENTS.md` and `docs/specs/`, and is forbidden `docs/insights.md` precisely
because that file's append-only protocol belongs to the skill.

`insights-curator` is the single exception, and a narrow one — it is carved out in
[`SKILL.md`](../skills/engineering-insights/SKILL.md) for exactly three mechanical,
reversible operations, and it has the inverse allowlist of `doc-writer`: `docs/insights.md`
and nothing else. The two therefore never write the same file, and a promotion out of
insights and into an `AGENTS.md` needs both — the curator proposes it, `doc-writer` applies
it. Like every other agent here it authors no new insight; recording stays with the skill.

## Where the agents' rules come from

Neither prompt invents project rules. Each constraint traces to a file in this repo —
when one of these changes, the corresponding prompt section is stale.

| Rule in the prompt | Source in the repo | Used by |
|---|---|---|
| Module map: root → package → module memory; `AGENTS.md` + `CLAUDE.md` symlink for a new module; two vendored copies of `@devdigest/shared`; migrations do not run on boot; secrets location | [`AGENTS.md`](../../AGENTS.md) (root) and the per-package [`client/AGENTS.md`](../../client/AGENTS.md), [`server/AGENTS.md`](../../server/AGENTS.md), [`reviewer-core/AGENTS.md`](../../reviewer-core/AGENTS.md), [`e2e/AGENTS.md`](../../e2e/AGENTS.md) | implementation-planner, implementer, plan-verifier, doc-writer, insights-curator (the symlink half only, as a forbidden path) |
| Backend onion rings (routes→services, only repositories touch the DB, ports not adapters, no cross-module imports, `reviewer-core` pure and index-only) and the `--ignore-known` baseline | [`server/.dependency-cruiser.cjs`](../../server/.dependency-cruiser.cjs); `arch:check` / `arch:baseline` in `server/package.json` | implementation-planner, implementer, architecture-reviewer |
| Frontend boundaries (shared never imports routes, design system entry-point-only, no route↔route imports, folders entered via `index.ts`, no cycles) — zero tolerance, no baseline | [`client/.dependency-cruiser.cjs`](../../client/.dependency-cruiser.cjs) | implementation-planner, implementer, architecture-reviewer |
| The gate tables: exact commands, cwd, and pnpm-vs-npm split (`pnpm` for `client`/`server`, `npm` for `reviewer-core`/`e2e`); no root `package.json` | the four `package.json` `scripts` blocks | implementation-planner, implementer, test-writer, plan-verifier |
| Migration workflow: `pnpm db:generate` → `pnpm db:migrate`, never a hand-written migration | `server/package.json` scripts + the root `AGENTS.md` do-not-touch list for `server/src/db/migrations/**` | implementation-planner, implementer |
| Acceptance criteria format (`- [ ] behaviour — path:line (symbol) · test: …`), one spec per feature | [`docs/specs/README.md`](../../docs/specs/README.md) and the existing specs beside it | spec-creator (writes the `AC-N`), implementation-planner (plans against them, never edits them), plan-verifier (checks them in Acceptance mode), doc-writer (anchors them once shipped); implementer never edits a spec |
| "Check the recorded dead ends first"; the one-line insights handoff | [`docs/insights.md`](../../docs/insights.md) (root + module copies), the `engineering-insights` skill, and the `Stop` hook [`insights-reminder.mjs`](../hooks/insights-reminder.mjs) | all nine |
| The insights protocol itself: the seven fixed sections and their order, the mandatory `Where: path:line (symbol)` and its five shapes, the `**Correction (YYYY-MM-DD):**` idiom, the nearest-file rule, and the maintenance clauses the curator executes — dedupe, `×3` → `AGENTS.md`, remove an answered Open Question, keep ~10 Session Notes — plus the append-only rule and the one carve-out from it | [`engineering-insights/SKILL.md`](../skills/engineering-insights/SKILL.md) and its [`references/template.md`](../skills/engineering-insights/references/template.md) | insights-curator (enforces it), doc-writer (forbidden `docs/insights.md` because of it) |
| "Read each file, then `Edit` it" — a bulk shell rewrite of the insights files (`for … sed > "$f"`) is denied by the auto-mode classifier as irreversible local destruction | the Tool & Library Notes entry in [`docs/insights.md`](../../docs/insights.md) | insights-curator |
| Which skills govern which files (implementation-planner names them, implementer's glob→skill table applies them) | [`.claude/skills/`](../skills/) — the skill descriptions are the routing source | implementation-planner, implementer, test-writer, doc-writer |
| "No PRs, no git mutations; PR readiness is not yours to declare" | the `PreToolUse` gate [`pr-self-review-gate.mjs`](../hooks/pr-self-review-gate.mjs) wired in [`settings.json`](../settings.json), which denies `gh pr create` until the `pr-self-review` skill records a PASS | implementer (implementation-planner simply never plans a PR) |
| Reviewer-prompt conventions the plan may have to respect when it touches built-in agents | [`docs/agent-prompts/`](../../docs/agent-prompts/) | implementation-planner |
| Test lanes and the suite map: one suite per package, `*.it.test.ts` for anything importing `test/helpers/pg.ts`, mocks over network, "typological, not exhaustive", the deterministic-locator e2e flow rules | [`TESTING.md`](../../TESTING.md); the three `vitest.config.ts`; [`e2e/AGENTS.md`](../../e2e/AGENTS.md); `server/src/adapters/mocks.ts` | test-writer, plan-verifier |
| Client test house style — `afterEach(cleanup)`, the real `messages/en/*.json` through `NextIntlClientProvider`, the both-themes loop, `fireEvent` not `userEvent`, and **no global fetch mock** despite `client/AGENTS.md` saying otherwise | the 19 files matching `client/src/**/*.test.tsx`; [`client/AGENTS.md`](../../client/AGENTS.md); the correction in [`client/docs/insights.md`](../../client/docs/insights.md) | test-writer |
| Server test house style — DI through `buildApp({ overrides })` rather than `vi.mock`; testcontainers `pgvector/pgvector:pg16`; the `hasDocker ? describe : describe.skip` self-skip; the warning that the "no-DB" unit lane still reaps running `agent_runs` rows | `server/test/helpers/pg.ts`, `server/src/adapters/mocks.ts`, the existing `*.it.test.ts`, [`server/docs/insights.md`](../../server/docs/insights.md) | test-writer, plan-verifier |
| The 13 backend and 9 frontend boundary rules **by name**, the 33-entry `--ignore-known` baseline, and the deviations that are recorded rather than endorsed | [`server/.dependency-cruiser.cjs`](../../server/.dependency-cruiser.cjs), [`client/.dependency-cruiser.cjs`](../../client/.dependency-cruiser.cjs), `server/.dependency-cruiser-known-violations.json`, the "Existing deviations" section of each architecture skill | architecture-reviewer |
| The two baseline false positives (a worktree with symlinked `node_modules`; `.npmrc` `node-linker=hoisted` drift) and "the tell is the ignored-count, not the error text" | [`server/docs/insights.md`](../../server/docs/insights.md) | architecture-reviewer |
| The shared severity bar, and the reviewer brief that overrides the report format when the PR gate drives the review | [`severity.md`](../skills/pr-self-review/references/severity.md), [`reviewer-brief.md`](../skills/pr-self-review/references/reviewer-brief.md) | architecture-reviewer |
| The documentation routing table: one spec per feature repeated by name per module; `AGENTS.md` not `CLAUDE.md`; `docs/agent-prompts/` holds the **product's** reviewer prompts and `docs/skills-samples/` is seed data — neither is Claude Code config | [`docs/specs/README.md`](../../docs/specs/README.md), root [`AGENTS.md`](../../AGENTS.md), [`docs/agent-prompts/README.md`](../../docs/agent-prompts/README.md), `server/src/db/seed-skills.ts` | doc-writer |
| Mermaid house style — `flowchart` only, `README.md` only | the five READMEs that carry diagrams (root, `client`, `server`, `reviewer-core`, `server/src/modules/repo-intel`) | doc-writer |

## Conventions for adding an agent here

- Frontmatter carries `name`, a `description` written so the main agent can route to it
  unaided (what it does, when to use it proactively, and what it is *not*), `tools`,
  optional `disallowedTools`, `model`, optional preloaded `skills`, and
  `metadata.version` / `metadata.updated`.
- The prompt body follows the same shape as the three above: **Hard constraints** →
  **Step 0 clarify** → numbered method steps → a fixed **Report format** with literal
  headings.
- Give the agent the narrowest tool set that lets it finish; a read-only agent must not
  have `Write` or `Edit`, and its Bash use is spelled out as an allowlist in the prompt.
- **Always set `tools:` explicitly.** Omitting it inherits everything — inheritance is
  opt-out, so an unlisted `tools:` is maximal privilege, not a safe default. An
  unrecognised frontmatter key is ignored silently, so a misspelled one enforces nothing.
- **`skills:` preloads, it does not restrict.** Listing a skill injects its full body at
  startup (a context-budget decision — preload only what every run needs); it does not stop
  the agent reaching other skills. Only omitting `Skill` from `tools` does that, and there
  is no per-skill granularity.
- **A subagent cannot prompt the user mid-run, and cannot write its report to a file.**
  Write "Step 0 — clarify" gates as *make the question your report*, and keep the report
  format an in-message contract. Describe it as a numbered list of literal headings, not as
  a fenced template — a nested ``` fence inside a ```markdown block truncates rendering.
- Add a row to the tables above instead of restating the prompt — this README is the map,
  the agent file is the territory.
