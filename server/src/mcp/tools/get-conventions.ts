import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { toToolError } from '../errors.js';
import { countByStatus, filterByStatus, parseRepoRef } from '../helpers.js';
import type { McpDeps } from '../ports.js';
import { GetConventionsInput, GetConventionsOutput } from '../schemas.js';

/**
 * `get_conventions` — a repo's house rules (from the Conventions scan),
 * filtered by status. `counts` always covers every status, independent of the
 * filter, so a caller viewing `pending` still sees how much was already
 * accepted/rejected.
 */
export function registerGetConventions(server: McpServer, deps: McpDeps): void {
  server.registerTool(
    'get_conventions',
    {
      title: 'Get repo conventions',
      description:
        'Read a repo’s house rules extracted by the Conventions scan. Identify the repo with repo_id, or ' +
        'with repo ("owner/name"). status filters the returned list (default "accepted" — the rules that ' +
        'actually reach a review); counts always cover every status. Set include_skill_markdown to also ' +
        'get the assembled skill body the accepted rules would produce.',
      inputSchema: GetConventionsInput,
      outputSchema: GetConventionsOutput,
      annotations: { title: 'Get repo conventions', readOnlyHint: true, idempotentHint: true },
    },
    async (args) => {
      try {
        const workspaceId = await deps.workspaceId();
        const repo = await deps.resolveRepo(workspaceId, parseRepoRef(args));
        const all = await deps.listConventions(workspaceId, repo.id);
        const structured: GetConventionsOutput = {
          repo,
          conventions: filterByStatus(all, args.status),
          counts: countByStatus(all),
          ...(args.include_skill_markdown
            ? { skill_markdown: await deps.previewConventionsSkillBody(workspaceId, repo.id) }
            : {}),
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
