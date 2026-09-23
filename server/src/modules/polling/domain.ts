/**
 * Polling domain types. The GitHub coordinates a sync needs, and the row it
 * writes — deliberately not Drizzle row types, so the use case survives a
 * schema rename.
 */

/** Enough of a repo to call GitHub and scope the upserts. */
export interface PollableRepo {
  id: string;
  owner: string;
  name: string;
}

/** One PR as a sync persists it. `updatedAt` is null when GitHub omitted it. */
export interface SyncedPull {
  workspaceId: string;
  repoId: string;
  number: number;
  title: string;
  author: string;
  branch: string;
  base: string;
  headSha: string;
  additions: number;
  deletions: number;
  filesCount: number;
  status: string;
  updatedAt: Date | null;
}

/** `POST /repos/:id/poll` — how many PRs were synced, and never a review. */
export interface PollResult {
  synced: number;
  reviewTriggered: false;
}
