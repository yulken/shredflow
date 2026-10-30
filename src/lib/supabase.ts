import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Mirrors `exercises` in the two migrations under `supabase/migrations/`.
// `max_bpm`/`last_bpm` are written only by the `sync_exercise_bpm_records`
// trigger, never by a client request, so they are nullable (an exercise with no
// logged session has neither).
export type Exercise = {
  id: string;
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
  exercise_id: string;
  tension_level: number;
  bpm: number;
  clicks_per_beat: number;
  notes: string | null;
  created_at: string;
};
