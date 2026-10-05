# Spec: PR Brief — server

Spec ID: SPEC-03
Status: implemented
Overview: [../../../docs/specs/pr-brief.md](../../../docs/specs/pr-brief.md)

## Scope in this module

The server package owns the server copy of the brief contract (AC-1 to AC-8) and the seeded brief for PR #482 (AC-84, AC-85). The brief module's criteria (AC-9 to AC-49: the routes, generation, inputs, grounding and limits) live in its own part: [../../src/modules/brief/docs/specs/pr-brief.md](../../src/modules/brief/docs/specs/pr-brief.md).

## Acceptance criteria (EARS)

### Contract (`@devdigest/shared`, server copy)

- [x] AC-1 The `PrBrief` contract shall carry a `summary` string stating what the PR does and why. — `server/src/vendor/shared/contracts/brief.ts:160` (`PrBrief.summary`) · test: `server/test/contracts.test.ts:74` ("PrBrief accepts a valid brief and rejects a zero line / ref")
- [x] AC-2 The `PrBrief` contract shall carry a `review_focus` list whose items each hold a `file` path, a `line` integer of at least 1 and a non-empty `reason` string. — `server/src/vendor/shared/contracts/brief.ts:141` (`ReviewFocusItem`), `server/src/vendor/shared/contracts/brief.ts:165` (`PrBrief.review_focus`) · test: `server/test/contracts.test.ts:74` ("PrBrief accepts a valid brief and rejects a zero line / ref")
- [x] AC-3 The `PrBrief` contract shall carry a `missing` list whose items each hold a `source`, which is one of `intent`, `blast`, `specs` or `diff`, and a non-empty `reason` string. — `server/src/vendor/shared/contracts/brief.ts:149` (`BriefMissingSource`), `server/src/vendor/shared/contracts/brief.ts:152` (`BriefMissing`) · test: `server/test/contracts.test.ts:74` ("PrBrief accepts a valid brief and rejects a zero line / ref")
- [x] AC-4 The `PrBrief` contract shall allow `intent` to be null and `blast` to be null. — `server/src/vendor/shared/contracts/brief.ts:161` (`PrBrief.intent`), `server/src/vendor/shared/contracts/brief.ts:162` (`PrBrief.blast`) · test: `server/test/contracts.test.ts:74` ("PrBrief accepts a valid brief and rejects a zero line / ref")
- [x] AC-5 The `PrBrief` contract shall carry the head SHA the brief was generated for, the generation timestamp, the model name, the generation cost in USD, the input token count and the output token count. The cost and both token counts shall be nullable. — `server/src/vendor/shared/contracts/brief.ts:167` (`PrBrief.head_sha … tokens_out`) · test: `server/test/contracts.test.ts:74` ("PrBrief accepts a valid brief and rejects a zero line / ref"), `server/test/brief-service.test.ts:242` ("returns a brief that satisfies the PrBrief contract with head SHA, model and usage")
- [x] AC-6 Each risk's `file_refs` entry shall be either a path or a path followed by `:<start>` or `:<start>-<end>`, where start and end are integers of at least 1. — `server/src/vendor/shared/contracts/brief.ts:71` (`RiskFileRef`) · test: `server/test/contracts.test.ts:74` ("PrBrief accepts a valid brief and rejects a zero line / ref")
- [x] AC-7 The `history` list of every generated brief shall be empty. — `server/src/modules/brief/service.ts:208` (`BriefService.build (history: { history: [] })`) · test: `server/test/brief-service.test.ts:242` ("returns a brief that satisfies the PrBrief contract with head SHA, model and usage")
- [x] AC-8 The brief contract in the server copy of `@devdigest/shared` shall be identical to the brief contract in the client copy. — `server/src/vendor/shared/contracts/brief.ts` and `client/src/vendor/shared/contracts/brief.ts` (`PrBrief`) are byte-identical (`diff` clean on 2026-10-03) · untested

### Brief module

- AC-9 to AC-49 are held by the brief module part: [../../src/modules/brief/docs/specs/pr-brief.md](../../src/modules/brief/docs/specs/pr-brief.md).

### Seed data

- [x] AC-84 The server seed shall store a brief for seeded PR #482 in `acme/payments-api`. That brief shall validate against the `PrBrief` contract and have a non-empty summary, at least 1 risk, and at least 1 review focus item whose file is a changed file of that PR. Its head SHA shall equal that PR's seeded head SHA. — `server/src/db/seed-fixtures.ts:132` (`PR_482_BRIEF`), `server/src/db/seed.ts:194` (`seed (brief insert)`) · test: `server/test/brief.it.test.ts:352` ("seed() run again leaves exactly one PR #482 brief; a regenerated brief survives a re-seed; GET #482 timing is recorded")
- [x] AC-85 The server seed shall insert the PR #482 brief only when that PR has no stored brief, so re-running the seed never adds a second brief or replaces a regenerated one. — `server/src/db/seed.ts:194` (`seed (existingBrief check)`) · test: `server/test/brief.it.test.ts:352` ("seed() run again leaves exactly one PR #482 brief; a regenerated brief survives a re-seed; GET #482 timing is recorded")

## Module notes

- The seed change belongs in `server/src/db/seed.ts`, next to the PR #482 block (`server/src/db/seed.ts:101-139`). That block runs only when the PR row is missing, so the brief insert needs its own existence check by PR (AC-85). The seed must stay idempotent: `server/src/db/AGENTS.md`. PR #482's seeded head SHA is `a1b2c3d4e5f6` (`server/src/db/seed.ts:117`). Its changed files carry no patch, so AC-40 does not apply to the seeded focus line.
- `@devdigest/shared` exists in two copies, and both must change together: `CLAUDE.md` (root, "Rules you can't infer from the code"); `client/AGENTS.md` Gotchas.
- The module-layer constraints (no cross-module imports, error classes, workspace scoping through the PR lookup) moved with AC-9 to AC-49 to the brief module part.
- Migrations are generated only by the generate command and do not run on boot. Any new column needs a manual migrate step: root `CLAUDE.md`.

## Open questions

- AC-8 is met but untested: the two contract files are identical on 2026-10-03 (`diff` clean) and no parity test exists.
- AC-84 and AC-85 are covered by a Docker-gated integration test that is skipped when Docker is unavailable: `server/test/brief.it.test.ts:26`. It asserts that GET returns the seeded brief equal to `PR_482_BRIEF`, that a re-seed leaves one row, and that a regenerated brief survives a re-seed (`server/test/brief.it.test.ts:352`). "Its focus file is a changed file of the PR" is not asserted by a test; e2e flow 11 exercises it (`e2e/specs/11-pr-brief.flow.json:19-22`).
