import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Scope: the song schema as it is written in the migration - the guards that keep rows
// honest, the owner policies, and the SQL spelling of the percent the trigger writes. This
// reads source text; it does not run Postgres, so what is asserted is the shape of the
// statement rather than a query's answer. The numeric counterpart of the same formula lives
// in `src/lib/songProgress.ts` and is checked in `songProgress.test.ts`; this file is the
// half that pins the SQL side, so the two spellings cannot drift apart.

const sql = readFileSync(
  fileURLToPath(
    new URL('../../../supabase/migrations/20261102230000_add_song_progress.sql', import.meta.url),
  ),
  'utf8',
);

// Comments - the header and the ones between statements - name `exercises` and
// `practice_sessions` to say nothing here touches them, so the separation checks read the
// statements with every comment stripped.
const code = sql.slice(sql.indexOf('*/') + 2).replace(/--[^\n]*/g, '');

describe('the song tables', () => {
  test('a song has at least one measure', () => {
    expect(/total_measures integer NOT NULL DEFAULT 1 CHECK \(total_measures >= 1\)/.test(sql)).toBe(true);
  });

  test('percent is stored to two decimals and defaults to zero', () => {
    expect(/percent numeric\(5,2\) NOT NULL DEFAULT 0/.test(sql)).toBe(true);
  });

  test('one target row per measure of a song', () => {
    expect(/UNIQUE \(song_id, measure_number\)/.test(sql)).toBe(true);
    expect(/measure_number integer NOT NULL CHECK \(measure_number >= 1\)/.test(sql)).toBe(true);
    expect(/bpm integer NOT NULL CHECK \(bpm >= 1\)/.test(sql)).toBe(true);
  });

  test('a block spans measures in order', () => {
    expect(/end_measure integer NOT NULL CHECK \(end_measure >= start_measure\)/.test(sql)).toBe(true);
    expect(/start_measure integer NOT NULL CHECK \(start_measure >= 1\)/.test(sql)).toBe(true);
  });

  test('the tempo that counts is required, the tempo that stalled is optional', () => {
    // `bpm_clean` drives the percent; `bpm_limit` is information and has no guard beyond a
    // positive tempo, so an absent one is NULL rather than a zero that would read as tempo 0.
    expect(/bpm_clean integer NOT NULL CHECK \(bpm_clean >= 1\)/.test(sql)).toBe(true);
    expect(/bpm_limit integer CHECK \(bpm_limit >= 1\)/.test(sql)).toBe(true);
  });

  test('tension is the 1-3 scale, medium by default', () => {
    expect(/tension_level integer NOT NULL DEFAULT 2 CHECK \(tension_level >= 1 AND tension_level <= 3\)/.test(sql)).toBe(true);
  });

  test('the three tables are separate from the exercise log', () => {
    // A song never joins the dashboard's BPM chart and a song log is not a practice session,
    // so nothing here points at `exercises` or `practice_sessions`.
    expect(/exercises/.test(code)).toBe(false);
    expect(/practice_sessions/.test(code)).toBe(false);
  });
});

describe('ownership', () => {
  test('all three tables are row level secure', () => {
    expect(/ALTER TABLE songs ENABLE ROW LEVEL SECURITY/.test(sql)).toBe(true);
    expect(/ALTER TABLE song_measure_targets ENABLE ROW LEVEL SECURITY/.test(sql)).toBe(true);
    expect(/ALTER TABLE song_progress_logs ENABLE ROW LEVEL SECURITY/.test(sql)).toBe(true);
  });

  test('an unsigned request reaches no data', () => {
    expect(/REVOKE SELECT, INSERT, UPDATE, DELETE ON songs FROM anon/.test(sql)).toBe(true);
    expect(/REVOKE SELECT, INSERT, UPDATE, DELETE ON song_measure_targets FROM anon/.test(sql)).toBe(true);
    expect(/REVOKE SELECT, INSERT, UPDATE, DELETE ON song_progress_logs FROM anon/.test(sql)).toBe(true);
  });

  test('the owner stamps writes on the song and its logs', () => {
    // The target rows carry no `user_id` of their own: they belong to the song that holds them.
    expect(/CREATE TRIGGER stamp_owner_songs BEFORE INSERT ON songs/.test(sql)).toBe(true);
    expect(/CREATE TRIGGER stamp_owner_song_logs BEFORE INSERT ON song_progress_logs/.test(sql)).toBe(true);
    expect(/stamp_owner_targets/.test(sql)).toBe(false);
  });

  test('target rows are reached through their parent song', () => {
    expect(/CREATE POLICY "owner_insert_measure_targets" ON song_measure_targets FOR INSERT/.test(sql)).toBe(true);
    expect(/FROM songs s WHERE s\.id = song_id AND auth\.uid\(\) = s\.user_id/.test(sql)).toBe(true);
  });
});

describe('the SQL counterpart of songPercent()', () => {
  test('a measure is the peak over the blocks that cover it', () => {
    expect(/SELECT MAX\(l\.bpm_clean\)/.test(sql)).toBe(true);
    expect(/l\.start_measure <= m\.measure_number/.test(sql)).toBe(true);
    expect(/l\.end_measure >= m\.measure_number/.test(sql)).toBe(true);
  });

  test('the peak is divided by the measure\'s own target and capped at one', () => {
    expect(/LEAST\(1\.0,/.test(sql)).toBe(true);
    expect(/\/ t\.bpm\)/.test(sql)).toBe(true);
  });

  test('a measure with no target contributes 0, not one', () => {
    // `LEAST()` ignores NULL arguments, so `LEAST(1.0, 0 / NULL)` is 1.0: the CASE arm is what
    // keeps an unstated tempo from being read as a finished measure.
    expect(/WHEN t\.bpm IS NULL THEN 0/.test(sql)).toBe(true);
  });

  test('the denominator is the measure count, every measure weighed once', () => {
    // Decision D3: no time signature enters the sum, so the weight is 1 and the divisor is
    // `total_measures`, walked by `generate_series`.
    const sumBlock = /SELECT SUM[\s\S]*?\n\s*\) \/ s\.total_measures/.exec(sql)?.[0] ?? '';
    expect(sumBlock).not.toBe('');
    expect(/generate_series\(1, s\.total_measures\)/.test(sumBlock)).toBe(true);
    expect(/\) \/ s\.total_measures/.test(sumBlock)).toBe(true);
    expect(/time_/.test(sumBlock)).toBe(false);
  });

  test('the percent is scaled to a percentage', () => {
    expect(/100\.0 \*/.test(sql)).toBe(true);
  });

  test('percent is written by the database, never taken from a request', () => {
    expect(/SET percent = song_percent\(recalc_song_id\)/.test(sql)).toBe(true);
    // A client writing the column would be an UPDATE of `percent`; only `total_measures` is
    // watched on the song row, so writing the column cannot trigger a recompute of itself.
    expect(/AFTER UPDATE OF total_measures ON songs/.test(sql)).toBe(true);
    expect(/AFTER INSERT OR UPDATE OR DELETE ON song_progress_logs/.test(sql)).toBe(true);
    expect(/AFTER INSERT OR UPDATE OR DELETE ON song_measure_targets/.test(sql)).toBe(true);
  });
});
