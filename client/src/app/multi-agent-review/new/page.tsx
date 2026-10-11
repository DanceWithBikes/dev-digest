import { Suspense } from "react";
import { ConfigureRunView } from "../_components/ConfigureRunView";

/* Route: /multi-agent-review/new — pick a PR and the agents to fan out.
   Suspense: the view reads `?pr=` through useSearchParams. */
export default function ConfigureRunPage() {
  return (
    <Suspense>
      <ConfigureRunView />
    </Suspense>
  );
}
