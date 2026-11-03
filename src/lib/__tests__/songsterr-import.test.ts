import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Scope: the Songsterr importer as it is written in `scripts/import-songsterr.mjs`. The script
// talks to a live site, so no test can run it; what is pinned here is the parts that must not
// drift - where the tab JSON comes from, how a marker carries forward, and that the write never
// sends the trigger-owned `percent`. `song-schema.test.ts` pins the SQL side of the same table.

const script = readFileSync(
  fileURLToPath(new URL('../../../scripts/import-songsterr.mjs', import.meta.url)),
  'utf8',
);

describe('what the importer reads', () => {
  test('the tab page is the source of songId, revisionId and image', () => {
    expect(script).toContain('<script id="state"');
    expect(/state\?\.meta\?\.current/.test(script)).toBe(true);
    expect(/current\?\.songId \|\| !current\?\.revisionId \|\| !current\?\.image/.test(script)).toBe(true);
  });

  test('the track JSON is fetched from the CDN that sends allow-origin: *', () => {
    expect(script).toContain('https://dqsljvtekg760.cloudfront.net');
    expect(/CDN\}\/\$\{current\.songId\}\/\$\{current\.revisionId\}\/\$\{current\.image\}\/\$\{partId\}\.json/.test(script)).toBe(true);
  });

  test('a bare songId resolves through the site\'s own endpoints', () => {
    expect(/\/api\/song\/\$\{songId\}/.test(script)).toBe(true);
    expect(/\/api\/meta\/\$\{songId\}\/revisions/.test(script)).toBe(true);
    expect(/\/api\/revision\/\$\{revisionId\}/.test(script)).toBe(true);
  });

  test('the guitar track is the default, and --part overrides it', () => {
    // Vocal tracks are numbered like guitar ones, so the site's own hint is what picks a part.
    expect(/current\.popularTrackGuitar \?\? current\.defaultTrack/.test(script)).toBe(true);
    expect(/if \(requested !== null\) return requested/.test(script)).toBe(true);
  });
});

describe('how the structure is built', () => {
  test('tempo comes from the tab automation, not from the player default', () => {
    // The page state holds `{bpm: 72}` as the player's metronome default; a tab that states no
    // tempo is refused rather than imported at 72.
    expect(/part\.automations\?\.tempo/.test(script)).toBe(true);
    expect(/the tab states no tempo/.test(script)).toBe(true);
    expect(/state\.tempo/.test(script)).toBe(false);
  });

  test('markers carry forward, numbered from measure 1', () => {
    // Guitar Pro numbers markers from 0, so measure 0 is the start of measure 1, and a marker
    // holds until the next one - the same rule the migration comment states.
    expect(/tempoMarkers\[markerAt\]\.measure <= i/.test(script)).toBe(true);
    expect(/tempoMarkers\[markerAt - 1\]\?\.bpm/.test(script)).toBe(true);
    expect(/measureNumber = i \+ 1/.test(script)).toBe(true);
    expect(/previous \?\? \{ num: 4, den: 4 \}/.test(script)).toBe(true);
  });

  test('every measure gets a target with a whole tempo above zero', () => {
    expect(/Number\.isInteger\(bpm\) \|\| bpm < 1/.test(script)).toBe(true);
    expect(/measure_number: measureNumber, bpm, time_numerator: signature\.num, time_denominator: signature\.den/.test(script)).toBe(true);
  });

  test('blocks run from a section label to the measure before the next one', () => {
    expect(/blocks\[blocks\.length - 1\]\.to = measureNumber/.test(script)).toBe(true);
    expect(/blocks\.filter\(\(b\) => b\.to >= b\.from\)/.test(script)).toBe(true);
  });
});

describe('what the importer writes', () => {
  test('percent is never sent, so the trigger owns it', () => {
    expect(/\n\s*percent:/.test(script)).toBe(false);
    expect(script).toContain('percent is never sent');
  });

  test('the song row keeps the identifiers a re-import needs', () => {
    expect(/songsterr_song_id: current\.songId/.test(script)).toBe(true);
    expect(/songsterr_revision_id: current\.revisionId/.test(script)).toBe(true);
    expect(/songsterr_image: current\.image/.test(script)).toBe(true);
  });

  test('an existing song is refused unless --update is passed', () => {
    expect(/\.eq\('songsterr_song_id', current\.songId\)/.test(script)).toBe(true);
    expect(/if \(!opts\.update\) fail/.test(script)).toBe(true);
    expect(/Use --update to rewrite its structure/.test(script)).toBe(true);
  });

  test('logs survive a re-import', () => {
    expect(/\.delete\(\)\.eq\('song_id', existing\.id\)/.test(script)).toBe(true);
    // Only the target rows are replaced; nothing deletes song_progress_logs.
    expect(/from\('song_progress_logs'\)\.delete/.test(script)).toBe(false);
  });

  test('a measure-count change against existing logs needs an explicit answer', () => {
    expect(/logs > 0 && existing\.total_measures !== structure\.totalMeasures/.test(script)).toBe(true);
    expect(/opts\.yes \|\| \(await confirm\(question\)\)/.test(script)).toBe(true);
    expect(/nobody to answer in a non-interactive shell/.test(script)).toBe(true);
  });

  test('writes happen as the signed-in user, so stamp_owner() lands his id', () => {
    expect(/auth\.signInWithPassword/.test(script)).toBe(true);
    // The payload never names the owner column - the trigger fills it.
    expect(/user_id:/.test(script)).toBe(false);
  });

  test('nothing is written on a dry run', () => {
    expect(/if \(opts\.dryRun\) \{/.test(script)).toBe(true);
    expect(/signIn\(opts\.email/.test(script)).toBe(true);
  });
});
