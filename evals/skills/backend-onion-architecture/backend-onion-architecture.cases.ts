import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { SkillCase } from "../../src/index.js";

// Source of truth is the skill's own skill-creator eval set; this file only adapts it to the
// harness (expectations -> judged practices, plus cheap grounding substrings). All four evals
// have `files: []`, so there is no fixture to inline.
const SKILL_EVALS = join(dirname(fileURLToPath(import.meta.url)), "../../../.claude/skills/backend-onion-architecture");

interface EvalDef { id: number; name: string; prompt: string; files: string[]; expectations: string[] }
const { evals } = JSON.parse(readFileSync(join(SKILL_EVALS, "evals/evals.json"), "utf8")) as { evals: EvalDef[] };

// Substrings every correct answer necessarily contains (gate: patternMatch === 1 before the judge).
// negative-frontend-placement has none: a correct answer is defined by what it omits.
const GROUNDING: Record<string, string[]> = {
  "plan-new-backend-module": ["repository.ts", "ports.ts", "compose.ts"],
  "review-backend-structure-violations": ["repository", "container"],
  "extract-fat-route-handler": ["repository", "arch:check"],
};

// Calibration (adapter-only; evals.json and SKILL.md stay untouched).
const COMPLETE = " Be complete: cover files, imports, wiring, validation, errors, tests and the commands to run (migration, arch:check).";
const COMPLETE_FOR = new Set(["plan-new-backend-module", "extract-fat-route-handler"]);

// The harness may not expose frontend-ui-architecture, so the answer cannot be required to name it.
const PRACTICES_OVERRIDE: Record<string, string[]> = {
  "negative-frontend-placement": [
    "States that the request concerns client-side React/Next.js code organization and that the backend onion rings (domain/application/infrastructure/presentation) do not apply to it; does not propose server-style rings, ports or repositories for the frontend code.",
  ],
};

// Targeted practice: the one the sensitivity break (inverting the drizzle-import rule) should flip.
const EXTRA_PRACTICES: Record<string, string[]> = {
  "review-backend-structure-violations": [
    "Explicitly states that only repository.ts may import drizzle-orm or src/db/** and that the service must go through the repository instead.",
  ],
};

export const cases: SkillCase[] = evals.map((e) => ({
  name: e.name,
  kind: "quality",
  prompt: COMPLETE_FOR.has(e.name) ? e.prompt + COMPLETE : e.prompt,
  practices: PRACTICES_OVERRIDE[e.name] ?? [...e.expectations, ...(EXTRA_PRACTICES[e.name] ?? [])],
  grounding: GROUNDING[e.name],
  maxTurns: 6,
  threshold: 0.6,
}));
