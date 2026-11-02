import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { EN } from '@/lib/locales/en';
import { ES } from '@/lib/locales/es';
import { PT } from '@/lib/locales/pt';
import type { Locale } from '@/lib/i18n';

// Scope: the account screen, read off the source the way the other component
// claims do - this suite has no DOM, so "Settings is a view" is a claim about
// which branch App.tsx renders and what the card names, not about a screen
// being painted.

const app = readFileSync(fileURLToPath(new URL('../../App.tsx', import.meta.url)), 'utf8');
const settings = readFileSync(fileURLToPath(new URL('../SettingsView.tsx', import.meta.url)), 'utf8');
const authView = readFileSync(fileURLToPath(new URL('../AuthView.tsx', import.meta.url)), 'utf8');
const DICTIONARIES: Record<string, Locale> = { en: EN, pt: PT, es: ES };

describe('Settings is a view, and the header is not a control bar', () => {
  test('the nav reaches it and the gate renders it', () => {
    expect(app).toContain("listView === 'settings'");
    expect(app).toContain('<SettingsView');
    expect(app).toContain('onClick={goSettings}');
    expect(app).toContain("t('nav_settings')");
  });

  test('the moved controls left the header, and the auth card took the pair', () => {
    // Sign-out names the account, so it lives beside the email; theme and
    // language live in the form. A signed-out visitor gets the compact pair on
    // the card instead, because Settings sits behind the gate.
    expect(app).not.toContain('<ThemeToggle');
    expect(app).not.toContain('<LanguageToggle');
    expect(app).not.toContain('onClick={signOut}');
    expect(authView).toContain('<ThemeToggle theme={theme}');
    expect(authView).toContain('<LanguageToggle lang={lang}');
    expect(settings).toContain('onClick={signOut}');
  });
});

describe('the form names values, not cycles', () => {
  test('each group presses the chosen value', () => {
    expect(settings).toContain('aria-pressed={theme === mode}');
    expect(settings).toContain('onClick={() => setTheme(mode)}');
    expect(settings).toContain('aria-pressed={lang === code}');
    expect(settings).toContain('onClick={() => setLanguage(code)}');
    expect(settings).toContain("role=\"group\" aria-label={t('settings_theme_label')}");
    expect(settings).toContain("role=\"group\" aria-label={t('settings_language_label')}");
    // Three languages side by side, named in their own language - not a cycle
    // that hides the other two until you press again.
    expect(settings).toContain('grid grid-cols-3 gap-2');
    expect(settings).toContain('LANGUAGE_NAMES[code] ?? code');
  });

  test('the account block names the account and holds the way out', () => {
    expect(settings).toContain("t('settings_signed_in_as')");
    expect(settings).toContain('{email}');
    expect(settings).toContain("aria-label={t('aria_sign_out')}");
    expect(settings).toContain("t('auth_sign_out')");
  });

  test('its controls are finger-sized and the card fits a phone', () => {
    expect(settings).toContain('px-3 py-2.5 sm:py-3');
    expect(settings).toContain('px-4 py-2.5');
    expect(settings).toContain('max-w-md mx-auto');
    expect(settings).toContain('card p-4 sm:p-6');
    expect(settings).toContain('active:scale-95');
    expect(settings).not.toMatch(/opacity-0 group-hover:opacity-100/);
  });

  test('every dictionary key the two screens name exists in all three languages', () => {
    const keys = [...(settings + app).matchAll(/t\('([a-z_]+)'\)/g)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of [
      'nav_settings',
      'settings_title',
      'settings_theme_label',
      'settings_language_label',
      'settings_signed_in_as',
      'theme_option_light',
      'theme_option_dark',
      'auth_sign_out',
      'aria_sign_out',
    ]) {
      expect(keys).toContain(key);
    }
    for (const code of ['en', 'pt', 'es']) {
      const missing = keys.filter((k) => !(k in DICTIONARIES[code].strings));
      expect(missing).toStrictEqual([]);
    }
  });
});
