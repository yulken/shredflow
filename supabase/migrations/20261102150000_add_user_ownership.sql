/*
# Add user ownership (sign up + sign in)

Follows 20261028120000_add_practice_fields.sql. The app gained an account per
person, so every row gained an owner: the data the log holds is now one user's,
not whatever the URL and anon key happen to reach.

1. New columns
- `exercises.user_id` (uuid, FK to `auth.users`, cascade delete, nullable).
- `practice_sessions.user_id` (uuid, FK to `auth.users`, cascade delete, nullable).
- An index on each, so a signed-in read is a lookup instead of a scan.

2. Security
- The eight anon + authenticated CRUD policies of migration 1 are dropped and
  replaced by eight `authenticated` policies keyed on `auth.uid() = user_id`:
  INSERT / UPDATE / DELETE only ever touch the caller's own rows. SELECT also
  keeps `user_id IS NULL`, which is the only way the pre-auth rows stay readable
  until they are claimed (3).
- The owner of an INSERT is stamped by the database, not sent by the client:
  `stamp_owner()` is a BEFORE INSERT trigger on both tables that sets
  `user_id := auth.uid()`, so a signed-in write passes the INSERT policy and a
  client cannot claim another account's rows. Outside a request `auth.uid()` is
  NULL (direct SQL, service role) and the row stays ownerless for (3) to move.
- `anon` is revoked on both tables. The anon key still reaches Auth, but reads no
  data, so an anonymous visitor lands on the sign-in screen instead of the log.
- A session row can no longer point at another user's exercise. The INSERT policy
  checks `user_id` before the FK is consulted, and `sync_exercise_bpm_records`
  runs as the role that inserted the session, so its UPDATE of a foreign exercise
  is filtered by RLS as well — the two guards hold independently.

3. Legacy rows
- Rows written before this migration have no owner; the columns stay nullable
  rather than `SET NOT NULL` so they survive the upgrade instead of being
  discarded. `claim_legacy_rows()` (SECURITY DEFINER, refused when `auth.uid()`
  is NULL) moves every ownerless row of both tables to the caller and returns how
  many it moved. It is first-come-first-served: the account that signs in first
  inherits the whole pre-auth log, which is the intent for a single-owner tool.

4. Re-runnability
- Every statement is guarded (`ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT
  EXISTS`, `DROP POLICY IF EXISTS`, `DROP FUNCTION IF EXISTS`, `DROP TRIGGER IF
  EXISTS`), so a partial re-run does not fail.
*/

ALTER TABLE exercises ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE practice_sessions ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_exercises_user_id ON exercises(user_id);
CREATE INDEX IF NOT EXISTS idx_practice_sessions_user_id ON practice_sessions(user_id);

DROP POLICY IF EXISTS "anon_select_exercises" ON exercises;
DROP POLICY IF EXISTS "anon_insert_exercises" ON exercises;
DROP POLICY IF EXISTS "anon_update_exercises" ON exercises;
DROP POLICY IF EXISTS "anon_delete_exercises" ON exercises;
DROP POLICY IF EXISTS "anon_select_sessions" ON practice_sessions;
DROP POLICY IF EXISTS "anon_insert_sessions" ON practice_sessions;
DROP POLICY IF EXISTS "anon_update_sessions" ON practice_sessions;
DROP POLICY IF EXISTS "anon_delete_sessions" ON practice_sessions;

-- The replacements are dropped too, so a re-run recreates them instead of
-- failing on "policy already exists".
DROP POLICY IF EXISTS "owner_select_exercises" ON exercises;
DROP POLICY IF EXISTS "owner_insert_exercises" ON exercises;
DROP POLICY IF EXISTS "owner_update_exercises" ON exercises;
DROP POLICY IF EXISTS "owner_delete_exercises" ON exercises;
DROP POLICY IF EXISTS "owner_select_sessions" ON practice_sessions;
DROP POLICY IF EXISTS "owner_insert_sessions" ON practice_sessions;
DROP POLICY IF EXISTS "owner_update_sessions" ON practice_sessions;
DROP POLICY IF EXISTS "owner_delete_sessions" ON practice_sessions;

-- SELECT is the only policy that reads ownerless rows: it is what lets the app
-- show the inherited log before the claim, and claim_legacy_rows() (3) is what
-- turns those rows into owned ones. Nothing else accepts NULL, because
-- `auth.uid() = NULL` is never true.
CREATE POLICY "owner_select_exercises" ON exercises FOR SELECT
  TO authenticated USING (user_id IS NULL OR auth.uid() = user_id);

CREATE POLICY "owner_insert_exercises" ON exercises FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "owner_update_exercises" ON exercises FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "owner_delete_exercises" ON exercises FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "owner_select_sessions" ON practice_sessions FOR SELECT
  TO authenticated USING (user_id IS NULL OR auth.uid() = user_id);

CREATE POLICY "owner_insert_sessions" ON practice_sessions FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "owner_update_sessions" ON practice_sessions FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "owner_delete_sessions" ON practice_sessions FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Authenticated keeps the CRUD grants migration 1 gave it; anon loses them, so
-- an unsigned request cannot reach either table at all.
GRANT SELECT, INSERT, UPDATE, DELETE ON exercises TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON practice_sessions TO authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE ON exercises FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON practice_sessions FROM anon;

DROP FUNCTION IF EXISTS claim_legacy_rows();

-- SECURITY DEFINER because the ownerless rows are, by the SELECT policy, visible
-- but not writable by the caller: only the table owner may move them, and the
-- auth.uid() guard below keeps a signed-out request from claiming anything.
CREATE FUNCTION claim_legacy_rows()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  exercises_claimed integer := 0;
  sessions_claimed integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE exercises SET user_id = auth.uid() WHERE user_id IS NULL;
  GET DIAGNOSTICS exercises_claimed = ROW_COUNT;

  UPDATE practice_sessions SET user_id = auth.uid() WHERE user_id IS NULL;
  GET DIAGNOSTICS sessions_claimed = ROW_COUNT;

  RETURN exercises_claimed + sessions_claimed;
END;
$$;

GRANT EXECUTE ON FUNCTION claim_legacy_rows() TO authenticated;
REVOKE EXECUTE ON FUNCTION claim_legacy_rows() FROM anon;

DROP TRIGGER IF EXISTS stamp_owner_exercises ON exercises;
DROP TRIGGER IF EXISTS stamp_owner_sessions ON practice_sessions;
DROP FUNCTION IF EXISTS stamp_owner();

-- Runs as the invoker: it only reads the JWT claim and writes the row the caller
-- is already allowed to insert, so it needs no privileges beyond the INSERT
-- grant above. RLS checks WITH CHECK on the row the trigger returns, so the
-- stamped owner is what the policy evaluates.
CREATE FUNCTION stamp_owner()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.user_id := auth.uid();
  RETURN NEW;
END;
$$;

CREATE TRIGGER stamp_owner_exercises BEFORE INSERT ON exercises
  FOR EACH ROW EXECUTE FUNCTION stamp_owner();

CREATE TRIGGER stamp_owner_sessions BEFORE INSERT ON practice_sessions
  FOR EACH ROW EXECUTE FUNCTION stamp_owner();
