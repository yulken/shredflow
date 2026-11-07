import { useOutletContext } from 'react-router-dom';

// What the frame hands every route: the three values that live in the browser rather
// than in a screen - theme, language and the signed-in account's own details. They are
// read once, in `AppLayout`, because each hook owns a copy of them: `useTheme` keeps its
// own `useState` and writes `localStorage`, and `useAuth` subscribes to Supabase and
// runs the legacy claim once per call site. A second holder would be a second copy,
// disagreeing with the first after any change.
//
// A module of its own rather than a second export of the layout: a file that exports a
// hook next to its component gives the dev server no fast-refresh path for the
// component, and the whole header would remount to change one label.
export type AppContext = {
  theme: 'light' | 'dark';
  setTheme: (mode: 'light' | 'dark') => void;
  lang: string;
  setLanguage: (code: string) => void;
  email: string;
  signOut: () => Promise<void>;
};

// The one way a route reads the frame's state, so the type is written once.
export function useApp(): AppContext {
  return useOutletContext<AppContext>();
}
