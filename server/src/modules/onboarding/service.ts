import type { OnboardingStatus, OnboardingTour, OnboardingTourResponse } from '@devdigest/shared';
import { NotFoundError, RateLimitError } from '../../platform/errors.js';
import {
  GENERATION_TIMEOUT_MS,
  LLM_TIMEOUT_MS,
  LOG_MESSAGE,
  MANIFEST_MAX_CHARS,
  RATE_LIMIT_MAX,
} from './constants.js';
import {
  groundModelSections,
  keepsStoredTour,
  resolveStatus,
  skeletonSections,
  type Facts,
  type TourSections,
} from './domain.js';
import { assembleFacts, selectProjectFiles, toTourResponse, type ManifestFile } from './helpers.js';
import type {
  Clock,
  GenerationGate,
  GenerationRunner,
  OnboardingIndexReader,
  OnboardingLog,
  OnboardingStore,
  ProjectFileReader,
  RepoInfo,
  TourWriter,
} from './ports.js';
import { SYSTEM_PROMPT, fitBudget } from './prompt.js';

export interface OnboardingServiceDeps {
  store: OnboardingStore;
  index: OnboardingIndexReader;
  files: ProjectFileReader;
  writer: TourWriter;
  gate: GenerationGate;
  runner: GenerationRunner;
  log: OnboardingLog;
  clock: Clock;
}

/** What a run has learned so far — a timed-out run is stored from this. */
interface RunContext {
  provider: string;
  model: string;
  commitSha: string;
  indexedFiles: number;
  candidateFiles: number;
  facts: Facts | null;
  dropped: number;
  modelCallMade: boolean;
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
}

interface Draft {
  status: OnboardingStatus;
  sections: TourSections;
}

class DeadlineError extends Error {}

/**
 * Onboarding Tour use cases. Takes ports only. One structured model call per
 * generation, never retried; every failure ends in an honest status.
 */
export class OnboardingService {
  constructor(private deps: OnboardingServiceDeps) {}

  /** Rejects with a `DeadlineError` after `ms` on the clock port; `clear` releases the timer. */
  private deadline(ms: number): { promise: Promise<never>; clear: () => void } {
    const timer = this.deps.clock.after(ms);
    return {
      promise: timer.promise.then(() => {
        throw new DeadlineError();
      }),
      clear: timer.clear,
    };
  }

  async getTour(workspaceId: string, repoId: string): Promise<OnboardingTourResponse> {
    const { store, gate } = this.deps;
    if (!(await store.getRepo(workspaceId, repoId))) throw new NotFoundError('Repository not found');
    const stored = await store.getTour(workspaceId, repoId);
    const stale = stored.tour ? await this.isStale(repoId, stored.tour.commit_sha) : false;
    return toTourResponse(stored, { stale, generating: gate.isInFlight(repoId) });
  }

  /** AC-62. A null state or a failing read means "not stale". */
  private async isStale(repoId: string, commitSha: string): Promise<boolean> {
    try {
      const state = await this.deps.index.readIndexState(repoId);
      return state ? state.lastIndexedSha !== commitSha : false;
    } catch {
      return false;
    }
  }

  async requestGeneration(workspaceId: string, repoId: string): Promise<{ generating: true }> {
    const { store, gate, runner, clock } = this.deps;
    if (!(await store.getRepo(workspaceId, repoId))) throw new NotFoundError('Repository not found');

    const acceptedAt = clock.now();
    // Every POST counts, including one that will be deduplicated (AC-34).
    if (!gate.admit(repoId, acceptedAt)) {
      throw new RateLimitError(`At most ${RATE_LIMIT_MAX} generations per minute for a repository`);
    }
    const token = gate.tryBegin(repoId);
    if (token === null) return { generating: true }; // AC-33

    try {
      runner.submit(() => this.runGeneration(workspaceId, repoId, token, acceptedAt));
    } catch (err) {
      gate.end(repoId, token);
      throw err;
    }
    return { generating: true };
  }

  /** Never rejects: every failure becomes a status. */
  private async runGeneration(
    workspaceId: string,
    repoId: string,
    token: number,
    acceptedAt: number,
  ): Promise<void> {
    const { store, gate, writer, clock, log } = this.deps;
    const startedAt = clock.now();
    const ctx: RunContext = {
      provider: '',
      model: '',
      commitSha: '',
      indexedFiles: 0,
      candidateFiles: 0,
      facts: null,
      dropped: 0,
      modelCallMade: false,
      tokensIn: 0,
      tokensOut: 0,
      costUsd: null,
    };
    let status: OnboardingStatus = 'index_failed';
    try {
      const repo = await store.getRepo(workspaceId, repoId);
      if (!repo) {
        status = 'no_data';
        return;
      }
      const described = await writer.describe(workspaceId);
      ctx.provider = described.provider;
      ctx.model = described.model;

      // The clock started at acceptance: a run queued behind another can time out.
      const remaining = acceptedAt + GENERATION_TIMEOUT_MS - clock.now();
      const limit = this.deadline(remaining);
      let draft: Draft;
      try {
        // Already out of time (it waited in the queue): do not start work at all.
        if (remaining <= 0) throw new DeadlineError();
        draft = await Promise.race([this.generate(workspaceId, repoId, repo, ctx), limit.promise]);
      } catch (err) {
        if (!(err instanceof DeadlineError)) throw err;
        draft = { status: 'timed_out', sections: skeletonSections(ctx.facts) };
      } finally {
        limit.clear();
      }
      status = draft.status;

      const tour: OnboardingTour = {
        repo_full_name: repo.fullName,
        commit_sha: ctx.commitSha,
        generated_at: new Date(clock.now()).toISOString(),
        status: draft.status,
        indexed_files: ctx.indexedFiles,
        candidate_files: ctx.candidateFiles,
        dropped_file_facts: ctx.dropped,
        provider: ctx.provider,
        model: ctx.model,
        model_call_made: ctx.modelCallMade,
        tokens_in: ctx.tokensIn,
        tokens_out: ctx.tokensOut,
        cost_usd: ctx.costUsd,
        sections: draft.sections,
      };
      await this.persist(workspaceId, repoId, token, tour);
    } catch {
      // Unexpected failure (a DB blip while storing, say): nothing is stored and
      // no detail is logged — only the status line below.
    } finally {
      gate.end(repoId, token);
      log.info(
        {
          repoId,
          status,
          fileFacts: ctx.facts?.fileFacts.length ?? 0,
          runCommands: ctx.facts?.runCommands.length ?? 0,
          tokensIn: ctx.tokensIn,
          tokensOut: ctx.tokensOut,
          durationMs: clock.now() - startedAt,
        },
        LOG_MESSAGE,
      );
    }
  }

  /** Stores the tour only if this run still owns the repo's token (AC-52, AC-53). */
  private async persist(workspaceId: string, repoId: string, token: number, tour: OnboardingTour): Promise<void> {
    const { store, gate, clock } = this.deps;
    const existing = await store.getTour(workspaceId, repoId);
    if (!gate.isCurrent(repoId, token)) return;
    if (keepsStoredTour(tour.status, existing.tour?.status ?? null)) {
      await store.recordFailedAttempt(workspaceId, repoId, tour.status, new Date(clock.now()));
    } else {
      await store.replaceTour(workspaceId, repoId, tour);
    }
  }

  /** Facts, then at most one model call, then grounding. Fills `ctx` as it goes. */
  private async generate(
    workspaceId: string,
    repoId: string,
    repo: RepoInfo,
    ctx: RunContext,
  ): Promise<Draft> {
    const { index, writer } = this.deps;
    const empty = (status: OnboardingStatus): Draft => ({ status, sections: skeletonSections(ctx.facts) });
    if (!repo.clonePath) return empty('no_data');

    // Read the index SHA first: the tour records the SHA its facts started from.
    let state;
    try {
      state = await index.readIndexState(repoId);
    } catch {
      return empty('index_failed');
    }
    if (!state) return empty('no_data');
    ctx.commitSha = state.lastIndexedSha;
    if (state.status === 'failed') return empty('index_failed');

    let facts: Facts;
    let rankedFiles: number;
    try {
      facts = await this.collectFacts(repoId, repo, state);
      rankedFiles = facts.indexedFiles;
    } catch {
      return empty('index_failed');
    }
    ctx.facts = facts;
    ctx.indexedFiles = facts.indexedFiles;
    ctx.candidateFiles = facts.candidateFiles;
    const boundedFiles = state.candidateFiles === undefined ? 0 : (state.boundedFiles ?? 0);
    const unsupported = facts.candidateFiles === 0;

    const signals = {
      cloneMissing: false,
      indexStateMissing: false,
      indexReadFailed: false,
      indexStatus: state.status,
      candidateFiles: facts.candidateFiles,
      rankedFiles,
      boundedFiles,
      llmConfigured: true,
      timedOut: false,
      llmFailed: false,
      allSkeleton: false,
    };

    const prepared = await writer.prepare(workspaceId);
    if (!prepared.configured) {
      return {
        status: resolveStatus({ ...signals, llmConfigured: false }),
        sections: skeletonSections(facts, unsupported),
      };
    }

    const fitted = fitBudget(facts);
    ctx.dropped = fitted.dropped;
    ctx.modelCallMade = true; // set just before the write: a timed-out call still counts
    const callLimit = this.deadline(LLM_TIMEOUT_MS);
    try {
      // Raced here as well as aborted by the provider: the 60 s limit holds even
      // for a provider that ignores the abort signal.
      const out = await Promise.race([
        prepared.write(
          [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: fitted.prompt },
          ],
          { timeoutMs: LLM_TIMEOUT_MS },
        ),
        callLimit.promise,
      ]);
      ctx.tokensIn = out.tokensIn;
      ctx.tokensOut = out.tokensOut;
      ctx.costUsd = out.costUsd;
      const grounded = groundModelSections(facts, out.data, { unsupported });
      return {
        status: resolveStatus({ ...signals, allSkeleton: grounded.allSkeleton }),
        sections: grounded.sections,
      };
    } catch (err) {
      // A failed call still spent tokens: take the usage the provider attached (AC-64).
      const usage = (err as { usage?: { tokensIn?: number; tokensOut?: number; costUsd?: number | null } } | null)?.usage;
      if (usage) {
        ctx.tokensIn = usage.tokensIn ?? ctx.tokensIn;
        ctx.tokensOut = usage.tokensOut ?? ctx.tokensOut;
        ctx.costUsd = usage.costUsd ?? ctx.costUsd;
      }
      return {
        status: resolveStatus({ ...signals, llmFailed: true }),
        sections: skeletonSections(facts, unsupported),
      };
    } finally {
      callLimit.clear();
    }
  }

  /** Index readers throw -> the caller maps that to `index_failed`; clone reads degrade to nothing. */
  private async collectFacts(
    repoId: string,
    repo: RepoInfo,
    state: { lastIndexedSha: string; candidateFiles?: number },
  ): Promise<Facts> {
    const { index, files } = this.deps;
    const ref = { owner: repo.owner, name: repo.name };
    const [ranked, edges, endpoints, chains, trackedPaths] = await Promise.all([
      index.getRankedFiles(repoId),
      index.getImportEdges(repoId),
      index.getEndpoints(repoId),
      index.getCriticalPaths(repoId),
      files.listFiles(ref).catch(() => [] as string[]),
    ]);

    const selection = selectProjectFiles(trackedPaths);
    const wanted = selection.readme ? [...selection.manifests, selection.readme] : selection.manifests;
    const read: ManifestFile[] = [];
    for (const path of wanted) {
      try {
        const text = await files.readFile(ref, path);
        read.push({ path, text: path === selection.readme ? text.slice(0, MANIFEST_MAX_CHARS) : text });
      } catch {
        // A manifest that cannot be read is skipped, never fatal.
      }
    }

    return assembleFacts({
      repoFullName: repo.fullName,
      commitSha: state.lastIndexedSha,
      indexedFiles: ranked.length,
      candidateFiles: state.candidateFiles ?? ranked.length,
      ranked,
      edges,
      endpoints,
      chains,
      trackedPaths,
      files: read,
      readmePath: selection.readme,
    });
  }
}
