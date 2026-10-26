import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Exercise = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  target_bpm: number | null;
  created_at: string;
};

export type PracticeSession = {
  id: string;
  exercise_id: string;
  tension_level: number;
  bpm: number;
  notes: string | null;
  created_at: string;
};

export type ExerciseWithStats = Exercise & {
  session_count: number;
  last_bpm: number | null;
  max_bpm: number | null;
};
