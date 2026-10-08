# Spec: Eval Pipeline — e2e

Spec ID: SPEC-04
Status: implemented
Overview: [../../../docs/specs/eval-pipeline.md](../../../docs/specs/eval-pipeline.md)

## Scope in this module

One deterministic browser flow with no model call. On seeded PR #482 it turns the first finding into an eval case, checks that the case appears on the Security Reviewer's Evals tab as "must find", and checks that the Eval Dashboard shows the Security Reviewer row with the seeded batch numbers. It relies on the server seed: the PR #482 patches, the review's agent backfill, and the 8 seeded cases and 2 seeded batches (AC-64 to AC-70). Running batches needs a model, so it is proven by server integration tests with a mock provider (AC-51), not here.

## Acceptance criteria (EARS)

- [x] AC-113 The hermetic e2e suite shall open seeded PR #482 in `acme/payments-api`, accept its first finding, click "Turn into eval case" and confirm that "Eval case created" appears. — `e2e/specs/13-eval-pipeline.flow.json` steps 1-15 (open #482, Accept at step 11, click "Turn into eval case" at step 14, `wait --text "Eval case created"` at step 15) · test: `e2e/specs/13-eval-pipeline.flow.json` (run by `npm run e2e:hermetic`; 13/13 recorded in `docs/plans/eval-pipeline/handoff.md:36`)
- [x] AC-114 The hermetic e2e suite shall then open the Security Reviewer's Evals tab and confirm that the case created in AC-113 is listed with "must find". — `e2e/specs/13-eval-pipeline.flow.json` steps 16-23 (Security Reviewer Evals tab, step 22 `wait --text "Must find: Hardcoded Stripe secret key in commit"`, step 23 `wait --text "must find"`) · test: `e2e/specs/13-eval-pipeline.flow.json` (13/13 recorded in `docs/plans/eval-pipeline/handoff.md:36`)
- [x] AC-115 The hermetic e2e suite shall then open `/eval` and confirm that the Security Reviewer row shows the metrics of the newest seeded batch. — `e2e/specs/13-eval-pipeline.flow.json` steps 24-29 (`/eval`, step 28 `wait --text "7/8 passed"`, step 29 row contains `83%`, `100%`, `86%` = the newest seeded batch: recall 0.833, precision 1.000, citation 0.857, 7 of 8 cases passed) · test: `e2e/specs/13-eval-pipeline.flow.json` (13/13 recorded in `docs/plans/eval-pipeline/handoff.md:36`)
- [x] AC-116 The hermetic e2e suite shall pass every flow, the existing ones and the eval flow, without any model call. — `e2e/specs/` (flows `01` to `13`), `scripts/e2e.sh:41-44` (hermetic stack, `RATE_LIMIT_MAX` lifted), `e2e/AGENTS.md:17` (flows never call an LLM) · test: `cd e2e && npm run e2e:hermetic`, 13/13 flows recorded in `docs/plans/eval-pipeline/handoff.md:36` (not re-run while writing this spec)

## Module notes

- Flows use seeded data only and never call an LLM, and assertions use `wait --text` / `wait --url` with deterministic locators: `e2e/AGENTS.md:15-17`.
- `find role button --name X` matches by substring, so add `--exact` where two names share text. The `src/config.ts:12` label appears on more than one control on PR #482: `e2e/docs/insights.md:21`.
- `wait --url` takes a substring, not a glob. Follow an ambiguous one with a `wait --text`: `e2e/docs/insights.md:24`.
- `wait --text` reads rendered text after CSS `text-transform`. The metric labels in `eval.json` are already uppercase ("RECALL"): `e2e/docs/insights.md:33`.
- Adding patches to PR #482 (AC-64) changes what the Files changed tab renders for flows that open #482. AC-116 requires they keep passing.

## Changelog

- 2026-10-07 · L06 · implemented — AC-113 to AC-116 anchored and ticked against `e2e/specs/13-eval-pipeline.flow.json` steps; status set to implemented.
