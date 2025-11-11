#!/usr/bin/env node
// patch-node-pty-helperpath.js
// Idempotent patcher for node-pty's unixTerminal files. Adds deterministic
// helperPath resolution and normalizes duplicate `.unpacked` segments. Can be
// run interactively or as part of a build pipeline (use --prepack to force
// scanning of electron dist/app.asar.unpacked locations).

const fs = require("fs");
const path = require("path");

const argv = process.argv.slice(2);
const opts = {
  prepack: argv.includes("--prepack"),
};

// Walk the repo and collect candidate unixTerminal files to patch. We look
// for both compiled JS under lib/ and TS under src/ to support fresh installs
// and copies created during packaging.
function walk(dir, cb) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        // avoid recursing into node-pty itself to speed things up
        if (e.name === "node-pty") {
          cb(full);
          continue;
        }
        walk(full, cb);
      }
    }
  } catch (err) {
    // ignore permission errors
  }
}

function findUnixTerminalFiles(root) {
  const results = new Set();
  const repoRoot = path.resolve(__dirname, "..");
  const searchRoots = [repoRoot, process.cwd()];

  // If invoked with --prepack, make sure the electron dist path is searched
  if (opts.prepack) {
    searchRoots.push(path.join(repoRoot, "packages", "electron", "dist"));
  }

  for (const r of searchRoots) {
    walk(r, (found) => {
      // If we found a node-pty dir, check for likely target files
      const libFile = path.join(found, "lib", "unixTerminal.js");
      const srcFile = path.join(found, "src", "unixTerminal.ts");
      if (fs.existsSync(libFile)) results.add(libFile);
      if (fs.existsSync(srcFile)) results.add(srcFile);

      // Also check common packaged app unpacked locations under electron dist
      try {
        const packaged = path.join(repoRoot, "packages", "electron", "dist");
        if (fs.existsSync(packaged)) {
          const packagedEntries = fs.readdirSync(packaged, {
            withFileTypes: true,
          });
          for (const p of packagedEntries) {
            // check for app bundles or unpacked trees
            const candidate = path.join(
              packaged,
              p.name,
              "Contents",
              "Resources",
              "app.asar.unpacked"
            );
            const appNodePty = path.join(
              candidate,
              "node_modules",
              "@web-file-manager",
              "server",
              "node_modules",
              "node-pty",
              "lib",
              "unixTerminal.js"
            );
            if (fs.existsSync(appNodePty)) results.add(appNodePty);
          }
        }
      } catch (e) {
        // ignore
      }
    });
  }
  return Array.from(results);
}

// Normalize duplicate .unpacked segments: e.g. "app.asar.unpacked.unpacked" -> "app.asar.unpacked"
function normalizeUnpackedSegments(p) {
  if (!p || typeof p !== "string") return p;
  return p
    .replace(/(app\.asar(?:\.unpacked)+)/g, "app.asar.unpacked")
    .replace(
      /(node_modules\.asar(?:\.unpacked)+)/g,
      "node_modules.asar.unpacked"
    );
}

// Attempt to repair naive patterns that replace/join 'app.asar' -> 'app.asar.unpacked'
// We conservatively replace common call patterns (replace/split+join) with a
// short inline normalizer that collapses duplicate '.unpacked' segments.
function fixNaiveReplacePatterns(content) {
  if (!content || typeof content !== "string") return content;
  let out = content;

  // Inline normalizer to insert (kept compact so we can inline repeatedly)
  const inlineNormalizer = `(function(s){return (typeof s==='string'? s.replace(/(app\\.asar(?:\\.unpacked)+)/g,'app.asar.unpacked').replace(/(node_modules\\.asar(?:\\.unpacked)+)/g,'node_modules.asar.unpacked').replace(/(app\\.asar)(?!\\.unpacked)/g,'app.asar.unpacked').replace(/(node_modules\\.asar)(?!\\.unpacked)/g,'node_modules.asar.unpacked') : s)})`;

  // 1) foo.replace('app.asar','app.asar.unpacked')  (single/double quotes)
  out = out.replace(
    /([A-Za-z0-9_\$\.\[\]"']+)\.replace\(\s*(['"])app\.asar\2\s*,\s*\2app\.asar\.unpacked\2\s*\)/g,
    function (_, expr) {
      return `${inlineNormalizer}(${expr})`;
    }
  );

  // 2) foo.split('app.asar').join('app.asar.unpacked')
  out = out.replace(
    /([A-Za-z0-9_\$\.\[\]"']+)\.split\(\s*(['"])app\.asar\2\s*\)\.join\(\s*\2app\.asar\.unpacked\2\s*\)/g,
    function (_, expr) {
      return `${inlineNormalizer}(${expr})`;
    }
  );

  // Also handle node_modules.asar patterns for replace and split+join
  out = out.replace(
    /([A-Za-z0-9_\$\.\[\]"']+)\.replace\(\s*(['"])node_modules\.asar\2\s*,\s*\2node_modules\.asar\.unpacked\2\s*\)/g,
    function (_, expr) {
      return `${inlineNormalizer}(${expr})`;
    }
  );
  out = out.replace(
    /([A-Za-z0-9_\$\.\[\]"']+)\.split\(\s*(['"])node_modules\.asar\2\s*\)\.join\(\s*\2node_modules\.asar\.unpacked\2\s*\)/g,
    function (_, expr) {
      return `${inlineNormalizer}(${expr})`;
    }
  );

  return out;
}

function applyPatchToFile(target) {
  let content = fs.readFileSync(target, "utf8");
  if (content.includes("Resolve the helper path deterministically")) {
    console.log("patch-node-pty-helperpath: already patched:", target);
    return false;
  }

  const marker = "helperPath = path.resolve(__dirname, helperPath);";
  const idx = content.indexOf(marker);
  if (idx === -1) {
    console.warn("patch-node-pty-helperpath: marker not found in", target);
    return false;
  }

  const rest = content.slice(idx);
  // Try to find a reasonable cut point: the next occurrence of "var DEFAULT_FILE"
  const nextVarIdx = rest.indexOf("\nvar DEFAULT_FILE");
  if (nextVarIdx === -1) {
    // For TS sources, look for "const DEFAULT_FILE"
    const nextConstIdx = rest.indexOf("\nconst DEFAULT_FILE");
    if (nextConstIdx === -1) {
      console.warn("patch-node-pty-helperpath: unexpected layout for", target);
      return false;
    }
  }

  const replaceBlock = `helperPath = path.resolve(__dirname, helperPath);
// Resolve the helper path deterministically when running inside packaged
// Electron. Prefer the helper under <resourcesPath>/app.asar.unpacked if
// available to avoid any string-replacement edge cases that can produce
// "app.asar.unpacked.unpacked". Fall back to the resolved path when not
// running inside Electron or the candidate isn't present.
try {
  const fsLocal = require('fs');
  const pathLocal = require('path');
  const resourcesPath = (typeof process !== 'undefined' && process.resourcesPath) || null;

  function _normalizeUnpackedSegments(s) {
    if (!s || typeof s !== 'string') return s;
    return s.replace(/(app\\.asar(?:\\.unpacked)+)/g, 'app.asar.unpacked').replace(/(node_modules\\.asar(?:\\.unpacked)+)/g, 'node_modules.asar.unpacked');
  }

  if (resourcesPath) {
    const unpackBase = resourcesPath.endsWith('app.asar.unpacked')
      ? resourcesPath
      : pathLocal.join(resourcesPath, 'app.asar.unpacked');

    const candidate = pathLocal.join(
      unpackBase,
      'node_modules',
      '@web-file-manager',
      'server',
      'node_modules',
      'node-pty',
      'build',
      'Release',
      'spawn-helper'
    );
    const candidateDbg = pathLocal.join(
      unpackBase,
      'node_modules',
      '@web-file-manager',
      'server',
      'node_modules',
      'node-pty',
      'build',
      'Debug',
      'spawn-helper'
    );
    if (fsLocal.existsSync(candidate)) {
      helperPath = _normalizeUnpackedSegments(candidate);
    } else if (fsLocal.existsSync(candidateDbg)) {
      helperPath = _normalizeUnpackedSegments(candidateDbg);
    } else {
      // Try to coerce common asar -> asar.unpacked patterns, then collapse
      // any repeated ".unpacked" segments.
      if (helperPath.indexOf('app.asar') !== -1 && helperPath.indexOf('app.asar.unpacked') === -1) {
        helperPath = helperPath.replace('app.asar', 'app.asar.unpacked');
      }
      if (helperPath.indexOf('node_modules.asar') !== -1 && helperPath.indexOf('node_modules.asar.unpacked') === -1) {
        helperPath = helperPath.replace('node_modules.asar', 'node_modules.asar.unpacked');
      }
      helperPath = _normalizeUnpackedSegments(helperPath);
    }
  } else {
    helperPath = pathLocal.resolve(__dirname, helperPath);
  }
} catch (e) {
  helperPath = require('path').resolve(__dirname, helperPath);
}
`;

  // Find cut point again (compat with JS and TS variances)
  const afterIdx =
    rest.indexOf("\nvar DEFAULT_FILE") !== -1
      ? rest.indexOf("\nvar DEFAULT_FILE")
      : rest.indexOf("\nconst DEFAULT_FILE");
  const newContent =
    content.slice(0, idx) + replaceBlock + rest.slice(afterIdx + 1);
  fs.writeFileSync(target, newContent, "utf8");
  console.log("patch-node-pty-helperpath: patched", target);
  return true;
}

const files = findUnixTerminalFiles(process.cwd());
if (files.length === 0) {
  console.log(
    "patch-node-pty-helperpath: no candidate unixTerminal files found; nothing to do."
  );
  process.exit(0);
}

let patched = 0;
for (const f of files) {
  try {
    // Apply the main helperPath patch; additionally optionally fix
    // naive string-replace patterns that map 'app.asar' ->
    // 'app.asar.unpacked' which can introduce repeated '.unpacked'.
    let did = false;
    try {
      did = applyPatchToFile(f);
    } catch (e) {
      throw e;
    }
    // If enabled, try to repair naive replace/join patterns across the file
    if (opts.fixReplacePatterns) {
      try {
        const orig = fs.readFileSync(f, "utf8");
        const fixed = fixNaiveReplacePatterns(orig);
        if (fixed !== orig) {
          fs.writeFileSync(f, fixed, "utf8");
          console.log(
            "patch-node-pty-helperpath: fixed naive replace patterns in",
            f
          );
          patched += 1;
          continue;
        }
      } catch (e) {
        console.warn(
          "patch-node-pty-helperpath: failed to apply replace-pattern fixes to",
          f,
          e && e.message
        );
      }
    }
    if (did) patched += 1;
  } catch (e) {
    console.warn(
      "patch-node-pty-helperpath: error patching",
      f,
      e && e.message
    );
  }
}

console.log(
  `patch-node-pty-helperpath: completed. patched=${patched} checked=${files.length}`
);
process.exit(0);
