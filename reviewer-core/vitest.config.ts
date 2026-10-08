import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      // Single-sourced contracts live in the server's vendored shared (the
      // engine borrows them; see tsconfig paths).
      '@devdigest/shared': path.resolve(__dirname, '../server/src/vendor/shared'),
      // The server's diff-parser re-exports from the engine; run.test.ts reaches
      // it through the server mocks.
      '@devdigest/reviewer-core': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
  },
});
