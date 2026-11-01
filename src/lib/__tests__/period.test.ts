import { describe, expect, test } from 'vitest';
import { DEFAULT_PERIOD, PERIODS, PERIOD_LABEL_KEYS, filterSessions, isPeriod, periodCutoff, tickUnit, withinPeriod } from '@/lib/period';
import { getLang, setLang, t } from '@/lib/i18n';
import type { PracticeSession } from '@/lib/supabase';

// Pure arithmetic: the window is a duration measured against a clock passed in,
// so nothing here reads `Date.now()` and no test can drift with the machine's
// timezone. Storage lives in `src/hooks/useChartPeriod.ts`, outside this suite,
// the same way the language's `localStorage` chain stays out of `i18n.test.ts`.

const NOW = new Date('2026-10-31T12:00:00Z');

const session = (created_at: string): PracticeSession => ({
  id: 's1',
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
