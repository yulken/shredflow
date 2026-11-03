/*
# Add song progress

Follows 20261102150000_add_user_ownership.sql. The exercise catalog tracks licks and
techniques; a song is a different thing to practice - a fixed structure of N measures,
each with the tempo the tab sets there (Songsterr's `PM Ah` column), and a measure
counts as fully played once it can be played confidently at that tempo. Nothing here
touches `exercises` or `practice_sessions`: a song never joins the dashboard's
multi-series BPM chart, and a song log is not a practice session.

1. New tables
- `songs` - one song: `title`, the Songsterr identifiers an import stores
  (`songsterr_url`, `songsterr_song_id`, `songsterr_revision_id`, `songsterr_image`) so a
  re-import can reach the same revision, `total_measures`, and `percent`.
- `song_measure_targets` - one row per measure: the `bpm` the tab sets at that measure and
  its time signature, unique per (song, measure). An import carries tempo and signature
  markers forward across measures, so every measure holds a target even where the tab
  states the tempo once for the whole song.
- `song_progress_logs` - what was practiced: a free-form `section` label, the
  `start_measure`/`end_measure` stretch played, the `bpm_clean` reached, the optional
  `bpm_limit` (information only, never enters the math), tension 1-3 and notes.

2. Security
- RLS on all three tables keyed on `auth.uid() = user_id`, the same shape exercises and
  practice_sessions use. SELECT also keeps `user_id IS NULL`, so a row written by direct
  SQL stays readable until it is owned; nothing else accepts NULL.
- The owner of an INSERT is stamped by `stamp_owner()` from
  20261102150000_add_user_ownership.sql - the client never sends `user_id`.
- `anon` is revoked on all three tables, so an unsigned request reaches Auth and no data.

3. Percent, written by the database
- `percent` is trigger-owned, never client input, exactly like `max_bpm` / `last_bpm`.
  `song_percent(song_id)` is:

      100 * SUM over measures 1..total_measures of
            LEAST(1, MAX(bpm_clean of the logs covering that measure) / target.bpm)
          / total_measures

  The peak is what a measure keeps: a bad day never lowers it, so a slower log added
  after a faster one changes nothing. A measure no log covers contributes 0, and so does
  a measure with no target row. Overlapping blocks (the sheet logs "Chorus 45-82" and
  per-measure solos over 45-51) resolve per measure instead of being weighted twice.
- One trigger function recomputes it from the song's remaining logs, so INSERT, UPDATE and
  DELETE of a log land on the same honest aggregate; a target edit and a change of
  `total_measures` recompute it too, since both move the denominator or a measure's cap.

4. Re-runnability
- Every statement is guarded (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`,
  `DROP POLICY IF EXISTS`, `DROP FUNCTION IF EXISTS`, `DROP TRIGGER IF EXISTS`), so a
  partial re-run does not fail.
*/

CREATE TABLE IF NOT EXISTS songs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  songsterr_url text,
  songsterr_song_id integer,
  songsterr_revision_id integer,
  songsterr_image text,
  total_measures integer NOT NULL DEFAULT 1 CHECK (total_measures >= 1),
  percent numeric(5,2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS song_measure_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  song_id uuid NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  measure_number integer NOT NULL CHECK (measure_number >= 1),
  bpm integer NOT NULL CHECK (bpm >= 1),
  time_numerator integer NOT NULL DEFAULT 4 CHECK (time_numerator >= 1),
  time_denominator integer NOT NULL DEFAULT 4 CHECK (time_denominator >= 1),
  UNIQUE (song_id, measure_number)
);

CREATE TABLE IF NOT EXISTS song_progress_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  song_id uuid NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  section text NOT NULL,
  start_measure integer NOT NULL CHECK (start_measure >= 1),
  end_measure integer NOT NULL CHECK (end_measure >= start_measure),
  bpm_clean integer NOT NULL CHECK (bpm_clean >= 1),
  bpm_limit integer CHECK (bpm_limit >= 1),
  tension_level integer NOT NULL DEFAULT 2 CHECK (tension_level >= 1 AND tension_level <= 3),
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_songs_user_id ON songs(user_id);
CREATE INDEX IF NOT EXISTS idx_song_measure_targets_song_id ON song_measure_targets(song_id);
CREATE INDEX IF NOT EXISTS idx_song_progress_logs_song_id ON song_progress_logs(song_id);

ALTER TABLE songs ENABLE ROW LEVEL SECURITY;
ALTER TABLE song_measure_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE song_progress_logs ENABLE ROW LEVEL SECURITY;

-- Dropped before being recreated, so a re-run does not fail on "policy already exists".
DROP POLICY IF EXISTS "owner_select_songs" ON songs;
DROP POLICY IF EXISTS "owner_insert_songs" ON songs;
DROP POLICY IF EXISTS "owner_update_songs" ON songs;
DROP POLICY IF EXISTS "owner_delete_songs" ON songs;
DROP POLICY IF EXISTS "owner_select_measure_targets" ON song_measure_targets;
DROP POLICY IF EXISTS "owner_insert_measure_targets" ON song_measure_targets;
DROP POLICY IF EXISTS "owner_update_measure_targets" ON song_measure_targets;
DROP POLICY IF EXISTS "owner_delete_measure_targets" ON song_measure_targets;
DROP POLICY IF EXISTS "owner_select_song_logs" ON song_progress_logs;
DROP POLICY IF EXISTS "owner_insert_song_logs" ON song_progress_logs;
DROP POLICY IF EXISTS "owner_update_song_logs" ON song_progress_logs;
DROP POLICY IF EXISTS "owner_delete_song_logs" ON song_progress_logs;

CREATE POLICY "owner_select_songs" ON songs FOR SELECT
  TO authenticated USING (user_id IS NULL OR auth.uid() = user_id);

CREATE POLICY "owner_insert_songs" ON songs FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "owner_update_songs" ON songs FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "owner_delete_songs" ON songs FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- The structure belongs to the song that holds it, so the target rows are reached through
-- the same owner as their parent; the FK cannot be consulted before the policy check.
CREATE POLICY "owner_select_measure_targets" ON song_measure_targets FOR SELECT
  TO authenticated USING (EXISTS (SELECT 1 FROM songs s WHERE s.id = song_id AND (s.user_id IS NULL OR auth.uid() = s.user_id)));

CREATE POLICY "owner_insert_measure_targets" ON song_measure_targets FOR INSERT
  TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM songs s WHERE s.id = song_id AND auth.uid() = s.user_id));

CREATE POLICY "owner_update_measure_targets" ON song_measure_targets FOR UPDATE
  TO authenticated USING (EXISTS (SELECT 1 FROM songs s WHERE s.id = song_id AND auth.uid() = s.user_id))
  WITH CHECK (EXISTS (SELECT 1 FROM songs s WHERE s.id = song_id AND auth.uid() = s.user_id));

CREATE POLICY "owner_delete_measure_targets" ON song_measure_targets FOR DELETE
  TO authenticated USING (EXISTS (SELECT 1 FROM songs s WHERE s.id = song_id AND auth.uid() = s.user_id));

CREATE POLICY "owner_select_song_logs" ON song_progress_logs FOR SELECT
  TO authenticated USING (user_id IS NULL OR auth.uid() = user_id);

CREATE POLICY "owner_insert_song_logs" ON song_progress_logs FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "owner_update_song_logs" ON song_progress_logs FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "owner_delete_song_logs" ON song_progress_logs FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON songs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON song_measure_targets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON song_progress_logs TO authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE ON songs FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON song_measure_targets FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON song_progress_logs FROM anon;

-- `stamp_owner()` is the function the ownership migration installed; these three triggers
-- attach it to the new tables. The function is not recreated here - dropping it would take
-- the exercises and sessions triggers with it.
DROP TRIGGER IF EXISTS stamp_owner_songs ON songs;
DROP TRIGGER IF EXISTS stamp_owner_song_logs ON song_progress_logs;

CREATE TRIGGER stamp_owner_songs BEFORE INSERT ON songs
  FOR EACH ROW EXECUTE FUNCTION stamp_owner();

CREATE TRIGGER stamp_owner_song_logs BEFORE INSERT ON song_progress_logs
  FOR EACH ROW EXECUTE FUNCTION stamp_owner();

-- The percent formula, spelled once in SQL. A measure's state is the peak over every block
-- that covers it: MAX(bpm_clean) of the logs whose stretch contains the measure, capped at
-- that measure's target. A measure with no target row contributes 0 - it cannot be checked
-- against a tempo that was never stated, so it stays unclaimed. The CASE is required rather
-- than a COALESCE because LEAST() ignores NULL arguments: `LEAST(1.0, 0 / NULL)` is 1.0, and
-- a measure with no target would be counted as fully played.
DROP FUNCTION IF EXISTS song_percent(uuid);

CREATE FUNCTION song_percent(recalc_song_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    100.0 * (
      SELECT SUM(
        CASE
          WHEN t.bpm IS NULL THEN 0
          ELSE LEAST(1.0, COALESCE((
            SELECT MAX(l.bpm_clean)
            FROM song_progress_logs l
            WHERE l.song_id = s.id
              AND l.start_measure <= m.measure_number
              AND l.end_measure >= m.measure_number
          ), 0)::numeric / t.bpm)
        END
      )
      FROM generate_series(1, s.total_measures) AS m(measure_number)
      LEFT JOIN song_measure_targets t ON t.song_id = s.id AND t.measure_number = m.measure_number
    ) / s.total_measures,
    0
  )
  FROM songs s
  WHERE s.id = recalc_song_id;
$$;

GRANT EXECUTE ON FUNCTION song_percent(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION song_percent(uuid) FROM anon;

DROP FUNCTION IF EXISTS recompute_song_percent(uuid);

-- Writes the stored percent rather than answering with it, so the three triggers below share
-- one statement. Runs as the invoker, the role that made the change: the UPDATE of `songs`
-- is filtered by its owner policy, and the read of the logs by theirs.
CREATE FUNCTION recompute_song_percent(recalc_song_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE songs SET percent = song_percent(recalc_song_id) WHERE id = recalc_song_id;
END;
$$;

DROP FUNCTION IF EXISTS song_percent_from_log_change();
DROP FUNCTION IF EXISTS song_percent_from_target_change();
DROP FUNCTION IF EXISTS song_percent_from_song_change();

-- `song_id` reads NEW on INSERT/UPDATE and OLD on DELETE. On a cascade delete of the song
-- the parent row is already gone, so the UPDATE matches nothing - the shape
-- update_exercise_bpm_records() already takes for exercises.
CREATE FUNCTION song_percent_from_log_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM recompute_song_percent(COALESCE(NEW.song_id, OLD.song_id));
  -- An AFTER trigger's return value is discarded; DELETE has no NEW.
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE FUNCTION song_percent_from_target_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM recompute_song_percent(COALESCE(NEW.song_id, OLD.song_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Only `total_measures` counts here: `percent` is written by this migration's own triggers,
-- so an UPDATE of it must not recompute the value being written.
CREATE FUNCTION song_percent_from_song_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM recompute_song_percent(COALESCE(NEW.id, OLD.id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS sync_song_percent ON song_progress_logs;
DROP TRIGGER IF EXISTS sync_song_percent_on_targets ON song_measure_targets;
DROP TRIGGER IF EXISTS sync_song_percent_on_song_change ON songs;

CREATE TRIGGER sync_song_percent
AFTER INSERT OR UPDATE OR DELETE ON song_progress_logs
FOR EACH ROW EXECUTE FUNCTION song_percent_from_log_change();

CREATE TRIGGER sync_song_percent_on_targets
AFTER INSERT OR UPDATE OR DELETE ON song_measure_targets
FOR EACH ROW EXECUTE FUNCTION song_percent_from_target_change();

CREATE TRIGGER sync_song_percent_on_song_change
AFTER UPDATE OF total_measures ON songs
FOR EACH ROW EXECUTE FUNCTION song_percent_from_song_change();
