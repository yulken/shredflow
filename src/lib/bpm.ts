// BPM arithmetic for the session screen, kept out of the component so the bounds are
// checkable without a React render. The BPM value itself stays in `SessionView`.
export const BPM_FLOOR = 1;

export function bpmStep(bpm: number, step: number): number {
  // The two upward steps are unbounded; the two downward ones floor at 1, and so
  // does any other step, defensively.
  if (step === 1 || step === 5) return bpm + step;
  return Math.max(BPM_FLOOR, bpm + step);
}

/** Real BPM (requirements §4): metronome BPM times notes per click. The same product
 * is computed server-side by the `sync_exercise_bpm_records` trigger in
 * `supabase/migrations/20261028120000_add_practice_fields.sql`; spelled twice on
 * purpose, and `bpm.test.ts` pins both to one product. */
export function realBpm(bpm: number, clicksPerBeat: number): number {
  return bpm * clicksPerBeat;
}
