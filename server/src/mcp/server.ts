import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpDeps } from './ports.js';
import { registerGetBlastRadius } from './tools/get-blast-radius.js';
import { registerGetConventions } from './tools/get-conventions.js';
import { registerGetFindings } from './tools/get-findings.js';
import { registerListAgents } from './tools/list-agents.js';
import { registerRunAgentOnPr } from './tools/run-agent-on-pr.js';

/**
 * The 5 DevDigest MCP tools, wired to a `McpDeps` port. Bare tool names
 * (`list_agents`, not `devdigest__list_agents`) — the client namespaces them
 * (Claude Code: `mcp__devdigest__list_agents`), per `.mcp.json`'s server name.
 */
export function createDevDigestMcpServer(deps: McpDeps): McpServer {
  const server = new McpServer({ name: 'devdigest', version: '0.1.0' });

  registerListAgents(server, deps);
  registerRunAgentOnPr(server, deps);
  registerGetFindings(server, deps);
  registerGetConventions(server, deps);
  registerGetBlastRadius(server, deps);

  return server;
}
