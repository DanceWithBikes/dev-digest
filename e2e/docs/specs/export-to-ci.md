# Spec: Export to CI — e2e

Spec ID: SPEC-05
Status: implemented
Overview: [../../../docs/specs/export-to-ci.md](../../../docs/specs/export-to-ci.md)

## Scope in this module

One deterministic browser flow proves the export path end to end against the mock GitHub client: CI tab → wizard → preview → install → installation row. It relies on the studio and the `ci` module. The real GitHub Actions run is the overview's manual verification (AC-126 to AC-130), not part of this suite.

## Acceptance criteria (EARS)

- [ ] AC-125 A hermetic e2e flow shall open the wizard from the agent's CI tab, step through Target, Preview (listing every bundle file) and Configure, install as a PR against the mock GitHub client, and then see an installation row for that repository with state `pr_open`. — untested / manual (T4): flow `e2e/specs/14-export-to-ci.flow.json` is written (37 lines) but was never run — `agent-browser` was not installed on the verifying machine and the hermetic run was skipped; see OQ-4

## Module notes

- A freshly seeded stack has no `agent_runs`, so this flow cannot assert ingested CI runs. It asserts only the installation row (`docs/insights.md:29`).
- The prebuilt runner bundle must exist on the hermetic stack, otherwise preview fails by design (overview AC-14).
- The hermetic stack boots the server with no overrides and so builds a real GitHub client (`docs/plans/export-to-ci/plan.md:26`). AC-125's "mock GitHub client" therefore needs a test-only switch scoped to the `ci` module; a global switch would break the existing PR flows that refetch PRs from GitHub. This is test infrastructure, not a behaviour change.
