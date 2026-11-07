import { useCallback, useEffect, useState } from 'react';
import { supabase, type Song } from '@/lib/supabase';

// The song-side twin of `useExercise`: the id arrives from the URL, because a song
// screen has to survive being pasted or reloaded, and `percent`/`total_measures` come
// off this read as stored columns - `sync_song_percent*` writes them, so the row the
// URL names is also the row whose percent the screen shows.
//
// A row of another account is hidden by the SELECT policy, an id that is not a UUID is
// refused by Postgres, and both read as `null`: the route has one card for "no song
// here", whichever of the three it was.
export function useSong(id: string | undefined) {
  const [song, setSong] = useState<Song | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!id) {
      setSong(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('songs')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) console.error('Erro ao carregar música:', error);
    setSong(data ?? null);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { song, loading, refresh };
}
