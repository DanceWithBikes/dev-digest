import { describe, it, expect } from "vitest";
import { emptyDraft, errorMessage, validateDraft } from "./helpers";

describe("validateDraft", () => {
  it("flags every blocking reason and clears them for a valid draft", () => {
    const d = emptyDraft();
    expect(validateDraft(d, [])).toEqual(["name", "diff", "file"]);

    d.name = "x";
    d.diff = "d";
    d.expectations[0]!.file = "a.ts";
    expect(validateDraft(d, ["a.ts"])).toEqual([]);
    // a file that is not among the parsed paths is invalid
    expect(validateDraft(d, ["b.ts"])).toEqual(["file"]);
    d.expectations[0]!.start = "0";
    expect(validateDraft(d, ["a.ts"])).toEqual(["lines"]);
    d.expectations[0]!.start = "4";
    d.expectations[0]!.end = "3";
    expect(validateDraft(d, ["a.ts"])).toEqual(["lines"]);
    d.expectations[0]!.start = "1";
    d.diff = "x".repeat(200_001);
    expect(validateDraft(d, ["a.ts"])).toEqual(["tooLarge"]);
  });

  it("reads the zod 422 message from details", () => {
    expect(errorMessage({ message: "bad", details: [{ params: { issue: { message: "start_line must be <= end_line" } } }] })).toBe(
      "start_line must be <= end_line",
    );
    expect(errorMessage({ message: "boom" })).toBe("boom");
  });
});
