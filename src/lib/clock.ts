// Clock rules for a day-based log (requirements §3.2: a session is a day, not a
// moment). Each rule takes the clock as an argument, so no test drifts with the
// machine's zone - the same reason these stay out of the components. `DAY_MS` is
// shared with the chart windows (`period.ts`).
export const DAY_MS = 24 * 60 * 60 * 1000;

const MIN_DELAY_MS = 1000;

/** Milliseconds from `now` to the next local midnight - the boundary the log turns
 * on, day-local like the chart's X axis. Floored at 1s so a hand landing just before
 * midnight fires the refresh once rather than now and again at the boundary. */
export function msUntilMidnight(now: Date): number {
  // `setHours(24, 0, 0, 0)` is the day's own end, which is the next midnight.
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return Math.max(next.getTime() - now.getTime(), MIN_DELAY_MS);
}

/** Whether two moments fall on the same local calendar day - the unit a session is
 * logged in. The comparison is on the calendar fields rather than on an instant, so
 * a 23:59 row and a 00:01 row never count as one day, and the machine's zone is the
 * zone the user practices in, the same one `msUntilMidnight` turns on. */
export function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
