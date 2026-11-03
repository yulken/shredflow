# Shredlog — Implementation Plan (requirements reconciliation)

Status: **ACTIVE** — Phases A · B · C · D done (2026-10-31), auth and the Settings view (2026-11-02), and
song progress (2026-11-03). The dated record — what changed each day, the verification evidence, the
post-mortems — is in [docs/history.md](docs/history.md); §9 lists what is open and §10 how a record is
written.
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
  `stat_last_bpm` read the stored `exercise.max_bpm` / `exercise.last_bpm`
  (`SessionView.tsx:29-55`); the client-side derivation at `SessionView.tsx:98-99` stays only as the
  fallback for rows written before the trigger migration.
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

✅ RESOLVED → **E-a) DB-side trigger** (shipped in the Phase A migration). Both consequences landed:
the trigger owns Real-BPM arithmetic, so `realBpm()` (A3) mirrors it exactly, and `SessionView`'s stat
cards read the stored `exercise.max_bpm`/`last_bpm` (`src/components/SessionView.tsx:29-55`) — done in
Phase C, where the derived fallback there stays only for pre-migration rows.

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
  around supabase payloads, `locales.test.ts` for the new i18n keys and for the value-level claim that
  a `pt`/`es` string is not the English one, `src/lib/__tests__/chart.test.ts`
  for the chart's date rule (day-only labels, conditional year, per-locale shapes),
  `src/lib/__tests__/period.test.ts` for the period windows (day counts, boundary inclusivity, the
  tick unit derived from the drawn points), `src/components/__tests__/chart-source.test.ts` for
  the legend/axis/period wiring off the source, and `src/__tests__/index-html.test.ts` for the shell
  (the icon `href` resolves to a real file under `public/`, the gradient stops are palette hexes, the
  static title matches `page_title`).
- Manual acceptance pass: add exercise (with tab URL + visibility) → log with clicks/tension →
  chart renders visibility-filtered Real-BPM series → Max/Last update with zero manual input. On the
  chart: legend as a column on the right, one grid line per week, tooltips with the date only, and the
  four period buttons narrowing the points (Max/Last unchanged). Plus the tab itself: the guitar mark
  beside the title, on either theme.
- ✅ `requirements.md` amended where the implementation deviates from the spec letter: D1 (the tension
  scale is the stored integer), D2 (`Max BPM`/`Last BPM` are stored fields the trigger writes) and the
  session date — §3.2 asks the user to input a date, the log carries the day of the insert instead. The
  three are recorded in `requirements.md` §6, the last one on 2026-11-01.
- Build/dev check per existing convention: `npm run build` / `npm run dev` (PATH needs
  `~/.local/node/bin`).

## 9. Current state

- **Open — the Songs browser pass.** Songs tab at 360px, the percent bar, the structure as tempo runs, the
  log form's live preview, the percent chart's period buttons, PT/ES labels. It needs the song imported as
  Caio's own account (the lab song belonged to a throwaway user and RLS hides it from him) and a period
  wider than the default month, since his spreadsheet rows are dated late September.
- **Open — the October browser pass.** Recorded on 2026-10-31 (chart against the legacy spreadsheet, the tab
  URL write, the visibility toggle, the legend column, the Sunday gridlines, date-only tooltips, the four
  period buttons) and never marked closed. Its detail is in `docs/history.md`.
- **Closed — the commits.** The CI fix and the docs split landed signed as `622240b` (2026-11-03); the
  Songs UI change is the work in progress, to be committed signed too.
- Everything dated lives in **`docs/history.md`** — 28 entries from 2026-10-28 to 2026-11-03, ordered by
  day. The old §9 moved there whole; nothing was summarized away.

## 10. How a record is written

- `docs/history.md` takes one entry per change, under its month, ≤ 12 lines: what changed, the file names,
  and the verification numbers — test count, typecheck/lint/build, and the lab's own values.
- Decisions and deviations from the spec are written once, in `requirements.md` §6, never narrated again here.
- A long post-mortem or a lab run with evidence gets its own entry. A small UI ask is covered by the commit
  message and the diff, so it needs no prose.
- This file keeps only the plan (§0–§8) and what is open (§9): it is what an agent reads first, so staying
  small is the point.
