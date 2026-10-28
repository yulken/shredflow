# ADR-0009: Testing over the pure `src/lib` surface

- **Status:** Accepted
- **Date:** 2026-10-27

## Rule

1. Translated wording is asserted only against `en.ts`, the authored reference dictionary;
   for `pt` and `es` a test asserts structure only - which dictionary won, which key was read,
   whether a placeholder survived - and never grades a translation.
2. The suite covers the pure `src/lib` surface, one file per module under test in
   `src/lib/__tests__/`; components and hooks are out of reach because importing one builds a
   client at module load and writes `document`.
3. The runner is vitest 5 from a dedicated `vitest.config.ts`, invoked by `npm run test`, which
   re-declares the `@` alias because vitest reads that file instead of `vite.config.ts`.
4. The plural rule is scoped to the two families the app actually pluralizes - the `tp(` call
   sites `tp('sessions_count', ...)` in `src/components/ExerciseList.tsx` and
   `tp('history_count', ...)` in `src/components/SessionView.tsx`.
5. Derived arithmetic is under test only where it lives in `src/lib`: `bpmStep`, `tensionTier`,
   `tensionLabel`, `tensionColor`, `nextLanguage`. Side-effecting parts (`localStorage`, window
   location, `navigator.language`, `document.*`) stay out of scope.

## Decision

vitest 5 was chosen over 4 because 4 declares `vite` as a dependency that conflicts with the
pinned starter version, and 5 declares it only as a peer. Structure-not-wording is the rule
that makes the suite green across any rewrite of the provisional dictionaries (ADR-0008 rule
3); asserting wording would turn every human correction into a test edit. A browser-level
suite was rejected because it would need a server, a browser and a fixture account, and would
test ADR-0002's wiring rather than any decision.

## Verify

```
grep -c "from 'vitest/config'" vitest.config.ts   # -> 1
grep -c "'@': fileURLToPath" vitest.config.ts     # -> 1
grep -c '"test": "vitest run"' package.json       # -> 1
grep -rc "from '@/lib/" src/lib/__tests__ | awk -F: '{s+=$2} END {print s}'  # -> 7
npm run test    # -> all green
```
