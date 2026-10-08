import { Suspense } from "react";
import { SkillsView } from "./_components/SkillsView";

/* Route: /skills (Skills Lab). Thin route entry — the view is colocated under
   _components/SkillsView, the shared list (cards, create, import) under
   _components/SkillsListColumn. */
export default function SkillsPage() {
  return (
    <Suspense>
      <SkillsView />
    </Suspense>
  );
}
