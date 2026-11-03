import { describe, expect, test } from 'vitest';
import {
  DEFAULT_LIST_ORDER,
  LIST_ORDERS,
  LIST_ORDER_LABEL_KEYS,
  LIST_ORDER_STORAGE_KEY,
  isListOrder,
  orderedExercises,
} from '@/lib/order';
import { getLang, setLang, t } from '@/lib/i18n';
import { PERIOD_STORAGE_KEY } from '@/lib/period';
import type { Exercise } from '@/lib/supabase';

// Pure comparison, out of the component: the two facts the sort reads - how many rows an
// exercise logged and its newest one - are passed in, so nothing here reads `Date.now()`
// and no test can drift with the machine's timezone. Storage lives in
// `src/hooks/useListOrder.ts`, outside this suite, the same way the chart period's
// `localStorage` chain stays out of `period.test.ts`.

const exercise = (id: string, created_at: string): Exercise => ({
  id,
  user_id: null,
  title: id,
  category: null,
  target_bpm: null,
  description: null,
  tab_url: null,
  dashboard_visible: true,
  max_bpm: null,
  last_bpm: null,
  created_at,
});

// Creation order newest first, the shape the fetch returns: `c` is the newest row.
const CATALOG = [
  exercise('c', '2026-11-02T12:00:00Z'),
  exercise('b', '2026-10-20T12:00:00Z'),
  exercise('a', '2026-10-06T12:00:00Z'),
];

// The practice log, deliberately upside down against creation: `c` is the newest
// exercise and the oldest workout, `a` the oldest exercise and the newest workout.
const LASTS = {
  a: '2026-10-30T09:00:00Z',
  b: '2026-10-08T09:00:00Z',
  c: '2026-10-01T09:00:00Z',
};
const COUNTS = { a: 3, b: 17, c: 6 };

const ids = (rows: Exercise[]) => rows.map((r) => r.id);

describe('the control visits each order once', () => {
  test('the two orders are the whole set, landing order first', () => {
    expect(LIST_ORDERS).toStrictEqual(['recent', 'most_sessions']);
    expect(new Set(LIST_ORDERS).size).toBe(LIST_ORDERS.length);
  });

  test('the list lands on the newest workout', () => {
    // A practice log is read for what was practiced last, so that is where it opens -
    // an empty `localStorage` shows the same list as pressing the `recent` button.
    expect(DEFAULT_LIST_ORDER).toBe('recent');
    expect(ids(orderedExercises(CATALOG, DEFAULT_LIST_ORDER, COUNTS, LASTS))).toStrictEqual(['a', 'b', 'c']);
  });

  test('every order has a label key that resolves in all three dictionaries', () => {
    // Structural only: nothing quotes a translated word. A key added to one
    // dictionary without its two translations fails here and in locales.test.ts.
    const previous = getLang();
    try {
      for (const code of ['en', 'pt', 'es']) {
        setLang(code);
        for (const order of LIST_ORDERS) {
          const label = t(LIST_ORDER_LABEL_KEYS[order]);
          expect(label.length).toBeGreaterThan(0);
          expect(label).not.toBe(LIST_ORDER_LABEL_KEYS[order]);
        }
      }
    } finally {
      setLang(previous);
    }
  });

  test('the storage key names the screen it belongs to', () => {
    // One key per screen: the chart's period is a different preference and must not
    // be overwritten by this one.
    expect(LIST_ORDER_STORAGE_KEY).toBe('exercise_list_order');
    expect(LIST_ORDER_STORAGE_KEY).not.toBe(PERIOD_STORAGE_KEY);
  });
});

describe('isListOrder validates what storage can hand back', () => {
  test('it accepts exactly the orders the control renders', () => {
    for (const order of LIST_ORDERS) expect(isListOrder(order)).toBe(true);
  });

  test('it refuses anything storage could hold', () => {
    // `localStorage` is whatever a previous build left there, plus anything typed by
    // hand - a value that is not one of the two must fall back rather than reach the
    // list as an order no button names.
    for (const junk of ['', 'month', 'all', 'RECENT', 'most_sessions ', 'recent,most_sessions', 1, null, undefined, {}, ['recent']]) {
      expect(isListOrder(junk)).toBe(false);
    }
  });
});

describe('recent means the newest workout, not the newest exercise', () => {
  // The point of the revision: creation date must not decide where a card sits, so the
  // fixture above is upside down and the result has to follow the log.
  test('the workout dates order the cards', () => {
    expect(ids(orderedExercises(CATALOG, 'recent', COUNTS, LASTS))).toStrictEqual(['a', 'b', 'c']);
  });

  test('counts and creation dates move nothing in the recent order', () => {
    expect(ids(orderedExercises(CATALOG, 'recent', { a: 0, b: 100, c: 100 }, LASTS))).toStrictEqual(['a', 'b', 'c']);
    // Same log, catalog handed back oldest-created first: the result is identical.
    const reversed = [...CATALOG].reverse();
    expect(ids(orderedExercises(reversed, 'recent', COUNTS, LASTS))).toStrictEqual(['a', 'b', 'c']);
  });

  // An exercise with no row was never practiced, which is not the same as practiced long
  // ago: it lands behind every logged one, whatever its creation date says.
  test('an exercise with no logged session lands last', () => {
    const rows = [exercise('never', '2026-11-02T12:00:00Z'), ...CATALOG];
    expect(ids(orderedExercises(rows, 'recent', COUNTS, LASTS))).toStrictEqual(['a', 'b', 'c', 'never']);
  });

  test('among exercises never logged, the newer creation date decides', () => {
    // Nothing separates them on the log, so the read's own order is what a run of empty
    // exercises keeps - it is not a rule about practice, it is the tie-break.
    const rows = [exercise('x', '2026-11-01T12:00:00Z'), exercise('y', '2026-10-11T12:00:00Z')];
    expect(ids(orderedExercises(rows, 'recent', {}, {}))).toStrictEqual(['x', 'y']);
  });

  test('two exercises practiced at the same instant keep the order the fetch gave', () => {
    const tied = { p: '2026-10-15T09:00:00Z', q: '2026-10-15T09:00:00Z' };
    const rows = [exercise('p', '2026-11-01T12:00:00Z'), exercise('q', '2026-10-01T12:00:00Z')];
    expect(ids(orderedExercises(rows, 'recent', {}, tied))).toStrictEqual(['p', 'q']);
  });
});

describe('the most-trained exercise leads', () => {
  test('rows sort by their count, highest first', () => {
    expect(ids(orderedExercises(CATALOG, 'most_sessions', COUNTS, LASTS))).toStrictEqual(['b', 'c', 'a']);
  });

  // The count map is built per exercise id seen in the log, so an exercise never logged
  // has no entry at all. Zero, not undefined, is what keeps it comparable - and it still
  // lands behind every exercise with a row.
  test('an exercise with no row counts as zero and lands last', () => {
    const rows = [exercise('never', '2026-11-02T12:00:00Z'), ...CATALOG];
    expect(ids(orderedExercises(rows, 'most_sessions', COUNTS, LASTS))).toStrictEqual(['b', 'c', 'a', 'never']);
  });

  test('equal counts fall back to the newest workout', () => {
    // Counts tie at 5; `a` was practiced later than `c` even though it was created first.
    const rows = orderedExercises(CATALOG, 'most_sessions', { a: 5, b: 5, c: 5 }, LASTS);
    expect(ids(rows)).toStrictEqual(['a', 'b', 'c']);
  });

  test('the count order ends on the same tie-breaks as the recent order', () => {
    // Zero counts tie: no session dates to compare, so creation decides, newest first.
    expect(ids(orderedExercises(CATALOG, 'most_sessions', {}, {}))).toStrictEqual(['c', 'b', 'a']);
  });

  test('a run of exercises never logged keeps the order the list had', () => {
    const tied = [exercise('x', '2026-10-10T12:00:00Z'), exercise('y', '2026-10-10T12:00:00Z')];
    expect(ids(orderedExercises(tied, 'most_sessions', {}, {}))).toStrictEqual(['x', 'y']);
  });
});

describe('the sort does not touch what the fetch handed back', () => {
  test('the input array keeps its own order', () => {
    const before = ids(CATALOG);
    orderedExercises(CATALOG, 'recent', COUNTS, LASTS);
    orderedExercises(CATALOG, 'most_sessions', COUNTS, LASTS);
    expect(ids(CATALOG)).toStrictEqual(before);
  });

  test('both orders return a permutation, never a filtered or duplicated list', () => {
    const counts = { a: 4, c: 4 };
    const lasts = { ...LASTS, d: '2026-11-01T09:00:00Z' };
    const rows = [...CATALOG, exercise('d', '2026-09-01T12:00:00Z')];
    for (const order of LIST_ORDERS) {
      const sorted = orderedExercises(rows, order, counts, lasts);
      expect(sorted).toHaveLength(rows.length);
      expect(ids(sorted).sort()).toStrictEqual(ids(rows).sort());
    }
    expect(orderedExercises([], 'recent', {}, {})).toStrictEqual([]);
  });

  // A save on the session screen adds the day's row; the list re-reads and re-sorts, so
  // what decides is the newest timestamp the read produced, not a stored flag.
  test('a new session moves an exercise to the front of both orders', () => {
    const after = { ...LASTS, c: '2026-11-02T14:20:00Z' };
    expect(ids(orderedExercises(CATALOG, 'recent', COUNTS, after))).toStrictEqual(['c', 'a', 'b']);
    expect(ids(orderedExercises(CATALOG, 'most_sessions', { ...COUNTS, c: 7 }, after))).toStrictEqual(['b', 'c', 'a']);
  });
});
