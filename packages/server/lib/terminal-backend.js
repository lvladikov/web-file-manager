import { spawn as spawnChild } from "child_process";
import EventEmitter from "events";
import path from "path";

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

  write(data) {
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
