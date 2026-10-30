# Shredlog — Implementation Plan (requirements reconciliation)

Status: **ACTIVE** — Phase A done, B · C · D pending.
Spec reference: `requirements.md` · Repo: `shredlog` (Vite/React + Supabase)
Related: a prior SessionView plan (`~/.opencode/plan/session-view-adjustments.md`) already resolved decision D1 — see §6.

## 0. Tension note — read before implementing

Three things in the requirements are not compatible with the code as shipped; each needs an
explicit decision before implementation, not a silent deviation:

1. **"Tension (1-3)" (requirement 3.1/3.5)** vs. schema **`CHECK 1..10`** and the shipped UI,
   which offers five buttons `["No","Medium","Heavy","Extreme","Insane"]` mapped to levels 1–5.
   The spec's own examples (`Low Tension` / `High Tension`) do not match the shipped labels
   (`No` / `Medium` / `Heavy` / …). Options: (a) keep DB range 1–10, restrict UI to three named
   levels; (b) make the three levels Low/Medium/High per spec wording; (c) keep 5 levels and amend
   the spec. **→ D1, resolved in Phase A.**
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
> - D1 kept as shipped: `tension_level CHECK 1..10`, UI restricted to three named levels.

## 2. Phase B — Exercise entity UI (`src/components/ExerciseList.tsx`) — PENDING

- Form: add **Tab URL** input (validated URL → stored normalized, rendered as an external link with
  an icon) and a **Show on chart** visibility toggle (checkbox/switch, default true).
- Catalog cards: surface the tab link + a visibility badge; add `max_bpm` / `last_bpm` chips to the
  card footer (grid → true table layout is a later polish item, low priority).
- i18n: new keys in `en.ts`, `pt.ts`, `es.ts` (`field_tab_url`, `placeholder_tab_url`,
  `field_visibility`, `visibility_show`, `visibility_hide`, `badge_off_chart`, `error_invalid_url`,
  `stat_max_bpm`, `stat_last_bpm`) + `locales.test.ts` invariants.
- Note: card `onClick` drills into the exercise → any inner anchor must `stopPropagation`.

## 3. Phase C — Session logging (`src/components/SessionView.tsx`) — PENDING

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
- Prior SessionView plan already standardizes tension to three named input levels (values 1–3,
  legacy 1–10 normalized at read time) — align with it, don't redo it.

## 4. Phase D — Dashboard chart (`src/components/Dashboard.tsx` + `ProgressChart.tsx`) — PENDING

- New component `src/components/ProgressChart.tsx`:
  - X axis: `created_at` (Chart.js time scale).
  - Y axis: **Real BPM**.
  - One series per exercise where `dashboard_visible = true`.
  - Fixed per-exercise color palette + legend; tooltip shows date / base BPM / clicks / tension.
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

- **D1 — Tension scale:** ✅ CONFIRMED. DB keeps `CHECK 1..10` (legacy rows can hold 4–10, so
  tightening would be lossy); the UI offers only three named levels (stored 1/2/3);
  `tension.ts` normalizes any legacy value to a tier at read time. `requirements.md` carries an
  Implementation-notes section stating this, so the deviation is documented, not silent.
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
6. Final pass — full acceptance-criteria sweep against `requirements.md` + `vitest`/`tsc`/build.

## 8. Verification

- `vitest` extended: `bpm.test.ts` (`realBpm`, plus the migration-text lockstep), pure helpers
  around supabase payloads, `locales.test.ts` for the new i18n keys.
- Manual acceptance pass: add exercise (with tab URL + visibility) → log with clicks/tension →
  chart renders visibility-filtered Real-BPM series → Max/Last update with zero manual input.
- Amend `requirements.md` wording where D1/D2 deviate from the spec letter.
- Build/dev check per existing convention: `npm run build` / `npm run dev` (PATH needs
  `~/.local/node/bin`).

## 9. Status log

- **2026-10-28 Phase A** ✅ — migration, types, `realBpm()`, test lockstep. Details above.
- **2026-10-28 Phase C** pending — `SessionView.tsx`: clicks selector, re-fetch after save,
  Real-BPM history cards, stat-card read switch.
- **2026-10-28 Phase D** pending — `Dashboard.tsx` + `ProgressChart.tsx`, App third view.
- **2026-10-28 Phase B** pending — `ExerciseList.tsx` tab URL + visibility toggle + stat chips.
- Charting deps now in `package.json`: `chart.js@4.5.1`, `react-chartjs-2@5.3.1`,
  `chartjs-adapter-date-fns@3.0.0`, `date-fns@4.4.0` (peer of the adapter).
