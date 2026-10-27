# ADR-0001: Keep the Bolt Vite + React + TypeScript starter as the base stack

- **Status:** Accepted
- **Date:** 2026-10-26
- **Scope:** project foundation, tooling, styling conventions
- **Code:** `package.json`, `vite.config.ts`, `tsconfig.*`, `tailwind.config.js`,
  `src/index.css`, `eslint.config.js`, `.bolt/config.json`, `.bolt/prompt`
- **Related:** ADR-0002 (data model), ADR-0006 (i18n layer)

## Context

The project was created from the Bolt template `bolt-vite-react-ts`
(recorded in `.bolt/config.json`) and already carries a `.bolt/prompt` that fixes
house rules: Tailwind classes, React hooks, `lucide-react` icons, no extra UI
packages, and `@/` import aliases. The starter pins Vite 7.3.7, React 18.3.1,
TypeScript 5.5.3, Tailwind 3.4.1, `@supabase/supabase-js` 2.57.4, an `@` to
`src/` path alias, and scripts `dev`, `build`, `lint`, `preview`, `typecheck`.

Every later feature (session screen, i18n layer) had to be expressed in that shape.

## Decision

Do not change the stack. Build on the starter as shipped:

- React 18 without a state library beyond `useState`/`useEffect`; app-level state
  is passed down from `App.tsx` (for example `selectedExercise` decides whether the
  app shows `SessionView` or `ExerciseList`).
- Behavior that has to run outside React stays in plain modules plus tiny hook
  helpers (`src/hooks/useTheme.ts`, `src/hooks/useLanguage.ts`), never in a
  component's render pass.
- Styling is Tailwind utilities inline on elements, with `darkMode: 'class'`
  (the `dark:` variants are driven by a `dark` class on `<html>`, not by a media
  query) and two custom palettes: `brand` (red, `#f04438` at 500) and
  `accent` (green). Class names use the starter's utility style (`mb-6`,
  `rounded-xl`, `h-4`), and the shared surfaces are the `.card` and `.glass`
  component classes in
  `src/index.css`.
- Icons come only from `lucide-react`; no other UI/theme packages are installed.
- Project-internal imports use the `@/` alias (`@/lib/i18n`, `@/components/Foo`).

## Alternatives considered

- **Introducing a component/state framework or a UI kit.** Rejected: it fights the
  `.bolt/prompt` rule and rewrites a tree that already works.
- **Switching dark mode to Tailwind's media-query variant.** Rejected: the app
  toggles theme at runtime and persists it, so it needs the `dark` class hook
  that `useTheme` already manipulates.
- **Rewriting the class lists to a different utility naming scheme.** Rejected:
  `mb-6`, `rounded-xl`, `h-4` and the `dark:` variants are already what Tailwind 3.4
  generates from this config, so a rewrite is churn across every file for no gain.

## Consequences

- The tree keeps one coherent style, so new files (for example
  `src/components/LanguageToggle.tsx`) are reviewable against its neighbours.
- The `@/` alias matters outside the app code too: any future build or tooling
  change must keep Vite's alias resolution for it.
- The starter's dependency list is the reason "make it run" work was needed at the
  environment level (see ADR-0003) rather than at the framework level.
- `dist/` is a git-ignored build artifact; `eslint.config.js` ignores it too.
