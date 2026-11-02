// The day boundary the dashboard refreshes on. Kept out of the components so the
// arithmetic is checkable without a React render, like `src/lib/period.ts`.
//
// A practice log is a day, not a moment (requirements 3.2), and the chart plots the
// logged day, so the boundary the data turns on is local midnight. That is the
// refresh the dashboard needs: a poll would spend a request every few minutes to
// notice a change the data model only allows once a day.
//
// The clock is handed in rather than read here, so no test drifts with the machine's
// timezone or with the hour the suite happens to run at.
const MIN_DELAY_MS = 1000;

/** Milliseconds from `now` until the next local midnight, never below 1s. */
export function msUntilMidnight(now: Date): number {
  // `setHours(24, 0, 0, 0)` names the day's own end, which is the next local
  // midnight: it measures against the day-local clock the X axis plots, where UTC
  // arithmetic would land on a boundary no label on screen agrees with.
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  // A hand that lands just before midnight would otherwise fire the refresh now and
  // reschedule a sub-second timer for the boundary itself - two round trips for one
  // rollover. The floor makes the boundary fire once.
  return Math.max(next.getTime() - now.getTime(), MIN_DELAY_MS);
}
