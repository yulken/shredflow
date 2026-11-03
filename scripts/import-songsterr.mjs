/*
 * Songsterr importer for the song screens (plan: Song progress, Phase E).
 *
 * Songsterr has no official API and songsterr.com sends no CORS header, so this cannot run in the
 * browser - it is a local script. It reads three things:
 *
 *   1. the tab page, whose <script id="state"> holds songId, revisionId, image and the tracks;
 *   2. the CDN JSON for one track, which carries the measures, the time signature and the tempo
 *      automation (automations.tempo) - Guitar Pro semantics, so a marker holds until the next
 *      one instead of repeating on every measure;
 *   3. Supabase, signed in as Caio so stamp_owner() writes his user_id on the new rows.
 *
 * percent is never sent: the sync_song_percent* triggers in
 * supabase/migrations/20261102230000_add_song_progress.sql recompute it from the targets.
 *
 *   npm run import:songsterr -- https://www.songsterr.com/a/wsa/ac-dc-back-in-black-tab-s1024
 *   npm run import:songsterr -- 1024 --part 2 --update
 *   npm run import:songsterr -- 1024 --dry-run
 *
 * Credentials: --email / --password, or SUPABASE_EMAIL / SUPABASE_PASSWORD in the environment.
 * URL and key: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY, which the npm script loads from .env
 * through node --env-file=.env.
 */

import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { createClient } from '@supabase/supabase-js';

const SITE = 'https://www.songsterr.com';
// The CDN that serves the tab JSON per track. Verified live 2026-11-02: gzip-encoded, and unlike
// songsterr.com it sends allow-origin: *, so any host can read it. fetch() gunzips it for us.
const CDN = 'https://dqsljvtekg760.cloudfront.net';
// Songsterr answers a bare fetch with 403 on some routes, so every request names itself.
const USER_AGENT = 'shredflow-import/1.0';

const fail = (message) => {
  console.error(`import-songsterr: ${message}`);
  process.exit(1);
};

// Hand-rolled argv: this script takes one positional target plus flags, and node's own parsers
// would make --part=-2 or a URL that looks like a flag behave oddly.
const parseArgs = (argv) => {
  const opts = { target: null, part: null, update: false, dryRun: false, yes: false, bpm: null, fromFile: null, email: null, password: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--update') opts.update = true;
    else if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--yes') opts.yes = true;
    else if (arg === '--part') opts.part = Number(argv[++i]);
    else if (arg === '--bpm') opts.bpm = Number(argv[++i]);
    else if (arg === '--from-file') opts.fromFile = argv[++i];
    else if (arg === '--email') opts.email = argv[++i];
    else if (arg === '--password') opts.password = argv[++i];
    else if (arg.startsWith('--')) fail(`unknown flag ${arg}`);
    else if (opts.target) fail(`more than one target given (${opts.target} and ${arg})`);
    else opts.target = arg;
  }
  if (!opts.target) fail('usage: import-songsterr <songsterr url or songId> [--part N] [--bpm N] [--update] [--dry-run] [--yes] [--from-file FILE]');
  if (opts.part !== null && !Number.isInteger(opts.part)) fail(`--part must be a track index, got ${opts.part}`);
  if (opts.bpm !== null && !(Number.isInteger(opts.bpm) && opts.bpm >= 1)) fail(`--bpm must be a whole BPM above 0, got ${opts.bpm}`);
  return opts;
};

const getJson = async (url) => {
  const response = await fetch(url, { headers: { 'user-agent': USER_AGENT } });
  if (!response.ok) fail(`${url} answered ${response.status}`);
  return response.json();
};

// The slug Songsterr builds for a tab URL: "AC/DC" + "Back In Black" -> ac-dc-back-in-black-tab-s1024.
// Punctuation and slashes drop, spaces become hyphens, everything lowercases.
const slugify = (artist, title) =>
  `${artist}-${title}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

// meta.current from the tab page: the revision the URL is serving, the image hash the CDN needs
// and the track list, where the array index is the partId.
const resolveFromPage = async (url) => {
  const response = await fetch(url, { headers: { 'user-agent': USER_AGENT } });
  if (!response.ok) fail(`${url} answered ${response.status}`);
  const html = await response.text();
  const match = html.match(/<script id="state" type="application\/json">(.*?)<\/script>/s);
  if (!match) fail(`${url} has no <script id="state"> - it is not a tab page`);
  const state = JSON.parse(match[1]);
  const current = state?.meta?.current;
  if (!current?.songId || !current?.revisionId || !current?.image) fail(`${url} state holds no songId/revisionId/image`);
  return { ...current, url };
};

// A bare songId instead of a URL: /api/song/{id} gives artist, title and the popular tracks, and
// /api/meta/{songId}/revisions lists revisions newest first, which gives the latest revision.
const resolveFromSongId = async (songId) => {
  const song = await getJson(`${SITE}/api/song/${songId}`);
  const revisions = await getJson(`${SITE}/api/meta/${songId}/revisions`);
  const revisionId = revisions?.[0]?.revisionId;
  if (!revisionId) fail(`song ${songId} has no revisions`);
  const revision = await getJson(`${SITE}/api/revision/${revisionId}`);
  return {
    songId,
    revisionId,
    image: revision.image,
    artist: song.artist,
    title: song.title,
    tracks: revision.tracks,
    defaultTrack: song.defaultTrack,
    popularTrackGuitar: song.popularTrackGuitar,
    url: `${SITE}/a/wsa/${slugify(song.artist, song.title)}-tab-s${songId}`,
  };
};

// Track index to import: --part wins, then the guitar track the site itself calls popular, then
// the default track. Vocal tracks are numbered too, so guessing without the site's own hints
// would import a clarinet part for a guitar song.
const pickPart = (current, requested) => {
  if (requested !== null) return requested;
  const part = current.popularTrackGuitar ?? current.defaultTrack;
  if (part === null || part === undefined) fail(`${current.title} has no guitar track; pass --part N`);
  return part;
};

const getPart = async (current, partId, fromFile) => {
  if (fromFile) return JSON.parse(readFileSync(fromFile, 'utf8'));
  const url = `${CDN}/${current.songId}/${current.revisionId}/${current.image}/${partId}.json`;
  const response = await fetch(url, { headers: { 'user-agent': USER_AGENT, accept: 'application/json' } });
  if (!response.ok) fail(`${url} answered ${response.status} - pass --from-file FILE to import a saved copy`);
  return response.json();
};

// Guitar Pro semantics, the same rule the migration's comment states: a marker holds until the
// next one. automations.tempo numbers measures from 0, so measure 0 is the start of measure 1.
// The signature only appears where it changes, which for most tabs is measure 1 alone.
const buildStructure = (part, overrideBpm) => {
  const measures = part.measures;
  if (!Array.isArray(measures) || measures.length === 0) fail('the tab JSON holds no measures');

  const tempoMarkers = (part.automations?.tempo ?? []).slice().sort((a, b) => a.measure - b.measure);
  if (overrideBpm === null && tempoMarkers.length === 0) {
    fail('the tab states no tempo - pass --bpm N to set one for every measure');
  }

  const signatureFor = (index, previous) => {
    const signature = measures[index].signature;
    if (Array.isArray(signature) && signature.length === 2) return { num: signature[0], den: signature[1] };
    return previous ?? { num: 4, den: 4 };
  };

  // One pass, carrying both values forward: measure m takes the last marker at or before it.
  let markerAt = 0;
  let signature = null;
  const targets = [];
  const blocks = [];
  for (let i = 0; i < measures.length; i++) {
    const measureNumber = i + 1;
    while (markerAt < tempoMarkers.length && tempoMarkers[markerAt].measure <= i) markerAt++;
    signature = signatureFor(i, signature);
    const bpm = overrideBpm ?? tempoMarkers[markerAt - 1]?.bpm;
    if (!Number.isInteger(bpm) || bpm < 1) {
      fail(`measure ${measureNumber} has no tempo (first marker starts at ${tempoMarkers[0]?.measure + 1}) - pass --bpm N`);
    }
    targets.push({ measure_number: measureNumber, bpm, time_numerator: signature.num, time_denominator: signature.den });

    const label = measures[i].marker?.text;
    if (label) blocks.push({ section: String(label).trim() || `Measure ${measureNumber}`, from: measureNumber, to: measureNumber });
    else if (blocks.length > 0) blocks[blocks.length - 1].to = measureNumber;
    else blocks.push({ section: `Measures 1-${measureNumber}`, from: 1, to: measureNumber });
  }

  // The label sits above a measure, so a block runs from that measure to the one before the next
  // label. Measures before the first label are their own block, which is what an intro without a
  // marker looks like in the sheet.
  const totalMeasures = measures.length;
  return { totalMeasures, targets, blocks: blocks.filter((b) => b.to >= b.from), tempoMarkers };
};

// A destructive re-import needs a human in front of the terminal. --yes answers it ahead of time;
// without a TTY there is nobody to answer, so the script refuses rather than rewriting a structure
// that logs already point at.
const confirm = async (question) => {
  if (!process.stdin.isTTY) {
    fail(`${question} - nobody to answer in a non-interactive shell, pass --yes to accept it`);
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(`${question} [y/N] `)).trim().toLowerCase();
  rl.close();
  return answer === 'y' || answer === 'yes';
};

const signIn = async (email, password) => {
  const url = process.env.VITE_SUPABASE_URL ?? process.env.API_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.ANON_KEY;
  if (!url || !key) fail('no Supabase URL/key - run it through npm run import:songsterr, or set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
  if (!email || !password) fail('no credentials - pass --email/--password or set SUPABASE_EMAIL/SUPABASE_PASSWORD');
  const supabase = createClient(url, key);
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) fail(`sign in failed: ${error.message}`);
  return supabase;
};

const logCount = async (supabase, songId) => {
  const { count, error } = await supabase
    .from('song_progress_logs')
    .select('id', { count: 'exact', head: true })
    .eq('song_id', songId);
  if (error) fail(`could not read the song's logs: ${error.message}`);
  return count ?? 0;
};

// Idempotent by Songsterr's own songId, not by the title: a retitled tab is the same song, and a
// second tab for the same song is a duplicate Caio should notice instead of accumulating.
const writeSong = async (supabase, current, structure, opts) => {
  const { data: existing, error: findError } = await supabase
    .from('songs')
    .select('id, title, total_measures, percent')
    .eq('songsterr_song_id', current.songId)
    .maybeSingle();
  if (findError) fail(`could not look up the song: ${findError.message}`);

  if (!existing) {
    const { data: created, error: insertError } = await supabase
      .from('songs')
      .insert({
        title: current.title,
        songsterr_url: current.url,
        songsterr_song_id: current.songId,
        songsterr_revision_id: current.revisionId,
        songsterr_image: current.image,
        total_measures: structure.totalMeasures,
      })
      .select('id, percent')
      .single();
    if (insertError) fail(`could not insert the song: ${insertError.message}`);
    return { song: created, mode: 'created', logs: 0 };
  }

  if (!opts.update) fail(`${current.title} is already imported (id ${existing.id}). Use --update to rewrite its structure.`);

  const logs = await logCount(supabase, existing.id);
  if (logs > 0 && existing.total_measures !== structure.totalMeasures) {
    const question = `${current.title} has ${logs} log(s) against ${existing.total_measures} measures, but this revision has ${structure.totalMeasures}. Rewriting the structure moves those logs onto different measures`;
    if (!(opts.yes || (await confirm(question)))) fail('cancelled');
  }

  const { data: updated, error: updateError } = await supabase
    .from('songs')
    .update({
      title: current.title,
      songsterr_url: current.url,
      songsterr_song_id: current.songId,
      songsterr_revision_id: current.revisionId,
      songsterr_image: current.image,
      total_measures: structure.totalMeasures,
    })
    .eq('id', existing.id)
    .select('id, percent')
    .single();
  if (updateError) fail(`could not update the song: ${updateError.message}`);

  // The structure belongs to the tab, not to the user, so it is replaced wholesale. Percent is
  // recomputed by the target triggers row by row, which is why no percent is ever sent here.
  const { error: deleteError } = await supabase.from('song_measure_targets').delete().eq('song_id', existing.id);
  if (deleteError) fail(`could not clear the old targets: ${deleteError.message}`);
  return { song: updated, mode: 'updated', logs };
};

const writeTargets = async (supabase, songId, targets) => {
  const { error } = await supabase.from('song_measure_targets').insert(targets.map((t) => ({ ...t, song_id: songId })));
  if (error) fail(`could not insert the targets: ${error.message}`);
};

const describe = (current, structure, partId) => {
  const tempo = structure.targets[0].bpm;
  const distinctBpm = [...new Set(structure.targets.map((t) => t.bpm))];
  const distinctSignature = [...new Set(structure.targets.map((t) => `${t.time_numerator}/${t.time_denominator}`))];
  console.log(`${current.artist} - ${current.title}`);
  console.log(`  song ${current.songId}, revision ${current.revisionId}, image ${current.image}, track ${partId}`);
  console.log(`  ${structure.totalMeasures} measures: ${distinctBpm.join(', ')} BPM${distinctBpm.length > 1 ? ' (tempo changes mid-song)' : ''}, ${distinctSignature.join(', ')} time`);
  console.log(`  tempo markers from the tab: ${structure.tempoMarkers.map((m) => `measure ${m.measure + 1} = ${m.bpm}`).join('; ') || 'none'}`);
  console.log(`  blocks: ${structure.blocks.map((b) => `${b.section} ${b.from}-${b.to}`).join(', ')}`);
  console.log(`  tempo of every block: ${tempo} BPM unless the tab states otherwise`);
};

const main = async () => {
  const opts = parseArgs(process.argv.slice(2));
  const songIdOnly = /^\s*s?(\d+)\s*$/.test(opts.target);
  const current = songIdOnly
    ? await resolveFromSongId(Number(opts.target))
    : await resolveFromPage(opts.target);
  const partId = pickPart(current, opts.part);
  const part = await getPart(current, partId, opts.fromFile);
  const structure = buildStructure(part, opts.bpm);
  describe(current, structure, partId);

  if (opts.dryRun) {
    console.log(`  dry run: nothing written (${structure.targets.length} targets would be inserted)`);
    return;
  }

  const supabase = await signIn(opts.email ?? process.env.SUPABASE_EMAIL, opts.password ?? process.env.SUPABASE_PASSWORD);
  const { song, mode, logs } = await writeSong(supabase, current, structure, opts);
  await writeTargets(supabase, song.id, structure.targets);
  const { data: final, error: readError } = await supabase.from('songs').select('percent').eq('id', song.id).single();
  if (readError) fail(`could not read the song back: ${readError.message}`);
  console.log(`  ${mode} song ${song.id}: ${structure.targets.length} targets, ${logs} log(s) kept, percent ${final.percent}%`);
};

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
