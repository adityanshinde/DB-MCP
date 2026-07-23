import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, '.')
    }
  },
  test: {
    environment: 'node',
    setupFiles: ['tests/setup/dbMocks.ts'],
    include: ['tests/unit/**/*.test.ts'],
    exclude: ['node_modules', '.next', 'dist', 'tests/integration/**'],
    coverage: {
      provider: 'v8',
      include: ['lib/tools/db/**/*.ts'],
      exclude: ['lib/tools/db/index.ts'],
      thresholds: {
        lines: 80,
        functions: 75,
        statements: 80,
        branches: 55
      }
    }
  }
});
