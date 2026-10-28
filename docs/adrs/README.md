# Decision records

Architecture Decision Records for the app in this workspace, `shredlog-project/shredlog`,
which ships under the brand `GuitarTrain` (`app_brand` in `src/lib/locales/*.ts`) and keeps
its data in the Supabase tables `exercises` and `practice_sessions`.

Each record states a decision, why it was taken, what was rejected, and the commands that
re-read its evidence. Argue changes against these, not against conversation memory. A
number never moves on its own: renumbering is a pass over the corpus and over every
`ADR-NNNN` comment in `src/lib` (ADR-0000).

## Index

| ID | Title | Status | Date |
| -- | ----- | ------ | ---- |
| [ADR-0000](./0000-record-decisions-as-adrs.md) | Record decisions as ADRs | Accepted (meta) | 2026-10-26 |
| [ADR-0001](./0001-keep-the-bolt-vite-react-typescript-starter.md) | Keep the Bolt Vite + React + TypeScript starter | Accepted | 2026-10-26 |
| [ADR-0002](./0002-single-tenant-no-auth-supabase-data-model.md) | One tenant, no auth, two Supabase tables | Accepted | 2026-10-26 |
| [ADR-0003](./0003-run-node-from-a-private-prefix-without-sudo.md) | Run Node from a private prefix, no sudo | Accepted | 2026-10-26 |
| [ADR-0004](./0004-bpm-controls-one-step-five-step-and-quick-nav-slider.md) | BPM controls: a one-step row and a five-step row | Accepted | 2026-10-26 |
| [ADR-0005](./0005-three-tension-levels-over-the-1-10-database-scale.md) | Three tension levels over the 1-10 scale | Accepted | 2026-10-26 |
| [ADR-0006](./0006-the-i18n-layer-fallback-and-what-may-be-translated.md) | The i18n engine, its fallback, the copy/data boundary | Accepted | 2026-10-26 |
| [ADR-0007](./0007-language-activation-detection-hook-toggle-and-metadata.md) | Language activation: chain, hook, toggle, metadata | Accepted | 2026-10-26 |
| [ADR-0008](./0008-three-locale-dictionaries-authored-reference-and-ascii-form.md) | The locale dictionaries and the ASCII form they use | Accepted | 2026-10-27 |
| [ADR-0009](./0009-testing-over-the-pure-src-lib-surface.md) | Testing over the pure `src/lib` surface | Accepted | 2026-10-27 |
