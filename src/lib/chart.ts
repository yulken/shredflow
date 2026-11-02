// Date labels for the Dashboard chart's X axis and tooltips, kept out of
// `ProgressChart.tsx` so the year rule is checkable without a React render. A log is
// a day, not a moment (requirements §2), so no label carries a clock time; the year
// appears only when the plotted range spans more than one year.

import type { PracticeSession } from './supabase';

/** True when the sessions actually drawn cover more than one year. The year is read
 * in the browser's zone, the same one `toLocaleDateString` prints below. */
export function spansMultipleYears(sessions: PracticeSession[]): boolean {
  return new Set(sessions.map((s) => new Date(s.created_at).getFullYear())).size > 1;
}

/** X-axis tick label: month + day, plus the year only across a year boundary.
 * Unpadded day (`14 Sep`, not `14 Sep`) so the weekly ticks stay compact. */
export function tickDateLabel(value: number | Date, locale: string, withYear: boolean): string {
  const opts: Intl.DateTimeFormatOptions = withYear
    ? { month: 'short', day: 'numeric', year: 'numeric' }
    : { month: 'short', day: 'numeric' };
  return new Date(value).toLocaleDateString(locale, opts);
}

/** Tooltip title: the day the session was logged, padded, plus the year on the
 * same condition as the ticks. */
export function tooltipDateLabel(value: number | Date, locale: string, withYear: boolean): string {
  const opts: Intl.DateTimeFormatOptions = withYear
    ? { day: '2-digit', month: 'short', year: 'numeric' }
    : { day: '2-digit', month: 'short' };
  return new Date(value).toLocaleDateString(locale, opts);
}
