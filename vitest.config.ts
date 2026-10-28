import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

// vitest reads vitest.config.ts instead of vite.config.ts, so the `@` -> ./src
// alias from vite.config.ts has to be re-declared here or `@/...` imports in
// test files do not resolve.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
