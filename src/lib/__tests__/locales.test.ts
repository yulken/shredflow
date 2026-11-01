import { describe, expect, test } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LANGUAGES, LANGUAGE_NAMES, CATEGORY_CANONICAL, setLang, categories, dateLocale, nextLanguage, type Locale } from '@/lib/i18n';
import { EN } from '@/lib/locales/en';
import { ES } from '@/lib/locales/es';
import { PT } from '@/lib/locales/pt';

// Scope: the three dictionary modules as one family, plus the constants in
// `i18n.ts` that mount them. The line is drawn at wording, so nothing here
// quotes a translated word: every unit is structural - which keys exist, which
// braces a string carries, how many categories a locale lists, which codes the
// engine can switch to - except for the one claim that is about a value rather
// than a shape, in `values are not English`: a `pt`/`es` string may not be the
// English one, which is asserted by comparing dictionaries to each other, not by
// naming any wording. Rewording a translated string therefore stays green;
// leaving one in English does not. The byte-level rules in `source form` hold
// over any wording too, and they are what notices a diacritic being dropped.
//
// These are the dictionaries' structural invariants enforced at test time: the
// next key added to `en.ts` without its two translations fails here instead of
// at a runtime miss.
//
// One claim cannot be made over imported values: the byte-level rules are about
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

// A word boundary that counts accented letters as letters: JS `\b` reads 'á' and
// 'ñ' as non-word, so `\bultimo\b` would match inside 'Último' and `\bauñ\b` would
// match nothing at all. `\p{L}` covers both languages' letters; `_` is kept in the
// word too, so a key name like `tension_label` never reads as a value's spelling.
const isWord = (line: string, w: string) => new RegExp(`(?<![\\p{L}_])${w}(?![\\p{L}_])`, 'iu').test(line);

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

// The one claim this suite could not make before: a dictionary whose values are
// still English satisfies every rule above - the keys exist, the braces match, the
// bytes are ASCII-clean and NFC-normalized - so a `pt.ts`/`es.ts` left in English
// was green. The invariant is on the values: a `pt`/`es` string answers in its own
// language, except for the keys listed below, which carry a brand name, a unit and
// two placeholders whose text is the same in all three.
const SHARED_WITH_EN: Record<string, string[]> = {
  pt: ['app_brand', 'placeholder_bpm', 'bpm_unit', 'placeholder_tab_url'],
  es: ['app_brand', 'bpm_unit', 'placeholder_tab_url'],
};
const shared = (code: string) => SHARED_WITH_EN[code] ?? [];
const TRANSLATED = ['pt', 'es'];
// `en.ts` declares its keys as literal properties, so the comparison is made over
// the dictionary as the engine indexes it, the same widening `placeholder parity` uses.
const EN_STRINGS = EN.strings as Record<string, string>;

describe('values are not English', () => {
  test('a pt/es string is not the English one, outside an explicit allowlist', () => {
    for (const code of TRANSLATED) {
      const untranslated = Object.keys(EN_STRINGS).filter(
        (key) => DICTIONARIES[code].strings[key] === EN_STRINGS[key] && !shared(code).includes(key),
      );
      expect(untranslated).toStrictEqual([]);
    }
  });

  // The allowlist is a claim about these keys, not an escape hatch: a key listed
  // here that stops matching English fails as loudly as a key never translated, so
  // the list cannot rot into a place to park new English copy.
  test('every allowlisted key really is the English string', () => {
    for (const code of TRANSLATED) {
      const stale = shared(code).filter((key) => DICTIONARIES[code].strings[key] !== EN_STRINGS[key]);
      expect(stale).toStrictEqual([]);
    }
  });

  // Words that exist in neither language - the shape English takes when only part
  // of a value is copied, which the equality check above cannot see. Contractions
  // and cognates a real pt/es string uses are deliberately absent: 'de', 'do', 'a',
  // 'no', 'e', 'o', 'la', 'en', 'con', 'por', 'para', 'mas', 'si', 'total'.
  const EN_ONLY = ['the', 'and', 'or', 'of', 'for', 'to', 'in', 'on', 'from', 'with',
    'your', 'you', 'this', 'that', 'what', 'how', 'was', 'were', 'enter', 'add',
    'delete', 'remove', 'save', 'clear', 'notes', 'minutes', 'session', 'practice',
    'history', 'chart', 'category', 'goal', 'current', 'new', 'last', 'best',
    'average', 'type', 'start', 'stop', 'reset', 'day', 'week', 'month', 'year',
    'count', 'max', 'log', 'edit', 'set'];

  test('no pt/es string carries a word that only English has', () => {
    // A placeholder is a token, not a word: `{count}` is the same text in all three
    // dictionaries, so it is removed before matching rather than read as 'count'.
    const words = (value: string) => value.replace(/\{\w+\}/g, ' ');
    const offenders = TRANSLATED.flatMap((code) =>
      Object.entries(DICTIONARIES[code].strings)
        .filter(([, value]) => EN_ONLY.some((w) => isWord(words(value), w)))
        .map(([key]) => `${code}:${key}`),
    );
    expect(offenders).toStrictEqual([]);
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

// The byte-level rules are claims about the bytes in a file, so they are the one
// invariant this suite cannot make over imported values: an imported string has
// already been decoded by the parser. The escape claim compares the source text
// against the runtime value, which is the only check that would notice a mangled
// byte on the way in.
describe('source form', () => {
  const files = [...SOURCE_FILES, { code: 'i18n', path: fileURLToPath(new URL('../i18n.ts', import.meta.url)) }];
  const read = (path: string) => readFileSync(path, 'utf8');

  // Accents are written as characters rather than escapes, so the dictionary is
  // readable. That is safe only while the bytes stay right: an editor saving NFD
  // turns 'e' + acute into two code points, and a file read as Latin-1 and saved
  // as UTF-8 turns it into a letter plus a symbol. Both render and both fail
  // here. Latin-1 Supplement letters, the Spanish inverted marks and the em dash
  // are the whole alphabet a dictionary may carry, so anything else off ASCII is
  // drift.
  const NOT_ALLOWED = /[^\x20-\x7e¡¿À-ÿ—]/;

  test('no locale source or the engine that reads it carries a character off that alphabet', () => {
    const offenders = files.flatMap((file) =>
      read(file.path)
        .split('\n')
        .flatMap((line, i) => (NOT_ALLOWED.test(line) ? [`${file.code}:${i + 1}: ${line.match(NOT_ALLOWED)![0]}`] : [])),
    );
    expect(offenders).toStrictEqual([]);
  });

  // Composed rather than decomposed: a combining mark would render the same glyph
  // and read differently everywhere else in this file, the spelling guard included.
  test('the sources are NFC-normalized', () => {
    const offenders = files
      .filter((file) => read(file.path) !== read(file.path).normalize('NFC'))
      .map((file) => file.code);
    expect(offenders).toStrictEqual([]);
  });

  // A dropped diacritic is invisible to the two rules above: the unaccented
  // spelling is plain ASCII and NFC-clean. So the words that carry a diacritic in
  // the language the file is written in are listed, and their bare form is
  // refused. A word that legitimately carries none is not listed - 'mes' is
  // correct in Spanish, 'ano' in Portuguese - so those stay green.
  const MUST_ACCENT: Record<string, string[]> = {
    pt: ['exercicio', 'exercicios', 'sessao', 'sessoes', 'comecar', 'historico', 'sera', 'titulo',
      'obrigatorio', 'descricao', 'medio', 'nivel', 'tensao', 'alcancado', 'anotacoes', 'proxima',
      'grafico', 'invalida', 'ultimo', 'ultimos', 'mes', 'periodo', 'tecnica', 'improvisacao',
      'portugues', 'portugus', 'formulario', 'maximo', 'cromatica'],
    es: ['practica', 'evoluciono', 'sesion', 'ultimo', 'ultimos', 'grafico', 'periodo', 'ningun',
      'tension', 'aun', 'ano', 'invalida', 'tecnica', 'improvisacion', 'titulo', 'descricao',
      'categoria', 'proxima', 'record', 'maximo', 'cromatica'],
    i18n: ['tecnica', 'improvisacao', 'improvisacion', 'portugues', 'portugus', 'espanol'],
  };

  // Matching ignores case: the words that carry a diacritic start a sentence or a
  // label as often as they sit inside one, and 'Ultimo' is as wrong as 'ultimo'.
  test('no word that carries a diacritic is written without it', () => {
    const offenders = files.flatMap((file) => {
      const bare = MUST_ACCENT[file.code] ?? [];
      return read(file.path)
        .split('\n')
        .flatMap((line, i) => bare.filter((w) => isWord(line, w)).map((w) => `${file.code}:${i + 1}: ${w}`));
    });
    expect(offenders).toStrictEqual([]);
  });

  // A diacritic landing on the wrong letter is invisible to every rule above: 'áuñ'
  // and 'Ningúñ' are in the allowed alphabet, NFC-clean, and not bare forms the list
  // knows. The spellings this pass produced are refused by name, so the same slip is
  // caught here instead of reaching the screen.
  const MUST_NOT_WRITE: Record<string, string[]> = {
    pt: ['improvisacão', 'sessõe'],
    es: ['auñ', 'aeuñ', 'ningúñ'],
    i18n: ['improvisacão'],
  };

  test('no word is written with a diacritic on the wrong letter', () => {
    const offenders = files.flatMap((file) => {
      const wrong = MUST_NOT_WRITE[file.code] ?? [];
      return read(file.path)
        .split('\n')
        .flatMap((line, i) => wrong.filter((w) => isWord(line, w)).map((w) => `${file.code}:${i + 1}: ${w}`));
    });
    expect(offenders).toStrictEqual([]);
  });

  // The value on disk is the value the engine holds. Accents are written as
  // characters, so this is byte-for-byte; `decode` still folds any `\uXXXX`, which
  // keeps the claim true if a dictionary is ever written in escapes again.
  test('each dictionary\'s own text decodes to the values the engine reads', () => {
    for (const file of SOURCE_FILES) {
      const strings = DICTIONARIES[file.code].strings as Record<string, string>;
      for (const line of keyLines(readFileSync(file.path, 'utf8'))) {
        expect(decode(line.raw)).toStrictEqual(strings[line.key]);
      }
    }
  });
});

// The escape rule deliberately reaches past the dictionaries: `\uXXXX` is a
// property of JS *string literals*, so the same byte sequence written as JSX
// text is not an escape and renders as `\`, `u`, `2`, ... That is how the BPM
// step buttons showed `\u22121` and `\u22125` on screen - no type error, no lint
// rule, no runtime throw, nothing that notices it. The claim is made over every
// app source because JSX text is where the mistake is possible.
describe('escapes written outside a string literal', () => {
  const srcRoot = fileURLToPath(new URL('../../', import.meta.url));
  const ESCAPE = /\\u[0-9a-fA-F]{4}/;
  // A line that carries no quote or backtick at all cannot hold a string
  // literal, so an escape on it is text - the JSX case. Regex literals are
  // covered by the same rule in practice: they always sit inside an expression
  // whose line quotes the surrounding code.
  const QUOTE = /['"`]/;

  const appSources = readdirSync(srcRoot, { recursive: true, encoding: 'utf8' }).filter(
    (entry) => /\.(?:ts|tsx)$/.test(entry),
  );

  test('no app source writes an escape where nothing quotes it', () => {
    const offenders = appSources.flatMap((entry) => {
      const path = join(srcRoot, entry);
      return readFileSync(path, 'utf8')
        .split('\n')
        .flatMap((line, i) => (ESCAPE.test(line) && !QUOTE.test(line) ? [`${relative(srcRoot, path)}:${i + 1}`] : []));
    });
    expect(offenders).toStrictEqual([]);
  });

  test('the two BPM step labels are string literals, not JSX text', () => {
    // The two call sites the bug was found at, pinned as the fixed form: the
    // minus sign reaches the screen instead of the escape's own characters.
    const view = readFileSync(fileURLToPath(new URL('../../components/SessionView.tsx', import.meta.url)), 'utf8');
    expect(view).toContain("{'\\u22121'}");
    expect(view).toContain("{'\\u22125'}");
  });
});


