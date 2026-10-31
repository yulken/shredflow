// Date formatting for the Dashboard chart's X axis and tooltips. Kept out of
// `ProgressChart.tsx` so the year rule can be checked without a React render.
//
// The legacy log is day-based (requirements §2: a Practice Log has a `Date`, no
// time), so neither label shows a clock time. The seeded rows carry an invented
// 12:00 UTC timestamp (`supabase/seed.sql`), which is another reason the hour is
// left out: it would display a value nobody logged.
//
// The year is shown only when it can change what the reader is looking at - i.e.
// when the plotted range spans more than one year. Today's whole log is 2026, so
// no label carries a year; once a log lands in 2027 both the ticks and the
// tooltips start showing it on their own, with nothing to change here.

import type { PracticeSession } from './supabase';

/** True when the sessions actually drawn on the chart cover more than one year.
 * The year is read in the browser's zone - the same zone `toLocaleDateString`
 * prints below - so a session that renders as Dec 31 locally counts as 2025 even
 * if its UTC timestamp is Jan 1. */
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
