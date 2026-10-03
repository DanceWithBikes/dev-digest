/** Pure helpers for ProjectContextView. */

export interface TreeGroup {
  /** Directory of the files below ("" for the repo root). */
  dir: string;
  files: { path: string; name: string }[];
}

/** Group repo-relative paths by directory; groups and files sorted by name. */
export function buildTree(paths: string[]): TreeGroup[] {
  const byDir = new Map<string, TreeGroup>();
  for (const path of [...paths].sort()) {
    const cut = path.lastIndexOf("/");
    const dir = cut === -1 ? "" : path.slice(0, cut);
    const group = byDir.get(dir) ?? { dir, files: [] };
    group.files.push({ path, name: path.slice(cut + 1) });
    byDir.set(dir, group);
  }
  return [...byDir.values()].sort((a, b) => a.dir.localeCompare(b.dir));
}

/** Case-insensitive substring match on the path; an empty query keeps all. */
export function filterPaths<T extends { path: string }>(items: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  return q ? items.filter((i) => i.path.toLowerCase().includes(q)) : items;
}

/** One root per non-blank line. */
export function parseRoots(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

/** The server's human message from a 422 `validation_error` envelope. */
export function rootsErrorMessage(err: unknown): string | null {
  const e = err as { details?: unknown; message?: string } | null;
  if (Array.isArray(e?.details)) {
    for (const d of e.details) {
      const msg = (d as { params?: { issue?: { message?: unknown } } })?.params?.issue?.message;
      if (typeof msg === "string" && msg) return msg;
    }
  }
  return e?.message ?? null;
}
