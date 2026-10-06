/**
 * Case types + the runners that turn a data array into vitest tests. This module owns the ONE
 * true measure → (log) → assert body, so case authors never rewrite it — which is exactly what
 * keeps the "assert before record" bug from recurring once record() lands (T2 slots into the
 * marked spot below, in this one file).
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect } from "vitest";
import { DEFAULT_THRESHOLD } from "../config.js";
import { skillTask, agentTask, workflowTask } from "../tasks.js";
import { runClaude, type Result, type RunOptions } from "../runtime/run-claude.js";
import { strippedRepo } from "../runtime/stripped-repo.js";
import { REPO_ROOT } from "../artifacts/paths.js";
import { patternMatch } from "../scoring/pattern-match.js";
import { llmJudge, type Verdict } from "../scoring/llm-judge.js";
import { logTrace, logVerdict } from "../logging/log.js";
import { record } from "../records/record.js";

// --- Case shapes ------------------------------------------------------------

/** A judge-and-grounding case. Same shape for skills and agents; only the task differs. */
export interface QualityCase {
  name: string;
  kind?: "quality" | "grounding";
  prompt: string;
  /** Practices the judge scores (quality). Omit for a pure grounding case. */
  practices?: string[];
  /** Substrings that must ALL appear before the judge runs (cheap-tier gate). */
  grounding?: string[];
  /** Judge score gate (default 0.6). */
  threshold?: number;
  maxTurns?: number;
}
export type SkillCase = QualityCase;
export type AgentCase = QualityCase;

/** A trace-asserted workflow case — a discriminated union routed by `kind`. */
export type WorkflowCase =
  | { kind: "dispatch"; name: string; prompt: string; expectSubagent: string; maxTurns?: number }
  | {
      kind: "activation";
      name: string;
      prompt: string;
      skill: string;
      shouldActivate: boolean;
      maxTurns?: number;
    }
  | {
      kind: "contrast";
      name: string;
      prompt: string;
      expectFileRead: string;
      tools?: string[];
      maxTurns?: number;
    }
  | {
      // A single-session composite: run ONE workflowTask and assert several trace facets at once.
      // Cheaper than separate dispatch/activation/contrast cases (one session, not N) at the cost
      // of coarser diagnostics and no control run — use contrast when you must isolate CLAUDE.md's
      // contribution. Every provided expectation must hold; omitted fields are not checked.
      kind: "trace";
      name: string;
      prompt: string;
      expectSubagents?: string[];
      expectSkills?: string[];
      expectFilesRead?: string[];
      /**
       * Nested CLAUDE.md files the harness must have attached (repo-relative, e.g.
       * "server/src/modules/CLAUDE.md"). Proves the right local rules reached the context — NOT that
       * the model applied them. Read from the session transcript (see runtime/transcript.ts).
       */
      expectMemoryLoaded?: string[];
      maxTurns?: number;
    }
  | {
      // Did the delivered rule change WHAT THE AGENT SAYS? Trace cases prove delivery; this one
      // checks the final answer. Read-only tools (Read/Grep/Glob), no skills or subagents, so the
      // answer reflects CLAUDE.md + code only. Checks run cheap-first: substrings, then the judge.
      kind: "answer";
      name: string;
      prompt: string;
      /** Nested CLAUDE.md files that must be attached in the treatment run. */
      expectMemoryLoaded?: string[];
      /** Substrings that must ALL appear in the answer (case-insensitive). */
      expectText?: string[];
      /** Substrings that must NOT appear. Keep them recommendation-shaped — a model warning
       *  "don't run X" quotes X; use `practices` for prohibitions instead. */
      forbidText?: string[];
      /** Judge practices; every one must PASS (binary, verbatim evidence). */
      practices?: string[];
      /**
       * Also run the prompt in a repo copy WITHOUT nested CLAUDE.md (src/runtime/stripped-repo.ts)
       * and require it to FAIL the content checks — proof the nested rule is what changed the answer.
       * Leave off when the rule is also stated in the root CLAUDE.md (the copy keeps the root).
       */
      control?: boolean;
      /** Model under test for this case (default EVAL_MODEL). The judge keeps EVAL_JUDGE_MODEL. */
      model?: string;
      maxTurns?: number;
    };

/** Did a skill engage? Either an explicit Skill tool-call, or reading its SKILL.md. */
export function activated(result: Result, skill: string): boolean {
  const bySkill = result.skillsInvoked.some((s) => s === skill || s.endsWith(`:${skill}`));
  const byRead = result.filesRead.some((f) => f.includes(`skills/${skill}/SKILL.md`));
  return bySkill || byRead;
}

// --- Runners ----------------------------------------------------------------

type Task = (prompt: string, artifact: string, opts?: RunOptions) => Promise<Result>;

function runQualityCases(artifact: string, cases: QualityCase[], task: Task): void {
  for (const c of cases) {
    test(c.name, async () => {
      const threshold = c.threshold ?? DEFAULT_THRESHOLD;
      const result = await task(c.prompt, artifact, { maxTurns: c.maxTurns });
      logTrace(c.name, result);

      // measure → record → assert. Everything measurable runs in the try; record() fires in the
      // finally with whatever accumulated; the asserts happen strictly after. A failing config
      // (e.g. baseline: grounding gate fails, judge skipped) still leaves a record.
      let grounded: number | undefined;
      let verdict: Verdict | undefined;
      try {
        // Cheap deterministic tier first — the grounding gate. When it fails the judge is skipped.
        if (c.grounding?.length) grounded = patternMatch(result.text, c.grounding);
        if (c.practices?.length && (grounded === undefined || grounded === 1)) {
          verdict = await llmJudge(result.text, c.practices);
          logVerdict(c.name, verdict);
        }
      } finally {
        record(c.name, { result, verdict, grounded, threshold });
      }

      if (grounded !== undefined) {
        expect(grounded, `missing concrete evidence; output:\n${result.text}`).toBe(1);
      }
      if (verdict) {
        expect(verdict.score, JSON.stringify(verdict.results)).toBeGreaterThanOrEqual(threshold);
      }
    });
  }
}

export const runSkillCases = (skill: string, cases: SkillCase[]) => runQualityCases(skill, cases, skillTask);
export const runAgentCases = (agent: string, cases: AgentCase[]) => runQualityCases(agent, cases, agentTask);

/**
 * Content checks for an `answer` case, cheap tier first: the judge runs only when the substring
 * checks pass. Returns the list of failed checks (empty = the answer follows the rule).
 */
async function checkAnswer(
  text: string,
  c: { expectText?: string[]; forbidText?: string[]; practices?: string[] },
): Promise<{ problems: string[]; verdict?: Verdict }> {
  const low = text.toLowerCase();
  const problems = [
    ...(c.expectText ?? []).filter((e) => !low.includes(e.toLowerCase())).map((e) => `missing "${e}"`),
    ...(c.forbidText ?? []).filter((f) => low.includes(f.toLowerCase())).map((f) => `contains forbidden "${f}"`),
  ];
  if (problems.length || !c.practices?.length) return { problems };
  const verdict = await llmJudge(text, c.practices);
  for (const r of verdict.results) if (!r.passed) problems.push(`judge FAIL: ${r.practice}`);
  return { problems, verdict };
}

export function runWorkflowCases(cases: WorkflowCase[]): void {
  for (const c of cases) {
    test(c.name, async () => {
      if (c.kind === "dispatch") {
        // Stop the moment the subagent is launched — no need to wait out its nested session.
        const expect1 = c.expectSubagent;
        const result = await workflowTask(c.prompt, {
          maxTurns: c.maxTurns,
          stopWhen: (p) => p.subagents.includes(expect1),
        });
        logTrace(c.name, result);
        let ok = false;
        try {
          expect(result.subagents, `subagents: ${result.subagents.join(", ")}`).toContain(c.expectSubagent);
          ok = true;
        } finally {
          record(c.name, { result, outcome: ok });
        }
      } else if (c.kind === "activation") {
        // A positive case stops the moment the skill engages — otherwise the model goes on to DO the
        // skill's work and burns the turn budget. A negative case must run to the end to prove absence.
        const skill = c.skill;
        const result = await workflowTask(c.prompt, {
          maxTurns: c.maxTurns,
          stopWhen: c.shouldActivate
            ? (p) =>
                p.skillsInvoked.some((s) => s === skill || s.endsWith(`:${skill}`)) ||
                p.filesRead.some((f) => f.includes(`skills/${skill}/SKILL.md`))
            : undefined,
        });
        logTrace(c.name, result);
        let ok = false;
        try {
          expect(
            activated(result, c.skill),
            `skills: ${result.skillsInvoked.join(", ")} | reads: ${result.filesRead.join(", ")}`,
          ).toBe(c.shouldActivate);
          ok = true;
        } finally {
          record(c.name, { result, outcome: ok });
        }
      } else if (c.kind === "trace") {
        // One session, many asserts — every provided expectation is checked against the same trace.
        // Stop as soon as ALL expectations are satisfied (e.g. doc read + subagent launched), so a
        // dispatch-bearing trace doesn't pay for the nested subagent's full run.
        const subs = c.expectSubagents ?? [];
        const skls = c.expectSkills ?? [];
        const files = c.expectFilesRead ?? [];
        const mems = c.expectMemoryLoaded ?? [];
        const skillEngaged = (p: { skillsInvoked: string[]; filesRead: string[] }, skill: string) =>
          p.skillsInvoked.some((s) => s === skill || s.endsWith(`:${skill}`)) ||
          p.filesRead.some((f) => f.includes(`skills/${skill}/SKILL.md`));
        const result = await workflowTask(c.prompt, {
          maxTurns: c.maxTurns,
          stopWhen: (p) =>
            subs.every((s) => p.subagents.includes(s)) &&
            skls.every((s) => skillEngaged(p, s)) &&
            files.every((f) => p.filesRead.some((r) => r.includes(f))) &&
            mems.every((m) => p.memoryLoaded.includes(m)),
        });
        logTrace(c.name, result);
        let ok = false;
        try {
          for (const sub of c.expectSubagents ?? []) {
            expect(result.subagents, `subagents: ${result.subagents.join(", ")}`).toContain(sub);
          }
          for (const skill of c.expectSkills ?? []) {
            expect(
              activated(result, skill),
              `skill ${skill} not engaged | skills: ${result.skillsInvoked.join(", ")} | reads: ${result.filesRead.join(", ")}`,
            ).toBe(true);
          }
          for (const file of c.expectFilesRead ?? []) {
            expect(
              result.filesRead.some((f) => f.includes(file)),
              `${file} not read | reads: ${result.filesRead.join(", ")}`,
            ).toBe(true);
          }
          for (const mem of mems) {
            expect(
              result.memoryLoaded,
              `${mem} not attached | memory: ${result.memoryLoaded.join(", ") || "(none)"}`,
            ).toContain(mem);
          }
          expect(result.isError).toBe(false);
          ok = true;
        } finally {
          record(c.name, { result, outcome: ok });
        }
      } else if (c.kind === "answer") {
        const tools = ["Read", "Grep", "Glob"];
        const run = (cwd: string) =>
          runClaude(c.prompt, {
            allowedTools: tools,
            maxTurns: c.maxTurns,
            settingSources: ["project"],
            cwd,
            confineToCwd: true,
            model: c.model,
          });
        const [treatment, control] = await Promise.all([
          run(REPO_ROOT),
          c.control ? run(strippedRepo()) : Promise.resolve(undefined),
        ]);
        logTrace(c.name, treatment);
        if (control) logTrace(`${c.name} [control]`, control);

        const [t, k] = await Promise.all([
          checkAnswer(treatment.text, c),
          control ? checkAnswer(control.text, c) : Promise.resolve(undefined),
        ]);
        if (t.verdict) logVerdict(c.name, t.verdict);
        if (k?.verdict) logVerdict(`${c.name} [control]`, k.verdict);

        let ok = false;
        try {
          for (const mem of c.expectMemoryLoaded ?? []) {
            expect(
              treatment.memoryLoaded,
              `${mem} not attached | memory: ${treatment.memoryLoaded.join(", ") || "(none)"}`,
            ).toContain(mem);
          }
          expect(t.problems, `answer broke the rule:\n${treatment.text}`).toEqual([]);
          if (k) {
            expect(
              k.problems.length,
              `rule adds nothing — the control (no nested CLAUDE.md) answered correctly too:\n${control!.text}`,
            ).toBeGreaterThan(0);
          }
          ok = true;
        } finally {
          record(c.name, { result: treatment, verdict: t.verdict, outcome: ok });
          if (control) record(`${c.name} [control]`, { result: control, verdict: k?.verdict, outcome: ok });
        }
      } else {
        // contrast: treatment (real harness) vs control (empty tmpdir, no on-disk config).
        const tools = c.tools ?? ["Read", "Grep", "Glob"];
        const treatment = await workflowTask(c.prompt, { allowedTools: tools, maxTurns: c.maxTurns });
        const emptyCwd = mkdtempSync(join(tmpdir(), "eval-control-"));
        const control = await runClaude(c.prompt, {
          allowedTools: tools,
          maxTurns: c.maxTurns,
          cwd: emptyCwd,
          settingSources: [],
        });
        logTrace(`${c.name} [treatment]`, treatment);
        logTrace(`${c.name} [control]`, control);
        let ok = false;
        try {
          const treatmentRead = treatment.filesRead.some((f) => f.includes(c.expectFileRead));
          const controlRead = control.filesRead.some((f) => f.includes(c.expectFileRead));
          expect(treatmentRead, `treatment reads: ${treatment.filesRead.join(", ")}`).toBe(true);
          expect(controlRead, `control reads: ${control.filesRead.join(", ")}`).toBe(false);
          ok = true;
        } finally {
          record(`${c.name} [treatment]`, { result: treatment, outcome: ok });
          record(`${c.name} [control]`, { result: control, outcome: ok });
        }
      }
    });
  }
}
