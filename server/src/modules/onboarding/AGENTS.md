# modules/onboarding — Onboarding Tour generator

Generates and stores the per-repo five-section onboarding tour (SPEC-02, `docs/specs/onboarding-tour.md`).

Routes: `GET /repos/:id/onboarding` (stored tour or null + `stale`, `generating`, `last_failed`) · `POST /repos/:id/onboarding/generate` (202, never waits).

Layers: `routes.ts` → `service.ts` (ports only) → `repository.ts` (the `onboarding` table) · `domain.ts` (statuses, skeletons, grounding) · `helpers.ts` (facts, manifest selection, reading path, diagram) · `prompt.ts` (prompt, budget loop, model-output schema) · `ports.ts` · `compose.ts` (the only file that sees the `Container`).

- Index facts only via the structural `OnboardingIndexReader` (`container.repoIntel`: `readIndexState`, `getRankedFiles`, `getImportEdges`, `getCriticalPaths`, `getEndpoints`); never import the repo-intel folder or pipeline.
- Manifests only via `ProjectFileReader` (`container.git.listFiles` + `readFile`); the allow-list, depth <= 1 and secret-name refusal live in `helpers.ts` (`selectProjectFiles`). Lockfiles are existence-only; manifests over 64 KB are skipped.
- Exactly one structured model call per generation (`LlmTourWriter.write`, `singleAttempt`, 60 s, no retry). Facts are computed before it; the model only writes prose and reasons, and `groundModelSections` drops anything not in the facts.
- The token budget is measured on the RENDERED prompt (`fitBudget`); every repo string is wrapped with `wrapUntrusted`.
- Generation runs on a dedicated in-process `SerialRunner` (concurrency 1, no `jobs` row, no retries, never rejects). The 90 s clock starts at acceptance. `InMemoryGate` holds the per-repo token (an ended or replaced run cannot store), the in-flight flag and the 5-POSTs-per-minute window (checked before in-flight).
- Columns `status` / `commit_sha` / `last_failed_*` win over the stored JSON; a body that fails `safeParse` reads as `tour: null`.
- Exactly one log line per generation; never log errors, prompt text or repo content.

Docs: docs/specs/ · docs/insights.md
