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
* Users must be able to submit a new practice log for any existing exercise, inputting the date, base BPM, clicks per beat, and hand tension level.

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
* **Chart axis, legend and tooltip (2026-10-31):** acceptance criterion 2 asks for the legacy spreadsheet's visual output; the four choices below are deliberate deviations requested during the implementation, not gaps in the data — the series themselves are unchanged (one per visible exercise, Y = `Real BPM`, X = the logged day). The X axis ticks one grid line per week instead of one per session; tick and tooltip labels follow the UI language rather than the chart adapter's default English; the tooltip shows the logged day with no clock time, since requirement 3.2 logs a date, not a moment; the year appears only when the plotted range spans more than one year; and the legend sits as a column on the right of the plot instead of above the axis, because the Y-axis title already occupies the left. `src/lib/chart.ts` holds the date rule and `src/lib/__tests__/chart.test.ts` pins it.