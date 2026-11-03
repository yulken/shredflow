/*
# Recalculate the BPM records on any session change

Follows 20261028120000_add_practice_fields.sql, which defined
`sync_exercise_bpm_records` as an AFTER INSERT trigger. The session screen now
edits the day's record instead of logging a second one for the day, so the two
stored records (`max_bpm`, `last_bpm`) have to answer to UPDATE and DELETE too:
an edited row that only recomputed on insert would leave the cards and the chart
disagreeing with the value the row now holds, and a deleted row would leave the
records pointing at a session that no longer exists.

1. Trigger scope
- One trigger on `practice_sessions` fires AFTER INSERT, UPDATE and DELETE. The
  function recomputes both records from the exercise's remaining sessions rather
  than folding in one value, so every event lands on the same honest aggregate:
  `max_bpm` is the greatest `Real BPM` still on the table, `last_bpm` the newest.
- The INSERT outcome is unchanged: a fresh row is part of the aggregate, so the
  recomputed `max_bpm` is the same `GREATEST` the old function wrote, and
  `last_bpm` is the new row's value as before.
- `exercise_id` reads `NEW` on INSERT/UPDATE and `OLD` on DELETE. On a cascade
  delete of an exercise the parent row is already gone, and the UPDATE simply
  matches no row.

2. Real BPM
- `Real BPM = bpm × clicks_per_beat` (requirements §4), the same product the
  seeding of the previous migration used. `src/lib/bpm.ts` keeps the TS mirror;
  `src/lib/__tests__/bpm.test.ts` greps both so they cannot drift apart.

3. Security
- No new policies. The UPDATE of `exercises` runs as the role that wrote the
  session, so it is filtered by the owner policies added by
  20261102150000_add_user_ownership.sql exactly as the old trigger's was.

4. Re-runnability
- The trigger and the function are dropped before being recreated, the same pair
  of drops the previous migration used, so a partial re-run does not fail on a
  function a live trigger still references.
*/

DROP TRIGGER IF EXISTS sync_exercise_bpm_records ON practice_sessions;
DROP FUNCTION IF EXISTS update_exercise_bpm_records();

CREATE FUNCTION update_exercise_bpm_records()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  -- Named apart from the column: inside the subquery a bare `exercise_id` would
  -- resolve to the column on both sides and widen the aggregate to every session.
  recalc_exercise_id uuid := COALESCE(NEW.exercise_id, OLD.exercise_id);
BEGIN
  UPDATE exercises
    SET max_bpm = (
        SELECT COALESCE(MAX(bpm * clicks_per_beat), NULL)
        FROM practice_sessions
        WHERE exercise_id = recalc_exercise_id
      ),
      last_bpm = (
        SELECT bpm * clicks_per_beat
        FROM practice_sessions
        WHERE exercise_id = recalc_exercise_id
        ORDER BY created_at DESC
        LIMIT 1
      )
    WHERE id = recalc_exercise_id;
  -- An AFTER trigger's return value is discarded; DELETE has no NEW, so the
  -- row handed back is the one that was removed.
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER sync_exercise_bpm_records
AFTER INSERT OR UPDATE OR DELETE ON practice_sessions
FOR EACH ROW EXECUTE FUNCTION update_exercise_bpm_records();
