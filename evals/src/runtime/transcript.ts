/**
 * Reads what the harness injected into a session but never surfaces in the `query()` stream.
 *
 * Nested CLAUDE.md files (every one between the repo root and a file the session Reads) arrive as
 * `{"attachment":{"type":"nested_memory","path":…}}` lines in the on-disk transcript only — the SDK
 * yields no message for them, and `getSessionMessages()` drops attachments. So we parse the JSONL.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative, sep } from "node:path";

/** Claude Code's per-project transcript folder name: every non-alphanumeric char becomes '-'. */
export function projectSlug(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, "-");
}

function projectsDir(): string {
  return join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude"), "projects");
}

/** Locate `<sessionId>.jsonl`: the cwd's project folder first, then any project folder. */
export function transcriptPath(sessionId: string, cwd: string): string | undefined {
  const root = projectsDir();
  const direct = join(root, projectSlug(cwd), `${sessionId}.jsonl`);
  if (existsSync(direct)) return direct;
  if (!existsSync(root)) return undefined;
  for (const dir of readdirSync(root)) {
    const candidate = join(root, dir, `${sessionId}.jsonl`);
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

/**
 * Pure parser: the nested-memory paths in a transcript, in load order, deduplicated, made relative
 * to `repoRoot` with forward slashes (e.g. "server/src/modules/CLAUDE.md"). Malformed lines are skipped.
 */
export function parseNestedMemory(jsonl: string, repoRoot: string): string[] {
  const seen = new Set<string>();
  for (const line of jsonl.split("\n")) {
    if (!line.includes('"nested_memory"')) continue;
    try {
      const att = JSON.parse(line).attachment;
      if (att?.type !== "nested_memory" || typeof att.path !== "string") continue;
      seen.add(relative(repoRoot, att.path).split(sep).join("/"));
    } catch {
      // a partially flushed last line — ignore, the next read will see it whole
    }
  }
  return [...seen];
}

/** Nested CLAUDE.md files loaded so far in a session; [] when the transcript isn't on disk (yet). */
export function nestedMemoryLoaded(sessionId: string | undefined, cwd: string): string[] {
  if (!sessionId) return [];
  const file = transcriptPath(sessionId, cwd);
  return file ? parseNestedMemory(readFileSync(file, "utf8"), cwd) : [];
}
