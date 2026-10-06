import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: process.env.NX_CACHE_DIRECTORY
    ? `${process.env.NX_CACHE_DIRECTORY}/vitest/goal`
    : '../../node_modules/.vite/packages/goal',
  test: {
    name: '@araketski/pi-goal',
    watch: false,
    environment: 'node',
    include: ['tests/**/*.spec.ts'],
  },
}));
