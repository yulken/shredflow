# ADR-0006: i18n engine in `src/lib/i18n.ts` with one dictionary module per language

- **Status:** Accepted
- **Date:** 2026-10-26
- **Scope:** all user-visible copy in the app
- **Code:** `src/lib/i18n.ts`, `src/lib/locales/en.ts` (reference),
  `src/lib/locales/pt.ts`, `src/lib/locales/es.ts`; consumers
  `src/App.tsx`, `src/components/ExerciseList.tsx`, `src/components/SessionView.tsx`,
  `src/components/ThemeToggle.tsx`, `src/components/LanguageToggle.tsx`
- **Related:** ADR-0007 (fallback for absent keys), ADR-0008 (which dictionary is
  active), ADR-0011 (what is *not* translated), ADR-0013/0014/0015 (how the
  dictionaries get filled)

## Context

The app shipped as a single-language app: Brazilian-Portuguese strings written
directly into components. The requirement is to offer PT, EN and ES in the same
build, and every piece of user-visible copy must switch together - a half-localized
screen is worse than an untranslated one. Hand-copying each string into each call
site does not scale: the same word ("Save", "History", "exercise") appears in
buttons, headings, aria-labels, tooltips and messages, and the components already
had a PT version of it that would have to be found every time.

The strings also need parameters. Sentences like "Delete {count} exercise(s)?" and
"{seconds} second(s) left" cannot live as constants, and number agreement differs
between PT and EN, so the placeholder mechanism has to be language-independent.

## Decision

One engine module and one dictionary module per language.

1. **`src/lib/i18n.ts` owns the mechanism and nothing else.** It imports the three
   dictionaries (`import { EN } from './locales/en'` etc.), keeps the lookup table
   `const templates: Record<string, Locale> = { en: EN, es: ES, pt: PT }`, and exports
   the accessors: `t`, `tp`, `dateLocale()`, `categories()`, `getLang()`, `setLang()`
   plus `LANGUAGES` and `LANGUAGE_NAMES`. Components never read a dictionary directly.
2. **The dictionary shape is a typed object, not a flat map:**

   ```ts
   export type Locale = {
     code: string;
     nativeName: string;
     dateLocale: string;
     categories: string[];
     strings: Record<string, string>;
   };
   ```

   `code`, `nativeName` (shown in the language toggle's `aria-label`) and `dateLocale`
   (passed to `toLocaleDateString`/`toLocaleString`) are metadata that belongs with the
   language, not with any call site. `categories` is the locale's display list, index-matched
   to `CATEGORY_CANONICAL` (ADR-0012).
3. **Keys are flat snake_case names inside `strings`** (`save_button`, `no_exercises_title`,
   `confirm_delete_session`). Flat keys keep the call site a one-token lookup and make
   parity between dictionaries checkable as a set difference; nested objects would make
   that check recursive without buying anything.
4. **Interpolation is `{placeholder}` text, resolved by the engine:**
   `raw.replace(/\{(\w+)\}/g, (_, name) => (name in params ? String(params[name]) : \`{${name}}\`))`.
   The wording stays in the dictionary, so a language may reorder or repeat a
   placeholder - PT and EN put the number in different positions. An unknown
   placeholder is left in place rather than blanked, so a missing argument shows up as
   visible text instead of silently deleting a word.
5. **Plurals are `_one`/`_other` key pairs resolved by `tp(key, count, params)`:**
   `` t(`${key}${count === 1 ? '_one' : '_other'}`, { ...params, count }) ``. The two
   forms are ordinary dictionary entries; the engine picks one and injects `count` as a
   placeholder. This keeps number agreement in the dictionary, where PT needs it and EN
   mostly does not.
6. **`src/lib/locales/en.ts` is the reference dictionary** and the only hand-authored one
   (ADR-0013). Every other language must cover the same key set.
7. **Components call the engine with plain string keys**, e.g. `t('save_button')`,
   `t('tension_label')`, `tp('sessions_count', n)`. The `@/lib/i18n` import alias is the
   starter's own rule from `.bolt/prompt` and is used unchanged.

## Alternatives considered

- **String literals in components with an `if (lang === 'pt')` per site.** Rejected: dozens
  of call sites, no way to check that they all agree, and no place to fix a mistranslation.
- **A single `locales.ts` with all languages in one file.** Rejected: the files grow to
  hundreds of lines each and a per-language file is what the generator scripts (ADR-0013)
  write and what a reviewer can read one language at a time.
- **JSON dictionaries (`en.json`, ...).** Rejected: no `dateLocale`/`nativeName` typing, no
  comments, and losing the `Locale` type would drop the compile-time guarantee that
  `templates[current].strings[key]` is even a thing.
- **ICU MessageFormat / `intl-messageformat` / `formatjs`, or `react-intl`.** Rejected:
  plurals, gender and interpolation rules were never needed beyond `_one`/`_other` and a
  named placeholder, and adding a message-format compiler (plus its own plural-category
  tables) to a 1641-module bundle to serve 63 short strings is more machinery than the
  feature. The app is not a library and does not need `.po`/`.json` interchange formats.
- **One `strings` map keyed `[key][lang]`** (transposed). Rejected: adding a language means
  editing 63 rows instead of one file, and the missing-key fallback (ADR-0007) reads
  naturally as "this language's dictionary lacks this key".
- **`Intl`/`toLocaleString` for the numbers themselves.** Used where the value is a
  number/date (`dateLocale()` feeds them), but they cannot translate words, so they are
  not the i18n layer.

## Consequences

- Localizing a string is a two-step act: add the key to `en.ts`, add it to the others, then
  call it. Nothing at a call site is language-aware, which is what makes the language
  switch total rather than per-screen.
- The key set is the contract. A new component must add its keys to all three dictionaries;
  the parity check in ADR-0007's Verification is what catches a slip, and the engine's
  fallback keeps the app running rather than rendering `undefined`.
- `t()` is a runtime lookup: key typos are not caught by the typechecker, and a renamed key
  silently becomes a missing key until the warning fires. That is the price of the flat,
  reviewable dictionary.
- Because the engine resolves the active language at module load (`let current = initialLang()`),
  language is process-wide state, not a parameter threaded through components (ADR-0009).
  `categories()` and `categoryLabel()` depend on it. This makes the components simple, at the
  cost of one implicit dependency: the same call returns a different string after a toggle.
- Dictionaries are plain objects shipped in the bundle. That is 3 x 63 short strings, not a
  locale-data set, so no runtime locale download is involved.

## Verification

- Key parity was checked with `/tmp/opencode/check-locales.mjs`: 63 string keys in each of
  `en`, `pt`, `es`; 63 keys used across the components; zero missing in either direction.
- Interpolation is exercised by keys whose values contain `{...}` and by `tp` pairs
  (`*_one`/`*_other`); a call site that forgets an argument leaves the literal `{name}` in
  the rendered text, which is visible rather than silent.
- `npm run typecheck` and `npm run build` pass with the layer in place (1641 modules).
