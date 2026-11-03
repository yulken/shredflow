import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Scope: the wiring claims that no runtime check would notice, read off the
// source the way `bpm.test.ts` reads the migration. None of them is testable over
// the components themselves (no DOM in this suite): a color that shifts when a
// series is hidden is a visual regression, a visibility control that navigates
// instead of writing is only visible by clicking, a period control that filtered
// the stored records instead of the points would only show in the numbers, an axis
// that densifies into daily gridlines or prints a clock time is only visible on
// screen, and a screen that never re-reads its rows is only visible days later. The
// pure rules live in `src/lib/chart.ts`, `src/lib/period.ts` and `src/lib/clock.ts`,
// tested directly in `src/lib/__tests__/chart.test.ts`, `period.test.ts` and
// `clock.test.ts`.
const chart = readFileSync(fileURLToPath(new URL('../ProgressChart.tsx', import.meta.url)), 'utf8');
const dashboard = readFileSync(fileURLToPath(new URL('../Dashboard.tsx', import.meta.url)), 'utf8');
const hook = readFileSync(fileURLToPath(new URL('../../hooks/useChartPeriod.ts', import.meta.url)), 'utf8');
const rollover = readFileSync(fileURLToPath(new URL('../../hooks/useDayRollover.ts', import.meta.url)), 'utf8');
const visible = readFileSync(fileURLToPath(new URL('../../hooks/useRefreshOnVisible.ts', import.meta.url)), 'utf8');

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

describe('the legend follows the width the plot is drawn in', () => {
  test('a wide plot keeps it lateral and top-aligned', () => {
    // The Y-axis title already occupies the left, so the series list goes right;
    // vertical stacking keeps the plot wide instead of trading height for a row.
    expect(chart).toMatch(/position: narrow \? 'top' : 'right'/);
    expect(chart).toMatch(/align: narrow \? 'center' : 'start'/);
    // No unconditional position: on a phone the list would eat width the series need.
    expect(chart).not.toMatch(/position: 'right'/);
  });

  test('the width is measured, not guessed from the viewport', () => {
    // A narrow column on a wide screen is narrow for the chart too (the session
    // view's history card is one), and a CSS media query answers the viewport.
    expect(chart).toContain('const NARROW_PX = 480');
    expect(chart).toMatch(/new ResizeObserver\(/);
    expect(chart).toMatch(/width > 0 && width < NARROW_PX/);
  });

  test('whether it is drawn is the caller\'s', () => {
    // The dashboard plots every visible series and needs the list; a screen that
    // plots one exercise does not. Off at the caller, not off here.
    expect(chart).toMatch(/compact = false/);
    expect(chart).toMatch(/display: !compact/);
  });
});

describe('a narrow plot caps its labels and its height', () => {
  test('the X axis stops packing labels', () => {
    // Digit labels are short enough that `autoSkip` lets more of them into a phone's
    // box. A wide plot gets no cap and still draws every mark the unit chose.
    expect(chart).toMatch(/maxTicksLimit: narrow \? 5 : undefined/);
    expect(chart).not.toMatch(/maxTicksLimit: 5\b/);
  });

  test('the plot is shorter there, and the skeleton matches', () => {
    // The legend moved above the axis, so a 360px plot on a 640px screen would leave
    // nothing of the page below it. Desktop keeps the height it has always drawn.
    expect(chart).toContain('h-[260px] sm:h-[360px]');
    expect(dashboard).toContain('h-[260px] sm:h-[360px]');
  });
});

describe('the quiet variant keeps the axis and thins its marks', () => {
  test('the density is the caller\'s, in both scales', () => {
    // Chart.js draws one grid line per tick, so stepping two units halves the guides
    // and the labels together; the limit on the Y axis caps ticks and lines in one
    // go, which is what a narrow column needs instead of a ladder.
    expect(chart).toMatch(/stepSize: compact \? 2 : 1/);
    expect(chart).toMatch(/maxTicksLimit: compact \? 4 : undefined/);
    // The quiet variant shrinks its own labels; the dashboard keeps Chart.js' own
    // size, because that is what it has always drawn.
    expect(chart).toMatch(/font: compact \? \{ size: 10 \} : undefined/);
    // The dashboard gets neither: it keeps every mark the unit chose.
    expect(chart).not.toMatch(/stepSize: 2\b/);
    expect(chart).not.toMatch(/maxTicksLimit: 4\b/);
  });

  test('the guide lines are dimmer there, never gone', () => {
    // They carry the subdivisions `tickUnit` chose; the tick marks under the labels
    // never did, and were already off.
    expect(chart).toMatch(/const GRID = 'rgba\(107, 114, 128, 0\.12\)'/);
    expect(chart).toMatch(/const GRID_QUIET = 'rgba\(107, 114, 128, 0\.06\)'/);
    expect(chart).toMatch(/grid: \{ color: compact \? GRID_QUIET : GRID, drawTicks: false \}/);
    expect(chart).toMatch(/grid: \{ color: compact \? GRID_QUIET : GRID \}/);
    // Nothing turns an axis off: the quiet variant still draws its labels.
    expect(chart).not.toMatch(/display: false/);
  });

  test('the axis title is the one label the quiet variant drops', () => {
    // The tooltip names the unit for every point, so the numbers stay readable and
    // the name beside them goes.
    expect(chart).toMatch(/title: \{ display: !compact, text: percent \? t\('song_chart_y_axis'\) : t\('chart_y_axis'\)/);
    expect(chart).toMatch(/callback: \(v\) => tickDateLabel\(Number\(v\), dateLocale\(\), withYear\)/);
  });
});

describe('the X axis marks readable subdivisions for the window drawn', () => {
  test('the tick unit comes from the points, not from a constant', () => {
    // Chart.js draws one grid line per tick, so the unit is what stops the axis
    // densifying into days/hours. A hardcoded 'week' would put 52 lines on a year.
    expect(chart).toMatch(/unit: tickUnit\(drawn\)/);
    expect(chart).toMatch(/time: \{ unit, stepSize: compact \? 2 : 1, tooltipFormat: 'PP' \}/);
    // Deliberately no `isoWeekday`: the adapter's own `week` start
    // (`weekStartsOn: 0`) is the alignment that was chosen. Both negatives are
    // scoped to the `time` object - the prose around it names these options to
    // say they are absent, so a plain `not.toContain` would hit the comment.
    expect(chart).not.toMatch(/time: \{[^}]*isoWeekday/);
    expect(chart).not.toMatch(/time: \{[^}]*displayFormats/);
    expect(chart).toMatch(/callback: \(v\) => tickDateLabel\(Number\(v\), dateLocale\(\), withYear\)/);
  });

  test('the axis shape follows the filtered points', () => {
    // `drawn` is what the datasets hold after both filters, so hiding a series or
    // narrowing the period decides the unit and the year together.
    expect(chart).toMatch(/const inPeriod = filterSessions\(sessions, period, now\)/);
    expect(chart).toMatch(/const drawn = series\.flat\(\)/);
    expect(chart).toContain('withYear: spansMultipleYears(drawn)');
    expect(chart).toContain('unit: tickUnit(drawn)');
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

describe('the period control filters points, not records', () => {
  test('the filter is applied to the sessions before the series are built', () => {
    expect(chart).toMatch(/const inPeriod = filterSessions\(sessions, period, now\)/);
    // The window is anchored once per recomputation, and `period` is a dependency:
    // a control click has to rebuild the points, not be read at draw time only.
    expect(chart).toMatch(/const now = new Date\(\)/);
    expect(chart).toMatch(/\}, \[exercises, sessions, percentPoints, percentLabel, period\]/);
  });

  test('an empty window says so, separately from having nothing logged', () => {
    // Otherwise "no sessions in the last month" reads as "no sessions at all".
    expect(chart).toContain("t(hasAnySession ? 'chart_empty_period' : 'chart_empty')");
  });

  test('the catalog keeps the stored records', () => {
    // Max/Last come from the trigger, so the period must not reach them: the
    // table cells read the columns, and nothing filters the fetch by date.
    expect(dashboard).toContain('{exercise.max_bpm ??');
    expect(dashboard).toContain('{exercise.last_bpm ??');
    expect(dashboard).not.toMatch(/\.gte\(|\.lt\(|\.range\(/);
  });

  test('the catalog row carries no tab link', () => {
    // The row navigates to the exercise's own screen, which shows the link and
    // edits it; repeating it here put a second brand-red thing beside the title,
    // floating between the name and the numbers, and needed its own click guard.
    expect(dashboard).not.toMatch(/tab_url|field_tab_url|link_tab_aria/);
  });

  test('the control is a group of four buttons, and writes nothing', () => {
    expect(dashboard).toMatch(/role="group" aria-label=\{t\('chart_period_label'\)/);
    expect(dashboard).toMatch(/PERIODS\.map\(\(p\) =>/);
    expect(dashboard).toMatch(/aria-pressed=\{period === p\}/);
    expect(dashboard).toMatch(/onClick=\{\(\) => setPeriod\(p\)\}/);
    expect(dashboard).toMatch(/period=\{period\}/);
    // The only write the dashboard makes is the visibility flag; a period click
    // must not become a database write.
    expect(dashboard.match(/supabase\.from\([^)]*\)\.update/g)?.length).toBe(1);
  });

  test('the window is persisted by the hook, not by the screen', () => {
    // Same shape as the language: read once at mount, validated, written back. The
    // screen's prose names `localStorage` to say it does not touch it, so the
    // negative is scoped to a call rather than the word.
    expect(dashboard).not.toMatch(/localStorage\./);
    expect(hook).toContain('localStorage.getItem(PERIOD_STORAGE_KEY)');
    expect(hook).toContain('localStorage.setItem(PERIOD_STORAGE_KEY, period)');
    expect(hook).toContain('if (isPeriod(stored)) return stored;');
    expect(hook).toContain('return DEFAULT_PERIOD;');
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

// The song screen plots the other unit on the same canvas (decision D1): Y is the played
// percent of one song, and nothing about the exercise chart may leak into it. Both shapes
// are built in one `useMemo`, so the claims are read off the branch that answers each.
describe('the percent axis answers a different question', () => {
  test('percent points are filtered by the same window as sessions', () => {
    expect(chart).toMatch(/const inPeriod = percentPoints\.filter\(\(p\) => withinPeriod\(p\.date\.toISOString\(\), period, now\)\)/);
    // The axis shape follows the points drawn, exactly as the BPM branch: a day outside
    // the window cannot decide the tick unit or whether the year is printed.
    expect(chart).toMatch(/const days = inPeriod\.map\(\(p\) => \(\{ created_at: p\.date\.toISOString\(\) \}\)/);
    expect(chart).toContain('withYear: spansMultipleYears(days)');
    expect(chart).toContain('unit: tickUnit(days)');
  });

  test('the scale stops at 100, because a percent is a share', () => {
    // BPM has no ceiling; a percent does. Without the cap a song at 30% draws a plot
    // that looks finished, because the axis only spans the points.
    expect(chart).toMatch(/max: percent \? 100 : undefined/);
    expect(chart).not.toMatch(/max: 100\b/);
    expect(chart).toMatch(/beginAtZero: true/);
  });

  test('the tooltip says the share, not the BPM arithmetic', () => {
    // The percent arm reads the point it was drawn from; `percentSeries` is empty on the
    // BPM branch, so the two arms never answer for the same dataset.
    expect(chart).toMatch(/const point = percentSeries\[ctx\.datasetIndex\]\?\.\[ctx\.dataIndex\]/);
    expect(chart).toContain("t('songs_percent_caption', { count: formatPercent(point.percent) })");
    expect(chart).toContain('seriesSessions: []');
    expect(chart).toContain('percentSeries: []');
  });

  test('the percent series carries no legend and no exercise', () => {
    // The series list is a dashboard thing: one song has nothing to switch on, and the
    // tooltip names it. `seriesSessions: []` is what keeps a song out of the BPM tooltip's
    // `bpm x clicks` line.
    expect(chart).toMatch(/label: percentLabel \?\? t\('song_chart_y_axis'\)/);
    expect(chart).toMatch(/seriesSessions: \[\]/);
  });

  test('an empty percent chart says which kind of empty it is', () => {
    expect(chart).toContain("t(hasAnyPoint ? 'song_chart_empty_period' : 'song_chart_empty')");
    expect(chart).toMatch(/hasAnyPoint: percentPoints\.length > 0/);
    expect(chart).toMatch(/hasAnyPoint: false/);
    // The exercise wording stays for the exercise chart - the song screen cannot say
    // "no sessions", and the dashboard cannot say "no song logs".
    expect(chart).toContain("t(hasAnySession ? 'chart_empty_period' : 'chart_empty')");
  });

  test('a song never joins the dashboard\'s multi-series BPM chart', () => {
    // Decision D1: songs are a separate entity and the two answers are different questions,
    // so the dashboard gets no percent prop and the song screen gets no exercises.
    expect(dashboard).not.toMatch(/percentPoints|percentLabel/);
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

describe('the catalog answers two widths', () => {
  test('at sm and up it is the table criterion 2 asks for', () => {
    // Header, four columns, the same rows: the tabular view stays on every width
    // that fits it.
    expect(dashboard).toContain('hidden sm:block');
    expect(dashboard).toContain('<table className="w-full text-sm">');
    expect(dashboard).toContain("t('catalog_col_visible')");
  });

  test('below sm the same rows stack instead of dragging sideways', () => {
    // Four columns inside 360px scroll the card horizontally; the stacked shape
    // names the exercise and shows the two stored records as chips instead.
    expect(dashboard).toContain('sm:hidden divide-y');
    expect(dashboard).toContain("t('stat_max_bpm')");
    expect(dashboard).toContain("t('stat_last_bpm')");
  });

  test('the eye is one control serving both shapes', () => {
    // Two hosts, one implementation: a second copy would drift from the write and
    // from the hit area the touch tests pin.
    expect(dashboard.match(/<EyeCell /g)?.length).toBe(2);
  });
});

// Staleness is the one gap no runtime check in this suite can see: a tab left open
// for days shows the rows it read on mount, and nothing on screen disagrees with
// them, so the claim is made over the wiring that notices - the day boundary the
// log turns on, and the two ways of looking at a tab again. The arithmetic itself is
// `src/lib/clock.ts`, checked directly in `src/lib/__tests__/clock.test.ts`.
describe('a dashboard left open refreshes itself', () => {
  test('the screen schedules both boundaries', () => {
    expect(dashboard).toContain('useDayRollover(fetchData)');
    expect(dashboard).toContain('useRefreshOnVisible(fetchData)');
  });

  // The timer's deadline is anchored when the effect runs. A callback that changes
  // identity would re-anchor it at the current day's midnight on every re-render -
  // the eye toggle re-renders this screen - and midnight would never be reached.
  test('the fetch it schedules has a stable identity', () => {
    expect(/const fetchData = useCallback\(async/.test(dashboard)).toBe(true);
    expect(/const fetchData = useCallback\([^]*?\}, \[\]\)/.test(dashboard)).toBe(true);
  });

  test('the rollover reschedules itself and is cleared on unmount', () => {
    // One fire would cover one day only; an uncleared timer keeps the screen's
    // callback alive after the screen is gone.
    expect(/window\.setTimeout\(\(\) => \{[^]*onRollover\(\);[^]*schedule\(\);[^]*\}/.test(rollover)).toBe(true);
    expect(rollover).toContain('schedule();');
    expect(rollover).toMatch(/return \(\) => clearTimeout\(timer\)/);
  });

  test('the day rule is arithmetic in lib/, not a timer the screen writes', () => {
    expect(rollover).toContain('msUntilMidnight(new Date())');
    expect(dashboard).not.toMatch(/setTimeout|setInterval/);
  });

  test('a hidden tab costs nothing and the listeners go away', () => {
    // Refetching on going hidden would spend a request every time the user switches
    // tabs away, which is the state `visibilitychange` also fires on.
    expect(visible).toMatch(/if \(document\.visibilityState === 'visible'\) refresh\(\)/);
    expect(visible).toContain("document.addEventListener('visibilitychange', onVisibility)");
    expect(visible).toContain("window.addEventListener('focus', run)");
    expect(visible).toContain("document.removeEventListener('visibilitychange', onVisibility)");
    expect(visible).toContain("window.removeEventListener('focus', run)");
  });

  test('a background refresh keeps the chart on screen', () => {
    // The skeleton would blank the plot the user is looking at to show data that is
    // usually about to be identical, so only the first load may blank it.
    expect(dashboard).toContain('if (!background) setLoading(true)');
    expect(dashboard).toContain('if (!background) setLoading(false)');
    // The unguarded call is the regression this catches: a background fetch that
    // flips `loading` blanks the plot, whatever the trigger was.
    expect(dashboard).not.toMatch(/^\s*setLoading\((?:true|false)\);$/m);
  });

  test('two triggers in the same instant make one round trip', () => {
    // A focus and a midnight timer can land together; stacked fetches would race over
    // the same rows and write the same arrays twice.
    expect(dashboard).toMatch(/if \(inFlight\.current \|\| pendingWrite\.current\) return;/);
    expect(dashboard).toContain('inFlight.current = true');
    expect(dashboard).toContain('inFlight.current = false');
  });

  test('a refresh waits out a visibility write', () => {
    // The eye writes optimistically and the chart redraws off local state, so rows
    // read before the write landed carry the old flag: handing them back would undo
    // the click the user just made.
    expect(dashboard).toContain('pendingWrite.current = true');
    expect(dashboard).toContain('pendingWrite.current = false');
    expect(/apply\(next\);\s*pendingWrite\.current = true/.test(dashboard)).toBe(true);
  });

  test('the refresh writes nothing to the database', () => {
    // The only write the dashboard makes is still the visibility flag: a refresh must
    // not become a save, and must not start filtering rows by date to be "fresh" -
    // Max/Last stay the trigger's stored records (`chart-source.test.ts` above).
    expect(dashboard.match(/supabase\.from\([^)]*\)\.update/g)?.length).toBe(1);
    expect(dashboard).not.toMatch(/\.gte\(|\.lt\(|\.range\(/);
  });
});
