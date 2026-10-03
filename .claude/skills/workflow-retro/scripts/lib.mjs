// Shared helpers for the workflow-retro scripts.
// No dependencies: the packages in this repo have no workspace root to install into.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const SKILL_DIR = resolve(SCRIPT_DIR, "..");

export function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) args._.push(a);
    else if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) args[a.slice(2)] = argv[++i];
    else args[a.slice(2)] = true;
  }
  return args;
}

// Claude Code stores transcripts under ~/.claude/projects/<cwd with every non-alphanumeric char as "-">.
export function projectLogDir(cwd = repoRoot()) {
  const root = process.env.CLAUDE_PROJECTS_DIR ?? join(homedir(), ".claude", "projects");
  return join(root, cwd.replace(/[^a-zA-Z0-9]/g, "-"));
}

export function repoRoot(cwd = process.cwd()) {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return cwd;
  }
}

// Newest session transcript in the project, skipping the session that is running the retro.
export function resolveSession(logDir, wanted = "latest") {
  if (wanted !== "latest") {
    const file = join(logDir, `${wanted}.jsonl`);
    if (!existsSync(file)) throw new Error(`no transcript ${file}`);
    return wanted;
  }
  const current = process.env.CLAUDE_CODE_SESSION_ID;
  const sessions = readdirSync(logDir)
    .filter((f) => f.endsWith(".jsonl") && basename(f, ".jsonl") !== current)
    .map((f) => ({ id: basename(f, ".jsonl"), mtime: statSync(join(logDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  if (!sessions.length) throw new Error(`no session transcripts in ${logDir}`);
  return sessions[0].id;
}

// Tolerates a half-written last line (the session may still be running).
export function readJsonl(path) {
  const out = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      /* skip broken line */
    }
  }
  return out;
}

export function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

// One API response is written as one record PER CONTENT BLOCK, each repeating the same
// usage - so usage must be counted once per message.id or tokens are inflated 2-3x.
export function assistantMessages(records) {
  const byId = new Map();
  for (const r of records) {
    if (r.type !== "assistant" || !r.message?.usage) continue;
    const id = r.message.id ?? r.requestId ?? r.uuid;
    const prev = byId.get(id);
    if (!prev) byId.set(id, { id, ts: r.timestamp, usage: r.message.usage, model: r.message.model, blocks: [...(r.message.content ?? [])] });
    else prev.blocks.push(...(r.message.content ?? []));
  }
  return [...byId.values()];
}

export function emptyUsage() {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, thinking: 0, turns: 0, peakContext: 0 };
}

export function sumUsage(records) {
  const u = emptyUsage();
  for (const m of assistantMessages(records)) {
    const x = m.usage;
    const input = x.input_tokens ?? 0;
    const cacheRead = x.cache_read_input_tokens ?? 0;
    const cacheWrite = x.cache_creation_input_tokens ?? 0;
    u.input += input;
    u.output += x.output_tokens ?? 0;
    u.cacheRead += cacheRead;
    u.cacheWrite += cacheWrite;
    u.thinking += x.output_tokens_details?.thinking_tokens ?? 0;
    u.turns += 1;
    u.peakContext = Math.max(u.peakContext, input + cacheRead + cacheWrite);
  }
  return u;
}

export function addUsage(a, b) {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cacheRead: a.cacheRead + b.cacheRead,
    cacheWrite: a.cacheWrite + b.cacheWrite,
    thinking: a.thinking + b.thinking,
    turns: a.turns + b.turns,
    peakContext: Math.max(a.peakContext, b.peakContext),
  };
}

export const totalTokens = (u) => u.input + u.output + u.cacheRead + u.cacheWrite;

// Share of prompt tokens served from cache. Low values mean every turn re-writes its prefix.
export function cacheHit(u) {
  const prompt = u.input + u.cacheRead + u.cacheWrite;
  return prompt ? Math.round((u.cacheRead / prompt) * 1000) / 10 : null;
}

const READ_CMD = /(?:^|[;&|]\s*)(?:cat|head|tail|less|sed\s+-n\s+\S+)\s+((?:[^\s;&|]+\s*)+)/g;

// Paths an agent read: Read.file_path plus the obvious `cat|head|tail|sed -n` in Bash.
function readPaths(block, cwd) {
  const paths = [];
  if (block.name === "Read" && block.input?.file_path) paths.push(block.input.file_path);
  if (block.name === "Bash" && typeof block.input?.command === "string") {
    for (const m of block.input.command.matchAll(READ_CMD)) {
      for (const tok of m[1].split(/\s+/)) {
        const t = tok.replace(/^["']|["']$/g, "");
        if (t && !t.startsWith("-") && /\.[a-z0-9]{1,6}$/i.test(t)) paths.push(t);
      }
    }
  }
  return paths.map((p) => (isAbsolute(p) || !cwd ? p : resolve(cwd, p)));
}

export function toolCalls(records) {
  const cwd = records.find((r) => r.cwd)?.cwd;
  const byName = {};
  const readFiles = new Set();
  let total = 0;
  for (const m of assistantMessages(records)) {
    for (const b of m.blocks) {
      if (b.type !== "tool_use") continue;
      total += 1;
      byName[b.name] = (byName[b.name] ?? 0) + 1;
      for (const p of readPaths(b, cwd)) readFiles.add(p);
    }
  }
  return { total, byName, readFiles: [...readFiles] };
}

export function interval(records) {
  let start = Infinity;
  let end = -Infinity;
  for (const r of records) {
    const t = Date.parse(r.timestamp);
    if (Number.isNaN(t)) continue;
    start = Math.min(start, t);
    end = Math.max(end, t);
  }
  return start === Infinity ? null : { start, end, ms: end - start };
}

// The task prompt is the first user record of a subagent transcript.
export function firstPrompt(records) {
  const r = records.find((x) => x.type === "user" && x.message);
  if (!r) return "";
  const c = r.message.content;
  if (typeof c === "string") return c;
  return (c ?? []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
}

export const median = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

export function fmtTokens(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(n);
}

export function fmtMs(ms) {
  if (ms == null) return "-";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m${String(s % 60).padStart(2, "0")}s` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}m`;
}
