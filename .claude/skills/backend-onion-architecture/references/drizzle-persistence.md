# Drizzle: the persistence ring

How to use Drizzle so that the database stays external. For query syntax see `drizzle-orm-patterns`; this file is about where persistence code lives and what crosses its boundary.

## Contents
- The repository is the only file that knows Drizzle
- A repository implements a port
- Rows stay inside
- Tenancy is part of the port
- Read models
- Transactions: a unit-of-work port
- Errors from the driver
- Shared repositories across modules
- Migrations and schema

## The repository is the only file that knows Drizzle

Inside `modules/<name>/`, only `repository.ts` and `repository/**` import `drizzle-orm`, `src/db/schema.js`, `src/db/rows.js` or `src/db/client.js`. The gate counts `import type` too, on purpose: `typeof t.repos.$inferSelect` in a service signature is a dependency on the table definition.

Drizzle makes it tempting to query anywhere, because a query is one fluent expression. The cost shows up later: the same `and(eq(workspaceId), eq(id))` filter re-typed in six handlers, one of them forgetting the tenancy check, and no way to test the logic around it without Postgres.

When a repository grows, split it by aggregate the way `reviews` does: `repository.ts` stays the class the rest of the module sees, and delegates to free functions in `repository/<aggregate>.repo.ts` that take `(db, …)`.

## A repository implements a port

The use case declares what it needs; the repository provides it.

```ts
// modules/repos/ports.ts
import type { Repo, NewRepo } from './domain.js';

export interface RepoStore {
  findByFullName(workspaceId: string, fullName: string): Promise<Repo | undefined>;
  getById(workspaceId: string, id: string): Promise<Repo | undefined>;
  list(workspaceId: string): Promise<Repo[]>;
  insert(values: NewRepo): Promise<Repo>;
  remove(workspaceId: string, id: string): Promise<boolean>;
}
```

```ts
// modules/repos/repository.ts
export class RepoRepository implements RepoStore {
  constructor(private db: Db) {}

  async getById(workspaceId: string, id: string): Promise<Repo | undefined> {
    const [row] = await this.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, id)));
    return row && toRepo(row);
  }
}

/** Row → domain. Lives here so the row type never leaves this file. */
function toRepo(row: typeof t.repos.$inferSelect): Repo { … }
```

Port method names speak the use case's language (`findByFullName`, `markCloned`), not SQL's (`select`, `update`). A port with a generic `update(id, partial)` hands the business decision about *which* fields may change to every caller.

Keep the constructor taking `Db`, not the container: the repository's single dependency is visible, and an integration test can build one from a Testcontainers handle.

## Rows stay inside

Three shapes exist and each belongs to one ring:

| Shape | Ring | Naming | Example |
|---|---|---|---|
| Row (`$inferSelect`) | infrastructure | camelCase, `Date`, nullable columns | `typeof t.repos.$inferSelect` |
| Domain type | centre | what the rules need | `Repo` in `domain.ts` |
| DTO (Zod contract) | presentation / shared | snake_case, ISO strings | `Repo` in `@devdigest/shared` |

The repository maps row → domain; `helpers.ts` maps domain → DTO. For a CRUD module with no behaviour of its own, do not invent a third type: let the `@devdigest/shared` contract be the domain type and have the repository map row → contract directly. What is never acceptable is the row travelling outwards, because then a column rename or a new sensitive column silently changes the API.

Stored JSON (`jsonb`) is untrusted input from the past. Parse it with its Zod schema inside the repository mapping (as `agents` does with `AgentVersionConfig`), so inner code receives a valid value or a clear error.

`src/db/rows.ts` exists so that modules could share row shapes without importing each other's repositories. It solved the cross-module import by spreading rows further; new code shares a domain type through a port instead. Do not add to it.

## Tenancy is part of the port

Every domain table has `workspace_id`, and every query is scoped by it. Make that impossible to forget by putting `workspaceId` first in every port method that reads or writes tenant data. A method without it needs a comment explaining why the caller is trusted (see `RepoRepository.workspaceIdFor`).

## Read models

A list screen that needs a join, an aggregate and a rollup (`pulls` with severity counts and total cost) does not have to be assembled from entity getters. Give the repository a query method that returns a purpose-built read type declared in `domain.ts` (`PullListItem`), computed in SQL. Onion Architecture constrains the direction of imports, not the shape of queries. Rollups that are pure functions over loaded data (`rollupSeverities`) stay in the domain ring.

## Transactions: a unit-of-work port

No use case needs a multi-repository transaction today. When one does, the *use case* decides what is atomic - that is a business decision - but it must not see Drizzle's `tx`.

```ts
// ports.ts - the application ring's view
export interface UnitOfWork {
  run<T>(work: (stores: { reviews: ReviewStore; runs: RunStore }) => Promise<T>): Promise<T>;
}
```

```ts
// repository.ts - the infrastructure ring's implementation
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export class DrizzleUnitOfWork implements UnitOfWork {
  constructor(private db: Db) {}
  run<T>(work: (stores: Stores) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) =>
      work({ reviews: new ReviewRepository(tx), runs: new RunRepository(tx) }),
    );
  }
}
```

Repositories accept `Db | Tx` in their constructor (both expose the same query builder). Throwing inside `work` rolls back; Drizzle's `tx.rollback()` also works by throwing, so never catch broadly inside a unit of work. Nested `tx.transaction()` calls become savepoints.

This differs from the common advice to open the transaction in the controller and thread an optional `tx` parameter through every use case and repository: that leaks a persistence handle into two inner rings and lets the HTTP layer decide atomicity.

## Errors from the driver

A unique-constraint or foreign-key error is an infrastructure fact; "this repo already exists" is a domain fact. Translate inside the repository (or prevent it with a prior lookup, as `RepoService.add` does) and throw a class from `platform/errors.ts`. A `PostgresError` reaching the error handler becomes a generic 500 with the constraint name in the logs - correct for a bug, wrong for an expected business condition.

## Shared repositories across modules

When module B needs module A's data, B declares a port for what it needs and the container supplies A's repository for it (`container.agentsRepo`, `container.reviewRepo`). B never imports `modules/A/…`. The consumer's port should list only the methods B uses, so A's repository can evolve without B noticing.

## Migrations and schema

`src/db/schema/**` is infrastructure and is edited freely; `src/db/migrations/**` is generated by `pnpm db:generate` only. Migrations do not run on boot. None of this is visible from the inner rings - which is the point.
