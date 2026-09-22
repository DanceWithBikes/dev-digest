import { Suspense } from "react";
import { SkillsView } from "./_components/SkillsView";

/* Route: /skills (Skills Lab). Thin route entry — the view, its preview pane,
   import drawer, styles, constants and helpers are colocated under
   _components/SkillsView. Suspense wraps the view because it reads the
   `?skill=` selection with useSearchParams. */
export default function SkillsPage() {
  return (
    <Suspense>
      <SkillsView />
    </Suspense>
  );
}
