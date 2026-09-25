/* Pure helpers for the Files-changed tab: Smart Diff grouping + labels. */
import type { PrFile, SmartDiffGroup } from "@devdigest/shared";

/** Map a Smart Diff group's files back to the `PrFile` carrying the patch, so `DiffViewer`'s prop type stays unchanged. */
export function toPrFiles(group: SmartDiffGroup, files: PrFile[]): PrFile[] {
  const byPath = new Map(files.map((f) => [f.path, f]));
  return group.files.map((f) => byPath.get(f.path)).filter((f): f is PrFile => f != null);
}

/**
 * i18n key for a role's group-header label (`prReview.smartDiff.<role>Label`).
 * Takes a plain `string` (not `SmartDiffRole`) because `ProposedSplit.name` —
 * the split-banner's role names — is a bare string in the contract.
 */
export function roleLabelKey(role: string): string {
  return `${role}Label`;
}
