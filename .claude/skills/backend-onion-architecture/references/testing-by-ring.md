# Testing by ring

The architecture exists largely so that each ring can be tested at the cheapest level that proves something. If a test is awkward to write, that is usually a finding about the structure, not about the test.

## Contents
- One test style per ring
- In-memory fakes for store ports
- Fakes versus mocks
- Naming and commands
- What not to test where
- A known trap

## One test style per ring

| Ring | Test | Needs | Proves |
|---|---|---|---|
| Domain (`domain.ts`, `helpers.ts`, `reviewer-core`) | plain unit test, table-driven | nothing | the rules |
| Application (`service.ts`) | unit test with in-memory stores + adapter mocks | nothing - no Docker | orchestration: order, branching, what gets saved / enqueued, which error class |
| Infrastructure: repository | `*.it.test.ts` against Testcontainers Postgres | Docker | the SQL, the row → domain mapping, tenancy scoping, constraints |
| Infrastructure: adapter | unit test of payload / error translation with the SDK stubbed | nothing | mapping to contract types and to `ExternalServiceError` |
| Presentation (`routes.ts`) | `buildApp({ config, overrides })` + `app.inject()` | DB only if the route reaches one | schemas, status codes, error envelope, DTO shape |

The middle row is the one this codebase could not write before: with services taking the `Container`, every service test had to be an integration test.

## In-memory fakes for store ports

A store port gets one reusable fake, kept beside the tests (`test/fakes/<module>.ts`), not inside `src/`.

```ts
// test/fakes/repos.ts
export class InMemoryRepoStore implements RepoStore {
  private rows = new Map<string, Repo>();

  async findByFullName(workspaceId: string, fullName: string) {
    return [...this.rows.values()].find(
      (r) => r.workspaceId === workspaceId && r.fullName === fullName,
    );
  }
  async insert(values: NewRepo): Promise<Repo> {
    const repo = { ...values, id: crypto.randomUUID(), clonePath: null, lastPolledAt: null };
    this.rows.set(repo.id, repo);
    return repo;
  }
  // …
}
```

```ts
// test/repos-service.test.ts
it('add() is idempotent per workspace and enqueues one clone', async () => {
  const jobs = new RecordingJobQueue();
  const service = new RepoService({
    repos: new InMemoryRepoStore(),
    git: new MockGitClient(),
    secrets: new MockSecretsProvider(),
    jobs,
  });

  const first = await service.add(WS, USER, 'https://github.com/acme/api');
  const second = await service.add(WS, USER, 'https://github.com/acme/api.git');

  expect(first.created).toBe(true);
  expect(second.created).toBe(false);
  expect(jobs.enqueued).toHaveLength(1);
});
```

The fake must honour the same contract the real repository does - above all workspace scoping. To keep the two honest, write the behavioural expectations once as a function `describeRepoStore(makeStore)` and run it against the fake in a unit test and against `RepoRepository` in an `*.it.test.ts`.

## Fakes versus mocks

- **Stores → fakes.** State matters: a use case reads what it wrote. A working in-memory implementation keeps tests about behaviour ("second add is a no-op") rather than about calls ("`insert` called once with…").
- **External systems → the recording mocks in `src/adapters/mocks.ts`.** They return caller-supplied fixtures and record calls, which is what you want for an LLM or GitHub.
- Avoid `vi.mock()` of module paths for anything reachable through a port. Needing it means the dependency is imported rather than injected.

## Naming and commands

- A test that imports `test/helpers/pg.ts` must be named `*.it.test.ts`; everything else must run without Docker.
- `pnpm exec vitest run --exclude '**/*.it.test.ts'` - unit. `pnpm exec vitest run .it.test` - integration.
- Integration suites gate themselves with `dockerAvailable()` so they skip instead of failing on a machine without Docker.

## What not to test where

- Do not assert SQL-shaped details in a service test, or business branching in a repository test.
- Do not re-test domain rules through HTTP; one `inject()` test per route for the happy path and one per distinct error class is enough.
- Do not unit-test `compose.ts`; the route test exercises it.

## A known trap

`buildApp({ config })` without a `db` opens the real `DATABASE_URL`, and the boot-time reaper marks every `running` agent run as failed. Route tests that do not need a database should still pass a throwaway `db` or run with `DATABASE_URL` pointed away from the dev database. Service tests written with fakes avoid the problem entirely - they never build the app.
