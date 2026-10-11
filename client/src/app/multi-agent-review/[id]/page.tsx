import { Suspense } from "react";
import { MultiAgentResultsView } from "../_components/MultiAgentResultsView";

/* Route: /multi-agent-review/[id] — one parent run, side by side. Suspense:
   the view keeps Columns/Tabs in `?view=` via useSearchParams. */
export default async function MultiAgentResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense>
      <MultiAgentResultsView id={id} />
    </Suspense>
  );
}
