import type { GitHubClient, Provider, CiFailOn } from '@devdigest/shared';
import type {
  CiRunInsert,
  CiRunRow,
  InstallState,
  InstallationRecord,
  RepoRecord,
  UpsertInstallation,
} from './domain.js';

/**
 * The capabilities the ci use cases need, as interfaces, so `service.ts` and
 * `ingest.ts` are unit-tested with in-memory fakes. `compose.ts` is the only
 * file that knows which implementations satisfy them.
 */

/** The agent fields the bundle needs (structural subset of the agents module's row). */
export interface AgentForCi {
  id: string;
  name: string;
  provider: Provider;
  model: string;
  systemPrompt: string;
  strategy: 'single-pass' | 'map-reduce' | 'auto';
  ciFailOn: CiFailOn;
  version: number;
}

export interface AgentSource {
  getById(workspaceId: string, id: string): Promise<AgentForCi | undefined>;
  linkedSkills(
    agentId: string,
  ): Promise<{ skill: { id: string; name: string; body: string; enabled: boolean } }[]>;
}

export interface CiRunsFilter {
  window: '7d' | 'all';
  agentId?: string;
  repo?: string;
  status?: string;
  page: number;
}

/** Persistence of installations and CI runs. Every method is workspace-scoped. */
export interface CiStore {
  findRepoByFullName(workspaceId: string, fullName: string): Promise<RepoRecord | undefined>;
  memoryForRepo(workspaceId: string, repoId: string): Promise<{ content: string; kind: string }[]>;
  findInstallationByRepo(workspaceId: string, repo: string): Promise<InstallationRecord | undefined>;
  upsertInstallation(input: UpsertInstallation): Promise<InstallationRecord>;
  listInstallations(workspaceId: string, agentId?: string): Promise<InstallationRecord[]>;
  /** `"<githubRunId>:<runAttempt>"` of every run already stored for the installation. */
  ingestedKeys(workspaceId: string, installationId: string): Promise<Set<string>>;
  /** False when the (installation, run, attempt) key already existed (nothing written). */
  insertCiRun(input: CiRunInsert): Promise<boolean>;
  setInstallationState(workspaceId: string, id: string, state: InstallState): Promise<void>;
  hasIngestedRun(workspaceId: string, installationId: string): Promise<boolean>;
  listCiRuns(
    workspaceId: string,
    filter: CiRunsFilter,
  ): Promise<{ rows: CiRunRow[]; hasMore: boolean }>;
}

/** The GitHub calls the ci module makes — a narrow slice of the shared port. */
export type CiGitHub = Pick<
  GitHubClient,
  | 'getRepository'
  | 'compareCommits'
  | 'commitFiles'
  | 'findOpenPr'
  | 'openPullRequest'
  | 'listTreePaths'
  | 'listWorkflowRuns'
  | 'listRunArtifacts'
  | 'downloadArtifact'
  | 'getPullState'
  | 'getPullRequest'
>;

/** Resolved per call: it throws a ConfigError when no token is configured. */
export type GitHubFactory = () => Promise<CiGitHub>;

export interface RunnerBundleSource {
  /** The prebuilt bundle, or null when it has not been built (AC-14). */
  read(): Promise<{ contents: string; bytes: number; version: string } | null>;
}

export interface CiLog {
  warn(obj: Record<string, unknown>, msg?: string): void;
  info(obj: Record<string, unknown>, msg?: string): void;
}
