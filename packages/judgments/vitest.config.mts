import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/packages/judgments',
  test: {
    name: '@araketski/pi-judgments',
    watch: false,
    environment: 'node',
    include: ['tests/**/*.spec.ts'],
  },
});
