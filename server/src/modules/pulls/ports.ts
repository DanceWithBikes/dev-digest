/**
 * Outward-facing capabilities the pulls service needs. `compose.ts` is the only
 * file that knows which implementations satisfy them.
 */

/**
 * Just the level this module uses. Declared structurally rather than importing
 * Fastify's logger type: the service must stay free of `fastify`, and every
 * call here is a downgrade-to-persisted-data notice, never an error path.
 */
export interface WarnLogger {
  warn(obj: unknown, msg: string): void;
}

/** One file's patch, as handed to the summary generator — never the whole `StoredFile`. */
export interface SummaryInput {
  path: string;
  patch: string | null;
}

/** What the generator returned, plus enough to bill/cache the call. */
export interface SummaryOutput {
  summary: string;
  provider: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
}

/**
 * Writes the Smart Diff tab's "What this does" pseudocode summary for one
 * file, one model call at a time — `service.ts#generateSummaries` caps how
 * many files reach this per request (`SMART_DIFF_SUMMARY_LIMIT`), so fan-out
 * is bounded upstream, not here.
 */
export interface SummaryGenerator {
  summarize(workspaceId: string, file: SummaryInput): Promise<SummaryOutput>;
}
