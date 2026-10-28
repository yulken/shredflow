# ADR-0002: One tenant, no auth, two Supabase tables

- **Status:** Accepted
- **Date:** 2026-10-26

## Rule

1. The app's data is two tables in one Supabase project: `exercises` and
   `practice_sessions`. Every session row points at an exercise through
   `exercise_id`, which `ON DELETE CASCADE` makes the only deletion path.
2. There is no authentication: the client is built from `import.meta.env`, and the
   tables carry open RLS policies for `anon` and `authenticated`.
3. The columns that carry meaning are typed, never enum strings: `tension_level` and
   `bpm` are range-checked integers, `category` is free text.

## Decision

Do not add a user, a second table per screen, or a signing flow. One person's practice
log is the whole domain, and auth would mean a server session, a stored identity and a
policies rewrite that nothing in the app reads. `category` stays free text because the
UI's label list is the thing that can be re-worded (ADR-0006); an enum column would
make that a schema change.

## Verify

```
grep -c 'IF NOT EXISTS exercises' supabase/migrations/*.sql        # -> 1
grep -c 'IF NOT EXISTS practice_sessions' supabase/migrations/*.sql # -> 1
grep -c 'REFERENCES exercises(id)' supabase/migrations/*.sql        # -> 1
grep -c 'ENABLE ROW LEVEL SECURITY' supabase/migrations/*.sql       # -> 2
grep -c 'DROP POLICY IF EXISTS' supabase/migrations/*.sql           # -> 8
grep -rc 'signUp\|signIn' src | awk -F: '{s+=$2} END {print s+0}'  # -> 0
```
