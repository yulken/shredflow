import { useCallback, useEffect, useState } from 'react';
import { supabase, type Exercise } from '@/lib/supabase';

// One exercise, read by the id the URL carries instead of handed down from whichever
// list was open before. `SessionRoute.tsx` has to answer a pasted link and a reload,
// and neither arrives with a list to pick a row out of - the state `App.tsx` used to
// hold is gone the moment the URL is the only thing left.
//
// `id` comes from `useParams()`, so it is `string | undefined`. Three ways to miss all
// land on the same `null`: no id at all, an id that is not a UUID (Postgres refuses the
// comparison with `22P02` rather than returning no rows), and a row owned by another
// account, which the SELECT policy of `20261102150000_add_user_ownership.sql` hides.
// One answer is what the route can render: no row here to show.
export function useExercise(id: string | undefined) {
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [loading, setLoading] = useState(true);

  // The read is keyed by `id`, so moving from one exercise's URL to another's re-runs
  // it, and the route shows its skeleton while that is in flight instead of keeping the
  // previous row on screen under the new address.
  const refresh = useCallback(async () => {
    if (!id) {
      setExercise(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('exercises')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) console.error('Erro ao carregar exercício:', error);
    setExercise(data ?? null);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { exercise, loading, refresh };
}
