#!/usr/bin/env node
// Step 1 of pr-self-review: list every local change against the PR base and decide
// which review skill looks at which file. Prints JSON (the review plan) to stdout.
//
//   node collect-changes.mjs [--base <ref>] [--summary]
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  SKILLS_DIR,
  SKILL_DIR,
  changedFiles,
  currentBranch,
  fingerprint,
  matchesAny,
  git,
  parseArgs,
  readVerdict,
  repoRoot,
  resolveBase,
  writeState,
} from "./lib.mjs";

const args = parseArgs(process.argv.slice(2));
const root = repoRoot();
const base = resolveBase(root, args.base);
const routing = JSON.parse(readFileSync(join(SKILL_DIR, "skill-routing.json"), "utf8"));
const { mergeBase, files } = changedFiles(root, base);
const fp = fingerprint(root, files);

const AREAS = [
  ["client/", "client"],
  ["server/", "server"],
  ["reviewer-core/", "reviewer-core"],
  ["e2e/", "e2e"],
  [".github/", "ci"],
  [".claude/", "agent-config"],
  ["docs/", "docs"],
];
const areaOf = (path) => AREAS.find(([prefix]) => path.startsWith(prefix))?.[1] ?? "root";

function readText(path) {
  try {
    const abs = join(root, path);
    return lstatSync(abs).isFile() ? readFileSync(abs, "utf8") : "";
  } catch {
    return "";
  }
}

const bySkill = {};
const fileList = [];
for (const [path, status] of [...files.entries()].sort()) {
  const entry = { path, status, area: areaOf(path), skills: [] };
  const reviewable = status !== "D" && !matchesAny(path, routing.neverReview);
  if (reviewable && matchesAny(path, routing.docs)) entry.kind = "docs";
  else if (reviewable) {
    for (const [key, rule] of Object.entries(routing.skills)) {
      const skill = rule.skill ?? key;
      if (entry.skills.includes(skill)) continue;
      if (!matchesAny(path, rule.paths) || matchesAny(path, rule.exclude)) continue;
      if (rule.contains && !new RegExp(rule.contains, "m").test(readText(path))) continue;
      entry.skills.push(skill);
      bySkill[skill] ??= { scope: rule.scope, skillFile: null, files: [] };
      bySkill[skill].files.push(path);
    }
  } else entry.skipped = status === "D" ? "deleted" : "generated-or-binary";
  fileList.push(entry);
}

// Skills come from the folder this skill lives in; a routed skill that is not
// installed is reported instead of silently producing an empty review.
const installed = readdirSync(SKILLS_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(SKILLS_DIR, d.name, "SKILL.md")))
  .map((d) => d.name);
const routed = new Set(Object.entries(routing.skills).map(([key, rule]) => rule.skill ?? key));
const unmappedSkills = installed.filter((s) => !routed.has(s) && !(s in routing.notForReview));
const missingSkills = Object.keys(bySkill).filter((s) => !installed.includes(s));
for (const [skill, info] of Object.entries(bySkill)) {
  if (installed.includes(skill)) info.skillFile = join(SKILLS_DIR, skill, "SKILL.md");
}

// Nobody's rulebook covers these: the orchestrator reads them itself.
const unroutedFiles = fileList.filter((f) => !f.skipped && !f.kind && f.skills.length === 0).map((f) => f.path);
const docsFiles = fileList.filter((f) => f.kind === "docs").map((f) => f.path);
const generatedFiles = fileList.filter((f) => f.skipped === "generated-or-binary").map((f) => f.path);

// Small diffs get one reviewer per scope (it loads every skill of that scope);
// per-skill fan-out only pays off when there is a lot to read.
const routedFiles = new Set(Object.values(bySkill).flatMap((info) => info.files));
const fanOut = routedFiles.size <= 8 ? "by-scope" : "by-skill";
const reviewers = [];
const sideOf = (path) => (path.startsWith("client/") ? "frontend" : /^(server|reviewer-core)\//.test(path) ? "backend" : null);
for (const [skill, info] of Object.entries(bySkill)) {
  // A cross-cutting pass whose files all sit on one side rides with that side's reviewer.
  const sides = new Set(info.files.map(sideOf));
  const scope = info.scope === "full-stack" && sides.size === 1 && !sides.has(null) ? [...sides][0] : info.scope;
  const name = fanOut === "by-scope" ? scope : skill;
  let reviewer = reviewers.find((r) => r.name === name);
  if (!reviewer) reviewers.push((reviewer = { name, passes: [] }));
  reviewer.passes.push({ skill, skillFile: info.skillFile, files: info.files });
}

const gates = routing.gates
  .filter((g) => fileList.some((f) => matchesAny(f.path, g.when)))
  .map(({ name, cwd, command, requires = [] }) => {
    const hasScript = (() => {
      try {
        const pkg = JSON.parse(readFileSync(join(root, cwd, "package.json"), "utf8"));
        return Boolean(pkg.scripts?.[command.split(" ").pop()]);
      } catch {
        return false;
      }
    })();
    // Missing installs make a gate fail for reasons that have nothing to do with the diff.
    const missing = [`${cwd}/node_modules`, ...requires].filter((p) => !existsSync(join(root, p)));
    const setup = missing.map((p) => {
      const pkg = p.split("/")[0];
      return `(cd ${pkg} && ${routing.packageManagers[pkg] === "npm" ? "npm ci" : "pnpm install --frozen-lockfile"})`;
    });
    return { name, cwd, command, available: hasScript, ...(setup.length > 0 && { setup }) };
  });

// Repo rules from the root AGENTS.md that a diff can break and a script can see.
const invariants = [];
const changed = fileList.filter((f) => f.status !== "D").map((f) => f.path);
const all = fileList.map((f) => f.path);

const secretFiles = changed.filter((p) => /(^|\/)\.env(\.|$)/.test(p) && !/\.example$/.test(p) || /secrets\.json$/.test(p));
if (secretFiles.length > 0) {
  invariants.push({
    id: "secret-file-in-diff",
    suggestedSeverity: "critical",
    files: secretFiles,
    detail: "API keys live only in ~/.devdigest/secrets.json or an untracked .env - never in git.",
  });
}

const migrations = all.filter((p) => p.startsWith("server/src/db/migrations/"));
if (migrations.length > 0) {
  const schemaChanged = all.some((p) => /^server\/src\/db\/schema(\.ts|\/)/.test(p));
  invariants.push({
    id: schemaChanged ? "migrations-changed" : "migrations-changed-without-schema-change",
    suggestedSeverity: schemaChanged ? "verify" : "critical",
    files: migrations,
    detail:
      "server/src/db/migrations/** is generated by `pnpm db:generate` only. " +
      (schemaChanged
        ? "Confirm the migration matches the schema change and no existing migration file was edited."
        : "No schema file changed, so this looks hand-edited."),
  });
}

const SHARED = ["server/src/vendor/shared/", "client/src/vendor/shared/"];
const oneSided = all.filter((p) => {
  const i = SHARED.findIndex((prefix) => p.startsWith(prefix));
  return i !== -1 && !all.includes(SHARED[1 - i] + p.slice(SHARED[i].length));
});
if (oneSided.length > 0) {
  invariants.push({
    id: "shared-contract-changed-in-one-copy",
    suggestedSeverity: "major",
    files: oneSided,
    detail: "@devdigest/shared exists in two copies (server/ and client/src/vendor/shared) - change both.",
  });
}

const badMemoryFiles = [];
for (const p of changed) {
  const name = p.split("/").pop();
  if (name === "CLAUDE.md" && !lstatSync(join(root, p)).isSymbolicLink()) badMemoryFiles.push(p);
  if (name === "AGENTS.md" && !existsSync(join(root, dirname(p), "CLAUDE.md"))) badMemoryFiles.push(p);
}
if (badMemoryFiles.length > 0) {
  invariants.push({
    id: "agents-md-symlink-convention",
    suggestedSeverity: "major",
    files: badMemoryFiles,
    detail: "Every CLAUDE.md is a committed symlink to its sibling AGENTS.md (`ln -s AGENTS.md CLAUDE.md`).",
  });
}

const foreign = changed.filter((p) => {
  const [pkg, file] = [p.split("/")[0], p.split("/").slice(1).join("/")];
  const pm = routing.packageManagers[pkg];
  if (!p.includes("/")) return /^(pnpm-workspace\.yaml|pnpm-lock\.yaml|package-lock\.json|package\.json)$/.test(p);
  return (pm === "npm" && /^pnpm-(lock|workspace)\.yaml$/.test(file)) || (pm === "pnpm" && file === "package-lock.json");
});
if (foreign.length > 0) {
  invariants.push({
    id: "foreign-lockfile-or-workspace-file",
    suggestedSeverity: "major",
    files: foreign,
    detail: "No workspace: each package has its own lockfile (client/server: pnpm, reviewer-core/e2e: npm). These look like leftovers of the wrong package manager.",
  });
}

// What a PR opened right now would NOT contain.
const nulSplit = (out) => out.split("\0").filter(Boolean);
const workingTree = {
  commitsAhead: Number(git(["rev-list", "--count", `${mergeBase}..HEAD`], root)),
  uncommitted: nulSplit(git(["diff", "--name-only", "-z", "HEAD"], root)),
  untracked: nulSplit(git(["ls-files", "--others", "--exclude-standard", "-z"], root)),
};

// A re-run after fixes only needs to look at what moved since the last review.
const previous = readVerdict(root);
const previousReview = previous && {
  verdict: previous.verdict,
  reviewedAt: previous.reviewedAt,
  upToDate: previous.fingerprint === fp.fingerprint,
  changedSince: Object.keys({ ...fp.fileHashes, ...previous.fileHashes }).filter(
    (p) => fp.fileHashes[p] !== previous.fileHashes?.[p],
  ),
  openCriticals: (previous.findings ?? []).filter((f) => f.severity === "critical" && !f.dismissed),
};

const plan = {
  branch: currentBranch(root),
  base,
  mergeBase,
  fingerprint: fp.fingerprint,
  diffCommand: `git diff ${mergeBase} -- <paths>   # untracked files have no diff: read them whole`,
  counts: { files: fileList.length, reviewable: fileList.filter((f) => !f.skipped).length },
  workingTree,
  fanOut,
  reviewers,
  bySkill,
  gates,
  invariants,
  unmappedSkills,
  missingSkills,
  unroutedFiles,
  docsFiles,
  generatedFiles,
  previousReview,
  files: fileList,
};
// record-verdict.mjs re-derives the plan; remember which base this review is against.
writeState(root, "plan.json", { base, mergeBase, plannedAt: new Date().toISOString() });

if (args.summary) {
  const lines = [`${plan.branch} -> ${base} (${plan.counts.files} files, ${plan.counts.reviewable} reviewable)`];
  const wt = workingTree;
  lines.push(`  ${wt.commitsAhead} commit(s) ahead, ${wt.uncommitted.length} uncommitted, ${wt.untracked.length} untracked - fan-out ${fanOut}`);
  for (const [skill, info] of Object.entries(bySkill)) lines.push(`  ${skill} [${info.scope}]: ${info.files.length} files`);
  for (const g of gates) lines.push(`  gate: ${g.name}${g.available ? "" : " (script missing)"}${g.setup ? ` (needs: ${g.setup.join(" ")})` : ""}`);
  for (const inv of invariants) lines.push(`  invariant: ${inv.id} (${inv.suggestedSeverity})`);
  if (unmappedSkills.length) lines.push(`  unmapped skills: ${unmappedSkills.join(", ")}`);
  if (unroutedFiles.length) lines.push(`  unrouted files: ${unroutedFiles.join(", ")}`);
  console.log(lines.join("\n"));
} else console.log(JSON.stringify(plan, null, 2));
