import { z } from 'zod';

/**
 * Conformance, Onboarding, Eval, Memory, Conventions, Skills,
 * Agents and their DTOs.
 */

// ---- Conformance ----
export const ConformanceStatus = z.enum(['implemented', 'missing', 'out_of_scope']);
export type ConformanceStatus = z.infer<typeof ConformanceStatus>;

export const ConformanceItem = z.object({
  requirement: z.string(),
  status: ConformanceStatus,
  evidence_file: z.string().nullish(),
  notes: z.string().nullish(),
});
export type ConformanceItem = z.infer<typeof ConformanceItem>;

export const Conformance = z.object({
  spec_id: z.string(),
  spec_title: z.string(),
  items: z.array(ConformanceItem),
  completeness_pct: z.number().min(0).max(100),
});
export type Conformance = z.infer<typeof Conformance>;

// ---- Onboarding ----
export const OnboardingLink = z.object({
  label: z.string(),
  path: z.string(),
});
export type OnboardingLink = z.infer<typeof OnboardingLink>;

export const OnboardingSection = z.object({
  kind: z.string(),
  title: z.string(),
  body: z.string(), // markdown
  diagram: z.string().nullish(), // mermaid
  links: z.array(OnboardingLink),
});
export type OnboardingSection = z.infer<typeof OnboardingSection>;

export const Onboarding = z.object({
  sections: z.array(OnboardingSection),
});
export type Onboarding = z.infer<typeof Onboarding>;

// ---- Eval ----
export const EvalPerTrace = z.object({
  name: z.string(),
  pass: z.boolean(),
  expected: z.unknown(),
  actual: z.unknown(),
});
export type EvalPerTrace = z.infer<typeof EvalPerTrace>;

export const EvalRun = z.object({
  recall: z.number().min(0).max(1),
  precision: z.number().min(0).max(1),
  citation_accuracy: z.number().min(0).max(1),
  traces_passed: z.number().int(),
  traces_total: z.number().int(),
  duration_ms: z.number().int(),
  cost_usd: z.number().nullable(),
  per_trace: z.array(EvalPerTrace),
});
export type EvalRun = z.infer<typeof EvalRun>;

export const EvalOwnerKind = z.enum(['skill', 'agent']);
export type EvalOwnerKind = z.infer<typeof EvalOwnerKind>;

export const EvalCase = z.object({
  id: z.string(),
  owner_kind: EvalOwnerKind,
  owner_id: z.string(),
  name: z.string(),
  input_diff: z.string(),
  input_files: z.unknown(),
  input_meta: z.unknown(),
  expected_output: z.unknown(),
  notes: z.string().nullish(),
});
export type EvalCase = z.infer<typeof EvalCase>;

// ---- Memory ----
export const MemoryScope = z.enum(['repo', 'global', 'team']);
export type MemoryScope = z.infer<typeof MemoryScope>;

export const MemoryKind = z.enum([
  'decision',
  'convention',
  'preference',
  'fact',
  'learning',
]);
export type MemoryKind = z.infer<typeof MemoryKind>;

export const MemorySource = z.object({
  pr: z.number().int().nullish(),
  context: z.string(),
});
export type MemorySource = z.infer<typeof MemorySource>;

export const MemoryItem = z.object({
  content: z.string(),
  scope: MemoryScope,
  kind: MemoryKind,
  confidence: z.number().min(0).max(1),
  sources: z.array(MemorySource),
});
export type MemoryItem = z.infer<typeof MemoryItem>;

// ---- Skills ----
export const SkillType = z.enum(['rubric', 'convention', 'security', 'custom']);
export type SkillType = z.infer<typeof SkillType>;

export const SkillSource = z.enum([
  'manual',
  'imported_url',
  'imported_file',
  'extracted',
  'community',
]);
export type SkillSource = z.infer<typeof SkillSource>;

export const Skill = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  type: SkillType,
  source: SkillSource,
  body: z.string(),
  enabled: z.boolean(),
  version: z.number().int(),
  evidence_files: z.array(z.string()).nullish(),
  /**
   * How many agents this skill is attached to. Derived from `agent_skills`, not
   * stored: it is a join count, so persisting it would be a second source of
   * truth that drifts the moment a link is added anywhere else.
   */
  agent_count: z.number().int().default(0),
});
export type Skill = z.infer<typeof Skill>;

/** One immutable snapshot of a skill body. Only a body change creates a version. */
export const SkillVersion = z.object({
  skill_id: z.string(),
  version: z.number().int(),
  body: z.string(),
  created_at: z.string(),
});
export type SkillVersion = z.infer<typeof SkillVersion>;

/** What the import parser could not determine, surfaced in the preview. */
export const SkillWarning = z.enum([
  'no-heading',
  'no-description',
  'unknown-type',
  'truncated',
  'code-blocks-kept-as-text',
]);
export type SkillWarning = z.infer<typeof SkillWarning>;

/** A parsed-but-unsaved skill returned by POST /skills/parse. Never persisted as-is. */
export const SkillDraft = z.object({
  name: z.string(),
  description: z.string(),
  type: SkillType,
  body: z.string(),
  warnings: z.array(SkillWarning),
});
export type SkillDraft = z.infer<typeof SkillDraft>;

/**
 * Body of POST /skills/parse — either a markdown file already read by the
 * browser (`content`), or a base64 `.zip` the server unpacks itself
 * (`archive_b64`). The zip half is server-side on purpose: unpacking is the one
 * step that has to reject things (traversal paths, bombs, no markdown inside),
 * and a rejection the browser performs is a rejection an attacker can skip.
 */
export const SkillImportRequest = z
  .object({
    filename: z.string().optional(),
    content: z.string().min(1).optional(),
    archive_b64: z.string().min(1).optional(),
  })
  .refine((v) => (v.content === undefined) !== (v.archive_b64 === undefined), {
    message: 'Provide exactly one of content or archive_b64',
  });
export type SkillImportRequest = z.infer<typeof SkillImportRequest>;

/** Body of POST /skills/:id/restore — roll the body back to an earlier snapshot. */
export const SkillRestoreRequest = z.object({
  version: z.number().int().min(1),
});
export type SkillRestoreRequest = z.infer<typeof SkillRestoreRequest>;

export const CommunitySkill = z.object({
  name: z.string(),
  repo: z.string(),
  stars: z.number().int(),
  lang: z.string(),
  desc: z.string(),
});
export type CommunitySkill = z.infer<typeof CommunitySkill>;

// ---- Conventions ----
/**
 * A house-rule the model claims to have found in the repo, plus the reviewer's
 * decision about it. Candidates are persisted BEFORE anyone judges them, so a
 * scan survives a reload and a rejection is not re-proposed by the next scan.
 */
export const ConventionCategory = z.enum([
  'naming',
  'structure',
  'error-handling',
  'testing',
  'typing',
  'imports',
  'formatting',
  'other',
]);
export type ConventionCategory = z.infer<typeof ConventionCategory>;

/** `pending` until a human accepts or rejects; only `accepted` reaches the skill. */
export const ConventionStatus = z.enum(['pending', 'accepted', 'rejected']);
export type ConventionStatus = z.infer<typeof ConventionStatus>;

/**
 * One candidate exactly as the model must return it: category, the rule itself,
 * evidence as FILE + LINE, and a confidence. Evidence is mandatory — a rule with
 * no line to point at is an opinion, and the UI has nothing to show for it.
 */
export const ConventionDraft = z.object({
  category: ConventionCategory,
  rule: z.string().min(1),
  evidence_path: z.string().min(1),
  evidence_line: z.number().int().min(1),
  evidence_snippet: z.string(),
  confidence: z.number().min(0).max(1),
});
export type ConventionDraft = z.infer<typeof ConventionDraft>;

/** A persisted candidate: a draft plus identity and the accept/reject decision. */
export const ConventionCandidate = ConventionDraft.extend({
  id: z.string(),
  repo_id: z.string(),
  status: ConventionStatus,
  created_at: z.string(),
});
export type ConventionCandidate = z.infer<typeof ConventionCandidate>;

/** Result of a scan: what was persisted, and which files it actually read. */
export const ConventionScan = z.object({
  candidates: z.array(ConventionCandidate),
  sampled_files: z.array(z.string()),
  /** Model that produced the candidates; null when the scan degraded to none. */
  model: z.string().nullable(),
});
export type ConventionScan = z.infer<typeof ConventionScan>;

/** Editable fields of a candidate (the inline Edit on a card). */
export const ConventionCandidatePatch = z.object({
  rule: z.string().min(1).optional(),
  category: ConventionCategory.optional(),
  status: ConventionStatus.optional(),
});
export type ConventionCandidatePatch = z.infer<typeof ConventionCandidatePatch>;

/**
 * Body of "Create skill" on the Conventions page. Name/description/body are all
 * editable in the modal: the assembled markdown is a PROPOSAL, and the user is
 * the one who signs off on the text an agent will be instructed with.
 */
export const ConventionSkillRequest = z.object({
  name: z.string().min(1).max(120),
  description: z.string().min(1),
  body: z.string().min(1),
  /** Agent to link the resulting skill to; omitted = create it unlinked. */
  agent_id: z.string().optional(),
});
export type ConventionSkillRequest = z.infer<typeof ConventionSkillRequest>;

// ---- Agents ----
export const Provider = z.enum(['openai', 'anthropic', 'openrouter']);
export type Provider = z.infer<typeof Provider>;

// Review execution strategy (matches @devdigest/reviewer-core's ReviewStrategy):
//  - single-pass: send the WHOLE diff in ONE model call (default)
//  - map-reduce:  one model call PER changed file (for very large diffs)
//  - auto:        single-pass, switching to map-reduce when the diff is large
export const ReviewStrategy = z.enum(['single-pass', 'map-reduce', 'auto']);
export type ReviewStrategy = z.infer<typeof ReviewStrategy>;

// CI gate policy — when a CI review should BLOCK (REQUEST_CHANGES + fail the
// check) vs just comment. Deterministic from severities; acted on ONLY in CI.
export const CiFailOn = z.enum(['never', 'critical', 'warning', 'any']);
export type CiFailOn = z.infer<typeof CiFailOn>;

export const Agent = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  provider: Provider,
  model: z.string(),
  system_prompt: z.string(),
  output_schema: z.unknown().nullish(),
  enabled: z.boolean(),
  version: z.number().int(),
  strategy: ReviewStrategy.default('single-pass'),
  ci_fail_on: CiFailOn.default('critical'),
  // Inject repo-intel context (repo skeleton + callers + rank note) into this
  // agent's review prompt. Default on; gated again by the global flag.
  repo_intel: z.boolean().default(true),
});
export type Agent = z.infer<typeof Agent>;

export const AgentSkillLink = z.object({
  agent_id: z.string(),
  skill_id: z.string(),
  order: z.number().int(),
});
export type AgentSkillLink = z.infer<typeof AgentSkillLink>;
