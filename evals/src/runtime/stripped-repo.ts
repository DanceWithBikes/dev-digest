/**
 * A throwaway copy of the repo with every NESTED CLAUDE.md / AGENTS.md removed — the control
 * condition for `answer` cases: same code, same root CLAUDE.md, same skills/agents, but no
 * package- or module-level rules. If the control still answers correctly, the nested rule adds
 * nothing the model didn't already get from the code or its own priors.
 *
 * Copies what git sees (tracked + untracked, minus ignored: no node_modules, no server/clones),
 * ~11 MB. One copy per vitest worker, removed on exit. The live repo is never modified.
 */

import { execFileSync } from "node:child_process";
import { copyFileSync, lstatSync, mkdirSync, mkdtempSync, readlinkSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { REPO_ROOT } from "../artifacts/paths.js";

/**
 * A memory file below the root. `.claude/` is kept: a file there (e.g. a skill's AGENTS.md) is
 * part of the skill, not a folder's rules.
 */
export function isNestedMemory(relPath: string): boolean {
  return /(^|\/)(AGENTS|CLAUDE)\.md$/.test(relPath) && relPath.includes("/") && !relPath.startsWith(".claude/");
}

let cached: string | undefined;

/** Absolute (realpath'd) root of the stripped copy; created on first call. */
export function strippedRepo(): string {
  if (cached) return cached;
  // realpath: on macOS tmpdir() is a /var → /private/var symlink; the CLI reports real paths.
  const dest = realpathSync(mkdtempSync(join(tmpdir(), "eval-no-nested-memory-")));
  const files = execFileSync("git", ["ls-files", "-co", "--exclude-standard", "-z"], { cwd: REPO_ROOT })
    .toString()
    .split("\0")
    .filter((f) => f && !isNestedMemory(f));

  for (const rel of files) {
    const src = join(REPO_ROOT, rel);
    let st;
    try {
      st = lstatSync(src);
    } catch {
      continue; // tracked but deleted in the working tree
    }
    const dst = join(dest, rel);
    mkdirSync(dirname(dst), { recursive: true });
    if (st.isSymbolicLink()) symlinkSync(readlinkSync(src), dst);
    else if (st.isFile()) copyFileSync(src, dst);
  }

  process.once("exit", () => rmSync(dest, { recursive: true, force: true }));
  cached = dest;
  return dest;
}
