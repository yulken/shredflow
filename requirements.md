# Software Requirements Specification

## 1. Overview and Purpose
The objective is to develop a full-stack web application to track and visualize musical practice progression, specifically targeting guitar technique evolution. This system replaces an existing manual tracking method based on spreadsheets, automating metrics calculation and providing a dynamic visual dashboard for performance analysis.

## 2. Core Entities and Data Structure
The business logic relies on two primary entities derived from the legacy spreadsheet model:

* **Exercise (Dimension):** The catalog of technical practices.
  * `Name`: Identifier of the exercise (e.g., "Spider Walk", "Punisher").
  * `Tab URL`: External link to the tablature (e.g., Songsterr link).
  * `Objective`: Biomechanical or technical focus (e.g., "Alternate Picking", "Motion economy").
  * `Max BPM`: The highest historical speed achieved.
  * `Last BPM`: The speed recorded in the most recent session.
  * `Dashboard Visibility`: A boolean flag determining if the exercise should be plotted on the main chart.
* **Practice Log (Fact/Event):** The transactional record of a daily practice session.
  * `Date`: Timestamp of the practice session.
  * `BPM`: The speed set on the metronome.
  * `Clicks per Beat`: The number of notes played per metronome click (e.g., 1, 2, 4, 6).
  * `Tension Level`: A subjective metric (e.g., integer scale from 1 to 3) indicating hand tension during execution, where 1 is completely relaxed and 3 is highly tense.

## 3. Functional Requirements

### 3.1 Exercise Management
* The system must allow users to create, read, update, and delete (CRUD) exercises in the catalog.
* Users must be able to toggle the "Dashboard Visibility" flag for each exercise to control the chart rendering.

### 3.2 Practice Logging
* Users must be able to submit a new practice log for any existing exercise, inputting the base BPM, clicks per beat, and hand tension level. The session's date is the day the log is written, not a field the user types (see Implementation notes).

### 3.3 Dashboard and Visualization
* The application must feature a primary dashboard displaying a tabular view of the exercise catalog.
* The dashboard must include a multi-series line chart mapping practice progression.
* Chart X-Axis: Time/Date of the practice sessions.
* Chart Y-Axis: `Real BPM`.
* Chart Data: Only exercises with the "Dashboard Visibility" flag set to true must be rendered on the chart.

## 4. Business Rules
* **Real BPM Calculation:** `Real BPM` is strictly the product of `Base BPM` multiplied by `Clicks per Beat`.
* **Record Updating:** When a new practice log is ingested, the system must evaluate the calculated `Real BPM`. If this value exceeds the `Max BPM` currently stored in the parent Exercise entity, the `Max BPM` must be overwritten with the new record.
* **Last Session Updating:** Every new practice log must overwrite the `Last BPM` field of its parent Exercise with the newly calculated `Real BPM`.

## 5. Acceptance Criteria
* A user can add a new exercise and submit daily practice logs against it, including their physical tension feedback.
* The multi-series line chart accurately reflects the historical `BPM` data points, matching the visual output of the legacy spreadsheet chart.
* The backend successfully calculates and updates the `Max BPM` and `Last BPM` asynchronously without requiring manual user input for these specific fields.

## 6. Implementation Notes (recorded during implementation, 2026-10-28)

These notes do not change the spec above; they state how the implementation reads it, so that a later reader can tell a deviation from an unmet requirement.

* **`Tension Level` storage:** the schema keeps an integer `1..3` with a CHECK, exactly the scale defined in requirement 3.1. The stored number is the level itself — no legacy scale, no normalization at read time — so the CHECK is the only guard. The wider `1..10` range this note used to record was removed on 2026-10-31, when the database was rebuilt locally: with no rows holding 4–10, tightening stopped discarding anything. The column's default is `2`, inside the range it checks. `src/lib/__tests__/tension.test.ts` pins the level-to-label/color mapping and greps the migration text for the range and the default, so schema and code cannot drift apart unnoticed.
* **`Max BPM` / `Last BPM`:** both are stored on the Exercise entity and written only by the backend — a Supabase trigger fired on each practice-log insert — per acceptance criterion 3. They are never accepted as client input, and the UI reads the stored values rather than recomputing them.
* **`Real BPM`:** the product is spelled twice, once in the backend trigger that owns the two stored fields and once in `realBpm()` (`src/lib/bpm.ts`) used for display. `src/lib/__tests__/bpm.test.ts` pins the TS product numerically and greps the migration text for the same product, so the two cannot drift apart unnoticed.
* **Chart axis, legend and tooltip (2026-10-31):** acceptance criterion 2 asks for the legacy spreadsheet's visual output; the choices below are deliberate deviations requested during the implementation, not gaps in the data — the series themselves are unchanged (one per visible exercise, Y = `Real BPM`, X = the logged day). The X axis ticks one grid line per week instead of one per session; tick and tooltip labels follow the UI language rather than the chart adapter's default English; the tooltip shows the logged day with no clock time, since requirement 3.2 logs a date, not a moment; the year appears only when the plotted range spans more than one year; and the legend sits as a column on the right of the plot instead of above the axis, because the Y-axis title already occupies the left — on a plot measured narrower than 480px it moves above the axis, recorded below. `src/lib/chart.ts` holds the date rule and `src/lib/__tests__/chart.test.ts` pins it.
* **X-axis tick form (2026-11-02):** the ticks are the day and the month as digits — `09/14` where the locale leads with the month, `14/09` where it leads with the day — both fields padded, so the ticks line up in columns and no month name reaches the axis. The order is read from the locale rather than hardcoded per language. The tooltip still spells the day, and the year is appended on the same condition as above. Deliberate, decided 2026-11-02.
* **What a chart screen writes beside the plot (2026-11-02):** the quiet variant of `ProgressChart` — `compact`, off by default, turned on only by the session screen — drops the legend and the Y-axis title and halves the marks: the X axis steps two units instead of one, and the Y ladder is capped. The axis stays, because the window and the scale are still read off it; the tooltip already names the exercise, the logged day, the `Real BPM` and the tension for the point under the cursor, so the legend of a single label and the unit title beside the numbers repeat what hovering says. The guide lines keep their gray at a lower alpha rather than disappearing, since they mark the subdivisions `tickUnit` chose (`src/lib/period.ts`). The dashboard gets none of it: same unit, same step size, same ladder, same legend as recorded above. Deliberate, decided 2026-11-02; no other screen turns it on.
* **Tab link placement (2026-11-02):** requirement 2's field `Tab URL` is shown on the exercise's own screen (`src/components/SessionView.tsx`), where it is also stored and edited, not in the dashboard's catalog row. Acceptance criterion 2 asks the dashboard for a tabular view of the catalog, and the row is already the way to the screen that owns the link; a second copy in the row sat beside the exercise name, in the same brand red as the row's icon, and had to guard its own click against the row's navigation. The catalog therefore keeps title, `Max BPM`, `Last BPM` and the visibility toggle only. Deliberate, decided 2026-11-02; the dashboard shows no tab link — the exercise cards (`src/components/ExerciseList.tsx:146-159`) and the session screen do.
* **Catalog shape by width (2026-11-02):** acceptance criterion 2 asks the dashboard for a tabular view, so the table stays — header, four columns, the same rows — on `sm` and up. Below it the same rows are drawn stacked: name, then `Max BPM` / `Last BPM` as chips, visibility toggle at the right edge. Four columns inside 360px drag sideways and put a 24px control inside a row that navigates, so the list shape is the mobile deviation, not a missing feature; the eye is written once (`EyeCell`) because both shapes host it. Deliberate, decided 2026-11-02.
* **Chart layout by container width (2026-11-02):** a plot measured narrower than 480px puts the legend above the axis (`align: center`) instead of on the right, caps the X axis at 5 labels, and is 260px tall instead of 360px. The width is read from the container through a `ResizeObserver`, not from a media query, because a narrow column on a wide screen is narrow for the chart too — the session view's history card is one. A wide plot is unchanged: legend right, no X cap, 360px. Deliberate, decided 2026-11-02; `src/components/__tests__/chart-source.test.ts` pins both branches.
* **Period windows (2026-10-31):** the dashboard chart carries a `last month / last 3 months / last year / all data` control. It narrows the points plotted, not the records: `Max BPM` and `Last BPM` in the catalog stay the values the trigger stores, so criterion 3 is unaffected and nothing filters the fetch by date. The windows are durations rolling from the current day (30/90/365 days), so an idle stretch shows an empty window rather than re-anchoring at the last session; `all data` is the default, which keeps criterion 2 comparing the full log against the spreadsheet. The tick unit grows with the window drawn — weekly over a month or a quarter, monthly over a year — so the axis keeps its weekly-looking subdivisions at every period. `src/lib/period.ts` holds the arithmetic, `src/hooks/useChartPeriod.ts` the persisted choice, and `src/lib/__tests__/period.test.ts` pins both rules.
* **Session date (2026-11-01):** requirement 3.2 asked for the date as user input. It is instead the day the log is written: `practice_sessions.created_at` takes the schema default (`now()`), and `SessionView` sends only `exercise_id`, `tension_level`, `bpm`, `clicks_per_beat` and `notes` (`src/components/SessionView.tsx:60-66`), so the form carries no date field. One fact keeps one source — a typed date would be a second one — and the chart plots that day while the session history renders it in the UI language (`src/components/SessionView.tsx:348-357`). Deliberate, decided 2026-11-01; nothing else writes a session date.
* **Environment (2026-11-01):** the old remote Supabase project is retired and will not be used again, so the schema edit made in place in `supabase/migrations/20261026230024_create_guitar_practice_tables.sql` — the tension range narrowed to `1..3` — needs no follow-up migration against the wider range it once applied. The local database, reset from zero by the CLI, is the environment the app runs against; the legacy log's rows live there and are not reproduced from the repository.
* **Accounts and ownership (2026-11-02):** the spec never names an account, so sign-in sits outside requirements 1–5 and the entities of requirement 2 are unchanged — same fields, same trigger-written `Max BPM` / `Last BPM`. What changed is who may reach them: `user_id` columns (`supabase/migrations/20261102150000_add_user_ownership.sql`) and RLS policies keyed on `auth.uid() = user_id` replace the `anon USING(true)` policies of the original schema, and `anon` is revoked from both tables, so the spec's "users" are now the account that holds the session. The owner of a new row is stamped by a `stamp_owner()` BEFORE INSERT trigger rather than sent by the client, so no write can claim another account's rows. One deliberate deviation: the log written before accounts existed carries no owner (`user_id` stays nullable), and `claim_legacy_rows()` moves those rows under the first account that signs in — first-come-first-served, which is the intent for a tool with one owner; a second account sees its own empty catalog. Email confirmation is off in `supabase/config.toml`, so a signup returns a session at once; the password floor is the config's `minimum_password_length = 6`, mirrored by `MIN_PASSWORD_LENGTH` in `src/lib/auth.ts`. `src/lib/__tests__/auth-schema.test.ts` greps the migration and config so neither drifts unnoticed.