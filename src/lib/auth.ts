import { supabase } from '@/lib/supabase';
import { t } from '@/lib/i18n';
import type { Session } from '@supabase/supabase-js';

// Mirrors `minimum_password_length` in `supabase/config.toml`, which is what
// rejects a weak password on the backend. `src/lib/__tests__/auth.test.ts` pins
// the two numbers against each other, so the hint on the form and the guard in
// Auth cannot drift apart unnoticed. Raising one means raising the other.
export const MIN_PASSWORD_LENGTH = 6;

export type AuthMode = 'sign-in' | 'sign-up';

// `needsConfirmation` is the outcome the form has to say out loud: with
// `auth.email.enable_confirmations` off (the local stack) a session comes back
// with the signup and the app is usable at once; with it on, no session comes
// back and the mail is the next step.
export type AuthResult = { ok: true; needsConfirmation: boolean } | { ok: false; message: string };

// Wide enough for `AuthApiError` and for a transport failure, which carries
// neither a code nor a status.
type AuthErrorLike = { message?: string; code?: string };

// Supabase answers a failed sign-in in English and the app speaks three
// languages, so the copy comes from the error's own code and message pattern,
// never from the text the backend returned. Order matters: the codes are
// checked first, because a message match would read any message naming a
// password as the weak-password case.
const describeError = (error: AuthErrorLike, mode: AuthMode): string => {
  const message = error.message ?? '';
  const code = error.code ?? '';
  if (code === 'user_already_exists' || /already/i.test(message)) return t('error_email_taken');
  if (code === 'invalid_credentials' || /invalid credentials|invalid login/i.test(message)) return t('error_credentials');
  if (code === 'invalid_email' || /invalid email/i.test(message)) return t('error_email_invalid');
  if (code === 'weak_password' || /password should be at least/i.test(message)) return t('error_password_short');
  return mode === 'sign-up' ? t('error_sign_up') : t('error_sign_in');
};

export const looksLikeEmail = (value: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

export async function signUp(email: string, password: string): Promise<AuthResult> {
  const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
  if (error) return { ok: false, message: describeError(error, 'sign-up') };
  return { ok: true, needsConfirmation: data.session === null };
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) return { ok: false, message: describeError(error, 'sign-in') };
  return { ok: true, needsConfirmation: false };
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

export async function getSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export function onAuthStateChange(listener: (session: Session | null) => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => listener(session));
  return () => data.subscription.unsubscribe();
}

// Rows written before `20261102150000_add_user_ownership.sql` have no owner; the
// SELECT policy still shows them, and this RPC moves them to the signed-in user.
// It returns how many rows moved, so a caller that refetches on a non-zero answer
// refetches once instead of on every token refresh.
export async function claimLegacyRows(): Promise<number> {
  const { data, error } = await supabase.rpc('claim_legacy_rows');
  if (error) {
    console.error('Erro ao reivindicar dados antigos:', error);
    return 0;
  }
  return (data as number) ?? 0;
}
