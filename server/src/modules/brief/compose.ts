import type { Container } from '../../platform/container.js';
import { GitContextDocReader } from '../_shared/context-doc-reader.js';
import { BriefRepository } from './repository.js';
import { BriefService } from './service.js';
import type {
  BlastMapReader,
  BriefDocReader,
  BriefLog,
  BriefWriter,
  Clock,
  PreparedBriefWriter,
} from './ports.js';
import { MAX_OUTPUT_TOKENS, SCHEMA_NAME } from './constants.js';
import { InMemoryBriefGate } from './gate.js';

/**
 * Module composition root: the only file here that sees the container.
 * `container.blastReader` and `GitContextDocReader` satisfy the structural
 * ports; neither `blast/` nor `reviews/` is imported.
 */

// Compile-time port-shape assertions.
type Assert<T extends true> = T;
export type BlastReaderMatches = Assert<ReturnType<Container['blastReader']> extends BlastMapReader ? true : false>;
export type DocReaderMatches = Assert<GitContextDocReader extends BriefDocReader ? true : false>;

/** The only LLM call site of the module. */
class LlmBriefWriter implements BriefWriter {
  constructor(private container: Container) {}

  async prepare(workspaceId: string): Promise<PreparedBriefWriter> {
    const choice = await this.container.featureModel(workspaceId, 'risk_brief');
    // Throws ConfigError when the provider has no key (AC-46).
    const llm = await this.container.llm(choice.provider);
    return {
      model: choice.model,
      write: async (messages, opts) => {
        // No `singleAttempt`: the adapter's schema re-ask stays (NFR-3).
        const result = await llm.completeStructured({
          model: choice.model,
          schema: opts.schema,
          schemaName: SCHEMA_NAME,
          messages,
          temperature: 0,
          maxTokens: MAX_OUTPUT_TOKENS,
          timeoutMs: opts.timeoutMs,
          // Reasoning tokens count against MAX_OUTPUT_TOKENS; the brief needs none.
          reasoning: { enabled: false },
        });
        return {
          data: result.data,
          model: result.model,
          tokensIn: result.tokensIn,
          tokensOut: result.tokensOut,
          costUsd: result.costUsd,
        };
      },
    };
  }
}

const systemClock: Clock = {
  now: () => Date.now(),
  after: (ms) => {
    let handle: ReturnType<typeof setTimeout> | undefined;
    const promise = new Promise<void>((resolve) => {
      handle = setTimeout(resolve, Math.max(0, ms));
    });
    return { promise, clear: () => clearTimeout(handle) };
  },
};

export function makeBriefService(container: Container, log: BriefLog): BriefService {
  return new BriefService({
    store: new BriefRepository(container.db),
    blast: container.blastReader(log),
    docs: new GitContextDocReader(container),
    writer: new LlmBriefWriter(container),
    gate: new InMemoryBriefGate(),
    log,
    clock: systemClock,
  });
}
