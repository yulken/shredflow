import { describe, expect, test } from 'vitest';
import { BPM_FLOOR, bpmStep } from '@/lib/bpm';

// Scope: the BPM arithmetic ADR-0004 defined and ADR-0009 relocated next to its
// record (the `b + 1`, `b + 5`, `Math.max(1, b - 1)`, `Math.max(1, b - 5)`
// spellings). What is asserted is the step and the floor, not the click: the
// buttons' onClick wiring is ADR-0009's functional form in SessionView.tsx,
// which is a state-graph claim the runner cannot see through `useState`. The
// slider's own clamp (`Math.min(300, ...)`) and the `onChange` handlers stay
// out of scope, per ADR-0009's "stays in the component" table: 300 bounds the
// slider's travel, not `bpm`, and DOM input is not importable headlessly.

describe('bpmStep()', () => {
  test('the two upward steps are unbounded, as ADR-0004 wrote them', () => {
    expect(bpmStep(120, 1)).toBe(121);
    expect(bpmStep(120, 5)).toBe(125);
    expect(bpmStep(299, 5)).toBe(304);
  });

  test('the two downward steps floor at 1, as ADR-0004 wrote them', () => {
    expect(bpmStep(120, -1)).toBe(119);
    expect(bpmStep(120, -5)).toBe(115);
    // ADR-0004's bound, exactly: a step at or through the floor stays at it.
    expect(bpmStep(1, -1)).toBe(BPM_FLOOR);
    expect(bpmStep(1, -5)).toBe(BPM_FLOOR);
    expect(bpmStep(4, -5)).toBe(BPM_FLOOR);
  });

  test('an unrequested step takes the floored branch', () => {
    // The UI only ever asks for +/-1 and +/-5; every other step falls into the
    // `Math.max(BPM_FLOOR, bpm + step)` branch, which is what keeps the
    // helper total below the floor for a future caller.
    expect(bpmStep(10, 2)).toBe(12);
    expect(bpmStep(10, -50)).toBe(BPM_FLOOR);
    expect(bpmStep(0, -50)).toBe(BPM_FLOOR);
    expect(bpmStep(3, 0)).toBe(3);
  });
});

describe('BPM_FLOOR', () => {
  test('the exported bound is 1', () => {
    expect(BPM_FLOOR).toBe(1);
  });
});
