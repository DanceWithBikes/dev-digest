# Spec: PR Brief — e2e

Spec ID: SPEC-03
Status: implemented
Overview: [../../../docs/specs/pr-brief.md](../../../docs/specs/pr-brief.md)

## Scope in this module

Deterministic browser flows with no LLM call. On seeded PR #482, they assert the brief cached by the server seed (AC-84) and navigation from a Review focus item to Files changed. On seeded PR #483, which has no brief, they assert the no-brief state. Generation itself needs a model call, which e2e flows never make, so it is proven by server and client tests.

## Acceptance criteria (EARS)

- [x] AC-81 The hermetic e2e suite shall open the Overview tab of seeded PR #482 in `acme/payments-api` and confirm that the cached brief's summary, its Risk areas list and its Review focus list render, without a "Generate brief" button. — `e2e/specs/11-pr-brief.flow.json:11` (`flow 11 steps (PR BRIEF … no Generate brief)`), `server/src/db/seed-fixtures.ts:132` (`PR_482_BRIEF`) · test: `e2e/specs/11-pr-brief.flow.json:18` ("AC-81: no 'Generate brief' button when a brief is cached") (passed under `npm run e2e:hermetic`, 2026-10-03, 12/12 flows)
- [x] AC-82 The hermetic e2e suite shall click the first Review focus item of the seeded brief on PR #482 and confirm three things: the Files changed tab is shown, the page URL carries that item's file as the target, and that file is expanded. — `e2e/specs/11-pr-brief.flow.json:19` (`flow 11 steps (click first focus item)`) · test: `e2e/specs/11-pr-brief.flow.json:22` ("AC-82: the target file card is expanded") (same run)
- [x] AC-83 The hermetic e2e suite shall open the Overview tab of seeded PR #483 in `acme/payments-api`, which has no stored brief, and confirm that the PR Brief section with a "Generate brief" button renders. — `e2e/specs/12-pr-brief-empty.flow.json:11` (`flow 12 steps (PR #483)`), `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/PrBriefSection/PrBriefSection.tsx:44` (`PrBriefSection (!brief branch)`) · test: `e2e/specs/12-pr-brief-empty.flow.json:12` ("AC-83: the 'Generate brief' button renders") (same run)

## Module notes

- Flows use seeded data only (`acme/payments-api`, PR #482) and never call an LLM: `e2e/AGENTS.md:17`.

## Verification

Flows `e2e/specs/11-pr-brief.flow.json` (AC-81, AC-82) and `e2e/specs/12-pr-brief-empty.flow.json` (AC-83) passed under `npm run e2e:hermetic` on 2026-10-03 (12/12 flows). They need the seeded brief on #482 (`server/src/db/seed-fixtures.ts:132`), so run them hermetically: a dev database where someone regenerated the brief, or generated one on #483, can fail them.
