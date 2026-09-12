import { defineConfig } from 'vitest/config';

// Root config only aggregates the per-package projects so `pnpm test` runs everything.
export default defineConfig({
  test: {
    projects: ['packages/*/vitest.config.ts'],
  },
});
