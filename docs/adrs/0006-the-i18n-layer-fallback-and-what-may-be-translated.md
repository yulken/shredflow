# ADR-0006: One i18n engine, an EN fallback, and the copy-versus-data boundary

- **Status:** Accepted
- **Date:** 2026-10-26

## Rule

1. `src/lib/i18n.ts` owns the mechanism; `src/lib/locales/<code>.ts` hold only data.
   A dictionary exports one `Locale` object with `code`, `nativeName`, `dateLocale`,
   `categories` and `strings`.
2. A missing key returns the English string; if English has none either, the key itself
   is returned and the miss is warned once. `DEFAULT_LANG` and `REFERENCE_LANG` are both
   `en`.
3. Only user-visible copy goes through `t()`. Text the user typed - notes, exercise
   names, descriptions - is rendered verbatim, and `console.error` text is not translated.
4. A category is stored as a canonical English value and displayed as a localized label
   picked by index against `categories`; matching is accent-folded.

## Decision

One engine and one dictionary per language, rather than a per-string call site: the same
word appears in buttons, headings, aria-labels and messages, and a half-localized screen
is worse than an untranslated one. Placeholders are language-independent because number
agreement differs between PT and EN.

Translating user-entered data was rejected: the row carries no record of the language it
was authored in, and the same row is rendered in three languages. English as the fallback
was chosen over PT, which is what the app shipped with, because the requirement names
English as the default.

## Verify

```
grep -c 'export type Locale' src/lib/i18n.ts           # -> 1
grep -c "REFERENCE_LANG = 'en'" src/lib/i18n.ts        # -> 1
grep -c 'console.warn' src/lib/i18n.ts                 # -> 1
grep -c '?? key' src/lib/i18n.ts                       # -> 1
grep -c 'export const CATEGORY_CANONICAL' src/lib/i18n.ts   # -> 1
grep -c 'session.notes' src/components/SessionView.tsx # -> 2
```
