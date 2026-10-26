/*
# Create guitar practice tables (single-tenant, no auth)

1. New Tables
- `exercises` — the catalog of guitar exercises the user practices.
  - `id` (uuid, primary key)
  - `title` (text, not null) — name of the exercise
  - `description` (text) — optional details about the exercise
  - `category` (text) — e.g. "Técnica", "Velocidade", "Aquecimento"
  - `target_bpm` (integer) — optional target BPM the user aims for
  - `created_at` (timestamptz)
- `practice_sessions` — individual practice session records for an exercise.
  - `id` (uuid, primary key)
  - `exercise_id` (uuid, FK to exercises, cascade delete)
  - `tension_level` (integer 1-10) — self-reported tension during the session
  - `bpm` (integer) — BPM achieved during the session
  - `notes` (text) — free-form notes about the session
  - `created_at` (timestamptz)

2. Security
- Enable RLS on both tables.
- Grant CRUD to `anon` + `authenticated` so the Data API can reach both tables (no-auth app).
- Allow anon + authenticated full CRUD because the data is intentionally shared/public (single-tenant, no sign-in).

3. Notes
- A check constraint keeps `tension_level` in the valid 1–10 range.
- `practice_sessions.exercise_id` cascades on delete so removing an exercise cleans up its history.
- An index on `practice_sessions.exercise_id` speeds up fetching a session history.
*/

CREATE TABLE IF NOT EXISTS exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  category text,
  target_bpm integer,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS practice_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_id uuid NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  tension_level integer NOT NULL DEFAULT 5 CHECK (tension_level >= 1 AND tension_level <= 10),
  bpm integer NOT NULL DEFAULT 60,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_practice_sessions_exercise_id ON practice_sessions(exercise_id);

ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE practice_sessions ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON exercises TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON practice_sessions TO anon, authenticated;

DROP POLICY IF EXISTS "anon_select_exercises" ON exercises;
CREATE POLICY "anon_select_exercises" ON exercises FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_exercises" ON exercises;
CREATE POLICY "anon_insert_exercises" ON exercises FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_exercises" ON exercises;
CREATE POLICY "anon_update_exercises" ON exercises FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_exercises" ON exercises;
CREATE POLICY "anon_delete_exercises" ON exercises FOR DELETE
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_select_sessions" ON practice_sessions;
CREATE POLICY "anon_select_sessions" ON practice_sessions FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_sessions" ON practice_sessions;
CREATE POLICY "anon_insert_sessions" ON practice_sessions FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_sessions" ON practice_sessions;
CREATE POLICY "anon_update_sessions" ON practice_sessions FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_sessions" ON practice_sessions;
CREATE POLICY "anon_delete_sessions" ON practice_sessions FOR DELETE
  TO anon, authenticated USING (true);
