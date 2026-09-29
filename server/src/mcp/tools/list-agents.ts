import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Agent } from '@devdigest/shared';
import { toToolError } from '../errors.js';
import type { McpDeps } from '../ports.js';
import { AgentConcise, ListAgentsInput, ListAgentsOutput } from '../schemas.js';

function toConcise(agent: Agent): AgentConcise {
  const { system_prompt: _systemPrompt, output_schema: _outputSchema, ...rest } = agent;
  return rest;
}

/** `list_agents` — the reviewer agents configured in this workspace. */
export function registerListAgents(server: McpServer, deps: McpDeps): void {
  server.registerTool(
    'list_agents',
    {
      title: 'List review agents',
      description:
        'List the review agents configured in this workspace (provider, model, strategy, gate) — ' +
        'use this to find an agent_id for run_agent_on_pr. Set enabled_only to skip disabled agents.',
      inputSchema: ListAgentsInput,
      outputSchema: ListAgentsOutput,
      annotations: { title: 'List review agents', readOnlyHint: true, idempotentHint: true },
    },
    async (args) => {
      try {
        const workspaceId = await deps.workspaceId();
        const all = await deps.listAgents(workspaceId);
        const filtered = args.enabled_only ? all.filter((a) => a.enabled) : all;
        const agents = args.response_format === 'detailed' ? filtered : filtered.map(toConcise);
        const structured: ListAgentsOutput = { agents };
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
