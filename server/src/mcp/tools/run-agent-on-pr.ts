import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { toToolError } from '../errors.js';
import { parseAgentSelection, parsePrRef } from '../helpers.js';
import type { McpDeps } from '../ports.js';
import { RunAgentOnPrInput, RunAgentOnPrOutput } from '../schemas.js';

/**
 * `run_agent_on_pr` — start a review. Not read-only, not idempotent (two calls
 * queue two runs), and `openWorldHint` because it spends LLM budget. Runs
 * execute inside THIS process (stdio-only, no HTTP step) and are fire-and-
 * forget: poll `get_findings` with a returned `run_id` for progress/results.
 */
export function registerRunAgentOnPr(server: McpServer, deps: McpDeps): void {
  server.registerTool(
    'run_agent_on_pr',
    {
      title: 'Run a review agent on a PR',
      description:
        'Start a review run on a pull request. Identify the PR with pr_id, or with repo ("owner/name") ' +
        '+ number — exactly one of the two. Select the agent(s) with agent_id, or all:true to run every ' +
        'enabled agent — exactly one of the two. Returns immediately with running run(s); poll ' +
        'get_findings with a run_id to see progress and results. Local-DB only: the PR/repo must already ' +
        'be imported in this workspace (no GitHub sync from this tool).',
      inputSchema: RunAgentOnPrInput,
      outputSchema: RunAgentOnPrOutput,
      annotations: {
        title: 'Run a review agent on a PR',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (args) => {
      try {
        const pr = parsePrRef(args);
        const selection = parseAgentSelection(args);
        const workspaceId = await deps.workspaceId();
        const { pr_id, runs } = await deps.runAgentOnPr(workspaceId, pr, selection);
        const firstRunId = runs[0]?.run_id ?? '<run_id>';
        const structured: RunAgentOnPrOutput = {
          pr_id,
          runs,
          status: 'running',
          next_step: `Poll get_findings with run_id "${firstRunId}" to check progress and read findings once the run completes.`,
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
