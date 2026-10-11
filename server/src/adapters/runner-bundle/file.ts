import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

/** The prebuilt `agent-runner` bundle, as the CI export ships it. */
export interface RunnerBundle {
  contents: string;
  bytes: number;
  /** First 12 hex characters of the bundle's sha256 — changes whenever the bundle does. */
  version: string;
}

/** Reads the prebuilt runner bundle; null when it has not been built. */
export interface RunnerBundleReader {
  read(): Promise<RunnerBundle | null>;
}

/**
 * Reads `agent-runner/dist/index.js` from disk. A missing file is `null`, not an
 * error (AC-14); this adapter never spawns a build (AC-15).
 */
export class FileRunnerBundleSource implements RunnerBundleReader {
  constructor(private path: string) {}

  async read(): Promise<RunnerBundle | null> {
    let buf: Buffer;
    try {
      buf = await readFile(this.path);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
    return {
      contents: buf.toString('utf8'),
      bytes: buf.byteLength,
      version: createHash('sha256').update(buf).digest('hex').slice(0, 12),
    };
  }
}
