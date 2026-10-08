import type { Container } from '../../platform/container.js';
import { reviewPullRequest } from '@devdigest/reviewer-core';
import { CASE_TIMEOUT_MS } from './constants.js';
import { withRequestDeadline } from './helpers.js';
import { EvalRepository } from './repository.js';
import { EvalBatchRunner } from './runner.js';
import { EvalService } from './service.js';
import type {
  AgentSource,
  EvalLog,
  FindingSource,
  LlmResolver,
  ReviewEngine,
  ReviewEngineInput,
  ReviewEngineResult,
} from './ports.js';

/**
 * Module composition root: the only file here that sees the container. It adapts
 * `container.reviewRepo` / `container.agentsRepo` structurally to this module's
 * narrow ports — no other module's folder is imported.
 */

// Compile-time port-shape assertions.
type Assert<T extends true> = T;
export type FindingSourceMatches = Assert<Container['reviewRepo'] extends FindingSource ? true : false>;
export type AgentSourceMatches = Assert<Container['agentsRepo'] extends AgentSource ? true : false>;

/** The one call into the review engine. Forwards only the frozen fields (AC-49). */
class CoreReviewEngine implements ReviewEngine {
  async run(input: ReviewEngineInput): Promise<ReviewEngineResult> {
    const outcome = await reviewPullRequest({
      systemPrompt: input.systemPrompt,
      model: input.model,
      diff: input.diff,
      llm: input.llm,
      strategy: input.strategy,
      ...(input.skills ? { skills: input.skills } : {}),
      ...(input.prDescription ? { prDescription: input.prDescription } : {}),
      task: input.task,
    });
    return {
      kept: outcome.review.findings,
      dropped: outcome.dropped.map((d) => d.finding),
      mode: outcome.mode,
      tokensIn: outcome.tokensIn,
      tokensOut: outcome.tokensOut,
      costUsd: outcome.costUsd,
    };
  }
}

export function makeEvalService(container: Container, log: EvalLog): EvalService {
  const store = new EvalRepository(container.db);
  const llm: LlmResolver = { resolve: async (provider) =>
      withRequestDeadline(await container.llm(provider), CASE_TIMEOUT_MS),
  };
  const runner = new EvalBatchRunner({ store, engine: new CoreReviewEngine(), llm, log });
  return new EvalService({
    store,
    findings: container.reviewRepo,
    agents: container.agentsRepo,
    runner,
    log,
  });
}
