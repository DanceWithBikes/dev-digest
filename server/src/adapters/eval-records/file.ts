import { readFile } from 'node:fs/promises';

/** Reads the evals records file as text; null when it does not exist. */
export interface EvalRecordsReader {
  read(): Promise<string | null>;
}

/**
 * Reads the evals package's `records.jsonl` from disk. Structurally satisfies the
 * skills module's `EvalRecordsSource` port; a missing file is `null`, not an error.
 */
export class FileEvalRecordsSource implements EvalRecordsReader {
  constructor(private path: string) {}

  async read(): Promise<string | null> {
    try {
      return await readFile(this.path, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }
}
