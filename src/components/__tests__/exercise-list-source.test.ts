import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { EN } from '@/lib/locales/en';
import { ES } from '@/lib/locales/es';
import { PT } from '@/lib/locales/pt';

// Scope: the check that marks the exercise practiced today, the order the cards are
// shown in, and the wiring that keeps both honest. Two things no run in this suite
// would notice: the day it names is the local day the log turns on - a tab left open
// past midnight would otherwise go on marking yesterday - and the name a screen reader
// reads where the tile's green is the only signal. Both are read off the source like the
// other wiring claims, because no DOM exists here. The card's layout claims stay in
// `touch-targets.test.ts`; nothing below re-pins a class.
const list = readFileSync(fileURLToPath(new URL('../ExerciseList.tsx', import.meta.url)), 'utf8');
const rollover = readFileSync(fileURLToPath(new URL('../../hooks/useDayRollover.ts', import.meta.url)), 'utf8');
const orderHook = readFileSync(fileURLToPath(new URL('../../hooks/useListOrder.ts', import.meta.url)), 'utf8');
const dashboard = readFileSync(fileURLToPath(new URL('../Dashboard.tsx', import.meta.url)), 'utf8');
const dictionaries: Record<string, Record<string, string>> = {
  en: EN.strings as Record<string, string>,
  pt: PT.strings as Record<string, string>,
  es: ES.strings as Record<string, string>,
};

// The tile block, read as the source writes it: the claims below about the control's
// shape are about this span alone, not about the card around it. `')}'` closes the
// conditional, but the tile's own `t('practiced_today')}` matches it too, so the slice
// ends on the element rather than on the first brace it finds.
const tileStart = list.indexOf('{practiced && (');
const tile = list.slice(tileStart, list.indexOf('</span>', tileStart) + '</span>'.length);

describe('the check names the day the log turns on', () => {
  // The day is a calendar day, not an elapsed span: `clock.ts` owns the rule for the
  // one-record-per-day guard in `SessionView.tsx`, and the check has to ask the same
  // question the same way. A comparison built here would drift from the boundary the
  // rollover refreshes on.
  test('the day rule is read from lib/clock, not copied into the screen', () => {
    expect(list).toContain("import { isSameLocalDay } from '@/lib/clock';");
    expect(list).toContain('todays[id] = isSameLocalDay(new Date(lasts[id]), now);');
    // The day is read off calendar fields, not off a date string: `toISOString()` or a
    // slice of `created_at` is UTC, and a row logged near midnight would land on the
    // wrong day while the rollover turns on the local one.
    expect(list).not.toMatch(/toISOString|\.\slice\(0, 10\)/);
  });

  // One instant answers every card: a Date built per row would let a refresh that
  // straddles midnight mark one exercise by yesterday and another by today.
  test('one clock answers the whole list, asked once per refresh', () => {
    expect(list).toContain('const now = new Date();');
    expect(list.match(/isSameLocalDay\(/g)).toHaveLength(1);
  });

  // The log is the source of the fact: the exercise row carries no day flag, so a
  // delete of the day's record and the day boundary are the only ways the check clears.
  test('the day is derived from the sessions, never written to the exercise', () => {
    expect(list).toContain(".select('exercise_id, created_at')");
    // The write the form makes ends on the visibility flag: no day field joins it.
    expect(list).toContain('dashboard_visible: visible,');
    expect(list).toMatch(/dashboard_visible: visible,\n *\};/);
  });
});

describe('the tile shows only where the day has a record', () => {
  test('the render is gated on the derived flag', () => {
    expect(list).toContain('const practiced = practicedToday[exercise.id] ?? false;');
    expect(list).toContain('{practiced && (');
    expect(tile).toContain('<Check className="h-3.5 w-3.5" />');
  });

  // It marks the day, and the day is what the row beside it already reports - the
  // session count and the newest record. Up by the title it would read as a badge on
  // the name; there it is one more chip in the line that wraps on a phone.
  test('it sits on the stat row, not beside the title', () => {
    expect(list.indexOf('</h3>')).toBeLessThan(tileStart);
    expect(list.indexOf('border-t')).toBeLessThan(tileStart);
    // Leading in the chip group, so a wrapped row keeps it with the chips.
    expect(tileStart).toBeLessThan(list.indexOf('{exercise.category && ('));
    expect(list).not.toContain('CheckCircle2');
  });

  // Quiet: no tile, no background, no ring. Green at 14px carries the mark on its own,
  // and a chip here would compete with the ones beside it.
  test('it is a bare icon, not a badge', () => {
    expect(tile).not.toContain('bg-accent');
    expect(tile).not.toContain('rounded');
    expect(tile).not.toContain('inline-flex');
  });

  // Status, not a control: the card already navigates on the same tap, so a clickable
  // tile would answer a second thing for one finger, and a hit area would be a target
  // with no action behind it.
  test('it carries no click guard and no hit area', () => {
    expect(tile).not.toContain('onClick');
    expect(tile).not.toContain('before:-inset');
    expect(tile).not.toContain('active:scale');
  });

  // Green alone is not a name, and a phone has no hover to reveal a tooltip.
  test('a reader names it', () => {
    expect(tile).toContain('role="img"');
    expect(tile).toContain("aria-label={t('practiced_today')}");
    expect(tile).toContain("title={t('practiced_today')}");
  });

  test('the title is still rendered once', () => {
    // The tile marks the day; it must not restate the exercise's name.
    expect(list.match(/\{exercise\.title\}/g)).toHaveLength(1);
  });
});

describe('a list left open refreshes the check', () => {
  test('the screen schedules both boundaries', () => {
    expect(list).toContain('useDayRollover(fetchData)');
    expect(list).toContain('useRefreshOnVisible(fetchData)');
  });

  // The timer's deadline is anchored when the effect runs, so a callback that changes
  // identity re-anchors it at the current day's midnight on every re-render - the form
  // modal re-renders this screen - and midnight would never be reached.
  test('the fetch it schedules has a stable identity', () => {
    expect(/const fetchData = useCallback\(async/.test(list)).toBe(true);
    expect(/const fetchData = useCallback\([^]*?\}, \[\]\)/.test(list)).toBe(true);
  });

  // A save or a delete moved the day's row, so the read that follows cannot be
  // dropped by a background trigger still in flight.
  test('the explicit re-read after a save or a delete always runs', () => {
    expect(list).toContain('if (background && inFlight.current) return;');
    // The mount, the delete and the save.
    expect(list.match(/fetchData\(\)/g)).toHaveLength(3);
  });

  test('the day arithmetic stays in lib/, not in a timer the screen writes', () => {
    expect(list).not.toMatch(/setTimeout|setInterval/);
    expect(rollover).toContain('msUntilMidnight(new Date())');
  });
});

describe('the label the tile names itself with', () => {
  // Key parity is the dictionaries' own claim (`locales.test.ts`); this one is about
  // the call site: a rename in the component would fall back to the bare key on screen.
  test('every dictionary carries the key the tile asks for', () => {
    for (const code of Object.keys(dictionaries)) {
      expect('practiced_today' in dictionaries[code]).toBe(true);
    }
    expect(list.match(/t\('practiced_today'\)/g)).toHaveLength(2);
  });
});

describe('the cards are put in the order the control names', () => {
  // The comparison lives in `lib/order.ts` so `order.test.ts` can check it without a
  // render; a sort written in the screen would be untestable and would drift from the
  // tie-break the count order needs.
  test('the rules come from lib/order, not from a sort in the screen', () => {
    expect(list).toContain("import { LIST_ORDERS, LIST_ORDER_LABEL_KEYS, orderedExercises } from '@/lib/order';");
    expect(list).toContain('const rows = orderedExercises(exercises, order, sessionCounts, lastSessions);');
    expect(list).toContain('{rows.map(');
    expect(list).not.toMatch(/\.sort\(|\.toSorted\(/);
    // The read still asks for creation order, and only as the last tie-break: without an
    // ORDER BY Postgres returns whatever it likes, and exercises with no session have
    // nothing on the log to compare.
    expect(list).toContain(".order('created_at', { ascending: false })");
  });

  // Both facts the orders compare are already in state from the same read the chips and
  // the day check use, so ordering costs no round trip: the REST API cannot order a
  // parent by its children - not by how many there are, nor by the newest one.
  test('the sort reads the session data the list already holds', () => {
    expect(list).toContain("from('practice_sessions')");
    expect(list).toContain('orderedExercises(exercises, order, sessionCounts, lastSessions)');
    // No second read for a click: only the one refresh the fetch has always made.
    expect(list.match(/from\('practice_sessions'\)/g)).toHaveLength(1);
  });

  // Segmented and pressed, like the chart's period buttons: a select would hide which
  // order is on screen, and an alternating toggle cannot say which of the two is chosen.
  test('the control names both orders and marks the one in use', () => {
    expect(list).toContain('role="group" aria-label={t(\'list_order_label\')}');
    expect(list).toContain('{LIST_ORDERS.map((o) => (');
    expect(list).toContain('aria-pressed={order === o}');
    expect(list).toContain('onClick={() => setOrder(o)}');
    expect(list).toContain('{t(LIST_ORDER_LABEL_KEYS[o])}');
    expect(list).not.toContain('<select');
    expect(list.match(/t\(LIST_ORDER_LABEL_KEYS\[o\]\)/g)).toHaveLength(1);
    for (const code of Object.keys(dictionaries)) {
      expect('list_order_label' in dictionaries[code]).toBe(true);
      expect('order_recent' in dictionaries[code]).toBe(true);
      expect('order_most_sessions' in dictionaries[code]).toBe(true);
    }
  });

  // A preference of the screen, not a field of the exercise: the only write the list
  // makes is the visibility flag, so an order click must not reach the database.
  test('a click changes the view, and persists through the hook', () => {
    expect(list).toContain('const { order, setOrder } = useListOrder();');
    expect(list).not.toMatch(/localStorage\./);
    expect(list.match(/supabase\.from\([^)]*\)\.update/g)?.length).toBe(1);
    expect(orderHook).toContain('localStorage.setItem(LIST_ORDER_STORAGE_KEY, order)');
    expect(orderHook).toContain('localStorage.getItem(LIST_ORDER_STORAGE_KEY)');
    expect(orderHook).toContain('if (isListOrder(stored)) return stored;');
    expect(orderHook).toContain('return DEFAULT_LIST_ORDER;');
  });

  // Decided with Caio: the dashboard's catalog keeps title / Max / Last / eye in
  // creation order, so the control cannot leak into that table.
  test('the dashboard stays out of it', () => {
    expect(dashboard).not.toContain('@/lib/order');
    expect(dashboard).not.toContain('useListOrder');
    expect(dashboard).toContain(".order('created_at', { ascending: true })");
  });
});
