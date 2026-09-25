/* diff-viewer — unified-diff viewer with optional inline GitHub comments and
   findings. Public surface: the DiffViewer component + the DiffCommentApi /
   DiffFindingApi contracts (FileCard/CodeLine stay internal). */
export { DiffViewer } from "./DiffViewer";
export type { DiffCommentApi } from "./comments";
export type { DiffFindingAnchor, DiffFindingApi } from "./findings";
