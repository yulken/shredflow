import { LogOut, Moon, Sliders, Sun } from 'lucide-react';
import { LANGUAGE_NAMES, t } from '@/lib/i18n';

// The account's own screen: what the header used to carry as two icon buttons is
// here as a form, and the sign-out moved with it, so the header keeps only
// navigation. Values, not cycles - a segmented button shows the choice as
// pressed, which a toggle-button cannot say. Theme and language persist in the
// browser (`useTheme`, `useLanguage`), so these choices survive signing out and
// the card behind the gate offers the same two choices to a visitor with no
// session yet.
type Props = {
  theme: 'light' | 'dark';
  setTheme: (mode: 'light' | 'dark') => void;
  lang: string;
  setLanguage: (code: string) => void;
  email: string;
  signOut: () => void;
};

export function SettingsView({ theme, setTheme, lang, setLanguage, email, signOut }: Props) {
  const segmented = (active: boolean) =>
    `flex items-center justify-center gap-1.5 px-3 py-2.5 sm:py-3 rounded-xl text-sm font-semibold transition-colors active:scale-95 ${
      active
        ? 'bg-brand-600 hover:bg-brand-700 text-white shadow-md'
        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
    }`;

  return (
    <div className="max-w-md mx-auto animate-fade-in">
      <div className="card p-4 sm:p-6">
        <div className="flex items-center gap-2.5 mb-5">
          <div className="inline-flex items-center justify-center h-11 w-11 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-md">
            <Sliders className="h-5 w-5" />
          </div>
          <h1 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white tracking-tight">
            {t('settings_title')}
          </h1>
        </div>

        <div role="group" aria-label={t('settings_theme_label')} className="grid grid-cols-2 gap-2 mb-5">
          {(['light', 'dark'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setTheme(mode)}
              aria-pressed={theme === mode}
              className={segmented(theme === mode)}
            >
              {mode === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              {mode === 'dark' ? t('theme_option_dark') : t('theme_option_light')}
            </button>
          ))}
        </div>

        <div role="group" aria-label={t('settings_language_label')} className="grid grid-cols-3 gap-2 mb-5">
          {(['en', 'pt', 'es'] as const).map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => setLanguage(code)}
              aria-pressed={lang === code}
              className={segmented(lang === code)}
            >
              {LANGUAGE_NAMES[code] ?? code}
            </button>
          ))}
        </div>

        {/* The account itself, and the way out of it: sign-out lives here now,
            where the account is named, instead of beside the navigation. */}
        <div className="border-t border-gray-200 dark:border-gray-700 pt-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">
              {t('settings_signed_in_as')}
            </p>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 break-all">{email}</p>
          </div>
          <button
            type="button"
            onClick={signOut}
            aria-label={t('aria_sign_out')}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors active:scale-95"
          >
            <LogOut className="h-4 w-4" />
            <span>{t('auth_sign_out')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
