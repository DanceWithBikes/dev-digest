/**
 * `PullsRepository#findRepoByFullName` over real Postgres — the SQL-level half
 * of `pulls-resolve.test.ts`'s stubbed coverage. Proves the case-insensitive
 * lookup is exact equality, not `ilike`: `_` and `%` in the caller-supplied
 * `fullName` (the MCP `repo` arg) must NOT act as SQL wildcards.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { PullsRepository } from '../src/modules/pulls/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

d('PullsRepository#findRepoByFullName (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repo: PullsRepository;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;

    await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'my_repo', fullName: 'acme/my_repo' });

    repo = new PullsRepository(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('resolves the exact repo, case-insensitively', async () => {
    await expect(repo.findRepoByFullName(workspaceId, 'ACME/My_Repo')).resolves.toMatchObject({
      owner: 'acme',
      name: 'my_repo',
    });
  });

  it('does NOT treat "_" as a single-char SQL wildcard: "acme/myXrepo" is not "acme/my_repo"', async () => {
    await expect(repo.findRepoByFullName(workspaceId, 'acme/myXrepo')).resolves.toBeUndefined();
  });

  it('does NOT treat "%" as a SQL wildcard', async () => {
    await expect(repo.findRepoByFullName(workspaceId, 'acme/%')).resolves.toBeUndefined();
  });
});
