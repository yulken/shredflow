import { Suspense, useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { BarChart3, Guitar, ListMusic, Music2, Settings } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/hooks/useLanguage';
import { useAuth } from '@/hooks/useAuth';
import { AuthView } from '@/components/AuthView';
import { LoadingCards } from '@/components/LoadingCards';
import type { AppContext } from '@/layouts/appContext';
import { t } from '@/lib/i18n';

// The frame every screen is drawn inside: header, footer, the auth gate, and the
// route's own content in the `<main>` slot. `App.tsx` used to hold the same frame plus
// a `listView` string and two `selected*` objects that stood in for the address; the
// address is the state now, so what is left here is the frame and the gate.
//
// The gate is unchanged in kind: with no session there is nothing to fetch and the RLS
// policies of `20261102150000_add_user_ownership.sql` refuse an anonymous read anyway,
// so the sign-in card is what answers, not an empty chart. It moved in place - from a
// branch around a state-selected view to a branch around the `<Outlet>` - and that is
// what makes the address survive signing in. `/songs/<id>` while signed out shows the
// card and keeps the URL, so the reader lands on the song they asked for once the card
// is answered. `ready` still holds every view back: supabase-js restores the stored
// session asynchronously, and a route that fetched before that landed would ask for
// rows the caller does not own.
//
// Theme, language and the session are read once, here, and handed to the routes as
// outlet context: one holder, read downward, because each of those hooks owns a copy of
// the browser state it reads (`appContext.ts` keeps the type and the reading hook, so
// this file exports one component and the dev server can fast-refresh the header).

export function AppLayout() {
  const { theme, setTheme, toggleTheme } = useTheme();
  const { lang, setLanguage, toggleLanguage } = useLanguage();
  const { session, ready, signOut } = useAuth();

  // A new screen starts at the top. The state-based views of `App.tsx` could not scroll
  // anywhere but the top of a freshly mounted view; a URL change leaves the window where
  // the reader was, so opening a song from the twentieth row of a long list arrived in
  // the middle of the new screen. The pathname, not the full location: the lists change
  // their own query-less address never, and a scroll on every location object would
  // fight the browser's own restoration.
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  // The same classes the state comparison used to switch. `end` is the difference
  // between the two pairs of tabs: `/` and `/settings` have no children, so they match
  // their own path only, while `/exercises` and `/songs` deliberately do not pass it -
  // `/songs/<id>` keeps the Songs tab lit, which is the "row on screen wins over the
  // tab it came from" rule `App.tsx` rebuilt by hand in four places. `NavLink` also
  // writes `aria-current="page"`, which the buttons did not.
  const tab = (active: boolean) =>
    `flex items-center gap-1.5 px-2 sm:px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
      active
        ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400'
        : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
    }`;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors duration-300">
      {/* Top bar */}
      <header className="sticky top-0 z-40 glass">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between">
          <NavLink to="/" className="flex items-center gap-2.5 group">
            <div className="inline-flex items-center justify-center h-9 w-9 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-md shadow-brand-600/20 group-hover:scale-105 transition-transform">
              <Guitar className="h-5 w-5" />
            </div>
            <span className="text-base sm:text-lg font-bold text-gray-900 dark:text-white tracking-tight">
              {t('app_brand')}
            </span>
          </NavLink>
          <div className="flex items-center gap-2">
            {session && (
              <nav className="flex items-center gap-1 mr-1 sm:mr-2">
                <NavLink to="/" end className={({ isActive }) => tab(isActive)}>
                  <BarChart3 className="h-4 w-4" />
                  <span className="hidden sm:inline">{t('nav_dashboard')}</span>
                </NavLink>
                <NavLink to="/exercises" className={({ isActive }) => tab(isActive)}>
                  <Music2 className="h-4 w-4" />
                  <span className="hidden sm:inline">{t('nav_exercises')}</span>
                </NavLink>
                <NavLink to="/songs" className={({ isActive }) => tab(isActive)}>
                  <ListMusic className="h-4 w-4" />
                  <span className="hidden sm:inline">{t('nav_songs')}</span>
                </NavLink>
                <NavLink to="/settings" end className={({ isActive }) => tab(isActive)}>
                  <Settings className="h-4 w-4" />
                  <span className="hidden sm:inline">{t('nav_settings')}</span>
                </NavLink>
              </nav>
            )}
          </div>
        </div>
      </header>

      {/* Main content: the route's screen, or what answers before there is one */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {!ready ? (
          <LoadingCards />
        ) : !session ? (
          <AuthView theme={theme} toggleTheme={toggleTheme} lang={lang} toggleLanguage={toggleLanguage} />
        ) : (
          <Suspense fallback={<LoadingCards />}>
            <Outlet
              context={{
                theme,
                setTheme,
                lang,
                setLanguage,
                email: session.user.email ?? '',
                signOut,
              } satisfies AppContext}
            />
          </Suspense>
        )}
      </main>

      {/* Footer */}
      <footer className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <p className="text-center text-xs text-gray-400 dark:text-gray-600">
          {t('footer_tagline')}
        </p>
      </footer>
    </div>
  );
}
