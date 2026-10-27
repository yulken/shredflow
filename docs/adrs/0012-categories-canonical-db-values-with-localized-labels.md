# ADR-0012: Categories - canonical DB values (Portuguese) with index-matched localized labels

- **Status:** Accepted
- **Date:** 2026-10-26
- **Scope:** the `exercises.category` column and how its values are shown and chosen
- **Code:** `src/lib/i18n.ts` (`CATEGORY_CANONICAL` line 74, `fold` line 76,
  `categoryLabel` lines 78-85, `categoryValue` lines 87-93), `categories[]` metadata in
  `src/lib/locales/{en,pt,es}.ts` (line 8 of each), picker at `src/components/ExerciseList.tsx:277-291`
  and badge at `:149`, `supabase/migrations/20261026230024_create_guitar_practice_tables.sql`
- **Related:** ADR-0002 (`category text`, free-form, no `CHECK`), ADR-0011 (values are
  data, not copy - labels are the one exception), ADR-0014 (the escapes in the canonical list)

## Context

The starter's category buttons wrote literal Portuguese words into `exercises.category`, a
free-form `category text` column with no constraint
(`category text,` at line 35 of the migration; the header comment even names the values:
`Tecnica`, `Velocidade`, `Aquecimento` - shown here with accents folded, the file carries
them). Existing rows therefore hold accented Portuguese text,
typed by the app's own UI before the i18n layer existed.

Localizing that column naively breaks in two directions. If the buttons submitted the
*display* string, then a user who switched to EN would save `Technique` while older rows say
`T\u00e9cnica`: the same category becomes two values, and any list grouping, filter or count
over `category` splits. If the display side printed the stored value, then a Portuguese
column is shown to an English user, and the PT-only spelling is visible in every language.

Neither the schema nor the already-stored rows can be treated as disposable: ADR-0002 fixed
the shape, and the rows are the user's own practice history.

## Decision

Two lists, one positional relationship, and the DB keeps the Portuguese spelling.

1. **Canonical values live in the engine, not in the locale files:**

   ```ts
   export const CATEGORY_CANONICAL =
     ['T\u00e9cnica', 'Velocidade', 'Aquecimento', 'Acordes', 'Escalas',
      'Improvisa\u00e7\u00e1on', 'Ritmo', 'Estudo'];
   ```

   These are exactly the strings that are compared against, and written into,
   `exercises.category`. They are the DB's vocabulary, so they belong to the app, not to a
   language: the same list is used whichever language is active.
2. **Display labels live in each locale as a `categories` array of the same length, same
   order.** `en.ts` line 8:
   `['Technique', 'Speed', 'Warm-up', 'Chords', 'Scales', 'Improvisation', 'Rhythm', 'Study']`.
   Index `i` of `CATEGORY_CANONICAL` is index `i` of every locale's `categories`.
3. **The picker shows the label and submits the canonical value**
   (`ExerciseList.tsx:277`):

   ```ts
   categories().map((label, i) => {
     const canonical = CATEGORY_CANONICAL[i];
     ... onClick={() => setCategory(category === canonical ? '' : canonical)}
     ... {label}
   ```

   Selection state is tracked in canonical terms (`category === canonical`), so toggling a
   button off works whichever label is rendered, and the value that reaches the DB never
   depends on the active language.
4. **Reading a stored row goes the other way:** `categoryLabel(exercise.category)` at
   `ExerciseList.tsx:149` maps the stored value to the active locale's label by finding its
   index in `CATEGORY_CANONICAL` and returning `list[i] ?? canonical`.
5. **Matching a stored value to a canonical entry is accent- and form-insensitive.**
   `const fold = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')` and the
   comparison is `fold(CATEGORY_CANONICAL[i]) === fold(canonical)`. `NFD` normalization plus
   stripping combining marks means `T\u00e9cnica` in composed or decomposed form, and an
   ASCII-folded `Technica`, all land on the same entry. `categoryValue(label)` is the mirror
   function (label -> canonical), exported for the same reason.
6. **Eight categories, fixed order.** The set is closed and app-owned; nothing in the UI can
   produce a ninth value (the free-text field for a category does not exist - the picker is
   buttons only).

## Alternatives considered

- **Submit the localized label.** Rejected: it fragments `exercises.category` by language
  (above), and the row's category would stop being comparable across sessions saved in
  different languages.
- **Migrate existing rows to a language-neutral value** (`technique`, or an integer code)
  and stop storing words. Rejected: it rewrites the user's own data, needs a new migration
  on a column ADR-0002 already settled, and the free-form `text` column has nothing enforcing
  the new code set anyway.
- **One shared set of category keys** (`t('cat_technique')`) with the DB storing keys. Rejected:
  the DB already stores human text, and a key in `category` would render as `cat_technique`
  for every row created before the change.
- **Per-locale canonical lists** (PT locale submits PT, EN locale submits EN). Rejected: it is
  the submit-the-label failure in another form - the DB ends up holding a per-dialect value
  for the same concept.
- **Translate the stored value at display time with a machine translator.** Rejected: ADR-0011's
  rule that data is never translated, plus a per-render network call.
- **Exact-string matching, no folding.** Rejected: rows written by other means (a hand-entered
  value, a paste, a database edit) vary by accent and by `NFC`/`NFD` form; without folding,
  such a row shows its raw PT spelling instead of the localized label, which is the defect
  the `categoryLabel` indirection exists to avoid.
- **Matching label to canonical by translated content** (compare `Improvisation` to
  `Improvisa\u00e7\u00e1on` linguistically). Rejected: those two are not related by any
  computable rule - `Improvisation` (EN) and `Improvisa\u00e7\u00e1on` (PT) differ by more than
  accents. Positional coupling is the only relation that holds.
- **Using `categoryValue` on submit.** Not used today: the picker already holds the canonical
  value, so the reverse mapping has no caller in the components. It is exported for the day a
  label arrives from somewhere other than `categories()[i]` (e.g. typed input).

## Consequences

- Existing rows keep rendering correctly in a new language, and new rows are written in the
  same vocabulary old rows used. This is the whole point of the split, and it is why
  switching language never splits a list.
- The DB's category spelling is Portuguese while all three UIs may show something else. Reading
  the column in a database tool shows PT words; that is intentional and is the one visible
  place where ADR-0011's "data is not copy" rule shows up as a *choice of language*.
- The positional contract is unstated in types (`string[]` vs `string[]`): adding, removing or
  reordering a category means editing `CATEGORY_CANONICAL` and all three `categories` arrays
  in lockstep, or a label starts pointing at the wrong value. Nothing at compile time catches
  a desync, so this is the highest-cost maintenance rule in the layer.
- A `category` value outside the canonical set (typed elsewhere, or a legacy typo) displays
  verbatim - `return canonical` - and cannot be chosen in the picker. Display is total;
  selection is closed.
- `categoryLabel` and `categoryValue` depend on the active language, so their results are not
  stable across a toggle even though their arguments are. Anything that persists a label
  instead of a canonical value would corrupt the column; the picker's design (state kept in
  canonical terms) is what keeps that from happening today.
- `fold()` is not applied as a *normalization* of what gets stored: canonical strings are
  written exactly as in `CATEGORY_CANONICAL`, so the DB keeps one exact spelling and matching
  does the tolerance. That keeps storage deterministic at the price of the fold being load-
  bearing in both directions.
- `es.ts`'s `categories` array is currently the English list (ADR-0015), so ES shows EN labels.
  Fixing that is a generator change (ADR-0013), not a change to this record.

## Verification

- Both lists have the same length: `grep -c` over `CATEGORY_CANONICAL` and each locale's
  `categories` line gives 8 entries each (`en.ts`/`pt.ts`/`es.ts` line 8,
  `i18n.ts` line 74).
- The canonical list's exact bytes are asserted by a codepoint dump, not by reading it rendered:
  dump `CATEGORY_CANONICAL` and confirm the only non-ASCII is `\u00e9` in `T\u00e9cnica` and
  `\u00e7`/`\u00e1` in `Improvisa\u00e7\u00e1on`.
- `grep -n "categories().map\|CATEGORY_CANONICAL\[i\]\|categoryLabel(" src/components/ExerciseList.tsx`
  returns 277, 278 and 149 - the submit path and the display path.
- The column is unchanged: `grep -n "category" supabase/migrations/20261026230024_create_guitar_practice_tables.sql`
  still shows `category text,` with no `CHECK`, i.e. no migration was added for this decision.
- `npm run build` and `npm run typecheck` pass with the picker in place.
