import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/packages/statusline',
  test: {
    name: '@araketski/pi-statusline',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['tests/**/*.{test,spec}.{ts,mts}'],
    reporters: ['default'],
  },
}));
