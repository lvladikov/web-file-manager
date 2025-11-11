#!/usr/bin/env node
// instrument-node-pty.js
// Small helper to insert runtime instrumentation into node-pty's pty.cc
// to log posix_spawn return codes and errno to /tmp/node-pty-posix-spawn.log
// Usage: run this after `npm install node-pty` inside packages/server
// (or after your prebuild step) while node-pty source is present at
// packages/server/node_modules/node-pty

const fs = require("fs");
const path = require("path");

function findNodePtyDir() {
  const candidates = [
    path.join(
      __dirname,
      "..",
      "packages",
      "server",
      "node_modules",
      "node-pty"
    ),
    path.join(process.cwd(), "packages", "server", "node_modules", "node-pty"),
    path.join(process.cwd(), "node_modules", "node-pty"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

const base = findNodePtyDir();
if (!base) {
  console.error(
    "Could not find node-pty package in expected locations. Install node-pty first."
  );
  process.exit(2);
}
console.log("Found node-pty at:", base);
const src = path.join(base, "src", "unix", "pty.cc");
if (!fs.existsSync(src)) {
  console.error(
    "Could not find src/unix/pty.cc inside node-pty package. Aborting."
  );
  process.exit(3);
}

const orig = src + ".orig";
if (!fs.existsSync(orig)) {
  fs.copyFileSync(src, orig);
  console.log("Backed up original to", orig);
} else {
  console.log("Backup already exists at", orig);
}

let content = fs.readFileSync(src, "utf8");
let modified = false;

// Ensure errno includes are present
if (!/\#include\s*<errno.h>/.test(content)) {
  content = content.replace(
    /(#include\s*<string.h>)/,
    "$1\n#include <errno.h>"
  );
  modified = true;
  console.log("Inserted #include <errno.h>");
}

// Look for the pty_posix_spawn function and insert logging after the
// posix_spawn invocation. Different node-pty versions implement this
// function as `static void pty_posix_spawn(...)` and set *err to the
// posix_spawn return value; detect either form.
const funcIdx = content.indexOf("pty_posix_spawn(");
if (funcIdx === -1) {
  console.error(
    'Could not locate function "pty_posix_spawn(" in pty.cc. Aborting.'
  );
  process.exit(4);
}

// Find the do/while posix_spawn loop and insert instrumentation after it
const after = content.slice(funcIdx);
const spawnWhileIdx = after.indexOf("while (*err == EINTR);");
if (spawnWhileIdx === -1) {
  console.error(
    'Could not locate posix_spawn loop ("while (*err == EINTR);") in pty_posix_spawn body. Aborting.'
  );
  process.exit(5);
}

// Compute insertion point just after the while(...); line
const insertPos = funcIdx + spawnWhileIdx + "while (*err == EINTR);".length;

// argv[1] holds the cwd (helper passes cwd as second arg). Avoid referencing
// a non-existent `cwd` variable which breaks compilation.
const instrumentation = `\n  /* BEGIN node-pty instrumentation: log posix_spawn failure details to /tmp/node-pty-posix-spawn.log */\n  do {\n    FILE *f = fopen("/tmp/node-pty-posix-spawn.log", "a");\n    if (f) {\n      fprintf(f, "[node-pty] pty_posix_spawn: posix_spawn_ret=%d errno=%d (%s) cwd=%s\\n", *err, errno, strerror(errno), (argv && argv[1]) ? argv[1] : "<null>");\n      if (argv) {\n        for (char **a = argv; *a; ++a) {\n          fprintf(f, "[node-pty] argv: %s\\n", *a);\n        }\n      }\n      if (env) {\n        for (char **e = env; *e; ++e) {\n          fprintf(f, "[node-pty] env: %s\\n", *e);\n        }\n      }\n      fclose(f);\n    }\n  } while (0);\n  /* END instrumentation */\n`;

// Inject instrumentation
content =
  content.slice(0, insertPos) + instrumentation + content.slice(insertPos);
modified = true;

if (modified) {
  fs.writeFileSync(src, content, "utf8");
  console.log("Wrote instrumented pty.cc");
  console.log("Please rebuild node-pty (see instructions).");
} else {
  console.log("No changes made.");
}

console.log("\nInstructions to rebuild (macOS, Electron):\n");
console.log("1) cd packages/server");
console.log("2) npm rebuild --build-from-source node-pty --update-binary");
console.log(
  "   OR use electron-rebuild in your build pipeline: npx electron-rebuild -f -w node-pty -v <electron-version>"
);
console.log(
  "3) Re-package and run the Electron app; check /tmp/node-pty-posix-spawn.log for instrumented output."
);
