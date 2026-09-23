# Ports, adapters and the composition root

## Contents
- What a port is, and who owns it
- Where ports live
- Services take a deps object
- `compose.ts`: the module's slice of the composition root
- Adding an adapter
- The container
- Secrets, config, time and ids
- Filesystem and other "small" I/O
- Cross-module collaboration
- Smells

## What a port is, and who owns it

A port is an interface declared by the code that *needs* something, in that code's own vocabulary. An adapter is the outer-ring class that fulfils it with a real technology. Ownership is what inverts the dependency: the use case does not import the GitHub client; the GitHub client imports (or merely satisfies) the interface the use case published.

Consequences worth holding on to:

- **Shape a port by the use case, not by the library.** `GitHubClient.listPullRequests({ owner, name })` returning contract types is a port. An interface that re-exports Octokit's method names and response shapes is just Octokit with extra steps - swapping the library would still break every caller.
- **Keep it narrow.** A service that only enqueues jobs depends on `{ enqueue(...) }`, not on the whole `JobRunner`. TypeScript is structural, so the existing class satisfies the narrow interface with no `implements` and no change to `platform/jobs.ts`.
- **No port without a reason.** The reasons are: the call leaves the process, or a test needs to substitute it. A pure function needs neither.

## Where ports live

| Port | Location |
|---|---|
| Needed by one module (its store, a narrow job queue, a clock) | `modules/<name>/ports.ts` |
| External system used by several modules or by `reviewer-core` (`LLMProvider`, `GitClient`, `GitHubClient`, `SecretsProvider`, …) | `@devdigest/shared` → `adapters.ts` (both copies) |
| A module's facade offered to other modules (`RepoIntel`) | that module's `types.ts`, exposed through the container |

An interface declared next to its implementation in `src/adapters/<x>/index.ts` (`DepGraph`, `Tokenizer`) is on the wrong side of the boundary: the consumer has to import from `adapters/` to name its own dependency. New ports go in the locations above.

## Services take a deps object

```ts
// modules/repos/service.ts
import type { GitClient, SecretsProvider } from '@devdigest/shared';
import type { RepoStore, JobQueue } from './ports.js';

export interface RepoServiceDeps {
  repos: RepoStore;
  git: GitClient;
  secrets: SecretsProvider;
  jobs: JobQueue;
}

export class RepoService {
  constructor(private deps: RepoServiceDeps) {}

  async refresh(workspaceId: string, id: string): Promise<{ status: 'refreshing' }> {
    const repo = await this.deps.repos.getById(workspaceId, id);
    if (!repo) throw new NotFoundError('Repo not found');
    await this.deps.jobs.enqueue(workspaceId, CLONE_JOB_KIND, cloneJobPayload(repo));
    return { status: 'refreshing' };
  }
}
```

Why not `constructor(private container: Container)`, which is what existing services do? Because the container is a service locator: the signature says "I might use anything", the real dependency list is scattered through the method bodies, and a unit test must build a container - which needs a `Db`, which needs Postgres. A deps object is the dependency list, and a test passes four small fakes.

One object parameter rather than positional arguments: adding a dependency does not reorder call sites, and the names document the wiring.

## `compose.ts`: the module's slice of the composition root

```ts
// modules/repos/compose.ts
import type { Container } from '../../platform/container.js';
import { RepoRepository } from './repository.js';
import { RepoService } from './service.js';

export function buildRepoService(c: Container): RepoService {
  return new RepoService({
    repos: new RepoRepository(c.db),
    git: c.git,
    secrets: c.secrets,
    jobs: c.jobs,
  });
}
```

`routes.ts` calls `buildRepoService(app.container)` once at plugin registration. This keeps three properties at once: the route never names a repository, the service never names the container, and a new module still registers itself without editing `container.ts`.

Keep `compose.ts` free of logic - no conditionals beyond choosing an implementation, no I/O. Lazy or key-dependent dependencies (`container.github()`, `container.llm(id)`) are passed as the factory function itself: `github: () => c.github()`, typed in the port as `() => Promise<GitHubClient>`.

## Adding an adapter

All four, in one change:

1. The port interface (see "Where ports live").
2. The implementation in `src/adapters/<name>/`, translating SDK payloads and SDK errors into contract types and `ExternalServiceError`.
3. A mock in `src/adapters/mocks.ts` that records calls and returns caller-supplied fixtures.
4. A field in `ContainerOverrides` and a getter / factory in `Container` that checks the override first.

Adapters are constructed only in `platform/container.ts`. A module that calls `new OctokitGitHubClient()` has bypassed the test seam and the secret handling in one line.

## The container

`platform/container.ts` is hand-written on purpose. What matters architecturally is that there is exactly one composition root; whether a library builds the object graph is an implementation detail, and here a class with lazy getters, an `overrides` parameter and `invalidateSecretCaches()` is shorter than the configuration a DI library would need.

Do not turn it into a registry of every service. It holds what is shared: config, db, adapters, the job runner, the bus, and the few repositories / facades that other modules consume. Module-private wiring belongs in `compose.ts`.

`runBus` is a module-level singleton assigned into the container. Treat the container field as the only way to reach it; importing `platform/sse.ts` from a module would create a second, ungated path.

## Secrets, config, time and ids

- Secrets are read only through the `SecretsProvider` port, and only `adapters/secrets/local.ts` touches the file or `process.env`. A service never reads `process.env`.
- Config values a use case needs are passed in `deps` as plain values (`cloneDepth: number`), not as the `AppConfig` object.
- `new Date()` and `crypto.randomUUID()` are hidden inputs. Where a rule depends on them (staleness, expiry), take `now: Date` as an argument or a `clock: () => Date` dep, so the rule is testable without fake timers.

## Filesystem and other "small" I/O

`node:fs` is I/O like any other; the fact that it needs no credentials does not make it part of the centre. A use case that reads files takes a port (`GitClient.readFile` already exists for repository contents). `repo-intel`'s direct `fs` use is recorded debt, not a pattern.

## Cross-module collaboration

The gate's rule forbids importing another module's **folder**, not reading another module's **tables**. Both routes below are legal; pick by whether the other module owns *behaviour* over that data or merely stores it.

| Need | Do |
|---|---|
| Another module's data, and it owns rules over it (derived state, validation, invariants beyond tenancy) | declare a narrow port; `compose.ts` fills it from `container.agentsRepo` / `container.reviewRepo` - so its rules are applied once, by it |
| Plain rows you can read correctly on your own (a lookup, a join for a read model) | query the tables from **your** repository. Fewer couplings, and you are not blocked when the owning module has no repository to borrow (`pulls` has none today). You inherit the duty to scope by `workspaceId`. |
| Call another module's behaviour | that module exposes a facade interface (`RepoIntel`) on the container |
| Share a literal or a pure helper | promote it to `modules/_shared/` (or `@devdigest/shared` if the client needs it too) |
| React to another module's event | enqueue a job by kind through the job-queue port; the kind constant lives in `_shared` |

Importing `../repo-intel/constants.js` from `repos/service.ts` is the existing counter-example: a job-kind string pulled one module into another.

## Smells

- A service method whose first line is `const gh = await this.container.github()`.
- A port with `any`, `unknown` payloads, or a library type in its signature.
- A mock that is harder to write than the adapter - the port is too wide.
- An interface with exactly one implementation *and* no test double *and* no process boundary - delete it.
- `compose.ts` with an `if` that encodes a business rule.
