# ADR-0011: Only user-visible copy is translated; user-entered data stays verbatim

- **Status:** Accepted
- **Date:** 2026-10-26
- **Scope:** the boundary of the i18n layer - what goes through `t()` and what does not
- **Code:** `src/lib/i18n.ts` and `src/lib/locales/*.ts` (the layer) vs. the DB round-trip in
  `src/components/ExerciseList.tsx` (name, `description`, `category`) and
  `src/components/SessionView.tsx` (`notes`), and the untranslated developer log
  `console.error` at line 25 of that file, whose message is a hardcoded Portuguese
  literal
- **Related:** ADR-0002 (data model), ADR-0006 (keys), ADR-0012 (the one exception:
  category *labels*, not category *values*)

## Context

Once an i18n layer exists, the temptation is to run everything through it. The app stores
text the user typed: exercise names, descriptions, and free-form notes on each session
(`notes: notes.trim() || null` at `SessionView.tsx:41`, `description`/`category` at
`ExerciseList.tsx:207-208`), and displays that same text later (`{session.notes}` at
`SessionView.tsx:381`, `{exercise.description}` at `ExerciseList.tsx:142`).

That text is not copy. It is data the user authored in whichever language they were using
when they authored it, and it is also read back after switching language - the same
`practice_sessions` row is rendered in EN, PT and ES. There is no mechanism to record "this
note was written in PT" on the row, and translating it would mean asserting a language
that was never claimed. Meanwhile some strings in the code are visible only to developers
(`console.error`), where a translation only adds noise.

## Decision

The layer covers UI chrome. Everything else is left alone.

In the layer (translated, keyed, per-language):

- labels, buttons, headings, tooltips, `aria-label`s, empty-state copy, error messages shown
  to the user, and form field placeholders (`placeholder_notes`, `placeholder_description`,
  `placeholder_bpm`) - a placeholder is instructions about the field, not user content.
- sentences that frame a user value: `t('goal_line', { bpm: exercise.target_bpm })` at
  `SessionView.tsx:235` translates the frame and interpolates the number, so a number the
  user typed is presented in localized words.
- document metadata (`page_title`, ADR-0010) and the toggle's own label.

Not in the layer (verbatim):

- **anything the user typed** - exercise name, `description`, `notes`, and any future free-text
  column. Stored as entered, displayed as entered, never passed through `t()`, never
  normalized, never case-folded.
- **the DB's own enum-ish values**: `category` submits canonical values (ADR-0012), and the
  display of them is a label mapping, not a translation of a `t()` key.
- **numeric and date formatting**: `toLocaleDateString(dateLocale(), ...)`
  (`SessionView.tsx:310`) and `toLocaleTimeString(dateLocale(), ...)` (315) use the
  `dateLocale` metadata (`en-US`, `pt-BR`, `es-ES`) - locale-aware *formatting*, which is a
  different mechanism from translation, and the only one that can format a number.
- **developer-visible text**: the `console.error` at `ExerciseList.tsx:25` stays a
  Portuguese literal in code (it predates the layer, and carries a raw U+00ED in the
  source). Same for `LANGUAGE_NAMES` values in `i18n.ts:14`
  (`English`, `Portugu\u00e9s`, `Espa\u00f1ol`, the latter two written as `\uXXXX` escapes) and the engine's own
  `console.warn` text (`i18n.ts:52`).
- **identifiers, storage keys and CSS class names** (`'lang'`, `'theme'`, `dark:`,
  dictionary key names).

## Alternatives considered

- **Translate user-entered text** (round-trip through a dictionary or a machine
  translator). Rejected: the language a note was written in is unknown and unrecorded, a
  mistranslation of a user's own observation is a data defect, not a copy defect, and it
  would rewrite what the user wrote on every language switch.
- **Add a `language` column to `exercises`/`practice_sessions`.** Rejected for now: nothing
  consumes it, and its only plausible consumer (a mixed-language list) is already handled by
  showing text verbatim. If UI ever needs to *filter* by authoring language, that becomes a
  new record.
- **Machine-translate user content at display time.** Rejected twice over: it needs a
  network call per render, and it silently alters the user's own words.
- **Run developer-facing console text through the layer.** Rejected: it is not user-visible,
  and localizing logs makes the log language depend on the page, which is the opposite of
  what makes logs greppable.
- **Normalize user text (accent-fold, lowercase) on store.** Rejected: what `categoryValue`/
  `categoryLabel` fold (ADR-0012) is a *closed* set our code owns. Free text has no such set,
  and folding `Cafe`/`Cafe` would collide distinct exercises.
- **Store the display language of the page with each row** (a snapshot locale per session).
  Rejected: the row is about a practice session, not about a page state, and it would not
  make the stored text translatable anyway.
- **A single neutral locale for dates.** Rejected: `dd/mm/yyyy` vs `mm/dd/yyyy` is the visible
  difference Brazilian and US users notice, and it is what `dateLocale()` exists to control.

## Consequences

- Language switching changes the chrome and not the data, so a user's exercise list reads the
  same in every language. That is the only defensible behaviour, and it is what makes the
  rule "data is never `t()`-ed" load-bearing rather than stylistic.
- Mixed content is possible and expected: a PT note on an EN screen looks like a foreign
  paragraph inside English chrome. Nothing in the code has to be fixed for that, and no
  feature may "clean it up".
- The untranslated `console.error` at `ExerciseList.tsx:25` keeps a literal accented character
  in a component (U+00ED) while the locale dictionaries are pure ASCII (ADR-0014). The two
  conventions coexist on purpose: components carry code-point characters, dictionaries carry
  escapes.
- Because the boundary is "user-visible or not", adding a new visible string means adding a
  key to three dictionaries (ADR-0007's parity contract), whereas adding a new DB column
  means adding no keys at all unless it is displayed. The boundary is what tells the two apart.
- `LANGUAGE_NAMES` renders in the toggle's `aria-label` untranslated. That field is a
  metadata string, and if a screen reader in PT must hear "Espagnol" rather than "Spanish",
  the fix belongs in a new record, not in this one.

## Verification

- `grep -n "\bnotes\b" src/components/SessionView.tsx` shows the write path (14, 41) and the
  display path (381) with no `t(` around either, and the same for `description` in
  `ExerciseList.tsx` (142, 189, 207).
- `grep -n "console\." src/components/*.tsx src/lib/i18n.ts src/hooks/useLanguage.ts` returns
  only literals - no `console.*(t(` call - so no log line goes through the layer.
- `dateLocale()` resolves to `en-US` / `pt-BR` / `es-ES` in the three dictionaries
  (line 4 of each), and is used only as a `toLocale*` argument.
- `npm run build` and `npm run typecheck` pass, so the untranslated paths typecheck against
  the DB's own field types (ADR-0002).
