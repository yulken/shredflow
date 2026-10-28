# ADR-0005: Three tension levels shown over the 1-10 integer scale stored

- **Status:** Accepted
- **Date:** 2026-10-26

## Rule

1. Tension is stored as the DB's `tension_level`, an integer from 1 to 10 with a
   `CHECK`, and the three named levels are derived at read time, never stored.
2. `tensionTier` maps 1-3 to tier 1, 4-6 to tier 2 and 7-10 to tier 3; tier 1 is the
   loose end of the scale and tier 3 the tight end.
3. A tier is shown as a localized label key and one of three text colors, both chosen
   by index.
4. That arithmetic lives in `src/lib/tension.ts` so it can be checked without a DOM.

## Decision

Keep the eleven-value scale as storage and render three names over it. Users say
"loose", "medium" or "tight", not "6" versus "7", but the schema must keep accepting
values it already stored, so an enum column was rejected. The split at 3 and 6 was
chosen because it puts the default value 5 in the middle tier.

## Verify

```
grep -c 'tension_level >= 1' supabase/migrations/*.sql     # -> 1
grep -c 'tension_level <= 10' supabase/migrations/*.sql    # -> 1
grep -c 'export function tensionTier' src/lib/tension.ts   # -> 1
grep -c "if (level <= 3) return 1" src/lib/tension.ts      # -> 1
grep -c 'tension_low' src/lib/locales/en.ts                # -> 1
grep -c 'text-amber-500' src/lib/tension.ts                # -> 1
```
