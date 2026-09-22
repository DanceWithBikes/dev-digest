import { z } from 'zod';
import { ConventionDraft } from '@devdigest/shared';
import type { SampleFile } from './ports.js';

/**
 * The structured-output schema for the extraction call. An envelope object
 * rather than a bare array: OpenAI's json_schema mode rejects a top-level array,
 * and every provider handles a named object the same way.
 */
export const CandidatesEnvelope = z.object({
  candidates: z.array(ConventionDraft),
});
export type CandidatesEnvelope = z.infer<typeof CandidatesEnvelope>;

/**
 * Prompt construction for the conventions scan. Pure string building — no I/O,
 * no model call. Kept out of `service.ts` so the wording can be read and changed
 * without reading the orchestration around it.
 */

/**
 * The model is asked for observations, not advice. The difference matters:
 * "prefer early returns" is an opinion that would be attached to every repo,
 * whereas "guard clauses return before the happy path, as in x.ts:14" is a claim
 * about THIS code that a reviewer can check and reject.
 */
export const SYSTEM_PROMPT = `You extract the coding conventions a repository already follows.

You are given a sample of that repository: its linter/formatter/tsconfig files first, then
its most-depended-on source files, each with 1-based line numbers.

Report only rules that the sample DEMONSTRATES. A convention is something this codebase does
consistently — a naming shape, a file layout, an error-handling habit, an import style, a
testing pattern. It is not a best practice you would recommend to any project.

For every rule:
- Phrase it as a directive a reviewer can apply to a diff ("Repository errors are thrown as
  classes from platform/errors.ts, never as reply.code()"), not as a description of the code.
- Cite ONE file from the sample and the exact 1-based line number where the rule is visible.
  The path must be copied verbatim from a "FILE:" header in the sample.
- Quote that line (or the few lines around it) as the snippet.
- Give a confidence between 0 and 1: 0.9+ when a config file states the rule outright or many
  sampled files follow it, 0.5-0.7 when you saw it two or three times, below 0.5 never.

Do not invent a path. Do not report a rule you cannot point at. Returning few rules is a valid
answer; padding the list with generic advice is not.`;

/** Render one sampled file with 1-based line numbers so citations are checkable. */
function renderSample(file: SampleFile): string {
  const numbered = file.text
    .split(/\r?\n/)
    .map((line, i) => `${i + 1}: ${line}`)
    .join('\n');
  const kind = file.isConfig ? 'CONFIG' : 'SOURCE';
  return `FILE: ${file.path} (${kind})\n${numbered}`;
}

/** The user message: the whole sample, configs first. */
export function buildUserPrompt(samples: SampleFile[]): string {
  const configs = samples.filter((s) => s.isConfig);
  const sources = samples.filter((s) => !s.isConfig);
  const header =
    `Sample: ${configs.length} config file(s) and ${sources.length} source file(s) ` +
    `from this repository.\n`;
  return [header, ...[...configs, ...sources].map(renderSample)].join('\n\n');
}
