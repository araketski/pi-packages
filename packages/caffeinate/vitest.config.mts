import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: process.env.NX_CACHE_DIRECTORY
    ? `${process.env.NX_CACHE_DIRECTORY}/vitest/caffeinate`
    : '../../node_modules/.vite/packages/caffeinate',
  test: {
    name: '@araketski/pi-caffeinate',
    watch: false,
    environment: 'node',
    include: ['tests/**/*.spec.ts'],
  },
}));
