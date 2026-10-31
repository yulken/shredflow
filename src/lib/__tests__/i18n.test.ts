import { describe, expect, test } from 'vitest';
import { getLang, setLang, t, tp, nextLanguage, CATEGORY_CANONICAL, categories, categoryLabel, categoryValue, dateLocale, type Locale } from '@/lib/i18n';
import { EN } from '@/lib/locales/en';
import { ES } from '@/lib/locales/es';
import { PT } from '@/lib/locales/pt';

// Scope: the pure surface of the engine - `t()` plus `tp()`, `nextLanguage()`,
// the `getLang`/`setLang` pair, `categories()`, `dateLocale()` and the
// category label/value pair.
//
// Every unit under test here is pure: value in, value out, no DOM, no browser
// state. `t()` is locale + key + params in, string out; the later additions
// (`nextLanguage`, the category pair) are the same shape.
// Translated wording is asserted only against `en.ts`, the one reviewed
// reference dictionary: `pt`/`es` are provisional content, so the checks
// there are structural - which dictionary won, which key was read,
// whether a placeholder survived - never "is this good Spanish/Portuguese".
// Side-effecting parts of the engine (localStorage, window location,
// navigator.language, `document.*`) stay out of scope: they are
// browser state, not a return value.

describe('t()', () => {
  test('interpolates a placeholder from the reference dictionary', () => {
    expect(t('goal_line', { bpm: 120 })).toBe('Goal: 120 BPM');
  });

  test('stringifies non-string params, and falsy values still substitute', () => {
    expect(t('goal_line', { bpm: 0 })).toBe('Goal: 0 BPM');
    expect(t('goal_line', { bpm: 12.5 })).toBe('Goal: 12.5 BPM');
  });

  test('leaves a placeholder literal when the param is absent', () => {
    expect(t('goal_line')).toBe('Goal: {bpm} BPM');
    expect(t('goal_line', { unrelated: 'ignored' })).toBe('Goal: {bpm} BPM');
  });

  test('ignores params that no placeholder refers to', () => {
    expect(t('goal_line', { bpm: 'x', unrelated: 'y' })).toBe('Goal: x BPM');
  });

  // No shipped key carries two placeholders, so the template is supplied as an
  // unknown key (t() falls back to the key itself) and substituted into.
  test('repeated and reordered placeholders share one param record', () => {
    expect(t('{b} {a} {b}', { a: '1', b: '2' })).toBe('2 1 2');
  });

  test('substitution is a single pass, so injected braces are not re-expanded', () => {
    expect(t('goal_line', { bpm: '{unrelated}', unrelated: 'expanded' })).toBe('Goal: {unrelated} BPM');
  });

  test('an unknown key with no placeholders is returned verbatim', () => {
    expect(t('not_a_real_key')).toBe('not_a_real_key');
  });

  test('a key missing in the active locale falls back to the reference locale', () => {
    const probeKey = 'probe_only_in_reference';
    const previousLang = getLang();
    const originalWarn = console.warn;
    const warnings: string[] = [];
    console.warn = (...args) => {
      warnings.push(String(args[0]));
    };

    // EN has the probe key, es does not, so this is the only reachable
    // expression of the fallback branch: key parity is currently 63/63/63.
    const referenceStrings = EN.strings as Record<string, string>;
    referenceStrings[probeKey] = 'Probe {value}';
    try {
      setLang('es');
      expect(t(probeKey, { value: 7 })).toBe('Probe 7');
      expect(warnings).toStrictEqual([`i18n: key '${probeKey}' missing in 'es', falling back to 'en'`]);
    } finally {
      delete referenceStrings[probeKey];
      console.warn = originalWarn;
      setLang(previousLang);
    }
  });

  test('a key missing everywhere falls through to the key itself', () => {
    expect(t('also_not_a_real_key', { value: 7 })).toBe('also_not_a_real_key');
  });

  // The fallback chain has two legs and an absent key exercises both: the
  // active language misses, the reference misses, the key itself survives. The
  // warning is console text that is never translated, so its wording is a
  // claim about `i18n.ts` - which is what lets the missing name here be
  // anything that is not in a dictionary.
  test('a miss in the active language and in the reference warns and returns the key itself', () => {
    const previousLang = getLang();
    const originalWarn = console.warn;
    const warnings: string[] = [];
    console.warn = (...args) => {
      warnings.push(String(args[0]));
    };
    try {
      setLang('es');
      expect(t('also_not_a_real_key', { value: 7 })).toBe('also_not_a_real_key');
      expect(warnings).toStrictEqual([`i18n: key 'also_not_a_real_key' missing in 'es', falling back to 'en'`]);
    } finally {
      console.warn = originalWarn;
      setLang(previousLang);
    }
  });
});

// The plural rule is scoped to the two families the app
// actually pluralizes - the two `tp(` call sites are `tp('sessions_count', ...)`
// (ExerciseList.tsx) and `tp('history_count', ...)` (SessionView.tsx). A
// general "_one always has an _other" assertion would fail today: `bpm_minus_one`
// and `bpm_plus_one` are button labels that end in the word "one", not families.

describe('tp()', () => {
  test('count 1 selects the _one key, any other count the _other', () => {
    expect(tp('sessions_count', 1)).toBe('1 session');
    expect(tp('sessions_count', 2)).toBe('2 sessions');
    expect(tp('history_count', 1)).toBe('1 entry');
    expect(tp('history_count', 12)).toBe('12 entries');
  });

  test('zero selects _other, and is reachable data: sessionCounts[id] || 0', () => {
    // ExerciseList.tsx passes `sessionCounts[exercise.id] || 0`, so an
    // exercise with no sessions reaches tp with 0, and the
    // `count === 1 ? '_one' : '_other'` ternary makes it plural wording.
    expect(tp('sessions_count', 0)).toBe('0 sessions');
  });

  test('the count argument wins over a caller param of the same name', () => {
    expect(tp('sessions_count', 2, { count: 99 })).toBe('2 sessions');
  });

  test('in PT and ES, tp is asserted as the _one/_other key pick plus t() substitution', () => {
    // Structural: the key that was appended is pinned against what t()
    // answers for that same key in the same locale; no Spanish or
    // Portuguese word is quoted, so any rewrite of the provisional pt/es
    // content moves nothing here.
    for (const code of ['pt', 'es']) {
      setLang(code);
      expect(tp('sessions_count', 1)).toBe(t('sessions_count_one', { count: 1 }));
      expect(tp('sessions_count', 3)).toBe(t('sessions_count_other', { count: 3 }));
      expect(tp('history_count', 1)).toBe(t('history_count_one', { count: 1 }));
      expect(tp('history_count', 4)).toBe(t('history_count_other', { count: 4 }));
    }
    setLang('en');
  });

  test('a key with neither family falls through t()\'s fallback chain to the key itself', () => {
    expect(tp('no_such_family', 2)).toBe('no_such_family_other');
  });
});

// The language cycle is `en -> pt -> es -> en`, walking LANGUAGES' order; the
// hook that consumed it lives in the view layer, so the cycle itself is the
// unit under test here. nextLanguage does not move the active language: setLang
// does, and the hook keeps feeding both setLang(next) and setLangState(next)
// from one value.

describe('nextLanguage()', () => {
  test('the three codes cycle in LANGUAGES order', () => {
    expect(nextLanguage('en')).toBe('pt');
    expect(nextLanguage('pt')).toBe('es');
    expect(nextLanguage('es')).toBe('en');
  });

  test('an unknown code wraps to the first language rather than throwing', () => {
    // LANGUAGES.indexOf('de') is -1, and (-1 + 1) % 3 lands at 0: the
    // expression is total, which is what lets the toggle survive a bad stored
    // value without a guard at the call site.
    expect(nextLanguage('de')).toBe('en');
  });
});

// The localStorage/window/navigator detection chain stays out of
// scope - it is browser state read once at module load. What is assertable
// headlessly is the switch itself: valid code moves, invalid code is ignored.

describe('getLang()/setLang()', () => {
  test('a known code switches the active language', () => {
    setLang('pt');
    expect(getLang()).toBe('pt');
    setLang('es');
    expect(getLang()).toBe('es');
    setLang('en');
    expect(getLang()).toBe('en');
  });

  test('an unknown code is ignored, not remembered', () => {
    setLang('de');
    expect(getLang()).toBe('en');
  });
});

// The category machinery: the DB stores canonical (Portuguese)
// values, display labels are each locale's own list matched by index. For PT/
// ES the assertions index into the imported template - "which dictionary won,
// which index answered" - and never quote the list's words, which keeps them
// green over whatever wording the provisional `es.ts` carries, and over any
// later rewrite of it. EN, the authored reference, gets the wording itself.

describe('categories(), categoryLabel(), categoryValue()', () => {
  test('EN maps the canonical DB values to its own labels, wording asserted', () => {
    setLang('en');
    expect(categoryLabel('Técnica')).toBe('Technique');
    expect(categoryLabel('Escalas')).toBe('Scales');
    expect(categoryLabel('Estudo')).toBe('Study');
  });

  test('in every locale, categoryLabel maps CATEGORY_CANONICAL[i] to categories()[i]', () => {
    const templates: Record<string, Locale> = { en: EN, pt: PT, es: ES };
    for (const code of ['en', 'pt', 'es']) {
      setLang(code);
      for (let i = 0; i < CATEGORY_CANONICAL.length; i++) {
        expect(categoryLabel(CATEGORY_CANONICAL[i])).toStrictEqual(templates[code].categories[i]);
      }
    }
    setLang('en');
  });

  test('matching is accent-folded, so the stored canonical survives either spelling', () => {
    // The fold on both sides is why localized UIs never split
    // existing rows: a hand-entered spelling still lands on the canonical's
    // index. 'Tecnica' is what folding 'Técnica' produces (the word has no h),
    // and 'Improvisacaon' folds out of the stored 'Improvisa' + c-cedilla +
    // a-acute + 'on' (CATEGORY_CANONICAL[5] carries both diacritics).
    setLang('pt');
    expect(categoryLabel('Tecnica')).toBe(PT.categories[0]);
    expect(categoryLabel('Improvisacaon')).toBe(PT.categories[5]);
    setLang('en');
  });

  test('null and unknown spellings pass through, not onto a wrong index', () => {
    expect(categoryLabel(null)).toBe('');
    expect(categoryLabel('Freestyle')).toBe('Freestyle');
  });

  test('categoryValue returns the canonical constant for an active-locale label', () => {
    // Asserted against CATEGORY_CANONICAL, the module's own DB constants, not
    // against quoted Portuguese: the claim is the index mapping back.
    for (const code of ['en', 'pt', 'es']) {
      setLang(code);
      const list = categories();
      for (let i = 0; i < list.length; i++) {
        expect(categoryValue(list[i])).toBe(CATEGORY_CANONICAL[i]);
      }
    }
    setLang('en');
  });

  test('the pair round-trips in every locale: label then value is the stored value', () => {
    for (const code of ['en', 'pt', 'es']) {
      setLang(code);
      for (const canonical of CATEGORY_CANONICAL) {
        expect(categoryValue(categoryLabel(canonical))).toBe(canonical);
      }
    }
    setLang('en');
  });

  test('categories() and dateLocale() follow one setLang: the switch is atomic per template', () => {
    const templates: Record<string, Locale> = { en: EN, pt: PT, es: ES };
    for (const code of ['en', 'pt', 'es']) {
      setLang(code);
      expect(categories()).toStrictEqual(templates[code].categories);
      expect(dateLocale()).toBe(templates[code].dateLocale);
    }
    setLang('en');
  });
});
