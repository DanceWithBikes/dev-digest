/**
 * Outward-facing capabilities the pulls service needs. `compose.ts` is the only
 * file that knows which implementations satisfy them.
 */

/**
 * Just the level this module uses. Declared structurally rather than importing
 * Fastify's logger type: the service must stay free of `fastify`, and every
 * call here is a downgrade-to-persisted-data notice, never an error path.
 */
export interface WarnLogger {
  warn(obj: unknown, msg: string): void;
}
