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
