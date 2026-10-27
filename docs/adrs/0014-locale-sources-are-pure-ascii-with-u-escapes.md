# ADR-0014: Locale sources are pure ASCII; every non-ASCII character is written `\uXXXX`

- **Status:** Accepted
- **Date:** 2026-10-26
- **Scope:** the byte content of `src/lib/locales/*.ts` and `src/lib/i18n.ts`
- **Code:** `esc()` in `/tmp/opencode/gen-es.mjs` (line 161) and `/tmp/opencode/gen-pt.mjs`
  (line 7), the `fold` regex at `src/lib/i18n.ts:76`, `\u2014` escapes in
  `src/lib/locales/{en,pt,es}.ts` (`footer_tagline`, `page_title`)
- **Related:** ADR-0013 (the generators that apply the rule), ADR-0015 (defects that the rule
  makes visible), ADR-0012 (where the accented canonical values live), ADR-0011 (components,
  which are *not* covered by this rule)

## Context

The dictionaries are the only files in this app that must carry accented words as *values*
(`T\u00e9cnica`, `Portugu\u00e9s`, `Espa\u00fcl`-style strings, em dashes in titles). Those
bytes are produced and moved around by tools in three different ways: the assistant's own
output, generator scripts, and patch/diff tooling. Raw non-ASCII in generated source has
already been observed to arrive mangled: `nativeName: 'Portugus'` in `src/lib/locales/pt.ts`
is what `Portugu\u00e9s` became after going through this pipeline, and the components' own
accented literal at `ExerciseList.tsx:25` is a raw U+00ED that no generator ever validated.

A mangled raw byte is invisible in a diff and invisible when re-read: several tools in this
session render the same Spanish word differently each time they print it, so "read the file
and confirm the accent" is not a check that exists. A file that is pure ASCII except for
`\u`-escapes can be checked by codepoint dump, and a wrong escape is at least a visible 6-byte
difference.

## Decision

For the locale dictionaries and the engine: **the file bytes are ASCII-only, and
non-ASCII characters are written as `\uXXXX` escapes.**

1. **Generators enforce it, writers do not decide it.** `gen-es.mjs` ends every value through
   `esc`:
   `s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/[^\x20-\x7e]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'))`
   - backslash first, then the quote, then every non-printable/non-ASCII codepoint. `gen-pt.mjs`
   uses the same idea (`[^ -~]`, plus a quote escape written as
   `String.fromCharCode(92, 39)`). No value reaches a file without passing through `esc`.
2. **Escapes are four-digit lowercase-hex with a literal backslash in the source** (`\u00e9`,
   `\u2014`), i.e. valid JavaScript string escapes, so the runtime value is unchanged by this
   rule - it is a byte-level convention, not a semantic one.
3. **The engine's own non-ASCII is escaped too**: `LANGUAGE_NAMES` values
   (`Portugu\u00e9s`, `Espa\u00f1ol`) and `CATEGORY_CANONICAL` (`T\u00e9cnica`,
   `Improvisa\u00e7\u00e1on`). The category values are the DB's stored spelling (ADR-0012), so
   the DB's accented vocabulary is spelled in escapes, which is the one place this rule most
   obviously applies.
4. **The `fold` regex is written in escapes as a matter of necessity:**
   `s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')`. A raw combining-mark range in source
   would be an invisible character class; `\u0300-\u036f` names the codepoints it acts on.
5. **Components are deliberately outside the rule.** `src/components/SessionView.tsx` keeps raw
   U+2014 (null-stat placeholders, lines 138/143), U+2212 MINUS SIGN (the BPM button
   glyphs, lines 190/212) and U+00B7 (the `date * time` separator, line 347), and
   `ExerciseList.tsx:25` keeps a raw accented letter in a `console.error`. Those are
   language-independent typographic glyphs and a legacy log line (ADR-0011), not dictionary
   copy, and rewriting a U+2212 as an escape in a component would hide the fact that the glyph
   is the character being displayed.

## Alternatives considered

- **Raw UTF-8 in the dictionaries.** Rejected: it is the failure described above - the
  mangling happens *in* that representation, and `diff`/`grep` cannot show an invisible
  difference.
- **HTML entities (`&eacute;`).** Rejected: they are not JS string escapes, so they would
  render literally inside a value.
- **Normalize to NFD raw (base letter + combining mark).** Rejected: worse than the problem -
  an invisible zero-width-adjacent codepoint, and it would make the DB's `NFC` values
  mismatch without `fold`.
- **ASCII-folding the value away** (`Improvisacion` for the accented Spanish word). Rejected: it
  the DB and the user see; ADR-0012's `fold` exists only for *matching*, never for storage.
- **`\xNN` / `\u{...}` / `\u{2014}` forms.** Rejected: `\xNN` cannot express above 0xFF, and
  the plain four-digit `\uXXXX` covers every BMP character used here without brace syntax.
- **Applying the rule to components as well.** Rejected: see Decision item 5 - it would turn
  visible glyphs into unreadable escapes in exchange for nothing.

## Consequences

- Dictionary diffs are ASCII: a change to an accented word shows as a change of six ASCII
  bytes, which is reviewable, greppable, and survives any tool that mangles non-ASCII.
- The rule is a *storage* convention, so it cannot change a rendered string; a PT or ES screen
  shows accents normally. The cost is entirely in reading and writing the source.
- Escapes are not self-verifying. `Espa\u00fcl` (a `\u00fc` where `\u00f1` belongs) is a valid
  escape, valid syntax, and a wrong word: pure ASCII does not make the value correct. It only
  makes the wrongness addressable, which is what ADR-0015's defect list depends on.
- Grepping a dictionary for a word is now accent-insensitive-by-accident and exact-match-
  broken-by-design: searching `GuitarTrain -` will not find `\u2014`. The codepoint dump is the
  intended tool (see Verification).
- Two conventions coexist in the tree and the boundary must be remembered: ASCII-plus-escapes
  in `src/lib/i18n.ts` and `src/lib/locales/*.ts`, raw UTF-8 glyphs in `src/components/*.tsx`.
- Any hand-edit that retypes a value (ADR-0013 allows manual review edits) must re-escape by
  hand or through `esc()`; a raw accent typed into `pt.ts` breaks the rule silently, since
  nothing at build time enforces it.

## Verification

- Codepoint dump, not a rendered read. Current inventory (node over the file bytes):
  `src/lib/i18n.ts` - 0 raw non-ASCII, 7 escapes
  (`\u00e9`, `\u00f1`, `\u00e7`, `\u00e1`, `\u0300`, `\u036f`);
  `en.ts` and `pt.ts` - 0 raw non-ASCII, 3 escapes each (all `\u2014`);
  `es.ts` - 0 raw non-ASCII, 6 escapes (`\u00fc`, `\u00e9`, `\u00f3`, `\u2014`).
- Equivalent shell form: `grep -c '[^ -~]'` against each of the four files returns 0, i.e. no
  byte outside printable ASCII.
- Component counter-example is asserted on purpose: `src/components/SessionView.tsx` is
  *expected* to be non-ASCII (U+2014, U+2212, U+00B7), which is what keeps the rule scoped to
  the dictionaries.
- `npm run typecheck` and `npm run build` pass, so the escapes are valid JS; the build does not
  and cannot check that the escapes spell the right word.
