import { describe, it, expect, vi } from 'vitest';
import { NotFoundError, ExternalServiceError } from '../src/platform/errors.js';
import { BlastService } from '../src/modules/blast/service.js';
import type {
  BlastFacadeResult,
  BlastIndexState,
  BlastLog,
  BlastPullSource,
  BlastRadiusReader,
  PriorPrsGitHub,
  PullContext,
} from '../src/modules/blast/ports.js';

const CTX: PullContext = {
  repoId: 'repo-1',
  owner: 'acme',
  name: 'widgets',
  fullName: 'acme/widgets',
  headSha: 'sha1',
  number: 42,
  changedFiles: ['src/shared.ts'],
};

function fakeLog(): BlastLog & { warns: unknown[]; infos: unknown[] } {
  const infos: unknown[] = [];
  const warns: unknown[] = [];
  return {
    infos,
    warns,
    info: (obj, msg) => infos.push({ obj, msg }),
    warn: (obj, msg) => warns.push({ obj, msg }),
  };
}

function fakePulls(ctx: PullContext | null): BlastPullSource {
  return { getPullContext: async () => ctx };
}

const EMPTY_RESULT: BlastFacadeResult = { changedSymbols: [], callers: [], impactedEndpoints: [], degraded: false };
const FULL_STATE: BlastIndexState = { status: 'full' };

describe('BlastService#forPull', () => {
  it('throws NotFoundError when the PR is not in this workspace', async () => {
    const service = new BlastService({
      pulls: fakePulls(null),
      intel: { getBlastRadius: vi.fn(), getIndexState: vi.fn() } as unknown as BlastRadiusReader,
      github: async () => ({}) as PriorPrsGitHub,
      log: fakeLog(),
    });
    await expect(service.forPull('ws-1', 'missing')).rejects.toThrow(NotFoundError);
  });

  it('calls getBlastRadius exactly once and logs the precomputed-read line', async () => {
    const getBlastRadius = vi.fn().mockResolvedValue(EMPTY_RESULT);
    const getIndexState = vi.fn().mockResolvedValue(FULL_STATE);
    const log = fakeLog();
    const service = new BlastService({
      pulls: fakePulls(CTX),
      intel: { getBlastRadius, getIndexState },
      github: async () => ({}) as PriorPrsGitHub,
      log,
    });

    const result = await service.forPull('ws-1', 'pr-1');

    expect(getBlastRadius).toHaveBeenCalledTimes(1);
    expect(getBlastRadius).toHaveBeenCalledWith(CTX.repoId, CTX.changedFiles);
    expect(log.infos).toEqual([
      { obj: { repoId: CTX.repoId, files: 1 }, msg: 'blast: reading precomputed repo-intel index' },
    ]);
    expect(result.changed_symbols).toEqual([]);
    expect(result.summary).toBe('0 symbols · 0 callers · 0 endpoints · 0 crons');
  });
});

describe('BlastService#priorPrs', () => {
  it('dedupes PRs whose commits touch more than one changed file', async () => {
    const ctx: PullContext = { ...CTX, changedFiles: ['src/a.ts', 'src/b.ts'], number: 999 };
    const github: PriorPrsGitHub = {
      listCommitsForPath: async (_repo, path) =>
        path === 'src/a.ts' ? [{ sha: 'sha-shared' }] : [{ sha: 'sha-shared' }, { sha: 'sha-b-only' }],
      listPullsForCommit: async (_repo, sha) => {
        if (sha === 'sha-shared') {
          return [{ number: 401, title: 'Shared fix', author: 'dev', mergedAt: '2026-01-02T00:00:00Z', state: 'closed' }];
        }
        if (sha === 'sha-b-only') {
          return [{ number: 402, title: 'B-only', author: 'dev2', mergedAt: '2026-01-01T00:00:00Z', state: 'closed' }];
        }
        return [];
      },
    };
    const service = new BlastService({ pulls: fakePulls(ctx), intel: {} as BlastRadiusReader, github: async () => github, log: fakeLog() });

    const { history } = await service.priorPrs('ws-1', 'pr-1');
    expect(history.map((h) => h.pr_number).sort()).toEqual([401, 402]);
    const shared = history.find((h) => h.pr_number === 401)!;
    expect(shared.files_overlap.sort()).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('a GitHub failure logs a warning and throws ExternalServiceError', async () => {
    const github: PriorPrsGitHub = {
      listCommitsForPath: async () => {
        throw new Error('GitHub is down');
      },
      listPullsForCommit: async () => [],
    };
    const log = fakeLog();
    const service = new BlastService({ pulls: fakePulls(CTX), intel: {} as BlastRadiusReader, github: async () => github, log });

    await expect(service.priorPrs('ws-1', 'pr-1')).rejects.toThrow(ExternalServiceError);
    expect(log.warns).toHaveLength(1);
  });
});
