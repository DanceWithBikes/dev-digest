import type { EvalAgentSummary } from "@devdigest/shared";

/**
 * An agent can be run when it has cases and was not just started here. A batch already running
 * server-side is still requested: the server answers 409 `batch_running`, surfaced as a toast (AC-109/110).
 */
export function canRunAgent(a: EvalAgentSummary, starting: ReadonlySet<string> = new Set()): boolean {
  return a.cases_total > 0 && !starting.has(a.agent_id);
}

/** Agents "Run all agents" should start. */
export function runnableAgents(agents: EvalAgentSummary[], starting?: ReadonlySet<string>): EvalAgentSummary[] {
  return agents.filter((a) => canRunAgent(a, starting));
}

/** Plain-text message of an unknown failure (rendered as text, never as HTML). */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
