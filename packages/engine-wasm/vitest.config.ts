import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'engine-wasm',
    // Strippers are pure byte manipulation and run under Node; ffmpeg/canvas paths are covered by e2e.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
