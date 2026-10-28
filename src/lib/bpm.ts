// BPM step arithmetic for the session screen's four buttons (ADR-0004). The value
// itself stays in the component; only the arithmetic lives here, so that the bounds
// can be checked without a React render (ADR-0009).
export const BPM_FLOOR = 1;

export function bpmStep(bpm: number, step: number): number {
  // The two upward steps are unbounded, as ADR-0004 wrote them: `b + 1`, `b + 5`.
  if (step === 1 || step === 5) return bpm + step;
  // The two downward steps floor at 1, as ADR-0004 wrote them: `Math.max(1, b - 1)`,
  // `Math.max(1, b - 5)`. Any other step is floored too, defensively.
  return Math.max(BPM_FLOOR, bpm + step);
}
