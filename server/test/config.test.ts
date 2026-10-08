import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/platform/config.js';

describe('loadConfig rateLimitMax', () => {
  it('defaults to 120', () => {
    expect(loadConfig({ NODE_ENV: 'test' } as NodeJS.ProcessEnv).rateLimitMax).toBe(120);
  });
  it('reads RATE_LIMIT_MAX', () => {
    expect(loadConfig({ NODE_ENV: 'test', RATE_LIMIT_MAX: '2000' } as NodeJS.ProcessEnv).rateLimitMax).toBe(2000);
  });
});
