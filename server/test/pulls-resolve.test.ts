/**
 * `PullsService.resolveRepo` / `resolvePull` — the MCP surface's local-DB-only
 * repo/PR resolver (`src/mcp/AGENTS.md`). Pure service test: a stub repo, no
 * Postgres. The repository-level case-insensitive match itself is exercised
 * indirectly here (the stub simulates it); the real SQL (`ilike`) needs the
 * integration suite.
 */
import { describe, it, expect } from 'vitest';
import { PullsService, type PullsDeps } from '../src/modules/pulls/service.js';
import { NotFoundError } from '../src/platform/errors.js';
import type { PullRecord, PullRepoRef } from '../src/modules/pulls/domain.js';

const WS = 'ws-1';

const repoRef = { id: 'repo-1', owner: 'acme', name: 'widgets' } satisfies PullRepoRef;

const pull = {
  id: 'pr-1',
  repoId: 'repo-1',
  number: 42,
  title: 'Add rate limiting',
  author: 'marisa.koch',
  branch: 'feat/rl',
  base: 'main',
  headSha: 'deadbeef',
  additions: 1,
  deletions: 0,
  filesCount: 1,
  status: 'open',
  lastReviewedSha: null,
  openedAt: null,
  updatedAt: null,
  body: null,
} satisfies PullRecord;

function service(): PullsService {
  return new PullsService({
    repo: {
      getRepo: async (ws: string, repoId: string) => (ws === WS && repoId === repoRef.id ? repoRef : undefined),
      findRepoByFullName: async (ws: string, fullName: string) =>
        ws === WS && fullName.toLowerCase() === 'acme/widgets' ? repoRef : undefined,
      findPullByNumber: async (ws: string, repoId: string, number: number) =>
        ws === WS && repoId === repoRef.id && number === pull.number ? pull : undefined,
    },
    github: async () => {
      throw new Error('resolveRepo/resolvePull must never call GitHub');
    },
    log: { warn: () => {} },
    summaryGenerator: { summarize: async () => ({ summary: '', provider: '', model: '', tokensIn: 0, tokensOut: 0, costUsd: null }) },
  } as unknown as PullsDeps);
}

describe('resolveRepo', () => {
  it('resolves by repo id, workspace-scoped', async () => {
    await expect(service().resolveRepo(WS, { repoId: 'repo-1' })).resolves.toEqual(repoRef);
  });

  it('resolves by "owner/name", case-insensitively', async () => {
    await expect(service().resolveRepo(WS, { fullName: 'ACME/Widgets' })).resolves.toEqual(repoRef);
  });

  it('404s with an actionable message for an unknown repo', async () => {
    const failure = await service()
      .resolveRepo(WS, { fullName: 'acme/ghost' })
      .catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(NotFoundError);
    expect((failure as NotFoundError).message).toContain('Import it');
  });

  it('404s for the right repo in the WRONG workspace', async () => {
    await expect(service().resolveRepo('other-ws', { repoId: 'repo-1' })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('resolvePull', () => {
  it('resolves by repo + number', async () => {
    await expect(service().resolvePull(WS, 'repo-1', 42)).resolves.toEqual(pull);
  });

  it('404s with an actionable message for an unknown PR number', async () => {
    const failure = await service()
      .resolvePull(WS, 'repo-1', 999)
      .catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(NotFoundError);
    expect((failure as NotFoundError).message).toContain('Open it');
  });
});
