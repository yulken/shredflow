import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Scope: what a finger can reach. Two rules no desktop run would notice: a control
// revealed by `group-hover` never appears where there is no hover, so the action is
// unreachable, and a chip smaller than a finger is a miss the row underneath answers
// instead. Both are read off the source like the other wiring claims, because no DOM
// exists in this suite and neither is visible without a touch device.
const frame = readFileSync(fileURLToPath(new URL('../../layouts/AppLayout.tsx', import.meta.url)), 'utf8');
const dashboard = readFileSync(fileURLToPath(new URL('../Dashboard.tsx', import.meta.url)), 'utf8');
const list = readFileSync(fileURLToPath(new URL('../ExerciseList.tsx', import.meta.url)), 'utf8');
const view = readFileSync(fileURLToPath(new URL('../SessionView.tsx', import.meta.url)), 'utf8');
const songList = readFileSync(fileURLToPath(new URL('../SongList.tsx', import.meta.url)), 'utf8');
const songView = readFileSync(fileURLToPath(new URL('../SongView.tsx', import.meta.url)), 'utf8');
const chart = readFileSync(fileURLToPath(new URL('../ProgressChart.tsx', import.meta.url)), 'utf8');
const langToggle = readFileSync(fileURLToPath(new URL('../LanguageToggle.tsx', import.meta.url)), 'utf8');
const authView = readFileSync(fileURLToPath(new URL('../AuthView.tsx', import.meta.url)), 'utf8');

describe('nothing is reachable only by hovering', () => {
  test('the reveal is behind a hover-capability query', () => {
    // Desktop keeps the hover reveal; a phone shows the chip, because edit/delete and
    // the per-session trash are the only way to change or remove those rows.
    expect(list).toContain('[@media(hover:hover)]:opacity-0');
    expect(view).toContain('[@media(hover:hover)]:opacity-0');
    expect(songList).toContain('[@media(hover:hover)]:opacity-0');
    expect(songView).toContain('[@media(hover:hover)]:opacity-0');
    expect(list).not.toMatch(/opacity-0 group-hover:opacity-100/);
    expect(view).not.toMatch(/opacity-0 group-hover:opacity-100/);
    expect(songList).not.toMatch(/opacity-0 group-hover:opacity-100/);
    expect(songView).not.toMatch(/opacity-0 group-hover:opacity-100/);
  });

  test('hover states cannot stick after a tap', () => {
    // On touch `:hover` survives the tap, so a card that lifts would stay lifted and a
    // button would keep its hover color until the next tap somewhere else.
    expect(list).toContain('[@media(hover:hover)]:hover:-translate-y-0.5');
    expect(list).toContain('[@media(hover:hover)]:hover:shadow-md');
    expect(list).toContain('active:scale-[0.99]');
    expect(songList).toContain('[@media(hover:hover)]:hover:-translate-y-0.5');
    expect(songList).toContain('[@media(hover:hover)]:hover:shadow-md');
    expect(songList).toContain('active:scale-[0.99]');
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
    // A song row's pencil and trash are the only way to change or remove a block, so they
    // join the same rule: 36px of visual, a hit area a finger can actually land on.
    expect(songView).toContain('before:-inset-[6px]');
    expect(songList).toContain('before:-inset-[2px]');
  });
});

describe('the header fits a narrow screen', () => {
  test('brand and height shrink below sm', () => {
    // The brand and the four tab links share one row with no wrap: at 320px the
    // full-size brand is what pushes the last tab off the edge.
    expect(frame).toContain('h-14 sm:h-16');
    expect(frame).toContain('text-base sm:text-lg');
    expect(frame).toContain('mr-1 sm:mr-2');
  });

  test('the nav row fits four views without wrapping', () => {
    // Songs joined the row as a peer of exercises. The label is hidden below sm, and the
    // padding shrinks with it: brand and four tab links share one row that cannot wrap, so
    // at 320px the full-size padding pushes the last one off the edge.
    expect(frame).toMatch(/px-2 sm:px-3 py-2\.5/);
    expect(frame.match(/hidden sm:inline/g)).toHaveLength(4);
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

  test('the songs header shrinks and wraps below sm', () => {
    // The title, the three order chips and the add button exceed 360px on one line, so the
    // row wraps rather than dragging the page sideways; the button keeps its size, the title
    // block shrinks.
    expect(songList).toContain('text-2xl sm:text-3xl');
    expect(songList).toContain('flex flex-wrap items-center justify-between gap-3');
    expect(songList).toContain('flex shrink-0 flex-wrap items-center gap-2');
    expect(songList).toContain('min-w-0');
  });
});

describe('a card fits the width it is given', () => {
  test('its chip rows wrap instead of pushing sideways', () => {
    // Goal + max + last exceed a 360px card on one line; overflow spills the
    // page into a sideways drag. The stat chips wrap inside a left group and
    // the session block hangs right over the divider as one unit, so a phone
    // wraps it onto the next line instead of floating it alone at the edge.
    expect(list).toContain('flex flex-wrap items-center gap-x-3');
    expect(list).toContain('flex flex-wrap items-center gap-2');
    // The tab anchor left the card: the tab opens on the session screen, and
    // a second way to navigate on a tap that already opens the exercise is noise.
    expect(list).not.toContain('link_tab_aria');
  });

  test('the song card wraps its chips and shrinks its bar', () => {
    // Measures, logs and the last log are three chips, and the percent bar is a flex child
    // whose track would otherwise claim a min-content width: the chips wrap, and the bar gets
    // `min-w-0 flex-1` so it gives the row's width back on a phone.
    expect(songList).toContain('flex flex-wrap items-center gap-x-3');
    expect(songList).toContain('min-w-0 flex-1 rounded-full');
    expect(songList).toContain('min-w-0 flex-1 text-lg font-semibold');
    // The tab opens on the song screen, the same reason the exercise card dropped its link:
    // a second way to navigate on a tap that already opens the song is noise.
    expect(songList).not.toContain('songsterr_link_aria');
  });

  test('the title leads the card where the note tile used to', () => {
    // The tile carried no artwork, no tab and no category, so it read as
    // decoration; the title now sits at the left edge of the same row as the
    // edit/delete pair, and `min-w-0 flex-1` keeps a long name from pushing the
    // buttons out of the card. The empty state keeps its tile - there the note
    // says "no catalog yet", beside the button that adds one.
    expect(list).toContain('flex items-start justify-between gap-3 mb-1');
    expect(list).toContain('min-w-0 flex-1 text-lg font-semibold');
    expect(list.match(/\{exercise\.title\}/g)).toHaveLength(1);
    expect(list).not.toContain('h-11 w-11');
    expect(list).not.toMatch(/from-brand-500 to-brand-700/);
    expect(list).toContain('<Music2 className="h-8 w-8" />');
  });
});

describe('the dashboard rows carry only what the exercise stores', () => {
  test('the name leads both row shapes with no icon in front', () => {
    // The same decorative note the cards dropped sat before every row, at 16px in
    // the brand color - it read as a bullet, not as information. The table row and
    // the stacked row now start on the title itself.
    expect(dashboard).not.toContain('Music2');
    expect(dashboard).toContain('font-medium text-gray-900 dark:text-white line-clamp-1');
    expect(dashboard.match(/\{exercise\.title\}/g)).toHaveLength(2);
  });
});

describe('the page scrolls once', () => {
  test('the history list has no inner scroll below sm', () => {
    // A box that scrolls inside the page traps a finger's swipe; on a phone the page
    // is the scroll. Desktop keeps the capped list beside the form.
    expect(view).toContain('sm:max-h-[600px] sm:overflow-y-auto');
    expect(view).not.toMatch(/max-h-\[600px\] overflow-y-auto/);
  });

  test('the song history has no inner scroll below sm', () => {
    // Same rule as the session history: a box that scrolls inside the page traps a finger's
    // swipe, and a song's rows are many per day, so the list is long on a phone.
    expect(songView).toContain('sm:max-h-[600px] sm:overflow-y-auto');
    expect(songView).not.toMatch(/max-h-\[600px\] overflow-y-auto/);
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
    // The song screen takes the same three floors: the grid track, the canvas inside it, and
    // the number inputs whose default `size` is 20 characters.
    expect(songView).toContain('grid grid-cols-1 gap-6 lg:grid-cols-5');
    expect(songView).toContain('min-w-0 flex-1 px-4 py-3');
    expect(songView).toContain('w-full min-w-0 px-4 py-3');
    expect(songList).toContain('w-full min-w-0 px-4 py-3');
  });

  test('cards give their padding back on a phone', () => {
    // 24px on each side is what a 360px screen cannot spare for the plot and the rows.
    expect(dashboard).toContain('card p-4 sm:p-6');
    expect(view).toContain('card p-4 sm:p-6');
    expect(list).toContain('card p-4 sm:p-5');
    expect(songView).toContain('card p-4 sm:p-6');
    expect(songList).toContain('card p-4 sm:p-5');
  });
});

describe('the sign-in card fits a phone', () => {
  test('its controls are finger-sized and its inputs shrink', () => {
    // The gate is the first screen a phone visitor meets, so it gets the same two
    // rules the rest of the tree does: a tap target a finger can hit, and no
    // intrinsic width pushing the page sideways.
    expect(authView).toContain('px-3 py-2.5 sm:py-3');
    expect(authView).toContain('px-4 py-3');
    expect(authView).toContain('px-5 py-3');
    expect(authView).toContain('w-full min-w-0 px-4 py-3');
    expect(authView).toContain('max-w-md mx-auto');
    expect(authView).toContain('card p-4 sm:p-6');
  });

  test('nothing on it is reachable only by hovering', () => {
    // Both modes are always visible: there is no reveal to hide behind a hover,
    // and the press feedback is `active`, which a tap answers.
    expect(authView).not.toMatch(/opacity-0 group-hover:opacity-100/);
    expect(authView).toContain('active:scale-95');
  });
});
