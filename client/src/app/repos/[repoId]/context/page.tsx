import { ProjectContextView } from "./_components/ProjectContextView";

/* Route: /repos/:repoId/context (Project Context). Thin route entry — the tree,
   preview, footer and search-roots editor live under _components/ProjectContextView. */
export default function ProjectContextPage() {
  return <ProjectContextView />;
}
