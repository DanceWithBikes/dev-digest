# Specs

One spec = one feature = one file, named after the feature: `cost-badge.md`, `severity-filter.md`.
The lesson that introduced a feature is recorded inside the file (`Introduced in: L01`), not in its name.

- **Project-wide overview lives here** — the goal, the user-visible acceptance criteria and where
  each part of the feature lives.
- **Each package/module the feature changed gets a file with the SAME name** in its own
  `docs/specs/`, holding only that module's part. `find . -name cost-badge.md` lists every part.
- **A module no feature has changed has no spec** — an empty `docs/specs/` (just `.gitkeep`)
  is expected.

## Acceptance criteria format
Every criterion is checkable and located:

`` - [x] <behaviour> — `path:line` (`symbol`) · test: `path:line` ("test name") ``, or `· untested`.

Paths are relative to the repo root. The line is exact at the time of writing; the symbol is the
anchor to search for once lines drift — touching the code means refreshing the numbers.
Open questions list verified gaps only (untested paths, doc/code contradictions), each with its
`path:line`.

## Template

```md
# <Feature name>

> Introduced in: L0N. Refs are `path:line` (`symbol`) at the time of writing — if a line moved,
> search for the symbol.

## Goal
## Acceptance criteria
- [ ] …
## Touched packages / modules
## Open questions
```

## Spec-driven specs (SPEC-NN)

From L05 on, a feature's spec is written **before** the code by the `spec-creator` subagent
(`.claude/agents/spec-creator.md`) and lives in the same file the as-built spec will become:

1. **draft** — `spec-creator` writes `docs/specs/<feature>.md` plus the same-named part in each
   touched module. Header: `Spec ID: SPEC-NN` (global, highest + 1; the parts share the overview's
   ID) · `Status: draft` · `Supersedes:` · `Introduced in:`. Sections: Problem & user ·
   Goals / Non-goals · User stories · Acceptance criteria (EARS) · Edge cases ·
   Non-functional requirements · Inputs and provenance · Untrusted inputs · Open questions ·
   Changelog (overview only, newest first). Criteria are `- [ ] AC-N <EARS sentence>`, numbered
   once in the overview and copied verbatim into the parts.
2. **approved** — set by hand once the user accepts the draft; `implementation-planner` plans against the `AC-N`s.
3. **implemented** — `doc-writer` appends `` — `path:line` (`symbol`) · test: … `` to each `AC-N`
   line, ticks it, sets the status and adds the Features-table row below.

One feature stays one file. A change to a feature updates its spec **in place**: the status goes
back to `draft`, untouched `AC-N` keep their tick and anchor, a changed one keeps its number but
loses both, a new one takes the next number, a dropped one is struck through and its number never
reused — and a dated `## Changelog` entry names every ID that moved. `Supersedes:` is only for a
different feature that replaces this one. The specs that predate L05 carry no `Spec ID`; the first
change to one adopts it (header + SDD sections around the existing, still-anchored criteria).

## Features

| Feature | Introduced | Overview | Parts |
|---|---|---|---|
| Cost badge | L01 | [`cost-badge.md`](cost-badge.md) | [reviews](../../server/src/modules/reviews/docs/specs/cost-badge.md) · [pulls](../../server/src/modules/pulls/docs/specs/cost-badge.md) · [client](../../client/docs/specs/cost-badge.md) |
| Severity filter | L01 | [`severity-filter.md`](severity-filter.md) | [pulls](../../server/src/modules/pulls/docs/specs/severity-filter.md) · [client](../../client/docs/specs/severity-filter.md) |
| SUGGESTION severity | L01 | [`suggestion-severity.md`](suggestion-severity.md) | — (seed data + `docs/agent-prompts/`, no module code) |
| Intent Layer | L03 | [`intent-layer.md`](intent-layer.md) | [reviews](../../server/src/modules/reviews/docs/specs/intent-layer.md) · [reviewer-core](../../reviewer-core/docs/specs/intent-layer.md) · [client](../../client/docs/specs/intent-layer.md) |
| Smart Diff | L03 | [`smart-diff.md`](smart-diff.md) | [pulls](../../server/src/modules/pulls/docs/specs/smart-diff.md) · [client](../../client/docs/specs/smart-diff.md) |
| devdigest-mcp | L04 | [`devdigest-mcp.md`](devdigest-mcp.md) | [server/mcp](../../server/src/mcp/docs/specs/devdigest-mcp.md) · [pulls](../../server/src/modules/pulls/docs/specs/devdigest-mcp.md) · [reviews](../../server/src/modules/reviews/docs/specs/devdigest-mcp.md) |
| Blast Radius | L04 | [`blast-radius.md`](blast-radius.md) | [blast](../../server/src/modules/blast/docs/specs/blast-radius.md) · [server/mcp](../../server/src/mcp/docs/specs/blast-radius.md) · [repo-intel](../../server/src/modules/repo-intel/docs/specs/blast-radius.md) · [client](../../client/docs/specs/blast-radius.md) |
| PR Brief | L05 | [`pr-brief.md`](pr-brief.md) | [brief](../../server/src/modules/brief/docs/specs/pr-brief.md) · [server](../../server/docs/specs/pr-brief.md) · [client](../../client/docs/specs/pr-brief.md) · [e2e](../../e2e/docs/specs/pr-brief.md) |
| Eval pipeline | L06 | [`eval-pipeline.md`](eval-pipeline.md) | [eval](../../server/src/modules/eval/docs/specs/eval-pipeline.md) · [server](../../server/docs/specs/eval-pipeline.md) · [reviewer-core](../../reviewer-core/docs/specs/eval-pipeline.md) · [client](../../client/docs/specs/eval-pipeline.md) · [e2e](../../e2e/docs/specs/eval-pipeline.md) |
