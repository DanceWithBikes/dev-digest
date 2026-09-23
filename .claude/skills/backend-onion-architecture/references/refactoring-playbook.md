# Refactoring playbook

How to move existing code into the right ring without a rewrite, and the template for a new module.

## Contents
- Ground rules
- Extracting a fat `routes.ts` (worked example: `pulls`)
- Removing the `Container` from a service
- Getting a row type out of a signature
- Putting direct I/O behind a port
- New module template
- Order of the recorded debt

## Ground rules

- **No behaviour change in a structural change.** Same routes, same payloads, same status codes. The existing route and integration tests are the safety net - run them before and after.
- **Move in the direction of the dependency rule, one seam at a time:** SQL out first, then orchestration, then types. Each step leaves the app working and the gate no worse.
- **Scope to what you were asked to touch.** A bug fix in one handler justifies extracting that handler's query, not the module.
- After removing violations run `pnpm arch:baseline` and confirm the diff of the baseline file is deletions only.

## Extracting a fat `routes.ts` (worked example: `pulls`)

Before - `GET /repos/:id/pulls` does everything in the handler:

```ts
// modules/pulls/routes.ts (today)
app.get('/repos/:id/pulls', { schema: { params: IdParams } }, async (req): Promise<PrMeta[]> => {
  const { workspaceId } = await getContext(container, req);
  const [repo] = await container.db.select().from(t.repos)
    .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, req.params.id)));
  if (!repo) throw new NotFoundError('Repo not found');

  let gh: GitHubClient | null = null;
  try { gh = await container.github(); } catch (err) { app.log.warn(…); }
  if (gh) {
    const pulls = await gh.listPullRequests({ owner: repo.owner, name: repo.name });
    for (const pr of pulls) {
      await container.db.insert(t.pullRequests).values({ … }).onConflictDoUpdate({ … });
    }
  }
  // … 4 more queries, a cost rollup, inline row → PrMeta mapping
});
```

Four concerns are tangled: HTTP, a business policy ("local-first: sync when a token exists, never fail the read"), SQL, and mapping. Separate them in this order.

**Step 1 - SQL into a repository.** Cut each query out verbatim into a method named for what it means. No logic changes.

```ts
// modules/pulls/repository.ts
export class PullsRepository implements PullStore {
  constructor(private db: Db) {}
  getRepo(workspaceId: string, repoId: string): Promise<RepoRef | undefined> { … }
  upsertFromGitHub(workspaceId: string, repoId: string, prs: GitHubPull[]): Promise<void> { … }
  listWithRollups(workspaceId: string, repoId: string): Promise<PullListItem[]> { … }
}
```

`listWithRollups` is a read model: the join, the `sum(cost)` and the `groupBy` stay in SQL and return a type from `domain.ts`.

**Step 2 - the policy into a service.** The `try / catch` around GitHub is a product decision, so it moves with its comment.

```ts
// modules/pulls/service.ts
export interface PullsServiceDeps {
  pulls: PullStore;
  github: () => Promise<GitHubClient>;   // lazy: throws ConfigError without a token
  log: { warn(obj: unknown, msg: string): void };
}

export class PullsService {
  constructor(private deps: PullsServiceDeps) {}

  async listForRepo(workspaceId: string, repoId: string): Promise<PullListItem[]> {
    const repo = await this.deps.pulls.getRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    await this.syncFromGitHub(workspaceId, repo);      // local-first: never fails the read
    return this.deps.pulls.listWithRollups(workspaceId, repo.id);
  }
}
```

**Step 3 - mapping into `helpers.ts`,** as `toPrMeta(item: PullListItem): PrMeta`. The pure rollups already in `status.ts` (`deriveReviewStatus`, `rollupSeverities`) are domain code and stay pure.

**Step 4 - wire and thin the route.**

```ts
// modules/pulls/compose.ts
export function buildPullsService(c: Container, log: PullsServiceDeps['log']): PullsService {
  return new PullsService({ pulls: new PullsRepository(c.db), github: () => c.github(), log });
}

// modules/pulls/routes.ts (after)
app.get(
  '/repos/:id/pulls',
  { schema: { params: IdParams, response: { 200: z.array(PrMeta) } } },
  async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return (await service.listForRepo(workspaceId, req.params.id)).map(toPrMeta);
  },
);
```

**Step 5 - prove it.** The existing `pulls` integration test passes unchanged; add a unit test for `listForRepo` with an in-memory `PullStore` covering "GitHub unavailable → persisted PRs still returned", which previously needed Docker and a broken token to exercise. `pnpm arch:check`, then `pnpm arch:baseline`.

## Removing the `Container` from a service

1. List every `this.container.<x>` used in the class - that list *is* the deps interface.
2. Declare `interface XServiceDeps` with those members, typed as ports (narrow them: `jobs: { enqueue… }`).
3. Replace `this.container.` with `this.deps.`; drop the `Container` import.
4. Create `compose.ts` with `buildXService(container)`; point `routes.ts` (and `app.ts`, if it constructs the service at boot) at it.
5. Where the service built its own repository in the constructor (`new RepoRepository(container.db)`), move that `new` into `compose.ts`.

This is mechanical and behaviour-preserving, which makes it a good first step before deeper work on a module.

## Getting a row type out of a signature

Symptom: `typeof schema.x.$inferSelect`, `AgentRow`, `PullRow` in a service, helper or executor signature.

1. Write the domain type with only the fields the consumers actually read - usually far fewer than the row has.
2. Map in the repository and change its return type.
3. Fix the compile errors outward; each one is a place that depended on the table shape.
4. `helpers.ts` mappers switch from `row → DTO` to `domain → DTO` and stop importing `./repository.js`.

## Putting direct I/O behind a port

Symptom: `node:fs`, `child_process`, an SDK or `fetch` imported in a service or pipeline file.

1. Name the capability in the use case's words (`readSource(path)`, `listFiles(root)`), check whether an existing port already offers it (`GitClient.readFile`), and otherwise add a port.
2. Move the library call into an adapter; add the mock and the `ContainerOverrides` field.
3. Pass it through `deps`. The unit test for the use case now runs on an in-memory file map.

## New module template

```
modules/<name>/
  AGENTS.md            + `ln -s AGENTS.md CLAUDE.md`
  docs/insights.md     docs/specs/
  domain.ts            types + rules
  ports.ts             XStore, other narrow ports
  service.ts           XService(deps: XServiceDeps)
  repository.ts        XRepository implements XStore
  helpers.ts           toXDto and other pure functions
  compose.ts           buildXService(container)
  routes.ts            default-exported plugin, schemas incl. response
test/
  <name>-domain.test.ts
  <name>-service.test.ts        in-memory fakes, no Docker
  <name>.it.test.ts             repository + route against Testcontainers
  fakes/<name>.ts
```

Then: one import + one entry in `modules/index.ts`; new tables only through `pnpm db:generate`; `pnpm arch:check`.

## Order of the recorded debt

When asked to pay debt down rather than to build a feature, this order gives the most safety per change:

1. `pulls` - largest handler file, most SQL in routes, highest change rate.
2. `settings` (+ `feature-models.ts`), then `polling`, `workspace` - small, same recipe.
3. Remove the `Container` from `repos`, `agents`, `reviews` services - mechanical.
4. Row types out of `reviews` (`service.ts`, `run-executor.ts`, `diff-loader.ts`) and `repos/helpers.ts`.
5. `repo-intel`: filesystem and ast-grep / codeindex / tokenizer behind ports; move `constants` used by adapters out of the module.
6. `AppError.statusCode` → status table in the error handler.
