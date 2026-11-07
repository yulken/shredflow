import { describe, expect, test } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { matchPath } from 'react-router-dom';

// Scope: the addresses the app answers and the wiring that points a tab at one of
// them. `App.tsx` used to hold that wiring as a `listView` string plus two `selected*`
// objects, and the claims below are the ones that comparison carried - which screen a
// choice opens, which tab stays lit while a row is open, and where the row's own screen
// gets its row from. They are read off the source the way the other wiring claims are,
// because this suite has no DOM; the one exception is the tab-highlight claim, which
// `matchPath` answers over the paths the router actually declares rather than over a
// copy of them.
const router = readFileSync(fileURLToPath(new URL('../router.tsx', import.meta.url)), 'utf8');
const layout = readFileSync(fileURLToPath(new URL('../layouts/AppLayout.tsx', import.meta.url)), 'utf8');
const routesRoot = fileURLToPath(new URL('../routes/', import.meta.url));
const routeSource = (name: string) => readFileSync(new URL(`../routes/${name}`, import.meta.url), 'utf8');

// The claims that forbid an identifier are about the code, not about the prose beside
// it: a comment explaining why `history.back()` is the wrong target for a back button
// would otherwise answer its own claim.
const codeOnly = (source: string) =>
  source
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');

// One row address per catalog, in the shape the app writes: the catalog's path, a slash,
// and a UUID like the `id` columns of `supabase/migrations/20261026230024_*.sql`.
const ROW_ADDRESSES = {
  exercises: '/exercises/6f1c9c1e-4f0a-4d0b-9b1f-6f0a1c2d3e4f',
  songs: '/songs/6f1c9c1e-4f0a-4d0b-9b1f-6f0a1c2d3e4f',
};

describe('every screen has an address, and every address has a screen', () => {
  // A wrapper file the router never mentions is a screen no address reaches: it builds,
  // it type-checks, and nothing can open it. The check runs from the directory, so a
  // route added without its entry in the table is the failure rather than a screen that
  // is silently unreachable.
  test('each file under src/routes is mounted by the router', () => {
    const files = readdirSync(routesRoot).filter((entry) => entry.endsWith('.tsx'));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      expect(router).toContain(`lazy(() => import('@/routes/${file.replace(/\.tsx$/, '')}'))`);
    }
    // The other direction: an entry naming a file that is not there is a build error,
    // but the message comes from the bundler, not from here.
    for (const name of router.match(/import\('@\/routes\/(\w+)'\)/g) ?? []) {
      const file = name.match(/@\/routes\/(\w+)/)![1];
      expect(existsSync(new URL(`../routes/${file}.tsx`, import.meta.url))).toBe(true);
    }
  });

  // The six addresses the app writes, pinned as the table declares them. A path typed
  // with a different prefix than the link that points at it answers with the catch-all,
  // which lands the reader on the landing screen - the one failure mode that reads as
  // "the tab is broken" rather than as a missing route.
  test('the table declares the landing screen, two catalogs, two row screens and settings', () => {
    expect(router).toContain("{ index: true, Component: lazy(() => import('@/routes/DashboardRoute')) },");
    expect(router).toContain("{ path: 'exercises', Component: lazy(() => import('@/routes/ExerciseListRoute')) },");
    expect(router).toContain("{ path: 'exercises/:exerciseId', Component: lazy(() => import('@/routes/SessionRoute')) },");
    expect(router).toContain("{ path: 'songs', Component: lazy(() => import('@/routes/SongListRoute')) },");
    expect(router).toContain("{ path: 'songs/:songId', Component: lazy(() => import('@/routes/SongRoute')) },");
    expect(router).toContain("{ path: 'settings', Component: lazy(() => import('@/routes/SettingsRoute')) },");
  });

  // A row's address is its catalog's path plus the row's id. The list wrapper builds it
  // from the row it was given, so the two ends of one string live in two files, and this
  // is what notices one of them being edited alone.
  test('a row screen is its catalog path plus the row id', () => {
    expect(routeSource('DashboardRoute.tsx')).toContain('navigate(`/exercises/${exercise.id}`)');
    expect(routeSource('ExerciseListRoute.tsx')).toContain('navigate(`/exercises/${exercise.id}`)');
    expect(routeSource('SongListRoute.tsx')).toContain('navigate(`/songs/${song.id}`)');
    // The address is built from the row's own id column, never from a slug or a title:
    // the id is what the detail read compares against.
    for (const file of ['DashboardRoute', 'ExerciseListRoute', 'SongListRoute']) {
      expect(routeSource(`${file}.tsx`)).not.toMatch(/navigate\(`\/(?:exercises|songs)\/\$\{(?:exercise|song)\.title/);
    }
  });

  // `useParams()` reads by name, so a detail path whose parameter is spelled differently
  // than the screen asks for yields `undefined`, the read answers "no row", and the
  // screen shows the missing card forever with no error anywhere.
  test('the parameter a path declares is the one its screen reads', () => {
    expect(router).toContain(':exerciseId');
    expect(router).toContain(':songId');
    expect(routeSource('SessionRoute.tsx')).toContain('const { exerciseId } = useParams();');
    expect(routeSource('SongRoute.tsx')).toContain('const { songId } = useParams();');
  });

  // The address the reader is on has to survive being the only thing they arrive with.
  // Reading the row by id is what replaced the object the list handed over, so the row
  // screen must not be able to fall back on a row it was passed.
  test('a row screen reads its row by the id the address carries', () => {
    expect(routeSource('SessionRoute.tsx')).toContain('const { exercise, loading } = useExercise(exerciseId);');
    expect(routeSource('SongRoute.tsx')).toContain('const { song, loading } = useSong(songId);');
    for (const [file, hook] of [['SessionRoute', 'useExercise'], ['SongRoute', 'useSong']] as const) {
      expect(routeSource(`${file}.tsx`)).toContain(`import { ${hook} } from '@/hooks/${hook}';`);
      expect(routeSource(`${file}.tsx`)).toContain('if (loading) return <LoadingCards />;');
      expect(routeSource(`${file}.tsx`)).toContain('<MissingRow');
    }
    // The screens themselves still take the row as a prop: the routing stops at the
    // wrapper, which is why `session-source.test.ts` and `song-view-source.test.ts`
    // read them the way they always did.
    expect(routeSource('SessionRoute.tsx')).toContain('<SessionView exercise={exercise}');
    expect(routeSource('SongRoute.tsx')).toContain('<SongView song={song}');
  });
});

describe('the tab that owns a row stays lit while the row is open', () => {
  // `NavLink` marks a link active on a path prefix unless the link says `end`. The two
  // catalogs therefore must not say it - `/songs/<id>` has to keep the Songs tab lit,
  // the rule `App.tsx` rebuilt by hand in four comparisons - and the two addresses that
  // have no children must say it, or the landing tab would read active everywhere.
  const tabLines = layout
    .split('\n')
    .filter((line) => line.includes('<NavLink to=') && line.includes('=> tab(isActive)'));

  test('the header carries exactly the four tabs', () => {
    expect(tabLines).toHaveLength(4);
    expect(tabLines.map((line) => line.match(/to="([^"]+)"/)![1])).toStrictEqual([
      '/',
      '/exercises',
      '/songs',
      '/settings',
    ]);
  });

  test('only the two addresses without children ask for an exact match', () => {
    expect(tabLines.filter((line) => /\send\s/.test(line)).map((line) => line.match(/to="([^"]+)"/)![1])).toStrictEqual([
      '/',
      '/settings',
    ]);
  });

  // The claim over the paths the table really declares, not over a copy of them: the
  // prefix rules above have to answer for the row addresses the app actually writes.
  test('a row address leaves exactly its own catalog tab lit', () => {
    const links = tabLines.map((line) => ({
      to: line.match(/to="([^"]+)"/)![1],
      end: /\send\s/.test(line),
    }));
    for (const [catalog, address] of Object.entries(ROW_ADDRESSES)) {
      const lit = links.filter((link) => matchPath({ path: link.to, end: link.end }, address)).map((link) => link.to);
      expect(lit).toStrictEqual([`/${catalog}`]);
    }
  });

  // The other half of the rule `App.tsx` carried as four handlers that cleared both
  // selections: switching tabs could not leave the previous row on screen. An address
  // holds no row, so the frame's four links have no row address to carry one in from -
  // which is what makes the invariant structural rather than something to remember.
  test('no tab link points at a row', () => {
    for (const line of tabLines) expect(line).not.toMatch(/\/(exercises|songs)\/\$\{/);
    expect(codeOnly(layout)).not.toMatch(/useParams|selectedExercise|selectedSong/);
  });
});

describe('the way out of a row screen is the list it belongs to', () => {
  // A row screen reached by pasted link has no previous history entry, and
  // `history.back()` from there leaves the app. The button's label names the list
  // (`back_to_exercises`, `back_to_songs`), so the target is the list's own path.
  test('each row screen goes back to its catalog by path', () => {
    expect(routeSource('SessionRoute.tsx')).toContain("onBack={() => navigate('/exercises')}");
    expect(routeSource('SongRoute.tsx')).toContain("onBack={() => navigate('/songs')}");
    for (const file of ['SessionRoute', 'SongRoute']) {
      expect(codeOnly(routeSource(`${file}.tsx`))).not.toMatch(/navigate\(-1\)|history\.back|window\.history/);
    }
  });

  // A row that is not there is an answer the read can give - deleted, mistyped, or
  // another account's, which the SELECT policy hides - and the way out is the list, not
  // the address that named nothing.
  test('a row that is not there sends the reader back to the catalog', () => {
    expect(routeSource('SessionRoute.tsx')).toContain('backKey="back_to_exercises" backTo="/exercises"');
    expect(routeSource('SongRoute.tsx')).toContain('backKey="back_to_songs" backTo="/songs"');
    const missing = readFileSync(fileURLToPath(new URL('../components/MissingRow.tsx', import.meta.url)), 'utf8');
    expect(missing).toContain('<Link');
    expect(missing).toContain('to={backTo}');
    expect(missing).toContain('{t(backKey)}');
    // The wording is the dictionaries', for all three languages, because the card is
    // what a signed-in reader sees on an address that names nothing.
    for (const code of ['en', 'pt', 'es']) {
      const dictionary = readFileSync(fileURLToPath(new URL(`../lib/locales/${code}.ts`, import.meta.url)), 'utf8');
      expect(dictionary).toContain('missing_exercise:');
      expect(dictionary).toContain('missing_song:');
    }
  });

  // An address off the six is a mistyped one, and the landing screen is where the reader
  // re-chooses. `replace` matters: a dead address pushed into history would be stepped
  // back onto.
  test('an unknown address goes to the landing screen without staying in history', () => {
    expect(router).toContain('{ path: \'*\', element: <Navigate to="/" replace /> },');
  });
});

describe('the frame is loaded before any screen is', () => {
  // The gate is the frame's own code: it has to hold a screen's fetch back until the
  // session is read, so a lazy frame would mean a window in which a route mounted with
  // no gate above it. The screens may be fetched per address; the frame may not.
  test('the layout is a static import and the screens are not', () => {
    expect(router).toContain("import { AppLayout } from '@/layouts/AppLayout';");
    expect(codeOnly(router)).not.toMatch(/lazy\(\(\) => import\('@\/layouts/);
    expect([...router.matchAll(/lazy\(\(\) => import\('@\/routes\//g)]).toHaveLength(6);
    expect(layout).toContain('<Suspense fallback={<LoadingCards />}>');
    expect(layout).toContain('<Outlet');
  });

  // A new screen starts at the top: a row's address changes the window's content while
  // the scroll stays where the reader was, so opening the twentieth row of a long
  // catalog arrived in the middle of the row's own screen.
  test('a new address starts at the top of the page', () => {
    expect(layout).toContain('const { pathname } = useLocation();');
    expect(layout).toMatch(/useEffect\(\(\) => \{\s*window\.scrollTo\(0, 0\);\s*\}, \[pathname\]\);/);
  });

  // The frame holds the browser-backed state once, because each of those hooks owns a
  // copy of it: `useTheme` keeps its own `useState` and writes `localStorage`, and
  // `useAuth` subscribes to Supabase and runs the legacy claim per instance. A second
  // call site is a second copy, disagreeing after any change.
  test('the browser-backed state is read once and handed down', () => {
    const frameContext = readFileSync(fileURLToPath(new URL('../layouts/appContext.ts', import.meta.url)), 'utf8');
    expect(layout).toContain('const { theme, setTheme, toggleTheme } = useTheme();');
    expect(layout).toContain('const { lang, setLanguage, toggleLanguage } = useLanguage();');
    // The frame is the only holder, and it passes the values to the slot it opens.
    expect(layout).toContain("import type { AppContext } from '@/layouts/appContext';");
    expect(layout).toMatch(/<Outlet\s+context=\{\{[\s\S]*?\} satisfies AppContext\}/);
    expect(frameContext).toMatch(/export function useApp\(\): AppContext \{\s*return useOutletContext<AppContext>\(\);/);
    const screens = readdirSync(routesRoot).filter((entry) => entry.endsWith('.tsx') && entry !== 'SettingsRoute.tsx');
    for (const file of screens) expect(codeOnly(routeSource(file))).not.toMatch(/useApp\(\)|useTheme\(\)|useLanguage\(\)|useAuth\(\)/);
    expect(routeSource('SettingsRoute.tsx')).toContain('const { theme, setTheme, lang, setLanguage, email, signOut } = useApp();');
    expect(codeOnly(routeSource('SettingsRoute.tsx'))).not.toMatch(/useTheme\(\)|useLanguage\(\)|useAuth\(\)/);
  });
});
