import { useState } from 'react';
import { Guitar, LogIn, UserPlus } from 'lucide-react';
import { MIN_PASSWORD_LENGTH, looksLikeEmail, signIn, signUp, type AuthMode } from '@/lib/auth';
import { t } from '@/lib/i18n';

// The gate the app sits behind: one card, two modes. The mode switch is the same
// segmented pair the exercise form uses for chart visibility, so a local reader
// finds a control they already know. Both modes share one form because the two
// calls take the same two fields; only the button's word and the error copy move.
//
// The copy is picked from `src/lib/auth.ts`, which maps Supabase's English
// errors onto dictionary keys, so nothing here quotes the backend's message.
export function AuthView() {
  const [mode, setMode] = useState<AuthMode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setError('');
    setNotice('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Checked here rather than left to Auth so a typo answers before a request
    // round-trip; Auth still refuses the same two things.
    if (!looksLikeEmail(email)) {
      setError(t('error_email_invalid'));
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(t('error_password_short'));
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');

    const result = mode === 'sign-up' ? await signUp(email, password) : await signIn(email, password);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    // With email confirmations off the session lands here and the app is already
    // open; with them on no session comes back, so the mail is the next step.
    if (result.needsConfirmation) setNotice(t('signup_check_email'));
  };

  return (
    <div className="max-w-md mx-auto animate-fade-in">
      <div className="card p-4 sm:p-6">
        <div className="flex items-center gap-2.5 mb-2">
          <div className="inline-flex items-center justify-center h-11 w-11 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-md">
            <Guitar className="h-5 w-5" />
          </div>
          <h1 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white tracking-tight">
            {mode === 'sign-up' ? t('auth_title_sign_up') : t('auth_title_sign_in')}
          </h1>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
          {t('auth_subtitle')}
        </p>

        <div role="group" aria-label={t('auth_mode_label')} className="grid grid-cols-2 gap-2 mb-5">
          {(['sign-in', 'sign-up'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => switchMode(value)}
              className={`flex items-center justify-center gap-1.5 px-3 py-2.5 sm:py-3 rounded-xl text-sm font-semibold transition-colors active:scale-95 ${
                mode === value
                  ? 'bg-brand-600 hover:bg-brand-700 text-white shadow-md'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {value === 'sign-up' ? <UserPlus className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
              {value === 'sign-up' ? t('auth_mode_sign_up') : t('auth_mode_sign_in')}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="auth-email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              {t('field_email')}
            </label>
            <input
              id="auth-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('placeholder_email')}
              autoComplete="email"
              autoFocus
              className="w-full min-w-0 px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
            />
          </div>

          <div>
            <label htmlFor="auth-password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              {t('field_password')}
            </label>
            <input
              id="auth-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('placeholder_password')}
              autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
              minLength={MIN_PASSWORD_LENGTH}
              className="w-full min-w-0 px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
            />
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">{t('password_hint')}</p>
          </div>

          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}
          {notice && (
            <p className="text-sm text-accent-600 dark:text-accent-400">{notice}</p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full px-5 py-3 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-medium shadow-lg shadow-brand-600/20 transition-all disabled:opacity-50"
          >
            {busy ? t('auth_working') : mode === 'sign-up' ? t('sign_up_button') : t('sign_in_button')}
          </button>
        </form>
      </div>
    </div>
  );
}
