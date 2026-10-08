import { describe, it, expect } from "vitest";
import type { EvalAgentSummary } from "@devdigest/shared";
import { canRunAgent, runnableAgents, errorMessage } from "./helpers";

const agent = (over: Partial<EvalAgentSummary>): EvalAgentSummary => ({
  agent_id: "a1",
  name: "A",
  model: "m",
  cases_total: 2,
  latest_batch: null,
  trend: [],
  ...over,
});

describe("eval dashboard helpers", () => {
  it("runs every agent with cases, including one with a batch in flight, except those just started", () => {
    const running = agent({ agent_id: "r", latest_batch: { status: "running" } as EvalAgentSummary["latest_batch"] });
    const list = [agent({}), agent({ agent_id: "z", cases_total: 0 }), running, agent({ agent_id: "s" })];
    expect(runnableAgents(list, new Set(["s"])).map((a) => a.agent_id)).toEqual(["a1", "r"]);
    expect(canRunAgent(running)).toBe(true);
  });

  it("maps errors to plain text", () => {
    expect(errorMessage(new Error("boom <b>"))).toBe("boom <b>");
    expect(errorMessage("x")).toBe("x");
  });
});
