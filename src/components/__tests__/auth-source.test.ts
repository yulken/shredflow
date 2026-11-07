import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Scope: the wiring of the gate, read off the source the way the other component
// claims do - this suite has no DOM, so "the app is behind the gate" is a claim
// about which branch the frame renders, not about a screen being painted.

const frame = readFileSync(fileURLToPath(new URL('../../layouts/AppLayout.tsx', import.meta.url)), 'utf8');
const authView = readFileSync(fileURLToPath(new URL('../AuthView.tsx', import.meta.url)), 'utf8');

describe('the gate sits in front of every route', () => {
  test('nothing renders until the session is resolved, and no session means the card', () => {
    // A fetch before the stored session lands would ask for rows the caller does
    // not own; `ready` is what holds the views back.
    expect(frame).toContain('{!ready ?');
    expect(frame).toContain(': !session ?');
    expect(frame).toContain('<AuthView theme=');
    expect(frame).toContain('const { session, ready, signOut } = useAuth();');
    // The gate answers in place of the route's own content, so no address can be
    // mounted under a session that has not arrived: the branch is around the slot,
    // in the order the frame writes it - skeleton, card, then the slot.
    expect(frame).toMatch(
      /!ready \?\s*\(\s*<LoadingCards \/>\s*\)\s*: !session \?\s*\(\s*<AuthView[\s\S]*?\/>\s*\)\s*:\s*\(\s*<Suspense[\s\S]*?<Outlet/,
    );
  });

  test('the header keeps only navigation; preferences and sign-out moved off it', () => {
    // Settings names the account and carries the controls next to it; the nav is
    // still inside the session because a signed-out visitor cannot reach it. The
    // auth card holds the two preference controls for a visitor with no session.
    expect(frame).toMatch(/\{session && \(\s*<nav/);
    expect(frame).toContain('to="/settings"');
    expect(frame).toContain("t('nav_settings')");
    expect(frame).not.toContain('<ThemeToggle');
    expect(frame).not.toContain('<LanguageToggle');
    expect(frame).not.toContain('onClick={signOut}');
    expect(authView).toContain('<ThemeToggle theme={theme}');
    expect(authView).toContain('<LanguageToggle lang={lang}');
  });
});

describe('the card sends two fields and says what failed', () => {
  test('both modes share one form', () => {
    expect(authView).toContain('onSubmit={handleSubmit}');
    expect(authView).toContain('mode === \'sign-up\' ? await signUp(email, password) : await signIn(email, password)');
    expect(authView).toContain("role=\"group\" aria-label={t('auth_mode_label')}");
  });

  test('the two fields are labeled and the password is not painted as text', () => {
    expect(authView).toContain('htmlFor="auth-email"');
    expect(authView).toContain('id="auth-email"');
    expect(authView).toContain('htmlFor="auth-password"');
    expect(authView).toContain('id="auth-password"');
    expect(authView).toContain('type="email"');
    expect(authView).toContain('type="password"');
    expect(authView).toContain('minLength={MIN_PASSWORD_LENGTH}');
    // The hint is the same constant the backend enforces, not a second number.
    expect(authView).toContain('password.length < MIN_PASSWORD_LENGTH');
  });

  test('the submit cannot be pressed twice, and the failure stays on the card', () => {
    expect(authView).toContain('disabled={busy}');
    expect(authView).toContain('{error &&');
    expect(authView).toContain('setError(result.message)');
    // The signup-with-mail case says out loud that the mail is the next step.
    expect(authView).toContain("setNotice(t('signup_check_email'))");
  });

  test('autocomplete follows the mode', () => {
    // A signup must not offer the stored password of another account.
    expect(authView).toContain("autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}");
  });
});
