import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { OpenRouterProvider } from '../src/index.js';

/**
 * The OpenAI SDK's `timeout` stops counting once response HEADERS arrive.
 * OpenRouter answers 200 immediately and then trickles whitespace keep-alives
 * while the upstream model works, so a stalled upstream used to hang a review
 * run forever. These tests stand in a loopback server for OpenRouter (no
 * external network) and pin that `deadlineMs` bounds the whole call.
 */
const Out = z.object({ ok: z.boolean() });

let server: http.Server | undefined;

afterEach(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = undefined;
});

async function fakeOpenRouter(handler: http.RequestListener): Promise<string> {
  server = http.createServer(handler);
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
}

function provider(baseURL: string, deadlineMs: number) {
  // timeoutMs far above deadlineMs so only the deadline can end the call.
  return new OpenRouterProvider('test-key', { baseURL, deadlineMs, timeoutMs: 60_000, maxRetries: 0 });
}

const request = {
  model: 'test/model',
  schemaName: 'Out',
  schema: Out,
  messages: [{ role: 'user' as const, content: 'hi' }],
};

describe('OpenRouterProvider deadline', () => {
  it('fails a call whose body stalls after the 200 headers (keep-alive trickle)', async () => {
    const baseURL = await fakeOpenRouter((req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      const keepAlive = setInterval(() => res.write(' '), 50);
      req.on('close', () => clearInterval(keepAlive));
      res.on('close', () => clearInterval(keepAlive));
    });

    const started = Date.now();
    await expect(provider(baseURL, 400).completeStructured(request)).rejects.toThrow(
      /Out request exceeded the 0.4s deadline/,
    );
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it('fails a call that never sends headers, with the same message', async () => {
    const baseURL = await fakeOpenRouter(() => {
      /* never respond */
    });

    await expect(provider(baseURL, 400).completeStructured(request)).rejects.toThrow(/exceeded the 0.4s deadline/);
  });

  it('returns normally when the response arrives inside the deadline', async () => {
    const baseURL = await fakeOpenRouter((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          id: 'x',
          object: 'chat.completion',
          created: 0,
          model: 'test/model',
          choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: '{"ok":true}' } }],
          usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
        }),
      );
    });

    const result = await provider(baseURL, 2_000).completeStructured(request);
    expect(result.data).toEqual({ ok: true });
    expect(result.tokensIn).toBe(3);
  });
});
