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

describe('loadConfig ci switches', () => {
  it('enables the ci GitHub mock only outside production', () => {
    const env = { DEVDIGEST_CI_GITHUB_MOCK: 'true' };
    expect(loadConfig({ NODE_ENV: 'test', ...env } as NodeJS.ProcessEnv).ciGithubMock).toBe(true);
    expect(loadConfig({ NODE_ENV: 'production', ...env } as NodeJS.ProcessEnv).ciGithubMock).toBe(false);
    expect(loadConfig({ NODE_ENV: 'test' } as NodeJS.ProcessEnv).ciGithubMock).toBe(false);
  });
  it('resolves the runner bundle path', () => {
    expect(loadConfig({ NODE_ENV: 'test' } as NodeJS.ProcessEnv).runnerBundlePath).toMatch(
      /agent-runner\/dist\/index\.js$/,
    );
    expect(
      loadConfig({ NODE_ENV: 'test', DEVDIGEST_RUNNER_BUNDLE_PATH: '/x/r.js' } as NodeJS.ProcessEnv)
        .runnerBundlePath,
    ).toBe('/x/r.js');
  });
});
