import fs from "fs-extra";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const packageDir = __dirname;
const clientDir = path.join(packageDir, "../client");
const clientDistDir = path.join(clientDir, "dist");
const electronSrcDir = path.join(packageDir, "src");
const electronDistDir = path.join(packageDir, "dist");

// Ensure dist directory exists
await fs.ensureDir(electronDistDir);

// Copy main.js to dist
console.log("Copying main.js to dist...");
await fs.copy(
  path.join(electronSrcDir, "main.js"),
  path.join(electronDistDir, "main.js")
);

// Copy preload.js to dist
console.log("Copying preload.js to dist...");
await fs.copy(
  path.join(electronSrcDir, "preload.js"),
  path.join(electronDistDir, "preload.js")
);

// Copy client dist to electron dist
console.log("Copying built client to dist...");
if (fs.existsSync(clientDistDir)) {
  // Create a separate client/dist directory structure
  const clientOutputDir = path.join(electronDistDir, "client", "dist");
  await fs.ensureDir(clientOutputDir);
  await fs.copy(clientDistDir, clientOutputDir);

  // Copy client icons (for electron window/dock icon)
  const clientIconsDir = path.join(clientDir, "icons");
  if (fs.existsSync(clientIconsDir)) {
    const iconsOutputDir = path.join(electronDistDir, "client", "icons");
    await fs.ensureDir(iconsOutputDir);
    await fs.copy(clientIconsDir, iconsOutputDir);
  }
} else {
  console.error("Client dist not found. Run 'npm run build:client' first.");
  process.exit(1);
}

// Copy entire server package (routes + lib) into electron dist for packaged builds
const serverDir = path.join(packageDir, "..", "server");
if (fs.existsSync(serverDir)) {
  console.log(
    "Copying server package into electron dist for packaged builds..."
  );
  const serverOutputDir = path.join(electronDistDir, "server");
  // If an existing symlink points the output back at the source (leftover
  // from earlier runs), remove it to avoid copy-into-self errors.
  try {
    if (fs.existsSync(serverOutputDir)) {
      const st = await fs.lstat(serverOutputDir);
      if (st.isSymbolicLink()) {
        console.log("Removing existing symlink at", serverOutputDir);
        await fs.remove(serverOutputDir);
      }
    }
  } catch (e) {
    // ignore and continue
  }
  await fs.ensureDir(serverOutputDir);
  // Copy routes and lib directories
  await fs.copy(
    path.join(serverDir, "routes"),
    path.join(serverOutputDir, "routes")
  );
  // After copying server/routes into the electron dist we need to fix
  // relative imports that reference the repository root's misc/fm path.
  // In the dist tree those imports should point to '../../misc/fm' (inside
  // dist) so adjust the copied files here to avoid requiring a package-level
  // duplicate under packages/electron/misc.
  try {
    const routesDistDir = path.join(serverOutputDir, "routes");
    if (fs.existsSync(routesDistDir)) {
      const files = await fs.readdir(routesDistDir);
      const walk = async (dir) => {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const e of entries) {
          const p = path.join(dir, e.name);
          if (e.isDirectory()) await walk(p);
          else if (e.isFile() && p.endsWith('.js')) {
            let content = await fs.readFile(p, 'utf8');
            // Replace imports that point to the repo-root misc/fm path
            // '../../../misc/fm' --> '../../misc/fm' (works for dist/server/routes)
            if (content.includes("../../../misc/fm")) {
              content = content.replace(/\.\.\/\.\.\/\.\.\/misc\/fm/g, "..\/..\/misc\/fm");
              await fs.writeFile(p, content, 'utf8');
            }
          }
        }
      };
      await walk(routesDistDir);
    }
  } catch (e) {
    console.warn('Could not patch dist server route imports:', e && e.message);
  }
  await fs.copy(path.join(serverDir, "lib"), path.join(serverOutputDir, "lib"));
  // Copy package.json and config if they exist
  if (fs.existsSync(path.join(serverDir, "package.json"))) {
    await fs.copy(
      path.join(serverDir, "package.json"),
      path.join(serverOutputDir, "package.json")
    );
  }
  if (fs.existsSync(path.join(serverDir, "config.json"))) {
    await fs.copy(
      path.join(serverDir, "config.json"),
      path.join(serverOutputDir, "config.json")
    );
  }
} else {
  console.error("Server package not found. Ensure packages/server exists.");
  process.exit(1);
}

// Ensure misc/fm (developer helpers) are copied into electron dist so the
// packaged app can resolve imports like '../../../misc/fm/utils.js'. This is
// required because server route files import helpers via relative paths that
// expect misc/fm to be available next to the dist tree in packaged builds.
try {
  const repoRoot = path.resolve(path.join(packageDir, "..", ".."));
  const miscFmSrc = path.join(repoRoot, "misc", "fm");
  const miscFmDest = path.join(electronDistDir, "misc", "fm");
  if (fs.existsSync(miscFmSrc)) {
    console.log(`Copying misc/fm into electron dist -> ${miscFmDest}`);
    await fs.ensureDir(path.dirname(miscFmDest));
    await fs.copy(miscFmSrc, miscFmDest);
  }
  // Note: we intentionally DO NOT copy misc/fm into packages/electron/misc
  // (package-level folder). We only copy it into the electron dist output
  // (dist/misc). This avoids creating a duplicate source tree in
  // packages/electron while still ensuring the packaged app has the
  // required files in the dist tree.
} catch (e) {
  // Non-fatal — continue with build but warn so maintainer can investigate.
  console.warn("Failed to copy misc/fm into electron dist:", e && e.message);
}

// Run the node-pty patcher early so the server copy inside electron dist is
// already patched before we copy native artifacts or build into an asar.
try {
  const repoRoot = path.resolve(path.join(packageDir, "..", ".."));
  const patcher = path.join(repoRoot, "misc", "patch-node-pty-helperpath.js");
  if (fs.existsSync(patcher)) {
    console.log(
      "Running node-pty helper-path patcher (prepack) against electron dist/server..."
    );
    try {
      spawnSync("node", [patcher, "--prepack"], {
        stdio: "inherit",
        shell: true,
      });
    } catch (e) {
      console.warn(
        "Prepack node-pty patcher execution failed:",
        e && e.message
      );
    }
  }
} catch (e) {
  // non-fatal
}

// Also copy node-pty native artifacts into dist so packaged/dev electron runs
// that use the dist/server copy can load the native addon. We only copy the
// node-pty package (not all server node_modules) to keep the dist footprint
// small.
try {
  const nodePtySrc = path.join(serverDir, "node_modules", "node-pty");
  const nodePtyDest = path.join(
    electronDistDir,
    "server",
    "node_modules",
    "node-pty"
  );
  // Persistent cache for node-pty builds (so different runtimes can reuse
  // previously-built binaries). Cache lives at repoRoot/.node-pty-cache.
  const cacheDir = path.join(packageDir, "..", "..", ".node-pty-cache");
  const cacheNodePath = path.join(cacheDir, "node", "pty.node");
  const cacheElectronPath = path.join(cacheDir, "electron", "pty.node");
  let electronSaved = null;
  let nodeSaved = null;
  if (fs.existsSync(nodePtySrc)) {
    console.log("Copying node-pty native addon into electron dist...");
    await fs.ensureDir(path.dirname(nodePtyDest));
    // Avoid copying any files that point back into a developer .venv to
    // prevent recursive copy errors (some native packages may contain
    // symlinks or references into .venv). Filter out paths that include
    // the repository .venv directory. Also guard against copying a path
    // into a subdirectory of itself (which fs-extra rejects). We use
    // Ensure node-pty is built for the Electron runtime (rebuild against
    // Electron headers) so the native addon matches the Electron ABI. This
    // runs electron-rebuild against the server package before we copy the
    // package into the electron dist. If electron-rebuild is not available
    // or the rebuild fails we continue but log a warning.
    try {
      const readPkg = (p) => {
        try {
          return JSON.parse(fs.readFileSync(p, "utf8"));
        } catch (e) {
          return null;
        }
      };
      const electronPkg = readPkg(path.join(packageDir, "package.json"));
      let electronVersion = null;
      if (electronPkg && electronPkg.build && electronPkg.build.electronVersion)
        electronVersion = electronPkg.build.electronVersion;
      if (
        !electronVersion &&
        electronPkg &&
        electronPkg.devDependencies &&
        electronPkg.devDependencies.electron
      )
        electronVersion = electronPkg.devDependencies.electron;
      // Fallback to environment or skip if unknown
      if (electronVersion) {
        const moduleDir = path.join(packageDir, "..", "server");
        console.log(
          `Preparing native builds for node-pty (node + electron v${electronVersion}) before copying into dist...`
        );
        // If a helper-created venv exists (or will be created), prefer it for node-gyp
        const repoRoot = path.resolve(path.join(packageDir, "..", ".."));
        const venvPath = path.join(repoRoot, ".venv-node-pty");
        const venvPython = path.join(venvPath, "bin", "python");

        // Ensure helper runs to create the local venv (auto-env) so node-gyp
        // can find distutils on modern Python installations. We run it
        // unconditionally (best-effort) so the build is reproducible for
        // contributors who only run `npm install` + `npm run electron:dev`.
        try {
          console.log(
            "Ensuring local venv and distutils shim via helper (auto-env)..."
          );
          const helper = path.join(repoRoot, "misc", "prebuild-node-pty.js");
          const created = spawnSync(
            "node",
            [helper, "--apply-fixes", "--yes", "--auto-env"],
            { stdio: "inherit", shell: true }
          );
          if (created.error || created.status !== 0) {
            console.warn(
              "prebuild helper could not create venv; native builds may fail if distutils is missing"
            );
          }
        } catch (e) {
          // ignore helper failures — we'll still try rebuilds below and log errors
        }

        // Prepare env for native builds
        const arch = process.arch || "x64";
        const env = { ...process.env };
        if (fs.existsSync(venvPython)) {
          env.npm_config_python = venvPython;
          console.log(`Using venv python for node-gyp: ${venvPython}`);
        } else {
          console.log(
            `No helper venv detected at ${venvPython}; attempting system python for node-gyp`
          );
        }

        // 1) Ensure a Node-native build exists (for running `npm run dev` / node)
        try {
          console.log("Building node-pty for Node (node ABI)...");
          const rb = spawnSync(
            "npm",
            ["--prefix", moduleDir, "rebuild", "node-pty"],
            { stdio: "inherit", shell: true, env }
          );
          if (rb.error || rb.status !== 0) {
            console.warn(
              "npm rebuild node-pty failed; Node native binary may be missing for dev server."
            );
          }
        } catch (e) {
          console.warn(
            "Error while rebuilding node-pty for Node:",
            e && e.message
          );
        }

        // Save the Node build so we can restore it after electron-rebuild
        const nodePtyPkgDir = path.join(moduleDir, "node_modules", "node-pty");
        const nodeBuiltRelease = path.join(
          nodePtyPkgDir,
          "build",
          "Release",
          "pty.node"
        );
        const tmpDir = cacheDir;
        await fs.ensureDir(tmpDir);
        await fs.ensureDir(path.join(tmpDir, "node"));
        await fs.ensureDir(path.join(tmpDir, "electron"));
        nodeSaved = cacheNodePath;
        try {
          if (fs.existsSync(nodeBuiltRelease)) {
            await fs.copyFile(nodeBuiltRelease, nodeSaved);
          }
        } catch (e) {
          // non-fatal
        }

        // 2) Build for Electron ABI
        let electronRebuildResult = null;
        try {
          // Run an optional instrumentation helper that injects native
          // diagnostics into node-pty's pty.cc before we rebuild it for
          // Electron. This helps capture posix_spawn failures on macOS
          // during runtime. The helper is non-destructive (creates a
          // backup) and its full output is saved to the node-pty cache.
          try {
            const instrumenter = path.join(
              repoRoot,
              "misc",
              "instrument-node-pty.js"
            );
            if (fs.existsSync(instrumenter)) {
              console.log("Running node-pty instrumentation helper...");
              const instRes = spawnSync("node", [instrumenter], {
                stdio: "pipe",
                shell: true,
                env,
              });
              const instOut = (instRes.stdout || "").toString();
              const instErr = (instRes.stderr || "").toString();
              try {
                await fs.ensureDir(cacheDir);
                await fs.writeFile(
                  path.join(cacheDir, "instrument-node-pty.log"),
                  `${instOut}\n${instErr}`,
                  "utf8"
                );
              } catch (e) {
                // non-fatal
              }
              if (instRes.error || instRes.status !== 0) {
                console.warn(
                  "node-pty instrumentation helper failed (see .node-pty-cache/instrument-node-pty.log)"
                );
              } else {
                console.log(
                  "node-pty instrumentation helper completed (log: .node-pty-cache/instrument-node-pty.log)"
                );
              }
            }
          } catch (e) {
            console.warn(
              "Could not run node-pty instrumentation helper:",
              e && e.message
            );
          }

          // Run a small idempotent patcher that ensures the node-pty JS wrapper
          // deterministically resolves the spawn-helper path inside packaged
          // Electron builds. This avoids fragile string replacements that can
          // produce "app.asar.unpacked.unpacked" when multiple packaging steps
          // run. The patcher is safe to run repeatedly and will no-op if the
          // target is already patched.
          try {
            const patcher = path.join(
              repoRoot,
              "misc",
              "patch-node-pty-helperpath.js"
            );
            if (fs.existsSync(patcher)) {
              console.log("Running node-pty helper-path patcher...");
              const pRes = spawnSync("node", [patcher], {
                stdio: "pipe",
                shell: true,
                env,
              });
              const pout = (pRes.stdout || "").toString();
              const perr = (pRes.stderr || "").toString();
              if (pout) console.log(pout.trim());
              if (perr) console.warn(perr.trim());
              if (pRes.error || pRes.status !== 0) {
                console.warn(
                  "node-pty patcher returned non-zero status; build will continue but consider inspecting the patcher output."
                );
              } else {
                console.log("node-pty helper-path patcher finished.");
              }
            }
          } catch (e) {
            console.warn(
              "Could not run node-pty helper-path patcher:",
              e && e.message
            );
          }

          console.log("Running electron-rebuild for node-pty...");

          // Run electron-rebuild but capture output to avoid flooding the
          // console with compiler warnings. We'll summarize results and
          // write the full log to the cache directory for later inspection.
          electronRebuildResult = spawnSync(
            "npx",
            [
              "electron-rebuild",
              "-f",
              "-w",
              "node-pty",
              "--arch",
              arch,
              "--electron-version",
              String(electronVersion),
              "--module-dir",
              moduleDir,
            ],
            { stdio: "pipe", shell: true, env }
          );

          // Normalize output
          const out = (electronRebuildResult.stdout || "").toString();
          const err = (electronRebuildResult.stderr || "").toString();
          const combined = `${out}\n${err}`;

          // Ensure cacheDir exists and write the full rebuild log for debugging
          try {
            await fs.ensureDir(cacheDir);
            const rebuildLog = path.join(
              cacheDir,
              "electron-rebuild-node-pty.log"
            );
            await fs.writeFile(rebuildLog, combined, "utf8");
          } catch (e) {
            // non-fatal — continue even if we couldn't write the log
          }

          // Count warnings (simple heuristic)
          const warningMatches = combined.match(/warning[:\s]|warning\)/gi);
          const warnings = warningMatches ? warningMatches.length : 0;

          if (
            electronRebuildResult.error ||
            electronRebuildResult.status !== 0
          ) {
            console.warn(
              "electron-rebuild failed — the native addon may not be compatible with Electron. Continuing copy but Electron may fall back to pipe terminal. Full log written to:",
              path.join(cacheDir, "electron-rebuild-node-pty.log")
            );
            // Also print a short tail of stderr to help diagnose immediate problems
            if (err) console.warn(err.split(/\r?\n/).slice(-10).join("\n"));
          } else {
            if (warnings > 0) {
              console.log(
                `electron-rebuild completed with ${warnings} warnings (full log: ${path.join(
                  cacheDir,
                  "electron-rebuild-node-pty.log"
                )})`
              );
            } else {
              console.log("electron-rebuild completed successfully");
            }
          }
        } catch (e) {
          console.warn("Could not run electron-rebuild step:", e && e.message);
        }

        // Cleanup: if the instrumentation helper created a backup of the
        // original pty.cc (pty.cc.orig), restore it now so the package
        // sources remain clean. We record the restore action in the
        // node-pty cache for auditing.
        try {
          const backup = path.join(nodePtyPkgDir, "src", "unix", "pty.cc.orig");
          const original = path.join(nodePtyPkgDir, "src", "unix", "pty.cc");
          if (await fs.pathExists(backup)) {
            try {
              await fs.copyFile(backup, original);
              await fs.remove(backup);
              console.log(
                "Restored original node-pty/src/unix/pty.cc from backup"
              );
              try {
                await fs.ensureDir(cacheDir);
                await fs.writeFile(
                  path.join(cacheDir, "instrument-restore.log"),
                  `restored: ${backup}\n`,
                  "utf8"
                );
              } catch (e) {
                // non-fatal
              }
            } catch (e) {
              console.warn(
                "Could not restore original pty.cc:",
                e && e.message
              );
            }
          }
        } catch (e) {
          // ignore cleanup errors — not critical for the build
        }

        // Save electron-built Release binary (if present) and copy it into
        // the server package so Electron will load an Electron-ABI binary
        // even when the Node dev server was built earlier. Keep a backup
        // of the Node build we saved earlier so we can restore manually if
        // desired.
        electronSaved = cacheElectronPath;
        const electronBuiltRelease = path.join(
          nodePtyPkgDir,
          "build",
          "Release",
          "pty.node"
        );
        try {
          if (fs.existsSync(electronBuiltRelease)) {
            await fs.copyFile(electronBuiltRelease, electronSaved);
            // Overwrite the server package's binary with the Electron build
            try {
              await fs.copyFile(electronBuiltRelease, nodeBuiltRelease);
              // Also ensure Debug fallback is present
              const nodeDebug = path.join(
                nodePtyPkgDir,
                "build",
                "Debug",
                "pty.node"
              );
              await fs.ensureDir(path.dirname(nodeDebug));
              if (!fs.existsSync(nodeDebug))
                await fs.copyFile(electronBuiltRelease, nodeDebug);
            } catch (e) {
              // non-fatal
            }
          }
        } catch (e) {
          // non-fatal
        }
        if (
          electronRebuildResult &&
          (electronRebuildResult.error || electronRebuildResult.status !== 0)
        ) {
          console.warn(
            "electron-rebuild failed — the native addon may not be compatible with Electron. Continuing copy but Electron may fall back to pipe terminal."
          );
        } else {
          // Ensure a Debug copy exists so require('../build/Debug/pty.node') can succeed
          try {
            const builtRelease = path.join(
              moduleDir,
              "node_modules",
              "node-pty",
              "build",
              "Release",
              "pty.node"
            );
            const debugDir = path.join(
              moduleDir,
              "node_modules",
              "node-pty",
              "build",
              "Debug"
            );
            if (
              fs.existsSync(builtRelease) &&
              !fs.existsSync(path.join(debugDir, "pty.node"))
            ) {
              await fs.ensureDir(debugDir);
              await fs.copyFile(builtRelease, path.join(debugDir, "pty.node"));
            }
          } catch (e) {
            // non-fatal
          }
        }
      }
    } catch (e) {
      console.warn("Could not run electron-rebuild step:", e && e.message);
    }
    // resolved absolute paths for comparisons. Check both common venv
    // locations we may create/use: ".venv" (older) and
    // ".venv-node-pty" (helper-created). Skip any symlinks that point
    // into either to avoid recursive copy errors.
    const repoVenv = path.resolve(path.join(packageDir, "..", "..", ".venv"));
    const repoVenvNodePty = path.resolve(
      path.join(packageDir, "..", "..", ".venv-node-pty")
    );
    const absNodePtyDest = path.resolve(nodePtyDest);

    // Before copying, detect any symlinks inside node-pty that point
    // into the repository .venv (or into the eventual destination). If
    // such symlinks exist, fs-extra may try to create links that result
    // in copy-into-self errors. We'll collect those symlink paths and
    // skip them via the filter.
    const skipSymlinkPaths = new Set();

    async function collectBadSymlinks(dir) {
      let entries = [];
      try {
        entries = await fs.readdir(dir);
      } catch (e) {
        return;
      }
      for (const ent of entries) {
        const p = path.join(dir, ent);
        try {
          const st = await fs.lstat(p);
          if (st.isSymbolicLink()) {
            try {
              const target = await fs.readlink(p);
              const absTarget = path.resolve(path.dirname(p), target);
              if (
                absTarget === repoVenv ||
                absTarget.startsWith(repoVenv + path.sep) ||
                absTarget === repoVenvNodePty ||
                absTarget.startsWith(repoVenvNodePty + path.sep) ||
                absTarget === absNodePtyDest ||
                absTarget.startsWith(absNodePtyDest + path.sep)
              ) {
                skipSymlinkPaths.add(path.resolve(p));
              }
            } catch (e) {
              // ignore broken readlink
            }
          } else if (st.isDirectory()) {
            await collectBadSymlinks(p);
          }
        } catch (e) {
          // ignore lstat errors
        }
      }
    }

    await collectBadSymlinks(nodePtySrc);
    if (skipSymlinkPaths.size) {
      console.log(
        `Skipping ${skipSymlinkPaths.size} symlink(s) inside node-pty that point into .venv or dest`
      );
    }

    await fs.copy(nodePtySrc, nodePtyDest, {
      dereference: false,
      filter: (src, dest) => {
        try {
          const rsrc = path.resolve(src);
          const rdest = path.resolve(dest);

          // Skip any symlinks we detected as problematic
          if (skipSymlinkPaths.has(rsrc)) return false;

          // Skip anything that lives under the repository venv
          if (rsrc === repoVenv || rsrc.startsWith(repoVenv + path.sep))
            return false;

          // Avoid copying a file/dir into itself or into one of its own
          // subdirectories which can happen with symlinks or unexpected
          // path resolutions. If dest is inside src, skip it.
          if (rdest === rsrc || rdest.startsWith(rsrc + path.sep)) return false;

          // Also protect against src being inside the destination (rare,
          // but protects against pathological cases): skip copying if src
          // is already inside the eventual destination path.
          if (
            rsrc === absNodePtyDest ||
            rsrc.startsWith(absNodePtyDest + path.sep)
          )
            return false;

          return true;
        } catch (e) {
          // On any unexpected error conservatively skip the file to avoid
          // build-time failures.
          return false;
        }
      },
    });
    // If we saved an electron-built binary, inject it into the copied
    // electron dist so the packaged electron app loads the Electron ABI
    // compatible binary while the source remains restored for the Node
    // dev server.
    try {
      if (electronSaved && fs.existsSync(electronSaved)) {
        const destRelease = path.join(
          nodePtyDest,
          "build",
          "Release",
          "pty.node"
        );
        const destDebug = path.join(nodePtyDest, "build", "Debug", "pty.node");
        await fs.ensureDir(path.dirname(destRelease));
        await fs.copyFile(electronSaved, destRelease);
        // Also ensure Debug fallback exists in the electron dist
        await fs.ensureDir(path.dirname(destDebug));
        if (!fs.existsSync(destDebug))
          await fs.copyFile(electronSaved, destDebug);
      }
    } catch (e) {
      // non-fatal
    }
  }
} catch (e) {
  console.warn(
    "Failed to copy node-pty into electron dist:",
    e && e.stack ? e.stack : e && e.message
  );
}

console.log("Electron app built successfully!");
