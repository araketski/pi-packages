import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/packages/fast-mode',
  test: {
    name: '@araketski/pi-fast-mode',
    watch: false,
    environment: 'node',
    include: ['tests/**/*.spec.ts'],
  },
}));
