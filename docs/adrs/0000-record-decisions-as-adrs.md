# ADR-0000: Record decisions as ADRs

- **Status:** Accepted
- **Date:** 2026-10-26, amended 2026-10-27

## Rule

A record is a decision, its reasons, and the commands that re-read its evidence.

1. Every record lives in `docs/adrs/`, one four-digit number per record, and the body is
   exactly `## Rule` (the invariant), `## Decision` (the choice, and what was rejected)
   and `## Verify` (the commands).
2. The `## Index` in `docs/adrs/README.md` holds one row per record in the tree, and each
   row names a record that is in the tree.
3. A record cites another by number and never restates it; a comment in `src/lib` that
   names `ADR-NNNN` resolves to a record in the tree.

## Decision

Renumbering is a pass over the whole corpus, not an append: the records are renumbered to
`0000`-`0009`, and the same pass rewrites every `ADR-NNNN` comment in `src/lib` so that no
number names a record that is not in the tree. Numbers are never reused while the records
citing that number exist, which is what lets a pass move a number at all.

Records state decisions, not the tree: a record may name a file and a symbol, never a line
number, a count of files or a claim that can be measured, because those age on the next
change and the record does not.

## Verify

```
grep -c '^## [A-Z]' docs/adrs/00*.md | grep -vc ':0$'   # -> 10, one record each
grep -c '^###' docs/adrs/00*.md | grep -vc ':0$'        # -> 0
awk 'FNR > 40 { print FILENAME; exit }' docs/adrs/00*.md   # -> nothing
grep -c '^| \[ADR-' docs/adrs/README.md                 # -> 10 rows
grep -ro 'ADR-[0-9][0-9][0-9][0-9]' src | sed 's/.*ADR-//;s/[^0-9].*//' | sort -u | while read -r n; do grep -q "^# ADR-$n" docs/adrs/$n*.md; done   # -> no failures
grep -rl 'line [0-9]' docs/adrs | wc -l                 # -> 0
```
