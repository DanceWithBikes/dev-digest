/* Pure draft logic for the case editor — no React. */
import type { EvalCaseRecord, EvalCaseUpsert, EvalExpectationKind } from "@devdigest/shared";
import { EVAL_INPUT_DIFF_MAX } from "@/lib/eval-metrics";

export interface ExpectationDraft {
  /** Stable React key; never sent to the server. */
  key: string;
  kind: EvalExpectationKind;
  file: string;
  /** Kept as text so a half-typed number is not clobbered. */
  start: string;
  end: string;
  title: string;
  /** Carried through an edit untouched. */
  severity?: string | null;
  category?: string | null;
}

export interface Draft {
  name: string;
  diff: string;
  notes: string;
  expectations: ExpectationDraft[];
  /** Carried through an edit untouched. */
  meta: EvalCaseRecord["input_meta"];
}

export type DraftIssue = "name" | "diff" | "tooLarge" | "file" | "lines";

let seq = 0;
const nextKey = () => `exp-${++seq}`;

export function newExpectation(): ExpectationDraft {
  return { key: nextKey(), kind: "must_find", file: "", start: "1", end: "1", title: "" };
}

export function emptyDraft(): Draft {
  return { name: "", diff: "", notes: "", expectations: [newExpectation()], meta: null };
}

export function draftFromRecord(c: EvalCaseRecord): Draft {
  return {
    name: c.name,
    diff: c.input_diff,
    notes: c.notes ?? "",
    expectations: c.expected_output.expectations.map((e) => ({
      key: nextKey(),
      kind: e.kind,
      file: e.file,
      start: String(e.start_line),
      end: String(e.end_line),
      title: e.title ?? "",
      severity: e.severity,
      category: e.category,
    })),
    meta: c.input_meta ?? null,
  };
}

function lineNumber(v: string): number {
  return /^\d+$/.test(v.trim()) ? Number(v) : NaN;
}

/** Everything that blocks Save; `[]` means valid. `paths` are the files parsed from the diff. */
export function validateDraft(draft: Draft, paths: string[]): DraftIssue[] {
  const issues: DraftIssue[] = [];
  if (draft.name.trim() === "") issues.push("name");
  if (draft.diff.length > EVAL_INPUT_DIFF_MAX) issues.push("tooLarge");
  if (paths.length === 0) issues.push("diff");
  if (draft.expectations.some((e) => e.file === "" || !paths.includes(e.file))) issues.push("file");
  const badLines = draft.expectations.some((e) => {
    const start = lineNumber(e.start);
    const end = lineNumber(e.end);
    return !(start >= 1 && end >= 1 && start <= end);
  });
  if (badLines) issues.push("lines");
  return issues;
}

/** Build the request body from a VALID draft. */
export function toUpsert(draft: Draft): EvalCaseUpsert {
  return {
    name: draft.name.trim(),
    input_diff: draft.diff,
    input_meta: draft.meta,
    notes: draft.notes.trim() === "" ? null : draft.notes,
    expected_output: {
      expectations: draft.expectations.map((e) => ({
        kind: e.kind,
        file: e.file,
        start_line: Number(e.start),
        end_line: Number(e.end),
        title: e.title.trim() === "" ? null : e.title,
        severity: e.severity ?? null,
        category: e.category ?? null,
      })),
    },
  };
}

/** The server's human message: a zod 422 hides it in `details[].params.issue.message`. */
export function errorMessage(err: unknown): string | null {
  if (!err) return null;
  const e = err as { details?: unknown; message?: string };
  if (Array.isArray(e.details)) {
    for (const d of e.details) {
      const msg = (d as { params?: { issue?: { message?: unknown } } })?.params?.issue?.message;
      if (typeof msg === "string" && msg) return msg;
    }
  }
  return e.message ?? null;
}
