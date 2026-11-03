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
  test: {
    // `src/lib/supabase.ts` constructs its client at module scope, so importing `@/lib/auth` needs
    // VITE_SUPABASE_URL and a non-empty anon key - values a CI checkout does not have, since `.env` is
    // gitignored. `src/__tests__/setup.ts` swaps the client for a stub: the suite never reaches the
    // network, and reading `import.meta.env` at import time is what the app does, not what a test owes.
    setupFiles: ['src/__tests__/setup.ts'],
  },
});
