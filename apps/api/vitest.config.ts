import { defineConfig } from 'vitest/config';

/**
 * Vitest config for API smoke tests only.
 *
 * Tests live in ./smoke-tests/ — delete that entire folder anytime.
 * passWithNoTests keeps `npm test` green after deletion.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    passWithNoTests: true,
    include: ['src/**/*.test.ts', 'smoke-tests/**/*.{test,spec}.ts'],
  },
});
