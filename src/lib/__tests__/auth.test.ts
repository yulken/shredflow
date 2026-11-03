import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { looksLikeEmail, signIn, signUp, signOut } from '@/lib/auth';
import { EN } from '@/lib/locales/en';
import { ES } from '@/lib/locales/es';
import { PT } from '@/lib/locales/pt';
import type { Locale } from '@/lib/i18n';

// Scope: the shape of the Auth surface - what the form refuses before a request,
// which dictionary entries an error maps to, and which fields the client sends.
// No network here, so nothing asserts a Supabase response. The error mapping is
// asserted as key selection (which entry is picked, never its wording, so a
// rewrite of the dictionaries stays green), the same rule `tension.test.ts`
// follows for PT/ES. `looksLikeEmail` is asserted as values because it is a shape
// rule about the input, not copy.

const authSource = readFileSync(fileURLToPath(new URL('../auth.ts', import.meta.url)), 'utf8');
const DICTIONARIES: Record<string, Locale> = { en: EN, pt: PT, es: ES };

describe('looksLikeEmail', () => {
  test('one address shape passes, and the shapes that cannot be an address fail', () => {
    expect(looksLikeEmail('me@shredflow.app')).toBe(true);
    // Trimmed: a pasted address with spaces is the same address.
    expect(looksLikeEmail('  me@shredflow.app ')).toBe(true);
    expect(looksLikeEmail('me@shredflow')).toBe(false);
    expect(looksLikeEmail('me_shredflow.app')).toBe(false);
    expect(looksLikeEmail('me @shredflow.app')).toBe(false);
    expect(looksLikeEmail('@shredflow.app')).toBe(false);
    expect(looksLikeEmail('')).toBe(false);
  });
});

describe('the surface the form uses', () => {
  test('sign up, sign in and sign out are there, and take email + password', () => {
    expect(typeof signUp).toBe('function');
    expect(typeof signIn).toBe('function');
    expect(typeof signOut).toBe('function');
    expect(authSource).toContain('supabase.auth.signUp({ email: email.trim(), password })');
    expect(authSource).toContain('supabase.auth.signInWithPassword({ email: email.trim(), password })');
    expect(authSource).toContain('supabase.auth.signOut()');
    // One trim, in the lib rather than in each caller: the form keeps what the
    // visitor typed, Auth sends the address.
    expect(authSource.match(/email\.trim\(\)/g)).toHaveLength(2);
  });

  test('the signup result says whether a session came back', () => {
    // `needsConfirmation` is the difference between an app that opens and a mail
    // that has to be clicked, so it is read off the response, not guessed.
    expect(authSource).toContain('needsConfirmation: data.session === null');
  });

  test('a response with no session in it comes back as needing confirmation', async () => {
    // The client behind these calls is the stub in `src/__tests__/setup.ts`, so this asserts what Auth
    // makes of a response, not what Supabase sends: an empty response means the mail is the next step
    // after a signup, and a sign-in that succeeded never claims it does. Without this the stub could
    // answer any shape at all and the suite would stay green while Auth read a field that stopped
    // existing.
    await expect(signUp('me@shredflow.app', 'abcdef')).resolves.toEqual({ ok: true, needsConfirmation: true });
    await expect(signIn('me@shredflow.app', 'abcdef')).resolves.toEqual({ ok: true, needsConfirmation: false });
  });
});

describe('the error mapping answers from the dictionaries', () => {
  const keys = [...authSource.matchAll(/t\('([a-z_]+)'\)/g)].map((m) => m[1]);

  test('every key Auth names exists in all three dictionaries', () => {
    expect(keys.length).toBeGreaterThan(0);
    for (const code of ['en', 'pt', 'es']) {
      const missing = keys.filter((k) => !(k in DICTIONARIES[code].strings));
      expect(missing).toStrictEqual([]);
    }
  });

  test('the six failure keys the form can show are all named', () => {
    for (const key of [
      'error_email_invalid',
      'error_password_short',
      'error_credentials',
      'error_email_taken',
      'error_sign_in',
      'error_sign_up',
    ]) {
      expect(keys).toContain(key);
    }
  });

  test('the backend message is never shown as-is', () => {
    // Supabase answers in English; the copy is chosen from the code and the
    // pattern, so the text it returned stays out of the tree.
    expect(authSource).not.toMatch(/message: error\.message/);
    expect(authSource).toContain("if (code === 'user_already_exists'");
    expect(authSource).toContain("if (code === 'invalid_credentials'");
    expect(authSource).toContain("if (code === 'invalid_email'");
    expect(authSource).toContain("if (code === 'weak_password'");
    // The codes are read before the message: a message match first would turn any
    // message naming a password into the weak-password line.
    expect(authSource.indexOf("code === 'user_already_exists'")).toBeLessThan(authSource.indexOf('/already/i'));
  });
});
