import { defineConfig } from 'vite';

// Served at https://mutaafaziz.com/outatime/ — the base path is an invariant (AGENTS.md §3.2).
export default defineConfig({
  base: '/outatime/',
  build: {
    outDir: 'dist/outatime',
    emptyOutDir: true,
  },
  test: {
    include: ['tests/unit/**/*.test.js'],
    environment: 'node',
  },
});
