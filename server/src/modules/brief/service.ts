import type { BlastRadius, BriefMissing, PrBrief } from '@devdigest/shared';
import {
  ConfigError,
  ConflictError,
  ExternalServiceError,
  NotFoundError,
  RateLimitError,
} from '../../platform/errors.js';
import {
  BRIEF_TIMEOUT_MS,
  DOC_READ_TIMEOUT_MS,
  ERR_FAILED,
  ERR_IN_FLIGHT,
  ERR_RATE_LIMIT,
  ERR_TIMEOUT,
  LOG_INVALID_STORED,
  LOG_MESSAGE,
  MISSING_BLAST_UNAVAILABLE,
} from './constants.js';
import type { PullForBrief } from './domain.js';
import {
  applyDiffBudget,
  applyDocBudget,
  blastMissing,
  callerLines,
  capBody,
  collectBriefDocPaths,
  groundBrief,
  intentMissing,
} from './helpers.js';
import type {
  BlastMapReader,
  BriefDocReader,
  BriefGate,
  BriefLog,
  BriefStore,
  BriefWriter,
  Clock,
} from './ports.js';
import { briefOutputSchema, buildMessages } from './prompt.js';

export interface BriefServiceDeps {
  store: BriefStore;
  blast: BlastMapReader;
  docs: BriefDocReader;
  writer: BriefWriter;
  gate: BriefGate;
  log: BriefLog;
  clock: Clock;
}

/** What a run has learned so far — enough for the single failure log line. */
interface RunState {
  model: string | null;
  /** Set (synchronously with the `isCurrent` check) once `build` starts saving. */
  committing: boolean;
  /** Set when the deadline answered the POST; `build` must not start saving after it. */
  abandoned: boolean;
}

class DeadlineError extends Error {}

/**
 * PR Brief use cases. Takes ports only. A brief is generated only by `generate`
 * (AC-15): one structured model call, grounded, then stored in place of the old one.
 */
export class BriefService {
  constructor(private deps: BriefServiceDeps) {}

  /** AC-9, AC-10, AC-11: never calls the writer. */
  async getBrief(workspaceId: string, prId: string): Promise<PrBrief | null> {
    const pull = await this.deps.store.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const stored = await this.deps.store.getBrief(prId);
    if (!stored) return null;
    if (stored.kind === 'invalid') {
      this.deps.log.warn({ prId }, LOG_INVALID_STORED);
      return null;
    }
    return stored.brief;
  }

  async generate(workspaceId: string, prId: string): Promise<PrBrief> {
    const { store, gate, clock, log } = this.deps;
    const startedAt = clock.now();

    const pull = await store.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    // The window counts every POST that passed the 404 check, before the in-flight flag (AC-49).
    if (!gate.admit(workspaceId, startedAt)) throw new RateLimitError(ERR_RATE_LIMIT);
    const token = gate.tryBegin(prId);
    if (token === null) throw new ConflictError(ERR_IN_FLIGHT);

    const state: RunState = { model: null, committing: false, abandoned: false };
    const timer = clock.after(Math.max(0, BRIEF_TIMEOUT_MS - (clock.now() - startedAt)));
    const run = this.build(workspaceId, pull, token, startedAt, state);
    // If the deadline wins, `run` is abandoned: its late rejection must not crash the process.
    run.catch(() => undefined);
    const deadline = timer.promise.then((): never => {
      throw new DeadlineError();
    });
    deadline.catch(() => undefined);

    let failure: unknown;
    try {
      return await Promise.race([run, deadline]);
    } catch (err) {
      failure = err;
      if (err instanceof DeadlineError) {
        // A save already under way cannot be undone: report what it commits, not a timeout.
        if (state.committing) {
          try {
            return await run;
          } catch (runErr) {
            failure = runErr;
          }
        } else {
          state.abandoned = true;
        }
      }
      const outcome =
        failure instanceof DeadlineError ? 'timeout' : failure instanceof ConfigError ? 'config' : 'failed';
      log.info({ prId, model: state.model, outcome }, LOG_MESSAGE);
      if (failure instanceof DeadlineError) throw new ExternalServiceError(ERR_TIMEOUT);
      throw failure;
    } finally {
      timer.clear();
      gate.end(prId, token);
    }
  }

  private async build(
    workspaceId: string,
    pull: PullForBrief,
    token: number,
    startedAt: number,
    state: RunState,
  ): Promise<PrBrief> {
    const { store, blast, docs, writer, gate, log, clock } = this.deps;

    const [intent, blastMap, owners] = await Promise.all([
      store.getIntent(pull.prId),
      this.readBlast(workspaceId, pull.prId),
      store.listAttachmentOwners(workspaceId, pull.repoId),
    ]);

    const planned = collectBriefDocPaths(owners);
    let reads = new Map<string, { text: string; version: string }>();
    if (planned.length > 0) {
      // A stalled head fetch must not burn the whole deadline: losing the race = no documents (AC-29).
      const sub = clock.after(DOC_READ_TIMEOUT_MS);
      try {
        const read = docs.readAll(
          { owner: pull.owner, name: pull.name },
          { number: pull.number, headSha: pull.headSha },
          planned,
        );
        read.catch(() => undefined);
        reads = await Promise.race([read, sub.promise.then(() => new Map<string, { text: string; version: string }>())]);
      } catch {
        reads = new Map();
      } finally {
        sub.clear();
      }
    }
    const docBudget = applyDocBudget(planned, reads);
    const diff = applyDiffBudget(pull.files);

    const missing: BriefMissing[] = [
      intentMissing(intent, pull.headSha),
      blastMap.missing,
      ...docBudget.missing,
      diff.missing,
    ].filter((m): m is BriefMissing => m !== null);

    const messages = buildMessages({
      title: pull.title,
      body: capBody(pull.body),
      files: diff.files,
      intent,
      blast: blastMap.map,
      docs: docBudget.sent,
      callerFileLines: callerLines(blastMap.map),
    });

    const prepared = await writer.prepare(workspaceId); // may throw ConfigError (passes through)
    state.model = prepared.model;
    let result;
    try {
      result = await prepared.write(messages, {
        schema: briefOutputSchema(pull.files.length >= 1 ? 1 : 0),
        timeoutMs: Math.max(1, BRIEF_TIMEOUT_MS - (clock.now() - startedAt)),
      });
    } catch {
      // Never forward provider text or `raw` output to the client (AC-46).
      throw new ExternalServiceError(ERR_FAILED);
    }

    const grounded = groundBrief(result.data, { files: pull.files, blast: blastMap.map });
    const brief: PrBrief = {
      summary: result.data.summary,
      intent: intent
        ? { intent: intent.intent, in_scope: intent.in_scope, out_of_scope: intent.out_of_scope }
        : null,
      blast: blastMap.map,
      risks: { risks: grounded.risks },
      history: { history: [] },
      review_focus: grounded.review_focus,
      missing,
      head_sha: pull.headSha,
      generated_at: new Date(clock.now()).toISOString(),
      model: result.model,
      cost_usd: result.costUsd,
      tokens_in: result.tokensIn,
      tokens_out: result.tokensOut,
    };

    // A run that lost the deadline race must never store (AC-47).
    if (state.abandoned || !gate.isCurrent(pull.prId, token)) return brief;
    state.committing = true; // from here the deadline waits for the save instead of failing the POST
    await this.deps.store.saveBrief(pull.prId, brief);

    // One line per generation; it also serves as the AC-44 drop line. No content, ever.
    log.info(
      {
        prId: pull.prId,
        model: result.model,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        costUsd: result.costUsd,
        missing: missing.map((m) => m.source),
        dropped: grounded.dropped,
      },
      LOG_MESSAGE,
    );
    return brief;
  }

  /** A thrown map read is "unavailable", never a failed brief (AC-22). */
  private async readBlast(
    workspaceId: string,
    prId: string,
  ): Promise<{ map: BlastRadius | null; missing: BriefMissing | null }> {
    try {
      const map = await this.deps.blast.forPull(workspaceId, prId);
      return { map, missing: blastMissing(map) };
    } catch {
      return { map: null, missing: { source: 'blast', reason: MISSING_BLAST_UNAVAILABLE } };
    }
  }
}
