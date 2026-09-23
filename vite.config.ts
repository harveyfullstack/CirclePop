import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative base so the same build works on any static host, GitHub Pages sub-paths and inside Capacitor.
  base: './',
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 800,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
