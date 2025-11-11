#!/usr/bin/env node
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

// Minimal color helpers for clearer console output (no new deps).
const COLORS = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
};

// Decide whether to emit ANSI escapes. Behavior:
// - --no-color or env NO_COLOR => disable
// - --color or env FORCE_COLOR=1 => force enable
// - otherwise enable only when stdout is a TTY and TERM != 'dumb'
const argvNoColor = process.argv.includes("--no-color");
const argvForceColor = process.argv.includes("--color");
const envNoColor = !!process.env.NO_COLOR;
const envForceColor =
  String(process.env.FORCE_COLOR || "").toLowerCase() === "1" ||
  String(process.env.FORCE_COLOR || "").toLowerCase() === "true";
const stdoutIsTTY = !!(process.stdout && process.stdout.isTTY);
const termIsDumb = String(process.env.TERM || "").toLowerCase() === "dumb";

const ENABLE_COLOR = (() => {
  if (argvNoColor || envNoColor) return false;
  if (argvForceColor || envForceColor) return true;
  if (stdoutIsTTY && !termIsDumb) return true;
  return false;
})();

const style = (txt, ...codes) => {
  if (!ENABLE_COLOR) return txt;
  return `${codes.join("")}${txt}${COLORS.reset}`;
};

// Helper: check that the Python runtime available to node-gyp provides
// the `distutils` module. Newer Python versions (3.12+) removed distutils
// from the stdlib which might break node-gyp's `gyp` configure step.
// If distutils is missing actionable instructions are printed and script exits so the
// developer can fix their environment before attempting a native build.
function probePythonCandidates() {
  // Allow explicit override via CLI flag --venv-python or environment vars
  // (npm_config_python / NPM_CONFIG_PYTHON). If provided, probe it first.
  const explicit = (() => {
    const arg = process.argv.find((a) => a.startsWith("--venv-python="));
    if (arg) return arg.split("=")[1];
    if (process.env.npm_config_python) return process.env.npm_config_python;
    if (process.env.NPM_CONFIG_PYTHON) return process.env.NPM_CONFIG_PYTHON;
    return null;
  })();

  const candidates = [];
  if (explicit) candidates.push(explicit);
  // Common well-known names
  candidates.push("python3", "python");
  // Common versioned names present on some systems
  candidates.push(
    "python3.12",
    "python3.11",
    "python3.10",
    "/usr/bin/python3",
    "/usr/local/bin/python3"
  );

  // collect info for diagnostics
  const probed = [];
  for (const py of candidates) {
    if (!py) continue;
    try {
      // first probe version
      const ver = spawnSync(py, ["-c", "import sys;print(sys.version)"], {
        encoding: "utf8",
      });
      if (ver && ver.status === 0 && ver.stdout) {
        const version = ver.stdout.trim().split("\n").pop();
        // then check distutils
        const r = spawnSync(py, ["-c", "import distutils"], {
          stdio: "ignore",
        });
        const hasDist = r && r.status === 0;
        probed.push({ python: py, version, hasDist });
        if (hasDist) {
          DETECTED_PYTHON = { path: py, version };
          // expose probed list for diagnostics
          PROBED_PYTHONS = probed;
          return true;
        }
        // record candidate even if distutils missing
      } else {
        probed.push({ python: py, version: null, hasDist: false });
      }
    } catch (e) {
      probed.push({ python: py, version: null, hasDist: false });
    }
  }
  PROBED_PYTHONS = probed;
  return false;
}

let PROBED_PYTHONS = [];

function checkPythonDistutils() {
  // Prefer to run the Python/distutils probe by default. Skipping the
  // check must be explicit. Support two bypass mechanisms but make them
  // obvious in the output so a developer doesn't accidentally skip it.

  // 1) CLI flag: --ignore-python-check
  const argvBypass = process.argv.includes("--ignore-python-check");
  if (argvBypass) {
    console.warn(
      style(
        "Warning: skipping Python/distutils check due to --ignore-python-check CLI flag.",
        COLORS.yellow
      )
    );
    return true;
  }

  // 2) (legacy) environment variable: WEBFM_IGNORE_PYTHON_CHECK=1
  // Keep supporting it for backwards compatibility but print a clear
  // warning so accidental env var exports don't silently disable checks.
  const envBypass = String(
    process.env.WEBFM_IGNORE_PYTHON_CHECK || ""
  ).toLowerCase();
  if (envBypass === "1" || envBypass === "true") {
    console.warn(
      style(
        "Warning: skipping Python/distutils check because WEBFM_IGNORE_PYTHON_CHECK is set. To run checks, unset this variable.",
        COLORS.yellow
      )
    );
    return true;
  }

  // Probe for an available Python and whether it has distutils
  const ok = probePythonCandidates();
  return ok;
}

// If --auto-env is passed, create a small isolated venv with a distutils shim
// and point npm/node-gyp at that python. This helps on macOS where Python
// 3.12+ removed distutils from the stdlib.
function createAutoVenv(venvName = ".venv-node-pty") {
  const venvPath = path.join(__dirname, "..", venvName);
  const pythonCandidates = ["python3", "python"];
  console.log(`--auto-env: ensuring venv at ${venvPath}`);

  // If it already exists and looks usable, just point npm_config_python to it
  const venvPython = path.join(venvPath, "bin", "python");
  if (fs.existsSync(venvPython)) {
    console.log(`Using existing venv python: ${venvPython}`);
    process.env.npm_config_python = venvPython;
    return true;
  }

  // Try to create venv with available python binary
  let created = false;
  for (const py of pythonCandidates) {
    try {
      const res = spawnSync(py, ["-m", "venv", venvPath], { stdio: "inherit" });
      if (!res.error && res.status === 0) {
        created = true;
        break;
      }
    } catch (e) {
      // try next
    }
  }
  if (!created) {
    console.warn(`--auto-env: could not create venv at ${venvPath}`);
    return false;
  }

  // Install setuptools/wheel inside the venv
  try {
    const pipPython = venvPython;
    const r = spawnSync(
      pipPython,
      ["-m", "pip", "install", "--upgrade", "pip", "setuptools", "wheel"],
      { stdio: "inherit" }
    );
    if (r.error || r.status !== 0) {
      console.warn("--auto-env: pip install failed inside venv");
      return false;
    }

    // Create the distutils shim inside the venv site-packages
    const shimScript = `import sys, pathlib\nsp = pathlib.Path(sys.prefix) / f\"lib/python{sys.version_info.major}.{sys.version_info.minor}/site-packages\"\nd = sp / 'distutils'\nd.mkdir(parents=True, exist_ok=True)\n(d / '__init__.py').write_text(\"from setuptools._distutils import *\\n\")\n(d / 'version.py').write_text(\"from setuptools._distutils.version import *\\n\")\nprint('Wrote distutils shim to:', d)`;
    const rc = spawnSync(pipPython, ["-c", shimScript], {
      encoding: "utf8",
      stdio: "inherit",
    });
    if (rc.error) {
      console.warn(
        "--auto-env: could not write distutils shim:",
        rc.error && rc.error.message
      );
      return false;
    }

    // Point npm/node-gyp at this python for the remainder of the helper run
    process.env.npm_config_python = venvPython;
    console.log(`--auto-env: set npm_config_python=${venvPython}`);
    return true;
  } catch (e) {
    console.warn(
      `--auto-env: exception while preparing venv: ${e && e.message}`
    );
    return false;
  }
}

function readElectronVersion() {
  try {
    const p = path.join(
      __dirname,
      "..",
      "packages",
      "electron",
      "package.json"
    );
    const pkg = JSON.parse(fs.readFileSync(p, "utf8"));
    if (pkg && pkg.build && pkg.build.electronVersion)
      return pkg.build.electronVersion;
    if (pkg && pkg.devDependencies && pkg.devDependencies.electron)
      return pkg.devDependencies.electron;
  } catch (e) {
    // ignore
  }
  return "30.5.1";
}

function runPrebuild(envVars, label) {
  console.log(`\n=== Running prebuild for: ${label} ===`);
  const env = { ...process.env, ...envVars };
  // Use npm run prebuild-node-pty defined in packages/server/package.json
  const res = spawnSync(
    "npm",
    ["--prefix", "packages/server", "run", "prebuild-node-pty"],
    {
      env,
      stdio: "inherit",
      shell: true,
    }
  );

  if (res.error) {
    console.error(`${label} prebuild failed:`, res.error);
    return res.status || 1;
  }
  return res.status === 0 ? 0 : res.status || 1;
}

function checkNativeToolchain() {
  const plt = process.platform;
  const diagnostics = { ok: true, notes: [] };
  try {
    if (plt === "darwin") {
      const xs = spawnSync("xcode-select", ["-p"], { encoding: "utf8" });
      if (xs.status !== 0 || !xs.stdout) {
        diagnostics.ok = false;
        diagnostics.notes.push(
          "Xcode Command Line Tools not found. Run: xcode-select --install"
        );
      }
      const clang = spawnSync("clang", ["--version"], { encoding: "utf8" });
      if (clang.status !== 0) {
        diagnostics.ok = false;
        diagnostics.notes.push(
          "clang not found in PATH. Install Xcode/CLT or add clang to PATH."
        );
      }
    } else if (plt === "linux") {
      const gcc = spawnSync("gcc", ["--version"], { encoding: "utf8" });
      if (gcc.status !== 0) {
        diagnostics.ok = false;
        diagnostics.notes.push(
          "gcc not found. Install build-essential (e.g. sudo apt install build-essential)"
        );
      }
      const make = spawnSync("make", ["--version"], { encoding: "utf8" });
      if (make.status !== 0) {
        diagnostics.ok = false;
        diagnostics.notes.push(
          "make not found. Install build tools (e.g. sudo apt install make)"
        );
      }
    } else if (plt === "win32") {
      // On Windows we can only check common tools roughly.
      const clang = spawnSync("cl", [], { encoding: "utf8" });
      if (clang.status === 0) {
        // cl exists
      } else {
        diagnostics.notes.push(
          "Visual Studio Build Tools may be missing. Ensure 'Desktop development with C++' is installed."
        );
      }
    }
  } catch (e) {
    diagnostics.ok = false;
    diagnostics.notes.push(
      "Error while probing native toolchain: " + String(e)
    );
  }
  return diagnostics;
}

function analyzePrebuildFailure(label) {
  console.error(
    style(
      `\nDiagnostic: analyzing failed prebuild (${label})...`,
      COLORS.yellow
    )
  );

  // If node-pty exists under packages/server/node_modules, check for binding.gyp
  const localPath = path.join(
    __dirname,
    "..",
    "packages",
    "server",
    "node_modules",
    "node-pty"
  );
  if (fs.existsSync(localPath)) {
    console.error(style(`Found node-pty at: ${localPath}`, COLORS.cyan));
    const bg = path.join(localPath, "binding.gyp");
    if (!fs.existsSync(bg)) {
      console.error(
        style(
          "binding.gyp not found inside node-pty package; a source build requires the native addon sources to be present.",
          COLORS.yellow
        )
      );
      console.error(
        style(
          "If you ran 'node-gyp rebuild' from the server package root, that's likely the wrong cwd. Try:",
          COLORS.yellow
        )
      );
      console.error(
        style(
          "  cd packages/server/node_modules/node-pty && npx node-gyp rebuild --verbose",
          COLORS.green
        )
      );
      console.error(
        style(
          "Or re-install from the server package so npm runs the build in the correct location:",
          COLORS.yellow
        )
      );
      console.error(
        style(
          "  cd packages/server && npm install --save-optional node-pty prebuild-install --loglevel verbose",
          COLORS.green
        )
      );
    } else {
      console.error(
        style(
          "binding.gyp found inside node-pty package. Still failing — inspect the verbose node-gyp output for missing toolchain or headers.",
          COLORS.yellow
        )
      );
    }
  } else {
    console.error(
      style(
        "node-pty folder not present under packages/server/node_modules — prebuild likely failed to fetch or build the addon.",
        COLORS.yellow
      )
    );
    console.error(
      style(
        "Try re-running the verbose install to capture errors:",
        COLORS.yellow
      )
    );
    console.error(
      style(
        "  npm --prefix packages/server install node-pty prebuild-install --save-optional --loglevel verbose",
        COLORS.green
      )
    );
  }

  const tool = checkNativeToolchain();
  if (!tool.ok || tool.notes.length) {
    console.error(style("\nNative toolchain checks:", COLORS.cyan));
    for (const n of tool.notes) console.error(style(`  - ${n}`, COLORS.yellow));
  } else {
    console.error(
      style(
        "\nNative toolchain appears present (clang/gcc/make). If builds still fail, inspect the node-gyp verbose logs.",
        COLORS.green
      )
    );
  }

  // Check server package.json for misconfigured optionalDependencies that
  // can silently break installs (for example an earlier edit may have
  // placed a placeholder like "npm:null@..." which prevents fetching
  // node-pty correctly).
  try {
    const serverPkgPath = path.join(
      __dirname,
      "..",
      "packages",
      "server",
      "package.json"
    );
    if (fs.existsSync(serverPkgPath)) {
      const serverPkg = JSON.parse(fs.readFileSync(serverPkgPath, "utf8"));
      const nodePtyField =
        serverPkg &&
        serverPkg.optionalDependencies &&
        serverPkg.optionalDependencies["node-pty"];
      if (!nodePtyField) {
        console.error(
          style(
            "\npackages/server/package.json: optionalDependencies.node-pty is missing.",
            COLORS.yellow
          )
        );
        console.error(
          style(
            'Add a valid optional dependency entry, e.g. "node-pty": "^0.11.0" and re-run npm install inside packages/server.',
            COLORS.green
          )
        );
      } else if (
        String(nodePtyField).includes("null") ||
        String(nodePtyField).includes("npm:null")
      ) {
        console.error(
          style(
            `\npackages/server/package.json: optionalDependencies.node-pty looks invalid: ${String(
              nodePtyField
            )}`,
            COLORS.red
          )
        );
        console.error(
          style(
            "This will prevent npm from fetching a real node-pty release. Replace it with a real semver (for example '^0.11.0') and reinstall.",
            COLORS.green
          )
        );
        console.error(style("Suggested quick fix:", COLORS.cyan));
        console.error(
          style(
            '  1) Edit packages/server/package.json and set optionalDependencies.node-pty = "^0.11.0"',
            COLORS.green
          )
        );
        console.error(
          style(
            "  2) cd packages/server && npm install --save-optional node-pty prebuild-install --loglevel verbose",
            COLORS.green
          )
        );
      }
    }
  } catch (e) {
    // non-fatal
  }
}

function runElectronRebuild(electronVersion, arch) {
  console.log(
    style(
      `\nAttempting electron-rebuild for node-pty (electron v${electronVersion})...`,
      COLORS.cyan
    )
  );
  try {
    const moduleDir = path.join(__dirname, "..", "packages", "server");
    const args = [
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
    ];
    // Use npx so we don't add a permanent devDependency. Run with shell to
    const res = spawnSync("npx", args, {
      stdio: "inherit",
      shell: true,
      env: process.env,
    });
    if (res.error || res.status !== 0) {
      // Try to detect the actual Electron binary architecture (it may differ from
      // the current Node process arch, e.g. when Electron is running under Rosetta
      // on Apple Silicon). Use `npx electron -e "console.log(process.arch)"`
      // to query the runtime arch and prefer that when available.
      try {
        const probe = spawnSync(
          "npx",
          ["electron", "-e", "console.log(process.arch)"],
          { encoding: "utf8", shell: true }
        );
        if (probe && probe.status === 0 && probe.stdout) {
          const detected = String(probe.stdout || "")
            .trim()
            .split("\n")
            .pop();
          if (detected) {
            console.log(
              style(`Detected Electron arch: ${detected}`, COLORS.cyan)
            );
            arch = detected;
          }
        }
      } catch (e) {
        // non-fatal; fall back to provided arch
      }
      console.error(
        style("electron-rebuild failed or returned non-zero.", COLORS.red)
      );
      return false;
    }
    console.log(style("electron-rebuild finished successfully.", COLORS.green));
    return true;
  } catch (e) {
    console.error(
      style(`electron-rebuild exception: ${e && e.message}`, COLORS.red)
    );
    return false;
  }
}

// Install node-pty into a temporary prefix then atomically move it into
// packages/server/node_modules/node-pty. This avoids removing an existing
// working addon until a replacement is ready.
// Helper: try to rename, and on EXDEV (cross-device) fallback to recursive
// copy+remove so installs work when tmp and repo live on different filesystems.
function moveOrCopySync(src, dest) {
  try {
    fs.renameSync(src, dest);
    return true;
  } catch (err) {
    // EXDEV means cross-device rename not permitted; fall back to copy
    if (err && err.code === "EXDEV") {
      try {
        // Node 16+ supports fs.cpSync; use it for recursive copy
        if (typeof fs.cpSync === "function") {
          fs.cpSync(src, dest, { recursive: true });
        } else {
          // Fallback: spawn a platform-native copy (tar/cp) - keep it simple
          const plat = process.platform;
          if (plat === "win32") {
            spawnSync("robocopy", [src, dest, "/E"], { stdio: "inherit" });
          } else {
            spawnSync("cp", ["-R", src, dest], { stdio: "inherit" });
          }
        }
        // Remove the source after copy
        try {
          // fs.rmSync may not exist on very old Node; fall back to spawn rm
          if (typeof fs.rmSync === "function") {
            fs.rmSync(src, { recursive: true, force: true });
          } else {
            spawnSync("rm", ["-rf", src], { stdio: "inherit" });
          }
        } catch (e2) {}
        return true;
      } catch (e) {
        // copy failed
        return false;
      }
    }
    // Not an EXDEV (or other fallback), rethrow for caller to handle
    throw err;
  }
}

// Attempt to create or reuse a local virtualenv and ensure setuptools/_distutils
// is available. Returns an env overrides object on success, or null on failure.
function tryAutoVenv() {
  const want =
    process.argv.includes("--auto-env") || process.argv.includes("--auto-venv");
  if (!want) return null;

  console.log(
    style(
      "--auto-env present: attempting to create or reuse local venv before fixes...",
      COLORS.cyan
    )
  );

  const repoRoot = path.join(__dirname, "..");
  const venvDir = path.join(repoRoot, ".venv-node-pty");

  // Determine candidate python for creating the venv. Prefer explicit override.
  let explicit = null;
  const arg = process.argv.find((a) => a.startsWith("--venv-python="));
  if (arg) explicit = arg.split("=")[1];
  if (!explicit)
    explicit =
      process.env.npm_config_python || process.env.NPM_CONFIG_PYTHON || null;

  // Use explicit when given; otherwise prefer a probed python (first with version)
  let creatorPy = explicit;
  if (!creatorPy) {
    if (PROBED_PYTHONS && PROBED_PYTHONS.length) {
      const first = PROBED_PYTHONS.find((p) => p.version) || PROBED_PYTHONS[0];
      if (first) creatorPy = first.python;
    }
  }
  if (!creatorPy) creatorPy = "python3"; // best-effort fallback

  try {
    // Create venv if missing
    if (!fs.existsSync(venvDir)) {
      console.log(
        style(`Creating venv at ${venvDir} using ${creatorPy}...`, COLORS.cyan)
      );
      const res = spawnSync(creatorPy, ["-m", "venv", venvDir], {
        stdio: "inherit",
        shell: true,
      });
      if (res.error || res.status !== 0) {
        console.warn(
          style(`Failed to create venv with ${creatorPy}.`, COLORS.yellow)
        );
        return null;
      }
    } else {
      console.log(style(`Reusing existing venv at ${venvDir}`, COLORS.cyan));
    }

    const isWin = process.platform === "win32";
    const venvPython = isWin
      ? path.join(venvDir, "Scripts", "python.exe")
      : path.join(venvDir, "bin", "python");

    // Write the venv python path for electron builds
    const pythonPathFile = path.join(repoRoot, ".python-for-electron");
    try {
      fs.writeFileSync(pythonPathFile, DETECTED_PYTHON.path, "utf8");
      console.log(`Wrote python path for electron: ${pythonPathFile}`);
    } catch (e) {
      console.warn("Could not write python path file:", e && e.message);
    }

    // Ensure pip and setuptools/wheel are present/upgraded.
    console.log(
      style("Ensuring pip/setuptools/wheel inside venv...", COLORS.cyan)
    );
    const pipUpgrade = spawnSync(
      venvPython,
      ["-m", "pip", "install", "--upgrade", "pip", "setuptools", "wheel"],
      { stdio: "inherit", shell: true }
    );
    if (pipUpgrade.error || pipUpgrade.status !== 0) {
      console.warn(
        style("pip/setuptools upgrade inside venv failed.", COLORS.yellow)
      );
      // continue; maybe already OK
    }

    // If `distutils` already imports inside the venv, we're done.
    const distImport = spawnSync(
      venvPython,
      ["-c", "import distutils; print('ok')"],
      { encoding: "utf8", shell: true }
    );
    if (
      distImport &&
      distImport.status === 0 &&
      String(distImport.stdout || "").includes("ok")
    ) {
      console.log(
        style("venv already provides distutils; no shim needed.", COLORS.green)
      );
      const env = { npm_config_python: venvPython };
      const binDir = isWin
        ? path.join(venvDir, "Scripts")
        : path.join(venvDir, "bin");
      env.PATH = binDir + path.delimiter + (process.env.PATH || "");
      return env;
    }

    // Helper to test for setuptools._distutils presence via importlib.find_spec
    const checkSetuptools = (cmd) => {
      try {
        const out = spawnSync(venvPython, ["-c", cmd], {
          encoding: "utf8",
          shell: true,
        });
        if (out && out.status === 0 && out.stdout) {
          const v = String(out.stdout || "")
            .trim()
            .split("\n")
            .pop();
          return v === "True" || v === "true";
        }
      } catch (e) {}
      return false;
    };

    let hasSetups = checkSetuptools(
      "import importlib.util;print(importlib.util.find_spec('setuptools._distutils') is not None)"
    );
    if (!hasSetups) {
      console.log(
        style(
          "setuptools._distutils not present; attempting to reinstall/upgrade setuptools inside venv...",
          COLORS.yellow
        )
      );
      const reinst = spawnSync(
        venvPython,
        [
          "-m",
          "pip",
          "install",
          "--upgrade",
          "--force-reinstall",
          "setuptools",
        ],
        { stdio: "inherit", shell: true }
      );
      if (reinst && reinst.status === 0) {
        hasSetups = checkSetuptools(
          "import importlib.util;print(importlib.util.find_spec('setuptools._distutils') is not None)"
        );
      } else {
        console.warn(
          style("Failed to reinstall setuptools inside venv.", COLORS.yellow)
        );
      }
    }

    if (!hasSetups) {
      console.warn(
        style(
          "setuptools._distutils still not available inside venv after upgrade — cannot create a useful shim.",
          COLORS.yellow
        )
      );
      return null;
    }

    console.log(
      style(
        "setuptools._distutils present; creating distutils shim that re-exports it.",
        COLORS.cyan
      )
    );

    // Try multiple ways to find the venv's site-packages directory.
    let sitePkg = null;
    const candidatesCmds = [
      "import sysconfig;print(sysconfig.get_paths().get('purelib',''))",
      "import site;print(site.getsitepackages()[0] if site.getsitepackages() else '')",
      "import sys;print(f'{sys.prefix}/lib/python{sys.version_info.major}.{sys.version_info.minor}/site-packages')",
    ];
    for (const cmd of candidatesCmds) {
      try {
        const out = spawnSync(venvPython, ["-c", cmd], {
          encoding: "utf8",
          shell: true,
        });
        if (out && out.status === 0 && out.stdout) {
          const candidate = String(out.stdout || "")
            .trim()
            .split("\n")
            .pop();
          if (candidate && !candidate.toLowerCase().includes("traceback")) {
            sitePkg = candidate;
            break;
          }
        }
      } catch (e) {
        // ignore and try next
      }
    }
    if (!sitePkg) {
      // Fallback: inspect the venv directory tree for a site-packages folder
      try {
        const libParent = isWin
          ? path.join(venvDir, "Lib")
          : path.join(venvDir, "lib");
        if (fs.existsSync(libParent)) {
          const children = fs.readdirSync(libParent, { withFileTypes: true });
          for (const c of children) {
            if (!c.isDirectory()) continue;
            const name = c.name;
            const candidate = isWin
              ? path.join(libParent, "site-packages")
              : path.join(libParent, name, "site-packages");
            if (fs.existsSync(candidate)) {
              sitePkg = candidate;
              break;
            }
          }
        }
      } catch (e) {
        // ignore and fall through to warning
      }
    }
    if (!sitePkg) {
      console.warn(
        style(
          "Could not determine site-packages path inside venv.",
          COLORS.yellow
        )
      );
      return null;
    }
    const distutilsDir = path.join(sitePkg, "distutils");
    try {
      fs.mkdirSync(distutilsDir, { recursive: true });
      fs.writeFileSync(
        path.join(distutilsDir, "__init__.py"),
        "from setuptools._distutils import *\n",
        "utf8"
      );
      fs.writeFileSync(
        path.join(distutilsDir, "version.py"),
        "from setuptools._distutils.version import *\n",
        "utf8"
      );
      console.log(
        style(`Wrote distutils shim into venv: ${distutilsDir}`, COLORS.green)
      );
    } catch (e) {
      console.warn(
        style(
          `Failed to write distutils shim: ${e && e.message}`,
          COLORS.yellow
        )
      );
      return null;
    }

    // Re-check import
    const recheck = spawnSync(
      venvPython,
      ["-c", "import distutils; print(distutils.__file__)"],
      { encoding: "utf8", shell: true }
    );
    if (recheck && recheck.status === 0 && recheck.stdout) {
      console.log(
        style("distutils shim importable inside venv.", COLORS.green)
      );
      const env = { npm_config_python: venvPython };
      const binDir = isWin
        ? path.join(venvDir, "Scripts")
        : path.join(venvDir, "bin");
      env.PATH = binDir + path.delimiter + (process.env.PATH || "");
      return env;
    }

    console.warn(
      style(
        "Shim installation did not produce an importable distutils.",
        COLORS.yellow
      )
    );
    return null;
  } catch (e) {
    console.warn(
      style(`Auto-venv attempt failed: ${e && e.message}`, COLORS.yellow)
    );
    return null;
  }
}
function atomicInstallNodePty() {
  try {
    const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "webfm-node-pty-"));
    console.log(
      style(`Installing node-pty into temp dir: ${tmpBase}`, COLORS.cyan)
    );
    const args = [
      "--prefix",
      tmpBase,
      "install",
      "node-pty",
      "prebuild-install",
      "--save-optional",
      "--loglevel",
      "verbose",
    ];
    // Run npm but capture output to avoid flooding the console with verbose
    // npm/electron/node-gyp logs. The full log is written to a cache file for
    // later inspection, and print a concise summary here.
    const res = spawnSync("npm", args, {
      stdio: "pipe",
      shell: true,
      env: process.env,
    });

    const out = (res.stdout || "").toString();
    const err = (res.stderr || "").toString();
    const combined = `${out}\n${err}`;

    // Ensure a cache dir for logs exists and write the full log
    try {
      const logDir = path.join(__dirname, "..", ".node-pty-cache");
      fs.mkdirSync(logDir, { recursive: true });
      const logPath = path.join(logDir, "prebuild-install.log");
      fs.writeFileSync(logPath, combined, "utf8");
      // Print concise summary
      if (res.error || res.status !== 0) {
        console.error(
          style("Temporary install failed (see log):", COLORS.red),
          logPath
        );
        // print a short tail of stderr to aid quick debugging
        if (err) console.error(err.split(/\r?\n/).slice(-10).join("\n"));
        try {
          spawnSync("rm", ["-rf", tmpBase], { stdio: "ignore" });
        } catch (e) {}
        return false;
      } else {
        // Count warnings heuristically
        const warningMatches = combined.match(/warning[:\s]|warning\)/gi);
        const warnings = warningMatches ? warningMatches.length : 0;
        if (warnings > 0) {
          console.log(
            style(
              `Temporary install completed with ${warnings} warnings (log: ${logPath})`,
              COLORS.yellow
            )
          );
        } else {
          console.log(
            style("Temporary install completed successfully", COLORS.green)
          );
        }
      }
    } catch (e) {
      // If log write failed, fall back to printing error and continue
      if (res.error || res.status !== 0) {
        console.error(style("Temporary install failed.", COLORS.red));
        try {
          spawnSync("rm", ["-rf", tmpBase], { stdio: "ignore" });
        } catch (e2) {}
        return false;
      }
    }

    const src = path.join(tmpBase, "node_modules", "node-pty");
    const destRoot = path.join(
      __dirname,
      "..",
      "packages",
      "server",
      "node_modules"
    );
    const dest = path.join(destRoot, "node-pty");

    // ensure destRoot exists
    try {
      fs.mkdirSync(destRoot, { recursive: true });
    } catch (e) {}

    const backup = dest + "-OLD-TO-REPLACE";
    let movedBackup = false;
    if (fs.existsSync(dest)) {
      try {
        fs.renameSync(dest, backup);
        movedBackup = true;
      } catch (e) {
        console.warn(
          style(
            `Could not rename existing node-pty to backup: ${e.message}`,
            COLORS.yellow
          )
        );
        // proceed but fail the final rename if dest still exists
      }
    }

    try {
      const moved = moveOrCopySync(src, dest);
      if (!moved) throw new Error("moveOrCopySync failed");
    } catch (e) {
      console.error(
        style(
          `Could not move new node-pty into place: ${e && e.message}`,
          COLORS.red
        )
      );
      // Attempt to restore backup if present
      try {
        if (movedBackup && !fs.existsSync(dest) && fs.existsSync(backup)) {
          try {
            fs.renameSync(backup, dest);
          } catch (re) {
            // If rename fails (EXDEV) try copy restore
            try {
              moveOrCopySync(backup, dest);
            } catch (re2) {}
          }
        }
      } catch (e2) {
        console.error(
          style(
            `Failed to restore backup after failed move: ${e2 && e2.message}`,
            COLORS.red
          )
        );
      }
      try {
        spawnSync("rm", ["-rf", tmpBase], { stdio: "ignore" });
      } catch (e) {}
      return false;
    }

    // New install succeeded; remove backup and tmp
    if (movedBackup && fs.existsSync(backup)) {
      try {
        spawnSync("rm", ["-rf", backup], { stdio: "ignore" });
      } catch (e) {}
    }
    try {
      spawnSync("rm", ["-rf", tmpBase], { stdio: "ignore" });
    } catch (e) {}
    console.log(style(`node-pty installed into ${dest}`, COLORS.green));
    return true;
  } catch (e) {
    console.error(
      style(`atomicInstallNodePty exception: ${e && e.message}`, COLORS.red)
    );
    return false;
  }
}

async function main() {
  const only = process.argv[2] || "both"; // 'node', 'electron', 'both'
  const arch = process.arch || "x64";
  const electronVersion = readElectronVersion();

  // Support early --apply-fixes so fixes run before any prebuild attempts.
  // If the user requested automatic fixes, perform a conservative set of
  // repairs (remove per-package lockfiles, remove stale node-pty folder,
  // then run a per-package install) before running prebuild/install steps.
  const applyFixesEarly = process.argv.includes("--apply-fixes");
  const assumeYesEarly = process.argv.includes("--yes") || process.env.CI;
  if (applyFixesEarly) {
    console.log(
      style(
        "--apply-fixes detected: running safe fixes BEFORE prebuild attempts",
        COLORS.cyan
      )
    );
    try {
      const serverPkgLock = path.join(
        __dirname,
        "..",
        "packages",
        "server",
        "package-lock.json"
      );
      const serverDotLock = path.join(
        __dirname,
        "..",
        "packages",
        "server",
        ".package-lock.json"
      );
      const serverNodeModulesNodePty = path.join(
        __dirname,
        "..",
        "packages",
        "server",
        "node_modules",
        "node-pty"
      );

      for (const f of [serverPkgLock, serverDotLock]) {
        if (fs.existsSync(f)) {
          try {
            fs.unlinkSync(f);
            console.log(style(`Removed lockfile: ${f}`, COLORS.green));
          } catch (e) {
            console.warn(
              style(`Could not remove ${f}: ${e.message}`, COLORS.yellow)
            );
          }
        }
      }

      if (fs.existsSync(serverNodeModulesNodePty)) {
        try {
          const tmp = serverNodeModulesNodePty + "-OLD-TO-REPLACE";
          fs.renameSync(serverNodeModulesNodePty, tmp);
          spawnSync("rm", ["-rf", tmp], { stdio: "inherit" });
          console.log(
            style(`Removed stale ${serverNodeModulesNodePty}`, COLORS.green)
          );
        } catch (e) {
          console.warn(
            style(
              `Could not remove ${serverNodeModulesNodePty}: ${e.message}`,
              COLORS.yellow
            )
          );
        }
      }

      console.log(
        style(
          "Running per-package install to fetch node-pty before prebuild attempts...",
          COLORS.cyan
        )
      );
      if (!atomicInstallNodePty()) {
        console.error(
          style(
            "Per-package install (early) failed — prebuild runs may still error.",
            COLORS.red
          )
        );
      }
    } catch (e) {
      console.warn(
        style(`apply-fixes early failed: ${e && e.message}`, COLORS.yellow)
      );
    }
  }

  // Print a short probe summary upfront so developers see what Python
  // candidates were detected regardless of whether they later bypass the
  // check or the prebuild runs and produces verbose build logs.
  probePythonCandidates();
  if (PROBED_PYTHONS && PROBED_PYTHONS.length) {
    console.log(style("\n[python probe] detected candidates:", COLORS.cyan));
    for (const p of PROBED_PYTHONS) {
      console.log(
        `  - ${style(p.python, COLORS.yellow)} : ${
          p.version || "<no version detected>"
        }  distutils:${
          p.hasDist ? style("yes", COLORS.green) : style("no", COLORS.red)
        }`
      );
    }
  } else {
    console.log(
      style(
        "\n[python probe] no python executables found in PATH (tried python3, python)",
        COLORS.yellow
      )
    );
  }

  if (process.env.WEBFM_IGNORE_PYTHON_CHECK) {
    console.log(
      style(
        `[env] WEBFM_IGNORE_PYTHON_CHECK=${process.env.WEBFM_IGNORE_PYTHON_CHECK}`,
        COLORS.yellow
      )
    );
  }
  if (process.argv.includes("--ignore-python-check")) {
    console.log(
      style(
        "[argv] --ignore-python-check passed (skipping python check)",
        COLORS.yellow
      )
    );
  }

  // If user requested auto-venv, attempt it now. On success we merge the
  // returned env overrides into process.env so subsequent npm/node-gyp calls
  // pick up the venv Python and PATH.
  const autoVenvEnv = tryAutoVenv();
  if (autoVenvEnv) {
    console.log(
      style(
        "Auto-venv setup succeeded; using venv Python for builds.",
        COLORS.green
      )
    );
    process.env = { ...process.env, ...autoVenvEnv };
    // Re-run probe to show updated status (if any)
    probePythonCandidates();
  }

  // Pre-check: ensure a Python runtime with `distutils` is available for
  // node-gyp. If missing, provide actionable instructions and exit early.
  // Support an --auto-env flag that will try to create an isolated venv with
  // a distutils shim and point npm/node-gyp at it so builds can proceed
  // automatically on systems like macOS with Python 3.14+.
  const autoEnv =
    process.argv.includes("--auto-env") ||
    String(process.env.WEBFM_AUTO_ENV || "") === "1";

  if (!checkPythonDistutils()) {
    if (autoEnv) {
      console.log(
        style(
          "distutils not found — attempting to create an isolated venv (--auto-env)",
          COLORS.cyan
        )
      );
      const ok = createAutoVenv();
      if (ok) {
        // Re-probe python candidates and continue if success
        probePythonCandidates();
      }
    }
  }

  // If still missing, fall back to printing instructions and exit.
  if (!checkPythonDistutils()) {
    console.error(
      style(
        "\nERROR: Python `distutils` module not found. node-gyp requires a Python runtime that exposes `distutils`.",
        COLORS.bold,
        COLORS.red
      )
    );

    console.error(
      style("\nProbed Python candidates:", COLORS.cyan, COLORS.bold)
    );
    if (PROBED_PYTHONS && PROBED_PYTHONS.length) {
      for (const p of PROBED_PYTHONS) {
        console.error(
          `  - ${style(p.python, COLORS.yellow)} : ${
            p.version || "<no version detected>"
          }  distutils:${
            p.hasDist ? style("yes", COLORS.green) : style("no", COLORS.red)
          }`
        );
      }
    } else {
      console.error(
        style(
          "  (no python executables found in PATH: tried python3, python)",
          COLORS.yellow
        )
      );
    }

    console.error(
      style(
        "\nSuggested fixes (pick the one appropriate for your platform):",
        COLORS.yellow,
        COLORS.bold
      )
    );
    const plt = process.platform;
    if (plt === "darwin") {
      console.error(
        style(
          "\nmacOS (recommended: non-downgrade workarounds)",
          COLORS.cyan,
          COLORS.bold
        )
      );
      console.error(
        style(
          "  Option A — create a small local 'distutils' shim (no Python reinstall):",
          COLORS.cyan
        )
      );
      console.error(
        style(
          "    # upgrade setuptools which bundles a compatible _distutils implementation:",
          COLORS.yellow
        )
      );
      console.error(
        style(
          "    python3 -m pip install --upgrade pip setuptools wheel",
          COLORS.green
        )
      );
      console.error("");
      console.error(
        style(
          "    # Create a tiny shim inside your active Python (works in a venv or system Python):",
          COLORS.yellow
        )
      );
      console.error(style("    python - <<'PY'", COLORS.green));
      console.error(style("import sys, pathlib", COLORS.green));
      console.error(
        style(
          'sp = pathlib.Path(sys.prefix) / f"lib/python{sys.version_info.major}.{sys.version_info.minor}/site-packages"',
          COLORS.green
        )
      );
      console.error(style("d = sp / 'distutils'", COLORS.green));
      console.error(
        style("d.mkdir(parents=True, exist_ok=True)", COLORS.green)
      );
      console.error(
        style(
          "(d / '__init__.py').write_text(\"from setuptools._distutils import *\\n\")",
          COLORS.green
        )
      );
      console.error(
        style(
          "(d / 'version.py').write_text(\"from setuptools._distutils.version import *\\n\")",
          COLORS.green
        )
      );
      console.error(
        style("print('Wrote distutils shim to:', d)", COLORS.green)
      );
      console.error(style("PY", COLORS.green));
      console.error("");
      console.error(
        style("    # verify the shim is importable:", COLORS.yellow)
      );
      console.error(
        style(
          '    python3 -c "import distutils; print(distutils.__file__)"',
          COLORS.green
        )
      );
      console.error(
        style(
          "    # If that works, point npm/node-gyp to your python binary:",
          COLORS.yellow
        )
      );
      console.error(
        style(
          '    export npm_config_python="$(which python3)"  # then run your install or helper in this shell',
          COLORS.green
        )
      );
      console.error("");
      console.error(
        style(
          "  Option B — if getting `error: externally-managed-environment` with option A, use an isolated virtualenv (safe, no global changes):",
          COLORS.cyan
        )
      );
      console.error(style("    python3 -m venv .venv", COLORS.green));
      console.error(style("    source .venv/bin/activate", COLORS.green));
      console.error(
        style("    pip install --upgrade pip setuptools wheel", COLORS.green)
      );
      console.error("");
      console.error(
        style(
          "    # Create the distutils shim inside the venv (see Option A for the python heredoc)",
          COLORS.yellow
        )
      );
      console.error(
        style(
          "    # then point npm/node-gyp to the venv python:",
          COLORS.yellow
        )
      );
      console.error(
        style(
          '    export npm_config_python="$(which python)"  # then run your install or helper in this shell',
          COLORS.green
        )
      );
      console.error("");
    } else if (plt === "linux") {
      console.error(
        style(
          "\nLinux (Ubuntu/Debian-focused instructions)",
          COLORS.cyan,
          COLORS.bold
        )
      );
      console.error(
        style(
          "  Option A — install the distribution distutils package (if available):",
          COLORS.cyan
        )
      );
      console.error(style("    sudo apt update", COLORS.green));
      console.error(
        style(
          "    sudo apt install -y build-essential python3-distutils python3-dev",
          COLORS.green
        )
      );
      console.error(
        style(
          "    python3 -m pip install --upgrade pip setuptools wheel",
          COLORS.green
        )
      );
      console.error(
        style(
          "    export npm_config_python=/usr/bin/python3  # for this shell session",
          COLORS.green
        )
      );
      console.error("");
      console.error(
        style(
          "  Option B — use a virtualenv and create the distutils shim if the distro package isn't available:",
          COLORS.cyan
        )
      );
      console.error(
        style(
          "    python3 -m venv .venv && source .venv/bin/activate",
          COLORS.green
        )
      );
      console.error(
        style("    pip install --upgrade pip setuptools wheel", COLORS.green)
      );
      console.error(
        style(
          "    # create the shim inside the activated venv (see macOS Option A python heredoc)",
          COLORS.yellow
        )
      );
      console.error("");
    } else if (plt === "win32") {
      console.error(
        style("\nWindows (Visual Studio + Python)", COLORS.cyan, COLORS.bold)
      );
      console.error(
        style(
          "  - Install 'Desktop development with C++' workload in Visual Studio or the Build Tools",
          COLORS.cyan
        )
      );
      console.error(
        style(
          "  - Install a recent Python 3 (3.11+) from the official installer and add it to PATH",
          COLORS.cyan
        )
      );
      console.error(
        style(
          "  - Then install the distutils shim in the active Python: python -m pip install --upgrade pip setuptools wheel distutils",
          COLORS.yellow
        )
      );
      console.error(
        style(
          '  - set npm_config_python=C:\\Path\\to\\python.exe  # (Windows CMD) for this session; use setx to persist, or PowerShell: $env:npm_config_python="C:\\Path\\to\\python.exe"',
          COLORS.green
        )
      );
      console.error("");
    } else {
      console.error(
        style(
          "\nGeneric: try the virtualenv approach or see misc/README.md for details",
          COLORS.yellow
        )
      );
      console.error(
        style(
          "  python3 -m venv .venv && source .venv/bin/activate",
          COLORS.green
        )
      );
      console.error(
        style("  pip install --upgrade pip setuptools wheel", COLORS.green)
      );
      console.error(
        style(
          "  # create the distutils shim inside the venv (see macOS Option A python heredoc)",
          COLORS.yellow
        )
      );
    }

    console.error(
      style(
        "\nIf you cannot change the Python runtime right now, you can bypass this check and try the prebuild anyway by setting:",
        COLORS.yellow
      )
    );
    console.error(
      style(
        "  WEBFM_IGNORE_PYTHON_CHECK=1 node misc/prebuild-node-pty.js",
        COLORS.yellow
      )
    );

    console.error(
      style(
        "\nExiting so you can fix the Python environment and avoid a noisy node-gyp failure.",
        COLORS.yellow
      )
    );
    process.exit(3);
  }

  if (only === "node" || only === "both") {
    const status = runPrebuild(
      { npm_config_runtime: "node", npm_config_arch: arch },
      "Node"
    );
    if (status !== 0) {
      analyzePrebuildFailure("Node");
      process.exit(status);
    }
  }

  if (only === "electron" || only === "both") {
    const status = runPrebuild(
      {
        npm_config_runtime: "electron",
        npm_config_target: electronVersion,
        npm_config_arch: arch,
        npm_config_disturl: "https://electronjs.org/headers",
      },
      `Electron (v${electronVersion})`
    );
    if (status !== 0) {
      // First attempt: analyze what went wrong.
      analyzePrebuildFailure(`Electron (v${electronVersion})`);
      // Try an electron-rebuild as a best-effort to produce a binary for
      // the Electron runtime (useful for local dev). If that succeeds,
      // continue; otherwise exit with the original status.
      const rebuilt = runElectronRebuild(electronVersion, arch);
      if (!rebuilt) {
        process.exit(status);
      }
      // If electron-rebuild succeeded, continue and let verification run
      // to confirm the native addon is now loadable.
    }
  }

  console.log("\nAll prebuild steps finished.");

  // Verification: ensure the optional native addon is present and can be
  // required from the server package. If verification fails, print
  // actionable troubleshooting steps for the developer.
  // Verification: be hoist-tolerant. First try a plain require('node-pty')
  // (covers hoisted installs or root-level node_modules). If that fails,
  // fall back to the package-local path (packages/server/node_modules/node-pty).
  const tryRequire = (name) => {
    try {
      return { ok: true, module: require(name) };
    } catch (e) {
      return { ok: false, error: e };
    }
  };

  // If --apply-fixes was passed, perform safe, opt-in repository repairs
  // that mirror the manual steps used during diagnosis. Use --yes to skip
  // interactive confirmation. Without --apply-fixes we only print what we'd do.
  const applyFixes = process.argv.includes("--apply-fixes");
  const assumeYes = process.argv.includes("--yes") || process.env.CI;

  async function confirm(prompt) {
    if (assumeYes) return true;
    return new Promise((resolve) => {
      process.stdout.write(prompt + " [y/N]: ");
      process.stdin.setEncoding("utf8");
      process.stdin.once("data", (d) => {
        const v = String(d || "")
          .trim()
          .toLowerCase();
        resolve(v === "y" || v === "yes");
      });
    });
  }

  async function performFixes() {
    console.log(
      style("\n-- apply-fixes: starting automatic fixes", COLORS.cyan)
    );
    const serverPkgLock = path.join(
      __dirname,
      "..",
      "packages",
      "server",
      "package-lock.json"
    );
    const serverDotLock = path.join(
      __dirname,
      "..",
      "packages",
      "server",
      ".package-lock.json"
    );
    const serverNodeModulesNodePty = path.join(
      __dirname,
      "..",
      "packages",
      "server",
      "node_modules",
      "node-pty"
    );
    const serverPkg = path.join(
      __dirname,
      "..",
      "packages",
      "server",
      "package.json"
    );

    // 1) Remove per-package lockfiles that may contain stale placeholder entries
    for (const f of [serverPkgLock, serverDotLock]) {
      if (fs.existsSync(f)) {
        try {
          fs.unlinkSync(f);
          console.log(style(`Removed lockfile: ${f}`, COLORS.green));
        } catch (e) {
          console.warn(
            style(`Could not remove ${f}: ${e.message}`, COLORS.yellow)
          );
        }
      }
    }

    // 2) Remove any stale node-pty directory inside packages/server/node_modules
    if (fs.existsSync(serverNodeModulesNodePty)) {
      try {
        // conservative removal: rename then rm -rf
        const tmp = serverNodeModulesNodePty + "-OLD-TO-REPLACE";
        fs.renameSync(serverNodeModulesNodePty, tmp);
        const rm = spawnSync("rm", ["-rf", tmp], { stdio: "inherit" });
        console.log(
          style(`Removed stale ${serverNodeModulesNodePty}`, COLORS.green)
        );
      } catch (e) {
        console.warn(
          style(
            `Could not remove ${serverNodeModulesNodePty}: ${e.message}`,
            COLORS.yellow
          )
        );
      }
    }

    // 3) Ensure packages/server/package.json doesn't force a postinstall that
    // triggers node-gyp in the server root (no binding.gyp there). If present,
    // remove it (we keep an explicit "prebuild-node-pty" script for manual runs).
    try {
      if (fs.existsSync(serverPkg)) {
        const txt = fs.readFileSync(serverPkg, "utf8");
        const json = JSON.parse(txt);
        if (json.scripts && json.scripts.postinstall) {
          delete json.scripts.postinstall;
          fs.writeFileSync(
            serverPkg,
            JSON.stringify(json, null, 2) + "\n",
            "utf8"
          );
          console.log(
            style(
              "Removed packages/server package.json postinstall script",
              COLORS.green
            )
          );
        }
      }
    } catch (e) {
      console.warn(
        style(
          `Could not update packages/server/package.json: ${e.message}`,
          COLORS.yellow
        )
      );
    }

    // 4) Run per-package install to fetch node-pty and run its install hooks
    console.log(
      style(
        "Running: npm --prefix packages/server install node-pty prebuild-install --save-optional --loglevel verbose",
        COLORS.cyan
      )
    );
    if (!atomicInstallNodePty()) {
      console.error(
        style("Per-package install failed — inspect output above.", COLORS.red)
      );
      return false;
    }

    // Ensure nan is installed for node-pty
    console.log(
      style("Ensuring nan is installed for node-pty...", COLORS.cyan)
    );
    // Run `npm install nan` with captured output to keep logs concise.
    try {
      const nanArgs = [
        "--prefix",
        "packages/server",
        "install",
        "nan",
        "--loglevel",
        "verbose",
      ];
      const nanRes = spawnSync("npm", nanArgs, {
        stdio: "pipe",
        shell: true,
        env: process.env,
      });
      const nanOut = (nanRes.stdout || "").toString();
      const nanErr = (nanRes.stderr || "").toString();
      const nanCombined = `${nanOut}\n${nanErr}`;
      try {
        const logDir = path.join(__dirname, "..", ".node-pty-cache");
        fs.mkdirSync(logDir, { recursive: true });
        const nanLog = path.join(logDir, "prebuild-install-nan.log");
        fs.writeFileSync(nanLog, nanCombined, "utf8");
        if (nanRes.error || nanRes.status !== 0) {
          console.warn(
            style("Failed to install nan (see log):", COLORS.yellow),
            nanLog
          );
          if (nanErr) console.warn(nanErr.split(/\r?\n/).slice(-10).join("\n"));
        }
      } catch (e) {
        if (nanRes.error || nanRes.status !== 0) {
          console.warn(
            style("Failed to install nan, but continuing.", COLORS.yellow)
          );
        }
      }
    } catch (e) {
      console.warn(
        style("Failed to install nan, but continuing.", COLORS.yellow)
      );
    }

    return true;
  }

  if (applyFixes) {
    console.log(
      style(
        "--apply-fixes requested. This will perform safe repo changes and run a per-package install.",
        COLORS.yellow
      )
    );
    if (!assumeYes) {
      const ok = await confirm(
        "Proceed with automatic fixes (will remove per-package lockfile(s) and run npm install)"
      );
      if (!ok) {
        console.log(style("Aborting apply-fixes.", COLORS.yellow));
      } else {
        await performFixes();
      }
    } else {
      await performFixes();
    }
  }

  // Verification: hoist-tolerant resolution
  let ok = false;
  let mod = null;

  // 1) Try plain require (covers hoisted/root installs)
  const r1 = tryRequire("node-pty");
  if (r1.ok) {
    ok = true;
    mod = r1.module;
    console.log(
      "\nnode-pty verification: OK — require('node-pty') succeeded (hoisted or root install)."
    );
  } else {
    // 2) Try requiring the package-local path used by the server
    try {
      const localPath = path.join(
        __dirname,
        "..",
        "packages",
        "server",
        "node_modules",
        "node-pty"
      );
      const p = require.resolve(localPath);
      const r2 = tryRequire(p);
      if (r2.ok) {
        ok = true;
        mod = r2.module;
        console.log(
          "\nnode-pty verification: OK — local package require() succeeded."
        );
      }
    } catch (e) {
      // ignore
    }
  }

  if (ok) {
    if (mod && mod.spawn) console.log("node-pty API looks available.");
    // Write a small marker file so future `npm install` runs can quickly
    // skip the heavy prebuild helper when the addon is already verified.
    try {
      const marker = {
        nodeVersion: process.version,
        modulesAbi: process.versions && process.versions.modules,
        pid: process.pid,
        timestamp: Date.now(),
      };
      try {
        // Try to record the installed node-pty package version if resolvable.
        const pkgJsonPath = require.resolve("node-pty/package.json");
        const pkg = JSON.parse(require("fs").readFileSync(pkgJsonPath, "utf8"));
        marker.nodePtyVersion = pkg && pkg.version;
      } catch (err) {
        // ignore
      }
      const markerPath = path.join(
        __dirname,
        "..",
        "packages",
        "server",
        ".node-pty-ready.json"
      );
      try {
        require("fs").writeFileSync(
          markerPath,
          JSON.stringify(marker, null, 2),
          { mode: 0o644 }
        );
        console.log(`Wrote node-pty ready marker: ${markerPath}`);
      } catch (err) {
        // best-effort; do not fail the script
        // console.warn("Could not write node-pty marker:", err && err.message);
      }
    } catch (err) {
      // ignore marker errors
    }
    process.exit(0);
  }

  console.error(
    style(
      "\nnode-pty verification: FAILED — could not load the native addon via hoisted or local paths.",
      COLORS.red,
      COLORS.bold
    )
  );
  console.error(
    style(
      "Suggested next steps (the helper can apply fixes with --apply-fixes --yes):",
      COLORS.yellow
    )
  );
  console.error(
    style("  ", COLORS.reset) +
      style("1)", COLORS.cyan) +
      style(
        " Re-run the verbose install and capture output to find download/build errors:",
        COLORS.yellow
      )
  );
  console.error(
    "     " +
      style(
        "npm --prefix packages/server install node-pty prebuild-install --save-optional --loglevel verbose > prebuild-install.log 2>&1 && tail -n 200 prebuild-install.log",
        COLORS.green
      )
  );
  console.error(
    style("  ", COLORS.reset) +
      style("2)", COLORS.cyan) +
      style(" Inspect npm debug logs:", COLORS.yellow)
  );
  console.error(
    "     " +
      style(
        'ls -1 ~/.npm/_logs | tail -n 5 && tail -n 200 "~/.npm/_logs/$(ls -1 ~/.npm/_logs | tail -n 1)"',
        COLORS.green
      )
  );
  console.error(
    style("  ", COLORS.reset) +
      style("3)", COLORS.cyan) +
      style(
        " Run the server prebuild script directly inside the server package (Node/Electron targets):",
        COLORS.yellow
      )
  );
  console.error(
    "     " +
      style(
        "cd packages/server && npm run prebuild-node-pty --loglevel verbose",
        COLORS.green
      )
  );
  console.error(
    style("  ", COLORS.reset) +
      style("4)", COLORS.cyan) +
      style(
        " If the prebuild falls back to building from source, ensure you have the native toolchain installed (Xcode CLT on macOS, build-essential/python on Linux, or Visual Studio Build Tools on Windows).",
        COLORS.yellow
      )
  );
  console.error(
    style("  ", COLORS.reset) +
      style("5)", COLORS.cyan) +
      style(
        " If you see stale placeholder entries in per-package lockfiles, remove them and reinstall. The helper can attempt this with --apply-fixes --yes.",
        COLORS.yellow
      )
  );
  console.error(
    style("  ", COLORS.reset) +
      style("6)", COLORS.cyan) +
      style(
        " As a last resort you can attempt a forced source rebuild:",
        COLORS.yellow
      )
  );
  console.error(
    "     " +
      style(
        "cd packages/server && npm install --save-optional node-pty prebuild-install --loglevel verbose && npx node-gyp rebuild --verbose",
        COLORS.green
      )
  );
  process.exit(2);
}

main();
