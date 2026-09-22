import { ConventionsView } from "./_components/ConventionsView";

/* Route: /repos/:repoId/conventions (Skills Lab → Conventions). Thin route
   entry — the scan controls, candidate cards and create-skill modal all live
   under _components/ConventionsView. */
export default function ConventionsPage() {
  return <ConventionsView />;
}
