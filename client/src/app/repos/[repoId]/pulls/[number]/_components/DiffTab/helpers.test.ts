import { describe, it, expect } from "vitest";
import type { PrFile, SmartDiffGroup } from "@devdigest/shared";
import { roleLabelKey, toPrFiles } from "./helpers";

const prFile = (path: string): PrFile => ({ path, additions: 1, deletions: 0, patch: "@@ -1 +1 @@\n+x" });

describe("toPrFiles", () => {
  it("maps a group's files back to the PrFile carrying the patch, in group order, dropping any that vanished from the diff", () => {
    const group: SmartDiffGroup = {
      role: "core",
      files: [
        { path: "b.ts", additions: 1, deletions: 0, finding_lines: [] },
        { path: "gone.ts", additions: 1, deletions: 0, finding_lines: [] },
        { path: "a.ts", additions: 1, deletions: 0, finding_lines: [] },
      ],
    };
    const files = [prFile("a.ts"), prFile("b.ts")];
    expect(toPrFiles(group, files).map((f) => f.path)).toEqual(["b.ts", "a.ts"]);
  });
});

describe("roleLabelKey", () => {
  it("appends Label to the role, matching the prReview.smartDiff copy keys", () => {
    expect(roleLabelKey("core")).toBe("coreLabel");
    expect(roleLabelKey("tests")).toBe("testsLabel");
    expect(roleLabelKey("wiring")).toBe("wiringLabel");
    expect(roleLabelKey("docs")).toBe("docsLabel");
    expect(roleLabelKey("boilerplate")).toBe("boilerplateLabel");
  });
});
