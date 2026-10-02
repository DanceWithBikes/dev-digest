import { z } from 'zod';

/**
 * Project Context: Markdown documents of an imported repo that reviewers can
 * attach per repo to an agent or a skill. Documents are never stored; only
 * attached paths are. Token counts are always computed server-side
 * (ceil(chars / 4)); the studio only sums what the server returns.
 */

export const ContextDocType = z.enum(['spec', 'insights', 'doc']);
export type ContextDocType = z.infer<typeof ContextDocType>;

export const ContextDocument = z.object({
  path: z.string(),
  type: ContextDocType,
  chars: z.number().int(),
  tokens: z.number().int(),
  agents_count: z.number().int(),
  skills_count: z.number().int(),
});
export type ContextDocument = z.infer<typeof ContextDocument>;

export const ContextListing = z.object({
  repo_id: z.string(),
  roots: z.array(z.string()),
  roots_default: z.boolean(),
  cloned: z.boolean(),
  count: z.number().int(),
  scanned_at: z.string(),
  documents: z.array(ContextDocument),
});
export type ContextListing = z.infer<typeof ContextListing>;

export const ContextPreview = z.object({
  path: z.string(),
  text: z.string(),
  chars: z.number().int(),
  tokens: z.number().int(),
});
export type ContextPreview = z.infer<typeof ContextPreview>;

export const ContextRootsInput = z.object({ roots: z.array(z.string()) });
export type ContextRootsInput = z.infer<typeof ContextRootsInput>;

export const ContextAttachment = z.object({
  path: z.string(),
  /** True when the attached path no longer exists in the clone (kept stored). */
  missing: z.boolean(),
});
export type ContextAttachment = z.infer<typeof ContextAttachment>;

export const ContextSelection = z.object({
  repo_id: z.string(),
  attachments: z.array(ContextAttachment),
});
export type ContextSelection = z.infer<typeof ContextSelection>;

export const AgentContextSelection = ContextSelection.extend({
  /** Paths contributed by the agent's enabled linked skills, for the same repo. */
  linked_skill_paths: z.array(z.string()),
});
export type AgentContextSelection = z.infer<typeof AgentContextSelection>;

export const ContextSelectionInput = z.object({ paths: z.array(z.string()) });
export type ContextSelectionInput = z.infer<typeof ContextSelectionInput>;
