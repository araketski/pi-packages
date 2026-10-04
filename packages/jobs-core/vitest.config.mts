import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: process.env.VITE_CACHE_DIR ?? '../../node_modules/.vite/packages/jobs-core',
  test: {
    name: '@araketski/pi-jobs-core',
    watch: false,
    globals: false,
    environment: 'node',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
  },
}));
