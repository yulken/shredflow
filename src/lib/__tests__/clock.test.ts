import { describe, expect, test } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DAY_MS, isSameLocalDay, msUntilMidnight } from '@/lib/clock';

// Pure arithmetic over a clock handed in, like `period.test.ts`: nothing here reads
// `Date.now()`, so the wait cannot drift with the machine's timezone or with the
// hour the suite runs at. Dates are built from local calendar fields - the day-local
// clock the X axis plots, and the boundary the refresh turns on.
//
// The rules the module states as code rather than prose: midnight is never a
// zero wait, a sub-second wait is floored, and a session's day is the local
// calendar day. All three are about one record per day - the first two keep the
// rollover to a single refresh, the third is what turns a second save on the same
// day into an edit of the day's row. Both boundary rules are about one round trip
// per rollover, which is what a spinning timer would break.

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

// `SessionView` asks this which row is today's: the row it may rewrite is the one
// logged today, and a second save on the same day must not become a second record.
describe('one session belongs to one local day', () => {
  // The day is read off the calendar fields, not off an elapsed duration: the two
  // ends of a day are still the same day, and two moments two hours apart that
  // straddle midnight are not.
  test('the whole day is one day, whatever the hour apart', () => {
    expect(isSameLocalDay(day(0), day(23, 59, 59, 999))).toBe(true);
    expect(isSameLocalDay(day(13), day(13))).toBe(true);
  });

  // Midnight is the boundary the rollover fires on, so it is also the boundary the
  // day's row stops being today's.
  test('a moment past midnight is the next day', () => {
    expect(isSameLocalDay(day(23, 59, 59, 999), new Date(2026, 10, 3, 0, 0, 0, 0))).toBe(false);
    expect(isSameLocalDay(day(13), new Date(2026, 10, 1, 13))).toBe(false);
  });

  // The fields compared are year, month and day: the same calendar day in another
  // year is another day, so a stale row cannot pass as today's.
  test('the year is part of the day, not just the month and the day', () => {
    expect(isSameLocalDay(day(13), new Date(2025, 10, 2, 13))).toBe(false);
    expect(isSameLocalDay(day(13), new Date(2026, 9, 2, 13))).toBe(false);
  });

  // Which of the two is `now` is not the question - the screen compares a row's
  // timestamp against the clock, in either reading order.
  test('the comparison is symmetric', () => {
    const row = new Date('2026-11-02T18:30:00');
    expect(isSameLocalDay(row, day(9))).toBe(isSameLocalDay(day(9), row));
    expect(isSameLocalDay(row, new Date(2026, 10, 3))).toBe(isSameLocalDay(new Date(2026, 10, 3), row));
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
