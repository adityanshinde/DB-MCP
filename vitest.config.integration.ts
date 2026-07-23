import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

// Vitest does not load .env automatically the way Next.js does.
const envFile = resolve(__dirname, '.env');
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, '.')
    }
  },
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    exclude: ['node_modules', '.next', 'dist']
  }
});
