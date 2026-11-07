// Chart period windows, kept out of the components so the arithmetic is checkable
// without a React render. A window rolls from the clock it is handed, never from the
// newest log, and it filters points only: the catalog's Max/Last stay the trigger's
// stored records.

import { DAY_MS } from './clock';
import type { PracticeSession } from './supabase';

export type Period = 'month' | 'quarter' | 'year' | 'all';

// Order is the order the control renders its buttons in: shortest window first.
export const PERIODS: Period[] = ['month', 'quarter', 'year', 'all'];

// 'all' is the default so the landing view stays the whole log, which is what
// acceptance criterion 2 compares against the legacy spreadsheet.
export const DEFAULT_PERIOD: Period = 'all';

export const PERIOD_LABEL_KEYS: Record<Period, string> = {
  month: 'period_month',
  quarter: 'period_quarter',
  year: 'period_year',
  all: 'period_all',
};

export const PERIOD_STORAGE_KEY = 'chart_period';

// Rolling day counts. A quarter is 90 days rather than a calendar quarter: the
// window is a duration, so it keeps the same length whatever month it lands in.
const WINDOW_DAYS: Record<Exclude<Period, 'all'>, number> = { month: 30, quarter: 90, year: 365 };

export function isPeriod(value: unknown): value is Period {
  return typeof value === 'string' && (PERIODS as string[]).includes(value);
}

/** The oldest timestamp the period keeps, or null when the period is 'all'. */
export function periodCutoff(period: Period, now: Date): Date | null {
  if (period === 'all') return null;
  return new Date(now.getTime() - WINDOW_DAYS[period] * DAY_MS);
}

/** A session exactly at the cutoff is kept: the window includes its own start. */
export function withinPeriod(created_at: string, period: Period, now: Date): boolean {
  const cutoff = periodCutoff(period, now);
  if (cutoff === null) return true;
  return new Date(created_at).getTime() >= cutoff.getTime();
}

/** Keeps the input's order; sorting the series stays the chart's job. */
export function filterSessions(sessions: PracticeSession[], period: Period, now: Date): PracticeSession[] {
  return sessions.filter((s) => withinPeriod(s.created_at, period, now));
}

export type AxisDomain = { min: Date; max: Date };

/** The boundary `now`'s local day ends on - the next midnight, an exclusive bound, the
 * same one `msUntilMidnight` turns the log on. Not the edge the scale is given: see
 * `axisDomain`, which keeps the axis inside the day. A log is a day rather than a
 * moment (requirements §3.2), so a session written at 23:00 today has to land inside
 * the plot, which this boundary measures and `now` itself would not. */
export function axisMax(now: Date): Date {
  const end = new Date(now);
  // `setHours(24, 0, 0, 0)` is the day's own end.
  end.setHours(24, 0, 0, 0);
  return end;
}

/** The X axis spans the days actually plotted up to the end of today - whichever of the
 * two is later, so the scale always holds what is drawn on it. An idle stretch therefore
 * shows as a gap at the right edge instead of making the last session look like the
 * current day. The right edge stays inside today (`axisMax` is where the day turns over,
 * not where the axis stops). The left edge stays on the oldest point on purpose: the
 * period control filters the points plotted, it does not draw a fixed frame around them,
 * and a window that starts before the first practice would spend its width on empty
 * axis. */
export function axisDomain(drawn: { created_at: string }[], now: Date): AxisDomain {
  // The last instant of today, so the edge belongs to today. `axisMax(now)` itself would
  // put the axis on the midnight that opens the next day, and the time scale adds a tick
  // at the axis maximum whenever that maximum falls on one of its unit boundaries: a
  // Friday ending at Sunday's midnight printed `08/11` - a day with nothing on it - and
  // the first of a month does the same to the monthly unit. One millisecond short of the
  // boundary is the farthest the axis may reach without standing for an unarrived day.
  const edge = axisMax(now).getTime() - 1;
  const times = drawn.map((d) => new Date(d.created_at).getTime());
  // With nothing plotted there is no canvas to size - the empty state replaces it -
  // so the degenerate domain only has to be a valid one. Chart.js keeps `min < max`.
  if (times.length === 0) return { min: new Date(edge), max: new Date(edge) };
  const newest = Math.max(...times);
  return {
    min: new Date(Math.min(...times)),
    // The domain has to hold every point drawn. A row stamped past today - the schema's
    // `now()` is the database's clock, which near midnight can sit ahead of the
    // browser's - would otherwise fall outside the scale and be clipped off the canvas
    // instead of sitting at the edge. A label it puts at the edge then names a day that
    // has a point on it, which is the only kind of day the axis should name.
    max: new Date(Math.max(edge, newest)),
  };
}

/** The days the axis wording is read from: the points drawn plus today. The domain
 * now reaches today whatever the points do, so a rule that only saw the points would
 * describe an axis it no longer draws - a log that stops in December keeps printing
 * no year while the plotted area runs into January. The anchor is `now` rather than
 * `axisMax(now)`: a 90-day window measured to the day's end reads as 90.x days and
 * `tickUnit` would answer `month` over a quarter, which its 90-day line was not
 * drawn for. */
export function axisDays(drawn: { created_at: string }[], now: Date): { created_at: string }[] {
  return [...drawn, { created_at: now.toISOString() }];
}

export type TickUnit = 'week' | 'month' | 'quarter';

/** Tick unit for the X axis, derived from the days the axis covers: Chart.js draws
 * one grid line per tick, so the unit grows with the window. `week` keeps the Sunday
 * alignment the date-fns adapter's `week` start gives (`weekStartsOn: 0`). Both the
 * BPM chart and the percent chart plot days, so any row with a `created_at` feeds it -
 * including the anchor day `axisDays` appends, which the axis reaches whatever the
 * points do. */
export function tickUnit(drawn: { created_at: string }[]): TickUnit {
  if (drawn.length === 0) return 'week';
  const times = drawn.map((s) => new Date(s.created_at).getTime());
  const days = (Math.max(...times) - Math.min(...times)) / DAY_MS;
  if (days <= 90) return 'week'; // a month: ~5 lines; a quarter: ~13
  if (days <= 730) return 'month'; // a year: 12 lines instead of 52 weekly ones
  return 'quarter'; // multi-year history: 4 lines a year
}
