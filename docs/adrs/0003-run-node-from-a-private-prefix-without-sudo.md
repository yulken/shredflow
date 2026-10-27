# ADR-0003: Run Node from a private prefix (`~/.local/node`) without sudo

- **Status:** Accepted
- **Date:** 2026-10-26
- **Scope:** development environment for this workspace
- **Code:** `~/.local/node` (Node 22.23.4 with npm 10.9.9 bundled),
  `~/.zshrc` line `export PATH="$HOME/.local/node/bin:$PATH"`
- **Related:** ADR-0001 (stack), ADR-0013 (locale generators)

## Context

The project had to be made runnable, and `npm install` plus `vite build` need a
Node runtime on this machine. No system Node was available, and installing one
meant writing to system paths, which requires sudo. Sudo was not used anywhere in
this project: it is the least invasive way to get a toolchain, and it keeps the
change inside the user's own home directory.

## Decision

Install the Node 22.23.4 release into a private prefix and put it on `PATH`:

- Unpack the release into `~/.local/node` (it ships npm 10.9.9 bundled inside its
  `bin/`, so no separate npm install is needed).
- Append `export PATH="$HOME/.local/node/bin:$PATH"` to `~/.zshrc` so interactive
  shells pick it up.
- For non-interactive or one-off commands, prefix the command with
  `export PATH="$HOME/.local/node/bin:$PATH"` instead of assuming the login shell
  was loaded.
- Then `npm install` in the workspace (285 packages installed, which resolved the
  starter's pinned dependencies) and `npm run build` / `npm run typecheck` as the
  verification pair.

## Alternatives considered

- **sudo package-manager install of Node.** Rejected: unnecessary privilege,
  system-wide state change, and it conflicts with the "no sudo in this project"
  constraint the work operates under.
- **A version manager (`nvm`) or `corepack`/`pnpm`.** Rejected: extra indirection
  for a one-time need, and both would still have to be installed from somewhere.
- **Download Node's binary alone (without npm) and install npm separately.**
  Rejected: the release tarball already bundles npm, so this is only duplicated
  work.

## Consequences

- Every tool invocation in this workspace is a function of `~/.local/node`: a
  different machine, a CI container, or a shell that skipped `.zshrc`, must set the
  same `PATH` or the commands fail.
- Scripts under `/tmp/opencode` (the locale generators, ADR-0013) run against this
  same Node, so they use modern JS only (`.mjs`, `fetch`, `node:` imports) - nothing
  that assumes an older runtime.
- A private prefix is not on any security or packaging boundary: nothing about the
  app build depends on it. Only the developer machine does.
- `node_modules/` and `package-lock.json` are the artifact of `npm install`; the
  runtime itself is not vendored into the repository.

## Verification

```sh
node -v          # v22.23.4
npm -v           # 10.9.9
grep -n 'local/node' ~/.zshrc
```
