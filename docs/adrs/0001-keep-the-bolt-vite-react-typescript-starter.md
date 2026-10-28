# ADR-0001: Keep the Bolt starter as the base stack

- **Status:** Accepted
- **Date:** 2026-10-26

## Rule

1. The app is Vite + React + TypeScript as the template shipped it: React 18 with
   `useState` and `useEffect` only, and no added state or routing library.
2. UI code follows the starter's house rules: styling in Tailwind classes, icons from
   `lucide-react`, and imports through the `@/` alias.
3. No new UI dependency is introduced to serve a feature.

## Decision

Do not fork the stack. Build features on the template `bolt-vite-react-ts` as shipped,
so the only build system to reason about is the one the project was created from. What
was rejected - replacing the starter, or adding a component/state framework - buys
nothing here and would put every later decision behind two stacks.

## Verify

```
grep -rc "from '@/" src | awk -F: '{s+=$2} END {print s}'   # -> 24 alias imports
grep -rlc 'from .lucide-react.' src | grep -v ':0' | wc -l  # -> 5 icon importers
grep -rc '\(useStore\|useContext\|Recoil\|useRouter(\)' src | grep -vc ':0$'   # -> 0
```
