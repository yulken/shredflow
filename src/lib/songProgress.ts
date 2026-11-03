// Song percent, spelled in TypeScript to mirror `song_percent(uuid)` in
// `supabase/migrations/20261102230000_add_song_progress.sql`. The stored column is written
// by that function's triggers and is what the UI shows; this module exists for the two
// places the database cannot answer: the curve of percent over time, and the value a
// screen previews a moment after a log is written and before the row is refetched. The
// formula is spelled twice on purpose - `song-schema.test.ts` pins both spellings to one
// rule, the way `bpm.test.ts` does for `realBpm`.

import { isSameLocalDay } from './clock';
import { withinPeriod } from './period';
import type { Song, SongMeasureTarget, SongProgressLog } from './supabase';

/** Every measure weighs the same (decision D3). The spreadsheet weighted a measure by the
 * seconds it takes at its tempo, so a 7/8 measure counted more than a 4/4 one; a song is
 * "played" measure by measure, so the denominator is the measure count and the time
 * signature is display only. */
export const MEASURE_WEIGHT = 1;

/** The tempo a log reached for one measure: the peak over every block that covers it. */
export function measurePeak(logs: SongProgressLog[], measureNumber: number): number {
  let peak = 0;
  for (const log of logs) {
    if (log.start_measure <= measureNumber && log.end_measure >= measureNumber) {
      peak = Math.max(peak, log.bpm_clean);
    }
  }
  return peak;
}

/** How much of a measure is done: the peak divided by its target, capped at 1.
 * A measure with no target row contributes 0 - there is no tempo to check against - the
 * same rule the SQL's `CASE WHEN t.bpm IS NULL THEN 0` arm gives. */
export function measureState(peak: number, target: SongMeasureTarget | undefined): number {
  if (!target) return 0;
  return Math.min(1, peak / target.bpm);
}

export function measureProgress(
  logs: SongProgressLog[],
  measureNumber: number,
  targets: SongMeasureTarget[],
): number {
  return measureState(measurePeak(logs, measureNumber), targetFor(targets, measureNumber));
}

/** A measure's target row, or undefined when the structure never stated one. */
export function targetFor(targets: SongMeasureTarget[], measureNumber: number): SongMeasureTarget | undefined {
  return targets.find((t) => t.measure_number === measureNumber);
}

/**
 * The percent of a song: 100 * sum of every measure's state / total measures. Measures
 * outside 1..`totalMeasures` are not counted, and measures inside it with no target row
 * contribute 0, so a structure shorter than the song's length holds the value down.
 */
export function songPercent(
  totalMeasures: number,
  targets: SongMeasureTarget[],
  logs: SongProgressLog[],
): number {
  if (totalMeasures < 1) return 0;
  let sum = 0;
  for (let measure = 1; measure <= totalMeasures; measure++) {
    sum += MEASURE_WEIGHT * measureProgress(logs, measure, targets);
  }
  return (100 * sum) / totalMeasures;
}

/**
 * What a logged block is worth, as a percent of its own measures: the mean of the measure
 * states over `start..end`, the spreadsheet's `BPM Limpo (%)` column for that row. With one
 * log over the stretch it is exactly `bpm_clean / target.bpm`; when other blocks covered part
 * of it faster, the row shows the peak the model keeps (decision D2) instead of the tempo this
 * log happened to reach. Measures with no target row contribute 0, the same rule `songPercent`
 * gives them, so a block reaching past the structure reads as unfinished rather than finished.
 * Display only: the stored column is `songPercent`, never this.
 */
export function blockPercent(
  logs: SongProgressLog[],
  startMeasure: number,
  endMeasure: number,
  targets: SongMeasureTarget[],
): number {
  if (endMeasure < startMeasure) return 0;
  let sum = 0;
  let count = 0;
  for (let measure = startMeasure; measure <= endMeasure; measure++) {
    sum += MEASURE_WEIGHT * measureProgress(logs, measure, targets);
    count++;
  }
  return (100 * sum) / count;
}

/**
 * The structure as tempo runs: consecutive measures that state the same tempo collapse into
 * one stretch, so a tab that plays its first 44 measures at 94 says one line instead of 44.
 * A gap in the measure numbers breaks a run - measures with no target row are not absorbed
 * into the stretch beside them, because they contribute 0 to the percent (decision D3) and a
 * run that swallowed them would say "finished" about measures the tab never stated. The time
 * signature is not part of a run: D3 weights every measure the same and the screen does not
 * print the signature, so a signature change at the same tempo is not a new stretch.
 */
export type TempoRun = { start: number; end: number; bpm: number };

export function tempoRuns(targets: SongMeasureTarget[]): TempoRun[] {
  const sorted = [...targets]
    .filter((t) => t.measure_number >= 1)
    .sort((a, b) => a.measure_number - b.measure_number);
  const runs: TempoRun[] = [];
  for (const t of sorted) {
    const last = runs[runs.length - 1];
    if (last && last.bpm === t.bpm && last.end === t.measure_number - 1) {
      last.end = t.measure_number;
      continue;
    }
    runs.push({ start: t.measure_number, end: t.measure_number, bpm: t.bpm });
  }
  return runs;
}

/** Percent as the stored column formats it: two decimals, the shape `numeric(5,2)` keeps. */
export function formatPercent(percent: number): string {
  return percent.toFixed(2);
}
export type PercentPoint = {
  date: Date;
  percent: number;
};

/**
 * Percent as of the end of each day that was practiced - the spreadsheet's "DAY %", which
 * recomputes the song's percent after applying that day's rows. Days are walked oldest
 * first and the peak only grows, so the curve never falls: a slow day draws a flat line,
 * not a dip, which is the same honesty the trigger gives the stored column.
 * `logs` is many-per-day: songs do not obey the one-row-per-day rule of `practice_sessions`.
 */
export function percentHistory(
  totalMeasures: number,
  targets: SongMeasureTarget[],
  logs: SongProgressLog[],
  period: Parameters<typeof withinPeriod>[1],
  now: Date,
): PercentPoint[] {
  const inWindow = logs.filter((l) => withinPeriod(l.created_at, period, now));
  const days: Date[] = [];
  for (const log of inWindow) {
    const day = new Date(log.created_at);
    if (!days.some((d) => isSameLocalDay(d, day))) days.push(day);
  }
  days.sort((a, b) => a.getTime() - b.getTime());

  // Cumulative: each day sees the logs of every day before it, so the peak carries forward.
  return days.map((day) => {
    const upToDay = inWindow.filter((l) => new Date(l.created_at).getTime() <= endOfDay(day));
    return { date: day, percent: songPercent(totalMeasures, targets, upToDay) };
  });
}

/** The day's own end - the next midnight - the instant the spreadsheet's DAY % reads at. */
function endOfDay(day: Date): number {
  const next = new Date(day);
  next.setHours(24, 0, 0, 0);
  return next.getTime();
}

/** The song's stored percent, read as the database wrote it. `numeric` comes back from
 * PostgREST as a JSON number, and the column is NOT NULL DEFAULT 0, so a row always has a
 * value; `Number` is here so a hand-written SQL row that arrives as a string still draws. */
export function percentOf(song: Song): number {
  return Number(song.percent ?? 0);
}
