import { spawn as spawnChild } from "child_process";
import EventEmitter from "events";
import path from "path";
import { createRequire } from "module";

// Try to require node-pty if it's available. We use createRequire so this
// module stays ESM while still allowing a synchronous require attempt.
const require = createRequire(import.meta.url);
let nodePty = null;
let loadedNodePtyPath = null;
try {
  // First try the normal resolution. This will succeed in dev or when the
  // native addon is available on Node's module paths.
  // eslint-disable-next-line import/no-extraneous-dependencies
  nodePty = require("node-pty");
  try {
    loadedNodePtyPath = require.resolve("node-pty");
  } catch (e) {
    loadedNodePtyPath = null;
  }
} catch (e) {
  // If that fails (common when running from an asar-packed Electron app),
  // attempt a few likely filesystem locations where the build step puts
  // the node-pty package (app.asar.unpacked or nearby node_modules).
  const candidates = [];

  // If running inside Electron, process.resourcesPath points at
  // <app>.app/Contents/Resources. The build copies native artifacts into
  // app.asar.unpacked/node_modules/... which we try first.
  try {
    const resourcesPath = process.resourcesPath;
    if (resourcesPath) {
      // Common layout used by our build: app.asar.unpacked/node_modules/@web-file-manager/server/node_modules/node-pty
      candidates.push(
        path.join(
          resourcesPath,
          "app.asar.unpacked",
          "node_modules",
          "@web-file-manager",
          "server",
          "node_modules",
          "node-pty"
        )
      );
      // Fallback in case node-pty was copied directly under app.asar.unpacked/node_modules
      candidates.push(
        path.join(
          resourcesPath,
          "app.asar.unpacked",
          "node_modules",
          "node-pty"
        )
      );
    }
  } catch (err) {
    // ignore issues reading resourcesPath
  }

  // Also try a few relative locations useful during non-packaged runs
  candidates.push(path.join(process.cwd(), "node_modules", "node-pty"));
  candidates.push(path.join(process.cwd(), "..", "node_modules", "node-pty"));

  for (const cand of candidates) {
    try {
      // Attempt to require the package directory directly. If it succeeds,
      // we've located the native addon and can use it.
      nodePty = require(cand);
      loadedNodePtyPath = cand;
      console.info("[terminal-backend] node-pty loaded from:", cand);
      break;
    } catch (err) {
      // ignore and try next candidate
    }
  }

  if (!nodePty) {
    // leave nodePty as null and fall back to pipe-based terminal below
  }
}

// Developer toggle: set this to `true` to force the pipe-based fallback even
// when `node-pty` is available. This is useful for iterating on and testing
// the fallback terminal implementation without removing the native addon from
// `node_modules`. Keep `false` in normal use so `node-pty` will be used when
// available.
const FORCE_PIPE_FALLBACK = false;

// Small runtime hint to make it easy to see which backend is active in logs.
try {
  if (FORCE_PIPE_FALLBACK) {
    console.info(
      "[terminal-backend] FORCE_PIPE_FALLBACK enabled: using pipe-based fallback even if node-pty is present"
    );
  } else if (nodePty) {
    console.info(
      "[terminal-backend] node-pty loaded: native PTY will be used when available"
    );
  } else {
    console.info(
      "[terminal-backend] node-pty not available: using pipe-based fallback terminal"
    );
  }
} catch (e) {
  // avoid any accidental logging errors affecting the application
}

// Additional diagnostics when node-pty is present to help detect ABI / binary
// mismatches in packaged Electron builds. This logs resolved paths and whether
// the native .node files exist so packager/runtime mismatches are easier to
// spot during troubleshooting.
try {
  if (nodePty) {
    try {
      // Prefer any previously-recorded load path (from candidate require)
      // otherwise try a normal resolve which may succeed in dev.
      const resolved =
        loadedNodePtyPath ||
        (() => {
          try {
            return require.resolve("node-pty");
          } catch (e) {
            return null;
          }
        })();
      if (resolved)
        console.info("[terminal-backend] node-pty resolved to:", resolved);
      // If `resolved` is a file (most common: path to index.js), use
      // path.dirname(resolved). If it's already a directory (happens when
      // our candidate path was used), use it directly. This prevents
      // dropping the final `node-pty` path segment which produced an
      // incorrect build/... path earlier.
      let pkgDir;
      try {
        if (resolved) {
          const fs = require("fs");
          const st = fs.statSync(resolved);
          pkgDir = st.isDirectory() ? resolved : path.dirname(resolved);
        } else {
          pkgDir = loadedNodePtyPath || "<unknown>";
        }
      } catch (e) {
        // Fall back conservatively to dirname when in doubt
        pkgDir = resolved
          ? path.dirname(resolved)
          : loadedNodePtyPath || "<unknown>";
      }
      const release = path.join(String(pkgDir), "build", "Release", "pty.node");
      const debug = path.join(String(pkgDir), "build", "Debug", "pty.node");
      const stat = (p) => {
        try {
          const s = require("fs").statSync(p);
          return { exists: true, size: s.size };
        } catch (e) {
          return { exists: false };
        }
      };
      const rStat = stat(release);
      const dStat = stat(debug);
      console.info(
        "[terminal-backend] node-pty native binary (Release):",
        release,
        rStat.exists ? `${rStat.size} bytes` : "missing"
      );
      console.info(
        "[terminal-backend] node-pty native binary (Debug):",
        debug,
        dStat.exists ? `${dStat.size} bytes` : "missing"
      );
      // Log runtime ABI/arch info
      console.info(
        "[terminal-backend] runtime:",
        `platform=${process.platform}`,
        `arch=${process.arch}`,
        `node_modules_abi=${process.versions && process.versions.modules}`,
        `node=${process.versions && process.versions.node}`,
        `electron=${process.versions && process.versions.electron}`
      );
    } catch (e) {
      // ignore diagnostic failures
    }
  }
} catch (e) {
  // ignore
}

// Minimal terminal backend that provides a small pty-like API used by
// the app. This intentionally avoids native modules and falls back to a
// plain child_process-based implementation. It does NOT provide a real PTY
// (so interactive programs that require a TTY may behave differently), but
// it is sufficient for most non-interactive terminal use and avoids rebuild
// issues with native addons.

class TerminalProcess extends EventEmitter {
  constructor(child, isPty = false, cols = 80, rows = 30) {
    super();
    this.child = child;
    this.isPty = isPty;
    this.pid = child.pid;
    this.cols = cols;
    this.rows = rows;

    if (isPty) {
      // node-pty: listen for 'data' and 'exit' events on the pty instance.
      try {
        child.on("data", (d) => this.emit("data", d.toString()));
        child.on("exit", (code) => this.emit("exit", code, null));
        child.on("error", (err) => this.emit("error", err));
      } catch (e) {
        // ignore
      }
    } else {
      if (child.stdout) {
        try {
          child.stdout.setEncoding && child.stdout.setEncoding("utf8");
        } catch (e) {}
        child.stdout.on("data", (d) => this.emit("data", d.toString()));
      }
      if (child.stderr) {
        try {
          child.stderr.setEncoding && child.stderr.setEncoding("utf8");
        } catch (e) {}
        child.stderr.on("data", (d) => this.emit("data", d.toString()));
      }
      child.on("exit", (code, signal) => this.emit("exit", code, signal));
      child.on("error", (err) => this.emit("error", err));

      if (child.stdin) {
        try {
          child.stdin.setDefaultEncoding &&
            child.stdin.setDefaultEncoding("utf8");
        } catch (e) {}
        try {
          child.stdin.resume && child.stdin.resume();
        } catch (e) {}
      }
    }
  }

  write(data) {
    if (this.isPty && this.child && typeof this.child.write === "function") {
      // node-pty: direct write
      try {
        this.child.write(data);
      } catch (e) {
        // ignore
      }
      return;
    }

    if (this.child.stdin && !this.child.stdin.destroyed) {
      this.child.stdin.write(data);
    }
  }

  resize(cols, rows) {
    // Store the new dimensions
    this.cols = cols;
    this.rows = rows;

    // Send SIGWINCH signal to the process group so interactive programs
    // (like mc, vim, etc.) know to re-query the terminal size
    if (this.isPty && this.child && typeof this.child.resize === "function") {
      try {
        this.child.resize(cols, rows);
      } catch (e) {
        // ignore
      }
      return;
    }

    if (process.platform !== "win32" && this.child && this.child.pid) {
      try {
        // Send SIGWINCH to the entire process group (including all children)
        process.kill(-this.child.pid, "SIGWINCH");
      } catch (e) {
        // Silently ignore if signal fails
      }
    }
  }

  kill(signal = "SIGTERM") {
    if (this.isPty && this.child && typeof this.child.kill === "function") {
      try {
        this.child.kill();
      } catch (e) {
        // ignore
      }
      return;
    }

    try {
      process.kill(-this.child.pid, signal);
    } catch (e) {
      // ignore
    }
  }
}

function spawn(shell, args = [], opts = {}) {
  // Normalize args when provided as options
  let spawnCmd = shell;
  let spawnArgs = args;

  // If spawn is called with shell as the command and args empty, allow the
  // user-provided options to override cwd/env.
  const spawnOpts = {
    cwd: opts.cwd || process.cwd(),
    env: { ...(opts.env || process.env) },
    shell: false,
  };

  // Extract cols and rows if provided
  const cols = opts.cols || 80;
  const rows = opts.rows || 30;

  // Ensure TERM is set so many programs behave correctly
  if (!spawnOpts.env.TERM) spawnOpts.env.TERM = "xterm-256color";

  // Set COLUMNS and LINES so programs can query terminal dimensions
  // Only set if not already provided in env
  if (!spawnOpts.env.COLUMNS) spawnOpts.env.COLUMNS = String(cols);
  if (!spawnOpts.env.LINES) spawnOpts.env.LINES = String(rows);

  // On Windows if shell is powershell/cmd, use it directly; otherwise use
  // the provided command.
  // Use stdio pipes so we can read/write programmatically.
  // On Unix shells, request an interactive shell if possible so the shell
  // reads from stdin even when not attached to a real TTY. This is not a
  // full PTY emulation, but works for many interactive uses (prompts,
  // basic shells).
  // If node-pty is available prefer a real PTY. We still keep the
  // child_process-based fallback for environments where building the
  // native addon failed or is undesirable. The `FORCE_PIPE_FALLBACK` flag
  // above allows forcing the pipe-based implementation even when node-pty
  // is present (useful for testing and iterative development of the
  // fallback terminal).
  if (!FORCE_PIPE_FALLBACK && nodePty) {
    try {
      // For common shells on unix, request an interactive shell flag so
      // the shell behaves like an interactive session.
      if (process.platform !== "win32") {
        const base = path.basename(spawnCmd);
        if (
          (base === "bash" || base === "sh" || base === "zsh") &&
          !spawnArgs.includes("-i")
        ) {
          spawnArgs = ["-i", ...spawnArgs];
        }
      }

      // Ensure the spawn environment has standard system PATH entries so
      // posix_spawnp can find /bin/sh, bash, zsh, etc. When Electron apps
      // are launched from the macOS GUI they often have a minimal PATH.
      try {
        const fs = require("fs");
        const defaultPaths = [
          "/usr/local/bin",
          "/usr/bin",
          "/bin",
          "/usr/sbin",
          "/sbin",
        ];
        const delim = path.delimiter || ":";
        const cur = String(spawnOpts.env.PATH || process.env.PATH || "");
        const parts = cur.split(delim).filter(Boolean);
        for (const p of defaultPaths)
          if (!parts.includes(p) && fs.existsSync(p)) parts.push(p);
        spawnOpts.env.PATH = parts.join(delim);
      } catch (ee) {
        // ignore PATH normalization failures
      }

      // Prefer an absolute shell path when possible to avoid posix_spawnp
      // failing due to a minimal PATH in GUI-launched Electron apps.
      try {
        if (process.platform !== "win32") {
          const isSimpleName =
            !path.isAbsolute(spawnCmd) && !spawnCmd.includes(path.sep);
          if (isSimpleName) {
            const fs = require("fs");
            const candidates = [];
            if (process.env.SHELL) candidates.push(process.env.SHELL);
            // Common system shells
            candidates.push(
              "/bin/zsh",
              "/bin/bash",
              "/bin/sh",
              "/usr/bin/zsh",
              "/usr/bin/bash",
              "/usr/bin/sh"
            );
            let found = null;
            for (const c of candidates) {
              try {
                if (c && fs.existsSync(c)) {
                  found = c;
                  break;
                }
              } catch (ee) {}
            }
            if (found) {
              console.info(
                "[terminal-backend] resolving shell name",
                spawnCmd,
                "->",
                found
              );
              spawnCmd = found;
            }
          }
        }
      } catch (e) {
        // ignore resolution failures
      }

      // Diagnostic: try executing the node-pty spawn-helper directly to
      // see whether it can be invoked from inside the packaged app. This
      // helps surface why the native pty fork (`posix_spawnp`) fails.
      try {
        const fs = require("fs");
        // Derive pkgDir similarly to the diagnostics above
        const resolved =
          loadedNodePtyPath ||
          (() => {
            try {
              return require.resolve("node-pty");
            } catch (e) {
              return null;
            }
          })();
        let pkgDir;
        try {
          if (resolved) {
            const st = fs.statSync(resolved);
            pkgDir = st.isDirectory() ? resolved : path.dirname(resolved);
          } else {
            pkgDir = loadedNodePtyPath || null;
          }
        } catch (ee) {
          pkgDir = resolved
            ? path.dirname(resolved)
            : loadedNodePtyPath || null;
        }
        if (pkgDir) {
          const helperRelease = path.join(
            String(pkgDir),
            "build",
            "Release",
            "spawn-helper"
          );
          const helperDebug = path.join(
            String(pkgDir),
            "build",
            "Debug",
            "spawn-helper"
          );
          const h = fs.existsSync(helperRelease)
            ? helperRelease
            : fs.existsSync(helperDebug)
            ? helperDebug
            : null;
          if (h) {
            try {
              const spawnSync = require("child_process").spawnSync;
              const check = spawnSync(
                h,
                [spawnOpts.cwd || process.cwd(), "/bin/echo", "ok"],
                {
                  encoding: "utf8",
                  timeout: 2000,
                }
              );
              console.info(
                "[terminal-backend] spawn-helper check:",
                h,
                "code:",
                check.status,
                "stdout:",
                (check.stdout || "").trim(),
                "stderr:",
                (check.stderr || "").trim()
              );
            } catch (ee) {
              console.warn(
                "[terminal-backend] spawn-helper check failed:",
                ee && ee.message ? ee.message : ee
              );
            }
          } else {
            console.info(
              "[terminal-backend] no spawn-helper found at expected locations"
            );
          }
        }
      } catch (diagErr) {
        // ignore diagnostics errors
      }

      const ptyProcess = nodePty.spawn(spawnCmd, spawnArgs, {
        name: spawnOpts.env.TERM || "xterm-256color",
        cols,
        rows,
        cwd: spawnOpts.cwd,
        env: spawnOpts.env,
      });

      // node-pty doesn't need the "kick" used for pipes; it behaves like a
      // proper terminal. Return a TerminalProcess wrapper that knows it's
      // a PTY.
      return new TerminalProcess(ptyProcess, true, cols, rows);
    } catch (e) {
      // If node-pty failed at runtime for any reason, emit a concise
      // diagnostic to help debugging and fall back to the pipe-based
      // approach below. Include any additional error properties (errno,
      // code) which the native addon may provide so we can see why
      // posix_spawnp failed in packaged environments.
      try {
        try {
          console.warn(
            "[terminal-backend] node-pty spawn() threw, falling back to pipes:",
            e && e.stack ? e.stack : e
          );
        } catch (logErr) {
          // best-effort logging
          console.warn(
            "[terminal-backend] node-pty spawn() threw (logging failed):",
            String(e)
          );
        }

        // Dump structured error properties if present
        try {
          const extra = {};
          if (e && typeof e === "object") {
            for (const k of Object.getOwnPropertyNames(e)) {
              try {
                extra[k] = e[k];
              } catch (ee) {
                extra[k] = String(ee);
              }
            }
          }
          console.warn(
            "[terminal-backend] node-pty error properties:",
            JSON.stringify(extra)
          );
        } catch (ee) {
          // ignore structured dump failures
        }

        if (loadedNodePtyPath) {
          console.warn(
            "[terminal-backend] node-pty was loaded from:",
            loadedNodePtyPath
          );
          try {
            const pkgDir = loadedNodePtyPath;
            const release = path.join(pkgDir, "build", "Release", "pty.node");
            const debug = path.join(pkgDir, "build", "Debug", "pty.node");
            const fs = require("fs");
            const rExists = fs.existsSync(release);
            const dExists = fs.existsSync(debug);
            console.warn(
              "[terminal-backend] native Release exists:",
              rExists,
              "Debug exists:",
              dExists
            );
          } catch (ee) {
            // ignore
          }
        }
      } catch (ee) {
        // ignore logging failures
      }
      // continue to pipe fallback
    }
  }

  if (process.platform !== "win32") {
    const base = path.basename(spawnCmd);
    if (
      (base === "bash" || base === "sh" || base === "zsh") &&
      !spawnArgs.includes("-i")
    ) {
      spawnArgs = ["-i", ...spawnArgs];
    }
  }

  const child = spawnChild(spawnCmd, spawnArgs, {
    cwd: spawnOpts.cwd,
    env: spawnOpts.env,
    stdio: ["pipe", "pipe", "pipe"],
    detached: true,
  });

  // Kick the shell so it prints an initial prompt even when it's not
  // connected to a real TTY. This helps the frontend show the prompt
  // immediately when the terminal modal opens.
  try {
    setTimeout(() => {
      if (child.stdin && !child.stdin.destroyed) child.stdin.write("\r");
    }, 50);
  } catch (e) {
    // ignore
  }

  return new TerminalProcess(child, false, cols, rows);
}

export default { spawn };
