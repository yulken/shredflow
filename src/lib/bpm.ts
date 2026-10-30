// BPM step arithmetic for the session screen's four buttons. The value
// itself stays in the component; only the arithmetic lives here, so that the
// bounds can be checked without a React render.
export const BPM_FLOOR = 1;

export function bpmStep(bpm: number, step: number): number {
  // The two upward steps are unbounded: `b + 1`, `b + 5`.
  if (step === 1 || step === 5) return bpm + step;
  // The two downward steps floor at 1: `Math.max(1, b - 1)`,
  // `Math.max(1, b - 5)`. Any other step is floored too, defensively.
  return Math.max(BPM_FLOOR, bpm + step);
}

// Real BPM (requirements §4): the speed actually played is the metronome BPM
// multiplied by the notes played per click. The same product is computed
// server-side by the `sync_exercise_bpm_records` trigger in
// `supabase/migrations/20261028120000_add_practice_fields.sql`
// (`COALESCE(NEW.bpm, 0) * COALESCE(NEW.clicks_per_beat, 1)`), which writes it
// into `exercises.max_bpm`/`last_bpm`. Both columns carry a NOT NULL default, so
// the arithmetic here is the bare product; keep the two in lockstep.
export function realBpm(bpm: number, clicksPerBeat: number): number {
  return bpm * clicksPerBeat;
}
