import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Scope: the claims about the songs list that no runtime check would notice. Three of them
// are about what the card must not do: recompute a percent the trigger owns, claim a day was
// practiced from a column the schema does not have, or hand the Songsterr identifiers to a
// form that could not have read them. The order control is pinned here too, because a list
// that ignored it would sort correctly and look like it did not.
const list = readFileSync(fileURLToPath(new URL('../SongList.tsx', import.meta.url)), 'utf8');

// The form's payload is the block between `const payload = {` and its closing brace: the claim
// is about the columns sent, so comments naming `percent` nearby cannot satisfy it.
const payloadSlice = (source: string) => {
  const start = source.indexOf('const payload = {');
  expect(start).toBeGreaterThanOrEqual(0);
  return source.slice(start, source.indexOf('};', start));
};

describe('the card shows the stored percent, not a recomputed one', () => {
  test('the number is read off the song row', () => {
    expect(list).toContain('percentOf(song)');
    expect(list).toContain("from '@/lib/songProgress'");
    // The arithmetic lives in the trigger and in `songProgress.ts`, not in the card: a second
    // copy here would drift from the column beside it.
    expect(list).not.toContain('songPercent');
    expect(list).not.toContain('measureProgress');
  });

  test('the share is drawn as well as spelled', () => {
    // The question a card answers is how much of the song is left; digits alone do not say it
    // at a glance, and the bar is what the row's height is spent on.
    expect(list).toContain('role="progressbar"');
    expect(list).toContain('aria-valuemax={100}');
    expect(list).toContain('aria-valuenow={Number(percent.toFixed(2))}');
    expect(list).toContain("t('songs_percent_caption'");
  });
});

describe('practiced today is derived, not stored', () => {
  // `practice_sessions` has one row per day, so the exercise card can ask the database. A song
  // takes many rows per day and no column says "today", so the fact comes from the rows.
  test('the day check reads the newest log, in the local calendar day', () => {
    expect(list).toContain('from \'@/lib/clock\'');
    expect(list).toContain('isSameLocalDay(new Date(lasts[id]), now)');
    expect(list).toContain('practiced_today');
  });

  test('the counts and the newest log come off the same read as the songs', () => {
    // The REST API cannot order a song by its log rows, so the rows are read once and folded
    // into counts and newest timestamps in state.
    expect(list).toContain("from('song_progress_logs')");
    expect(list).toContain(".select('song_id, created_at')");
    // A background refresh must not trade the cards for the skeleton, and a failed one must
    // leave the last good cards readable rather than emptying the page.
    expect(list).toMatch(/if \(!background\) setLoading\(true\)/);
    expect(list).toMatch(/if \(background && inFlight\.current\) return/);
  });
});

describe('the order is a preference of this screen', () => {
  test('it is persisted like the chart period, never a field of the song', () => {
    expect(list).toContain('useSongOrder()');
    expect(list).toContain('orderedSongs(songs, order, logCounts, lastLogs)');
    expect(list).toContain('SONG_ORDER_LABEL_KEYS[o]');
    expect(list).toContain('aria-pressed={order === o}');
    expect(list).not.toMatch(/order.*songs\.order|songs\.sort_order/);
  });
});

describe('the tab is opened in the song screen, not on the card', () => {
  test('the card carries no Songsterr link', () => {
    // The card is a tap that navigates; a link inside it would answer the same finger with a
    // different destination.
    expect(list).not.toContain('<a ');
    expect(list).not.toContain('songsterr_link_aria');
    expect(list).toContain('onClick={() => onSelectSong(song)}');
  });
});

describe('the song form writes three columns', () => {
  test('no percent, and no Songsterr identifiers', () => {
    const payload = payloadSlice(list);
    expect(payload).toContain('title');
    expect(payload).toContain('songsterr_url');
    expect(payload).toContain('total_measures');
    // `percent` belongs to `sync_song_percent*`, the way `max_bpm` belongs to
    // `sync_exercise_bpm_records`. The identifiers belong to the import script: a hand-typed
    // revision would claim a tab revision that was never read, and the next import would skip
    // or overwrite measures on the strength of it.
    expect(payload).not.toContain('percent');
    expect(payload).not.toMatch(/songsterr_song_id|songsterr_revision|songsterr_part_id/);
  });

  test('the structure is not typed here', () => {
    // Measure-by-measure tempi come from the tab; a form that asked for them would be a worse
    // import than the script, and 100 inputs is not a phone form.
    expect(list).not.toContain('field_start_measure');
    expect(list).not.toContain('field_end_measure');
    expect(list).toContain('songs_import_hint');
  });

  test('the length is bounded the way the migration bounds it', () => {
    expect(list).toContain('error_total_measures');
    expect(list).toContain('measures < 1');
    expect(list).toContain('min={1}');
  });

  test('a delete says what it takes with the song', () => {
    // `ON DELETE CASCADE` removes the structure and every log, so the confirmation names them.
    expect(list).toContain('confirm_delete_song');
    expect(list).toMatch(/await supabase\.from\('songs'\)\.delete\(\)\.eq\('id', id\)/);
  });
});
