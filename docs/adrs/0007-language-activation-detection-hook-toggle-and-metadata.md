# ADR-0007: Language activation - the detection chain, the hook, the toggle, metadata

- **Status:** Accepted
- **Date:** 2026-10-26

## Rule

1. The active language is decided once at module load by a four-step chain, first match
   wins: stored `localStorage` value, then `?lang=` in the URL, then `navigator.language`,
   then `DEFAULT_LANG`. A candidate is accepted only if it has a dictionary, and a step
   that is missing - no `window`, no `localStorage` - falls through instead of throwing.
2. `useLanguage()` is a hook returning `{ lang, toggleLanguage }` that owns the store,
   `document.documentElement.lang` and `document.title`; the toggle component only renders
   and owns no state.
3. `nextLanguage` advances along `LANGUAGES`, so the toggle walks the whole set and returns
   to the start. `index.html` keeps a static `lang` and `title` as a fallback only.

## Decision

Detection defaults to English even though the app shipped with Portuguese copy, because the
requirement says so, and the browser is not the only answer because the app has no sign-in
(ADR-0002) to hold a preference and the toggle has to survive a reload. A stored value
rejected by the dictionary check is what keeps a stale `localStorage` entry from selecting a
language that has no content. The hook pattern is copied from `useTheme.ts` rather than
invented, and `index.html`'s static values were rejected as the source of truth: they are
fixed at build time while the language is known only in the browser.

## Verify

```
grep -c 'let current = initialLang()' src/lib/i18n.ts     # -> 1
grep -c "getItem('lang')" src/lib/i18n.ts                 # -> 1
grep -c 'location.search' src/lib/i18n.ts                 # -> 1
grep -c 'navigator.language' src/lib/i18n.ts              # -> 1
grep -c "setItem('lang'" src/hooks/useLanguage.ts         # -> 1
grep -c 'documentElement' src/hooks/useLanguage.ts        # -> 1
grep -c 'nextLanguage(lang)' src/hooks/useLanguage.ts     # -> 1
grep -c 'Globe' src/components/LanguageToggle.tsx         # -> 2
grep -c 'lang="en"' index.html                            # -> 1
```
