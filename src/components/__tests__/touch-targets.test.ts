import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Scope: what a finger can reach. Two rules no desktop run would notice: a control
// revealed by `group-hover` never appears where there is no hover, so the action is
// unreachable, and a chip smaller than a finger is a miss the row underneath answers
// instead. Both are read off the source like the other wiring claims, because no DOM
// exists in this suite and neither is visible without a touch device.
const app = readFileSync(fileURLToPath(new URL('../../App.tsx', import.meta.url)), 'utf8');
const dashboard = readFileSync(fileURLToPath(new URL('../Dashboard.tsx', import.meta.url)), 'utf8');
const list = readFileSync(fileURLToPath(new URL('../ExerciseList.tsx', import.meta.url)), 'utf8');
const view = readFileSync(fileURLToPath(new URL('../SessionView.tsx', import.meta.url)), 'utf8');
const chart = readFileSync(fileURLToPath(new URL('../ProgressChart.tsx', import.meta.url)), 'utf8');
const langToggle = readFileSync(fileURLToPath(new URL('../LanguageToggle.tsx', import.meta.url)), 'utf8');

describe('nothing is reachable only by hovering', () => {
  test('the reveal is behind a hover-capability query', () => {
    // Desktop keeps the hover reveal; a phone shows the chip, because edit/delete and
    // the per-session trash are the only way to change or remove those rows.
    expect(list).toContain('[@media(hover:hover)]:opacity-0');
    expect(view).toContain('[@media(hover:hover)]:opacity-0');
    expect(list).not.toMatch(/opacity-0 group-hover:opacity-100/);
    expect(view).not.toMatch(/opacity-0 group-hover:opacity-100/);
  });

  test('hover states cannot stick after a tap', () => {
    // On touch `:hover` survives the tap, so a card that lifts would stay lifted and a
    // button would keep its hover color until the next tap somewhere else.
    expect(list).toContain('[@media(hover:hover)]:hover:-translate-y-0.5');
    expect(list).toContain('[@media(hover:hover)]:hover:shadow-md');
    expect(list).toContain('active:scale-[0.99]');
  });
});

describe('the chip stays small and the tap area is not', () => {
  test('every small control carries a pseudo hit area', () => {
    // The visual is unchanged; the pseudo-element widens the target to what a finger
    // needs. The dashboard eye matters most: it sits inside a row that navigates on the
    // same tap, so a 24px miss opens the exercise instead of toggling the series.
    expect(dashboard).toMatch(/relative inline-flex.*h-6 w-6/);
    expect(dashboard).toContain('before:-inset-[10px]');
    expect(view).toContain('before:-inset-[6px]');
    expect(list).toContain('before:-inset-[2px]');
  });
});

describe('the header fits a narrow screen', () => {
  test('brand and height shrink below sm', () => {
    // The brand, the two nav buttons and the two toggles share one row with no wrap:
    // at 320px the full-size brand is what pushes the toggles off the edge.
    expect(app).toContain('h-14 sm:h-16');
    expect(app).toContain('text-base sm:text-lg');
    expect(app).toContain('mr-1 sm:mr-2');
  });

  test('the language toggle stacks its icon and its code', () => {
    // Side by side the globe and `PT` collide inside a 40px box.
    expect(langToggle).toContain('flex flex-col items-center justify-center');
  });

  test('the exercises header shrinks below sm', () => {
    // A `text-3xl` title and a full-size button do not share 320px: the title
    // block can shrink (`min-w-0`) but the button must not be squeezed flat.
    expect(list).toContain('text-2xl sm:text-3xl');
    expect(list).toContain('flex shrink-0 items-center gap-2 px-4 py-2.5 sm:px-5 sm:py-3');
  });
});

describe('a card fits the width it is given', () => {
  test('its chip rows wrap instead of pushing sideways', () => {
    // Goal + max + last + session count on one line exceed a 360px card, and a
    // tab link beside the off-chart badge does the same; overflow spills the
    // page into a sideways drag. Both wrap, keeping `ml-auto` on the trailing chip.
    expect(list).toContain('flex flex-wrap items-center gap-x-3');
    expect(list).toContain('flex flex-wrap items-center gap-2');
  });
});

describe('the page scrolls once', () => {
  test('the history list has no inner scroll below sm', () => {
    // A box that scrolls inside the page traps a finger's swipe; on a phone the page
    // is the scroll. Desktop keeps the capped list beside the form.
    expect(view).toContain('sm:max-h-[600px] sm:overflow-y-auto');
    expect(view).not.toMatch(/max-h-\[600px\] overflow-y-auto/);
  });

  test('nothing holds the phone page wider than the screen', () => {
    // Three intrinsic widths once pushed the session screen past 360px and made the
    // page drag sideways: the implicit grid track (auto = min-content, which the
    // canvas's px width held), the canvas wrapper inside a card, and the BPM input
    // (default `size` of 20 characters at text-2xl). Each got a shrink floor: an
    // explicit minmax(0, 1fr) base track and `min-w-0`.
    expect(view).toContain('grid grid-cols-1 gap-6 lg:grid-cols-5');
    expect(chart).toContain('min-w-0 h-[260px] sm:h-[360px]');
    expect(view).toContain('min-w-0 flex-1 px-4 py-3');
  });

  test('cards give their padding back on a phone', () => {
    // 24px on each side is what a 360px screen cannot spare for the plot and the rows.
    expect(dashboard).toContain('card p-4 sm:p-6');
    expect(view).toContain('card p-4 sm:p-6');
    expect(list).toContain('card p-4 sm:p-5');
  });
});
