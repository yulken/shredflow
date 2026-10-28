# ADR-0003: Run Node from a private prefix in the user's home, without sudo

- **Status:** Accepted
- **Date:** 2026-10-26

## Rule

1. The toolchain lives in a private prefix under the user's home, on `PATH`, and
   nothing in this project is run through `sudo`.
2. Verification of the app is the pair the starter ships: `typecheck` and `build`.

## Decision

Unpack the Node release into `~/.local/node` and append its `bin` to `PATH` in
`~/.zshrc`. Sudo was rejected outright: installing to a system prefix would have
made the machine's toolchain part of the project's setup, unreviewable from the
repo, and the app could not be rebuilt by anyone else. The cost of the private
prefix is that one-off, non-interactive commands must re-declare the `PATH` line
rather than assume a login shell, which is why that line is quoted here.

## Verify

```
grep -c sudo package.json   # -> 0
grep -c '"typecheck":' package.json   # -> 1
npm run typecheck && npm run build    # -> both green, the starter's pair
```
