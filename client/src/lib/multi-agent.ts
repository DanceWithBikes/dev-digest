/* multi-agent.ts — pure helpers shared by the PR route's agent picker and the
   multi-agent review route. Types only from `@devdigest/shared`: the client
   never value-imports it (its `.js`-suffixed barrel breaks `next dev`). */
import type { Agent } from "@devdigest/shared";

/** The server accepts 1-6 agent ids per run (RunRequest.agentIds). */
export const MAX_AGENTS_PER_RUN = 6;

/** Ids of the enabled agents: they start checked, in list order, capped at the per-run maximum. */
export function initialAgentSelection(agents: readonly Pick<Agent, "id" | "enabled">[]): string[] {
  return agents
    .filter((a) => a.enabled)
    .map((a) => a.id)
    .slice(0, MAX_AGENTS_PER_RUN);
}
