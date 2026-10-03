import type { OnboardingSectionId } from "@devdigest/shared";
import type { IconName } from "@devdigest/ui";

export type { OnboardingSectionId, IconName };

export interface LaidOutNode {
  id: string;
  label: string;
  x: number;
  y: number;
}

export interface LaidOutEdge {
  key: string;
  from: string;
  to: string;
  weight: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Where the weight label sits. */
  mx: number;
  my: number;
}

export interface DiagramLayout {
  width: number;
  height: number;
  nodes: LaidOutNode[];
  edges: LaidOutEdge[];
}
