# ADR-0005: Three tension levels over the DB's 1-10 integer scale

- **Status:** Accepted
- **Date:** 2026-10-26
- **Scope:** session screen UX and the display of already-stored rows; the DB is
  unchanged
- **Code:** `src/components/SessionView.tsx` (`tensionTier`, `tensionLabel`,
  `tensionColor`, the selector block at lines ~148-176, the tier bar in the
  history list at lines ~355-375), keys `tension_label`, `tension_low`,
  `tension_medium`, `tension_high` in `src/lib/locales/en.ts`,
  `supabase/migrations/20261026230024_create_guitar_practice_tables.sql`
- **Related:** ADR-0002 (`tension_level` column and its `CHECK`), ADR-0006 (labels
  are localized), ADR-0012 (the same index-mapped-label idea, for categories)

## Context

The schema stores self-reported string tension as
`tension_level integer NOT NULL DEFAULT 5 CHECK (tension_level >= 1 AND tension_level <= 10)`,
an eleven-value scale. Eleven buttons are too many for a session screen a guitarist
taps with wet hands, and the number itself carries no meaning to the user: nobody
decides between "6" and "7" of tension. What the user actually wants to say is
"loose", "medium" or "tight". The scale also has to keep accepting values it has
already stored, so the UI cannot simply become a three-option enum column.

## Decision

Keep the 1-10 integer scale as the storage format and show three named levels on
top of it.

1. **State is an integer on the DB scale.** `const [tension, setTension] = useState(5)`.
   The default is 5, which matches the DB default and is the middle display tier.
2. **The selector offers exactly three buttons**, generated from the literal
   `[1, 5, 10].map((level) => ...)`. Clicking one calls `setTension(level)`, so the
   three levels are stored as 1, 5 and 10 - the low end, midpoint and high end of
   the scale, not 1/2/3.
3. **Tier boundaries are a display function**, `tensionTier(level)`:
   `level <= 3` -> tier 1, `level <= 6` -> tier 2, otherwise tier 3. Tiers are 1-based
   because they are compared with `<=` in the history bar.
4. **Labels come from the locale dictionaries** through `tensionLabel`, keyed by tier
   (`tension_low` / `tension_medium` / `tension_high`). Colors follow the same tier
   split: `text-accent-500`, `text-amber-500`, `text-brand-500`.
5. **Both views use the same functions.** The current-session header shows
   `tensionLabel(tension)`, and each history row shows `tensionLabel(session.tension_level)`
   plus a tier bar filled by `tier <= tensionTier(session.tension_level)`. Old rows
   that hold values the selector can no longer produce (e.g. 7) still render correctly,
   because tiering is a function of the stored number, not of a stored tier.
6. **Session reset re-applies the default** with `setTension(5)` rather than a tier
   constant, so resetting lands on the same value the schema would have chosen.

## Alternatives considered

- **Change the column to a three-value enum (or a `text` level).** Rejected: it
  would require a new migration against existing `practice_sessions` rows, and the
  finer scale is what makes the recorded `avg`/`max` style statistics meaningful. The
  DB is intentionally left as it was.
- **Store the tiers as 1, 2, 3 in the same column.** Rejected: `CHECK (tension_level >= 1 AND tension_level <= 10)`
  would accept them, so the damage would be silent - already-stored 7s would then
  be indistinguishable from "high", and the DB default of 5 would fall outside the
  tier vocabulary. Storing 1/5/10 keeps every UI-produced value inside the same
  meaning the schema's default already implies.
- **Nine or eleven buttons.** Rejected: the user cannot calibrate that finely, and it
  crowds the session screen.
- **A tier-only UI with no integer anywhere.** Rejected: the raw value is displayed and
  reused by the history view and the form's `tension_level:` payload, and dropping it
  would break reading rows saved before this decision.
- **A slider for tension** (as BPM has one, ADR-0004). Rejected: the input is
  categorical, so a slider would offer ten positions the user cannot tell apart.

## Consequences

- The 1-10 range stays the contract; nothing in `supabase/migrations/` changes, and
  hand-entered or legacy values (2, 4, 7, 9) tier cleanly.
- Three tiers can be drawn as a three-segment bar and read at a glance; the tier, the
  color and the label never disagree, because all three are derived from one function.
- Tier boundaries (3 and 6) live in the component, not in the schema. Changing them is
  a one-line display change that silently changes the meaning of already-saved data -
  the reason those numbers are written down here.
- The `CHECK` permits 1-10, but the UI can only produce 1, 5 and 10. Widening the
  selector is a UI change; narrowing the schema is not, and is deliberately out of scope.
- Because tiering is derived at render time, deleting this component's numbers does not
  invalidate stored data - there is no second copy of the tier to keep in sync.

## Verification

- `tensionTier` returns 1/2/3 for the ranges implied above, and 5 is inside tier 2, so
  the default state and the DB default render the same label.
- `grep -n '\[1, 5, 10\]\|useState(5)\|setTension(5)' src/components/SessionView.tsx`
  returns lines 12, 50 and 159, which is the state, the reset, and the three-option
  selector.
- The schema line `tension_level integer NOT NULL DEFAULT 5 CHECK (tension_level >= 1 AND tension_level <= 10)`
  is present unchanged in the migration.
- `npm run typecheck` and `npm run build` pass with the selector and tier bar in place.
