import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Scope: the two wiring claims that no runtime check would notice, read off the
// source the way `bpm.test.ts` reads the migration. Neither is testable over the
// components themselves (no DOM in this suite): a color that shifts when a series
// is hidden is a visual regression, and a visibility control that navigates
// instead of writing is only visible by clicking.
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

  test('the legend stays where it is and carries no control', () => {
    // No `position:` anywhere means the legend keeps Chart.js' default top, and no
    // legend-side toggling: the eye in the catalog is the control.
    expect(chart).not.toContain('position:');
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
