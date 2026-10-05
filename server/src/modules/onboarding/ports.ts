import type { OnboardingStatus, OnboardingTour, RepoRef } from '@devdigest/shared';
import type { ModelOutput } from './domain.js';
import type { StoredTour } from './helpers.js';

/**
 * Outward-facing capabilities the onboarding service needs. `compose.ts` is the
 * only file that knows which implementations satisfy them. Shapes are
 * STRUCTURAL copies: `onboarding/` may not import `repo-intel/` (the
 * `no-cross-module-imports` rule), so `container.repoIntel` and `container.git`
 * satisfy these without either side naming the other.
 */

/** The slice of repo-intel's `IndexState` this module reads. */
export interface IndexStateView {
  status: 'full' | 'partial' | 'degraded' | 'failed';
  lastIndexedSha: string;
  /** JS/TS candidates seen on disk; absent on rows written before hotness. */
  candidateFiles?: number;
  /** Candidates dropped by the file cap. */
  boundedFiles?: number;
}

/** Read-only index readers. Errors propagate: a throw is "the read failed", not "no index". */
export interface OnboardingIndexReader {
  readIndexState(repoId: string): Promise<IndexStateView | null>;
  getRankedFiles(repoId: string): Promise<Array<{ path: string; rank: number }>>;
  getImportEdges(repoId: string): Promise<Array<{ from: string; to: string }>>;
  getCriticalPaths(repoId: string): Promise<string[][]>;
  getEndpoints(repoId: string): Promise<Array<{ file: string; endpoint: string }>>;
}

/** Contained reads of the clone's tracked files — the structural shape of `GitClient`. */
export interface ProjectFileReader {
  listFiles(repo: RepoRef): Promise<string[]>;
  readFile(repo: RepoRef, path: string): Promise<string>;
}

export interface RepoInfo {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  clonePath: string | null;
}

export interface OnboardingStore {
  getRepo(workspaceId: string, repoId: string): Promise<RepoInfo | null>;
  getTour(workspaceId: string, repoId: string): Promise<StoredTour>;
  /** Upsert the repo's only tour and clear the last failed attempt (AC-52, AC-54). */
  replaceTour(workspaceId: string, repoId: string, tour: OnboardingTour): Promise<void>;
  /** Keep the stored tour; remember the failed attempt (AC-53). */
  recordFailedAttempt(workspaceId: string, repoId: string, status: OnboardingStatus, at: Date): Promise<void>;
}

export interface WriteMessage {
  role: 'system' | 'user';
  content: string;
}

export interface TourWriteResult {
  data: ModelOutput;
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
}

export type PreparedWriter =
  | { configured: false }
  | {
      configured: true;
      /** Exactly one provider request, single attempt (AC-35). */
      write(messages: WriteMessage[], opts: { timeoutMs: number }): Promise<TourWriteResult>;
    };

export interface TourWriter {
  /** The configured `onboarding` feature model, for provenance. Never throws. */
  describe(workspaceId: string): Promise<{ provider: string; model: string }>;
  prepare(workspaceId: string): Promise<PreparedWriter>;
}

/** In-flight state, rate limit and the generation token. Per process. */
export interface GenerationGate {
  /** Records one POST and reports whether it is within the limit (counts every POST). */
  admit(repoId: string, now: number): boolean;
  /** A token when no run is in flight for the repo, else null. */
  tryBegin(repoId: string): number | null;
  isCurrent(repoId: string, token: number): boolean;
  end(repoId: string, token: number): void;
  isInFlight(repoId: string): boolean;
}

/** Serial, in-process: runs submitted tasks one at a time and never lets a rejection escape. */
export interface GenerationRunner {
  submit(task: () => Promise<void>): void;
}

export interface OnboardingLog {
  info(obj: unknown, msg: string): void;
}

export interface Clock {
  now(): number;
  /** A one-shot timer: `promise` resolves after `ms`; `clear` releases it. */
  after(ms: number): { promise: Promise<void>; clear: () => void };
}
