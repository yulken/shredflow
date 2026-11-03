// Ordering of the song list, kept out of the component so the comparison is checkable
// without a React render. Same shape as `order.ts` for the exercise catalog: the two
// facts it reads - how many logs a song has, and its newest one - come off the read
// `SongList.tsx` already makes for the card's chips, so the order is a sort over data
// already in state. The REST API cannot order a song by its log rows, nor by a row's
// timestamp.

import type { Song } from './supabase';

export type SongOrder = 'recent' | 'most_logs';

// Order is the order the control renders its buttons in: the order the list lands on
// first comes before the one a click moves it to.
export const SONG_ORDERS: SongOrder[] = ['recent', 'most_logs'];

// What a song list is read for: the piece you practiced last leads, the same rule the
// exercise catalog follows. Creation order says nothing about practice, so it survives
// here only as the tie-break, for songs never logged.
export const DEFAULT_SONG_ORDER: SongOrder = 'recent';

// `order_recent` is the wording the exercise control already uses for the same idea;
// the log-count order gets its own key because a song counts logs, not sessions.
export const SONG_ORDER_LABEL_KEYS: Record<SongOrder, string> = {
  recent: 'order_recent',
  most_logs: 'songs_order_most_logs',
};

export const SONG_ORDER_STORAGE_KEY = 'song_list_order';

export function isSongOrder(value: unknown): value is SongOrder {
  return typeof value === 'string' && (SONG_ORDERS as string[]).includes(value);
}

// An id the count map does not hold has never been logged: zero, not absent, so a song
// with no rows sorts last rather than being skipped.
const countOf = (counts: Record<string, number>, id: string): number => counts[id] || 0;

// ISO timestamps sort as strings, the same rule the card's newest-log read uses.
const newerFirst = (a: Song, b: Song): number =>
  a.created_at === b.created_at ? 0 : a.created_at > b.created_at ? -1 : 1;

/**
 * Newest practice first. A song with no log is not "old" - it has never been played -
 * so it lands behind every song that has, and among those the newer creation date
 * decides. Same timestamps compare 0, keeping the order the fetch gave.
 */
const byNewestLog = (lasts: Record<string, string>, a: Song, b: Song): number => {
  const aLast = lasts[a.id];
  const bLast = lasts[b.id];
  if (aLast && bLast) return aLast === bLast ? 0 : aLast > bLast ? -1 : 1;
  if (aLast) return -1;
  if (bLast) return 1;
  return newerFirst(a, b);
};

/**
 * The rows in the order `order` names, without touching the array the fetch returned.
 * Both orders end on the same two fallbacks - newest log, then newest creation - so the
 * result is a total order: a run of equal counts, or two songs never logged, keeps the
 * order the list had.
 */
export function orderedSongs(
  songs: Song[],
  order: SongOrder,
  counts: Record<string, number>,
  lasts: Record<string, string>,
): Song[] {
  const rows = [...songs];
  if (order === 'recent') return rows.sort((a, b) => byNewestLog(lasts, a, b));
  return rows.sort(
    (a, b) => countOf(counts, b.id) - countOf(counts, a.id) || byNewestLog(lasts, a, b),
  );
}
