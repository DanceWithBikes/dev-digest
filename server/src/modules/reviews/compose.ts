import type { RepoRef } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import type { ReviewRepository } from './repository.js';
import { MAX_ISSUE_BODY_CHARS, MAX_SPEC_CHARS, INTENT_MAX_TOKENS, INTENT_TEMPERATURE } from './constants.js';
import { parseIssueRef, parseSpecRef } from './intent-helpers.js';
import { IntentSchema, SYSTEM_PROMPT, buildUserPrompt } from './intent-prompt.js';
import type {
  ClassifyResult,
  GatheredIntentSources,
  GatheredIssue,
  GatheredSpec,
  IntentClassifier,
  IntentDiffFiles,
  IntentSourceCollector,
  PrForIntent,
} from './ports.js';

/**
 * Module composition root for the Intent Layer (L03): the one place that
 * knows both the `Container` and the concrete implementations of
 * `ports.ts`, so `service.ts` (and, later, `ReviewRunExecutor`) can be
 * unit-tested with two small fakes and no GitHub token, git clone or
 * database. Modeled on `conventions/compose.ts:72-91`.
 */

function cap(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) : text;
}

/**
 * Gathers the Intent Layer's evidence: title/body straight off the PR row,
 * the linked issue via the GitHub adapter, a referenced plan/spec via
 * `container.git.readFile`, and this PR's commit messages via the reviews
 * repository (`commitsForPull` — `pulls` owns the table, `reviews` reads it;
 * plan §1 source 6 caveat: `no-cross-module-imports` forbids reaching into
 * `pulls/repository.ts`). Every remote attempt is best-effort:
 * `container.github()` / `container.git` throw when unconfigured, and that
 * must never fail `collect` — only degrade `missing_context[]`.
 */
class RepoIntentSourceCollector implements IntentSourceCollector {
  constructor(
    private container: Container,
    private repo: ReviewRepository,
  ) {}

  async collect(
    pr: PrForIntent,
    repo: RepoRef,
    diff: IntentDiffFiles,
  ): Promise<GatheredIntentSources> {
    const attempts: GatheredIntentSources['attempts'] = [];
    attempts.push({ kind: 'title', ref: null, ok: true });
    attempts.push({ kind: 'body', ref: null, ok: Boolean(pr.body?.trim()) });

    const issue = await this.resolveIssue(pr, repo, attempts);
    const spec = await this.resolveSpec(pr, repo, attempts);

    attempts.push({ kind: 'files', ref: null, ok: diff.files.length > 0 });
    const commitMessages = (await this.repo.commitsForPull(pr.id)).map((c) => c.message);
    attempts.push({ kind: 'commits', ref: null, ok: true });

    return { pr, issue, spec, files: diff.files, commitMessages, attempts };
  }

  private async resolveIssue(
    pr: PrForIntent,
    repo: RepoRef,
    attempts: GatheredIntentSources['attempts'],
  ): Promise<GatheredIssue | null> {
    const issueNumber = parseIssueRef(pr.body);
    if (issueNumber == null) return null;
    try {
      const github = await this.container.github();
      const issue = await github.getIssue(repo, issueNumber);
      attempts.push({ kind: 'issue', ref: `#${issueNumber}`, ok: true });
      return {
        number: issue.number,
        title: issue.title,
        body: issue.body ? cap(issue.body, MAX_ISSUE_BODY_CHARS) : null,
      };
    } catch {
      // GITHUB_TOKEN not configured, issue not found, etc. — best-effort.
      attempts.push({ kind: 'issue', ref: `#${issueNumber}`, ok: false });
      return null;
    }
  }

  private async resolveSpec(
    pr: PrForIntent,
    repo: RepoRef,
    attempts: GatheredIntentSources['attempts'],
  ): Promise<GatheredSpec | null> {
    const specPath = parseSpecRef(pr.body);
    if (!specPath) {
      // Recorded, not skipped: "this PR links no spec or plan" is evidence
      // about how thin the intent's basis is, and the card says so. A null
      // `ref` is what separates it from a spec that was named but unreadable —
      // `describeMissingSource` renders the two differently.
      attempts.push({ kind: 'spec', ref: null, ok: false });
      return null;
    }
    try {
      const text = await this.readSpecAtHead(pr, repo, specPath);
      attempts.push({ kind: 'spec', ref: specPath, ok: true });
      return { path: specPath, text: cap(text, MAX_SPEC_CHARS) };
    } catch {
      // Repo not cloned, path doesn't exist on any reachable ref, etc. —
      // best-effort. Seeded/never-cloned repos always land here
      // (reviews/docs/insights.md).
      attempts.push({ kind: 'spec', ref: specPath, ok: false });
      return null;
    }
  }

  /**
   * Reads the linked plan/spec AS OF THE PR'S HEAD, not off the clone's working
   * tree. The clone is only ever advanced by `sync(repo, repo.defaultBranch)`
   * (`repo-intel/service.ts`), so a spec a PR introduces about itself does not
   * exist on disk until that PR merges — which is why every self-documenting PR
   * used to render `Linked spec "…" could not be read`.
   *
   * Three attempts, cheapest first, first hit wins:
   *  1. `git show <head_sha>:<path>` — no network when the sha is already in the
   *     clone (a PR opened before the last sync, or the head already merged);
   *  2. `fetchPullHead` (`origin pull/<n>/head:pr-<n>`, which GitHub also serves
   *     for fork PRs) and the same read off `pr-<n>` — one fetch;
   *  3. the working tree — the default-branch copy, all a non-GitHub remote or
   *     an offline box can offer, and still right for an already-merged spec.
   *
   * Throws only if all three fail, so `resolveSpec` records `ok: false` exactly
   * when no ref we can reach has the file.
   */
  private async readSpecAtHead(pr: PrForIntent, repo: RepoRef, specPath: string): Promise<string> {
    const git = this.container.git;
    try {
      return await git.readFileAt(repo, pr.headSha, specPath);
    } catch {
      // head sha not in this clone (shallow, or pushed since the last sync).
    }
    try {
      await git.fetchPullHead(repo, pr.number);
      return await git.readFileAt(repo, `pr-${pr.number}`, specPath);
    } catch {
      // Not a GitHub remote, no network, or the PR ref is gone.
    }
    return git.readFile(repo, specPath);
  }
}

/** The one step that calls a model. Its provider+model come from Settings
 *  (`FEATURE_MODELS.review_intent`), same pattern as `LlmConventionAnalyst`. */
class LlmIntentClassifier implements IntentClassifier {
  constructor(private container: Container) {}

  async classify(workspaceId: string, sources: GatheredIntentSources): Promise<ClassifyResult> {
    const choice = await this.container.featureModel(workspaceId, 'review_intent');
    const llm = await this.container.llm(choice.provider);
    const result = await llm.completeStructured({
      model: choice.model,
      schema: IntentSchema,
      schemaName: 'pr_intent',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(sources) },
      ],
      temperature: INTENT_TEMPERATURE,
      maxTokens: INTENT_MAX_TOKENS,
    });
    return {
      intent: result.data,
      provider: choice.provider,
      model: result.model,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      costUsd: result.costUsd,
    };
  }
}

/** What a run needs to derive intent — injected into `ReviewRunExecutor`'s
 *  constructor (a later, separate run) rather than pulled off the `Container`
 *  inside the executor, keeping the LLM call out of the application ring. */
export interface IntentEngine {
  collector: IntentSourceCollector;
  classifier: IntentClassifier;
}

export function makeIntentEngine(container: Container, repo: ReviewRepository): IntentEngine {
  return {
    collector: new RepoIntentSourceCollector(container, repo),
    classifier: new LlmIntentClassifier(container),
  };
}
