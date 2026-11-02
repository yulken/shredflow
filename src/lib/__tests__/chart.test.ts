import { describe, expect, test } from 'vitest';
import { spansMultipleYears, tickDateLabel, tooltipDateLabel } from '@/lib/chart';
import { dateLocale } from '@/lib/i18n';
import type { PracticeSession } from '@/lib/supabase';

// The app's three locales, straight from `dateLocale()` in each locale file.
const LOCALES = ['en-US', 'pt-BR', 'es-ES'];

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

describe('spansMultipleYears', () => {
  test('no sessions plotted means no year is needed', () => {
    expect(spansMultipleYears([])).toBe(false);
  });

  test('the seeded legacy log (2026-09-14 .. 2026-10-26) is one year', () => {
    expect(spansMultipleYears([session('2026-09-14T12:00:00Z'), session('2026-10-26T12:00:00Z')])).toBe(false);
  });

  test('a log that crosses into the next year asks for the year', () => {
    expect(spansMultipleYears([session('2026-10-26T12:00:00Z'), session('2027-01-04T18:30:00Z')])).toBe(true);
  });

  test('timestamps inside one calendar year do not ask for it', () => {
    // Mid-year at noon: no browser zone can push either date into another year,
    // so this pins "counts years" rather than "counts timestamps" wherever the
    // suite runs.
    expect(spansMultipleYears([session('2026-05-01T12:00:00Z'), session('2026-11-30T12:00:00Z')])).toBe(false);
  });

  test('timestamps across New Year ask for it', () => {
    expect(spansMultipleYears([session('2026-12-31T12:00:00Z'), session('2027-01-01T12:00:00Z')])).toBe(true);
  });
});

describe('the labels carry a date, never a clock time', () => {
  test('no locale option asks for an hour or a minute', () => {
    for (const locale of LOCALES) {
      expect(tickDateLabel(Date.UTC(2026, 8, 14, 12, 0), locale, false)).not.toMatch(/\d:\d|:\s*\d|am|pm|a\.m\.|p\.m\./);
      expect(tooltipDateLabel(Date.UTC(2026, 8, 14, 12, 0), locale, false)).not.toMatch(/\d:\d|:\s*\d|am|pm|a\.m\.|p\.m\./);
    }
  });

  test('the two label shapes match the seed log and the UI day', () => {
    // A single timestamp is 12:00 UTC, which is the same calendar day in -03:00.
    // The tick is digits only, the tooltip still spells the month.
    expect(tickDateLabel(Date.UTC(2026, 8, 14, 12, 0), 'en-US', false)).toBe('09/14');
    expect(tooltipDateLabel(Date.UTC(2026, 8, 14, 12, 0), 'en-US', false)).toBe('Sep 14');
  });

  test('the tick order comes from the locale, not a hardcoded pair', () => {
    // The month-first locale writes MM/dd; the day-first ones write dd/MM. Nothing
    // here names a locale to decide it - the order is read back from the locale.
    expect(tickDateLabel(Date.UTC(2026, 8, 14, 12, 0), 'en-US', false)).toBe('09/14');
    expect(tickDateLabel(Date.UTC(2026, 8, 14, 12, 0), 'pt-BR', false)).toBe('14/09');
    expect(tickDateLabel(Date.UTC(2026, 8, 14, 12, 0), 'es-ES', false)).toBe('14/09');
  });

  test('a tick is digits and a slash, whatever the locale', () => {
    // No month name reaches the axis in any language: the whole point of the form
    // is that the ticks stay short.
    for (const locale of LOCALES) {
      expect(tickDateLabel(Date.UTC(2026, 8, 14, 12, 0), locale, false)).toMatch(/^\d{2}\/\d{2}$/);
    }
  });
});

describe('the year is conditional', () => {
  test('without it, no label mentions the year', () => {
    for (const locale of LOCALES) {
      expect(tickDateLabel(Date.UTC(2026, 8, 14, 12, 0), locale, false)).not.toContain('2026');
      expect(tooltipDateLabel(Date.UTC(2026, 8, 14, 12, 0), locale, false)).not.toContain('2026');
    }
  });

  test('with it, each locale keeps its own order and appends the year', () => {
    expect(tickDateLabel(Date.UTC(2026, 8, 14, 12, 0), 'en-US', true)).toBe('09/14/2026');
    expect(tickDateLabel(Date.UTC(2026, 8, 14, 12, 0), 'pt-BR', true)).toBe('14/09/2026');
    expect(tickDateLabel(Date.UTC(2026, 8, 14, 12, 0), 'es-ES', true)).toBe('14/09/2026');
  });

  test('a single-digit day and month are both padded', () => {
    // Columns: the ticks line up instead of jittering in width, and the tooltip
    // pads its own day the same way.
    expect(tickDateLabel(Date.UTC(2026, 8, 5, 12, 0), 'en-US', false)).toBe('09/05');
    expect(tickDateLabel(Date.UTC(2026, 8, 5, 12, 0), 'pt-BR', false)).toBe('05/09');
    expect(tooltipDateLabel(Date.UTC(2026, 8, 5, 12, 0), 'en-US', false)).toBe('Sep 05');
  });
});

describe('labels follow the app language', () => {
  test('tickDateLabel takes the locale dateLocale() returns', () => {
    // `dateLocale()` is a BCP-47 tag from the active locale file, not a hardcoded
    // 'en-US': the Chart.js date-fns adapter would have formatted in English.
    expect(dateLocale()).toBe('en-US');
    expect(tickDateLabel(Date.UTC(2026, 8, 14, 12, 0), dateLocale(), false)).toBe('09/14');
  });
});
