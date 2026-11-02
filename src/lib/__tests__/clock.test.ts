import { describe, expect, test } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DAY_MS, msUntilMidnight } from '@/lib/clock';

// Pure arithmetic over a clock handed in, like `period.test.ts`: nothing here reads
// `Date.now()`, so the wait cannot drift with the machine's timezone or with the
// hour the suite runs at. Dates are built from local calendar fields - the day-local
// clock the X axis plots, and the boundary the refresh turns on.
//
// The two rules the module states as code rather than prose: midnight is never a
// zero wait, and a sub-second wait is floored. Both are about one round trip per
// rollover, which is what a spinning timer would break.

// Local fields, so no zone is involved.
const day = (h: number, m = 0, s = 0, ms = 0) => new Date(2026, 10, 2, h, m, s, ms);

describe('the boundary is the next local midnight', () => {
  test('midday waits out the rest of the day', () => {
    expect(msUntilMidnight(day(13))).toBe(11 * 60 * 60 * 1000);
    expect(msUntilMidnight(day(13, 30))).toBe(10 * 60 * 60 * 1000 + 30 * 60 * 1000);
  });

  // Midnight is a full day away, never zero: a 0ms timer would fire the refresh and
  // reschedule another 0ms one, spinning the fetch against the database.
  test('exactly midnight is the next day, not the current one', () => {
    expect(msUntilMidnight(day(0))).toBe(DAY_MS);
    expect(msUntilMidnight(day(0, 0, 0, 0))).toBe(DAY_MS);
  });

  test('the wait stays inside one day whatever the hour is', () => {
    for (let h = 0; h < 24; h++) {
      const wait = msUntilMidnight(day(h, 30));
      expect(wait).toBeGreaterThan(0);
      expect(wait).toBeLessThanOrEqual(DAY_MS);
    }
  });

  // A hand a millisecond before the boundary would fire the refresh now and then
  // reschedule for one more millisecond: two round trips for one rollover. The floor
  // lands the single fire past midnight instead.
  test('a sub-second wait is floored, so the boundary fires once', () => {
    expect(msUntilMidnight(day(23, 59, 59, 999))).toBe(1000);
    expect(msUntilMidnight(day(23, 59, 59, 500))).toBe(1000);
  });

  test('the wait is a duration, not a wall-clock constant', () => {
    // The same hour on two different days is the same wait: a tab that reschedules
    // after each fire has to measure from the clock it was handed, not from a fixed
    // deadline a stale tab would fire on the day after.
    expect(msUntilMidnight(new Date(2026, 10, 1, 13))).toBe(msUntilMidnight(day(13)));
    expect(msUntilMidnight(new Date(2026, 10, 3, 13))).toBe(msUntilMidnight(day(13)));
  });
});

describe('one day, defined once', () => {
  // `period.ts` measures windows and this module measures the boundary; both are
  // counted in days, and the two agreeing is the claim. A second literal is the drift
  // that lets them say the same word at different sizes.
  const srcRoot = fileURLToPath(new URL('../../', import.meta.url));
  const sources = readdirSync(srcRoot, { recursive: true, encoding: 'utf8' })
    .filter((entry) => /\.(?:ts|tsx)$/.test(entry))
    .map((entry) => ({ path: entry, text: readFileSync(join(srcRoot, entry), 'utf8') }));

  test('the day constant is declared in exactly one module, and exported', () => {
    const declared = sources.filter((s) => /const DAY_MS = 24 \* 60 \* 60 \* 1000/.test(s.text));
    expect(declared.map((s) => s.path)).toStrictEqual(['lib/clock.ts']);
    expect(declared[0].text).toContain('export const DAY_MS');
  });

  test('every other module imports the day rather than spelling it again', () => {
    const spelled = sources.filter((s) => /24 \* 60 \* 60 \* 1000/.test(s.text)).map((s) => s.path);
    expect(spelled).toStrictEqual(['lib/clock.ts']);
  });
});
