import type { BlastRadius, Risk, ReviewFocusItem } from '@devdigest/shared';

/** Plain types of the PR Brief use cases. No I/O, no framework. */

export interface BriefFile {
  path: string;
  additions: number;
  deletions: number;
  patch: string | null;
}

export interface PullForBrief {
  prId: string;
  repoId: string;
  owner: string;
  name: string;
  number: number;
  title: string;
  body: string;
  headSha: string;
  files: BriefFile[];
}

export interface StoredIntent {
  intent: string;
  in_scope: string[];
  out_of_scope: string[];
  /** Null on rows written before the column existed. */
  headSha: string | null;
}

export interface AttachmentSkill {
  id: string;
  name: string;
  /** `agent_skills.order` (link order). */
  order: number;
  paths: string[];
}

/** One enabled agent with its repo-scoped attachments; disabled ones are never passed in. */
export interface AttachmentOwner {
  id: string;
  name: string;
  createdAt: Date;
  paths: string[];
  /** Enabled skills only. */
  skills: AttachmentSkill[];
}

/** What the model returns (strict-schema shape). */
export interface ModelBriefOutput {
  summary: string;
  risks: Risk[];
  review_focus: ReviewFocusItem[];
}

export interface DroppedCounts {
  fileRefs: number;
  risks: number;
  focus: number;
}

export interface GroundingContext {
  files: BriefFile[];
  blast: BlastRadius | null;
}

export interface GroundedBrief {
  risks: Risk[];
  review_focus: ReviewFocusItem[];
  dropped: DroppedCounts;
}

export interface SentDoc {
  path: string;
  text: string;
}
