import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Mirrors `exercises` in the migrations under `supabase/migrations/`.
// `max_bpm`/`last_bpm` are written only by the `sync_exercise_bpm_records`
// trigger, never by a client request, so they are nullable (an exercise with no
// logged session has neither). `user_id` arrives from the owner FK added by
// `20261102150000_add_user_ownership.sql`; it is NULL only for rows written
// before that migration, which `claimLegacyRows()` (src/lib/auth.ts) moves to
// whoever signs in first.
export type Exercise = {
  id: string;
  user_id: string | null;
  title: string;
  description: string | null;
  category: string | null;
  target_bpm: number | null;
  tab_url: string | null;
  dashboard_visible: boolean;
  max_bpm: number | null;
  last_bpm: number | null;
  created_at: string;
};

export type PracticeSession = {
  id: string;
  user_id: string | null;
  exercise_id: string;
  tension_level: number;
  bpm: number;
  clicks_per_beat: number;
  notes: string | null;
  created_at: string;
};

// Mirrors `songs` in `20261102230000_add_song_progress.sql`. The Songsterr columns hold the
// identifiers an import needs to reach the same revision again (`scripts/import-songsterr.mjs`);
// they are NULL for a song typed in by hand. `percent` is written only by the
// `sync_song_percent*` triggers, so a client request never sends it - the same rule
// `max_bpm`/`last_bpm` follow above.
export type Song = {
  id: string;
  user_id: string | null;
  title: string;
  songsterr_url: string | null;
  songsterr_song_id: number | null;
  songsterr_revision_id: number | null;
  songsterr_image: string | null;
  total_measures: number;
  percent: number;
  created_at: string;
};

// One measure of a song's structure: the tempo the tab sets there and its time signature.
// Weighted equally whatever the signature is (decision D3), so the signature is display only.
export type SongMeasureTarget = {
  id: string;
  song_id: string;
  measure_number: number;
  bpm: number;
  time_numerator: number;
  time_denominator: number;
};

// What was practiced on a song. A block spans `start_measure`..`end_measure` inclusive;
// `bpm_clean` is the tempo reached, which drives the percent, and `bpm_limit` is the tempo
// it stalled at - information only, never in the math. Unlike `practice_sessions`, a song
// takes many rows per day, so these are not limited to one per day.
export type SongProgressLog = {
  id: string;
  user_id: string | null;
  song_id: string;
  section: string;
  start_measure: number;
  end_measure: number;
  bpm_clean: number;
  bpm_limit: number | null;
  tension_level: number;
  notes: string | null;
  created_at: string;
};
