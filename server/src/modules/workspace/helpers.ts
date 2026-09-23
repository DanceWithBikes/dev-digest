import type { ClonedRepo, ClonedRepoDto } from './domain.js';

/**
 * `cloned` is derived rather than stored: a repo row exists from the moment it
 * is added, but `clonePath` is only written once the clone job succeeds, so the
 * presence of a path IS the clone state.
 */
export function toClonedRepoDto(repo: ClonedRepo): ClonedRepoDto {
  return {
    id: repo.id,
    full_name: repo.fullName,
    clone_path: repo.clonePath,
    last_polled_at: repo.lastPolledAt?.toISOString() ?? null,
    cloned: Boolean(repo.clonePath),
  };
}
