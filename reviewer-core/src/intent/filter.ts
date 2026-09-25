import type { Finding } from '@devdigest/shared';
import type { GroundingResult } from '../grounding.js';

/**
 * Out-of-scope filtering — the second mechanical gate, run AFTER citation
 * grounding. The reviewer prompt (see `prompt.ts`'s SCOPE_INSTRUCTION) tags a
 * finding `out_of_scope: true` when its subject matches something the derived
 * PR intent lists as out of scope. That tag is a HINT, never a waiver:
 *
 *   in scope, or `out_of_scope` absent/false → keep
 *   out of scope, severity < CRITICAL        → drop ("out of scope: <title>")
 *   out of scope, severity === CRITICAL      → keep the single
 *                                               highest-confidence one, drop
 *                                               the rest ("out of scope
 *                                               (collapsed)")
 *
 * A genuinely severe defect always leaves at least one signal, even when its
 * subject was declared out of scope — the same rule `INJECTION_GUARD` states
 * for the review as a whole. Returns the same shape as `groundFindings` so
 * the two gates chain: `filterByIntent(groundFindings(...).kept)`.
 */
export function filterByIntent(findings: Finding[]): GroundingResult {
  const kept: Finding[] = [];
  const dropped: { finding: Finding; reason: string }[] = [];
  const criticalOutOfScope: Finding[] = [];

  for (const finding of findings) {
    if (!finding.out_of_scope) {
      kept.push(finding);
      continue;
    }
    if (finding.severity === 'CRITICAL') {
      criticalOutOfScope.push(finding);
      continue;
    }
    dropped.push({ finding, reason: `out of scope: ${finding.title}` });
  }

  if (criticalOutOfScope.length > 0) {
    const bySurvivorFirst = [...criticalOutOfScope].sort(
      (a, b) => b.confidence - a.confidence,
    );
    const [survivor, ...rest] = bySurvivorFirst;
    kept.push(survivor!);
    for (const finding of rest) {
      dropped.push({ finding, reason: 'out of scope (collapsed)' });
    }
  }

  return { kept, dropped };
}
