import type { ZodType } from 'zod';
import type { BlastRadius, PrBrief, RepoRef } from '@devdigest/shared';
import type { AttachmentOwner, ModelBriefOutput, PullForBrief, StoredIntent } from './domain.js';

/**
 * Outward-facing capabilities the brief service needs. `compose.ts` is the only
 * file that knows the implementations. Shapes are STRUCTURAL: `brief/` may not
 * import `blast/`, `reviews/` or `settings/`.
 */

export type StoredBrief = { kind: 'found'; brief: PrBrief } | { kind: 'invalid' } | null;

export interface BriefStore {
  /** Workspace-scoped; null when the PR is not in the workspace. */
  getPull(workspaceId: string, prId: string): Promise<PullForBrief | null>;
  getIntent(prId: string): Promise<StoredIntent | null>;
  /** Enabled agents (with enabled linked skills) and their attachments for ONE repo. */
  listAttachmentOwners(workspaceId: string, repoId: string): Promise<AttachmentOwner[]>;
  /** Callers must have passed `getPull` first: `pr_brief` has no workspace column. */
  getBrief(prId: string): Promise<StoredBrief>;
  saveBrief(prId: string, brief: PrBrief): Promise<void>;
}

/** The Blast Radius map exactly as the Overview card shows it. */
export interface BlastMapReader {
  forPull(workspaceId: string, prId: string): Promise<BlastRadius>;
}

export interface BriefDocReader {
  readAll(
    repo: RepoRef,
    pr: { number: number; headSha: string },
    paths: string[],
  ): Promise<Map<string, { text: string; version: string }>>;
}

export interface WriteMessage {
  role: 'system' | 'user';
  content: string;
}

export interface BriefWriteResult {
  data: ModelBriefOutput;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
}

export interface PreparedBriefWriter {
  model: string;
  /** Exactly one structured request (the adapter's own re-ask may apply). */
  write(
    messages: WriteMessage[],
    opts: { schema: ZodType<ModelBriefOutput>; timeoutMs: number },
  ): Promise<BriefWriteResult>;
}

export interface BriefWriter {
  /** May throw `ConfigError` when the feature model's provider has no key. */
  prepare(workspaceId: string): Promise<PreparedBriefWriter>;
}

/** In-flight state per PR, rate window per workspace, generation tokens. Per process. */
export interface BriefGate {
  /** Records one POST and reports whether it is within the limit (counts every POST). */
  admit(workspaceId: string, now: number): boolean;
  tryBegin(prId: string): number | null;
  isCurrent(prId: string, token: number): boolean;
  end(prId: string, token: number): void;
}

export interface Clock {
  now(): number;
  /** A one-shot timer: `promise` resolves after `ms`; `clear` releases it. */
  after(ms: number): { promise: Promise<void>; clear: () => void };
}

export interface BriefLog {
  info(obj: unknown, msg: string): void;
  warn(obj: unknown, msg: string): void;
}
