import type { BlastCaller, BlastRadius, ChangedSymbol, CommitPullRef, DownstreamImpact, PrHistory } from '@devdigest/shared';
import { PRIOR_PRS_LIMIT } from './constants.js';
import type { BlastFacadeResult, BlastIndexState } from './ports.js';

/**
 * Pure mapping from the repo-intel facade's flat shape (`BlastFacadeResult`
 * — callers as one list with a `viaSymbol` pointer) to the `BlastRadius`
 * contract (callers grouped under the symbol they reach). This grouping IS
 * the module's core job — everything else is orchestration around it.
 */

/**
 * Group `callers` by `viaSymbol`, in the facade's rank order (a symbol's
 * group position is set by the first — highest-ranked — caller that reaches
 * it), append any caller-less changed symbol as an empty group, and drop any
 * caller whose file is one that DECLARES the symbol it supposedly calls.
 *
 * The self-file filter is required defensively: the persistent repo-intel
 * path does NOT drop the declaring file on its own (only the ripgrep
 * fallback does) — see `docs/insights.md`.
 */
export function toBlastRadius(result: BlastFacadeResult): BlastRadius {
  const changedSymbols: ChangedSymbol[] = result.changedSymbols.map((s) => ({
    name: s.name,
    file: s.file,
    kind: s.kind,
  }));

  const declaringFiles = new Map<string, Set<string>>();
  for (const s of result.changedSymbols) {
    const files = declaringFiles.get(s.name) ?? new Set<string>();
    files.add(s.file);
    declaringFiles.set(s.name, files);
  }

  const facts = result.factsByFile ?? {};
  const groups = new Map<string, DownstreamImpact>();

  for (const caller of result.callers) {
    if (declaringFiles.get(caller.viaSymbol)?.has(caller.file)) continue; // self-file — never a caller of itself

    let group = groups.get(caller.viaSymbol);
    if (!group) {
      group = { symbol: caller.viaSymbol, callers: [], endpoints_affected: [], crons_affected: [] };
      groups.set(caller.viaSymbol, group);
    }

    const callerFacts = facts[caller.file];
    const endpoints = callerFacts?.endpoints ?? [];
    const crons = callerFacts?.crons ?? [];
    const dto: BlastCaller = { name: caller.symbol, file: caller.file, line: caller.line, endpoints, crons };
    group.callers.push(dto);
    for (const e of endpoints) if (!group.endpoints_affected.includes(e)) group.endpoints_affected.push(e);
    for (const c of crons) if (!group.crons_affected.includes(c)) group.crons_affected.push(c);
  }

  // Caller-less changed symbols → empty groups, appended, deduped by name.
  for (const s of result.changedSymbols) {
    if (!groups.has(s.name)) {
      groups.set(s.name, { symbol: s.name, callers: [], endpoints_affected: [], crons_affected: [] });
    }
  }

  const downstream = [...groups.values()];

  return {
    changed_symbols: changedSymbols,
    downstream,
    summary: buildSummary(changedSymbols, downstream),
    ...(result.degraded !== undefined ? { degraded: result.degraded } : {}),
    ...(result.reason !== undefined ? { reason: result.reason } : {}),
  };
}

/** "N symbols · N callers · N endpoints · N crons" — plain counts, no model. */
export function buildSummary(changedSymbols: ChangedSymbol[], downstream: DownstreamImpact[]): string {
  const callerCount = downstream.reduce((n, d) => n + d.callers.length, 0);
  const endpointCount = unionSize(downstream.map((d) => d.endpoints_affected));
  const cronCount = unionSize(downstream.map((d) => d.crons_affected));
  return `${changedSymbols.length} symbols · ${callerCount} callers · ${endpointCount} endpoints · ${cronCount} crons`;
}

function unionSize(lists: string[][]): number {
  const seen = new Set<string>();
  for (const list of lists) for (const item of list) seen.add(item);
  return seen.size;
}

/**
 * The facade's index-derived degradation only distinguishes "usable" (`full`
 * or `partial`, served as `degraded: false`) from "not usable" — it never
 * emits `index_partial`/`index_failed` on its own. This is the honest
 * downgrade: a `partial` index still answers, but the map may be incomplete;
 * a `failed` index answers nothing trustworthy.
 */
export function refineDegradation(result: BlastFacadeResult, state: BlastIndexState): BlastFacadeResult {
  if (state.status === 'failed') return { ...result, degraded: true, reason: 'index_failed' };
  if (state.status === 'partial') return { ...result, degraded: true, reason: 'index_partial' };
  return result;
}

/** One (changed file, PR GitHub associates with one of its commits) pair. */
export interface PriorPrCandidate {
  file: string;
  pr: CommitPullRef;
}

/**
 * Merged PRs only, excluding `currentNumber`, deduped by PR number with
 * `files_overlap` the union of every changed file that led to it, newest
 * merge first, capped at `PRIOR_PRS_LIMIT`.
 */
export function aggregatePriorPrs(candidates: PriorPrCandidate[], currentNumber: number): PrHistory {
  const merged = candidates.filter((c) => c.pr.mergedAt != null && c.pr.number !== currentNumber);

  const byNumber = new Map<number, { pr: CommitPullRef; files: Set<string> }>();
  for (const c of merged) {
    const entry = byNumber.get(c.pr.number);
    if (entry) entry.files.add(c.file);
    else byNumber.set(c.pr.number, { pr: c.pr, files: new Set([c.file]) });
  }

  const history = [...byNumber.values()]
    .sort((a, b) => Date.parse(b.pr.mergedAt!) - Date.parse(a.pr.mergedAt!))
    .slice(0, PRIOR_PRS_LIMIT)
    .map(({ pr, files }) => ({
      pr_number: pr.number,
      title: pr.title,
      merged_at: pr.mergedAt!,
      author: pr.author,
      files_overlap: [...files],
      notes: `touched ${files.size} of these files`,
    }));

  return { history };
}
