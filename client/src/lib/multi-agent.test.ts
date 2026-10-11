import { describe, it, expect } from "vitest";
import { initialAgentSelection, MAX_AGENTS_PER_RUN } from "./multi-agent";

describe("initialAgentSelection", () => {
  it("checks the enabled agents in list order", () => {
    expect(
      initialAgentSelection([
        { id: "a", enabled: true },
        { id: "b", enabled: false },
        { id: "c", enabled: true },
      ]),
    ).toEqual(["a", "c"]);
  });
  it("caps the selection at the per-run maximum, first agents in list order", () => {
    const agents = Array.from({ length: 8 }, (_, i) => ({ id: `a${i}`, enabled: true }));
    const picked = initialAgentSelection(agents);
    expect(picked).toHaveLength(MAX_AGENTS_PER_RUN);
    expect(picked[0]).toBe("a0");
    expect(picked[5]).toBe("a5");
  });
});
