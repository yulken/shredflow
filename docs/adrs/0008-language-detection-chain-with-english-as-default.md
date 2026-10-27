# ADR-0008: Language detection chain - stored value, `?lang=`, browser, then English

- **Status:** Accepted
- **Date:** 2026-10-26
- **Scope:** which dictionary is active when the page loads
- **Code:** `src/lib/i18n.ts` (`initialLang()`, `DEFAULT_LANG`, `LANGUAGES`,
  `setLang()`), `src/hooks/useLanguage.ts` (writes the stored value)
- **Related:** ADR-0007 (`REFERENCE_LANG`, a different constant), ADR-0009 (the hook
  that persists the choice), ADR-0006 (`LANGUAGES` is the supported set)

## Context

The app has to pick a language on first load, before any control exists. It shipped with
Portuguese copy (the user's own practice data and the original screens are Brazilian), and
the requirement is PT/EN/ES with **English as the default** - explicitly overriding the
assumption that the shipped language should be the default. At the same time, a browser
setting must not be the only answer: the language is a per-user preference on an app
without sign-in (ADR-0002), and the in-app toggle has to survive a reload.

The requirement also has to survive a headless environment: the module is imported in
contexts where `window` and `localStorage` do not exist, and a thrown error there would
break the app instead of defaulting it.

## Decision

A four-step chain, first match wins, evaluated once at module load
(`let current = initialLang()`):

1. **Stored choice** - `localStorage.getItem('lang')`, accepted only if
   `templates[stored]` exists. Wrapped in `try/catch` with a comment
   (`// storage unavailable, fall through`), so a browser with blocked storage or a
   non-browser import does not throw.
2. **URL override** - only when `typeof window !== 'undefined'`:
   `new URLSearchParams(window.location.search).get('lang')`, same membership test. So
   `?lang=es` works, and `?lang=fr` is rejected rather than half-applied.
3. **Browser language** - `(navigator.language || '').toLowerCase()` tested with
   `startsWith` against `LANGUAGES` in array order (`en`, `pt`, `es`). Prefix matching is
   what makes `pt-BR`, `en-US` and `es-419` resolve without a country table; an empty
   `navigator.language` matches nothing and falls through.
4. **`DEFAULT_LANG = 'en'`** - the final answer when nothing else matched.

Two supporting rules:

- **Unknown codes cannot enter the state.** `setLang(code)` sets only `if (templates[code])`,
  so the active language is always a dictionary that exists. A URL value, a stale
  localStorage value from a future version, or a bad call site all resolve the same way.
- **`DEFAULT_LANG` and `REFERENCE_LANG` are separate constants** that happen to both be
  `'en'` (ADR-0007). The fallback dictionary must not change because the default language
  changes, and vice versa.

## Alternatives considered

- **Portuguese as the default.** Rejected by the request: the default is EN. PT remains the
  language the data was entered in, which is why the DB's canonical category values are
  Portuguese (ADR-0012) - that fact is independent of which language the UI starts in.
- **`navigator.languages`** (the full preference list) instead of `navigator.language`.
  Rejected: it would follow a user's *secondary* languages (common in browsers set by a
  Brazilian with EN first), which makes the first load disagree with the visible setting
  more often than prefix-matching a single value does.
- **Country-based detection** (`pt-BR` -> PT, everything else -> EN). Rejected: over-broad
  (an EN-user in Brazil), and it duplicates a language table `LANGUAGES` already gives.
- **A cookie instead of `localStorage`.** Rejected: the app has no server side to set a
  cookie and no consent flow needs one; `localStorage` is set by our own hook (ADR-0009).
- **Server-side `Accept-Language` negotiation.** Rejected: this is a static Vite client
  (`dist/` is git-ignored, no server in the loop), and negotiation would make the language
  untestable from a URL, which the `?lang=` step exists to preserve.
- **No stored choice** (re-detect every load). Rejected: the toggle would be lost on the
  next reload, which is the commonest interaction with the app.
- **No URL override.** Rejected: without it there is no way to see a specific language on
  first load, to screenshot all three, or to point a test at one, without clicking the
  toggle N times.
- **No `try/catch` / `window` guard.** Rejected: `localStorage` access throws on some
  embeds and blocks, and the guard is what lets `i18n.ts` load where `window` is absent.

## Consequences

- English is what an unconfigured user sees, so the app's shipped PT copy is no longer the
  baseline experience; every other language must be as complete as EN (ADR-0007's parity
  check is what enforces that).
- A browser whose `navigator.language` is `en-US` gets EN even in Brazil. That is the
  accepted consequence of the default rule, and the toggle is the user's way past it.
- `?lang=` only applies when nothing is stored, because storage is checked first: after the
  first load the hook has written `lang` (ADR-0009), so the URL parameter is a first-load /
  clean-browser tool. Clearing storage or using a fresh profile is how the override is
  re-tested.
- The active language is frozen per page load: `initialLang()` runs at import, so changing
  language without the toggle means reloading, and `getLang()` before any toggle is
  already the resolved value. This is why `useLanguage` seeds its state from `getLang()`
  rather than re-deriving.
- `LANGUAGES`' order does two unrelated things: prefix-match priority and the toggle's
  cycle order (ADR-0009). Reordering it changes both. Today's order is `en`, `pt`, `es`.
- Storage unavailability degrades to per-session language: the toggle still works, the
  choice just does not survive the reload, and nothing is thrown into the console.

## Verification

- Chain order is readable at `src/lib/i18n.ts` lines 20-36 (`stored`, then `fromUrl`,
  then the `for (const code of LANGUAGES)` prefix loop, then `return DEFAULT_LANG`),
  with the guard at line 27 and the membership tests at lines 23 and 29.
- `grep -n "DEFAULT_LANG\|REFERENCE_LANG" src/lib/i18n.ts` shows both constants at lines
  17-18 and their separate uses at lines 35 and 51-54.
- With no storage, no `?lang=`, and an unlisted `navigator.language`, the resolved value
  is `'en'`; with `?lang=zz`, `templates['zz']` is falsy and the same fall-through applies.
- `npm run build` and `npm run typecheck` pass, i.e. the `window`-guarded module also
  typechecks in a non-browser context.
