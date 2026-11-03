// Date labels for the Dashboard chart's X axis and tooltips, kept out of
// `ProgressChart.tsx` so the year rule is checkable without a React render. A log is
// a day, not a moment (requirements §2), so no label carries a clock time; the year
// appears only when the plotted range spans more than one year.

/** True when the rows actually drawn cover more than one year. The year is read
 * in the browser's zone, the same one `toLocaleDateString` prints below. Anything
 * with a `created_at` counts: practice sessions and song logs both plot a day. */
export function spansMultipleYears(logs: { created_at: string }[]): boolean {
  return new Set(logs.map((s) => new Date(s.created_at).getFullYear())).size > 1;
}

// Which side the locale puts the month. `formatToParts` is the only thing that says
// so, and the app must not name locales to find out, so the answer is read from the
// locale itself and remembered.
const monthFirstCache = new Map<string, boolean>();

function monthFirst(locale: string): boolean {
  const cached = monthFirstCache.get(locale);
  if (cached !== undefined) return cached;
  const parts = new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit' }).formatToParts(new Date(0));
  const month = parts.findIndex((p) => p.type === 'month');
  const day = parts.findIndex((p) => p.type === 'day');
  const first = month >= 0 && day >= 0 && month < day;
  monthFirstCache.set(locale, first);
  return first;
}

/** X-axis tick label: the day and the month as digits, in the order the locale uses
 * (`09/14` where the month leads, `14/09` where the day leads), plus the year only
 * across a year boundary. Both fields are padded, so the ticks line up in columns
 * and the axis stays readable without spelling a month name. */
export function tickDateLabel(value: number | Date, locale: string, withYear: boolean): string {
  const date = new Date(value);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const pair = monthFirst(locale) ? `${month}/${day}` : `${day}/${month}`;
  return withYear ? `${pair}/${date.getFullYear()}` : pair;
}

/** Tooltip title: the day the session was logged, padded, plus the year on the
 * same condition as the ticks. */
export function tooltipDateLabel(value: number | Date, locale: string, withYear: boolean): string {
  const opts: Intl.DateTimeFormatOptions = withYear
    ? { day: '2-digit', month: 'short', year: 'numeric' }
    : { day: '2-digit', month: 'short' };
  return new Date(value).toLocaleDateString(locale, opts);
}
