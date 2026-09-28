import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { AppError } from '../platform/errors.js';

/**
 * `AppError` → a tool's `isError` result. `platform/errors.ts` is the one
 * `src/platform/` file `mcp-tools-talk-to-ports` allows every file here to
 * import — it is the shared error taxonomy, not a platform detail.
 */

export type ToolErrorResult = CallToolResult & { isError: true };

/**
 * A short, actionable hint appended per `AppError.code` — an LLM caller acts
 * on this text directly, so "not found" alone is a dead end but "check the id
 * and that it belongs to this workspace" is something it can retry from.
 */
const HINTS: Partial<Record<string, string>> = {
  not_found: 'Double-check the id/reference — it must already exist in this workspace (imported repo/PR, configured agent).',
  validation_error: 'Fix the arguments as described and retry.',
  config_error: 'A provider key is missing on the server side — configure it in Settings, not from this tool.',
  external_service_error: 'The upstream service (e.g. GitHub) failed or is unreachable; retry later.',
};

/**
 * Turn a caught error into a tool result with `isError: true`. Never surfaces
 * a raw stack trace or an unrecognised error's message to the MCP client —
 * only an `AppError`'s own `code`/`message` are trusted as safe to show
 * (`platform/errors.ts` documents them as the stable, user-facing taxonomy).
 * Anything else is logged to stderr (never stdout — that is the JSON-RPC
 * transport) and reported generically.
 */
export function toToolError(err: unknown): ToolErrorResult {
  if (err instanceof AppError) {
    const hint = HINTS[err.code];
    const text = hint ? `${err.message} ${hint}` : err.message;
    return { content: [{ type: 'text', text }], isError: true };
  }
  const detail = err instanceof Error ? (err.stack ?? err.message) : String(err);
  process.stderr.write(`[devdigest-mcp] unexpected tool error: ${detail}\n`);
  return { content: [{ type: 'text', text: 'Internal error.' }], isError: true };
}
