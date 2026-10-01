import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/packages/session-activity',
  test: {
    name: '@araketski/pi-session-activity',
    watch: false,
    environment: 'node',
    include: ['tests/**/*.spec.ts'],
  },
});
