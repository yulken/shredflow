// Ordering of the exercise list, kept out of the component so the comparison is
// checkable without a React render. The two facts it reads - how many rows an exercise
// has logged, and its newest one - come off the read `ExerciseList.tsx` already makes
// for the card's chips, so the order is a sort over data already in state: the REST API
// cannot order a parent row by a count of its children, nor by a child's timestamp.

import type { Exercise } from './supabase';

export type ListOrder = 'recent' | 'most_sessions';

// Order is the order the control renders its buttons in: the order the list lands on
// first comes before the one a click moves it to.
export const LIST_ORDERS: ListOrder[] = ['recent', 'most_sessions'];

// What a practice log is read for: the workout you did last leads. Creation order is
// not an order a catalog of practice is asked for - it says nothing about practice - so
// it survives here only as the tie-break, for exercises that have never logged a row.
export const DEFAULT_LIST_ORDER: ListOrder = 'recent';

export const LIST_ORDER_LABEL_KEYS: Record<ListOrder, string> = {
  recent: 'order_recent',
  most_sessions: 'order_most_sessions',
};

export const LIST_ORDER_STORAGE_KEY = 'exercise_list_order';

export function isListOrder(value: unknown): value is ListOrder {
  return typeof value === 'string' && (LIST_ORDERS as string[]).includes(value);
}

// An id the count map does not hold has never been logged: zero, not absent, so an
// exercise with no rows sorts last rather than being skipped.
const countOf = (counts: Record<string, number>, id: string): number => counts[id] || 0;

// ISO timestamps sort as strings, the same rule the card's newest-session read uses.
const newerFirst = (a: Exercise, b: Exercise): number =>
  a.created_at === b.created_at ? 0 : a.created_at > b.created_at ? -1 : 1;

/**
 * Newest workout first. An exercise with no logged row is not "old" - it has never been
 * practiced - so it lands behind every exercise that has, and among those the newer
 * creation date decides. Same timestamps compare 0, keeping the order the fetch gave.
 */
const byNewestSession = (
  lasts: Record<string, string>,
  a: Exercise,
  b: Exercise,
): number => {
  const aLast = lasts[a.id];
  const bLast = lasts[b.id];
  if (aLast && bLast) return aLast === bLast ? 0 : aLast > bLast ? -1 : 1;
  if (aLast) return -1;
  if (bLast) return 1;
  return newerFirst(a, b);
};

/**
 * The rows in the order `order` names, without touching the array the fetch returned.
 * Both orders end on the same two fallbacks - newest session, then newest creation - so
 * the result is a total order: a run of equal counts, or two exercises never logged,
 * keeps the order the list had.
 */
export function orderedExercises(
  exercises: Exercise[],
  order: ListOrder,
  counts: Record<string, number>,
  lasts: Record<string, string>,
): Exercise[] {
  const rows = [...exercises];
  if (order === 'recent') return rows.sort((a, b) => byNewestSession(lasts, a, b));
  return rows.sort(
    (a, b) => countOf(counts, b.id) - countOf(counts, a.id) || byNewestSession(lasts, a, b),
  );
}
