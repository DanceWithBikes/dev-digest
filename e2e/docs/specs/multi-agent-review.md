# Spec: Multi-Agent Review — e2e

Spec ID: SPEC-05
Status: implemented
Overview: [../../../docs/specs/multi-agent-review.md](../../../docs/specs/multi-agent-review.md)

## Scope in this module

The e2e suite covers the multi-agent results page in one deterministic browser flow, `specs/14-multi-agent-review.flow.json`: Columns mode, Tabs mode and the disagreement section of a 2-agent run. It relies on the server's parent read and on the studio pages. The run it opens, on seeded PR #484, comes from the server seed (AC-125, in the server part). Launching is covered by server tests.

## Acceptance criteria (EARS)

- [x] AC-123 The hermetic e2e suite shall include a flow that opens the results page of the seeded 2-agent parent run, without launching any run, and asserts that Columns mode shows 2 columns, Tabs mode shows 2 agent tabs, and the "Where agents disagree" section shows at least 1 conflict row. — `e2e/specs/14-multi-agent-review.flow.json:15` (`flow 14 (2 columns)`), `e2e/specs/14-multi-agent-review.flow.json:18` (`flow 14 (2 tab buttons)`), `e2e/specs/14-multi-agent-review.flow.json:22` (`flow 14 (conflict row)`) · test: `e2e/specs/14-multi-agent-review.flow.json:15` ("AC-123: Columns mode shows exactly 2 agent columns"), `e2e/specs/14-multi-agent-review.flow.json:18` ("AC-123: Tabs mode shows exactly 2 agent tab buttons"), `e2e/specs/14-multi-agent-review.flow.json:22` ("AC-123: the section shows at least 1 conflict row")

## Module notes

- Flows use seeded data only (`acme/payments-api`, PR #482, built-in agents) and never call an LLM — `../../AGENTS.md:17`.
- Seed PR #482 has no stored patches, so a launch on it now fails with "no diff available" instead of returning 0 findings — `../../../server/src/modules/reviews/diff-loader.ts:33`, `../../../server/src/modules/reviews/docs/insights.md:37` (that entry still describes the empty-diff behaviour). The flow therefore never launches a run.
