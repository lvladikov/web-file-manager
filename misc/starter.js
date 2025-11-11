#!/usr/bin/env node
// Interactive starter helper that lists and runs common project tasks.
// Usable from postinstall runner, start scripts (start.sh/.bat/.ps1) or directly.

const { spawnSync } = require("child_process");
const path = require("path");

const platform = process.platform; // 'darwin' | 'linux' | 'win32'

function printOptions(options) {
  console.log("\nNext steps you can perform:");
  for (let i = 0; i < options.length; i++) {
    console.log(`  ${i + 1}) ${options[i].label}`);
  }
  console.log(`  ${options.length + 1}) Exit`);
}

function runShellCommand(cmd, opts = {}) {
  console.log(`\nRunning: ${cmd}`);
  try {
    const r = spawnSync(cmd, { stdio: "inherit", shell: true, ...opts });
    if (r.error) console.error("[starter] Error:", r.error.message);
    return r.status || 0;
  } catch (e) {
    console.error("[starter] Exception while running command:", e && e.message);
    return 1;
  }
}

function buildOptions() {
  const options = [];

  // Start Node app
  if (platform === "win32") {
    options.push({
      label: "Start Node app (Windows) using start.bat",
      cmd: "start.bat",
    });
    options.push({
      label: "Start Node app (Windows PowerShell) using start.ps1",
      cmd: "powershell -ExecutionPolicy Bypass -File start.ps1",
    });
  } else {
    options.push({
      label: "Start Node app using npm run dev",
      cmd: "npm run dev",
    });
  }

  // Run Electron dev
  options.push({
    label: "Run Electron (development): npm run electron:dev",
    cmd: "npm run electron:dev",
  });

  // Build Electron for OS
  if (platform === "darwin") {
    options.push({
      label: "Build Electron (macOS): npm run electron:dist:mac",
      cmd: "npm run electron:dist:mac",
    });
  } else if (platform === "win32") {
    options.push({
      label: "Build Electron (Windows): npm run electron:dist:win",
      cmd: "npm run electron:dist:win",
    });
  } else if (platform === "linux") {
    options.push({
      label: "Build Electron (Linux): npm run electron:dist:linux",
      cmd: "npm run electron:dist:linux",
    });
  }

  // Build all
  options.push({
    label: "Build Electron (all platforms): npm run electron:dist:all",
    cmd: "npm run electron:dist:all",
  });

  return options;
}

function isTTY() {
  return !!(
    process.stdin &&
    process.stdin.isTTY &&
    process.stdout &&
    process.stdout.isTTY
  );
}

// If this module is required, export helpers.
module.exports = {
  buildOptions,
  printOptions,
  runShellCommand,
  isTTY,
};

// If run directly, show interactive menu
if (require.main === module) {
  const options = buildOptions();

  console.log("\n=== web-file-manager starter helper ===");
  console.log(
    "This helper can launch common project tasks from the repo root."
  );

  if (!isTTY()) {
    console.log(
      "\nNot running in an interactive terminal. Available next steps:"
    );
    printOptions(options);
    console.log("\nTo run one interactively, re-run: node ./misc/starter.js");
    process.exit(0);
  }

  printOptions(options);

  process.stdout.write(
    "\nSelect an option number and press Enter (or press Enter to exit): "
  );
  process.stdin.setEncoding("utf8");
  process.stdin.once("data", (d) => {
    const raw = String(d || "").trim();
    if (!raw) {
      console.log("No selection; exiting.");
      process.exit(0);
    }
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) {
      console.log("Invalid selection; exiting.");
      process.exit(1);
    }
    if (n === options.length + 1) {
      console.log("Exit selected.");
      process.exit(0);
    }
    const idx = n - 1;
    if (idx < 0 || idx >= options.length) {
      console.log("Selection out of range; exiting.");
      process.exit(1);
    }
    const sel = options[idx];
    console.log(`Selected: ${sel.label}`);

    // Run command from repo root
    runShellCommand(sel.cmd, { cwd: path.join(__dirname, "..") });
    process.exit(0);
  });
}
