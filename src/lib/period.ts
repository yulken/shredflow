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

export type TickUnit = 'week' | 'month' | 'quarter';

/** Tick unit for the X axis, derived from the points actually drawn: Chart.js draws
 * one grid line per tick, so the unit grows with the window. `week` keeps the Sunday
 * alignment the date-fns adapter's `week` start gives (`weekStartsOn: 0`). Both the
 * BPM chart and the percent chart plot days, so any row with a `created_at` feeds it. */
export function tickUnit(drawn: { created_at: string }[]): TickUnit {
  if (drawn.length === 0) return 'week';
  const times = drawn.map((s) => new Date(s.created_at).getTime());
  const days = (Math.max(...times) - Math.min(...times)) / DAY_MS;
  if (days <= 90) return 'week'; // a month: ~5 lines; a quarter: ~13
  if (days <= 730) return 'month'; // a year: 12 lines instead of 52 weekly ones
  return 'quarter'; // multi-year history: 4 lines a year
}
