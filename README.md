# ShredFlow

[![ci](https://github.com/yulken/shredflow/actions/workflows/ci.yml/badge.svg)](https://github.com/yulken/shredflow/actions/workflows/ci.yml)

Guitar practice tracker: log each session against the metronome, and watch the
speed you actually played climb over time. It replaces a spreadsheet that did the
same arithmetic by hand.

**Real BPM = base BPM × clicks per beat.** A 90 BPM click at 4 notes per click is
360 Real BPM, which is the number the chart plots and the record keeps.

## What it does

- **Sign in** — email + password: create an account, sign out from Settings. The catalog and the session log belong to the account that wrote them.
- **Settings view** — theme, language and sign-out live on their own screen, next to the account's email; the header carries navigation only. A signed-out visitor still picks theme and language on the auth card, and both choices persist in the browser.
- **Exercise catalog** — CRUD with category, target BPM, description and a tablature link. A quiet
  check in the card's stat row marks the exercises that already have a record today; it is read off
  the log, so yesterday's record stops being marked at midnight. The list can be shown by the most
  recent session of each exercise or by the total number of sessions it has logged; the choice is a
  preference kept on the device, not a field of the exercise.
- **Session log** — base BPM, clicks per beat (1 / 2 / 4 / 6), hand tension (1 relaxed → 3 tense), free-form notes. The session date is the day you write it. The exercise's own Real BPM chart and its tab link sit on the same screen, and the link can be stored or edited there.
- **Dashboard** — a multi-series line chart, one series per exercise, Y = Real BPM, X = the logged day, with `last month / last 3 months / last year / all data` windows.
- **Chart visibility** — the eye toggle on each row puts that exercise on or off the chart.
- **Max / Last BPM** — written by a Postgres trigger on every session insert, never by the client.
- **UI in English, Portuguese and Spanish**, plus a light/dark theme.

## Screenshots

<!-- Drop the PNGs in docs/screenshots/ and uncomment the tags below. -->
<!-- ![Dashboard](docs/screenshots/dashboard.png) -->
<!-- ![Exercise list](docs/screenshots/exercises.png) -->
<!-- ![Session view](docs/screenshots/session.png) -->

## Tech stack

| Layer | Dependencies |
| --- | --- |
| UI | React 18, react-dom, lucide-react (icons) |
| Styling | Tailwind CSS, PostCSS, Autoprefixer |
| Chart | Chart.js, react-chartjs-2, chartjs-adapter-date-fns, date-fns |
| Backend | Supabase (Postgres + Data API), `@supabase/supabase-js` |
| Build | Vite, TypeScript |
| Checks | Vitest, ESLint, `supabase` CLI |

## Getting started

Prerequisites: Node 26.10.0 (`nvm use`) and Docker (for the local database).

```bash
npm ci
cp .env.example .env
```

Start the local Supabase stack, which applies the migrations in
`supabase/migrations/` on first run:

```bash
npx supabase start
npx supabase status   # copy API URL and anon key into .env
```

Then run the app:

```bash
npm run dev           # http://localhost:5173
```

The repo ships no seed data, so a fresh database starts empty — add exercises in
the UI and log sessions against them.

Once the database holds data, apply new migrations with `npx supabase migration
up`. `npx supabase db reset` rebuilds the database from scratch and drops every
row you have logged, including the pre-auth log that `claim_legacy_rows()` would
otherwise move under your account.

### Scripts

| Command | Does |
| --- | --- |
| `npm run dev` | Vite dev server, exposed on the network |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the built app |
| `npm run lint` | ESLint over the tree |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest |

## Project structure

```
src/              router.tsx — one address per screen, all of them under the frame
src/components/   Dashboard, ExerciseList, SessionView, ProgressChart, SettingsView, AuthView, toggles
src/hooks/        theme, language, chart period (the three persisted), day rollover, refresh on visible, auth session, one exercise / one song read by URL id
src/layouts/      AppLayout — header, footer, the auth gate — and the outlet context routes read
src/routes/       one thin wrapper per address, each fetched lazily
src/lib/          supabase client, auth, i18n + locales, bpm, tension, chart, period, clock
supabase/         config.toml + migrations
```

## Notes

- **Sign in.** Email + password, one account per person. Rows carry a `user_id`, and
  the RLS policies key every read and write on `auth.uid() = user_id`, so a signed-out
  visitor reaches only the sign-in screen — the anon key grants no table access. The
  log written before sign-in existed has no owner; whoever signs in first claims it
  (`claim_legacy_rows()`), which is the intent for a single-owner tool.
- **Song import.** Songsterr has no API and songsterr.com sends no CORS header, so a song's
  structure cannot be read from the browser — the importer is a local script:
  `npm run import:songsterr <url>` (or a bare songId), signed in with `SUPABASE_EMAIL` /
  `SUPABASE_PASSWORD` from `.env`. It reads the tab's tempo per measure and never sends
  `percent` or `user_id`; the DB triggers write both.
- **Addresses.** Every screen has its own URL — `/`, `/exercises`, `/exercises/<id>`, `/songs`,
  `/songs/<id>`, `/settings` — and a detail screen reads its row by the id in the address, so a
  reload or a pasted link opens the row it names. Serving a deep link needs a host that answers
  unknown paths with `index.html`: `npm run dev` and `npm run preview` already do, and nothing
  deploys from CI, so no such rule is written in this repository.
- The spec, and the deliberate deviations from it, are in [requirements.md](requirements.md).
- The dated record of what changed each day, with the verification evidence behind it, is in
  [docs/history.md](docs/history.md).
