import { describe, expect, test } from 'vitest';
import { msUntilMidnight } from '@/lib/day';

// Pure arithmetic over a clock handed in, like `period.test.ts`: nothing here reads
// `Date.now()`, so the wait cannot drift with the machine's timezone or with the
// hour the suite happens to run at. Dates are built from local calendar fields,
// which is the day-local clock the chart's X axis plots - the boundary the refresh
// is measured against is the same one the labels on screen turn on.

const DAY = 24 * 60 * 60 * 1000;
// One ordinary day, and an hour on it: local fields, so no zone is involved.
const day = (h: number, m = 0, s = 0, ms = 0) => new Date(2026, 10, 2, h, m, s, ms);

describe('the boundary is the next local midnight', () => {
  test('midday waits out the rest of the day', () => {
    expect(msUntilMidnight(day(13))).toBe(11 * 60 * 60 * 1000);
    expect(msUntilMidnight(day(13, 30))).toBe(10 * 60 * 60 * 1000 + 30 * 60 * 1000);
  });

  // Midnight is a full day away, never zero: a 0ms timer would fire the refresh and
  // reschedule another 0ms one, spinning the fetch against the database.
  test('exactly midnight is the next day, not the current one', () => {
    expect(msUntilMidnight(day(0))).toBe(DAY);
    expect(msUntilMidnight(day(0, 0, 0, 0))).toBe(DAY);
  });

  test('the wait stays inside one day whatever the hour is', () => {
    for (let h = 0; h < 24; h++) {
      const wait = msUntilMidnight(day(h, 30));
      expect(wait).toBeGreaterThan(0);
      expect(wait).toBeLessThanOrEqual(DAY);
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
