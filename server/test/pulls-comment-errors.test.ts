/**
 * How `PullsService.createComment` reports a GitHub refusal. A token that can
 * read a PR but not write to it answers 403 "Resource not accessible by
 * personal access token" — unactionable on its own, so the service replaces it
 * with the message naming the permission to grant. Everything else keeps
 * GitHub's own wording (422 on a line outside the diff is the common case).
 * Pure service test: stub repo + stub GitHub client, no Postgres.
 */
import { describe, it, expect } from 'vitest';
import { PullsService, type PullsDeps } from '../src/modules/pulls/service.js';
import { COMMENT_FORBIDDEN_MESSAGE } from '../src/modules/pulls/constants.js';
import { AppError } from '../src/platform/errors.js';
import type { GitHubClient } from '@devdigest/shared';
import type { PullRecord, PullRepoRef } from '../src/modules/pulls/domain.js';

const WS = 'ws-1';

const pr = {
  id: 'pr-1',
  repoId: 'repo-1',
  number: 7,
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

const repoRef = { id: 'repo-1', owner: 'acme', name: 'api' } satisfies PullRepoRef;

/** A service whose only GitHub call — `createReviewComment` — rejects with `err`. */
function serviceRejectingWith(err: unknown): PullsService {
  const github = {
    createReviewComment: () => Promise.reject(err),
  } as unknown as GitHubClient;

  return new PullsService({
    repo: {
      getPull: async () => pr,
      getRepoById: async () => repoRef,
    },
    github: async () => github,
    log: { warn: () => {} },
    summaryGenerator: { summarise: async () => null },
  } as unknown as PullsDeps);
}

const input = { path: 'src/a.ts', line: 3, body: 'nit' };

describe('createComment — GitHub refusals', () => {
  it.each([401, 403])('rewrites a %i into the actionable permission message', async (status) => {
    const err = Object.assign(new Error('Resource not accessible by personal access token'), {
      status,
    });

    await expect(serviceRejectingWith(err).createComment(WS, pr.id, input)).rejects.toMatchObject({
      code: 'github_forbidden',
      statusCode: 403,
      message: COMMENT_FORBIDDEN_MESSAGE,
    });
  });

  it("keeps GitHub's own message for a 422 (line outside the diff)", async () => {
    const err = Object.assign(new Error('line must be part of the diff'), { status: 422 });

    const failure = await serviceRejectingWith(err)
      .createComment(WS, pr.id, input)
      .catch((e: unknown) => e);

    expect(failure).toBeInstanceOf(AppError);
    expect(failure).toMatchObject({
      code: 'github_comment_failed',
      message: 'line must be part of the diff',
    });
  });
});
