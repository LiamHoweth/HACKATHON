import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src'), 'server-only': path.resolve(__dirname, 'src/tests/support/server-only.ts') } },
  test: { environment: 'node', include: ['src/tests/**/*.test.ts'] },
});
