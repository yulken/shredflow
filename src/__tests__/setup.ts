import { vi } from 'vitest';

// `src/lib/supabase.ts` builds the client at module scope from `import.meta.env.VITE_SUPABASE_URL` /
// `VITE_SUPABASE_ANON_KEY`, and `src/lib/auth.ts` imports that module - so importing Auth constructs a
// `SupabaseClient` before any test body runs, and supabase-js refuses an absent URL (`supabaseUrl is
// required`) and an empty key (`supabaseKey is required`). CI checks out a tree with no `.env` - it is
// gitignored - so the suite died at import there while passing on a laptop that has one. Nothing in the
// suite talks to Supabase: `auth.test.ts` asserts the shape of the surface and greps the source, never a
// response. So the client is replaced rather than given values.
//
// A mock in a setup file applies to every test file. A test that wants the real client has to
// `vi.unmock('@supabase/supabase-js')` or install its own mock.
//
// The stub covers exactly what `src/lib/auth.ts` reaches - signUp, signInWithPassword, signOut,
// getSession, onAuthStateChange, rpc - plus a chainable `from()`, because five components import the
// module at runtime and a future component test would otherwise land on a half-built client. Take note:
// it answers empty, so it is a stand-in for "no network", not a fake database.
const fakeQuery = {
  select: () => fakeQuery,
  insert: () => fakeQuery,
  update: () => fakeQuery,
  delete: () => fakeQuery,
  eq: () => fakeQuery,
  order: () => fakeQuery,
  range: () => fakeQuery,
  single: () => fakeQuery,
  maybeSingle: () => fakeQuery,
  // Awaitable, so the components' `await supabase.from(...).select(...)` resolves instead of throwing.
  then: (resolve: (value: { data: never[]; error: null }) => void) => resolve({ data: [], error: null }),
};

const fakeClient = {
  auth: {
    signUp: async () => ({ data: { session: null }, error: null }),
    signInWithPassword: async () => ({ data: { session: null }, error: null }),
    signOut: async () => ({ error: null }),
    getSession: async () => ({ data: { session: null } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
  },
  rpc: async () => ({ data: null, error: null }),
  from: () => fakeQuery,
};

vi.mock('@supabase/supabase-js', () => ({
  // A zero-argument function satisfies supabase-js's three-argument signature, and the cast keeps
  // `tsc --strict` from demanding the real class: only the members above are ever called.
  createClient: () => fakeClient as unknown as import('@supabase/supabase-js').SupabaseClient,
}));
