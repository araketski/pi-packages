import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/packages/session-name',
  test: {
    name: '@araketski/pi-session-name',
    watch: false,
    environment: 'node',
    include: ['tests/**/*.spec.ts'],
  },
});
