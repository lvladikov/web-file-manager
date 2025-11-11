import { spawn as spawnChild } from "child_process";
import EventEmitter from "events";
import path from "path";
import { createRequire } from "module";

// Try to require node-pty if it's available. We use createRequire so this
// module stays ESM while still allowing a synchronous require attempt.
const require = createRequire(import.meta.url);
let nodePty = null;
try {
  // First try the normal resolution. This will succeed in dev or when the
  // native addon is available on Node's module paths.
  // eslint-disable-next-line import/no-extraneous-dependencies
  nodePty = require("node-pty");
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
      // If node-pty failed at runtime for any reason, fall back to the
      // pipe-based approach below.
      // console.warn("node-pty spawn failed, falling back to child_process", e);
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
