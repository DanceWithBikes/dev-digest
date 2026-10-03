# Spec: Onboarding Tour — e2e

Spec ID: SPEC-02
Status: approved
Overview: [../../../docs/specs/onboarding-tour.md](../../../docs/specs/onboarding-tour.md)

## Scope in this module

One deterministic browser flow covers the page against the seeded, never-cloned repo `acme/payments-api`. It reaches the page from the sidebar, asserts the empty state, then generates and asserts the honest `no_data` outline banner. No model is called, because a repo with no clone never reaches the model step.

## Acceptance criteria (EARS)

- [ ] AC-104 The e2e suite shall open the Onboarding Tour from the sidebar for the seeded repo `acme/payments-api` and confirm the empty state titled "Generate onboarding tour" renders.
- [ ] AC-105 The e2e suite shall click "Generate onboarding tour" for the seeded repo, which has no clone, and confirm the `no_data` banner sentence of AC-87 renders, without any model call.

## Module notes

- Flows use seeded data only and never call an LLM; assertions are `wait --text` / `wait --url` with deterministic locators: `e2e/AGENTS.md:15-17`.
- The existing flow `06-onboarding` covers the add-repository screen at `/onboarding`, which is a different page (`e2e/README.md:101`).
