# Severity bar

The skills in this repo were written at different times with different vocabularies: `react-best-practices` tags rules CRITICAL / HIGH / MEDIUM, `security` has its own classification table, `zod` ranks rule *categories* by impact, the two architecture skills have no levels at all. A gate needs one scale, so every finding is re-expressed on this one.

## critical - blocks the PR

A finding is critical only when **all three** hold:

1. **Introduced by this branch.** The offending line is added or changed in the diff, or the change makes existing code newly wrong. Debt that was already there (including everything in `server/.dependency-cruiser-known-violations.json` and the "Existing deviations" sections of the architecture skills) never blocks.
2. **Backed by a written rule.** You can name the skill and the rule, or the repo rule in an `AGENTS.md`.
3. **The consequence is concrete and serious.** You can state, in one sentence, the thing that goes wrong - not "this is bad practice".

What counts as serious:

| Kind | Examples |
|---|---|
| Security | anything the `security` skill classifies CRITICAL or HIGH: injection, missing auth/authorization on a new endpoint, a query not scoped by `workspaceId`, a secret or key in git, `dangerouslySetInnerHTML` on untrusted input, a workflow that exposes secrets to fork PRs |
| Data loss or corruption | destructive migration without a path back, a hand-edited or rewritten existing migration, a transaction boundary removed around a multi-write, a schema change that breaks existing rows |
| Broken behaviour | a rule the skill itself marks CRITICAL **and** that produces a real bug here: state derived incorrectly so the UI shows stale data, a hook called conditionally, a key that breaks reconciliation of stateful rows, an RSC/client boundary violation that fails the build or leaks server code to the client, an async API used synchronously in Next 15 |
| Boundary newly broken | a new import that points outwards across rings/layers - i.e. `pnpm arch:check` fails, or would fail once the file is included. Also: a new violation *added to the baseline* to make the check pass, or a rule weakened in `.dependency-cruiser.cjs` without the user's agreement |
| Gate failure | `arch:check` or `typecheck` fails on the touched package |
| Do-not-touch | `server/src/db/migrations/**` edited by hand; an API key anywhere but `~/.devdigest/secrets.json` / `.env` |

"Concrete" does not mean "exploitable on my laptop today". The dev setup runs a single workspace with no auth, so an unscoped query leaks nothing locally - it is still critical, because the rule exists for the day a real auth provider is wired and nobody will re-review this handler then. State the caveat in the finding; keep the severity.

A skill's own CRITICAL label is where you start, not where you end. "Over-engineering (CRITICAL)" in `react-best-practices` describes how much the pattern hurts in general; one extra `useMemo` in this diff is a nit. Conversely a rule with no label at all (every rule in `backend-onion-architecture`) is critical when breaking it has one of the consequences above.

## major - should fix, does not block

A real rule is really broken by this branch, and it will cost something later, but nothing is wrong for users today. Typical: logic left in a route handler, a service that takes the whole `Container`, a component that should be split, a missing `response` schema, business logic in a page component, a `@devdigest/shared` contract changed in one copy only, a missing test for new behaviour, `CLAUDE.md` created as a file instead of a symlink.

## minor - nit

Naming, placement that is defensible either way, a simplification, a missed convention with no consequence. One line each; skip them entirely when there are more than a handful of bigger things to say.

## When unsure

Between critical and major, ask: *would I be comfortable explaining to the author why their PR is blocked over this?* If the explanation needs "in theory" or "could eventually", it is major. If you cannot verify the consequence (you would need to run the app, or the rule's applicability depends on intent you cannot see), report it as major and say what you could not check - the "Not checked" section exists for exactly that.
