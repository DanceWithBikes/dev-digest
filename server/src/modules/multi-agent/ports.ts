import type { ChildRun, EstimateSample, GroupableFinding, ParentRow } from './domain.js';

/** A parent run with the child runs it launched. */
export interface ParentWithChildren {
  parent: ParentRow;
  children: ChildRun[];
}

/** A parent run with everything the results page needs. */
export interface ParentDetail extends ParentWithChildren {
  findings: GroupableFinding[];
}

/**
 * Read side of multi-agent runs. Every method is workspace-scoped; the parent
 * rows themselves are written by the reviews module when a launch is created.
 */
export interface MultiAgentStore {
  /** The caller's newest parent runs, newest first, at most `limit`. */
  listParents(workspaceId: string, limit: number): Promise<ParentWithChildren[]>;
  /** One parent run, or null when the workspace has no such run. */
  getParent(workspaceId: string, id: string): Promise<ParentDetail | null>;
  /** Ids of every agent of the workspace (an agent with no run still has an estimate). */
  listAgentIds(workspaceId: string): Promise<string[]>;
  /**
   * Finished runs per agent of the workspace on the agent's current model,
   * newest first, across all PRs.
   */
  estimateSamples(workspaceId: string): Promise<EstimateSample[]>;
}
