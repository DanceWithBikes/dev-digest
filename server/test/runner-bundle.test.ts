import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileRunnerBundleSource } from '../src/adapters/runner-bundle/file.js';

describe('FileRunnerBundleSource', () => {
  it('returns contents, size and a stable 12-hex version', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'runner-'));
    const path = join(dir, 'index.js');
    await writeFile(path, 'console.log(1);\n');
    const a = await new FileRunnerBundleSource(path).read();
    const b = await new FileRunnerBundleSource(path).read();
    expect(a?.contents).toBe('console.log(1);\n');
    expect(a?.bytes).toBe(16);
    expect(a?.version).toMatch(/^[0-9a-f]{12}$/);
    expect(b?.version).toBe(a?.version);
  });

  it('returns null for a missing bundle', async () => {
    expect(await new FileRunnerBundleSource('/nonexistent/index.js').read()).toBeNull();
  });
});
