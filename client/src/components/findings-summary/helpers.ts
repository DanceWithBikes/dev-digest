import type { Severity, PrSeverityCounts } from "@devdigest/shared";
import { SEVERITIES, COUNT_KEY } from "./constants";

/**
 * Tally findings by severity — the client mirror of the server's
 * `rollupSeverities`. Counts EVERY finding handed to it, including dismissed
 * ones, so a pill's number always equals the cards rendered under it.
 */
export function countBySeverity(findings: readonly { severity: string }[]): PrSeverityCounts {
  const counts: PrSeverityCounts = { critical: 0, warning: 0, suggestion: 0 };
  for (const f of findings) {
    if (f.severity === "CRITICAL") counts.critical += 1;
    else if (f.severity === "WARNING") counts.warning += 1;
    else if (f.severity === "SUGGESTION") counts.suggestion += 1;
  }
  return counts;
}

export function totalFindings(counts: PrSeverityCounts): number {
  return counts.critical + counts.warning + counts.suggestion;
}

/** Severities with at least one finding, worst-first. */
export function presentSeverities(counts: PrSeverityCounts): Severity[] {
  return SEVERITIES.filter((sev) => counts[COUNT_KEY[sev]] > 0);
}

/** "12" or "12-18" — the line range shown next to a file path. */
export function lineLabel(f: { start_line: number; end_line: number }): string {
  return f.start_line === f.end_line ? String(f.start_line) : `${f.start_line}-${f.end_line}`;
}

/**
 * Markdown → plain text for the popover's 2-line clamp. Rendering real
 * markdown there would emit block elements the line-clamp can't collapse.
 */
export function plainText(md: string): string {
  return md
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1") // links / images → their text
    .replace(/`+/g, "") // code spans
    // Emphasis markers only as PAIRS — findings are full of snake_case
    // identifiers and `sk_live_` style literals that must survive intact.
    .replace(/\*\*|__/g, "")
    .replace(/^\s*[#>]+\s*/gm, "") // headings / block quotes
    .replace(/\s+/g, " ")
    .trim();
}
