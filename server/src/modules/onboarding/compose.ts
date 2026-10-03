import { FEATURE_MODELS } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { OnboardingRepository } from './repository.js';
import { OnboardingService } from './service.js';
import type {
  GenerationGate,
  GenerationRunner,
  OnboardingIndexReader,
  OnboardingLog,
  PreparedWriter,
  ProjectFileReader,
  TourWriter,
} from './ports.js';
import { ModelSections, SCHEMA_NAME } from './prompt.js';
import { MAX_OUTPUT_TOKENS, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS } from './constants.js';

/**
 * Module composition root: the only file here that sees the container.
 * `container.repoIntel` and `container.git` satisfy the structural ports below;
 * neither `repo-intel/` nor `src/adapters/` is imported by name.
 */

// Compile-time port-shape assertions: a drift in the facade or the git port
// fails typecheck here, early, instead of inside the deps literal below.
type Assert<T extends true> = T;
export type IndexReaderMatchesFacade = Assert<
  Container['repoIntel'] extends OnboardingIndexReader ? true : false
>;
export type FileReaderMatchesGit = Assert<Container['git'] extends ProjectFileReader ? true : false>;

const ONBOARDING_DEFAULT = FEATURE_MODELS.find((f) => f.id === 'onboarding');

/** The only LLM call site of the module. */
class LlmTourWriter implements TourWriter {
  constructor(private container: Container) {}

  /** Registry default when the settings read fails: provenance only, never a blocker. */
  async describe(workspaceId: string): Promise<{ provider: string; model: string }> {
    try {
      return await this.container.featureModel(workspaceId, 'onboarding');
    } catch {
      return {
        provider: ONBOARDING_DEFAULT?.defaultProvider ?? 'openrouter',
        model: ONBOARDING_DEFAULT?.defaultModel ?? '',
      };
    }
  }

  async prepare(workspaceId: string): Promise<PreparedWriter> {
    try {
      const choice = await this.container.featureModel(workspaceId, 'onboarding');
      // Throws ConfigError when the provider has no key (AC-40).
      const llm = await this.container.llm(choice.provider);
      return {
        configured: true,
        write: async (messages, opts) => {
          const result = await llm.completeStructured({
            model: choice.model,
            schema: ModelSections,
            schemaName: SCHEMA_NAME,
            messages,
            temperature: 0,
            maxTokens: MAX_OUTPUT_TOKENS,
            timeoutMs: opts.timeoutMs,
            singleAttempt: true,
            // Reasoning tokens count against MAX_OUTPUT_TOKENS; the tour needs none.
            reasoning: { enabled: false },
          });
          return {
            data: result.data,
            tokensIn: result.tokensIn,
            tokensOut: result.tokensOut,
            costUsd: result.costUsd,
          };
        },
      };
    } catch {
      return { configured: false };
    }
  }
}

/** Per-process generation state: tokens for in-flight runs and a sliding window of POSTs. */
class InMemoryGate implements GenerationGate {
  private tokens = new Map<string, number>();
  private posts = new Map<string, number[]>();
  private counter = 0;

  admit(repoId: string, now: number): boolean {
    const recent = (this.posts.get(repoId) ?? []).filter((at) => now - at < RATE_LIMIT_WINDOW_MS);
    // Every POST counts, including the rejected ones (AC-34), so the window is pruned by age only.
    recent.push(now);
    this.posts.set(repoId, recent);
    return recent.length <= RATE_LIMIT_MAX;
  }

  tryBegin(repoId: string): number | null {
    if (this.tokens.has(repoId)) return null;
    this.counter += 1;
    this.tokens.set(repoId, this.counter);
    return this.counter;
  }

  isCurrent(repoId: string, token: number): boolean {
    return this.tokens.get(repoId) === token;
  }

  end(repoId: string, token: number): void {
    if (this.tokens.get(repoId) === token) this.tokens.delete(repoId);
  }

  isInFlight(repoId: string): boolean {
    return this.tokens.has(repoId);
  }
}

/**
 * Concurrency-1 promise chain. No `jobs` row, no retries; a task's rejection is
 * swallowed here, so no unhandled rejection can reach the process (a dropped
 * rejected job `done` once crashed the API).
 */
class SerialRunner implements GenerationRunner {
  private tail: Promise<void> = Promise.resolve();

  submit(task: () => Promise<void>): void {
    this.tail = this.tail.then(task).catch(() => undefined);
  }
}

export function makeOnboardingService(container: Container, log: OnboardingLog): OnboardingService {
  return new OnboardingService({
    store: new OnboardingRepository(container.db),
    index: container.repoIntel,
    files: container.git,
    writer: new LlmTourWriter(container),
    gate: new InMemoryGate(),
    runner: new SerialRunner(),
    log,
    clock: {
      now: () => Date.now(),
      after: (ms) => {
        let handle: ReturnType<typeof setTimeout> | undefined;
        const promise = new Promise<void>((resolve) => {
          handle = setTimeout(resolve, Math.max(0, ms));
        });
        return { promise, clear: () => clearTimeout(handle) };
      },
    },
  });
}
