import type { BlastDegradedReason, GitHubClient } from '@devdigest/shared';

/**
 * Outward-facing capabilities `BlastService` needs. `compose.ts` is the only
 * file that knows which implementations satisfy them.
 *
 * `blast/` may NOT import `repo-intel/types.ts` — `no-cross-module-imports`
 * forbids one module folder reaching into another's. `BlastFacadeResult` /
 * `BlastChangedSymbol` / `BlastCallerRow` below are therefore a STRUCTURAL
 * copy of repo-intel's `BlastResult` / `BlastChangedSymbol` / `BlastCallerRow`
 * (`repo-intel/types.ts`) — `container.repoIntel` satisfies `BlastRadiusReader`
 * without either side importing the other.
 */

export interface BlastChangedSymbol {
  file: string;
  name: string;
  kind: string;
}

export interface BlastCallerRow {
  file: string;
  symbol: string;
  /** Which changed symbol this caller reaches. */
  viaSymbol: string;
  /** 1-based line of the reference. */
  line: number;
  /** file_rank.rank of the caller file (0 on the degraded/ripgrep path). */
  rank: number;
}

export interface BlastFacadeResult {
  changedSymbols: BlastChangedSymbol[];
  callers: BlastCallerRow[];
  /** "METHOD /path" — flat union. */
  impactedEndpoints: string[];
  /** Per-caller-file facts, present on the persistent (non-degraded) path only. */
  factsByFile?: Record<string, { endpoints: string[]; crons: string[] }>;
  degraded?: boolean;
  reason?: BlastDegradedReason;
}

/** The narrow slice of `RepoIntel` this module reads. */
export interface BlastIndexState {
  status: 'full' | 'partial' | 'degraded' | 'failed';
}

export interface BlastRadiusReader {
  getBlastRadius(repoId: string, changedFiles: string[]): Promise<BlastFacadeResult>;
  getIndexState(repoId: string): Promise<BlastIndexState>;
}

/** The PR + repo context a blast/prior-PRs read needs, resolved workspace-scoped. */
export interface PullContext {
  repoId: string;
  owner: string;
  name: string;
  fullName: string;
  headSha: string;
  number: number;
  changedFiles: string[];
}

export interface BlastPullSource {
  getPullContext(workspaceId: string, prId: string): Promise<PullContext | null>;
}

/** The two GitHub reads Prior PRs needs — never the whole `GitHubClient`. */
export type PriorPrsGitHub = Pick<GitHubClient, 'listCommitsForPath' | 'listPullsForCommit'>;

/**
 * Just the levels this module uses. Declared structurally rather than
 * importing Fastify's logger type — the service must stay free of `fastify`.
 */
export interface BlastLog {
  info(obj: unknown, msg: string): void;
  warn(obj: unknown, msg: string): void;
}
