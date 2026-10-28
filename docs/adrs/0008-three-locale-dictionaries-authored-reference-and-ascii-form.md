# ADR-0008: Three locale dictionaries, one authored reference, pure ASCII sources

- **Status:** Accepted
- **Date:** 2026-10-27

## Rule

1. There are three dictionary modules, `src/lib/locales/en.ts`, `src/lib/locales/pt.ts`
   and `src/lib/locales/es.ts`, and each exports one `Locale` object.
2. They carry the same key set. `en.ts` is the authored reference that defines it: a new
   piece of copy is added to `en.ts` first and only then given to the other two.
3. The content of `pt.ts` and `es.ts` is provisional bootstrap content. It is expected to
   be replaced by a later record that carries reviewed language, and nothing in the tree
   asserts their wording - ADR-0009 is what keeps that true.
4. Locale sources are pure ASCII. Every non-ASCII character in a value is written as a
   `\uXXXX` escape.

## Decision

English is the reference language for the keys, not Portuguese, because ADR-0007 made
English the default and ADR-0006 made it the fallback: a key with no English string has
nothing to fall back to.

Escaping every non-ASCII byte was chosen over writing raw accented text because a mangled
raw byte is invisible both in a diff and when the file is re-read, so "open the file and
confirm the accent" is not a check that exists. An escape survives every tool that touches
the file and is countable. Patching a generated file by hand was rejected as an edit the
next generation would erase. Accent-insensitive Portuguese is accepted as an interim
concession only because `fold()` makes the UI tolerate the folded form.

## Verify

```
grep -c 'export const EN' src/lib/locales/en.ts   # -> 1
grep -Pc '[^\x20-\x7e]' src/lib/locales/*.ts src/lib/i18n.ts | grep -vc ':0$'   # -> 0
for l in en pt es; do grep -o '^    [a-zA-Z_]*:' src/lib/locales/$l.ts; done | sort | uniq -c | awk '$1 != 3'
```
