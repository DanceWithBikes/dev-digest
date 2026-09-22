/**
 * Workspace domain types. Plain shapes, no Drizzle rows — the overview is the
 * only consumer, so the contract lives here rather than in `@devdigest/shared`.
 */

/** A repo as the overview sees it: identity plus clone state. */
export interface ClonedRepo {
  id: string;
  fullName: string;
  clonePath: string | null;
  lastPolledAt: Date | null;
}

/** One row of the overview's repo table (snake_case — it is an API DTO). */
export interface ClonedRepoDto {
  id: string;
  full_name: string;
  clone_path: string | null;
  last_polled_at: string | null;
  cloned: boolean;
}

/** `GET /workspace` — where clones live plus a summary of every repo. */
export interface WorkspaceOverview {
  workspaceId: string;
  cloneDir: string;
  repos: ClonedRepoDto[];
}
