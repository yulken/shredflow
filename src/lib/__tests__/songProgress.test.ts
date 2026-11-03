import { describe, expect, test } from 'vitest';
import {
  MEASURE_WEIGHT,
  blockPercent,
  formatPercent,
  measurePeak,
  measureProgress,
  measureState,
  percentHistory,
  percentOf,
  songPercent,
  targetFor,
  tempoRuns,
} from '@/lib/songProgress';
import type { SongMeasureTarget, SongProgressLog } from '@/lib/supabase';

// Scope: the song percent as it lives in `src/lib/songProgress.ts` - the peak over the
// blocks that cover a measure, the cap at that measure's target, the equal weight every
// measure carries, and the curve of percent over days. What is asserted is the arithmetic,
// not the form that produces the rows: DOM input is not importable headlessly, and the
// stored `songs.percent` column is written by the database, not by this module.
//
// `songPercent()` is asserted twice, from two ends, the way `bpm.test.ts` asserts `realBpm`:
// numerically here, and structurally against the migration's SQL in `song-schema.test.ts`.
// The trigger owns the column (the client never sends `percent`), so a drift between the two
// spellings is caught by the pair rather than silently drawing a wrong curve.

const target = (measureNumber: number, bpm: number): SongMeasureTarget => ({
  id: `t${measureNumber}`,
  song_id: 'song-1',
  measure_number: measureNumber,
  bpm,
  time_numerator: 4,
  time_denominator: 4,
});

const targets100 = () => Array.from({ length: 100 }, (_, i) => target(i + 1, 94));

const block = (
  section: string,
  start: number,
  end: number,
  bpmClean: number,
  createdAt: string,
): SongProgressLog => ({
  id: `${section}-${start}-${end}`,
  user_id: null,
  song_id: 'song-1',
  section,
  start_measure: start,
  end_measure: end,
  bpm_clean: bpmClean,
  bpm_limit: null,
  tension_level: 2,
  notes: null,
  created_at: createdAt,
});

describe('measurePeak()', () => {
  test('the stretch is inclusive at both ends', () => {
    const logs = [block('Intro', 1, 3, 90, '2026-11-01T10:00:00Z')];
    expect(measurePeak(logs, 1)).toBe(90);
    expect(measurePeak(logs, 2)).toBe(90);
    expect(measurePeak(logs, 3)).toBe(90);
    expect(measurePeak(logs, 4)).toBe(0);
    expect(measurePeak(logs, 0)).toBe(0);
  });

  test('the peak is the highest tempo among the blocks covering the measure', () => {
    const logs = [
      block('Chorus', 45, 82, 94, '2026-11-01T10:00:00Z'),
      block('Solo', 45, 51, 120, '2026-11-02T10:00:00Z'),
    ];
    expect(measurePeak(logs, 45)).toBe(120);
    expect(measurePeak(logs, 51)).toBe(120);
    expect(measurePeak(logs, 52)).toBe(94);
  });

  test('a slower day after a faster one keeps the peak', () => {
    // The spreadsheet's state is a peak, so practice that stalls does not erase progress.
    const logs = [
      block('Solo', 45, 51, 120, '2026-11-02T10:00:00Z'),
      block('Rusty', 45, 51, 60, '2026-11-09T10:00:00Z'),
    ];
    expect(measurePeak(logs, 48)).toBe(120);
  });

  test('a measure no block covers has no tempo', () => {
    expect(measurePeak([], 7)).toBe(0);
  });
});

describe('measureState()', () => {
  test('reaching the target is the whole measure', () => {
    expect(measureState(94, target(1, 94))).toBe(1);
  });

  test('part of the target is the fraction of it', () => {
    expect(measureState(47, target(1, 94))).toBe(0.5);
    expect(measureState(0, target(1, 94))).toBe(0);
  });

  test('past the target is capped at the whole measure', () => {
    // Practice above the tab's tempo cannot claim more than the measure it is worth.
    expect(measureState(200, target(1, 94))).toBe(1);
  });

  test('a measure with no target row contributes 0', () => {
    // The SQL arm `CASE WHEN t.bpm IS NULL THEN 0` gives the same answer: `LEAST()` ignores
    // NULL, so an absent target would otherwise read as a finished measure.
    expect(measureState(120, undefined)).toBe(0);
    expect(measureState(0, undefined)).toBe(0);
  });
});

describe('targetFor()', () => {
  test('a measure inside the structure has its row', () => {
    expect(targetFor([target(1, 94)], 1)?.bpm).toBe(94);
  });

  test('a measure the structure never stated has none', () => {
    expect(targetFor([target(1, 94)], 2)).toBeUndefined();
  });
});

describe('measureProgress()', () => {
  test('peak and target meet in one number', () => {
    // The two halves the trigger spells separately - `MAX(bpm_clean)` and `t.bpm` - joined
    // the way `song_percent()` reads them.
    const logs = [block('Intro', 1, 3, 47, '2026-11-01T10:00:00Z')];
    expect(measureProgress(logs, 2, [target(2, 94)])).toBe(0.5);
    expect(measureProgress(logs, 3, [target(3, 47)])).toBe(1);
    expect(measureProgress(logs, 4, [target(4, 94)])).toBe(0);
  });

  test('a measure the structure never stated is 0 whatever was played', () => {
    expect(measureProgress([block('Solo', 5, 6, 200, '2026-11-01T10:00:00Z')], 5, [])).toBe(0);
  });
});

describe('songPercent()', () => {
  test('the whole structure at tempo is 100', () => {
    const logs = [block('Full', 1, 100, 94, '2026-11-01T10:00:00Z')];
    expect(songPercent(100, targets100(), logs)).toBe(100);
  });

  test('an untouched structure is 0', () => {
    expect(songPercent(100, targets100(), [])).toBe(0);
  });

  test('a stretch played is the fraction of the song it covers', () => {
    const logs = [block('Intro', 1, 10, 94, '2026-11-01T10:00:00Z')];
    expect(songPercent(100, targets100(), logs)).toBe(10);
  });

  test('half tempo on every measure is half the song', () => {
    const logs = [block('Slow', 1, 100, 47, '2026-11-01T10:00:00Z')];
    expect(songPercent(100, targets100(), logs)).toBe(50);
  });

  test('overlapping blocks resolve per measure, not twice', () => {
    // The sheet logs "Chorus 45-82" at 94 and per-measure solos over 45-51 at 120. The
    // SUMPRODUCT it used weighted the overlap a second time; this adds the two stretches'
    // honest measure states instead.
    const targets = targets100().map((t) => (t.measure_number >= 45 && t.measure_number <= 51 ? target(t.measure_number, 120) : t));
    const logs = [
      block('Chorus', 45, 82, 94, '2026-11-01T10:00:00Z'),
      block('Solo', 45, 51, 120, '2026-11-02T10:00:00Z'),
    ];
    // 7 measures at the solo's tempo, 30 more at 94 against a 94 target, out of 100.
    expect(songPercent(100, targets, logs)).toBe(38);
    expect(songPercent(100, targets, [logs[0]])).toBeCloseTo(36.48, 2);
  });

  test('measures with no target row hold the value down', () => {
    // The denominator stays the song's length, so a structure shorter than the song cannot
    // be read as finished.
    const targets = targets100().slice(0, 50);
    const logs = [block('First half', 1, 100, 94, '2026-11-01T10:00:00Z')];
    expect(songPercent(100, targets, logs)).toBe(50);
  });

  test('a log past the structure contributes nothing', () => {
    const logs = [block('Beyond', 101, 200, 94, '2026-11-01T10:00:00Z')];
    expect(songPercent(100, targets100(), logs)).toBe(0);
  });

  test('every measure weighs the same, whatever its signature', () => {
    // Decision D3: the sheet weighted a measure by the seconds it takes at its tempo, so a
    // 7/8 measure counted more than a 4/4 one. A song is played measure by measure.
    const targets = [target(1, 94), target(2, 94), target(3, 94)];
    targets[1] = { ...targets[1], time_numerator: 7, time_denominator: 8 };
    const logs = [block('All three', 1, 3, 94, '2026-11-01T10:00:00Z')];
    expect(songPercent(3, targets, logs)).toBe(100);
    expect(MEASURE_WEIGHT).toBe(1);
    expect(songPercent(3, targets, [block('Two of three', 1, 2, 94, '2026-11-01T10:00:00Z')])).toBeCloseTo(66.67, 2);
  });

  test('an empty structure percent is 0 rather than a division by zero', () => {
    expect(songPercent(0, [], [])).toBe(0);
    expect(Number.isNaN(songPercent(0, [], []))).toBe(false);
  });
});

describe('blockPercent()', () => {
  // The spreadsheet's `BPM Limpo (%)` column, spelled per row: what the stretch a log
  // covers is worth, as a percent of its own measures rather than of the song.
  const targetsAt100 = Array.from({ length: 100 }, (_, i) => target(i + 1, 100));

  test('part of the tab tempo is that fraction of the block', () => {
    // The sheet's own row: Solo 1-4 played at 71 against the tab's 94.
    const logs = [block('Solo 1 - 4', 1, 4, 71, '2026-11-01T10:00:00Z')];
    expect(blockPercent(logs, 1, 4, targets100())).toBeCloseTo(75.53, 2);
  });

  test('reaching the tab tempo is the whole block, and past it is capped', () => {
    const logs = [block('Intro', 1, 10, 94, '2026-11-01T10:00:00Z')];
    expect(blockPercent(logs, 1, 10, targets100())).toBe(100);
    expect(blockPercent([block('Solo', 45, 51, 120, '2026-11-01T10:00:00Z')], 45, 51, targets100())).toBe(100);
  });

  test('the row reads the peak over its measures, not only its own tempo', () => {
    // A faster block recorded later over part of the stretch (decision D2), so the slow row
    // says what those measures are worth now instead of the tempo it was played at.
    const logs = [
      block('Chorus', 45, 82, 94, '2026-11-01T10:00:00Z'),
      block('Solo', 45, 51, 120, '2026-11-02T10:00:00Z'),
    ];
    // 0.94 is not exact in binary, so the mean of 38 of them is not either: the value is the
    // claim, its last digit is not.
    expect(blockPercent([logs[0]], 45, 82, targetsAt100)).toBeCloseTo(94, 6);
    // The seven solo measures reach their target; the other thirty stay at 0.94.
    expect(blockPercent(logs, 45, 82, targetsAt100)).toBeCloseTo(95.11, 2);
  });

  test('measures the structure never stated hold the block down', () => {
    const targets = targets100().slice(0, 2);
    const logs = [block('Long stretch', 1, 4, 94, '2026-11-01T10:00:00Z')];
    expect(blockPercent(logs, 1, 4, targets)).toBe(50);
  });

  test('a range the schema forbids answers 0 rather than a negative', () => {
    // `CHECK (start_measure <= end_measure)` keeps this out of the database; the function is
    // asked before the write is validated, so it answers instead of dividing by a negative.
    expect(blockPercent([], 10, 5, targets100())).toBe(0);
  });
});

// The structure list is the targets read back as stretches: what the screen prints, and the
// one place a measure number becomes a range. The percent does not go through it - a run is a
// display of the same rows `songPercent` already weighed.
describe('tempoRuns()', () => {
  test('one tempo over a stretch is one run', () => {
    expect(tempoRuns(Array.from({ length: 44 }, (_, i) => target(i + 1, 94)))).toEqual([
      { start: 1, end: 44, bpm: 94 },
    ]);
  });

  test('a tempo change starts a new run', () => {
    // The shape a tab states: 1-44 at the song's tempo, a faster solo, then back.
    const targets = [
      ...Array.from({ length: 44 }, (_, i) => target(i + 1, 94)),
      ...Array.from({ length: 7 }, (_, i) => target(45 + i, 120)),
      ...Array.from({ length: 31 }, (_, i) => target(52 + i, 94)),
    ];
    expect(tempoRuns(targets)).toEqual([
      { start: 1, end: 44, bpm: 94 },
      { start: 45, end: 51, bpm: 120 },
      { start: 52, end: 82, bpm: 94 },
    ]);
  });

  test('a measure the structure never stated breaks the run instead of joining it', () => {
    // Measures with no target row contribute 0 to the percent, so the gap has to stay visible
    // here rather than be swallowed by the stretch on either side of it.
    expect(tempoRuns([target(1, 94), target(2, 94), target(5, 94)])).toEqual([
      { start: 1, end: 2, bpm: 94 },
      { start: 5, end: 5, bpm: 94 },
    ]);
  });

  test('a signature change at the same tempo is not a new stretch', () => {
    // Decision D3 weights every measure the same and the list does not print the signature,
    // so a 7/8 bar played at the same tempo is the same stretch.
    const targets = [target(1, 94), target(2, 94), { ...target(3, 94), time_numerator: 7, time_denominator: 8 }];
    expect(tempoRuns(targets)).toEqual([{ start: 1, end: 3, bpm: 94 }]);
  });

  test('a read that came back out of order still walks measures in order', () => {
    expect(tempoRuns([target(3, 94), target(1, 94), target(2, 94)])).toEqual([{ start: 1, end: 3, bpm: 94 }]);
  });

  test('an empty structure draws no runs', () => {
    expect(tempoRuns([])).toEqual([]);
  });
});

describe('percentHistory()', () => {
  const targets = targets100();
  const now = new Date('2026-11-10T12:00:00Z');

  test('one point per day practiced, oldest first', () => {
    const logs = [
      block('Intro', 1, 10, 94, '2026-11-03T20:00:00Z'),
      block('Verse', 11, 26, 94, '2026-11-01T09:00:00Z'),
    ];
    const points = percentHistory(100, targets, logs, 'all', now);
    expect(points.map((p) => p.percent)).toEqual([16, 26]);
    expect(points.map((p) => p.date.toISOString().slice(0, 10))).toEqual(['2026-11-01', '2026-11-03']);
  });

  test('many blocks on one day land on a single point', () => {
    // Songs are not bound by the one-row-per-day rule `practice_sessions` follows.
    const logs = [
      block('Intro', 1, 10, 94, '2026-11-01T08:00:00Z'),
      block('Verse', 11, 26, 94, '2026-11-01T22:00:00Z'),
    ];
    expect(percentHistory(100, targets, logs, 'all', now)).toHaveLength(1);
  });

  test('the curve never falls', () => {
    const logs = [
      block('Solo', 45, 51, 120, '2026-11-02T10:00:00Z'),
      block('Rusty', 45, 51, 60, '2026-11-09T10:00:00Z'),
    ];
    const points = percentHistory(100, targets, logs, 'all', now);
    expect(points.map((p) => p.percent)).toEqual([7, 7]);
  });

  test('the period window keeps only the days inside it', () => {
    const logs = [
      block('Old', 1, 10, 94, '2026-08-01T10:00:00Z'),
      block('Recent', 11, 26, 94, '2026-11-05T10:00:00Z'),
    ];
    // A month is 30 days, so the August row is outside the window and the November one is in.
    expect(percentHistory(100, targets, logs, 'month', now).map((p) => p.percent)).toEqual([16]);
    expect(percentHistory(100, targets, logs, 'all', now).map((p) => p.percent)).toEqual([10, 26]);
  });

  test('a day with no logs in the window draws nothing', () => {
    expect(percentHistory(100, targets, [], 'month', now)).toEqual([]);
  });
});

describe('formatPercent()', () => {
  test('two decimals, the shape numeric(5,2) stores', () => {
    expect(formatPercent(36.483333)).toBe('36.48');
    expect(formatPercent(100)).toBe('100.00');
    expect(formatPercent(0)).toBe('0.00');
  });
});

describe('percentOf()', () => {
  test('the stored column reads as a number', () => {
    expect(percentOf({ percent: 48.33 } as never)).toBe(48.33);
    expect(percentOf({ percent: '48.33' } as never)).toBe(48.33);
    expect(percentOf({ percent: null } as never)).toBe(0);
  });
});
