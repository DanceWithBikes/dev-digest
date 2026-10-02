import type { GitClient } from '@devdigest/shared';

/** The slice of the git port the module reads through. */
export type ContextFileSource = Pick<GitClient, 'listFiles' | 'readFile'>;

export interface RepoCoords {
  owner: string;
  name: string;
}

export interface AttachmentCounts {
  agents: Map<string, number>;
  skills: Map<string, number>;
}

/** Everything the use cases need from storage, in use-case vocabulary. */
export interface ContextRepository {
  getRepoRef(workspaceId: string, repoId: string): Promise<RepoCoords | undefined>;
  /** The repo's saved roots, or null when it never saved any. */
  getRoots(workspaceId: string, repoId: string): Promise<string[] | null>;
  saveRoots(workspaceId: string, repoId: string, roots: string[]): Promise<void>;
  /** Attachments per path for the repo, every stored row counted. */
  attachmentCounts(workspaceId: string, repoId: string): Promise<AttachmentCounts>;
  agentInWorkspace(workspaceId: string, agentId: string): Promise<boolean>;
  skillInWorkspace(workspaceId: string, skillId: string): Promise<boolean>;
  getAgentPaths(workspaceId: string, repoId: string, agentId: string): Promise<string[]>;
  getSkillPaths(workspaceId: string, repoId: string, skillId: string): Promise<string[]>;
  /** Replaces the whole selection atomically. */
  replaceAgentPaths(
    workspaceId: string,
    repoId: string,
    agentId: string,
    paths: string[],
  ): Promise<void>;
  replaceSkillPaths(
    workspaceId: string,
    repoId: string,
    skillId: string,
    paths: string[],
  ): Promise<void>;
  /** Paths attached to the agent's enabled linked skills for the repo. */
  enabledLinkedSkillPaths(workspaceId: string, repoId: string, agentId: string): Promise<string[]>;
}
