import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  test: {
    name: '@araketski/pi-herdr',
    watch: false,
    environment: 'node',
    include: ['tests/**/*.spec.ts'],
  },
});
