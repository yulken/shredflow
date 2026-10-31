import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Scope: the wiring claims that no runtime check would notice, read off the
// source the way `bpm.test.ts` reads the migration. None of them is testable over
// the components themselves (no DOM in this suite): a color that shifts when a
// series is hidden is a visual regression, a visibility control that navigates
// instead of writing is only visible by clicking, and an axis that densifies into
// daily gridlines or prints a clock time is only visible on screen. The pure date
// rule lives in `src/lib/chart.ts` and is tested directly in `src/lib/__tests__/chart.test.ts`.
const chart = readFileSync(fileURLToPath(new URL('../ProgressChart.tsx', import.meta.url)), 'utf8');
const dashboard = readFileSync(fileURLToPath(new URL('../Dashboard.tsx', import.meta.url)), 'utf8');

describe('the palette position survives a visibility change', () => {
  test('color comes from the whole exercise list, not the visible subset', () => {
    // The index map is built over the created_at-sorted list before visibility is
    // applied, so turning one exercise off leaves the rest on their colors.
    expect(/const paletteIndex = new Map\(byCreation\.map\(\(e, i\) => \[e\.id, i\]\)/.test(chart)).toBe(true);
    expect(/borderColor: PALETTE\[index % PALETTE\.length\]/.test(chart)).toBe(true);
    // The dataset position is the series index, never the palette index: an
    // unfiltered `i` here would recolor every series after a toggle.
    expect(/PALETTE\[i %/.test(chart)).toBe(false);
  });

  test('visibility only decides which series is drawn', () => {
    expect(/const visible = byCreation\.filter\(\(e\) => e\.dashboard_visible\)/.test(chart)).toBe(true);
  });

  test('the legend carries no control', () => {
    // No click handler inside the canvas: the eye in the catalog is the one
    // control that changes `dashboard_visible`, and a second one here would
    // disagree with what the database stores.
    expect(chart).not.toMatch(/onClick/);
  });
});

describe('the legend sits beside the plot', () => {
  test('it is lateral and top-aligned, not above the axis', () => {
    // The Y-axis title already occupies the left, so the series list goes right;
    // vertical stacking keeps the plot wide instead of trading height for a row.
    expect(chart).toContain("position: 'right'");
    expect(chart).toContain("align: 'start'");
  });
});

describe('the X axis marks weekly subdivisions only', () => {
  test('the tick unit is fixed to week', () => {
    // Chart.js draws one grid line per tick, so a fixed unit is what stops the
    // axis densifying ticks into days/hours. `stepSize: 1` = every week.
    expect(chart).toMatch(/time: \{ unit: 'week', stepSize: 1, tooltipFormat: 'PP' \}/);
    // Deliberately no `isoWeekday`: the adapter's own `week` start
    // (`weekStartsOn: 0`) is the alignment that was chosen. Both negatives are
    // scoped to the `time` object - the prose in the component names these options
    // to say they are absent, so a plain `not.toContain` would hit the comment.
    expect(chart).not.toMatch(/time: \{[^}]*isoWeekday/);
    expect(chart).not.toMatch(/time: \{[^}]*displayFormats/);
    expect(chart).toMatch(/callback: \(v\) => tickDateLabel\(Number\(v\), dateLocale\(\), withYear\)/);
  });

  test('no label carries a clock time', () => {
    // A practice log is a day, not a moment, and the seeded rows carry an
    // invented 12:00 UTC timestamp that nobody logged.
    expect(chart).not.toMatch(/hour:/);
    expect(chart).not.toMatch(/minute:/);
    expect(chart).not.toMatch(/tooltipFormat: 'PP p'/);
    expect(chart).not.toContain('toLocaleString');
  });

  test('the tooltip title uses the same helper as the ticks', () => {
    expect(chart).toContain('tooltipDateLabel(x, dateLocale(), withYear)');
  });
});

describe('the year is conditional on what is plotted', () => {
  test('it is decided by the drawn points, not by every session', () => {
    // A series hidden by `dashboard_visible` must not change what the axis says.
    expect(chart).toMatch(/const drawn = series\.flat\(\)/);
    expect(chart).toContain('withYear: spansMultipleYears(drawn)');
    // Both labels read the same flag, so the axis and the tooltip never disagree.
    expect(chart).toMatch(/callback: \(\w+\) => tickDateLabel\(.*withYear\)/);
  });
});

describe('the eye in the catalog writes dashboard_visible', () => {
  test('the visibility cell is a button that stops the row from navigating', () => {
    expect(dashboard).toContain('aria-pressed={exercise.dashboard_visible}');
    // One handler does both: the row must not navigate, and the flag must be
    // written - in that order, so the click never opens the exercise view.
    expect(/onClick=\{\(e\) => \{[^}]*e\.stopPropagation\(\);[^}]*toggleOnChart\(exercise\)/.test(dashboard)).toBe(true);
    // A badge would render the flag but never change it: this is the bug the
    // control replaced. The old `title` named the stored state (`visibility_show`
    // while already visible); the button's names the action the click takes.
    expect(/title=\{exercise\.dashboard_visible \? t\('visibility_show'\)/.test(dashboard)).toBe(false);
  });

  test('the write targets one row by id', () => {
    expect(/update\(\{ dashboard_visible: next \}\)\.eq\('id', exercise\.id\)/.test(dashboard)).toBe(true);
  });

  test('a failed write puts the value back and names the failure', () => {
    // The chart redraws off local state before the round trip finishes, so the
    // optimistic value has to be reverted - otherwise the UI shows a series the
    // database never accepted.
    expect(/apply\(exercise\.dashboard_visible\)/.test(dashboard)).toBe(true);
    expect(dashboard).toContain("t('error_update_exercise')");
  });
});
