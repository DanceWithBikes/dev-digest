import type { EvalExpectationKind } from "@devdigest/shared";

/** Expectation kinds offered in the select, with their copy keys (`eval.caseEditor.kinds.*`). */
export const KIND_OPTIONS: readonly { value: EvalExpectationKind; labelKey: "mustFind" | "mustNotFlag" }[] = [
  { value: "must_find", labelKey: "mustFind" },
  { value: "must_not_flag", labelKey: "mustNotFlag" },
];
