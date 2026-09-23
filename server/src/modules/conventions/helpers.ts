import type {
  ConventionCandidate,
  ConventionCategory,
  ConventionDraft,
  ConventionStatus,
} from '@devdigest/shared';
import { MAX_CANDIDATES, MIN_CONFIDENCE } from './constants.js';

/**
 * Pure helpers for the conventions module — row ⇄ DTO mapping, the grounding
 * filter applied to whatever the model returns, and the assembly of accepted
 * candidates into one skill body. No I/O.
 *
 * The persisted shape is declared structurally here rather than imported from
 * `repository.ts`: the module's centre may not depend on its data layer
 * (`domain-files-are-pure`). The repository's Drizzle rows satisfy it.
 */

/** The persisted candidate shape this module maps from. */
export interface ConventionRecord {
  id: string;
  repoId: string | null;
  category: string;
  rule: string;
  evidencePath: string | null;
  evidenceLine: number | null;
  evidenceSnippet: string | null;
  confidence: number | null;
  status: string;
  createdAt: Date;
}

/** Map a persisted row to the public `ConventionCandidate` DTO. */
export function toCandidateDto(row: ConventionRecord): ConventionCandidate {
  return {
    id: row.id,
    repo_id: row.repoId ?? '',
    category: row.category as ConventionCategory,
    rule: row.rule,
    evidence_path: row.evidencePath ?? '',
    evidence_line: row.evidenceLine ?? 1,
    evidence_snippet: row.evidenceSnippet ?? '',
    confidence: row.confidence ?? 0,
    status: row.status as ConventionStatus,
    created_at: row.createdAt.toISOString(),
  };
}

/**
 * Comparison key for "is this the same rule we already have?". Lowercased and
 * stripped of punctuation and whitespace runs, because the second scan almost
 * never phrases a rule byte-for-byte the way the first one did — and without
 * this, a rejected rule comes back the moment a comma moves.
 */
export function ruleKey(rule: string): string {
  return rule
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Filter and rank what the model proposed.
 *
 * A draft survives only if it cites a file the scan actually sent. The model is
 * perfectly capable of describing a real convention and attributing it to a
 * plausible-sounding path it never saw; such a candidate is unreviewable,
 * because the evidence link on the card would lead nowhere.
 */
export function groundDrafts(drafts: ConventionDraft[], sampledPaths: string[]): ConventionDraft[] {
  const known = new Set(sampledPaths);
  return drafts
    .filter((d) => known.has(d.evidence_path))
    .filter((d) => d.confidence >= MIN_CONFIDENCE)
    .filter((d) => d.rule.trim().length > 0)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, MAX_CANDIDATES);
}

/**
 * Drop drafts whose rule already has a row for this repo, whatever that row's
 * status is. Accepted rules are already in the skill and rejected ones were
 * turned down on purpose, so re-proposing either is noise — this is what makes
 * a rejection outlive the next scan.
 */
export function dropKnownRules(drafts: ConventionDraft[], existingRules: string[]): ConventionDraft[] {
  const seen = new Set(existingRules.map(ruleKey));
  const out: ConventionDraft[] = [];
  for (const d of drafts) {
    const key = ruleKey(d.rule);
    if (seen.has(key)) continue;
    seen.add(key); // also de-duplicates within a single scan
    out.push(d);
  }
  return out;
}

/** Category headings, in the order they read best in the assembled skill. */
const CATEGORY_ORDER: readonly ConventionCategory[] = [
  'naming',
  'structure',
  'imports',
  'typing',
  'error-handling',
  'testing',
  'formatting',
  'other',
];

const CATEGORY_HEADINGS: Record<ConventionCategory, string> = {
  naming: 'Naming',
  structure: 'Structure',
  imports: 'Imports',
  typing: 'Typing',
  'error-handling': 'Error handling',
  testing: 'Testing',
  formatting: 'Formatting',
  other: 'Other',
};

/**
 * Assemble accepted candidates into one skill body.
 *
 * Every rule keeps its file and line. That citation is the whole reason this
 * skill is worth attaching: it lets a reviewer who disagrees with a rule go read
 * the code that produced it, instead of arguing with an anonymous instruction.
 */
export function assembleSkillBody(candidates: ConventionCandidate[]): string {
  const lines: string[] = ['# Repository conventions', ''];
  lines.push(
    'These rules were extracted from this repository’s own code and confirmed by a',
    'reviewer. Apply them to the diff under review. Each rule cites the file and',
    'line it was observed in — cite that evidence when you report a violation.',
    '',
  );

  for (const category of CATEGORY_ORDER) {
    const inCategory = candidates.filter((c) => c.category === category);
    if (inCategory.length === 0) continue;
    lines.push(`## ${CATEGORY_HEADINGS[category]}`, '');
    for (const c of inCategory) {
      lines.push(`- ${c.rule.trim()}`);
      lines.push(`  - Evidence: \`${c.evidence_path}:${c.evidence_line}\``);
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}
