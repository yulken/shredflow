# ADR-0004: BPM controls - a one-step row and a five-step row over a slider

- **Status:** Accepted
- **Date:** 2026-10-26

## Rule

1. The session screen's tempo is one piece of state, `bpm`, that four controls share:
   a `-1`/`+1` row of number input and a `-5`/`+5` row of range input.
2. The two coarse steps are exactly five single steps; the downward steps floor at
   `BPM_FLOOR`, and the upward steps are unbounded.
3. The range input never owns the value: it reads and re-derives `bpm`, and the number
   field stays authoritative.
4. The step arithmetic lives in `src/lib/bpm.ts` so the bounds can be checked without a
   render.

## Decision

Two rows rather than one control, because one control cannot serve both "move one BPM"
and "jump from 60 to 180" without fighting the other. The slider is rejected as a
state owner: it cannot represent a value outside its `min`/`max`, so a slider that
owned `bpm` would silently clamp a stored number. The floor at 1 is kept in arithmetic
(`Math.max(BPM_FLOOR, bpm + step)`) while the glyph uses U+2212 MINUS SIGN and the
`aria-label` is the localized `bpm_minus_one` / `bpm_plus_one`.

## Verify

```
grep -c 'export const BPM_FLOOR = 1' src/lib/bpm.ts        # -> 1
grep -rc "from '@/lib/bpm'" src | awk -F: '{s+=$2} END {print s+0}'   # -> 2
grep -c 'type="range"' src/components/SessionView.tsx      # -> 1
grep -c 'max={300}' src/components/SessionView.tsx         # -> 1
grep -c 'bpm_minus_one' src/lib/locales/en.ts              # -> 1
```
