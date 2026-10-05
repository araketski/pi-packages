import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  test: {
    name: '@araketski/pi-jobs',
    watch: false,
    environment: 'node',
    include: ['tests/**/*.spec.ts'],
  },
});
