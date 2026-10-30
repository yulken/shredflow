import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LANGUAGES, LANGUAGE_NAMES, CATEGORY_CANONICAL, setLang, categories, dateLocale, nextLanguage, type Locale } from '@/lib/i18n';
import { EN } from '@/lib/locales/en';
import { ES } from '@/lib/locales/es';
import { PT } from '@/lib/locales/pt';

// Scope: the three dictionary modules as one family, plus the constants in
// `i18n.ts` that mount them. The line is drawn at wording, so nothing here
// quotes a translated word: every unit is structural - which keys exist, which
// braces a string carries, how many categories a locale lists, which codes the
// engine can switch to. The file therefore stays green over a rewrite of the
// provisional `pt.ts`/`es.ts` content, and over the interim accent-insensitive
// Portuguese currently accepted.
//
// These are the dictionaries' structural invariants enforced at test time: the
// next key added to `en.ts` without its two translations fails here instead of
// at a runtime miss.
//
// One claim cannot be made over imported values: the ASCII-only rule is about
// the bytes in a file, so the sources are read from disk. An imported string has
// already been decoded by the parser, which is why the source text is decoded
// again here and compared to the runtime value.

const DICTIONARIES: Record<string, Locale> = { en: EN, pt: PT, es: ES };
const CODES = Object.keys(DICTIONARIES);
// An object literal's `en`/`pt`/`es` slots and the `code` each dictionary
// carries have to say the same thing: the three modules, each named by
// its own export.
const SOURCE_FILES = CODES.map((code) => ({ code, path: fileURLToPath(new URL(`../locales/${code}.ts`, import.meta.url)) }));

// The ledger a dictionary carries, read off the text: a repeated key collapses
// in an object literal, so `Object.keys` cannot see the drift; this ledger is
// what catches it.
const keyLines = (source: string) =>
  [...source.matchAll(/^ {4}([a-z_]+): '(.*)',$/gm)].map((m) => ({ key: m[1], raw: m[2] }));

const braces = (value: string): string[] => [...new Set(value.match(/\{\w+\}/g) ?? [])].sort();

const decode = (raw: string): string =>
  raw.replace(/\\u[0-9a-fA-F]{4}/g, (c) => String.fromCharCode(parseInt(c.slice(2), 16)));

describe('key parity', () => {
  // `en.ts` is the authored reference that defines the key set, so the check
  // runs outward from it and back: a key added to one dictionary and not the
  // other two is the drift the fallback in `t()` would otherwise paper over.
  test('a key in one dictionary is in the other two, either direction', () => {
    for (const base of CODES) {
      for (const other of CODES) {
        const absent = Object.keys(DICTIONARIES[base].strings).filter((k) => !(k in DICTIONARIES[other].strings));
        expect(absent).toStrictEqual([]);
      }
    }
  });

  test('the three key sets are the same size, not merely nested', () => {
    const sizes = CODES.map((code) => Object.keys(DICTIONARIES[code].strings).length);
    expect(sizes).toStrictEqual([sizes[0], sizes[0], sizes[0]]);
  });

  // The plural rule is scoped to the two families whose call sites survive in
  // the tree, so those keys are named even though the parity loop above
  // already covers every key.
  test('the two tp families are complete in every dictionary', () => {
    for (const family of ['sessions_count', 'history_count']) {
      for (const suffix of ['_one', '_other']) {
        for (const code of CODES) {
          expect(`${family}${suffix}` in DICTIONARIES[code].strings).toBe(true);
        }
      }
    }
  });

  test('the source ledger has no repeated key, and every runtime key has a line', () => {
    for (const file of SOURCE_FILES) {
      const lines = keyLines(readFileSync(file.path, 'utf8'));
      const keys = lines.map((l) => l.key);
      expect(keys).toStrictEqual([...new Set(keys)]);
      expect(keys.sort()).toStrictEqual(Object.keys(DICTIONARIES[file.code].strings).sort());
    }
  });
});

// Placeholders are language-independent because number
// agreement differs between PT and EN, so the copy moves around a `{name}` that
// does not. A translator who drops `{count}` into one locale's `_other` breaks
// nothing until `tp()` answers with a literal `{count}` on screen; this names
// the key at the moment it is introduced.
describe('placeholder parity', () => {
  const referenceStrings = EN.strings as Record<string, string>;
  test('a key carries the same set of placeholders in every dictionary', () => {
    for (const key of Object.keys(referenceStrings)) {
      const reference = braces(referenceStrings[key]);
      for (const code of CODES) {
        expect(braces(DICTIONARIES[code].strings[key])).toStrictEqual(reference);
      }
    }
  });

  test('the keys the app feeds a placeholder to name the same brace in all three', () => {
    // The two `tp(` call sites plus `goal_line`, whose `{bpm}` is
    // filled from a DB field: which brace survives is pinned, its wording is not.
    for (const code of CODES) {
      expect(braces(DICTIONARIES[code].strings.sessions_count_one)).toStrictEqual(['{count}']);
      expect(braces(DICTIONARIES[code].strings.sessions_count_other)).toStrictEqual(['{count}']);
      expect(braces(DICTIONARIES[code].strings.history_count_one)).toStrictEqual(['{count}']);
      expect(braces(DICTIONARIES[code].strings.history_count_other)).toStrictEqual(['{count}']);
      expect(braces(DICTIONARIES[code].strings.goal_line)).toStrictEqual(['{bpm}']);
    }
  });

  // The brace set of the shipped data is a closed list, named by the
  // four call sites that fill it, `t('goal_line', { bpm: ... })` in both components
  // and the two `tp(` families, so a brace outside that list is a string nothing
  // can fill and `i18n.ts` answers with the literal `{name}` on screen. A new
  // placeholder therefore means a call-site change first, and this is what
  // notices a translator typed `{countt}` rather than `{count}`.
  test('no shipped string carries a placeholder the call sites cannot fill', () => {
    for (const code of CODES) {
      const universe = Object.values(DICTIONARIES[code].strings).flatMap((value) => braces(value));
      expect([...new Set(universe)].sort()).toStrictEqual(['{bpm}', '{count}']);
    }
  });
});

// A dictionary exports one Locale object with these five fields.
// The checks are on the fields the engine reads, never on what they say.
describe('dictionary shape', () => {
  test('each dictionary names the language it is mounted as, in one of three', () => {
    expect(CODES).toStrictEqual([...LANGUAGES]);
    for (const code of CODES) {
      expect(DICTIONARIES[code].code).toBe(code);
      expect(LANGUAGES).toContain(DICTIONARIES[code].code);
    }
  });

  test('every field a Locale is meant to carry is there, with the right sort of value', () => {
    for (const code of CODES) {
      const locale = DICTIONARIES[code];
      expect(locale.code).toMatch(/^[a-z]{2}$/);
      expect(typeof locale.nativeName).toStrictEqual('string');
      expect(locale.nativeName).toMatch(/\S/);
      expect(typeof locale.dateLocale).toStrictEqual('string');
      expect(locale.dateLocale).toMatch(/^[a-z]{2}(?:-[A-Z]{2})?$/);
      expect(Array.isArray(locale.categories)).toBe(true);
      expect(Object.keys(locale.strings).length).toBeGreaterThan(0);
    }
  });

  // `categoryLabel` indexes `list[i] ?? canonical` and `categoryValue` indexes
  // `CATEGORY_CANONICAL[i]`, both against a list a locale owns. A length drift is
  // the one thing that turns those index mappings into a silent pass-through, so
  // the length is the claim and the list's words are not.
  test('every locale lists exactly as many categories as the DB can hold', () => {
    for (const code of CODES) {
      expect(DICTIONARIES[code].categories.length).toBe(CATEGORY_CANONICAL.length);
    }
    for (const code of CODES) {
      setLang(code);
      expect(categories().length).toBe(CATEGORY_CANONICAL.length);
    }
    setLang('en');
  });

  // `SessionView.tsx` hands this string to `Date#toLocaleDateString`. A tag V8's
  // Intl does not know is a TypeError at render time; a tag it knows but maps
  // elsewhere is a silent one, so the claim is the tag the runtime agrees to
  // format in, not a list of what the three dictionaries happen to say.
  test('each dateLocale is a tag the runtime agrees to format in, in every language', () => {
    for (const code of CODES) {
      setLang(code);
      const tag = dateLocale();
      expect(new Intl.DateTimeFormat(tag).resolvedOptions().locale).toBe(tag);
    }
    setLang('en');
  });
});

// The toggle renders `LANGUAGE_NAMES[lang]` as its aria-label and `lang` comes
// from `nextLanguage`, whose domain is `LANGUAGES`: the three constants have to
// agree about which codes exist, or a click lands on `undefined`. The claim is
// coverage and cycle length, never the spelling of a name.
describe('the constants that mount the dictionaries', () => {
  test('every language has a dictionary and a name, and nothing else has one', () => {
    for (const code of LANGUAGES) {
      expect(code in LANGUAGE_NAMES).toBe(true);
      expect(LANGUAGE_NAMES[code]).toMatch(/\S/);
      expect(code in DICTIONARIES).toBe(true);
    }
    for (const code of CODES) {
      expect(LANGUAGES).toContain(code);
    }
  });

  test('LANGUAGES holds no code twice, so the toggle cannot walk the same one twice', () => {
    expect([...new Set(LANGUAGES)]).toStrictEqual([...LANGUAGES]);
  });

  // The toggle walks the whole set and returns to the start.
  // The cycle is asserted as a permutation of the set, which is what lets a
  // language be added to or dropped from `LANGUAGES` without rewriting it.
  test('nextLanguage visits every language exactly once and returns to the start', () => {
    const walk: string[] = [];
    let at = LANGUAGES[0];
    while (walk.length < LANGUAGES.length) {
      at = nextLanguage(at);
      walk.push(at);
    }
    expect([...new Set(walk)]).toHaveLength(LANGUAGES.length);
    expect(at).toBe(LANGUAGES[0]);
  });
});

// The ASCII rule is a claim about the bytes in a file, so it is the one
// invariant this suite cannot make over imported values: an imported string has
// already been decoded by the parser. The escape claim compares the source text
// against the runtime value, which is the only check that would notice a mangled
// byte on the way in.
describe('source form', () => {
  test('no locale source or the engine that reads it carries a character off ASCII', () => {
    const files = [...SOURCE_FILES, { code: 'i18n', path: fileURLToPath(new URL('../i18n.ts', import.meta.url)) }];
    const offenders = files.flatMap((file) =>
      readFileSync(file.path, 'utf8')
        .split('\n')
        .flatMap((line, i) => (/[^\x20-\x7e]/.test(line) ? [`${file.code}:${i + 1}`] : [])),
    );
    expect(offenders).toStrictEqual([]);
  });

  // Every `\uXXXX` in a locale's own text decodes to the character the engine
  // holds, so a value is what the file says it is, and only escapes moved it
  // through every tool that touched the file.
  test('each dictionary\'s own text decodes to the values the engine reads', () => {
    for (const file of SOURCE_FILES) {
      const strings = DICTIONARIES[file.code].strings as Record<string, string>;
      for (const line of keyLines(readFileSync(file.path, 'utf8'))) {
        expect(decode(line.raw)).toStrictEqual(strings[line.key]);
      }
    }
  });
});


