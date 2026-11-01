import { describe, expect, test } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { LANGUAGES, getLang, setLang, t } from '@/lib/i18n';

// Scope: `index.html` and the asset it points at. Nothing here checks the React
// app — these are the claims that only the shell makes, read off the files the
// way `chart-source.test.ts` reads the components. A favicon link that points at
// a file the build never ships is invisible until a tab shows no icon, and a
// static title that disagrees with `page_title` is only visible for the instant
// before `useLanguage` overwrites it. Both are checked over text, because the
// suite has no DOM and the browser pass cannot be automated here.

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const tailwind = readFileSync(join(ROOT, 'tailwind.config.js'), 'utf8');

// An icon reference is `/file.svg` in the HTML and `public/file.svg` on disk:
// Vite serves `public/` at the root, so the two names have to line up.
const iconHref = (): string => {
  const link = html.match(/<link rel="icon"[^>]*>/);
  if (!link) throw new Error('index.html has no rel="icon" link');
  const href = link[0].match(/href="([^"]+)"/);
  if (!href) throw new Error('the icon link has no href');
  return href[1];
};

const assetPath = (): string => join(ROOT, 'public', iconHref().replace(/^\//, ''));

describe('the tab icon is an asset the build ships', () => {
  test('the referenced file exists under public/', () => {
    // Vite's default `publicDir` is `public/`: anything else referenced from the
    // root (the template's `/vite.svg`) has no file behind it and 404s.
    expect(iconHref()).toMatch(/^\/[\w.-]+\.(svg|png|ico)$/);
    expect(existsSync(assetPath())).toBe(true);
  });

  test('the declared type matches what the file actually is', () => {
    const link = html.match(/<link rel="icon"[^>]*>/)![0];
    expect(link).toContain('type="image/svg+xml"');
    // A browser that trusts `type` will not sniff a mismatched one.
    expect(readFileSync(assetPath(), 'utf8')).toMatch(/^<svg\b/);
  });
});

describe('the tab icon is the app mark', () => {
  test('its gradient uses the brand hexes the UI is built from', () => {
    const svg = readFileSync(assetPath(), 'utf8');
    const stops = [...svg.matchAll(/stop-color="#([0-9a-f]{6})"/g)].map((m) => m[1]);
    expect(stops.length).toBeGreaterThan(1);
    // Each stop has to be a hex the palette actually defines; a recolued tile
    // drifting away from the header is what this catches.
    for (const hex of stops) {
      expect(tailwind).toContain(`'#${hex}'`);
    }
  });

  test('the glyph is drawn light on the tile, so it survives either theme', () => {
    const svg = readFileSync(assetPath(), 'utf8');
    // Both themes read on a coloured tile: no var(), no prefers-color-scheme, and
    // nothing inherited from the page's own CSS, which a favicon file cannot see.
    expect(svg).not.toMatch(/var\(--|prefers-color-scheme/);
    expect(svg).toMatch(/stroke="#ffffff"/);
    expect(svg).toMatch(/<rect[^>]*fill="url\(#brand\)/);
  });
});

describe('the shell agrees with the app it boots', () => {
  test('the static title is the default locale page title', () => {
    // `useLanguage` sets `document.title` from `t('page_title')` at mount, so the
    // markup owns only the first paint: it has to say the same thing for the
    // language the engine defaults to. `getLang`/`setLang` are module state, so
    // the suite puts the active language back when it is done.
    const previous = getLang();
    try {
      setLang(LANGUAGES[0]);
      const title = html.match(/<title>([^<]*)<\/title>/)![1];
      expect(title).toBe(t('page_title'));
    } finally {
      setLang(previous);
    }
  });

  test('the static lang is the language the engine defaults to', () => {
    expect(html).toMatch(new RegExp(`<html lang="${LANGUAGES[0]}"`));
  });

  test('no third-party asset is referenced from the markup', () => {
    // The scaffold pointed og/twitter images at the generator's own host; an
    // absolute URL in the shell is a request the app cannot serve or change.
    expect(html).not.toMatch(/(?:href|src|content)="https?:\/\//);
  });
});
