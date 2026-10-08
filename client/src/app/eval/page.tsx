import { EvalDashboardView } from "./_components/EvalDashboardView";

/* Route: /eval (Eval Dashboard). Thin route entry — the view, its agent rows,
   recent-runs table, styles, constants and helpers live under
   _components/EvalDashboardView. */
export default function EvalPage() {
  return <EvalDashboardView />;
}
