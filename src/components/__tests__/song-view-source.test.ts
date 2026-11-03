import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Scope: the claims about the song screen that no runtime check would notice, read off the
// source the way `session-source.test.ts` reads the session screen. The ones that matter are
// the two columns this screen must not touch and the two it must re-read: `songs.percent` is
// written by `sync_song_percent*`, so a client-side derivation would show a number the
// database never accepted, and a log written on another device moves the stored percent, the
// structure's peaks and the curve together. The arithmetic behind them is pinned elsewhere:
// `src/lib/__tests__/songProgress.test.ts` (numeric) and `song-schema.test.ts` (against the
// trigger's SQL).
const view = readFileSync(fileURLToPath(new URL('../SongView.tsx', import.meta.url)), 'utf8');
const app = readFileSync(fileURLToPath(new URL('../../App.tsx', import.meta.url)), 'utf8');

// The write payload is the block between the two braces of `const fields = {`; the claim is
// made over that slice, so prose about the percent elsewhere in the file cannot satisfy it.
const payloadSlice = (source: string, name: string) => {
  const start = source.indexOf(`const ${name} = {`);
  expect(start).toBeGreaterThanOrEqual(0);
  return source.slice(start, source.indexOf('};', start));
};

describe('the percent is the database\u2019s column, not this screen\u2019s arithmetic', () => {
  test('a log write never carries the percent', () => {
    const fields = payloadSlice(view, 'fields');
    expect(fields).toContain('bpm_clean');
    expect(fields).not.toContain('percent');
  });

  test('the headline number is read back after every write', () => {
    // The trigger recomputes on insert, update and delete, so the number on screen is the one
    // just stored - a preview left on screen would disagree with the row that was written.
    expect(view).toContain("supabase.from('songs').select('percent, total_measures')");
    expect(view).toMatch(/setLivePercent\(Number\(songRes\.data\.percent \?\? 0\)\)/);
    expect(view).toMatch(/await refreshAll\(\);/);
  });

  test('the previews are the trigger\u2019s arithmetic over the draft, not the stored column', () => {
    // Two questions, both answered the way `song_percent()` answers them: what the block being
    // drafted is worth, and what the song would be worth with it applied.
    expect(view).toContain('blockPercent(withDraft, draft.start_measure, draft.end_measure, targets)');
    expect(view).toContain('songPercent(song.total_measures, targets, withDraft)');
    // Editing a row means the old row is not part of the answer, or the preview would count
    // the block twice - once as written, once as drafted.
    expect(view).toContain("logs.filter((l) => l.id !== draft.id)");
  });

  test('a delete re-reads, because it is the one write that can lower the percent', () => {
    expect(view).toMatch(/await supabase\.from\('song_progress_logs'\)\.delete\(\)\.eq\('id', id\)/);
    expect(view).toMatch(/refreshAll\(\)/);
    expect(view).toContain('confirm_delete_song_log');
  });
});

describe('a song takes many rows per day', () => {
  // `SessionView` keeps one record per exercise per day; a song's practice is blocks, so the
  // day is not the unit of a row. Any "today's row" logic here would silently overwrite the
  // morning's block with the evening's.
  test('there is no today\u2019s-record rule', () => {
    expect(view).not.toContain('isSameLocalDay');
    expect(view).not.toMatch(/todayLog|todaySession/);
  });

  test('each row is edited through its own control', () => {
    expect(view).toContain('onClick={() => setEditingLog(log)}');
    expect(view).toContain('aria_edit_song_log');
    // The form re-syncs on the row's identity, not on the fetch: a background refresh of the
    // row being edited must not throw away a draft half-typed into it.
    expect(view).toMatch(/editingLog\?\.id === syncedId\.current/);
  });

  test('the row states the stretch it covered and its share', () => {
    expect(view).toContain("t('song_log_range'");
    expect(view).toContain("t('song_log_target_percent'");
    // `bpm_limit` is recorded for reference and never enters the percent (decision D4).
    expect(view).toContain("t('song_log_limit'");
    expect(view).toContain('song_limit_hint');
  });
});

describe('the structure is the tab\u2019s tempi, folded into runs', () => {
  test('it lists runs rather than one row per measure', () => {
    expect(view).toContain('const runs = tempoRuns(targets)');
    expect(view).toContain('runs.map(');
    expect(view).toContain("t('structure_line'");
  });

  test('the time signature is stored but not printed', () => {
    // Decision D3: every measure weighs the same, so the signature is display only, and a
    // hundred `4/4` chips would crowd the stretch the tempo is the point of.
    expect(view).not.toMatch(/time_numerator|time_denominator/);
  });

  test('a structure with no rows says what a missing tempo means', () => {
    expect(view).toContain('structure_missing_hint');
  });
});

describe('the song screen plots the percent axis, not the dashboard\u2019s BPM one', () => {
  test('it passes points, not exercises', () => {
    expect(view).toContain('percentPoints={percentHistory(');
    expect(view).toContain('percentLabel={song.title}');
    expect(view).not.toContain('exercises=');
    expect(view).not.toMatch(/dashboard_visible/);
    expect(view).not.toContain('useChartPeriod');
    expect(view).not.toMatch(/localStorage\./);
  });

  test('it appears only once something is logged, below the rows that made it', () => {
    expect(view).toMatch(/\{logs\.length > 0 && \(/);
    expect(view).not.toMatch(/t\('song_chart_empty/);
    expect(view.indexOf("t('history_title')")).toBeLessThan(view.indexOf('<ProgressChart'));
    expect(view).not.toMatch(/sticky top-6/);
  });

  test('it asks for the quiet variant of the chart', () => {
    expect(view).toMatch(/<ProgressChart[^>]*\bcompact\b[^>]*\/>/);
    expect(view).not.toMatch(/showLegend|showAxisLabels/);
  });
});

describe('the form answers before the write is attempted', () => {
  test('every bound the migration states is checked here first', () => {
    // A CHECK violation reaches the user as a constraint error; these four are the same
    // bounds the migration declares, so the message is the screen's own.
    expect(view).toContain('error_section_required');
    expect(view).toContain('error_measure_range');
    expect(view).toContain('error_measures_out_of_range');
    expect(view).toContain('error_bpm_clean_required');
    expect(view).toContain('endMeasure > song.total_measures');
  });

  test('the Songsterr URL is the only song column this screen writes', () => {
    expect(view).toMatch(/supabase\.from\('songs'\)\.update\({ songsterr_url: value }\)/);
    expect(view).not.toContain('total_measures:');
    expect(view).not.toMatch(/songsterr_song_id|songsterr_revision|songsterr_part_id/);
  });
});

describe('the screen re-reads when the day or the tab changes', () => {
  test('midnight and a return to the tab both refresh', () => {
    expect(view).toContain('useDayRollover(refreshAll)');
    expect(view).toContain('useRefreshOnVisible(refreshAll)');
  });

  test('a background refresh keeps the rows on screen', () => {
    // Trading the list for its skeleton on a focus would flash the history the user is reading.
    expect(view).toMatch(/if \(!background\) setLoadingHistory\(true\)/);
    expect(view).toMatch(/if \(background && inFlight\.current\) return/);
  });
});

describe('the songs view is reachable from the header', () => {
  test('the nav offers songs as a peer of exercises', () => {
    expect(app).toContain("<span className=\"hidden sm:inline\">{t('nav_songs')}</span>");
    expect(app).toContain('listView === \'songs\'');
  });

  test('a chosen song routes to the song screen', () => {
    expect(app).toContain('<SongView');
    expect(app).toContain('<SongList');
    expect(app).toContain('onSelectSong={openSong}');
    // The row on screen wins over the tab it came from, the same way an exercise does. The
    // claim compares the two elements, because the nav mentions `listView === 'songs'` first.
    expect(app.indexOf('<SongView')).toBeLessThan(app.indexOf('<SongList'));
    expect(app.indexOf('<SongList')).toBeLessThan(app.indexOf('<SettingsView'));
  });

  test('every nav choice drops both selections', () => {
    for (const handler of ['goDashboard', 'goExercises', 'goSongs', 'goSettings']) {
      const body = app.slice(app.indexOf(`const ${handler} = () =>`), app.indexOf('\n', app.indexOf(`const ${handler} = () =>`)));
      expect(body).toContain('setSelectedExercise(null)');
      expect(body).toContain('setSelectedSong(null)');
    }
  });
});
