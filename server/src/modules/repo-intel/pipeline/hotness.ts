/**
 * repo-intel pipeline — file hotness (SPEC-02).
 *
 * hotness(file) = touches(file) / max touches over the indexed files, where
 * touches come from the newest `HOTNESS_MAX_COMMITS` commits of the local clone
 * (`GitClient.countFileCommits`). All 0 when nothing was touched, which is also
 * the result for a shallow clone with no usable history.
 *
 * Pure: no DB, no git, no clock. `loadFileCommitCounts` only takes the port
 * structurally, so this file imports nothing.
 */
import { HOTNESS_MAX_COMMITS } from '../constants.js';

export interface FileCommitCounts {
  commits: number;
  byPath: Record<string, number>;
}

export const NO_COMMIT_COUNTS: FileCommitCounts = { commits: 0, byPath: {} };

/** `count / max` per indexed file (0..1); all 0 when the max is 0. */
export function computeHotness(
  indexedFiles: string[],
  counts: Record<string, number>,
): Map<string, number> {
  let max = 0;
  for (const f of indexedFiles) max = Math.max(max, counts[f] ?? 0);
  const out = new Map<string, number>();
  for (const f of indexedFiles) out.set(f, max > 0 ? (counts[f] ?? 0) / max : 0);
  return out;
}

/** One local history read; any failure degrades to "no hotness", never throws. */
export async function loadFileCommitCounts<R>(
  git: { countFileCommits(repo: R, maxCommits: number): Promise<FileCommitCounts> },
  ref: R,
): Promise<FileCommitCounts> {
  try {
    return await git.countFileCommits(ref, HOTNESS_MAX_COMMITS);
  } catch {
    return NO_COMMIT_COUNTS;
  }
}
