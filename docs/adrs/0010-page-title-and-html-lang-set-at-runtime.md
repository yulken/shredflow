# ADR-0010: Page title and `<html lang>` are set at runtime, `index.html` keeps a static fallback

- **Status:** Accepted
- **Date:** 2026-10-26
- **Scope:** document-level metadata (tab title, a11y language attribute)
- **Code:** `src/hooks/useLanguage.ts` (lines 14-15: `document.documentElement.lang = code`,
  `document.title = t('page_title')`), key `page_title` in `src/lib/locales/{en,pt,es}.ts`,
  static fallback in `index.html` (line 2 `<html lang="en">`, line 7
  `<title>Guitar Practice Tracker App</title>`)
- **Related:** ADR-0006 (metadata on the `Locale` type), ADR-0008 (resolved code),
  ADR-0009 (the hook is where document-level effects live), ADR-0014 (the em dash is an
  escape in the dictionaries)

## Context

Two pieces of metadata have to follow the active language, and neither can be written
statically in the template:

- **The tab title.** Browsers show `document.title` in the tab, bookmarks and history.
  With PT/EN/ES in one build, a static title means the tab lies about the language the page
  is in, and a bookmark made in one language keeps the old title forever.
- **`<html lang>`.** Screen readers and translators pick the pronunciation, hyphenation and
  font shaping from it. A hardcoded `lang="en"` on a PT screen is an accessibility defect,
  and the app is explicitly a practice tool whose users switch language on demand.

The starter writes both into `index.html`, which is evaluated at build time. The active
language is only known in the browser (ADR-0008's chain runs at module load), so neither
value can be decided there.

## Decision

The runtime owns both, and the template keeps a plausible static value.

1. **`useLanguage`'s effect sets both, keyed on the language state:**

   ```ts
   document.documentElement.lang = code;
   document.title = t('page_title');
   ```

   The effect runs on the initial render and again whenever `lang` changes, so the tab
   re-titles itself on the same click that re-renders every label - there is no separate
   "title changed" path to keep in sync.
2. **The title is a dictionary entry**, `page_title`, not a template with the brand spliced
   in. Each language owns its full title string:
   `en`: `GuitarTrain \u2014 Guitar practice tracker`,
   `pt`: `GuitarTrain \u2014 Controle de treino de guitarra`,
   `es`: currently still the English text (ADR-0015).
3. **`index.html` keeps its static values** (`<html lang="en">`, `<title>Guitar Practice Tracker App</title>`)
   as the pre-JS fallback. They are what the browser sees before the hook's effect runs,
   during a fetch that does not run scripts, and in the page's first paint. `en` matches the
   startup default (ADR-0008), which is why the static `lang` is not a lie.
4. **The brand and the separator live in the string, not in the markup.** `\u2014` (EM DASH)
   is inside the dictionary value, written as an escape per ADR-0014.
5. **`useTheme` does not touch `<html>`'s `lang`,** and the language hook does not touch its
   class list. Each hook writes the one document attribute it owns, so the two cannot
   clobber each other.

## Alternatives considered

- **A localized title in `index.html`.** Rejected: the language is a browser-side runtime
  value (ADR-0008), and Vite's template cannot read it.
- **Three builds, one per language.** Rejected: the whole i18n decision is one build,
  three dictionaries (ADR-0006).
- **A `<link>` of per-language titles / `hreflang` alternates.** Rejected: this is an app page,
  not an indexable multi-language site; there is no crawl to serve.
- **`<title>` only via a `<title>` element re-rendered by React.** Rejected: `document.title`
  is the assignment the browser already supports; creating title nodes in a component is
  undefined territory in React's rendering model.
- **`document.documentElement.lang` replaced by a `lang` attribute on `<body>`/a wrapper div.**
  Rejected: the root element is where the standard puts it, and `useTheme` already uses
  `document.documentElement` for its own class (ADR-0009's pairing).
- **Never setting `lang` and leaving `en` in the template.** Rejected: the accessibility
  defect described in the Context is the whole reason this record exists.
- **Deleting the static fallback from `index.html`.** Rejected: an empty title flashes on
  every load, and the tab is blank for users who disable JS; a stale-but-correct brand name
  is strictly better than nothing.

## Consequences

- Tab title and `lang` follow the toggle, so all three languages can be verified from the tab
  without reading the DOM.
- `index.html`'s title (`Guitar Practice Tracker App`) is not any of the three dictionary
  values, so the first paint can briefly show a string that is not in any dictionary. The
  fallback is deliberately allowed to be stale (it predates the `GuitarTrain` brand) rather
  than duplicated per language, but the duplication gap is real and visible on a slow load.
- If the hook ever fails to run (no JS, blocked script, an error thrown before the effect),
  the page keeps `lang="en"` and the legacy title - it degrades to the static pair, which is
  a consistent EN state, not a broken one.
- A tab title that fits the app's brand rules has to be edited in three dictionaries, so
  renaming the product (ADR-0002's `app_brand`) means three `page_title` values plus the
  fallback in `index.html`. Four places.
- Because `t('page_title')` reads the active language, the title and every visible label come
  from the same dictionary lookup pass; a missing `page_title` behaves per ADR-0007
  (falls back to EN and warns), which is the behaviour we want here rather than an empty tab.

## Verification

- `grep -n "document.documentElement.lang\|document.title" src/hooks/useLanguage.ts`
  returns lines 14-15, inside the `useEffect` whose dependency array is `[lang]`.
- `grep -n page_title src/lib/locales/*.ts` returns one entry per dictionary (`en` line 10,
  `pt` line 18, `es` line 18), i.e. the key exists in all three and cannot produce the
  fallback warning.
- The `pt` value is the only one translated at time of writing; the `es` value is byte-identical
  to `en`, which is one of the defects listed in ADR-0015.
- The static pair is still present in `index.html` (line 2, line 7) - the fallback was not
  deleted.
- `npm run build` succeeds with the runtime assignment in place (the title is not a
  build-time artifact, so `dist/` carries the static one).
