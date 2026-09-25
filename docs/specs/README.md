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

## Features

| Feature | Introduced | Overview | Parts |
|---|---|---|---|
| Cost badge | L01 | [`cost-badge.md`](cost-badge.md) | [reviews](../../server/src/modules/reviews/docs/specs/cost-badge.md) · [pulls](../../server/src/modules/pulls/docs/specs/cost-badge.md) · [client](../../client/docs/specs/cost-badge.md) |
| Severity filter | L01 | [`severity-filter.md`](severity-filter.md) | [pulls](../../server/src/modules/pulls/docs/specs/severity-filter.md) · [client](../../client/docs/specs/severity-filter.md) |
| SUGGESTION severity | L01 | [`suggestion-severity.md`](suggestion-severity.md) | — (seed data + `docs/agent-prompts/`, no module code) |
| Intent Layer | L03 | [`intent-layer.md`](intent-layer.md) | [reviews](../../server/src/modules/reviews/docs/specs/intent-layer.md) · [reviewer-core](../../reviewer-core/docs/specs/intent-layer.md) · [client](../../client/docs/specs/intent-layer.md) |
| Smart Diff | L03 | [`smart-diff.md`](smart-diff.md) | [pulls](../../server/src/modules/pulls/docs/specs/smart-diff.md) · [client](../../client/docs/specs/smart-diff.md) |
