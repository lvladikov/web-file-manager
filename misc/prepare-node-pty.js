const fs = require("fs-extra");
const path = require("path");
const { spawnSync } = require("child_process");

async function prepare() {
  const repoRoot = path.resolve(path.join(__dirname, ".."));
  // This helper lives in misc/ but targets the server package where
  // node-pty is an optional dependency.
  const moduleDir = path.resolve(path.join(repoRoot, "packages", "server"));
  const nodePtyPkgDir = path.join(moduleDir, "node_modules", "node-pty");
  const builtRelease = path.join(nodePtyPkgDir, "build", "Release", "pty.node");
  const builtDebug = path.join(nodePtyPkgDir, "build", "Debug", "pty.node");

  const cacheDir = path.join(repoRoot, ".node-pty-cache");
  const cacheNode = path.join(cacheDir, "node", "pty.node");
  const cacheElectron = path.join(cacheDir, "electron", "pty.node");

  const runtime =
    process.versions && process.versions.electron ? "electron" : "node";
  console.log(`[prepare-node-pty] runtime=${runtime}`);

  // Ensure node-pty package is present; if not, attempt to install
  if (!fs.existsSync(nodePtyPkgDir)) {
    console.log(
      "[prepare-node-pty] node-pty not found in server package; installing optional dependency..."
    );
    try {
      spawnSync(
        "npm",
        [
          "--prefix",
          moduleDir,
          "install",
          "node-pty",
          "prebuild-install",
          "--save-optional",
        ],
        { stdio: "inherit", shell: true }
      );
    } catch (e) {
      // ignore
    }
  }

  // If cached binary for the runtime exists, copy it into the module build path
  const cachePath = runtime === "electron" ? cacheElectron : cacheNode;
  try {
    if (fs.existsSync(cachePath)) {
      console.log(`[prepare-node-pty] using cached binary: ${cachePath}`);
      await fs.ensureDir(path.dirname(builtRelease));
      await fs.copyFile(cachePath, builtRelease);
      await fs.ensureDir(path.dirname(builtDebug));
      if (!fs.existsSync(builtDebug)) await fs.copyFile(cachePath, builtDebug);
      return;
    }
  } catch (e) {
    console.warn(
      "[prepare-node-pty] error while copying cached binary:",
      e && e.message
    );
  }

  // No cache — build for the required runtime and store the result in cache
  await fs.ensureDir(cacheDir);
  await fs.ensureDir(path.join(cacheDir, "node"));
  await fs.ensureDir(path.join(cacheDir, "electron"));
  // Prefer helper-created venv (which provides setuptools._distutils) for
  // node-gyp. If missing, try to create it using the helper.
  const venvPython = path.join(repoRoot, ".venv-node-pty", "bin", "python");
  const env = { ...process.env };
  if (!fs.existsSync(venvPython)) {
    try {
      console.log(
        "[prepare-node-pty] attempting to create helper venv for native builds..."
      );
      const helper = path.join(repoRoot, "misc", "prebuild-node-pty.js");
      const created = spawnSync(
        "node",
        [helper, "--apply-fixes", "--yes", "--auto-env"],
        { stdio: "inherit", shell: true }
      );
      if (created.error || created.status !== 0) {
        console.warn(
          "[prepare-node-pty] helper could not create venv; native builds may fail if distutils is missing"
        );
      }
    } catch (e) {
      // ignore
    }
  }
  if (fs.existsSync(venvPython)) {
    env.npm_config_python = venvPython;
    console.log("[prepare-node-pty] using helper venv python:", venvPython);
  }

  if (runtime === "node") {
    console.log("[prepare-node-pty] rebuilding node-pty for Node ABI...");
    try {
      const res = spawnSync(
        "npm",
        ["--prefix", moduleDir, "rebuild", "node-pty"],
        { stdio: "inherit", shell: true, env }
      );
      if (res.error || res.status !== 0)
        console.warn("[prepare-node-pty] npm rebuild failed (node)");
    } catch (e) {
      console.warn("[prepare-node-pty] rebuild error:", e && e.message);
    }
    if (fs.existsSync(builtRelease)) {
      await fs.copyFile(builtRelease, cacheNode);
      console.log("[prepare-node-pty] cached node binary at", cacheNode);
    }
  } else {
    console.log("[prepare-node-pty] building node-pty for Electron ABI...");
    // Try to pick electron version from electron package.json
    let electronVersion = process.env.ELECTRON_VERSION || null;
    try {
      const electronPkg = JSON.parse(
        await fs.readFile(
          path.join(repoRoot, "packages", "electron", "package.json"),
          "utf8"
        )
      );
      if (
        !electronVersion &&
        electronPkg &&
        electronPkg.build &&
        electronPkg.build.electronVersion
      )
        electronVersion = electronPkg.build.electronVersion;
      if (
        !electronVersion &&
        electronPkg &&
        electronPkg.devDependencies &&
        electronPkg.devDependencies.electron
      )
        electronVersion = electronPkg.devDependencies.electron;
    } catch (e) {
      // ignore
    }

    const env = { ...process.env };
    // If the helper created a python marker use it
    const pyMarker = path.join(repoRoot, ".python-for-electron");
    try {
      if (fs.existsSync(pyMarker)) {
        const python = (await fs.readFile(pyMarker, "utf8")).trim();
        if (python) env.npm_config_python = python;
      }
    } catch (e) {}

    try {
      const args = [
        "electron-rebuild",
        "-f",
        "-w",
        "node-pty",
        "--module-dir",
        moduleDir,
      ];
      if (electronVersion) {
        args.push("--electron-version", String(electronVersion));
      }
      const res = spawnSync("npx", args, {
        stdio: "inherit",
        shell: true,
        env,
      });
      if (res.error || res.status !== 0)
        console.warn("[prepare-node-pty] electron-rebuild failed");
    } catch (e) {
      console.warn(
        "[prepare-node-pty] electron-rebuild threw:",
        e && e.message
      );
    }

    if (fs.existsSync(builtRelease)) {
      await fs.copyFile(builtRelease, cacheElectron);
      console.log(
        "[prepare-node-pty] cached electron binary at",
        cacheElectron
      );
    }
  }

  // Ensure the built binary exists in module path (best-effort)
  try {
    if (fs.existsSync(cachePath)) {
      await fs.copyFile(cachePath, builtRelease);
      await fs.ensureDir(path.dirname(builtDebug));
      if (!fs.existsSync(builtDebug)) await fs.copyFile(cachePath, builtDebug);
    }
  } catch (e) {
    console.warn(
      "[prepare-node-pty] failed to copy built binary into module path:",
      e && e.message
    );
  }
}

// CommonJS export to allow simple require-and-run: `require('./prepare-node-pty.js').prepare()`
module.exports = { prepare };

// If executed directly, run the prepare() function (CLI friendly)
if (require.main === module) {
  (async () => {
    try {
      await prepare();
      process.exit(0);
    } catch (err) {
      console.error(
        "[prepare-node-pty] failed:",
        err && err.stack ? err.stack : err
      );
      process.exit(1);
    }
  })();
}
