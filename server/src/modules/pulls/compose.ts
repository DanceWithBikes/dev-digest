import type { Container } from '../../platform/container.js';
import type { SummaryGenerator, SummaryInput, SummaryOutput, WarnLogger } from './ports.js';
import { PullsRepository } from './repository.js';
import { PullsService } from './service.js';
import { SUMMARY_MAX_TOKENS, SUMMARY_TEMPERATURE } from './constants.js';
import { SUMMARY_SYSTEM_PROMPT, buildSummaryPrompt } from './summary-prompt.js';

/**
 * The one step that calls a model for step 8's "What this does" summary. Its
 * provider+model come from Settings (`FEATURE_MODELS.smart_diff`), same
 * pattern as `LlmIntentClassifier` (`reviews/compose.ts`) — a plain `complete`
 * call, not `completeStructured`, since the output is prose, not a schema.
 */
class LlmSummaryGenerator implements SummaryGenerator {
  constructor(private container: Container) {}

  async summarize(workspaceId: string, file: SummaryInput): Promise<SummaryOutput> {
    const choice = await this.container.featureModel(workspaceId, 'smart_diff');
    const llm = await this.container.llm(choice.provider);
    const result = await llm.complete({
      model: choice.model,
      messages: [
        { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
        { role: 'user', content: buildSummaryPrompt(file) },
      ],
      temperature: SUMMARY_TEMPERATURE,
      maxTokens: SUMMARY_MAX_TOKENS,
    });
    return {
      summary: result.text.trim(),
      provider: choice.provider,
      model: result.model,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      costUsd: result.costUsd,
    };
  }
}

/** Module composition root: the only file here that sees the container. */
export function makePullsService(container: Container, log: WarnLogger): PullsService {
  return new PullsService({
    repo: new PullsRepository(container.db),
    github: () => container.github(),
    summaryGenerator: new LlmSummaryGenerator(container),
    log,
  });
}
