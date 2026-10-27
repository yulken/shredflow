# ADR-0013: Locale dictionaries are produced by generators; only `en.ts` is hand-written

- **Status:** Accepted
- **Date:** 2026-10-26
- **Scope:** how `src/lib/locales/{pt,es}.ts` get their content
- **Code:** `src/lib/locales/en.ts` (hand-written reference), `/tmp/opencode/gen-pt.mjs`
  and `/tmp/opencode/pt-table.json` (PT generator + key-to-line table),
  `/tmp/opencode/gen-es.mjs` with `/tmp/opencode/es-cache.json`, `es-table.json`,
  `es-head.ts` (ES generator, cache, dry-run artifacts), `/tmp/opencode/check-locales.mjs`
  (parity checker)
- **Related:** ADR-0006 (the shape they emit), ADR-0007 (gaps are tolerated), ADR-0014
  (the escaping they apply), ADR-0015 (their output is interim)

## Context

Three dictionaries of 63 keys each must be filled, and two of them are not the working
language of the codebase. Typing 126 foreign strings is slow, and it is the one place
typing is known to fail: accented characters produced by the assistant drift (ADR-0014),
and a drifted accent is a user-visible defect the typechecker cannot see.

The Portuguese copy also already exists as history: the app shipped with Portuguese
literals in the components, and the i18n layer (ADR-0006) replaced each one with a
`t()` call. Retyping that copy into `pt.ts` would duplicate a source of truth and could
change wording silently. Spanish, by contrast, exists nowhere in the tree, and ADR-0006
ruled out shipping a translation framework at runtime.

## Decision

Hand-write `en.ts` only; generate everything else.

1. **`en.ts` is the spine.** Generators read it (`const enKeys = [...en.matchAll(/^ {4}(\w+):/gm)]`
   in `gen-pt.mjs`) and emit keys in `en`'s order, so key parity is structural, not
   aspirational.
2. **PT is harvested, not translated.** `pt-table.json` maps each key to a source location
   plus an extraction rule (`T12 q1` = `ThemeToggle.tsx` line 12, first quoted token);
   `gen-pt.mjs` reads the component files as they were *before* the i18n migration, pulls the
   Portuguese literal with a rule (`t` trimmed line, `g` `>text</span>`, `goal` with
   `{exercise.target_bpm}` re-keyed to `{bpm}`, `cnt` plural-tail, `qN` Nth quoted token),
   accent-folds it with the same `fold` as `i18n.ts`, and writes it. Keys the table cannot
   reach are overridden literally in the script (tension labels, the `{count}` plural form,
   `page_title`, the four BPM button labels).
3. **ES is machine-translated from EN**, not typed: `gen-es.mjs` calls the free Google
   `translate_a/single?client=gtx&sl=en&tl=es` endpoint, batches 4 texts per request with a
   700 ms gap, and retries with backoff (`tr()` sleeps `1500 * attempt`) because the endpoint
   intermittently returns 429. Results are cached in `es-cache.json` after every success, so a
   rerun is cheap and stable.
4. **Three override layers decide ES wording**, highest wins: `LITERAL` (final hand-set
   Spanish or EN-verbatim, e.g. `app_brand`, `bpm_unit`) beats `BETTER_EN` (a disambiguated
   English source fed to the translator instead of the ambiguous one - "Save" as a verb,
   "Record BPM", "Study" as a drill) beats the raw `en.ts` value. Categories come from
   `CAT_LITERAL`, a positional Spanish list mapped 1:1 onto `CATEGORY_CANONICAL` (ADR-0012).
5. **Placeholders are masked, not sent.** `{count}` becomes `~1~` before the request and is
   restored after, so a translator cannot reformat or drop it (`postmask` re-expands it).
   `fixPunct` keeps em dashes and ellipses from the source no matter what the translator did
   to them.
6. **Both generators are two-mode.** `gen-es.mjs` without flags prints an EN -> ES table for
   review; `--write` emits the file. `gen-pt.mjs` prints `EN-ONLY:`, `PT-EXTRA:` and
   `MISSING:` diagnostics plus the canonical category list, which is where ADR-0012's list
   came from.

## Alternatives considered

- **Hand-typing PT/ES values into the editor.** Rejected: accent drift (ADR-0014), and for
  PT it would fork wording that already exists in the components.
- **Machine-translating PT -> ES instead of EN -> ES.** Rejected: an `es -> es` pass does not
  restore accents, and PT-derived ambiguity tracks the wrong source; EN is the reference
  dictionary and `BETTER_EN` fixes its ambiguity explicitly.
- **A committed translation step in the build** (a script in `src/` run by `npm run build`).
  Rejected: translation is a one-time authoring act, not a build invariant, and a build that
  needs a network call cannot be trusted to reproduce `dist/`.
- **A translation library or corpus at authoring time** (`argot`, a local model, DeepL API).
  Rejected: nothing installed offline in this environment, and the free endpoint was already
  reachable; the cache file is what makes that acceptable for iteration.
- **Committing the generators to the repo.** Deferred, not rejected: they are scratch tooling
  under `/tmp/opencode/`, addressed by line numbers into files that are about to change, so
  committing them now would commit tooling that stops working at the next edit. Recorded here
  so the next person knows they exist and where.
- **Editing `pt.ts`/`es.ts` in place after generation.** Allowed for review, but only as
  knowledge: a rerun overwrites manual edits. That is why the override layers (`LITERAL`,
  `BETTER_EN`) exist inside the script instead.

## Consequences

- Adding a key to the app means adding it to `en.ts` and re-running the generators; the
  generators' diagnostics (`EN-ONLY`, `MISSING`) name the gap instead of leaving it to the
  runtime warning of ADR-0007.
- Dictionary content is reproducible only while the generator's inputs still exist. `gen-pt.mjs`
  reads *pre-migration* component sources and `pt-table.json` addresses them by line number, so
  it is already stale for the migrated tree, and the components are uncommitted (ADR-0002/ADR-0015's
  tree state). Regenerating PT from scratch now means reading the `initial commit` copies.
- Machine output is authoritative-but-unreviewed. ADR-0015 carries the defect list for exactly
  this reason; the generators make translation gaps *cheap to produce* and therefore cheap to
  ship by accident.
- The cache pins wording across runs, so a re-run cannot silently re-translate a string that was
  already reviewed. Deleting `es-cache.json` is how a string gets re-asked.
- `LITERAL`/`BETTER_EN`/`CAT_LITERAL` are the review surface. A vetted Spanish improvement is
  an edit to those maps, not an edit to `es.ts`.

## Verification

- `node /tmp/opencode/gen-es.mjs` (no `--write`) prints the EN -> ES table, including the
  `CAT_LITERAL` pairs, without touching the tree; `--write` is the only path that writes
  `src/lib/locales/es.ts`.
- `/tmp/opencode/check-locales.mjs` reports 63 string keys in each of `en`, `pt`, `es`, 63 used
  in components, and zero missing in either direction, so every generated dictionary is key-complete.
- `npm run typecheck` and `npm run build` pass with generated files in place, which is the
  only guarantee generation buys: shape, not wording (ADR-0015 is the rest).
