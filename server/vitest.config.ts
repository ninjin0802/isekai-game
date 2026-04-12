import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/game/**', 'src/lobby/**'],
      exclude: ['src/index.ts', 'src/config/**', 'src/db/**', 'src/auth/**', 'src/socket/**'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
      },
    },
  },
  resolve: {
    alias: {
      '@isekai/shared': path.resolve(__dirname, '../shared/src/index.ts'),
    },
  },
});
