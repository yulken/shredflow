# Shredlog — Implementation Plan (requirements reconciliation)

Status: **ACTIVE** — Phases A · B · C · D done (2026-10-31), including the chart polish Caio asked for
(lateral legend, weekly-only gridlines, date-only tooltips) and the period control (month / quarter /
year / all) on the Dashboard chart. Legacy log seeded; acceptance #1–#3
verified at the schema/data level. One item left: the browser pass (chart vs spreadsheet, tab URL,
visibility toggle, period buttons) — needs Caio to click through it.
Spec reference: `requirements.md` · Repo: `shredlog` (Vite/React + Supabase)
Related: a prior SessionView plan (`~/.opencode/plan/session-view-adjustments.md`) already resolved decision D1 — see §6.

## 0. Tension note — read before implementing

Three things in the requirements are not compatible with the code as shipped; each needs an
explicit decision before implementation, not a silent deviation:

1. **"Tension (1-3)" (requirement 3.1/3.5)** vs. schema **`CHECK 1..10`** and the shipped UI,
   which offered five buttons `["No","Medium","Heavy","Extreme","Insane"]` mapped to levels 1–5.
   The spec's own examples (`Low Tension` / `High Tension`) did not match the shipped labels
   (`No` / `Medium` / `Heavy` / …). Options were: (a) keep DB range 1–10, restrict UI to three
   named levels; (b) make the three levels Low/Medium/High per spec wording; (c) keep 5 levels and
   amend the spec. **→ D1, resolved in Phase A, superseded 2026-10-31: option (b) in full — the
   schema itself now stores `1..3`, so nothing is normalized.**
2. **Max BPM / Last BPM are spec'd as exercise data**, but nothing stores them today — the values
   are derived at read time in `SessionView.tsx` (and the dead type `ExerciseWithStats` hints at
   an intent that was never implemented). Requirement 3.7 ("backend calculates Max BPM…
   asynchronously") implies a persistent write path. **→ D2/E-a, resolved in Phase A.**
3. **`realBpm(bpm, clicksPerBeat) = bpm × clicksPerBeat`** is spec'd as an app/DB **function**.
   It lives nowhere in the repo; `src/lib/bpm.ts` is only a ±1/±5 stepper. **→ A3, done in Phase A.**

## 1. Phase A — Data model (schema + types) — foundation, do first ✅ DONE 2026-10-28

**A1. New Supabase migration** (`supabase/migrations/20261028120000_add_practice_fields.sql`):

| Table | Column | Type / constraint |
|---|---|---|
| `exercises` | `tab_url` | `text` (nullable) |
| `exercises` | `dashboard_visible` | `boolean NOT NULL DEFAULT true` |
| `exercises` | `max_bpm` / `last_bpm` | `integer` (nullable — NULL = never derived, e.g. pre-migration rows) |
| `practice_sessions` | `clicks_per_beat` | `integer NOT NULL DEFAULT 1 CHECK (>= 1)` |

Plus the D2 write path: `CREATE TRIGGER sync_exercise_bpm_records ON INSERT OF practice_sessions`
calling `update_exercise_bpm_records()`, which computes `real_bpm = bpm × clicks_per_beat` and
overwrites the parent exercise's `max_bpm` when greater, `last_bpm` always. Migration seeds
existing rows (`seed_legacy_exercise_records()` via one-off `SELECT`). Style follows `0001_init.sql`.

**A2. `src/lib/supabase.ts` types** mirror the schema (`tab_url`, `dashboard_visible`,
`max_bpm`, `last_bpm`, `clicks_per_beat`). Dead `ExerciseWithStats` type removed (0 references).

**A3. `src/lib/bpm.ts`**: `realBpm(bpm, clicksPerBeat) = bpm * clicksPerBeat` — mirrors the SQL
trigger exactly (single formula, two implementations). Stepper kept as-is.

> ✅ **A1–A3 landed (2026-10-28).**
> - Migration `20261028120000_add_practice_fields.sql`: five columns, `sync_exercise_bpm_records`
>   trigger (`GREATEST(max_bpm, real_bpm)`; `last_bpm` always overwritten),
>   `seed_legacy_exercise_records()` for pre-existing rows, DROP POLICY guards, header block.
> - `supabase.ts`: new fields on `Exercise` / `PracticeSession`; `ExerciseWithStats` deleted.
> - `bpm.ts`: `realBpm()`; `bpm.test.ts` asserts the product numerically **and** greps the
>   migration for the same product plus both `SET` targets — TS/SQL lockstep is test-enforced.
>   `vitest` 60 passed; `tsc --noEmit` clean.
> - D1 as shipped (Phase A): `tension_level CHECK 1..10`, UI restricted to three named levels.
>   Superseded 2026-10-31 — see §6 D1 and the status log.

## 2. Phase B — Exercise entity UI (`src/components/ExerciseList.tsx`) — ✅ DONE 2026-10-31

- Form: add **Tab URL** input (validated URL → stored normalized, rendered as an external link with
  an icon) and a **Show on chart** visibility toggle (checkbox/switch, default true).
- Catalog cards: surface the tab link + a visibility badge; add `max_bpm` / `last_bpm` chips to the
  card footer (grid → true table layout is a later polish item, low priority).
- i18n: new keys in `en.ts`, `pt.ts`, `es.ts` (`field_tab_url`, `placeholder_tab_url`,
  `field_visibility`, `visibility_show`, `visibility_hide`, `badge_off_chart`, `error_invalid_url`,
  `stat_max_bpm`, `stat_last_bpm`) + `locales.test.ts` invariants.
- Note: card `onClick` drills into the exercise → any inner anchor must `stopPropagation`.

## 3. Phase C — Session logging (`src/components/SessionView.tsx`) — ✅ DONE 2026-10-31

- Add a `clicks_per_beat` selector — segmented options 1 / 2 / 4 / 6 — next to the BPM stepper.
- Save payload includes `clicks_per_beat`; **re-fetch the saved row** so the DB-derived stats
  (`last_bpm`, `max_bpm`) shown in the UI are the trigger's values, not a client-side guess.
- History cards: headline = Real BPM (`bpm × clicks_per_beat`), secondary = base BPM; record badge
  compares against the Real-BPM record.
- Stat cards: recompute on Real BPM. Sessions count unchanged; average over `realOf(session)`
  (client-side aggregation over a stored session's `bpm × clicks_per_beat` is arithmetic, not a
  stat write — the *overwrite* stats stay server-side per D2). `stat_record_bpm` and
  `stat_last_bpm` read `exercise.max_bpm` / `exercise.last_bpm` (derived fallback for pre-migration
  rows only), NOT the client-side derivation at `SessionView.tsx:68–72`, which must be retired.
- Stat grid goes 3 → 4 cards (sessions / average / record / last) — `grid-cols-4`, `text-2xl` at the
  `w-9` breakpoint, as the Dashboard catalog already does.
- i18n keys: `field_clicks`, `real_bpm_label`, `stat_last_bpm`.
- Tension is the three levels 1–3 stored as-is (schema CHECK bounds them); the tier machinery
  that read legacy 1–10 values is gone — see §6 D1 and the status log.

## 4. Phase D — Dashboard chart (`src/components/Dashboard.tsx` + `ProgressChart.tsx`) — ✅ DONE 2026-10-31

- New component `src/components/ProgressChart.tsx`:
  - X axis: `created_at` (Chart.js time scale), ticks fixed to one per week so the gridlines mark
    weekly subdivisions only; labels localized (`src/lib/chart.ts`) and year-bearing only when the
    plotted range spans more than one year.
  - Y axis: **Real BPM**.
  - One series per exercise where `dashboard_visible = true`.
  - Fixed per-exercise color palette; legend lateral (right, top-aligned) beside the plot; tooltip
    shows the occurrence date (no clock time) / base BPM / clicks / tension.
  - Period control (`1 month · 3 months · 1 year · all`) in the chart card header: a chart-only
    filter over the points, persisted in `localStorage` (`chart_period`) like the language is.
    `src/lib/period.ts` holds the windows (30/90/365 rolling days) and the tick unit derived from
    the points drawn; `src/hooks/useChartPeriod.ts` holds the storage. Max/Last in the catalog stay
    the trigger's stored records.
- Mounted in a **standalone Dashboard screen** (per D4): `Dashboard.tsx` renders the catalog table
  (name, max/last BPM, visibility) + the chart; `App.tsx` gains a third top-level view (brand button
  routes to Dashboard; drill-down remains available from Dashboard back into exercises/sessions).
- Acceptance target: "matches visual output of the legacy spreadsheet chart" — validate once real
  data exists.

## 5. Phase E — Max/Last BPM write path (acceptance #3: "backend… asynchronously") — DONE via E-a

Decision-dependent options (kept for the record):

- **E-a) DB-side (spec-literal):** Postgres trigger on `practice_sessions` insert updates
  `exercises.max_bpm`/`last_bpm` — true "backend, async". Needs stored fields from A1. ✅ CHOSEN
- **E-b) Client-side after ingest:** on save success, UPDATE the exercise row — simpler, weaker
  "backend" reading.
- **E-c) Keep deriving client-side:** current behavior; functionally equivalent, deviates from spec
  letter → would require amending `requirements.md`.

✅ RESOLVED → **E-a) DB-side trigger** (shipped in the Phase A migration). Consequences, all landed
or pending as noted: the trigger owns Real-BPM arithmetic, so `realBpm()` (A3) mirrors it exactly
(done); `SessionView` stat cards switch from client-side derivation to reading
`exercise.max_bpm`/`last_bpm` — **pending, Phase C**.

## 6. Open decisions (blocking) — all resolved

- **D1 — Tension scale:** ✅ RESOLVED 2026-10-31 as option (b) in full. DB stores
  `tension_level CHECK 1..3` (default 2, inside the range); the UI offers the three levels
  (stored 1/2/3) and writes the value it picked. `tensionTier()` and its tier bar derivation
  were deleted — the label and the color index the stored number directly, so the CHECK is the
  only guard. The wider `1..10` range Phase A shipped was safe to drop because the database was
  rebuilt locally and holds no rows in 4–10. `requirements.md` Implementation notes state this.
- **D2 — Max/Last BPM storage:** ✅ RESOLVED → **E-a) DB-side stored fields.** `exercises.max_bpm` /
  `last_bpm` persisted; Postgres trigger on `practice_sessions` insert recomputes them
  (`real_bpm = bpm × clicks_per_beat`; overwrite when greater / always for last). Satisfies
  acceptance #3 literally. UI reads stored values; derived fallback only for pre-migration rows.
- **D3 — Chart library:** ✅ RESOLVED → **`react-chartjs-2@5` + `chart.js@4` + `chartjs-adapter-date-fns`**
  (Chart.js v4 time scale, multi-series, tooltips). **Correction:** the plan originally named
  `react-chartjs-4`, which does not exist on npm (Chart.js v4 is wrapped by the major-5 release of
  `react-chartjs-2`). Installed: `chart.js@4.5.1`, `react-chartjs-2@5.3.1` (peer `chart.js ^4.1.1`),
  `chartjs-adapter-date-fns@3.0.0` (peer `date-fns@4`). Chosen over a hand-rolled SVG chart because
  the acceptance criterion is to match a legacy spreadsheet chart, and Chart.js time scales /
  multi-series / tooltips / legend already do that; the adapter registers its scale and the components
  format ticks themselves (see D3b).
- **D4 — Chart placement:** ✅ RESOLVED → **standalone Dashboard screen** (catalog table + chart),
  separate from `ExerciseList`/`SessionView`; `App.tsx` gains a third top-level view (brand button →
  Dashboard → drill-down unchanged).

## 7. Proposed work order (trimmed — D1–D4 resolved in Phase A, so steps 1–2 are history)

1. ✅ Phase A — migration + types + `realBpm()` + tests. Everything depends on it. **DONE.**
2. Phase C — session form with `clicks_per_beat` (logs feed the chart earliest).
3. Phase D — chart (`Dashboard.tsx` + `ProgressChart.tsx`) — unblocks acceptance criteria #1–#3.
4. Phase B — tab URL / visibility UX + stat surfacing.
5. Phase E — already satisfied by the E-a trigger; nothing left to write **except** the Phase C
   stat-card read switch.
6. ✅ Final pass — full acceptance-criteria sweep against `requirements.md` + `vitest`/`tsc`/build
   (2026-10-31, data level: legacy log equivalence, trigger records, CHECK probes, RLS). The chart
   polish Caio asked for (lateral legend, weekly gridlines, date-only tooltips) is applied and
   verified automatically. Remaining: the browser pass on the chart, the tab URL write and the
   visibility toggle.

## 8. Verification

- `vitest` extended: `bpm.test.ts` (`realBpm`, plus the migration-text lockstep), pure helpers
  around supabase payloads, `locales.test.ts` for the new i18n keys, `src/lib/__tests__/chart.test.ts`
  for the chart's date rule (day-only labels, conditional year, per-locale shapes),
  `src/lib/__tests__/period.test.ts` for the period windows (day counts, boundary inclusivity, the
  tick unit derived from the drawn points), and `src/components/__tests__/chart-source.test.ts` for
  the legend/axis/period wiring off the source.
- Manual acceptance pass: add exercise (with tab URL + visibility) → log with clicks/tension →
  chart renders visibility-filtered Real-BPM series → Max/Last update with zero manual input. On the
  chart: legend as a column on the right, one grid line per week, tooltips with the date only, and the
  four period buttons narrowing the points (Max/Last unchanged).
- Amend `requirements.md` wording where D1/D2 deviate from the spec letter.
- Build/dev check per existing convention: `npm run build` / `npm run dev` (PATH needs
  `~/.local/node/bin`).

## 9. Status log

- **2026-10-28 Phase A** ✅ — migration, types, `realBpm()`, test lockstep. Details above.
- **2026-10-31 Phase C** ✅ — `SessionView.tsx` rebuilt after the truncation regression (commit
  `4e3e8be` committed 283 lines ending in a `/* __PART4__ */` placeholder; the app failed to boot
  with `Unterminated JSX contents`). Restored tail: notes + save button, history column with
  Real-BPM headline cards (secondary line = base BPM × clicks), record badge compared against the
  Real-BPM record (`liveStats`), `StatCard`, `categoryLabel` import. Stat cards read the DB-written
  `max_bpm`/`last_bpm` with derived fallback only for pre-migration rows. `fetchSessions` moved to
  `useCallback` (exhaustive-deps). New i18n keys: `field_clicks`, `real_bpm_label`, `stat_last_bpm`.
- **2026-10-31 Phase B** ✅ — `ExerciseList.tsx`: Tab URL field (validated + normalized via
  `new URL().href`, rendered as external link with `stopPropagation`), Show-on-chart toggle,
  `max_bpm`/`last_bpm` chips, `badge_off_chart`. Keys: `field_tab_url`, `placeholder_tab_url`,
  `field_visibility`, `visibility_show`, `visibility_hide`, `badge_off_chart`, `error_invalid_url`,
  `stat_max_bpm`, `link_tab_aria`.
- **2026-10-31 Phase D** ✅ — `ProgressChart.tsx` (Chart.js time scale, one series per
  `dashboard_visible` exercise, Y = Real BPM, fixed palette by sorted-visibility index, tooltip =
  date / base BPM × clicks / tension) + `Dashboard.tsx` (chart card + catalog table: name, max/last
  BPM, visibility) + third top-level view in `App.tsx` (brand button → Dashboard, header nav to
  Exercises, drill-down back to the list it came from). `date-fns@^4.4.0` declared in
  `package.json` (was lockfile-only). Keys: `nav_dashboard`, `nav_exercises`, `dashboard_title`,
  `dashboard_subtitle`, catalog columns, `chart_title`, `chart_y_axis`, `chart_empty`.
- **2026-10-31 verification** ✅ — `tsc --noEmit` clean; `vitest` 60 passed; `eslint` clean (removed
  unused imports in `i18n.test.ts`, `ArrowLeft` in `ExerciseList.tsx`); `npm run build` OK; dev
  server smoke: `main.tsx`/`App.tsx`/`SessionView`/`Dashboard`/`ProgressChart`/`ExerciseList` all
  transform 200 (boot regression resolved).
- **2026-10-31 schema bug** ✅ — the app could not write anything: `GET /rest/v1/exercises?select=…`
  returned `42703 column exercises.tab_url does not exist` and the same for
  `practice_sessions.clicks_per_beat`, while migration 1 was applied (both tables existed, empty).
  Root cause: `20261028120000_add_practice_fields.sql` had `UPDATE … WHERE … SET` in both
  functions — Postgres requires `SET` before `WHERE`, so statement 6 failed with
  `syntax error at or near "WHERE" (SQLSTATE 42601)` and the whole file rolled back
  (`db push` wraps a migration in one transaction). Fixed: `SET` reordered before `WHERE` in
  `update_exercise_bpm_records()` and `seed_legacy_exercise_records()`; `ADD COLUMN IF NOT EXISTS`;
  `DROP TRIGGER IF EXISTS sync_exercise_bpm_records` added before `DROP FUNCTION` (the trigger
  depends on the function); header §5 documents re-runnability. `vitest` still 60 — the
  `bpm.test.ts` migration-grep lockstep (`SET max_bpm = GREATEST(...)`) matches the new order.
  A second bug in the same file: `CREATE TRIGGER … ON practice_sessions AFTER INSERT FOR EACH ROW`
  — Postgres takes the event first (`AFTER INSERT ON practice_sessions FOR EACH ROW …`), failing
  with `syntax error at or near "ON"`. Fixed too.
- **2026-10-31 schema probe (scratch Postgres 16, approved)** ✅ — throwaway container
  (`postgres:16-alpine`, port 55432, `anon`/`authenticated` roles created first so migration 1's
  `GRANT` runs): both migrations apply with `ON_ERROR_STOP=1`, and a second run of migration 2
  reports 0 errors (idempotent). Insert `bpm 80 × clicks 3` → `max_bpm 240, last_bpm 240`; a
  second insert `100 × 2` → `max_bpm 240, last_bpm 200`, i.e. the trigger keeps the greater value
  and always overwrites `last_bpm`. Container removed afterwards. Not exercised:
  `seed_legacy_exercise_records()` returns 0 on a fresh schema, and the legacy-fill path cannot be
  driven through the trigger (any session insert already writes the record).
- **2026-10-31 CLI** ✅ — `supabase@^2.122.0` added as devDependency; `npx supabase --version`
  returns 2.122.0.
- **2026-10-31 tension normalized to 1–3** ✅ — D1 re-resolved as spec option (b) in full.
  Migration 1 edited in place (valid because the local database is reset from zero; the remote
  project still has the old `1..10` applied, so if it is ever used again the change needs a new
  migration with `UPDATE practice_sessions SET tension_level = LEAST(GREATEST(tension_level, 1), 3)`
  plus the tightened CHECK): `DEFAULT 5` → `DEFAULT 2` (5 was inside the old range and would have
  failed the new one on every insert that omits the column), `CHECK` → `>= 1 AND <= 3`, header
  §1/§3 reworded. Code: `tensionTier()` deleted, `tensionLabel`/`tensionColor` index
  `LABEL_KEYS[level - 1]` / `TEXT_COLORS[level - 1]` directly, `SessionView` history dots use
  `session.tension_level` instead of a derived tier, selector comment rewritten. No clamp or
  fallback anywhere: a value outside 1–3 is the CHECK's job, and after the reset none exists.
  `tension.test.ts` rewritten — per-level label/color, key selection in PT/ES, negative assertions
  that `tensionTier` is gone and both helpers index by the level, plus the migration-text lockstep
  (`tension_level >= 1 AND tension_level <= 3`, `DEFAULT 2`, no `<= 10`). `requirements.md` §6 note
  rewritten (it had contradicted §2). Locales: PT `Baixa/Moderada/Alta`, ES `Baja/Media/Alta`
  (both had `Low`/`High` English leftovers; PT had only `Moderada` translated). `vitest` 61 passed
  (the rewritten `tension.test.ts` has one test more than the tier suite it replaced).
- **2026-10-31 local Supabase + blank screen** ✅ — `supabase init`/`start`/`db reset` run by Caio;
  `supabase_*_shredflow` containers up with kong on `54321` (`54321->8000`). The white screen was the
  `.env`, not the schema: `supabase status -o env` had overwritten it with `ANON_KEY`/`API_URL`/… leaving
  **no** `VITE_*` variable, so `src/lib/supabase.ts:3-6` handed `undefined` to `createClient`, which throws
  `Invalid supabaseUrl: Must be a valid HTTP or HTTPS URL.`
  (`node_modules/@supabase/supabase-js/dist/main/lib/helpers.js:61`) at module load — a runtime throw, so
  Vite's overlay never surfaced it and nothing mounted. Restored by Caio; the CLI output should go to a
  separate file, not `.env`, so it cannot overwrite the Vite block again.
- **2026-10-31 BPM step labels** ✅ — `SessionView.tsx` showed `\u22121` and `\u22125` literally: a
  `\uXXXX` escape is a property of JS string literals, and JSX text children carry no escapes, so the
  characters were rendered as-is (the `+1`/`+5` buttons were fine — literal text). Both labels are now
  `{'\u22121'}` / `{'\u22125'}`, and the dev server serves `children: "−1"` / `children: "−5"`. Guard added
  to `locales.test.ts`: every `*.ts`/`*.tsx` under `src/` is scanned for an escape on a line carrying no
  quote or backtick (i.e. JSX text), plus the two labels pinned as string literals. Run against the
  committed version the same rule flags exactly `SessionView.tsx:207` and `:229`; against the fixed tree
  it flags nothing. `vitest` 63 passed; `tsc --noEmit` clean (the recursive `readdirSync` overload returns
  `string | Buffer` — `encoding: 'utf8'` fixes it); `eslint` clean; `npm run build` ok.
- **2026-10-31 DDL + idempotency probes (local stack, all writes rolled back)** ✅ — the two items that
  REST could not reach, done over `psql` inside transactions so nothing persisted (`count(*)` was 48
  before and 48 after):
  - `pg_constraint`: `practice_sessions_tension_level_check CHECK ((tension_level >= 1) AND
    (tension_level <= 3))` and `practice_sessions_clicks_per_beat_check CHECK ((clicks_per_beat >= 1))`;
    defaults `tension_level 2`, `clicks_per_beat 1`, `bpm 60`; `exercises` carries
    `tab_url`/`dashboard_visible` (`DEFAULT true`)/`max_bpm`/`last_bpm`.
  - Write probes (`BEGIN … INSERT … ROLLBACK`, one transaction each): `tension_level 4` and `0` →
    `violates check constraint "practice_sessions_tension_level_check"`; `clicks_per_beat 0` →
    `violates check constraint "practice_sessions_clicks_per_beat_check"`; the legal edge
    `tension 3 × clicks 3` → `INSERT 0 1`, rolled back. D1's guard is enforced by the CHECK alone,
    with no clamp in code.
  - `seed.sql` re-run against the populated DB inside `BEGIN … ROLLBACK`: `INSERT 0 0` on exercises and
    0 session inserts (48 → 48, 7 → 7 during the probe), so both idempotency guards hold.
  - `pg_policies`: 8 policies (SELECT/INSERT/UPDATE/DELETE on both tables, `{anon,authenticated}`) with
    RLS on; REST GET still returns the rows, so the app's read and write paths are open.
  - Legacy-log equivalence: all 48 CSV rows match DB rows as a multiset on
    (title, day, bpm, clicks, real) — 0 rows only-CSV, 0 only-DB — and for every exercise the stored
    `max_bpm`/`last_bpm` equals the CSV-derived (count, max, newest-day) values: Chromatic Scale
    7/380/380, Cromatico descendente relaxado 2/170/170, Legato Monsters Matchbook 6/432/414,
    Punisher 16/288/288, Spider Walk 10/170/170, String Skipping 3/216/216, Tapping Monsters
    Matchbook 4/368/368. Legato is the case that separates `GREATEST` from a bare overwrite on real
    data: `max 432` (2026-10-12, 72×6) against `last 414` (2026-10-17, 69×6).
  - Suite still green on the current tree: `vitest` 69 passed, `tsc --noEmit` clean, `eslint` clean,
    `npm run build` ok; dev server on 5173 transforms `main.tsx`/`App.tsx`/`Dashboard`/`ProgressChart`/
    `SessionView`/`ExerciseList` all 200.
- **Pending** — one item left: the manual acceptance pass in the browser, which needs Caio — the
  Dashboard chart against the legacy spreadsheet (48 sessions over 7 exercises, all `dashboard_visible`
  true → 7 datasets, `PALETTE` is 8 colors so no collision), the tab URL write, and the
  visibility toggle redrawing the chart. The data behind all three is already verified above, and the
  chart's own shape is checked in the tests above; what only the browser can confirm is the legend
  column on the right, the 7 Sunday grid lines over Sep 13 .. Oct 25, a tooltip that reads a date
  with no hour, and the four period buttons narrowing the points (1 month keeps 37 of the 48 rows,
  3 months / 1 year / all keep 48 today) without touching Max/Last in the table.
- **2026-10-31 local schema verified over REST (read-only, GET only)** ✅ — target: local Supabase kong
  (`http://127.0.0.1:54321`, `supabase_kong_shredflow 54321->8000`), `apikey`/`Bearer` = the anon key in
  `.env`, `Prefer: count=exact`:
  - `GET /rest/v1/exercises?select=id,title,tab_url,dashboard_visible,max_bpm,last_bpm` → HTTP 200, 1 row
    (`terste`, `tab_url null`, `dashboard_visible true`, `max_bpm 60`, `last_bpm 60`) — migration 2's four
    columns exist, and the `anon` role can read through the RLS policies.
  - `GET /rest/v1/practice_sessions?select=id,exercise_id,bpm,clicks_per_beat,tension_level,notes,created_at`
    → HTTP 200, 1 row (`bpm 60`, `clicks_per_beat 1`, `tension_level 2`, `created_at 2026-10-31T14:02:39Z`),
    written by Caio through the UI. That insert is what set both records to 60, so the trigger fires on a
    real client request — causation, not correlation.
  - Negative result: with one session `max_bpm`/`last_bpm` are equal, so this run cannot tell `GREATEST`
    apart from a bare overwrite; the scratch Postgres probe already proved the two apart (`240` kept, `200`
    overwritten), and the seeded legacy log now proves it on real data too (Legato `max 432` vs `last 414`).
    `tension_level 2` is the new column default.
  The CHECK itself is DDL, unreadable over REST; covered later the same day by the `pg_constraint` read
  and the rolled-back write probe — see the DDL probe entry below.
- **2026-10-31 legacy log seeded** ✅ — the spreadsheet at the repo root,
  `Músicas - exercicios-log.csv`, is 48 session rows over 7 exercises, 2026-09-14 .. 2026-10-26, ASCII,
  date-ascending, no `(id, date)` duplicates, and every `BPM Real` equals `BPM × Cliques` (checked row by
  row). Columns are `Nome, ID, Data, BPM, Cliques por batida, BPM Real` — **no tension column**, and one
  row carries a stray `Hoje, 31/10/2026` annotation past the columns. `supabase/seed.sql` (new, matches the
  CLI's existing `sql_paths = ["./seed.sql"]`) inserts the 7 titles and the 48 sessions:
  `tension_level 2` (the column default — nothing invented), `created_at` = the logged day at 12:00 UTC (the
  log has no time; noon keeps the day under a -03:00 client), `description`/`category`/`target_bpm` NULL,
  CSV quoting removed (`"""Punisher"""` → `Punisher`), the CSV's `ID` column dropped, records left to the
  trigger. Idempotent on title (exercises) and on (exercise, timestamp, bpm, clicks) (sessions).
  Ran `npx supabase db reset` (approved target: local `shredflow` stack). Two bugs found by running it:
  `VALUES` rows were written without comma separators (`syntax error at or near "(" (SQLSTATE 42601`), and
  the bulk `INSERT ... SELECT` gave `last_bpm` an arbitrary log instead of the newest one — a bulk insert
  has no defined row order, so the trigger saw rows out of date order (e.g. Punisher stored `last_bpm 90`,
  the first log). Sessions now go in one at a time through a plpgsql cursor ordered by day.
  Verified over REST (GET only) after the reset: 7 exercises, 48 sessions, and for every exercise the
  stored `max_bpm`/`last_bpm` equals the values derived from the CSV by date — Chromatic Scale 7/380/380,
  Cromatico descendente relaxado 2/170/170, Legato Monsters Matchbook 6/432/414, Punisher 16/288/288,
  Spider Walk 10/170/170, String Skipping 3/216/216, Tapping Monsters Matchbook 4/368/368. `tension_level`
  is 2 everywhere, `notes` all NULL, `dashboard_visible` true on all seven.
  Not executed at the time: the idempotency guard itself and the CHECK probe — both covered later the
  same day inside rolled-back transactions (see the DDL + idempotency probes entry).
- Charting deps now in `package.json`: `chart.js@4.5.1`, `react-chartjs-2@5.3.1`,
  `chartjs-adapter-date-fns@3.0.0`, `date-fns@4.4.0` (peer of the adapter).
- **2026-10-31 chart polish (Caio's three asks)** ✅ — `src/components/ProgressChart.tsx`:
  - **Legend lateral**: `position: 'right'`, `align: 'start'`, point-style labels
    (`boxWidth: 8`, `padding: 10`, `font: { size: 11 }`). Right rather than left because the Y-axis
    title already occupies the left edge; `align: 'start'` stacks the 7 entries from the plot's top
    instead of trading chart height for a row of labels under the axis. The canvas still carries no
    control (no `onClick`): the eye in the catalog is the only writer of `dashboard_visible`.
  - **Weekly gridlines only**: `time: { unit: 'week', stepSize: 1, tooltipFormat: 'PP' }` — Chart.js
    draws one grid line per tick, so fixing the unit is what stops the axis auto-densifying ticks
    into days/hours; plus `grid: { drawTicks: false }` and `ticks: { maxRotation: 0, autoSkip: true,
    padding: 8, callback }`. Correction to what was claimed when this was proposed: omitting
    `isoWeekday` does **not** give unaligned 7-day steps — `_generate` snaps the first tick with
    `adapter.startOf(min, 'week')` (`node_modules/chart.js/dist/chart.js`), and the date-fns
    adapter's `week` uses `weekStartsOn: 0`, so the lines land on Sundays. Confirmed over the seeded
    range: 7 grid lines — Sep 13, Sep 20, Sep 27, Oct 4, Oct 11, Oct 18, Oct 25.
  - **Labels localized, and no clock time**: ticks go through
    `callback: (v) => tickDateLabel(Number(v), dateLocale(), withYear)` and the tooltip title through
    `tooltipDateLabel(x, dateLocale(), withYear)` — the adapter's `displayFormats` were removed,
    since the callback formats every label and they would be dead config. `tooltipFormat: 'PP p'`
    became `'PP'`, and no label asks for `hour`/`minute` or uses `toLocaleString`: the log is
    day-based (requirements §2) and the seeded rows carry an invented 12:00 UTC nobody logged.
  - **Year only when it matters**: the rule is extracted to `src/lib/chart.ts` (`spansMultipleYears`,
    `tickDateLabel`, `tooltipDateLabel`) and computed from the points actually drawn —
    `const drawn = series.flat()` → `withYear: spansMultipleYears(drawn)` — so hiding a series with
    the eye never changes what the axis says. The whole seeded log is 2026, so no label carries a
    year today; a log that lands in 2027 starts showing it in ticks and tooltips with nothing to
    change here.
  - Tests: new `src/lib/__tests__/chart.test.ts` (10 tests — the year rule, the no-clock-time rule
    across the three locales, and each locale's label shape: `en-US` "Sep 14" / "Sep 14, 2026",
    `pt-BR` "14 de set." / "14 de set. de 2026", `es-ES` "14 sept" / "14 sept 2026"; padded day only
    where the tooltip asks for it), and `src/components/__tests__/chart-source.test.ts` rewritten to
    assert the legend/axis/date wiring from the source instead of pinning the old default-top legend.
    Two bugs in the new assertions, fixed: `not.toContain('supabase')` hit the `import type` of
    `Exercise`/`PracticeSession`, and prose comments that name `isoWeekday`/`displayFormats` to say
    they are absent broke the plain negatives — both negatives are now scoped to the `time: {…}`
    object. The year tests use mid-year, noon timestamps so no browser zone can move a date into
    another year (this machine is -03:00).
  - `vitest` 85 passed; `tsc --noEmit`, `eslint` and `npm run build` clean. The dev server on 5173
    serves the new module: the legend block and tick callback are in the transformed output, and
    `displayFormats` / `'PP p'` are gone from it. Visual acceptance is still Caio's browser pass.
- **2026-10-31 period control on the Dashboard chart** ✅ — Caio's ask: last month / last quarter /
  last year / all data. Three decisions, taken at the recommended defaults: the windows roll from
  the clock, not from the newest log (a 40-day idle stretch therefore leaves the month window empty
  and the chart says `chart_empty_period` instead of sliding the window back to the last practice);
  the default is `all`, so the landing view stays the whole log that acceptance criterion 2 compares
  against the spreadsheet; and the filter is chart-only — `max_bpm`/`last_bpm` stay the trigger's
  stored records (`requirements.md` §6), which is why nothing filters the fetch by date.
  - `src/lib/period.ts` (new): `Period`, `PERIODS` shortest-first, `DEFAULT_PERIOD = 'all'`, rolling
    day counts 30/90/365 (a quarter is a duration, not a calendar quarter), `periodCutoff` (`null`
    for `all`), `withinPeriod` inclusive of its own start, `filterSessions` (keeps input order), and
    `tickUnit(drawn)`: ≤90 days → `week`, ≤730 → `month`, above that → `quarter`. The unit stopped
    being hardcoded `week`: 52 weekly grid lines over a year is exactly the axis pollution the chart
    was cleaned up to avoid, and the seeded 42-day log keeps its Sunday lines.
  - `src/hooks/useChartPeriod.ts` (new): mirrors `useLanguage` — read once at mount through
    `isPeriod`, written back on change, both guarded by try/catch. A stale or hand-edited
    `localStorage` value cannot reach the chart as a window the UI cannot name. Storage stays out of
    the suite, like the language's chain.
  - `ProgressChart.tsx`: takes `period`, filters once (`const inPeriod = filterSessions(sessions,
    period, now)`) before the series are built, with `now` anchored inside the memo so a control
    click rebuilds the points; `time: { unit, stepSize: 1, tooltipFormat: 'PP' }`; the empty state
    tells "nothing logged at all" (`chart_empty`) apart from "nothing inside this window"
    (`chart_empty_period`) through `hasAnySession`.
  - `Dashboard.tsx`: segmented group in the chart card header (`role="group"` + `aria-label`, four
    buttons with `aria-pressed`), wrapping under the title on narrow screens so it does not compete
    with the lateral legend. It writes nothing to the database: the dashboard's only write is still
    the visibility flag.
  - Locales: 6 keys × 3 dictionaries (`chart_period_label`, `period_month`, `period_quarter`,
    `period_year`, `period_all`, `chart_empty_period`), ASCII-only as the dictionaries are, parity
    enforced by `locales.test.ts`.
  - Tests: `src/lib/__tests__/period.test.ts` (13) pins the day counts against a fixed clock, cutoff
    inclusivity (`2026-10-01T12:00Z` kept, `11:59:59Z` dropped), the idle-window counts over a
    fixture spanning 2023..2026, order preservation, and the tick-unit thresholds 90/91/365/730/731
    days — including that a month window keeps weekly lines over a multi-year log.
    `chart-source.test.ts` gained the period claims (points filtered, records untouched, group markup,
    persistence in the hook) and the axis assertion moved from `unit: 'week'` to
    `unit: tickUnit(drawn)`. One assertion bug fixed on the way: `not.toContain('localStorage')` hit
    the Dashboard prose that says it does not touch storage, so the negative is scoped to
    `/localStorage\./`.
  - `vitest` 104 passed; `tsc --noEmit`, `eslint` and `npm run build` clean. Counts over the seeded
    DB (read-only `psql`, `now()` = 2026-10-31 18:59 UTC): 30 days → 37 rows, 90 → 48, 365 → 48,
    all → 48; the month window keeps Oct 5 .. Oct 26, so it is the only button that changes the curve
    today. Dev server serves the new modules (group markup, `filterSessions`, `tickUnit`, the 6
    strings in `pt.ts`). Visual acceptance stays in Caio's browser pass.
