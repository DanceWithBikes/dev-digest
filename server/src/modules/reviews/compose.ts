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
    if (!specPath) return null;
    try {
      const text = await this.container.git.readFile(repo, specPath);
      attempts.push({ kind: 'spec', ref: specPath, ok: true });
      return { path: specPath, text: cap(text, MAX_SPEC_CHARS) };
    } catch {
      // Repo not cloned, path doesn't exist on this ref, etc. — best-effort.
      // Seeded/never-cloned repos always land here (reviews/docs/insights.md).
      attempts.push({ kind: 'spec', ref: specPath, ok: false });
      return null;
    }
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
