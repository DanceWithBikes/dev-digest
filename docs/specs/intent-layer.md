# Intent Layer

> Introduced in: L03. Refs are `path:line` (`symbol`) at the time of writing — if a line moved,
> search for the symbol.

## Goal
Before the review agents run, derive one cheap, deterministic-evidence read on what a PR set out to do — its intent, what it covers, and what it explicitly leaves out — store it, show it on the PR page, and feed it to the reviewer so out-of-scope noise is suppressed without ever letting a real defect go unreported. A run costs **1 classifier call + N agent reviews**, not N+1 flagship calls.

## Call flow

```mermaid
sequenceDiagram
    participant UI as PR page (IntentCard)
    participant API as reviews/routes.ts
    participant EX as ReviewRunExecutor
    participant SRC as IntentSourceCollector
    participant CLS as LlmIntentClassifier
    participant CORE as reviewer-core (per agent)
    participant DB as pr_intent / reviews

    UI->>API: POST /pulls/:id/review
    API-->>UI: 202 + runIds (executeRuns not awaited)
    EX->>EX: runLog.step("Loading PR diff")
    EX->>EX: deriveIntent() — stored & head_sha matches? reuse; else re-derive
    EX->>SRC: collect(pr, repo, {files:[{path,hunks}]})
    SRC-->>SRC: title · body · commits · getIssue() · git.readFile(spec)
    EX->>CLS: classify(workspaceId, sources)
    Note over CLS: LLM CALL 1 — cheap model<br/>featureModel(ws,'review_intent')<br/>completeStructured(Intent)
    CLS-->>EX: ClassifyResult (Intent + provider/model/tokens/cost)
    EX->>DB: upsertIntent(prId, record, head_sha, tokens, cost)
    loop per agent (N)
        EX->>CORE: reviewPullRequest({ diff, intent: renderIntentForPrompt(record), ... })
        Note over CORE: LLM CALL 2..N+1 — the agent's own model
        CORE->>CORE: groundFindings → filterByIntent → scoreFromFindings(survivors)
        CORE-->>EX: Review + dropped[]
        EX->>DB: insertReview / insertFindings / completeAgentRun
    end
    UI->>API: GET /pulls/:id/intent
    API-->>UI: PrIntentRecord | null
```

Manual path: `POST /pulls/:id/intent` runs the same collect→classify→upsert sequence standalone, without a review run — `server/src/modules/reviews/service.ts:209` (`detectIntent`).

## Acceptance criteria
User-visible:
- [x] The PR page's Overview tab shows an INTENT card — quoted summary, confidence badge, IN SCOPE / OUT OF SCOPE columns, resolved sources + any missing-context warnings, and a re-run button flagged "Intent is out of date" after a force-push — `client/src/app/repos/[repoId]/pulls/[number]/_components/IntentCard/IntentCard.tsx:80` (`IntentCard`) · test: `client/src/app/repos/[repoId]/pulls/[number]/_components/IntentCard/IntentCard.test.tsx:37` ("renders the summary and both scope lists when populated") — details in `client/docs/specs/intent-layer.md`
- [x] A PR with no intent yet shows an empty state with a "Detect intent" action, not an error — `client/src/app/repos/[repoId]/pulls/[number]/_components/IntentCard/IntentCard.tsx:53` · test: `client/src/app/repos/[repoId]/pulls/[number]/_components/IntentCard/IntentCard.test.tsx:82` ("shows the empty state with a Detect intent action when no intent exists yet")
- [x] The IntentCard sits in a PR-Brief grid above the description, ready for L04/L05 to add cards beside it — `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/OverviewTab.tsx:20` (`s.briefGrid`) · untested (layout, not asserted by RTL)

Derivation (server):
- [x] One classifier call derives intent as shared pre-work, once per run, between the diff load and the per-agent loop; a classifier failure never fails the run — it just means every queued agent reviews without the intent slot — `server/src/modules/reviews/run-executor.ts:125` (`deriveIntent`), `server/src/modules/reviews/run-executor.ts:428` (best-effort catch) · untested (no server integration test exercises `POST /pulls/:id/review` with a failing classifier)
- [x] The classifier's model is resolved from the `review_intent` feature-model slot, defaulting to `openrouter`/`deepseek/deepseek-v4-flash` — `server/src/modules/reviews/compose.ts:113` (`LlmIntentClassifier.classify`), `server/src/vendor/shared/contracts/platform.ts:53` (`FEATURE_MODELS` entry) · untested
- [x] Sources are gathered deterministically — PR title, body, linked issue, a linked plan/spec read AT THE PR'S HEAD (`git show <head_sha>:<path>`, falling back to a `pull/<n>/head` fetch and then the clone's worktree, so a spec the PR itself adds resolves before merge), the changed-file list (hunk headers only, never diff bodies), and commit messages; each attempt is recorded and unreachable sources land in `missing_context[]`, never invented — `server/src/modules/reviews/compose.ts:46` (`RepoIntentSourceCollector.collect`), `server/src/modules/reviews/compose.ts:133` (`readSpecAtHead`) · test: `server/test/reviews-intent-spec-resolution.test.ts` ("linked spec resolution" — all three steps + the honest failure), `server/test/reviews-intent-sources.test.ts:114` ("reports an unreferenced/unresolved issue and spec as not available, never invented")
- [x] A PR that references no plan/spec at all is recorded as such (`{kind:'spec', ref:null, ok:false}`) and stated on the card as a muted "No spec or plan linked" note — an absence, deliberately NOT a `missing_context[]` warning, which is reserved for a source that was named and could not be read — `server/src/modules/reviews/compose.ts:99`, `server/src/modules/reviews/intent-helpers.ts:20` (`isUnlinkedSpec`) · test: `server/test/reviews-intent-helpers.test.ts` ("reports an unreadable spec but not a PR that simply links none")
- [x] Diff bodies never reach the classifier — the collector's port type (`IntentDiffFiles`) has no `raw` field at all, so the guarantee is structural, not a discipline — `server/src/modules/reviews/ports.ts:51` (`IntentDiffFiles`) · test: `server/test/reviews-intent-sources.test.ts:89` ("never contains the raw diff text, however the sources were assembled")
- [x] `confidence` is derived from which sources actually resolved (high / medium / low, demoted one band on any referenced-source failure), never model-reported — `server/src/modules/reviews/intent-helpers.ts:31` (`deriveConfidence`) · test: `server/test/reviews-intent-helpers.test.ts:46` ("demotes high to medium when a referenced source failed to resolve")
- [x] Intent is persisted with the `head_sha` AND a fingerprint of the description it was derived from (`body_sha`); a run reuses the stored record only while both still match, and the API marks a stale record `stale: true` for the card's re-run affordance. `head_sha` alone is not enough: editing a PR description moves no commit, and the description only reaches `pull_requests.body` on a detail sync, so an intent classified before that kept reporting "PR description is empty" forever — `server/src/modules/reviews/intent-helpers.ts:105` (`isIntentStale`), `server/src/modules/reviews/run-executor.ts:379` (reuse check), `server/src/modules/reviews/service.ts:206` (`stale` derived on read) · test: `server/test/reviews-intent-helpers.test.ts` (`describe('isIntentStale')`)
- [x] The classifier's own tokens/cost are stored on `pr_intent`, not on `agent_runs`, so per-agent cost stays honest — `server/src/db/schema/reviews.ts:67` (`tokensIn`/`tokensOut`/`costUsd` columns), `server/src/modules/reviews/repository/pull.repo.ts:61` (`upsertIntent`) · untested — details in `server/src/modules/reviews/docs/specs/intent-layer.md`

Prompt + scope filter (reviewer-core):
- [x] A `## PR intent (derived)` slot is appended to the prompt after `## PR description` and before `## Diff to review`, wrapped in `<untrusted source="intent">`; omitted entirely when no intent was derived (byte-identical to pre-L03) — `reviewer-core/src/prompt.ts:134` (`assemblePrompt`) · test: `reviewer-core/test/prompt.test.ts:69` ("renders the section (untrusted-wrapped), ordered after PR description and before the diff")
- [x] A trusted `SCOPE_INSTRUCTION` is appended to the system prompt only when the intent slot is present, telling the agent to tag matching findings `out_of_scope: true` as a hint, never a waiver — `reviewer-core/src/prompt.ts:35` (`SCOPE_INSTRUCTION`) · test: `reviewer-core/test/prompt.test.ts:94` ("appends the scope instruction to the system message only when intent is present")
- [x] `filterByIntent` runs after citation grounding and before the score recompute: in-scope (or untagged) findings are kept; out-of-scope findings below CRITICAL are dropped; out-of-scope CRITICALs collapse to the single highest-confidence survivor — `reviewer-core/src/intent/filter.ts:22` (`filterByIntent`), `reviewer-core/src/review/run.ts:218` (chained after grounding) · test: `reviewer-core/test/intent-filter.test.ts:63` ("two out-of-scope CRITICALs collapse to exactly one kept — the highest confidence")
- [x] `out_of_scope` is a tag, not a waiver — declared scope can suppress noise but can never zero out a real critical defect; `INJECTION_GUARD` states this rule generally, `SCOPE_INSTRUCTION` restates it for the intent tag specifically — `reviewer-core/src/prompt.ts:16` (`INJECTION_GUARD`), `reviewer-core/src/prompt.ts:35` (`SCOPE_INSTRUCTION`) · test: `reviewer-core/test/intent-filter.test.ts:73` ("an out-of-scope CRITICAL survives alone (no collapse needed)")
- [x] The score is recomputed from the survivors of both gates (grounding, then scope), never the model's self-reported score — `reviewer-core/src/review/run.ts:229` (`scoreFromFindings(scoped.kept)`) · test: `reviewer-core/test/intent-filter.test.ts:80` ("score is recomputed from the survivors, not the pre-filter set") — details in `reviewer-core/docs/specs/intent-layer.md`

## Why confidence is derived, not model-reported
Verbalized LLM confidence is poorly calibrated (a flash-class model will happily say "high confidence" on thin evidence). `deriveConfidenceFromSources` instead looks only at which sources were actually gathered and whether every *referenced* source resolved — a fact the caller can check, not a number the model asserts — `server/src/modules/reviews/intent-helpers.ts:52` (`deriveConfidenceFromSources`).

## A dead mechanism — do not wire it up
`routeModel(task: 'intent')` in `server/src/platform/model-router.ts:27` looks like the natural place to route the classifier's model choice, but it is **unused dead code** — no import reaches it from the Intent Layer or anywhere else. The live mechanism is `container.featureModel(workspaceId, 'review_intent')`, called from `LlmIntentClassifier.classify` — `server/src/modules/reviews/compose.ts:113`. Wiring `routeModel` up would create a second, conflicting model-selection path; leave it untouched.

## Touched packages / modules
| Part | Code | Spec |
|---|---|---|
| Classifier, source collector, ports, persistence, routes | `server/src/modules/reviews/` (`intent-helpers.ts`, `intent-sources.ts`, `intent-prompt.ts`, `ports.ts`, `compose.ts`, `run-executor.ts`, `service.ts`, `routes.ts`, `repository/pull.repo.ts`), `server/src/db/schema/reviews.ts`, migration `0013_quiet_martin_li.sql` | [`server/src/modules/reviews/docs/specs/intent-layer.md`](../../server/src/modules/reviews/docs/specs/intent-layer.md) |
| Prompt slot + scope filter | `reviewer-core/src/prompt.ts`, `reviewer-core/src/intent/filter.ts`, `reviewer-core/src/review/run.ts` | [`reviewer-core/docs/specs/intent-layer.md`](../../reviewer-core/docs/specs/intent-layer.md) |
| Contracts `Intent` / `PrIntentRecord` / `Finding.out_of_scope` / `PromptAssembly.intent` / `review_intent` default | `server/src/vendor/shared/contracts/{brief,review-api,findings,trace,platform}.ts` + the `client/` copy | covered in the server + client parts |
| UI (IntentCard, hooks, copy) | `client/src/app/repos/[repoId]/pulls/[number]/_components/IntentCard/`, `client/src/lib/hooks/reviews.ts`, `client/messages/en/prReview.json`, `client/src/lib/feature-models.ts` | [`client/docs/specs/intent-layer.md`](../../client/docs/specs/intent-layer.md) |

## Open questions
- **The shared derive-once path in the executor is untested.** `server/test/intent.it.test.ts` covers the standalone routes, but not `ReviewRunExecutor#deriveIntent`'s reuse-vs-re-derive branch on `head_sha` drift (`server/src/modules/reviews/run-executor.ts:369`) nor the best-effort catch that keeps a classifier failure from failing the run (`:428`). Both are currently proven by reading the code; `server/test/reviews.it.test.ts` / `reviews-skills.it.test.ts` stub the classifier only to keep the *existing* review-run tests green (`reviews.it.test.ts:71`, `reviews-skills.it.test.ts:47`), and neither forces a stale `head_sha` or a classifier throw.
- **`Finding.out_of_scope` demonstrated only unit-level.** `filterByIntent` is unit-tested in `reviewer-core` against hand-built `Finding` fixtures (`reviewer-core/test/intent-filter.test.ts`); no test confirms an actual model call sets `out_of_scope: true` from the `SCOPE_INSTRUCTION` — that link is prompt-only, unverifiable without a live LLM.
- **Seeded repos never resolve a spec reference.** `container.git.readFile` throws for any repo that was never cloned (seed data), so `resolveSpec` always lands in `missing_context` on a dev box seeded via `db:seed` — confidence degrades to `medium`/`low` for every seeded PR regardless of how good its description is (`server/src/modules/reviews/compose.ts:88`).
