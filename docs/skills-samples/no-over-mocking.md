---
name: no-over-mocking
description: Flag tests that mock the unit under test, so the assertions only prove the mock was configured.
type: rubric
---

# No over-mocking

A test double should replace what you *cannot* run in a test — the network, the
clock, a paid API. Replacing the thing you are testing proves nothing.

## Smells to flag

- **Mocking the unit under test.** If the function named in the test's title is
  stubbed, the test asserts on the stub, not the code.
- **Asserting on the mock instead of the behaviour.** `expect(spy).toHaveBeenCalledWith(...)`
  as the *only* assertion checks the call, never the result. Assert on what the
  caller observes; use call assertions to support that, not to replace it.
- **Stubbing a pure collaborator.** If a dependency has no I/O, use the real one —
  a stub just freezes today's behaviour and hides the integration bug.
- **Deep mock chains.** `mockReturnValue({ a: { b: { c: () => ... } } })` encodes
  the internals of a collaborator; it breaks on refactors and passes on bugs.
- **A mock that always succeeds.** If the double can never return an error, the
  error path of the code under test is unreachable in the suite.

## What to report

Name the double, quote the line, and say which behaviour becomes unobservable
because of it. Then give the replacement: use the real collaborator, or keep the
double and add an assertion on the observable result.

## Severity

- The unit under test is itself mocked, or the only assertions are on mocks →
  **CRITICAL**: this test cannot fail when the code breaks.
- A collaborator is over-stubbed but the result is still asserted → **WARNING**.
