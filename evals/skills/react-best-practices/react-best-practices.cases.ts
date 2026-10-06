import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { SkillCase } from "../../src/index.js";

// Source of truth is the skill's own skill-creator eval set; this file only adapts it to the
// harness (inline the fixture with line numbers, expectations -> judged practices).
const SKILL_EVALS = join(dirname(fileURLToPath(import.meta.url)), "../../../.claude/skills/react-best-practices");

interface EvalDef { id: number; name: string; prompt: string; files: string[]; expectations: string[] }
const { evals } = JSON.parse(readFileSync(join(SKILL_EVALS, "evals/evals.json"), "utf8")) as { evals: EvalDef[] };

// A diff keeps its own +/- markers; numbering it would invent line numbers that are not in the PR.
const numbered = (path: string) => {
  const text = readFileSync(join(SKILL_EVALS, path), "utf8");
  return path.endsWith(".diff") ? text : text.split("\n").map((l, i) => `${String(i + 1).padStart(3)}  ${l}`).join("\n");
};

export const cases: SkillCase[] = evals.map((e) => ({
  name: e.name,
  kind: "quality",
  prompt: `${e.prompt}\n\n${e.files.map((f) => `File: ${f}\n\`\`\`tsx\n${numbered(f)}\n\`\`\``).join("\n\n")}`,
  practices: e.expectations,
  maxTurns: 3,
}));
