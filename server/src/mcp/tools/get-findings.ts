import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FindingRecord, ReviewRecord } from '@devdigest/shared';
import { toToolError } from '../errors.js';
import { filterBySeverity } from '../helpers.js';
import type { McpDeps } from '../ports.js';
import { FindingConcise, GetFindingsInput, GetFindingsOutput, ReviewHeader } from '../schemas.js';

function toConcise(finding: FindingRecord): FindingConcise {
  const { rationale: _rationale, suggestion: _suggestion, evidence: _evidence, ...rest } = finding;
  return rest;
}

function toHeader(review: ReviewRecord): ReviewHeader {
  const { findings: _findings, ...rest } = review;
  return rest;
}

/**
 * `get_findings` — read a run's findings; also the poll target for
 * `run_agent_on_pr`. A FAILED or CANCELLED run is not an `isError` result —
 * its status and error text are on `run`, so a caller can tell "still
 * running" from "done with 0 findings" from "failed, here's why".
 */
export function registerGetFindings(server: McpServer, deps: McpDeps): void {
  server.registerTool(
    'get_findings',
    {
      title: 'Get a run’s findings',
      description:
        'Read a review run’s status, review verdict and findings — poll this with a run_id from ' +
        'run_agent_on_pr to check progress and read results. A run that failed or was cancelled is ' +
        'returned normally (see run.status / run.error), never as a tool error. Filter with ' +
        'min_severity and page with limit.',
      inputSchema: GetFindingsInput,
      outputSchema: GetFindingsOutput,
      annotations: { title: 'Get a run’s findings', readOnlyHint: true, idempotentHint: true },
    },
    async (args) => {
      try {
        const workspaceId = await deps.workspaceId();
        const { run, review } = await deps.getRunResult(workspaceId, args.run_id);
        const all = review?.findings ?? [];
        const filtered = filterBySeverity(all, args.min_severity);
        const total = filtered.length;
        const sliced = filtered.slice(0, args.limit);
        const findings = args.response_format === 'detailed' ? sliced : sliced.map(toConcise);
        const structured: GetFindingsOutput = {
          run,
          review: review ? toHeader(review) : null,
          findings,
          total,
          truncated: total > sliced.length,
        };
        return {
          content: [{ type: 'text', text: JSON.stringify(structured, null, 2) }],
          structuredContent: structured,
        };
      } catch (err) {
        return toToolError(err);
      }
    },
  );
}
