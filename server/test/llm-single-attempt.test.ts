import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { OpenRouterProvider } from '@devdigest/reviewer-core';
import type { LLMProvider } from '@devdigest/shared';
import { OpenAIProvider } from '../src/adapters/llm/openai.js';
import { AnthropicProvider } from '../src/adapters/llm/anthropic.js';

/**
 * `singleAttempt` means exactly ONE HTTP request: no transport retry (SDK
 * `maxRetries`, adapter `withRetry`) and no repair re-prompt. A local fake
 * server counts the requests each provider makes. Providers are built with
 * their DEFAULT retry settings so the test fails if a layer is left on.
 */
const Out = z.object({ ok: z.boolean() });

type Mode = '500' | '429' | 'invalid' | 'hang';
let server: http.Server | undefined;
let requests = 0;

afterEach(async () => {
  const s = server;
  server = undefined;
  if (!s) return;
  s.closeAllConnections();
  await new Promise<void>((resolve) => s.close(() => resolve()));
});

/** Answers every request per `mode`; `shape` picks the provider's success envelope. */
async function fake(mode: Mode, shape: 'openai' | 'anthropic'): Promise<string> {
  requests = 0;
  server = http.createServer((req, res) => {
    requests++;
    req.resume();
    req.on('end', () => {
      if (mode === 'hang') return void setTimeout(() => res.destroyed || res.end(), 2_000);
      res.setHeader('content-type', 'application/json');
      if (mode === '500') {
        res.statusCode = 500;
        return res.end(JSON.stringify({ error: { message: 'boom' } }));
      }
      if (mode === '429') {
        res.statusCode = 429;
        res.setHeader('retry-after', '0');
        return res.end(JSON.stringify({ error: { message: 'slow down' } }));
      }
      // schema-invalid body (valid JSON, wrong shape)
      res.statusCode = 200;
      res.end(
        JSON.stringify(
          shape === 'openai'
            ? {
                id: 'x',
                object: 'chat.completion',
                choices: [{ index: 0, message: { role: 'assistant', content: '{"nope":1}' } }],
                usage: { prompt_tokens: 1, completion_tokens: 1 },
              }
            : {
                id: 'x',
                type: 'message',
                role: 'assistant',
                model: 'm',
                content: [{ type: 'tool_use', id: 't', name: 'Out', input: { nope: 1 } }],
                usage: { input_tokens: 1, output_tokens: 1 },
              },
        ),
      );
    });
  });
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

const request = (timeoutMs = 5_000) => ({
  model: 'test/model',
  schemaName: 'Out',
  schema: Out,
  messages: [{ role: 'user' as const, content: 'hi' }],
  singleAttempt: true,
  timeoutMs,
});

const providers: Array<{
  name: string;
  shape: 'openai' | 'anthropic';
  make: (base: string) => LLMProvider;
}> = [
  { name: 'openai', shape: 'openai', make: (b) => new OpenAIProvider('k', { baseURL: `${b}/v1` }) },
  { name: 'anthropic', shape: 'anthropic', make: (b) => new AnthropicProvider('k', { baseURL: b }) },
  {
    name: 'openrouter',
    shape: 'openai',
    make: (b) => new OpenRouterProvider('k', { baseURL: `${b}/v1` }),
  },
];

describe.each(providers)('singleAttempt on $name', ({ shape, make }) => {
  it.each(['500', '429', 'invalid'] as const)('makes exactly one request and throws on %s', async (mode) => {
    const p = make(await fake(mode, shape));
    await expect(p.completeStructured(request())).rejects.toThrow();
    expect(requests).toBe(1);
  });

  it('aborts a hanging request at timeoutMs, after one request', async () => {
    const p = make(await fake('hang', shape));
    const started = Date.now();
    await expect(p.completeStructured(request(200))).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(1_500);
    expect(requests).toBe(1);
  });
});
