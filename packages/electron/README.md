# Web File Manager - Electron App

This is the Electron desktop application for Web File Manager. It bundles the frontend client and backend server into a single self-contained desktop application. The project is cross-platform (macOS, Windows, Linux) and the instructions below cover development and packaging for all three OS families.

## Building

From the root directory:

```bash
# Build and run in development mode
npm run electron:dev

# Build the application (creates unpacked dist in packages/electron/dist)
npm run electron:build

# Create platform-specific distributions (see notes below)
npm run electron:dist
```

## How It Works

1. **Backend Server**: The Express.js server runs within the Electron main process on `localhost:3001`
2. **Frontend Client**: The built React/Vite app loads from the Electron window and communicates with the backend via localhost
3. **Self-contained**: No external dependencies needed - everything is bundled within the application

## Architecture

The Electron package maintains **no duplicates** of client or server code. Instead:

- **In development**: Electron dynamically imports server routes/libs from `packages/server` and loads the client from `packages/client`
- **In production**: The `build.js` script copies the server package and client dist into `packages/electron/dist` for packaging

### Source Structure

```
packages/electron/
├── src/
│   ├── main.js       - Electron main process (dynamically imports server & client)
│   └── preload.js    - Preload script for renderer process
├── build.js          - Build script that copies server & client into dist/
├── package.json      - Dependencies & electron-builder config
└── dist/             - Generated build output (not in git)
    ├── main.js
    ├── preload.js
    ├── client/       - Client dist & icons (copied from packages/client)
    └── server/       - Server routes & libs (copied from packages/server)
```

### Key Points

- **No `src/lib` or `src/routes`**: These were removed — electron loads server code directly from `packages/server`
- **No `src/config.json`**: Uses the server's `config.json` at `packages/server/config.json`
- **No `assets/` folder**: Uses the client's icon at `packages/client/icons/icon.png`
- **Dynamic imports**: `src/main.js` resolves workspace packages at runtime (dev) or packaged copies (production)

## Development Workflow

1. Install workspace dependencies:

   ```bash
   npm install
   ```

2. Build the client once:

   ```bash
   npm run build --workspace=@web-file-manager/client
   ```

3. Run electron dev (builds and launches):
   ```bash
   npm run electron:dev
   # or
   npm run dev --workspace=@web-file-manager/electron
   ```

The electron app will:

- Load server routes from `packages/server/routes/`
- Load server libs from `packages/server/lib/`
- Load client from `packages/client/dist/`
- Use icon from `packages/client/icons/icon.png`

## Build & Packaging

The `build.js` script prepares `packages/electron/dist` by copying the built client and server artifacts into the Electron package. It performs the following steps:

1. Copies `src/main.js` and `src/preload.js` to `dist/`
2. Copies `packages/client/dist` → `dist/client/dist`
3. Copies `packages/client/icons` → `dist/client/icons`
4. Copies `packages/server/routes` and `packages/server/lib` → `dist/server/`

This produces a self-contained `dist/` directory that the packager (Electron-Builder by default) consumes.

## Platform distributions

The `electron:dist` script uses the configuration under the `build` key in `packages/electron/package.json`. Typical targets we support or recommend:

- macOS: DMG and ZIP. You can build a universal app (arm64 + x64). Notarization can be enabled for App Store or Gatekeeper requirements.
- Windows: NSIS installer (or ZIP). Build for x64 and/or ia32. Code signing with an EV certificate is recommended for smooth installs.
- Linux: AppImage (portable), deb, rpm. AppImage is a good cross-distro portable option; deb/rpm are for distribution to specific package systems.

Example notes:

- To build a macOS DMG (on macOS):

```bash
# runs electron-builder with mac targets
npm run electron:dist
```

- To build Windows installers (on Windows or CI with required tooling):

```bash
# ensure code signing certs are available in CI environment or local machine
npm run electron:dist
```

- To build Linux AppImage (on Linux or in proper CI):

```bash
npm run electron:dist
```

Note: Cross-building (building a Windows exe from macOS, or an AppImage from macOS) can be done in CI but often requires additional setup (wine, mingw, etc.). Using dedicated CI runners for each OS is the most reliable approach.

### Packaging pitfalls & native modules

- Native modules (for example, compiled add-ons or PTY libraries) must match the Electron/Node ABI of the packaged app. If you include native modules in `packages/server`, ensure they are compiled for the Electron ABI used by your build. Strategies:
  - Use prebuilt binaries for the native modules your app depends on, or publish prebuilds for every Electron ABI you target.
  - Run `electron-rebuild` during your build pipeline to rebuild native modules against Electron headers (replace <native-package> with the package name):

```bash
npx electron-rebuild -f -w <native-package>
```

- Prefer running heavy native modules in an external helper Node process (not inside the Electron runtime) to avoid ABI mismatches inside packaged Electron.

## Closing notes

- The repo is designed to avoid duplicating source between packages. During development Electron imports server code directly from `packages/server`. During packaging `build.js` collects the required files into `packages/electron/dist`.
- For CI: run builds on OS-specific runners for the most reliable artifacts (macOS builds on macOS runners, Windows on Windows, Linux on Linux).

If you want, I can add a short example CI job (GitHub Actions) that builds per-OS artifacts and produces prebuilt native modules for any native dependencies (for example, PTY libraries) if you decide to include them in the server helper.
