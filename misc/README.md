# Miscellaneous helper scripts

This folder contains small helper scripts used during development and local setup. It's also where we keep the utilities used to make the native `node-pty` addon robust across packaging and installs.

## Files

- **patch-node-pty-helperpath.js** — idempotent repo patcher that finds vendor copies of `node-pty` (source and compiled JS/TS copies under `packages/server/node_modules`, `packages/electron/dist`, and the packaged `app.asar.unpacked` tree) and updates the unixTerminal helper path resolution to:

  - deterministically prefer `process.resourcesPath` and `<resources>/app.asar.unpacked` locations,
  - collapse duplicate `.unpacked` segments (defensive normalization),
  - optionally repair naive `app.asar` -> `app.asar.unpacked` string-replace patterns via `--fix-replace-patterns`.

  The patcher is safe to run multiple times (idempotent) and prints a concise summary (`patched` / `checked`). It is integrated into the build pipeline (see `packages/electron/build.js`) and is recommended to run during CI packaging steps.

- **prebuild-node-pty.js** — prepares a local Python virtualenv / distutils shim and attempts to build or fetch an ABI-matching `pty.node`. Useful when a host doesn't provide a usable `distutils` or when you want a reproducible local build cache (`.node-pty-cache`). Use the `--apply-fixes`/`--auto-env` flags for conservative automatic help.

- **prepare-node-pty.js** — runtime helper used by the server to restore a cached `pty.node` from `.node-pty-cache` into `packages/server/node_modules/node-pty/build/Release` if present; otherwise it triggers a rebuild and caches the result.

- **instrument-node-pty.js** — an on-demand diagnostic helper that can add extra native-level logging to `node-pty` (posix_spawn argv/errno tracing). This is intended for debugging only and should be gated behind an env var when used.

- **create-corrupt-zip.js** — creates a corrupt zip archive to verify the Archive Integrity feature.
- **starter.js** — an interactive menu used by `start.*` scripts and the `postinstall` runner.

## Usage & examples

Run the idempotent patcher (recommended during development and CI packaging):

```bash
# quick check (dry-run style — the script prints what it found and whether each file is already patched)
node misc/patch-node-pty-helperpath.js

# run prepack mode (tells the script to also scan packager output and app.asar.unpacked locations)
node misc/patch-node-pty-helperpath.js --prepack

# run with the conservative repair mode to fix naive string-replace patterns introduced by packaging steps
node misc/patch-node-pty-helperpath.js --prepack --fix-replace-patterns
```

Run the prebuild helper if npm install reported problems building `node-pty`:

```bash
node misc/prebuild-node-pty.js --apply-fixes --yes --auto-env
```

Run the runtime preparer (server starts) to attempt to restore a cached `pty.node`:

```bash
node misc/prepare-node-pty.js
```

If you need to gather low-level diagnostics (posix_spawn failures), run the instrumentation helper and enable it when reproducing the failing packaged run (only use for debugging; it's noisy):

```bash
# print extra native spawn tracing to console. Gate this behind an env var in CI or when debugging locally.
NODE_PTY_INSTRUMENT=1 node misc/instrument-node-pty.js --target packages/server
```

## Build and packaging notes

- The repository integrates the patcher into `packages/electron/build.js` so a packaging run will attempt to patch vendor copies before the asar is created. This helps avoid baked-in double `.unpacked` segments.
- The patcher intentionally modifies both source and compiled copies (TS & JS) because many packaging pipelines copy or transpile vendor code. The script is idempotent and logs a summary so CI can assert `patched=0` or a small number of expected edits.

## Safety and rollback

- The patcher is conservative. It writes backups for files it modifies and will not clobber unrelated code. When using `--fix-replace-patterns` the script applies only a small set of conservative pattern repairs that are known to introduce duplicated `.unpacked` segments. If you see an unexpected change, revert the affected file(s) from git.

## CI recommendations

- Add a packaging/verify job that runs:

```bash
# in CI macOS packaging job
node misc/patch-node-pty-helperpath.js --prepack
# package the app (your existing steps)
# then run a small verification script that asserts spawn-helper exists under app.asar.unpacked
```

## Troubleshooting

- If the app's in-app terminal can find utilities when launched from a terminal but not when launched from Finder, it's likely the GUI process lacked the user's shell PATH. The Electron main now includes an experimental PATH sync that attempts to read the login shell and `launchctl` PATH and merge it into `process.env.PATH` at startup.
- If you see `posix_spawn_ret=2` in native logs, run the instrumentation helper to capture the exact argv passed to the native helper and then run the patcher with `--prepack --fix-replace-patterns`.

## Summary

The `misc` tools provide a safer, repeatable path for building and packaging the `node-pty` native addon across developer machines and CI. Use the patcher during packaging, keep the prebuild helper in your local toolbox for busted Python/tooling hosts, and only enable the instrumentation when debugging native spawn issues.
