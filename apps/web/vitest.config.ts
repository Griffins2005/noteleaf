/**
 * @file vitest.config.ts
 * @description Vitest configuration for the web app.
 *
 * Environment strategy:
 *   - noteClassifier and other pure utility tests use 'node' environment.
 *     No DOM APIs needed — faster and no jsdom peer dep required.
 *   - Future component tests can override per-file with
 *     `// @vitest-environment jsdom` at the top of the test file,
 *     after adding jsdom to devDependencies.
 */

import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@noteleaf/shared-types': resolve(__dirname, '../../packages/shared-types/src/index.ts'),
    },
  },
});
