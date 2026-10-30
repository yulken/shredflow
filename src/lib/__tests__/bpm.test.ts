import { describe, expect, test } from 'vitest';
import { BPM_FLOOR, bpmStep, realBpm } from '@/lib/bpm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Scope: the BPM arithmetic as it lives in `src/lib` (the `b + 1`, `b + 5`,
// `Math.max(1, b - 1)`, `Math.max(1, b - 5)` spellings, and the `bpm × clicks`
// product). What is asserted is the step and the floor, not the click: the
// buttons' onClick wiring is a state-graph claim the runner cannot see through
// `useState`. The slider's own clamp (`Math.min(300, ...)`) and the `onChange`
// handlers stay out of scope: 300 bounds the slider's travel, not `bpm`, and
// DOM input is not importable headlessly.
//
// `realBpm()` is asserted twice, from two ends: the TS product is checked
// numerically, and the SQL product in the Supabase migration is checked
// structurally, against the source text rather than by running Postgres. That
// guard is what the "one formula, two implementations" claim buys: the trigger
// owns `exercises.max_bpm`/`last_bpm` (requirements §4/§5), so a drift between
// the two spellings is caught here instead of silently corrupting the chart.

describe('bpmStep()', () => {
  test('the two upward steps are unbounded', () => {
    expect(bpmStep(120, 1)).toBe(121);
    expect(bpmStep(120, 5)).toBe(125);
    expect(bpmStep(299, 5)).toBe(304);
  });

  test('the two downward steps floor at 1', () => {
    expect(bpmStep(120, -1)).toBe(119);
    expect(bpmStep(120, -5)).toBe(115);
    // The floor, exactly: a step at or through the floor stays at it.
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

describe('realBpm()', () => {
  test('one click per beat is the identity', () => {
    // The default the schema gives legacy rows, so old logs keep their stored
    // `bpm` as their Real BPM.
    expect(realBpm(120, 1)).toBe(120);
    expect(realBpm(BPM_FLOOR, 1)).toBe(BPM_FLOOR);
  });

  test('the multipliers the spec lists', () => {
    // requirements §2 gives 1, 2, 4 and 6 as the clicks-per-beat examples.
    expect(realBpm(100, 2)).toBe(200);
    expect(realBpm(100, 4)).toBe(400);
    expect(realBpm(100, 6)).toBe(600);
  });

  test('it is the bare product, so the factors commute', () => {
    expect(realBpm(75, 4)).toBe(realBpm(4, 75));
    expect(realBpm(75, 4)).toBe(75 * 4);
  });

  test('it has no floor, unlike bpmStep', () => {
    // The guard lives in the schema (`clicks_per_beat >= 1`), not here; a
    // caller that ignores it gets the honest product.
    expect(realBpm(120, 0)).toBe(0);
  });
});

describe('the SQL counterpart of realBpm()', () => {
  const sql = readFileSync(
    fileURLToPath(
      new URL(
        '../../../supabase/migrations/20261028120000_add_practice_fields.sql',
        import.meta.url,
      ),
    ),
    'utf8',
  );

  test('the trigger multiplies the two session columns', () => {
    // Written against `NEW.`, the row alias the AFTER INSERT trigger sees.
    expect(/NEW\.bpm\b[^;]*\*[^;]*NEW\.clicks_per_beat\b/.test(sql)).toBe(true);
  });

  test('the seeding UPDATE uses the same product', () => {
    // Same arithmetic, unqualified columns: legacy rows carry the default 1.
    expect(/bpm\b[^;]*\*[^;]*clicks_per_beat\b/.test(sql)).toBe(true);
  });

  test('the result is written to both stored records', () => {
    // `GREATEST` keeps the larger value, a bare assignment overwrites `last`.
    expect(/SET max_bpm = GREATEST\(max_bpm, real_bpm_value\)/.test(sql)).toBe(true);
    expect(/last_bpm = real_bpm_value/.test(sql)).toBe(true);
  });
});
