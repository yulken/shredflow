import { lazy } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppLayout } from '@/layouts/AppLayout';

// One entry per screen, with the frame in `AppLayout` above all of them. The addresses
// are the app's shape written down: `/` is the landing screen the brand button returns
// to, the two catalogs are peers under their own prefix, and a row's screen is its
// catalog's path plus the row's id - which is what keeps the catalog tab highlighted
// while the row is open (`NavLink` matches a prefix unless told `end`), replacing the
// four places in `App.tsx` that compared a `listView` string against two `selected*`
// objects.
//
// Each route is `lazy` and mounted as the route's `Component`, so the chunk that carries
// the chart and the two long row screens is asked for when the address names it. The
// build reported one chunk above Vite's 500 KB warning - the whole app in one file,
// including the song screen a dashboard visit never opens. The frame is not lazy: it is
// what answers before any chunk arrives, and the gate has to be there to hold the fetch
// back until the session is read.
//
// The catch-all sends an unknown address to the landing screen rather than showing a
// card about it: every real address the app writes is one of the six above, so an
// address off the list is a mistyped one, and the landing screen is the place to
// re-choose from. A row's id that exists but names no row the caller can see is the
// other case, and that one answers with `MissingRow` on its own address.
export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { index: true, Component: lazy(() => import('@/routes/DashboardRoute')) },
      { path: 'exercises', Component: lazy(() => import('@/routes/ExerciseListRoute')) },
      { path: 'exercises/:exerciseId', Component: lazy(() => import('@/routes/SessionRoute')) },
      { path: 'songs', Component: lazy(() => import('@/routes/SongListRoute')) },
      { path: 'songs/:songId', Component: lazy(() => import('@/routes/SongRoute')) },
      { path: 'settings', Component: lazy(() => import('@/routes/SettingsRoute')) },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);
