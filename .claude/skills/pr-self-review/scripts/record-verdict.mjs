#!/usr/bin/env node
// Last step of pr-self-review: turn the verified findings into the verdict the
// PreToolUse gate hook reads before `gh pr create` / `gh pr merge`.
//
//   node record-verdict.mjs <findings.json | ->  [--base <ref>]   write the verdict
//     (--base defaults to the base of the last collect-changes run)
//   node record-verdict.mjs --check                               show the gate state
//
// Exit code: 0 = PASS, 1 = BLOCKED / INCOMPLETE / stale / missing, 2 = invalid input.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SKILL_DIR, checkGate, fingerprint, parseArgs, readState, repoRoot, writeVerdict } from "./lib.mjs";

const args = parseArgs(process.argv.slice(2));
const root = repoRoot();

if (args.check) {
  const gate = checkGate(root);
  const v = gate.verdict;
  const messages = {
    missing: "No review recorded for this checkout. Run the pr-self-review skill.",
    stale: `Files changed since the last review (${gate.changed?.slice(0, 8).join(", ")}). Re-run the pr-self-review skill.`,
    blocked: `BLOCKED - ${v?.summary.blocking} blocking item(s) from the review at ${v?.reviewedAt}.`,
    incomplete: `INCOMPLETE - the review at ${v?.reviewedAt} did not cover everything the plan matched. Finish it.`,
    pass: `PASS - reviewed at ${v?.reviewedAt}, nothing changed since.`,
  };
  console.log(messages[gate.state]);
  if (gate.state === "blocked" || gate.state === "incomplete") for (const line of blockingLines(v)) console.log(line);
  process.exit(gate.state === "pass" ? 0 : 1);
}

function fail(message) {
  console.error(`record-verdict: ${message}`);
  process.exit(2);
}

function blockingLines(v) {
  return [
    ...v.findings
      .filter((f) => f.severity === "critical" && !f.dismissed)
      .map((f) => `  [critical] ${f.id} ${f.file}${f.line ? `:${f.line}` : ""} - ${f.rule} (${f.skill})`),
    ...v.gates.filter((g) => g.status === "fail").map((g) => `  [gate failed] ${g.name}`),
    ...v.coverage.skillsNotRun.map((s) => `  [not reviewed] skill ${s} matched files but was not run`),
    ...v.coverage.gatesNotReported.map((g) => `  [not reported] gate ${g}`),
  ];
}

const source = args._[0];
if (!source) fail("pass a findings JSON file, or - to read stdin");
let input;
try {
  input = JSON.parse(readFileSync(source === "-" ? 0 : source, "utf8"));
} catch (err) {
  fail(`cannot parse findings JSON: ${err.message}`);
}

const SEVERITIES = ["critical", "major", "minor"];
const findings = (input.findings ?? []).map((f, i) => ({ id: f.id ?? `F${i + 1}`, ...f }));
for (const f of findings) {
  if (!SEVERITIES.includes(f.severity)) fail(`${f.id}: severity must be one of ${SEVERITIES.join(", ")}`);
  for (const key of ["skill", "file", "rule", "problem", "fix"]) {
    if (!f[key]) fail(`${f.id}: missing "${key}"`);
  }
  // A dismissal is the user's call, never the reviewer's: it needs their stated reason.
  if (f.dismissed && !(f.dismissed.by === "user" && f.dismissed.reason)) {
    fail(`${f.id}: "dismissed" must be { "by": "user", "reason": "<what the user said>" }`);
  }
}
const gates = input.gates ?? [];
for (const g of gates) {
  if (!["pass", "fail", "not-run"].includes(g.status)) fail(`gate ${g.name}: status must be pass, fail or not-run`);
  if (g.status !== "pass" && !g.detail) fail(`gate ${g.name}: "detail" is required when status is ${g.status}`);
}

// Re-derive the plan so a verdict cannot pass by leaving a matched skill or gate out.
// The base defaults to the one the last collect-changes run used.
const base = args.base ?? readState(root, "plan.json")?.base;
const planArgs = [join(SKILL_DIR, "scripts/collect-changes.mjs"), ...(base ? ["--base", base] : [])];
const plan = JSON.parse(execFileSync("node", planArgs, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));
const skillsRun = input.skillsRun ?? [];
const coverage = {
  skillsRun,
  skillsNotRun: Object.keys(plan.bySkill).filter((s) => !skillsRun.includes(s) && !plan.missingSkills.includes(s)),
  gatesNotReported: plan.gates.filter((g) => g.available && !gates.some((r) => r.name === g.name)).map((g) => g.name),
};

const criticals = findings.filter((f) => f.severity === "critical" && !f.dismissed);
const failedGates = gates.filter((g) => g.status === "fail");
const uncovered = coverage.skillsNotRun.length + coverage.gatesNotReported.length;
// A critical finding may name the gate it explains (`"gate": "server arch:check"`), so one
// problem is not counted twice.
const explained = new Set(criticals.map((f) => f.gate).filter(Boolean));
const blocking = criticals.length + failedGates.filter((g) => !explained.has(g.name)).length;

// Per-file hashes let the next run review only what changed since this one.
const { fileHashes } = fingerprint(root, new Map(plan.files.map((f) => [f.path, f.status])));
const verdict = {
  // INCOMPLETE is not a statement about the code: the review itself is unfinished.
  verdict: blocking > 0 ? "BLOCKED" : uncovered > 0 ? "INCOMPLETE" : "PASS",
  reviewedAt: new Date().toISOString(),
  branch: plan.branch,
  base: plan.base,
  mergeBase: plan.mergeBase,
  fingerprint: plan.fingerprint,
  summary: {
    blocking,
    critical: criticals.length,
    major: findings.filter((f) => f.severity === "major" && !f.dismissed).length,
    minor: findings.filter((f) => f.severity === "minor" && !f.dismissed).length,
    dismissed: findings.filter((f) => f.dismissed).length,
    gatesFailed: failedGates.length,
    gatesNotRun: gates.filter((g) => g.status === "not-run").length,
  },
  coverage,
  gates,
  findings,
  fileHashes,
};

const path = writeVerdict(root, verdict);
console.log(`${verdict.verdict} - ${JSON.stringify(verdict.summary)}`);
for (const line of blockingLines(verdict)) console.log(line);
console.log(`verdict written to ${path}`);
process.exit(verdict.verdict === "PASS" ? 0 : 1);
