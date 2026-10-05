/** Pure helpers for the context-selection panel. Token counts are never
    estimated here: every figure is the server's per-document `tokens`. */
import type { ContextAttachment, ContextDocument } from "@devdigest/shared";

/** One selectable row: a listed document, or an attachment whose file is gone. */
export interface ContextRow {
  path: string;
  type: ContextDocument["type"] | null;
  tokens: number;
  missing: boolean;
}

/** Case-insensitive substring match on the path; an empty query keeps all. */
export function filterByPath<T extends { path: string }>(items: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((i) => i.path.toLowerCase().includes(q));
}

function tokensByPath(docs: ContextDocument[]): Map<string, number> {
  return new Map(docs.map((d) => [d.path, d.tokens]));
}

/** Sum of the server's token counts for the given paths; unknown/missing = 0. */
export function sumTokens(paths: Iterable<string>, docs: ContextDocument[]): number {
  const byPath = tokensByPath(docs);
  let total = 0;
  for (const p of paths) total += byPath.get(p) ?? 0;
  return total;
}

/** Tokens the agent's prompt carries: own + linked-skill paths, once per path. */
export function promptEstimate(
  checked: Iterable<string>,
  linkedSkillPaths: string[],
  docs: ContextDocument[],
): number {
  return sumTokens(new Set([...checked, ...linkedSkillPaths]), docs);
}

/** Listed documents first, then attachments no longer present, flagged missing. */
export function buildRows(docs: ContextDocument[], attachments: ContextAttachment[]): ContextRow[] {
  const listed = new Set(docs.map((d) => d.path));
  const rows: ContextRow[] = docs.map((d) => ({
    path: d.path,
    type: d.type,
    tokens: d.tokens,
    missing: false,
  }));
  for (const a of attachments) {
    if (!listed.has(a.path)) rows.push({ path: a.path, type: null, tokens: 0, missing: true });
  }
  return rows;
}
