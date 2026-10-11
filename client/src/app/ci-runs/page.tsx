import { z } from "zod";
import { CiRunsView } from "./_components/CiRunsView";

/* Route: /ci-runs (CI Runs). Thin route entry — `?agent=<id>` presets the agent
   filter (the agent's CI tab links here). The view lives under
   _components/CiRunsView. */

// Mirrors `CiRunsQuery.agent_id` (`z.string().uuid()`). Not imported from
// @devdigest/shared: a value import of its `.js`-suffixed barrel fails the build.
const AgentId = z.string().uuid();

export default async function CiRunsPage({ searchParams }: { searchParams: Promise<{ agent?: string }> }) {
  const { agent } = await searchParams;
  // A non-uuid `?agent=` would be a 422 from the API; drop it instead of sending it.
  const valid = AgentId.safeParse(agent).success ? agent : undefined;
  return <CiRunsView key={valid ?? "all"} initialAgentId={valid ?? ""} />;
}
