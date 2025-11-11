# Miscellaneous helper scripts

This folder contains small helper scripts used during development and local setup. The most important for fresh clones is the `node-pty` prebuild helper.

## Files

- **create-corrupt-zip.js** — creates a corrupt zip archive to verify the Archive Integrity feature.
- **prebuild-node-pty.js** — helper that attempts to prepare the optional native `node-pty` addon used by the server package. It:

  - probes for a usable Python/runtime that exposes `distutils` (node-gyp requirement),
  - attempts a per-package install into a temporary prefix and atomically moves the result into place,
  - optionally creates or reuses a repository-local virtualenv (`.venv-node-pty`) and can add a small `distutils` shim when needed (`--auto-env` / `--auto-venv`),
  - provides detailed diagnostics and a conservative `--apply-fixes` mode that can remove stale per-package lockfiles and re-install node-pty.

- **prepare-node-pty.js** — a lightweight runtime prepare helper (intended to be run by the server before importing modules that may require the native addon). It:

  - looks for a cached ABI-matching `pty.node` under the repository `.node-pty-cache` and copies it into `packages/server/node_modules/node-pty/build/Release` if present,
  - if no cache is available, invokes a rebuild flow (using `npm rebuild` for Node runtime or `electron-rebuild` for Electron) and then caches the built binary for subsequent runs,
  - will attempt to use the `prebuild-node-pty.js` helper to create a local venv/shim if Python's distutils is missing on the host.

- **starter.js** — an interactive starter helper that provides a common menu of project tasks (start Node app, run Electron dev, build Electron dists, etc.). It is used by the `postinstall` runner and by the `start.*` scripts and is also exposed as `npm run startup`.

## Recommended workflow (fresh clone)

1. Clone the repo and change into it:

```bash
git clone <repo-url>
cd web-file-manager
```

2. Run a normal install. The postinstall runner will run the helper in a best-effort way:

```bash
npm install
```

3. If `node-pty` still fails to load at runtime, run the helper manually for verbose output and interactive guidance:

```bash
node misc/prebuild-node-pty.js --apply-fixes --yes --auto-env
```
