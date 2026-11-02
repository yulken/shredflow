import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Scope: the wiring of the gate, read off the source the way the other component
// claims do - this suite has no DOM, so "the app is behind the gate" is a claim
// about which branch App.tsx renders, not about a screen being painted.

const app = readFileSync(fileURLToPath(new URL('../../App.tsx', import.meta.url)), 'utf8');
const authView = readFileSync(fileURLToPath(new URL('../AuthView.tsx', import.meta.url)), 'utf8');

describe('the gate sits in front of the three views', () => {
  test('nothing renders until the session is resolved, and no session means the card', () => {
    // A fetch before the stored session lands would ask for rows the caller does
    // not own; `ready` is what holds the views back.
    expect(app).toContain('{!ready ?');
    expect(app).toContain(': !session ?');
    expect(app).toContain('<AuthView />');
    expect(app).toContain('const { session, ready, signOut } = useAuth();');
  });

  test('the nav and sign-out are inside the session, the toggles are not', () => {
    // Navigating and ending a session are meaningless signed out; theme and
    // language persist, so the sign-in screen still speaks the visitor's choice.
    expect(app).toMatch(/\{session && \(\s*<nav/);
    expect(app.indexOf('<ThemeToggle')).toBeGreaterThan(app.indexOf('{session &&'));
    const navEnd = app.indexOf('</nav>');
    expect(app.indexOf('<ThemeToggle')).toBeGreaterThan(navEnd);
    expect(app.indexOf('<LanguageToggle')).toBeGreaterThan(navEnd);
  });

  test('signing out is reachable by name', () => {
    expect(app).toContain('onClick={signOut}');
    expect(app).toContain("aria-label={t('aria_sign_out')}");
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
