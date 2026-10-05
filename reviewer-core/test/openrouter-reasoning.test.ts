import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { OpenRouterProvider } from '../src/index.js';

/** A loopback server stands in for OpenRouter and records the request bodies. */
const Out = z.object({ ok: z.boolean() });

let server: http.Server | undefined;
const bodies: Array<Record<string, unknown>> = [];

afterEach(async () => {
  bodies.length = 0;
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = undefined;
});

async function fake(content: string, finishReason: string, usage: Record<string, number>): Promise<OpenRouterProvider> {
  server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      bodies.push(JSON.parse(raw) as Record<string, unknown>);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          id: 'x',
          object: 'chat.completion',
          created: 0,
          model: 'test/model',
          choices: [{ index: 0, finish_reason: finishReason, message: { role: 'assistant', content } }],
          usage,
        }),
      );
    });
  });
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  const baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  return new OpenRouterProvider('k', { baseURL, maxRetries: 0 });
}

const request = {
  model: 'test/model',
  schemaName: 'Out',
  schema: Out,
  messages: [{ role: 'user' as const, content: 'hi' }],
  maxTokens: 4000,
  singleAttempt: true,
};

describe('OpenRouterProvider reasoning and truncation', () => {
  it('sends the reasoning field only when the request sets it', async () => {
    const p = await fake('{"ok":true}', 'stop', { prompt_tokens: 1, completion_tokens: 1 });
    await p.completeStructured(request);
    expect(bodies[0]).not.toHaveProperty('reasoning');
    await p.completeStructured({ ...request, reasoning: { enabled: false } });
    expect(bodies[1]?.reasoning).toEqual({ enabled: false });
  });

  it('throws a truncation error naming max_tokens and finish_reason: length, with the usage attached', async () => {
    const p = await fake('{"ok":tr', 'length', { prompt_tokens: 7000, completion_tokens: 4000, cost: 0.002 });
    const err = (await p.completeStructured(request).then(
      () => null,
      (e: unknown) => e,
    )) as (Error & { usage?: unknown }) | null;
    expect(err).toBeInstanceOf(Error);
    expect(err?.message).toMatch(/truncated at max_tokens \(finish_reason: length\)/);
    expect(err?.message).not.toMatch(/schema validation/);
    expect(err?.usage).toEqual({ tokensIn: 7000, tokensOut: 4000, costUsd: 0.002 });
  });

  it('still reports a schema failure when the output was not truncated', async () => {
    const p = await fake('{"nope":1}', 'stop', { prompt_tokens: 1, completion_tokens: 1 });
    await expect(p.completeStructured(request)).rejects.toThrow(/failed schema validation/);
  });
});
