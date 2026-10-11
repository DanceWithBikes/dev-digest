import { Octokit } from 'octokit';
import type {
  GitHubClient,
  RepoRef,
  PrMeta,
  PrDetail,
  PrStatus,
  GitHubReviewPayload,
  CreateReviewCommentInput,
  PrReviewComment,
  OpenPrPayload,
  CommitFilesPayload,
  IssueMeta,
  CommitRef,
  CommitPullRef,
  RepoInfo,
  CommitComparison,
  WorkflowRunMeta,
  RunArtifactMeta,
  ListWorkflowRunsOptions,
  PullState,
} from '@devdigest/shared';
import { ExternalServiceError } from '../../platform/errors.js';
import { withRetry, withTimeout } from '../../platform/resilience.js';

const TIMEOUT = 30_000;

function mapStatus(state: string, merged: boolean | undefined): PrStatus {
  if (merged) return 'merged';
  if (state === 'closed') return 'closed';
  return 'open';
}

/**
 * GitHubClient over Octokit REST — thin. PAT auth (fine-grained).
 * Reads PR list/detail/files/commits/issue; posts reviews; opens PRs.
 */
export class OctokitGitHubClient implements GitHubClient {
  private octokit: Octokit;

  constructor(token: string) {
    this.octokit = new Octokit({ auth: token });
  }

  async listPullRequests(repo: RepoRef): Promise<PrMeta[]> {
    return withRetry(() =>
      withTimeout(
        (async () => {
          // Fetch open + recently merged/closed (most-recently-updated first) so
          // the list shows which PRs are merged vs still open — not just open.
          const res = await this.octokit.rest.pulls.list({
            owner: repo.owner,
            repo: repo.name,
            state: 'all',
            sort: 'updated',
            direction: 'desc',
            per_page: 50,
          });
          return res.data.map((pr) => ({
            number: pr.number,
            title: pr.title,
            author: pr.user?.login ?? 'unknown',
            branch: pr.head.ref,
            base: pr.base.ref,
            head_sha: pr.head.sha,
            additions: 0,
            deletions: 0,
            files_count: 0, // not present on the list payload; populated by getPullRequest
            status: mapStatus(pr.state, Boolean(pr.merged_at)) as PrStatus,
            opened_at: pr.created_at,
            updated_at: pr.updated_at,
          }));
        })(),
        TIMEOUT,
      ),
    );
  }

  async getPullRequest(repo: RepoRef, n: number): Promise<PrDetail> {
    return withRetry(() =>
      withTimeout(
        (async () => {
          const { data: pr } = await this.octokit.rest.pulls.get({
            owner: repo.owner,
            repo: repo.name,
            pull_number: n,
          });
          const { data: files } = await this.octokit.rest.pulls.listFiles({
            owner: repo.owner,
            repo: repo.name,
            pull_number: n,
            per_page: 100,
          });
          const { data: commits } = await this.octokit.rest.pulls.listCommits({
            owner: repo.owner,
            repo: repo.name,
            pull_number: n,
            per_page: 100,
          });
          const linkedIssue = await this.resolveLinkedIssue(repo, pr.body ?? '');
          return {
            number: pr.number,
            title: pr.title,
            author: pr.user?.login ?? 'unknown',
            branch: pr.head.ref,
            base: pr.base.ref,
            head_sha: pr.head.sha,
            additions: pr.additions,
            deletions: pr.deletions,
            files_count: pr.changed_files,
            status: mapStatus(pr.state, Boolean(pr.merged_at)) as PrStatus,
            opened_at: pr.created_at,
            updated_at: pr.updated_at,
            body: pr.body,
            files: files.map((f) => ({
              path: f.filename,
              additions: f.additions,
              deletions: f.deletions,
              patch: f.patch,
            })),
            commits: commits.map((c) => ({
              sha: c.sha,
              message: c.commit.message,
              author: c.commit.author?.name ?? c.author?.login ?? 'unknown',
              committed_at: c.commit.author?.date,
            })),
            linked_issue: linkedIssue,
          };
        })(),
        TIMEOUT,
      ),
    );
  }

  /** linked issue via regex on PR body (#123 / closes #123). */
  private async resolveLinkedIssue(repo: RepoRef, body: string): Promise<IssueMeta | undefined> {
    const m = body.match(/(?:closes|fixes|resolves)?\s*#(\d+)/i);
    if (!m?.[1]) return undefined;
    try {
      return await this.getIssue(repo, Number(m[1]));
    } catch {
      return undefined;
    }
  }

  /** Recent commits that touched `path` (newest first) — Prior PRs' evidence trail. */
  async listCommitsForPath(repo: RepoRef, path: string, limit: number): Promise<CommitRef[]> {
    return withRetry(() =>
      withTimeout(
        (async () => {
          const res = await this.octokit.rest.repos.listCommits({
            owner: repo.owner,
            repo: repo.name,
            path,
            per_page: limit,
          });
          return res.data.map((c) => ({ sha: c.sha }));
        })(),
        TIMEOUT,
      ),
    );
  }

  /** PRs GitHub associates with a commit sha — usually the one that merged it. */
  async listPullsForCommit(repo: RepoRef, sha: string): Promise<CommitPullRef[]> {
    return withRetry(() =>
      withTimeout(
        (async () => {
          const res = await this.octokit.rest.repos.listPullRequestsAssociatedWithCommit({
            owner: repo.owner,
            repo: repo.name,
            commit_sha: sha,
          });
          return res.data.map((pr) => ({
            number: pr.number,
            title: pr.title,
            author: pr.user?.login ?? 'unknown',
            mergedAt: pr.merged_at,
            state: pr.state,
          }));
        })(),
        TIMEOUT,
      ),
    );
  }

  async postReview(
    repo: RepoRef,
    n: number,
    review: GitHubReviewPayload,
  ): Promise<{ id: string }> {
    return withRetry(() =>
      withTimeout(
        (async () => {
          const res = await this.octokit.rest.pulls.createReview({
            owner: repo.owner,
            repo: repo.name,
            pull_number: n,
            body: review.body,
            event: review.event,
            comments: review.comments?.map((c) => ({
              path: c.path,
              line: c.line,
              body: c.body,
            })),
          });
          return { id: String(res.data.id) };
        })(),
        TIMEOUT,
      ),
    );
  }

  /** Shape an Octokit review-comment payload into our DTO. */
  private mapReviewComment(c: {
    id: number;
    path: string;
    line?: number | null;
    original_line?: number | null;
    side?: string | null;
    body: string;
    user: { login: string } | null;
    created_at: string;
    html_url: string;
    in_reply_to_id?: number;
  }): PrReviewComment {
    return {
      id: c.id,
      path: c.path,
      line: c.line ?? null,
      original_line: c.original_line ?? null,
      side: c.side === 'LEFT' ? 'LEFT' : 'RIGHT',
      body: c.body,
      user: c.user?.login ?? 'unknown',
      created_at: c.created_at,
      html_url: c.html_url,
      in_reply_to_id: c.in_reply_to_id ?? null,
      // GitHub drops `line` when the comment can no longer be placed on the diff.
      is_outdated: c.line == null,
    };
  }

  async listReviewComments(repo: RepoRef, n: number): Promise<PrReviewComment[]> {
    return withRetry(() =>
      withTimeout(
        (async () => {
          const res = await this.octokit.rest.pulls.listReviewComments({
            owner: repo.owner,
            repo: repo.name,
            pull_number: n,
            per_page: 100,
          });
          return res.data.map((c) => this.mapReviewComment(c));
        })(),
        TIMEOUT,
      ),
    );
  }

  async createReviewComment(
    repo: RepoRef,
    n: number,
    input: CreateReviewCommentInput,
  ): Promise<PrReviewComment> {
    return withRetry(() =>
      withTimeout(
        (async () => {
          if (input.inReplyTo != null) {
            const res = await this.octokit.rest.pulls.createReplyForReviewComment({
              owner: repo.owner,
              repo: repo.name,
              pull_number: n,
              comment_id: input.inReplyTo,
              body: input.body,
            });
            return this.mapReviewComment(res.data);
          }
          const res = await this.octokit.rest.pulls.createReviewComment({
            owner: repo.owner,
            repo: repo.name,
            pull_number: n,
            commit_id: input.commitId,
            path: input.path,
            line: input.line,
            side: input.side ?? 'RIGHT',
            body: input.body,
          });
          return this.mapReviewComment(res.data);
        })(),
        TIMEOUT,
      ),
    );
  }

  async openPullRequest(repo: RepoRef, payload: OpenPrPayload): Promise<{ url: string }> {
    return withRetry(() =>
      withTimeout(
        (async () => {
          const res = await this.octokit.rest.pulls.create({
            owner: repo.owner,
            repo: repo.name,
            title: payload.title,
            head: payload.head,
            base: payload.base,
            body: payload.body,
          });
          return { url: res.data.html_url };
        })(),
        TIMEOUT,
      ),
    );
  }

  async commitFiles(
    repo: RepoRef,
    payload: CommitFilesPayload,
  ): Promise<{ branch: string }> {
    return withRetry(() =>
      withTimeout(
        (async () => {
          const owner = repo.owner;
          const name = repo.name;
          const g = this.octokit.rest.git;

          // Parent commit: the target branch if it already exists, else the base.
          let parentSha: string;
          let branchExists = false;
          try {
            const ref = await g.getRef({ owner, repo: name, ref: `heads/${payload.branch}` });
            parentSha = ref.data.object.sha;
            branchExists = true;
          } catch {
            const baseRef = await g.getRef({ owner, repo: name, ref: `heads/${payload.base}` });
            parentSha = baseRef.data.object.sha;
          }

          // New tree layered on the parent's tree (so unrelated files are kept).
          const parentCommit = await g.getCommit({ owner, repo: name, commit_sha: parentSha });
          const tree = await g.createTree({
            owner,
            repo: name,
            base_tree: parentCommit.data.tree.sha,
            tree: [
              ...payload.files.map((f) => ({
                path: f.path,
                mode: '100644' as const,
                type: 'blob' as const,
                content: f.contents,
              })),
              ...(payload.deletePaths ?? []).map((path) => ({
                path,
                mode: '100644' as const,
                type: 'blob' as const,
                sha: null,
              })),
            ],
          });

          const commit = await g.createCommit({
            owner,
            repo: name,
            message: payload.message,
            tree: tree.data.sha,
            parents: [parentSha],
          });

          if (branchExists) {
            await g.updateRef({
              owner,
              repo: name,
              ref: `heads/${payload.branch}`,
              sha: commit.data.sha,
              force: true,
            });
          } else {
            await g.createRef({
              owner,
              repo: name,
              ref: `refs/heads/${payload.branch}`,
              sha: commit.data.sha,
            });
          }
          return { branch: payload.branch };
        })(),
        TIMEOUT,
      ),
    );
  }

  async findOpenPr(repo: RepoRef, branch: string): Promise<{ url: string } | null> {
    return withRetry(() =>
      withTimeout(
        (async () => {
          const res = await this.octokit.rest.pulls.list({
            owner: repo.owner,
            repo: repo.name,
            state: 'open',
            head: `${repo.owner}:${branch}`,
            per_page: 1,
          });
          const pr = res.data[0];
          return pr ? { url: pr.html_url } : null;
        })(),
        TIMEOUT,
      ),
    );
  }

  async getRepository(repo: RepoRef): Promise<RepoInfo> {
    const res = await withRetry(() =>
      withTimeout(this.octokit.rest.repos.get({ owner: repo.owner, repo: repo.name }), TIMEOUT),
    );
    return { id: res.data.id, full_name: res.data.full_name };
  }

  async compareCommits(
    repo: RepoRef,
    base: string,
    head: string,
  ): Promise<CommitComparison | null> {
    try {
      const res = await withRetry(() =>
        withTimeout(
          this.octokit.rest.repos.compareCommitsWithBasehead({
            owner: repo.owner,
            repo: repo.name,
            basehead: `${base}...${head}`,
          }),
          TIMEOUT,
        ),
      );
      return {
        ahead_by: res.data.ahead_by,
        commits: res.data.commits.map((c) => ({ sha: c.sha, message: c.commit.message })),
      };
    } catch (err) {
      if ((err as { status?: number }).status === 404) return null;
      throw err;
    }
  }

  async listWorkflowRuns(
    repo: RepoRef,
    workflowFile: string,
    opts: ListWorkflowRunsOptions,
  ): Promise<WorkflowRunMeta[]> {
    const res = await withRetry(() =>
      withTimeout(
        this.octokit.rest.actions.listWorkflowRuns({
          owner: repo.owner,
          repo: repo.name,
          workflow_id: workflowFile,
          status: opts.status,
          per_page: opts.perPage,
        }),
        TIMEOUT,
      ),
    );
    return res.data.workflow_runs.map((r) => ({
      id: r.id,
      run_attempt: r.run_attempt ?? 1,
      head_sha: r.head_sha,
      head_branch: r.head_branch,
      conclusion: r.conclusion,
      html_url: r.html_url,
      repository: { id: r.repository.id, full_name: r.repository.full_name },
      pull_numbers: (r.pull_requests ?? []).map((p) => p.number),
      updated_at: r.updated_at,
    }));
  }

  async listRunArtifacts(repo: RepoRef, runId: number): Promise<RunArtifactMeta[]> {
    const res = await withRetry(() =>
      withTimeout(
        this.octokit.rest.actions.listWorkflowRunArtifacts({
          owner: repo.owner,
          repo: repo.name,
          run_id: runId,
        }),
        TIMEOUT,
      ),
    );
    return res.data.artifacts.map((a) => ({
      id: a.id,
      name: a.name,
      size_in_bytes: a.size_in_bytes,
      expired: a.expired,
    }));
  }

  async downloadArtifact(repo: RepoRef, artifactId: number): Promise<Uint8Array> {
    const res = await withRetry(() =>
      withTimeout(
        this.octokit.rest.actions.downloadArtifact({
          owner: repo.owner,
          repo: repo.name,
          artifact_id: artifactId,
          archive_format: 'zip',
        }),
        TIMEOUT,
      ),
    );
    return new Uint8Array(res.data as ArrayBuffer);
  }

  async getPullState(repo: RepoRef, n: number): Promise<PullState> {
    const res = await withRetry(() =>
      withTimeout(
        this.octokit.rest.pulls.get({ owner: repo.owner, repo: repo.name, pull_number: n }),
        TIMEOUT,
      ),
    );
    if (res.data.merged) return 'merged';
    return res.data.state === 'closed' ? 'closed' : 'open';
  }

  async listTreePaths(repo: RepoRef, ref: string, prefixes: string[]): Promise<string[]> {
    return withRetry(() =>
      withTimeout(
        (async () => {
          const g = this.octokit.rest.git;
          let sha: string;
          try {
            const r = await g.getRef({ owner: repo.owner, repo: repo.name, ref: `heads/${ref}` });
            sha = r.data.object.sha;
          } catch (err) {
            if ((err as { status?: number }).status === 404) return [];
            throw err;
          }
          const commit = await g.getCommit({ owner: repo.owner, repo: repo.name, commit_sha: sha });
          const tree = await g.getTree({
            owner: repo.owner,
            repo: repo.name,
            tree_sha: commit.data.tree.sha,
            recursive: 'true',
          });
          if (tree.data.truncated) {
            // A truncated tree would hide stale manifests; fail the install loudly instead.
            throw new ExternalServiceError(
              `The file tree of ${repo.owner}/${repo.name} is too large to list completely`,
            );
          }
          return tree.data.tree
            .filter(
              (e) =>
                e.type === 'blob' && !!e.path && prefixes.some((p) => e.path!.startsWith(p)),
            )
            .map((e) => e.path as string);
        })(),
        TIMEOUT,
      ),
    );
  }

  async getIssue(repo: RepoRef, n: number): Promise<IssueMeta> {
    const res = await withRetry(() =>
      withTimeout(
        this.octokit.rest.issues.get({ owner: repo.owner, repo: repo.name, issue_number: n }),
        TIMEOUT,
      ),
    );
    return {
      number: res.data.number,
      title: res.data.title,
      body: res.data.body,
      state: res.data.state,
    };
  }

  async currentLogin(): Promise<string> {
    const res = await withRetry(() =>
      withTimeout(this.octokit.rest.users.getAuthenticated(), TIMEOUT),
    );
    return res.data.login;
  }
}
