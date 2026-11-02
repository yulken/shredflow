import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Scope: the claims about the session screen that no runtime check would notice,
// read off the source the way `chart-source.test.ts` reads the dashboard. None of
// them is visible without a browser: a chart that a hidden exercise turns into an
// empty plot is only visible by hiding one, an empty chart that answers with the
// dashboard's wording is only visible before the first save, a background refresh
// that swaps the history list for its skeleton is only visible on return to the
// tab, and a tab-URL write that carried the other columns would silently rewrite
// the exercise while looking like it only stored a link. The arithmetic behind
// them is pinned elsewhere: `src/lib/bpm.test.ts`, `src/lib/__tests__/chart.test.ts`
// and `period.test.ts`.
const view = readFileSync(fileURLToPath(new URL('../SessionView.tsx', import.meta.url)), 'utf8');

describe('the session screen plots its own exercise', () => {
  test('it draws the dashboard chart with this exercise alone', () => {
    expect(view).toContain('sessions={sessions}');
    expect(view).toContain('period="all"');
    // The window is not read from the persisted dashboard period: this screen has
    // no control that could change it, so a window it obeyed would be invisible.
    expect(view).not.toContain('useChartPeriod');
    expect(view).not.toMatch(/localStorage\./);
  });

  test('the dashboard visibility flag does not decide the plot', () =>
    // An exercise hidden from the dashboard is still the exercise being practiced,
    // so its series must be drawn here; the flag filters the dashboard only.
    expect(view).toContain('exercises={[{ ...exercise, dashboard_visible: true }]}'));

  // Before the first save there is nothing to plot, and the chart's own empty state
  // talks about exercises shown on the chart - wording that belongs to the dashboard.
  // The negative is scoped to the call so the prose around it may name the key.
  test('the chart appears only once something is logged', () => {
    expect(view).toMatch(/\{sessions\.length > 0 && \(/);
    expect(view).not.toMatch(/t\('chart_empty/);
  });

  test('it sits below the list, not beside the form', () => {
    // The history column is the one that holds the rows the chart plots, so the
    // order of the two headings is the placement: reading the points and the
    // entries that made them in one pass down the column. The import sits at the
    // top of the file, so the claim reads the JSX element, not the name.
    expect(view.indexOf("t('history_title')")).toBeLessThan(view.indexOf('<ProgressChart'));
    // A card pinned at the top never reveals what sits past the fold, and the card
    // is taller than the viewport once the chart joins it.
    expect(view).not.toMatch(/sticky top-6/);
  });

  test('it asks for the quiet variant of the chart', () => {
    // One series needs no legend, and a narrow column needs fewer marks. The axis
    // itself stays, so the window and the scale are still read off it - only the
    // marks around it are less loud.
    expect(view).toMatch(/<ProgressChart[^>]*\bcompact\b[^>]*\/>/);
    // The knobs this replaced are gone: quiet is one decision, not three.
    expect(view).not.toMatch(/showLegend|showAxisLabels/);
  });

  test('the saved session lands in the plot through the same re-read', () => {
    // The trigger writes the row and the stats on insert, so one re-read covers the
    // new point and the Record/Last cards together.
    expect(view).toMatch(/await refreshAll\(\);/);
    expect(view).toMatch(/supabase\s*\n?\s*\.from\('practice_sessions'\)/);
  });
});

describe('a session screen left open re-reads itself', () => {
  test('the screen schedules both boundaries', () => {
    expect(view).toContain('useDayRollover(refreshAll)');
    expect(view).toContain('useRefreshOnVisible(refreshAll)');
  });

  // The timer anchors midnight when the effect runs; a callback whose identity
  // changed on re-render would push the fire forward every time.
  test('the callback it schedules has a stable identity', () => {
    expect(view).toMatch(/const refreshAll = useCallback\(async/);
    expect(view).toMatch(/const refreshAll = useCallback\([^]*?\}, \[exercise\.id\]\)/);
  });

  test('sessions and stats are re-read together', () => {
    // Another device's insert moves the points and the record the trigger wrote;
    // reading one of the two leaves a card disagreeing with the chart it sits beside.
    expect(view).toMatch(/const \[sessionsRes, statsRes\] = await Promise\.all\(\[/);
    expect(view).toMatch(/\.eq\('exercise_id', exercise\.id\)/);
    expect(view).toMatch(/select\('max_bpm, last_bpm'\)/);
  });

  test('a background refresh keeps the list on screen', () => {
    expect(view).toContain('if (!background) setLoadingHistory(true)');
    expect(view).toContain('if (!background) setLoadingHistory(false)');
    expect(view).not.toMatch(/^\s*setLoadingHistory\((?:true|false)\);$/m);
  });

  test('two triggers in the same instant make one round trip', () => {
    // A focus and a midnight timer can land together, but a save must not be
    // swallowed by one: the re-read it awaits is the one that shows the new row.
    expect(view).toMatch(/if \(background && inFlight\.current\) return;/);
    expect(view).toContain('inFlight.current = true');
    expect(view).toContain('inFlight.current = false');
  });

  test('the refresh is not a poll and filters nothing by date', () => {
    // The one timer in this screen is the save confirmation, not a refetch hand.
    expect(view).not.toMatch(/setInterval/);
    expect(view).not.toMatch(/\.gte\(|\.lt\(|\.range\(/);
  });
});

describe('the tab URL on the session screen', () => {
  test('a stored URL is shown as an external link', () => {
    expect(view).toContain('href={tabUrl}');
    expect(view).toContain('target="_blank"');
    expect(view).toContain('rel="noopener noreferrer"');
    expect(view).toContain("aria-label={t('link_tab_aria')}");
  });

  test('both ways of reaching the editor are named', () => {
    expect(view).toContain("aria-label={t('aria_add_tab_url')}");
    expect(view).toContain("aria-label={t('aria_edit_tab_url')}");
  });

  test('the write is one column, targeted by id', () => {
    // The rest of the row belongs to the catalog form: a payload that carried the
    // other fields would rewrite the exercise while only a URL was being stored.
    expect(/update\(\{ tab_url: value \}\)\.eq\('id', exercise\.id\)/.test(view)).toBe(true);
    expect(view.match(/supabase\.from\([^)]*\)\.update/g)?.length).toBe(1);
  });

  test('the value is validated before it is written', () => {
    // The same normalization the catalog form uses: the link is a URL that was
    // parsed, not typed text, so an invalid one says so instead of reaching the DB.
    expect(view).toMatch(/new URL\(tabDraft\.trim\(\)\)\.href/);
    expect(view).toContain("t('error_invalid_url')");
    expect(view).toContain("t('error_update_exercise')");
  });

  test('clearing the field stores nothing', () => {
    // `null` is what the column holds when there is no tab, and the link renders
    // from that state, so clearing removes the link rather than leaving a stale one.
    expect(view).toMatch(/let value: string \| null = null;/);
    expect(view).toContain('setTabUrl(value)');
  });
});
