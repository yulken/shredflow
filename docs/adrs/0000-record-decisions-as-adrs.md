# ADR-0000: Record design decisions as ADRs under `docs/adrs/`

- **Status:** Accepted (meta)
- **Date:** 2026-10-27
- **Scope:** documentation of this project

## Context

The project accumulated a lot of decisions across several sittings: an environment
workaround (Node installed in a private prefix), a data model, a UI rework of the
session screen, and a whole i18n layer with generated dictionaries. All of that
knowledge lived only in chat history, which is not inspectable by the next person
and not stable across model sessions. Several of the decisions are non-obvious from
the code alone (why the default language is English, why category buttons submit
Portuguese values, why the locale files contain `\u00e9` instead of `é`).

## Decision

Write one ADR per decision under `docs/adrs/`, numbered `NNNN-kebab-title.md`,
prefixed by an `README.md` index that links them and records the current tree state.

Each ADR follows a fixed shape:

- a header with **Status**, **Date**, **Scope**, **Code** and **Related** records;
- `## Context` - the forces and constraints that made the decision necessary;
- `## Decision` - what was actually chosen, precise enough to be checkable;
- `## Alternatives considered` - what was rejected and why;
- `## Consequences` - what the decision makes easy, hard, or fragile;
- `## Verification` - how it was checked, where a check exists.

Statuses are `Accepted`, `Provisional`, `Superseded` (see README). A record is
never edited to describe a new decision; a new record supersedes it and both
headers link to each other.

## Alternatives considered

- **A single `NOTES.md` narrative.** Rejected: it would not separate decisions that
  interact, and it cannot be cited one decision at a time.
- **No records at all.** Rejected: the reason the DB stores accented Portuguese
  category values while the UI shows `Technique` is invisible in the code.
- **ADRs at the repository root or in `docs/decisions/`.** The location
  `docs/adrs/` was named explicitly by the request; keeping it stable means later
  records land in the same place.

## Consequences

- Every decision in this project is now arguable in writing, and the index doubles
  as a map of the codebase.
- Records can go stale: they carry dates and a "state of the tree" section, so a
  reader knows which ones were written against which commit.
- Writing them after the fact means the recorded rationale is partly reconstructed;
  where a rationale is inferred rather than remembered, the record says so.
