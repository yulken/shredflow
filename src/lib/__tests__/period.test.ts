import { describe, expect, test } from 'vitest';
import { axisDays, axisDomain, axisMax, DEFAULT_PERIOD, PERIODS, PERIOD_LABEL_KEYS, filterSessions, isPeriod, periodCutoff, tickUnit, withinPeriod } from '@/lib/period';
import { spansMultipleYears } from '@/lib/chart';
import { DAY_MS, isSameLocalDay, msUntilMidnight } from '@/lib/clock';
import { getLang, setLang, t } from '@/lib/i18n';
import type { PracticeSession } from '@/lib/supabase';

// Pure arithmetic: the window is a duration measured against a clock passed in,
// so nothing here reads `Date.now()` and no test can drift with the machine's
// timezone. The axis domain is measured off the same clock; where its answer is a
// local day boundary, the assertions read the local calendar fields and the distance
// to `msUntilMidnight` rather than a spelled-out UTC instant, for the same reason.
// Storage lives in `src/hooks/useChartPeriod.ts`, outside this suite,
// the same way the language's `localStorage` chain stays out of `i18n.test.ts`.

const NOW = new Date('2026-10-31T12:00:00Z');

const session = (created_at: string): PracticeSession => ({
  id: 's1',
  user_id: null,
  exercise_id: 'e1',
  tension_level: 2,
  bpm: 100,
  clicks_per_beat: 2,
  notes: null,
  created_at,
});

// Noon timestamps, as the seeded rows in the local database use them: the same
// calendar day under any client zone, so the boundaries below are not zone-sensitive.
const LOG = [
  session('2026-09-14T12:00:00Z'), // 47 days back: outside a month, inside a quarter
  session('2026-09-30T12:00:00Z'), // 31 days back: one day outside a month
  session('2026-10-01T12:00:00Z'), // exactly 30 days back: the month's own start
  session('2026-10-26T12:00:00Z'),
  session('2025-11-02T12:00:00Z'), // inside a year
  session('2023-12-31T12:00:00Z'), // outside every window
];

describe('the control visits each window once', () => {
  test('the four periods are the whole set, shortest first', () => {
    expect(PERIODS).toStrictEqual(['month', 'quarter', 'year', 'all']);
    expect(new Set(PERIODS).size).toBe(PERIODS.length);
  });

  test('every window has a label key that resolves in all three dictionaries', () => {
    // Structural only: nothing quotes a translated word. A key added to one
    // dictionary without its two translations fails here and in locales.test.ts.
    const previous = getLang();
    try {
      for (const code of ['en', 'pt', 'es']) {
        setLang(code);
        for (const period of PERIODS) {
          const label = t(PERIOD_LABEL_KEYS[period]);
          expect(label.length).toBeGreaterThan(0);
          expect(label).not.toBe(PERIOD_LABEL_KEYS[period]);
        }
      }
    } finally {
      setLang(previous);
    }
  });

  test('the landing view is the whole log', () => {
    // Acceptance criterion 2 compares the chart against the legacy spreadsheet,
    // so the default has to be the full history, not a trimmed window.
    expect(DEFAULT_PERIOD).toBe('all');
  });
});

describe('isPeriod validates what storage can hand back', () => {
  test('the four names are accepted, in their own spelling', () => {
    for (const period of PERIODS) expect(isPeriod(period)).toBe(true);
  });

  test('anything else is rejected, including near misses', () => {
    for (const value of ['week', 'MONTH', 'all ', '', 'days', undefined, null, 3, {}]) {
      expect(isPeriod(value)).toBe(false);
    }
  });
});

describe('the windows roll from the clock, not from the newest log', () => {
  test('each window is the day count its label names', () => {
    expect(periodCutoff('month', NOW)?.toISOString()).toBe('2026-10-01T12:00:00.000Z');
    expect(periodCutoff('quarter', NOW)?.toISOString()).toBe('2026-08-02T12:00:00.000Z');
    expect(periodCutoff('year', NOW)?.toISOString()).toBe('2025-10-31T12:00:00.000Z');
    expect(periodCutoff('all', NOW)).toBeNull();
  });

  test('the window includes its own start and excludes a second before it', () => {
    expect(withinPeriod('2026-10-01T12:00:00Z', 'month', NOW)).toBe(true);
    expect(withinPeriod('2026-10-01T11:59:59Z', 'month', NOW)).toBe(false);
  });

  test('an idle stretch empties the window instead of sliding it back', () => {
    // The log starts 2026-09-14, 47 days before NOW: "last month" drops the older
    // days rather than re-anchoring at the last practice.
    expect(filterSessions(LOG, 'month', NOW).map((s) => s.created_at)).toStrictEqual([
      '2026-10-01T12:00:00Z',
      '2026-10-26T12:00:00Z',
    ]);
    expect(filterSessions(LOG, 'quarter', NOW)).toHaveLength(4);
    expect(filterSessions(LOG, 'year', NOW)).toHaveLength(5);
    expect(filterSessions(LOG, 'all', NOW)).toHaveLength(6);
  });

  test('filtering keeps the input order', () => {
    // Sorting the series is the chart's job; a filter that reordered would make
    // the line jump between points that were never adjacent.
    const unsorted = [LOG[3], LOG[0], LOG[2]];
    expect(filterSessions(unsorted, 'quarter', NOW)).toStrictEqual([unsorted[0], unsorted[1], unsorted[2]]);
  });
});

describe('the tick unit follows the points drawn', () => {
  test('no points still draws an axis in weekly steps', () => {
    expect(tickUnit([])).toBe('week');
  });

  test('weekly lines up to a quarter, month lines up to two years', () => {
    expect(tickUnit([LOG[0], LOG[3]])).toBe('week'); // 42 days
    expect(tickUnit([session('2026-08-02T12:00:00Z'), session('2026-10-31T12:00:00Z')])).toBe('week'); // 90
    expect(tickUnit([session('2026-08-01T12:00:00Z'), session('2026-10-31T12:00:00Z')])).toBe('month'); // 91
    expect(tickUnit([session('2025-10-31T12:00:00Z'), session('2026-10-31T12:00:00Z')])).toBe('month'); // 365
    expect(tickUnit([session('2024-10-31T12:00:00Z'), session('2026-10-31T12:00:00Z')])).toBe('month'); // 730
    expect(tickUnit([session('2024-10-30T12:00:00Z'), session('2026-10-31T12:00:00Z')])).toBe('quarter'); // 731
  });

  test('a month window keeps weekly lines over a multi-year log', () => {
    // The full log spans ~3 years, which would take quarter lines; the points the
    // window actually keeps are a month, so the axis stays weekly.
    expect(tickUnit(LOG)).toBe('quarter');
    expect(tickUnit(filterSessions(LOG, 'month', NOW))).toBe('week');
  });

  test('input order does not change the unit', () => {
    expect(tickUnit([LOG[5], LOG[0], LOG[3]])).toBe(tickUnit([LOG[0], LOG[3], LOG[5]]));
  });
});

// The chart asks the scale for its two ends instead of letting Chart.js fit the axis to
// the series, because a fitted axis draws the plot's right edge on the last day logged:
// an idle stretch then reads as "practiced today". The domain is measured off the same
// clock the windows are, so the edges below are the day the window was anchored on.
describe('the axis runs from the oldest point plotted to today', () => {
  test('the day turns over on the boundary the refresh schedules itself for', () => {
    const end = axisMax(NOW);
    // The day's own end: local midnight, whatever the machine's zone reads there.
    expect([end.getHours(), end.getMinutes(), end.getSeconds(), end.getMilliseconds()]).toStrictEqual([0, 0, 0, 0]);
    // Exactly the deadline the day refresh schedules itself for, so the axis and the
    // rows it plots turn over at the same instant.
    expect(end.getTime() - NOW.getTime()).toBe(msUntilMidnight(NOW));
    // Never further: an edge reaching into a second unarrived day would draw a day the
    // log cannot have.
    expect(end.getTime() - NOW.getTime()).toBeGreaterThan(0);
    expect(end.getTime() - NOW.getTime()).toBeLessThanOrEqual(DAY_MS);
  });

  test('the edge stops inside today, one millisecond short of that boundary', () => {
    // This is the whole reason the scale is not handed `axisMax` itself: the time scale
    // adds a tick at the axis maximum when that maximum falls on one of its unit
    // boundaries, and every unit boundary is a local midnight. A Friday ending at
    // Sunday's midnight put `08/11` on the axis - a day with nothing plotted on it - and
    // the first of a month does the same to the monthly unit. An edge at the last
    // instant of the day cannot be a boundary, so the axis never labels an unarrived day.
    const { max } = axisDomain(LOG, NOW);
    expect([max.getHours(), max.getMinutes(), max.getSeconds(), max.getMilliseconds()]).toStrictEqual([23, 59, 59, 999]);
    expect(axisMax(NOW).getTime() - max.getTime()).toBe(1);
    expect(isSameLocalDay(max, NOW)).toBe(true);
  });

  test('a session logged late today sits inside the plot', () => {
    // Why the edge is the day's end and not `now`: a row written at 23:00 has to fall
    // left of the right edge, while the axis still has to be called "today".
    const late = new Date(NOW);
    late.setHours(23, 0, 0, 0);
    const { min, max } = axisDomain([session(late.toISOString())], NOW);
    expect(min.getTime()).toBe(late.getTime());
    expect(max.getTime()).toBeGreaterThanOrEqual(late.getTime());
    expect(isSameLocalDay(max, NOW)).toBe(true);
  });

  test('a stamp past today moves the edge instead of escaping it', () => {
    // The schema's `now()` is the database's clock, not the browser's: near midnight a
    // fresh row can land after the local day's end. The domain has to grow for it, or the
    // scale would clip the one point the user just logged - and a label at that edge
    // then names a day that has a point on it.
    const ahead = new Date(axisMax(NOW).getTime() + 60_000);
    const { min, max } = axisDomain([session(ahead.toISOString())], NOW);
    expect(max.getTime()).toBe(ahead.getTime());
    expect(min.getTime()).toBe(ahead.getTime());
  });

  test('the left edge stays on the oldest point, whatever the input order', () => {
    // The period control filters points; it does not draw a frame the size of the
    // window, so a window wider than the log spends no axis on empty days.
    const { min, max } = axisDomain(LOG, NOW);
    expect(min.toISOString()).toBe('2023-12-31T12:00:00.000Z');
    expect(max.getTime()).toBe(axisMax(NOW).getTime() - 1);
    expect(axisDomain([...LOG].reverse(), NOW).min.toISOString()).toBe(min.toISOString());
  });

  test('a window that keeps nothing still answers a usable domain', () => {
    // The empty state replaces the canvas, but the arithmetic runs before the render
    // decides that: a flipped axis is what a degenerate case would hand a scale.
    const { min, max } = axisDomain([], NOW);
    expect(max.getTime()).toBe(min.getTime());
    expect(isSameLocalDay(max, NOW)).toBe(true);
  });

  test('the anchor day the axis rules read is today, not the axis end', () => {
    // `tickUnit`'s 90-day line was drawn for the quarter's own length. Anchoring the day
    // list at the day's end would measure 90.x days and put month lines over a quarter,
    // which is not the subdivision that line was chosen for.
    const quarterEnds = [session('2026-08-02T12:00:00Z'), session('2026-10-31T12:00:00Z')]; // exactly 90 days from NOW
    expect(tickUnit(axisDays(quarterEnds, NOW))).toBe('week');
    expect(tickUnit([...quarterEnds, { created_at: axisMax(NOW).toISOString() }])).toBe('month');
  });

  test('the anchor day carries a year no point reaches', () => {
    // A log that stops in December plots nothing in January, yet a January axis crosses
    // the boundary and its ticks have to say so.
    const december = [session('2025-12-20T12:00:00Z'), session('2025-12-28T12:00:00Z')];
    const january = new Date('2026-01-05T12:00:00Z');
    expect(spansMultipleYears(december)).toBe(false);
    expect(spansMultipleYears(axisDays(december, january))).toBe(true);
  });

  test('the anchor day does not invent points for the series', () => {
    // `axisDays` feeds the axis wording only; the datasets are built from the filtered
    // sessions, and a day with no practice must never become a dot on a line.
    const days = axisDays([LOG[3]], NOW);
    expect(days).toHaveLength(2);
    expect(days[0]).toBe(LOG[3]);
    expect(days[1].created_at).toBe(NOW.toISOString());
  });
});
