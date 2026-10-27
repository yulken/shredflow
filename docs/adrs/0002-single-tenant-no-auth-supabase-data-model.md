# ADR-0002: Single-tenant, no-auth Supabase data model

- **Status:** Accepted
- **Date:** 2026-10-26
- **Scope:** database shape and access control
- **Code:** `supabase/migrations/20261026230024_create_guitar_practice_tables.sql`,
  `src/lib/supabase.ts`, `.env` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)
- **Related:** ADR-0005 (tension scale), ADR-0012 (categories)

## Context

The app is one person's practice log with no sign-in flow. It talks to the Supabase
Data API directly from the browser through `@supabase/supabase-js` with an anon key,
so the client is the only source of truth and the DB must be readable and writable
without a session token. Two kinds of data exist: a catalog of exercises, and
per-session records attached to one exercise.

## Decision

Two tables, one tenant, no authentication:

- `exercises`: `id uuid PK`, `title text NOT NULL`, `description text`,
  `category text` (free text), `target_bpm integer`, `created_at timestamptz`.
- `practice_sessions`: `id uuid PK`, `exercise_id uuid NOT NULL` referencing
  `exercises.id` with `ON DELETE CASCADE`, `tension_level integer NOT NULL DEFAULT 5
  CHECK (1..10)`, `bpm integer NOT NULL DEFAULT 60`, `notes text`,
  `created_at timestamptz`.
- An index on `practice_sessions.exercise_id` because every screen load queries one
  exercise's history.
- RLS is enabled on both tables, and policies are `USING (true)` / `WITH CHECK (true)`
  for `SELECT`, `INSERT`, `UPDATE` and `DELETE`, granted to `anon` and
  `authenticated`. `DROP POLICY IF EXISTS` before each `CREATE POLICY` keeps the
  migration re-runnable.

Typed fields are chosen deliberately: `tension_level` and `bpm` are integers
(range-checked, not enum strings) and `category` is free text.

## Alternatives considered

- **Add auth and per-user ownership.** Rejected for this MVP: it would require a
  session flow the app does not have, and the data is intentionally public/shared.
- **Store `tension_level` as a `low|medium|high` enum.** Rejected: the 1-10 numeric
  scale is the thing the user actually rates themselves on, and a UI grouping is
  layered on top of it instead (ADR-0005). Encoding the UI's three levels in the DB
  would throw away the range the schema already guarantees.
- **Store `category` as a FK to a dictionary table.** Rejected: the catalog is
  small and stable; free text plus a canonical client-side list (ADR-0012) was
  enough, and the DB migration stays independent of display language.
- **Encode session stats (count, avg, record) in the DB.** Rejected: they are
  derived, so they are computed in the client on each load.

## Consequences

- Anyone who can reach the app can write to the tables. That is the accepted
  trade-off of a no-auth app and is the reason no client code path treats errors
  from `SELECT` as "not authorized".
- `CREATE TABLE IF NOT EXISTS` plus re-runnable policies mean the migration may be
  applied more than once without duplicating tables.
- Because `exercise_id` cascades, deleting an exercise deletes its whole session
  history; the UI copy in `confirm_delete_exercise` has to say so, and it does.
- `category` being free text is the reason ADR-0012 exists: the DB will happily
  hold both `Técnica` and a locale-flavored variant, and the client is what keeps
  them from splitting.
- The client mirrors this shape in `src/lib/supabase.ts` with `Exercise`,
  `PracticeSession` and `ExerciseWithStats` types, so a schema change must be
  repeated there.
