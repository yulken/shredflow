import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { claimLegacyRows, getSession, onAuthStateChange, signIn, signOut, signUp } from '@/lib/auth';

// The fourth thing the app keeps, and the only one it keeps in Supabase rather
// than in localStorage: supabase-js persists the session itself, so nothing here
// writes it. `ready` is what stops the sign-in screen from flashing before the
// stored session has been read back — supabase-js restores it asynchronously, and
// its first event says "no session" while that read is still in flight.
//
// The legacy claim runs once per signed-in account, before `ready` flips: the app
// views fetch as soon as they mount, so claiming first is what makes inherited
// rows arrive as the caller's own. The claim hands the log to whoever signs in
// first, so a later account finds nothing to move; the flag resets on sign-out,
// not on token refresh, which is why it never re-reads the same rows.
export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let claimed = false;
    let restored = false;

    const settle = async (next: Session | null) => {
      if (cancelled) return;
      // An INITIAL_SESSION null arrives before supabase-js has read the stored
      // session back; answering it would put the sign-in screen on screen for a
      // moment before the restored session lands.
      if (next === null && !restored) return;
      if (next && !claimed) {
        claimed = true;
        await claimLegacyRows();
      }
      if (next === null) claimed = false;
      if (cancelled) return;
      setSession(next);
      setReady(true);
    };

    void getSession().then((stored) => {
      restored = true;
      void settle(stored);
    });
    const unsubscribe = onAuthStateChange((next) => void settle(next));

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return { session, ready, signIn, signUp, signOut };
}
