import { SettingsView } from '@/components/SettingsView';
import { useApp } from '@/layouts/appContext';

// The account screen at `/settings`, reached from the header only while there is a
// session - the same rule that kept the nav off a signed-out visitor, now expressed by
// the gate holding the `<Outlet>` back rather than by which buttons are drawn.
//
// The values are read from the frame rather than from the hooks this screen would
// otherwise call itself. `useTheme` and `useLanguage` each keep their own `useState` and
// write the browser storage on change, and `useAuth` subscribes to Supabase and runs the
// legacy claim once per call site: a second holder would be a second copy of the same
// three values, and the copy would be the one the settings form writes while the header
// and the sign-in card went on showing the first.
//
// Signing out leaves this address in place, as before: the gate answers with the sign-in
// card, and the address the reader was on is there to come back to.
export default function SettingsRoute() {
  const { theme, setTheme, lang, setLanguage, email, signOut } = useApp();
  return (
    <SettingsView
      theme={theme}
      setTheme={setTheme}
      lang={lang}
      setLanguage={setLanguage}
      email={email}
      signOut={signOut}
    />
  );
}
