/*
# Add practice fields (dashboard chart + stored Real BPM records)

Follows 20261026230024_create_guitar_practice_tables.sql. Spec reference:
`requirements.md` §2 (entities), §4 (business rules), §5 acceptance #3.

1. New columns
- `exercises.tab_url` (text) — external link to the tablature (nullable).
- `exercises.dashboard_visible` (boolean, not null, default true) — whether the
  exercise is plotted on the dashboard chart.
- `exercises.max_bpm` (integer, nullable) — highest `Real BPM` ever recorded.
- `exercises.last_bpm` (integer, nullable) — `Real BPM` of the most recent session.
- `practice_sessions.clicks_per_beat` (integer >= 1, default 1) — notes per metronome click.

2. Real BPM
- `Real BPM = bpm × clicks_per_beat` (requirements §4). The same formula lives in
  `src/lib/bpm.ts` as `realBpm()`; keep the two implementations in lockstep.

3. Asynchronous recalculation (acceptance criterion #3)
- An AFTER INSERT trigger on `practice_sessions` writes the session's `Real BPM`
  into its parent exercise: `max_bpm` keeps the greater of old and new, `last_bpm`
  is overwritten every time. Neither field is ever sent by the client.
- Legacy rows predate `clicks_per_beat` and get the default 1, so their historical
  `Real BPM` equals the stored `bpm`. Seeding fills `max_bpm`/`last_bpm` for
  exercises that already have sessions; exercises with no sessions stay NULL.

4. Security
- No new policies. The new columns are covered by the existing anon + authenticated
  CRUD policies on both tables, and the trigger's UPDATE of `exercises` runs as the
  same role that inserted the session.

5. Re-runnability
- Every statement is guarded (`ADD COLUMN IF NOT EXISTS`, `DROP ... IF EXISTS`) so a
  partial re-run does not fail. `DROP TRIGGER` precedes `DROP FUNCTION` because the
  trigger depends on the function.
*/

ALTER TABLE exercises ADD COLUMN IF NOT EXISTS tab_url text;
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS dashboard_visible boolean NOT NULL DEFAULT true;
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS max_bpm integer;
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS last_bpm integer;

ALTER TABLE practice_sessions ADD COLUMN IF NOT EXISTS clicks_per_beat integer NOT NULL DEFAULT 1 CHECK (clicks_per_beat >= 1);

-- Trigger function: the single place Real BPM is computed on the backend. The
-- trigger is dropped first because the function it depends on cannot be dropped
-- while the trigger still references it.
DROP TRIGGER IF EXISTS sync_exercise_bpm_records ON practice_sessions;
DROP FUNCTION IF EXISTS update_exercise_bpm_records();

CREATE FUNCTION update_exercise_bpm_records()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  real_bpm_value integer;
BEGIN
  real_bpm_value := COALESCE(NEW.bpm, 0) * COALESCE(NEW.clicks_per_beat, 1);
  UPDATE exercises
    SET max_bpm = GREATEST(max_bpm, real_bpm_value),
        last_bpm = real_bpm_value
    WHERE id = NEW.exercise_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sync_exercise_bpm_records
AFTER INSERT ON practice_sessions
FOR EACH ROW EXECUTE FUNCTION update_exercise_bpm_records();

-- One-off fill for exercises that already have history from before this migration.
DROP FUNCTION IF EXISTS seed_legacy_exercise_records();

CREATE FUNCTION seed_legacy_exercise_records()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  seeded_count integer := 0;
  seeded_exercise_id uuid;
BEGIN
  FOR seeded_exercise_id IN
    SELECT id FROM exercises WHERE max_bpm IS NULL OR last_bpm IS NULL
  LOOP
    UPDATE exercises
      SET max_bpm = (
          SELECT MAX(bpm * clicks_per_beat)
          FROM practice_sessions WHERE exercise_id = seeded_exercise_id
        ),
          last_bpm = (
          SELECT bpm * clicks_per_beat
          FROM practice_sessions WHERE exercise_id = seeded_exercise_id
          ORDER BY created_at DESC LIMIT 1
        )
      WHERE id = seeded_exercise_id;
    seeded_count := seeded_count + 1;
  END LOOP;
  RETURN seeded_count;
END;
$$;

SELECT seed_legacy_exercise_records();
