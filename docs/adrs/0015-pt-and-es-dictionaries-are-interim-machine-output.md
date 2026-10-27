# ADR-0015: PT and ES dictionaries are interim machine output, not reviewed language

- **Status:** Provisional
- **Date:** 2026-10-26
- **Scope:** the *content* of `src/lib/locales/pt.ts` and `src/lib/locales/es.ts`
- **Code:** `src/lib/locales/pt.ts`, `src/lib/locales/es.ts`; generation per ADR-0013,
  encoding per ADR-0014; `en.ts` is excluded (hand-written and reviewed)
- **Related:** ADR-0013 (they are generated), ADR-0007 (a gap degrades to EN instead of failing),
  ADR-0012 (`categories` arrays are part of this interim output), ADR-0005 (PT/ES tension
  labels)

## Context

The requirement is a working PT/EN/ES app, not a reviewed translation product, and the
dictionaries are produced by machine (ADR-0013). Shipping the app therefore does not require
the language to be correct - it requires the language to be *known to be provisional*,
because the alternative is a user silently seeing broken Portuguese and a mostly-English
Spanish screen. The two failure modes are already visible in the tree: `es.ts` is
predominantly English, and `pt.ts` has no accents at all.

Accents in particular are an explicit interim concession: the request accepted
accent-insensitive Portuguese for now, and ADR-0012's `fold()` makes the UI tolerate that
folded form - which is precisely why a folded dictionary renders at all.

## Decision

Accept both dictionaries as interim output, and record the defects instead of fixing them
by hand. Status `Provisional`: the decision in force is "generate, ship, review later"; a
human-vetted dictionary replaces this record as a new ADR.

## Known defects at time of writing

These were read back out of the file bytes (codepoint dumps, see Verification), not from
rendered text, which in this environment renders the same Spanish word differently each time.

`src/lib/locales/es.ts` (stale partial mirror - the current generator output was not written):

- **54 of 63 string values are byte-identical to `en.ts`.** Only 9 differ
  (`theme_light`, `theme_dark`, `confirm_delete_exercise`, `placeholder_title`,
  `placeholder_bpm`, `bpm_minus_one`, `bpm_plus_one`, `bpm_minus_five`, `bpm_plus_five`),
  so the ES screen is English chrome except in those nine places.
- `nativeName: 'Espa\u00fcl'` - `\u00fc` where `\u00f1` belongs, i.e. "Espaul" instead of
  "Espa\u00f1ol". The escape is well-formed (ADR-0014) but the codepoint is wrong.
- `categories` is mixed: `T\u00e9cnica`, `Speed`, `Warm-up`, `Chords`, `Escalas`,
  `Improvisaci\u00f3n`, `Ritmo`, `Study` - three of eight are EN fallbacks (`Speed`,
  `Warm-up`, `Study`), while `CAT_LITERAL` in the generator asks for
  `Calentamiento`/`Chords`/`Etude`, so the file predates the current generator.
- `page_title` equals the EN value, so the ES tab title is English (ADR-0010).

`src/lib/locales/pt.ts` (generated from pre-migration component sources, accent-folded):

- **No accents anywhere, by construction.** `fold()` (ADR-0012) is applied to every harvested
  value, so the file says `exercicio`, `treinos` and `Gerencie` where a reviewed PT copy would
  keep the accents. The request accepted that folded spelling, and ADR-0014's escaping rule
  preserves what the harvest produced without restoring it.
- `nativeName: 'Portugus'` - not folded-but-correct; the word lost its final accented
  letter entirely (raw bytes are `P`,`o`,`r`,`t`,`u`,`g`,`u`,`s`).
- `no_exercises_title: 'Nenhum exercicio ainda'` - "Nenhum" is not Portuguese; the EN source
  was `No exercises yet`.
- `no_exercises_text: 'Crie seu primeiro exercicio para comecar a registrar treinos.'` -
  `comecar` for `comencar`, and `treinos` for "training sessions" in place of
  "practice sessions".
- `exercises_subtitle` begins `Gerencie`, a truncation of the intended verb form.
- `tension_medium: 'Moderada'` against PT tension labels `Low`/`Moderada`/`High` (ADR-0005) -
  reviewable as a word choice, unreviewed as a decision.

Structural contradiction to settle before ES ships:

- `LITERAL` in `gen-es.mjs` pins `tension_low`/`tension_medium`/`tension_high` to
  `Low`/`Medium`/`High` (English) and `stat_record_bpm`/`stat_avg_bpm`/`history_title`/
  `record_badge`/`save_button`/`saving`/`tooltip_delete`/`exercises_title` to their EN
  wording, while the same generator's `BETTER_EN` layer exists to feed *better English* to
  the translator and machine output had proposed `Bajo`/`Medio`/`Alto` for the tiers. So the
  ES tier labels are currently EN by override, not by vetted Spanish - the override list was
  written to stop the machine from producing worse words (`Ceremonias`, `Grabar BPM`,
  `Ahorro...`), and stopping at English is a half-measure, not a decision about Spanish.
  `guardar` (save, in the computing sense) is the pending candidate for `save_button`.

## Consequences

- The app runs and switches language in all three locales, but ES is English chrome and PT is
  accentless. Neither is a bug to fix in a component; both are dictionary content.
- Reviewing means editing `LITERAL`, `BETTER_EN` and `CAT_LITERAL` in the generator (ADR-0013)
  and re-running with `--write`, not editing `pt.ts` or `es.ts` - a rerun overwrites manual
  edits.
- `en.ts` is load-bearing as the only reviewed copy: where a non-EN dictionary is wrong, the
  EN fallback (ADR-0007) and the value here can differ, and only the dump shows which.
- Because `fold()` (ADR-0012) hides accent differences, an unaccented PT dictionary cannot
  break category matching, and also cannot *demonstrate* that accents work. Accent restoration
  remains unverified by the running app.
- `Provisional` is the only status in this set that does not mean "in force and final". A
  record that supersedes this one must state what was reviewed, by whom, and which of the
  defects above it closes.

## Verification

- Key parity is not at issue: `/tmp/opencode/check-locales.mjs` reports 63 string keys in
  each of `en`, `pt`, `es`, 63 used by components, zero missing in either direction.
  This record is about values, not keys.
- Byte-level checks (node, over file contents): count values where `es[k] === en[k]` ->
  54; dump `nativeName` lines of `pt.ts` (line 3) and `es.ts` (line 3) for their exact codepoints;
  dump `es.ts`'s `categories` block; confirm all four files are ASCII with the escape inventory
  of ADR-0014.
- `npm run typecheck` and `npm run build` pass, which is the point: nothing in the toolchain
  can mark these dictionaries as provisional, so the status lives in this record and in the
  README's open-items section.
