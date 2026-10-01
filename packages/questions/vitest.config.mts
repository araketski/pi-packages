import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/packages/questions',
  test: {
    name: '@araketski/pi-questions',
    watch: false,
    environment: 'node',
    include: ['tests/**/*.spec.ts'],
  },
});
