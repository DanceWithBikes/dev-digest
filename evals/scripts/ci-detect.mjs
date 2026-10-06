/**
 * CI change detector for the harness evals.
 *
 * Reads a newline-separated list of changed files (repo-relative) from $CHANGED_FILES and maps
 * them onto the eval suites that should run for this PR:
 *
 *   .claude/skills/<name>/**   OR  evals/skills/<name>/**   → run evals/skills/<name>  (content tier)
 *   .claude/agents/<name>.md   OR  evals/agents/<name>/**   → run evals/agents/<name>  (tool tier)
 *   any memory file / any agent / workflow cases / engine    → run the workflow tier
 *   any memory file / evals/rules/** / engine                → run the rules tier
 *
 * "Memory file" = any AGENTS.md / CLAUDE.md, nested ones included (same convention as
 * isNestedMemory in src/runtime/stripped-repo.ts), except .claude/skills/** (skill content,
 * not folder rules) and server/clones/** (an imported repo copy, gitignored anyway).
 *
 * A changed artifact with NO written evals is NOT a failure: it is reported on the `skipped_*`
 * outputs so the job can print a visible "SKIP <name> (no evals)" line instead of going red.
 *
 * FORCE_ALL=true (workflow_dispatch) ignores $CHANGED_FILES and selects every suite that exists.
 *
 * Emits GitHub Actions step outputs (skills, agents, run_workflow, run_rules, skipped_skills,
 * skipped_agents) to $GITHUB_OUTPUT. Pure filesystem + string work — no deps.
 */

import { existsSync, readdirSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const EVALS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = join(EVALS_DIR, "..");

const forceAll = process.env.FORCE_ALL === "true";

const changed = (process.env.CHANGED_FILES ?? "")
  .split("\n")
  .map((s) => s.trim())
  .filter(Boolean);

/** Does evals/<tier>/<name>/ contain at least one *.eval.ts? */
function hasEvals(tier, name) {
  const dir = join(EVALS_DIR, tier, name);
  if (!existsSync(dir)) return false;
  return readdirSync(dir).some((f) => f.endsWith(".eval.ts"));
}

/** Every <name> under evals/<tier>/ that has a written eval (FORCE_ALL mode). */
function allWithEvals(tier) {
  const dir = join(EVALS_DIR, tier);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && hasEvals(tier, e.name))
    .map((e) => e.name)
    .sort();
}

// Mirrors isNestedMemory (src/runtime/stripped-repo.ts), plus the root files: any AGENTS.md or
// CLAUDE.md counts, except skill content and the imported repo copy.
const isMemoryFile = (f) =>
  /(^|\/)(AGENTS|CLAUDE)\.md$/.test(f) &&
  !f.startsWith(".claude/skills/") &&
  !f.startsWith("server/clones/");

/** Collect distinct artifact names touched under a `.claude` and/or `evals` prefix. */
function touched(reClaude, reEvals) {
  const names = new Set();
  for (const f of changed) {
    const m = f.match(reClaude) ?? f.match(reEvals);
    if (m) names.add(m[1]);
  }
  return [...names].sort();
}

const skillNames = touched(
  /^\.claude\/skills\/([^/]+)\//,
  /^evals\/skills\/([^/]+)\//,
);
const agentNames = touched(
  /^\.claude\/agents\/([^/]+)\.md$/,
  /^evals\/agents\/([^/]+)\//,
);

const skills = forceAll ? allWithEvals("skills") : skillNames.filter((n) => hasEvals("skills", n));
const skippedSkills = forceAll ? [] : skillNames.filter((n) => !hasEvals("skills", n));
const agents = forceAll ? allWithEvals("agents") : agentNames.filter((n) => hasEvals("agents", n));
const skippedAgents = forceAll ? [] : agentNames.filter((n) => !hasEvals("agents", n));

// The workflow tier measures the LIVE harness, so anything that changes it re-triggers it:
// any memory file (root or nested), any agent definition, the workflow cases, or the engine itself.
const runWorkflow =
  forceAll ||
  changed.some(
    (f) =>
      f === ".claude/CLAUDE.md" ||
      isMemoryFile(f) ||
      /^\.claude\/agents\/.+\.md$/.test(f) ||
      /^evals\/workflow\//.test(f) ||
      /^evals\/src\//.test(f),
  );

// The rules tier checks that nested-memory rules change the ANSWER, so it reacts to the same
// memory files, its own cases, and the engine.
const runRules =
  forceAll ||
  changed.some((f) => isMemoryFile(f) || /^evals\/rules\//.test(f) || /^evals\/src\//.test(f));

const out = process.env.GITHUB_OUTPUT;
const write = (k, v) => (out ? appendFileSync(out, `${k}=${v}\n`) : console.log(`${k}=${v}`));

write("skills", JSON.stringify(skills));
write("agents", JSON.stringify(agents));
write("run_workflow", String(runWorkflow));
write("run_rules", String(runRules));
write("skipped_skills", skippedSkills.join(" "));
write("skipped_agents", skippedAgents.join(" "));

// Human-readable summary in the step log.
console.error("── eval change detection ──");
console.error(`changed files : ${forceAll ? "(FORCE_ALL)" : changed.length}`);
console.error(`skills → run  : ${skills.join(", ") || "(none)"}`);
console.error(`agents → run  : ${agents.join(", ") || "(none)"}`);
console.error(`workflow tier : ${runWorkflow ? "run" : "skip"}`);
console.error(`rules tier    : ${runRules ? "run" : "skip"}`);
if (skippedSkills.length) console.error(`SKIP skills (no evals): ${skippedSkills.join(", ")}`);
if (skippedAgents.length) console.error(`SKIP agents (no evals): ${skippedAgents.join(", ")}`);
