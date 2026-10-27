# ADR-0009: The language hook and toggle mirror the theme hook and toggle

- **Status:** Accepted
- **Date:** 2026-10-26
- **Scope:** how a user-facing preference is wired into the app
- **Code:** `src/hooks/useLanguage.ts` and `src/components/LanguageToggle.tsx` (new),
  pattern source `src/hooks/useTheme.ts` and `src/components/ThemeToggle.tsx`,
  wiring in `src/App.tsx` (lines 3-6 and 13-14 and 33-34)
- **Related:** ADR-0006 (engine accessors), ADR-0008 (the chain that resolves first),
  ADR-0010 (what the hook sets on the document)

## Context

The starter already had exactly one user-facing preference: light/dark. Its shape is a
custom React hook (`useTheme`) that owns state and side effects, plus a dumb component
(`ThemeToggle`) that only renders a button and forwards a click. A second preference now
exists (PT/EN/ES), and the app has to look like one thing in both respects: two toggles
side by side in the header, both surviving a reload, both flipping a class-level document
state. Duplicating the theme's wiring a third time in `App.tsx` would leave the app with
two competing patterns for the same kind of control.

## Decision

Add a language pair that is structurally identical to the theme pair.

| Theme | Language |
| ----- | ------ | ------- |
| `src/hooks/useTheme.ts` | `src/hooks/useLanguage.ts` |
| `src/components/ThemeToggle.tsx` | `src/components/LanguageToggle.tsx` |
| `useTheme()` -> `{ theme, toggleTheme }` | `useLanguage()` -> `{ lang, toggleLanguage }` |
| `root.classList.add('dark')` | `document.documentElement.lang = code` (ADR-0010) |
| `localStorage.setItem('theme', theme)` | `localStorage.setItem('lang', code)` |
| `Moon`/`Sun` from `lucide-react` | `Globe` from `lucide-react` |

Both hooks follow the same three-part contract:

1. **State seeded from a resolved value.** `useTheme` derives `light`/`dark` itself from
   `localStorage` + `prefers-color-scheme`; `useLanguage` seeds from
   `useState<string>(getLang())`, because the engine already ran its detection chain at
   module load (ADR-0008). The hook does not re-implement detection.
2. **A `useEffect` keyed on the state** applies it to the document and persists it, each
   wrapped so a blocked store degrades to in-memory (`// storage unavailable, keep in-memory language only`).
3. **The toggle is a pure next-state function.** `toggleTheme` flips two values;
   `toggleLanguage` cycles the N-value set:
   `LANGUAGES[(LANGUAGES.indexOf(lang) + 1) % LANGUAGES.length]`, then calls both
   `setLang(next)` (engine, so `t()` follows) and `setLangState(next)` (hook, so the
   effect and the rendered label follow). The modulo is what makes N languages a ring
   rather than a hand-written pair of branches.

`App.tsx` wires them identically, adjacent:

```ts
const { theme, toggleTheme } = useTheme();
const { lang, toggleLanguage } = useLanguage();
...
<ThemeToggle theme={theme} onToggle={toggleTheme} />
<LanguageToggle lang={lang} onToggle={toggleLanguage} />
```

`LanguageToggle` reuses the theme button's class string (`relative h-10 w-10 rounded-xl flex
items-center justify-center transition-colors bg-gray-100 hover:bg-gray-200 dark:bg-gray-800
dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300`) so the two buttons are visually
one pair, and adds a visible `{lang.toUpperCase()}` badge (`EN`, `PT`, `ES`) because an
icon alone cannot show which language is active.

Deliberate deviations from the theme pair, both recorded rather than smoothed over:

- **`ThemeToggle`'s `aria-label` is localized** (`theme === 'dark' ? t('theme_light') : t('theme_dark')` -
  the label names the action the click performs, "Activate dark mode"), while
  **`LanguageToggle`'s is not** (`LANGUAGE_NAMES[lang] ?? lang` - "Espagnol"/"English"/"Português").
  A language control's click cycles an N-state ring, so there is no single named action to
  promise; the label states which language is selected, and native names are language-
  independent metadata on the `Locale` type (ADR-0006).
- **`useLanguage` writes the engine as well as its own state** (`setLang` + `setLangState`).
  The theme has no second consumer of state; language does, because every `t()` call reads
  the engine. Keeping them in one place is what makes the flip atomic.
- **`useTheme` reads `matchMedia`; `useLanguage` does not read the browser.** The chain that
  already ran is the engine's (ADR-0008), so reading the browser twice would risk two
  different answers.

## Alternatives considered

- **Put language state in `App.tsx` directly.** Rejected: the theme preference is not in
  `App.tsx` either, and doing so would give the app two shapes for the same control.
- **A single `usePreferences()` hook owning theme and language.** Rejected: it merges two
  unrelated state spaces, so a theme change would re-run a language effect, and it would
  rename a pattern the codebase already names.
- **Reusing `ThemeToggle` with a different prop** (a generic toggle component). Rejected:
  the two icons, aria-labels and state types do not overlap enough for a shared component
  to be honest about either.
- **A `select`/dropdown of three languages instead of a cycling button.** Rejected: the header
  already has one toggle-shaped control, and the toggle is also the only control that can be
  clicked repeatedly to audit all three dictionaries.
- **Detecting language changes from `window` events** (e.g. re-reading `localStorage` on
  render). Rejected: state would be read outside the React state graph, so the effect and the
  rendered label could disagree with the engine.
- **`localStorage.setItem` moved into the engine's `setLang`.** Rejected: the engine resolves
  first load (ADR-0008) and would then persist an auto-detected language, making the
  override sticky before the user ever chose - the persistence belongs to the interaction,
  which is the hook, matching how `useTheme` persists.

## Consequences

- Two preferences, one shape: reading `App.tsx` tells you what both toggles do without
  reading either hook, and adding a third preference has a template.
- The engine and the hook hold the same value by construction (`setLang` and
  `setLangState` are called together), so a rendered `EN` badge cannot coexist with PT strings.
  If that pair is ever split, this is the invariant that breaks.
- Cycling modulo means the click sequence is positional: from `en`, two clicks land on `es`.
  There is no way to select a specific language from the toggle except by cycling, and the
  `?lang=` parameter (ADR-0008) is the escape hatch.
- Persistence is per-key and per-name (`'lang'` vs `'theme'`), so a user's dark mode and
  their language do not overwrite each other, and both survive the reload that
  re-runs detection.
- `LanguageToggle` shows `lang.toUpperCase()`, i.e. the code, not the name: the badge is
  2 characters in all three languages, whereas `LANGUAGE_NAMES` is only in the
  `aria-label`. Screen readers and sighted users read different fields here on purpose.

## Verification

- `grep -n "useLanguage\|useTheme\|LanguageToggle\|ThemeToggle" src/App.tsx` returns the
  imports at lines 3-6, the two destructure lines 13-14, and the two render lines 33-34 -
  the pairing is visible in the wiring, not only in the files.
- `useLanguage` returns exactly `{ lang, toggleLanguage }` and `useTheme`
  `{ theme, toggleTheme }`; both are `export function use...()` custom hooks in
  `src/hooks/`, which is where the starter keeps them.
- The cycling line is `LANGUAGES[(LANGUAGES.indexOf(lang) + 1) % LANGUAGES.length]`, so
  three clicks from `en` return to `en`.
- `npm run typecheck` and `npm run build` pass with both components in the tree (1641
  modules).
