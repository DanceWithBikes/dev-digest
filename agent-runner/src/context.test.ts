import { describe, it, expect } from 'vitest';
import type { readFileSync } from 'node:fs';
import { resolvePrContext } from './context.js';

const event = (head: unknown) =>
  (() => JSON.stringify({ pull_request: { number: 7, title: 't', body: 'b', head } })) as unknown as typeof readFileSync;

describe('resolvePrContext identity fields (AC-120)', () => {
  it('reads repository id, run id/attempt, installation id from env and head sha from the event', () => {
    const ctx = resolvePrContext(
      {
        GITHUB_REPOSITORY: 'acme/widgets',
        GITHUB_REPOSITORY_ID: '777',
        GITHUB_RUN_ID: '9001',
        GITHUB_RUN_ATTEMPT: '3',
        DEVDIGEST_INSTALLATION_ID: 'inst-1',
        GITHUB_SHA: 'mergecommit',
        GITHUB_EVENT_PATH: '/event.json',
      },
      event({ sha: 'headsha', repo: { fork: false } }),
    );
    expect(ctx).toMatchObject({
      repositoryId: 777,
      headSha: 'headsha',
      runId: 9001,
      runAttempt: 3,
      installationId: 'inst-1',
    });
  });

  it('leaves identity fields undefined (no throw) for old workflows', () => {
    const ctx = resolvePrContext(
      { GITHUB_REPOSITORY: 'acme/widgets', GITHUB_REPOSITORY_ID: 'nope', GITHUB_EVENT_PATH: '/event.json' },
      event(undefined),
    );
    expect(ctx.repositoryId).toBeUndefined();
    expect(ctx.headSha).toBeUndefined();
    expect(ctx.runId).toBeUndefined();
    expect(ctx.runAttempt).toBeUndefined();
    expect(ctx.installationId).toBeUndefined();
  });
});
