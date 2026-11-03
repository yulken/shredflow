import { useEffect, useState } from 'react';
import {
  DEFAULT_SONG_ORDER,
  SONG_ORDER_STORAGE_KEY,
  isSongOrder,
  type SongOrder,
} from '@/lib/songOrder';

// Which order the song list is shown in, persisted like the chart's period and the
// exercise list's order: read once at mount, written back on change. The stored value
// is validated rather than trusted - `localStorage` is whatever a previous build left
// there, and a stale or hand edited value must not reach the list as an order the
// control cannot name.
export function useSongOrder() {
  const [order, setOrderState] = useState<SongOrder>(readStoredOrder());

  useEffect(() => {
    try {
      localStorage.setItem(SONG_ORDER_STORAGE_KEY, order);
    } catch {
      // storage unavailable, keep the in-memory order only
    }
  }, [order]);

  const setOrder = (next: SongOrder) => setOrderState(next);

  return { order, setOrder };
}

function readStoredOrder(): SongOrder {
  try {
    const stored = localStorage.getItem(SONG_ORDER_STORAGE_KEY);
    if (isSongOrder(stored)) return stored;
  } catch {
    // storage unavailable, fall through to the default
  }
  return DEFAULT_SONG_ORDER;
}
