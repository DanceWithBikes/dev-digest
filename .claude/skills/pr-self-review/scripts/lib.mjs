// Shared helpers for the pr-self-review scripts and the PreToolUse gate hook.
// No dependencies: the packages in this repo have no workspace root to install into.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const SKILL_DIR = resolve(SCRIPT_DIR, "..");
// Skills are read from where this skill lives, not from cwd, so the review also
// works from a git worktree that does not have the (possibly uncommitted) skills.
export const SKILLS_DIR = resolve(SKILL_DIR, "..");

export function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trimEnd();
}

function tryGit(args, cwd) {
  try {
    return git(args, cwd);
  } catch {
    return null;
  }
}

export function repoRoot(cwd = process.cwd()) {
  return git(["rev-parse", "--show-toplevel"], cwd);
}

export function currentBranch(root) {
  return tryGit(["rev-parse", "--abbrev-ref", "HEAD"], root) ?? "HEAD";
}

// The PR target: explicit --base, else origin's default branch, else main/master.
export function resolveBase(root, explicit) {
  if (explicit) return explicit;
  const originHead = tryGit(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], root);
  const candidates = [originHead, "origin/main", "main", "origin/master", "master"].filter(Boolean);
  for (const ref of candidates) {
    if (tryGit(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], root)) return ref;
  }
  throw new Error("Cannot find a base branch. Pass --base <ref>.");
}

// Everything that would end up in the PR plus everything still local:
// commits since the merge-base, staged, unstaged and untracked files.
export function changedFiles(root, base) {
  const mergeBase = git(["merge-base", base, "HEAD"], root);
  const files = new Map();
  const diff = git(["diff", "--name-status", "-z", "--no-renames", mergeBase], root);
  const parts = diff.split("\0").filter(Boolean);
  for (let i = 0; i + 1 < parts.length; i += 2) files.set(parts[i + 1], parts[i][0]);
  const untracked = git(["ls-files", "--others", "--exclude-standard", "-z"], root);
  for (const path of untracked.split("\0").filter(Boolean)) files.set(path, "A");
  return { mergeBase, files };
}

// Content-addressed, so committing or staging already-reviewed changes keeps the
// fingerprint stable, while any edit after the review makes the verdict stale.
export function fingerprint(root, files) {
  const paths = [...files.keys()].sort();
  const hashes = new Map();
  const existing = [];
  for (const p of paths) {
    const stat = lstatSync(join(root, p), { throwIfNoEntry: false });
    if (stat?.isFile()) existing.push(p);
    else if (stat?.isSymbolicLink()) hashes.set(p, `symlink:${readlinkSync(join(root, p))}`);
    else if (stat) hashes.set(p, "non-file");
  }
  if (existing.length > 0) {
    const out = execFileSync("git", ["hash-object", "--no-filters", "--stdin-paths"], {
      cwd: root,
      encoding: "utf8",
      input: existing.join("\n") + "\n",
      maxBuffer: 64 * 1024 * 1024,
    }).trim();
    out.split("\n").forEach((hash, i) => hashes.set(existing[i], hash));
  }
  const fileHashes = Object.fromEntries(paths.map((p) => [p, hashes.get(p) ?? "deleted"]));
  const digest = createHash("sha256").update(JSON.stringify(fileHashes)).digest("hex");
  return { fingerprint: digest, fileHashes };
}

export function statePath(root, name) {
  const p = git(["rev-parse", "--git-path", `pr-self-review/${name}`], root);
  return isAbsolute(p) ? p : join(root, p);
}

export function readState(root, name) {
  const path = statePath(root, name);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

export function writeState(root, name, value) {
  const path = statePath(root, name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
  return path;
}

export const readVerdict = (root) => readState(root, "verdict.json");
export const writeVerdict = (root, verdict) => writeState(root, "verdict.json", verdict);

// Used by the gate hook and by `record-verdict.mjs --check`.
export function checkGate(root) {
  const verdict = readVerdict(root);
  if (!verdict) return { state: "missing", verdict: null };
  const { files } = changedFiles(root, verdict.mergeBase ?? resolveBase(root, verdict.base));
  const current = fingerprint(root, files);
  if (current.fingerprint !== verdict.fingerprint) {
    const changed = Object.keys({ ...current.fileHashes, ...verdict.fileHashes }).filter(
      (p) => current.fileHashes[p] !== verdict.fileHashes?.[p],
    );
    return { state: "stale", verdict, changed };
  }
  const states = { PASS: "pass", INCOMPLETE: "incomplete" };
  return { state: states[verdict.verdict] ?? "blocked", verdict };
}

// Minimal glob: `**` any depth, `*` within a segment, `{a,b}` alternatives.
export function globToRegExp(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        i++;
        if (glob[i + 1] === "/") {
          i++;
          re += "(?:.*/)?";
        } else re += ".*";
      } else re += "[^/]*";
    } else if (c === "{") re += "(?:";
    else if (c === "}") re += ")";
    else if (c === ",") re += "|";
    else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^$()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

export function matchesAny(path, globs = []) {
  return globs.some((g) => globToRegExp(g).test(path));
}

export function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) args._.push(a);
    else if (argv[i + 1] === undefined || argv[i + 1].startsWith("--")) args[a.slice(2)] = true;
    else args[a.slice(2)] = argv[++i];
  }
  return args;
}
