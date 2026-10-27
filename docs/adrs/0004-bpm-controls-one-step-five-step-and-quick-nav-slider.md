# ADR-0004: BPM controls - a +/-1 row, a +/-5 row, and a quick-nav slider

- **Status:** Accepted
- **Date:** 2026-10-26
- **Scope:** session screen UX (`SessionView` form), not the DB
- **Code:** `src/components/SessionView.tsx` (BPM input block, lines ~180-241,
  plus the inline `.bpm-slider` `<style>` block), keys `bpm_minus_one`,
  `bpm_plus_one`, `bpm_minus_five`, `bpm_plus_five`, `bpm_unit` in
  `src/lib/locales/en.ts`
- **Related:** ADR-0002 (`bpm integer` in `practice_sessions`), ADR-0006 (labels
  come from the i18n layer)

## Context

The session screen lets a guitarist report the tempo they reached, which is stored
as `practice_sessions.bpm` (an unbounded `integer` in the schema). The original UI
only had a step-by-one pair of buttons around a number field. Users need both fine
adjustment and fast jumps: practising at 180 BPM after saving at 60 should not take
120 taps, and a single control cannot serve both "one BPM at a time" and "jump
anywhere" without fighting the other.

## Decision

Three controls over one state variable (`const [bpm, setBpm] = useState(60)`), in
two rows:

1. **Precision row:** a `-1` button, the `<input type="number">`, a `+1` button.
   The button glyphs use U+2212 MINUS SIGN (`-1`), `aria-label` is the localized
   `bpm_minus_one` / `bpm_plus_one`. Lower bound is 1
   (`setBpm((b) => Math.max(1, b - 1))`); the number field's `onChange` clamps with
   `Math.max(1, parseInt(e.target.value, 10) || 0)`.
2. **Quick-nav row:** a `-5` button, an `<input type="range" min={1} max={300}>`, a
   `+5` button. The `+5`/`-5` steps are the coarse equivalent of five single steps.
   The slider's `onChange` rounds and clamps to 1..300; its current position is
   derived as `Math.min(300, bpm)` so the displayed thumb always reflects state.

The slider never owns state: it reads and re-derives `bpm`, and the number field
remains the authoritative display. The slider's filled track is an inline
`style` gradient:

```
linear-gradient(to right, #f04438 X%, #e5e7eb X%)
  where X = ((Math.min(300, bpm) - 1) / 299) * 100
```

`299` is `max - min` of the slider range and the same divisor is used in **both**
gradient stops, so the fill edge and the thumb position agree.

Thumb appearance (`::-webkit-slider-thumb`, `::-moz-range-thumb`) is written in an
inline `<style>` block inside the component, because pseudo-element rules cannot be
expressed as Tailwind utility classes.

## Alternatives considered

- **One slider only.** Rejected: dragging cannot land on an exact BPM, which is the
  number the user cares about, and it loses the keyboard-free one-BPM nudges.
- **One number spinner with no slider.** Rejected: it was the starting point and it
  makes large jumps tedious, which is the problem being solved.
- **A slider plus a keyboard-arrow pair.** Rejected over +/- buttons: buttons are
  discoverable on touch screens, where there is no arrow key.
- **`-5` and `+5` implemented as five repeated single steps.** Rejected: one
  interaction, not five, and the schema is unaffected either way.
- **Clamping every control to 1..300.** Rejected: only the slider is clamped at
  300, so `bpm` can legitimately go above it; the slider then pins to its right end
  via `Math.min(300, bpm)` while the number field still shows the true value.

## Consequences

- One variable keeps the three controls consistent: no second "slider value" state
  can drift away from the saved `bpm`.
- `bpm` has no UI upper bound, matching the schema, which also has no upper
  bound on `bpm`. The only 300 in the UI is the slider's travel, not a limit on
  what can be recorded.
- The lower bound of 1 (not 0) is applied consistently to every control, so 0
  cannot be saved even though the schema would allow it.
- Labels live in the locale dictionaries, so the four buttons localize for free
  (ADR-0006); the glyphs themselves are language-independent typographic
  characters and deliberately stay in the component.
- The inline `<style>` block ships per render rather than in `src/index.css`. That
  is a small duplication of CSS in exchange for keeping the slider's styling next
  to the control that uses it.
