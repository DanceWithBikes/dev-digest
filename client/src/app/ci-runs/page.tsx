import { CiRunsQuery } from "@devdigest/shared";
import { CiRunsView } from "./_components/CiRunsView";

/* Route: /ci-runs (CI Runs). Thin route entry — `?agent=<id>` presets the agent
   filter (the agent's CI tab links here). The view lives under
   _components/CiRunsView. */
export default async function CiRunsPage({ searchParams }: { searchParams: Promise<{ agent?: string }> }) {
  const { agent } = await searchParams;
  // A non-uuid `?agent=` would be a 422 from the API; drop it instead of sending it.
  const valid = CiRunsQuery.shape.agent_id.safeParse(agent).success ? agent : undefined;
  return <CiRunsView key={valid ?? "all"} initialAgentId={valid ?? ""} />;
}
